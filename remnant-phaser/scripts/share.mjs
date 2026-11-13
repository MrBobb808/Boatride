// Result cards (src/game/shareCard.ts, remnant/src/ui/share.ts; NEXT_PLAN C5). The Trial's Game Over card and the
// Horde's results offer "Share this run"; where the browser cannot share files it saves the card: a 1080×1350 PNG of
// the mode, the date, the result and the build. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
/** A PNG's width and height, from its header. */
const size = (file) => { const b = readFileSync(file); return { png: b.toString('ascii', 1, 4) === 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }; };

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

  // ---- the Trial: a fall opens the Game Over card, which offers the card
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  await E(page, () => { const w = window.__remnant.world; Object.assign(w.save.flags, { relic_taken: true, intro_done: true }); w.save.level = 12; w.persist(); });
  // (From the home screen: the first visit's `fresh` would begin a new journey again.)
  await page.goto(base + '?debug');
  await until(page, () => document.querySelector('[data-k=title_trial]'));
  await page.click('[data-k=title_trial]');
  await until(page, () => window.__remnant?.world?.room?.id === 'trial_arena' && !window.__remnant.world.transitioning);
  await until(page, () => window.__remnant.world.classic.ents.some((e) => e.isFoe), null, 90000);
  await E(page, () => window.__remnant.world.player.die());
  await page.waitForSelector('[data-k=go_share]', { timeout: 30000 });
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('[data-k=go_share]')]);
  const f1 = await d1.path(), s1 = size(f1);
  assert.ok(s1.png && s1.w === 1080 && s1.h === 1350 && s1.bytes > 20000, `the Trial's card is a 1080×1350 picture (${JSON.stringify(s1)}, ${d1.suggestedFilename()})`);
  assert.match(d1.suggestedFilename(), /^remnant-the-trial-of-the-remnant\.png$/, 'it is named for the mode');
  assert.equal(await E(page, () => document.querySelector('[data-k=go_share]').textContent), 'Saved the card', 'the button says the card was saved');
  await page.click('[data-k=go_leave]');
  console.log(`Trial: ${d1.suggestedFilename()}, ${s1.w}×${s1.h}, ${Math.round(s1.bytes / 1024)} KB`);

  // ---- the Horde's results offer it too
  await page.goto(base + '?debug&horde&nocamp');
  await until(page, () => window.__remnant?.horde?.hero?.sprite && window.__remnant.game.scene.isActive('horde'));
  await E(page, () => { const h = window.__remnant.horde; h.kills = 321; h.stage = 4; h.openPause(); });
  await page.click('[data-k=hz_leave]');
  await page.waitForSelector('[data-k=go_share]');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-k=go_share]')]);
  const s2 = size(await d2.path());
  assert.ok(s2.png && s2.w === 1080 && s2.h === 1350 && /^remnant-the-horde\.png$/.test(d2.suggestedFilename()), `the Horde's card too (${JSON.stringify(s2)}, ${d2.suggestedFilename()})`);
  await d2.saveAs('qa/share-horde.png');
  console.log(`Horde: ${d2.suggestedFilename()}, ${s2.w}×${s2.h}`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser share: all checks passed');
} finally {
  await browser.close();
  close();
}
