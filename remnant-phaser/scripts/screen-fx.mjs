// Screen effects (POLISH_PLAN §11d): each place has its colour grade (cold in
// the Hunt's snow, hot in the foundry), bloom comes up only in bright moments
// (lightning here) at the top quality tier, the water casts its colour when you go under, and a boss's
// entrance (the letterbox) brings a harder grade, a deeper vignette and film
// grain, all easing back out after. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(`${e.message}\n${fn}\n${errors.join('\n')}`); });
const go = async (page, id) => {
  await E(page, (r) => window.__remnant.warp(r, 'start'), id);
  await until(page, (r) => { const w = window.__remnant.world; return w.room.id === r && !w.transitioning; }, id);
  await page.waitForTimeout(500);
};
// The grade's gain on red and on blue, read from its matrix.
const gains = (page) => E(page, () => { const m = window.__remnant.world.visuals.screen.color.colorMatrix.getData(); return { r: m[0] + m[1] + m[2], b: m[10] + m[11] + m[12] }; });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  const gpu = await E(page, () => window.__remnant.world.visuals.gpu);
  assert.ok(gpu, 'the test browser renders with WebGL');
  await E(page, () => { window.__remnant.settings.quality = 'high'; });

  // ---- each place its grade: the Hunt's snow cold, the foundry hot
  await go(page, 'thaw_outpost');
  const cold = await gains(page);
  await page.screenshot({ path: 'qa/screen-fx-cold.png' });
  await go(page, 'bellows_foundry');
  const hot = await gains(page);
  assert.ok(cold.b > cold.r && hot.r > hot.b, `cold in the snow, hot in the foundry (${JSON.stringify({ cold, hot })})`);
  console.log(`Grade: snow blue ${cold.b.toFixed(2)} > red ${cold.r.toFixed(2)}; foundry red ${hot.r.toFixed(2)} > blue ${hot.b.toFixed(2)}`);

  // ---- bloom only in bright moments, and only at the top tier: off at rest, on with lightning, never at low quality
  await go(page, 'chittim_harbor');
  const bloom = await E(page, async () => {
    const R = window.__remnant, v = R.world.visuals, s = v.screen, pf = s.bloom.parallelFilters, frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    v.atmosphere.next = 1e9; s.glowT = 0; await frames(30);
    const rest = pf.active;
    v.atmosphere.strike(); await frames(3);
    const lit = { on: pf.active, amount: pf.blend.amount };
    R.settings.quality = 'low'; s.glowT = 0; await frames(20); v.atmosphere.strike(); await frames(3);
    const low = pf.active;
    R.settings.quality = 'high'; await frames(3);
    return { rest, lit, low };
  });
  assert.ok(!bloom.rest && bloom.lit.on && bloom.lit.amount > 0.1 && !bloom.low, `bloom only in bright moments at the top tier (${JSON.stringify(bloom)})`);
  console.log(`Bloom: off at rest, ${bloom.lit.amount.toFixed(2)} with lightning, off at low quality`);

  // ---- a boss's entrance: the letterbox brings the cinematic grade and the grain, and they ease out after
  const read = () => E(page, () => { const s = window.__remnant.world.visuals.screen; return { cine: s.cine, grain: s.grain.visible, grade: s.color.active, vignette: s.vignette.strength }; });
  await E(page, () => window.__remnant.world.hud.cinematicBars(true));
  await until(page, () => window.__remnant.world.visuals.screen.cine > 0.85);
  const on = await read();
  await E(page, () => window.__remnant.world.hud.cinematicBars(false));
  await until(page, () => window.__remnant.world.visuals.screen.cine < 0.015);
  const cine = { on, off: await read() };
  assert.ok(cine.on.cine > 0.8 && cine.on.grain && cine.on.grade && cine.on.vignette > 0.45, `the entrance grades and grains the screen (${JSON.stringify(cine)})`);
  assert.ok(cine.off.cine < 0.05 && !cine.off.grain && cine.off.vignette < 0.05, `then eases back out (${JSON.stringify(cine)})`);
  console.log(`Cinematic: ${JSON.stringify(cine)}`);

  // ---- under the water in the Sunken Temple, the water's colour
  await go(page, 'sunken_temple');
  const under = await E(page, async () => {
    const w = window.__remnant.world, p = w.player, W = 8;
    for (let y = 2; y < w.room.h - 1; y++) for (let x = 2; x < w.room.w - 2; x++)
      if (w.tileAt(x, y) === W && w.tileAt(x, y - 1) === W && w.tileAt(x, y - 2) === W && w.tileAt(x, y + 1) === W) {
        for (let i = 0; i < 30; i++) { p.placeAt(x * 16 + 8, y * 16 + 14, 1); await new Promise((r) => setTimeout(r, 50)); if (w.visuals.screen.under > 0.6) break; }
        const m = w.visuals.screen.color.colorMatrix.getData(); return { under: w.visuals.screen.under, water: m[12] > m[0], submerged: !!p.water?.submerged };
      }
    return 'no deep water';
  });
  assert.ok(typeof under === 'object' && under.under > 0.5 && under.water, `the water casts its colour under the surface (${JSON.stringify(under)})`);
  await page.screenshot({ path: 'qa/screen-fx-underwater.png' });
  console.log(`Underwater: ${JSON.stringify(under)}`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser screen effects: all checks passed');
} finally {
  await browser.close();
  close();
}
