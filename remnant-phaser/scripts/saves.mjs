// The Phaser build's save is the original's SaveData. A save from the port's
// first parts is carried over (level and its points, flags, beaten bosses,
// purified Echoes); a live game slot is brought over from the title, copied and
// never changed; Elior's stats come from his stats and gear as in the original;
// and a chest gives the original's loot. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const inWorld = (page) => page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 20000 });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

  // ---- a save from parts 1–5 carries over
  await page.goto(base + '?debug');
  await E(page, () => {
    localStorage.clear();
    localStorage.setItem('remnant-phaser.save.v1', JSON.stringify({ v: 1, room: 'ashen_road', spawn: 'left', level: 5, xp: 40, hp: 80, silver: 321, flags: { ch1_done: true }, kills: 9, ce: 20, balm: 2, balmMax: 3, defeated: ['idol'], purified: ['knight'] }));
  });
  await page.goto(base + '?debug&autostart');
  await inWorld(page);
  const v1 = await E(page, () => { const s = window.__remnant.world.save; return { room: s.room, level: s.level, pts: s.statPoints, skill: s.skillPoints, silver: s.silver, flag: s.flags.ch1_done, def: s.defeated, echoes: s.echoes.map((e) => e.species), weapon: !!s.equipment.weapon }; });
  assert.deepEqual([v1.room, v1.level, v1.pts, v1.skill, v1.silver, v1.flag], ['ashen_road', 5, 12, 4, 321, true], `the old journey carries over (${JSON.stringify(v1)})`);
  assert.ok(v1.def.includes('idol') && v1.echoes.includes('knight') && v1.weapon, `with its beaten bosses, its Echo and the original's starting gear (${JSON.stringify(v1)})`);
  await E(page, () => window.__remnant.world.persist());
  assert.ok(await E(page, () => JSON.parse(localStorage.getItem('remnant-phaser.save.v2')).level === 5), 'saved in the new format');
  console.log(`Old save: level 5 with 12 stat points, a knight Echo and the Idol beaten, now in the original's format`);

  // ---- Elior's stats come from his stats and gear
  const gear = await E(page, () => {
    const w = window.__remnant.world, s = w.save, before = { atk: w.d.atk, hp: w.d.maxHp, maxHp: w.player.maxHp };
    s.stats.vit += 5;
    const wpn = s.equipment.weapon;
    delete s.equipment.weapon;
    w.refreshStats();
    const after = { atk: w.d.atk, hp: w.d.maxHp };
    s.equipment.weapon = wpn;
    s.stats.vit -= 5;
    w.refreshStats();
    return { before, after };
  });
  assert.equal(gear.before.maxHp, gear.before.hp, 'Elior\'s health is the original\'s derived health');
  assert.ok(gear.after.hp > gear.before.hp && gear.after.atk < gear.before.atk, `Vitality raises health, and the sword is his attack (${JSON.stringify(gear)})`);
  console.log(`Stats: +5 Vitality took health ${gear.before.hp} → ${gear.after.hp}; without the sword, attack ${gear.before.atk.toFixed(1)} → ${gear.after.atk.toFixed(1)}`);

  // ---- a chest gives the original's loot
  const chest = await E(page, () => Object.values(window.__remnant.rooms).flatMap((r) => r.ents.filter((e) => e.t === 'chest' && e.loot.some((l) => l.item)).map((e) => ({ room: r.id, id: e.id, x: e.x, y: e.y })))[0]);
  await E(page, (c) => window.__remnant.warp(c.room, 'start'), chest);
  await page.waitForFunction((c) => window.__remnant.world.room.id === c.room && !window.__remnant.world.transitioning, chest);
  const before = await E(page, () => window.__remnant.world.save.inventory.length);
  await E(page, (c) => { const w = window.__remnant.world; for (const f of w.classic.ents) f.remove = true; w.player.placeAt(c.x * 16 + 8, c.y * 16, 1); }, chest);
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyF');
  await page.waitForFunction((n) => window.__remnant.world.save.inventory.length > n, before, { timeout: 5000 });
  assert.ok(await E(page, (c) => window.__remnant.world.save.opened.includes(c.id), chest), 'the chest stays open');
  console.log(`Chest: ${chest.id} gave an item into the pack and stays open`);

  // ---- a live slot comes over from the title, and the live slot is untouched
  const live = await E(page, () => {
    const s = JSON.parse(JSON.stringify(window.__remnant.world.save));
    Object.assign(s, { level: 12, room: 'kiln_yard', spawn: 'start', silver: 4242 });
    const raw = JSON.stringify(s);
    localStorage.setItem('remnant-save-1', raw);
    return raw;
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => window.__remnant?.game?.scene.isActive('title'));
  const btn = () => E(page, () => {
    const t = window.__remnant.game.scene.getScene('title').children.list.find((o) => o.getData?.('k') === 'title_live_0');
    return t && { x: t.x / devicePixelRatio, y: t.y / devicePixelRatio, text: t.text };
  });
  let b = await btn();
  assert.ok(b && /live slot 2 · level 12/.test(b.text), `the title offers the live slot (${b?.text})`);
  await page.mouse.click(b.x, b.y);
  b = await btn();
  assert.ok(/Tap again/.test(b.text), 'replacing a Phaser journey asks for a second tap');
  await page.screenshot({ path: 'qa/saves-title.png' });
  await page.mouse.click(b.x, b.y);
  await inWorld(page);
  const got = await E(page, () => { const s = window.__remnant.world.save; return { level: s.level, room: s.room, silver: s.silver }; });
  assert.deepEqual(got, { level: 12, room: 'kiln_yard', silver: 4242 }, 'the live journey continues here');
  assert.equal(await E(page, () => localStorage.getItem('remnant-save-1')), live, 'the live slot is left exactly as it was');
  console.log('Import: live slot 2 (level 12, Kiln Yard) came over on a second tap; the live slot is unchanged');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser saves: all checks passed');
} finally {
  await browser.close();
  close();
}
