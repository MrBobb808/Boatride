// The Shadow Mantle: Elior's transformation. From level 25 a gauge fills as
// he fights; spending it wraps him in a black, blue-violet-edged cloak of
// living shadow for a while. He moves faster, takes half damage, cannot be
// staggered, every swing looses a shadow wave and the fallen may rise to
// serve. The Mantle deepens at levels 50, 75 and 100.

import { G, flag, setFlag } from './ctx';
import type { Player } from './player';
import type { HumanStyle } from '../render/actors';
import { drawRibbon } from '../render/skeleton';
import { fx, PK } from '../render/fx';
import { glow, rgba, type Ctx } from '../render/draw';
import { lighting } from '../render/lighting';
import { sfx } from '../audio/audio';
import { rand, choose, TAU } from '../core/math';
import { shakeScale } from '../core/settings';
import { isSovereign, bolt } from './power';

export const MANTLE_LV = 25;
const TIER_LV = [25, 50, 75, 100];

/** The Mantle's palette: near-black cloth, edged in blue-violet light. */
export const SHADE = {
  cloak: '#0a0811', deep: '#05040a', edge: '#6f7bff', hi: '#a9b4ff', core: '#e4e6ff', violet: '#8a5cff',
};

/** Seconds of the transformation sequence, and the moment the shadows burst out. */
export const TRANSFORM_T = 1.15;
const BURST_AT = 0.72;

export const mantleUnlocked = () => (G.save?.level ?? 0) >= MANTLE_LV;

export function mantleTier(level = G.save?.level ?? 0) {
  let t = 0;
  for (const l of TIER_LV) if (level >= l) t++;
  return t;
}

/** True while Elior wears the Mantle. */
export function mantleOn() {
  const p = G.world?.player;
  return !!p && p.mantleT > 0;
}

/** Outgoing damage while transformed: 1.5× at first, 2.2× from level 100. */
export function mantleMul() {
  return mantleOn() ? [1, 1.5, 1.7, 1.9, 2.2][mantleTier()] : 1;
}

export function mantleDuration(level = G.save.level) {
  return level >= 100 ? 40 : Math.min(34, 18 + (level - MANTLE_LV) * 0.22);
}

/** What the Mantle grants, for banners and the move list. */
export function mantlePerks(level = G.save.level) {
  const mul = [1, 1.5, 1.7, 1.9, 2.2][mantleTier(level)];
  return `${Math.round(mantleDuration(level))} seconds of ${mul}× strength, quicker blade and feet, half damage taken, no stagger, free Phantom Steps, a shadow wave on every swing, and the fallen rise to serve`;
}

// ---------------------------------------------------------------- the gauge

/** Fighting feeds the Mantle: hits, kills, parries and wounds. */
export function mantleGain(n: number) {
  const s = G.save;
  if (!mantleUnlocked() || mantleOn()) return;
  const before = s.mantle ?? 0;
  if (before >= 100) return;
  const rate = (isSovereign() ? 1.5 : 1) * (mantleTier() >= 2 ? 1.25 : 1);
  s.mantle = Math.min(100, before + n * rate);
  if (s.mantle < 100) return;
  const p = G.world.player;
  fx.number(p.x, p.y - 52, 'MANTLE READY', true, SHADE.hi);
  fx.ring(p.x, p.y - 20, 6, 44, SHADE.edge, 0.45, 2);
  sfx('mantleReady');
  if (!flag('mantle_ready_seen')) {
    setFlag('mantle_ready_seen');
    G.ui.toast(howToTransform('The shadows answer. Transform'), 'good');
  }
}

export function howToTransform(lead: string) {
  const k = G.world.keyLabel('transform');
  return `${lead} with ${k || 'the Mantle button'}.`;
}

/** Announce the Mantle once, for new and existing heroes alike, with a full gauge to try it. */
export function announceMantle(delay: number) {
  if (flag('mantle_known')) return;
  setFlag('mantle_known');
  G.save.mantle = 100;
  G.world.after(delay, () => {
    G.ui.banner('THE SHADOW MANTLE AWAKENS', howToTransform('Fill the gauge in battle, then transform'), 'ability');
    sfx('mantleReady');
    const p = G.world.player;
    fx.column(p.x, p.y, 40, 300, SHADE.edge, 1.2);
    fx.veilBurst(p.x, p.y - 20, 18, 1);
  });
}

