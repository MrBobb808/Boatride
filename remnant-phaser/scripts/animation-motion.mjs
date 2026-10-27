// Exercise actual animation playback, not just the existence of a sprite sheet.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
const {base,close}=await serve();
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const errors=[];
try{
 await mkdir('qa',{recursive:true});
 for(const fps of [60,120]){
  const page=await browser.newPage({viewport:{width:956,height:440}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('remnant-phaser.settings.v1',JSON.stringify({fps:'auto',quality:'high',coach:false})));
  await page.goto(base+'?debug&nostory&autostart&fresh');await page.waitForFunction(()=>window.__remnant?.world?.player?.onGround);
  await page.evaluate(()=>window.__remnant.world.loadRoom('sanctuary','start'));
  await page.waitForFunction(()=>window.__remnant.world.player.onGround);
  await page.evaluate(fps=>{
   const {world:w,game}=window.__remnant;game.loop.stop();
   for(const e of w.classic.ents)if(e.isFoe)e.remove=true;
   const floor=w.gh-3;window.fixtureFeet=floor*16;
   for(let x=2;x<w.gw-2;x++){for(let y=3;y<floor;y++){w.setTile(x,y,0);w.classic.grid.set(x,y,0);}w.setTile(x,floor,1);w.classic.grid.set(x,floor,1);}
   w.save.flags.relic_taken=true;w.player.grantInvuln(100);let now=game.loop.time;
   window.stepFrames=n=>{const frames=[];for(let i=0;i<n;i++){game.step(now+=1000/fps,1000/fps);const p=w.player;frames.push({x:p.x,feet:p.feet,y:p.sprite.y,frame:String(p.sprite.frame.name),key:p.sprite.texture.key,state:p.state,stride:p.stride});}return frames;};
  },fps);
  for(const hero of ['elior','tirzah']){
   await page.evaluate(hero=>{const w=window.__remnant.world;w.save.playableHero=hero;w.player.placeAt(180,window.fixtureFeet,1);window.stepFrames(12);},hero);
   await page.keyboard.down('KeyD');const run=await page.evaluate(fps=>window.stepFrames(fps),fps);await page.keyboard.up('KeyD');
   assert.ok(new Set(run.filter(f=>f.frame.startsWith('run:')).map(f=>f.frame)).size>=12,`${hero} ${fps}Hz: articulated stride advances`);
   assert.ok(run.every(f=>Math.abs(f.y-f.feet)<=.51),`the sprite foot origin follows the physical body: ${JSON.stringify(run.filter(f=>Math.abs(f.y-f.feet)>.51).slice(0,3))}`);
   assert.equal(new Set(run.map(f=>f.key)).size,1,'movement retains the same illustrated rig');
   await page.evaluate(fps=>window.stepFrames(fps/2),fps);
   const still=await page.evaluate(fps=>window.stepFrames(fps/2),fps);
   assert.ok(still.slice(-10).every(f=>f.frame.startsWith('idle:')),'stopping returns to idle');
   assert.ok(Math.abs(still.at(-1).stride-still[0].stride)<.001,'idle never advances the footsteps');
   await page.keyboard.down('Space');await page.evaluate(()=>window.stepFrames(8));await page.keyboard.up('Space');
   const jump=await page.evaluate(fps=>window.stepFrames(fps*1.4),fps);
   assert.ok(jump.some(f=>f.frame.startsWith('jump:'))&&jump.some(f=>f.frame.startsWith('fall:'))&&jump.some(f=>f.frame.startsWith('land:')),`${hero}: rise, fall and landing recovery`);
   await page.keyboard.press('KeyL');const roll=await page.evaluate(fps=>window.stepFrames(fps*.5),fps);
   assert.ok(new Set(roll.filter(f=>f.frame.startsWith('roll:')).map(f=>f.frame)).size>=10,`${hero}: full dodge cycle`);
   await page.keyboard.down('KeyI');const guard=await page.evaluate(fps=>window.stepFrames(fps*.7),fps);await page.keyboard.up('KeyI');await page.evaluate(()=>window.stepFrames(3));
   assert.ok(guard.some(f=>f.frame.startsWith('parry:'))&&guard.some(f=>f.frame.startsWith('block:')),'parry transitions to a held guard');
   if(hero==='tirzah'){
    await page.keyboard.down('KeyK');await page.evaluate(fps=>window.stepFrames(Math.ceil(fps*.6)),fps);
    assert.equal(await page.evaluate(()=>window.__remnant.world.player.sprite.frame.name),'bowDraw:15','full draw matches charged-shot readiness');
    await page.keyboard.up('KeyK');const released=await page.evaluate(fps=>window.stepFrames(Math.ceil(fps*.4)),fps);
    assert.ok(released.some(f=>f.frame.startsWith('bowRelease:'))&&released.at(-1).state==='free','release recoils and returns to movement');
   }
   console.log(`${fps} Hz ${hero}: stride, fixed feet, idle, jump/land, dodge, parry/guard and bow timing`);
  }
  const clocks=await page.evaluate(()=>{
   const {world:w,G}=window.__remnant,p=w.player;p.state='cast';p.st=0;G.time=53.17;p.draw(0);const a=p.sprite.frame.name;
   G.time=98.42;p.st=0;p.draw(0);const b=p.sprite.frame.name;p.st=.15;p.draw(0);const mid=p.sprite.frame.name;
   p.powers.playClip('b1',2);p.powers.update(.1);const first=p.powers.clipProgress;p.powers.playClip('b1',2);const reset=p.powers.clipProgress;
   p.releaseState();return{a,b,mid,first,reset};
  });
  assert.equal(clocks.a,clocks.b,'one-shot poses do not depend on world time');assert.notEqual(clocks.a,clocks.mid);assert.equal(clocks.first,.2);assert.equal(clocks.reset,0,'a repeated finisher clip restarts');
  await page.evaluate(()=>window.__remnant.G.ui.openMenu('settings'));
  const paused=await page.evaluate(fps=>window.stepFrames(fps),fps);assert.equal(new Set(paused.map(f=>f.frame)).size,1,'menus freeze character animation');
  await page.close();
 }
 const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'?debug&nostory&autostart&fresh');await p.waitForFunction(()=>window.__remnant?.world?.player?.onGround);
 const review=await p.evaluate(()=>{
  const tm=window.__remnant.game.textures,canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;const c=canvas.getContext('2d');c.fillStyle='#1c2430';c.fillRect(0,0,960,640);c.imageSmoothingEnabled=false;
  const rows=[['action-elior-blade','run'],['action-elior-blade','b1'],['action-tirzah-bow','run'],['action-tirzah-bow','bowDraw']],unique=[];
  rows.forEach(([key,clip],r)=>{const t=tm.get(key),seen=new Set();for(let i=0;i<16;i++){const f=t.get(clip+':'+i),d=t.getSourceImage().getContext('2d').getImageData(f.cutX,f.cutY,f.cutWidth,f.cutHeight).data;let hash=2166136261;for(const v of d)hash=Math.imul(hash^v,16777619);seen.add(hash);if(i%2===0)c.drawImage(t.getSourceImage(),f.cutX,f.cutY,f.cutWidth,f.cutHeight,i/2*120+(f.x-65)*2,r*160+(f.y-52)*2,f.cutWidth*2,f.cutHeight*2);}unique.push(seen.size);});
  return{png:canvas.toDataURL().split(',')[1],unique};
 });
 assert.ok(review.unique.every(n=>n>=14),'cycles contain distinct rendered poses, not aliases of repeated stills');
 await writeFile('qa/animation-motion.png',Buffer.from(review.png,'base64'));await p.close();assert.deepEqual(errors,[]);
 console.log('Animation motion: all checks passed');
}finally{await browser.close();close();}
