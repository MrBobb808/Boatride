// Upgrade an already-installed original app on the same origin, then prove
// that main/preview/fallback cannot replace one another's offline document.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
let legacy = true;
const root = resolve('../remnant/dist-pages'), old = resolve('../remnant/dist');
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.css':'text/css','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');let path=url.pathname.replace(/^\/Boatride\//,'');if(!path||path.endsWith('/'))path+='index.html';
  const directory=legacy&&!path.startsWith('phaser/')&&!path.startsWith('classic/')?old:root;
  const file=resolve(directory,path);
  try{if(!file.startsWith(directory+'/'))throw Error('Path');res.setHeader('content-type',types[extname(file)]??'application/octet-stream');res.setHeader('cache-control','no-store');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://localhost:${server.address().port}/Boatride/`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:956,height:440}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));
const until=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000}).catch(async e=>{const state=await page.evaluate(async()=>({url:location.href,keys:await caches.keys(),regs:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state})),ui:document.getElementById('ui')?.innerText.slice(-150)}));throw Error(e.message+' '+fn.toString()+' '+JSON.stringify(state));});
try{
  await page.goto(base+'phaser/?debug&nostory&autostart&fresh');await until(()=>window.__remnant?.world?.player);
  const prior=await page.evaluate(()=>localStorage.getItem('remnant-phaser.save.v2'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('remnant-phaser.main-cutover.v1')),null,'preview does not migrate the main app');
  await page.evaluate(()=>{
    const template=window.__remnant.world.save;
    for(let slot=0;slot<3;slot++){const s=structuredClone(template);s.level=20+slot*10;s.silver=2000+slot*100;s.kills=40+slot;s.flags.intro_done=true;s.flags.ending_done=true;s.flags.relic_taken=true;localStorage.setItem('remnant-save-'+slot,JSON.stringify(s));}
    localStorage.setItem('remnant-last-slot','2');localStorage.setItem('remnant-settings-v1',JSON.stringify({master:0.27,bossDifficulty:'merciless',soundtrack:'score',v:4}));
  });
  await page.goto(base+'?debug');await until(()=>!!window.__remnant?.load);await page.evaluate(()=>window.__remnant.load(2));await until(()=>!!window.__remnant.G.save);
  const before=await page.evaluate(()=>({level:window.__remnant.G.save.level,silver:window.__remnant.G.save.silver,equipment:window.__remnant.G.save.equipment,d:window.__remnant.G.d}));
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;sessionStorage.setItem('remnant-resume-slot','2');});
  legacy=false;await page.goto(base+'?debug&v=cutover');await until(()=>window.__remnant?.world?.player);
  const after=await page.evaluate(()=>({slot:window.__remnant.G.slot,level:window.__remnant.world.save.level,silver:window.__remnant.world.save.silver,equipment:window.__remnant.world.save.equipment,d:window.__remnant.world.d,settings:window.__remnant.settings}));
  assert.equal(after.slot,2);assert.equal(after.level,before.level);assert.equal(after.silver,before.silver);assert.deepEqual(after.equipment,before.equipment);assert.deepEqual(after.d,before.d,'the same real save derives exactly the same combat stats');
  assert.equal(after.settings.master,0.27);assert.equal(after.settings.bossDifficulty,'merciless');
  const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('remnant-phaser.before-cutover.slot0')));assert.equal(backup.level,JSON.parse(prior).level);assert.deepEqual(backup.equipment,JSON.parse(prior).equipment,'earlier Phaser journey is backed up');
  const original=await page.evaluate(()=>[0,1,2].map(i=>localStorage.getItem('remnant-save-'+i)));
  assert.deepEqual(await page.evaluate(()=>[0,1,2].map(i=>JSON.parse(localStorage.getItem(i===0?'remnant-phaser.save.v2':'remnant-phaser.save.slot'+i)).level)),[20,30,40]);
  console.log('Switch-over: all three real slots copied; original keys retained; preview backed up; legacy resume slot, gear, exact stats and audio/challenge preferences carried over');
  await until(async()=>{const r=await navigator.serviceWorker.getRegistration();return r&&!r.installing&&!r.waiting&&(await caches.keys()).some(k=>k.startsWith('remnant-phaser-shell-%2FBoatride%2F-'));});
  await page.evaluate(()=>{window.__remnant.world.save.silver=9876;window.__remnant.world.persist();});
  await context.setOffline(true);await page.reload();await until(()=>window.__remnant?.world?.player);assert.equal(await page.evaluate(()=>window.__remnant.world.save.silver),9876);
  await context.setOffline(false);
  await page.goto(base+'phaser/?debug&nostory&autostart');await until(()=>window.__remnant?.world?.player);
  await until(async()=>!!(await navigator.serviceWorker.getRegistration(new URL('./',location.href)))?.active);
  await page.goto(base+'classic/?debug');await until(()=>!!window.__remnant?.load);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(k=>k.startsWith('remnant-phaser-shell-%2FBoatride%2F-'))&&keys.some(k=>k.startsWith('remnant-phaser-shell-%2FBoatride%2Fphaser%2F-')),'main and preview have independent shell caches');
  await context.setOffline(true);await page.goto(base+'?debug&autostart');await until(()=>window.__remnant?.world?.player);
  assert.equal(await page.evaluate(()=>window.__remnant.world.save.silver),9876,'visiting the fallback did not replace the main offline game or re-import an older slot');
  assert.deepEqual(await page.evaluate(()=>[0,1,2].map(i=>localStorage.getItem('remnant-save-'+i))),original,'Phaser writes never modify the original edition’s save keys');
  await context.setOffline(false);const manifest=await page.evaluate(()=>fetch('./manifest.webmanifest').then(r=>r.json()));assert.equal(manifest.id,'./');assert.equal(manifest.short_name,'Remnant');
  await page.evaluate(() => window.__remnant.G.ui.openMenu('system'));
  await page.click('[data-k="recover_preview_0"]'); await page.click('[data-k="choice_1"]');
  await until(() => window.__remnant.G.slot === 0);
  assert.equal(await page.evaluate(() => window.__remnant.world.save.level), JSON.parse(prior).level, 'preview recovery loads the backed-up journey');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('remnant-phaser.before-preview-restore.slot0')).level),20, 'recovery backs up the displaced main slot');
  assert.deepEqual(await page.evaluate(() => [0,1,2].map(i => localStorage.getItem('remnant-save-'+i))), original);
  console.log('Recovery: the earlier preview journey can be restored through System while the current main journey is backed up');
  await mkdir('qa',{recursive:true});await page.screenshot({path:'qa/cutover-main.png'});
  assert.deepEqual(errors,[]);console.log('Installed upgrade: original worker → Phaser worker; offline reload preserves play; preview and fallback cannot evict or poison main; installed-app identity retained');
}catch(e){throw Error(e.message+'\n'+errors.join('\n'));}finally{await browser.close();await new Promise(r=>server.close(r));}
