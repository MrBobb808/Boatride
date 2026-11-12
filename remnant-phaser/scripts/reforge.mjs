// Reforging at Dov (remnant/src/game/reforge.ts; NEXT_PLAN C3). His Reforge tab lists each rolled line of a piece with
// its range and the chance a reforge betters it; a reforge costs silver and Relic Shards, keeps the better of the old
// value and the new (a line is never made worse), and a line at the top of its range cannot be reforged.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);

try {
  const page = await (await browser.newContext({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });

  // A rare piece with two lines: one at the bottom of its range, one at the top.
  const made = await E(page, () => {
    const s = window.__remnant.world.save;
    const id = s.inventory.find((i) => i.id && !i.qty)?.id ?? s.inventory[0]?.id;
    const k = 1 + 3 * 0.15;
    const it = { uid: 'rf_test', id, rarity: 3, plus: 0, affixes: [{ key: 'hp', v: Math.round(6 * k) }, { key: 'atk', v: Math.round(6 * k) }] };
    s.inventory.push(it); s.silver = 5000; s.materials.relic_dust = 10;
    window.__remnant.G.ui.openShop('smith');
    return { id, lo: Math.round(6 * k), hi: Math.round(18 * k) };
  });
  assert.ok(made.id, 'a piece of gear is in the pack to test with');
  await page.click('[data-k=shop_reforge]');
  await page.waitForSelector('[data-k=rf_rf_test_0]');
  const shown = await E(page, () => ({ low: document.querySelector('[data-k=rf_rf_test_0]').textContent, top: document.querySelector('[data-k=rf_rf_test_1]').textContent, topOff: document.querySelector('[data-k=rf_rf_test_1]').disabled }));
  assert.ok(/Reforge · \d+%/.test(shown.low) && shown.top === 'At its best' && shown.topOff, `a low line shows its chance; a line at the top cannot be reforged (${JSON.stringify(shown)})`);
  await page.screenshot({ path: 'qa/reforge.png' });

  // Reforge the low line until it is at its best: it never falls, and every try is paid for.
  let last = made.lo, tries = 0, rose = 0;
  for (; tries < 60; tries++) {
    const off = await E(page, () => document.querySelector('[data-k=rf_rf_test_0]')?.disabled ?? true);
    if (off) break;
    const before = await E(page, () => { const s = window.__remnant.world.save; return { silver: s.silver, dust: s.materials.relic_dust }; });
    await E(page, () => { const s = window.__remnant.world.save; s.silver = Math.max(s.silver, 5000); s.materials.relic_dust = Math.max(s.materials.relic_dust, 10); });
    const b2 = await E(page, () => { const s = window.__remnant.world.save; return { silver: s.silver, dust: s.materials.relic_dust }; });
    void before;
    await page.click('[data-k=rf_rf_test_0]');
    const now = await E(page, () => { const s = window.__remnant.world.save, it = s.inventory.find((i) => i.uid === 'rf_test'); return { v: it.affixes[0].v, silver: s.silver, dust: s.materials.relic_dust }; });
    assert.ok(now.v >= last, `a reforge never makes a line worse (${last} → ${now.v})`);
    assert.ok(now.silver === b2.silver - 480 && now.dust === b2.dust - 2, `each reforge of an epic piece costs 480 silver and 2 shards (${JSON.stringify({ b2, now })})`);
    if (now.v > last) rose++;
    last = now.v;
  }
  assert.ok(last === made.hi && rose >= 1, `reforging carries the line to the top of its range (${made.lo} → ${last} of ${made.hi}, ${tries} tries)`);
  const end = await E(page, () => document.querySelector('[data-k=rf_rf_test_0]').textContent);
  assert.equal(end, 'At its best', 'at the top of its range the line is done');
  console.log(`Reforge: health ${made.lo} → ${last} (its range ${made.lo}–${made.hi}) in ${tries} tries, never worse; a line at its best is left alone`);

  // ---- the loot filter (Ilan's Sell tab): how rare spare gear can be and still count as junk; it is kept
  const count = () => E(page, () => { const b = document.querySelector('[data-k=sell_junk]'); return b ? Number(/· (\d+) item/.exec(b.textContent)?.[1] ?? 0) : 0; });
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await E(page, () => { const { G } = window.__remnant, s = window.__remnant.world.save; G.ui.openShop('merchant');
    // Spares of every rarity in a worn slot: a Legendary Power keeps one out of the junk whatever its rarity.
    const worn = s.inventory.find((i) => Object.values(s.equipment).includes(i.uid));
    if (worn) { worn.rarity = 4; for (let r = 0; r < 4; r++) s.inventory.push({ uid: 'jk' + r, id: worn.id, rarity: r, plus: 0, affixes: [] }); s.inventory.push({ uid: 'jkL', id: worn.id, rarity: 2, plus: 0, affixes: [], legend: 'x' }); } });
  await page.click('[data-k=shop_sell]');
  const seen = [];
  for (const r of [0, 1, 2, 3]) { await page.click(`[data-k=junk_${r}]`); await page.waitForFunction((r) => document.querySelector(`[data-k=junk_${r}]`)?.classList.contains('primary'), r); seen.push(await count()); }
  const kept = await E(page, () => window.__remnant.world.save.store.junk);
  assert.ok(seen.every((n, i) => i === 0 || n >= seen[i - 1]) && seen[3] > seen[0] && kept === 3, `a higher filter takes more as junk, and it is kept (${seen}, ${kept})`);
  console.log(`Loot filter: junk up to Common ${seen[0]}, Uncommon ${seen[1]}, Rare ${seen[2]}, Epic ${seen[3]}`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser reforge: all checks passed');
} finally {
  await browser.close();
  close();
}
