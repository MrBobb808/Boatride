// The Boss Rush: entry from the Chapters tab, story order, breathers, the
// clock, the result card, its own leaderboard, and a campaign left untouched.
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
  await page.waitForFunction(() => window.__remnant.G.world.player.style && !window.__remnant.G.world.transitioning);
  return page;
}
// Everything the rush must leave alone (routing flags for the arena excepted).
const campaign = () => {
  const s = window.__remnant.G.save;
  const flags = Object.fromEntries(Object.entries(s.flags).filter(([k]) => !k.startsWith('trial_')).sort());
  return JSON.stringify({ flags, defeated: s.defeated, inventory: s.inventory, equipment: s.equipment, materials: s.materials, silver: s.silver, quests: s.quests,
    level: s.level, xp: s.xp, statPoints: s.statPoints, skillPoints: s.skillPoints, echoes: s.echoes.map(e => [e.uid, e.level, e.xp]), imprints: s.echoImprints ?? {},
    milestones: s.trialMilestones ?? [], kills: s.kills, bestiary: s.bestiary ?? {}, keyItems: s.keyItems, lore: s.lore });
};
const ROSTER = ['idol', 'gatekeeper', 'marshal', 'storm_prince', 'beast_monarch'];
const inRush = () => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return W.room.id === 'trial_arena' && R.active && R.rush && !W.transitioning; };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await boot(context);

  // Locked with one boss beaten.
  await page.evaluate(() => { const { G } = window.__remnant; G.save.defeated = ['idol']; G.ui.openMenu('chapters'); });
  assert.equal(await page.locator('[data-k=rush_start]').count(), 0);
  assert.match(await page.locator('[data-k=rush_locked]').innerText(), /defeat 2 bosses.*1\/2/i);
  await page.keyboard.press('Escape');

  // Five beaten, listed out of story order on purpose.
  const before = await page.evaluate(() => {
    const { G } = window.__remnant, s = G.save;
    s.defeated = ['beast_monarch', 'storm_prince', 'idol', 'marshal', 'gatekeeper'];
    s.silver = 1234; s.balm = 1; s.hp = Math.floor(G.d.maxHp * 0.5);
    localStorage.setItem('remnant.board.v1', '[]'); localStorage.setItem('remnant.boss-board.v1', '[]'); localStorage.removeItem('remnant.rush-board.v1');
    G.ui.openMenu('chapters');
    return { hp: s.hp, ce: s.ce, balm: s.balm, room: G.world.room.id };
  });
  const snap = await page.evaluate(campaign);
  assert.match(await page.locator('[data-k=rush_start]').innerText(), /5 bosses/i);
  await page.locator('[data-k=rush_start]').click();
  await page.waitForFunction(inRush, null, { timeout: 15000 });
  const entry = await page.evaluate(() => { const { G } = window.__remnant, R = G.world.story.ch3.rounds; return { keys: R.rushKeys, full: G.save.hp === G.d.maxHp, balm: G.save.balm === G.save.balmMax, bossOnly: R.bossOnly }; });
  assert.deepEqual(entry.keys, ['idol', 'gatekeeper', 'marshal', 'storm_prince', 'beast_monarch']);
  assert.ok(entry.full && entry.balm && entry.bossOnly, 'Run starts whole, bosses only');
  console.log('Locked hint, real menu click, story order and a fresh start passed');

  const run = await page.evaluate((roster) => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds, s = G.save;
    G.paused = true; W.player.invuln = 999;
    const until = (fn, max = 3600) => { for (let i = 0; i < max && !fn(); i++) W.update(1 / 120); if (!fn()) throw Error('Rush stalled at ' + R.round + ' ' + W.boss?.constructor.name + ' ' + W.boss?.state + ' ' + JSON.stringify([W.transitioning, W.rallyT, W.boss?.defeatT, W.boss?.remove, W.ents.includes(W.boss), W.hitstopT, W.slowT, R.completed, R.active, W.player.state])); };
    // The Fallen Crowns hold at each phase mark and ward during some attacks, so strike again when open.
    const kill = (b) => { for (let k = 0; k < 6 && !b.dying; k++) { until(() => b.dying || (b.invuln === 0 && b.fighting !== false && !b.ward), 2400); if (!b.dying) b.takeHit({ dmg: b.maxHp + 1, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'ability', dot: true }); } };
    const out = [];
    for (let n = 1; n <= roster.length; n++) {
      until(() => R.round === n && W.boss?.phase === 1 && W.boss.invuln === 0 && !G.inCutscene);
      // Each boss round revives Elior, which resets his invulnerability.
      W.player.invuln = 999;
      const b = W.boss;
      const add = W.spawnEnemy('husk', 300, 288);
      if (!add.remove || W.ents.includes(add)) throw Error('Ordinary add in the rush');
      s.hp = Math.floor(G.d.maxHp * 0.3); s.balm = 0;
      out.push({ n, key: b.key ?? 'idol', name: b.name, hp: b.maxHp, clock: R.time });
      kill(b);
      until(() => R.completed === n);
      if (W.bossActive || W.boss || G.inCutscene) throw Error('Encounter not released');
      if (n < roster.length) {
        const banner = [...document.querySelectorAll('.banner')].map(e => e.textContent).join('|');
        out[n - 1].after = { hp: s.hp / G.d.maxHp, balm: s.balm === s.balmMax, breakT: R.breakT, banner };
      }
    }
    const t0 = R.time;
    until(() => !!document.querySelector('[data-k=go_again]'), 400);
    for (let i = 0; i < 120; i++) W.update(1 / 120);
    G.paused = false;
    return { out, time: R.time, frozen: R.time === t0, rewards: { xp: s.xp, silver: s.silver } };
  }, ROSTER);
  assert.deepEqual(run.out.map(b => b.key), ROSTER);
  for (const b of run.out.slice(0, -1)) {
    assert.ok(Math.abs(b.after.hp - 0.65) < 0.02, `Breather heals 35% (${b.after.hp})`);
    assert.ok(b.after.balm, 'Breather refills Balm');
    assert.ok(b.after.breakT > 2.5 && b.after.breakT <= 3, 'Short breather');
  }
  for (let i = 0; i < run.out.length - 1; i++) assert.ok(run.out[i].after.banner.includes(`BOSS ${i + 2}/5`), run.out[i].after.banner);
  assert.ok(run.out.every((b, i) => i === 0 || b.clock > run.out[i - 1].clock), 'Clock runs through the breathers');
  assert.ok(run.frozen && run.time > 10, 'Clock stops at the finish');
  console.log('All five bosses fell in order with 35% heals, Balm refills, banners and a running clock:', run.out.map(b => b.name).join(' → '));

  // The result card and the board.
  await page.locator('[data-k=go_again]').waitFor();
  assert.ok(await page.getByText('RUSH COMPLETE', { exact: true }).isVisible());
  assert.ok(await page.getByText('5/5', { exact: true }).first().isVisible());
  assert.ok(await page.getByText('NEW BEST', { exact: true }).isVisible());
  await page.screenshot({ path: 'qa/boss-rush-result.png' });
  const boards = await page.evaluate(() => ({ rush: JSON.parse(localStorage.getItem('remnant.rush-board.v1')), boss: localStorage.getItem('remnant.boss-board.v1'), survival: localStorage.getItem('remnant.board.v1') }));
  assert.equal(boards.rush.length, 1);
  assert.equal(boards.rush[0].rounds, 5); assert.equal(boards.rush[0].total, 5); assert.equal(boards.rush[0].done, true);
  assert.ok(Math.abs(boards.rush[0].time - run.time) < 0.01);
  assert.equal(boards.boss, '[]'); assert.equal(boards.survival, '[]');
  await page.locator('[data-k=go_leave]').click();
  await page.waitForFunction((room) => { const W = window.__remnant.G.world; return W.room.id === room && !W.transitioning && !W.story.ch3.rounds.rush; }, before.room, { timeout: 15000 });
  const after = await page.evaluate(() => { const s = window.__remnant.G.save; return { hp: s.hp, ce: s.ce, balm: s.balm }; });
  // Energy trickles back on its own between the snapshot and the click; health and Balm do not.
  assert.equal(after.hp, before.hp); assert.equal(after.balm, before.balm); assert.ok(Math.abs(after.ce - before.ce) < 1);
  assert.equal(await page.evaluate(campaign), snap);
  console.log('Result card, rush board (separate from both Trial boards) and untouched campaign passed');

  // Merciless makes the same bosses bigger; a death ends the run as unfinished.
  await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
  await page.locator('[data-k=bdmerciless]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  assert.match(await page.locator('.boss-rush small').innerText(), /Best: 5\/5 in \d+:\d\d\.\d/);
  await page.locator('[data-k=rush_start]').click();
  await page.waitForFunction(inRush, null, { timeout: 15000 });
  const death = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
    G.paused = true; W.player.invuln = 999;
    const until = (fn, max = 3600) => { for (let i = 0; i < max && !fn(); i++) W.update(1 / 120); if (!fn()) throw Error('Rush stalled'); };
    // The Fallen Crowns hold at each phase mark and ward during some attacks, so strike again when open.
    const kill = (b) => { for (let k = 0; k < 6 && !b.dying; k++) { until(() => b.dying || (b.invuln === 0 && b.fighting !== false && !b.ward), 2400); if (!b.dying) b.takeHit({ dmg: b.maxHp + 1, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'ability', dot: true }); } };
    until(() => R.round === 1 && W.boss?.phase === 1 && W.boss.invuln === 0 && !G.inCutscene);
    const hp = W.boss.maxHp;
    kill(W.boss);
    until(() => R.round === 2 && W.boss?.phase === 1 && !G.inCutscene);
    G.paused = false; W.player.invuln = 0; W.player.die();
    return { hp };
  });
  assert.ok(Math.abs(death.hp / run.out[0].hp - 1.7 / 1.3) < 0.02, `Difficulty scales boss health (${death.hp} vs ${run.out[0].hp})`);
  await page.locator('[data-k=go_again]').waitFor({ timeout: 15000 });
  assert.ok(await page.getByText('THE RUSH ENDS', { exact: true }).isVisible());
  assert.ok(await page.getByText('1/5', { exact: true }).first().isVisible());
  const rushBoard = await page.evaluate(() => JSON.parse(localStorage.getItem('remnant.rush-board.v1')));
  assert.equal(rushBoard.length, 2); assert.equal(rushBoard[0].done, true); assert.equal(rushBoard[1].rounds, 1); assert.equal(rushBoard[1].done, false);
  await page.locator('[data-k=go_again]').click();
  await page.waitForFunction(() => { const { G } = window.__remnant, R = G.world.story.ch3.rounds; return R.active && R.rush && R.round === 0 && R.time < 3 && G.world.player.state !== 'dead'; }, null, { timeout: 15000 });
  await page.evaluate(() => window.__remnant.G.world.player.die());
  await page.locator('[data-k=go_leave]').waitFor({ timeout: 15000 });
  assert.ok(await page.getByText('Beat at least one boss to get on the Boss Rush board.').isVisible());
  await page.locator('[data-k=go_leave]').click();
  await page.waitForFunction((room) => { const W = window.__remnant.G.world; return W.room.id === room && !W.transitioning && W.player.state !== 'dead'; }, before.room, { timeout: 15000 });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('remnant.rush-board.v1')).length), 2);
  assert.equal(await page.evaluate(campaign), snap);
  await page.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  await page.locator('[data-k=rush_board]').click();
  assert.equal(await page.locator('.board .b-row:not(.b-head)').count(), 2);
  await page.locator('[data-k=lb_close]').click();
  console.log('Merciless scaling, unfinished run on death, retry, unranked empty run, leaderboard and isolation passed');
  await context.close();

  // iPhone landscape: touch the menu, read the HUD clock, and the card fits.
  const phone = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }), mobile = await boot(phone);
  await mobile.evaluate(() => { const { G } = window.__remnant; G.save.defeated = ['idol', 'gatekeeper', 'weigher']; G.ui.openMenu('chapters'); });
  await mobile.locator('[data-k=rush_start]').scrollIntoViewIfNeeded();
  await mobile.locator('[data-k=rush_start]').tap();
  await mobile.waitForFunction(inRush, null, { timeout: 15000 });
  await mobile.evaluate(() => { const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds; G.paused = true; W.player.invuln = 999; for (let i = 0; i < 3600 && !(R.round === 1 && W.boss?.phase === 1 && !G.inCutscene); i++) W.update(1 / 120); G.paused = false; document.querySelectorAll('.banner,.toast,.hint').forEach(el => el.remove()); });
  await mobile.waitForTimeout(150);
  await mobile.screenshot({ path: 'qa/phone-boss-rush-hud.png' });
  await mobile.evaluate(() => { const W = window.__remnant.G.world; W.player.invuln = 0; W.player.die(); });
  await mobile.locator('[data-k=go_leave]').waitFor({ timeout: 15000 });
  const fit = await mobile.evaluate(() => { const r = document.querySelector('.gameover').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; });
  assert.ok(fit, 'Result card fits a landscape iPhone');
  await mobile.screenshot({ path: 'qa/phone-boss-rush-result.png' });
  await mobile.locator('[data-k=go_leave]').tap();
  await mobile.waitForFunction(() => { const W = window.__remnant.G.world; return W.room.id !== 'trial_arena' && !W.transitioning; }, null, { timeout: 15000 });
  await phone.close();
  assert.deepEqual(errors, []);
  console.log('Phone tap entry, HUD clock and result card passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
