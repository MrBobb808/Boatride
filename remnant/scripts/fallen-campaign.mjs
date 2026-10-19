import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const dist = resolve('dist'), errors = [];
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try {
    const file = resolve(dist, path);
    if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });
async function boot(context) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = true;
    s.level = 50;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  return page;
}
try {
 const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await boot(context);
 await page.evaluate(()=>{
  const {G}=window.__remnant;G.save.flags.ch5_done=true;G.save.level=100;for(const q of Object.values(G.save.quests))q.done=true;
  G.ui.dialogue=async()=>0;G.ui.lore=async()=>{};G.ui.itemGet=()=>{};G.ui.openMenu('chapters');
 });
 assert.equal(await page.locator('[data-k=ch_6]').count(),1);assert.equal(await page.locator('[data-k=ch_7]').count(),0);assert.equal(await page.locator('[data-k=ch_8]').count(),0);
 await page.locator('[data-k=ch_6]').click();
 await page.waitForFunction(()=>window.__remnant.G.save.flags.ch6_intro&&!window.__remnant.G.inCutscene&&!window.__remnant.G.world.transitioning,{timeout:30000});
 assert.equal(await page.evaluate(()=>window.__remnant.G.world.room.id),'hiddekel_camp');
 const chapterSix = await page.evaluate(() => {
  const {G}=window.__remnant,W=G.world;const rooms=['hiddekel_camp','ulai_marsh','shushan_road','shushan_gate','apadana','storm_ziggurat','high_places','prince_throne'];
  for(const room of rooms){W.load(room,'left');G.inCutscene=false;for(const e of W.ents)e.update(1/120);W.player.update(1/120);W.draw(G.renderer.wctx);
   const b=W.boss;if(b){b.awaken();for(let i=0;i<960;i++){G.save.hp=G.d.maxHp;W.player.state='free';W.player.invuln=999;b.update(1/120);}if(!Number.isFinite(b.x)||!Number.isFinite(b.y))throw Error('Chapter VI boss invalid position');b.draw(G.renderer.wctx);}
  }
  W.load('hiddekel_camp','altar');return {rooms:rooms.length,bosses:2};
 });
 // Continue through the actual VI ending, not a debug-only route into VII.
 await page.evaluate(()=>{const {G}=window.__remnant;G.save.flags.ch6_prince_done=true;G.world.load('hiddekel_camp','altar');});
 await page.waitForFunction(()=>document.querySelector('.chapter h2')?.textContent==='THE PRINCE OF PERSIA');
 await page.getByRole('button',{name:'Begin Chapter VII',exact:true}).click();
 await page.waitForFunction(()=>window.__remnant.G.save.flags.ch7_intro&&!window.__remnant.G.inCutscene&&!window.__remnant.G.world.transitioning);
 assert.equal(await page.evaluate(()=>window.__remnant.G.world.room.id),'thaw_outpost');
 assert.equal(await page.evaluate(()=>window.__remnant.fallenArt()),true);
 await page.screenshot({path:'qa/ch7-outpost-desktop.png'});
 await page.evaluate(()=>{window.__remnant.G.paused=true;});
 const huntWorld=await page.evaluate(async()=>{
  const {G}=window.__remnant,W=G.world,s=G.save;const check=(x,m)=>{if(!x)throw Error(m);};
  for(const [room,id,flag]of [['riftwood_trail','fang_warden','hunt_fang_warden'],['fang_pits','redmaw_alpha','hunt_redmaw_alpha']]){
   W.load(room,'left');const e=W.ents.find(e=>e.elite===id);check(e,'commander exists');e.takeHit({dmg:1e9,poise:99999,kx:0,ky:0,dir:1,kind:'ability',src:W.player,unblockable:true,guardBreak:true});check(s.flags[flag],'actual kill advances objective');
  }
  check(s.flags.ch7_boundary_open&&s.quests.m_crown7.stage===2,'hunt boundary open');
  W.load('moonlit_grove','left');const npc=W.ents.find(e=>e.kind==='barak');await W.story.talk(npc);check(!s.flags.ch7_rescued,'guards block rescue');
  for(const e of W.ents)if(e.isFoe)e.remove=true;await W.story.talk(npc);await W.story.readLore('hunt_plague');
  W.ents.find(e=>e.idKey==='hunt_grove_cache').interact();check(s.secrets.includes('hunt_grove_cache'),'cache saved');
  W.load('thaw_outpost','altar');const mara=W.ents.find(e=>e.kind==='mara');await W.story.talk(mara);await W.story.talk(mara);check(s.inventory.filter(i=>i.id==='grove_lantern').length===1&&s.quests.s_crown7.done,'optional reward once');
  W.load('hunt_throne','left');const hp=W.boss.maxHp;s.level=150;W.load('hunt_throne','left');check(W.boss.maxHp===hp,'fixed boss HP across levels');
  W.story.onTrigger('beast_monarch_start');return{commanders:2,rescue:!!s.flags.ch7_rescued,fixedHp:hp};
 });
 await page.waitForFunction(()=>window.__remnant.G.world.boss.state==='intro');
 const hunt=await page.evaluate(()=>{
  const {G}=window.__remnant,W=G.world,b=W.boss,p=W.player;const check=(x,m)=>{if(!x)throw Error(m);};
  b.update(1.8);G.save.hp=G.d.maxHp;p.x=b.x-60;p.y=b.floorY;p.face=1;p.state='free';p.invuln=0;p.parryT=1;
  const hp=G.save.hp;b.startAttack('claws');b.st=.76;b.think(0);check(G.save.hp===hp&&b.poise<b.maxPoise&&b.state==='idle','claws parry');p.parryT=0;
  const h={dmg:1e9,poise:0,kx:0,ky:0,dir:1,kind:'ability',src:p,dot:true};b.takeHit(h);check(!b.dying&&b.state==='transition','phase gate');b.update(1.5);check(b.phase===2&&b.addCount===2,'hunt pack');
  const empowered=b.dmg,kills=G.save.kills;for(const a of b.adds)a.takeHit({...h,dot:false});check(b.dmg<empowered&&G.save.kills===kills,'adds empower without farmable kill rewards');
  b.takeHit({...h,dot:false});b.update(1.5);check(b.phase===3&&b.attack==='hunt'&&b.ward,'final hunt');const health=b.hp;check(!b.takeHit(h)&&b.hp===health,'final mechanic cannot be skipped');
  const steps=new Set();for(let i=0;i<500&&b.ward;i++){b.update(1/120);steps.add(b.huntStep);p.x=b.targetX<W.grid.w*8?b.targetX+160:b.targetX-160;p.y=b.floorY;}
  check(!b.ward&&steps.has(0)&&steps.has(1)&&steps.has(2),'three pounces then recovery');b.x=700;p.x=470;p.update(1/60);G.camera.snapTo(600,300);
  return{parry:true,phases:3,pounces:3,pack:true};
 });
 await page.screenshot({path:'qa/ch7-varkhos-desktop.png'});
 await page.evaluate(()=>{const {G}=window.__remnant,b=G.world.boss;b.takeHit({dmg:1e9,poise:0,kx:0,ky:0,dir:1,kind:'melee',src:G.world.player});b.update(1.9);});
 await page.waitForFunction(()=>document.querySelector('.chapter h2')?.textContent==='THE CROWN OF THE HUNT');
 assert.deepEqual(await page.evaluate(()=>['fangbreak_greatsword','oath_of_the_pack'].map(id=>window.__remnant.G.save.inventory.filter(i=>i.id===id).length)),[1,1]);
 await page.screenshot({path:'qa/ch7-ending-desktop.png'});
 await page.getByRole('button',{name:'Begin Chapter VIII',exact:true}).click();
 await page.waitForFunction(()=>window.__remnant.G.world.room.id==='lantern_quarantine'&&window.__remnant.G.save.flags.ch8_intro&&!window.__remnant.G.inCutscene&&!window.__remnant.G.world.transitioning);
 const plagueWorld=await page.evaluate(async()=>{
  const {G}=window.__remnant,W=G.world,s=G.save;const check=(x,m)=>{if(!x)throw Error(m);};
  for(const [room,id]of [['greenfall_marsh','plague_source_a'],['sporeworks','plague_source_b']]){
   W.load(room,'left');const sh=W.ents.find(e=>e.grants===id);await W.story.shrine(sh);check(!s.flags[id],'guarded heart');for(const e of W.ents)if(e.isFoe)e.remove=true;await W.story.shrine(sh);check(sh.taken,'heart cleansed');
  }
  check(s.flags.ch8_boundary_open,'plague boundary open');W.load('silent_infirmary','left');for(const e of W.ents)if(e.isFoe)e.remove=true;await W.story.talk(W.ents.find(e=>e.kind==='ezra'));await W.story.readLore('plague_cinders');
  W.load('lantern_quarantine','altar');const mara=W.ents.find(e=>e.kind==='mara');await W.story.talk(mara);await W.story.talk(mara);check(s.quests.s_crown8.done&&s.inventory.filter(i=>i.id==='infirmary_lantern').length===1,'infirmary reward once');
  W.load('plague_throne','left');W.story.onTrigger('plague_monarch_start');return{hearts:2,rescue:!!s.flags.ch8_rescued};
 });
 await page.waitForFunction(()=>window.__remnant.G.world.boss.state==='intro');
 const plague=await page.evaluate(()=>{
  const {G}=window.__remnant,W=G.world,b=W.boss,p=W.player;const check=(x,m)=>{if(!x)throw Error(m);};b.update(1.8);G.save.hp=G.d.maxHp;p.state='free';p.invuln=0;p.y=b.floorY;
  b.startAttack('spores');p.x=b.spores[0].x;const hp=G.save.hp;b.think(.2);check(G.save.hp===hp,'spore tell safe');b.think(1);check(G.save.hp<hp,'spore zone hurts after tell');G.save.hp=G.d.maxHp;p.state='free';p.body.vx=p.body.vy=0;
  const h={dmg:1e9,poise:0,kx:0,ky:0,dir:1,kind:'ability',src:p,dot:true};b.takeHit(h);b.update(1.5);check(b.phase===2&&b.addCount===2,'two brood cocoons');b.takeHit({...h,dmg:10000});const injured=b.hp;b.think(.5);check(b.hp>injured,'cocoons heal queen');
  for(const a of b.adds)a.takeHit(h);const wounded=b.hp;b.think(.5);check(b.hp===wounded,'destroying cocoons stops healing');b.takeHit(h);b.update(1.5);check(b.phase===3&&b.attack==='purge'&&b.ward,'great miasma');
  const immune=b.hp;check(!b.takeHit(h)&&b.hp===immune,'miasma mechanic cannot be skipped');p.x=b.beaconX+130;G.save.hp=G.d.maxHp;const health=G.save.hp;b.update(.2);check(G.save.hp===health,'miasma tell safe');p.x=b.beaconX;b.update(1.5);check(G.save.hp===health,'gold beacon protects');
  p.x=b.beaconX+130;b.update(1.1);check(G.save.hp<health,'outside beacon takes damage');G.save.hp=G.d.maxHp;p.state='free';p.x=b.beaconX;b.update(3);check(!b.ward,'miasma recovery opening');p.update(1/60);G.camera.snapTo(600,300);
  return{sporeTell:true,cocoons:true,beacon:true,phases:3};
 });
 await page.screenshot({path:'qa/ch8-morvane-desktop.png'});
 await page.evaluate(()=>{const {G}=window.__remnant,b=G.world.boss;b.takeHit({dmg:1e9,poise:0,kx:0,ky:0,dir:1,kind:'melee',src:G.world.player});b.update(1.9);});
 await page.waitForFunction(()=>document.querySelector('.chapter h2')?.textContent==='THE CROWN OF PESTILENCE');
 assert.deepEqual(await page.evaluate(()=>['thorn_of_dawn','covenant_of_breath'].map(id=>window.__remnant.G.save.inventory.filter(i=>i.id===id).length)),[1,1]);
 await page.screenshot({path:'qa/ch8-ending-desktop.png'});
 await page.getByRole('button',{name:'Return to Quarantine',exact:true}).click();
 await page.waitForFunction(()=>window.__remnant.G.world.room.id==='lantern_quarantine'&&!window.__remnant.G.world.transitioning);
 const gauntlet=await page.evaluate(()=>{
  const {G}=window.__remnant,W=G.world,s=G.save;W.load('trial_arena','start');const R=W.story.ch3.rounds;R.start(7,true);R.beginRound();const seven=R.boss.key;R.start(8,true);R.beginRound();const eight=R.boss.key;
  const ids=['fangbreak_greatsword','oath_of_the_pack','thorn_of_dawn','covenant_of_breath'],before=ids.map(id=>s.inventory.filter(i=>i.id===id).length),b=R.boss;b.beginFight();b.phase=3;b.hp=1;b.takeHit({dmg:1e9,poise:0,kx:0,ky:0,dir:1,kind:'melee',src:W.player});b.update(1.9);const isolated=ids.every((id,i)=>s.inventory.filter(it=>it.id===id).length===before[i]);
  R.stop(false);delete s.flags.ch7_done;delete s.flags.ch8_done;R.start(7,true);R.beginRound();const classic=R.boss.key??'idol';R.stop(false);return{seven,eight,classic,isolated};
 });
 assert.deepEqual(gauntlet,{seven:'beast_monarch',eight:'plague_monarch',classic:'idol',isolated:true});
 const mobile=await browser.newContext({viewport:{width:932,height:430},isMobile:true,hasTouch:true,deviceScaleFactor:3}),phone=await boot(mobile);
 await phone.evaluate(()=>{const {G}=window.__remnant;G.save.flags.ch6_done=true;G.ui.dialogue=async()=>0;G.ui.openMenu('chapters');});
 await phone.locator('[data-k=ch_7]').tap();await phone.waitForFunction(()=>window.__remnant.G.save.flags.ch7_intro&&!window.__remnant.G.inCutscene&&!window.__remnant.G.world.transitioning);
 await phone.evaluate(()=>{const {G}=window.__remnant;G.save.flags.ch7_done=true;G.ui.openMenu('chapters');});await phone.locator('[data-k=ch_8]').tap();
 await phone.waitForFunction(()=>window.__remnant.G.save.flags.ch8_intro&&!window.__remnant.G.inCutscene&&!window.__remnant.G.world.transitioning);
 await phone.evaluate(()=>{const {G}=window.__remnant;G.paused=true;G.world.load('plague_throne','left');G.world.boss.beginFight();G.world.boss.phase=3;G.world.boss.x=520;G.world.boss.startAttack('purge');G.world.player.x=G.world.boss.beaconX;G.world.player.update(1/60);G.camera.snapTo(360,300);});
 await phone.screenshot({path:'qa/ch8-beacon-phone.png'});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:'VI→VII→VIII progression, commanders, seals, survivors, loot, bosses, beacons, gauntlet and touch entry',chapterSix,huntWorld,hunt,plagueWorld,plague,gauntlet}));
 await mobile.close();await context.close();
}finally{await browser.close();server.close();}
