// Runs against the exact production output, including /Boatride/ URLs and its worker.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const dist = resolve('dist');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname).replace(/^\/Boatride\//, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  try {
    const file = resolve(dist, p);
    if (!file.startsWith(dist + '/')) throw new Error('Invalid path');
    const data = await readFile(file);
    res.setHeader('content-type', ({'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)] ?? 'application/octet-stream');
    res.setHeader('cache-control', 'no-store'); res.end(data);
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({headless:true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),
  args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [],
});
await mkdir('qa', {recursive:true});
const kinds = ['husk','hound','archer','sentinel','wisp','brute','bulwark','knight','drone','soldier','lion','priest','vessel','scribe'];
const species = ['sentinel','archer','brute','bulwark','knight','marshal','locust','lion'];
try {
  for (const mobile of [true]) {
    const context = await browser.newContext(mobile ? {viewport:{width:874,height:402},deviceScaleFactor:3,isMobile:true,hasTouch:true} : {viewport:{width:1280,height:720}});
    await context.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__fr = []; window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); window.__fr.push([+a.toFixed(1), +(performance.now() - a).toFixed(1)]); if (window.__fr.length > 400) window.__fr.shift(); }); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?debug&autostart');
    await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
    // Start from a real migrated save after the opening conversation, without its timers.
    await page.evaluate(() => {
      const {G}=window.__remnant;G.save.flags.intro_done=true;
      localStorage.setItem('remnant-save-2',JSON.stringify(G.save));
    });
    await page.goto(base+'?debug');
    await page.waitForFunction(()=>!!window.__remnant);
    await page.evaluate(()=>window.__remnant.load(2));
    await page.waitForFunction(() => window.__remnant.G.world.player.style);
    const assets = await page.evaluate(() => window.__remnant.art());
    assert.deepEqual(assets.enemies.sort(), [...kinds].sort());
    assert.deepEqual(assets.echoes.sort(), [...species].sort());
    const before = await page.evaluate(() => window.__remnant.G.world.player.x);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(300); await page.keyboard.up('KeyD');
    const after = await page.evaluate(() => window.__remnant.G.world.player.x);
    assert.ok(after > before + 5, 'Movement still works');
    await page.keyboard.press('Space'); await page.keyboard.press('KeyJ');
    await page.waitForTimeout(200);
    if (mobile) {
      await page.waitForFunction(()=>window.__remnant.G.world.player.body.onGround);
      await page.touchscreen.tap(440,180);
      await page.locator('#touch .tc').filter({hasText:'Jump'}).tap();
      await page.waitForTimeout(50);
      const ok = await page.evaluate(()=>window.__remnant.G.world.player.body.vy < 0);
      if (!ok) console.log('FAIL', JSON.stringify(await page.evaluate(() => ({ fr: window.__fr.slice(-25), now: performance.now(), prep: window.__remnant.prep(), p: { vy: window.__remnant.G.world.player.body.vy, g: window.__remnant.G.world.player.body.onGround, st: window.__remnant.G.world.player.state }, eff: window.__remnant.particles() }))));
      else console.log('OK'); process.exit(0);
    }
    await page.evaluate(({kinds,species}) => {
      const a = window.__remnant, G=a.G;
      a.god(); G.d.echoSlots=8; G.paused=true;
      for (const kind of kinds) a.spawn(kind, G.world.player.x + 80, G.world.player.y);
      for (const speciesName of species) a.echo(speciesName);
      G.world.setSummon('all');
    }, {kinds,species});
    assert.equal(await page.evaluate(()=>window.__remnant.G.world.echoes.length),8);
    // Every species and state passes through the real Canvas renderer.
    for (const state of ['idle','move','slash','draw','release','hurt','stagger','death']) {
      await page.evaluate((state) => {
        const {G}=window.__remnant;
        for(const e of G.world.ents) if(e.kind) {e.state=state; e.st=.45; if(e.anim)e.anim.time=.7;}
      },state);
      await page.waitForTimeout(35);
    }
    await page.evaluate(() => {
      const {G}=window.__remnant;
      G.world.ents=G.world.ents.filter(e=>!e.kind);
      G.world.echoes=G.world.echoes.slice(0,3);
      const p=G.world.player;
      p.state='free';p.body.vx=0;p.mantleT=0;p.style.helm='visor';
      G.world.echoes.forEach((e,i)=>{e.x=p.x+48+i*60;e.y=p.y;e.summonT=0;e.recallT=0;e.state='follow';e.body.vx=0;});
    });
    await page.waitForTimeout(100);
    await page.screenshot({path:`qa/${mobile?'phone':'desktop'}-pixel.png`});
    await page.evaluate(() => { const p=window.__remnant.G.world.player;p.mantleT=5;p.state='attack'; });
    await page.waitForTimeout(80);
    await page.screenshot({path:`qa/${mobile?'phone':'desktop'}-mantle.png`});
    // A pre-existing slot survives a refresh and can still be resumed.
    await page.evaluate(() => {
      const s=structuredClone(window.__remnant.G.save);
      s.name='Continuity check';s.level=42;s.silver=1234;
      localStorage.setItem('remnant-save-0',JSON.stringify(s));
    });
    await page.goto(base+'?debug');
    await page.locator('.title-screen').waitFor();
    const resumed=await page.evaluate(()=>{const a=window.__remnant;return a.load(0)&&{name:a.G.save.name,level:a.G.save.level,silver:a.G.save.silver};});
    assert.deepEqual(resumed,{name:'Continuity check',level:42,silver:1234});
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.locator('.title-screen').waitFor();
    assert.deepEqual(errors,[],`${mobile?'Mobile':'Desktop'} runtime errors`);
    await context.close();
    console.log(`${mobile?'Mobile':'Desktop'}: 14 foes, 8 Echoes, movement, equipment, Mantle, save resume and offline launch passed`);
  }
} finally {
  await browser.close(); await new Promise(r=>server.close(r));
}
