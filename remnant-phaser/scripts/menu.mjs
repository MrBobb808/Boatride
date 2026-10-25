// The pause menu in the Phaser build: the original's sectioned menu (its DOM,
// icons, stat tips and stylesheet) over a held world. A stat point raises
// Elior's numbers, a sword from the pack is equipped, a skill is learned, an
// Echo moves to the reserve and into the squad, the keyboard walks it and
// changes tabs, Save and quit returns to the title, and on a phone the pause
// button opens it. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout });

/** A level 8 journey with points to spend, a second sword in the pack and two Echoes. */
const start = async (ctx) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    Object.assign(s, { level: 8, statPoints: 6, skillPoints: 4 });
    const wpn = s.inventory.find((i) => i.uid === s.equipment.weapon);
    s.inventory.push({ uid: 't_sword', id: wpn.id, rarity: 3, plus: 4, affixes: [] });
    for (const sp of ['sentinel', 'archer']) {
      const inst = { uid: 'e_' + sp, species: sp, level: 1, xp: 0, stage: 0, hp: 9999, absorptions: 1 };
      s.echoes.push(inst);
      s.active.push(inst.uid);
    }
    w.refreshStats();
    window.__remnant.warp('ashen_road', 'left');
  });
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  return page;
};
const open = (page) => E(page, () => !!document.querySelector('#ui .menu'));
const click = async (page, k) => { await page.click(`[data-k="${k}"]`); await page.waitForTimeout(60); };

