// Chapter XI, the Gods of the Nations (game/bosses11.ts): its rooms hold more foes and stronger ones than Chapter
// X's; the throne stays sealed until both altars are cast down; in the story the challenge plays and Dagon rises;
// the gods come one after another (Dagon, Molech, Baal), each calls servants, each blow is a heavy share of a
// level-58 Elior's health, and when Baal falls the chapter is done. Run after `npm run build`.
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
const boss = (page) => E(page, () => { const b = window.__remnant.world.cboss; return b && { st: b.state, god: b.god, phase: b.phase, servants: b.servants.length }; });
const ROUTE = ['groves_of_baal', 'house_of_dagon', 'heights_of_baal'];

try {
  // ---- the rooms: more foes than Chapter X's, and stronger ones
  {
    const page = await open('?debug&nostory&autostart&fresh');
    const rooms = await E(page, (route) => {
      const w = window.__remnant.world;
      const look = (id) => { w.loadRoom(id, 'start'); const foes = w.classic.ents.filter((e) => e.isFoe && !e.isBoss); return { n: foes.length, knight: foes.find((e) => e.kind === 'knight' && !e.elite)?.maxHp ?? 0 }; };
      return { xi: route.map(look), x: ['shattered_colonnade', 'sunken_temple', 'stormwall_cliffs'].map(look) };
    }, ROUTE);
    for (const [i, r] of rooms.xi.entries()) assert.ok(r.n >= 9 && r.n > rooms.x[i].n * 1.8, `${ROUTE[i]} holds a horde (${r.n} foes, against ${rooms.x[i].n} in Chapter X)`);
    const x = rooms.x.find((r) => r.knight)?.knight, xi = rooms.xi.find((r) => r.knight)?.knight;
    if (x && xi) assert.ok(xi > x * 1.25, `a knight of the high places is stronger than one on the storm coast (${xi} against ${x})`);
    console.log(`Rooms: ${rooms.xi.map((r, i) => `${ROUTE[i]} ${r.n} foes`).join(', ')}; Chapter X's had ${rooms.x.map((r) => r.n).join(', ')}`);

    // ---- the gods, one after another; each calls servants; Baal's fall ends the chapter
    await E(page, () => {
      const w = window.__remnant.world;
      w.save.level = 58; w.save.flags.ch11_boundary_open = true;
      window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30);
      window.__remnant.warp('seat_of_the_gods', 'start');
    });
    await until(page, () => window.__remnant.world.room.id === 'seat_of_the_gods' && !window.__remnant.world.transitioning);
    assert.deepEqual(await boss(page), { st: 'dormant', god: 'dagon', phase: 0, servants: 0 }, 'Dagon waits on the seat');
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'nation_gods_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state));
    // A god's blow against a level-58 Elior: it is meant to overmatch him.
    const blow = await E(page, () => { const w = window.__remnant.world, b = w.cboss; clearInterval(window.__god); return { dmg: Math.round(b.dmg * (1 - w.d.dr)), max: w.player.maxHp }; });
    assert.ok(blow.dmg >= blow.max * 0.2, `one of Dagon's blows takes a fifth of Elior's health or more (${blow.dmg} of ${blow.max})`);
    await E(page, () => { const w = window.__remnant.world; window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'qa/gods-dagon.png' });
    for (const [frac, god] of [[0.66, 'molech'], [0.33, 'baal']]) {
      await E(page, (frac) => { const w = window.__remnant.world, b = w.cboss; b.hp = Math.round(b.maxHp * (frac + 0.005)); b.takeHit({ dmg: b.maxHp * 0.02, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); }, frac);
      await until(page, (god) => window.__remnant.world.cboss?.god === god && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), god);
      await E(page, () => { window.__remnant.world.cboss.callT = 0; });
      await until(page, () => window.__remnant.world.cboss.servants.length > 0, null, 20000);
      await page.screenshot({ path: `qa/gods-${god}.png` });
    }
    const servants = await E(page, () => window.__remnant.world.cboss.servants.length);
    console.log(`Gods: Dagon, then Molech at two thirds, then Baal at one third; ${servants} servants called beside Baal; a blow takes ${blow.dmg} of ${blow.max}`);
    await E(page, () => { const w = window.__remnant.world, b = w.cboss; b.hp = 1; b.takeHit({ dmg: 99, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); });
    await until(page, () => window.__remnant.world.save.flags.ch11_done && window.__remnant.world.save.defeated?.includes('nation_gods'));
    console.log('Baal falls: fire from heaven, and Chapter XI is done');
    await page.context().close();
  }

  // ---- the story: the throne is sealed until both altars fall; then the challenge plays and Dagon rises
  {
    const page = await open('?debug&autostart&fresh');
    const drain = async (done, max = 40000) => {
      const end = Date.now() + max;
      while (Date.now() < end && !(await E(page, done))) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
    };
    await drain(() => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene, 20000);
    await E(page, () => { const w = window.__remnant.world, s = w.save; s.level = 58; Object.assign(s.flags, { ending_done: true, ch10_done: true, ch11_intro: true }); s.quests.m_crown11 = { stage: 0, done: false }; w.loadRoom('heights_of_baal', 'start'); });
    await until(page, () => (window.__remnant.world.hud.guideChip?.text ?? '').includes('Altar of Baal'));
    assert.ok(await E(page, () => !window.__remnant.world.save.flags.ch11_boundary_open), 'the throne is sealed while the altars stand');
    await E(page, () => { const w = window.__remnant.world; Object.assign(w.save.flags, { gods_altar_a: true, gods_altar_b: true }); w.loadRoom('heights_of_baal', 'start'); });
    await until(page, () => window.__remnant.world.save.flags.ch11_boundary_open && (window.__remnant.world.hud.guideChip?.text ?? '').includes('Baal: the throne is open'));
    await E(page, () => { const w = window.__remnant.world; window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30); w.loadRoom('seat_of_the_gods', 'start'); });
    await drain(() => !document.querySelector('.dialogue') && !window.__remnant.G.inCutscene, 15000);
    await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'nation_gods_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
    await drain(() => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state), 40000);
    assert.equal((await boss(page)).god, 'dagon', 'in the story, Dagon rises first');
    console.log('Story: the throne opens when both altars fall; the challenge plays and Dagon rises');
    await page.context().close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser gods: all checks passed');
} finally {
  await browser.close();
  close();
}
