// Chapter XII, the Time of Trouble (game/bosses12.ts): its rooms hold more and stronger foes than Chapter XI's; the
// palace stays sealed until both standards are overturned; in the story the challenge plays and the King of the
// North rises; each of his attacks runs (the whirlwind, the slam, the floods, the tidings, the fury); he calls his
// horsemen; at two thirds he overflows, at one third he magnifies himself and grows; his blow is a heavy share of a
// level-68 Elior's health; and when he falls, none helps him: his host is gone and the chapter is done.
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
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + q);
  await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
  return page;
};
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });
const E = (page, fn, arg) => page.evaluate(fn, arg);
const ROUTE = ['palace_tents', 'sealed_vault', 'holy_mountain'];

try {
  // ---- the rooms: a fuller host than Chapter XI's, and stronger
  {
    const page = await open('?debug&nostory&autostart&fresh');
    const rooms = await E(page, (route) => {
      const w = window.__remnant.world;
      const look = (id) => { w.loadRoom(id, 'start'); const foes = w.classic.ents.filter((e) => e.isFoe && !e.isBoss); return { n: foes.length, knight: foes.find((e) => e.kind === 'knight' && !e.elite)?.maxHp ?? 0 }; };
      return { xii: route.map(look), xi: ['groves_of_baal', 'house_of_dagon', 'heights_of_baal'].map(look) };
    }, ROUTE);
    for (const [i, r] of rooms.xii.entries()) assert.ok(r.n >= rooms.xi[i].n, `${ROUTE[i]} holds at least Chapter XI's host (${r.n} foes against ${rooms.xi[i].n})`);
    const xi = rooms.xi.find((r) => r.knight)?.knight, xii = rooms.xii.find((r) => r.knight)?.knight;
    assert.ok(xi && xii && xii > xi * 1.15, `a knight of the king's host is stronger than one on the high places (${xii} against ${xi})`);
    console.log(`Rooms: ${rooms.xii.map((r, i) => `${ROUTE[i]} ${r.n} foes`).join(', ')}; Chapter XI's had ${rooms.xi.map((r) => r.n).join(', ')}`);

    // ---- the king: every attack, his host, the three movements, his end
    await E(page, () => {
      const w = window.__remnant.world;
      // The Unshorn's awakening plays in this fight (and holds the king above a third until it does); it has its own
      // test (unshorn.mjs), so here it has already happened.
      w.save.level = 68; w.save.flags.ch12_boundary_open = true; w.save.flags.unshorn = true;
      window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30);
      window.__remnant.warp('palace_between_seas', 'start');
    });
    await until(page, () => window.__remnant.world.room.id === 'palace_between_seas' && !window.__remnant.world.transitioning);
    assert.equal(await E(page, () => window.__remnant.world.cboss?.state), 'dormant', 'the king waits in his palace');
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'north_king_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state));
    const blow = await E(page, () => { const w = window.__remnant.world, b = w.cboss; clearInterval(window.__god); return { dmg: Math.round(b.dmg * (1 - w.d.dr)), max: w.player.maxHp }; });
    assert.ok(blow.dmg >= blow.max * 0.2, `one of his blows takes a fifth of Elior's health or more (${blow.dmg} of ${blow.max})`);
    await E(page, () => { const w = window.__remnant.world; window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); });
    // Each attack, forced in turn, runs to its end.
    const ran = [];
    for (const [phase, atks] of [[1, ['combo', 'whirlwind', 'leap', 'summon']], [2, ['overflow', 'tidings']], [3, ['fury']]]) {
      if (phase > 1) {
        await E(page, (frac) => { const w = window.__remnant.world, b = w.cboss; b.hp = Math.round(b.maxHp * (frac + 0.005)); b.takeHit({ dmg: b.maxHp * 0.02, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); }, phase === 2 ? 0.66 : 0.33);
        await until(page, (p) => window.__remnant.world.cboss.phase === p && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), phase);
      }
      for (const a of atks) {
        await until(page, () => window.__remnant.world.cboss.state === 'idle', null, 20000);
        await E(page, (a) => { const b = window.__remnant.world.cboss; b.start(a); }, a);
        await until(page, () => window.__remnant.world.cboss.state !== 'attack', null, 20000);
        ran.push(a);
        if (a === 'whirlwind' || a === 'tidings' || a === 'fury') await page.screenshot({ path: `qa/north-${a}.png` });
      }
    }
    const end = await E(page, () => { const b = window.__remnant.world.cboss; return { scale: b.scaleTo, sub: b.sub, servants: b.servants.length }; });
    assert.ok(end.scale > 2.2 && /Magnifieth/.test(end.sub), `in the last movement he magnifies himself (${JSON.stringify(end)})`);
    assert.ok(end.servants > 0, 'his horsemen ride with him');
    console.log(`King: ${ran.join(', ')} each ran; ${end.servants} riders called; a blow takes ${blow.dmg} of ${blow.max}; he grew to ×${end.scale}`);
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; b.hp = 1; b.takeHit({ dmg: 99, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: 'qa/north-michael.png' });
    await until(page, () => window.__remnant.world.save.flags.ch12_done && window.__remnant.world.save.defeated?.includes('north_king'));
    const left = await E(page, () => window.__remnant.world.classic.ents.filter((e) => e.isFoe && !e.isBoss && !e.dying && !e.remove).length);
    assert.equal(left, 0, 'none helps him: his host is gone');
    console.log('His end: none helps him, Michael stands up, and Chapter XII is done');
    await page.context().close();
  }

  // ---- the story: sealed until both standards fall; then the challenge plays and the king rises
  {
    const page = await open('?debug&autostart&fresh');
    const drain = async (done, max = 40000) => {
      const end = Date.now() + max;
      while (Date.now() < end && !(await E(page, done))) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
    };
    await drain(() => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene, 20000);
    await E(page, () => { const w = window.__remnant.world, s = w.save; s.level = 68; Object.assign(s.flags, { ending_done: true, ch11_done: true, ch12_intro: true, unshorn: true }); s.quests.m_crown12 = { stage: 0, done: false }; w.loadRoom('holy_mountain', 'start'); });
    await until(page, () => (window.__remnant.world.hud.guideChip?.text ?? '').includes('Standard of the Chariots'));
    assert.ok(await E(page, () => !window.__remnant.world.save.flags.ch12_boundary_open), 'the palace is sealed while the standards stand');
    await E(page, () => { const w = window.__remnant.world; Object.assign(w.save.flags, { north_standard_a: true, north_standard_b: true }); w.loadRoom('holy_mountain', 'start'); });
    await until(page, () => window.__remnant.world.save.flags.ch12_boundary_open && (window.__remnant.world.hud.guideChip?.text ?? '').includes('The King of the North: the throne is open'));
    await E(page, () => { const w = window.__remnant.world; window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); w.loadRoom('palace_between_seas', 'start'); });
    await drain(() => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene, 15000);
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'north_king_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await drain(() => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state), 40000);
    assert.equal(await E(page, () => window.__remnant.world.cboss.key), 'north_king', 'in the story, the King of the North rises');
    console.log('Story: the palace opens when both standards fall; the challenge plays and the king rises');
    await page.context().close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser north: all checks passed');
} finally {
  await browser.close();
  close();
}
