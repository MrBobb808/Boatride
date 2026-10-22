// Swimming and dives (game/water.ts, game/swim.ts, game/eel.ts): the wading /
// swimming threshold, 8-way swimming, the dash-stroke, surfacing and the
// breach, breath (drain, refill, air bells, drowning damage), currents, Echoes
// paddling after Elior, land foes stopping at deep water, the Brine Eel's
// telegraph → dart → bite → retreat and its parry, and Chapter X's flooded
// rooms. Screenshots of underwater and the surface in both art styles go to qa/.
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
const out = process.env.QA_DIR ?? 'qa';
await mkdir(out, { recursive: true });

async function boot(context, art) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(a => localStorage.setItem('remnant-settings-v1', JSON.stringify({ artStyle: a })), art);
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = true;
    s.level = 30;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style && !window.__remnant.G.world.transitioning);
  await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world;
    G.paused = true;
    G.ui.dialogue = async () => 0;
    const finite = () => {
      for (const e of [W.player, ...W.ents, ...W.echoes]) if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.body.vx) || !Number.isFinite(e.body.vy)) throw Error('NaN: ' + (e.name || e.kind || 'player'));
      if (!Number.isFinite(W.player.water.breath) || !Number.isFinite(W.player.water.angle)) throw Error('NaN in swim state');
    };
    window.__sw = {
      room(spawn = 'basin') {
        R.swimRoom(spawn);
        G.inCutscene = false;
        for (const e of W.ents) if (e.isFoe) e.remove = true;
        this.reset();
      },
      reset() {
        const p = W.player;
        p.state = 'free'; p.invuln = 0; p.parryT = 0; p.body.vx = p.body.vy = 0; p.face = 1; p.atk = null;
        p.water.breath = 20; p.water.dashT = p.water.dashCd = 0;
        R.input.axisX = R.input.axisY = 0;
        G.save.hp = G.d.maxHp;
      },
      put(x, y) { const p = W.player; p.x = x; p.y = y; p.body.vx = p.body.vy = 0; this.step(2); },
      step(n, each) {
        for (let i = 0; i < n; i++) {
          G.inCutscene = false;
          each?.(i);
          W.update(1 / 120);
          finite();
        }
      },
      until(fn, max = 600, each) {
        for (let i = 0; i < max; i++) {
          if (fn()) return i;
          G.inCutscene = false;
          each?.(i);
          W.update(1 / 120);
          finite();
        }
        throw Error('timed out waiting for ' + fn.toString());
      },
    };
  });
  return page;
}

