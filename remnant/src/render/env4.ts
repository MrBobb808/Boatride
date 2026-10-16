// Chapter IV environment art. The plain of Dura at dusk: baked mud brick and
// sandstone, date palms and reed beds, Babylon low on the horizon and the
// golden Image standing over the plain. Babylon by night: blue-glazed brick,
// golden lions and dragons, hanging gardens and the ziggurat's fire. And the
// furnace halls: soot-black brick, ember-lit mortar, iron catwalks and slag.

import { makeCanvas, glowSprite, rgba, shade, mix, circle, ellipse, type Ctx } from './draw';
import { RNG, hash2, fbm1, clamp } from '../core/math';
import { TILE, T, type Biome, type EntDef } from '../game/tiles';
import { fx } from './fx';
import type { BiomePal, Layer } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
export type Ch4Biome = 'dura' | 'babylon' | 'furnace';
export const isCh4 = (b: Biome): b is Ch4Biome => b === 'dura' || b === 'babylon' || b === 'furnace';

const TAU = Math.PI * 2;
const OUT = '#120c08';
const GOLD = '#d8a840';
const GOLD_HI = '#f8e0a0';
const GOLD_DK = '#7a5014';
const GLAZE = '#21508e';
const GLAZE_HI = '#4a86cc';
const GLAZE_DK = '#10284c';
const MUD = '#9a7048';
const SOOT = '#1a1310';
const EMBER = '#ff6a1a';
const EMBER_HI = '#ffc060';

/**
 * How large the Image stands in the far layer of each Dura room, by room seed:
 * it towers over the plain and is a faint glint from the river camp. Before the
 * Image itself (the boss room) the real thing stands on its dais, so the far
 * layer leaves it out rather than show two.
 */
const IMAGE_FAR: Record<number, number> = { 503: 0.25, 571: 1 };

// ---------------------------------------------------------------- helpers

const SPR: Record<string, HTMLCanvasElement> = {};
/** Glow sprite per colour, fetched without building a cache key (no per-frame garbage). */
function spr(c: string) {
  return SPR[c] ?? (SPR[c] = glowSprite(c));
}
/** Elliptical glow; caller sets the composite mode. */
function blob(ctx: Ctx, c: string, x: number, y: number, rx: number, ry: number, a: number) {
  if (a <= 0.003) return;
  const p = ctx.globalAlpha;
  ctx.globalAlpha = p * Math.min(1, a);
  ctx.drawImage(spr(c), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = p;
}

/** Outline first, then fill: overlapping sub-shapes read as one silhouette. */
function solidify(ctx: Ctx, fill: string | CanvasGradient, out: string, lw: number) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = out;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Quality tier, read from the particle cap that main sets per tier (2 high, 1 medium, 0 low). */
function tier() {
  return fx.cap >= 900 ? 2 : fx.cap >= 500 ? 1 : 0;
}

/** Periodic noise across the strip width so the strip tiles without a seam. */
function wrapNoise(w: number, scale: number, sd: number, oct = 4) {
  return (x: number) => {
    const xx = ((x % w) + w) % w, f = xx / w;
    return (1 - f) * fbm1(xx / scale, sd, oct) + f * fbm1((xx - w) / scale, sd, oct);
  };
}

function fillRidge(ctx: Ctx, w: number, h: number, hy: (x: number) => number, col: string | CanvasGradient) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, hy(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function strokeRidge(ctx: Ctx, w: number, hy: (x: number) => number, col: string, lw: number, dy = 0.6) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 6) {
    if (!x) ctx.moveTo(x, hy(x) + dy);
    else ctx.lineTo(x, hy(x) + dy);
  }
  ctx.stroke();
}

/** The part of a baked chunk this prop can touch, in the prop's local space (no rotation in bakes). */
function localView(ctx: Ctx): [number, number, number, number] {
  const m = ctx.getTransform();
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const ax = -m.e / m.a, bx = (W - m.e) / m.a, ay = -m.f / m.d, by = (H - m.f) / m.d;
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/**
 * A running-bond brick field over x0..x1, y0..y1, clipped to what the chunk
 * shows. Bricks are batched into one path per tint, so a whole wall costs a
 * few fills; joints go in one stroke.
 */
function brickField(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, bw: number, bh: number, tints: readonly string[], seed: number, mortar: string | null, lw = 0.6) {
  const v = localView(ctx);
  const cx0 = Math.max(x0, v[0] - bw), cx1 = Math.min(x1, v[2] + bw), cy0 = Math.max(y0, v[1] - bh), cy1 = Math.min(y1, v[3] + bh);
  if (cx0 >= cx1 || cy0 >= cy1) return;
  const r0 = Math.max(0, Math.floor((cy0 - y0) / bh)), r1 = Math.ceil((cy1 - y0) / bh);
  const n = tints.length;
  for (let k = 0; k < n; k++) {
    ctx.beginPath();
    for (let r = r0; r < r1; r++) {
      const by = y0 + r * bh, hh = Math.min(bh, y1 - by);
      if (hh <= 0) continue;
      const off = r & 1 ? bw / 2 : 0;
      const c0 = Math.floor((cx0 - x0 + off) / bw), c1 = Math.ceil((cx1 - x0 + off) / bw);
      for (let c = c0; c <= c1; c++) {
        if (((hash2(c, r, seed) * n) | 0) !== k) continue;
        const bx = x0 + c * bw - off;
        const a = Math.max(bx, x0), b = Math.min(bx + bw, x1);
        if (b > a) ctx.rect(a, by, b - a, hh);
      }
    }
    ctx.fillStyle = tints[k];
    ctx.fill();
  }
  if (!mortar) return;
  ctx.beginPath();
  for (let r = r0; r < r1; r++) {
    const by = y0 + r * bh;
    if (by >= y1) break;
    ctx.moveTo(cx0, by + lw * 0.5);
    ctx.lineTo(cx1, by + lw * 0.5);
    const off = r & 1 ? bw / 2 : 0, bot = Math.min(by + bh, y1);
    const c0 = Math.floor((cx0 - x0 + off) / bw), c1 = Math.ceil((cx1 - x0 + off) / bw);
    for (let c = c0; c <= c1; c++) {
      const bx = x0 + c * bw - off;
      if (bx <= x0 || bx >= x1) continue;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, bot);
    }
  }
  ctx.strokeStyle = mortar;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Babylonian stepped crenellations along a wall top from x0 to x1 (merlon width m). */
function merlons(ctx: Ctx, x0: number, x1: number, top: number, m: number, col: string | CanvasGradient) {
  const step = m * 1.6;
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let x = x0 + (((x1 - x0) % step) / 2); x + m <= x1 + 0.01; x += step) {
    const s = m / 3;
    ctx.moveTo(x, top);
    ctx.lineTo(x, top - m * 0.45);
    ctx.lineTo(x + s, top - m * 0.45);
    ctx.lineTo(x + s, top - m * 0.9);
    ctx.lineTo(x + 2 * s, top - m * 0.9);
    ctx.lineTo(x + 2 * s, top - m * 0.45);
    ctx.lineTo(x + m, top - m * 0.45);
    ctx.lineTo(x + m, top);
    ctx.closePath();
  }
  ctx.fill();
}

