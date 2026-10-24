// Extreme Survival: the Trial at its hardest. Started from the Chapters page, its
// foes are drawn deeper and hit far harder than the Trial's at the same round,
// more come, Elites appear, the Pack and Champions come sooner, no blessings
// drop, blows on Elior land harder, and runs go on their own board without
// touching the survival record.
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
try {
  const page = await (await browser.newContext({ viewport: { width: 956, height: 440 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const { G } = window.__remnant, s = G.save;
    // The fresh save's Chapter I scenes would talk over the arena.
    G.ui.dialogue = async () => 0;
    s.flags.intro_done = s.flags.relic_taken = s.flags.ending_done = true;
    s.level = 30; s.flags.trial_best = 12;
    localStorage.removeItem('remnant.extreme-board.v1');
    G.inCutscene = false; for (const l of document.querySelectorAll('.layer')) l.remove();
    G.world.load('sanctuary', 'start');
  });
  await page.waitForFunction(() => !window.__remnant.G.world.transitioning);
  await page.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  assert.ok(/Extreme Survival/i.test(await page.locator('.box.extreme').innerText()), 'Extreme Survival is on the Chapters page');
  await page.locator('[data-k=extreme_start]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return W.room.id === 'trial_arena' && R.active && !W.transitioning; }, null, { timeout: 15000 });
  const run = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds, p = W.player, s = G.save;
    const step = (n) => { for (let i = 0; i < n; i++) W.update(1 / 120); };
    G.paused = true; p.invuln = 999;
    for (let i = 0; i < 2400 && !(R.round === 1 && R.spawned >= 4); i++) step(1);
    // Each foe against a fresh one of its kind: the Trial's round 1 leaves them as they are.
    const foes = W.ents.filter(e => e.isFoe && !e.dying);
    const ratios = foes.map(e => { const f = W.spawnEnemy(e.kind, 0, 0, null); const r = { kind: e.kind, elite: e.name.startsWith('Elite'), hp: e.maxHp / f.maxHp, dmg: e.dmg / f.dmg, tempo: e.tempo }; f.remove = true; return r; });
    const total1 = R.total;
    // Blows on Elior land harder in Extreme.
    p.invuln = 0; s.hp = G.d.maxHp; const h0 = s.hp; p.takeHit({ dmg: 40, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'melee', unblockable: true }); const lost = h0 - s.hp; s.hp = G.d.maxHp; p.invuln = 999;
    // No blessings fall from foes.
    const drops = () => W.ents.filter(e => 'boon' in e).length, before = drops();
    for (let i = 0; i < 300; i++) R.maybeBoon(foes[0]);
    const boons = drops() - before;
    // The Pack on round 3, a Champion on round 5.
    for (const e of W.ents) if (e.isFoe) e.remove = true;
    R.round = 2; R.beginRound(); const pack3 = R.pack, total3 = R.total;
    R.round = 4; R.beginRound(); const champ5 = R.champ, pack5 = R.pack;
    for (const e of W.ents) if (e.isFoe) e.remove = true;
    G.paused = false;
    return { extreme: R.extreme, ratios, total1, lost, boons, pack3, total3, champ5, pack5 };
  });
  assert.equal(run.extreme, true);
  assert.ok(run.ratios.length >= 4, 'foes came');
  // Round 1 plays as round 9 (×2.44 health, ×1.56 damage), then ×2.2 health and ×1.4 damage.
  for (const r of run.ratios) {
    assert.ok(r.hp >= 2.44 * 2.2 * 0.98, `${r.kind}: health ×${r.hp.toFixed(2)}`);
    assert.ok(r.dmg >= 1.56 * 1.4 * 0.98, `${r.kind}: damage ×${r.dmg.toFixed(2)}`);
    assert.ok(r.tempo > 1.2 && r.tempo <= 1.75, `${r.kind}: tempo ${r.tempo}`);
  }
  assert.equal(run.total1, 9, 'half again as many foes as the Trial\'s 6');
  assert.equal(run.boons, 0, 'no blessings drop');
  assert.ok(run.pack3 && !run.pack5 && run.champ5, 'the Pack on round 3, a Champion on round 5');
  assert.equal(run.total3, Math.round((6 + 3) * 1.5));
  console.log(`Extreme round 1: ${run.ratios.length} foes at ×${Math.min(...run.ratios.map(r => r.hp)).toFixed(1)}+ health, ×${Math.min(...run.ratios.map(r => r.dmg)).toFixed(1)}+ damage; ${run.total1} foes; no blessings; Pack 3, Champion 5`);
  await page.screenshot({ path: 'qa/extreme-arena.png' });

  // Falling: the card and the board are Extreme's own; the survival record stays.
  const fall = () => page.evaluate(() => { const { G } = window.__remnant, p = G.world.player; G.world.update(0.05); p.invuln = 0; p.takeHit({ dmg: 1e7, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'hazard', unblockable: true }); });
  await fall();
  await page.locator('[data-k=go_again]').waitFor({ timeout: 15000 });
  const card = await page.locator('.gameover').innerText();
  assert.ok(/Extreme Survival/i.test(card), 'the Game Over card names Extreme Survival');
  const after = await page.evaluate(() => { const s = window.__remnant.G.save; return { board: JSON.parse(localStorage.getItem('remnant.extreme-board.v1') ?? '[]').length, survival: JSON.parse(localStorage.getItem('remnant.board.v1') ?? '[]').length, best: s.flags.extreme_best, trial: s.flags.trial_best }; });
  assert.equal(after.board, 1, 'ranked on the Extreme board');
  assert.equal(after.trial, 12, 'the survival record is untouched');
  assert.ok(after.best >= 1);
  await page.screenshot({ path: 'qa/extreme-gameover.png' });
  // Again: still Extreme.
  await page.locator('[data-k=go_again]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return R.active && R.round === 0 && !W.transitioning; }, null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__remnant.G.world.story.ch3.rounds.extreme), true, 'Again stays in Extreme');
  await fall();
  await page.locator('[data-k=go_leave]').waitFor({ timeout: 15000 });
  await page.locator('[data-k=go_leave]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world; return W.room.id !== 'trial_arena' && !W.transitioning; }, null, { timeout: 15000 });
  // The ordinary Trial afterwards is its old self.
  await page.evaluate(() => window.__remnant.trial());
  await page.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return W.room.id === 'trial_arena' && R.active && !W.transitioning; }, null, { timeout: 15000 });
  const plain = await page.evaluate(() => { const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds, p = W.player, s = G.save; p.invuln = 0; s.hp = G.d.maxHp; const h0 = s.hp; p.takeHit({ dmg: 40, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'melee', unblockable: true }); const lost = h0 - s.hp; s.hp = G.d.maxHp; return { extreme: R.extreme, lost }; });
  assert.equal(plain.extreme, false);
  assert.ok(Math.abs(run.lost / plain.lost - 1.35) < 0.08, `blows land 35% harder (${run.lost} vs ${plain.lost})`);
  await page.evaluate(() => { window.__remnant.G.world.story.ch3.rounds.stop(); window.__remnant.G.ui.openMenu('chapters'); });
  await page.locator('[data-k=extreme_board]').click();
  assert.ok(/Extreme Survival/i.test(await page.locator('.layer.dim .chapter').innerText()), 'the Extreme leaderboard opens');
  assert.equal(await page.locator('.layer.dim .b-row:not(.b-head)').count(), 2, 'both runs listed');
  assert.deepEqual(errors, []);
  console.log('extreme-survival: all checks passed');
} finally {
  await browser.close(); server.close();
}
