// The Watch, the idle game inside the game (POLISH_PLAN §18): the title offers it; costs grow by their curves; Elior
// fights on his own and every kill pays; coins buy upgrades that open the next ones; ten foes to a stage and a gate's
// boss on a timer (lose it and he holds back until Challenged); levels open his skills, his shadows and the Mantle;
// away, the wall pays half its recent rate (eight hours at most) on a welcome card; a gate's first fall pays the
// journey silver (and a cape at Gate 10); the Ascension trades a run for Seals; and all of it survives a reload.
// Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);

try {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  const enter = async () => {
    await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
    await page.click('[data-k=title_watch]');
    await page.waitForFunction(() => window.__remnant?.watch?.w, null, { timeout: 30000 });
  };
  await page.goto(base + '?debug');
  await enter();

  // ---- a fresh Elior, and the curves
  const fresh = await E(page, () => { const w = window.__remnant.watch.w; return { level: w.level, stage: w.stage, coins: w.coins }; });
  assert.deepEqual(fresh, { level: 1, stage: 1, coins: 0 }, 'a fresh Elior starts the Watch at level 1');
  const curve = await E(page, () => { const sc = window.__remnant.watch; sc.w.coins = 1000; const a = sc.buy('attack', 10); const crit = sc.buy('crit', 1); return { a, lvl: sc.w.up.attack, left: sc.w.coins, crit }; });
  assert.ok(curve.a && curve.lvl === 10 && curve.left === 1000 - 139 && !curve.crit, `ten Attack levels cost their geometric sum, and Critical Chance waits for Health 40 (${JSON.stringify(curve)})`);

  // ---- he fights on his own, kills pay, stages pass, levels come
  const fight = await E(page, () => {
    const sc = window.__remnant.watch;
    for (let i = 0; i < 30 * 150; i++) { sc.tick(1 / 30); if (i % 30 === 0) for (const id of ['attack', 'health', 'speed']) sc.buy(id, 0); }
    return { stage: sc.w.stage, level: sc.w.level, best: sc.w.best };
  });
  assert.ok(fight.stage >= 4 && fight.level >= 3, `two and a half minutes on the wall: stages and levels (${JSON.stringify(fight)})`);

  // ---- a gate's boss: lose to the timer and he holds back until Challenged; win and the journey is paid once
  const boss = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.up = {}; w.auto = true; sc.startStage(10);
    for (let i = 0; i < 30 * 32; i++) sc.tick(1 / 30);
    const lost = { stage: w.stage, auto: w.auto };
    sc.challenge();
    w.up = { attack: 400, health: 300 }; sc.startStage(10);
    const silver0 = sc.save.silver;
    for (let i = 0; i < 30 * 20 && w.stage === 10; i++) sc.tick(1 / 30);
    const won = { stage: w.stage, silver: sc.save.silver - silver0, cape: (sc.save.store?.capes ?? []).includes('midnight') };
    sc.startStage(10); for (let i = 0; i < 30 * 20 && w.stage === 10; i++) sc.tick(1 / 30);
    return { lost, won, again: sc.save.silver - silver0 };
  });
  assert.ok(boss.lost.stage === 9 && !boss.lost.auto, `the boss holds the gate when time runs out: back a stage, holding (${JSON.stringify(boss.lost)})`);
  assert.ok(boss.won.stage === 11 && boss.won.silver === 25 && boss.again === 25, `Gate 1's first fall pays the journey 25 silver, once (${JSON.stringify(boss)})`);

  // ---- his levels open the skills, the shadows and the Mantle
  const powers = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.level = 26; w.gauge = 100; w.up = { attack: 200, health: 200 }; sc.startStage(12);
    sc.transformNow();
    const mantle = sc.mantleT > 0;
    for (let i = 0; i < 30 * 5; i++) sc.tick(1 / 30);
    return { mantle, shadows: sc.shadows.filter((s) => s.img.visible).length };
  });
  assert.ok(powers.mantle && powers.shadows === 2, `at level 26 two shadows stand with him and the Mantle can be taken up (${JSON.stringify(powers)})`);

  // ---- the Ascension: Seals for a run past stage 60, the level kept
  const asc = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.best = 70; const level = w.level;
    sc.ascend();
    return { stage: w.stage, seals: w.seals, up: Object.keys(w.up).length, level: w.level === level };
  });
  assert.ok(asc.stage === 1 && asc.seals === 9 && asc.up === 0 && asc.level, `Ascending from stage 70 gives 9 Seals, resets the run and keeps his level (${JSON.stringify(asc)})`);

  // ---- away for three hours: the welcome card pays half the recent rate; everything survived the reload
  // (Leaving the page saves the Watch as seen now, so the three hours are set as the next page starts.)
  await E(page, () => { const sc = window.__remnant.watch; sc.w.rate = 40; sc.w.coins = 0; sc.persist(); });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('watch-away')) return;
    sessionStorage.setItem('watch-away', '1');
    const raw = JSON.parse(localStorage.getItem('remnant-phaser.save.v2'));
    raw.watch.last = Date.now() - 3 * 3600 * 1000;
    localStorage.setItem('remnant-phaser.save.v2', JSON.stringify(raw));
  });
  await page.goto(base + '?debug');
  await enter();
  await page.waitForSelector('[data-k=wt_collect]', { timeout: 10000 });
  await page.screenshot({ path: 'qa/watch-welcome.png' });
  await page.click('[data-k=wt_collect]');
  const back = await E(page, () => { const w = window.__remnant.watch.w; return { coins: w.coins, seals: w.seals, level: w.level }; });
  assert.ok(back.coins >= 215000 && back.coins <= 217000 && back.seals === 9 && back.level === 26, `three hours away pay 40 × ½ × 10,800 coins, and the Watch was kept (${JSON.stringify(back)})`);
  await page.screenshot({ path: 'qa/watch.png' });
  console.log(`Watch: a fresh Elior; ${fight.stage - 1} stages in 2½ minutes; the boss's timer; Gate 1 paid once; shadows and the Mantle at 26; Ascension for 9 Seals; ${back.coins} coins for 3 h away`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser watch: all checks passed');
} finally {
  await browser.close();
  close();
}