/** Horizontal shading for a metal part lit from the left (the low sun). */
function metalGrad(ctx: Ctx, x0: number, x1: number, c: readonly string[]) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, c[1]);
  g.addColorStop(0.28, c[0]);
  g.addColorStop(0.72, c[2]);
  g.addColorStop(1, shade(c[2], -0.35));
  return g;
}

/** Quad strip from (x0,y0) width w0 to (x1,y1) width w1, added to the current path. */
function taper(ctx: Ctx, x0: number, y0: number, w0: number, x1: number, y1: number, w1: number) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  ctx.moveTo(x0 + (nx * w0) / 2, y0 + (ny * w0) / 2);
  ctx.lineTo(x1 + (nx * w1) / 2, y1 + (ny * w1) / 2);
  ctx.lineTo(x1 - (nx * w1) / 2, y1 - (ny * w1) / 2);
  ctx.lineTo(x0 - (nx * w0) / 2, y0 - (ny * w0) / 2);
  ctx.closePath();
}

// ---------------------------------------------------------------- the golden Image

/** [base, highlight, shadow] for each of the Image's metals (Daniel 2:32-33). */
const METAL = {
  gold: ['#e0aa40', '#fff2b8', '#784a10'],
  silver: ['#aab2c2', '#f4f8ff', '#4a5060'],
  brass: ['#b87a34', '#f4c47a', '#56340e'],
  iron: ['#464a54', '#9aa0ac', '#1c1e24'],
  clay: ['#8a5434', '#c48c5c', '#3c2212'],
} as const;

/**
 * The Image as a far silhouette: head of gold, breast and arms of silver, belly
 * and thighs of brass, legs of iron, feet part iron and part clay. Drawn in a
 * 100-unit frame (feet at 0, crown near -97) scaled to H; `hz` hazes it toward `haze`.
 */
