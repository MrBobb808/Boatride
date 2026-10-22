// The signature foes of Chapters VII–IX: Antlered Stalker, Swarm Carrier and
// Slag Golem. Steps each through its telegraph → attack → recovery cycle in
// its own chapter's room, checks the parry/armour/core rules and the hazards
// they leave, draws them in both art styles, and saves close-ups to qa/.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
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
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = true;
    s.level = 60;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style && !window.__remnant.G.world.transitioning);
  // Shared helpers: a clean flat stretch of the chapter's own room, and a stepping clock.
  await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world;
    G.paused = true;
    G.ui.dialogue = async () => 0;
    const finite = () => { for (const e of [W.player, ...W.ents]) if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) throw Error('NaN position: ' + (e.name || e.kind)); };
    window.__ff = {
      setup(room, kind, tileX, dx) {
        W.load(room, 'left');
        G.inCutscene = false;
        for (const e of W.ents) if (e.isFoe || e.team === 'enemy') e.remove = true;
        for (let i = W.ents.length - 1; i >= 0; i--) if (W.ents[i].remove) W.ents.splice(i, 1);
        const p = W.player;
        p.x = tileX * 16; p.y = (W.room.h - 4) * 16; p.body.vx = p.body.vy = 0; p.face = 1; p.state = 'free'; p.invuln = 0; p.parryT = 0;
        G.save.hp = G.d.maxHp;
        const e = W.spawnEnemy(kind, p.x + dx, p.y);
        e.attackCd = 0;
        this.step(1);
        return e;
      },
      step(n, each) {
        for (let i = 0; i < n; i++) {
          W.update(1 / 120);
          if (each && each(i) === false) return i;
          finite();
        }
        return n;
      },
      until(fn, max = 600, each) {
        for (let i = 0; i < max; i++) {
          if (fn()) return i;
          W.update(1 / 120);
          each?.();
          finite();
        }
        throw Error('timed out waiting for ' + fn.toString());
      },
      byName(name) { return W.ents.filter(e => e.name === name && !e.remove); },
      keep() { const p = W.player; p.state = 'free'; p.invuln = 0; p.parryT = 0; if (G.save.hp < G.d.maxHp * 0.5) G.save.hp = G.d.maxHp; },
      hit(e, dir, dmg = 100) { return e.takeHit({ dmg, poise: 0, kx: 0, ky: 0, dir, kind: 'melee', src: W.player }); },
      // Draw every entity of the room in both art styles; telegraph overlays included.
      drawBoth() {
        const r = G.renderer, was = r.pixel;
        for (const px of [false, true]) { r.pixel = px; W.draw(r.wctx); for (const e of W.ents) e.drawOverlay?.(r.wctx); }
        r.pixel = was;
      },
      /** A close-up of a foe (and its telegraph) at 4×, classic or shaded pixel art. */
      shot(e, pixel, w = 96, h = 84) {
        const r = G.renderer, was = r.pixel, S = 4;
        const src = document.createElement('canvas'); src.width = w * (pixel ? 1 : S); src.height = h * (pixel ? 1 : S);
        const c = src.getContext('2d');
        c.fillStyle = '#1c1820'; c.fillRect(0, 0, src.width, src.height);
        const k = pixel ? 1 : S;
        c.setTransform(k, 0, 0, k, (-e.x + w / 2) * k, (-e.y + h - 10) * k);
        c.fillStyle = '#3a3238'; c.fillRect(e.x - w, e.y, w * 2, 12);
        r.pixel = pixel;
        for (const x of W.ents) if (x !== e && x.team === 'enemy' && Math.abs(x.x - e.x) < w) W.drawActor(c, x);
        W.drawActor(c, e);
        e.drawOverlay?.(c);
        r.pixel = was;
        if (!pixel) return src.toDataURL();
        const big = document.createElement('canvas'); big.width = w * S; big.height = h * S;
        const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(src, 0, 0, big.width, big.height);
        return big.toDataURL();
      },
    };
  });
  return page;
}

