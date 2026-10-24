// The original game's bosses, from the Gilded Idol to the Prince of Grecia,
// running in the Phaser build through the classic layer. Each one wakes at its
// arena trigger and shuts the gate, takes Elior's real blows, goes through its
// three phases and falls; its defeat sets the flags that open the way and the
// gate opens. A classic boss's blow hurts Elior and his parry turns it aside;
// the Locust King hatches only after his brood's two waves fall to Elior's
// blows; on a phone the boss bar keeps clear of Elior's column; a beaten boss
// stays beaten. Run after `npm run build`.
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
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const s = await page.evaluate(() => { const w = window.__remnant.world, b = w.cboss; return { room: w.room.id, boss: b && { st: b.state, phase: b.phase, hp: b.hp, inv: b.invuln }, p: w.player.state }; });
  throw new Error(`${e.message}\n${fn}\n${JSON.stringify(s)}`);
});
const ROOMS = { idol: 'idol_sanctum', gatekeeper: 'tower_gate', marshal: 'marshal_throne', locust_king: 'brood_chamber', golden_image: 'image_base', weigher: 'hall_of_scales', storm_prince: 'storm_ziggurat', persia_prince: 'prince_throne', grecia_prince: 'grecia_throne' };
const FLAGS = { idol: 'idol_defeated', gatekeeper: 'gate_open', marshal: 'marshal_raised', locust_king: 'ch3_king_done', golden_image: 'ch4_image_done', weigher: 'ch5_weigher_done', storm_prince: 'ch6_storm_done', persia_prince: 'ch6_prince_done', grecia_prince: 'ch10_done' };

const open = async (ctx) => {
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + '?debug&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  return page;
};
/** Keep Elior standing (the checks are about the bosses, not about surviving them). */
const godMode = (page, on) => E(page, (on) => {
  clearInterval(window.__god);
  if (on) window.__god = setInterval(() => { const p = window.__remnant.world.player; if (p && !p.dead) p.hp = p.maxHp; }, 30);
}, on);
const warp = async (page, room, flags = {}) => {
  await E(page, ([room, flags]) => {
    const w = window.__remnant.world;
    w.save.level = 30;
    w.save.defeated = [];
    for (const f of Object.keys(w.save.flags)) delete w.save.flags[f];
    Object.assign(w.save.flags, { ch10_boundary_open: true, brood_cleared: true }, flags);
    window.__remnant.warp(room, 'start');
  }, [room, flags]);
  await until(page, (room) => window.__remnant.world.room.id === room && !window.__remnant.world.transitioning, room);
};
/** Step into the arena: the boss wakes, the gate shuts. */
const enter = async (page, k) => {
  const before = await E(page, () => ({ st: window.__remnant.world.cboss?.state, gate: window.__remnant.world.gateClosed }));
  assert.ok(before.st === 'dormant' && !before.gate, `${k}: the boss waits and the gate stands open (${JSON.stringify(before)})`);
  await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id.endsWith('_start')); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
  await until(page, () => window.__remnant.world.gateClosed);
};
const fighting = (page) => until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state));

