// Death with stakes (POLISH_PLAN §12b). Resting at an altar marks where a fall
// rises; a fall in that chapter rises there, and leaves the silver where it
// happened, held by a shade. Strike the shade to win the silver back. Shades
// stack (a second fall before the first is won back leaves a second), they last
// through a reload, and a fall in another chapter rises at that room's doorway.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const s = await page.evaluate(() => { const w = window.__remnant.world; return { room: w.room.id, dead: w.player.dead, silver: w.save.silver, shades: w.save.shades, rest: w.save.restAt }; });
  throw Error(`${e.message}\n${fn}\n${JSON.stringify(s)}\n${errors.join('\n')}`);
});
const go = async (page, id) => {
  await E(page, (r) => window.__remnant.warp(r, 'start'), id);
  await until(page, (r) => { const w = window.__remnant.world; return w.room.id === r && !w.transitioning && w.player.onGround; }, id);
};
// Stand the hero on the real floor at x (the first solid tile below open air, scanning down).
const STAND = `window.standAt = (x) => { const w = window.__remnant.world, tx = Math.floor(x / 16); for (let ty = 1; ty < w.room.h; ty++) if (w.tileAt(tx, ty) !== 0 && w.tileAt(tx, ty - 1) === 0 && w.tileAt(tx, ty - 2) === 0 && w.tileAt(tx, ty - 3) === 0) { w.player.placeAt(x, ty * 16, 1); return ty * 16; } };`;
const fall = async (page) => {
  await E(page, () => { const p = window.__remnant.world.player; p.invuln = 0; p.die(); });
  await until(page, () => { const w = window.__remnant.world; return !w.player.dead && !w.transitioning && w.player.onGround; });
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.addInitScript(STAND);
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);

  // ---- rest at the sanctuary's altar: that is where a fall in Chapter I rises
  await go(page, 'sanctuary');
  await E(page, () => { const w = window.__remnant.world, a = w.interactables.find((i) => i.label === 'Rest'); w.player.placeAt(a.x, a.y, 1); });
  await until(page, () => window.__remnant.world.player.onGround);
  const rest = await E(page, () => { const w = window.__remnant.world; w.interactables.find((i) => i.label === 'Rest').use(); return w.save.restAt; });
  assert.ok(rest?.room === 'sanctuary', `resting marks the altar (${JSON.stringify(rest)})`);

  // ---- fall on the Ashen Road with 120 silver: rise at the altar, the silver left behind with a shade
  await go(page, 'ashen_road');
  const at = await E(page, () => { const w = window.__remnant.world; w.save.silver = 120; for (const e of w.classic.ents) if (e.isFoe) e.remove = true; window.standAt(w.room.w * 5); return Math.round(w.player.x); });
  await until(page, () => window.__remnant.world.player.onGround);
  await fall(page);
  const first = await E(page, () => { const w = window.__remnant.world; return { room: w.room.id, x: Math.round(w.player.x), rest: w.save.restAt.x, silver: w.save.silver, shades: w.save.shades }; });
  assert.ok(first.room === 'sanctuary' && Math.abs(first.x - first.rest) < 12, `the fall rose at the altar (${JSON.stringify(first)})`);
  assert.ok(first.silver === 0 && first.shades.length === 1 && first.shades[0].silver === 120 && first.shades[0].room === 'ashen_road' && Math.abs(first.shades[0].x - at) < 4, `the silver stays where the hero fell (${JSON.stringify(first)})`);
  console.log(`Fall: rose at the sanctuary altar; 120 silver left on the Ashen Road at x ${at}`);

  // ---- fall again before winning it back: a second shade, the first still there
  await go(page, 'ashen_road');
  await E(page, () => { const w = window.__remnant.world; w.save.silver = 50; for (const e of w.classic.ents) if (e.isFoe) e.remove = true; window.standAt(w.room.w * 4); });
  await until(page, () => window.__remnant.world.player.onGround);
  await fall(page);
  const two = await E(page, () => window.__remnant.world.save.shades.map((s) => s.silver));
  assert.deepEqual(two, [120, 50], 'shades stack');
  console.log('Second fall: a second shade with 50 silver; the first still holds 120');

  // ---- they last through a reload
  await E(page, () => window.__remnant.world.persist());
  await page.goto(base + '?debug&nostory&autostart');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  assert.deepEqual(await E(page, () => [window.__remnant.world.save.shades.length, window.__remnant.world.save.restAt?.room]), [2, 'sanctuary'], 'shades and the altar are saved');

  // ---- back on the road both shades wait; a strike wins each back
  await go(page, 'ashen_road');
  assert.equal(await E(page, () => window.__remnant.world.foes().filter((f) => f.shade && f.alive).length), 2, 'both shades wait on the road');
  await page.screenshot({ path: 'qa/shade.png' });
  for (let i = 0; i < 2; i++) {
    await E(page, () => { const w = window.__remnant.world, s = w.foes().find((f) => f.shade && f.alive); for (const e of w.classic.ents) if (e.isFoe) e.remove = true; window.standAt(s.x - 22); });
    await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
    const n = await E(page, () => window.__remnant.world.save.shades.length);
    for (let k = 0; k < 6; k++) {
      await page.keyboard.press('KeyJ');
      if (await E(page, (n) => window.__remnant.world.save.shades.length < n, n)) break;
      await page.waitForTimeout(500);
    }
    await until(page, (n) => window.__remnant.world.save.shades.length < n, n);
  }
  const won = await E(page, () => ({ silver: window.__remnant.world.save.silver, shades: window.__remnant.world.save.shades.length }));
  assert.deepEqual(won, { silver: 170, shades: 0 }, 'struck, both shades give their silver back');
  console.log('Recovered: two strikes won back 170 silver');

  // ---- a fall in another chapter rises at that room's doorway, not across the world
  await go(page, 'shinar_plain');
  await E(page, () => { const w = window.__remnant.world; w.save.silver = 30; for (const e of w.classic.ents) if (e.isFoe) e.remove = true; });
  await fall(page);
  const away = await E(page, () => ({ room: window.__remnant.world.room.id, shades: window.__remnant.world.save.shades.map((s) => s.room) }));
  assert.deepEqual(away, { room: 'shinar_plain', shades: ['shinar_plain'] }, 'another chapter rises at its own doorway');
  console.log('Another chapter: rose at the Plain of Shinar doorway, the shade left there');

  // ---- a fall with no silver leaves no shade
  await E(page, () => { window.__remnant.world.save.silver = 0; });
  await fall(page);
  assert.equal(await E(page, () => window.__remnant.world.save.shades.length), 1, 'no silver, no shade');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser shade: all checks passed');
} finally {
  await browser.close();
  close();
}
