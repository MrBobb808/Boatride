// Where the frame goes (POLISH_PLAN §19 phase 6; the performance-optimization skill: measure first). Plays three busy
// scenes in headless Chromium and records, for each, the script's frame time (Phaser's step: update and draw calls),
// the functions that take the most CPU (Chrome's sampling profiler) and the ones that allocate the most (its sampling
// heap profiler). Headless Chromium draws with a software GPU, so these are CPU numbers: the iPhone's GPU is its own
// measure. For readable names, profile an unminified build: `npx vite build --minify false && node scripts/perf.mjs`.
// `--json <file>` saves the numbers; PERF_SECS sets the seconds per scene (6). Not part of CI (it only reports); the
// numbers it gave and the budgets to hold are in POLISH_PLAN §19 phase 6.
import { chromium, devices } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
const SECS = Number(process.env.PERF_SECS ?? 6);

const SCENES = {
  // A Horde stage at its fullest: 120 foes on the field around a hero who cannot fall.
  async horde(page) {
    await page.goto(base + '?debug&horde');
    await until(page, () => window.__remnant?.horde?.hero?.sprite && window.__remnant.game.scene.isActive('horde'));
    await page.evaluate(() => { const h = window.__remnant.horde; h.hurtHero = () => {}; h.stageT = 200; for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; h.spawnFoe(h.hero.x + Math.cos(a) * (120 + (i % 5) * 30), h.hero.y + Math.sin(a) * (120 + (i % 5) * 30), i % 9 ? 'husk' : 'bulwark'); } });
  },
  // The Watch at ×3 with five abilities and a full shadow team, mid-game.
  async watch(page) {
    await page.goto(base + '?debug');
    await until(page, () => window.__remnant?.game?.scene?.isActive('title'));
    await page.click('[data-k=title_watch]');
    await until(page, () => window.__remnant?.watch?.w);
    await page.evaluate(() => { const sc = window.__remnant.watch, w = sc.w;
      Object.assign(w, { level: 120, up: { attack: 200, health: 200, speed: 100, crit: 80, regen: 25 }, speed: 3, autoSkills: true });
      w.skills = { strike: 5, pillar: 5, phantom: 5, storm: 5, comet: 5 }; w.loadout = ['strike', 'pillar', 'phantom', 'storm', 'comet'];
      w.shadows = { sentinel: { lv: 10 }, knight: { lv: 10 }, archer: { lv: 10 }, lion: { lv: 10 }, brute: { lv: 10 } }; w.team = ['sentinel', 'knight', 'archer', 'lion', 'brute'];
      sc.band.rebuild(w); sc.startStage(95); });
  },
  // Chapter XII's King of the North, with his horsemen, Elior unharmed.
  async north(page) {
    await page.goto(base + '?debug&nostory&autostart&fresh');
    await until(page, () => window.__remnant?.world?.player);
    await page.evaluate(() => { const w = window.__remnant.world; w.save.level = 68; w.save.flags.ch12_boundary_open = true; w.save.flags.unshorn = true;
      window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); window.__remnant.warp('palace_between_seas', 'start'); });
    await until(page, () => window.__remnant.world.room.id === 'palace_between_seas' && !window.__remnant.world.transitioning);
    await page.evaluate(() => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'north_king_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state));
  },
};

/** Self time (ms) by function from a CPU profile, and bytes by function from a sampling heap profile. */
function topCpu(profile, n = 12) {
  const self = new Map(), byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const dt = profile.timeDeltas; let total = 0;
  profile.samples.forEach((id, i) => { const node = byId.get(id), f = node.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; const ms = (dt[i] ?? 0) / 1000; total += ms; self.set(k, (self.get(k) ?? 0) + ms); });
  return { total, top: [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => [k, +(ms).toFixed(1), +((ms / total) * 100).toFixed(1)]) };
}
/** Who calls a native function (texture uploads, by default): self ms by the nearest caller in the game's own code,
 * six frames up, so the canvas behind each upload shows. */
