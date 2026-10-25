// The original game's foes in the Phaser build. Every kind is the original's
// own class, with its own moves and its PNG sheet (or its original vector art):
// each one comes to fight, falls to Elior's blows and pays its experience. A
// beaten elite kneels in the Veil's grip; holding interact beside it purifies it
// into an Echo, and it does not return. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout });
const KINDS = ['husk', 'hound', 'archer', 'sentinel', 'wisp', 'brute', 'bulwark', 'knight', 'drone', 'soldier', 'lion', 'priest', 'vessel', 'scribe', 'undying', 'gale', 'stalker', 'carrier', 'golem'];

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  await E(page, () => setInterval(() => { const p = window.__remnant.world.player; if (p && !p.dead) p.hp = p.maxHp; }, 30));

  // ---- every kind: it comes for Elior, and falls to his blows
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  for (let i = 0; i < KINDS.length; i += 5) {
    const group = KINDS.slice(i, i + 5);
    const seen = await E(page, async (group) => {
      const w = window.__remnant.world, p = w.player;
      // On the Ashen Road's floor (its first husk's feet), with the room's own foes cleared.
      const floor = w.classic.ents.find((e) => e.kind === 'husk')?.y ?? w.__floor;
      w.__floor = floor;
      for (const e of w.classic.ents) e.remove = true;
      p.placeAt(29 * 16, floor, 1);
      const foes = group.map((k, n) => w.classic.spawnEnemy(k, p.x + 70 + n * 34, p.feet));
      const states = foes.map(() => new Set());
      for (let t = 0; t < 40; t++) {
        await new Promise((r) => setTimeout(r, 75));
        foes.forEach((f, n) => { states[n].add(f.state); if (f.aggro) states[n].add('aggro'); });
      }
      return foes.map((f, n) => ({ kind: f.kind, hp: f.hp, states: [...states[n]], drawn: !!f.kind }));
    }, group);
    await page.screenshot({ path: `qa/foes-${i / 5 + 1}.png` });
    // Roused (some, like the Wisp, hunt without leaving their idle drift).
    for (const s of seen) assert.ok(s.states.includes('aggro'), `${s.kind} comes to fight (${s.states})`);
    const before = await E(page, () => ({ kills: window.__remnant.world.save.kills, xp: window.__remnant.world.save.xp, lv: window.__remnant.world.save.level }));
    await until(page, () => {
      const w = window.__remnant.world;
      for (const f of w.foes()) if (f.alive) { w.player.placeAt(f.x - 20, f.e.y, 1); f.hit(1e6, 1, 2); }
      return !w.classic.ents.some((e) => e.isFoe && !e.dying);
    });
    const after = await E(page, () => ({ kills: window.__remnant.world.save.kills, xp: window.__remnant.world.save.xp, lv: window.__remnant.world.save.level }));
    // At least one kill each: some call or raise more (an Undying rises, a Carrier bursts).
    assert.ok(after.kills - before.kills >= group.length, `every ${group.join('/')} fell and counted (${after.kills - before.kills})`);
    assert.ok(after.xp > before.xp || after.lv > before.lv, 'and paid experience');
    console.log(`Foes: ${seen.map((s) => `${s.kind} (${s.states.filter((x) => x !== 'idle' && x !== 'aggro').slice(0, 3).join('/')})`).join(', ')}: all fell`);
  }

  // ---- an elite kneels, and is purified by a held interact
  const room = await E(page, () => Object.values(window.__remnant.rooms).find((r) => r.ents.some((e) => e.t === 'enemy' && e.elite === 'vault_archer')).id);
  await E(page, (room) => window.__remnant.warp(room, 'start'), room);
  await until(page, (room) => window.__remnant.world.room.id === room && !window.__remnant.world.transitioning, room);
  const elite = await E(page, () => {
    const w = window.__remnant.world, f = w.foes().find((f) => f.e?.elite === 'vault_archer');
    for (const g of w.foes()) if (g !== f) g.remove();
    f.hit(1e6, 1, 2);
    return { kneeling: f.e.awaitingPurify, x: f.x, y: f.e.y };
  });
  assert.ok(elite.kneeling, 'a beaten elite kneels, waiting to be purified');
  await E(page, (e) => window.__remnant.world.player.placeAt(e.x - 20, e.y, 1), elite);
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyF');
  await until(page, () => window.__remnant.world.save.echoes.length > 0, null, 10000);
  await page.keyboard.up('KeyF');
  const pur = await E(page, () => ({ defeated: window.__remnant.world.save.defeated, echoes: window.__remnant.world.save.echoes.map((e) => e.species), active: window.__remnant.world.save.active.length }));
  assert.ok(pur.defeated.includes('vault_archer') && pur.echoes.includes('archer') && pur.active > 0, `purified into an archer Echo in the lineup (${JSON.stringify(pur)})`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa/foes-purified.png' });
  await E(page, (room) => window.__remnant.warp(room, 'start'), room);
  await until(page, (room) => window.__remnant.world.room.id === room && !window.__remnant.world.transitioning, room);
  assert.ok(await E(page, () => !window.__remnant.world.foes().some((f) => f.e?.elite === 'vault_archer')), 'a purified elite does not return');
  console.log('Elite: the Vault Archer knelt, a held interact purified it into an archer Echo, and it stays gone');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser foes: all checks passed');
} finally {
  await browser.close();
  close();
}
