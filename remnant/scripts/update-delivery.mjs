// Installed-app delivery: slow network refresh, save continuity, and the Settings update action.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const dist=resolve(process.env.REMNANT_TEST_DIST??'dist'),errors=[];
const html=await readFile(resolve(dist,'index.html'),'utf8'),original=html.match(/<meta name="remnant-build" content="(\d+)"/)?.[1];
assert.ok(original);let deployed=original,slow=false,versionChecks=0,refreshes=0;
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost'),path=u.pathname.replace(/^\/Boatride\//,'')||'index.html';
 try{
  const file=resolve(dist,path);if(!file.startsWith(dist+'/'))throw Error('Path');
  res.setHeader('cache-control','no-store');
  if(path==='version.json'){versionChecks++;res.setHeader('content-type','application/json');res.end(JSON.stringify({build:deployed}));return;}
  if(path==='index.html'){
   if(u.searchParams.has('v')){refreshes++;if(slow)await new Promise(r=>setTimeout(r,4200));}
   res.setHeader('content-type','text/html');res.end(html.replace(`name="remnant-build" content="${original}"`,`name="remnant-build" content="${deployed}"`));return;
  }
  res.setHeader('content-type',({'.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://localhost:${server.address().port}/Boatride/`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.PLAYWRIGHT_CHROMIUM_ARGS?JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS):[]});
await mkdir('qa',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:932,height:430},isMobile:true,hasTouch:true,deviceScaleFactor:3}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?debug&autostart');await page.waitForFunction(()=>window.__remnant?.G.world?.player?.style);
 await page.evaluate(()=>{const s=window.__remnant.G.save;s.flags.intro_done=s.flags.relic_taken=true;localStorage.setItem('remnant-save-2',JSON.stringify(s));});
 await page.goto(base+'?debug');await page.waitForFunction(()=>!!window.__remnant);await page.evaluate(()=>window.__remnant.load(2));
 await page.waitForFunction(()=>window.__remnant.G.world.player.style&&!window.__remnant.G.inCutscene);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.ok((await page.evaluate(async()=>{const r=await caches.match('./index.html');return r?.text();}))?.includes(original),'offline game is cached before refresh');
 const before=await page.evaluate(()=>{const {G}=window.__remnant;G.save.silver=424242;G.ui.openMenu('settings');return JSON.stringify({level:G.save.level,gear:G.save.inventory.map(i=>i.uid),echoes:G.save.echoes.map(e=>e.uid)});});
 assert.match(await page.locator('[data-k=current_build]').textContent(),new RegExp(original));
 deployed=String(BigInt(original)+1n);slow=true;
 await page.locator('[data-k=check_updates]').tap();
 await page.waitForFunction(build=>document.querySelector('meta[name=remnant-build]')?.content===build&&window.__remnant?.G.save?.silver===424242,deployed,{timeout:60000});
 await page.waitForFunction(()=>window.__remnant.G.world.player.style&&!window.__remnant.G.world.transitioning);
 const after=await page.evaluate(()=>{const {G}=window.__remnant;return JSON.stringify({level:G.save.level,gear:G.save.inventory.map(i=>i.uid),echoes:G.save.echoes.map(e=>e.uid)});});
 assert.equal(after,before,'same save, gear and Echoes resume after delayed update');assert.equal(refreshes,1,'one explicit refresh');
 await page.evaluate(()=>{const {G}=window.__remnant;G.ui.openMenu('settings');G.world.bossActive=true;});const probes=versionChecks;await page.locator('[data-k=check_updates]').tap();assert.equal(versionChecks,probes,'active encounters block manual update');
 await page.evaluate(()=>{window.__remnant.G.world.bossActive=false;});assert.match(await page.locator('[data-k=current_build]').textContent(),new RegExp(deployed));
 await page.screenshot({path:'qa/update-delivery-phone.png'});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:'slow installed-app update preserves save and resumes slot 2',from:original,to:deployed,refreshes,errors}));await context.close();
}finally{await browser.close();server.close();}
