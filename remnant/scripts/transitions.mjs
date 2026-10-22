// Seamless doors and steady frames: rooms behind the doors are prepared in idle time,
// a prepared doorway arrives without baking anything, caches follow quality changes,
// and a mass death keeps the particle pool within its caps.
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

// Quality is pinned to High so auto quality, which reacts to this slow software renderer,
// cannot change the bake settings mid-check; the quality check changes it on purpose.
// Per frame: the whole callback, and the world's own update + draw. Software-rendered
// headless Chromium spends most of a frame scaling the canvas up and drawing the HUD,
// which no door changes, so the budget is judged on the world's share.
const BUDGET_MS = 24;
/*
 * Why 24 ms: the hard guard is that a prepared door bakes nothing in its frames (no
 * parallax build, no late chunk), which these counters check exactly. The time limit catches
 * any other stall: headless Chromium without a GPU runs canvas work several times slower
 * than an iPhone, and prepared arrivals measure 2-10 ms of world time here, while the old
 * synchronous arrival took 13-25 ms (pixel) and 26-41 ms (smooth). 24 ms, under three
 * 120 Hz frames, leaves room for shared CI machines without letting a door hitch through.
 */

async function boot(style) {
  const context = await browser.newContext({ viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await context.addInitScript((style) => {
    if (!localStorage.getItem('remnant-settings-v1')) localStorage.setItem('remnant-settings-v1', JSON.stringify({ v: 4, fps: 'auto', quality: 'high', artStyle: style }));
    const raf = window.requestAnimationFrame.bind(window);
    window.__frames = [];
    window.__acc = { world: 0 };
    window.requestAnimationFrame = (cb) => raf((t) => {
      const a = performance.now(), w0 = window.__acc.world;
      cb(t);
      if (window.__rec) window.__frames.push({ at: a, ms: performance.now() - a, world: window.__acc.world - w0 });
    });
  }, style);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world;
    G.save.flags.intro_done = G.save.flags.relic_taken = true;
    G.ui.dialogue = async () => 0; G.ui.lore = async () => {}; G.ui.banner = () => {};
    for (const name of ['update', 'draw']) {
      const f = W[name];
      W[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); window.__acc.world += performance.now() - t; return r; };
    }
  });
  return { context, page };
}

/** Load a room, stand by the door to `to`, and wait for idle time to prepare what lies behind it. */
async function prepareAt(page, from, to) {
  await page.evaluate(([from, to]) => {
    const { G } = window.__remnant, W = G.world;
    G.inCutscene = false; G.paused = false;
    W.load(from, 'left');
    for (const e of W.ents) if (e.isFoe) e.remove = true;
    const ex = W.room.exits.find(e => e.to === to);
    W.player.x = (ex.x + (ex.x < 5 ? ex.w + 4 : -4)) * 16; W.player.y = (ex.y + ex.h) * 16 - 1; W.player.body.vx = 0;
    G.camera.snapTo(W.player.x, W.player.y - 40);
  }, [from, to]);
  const t0 = Date.now();
  await page.waitForFunction((to) => {
    const p = window.__remnant.prep(), r = p.rooms.find(r => r.id === to);
    return r && r.layers && r.queue === 0 && r.key === p.key;
  }, to, { timeout: 30000, polling: 100 });
  return (Date.now() - t0) / 1000;
}

