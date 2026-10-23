// The Prince of Grecia (Chapter X): gauntlet spawn, every phase's attacks
// (tell before hit, parry rules, the wall stun, the ram's horns), the horn
// breaking, the four winds' lanes, the exposed fall, defeat in the gauntlet
// and on the throne, no NaN, and screenshots of each phase in both art styles.
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

async function boot(options, art) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(a => localStorage.setItem('remnant-settings-v1', JSON.stringify({ artStyle: a })), art);
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  // Shared helpers for every evaluate below: deterministic steps, the gauntlet spawn and a NaN watch.
  await page.evaluate(() => {
    const { G } = window.__remnant;
    const T = window.T = {
      nan: [],
      step(n = 1, each) {
        const W = G.world;
        for (let i = 0; i < n; i++) {
          W.update(1 / 120);
          if (each) each(i);
          if (!T.lost && T.armed && !W.story.ch3.rounds.active) T.lost = [T.label, G.save.hp, W.player.state, W.boss?.state, W.boss?.atk].join(':');
          const b = W.boss;
          if (b && b.key === 'grecia_prince' && ![b.x, b.y, b.hp, b.air, ...Object.values(b.pz)].every(Number.isFinite)) T.nan.push(b.state + ':' + b.atk);
        }
      },
      gauntlet() {
        const W = G.world, s = G.save;
        s.flags.ch10_done = s.flags.ch9_done = s.flags.ch8_done = s.flags.ch7_done = true; s.level = 120;
        // No tutorial dialogue may open mid-test (the Mantle's first announcement would hold a cutscene open).
        s.flags.mantle_known = true; G.ui.dialogue = async () => 0;
        if (W.room.id !== 'trial_arena') W.load('trial_arena', 'start');
        const R = W.story.ch3.rounds;
        R.start(10, true);
        G.paused = true;
        // The breather, then the boss's own intro.
        for (let i = 0; i < 3000 && !(W.boss?.key === 'grecia_prince' && W.boss.state === 'idle'); i++) T.step(1, () => { W.player.invuln = 99; });
        return W.boss;
      },
      /** Elior stands whole and free at x, facing the boss. */
      ready(x) {
        const W = G.world, p = W.player, b = W.boss;
        // Parries and stuns fill the Rally; a full gauge's cinematic would make Elior untouchable.
        G.save.rally = 0;
        for (let i = 0; i < 900 && G.inCutscene; i++) { W.update(1 / 120); p.invuln = 99; }
        p.state = 'free'; p.invuln = 0; p.parryT = 0; p.x = x; p.y = b.floorY; p.body.vx = p.body.vy = 0; p.face = Math.sign(b.x - x) || 1;
        G.save.hp = G.d.maxHp;
      },
      /** The boss at rest at x in a phase, nothing in flight. */
      reset(x = 560, phase = 1) {
        const b = G.world.boss;
        b.state = 'idle'; b.atk = null; b.phase = phase; b.st = 0; b.cd = 99; b.air = 0; b.x = x; b.ward = false; b.vx = 0;
        b.poise = b.maxPoise; b.invuln = 0; b.staggered = 0;
        for (const l of b.lanes) l.on = false;
        for (const r of b.rams) r.remove = true;
      },
    };
  });
  return page;
}

