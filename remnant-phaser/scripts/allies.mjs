// Allies that choose well (POLISH_PLAN §19 phase 4; remnant/src/game/utility.ts): an Echo scores the foes in its
// order's reach instead of taking the nearest. On the hunt it takes a wounded foe over a fresh one a little nearer; it
// keeps the foe it is on through a near-tie; two hunters take two foes rather than crowding one; guarding, it takes the
// foe on Elior; flanking, Elior's own foe; holding, nothing beyond its post. In the Watch the ranger shoots the foe
// whose blow is about to fall, the mage chills a foe its frost is not on, and the ninja leaves the foe before him to
// Elior. Then the Echoes fight a room as before. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    s.level = 12;
    for (const sp of ['sentinel', 'knight']) {
      const inst = { uid: 'e_' + sp, species: sp, level: 5, xp: 0, stage: 0, hp: 9999, absorptions: 1 };
      s.echoes.push(inst); s.active.push(inst.uid);
    }
    w.refreshStats(); w.classic.squad.echoCommand('toggle'); window.__remnant.warp('ashen_road', 'left');
  });
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning && window.__remnant.world.classic.squad.echoes.length === 2);

  // Each case sets the scene and asks for a choice in one step (nothing moves in between).
  const cases = await E(page, () => {
    const w = window.__remnant.world, L = w.classic, p = w.player, pv = L.playerView, [a, b] = L.squad.echoes;
    const foes = L.ents.filter((e) => e.isFoe && !e.dying && !e.isBoss);
    if (foes.length < 3) return { error: `only ${foes.length} foes in the room` };
    const [f1, f2, f3] = foes;
    // Everything else far off, out of every reach.
    for (const f of foes) { f.x = 99999; f.hp = f.maxHp; }
    const X = p.x, Y = p.y, at = (f, dx) => { f.x = X + dx; f.y = Y; };
    a.x = X; a.y = Y; b.x = X; b.y = Y; pv.lastFoe = null; L.priorityTarget = null;
    const pick = (u, order) => { u.setOrder(order); u.chooseTarget('aggressive'); return u.target; };
    const name = (f) => (f === f1 ? 'f1' : f === f2 ? 'f2' : f === f3 ? 'f3' : f ? 'other' : 'none');
    const out = {};
    // Hunting: a wounded foe a little farther beats a fresh one nearer.
    at(f1, 100); at(f2, 130); f2.hp = Math.max(1, Math.round(f2.maxHp * 0.2)); a.target = null; b.target = null;
    out.huntWounded = name(pick(a, 'hunt'));
    // It keeps its foe through a near-tie; a fresh choice takes the nearer.
    f2.hp = f2.maxHp; at(f1, 110); at(f2, 100); a.target = f1;
    out.keeps = name(pick(a, 'hunt'));
    a.target = null; out.fresh = name(pick(a, 'hunt'));
    // Two hunters on two foes side by side take one each.
    at(f1, 90); at(f2, 110); a.target = null; b.target = null;
    out.spread = [name(pick(a, 'hunt')), name(pick(b, 'hunt'))];
    // Guarding: the foe on Elior beats one nearer the Echo but farther from him.
    a.x = X + 120; at(f1, 135); at(f2, 40); a.target = null;
    out.guard = name(pick(a, 'guard'));
    a.x = X;
    // Flanking: Elior's own foe, even with another closer.
    at(f1, 60); at(f2, 200); pv.lastFoe = f2; a.target = null;
    out.flank = name(pick(a, 'flank'));
    pv.lastFoe = null;
    // Holding: nothing past its post's reach, however close to Elior.
    pick(a, 'hold'); a.holdX = X + 200; at(f1, 0); at(f2, 220); a.target = null; a.chooseTarget('aggressive');
    out.hold = name(a.target);
    at(f2, 400); a.target = null; a.chooseTarget('aggressive');
    out.holdNone = name(a.target);
    for (const u of [a, b]) u.setOrder(undefined);
    foes.forEach((f, i) => { f.x = X + 70 + i * 25; f.y = Y; f.hp = f.maxHp; });
    return out;
  });
  assert.ok(!cases.error, cases.error);
  assert.equal(cases.huntWounded, 'f2', 'hunting, a wounded foe a little farther beats a fresh one nearer');
  assert.equal(cases.keeps, 'f1', 'an Echo keeps its foe through a near-tie');
  assert.equal(cases.fresh, 'f2', 'choosing afresh, it takes the nearer');
  assert.notEqual(cases.spread[0], cases.spread[1], `two hunters take two foes (${cases.spread})`);
  assert.equal(cases.guard, 'f2', 'guarding, it takes the foe on Elior');
  assert.equal(cases.flank, 'f2', "flanking, it takes Elior's own foe");
  assert.equal(cases.hold, 'f2', 'holding, it takes the foe at its post');
  assert.equal(cases.holdNone, 'none', 'holding, nothing beyond its post');
  console.log(`Echoes: ${JSON.stringify(cases)}`);

  // They still fight a room together.
  const fought = await E(page, async () => {
    const w = window.__remnant.world, L = w.classic, kills = w.save.kills;
    setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 40);
    for (let i = 0; i < 120 && w.save.kills === kills; i++) await new Promise((r) => setTimeout(r, 100));
    return { kills: w.save.kills - kills, on: L.squad.echoes.filter((e) => e.target).length };
  });
  assert.ok(fought.kills > 0, `the Echoes fell a foe on their own (${fought.kills})`);
  console.log(`Echoes fought: ${fought.kills} fell`);

  // ---- the Watch's shadows
  await page.goto(base + '?debug');
  await until(page, () => window.__remnant?.game?.scene?.isActive('title'));
  await page.click('[data-k=title_watch]');
  await until(page, () => window.__remnant?.watchPick);
  const watch = await E(page, () => {
    const pick = window.__remnant.watchPick, hx = 100;
    const foe = (x, o = {}) => ({ x, alive: true, boss: null, atkT: 2, chill: 0, hp: 100, max: 100, elite: false, ...o });
    const front = foe(130), soon = foe(220, { atkT: 0.1 }), late = foe(180);
    const chilled = foe(150, { chill: 3 }), warm = foe(190);
    const n1 = foe(140), n2 = foe(260);
    return {
      ranger: pick('ranger', [front, late, soon], hx, front, null) === soon,
      mage: pick('mage', [chilled, warm], hx, chilled, null) === warm,
      ninja: pick('ninja', [n1, n2], hx, n1, null) === n2,
      fighter: pick('fighter', [n1, n2], hx, n1, null) === n1,
      sticks: pick('ranger', [late, foe(185)], hx, null, late) === late,
    };
  });
  assert.deepEqual(watch, { ranger: true, mage: true, ninja: true, fighter: true, sticks: true }, `the Watch's shadows choose (${JSON.stringify(watch)})`);
  console.log('Watch shadows: the ranger takes the blow about to fall, the mage a foe not yet chilled, the ninja leaves the front to Elior');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser allies: all checks passed');
} finally {
  await browser.close();
  close();
}
