// Combat feel: damage numbers come from a fixed pool (no new objects per hit),
// stack instead of covering each other and pop larger on a crit; a heavier
// blow extends a light hit-stop but a lighter one never shortens it; a fallen
// foe lifts away as gold motes, and an elite's fall gets a beat of slow
// motion; a real strike lands with a number and leaves the camera steady.
// Run after `npm run build`.
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

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free' && !window.__remnant.world.transitioning; });

  // ---- numbers: pooled, stacked, crits larger
  const pool = await E(page, () => {
    const w = window.__remnant.world, before = w.children.list.length, x = w.player.x + 40, y = w.player.feet - 30;
    for (let i = 0; i < 40; i++) w.floatText(x, y, String(10 + i), '#ffe6a8');
    const after = w.children.list.length;
    w.feedback.clear();
    w.floatText(x, y, '12', '#ffe6a8'); w.floatText(x, y, '13', '#ffe6a8'); w.floatText(x, y, '14', '#ffe6a8');
    const live = w.feedback.nums.filter((n) => n.life > 0);
    const ys = live.map((n) => Math.round(n.y));
    w.floatText(x + 60, y, '99', '#ffe6a8', true);
    const crit = w.feedback.nums.find((n) => n.life > 0 && n.kind === 'crit');
    const plain = live[0];
    return { grew: after - before, ys, distinct: new Set(ys).size, critSize: parseFloat(crit.t.style.fontSize), plainSize: parseFloat(plain.t.style.fontSize), critText: crit.t.text };
  });
  assert.equal(pool.grew, 0, 'forty numbers add no new display objects');
  assert.equal(pool.distinct, 3, `three numbers at one spot stack apart (${pool.ys})`);
  assert.ok(pool.critSize > pool.plainSize && pool.critText.endsWith('!'), `a crit is larger and marked (${JSON.stringify(pool)})`);
  console.log(`Numbers: pooled (+${pool.grew} objects for 40), stacked at ${pool.ys.join('/')}, crits ${pool.critSize}px vs ${pool.plainSize}px`);

  // ---- hit-stop: heavier extends, lighter never shortens
  const stop = await E(page, () => {
    const w = window.__remnant.world;
    w.hitstopT = 0; w.hitstop(0.02); const a = w.hitstopT; w.hitstop(0.08); const b = w.hitstopT; w.hitstop(0.01); const c = w.hitstopT;
    return { a, b, c };
  });
  assert.ok(stop.a === 0.02 && stop.b === 0.08 && stop.c === 0.08, `hit-stop takes the heavier freeze (${JSON.stringify(stop)})`);
  await until(page, () => window.__remnant.world.hitstopT <= 0);
  console.log('Hit-stop: a heavy blow extends a light freeze; a light one never shortens it');

  // ---- a real strike: a number appears and the camera stays steady
  const strike = await E(page, async () => {
    const w = window.__remnant.world, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && open(e.x - 22, e.y - 2) && open(e.x - 22, e.y - 24) && !open(e.x - 22, e.y + 2));
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    f.hp = f.maxHp = 1e7; f.think = function () { this.body.vx = 0; }; f.executable = () => false;
    w.player.placeAt(f.x - 22, f.y, 1);
    w.feedback.clear();
    window.target = f;
    return f.hp;
  });
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  await page.keyboard.press('KeyJ');
  await until(page, (hp) => window.target.hp < hp, strike);
  const landed = await E(page, () => { const w = window.__remnant.world; return { numbers: w.feedback.nums.filter((n) => n.life > 0).length, shaking: w.cameras.main.shakeEffect.isRunning }; });
  assert.ok(landed.numbers >= 1 && !landed.shaking, `a strike shows its number and the camera holds (${JSON.stringify(landed)})`);
  await page.screenshot({ path: 'qa/combat-feel-strike.png' });
  console.log('Strike: the blow shows its number and the camera stays steady');

  // ---- purification dissolve, and an elite's slow-motion beat
  const fall = await E(page, async () => {
    const w = window.__remnant.world, f = window.target, motes = w.feedback.motes;
    f.hp = 1; f.elite = 'test_elite';
    f.takeHit({ dmg: 999, poise: 99, kx: 0, ky: 0, dir: 1, kind: 'melee' });
    await new Promise((r) => setTimeout(r, 60));
    return { motes: motes.getAliveParticleCount(), slow: w.classic.simulationScale };
  });
  assert.ok(fall.motes > 10, `the fallen elite lifts away as gold motes (${fall.motes})`);
  assert.ok(fall.slow < 0.8, `an elite's fall slows time for a beat (${fall.slow})`);
  await page.screenshot({ path: 'qa/combat-feel-dissolve.png' });
  await until(page, () => window.__remnant.world.classic.simulationScale >= 0.79);
  console.log(`Fall: ${fall.motes} gold motes rose and time slowed to ${fall.slow.toFixed(2)}, then recovered`);

  // ---- room exit clears what is in flight
  await E(page, () => { const w = window.__remnant.world; w.floatText(w.player.x, w.player.feet - 30, '5', '#ffe6a8'); w.loadRoom('sanctuary', 'start'); });
  await until(page, () => !window.__remnant.world.transitioning);
  assert.equal(await E(page, () => window.__remnant.world.feedback.nums.filter((n) => n.life > 0).length), 0, 'numbers do not follow into the next room');
  console.log('Rooms: nothing in flight survives a door');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser combat feel: all checks passed');
} finally {
  await browser.close();
  close();
}
