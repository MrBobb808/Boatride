// Measures door transitions: ms from fade-out end (load start) to the end of the first drawn frame,
// and the worst frame work time in the 30 frames after arrival.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const dist = resolve(process.env.DIST ?? 'dist');
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try { const file = resolve(dist, path); res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript' })[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const style = process.argv[2] ?? 'pixel';
const reps = +(process.argv[3] ?? 1);
const pairs = [['hiddekel_camp', 'ulai_marsh'], ['thaw_outpost', 'riftwood_trail'], ['slag_procession', 'bellows_foundry'], ['village_square', 'temple_steps']];
const ctx = await browser.newContext({ viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await ctx.addInitScript((style) => {
  localStorage.setItem('remnant-settings-v1', JSON.stringify({ v: 4, fps: 'auto', quality: 'high', artStyle: style }));
  const raf = window.requestAnimationFrame.bind(window);
  window.__frames = [];
  window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); const z = window.__acc; const d0 = z ? z.draw : 0, u0 = z ? z.upd : 0, c0 = z ? z.chunks : 0; cb(t); if (window.__rec) window.__frames.push([a, performance.now() - a, z ? +(z.draw - d0).toFixed(1) : 0, z ? +(z.upd - u0).toFixed(1) : 0, z ? +(z.chunks - c0).toFixed(1) : 0]); });
}, style);
const page = await ctx.newPage();
if (process.env.DBG) { await page.addInitScript(() => { window.__DBG = 1; }); page.on('console', m => console.log(m.text())); }
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(base + '?debug&autostart');
await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
await page.evaluate(() => { const { G } = window.__remnant; G.save.flags.intro_done = G.save.flags.relic_taken = true; G.ui.dialogue = async () => 0; G.ui.lore = async () => {}; G.ui.banner = () => {}; });
const out = [];
for (let rep = 0; rep < reps; rep++) for (const [from, to] of pairs) {
  await page.evaluate(([from, to]) => {
    const { G } = window.__remnant, W = G.world; W.load(from, 'left');
    // Stand a few steps from the door that will be taken, as a player walking to it would.
    const ex = W.room.exits.find(e => e.to === to);
    if (ex) { W.player.x = (ex.x + (ex.x < 5 ? ex.w + 4 : -4)) * 16; W.player.y = (ex.y + ex.h) * 16 - 1; W.player.body.vx = 0; G.camera.snapTo(W.player.x, W.player.y - 40); }
  }, [from, to]);
  if (process.env.COLD) await page.waitForTimeout(300);
  else {
    // Give idle time a chance to prepare the room behind the door (baseline builds have no prep: fixed wait).
    const t = Date.now();
    await page.waitForTimeout(1000);
    while (Date.now() - t < 20000 && await page.evaluate((to) => { const p = window.__remnant.prep?.(); if (!p) return false; const r = p.rooms.find(r => r.id === to); return !(r && r.layers && r.queue === 0); }, to)) await page.waitForTimeout(250);
    out.waitS = (Date.now() - t) / 1000;
  }
  if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => window.__remnant.prep?.())));
  const exit = await page.evaluate((to) => { const W = window.__remnant.G.world; const ex = W.room.exits.find(e => e.to === to); return ex ? ex.spawn : null; }, to);
  const r = await page.evaluate(async ([to, spawn]) => {
    const { G } = window.__remnant, W = G.world;
    G.inCutscene = false;
    let t0 = 0, loadMs = 0;
    const orig = W.load;
    W.load = function (...a) { t0 = performance.now(); window.__frames = []; window.__rec = true; orig.apply(this, a); loadMs = performance.now() - t0; };
    const acc = window.__acc = { draw: 0, upd: 0, chunks: 0 };
    const wrap = (obj, name, key) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); acc[key] += performance.now() - t; return r; }; return () => { obj[name] = f; }; };
    const un = [wrap(W, 'draw', 'draw'), wrap(W, 'update', 'upd'), wrap(W.cache.constructor.prototype, 'draw', 'chunks')];
    window.__split = [];
    const raf0 = window.requestAnimationFrame;
    const late0 = window.__remnant.prep?.().bakes.lateChunks ?? 0;
    W.transition(to, spawn);
    while (!t0 || window.__frames.length < 31) await new Promise(r => setTimeout(r, 30));
    W.load = orig; window.__rec = false; un.forEach(f => f());
    const f = window.__frames.filter(([a]) => a > t0);
    const first = f[0];
    const st = window.__remnant.prep?.().stats;
    if (window.__DBG) console.log(JSON.stringify(f.slice(0, 30).map(x => [+x[1].toFixed(1), x[2], x[3], x[4]])));
    const wu = f.slice(0, 30).map(x => x[2] + x[3]);
    return { late: (window.__remnant.prep?.().bakes.lateChunks ?? 0) - late0, adopted: st?.adopted, loadMs: +loadMs.toFixed(1), transitionMs: +((first[0] + first[1]) - t0).toFixed(1), first: +first[1].toFixed(1), worst30: +Math.max(...f.slice(0, 30).map(x => x[1])).toFixed(1), worstWorld30: +Math.max(...wu).toFixed(1), median30: +f.slice(0, 30).map(x => x[1]).sort((a, b) => a - b)[15].toFixed(1), room: W.room.id };
  }, [to, exit ?? 'left']);
  out.push({ from, to, ...r, waitS: out.waitS });
  await page.waitForTimeout(600);
}
console.table(out);
await browser.close(); server.close();
