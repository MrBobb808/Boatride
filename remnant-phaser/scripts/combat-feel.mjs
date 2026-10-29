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
  const landed = await E(page, () => { const w = window.__remnant.world; return { numbers: w.feedback.nums.filter((n) => n.life > 0).length, shaking: w.cameras.main.shakeEffect.isRunning, burst: w.visuals.bursts.some((b) => b.t >= 0), slash: w.player.slash.texture.key }; });
  assert.ok(landed.numbers >= 1 && !landed.shaking, `a strike shows its number and the camera holds (${JSON.stringify(landed)})`);
  assert.ok(landed.burst && landed.slash === 'vfx-slashes', `the blow plays the art drop's slash arc and impact burst (${JSON.stringify(landed)})`);
  await page.screenshot({ path: 'qa/combat-feel-strike.png' });
  console.log('Strike: the blow shows its number, the V01 arc and a V02 burst, and the camera stays steady');

  // ---- the arc steps through its six frames, and a parry flashes the parry burst
  const arc = await E(page, async () => {
    const w = window.__remnant.world, seen = new Set();
    w.player.placeAt(window.target.x - 22, window.target.y, 1);
    await new Promise((r) => setTimeout(r, 300));
    const stop = Date.now() + 1200;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
    while (Date.now() < stop) { if (w.player.slash.visible) seen.add(Number(w.player.slash.frame.name)); await new Promise((r) => requestAnimationFrame(r)); }
    w.burst(w.player.x, w.player.feet - 30, 3);
    const parry = w.visuals.bursts.find((b) => b.t >= 0 && b.row === 3);
    return { frames: [...seen].sort((a, b) => a - b), parry: !!parry };
  });
  assert.ok(arc.frames.length >= 3 && arc.parry, `the slash animates through its frames and the parry burst plays (${JSON.stringify(arc)})`);
  console.log(`Art: the light cut showed frames ${arc.frames.join(',')}; the parry burst plays row 4`);

  // ---- Judgment Cross, the Phantom chain's last blow, lands with a finale: a real shake, slow motion and a push in
  const cross = await E(page, async () => {
    const w = window.__remnant.world, p = w.player, f = window.target, cam = w.cameras.main, base = w.baseZoom ?? cam.zoom;
    let calls = []; const real = w.finale.bind(w); w.finale = (...a) => { calls.push(a[2]); return real(...a); };
    p.placeAt(f.x - 22, f.y, 1);
    await new Promise((r) => setTimeout(r, 300));
    w.save.ce = 50; p.startCross();
    let zoom = 0, shook = false, slow = 1;
    for (let i = 0; i < 90; i++) { await new Promise((r) => requestAnimationFrame(r)); zoom = Math.max(zoom, cam.zoom / base); shook ||= cam.shakeEffect.isRunning; slow = Math.min(slow, w.classic.simulationScale); }
    w.finale = real;
    return { calls, zoom: +zoom.toFixed(3), shook, slow: +slow.toFixed(2) };
  });
  assert.ok(cross.calls.includes(1.4) && cross.shook && cross.zoom > 1.05 && cross.slow < 0.5, `Judgment Cross lands with shake, slow motion and a push in (${JSON.stringify(cross)})`);
  await until(page, () => window.__remnant.world.player.state === 'free' && window.__remnant.world.classic.simulationScale >= 0.79);
  console.log(`Finale: Judgment Cross shook the camera, slowed time to ${cross.slow} and pushed in to ×${cross.zoom}`);

  // ---- every Covenant ability plays its row of the V03/V04 art (Chain Snare keeps its drawn chain)
  const casts = await E(page, async () => {
    const w = window.__remnant.world, out = {};
    const rows = { sword_word: [1, 0], trumpet: [1, 1], shield_faith: [1, 2], lion: [1, 3], still_waters: [1, 4], pillar_fire: [1, 5], chains: [2, 0], armor_light: [2, 1], blink_strike: [2, 3], mending_light: [2, 4], frost_ring: [2, 5] };
    for (const [id, [sheet, row]] of Object.entries(rows)) {
      w.player.placeAt(window.target.x - 70, window.target.y, 1);
      w.castCovenant(id);
      const c = w.visuals.casts.find((o) => o.t >= 0 && o.id === id);
      out[id] = !!c && c.img.texture.key === 'vfx-abilities-' + sheet && Math.floor(Number(c.img.frame.name) / 8) === row;
      w.visuals.clear();
    }
    return out;
  });
  assert.ok(Object.values(casts).every(Boolean), `each ability starts its own art row (${JSON.stringify(casts)})`);
  await E(page, () => window.__remnant.world.visuals.load());
  console.log(`Abilities: ${Object.keys(casts).length} Covenant abilities each play their V03/V04 row`);

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
