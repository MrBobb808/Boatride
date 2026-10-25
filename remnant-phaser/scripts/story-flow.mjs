// Narrative integration across the systems that change collision, unlock
// combat, purify allies, grant chapter rewards and resume a saved journey.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const p = await browser.newPage({ viewport: { width: 956, height: 440 } }); const errors=[];
p.on('pageerror',e=>errors.push(e.stack)); p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
const until = (fn,arg) => p.waitForFunction(fn,arg,{timeout:30000});
async function drain(done, max=60000) {
  const end=Date.now()+max;
  while(Date.now()<end) {
    if(errors.length)throw Error(errors.join('\n')); if(await p.evaluate(done))return;
    const choice=p.locator('.dialogue .choices button:visible');
    if(await choice.count())await choice.first().click();
    else if(await p.locator('.dialogue:visible').count())await p.keyboard.press('Enter');
    else if(await p.locator('.lore-card:visible button').count())await p.locator('.lore-card button').last().click();
    else if(await p.locator('.choice-card:visible button').count())await p.locator('.choice-card button').last().click();
    await p.waitForTimeout(200);
  }
  throw Error('Narrative stalled: '+await p.evaluate(()=>JSON.stringify({room:window.__remnant.world.room.id,cutscene:window.__remnant.G.inCutscene,player:window.__remnant.world.player.state,ui:document.getElementById('ui').innerText.slice(-600)})));
}
try {
  await p.goto(base+'?debug&nostory&autostart&fresh'); await until(()=>window.__remnant?.world?.player);
  await p.evaluate(()=>{const w=window.__remnant.world;w.save.flags.intro_done=true;w.save.flags.ending_done=true;w.persist();});
  await p.goto(base+'?debug&autostart');await until(()=>window.__remnant?.world?.player);
  await p.evaluate(()=>{const w=window.__remnant.world;w.loadRoom('temple_steps','start');w.player.placeAt(45*16, w.player.feet,1);void w.classic.story.collapse();});
  await drain(()=>window.__remnant.world.save.flags.collapsed&&!window.__remnant.G.inCutscene);
  await p.evaluate(()=>window.__remnant.world.loadRoom('temple_steps','start'));
  assert.ok(await p.evaluate(()=>!Array.from(window.__remnant.world.classic.grid.t).includes(9)),'collapsed floor stays removed after reload');
  console.log('Chapter I collapse: scripted walk, dialogue, native collision change and persistent broken floor');
  await p.evaluate(()=>{const w=window.__remnant.world;w.loadRoom('covenant_chamber','start');w.player.placeAt(30*16,w.player.feet,1);void w.classic.story.relic();});
  await drain(()=>window.__remnant.world.save.flags.relic_taken&&!window.__remnant.G.inCutscene&&window.__remnant.world.save.quests.m_dark?.stage===1);
  assert.ok(await p.evaluate(()=>window.__remnant.world.save.flags.phantom&&window.__remnant.world.save.abilities.includes('sword_word')));
  await p.evaluate(()=>{const w=window.__remnant.world,f=w.classic.ents.find(e=>e.elite==='chamber_sentinel');f.takeHit({dmg:1e8,poise:999,kx:0,ky:0,dir:1,kind:'ability',guardBreak:true,src:w.classic.player});w.player.placeAt(f.x-24,f.y,1);});
  await until(()=>window.__remnant.world.classic.ents.some(e=>e.elite==='chamber_sentinel'&&e.awaitingPurify));
  await p.keyboard.down('KeyF'); await until(()=>window.__remnant.G.inCutscene); await p.keyboard.up('KeyF');
  await drain(()=>window.__remnant.world.save.flags.has_echo&&!window.__remnant.G.inCutscene);
  assert.ok(await p.evaluate(()=>window.__remnant.world.save.echoes.length>0&&window.__remnant.world.classic.echoes.length>0));
  console.log('Relic and purification: scripture card, Phantom/ability unlock, actual hold-to-purify, shared Echo and chamber progress');
  for(let n=1;n<=10;n++) {
    await p.evaluate(n=>{window.cardResult=null;window.__remnant.G.ui.chapterEnd(n).then(v=>window.cardResult=v);},n);
    await p.waitForSelector('.chapter h2'); const time=await p.evaluate(()=>window.__remnant.G.time);await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>window.__remnant.G.time),time);
    await p.keyboard.press('Escape');await until(()=>window.cardResult==='stay');
  }
  console.log('All ten chapter-end screens show their shared chapter text and hold/resume the Phaser world');
  await p.evaluate(()=>{const w=window.__remnant.world;w.save.flags.ch7_intro=true;w.save.flags.ch6_done=true;w.loadRoom('hunt_throne','start');w.classic.onBossDefeated(w.classic.boss);});
  await drain(()=>window.__remnant.world.save.flags.ch7_done&&!window.__remnant.G.inCutscene&&!!document.querySelector('.chapter h2'));
  const reward=await p.evaluate(()=>({silver:window.__remnant.world.save.silver,inventory:window.__remnant.world.save.inventory.length}));
  await p.keyboard.press('Escape');await until(()=>window.__remnant.world.room.id==='thaw_outpost'&&!window.__remnant.world.transitioning);
  await p.evaluate(()=>window.__remnant.world.classic.onBossDefeated({key:'beast_monarch',hp:0,remove:true}));
  assert.deepEqual(await p.evaluate(()=>({silver:window.__remnant.world.save.silver,inventory:window.__remnant.world.save.inventory.length})),reward,'chapter rewards cannot be duplicated');
  await p.evaluate(()=>{const w=window.__remnant.world;w.save.flags.ch1_done=true;if(w.save.settlement)w.save.settlement.seen=0;w.loadRoom('remnant_rest','start');});
  const board=await p.evaluate(()=>{const w=window.__remnant.world,b=w.classic.ents.find(e=>e.prompt?.()==='Read the board');if(!b)return false;w.player.placeAt(b.x-16,b.y,1);return true;});assert.ok(board);
  await p.keyboard.press('KeyF');await p.waitForSelector('[data-k="rest_board"]');await p.keyboard.press('Escape');
  console.log('Crown ending: shared rewards are claimed once and return to the hub; Remnant’s Rest has its live quest board');
  await p.evaluate(()=>{const w=window.__remnant.world;w.persist();const key=Number(localStorage.getItem('remnant-phaser.active-slot')??0)===0?'remnant-phaser.save.v2':'remnant-phaser.save.slot'+localStorage.getItem('remnant-phaser.active-slot');const s=JSON.parse(localStorage.getItem(key));s.updated=Date.now()-2e6;localStorage.setItem(key,JSON.stringify(s));});
  await p.addInitScript(() => { if (!location.search.includes('resumecheck')) return; const slot=Number(localStorage.getItem('remnant-phaser.active-slot')??0), key=slot===0?'remnant-phaser.save.v2':'remnant-phaser.save.slot'+slot; const s=JSON.parse(localStorage.getItem(key));s.updated=Date.now()-2e6;localStorage.setItem(key,JSON.stringify(s)); });
  await p.goto(base+'?debug&autostart&resumecheck');await p.waitForSelector('.recap-card, .recap',{timeout:15000});await p.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('Resume: the Previously card uses the saved quest journal; phaser story flow: all checks passed');
} finally {await browser.close();close();}