// ---------------------------------------------------------------- transforming

export function beginTransform(p: Player) {
  G.save.mantle = 0;
  p.mantleMax = mantleDuration();
  p.transformT = 0;
  p.burstDone = false;
  p.body.vx *= 0.3;
  p.body.vy = Math.min(0, p.body.vy) * 0.2;
  p.anim.play('charge', 0.08, true);
  sfx('transform');
  G.camera.zoomTarget = 1.3;
  G.camera.focus = { x: p.x, y: p.y - 26 };
  G.world.hitstop(0.03);
}

/** Runs the transformation sequence; true once it is over. */
export function updateTransform(p: Player, dt: number): boolean {
  p.transformT += dt;
  const t = p.transformT;
  const b = p.body;
  b.vx *= Math.max(0, 1 - dt * 10);
  if (t < BURST_AT) {
    // Gathering: Elior lifts a little as the shadows pour into him.
    b.vy = -16 * (1 - t / BURST_AT);
    const n = Math.random() < dt * 90 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = rand(70, 115);
      const sx = p.x + Math.cos(a) * r, sy = p.y - 22 + Math.sin(a) * r * 0.6;
      fx.spawn(PK.Smoke, sx, sy, (p.x - sx) * 1.7, (p.y - 22 - sy) * 1.7, 0.5, rand(5, 8), 2, choose([SHADE.deep, '#120a24']), 0, 0);
      if (Math.random() < 0.6) fx.spawn(PK.Ember, sx, sy, (p.x - sx) * 1.9, (p.y - 22 - sy) * 1.9, 0.45, 1.8, 0.4, choose([SHADE.edge, SHADE.hi, SHADE.violet]), 0, 0);
    }
    G.camera.addTrauma(dt * 0.5 * shakeScale());
  } else {
    b.vy = 0;
    if (!p.burstDone) burst(p);
  }
  return t >= TRANSFORM_T;
}

/** A cutscene cut the sequence short: put the Mantle on without the show. */
export function skipTransform(p: Player) {
  if (!p.burstDone) {
    p.burstDone = true;
    p.mantleT = p.mantleMax;
    p.styleKey = '';
  }
  G.camera.zoomTarget = 1;
  G.camera.focus = null;
}

function burst(p: Player) {
  p.burstDone = true;
  const x = p.x, y = p.y - 22;
  p.mantleT = p.mantleMax;
  p.styleKey = '';
  p.cloak.reset(p.x, p.y - 26);
  p.anim.play('invoke', 0.03, true);
  fx.flash('#d8d4ff', 0.5);
  fx.ring(x, y, 8, 180, SHADE.edge, 0.65, 6);
  fx.ring(x, y, 4, 120, SHADE.core, 0.4, 3);
  fx.ring(p.x, p.y - 2, 10, 150, SHADE.violet, 0.8, 4, 0.3);
  fx.column(p.x, p.y, 44, 460, SHADE.edge, 1.0);
  fx.veilBurst(x, y, 34, 1.7);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU), v = rand(120, 320);
    fx.spawn(PK.Smoke, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.6, rand(0.6, 1), rand(6, 9), rand(14, 22), choose([SHADE.deep, '#120a24', '#1a1036']), -20, 3);
  }
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU), v = rand(160, 420);
    fx.spawn(PK.Spark, x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.6), 1.8, 0.4, choose([SHADE.core, SHADE.hi, SHADE.edge]), 120, 2);
  }
  // The surge throws back everything near, either side.
  const struck = new Set<number>();
  for (const dir of [-1, 1]) {
    const box = { x: dir > 0 ? p.x : p.x - 140, y: p.y - 100, w: 140, h: 120 };
    G.world.hitEnemies(box, {
      dmg: G.d.atk * 2.2 * mantleMul(), poise: 90, kx: dir * 340, ky: -240, dir, kind: 'ability', src: p, guardBreak: true, stop: 0.08, color: SHADE.edge,
    }, struck);
  }
  G.camera.addTrauma(0.7 * shakeScale());
  G.camera.punch = 0.09;
  G.camera.zoomTarget = 1;
  G.camera.focus = null;
  G.world.hitstop(0.09);
  G.world.slowmo(0.5, 0.3);
  fx.number(p.x, p.y - 66, 'SHADOW MANTLE', true, SHADE.hi);
  if (!flag('mantle_used')) {
    setFlag('mantle_used');
    G.ui.banner('SHADOW MANTLE', mantlePerks(), 'ability');
  }
}

