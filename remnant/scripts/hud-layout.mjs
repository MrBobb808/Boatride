// The HUD in a boss fight: on every iPhone size in landscape (island side
// simulated) the boss's bar sits in its own lane, clear of Elior's health
// column and the minimap and inside the screen, its name not cut off; the
// Gauntlet's round label sits under it. On a keyboard the bar is at the
// bottom as before. Run after `npm run build`.
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
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const hit = (a, b) => a[2] > 0 && b[2] > 0 && a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Into the Boss Gauntlet with a full left column (Echoes, hearts, points, the Mantle ready), until the boss is up. */
async function fight(page) {
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const { G } = window.__remnant, s = G.save;
    G.ui.dialogue = async () => 0; s.flags.relic_taken = true; s.level = 40; s.mantle = 100; s.hearts = 12; s.statPoints = 3;
    s.echoes = [{ uid: 'e1', species: 'sentinel', level: 3, xp: 0, stage: 1, hp: 100 }, { uid: 'e2', species: 'archer', level: 3, xp: 0, stage: 1, hp: 100 }]; s.active = ['e1', 'e2'];
    for (const l of document.querySelectorAll('.layer')) l.remove(); G.inCutscene = false;
    window.__remnant.trial(true);
  });
  await page.waitForFunction(() => { const W = window.__remnant.G.world; return W.room.id === 'trial_arena' && !W.transitioning; }, null, { timeout: 15000 });
  await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
    for (let i = 0; i < 6000 && !(R.round === 1 && W.boss?.phase === 1 && W.boss.invuln === 0 && !G.inCutscene); i++) W.update(1 / 120);
    W.player.invuln = 999;
  });
  await page.waitForTimeout(500);
  return page.evaluate(() => { const h = window.__remnant.hud; return { column: [...h.column], boss: [...h.boss], map: [...h.map], W: innerWidth, H: innerHeight }; });
}

try {
  for (const [w, h] of [[667, 375], [844, 390], [932, 430], [956, 440]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
    // Headless Chromium has no safe areas: give the measuring probe an island phone's landscape insets.
    await ctx.addInitScript(() => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'div[style*="safe-area-inset-left"]{padding:0 59px 21px 59px !important}'; document.head.appendChild(st); }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?debug&autostart&island=left');
    await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
    await page.touchscreen.tap(w / 2, h / 2);
    await page.evaluate(() => dispatchEvent(new Event('resize')));
    const b = await fight(page);
    const tag = `${w}×${h}`;
    assert.ok(b.boss[2] > 100, `${tag}: boss bar drawn ${JSON.stringify(b.boss)}`);
    assert.ok(!hit(b.boss, b.column), `${tag}: boss bar clear of Elior's column ${JSON.stringify(b)}`);
    assert.ok(!hit(b.boss, b.map), `${tag}: boss bar clear of the minimap ${JSON.stringify(b)}`);
    assert.ok(b.boss[1] >= 0 && b.boss[0] >= 0 && b.boss[0] + b.boss[2] <= w, `${tag}: boss bar and name on screen ${JSON.stringify(b.boss)}`);
    await page.screenshot({ path: `qa/hud-boss-${w}x${h}.png` });
    console.log(`${tag}: boss bar ${Math.round(b.boss[2])} px wide at x ${Math.round(b.boss[0])}, column ends ${Math.round(b.column[0] + b.column[2])}, minimap starts ${Math.round(b.map[0])}`);
    await ctx.close();
  }
  // Keyboard: the boss bar stays at the bottom, away from the top-left column.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.keyboard.press('KeyD');
  const b = await fight(page);
  assert.ok(b.boss[1] > b.H / 2 && !hit(b.boss, b.column), `desktop: boss bar at the bottom ${JSON.stringify(b)}`);
  await page.screenshot({ path: 'qa/hud-boss-desktop.png' });
  await ctx.close();
  assert.deepEqual(errors, []);
  console.log('hud-layout: all checks passed');
} finally {
  await browser.close(); server.close();
}
