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
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await boot(context);
  const migration = await page.evaluate(() => {
    const a = window.__remnant, { G } = a;
    G.paused = true;
    a.echo('sentinel'); a.echo('sentinel'); a.echo('sentinel'); a.echo('archer');
    const s = G.save, [one, two, three, archer] = s.echoes;
    one.level = 12; one.xp = 100; one.stage = 0;
    two.level = 22; two.xp = 900; two.stage = 1; two.role = 'mage'; two.nickname = 'My Vanguard';
    three.level = 4; three.stage = 0; three.commander = true;
    s.active = [two.uid, one.uid, three.uid, archer.uid];
    s.squadPick = [three.uid, one.uid, archer.uid];
    s.formations = [{ name: 'Vanguard', uids: [one.uid, two.uid, three.uid, archer.uid] }];
    s.flags.trial_best = 30;
    delete s.trialMilestones;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
    a.load(2); G.paused = true;
    const snapshot = () => JSON.stringify({ echoes: G.save.echoes, active: G.save.active, squad: G.save.squadPick, formations: G.save.formations, milestones: G.save.trialMilestones, gear: G.save.inventory });
    const first = snapshot(); a.load(2); G.paused = true;
    const lead = G.save.echoes.find(e => e.species === 'sentinel');
    return { lead, preferred: two.uid, roster: G.save.echoes.length, active: G.save.active, squad: G.save.squadPick, formation: G.save.formations[0].uids, stable: first === snapshot(), gear: G.save.inventory.filter(i => i.trialWave).map(i => [i.trialWave, i.id]), saved: JSON.parse(localStorage.getItem('remnant-save-2')).echoes.length };
  });
  assert.equal(migration.roster, 2); assert.equal(migration.saved, 2);
  assert.equal(migration.lead.uid, migration.preferred); assert.equal(migration.lead.role, 'mage');
  assert.equal(migration.lead.nickname, 'My Vanguard'); assert.equal(migration.lead.stage, 2);
  assert.ok(migration.lead.level > 22 && migration.lead.commander); assert.ok(migration.stable);
  for (const list of [migration.active, migration.squad, migration.formation]) { assert.equal(list.length, 2); assert.equal(new Set(list).size, 2); assert.ok(list.includes(migration.preferred)); }
  assert.deepEqual(migration.gear, [[10, 'trial_reaver'], [20, 'trial_tempest'], [30, 'trial_plate']]);
  console.log('Legacy Echo duplicates merge once, preserve identity and combined XP, remap lineups, and backfill earned gear');

  const run = await page.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world, s = G.save;
    G.paused = true; G.inCutscene = false;
    s.trialMilestones = []; s.inventory = s.inventory.filter(i => !i.trialWave);
    s.flags.trial_best = 0; s.flags.trial_mode = 'survival';
    W.load('trial_arena', 'start');
    const R = W.story.ch3.rounds;
    for (let wave = 1; wave <= 10; wave++) {
      R.breakT = 0.001; R.update(1 / 120);
      if (R.round !== wave) throw Error('Wrong round ' + R.round);
      for (let t = 0; t < 300 && R.completed < wave; t++) {
        R.spawnT = 0;
        for (const f of R.foes) { if (!f.dying) { f.hp = 0; f.die(); } f.remove = true; }
        R.update(1 / 120);
      }
      if (R.completed !== wave) throw Error('Wave did not complete ' + wave);
    }
    const earned10 = s.inventory.filter(i => i.trialWave === 10).length;
    const shifted = W.room.biome === 'valley' && W.arenaSector === 1;
    const heldRecord = R.completed === 10 && R.kills > 50 && R.round === 10;
    R.breakT = 0.001; R.update(1 / 120);
    const nextRound = R.round === 11 && W.arenaSector === 1;
    const themes = [], layouts = [];
    for (const wave of [1, 11, 21, 31, 41, 51]) {
      W.configureTrial(wave); themes.push(W.room.biome); layouts.push(W.room.rows.join('\n'));
      for (let y = 2; y < 18; y++) if (!W.solid(W.grid.get(0, y)) || !W.solid(W.grid.get(1, y))) throw Error('Open left wall');
      for (let x = 2; x < 54; x++) if (!W.solid(W.grid.get(x, 18))) throw Error('Unsafe floor');
      if (W.room.exits.length || W.player.y !== 288 || W.echoes.some(e => e.y !== 288)) throw Error('Unsafe transition');
    }
    W.configureTrial(21);
    const before = W.cache;
    const unchanged = !W.configureTrial(29) && before === W.cache;
    for (const wave of [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140]) {
      R.round = wave; R.spawned = R.total = 1; R.foes = []; R.breakT = 0; R.update(1 / 120);
    }
    const count = s.inventory.length;
    R.round = 140; R.spawned = R.total = 1; R.foes = []; R.breakT = 0; R.update(1 / 120);
    const noReplay = s.inventory.length === count;
    const gear = s.inventory.filter(i => i.trialWave).map(i => ({ id: i.id, wave: i.trialWave, tier: i.trialTier, rarity: i.rarity, uid: i.uid }));
    const saved = JSON.parse(localStorage.getItem('remnant-save-2')).trialMilestones;
    R.start(31, false); const correctPractice = W.room.biome === 'gardens' && R.from === 31;
    R.stop(false);
    return { earned10, shifted, heldRecord, nextRound, themes, layouts: layouts.slice(0, 5), unchanged, noReplay, gear, saved, correctPractice };
  });
  for (const key of ['shifted', 'heldRecord', 'nextRound', 'unchanged', 'noReplay', 'correctPractice']) assert.ok(run[key], key);
  assert.equal(run.earned10, 1); assert.equal(new Set(run.layouts).size, 5);
  assert.deepEqual(run.themes, ['trial', 'valley', 'furnace', 'gardens', 'palace', 'trial']);
  assert.equal(run.gear.length, 14); assert.equal(run.saved.length, 14);
  assert.equal(run.gear.find(i => i.wave === 20).rarity, 4); assert.equal(run.gear.find(i => i.wave === 50).rarity, 5);
  assert.equal(run.gear.find(i => i.wave === 110).tier, 1); assert.equal(run.gear.find(i => i.wave === 140).tier, 4);
  console.log('Ten real spawn/defeat rounds, guaranteed gear through wave 140, save persistence, distinct sector layouts, and sealed walls passed');

  await page.evaluate(() => window.__remnant.G.ui.openMenu('equipment'));
  async function equipWave(wave, slot = 'weapon') {
    await page.locator(`[data-k=slot_${slot}]`).click();
    const id = run.gear.find(i => i.wave === wave).uid;
    await page.locator(`[data-k=it_${id}]`).click();
    await page.locator('[data-k=equip]').click();
    return page.evaluate(() => ({ atk: window.__remnant.G.d.atk, hp: window.__remnant.G.d.maxHp, echoDmg: window.__remnant.G.d.echoDmg }));
  }
  const starter = await page.evaluate(() => ({ atk: window.__remnant.G.d.atk, hp: window.__remnant.G.d.maxHp }));
  const reaver = await equipWave(10), tempest = await equipWave(20), sovereign = await equipWave(50), breaker = await equipWave(80), ascended = await equipWave(110);
  assert.ok(reaver.atk > starter.atk * 3); assert.ok(tempest.atk > reaver.atk); assert.ok(sovereign.atk > tempest.atk);
  assert.ok(breaker.atk > sovereign.atk); assert.ok(ascended.atk > breaker.atk * 1.14);
  const armor = await equipWave(90, 'armor'); assert.ok(armor.hp > starter.hp + 600);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__remnant.G.ui.openMenu('chapters'));
  assert.equal(await page.locator('.trial-rewards [data-wave]').count(), 10);
  await page.screenshot({ path: 'qa/trial-progression-desktop.png' });
  await page.keyboard.press('Escape');
  console.log('Trophy weapons increase actual equipped damage; armor increases health; all ten milestones render in Chapters');

  const xp = await page.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world;
    G.paused = true; G.inCutscene = false;
    W.summonEchoes(true); const u = W.echoes.find(e => e.inst.species === 'sentinel');
    u.inst.level = 1; u.inst.xp = 43; u.refreshStats(); u.hp = u.maxHp;
    const beforeHp = u.maxHp, beforeLv = u.inst.level;
    const foe = a.spawn('husk', 450, 288); foe.xpOverride = 100; foe.hp = 0; foe.die();
    const killGrowth = u.inst.level > beforeLv && u.maxHp > beforeHp;
    u.inst.level = 30; u.inst.xp = 12629; u.gainXp(10);
    const beyond30 = u.inst.level === 31;
    u.gainXp(1e9); const capped = u.inst.level === 100 && u.inst.xp === 0 && u.hp === u.inst.hp;
    const hp = u.maxHp; u.gainXp(1e9);
    const stable = u.inst.level === 100 && u.maxHp === hp && u.inst.xp === 0;
    W.autosave(true);
    return { killGrowth, beyond30, capped, stable, saved: JSON.parse(localStorage.getItem('remnant-save-2')).echoes.find(e => e.uid === u.inst.uid).level };
  });
  for (const key of ['killGrowth', 'beyond30', 'capped', 'stable']) assert.ok(xp[key], key);
  assert.equal(xp.saved, 100);
  // Exercise collision with actual player movement into the former exit trigger.
  await page.evaluate(() => { const { G } = window.__remnant, W = G.world; W.story.ch3.rounds.stop(false); W.configureTrial(1); W.ents = []; W.player.x = 70; W.player.y = 288; W.player.state = 'free'; G.paused = false; });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1100);
  await page.keyboard.up('ArrowLeft');
  const wall = await page.evaluate(() => ({ room: window.__remnant.G.world.room.id, x: window.__remnant.G.world.player.x }));
  assert.equal(wall.room, 'trial_arena'); assert.ok(wall.x >= 32 && wall.x < 60);
  console.log('Combat XP immediately increases Echo health, advances beyond 30 up to 100, persists, and the left wall blocks live movement');
  await context.close();

  const phone = await browser.newContext({ viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1' });
  await phone.addInitScript(() => { if (!localStorage.getItem('remnant-settings-v1')) localStorage.setItem('remnant-settings-v1', JSON.stringify({ v: 2, fps: 'auto', quality: 'auto' })); });
  const mobile = await boot(phone);
  assert.equal(await mobile.evaluate(() => JSON.parse(localStorage.getItem('remnant-settings-v1')).fps), '60');
  const sizes = await mobile.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world, r = G.renderer;
    G.paused = true; G.inCutscene = false; G.save.flags.trial_mode = 'survival'; W.load('trial_arena', 'start');
    W.story.ch3.rounds.start(21, false); W.story.ch3.rounds.breakT = 0.001; W.story.ch3.rounds.update(1 / 120);
    const high = r.cw * r.ch;
    r.autoPenalty = 2; r.resize(); W.draw(r.wctx);
    const low = r.cw * r.ch, worldHeight = r.bh;
    r.autoPenalty = 0; r.resize();
    for (const species of ['sentinel', 'archer', 'brute', 'bulwark', 'knight', 'marshal', 'locust', 'lion']) a.echo(species);
    for (let i = 0; i < 12; i++) a.spawn(i % 2 ? 'soldier' : 'archer', 120 + i * 55, 288);
    a.god(); W.player.invuln = 99; G.paused = false;
    return { high, low, worldHeight };
  });
  assert.ok(sizes.low <= sizes.high / 3.9); assert.ok(sizes.worldHeight < 300);
  await mobile.waitForTimeout(1300);
  const perf = await mobile.evaluate(() => window.__remnant.perf());
  assert.ok(perf.frames > 5 && Number.isFinite(perf.draw));
  await mobile.screenshot({ path: 'qa/trial-furnace-phone.png' });
  await phone.close();
  assert.deepEqual(errors, []);
  console.log('iOS 60 FPS preference migration, adaptive HUD pixel reduction, and dense phone combat render without errors:', perf);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