try {
  // ---- on a phone: the classic boss's bar has its own lane
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await open(ctx);
    await godMode(page, true);
    await warp(page, ROOMS.idol);
    await enter(page, 'idol');
    await fighting(page);
    await page.waitForTimeout(400);
    const { column: c, boss: b } = await E(page, () => window.__remnant.hud);
    assert.ok(b[2] > 0, 'the boss bar shows');
    assert.ok(!(b[0] < c[0] + c[2] && c[0] < b[0] + b[2] && b[1] < c[1] + c[3] && c[1] < b[1] + b[3]), `the boss bar (${b}) keeps clear of Elior's column (${c})`);
    await page.screenshot({ path: 'qa/classic-phone.png' });
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await open(ctx);

  // ---- the Gatekeeper: its bite hurts Elior, his parry turns it, his blade cuts it
  await warp(page, ROOMS.gatekeeper);
  await enter(page, 'gatekeeper');
  await fighting(page);
  // Out of reach and vulnerable, so the one blow measured is the one sent.
  await E(page, () => { const w = window.__remnant.world; w.player.placeAt(Math.max(40, w.cboss.x - 260), w.cboss.y, 1); });
  await until(page, () => { const p = window.__remnant.world.player; return p.state === 'free' && p.vulnerable; });
  const hurt = await E(page, () => {
    const w = window.__remnant.world, p = w.player, hp = p.hp;
    const took = w.classic.playerView.takeHit({ dmg: 30, poise: 20, kx: -120, ky: -80, dir: -1, kind: 'melee', src: w.cboss });
    return { took, lost: hp - p.hp, dr: w.d.dr };
  });
  assert.ok(hurt.took && hurt.lost === Math.max(1, Math.round(30 * (1 - hurt.dr))), `a classic blow hurts Elior through his armour (${JSON.stringify(hurt)})`);
  await godMode(page, true);
  // Out of the hound's reach, and past the last bite's invulnerability, so only the parry decides.
  await E(page, () => { const w = window.__remnant.world; w.player.placeAt(Math.max(40, w.cboss.x - 260), w.cboss.y, 1); });
  await until(page, () => { const p = window.__remnant.world.player; return p.state === 'free' && p.vulnerable; });
  await page.keyboard.press('KeyI');
  await until(page, () => window.__remnant.world.player.state === 'parry');
  const parried = await E(page, () => {
    const w = window.__remnant.world, hp = w.player.hp;
    const took = w.classic.playerView.takeHit({ dmg: 30, poise: 20, kx: -120, ky: -80, dir: -1, kind: 'melee', src: w.cboss });
    return { took, same: w.player.hp === hp, counter: w.player.counterT > 0 };
  });
  assert.ok(!parried.took && parried.same && parried.counter, `a parry turns the Gatekeeper's bite (${JSON.stringify(parried)})`);
  const hp0 = await E(page, () => window.__remnant.world.cboss.hp);
  for (let i = 0; i < 5; i++) {
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; w.player.placeAt(b.x - 34, b.y, 1); });
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(350);
  }
  const hp1 = await E(page, () => window.__remnant.world.cboss.hp);
  assert.ok(hp1 < hp0, `Elior's blade cuts the Gatekeeper (${hp0} → ${hp1})`);
  await page.screenshot({ path: 'qa/classic-gatekeeper.png' });
  console.log(`Gatekeeper: a bite took ${hurt.lost}, a parry turned the next, five strikes took ${hp0 - hp1}`);

  // ---- the brood: two waves, then the King hatches
  await warp(page, ROOMS.locust_king, { brood_cleared: false });
  await enter(page, 'locust_king');
  for (let wave = 1; wave <= 2; wave++) {
    await until(page, () => window.__remnant.world.classic.ents.some((e) => e.isFoe && !e.isBoss && !e.dying));
    const n = await E(page, () => window.__remnant.world.classic.ents.filter((e) => e.isFoe && !e.isBoss && !e.dying).length);
    // Felled through the same path as Elior's sword.
    await until(page, () => {
      const w = window.__remnant.world;
      for (const f of w.foes()) if (f.alive && f !== w.boss && !(f.e && f.e.isBoss)) f.hit(1e6, 1, 1);
      return !w.classic.ents.some((e) => e.isFoe && !e.isBoss && !e.dying && !e.remove);
    });
    console.log(`Brood: wave ${wave} of ${n} fell`);
  }
  await until(page, () => window.__remnant.world.save.flags.king_hatched && window.__remnant.world.cboss.state !== 'dormant');
  console.log('Brood: both waves down, the Locust King hatched');

  // ---- every boss: three phases, then the fall opens the way
  for (const [k, room] of Object.entries(ROOMS)) {
    await warp(page, room);
    await enter(page, k);
    await fighting(page);
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; w.player.placeAt(Math.max(40, b.x - 160), b.y, 1); });
    const phases = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const r = await E(page, (k) => {
        const w = window.__remnant.world, b = w.cboss;
        if (w.save.flags[`defeated_${k}`]) return { done: true };
        if (['idle', 'attack', 'kneel'].includes(b.state) && b.invuln <= 0 && !b.dying) b.takeHit({ dmg: b.maxHp * 0.2, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee' });
        return { ph: b.phase };
      }, k);
      if (r.done) break;
      phases.add(r.ph);
      await page.waitForTimeout(400);
    }
    const res = await E(page, ([k, f]) => { const w = window.__remnant.world; return { def: !!w.save.flags[`defeated_${k}`], flag: !!w.save.flags[f], gate: w.gateClosed, cut: window.__remnant.G.inCutscene, inSave: w.save.defeated.includes(k) }; }, [k, FLAGS[k]]);
    assert.ok(phases.has(1) && phases.has(2) && phases.has(3), `${k}: three phases (${[...phases]})`);
    assert.ok(res.def && res.flag && res.inSave && !res.gate && !res.cut, `${k}: its fall opens the way (${JSON.stringify(res)})`);
    console.log(`${k}: phases ${[...phases].join('')}, fell in ${Math.round((Date.now() - t0) / 1000)} s, ${FLAGS[k]} set, gate open`);
  }

  // ---- a beaten boss stays beaten
  await E(page, () => { window.__remnant.world.save.defeated = ['idol']; window.__remnant.warp('idol_sanctum', 'start'); });
  await until(page, () => window.__remnant.world.room.id === 'idol_sanctum' && !window.__remnant.world.transitioning);
  assert.ok(await E(page, () => !window.__remnant.world.cboss && !window.__remnant.world.classic.ents.length), 'a beaten boss does not return');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('Classic bosses: all checks passed');
  await ctx.close();
} finally {
  await browser.close();
  close();
}
