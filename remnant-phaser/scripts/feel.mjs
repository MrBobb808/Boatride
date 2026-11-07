// Game feel shared by every mode (POLISH_PLAN §19 phase 2, src/game/feel.ts): a shake rolls and settles (no fresh
// random offset each frame) at the strength it always had; the main game's ordinary blows still leave the camera
// steady; and a following camera blends the same at any frame rate. Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
// Sample a camera's shake offset every frame for `ms`.
// Sample on every game step (after the shake's own step), not on the page's frames, which headless Chromium spaces out.
const sample = (page, scene, ms, shake) => E(page, ([scene, ms, shake]) => new Promise((done) => {
  const sc = window.__remnant.game.scene.getScene(scene), cam = sc.cameras.main, out = [], t0 = performance.now();
  if (shake) cam.shake(240, 0.014);
  const tick = () => {
    out.push([performance.now() - t0, cam.trauma.ox, cam.trauma.oy]);
    if (performance.now() - t0 >= ms) { sc.events.off('postupdate', tick); done({ out, w: cam.width * cam.zoom }); }
  };
  sc.events.on('postupdate', tick);
}), [scene, ms, shake]);

try {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  // ---- the Watch: a large blow's shake
  await page.goto(base + '?debug');
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
  await page.click('[data-k=title_watch]');
  await page.waitForFunction(() => window.__remnant?.watch?.w, null, { timeout: 30000 });
  await E(page, () => { window.__remnant.watch.w.autoSkills = false; });
  const s = await sample(page, 'watch', 500, true);
  const peak = Math.max(...s.out.map(([, x]) => Math.abs(x))), expect = 0.014 * s.w;
  // A fresh random offset each frame jumps by about the whole range; a rolling one moves a little between frames.
  const live = s.out.filter(([t]) => t < 150), steps = live.slice(1).map(([, x], i) => Math.abs(x - live[i][1]));
  const meanStep = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
  const settled = s.out.filter(([t]) => t > 330).every(([, x, y]) => x === 0 && y === 0);
  assert.ok(peak <= expect + 1 && peak >= expect * 0.4, `the shake reaches about the strength it always had (${peak.toFixed(1)} of ${expect.toFixed(1)} px)`);
  const spacing = live.slice(1).map(([t], i) => t - live[i][0]), meanDt = spacing.reduce((a, b) => a + b, 0) / Math.max(1, spacing.length);
  // The path itself, frame by frame at 120 Hz: a roll moves a small share of its range a frame, where a fresh random
  // offset in −1…1 would move about two thirds of it (headless Chromium steps too unevenly to judge it from the run).
  const path = await E(page, () => { const wave = window.__remnant.watch.cameras.main.shakeWave, d = []; let [px] = wave(0); for (let i = 1; i <= 60; i++) { const [x] = wave(i / 120); d.push(Math.abs(x - px)); px = x; } return d.reduce((a, b) => a + b, 0) / d.length; });
  assert.ok(path < 0.3, `the shake's path rolls: it moves ${path.toFixed(3)} of its range a frame at 120 Hz (random jitter: about 0.67)`);
  assert.ok(meanStep < peak * 0.9, `the shake rolls rather than jumping each frame (mean step ${meanStep.toFixed(2)} px, peak ${peak.toFixed(1)}, ${meanDt.toFixed(1)} ms a step)`);
  assert.ok(settled, 'the shake settles to rest by its end');
  // Two blows build a little on each other, never past the cap.
  const stacked = await E(page, () => { const cam = window.__remnant.watch.cameras.main; cam.shake(200, 0.009); const a = cam.trauma.trauma; cam.shake(200, 0.009); return [a, cam.trauma.trauma]; });
  assert.ok(stacked[1] > stacked[0] && stacked[1] < stacked[0] * 1.5, `a second blow builds on the first a little (${stacked.map((v) => v.toFixed(2))})`);

  // ---- the main game: ordinary blows keep the camera steady; the follow blends by the frame's real time
  await page.goto(base + '?debug&nostory&autostart');
  await page.waitForFunction(() => window.__remnant?.world?.player, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const steady = await E(page, () => { const w = window.__remnant.world; w.shake(0.005, 120); return w.cameras.main.trauma.trauma; });
  assert.equal(steady, 0, 'an ordinary blow leaves the main game camera steady (the owner\'s rule, PR #57)');
  const follow = await E(page, () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const w = window.__remnant.world, cam = w.cameras.main, dt = cam.followDt;
    done({ lerp: cam.lerp.x, want: 1 - Math.pow(1 - 0.14, dt * 60), dt });
  }))));
  assert.ok(Math.abs(follow.lerp - follow.want) < 1e-9, `the follow blends by the frame's real time (${JSON.stringify(follow)})`);
  // Two 120 Hz frames close the same share as one 60 Hz frame.
  const two = 1 - Math.pow(1 - (1 - Math.pow(0.86, 0.5)), 2);
  assert.ok(Math.abs(two - 0.14) < 1e-12, 'two frames at 120 Hz close what one frame at 60 Hz did');

  assert.deepEqual(errors, [], `no page errors (${errors.join(' | ')})`);
  console.log(`Feel: the Watch's large shake peaks at ${peak.toFixed(1)} of ${expect.toFixed(1)} px, rolls (${path.toFixed(3)} of its range a frame at 120 Hz) and settles; blows build without running away; the main game's ordinary blow leaves the camera still; the follow blends by real frame time`);
  console.log('phaser feel: all checks passed');
} finally {
  await browser.close();
  close();
}