try {
  const page = await start(await browser.newContext({ viewport: { width: 1280, height: 720 } }));

  // ---- Escape opens it over a held world
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu') && window.__remnant.game.scene.getScene('hud').paused);
  const t0 = await E(page, () => window.__remnant.G.time);
  await page.waitForTimeout(400);
  assert.equal(await E(page, () => window.__remnant.G.time), t0, 'the world waits while the menu is up');
  const look = await E(page, () => { const m = document.querySelector('#ui .menu'), r = m.getBoundingClientRect(), cs = getComputedStyle(m); return { w: r.width, h: r.height, bg: cs.backgroundColor, font: cs.fontFamily }; });
  assert.ok(look.w > 600 && look.h > 300 && /Cormorant|Baskerville|Palatino|Georgia/.test(look.font), `the menu wears the original's stylesheet (${JSON.stringify(look)})`);
  await page.screenshot({ path: 'qa/menu-character.png' });
  console.log(`Open: Escape held the world and opened the menu (${Math.round(look.w)}×${Math.round(look.h)})`);

  // ---- Character: a stat point
  const before = await E(page, () => { const w = window.__remnant.world; return { pts: w.save.statPoints, vit: w.save.stats.vit, max: w.player.maxHp }; });
  await click(page, 'st_vit');
  const after = await E(page, () => { const w = window.__remnant.world; return { pts: w.save.statPoints, vit: w.save.stats.vit, max: w.player.maxHp, shown: String(w.save.statPoints) }; });
  assert.ok(after.pts === before.pts - 1 && after.vit === before.vit + 1 && after.max > before.max && after.shown === String(after.pts), `Vitality +1 raised Elior's health (${JSON.stringify({ before, after })})`);
  console.log(`Character: Vitality ${before.vit} → ${after.vit}, health ${before.max} → ${after.max}`);

  // ---- Equipment: the better sword
  await click(page, 'tab_equipment');
  await click(page, 'it_t_sword');
  assert.ok(await E(page, () => !!document.querySelector('[data-k="if_equipped"]')), 'the If-equipped comparison shows');
  const atk0 = await E(page, () => window.__remnant.world.d.atk);
  await click(page, 'equip');
  const eq = await E(page, () => ({ uid: window.__remnant.world.save.equipment.weapon, atk: window.__remnant.world.d.atk }));
  assert.ok(eq.uid === 't_sword' && eq.atk > atk0, `the +4 sword is equipped and Elior hits harder (${atk0.toFixed(1)} → ${eq.atk.toFixed(1)})`);
  await page.screenshot({ path: 'qa/menu-equipment.png' });
  console.log(`Equipment: the +4 sword took attack ${atk0.toFixed(1)} → ${eq.atk.toFixed(1)}`);

  // ---- Skills: learn the first that can be learned
  await click(page, 'tab_skills');
  await click(page, 'skills_training');
  const node = await E(page, () => document.querySelector('.node.avail')?.dataset.k);
  assert.ok(node, 'a skill can be learned');
  await click(page, node);
  const sp0 = await E(page, () => window.__remnant.world.save.skillPoints);
  await click(page, 'learn');
  const learned = await E(page, (id) => ({ pts: window.__remnant.world.save.skillPoints, rank: window.__remnant.world.save.skills[id] ?? 0 }), node.slice(3));
  assert.ok(learned.pts < sp0 && learned.rank > 0, `${node.slice(3)} was learned (${JSON.stringify(learned)})`);
  console.log(`Skills: learned ${node.slice(3)}, points ${sp0} → ${learned.pts}`);

  // ---- Echoes: the Archer steps back, joins the squad pick, and returns
  await click(page, 'sec_echoes');
  await click(page, 'ec_e_archer');
  await click(page, 'ec_act');
  assert.deepEqual(await E(page, () => window.__remnant.world.save.active), ['e_sentinel'], 'the Archer moved to the reserve');
  await click(page, 'ec_squad');
  assert.deepEqual(await E(page, () => window.__remnant.world.save.squadPick), ['e_archer'], 'the Archer is in the squad pick');
  await click(page, 'ec_act');
  assert.deepEqual((await E(page, () => window.__remnant.world.save.active)).sort(), ['e_archer', 'e_sentinel'], 'the Archer is active again');
  await page.screenshot({ path: 'qa/menu-echoes.png' });
  console.log('Echoes: reserve, squad pick and back to active');

  // ---- the keyboard: change tabs, move focus, choose, and Escape resumes
  await page.keyboard.press('KeyE');
  await until(page, () => document.querySelector('.tab.on')?.dataset.k === 'tab_imprints');
  await page.keyboard.press('KeyQ');
  await until(page, () => document.querySelector('.tab.on')?.dataset.k === 'tab_echoes');
  await page.keyboard.press('ArrowDown');
  assert.ok(await E(page, () => !!document.activeElement?.closest('#ui .menu')), 'the arrows move focus through the menu');
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu') && !window.__remnant.game.scene.getScene('hud').paused);
  const t1 = await E(page, () => window.__remnant.G.time);
  await page.waitForTimeout(300);
  assert.ok(await E(page, () => window.__remnant.G.time) > t1, 'the world runs again');
  assert.ok(await E(page, () => JSON.parse(localStorage.getItem('remnant-phaser.save.v2')).equipment.weapon === 't_sword'), 'the choices were saved');
  console.log('Keyboard: E and Q changed tabs, the arrows moved focus, Escape resumed; the choices were saved');

  // ---- Save and quit to title
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu'));
  await click(page, 'sec_settings');
  await click(page, 'tab_system');
  await click(page, 'quit');
  await click(page, 'quit');
  await until(page, () => window.__remnant.game.scene.isActive('title'));
  assert.ok(!(await open(page)), 'the menu closed on the way to the title');
  console.log('System: Save and quit returned to the title');

  // ---- on a phone: the pause button opens it
  const phone = await start(await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await phone.waitForTimeout(300);
  const mb = await E(phone, () => { const r = window.__remnant.game.scene.getScene('hud').menuBtn.getBounds(); return { x: r.centerX / 2, y: r.centerY / 2 }; });
  await phone.touchscreen.tap(mb.x, mb.y);
  await until(phone, () => !!document.querySelector('#ui .menu'));
  const fits = await E(phone, () => { const r = document.querySelector('#ui .menu').getBoundingClientRect(); return r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  assert.ok(fits, 'the menu fits the phone screen');
  await phone.screenshot({ path: 'qa/menu-phone.png' });
  // One tap is one press, never two.
  const pts = await E(phone, () => window.__remnant.world.save.statPoints);
  await phone.tap('[data-k="st_str"]');
  await phone.waitForTimeout(200);
  assert.equal(await E(phone, () => window.__remnant.world.save.statPoints), pts - 1, 'a tap spends one point');
  await phone.tap('[data-k="menu_resume"]');
  await until(phone, () => !document.querySelector('#ui .menu') && !window.__remnant.game.scene.getScene('hud').paused);
  // A release queued beneath the DOM Resume button must not reopen pause.
  await E(phone, () => window.__remnant.game.scene.getScene('hud').menuBtn.emit('pointerup', { id: 1 }));
  assert.ok(!(await open(phone)), 'a release without a new canvas press cannot reopen the menu');
  console.log('Touch: the pause button opened the menu, it fits, a tap spent one point, and Resume closed it');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser menu: all checks passed');
} finally {
  await browser.close();
  close();
}
