// The Horde (POLISH_PLAN §13): held upright, the stick walks the hero, the buttons dash, cast, transform and switch
// (Elior, Tirzah, then Uri with his orc shaman);
// the weapons strike on their own; a level-up offers three cards; the monarch arrives, falls, and the stage is
// cleared; sideways, the controls reflow on screen; a fall banks the run into the save; the journey and the title
// both lead in.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });
const E = (page, fn, arg) => page.evaluate(fn, arg);
const H = (page, fn) => page.evaluate(`(${fn})(window.__remnant.horde)`);
/** Take every level-up card that has come up, so a timed check is not waiting on a paused field. */
async function drain(page) {
  for (let i = 0; i < 150; i++) {
    if (!await page.evaluate(() => document.querySelectorAll('.hz-card').length)) return;
    await page.locator('.hz-card').first().click();
    await page.waitForTimeout(120);
  }
}

try {
  await mkdir('qa', { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?debug&horde');
  await until(page, () => window.__remnant?.horde?.hero?.sprite, null, 60000);
  await page.waitForTimeout(800);

  // ---- held upright: the stick walks the hero; the dash button dashes
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const x0 = await H(page, (h) => h.hero.x);
  await touch('touchStart', [[110, 640]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[110 + i * 12, 640]]); await page.waitForTimeout(40); }
  await page.waitForTimeout(700);
  const walked = (await H(page, (h) => h.hero.x)) - x0;
  const spots = await H(page, (h) => h.ui.spots);
  const x1 = await H(page, (h) => h.hero.x);
  await touch('touchMove', [[182, 640], [spots.dash.x, spots.dash.y]]);
  await page.waitForTimeout(120);
  const dashed = await H(page, (h) => h.cds.dash > 0);
  const blinked = (await H(page, (h) => h.hero.x)) - x1;
  await touch('touchEnd', []);
  assert.ok(walked > 25, `the stick walks the hero right (${walked.toFixed(1)} px)`);
  assert.ok(dashed && blinked > 60, `the dash button blinks the hero ahead while the stick is held (${blinked.toFixed(0)} px)`);
  for (const [k, s] of Object.entries(spots)) assert.ok(s.x - s.r >= 0 && s.x + s.r <= 390 && s.y - s.r >= 0 && s.y + s.r <= 844, `${k} is on screen upright`);
  console.log(`Upright: the stick walked ${walked.toFixed(0)} px; DASH blinked ${blinked.toFixed(0)} px with the stick held; every button on screen`);

  // ---- the weapons strike on their own
  await until(page, () => window.__remnant.horde.kills >= 2, null, 45000);
  console.log(`Auto-weapons: ${await H(page, (h) => h.kills)} foes fell with no attack pressed`);

  // ---- Elior's cuts turn into a Phantom chain: he blinks foe to foe, and the last cut is an impact frame
  await H(page, (h) => { for (let i = 0; i < 6; i++) h.spawnFoe(h.hero.x + 40 + i * 22, h.hero.y + (i % 2 ? 18 : -18), 'bulwark'); });
  await until(page, () => window.__remnant.horde.arsenal.phantoms > 0, null, 30000);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'qa/horde-phantom.png' });
  console.log('Phantom chain: Elior blinked from foe to foe within his fourth cut');

  // ---- a level-up offers three cards; a tap takes one
  await drain(page);
  await H(page, (h) => h.collect('gem', h.xpNext - h.xp + 0.5));
  await until(page, () => document.querySelectorAll('.hz-card').length === 3);
  const offer = await H(page, (h) => h.offer);
  assert.equal(new Set(offer).size, 3, 'three different upgrades');
  await page.screenshot({ path: 'qa/horde-levelup.png' });
  const before = await H(page, (h) => [...h.arsenal.lv.values()].reduce((a, b) => a + b, 0) + Object.values(h.passives).reduce((a, b) => a + b, 0));
  await page.locator('.hz-card').first().tap();
  await until(page, () => !window.__remnant.horde.overlay);
  const after = await H(page, (h) => [...h.arsenal.lv.values()].reduce((a, b) => a + b, 0) + Object.values(h.passives).reduce((a, b) => a + b, 0));
  assert.ok(after === before + 1 || offer[0] === 'Rest' || offer[0] === 'Silver', 'the chosen upgrade is taken');
  console.log(`Level-up: ${offer.join(' · ')}; tapped "${offer[0]}"`);

  // ---- the skill, the transformation, the switch (buttons)
  // A button tap clears any level-up card first, or the tap would land on the card.
  const tap = async (k) => { await drain(page); const s = (await H(page, (h) => h.ui.spots))[k]; await page.touchscreen.tap(s.x, s.y); await page.waitForTimeout(150); };
  await tap('skill');
  assert.ok(await H(page, (h) => h.cds.skill > 0), 'STORM casts');
  await H(page, (h) => { h.gauge = 1; });
  await tap('form');
  assert.ok(await H(page, (h) => h.formT > 0 && h.hero.key.endsWith('-mantle')), 'MANTLE transforms Elior');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa/horde-mantle.png' });
  await tap('switch');
  assert.equal(await H(page, (h) => [h.heroId, h.formT > 0]).then((v) => v.join()), 'tirzah,false', 'the switch brings Tirzah in (and ends the form)');
  await drain(page);
  // The field may be cleared by now (upright, new foes enter well beyond bow range): one stands close.
  await H(page, (h) => { h.spawnFoe(h.hero.x + 90, h.hero.y, 'bulwark'); });
  await until(page, () => window.__remnant.horde.arsenal.missiles.some((m) => m.t >= 0), null, 15000);
  console.log('Buttons: STORM cast, MANTLE transformed Elior, the switch brought Tirzah, and her bow looses on its own');

  // ---- Uri: the third press of the switch; his shaman at his side; his prayer; the Crown merges the two
  await drain(page);
  await H(page, (h) => { h.cds.switch = 0; });
  await tap('switch');
  assert.deepEqual(await H(page, (h) => [h.heroId, h.shaman.active, h.hero.key]), ['uri', true, 'painted-uri'], 'the switch brings Uri, and his shaman with him');
  await drain(page);
  await H(page, (h) => { h.spawnFoe(h.hero.x + 90, h.hero.y, 'bulwark'); });
  await until(page, () => window.__remnant.horde.arsenal.missiles.some((m) => m.t >= 0 && m.kind === 'fireball'), null, 15000);
  await drain(page);
  await tap('skill');
  assert.ok(await H(page, (h) => h.cds.skill > 0), 'FIRE prays down fire from heaven');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa/horde-uri.png' });
  await drain(page);
  await H(page, (h) => { h.gauge = 1; });
  await tap('form');
  assert.deepEqual(await H(page, (h) => [h.formT > 0, h.hero.key, h.shaman.active]), [true, 'painted-uri-crown', false], 'the Crown of Flame merges Uri and the shaman');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa/horde-crown.png' });
  await H(page, (h) => { h.formT = 0.01; });
  await drain(page);
  await until(page, () => window.__remnant.horde.shaman.active && !window.__remnant.horde.hero.form);
  console.log('Uri: his fireballs fly on their own, the shaman stands at his side, FIRE prays fire down, and the Crown of Flame makes the two one until it fades');

  // ---- the monarch: it comes at the stage's end, falls, and the stage is cleared
  // The monarch's fight and the stage after it are about the stage's flow, not the hero's health: no blow lands until the fall below.
  await H(page, (h) => { h.stageT = 9999; h.hp = h.maxHp; h.hurtHero = () => {}; });
  await until(page, () => window.__remnant.horde.boss);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa/horde-boss.png' });
  const boss = await H(page, (h) => h.boss.name);
  await H(page, (h) => { h.boss.hp = 1; h.boss.x = h.hero.x + 30; h.boss.y = h.hero.y; });
  for (let i = 0; i < 40; i++) {
    if (await E(page, () => !!document.querySelector('[data-k=hz_next]'))) break;
    if (await E(page, () => document.querySelectorAll('.hz-card').length)) await page.locator('.hz-card').first().tap();
    await page.waitForTimeout(400);
  }
  assert.ok(await E(page, () => !!document.querySelector('[data-k=hz_next]')), `${boss} falls and the stage is cleared`);
  assert.ok(await H(page, (h) => !h.boss && h.loot.length === 1), 'the monarch leaves gear');
  await page.locator('[data-k=hz_next]').tap();
  await until(page, () => window.__remnant.horde.stage === 2);
  // The gems the monarch's fall gathered may bring level-ups: take them.
  for (let i = 0; i < 20 && await H(page, (h) => !!h.overlay); i++) { await drain(page); await page.waitForTimeout(300); }
  assert.ok(await H(page, (h) => !h.overlay), `stage 2 plays (${await H(page, (h) => JSON.stringify({ dead: h.dead, cards: document.querySelectorAll('.hz-card').length, keys: [...document.querySelectorAll('[data-horde] [data-k]')].map((b) => b.dataset.k) }))})`);
  console.log(`${boss}: arrived when the stage ran out, fell, left gear; onward to stage 2 (${await H(page, (h) => h.biome.name)})`);

  // ---- sideways: everything reflows onto the screen
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const side = await H(page, (h) => h.ui.spots);
  for (const [k, s] of Object.entries(side)) assert.ok(s.x - s.r >= 0 && s.x + s.r <= 844 && s.y - s.r >= 0 && s.y + s.r <= 390, `${k} is on screen sideways`);
  await page.screenshot({ path: 'qa/horde-landscape.png' });
  console.log('Sideways: the buttons reflow inside the screen');

  // ---- a fall banks the run: silver, XP, gear and the record go into the save
  const saved = await H(page, (h) => ({ silver: h.save.silver, inv: h.save.inventory.length, level: h.save.level, xp: h.save.xp, run: h.silver, uri: { ...(h.save.uri ?? { level: 1, xp: 0 }) } }));
  for (let i = 0; i < 10 && await E(page, () => document.querySelectorAll('.hz-card').length); i++) { await page.locator('.hz-card').first().click(); await page.waitForTimeout(250); }
  await H(page, (h) => { delete h.hurtHero; h.invuln = 0; h.hurtHero(1e9); });
  await until(page, () => document.querySelector('[data-k=hz_return]'));
  // The run's silver as banked (coins still flying in after the snapshot above count too).
  const banked = await H(page, (h) => ({ silver: h.save.silver, inv: h.save.inventory.length, level: h.save.level, xp: h.save.xp, rec: h.save.horde, uri: h.save.uri, run: h.silver }));
  assert.equal(banked.silver, saved.silver + banked.run, 'the run\'s silver is banked');
  assert.equal(banked.inv, saved.inv + 1, 'the monarch\'s gear is in the pack');
  assert.ok(banked.level > saved.level || banked.xp > saved.xp, 'the journey earns XP');
  assert.equal(banked.rec.best, 2, 'the deepest stage is recorded');
  assert.ok(banked.uri.level > saved.uri.level || banked.uri.xp > saved.uri.xp, 'Uri earns XP of his own');
  await page.screenshot({ path: 'qa/horde-end.png' });
  await page.locator('[data-k=hz_return]').click();
  await until(page, () => window.__remnant?.world?.player);
  assert.equal(await E(page, () => window.__remnant.world.save.horde.best), 2, 'the journey loads with the record');
  console.log(`Fall: ${banked.run} silver, the gear and the XP banked (Uri level ${banked.uri.level}); best stage 2 recorded; back on the journey`);

  // ---- the ways in: the pause menu's Game modes and the title
  await E(page, () => window.__remnant.world.enterHorde());
  await until(page, () => window.__remnant?.horde?.hero?.sprite && window.__remnant.game.scene.isActive('horde'));
  const t2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t2.on('pageerror', (e) => errors.push(e.message));
  await t2.goto(base + '?debug');
  await t2.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
  const label = await t2.evaluate(() => window.__remnant.game.scene.getScene('title').children.list.find((c) => c.getData?.('k') === 'title_horde')?.text);
  assert.ok(label?.startsWith('The Horde'), `the title offers the Horde (${label})`);
  console.log(`Ways in: the journey enters the Horde; the title offers "${label}"`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser horde: all checks passed');
} catch (e) {
  console.error(e);
  console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}
