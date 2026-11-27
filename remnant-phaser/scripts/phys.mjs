// The game's physics in WebAssembly (src/game/phys.ts, physics/remnant_phys.c): it loads and takes over, the shared
// rules (moveBody, bodyFits, line of sight) give the same answers as the JS on 60 000 random cases, the hero steps
// through it in place of Arcade's tile collider (a wall stops him, a fast body cannot pass through a thin wall, a
// one-way ledge holds him from above and lets him drop through, a body set inside stone is eased out), and in a
// Trial round the shared foes move through it.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => errors.push(e.stack));
const E = (fn, arg) => p.evaluate(fn, arg);
const until = (fn, arg, timeout = 20000) => p.waitForFunction(fn, arg, { timeout });
try {
  await mkdir('qa', { recursive: true });
  await p.goto(base + '?debug&nostory&autostart&fresh&fixedstep');
  await until(() => window.__remnant?.world?.ready && window.__remnant.world.player?.onGround, null, 60000);

  // ---- it loaded and took over
  const state = await E(() => { const ph = window.__remnant.phys, w = window.__remnant.world; return { backend: ph.backend, stepping: ph.stepping, error: ph.error, colliders: w.colliders.length }; });
  assert.deepEqual(state, { backend: 'wasm', stepping: true, error: '', colliders: 0 }, `the WebAssembly core runs the room (${JSON.stringify(state)})`);

  // ---- the same answers as the JS rules
  const par = await E(() => window.__remnant.phys.parity(60000, 11));
  assert.ok(par.ok, `WebAssembly and JS agree (${JSON.stringify(par)})`);
  console.log(`Parity: ${par.moves} moves, ${par.fits} fits and ${par.sights} sightlines, ${par.bad} differences`);

  // A cleared stretch beside the hero: open air above a stone floor, `put` to place tiles (World.setTile writes
  // the grid the core reads and the tiles drawn).
  await E(() => {
    const w = window.__remnant.world, pl = w.player, T = { Empty: 0, Stone: 1, OneWay: 4 };
    const px = Math.floor(pl.x / 16), fr = Math.round(pl.feet / 16);
    window.geo = { px, fr, T };
    window.put = (x, y, t) => w.setTile(px + x, fr + y, t);
    for (let x = -6; x <= 14; x++) { for (let y = -9; y <= -1; y++) window.put(x, y, T.Empty); window.put(x, 0, T.Stone); }
    pl.placeAt(px * 16 + 8, fr * 16, 1);
  });
  await until(() => window.__remnant.world.player.onGround);

  // ---- a wall stops him
  await E(() => { for (let y = -4; y <= -1; y++) window.put(5, y, window.geo.T.Stone); });
  await p.keyboard.down('KeyD');
  await until(() => window.__remnant.world.player.body.blocked.right, null, 10000);
  await p.keyboard.up('KeyD');
  const wall = await E(() => { const b = window.__remnant.world.player.body; return [b.right, (window.geo.px + 5) * 16]; });
  assert.ok(Math.abs(wall[0] - wall[1]) < 0.01, `he stops flush against the wall (${wall})`);
  await E(() => { for (let y = -4; y <= -1; y++) window.put(5, y, window.geo.T.Empty); const { px, fr } = window.geo; window.__remnant.world.player.placeAt(px * 16 + 8, fr * 16, 1); });

  // ---- nothing passes through a thin wall, however fast: a body at 6000 px/s (50 px a step) against one tile
  const fast = await E(async () => {
    const w = window.__remnant.world, ph = window.__remnant.phys, { px, fr, T } = window.geo;
    for (let y = -4; y <= -1; y++) window.put(9, y, T.Stone);
    const rect = w.add.rectangle(px * 16 + 8, fr * 16 - 12, 10, 20, 0xffffff, 0);
    w.physics.add.existing(rect);
    const b = rect.body;
    b.setAllowGravity(false).setVelocityX(6000);
    let hit = false;
    const step = () => { ph.stepBody(b, false); hit ||= b.blocked.right; };
    w.physics.world.on('worldstep', step);
    await new Promise((r) => setTimeout(r, 400));
    w.physics.world.off('worldstep', step);
    const out = { right: b.right, wall: (px + 9) * 16, blocked: hit, vx: b.velocity.x };
    rect.destroy();
    for (let y = -4; y <= -1; y++) window.put(9, y, T.Empty);
    return out;
  });
  assert.ok(fast.blocked && Math.abs(fast.right - fast.wall) < 0.01 && fast.vx === 0, `a body at 6000 px/s stops at a one-tile wall (${JSON.stringify(fast)})`);

  // ---- a one-way ledge: up through it, down onto it, and Down + Jump drops him through
  await E(() => { const { T } = window.geo; for (let x = -2; x <= 2; x++) window.put(x, -3, T.OneWay); });
  await until(() => window.__remnant.world.player.onGround);
  await p.keyboard.down('Space');
  await until(() => !window.__remnant.world.player.onGround);
  await until(() => window.__remnant.world.player.onGround, null, 10000);
  await p.keyboard.up('Space');
  const ledge = await E(() => [window.__remnant.world.player.feet, (window.geo.fr - 3) * 16]);
  assert.ok(Math.abs(ledge[0] - ledge[1]) < 0.01, `he jumped up through the ledge and stands on it (${ledge})`);
  await p.keyboard.down('KeyS'); await p.keyboard.press('Space'); await p.keyboard.up('KeyS');
  await until(() => Math.abs(window.__remnant.world.player.feet - window.geo.fr * 16) < 0.01 && window.__remnant.world.player.onGround, null, 10000);
  await E(() => { const { T } = window.geo; for (let x = -2; x <= 2; x++) window.put(x, -3, T.Empty); });

  // ---- set inside stone, he is eased out
  const eased = await E(async () => {
    const w = window.__remnant.world, ph = window.__remnant.phys, { px, fr, T } = window.geo, pl = w.player;
    window.put(1, -1, T.Stone); window.put(1, -2, T.Stone);
    const before = ph.stats.eased;
    pl.placeAt((px + 1) * 16 + 8, fr * 16 - 4, 1);
    await new Promise((r) => setTimeout(r, 300));
    const b = pl.body, inside = b.right > (px + 1) * 16 && b.left < (px + 2) * 16 && b.bottom > (fr - 2) * 16 && b.top < fr * 16;
    window.put(1, -1, T.Empty); window.put(1, -2, T.Empty);
    return { eased: ph.stats.eased - before, inside };
  });
  assert.ok(eased.eased > 0 && !eased.inside, `a body set inside stone is eased out (${JSON.stringify(eased)})`);
  console.log('Hero: a wall stops him flush; 6000 px/s stops at a one-tile wall; up through a one-way ledge, onto it, and Down + Jump through it; eased out of stone');
  await p.screenshot({ path: 'qa/phys-hero.png' });

  // ---- a Trial round: the shared foes move, look and fit through the core
  await E(() => { const w = window.__remnant.world; Object.assign(w.save.flags, { intro_done: true, relic_taken: true, ch10_intro: true, ch1_done: true, ending_done: true }); w.persist(); });
  await p.goto(base + '?debug&autostart');
  await until(() => window.__remnant?.world?.player && !window.__remnant.G.inCutscene, null, 60000);
  await E(() => { window.__remnant.phys.resetStats(); window.__remnant.G.ui.openMenu('chapters'); });
  await p.waitForSelector('[data-k="tw_1"]');
  await p.click('[data-k="tw_1"]');
  await until(() => window.__remnant.world.classic.story.ch3.rounds.active && window.__remnant.world.room.id === 'trial_arena', null, 60000);
  await until(() => window.__remnant.phys.stats.moves > 200, null, 60000).catch(async (e) => { throw Error(`${e.message} ${await E(() => { const w = window.__remnant.world, r = w.classic.story.ch3.rounds; return JSON.stringify({ stats: window.__remnant.phys.stats, round: r.round, left: r.left, ents: w.classic.ents.length, foes: w.foes().length, room: w.room.id }); })}`); });
  const trial = await E(() => ({ stepping: window.__remnant.phys.stepping, ...window.__remnant.phys.stats }));
  assert.ok(trial.stepping && trial.steps > 0, `the hero steps through the core in the Trial (${JSON.stringify(trial)})`);
  assert.ok(trial.passed <= trial.moves * 0.01, `the shared bodies' moves are the core's, not the JS's (${JSON.stringify(trial)})`);
  console.log(`Trial: ${trial.moves} shared moves, ${trial.los} sightlines and ${trial.steps} hero steps through the core (${trial.passed} passed to JS)`);
  await p.screenshot({ path: 'qa/phys-trial.png' });

  assert.deepEqual(errors, []);
  console.log('phaser physics: all checks passed');
} finally { await browser.close(); await close(); }