function imageFigure(ctx: Ctx, cx: number, base: number, H: number, haze: string, hz: number) {
  const k = H / 100;
  const tone = (m: readonly string[]) => [mix(m[0], haze, hz), mix(m[1], haze, hz * 0.5), mix(m[2], haze, hz)];
  const Gd = tone(METAL.gold), Sv = tone(METAL.silver), Br = tone(METAL.brass), Ir = tone(METAL.iron), Cl = tone(METAL.clay);
  const out = mix('#0a0604', haze, hz * 0.6);
  const lw = 0.55;
  ctx.save();
  ctx.translate(cx, base);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  // pedestal
  const ped = mix('#8a6a48', haze, hz * 0.8);
  for (const [w, y, hh] of [[19, 0, 4], [15.5, -4, 3.5], [12.5, -7.5, 2.5]] as const) {
    ctx.beginPath();
    ctx.rect(-w, y - hh, w * 2, hh);
    ctx.fillStyle = metalGrad(ctx, -w, w, [ped, shade(ped, 0.25), shade(ped, -0.35)]);
    ctx.fill();
    ctx.fillStyle = rgba('#000000', 0.25);
    ctx.fillRect(-w, y - 0.6, w * 2, 0.6);
  }
  ctx.fillStyle = rgba(Gd[0], 0.8);
  ctx.fillRect(-15.5, -5.6, 31, 0.7);
  ctx.translate(0, -10);
  // legs of iron
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 8.4, -4);
    ctx.lineTo(s * 2, -4);
    ctx.lineTo(s * 1.6, -18);
    ctx.lineTo(s * 1.4, -34);
    ctx.lineTo(s * 9.8, -34);
    ctx.quadraticCurveTo(s * 9.9, -24, s * 9.2, -19);
    ctx.quadraticCurveTo(s * 8.8, -10, s * 8.4, -4);
    ctx.closePath();
    solidify(ctx, metalGrad(ctx, s < 0 ? -10 : 1.4, s < 0 ? -1.4 : 10, Ir), out, lw);
    // knee
    ctx.strokeStyle = rgba(Ir[2], 0.8);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(s * 5.6, -19, 2.2, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  // feet, part iron and part clay
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 10.6, 0);
    ctx.lineTo(s * 0.8, 0);
    ctx.lineTo(s * 1.4, -4.4);
    ctx.lineTo(s * 9, -4.4);
    ctx.quadraticCurveTo(s * 10.8, -3, s * 10.6, 0);
    ctx.closePath();
    solidify(ctx, metalGrad(ctx, s < 0 ? -10.6 : 0.8, s < 0 ? -0.8 : 10.6, Ir), out, lw);
    ctx.fillStyle = Cl[0];
    ctx.beginPath();
    ctx.moveTo(s * 3, 0);
    ctx.lineTo(s * 2.2, -2.8);
    ctx.lineTo(s * 4.6, -3.6);
    ctx.lineTo(s * 6.4, -1.8);
    ctx.lineTo(s * 8.8, -2.6);
    ctx.lineTo(s * 9.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = Cl[2];
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(s * 4.2, -3.2);
    ctx.lineTo(s * 5, -1.4);
    ctx.lineTo(s * 4.4, 0);
    ctx.moveTo(s * 7.4, -2.2);
    ctx.lineTo(s * 8, -0.8);
    ctx.stroke();
    ctx.fillStyle = rgba(Cl[1], 0.7);
    ctx.fillRect(s * 2.6 - (s < 0 ? 1.6 : 0), -2.6, 1.6, 0.6);
  }
  // kilt over the thighs, of brass
  ctx.beginPath();
  ctx.moveTo(-10.4, -57);
  ctx.lineTo(10.4, -57);
  ctx.lineTo(12, -33);
  ctx.quadraticCurveTo(0, -31.5, -12, -33);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -12, 12, Br), out, lw);
  ctx.strokeStyle = rgba(Br[2], 0.75);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    ctx.moveTo(i * 2.3, -55);
    ctx.lineTo(i * 2.6, -33.5);
  }
  ctx.stroke();
  ctx.fillStyle = Br[2];
  for (let i = -11; i <= 11; i += 1.4) ctx.fillRect(i, -33.4 + Math.abs(i) * 0.02, 0.5, 1.6);
  // belly of brass
  ctx.beginPath();
  ctx.moveTo(-9.6, -63);
  ctx.lineTo(9.6, -63);
  ctx.lineTo(10.4, -56);
  ctx.lineTo(-10.4, -56);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -10.4, 10.4, Br), out, lw);
  ctx.fillStyle = Br[2];
  ctx.fillRect(-10.4, -58.4, 20.8, 1.8);
  ctx.fillStyle = Br[1];
  ctx.fillRect(-1.4, -58.8, 2.8, 2.6);
  // arms of silver, hanging a little clear of the body
  for (const s of [-1, 1]) {
    ctx.beginPath();
    taper(ctx, s * 12.2, -73, 5.2, s * 14.6, -60, 4.4);
    taper(ctx, s * 14.6, -60, 4.4, s * 13, -47.5, 3.6);
    ctx.moveTo(s * 13 + 2.4, -46.5);
    ctx.arc(s * 13, -46.5, 2.4, 0, TAU);
    solidify(ctx, metalGrad(ctx, s < 0 ? -17 : 10, s < 0 ? -10 : 17, Sv), out, lw);
    ctx.fillStyle = rgba(Sv[2], 0.7);
    ctx.fillRect(s * 14.6 - 2, -60.4, 4, 0.7);
  }
  // breast of silver
  ctx.beginPath();
  ctx.moveTo(-13, -75);
  ctx.lineTo(13, -75);
  ctx.quadraticCurveTo(12.6, -67, 9.8, -63);
  ctx.lineTo(-9.8, -63);
  ctx.quadraticCurveTo(-12.6, -67, -13, -75);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -13, 13, Sv), out, lw);
  ctx.strokeStyle = rgba(Sv[2], 0.8);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-8, -68.5);
  ctx.quadraticCurveTo(-4, -66.5, -0.4, -68.8);
  ctx.moveTo(8, -68.5);
  ctx.quadraticCurveTo(4, -66.5, 0.4, -68.8);
  ctx.stroke();
  // neck, head and beard of gold
  ctx.beginPath();
  ctx.rect(-2.8, -79, 5.6, 4.4);
  ctx.moveTo(4.6, -84);
  ctx.ellipse(0, -84, 4.6, 5.2, 0, 0, TAU);
  solidify(ctx, metalGrad(ctx, -4.6, 4.6, Gd), out, lw);
  ctx.beginPath();
  ctx.moveTo(-4.3, -82);
  ctx.lineTo(4.3, -82);
  ctx.lineTo(3.9, -74.5);
  ctx.lineTo(0, -73.2);
  ctx.lineTo(-3.9, -74.5);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -4.3, 4.3, Gd), out, lw * 0.8);
  ctx.strokeStyle = rgba(Gd[2], 0.85);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(-3.8 + i * 0.1, -80.5 + i * 1.7);
    ctx.lineTo(3.8 - i * 0.1, -80.5 + i * 1.7);
  }
  ctx.stroke();
  ctx.fillStyle = Gd[2];
  ctx.fillRect(-2.6, -85.2, 1.6, 0.7);
  ctx.fillRect(1, -85.2, 1.6, 0.7);
  // a tall horned crown
  ctx.beginPath();
  ctx.moveTo(-4.8, -87.5);
  ctx.lineTo(4.8, -87.5);
  ctx.lineTo(5.6, -98);
  ctx.lineTo(-5.6, -98);
  ctx.closePath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 4.6, -89);
    ctx.quadraticCurveTo(s * 8.8, -90, s * 8.2, -96.5);
    ctx.lineTo(s * 7.2, -96);
    ctx.quadraticCurveTo(s * 7.2, -91.5, s * 4.6, -91.2);
    ctx.closePath();
  }
  solidify(ctx, metalGrad(ctx, -8.8, 8.8, Gd), out, lw);
  ctx.fillStyle = Gd[2];
  ctx.fillRect(-5, -91.5, 10, 1);
  ctx.fillStyle = Gd[1];
  for (let i = -4; i <= 4; i += 2) circle(ctx, i, -98.6, 0.7, Gd[1]);
  // the sun catching the gold
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffc860', -1, -88, 16, 16, 0.45 * (1 - hz * 0.6));
  blob(ctx, '#fff0c0', -2.4, -93, 4, 4, 0.7 * (1 - hz * 0.5));
  ctx.fillStyle = rgba('#fff6d8', 0.75 * (1 - hz * 0.5));
  ctx.fillRect(-2.6, -102, 0.5, 9);
  ctx.fillRect(-6.8, -97.6, 9, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// ---------------------------------------------------------------- skies

const SKY_STOPS: Record<Ch4Biome, readonly (readonly [number, string])[]> = {
  // Indigo overhead burning down to orange at the horizon.
  dura: [[0, '#100a26'], [0.2, '#24143e'], [0.34, '#4a1c46'], [0.45, '#8a2c40'], [0.53, '#c8503a'], [0.6, '#ee8a44'], [0.68, '#f6b062']],
  // Night over the city, the sky warm where Babylon's fires light it from below.
  babylon: [[0, '#04050e'], [0.3, '#0b0e26'], [0.5, '#1c1638'], [0.64, '#3c1e3a'], [0.76, '#6a2e32'], [0.9, '#8a4430']],
  // A cave lit from below by fire.
  furnace: [[0, '#060201'], [0.4, '#140603'], [0.72, '#341006'], [1, '#5a1a06']],
};
const skyG: Partial<Record<Ch4Biome, CanvasGradient>> = {};
const skyH: Partial<Record<Ch4Biome, number>> = {};

function skyFill(ctx: Ctx, b: Ch4Biome, w: number, h: number) {
  let g = skyG[b];
  if (!g || skyH[b] !== h) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of SKY_STOPS[b]) g.addColorStop(o, c);
    skyG[b] = g;
    skyH[b] = h;
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawSkyCh4(ctx: Ctx, biome: Ch4Biome, pal: BiomePal, w: number, h: number, t: number) {
  skyFill(ctx, biome, w, h);
  if (biome === 'dura') duraSky(ctx, w, h, t);
  else if (biome === 'babylon') nightSky(ctx, pal, w, h, t);
  else furnaceSky(ctx, w, h, t);
}

/** Dusk over Dura: first stars, a low red sun sinking behind the city, haze and lit cloud streaks. */
function duraSky(ctx: Ctx, w: number, h: number, t: number) {
  const k = h / 720;
  ctx.fillStyle = '#fff2dc';
  for (let i = 0; i < 34; i++) {
    const y = hash2(i, 7) * h * 0.3;
    ctx.globalAlpha = (0.15 + 0.4 * hash2(i, 11)) * (1 - y / (h * 0.3)) * (0.7 + 0.3 * Math.sin(t * (0.8 + hash2(i, 5) * 2) + i));
    const s = (1 + hash2(i, 9)) * k;
    ctx.fillRect(hash2(i, 3) * w, y, s, s);
  }
  ctx.globalAlpha = 1;
  // cloud streaks, lit from below by the sun
  for (let i = 0; i < 5; i++) {
    const y = h * (0.2 + i * 0.055);
    const x = ((t * (2 + i) * k * 2 + hash2(i, 21) * w) % (w + 900 * k)) - 450 * k;
    const len = (260 + hash2(i, 23) * 260) * k;
    ctx.fillStyle = i < 2 ? 'rgba(58,26,64,0.5)' : 'rgba(120,40,60,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, y, len, (3 + i) * k, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = i < 2 ? 'rgba(255,140,110,0.22)' : 'rgba(255,170,110,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 20 * k, y + (2.5 + i * 0.6) * k, len * 0.8, 1.3 * k, 0, 0, TAU);
    ctx.fill();
  }
  // the sun, low and red, half behind the far horizon
  const sx = w * 0.24, sy = h * 0.5, sr = h * 0.072;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#c03a1a', sx, sy, sr * 12, sr * 6, 0.45);
  blob(ctx, '#ff8a3a', sx, sy, sr * 5, sr * 3.5, 0.5);
  blob(ctx, '#ffd090', sx, sy, sr * 2, sr * 2, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, sr, '#ff8048');
  circle(ctx, sx - sr * 0.08, sy - sr * 0.06, sr * 0.84, '#ffa860');
  circle(ctx, sx - sr * 0.15, sy - sr * 0.12, sr * 0.55, '#ffd49a');
  // heat haze dragged across its face
  for (let i = 0; i < 4; i++) {
    const y = sy - sr * 0.6 + i * sr * 0.42;
    const x = sx + Math.sin(t * 0.13 + i * 1.7) * sr * 0.8;
    ctx.fillStyle = i & 1 ? 'rgba(150,40,50,0.4)' : 'rgba(110,30,50,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y, sr * (2.2 - i * 0.2), sr * 0.07, 0, 0, TAU);
    ctx.fill();
  }
}

/** Night over Babylon: stars, a pale moon with drifting cloud. */
function nightSky(ctx: Ctx, pal: BiomePal, w: number, h: number, t: number) {
  const k = h / 720;
  ctx.fillStyle = '#e8ecff';
  for (let i = 0; i < 70; i++) {
    const y = hash2(i, 17) * h * 0.55;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash2(i, 5) * 2.2) + i * 1.3);
    ctx.globalAlpha = (0.12 + 0.55 * hash2(i, 13) * tw) * (1 - y / (h * 0.62));
    const s = (0.8 + hash2(i, 19) * 1.5) * k;
    ctx.fillRect(hash2(i, 15) * w, y, s, s);
  }
  ctx.globalAlpha = 1;
  const mx = w * 0.8, my = h * 0.17, mr = h * 0.055;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#5a6aa8', mx, my, mr * 9, mr * 9, 0.32);
  blob(ctx, '#fff0d0', mx, my, mr * 2.6, mr * 2.6, 0.4);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, mx, my, mr, pal.moon ?? '#f1d9b0');
  // maria
  ctx.fillStyle = 'rgba(160,140,120,0.35)';
  ctx.beginPath();
  ctx.ellipse(mx - mr * 0.3, my - mr * 0.2, mr * 0.34, mr * 0.26, 0.4, 0, TAU);
  ctx.ellipse(mx + mr * 0.28, my + mr * 0.25, mr * 0.24, mr * 0.2, 0, 0, TAU);
  ctx.ellipse(mx + mr * 0.1, my - mr * 0.45, mr * 0.16, mr * 0.12, 0, 0, TAU);
  ctx.fill();
  // cloud bands sliding under the moon, lit at their edges
  for (let i = 0; i < 4; i++) {
    const y = h * (0.12 + i * 0.07);
    const x = ((t * (3 + i * 1.5) * k * 3 + hash2(i, 31) * w) % (w + 800 * k)) - 400 * k;
    const len = (220 + hash2(i, 33) * 200) * k;
    ctx.fillStyle = 'rgba(16,14,36,0.62)';
    ctx.beginPath();
    ctx.ellipse(x, y, len, (6 + i * 2) * k, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,176,220,0.12)';
    ctx.beginPath();
    ctx.ellipse(x - 10 * k, y - (4 + i * 1.6) * k, len * 0.85, 1.4 * k, 0, 0, TAU);
    ctx.fill();
  }
}

