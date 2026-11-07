// The Watch's Ascension tree and relics (src/game/watch/ascension.ts, POLISH_PLAN §18m). Seals buy ranks on the Ascend
// tab: a rank adds what it says (Whetted Edge +8% blows), a locked node opens at its way in's rank, and a Seal in the tree
// keeps its strength. The tree and the relics stay through an Ascension; the Forced March begins the new watch further
// on. Clearing the tree gives every Seal back. A gate holder's fall drops its place's relic by its odds, and always after
// five without one (the pity); a first relic is worn by itself, a second fall raises its rank, and the Hero tab puts one
// on and takes it off within the slots. The Oath and the Censer lengthen and shorten a holder's fight. A damaged tree or
// relic list is repaired on load. Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const KEY = 'remnant-phaser.save.v2';

const enter = async (page) => {
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
  await page.click('[data-k=title_watch]');
  await page.waitForFunction(() => window.__remnant?.watch?.w && document.querySelector('.wt-card'), null, { timeout: 30000 });
  await page.waitForTimeout(300);
};
const stats = (page) => E(page, () => window.__remnant.watchStats(window.__remnant.watch.w));

try {
  const page = await (await browser.newContext({ ...devices['iPhone SE'] })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug');
  await enter(page);

  // ---- the tree: Seals buy ranks, a rank adds what it says, a locked node waits for its way in
  await E(page, () => { const w = window.__remnant.watch.w; w.seals = 40; });
  await page.click('[data-k=wt_tab_ascend]');
  await page.waitForSelector('[data-k=wt_node_edge]');
  const s0 = await stats(page);
  const keenLocked = await E(page, () => document.querySelector('[data-k=wt_buy_keen]').disabled);
  assert.ok(keenLocked, 'Keen Eye waits for Whetted Edge rank 3');
  for (let i = 0; i < 3; i++) await page.click('[data-k=wt_buy_edge]');
  const s1 = await stats(page);
  assert.ok(Math.abs(s1.atk / s0.atk - 1.24) < 1e-9, `three ranks of Whetted Edge: +24% blows (${s0.atk} → ${s1.atk})`);
  assert.ok(Math.abs(s1.atk / s0.atk - 1.24) < 1e-9 && s1.coinMult === s0.coinMult, 'a Seal in the tree keeps its strength (coins unchanged)');
  const tree = await E(page, () => ({ keen: document.querySelector('[data-k=wt_buy_keen]').disabled, sum: document.querySelector('[data-k=wt_seals]').textContent, free: window.__remnant.watchAscension.sealsFree(window.__remnant.watch.w) }));
  assert.ok(!tree.keen, 'Keen Eye opens');
  assert.equal(tree.free, 40 - (1 + 2 + 3), `Seals to place: 40 less 1 + 2 + 3 (${tree.free})`);
  assert.match(tree.sum, /34Seals to place/, `the tab shows the Seals to place (${tree.sum})`);
  // The Wealth branch to the Forced March: Tithe 3, Vigil 2, March 1.
  for (const [id, n] of [['tithe', 3], ['vigil', 2], ['march', 1]]) for (let i = 0; i < n; i++) await page.click(`[data-k=wt_buy_${id}]`);
  const wealth = await E(page, () => { const A = window.__remnant.watchAscension, w = window.__remnant.watch.w; return { march: A.rankOf(w, 'march'), start: A.ascendBonus(w).start, cap: A.ascendBonus(w).awayHours }; });
  assert.deepEqual(wealth, { march: 1, start: 11, cap: 2 }, `the Forced March and the Long Vigil (${JSON.stringify(wealth)})`);
  await page.screenshot({ path: 'qa/watch-tree.png', fullPage: false });

  // ---- relics: the odds and the pity, the first worn by itself, a second fall a rank, slots
  const relics = await E(page, () => {
    const A = window.__remnant.watchAscension, w = window.__remnant.watch.w, out = {};
    w.relics = {}; w.worn = []; w.relicPity = 0;
    out.miss = A.rollRelic(w, 1, 0.9);          // gate 1: the Grave Lantern, missed
    out.hit = A.rollRelic(w, 2, 0.1)?.relic.id;  // gate 2: the Hunter's Horn, dropped
    for (let i = 0; i < 5; i++) A.rollRelic(w, 3, 0.99); // five misses…
    out.pityAt = w.relicPity;
    out.pity = A.rollRelic(w, 3, 0.99)?.relic.id; // …and the sixth always drops
    out.again = A.rollRelic(w, 10, 0.1)?.rank;   // gate 10 is the Hunter's Horn's place again: rank 2
    out.worn = [...w.worn];
    return out;
  });
  assert.equal(relics.miss, null, 'a miss drops nothing');
  assert.equal(relics.hit, 'horn', 'gate 2 drops the Hunter\'s Horn');
  assert.equal(relics.pityAt, 5, 'five holders without a relic');
  assert.equal(relics.pity, 'amulet', 'the sixth always drops (the pity)');
  assert.equal(relics.again, 2, 'a second fall raises a relic\'s rank');
  assert.deepEqual(relics.worn, ['horn', 'amulet'], 'a first relic is worn by itself while a slot is free');
  await page.click('[data-k=wt_tab_hero]');
  await page.waitForSelector('[data-k=wt_relic_horn]');
  const r0 = await stats(page);
  await page.click('[data-k=wt_relic_horn]'); // off
  const r1 = await stats(page);
  assert.ok(Math.abs(r0.atk / r1.atk - 1.16) < 1e-9, `the Horn at rank 2 adds 16% (${r1.atk} → ${r0.atk})`);
  await E(page, () => { const w = window.__remnant.watch.w; w.relics.censer = 1; window.__remnant.watch.ui.show('hero'); });
  await page.click('[data-k=wt_relic_censer]');
  await page.click('[data-k=wt_relic_horn]'); // a third: the slots are full
  const slots = await E(page, () => ({ worn: [...window.__remnant.watch.w.worn], toast: document.querySelector('.wt-toast').textContent, on: document.querySelectorAll('.wt-relic.on').length }));
  assert.deepEqual(slots.worn, ['amulet', 'censer'], `two slots: a third waits (${slots.worn})`);
  assert.match(slots.toast, /slot is full/, `a toast says why (${slots.toast})`);
  assert.equal(slots.on, 2, 'the Hero tab marks the two worn');
  await page.screenshot({ path: 'qa/watch-relics.png' });

  // ---- a holder's fight: the Oath lengthens the clock, the Censer and the Oath strike harder
  const holder = await E(page, () => { const w = window.__remnant.watch.w, A = window.__remnant.watchAscension; w.seals = 200; for (const id of ['keen', 'keen', 'keen', 'oath', 'oath']) A.buyNode(w, id); return window.__remnant.watchStats(w); });
  assert.equal(holder.bossTime, 36, `two ranks of the Oath: 36 s on a holder's clock (${holder.bossTime})`);
  assert.ok(Math.abs(holder.holder - 1.5 * 1.2) < 1e-9, `the Oath (×1.5) and the Censer (×1.2) against holders (${holder.holder})`);
  await E(page, () => { const sc = window.__remnant.watch; sc.startStage(10); });
  const fight = await E(page, () => { const sc = window.__remnant.watch; return { left: sc.bossTimeLeft, max: sc.bossTimeMax }; });
  assert.equal(fight.max, 36, `the holder's fight gives 36 s (${JSON.stringify(fight)})`);

  // ---- through an Ascension: the tree and the relics stay; the march starts the watch at stage 11
  const asc = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w, A = window.__remnant.watchAscension, tree = JSON.stringify(w.tree), relics = JSON.stringify(w.relics);
    w.best = 70; w.bestEver = Math.max(70, w.bestEver); sc.ascend();
    return { stage: w.stage, best: w.best, tree: JSON.stringify(w.tree) === tree, relics: JSON.stringify(w.relics) === relics, worn: w.worn.length, free: A.sealsFree(w) };
  });
  assert.deepEqual([asc.stage, asc.best, asc.tree, asc.relics, asc.worn], [11, 11, true, true, 2], `the tree and relics stay; the watch begins at 11 (${JSON.stringify(asc)})`);

  // ---- clearing the tree gives every Seal back
  await page.click('[data-k=wt_tab_ascend]');
  await page.waitForSelector('[data-k=wt_tree_reset]');
  const sealsBefore = await E(page, () => window.__remnant.watch.w.seals);
  await page.click('[data-k=wt_tree_reset]'); await page.click('[data-k=wt_tree_reset]');
  const cleared = await E(page, () => { const w = window.__remnant.watch.w, A = window.__remnant.watchAscension; return { spent: A.spent(w), free: A.sealsFree(w), seals: w.seals }; });
  assert.deepEqual(cleared, { spent: 0, free: sealsBefore, seals: sealsBefore }, `the tree is clear, every Seal back (${JSON.stringify(cleared)})`);

  // ---- a damaged tree and relic list are repaired on load
  await E(page, () => window.__remnant.watch.persist());
  await E(page, (KEY) => {
    window.__remnant.watch.persist = () => {};
    const d = JSON.parse(localStorage.getItem(KEY));
    d.watch.seals = 10;
    d.watch.tree = { edge: 2.7, keen: 4, bogus: 3, stone: -1, tithe: 'x' }; // keen without edge 3; 2 edge ranks = 3 Seals
    d.watch.relics = { horn: 9, amulet: 1, nope: 2, lantern: NaN };
    d.watch.worn = ['horn', 'horn', 'nope', 'lantern', 'amulet'];
    d.watch.relicPity = 99;
    localStorage.setItem(KEY, JSON.stringify(d));
  }, KEY);
  await page.goto(base + '?debug');
  await enter(page);
  const fixed = await E(page, () => { const w = window.__remnant.watch.w; return { tree: w.tree, relics: w.relics, worn: w.worn, pity: w.relicPity }; });
  assert.deepEqual(fixed, { tree: { edge: 2 }, relics: { horn: 5, amulet: 1 }, worn: ['horn', 'amulet'], pity: 5 }, `a damaged tree and relic list are repaired (${JSON.stringify(fixed)})`);
  const overspent = await E(page, () => { const t = { ...window.__remnant.watch.w, tree: { edge: 10, stone: 10 }, seals: 5 }; window.__remnant.watchMigrate(t); return t.tree; });
  assert.deepEqual(overspent, {}, 'a tree that costs more Seals than he has is cleared (its Seals come back)');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser watch ascension: the tree buys ranks and opens its branches; Seals keep their strength; relics drop by their odds and pity, rank up, and are worn within the slots; a holder\'s fight lengthens; the tree and relics stay through an Ascension and the march begins at 11; the tree clears; damage repaired; all checks passed');
} finally {
  await browser.close();
  close();
}