try {
  const page = await boot({ viewport: { width: 1280, height: 720 } }, 'pixel');

  // ---------------------------------------------------------------- gauntlet spawn
  const spawn = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, s = G.save;
    const b = T.gauntlet();
    T.armed = true;
    const bar = document.body.innerText;
    return { key: b.key, name: b.name, state: b.state, phase: b.phase, round: W.story.ch3.rounds.round, pixel: b.pixelShade, box: b.pixelBox, hp: b.maxHp, wallL: b.wallL, wallR: b.wallR, bar: /prince of grecia/i.test(bar), inCut: G.inCutscene };
  });
  assert.equal(spawn.key, 'grecia_prince');
  assert.equal(spawn.name, 'The Prince of Grecia');
  assert.equal(spawn.round, 10);
  assert.ok(spawn.state === 'idle' && spawn.phase === 1 && !spawn.inCut, 'Intro ends in the fight');
  assert.ok(spawn.pixel && spawn.box.length === 4, 'Pixel-shaded with a box');
  assert.ok(spawn.wallL < 64 && spawn.wallR > 840, `Walls found (${spawn.wallL}..${spawn.wallR})`);
  assert.ok(spawn.bar, 'Boss bar names the prince');
  console.log('Gauntlet round 10 spawns the Prince of Grecia:', JSON.stringify(spawn));

  // ---------------------------------------------------------------- phase I: tell, then hit
  const p1 = await page.evaluate(() => { T.label = 'p1';
    const { G } = window.__remnant, W = G.world, b = W.boss, p = W.player, out = {};
    const run = (atk, px, max = 600) => {
      T.reset(560, 1); T.ready(px); b.start(atk);
      const hp0 = G.save.hp; let at = -1, told = -1, by = '';
      T.step(max, (i) => { if (at < 0 && G.save.hp < hp0) { at = i; told = b.activeTell; by = b.atk; } p.invuln = at < 0 ? 0 : 99; if (b.state === 'idle') b.cd = 99; });
      return { hit: at >= 0 && by === atk, told: +told.toFixed(2), at: at / 120 };
    };
    out.charge = run('charge', 400);
    out.gore = run('gore', 505);
    out.thrust = run('thrust', 470);
    out.leap = run('leap', 470);
    // Jumping the charge: Elior held at the top of a jump while he passes.
    T.reset(560, 1); T.ready(400); b.start('charge');
    let hp0 = G.save.hp;
    T.step(240, () => { p.y = b.floorY - 48; p.body.vy = 0; });
    out.jumped = G.save.hp === hp0;
    // A parry turns a thrust aside: poise, not health.
    T.reset(560, 1); T.ready(470); b.start('thrust');
    hp0 = G.save.hp; const poise0 = b.poise, bhp = b.hp;
    T.step(120, () => { p.parryT = 1; p.face = 1; });
    out.parry = { hurt: G.save.hp < hp0, poise: poise0 - b.poise, bossHp: bhp - b.hp };
    // The horn's gore cannot be parried.
    T.reset(560, 1); T.ready(505); b.start('gore');
    hp0 = G.save.hp;
    T.step(160, () => { p.parryT = 1; p.face = 1; });
    out.goreParry = G.save.hp < hp0;
    return out;
  });
  for (const k of ['charge', 'gore', 'thrust', 'leap']) {
    assert.ok(p1[k].hit, `${k} lands`);
    assert.ok(p1[k].told >= 0.4, `${k} is told first (${p1[k].told}s)`);
  }
  assert.ok(p1.jumped, 'A jump clears the ground-skimming charge');
  assert.ok(!p1.parry.hurt && p1.parry.poise === 260 && p1.parry.bossHp === 0, 'Parried thrust breaks poise: ' + JSON.stringify(p1.parry));
  assert.ok(p1.goreParry, 'The gore goes through a parry');
  console.log('Phase I tells, hits, jump and parry rules passed:', JSON.stringify(p1));

  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(600, 1); T.ready(420); b.start('charge'); T.step(60); G.camera.snapTo(520, b.floorY - 80); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p1-charge-desktop.png' });
  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(560, 1); T.ready(470); b.start('thrust'); T.step(50); G.camera.snapTo(520, b.floorY - 80); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p1-thrust-closeup.png', clip: { x: 340, y: 120, width: 640, height: 460 } });

  // ---------------------------------------------------------------- phase II
  const p2 = await page.evaluate(() => { T.label = 'p2';
    const { G } = window.__remnant, W = G.world, b = W.boss, p = W.player, out = {};
    T.reset(560, 1); T.ready(420); p.invuln = 99;
    b.takeHit({ dmg: 1e12, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    out.held = +(b.hp / b.maxHp).toFixed(3);
    out.transition = b.state;
    T.step(260, () => { p.invuln = 99; });
    out.phase = b.phase; out.atk = b.atk; out.sub = b.sub;
    // The fury ends in the wall: he reels, open to a finisher.
    let kneelAt = -1;
    for (let i = 0; i < 1200 && b.state !== 'kneel'; i++) T.step(1, () => { p.invuln = 99; kneelAt = i; });
    out.wall = { kneel: b.state === 'kneel' && kneelAt > 0, x: b.x, wallL: b.wallL, wallR: b.wallR, exec: b.executable(), staggered: +b.staggered.toFixed(2) };
    const hp0 = b.hp;
    b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    out.punish = hp0 - b.hp;
    T.step(600, () => { p.invuln = 99; });
    out.recovered = b.state !== 'kneel';
    // The ram's two horns: out and back, gold for a parry; a parry shatters one.
    T.reset(560, 2); T.ready(420); b.start('horns');
    out.rams = b.rams.length;
    const poise0 = b.poise;
    const thrown = b.rams.slice();
    // Elior meets each horn in flight, guard up and facing it.
    T.step(300, () => { const h = thrown.find(r => !r.remove && r.flying); if (h) p.x = h.x - 8 * h.dir; p.parryT = 1; p.face = 1; p.invuln = 0; G.save.hp = G.d.maxHp; if (b.state === 'idle') b.cd = 99; });
    const shattered = thrown.filter(r => r.remove).length;
    out.ramParry = { shattered, poise: poise0 - b.poise };
    // Unparried, the low horn hurts a grounded Elior and returns to him.
    T.reset(560, 2); T.ready(420); b.start('horns');
    const hp1 = G.save.hp;
    let back = false;
    const two = b.rams.slice();
    T.step(400, () => { p.invuln = G.save.hp < hp1 ? 99 : 0; if (two[0].back) back = true; if (b.state === 'idle') b.cd = 99; });
    out.ramHit = G.save.hp < hp1; out.ramBack = back; out.ramGone = two.every(r => r.remove);
    return out;
  });
  assert.ok(Math.abs(p2.held - 0.66) < 0.005, `Phase gate holds at 66% (${p2.held})`);
  assert.equal(p2.transition, 'transition');
  assert.equal(p2.phase, 2); assert.equal(p2.atk, 'fury'); assert.match(p2.sub, /Fury of His Power/);
  assert.ok(p2.wall.kneel && p2.wall.exec, 'The fury ends in the wall with a stun: ' + JSON.stringify(p2.wall));
  assert.ok(p2.wall.x < p2.wall.wallL + 60 || p2.wall.x > p2.wall.wallR - 60, 'He is at the wall');
  assert.equal(p2.punish, 1500, 'A reeling prince takes the kneel bonus');
  assert.ok(p2.recovered, 'He recovers from the stun');
  assert.equal(p2.rams, 2);
  assert.ok(p2.ramParry.shattered >= 1 && p2.ramParry.poise >= 150, 'Parry shatters a ram horn: ' + JSON.stringify(p2.ramParry));
  assert.ok(p2.ramHit && p2.ramBack && p2.ramGone, 'Ram horns hit, turn back and are gone');
  console.log('Phase II gate, fury into the wall, punish window and ram horns passed:', JSON.stringify(p2));

  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(560, 2); T.ready(420); b.start('horns'); T.step(100); G.camera.snapTo(520, b.floorY - 80); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p2-horns-desktop.png' });
  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(300, 2); T.ready(560); b.start('fury'); b.n = b.furyN - 1; b.aimCharge(true); T.step(60); G.camera.snapTo(560, b.floorY - 80); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p2-wall-charge-desktop.png' });

  // ---------------------------------------------------------------- phase III: the horn breaks
  const p3 = await page.evaluate(() => { T.label = 'p3';
    const { G } = window.__remnant, W = G.world, b = W.boss, p = W.player, out = {};
    T.reset(560, 2); T.ready(420); p.invuln = 99;
    b.takeHit({ dmg: 1e12, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    out.held = +(b.hp / b.maxHp).toFixed(3);
    out.cut = G.inCutscene; out.phase = b.phase;
    out.cracking = { horn: 0, crack: 0 };
    let n = 0;
    for (; n < 900 && b.horn !== 2; n++) T.step(1, () => { p.invuln = 99; if (b.horn === 1 && b.crack > out.cracking.crack) out.cracking = { horn: 1, crack: +b.crack.toFixed(2) }; });
    out.broken = b.horn; out.breakAt = +(n / 120).toFixed(2);
    for (n = 0; n < 900 && b.state === 'transition'; n++) T.step(1, () => { p.invuln = 99; });
    out.after = { four: b.four, atk: b.atk, ward: b.ward, cut: G.inCutscene, sub: b.sub };
    const hp0 = b.hp;
    out.wardHit = b.takeHit({ dmg: 5000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    out.wardHp = hp0 === b.hp;
    out.targetable = b.canBeTargeted();
    return out;
  });
  assert.ok(Math.abs(p3.held - 0.33) < 0.005, `Phase gate holds at 33% (${p3.held})`);
  assert.ok(p3.cut && p3.phase === 3, 'The horn breaking is a cinematic');
  assert.ok(p3.cracking.horn === 1 && p3.cracking.crack > 0, 'The great horn cracks first');
  assert.equal(p3.broken, 2, 'Then it breaks');
  assert.ok(p3.after.four === 1 && p3.after.atk === 'winds' && p3.after.ward && !p3.after.cut, 'Four horns rise and call the winds: ' + JSON.stringify(p3.after));
  assert.ok(!p3.wardHit && p3.wardHp && !p3.targetable, 'Nothing reaches him in the winds');
  console.log('Phase III horn break and ward passed:', JSON.stringify(p3));

  // ---------------------------------------------------------------- the four winds, read right and wrong
  const winds = await page.evaluate(() => { T.label = 'winds';
    const { G } = window.__remnant, W = G.world, b = W.boss, p = W.player;
    const cycle = (right) => {
      T.reset(560, 3); b.horn = 2; b.four = 1; T.ready(400); b.start('winds');
      const seen = [[], [], [], []], kinds = [[], [], [], []], dmg = [0, 0, 0, 0];
      let last = G.save.hp, kneel = false, minTell = 9, wardAtKneel = null;
      T.step(2400, () => {
        if (b.state === 'kneel') { if (!kneel) wardAtKneel = b.ward; kneel = true; }
        if (kneel) { p.invuln = 99; G.save.hp = G.d.maxHp; return; }
        const k = b.wind;
        for (const l of b.lanes) if (l.on && k >= 0 && !seen[k].includes(l)) { seen[k].push(l); kinds[k].push((l.dir ? (l.dir > 0 ? 'W>' : '<E') : 'col') + ':' + Math.round(l.y1 - l.y0)); minTell = Math.min(minTell, l.tele); }
        p.invuln = 0; p.state = 'free';
        // Answer each wind (or don't).
        const lanes = b.lanes.filter(l => l.on);
        if (k === 0) {
          const cols = lanes.map(l => l.x).sort((a, c) => a - c);
          if (cols.length) p.x = right ? (cols[0] + cols[1]) / 2 : cols[1];
          p.y = b.floorY;
        } else if (k === 1) p.y = right ? b.floorY - 48 : b.floorY;
        else if (k === 2) { const g = lanes[lanes.length - 1]; p.y = b.floorY; if (g && right && Math.abs(p.x - g.x) < 70) p.x = g.x + (g.x + 110 < b.right ? 110 : -110); }
        else if (k === 3) p.y = right ? b.floorY : b.floorY - 48;
        p.body.vy = 0;
        if (G.save.hp < last && k >= 0) dmg[k] += last - G.save.hp;
        G.save.hp = last = G.d.maxHp;
      });
      return { kinds, dmg, kneel, ward: wardAtKneel, minTell };
    };
    const right = cycle(true), wrong = cycle(false);
    return { right, wrong };
  });
  assert.deepEqual(winds.right.kinds.map(k => k.length), [3, 1, 3, 1], 'Three north columns, the east sweep, three south geysers, the west sweep');
  assert.match(winds.right.kinds[1][0], /^<E:30$/); assert.match(winds.right.kinds[3][0], /^W>:96$/);
  assert.deepEqual(winds.right.dmg, [0, 0, 0, 0], 'Each wind can be read and survived: ' + JSON.stringify(winds.right));
  assert.ok(winds.wrong.dmg.every(d => d > 0), 'Each wind punishes the wrong answer: ' + JSON.stringify(winds.wrong.dmg));
  assert.ok(winds.right.kneel && !winds.right.ward, 'Spent, he falls exposed');
  assert.ok(winds.right.minTell >= 0.7, 'Every lane is marked first');
  console.log('Four winds lanes, answers and the exposed fall passed:', JSON.stringify(winds));

  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(560, 3); b.horn = 2; b.four = 1; T.ready(420); b.start('winds'); T.step(200, () => { G.world.player.invuln = 99; }); G.camera.snapTo(520, b.floorY - 100); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p3-north-desktop.png' });
  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.step(260, () => { G.world.player.invuln = 99; }); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p3-east-desktop.png' });
  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(560, 3); b.horn = 2; b.four = 1; T.ready(470); b.start('thrust'); T.step(50); G.camera.snapTo(520, b.floorY - 80); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-p3-closeup.png', clip: { x: 340, y: 100, width: 640, height: 480 } });

  // ---------------------------------------------------------------- defeat in the gauntlet
  const gdefeat = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, b = W.boss, p = W.player, R = W.story.ch3.rounds;
    T.reset(560, 3); b.horn = 2; b.four = 1; T.ready(420);
    const done0 = R.completed;
    b.takeHit({ dmg: 1e12, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    const dying = b.state;
    for (let i = 0; i < 1500 && !b.remove; i++) T.step(1, () => { p.invuln = 99; });
    T.step(10);
    return { lost: T.lost, active: R.active, dying, removed: b.remove, completed: R.completed - done0, boss: !!W.boss && W.boss === b, campaign: G.save.flags.ch10_rewarded ?? null, nan: T.nan };
  });
  assert.equal(gdefeat.dying, 'dead');
  assert.ok(gdefeat.removed && gdefeat.completed === 1 && !gdefeat.boss, 'Gauntlet counts the win and frees the arena: ' + JSON.stringify(gdefeat));
  assert.equal(gdefeat.campaign, null, 'Gauntlet wins bypass the campaign');
  assert.deepEqual(gdefeat.nan, [], 'No NaN through the fight');
  console.log('Gauntlet defeat passed:', JSON.stringify(gdefeat));

  // ---------------------------------------------------------------- the throne: Chapter X's arena
  const throne = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, s = G.save;
    W.story.ch3.rounds.stop(false);
    delete s.flags.ch10_done; s.defeated = s.defeated.filter(k => k !== 'grecia_prince');
    W.load('grecia_throne', 'left');
    const b = W.boss;
    const out = { key: b?.key, state: b?.state, x: b?.x, floor: b?.floorY };
    W.bossActive = true; b.awaken();
    T.step(600, () => { W.player.invuln = 99; });
    out.fight = b.state; out.walls = [b.wallL, b.wallR];
    // A fury here runs the full width and into the wall.
    T.reset(b.x, 2); T.ready(500); W.player.invuln = 99; b.start('fury');
    T.step(1500, () => { W.player.invuln = 99; if (b.state === 'kneel') b.cd = 99; });
    out.wall = { state: b.state, x: Math.round(b.x) };
    return out;
  });
  assert.equal(throne.key, 'grecia_prince'); assert.equal(throne.state, 'dormant');
  assert.equal(throne.x, 50 * 16); assert.equal(throne.floor, 23 * 16);
  assert.ok(['idle', 'attack'].includes(throne.fight), 'The intro hands over to the fight');
  assert.ok(throne.walls[1] - throne.walls[0] >= 70 * 16, 'Throne arena spans its width: ' + throne.walls);
  console.log('Throne arena spawn, intro and fury passed:', JSON.stringify(throne));
  await page.evaluate(() => { const { G } = window.__remnant, b = G.world.boss; T.reset(700, 1); T.ready(560); b.start('charge'); T.step(70); G.camera.snapTo(640, b.floorY - 90); T.step(1); });
  await page.screenshot({ path: 'qa/grecia-throne-desktop.png' });
  const camp = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, b = W.boss, p = W.player;
    G.ui.dialogue = async () => 0;
    T.reset(700, 3); b.horn = 2; b.four = 1;
    b.takeHit({ dmg: 1e12, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    for (let i = 0; i < 1500 && !b.remove; i++) T.step(1, () => { p.invuln = 99; });
    return { defeated: G.save.defeated.includes('grecia_prince'), removed: b.remove, nan: T.nan };
  });
  assert.ok(camp.defeated && camp.removed, 'Throne defeat reaches the campaign hook');
  await page.waitForFunction(() => window.__remnant.G.save.flags.ch10_done === true, null, { timeout: 15000 });
  console.log('Throne defeat goes through the Fallen Crown story hook (ch10_done set)');
  await page.context().close();

  // ---------------------------------------------------------------- phone, both art styles
  for (const art of ['pixel', 'smooth']) {
    const phone = await boot({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, art);
    await phone.evaluate(() => T.gauntlet());
    const shots = [
      ['p1', "T.reset(560, 1); T.ready(400); b.start('charge'); T.step(70);"],
      ['p2', "T.reset(560, 2); T.ready(420); b.start('horns'); T.step(110);"],
      ['p3', "T.reset(560, 3); b.horn = 2; b.four = 1; T.ready(420); b.start('winds'); T.step(420, () => { G.world.player.invuln = 99; });"],
    ];
    for (const [name, code] of shots) {
      await phone.evaluate((code) => { const { G } = window.__remnant, b = G.world.boss; new Function('G', 'b', 'T', code)(G, b, T); G.camera.snapTo(b.x - 40, b.floorY - 90); T.step(1); }, code);
      await phone.screenshot({ path: `qa/grecia-${name}-phone-${art}.png` });
    }
    const nan = await phone.evaluate(() => T.nan);
    assert.deepEqual(nan, []);
    await phone.context().close();
  }
  console.log('Phone screenshots in pixel and smooth art saved under qa/grecia-*.png');
  assert.deepEqual(errors, []);
  console.log('grecia-boss: all checks passed');
} finally {
  await browser.close();
  server.close();
}
