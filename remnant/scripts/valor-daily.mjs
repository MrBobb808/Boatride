// Trials of Valor and the daily challenge: retroactive credit from an older
// save, trophies won through real game events (parries, a boss fight without
// a scratch, a parry-kill, lamps, the Boss Rush), the menu grid and the toast
// at phone size; the daily's date-seeded rules and waves, one ranked attempt
// per day, unranked practice, a reward once per day and an untouched campaign.
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

/** A save from before Trials of Valor: no `valor` field, but real progress. */
async function boot(context, at) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  if (at) await page.clock.setFixedTime(at);
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = s.flags.ending_done = true;
    s.level = 50;
    s.defeated = ['idol', 'gatekeeper'];
    s.kills = 1234;
    s.flags.trial_best = 12;
    s.echoes = [{ uid: 'e1', species: 'sentinel', level: 3, xp: 0, stage: 2, hp: 100, absorptions: 3 }];
    s.active = ['e1'];
    delete s.valor; delete s.daily;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
    for (const k of ['remnant.daily-board.v1', 'remnant.daily-ranked.v1', 'remnant.rush-board.v1']) localStorage.removeItem(k);
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style && !window.__remnant.G.world.transitioning);
  return page;
}
const got = (page) => page.evaluate(() => ({ ...window.__remnant.G.save.valor.got }));
const step = (page, n = 240) => page.evaluate((n) => { const W = window.__remnant.G.world; for (let i = 0; i < n; i++) W.update(1 / 120); }, n);
// Everything a daily run must leave alone (arena routing flags aside).
const campaign = () => {
  const s = window.__remnant.G.save;
  const flags = Object.fromEntries(Object.entries(s.flags).filter(([k]) => !k.startsWith('trial_')).sort());
  return JSON.stringify({ flags, defeated: s.defeated, inventory: s.inventory, equipment: s.equipment, quests: s.quests, level: s.level, xp: s.xp,
    statPoints: s.statPoints, skillPoints: s.skillPoints, echoes: s.echoes.map(e => [e.uid, e.level, e.xp]), milestones: s.trialMilestones ?? [], kills: s.kills, bestiary: s.bestiary ?? {}, lore: s.lore, keyItems: s.keyItems });
};
const purse = () => { const s = window.__remnant.G.save; return { silver: s.silver, frag: s.materials.covenant_fragment ?? 0, core: s.materials.radiant_core ?? 0 }; };

/** Play a daily to the end (or `waves` waves): every foe falls as it arrives; returns the kinds met in wave 1. */
const playDaily = (waves) => {
  const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
  G.paused = true;
  const kinds = [];
  for (let i = 0; i < 400000 && R.active && R.completed < waves; i++) {
    W.player.invuln = 999;
    if (R.pendingBlessings.length) R.chooseBlessing(R.pendingBlessings[0]);
    if (R.breakT > 0.2) R.breakT = 0.2;
    R.spawnT = 0;
    W.update(1 / 120);
    for (const e of W.ents) if (e.isFoe && !e.dying && !e.remove) {
      if (R.round === 1 && !e._seen) { e._seen = true; kinds.push(e.kind); }
      e.hp = 0; e.die();
    }
  }
  G.paused = false;
  return { kinds, completed: R.completed, round: R.round };
};

