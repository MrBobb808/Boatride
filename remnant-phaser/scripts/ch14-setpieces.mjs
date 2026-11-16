// Chapter XIV's set pieces (remnant/src/game/setpieces14.ts, hostFoes.ts, wired in story14.ts): the riders' wall on the
// dust road, the aftershocks, the brothers' feud, the three new foes of the host and the villagers still in the open.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on('pageerror', (e) => errors.push(e.stack ?? e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const until = (fn, arg, timeout = 30000) => p.waitForFunction(fn, arg, { timeout });
const E = (fn, arg) => p.evaluate(fn, arg);
const SHOTS = process.env.CH14_SHOTS === '1';
const warp = async (room, spawn = 'left') => {
  await E(([r, s]) => window.__remnant.warp(r, s), [room, spawn]);
  await until((r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, room);
};
const byShape = (shape) => `window.__remnant.world.classic.ents.filter((e) => ${shape} && !e.remove)`;

try {
  await p.goto(base + '?debug&nostory&autostart&fresh');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  await E(() => {
    const w = window.__remnant.world, s = w.save;
    Object.assign(s.flags, { intro_done: true, ending_done: true, ch13_done: true, ch13_intro: true, ch14_intro: true, ch14_cloud: true, ch14_herald: true });
    s.level = 88;
    w.persist();
  });
  await p.goto(base + '?debug&autostart');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);

  // ---- the new foes stand in the host's rooms
  const kinds = new Set();
  for (const id of ['olive_terraces', 'alarm_village', 'vineyard_road', 'north_pass', 'host_camp', 'shield_field', 'siege_lines', 'brothers_field', 'gog_ascent']) {
    await warp(id);
    for (const k of await E(() => window.__remnant.world.classic.ents.filter((e) => e.isFoe).map((e) => e.kind))) kinds.add(k);
  }
  for (const k of ['rider', 'standard', 'sapper']) assert.ok(kinds.has(k), `${k} stands in the host`);
  console.log('New foes: rider, standard-bearer and sapper stand in the host');

  // ---- the riders' wall on the dust road
  await warp('dust_road');
  await until(() => window.__remnant.world.classic.ents.some((e) => 'stopX' in e && 'halted' in e), null, 10000);
  const info = await E(() => {
    const w = window.__remnant.world, wall = w.classic.ents.find((e) => 'stopX' in e && 'halted' in e), pl = w.player;
    return { gap: pl.x - wall.x, speed: wall.speed, stopX: wall.stopX };
  });
  assert.ok(info.gap > 150, `the wall starts behind him (${info.gap}px)`);
  assert.ok(info.speed < 142, `the wall is slower than Elior's run (${info.speed})`);
  // Stand in its way: it strikes.
  const hp0 = await E(() => { const w = window.__remnant.world, wall = w.classic.ents.find((e) => 'stopX' in e), pl = w.player; pl.placeAt(wall.x + 160, pl.y, 1); return pl.hp; });
  await until(() => { const w = window.__remnant.world, wall = w.classic.ents.find((e) => 'stopX' in e && 'struck' in e); return !wall || wall.struck > 0; }, null, 20000);
  assert.ok(await E((h) => window.__remnant.world.player.hp < h, hp0), 'the wall hurts what stands in it');
  console.log('Dust road: the wall starts behind, runs slower than Elior and strikes what it catches');
  if (SHOTS) { await p.waitForTimeout(600); await p.screenshot({ path: 'qa/ch14-dust-road.png' }); }

  // Reaching the end halts it; the cave is safe.
  await E(() => { const w = window.__remnant.world, wall = w.classic.ents.find((e) => 'stopX' in e); if (wall) wall.x = wall.stopX - 4; });
  await until(() => { const wall = window.__remnant.world.classic.ents.find((e) => 'stopX' in e); return !wall || wall.halted; }, null, 10000);
  console.log('Dust road: it pulls up at the cave road');

  // ---- the aftershocks
  await E(() => { window.__remnant.world.save.flags.ch14_shaken = true; });
  await warp('steep_places');
  await until(() => window.__remnant.world.classic.ents.some((e) => 'tremors' in e), null, 10000);
  await E(() => { window.__remnant.world.classic.ents.find((e) => 'tremors' in e).shake(); });
  await until(() => window.__remnant.world.classic.ents.find((e) => 'tremors' in e).stones > 0, null, 20000);
  console.log('Aftershocks: the ground trembles and stones come down');
  if (SHOTS) await p.screenshot({ path: 'qa/ch14-aftershock.png' });

  // ---- the brothers' feud
  await warp('brothers_field');
  await until(() => window.__remnant.world.classic.ents.some((e) => 'traded' in e), null, 10000);
  await until(() => window.__remnant.world.classic.ents.find((e) => 'traded' in e).traded > 0, null, 30000);
  console.log('Brothers\' field: the host strikes at itself');

  // ---- the villagers
  await warp('olive_terraces');
  const rescued = await E(async () => {
    const w = window.__remnant.world, G = window.__remnant.G;
    const n = w.classic.ents.find((e) => e.kind === 'hannah');
    if (!n) return 'no hannah';
    // A foe beside her: she hides, and stays unrescued.
    const foe = w.classic.ents.find((e) => e.isFoe && !e.isBoss);
    foe.x = n.x + 40; foe.y = n.y;
    G.world.story.talk(n);
    return 'asked';
  });
  assert.equal(rescued, 'asked');
  for (let i = 0; i < 40 && await p.locator('.dialogue:visible').count() === 0; i++) await p.waitForTimeout(100);
  for (let i = 0; i < 60 && await p.locator('.dialogue:visible').count(); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
  assert.ok(await E(() => !window.__remnant.world.save.flags.ch14_rescued_hannah), 'a villager with a foe beside her is not rescued yet');
  await E(() => { const w = window.__remnant.world; for (const e of w.classic.ents) if (e.isFoe && !e.isBoss) e.remove = true; });
  await E(() => { const w = window.__remnant.world; w.classic.ents.find((e) => e.kind === 'hannah' && !e.remove); window.__remnant.G.world.story.talk(w.classic.ents.find((e) => e.kind === 'hannah')); });
  await until(() => window.__remnant.world.save.flags.ch14_rescued_hannah || document.querySelector('.dialogue'), null, 10000);
  for (let i = 0; i < 80 && !(await E(() => window.__remnant.world.save.flags.ch14_rescued_hannah)); i++) {
    if (await p.locator('.dialogue:visible').count()) await p.keyboard.press('Enter');
    await p.waitForTimeout(120);
  }
  assert.ok(await E(() => window.__remnant.world.save.flags.ch14_rescued_hannah), 'with the way clear she is sent to the cave');
  assert.ok(await E(() => !!window.__remnant.world.save.quests.s_villagers), 'the villagers\' quest begins');
  await E(() => { const w = window.__remnant.world; w.player.hp = w.player.maxHp; });
  // She is waiting in the cave with the others once the story has them there.
  await warp('refuge_cave');
  assert.ok(await E(() => window.__remnant.world.classic.ents.some((e) => e.kind === 'hannah')), 'Hannah waits in the cave of refuge');
  console.log('Villagers: hidden while a foe is near, sent to the cave when the way is clear');

  assert.deepEqual(errors, []);
  console.log('Chapter XIV set pieces: passed');
} finally {
  await browser.close();
  await close();
}
