// The Unshorn, Elior's third transformation (POLISH_PLAN §16): before it is awakened, Transform in the Shadow Mantle
// does nothing more; in the King of the North's fight, when it turns, the Mantle is offered, the king beats Elior
// down without letting him fall, and on the edge of it the awakening plays (Judges 16:28, 16:22) and he rises as the
// Unshorn. Afterwards, Transform in the Mantle ascends: bare fists (no blade arcs), a heavier hold on every blow, more
// damage than the Mantle, and the form wears off. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 40000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(e.message + '\n' + errors.join('\n')); });

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // ---- the awakening: in the King of the North's fight, the first time
  await E(page, () => {
    const w = window.__remnant.world;
    w.save.level = 68; w.save.flags.ch12_boundary_open = true; w.refreshStats();
    window.__remnant.warp('palace_between_seas', 'start');
  });
  await until(page, () => window.__remnant.world.room.id === 'palace_between_seas' && !window.__remnant.world.transitioning);
  await E(page, () => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === 'north_king_start'); w.player.placeAt(t.r.centerX, t.r.bottom, 1); });
  await until(page, () => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state));
  // Before it is awakened, Transform in the Mantle does not ascend.
  const early = await E(page, () => { const w = window.__remnant.world, p = w.player; p.mantleT = 5; const ok = w.classic.hero.tryTransform(); p.mantleT = 0; return { ok, form: p.formT }; });
  assert.ok(!early.ok && early.form === 0, `before the awakening the Mantle is as far as he goes (${JSON.stringify(early)})`);
  // The fight turns: the king's second movement.
  await E(page, () => { const w = window.__remnant.world, b = w.cboss; b.hp = Math.round(b.maxHp * 0.665); b.takeHit({ dmg: b.maxHp * 0.02, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); });
  await until(page, () => window.__remnant.world.awakening.stage === 'prompt');
  const prompt = await E(page, () => { const w = window.__remnant.world; return { gauge: w.save.mantle, deathless: w.player.deathless }; });
  assert.ok(prompt.gauge === 100 && prompt.deathless, `the Mantle is offered and he cannot fall now (${JSON.stringify(prompt)})`);
  // He takes up the Mantle; the king beats him down anyway.
  await until(page, () => window.__remnant.world.player.state !== 'hurt' && window.__remnant.world.player.state !== 'transform');
  await E(page, () => window.__remnant.world.classic.hero.tryTransform());
  await until(page, () => window.__remnant.world.awakening.stage === 'beaten');
  // A blow that would kill him leaves him standing on the last of his health.
  const edge = await E(page, () => { const w = window.__remnant.world, p = w.player; p.invuln = 0; p.mantleT = 0; p.state = 'free'; p.hurt({ dmg: p.maxHp * 50, dir: -1, src: null, unblockable: true }); return { hp: p.hp, dead: p.dead }; });
  assert.ok(edge.hp >= 1 && !edge.dead, `the beating cannot finish him (${JSON.stringify(edge)})`);
  await until(page, () => window.__remnant.world.awakening.stage === 'rising');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'qa/unshorn-prayer.png' });
  await until(page, () => window.__remnant.world.save.flags.unshorn && window.__remnant.world.player.formT > 0, null, 60000);
  await page.screenshot({ path: 'qa/unshorn-risen.png' });
  await until(page, () => window.__remnant.world.awakening.stage === 'done' && !window.__remnant.G.inCutscene, null, 30000);
  const risen = await E(page, () => { const w = window.__remnant.world, p = w.player; return { form: Math.round(p.formT), hp: p.hp / p.maxHp, moves: p.moves.combo[0].id, deathless: p.deathless }; });
  assert.ok(risen.form > 10 && risen.hp > 0.5 && risen.moves === 'u1' && !risen.deathless, `he rises as the Unshorn, bare-handed (${JSON.stringify(risen)})`);
  console.log(`Awakening: the Mantle offered, the beating, the prayer and the rise; ${risen.form} s of the Unshorn`);

  // ---- the form itself: fists, no blade arcs, a heavy hold on every blow, harder than the Mantle
  await E(page, () => { const w = window.__remnant.world; w.player.formT = 0; window.__remnant.warp('palace_tents', 'start'); });
  await until(page, () => window.__remnant.world.room.id === 'palace_tents' && !window.__remnant.world.transitioning);
  const mantleMul = await E(page, () => { const w = window.__remnant.world, p = w.player; p.mantleT = 20; return w.classic.hero.multiplier; });
  await E(page, () => window.__remnant.world.classic.hero.tryTransform());
  await until(page, () => window.__remnant.world.player.formT > 0 && window.__remnant.world.player.state !== 'transform');
  const form = await E(page, () => { const w = window.__remnant.world, p = w.player; return { mul: w.classic.hero.multiplier, mantle: p.mantleT, key: p.sprite.texture.key }; });
  assert.ok(form.mul > mantleMul && form.mantle === 0 && /fists/.test(form.key), `the ascent burns the Mantle off and hits harder (${JSON.stringify({ mantleMul, ...form })})`);
  // A punch on a foe: the number lands, the hold is heavy, no blade arc is drawn.
  await E(page, () => {
    const w = window.__remnant.world, p = w.player;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.elite);
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; };
    p.placeAt(f.x - 20, f.y, 1); window.__foe = f; window.__stops = [];
    const hs = w.hitstop.bind(w); w.hitstop = (s) => { window.__stops.push(s); hs(s); };
  });
  await until(page, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(120); }
  await until(page, () => window.__foe.hp < 1e8);
  const hit = await E(page, () => ({ stop: Math.max(...window.__stops), arc: window.__remnant.world.player.slash.visible, dealt: 1e8 - window.__foe.hp }));
  assert.ok(hit.stop >= 0.05 && !hit.arc && hit.dealt > 0, `every punch lands with weight and no arc (${JSON.stringify(hit)})`);
  assert.ok(await E(page, () => !!window.__remnant.world.visuals.impactBack), 'a punch throws an impact frame');
  await page.screenshot({ path: 'qa/unshorn-punch.png' });
  // It wears off.
  await E(page, () => { window.__remnant.world.player.formT = 0.05; });
  await until(page, () => window.__remnant.world.player.formT === 0 && window.__remnant.world.player.moves.combo[0].id !== 'u1');
  console.log(`Form: ×${form.mul.toFixed(2)} against the Mantle's ×${mantleMul}; a punch holds ${hit.stop}s and draws no arc; it wears off`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser unshorn: all checks passed');
} finally {
  await browser.close();
  close();
}
