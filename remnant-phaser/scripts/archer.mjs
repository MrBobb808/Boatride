// Tirzah's Wings of the Morning: the shared transformation gauge turns her
// into the dawn form (its own forming art, palette and banner); an arrow that
// lands arms a Dawnstep, Dodge blinks her behind the foe for a guard-breaking
// back arrow, three in a chain end in Morning Star, unsafe ground behind a foe
// is refused, she glides, charged shots are free, and when the form ends light
// falls on every foe she struck. Elior's Shadow Mantle is unchanged.
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
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(e.message + '\n' + errors.join('\n')); });
const tap = async (page, key, ms = 60) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.player.onGround && !w.transitioning; });
  // Level 30 with a full gauge, Tirzah out, one foe that stands still and never falls.
  await E(page, () => {
    const w = window.__remnant.world, s = w.save, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    Object.assign(s, { level: 30, mantle: 100, playableHero: 'tirzah' }); s.archer.level = 30; s.flags.mantle_known = true; s.flags.relic_taken = true;
    w.refreshStats();
    // No random crits while the Dawnstep chain is checked by hand (a crit under the Wings steps on its own).
    w.d.crit = 0; w.player.bow.wingsCrit = 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.flying);
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    // A stretch of flat ground: 120 px clear before the foe and 70 px behind it.
    const feet = w.player.feet, flat = (x) => { for (let dx = -120; dx <= 70; dx += 8) if (open(x + dx, feet + 2) || !open(x + dx, feet - 2) || !open(x + dx, feet - 30)) return false; return true; };
    let x = 0; for (let tx = 140; tx < w.roomW() - 100; tx += 8) if (flat(tx)) { x = tx; break; }
    f.x = x; f.y = feet; f.body.vx = f.body.vy = 0;
    f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; }; f.executable = () => false;
    w.player.placeAt(f.x - 90, feet, 1); window.target = f; window.flatX = x;
  });
  await until(page, () => window.__remnant.world.player.state === 'free');

  // ---- the shared gauge transforms her into the Wings
  await tap(page, 'KeyG');
  const forming = await E(page, async () => {
    const w = window.__remnant.world; await new Promise((r) => setTimeout(r, 400));
    return { state: w.player.state, frame: Number(w.visuals.forming.frame.name), shown: w.visuals.forming.visible, gauge: w.save.mantle };
  });
  assert.ok(forming.state === 'transform' && forming.shown && forming.frame >= 16 && forming.gauge === 0, `the Wings form from the shared gauge with the dawn rows of V06 (${JSON.stringify(forming)})`);
  await until(page, () => window.__remnant.world.player.dawn.active);
  await page.waitForTimeout(300);
  const form = await E(page, () => { const p = window.__remnant.world.player; return { key: p.sprite.texture.key, wings: p.dawn.wings.visible, mantleT: p.mantleT }; });
  assert.ok(/tirzah.*mantle/.test(form.key) && form.wings && form.mantleT > 5, `she wears the dawn form and its wings (${JSON.stringify(form)})`);
  await page.screenshot({ path: 'qa/archer-wings.png' });
  console.log(`Wings: transformed from the shared gauge for ${Math.round(form.mantleT)} s, dawn sheet ${form.key}`);

  // ---- an arrow lands and arms a Dawnstep; Dodge blinks her behind the foe for the back arrow
  const hp0 = await E(page, () => window.target.hp);
  await tap(page, 'KeyJ');
  await until(page, () => !!window.__remnant.world.player.dawn.armed && window.__remnant.world.player.dawn.armed.alive);
  await tap(page, 'KeyL', 30);
  await until(page, () => window.__remnant.world.player.dawn.chain === 1);
  const step = await E(page, async () => {
    const w = window.__remnant.world, p = w.player, f = window.target;
    await new Promise((r) => setTimeout(r, 250));
    return { behind: Math.sign(p.x - f.x), face: p.face, toFoe: Math.sign(f.x - p.x), hit: f.hp < 1e8 };
  });
  assert.ok(step.behind === 1 && step.face === step.toFoe && step.hit, `Dawnstep put her behind the foe, facing its back, and the back arrow struck (${JSON.stringify(step)})`);
  console.log(`Dawnstep: blinked behind the foe and shot its back (${Math.round(hp0 - (await E(page, () => window.target.hp)))} damage so far)`);

  // ---- two more in the chain end in Morning Star
  for (let n = 2; n <= 3; n++) {
    // The back arrow re-arms the foe; if its mark has faded, one quick shot arms it again (the chain window is 2.4 s).
    await until(page, () => window.__remnant.world.player.dawn.ready(), undefined, 500).catch(() => {});
    if (!(await E(page, () => window.__remnant.world.player.dawn.ready()))) { await tap(page, 'KeyJ'); await until(page, () => window.__remnant.world.player.dawn.ready(), undefined, 2000); }
    await tap(page, 'KeyL', 30);
    if (n < 3) await until(page, (n) => window.__remnant.world.player.dawn.chain === n, n, 2000);
    if (n === 2) await page.screenshot({ path: 'qa/archer-dawnstep.png' });
  }
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'morning_star'), undefined, 2000).catch(() => {});
  const star = await E(page, () => window.__remnant.world.player.bow.arrows.filter((a) => a.life > 0 && a.move === 'morning_star').length);
  assert.ok(star >= 8, `the third Dawnstep loosed Morning Star (${star} light arrows)`);
  await page.screenshot({ path: 'qa/archer-morning-star.png' });
  console.log(`Morning Star: ${star} light arrows in a ring after three Dawnsteps`);

  // ---- no Dawnstep into a wall: with solid ground behind the foe she stays put
  const refused = await E(page, async () => {
    const w = window.__remnant.world, p = w.player, f = window.target;
    await new Promise((r) => setTimeout(r, 700));
    const x0 = 24;
    f.x = x0; p.placeAt(x0 + 80, f.y, -1);
    await new Promise((r) => setTimeout(r, 300));
    p.dawn.armed = w.foes().find((o) => o.alive); p.dawn.armT = 0.6;
    const before = p.x, ok = p.dawn.step(), moved = Math.abs(p.x - before) > 1;
    f.x = window.flatX; p.placeAt(f.x - 90, f.y, 1);
    return { ok, moved };
  });
  assert.deepEqual(refused, { ok: false, moved: false }, 'a Dawnstep with no safe ground behind the foe is refused');
  console.log('Refusal: no safe ground behind the foe, so she did not blink');

  // ---- she glides with Jump held, and charged shots cost nothing under the Wings
  await E(page, () => { const p = window.__remnant.world.player; p.placeAt(window.target.x + 160, window.target.y - 120, -1); });
  await page.keyboard.down('Space');
  const glide = await E(page, async () => {
    const p = window.__remnant.world.player; let fastest = 0, air = 0;
    for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); if (!p.onGround) { air++; fastest = Math.max(fastest, p.body.velocity.y); } }
    return { fastest, air };
  });
  await page.keyboard.up('Space');
  assert.ok(glide.air > 10 && glide.fastest <= 71, `holding Jump glides (${JSON.stringify(glide)})`);
  await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
  await E(page, () => { window.__remnant.world.save.ce = 0; });
  // Hold until the draw is a charged one, past the Perfect Draw window (game time, not wall time: the page can drop frames).
  await page.keyboard.down('KeyK'); await until(page, () => window.__remnant.world.player.bow.charge >= 0.86, undefined, 5000); await page.keyboard.up('KeyK');
  await page.waitForTimeout(60);
  const free = await E(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'bow_pierce' && a.dawn));
  assert.ok(free, 'a charged, piercing dawn shot with no Energy');
  console.log(`Wings: glided at ${glide.fastest.toFixed(0)} px/s or less, and a charged shot flew with 0 Energy`);

  // ---- when the form ends, light falls on every foe she marked
  const finale = await E(page, async () => {
    const w = window.__remnant.world, p = w.player, f = window.target;
    p.placeAt(f.x - 90, f.y, 1);
    await new Promise((r) => setTimeout(r, 200));
    const marked = p.dawn.marked.size > 0, hp = f.hp;
    p.mantleT = 0.05;
    for (let i = 0; i < 300 && (p.dawn.active || p.dawn.marked.size); i++) await new Promise((r) => requestAnimationFrame(r));
    return { marked, struck: f.hp < hp, cleared: p.dawn.marked.size === 0, active: p.dawn.active };
  });
  assert.deepEqual(finale, { marked: true, struck: true, cleared: true, active: false }, 'the closing volley strikes the marked foe');
  console.log('Finale: the form ended and light fell on the marked foe');

  // ---- a critical arrow under the Wings: she steps behind on her own and her finishing arrow fells a weakened foe
  const finisher = await E(page, async () => {
    const w = window.__remnant.world, p = w.player, f = window.target;
    p.mantleT = 12; p.placeAt(f.x - 90, f.y, 1);
    await new Promise((r) => setTimeout(r, 400));
    let finales = 0; const real = w.finale.bind(w); w.finale = (...a) => { finales++; return real(...a); };
    w.d.crit = 1; f.maxHp = 1000; f.hp = 300;
    return { finales0: finales };
  });
  await page.keyboard.press('KeyJ');
  await until(page, () => window.target.hp <= 0 || window.target.dying, undefined, 4000);
  const fell = await E(page, () => { const w = window.__remnant.world, p = w.player, f = window.target; w.d.crit = 0; return { behind: Math.sign(p.x - f.x), dead: f.hp <= 0 || f.dying, jabs: p.dawn.jabs }; });
  assert.ok(fell.dead && fell.behind === 1 && fell.jabs >= 1, `a critical arrow sent her behind the foe and her jab felled it (${JSON.stringify({ finisher, fell })})`);
  console.log('Finisher: a critical arrow under the Wings carried her behind the foe, and her dagger in its back felled it');

  // ---- Elior keeps his Shadow Mantle
  const elior = await E(page, async () => {
    const w = window.__remnant.world, p = w.player;
    p.mantleT = 0; w.save.mantle = 100; p.switchHero();
    await new Promise((r) => setTimeout(r, 1000));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG' }));
    await new Promise((r) => setTimeout(r, 400));
    const frame = Number(w.visuals.forming.frame.name);
    for (let i = 0; i < 600 && !(p.mantleT > 0 && p.state !== 'transform'); i++) await new Promise((r) => requestAnimationFrame(r));
    return { hero: p.hero, frame, mantle: p.mantleT > 0, dawn: p.dawn.active };
  });
  assert.ok(elior.hero === 'elior' && elior.frame < 16 && elior.mantle && !elior.dawn, `Elior's transformation is still the Shadow Mantle (${JSON.stringify(elior)})`);
  console.log('Elior: his transformation is still the Shadow Mantle, with its own forming art');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser archer: all checks passed');
} finally {
  await browser.close();
  close();
}
