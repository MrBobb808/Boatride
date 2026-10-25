// The Phaser rebuild, played in headless Chromium: Elior walks out of a room
// through its doorway, jumps, fights a Veil Husk with real key presses and
// earns its experience, takes a blow, the save survives a reload, the touch
// stick and buttons drive him on a phone, pause opens, and every room in the
// game loads without an error. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
};
const W = (page, fn, arg) => page.evaluate(fn, arg);
const ready = (page) => page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 20000 });
const state = (page) => W(page, () => { const w = window.__remnant.world, p = w.player; return { room: w.room.id, x: p.x, feet: p.feet, vy: p.body.velocity.y, ground: p.onGround, hp: p.hp, st: p.state, xp: w.save.xp, level: w.save.level, kills: w.save.kills }; });

try {
  // ---- keyboard
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(page);
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await ready(page);
  await page.waitForTimeout(600);
  let s = await state(page);
  assert.equal(s.room, 'sanctuary', 'a new journey begins in the sanctuary');
  assert.ok(s.ground, 'Elior stands on the floor');
  await page.screenshot({ path: 'qa/phaser-sanctuary.png' });

  // Jump: up, then down onto the floor again.
  await page.keyboard.down('Space');
  await page.waitForFunction(() => { const p = window.__remnant.world.player; return p.body.velocity.y < 0 && !p.onGround; }, null, { timeout: 8000 });
  s = await state(page);
  assert.ok(s.vy < 0 && !s.ground, `jumping (vy ${s.vy})`);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__remnant.world.player.onGround, null, { timeout: 8000 });
  assert.ok((await state(page)).ground, 'landed');

  // Walk out through the nearest doorway on the right.
  const exit = await W(page, () => { const r = window.__remnant.world.room; return r.exits.filter((e) => e.x > r.w / 2 && !e.cond).sort((a, b) => b.y - a.y)[0]; });
  await W(page, (ex) => { const p = window.__remnant.world.player; p.placeAt((ex.x - 3) * 16, (ex.y + ex.h) * 16, 1); }, exit);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction((to) => window.__remnant.world.room.id === to, exit.to, { timeout: 8000 });
  await page.keyboard.up('ArrowRight');
  await ready(page);
  console.log(`Walked from the sanctuary through its doorway into ${exit.to}`);

  // A Veil Husk on the Ashen Road: strike it until it falls.
  await W(page, () => window.__remnant.warp('ashen_road', 'left'));
  await page.waitForFunction(() => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  await page.waitForTimeout(400);
  const husk = await W(page, () => { const w = window.__remnant.world, f = w.foes().find((f) => f.kind === 'husk'); w.player.placeAt(f.x - 22, f.e.y, 1); return { hp: f.hp }; });
  const before = await state(page);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(110);
    // Keep him whole so the fight is about the blade, and keep him facing it.
    const done = await W(page, () => { const w = window.__remnant.world; w.player.hp = w.player.maxHp; const f = w.foes().find((f) => f.kind === 'husk'); if (f) w.player.face = Math.sign(f.x - w.player.x) || 1; return !f || !f.alive; });
    if (done) break;
  }
  await page.waitForTimeout(400);
  s = await state(page);
  assert.ok(s.kills > before.kills, `the husk fell to Elior's blade (${husk.hp} health)`);
  assert.ok(s.xp > before.xp || s.level > before.level, 'its experience was earned');
  await page.screenshot({ path: 'qa/phaser-fight.png' });
  console.log(`Struck down a Veil Husk (${husk.hp} health) with J presses: +${s.xp - before.xp} xp`);

  // Standing still beside a foe, Elior takes its blow.
  const hurt = await W(page, async () => {
    const w = window.__remnant.world, f = w.foes().find((f) => f.alive);
    if (!f) return null;
    w.player.placeAt(f.x - 14, f.e.y, 1);
    const hp = w.player.hp;
    for (let i = 0; i < 60 && w.player.hp === hp; i++) await new Promise((r) => setTimeout(r, 100));
    return { kind: f.kind, before: hp, after: w.player.hp };
  });
  assert.ok(hurt && hurt.after < hurt.before, `a foe's blow lands: ${JSON.stringify(hurt)}`);
  console.log(`A ${hurt.kind} struck Elior: ${hurt.before} → ${hurt.after}`);

  // Pause opens and closes.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.ok(await W(page, () => window.__remnant.game.scene.getScene('hud').paused), 'paused');
  await page.screenshot({ path: 'qa/phaser-pause.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.ok(!(await W(page, () => window.__remnant.game.scene.getScene('hud').paused)), 'resumed');

  // The save survives a reload.
  await W(page, () => window.__remnant.world.persist());
  const saved = await state(page);
  await page.goto(base + '?debug&nostory&autostart');
  await ready(page);
  s = await state(page);
  assert.equal(s.room, saved.room, 'continued in the same room');
  assert.equal(s.kills, saved.kills, 'the fallen are remembered');

  // Every room in the game builds.
  const rooms = await W(page, async () => {
    const w = window.__remnant.world, bad = [];
    const ids = Object.keys(window.__remnant.rooms ?? {});
    for (const id of ids) {
      try { w.loadRoom(id, 'start'); w.update(0, 16); } catch (e) { bad.push(`${id}: ${e.message}`); }
    }
    return { n: ids.length, bad };
  });
  assert.ok(rooms.n >= 70, `rooms listed (${rooms.n})`);
  assert.deepEqual(rooms.bad, []);
  console.log(`All ${rooms.n} rooms build`);

  // ---- a phone: the floating stick and the buttons
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  watch(phone);
  await phone.goto(base + '?debug&nostory&autostart&fresh');
  await ready(phone);
  await phone.waitForTimeout(500);
  assert.equal(await W(phone, () => window.__remnant.controls.device), 'touch', 'phones start on touch controls');
  const cdp = await ctx.newCDPSession(phone);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const x0 = (await state(phone)).x;
  await touch('touchStart', [[150, 300]]);
  await touch('touchMove', [[220, 300]]);
  await phone.waitForTimeout(700);
  const x1 = (await state(phone)).x;
  assert.ok(x1 > x0 + 20, `the stick walks Elior right (${x0} → ${x1})`);
  // Strike with the stick still held: two thumbs at once.
  const strike = await W(phone, () => { const h = window.__remnant.game.scene.getScene('hud'); const b = h.btns.find((b) => b.a === 'attack'); return [b.x / 2, b.y / 2]; });
  await touch('touchMove', [[220, 300], strike]);
  await phone.waitForTimeout(60);
  assert.equal((await state(phone)).st, 'attack', 'STRIKE swings while the stick is held');
  await touch('touchEnd', []);
  await phone.screenshot({ path: 'qa/phaser-phone.png' });
  console.log(`Phone: the stick walked Elior ${Math.round(x1 - x0)} px and STRIKE swung with both thumbs down`);

  assert.deepEqual(errors, []);
  console.log('phaser smoke: all checks passed');
} finally {
  await browser.close();
  close();
}
