// The Day (src/game/day.ts; NEXT_PLAN.md B1–B3). A player with nothing unlocked gets only calls they can answer; one
// with the Trial open gets five, one per kind of play, the same however often the day is opened. A call pays the
// moment it is done (silver, marks, something for its mode) and never twice; all of them pay a bonus; the week has its
// own. The streak counts days the game is opened, forgives one miss a week, starts again after more, and runs together
// with the Watch's. Marks pay the Chronicle's steps (a legendary piece at 10, the month's cape at 15); a closed month's
// unreached cape is owed and spare marks buy it back. A Day that does not read is drawn again. In play a finished call
// is announced; the home screen shows the card and its button starts the first call not yet answered.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); watch(page);
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // ---- the rules, on copies of the save (nothing here touches the journey in play)
  const rules = await E(page, () => {
    const D = window.__remnant.day, live = window.__remnant.world.save;
    const copy = (extra = {}) => { const s = JSON.parse(JSON.stringify(live)); delete s.day; s.flags = { ...s.flags, ...extra }; return s; };
    const DAY = 86400e3, t0 = new Date(2026, 10, 9, 10).getTime(); // a Monday in November 2026
    const fixed = () => 0.42, out = {};
    // A new player: only what is open.
    const young = copy(); delete young.flags.relic_taken; young.defeated = [];
    D.settleDay(young, t0, fixed);
    out.young = young.day.calls.map((c) => c.mode);
    // The Trial open, a boss beaten, the chains won: five calls, one per kind, and the same when drawn again.
    const s = copy({ relic_taken: true, sundered_chains: true }); s.defeated = ['idol']; s.level = 30;
    D.settleDay(s, t0, fixed);
    out.calls = s.day.calls.map((c) => c.tally); out.weekly = s.day.weekly.length; out.streak0 = s.day.streak;
    const again = copy({ relic_taken: true, sundered_chains: true }); again.defeated = ['idol']; D.settleDay(again, t0 + 3600e3, fixed);
    out.same = JSON.stringify(again.day.calls.map((c) => c.tally)) === JSON.stringify(out.calls);
    // Answer the first call: it pays once.
    const bump = (c, n) => {
      if (c.tally === 'foes') s.kills += n; else if (c.tally === 'bosses') s.flags.boss_falls = (s.flags.boss_falls ?? 0) + n;
      else if (c.tally === 'trialRounds') s.flags.trial_rounds = (s.flags.trial_rounds ?? 0) + n;
      else if (c.tally === 'dailyRuns') (s.daily ??= {}).cleared = (s.daily.cleared ?? 0) + n;
      else if (c.tally === 'hordeKills') { (s.horde ??= { best: 0, runs: 0, kills: 0, bestKills: 0 }).kills += n; s.kills += n; }
      else if (c.tally === 'hordeRuns') (s.horde ??= { best: 0, runs: 0, kills: 0, bestKills: 0 }).runs += n;
      else if (c.tally === 'watchStages') { s.watch ??= { tally: {} }; (s.watch.tally ??= {}).stages = (s.watch.tally.stages ?? 0) + n; }
      else if (c.tally === 'hooks') s.flags.chain_hooks = (s.flags.chain_hooks ?? 0) + n;
      else if (c.tally === 'parries') s.flags.parries = (s.flags.parries ?? 0) + n;
    };
    delete s.watch; // (its own days are tested in watch.mjs; here the Watch call counts stages on a bare tally)
    const first = s.day.calls.find((c) => c.goal > 1), silver = s.silver;
    bump(first, first.goal - 1); out.early = D.settleDay(s, t0, fixed).length; out.part = D.progress(s, first);
    bump(first, 1);
    const news = D.settleDay(s, t0, fixed);
    out.paid = { news: news.map((n) => n.kind), silver: s.silver > silver, marks: s.day.chron.marks, twice: D.settleDay(s, t0, fixed).length };
    // All of them: the bonus.
    for (const c of s.day.calls) if (c !== first) bump(c, c.goal);
    const all = D.settleDay(s, t0, fixed).map((n) => n.kind);
    out.all = { kinds: all, marks: s.day.chron.marks, step: s.day.chron.step, next: D.nextCall(s) };
    // The streak: tomorrow, a forgiven miss, a second miss in the week, then a long gap.
    D.settleDay(s, t0 + DAY, fixed); out.tomorrow = s.day.streak; out.fresh = s.day.calls.every((c) => !c.paid);
    D.settleDay(s, t0 + 3 * DAY, fixed); out.forgiven = s.day.streak;
    D.settleDay(s, t0 + 5 * DAY, fixed); out.second = s.day.streak;
    D.settleDay(s, t0 + 20 * DAY, fixed); out.reset = s.day.streak; out.best = s.day.bestStreak;
    // The Chronicle: marks pay steps; step 10 is a legendary piece, 15 the month's cape, and the last leaves spare marks.
    const c = copy({ relic_taken: true }); c.level = 40; D.settleDay(c, t0, fixed);
    const inv = c.inventory.length, give = (n) => { c.day.calls = [{ id: 'x', tally: 'foes', goal: 1, text: 'x', mins: 1, mode: 'journey' }]; c.day.allPaid = true; for (let i = 0; i < n; i++) { c.day.calls[0].paid = false; c.kills += 1; c.day.base.foes = D.tallyNow(c, 'foes') - 1; D.settleDay(c, t0, fixed); } };
    give(50); // 500 marks: ten steps
    out.ten = { step: c.day.chron.step, legend: c.inventory.slice(inv).some((i) => i.legend), added: c.inventory.length - inv };
    give(25); out.cape = { step: c.day.chron.step, has: D.hasCape(c, D.capeOf(c.day.chron.month)), id: D.capeOf(c.day.chron.month) };
    give(80); out.last = { step: c.day.chron.step, spare: c.day.spare, marks: c.day.chron.marks };
    // A month that closes short of its cape owes it; spare marks buy it back.
    const m = copy({ relic_taken: true }); D.settleDay(m, t0, fixed); m.day.chron.marks = 120; m.day.chron.step = 2;
    const cape = D.capeOf(m.day.chron.month);
    const turned = D.settleDay(m, new Date(2026, 11, 2, 10).getTime(), fixed).map((n) => n.kind);
    out.month = { turned: turned.includes('month'), owed: m.day.owed, spare: m.day.spare, step: m.day.chron.step, cape, early: D.buyOwed(m, cape) };
    m.day.spare = 150; out.month.bought = D.buyOwed(m, cape); out.month.has = D.hasCape(m, cape); out.month.left = m.day.owed.length;
    // A Day that does not read is dropped and drawn again; odd amounts are repaired.
    const bad = copy(); bad.day = { day: 5, calls: 'no' }; D.migrateDay(bad); out.dropped = bad.day === undefined;
    const odd = copy(); D.settleDay(odd, t0, fixed); odd.day.streak = -4; odd.day.chron.marks = 'many'; odd.day.spare = NaN; D.migrateDay(odd);
    out.repaired = { streak: odd.day.streak, marks: odd.day.chron.marks, spare: odd.day.spare };
    // One streak: the Watch's longer run becomes the game's, and they turn together.
    const w = copy(); w.watch = JSON.parse(JSON.stringify(live.watch ?? null));
    out.watch = null;
    if (w.watch?.daily) { w.watch.daily.streak = 9; w.watch.daily.lastDay = '2026-11-08'; w.watch.daily.day = '2026-11-08'; D.settleDay(w, t0, fixed); out.watch = { game: w.day.streak, watch: w.watch.daily.streak }; }
    return out;
  });
  assert.ok(rules.young.length >= 2 && rules.young.every((m) => ['journey', 'horde', 'watch'].includes(m)), `a new player is only called to what is open (${rules.young})`);
  assert.ok(rules.calls.length === 5 && new Set(rules.calls).size === 5 && rules.weekly === 3 && rules.same, `five calls and three for the week, the same all day (${rules.calls})`);
  assert.ok(rules.early === 0 && rules.part > 0, 'a call part done pays nothing yet');
  assert.ok(rules.paid.news.includes('call') && rules.paid.silver && rules.paid.marks === 10 && rules.paid.twice === 0, `a call pays the moment it is done, once (${JSON.stringify(rules.paid)})`);
  assert.ok(rules.all.kinds.includes('all') && rules.all.marks === 70 && rules.all.step === 1 && rules.all.next === null, `all five pay the bonus and a Chronicle step (${JSON.stringify(rules.all)})`);
  assert.ok(rules.streak0 === 1 && rules.tomorrow === 2 && rules.fresh, 'the next day the streak goes on and new calls are drawn');
  assert.ok(rules.forgiven === 3 && rules.second === 1 && rules.reset === 1 && rules.best === 3, `one missed day a week is forgiven; a second starts again (${rules.forgiven}, ${rules.second}, best ${rules.best})`);
  assert.ok(rules.ten.step === 10 && rules.ten.legend, `step 10 pays a legendary piece with a power (${JSON.stringify(rules.ten)})`);
  assert.ok(rules.cape.step === 15 && rules.cape.has, `step 15 pays the month's cape (${JSON.stringify(rules.cape)})`);
  assert.ok(rules.last.step === 30 && rules.last.marks === 1500 && rules.last.spare > 0, `past the last step marks are spare (${JSON.stringify(rules.last)})`);
  assert.ok(rules.month.turned && rules.month.owed.includes(rules.month.cape) && rules.month.spare === 20 && rules.month.step === 0 && !rules.month.early, `a closed month owes its cape and keeps what was left over (${JSON.stringify(rules.month)})`);
  assert.ok(rules.month.bought && rules.month.has && rules.month.left === 0, 'spare marks buy the owed cape back');
  assert.ok(rules.dropped && rules.repaired.streak === 1 && rules.repaired.marks === 0 && rules.repaired.spare === 0, `a damaged Day is repaired (${JSON.stringify(rules.repaired)})`);
  if (rules.watch) assert.deepEqual(rules.watch, { game: 10, watch: 10 }, 'the Watch\'s streak and the game\'s are one');
  console.log(`Calls: ${rules.calls.join(', ')}; a new player's: ${rules.young.join(', ')}`);
  console.log(`Streak: 1, ${rules.tomorrow}, forgiven ${rules.forgiven}, then again from ${rules.second}; Chronicle: a piece at 10, the ${rules.cape.id} cape at 15, ${rules.last.spare} spare past 30`);

  // ---- in play: a call answered on the journey is announced and paid
  const live = await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    delete s.day; window.__remnant.day.settleDay(s);
    const c = s.day.calls.find((x) => x.tally === 'foes' || x.tally === 'parries') ?? s.day.calls[0];
    window.__c = c.id;
    if (c.tally === 'foes') s.kills += c.goal; else if (c.tally === 'parries') s.flags.parries = (s.flags.parries ?? 0) + c.goal;
    else s.day.base[c.tally] = -c.goal;
    return { text: c.text, silver: s.silver };
  });
  await until(page, () => window.__remnant.world.save.day.calls.find((c) => c.id === window.__c)?.paid, null, 30000);
  assert.ok(await E(page, (silver) => window.__remnant.world.save.silver > silver, live.silver), 'the call paid silver in play');
  console.log(`In play: "${live.text}" was answered and paid`);
  await E(page, () => window.__remnant.world.persist());

  // ---- the home screen: the card, its ticks, the Chronicle page, and the button that starts the next call
  await page.goto(base + '?debug');
  await until(page, () => window.__remnant?.game?.scene?.isActive('title') && document.querySelector('[data-k=title_today]'));
  const card = await E(page, () => ({
    calls: [...document.querySelectorAll('[data-k=title_call]')].map((li) => ({ text: li.textContent, done: li.classList.contains('done') })),
    streak: document.querySelector('[data-k=title_streak]').textContent, chron: document.querySelector('[data-k=title_chronicle]').textContent,
    answer: document.querySelector('[data-k=title_answer]').textContent, fits: document.querySelector('.hm').scrollWidth <= document.querySelector('.hm').clientWidth + 1,
  }));
  assert.ok(card.calls.length >= 2 && card.calls.some((c) => c.done) && card.calls.some((c) => !c.done), `the card lists today's calls with a tick on the one answered (${JSON.stringify(card.calls)})`);
  assert.ok(/1 day in a row/.test(card.streak) && /Chronicle of .* step 1 of 30/.test(card.chron) && /^Answer: /.test(card.answer) && card.fits, `the streak, the Chronicle's next step and the button are there (${card.streak}; ${card.chron})`);
  await page.click('[data-k=title_chron_open]');
  await page.waitForSelector('[data-k=chronicle]');
  const steps = await E(page, () => document.querySelectorAll('[data-k=chronicle] li').length);
  assert.equal(steps, 30, 'the Chronicle page lists thirty steps');
  await page.screenshot({ path: 'qa/day-chronicle.png' });
  await page.click('[data-k=chron_back]');
  await page.screenshot({ path: 'qa/day-home.png' });
  const mode = await E(page, () => { const s = JSON.parse(localStorage.getItem('remnant-phaser.save.v2')); return s.day.calls.find((c) => !c.paid).mode; });
  await page.click('[data-k=title_answer]');
  const scene = mode === 'watch' ? 'watch' : mode === 'horde' ? 'horde' : 'world';
  await until(page, (k) => window.__remnant.game.scene.isActive(k), scene);
  console.log(`Home: ${card.calls.length} calls on the card (${card.streak}); its button went to the ${scene} for a ${mode} call`);

  // ---- a phone upright: the card fits
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const p2 = await phone.newPage(); watch(p2);
  await p2.goto(base + '?debug');
  await until(p2, () => document.querySelector('[data-k=title_today]'));
  assert.ok(await E(p2, () => { const h = document.querySelector('.hm'); return h.scrollWidth <= h.clientWidth + 1; }), 'the home screen with the card fits a phone upright');
  await p2.screenshot({ path: 'qa/day-phone.png', fullPage: false });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser day: all checks passed');
} finally {
  await browser.close();
  close();
}
