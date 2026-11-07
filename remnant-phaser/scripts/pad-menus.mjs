// Menus for every hand (POLISH_PLAN §19 phase 5): the home screen and the Watch are layers of the shared menu
// navigation (remnant/src/ui/dom.ts), so a controller works them. On the home screen the first button is focused with a
// visible ring, the d-pad moves between the buttons and the mode cards, and ✕ presses the one in focus. In the Watch
// R1 changes the tab, ○ goes to Leave without leaving, and ✕ there leaves. Settings → Text size reaches this build's
// own panels from the first screen: at Extra large the home's and the Watch's text is larger and neither scrolls
// sideways. A fake DualSense stands in for the pad, as in the original's travel-camera test. Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
// Standard mapping: 0 ✕, 1 ○, 5 R1, 12–15 the d-pad (up, down, left, right).
const B = { cross: 0, circle: 1, r1: 5, up: 12, down: 13, left: 14, right: 15 };

const open = async (ctx, settings) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.addInitScript((st) => {
    const pad = { index: 0, id: 'DualSense Wireless Controller', mapping: 'standard', connected: true, timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
    if (st) localStorage.setItem('remnant-phaser.settings.v1', JSON.stringify(st));
  }, settings ?? null);
  await page.goto(base + '?debug');
  await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title') && document.querySelector('.hm-card'), null, { timeout: 60000 });
  await page.waitForTimeout(300);
  return page;
};
/** Press and release a pad button over a few frames, as a thumb does. */
const press = async (page, i) => {
  await E(page, (i) => { const b = window.__pad.buttons[i]; b.pressed = true; b.value = 1; window.__pad.timestamp++; }, i);
  await page.waitForTimeout(120);
  await E(page, (i) => { const b = window.__pad.buttons[i]; b.pressed = false; b.value = 0; window.__pad.timestamp++; }, i);
  await page.waitForTimeout(120);
};
const focused = (page) => E(page, () => document.activeElement?.dataset?.k ?? document.activeElement?.tagName ?? null);

try {
  // ---- the home screen
  {
    const page = await open(await browser.newContext({ viewport: { width: 1280, height: 720 } }));
    await press(page, B.down); // the first press wakes the pad and brings focus in
    await page.waitForFunction(() => document.querySelector('.hm')?.contains(document.activeElement), null, { timeout: 5000 });
    const first = await focused(page);
    const ring = await E(page, () => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; });
    assert.ok(ring, `the focused control shows a ring (${first})`);
    // The d-pad walks the screen, through the cards.
    const seen = new Set([first]);
    for (let i = 0; i < 6; i++) { await press(page, i < 3 ? B.down : B.right); seen.add(await focused(page)); }
    assert.ok(seen.size >= 3, `the d-pad moves between the buttons (${[...seen].join(', ')})`);
    // ✕ on the Watch's card opens the Watch.
    await E(page, () => document.querySelector('[data-k=title_watch]').focus());
    await press(page, B.cross);
    await page.waitForFunction(() => window.__remnant?.watch?.w, null, { timeout: 30000 });
    console.log(`Home: ${first} focused first with a ring; the d-pad visited ${[...seen].join(', ')}; ✕ on a card opened the Watch`);

    // ---- the Watch
    await page.waitForTimeout(400);
    await press(page, B.down);
    await page.waitForFunction(() => document.querySelector('.wt-root')?.contains(document.activeElement), null, { timeout: 5000 });
    const tab0 = await E(page, () => document.querySelector('.wt-tab.on')?.dataset.k);
    await press(page, B.r1);
    const tab1 = await E(page, () => document.querySelector('.wt-tab.on')?.dataset.k);
    assert.ok(tab0 && tab1 && tab0 !== tab1, `R1 changes the tab (${tab0} → ${tab1})`);
    await press(page, B.circle);
    assert.equal(await focused(page), 'wt_leave', '○ goes to Leave');
    assert.ok(await E(page, () => window.__remnant.game.scene.isActive('watch')), '…without leaving');
    await press(page, B.cross);
    await page.waitForFunction(() => window.__remnant.game.scene.isActive('title'), null, { timeout: 30000 });
    console.log(`Watch: R1 turned ${tab0} to ${tab1}; ○ went to Leave and ✕ there left`);
    await page.context().close();
  }

  // ---- Text size reaches this build's own panels, and nothing scrolls sideways
  {
    const sizes = {};
    for (const textSize of ['normal', 'xl']) {
      const page = await open(await browser.newContext({ ...devices['iPhone SE'] }), { textSize, v: 5 });
      const home = await E(page, () => ({ cls: document.documentElement.className, btn: parseFloat(getComputedStyle(document.querySelector('.hm-btn')).fontSize), fits: document.querySelector('.hm').scrollWidth <= document.querySelector('.hm').clientWidth + 1 }));
      await page.click('[data-k=title_watch]');
      await page.waitForFunction(() => window.__remnant?.watch?.w && document.querySelector('.wt-card'), null, { timeout: 30000 });
      await page.waitForTimeout(500);
      const watch = await E(page, () => {
        const p = document.querySelector('.wt-panel'), card = document.querySelector('.wt-card .n') ?? document.querySelector('.wt-card');
        const over = [...document.querySelectorAll('.wt-hud *, .wt-panel *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName);
        return { card: parseFloat(getComputedStyle(card).fontSize), fits: p.scrollWidth <= p.clientWidth + 1, over: over.slice(0, 4) };
      });
      sizes[textSize] = { home, watch };
      await page.screenshot({ path: `qa/watch-text-${textSize}.png` });
      await page.context().close();
    }
    const { normal, xl } = sizes;
    assert.ok(/text-xl/.test(xl.home.cls), 'the saved text size is applied at start');
    assert.ok(xl.home.btn > normal.home.btn * 1.2, `the home's buttons grow (${normal.home.btn} → ${xl.home.btn} px)`);
    assert.ok(xl.watch.card > normal.watch.card * 1.2, `the Watch's text grows (${normal.watch.card} → ${xl.watch.card} px)`);
    for (const k of ['normal', 'xl']) {
      assert.ok(sizes[k].home.fits && sizes[k].watch.fits, `${k}: no sideways scroll`);
      assert.deepEqual(sizes[k].watch.over, [], `${k}: nothing in the Watch runs off the screen`);
    }
    console.log(`Text size: the home's buttons ${normal.home.btn} → ${xl.home.btn} px, the Watch's cards ${normal.watch.card} → ${xl.watch.card} px, nothing off the screen`);
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser pad menus: all checks passed');
} finally {
  await browser.close();
  close();
}
