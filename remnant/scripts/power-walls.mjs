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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await boot(context);
  await page.evaluate(() => {
    const a = window.__remnant, s = a.G.save;
    s.level = 150; s.statPoints = 447; s.skillPoints = 149; s.skills = {};
    localStorage.setItem('remnant-save-2', JSON.stringify(s)); a.load(2);
    a.G.ui.openMenu('character');
  });
  await page.locator('[data-k=points_25]').click();
  assert.match(await page.locator('[data-k=preview_str]').innerText(), /Attack .*→/);
  await page.locator('[data-k=st_str]').click();
  assert.deepEqual(await page.evaluate(() => [window.__remnant.G.save.stats.str, window.__remnant.G.save.statPoints]), [30, 422]);
  await page.screenshot({ path: 'qa/power-character-desktop.png' });
  await page.evaluate(() => window.__remnant.G.ui.openMenu('skills'));
  await page.locator('[data-k=skills_training]').click();
  await page.locator('[data-k=sk_w_edge]').click();
  await page.locator('[data-k=learn]').click();
  assert.equal(await page.evaluate(() => window.__remnant.G.save.skills.w_edge), 25);
  assert.equal(await page.evaluate(() => window.__remnant.G.save.skillPoints), 124);
  await page.screenshot({ path: 'qa/power-passives-desktop.png' });
  await page.keyboard.press('Escape');
  const combat = await page.evaluate(() => {
    const a = window.__remnant, { G } = a, s = G.save;
    s.stats = { vit: 75, str: 120, agi: 55, end: 70, res: 60, wis: 97 }; s.statPoints = 0;
    localStorage.setItem('remnant-save-2', JSON.stringify(s)); a.load(2);
    G.paused = true; G.inCutscene = false;
    const W = G.world, p = W.player;
    s.flags.trial_mode = 'survival'; delete s.flags.trial_contract;
    W.load('trial_arena', 'start'); const R = W.story.ch3.rounds;
    const originalRandom = Math.random; Math.random = () => .4;
    const sample = (level, wave = 30) => {
      G.save.level = level; R.start(wave); R.round = wave; R.total = 2; R.spawned = 0; R.spawnOne();
      const e = R.foes[0]; return { kind: e.kind, hp: e.maxHp, damage: e.dmg };
    };
    const low = sample(30), high = sample(150);
    const e = R.foes[0]; W.ents = [e]; W.echoes = []; p.refreshLook();
    p.x = 240; p.y = 288; p.face = 1; p.mantleT = p.lion = p.swapStrikeT = 0;
    e.x = 265; e.y = 288; e.invuln = 0; G.d.crit = 0; p.atkHit.clear();
    const health = e.hp; p.activeHits(p.moves.combo[0], 1);
    const damage = health - e.hp, normalHits = Math.ceil(health / Math.max(1, damage));
    R.spawned = 1; R.spawnOne(); const champion = R.foes.at(-1);
    W.ents = [champion]; champion.x = 265; champion.y = 288; champion.face = 1; champion.invuln = 0;
    p.atkHit.clear(); const championHealth = champion.hp; p.activeHits(p.moves.combo[0], 1);
    const championHits = Math.ceil(championHealth / Math.max(1, championHealth - champion.hp));
    const hp = G.d.maxHp, incoming = high.damage * (1 - G.d.dr);
    a.give('ascendant_blade', 4);
    const weapon = G.save.inventory.at(-1); weapon.lootPower = 550; weapon.lootWave = 30; weapon.affixes = [];
    G.save.equipment.weapon = weapon.uid;
    Object.assign(G.save.skills, { w_keen: 5, c_kin: 25, l_lamp: 25, g_skin: 10, g_regen: 5 }); G.save.skillPoints = 54;
    const geared = [];
    for (const wave of [30, 60, 100]) {
      sample(150, wave); const enemy = R.foes[0]; W.ents = [enemy]; W.echoes = [];
      p.x = 240; p.y = 288; p.face = 1; p.refreshLook(); p.mantleT = p.lion = p.swapStrikeT = 0;
      enemy.x = 265; enemy.y = 288; enemy.face = 1; enemy.invuln = 0;
      G.d.crit = 0; p.atkHit.clear(); const before = enemy.hp; p.activeHits(p.moves.combo[0], 1);
      const dealt = before - enemy.hp;
      geared.push({ wave, health: before, damage: dealt, hits: Math.ceil(before / Math.max(1, dealt)), spellFraction: G.d.atk * G.d.abil * 3.2 / before, danger: R.foes[0].dmg });
    }
    // A complete wave must not pay the old five-to-ten levels per round.
    R.start(30); R.breakT = .001; R.update(1 / 120);
    let xp = 0; for (let i = 0; i < R.total; i++) { R.spawnOne(); xp += R.foes.at(-1).xpOverride; }
    const xpFraction = xp / R.waveXp;
    // Shared life-steal budget must ignore overkill, blocked hits and target count.
    const saveHp = G.save.hp; G.save.hp = G.d.maxHp * .5; p.leechAt = -1; G.time += 2;
    const hp0 = G.save.hp;
    for (let i = 0; i < 50; i++) p.leechHeal(1e9, .5);
    const drained = (G.save.hp - hp0) / G.d.maxHp;
    const afterLeech = G.save.hp; p.leechHeal(0, .5); const blockedHeal = G.save.hp === afterLeech;
    G.time += 1.01; p.leechHeal(1e9, .5); const replenished = (G.save.hp - hp0) / G.d.maxHp;
    G.save.hp = saveHp;
    Math.random = originalRandom; R.stop(false);
    return { low, high, normalHits, championHits, hp, incoming, geared, xpFraction, drained, blockedHeal, replenished };
  });
  assert.deepEqual(combat.low, combat.high, 'hero levels must not strengthen a fixed Survival wave');
  assert.ok(combat.normalHits >= 2 && combat.normalHits <= 4 && combat.championHits >= 8 && combat.championHits <= 25, JSON.stringify(combat));
  assert.ok(combat.incoming < combat.hp * .01, JSON.stringify(combat));
  assert.equal(combat.geared[0].hits, 1);
  assert.ok(combat.geared[1].hits > combat.geared[0].hits && combat.geared[2].hits >= 20, JSON.stringify(combat.geared));
  assert.ok(combat.geared[2].spellFraction < .2);
  assert.ok(combat.geared[2].danger > combat.geared[0].danger * 6);
  assert.ok(combat.xpFraction > .99 && combat.xpFraction < 1.01);
  assert.ok(Math.abs(combat.drained - .04) < 1e-9 && Math.abs(combat.replenished - .08) < 1e-9 && combat.blockedHeal);
  console.log('Controlled level-150 power, wave-30 comfort, deeper-wave resistance/threat, bounded XP and shared life-steal budget:', combat);

  const walls = await page.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world, p = W.player;
    G.paused = true; G.inCutscene = false; W.story.ch3.rounds.stop(false);
    W.load('trial_arena', 'start'); W.story.ch3.rounds.stop(false); W.ents = []; W.echoes = [];
    W.boss = null; W.bossActive = false; W.hitstopT = W.slowT = 0;
    // A one-tile-thick wall beside an otherwise open floor.
    for (let row = 8; row < 18; row++) W.grid.set(20, row, 1);
    const overlap = () => {
      const b = p.body;
      for (let y = Math.floor((p.y - b.h + .001) / 16); y <= Math.floor((p.y - .001) / 16); y++)
        for (let x = Math.floor((p.x - b.w / 2 + .001) / 16); x <= Math.floor((p.x + b.w / 2 - .001) / 16); x++) if (W.solid(W.grid.get(x, y))) return true;
      return false;
    };
    const reset = x => { p.x = x; p.y = 288; p.state = 'free'; p.atk = null; p.body.vx = p.body.vy = 0; p.body.onGround = true; p.lastSafe = { x, y: 288 }; p.invuln = 1; G.save.hp = G.d.maxHp; };
    reset(300); p.state = 'hurt'; p.body.vx = 10000; p.update(.05);
    const right = !overlap() && p.x <= 320 - p.body.w / 2;
    reset(355); p.state = 'hurt'; p.body.vx = -10000; p.update(.05);
    const left = !overlap() && p.x >= 336 + p.body.w / 2;
    reset(290); const foe = a.spawn('husk', 310, 288);
    const spot = p.blinkSpot(foe, 1), nearSide = spot && spot.x < 320;
    p.blinkToFoe(foe); const blink = !overlap();
    reset(290); p.phantomLast = foe; p.startCross(); const cross = !overlap() && p.x < 320;
    reset(290); foe.x = 355;
    const rejectsAcross = p.blinkSpot(foe) === null && !p.blinkToFoe(foe);
    // Cached Phantom destination becomes blocked during its brief vanish.
    reset(250); p.phantomTo = { x: 325, y: 288 }; p.phantomTarget = foe; p.st = .08; p.state = 'phantom'; p.updatePhantom();
    const cached = !overlap() && p.x === 250 && p.state === 'free';
    reset(290); p.x = 325; p.update(1 / 60); const recovery = !overlap() && p.x === 290;
    // Every finisher uses the same safe destination checks.
    for (const id of ['severance', 'thousand', 'shadowstep', 'arise']) {
      reset(290); foe.x = 310; foe.dying = false; foe.remove = false;
      p.fin = { id, t: 0, phase: 0, target: foe, hidden: false, struck: false, sx: p.x, ex: 370, n: 0, ghostT: 0 };
      // Player's execution state drives the actual finisher updater.
      p.state = 'execute';
      for (let i = 0; i < 20; i++) { p.update(1 / 120); if (overlap() || p.x >= 320) throw Error(id + ' crossed the wall'); }
    }
    reset(290); foe.x = 350; foe.staggered = 10;
    const noWallExecution = W.executionTarget(p) !== foe;
    // Force a swap candidate whose centre fits but whose body clips the wall.
    a.echo('sentinel'); const echo = W.echoes[0];
    if (!echo) throw Error('Missing swap candidate');
    echo.x = 339; echo.y = 288; W.pickSwap = () => echo; W.switchCd = 0;
    G.save.storySlots = 1; G.save.active = [echo.inst.uid]; W.switchSupport();
    const swap = p.x === 290 && !overlap();
    W.grid.set(20, 10, 0); // Leave the rest of the wall intact for the screenshot.
    return { right, left, nearSide: !!nearSide, blink, cross, rejectsAcross, cached, recovery, noWallExecution, swap };
  });
  for (const [name, ok] of Object.entries(walls)) assert.ok(ok, 'Wall safety: ' + name);
  console.log('Thin-wall lunges, both blink sides, Cross, cached Phantom, embedded recovery, finishers, execution sight and Echo swap:', walls);

  const loot = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, s = G.save;
    W.load('trial_arena', 'start'); G.paused = true; G.inCutscene = false;
    const R = W.story.ch3.rounds; R.start(1); const results = [];
    for (const wave of [1, 2, 5, 30, 31]) {
      R.round = wave; R.endRound(); const it = R.lastWaveLoot;
      const before = s.inventory.length; R.endRound();
      results.push({ wave, id: it.id, rarity: it.rarity, power: it.lootPower, duplicate: s.inventory.length !== before });
      if (wave !== 31) R.chooseBlessing(R.pendingBlessings[0]);
    }
    const saved = JSON.parse(localStorage.getItem('remnant-save-2'));
    return { results, savedLoot: saved.inventory.filter(i => i.lootWave).length, liveLoot: s.inventory.filter(i => i.lootWave).length };
  });
  for (const r of loot.results) { assert.ok(r.rarity >= 4); assert.equal(r.duplicate, false); }
  assert.ok(loot.results[2].id.startsWith('ascendant_') && /blade|spear|greatsword/.test(loot.results[2].id));
  for (let i = 1; i < loot.results.length; i++) assert.ok(loot.results[i].power > loot.results[i - 1].power);
  assert.equal(loot.savedLoot, loot.liveLoot);
  await page.getByText(/reward:.*Power/).waitFor();
  await page.screenshot({ path: 'qa/wave-power-reward-desktop.png' });
  console.log('Every cleared wave grants one persistent Legendary/Covenant item, fifth waves guarantee weapons, deeper waves increase Power:', loot.results);
  await context.close();
  const phone = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await boot(phone);
  await mobile.evaluate(() => { const { G } = window.__remnant; G.save.statPoints = 100; G.ui.openMenu('character'); });
  await mobile.locator('[data-k=points_25]').click();
  await mobile.screenshot({ path: 'qa/power-character-phone.png' });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await phone.close(); assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