/** The furnace halls' depths: ember light breathing below, smoke drifting across. */
function furnaceSky(ctx: Ctx, w: number, h: number, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  const p = 0.5 + 0.5 * Math.sin(t * 0.9);
  blob(ctx, '#a02a06', w * 0.3, h * 0.95, w * 0.45, h * 0.35, 0.35 + 0.12 * p);
  blob(ctx, '#c8460a', w * 0.75, h, w * 0.4, h * 0.3, 0.3 + 0.12 * (1 - p));
  ctx.globalCompositeOperation = 'source-over';
  const k = h / 720;
  for (let i = 0; i < 3; i++) {
    const y = h * (0.18 + i * 0.16);
    const x = ((t * (5 + i * 2) * k * 2 + i * w * 0.4) % (w + 900 * k)) - 450 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, 420 * k, (14 + i * 6) * k, 0, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- parallax pieces

/** A date palm silhouette: tapering curved trunk and a crown of drooping fronds. */
function palmSil(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG, rim: string | null = null, rimDir = -1) {
  const lean = rng.range(-0.22, 0.22);
  const tx = x + lean * h, ty = base - h;
  const bw = Math.max(1.2, h * 0.032), tw = bw * 0.62;
  const mx = x + lean * h * 0.15;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - bw, base + 3);
  ctx.quadraticCurveTo(mx - bw, base - h * 0.55, tx - tw, ty);
  ctx.lineTo(tx + tw, ty);
  ctx.quadraticCurveTo(mx + bw, base - h * 0.55, x + bw, base + 3);
  ctx.closePath();
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + rimDir * bw * 0.7, base);
    ctx.quadraticCurveTo(mx + rimDir * bw * 0.7, base - h * 0.55, tx + rimDir * tw * 0.7, ty + 2);
    ctx.stroke();
  }
  // fronds: each a curved blade, with a few leaflet strokes for a feathery edge
  const n = 9;
  ctx.beginPath();
  const lf: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 1.15 - Math.PI * 1.075 + rng.range(-0.1, 0.1);
    const L = h * rng.range(0.28, 0.4);
    const ca = Math.cos(a), sa = Math.sin(a);
    const ex = tx + ca * L, ey = ty + sa * L * 0.35 + L * 0.5 * Math.abs(ca) + L * 0.1;
    const cx = tx + ca * L * 0.55, cy = ty + sa * L * 0.6 - L * 0.12;
    const wd = L * 0.07;
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(cx, cy - wd, ex, ey);
    ctx.quadraticCurveTo(cx, cy + wd, tx, ty + 1);
    lf.push(tx, ty, cx, cy, ex, ey);
  }
  ctx.fill();
  if (h > 30) {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.6, h * 0.008);
    ctx.beginPath();
    for (let i = 0; i < lf.length; i += 6) {
      for (let s = 0.3; s < 0.95; s += 0.13) {
        const u = s, iu = 1 - u;
        const px = iu * iu * lf[i] + 2 * iu * u * lf[i + 2] + u * u * lf[i + 4];
        const py = iu * iu * lf[i + 1] + 2 * iu * u * lf[i + 3] + u * u * lf[i + 5];
        const d = h * 0.05 * (1 - u * 0.5);
        ctx.moveTo(px, py);
        ctx.lineTo(px + d * 0.3, py + d);
        ctx.moveTo(px, py);
        ctx.lineTo(px - d * 0.3, py + d);
      }
    }
    ctx.stroke();
  }
  // dates hanging under the crown
  ctx.beginPath();
  ctx.ellipse(tx - h * 0.025, ty + h * 0.04, h * 0.022, h * 0.035, 0.2, 0, TAU);
  ctx.ellipse(tx + h * 0.03, ty + h * 0.035, h * 0.018, h * 0.03, -0.2, 0, TAU);
  ctx.fill();
}

