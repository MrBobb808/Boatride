// The Chapter I metroidvania pilot (POLISH_PLAN §12c). The crypt opens into the
// cistern behind a bar lifted only from the crypt side, making a loop back to the
// village; the square's loft and the road's rooftop are out of one jump's reach
// and within the Eagle Plume's second; the far rooftop needs the second jump and
// an air dash together. Jumps are driven frame by frame (headless frames are
// slow, so wall-clock key timing would misfire). Run after `npm run build`.
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
  const s = await page.evaluate(() => { const w = window.__remnant.world, p = w.player; return { room: w.room.id, x: p.x, feet: p.feet, ground: p.onGround, state: p.state }; });
  throw Error(`${e.message}\n${fn}\n${JSON.stringify(s)}\n${errors.join('\n')}`);
});
const go = async (page, id, spawn = 'start') => {
  await E(page, ([r, s]) => window.__remnant.warp(r, s), [id, spawn]);
  await until(page, (r) => { const w = window.__remnant.world; return w.room.id === r && !w.transitioning && w.player.onGround; }, id);
};
const clearFoes = (page) => E(page, () => { for (const e of window.__remnant.world.classic.ents) if (e.isFoe) e.remove = true; });
// Stand on the floor or ledge whose top is row `row`, at tile column `col`.
const stand = async (page, col, row) => {
  await E(page, ([c, r]) => window.__remnant.world.player.placeAt(c * 16 + 8, r * 16, 1), [col, row]);
  await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
};
/** A leap: optionally run right to `runTo`, jump (held to the top), a second jump at the top, and an air dash after. */
const leap = (page, o) => E(page, async (o) => {
  const w = window.__remnant.world, c = w.controls, p = w.player, b = p.body, frame = () => new Promise((r) => requestAnimationFrame(r));
  let top = 1e9;
  // Ever over the far roof's span and above its top: a player can always turn that into a landing.
  let over = false;
  const wait = async (f, n = 400) => { for (let i = 0; i < n && !f(); i++) { await frame(); top = Math.min(top, p.feet); over ||= p.x >= 52 * 16 && p.x < 59 * 16 && p.feet <= 10 * 16 + 2; } };
  if (o.runTo) { c.setTouchAxis(1, 0); await wait(() => p.x >= o.runTo); }
  // Let go just before the top and press again: on a phone that is a frame or two; here frames are long.
  c.setTouch('jump', true); await wait(() => !p.onGround, 30); await wait(() => b.velocity.y > (o.twice ? -170 : -40)); c.setTouch('jump', false);
  if (o.twice) { await frame(); c.setTouch('jump', true); await frame(); await wait(() => b.velocity.y > (o.dash ? -170 : -40)); c.setTouch('jump', false); }
  if (o.dash) { c.setTouch('dodge', true); await frame(); await frame(); c.setTouch('dodge', false); }
  await wait(() => p.onGround && b.velocity.y >= 0, 600);
  c.setTouchAxis(0, 0);
  for (let i = 0; i < 6; i++) await frame();
  return { col: Math.floor(p.x / 16), row: Math.round(p.feet / 16), ground: p.onGround, top: Math.round(top), over };
}, o);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  // fixedstep: every frame is 1/60 s of game and physics, so jump distances are a phone's at 60 fps.
  await page.goto(base + '?debug&nostory&autostart&fresh&fixedstep');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => { window.__remnant.god?.(true); setInterval(() => { const p = window.__remnant.world.player; if (p && !p.dead) p.hp = p.maxHp; }, 50); });

  // ---- the bar: from the cistern the passage east is shut, and says so
  await go(page, 'cistern', 'top');
  await clearFoes(page);
  const shut = await E(page, () => { const w = window.__remnant.world; return { wall: w.tileAt(50, 16) !== 0 && w.tileAt(51, 13) !== 0, hint: w.hints.some((h) => h.id === 'h_bar') }; });
  assert.deepEqual(shut, { wall: true, hint: true }, 'from the cistern the bar holds, and a hint says so');

  // ---- from the crypt the bar lifts; west through it is the cistern, and east again the crypt
  await go(page, 'crypt', 'shrine');
  await clearFoes(page);
  const lever = await E(page, () => { const w = window.__remnant.world, i = w.interactables.find((i) => i.label === 'Lift the bar'); if (!i) return null; i.use(); return { flag: w.save.flags.crypt_bar, open: w.tileAt(0, 18) === 0 && w.tileAt(1, 20) === 0, gone: !w.interactables.some((i) => i.label === 'Lift the bar') }; });
  assert.deepEqual(lever, { flag: true, open: true, gone: true }, 'the crypt side lifts the bar');
  await E(page, () => { const w = window.__remnant.world; w.player.placeAt(40, 22 * 16, -1); w.controls.setTouchAxis(-1, 0); });
  await until(page, () => window.__remnant.world.room.id === 'cistern' && !window.__remnant.world.transitioning);
  await E(page, () => window.__remnant.world.controls.setTouchAxis(0, 0));
  await until(page, () => window.__remnant.world.player.onGround);
  const arrived = await E(page, () => Math.floor(window.__remnant.world.player.x / 16));
  assert.ok(arrived >= 44, `walked west out of the crypt into the cistern's east end (column ${arrived})`);
  await E(page, () => window.__remnant.world.controls.setTouchAxis(1, 0));
  await until(page, () => window.__remnant.world.room.id === 'crypt' && !window.__remnant.world.transitioning);
  await E(page, () => window.__remnant.world.controls.setTouchAxis(0, 0));
  console.log('Loop: the bar lifted from the crypt; crypt ⇄ cistern both ways (and the well leads up to the square)');

  // ---- the square's loft: one jump falls short, the Eagle Plume's second reaches it
  await go(page, 'village_square', 'left');
  await clearFoes(page);
  await E(page, () => { const s = window.__remnant.world.save; s.keyItems = s.keyItems.filter((k) => k !== 'eagle_wings'); });
  await stand(page, 5, 20);
  const low = await leap(page, { twice: true });
  assert.ok(low.row !== 15, `without the Plume the loft stays out of reach (${JSON.stringify(low)})`);
  await E(page, () => { const s = window.__remnant.world.save; s.keyItems.push('eagle_wings'); s.flags.plume = true; });
  await stand(page, 5, 20);
  const high = await leap(page, { twice: true });
  assert.ok(high.row === 15 && high.ground, `with the Plume the second jump reaches the loft (${JSON.stringify(high)})`);
  await page.screenshot({ path: 'qa/pilot-loft.png' });
  console.log(`Loft: one jump landed on row ${low.row}; with the Plume, row ${high.row}`);

  // ---- the road's rooftops: the near one by the second jump, the far one only with a dash as well
  await go(page, 'ashen_road', 'left');
  await clearFoes(page);
  await stand(page, 38, 15);
  const roof = await leap(page, { twice: true });
  assert.ok(roof.row === 10 && roof.ground, `the second jump reaches the rooftop (${JSON.stringify(roof)})`);
  await stand(page, 37, 10);
  const short = await leap(page, { runTo: 41.6 * 16, twice: true });
  assert.ok(!short.over, `two jumps alone never carry over the far roof (${JSON.stringify(short)})`);
  await stand(page, 37, 10);
  const far = await leap(page, { runTo: 41.6 * 16, twice: true, dash: true });
  // Headless frames stretch the dash (game timers run on capped time, the physics on real time), so where it lands
  // proves nothing; being carried over the roof, above it, does.
  assert.ok(far.over, `two jumps and a dash carry over the far roof (${JSON.stringify(far)})`);
  await page.screenshot({ path: 'qa/pilot-roof.png' });
  console.log(`Rooftops: near by the second jump; far: ${JSON.stringify(short)} without the dash, ${JSON.stringify(far)} with it`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser chapter I pilot: all checks passed');
} finally {
  await browser.close();
  close();
}
