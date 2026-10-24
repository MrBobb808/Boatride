// The Fallen Crowns in the Phaser rebuild. Stepping into the arena wakes the
// boss and shuts the gate; on a phone the boss bar keeps to its own lane beside
// Elior's column; each Crown changes in its second phase (Varkhos calls Hunt
// Shades, Morvane lays Brood Cocoons, Azkar's armor turns blows aside); a real
// parry costs poise, and in Azkar's second phase shatters the armor; the third
// phase opens warded; the defeat sets the flags, opens the gate and pays its
// experience. Chapter VII's commanders and VIII–IX's shrines break the
// boundary. Run after `npm run build`.
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
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const b = await page.evaluate(() => { const w = window.__remnant.world, b = w.boss; return { room: w.room.id, boss: b && { st: b.state, phase: b.phase, hp: b.hp, ward: b.ward }, p: w.player.state }; });
  throw new Error(`${e.message}\n${fn}\n${JSON.stringify(b)}`);
});
const open = async (ctx) => {
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + '?debug&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  // Elior is kept alive: these checks are about the bosses, not about surviving them.
  await E(page, () => { const w = window.__remnant.world; w.save.level = 40; setInterval(() => { const p = window.__remnant.world.player; if (!p.dead) p.hp = p.maxHp; }, 30); });
  return page;
};
const warp = async (page, room) => {
  await E(page, (room) => window.__remnant.warp(room, 'left'), room);
  await until(page, (room) => window.__remnant.world.room.id === room && !window.__remnant.world.transitioning, room);
  await page.waitForTimeout(200);
};
/** Into the arena: the boss wakes, the gate shuts, the fight begins. */
const enter = async (page, room) => {
  await warp(page, room);
  const before = await E(page, () => { const w = window.__remnant.world; return { st: w.boss?.state, gate: w.gateClosed, gates: w.gates.length }; });
  assert.equal(before.st, 'dormant', `${room}: the boss waits`);
  assert.ok(before.gates > 0 && !before.gate, `${room}: the gate stands open`);
  await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id.endsWith('_start')); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
  await until(page, () => window.__remnant.world.boss.state !== 'dormant');
  assert.ok(await E(page, () => window.__remnant.world.gateClosed), `${room}: the gate shuts behind Elior`);
  await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.boss.state));
  // Out of reach while the phases are driven.
  await E(page, () => { const w = window.__remnant.world; w.player.placeAt(w.boss.x - 220, w.boss.floorY, 1); });
};
/** One blow that carries the health to the next phase (the gate clamps it there). */
const toNextPhase = async (page) => {
  const n = await E(page, () => { const b = window.__remnant.world.boss, n = b.phase; b.hit(b.maxHp, 1, 0); return n; });
  await until(page, (n) => { const b = window.__remnant.world.boss; return b.phase === n + 1 && b.state !== 'transition'; }, n);
};
/** A real parry: I pressed, then the boss's blow lands inside the window. */
const parry = async (page) => {
  await E(page, () => { const w = window.__remnant.world, b = w.boss; w.player.placeAt(b.x - 40, b.floorY, 1); b.face = -1; });
  await until(page, () => window.__remnant.world.player.state === 'free');
  await page.keyboard.press('KeyI');
  await until(page, () => window.__remnant.world.player.state === 'parry');
  return E(page, () => {
    const w = window.__remnant.world, b = w.boss, p = w.player, poise = b.poise;
    const hurt = p.hurt({ dmg: 50, dir: -1, src: b });
    return { hurt, poise, after: b.poise, state: b.state, counter: p.counterT > 0, armor: b.armor };
  });
};
const defeat = async (page, key, n) => {
  const before = await E(page, () => ({ lv: window.__remnant.world.save.level, xp: window.__remnant.world.save.xp }));
  await E(page, () => { const b = window.__remnant.world.boss; b.cleanUp(); b.ward = false; b.state = 'idle'; b.hit(b.hp + 10, 1, 0); });
  await until(page, (key) => window.__remnant.world.save.flags[`defeated_${key}`], key);
  const after = await E(page, (n) => { const w = window.__remnant.world; return { done: !!w.save.flags[`ch${n}_done`], gate: w.gateClosed, boss: w.boss, foes: w.foes().length }; }, n);
  assert.ok(after.done && !after.gate && !after.boss, `${key}: the chapter is done and the gate opens (${JSON.stringify(after)})`);
  await until(page, (b) => { const s = window.__remnant.world.save; return s.level > b.lv || s.xp > b.xp; }, before);
};

