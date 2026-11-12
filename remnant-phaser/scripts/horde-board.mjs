// The Horde between runs (src/game/horde/board.ts, scenes/Horde.ts; NEXT_PLAN.md D1). A first run starts at once; a
// run leaves embers and the results say so; the next run opens at the camp, where embers buy the board (a rank costs
// more than the last, and a full board is about 40% stronger, never several times); hardships open at a best stage of 3
// and pay more embers; the Long Night ends, held, when its fifth monarch falls; and the board's gifts reach the run.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
const ready = (page) => until(page, () => window.__remnant?.horde?.hero?.sprite && window.__remnant.game.scene.isActive('horde'));

try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&horde&fresh');
  await ready(page);

  // ---- a first run starts at once, and leaving it pays embers
  assert.ok(await E(page, () => !window.__remnant.horde.overlay), 'a first run begins without the camp');
  const first = await E(page, () => { const h = window.__remnant.horde; h.kills = 400; h.stage = 3; h.openPause(); return { hp: h.maxHp, dmg: h.dmgMult, redraws: h.rerolls }; });
  await page.click('[data-k=hz_leave]');
  await page.waitForSelector('[data-k=hz_embers]');
  const paid = await E(page, () => ({ line: document.querySelector('[data-k=hz_embers]').textContent, embers: window.__remnant.horde.save.horde.embers, best: window.__remnant.horde.save.horde.best }));
  assert.ok(paid.embers === 56 && /\+56 embers/.test(paid.line) && paid.best === 3, `400 foes and stage 3 leave 56 embers, and the card says so (${JSON.stringify(paid)})`);
  console.log(`Run: ${paid.line}`);

  // ---- the next run opens at the camp: the board
  await page.click('[data-k=hz_again]');
  await page.waitForSelector('[data-k=hz_begin]');
  await E(page, () => { window.__remnant.horde.save.horde.embers = 2000; });
  await page.click('[data-k=hz_board_might]'); // closes nothing: the camp redraws
  await page.waitForFunction(() => /1\/5/.test(document.querySelector('[data-k=hz_board_might]').textContent));
  const one = await E(page, () => ({ embers: window.__remnant.horde.save.horde.embers, text: document.querySelector('[data-k=hz_board_might]').textContent }));
  assert.ok(one.embers === 1970 && /60 embers/.test(one.text), `the first rank costs 30 and the next 60 (${JSON.stringify(one)})`);
  // Buy the whole board.
  for (let guard = 0; guard < 40; guard++) {
    const k = await E(page, () => [...document.querySelectorAll('[data-k^=hz_board_]')].find((b) => !b.disabled)?.dataset.k ?? null);
    if (!k) break;
    await page.click(`[data-k=${k}]`);
    await page.waitForTimeout(40);
  }
  const full = await E(page, () => { const h = window.__remnant.horde.save.horde; return { board: h.board, spent: 2000 - h.embers, muts: !!document.querySelector('[data-k=hz_mut_iron]') }; });
  assert.deepEqual(full.board, { might: 5, vigor: 5, haste: 3, reach: 3, redraw: 2, banish: 2, headstart: 3 }, 'every track fills to its cap and no further');
  assert.ok(full.spent > 1500 && full.spent < 2000, `the whole board costs many runs' embers (${full.spent})`);
  assert.ok(full.muts, 'hardships are offered from a best stage of 3');

  // ---- hardships and the Long Night, then Begin: the board's gifts and the hardships reach the run
  await page.click('[data-k=hz_mut_iron]');
  await page.waitForFunction(() => /✓/.test(document.querySelector('[data-k=hz_mut_iron]').textContent));
  await page.click('[data-k=hz_mut_frail]');
  await page.waitForFunction(() => /✓/.test(document.querySelector('[data-k=hz_mut_frail]').textContent));
  await page.click('[data-k=hz_mode_night]');
  await page.waitForFunction(() => document.querySelector('[data-k=hz_mode_night]').classList.contains('primary'));
  await page.screenshot({ path: 'qa/horde-camp.png' });
  const fits = await E(page, () => { const p = document.querySelector('[data-k=hz_begin]').closest('div').parentElement; return p.scrollWidth <= innerWidth + 1; });
  assert.ok(fits, 'the camp fits a phone upright');
  await page.click('[data-k=hz_begin]');
  await until(page, () => !window.__remnant.horde.overlay || document.querySelector('.hz-title')?.textContent.startsWith('LEVEL'));
  const run = await E(page, () => { const h = window.__remnant.horde; return { hp: h.maxHp, dmg: h.dmgMult, redraws: h.rerolls, banishes: h.banishes, levels: h.pendingLevels + (document.querySelector('.hz-title')?.textContent.startsWith('LEVEL') ? 1 : 0), night: h.night, muts: h.muts, foeHp: h.foeHp }; });
  const power = (run.dmg / first.dmg) * (run.hp / 0.7 / first.hp) / 0.94; // damage × health ÷ cooldown, the hardship set aside
  assert.ok(Math.abs(run.dmg / first.dmg - 1.2) < 0.001 && Math.abs(run.hp / first.hp - 1.3 * 0.7) < 0.02, `a full board gives +20% damage and +30% health; Thin Mail takes 30% (${(run.dmg / first.dmg).toFixed(2)}, ${(run.hp / first.hp).toFixed(2)})`);
  assert.ok(power > 1.3 && power < 2, `a full board is stronger, never several times (×${power.toFixed(2)})`);
  assert.ok(run.redraws === 5 && run.banishes === 5 && run.levels === 3 && run.night && run.muts.join() === 'iron,frail', `redraws, banishes, the early levels, the Night and the hardships are in the run (${JSON.stringify(run)})`);
  console.log(`Camp: the board filled for ${full.spent} embers; a full board is ×${power.toFixed(2)}; Iron Host and Thin Mail chosen; the Long Night begun`);

  // ---- the Long Night ends, held, when its fifth monarch falls; hardships and the Night multiply the embers
  await E(page, () => { const h = window.__remnant.horde; if (h.overlay) h.closeCard(); h.pendingLevels = 0; h.hp = h.maxHp = 1e9; h.kills = 400; h.startStage(5); h.stageT = 1e4; });
  await until(page, () => window.__remnant.horde.boss, null, 30000);
  await E(page, () => { const h = window.__remnant.horde; h.pendingLevels = 0; if (h.overlay) h.closeCard(); h.boss.hp = 1; h.bossHit(h.boss.x, h.boss.y, 999, 1e9); });
  await page.waitForFunction(() => document.querySelector('.hz-title')?.textContent === 'THE NIGHT IS HELD' || (window.__remnant.horde.pendingLevels = 0, window.__remnant.horde.overlay && document.querySelector('.hz-title')?.textContent.startsWith('LEVEL') && (window.__remnant.horde.closeCard(), false)), null, { timeout: 60000 });
  const night = await E(page, () => ({ line: document.querySelector('[data-k=hz_embers]').textContent, nights: window.__remnant.horde.save.horde.nights, won: window.__remnant.horde.embersWon, kills: window.__remnant.horde.kills }));
  const want = Math.round((night.kills / 20 + 4 * 12 + 5 * 4) * 1.6 * 1.5);
  assert.ok(night.nights === 1 && night.won === want && /Night held/.test(night.line), `the Night is held and pays ×1.6 for two hardships and ×1.5 for the end (${JSON.stringify(night)}, want ${want})`);
  await page.screenshot({ path: 'qa/horde-night.png' });
  console.log(`The Long Night: held at stage 5; ${night.line}`);

  // ---- today's Horde: the date's hardship, and the first run of the day is the ranked one
  const today = async () => {
    await page.goto(base + '?debug&horde');
    await ready(page);
    await page.waitForSelector('[data-k=hz_mode_day]');
    await page.click('[data-k=hz_mode_day]');
    await page.waitForFunction(() => document.querySelector('[data-k=hz_mode_day]').classList.contains('primary'));
    const label = await E(page, () => document.querySelector('[data-k=hz_mode_day]').textContent);
    await page.click('[data-k=hz_begin]');
    await until(page, () => !document.querySelector('[data-k=hz_begin]'));
    const run = await E(page, () => { const h = window.__remnant.horde; if (h.overlay) h.closeCard(); h.pendingLevels = 0; return { muts: h.muts, daily: h.daily }; });
    await E(page, () => { const h = window.__remnant.horde; h.kills = 222; h.stage = 3; h.openPause(); });
    await page.click('[data-k=hz_leave]');
    await page.waitForSelector('[data-k=hz_day_said]');
    return { label, run, said: await E(page, () => document.querySelector('[data-k=hz_day_said]').textContent), rec: await E(page, () => window.__remnant.horde.save.horde), runs: await E(page, () => window.__remnant.horde.save.flags.day_horde_runs) };
  };
  const t1 = await today();
  assert.ok(/one ranked run/.test(t1.label) && t1.run.daily && t1.run.muts.length === 1, `today's Horde has one hardship chosen by the date (${JSON.stringify(t1.run)}, ${t1.label})`);
  assert.ok(/ranked run/.test(t1.said) && t1.rec.dayBest?.stage === 3 && t1.runs === 1, `its first run is today's ranked one, and the Day counts it (${t1.said})`);
  const t2 = await today();
  assert.ok(/practice/.test(t2.label) && /practice/.test(t2.said) && t2.rec.dayBest.stage === 3 && t2.runs === 1, `a second run today is practice and changes nothing (${t2.said})`);
  console.log(`Today's Horde: ${t1.label.split(' · ')[1]}; the first run was ranked, the second practice`);

  // ---- a damaged record is repaired
  const fixed = await E(page, () => {
    const s = JSON.parse(localStorage.getItem('remnant-phaser.save.v2'));
    s.horde.embers = -5; s.horde.board = { might: 99, nonsense: 3 }; s.horde.muts = 'all'; s.horde.mode = 7;
    localStorage.setItem('remnant-phaser.save.v2', JSON.stringify(s));
    return true;
  });
  void fixed;
  await page.goto(base + '?debug&horde');
  await ready(page);
  const rec = await E(page, () => window.__remnant.horde.save.horde);
  assert.ok(rec.embers === 0 && rec.board.might === 5 && !('nonsense' in rec.board) && rec.muts.length === 0 && rec.mode === 'endless', `odd amounts are repaired, never refused (${JSON.stringify(rec)})`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser horde board: all checks passed');
} finally {
  await browser.close();
  close();
}
