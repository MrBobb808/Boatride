// The Watch's pacing (POLISH_PLAN §19 phase 3, G12; src/game/watch/balance.ts): a plain player played through on the
// live wall's stage model. Prints the first upgrades' waits, each gate's time and each Ascension against the last, and
// checks them against the idle-economy skill's targets. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const t = (s) => s < 120 ? `${s.toFixed(1)} s` : s < 7200 ? `${(s / 60).toFixed(1)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`;
try {
  const page = await browser.newPage();
  await page.goto(base + '?debug');
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
  await page.click('[data-k=title_watch]');
  await page.waitForFunction(() => window.__remnant?.watchPace, null, { timeout: 30000 });
  const p = await page.evaluate(() => window.__remnant.watchPace(6));
  console.log('First upgrades, seconds apart:', p.firstBuys.map((s) => s.toFixed(1)).join(', '));
  console.log('Gates (first run):', p.gates.map((s, g) => (s != null ? `${g}: ${t(s)}` : null)).filter(Boolean).join(' · '));
  for (const [i, r] of p.runs.entries()) console.log(`Ascension ${i + 1}: ${t(r.secs)}, best stage ${r.best}, ${r.seals} Seals, ×${r.vsPrev} the one before`);
  if (process.argv.includes('--report')) process.exit(0);
  // The skill's targets: the first upgrades in seconds; each Ascension only a little longer than the last.
  // The model buys at the end of each stage, so the first ten come in bursts: their average wait is the measure.
  const tenth = p.firstBuys.reduce((a, b) => a + b, 0), each = tenth / p.firstBuys.length;
  console.log(`The first ten upgrades: ${t(tenth)} in all, ${each.toFixed(1)} s each on average`);
  assert.ok(each <= 10, `the first upgrades come seconds apart (${each.toFixed(1)} s each on average)`);
  const climb = p.runs.map((r) => r.best);
  assert.ok(climb.every((b, i) => i === 0 || b >= climb[i - 1]) && climb[climb.length - 1] > climb[0] + 40, `each Ascension reaches as far or further (${climb})`);
  const later = p.runs.slice(1).map((r) => r.vsPrev);
  assert.ok(later.length >= 3 && later.every((v) => v <= 1.6), `each Ascension takes at most ×1.6 the one before (${later})`);
  console.log('phaser watch pace: all checks passed');
} finally {
  await browser.close();
  close();
}
