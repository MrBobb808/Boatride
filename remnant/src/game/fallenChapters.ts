// Original fiction: each Fallen Crown commands a distinct domain.
import { MapBuilder, type RoomDef, type EntDef, type EnemyKind, type NpcKind } from './tiles';
export interface FallenChapter {
  n: 7 | 8; roman: string; title: string; name: string; boss: 'beast_monarch' | 'plague_monarch'; biome: 'hunt' | 'plague';
  hub: string; trail: string; depths: string; side: string; ridge: string; arena: string; rescue: NpcKind;
  objectives: {id: string; flag: string; room: string; name: string}[];
  rewards: string[]; optional: string; caches: string[]; record: string; intro: string[]; challenge: string[]; ending: string[]; tips: string;
}
export const FALLEN_CHAPTERS: FallenChapter[] = [
  { n:7, roman:'VII', title:'The Crown of the Hunt', name:'Varkhos', boss:'beast_monarch', biome:'hunt', hub:'thaw_outpost', trail:'riftwood_trail', depths:'fang_pits', side:'moonlit_grove', ridge:'claw_ridge', arena:'hunt_throne', rescue:'barak',
    objectives:[{id:'fang_warden',flag:'hunt_fang_warden',room:'riftwood_trail',name:'Fang Warden'},{id:'redmaw_alpha',flag:'hunt_redmaw_alpha',room:'fang_pits',name:'Redmaw Alpha'}],
    rewards:['fangbreak_greatsword','oath_of_the_pack'], optional:'grove_lantern', caches:['hunt_trail_cache','hunt_grove_cache','hunt_ridge_cache'], record:'hunt_plague',
    intro:['The thaw reveals no spring. Claw marks score the trees higher than a man. Hunting horns answer through the mist.', 'Varkhos calls pursuit the only honest law. His Fang Warden and Redmaw Alpha bind the boundary to his throne. Defeat both and the road will open.', 'Barak sheltered survivors in the grove above the Fang Pits. Find them before the packs do. No one here belongs to the hunt.'],
    challenge:['You broke the princes’ hold. Good. Prey that stands its ground makes a better chase.', 'Your commanders are beaten. Your boundary is broken. These people are going home.', 'Tell me, keeper of echoes: which of them will you abandon when you tire?', 'They stand with me by mercy. They are not a pack I own.', 'Understanding comes after the running.'],
    ending:['The antler crown breaks against its own throne. The horns fall silent. Somewhere in the woods, a small creature moves without being chased.', 'Open the road. Bring the survivors home.', 'Green dust drifts from the north. Morvane, Crown of Pestilence, is stirring. The next army will not arrive on feet.'],
    tips:'Parry the claws. Dodge out of amber landing marks. Cut down his Hunt Shades: each strengthens his attacks. During the Great Hunt, evade three pounces, then punish the recovery.',
  },
  { n:8, roman:'VIII', title:'The Crown of Pestilence', name:'Morvane', boss:'plague_monarch', biome:'plague', hub:'lantern_quarantine', trail:'greenfall_marsh', depths:'sporeworks', side:'silent_infirmary', ridge:'pestilent_causeway', arena:'plague_throne', rescue:'ezra',
    objectives:[{id:'plague_source_a',flag:'plague_source_a',room:'greenfall_marsh',name:'Marsh Spore Heart'},{id:'plague_source_b',flag:'plague_source_b',room:'sporeworks',name:'Foundry Spore Heart'}],
    rewards:['thorn_of_dawn','covenant_of_breath'], optional:'infirmary_lantern', caches:['plague_marsh_cache','plague_infirmary_cache','plague_causeway_cache'], record:'plague_cinders',
    intro:['Every leaf wears the same green dust. Lanterns burn beside sealed doors. From the north comes the sound of rain, though the sky is clear.', 'Morvane commands pestilence and the living swarm. Two Spore Hearts feed the veil over her throne. Clear their guards, then cleanse both hearts.', 'Ezra kept an infirmary above the sporeworks. Find its survivors. When the queen calls the Great Miasma, gold light marks clean air.'],
    challenge:['Winter kept them still. The hunt kept them running. I can make them one.', 'You have turned their breath against them.', 'No hunger. No loneliness. One will, carried on a million wings.', 'A thousand voices are still worth hearing separately.', 'Then let us see how long your last breath lasts.'],
    ending:['The queen’s wings scatter into dust that no longer glows. Under the dead green crust, the first untouched leaf opens.', 'Unseal the doors. Let them breathe.', 'Ash lies beyond the marsh. Azkar, Crown of Cinders, has lit the furnaces. That road belongs to a future chapter.'],
    tips:'Move out of green spore zones before they bloom. Destroy Brood Cocoons to stop Morvane healing. During the Great Miasma, stand inside the active gold beacon; strike when the veil breaks.',
  },
];
export const chapterForRoom = (id: string) => FALLEN_CHAPTERS.find(c => [c.hub,c.trail,c.depths,c.side,c.ridge,c.arena].includes(id));
export const fallenObjective = (id: string) => FALLEN_CHAPTERS.flatMap(c => c.objectives).find(o => o.id === id);
const foe = (k: EnemyKind,x:number,y:number,elite?:string,ncond?:string):EntDef => ({t:'enemy',k,x,y,face:-1,elite,ncond});
function makeRooms(c:FallenChapter):RoomDef[] {
  const theme=c.biome, floor=24, width=104;
  const room=(id:string,name:string,w=width,f=floor,interior=false):RoomDef=>{
    const b=new MapBuilder(w,f+4).rect(0,f,w,4);if(interior)b.rect(0,0,w,2);
    return {id,name,region:c.title,biome:theme,music:theme,dark:interior?.36:.23,interior,weather:'motes',seed:c.n*100+id.length,map:{x:0,y:c.n*2},w,h:b.h,rows:b.rows(),spawns:{start:{x:6,y:f},left:{x:4,y:f},right:{x:w-4,y:f,face:-1}},exits:[],ents:[]};
  };
  const hub=room(c.hub,c.n===7?'Thawgate Outpost':'Lantern Quarantine',76,20);
  hub.spawns.altar={x:9,y:20};hub.rows=hub.rows.map((r,y)=>y<20?'##'+r.slice(2):r);
  hub.ents=[{t:'altar',id:c.hub,x:9,y:20},{t:'light',k:'brazier',x:15,y:20},{t:'light',k:'brazier',x:43,y:20},{t:'decor',k:'tent',x:19,y:20},{t:'decor',k:'cart',x:60,y:20},{t:'decor',k:'anvil',x:66,y:20},
    ...(['azriel','mara','tobiah','ilan','dov'] as NpcKind[]).map((k,i):EntDef=>({t:'npc',k,x:[25,32,43,56,66][i],y:20})),{t:'npc',k:c.rescue,x:49,y:20,cond:`ch${c.n}_rescued`},
    {t:'hint',id:`ch${c.n}_help`,x:18,w:25,text:c.intro[1]}];
  const trail=room(c.trail,c.n===7?'The Riftwood Trail':'Greenfall Marsh');
  const depths=room(c.depths,c.n===7?'The Fang Pits':'The Sporeworks',112,27,true);
  const side=room(c.side,c.n===7?'The Unhunted Grove':'The Silent Infirmary',68,24);
  const ridge=room(c.ridge,c.n===7?'Clawscar Ridge':'The Pestilent Causeway',110,25);
  const arena=room(c.arena,c.n===7?'The Throne of Fangs':'The Throne of the Swarm',80,23,true);
  const route=[hub,trail,depths,ridge,arena];
  let mapX=0;for(const r of route){r.map={x:mapX,y:c.n*2};mapX+=r.w/16+.3;}
  side.map={x:depths.map.x+2.5,y:c.n*2-2.2};
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],fa=a.h-4,fb=b.h-4;
    a.exits.push({x:a.w-1,y:fa-7,w:1,h:7,to:b.id,spawn:'left',cond:b===arena?`ch${c.n}_boundary_open`:undefined});
    b.exits.push({x:0,y:fb-7,w:1,h:7,to:a.id,spawn:'right'});
  }
  depths.exits.push({x:48,y:12,w:5,h:4,to:side.id,spawn:'left'});side.exits.push({x:0,y:17,w:1,h:7,to:depths.id,spawn:'side'});
  // Return below and beside the upper door so it cannot immediately re-enter.
  depths.spawns.side={x:42,y:19};
  const addPlatforms=(r:RoomDef,ps:number[][])=>{const b=new MapBuilder(r.w,r.h);b.g=r.rows.map(x=>x.split(''));for(const[x,y,w]of ps)b.plat(x,y,w);r.rows=b.rows();};
  addPlatforms(trail,[[18,19,11],[33,13,10],[43,18,11],[66,17,10]]);
  addPlatforms(depths,[[20,22,12],[34,19,11],[47,16,11],[63,21,10],[83,18,10]]);
  addPlatforms(side,[[17,19,12],[31,17,11],[45,12,10]]);addPlatforms(ridge,[[23,20,11],[40,19,12],[59,16,10],[72,12,10],[86,18,9]]);
  addPlatforms(arena,[[15,17,8],[54,17,8]]);
  for(const [i,r]of [trail,depths,ridge].entries()){
    const f=r.h-4;r.ents.push(...[18,47,79].map((x,j):EntDef=>({t:'decor',k:theme+'_tree',x,y:f,v:j})),foe(c.n===7?'hound':'drone',24,f),foe(c.n===7?'knight':'soldier',55,f),foe(c.n===7?'archer':'priest',78,f));
    if(i<2){const o=c.objectives[i];if(c.n===7)r.ents.push(foe(i?'lion':'knight',94,f,o.id,o.flag));else r.ents.push({t:'shrine',id:o.id,grants:o.id,x:97,y:f},foe('soldier',94,f));}
  }
  depths.spawns.altar={x:10,y:27};depths.ents.push({t:'altar',id:depths.id,x:10,y:27},{t:'light',k:'brazier',x:10,y:27});
  ridge.spawns.altar={x:9,y:25};ridge.ents.push({t:'altar',id:ridge.id,x:9,y:25},{t:'light',k:'brazier',x:9,y:25},{t:'decor',k:theme+'_gate',x:108,y:25},{t:'trigger',id:`ch${c.n}_gate`,x:98,y:18,w:8,h:7});
  side.ents.push(foe(c.n===7?'hound':'drone',24,24),foe(c.n===7?'lion':'soldier',49,24),{t:'npc',k:c.rescue,x:60,y:24,ncond:`ch${c.n}_rescued`},{t:'lore',id:c.record,x:48,y:12},{t:'decor',k:theme+'_tree',x:30,y:24});
  trail.ents.push({t:'chest',id:c.caches[0],secret:true,x:38,y:13,loot:[{item:c.n===7?'trailwarden_grips':'antidote_greaves',rarity:4},{silver:900}]});
  side.ents.push({t:'chest',id:c.caches[1],secret:true,x:51,y:12,loot:[{item:c.n===7?'moonpath_boots':'quarantine_mantle',rarity:4},{mat:'radiant_core',n:4}]});
  ridge.ents.push({t:'chest',id:c.caches[2],secret:true,x:76,y:12,loot:[{silver:1200},{mat:'covenant_fragment',n:6}]},{t:'hint',id:`ch${c.n}_boss_hint`,x:84,w:18,text:c.tips});
  arena.spawns.left=arena.spawns.altar={x:9,y:23};arena.rows=arena.rows.map((r,y)=>y>=3&&y<23?r.slice(0,3)+'G'+r.slice(4,78)+'##':r);
  arena.ents.push({t:'decor',k:theme+'_throne',x:59,y:23},{t:'light',k:'glow',x:49,y:14,r:150,c:theme==='hunt'?'#ffbd79':'#baed8c'},{t:'boss',k:c.boss,x:50,y:23},{t:'trigger',id:c.boss+'_start',x:23,y:14,w:10,h:9});
  return [hub,trail,depths,side,ridge,arena];
}
export const FALLEN_ROOMS=FALLEN_CHAPTERS.flatMap(makeRooms);

/** Shelter is reachable on foot, even at maximum gauntlet tempo, without a particular skill loadout. */
export function cleansingBeacon(playerX:number,bossX:number,width:number){
  const side=playerX<bossX?-1:1;return Math.max(160,Math.min(width-160,playerX+side*140));
}
