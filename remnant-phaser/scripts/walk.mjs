// A walk through the whole game by machine (NEXT_PLAN A5): for every room of every chapter, Elior steps through each of
// its doors the way a player does (the world's own exit check), and the walk fails on any page error, any door that
// does not lead anywhere, any arrival inside the ground or in free fall, and any room that cannot be left. It finds
// the softlocks no single-feature test looks for. Long: run nightly (.github/workflows/walk-nightly.yml), not on every
// push. WALK_ONLY=<prefix> limits it to rooms whose id starts with it; WALK_MAX caps the rooms (for a quick look).
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const p = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
p.on('pageerror', (e) => errors.push(e.stack ?? e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const E = (fn, arg) => p.evaluate(fn, arg);
const until = (fn, arg, timeout = 8000) => p.waitForFunction(fn, arg, { timeout });
const problems = [];
const bad = (room, what) => problems.push(`${room}: ${what}`);

try {
  await p.goto(base + '?debug&nostory&autostart&fresh');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  await E(() => { const w = window.__remnant.world; window.__god = setInterval(() => { const pl = w.player; if (pl && !pl.dead) pl.hp = pl.maxHp; }, 30); });
  const only = process.env.WALK_ONLY ?? '', max = Number(process.env.WALK_MAX ?? 1e9);
  const ids = (await E(() => Object.keys(window.__remnant.rooms))).filter((id) => id.startsWith(only)).slice(0, max);
  let doors = 0, arrived = 0;

  const settle = async (room) => {
    // The landing: on the ground, inside the room, alive.
    try { await until(() => { const w = window.__remnant.world, pl = w.player; return !w.transitioning && pl && pl.onGround; }, null, 6000); }
    catch { bad(room, 'the hero never lands on the ground after arriving'); return false; }
    const s = await E(() => { const w = window.__remnant.world, pl = w.player; return { x: pl.x, feet: pl.feet, gw: w.gw * 16, gh: w.gh * 16, dead: pl.dead }; });
    if (s.dead || s.x < 0 || s.x > s.gw || s.feet > s.gh) { bad(room, `arrival out of bounds (${JSON.stringify(s)})`); return false; }
    return true;
  };

  for (const id of ids) {
    await E(([r]) => window.__remnant.warp(r, Object.keys(window.__remnant.rooms[r].spawns)[0]), [id]);
    try { await until((r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, id); } catch { bad(id, 'the room does not load'); continue; }
    if (!(await settle(id))) continue;
    const exits = await E(([r]) => window.__remnant.rooms[r].exits.map((x) => ({ to: x.to, spawn: x.spawn, cond: x.cond ?? null, ok: !!window.__remnant.rooms[x.to] })), [id]);
    // The Trial's arena has no door: it is left from the menu.
    if (!exits.length) { if (id !== 'trial_arena') bad(id, 'no door at all: it cannot be left'); continue; }
    for (let i = 0; i < exits.length; i++) {
      const ex = exits[i];
      doors++;
      if (!ex.ok) { bad(id, `door ${i} leads to a room that does not exist (${ex.to})`); continue; }
      const dest = await E(([t]) => Object.keys(window.__remnant.rooms[t].spawns), [ex.to]);
      if (!dest.includes(ex.spawn)) { bad(id, `door ${i} sends Elior to a spawn ${ex.to} does not have (${ex.spawn})`); continue; }
      // Stand in the doorway; the story's gates are opened first.
      await E(([r, k, cond]) => {
        const w = window.__remnant.world;
        if (w.room.id !== r) window.__remnant.warp(r, Object.keys(window.__remnant.rooms[r].spawns)[0]);
        if (cond) w.save.flags[cond.startsWith('!') ? cond.slice(1) : cond] = !cond.startsWith('!');
      }, [id, i, ex.cond]);
      await until((r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, id).catch(() => {});
      await E(([k]) => {
        const w = window.__remnant.world, x = w.room.exits[k], pl = w.player;
        pl.placeAt((x.x + x.w / 2) * 16, (x.y + x.h) * 16, 1);
      }, [i]);
      try { await until(([to]) => window.__remnant.world.room.id === to, [ex.to], 6000); }
      catch { bad(id, `door ${i} (to ${ex.to}) does not open when Elior stands in it`); continue; }
      arrived++;
      await settle(`${id} → ${ex.to}`);
    }
    if (errors.length) { bad(id, 'page error: ' + errors.join(' | ').slice(0, 300)); errors.length = 0; }
  }
  console.log(`Walk: ${ids.length} rooms, ${doors} doors tried, ${arrived} crossed`);
  assert.deepEqual(problems, [], `${problems.length} problem(s):\n  ` + problems.join('\n  '));
  console.log('Whole-game walk: passed');
} finally {
  await browser.close();
  await close();
}