const shots = {};
async function save(page, name, url) {
  const file = `${out}/foe-${name}.png`;
  await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
  shots[name] = file;
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await boot(context, 'pixel');

  // ---------------------------------------------------------------- VII · Antlered Stalker
  const stalker = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, p = W.player, F = window.__ff;
    const check = (x, m) => { if (!x) throw Error('stalker: ' + m); };
    const e = F.setup('riftwood_trail', 'stalker', 50, 120);
    check(e.tier === 7 && e.name === 'Antlered Stalker', 'chapter VII tier');
    // Telegraph: it crouches and marks the floor under you; the tell itself is harmless.
    F.until(() => e.state === 'crouch', 400, () => F.keep());
    const hp0 = G.save.hp;
    F.until(() => e.state === 'pounce', 200, () => { p.invuln = 0; });
    check(G.save.hp === hp0, 'crouch tell is safe');
    check(Math.abs(e.markX - p.x) < 30, 'amber mark sits under the target');
    const shotsAt = { crouchMark: e.markX };
    F.until(() => e.state === 'land', 200, () => { p.invuln = 0; p.state = 'free'; });
    check(G.save.hp < hp0, 'pounce hurts a target standing on the mark');
    check(Math.abs(e.x - e.markX) < 28, 'lands on its mark');
    // Two-hit rake straight out of the landing.
    G.save.hp = G.d.maxHp;
    F.until(() => e.state === 'rake', 120, () => { p.x = e.x + e.face * 22; p.y = e.y; });
    // Count the blows that land on Elior (spy on the shared hit path).
    let hits = 0;
    const hps = W.hitPlayerSide;
    W.hitPlayerSide = function (box, h, set) { const r = hps.call(this, box, h, set); if (r && h.src === e) hits++; return r; };
    const hpR = G.save.hp;
    F.until(() => e.state !== 'rake', 240, () => { p.x = e.x + e.face * 22; p.y = e.y; p.body.vx = 0; p.state = 'free'; p.invuln = 0; });
    W.hitPlayerSide = hps;
    check(G.save.hp < hpR, 'rake hurts');
    check(hits === 2, 'rake strikes twice, got ' + hits);
    // Recovery: it falls back and circles at a distance before trying again.
    check(e.attackCd > 0.5, 'cooldown after the rake');
    p.x = e.x + e.face * 30;
    F.step(150, () => F.keep());
    check(Math.abs(e.x - p.x) > 60, 'retreats to circle');
    // A parried rake throws it open (stagger) and does not hurt.
    p.x = e.x + 26; p.face = -1; e.face = 1; e.attackCd = 0; e.target = p;
    G.save.hp = G.d.maxHp;
    F.until(() => e.state === 'rake', 200, () => { p.x = e.x + e.face * 26; p.face = -e.face; F.keep(); });
    const hp1 = G.save.hp;
    F.until(() => e.staggered > 0, 200, () => { p.x = e.x + e.face * 26; p.face = -e.face; p.state = 'free'; p.parryT = 1; p.invuln = 0; });
    check(G.save.hp === hp1 && e.executable(), 'parried rake staggers and opens an execution');
    p.parryT = 0;
    F.drawBoth();
    // Death fades and leaves no stray hazards.
    F.hit(e, 1, 1e9);
    check(e.dying, 'stalker dies');
    F.until(() => e.remove, 300);
    return { pounce: true, rakeHits: hits, retreat: true, parry: true, ...shotsAt };
  });
  assert.equal(stalker.rakeHits, 2);

  // ---------------------------------------------------------------- VIII · Swarm Carrier
  const carrier = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, p = W.player, F = window.__ff;
    const check = (x, m) => { if (!x) throw Error('carrier: ' + m); };
    const e = F.setup('greenfall_marsh', 'carrier', 46, 120);
    check(e.tier === 8 && e.name === 'Swarm Carrier', 'chapter VIII tier');
    F.until(() => e.state === 'swell', 300, () => F.keep());
    check(F.byName('Swarm').length === 0, 'no cloud during the swell tell');
    F.until(() => F.byName('Swarm').length === 1, 200, () => F.keep());
    const cloud = F.byName('Swarm')[0];
    check(e.attackCd > 3, 'long gap between swarms');
    // It drifts after you and stings while you stand in it.
    const hp0 = G.save.hp;
    F.until(() => Math.abs(cloud.x - p.x) < 10 && Math.abs(cloud.y - 6 - p.y) < 20, 400, () => { p.state = 'free'; });
    F.step(120, () => { p.state = 'free'; });
    check(G.save.hp < hp0, 'swarm stings over time');
    const stung = hp0 - G.save.hp;
    // Struck, it scatters (through the same hit path blades and Echoes use).
    for (let i = 0; i < 3; i++) W.hitEnemies(cloud.hurtbox(), { dmg: 10, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: p }, new Set());
    F.step(1);
    check(cloud.remove && F.byName('Swarm').length === 0, 'three blows scatter the cloud');
    // A second cloud that is left alone runs out on its own.
    e.attackCd = 0;
    F.until(() => F.byName('Swarm').length === 1, 400, () => F.keep());
    const c2 = F.byName('Swarm')[0];
    p.x = e.x - 200;
    F.until(() => c2.remove, 900, () => { p.x = c2.x + 120; F.keep(); });
    // Crowd it and it heaves its sac at you.
    const floorY = (W.room.h - 4) * 16;
    e.x = 52 * 16; e.y = floorY; e.body.vx = 0; p.x = e.x + 24; p.y = floorY; e.bashCd = 0; e.attackCd = 5; G.save.hp = G.d.maxHp;
    F.until(() => e.state === 'bash', 200, () => { p.x = e.x + 24; F.keep(); });
    const hp1 = G.save.hp;
    F.until(() => e.state !== 'bash', 200, () => { p.x = e.x + e.face * 22; p.state = 'free'; p.invuln = 0; });
    check(G.save.hp < hp1, 'sac bash hurts');
    F.drawBoth();
    // Death: it bursts into a telegraphed spore patch that blooms, hurts, then expires.
    G.save.hp = G.d.maxHp; p.x = e.x;
    F.hit(e, 1, 1e9);
    const patch = F.byName('Spores')[0];
    check(patch && Math.abs(patch.x - e.x) < 2, 'spore patch where it burst');
    const hp2 = G.save.hp;
    F.step(80, () => { p.x = patch.x; p.state = 'free'; });
    check(G.save.hp === hp2 && !patch.active, 'spore ring is a harmless warning first');
    F.step(80, () => { p.x = patch.x; p.state = 'free'; });
    check(patch.active && G.save.hp < hp2, 'spores bloom and hurt');
    p.x = patch.x + 150; const hp3 = G.save.hp;
    F.step(60, () => { p.state = 'free'; });
    check(G.save.hp === hp3, 'stepping out of the patch is safe');
    F.until(() => patch.remove, 600);
    check(e.remove, 'carrier removed after bursting');
    return { swell: true, stung, scatter: true, expire: true, bash: true, sporePatch: true };
  });

  // ---------------------------------------------------------------- IX · Slag Golem
  const golem = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, p = W.player, F = window.__ff;
    const check = (x, m) => { if (!x) throw Error('golem: ' + m); };
    const e = F.setup('slag_procession', 'golem', 46, 100);
    check(e.tier === 9 && e.name === 'Slag Golem', 'chapter IX tier');
    // Armoured front: a frontal blow is blunted, a blow from behind lands in full.
    e.attackCd = 9;
    let h = e.hp; F.hit(e, -e.face); const front = h - e.hp;
    h = e.hp; F.hit(e, e.face); const back = h - e.hp;
    check(front === 40 && back === 100, `front ${front} back ${back}`);
    e.attackCd = 0;
    F.until(() => e.state === 'slam', 300, () => F.keep());
    const hp0 = G.save.hp;
    F.step(100, () => F.keep());
    check(e.state === 'slam' && G.save.hp === hp0 && e.raise > 0.5, 'slam tell (fists raised) is safe');
    F.until(() => F.byName('Slag Wave').length === 1, 60, () => F.keep());
    const wave = F.byName('Slag Wave')[0];
    const fire = W.ents.find(x => x.kind === 'puddle' && !x.remove);
    check(fire, 'burning ground left at the impact');
    // The fire wave runs along the floor: a jump clears it, standing in it does not.
    const floor = wave.y;
    p.x = wave.x; p.y = floor - 55; p.invuln = 0; p.state = 'free'; const air = G.save.hp; wave.update(0);
    check(G.save.hp === air, 'jump clears the fire wave');
    p.y = floor; wave.update(0);
    check(G.save.hp < air, 'grounded fire wave burns');
    // After the slam the core lies open: blows from the front now land harder.
    F.until(() => e.state === 'recover', 120, () => F.keep());
    check(e.coreT > 0, 'core exposed after slam');
    h = e.hp; F.hit(e, -e.face); const core = h - e.hp;
    check(core === 175, 'core bonus damage ' + core);
    F.until(() => e.state === 'walk', 400, () => F.keep());
    check(e.coreT === 0, 'core closes again');
    F.until(() => wave.remove && fire.remove, 400, () => { p.x = e.x - 160; F.keep(); });
    // Close in and it swats (parryable).
    e.attackCd = 0; p.x = e.x + e.face * 30; G.save.hp = G.d.maxHp;
    const r = Math.random; Math.random = () => 0.1;
    F.until(() => e.state === 'swat', 300, () => { p.x = e.x + 30; F.keep(); });
    Math.random = r;
    const hp1 = G.save.hp;
    F.until(() => e.staggered > 0 || e.state !== 'swat', 200, () => { p.x = e.x + e.face * 30; p.face = -e.face; p.state = 'free'; p.parryT = 1; p.invuln = 0; });
    check(G.save.hp === hp1 && e.poise < e.maxPoise, 'swat can be parried');
    p.parryT = 0;
    e.attackCd = 0;
    F.until(() => e.state === 'slam', 300, () => F.keep());
    F.step(90, () => F.keep());
    F.drawBoth();
    F.hit(e, 1, 1e9);
    check(e.dying, 'golem dies');
    F.until(() => e.remove, 300);
    return { front, back, core, slamTell: true, wave: true, burn: true, swatParry: true };
  });
  assert.deepEqual([golem.front, golem.back, golem.core], [40, 100, 175]);

  // ---------------------------------------------------------------- placement in the rooms
  const placed = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, n = {};
    for (const [kind, rooms] of [['stalker', ['riftwood_trail', 'fang_pits', 'moonlit_grove', 'claw_ridge']], ['carrier', ['greenfall_marsh', 'sporeworks', 'silent_infirmary', 'pestilent_causeway']], ['golem', ['slag_procession', 'bellows_foundry', 'last_smithy', 'ember_aqueduct']]]) {
      n[kind] = 0;
      for (const room of rooms) { W.load(room, 'left'); G.inCutscene = false; n[kind] += W.ents.filter(e => e.kind === kind).length; for (let i = 0; i < 240; i++) W.update(1 / 120); window.__ff.drawBoth(); }
    }
    const elites = ['fang_warden', 'redmaw_alpha'].map(id => { W.load(id === 'fang_warden' ? 'riftwood_trail' : 'fang_pits', 'left'); return W.ents.some(e => e.elite === id); });
    // The endless Trial sends them in from round 41.
    W.load('trial_arena', 'start');
    const pool = W.story.ch3.rounds.pool(45);
    const trial = ['stalker', 'carrier', 'golem'].every(k => pool.includes(k)) && !W.story.ch3.rounds.pool(35).includes('golem');
    return { ...n, elites, trial };
  });
  assert.deepEqual(placed, { stalker: 4, carrier: 4, golem: 4, elites: [true, true], trial: true });

  // ---------------------------------------------------------------- close-ups (pixel, then classic)
  const poses = async (style) => {
    for (const [room, kind, setup] of [
      ['riftwood_trail', 'stalker', ['idle', 'crouch', 'rake']],
      ['greenfall_marsh', 'carrier', ['idle', 'swell', 'burst']],
      ['slag_procession', 'golem', ['idle', 'slam', 'core']],
    ]) {
      for (const pose of setup) {
        const url = await page.evaluate(([room, kind, pose, style]) => {
          const { G } = window.__remnant, W = G.world, p = W.player, F = window.__ff;
          const e = F.setup(room, kind, 46, 60);
          if (pose === 'idle') { e.attackCd = 9; e.aggro = false; e.setState('idle', e.anim ? 'idle' : undefined); F.step(60); }
          else if (pose === 'crouch') { F.until(() => e.state === 'crouch', 400, () => F.keep()); F.step(40, () => F.keep()); }
          else if (pose === 'rake') { p.x = e.x + 26; F.until(() => e.state === 'rake', 400, () => { p.x = e.x + 26; F.keep(); }); F.step(46, () => { p.x = e.x + 26; F.keep(); }); }
          else if (pose === 'swell') { F.until(() => e.state === 'swell', 400, () => F.keep()); F.step(100, () => F.keep()); }
          else if (pose === 'burst') { F.until(() => F.byName('Swarm').length > 0, 600, () => F.keep()); F.step(60, () => F.keep()); }
          else if (pose === 'slam') { F.until(() => e.state === 'slam', 400, () => F.keep()); F.step(100, () => F.keep()); }
          else if (pose === 'core') { F.until(() => e.state === 'recover', 600, () => F.keep()); F.step(30, () => F.keep()); }
          return F.shot(e, style === 'pixel', kind === 'golem' ? 120 : 96, kind === 'golem' ? 100 : 84);
        }, [room, kind, pose, style]);
        await save(page, `${kind}-${pose}-${style}`, url);
      }
    }
  };
  await poses('pixel');
  await poses('classic');

  // In-game, in each art style, with the room around them.
  for (const art of ['pixel', 'smooth']) {
    const ctx2 = art === 'pixel' ? context : await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = art === 'pixel' ? page : await boot(ctx2, art);
    for (const [room, kind] of [['riftwood_trail', 'stalker'], ['greenfall_marsh', 'carrier'], ['slag_procession', 'golem']]) {
      await pg.evaluate(([room, kind]) => {
        const { G } = window.__remnant, W = G.world, F = window.__ff;
        const e = F.setup(room, kind, 46, 90);
        F.until(() => e.state === (kind === 'stalker' ? 'crouch' : kind === 'carrier' ? 'swell' : 'slam'), 400, () => F.keep());
        F.step(kind === 'stalker' ? 40 : 90, () => F.keep());
        G.camera.snapTo(W.player.x + 45, W.player.y - 40);
      }, [room, kind]);
      await pg.waitForTimeout(150);
      const file = `${out}/foe-${kind}-room-${art}.png`;
      await pg.screenshot({ path: file });
      shots[`${kind}-room-${art}`] = file;
    }
    if (art !== 'pixel') await ctx2.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pass: 'Antlered Stalker, Swarm Carrier and Slag Golem: telegraphs, attacks, recovery, parry/armour/core rules, hazards, placement, both art styles', stalker, carrier, golem, placed, shots: Object.keys(shots).length }));
  await context.close();
} finally {
  await browser.close();
  server.close();
}