try {
  // ------------------------------------------------------------ Trials of Valor
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await boot(context);
  let g = await got(page);
  for (const id of ['defeat_idol', 'defeat_gatekeeper', 'kills_1000', 'trial_10', 'stage3', 'level_50']) assert.equal(g[id], 0, `${id} credited from the older save`);
  for (const id of ['flawless_idol', 'parry_25', 'rush_done', 'defeat_marshal', 'trial_30', 'lamps_200', 'swift_ch1']) assert.equal(g[id], undefined, `${id} is not provable from the save`);
  await step(page, 260);
  assert.match(await page.locator('.toast').allInnerTexts().then(t => t.join('|')), /Trials of Valor: \d+ trophies recognised/);
  console.log('Retroactive credit from an older save:', Object.keys(g).join(', '));

  // Parries through Elior's real parry path.
  await page.evaluate(() => {
    const { G } = window.__remnant, p = G.world.player;
    for (let i = 0; i < 25; i++) { p.invuln = 0; p.parryT = 0.2; p.takeHit({ dmg: 30, poise: 10, kx: 0, ky: 0, dir: 0, kind: 'melee' }); }
  });
  await step(page, 10);
  g = await got(page);
  assert.ok(g.parry_25 > 0, 'Twenty-five parries win Turned Aside');
  assert.equal(await page.evaluate(() => window.__remnant.G.save.valor.n.parry), 25);
  await page.locator('.valor-toast[data-trophy=parry_25]').waitFor();
  await page.screenshot({ path: 'qa/valor-toast.png' });
  console.log('25 real parries won "Turned Aside" with its card and chime');

  // Lamps: break every lamp in every room of Chapter I through Lamp.smash, the path sword swings take.
  const lamps = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, out = {};
    for (const id of ['sanctuary', 'ashen_road', 'village_square', 'cistern', 'temple_steps', 'temple_hall', 'covenant_chamber', 'crypt', 'upper_gallery', 'archive_vault', 'idol_antechamber', 'idol_sanctum']) {
      W.load(id, 'start');
      const list = W.ents.filter((e) => typeof e.smash === 'function' && typeof e.hanging === 'boolean');
      out[id] = list.length;
      // Half on one visit, the rest on the next: the room remembers which fell.
      list.slice(0, Math.ceil(list.length / 2)).forEach((l) => l.smash());
      W.load(id, 'start');
      W.ents.filter((e) => typeof e.smash === 'function' && typeof e.hanging === 'boolean').slice(Math.ceil(list.length / 2)).forEach((l) => l.smash());
    }
    G.inCutscene = false;
    return out;
  });
  await step(page, 130);
  g = await got(page);
  const lampTotal = Object.values(lamps).reduce((a, b) => a + b, 0);
  assert.ok(lampTotal > 20, `Chapter I has lamps (${lampTotal})`);
  assert.ok(g.lamps_ch1 > 0, 'Every Chapter I lamp broken, across two visits a room, wins Lamplighter');
  assert.equal(await page.evaluate(() => window.__remnant.G.save.valor.n.lamp), lampTotal);
  console.log(`Lamplighter won after ${lampTotal} lamps in 12 rooms, broken over two visits each`);

  // A boss without a scratch and a parry-kill, then a boss with a hit taken: the Boss Rush, driven like boss-rush.mjs.
  await page.evaluate(() => { const { G } = window.__remnant; G.world.load('sanctuary', 'start'); G.inCutscene = false; G.ui.openMenu('chapters'); });
  await page.locator('[data-k=rush_start]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return W.room.id === 'trial_arena' && R.active && R.rush && !W.transitioning; }, null, { timeout: 15000 });
  const fight = (merciless) => page.evaluate((merciless) => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds, p = W.player;
    G.paused = true; p.invuln = 999;
    const until = (fn, max = 3600) => { for (let i = 0; i < max && !fn(); i++) W.update(1 / 120); if (!fn()) throw Error('Rush stalled at ' + R.round); };
    const open = (b) => b.dying || (b.invuln === 0 && b.fighting !== false && !b.ward);
    const out = [];
    for (let n = 1; n <= 2; n++) {
      until(() => R.round === n && W.boss?.phase === 1 && W.boss.invuln === 0 && !G.inCutscene);
      const b = W.boss;
      until(() => open(b), 2400);
      if (n === 1 && !merciless) {
        // A perfect parry of the boss's blow, and the killing strike at once.
        p.invuln = 0; p.parryT = 0.2; p.takeHit({ dmg: 30, poise: 10, kx: 0, ky: 0, dir: 0, kind: 'melee', src: b });
      }
      if (n === 2 && !merciless) { p.invuln = 0; p.takeHit({ dmg: 1, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'melee', unblockable: true }); }
      p.invuln = 999;
      for (let k = 0; k < 6 && !b.dying; k++) { until(() => open(b), 2400); if (!b.dying) b.takeHit({ dmg: b.maxHp + 1, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'ability', dot: true }); }
      until(() => R.completed === n);
      out.push({ key: b.key ?? 'idol', clean: window.__remnant.valor.track.state.clean });
    }
    until(() => !!document.querySelector('[data-k=go_again]'), 600);
    G.paused = false;
    return out;
  }, merciless);
  const rush1 = await fight(false);
  g = await got(page);
  assert.ok(g.flawless_idol > 0, 'The Idol beaten without a scratch wins Unscathed');
  assert.ok(g.riposte > 0, 'A killing blow straight after a perfect parry wins Answer in Kind');
  assert.equal(g.flawless_gatekeeper, undefined, 'A hit taken spoils the flawless fight');
  assert.ok(g.rush_done > 0, 'Finishing the Boss Rush wins The Rush Is Run');
  assert.equal(g.rush_merciless, undefined, 'Not on Merciless yet');
  console.log('Rush fights:', JSON.stringify(rush1), '→ flawless Idol, parry-kill and rush finish won; the struck Gatekeeper fight was not flawless');
  await page.locator('[data-k=go_leave]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world; return W.room.id !== 'trial_arena' && !W.transitioning; }, null, { timeout: 15000 });
  await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
  await page.locator('[data-k=bdmerciless]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  await page.locator('[data-k=rush_start]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return W.room.id === 'trial_arena' && R.active && R.rush && !W.transitioning; }, null, { timeout: 15000 });
  await fight(true);
  g = await got(page);
  assert.ok(g.rush_merciless > 0, 'A Merciless Boss Rush wins Without Mercy');
  assert.ok(g.flawless_gatekeeper > 0, 'A clean Gatekeeper fight now counts');
  await page.locator('[data-k=go_leave]').click();
  await page.waitForFunction(() => { const W = window.__remnant.G.world; return W.room.id !== 'trial_arena' && !W.transitioning; }, null, { timeout: 15000 });
  await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
  await page.locator('[data-k=bdhard]').click();
  await page.keyboard.press('Escape');
  console.log('Merciless rush won Without Mercy');

  // The menu: grid, hidden trophies, title and cape; the title shows on the Character tab; the cape draws.
  await page.evaluate(() => { document.querySelectorAll('.valor-toast,.toast').forEach(e => e.remove()); window.__remnant.G.ui.openMenu('valor'); });
  await page.locator('.trophy[data-trophy=parry_25].won').waitFor();
  assert.equal(await page.locator('.trophy[data-trophy=low_ch9] b').innerText(), '???', 'Hidden trophies stay hidden');
  assert.equal(await page.locator('.trophy[data-trophy=riposte] b').innerText(), 'Answer in Kind', 'A won hidden trophy is revealed');
  assert.match(await page.locator('.trophy[data-trophy=parry_100] .trophy-bar').innerText(), /25\/100/);
  await page.locator('[data-k=title_riposte]').click();
  await page.locator('[data-k=cape_royal]').click();
  await page.screenshot({ path: 'qa/valor-menu-desktop.png' });
  await page.evaluate(() => window.__remnant.G.ui.openMenu('character'));
  assert.equal(await page.locator('[data-k=worn_title]').innerText(), 'the Answerer');
  await page.keyboard.press('Escape');
  const cape = await page.evaluate(() => { const s = window.__remnant.G.save; return [s.valor.title, s.valor.cape]; });
  assert.deepEqual(cape, ['riposte', 'royal']);
  await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world;
    W.load('sanctuary', 'start'); G.inCutscene = false;
    document.querySelectorAll('.banner,.toast,.hint,.valor-toast').forEach(e => e.remove());
    G.camera.zoomTarget = 2.2;
  });
  await step(page, 240);
  await page.screenshot({ path: 'qa/valor-cape.png' });
  await page.evaluate(() => { window.__remnant.G.camera.zoomTarget = 1; });
  console.log('Valor grid, hidden trophies, worn title and cape passed');
  await context.close();

  // ------------------------------------------------------------ the daily challenge
  // Thursday 22 October 2026, local time: morning and evening, then the next day.
  const morning = new Date(2026, 9, 22, 8, 0), evening = new Date(2026, 9, 22, 23, 30), tomorrow = new Date(2026, 9, 23, 0, 30);
  const dctx = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const dp = await boot(dctx, morning);
  const days = await dp.evaluate(([a, b, c]) => {
    const { dailyFor } = window.__remnant.daily;
    const week = Array.from({ length: 14 }, (_, i) => dailyFor(new Date(2026, 9, 22 + i, 12)).mods.join('+'));
    return { a: dailyFor(new Date(a)), b: dailyFor(new Date(b)), c: dailyFor(new Date(c)), week };
  }, [morning.getTime(), evening.getTime(), tomorrow.getTime()]);
  assert.deepEqual(days.a, days.b, 'Same day, same seed and rules');
  assert.equal(days.a.key, '2026-10-22');
  assert.notEqual(days.c.seed, days.a.seed, 'The next day has another seed');
  assert.ok(new Set(days.week).size >= 5, `Rules vary over a fortnight (${days.week.join(', ')})`);
  assert.ok(days.a.mods.length >= 1 && days.a.mods.length <= 2);
  console.log(`Today ${days.a.key}: ${days.a.mods.join(' + ')}; tomorrow ${days.c.key}: ${days.c.mods.join(' + ')}`);

  await dp.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  await dp.locator('[data-daily="2026-10-22"]').scrollIntoViewIfNeeded();
  assert.equal(await dp.locator('[data-daily] .daily-rule').count(), days.a.mods.length);
  await dp.screenshot({ path: 'qa/daily-chapters-phone.png' });
  const snap = await dp.evaluate(campaign), before = await dp.evaluate(purse);
  const start = await dp.evaluate(() => { const s = window.__remnant.G.save; s.hp = 40; return { hp: s.hp, room: window.__remnant.G.world.room.id }; });
  await dp.locator('[data-k=daily_ranked]').tap();
  await dp.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return W.room.id === 'trial_arena' && R.active && R.daily && !W.transitioning; }, null, { timeout: 15000 });
  const run = await dp.evaluate(() => {
    const { G } = window.__remnant, R = G.world.story.ch3.rounds, rb = R.daily;
    return { ranked: rb.ranked, mods: rb.mods, full: G.save.hp === G.d.maxHp, contract: R.contract, bossOnly: R.bossOnly, used: localStorage.getItem('remnant.daily-ranked.v1') };
  });
  assert.ok(run.ranked && run.full && !run.contract && !run.bossOnly, 'A ranked daily starts whole');
  assert.equal(run.used, '2026-10-22', 'The ranked attempt is spent when the run begins');
  await dp.evaluate(() => { const { G } = window.__remnant; G.paused = true; for (let i = 0; i < 520; i++) G.world.update(1 / 120); G.paused = false; document.querySelectorAll('.banner,.toast,.valor-toast').forEach(e => e.remove()); });
  await dp.waitForTimeout(150);
  await dp.screenshot({ path: 'qa/daily-hud-phone.png' });
  const ranked = await dp.evaluate(playDaily, 10);
  assert.equal(ranked.completed, 10, 'All ten waves cleared');
  await dp.locator('[data-k=go_again]').waitFor({ timeout: 15000 });
  assert.ok(await dp.getByText('TRIAL WON', { exact: true }).isVisible());
  assert.ok(await dp.locator('[data-k=daily_reward]').isVisible(), 'First clear pays the reward');
  const fit = await dp.evaluate(() => { const r = document.querySelector('.gameover').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; });
  assert.ok(fit, 'Daily card fits a landscape iPhone');
  await dp.screenshot({ path: 'qa/daily-result-phone.png' });
  const board1 = await dp.evaluate(() => JSON.parse(localStorage.getItem('remnant.daily-board.v1')));
  assert.equal(board1['2026-10-22'].length, 1);
  assert.equal(board1['2026-10-22'][0].waves, 10);
  assert.ok(board1['2026-10-22'][0].score >= 1000);
  const paid = await dp.evaluate(purse);
  assert.deepEqual(paid, { silver: before.silver + 500, frag: before.frag + 3, core: before.core + 1 });
  assert.equal(await dp.evaluate(campaign), snap, 'The campaign is untouched by the daily');
  assert.ok((await got(dp)).daily_1 > 0, 'A cleared daily wins Today\'s Trial');
  console.log(`Ranked daily: 10 waves, score ${board1['2026-10-22'][0].score}, reward paid once, campaign untouched; wave 1 met ${ranked.kinds.join(',')}`);

  // Again: the same day's run is practice, meets the same foes, pays nothing and is not ranked.
  await dp.locator('[data-k=go_again]').tap();
  await dp.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return R.active && R.daily && R.round === 0 && !W.transitioning; }, null, { timeout: 15000 });
  assert.equal(await dp.evaluate(() => window.__remnant.G.world.story.ch3.rounds.daily.ranked), false, 'A second run today is practice');
  const practice = await dp.evaluate(playDaily, 10);
  assert.deepEqual(practice.kinds, ranked.kinds, 'The seeded waves are the same on every run of the day');
  await dp.locator('[data-k=go_leave]').waitFor({ timeout: 15000 });
  assert.equal(await dp.locator('[data-k=daily_reward]').count(), 0, 'No second reward today');
  assert.ok(await dp.locator('[data-k=daily_unranked]').isVisible());
  assert.deepEqual(await dp.evaluate(purse), paid);
  assert.equal(await dp.evaluate(() => JSON.parse(localStorage.getItem('remnant.daily-board.v1'))['2026-10-22'].length), 1, 'Practice is not ranked');
  await dp.locator('[data-k=go_leave]').tap();
  await dp.waitForFunction((room) => { const W = window.__remnant.G.world; return W.room.id === room && !W.transitioning && !W.story.ch3.rounds.daily; }, start.room, { timeout: 15000 });
  assert.equal(await dp.evaluate(() => window.__remnant.G.save.hp), start.hp, 'Health is handed back on leaving');
  assert.equal(await dp.evaluate(campaign), snap);
  await dp.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  assert.ok(await dp.locator('[data-k=daily_ranked]').isDisabled(), 'Ranked attempt used for today');
  assert.match(await dp.locator('[data-k=daily_status]').innerText(), /reward claimed/i);
  await dp.locator('[data-k=daily_board]').tap();
  assert.equal(await dp.locator('.daily-board .b-row:not(.b-head)').count(), 1);
  await dp.screenshot({ path: 'qa/daily-board-phone.png' });
  await dp.locator('[data-k=daily_close]').tap();
  await dp.keyboard.press('Escape');
  console.log('Practice run: same foes, unranked, no second reward; health returned; ranked button locked');

  // The rules bite: glass cannon / commander multipliers, double host, and fasting.
  const rules = await dp.evaluate(() => {
    const { G, daily } = window.__remnant, R = G.world.story.ch3.rounds;
    const find = (m) => { for (let i = 0; i < 400; i++) { const d = new Date(2026, 9, 22 + i, 12); if (daily.dailyFor(d).mods.includes(m)) return d.getTime(); } };
    return { fasting: find('fasting'), double: find('double'), glass: find('glass') };
  });
  await dp.clock.setFixedTime(rules.fasting);
  await dp.evaluate(() => window.__remnant.daily.start(false));
  await dp.waitForFunction(() => { const W = window.__remnant.G.world, R = W.story.ch3.rounds; return R.active && R.daily && !W.transitioning; }, null, { timeout: 15000 });
  const fast = await dp.evaluate(() => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds, s = G.save;
    G.paused = true;
    for (let i = 0; i < 10; i++) W.update(1 / 120);
    s.hp = Math.floor(G.d.maxHp / 2); W.update(1 / 120);
    s.hp += 100; W.update(1 / 120);
    const kept = s.hp;
    G.paused = false;
    return { kept, half: Math.floor(G.d.maxHp / 2), sealed: R.balmSealed, key: R.daily.key, ranked: R.daily.ranked };
  });
  assert.equal(fast.kept, fast.half, 'Fasting: health never rises');
  assert.ok(fast.sealed, 'Fasting seals Balm');
  assert.equal(fast.ranked, false);
  await dp.evaluate(() => window.__remnant.G.world.story.ch3.rounds.stop(false));
  await dp.clock.setFixedTime(rules.glass);
  await dp.evaluate(() => { const { G } = window.__remnant; G.world.story.ch3.rounds.start(1, false, false, 'practice'); });
  const glass = await dp.evaluate(() => {
    const { G } = window.__remnant, R = G.world.story.ch3.rounds;
    const on = { mods: R.daily.mods, melee: G.d.meleeMult, echo: G.d.echoDmg };
    R.stop(false);
    return { ...on, melee0: G.d.meleeMult, echo0: G.d.echoDmg };
  });
  assert.ok(glass.mods.includes('glass'));
  const commander = glass.mods.includes('commander');
  assert.ok(Math.abs(glass.melee / glass.melee0 - (commander ? 0.4 : 2)) < 1e-6, 'Glass Cannon doubles weapon damage');
  assert.ok(Math.abs(glass.echo / glass.echo0 - (commander ? 4 : 2)) < 1e-6, 'and Echo damage');
  await dp.clock.setFixedTime(rules.double);
  const dbl = await dp.evaluate(() => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
    R.start(1, false, false, 'practice');
    G.paused = true; W.player.invuln = 999;
    for (let i = 0; i < 2000 && R.round < 1; i++) W.update(1 / 120);
    const total = R.left;
    R.stop(false); G.paused = false;
    return { total, champions: R.daily === null };
  });
  assert.ok(dbl.total >= 18, `Double Host doubles wave 1 (${dbl.total} foes)`);
  console.log('Fasting (health capped, Balm sealed), Glass Cannon day and Double Host wave size passed');

  // The next day: a new key, the ranked attempt is back.
  await dp.clock.setFixedTime(tomorrow);
  await dp.evaluate(() => { const { G } = window.__remnant; G.world.load('sanctuary', 'start'); G.inCutscene = false; G.ui.openMenu('chapters'); });
  assert.equal(await dp.locator('[data-daily]').getAttribute('data-daily'), '2026-10-23');
  assert.ok(!(await dp.locator('[data-k=daily_ranked]').isDisabled()), 'A new day brings a new ranked attempt');
  assert.match(await dp.locator('[data-k=daily_status]').innerText(), /First full clear today/);
  await dp.keyboard.press('Escape');
  console.log('Next day: new seed, ranked attempt and reward available again');

  // Valor at phone size.
  await dp.evaluate(() => { document.querySelectorAll('.valor-toast,.toast').forEach(e => e.remove()); window.__remnant.G.ui.openMenu('valor'); });
  await dp.locator('.trophy[data-trophy=daily_1].won').waitFor();
  const grid = await dp.evaluate(() => { const r = document.querySelector('.trophy-grid').getBoundingClientRect(); return { w: r.width, scroll: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  assert.ok(grid.scroll, 'No sideways scroll on the phone');
  await dp.screenshot({ path: 'qa/valor-menu-phone.png' });
  await dp.locator('.valor').evaluate((el) => { el.scrollTop = 420; });
  await dp.screenshot({ path: 'qa/valor-menu-phone-2.png' });
  await dctx.close();
  assert.deepEqual(errors, []);
  console.log('Valor grid at phone size passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
