import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
const {base,close}=await serve();
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const page=await browser.newPage({viewport:{width:956,height:440},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const E=(f,a)=>page.evaluate(f,a),until=(f,a)=>page.waitForFunction(f,a,{timeout:20000});
async function target(distance=80){
 await E(distance=>{const w=window.__remnant.world;w.loadRoom('ashen_road','left');const open=(x,y)=>w.tileAt(Math.floor(x/16),Math.floor(y/16))===0;
 const f=w.classic.ents.find(e=>e.kind==='husk'&&open(e.x-22,e.y-2)&&open(e.x-22,e.y-24)&&!open(e.x-22,e.y+2));
 for(const e of w.classic.ents)if(e!==f)e.remove=true;
 f.hp=f.maxHp=1e7;f.executable=()=>false;f.think=function(){this.body.vx=0;};f.setState('idle','idle');window.target=f;
 const floor=Math.round(f.y/16);for(let x=Math.floor((f.x-distance-20)/16);x<=Math.ceil((f.x+20)/16);x++){for(let y=floor-4;y<floor;y++){w.setTile(x,y,0);w.classic.grid.set(x,y,0);}w.setTile(x,floor,1);w.classic.grid.set(x,floor,1);}
 w.save.ce=w.player.maxCe;w.player.placeAt(f.x-distance,f.y,1);w.player.hp=w.player.maxHp;
 },distance);
 await until(()=>window.__remnant.world.player.onGround&&window.__remnant.world.player.state==='free');
}
try{
 await mkdir('qa',{recursive:true});await page.goto(base+'?debug&nostory&autostart&fresh');await until(()=>window.__remnant?.world?.player?.onGround);
 await target(22);
 const initial=await E(()=>window.target.hp);
 await page.keyboard.press('KeyJ');await until(()=>window.target.hp<1e7);
 await until(()=>window.__remnant.world.player.sprite.texture.key.startsWith('action-elior'));
 assert.ok(await E(()=>window.__remnant.world.player.styleMeter.score>0),'landed melee earns style');
 await page.keyboard.down('Space');await until(()=>window.__remnant.world.player.body.velocity.y<0&&!window.__remnant.world.player.onGround);
 await page.keyboard.up('Space');
 assert.ok(await E(()=>window.__remnant.world.player.styleMeter.score>12),'confirmed hit jump-cancel extends the combo');
 console.log('Elior: animated attack atlas, real hit, style and Vanguard jump-cancel');
 await target(80);await page.keyboard.press('KeyN');await until(()=>window.__remnant.world.player.hero==='tirzah');
 const hp=await E(()=>window.target.hp);
 await page.keyboard.press('KeyJ');await until(hp=>window.target.hp<hp,hp);
 assert.ok(await E(()=>window.__remnant.world.player.sprite.texture.key.startsWith('action-tirzah')),'archer has her own sprite');
 await page.waitForTimeout(500);
 const energy=await E(()=>window.__remnant.world.save.ce);
 await page.keyboard.down('KeyK');await until(()=>window.__remnant.world.player.bow.charge>=0.65);
 await page.screenshot({path:'qa/action-tirzah.png'});
 await page.keyboard.up('KeyK');
 await until(()=>window.__remnant.world.player.bow.arrows.some(a=>a.move==='bow_pierce'));
 assert.ok(await E(e=>window.__remnant.world.save.ce<e-4,energy),'pierce spends Energy');
 await until(()=>window.__remnant.world.player.state==='free');
 await page.keyboard.down('ArrowUp');await page.keyboard.press('KeyJ');await page.keyboard.up('ArrowUp');
 await until(()=>window.__remnant.world.player.bow.volleyCd>0);
 assert.equal(await E(()=>window.__remnant.world.player.bow.arrows.filter(a=>a.move==='bow_volley').length),3,'spread emits three arrows');
 await until(()=>window.__remnant.world.player.state==='free');
 // A real closed terrain cell blocks ranged attacks.
 await E(()=>{const w=window.__remnant.world,p=w.player,f=window.target;p.placeAt(f.x-80,f.y,1);window.wallX=Math.floor((p.x+32)/16);window.wallY=Math.floor(p.y/16);w.setTile(window.wallX,window.wallY,1);w.setTile(window.wallX,window.wallY-1,1);for(const a of p.bow.arrows)a.life=0;f.invuln=0;window.wallHp=f.hp;});
 await page.keyboard.press('KeyJ');await page.waitForTimeout(700);
 assert.equal(await E(()=>window.target.hp),await E(()=>window.wallHp),'arrows do not pass through walls');
 await E(()=>{const w=window.__remnant.world;w.setTile(window.wallX,window.wallY,0);w.setTile(window.wallX,window.wallY-1,0);w.player.hp-=7;window.tagHp=w.player.hp;w.persist();});
 await until(()=>window.__remnant.world.player.state==='free');
 await page.keyboard.press('KeyB');assert.equal(await E(()=>window.__remnant.world.player.combatStyle),'wraith');
 await page.keyboard.press('KeyB');assert.equal(await E(()=>window.__remnant.world.player.combatStyle),'sentinel');
 const tagHp=await E(()=>{window.__remnant.world.persist();return window.__remnant.world.player.hp;});await page.goto(base+'?debug&nostory&autostart');await until(()=>window.__remnant?.world?.player);
 assert.equal(await E(()=>window.__remnant.world.player.hero),'tirzah');assert.equal(await E(()=>window.__remnant.world.player.combatStyle),'sentinel');
 assert.equal(await E(()=>window.__remnant.world.player.hp),tagHp,'saved health is not refilled');
 // Phone: a paired tap changes hero and never starts the movement stick.
 await until(()=>window.__remnant.world.player.onGround);
 const tap=await E(()=>{const h=window.__remnant.game.scene.getScene('hud'),b=h.children.getByName('hero_swap').getBounds();return{x:b.centerX/window.devicePixelRatio,y:b.centerY/window.devicePixelRatio};});
 await page.touchscreen.tap(tap.x,tap.y);await until(()=>window.__remnant.world.player.hero==='elior');
 assert.equal(await E(()=>window.__remnant.world.player.hp),tagHp,'tagging does not heal');
 assert.equal(await E(()=>window.__remnant.game.scene.getScene('hud').stick.id),-1);
 const kit=await E(()=>{const h=window.__remnant.game.scene.getScene('hud'),b=h.children.getByName('style_cycle').getBounds();return{x:b.centerX/window.devicePixelRatio,y:b.centerY/window.devicePixelRatio};});
 await page.touchscreen.tap(kit.x,kit.y);await until(()=>window.__remnant.game.scene.getScene('hud').wheelOpen);
 const option=await E(()=>{const h=window.__remnant.game.scene.getScene('hud'),t=h.wheelItems.find(i=>i.label==='Vanguard').t;return{x:t.x/window.devicePixelRatio,y:t.y/window.devicePixelRatio};});
 await page.touchscreen.tap(option.x,option.y);await until(()=>window.__remnant.world.player.combatStyle==='vanguard'&&!window.__remnant.game.scene.getScene('hud').wheelOpen);
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);
 assert.ok(await E(()=>window.__remnant.game.scene.getScene('hud').children.getByName('hero_swap').active),'tag survives rotation');
 await page.screenshot({path:'qa/action-phone.png'});
 assert.deepEqual(errors,[]);console.log('Tirzah: arrows hit a real foe, charge and spread consume Energy, walls block shots, selection persists, phone tag and rotation work');
 console.log('Action kit: all checks passed');
}catch(e){console.error(await E(()=>{const w=window.__remnant.world,p=w.player;return{hero:p.hero,state:p.state,ready:w.ready,transitioning:w.transitioning,paused:window.__remnant.G.paused,cut:window.__remnant.G.inCutscene,hudPaused:w.hud.paused,wheel:w.hud.wheelOpen,x:p.x,y:p.y,draw:p.bow.drawing,charge:p.bow.charge,arrows:p.bow.arrows.filter(a=>a.move),target:window.target&&{x:window.target.x,y:window.target.y,hp:window.target.hp}};}));throw e;}finally{await browser.close();close();}