/** Walk through the door (the real transition, fade and all) and record the 30 frames after arrival. */
async function crossTo(page, to) {
  return page.evaluate(async (to) => {
    const { G } = window.__remnant, W = G.world, before = window.__remnant.prep();
    const ex = W.room.exits.find(e => e.to === to);
    let t0 = 0, loadMs = 0;
    const load = W.load;
    W.load = function (...a) { t0 = performance.now(); window.__frames = []; window.__rec = true; load.apply(this, a); loadMs = performance.now() - t0; };
    W.transition(ex.to, ex.spawn);
    while (!t0 || window.__frames.length < 30) await new Promise(r => setTimeout(r, 20));
    W.load = load; window.__rec = false;
    const after = window.__remnant.prep(), f = window.__frames.slice(0, 30);
    return {
      room: W.room.id, loadMs, firstMs: f[0].at + f[0].ms - t0,
      worstWorld: Math.max(...f.map(x => x.world)), worstFrame: Math.max(...f.map(x => x.ms)),
      parallaxBuilds: after.bakes.parallax - before.bakes.parallax, lateChunks: after.bakes.lateChunks - before.bakes.lateChunks,
      adopted: after.stats.adopted - before.stats.adopted,
    };
  }, to);
}

try {
  // ---- Pixel style (the default): Chapters VI, VII and IX.
  {
    const { context, page } = await boot('pixel');
    // Baking a neighbour must not change how the live room looks: the dawn camp next to the
    // dusk marsh draws the same frame before and after the marsh is prepared (time frozen).
    const look = () => page.evaluate(() => {
      const { G } = window.__remnant, W = G.world, r = G.renderer, rnd = Math.random;
      Math.random = () => 0.5;
      for (let i = 0; i < 12; i++) W.draw(r.wctx);
      Math.random = rnd;
      const d = r.wctx.getImageData(0, 0, r.bw, r.bh).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
      return h;
    });
    await page.evaluate(() => { const { G } = window.__remnant; G.inCutscene = false; G.world.load('hiddekel_camp', 'right'); G.paused = true; });
    const fresh = await look();
    await page.waitForFunction(() => { const p = window.__remnant.prep(); return p.rooms.some(r => r.id === 'ulai_marsh' && r.layers && r.queue === 0); }, null, { timeout: 30000, polling: 100 });
    assert.equal(await look(), fresh, 'preparing the marsh left the camp looking the same');
    await page.evaluate(() => { window.__remnant.G.paused = false; });
    for (const [from, to] of [['hiddekel_camp', 'ulai_marsh'], ['thaw_outpost', 'riftwood_trail'], ['slag_procession', 'bellows_foundry']]) {
      const waitS = await prepareAt(page, from, to);
      const prep = await page.evaluate(() => window.__remnant.prep());
      assert.ok(prep.stats.slices > 0 && prep.stats.steps > 0, 'preparation ran in idle slices');
      const r = await crossTo(page, to);
      assert.equal(r.room, to);
      assert.equal(r.parallaxBuilds, 0, `${to}: the backdrop came prepared`);
      assert.equal(r.lateChunks, 0, `${to}: no tile chunk was baked on arrival`);
      assert.ok(r.adopted > 0, `${to}: prepared chunks were used`);
      assert.ok(r.worstWorld < BUDGET_MS, `${to}: worst world frame ${r.worstWorld.toFixed(1)} ms after arrival`);
      console.log(`${from} → ${to}: prepared in ${waitS.toFixed(1)} s; load ${r.loadMs.toFixed(1)} ms, first frame done ${r.firstMs.toFixed(1)} ms after load began, worst world ${r.worstWorld.toFixed(1)} ms / frame ${r.worstFrame.toFixed(1)} ms over 30 frames, ${r.adopted} chunks adopted`);
    }
    // Walking back finds the room just left still prepared.
    const back = await page.evaluate(() => window.__remnant.prep().rooms.find(r => r.id === 'slag_procession'));
    assert.ok(back && back.layers, 'the room behind is kept for the walk back');

    // ---- Quality change: every prepared room is dropped and rebuilt under the new settings.
    const q = await page.evaluate(async () => {
      const { G } = window.__remnant, r = G.renderer;
      const before = window.__remnant.prep();
      window.__remnant.settings.quality = 'medium'; r.resize();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const after = window.__remnant.prep();
      return { oldKey: before.key, newKey: after.key, layerKey: after.layerKey, had: before.rooms.length, stale: after.rooms.filter(x => x.key !== after.key).length, dropped: after.stats.dropped - before.stats.dropped };
    });
    assert.notEqual(q.oldKey, q.newKey);
    assert.equal(q.layerKey, q.newKey, 'the live room rebuilt for the new tier');
    assert.equal(q.stale, 0, 'no cache from the old settings survives');
    assert.ok(q.had > 0 && q.dropped >= q.had, 'old prepared rooms were released');
    await page.waitForFunction(() => { const p = window.__remnant.prep(); return p.rooms.some(r => r.layers && r.key === p.key); }, null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => { window.__remnant.settings.quality = 'high'; window.__remnant.G.renderer.resize(); });
    console.log(`Quality change dropped ${q.dropped} prepared rooms and re-prepared under the new settings`);

    // ---- Mass death: a crowd falls in one frame; the pool stays within its caps.
    const burst = await page.evaluate(async () => {
      const a = window.__remnant, { G } = a, W = G.world;
      W.load('trial_arena', 'start');
      for (const e of W.ents) if (e.isFoe) e.remove = true;
      a.god(); W.player.invuln = 99;
      const foes = [];
      for (let i = 0; i < 40; i++) foes.push(a.spawn(i % 2 ? 'soldier' : 'archer', W.player.x - 300 + i * 15, W.player.y));
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      a.particles(true);
      let worst = 0, over = 0;
      for (const e of foes) e.takeHit({ dmg: 1e9, poise: 99999, kx: 0, ky: 0, dir: 1, kind: 'ability', src: W.player, unblockable: true, guardBreak: true });
      for (let i = 0; i < 60; i++) {
        await new Promise(res => requestAnimationFrame(res));
        const p = a.particles();
        worst = Math.max(worst, p.live);
        if (p.live > p.cap) over++;
      }
      return { ...a.particles(), worst, over };
    });
    assert.equal(burst.over, 0, 'live particles never exceed the tier cap');
    assert.ok(burst.peak <= Math.ceil(burst.frameCap * 1.5), `at most ${Math.ceil(burst.frameCap * 1.5)} particles spawn in one frame (peak ${burst.peak})`);
    console.log(`Mass death of 40 foes: peak ${burst.peak} spawned in a frame (budget ${burst.frameCap}), at most ${burst.worst} live (cap ${burst.cap})`);
    await page.screenshot({ path: 'qa/transitions-burst.png' });
    await context.close();
  }

  // ---- Smooth style: much larger bakes, where an unprepared door used to hitch hardest.
  {
    const { context, page } = await boot('smooth');
    // Chapter I's village: light to draw, so the door's own cost stands out. (The Fallen rooms'
    // five full-screen strips cost this software renderer 40-60 ms a frame in smooth style
    // with or without a door, which a GPU does not.)
    const waitS = await prepareAt(page, 'village_square', 'temple_steps');
    const r = await crossTo(page, 'temple_steps');
    assert.equal(r.parallaxBuilds, 0);
    assert.equal(r.lateChunks, 0);
    assert.ok(r.worstWorld < BUDGET_MS, `smooth: worst world frame ${r.worstWorld.toFixed(1)} ms after arrival`);
    console.log(`Smooth style village_square → temple_steps: prepared in ${waitS.toFixed(1)} s; first frame done ${r.firstMs.toFixed(1)} ms after load began, worst world ${r.worstWorld.toFixed(1)} ms`);
    // An unprepared door still works: the old path, with chunk bakes spread over frames.
    const cold = await page.evaluate(async () => {
      const { G } = window.__remnant, W = G.world;
      const b0 = window.__remnant.prep().bakes;
      W.load('fang_pits', 'left');
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const b1 = window.__remnant.prep().bakes;
      return { room: W.room.id, parallax: b1.parallax - b0.parallax, ok: W.layers.length > 0 };
    });
    assert.ok(cold.ok && cold.room === 'fang_pits');
    await page.screenshot({ path: 'qa/transitions-smooth.png' });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Doors arrive prepared, caches follow quality changes, and particle bursts stay capped');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
