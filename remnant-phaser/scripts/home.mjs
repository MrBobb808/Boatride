// The home screen (scenes/Title.ts, game/home.ts): the journey card and every game mode as a card. With no journey,
// Begin leads and the modes that need one say so; with one, Continue shows where it stands, the modes open by what
// the journey has done, and a card starts its mode straight away (the Trial's arena, the Chapters page, the Watch).
// It fits a phone upright and sideways without sideways scrolling. Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const MODES = ['chapters', 'watch', 'horde', 'trial', 'extreme', 'gauntlet', 'rush', 'daily'];

try {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  const home = async () => {
    await page.goto(base + '?debug');
    await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title') && document.querySelector('.hm-card'), null, { timeout: 60000 });
    await page.waitForTimeout(400);
  };
  const cards = () => E(page, () => Object.fromEntries([...document.querySelectorAll('.hm-card')].map((c) => [c.dataset.k.slice(6), { locked: c.classList.contains('locked'), text: c.textContent }])));
  const fits = () => E(page, () => { const h = document.querySelector('.hm'); return h.scrollWidth <= h.clientWidth + 1; });

  // ---- no journey yet
  await home();
  let c = await cards();
  assert.deepEqual(Object.keys(c), MODES, 'every game mode has a card on the home screen');
  assert.ok(!c.watch.locked && !c.horde.locked, 'the Watch and the Horde need no journey');
  assert.ok(['chapters', 'trial', 'rush', 'daily'].every((m) => c[m].locked && /Begin the journey first/.test(c[m].text)), 'the journey\'s modes say what they need');
  assert.equal(await E(page, () => document.querySelector('[data-k=title_first]').textContent), 'Begin');
  assert.ok(await fits(), 'no sideways scroll on a phone');
  await page.screenshot({ path: 'qa/home-new.png' });

  // ---- a journey with the relic recovered and two bosses beaten
  await page.click('[data-k=title_first]');
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  await E(page, () => { const w = window.__remnant.world, s = w.save; s.level = 30; s.silver = 1234; s.flags.relic_taken = true; s.defeated = [...new Set([...(s.defeated ?? []), 'idol', 'gatekeeper'])]; w.persist(); });
  await home();
  c = await cards();
  assert.ok(MODES.every((m) => !c[m].locked), `with the relic and two bosses every mode is open (${MODES.filter((m) => c[m].locked)})`);
  const journey = await E(page, () => document.querySelector('.hm-journey').textContent);
  assert.ok(/Level 30/.test(journey) && /1234 silver/.test(journey) && /Continue/.test(journey), `the journey card shows where it stands (${journey})`);
  assert.ok(/2 bosses ready/.test(c.rush.text), 'the Boss Rush counts the bosses ready');
  await page.screenshot({ path: 'qa/home.png' });

  // ---- a card starts its mode: the Trial's arena
  await page.click('[data-k=title_trial]');
  await page.waitForFunction(() => window.__remnant?.world?.room?.id === 'trial_arena' && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  assert.equal(await E(page, () => document.querySelector('.hm')), null, 'the home screen is gone once the mode starts');
  console.log('Trial: the card went straight to the arena');

  // ---- Chapters opens the Chapters page on the journey
  await home();
  await page.click('[data-k=title_chapters]');
  await page.waitForFunction(() => !!document.querySelector('#ui .menu [data-k=ch_1]'), null, { timeout: 60000 });
  console.log('Chapters: the card opened the Chapters page');

  // ---- sideways
  await home();
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForFunction(() => document.querySelector('.hm-card'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  assert.ok(await fits(), 'no sideways scroll on a phone held sideways');
  const cols = await E(page, () => new Set([...document.querySelectorAll('.hm-card')].map((c) => Math.round(c.getBoundingClientRect().left))).size);
  assert.equal(cols, 4, 'sideways, the modes sit four to a row beside the journey');
  const fold = await E(page, () => Math.max(...[...document.querySelectorAll('.hm-card')].map((c) => c.getBoundingClientRect().bottom)) <= innerHeight);
  assert.ok(fold, 'sideways, all eight modes are on screen without scrolling');
  await page.screenshot({ path: 'qa/home-landscape.png' });

  // ---- the Watch's card goes in
  await page.click('[data-k=title_watch]');
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('watch'), null, { timeout: 30000 });
  console.log('Watch: the card went into the Watch');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser home: all checks passed');
} finally {
  await browser.close();
  close();
}