try {
  // ---- on a phone: the boss bar has its own lane
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await open(ctx);
    await enter(page, 'hunt_throne');
    await page.waitForTimeout(300);
    const { column: c, boss: b } = await E(page, () => window.__remnant.hud);
    assert.ok(b[2] > 0, 'the boss bar shows');
    const overlap = b[0] < c[0] + c[2] && c[0] < b[0] + b[2] && b[1] < c[1] + c[3] && c[1] < b[1] + b[3];
    assert.ok(!overlap, `the boss bar (${b}) keeps clear of Elior's column (${c})`);
    await page.screenshot({ path: 'qa/boss-phone.png' });
    console.log(`Phone: boss bar ${b.map(Math.round)} beside the column ${c.map(Math.round)}`);
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await open(ctx);

  // ---- Varkhos: Hunt Shades, a parry, the Great Hunt
  await enter(page, 'hunt_throne');
  await toNextPhase(page);
  const shades = await E(page, () => window.__remnant.world.boss.adds.filter((a) => a.alive).length);
  assert.ok(shades > 0, 'Varkhos calls his Hunt Shades in the second phase');
  let p = await parry(page);
  assert.ok(!p.hurt && p.after === p.poise - 180 && p.counter, `a parry turns Varkhos aside and costs him poise (${JSON.stringify(p)})`);
  await page.screenshot({ path: 'qa/boss-varkhos.png' });
  await toNextPhase(page);
  let w3 = await E(page, () => { const b = window.__remnant.world.boss, hp = b.hp; return { ward: b.ward, hit: b.hit(100, 1, 0), same: b.hp === hp }; });
  assert.ok(w3.ward && !w3.hit && w3.same, 'the Great Hunt is warded');
  await defeat(page, 'beast_monarch', 7);
  console.log(`Varkhos: ${shades} Hunt Shades, parry -180 poise, warded hunt, defeated`);

  // ---- Morvane: Brood Cocoons heal her
  await enter(page, 'plague_throne');
  await toNextPhase(page);
  const pods = await E(page, () => window.__remnant.world.boss.adds.filter((a) => a.alive && a.pod).length);
  assert.ok(pods > 0, 'Morvane lays Brood Cocoons in the second phase');
  const heal = await E(page, () => { const b = window.__remnant.world.boss; b.hp -= 200; return b.hp; });
  await until(page, (h) => window.__remnant.world.boss.hp > h, heal, 20000);
  await toNextPhase(page);
  w3 = await E(page, () => { const b = window.__remnant.world.boss; return { ward: b.ward, hit: b.hit(100, 1, 0) }; });
  assert.ok(w3.ward && !w3.hit, 'the Great Miasma is warded');
  await page.screenshot({ path: 'qa/boss-morvane.png' });
  await defeat(page, 'plague_monarch', 8);
  console.log(`Morvane: ${pods} cocoons that heal her, warded miasma, defeated`);

  // ---- Azkar: tempered armor, broken by a parry
  await enter(page, 'cinder_throne');
  await toNextPhase(page);
  const armored = await E(page, () => { const b = window.__remnant.world.boss, hp = b.hp; b.hit(100, 1, 0); return { armor: b.armor, took: hp - b.hp }; });
  assert.ok(armored.armor && armored.took === 55, `Azkar's armor turns aside nearly half (${JSON.stringify(armored)})`);
  p = await parry(page);
  assert.ok(!p.hurt && p.state === 'kneel' && !p.armor, `a parry in the second phase shatters the armor (${JSON.stringify(p)})`);
  const kneelHit = await E(page, () => { const b = window.__remnant.world.boss, hp = b.hp; b.hit(100, 1, 0); return hp - b.hp; });
  assert.equal(kneelHit, 150, 'a kneeling Crown takes half again');
  await page.screenshot({ path: 'qa/boss-azkar.png' });
  await until(page, () => window.__remnant.world.boss.state !== 'kneel');
  await toNextPhase(page);
  w3 = await E(page, () => { const b = window.__remnant.world.boss; return { ward: b.ward, armor: b.armor }; });
  assert.ok(w3.ward && !w3.armor, 'the Last Bellows is warded and the armor is gone');
  await defeat(page, 'cinder_monarch', 9);
  console.log(`Azkar: armor took ${armored.took} of 100, parry kneels him, a kneeling blow took ${kneelHit}, defeated`);

  // ---- a broken Crown stays broken
  await warp(page, 'hunt_throne');
  assert.ok(await E(page, () => !window.__remnant.world.boss && !window.__remnant.world.gateClosed), 'a defeated Crown does not return');

  // ---- Chapter VII: the commanders
  const fell = async (room, id) => {
    await warp(page, room);
    await E(page, (id) => { const f = window.__remnant.world.foes().find((f) => f.eliteId === id); f.hit(1e8, 1, 1); }, id);
    await page.waitForTimeout(300);
  };
  await E(page, () => { const f = window.__remnant.world.save.flags; for (const k of Object.keys(f)) if (/^(hunt_|plague_source|cinder_valve|ch\d+_boundary)/.test(k)) delete f[k]; });
  await fell('riftwood_trail', 'fang_warden');
  let flags = await E(page, () => window.__remnant.world.save.flags);
  assert.ok(flags.hunt_fang_warden && !flags.ch7_boundary_open, 'the Fang Warden falls; one commander remains');
  await fell('fang_pits', 'redmaw_alpha');
  flags = await E(page, () => window.__remnant.world.save.flags);
  assert.ok(flags.hunt_redmaw_alpha && flags.ch7_boundary_open, 'both commanders fallen: the Chapter VII boundary opens');
  await warp(page, 'riftwood_trail');
  assert.ok(await E(page, () => !window.__remnant.world.foes().some((f) => f.eliteId === 'fang_warden')), 'a fallen commander stays fallen');

  // ---- Chapter IX: a pressure wheel, guarded until its guard falls
  await warp(page, 'slag_procession');
  const wheel = await E(page, () => { const w = window.__remnant.world, it = w.interactables.find((i) => i.label === 'Release'); w.player.placeAt(it.x, it.y, 1); return it.x; });
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(250);
  assert.ok(!(await E(page, () => window.__remnant.world.save.flags.cinder_valve_a)), 'the wheel will not turn while its guard stands');
  await E(page, (x) => { for (const f of window.__remnant.world.foes()) if (Math.abs(f.x - x) < 190) f.hit(1e8, 1, 1); }, wheel);
  await page.waitForTimeout(300);
  await E(page, (x) => { const w = window.__remnant.world; w.player.placeAt(x, w.player.feet, 1); }, wheel);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyF');
  await until(page, () => window.__remnant.world.save.flags.cinder_valve_a);
  console.log('Objectives: two commanders open Chapter VII; a pressure wheel turns once its guard falls');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('Bosses: all checks passed');
  await ctx.close();
} finally {
  await browser.close();
  close();
}