// ---------------------------------------------------------------- wearing it

/** Per-step upkeep: the timer, trailing shadows, black flame and the eye trail. */
export function tickMantle(p: Player, dt: number) {
  if (mantleUnlocked() && !flag('mantle_known') && !G.inCutscene) announceMantle(2.5);
  if (p.mantleT <= 0) {
    if (p.eyeN > 0 && Math.random() < dt * 30) p.eyeN--;
    return;
  }
  if (!G.inCutscene) p.mantleT -= dt;
  if (p.mantleT <= 0) {
    endMantle(p);
    return;
  }
  const b = p.body;
  const moving = Math.abs(b.vx) > 30 || !b.onGround || p.state === 'attack' || p.state === 'dodge' || p.state === 'airdash';
  // Shadows trail behind him (fewer on lower quality settings).
  p.shadeT -= dt;
  if (moving && p.shadeT <= 0 && p.state !== 'phantom' && !p.fin?.hidden) {
    p.shadeT = G.renderer.tier >= 2 ? 0.045 : 0.075;
    p.ghosts.push({ x: p.x, y: p.y, face: p.face, pose: { ...p.pose }, a: 0.6, rot: p.pose.rot, shade: true });
    if (p.ghosts.length > 14) p.ghosts.shift();
  }
  // Black flame and blue-violet embers rising off him.
  if (Math.random() < dt * 24) {
    fx.spawn(PK.Smoke, p.x + rand(-10, 10), p.y - rand(4, 34), -b.vx * 0.2 + rand(-10, 10), rand(-60, -30), rand(0.5, 0.8), rand(3, 5), rand(8, 12), choose([SHADE.deep, '#120a24', '#0c0a1a']), -30, 1.5);
  }
  if (Math.random() < dt * 22) {
    fx.spawn(PK.Ember, p.x + rand(-10, 10), p.y - rand(0, 36), -p.face * rand(0, 20), rand(-80, -30), 0.7, 1.6, 0.2, choose([SHADE.edge, SHADE.hi, SHADE.violet]), -20, 1);
  }
  // Wisps stream from the cloak's hem.
  if (moving && Math.random() < dt * 30) {
    const k = p.cloak.n - 1;
    fx.spawn(PK.Smoke, p.cloak.xs[k], p.cloak.ys[k], -b.vx * 0.3, rand(-20, 0), 0.6, 4, 9, '#0d0918', -10, 2);
  }
  if (Math.random() < dt * 1.2) bolt(p.x + rand(-14, 14), p.y - rand(30, 46), p.x + rand(-14, 14), p.y - rand(0, 14), SHADE.hi);
  // The eye's light, remembered for the trail.
  const [ex, ey] = eyePos(p);
  const tr = p.eyeTrail;
  tr.copyWithin(2, 0, tr.length - 2);
  tr[0] = ex;
  tr[1] = ey;
  p.eyeN = Math.min(tr.length / 2, p.eyeN + 1);
}

export function endMantle(p: Player, quiet = false) {
  p.mantleT = 0;
  p.styleKey = '';
  if (quiet) return;
  sfx('mantleEnd');
  fx.veilBurst(p.x, p.y - 20, 18, 1);
  fx.ring(p.x, p.y - 20, 4, 54, SHADE.edge, 0.4, 2);
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU);
    fx.spawn(PK.Smoke, p.x + Math.cos(a) * 8, p.y - 20 + Math.sin(a) * 12, Math.cos(a) * 60, Math.sin(a) * 40 - 20, rand(0.6, 0.9), 5, 12, '#120a24', -20, 2);
  }
}

