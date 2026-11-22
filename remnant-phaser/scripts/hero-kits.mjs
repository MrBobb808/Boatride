// Uri and Barak each keep their own kit (game/heroKit.ts, PhaserSave.kits): a level that starts at the journey's, stat
// and skill points, a tree of eighteen nodes and gear of their own, with Character, Equipment and Skill tree pages
// in the pause menu. Points raise only that hero, gear worn by one is never worn by another, the menu opens on the
// hero in play's pages, his tree reaches his moves (Barak's Long Leap: Chain Lightning finds one more foe), and it
// all survives a reload.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(`${e.message}\n${fn}\n${errors.join('\n')}`); });
const click = async (page, k) => { await page.click(`[data-k="${k}"]`); await page.waitForTimeout(60); };
try {
  await mkdir('qa', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.ready);
  await E(page, () => { const w = window.__remnant.world; Object.assign(w.save.flags, { intro_done: true, ending_done: true, relic_taken: true }); w.save.level = 12; w.persist(); });
  await page.goto(base + '?debug&nostory&autostart');
  await until(page, () => window.__remnant?.world?.ready && window.__remnant.world.canUseKit);

  // ---- Barak's kit begins at the journey's level, apart from Elior's
  const start = await E(page, () => { const w = window.__remnant.world, p = w.player; p.switchCd = 0; p.switchHero('barak'); const k = w.save.kits.barak; return [p.hero, k.level, w.save.level, Object.keys(k.equipment).length > 0 || Object.keys(w.save.equipment).length === 0]; });
  assert.deepEqual(start.slice(0, 3), ['barak', 12, 12], `Barak's kit starts at Elior's level (${start})`);
  // XP while he fights is his: Elior's level stays where it was.
  const xp = await E(page, () => { const w = window.__remnant.world, k = w.save.kits.barak; w.giveXp(5000); return [k.level, w.save.level]; });
  assert.ok(xp[0] > 12 && xp[1] >= 12, `Barak levels from his own fights (${xp})`);

  // ---- the menu opens on his section; a stat point, gear and a node are his alone
  await E(page, () => { const w = window.__remnant.world, k = w.save.kits.barak; k.statPoints = 3; k.skillPoints = 6; w.save.inventory.push({ uid: 'bk_ring', id: 'ring_of_vigil', rarity: 2, plus: 0, affixes: [], isNew: true }); });
  await page.keyboard.press('Escape');
  await until(page, () => document.querySelector('.tab.on')?.dataset.k === 'tab_bk_character');
  const str0 = await E(page, () => [window.__remnant.world.save.kits.barak.stats.str, window.__remnant.world.save.stats.str]);
  const atk0 = await E(page, () => window.__remnant.world.d.atk);
  await click(page, 'bk_st_str');
  const str1 = await E(page, () => [window.__remnant.world.save.kits.barak.stats.str, window.__remnant.world.save.stats.str]);
  assert.deepEqual(str1, [str0[0] + 1, str0[1]], `a point raised Barak's Strength and not Elior's (${str0} → ${str1})`);
  assert.ok(await E(page, (a) => window.__remnant.world.d.atk > a, atk0), 'and his attack grew');
  await page.screenshot({ path: 'qa/kit-barak-character.png' });
  await click(page, 'tab_bk_equipment');
  const slot = 'ring';
  await click(page, `bk_slot_${slot}`);
  await click(page, 'bk_it_bk_ring');
  await click(page, 'bk_equip');
  assert.equal(await E(page, (sl) => window.__remnant.world.save.kits.barak.equipment[sl], slot), 'bk_ring', 'the ring is his');
  assert.ok(await E(page, () => !Object.values(window.__remnant.world.save.equipment).includes('bk_ring')), "it never lands in Elior's slots");
  await page.screenshot({ path: 'qa/kit-barak-equipment.png' });
  await click(page, 'tab_bk_skills');
  for (const id of ['b_spark', 'b_leap']) { await click(page, `bk_sk_${id}`); await click(page, 'bk_learn'); }
  assert.deepEqual(await E(page, () => [window.__remnant.world.save.kits.barak.skills.b_spark, window.__remnant.world.save.kits.barak.skills.b_leap]), [1, 1], 'Charged Hands and Long Leap learned');
  await page.screenshot({ path: 'qa/kit-barak-skills.png' });
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu'));

  // ---- Long Leap reaches his lightning: Chain Lightning finds a fourth foe
  await until(page, () => window.__remnant.world.player.state === 'free' && window.__remnant.world.player.onGround);
  await E(page, () => {
    const w = window.__remnant.world, p = w.player;
    p.face = 1; window.kitHits = [];
    const foe = (dx) => { const x = p.x + dx; return { x, box: { centerX: x, centerY: p.feet - 25, left: x - 2, right: x + 2, top: p.feet - 28, bottom: p.feet, width: 4, height: 28 }, alive: true, removed: false, hit() { window.kitHits.push(dx); return true; } }; };
    const foes = [28, 96, 164, 232].map(foe);
    w.foes = () => foes; w.heroHit = () => {};
  });
  await page.keyboard.press('KeyK');
  await until(page, () => window.kitHits.length > 0);
  await until(page, () => window.__remnant.world.player.state === 'free');
  const leaps = await E(page, () => window.kitHits.slice());
  assert.deepEqual(leaps, [28, 96, 164, 232], `Long Leap: Chain Lightning leaps to four (${leaps})`);
  await E(page, () => { const w = window.__remnant.world; delete w.foes; delete w.heroHit; });

  // ---- Uri's section is his own, and its tree too
  await E(page, () => { const w = window.__remnant.world, p = w.player; p.switchCd = 0; p.switchHero('uri'); const k = w.save.kits.uri; k.skillPoints = 2; });
  await page.keyboard.press('Escape');
  // The menu keeps the kind of page last open: Barak's Skill tree opens Uri's.
  await until(page, () => document.querySelector('.tab.on')?.dataset.k === 'tab_ur_skills');
  await click(page, 'ur_sk_u_flame'); await click(page, 'ur_learn');
  assert.equal(await E(page, () => window.__remnant.world.save.kits.uri.skills.u_flame), 1, "Uri's Kindled Hand learned");
  assert.equal(await E(page, () => window.__remnant.world.save.kits.barak.skills.u_flame), undefined, "it is not Barak's");
  await page.screenshot({ path: 'qa/kit-uri-skills.png' });
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu'));

  // ---- all of it is kept
  await E(page, () => window.__remnant.world.persist());
  await page.reload();
  await until(page, () => window.__remnant?.world?.ready);
  const kept = await E(page, () => { const k = window.__remnant.world.save.kits; return [k.barak.skills.b_leap, k.uri.skills.u_flame, Object.values(k.barak.equipment).includes('bk_ring'), k.barak.level > 12]; });
  assert.deepEqual(kept, [1, 1, true, true], `the kits survive a reload (${kept})`);
  assert.deepEqual(errors, []);
  console.log(`hero kits: Barak from level 12 to ${xp[0]} on his own, a point, a ring and Long Leap (Chain Lightning ×4); Uri's tree his own; saved`);
} finally { await browser.close(); await close(); }
