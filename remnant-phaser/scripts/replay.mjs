// Replaying a finished chapter (Pause → Chapters → Replay): its boss stands again in its arena, wakes when Elior
// steps in (the story, having told the fight, would let it sleep), falls, and pays nothing a second time; leaving the
// chapter ends the replay. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&autostart&fresh');
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  const drain = async (done, max = 30000) => { const end = Date.now() + max; while (Date.now() < end && !(await E(page, done))) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); } };
  const calm = () => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene && !window.__remnant.world.transitioning;
  await drain(calm, 40000); await page.waitForTimeout(500); await drain(calm);
  // A journey that finished Chapter VII and broke Varkhos.
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    s.level = 60; (s.defeated ??= []).push('beast_monarch');
    Object.assign(s.flags, { ending_done: true, relic_taken: true, ch6_done: true, ch7_intro: true, ch7_done: true, ch7_boundary_open: true, defeated_beast_monarch: true });
    w.refreshStats();
  });

  const replay = async () => {
    await E(page, () => window.__remnant.G.ui.openMenu('chapters'));
    await page.click('[data-k=ch_replay_7]');
    await page.waitForFunction(() => window.__remnant.world.save.replay === 7 && !window.__remnant.world.transitioning);
    await drain(calm);
    await E(page, () => window.__remnant.warp('hunt_throne', 'start'));
    await page.waitForFunction(() => window.__remnant.world.room.id === 'hunt_throne' && !window.__remnant.world.transitioning);
    await page.waitForTimeout(500);
    const standing = await E(page, () => window.__remnant.world.boss?.state);
    assert.equal(standing, 'dormant', 'on a replay the broken Crown stands in its throne room again');
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'beast_monarch_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await drain(() => ['idle', 'attack'].includes(window.__remnant.world.boss?.state));
    assert.ok(await E(page, () => ['idle', 'attack'].includes(window.__remnant.world.boss?.state)), 'stepping in wakes him for the rematch');
    const before = await E(page, () => ({ items: window.__remnant.world.save.inventory.length, silver: window.__remnant.world.save.silver }));
    await E(page, () => { const w = window.__remnant.world, b = w.boss; window.__god = setInterval(() => { if (!w.player.dead) w.player.hp = w.player.maxHp; }, 30); b.hp = 1; b.hit(99, 1, 0, false); });
    await page.waitForTimeout(3500);
    await drain(calm);
    return E(page, (b) => { clearInterval(window.__god); const s = window.__remnant.world.save; return { items: s.inventory.length - b.items, state: window.__remnant.world.boss?.state ?? 'gone' }; }, before);
  };
  const first = await replay();
  const second = await replay();
  assert.equal(second.items, 0, `a second replay pays no gear again (${JSON.stringify({ first, second })})`);
  console.log(`Replay: Varkhos stood and fell twice; the first rematch paid ${first.items} pieces still owed, the second none`);

  // Leaving the chapter ends the replay.
  await E(page, () => window.__remnant.warp('sanctuary', 'start'));
  await page.waitForFunction(() => window.__remnant.world.room.id === 'sanctuary' && !window.__remnant.world.transitioning);
  assert.equal(await E(page, () => window.__remnant.world.save.replay), undefined, 'leaving the chapter ends the replay');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser replay: all checks passed');
} finally {
  await browser.close();
  close();
}