/** Where Elior's eye is in the world (matches the head drawing in actors.ts). */
function eyePos(p: Player): [number, number] {
  const j = p.j, a = j.headA;
  const ex = j.headX + Math.cos(a) * 2.34 + Math.sin(a) * 0.45;
  const ey = j.headY + Math.sin(a) * 2.34 - Math.cos(a) * 0.45;
  return [p.x + p.face * ex, p.y + ey];
}

// ---------------------------------------------------------------- the look

export function mantleStyle(base: HumanStyle): HumanStyle {
  return {
    ...base,
    skin: '#9c7c6e', hair: '#07060c', coat: SHADE.cloak, coatDark: SHADE.deep, trim: SHADE.edge,
    pants: '#0d0b14', boots: '#08070d', glove: '#100d18', belt: '#16121f',
    plate: base.plate ? { c: '#14111d', dark: '#09070e', hi: SHADE.edge, tier: base.plate.tier } : null,
    helm: 'hood_up', helmColor: '#0c0a13', helmTrim: SHADE.edge,
    eye: SHADE.hi, eyeGlow: 1,
    weaponGlow: SHADE.violet, weaponGlowAmt: 1, weaponFlame: true,
    runes: SHADE.edge, scarf: '#140e24',
  };
}

/** Afterimages of the Mantle: dark bodies rimmed in blue-violet light. */
export const SHADE_GHOST: HumanStyle = {
  skin: 'rgba(30,24,80,0.7)', hair: 'rgba(30,24,80,0.7)', hairKind: 'spiky', coat: 'rgba(30,24,80,0.7)', coatDark: 'rgba(18,14,50,0.7)',
  skirt: 9, trim: null, pants: 'rgba(30,24,80,0.7)', boots: 'rgba(30,24,80,0.7)', glove: 'rgba(30,24,80,0.7)', belt: null,
  plate: null, helm: 'hood_up', helmColor: 'rgba(30,24,80,0.7)', eye: '#fff', eyeGlow: 0, outline: 'rgba(111,123,255,0.4)', weapon: 'none', offhand: 'none', bulk: 1, flat: true,
};

/** Behind the body: a pool of darkness, black flame, and the long cloak. */
export function drawMantleBack(ctx: Ctx, p: Player) {
  const t = G.time;
  const x = p.x, y = p.y;
  // In its last seconds the Mantle gutters.
  const k = p.mantleT < 3 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9)) : 1;
  glow(ctx, x, y - 20, 48, '#04020a', 0.55 * k);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y - 20, 36, '#3a32c8', (0.28 + Math.sin(t * 5) * 0.06) * k);
  glow(ctx, x, y - 4, 24, SHADE.violet, 0.2 * k);
  ctx.globalCompositeOperation = 'source-over';
  // Thin tongues of black flame flickering up both flanks.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const row = i >> 1;
    const ph = t * 7 + i * 1.9;
    const bx = x + side * (6 + row * 1.5), by = y - 8 - row * 10;
    const h = 7 + Math.sin(ph) * 3 + row;
    const sw = Math.sin(ph * 1.4) * 2.5 - p.body.vx * 0.03 + side * 2;
    ctx.beginPath();
    ctx.moveTo(bx - 1.6, by);
    ctx.quadraticCurveTo(bx - 1 + sw, by - h * 0.55, bx + sw * 1.5, by - h);
    ctx.quadraticCurveTo(bx + 1 + sw, by - h * 0.45, bx + 1.6, by);
    ctx.closePath();
    ctx.fillStyle = rgba('#0b0716', 0.5 * k);
    ctx.fill();
  }
  // The cloak: black cloth edged in blue-violet light, its hem in tatters.
  const c = p.cloak, n = c.n;
  const edge = rgba(SHADE.edge, 0.9 * k);
  drawRibbon(ctx, c, 6, 12, SHADE.cloak, edge);
  const hx = c.xs[n - 1], hy = c.ys[n - 1];
  let dx = hx - c.xs[n - 2], dy = hy - c.ys[n - 2];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const w = 6;
  const lx = hx - dy * w, ly = hy + dx * w, rx = hx + dy * w, ry = hy - dx * w;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 4, v = (i + 1) / 4;
    const len = 4 + Math.sin(t * 8 + i * 2.1) * 1.8 + (i % 2) * 2;
    ctx.lineTo(lx + (rx - lx) * u + dx * len, ly + (ry - ly) * u + dy * len);
    ctx.lineTo(lx + (rx - lx) * v, ly + (ry - ly) * v);
  }
  ctx.closePath();
  ctx.fillStyle = SHADE.cloak;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

