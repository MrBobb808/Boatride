import { G, flag, setFlag } from './ctx';
import type { Story, QuestDef } from './story';
import type { Npc, Shrine } from './props';
import type { Enemy } from './enemies';
import type { BossBase } from './bosses2';
import { FALLEN_CHAPTERS, chapterForRoom, fallenObjective, type FallenChapter } from './fallenChapters';
import { chapterCurve } from './curve';
import { makeItem, addMaterial, derive } from './state';
import { registerGuide } from './guide';
import { music } from '../audio/music';
import { fx } from '../render/fx';
export const FALLEN_QUESTS:QuestDef[]=FALLEN_CHAPTERS.flatMap(c=>[
  {id:`m_crown${c.n}`,title:c.title,kind:'main' as const,stages:[c.intro[1],`One objective remains. ${c.intro[1]}`,`The boundary is open. Rest at the ridge altar, then confront ${c.name}.`],done:`${c.name} has fallen. The road belongs to the living again.`},
  {id:`s_crown${c.n}`,title:c.words?c.words.sideQuest:c.n===9?'Hands That Build':c.n===7?'Those Who Would Not Run':'The Last Clean Breath',kind:'side' as const,stages:[`Find the survivors in ${c.words?c.words.sidePlace:c.n===9?'the Last Smithy above the Bellows Foundry':c.n===7?'the Unhunted Grove above the Fang Pits':'the Silent Infirmary above the Sporeworks'}. Clear their guards, speak to ${c.n===10?'Hanan':c.n===9?'Talia':c.n===7?'Barak':'Ezra'}, and bring the record there to Mara.`],done:'The survivors are safe and Mara has the warning of the next Fallen Crown.'},
]);
registerGuide(()=>{
  if(!G.save)return null;
  for(const c of FALLEN_CHAPTERS){
    if(G.save.quests[`m_crown${c.n}`]&&!G.save.quests[`m_crown${c.n}`].done){const o=c.objectives.find(o=>!flag(o.flag));return o?{room:o.room,at:(c.n===7?'enemy:':'shrine:')+o.id,label:o.name}:{room:c.arena,at:'trigger:'+c.boss+'_start',label:c.name+' beyond the boundary'};}
    if(flag(`ch${c.n-1}_done`)&&!flag(`ch${c.n}_intro`))return{room:FALLEN_CHAPTERS.find(p=>p.n===c.n-1)?.hub??'hiddekel_camp',label:`an altar: choose Journey on to Chapter ${c.roman}`};
  }return null;
});
export class FallenStory {
  private epoch=0;private completing=false;private ownsCine=false;
  constructor(private st:Story){}
  begin(n:number){const c=FALLEN_CHAPTERS.find(c=>c.n===n);if(c)return G.world.transition(c.hub,'start');}
  private current(token:number){if(token===this.epoch)return true;if(!this.ownsCine)this.st.cine(false);return false;}
  private cine(on:boolean){this.ownsCine=on;this.st.cine(on);}
  onEnter(id:string,first:boolean){
    this.epoch++;this.completing=false;if(this.ownsCine)this.cine(false);
    const c=chapterForRoom(id);if(!c)return false;
    this.refresh(c);if(!flag(`ch${c.n}_intro`)){void this.opening(c);return true;}
    if(first)G.ui.banner(G.world.room.name.toUpperCase(),`Chapter ${c.roman} · ${c.title}`,'area');
    if(id===c.arena&&G.save.defeated.includes(c.boss)&&!flag(`ch${c.n}_done`))void this.complete(c);
    return true;
  }
  private refresh(c:FallenChapter){if(c.objectives.every(o=>flag(o.flag)))setFlag(`ch${c.n}_boundary_open`);}
  private async opening(c:FallenChapter){
    const token=this.epoch,s=G.save;setFlag(`ch${c.n}_intro`);if(!s.altarsLit.includes(c.hub))s.altarsLit.push(c.hub);s.altar={room:c.hub,spawn:'altar'};
    this.st.quest(`m_crown${c.n}`,c.objectives.filter(o=>flag(o.flag)).length);this.st.quest(`s_crown${c.n}`,0);G.world.autosave(true);this.cine(true);G.ui.banner('CHAPTER '+c.roman,c.title,'chapter');
    const choice=await this.st.say([{who:'narrator',text:c.intro[0]},{who:'mara',text:c.intro[1]},{who:'azriel',text:c.intro[2]},{who:'elior',text:'We bring them home.',choices:[{label:'The survivors come first.'},{label:'Tell me how to break the crown.'}]}]);
    if(!this.current(token))return;s.choices[`crown${c.n}`]=choice===0?'mercy':'resolve';
    await this.st.say([{who:'azriel',text:c.tips},{who:'tobiah',text:'I will keep the road behind you. No one gets left on it.'}]);if(!this.current(token))return;this.cine(false);G.world.autosave(true);
  }
  onKill(e:Enemy){const c=chapterForRoom(G.world.room.id);if(!c||c.n!==7)return;const o=c.objectives.find(o=>o.id===e.elite);if(o)this.objective(c,o.id);}
  private objective(c:FallenChapter,id:string){
    const o=c.objectives.find(o=>o.id===id);if(!o||flag(o.flag))return;setFlag(o.flag);this.refresh(c);const count=c.objectives.filter(o=>flag(o.flag)).length;
    this.st.quest(`m_crown${c.n}`,count);G.ui.banner(o.name.toUpperCase(),count===2?'The boundary is broken · the throne road is open':`${count}/2 objectives complete`,'ability');addMaterial(G.save,'radiant_core',2);G.world.autosave(true);
  }
  shrine(sh:Shrine){
    const c=chapterForRoom(G.world.room.id),o=fallenObjective(sh.grants);if(!c||!o)return false;
    if(G.world.foes().some(e=>!e.remove&&!e.dying&&Math.hypot(e.x-sh.x,e.y-sh.y)<190)){G.ui.toast(c.words?c.words.guardWarn:c.n===9?'Clear the nearby guards before releasing the pressure wheel.':'Clear the nearby guards before cleansing the Spore Heart.','warn');return true;}
    this.objective(c,o.id);fx.holyBurst(sh.x,sh.y-20,16,1);return true;
  }
  onTrigger(id:string){
    const c=chapterForRoom(G.world.room.id);if(!c)return false;
    if(id===`ch${c.n}_gate`){if(!flag(`ch${c.n}_boundary_open`))G.ui.toast(`${c.objectives.filter(o=>flag(o.flag)).length}/2 objectives complete. The boundary is still sealed.`,'warn');return true;}
    if(id===c.boss+'_start'){if(!G.save.defeated.includes(c.boss)&&!G.world.bossActive)void this.bossStart(c);return true;}return false;
  }
  private async bossStart(c:FallenChapter){
    this.refresh(c);if(!flag(`ch${c.n}_boundary_open`)){G.ui.toast('Complete both objectives before entering the throne.','warn');return;}
    const W=G.world,b=W.boss as BossBase|null,token=this.epoch;if(!b||b.key!==c.boss||b.state!=='dormant')return;
    W.bossActive=true;W.closeGate(true);W.player.body.vx=0;this.cine(true);G.camera.focus={x:b.x-90,y:b.y-65};G.camera.viewMultTarget=1.2;
    await this.st.say(c.challenge.map((text,i)=>({who:i%2?'elior':c.name,text})));if(!this.current(token)||W.boss!==b)return;this.ownsCine=false;b.awaken();
  }
  bossDefeated(b:BossBase){const c=FALLEN_CHAPTERS.find(c=>c.boss===b.key);if(c)return this.complete(c);}
  private async complete(c:FallenChapter){
    if(this.completing||flag(`ch${c.n}_done`))return;this.completing=true;const W=G.world,s=G.save,token=this.epoch;
    this.cine(true);W.bossActive=false;W.closeGate(false);G.ui.bossBar(null);music.play('victory');
    // Commit rewards and progress before any awaited dialogue. Reloads cannot duplicate them.
    if(!flag(`ch${c.n}_rewarded`)){setFlag(`ch${c.n}_rewarded`);for(const id of c.rewards)if(!s.inventory.some(i=>i.id===id)){const it=makeItem(id);s.inventory.push(it);G.ui.itemGet(it);}s.silver+=(c.n-4)*1000;addMaterial(s,'radiant_core',c.n);addMaterial(s,'covenant_fragment',c.n+1);W.giveXp(chapterCurve(c.n).clearXp??10000);}
    if(!s.defeated.includes(c.boss))s.defeated.push(c.boss);this.st.quest(`m_crown${c.n}`,2,true);setFlag(`ch${c.n}_done`);G.d=derive(s);G.camera.focus=null;G.camera.viewMultTarget=1;W.autosave(true);
    await this.st.say(c.ending.map((text,i)=>({who:['narrator','elior','mara'][i],text})));if(!this.current(token))return;
    this.cine(false);const next=await G.ui.chapterEnd(c.n);if(!this.current(token))return;if(next==='next'&&FALLEN_CHAPTERS.some(n=>n.n===c.n+1))await this.begin(c.n+1);else await W.transition(c.hub,'altar');
  }
  async talk(n:Npc){
    const c=chapterForRoom(G.world.room.id);if(!c||n.kind==='dov'||n.kind==='ilan')return false;const s=G.save;
    if(n.kind===c.rescue&&G.world.room.id===c.side){
      if(G.world.foes().some(e=>!e.remove&&!e.dying&&Math.abs(e.x-n.x)<210)){await this.st.say([{who:n.kind,text:c.words?c.words.rescueBlock:c.n===9?'Clear the forge guards. Some of us cannot run on burned feet.':'Clear the beasts from the path before we move the children.'}]);return true;}
      setFlag(`ch${c.n}_rescued`);s.balm=s.balmMax;G.world.autosave(true);const token=this.epoch;
      await this.st.say([{who:n.kind,text:c.words?c.words.rescueThanks:c.n===9?'We made hinges, ploughs, cradles. He made us forge chains. We kept one workshop free. Take our testament to Mara; we will build for the living again.':'We stopped running when the smallest child could not keep up. We were not leaving her. Now we can all walk back together.'}]);if(token===this.epoch)n.remove=true;return true;
    }
    if(n.kind==='mara'&&s.lore.includes(c.record)&&flag(`ch${c.n}_rescued`)&&!s.quests[`s_crown${c.n}`]?.done){
      this.st.quest(`s_crown${c.n}`,0,true);if(!s.inventory.some(i=>i.id===c.optional)){const it=makeItem(c.optional);s.inventory.push(it);G.ui.itemGet(it);}G.world.giveXp(2500);G.world.autosave(true);
      await this.st.say([{who:'mara',text:c.words?c.words.maraReward:c.n===9?'The smiths chose to build again. Keep their lantern; what survives the fire can still give light.':c.n===7?'Morvane. That green dust is a road for her swarm. Keep this grove lantern close.':'Azkar. His furnaces lie beyond the marsh. For now, you have given the living clean air and time.'}]);return true;
    }
    const done=flag(`ch${c.n}_done`)?1:0;
    if(n.kind==='tobiah'||n.kind===c.rescue){await this.st.say([{who:n.kind,text:(n.kind==='tobiah'?c.voices.tobiah:c.voices.rescued)[done]}]);return true;}
    await this.st.say([{who:n.kind,text:n.kind==='azriel'?c.tips:n.kind==='mara'?`Bring me the record from the ${c.words?c.words.recordPlace:c.n===9?'smithy':c.n===7?'grove':'infirmary'}, and make sure its survivors reach the outpost.`:flag(`ch${c.n}_done`)?'The road is ours again. Rest before the next journey.':'I will keep the watchfire burning until you return.'}]);return true;
  }
  secret(id:string){const c=FALLEN_CHAPTERS.find(c=>c.caches.includes(id));if(!c)return false;if(!G.save.secrets.includes(id)){G.save.secrets.push(id);G.ui.toast(`Cache found (${c.caches.filter(k=>G.save.secrets.includes(k)).length}/3)`,'good');}return true;}
}
