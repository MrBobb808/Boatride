import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const dist=resolve('dist');
const server=createServer(async(req,res)=>{let p=new URL(req.url,'http://localhost').pathname.replace(/^\/Boatride\//,'');if(!p||p.endsWith('/'))p+='index.html';try{const f=resolve(dist,p);if(!f.startsWith(dist+'/'))throw Error('Path');res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png'})[extname(f)]??'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://localhost:'+server.address().port+'/Boatride/';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.PLAYWRIGHT_CHROMIUM_ARGS?JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS):[]});
await mkdir('qa',{recursive:true});
async function boot(context){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'?debug&autostart');await page.waitForFunction(()=>window.__remnant?.G.world?.player?.style);await page.evaluate(()=>{const s=window.__remnant.G.save;s.flags.intro_done=true;s.flags.relic_taken=true;s.flags.phantom=true;s.level=50;localStorage.setItem('remnant-save-2',JSON.stringify(s));});await page.goto(base+'?debug');await page.waitForFunction(()=>!!window.__remnant);await page.evaluate(()=>window.__remnant.load(2));await page.waitForFunction(()=>window.__remnant.G.world.player.style&&window.__remnant.hero().ready);return page;}
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await boot(context);
 assert.deepEqual(await page.evaluate(()=>window.__remnant.hero()),{ready:true,skin:'#70452f',hair:'#f1f3ed',beard:'#e9ede7'});
 await page.evaluate(()=>window.__remnant.G.ui.openMenu('character'));await page.locator('[data-k=elior_board]').click();
 assert.ok(await page.locator('img[alt^="Elior, a Black"]').evaluate(el=>el.complete&&el.naturalWidth>1000));
 await page.screenshot({path:'qa/elior-character-board.png'});await page.locator('[data-k=board_close]').click();await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__remnant.G.ui.openMenu('chapters'));await page.locator('[data-k=bt_1]').click();
 await page.waitForFunction(()=>window.__remnant.G.world.room.id==='trial_arena'&&window.__remnant.G.world.story.ch3.rounds.active&&!window.__remnant.G.world.transitioning);
 const result=await page.evaluate(()=>{const {G}=window.__remnant,W=G.world,R=W.story.ch3.rounds;G.paused=true;W.player.invuln=999;const before=JSON.stringify({defeated:G.save.defeated,quests:G.save.quests}),oldBoard=localStorage.getItem('remnant.board.v1'),out=[];
 const until=(fn,max=2400)=>{for(let i=0;i<max&&!fn();i++)W.update(1/120);if(!fn())throw Error('Boss lifecycle '+R.round+' '+W.boss?.state);};
 for(let n=1;n<=7;n++){until(()=>R.round===n&&W.boss?.phase===1&&W.boss.invuln===0);const b=W.boss;out.push({name:b.name,hp:b.maxHp,damage:b.dmg,tempo:b.encounterTempo});const add=W.spawnEnemy('husk',300,288);if(!add.remove||W.ents.includes(add))throw Error('Ordinary add');b.takeHit({dmg:b.maxHp+1,poise:0,kx:0,ky:0,dir:1,kind:'ability',dot:true});until(()=>R.completed===n);if(G.inCutscene||W.bossActive||W.boss)throw Error('Encounter not released');}
 const sameCampaign=before===JSON.stringify({defeated:G.save.defeated,quests:G.save.quests});R.stop();return {out,sameCampaign,sameSurvival:oldBoard===localStorage.getItem('remnant.board.v1'),board:JSON.parse(localStorage.getItem('remnant.boss-board.v1')),best:G.save.flags.boss_trial_best};});
 assert.equal(new Set(result.out.slice(0,6).map(b=>b.name)).size,6);assert.equal(result.out[0].name,result.out[6].name);
 for(let i=1;i<7;i++){assert.ok(result.out[i].hp>result.out[i-1].hp);assert.ok(result.out[i].damage>result.out[i-1].damage);assert.ok(result.out[i].tempo>=result.out[i-1].tempo);}
 assert.ok(result.sameCampaign&&result.sameSurvival);assert.equal(result.best,7);assert.equal(result.board[0].rounds,7);
 console.log('All six boss intros/deaths, repeat cycle, growing stats, suppressed adds, campaign isolation and separate board passed');
 await page.evaluate(()=>{const {G}=window.__remnant;G.paused=false;G.world.story.ch3.rounds.start(1,true);G.world.player.invuln=0;G.world.player.die();});
 await page.locator('[data-k=go_again]').waitFor();assert.ok(await page.getByText('BOSSES DEFEATED',{exact:true}).isVisible());await page.locator('[data-k=go_again]').click();
 await page.waitForFunction(()=>{const {G}=window.__remnant,R=G.world.story.ch3.rounds;return G.world.player.state!=='dead'&&R.active&&R.bossOnly&&R.from===1;});
 await page.evaluate(()=>window.__remnant.G.world.player.die());await page.locator('[data-k=go_leave]').waitFor();await page.locator('[data-k=go_leave]').click();
 await page.waitForFunction(()=>window.__remnant.G.world.room.id==='sanctuary'&&window.__remnant.G.world.player.state!=='dead');assert.ok(await page.evaluate(()=>!window.__remnant.G.world.story.ch3.rounds.active));
 console.log('Game Over, boss-mode retry and return to entry room passed');
 const combat=await page.evaluate(()=>{const a=window.__remnant,{G}=a,W=G.world,p=W.player,R=W.story.ch3.rounds;G.save.flags.trial_mode='survival';W.load('trial_arena','start');R.clearArena();R.start(1,false);R.stop(false);G.inCutscene=false;G.paused=true;W.ents=[];W.echoes=[];W.boss=null;W.bossActive=false;W.hitstopT=0;W.slowT=0;
 p.state='free';p.x=210;p.y=288;p.face=1;p.body.vx=p.body.vy=0;p.body.onGround=true;p.mantleT=20;p.mantleMax=20;p.styleKey='';p.refreshLook();const foe=a.spawn('brute',390,288);foe.maxHp=foe.hp=1000000;foe.aggro=false;p.startAttack(p.moves.combo[0]);const pursuit=p.x>390&&p.face===-1;p.state='free';p.atk=null;p.x=210;p.face=1;p.mantleBlinkCd=0;p.weaponCd=0;
 const hp=foe.hp,hearts=G.save.hearts??0,hits=p.comboHits,thrown=p.throwWeapon(),duplicate=p.throwWeapon();for(let i=0;i<120&&p.weaponFlight;i++)p.weaponFlight.update(1/120);
 const hit={damage:foe.hp<hp,teleported:p.x>foe.x,combo:p.atk?.id===p.moves.combo[1].id,hits:p.comboHits===hits+1,free:(G.save.hearts??0)===hearts,returned:p.weaponFlight===null};
 W.ents=[];p.state='free';p.x=210;p.y=288;p.face=1;p.weaponCd=0;p.throwWeapon();for(let i=0;i<240&&p.weaponFlight;i++)p.weaponFlight.update(1/120);const miss=p.x===210&&p.weaponFlight===null;
 for(let y=12;y<18;y++)W.grid.set(19,y,1);const behind=a.spawn('husk',350,288);behind.hp=behind.maxHp=1000000;p.state='free';p.face=1;p.weaponCd=0;const blockedBlink=!p.blinkToFoe(behind);p.startAttack(p.moves.combo[0]);const noWallPursuit=p.x===210;p.state='free';p.weaponCd=0;p.throwWeapon();for(let i=0;i<240&&p.weaponFlight;i++)p.weaponFlight.update(1/120);const noWallThrow=p.x===210&&behind.hp===behind.maxHp;for(let y=12;y<18;y++)W.grid.set(19,y,0);
 W.ents=[];p.state='free';p.x=210;p.face=1;p.mantleBlinkCd=1;const heavy=p.moves.heavy??p.moves.combo[2],b=p.attackBox(heavy),near=p.attackBox(p.moves.combo[0]);const far=a.spawn('husk',b.x+b.w-3,288);far.hp=far.maxHp=1000000;p.startAttack(heavy);p.activeHits(heavy,1);p.onSwing(heavy);return {pursuit,thrown,duplicate,hit,miss,blockedBlink,noWallPursuit,noWallThrow,reach:far.hp<far.maxHp&&b.w>near.w,noWaves:!W.ents.some(e=>e.constructor.name==='Proj'&&e.team==='player')};});
 assert.ok(combat.pursuit&&combat.thrown&&!combat.duplicate);for(const [k,v]of Object.entries(combat.hit))assert.ok(v,'Throw '+k);for(const k of ['miss','blockedBlink','noWallPursuit','noWallThrow','reach','noWaves'])assert.ok(combat[k],k);
 console.log('Pursuit, real throw-hit-blink-combo, cooldown, misses, walls, chain damage and no Mantle waves passed');
 await context.close();
 const phone=await browser.newContext({viewport:{width:874,height:402},isMobile:true,hasTouch:true,deviceScaleFactor:3}),mobile=await boot(phone);
 await mobile.evaluate(()=>{const {G}=window.__remnant;G.inCutscene=false;G.save.sub=null;G.world.player.state='free';G.world.player.mantleT=20;G.world.player.mantleMax=20;});await mobile.touchscreen.tap(440,180);
 const sub=mobile.locator('#touch .tc[aria-label="Throw weapon and blink"]');await sub.tap();await mobile.waitForFunction(()=>window.__remnant.G.world.player.weaponCd>0);assert.equal(await sub.getAttribute('aria-label'),'Throw weapon and blink');await mobile.screenshot({path:'qa/phone-throw-blink.png'});
 await mobile.evaluate(()=>{const {G}=window.__remnant,W=G.world;G.paused=true;G.save.flags.trial_mode='boss';W.player.mantleT=0;W.load('trial_arena','start');W.player.invuln=999;for(let i=0;i<1800&&!(W.boss?.phase===1&&W.boss.invuln===0);i++)W.update(1/120);document.querySelectorAll('.banner,.toast,.hint,.prompt').forEach(el=>el.remove());G.camera.snapTo(400,240);});await mobile.waitForTimeout(80);await mobile.screenshot({path:'qa/phone-boss-gauntlet.png'});
 assert.deepEqual(errors,[]);await phone.close();console.log('Phone touch throw without sub-weapon and boss HUD rendering passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}