/** After the lighting pass: the gathering dark, the sigil, and eyes that burn through it. */
export function drawMantleOverlay(ctx: Ctx, p: Player) {
  if (p.state === 'transform') {
    const tt = p.transformT;
    const v = G.camera.view();
    const dark = tt < BURST_AT ? Math.min(0.62, tt * 1.1) : Math.max(0, 0.62 - (tt - BURST_AT) * 2.2);
    ctx.fillStyle = `rgba(4,2,12,${dark.toFixed(3)})`;
    ctx.fillRect(v.x - 10, v.y - 10, v.w + 20, v.h + 20);
    ctx.globalCompositeOperation = 'lighter';
    const grow = Math.min(1, tt / 0.5);
    const fade = tt < BURST_AT ? 1 : Math.max(0, 1 - (tt - BURST_AT) * 3);
    ctx.save();
    ctx.translate(p.x, p.y - 1);
    ctx.scale(1, 0.26);
    ctx.strokeStyle = rgba(SHADE.edge, 0.85 * grow * fade);
    ctx.lineWidth = 2.5;
    for (const rr of [72, 54, 30]) {
      ctx.beginPath();
      ctx.arc(0, 0, rr * grow, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + tt * 2;
      ctx.moveTo(Math.cos(a) * 30 * grow, Math.sin(a) * 30 * grow);
      ctx.lineTo(Math.cos(a) * 72 * grow, Math.sin(a) * 72 * grow);
    }
    ctx.stroke();
    ctx.restore();
    if (tt < BURST_AT) {
      // Tendrils drawn inward.
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + tt * 3;
        const u = (tt * 1.8 + i * 0.37) % 1;
        const r0 = 130 * (1 - u), r1 = r0 * 0.6;
        ctx.strokeStyle = rgba(i % 2 ? SHADE.edge : SHADE.violet, 0.7 * u);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * r0, p.y - 22 + Math.sin(a) * r0 * 0.6);
        ctx.lineTo(p.x + Math.cos(a + 0.4) * r1, p.y - 22 + Math.sin(a + 0.4) * r1 * 0.6);
        ctx.stroke();
      }
    }
    const [ex, ey] = eyePos(p);
    glow(ctx, ex, ey, 12, SHADE.hi, 0.9);
    glow(ctx, ex, ey, 4, '#ffffff', 0.9);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  const n = p.eyeN;
  if (n < 2 || p.state === 'phantom' || p.fin?.hidden || p.state === 'dead') return;
  const tr = p.eyeTrail;
  const on = p.mantleT > 0 ? 1 : n / (tr.length / 2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < n - 1; i++) {
    const u = 1 - i / n;
    ctx.strokeStyle = rgba(i < 2 ? SHADE.core : SHADE.hi, 0.75 * u * on);
    ctx.lineWidth = 1.8 * u + 0.3;
    ctx.beginPath();
    ctx.moveTo(tr[i * 2], tr[i * 2 + 1]);
    ctx.lineTo(tr[i * 2 + 2], tr[i * 2 + 3]);
    ctx.stroke();
  }
  if (p.mantleT > 0) glow(ctx, tr[0], tr[1], 4.5, SHADE.hi, 0.65);
  ctx.globalCompositeOperation = 'source-over';
}

export function mantleLights(p: Player) {
  if (p.mantleT > 0 || p.state === 'transform') lighting.add(p.x, p.y - 20, 120, '#5a5cff', 0.75, 0.35);
}