/** A reed bed: thin stems with cattail heads. */
function reedSil(ctx: Ctx, x: number, base: number, w: number, h: number, col: string, rng: RNG) {
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineCap = 'round';
  const n = Math.max(5, Math.round(w / 2.5));
  ctx.lineWidth = Math.max(0.6, h * 0.025);
  ctx.beginPath();
  const heads: number[] = [];
  for (let i = 0; i < n; i++) {
    const px = x + rng.range(0, w), hh = h * rng.range(0.45, 1), bend = rng.range(-0.25, 0.25) * hh;
    ctx.moveTo(px, base + 2);
    ctx.quadraticCurveTo(px + bend * 0.2, base - hh * 0.6, px + bend, base - hh);
    if (rng.chance(0.35)) heads.push(px + bend * 0.92, base - hh * 0.92, hh);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < heads.length; i += 3) {
    const s = Math.max(0.8, heads[i + 2] * 0.04);
    ctx.moveTo(heads[i] + s, heads[i + 1]);
    ctx.ellipse(heads[i], heads[i + 1], s, s * 3, 0, 0, TAU);
  }
  ctx.fill();
}

/** A stepped ziggurat silhouette with a central stair; the lit face takes a rim line. */
function zigguratSil(ctx: Ctx, cx: number, base: number, w: number, h: number, tiers: number, col: string, rim: string, rimDir: number) {
  const th = h / (tiers + 0.6);
  for (let i = 0; i < tiers; i++) {
    const tw = w * (1 - i * (0.72 / tiers));
    const y = base - (i + 1) * th;
    ctx.fillStyle = col;
    ctx.fillRect(cx - tw / 2, y, tw, th + 0.6);
    // buttress shadows down each tier
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let bx = cx - tw / 2 + tw * 0.08; bx < cx + tw / 2 - 2; bx += Math.max(4, tw * 0.09)) ctx.fillRect(bx, y + 1, Math.max(0.8, tw * 0.02), th - 1);
    ctx.fillStyle = rim;
    ctx.fillRect(cx - tw / 2, y, tw, Math.max(0.6, th * 0.08));
    ctx.fillRect(rimDir < 0 ? cx - tw / 2 : cx + tw / 2 - 1, y, 1, th);
  }
  // shrine on the summit
  const sw = w * 0.16, sy = base - tiers * th - th * 0.6;
  ctx.fillStyle = col;
  ctx.fillRect(cx - sw / 2, sy, sw, th * 0.6 + 0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(cx - sw * 0.12, sy + th * 0.2, sw * 0.24, th * 0.4);
  // the great stair up the front
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.07, base);
  ctx.lineTo(cx - w * 0.03, base - tiers * th * 0.62);
  ctx.lineTo(cx + w * 0.03, base - tiers * th * 0.62);
  ctx.lineTo(cx + w * 0.07, base);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.05);
  for (let i = 1; i < 10; i++) {
    const u = i / 10, sx = w * (0.07 - u * 0.04);
    ctx.fillRect(cx - sx, base - tiers * th * 0.62 * u, sx * 2, 0.5);
  }
  return sy;
}

/** A city wall with towers and stepped crenellations. */
function wallSil(ctx: Ctx, x0: number, x1: number, base: number, h: number, col: string, rim: string, every: number, rimDir: number) {
  ctx.fillStyle = col;
  ctx.fillRect(x0, base - h, x1 - x0, h + 1);
  merlons(ctx, x0, x1, base - h, Math.max(2, h * 0.2), col);
  const tw = Math.max(4, h * 0.5);
  for (let x = x0 + every * 0.5; x < x1 - tw; x += every) {
    ctx.fillStyle = col;
    ctx.fillRect(x, base - h * 1.45, tw, h * 1.45 + 1);
    merlons(ctx, x - 0.5, x + tw + 0.5, base - h * 1.45, Math.max(1.6, tw * 0.32), col);
    ctx.fillStyle = rim;
    ctx.fillRect(rimDir < 0 ? x : x + tw - 0.8, base - h * 1.45, 0.8, h * 1.45);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + tw * 0.4, base - h * 1.15, tw * 0.2, h * 0.3);
  }
  ctx.fillStyle = rim;
  ctx.fillRect(x0, base - h, x1 - x0, 0.6);
}

/** Flat-roofed mud-brick houses with dark doors and a few lit windows. */
function housesSil(ctx: Ctx, x0: number, x1: number, base: number, k: number, col: string, rim: string, rng: RNG, lit: number) {
  let x = x0;
  while (x < x1) {
    const bw = rng.range(14, 30) * k, bh = rng.range(10, 22) * k;
    ctx.fillStyle = col;
    ctx.fillRect(x, base - bh, bw, bh + 2);
    // parapet with a roof shelter on some
    ctx.fillRect(x - 0.8, base - bh - 1.4 * k, bw + 1.6, 1.4 * k);
    if (rng.chance(0.35)) {
      ctx.fillRect(x + bw * 0.55, base - bh - 6 * k, bw * 0.35, 6 * k);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + bw * 0.6, base - bh - 4.5 * k, bw * 0.25, 3 * k);
    }
    ctx.fillStyle = rim;
    ctx.fillRect(x, base - bh - 1.4 * k, bw, 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + bw * 0.3, base - 6 * k, 3 * k, 6 * k);
    if (rng.chance(lit)) {
      ctx.fillStyle = 'rgba(255,170,80,0.75)';
      ctx.fillRect(x + bw * rng.range(0.55, 0.8), base - bh * 0.62, 1.6 * k, 2.2 * k);
    }
    x += bw + rng.range(0, 10) * k;
  }
}

/** A prostrate worshipper, bowed toward +x (dir flips). s is about a head's height. */
function kneeler(ctx: Ctx, x: number, base: number, s: number, dir: number, pose: number) {
  ctx.beginPath();
  if (pose === 0) {
    // forehead to the ground, arms out ahead
    ctx.ellipse(x, base - s * 1.3, s * 2.2, s * 1.35, dir * 0.12, Math.PI, 0);
    ctx.lineTo(x + dir * s * 2.2, base);
    ctx.lineTo(x - dir * s * 2.4, base);
    ctx.closePath();
    ctx.moveTo(x + dir * s * 2.7 + s * 0.8, base - s * 0.7);
    ctx.arc(x + dir * s * 2.7, base - s * 0.7, s * 0.8, 0, TAU);
    ctx.rect(dir > 0 ? x + s * 3 : x - s * 4.6, base - s * 0.45, s * 1.6, s * 0.45);
  } else {
    // kneeling upright, hands lifted
    ctx.moveTo(x - dir * s * 1.6, base);
    ctx.lineTo(x - dir * s * 1.4, base - s * 1.4);
    ctx.lineTo(x - dir * s * 0.6, base - s * 3.6);
    ctx.lineTo(x + dir * s * 0.7, base - s * 3.5);
    ctx.lineTo(x + dir * s * 1.2, base - s * 1.4);
    ctx.lineTo(x + dir * s * 1.9, base);
    ctx.closePath();
    ctx.moveTo(x + dir * 0.1 * s + s * 0.75, base - s * 4.2);
    ctx.arc(x + dir * 0.1 * s, base - s * 4.2, s * 0.75, 0, TAU);
    taper(ctx, x + dir * s * 0.5, base - s * 3.2, s * 0.5, x + dir * s * 1.8, base - s * 5.2, s * 0.35);
  }
  ctx.fill();
}

// ---------------------------------------------------------------- parallax

