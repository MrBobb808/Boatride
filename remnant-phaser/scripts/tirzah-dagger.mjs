// Tirzah up close, and both heroes in motion. Strike with a foe at arm's length
// draws her dagger: two cuts and a kick that knocks it back into bow range,
// with Strike during the kick going straight into a draw. Under the Wings a
// critical arrow carries her behind the foe, her dagger goes into its back and
// she looses on through it. Both heroes stretch on take-off, squash on landing
// and lean into a run; every action button wears its own pixel picture, his
// sword or her bow by who fights. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const s = await page.evaluate(() => { const p = window.__remnant.world.player; return { state: p.state, dagger: p.bow.dagger, clip: p.visualClip, x: p.x, f: window.target?.x }; }).catch(() => null);
  throw Error(`${e.message}\n${fn}\n${JSON.stringify(s)}\n${errors.join('\n')}`);
});
const tap = async (page, key, ms = 50) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const free = (page) => until(page, () => { const p = window.__remnant.world.player; return p.state === 'free' && p.onGround; });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.player.onGround && !w.transitioning; });
  // Tirzah at 30, one foe on flat ground that stands still and never falls; every clip she shows is recorded.
  await E(page, () => {
    const w = window.__remnant.world, s = w.save, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    Object.assign(s, { level: 30, mantle: 0, playableHero: 'tirzah' }); s.archer.level = 30; s.flags.mantle_known = true; s.flags.relic_taken = true;
    w.refreshStats(); w.d.crit = 0; w.player.bow.wingsCrit = 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.flying);
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    const feet = w.player.feet, flat = (x) => { for (let dx = -200; dx <= 60; dx += 8) if (open(x + dx, feet + 2) || !open(x + dx, feet - 2) || !open(x + dx, feet - 40)) return false; return true; };
    let x = 0; for (let tx = 220; tx < w.roomW() - 80; tx += 8) if (flat(tx)) { x = tx; break; }
    f.x = x; f.y = feet; f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; }; f.executable = () => false;
    window.target = f;
    window.place = (dx) => { const p = w.player; f.staggered = 0; f.x = x; f.y = feet; f.body.vx = f.body.vy = 0; p.placeAt(x + dx, feet, Math.sign(-dx) || 1); p.body.setVelocity(0, 0); p.bow.cancel(); };
    window.seen = { clips: new Set(), sx: [], sy: [], angles: [] };
    const watch = () => { const p = w.player; window.seen.clips.add(p.visualClip); window.seen.sy.push(p.sprite.scaleY); window.seen.angles.push(p.sprite.angle); requestAnimationFrame(watch); };
    watch();
  });
  await free(page);

  // ---- up close: two cuts and a kick, then a point-blank shot
  await E(page, () => window.place(-22));
  const hp0 = await E(page, () => window.target.hp);
  for (let i = 1; i <= 3; i++) { await tap(page, 'KeyJ'); await until(page, (n) => window.__remnant.world.player.bow.tally.dagger >= n, i); }
  await until(page, () => window.__remnant.world.player.bow.bashT > 0);
  const kicked = await E(page, () => { const w = window.__remnant.world, p = w.player; return { gap: Math.abs(window.target.x - p.x), clips: [...window.seen.clips].filter((c) => c.startsWith('dagger')), dmg: window.target.hp }; });
  assert.ok(kicked.clips.includes('dagger1') && kicked.clips.includes('dagger2') && kicked.clips.includes('dagger3'), `she cut twice and kicked, each with its own pose (${JSON.stringify(kicked)})`);
  assert.ok(kicked.dmg < hp0, 'the dagger drew blood');
  await until(page, () => Math.abs(window.target.x - window.__remnant.world.player.x) > 50);
  await page.screenshot({ path: 'qa/tirzah-dagger.png' });
  console.log(`Dagger: two cuts and a kick (${kicked.clips.join(', ')}), the foe sent back into bow range`);

  // ---- Strike during the kick goes straight into a draw
  await free(page);
  await E(page, () => window.place(-22));
  await tap(page, 'KeyJ'); await until(page, () => window.__remnant.world.player.bow.dagger === 1);
  await tap(page, 'KeyJ'); await until(page, () => window.__remnant.world.player.bow.dagger === 2);
  await tap(page, 'KeyJ'); await until(page, () => window.__remnant.world.player.bow.dagger === 3);
  await page.keyboard.down('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.drawing);
  await page.keyboard.up('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move.startsWith('bow_')));
  console.log('Kick to draw: Strike during the kick nocked the next arrow at once');

  // ---- from range, Strike still shoots
  await free(page);
  await E(page, () => { window.place(-150); window.__remnant.world.player.bow.tally.dagger = 0; });
  await tap(page, 'KeyJ');
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0));
  assert.equal(await E(page, () => window.__remnant.world.player.bow.tally.dagger), 0, 'from range she shoots, never cuts');

  // ---- under the Wings: a critical arrow, her dagger in its back, and on she shoots
  await free(page);
  await E(page, () => { window.place(-120); window.__remnant.world.save.mantle = 100; });
  await tap(page, 'KeyG');
  await until(page, () => window.__remnant.world.player.dawn.active, undefined, 15000);
  await free(page);
  await E(page, () => { const w = window.__remnant.world; window.place(-120); w.d.crit = 1; window.seen.clips.clear(); window.target.maxHp = 1e8; window.target.hp = 1e8; });
  const jabs0 = await E(page, () => window.__remnant.world.player.dawn.jabs);
  await tap(page, 'KeyJ');
  await until(page, (n) => window.__remnant.world.player.dawn.jabs > n, jabs0);
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'dawnstep'));
  const stab = await E(page, () => { const w = window.__remnant.world, p = w.player; return { behind: Math.sign(p.x - window.target.x), stabbed: window.seen.clips.has('dagger2') }; });
  assert.ok(stab.behind === 1 && stab.stabbed, `she blinked behind, stabbed with her dagger, and loosed on through it (${JSON.stringify(stab)})`);
  await page.screenshot({ path: 'qa/tirzah-backstab.png' });
  console.log('Wings: a critical arrow, a blink behind, the dagger in its back, then an arrow through');
  await E(page, () => { const w = window.__remnant.world; w.d.crit = 0; w.player.mantleT = 0; });

  // ---- motion: a stretch on take-off, a squash on landing, a lean into the run (Elior too)
  for (const hero of ['tirzah', 'elior']) {
    await free(page);
    await E(page, (h) => { const w = window.__remnant.world; if (w.player.hero !== h) w.player.switchHero(); w.player.switchCd = 0; window.target.x = -9999; window.seen.sy.length = 0; window.seen.angles.length = 0; }, hero);
    await free(page);
    await tap(page, 'Space', 120);
    await until(page, () => !window.__remnant.world.player.onGround);
    await free(page);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
    const m = await E(page, () => ({ hi: Math.max(...window.seen.sy), lo: Math.min(...window.seen.sy), lean: Math.max(...window.seen.angles.map(Math.abs)) }));
    assert.ok(m.hi > 1.02 && m.lo < 0.98 && m.lean > 1, `${hero} stretches, squashes and leans (${JSON.stringify(m)})`);
    console.log(`Motion (${hero}): stretch to ×${m.hi.toFixed(3)}, squash to ×${m.lo.toFixed(3)}, lean ${m.lean.toFixed(1)}°`);
  }

  // ---- the action buttons wear their own pictures, Strike by who fights
  const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(base + '?debug&nostory&autostart&fresh');
  await until(phone, () => window.__remnant?.world?.player?.onGround);
  const keys = () => E(phone, () => Object.fromEntries(window.__remnant.game.scene.getScene('hud').btns.map((b) => [b.a, b.i.texture.key])));
  const his = await keys();
  for (const a of ['attack', 'jump', 'dodge', 'parry', 'heal', 'echo', 'switch', 'transform', 'ultimate', 'sub']) assert.ok(his[a]?.startsWith('action-'), `${a} wears a pixel picture (${his[a]})`);
  assert.equal(his.attack, 'action-attack_elior');
  await E(phone, () => { const p = window.__remnant.world.player; p.switchCd = 0; p.switchHero(); });
  await until(phone, () => window.__remnant.game.scene.getScene('hud').btns.find((b) => b.a === 'attack').i.texture.key === 'action-attack_tirzah');
  assert.equal((await keys()).transform, 'action-transform_tirzah', 'her transformation button shows the Wings');
  await phone.screenshot({ path: 'qa/action-icons.png' });
  console.log('Buttons: every action wears its own picture; Strike and the transformation follow the hero');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser tirzah dagger and motion: all checks passed');
} finally {
  await browser.close();
  close();
}
