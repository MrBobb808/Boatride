import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const dist = resolve('dist'), errors = [];
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try {
    const file = resolve(dist, path);
    if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });
async function boot(context) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = true;
    s.level = 50;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  return page;
}
try {
 const ctx = await browser.newContext({ viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
 const page = await boot(ctx);
 await page.evaluate(() => {
   const a = window.__remnant, s = a.G.save;
   s.flags.relic_taken = false; s.flags.trial_best = 30; s.flags.boss_trial_best = 6;
   localStorage.setItem('remnant-save-2', JSON.stringify(s)); a.load(2);
   a.G.ui.openMenu('settings');
 });
 const button = page.locator('[data-k=settings_tw_30]');
 assert.ok(await button.isVisible());
 const bounds = await button.boundingBox(); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 402, 'Round 30 must be on the initial phone Settings view');
 assert.equal(await page.locator('[data-k=settings_bt_6]').count(), 1);
 await page.screenshot({ path: 'qa/settings-wave-access-phone.png' });
 await button.click();
 await page.waitForFunction(() => window.__remnant.G.world.room.id === 'trial_arena' && window.__remnant.G.world.story.ch3.rounds.from === 30);
 assert.equal(await page.evaluate(() => window.__remnant.G.save.flags.trial_best), 30);
 await page.waitForFunction(() => !window.__remnant.G.world.transitioning);
 console.log('Saved round 30 stays unlocked without the story flag; phone Settings opens the actual survival checkpoint');
 await page.evaluate(() => {
   const a = window.__remnant, s = a.G.save;
   a.G.world.story.ch3.rounds.stop(false);
   s.room = 'sanctuary'; s.spawn = 'start';
   delete s.flags.trial_best; delete s.flags.boss_trial_best;
   s.trialMilestones = []; s.inventory = s.inventory.filter(i => !i.trialWave);
   localStorage.setItem('remnant.board.v1', JSON.stringify([{ id: 1, name: 'Elior', rounds: 30, kills: 120, time: 200, level: 50, date: '2026-10-18' }]));
   localStorage.setItem('remnant.boss-board.v1', JSON.stringify([{ id: 2, name: 'Elior', rounds: 12, kills: 12, time: 200, level: 50, date: '2026-10-18' }]));
   localStorage.setItem('remnant-save-2', JSON.stringify(s)); a.load(2); a.G.ui.openMenu('settings');
 });
 assert.equal(await page.locator('[data-k=settings_tw_30]').count(), 1);
 assert.equal(await page.locator('[data-k=settings_bt_12]').count(), 1);
 assert.equal(await page.locator('[data-k=settings_bt_30]').count(), 0);
 assert.deepEqual(await page.evaluate(() => ({ best: window.__remnant.G.save.flags.trial_best ?? null, gear: window.__remnant.G.save.inventory.filter(i => i.trialWave).length })), { best: null, gear: 0 });
 await page.locator('[data-k=settings_tw_30]').click();
 await page.waitForFunction(() => window.__remnant.G.world.room.id === 'trial_arena' && window.__remnant.G.world.story.ch3.rounds.from === 30);
 assert.equal(await page.evaluate(() => { const R = window.__remnant.G.world.story.ch3.rounds; R.completed = 30; R.stop(); return JSON.parse(localStorage.getItem('remnant.board.v1')).length; }), 1);
 console.log('Device records restore practice options without awarding gear at menu open; checkpoint runs stay unranked and boss/survival records stay separate');
 await page.goto(base + '?debug');
 await page.getByRole('button', { name: /^Settings$/i }).click();
 await page.locator('[data-k=load_game_modes]').click();
 await page.locator('[data-k=settings_tw_30]').waitFor();
 assert.equal(await page.evaluate(() => window.__remnant.G.slot), 2);
 await page.evaluate(() => {
   const a = window.__remnant, s = a.G.save;
   localStorage.removeItem('remnant.board.v1'); localStorage.removeItem('remnant.boss-board.v1');
   delete s.flags.trial_best; delete s.flags.boss_trial_best;
   s.trialMilestones = [30]; s.room = 'sanctuary'; s.spawn = 'start';
   localStorage.setItem('remnant-save-2', JSON.stringify(s));
 });
 await page.goto(base + '?debug'); await page.waitForFunction(() => !!window.__remnant);
 await page.evaluate(() => { const a = window.__remnant; a.load(2); a.G.ui.openMenu('settings'); });
 assert.equal(await page.locator('[data-k=settings_tw_30]').count(), 1);
 await page.keyboard.press('Escape');
 await page.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
 const positions = await page.evaluate(() => ({ start: document.querySelector('[data-k=tw_30]').getBoundingClientRect().top, rewards: document.querySelector('.trial-rewards').getBoundingClientRect().top }));
 assert.ok(positions.start < positions.rewards, 'Chapter wave controls must come before the trophy catalog');
 assert.deepEqual(errors, []);
 console.log('Title Settings resumes the saved journey into mode selection; earned milestone recovery and Chapter controls above rewards passed');
 await ctx.close();
} finally { await browser.close(); await new Promise(r => server.close(r)); }
