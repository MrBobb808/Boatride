// The Watch's feats (src/game/watch/feats.ts; the owner's answer of 7 November 2026: Watch bonuses and cosmetic
// titles). A thousand foes felled earns the first feat: a toast, a dot on the Feats tab, and +2% to his blows. The
// tab shows the bonus, every feat by what it counts, and a title to wear, which the Hero tab then shows. Feats stay
// through an Ascension and a reload, and a damaged list is repaired (unknown or doubled feats dropped, a title not
// earned taken off). Seven tabs fit an iPhone SE. Run after `npm run build`.
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
};

try {
  const page = await (await browser.newContext({ ...devices['iPhone SE'] })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug');
  await enter(page);

  // ---- a thousand foes: the first feat
  const before = await E(page, () => window.__remnant.watchStats(window.__remnant.watch.w).atk);
  await E(page, () => { const w = window.__remnant.watch.w; (w.tally ??= {}).kills = 1000; });
  await page.waitForFunction(() => window.__remnant.watch.w.feats?.includes('k1'), null, { timeout: 5000 });
  const earned = await E(page, () => ({ toast: document.querySelector('.wt-toast')?.textContent, dot: document.querySelector('[data-k=wt_tab_feats]').classList.contains('dot'), atk: window.__remnant.watchStats(window.__remnant.watch.w).atk }));
  assert.match(earned.toast, /Feat · The First Thousand/, `a toast names the feat (${earned.toast})`);
  assert.ok(earned.dot, 'the Feats tab shows a dot');
  assert.ok(Math.abs(earned.atk / before - 1.02) < 1e-9, `his blows are 2% stronger (${before} → ${earned.atk})`);

  // ---- the Feats tab: the bonus, every feat, and a title
  await page.click('[data-k=wt_tab_feats]');
  const tab = await E(page, () => ({ sum: document.querySelector('[data-k=wt_feat_sum]').textContent, rows: document.querySelectorAll('.wt-ft').length, got: document.querySelectorAll('.wt-ft.got').length, dot: document.querySelector('[data-k=wt_tab_feats]').classList.contains('dot') }));
  assert.match(tab.sum, /\+2%blows/, `the tab shows the bonus (${tab.sum})`);
  assert.ok(tab.rows >= 30 && tab.got === 1, `every feat is listed, one earned (${tab.rows}, ${tab.got})`);
  assert.ok(!tab.dot, 'opening the tab clears its dot');
  await page.selectOption('[data-k=wt_title]', 'k1');
  await page.click('[data-k=wt_tab_hero]');
  const hero = await E(page, () => document.querySelector('.wt-h').textContent);
  assert.match(hero, /^Elior, Watchman/, `the Hero tab shows the title (${hero})`);
  await page.screenshot({ path: 'qa/watch-feats.png' });

  // ---- they stay through an Ascension
  await E(page, () => { const sc = window.__remnant.watch; sc.w.best = 70; sc.w.bestEver = Math.max(70, sc.w.bestEver); sc.ascend(); });
  assert.ok(await E(page, () => { const w = window.__remnant.watch.w; return w.ascensions === 1 && w.feats.includes('k1'); }), 'feats stay through an Ascension');
  await page.waitForFunction(() => window.__remnant.watch.w.feats.includes('a1'), null, { timeout: 5000 });

  // ---- and a reload; a damaged list is repaired
  await E(page, () => window.__remnant.watch.persist());
  await page.goto(base + '?debug');
  await enter(page);
  const kept = await E(page, () => { const w = window.__remnant.watch.w; return { feats: [...w.feats].sort(), title: w.title }; });
  assert.ok(kept.feats.includes('k1') && kept.feats.includes('a1') && kept.title === 'k1', `feats and the title survive a reload (${JSON.stringify(kept)})`);
  await E(page, (KEY) => { window.__remnant.watch.persist = () => {}; const d = JSON.parse(localStorage.getItem(KEY)); d.watch.feats = ['k1', 'k1', 'bogus', 7]; d.watch.title = 'g3'; localStorage.setItem(KEY, JSON.stringify(d)); }, KEY);
  await page.goto(base + '?debug');
  await enter(page);
  const fixed = await E(page, () => { const w = window.__remnant.watch.w; return { feats: w.feats.filter((f) => f === 'k1' || f === 'bogus' || f === 7), title: w.title ?? null }; });
  assert.deepEqual(fixed, { feats: ['k1'], title: null }, 'a damaged list is repaired: unknown and doubled feats dropped, an unearned title taken off');

  // ---- seven tabs fit the narrowest phone
  const fit = await E(page, () => { const t = document.querySelector('.wt-tabs').getBoundingClientRect(); return [...document.querySelectorAll('.wt-tab')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= t.left - 1 && r.right <= t.right + 1 && r.right <= window.innerWidth; }); });
  assert.ok(fit, 'seven tabs fit an iPhone SE');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser watch feats: the first feat earned with a toast, a dot and +2% blows; the tab, a title worn on the Hero tab; kept through an Ascension and a reload; a damaged list repaired; all checks passed');
} finally {
  await browser.close();
  close();
}
