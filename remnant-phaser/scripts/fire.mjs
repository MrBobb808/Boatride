// The Refiner's Fire (src/game/fire.ts; NEXT_PLAN.md C1). Replay on the Chapters page first offers the Fire: with
// nothing chosen it is the ordinary replay; each condition adds heat (tougher and fiercer foes and bosses, Balm sealed);
// the chapter's last boss falling under it seals the chapter at that heat, each tier of seal pays once (a legendary
// piece from the second), the Chapters page shows the seal, and the Fire goes out when the replay ends.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&autostart&fresh');
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  const drain = async (done, max = 30000) => { const end = Date.now() + max; while (Date.now() < end && !(await E(page, done))) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); } };
  const calm = () => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene && !window.__remnant.world.transitioning;
  await drain(calm, 40000); await page.waitForTimeout(500); await drain(calm);
  // A journey that finished Chapter VII and broke Varkhos.
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    s.level = 60; (s.defeated ??= []).push('beast_monarch');
    Object.assign(s.flags, { ending_done: true, relic_taken: true, ch6_done: true, ch7_intro: true, ch7_done: true, ch7_boundary_open: true, defeated_beast_monarch: true });
    w.refreshStats();
  });

  // ---- the offer: nothing chosen is an ordinary replay; conditions add heat
  const open = async () => { await E(page, () => window.__remnant.G.ui.openMenu('chapters')); await page.click('[data-k=ch_replay_7]'); await page.waitForSelector('[data-k=fire_go]'); };
  const enter = async () => {
    await page.click('[data-k=fire_go]');
    await page.waitForFunction(() => window.__remnant.world.save.replay === 7 && !window.__remnant.world.transitioning);
    await drain(calm);
    await E(page, () => window.__remnant.warp('hunt_throne', 'start'));
    await page.waitForFunction(() => window.__remnant.world.room.id === 'hunt_throne' && !window.__remnant.world.transitioning);
    await page.waitForTimeout(500);
  };
  const fell = async () => {
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'beast_monarch_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await drain(() => ['idle', 'attack'].includes(window.__remnant.world.boss?.state));
    await E(page, () => { const w = window.__remnant.world, b = w.boss; window.__god = setInterval(() => { if (!w.player.dead) w.player.hp = w.player.maxHp; }, 30); b.hp = 1; b.hit(99, 1, 0, false); });
    // The fall is reported when his death has played out (slow when headless): wait for that, not a count of seconds.
    await page.waitForFunction(() => !window.__remnant.world.boss, null, { timeout: 120000 });
    await drain(calm);
    await E(page, () => clearInterval(window.__god));
  };
  await open();
  assert.equal(await E(page, () => document.querySelector('[data-k=fire_go]').textContent), 'Replay', 'with nothing chosen it is an ordinary replay');
  await enter();
  const plain = await E(page, () => { const w = window.__remnant.world; return { hp: w.boss.maxHp, dmg: w.boss.dmg ?? 0, fasting: w.fasting, knight: w.classic.ents.find((e) => e.isFoe && !e.isBoss)?.maxHp ?? 0 }; });
  await fell();
  assert.equal(await E(page, () => window.__remnant.world.save.fire?.seals?.[7] ?? 0), 0, 'an ordinary replay seals nothing');

  // ---- heat 2: tougher and fiercer; the seal and its pay, once
  await open();
  await page.click('[data-k=fire_tough]'); await page.click('[data-k=fire_fierce]');
  await page.waitForFunction(() => /Heat 2 · Refined I/.test(document.querySelector('[data-k=fire_sum]').textContent));
  await page.screenshot({ path: 'qa/fire-choose.png' });
  await enter();
  const hot = await E(page, () => { const w = window.__remnant.world; return { hp: w.boss.maxHp, fasting: w.fasting, silver: w.save.silver, frags: w.save.materials?.covenant_fragment ?? 0 }; });
  assert.ok(Math.abs(hot.hp / plain.hp - 1.4) < 0.02 && !hot.fasting, `Tried Metal gives the boss 40% more health (${plain.hp} → ${hot.hp})`);
  await fell();
  const one = await E(page, (b) => { const s = window.__remnant.world.save; return { seal: s.fire.seals[7], silver: s.silver - b.silver, frags: (s.materials?.covenant_fragment ?? 0) - b.frags }; }, hot);
  assert.ok(one.seal === 2 && one.silver >= 2800 && one.frags >= 2, `his fall under heat 2 seals the chapter and pays (${JSON.stringify(one)})`);
  assert.equal(await E(page, () => window.__remnant.world.save.flags.fire_clears), 1, 'the Day counts a chapter finished under the Fire');
  await E(page, () => window.__remnant.G.ui.openMenu('chapters'));
  assert.ok(await E(page, () => /Refined I/.test(document.querySelector('[data-k=ch_7]').closest('.ch-row').textContent)), 'the Chapters page shows the seal');
  await page.click('[data-k=ch_replay_7]'); await page.waitForSelector('[data-k=fire_go]');
  assert.ok(await E(page, () => document.querySelector('[data-k=fire_tough]').textContent.startsWith('✓')), 'the last choice is remembered');
  // The same heat again pays nothing more.
  await enter();
  await fell();
  const again = await E(page, () => window.__remnant.world.lastRefined);
  assert.ok(again && again.tier === 1 && !again.first && again.gifts.length === 0, `the same seal is not paid twice (${JSON.stringify(again)})`);

  // ---- full heat: Balm is sealed, the numbers stack, and the third seal pays a legendary piece
  await open();
  await page.click('[data-k=fire_fasting]'); await page.click('[data-k=fire_sevenfold]');
  await page.waitForFunction(() => /Heat 6 · Refined III/.test(document.querySelector('[data-k=fire_sum]').textContent));
  await enter();
  const full = await E(page, () => { const w = window.__remnant.world, s = w.save; const balm = s.balm; s.balm = Math.max(1, s.balm); const b0 = s.balm; w.player.startHeal(); return { hp: w.boss.maxHp, fasting: w.fasting, balmKept: s.balm === b0, inv: s.inventory.length }; });
  assert.ok(Math.abs(full.hp / plain.hp - 1.4 * 1.3) < 0.03 && full.fasting, `at full heat the boss has ×1.82 health and Balm is sealed (${JSON.stringify(full)})`);
  await fell();
  const three = await E(page, (b) => { const s = window.__remnant.world.save; return { seal: s.fire.seals[7], legend: s.inventory.slice(b.inv).filter((i) => i.legend).length }; }, full);
  assert.ok(three.seal === 6 && three.legend >= 2, `seals II and III each pay a legendary piece (${JSON.stringify(three)})`);

  // ---- the fire goes out with the replay
  await E(page, () => window.__remnant.warp('sanctuary', 'start'));
  await page.waitForFunction(() => window.__remnant.world.room.id === 'sanctuary' && !window.__remnant.world.transitioning);
  assert.ok(await E(page, () => !window.__remnant.world.fasting && window.__remnant.world.save.replay === undefined), 'leaving the chapter ends the replay and the Fire');
  console.log(`Fire: heat 2 gave Varkhos ${hot.hp} health against ${plain.hp} and sealed Refined I for ${one.silver} silver; heat 6 sealed Balm, gave ${full.hp}, and paid ${three.legend} legendary pieces`);

  // ---- take heart (NEXT_PLAN E2): three falls to one boss, and help is offered once; taken, that boss is lighter
  const throne = async () => { await E(page, () => window.__remnant.warp('plague_throne', 'start')); await page.waitForFunction(() => window.__remnant.world.room.id === 'plague_throne' && !window.__remnant.world.transitioning && window.__remnant.world.boss); await page.waitForTimeout(300); return E(page, () => window.__remnant.world.boss.maxHp); };
  const hard = await throne();
  await E(page, () => { const w = window.__remnant.world; w.classic.bossActive = true; w.fellToBoss(); w.fellToBoss(); });
  assert.ok(await E(page, () => !document.querySelector('[data-k=heart]')), 'two falls offer nothing');
  await E(page, () => { const w = window.__remnant.world; w.fellToBoss(); w.classic.bossActive = false; });
  await page.waitForSelector('[data-k=heart_yes]', { timeout: 60000 });
  await page.screenshot({ path: 'qa/heart.png' });
  await page.click('[data-k=heart_yes]');
  await E(page, () => window.__remnant.warp('sanctuary', 'start'));
  await page.waitForFunction(() => window.__remnant.world.room.id === 'sanctuary' && !window.__remnant.world.transitioning);
  const light = await throne();
  assert.ok(Math.abs(light / hard - 0.9) < 0.01, `having taken heart, Morvane has 10% less health (${hard} → ${light})`);
  const other = await E(page, () => { const w = window.__remnant.world; w.classic.bossActive = true; w.fellToBoss(); w.classic.bossActive = false; return w.save.flags.heart_plague_monarch; });
  await page.waitForTimeout(400);
  assert.ok(other === 'yes' && await E(page, () => !document.querySelector('[data-k=heart]')), 'the offer is made once');
  console.log(`Take heart: offered after three falls; taken, Morvane stands at ${light} health against ${hard}`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser fire: all checks passed');
} finally {
  await browser.close();
  close();
}
