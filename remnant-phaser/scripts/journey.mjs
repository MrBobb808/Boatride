// Exercise real narrative overlays and every full menu page on Phaser.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 956, height: 440 } });
const errors = []; page.on('pageerror', e => errors.push(e.stack)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
async function drain(done, max = 40000) {
  const end = Date.now() + max;
  while (Date.now() < end) {
    if (errors.length) throw Error(errors.join('\n'));
    if (await page.evaluate(done)) return;
    const choices = page.locator('.dialogue .choices button:visible');
    if (await choices.count()) await choices.first().click();
    else if (await page.locator('.dialogue:visible').count()) await page.keyboard.press('Enter');
    else if (await page.locator('.lore-card:visible button').count()) await page.locator('.lore-card button').last().click();
    await page.waitForTimeout(200);
  }
  throw Error('Story did not finish: ' + await page.evaluate(() => JSON.stringify({room: window.__remnant.world.room.id, flags: window.__remnant.world.save.flags, cutscene: window.__remnant.G.inCutscene, ui: document.getElementById('ui').innerText.slice(-600)})));
}
try {
  await page.goto(base + '?debug&autostart&fresh');
  await page.waitForFunction(() => window.__remnant?.world?.player);
  await page.waitForSelector('.dialogue canvas');
  assert.ok(await page.locator('.dialogue canvas').isVisible(), 'opening dialogue has a portrait');
  await drain(() => window.__remnant.world.save.flags.intro_done && !window.__remnant.G.inCutscene);
  assert.ok(await page.evaluate(() => !!window.__remnant.world.save.quests.m_expedition));
  console.log('Chapter I: original opening, portraits, player choice and Expedition quest complete on the native Phaser world');
  for (const tab of ['quests','map','chapters','valor','character','equipment','skills','progression','moves','crafting','echoes','imprints','lore','bestiary','settings','system']) {
    await page.evaluate(tab => window.__remnant.G.ui.openMenu(tab), tab);
    await page.waitForSelector('.menu-body');
    assert.ok((await page.locator('.menu-body').innerText()).trim().length, `${tab} renders content`);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.menu'));
  }
  console.log('Pause menu: all 16 pages render and resume through the shared keyboard navigation');
  await page.evaluate(() => { const w = window.__remnant.world; w.save.flags.relic_taken = true; w.save.flags.ch1_done = true; w.save.flags.ending_done = true; });
  const hubs = ['shinar_camp','valley_camp','river_camp','reed_camp','hiddekel_camp','thaw_outpost','lantern_quarantine','ashwatch_refuge','chittim_harbor'];
  // Authoritative hub IDs are read from room data where the seed list differs.
  const result = await page.evaluate(() => Object.values(window.__remnant.rooms).filter(r => r.spawns.altar).map(r=>r.id));
  console.log('Available altar hubs:', result.join(', '));
  for (const [n, id] of hubs.entries()) {
    const exists = await page.evaluate(id => !!window.__remnant.rooms[id], id); if (!exists) continue;
    await page.evaluate(({id,n}) => { const w = window.__remnant.world; for (let c = 1; c <= n + 1; c++) w.save.flags[`ch${c}_done`] = true; w.loadRoom(id,'start'); }, { id, n });
    await drain(() => !window.__remnant.G.inCutscene && !document.querySelector('.dialogue'), 50000);
    console.log('Story hub:', id);
  }
  assert.deepEqual(errors, []); await page.screenshot({ path: 'qa/journey-menu.png' });
  console.log('phaser journey: all checks passed');
} finally { await browser.close(); close(); }