const T = 16;
const shots = [];
try {
  const context = await browser.newContext({ viewport: { width: 956, height: 440 } });
  const page = await boot(context, 'pixel');

  // ---------------------------------------------------------------- threshold, movement, dash, surfacing
  const move = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('move: ' + m); };
    S.room('left');
    // One tile of water is waded: slower, still on foot.
    S.put(14.6 * 16, 19 * 16);
    check(p.water.wading && !p.water.swimming && p.state === 'free', 'one tile of water is waded');
    R.input.axisX = 1; S.step(30); const wadeV = p.body.vx;
    check(p.water.wading, 'still wading');
    S.put(6 * 16, 18 * 16); S.step(30); const landV = p.body.vx; R.input.axisX = 0;
    check(Math.abs(wadeV / landV - 0.72) < 0.03, `wading slows (${wadeV.toFixed(0)} vs ${landV.toFixed(0)})`);
    // Deep water is swum.
    S.reset(); S.put(32 * 16, 24 * 16);
    check(p.water.swimming && p.state === 'swim' && p.water.submerged, 'deep water is swum');
    const y0 = p.y; R.input.axisY = 1; S.step(60); const down = p.y - y0;
    const y1 = p.y; R.input.axisY = -1; S.step(60); const up = y1 - p.y;
    R.input.axisY = 0; const x0 = p.x; R.input.axisX = 1; S.step(60); const right = p.x - x0;
    check(p.face === 1 && right > 40 && down > 25 && up > 25, `8-way swim (down ${down.toFixed(0)}, up ${up.toFixed(0)}, right ${right.toFixed(0)})`);
    R.input.axisX = -1; S.step(30); check(p.face === -1, 'turns to swim left');
    R.input.axisX = 0.7; R.input.axisY = -0.7; const dx0 = p.x, dy0 = p.y; S.step(90);
    check(p.x > dx0 + 10 && p.y < dy0 - 10, 'diagonal swim');
    // Holding up only brings him to the float line: head out, not above the water.
    R.input.axisX = 0; R.input.axisY = -1; S.step(500);
    const rest = p.water.surface + 28;
    check(Math.abs(p.y - rest) < 3 && !p.water.submerged && p.state === 'swim', `treads at the surface (y ${p.y.toFixed(1)} rest ${rest})`);
    R.input.axisY = 0;
    // Dash-stroke: fast, brief i-frames, cooldown.
    S.reset(); S.put(32 * 16, 25 * 16);
    R.input.axisX = 1; p.dodgeBuf = 0.2; S.step(1); R.input.axisX = 0;
    check(p.water.dashT > 0 && p.water.dashCd > 0, 'dash-stroke starts');
    S.step(5);
    const dashV = p.body.vx, inv = p.isInvuln();
    S.step(40);
    check(dashV > 200 && inv && !p.isInvuln() && p.state === 'swim', `dash-stroke (${dashV.toFixed(0)} px/s, i-frames)`);
    // Idle, he drifts up to the surface.
    S.reset(); S.put(40 * 16, 23 * 16);
    const rose = S.until(() => !p.water.submerged, 900);
    // Breach: a jump clear of the water.
    S.step(240);
    p.jumpBuf = 0.2; S.step(1);
    check(p.state === 'free' && p.body.vy < -300, 'breach leaps out');
    let top = p.y; S.step(50, () => { top = Math.min(top, p.y); });
    const clear = p.water.surface - top;
    check(clear > 20, 'breach clears the surface by ' + clear.toFixed(0));
    S.until(() => p.water.swimming, 300);
    // ...and onto the shore.
    S.reset(); S.put(27.2 * 16, 22 * 16); S.until(() => !p.water.submerged, 900); S.step(120);
    R.input.axisX = -1; p.jumpBuf = 0.2;
    S.until(() => p.body.onGround && !p.water.inWater, 300);
    R.input.axisX = 0;
    check(p.x < 26 * 16 && Math.abs(p.y - 18 * 16) < 1, 'breach onto the shore');
    return { wadeV: +wadeV.toFixed(1), landV: +landV.toFixed(1), down: +down.toFixed(1), up: +up.toFixed(1), right: +right.toFixed(1), dashV: +dashV.toFixed(1), riseSteps: rose, breachClear: +clear.toFixed(1) };
  });

  // ---------------------------------------------------------------- breath
  const breath = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('breath: ' + m); };
    S.room(); S.put(34 * 16, 28 * 16);
    R.input.axisY = 1;
    S.step(600);
    const after5 = p.water.breath;
    check(Math.abs(after5 - 15) < 0.3 && p.water.submerged && p.water.showT > 0.9, 'drains a second per second: ' + after5.toFixed(2));
    check(R.water().muffled, 'the mix is muffled under water');
    S.step(1900);
    check(p.water.breath === 0, 'runs out at 20 s');
    const hp0 = G.save.hp;
    S.step(360);
    const lost = hp0 - G.save.hp;
    check(lost > 0 && p.state !== 'dead' && G.save.hp > 0, 'drowning is damage over time, not death');
    const ticks = Math.round(lost / Math.round(G.d.maxHp * 0.08));
    R.input.axisY = 0;
    S.until(() => !p.water.submerged, 1200);
    check(!R.water().muffled, 'surfacing restores the mix');
    const refillSteps = S.until(() => p.water.breath >= 20, 400);
    // An air bell in the flooded tunnel: under water, yet breathing.
    S.reset(); S.put(62 * 16, 25 * 16); p.water.breath = 4;
    S.step(120);
    check(p.water.submerged && p.water.pocket && p.water.breath > 15, 'air bell refills breath (' + p.water.breath.toFixed(1) + ')');
    // Out of the bell, the flooded tunnel has no air.
    S.put(58 * 16, 27 * 16); p.water.breath = 10; R.input.axisY = 1; S.step(120); R.input.axisY = 0;
    check(p.water.submerged && !p.water.pocket && p.water.breath < 10 && !p.water.air, 'flooded tunnel drains breath');
    return { after5s: +after5.toFixed(2), drownTicksIn3s: ticks, hpLost: lost, refillSteps };
  });

  // ---------------------------------------------------------------- currents
  const current = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('current: ' + m); };
    S.room(); S.put(45 * 16, 26 * 16);
    let x0 = p.x; S.step(120); const drift = p.x - x0;
    S.put(53 * 16, 26 * 16); R.input.axisX = -1;
    x0 = p.x; S.step(120); const against = p.x - x0;
    S.put(32 * 16, 26 * 16);
    x0 = p.x; S.step(120); const still = p.x - x0; R.input.axisX = 0;
    check(drift > 60 && against < 0 && against > still * 0.5, `carried ${drift.toFixed(0)} px/s; against it ${against.toFixed(0)} vs ${still.toFixed(0)} in still water`);
    G.camera.snapTo(48 * 16, 24 * 16);
    S.step(120);
    check(R.water().bubbles > 0, 'streaks and bubbles in view');
    return { drift: +drift.toFixed(1), against: +against.toFixed(1), still: +still.toFixed(1), particles: R.water().bubbles };
  });

  // ---------------------------------------------------------------- Echoes and land foes
  const allies = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('allies: ' + m); };
    S.room();
    G.save.flags.army_out = true;
    R.echo('sentinel');
    const e = W.echoes[W.echoes.length - 1];
    check(e, 'an Echo is out');
    S.put(34 * 16, 24 * 16);
    e.x = 20 * 16; e.y = 18 * 16; e.summonT = 0;
    const hp0 = e.hp;
    let swam = false, near = 9e9;
    S.step(1200, () => { swam ||= e.swim.on; near = Math.min(near, Math.hypot(e.x - p.x, e.y - p.y)); p.water.breath = 20; });
    check(swam && near < 70 && e.hp === hp0, `Echo swims after Elior without drowning (closest ${near.toFixed(0)})`);
    const inWater = e.swim.on;
    // Elior climbs out: it follows him ashore.
    S.put(8 * 16, 18 * 16);
    const out = S.until(() => !e.swim.on && e.body.onGround && e.y <= 18 * 16 + 1, 1500);
    check(e.hp === hp0, 'still unhurt');
    // A husk on the shore will not walk into deep water after him.
    S.put(32 * 16, 21 * 16);
    const h = W.spawnEnemy('husk', 22 * 16, 18 * 16);
    S.step(600, () => { p.water.breath = 20; p.invuln = 1; });
    const edge = h.x;
    check(h.x <= 26 * 16 - h.body.w / 2 + 2 && Math.abs(h.y - 18 * 16) < 1, 'husk stops at the water: x ' + (h.x / 16).toFixed(2));
    h.body.vx = 400; S.step(30, () => { p.invuln = 1; });
    check(h.x <= 26 * 16 - h.body.w / 2 + 2, 'shoved toward it, it still stops');
    const gale = W.spawnEnemy('gale', 34 * 16, 20 * 16);
    check(gale.grav === 0, 'fliers ignore the water');
    h.remove = gale.remove = true;
    return { echoSwam: inWater || swam, closest: +near.toFixed(1), ashoreSteps: out, huskEdgeTile: +(edge / 16).toFixed(2) };
  });

  // ---------------------------------------------------------------- the Brine Eel
  const eel = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('eel: ' + m); };
    S.room();
    for (const e of W.echoes) e.remove = true;
    const e = W.spawnEnemy('eel', 36 * 16, 28 * 16);
    check(e.name === 'Brine Eel' && e.grav === 0, 'eel');
    S.put(41 * 16, 22 * 16);
    const keep = () => { p.state = 'swim'; p.invuln = 0; p.parryT = 0; p.water.breath = 20; p.x = 41 * 16; p.y = 22 * 16; p.body.vx = p.body.vy = 0; };
    // Hidden in its lair: blades pass it by.
    check(!e.takeHit({ dmg: 10, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p }) && !e.canBeTargeted(), 'safe in its lair');
    const t0 = S.until(() => e.state === 'coil', 400, keep);
    const hp0 = G.save.hp;
    const toward = e.dirX > 0.3 && e.dirY < 0;
    S.until(() => e.state === 'dart', 200, keep);
    check(G.save.hp === hp0 && toward, 'the coil is a harmless tell aimed at him');
    S.until(() => e.state === 'bite', 200, () => { p.invuln = 0; p.state = 'swim'; p.parryT = 0; });
    S.until(() => e.state === 'retreat', 200, () => { p.invuln = 0; p.parryT = 0; });
    check(G.save.hp < hp0, 'the dart and bite hurt');
    S.until(() => e.state === 'lurk', 400, () => { p.invuln = 1; });
    check(Math.hypot(e.x - e.lairX, e.y - e.lairY) < 4 && e.attackCd > 1, 'swims back into its lair');
    // A parried bite stuns it out in the water.
    e.attackCd = 0; G.save.hp = G.d.maxHp;
    S.until(() => e.state === 'dart', 400, keep);
    const hp1 = G.save.hp;
    S.until(() => e.staggered > 0, 200, () => { p.state = 'swim'; p.face = -e.face; p.parryT = 1; p.invuln = 0; });
    p.parryT = 0;
    check(G.save.hp === hp1 && e.canBeTargeted(), 'parried: stunned, open, no damage');
    const struck = e.takeHit({ dmg: 10, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    check(struck, 'stunned out of its lair it can be struck');
    S.step(30, () => { p.invuln = 1; });
    e.takeHit({ dmg: 1e9, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p });
    S.until(() => e.remove, 300);
    check((G.save.bestiary?.eel ?? 0) > 0, 'recorded in the bestiary');
    return { coilAfterSteps: t0, bitten: hp0 - G.save.hp >= 0, parried: true, bestiary: G.save.bestiary.eel };
  });

  // ---------------------------------------------------------------- an attack and a parry under water; refused abilities
  const fight = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('fight: ' + m); };
    S.room(); S.put(32 * 16, 24 * 16);
    p.queued = 'attack'; p.queuedT = 0.3; S.step(1);
    check(p.state === 'attack' && p.atk.id === p.moves.combo[0].id, 'attack thrusts under water');
    S.until(() => p.state === 'swim', 200);
    p.parryBuf = 0.2; S.step(1);
    check(p.state === 'parry', 'parry under water');
    S.until(() => p.state === 'swim', 200);
    const ce = G.save.ce; G.save.ce = 999; p.heavyQ = 0.2; S.step(2);
    check(p.state === 'swim' && p.heavyQ === 0, 'heavy refused under water');
    check(!p.tryTransform(), 'no Mantle under water');
    G.save.ce = ce;
    return { attack: true, parry: true, refused: true };
  });

  // ---------------------------------------------------------------- Chapter X's flooded rooms
  const grecia = await page.evaluate(() => {
    const R = window.__remnant, { G } = R, W = G.world, p = W.player, S = window.__sw;
    const check = (x, m) => { if (!x) throw Error('grecia: ' + m); };
    const res = {};
    W.load('sunken_temple', 'start'); G.inCutscene = false;
    for (const e of W.ents) if (e.isFoe) e.remove = true;
    S.reset(); S.step(2);
    check(!p.water.inWater, 'dry at the temple door');
    R.input.axisX = 1;
    res.templeWalkIn = S.until(() => p.water.swimming, 900);
    R.input.axisX = 0;
    check(p.x >= 16 * 16 && p.state === 'swim', 'walks into the flooded temple and swims: ' + JSON.stringify({ x: p.x, y: p.y, st: p.state, room: W.room.id, sw: p.water.swimming }));
    R.input.axisY = 1; S.step(240); R.input.axisY = 0;
    check(p.water.submerged, 'dives in the temple');
    res.templeRise = S.until(() => !p.water.submerged, 1500, () => { p.water.breath = 20; });
    check(Math.abs(p.water.surface - (14 * 16 + 5)) < 1, 'the temple surface is row 14 (ledges stay under water)');
    W.load('drowned_library', 'start'); G.inCutscene = false;
    for (const e of W.ents) if (e.isFoe) e.remove = true;
    S.reset(); S.step(2);
    R.input.axisX = 1;
    let waded = false;
    S.until(() => p.x > 30 * 16, 1500, () => { waded ||= p.water.wading; });
    R.input.axisX = 0;
    res.libraryDepthPx = 24 * 16 - (21 * 16 + 5);
    res.librarySwims = p.water.swimming;
    return res;
  });

  // ---------------------------------------------------------------- screenshots: under water and at the surface, both styles
  for (const art of ['pixel', 'smooth']) {
    const ctx2 = art === 'pixel' ? context : await browser.newContext({ viewport: { width: 956, height: 440 } });
    const pg = art === 'pixel' ? page : await boot(ctx2, art);
    for (const [name, setup] of [
      ['basin-under', () => { const S = window.__sw, W = window.__remnant.G.world; S.room(); S.put(46 * 16, 25 * 16); window.__remnant.input.axisX = 1; S.step(70); window.__remnant.input.axisX = 0; W.player.water.breath = 7; }],
      ['basin-surface', () => { const S = window.__sw, W = window.__remnant.G.world; S.room(); S.put(32 * 16, 20 * 16); S.step(400); }],
      ['eel-coil', () => { const S = window.__sw, W = window.__remnant.G.world, p = W.player; S.room(); const e = W.spawnEnemy('eel', 36 * 16, 28 * 16); S.put(41 * 16, 22 * 16); S.until(() => e.state === 'coil', 400, () => { p.x = 41 * 16; p.y = 22 * 16; }); S.step(40, () => { p.x = 41 * 16; p.y = 22 * 16; }); }],
      ['temple-under', () => { const R = window.__remnant, { G } = R, W = G.world, S = window.__sw; W.load('sunken_temple', 'start'); G.inCutscene = false; S.reset(); S.put(40 * 16, 24 * 16); R.input.axisX = 1; S.step(60); R.input.axisX = 0; }],
      ['temple-surface', () => { const R = window.__remnant, { G } = R, W = G.world, S = window.__sw; W.load('sunken_temple', 'start'); G.inCutscene = false; S.reset(); S.put(30 * 16, 17 * 16); S.step(400); }],
    ]) {
      await pg.evaluate(`(${setup})()`);
      await pg.evaluate(() => { const { G } = window.__remnant, p = G.world.player; G.camera.snapTo(p.x + p.face * 20, p.y - 40); });
      await pg.waitForTimeout(150);
      const file = `${out}/swim-${name}-${art}.png`;
      await pg.screenshot({ path: file });
      shots.push(file);
    }
    if (art !== 'pixel') await ctx2.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pass: 'wading/swimming, 8-way swim, dash-stroke, surfacing and breach, breath and air bells, currents, Echoes, land foes, Brine Eel, Chapter X rooms, both art styles', move, breath, current, allies, eel, fight, grecia, shots: shots.length }));
  await context.close();
} finally {
  await browser.close();
  server.close();
}