export function buildParallaxCh4(biome: Ch4Biome, pal: BiomePal, seed: number, viewH: number, res: number): Layer[] {
  const layers: Layer[] = [];
  const rng = new RNG(seed);
  const W = 1024;
  const H = Math.round(viewH * 1.6);
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    const m = makeCanvas(W * r, H * r);
    m.ctx.scale(r, r);
    draw(m.ctx, W, H);
    layers.push({ c: m.c, w: W, h: H, fx, fy, oy: 0, res: r });
  };
  /** Draw something near a strip edge twice so the wrap is seamless. */
  const wrap = (x: number, reach: number, w: number, f: (x: number) => void) => {
    f(x);
    if (x + reach > w) f(x - w);
    if (x - reach < 0) f(x + w);
  };

  if (biome === 'dura') {
    const img = IMAGE_FAR[seed] ?? 0;
    const camp = img > 0 && img < 1;
    // Far: Babylon low on the horizon, and on the plain the Image catching the sun.
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8;
      const haze = mix(pal.far, pal.fog, 0.55);
      const n0 = wrapNoise(w, 300, seed, 3);
      fillRidge(ctx, w, h, (x) => hz - 4 - n0(x) * 16, mix(pal.far, pal.fog, 0.62));
      // the city: walls, towers, palace blocks and the ziggurat with its fire
      const cityCol = mix(pal.far, pal.fog, camp ? 0.36 : 0.46), rim = rgba('#ffb070', camp ? 0.4 : 0.3);
      const k = camp ? 1 : 0.62;
      const c0 = camp ? 150 : 40, c1 = camp ? 610 : 330, zx = camp ? 330 : 190;
      const cr = new RNG(seed + 5);
      housesSil(ctx, c0 + 10, c1 - 10, hz - 12 * k, k * 1.2, cityCol, rim, cr, 0.25);
      const top = zigguratSil(ctx, zx, hz - 8 * k, 130 * k, 92 * k, 6, cityCol, rim, -1);
      wallSil(ctx, c0, c1, hz, 14 * k, mix(cityCol, '#000000', 0.06), rim, 34 * k, -1);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff9a3a', zx, top - 2, 14 * k, 10 * k, 0.55);
      ctx.fillStyle = '#ffd890';
      ctx.fillRect(zx - 1, top - 3 * k, 2, 2.5 * k);
      for (let i = 0; i < 9; i++) {
        const fx = c0 + cr.range(0, c1 - c0);
        blob(ctx, '#ff8a3a', fx, hz - cr.range(4, 16) * k, 4, 3, 0.4);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (img >= 1) {
        imageFigure(ctx, 432, hz + 3, 128, haze, 0.18);
      } else if (img > 0) {
        imageFigure(ctx, 520, hz + 1, 26, haze, 0.55);
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#ffd070', 520, hz - 23, 9, 9, 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }
      // nearer dunes over the city's feet, lit along their crests
      const n1 = wrapNoise(w, 170, seed + 3, 3);
      const r1 = (x: number) => hz + 2 + n1(x) * 7;
      fillRidge(ctx, w, h, r1, mix(pal.far, pal.fog, 0.3));
      strokeRidge(ctx, w, r1, rgba('#ffc080', 0.35), 0.8);
    }, img >= 1 ? res : res * 0.7);
    // Mid: dunes, palm groves and mud-brick hamlets; on the plain, crowds bowed toward the Image.
    mk(0.17, 0.07, (ctx, w, h) => {
      const n = wrapNoise(w, 220, seed + 11, 4);
      const hy = (x: number) => h * 0.84 - n(x) * h * 0.045;
      const col = pal.mid, rim = rgba('#ff9a5a', 0.32);
      const fr = new RNG(seed + 12);
      if (camp) {
        // the river: a band of sky-lit water with reeds along the far bank
        const ry = h * 0.835;
        ctx.fillStyle = mix(pal.mid, '#e08a4a', 0.35);
        ctx.fillRect(0, ry - 4, w, 8);
        ctx.fillStyle = rgba('#ffc890', 0.35);
        for (let i = 0; i < 40; i++) ctx.fillRect(fr.range(0, w), ry - 3 + fr.range(0, 6), fr.range(6, 24), 0.7);
      }
      let x = fr.range(0, 40);
      while (x < w - 20) {
        const kind = fr.int(0, camp ? 3 : 4);
        const sd = fr.int(0, 99999);
        if (kind <= 1) {
          // a grove of palms
          const cnt = 2 + (sd % 3);
          for (let i = 0; i < cnt; i++) {
            const px = x + i * fr.range(9, 16), ph = fr.range(34, 62);
            wrap(px, 30, w, (xx) => palmSil(ctx, xx, hy(xx) + 3, ph, col, new RNG(sd + i), rim, -1));
          }
          x += cnt * 14 + fr.range(30, 80);
        } else if (kind === 2) {
          wrap(x, 60, w, (xx) => housesSil(ctx, xx, xx + 70, hy(xx) + 4, 0.9, col, rim, new RNG(sd), 0.5));
          x += fr.range(100, 160);
        } else if (kind === 3) {
          wrap(x, 30, w, (xx) => reedSil(ctx, xx, hy(xx) + 3, 26, 16, col, new RNG(sd)));
          x += fr.range(50, 90);
        } else {
          // rows of worshippers bowed toward the Image, standards over them
          wrap(x, 90, w, (xx) => {
            ctx.fillStyle = col;
            const r = new RNG(sd);
            for (let row = 0; row < 2; row++) {
              for (let i = 0; i < 12; i++) {
                const px = xx + i * 6.5 + row * 3, gy = hy(px) + 3 - row * 2;
                kneeler(ctx, px, gy, 1.5 - row * 0.2, 1, r.chance(0.82) ? 0 : 1);
              }
            }
            ctx.fillRect(xx + 18, hy(xx + 18) - 30, 1, 30);
            ctx.fillRect(xx + 58, hy(xx + 58) - 26, 1, 26);
            ctx.beginPath();
            ctx.moveTo(xx + 19, hy(xx + 18) - 30);
            ctx.lineTo(xx + 27, hy(xx + 18) - 27);
            ctx.lineTo(xx + 19, hy(xx + 18) - 23);
            ctx.moveTo(xx + 59, hy(xx + 58) - 26);
            ctx.lineTo(xx + 66, hy(xx + 58) - 23);
            ctx.lineTo(xx + 59, hy(xx + 58) - 20);
            ctx.fill();
          });
          x += fr.range(130, 190);
        }
      }
      fillRidge(ctx, w, h, hy, col);
      strokeRidge(ctx, w, hy, rgba('#ffb070', 0.28), 1.1);
    });
    // Near: tall palms and reeds, dark against the dusk.
    mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 120, seed + 21, 3);
      const hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22);
      const col = pal.near, rim = rgba('#ff8a4a', 0.22);
      let x = fr.range(10, 60);
      while (x < w - 30) {
        const sd = fr.int(0, 99999), a = fr.range(0, 1);
        if (fr.chance(camp ? 0.4 : 0.55)) wrap(x, 60, w, (xx) => palmSil(ctx, xx, hy(xx) + 6, 70 + a * 60, col, new RNG(sd), rim, -1));
        else wrap(x, 40, w, (xx) => reedSil(ctx, xx - 20, hy(xx) + 6, 44, 36 + a * 22, col, new RNG(sd)));
        x += fr.range(90, 190);
      }
      fillRidge(ctx, w, h, hy, col);
    });
  } else if (biome === 'babylon') {
    // Far: the city under the moon, the ziggurat burning at its summit.
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8;
      const col = mix(pal.far, '#3a3060', 0.25), rim = rgba('#b8c4ff', 0.28);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) blob(ctx, '#a0401a', rng.range(0, w), hz + rng.range(-10, 10), rng.range(90, 180), rng.range(30, 60), rng.range(0.18, 0.3));
      ctx.globalCompositeOperation = 'source-over';
      const cr = new RNG(seed + 4);
      housesSil(ctx, 0, w, hz - 10, 1.4, mix(col, '#000000', 0.05), rim, cr, 0.4);
      const zx = 300;
      const top = zigguratSil(ctx, zx, hz - 4, 190, 128, 7, col, rim, 1);
      // twin palace towers and the outer wall
      for (const tx of [520, 548, 760, 790]) {
        ctx.fillStyle = col;
        ctx.fillRect(tx, hz - 46, 16, 46);
        merlons(ctx, tx - 1, tx + 17, hz - 46, 5, col);
        ctx.fillStyle = rim;
        ctx.fillRect(tx + 15, hz - 46, 1, 46);
        ctx.fillStyle = 'rgba(255,170,80,0.7)';
        ctx.fillRect(tx + 6, hz - 34, 2, 3);
      }
      wallSil(ctx, 0, w, hz + 4, 12, mix(col, '#000000', 0.12), rim, 40, 1);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff7a2a', zx, top - 4, 34, 26, 0.6);
      blob(ctx, '#ffc070', zx, top - 4, 10, 10, 0.8);
      ctx.fillStyle = '#ffe0a0';
      ctx.beginPath();
      ctx.moveTo(zx - 4, top);
      ctx.quadraticCurveTo(zx - 3, top - 7, zx + 0.5, top - 12);
      ctx.quadraticCurveTo(zx + 4, top - 6, zx + 4, top);
      ctx.fill();
      for (let i = 0; i < 24; i++) blob(ctx, '#ff9a4a', cr.range(0, w), hz - cr.range(2, 30), 3, 2.5, 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }, res * 0.75);
    // Mid: rooftops and the terraces of the hanging gardens, lamps in the windows.
    mk(0.15, 0.08, (ctx, w, h) => {
      const base = h * 0.86;
      const col = pal.mid, rim = rgba('#a8b4f0', 0.22), leaf = '#13202a', leafHi = 'rgba(150,190,200,0.16)';
      const fr = new RNG(seed + 14);
      ctx.fillStyle = col;
      ctx.fillRect(0, base, w, h - base);
      let x = fr.range(0, 30);
      while (x < w - 20) {
        const sd = fr.int(0, 99999);
        if (fr.chance(0.32)) {
          // the gardens: terraces stepping up, greenery spilling over every edge
          const gw = fr.range(160, 220);
          wrap(x, gw, w, (xx) => {
            const r = new RNG(sd);
            const tiers = 4;
            for (let i = 0; i < tiers; i++) {
              const tw = gw * (1 - i * 0.2), th = 26;
              const tx = xx + (gw - tw) / 2, ty = base - (i + 1) * th;
              ctx.fillStyle = col;
              ctx.fillRect(tx, ty, tw, th + 1);
              ctx.fillStyle = 'rgba(0,0,0,0.4)';
              for (let ax = tx + 8; ax < tx + tw - 10; ax += 14) {
                ctx.beginPath();
                ctx.moveTo(ax, ty + th);
                ctx.lineTo(ax, ty + 12);
                ctx.arc(ax + 4, ty + 12, 4, Math.PI, 0);
                ctx.lineTo(ax + 8, ty + th);
                ctx.fill();
              }
              ctx.fillStyle = rim;
              ctx.fillRect(tx, ty, tw, 0.8);
              // foliage along the lip, vines trailing down the face
              ctx.fillStyle = leaf;
              ctx.beginPath();
              for (let lx = tx - 2; lx < tx + tw + 2; lx += 5) {
                const rr = r.range(3, 6);
                ctx.moveTo(lx + rr, ty - 1);
                ctx.arc(lx, ty - 1, rr, 0, TAU);
              }
              ctx.fill();
              ctx.strokeStyle = leaf;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              for (let lx = tx + 3; lx < tx + tw - 2; lx += r.range(5, 11)) {
                const L = r.range(6, th * 0.9);
                ctx.moveTo(lx, ty + 1);
                ctx.quadraticCurveTo(lx + 2, ty + L * 0.5, lx - 1, ty + L);
              }
              ctx.stroke();
              ctx.fillStyle = leafHi;
              for (let lx = tx; lx < tx + tw; lx += 7) ctx.fillRect(lx + r.range(0, 3), ty - 4 - r.range(0, 2), 2.5, 1);
            }
            // cypress and palms on the top terrace
            const top = base - tiers * 26, tw = gw * 0.4, tx0 = xx + (gw - tw) / 2;
            ctx.fillStyle = leaf;
            for (let i = 0; i < 3; i++) {
              const cx = tx0 + tw * (0.2 + i * 0.3), ch = r.range(26, 40);
              ctx.beginPath();
              ctx.moveTo(cx - 4, top);
              ctx.quadraticCurveTo(cx - 5, top - ch * 0.6, cx, top - ch);
              ctx.quadraticCurveTo(cx + 5, top - ch * 0.6, cx + 4, top);
              ctx.fill();
            }
            palmSil(ctx, tx0 + tw * 0.05, top, 38, col, r, rim, 1);
            palmSil(ctx, tx0 + tw * 0.95, top, 30, col, r, rim, 1);
          });
          x += gw + fr.range(20, 60);
        } else {
          // a block of rooftops, parapets and a lit window or two
          const bw = fr.range(40, 90), bh = fr.range(40, 90);
          wrap(x, bw, w, (xx) => {
            const r = new RNG(sd);
            ctx.fillStyle = col;
            ctx.fillRect(xx, base - bh, bw, bh + 1);
            merlons(ctx, xx, xx + bw, base - bh, 6, col);
            if (r.chance(0.5)) {
              ctx.fillRect(xx + bw * 0.6, base - bh - 18, bw * 0.3, 18);
              merlons(ctx, xx + bw * 0.6, xx + bw * 0.9, base - bh - 18, 4, col);
            }
            ctx.fillStyle = rim;
            ctx.fillRect(xx + bw - 1, base - bh, 1, bh);
            for (let i = 0; i < 4; i++) {
              if (!r.chance(0.6)) continue;
              const wx = xx + r.range(4, bw - 8), wy = base - r.range(10, bh - 8);
              ctx.fillStyle = 'rgba(0,0,0,0.5)';
              ctx.fillRect(wx, wy, 3.5, 5);
              if (r.chance(0.55)) {
                ctx.fillStyle = 'rgba(255,170,90,0.8)';
                ctx.fillRect(wx + 0.6, wy + 0.8, 2.3, 3.6);
                ctx.globalCompositeOperation = 'lighter';
                blob(ctx, '#ff9a4a', wx + 1.7, wy + 2.6, 7, 7, 0.35);
                ctx.globalCompositeOperation = 'source-over';
              }
            }
          });
          x += bw + fr.range(-6, 30);
        }
      }
    });
    // Near: the inner wall's battlements and towers, palms against them.
    mk(0.35, 0.15, (ctx, w, h) => {
      const base = h * 0.92, top = h * 0.74;
      const col = pal.near, rim = rgba('#9aa8e8', 0.2);
      ctx.fillStyle = col;
      ctx.fillRect(0, top, w, h - top);
      merlons(ctx, 0, w, top, 9, col);
      ctx.fillStyle = rim;
      ctx.fillRect(0, top, w, 0.8);
      const fr = new RNG(seed + 24);
      for (let x = 60; x < w; x += 256) {
        ctx.fillStyle = col;
        ctx.fillRect(x, top - 44, 40, 46);
        merlons(ctx, x - 1, x + 41, top - 44, 8, col);
        ctx.fillStyle = rim;
        ctx.fillRect(x + 39, top - 44, 1, 44);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x + 16, top - 30, 7, 12);
        ctx.fillStyle = 'rgba(255,160,80,0.7)';
        ctx.fillRect(x + 17.5, top - 27, 4, 7);
        ctx.fillStyle = col;
        ctx.fillRect(x + 19, top - 70, 1.4, 26);
        ctx.beginPath();
        ctx.moveTo(x + 20.4, top - 70);
        ctx.lineTo(x + 32, top - 66);
        ctx.lineTo(x + 20.4, top - 62);
        ctx.fill();
      }
      let x = fr.range(100, 160);
      while (x < w - 30) {
        const sd = fr.int(0, 99999), ph = fr.range(80, 120);
        wrap(x, 50, w, (xx) => palmSil(ctx, xx, base, ph, col, new RNG(sd), rim, 1));
        x += fr.range(150, 260);
      }
    });
  } else {
    // Far: soot-black vaults over deep fire, vents glowing in the piers.
    mk(0.1, 0.05, (ctx, w, h) => {
      const fl = h * 0.88;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) blob(ctx, '#c03c08', (w / 8) * i + rng.range(0, 60), fl - rng.range(0, 30), rng.range(60, 110), rng.range(40, 80), rng.range(0.25, 0.4));
      ctx.globalCompositeOperation = 'source-over';
      // a far arcade, dimmer
      const far = mix(pal.far, '#000000', 0.25);
      ctx.fillStyle = far;
      for (let x = 0; x < w; x += 64) {
        ctx.fillRect(x, h * 0.4, 14, fl - h * 0.4);
        ctx.beginPath();
        ctx.moveTo(x, h * 0.62);
        ctx.arc(x + 32, h * 0.62, 32, Math.PI, 0);
        ctx.lineTo(x + 64, h * 0.4);
        ctx.lineTo(x, h * 0.4);
        ctx.fill();
      }
      // the near arcade: piers, voussoirs and a cornice
      const col = pal.far, sp = h * 0.7, R = 46;
      for (let x = 0; x < w; x += 128) {
        ctx.fillStyle = col;
        ctx.fillRect(x, 0, 36, h);
        ctx.beginPath();
        ctx.moveTo(x + 36, sp);
        ctx.arc(x + 82, sp, R, Math.PI, 0);
        ctx.lineTo(x + 128, 0);
        ctx.lineTo(x + 36, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = Math.PI + (i / 12) * Math.PI;
          ctx.moveTo(x + 82 + Math.cos(a) * R, sp + Math.sin(a) * R);
          ctx.lineTo(x + 82 + Math.cos(a) * (R + 9), sp + Math.sin(a) * (R + 9));
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,110,40,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x + 82, sp, R + 0.5, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
        // vents in the pier
        for (let k = 0; k < 2; k++) {
          const vy = sp - 40 + k * 70;
          ctx.fillStyle = '#100604';
          ctx.fillRect(x + 11, vy, 14, 22);
          ctx.fillStyle = 'rgba(255,110,30,0.75)';
          for (let b = 0; b < 4; b++) ctx.fillRect(x + 12, vy + 2 + b * 5, 12, 2.4);
          ctx.globalCompositeOperation = 'lighter';
          blob(ctx, '#ff6a1a', x + 18, vy + 11, 20, 18, 0.35);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.fillStyle = mix(col, '#000000', 0.2);
      ctx.fillRect(0, sp - R - 22, w, 8);
      ctx.fillStyle = 'rgba(255,120,50,0.18)';
      ctx.fillRect(0, sp - R - 14, w, 1);
      ctx.fillStyle = mix(col, '#000000', 0.3);
      ctx.fillRect(0, fl, w, h - fl);
    }, res * 0.7);
    // Mid: iron-banded pillars, a catwalk across the depths, chains and hooks.
    mk(0.28, 0.12, (ctx, w, h) => {
      const col = pal.mid, rim = 'rgba(255,110,40,0.3)';
      const walk = h * 0.66;
      // catwalk with railing and trusses
      ctx.fillStyle = col;
      ctx.fillRect(0, walk, w, 5);
      ctx.fillRect(0, walk - 14, w, 1.5);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = 0; x < w; x += 12) {
        ctx.moveTo(x, walk);
        ctx.lineTo(x, walk - 14);
        ctx.moveTo(x, walk + 5);
        ctx.lineTo(x + 12, walk + 14);
        ctx.moveTo(x + 12, walk + 5);
        ctx.lineTo(x, walk + 14);
      }
      ctx.stroke();
      ctx.fillRect(0, walk + 14, w, 2);
      ctx.fillStyle = rim;
      ctx.fillRect(0, walk + 4.4, w, 0.7);
      for (let x = 70; x < w; x += 256) {
        // a pillar with iron bands and a glowing grate
        ctx.fillStyle = col;
        ctx.fillRect(x, 0, 44, h);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 30, 0, 14, h);
        for (let by = 40; by < h; by += 90) {
          ctx.fillStyle = '#2a1a14';
          ctx.fillRect(x - 2, by, 48, 6);
          ctx.fillStyle = 'rgba(255,140,80,0.25)';
          for (let rx = x + 2; rx < x + 44; rx += 7) ctx.fillRect(rx, by + 2, 1.4, 1.4);
        }
        const gy = h * 0.78;
        ctx.fillStyle = '#0c0402';
        ctx.fillRect(x + 10, gy, 24, 30);
        ctx.fillStyle = 'rgba(255,120,30,0.85)';
        for (let b = 0; b < 5; b++) ctx.fillRect(x + 12 + b * 4.4, gy + 2, 2.2, 26);
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#ff6a1a', x + 22, gy + 15, 36, 30, 0.4);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rim;
        ctx.fillRect(x, 0, 1, h);
      }
      // chains with hooks between the pillars
      const cr = new RNG(seed + 31);
      ctx.strokeStyle = col;
      for (let i = 0; i < 6; i++) {
        const cx = cr.range(0, w), L = cr.range(h * 0.3, h * 0.6);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let y = 0; y < L; y += 5) {
          ctx.moveTo(cx, y);
          ctx.lineTo(cx, y + 3.4);
        }
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + 3, L + 4, 4, Math.PI, Math.PI * 0.2, true);
        ctx.stroke();
      }
    });
  }
  return layers;
}
