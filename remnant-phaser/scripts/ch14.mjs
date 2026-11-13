// Chapter XIV, the Day of Gog (remnant/src/game/rooms14.ts, story14.ts, render/env14.ts): its twenty-four rooms load,
// are dressed and joined door to door both ways; the host holds the fighting rooms; and the story runs from the end of
// Chapter XIII through the opening, the cloud out of the north, the herald, the cave of refuge, the three fights of
// the host, the hail and fire on the mountain, Hamongog, the threshold and the river to the chapter's end card.
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

/** Click through dialogue, choices and scripture cards until `done` holds. */
async function drain(done, arg, max = 90000) {
  const end = Date.now() + max;
  while (Date.now() < end) {
    if (errors.length) throw Error(errors.join('\n'));
    if (await p.evaluate(done, arg)) return;
    const choice = p.locator('.dialogue .choices button:visible');
    if (await choice.count()) await choice.first().click();
    else if (await p.locator('.dialogue:visible').count()) await p.keyboard.press('Enter');
    else if (await p.locator('.lore-card:visible button').count()) await p.locator('.lore-card button').last().click();
    await p.waitForTimeout(150);
  }
  throw Error('Chapter XIV stalled: ' + await p.evaluate(() => JSON.stringify({ room: window.__remnant.world.room.id, cutscene: window.__remnant.G.inCutscene, flags: Object.keys(window.__remnant.world.save.flags).filter((k) => k.startsWith('ch14')), ui: document.getElementById('ui').innerText.slice(-400) })));
}

