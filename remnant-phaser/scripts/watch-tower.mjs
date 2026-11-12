// The Watch's tower and daily dungeons (src/game/watch/tower.ts; NEXT_PLAN D2). They open at a best stage of 20. A
// floor too strong for him holds and costs nothing; when his strength can fell its holder in a holder's time it falls,
// pays coins, and every fifth floor pays a Seal and two chests. Each dungeon has three keys a day: coins, essence for
// a shadow he keeps, and a rank for a reached gate's relic; a spent key is gone until the next day; odd saved values
// are repaired. Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const daily = async (page) => { await page.click('[data-k=wt_tab_up]'); await page.click('[data-k=wt_tab_daily]'); await page.waitForSelector('[data-k=wt_open]'); };

try {
  const page = await (await browser.newContext({ ...devices['iPhone SE'] })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
  await page.click('[data-k=title_watch]');
  await page.waitForFunction(() => window.__remnant?.watch?.w && document.querySelector('.wt-card'), null, { timeout: 30000 });

  // ---- closed until stage 20
  await daily(page);
  assert.ok(await E(page, () => !document.querySelector('[data-k=wt_climb]')), 'the tower is closed to a new watch');

  // ---- open: a floor too strong holds and costs nothing
  await E(page, () => { const w = window.__remnant.watch.w; w.best = w.bestEver = 25; w.coins = 0; });
  await daily(page);
  await page.click('[data-k=wt_climb]');
  await page.waitForSelector('[data-k=wt_climb_said]');
  const held = await E(page, () => ({ said: document.querySelector('[data-k=wt_climb_said]').textContent, floor: window.__remnant.watch.w.tower ?? 0, coins: window.__remnant.watch.w.coins }));
  assert.ok(/held/.test(held.said) && held.floor === 0, `a floor beyond him holds, and nothing is lost (${held.said})`);

  // ---- strong enough: floors fall one a try; the fifth pays a Seal and two chests
  await E(page, () => { const w = window.__remnant.watch.w; w.up.attack = 3000; w.seals = 0; });
  const before = await E(page, () => ({ seals: window.__remnant.watch.w.seals, chests: window.__remnant.watch.w.daily.chests, coins: window.__remnant.watch.w.coins }));
  for (let i = 0; i < 5; i++) { await daily(page); await page.click('[data-k=wt_climb]'); await page.waitForFunction((n) => (window.__remnant.watch.w.tower ?? 0) === n, i + 1); }
  const five = await E(page, () => ({ floor: window.__remnant.watch.w.tower, seals: window.__remnant.watch.w.seals, chests: window.__remnant.watch.w.daily.chests, coins: window.__remnant.watch.w.coins, said: document.querySelector('[data-k=wt_climb_said]')?.textContent }));
  assert.ok(five.floor === 5 && five.seals === before.seals + 1 && five.chests === before.chests + 2 && five.coins > before.coins, `five floors, one a try; the fifth pays a Seal and two chests (${JSON.stringify(five)})`);
  console.log(`Tower: held at first; then five floors, and the fifth paid: ${five.said}`);

  // ---- the dungeons: three keys each; coins, essence, a relic's rank
  await daily(page);
  const coins0 = await E(page, () => window.__remnant.watch.w.coins);
  for (let i = 0; i < 3; i++) { await page.click('[data-k=wt_dungeon_coin]'); await page.waitForFunction((n) => window.__remnant.watch.w.keys.coin === n, 2 - i); }
  const coin = await E(page, (c) => ({ gained: window.__remnant.watch.w.coins - c, off: document.querySelector('[data-k=wt_dungeon_coin]').disabled, again: window.__remnant.watch.dungeon('coin') }), coins0);
  assert.ok(coin.gained > 0 && coin.off && coin.again === null, 'three coin keys pay, and a fourth run is refused');
  const ess0 = await E(page, () => Object.values(window.__remnant.watch.w.essence ?? {}).reduce((a, b) => a + b, 0));
  await page.click('[data-k=wt_dungeon_essence]');
  await page.waitForFunction(() => window.__remnant.watch.w.keys.essence === 2);
  assert.equal(await E(page, (e) => Object.values(window.__remnant.watch.w.essence ?? {}).reduce((a, b) => a + b, 0) - e, ess0), 4, 'an essence key pays four essence');
  await page.click('[data-k=wt_dungeon_relic]');
  await page.waitForFunction(() => window.__remnant.watch.w.keys.relic === 2);
  const relic = await E(page, () => ({ ranks: Object.values(window.__remnant.watch.w.relics ?? {}).reduce((a, b) => a + b, 0), said: document.querySelector('[data-k=wt_dungeon_said]').textContent }));
  assert.ok(relic.ranks >= 1 && /rank/.test(relic.said), `a relic key raises a relic of a gate he has reached (${relic.said})`);
  await page.screenshot({ path: 'qa/watch-tower.png', fullPage: true });
  const fits = await E(page, () => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.ok(fits, 'the Daily tab with the tower fits an iPhone SE');

  // ---- a new day brings the keys back; odd saved values are repaired
  const next = await E(page, () => { const w = window.__remnant.watch.w; w.keys.day = '2001-01-01'; w.tower = -3; return true; });
  void next;
  await E(page, () => window.__remnant.watch.persist());
  await page.goto(base + '?debug');
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
  await page.click('[data-k=title_watch]');
  await page.waitForFunction(() => window.__remnant?.watch?.w && document.querySelector('.wt-card'), null, { timeout: 30000 });
  await daily(page);
  const fresh = await E(page, () => ({ keys: window.__remnant.watch.w.keys, tower: window.__remnant.watch.w.tower }));
  assert.ok(fresh.keys.coin === 3 && fresh.keys.relic === 3 && fresh.tower === 0, `a new day brings three keys each, and a damaged floor count is repaired (${JSON.stringify(fresh)})`);
  console.log(`Dungeons: coins, essence and ${relic.said}; keys return with the day`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser watch tower: all checks passed');
} finally {
  await browser.close();
  close();
}
