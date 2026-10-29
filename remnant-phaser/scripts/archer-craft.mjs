// Tirzah's own craft (POLISH_PLAN §5c): True Aim's sweet spot, arrows that
// stay in a foe and tear back out on Recall, precision head shots, shooting
// a projectile down, an arrow that interrupts a wind-up, pinning against a
// wall, the backflip and diving shots, a slowed fall while drawing in the
// air, and the bow-bash. Real key presses throughout. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const s = await page.evaluate(() => { const w = window.__remnant.world, p = w.player, f = window.target; return { state: p.state, x: p.x, feet: p.feet, ground: p.onGround, face: p.face, ce: w.save.ce, arrows: p.bow.arrows.filter((a) => a.move).map((a) => [a.move, +a.life.toFixed(2), a.x | 0, a.y | 0]), tally: p.bow.tally, embedded: p.bow.embeddedCount, foe: f && { x: f.x, y: f.y, hp: f.hp, st: f.staggered, inv: f.invuln, state: f.state, dying: f.dying, alive: w.foes().some((v) => v.e === f && v.alive), glintAt: f.glintAt, time: window.__remnant.G.time } }; });
  throw Error(`${e.message}\n${fn}\n${JSON.stringify(s)}\n${errors.join('\n')}`);
});
const hold = async (page, key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround, undefined, 20000);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.player.onGround && !w.transitioning; });
  // Tirzah, no random crits, one foe that never moves or falls, on flat ground with room to stand back.
  await E(page, () => {
    const w = window.__remnant.world, s = w.save, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    Object.assign(s, { level: 20, playableHero: 'tirzah' }); s.flags.relic_taken = true;
    w.refreshStats(); w.d.crit = 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.flying);
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    const feet = w.player.feet, flat = (x) => { for (let dx = -240; dx <= 60; dx += 8) if (open(x + dx, feet + 2) || !open(x + dx, feet - 2) || !open(x + dx, feet - 40)) return false; return true; };
    let x = 0; for (let tx = 260; tx < w.roomW() - 80; tx += 8) if (flat(tx)) { x = tx; break; }
    f.x = x; f.y = feet; f.body.vx = f.body.vy = 0;
    f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; }; f.executable = () => false;
    window.target = f; window.place = (dx) => { const p = w.player; f.staggered = 0; if (f.state === 'stagger') f.setState('idle', 'idle'); p.placeAt(f.x + dx, f.y, Math.sign(-dx) || 1); p.body.setVelocity(0, 0); p.bow.cancel(); w.save.ce = p.maxCe; };
  });
  await until(page, () => window.__remnant.world.player.state === 'free');

  // ---- True Aim: the sweet spot is ticked while drawing, and a shot from mid range lands harder
  await E(page, () => window.place(-170));
  await page.keyboard.down('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.drawing);
  await page.waitForTimeout(120);
  const tick = await E(page, () => { const b = window.__remnant.world.player.bow; return { shown: b.tick.visible, x: b.tick.x - window.__remnant.world.player.x }; });
  await page.keyboard.up('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.tally.trueAim >= 1);
  assert.ok(tick.shown && tick.x > 120 && tick.x < 220, `the sweet-spot tick shows ahead while drawing (${JSON.stringify(tick)})`);
  console.log(`True Aim: the tick stood ${Math.round(tick.x)} px ahead and a shot from 170 px landed as True Aim`);

  // ---- embedded arrows, then Recall (Down + Heavy) tears them back out
  await until(page, () => window.__remnant.world.player.state === 'free');
  await E(page, () => { window.place(-90); window.__remnant.world.player.bow.recall(); window.__remnant.world.player.bow.tally.recalled = 0; });
  for (let i = 0; i < 2; i++) { await hold(page, 'KeyJ', 60); await page.waitForTimeout(450); }
  await until(page, () => window.__remnant.world.player.bow.embeddedCount >= 2);
  const before = await E(page, () => window.target.hp);
  await page.keyboard.down('KeyS'); await page.keyboard.press('KeyK'); await page.keyboard.up('KeyS');
  await until(page, () => window.__remnant.world.player.bow.tally.recalled >= 2);
  const recall = await E(page, (hp) => ({ left: window.__remnant.world.player.bow.embeddedCount, took: hp - window.target.hp }), before);
  assert.ok(recall.left === 0 && recall.took > 0, `Recall pulled every arrow back through the foe (${JSON.stringify(recall)})`);
  console.log(`Recall: two embedded arrows tore back out for ${recall.took} damage`);

  // ---- precision: Up while drawing aims at the head; a head shot from range always crits
  await until(page, () => window.__remnant.world.player.state === 'free');
  await E(page, () => window.place(-100));
  await page.keyboard.down('KeyK'); await page.waitForTimeout(80); await page.keyboard.down('KeyW'); await page.waitForTimeout(60);
  await page.keyboard.up('KeyK'); await page.keyboard.up('KeyW');
  await until(page, () => window.__remnant.world.player.bow.tally.precise >= 1);
  console.log('Precision: Up aimed the shot at the head, and it landed as a precision crit');

  // ---- shooting a projectile down
  await until(page, () => window.__remnant.world.player.state === 'free');
  await E(page, () => {
    const R = window.__remnant, p = R.world.player; window.place(-150);
    window.orb = new R.Proj('orb', p.x + 80, p.feet - 31, 'enemy', 5, { vx: -40, life: 4, w: 10, h: 10 });
    R.G.world.add(window.orb);
  });
  await hold(page, 'KeyJ', 60);
  await until(page, () => window.__remnant.world.player.bow.tally.shotDown >= 1 && window.orb.remove);
  console.log('Shot down: an arrow destroyed an enemy orb in flight');

  // ---- an arrow into a wind-up interrupts the attack
  await until(page, () => window.__remnant.world.player.state === 'free');
  // The glint a drawn foe flashes every frame of its wind-up.
  await E(page, () => { window.place(-120); const f = window.target, G = window.__remnant.G; window.glinting = true; const loop = () => { if (!window.glinting) return; f.glintAt = G.time; requestAnimationFrame(loop); }; loop(); });
  await hold(page, 'KeyJ', 60);
  await until(page, () => window.__remnant.world.player.bow.tally.interrupted >= 1 && window.target.staggered > 0);
  await E(page, () => { const f = window.target; window.glinting = false; f.staggered = 0; f.setState('idle', 'idle'); });
  console.log('Interrupt: an arrow into a foe\'s wind-up glint staggered it');

  // ---- a charged shot pins a foe against a wall
  await until(page, () => window.__remnant.world.player.state === 'free');
  await E(page, () => {
    const w = window.__remnant.world, f = window.target; window.place(-110);
    const r = f.hurtbox(), tx = Math.floor((r.x + r.w + 6) / 16), ty = Math.floor((r.y + r.h / 2) / 16);
    window.wall = [tx, ty]; w.setTile(tx, ty, 1); w.setTile(tx, ty - 1, 1);
  });
  await page.keyboard.down('KeyK');
  await until(page, () => window.__remnant.world.player.bow.charge >= 0.7);
  await page.keyboard.up('KeyK');
  await until(page, () => window.__remnant.world.player.bow.tally.pinned >= 1 && window.target.staggered > 0);
  await E(page, () => { const w = window.__remnant.world, [tx, ty] = window.wall; w.setTile(tx, ty, 0); w.setTile(tx, ty - 1, 0); window.target.staggered = 0; window.target.setState('idle', 'idle'); });
  await page.screenshot({ path: 'qa/archer-pinned.png' });
  console.log('Pinning: a charged arrow drove the foe into the wall and pinned it');

  // ---- evasive shots: backflip (Dodge then Strike) and the diving arrow (Down + Strike in the air)
  await until(page, () => window.__remnant.world.player.state === 'free');
  await E(page, () => window.place(-90));
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'bow_backflip'));
  const flip = await E(page, () => { const p = window.__remnant.world.player; return { vx: p.body.velocity.x, vy: p.body.velocity.y, face: p.face }; });
  assert.ok(flip.vy < 0 && Math.sign(flip.vx) === -flip.face, `the backflip shot leapt away from the foe (${JSON.stringify(flip)})`);
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  await E(page, () => window.place(-140));
  await page.keyboard.down('Space');
  await until(page, () => !window.__remnant.world.player.onGround);
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  await page.keyboard.down('KeyS'); await page.keyboard.press('KeyJ'); await page.keyboard.up('KeyS');
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'bow_dive' && a.vy > 0));
  console.log('Evasive shots: Dodge then Strike flipped her back with a shot; Down + Strike in the air loosed a diving arrow');

  // ---- drawing in the air slows her fall
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await page.keyboard.down('KeyK');
  const fall = await E(page, async () => {
    const p = window.__remnant.world.player; let fastest = 0, frames = 0;
    for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); if (!p.onGround && p.bow.drawing) { frames++; fastest = Math.max(fastest, p.body.velocity.y); } }
    return { fastest, frames };
  });
  await page.keyboard.up('KeyK');
  assert.ok(fall.frames > 3 && fall.fastest <= 111, `drawing in the air held her fall to 110 px/s (${JSON.stringify(fall)})`);
  console.log(`Aloft: drawing in the air held her fall to ${fall.fastest.toFixed(0)} px/s`);

  // ---- the bow-bash: a foe at arm's length is knocked back, and the next shot is point-blank
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  const hp0 = await E(page, () => { window.place(-22); return window.target.hp; });
  await hold(page, 'KeyJ', 60);
  await until(page, () => window.__remnant.world.player.bow.bashT > 0);
  assert.ok(await E(page, (hp) => window.target.hp < hp, hp0), 'the bow-bash struck the foe');
  console.log('Bow-bash: a foe at arm\'s length was bashed back, readying a point-blank shot');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser archer craft: all checks passed');
} finally {
  await browser.close();
  close();
}
