// Chapter XIV's three bosses (remnant/src/game/bosses14.ts, bosses14b.ts, bosses14c.ts): each wakes from its trigger,
// every attack runs to its end, the movements change at their health marks, and each ends as written:
//  - the princes of Meshech and Tubal share one life across two hittable bodies; the shield wall turns a frontal blow
//    aside and a blow from behind or a heavy one gets through; a poise broken on one kneels both;
//  - the Engine of the North: the ram, the roll (ends against a wall and kneels it), pots, volley, the door, flames,
//    rubble; it burns, then its deck falls in;
//  - Gog: four movements; no blow takes his last tenth; the hail falls on marked ground until the sky answers, and
//    then he falls and the chapter's way opens.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const open = async (q) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + q);
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  return page;
};
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });
const E = (page, fn, arg) => page.evaluate(fn, arg);
const SHOTS = process.env.CH14_SHOTS === '1';
/** Strike the boss (as Elior would) with one blow of `dmg`. */
const blow = (page, dmg, extra = {}) => E(page, ([dmg, extra]) => { const w = window.__remnant.world, b = w.cboss; return b.takeHit({ dmg, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player, ...extra }); }, [dmg, extra]);
/** Put the boss at a health fraction (and strike once so the movement change fires). */
const atHealth = async (page, frac) => {
  await E(page, (frac) => { const b = window.__remnant.world.cboss; b.hp = Math.round(b.maxHp * (frac + 0.004)); }, frac);
  await blow(page, 1e4);
};
const godMode = (page) => E(page, () => { const w = window.__remnant.world; window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); });

/** Warp to an arena with the chapter's flags and the boss asleep; wake it through its trigger. */
async function arena(page, room, trigger, key) {
  await E(page, ([room]) => {
    const w = window.__remnant.world, s = w.save;
    s.level = 90; Object.assign(s.flags, { ch13_done: true, ch14_intro: true, unshorn: true, sundered_chains: true });
    window.__remnant.warp(room, 'left');
  }, [room]);
  await until(page, (r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, room);
  assert.equal(await E(page, () => window.__remnant.world.cboss?.state), 'dormant', `${key} sleeps until Elior comes`);
  await godMode(page);
  await E(page, (id) => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === id); w.player.placeAt(t.r.centerX, t.r.bottom, 1); }, trigger);
  await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state), null, 60000);
}

/** Force each attack in turn: it runs and ends. */
async function runAttacks(page, list, shot) {
  const ran = [];
  for (const a of list) {
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    await E(page, (a) => { window.__remnant.world.cboss.start(a); }, a);
    await until(page, () => window.__remnant.world.cboss.state !== 'attack', null, 30000);
    ran.push(a);
    if (SHOTS && shot?.includes(a)) await page.screenshot({ path: `qa/ch14-${a}.png` });
  }
  return ran;
}

