// Regress actual equipment pixels and the complete transformed appearance.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
const {base,close}=await serve();
const launch={headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})};
const browser=await chromium.launch(launch),page=await browser.newPage({viewport:{width:956,height:440},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('remnant-phaser.settings.v1',JSON.stringify({quality:'high',fps:'60',coach:false})));
const E=(f,a)=>page.evaluate(f,a),until=(f,a)=>page.waitForFunction(f,a,{timeout:25000});
try {
 await mkdir('qa',{recursive:true});await page.goto(base+'?debug&nostory&autostart&fresh');await until(()=>window.__remnant?.world?.player?.onGround);
 await E(()=>{const w=window.__remnant.world;w.loadRoom('sanctuary','start');for(const e of w.classic.ents)if(e.isFoe)e.remove=true;w.save.flags.relic_taken=true;w.player.grantInvuln(100);});await until(()=>window.__remnant.world.player.onGround);
 for(const[id,family]of[['ember_brand','blade'],['frostwake_spear','spear'],['stormcaller','greatsword']]) {
  await E(id=>{const w=window.__remnant.world;w.save.inventory.find(i=>i.uid===w.save.equipment.weapon).id=id;w.refreshStats();},id);
  await until(f=>window.__remnant.world.player.sprite.texture.key===`hero-equipped-${f}`,family);
  const pixels=await E(family=>{
   const game=window.__remnant.game,t=game.textures.get(`hero-equipped-${family}`),c=t.getSourceImage().getContext('2d');
   const ref=document.createElement('canvas');ref.width=ref.height=128;const r=ref.getContext('2d'),source=game.textures.get('elior').getSourceImage();
   return Array.from({length:16},(_,i)=>{const f=t.get(i);r.clearRect(0,0,128,128);r.imageSmoothingEnabled=false;r.drawImage(source,i%4*128,Math.floor(i/4)*128,128,128,36,43.5,56,56);
    const a=c.getImageData(f.cutX,f.cutY,128,128).data,b=r.getImageData(0,0,128,128).data;let extra=0,edge=0;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){const at=(y*128+x)*4;if(a[at+3]>100&&b[at+3]<50)extra++;if((x===0||y===0||x===127||y===127)&&a[at+3]>100)edge++;}return{frame:i,extra,edge};});
  },family);
  assert.ok(pixels.every(p=>p.extra>5),`${family}: visible weapon pixels in every illustrated pose: ${JSON.stringify(pixels)}`);
  assert.ok(pixels.every(p=>p.edge===0),`${family}: no clipped equipment at cell boundaries`);
  await page.keyboard.down('KeyD');await until(()=>{const p=window.__remnant.world.player;return p.body.velocity.x>40&&Number(p.sprite.frame.name)>=4&&Number(p.sprite.frame.name)<=7;});await page.keyboard.up('KeyD');
  await page.keyboard.down('Space');await until(()=>window.__remnant.world.player.body.velocity.y<0);await page.keyboard.up('Space');
  assert.ok(await E(f=>window.__remnant.world.player.sprite.texture.key===`hero-equipped-${f}`,family),'jump retains the current weapon');
  await until(()=>window.__remnant.world.player.onGround);await page.keyboard.down('KeyA');await until(()=>window.__remnant.world.player.sprite.flipX);await page.keyboard.up('KeyA');
  await page.keyboard.press('KeyJ');await until(f=>window.__remnant.world.player.sprite.texture.key===`action-elior-${f}`,family);
  assert.equal(await E(()=>window.__remnant.world.player.sprite.frame.width),128,'extended combat weapons have a larger margin');await until(()=>window.__remnant.world.player.state==='free');
 }
 console.log('Equipment: visible, unclipped weapons in all 16 body poses, running, jumping, facing and attacks');
 await E(()=>{const w=window.__remnant.world;w.save.level=25;w.save.mantle=100;w.refreshStats();});await page.keyboard.press('KeyG');await until(()=>window.__remnant.world.player.state==='transform');
 await until(()=>{const w=window.__remnant.world;return w.player.mantleT>0&&w.player.state==='free'&&w.player.sprite.texture.key==='hero-equipped-greatsword-mantle'&&w.visuals.smoke.getAliveParticleCount()>0;});
 await page.waitForTimeout(450);await page.screenshot({path:'qa/equipment-mantle.png'});
 assert.ok(await E(()=>window.__remnant.world.visuals.crown.commandBuffer.length>0),'form has its violet crown');
 await page.keyboard.press('KeyJ');await until(()=>window.__remnant.world.player.sprite.texture.key==='action-elior-greatsword-mantle');await until(()=>window.__remnant.world.player.state==='free');await page.keyboard.press('KeyN');
 await until(()=>window.__remnant.world.player.hero==='tirzah'&&window.__remnant.world.player.sprite.texture.key==='action-tirzah-bow-mantle');
 await page.keyboard.down('KeyJ');await until(()=>window.__remnant.world.player.bow.charge>0.6);await page.screenshot({path:'qa/equipment-tirzah-mantle.png'});await page.keyboard.up('KeyJ');
 await E(()=>window.__remnant.G.ui.openMenu('settings'));assert.ok(await E(()=>!window.__remnant.world.visuals.smoke.active),'smoke pauses with menus');
 await page.tap('[data-k="qlow"]');await page.tap('[data-k="rfon"]');await page.tap('[data-k="menu_resume"]');await until(()=>window.__remnant.world.visuals.tier===0&&window.__remnant.world.visuals.smoke.getAliveParticleCount()>0);await page.waitForTimeout(1200);
 assert.equal(await E(()=>window.__remnant.world.visuals.smokeFront.getAliveParticleCount()),0,'Low/Reduce flashes remove foreground haze');assert.ok(await E(()=>window.__remnant.world.player.sprite.texture.key.endsWith('-mantle')),'form remains identifiable');
 await E(()=>window.__remnant.world.player.die());await until(()=>!window.__remnant.world.visuals.light.visible&&window.__remnant.world.visuals.smoke.getAliveParticleCount()===0);
 await E(()=>window.__remnant.world.loadRoom('sanctuary','start'));await until(()=>window.__remnant.world.player.onGround);assert.equal(await E(()=>window.__remnant.world.visuals.smoke.getAliveParticleCount()),0,'room exit clears the form');
 assert.deepEqual(errors,[]);console.log('Mantle: G activation, violet body/weapon, smoke/crown, melee and tagged archer, pause, quality and death/room cleanup');
} finally {await browser.close();close();}
const fallback=await chromium.launch({...launch,args:['--disable-webgl']}),{base:canvasBase,close:closeCanvas}=await serve();
try {
 const p=await fallback.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(canvasBase+'?debug&nostory&autostart&fresh');await p.waitForFunction(()=>window.__remnant?.world?.player?.onGround);
 await p.evaluate(()=>window.__remnant.world.player.mantleT=5);await p.waitForFunction(()=>{const w=window.__remnant.world;return !w.visuals.gpu&&w.visuals.smoke.getAliveParticleCount()>0&&w.player.sprite.texture.key.endsWith('-mantle');});
 assert.deepEqual(errors,[]);console.log('Canvas fallback: equipped weapon, purple form and smoke; equipment visuals: all checks passed');
} finally {await fallback.close();closeCanvas();}
