// Chapter XIII, the Stones of Fire (game/bosses13.ts): its rooms are dressed and hold a host at least as full as
// Chapter XII's, and stronger; the Prince of Tyrus reads Elior (four like blows and that kind is turned aside; a
// different blow breaks the read; the chains and abilities are kinds of their own); each of his attacks runs (the
// sceptre, his wares, the fetter, his hired swords, the stones of fire, his brightness, the fire from his midst); at two
// thirds nine stones cover him and are struck off blow by blow until he kneels; at one third he burns and his health
// falls by itself; the fire finishes him, the fetters bind him, and the Sundered Chains are kindled;
// in the story the seat stays sealed until both fetters are broken. Run after `npm run build`.
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
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + q);
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  return page;
};
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });
const E = (page, fn, arg) => page.evaluate(fn, arg);
const ROUTE = ['fairs_of_tyrus', 'house_of_merchandise', 'walls_of_tyrus'];
const LONG = 150000;

try {
  // ---- the rooms: at least the king's host, and stronger
  {
    const page = await open('?debug&nostory&autostart&fresh');
    const rooms = await E(page, (route) => {
      const w = window.__remnant.world;
      const look = (id) => { w.loadRoom(id, 'start'); const foes = w.classic.ents.filter((e) => e.isFoe && !e.isBoss); return { n: foes.length, knight: foes.find((e) => e.kind === 'knight' && !e.elite)?.maxHp ?? 0, decor: w.room.ents.filter((e) => e.t === 'decor').length }; };
      return { xiii: route.map(look), xii: ['palace_tents', 'sealed_vault', 'holy_mountain'].map(look) };
    }, ROUTE);
    for (const [i, r] of rooms.xiii.entries()) {
      assert.ok(r.n >= rooms.xii[i].n, `${ROUTE[i]} holds at least Chapter XII's host (${r.n} foes against ${rooms.xii[i].n})`);
      assert.ok(r.decor >= 10, `${ROUTE[i]} is dressed (${r.decor} props)`);
    }
    const xii = rooms.xii.find((r) => r.knight)?.knight, xiii = rooms.xiii.find((r) => r.knight)?.knight;
    assert.ok(xii && xiii && xiii > xii * 1.15, `a hired knight of Tyrus is stronger than one of the king's (${xiii} against ${xii})`);
    console.log(`Rooms: ${rooms.xiii.map((r, i) => `${ROUTE[i]} ${r.n} foes, ${r.decor} props`).join('; ')}`);

    // ---- the prince
    await E(page, () => {
      const w = window.__remnant.world;
      w.save.level = 76; w.save.flags.ch13_boundary_open = true; w.save.flags.unshorn = true; w.save.flags.sundered_chains = true;
      window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30);
      window.__remnant.warp('seat_in_the_seas', 'start');
    });
    await until(page, () => window.__remnant.world.room.id === 'seat_in_the_seas' && !window.__remnant.world.transitioning);
    assert.equal(await E(page, () => window.__remnant.world.cboss?.state), 'dormant', 'the prince sits in his seat');
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'tyrus_prince_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state), null, LONG);
    const blow = await E(page, () => { const w = window.__remnant.world, b = w.cboss; return { dmg: Math.round(b.dmg * (1 - w.d.dr)), max: w.player.maxHp }; });
    assert.ok(blow.dmg >= blow.max * 0.2, `one of his blows takes a fifth of Elior's health or more (${blow.dmg} of ${blow.max})`);

    // He reads: four like blows and that kind is turned aside; a different blow breaks the read and costs him poise.
    const read = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss;
      const hit = (extra = {}) => { b.lastBlowT = -9; const hp = b.hp; b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player, ...extra }); return hp - b.hp; };
      const out = { first: hit(), kinds: [] };
      hit(); hit();
      out.before = b.read; hit(); out.read = b.read; out.readT = b.readT;
      out.turned = hit();
      const poise = b.poise;
      out.heavy = hit({ heavy: true }); out.after = b.read; out.poiseLost = Math.round(poise - b.poise); out.max = b.maxPoise;
      // The chains and the craft are kinds of their own.
      for (const extra of [{ tag: 'chain' }, { kind: 'ability' }]) { b.read = null; b.readT = 0; b.run = 0; b.lastKind = null; for (let i = 0; i < 4; i++) hit(extra); out.kinds.push(b.read); }
      // Many hits of one move count once.
      b.read = null; b.readT = 0; b.run = 0; b.lastKind = null; b.lastBlowT = -9;
      for (let i = 0; i < 8; i++) b.takeHit({ dmg: 10, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player });
      out.multi = b.read; b.run = 0; b.lastKind = null;
      return out;
    });
    assert.ok(read.before === null && read.read === 'light' && read.readT > 4, `four quick blows running and he has read them (${JSON.stringify(read)})`);
    assert.ok(read.first === 1000 && read.turned <= 250, `a read blow barely lands (${read.turned} of ${read.first})`);
    assert.ok(read.heavy === 1000 && read.after === null && read.poiseLost >= read.max * 0.14, `a different blow lands whole, breaks the read and staggers him (${read.poiseLost} poise of ${read.max})`);
    assert.deepEqual(read.kinds, ['chain', 'craft'], 'the chains and abilities are kinds of their own');
    assert.equal(read.multi, null, 'the many hits of one move count as one blow');
    console.log(`The read: four quick blows are read (a fifth lands ${read.turned} of ${read.first}); a heavy blow breaks it and takes ${read.poiseLost} poise; chains and craft are read too`);

    const force = async (phase) => {
      await E(page, (frac) => { const w = window.__remnant.world, b = w.cboss; b.hp = Math.round(b.maxHp * (frac + 0.005)); b.lastBlowT = -9; b.takeHit({ dmg: b.maxHp * 0.03, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', heavy: true, src: w.player }); }, phase === 2 ? 0.66 : 0.33);
      await until(page, (p) => window.__remnant.world.cboss.phase === p && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), phase, LONG);
    };
    const ran = [];
    const run = async (atks) => {
      for (const a of atks) {
        await until(page, () => window.__remnant.world.cboss.state === 'idle', null, LONG);
        await E(page, (a) => { const b = window.__remnant.world.cboss; b.callT = 99; b.start(a); }, a);
        if (a === 'stones') await until(page, () => window.__remnant.world.cboss.marks.length > 4, null, LONG);
        if (a === 'brightness') await until(page, () => window.__remnant.world.cboss.beams.length > 0, null, LONG);
        if (['stones', 'brightness', 'devour', 'fetter'].includes(a)) await page.screenshot({ path: `qa/tyrus-${a}.png` });
        await until(page, () => window.__remnant.world.cboss.state !== 'attack', null, LONG);
        ran.push(a);
      }
    };
    await run(['sceptre', 'wares', 'fetter', 'summon']);
    assert.ok(await E(page, () => window.__remnant.world.cboss.servants.length > 0), 'his traffick hires swords');

    // The covering: nine stones blunt every blow; each blow he has not read strikes one off; the ninth leaves him bare.
    await force(2);
    const cover = await E(page, () => {
      const w = window.__remnant.world, b = w.cboss, out = { stones: b.stones, sub: b.sub };
      const hit = (heavy) => { b.lastBlowT = -9; const hp = b.hp; b.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', heavy, src: w.player }); return hp - b.hp; };
      out.blunted = hit(false); out.left = b.stones;
      for (let i = 0; i < 8; i++) hit(i % 2 === 0);
      out.bare = b.stones; out.state = b.state;
      return out;
    });
    assert.ok(cover.stones === 9 && /Precious Stone/.test(cover.sub), `at two thirds the nine stones stand round him (${JSON.stringify(cover)})`);
    assert.ok(cover.blunted === 450 && cover.left === 8, `the covering blunts a blow and loses a stone to it (${cover.blunted}, ${cover.left} left)`);
    assert.ok(cover.bare === 0 && cover.state === 'kneel', `nine blows he has not read leave him bare, on his knee (${cover.state})`);
    await page.screenshot({ path: 'qa/tyrus-bare.png' });
    await until(page, () => window.__remnant.world.cboss.state === 'idle', null, LONG);
    await until(page, () => window.__remnant.world.cboss.stones === 9, null, LONG);
    console.log('The covering: nine stones blunt a blow to 450 of 1000; nine unread blows strike them off and he kneels; they stand again');
    await run(['stones', 'brightness']);

    // The fire from the midst of him: his health falls by itself.
    await force(3);
    const hp0 = await E(page, () => { const b = window.__remnant.world.cboss; return { hp: b.hp, stones: b.stones, sub: b.sub, servants: b.servants.length }; });
    assert.ok(hp0.stones === 0 && /Fire from the Midst/.test(hp0.sub) && hp0.servants === 0, `at one third the covering burns off and his hired swords are gone (${JSON.stringify(hp0)})`);
    await until(page, (hp) => window.__remnant.world.cboss.hp < hp - window.__remnant.world.cboss.maxHp * 0.004, hp0.hp, LONG);
    await run(['devour', 'brightness', 'stones']);
    console.log(`Prince: ${ran.join(', ')} each ran; a blow takes ${blow.dmg} of ${blow.max}; burning, his health falls by itself`);

    // His end: the fire finishes him without a blow from Elior.
    await E(page, () => { const b = window.__remnant.world.cboss; b.hp = Math.round(b.maxHp * 0.002); });
    await until(page, () => window.__remnant.world.cboss?.state === 'dead' || window.__remnant.world.save.flags.ch13_done, null, LONG);
    await until(page, () => (window.__remnant.world.cboss?.bound ?? 0) > 0.9 || window.__remnant.world.save.flags.ch13_done, null, LONG);
    await page.screenshot({ path: 'qa/tyrus-bound.png' });
    await until(page, () => window.__remnant.world.save.flags.ch13_done && window.__remnant.world.save.defeated?.includes('tyrus_prince'), null, LONG);
    const left = await E(page, () => window.__remnant.world.classic.ents.filter((e) => e.isFoe && !e.isBoss && !e.dying && !e.remove).length);
    assert.equal(left, 0, 'nobody is left to fight for him');
    console.log('His end: the fire devours him, the fetters bind him, and Chapter XIII is done');

    // The chains are kindled: they burn deeper and reach further.
    const kindled = await E(page, () => {
      const w = window.__remnant.world;
      const dismiss = setInterval(() => document.querySelector('.dialogue')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })), 100);
      w.loadRoom('tyre_strand', 'start'); clearInterval(dismiss);
      return { flag: !!w.save.flags.chains_kindled, psalm: w.save.psalms?.owned?.includes?.('fetters') ?? null };
    });
    assert.ok(kindled.flag, 'breaking the fetters of Tyrus kindles the Sundered Chains');
    console.log('The Sundered Chains are kindled');
    await page.context().close();
  }

  // ---- the story: sealed until both fetters are broken; then the challenge plays and the prince rises
  {
    const page = await open('?debug&autostart&fresh');
    const drain = async (done, max = 40000) => {
      const end = Date.now() + max;
      while (Date.now() < end && !(await E(page, done))) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
    };
    await drain(() => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene, 20000);
    await E(page, () => { const w = window.__remnant.world, s = w.save; s.level = 76; Object.assign(s.flags, { ending_done: true, ch12_done: true, ch13_intro: true, unshorn: true }); s.quests.m_crown13 = { stage: 0, done: false }; w.loadRoom('walls_of_tyrus', 'start'); });
    await until(page, () => (window.__remnant.world.hud.guideChip?.text ?? '').includes('Fetters of the Fairs'));
    assert.ok(await E(page, () => !window.__remnant.world.save.flags.ch13_boundary_open), 'the seat is sealed while the fetters hold');
    await E(page, () => { const w = window.__remnant.world; Object.assign(w.save.flags, { tyre_fetters_a: true, tyre_fetters_b: true }); w.loadRoom('walls_of_tyrus', 'start'); });
    await until(page, () => window.__remnant.world.save.flags.ch13_boundary_open && (window.__remnant.world.hud.guideChip?.text ?? '').includes('The Prince of Tyrus: the throne is open'));
    await E(page, () => { const w = window.__remnant.world; window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); w.loadRoom('seat_in_the_seas', 'start'); });
    await drain(() => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene, 15000);
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'tyrus_prince_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await drain(() => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state), 60000);
    assert.equal(await E(page, () => window.__remnant.world.cboss.key), 'tyrus_prince', 'in the story, the Prince of Tyrus rises');
    console.log('Story: the seat opens when both fetters are broken; the challenge plays and the prince rises');
    await page.context().close();
  }

  // ---- chapter select and the home screen know the thirteenth chapter
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '?debug&fresh');
    await page.waitForFunction(() => document.querySelector('#title_subtitle'), null, { timeout: 60000 });
    assert.match(await E(page, () => document.querySelector('#title_subtitle').textContent), /Thirteen chapters/, 'the home screen counts thirteen chapters');
    await page.context().close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser tyrus: all checks passed');
} finally {
  await browser.close();
  close();
}