try {
  // ================================================================ the princes of Meshech and Tubal
  {
    const page = await open('?debug&nostory&autostart&fresh');
    await arena(page, 'princes_tents', 'princes_start', 'meshech_tubal');
    const look = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss, t = b.partner;
      return { key: b.key, name: b.name, hasTubal: !!t, tubalFoe: t?.isFoe, perches: t?.perches.length, onHeight: t?.onHeight, maxHp: b.maxHp };
    });
    assert.ok(look.key === 'meshech_tubal' && look.hasTubal && look.tubalFoe, `Meshech wakes with Tubal beside him (${JSON.stringify(look)})`);
    assert.ok(look.perches >= 2 && look.onHeight, `Tubal begins on a height (${look.perches} to stand on)`);
    if (SHOTS) await page.screenshot({ path: 'qa/ch14-princes.png' });

    // One life, two bodies: a blow on Tubal is the shared life, and the bodies have separate hurtboxes.
    const shared = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss, t = b.partner, hp0 = b.hp;
      const hit = t.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player });
      const near = Math.abs(b.hurtbox().x - t.hurtbox().x) > 10 || Math.abs(b.hurtbox().y - t.hurtbox().y) > 10;
      return { hit, lost: hp0 - b.hp, near };
    });
    assert.ok(shared.hit && shared.lost > 0 && shared.near, `a blow on Tubal is a blow on the shared life (${JSON.stringify(shared)})`);

    // The shield wall: planted, he turns aside a blow from the front, takes one from behind, and a heavy blow breaks it.
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    await E(page, () => { const b = window.__remnant.world.cboss; b.start('wall'); });
    await until(page, () => window.__remnant.world.cboss.walled, null, 10000);
    const wall = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss, f = b.face, hp = b.hp;
      b.cd = 99;
      const front = b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: -f, kind: 'melee', src: w.player });
      const frontLost = hp - b.hp;
      const hp2 = b.hp;
      const back = b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: f, kind: 'melee', src: w.player });
      const backLost = hp2 - b.hp;
      const hp3 = b.hp;
      b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: -f, kind: 'melee', heavy: true, src: w.player });
      return { front, frontLost, backLost, heavyLost: hp3 - b.hp, broken: !b.walled, back };
    });
    assert.ok(wall.frontLost === 0 && wall.backLost > 0 && wall.heavyLost > 0 && wall.broken, `the wall turns a blow from the front aside; behind and heavy blows get through (${JSON.stringify(wall)})`);

    // Each of his attacks runs, movement by movement; Tubal acts in each.
    const ran = [];
    ran.push(...await runAttacks(page, ['thrust', 'bash', 'wall', 'summon'], ['wall']));
    const tubal1 = await E(page, () => { const t = window.__remnant.world.cboss.partner; return { act: t.act, perch: t.perch, cd: t.cd }; });
    await atHealth(page, 0.66);
    await until(page, () => window.__remnant.world.cboss.phase === 2 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000);
    assert.equal(await E(page, () => window.__remnant.world.cboss.sub), 'The Bow of Tubal', 'the second movement is the bow of Tubal');
    ran.push(...await runAttacks(page, ['charge'], ['charge']));
    // Tubal's attacks, forced one at a time from the floor and from a height.
    const tubalActs = [];
    for (const a of ['volley', 'fan', 'rain', 'forge', 'dash', 'leap']) {
      await until(page, () => { const t = window.__remnant.world.cboss.partner; return !t.act && !t.leap && t.stunT <= 0 && window.__remnant.world.cboss.state === 'idle'; }, null, 30000);
      const hp0 = await E(page, () => window.__remnant.world.cboss.hp);
      await E(page, ([a]) => {
        const t = window.__remnant.world.cboss.partner;
        // A dash needs the floor.
        if (a === 'dash' && t.onHeight) { t.onHeight = false; t.y = t.floorY; t.x = Math.max(80, window.__remnant.world.player.x - 260); }
        t.cd = 99; t.begin(a);
      }, [a]);
      await until(page, () => { const t = window.__remnant.world.cboss.partner; return !t.act && !t.leap; }, null, 20000);
      tubalActs.push(a);
    }
    assert.equal(tubalActs.length, 6, 'each of Tubal\'s attacks (volley, fan, rain, forge, dash, leap) ran to its end');
    await atHealth(page, 0.33);
    await until(page, () => window.__remnant.world.cboss.phase === 3 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000);
    ran.push(...await runAttacks(page, ['slam', 'thrust'], ['slam']));

    // Breaking poise on one body kneels both.
    await E(page, () => { const b = window.__remnant.world.cboss; b.poise = 1; });
    await blow(page, 10, { poise: 500 });
    await until(page, () => window.__remnant.world.cboss.state === 'kneel', null, 10000);
    const both = await E(page, () => { const b = window.__remnant.world.cboss; return { stun: b.partner.stunT }; });
    assert.ok(both.stun > 1, `a poise broken kneels both brothers (${JSON.stringify(both)})`);
    console.log(`Princes: ${ran.join(', ')} ran; Tubal ${tubalActs.join(', ')}; the wall holds from the front only; both kneel together`);

    // Their end: Meshech falls, Tubal with him, and the chapter's way opens (the story is off here: the key is recorded).
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; b.hp = 1; b.state = 'idle'; b.takeHit({ dmg: 999, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); });
    await until(page, () => window.__remnant.world.save.defeated?.includes('meshech_tubal'), null, 40000);
    assert.ok(await E(page, () => window.__remnant.world.cboss.partner.remove || window.__remnant.world.cboss.partner.fade <= 0), 'Tubal falls with his brother');
    console.log('Princes: they fall together and the way on opens');
    await page.context().close();
  }

  // ================================================================ the Engine of the North
  {
    const page = await open('?debug&nostory&autostart&fresh');
    await arena(page, 'engine_hill', 'engine_start', 'siege_colossus');
    assert.equal(await E(page, () => window.__remnant.world.cboss.key), 'siege_colossus', 'the engine wakes');
    if (SHOTS) await page.screenshot({ path: 'qa/ch14-engine.png' });
    const ran = [];
    // The ram: a parry-able blow low along the floor; a blow lands when Elior stands in it.
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    const hitRam = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss;
      w.player.placeAt(b.x + b.face * 150, b.floorY, -b.face);
      const hp0 = w.player.hp;
      window.__god && clearInterval(window.__god);
      b.start('ram');
      return { hp0, face: b.face };
    });
    await until(page, () => window.__remnant.world.cboss.state !== 'attack', null, 20000);
    const rammed = await E(page, (hp0) => ({ lost: hp0 - window.__remnant.world.player.hp }), hitRam.hp0);
    assert.ok(rammed.lost > 0, `standing before the ram is struck (${JSON.stringify(rammed)})`);
    await godMode(page);
    ran.push('ram');
    ran.push(...await runAttacks(page, ['pots', 'volley', 'door'], ['pots']));
    assert.ok(await E(page, () => window.__remnant.world.cboss.servants.length > 0), 'a company comes out of its door');
    // The roll ends against a wall and the engine kneels, stuck.
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; w.player.placeAt(Math.min(w.roomW() - 80, b.x + 400), b.floorY, -1); b.face = 1; b.start('roll'); });
    await until(page, () => window.__remnant.world.cboss.state === 'kneel', null, 40000);
    ran.push('roll');
    console.log('Engine: the roll ended against the wall and left it kneeling');
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 20000);
    await atHealth(page, 0.66);
    await until(page, () => window.__remnant.world.cboss.phase === 2 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000);
    assert.ok(await E(page, () => window.__remnant.world.cboss.burning), 'in the second movement it burns');
    ran.push(...await runAttacks(page, ['flames', 'ram'], ['flames']));
    await atHealth(page, 0.33);
    await until(page, () => window.__remnant.world.cboss.phase === 3 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000);
    const broken = await E(page, () => { const b = window.__remnant.world.cboss; return { broken: b.broken, h: b.hurtbox().h }; });
    assert.ok(broken.broken && broken.h < 220, `in the third its deck falls in (${JSON.stringify(broken)})`);
    ran.push(...await runAttacks(page, ['rubble'], ['rubble']));
    if (SHOTS) await page.screenshot({ path: 'qa/ch14-engine-broken.png' });
    console.log(`Engine: ${ran.join(', ')} each ran; it burned; the deck fell in`);
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; b.hp = 1; b.state = 'idle'; b.takeHit({ dmg: 999, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); });
    await until(page, () => window.__remnant.world.save.defeated?.includes('siege_colossus'), null, 40000);
    console.log('Engine: the ground shakes and the tower comes down');
    await page.context().close();
  }

  // ================================================================ Gog
  {
    const page = await open('?debug&nostory&autostart&fresh');
    await arena(page, 'gog_mountain', 'gog_start', 'gog_prince');
    assert.equal(await E(page, () => window.__remnant.world.cboss.key), 'gog_prince', 'Gog wakes');
    if (SHOTS) await page.screenshot({ path: 'qa/ch14-gog.png' });
    const ran = [];
    ran.push(...await runAttacks(page, ['combo', 'rush', 'sweep', 'command', 'summon'], ['rush', 'command']));
    await atHealth(page, 0.7);
    await until(page, () => window.__remnant.world.cboss.phase === 2 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000);
    assert.equal(await E(page, () => window.__remnant.world.cboss.sub), 'As a Cloud to Cover the Land', 'the second movement is the cloud');
    // As a cloud he cannot be struck.
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    await E(page, () => { window.__remnant.world.cboss.start('cloud'); });
    await until(page, () => window.__remnant.world.cboss.cloudy > 0.9, null, 10000);
    const cloud = await E(page, () => { const b = window.__remnant.world.cboss, hp = b.hp; const hit = b.takeHit({ dmg: 5000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: window.__remnant.world.player }); return { hit, lost: hp - b.hp, targeted: b.canBeTargeted() }; });
    assert.ok(!cloud.hit && cloud.lost === 0 && !cloud.targeted, `a cloud cannot be struck (${JSON.stringify(cloud)})`);
    if (SHOTS) await page.screenshot({ path: 'qa/ch14-gog-cloud.png' });
    await until(page, () => window.__remnant.world.cboss.state !== 'attack', null, 30000);
    ran.push('cloud');
    ran.push(...await runAttacks(page, ['tempest'], ['tempest']));
    await atHealth(page, 0.4);
    await until(page, () => window.__remnant.world.cboss.phase === 3 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000);
    // Every man's sword: his bands fight one another, and he stands confounded and takes a third more.
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    await E(page, () => { window.__remnant.world.cboss.start('confusion'); });
    await until(page, () => window.__remnant.world.cboss.confused && window.__remnant.world.cboss.brawl, null, 10000);
    const conf = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss, hp = b.hp;
      b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player });
      const confused = hp - b.hp;
      b.confused = false;
      const hp2 = b.hp;
      b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player });
      b.confused = true;
      return { confused, plain: hp2 - b.hp };
    });
    assert.ok(conf.confused > conf.plain * 1.2, `confounded, he takes a third more (${JSON.stringify(conf)})`);
    if (SHOTS) await page.screenshot({ path: 'qa/ch14-gog-brothers.png' });
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    ran.push('confusion');
    ran.push(...await runAttacks(page, ['combo', 'rush', 'cloud'], []));
    console.log(`Gog: ${ran.join(', ')} each ran; the cloud cannot be struck; the brothers' swords fall on one another`);

    // The last tenth: no blow of Elior's takes it. The hail begins; he cannot be struck; it falls on marked ground.
    await E(page, () => { const b = window.__remnant.world.cboss; b.hp = Math.round(b.maxHp * 0.105); });
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 30000);
    await blow(page, 5e6);
    const floor = await E(page, () => { const b = window.__remnant.world.cboss; return { hp: b.hp, floor: Math.ceil(b.maxHp * 0.1), phase: b.phase, state: b.state }; });
    assert.ok(floor.hp >= floor.floor && floor.phase === 4, `no blow takes his last tenth; the fourth movement begins (${JSON.stringify(floor)})`);
    await until(page, () => window.__remnant.world.cboss.hailing, null, 30000);
    const hail = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss, hp = b.hp;
      const hit = b.takeHit({ dmg: 1e7, poise: 999, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player });
      return { hit, lost: hp - b.hp, ex: b.executable() };
    });
    assert.ok(!hail.hit && hail.lost === 0 && !hail.ex, `while the hail falls he cannot be struck or executed (${JSON.stringify(hail)})`);
    await until(page, () => window.__remnant.world.cboss.marks.length >= 2, null, 20000);
    const marks = await E(page, () => window.__remnant.world.cboss.marks.map((m) => m.kind));
    assert.ok(marks.every((k) => k === 'hail' || k === 'fire'), `hail and fire fall on marked ground (${marks})`);
    if (SHOTS) { await page.waitForTimeout(1500); await page.screenshot({ path: 'qa/ch14-gog-hail.png' }); }
    // Let it run: the sky answers, Gog falls, and the host with him.
    await E(page, () => { const b = window.__remnant.world.cboss; b.hailT = b.hailLen - 0.6; });
    await until(page, () => window.__remnant.world.cboss.state === 'dead', null, 20000);
    if (SHOTS) { await page.waitForTimeout(2200); await page.screenshot({ path: 'qa/ch14-gog-fire.png' }); }
    await until(page, () => window.__remnant.world.save.defeated?.includes('gog_prince'), null, 40000);
    const left = await E(page, () => window.__remnant.world.classic.ents.filter((e) => e.isFoe && !e.isBoss && !e.dying && !e.remove).length);
    assert.equal(left, 0, 'his bands fall with him');
    console.log('Gog: the hail fell on marked ground until the sky answered; he fell, and his host with him');
    await page.context().close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser chapter XIV bosses: all checks passed');
} finally {
  await browser.close();
  close();
}