/** Stand Elior in a trigger of the current room. */
const enter = (id) => E((id) => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === id); if (!t) throw Error('no trigger ' + id); w.player.placeAt(t.r.centerX, t.r.bottom, 1); }, id);
const warp = async (room, spawn = 'left') => {
  await E(([r, s]) => window.__remnant.warp(r, s), [room, spawn]);
  await until((r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, room);
};

try {
  // ---- the rooms
  await p.goto(base + '?debug&nostory&autostart&fresh');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  const rooms = await E(() => {
    const w = window.__remnant.world, R = window.__remnant.rooms ?? null;
    const ids = ['gog_hub', 'olive_terraces', 'watch_hill', 'alarm_village', 'vineyard_road', 'refuge_cave', 'north_pass', 'host_camp', 'shield_field', 'ford_of_host', 'princes_tents', 'siege_lines', 'engine_hill', 'fallen_walls', 'steep_places', 'rent_valley', 'brothers_field', 'gog_ascent', 'gog_mountain', 'hamongog', 'temple_threshold', 'river_measure', 'river_trees', 'healed_sea'];
    return ids.map((id) => {
      w.loadRoom(id, ['gog_hub'].includes(id) ? 'start' : 'left');
      const r = w.room;
      return {
        id, biome: r.biome, w: r.w, foes: w.classic.ents.filter((e) => e.isFoe && !e.isBoss).length,
        decor: r.ents.filter((e) => e.t === 'decor').length, exits: r.exits.map((x) => [x.to, x.spawn, !!x.cond]), spawns: Object.keys(r.spawns),
        chapter: window.__remnant.chapterOf?.(id) ?? null,
      };
    });
  });
  assert.equal(rooms.length, 24, 'twenty-four rooms');
  const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
  for (const r of rooms) {
    assert.ok(['unwalled', 'host', 'shaking', 'river'].includes(r.biome), `${r.id} is in one of the chapter's four lands (${r.biome})`);
    for (const [to, spawn] of r.exits) {
      assert.ok(byId[to], `${r.id} leads to a room of the chapter (${to})`);
      assert.ok(byId[to].spawns.includes(spawn), `${to} has the spawn ${r.id} sends Elior to (${spawn})`);
      assert.ok(byId[to].exits.some(([back]) => back === r.id), `${to} leads back to ${r.id}`);
    }
  }
  const fighting = rooms.filter((r) => ['olive_terraces', 'watch_hill', 'alarm_village', 'vineyard_road', 'north_pass', 'host_camp', 'shield_field', 'ford_of_host', 'siege_lines', 'fallen_walls', 'steep_places', 'rent_valley', 'brothers_field', 'gog_ascent'].includes(r.id));
  for (const r of fighting) assert.ok(r.foes >= 5, `${r.id} holds the host (${r.foes} foes)`);
  for (const r of rooms) if (!['princes_tents', 'engine_hill', 'gog_mountain'].includes(r.id)) assert.ok(r.decor >= 4, `${r.id} is dressed (${r.decor} props)`);
  for (const id of ['princes_tents', 'engine_hill', 'gog_mountain']) assert.ok(byId[id].exits.some(([, , cond]) => cond), `${id} stays shut until its fight is won`);
  console.log(`Rooms: 24 in four lands, ${rooms.reduce((n, r) => n + r.foes, 0)} foes, ${rooms.reduce((n, r) => n + r.decor, 0)} props, every door joined both ways`);
  if (SHOTS) for (const id of ['gog_hub', 'alarm_village', 'host_camp', 'ford_of_host', 'fallen_walls', 'gog_ascent', 'hamongog', 'river_measure', 'healed_sea']) {
    await E((id) => window.__remnant.world.loadRoom(id, id === 'gog_hub' ? 'start' : 'left'), id);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `qa/ch14-${id}.png` });
  }

  // ---- the story, from the end of Chapter XIII
  await E(() => {
    const w = window.__remnant.world, s = w.save;
    Object.assign(s.flags, { intro_done: true, ending_done: true, ch13_done: true, ch13_intro: true });
    s.level = 88;
    w.persist();
  });
  await p.goto(base + '?debug&autostart');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  await E(() => { const w = window.__remnant.world; window.__god = setInterval(() => { const pl = w.player; if (pl && !pl.dead) pl.hp = pl.maxHp; }, 30); });
  await warp('gog_hub', 'start');
  await drain(() => window.__remnant.world.save.flags.ch14_intro && !window.__remnant.G.inCutscene && window.__remnant.world.save.quests.m_gog?.stage === 0);
  console.log('Opening: the banner, Ezekiel 38:2 and the quest');

  await warp('watch_hill');
  await enter('gog_cloud');
  await drain(() => window.__remnant.world.save.flags.ch14_cloud && !window.__remnant.G.inCutscene);
  await warp('alarm_village');
  await enter('gog_herald');
  await drain(() => window.__remnant.world.save.flags.ch14_herald && !window.__remnant.G.inCutscene);
  assert.ok(await E(() => !window.__remnant.world.classic.ents.some((e) => e.kind === 'gogherald' && !e.remove)), 'the herald goes back to his host');
  await warp('refuge_cave');
  await drain(() => window.__remnant.world.save.flags.ch14_refuge && !window.__remnant.G.inCutscene && window.__remnant.world.save.quests.m_gog?.stage === 3);
  console.log('Act I: the cloud, the herald, the cave of refuge');

  // The three fights: the gate shuts, waves come, the captains last; the way on opens when they are down.
  const xpBefore = await E(() => window.__remnant.world.save.xp + window.__remnant.world.save.level * 1e9);
  for (const [room, trigger, flag, item] of [['princes_tents', 'princes_start', 'ch14_princes_done', 'bucklers_of_meshech'], ['engine_hill', 'engine_start', 'ch14_engine_done', null], ['gog_mountain', 'gog_start', 'ch14_gog_done', 'hailstone_maul']]) {
    await warp(room);
    assert.ok(await E(() => !window.__remnant.world.room.exits.find((x) => x.cond && x.x > 2) || !window.__remnant.world.save.flags[window.__remnant.world.room.exits.find((x) => x.cond).cond]), `${room} is shut`);
    await enter(trigger);
    let waves = 0;
    const end = Date.now() + 120000;
    while (!(await E((f) => window.__remnant.world.save.flags[f], flag))) {
      if (Date.now() > end) throw Error(`${room}: the fight did not end`);
      if (errors.length) throw Error(errors.join('\n'));
      const n = await E(() => {
        const w = window.__remnant.world;
        const foes = w.classic.ents.filter((e) => e.isFoe && !e.isBoss && !e.dying && !e.remove);
        for (const f of foes) f.takeHit({ dmg: 1e9, poise: 999, kx: 0, ky: 0, dir: 1, kind: 'ability', guardBreak: true, src: w.classic.player });
        return foes.length;
      });
      if (n) waves++;
      const choice = p.locator('.dialogue .choices button:visible');
      if (await choice.count()) await choice.first().click();
      else if (await p.locator('.dialogue:visible').count()) await p.keyboard.press('Enter');
      else if (await p.locator('.lore-card:visible button').count()) await p.locator('.lore-card button').last().click();
      await p.waitForTimeout(250);
    }
    await drain(() => !window.__remnant.G.inCutscene);
    assert.ok(waves >= 3, `${room}: the host came in waves (${waves} rounds struck)`);
    if (item) assert.ok(await E((id) => window.__remnant.world.save.inventory.some((i) => i.id === id), item), `${room} rewards ${item}`);
    assert.ok(await E(() => !window.__remnant.world.classic.gateClosed && !window.__remnant.world.classic.bossActive), `${room}: the gate opens again`);
  }
  assert.ok(await E(() => !window.__remnant.world.save.flags.ch14_hail), 'the hail stops when it has done its work');
  assert.ok(await E((b) => window.__remnant.world.save.xp + window.__remnant.world.save.level * 1e9 > b, xpBefore), 'the fights pay experience');
  assert.equal(await E(() => window.__remnant.world.save.quests.m_gog?.stage), 6, 'the host is fallen: on to Hamongog');
  console.log('Act II–III: the princes\' tents, the engine of the north and the mountain of Gog, ended by hail and fire');

  await warp('hamongog');
  await drain(() => window.__remnant.world.save.flags.ch14_hamongog && !window.__remnant.G.inCutscene);
  await warp('temple_threshold');
  await enter('threshold');
  await drain(() => window.__remnant.world.save.flags.ch14_threshold && !window.__remnant.G.inCutscene && window.__remnant.world.save.quests.m_gog?.stage === 7);
  await warp('healed_sea');
  await enter('river_end');
  await until(() => document.querySelector('.chapter h2')?.textContent === 'THE DAY OF GOG', null, 90000).catch(async () => {
    await drain(() => document.querySelector('.chapter h2')?.textContent === 'THE DAY OF GOG');
  });
  await p.keyboard.press('Escape');
  await until(() => window.__remnant.world.save.flags.ch14_done && window.__remnant.world.save.quests.m_gog?.done);
  assert.ok(await E(() => ['line_of_the_measurer', 'leaf_for_medicine'].every((id) => window.__remnant.world.save.inventory.some((i) => i.id === id))), 'the river\'s gifts');
  console.log('Act IV–V: Hamongog, the threshold, the river and the chapter card');
  assert.deepEqual(errors, []);
  console.log('Chapter XIV: passed');
} finally {
  await browser.close();
  await close();
}