function callers(profile, native = 'texImage2D', n = 6) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x])), parent = new Map();
  for (const x of profile.nodes) for (const c of x.children ?? []) parent.set(c, x.id);
  const name = (x) => `${x.callFrame.functionName || '(anon)'}:${x.callFrame.lineNumber + 1}`;
  const by = new Map();
  profile.samples.forEach((id, i) => {
    let x = byId.get(id); if (x.callFrame.functionName !== native) return;
    const chain = []; while (chain.length < 6 && (x = byId.get(parent.get(x.id)))) if (x.callFrame.url) chain.push(name(x));
    const k = chain.join(' < '); by.set(k, (by.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  });
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => [k, +ms.toFixed(1)]);
}
function topAlloc(head, n = 10) {
  const by = new Map(); let total = 0;
  const walk = (x) => { const f = x.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; by.set(k, (by.get(k) ?? 0) + x.selfSize); total += x.selfSize; x.children.forEach(walk); };
  walk(head);
  return { total, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, b]) => [k, Math.round(b / 1024)]) };
}

const out = {};
try {
  for (const [name, setup] of Object.entries(SCENES)) {
    if (process.argv.length > 2 && !process.argv.includes(name) && !process.argv.some((a) => a.startsWith('--'))) continue;
    const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
    const page = await ctx.newPage();
    await setup(page);
    await page.waitForTimeout(1500);
    // The script's own frame: Phaser's step (every scene's update and its draw calls), timed around the loop's callback
    // (the game bound it at boot, so wrapping game.step would miss it).
    await page.evaluate(() => { const loop = window.__remnant.game.loop, step = loop.callback; window.__steps = []; loop.callback = (t, d) => { const a = performance.now(); step(t, d); window.__steps.push(performance.now() - a); }; });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192 });
    const heap0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    await cdp.send('Profiler.start');
    await page.waitForTimeout(SECS * 1000);
    const { profile } = await cdp.send('Profiler.stop');
    const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
    const steps = await page.evaluate(() => window.__steps.slice());
    steps.sort((a, b) => a - b);
    const q = (p) => +(steps[Math.floor(p * (steps.length - 1))] ?? 0).toFixed(2);
    const cpu = topCpu(profile), alloc = topAlloc(heap.head);
    out[name] = { frames: steps.length, stepMs: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) }, cpu, allocKBPerSec: Math.round(alloc.total / 1024 / SECS), alloc: alloc.top, heapGrowKB: Math.round(((await cdp.send('Runtime.getHeapUsage')).usedSize - heap0) / 1024) };
    console.log(`\n== ${name}: ${steps.length} frames in ${SECS} s; step ms p50 ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · max ${q(1)}; sampled allocation ~${out[name].allocKBPerSec} KB/s`);
    console.log('  CPU (self ms, % of sampled):'); for (const [k, ms, pc] of cpu.top) console.log(`    ${String(ms).padStart(7)} ${String(pc).padStart(5)}%  ${k}`);
    // The two calls that cross between the CPU and the GPU: texture uploads, and canvas read-backs (which stall the GPU
    // on a phone).
    out[name].uploads = callers(profile); out[name].readbacks = callers(profile, 'getImageData');
    console.log('  Texture uploads (texImage2D self ms, by caller):'); for (const [k, ms] of out[name].uploads) console.log(`    ${String(ms).padStart(7)}  ${k}`);
    console.log('  Canvas read-backs (getImageData self ms, by caller):'); for (const [k, ms] of out[name].readbacks) console.log(`    ${String(ms).padStart(7)}  ${k}`);
    console.log('  Allocation (KB sampled):'); for (const [k, kb] of alloc.top) console.log(`    ${String(kb).padStart(7)}  ${k}`);
    await ctx.close();
  }
  const j = process.argv.indexOf('--json');
  if (j > 0) await writeFile(process.argv[j + 1], JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  close();
}
