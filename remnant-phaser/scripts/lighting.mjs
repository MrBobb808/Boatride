// Dramatic lighting (POLISH_PLAN §11b): Settings → Lighting deepens or lifts
// a dim room's darkness (dramatic by default), daylight is left alone, and
// the heroes' lights, arrows in flight and flashes cut through it. Read
// straight from the darkness layer's pixels. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout });
// The darkness at a point of the front layer (alpha 0–255), after two frames at the setting given.
const dark = (page, mode, at) => E(page, async ({ mode, at }) => {
  const R = window.__remnant, w = R.world; R.settings.lighting = mode;
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  const c = w.art.front.getContext(), x = at === 'hero' ? Math.round(w.player.x - w.cameras.main.worldView.x) : 6, y = at === 'hero' ? Math.round(w.player.feet - 24 - w.cameras.main.worldView.y) : 6;
  return c.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data[3];
}, { mode, at });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  assert.equal(await E(page, () => window.__remnant.settings.lighting), 'dramatic', 'dramatic by default');
  await E(page, () => window.__remnant.warp('cistern', 'start'));
  await until(page, () => { const w = window.__remnant.world; return w.room.id === 'cistern' && !w.transitioning; });
  await page.waitForTimeout(600);
  const d = { dramatic: await dark(page, 'dramatic'), balanced: await dark(page, 'balanced'), subtle: await dark(page, 'subtle') };
  assert.ok(d.dramatic > d.balanced && d.balanced > d.subtle, `the setting deepens or lifts the dark (${JSON.stringify(d)})`);
  const hero = await dark(page, 'dramatic', 'hero');
  assert.ok(hero < d.dramatic - 40, `the hero's own light cuts the dark around him (${hero} vs ${d.dramatic})`);
  console.log(`Cistern darkness: dramatic ${d.dramatic}, balanced ${d.balanced}, subtle ${d.subtle}; at the hero ${hero}`);

  // A flash lights a dark corner, then fades.
  const flash = await E(page, async () => {
    const w = window.__remnant.world, v = w.cameras.main.worldView, c = w.art.front.getContext(), read = () => c.getImageData(6, 6, 1, 1).data[3];
    const before = read();
    w.flashLight(v.x + 6, v.y + 6, 160, '#fff1c4', 0.6);
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    const lit = read();
    await new Promise((r) => setTimeout(r, 900));
    return { before, lit, after: read() };
  });
  assert.ok(flash.lit < flash.before - 40 && flash.after > flash.lit + 30, `a flash lights its corner and fades (${JSON.stringify(flash)})`);
  console.log(`Flash: ${JSON.stringify(flash)}`);

  // Daylight is left alone.
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.room.id === 'ashen_road' && !w.transitioning; });
  await page.waitForTimeout(400);
  const day = await E(page, () => window.__remnant.world.room.dark);
  if (day < 0.15) {
    const o = { dramatic: await dark(page, 'dramatic'), balanced: await dark(page, 'balanced') };
    assert.equal(o.dramatic, o.balanced, `open air looks the same either way (${JSON.stringify(o)})`);
    console.log('Daylight: unchanged by the setting');
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser lighting: all checks passed');
} finally {
  await browser.close();
  close();
}
