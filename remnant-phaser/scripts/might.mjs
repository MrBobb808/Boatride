// Power that matches the hero (POLISH_PLAN §17): past the level a player leaves a chapter with, its foes and its
// boss grow with the hero (game/might.ts); levels past 70 cost more and more; no light wave rides a plain strike,
// even at level 400; in the Unshorn, Transform pressed twice goes straight in and Dodge is the Cloud Step (behind the
// foe, two clones striking). Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 40000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(e.message + '\n' + errors.join('\n')); });

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // ---- foes and the boss answer the hero
  const look = async (level, room) => {
    await E(page, ({ level, room }) => { const w = window.__remnant.world; w.save.level = level; w.save.flags.ch12_boundary_open = true; w.save.flags.unshorn = true; w.refreshStats(); window.__remnant.warp(room, 'start'); }, { level, room });
    await until(page, (room) => window.__remnant.world.room.id === room && !window.__remnant.world.transitioning, room);
    await page.waitForTimeout(300);
    return E(page, () => { const w = window.__remnant.world, f = w.classic.ents.find((e) => e.isFoe && !e.isBoss && !e.elite && e.kind === 'knight') ?? w.classic.ents.find((e) => e.isFoe && !e.isBoss && !e.elite); return { kind: f?.kind, hp: f?.maxHp ?? 0, dmg: f?.dmg ?? 0, boss: w.cboss?.maxHp ?? 0 }; });
  };
  const at68 = await look(68, 'palace_tents'), at400 = await look(400, 'palace_tents');
  assert.ok(at400.hp > at68.hp * 15 && at400.dmg > at68.dmg * 10, `a ${at68.kind} of the king's host answers a level-400 hero (${JSON.stringify({ at68, at400 })})`);
  const king68 = await look(68, 'palace_between_seas'), king400 = await look(400, 'palace_between_seas');
  assert.ok(king400.boss > king68.boss * 15, `the King of the North answers him too (${king68.boss} → ${king400.boss})`);
  const early = await look(7, 'ashen_road'), early1 = await look(1, 'ashen_road');
  assert.equal(early.hp, early1.hp, 'a straight-through hero in Chapter I meets the foes it was tuned for');
  console.log(`Might: a ${at68.kind} ×${(at400.hp / at68.hp).toFixed(1)} health, ×${(at400.dmg / at68.dmg).toFixed(1)} damage at 400; the king ×${(king400.boss / king68.boss).toFixed(1)}; Chapter I unchanged at 7`);

  // ---- levels cost more past 70
  const levels = await E(page, () => {
    const w = window.__remnant.world, s = w.save, gain = (lv) => { s.level = lv; s.xp = 0; w.giveXp(100000); return s.level - lv; };
    return { at50: gain(50), at400: gain(400) };
  });
  assert.ok(levels.at50 >= 8 && levels.at400 === 0, `the same experience is many levels at 50 and not one at 400 (${JSON.stringify(levels)})`);
  console.log(`Levels: 100k XP is ${levels.at50} levels at 50, ${levels.at400} at 400`);

  // ---- no light wave on a plain strike, even at 400
  await look(400, 'palace_tents');
  await E(page, () => { const w = window.__remnant.world; for (const e of w.classic.ents) if (e.isFoe) e.remove = true; });
  await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
  let waves = 0;
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(110); waves = Math.max(waves, await E(page, () => window.__remnant.world.classic.ents.filter((e) => e.kind === 'lightwave').length)); }
  assert.equal(waves, 0, 'no light wave rides a plain strike');

  // ---- the Unshorn: Transform twice, then the Cloud Step
  await look(68, 'palace_tents');
  await E(page, () => { const w = window.__remnant.world; for (const e of w.classic.ents) if (e.isFoe && e !== w.classic.ents.find((f) => f.isFoe && !f.elite)) e.remove = true; w.save.mantle = 100; });
  await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
  await page.keyboard.press('KeyG'); await page.waitForTimeout(120); await page.keyboard.press('KeyG');
  await until(page, () => window.__remnant.world.player.formT > 0 && window.__remnant.world.player.state !== 'transform');
  const form = await E(page, () => ({ form: window.__remnant.world.player.formT, mantle: window.__remnant.world.player.mantleT }));
  assert.ok(form.form > 14 && form.mantle === 0, `Transform pressed twice goes straight into the Unshorn (${JSON.stringify(form)})`);
  const before = await E(page, () => {
    const w = window.__remnant.world, p = w.player, f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.remove);
    f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; };
    p.placeAt(f.x - 170, f.y, 1); window.__foe = f;
    return { foe: f.x, hero: p.x };
  });
  await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
  await page.keyboard.press('KeyL');
  await until(page, () => window.__foe.hp < 1e8);
  const after = await E(page, () => ({ hero: window.__remnant.world.player.x, dealt: 1e8 - window.__foe.hp }));
  assert.ok(after.hero > before.foe && after.dealt > 0, `the Cloud Step lands him behind the foe and the clones strike (${JSON.stringify({ before, after })})`);
  console.log(`Unshorn: ${Math.round(form.form)} s from a double press; the Cloud Step carried him ${Math.round(after.hero - before.hero)} px, past the foe`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser might: all checks passed');
} finally {
  await browser.close();
  close();
}
