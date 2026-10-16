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

/**
 * Quad strip from (x0,y0) width w0 to (x1,y1) width w1, added to the current path.
 * Wound clockwise like arc() and rect(), so overlapping parts fill solid under nonzero.
 */
function taper(ctx: Ctx, x0: number, y0: number, w0: number, x1: number, y1: number, w1: number) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = dy / L, ny = -dx / L;
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

/** Shading for the Image's metals: lit along its sunward edge, the body backlit and dimmer. */
function imageGrad(ctx: Ctx, x0: number, x1: number, c: readonly string[]) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, c[1]);
  g.addColorStop(0.16, c[0]);
  g.addColorStop(0.58, mix(c[0], c[2], 0.55));
  g.addColorStop(1, c[2]);
  return g;
}

/**
 * The Image, standing far off on the plain: head of gold, breast and arms of
 * silver, belly and thighs of brass, legs of iron, feet part iron and part clay
 * (Daniel 2:32-33). Drawn in a frame where the pedestal is 10 units and the
 * figure about 100, scaled so the whole stands H tall; `hz` hazes it toward `haze`.
 */
function imageFigure(ctx: Ctx, cx: number, base: number, H: number, haze: string, hz: number) {
  const k = H / 112;
  const tone = (m: readonly string[]) => [mix(m[0], haze, hz), mix(m[1], haze, hz * 0.4), mix(m[2], haze, hz)];
  const Gd = tone(METAL.gold), Sv = tone(METAL.silver), Br = tone(METAL.brass), Ir = tone(METAL.iron), Cl = tone(METAL.clay);
  const out = mix('#0a0604', haze, hz * 0.6);
  const lw = 0.5;
  ctx.save();
  ctx.translate(cx, base);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  // a stepped pedestal
  const ped = mix('#8a6a48', haze, hz * 0.9);
  for (const [w, y, hh] of [[20, 0, 4], [16.5, -4, 3.5], [13.5, -7.5, 2.5]] as const) {
    ctx.beginPath();
    ctx.rect(-w, y - hh, w * 2, hh);
    ctx.fillStyle = imageGrad(ctx, -w, w, [ped, shade(ped, 0.3), shade(ped, -0.4)]);
    ctx.fill();
    ctx.fillStyle = rgba('#000000', 0.25);
    ctx.fillRect(-w, y - 0.6, w * 2, 0.6);
  }
  ctx.fillStyle = rgba(Gd[0], 0.8);
  ctx.fillRect(-16.5, -5.8, 33, 0.7);
  ctx.translate(0, -10);
  // legs of iron, columnar, with knees
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 8.6, -4.5);
    ctx.lineTo(s * 2.2, -4.5);
    ctx.quadraticCurveTo(s * 1.6, -14, s * 1.8, -19);
    ctx.quadraticCurveTo(s * 1.2, -27, s * 1.2, -35);
    ctx.lineTo(s * 10.2, -35);
    ctx.quadraticCurveTo(s * 10.4, -25, s * 9.4, -19.5);
    ctx.quadraticCurveTo(s * 9.2, -11, s * 8.6, -4.5);
    ctx.closePath();
    solidify(ctx, imageGrad(ctx, s < 0 ? -10.4 : 1.2, s < 0 ? -1.2 : 10.4, Ir), out, lw);
    ctx.strokeStyle = rgba(Ir[2], 0.9);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(s * 5.6, -19.5, 2.4, 1.6, 0, 0, TAU);
    ctx.moveTo(s * 3.2, -9);
    ctx.lineTo(s * 3.6, -15);
    ctx.stroke();
  }
  // feet, part of iron and part of clay
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 11, 0);
    ctx.lineTo(s * 0.6, 0);
    ctx.quadraticCurveTo(s * 0.4, -3.4, s * 2, -5);
    ctx.lineTo(s * 8.8, -5);
    ctx.quadraticCurveTo(s * 11.4, -3.4, s * 11, 0);
    ctx.closePath();
    solidify(ctx, imageGrad(ctx, s < 0 ? -11 : 0.6, s < 0 ? -0.6 : 11, Ir), out, lw);
    ctx.fillStyle = Cl[0];
    ctx.beginPath();
    ctx.moveTo(s * 2.4, 0);
    ctx.lineTo(s * 1.8, -2.6);
    ctx.lineTo(s * 3.6, -3.4);
    ctx.lineTo(s * 4.4, -4.6);
    ctx.lineTo(s * 6.2, -2.6);
    ctx.lineTo(s * 8.4, -3.8);
    ctx.lineTo(s * 10.4, -1.6);
    ctx.lineTo(s * 10.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = Cl[2];
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(s * 3.8, -3);
    ctx.lineTo(s * 4.6, -1.5);
    ctx.lineTo(s * 4.1, 0);
    ctx.moveTo(s * 7.6, -3.2);
    ctx.lineTo(s * 8.3, -1.4);
    ctx.lineTo(s * 9.4, -0.6);
    ctx.stroke();
    ctx.fillStyle = rgba(Cl[1], 0.75);
    ctx.fillRect(s < 0 ? -3.8 : 2.2, -2.8, 1.6, 0.6);
  }
  // the kilt over the thighs, brass, flaring to a fringed hem, with a hanging apron
  ctx.beginPath();
  ctx.moveTo(-10.2, -58);
  ctx.lineTo(10.2, -58);
  ctx.quadraticCurveTo(12.4, -46, 12.8, -34);
  ctx.quadraticCurveTo(0, -31, -12.8, -34);
  ctx.quadraticCurveTo(-12.4, -46, -10.2, -58);
  ctx.closePath();
  solidify(ctx, imageGrad(ctx, -12.8, 12.8, Br), out, lw);
  ctx.strokeStyle = rgba(Br[2], 0.7);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    if (!i) continue;
    ctx.moveTo(i * 2.2, -56);
    ctx.lineTo(i * 2.85, -33.4 + Math.abs(i) * 0.15);
  }
  ctx.stroke();
  ctx.fillStyle = Br[2];
  for (let i = -12; i <= 12; i += 1.2) ctx.fillRect(i, -33.6 + (i * i) / 60 - 0.8, 0.5, 1.8);
  ctx.beginPath();
  ctx.moveTo(-3.2, -57);
  ctx.lineTo(3.2, -57);
  ctx.lineTo(3.6, -31);
  ctx.lineTo(-3.6, -31);
  ctx.closePath();
  solidify(ctx, imageGrad(ctx, -3.6, 3.6, Br), out, lw * 0.8);
  ctx.fillStyle = Br[1];
  for (let i = 0; i < 3; i++) ctx.fillRect(-2.4, -52 + i * 6.5, 4.8, 0.6);
  // belly of brass, and the belt
  ctx.beginPath();
  ctx.moveTo(-10.6, -66);
  ctx.lineTo(10.6, -66);
  ctx.quadraticCurveTo(10.6, -61, 10.2, -57);
  ctx.lineTo(-10.2, -57);
  ctx.quadraticCurveTo(-10.6, -61, -10.6, -66);
  ctx.closePath();
  solidify(ctx, imageGrad(ctx, -10.6, 10.6, Br), out, lw);
  ctx.strokeStyle = rgba(Br[2], 0.75);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(0, -65.5);
  ctx.lineTo(0, -60);
  ctx.moveTo(-4.6, -62.4);
  ctx.quadraticCurveTo(0, -61.2, 4.6, -62.4);
  ctx.stroke();
  ctx.fillStyle = Br[2];
  ctx.fillRect(-10.6, -59.4, 21.2, 2);
  ctx.fillStyle = Br[1];
  ctx.fillRect(-1.6, -60, 3.2, 3.2);
  // arms of silver, heavy at the shoulder, fists at the hips
  for (const s of [-1, 1]) {
    ctx.beginPath();
    taper(ctx, s * 13.6, -75.5, 7, s * 15.4, -62.5, 5.2);
    taper(ctx, s * 15.4, -62.5, 5, s * 13.8, -50.5, 4.2);
    ctx.moveTo(s * 13.8 + 2.8, -49);
    ctx.arc(s * 13.8, -49, 2.8, 0, TAU);
    ctx.moveTo(s * 13.4 + 4.6, -75.6);
    ctx.arc(s * 13.4, -75.6, 4.6, 0, TAU);
    solidify(ctx, imageGrad(ctx, s < 0 ? -19 : 9, s < 0 ? -9 : 19, Sv), out, lw);
    ctx.strokeStyle = rgba(Sv[2], 0.8);
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(s * 13, -63.2);
    ctx.lineTo(s * 17.4, -62);
    ctx.moveTo(s * 12.2, -49.8);
    ctx.lineTo(s * 15.2, -49.4);
    ctx.stroke();
  }
  // breast of silver
  ctx.beginPath();
  ctx.moveTo(-13.6, -79);
  ctx.lineTo(13.6, -79);
  ctx.quadraticCurveTo(13, -70, 10.6, -66);
  ctx.lineTo(-10.6, -66);
  ctx.quadraticCurveTo(-13, -70, -13.6, -79);
  ctx.closePath();
  solidify(ctx, imageGrad(ctx, -13.6, 13.6, Sv), out, lw);
  ctx.strokeStyle = rgba(Sv[2], 0.85);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-9, -72);
  ctx.quadraticCurveTo(-4.5, -69.4, -0.5, -72.2);
  ctx.moveTo(9, -72);
  ctx.quadraticCurveTo(4.5, -69.4, 0.5, -72.2);
  ctx.moveTo(0, -77);
  ctx.lineTo(0, -67);
  ctx.stroke();
  // neck, head and square-cut beard of gold
  ctx.beginPath();
  ctx.rect(-3.2, -83, 6.4, 5);
  ctx.moveTo(5.2, -88.5);
  ctx.ellipse(0, -88.5, 5.2, 6, 0, 0, TAU);
  solidify(ctx, imageGrad(ctx, -5.2, 5.2, Gd), out, lw);
  ctx.beginPath();
  ctx.moveTo(-5, -86.5);
  ctx.lineTo(5, -86.5);
  ctx.lineTo(4.5, -78);
  ctx.lineTo(0, -76.8);
  ctx.lineTo(-4.5, -78);
  ctx.closePath();
  solidify(ctx, imageGrad(ctx, -5, 5, Gd), out, lw * 0.8);
  ctx.strokeStyle = rgba(Gd[2], 0.85);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(-4.6 + i * 0.12, -84.6 + i * 2);
    ctx.lineTo(4.6 - i * 0.12, -84.6 + i * 2);
  }
  for (let i = -3; i <= 3; i += 1.5) {
    ctx.moveTo(i, -84.6);
    ctx.lineTo(i * 0.95, -78);
  }
  ctx.stroke();
  ctx.fillStyle = Gd[2];
  ctx.fillRect(-3.2, -90, 2.2, 0.8);
  ctx.fillRect(1, -90, 2.2, 0.8);
  ctx.fillRect(-0.4, -89, 0.8, 2.6);
  // the horned crown, tall, banded with rosettes
  ctx.beginPath();
  ctx.moveTo(-5.4, -92.5);
  ctx.lineTo(5.4, -92.5);
  ctx.lineTo(6.2, -104);
  ctx.lineTo(-6.2, -104);
  ctx.closePath();
  for (const s of [-1, 1])
    for (const hy of [-94, -98.5]) {
      ctx.moveTo(s * 5.4, hy);
      ctx.quadraticCurveTo(s * 9.6, hy - 0.6, s * 8.8, hy - 4.6);
      ctx.lineTo(s * 7.8, hy - 4.2);
      ctx.quadraticCurveTo(s * 7.8, hy - 1.8, s * 5.4, hy - 1.6);
      ctx.closePath();
    }
  solidify(ctx, imageGrad(ctx, -9.6, 9.6, Gd), out, lw);
  ctx.fillStyle = Gd[2];
  ctx.fillRect(-5.6, -96.4, 11.2, 1);
  ctx.fillRect(-5.9, -100.6, 11.8, 0.8);
  for (let i = -4; i <= 4; i += 2) circle(ctx, i, -104.6, 0.8, Gd[1]);
  // the sun on the gold: the head of the Image shines across the plain
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffb84a', -1, -92, 22, 22, 0.5 * (1 - hz * 0.5));
  blob(ctx, '#fff0c0', -2.8, -96, 5, 5, 0.8 * (1 - hz * 0.4));
  ctx.fillStyle = rgba('#fff6d8', 0.8 * (1 - hz * 0.4));
  ctx.fillRect(-3.05, -107, 0.5, 11);
  ctx.fillRect(-8.3, -96.2, 11, 0.5);
  // and a sunward rim down the whole figure
  ctx.strokeStyle = rgba('#ffc890', 0.4 * (1 - hz));
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-17.6, -76);
  ctx.lineTo(-19.4, -62.5);
  ctx.lineTo(-17.6, -50);
  ctx.moveTo(-12.8, -34);
  ctx.lineTo(-12.4, -46);
  ctx.moveTo(-10.2, -32);
  ctx.lineTo(-9.4, -19.5);
  ctx.lineTo(-8.6, -4.5);
  ctx.stroke();
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
  // soft cloud banks, their undersides lit by the sun
  for (let i = 0; i < 5; i++) {
    const y = h * (0.14 + i * 0.07);
    const x = ((t * (2 + i) * k * 2 + hash2(i, 21) * w) % (w + 900 * k)) - 450 * k;
    const len = (170 + hash2(i, 23) * 170) * k, th = (12 + i * 4) * k;
    blob(ctx, i < 2 ? '#1e1036' : '#3a1634', x, y, len, th, 0.7);
    blob(ctx, i < 2 ? '#1e1036' : '#3a1634', x + len * 0.55, y + th * 0.3, len * 0.6, th * 0.8, 0.55);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, i < 2 ? '#c05a6a' : '#ff8a4a', x + len * 0.15, y + th * 0.55, len * 0.85, th * 0.35, 0.18 + i * 0.05);
    ctx.globalCompositeOperation = 'source-over';
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
  // cloud drifting past the moon, silvered along the top
  for (let i = 0; i < 4; i++) {
    const y = h * (0.1 + i * 0.075);
    const x = ((t * (3 + i * 1.5) * k * 3 + hash2(i, 31) * w) % (w + 800 * k)) - 400 * k;
    const len = (160 + hash2(i, 33) * 160) * k, th = (14 + i * 4) * k;
    blob(ctx, '#0c0c22', x, y, len, th, 0.75);
    blob(ctx, '#0c0c22', x + len * 0.5, y - th * 0.2, len * 0.55, th * 0.75, 0.6);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#8a94d0', x - len * 0.1, y - th * 0.55, len * 0.7, th * 0.3, 0.14);
    ctx.globalCompositeOperation = 'source-over';
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
      const c0 = camp ? 60 : 20, c1 = camp ? 560 : 300, zx = camp ? 150 : 140;
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
        imageFigure(ctx, 372, hz + 3, 116, haze, 0.3);
      } else if (img > 0) {
        imageFigure(ctx, 520, hz + 1, 28, haze, 0.6);
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#ffd070', 520, hz - 25, 9, 9, 0.6);
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

// ---------------------------------------------------------------- tiles

/** Solid tiles: sandstone and baked mud brick under sand, blue-glazed brick, soot-black furnace brick. */
export function drawSolidCh4(ctx: Ctx, biome: Ch4Biome, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
  if (t === T.Seal) base = '#7a5a28';
  if (t === T.Wood) base = pal.plat;
  const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  ctx.fillStyle = mix(dark, '#000000', v * 0.1);
  ctx.fillRect(x, y, TILE, TILE);
  if (biome === 'dura') duraTile(ctx, pal, x, y, tx, ty, depth, v, up, dn, lf, rt);
  else if (biome === 'babylon') babylonTile(ctx, pal, x, y, tx, ty, depth, v, up, dn, lf, rt);
  else furnaceTile(ctx, pal, x, y, tx, ty, depth, v, up, dn, lf, rt);
}

function edges(ctx: Ctx, x: number, y: number, dn: boolean, lf: boolean, rt: boolean, lit: string) {
  if (!dn) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + TILE - 2.5, TILE, 2.5);
  }
  if (!lf) {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, 1.6, TILE);
  }
  if (!rt) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + TILE - 1.8, y, 1.8, TILE);
  }
}

/** Four courses of half-tile bricks, offset course to course; returns nothing, strokes the joints. */
function tileCourses(ctx: Ctx, x: number, y: number, ty: number, mortar: string, lw: number) {
  ctx.strokeStyle = mortar;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let r = 0; r < 4; r++) {
    const yy = y + r * 4;
    ctx.moveTo(x, yy + lw * 0.5);
    ctx.lineTo(x + TILE, yy + lw * 0.5);
    const off = (ty * 4 + r) & 1 ? 4 : 0;
    for (let c = off; c < TILE; c += 8) {
      ctx.moveTo(x + c + lw * 0.5, yy);
      ctx.lineTo(x + c + lw * 0.5, yy + 4);
    }
  }
  ctx.stroke();
}

/** A few bricks of the tile tinted lighter or darker, keyed to global brick indices so walls vary smoothly. */
function brickTints(ctx: Ctx, x: number, y: number, tx: number, ty: number, seed: number, lite: string, dark: string, p: number) {
  for (let r = 0; r < 4; r++) {
    const off = (ty * 4 + r) & 1 ? 4 : 0;
    for (let c = -off; c < TILE; c += 8) {
      const gx = tx * 2 + ((c + off) >> 3), gy = ty * 4 + r;
      const hsh = hash2(gx, gy, seed);
      if (hsh > p) continue;
      ctx.fillStyle = hsh < p * 0.5 ? lite : dark;
      const a = Math.max(c, 0), b = Math.min(c + 8, TILE);
      ctx.fillRect(x + a, y + r * 4, b - a, 4);
    }
  }
}

function duraTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  if (depth <= 1) {
    if (hash2(tx >> 2, ty >> 1, 71) < 0.32) {
      // dressed sandstone, two courses of long blocks with chisel marks
      ctx.strokeStyle = 'rgba(40,24,10,0.4)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y + 0.35);
      ctx.lineTo(x + TILE, y + 0.35);
      ctx.moveTo(x, y + 8.35);
      ctx.lineTo(x + TILE, y + 8.35);
      const o1 = (tx + ty) & 1 ? 6 : 12, o2 = (tx + ty) & 1 ? 13 : 3;
      ctx.moveTo(x + o1, y);
      ctx.lineTo(x + o1, y + 8);
      ctx.moveTo(x + o2, y + 8);
      ctx.lineTo(x + o2, y + 16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,236,200,0.12)';
      ctx.fillRect(x, y + 1, TILE, 0.8);
      ctx.fillRect(x, y + 9, TILE, 0.8);
      ctx.strokeStyle = 'rgba(60,36,16,0.22)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const cx = x + 1 + hash2(tx, ty * 5 + i, 72) * 13, cy = y + 2 + hash2(tx, ty * 5 + i, 73) * 12;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 1.6, cy + 1.2);
      }
      ctx.stroke();
    } else {
      // baked mud brick laid in bitumen, a reed mat every few courses
      brickTints(ctx, x, y, tx, ty, 74, 'rgba(255,220,170,0.1)', 'rgba(60,30,10,0.16)', 0.4);
      tileCourses(ctx, x, y, ty, 'rgba(36,20,10,0.5)', 0.65);
      if (ty % 3 === 0) {
        ctx.fillStyle = 'rgba(214,180,110,0.45)';
        ctx.fillRect(x, y + 0.2, TILE, 0.7);
      }
      if (hash2(tx, ty, 75) < 0.035) {
        // a king's stamp on a brick
        ctx.strokeStyle = 'rgba(40,22,10,0.5)';
        ctx.lineWidth = 0.4;
        ctx.strokeRect(x + 2.5, y + 4.8, 4.6, 2.6);
        ctx.fillStyle = 'rgba(40,22,10,0.45)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 3.1 + i, y + 5.4 + (i & 1) * 0.8, 0.5, 0.7);
      }
    }
    ctx.fillStyle = rgba('#fff0d0', 0.03 + v * 0.04);
    ctx.fillRect(x + 1, y + 1, 6, 2);
  }
  if (!up) {
    // a drift of sand over the top, spilling down the open sides
    ctx.fillStyle = shade(pal.cap, -0.22);
    ctx.fillRect(x, y, TILE, 4.4);
    ctx.fillStyle = pal.cap;
    ctx.beginPath();
    ctx.moveTo(x, y - 0.8);
    ctx.lineTo(x + TILE, y - 0.8);
    for (let i = 4; i >= 0; i--) ctx.lineTo(x + i * 4, y + 2.4 + hash2(tx * 5 + i, ty, 81) * 1.8);
    ctx.closePath();
    ctx.fill();
    if (!lf) {
      ctx.beginPath();
      ctx.moveTo(x, y - 0.8);
      ctx.quadraticCurveTo(x - 1.5, y + 3, x + 0.6, y + 7 + v * 3);
      ctx.lineTo(x + 3, y + 2);
      ctx.fill();
    }
    if (!rt) {
      ctx.beginPath();
      ctx.moveTo(x + TILE, y - 0.8);
      ctx.quadraticCurveTo(x + TILE + 1.5, y + 3, x + TILE - 0.6, y + 6 + v * 3);
      ctx.lineTo(x + TILE - 3, y + 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,210,0.38)';
    ctx.fillRect(x, y - 0.8, TILE, 0.8);
    // wind ripples
    ctx.strokeStyle = 'rgba(140,100,50,0.3)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    const rx = x + 2 + hash2(tx, ty, 82) * 8;
    ctx.moveTo(rx, y + 1.4);
    ctx.quadraticCurveTo(rx + 2, y + 0.6, rx + 4, y + 1.4);
    ctx.stroke();
    const k = hash2(tx, ty, 83);
    if (k < 0.18) {
      // dry grass
      ctx.strokeStyle = pal.capTuft;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const gx = x + 3 + hash2(tx, ty, 84) * 10;
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + i * 1.2, y - 2.5 - (2 - Math.abs(i)) * 1.2);
      }
      ctx.stroke();
    } else if (k < 0.3) {
      ellipse(ctx, x + 4 + hash2(tx, ty, 85) * 8, y - 0.3, 1.4, 0.9, 0, shade(pal.stone, -0.25));
      ellipse(ctx, x + 4 + hash2(tx, ty, 85) * 8 - 0.4, y - 0.7, 0.6, 0.3, 0, 'rgba(255,240,210,0.5)');
    }
  }
  edges(ctx, x, y, dn, lf, rt, 'rgba(255,220,170,0.1)');
}

function babylonTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  if (depth <= 1) {
    if (ty % 6 === 2 && up) {
      // a frieze of rosettes running through the wall
      ctx.fillStyle = GLAZE_DK;
      ctx.fillRect(x, y + 2, TILE, 12);
      ctx.fillStyle = '#c8962e';
      ctx.fillRect(x, y + 2, TILE, 1);
      ctx.fillRect(x, y + 13, TILE, 1);
      rosette(ctx, x + 8, y + 8, 4.2);
    } else {
      brickTints(ctx, x, y, tx, ty, 91, 'rgba(110,170,240,0.16)', 'rgba(0,10,40,0.22)', 0.45);
      // the glaze catches light on each brick's upper edge
      ctx.fillStyle = 'rgba(170,215,255,0.16)';
      for (let r = 0; r < 4; r++) ctx.fillRect(x, y + r * 4 + 0.7, TILE, 0.6);
      tileCourses(ctx, x, y, ty, 'rgba(6,14,34,0.7)', 0.6);
      if (hash2(tx, ty, 92) < 0.06) {
        // a chipped brick showing the clay under the glaze
        const cx = x + ((hash2(tx, ty, 93) * 2) | 0) * 8, cy = y + ((hash2(tx, ty, 94) * 4) | 0) * 4;
        ctx.fillStyle = '#6a4a30';
        ctx.beginPath();
        ctx.moveTo(cx + 1, cy + 0.8);
        ctx.lineTo(cx + 5, cy + 0.6);
        ctx.lineTo(cx + 3.6, cy + 3.4);
        ctx.lineTo(cx + 1.4, cy + 3);
        ctx.fill();
      }
    }
  }
  if (!up) {
    // ochre cap with a gold edge and a bead line
    ctx.fillStyle = '#7a5418';
    ctx.fillRect(x, y, TILE, 4.6);
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 3.4);
    ctx.fillStyle = GOLD_HI;
    ctx.fillRect(x, y, TILE, 0.8);
    ctx.fillStyle = GOLD;
    for (let i = 0; i < 4; i++) circle(ctx, x + 2 + i * 4, y + 4.6, 0.75, GOLD);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + 5.4, TILE, 0.7);
  }
  edges(ctx, x, y, dn, lf, rt, 'rgba(140,190,255,0.13)');
}

function furnaceTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  if (depth <= 1) {
    brickTints(ctx, x, y, tx, ty, 101, 'rgba(150,110,90,0.12)', 'rgba(0,0,0,0.25)', 0.45);
    tileCourses(ctx, x, y, ty, 'rgba(0,0,0,0.6)', 0.7);
    if (hash2(tx, ty, 102) < 0.3) {
      // heat working through the mortar: a run along a joint, then down
      const r = 1 + ((hash2(tx, ty, 103) * 3) | 0), yy = y + r * 4;
      const a = x + hash2(tx, ty, 104) * 6, b = a + 5 + hash2(tx, ty, 105) * 6;
      const off = (ty * 4 + r) & 1 ? 4 : 0;
      const jx = x + off + (b - x > 8 + off ? 8 : 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [lw, c] of [[2.4, 'rgba(255,70,10,0.22)'], [0.7, 'rgba(255,170,70,0.85)']] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(a, yy);
        ctx.lineTo(b, yy);
        if (jx > a && jx < b) {
          ctx.moveTo(jx, yy);
          ctx.lineTo(jx, yy + 4);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = rgba('#ffd0b0', 0.02 + v * 0.03);
    ctx.fillRect(x + 1, y + 1, 6, 2);
  }
  if (!up) {
    // charred top, ash settled on it, a stray ember
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(x, y, TILE, 4);
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 2.8);
    ctx.fillStyle = 'rgba(210,190,170,0.28)';
    ctx.fillRect(x, y, TILE, 0.8);
    ctx.fillStyle = 'rgba(160,150,140,0.35)';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + hash2(tx, i, 106) * 14, y - 0.5, 1.2 + hash2(tx, i, 107), 0.6);
    if (hash2(tx, ty, 108) < 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      const ex = x + 2 + hash2(tx, ty, 109) * 12;
      blob(ctx, EMBER, ex, y + 0.5, 4, 3, 0.5);
      ctx.fillStyle = EMBER_HI;
      ctx.fillRect(ex - 0.5, y, 1, 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (!dn && hash2(tx, ty, 110) < 0.3) {
    // soot drips under a ledge
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const dx = x + 3 + hash2(tx, ty, 111) * 10;
    ctx.beginPath();
    ctx.moveTo(dx - 1.6, y + TILE);
    ctx.quadraticCurveTo(dx, y + TILE + 6 + v * 4, dx + 1.6, y + TILE);
    ctx.fill();
  }
  edges(ctx, x, y, dn, lf, rt, 'rgba(255,120,60,0.1)');
}

/** One-way platforms: lashed palm logs, cedar beams with bronze bands, iron grate catwalks. */
export function drawOneWayCh4(ctx: Ctx, biome: Ch4Biome, pal: BiomePal, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'furnace') {
    ctx.fillStyle = '#2c2626';
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = 'rgba(255,200,160,0.28)';
    ctx.fillRect(x, y, TILE, 0.6);
    ctx.fillStyle = '#1c1717';
    for (let i = 0.6; i < TILE; i += 2) ctx.fillRect(x + i, y + 2, 0.9, 2.8);
    ctx.fillStyle = '#2a2424';
    ctx.fillRect(x, y + 4.8, TILE, 1.3);
    ctx.fillStyle = 'rgba(255,220,190,0.35)';
    ctx.fillRect(x + 3.6, y + 0.7, 0.8, 0.8);
    ctx.fillRect(x + 11.6, y + 0.7, 0.8, 0.8);
    // truss underneath, warmed from below
    ctx.strokeStyle = '#1a1414';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x + 8, y + 10.5);
    ctx.lineTo(x + 16, y + 6);
    ctx.moveTo(x, y + 10.5);
    ctx.lineTo(x + 16, y + 10.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,100,40,0.3)';
    ctx.fillRect(x, y + 10.9, TILE, 0.5);
    if (l || r) {
      const bx = l ? x : x + TILE - 3;
      ctx.fillStyle = '#2c2626';
      ctx.fillRect(bx, y - 1, 3, 13);
      ctx.fillStyle = 'rgba(255,200,160,0.25)';
      ctx.fillRect(bx + 1, y + 2, 1, 1);
      ctx.fillRect(bx + 1, y + 8, 1, 1);
    }
    return;
  }
  if (biome === 'babylon') {
    // a cedar beam
    ctx.fillStyle = '#3a200e';
    ctx.fillRect(x, y, TILE, 6);
    ctx.fillStyle = '#7a4824';
    ctx.fillRect(x, y, TILE, 4.8);
    ctx.strokeStyle = 'rgba(40,18,6,0.45)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    const w0 = hash2(tx, ty, 121) * 1.2;
    ctx.moveTo(x, y + 1.8 + w0);
    ctx.quadraticCurveTo(x + 8, y + 1.2 + w0, x + 16, y + 1.8 + hash2(tx + 1, ty, 121) * 1.2);
    ctx.moveTo(x, y + 3.4);
    ctx.lineTo(x + 16, y + 3.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,160,0.3)';
    ctx.fillRect(x, y, TILE, 0.8);
    if (tx % 3 === 0) {
      ctx.fillStyle = '#8a6420';
      ctx.fillRect(x + 6, y - 0.3, 2.6, 6.4);
      ctx.fillStyle = GOLD_HI;
      ctx.fillRect(x + 6, y - 0.3, 2.6, 0.6);
      ctx.fillRect(x + 6.9, y + 2.5, 0.8, 0.8);
    }
    if (l || r) {
      // end grain, and a carved corbel holding it
      const ex = l ? x + 0.5 : x + TILE - 0.5;
      ellipse(ctx, ex, y + 3, 1.4, 3, 0, '#9a6236');
      ctx.strokeStyle = 'rgba(60,30,10,0.6)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.ellipse(ex, y + 3, 0.7, 1.6, 0, 0, TAU);
      ctx.stroke();
      const bx = l ? x + 1 : x + TILE - 7;
      ctx.fillStyle = '#4a2a12';
      ctx.fillRect(bx, y + 6, 6, 2);
      ctx.fillRect(bx + (l ? 0 : 2), y + 8, 4, 2);
      ctx.fillRect(bx + (l ? 0 : 4), y + 10, 2, 2);
    }
    return;
  }
  // dura: palm logs lashed with rope
  ctx.fillStyle = '#3e2a16';
  ctx.fillRect(x, y, TILE, 5.4);
  ctx.fillStyle = pal.plat;
  ctx.fillRect(x, y, TILE, 3.8);
  ctx.strokeStyle = 'rgba(40,24,10,0.45)';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (let i = 1; i < TILE; i += 3) {
    ctx.moveTo(x + i, y + 1.2);
    ctx.lineTo(x + i + 1.6, y + 3.4);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,180,0.28)';
  ctx.fillRect(x, y, TILE, 0.8);
  if ((tx & 1) === 0) {
    ctx.strokeStyle = '#c8a46a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 0.3);
    ctx.lineTo(x + 7.6, y + 5.6);
    ctx.moveTo(x + 8, y - 0.3);
    ctx.lineTo(x + 9.6, y + 5.6);
    ctx.stroke();
  }
  if (l || r) {
    const ex = l ? x + 1 : x + TILE - 1;
    ellipse(ctx, ex, y + 2.7, 1.5, 2.7, 0, '#a07848');
    ctx.strokeStyle = 'rgba(70,40,16,0.6)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.ellipse(ex, y + 2.7, 0.7, 1.4, 0, 0, TAU);
    ctx.stroke();
    // a post under the end
    ctx.fillStyle = '#4a321c';
    ctx.fillRect(l ? x + 2 : x + TILE - 4.5, y + 5.4, 2.5, 8);
  }
}

/** Red-hot iron spikes in the furnace (other biomes keep the shared spikes). */
export function drawSpikesCh4(ctx: Ctx, biome: Ch4Biome, tx: number, ty: number): boolean {
  if (biome !== 'furnace') return false;
  const x = tx * TILE, y = ty * TILE;
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4 + 2, tip = y + 4 + hash2(tx, i) * 3;
    ctx.beginPath();
    ctx.moveTo(sx - 2, y + TILE);
    ctx.lineTo(sx, tip);
    ctx.lineTo(sx + 2, y + TILE);
    ctx.closePath();
    ctx.fillStyle = '#2a2222';
    ctx.fill();
    ctx.strokeStyle = '#0a0606';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = '#ff7a2a';
    ctx.beginPath();
    ctx.moveTo(sx - 0.9, tip + 3.6);
    ctx.lineTo(sx, tip);
    ctx.lineTo(sx + 0.9, tip + 3.6);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, EMBER, x + 8, y + 7, 12, 7, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}

// ---------------------------------------------------------------- liquids

/** Molten slag for the furnace's veil pools, the muddy river on the plain. False for anything else. */
export function drawLiquidCh4(ctx: Ctx, biome: Biome, tt: T, x: number, y: number, top: boolean, tx: number, t: number): boolean {
  if (biome === 'furnace' && tt === T.Veil) {
    const wy = top ? Math.sin(t * 1.3 + tx * 0.9) * 0.5 + 2 : 0;
    ctx.fillStyle = '#9a2408';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    ctx.fillStyle = '#ff7414';
    ctx.fillRect(x, y + wy, TILE, Math.min(7, TILE - wy));
    if (top) {
      // dark crust plates drifting on the melt
      const drift = t * 3.2;
      const k0 = Math.floor((x - drift) / 11) - 1, k1 = Math.floor((x + TILE - drift) / 11);
      ctx.fillStyle = '#4a1606';
      for (let k = k0; k <= k1; k++) {
        const pw = 4 + hash2(k, 0, 131) * 4, px = k * 11 + drift + hash2(k, 0, 132) * 3;
        const a = Math.max(px, x), b = Math.min(px + pw, x + TILE);
        if (b > a) ctx.fillRect(a, y + wy + 0.9, b - a, 1.5 + hash2(k, 0, 133));
      }
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(x, y + wy, TILE, 0.8);
      // a bubble swells and bursts
      const ph = (t * 0.55 + hash2(tx, 0, 134)) % 1;
      const cyc = Math.floor(t * 0.55 + hash2(tx, 0, 134));
      const bx = x + 3 + hash2(tx, cyc, 135) * 10;
      if (ph < 0.78) {
        const r = 0.6 + (ph / 0.78) * 2.4;
        ctx.fillStyle = '#ffb030';
        ctx.beginPath();
        ctx.arc(bx, y + wy + 0.6, r, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,250,210,0.8)';
        ctx.fillRect(bx - r * 0.5, y + wy + 0.6 - r * 0.75, r * 0.5, 0.5);
      } else {
        const q = (ph - 0.78) / 0.22;
        ctx.strokeStyle = rgba('#ffe680', 1 - q);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(bx, y + wy + 0.6, 1.5 + q * 4, 0.6 + q, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ffd060';
        ctx.fillRect(bx - 2 - q * 2, y + wy - q * 6 + q * q * 5, 0.9, 0.9);
        ctx.fillRect(bx + 1.5 + q * 2, y + wy - q * 7 + q * q * 6, 0.9, 0.9);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, EMBER, x + 8, y + wy + 2, 16, top ? 12 : 9, top ? 0.4 : 0.2);
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  if (biome === 'dura' && tt === T.Water) {
    const wy = top ? Math.sin(t * 1.4 + tx * 0.7) * 0.6 + 5 : 0;
    ctx.fillStyle = 'rgba(44,66,58,0.92)';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    ctx.fillStyle = 'rgba(80,64,36,0.4)';
    ctx.fillRect(x, y + Math.max(wy, 10), TILE, TILE - Math.max(wy, 10));
    if (top) {
      // the dusk sky in the water, a glint sliding downstream
      ctx.fillStyle = 'rgba(226,140,84,0.35)';
      ctx.fillRect(x, y + wy, TILE, 1.8);
      ctx.fillStyle = 'rgba(255,214,160,0.6)';
      ctx.fillRect(x, y + wy, TILE, 0.6);
      const g = (t * 5 + tx * 13) % 40;
      if (g < TILE) {
        ctx.fillStyle = 'rgba(255,220,170,0.5)';
        ctx.fillRect(x + g, y + wy + 2.4, 3, 0.5);
      }
      if (hash2(tx, 0, 141) < 0.65) {
        // reeds standing in the shallows
        const n = 2 + ((hash2(tx, 0, 142) * 2) | 0);
        ctx.strokeStyle = '#3e4a26';
        ctx.lineWidth = 0.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const rx = x + 2 + hash2(tx, i, 143) * 12, rh = 9 + hash2(tx, i, 144) * 14;
          const sw = Math.sin(t * 1.3 + rx * 0.2) * 1.4;
          ctx.moveTo(rx, y + wy + 3);
          ctx.quadraticCurveTo(rx, y + wy - rh * 0.5, rx + sw, y + wy - rh);
        }
        ctx.stroke();
        ctx.fillStyle = '#5a3418';
        for (let i = 0; i < n; i += 2) {
          const rx = x + 2 + hash2(tx, i, 143) * 12, rh = 9 + hash2(tx, i, 144) * 14;
          const sw = Math.sin(t * 1.3 + rx * 0.2) * 1.4;
          ctx.beginPath();
          ctx.ellipse(rx + sw * 0.9, y + wy - rh + 2.5, 0.9, 2.4, 0, 0, TAU);
          ctx.fill();
        }
        // rings where the stems meet the water
        ctx.strokeStyle = 'rgba(255,214,170,0.25)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        const rx = x + 2 + hash2(tx, 0, 143) * 12;
        ctx.ellipse(rx, y + wy + 0.6, 2 + Math.sin(t * 2 + tx) * 0.6, 0.6, 0, 0, TAU);
        ctx.stroke();
      }
    }
    return true;
  }
  return false;
}

/** Ishtar Gate rosette: white petals around a gold heart. */
function rosette(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = '#e8e2cc';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55;
    ctx.moveTo(px + r * 0.42, py);
    ctx.ellipse(px, py, r * 0.42, r * 0.22, a, 0, TAU);
  }
  ctx.fill();
  circle(ctx, x, y, r * 0.3, GOLD);
  circle(ctx, x - r * 0.08, y - r * 0.08, r * 0.12, GOLD_HI);
}

// ---------------------------------------------------------------- props

type PropFn = (ctx: Ctx, e: Decor, pal: BiomePal, rng: RNG) => void;

const LION = '#e4b64c';
const LION_HI = 'rgba(255,246,206,0.75)';
const LION_SH = 'rgba(120,64,10,0.5)';
const RELIEF_OUT = '#08122a';

/** A striding lion in glazed relief, feet on y, facing dir; s = 1 is 40 units nose to tail. */
function lionRelief(ctx: Ctx, x: number, y: number, s: number, dir: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  ctx.beginPath();
  ctx.ellipse(-3, -12, 13, 5.2, -0.04, 0, TAU);
  ctx.moveTo(12.5, -12.5);
  ctx.ellipse(7, -12.5, 5.5, 6.2, 0, 0, TAU);
  taper(ctx, -13, -12, 7, -16, -4.5, 3.6);
  taper(ctx, -16, -4.5, 3.4, -17.6, -0.6, 3);
  taper(ctx, -8.6, -11, 6, -8, -4, 3.4);
  taper(ctx, -8, -4, 3.2, -7.2, -0.6, 3);
  taper(ctx, 5, -11, 4.6, 4, -4, 3.2);
  taper(ctx, 4, -4, 3.2, 3.6, -0.6, 3);
  taper(ctx, 9, -11, 4.6, 12.4, -4, 3.2);
  taper(ctx, 12.4, -4, 3.2, 14, -0.6, 3);
  for (const px of [-17.2, -6.4, 4.6, 15]) {
    ctx.moveTo(px + 2.6, -1);
    ctx.ellipse(px, -1, 2.6, 1.2, 0, 0, TAU);
  }
  taper(ctx, -15, -14.5, 2, -20, -18.5, 1.5);
  taper(ctx, -20, -18.5, 1.5, -20.6, -23, 1.2);
  ctx.moveTo(-18.6, -24.4);
  ctx.ellipse(-20.4, -24.4, 1.8, 2.6, 0.3, 0, TAU);
  ctx.moveTo(16.5, -16.5);
  ctx.ellipse(10, -16.5, 6.5, 8, -0.25, 0, TAU);
  ctx.moveTo(18.8, -18);
  ctx.ellipse(14.6, -18, 4.2, 3.7, 0, 0, TAU);
  ctx.moveTo(20.8, -16.6);
  ctx.ellipse(18, -16.6, 2.8, 2.1, 0.1, 0, TAU);
  solidify(ctx, LION, RELIEF_OUT, 0.45);
  // the mane, a shade deeper, combed back in locks
  ctx.beginPath();
  ctx.ellipse(10, -16.5, 6.2, 7.6, -0.25, 0, TAU);
  ctx.fillStyle = '#d2943a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,52,8,0.55)';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.55 + (i / 8) * Math.PI * 1.1;
    ctx.moveTo(12.5 + Math.cos(a) * 2.5, -17.5 + Math.sin(a) * 3);
    ctx.lineTo(10 + Math.cos(a) * 6.4, -16.5 + Math.sin(a) * 7.4);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(14.6, -18, 3.9, 3.4, 0, 0, TAU);
  ctx.ellipse(18, -16.6, 2.5, 1.8, 0.1, 0, TAU);
  ctx.fillStyle = LION;
  ctx.fill();
  // snarl, eye and ear
  ctx.fillStyle = RELIEF_OUT;
  ctx.beginPath();
  ctx.moveTo(20.6, -15.9);
  ctx.lineTo(16.6, -15.3);
  ctx.lineTo(20.2, -14.2);
  ctx.fill();
  ctx.fillStyle = '#fff6e0';
  ctx.fillRect(19, -15.7, 0.5, 0.6);
  ctx.fillRect(18, -15.5, 0.5, 0.5);
  circle(ctx, 15.6, -19.2, 0.65, RELIEF_OUT);
  ctx.beginPath();
  ctx.arc(12.6, -21.4, 1.4, Math.PI, 0);
  ctx.fillStyle = LION;
  ctx.fill();
  // light along the back, shadow under the belly, muscle at hip and shoulder
  ctx.lineCap = 'round';
  ctx.strokeStyle = LION_HI;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-14, -15.4);
  ctx.quadraticCurveTo(-5, -18.2, 3.5, -17.2);
  ctx.stroke();
  ctx.strokeStyle = LION_SH;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-12, -7.6);
  ctx.quadraticCurveTo(-3, -6, 6, -7.4);
  ctx.moveTo(-14.5, -13);
  ctx.quadraticCurveTo(-11, -9, -12.6, -6);
  ctx.moveTo(6.4, -14);
  ctx.quadraticCurveTo(9.2, -10, 7.6, -6.4);
  ctx.stroke();
  ctx.restore();
}

/** The mušḫuššu of the Ishtar Gate: serpent head and horn, lion forelegs, eagle talons, a scorpion's tail. */
function dragonRelief(ctx: Ctx, x: number, y: number, s: number, dir: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  ctx.beginPath();
  ctx.ellipse(-3, -12.5, 11, 4.4, -0.05, 0, TAU);
  taper(ctx, 5.5, -13.5, 5.4, 12, -23, 3.2);
  ctx.moveTo(19, -24.2);
  ctx.ellipse(15, -24.2, 4.2, 2.2, 0.08, 0, TAU);
  taper(ctx, 13, -25.6, 1.4, 9.6, -29.6, 0.7);
  taper(ctx, 5, -11, 3.8, 6.4, -4.2, 2.6);
  taper(ctx, 6.4, -4.2, 2.6, 7.4, -0.8, 2.4);
  taper(ctx, 1.6, -11, 3.6, 0.6, -4.2, 2.6);
  taper(ctx, 0.6, -4.2, 2.6, 0.4, -0.8, 2.4);
  ctx.moveTo(9.6, -0.9);
  ctx.ellipse(7.8, -0.9, 2.2, 1, 0, 0, TAU);
  ctx.moveTo(2.6, -0.9);
  ctx.ellipse(0.8, -0.9, 2.2, 1, 0, 0, TAU);
  taper(ctx, -10, -11, 4.6, -12.2, -5, 2.4);
  taper(ctx, -12.2, -5, 2.2, -11.2, -0.6, 1.6);
  taper(ctx, -6, -11, 4, -6.4, -5, 2.2);
  taper(ctx, -6.4, -5, 2, -5.4, -0.6, 1.6);
  taper(ctx, -13, -13.5, 3, -17, -17.5, 2.4);
  taper(ctx, -17, -17.5, 2.4, -17.2, -23, 1.8);
  taper(ctx, -17.2, -23, 1.8, -14.6, -26, 1.2);
  solidify(ctx, LION, RELIEF_OUT, 0.45);
  // talons, stinger, horn curl, forked tongue
  ctx.strokeStyle = RELIEF_OUT;
  ctx.lineWidth = 0.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const tx of [-11.2, -5.4]) {
    ctx.moveTo(tx - 1.6, -0.4);
    ctx.lineTo(tx - 2.6, 0.2);
    ctx.moveTo(tx + 1, -0.4);
    ctx.lineTo(tx + 2.4, 0.2);
  }
  ctx.moveTo(-14.6, -26);
  ctx.quadraticCurveTo(-13, -27.6, -12.6, -25.6);
  ctx.moveTo(9.6, -29.6);
  ctx.quadraticCurveTo(8.6, -31.2, 10.2, -31.4);
  ctx.stroke();
  ctx.strokeStyle = '#b02a1a';
  ctx.beginPath();
  ctx.moveTo(19, -23.8);
  ctx.lineTo(21.4, -23.8);
  ctx.lineTo(22.6, -24.8);
  ctx.moveTo(21.4, -23.8);
  ctx.lineTo(22.6, -22.9);
  ctx.stroke();
  // scales and the crest down the neck
  ctx.strokeStyle = 'rgba(120,64,10,0.5)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 7; i++) {
      const sx = -11 + i * 3 + r * 1.5, sy = -14.5 + r * 2.6;
      ctx.moveTo(sx - 1.2, sy);
      ctx.arc(sx, sy, 1.2, Math.PI, 0, true);
    }
  for (let i = 0; i < 4; i++) {
    const u = i / 4, nx = 6.5 + u * 5, ny = -15 - u * 8;
    ctx.moveTo(nx - 1, ny);
    ctx.arc(nx, ny, 1, Math.PI, 0, true);
  }
  ctx.stroke();
  ctx.fillStyle = LION;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const u = i / 4, nx = 5 + u * 5.6, ny = -15.4 - u * 8.4;
    ctx.moveTo(nx - 1.4, ny);
    ctx.lineTo(nx - 2.6, ny - 2.6);
    ctx.lineTo(nx + 0.2, ny - 1);
  }
  ctx.fill();
  circle(ctx, 15.8, -24.8, 0.6, RELIEF_OUT);
  ctx.strokeStyle = LION_HI;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-11, -16.2);
  ctx.quadraticCurveTo(-3, -17.8, 4, -16.2);
  ctx.stroke();
  ctx.restore();
}

/** A frieze of rosettes on a navy band between ochre borders, y is the band's top. */
function rosetteBand(ctx: Ctx, x0: number, x1: number, y: number, hgt: number) {
  ctx.fillStyle = '#0e2246';
  ctx.fillRect(x0, y, x1 - x0, hgt);
  ctx.fillStyle = '#c8962e';
  ctx.fillRect(x0, y, x1 - x0, 1.2);
  ctx.fillRect(x0, y + hgt - 1.2, x1 - x0, 1.2);
  const r = hgt * 0.34, step = hgt * 1.15;
  const v = localView(ctx);
  for (let x = x0 + step / 2; x < x1; x += step) if (x > v[0] - 8 && x < v[2] + 8) rosette(ctx, x, y + hgt / 2, r);
}

/** A storage jar: narrow foot, swelling belly, a short neck and lip. */
function jar(ctx: Ctx, cx: number, base: number, rw: number, h: number, col: string, band: string | null) {
  ctx.beginPath();
  ctx.moveTo(cx - rw * 0.42, base);
  ctx.bezierCurveTo(cx - rw * 1.1, base - h * 0.22, cx - rw * 1.08, base - h * 0.62, cx - rw * 0.42, base - h * 0.84);
  ctx.lineTo(cx - rw * 0.34, base - h * 0.94);
  ctx.lineTo(cx - rw * 0.46, base - h);
  ctx.lineTo(cx + rw * 0.46, base - h);
  ctx.lineTo(cx + rw * 0.34, base - h * 0.94);
  ctx.lineTo(cx + rw * 0.42, base - h * 0.84);
  ctx.bezierCurveTo(cx + rw * 1.08, base - h * 0.62, cx + rw * 1.1, base - h * 0.22, cx + rw * 0.42, base);
  ctx.closePath();
  solidify(ctx, col, OUT, 0.5);
  if (band) {
    ctx.strokeStyle = band;
    ctx.lineWidth = Math.max(0.6, h * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx - rw * 0.92, base - h * 0.62);
    for (let i = 1; i <= 8; i++) ctx.lineTo(cx - rw * 0.92 + (i * rw * 1.84) / 8, base - h * (i & 1 ? 0.67 : 0.6));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + rw * 0.45, base - h * 0.42, rw * 0.42, h * 0.32, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,236,200,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - rw * 0.45, base - h * 0.5, rw * 0.18, h * 0.22, -0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - rw * 0.34, base - h - 0.2, rw * 0.68, 0.8);
}

/** A date palm: scarred trunk, a crown of feathered fronds lit by the low sun, hanging dates. */
function palmTree(ctx: Ctx, x: number, base: number, H: number, lean: number, rng: RNG) {
  const s = H / 144;
  const tx = x + lean * H, ty = base - H * 0.84;
  const cxp = x + lean * H * 0.15, cyp = base - H * 0.45;
  // trunk, sampled along a quadratic and tapered
  const n = 14;
  const L: number[] = [], R: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, iu = 1 - u;
    const px = iu * iu * x + 2 * iu * u * cxp + u * u * tx, py = iu * iu * (base + 2) + 2 * iu * u * cyp + u * u * ty;
    const w = (5 - u * 1.6) * s * (i === 0 ? 1.4 : 1);
    L.push(px - w, py);
    R.push(px + w, py);
  }
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
  for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, x - 5 * s + lean * H * 0.5, x + 5 * s + lean * H * 0.5, ['#7a5434', '#b4885a', '#3a2412']), OUT, 0.55);
  // leaf-base scars climbing the trunk
  ctx.strokeStyle = 'rgba(40,22,8,0.6)';
  ctx.lineWidth = 0.6 * s + 0.2;
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const lx = L[i * 2], ly = L[i * 2 + 1], rx = R[i * 2], ry = R[i * 2 + 1];
    const mx = (lx + rx) / 2, my = (ly + ry) / 2;
    ctx.moveTo(lx + 0.5, ly - 2.4 * s);
    ctx.lineTo(mx, my + 0.6 * s);
    ctx.lineTo(rx - 0.5, ry - 2.4 * s);
  }
  ctx.stroke();
  // dead fronds hanging down the trunk
  ctx.strokeStyle = '#6a4a26';
  ctx.lineWidth = 1.2 * s + 0.3;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = rng.range(-0.5, 0.5);
    ctx.moveTo(tx, ty + 4 * s);
    ctx.quadraticCurveTo(tx + a * 30 * s, ty + 12 * s, tx + a * 22 * s, ty + 34 * s);
  }
  ctx.stroke();
  // fronds: a dark back set, then the lit front set
  for (let pass = 0; pass < 2; pass++) {
    const cnt = pass ? 9 : 7;
    for (let i = 0; i < cnt; i++) {
      const a = -Math.PI * (pass ? 1.08 : 1.02) + (i / (cnt - 1)) * Math.PI * (pass ? 1.16 : 1.04) + rng.range(-0.08, 0.08);
      const len = H * rng.range(0.34, 0.46) * (pass ? 1 : 0.9);
      const ca = Math.cos(a), sa = Math.sin(a);
      const droop = Math.abs(ca);
      const ex = tx + ca * len, ey = ty + sa * len * 0.45 + len * 0.55 * droop * droop + 6 * s;
      const cx = tx + ca * len * 0.55, cy = ty + sa * len * 0.65 - len * 0.12;
      const lit = ca < 0.2;
      ctx.strokeStyle = pass ? (lit ? '#7c8a40' : '#4a6030') : '#2c3a20';
      ctx.lineWidth = 1.1 * s + 0.3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      // leaflets both sides, drooping
      for (let k = 2; k < 15; k++) {
        const u = k / 15, iu = 1 - u;
        const px = iu * iu * tx + 2 * iu * u * cx + u * u * ex, py = iu * iu * ty + 2 * iu * u * cy + u * u * ey;
        const dx = 2 * iu * (cx - tx) + 2 * u * (ex - cx), dy = 2 * iu * (cy - ty) + 2 * u * (ey - cy);
        const dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
        const ll = (9 - u * 5) * s;
        ctx.moveTo(px, py);
        ctx.lineTo(px + (ux * 0.5 - uy * 0.85) * ll, py + (uy * 0.5 + ux * 0.85) * ll + ll * 0.35);
        ctx.moveTo(px, py);
        ctx.lineTo(px + (ux * 0.5 + uy * 0.85) * ll, py + (uy * 0.5 - ux * 0.85) * ll + ll * 0.35);
      }
      ctx.stroke();
      if (pass && lit) {
        ctx.strokeStyle = 'rgba(240,200,110,0.45)';
        ctx.lineWidth = 0.6 * s + 0.15;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(cx, cy - 0.8, ex, ey - 0.8);
        ctx.stroke();
      }
    }
  }
  // clusters of dates
  for (let i = 0; i < 3; i++) {
    const dx = tx + (i - 1) * 8 * s, dy = ty + (8 + (i & 1) * 4) * s;
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 0.6 * s + 0.2;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 2 * s);
    ctx.quadraticCurveTo(dx, ty + 2 * s, dx, dy);
    ctx.stroke();
    for (let k = 0; k < 7; k++) circle(ctx, dx + rng.range(-3, 3) * s, dy + rng.range(0, 7) * s, 1.4 * s + 0.2, k & 1 ? '#c8742a' : '#9a4a1a');
    circle(ctx, dx - 1.5 * s, dy + 1.5 * s, 0.6 * s, 'rgba(255,220,160,0.6)');
  }
  circle(ctx, tx, ty, 3 * s, '#4a3418');
}

const datePalm: PropFn = (ctx, e, pal, rng) => {
  const H = (e.h ?? 9) * TILE;
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 3, 0, Math.PI, 0);
  ctx.fill();
  palmTree(ctx, 0, 0, H, rng.range(0.04, 0.12), rng);
};

const reeds: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 3) * TILE, H = (e.h ?? 3) * TILE;
  // stems start well below the anchor: in a river channel they rise out of the water
  const foot = 30;
  for (let layer = 0; layer < 2; layer++) {
    ctx.strokeStyle = layer ? '#6e7c3c' : '#3a4624';
    ctx.lineWidth = layer ? 0.9 : 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const n = Math.round(W / (layer ? 3 : 2.4));
    for (let i = 0; i < n; i++) {
      const px = rng.range(-W / 2, W / 2), top = -H * rng.range(0.5, 1.05) * (layer ? 0.9 : 1), bend = rng.range(-0.15, 0.25) * H;
      ctx.moveTo(px, foot);
      ctx.quadraticCurveTo(px + bend * 0.1, top * 0.4, px + bend, top);
    }
    ctx.stroke();
  }
  // blades
  ctx.fillStyle = '#58662e';
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const px = rng.range(-W / 2, W / 2), Lb = H * rng.range(0.4, 0.8), d = rng.range(-0.4, 0.4) * Lb;
    ctx.moveTo(px - 1, foot);
    ctx.quadraticCurveTo(px + d * 0.2 - 1, -Lb * 0.6, px + d, -Lb);
    ctx.quadraticCurveTo(px + d * 0.2 + 1, -Lb * 0.6, px + 1, foot);
  }
  ctx.fill();
  // sun on the left-hand stems
  ctx.strokeStyle = 'rgba(255,196,120,0.35)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const px = rng.range(-W / 2, 0), top = -H * rng.range(0.4, 0.9);
    ctx.moveTo(px - 0.4, 0);
    ctx.lineTo(px - 0.4 + top * -0.05, top);
  }
  ctx.stroke();
  // cattail heads
  for (let i = 0; i < 7; i++) {
    const px = rng.range(-W / 2, W / 2), py = -H * rng.range(0.55, 0.95);
    ctx.strokeStyle = '#4a5228';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, py + 3);
    ctx.moveTo(px, py - 3);
    ctx.lineTo(px, py - 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(px, py, 1.5, 3.4, 0, 0, TAU);
    solidify(ctx, '#5a3418', OUT, 0.3);
    ctx.fillStyle = 'rgba(255,200,140,0.35)';
    ctx.fillRect(px - 1, py - 2.4, 0.6, 3.6);
  }
};

const WILLOW_LEAF = ['#2a3820', '#46582e', '#62723a'] as const;

/** A weeping willow by the water; v 1 hangs harps in its branches (Psalm 137:2). */
const willow: PropFn = (ctx, e, pal, rng) => {
  const H = (e.h ?? 8) * TILE, s = H / 128;
  const tx = 9 * s, ty = -H * 0.55;
  // roots and trunk, leaning out over the water
  ctx.beginPath();
  ctx.moveTo(-15 * s, 2);
  ctx.quadraticCurveTo(-9 * s, -2 * s, -8 * s, -10 * s);
  ctx.bezierCurveTo(-7 * s, -H * 0.2, -3 * s, -H * 0.35, tx - 6 * s, ty);
  ctx.lineTo(tx + 5 * s, ty - 3 * s);
  ctx.bezierCurveTo(4 * s, -H * 0.32, 7 * s, -H * 0.16, 8 * s, -9 * s);
  ctx.quadraticCurveTo(10 * s, -2 * s, 17 * s, 2);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -10 * s, 10 * s, ['#4e3e2c', '#8a7050', '#24180e']), OUT, 0.6);
  ctx.strokeStyle = 'rgba(20,12,6,0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const bx = -5 * s + i * 2.6 * s;
    ctx.moveTo(bx, -4 * s);
    ctx.bezierCurveTo(bx + 1, -H * 0.15, bx + 2 * s, -H * 0.3, bx + tx * 0.6 + rng.range(-1, 1), ty + 8 * s);
  }
  ctx.stroke();
  ellipse(ctx, -1 * s, -H * 0.24, 2 * s, 2.6 * s, 0, 'rgba(20,12,6,0.6)');
  // boughs fanning out from the crown
  const nb = 6;
  const bough: number[] = [];
  for (let i = 0; i < nb; i++) {
    const a = -Math.PI / 2 + (i - (nb - 1) / 2) * 0.5 + rng.range(-0.08, 0.08) + 0.1;
    const Lb = H * rng.range(0.36, 0.46);
    const ex = tx + Math.cos(a) * Lb, ey = ty + Math.sin(a) * Lb * 0.55 + Lb * 0.08;
    const cx = tx + Math.cos(a) * Lb * 0.5, cy = ty + Math.sin(a) * Lb * 0.55 - Lb * 0.22;
    bough.push(cx, cy, ex, ey);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = '#4e3e2c';
    ctx.lineWidth = 2.2 * s;
    ctx.stroke();
  }
  const at = (i: number, u: number, out: number[]) => {
    const iu = 1 - u, cx = bough[i * 4], cy = bough[i * 4 + 1], ex = bough[i * 4 + 2], ey = bough[i * 4 + 3];
    out[0] = iu * iu * tx + 2 * iu * u * cx + u * u * ex;
    out[1] = iu * iu * ty + 2 * iu * u * cy + u * u * ey;
  };
  const p = [0, 0];
  // the crown's dark mass
  ctx.fillStyle = WILLOW_LEAF[0];
  ctx.beginPath();
  for (let i = 0; i < nb; i++)
    for (const u of [0.45, 0.75, 1]) {
      at(i, u, p);
      const rx = (11 + u * 5) * s, ry = (8 + u * 3) * s;
      ctx.moveTo(p[0] + rx, p[1]);
      ctx.ellipse(p[0], p[1], rx, ry, 0, 0, TAU);
    }
  ctx.fill();
  // curtains of hanging strands, back to front, each strand set with leaves
  const harps: number[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const leaves: number[] = [];
    ctx.strokeStyle = layer === 0 ? '#1e2a16' : layer === 1 ? '#34442a' : '#4a5a30';
    ctx.lineWidth = 0.55 * s + 0.2;
    ctx.beginPath();
    for (let i = 0; i < nb; i++) {
      for (let u = 0.25 + layer * 0.06; u <= 1.02; u += 0.13) {
        at(i, u, p);
        const sx = p[0] + rng.range(-3, 3) * s, sy = p[1] + rng.range(-4, 1) * s;
        const len = Math.min(-6 - sy, H * rng.range(0.22, 0.5) * (0.6 + u * 0.5));
        if (len < 6) continue;
        const d = rng.range(-2, 5) * s;
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + d * 0.3, sy + len * 0.5, sx + d, sy + len);
        for (let k = 3 * s; k < len; k += 3.2 * s) {
          const f = k / len;
          leaves.push(sx + d * f * f, sy + k, (k / (3.2 * s)) & 1 ? 0.5 : -0.5);
        }
        if (layer === 2 && e.v === 1 && harps.length < 9 && u > 0.5 && u < 0.8 && (i === 1 || i === nb - 2 || i === 3)) harps.push(sx, sy, len * 0.45);
      }
    }
    ctx.stroke();
    ctx.fillStyle = WILLOW_LEAF[layer];
    ctx.beginPath();
    for (let k = 0; k < leaves.length; k += 3) {
      const lx = leaves[k], ly = leaves[k + 1], a = Math.PI / 2 + leaves[k + 2];
      ctx.moveTo(lx + Math.cos(a) * 2.2 * s, ly + Math.sin(a) * 2.2 * s);
      ctx.ellipse(lx, ly, 2.2 * s, 0.7 * s, a, 0, TAU);
    }
    ctx.fill();
    if (layer === 2) {
      // the low sun on the left of the crown
      ctx.fillStyle = 'rgba(214,190,110,0.5)';
      ctx.beginPath();
      for (let k = 0; k < leaves.length; k += 3) {
        if (leaves[k] > tx - 10 * s || hash2(k, 3, 7) < 0.4) continue;
        const lx = leaves[k], ly = leaves[k + 1], a = Math.PI / 2 + leaves[k + 2];
        ctx.moveTo(lx + Math.cos(a) * 1.6 * s, ly + Math.sin(a) * 1.6 * s);
        ctx.ellipse(lx - 0.3, ly, 1.6 * s, 0.5 * s, a, 0, TAU);
      }
      ctx.fill();
    }
  }
  // "We hanged our harps upon the willows" — lyres on cords among the strands
  for (let k = 0; k < harps.length; k += 3) {
    const hx = harps[k], hy = harps[k + 1], cl = Math.max(6, harps[k + 2]);
    const ly = hy + cl;
    ctx.strokeStyle = '#c8b48a';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, ly);
    ctx.stroke();
    const hs = 1.15 * s, tilt = ((k / 3) & 1 ? 0.18 : -0.14);
    ctx.save();
    ctx.translate(hx, ly);
    ctx.rotate(tilt);
    ctx.scale(hs, hs);
    ctx.beginPath();
    ctx.moveTo(-5, 1);
    ctx.quadraticCurveTo(-7, 8, -4.6, 13);
    ctx.lineTo(4.6, 13);
    ctx.quadraticCurveTo(7.4, 7, 5.4, -0.6);
    ctx.lineTo(4, 0);
    ctx.quadraticCurveTo(5.2, 7, 3.4, 10.4);
    ctx.lineTo(-3.4, 10.4);
    ctx.quadraticCurveTo(-5.2, 7, -3.6, 1.6);
    ctx.closePath();
    ctx.moveTo(-5.6, 0);
    ctx.lineTo(6, -1.6);
    ctx.lineTo(6, 0);
    ctx.lineTo(-5.6, 1.6);
    ctx.closePath();
    solidify(ctx, '#9a6a30', OUT, 0.35);
    ctx.fillStyle = '#6a4418';
    ctx.fillRect(-4.6, 10.4, 9.2, 2.6);
    ctx.strokeStyle = 'rgba(250,236,200,0.75)';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const sx = -2.4 + i * 1.2;
      ctx.moveTo(sx, 1.4 - i * 0.24);
      ctx.lineTo(sx * 0.9, 10.4);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,150,0.5)';
    ctx.fillRect(-5.2, 3, 0.6, 6);
    ctx.restore();
  }
};

const ziggurat: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 18) * TILE, H = W * 0.5;
  const tiers = 4;
  const haze = pal.fog;
  const b0 = mix(MUD, haze, 0.18), b1 = mix('#86603c', haze, 0.18), b2 = mix('#a67c50', haze, 0.18);
  // earth under the base, so a river channel in front shows the far bank rather than sky
  ctx.fillStyle = mix('#4a3420', haze, 0.12);
  ctx.fillRect(-W / 2 - 24, -3, W + 48, 44);
  ctx.fillStyle = mix('#6a4a2c', haze, 0.2);
  ctx.fillRect(-W / 2 - 24, -3, W + 48, 2);
  const th = H / (tiers + 0.55);
  for (let i = 0; i < tiers; i++) {
    const tw = W * (1 - i * 0.2), y0 = -(i + 1) * th, x0 = -tw / 2;
    brickField(ctx, x0, y0, x0 + tw, y0 + th, 7, 3.5, [b0, b1, b2], 300 + i, 'rgba(40,22,10,0.3)', 0.45);
    // buttressed faces: recesses in shadow, their edges catching the sun
    ctx.fillStyle = 'rgba(30,14,6,0.28)';
    for (let bx = x0 + 10; bx < x0 + tw - 12; bx += 16) ctx.fillRect(bx, y0 + 3, 6, th - 3);
    ctx.fillStyle = 'rgba(255,180,110,0.18)';
    for (let bx = x0 + 10; bx < x0 + tw - 12; bx += 16) ctx.fillRect(bx - 1, y0 + 3, 1, th - 3);
    // parapet and its sunlit lip
    ctx.fillStyle = mix('#6a4a2a', haze, 0.15);
    ctx.fillRect(x0 - 2, y0 - 2, tw + 4, 3.5);
    ctx.fillStyle = 'rgba(255,190,120,0.55)';
    ctx.fillRect(x0 - 2, y0 - 2, tw + 4, 0.9);
    ctx.fillStyle = 'rgba(255,150,80,0.22)';
    ctx.fillRect(x0, y0, 4, th);
    ctx.fillStyle = 'rgba(20,8,4,0.3)';
    ctx.fillRect(x0 + tw - 6, y0, 6, th);
  }
  // three stairs: the great central flight and two side flights meeting it
  const stair = (ax: number, ay: number, bx: number, by: number, w: number) => {
    const n = Math.round(Math.hypot(bx - ax, by - ay) / 3.2);
    ctx.beginPath();
    taper(ctx, ax, ay, w, bx, by, w * 0.8);
    ctx.fillStyle = mix('#b08a5a', haze, 0.2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,28,12,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const u = i / n, px = ax + (bx - ax) * u, py = ay + (by - ay) * u, hw = (w * (1 - u * 0.2)) / 2;
      ctx.moveTo(px - hw, py);
      ctx.lineTo(px + hw, py);
    }
    ctx.stroke();
  };
  stair(-W * 0.36, 0, -W * 0.06, -th * 1.05, 10);
  stair(W * 0.36, 0, W * 0.06, -th * 1.05, 10);
  stair(0, 0, 0, -th * 2, 18);
  // the shrine on the summit, glazed blue with gilded horns
  const sw = W * 0.2, sh = th * 0.95, sy = -tiers * th - sh;
  brickField(ctx, -sw / 2, sy, sw / 2, -tiers * th, 6, 3, [mix(GLAZE, haze, 0.25), mix('#2a5ea0', haze, 0.25)], 309, 'rgba(6,14,34,0.5)', 0.4);
  ctx.fillStyle = mix(GOLD, haze, 0.1);
  ctx.fillRect(-sw / 2 - 2, sy - 2.5, sw + 4, 2.6);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * (sw / 2 + 1), sy - 2);
    ctx.quadraticCurveTo(sx * (sw / 2 + 5), sy - 6, sx * (sw / 2 + 2), sy - 11);
    ctx.lineTo(sx * (sw / 2 - 1), sy - 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1a0c06';
  ctx.beginPath();
  ctx.moveTo(-5, -tiers * th);
  ctx.lineTo(-5, sy + sh * 0.4);
  ctx.arc(0, sy + sh * 0.4, 5, Math.PI, 0);
  ctx.lineTo(5, -tiers * th);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff8a3a', 0, sy + sh * 0.7, 16, 14, 0.55);
  blob(ctx, '#ffb060', 0, sy - 10, 22, 16, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  // fires on the corners of the second terrace
  for (const sx of [-1, 1]) {
    const fx0 = sx * W * 0.3, fy0 = -th * 2 - 2;
    ctx.fillStyle = '#3a2412';
    ctx.fillRect(fx0 - 3, fy0 - 3, 6, 3);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#ff7a2a', fx0, fy0 - 5, 9, 9, 0.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd890';
    ctx.beginPath();
    ctx.moveTo(fx0 - 2, fy0 - 3);
    ctx.quadraticCurveTo(fx0 - 1, fy0 - 8, fx0 + 0.5, fy0 - 10);
    ctx.quadraticCurveTo(fx0 + 2.5, fy0 - 6, fx0 + 2, fy0 - 3);
    ctx.fill();
  }
};

/** Babylon's wall: blue-glazed brick, towers at intervals, rosette friezes and a procession of golden lions. */
const cityWall: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 40) * TILE, H = (e.h ?? 14) * TILE;
  const x0 = -W / 2, x1 = W / 2, top = -H * 0.9;
  const v = localView(ctx);
  brickField(ctx, x0, -12, x1, 0, 16, 6, ['#4e4436', '#443a2e', '#5a4e3e'], 201, 'rgba(0,0,0,0.5)', 0.6);
  ctx.fillStyle = 'rgba(255,230,190,0.18)';
  ctx.fillRect(x0, -12, W, 0.8);
  brickField(ctx, x0, top, x1, -12, 8, 4, [GLAZE, '#1b4682', '#28599a', '#1d4a88'], 202, 'rgba(4,12,30,0.75)', 0.55);
  ctx.fillStyle = 'rgba(160,205,255,0.1)';
  for (let yy = top + 0.7; yy < -12; yy += 4) ctx.fillRect(Math.max(x0, v[0]), yy, Math.min(x1, v[2]) - Math.max(x0, v[0]), 0.5);
  rosetteBand(ctx, x0, x1, top + 8, 11);
  rosetteBand(ctx, x0, x1, -30, 11);
  // the curtain wall's crenellations
  merlons(ctx, x0, x1, top, 10, '#1a427c');
  ctx.fillStyle = '#c8962e';
  ctx.fillRect(x0, top - 1.2, W, 1.6);
  // towers, then the lions walking between them toward the wall's centre
  const bay = 128, tw = 34;
  const n = Math.max(1, Math.round(W / bay));
  const step = W / n;
  for (let i = 0; i <= n; i++) {
    const cx = x0 + i * step;
    const a = Math.max(x0, cx - tw / 2), b = Math.min(x1, cx + tw / 2);
    if (b - a < 6) continue;
    brickField(ctx, a, -H, b, -12, 8, 4, ['#265a9e', '#22528e', '#2c62a8'], 210 + i, 'rgba(4,12,30,0.75)', 0.55);
    merlons(ctx, a - 1, b + 1, -H, 8, '#22508e');
    ctx.fillStyle = GOLD;
    ctx.fillRect(a, -H - 1, b - a, 1.6);
    ctx.fillRect(a, -H, 1.2, H - 12);
    ctx.fillRect(b - 1.2, -H, 1.2, H - 12);
    // moonlight down the right face, shadow off the left
    ctx.fillStyle = 'rgba(170,200,255,0.16)';
    ctx.fillRect(b - 4, -H, 2.8, H - 12);
    ctx.fillStyle = 'rgba(0,0,10,0.3)';
    ctx.fillRect(a - 5, top, 5, -12 - top);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(cx - 2, -H + 16, 4, 12);
    ctx.fillStyle = 'rgba(255,170,90,0.75)';
    ctx.fillRect(cx - 1.2, -H + 19, 2.4, 8);
  }
  const ly = -H * 0.42;
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * step;
    if (cx < v[0] - 40 || cx > v[2] + 40) continue;
    ctx.fillStyle = '#0e2246';
    ctx.fillRect(cx - step / 2 + tw / 2, ly - 30, step - tw, 32);
    ctx.fillStyle = '#c8962e';
    ctx.fillRect(cx - step / 2 + tw / 2, ly + 0.5, step - tw, 1.4);
    lionRelief(ctx, cx, ly, Math.min(1.25, (step - tw - 16) / 44), cx < 0 ? 1 : -1);
  }
  // weathering: a crack or two and a patch of lost glaze
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < Math.max(1, W / 220); i++) {
    let cx = rng.range(x0 + 20, x1 - 20), cy = top + rng.range(10, 40);
    ctx.moveTo(cx, cy);
    for (let k = 0; k < 5; k++) {
      cx += rng.range(-5, 5);
      cy += rng.range(6, 12);
      ctx.lineTo(cx, cy);
    }
  }
  ctx.stroke();
  // night falls darker toward the foot of the wall
  const g = ctx.createLinearGradient(0, -H, 0, 0);
  g.addColorStop(0, 'rgba(0,0,12,0)');
  g.addColorStop(0.6, 'rgba(0,0,12,0.12)');
  g.addColorStop(1, 'rgba(0,0,12,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(Math.max(x0, v[0]), top, Math.min(x1, v[2]) - Math.max(x0, v[0]), -top);
};

/** The great gate: twin towers and a round-arched passage, rows of golden lions and dragons. */
const gateArch: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 14) * TILE, H = (e.h ?? 13) * TILE;
  const tw = W * 0.29, R = W * 0.15, spring = -H * 0.42, crown = spring - R;
  const tTop = -H * 1.2, mTop = -H * 0.98;
  const mx0 = -W / 2 + tw, mx1 = W / 2 - tw;
  // the central block over the passage
  brickField(ctx, mx0, mTop, mx1, 0, 8, 4, ['#1e4a88', '#1a4280', '#24549a'], 221, 'rgba(4,12,30,0.75)', 0.55);
  rosetteBand(ctx, mx0, mx1, mTop + 6, 10);
  merlons(ctx, mx0, mx1, mTop, 9, '#1c4684');
  ctx.fillStyle = GOLD;
  ctx.fillRect(mx0, mTop - 1, mx1 - mx0, 1.6);
  // two dragons facing over the arch
  const dy = crown - 18;
  ctx.fillStyle = '#0e2246';
  ctx.fillRect(mx0 + 2, dy - 32, mx1 - mx0 - 4, 33);
  ctx.fillStyle = '#c8962e';
  ctx.fillRect(mx0 + 2, dy + 0.5, mx1 - mx0 - 4, 1.4);
  const ds = Math.min(1.05, (mx1 - mx0) / 96);
  dragonRelief(ctx, -R * 0.55 - 6, dy, ds, 1);
  dragonRelief(ctx, R * 0.55 + 6, dy, ds, -1);
  // the passage, warm light at its far end, cedar doors folded back
  const passage = () => {
    ctx.beginPath();
    ctx.moveTo(-R, 0);
    ctx.lineTo(-R, spring);
    ctx.arc(0, spring, R, Math.PI, 0);
    ctx.lineTo(R, 0);
    ctx.closePath();
  };
  passage();
  const pg = ctx.createLinearGradient(0, crown, 0, 0);
  pg.addColorStop(0, '#05070e');
  pg.addColorStop(0.6, '#140c10');
  pg.addColorStop(1, '#3a2012');
  ctx.fillStyle = pg;
  ctx.fill();
  const ir = R * 0.55;
  ctx.beginPath();
  ctx.moveTo(-ir, 0);
  ctx.lineTo(-ir, spring * 0.7);
  ctx.arc(0, spring * 0.7, ir, Math.PI, 0);
  ctx.lineTo(ir, 0);
  ctx.closePath();
  ctx.fillStyle = '#6a3a1c';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffa050', 0, spring * 0.45, ir * 1.6, -spring * 0.6, 0.55);
  ctx.globalCompositeOperation = 'source-over';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * R, 0);
    ctx.lineTo(sx * R, spring + 4);
    ctx.lineTo(sx * ir * 1.15, spring * 0.7 + 6);
    ctx.lineTo(sx * ir * 1.15, 0);
    ctx.closePath();
    solidify(ctx, '#3a2010', OUT, 0.5);
    ctx.fillStyle = '#b08a3a';
    for (let yy = spring + 14; yy < -4; yy += 10)
      for (let k = 0; k < 3; k++) {
        const u = (k + 0.5) / 3, px = sx * (R + (ir * 1.15 - R) * u);
        circle(ctx, px, yy + (spring * 0.7 + 6 - (spring + 4)) * u * 0.3, 0.9, '#b08a3a');
      }
  }
  // the archivolt: ochre, gold, a ring of rosettes, ochre
  const ring = (r0: number, r1: number, col: string) => {
    ctx.beginPath();
    ctx.moveTo(-r1, spring);
    ctx.arc(0, spring, r1, Math.PI, 0);
    ctx.lineTo(r0, spring);
    ctx.arc(0, spring, r0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  ring(R, R + 4, '#b8862a');
  ring(R + 4, R + 13, '#0e2246');
  ring(R + 13, R + 15, GOLD);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + ((i + 0.5) / 11) * Math.PI;
    rosette(ctx, Math.cos(a) * (R + 8.5), spring + Math.sin(a) * (R + 8.5), 3.4);
  }
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#b8862a';
    ctx.fillRect(sx > 0 ? R : -R - 4, spring, 4, -spring);
  }
  // twin towers, standing forward of the wall
  for (const sx of [-1, 1]) {
    const a = sx < 0 ? -W / 2 : W / 2 - tw, b = a + tw;
    brickField(ctx, a, tTop, b, 0, 8, 4, ['#28609e', '#22548e', '#2e66aa', '#1f4e8a'], 230 + sx, 'rgba(4,12,30,0.75)', 0.55);
    ctx.fillStyle = 'rgba(160,205,255,0.1)';
    for (let yy = tTop + 0.7; yy < 0; yy += 4) ctx.fillRect(a, yy, tw, 0.5);
    merlons(ctx, a - 2, b + 2, tTop, 11, '#245690');
    ctx.fillStyle = GOLD;
    ctx.fillRect(a - 2, tTop - 1.4, tw + 4, 2);
    ctx.fillRect(a, tTop, 1.6, -tTop);
    ctx.fillRect(b - 1.6, tTop, 1.6, -tTop);
    // rows of beasts walking toward the passage, rosettes between them
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const ry = -H * (0.2 + r * 0.24);
      ctx.fillStyle = '#0e2246';
      ctx.fillRect(a + 3, ry - 32, tw - 6, 33);
      ctx.fillStyle = '#c8962e';
      ctx.fillRect(a + 3, ry + 0.5, tw - 6, 1.4);
      const bs = Math.min(1.05, (tw - 10) / 46), bx = (a + b) / 2, dir = -sx;
      if (r & 1) dragonRelief(ctx, bx, ry, bs, dir);
      else lionRelief(ctx, bx, ry, bs, dir);
      if (r < rows - 1) {
        ctx.fillStyle = '#c8962e';
        for (let k = 0; k < 3; k++) rosette(ctx, a + tw * (0.25 + k * 0.25), ry - 38, 2.6);
      }
    }
    // the inner face where the tower stands proud of the passage block
    ctx.fillStyle = 'rgba(0,0,10,0.4)';
    ctx.fillRect(sx < 0 ? b : a - 6, mTop, 6, -mTop);
    ctx.fillStyle = 'rgba(170,205,255,0.16)';
    ctx.fillRect(b - 4, tTop, 2.4, -tTop);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect((a + b) / 2 - 3, tTop + 10, 6, 13);
    ctx.fillStyle = 'rgba(255,170,90,0.8)';
    ctx.fillRect((a + b) / 2 - 2, tTop + 13, 4, 9);
  }
  const g = ctx.createLinearGradient(0, tTop, 0, 0);
  g.addColorStop(0, 'rgba(0,0,12,0)');
  g.addColorStop(0.7, 'rgba(0,0,12,0.1)');
  g.addColorStop(1, 'rgba(0,0,12,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(-W / 2, mTop, W, -mTop);
};

/** The fixed part of a hanging banner: a bronze rod on a bracket (the cloth sways live). */
const bannerRod: PropFn = (ctx) => {
  ctx.fillStyle = '#2a1e10';
  ctx.fillRect(-1.2, -7, 2.4, 7);
  ctx.fillStyle = '#6a4a1c';
  ctx.fillRect(-14, -1, 28, 2.6);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-14, -1, 28, 1);
  circle(ctx, -15.4, 0.3, 2, GOLD);
  circle(ctx, 15.4, 0.3, 2, GOLD);
  circle(ctx, -15.9, -0.2, 0.7, GOLD_HI);
  circle(ctx, 14.9, -0.2, 0.7, GOLD_HI);
};

const potStack: PropFn = (ctx, e, pal, rng) => {
  jar(ctx, 7, 0, 7, 27, '#9a5a32', 'rgba(30,14,6,0.6)');
  jar(ctx, -6, 0, 8.5, 16, '#a85e32', 'rgba(30,14,6,0.6)');
  jar(ctx, 9, 0, 6, 12, '#c89a64', 'rgba(90,40,16,0.7)');
  jar(ctx, -1, -15, 6, 12, '#2a5a9a', 'rgba(232,200,110,0.8)');
  jar(ctx, -15, 0, 4.5, 9, '#b8783e', null);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 2, 0, 0, TAU);
  ctx.fill();
};

const palmPlanter: PropFn = (ctx, e, pal, rng) => {
  palmTree(ctx, 0, -17, (e.h ?? 6) * TILE, rng.range(-0.06, 0.06), rng);
  brickField(ctx, -15, -17, 15, -3, 5, 3.5, [GLAZE, '#1c4884', '#2a5ea2'], 241, 'rgba(4,12,30,0.7)', 0.45);
  ctx.fillStyle = '#7a5418';
  ctx.fillRect(-16, -3, 32, 3);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-17, -19.5, 34, 2.6);
  ctx.fillStyle = GOLD_HI;
  ctx.fillRect(-17, -19.5, 34, 0.7);
  ctx.fillRect(-15, -17, 1.4, 14);
  ctx.fillRect(13.6, -17, 1.4, 14);
  rosette(ctx, 0, -10, 4);
  ctx.fillStyle = '#2a1a0e';
  ctx.beginPath();
  ctx.ellipse(0, -19.5, 13, 1.6, 0, Math.PI, 0);
  ctx.fill();
};

const marketStall: PropFn = (ctx, e, pal, rng) => {
  // posts and the striped awning
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(-27, -46, 3, 46);
  ctx.fillRect(24, -40, 3, 40);
  ctx.beginPath();
  ctx.moveTo(-34, -48);
  ctx.lineTo(34, -41);
  ctx.lineTo(34, -36);
  ctx.lineTo(-34, -43);
  ctx.closePath();
  solidify(ctx, '#d0902a', OUT, 0.5);
  for (let i = 0; i < 8; i++) {
    if (i & 1) continue;
    const a = -34 + i * 8.5, b = a + 8.5;
    ctx.fillStyle = '#26346e';
    ctx.beginPath();
    ctx.moveTo(a, -48 + (a + 34) * 0.103);
    ctx.lineTo(b, -48 + (b + 34) * 0.103);
    ctx.lineTo(b, -43 + (b + 34) * 0.103);
    ctx.lineTo(a, -43 + (a + 34) * 0.103);
    ctx.fill();
  }
  // scalloped valance
  for (let i = 0; i < 8; i++) {
    const a = -34 + i * 8.5, y0 = -43 + (a + 4.25 + 34) * 0.103;
    ctx.beginPath();
    ctx.moveTo(a, y0 - 0.4);
    ctx.lineTo(a + 8.5, y0 + 0.4);
    ctx.quadraticCurveTo(a + 4.25, y0 + 7, a, y0 - 0.4);
    solidify(ctx, i & 1 ? '#d0902a' : '#26346e', OUT, 0.4);
  }
  // strings of onions from the beam
  ctx.strokeStyle = '#6a5030';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-18, -44);
  ctx.lineTo(-18, -30);
  ctx.moveTo(10, -41);
  ctx.lineTo(10, -29);
  ctx.stroke();
  for (let k = 0; k < 5; k++) {
    circle(ctx, -18 + (k & 1 ? 1.2 : -1.2), -42 + k * 2.6, 1.6, '#d8c08a');
    circle(ctx, 10 + (k & 1 ? 1.2 : -1.2), -39 + k * 2.4, 1.5, '#a04a2a');
  }
  // the counter, a red cloth with a gold fringe
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(-26, -18, 52, 3);
  ctx.beginPath();
  ctx.moveTo(-25, -15);
  ctx.lineTo(25, -15);
  ctx.lineTo(24, -5);
  ctx.lineTo(-24, -5);
  ctx.closePath();
  solidify(ctx, '#8a2a1e', OUT, 0.4);
  ctx.fillStyle = GOLD;
  for (let x = -23; x < 24; x += 2.4) ctx.fillRect(x, -5, 0.8, 2);
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(-24, -5, 3, 5);
  ctx.fillRect(21, -5, 3, 5);
  // wares: dates, pomegranates, bolts of cloth, a brass balance
  ctx.beginPath();
  ctx.ellipse(-16, -18, 7, 3.4, 0, Math.PI, 0);
  solidify(ctx, '#a07a44', OUT, 0.4);
  for (let k = 0; k < 9; k++) circle(ctx, -21 + k * 1.3, -19.2 - (k % 3) * 0.8, 1.2, k & 1 ? '#6a2a10' : '#8a3a14');
  for (let k = 0; k < 5; k++) {
    const px = -4 + k * 2.8, py = -19.6 - (k === 2 ? 2.2 : 0);
    circle(ctx, px, py, 1.8, '#a01e1a');
    circle(ctx, px - 0.5, py - 0.6, 0.5, 'rgba(255,200,180,0.7)');
  }
  for (let k = 0; k < 3; k++) {
    const col = ['#2a3a7a', '#c88a2a', '#6a1a3a'][k];
    ctx.beginPath();
    ctx.rect(10, -21 - k * 3.2, 11, 3);
    solidify(ctx, col, OUT, 0.3);
  }
  ctx.strokeStyle = '#c8a040';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(23, -18);
  ctx.lineTo(23, -28);
  ctx.moveTo(19, -27);
  ctx.lineTo(27, -27);
  ctx.moveTo(19, -27);
  ctx.lineTo(18, -24);
  ctx.lineTo(20, -24);
  ctx.lineTo(19, -27);
  ctx.moveTo(27, -27);
  ctx.lineTo(26, -24.6);
  ctx.lineTo(28, -24.6);
  ctx.lineTo(27, -27);
  ctx.stroke();
  jar(ctx, -30, 0, 4, 10, '#9a5a32', null);
  jar(ctx, 30, 0, 3.5, 8, '#c89a64', 'rgba(90,40,16,0.7)');
};

// ----- the lions' den

/** A pit opening in the street with its iron grate torn: the shaft drops away into the dark. */
const denGrate: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 4) * TILE, hw = W / 2, D = 92;
  const g = ctx.createLinearGradient(0, 0, 0, D);
  g.addColorStop(0, '#1a1620');
  g.addColorStop(0.45, '#09070c');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(-hw, 0, W, D);
  // the shaft's masonry fading downward
  ctx.strokeStyle = 'rgba(120,110,130,0.18)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let yy = 4; yy < D * 0.6; yy += 5) {
    ctx.moveTo(-hw, yy);
    ctx.lineTo(-hw + 7 - yy * 0.06, yy);
    ctx.moveTo(hw, yy);
    ctx.lineTo(hw - 7 + yy * 0.06, yy);
  }
  ctx.stroke();
  // something down there, watching
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffb040', 5, 64, 2.4, 1.6, 0.6);
  blob(ctx, '#ffb040', 10.5, 64.6, 2.4, 1.6, 0.6);
  ctx.globalCompositeOperation = 'source-over';
  // curb stones on both lips, scored by claws
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const a = sx < 0 ? -hw - 14 + k * 7 : hw + k * 7, w = 7;
      ctx.beginPath();
      ctx.rect(a, -4.5, w, 4.5);
      solidify(ctx, mix('#6a6070', pal.stone, 0.3), OUT, 0.4);
      ctx.fillStyle = 'rgba(255,240,220,0.22)';
      ctx.fillRect(a, -4.5, w, 0.8);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const cx = sx * (hw + 4) + k * 1.4;
      ctx.moveTo(cx, -4);
      ctx.lineTo(cx + 1.6, -1);
    }
    ctx.stroke();
  }
  const iron = '#3e3436', ironHi = 'rgba(200,170,150,0.45)', rust = '#7a4a2a';
  // the near half of the grate, hanging from its hinge into the pit
  ctx.save();
  ctx.translate(-hw + 1, -1.5);
  ctx.rotate(1.2);
  ctx.transform(1, 0, 0.35, 0.55, 0, 0);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.6;
  ctx.strokeRect(0, -3, 30, 16);
  ctx.strokeStyle = iron;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(0, -3, 30, 16);
  ctx.beginPath();
  for (let i = 6; i < 30; i += 6) {
    ctx.moveTo(i, -3);
    ctx.lineTo(i + (i === 18 ? 3 : 0), 13);
  }
  ctx.moveTo(0, 5);
  ctx.lineTo(30, 5);
  ctx.stroke();
  ctx.strokeStyle = ironHi;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -3.5);
  ctx.lineTo(30, -3.5);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = iron;
  ctx.fillRect(-hw - 2, -3, 5, 3);
  // the far half torn away: stubs bent up, one snapped and dangling
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.6;
  const stubs = () => {
    ctx.beginPath();
    ctx.moveTo(hw + 2, -1.5);
    ctx.lineTo(hw - 12, -1.5);
    for (let i = 0; i < 4; i++) {
      const sx = hw - 1 - i * 3.6;
      ctx.moveTo(sx, -1.5);
      ctx.quadraticCurveTo(sx - 1, -6 - i, sx - 4 - i * 1.5, -9 - i * 1.6);
    }
    ctx.moveTo(hw - 13, -1.5);
    ctx.quadraticCurveTo(hw - 15, 4, hw - 13.6, 12);
  };
  stubs();
  ctx.stroke();
  ctx.strokeStyle = iron;
  ctx.lineWidth = 1.5;
  stubs();
  ctx.stroke();
  ctx.fillStyle = rust;
  for (let i = 0; i < 6; i++) ctx.fillRect(hw - 12 + rng.range(0, 12), -2.2 + rng.range(-6, 0.5), 0.8, 0.8);
  // a broken chain into the dark
  ctx.strokeStyle = '#4a4246';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let yy = 0; yy < 26; yy += 3.2) {
    if ((yy / 3.2) & 1) {
      ctx.moveTo(hw - 3, yy);
      ctx.lineTo(hw - 3, yy + 2.6);
    } else {
      ctx.moveTo(hw - 3 + 1.1, yy + 1.3);
      ctx.ellipse(hw - 3, yy + 1.3, 1.1, 1.6, 0, 0, TAU);
    }
  }
  ctx.stroke();
};

const straw: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 3) * TILE;
  ctx.beginPath();
  ctx.moveTo(-W / 2, 1);
  ctx.quadraticCurveTo(-W * 0.28, -9, 0, -9.5);
  ctx.quadraticCurveTo(W * 0.3, -9, W / 2, 1);
  ctx.closePath();
  ctx.fillStyle = '#7a5c26';
  ctx.fill();
  const C = ['#4e3a1a', '#a07a36', '#c8a24c', '#e8d07a'];
  ctx.lineCap = 'round';
  for (let k = 0; k < C.length; k++) {
    ctx.strokeStyle = C[k];
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let i = 0; i < 34; i++) {
      const u = rng.range(-0.5, 0.5), px = u * W;
      const hgt = 9.5 * Math.pow(1 - Math.abs(u) * 2, 0.6);
      const py = -rng.range(0, hgt) * (0.4 + k * 0.2);
      const a = rng.range(-0.55, 0.55), L = rng.range(5, 11);
      ctx.moveTo(px - Math.cos(a) * L / 2, py - Math.sin(a) * L / 2);
      ctx.lineTo(px + Math.cos(a) * L / 2, py + Math.sin(a) * L / 2);
    }
    for (let i = 0; i < 5; i++) {
      const px = rng.range(-W * 0.8, W * 0.8), a = rng.range(-0.3, 0.3), L = rng.range(4, 9);
      ctx.moveTo(px, -0.4);
      ctx.lineTo(px + Math.cos(a) * L, -0.4 + Math.sin(a) * 1.2);
    }
    ctx.stroke();
  }
};

/** Daylight falling down the den's shaft: baked beam and floor pool (motes drift live). */
const lightShaft: PropFn = (ctx, e) => {
  const W = (e.w ?? 4) * TILE, H = (e.h ?? 20) * TILE;
  ctx.globalCompositeOperation = 'lighter';
  for (const [k, a] of [[1.4, 0.05], [1, 0.06], [0.62, 0.08]] as const) {
    const g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, rgba('#ffe6a8', a * 1.8));
    g.addColorStop(0.6, rgba('#ffe6a8', a));
    g.addColorStop(1, rgba('#ffe6a8', a * 0.7));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-W * 0.42 * k, -H);
    ctx.lineTo(W * 0.42 * k, -H);
    ctx.lineTo(W * 0.66 * k, 0);
    ctx.lineTo(-W * 0.66 * k, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,236,190,0.05)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = -W * 0.3 + i * W * 0.2;
    ctx.moveTo(bx, -H);
    ctx.lineTo(bx * 1.5 + 2, 0);
  }
  ctx.stroke();
  blob(ctx, '#ffe6a8', 0, -2, W * 1.05, 10, 0.45);
  blob(ctx, '#fff4d0', 0, -1, W * 0.55, 4.5, 0.4);
  ctx.globalCompositeOperation = 'source-over';
};

// ----- the furnace

const SOOT_T = ['#221a16', '#1c1512', '#2a201a', '#18110e'] as const;

/** Glowing joints where the heat comes through; caller sets 'lighter'. */
function emberCrack(ctx: Ctx, x: number, y: number, rng: RNG, len: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let cx = x, cy = y;
  for (let k = 0; k < len; k++) {
    if (k & 1) cy += rng.chance(0.5) ? 5 : -5;
    else cx += rng.range(4, 10) * (rng.chance(0.5) ? 1 : -1);
    ctx.lineTo(cx, cy);
  }
  ctx.strokeStyle = 'rgba(255,70,10,0.22)';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,170,70,0.8)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

/** The furnace halls' back wall: soot brick over a plinth of great blocks, arches open onto the fiery depths. */
const furnaceWall: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 60) * TILE, H = (e.h ?? 20) * TILE;
  const x0 = -W / 2, x1 = W / 2, top = -H;
  const sill = -24, spring = -120, R = 56;
  const n = Math.max(1, Math.round(W / 224)), step = W / n;
  const v = localView(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, W, H);
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * step;
    ctx.moveTo(cx - R, sill);
    ctx.lineTo(cx - R, spring);
    ctx.arc(cx, spring, R, Math.PI, 0);
    ctx.lineTo(cx + R, sill);
    ctx.closePath();
  }
  ctx.clip('evenodd');
  brickField(ctx, x0, top, x1, sill, 10, 5, SOOT_T, 501, '#0a0604', 0.7);
  ctx.globalCompositeOperation = 'lighter';
  const cr = new RNG(Math.floor(e.x * 7) + 503);
  for (let i = 0; i < W / 36; i++) {
    const cx = x0 + cr.range(0, W), cy = -cr.range(30, H * (cr.chance(0.6) ? 0.4 : 0.85));
    const len = cr.int(3, 7);
    if (cx < v[0] - 60 || cx > v[2] + 60) continue;
    emberCrack(ctx, cx, Math.round(cy / 5) * 5, cr, len);
  }
  ctx.globalCompositeOperation = 'source-over';
  // a clerestory of small glowing vents high on the wall
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * step, vy = spring - R - 52;
    if (vy < top + 30) continue;
    for (const dx of [-30, 0, 30]) {
      ctx.fillStyle = '#0a0402';
      ctx.fillRect(cx + dx - 5, vy, 10, 14);
      ctx.fillStyle = 'rgba(255,110,30,0.8)';
      for (let b = 0; b < 3; b++) ctx.fillRect(cx + dx - 4, vy + 1.5 + b * 4.4, 8, 2);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, EMBER, cx + dx, vy + 7, 14, 14, 0.3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(cx + dx - 6, vy - 26, 12, 26);
    }
  }
  // soot thickest under the vault
  const sg = ctx.createLinearGradient(0, top, 0, top + H * 0.6);
  sg.addColorStop(0, 'rgba(0,0,0,0.6)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(Math.max(x0, v[0]), top, Math.min(x1, v[2]) - Math.max(x0, v[0]), H * 0.6);
  ctx.restore();
  // plinth of great blocks along the floor
  brickField(ctx, x0, sill, x1, 0, 22, 12, ['#2c221d', '#251c18', '#33271f'], 502, '#0a0604', 0.8);
  ctx.fillStyle = 'rgba(255,150,90,0.16)';
  ctx.fillRect(x0, sill, W, 0.8);
  // arch rings, sills, and the piers' iron bands
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * step;
    if (cx < v[0] - 120 || cx > v[2] + 120) continue;
    ctx.beginPath();
    ctx.moveTo(cx - R - 12, sill);
    ctx.lineTo(cx - R - 12, spring);
    ctx.arc(cx, spring, R + 12, Math.PI, 0);
    ctx.lineTo(cx + R + 12, sill);
    ctx.lineTo(cx + R, sill);
    ctx.lineTo(cx + R, spring);
    ctx.arc(cx, spring, R, 0, Math.PI, true);
    ctx.lineTo(cx - R, sill);
    ctx.closePath();
    ctx.fillStyle = '#2e2420';
    ctx.fill();
    ctx.strokeStyle = '#0a0604';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI + (k / 14) * Math.PI;
      ctx.moveTo(cx + Math.cos(a) * R, spring + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a) * (R + 12), spring + Math.sin(a) * (R + 12));
    }
    for (let yy = spring + 12; yy < sill; yy += 12) {
      ctx.moveTo(cx - R - 12, yy);
      ctx.lineTo(cx - R, yy);
      ctx.moveTo(cx + R, yy);
      ctx.lineTo(cx + R + 12, yy);
    }
    ctx.stroke();
    // firelight from the depths on the inner edge of the ring
    ctx.strokeStyle = 'rgba(255,120,40,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - R + 0.7, sill);
    ctx.lineTo(cx - R + 0.7, spring);
    ctx.arc(cx, spring, R - 0.7, Math.PI, 0);
    ctx.lineTo(cx + R - 0.7, sill);
    ctx.stroke();
    ctx.fillStyle = '#3a2c24';
    ctx.fillRect(cx - R - 4, spring - R - 16, 8, 0);
    ctx.beginPath();
    ctx.moveTo(cx - 7, spring - R - 14);
    ctx.lineTo(cx + 7, spring - R - 14);
    ctx.lineTo(cx + 5, spring - R + 2);
    ctx.lineTo(cx - 5, spring - R + 2);
    ctx.closePath();
    solidify(ctx, '#3e3028', '#0a0604', 0.5);
    ctx.fillStyle = '#3a2c24';
    ctx.fillRect(cx - R - 6, sill - 3, R * 2 + 12, 3);
    ctx.fillStyle = 'rgba(255,150,80,0.3)';
    ctx.fillRect(cx - R - 6, sill - 3, R * 2 + 12, 0.7);
  }
  for (let i = 0; i <= n; i++) {
    const px = x0 + i * step;
    if (px < v[0] - 40 || px > v[2] + 40) continue;
    for (const by of [-64, spring - R - 4, top + 40]) {
      if (by < top + 20) continue;
      ctx.fillStyle = '#16100e';
      ctx.fillRect(px - 22, by, 44, 7);
      ctx.fillStyle = 'rgba(255,160,110,0.25)';
      ctx.fillRect(px - 22, by, 44, 0.8);
      for (let rx = px - 19; rx < px + 20; rx += 6.5) circle(ctx, rx, by + 3.5, 0.9, 'rgba(255,190,150,0.4)');
    }
    // a vent at the foot of each pier
    ctx.fillStyle = '#0a0402';
    ctx.fillRect(px - 12, -20, 24, 13);
    ctx.fillStyle = 'rgba(255,110,30,0.85)';
    for (let b = 0; b < 5; b++) ctx.fillRect(px - 10.5 + b * 4.6, -18.5, 2.2, 10);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, EMBER, px, -13, 26, 18, 0.45);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a201c';
    ctx.fillRect(px - 14, -22, 28, 2.4);
  }
  // cornice under the vault
  ctx.fillStyle = '#100a08';
  ctx.fillRect(Math.max(x0, v[0]), top, Math.min(x1, v[2]) - Math.max(x0, v[0]), 12);
  ctx.fillStyle = 'rgba(255,140,80,0.15)';
  ctx.fillRect(Math.max(x0, v[0]), top + 12, Math.min(x1, v[2]) - Math.max(x0, v[0]), 0.8);
};

/** Heavy chains from the ceiling: one ends in a hook, its neighbour in an open manacle. */
const chainHang: PropFn = (ctx, e) => {
  const H = (e.h ?? 6) * TILE;
  ctx.fillStyle = '#241c1a';
  ctx.fillRect(-6, -2, 20, 5);
  ctx.fillStyle = 'rgba(255,200,170,0.3)';
  ctx.fillRect(-4, 0.5, 1, 1);
  ctx.fillRect(11, 0.5, 1, 1);
  const chain = (cx: number, len: number, lw: number) => {
    ctx.lineWidth = lw;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? '#4a4244' : OUT;
      if (!pass) ctx.lineWidth = lw + 1.2;
      else ctx.lineWidth = lw;
      ctx.beginPath();
      for (let yy = 3, k = 0; yy < len; yy += 4.6, k++) {
        if (k & 1) {
          ctx.moveTo(cx, yy - 0.6);
          ctx.lineTo(cx, yy + 5.2);
        } else {
          ctx.moveTo(cx + 1.9, yy + 2.3);
          ctx.ellipse(cx, yy + 2.3, 1.9, 3, 0, 0, TAU);
        }
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,190,150,0.35)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let yy = 3; yy < len; yy += 9.2) {
      ctx.moveTo(cx - 1.5, yy + 1);
      ctx.lineTo(cx - 1.5, yy + 3.4);
    }
    ctx.stroke();
  };
  chain(0, H, 1.3);
  // the hook
  ctx.lineCap = 'round';
  for (const [c, w] of [[OUT, 4], ['#4a4244', 2.6]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H + 4);
    ctx.arc(4, H + 8, 4.5, Math.PI * 1.05, Math.PI * 0.1, true);
    ctx.stroke();
  }
  // the second chain and its manacle
  const L2 = H * 0.55;
  chain(8, L2, 1.1);
  for (const [c, w] of [[OUT, 3], ['#4a4244', 1.8]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(8, L2 + 5, 4, -Math.PI * 0.4, Math.PI * 1.25);
    ctx.stroke();
  }
};

const bellows: PropFn = (ctx) => {
  ctx.fillStyle = '#2e1e12';
  ctx.fillRect(-17, -13, 3, 13);
  ctx.fillRect(9, -13, 3, 13);
  ctx.fillRect(-18, -5, 31, 2);
  // the leather, pleated, between the boards
  ctx.beginPath();
  ctx.moveTo(14, -15);
  ctx.lineTo(-19, -15);
  for (let i = 1; i <= 5; i++) ctx.lineTo(-19 - (i & 1 ? 3.5 : 0), -15 - i * 2.2);
  ctx.lineTo(14, -16.6);
  ctx.closePath();
  solidify(ctx, '#4a2a18', OUT, 0.5);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    ctx.moveTo(14, -15.8);
    ctx.lineTo(-19 - (i & 1 ? 3.5 : 0), -15 - i * 2.2);
  }
  ctx.stroke();
  // boards, studded with brass
  ctx.beginPath();
  taper(ctx, -21, -13.6, 3, 15, -13.6, 3);
  taper(ctx, -21, -27.4, 3, 15, -17, 3);
  solidify(ctx, '#6a4426', OUT, 0.5);
  for (let i = 0; i < 6; i++) {
    circle(ctx, -18 + i * 6, -13.6, 0.6, '#d8b060');
    circle(ctx, -18 + i * 6, -26.4 + i * 1.75, 0.6, '#d8b060');
  }
  // the nozzle, and a handle worn smooth
  ctx.beginPath();
  ctx.moveTo(14, -18);
  ctx.lineTo(28, -15.6);
  ctx.lineTo(28, -14.2);
  ctx.lineTo(14, -12.4);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, 14, 28, ['#4a4446', '#9a9496', '#1e1a1c']), OUT, 0.5);
  ctx.beginPath();
  taper(ctx, -20, -27, 2, -28, -37, 1.8);
  ctx.moveTo(-26.5, -38);
  ctx.arc(-28.5, -38, 2, 0, TAU);
  solidify(ctx, '#5a3a20', OUT, 0.4);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, EMBER, 30, -15, 6, 5, 0.4);
  ctx.globalCompositeOperation = 'source-over';
};

const coalCart: PropFn = (ctx, e, pal, rng) => {
  // coal heaped over the rim, a few lumps still alight
  const lumps: number[] = [];
  for (let i = 0; i < 22; i++) {
    const u = rng.range(-1, 1), px = u * 18, py = -22 - (1 - u * u) * 8 * rng.range(0.6, 1.1);
    lumps.push(px, py, rng.range(2.4, 4));
  }
  ctx.fillStyle = '#121012';
  ctx.beginPath();
  ctx.moveTo(-19, -21);
  ctx.quadraticCurveTo(0, -36, 19, -21);
  ctx.fill();
  for (let i = 0; i < lumps.length; i += 3) {
    const px = lumps[i], py = lumps[i + 1], r = lumps[i + 2];
    ctx.beginPath();
    ctx.moveTo(px - r, py + r * 0.3);
    ctx.lineTo(px - r * 0.4, py - r * 0.8);
    ctx.lineTo(px + r * 0.7, py - r * 0.6);
    ctx.lineTo(px + r, py + r * 0.4);
    ctx.lineTo(px, py + r * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#1a1618';
    ctx.fill();
    ctx.fillStyle = 'rgba(160,150,160,0.35)';
    ctx.beginPath();
    ctx.moveTo(px - r * 0.4, py - r * 0.8);
    ctx.lineTo(px + r * 0.7, py - r * 0.6);
    ctx.lineTo(px + r * 0.1, py - r * 0.1);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const k = rng.int(0, lumps.length / 3 - 1) * 3;
    blob(ctx, EMBER, lumps[k], lumps[k + 1], 5, 4, 0.7);
    ctx.fillStyle = EMBER_HI;
    ctx.fillRect(lumps[k] - 0.6, lumps[k + 1] - 0.4, 1.2, 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';
  // a shovel left in the heap
  ctx.beginPath();
  taper(ctx, 7, -30, 1.4, 15, -48, 1.2);
  solidify(ctx, '#6a4a2a', OUT, 0.4);
  // the box: planks, iron corners
  ctx.beginPath();
  ctx.moveTo(-21, -22);
  ctx.lineTo(21, -22);
  ctx.lineTo(18, -8);
  ctx.lineTo(-18, -8);
  ctx.closePath();
  solidify(ctx, '#4a3020', OUT, 0.6);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-20, -17.5);
  ctx.lineTo(20, -17.5);
  ctx.moveTo(-19, -12.8);
  ctx.lineTo(19, -12.8);
  ctx.stroke();
  ctx.fillStyle = '#2a2426';
  ctx.fillRect(-21, -22, 5, 14);
  ctx.fillRect(16, -22, 5, 14);
  ctx.fillRect(-21, -22.6, 42, 1.8);
  ctx.fillStyle = 'rgba(255,200,170,0.35)';
  for (const rx of [-19, 18.5]) for (const ry of [-19, -11]) ctx.fillRect(rx, ry, 0.9, 0.9);
  // handle and wheels
  ctx.strokeStyle = '#3a2618';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-20, -15);
  ctx.lineTo(-33, -9);
  ctx.stroke();
  for (const wx of [-11, 11]) {
    ctx.beginPath();
    ctx.arc(wx, -6, 6, 0, TAU);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#3a3234';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      ctx.moveTo(wx, -6);
      ctx.lineTo(wx + Math.cos(a) * 5.4, -6 + Math.sin(a) * 5.4);
    }
    ctx.stroke();
    circle(ctx, wx, -6, 1.3, '#5a5052');
  }
};

const slagHeap: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 4) * TILE, H = (e.h ?? 1.7) * TILE;
  const n = 14, ys: number[] = [];
  for (let i = 0; i <= n; i++) ys.push(-H * Math.pow(Math.sin((Math.PI * i) / n), 0.7) * rng.range(0.78, 1.12));
  ctx.beginPath();
  ctx.moveTo(-W / 2, 2);
  for (let i = 0; i <= n; i++) ctx.lineTo(-W / 2 + (W * i) / n, ys[i]);
  ctx.lineTo(W / 2, 2);
  ctx.closePath();
  solidify(ctx, '#211814', OUT, 0.6);
  // clinker lumps on its face
  for (let i = 0; i < 18; i++) {
    const u = rng.range(0.08, 0.92), px = -W / 2 + W * u;
    const surf = -H * Math.pow(Math.sin(Math.PI * u), 0.7);
    const py = surf * rng.range(0.15, 0.9), r = rng.range(2.2, 4.6);
    ctx.beginPath();
    ctx.moveTo(px - r, py);
    ctx.lineTo(px - r * 0.3, py - r * 0.7);
    ctx.lineTo(px + r * 0.8, py - r * 0.4);
    ctx.lineTo(px + r * 0.6, py + r * 0.5);
    ctx.closePath();
    ctx.fillStyle = rng.chance(0.5) ? '#2e2420' : '#382a24';
    ctx.fill();
    ctx.fillStyle = 'rgba(200,160,140,0.22)';
    ctx.fillRect(px - r * 0.3, py - r * 0.65, r * 0.9, 0.6);
  }
  // still hot inside: glowing seams and pockets
  ctx.globalCompositeOperation = 'lighter';
  const cr = new RNG(Math.floor(e.x * 13) + 7);
  for (let i = 0; i < 4; i++) {
    const px = rng.range(-W * 0.35, W * 0.35), py = -H * rng.range(0.15, 0.55);
    ctx.lineCap = 'round';
    emberCrack(ctx, px, py, cr, 3);
    blob(ctx, EMBER, px, py, 9, 6, 0.45);
  }
  blob(ctx, '#ff8a2a', W * 0.15, -H * 0.2, 12, 7, 0.4);
  ctx.globalCompositeOperation = 'source-over';
  // a lip of fresh slag oozing at the foot
  ctx.beginPath();
  ctx.ellipse(W * 0.18, -1, 9, 2.4, 0, Math.PI, 0);
  ctx.fillStyle = '#ff6a14';
  ctx.fill();
  ctx.fillStyle = '#ffd060';
  ctx.fillRect(W * 0.18 - 5, -2.4, 7, 0.7);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, EMBER, W * 0.18, -2, 16, 8, 0.5);
  ctx.globalCompositeOperation = 'source-over';
};

const crucible: PropFn = (ctx, e, pal, rng) => {
  // the hearth it stands on (the forge's own fire sits in front of it)
  brickField(ctx, -22, -28, 22, 0, 8, 4, ['#3a2a22', '#2e221c', '#44322a'], 601, '#0c0806', 0.6);
  ctx.fillStyle = '#4a3a30';
  ctx.fillRect(-24, -31, 48, 3.4);
  ctx.fillStyle = 'rgba(255,180,120,0.3)';
  ctx.fillRect(-24, -31, 48, 0.8);
  // iron cradle, pivots and the pouring lever
  ctx.fillStyle = '#2a2224';
  ctx.fillRect(-21, -52, 3, 21);
  ctx.fillRect(18, -52, 3, 21);
  ctx.beginPath();
  taper(ctx, 20, -48, 2.4, 40, -64, 2);
  solidify(ctx, '#3a3234', OUT, 0.4);
  // the pot itself
  ctx.beginPath();
  ctx.moveTo(-16, -59);
  ctx.lineTo(16, -59);
  ctx.quadraticCurveTo(19, -46, 11, -33);
  ctx.lineTo(-11, -33);
  ctx.quadraticCurveTo(-19, -46, -16, -59);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -18, 18, ['#5a3a2a', '#9a6a4a', '#2a1810']), OUT, 0.6);
  ctx.fillStyle = '#2a2224';
  ctx.fillRect(-17.5, -52, 35, 2.6);
  ctx.fillRect(-15, -41, 30, 2.4);
  circle(ctx, -19.5, -48, 2.2, '#4a4244');
  circle(ctx, 19.5, -48, 2.2, '#4a4244');
  // the melt at the brim, and a thread of it poured into a mould
  ellipse(ctx, 0, -59, 15.5, 3.2, 0, '#ff7a14');
  ellipse(ctx, -1, -59.4, 11, 2, 0, '#ffd060');
  ctx.beginPath();
  ctx.moveTo(15.5, -58);
  ctx.quadraticCurveTo(24, -50, 27, -4);
  ctx.strokeStyle = '#ffb030';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#3a2e28';
  ctx.fillRect(21, -5, 14, 5);
  ctx.fillStyle = '#ff8a20';
  ctx.fillRect(22.5, -4.6, 11, 1.6);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff8a2a', 0, -62, 30, 18, 0.55);
  blob(ctx, '#ffe080', 0, -60, 12, 5, 0.6);
  blob(ctx, EMBER, 28, -4, 12, 6, 0.5);
  ctx.globalCompositeOperation = 'source-over';
};

/** The great furnace: a brick dome bound in iron, its doors thrown open on a roaring mouth (fire drawn live). */
const furnaceMouth: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 18) * TILE, H = (e.h ?? 15) * TILE;
  const mw = W * 0.21, ms = H * 0.36, crown = ms + mw;
  const v = localView(ctx);
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(-W / 2, 0);
    ctx.bezierCurveTo(-W / 2, -H * 0.62, -W * 0.27, -H, 0, -H);
    ctx.bezierCurveTo(W * 0.27, -H, W / 2, -H * 0.62, W / 2, 0);
    ctx.closePath();
  };
  // the chimney up into the vault
  brickField(ctx, -20, -H - 120, 20, -H + 20, 8, 4, SOOT_T, 701, '#0a0604', 0.6);
  for (const by of [-H - 30, -H - 80]) {
    ctx.fillStyle = '#14100e';
    ctx.fillRect(-22, by, 44, 5);
  }
  // plinth
  brickField(ctx, -W / 2 - 12, -10, W / 2 + 12, 0, 18, 10, ['#2c221d', '#33271f'], 702, '#0a0604', 0.7);
  // the dome's courses, its heat-stained face and soot
  dome();
  ctx.save();
  ctx.clip();
  brickField(ctx, -W / 2, -H, W / 2, -8, 10, 5, SOOT_T, 703, '#0a0604', 0.7);
  ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createRadialGradient(0, -ms * 0.7, mw * 0.6, 0, -ms * 0.7, mw * 2.6);
  hg.addColorStop(0, 'rgba(255,90,20,0.5)');
  hg.addColorStop(0.5, 'rgba(200,50,10,0.18)');
  hg.addColorStop(1, 'rgba(200,50,10,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(-W / 2, -H, W, H);
  const cr = new RNG(Math.floor(e.x * 11) + 9);
  for (let i = 0; i < 12; i++) emberCrack(ctx, cr.range(-W * 0.4, W * 0.4), -Math.round(cr.range(12, H * 0.8) / 5) * 5, cr, cr.int(2, 5));
  ctx.globalCompositeOperation = 'source-over';
  const sg = ctx.createRadialGradient(0, -crown - 30, 4, 0, -crown - 30, mw * 1.4);
  sg.addColorStop(0, 'rgba(0,0,0,0.65)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(-W / 2, -H, W, H);
  // the dome's shoulders fall into shadow
  const dg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  dg.addColorStop(0, 'rgba(0,0,0,0.45)');
  dg.addColorStop(0.3, 'rgba(0,0,0,0)');
  dg.addColorStop(0.7, 'rgba(0,0,0,0)');
  dg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = dg;
  ctx.fillRect(-W / 2, -H, W, H);
  ctx.restore();
  dome();
  ctx.strokeStyle = '#0a0604';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // iron hoops riveted round the dome
  const halfAt = (y: number) => {
    // invert the dome profile numerically for the hoop's ends
    let lo = 0, hi = 1;
    for (let k = 0; k < 14; k++) {
      const u = (lo + hi) / 2, iu = 1 - u;
      const py = iu * iu * iu * 0 + 3 * iu * iu * u * (-H * 0.62) + 3 * iu * u * u * -H + u * u * u * -H;
      if (py > y) lo = u;
      else hi = u;
    }
    const u = (lo + hi) / 2, iu = 1 - u;
    return -(iu * iu * iu * (-W / 2) + 3 * iu * iu * u * (-W / 2) + 3 * iu * u * u * (-W * 0.27));
  };
  for (const f of [0.52, 0.74, 0.9]) {
    const hy = -H * f, hx = halfAt(hy);
    ctx.beginPath();
    ctx.moveTo(-hx, hy);
    ctx.quadraticCurveTo(0, hy + 9, hx, hy);
    ctx.lineTo(hx, hy + 6);
    ctx.quadraticCurveTo(0, hy + 15, -hx, hy + 6);
    ctx.closePath();
    solidify(ctx, '#1c1618', '#060404', 0.5);
    ctx.strokeStyle = 'rgba(255,170,120,0.25)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-hx, hy + 0.5);
    ctx.quadraticCurveTo(0, hy + 9.5, hx, hy + 0.5);
    ctx.stroke();
    for (let k = -6; k <= 6; k++) {
      const u = k / 6.5, rx = u * hx, ry = hy + 3 + 9 * (1 - u * u) * 0.5;
      circle(ctx, rx, ry, 0.9, 'rgba(255,190,150,0.45)');
    }
  }
  // feeding ports on its shoulders
  for (const sx of [-1, 1]) {
    const px = sx * W * 0.31, py = -H * 0.42;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, TAU);
    solidify(ctx, '#2a2022', '#060404', 0.6);
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, TAU);
    ctx.fillStyle = '#ff7a1a';
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, EMBER, px, py, 18, 18, 0.5);
    blob(ctx, '#ffe080', px, py, 4, 4, 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }
  // the doors, flung open on their hinges
  for (const sx of [-1, 1]) {
    const hx = sx * (mw + 14), fx = sx * (mw + 36);
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, -crown + 14);
    ctx.lineTo(fx, -crown + 30);
    ctx.lineTo(fx, 6);
    ctx.closePath();
    solidify(ctx, metalGrad(ctx, Math.min(hx, fx), Math.max(hx, fx), ['#2e2628', '#5a4e50', '#141012']), '#060404', 0.7);
    ctx.strokeStyle = '#141012';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const f of [0.2, 0.5, 0.8]) {
      ctx.moveTo(hx, -(crown - 14) * f);
      ctx.lineTo(fx, -(crown - 30) * f + 6 * (1 - f));
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,30,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, 6);
    ctx.lineTo(fx, -crown + 30);
    ctx.stroke();
    for (const f of [0.15, 0.85]) {
      ctx.fillStyle = '#100c0c';
      ctx.fillRect(hx - 3, -(crown - 14) * f - 3, 6, 6);
    }
  }
  // a voussoir frame of pale stone, keystone with a gilded sun-disc
  ctx.beginPath();
  ctx.moveTo(-mw - 16, 0);
  ctx.lineTo(-mw - 16, -ms);
  ctx.arc(0, -ms, mw + 16, Math.PI, 0);
  ctx.lineTo(mw + 16, 0);
  ctx.lineTo(mw, 0);
  ctx.lineTo(mw, -ms);
  ctx.arc(0, -ms, mw, 0, Math.PI, true);
  ctx.lineTo(-mw, 0);
  ctx.closePath();
  solidify(ctx, '#4a3c34', '#0a0604', 0.6);
  ctx.strokeStyle = '#0e0a08';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let k = 1; k < 15; k++) {
    const a = Math.PI + (k / 15) * Math.PI;
    ctx.moveTo(Math.cos(a) * mw, -ms + Math.sin(a) * mw);
    ctx.lineTo(Math.cos(a) * (mw + 16), -ms + Math.sin(a) * (mw + 16));
  }
  for (let yy = -16; yy > -ms; yy -= 16) {
    ctx.moveTo(-mw - 16, yy);
    ctx.lineTo(-mw, yy);
    ctx.moveTo(mw, yy);
    ctx.lineTo(mw + 16, yy);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,130,50,0.6)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-mw + 0.8, 0);
  ctx.lineTo(-mw + 0.8, -ms);
  ctx.arc(0, -ms, mw - 0.8, Math.PI, 0);
  ctx.lineTo(mw - 0.8, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-10, -crown - 20);
  ctx.lineTo(10, -crown - 20);
  ctx.lineTo(7, -crown + 2);
  ctx.lineTo(-7, -crown + 2);
  ctx.closePath();
  solidify(ctx, '#56463c', '#0a0604', 0.6);
  ctx.beginPath();
  ctx.arc(0, -crown - 9, 5, 0, TAU);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ctx.moveTo(Math.cos(a) * 5.5, -crown - 9 + Math.sin(a) * 5.5);
    ctx.lineTo(Math.cos(a + 0.2) * 8.5, -crown - 9 + Math.sin(a + 0.2) * 8.5);
    ctx.lineTo(Math.cos(a + 0.4) * 5.5, -crown - 9 + Math.sin(a + 0.4) * 5.5);
  }
  ctx.fillStyle = GOLD;
  ctx.fill();
  circle(ctx, -1.4, -crown - 10.4, 1.6, GOLD_HI);
  // the mouth's depths: white heat low, deep red at the vault (flames are drawn live)
  ctx.beginPath();
  ctx.moveTo(-mw, 0);
  ctx.lineTo(-mw, -ms);
  ctx.arc(0, -ms, mw, Math.PI, 0);
  ctx.lineTo(mw, 0);
  ctx.closePath();
  const ig = ctx.createRadialGradient(0, -6, 6, 0, -ms * 0.6, crown);
  ig.addColorStop(0, '#ffe8a0');
  ig.addColorStop(0.25, '#ff9a2a');
  ig.addColorStop(0.6, '#b8300a');
  ig.addColorStop(1, '#3a0a02');
  ctx.fillStyle = ig;
  ctx.fill();
  // a sill of glowing stone
  ctx.fillStyle = '#5a3a28';
  ctx.fillRect(-mw - 18, -4, mw * 2 + 36, 4);
  ctx.fillStyle = 'rgba(255,170,90,0.7)';
  ctx.fillRect(-mw, -4, mw * 2, 1);
  if (v[1] > -H - 200) {
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, EMBER, 0, -crown * 0.5, mw * 2.2, crown * 0.9, 0.25);
    ctx.globalCompositeOperation = 'source-over';
  }
};

// ----- the plain

const brickRuin: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 5) * TILE, H = (e.h ?? 3.6) * TILE;
  // a broken stepped top, quantized to brick courses
  const n = 9, tops: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, env = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.25));
    tops.push(-Math.round((H * env * rng.range(0.7, 1)) / 4) * 4);
  }
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-W / 2, 0);
    for (let i = 0; i <= n; i++) {
      const xa = -W / 2 + (W * i) / n, xb = -W / 2 + (W * (i + 1)) / n;
      ctx.lineTo(xa, tops[i]);
      ctx.lineTo(Math.min(xb, W / 2), tops[i]);
    }
    ctx.lineTo(W / 2, 0);
    ctx.closePath();
  };
  outline();
  ctx.save();
  ctx.clip();
  brickField(ctx, -W / 2, -H - 4, W / 2, 0, 8, 4, [MUD, '#8a6240', '#a87c52', '#7a5636'], 801 + Math.floor(e.x), 'rgba(30,16,6,0.5)', 0.6);
  // a patch of the old glaze still clinging, half a lion on it
  brickField(ctx, -W * 0.42, -H * 0.82, -W * 0.02, -H * 0.3, 8, 4, [GLAZE, '#1c4682', '#2a5ea2'], 805, 'rgba(4,12,30,0.7)', 0.55);
  lionRelief(ctx, -W * 0.18, -H * 0.36, 0.8, 1);
  ctx.fillStyle = 'rgba(255,170,100,0.16)';
  ctx.fillRect(-W / 2, -H, 5, H);
  ctx.fillStyle = 'rgba(20,8,2,0.3)';
  ctx.fillRect(W / 2 - 7, -H, 7, H);
  ctx.restore();
  outline();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,200,140,0.5)';
  for (let i = 0; i <= n; i++) {
    const xa = -W / 2 + (W * i) / n;
    ctx.fillRect(xa, tops[i], Math.min(W / n, W / 2 - xa), 0.9);
  }
  // fallen bricks and drifted sand
  for (let i = 0; i < 9; i++) {
    const bx = rng.range(-W * 0.7, W * 0.7), a = rng.range(-0.5, 0.5);
    ctx.save();
    ctx.translate(bx, -1.6);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.rect(-3.5, -1.8, 7, 3.6);
    solidify(ctx, rng.chance(0.25) ? GLAZE : MUD, OUT, 0.35);
    ctx.restore();
  }
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.moveTo(-W / 2 - 14, 1);
  ctx.quadraticCurveTo(-W / 2, -10, -W / 2 + 12, 1);
  ctx.moveTo(W / 2 - 18, 1);
  ctx.quadraticCurveTo(W / 2 - 4, -7, W / 2 + 10, 1);
  ctx.fill();
};

const obelisk: PropFn = (ctx, e, pal, rng) => {
  const H = (e.h ?? 7) * TILE;
  for (const [hw, y0, hh] of [[17, 0, 6], [13.5, -6, 5], [10.5, -11, 4]] as const) {
    ctx.beginPath();
    ctx.rect(-hw, y0 - hh, hw * 2, hh);
    solidify(ctx, metalGrad(ctx, -hw, hw, ['#a8865a', '#d8b47e', '#5a4026']), OUT, 0.45);
  }
  // basalt shaft, tapering
  const b = -15, t = -H + 16;
  ctx.beginPath();
  ctx.moveTo(-8.5, b);
  ctx.lineTo(-5.8, t);
  ctx.lineTo(5.8, t);
  ctx.lineTo(8.5, b);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -8.5, 8.5, ['#3a3440', '#7a6a6a', '#16121a']), OUT, 0.6);
  // the gilded cap catching the last of the sun
  ctx.beginPath();
  ctx.moveTo(-6.4, t);
  ctx.lineTo(0, -H);
  ctx.lineTo(6.4, t);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -6.4, 6.4, METAL.gold), OUT, 0.5);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffc860', -1.5, t - 5, 12, 12, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  // a carved panel: the king before the sun-disc
  const py = t + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-4.8, py, 9.6, 18);
  ctx.fillStyle = '#8a7a72';
  ctx.beginPath();
  ctx.moveTo(-2.6, py + 17);
  ctx.lineTo(-2.2, py + 9);
  ctx.lineTo(-3, py + 6.5);
  ctx.lineTo(-1, py + 5.4);
  ctx.lineTo(0.2, py + 9);
  ctx.lineTo(1, py + 17);
  ctx.fill();
  ctx.fillRect(-1.6, py + 3.4, 1.6, 2);
  ctx.fillRect(0, py + 6.8, 2.4, 0.9);
  circle(ctx, 2.6, py + 3, 1.4, rgba(GOLD, 0.85));
  // cuneiform, row upon row
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let yy = py + 22; yy < b - 3; yy += 3.4) {
    const u = (yy - t) / (b - t), hw = 5.8 + (8.5 - 5.8) * u - 1.4;
    for (let xx = -hw; xx < hw - 1; xx += rng.range(1.4, 2.6)) {
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 1.2, yy + 0.5);
      ctx.lineTo(xx, yy + 1);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,190,130,0.3)';
  ctx.fillRect(-8.2, t, 0.8, b - t);
};

/** A worshipper in silhouette, bowed toward +x. pose 0 prostrate, 1 kneeling with hands raised, 2 bowed low. */
function worshipper(ctx: Ctx, x: number, y: number, s: number, pose: number, col: string, rim: string, hat: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  let hx = 0, hy = 0;
  ctx.beginPath();
  if (pose === 0) {
    ctx.moveTo(-13, 0);
    ctx.lineTo(-12.6, -3.6);
    ctx.quadraticCurveTo(-12.4, -11.5, -7, -12.2);
    ctx.quadraticCurveTo(0.5, -12.4, 4.6, -6.4);
    ctx.lineTo(13.6, -1.8);
    ctx.lineTo(14, 0);
    ctx.closePath();
    hx = 7;
    hy = -3.6;
  } else if (pose === 1) {
    ctx.moveTo(-9.5, 0);
    ctx.lineTo(-9, -5);
    ctx.quadraticCurveTo(-6, -8.4, -3.2, -8.4);
    ctx.lineTo(-2.8, -19);
    ctx.lineTo(2.6, -19.4);
    ctx.lineTo(3.6, -8.6);
    ctx.lineTo(6.4, -2.4);
    ctx.lineTo(6.6, 0);
    ctx.closePath();
    taper(ctx, 1.4, -17.6, 2.8, 6.4, -24.6, 2.2);
    taper(ctx, -1.4, -17.6, 2.6, 3.2, -25.4, 2);
    hx = 0.4;
    hy = -22.4;
  } else {
    ctx.moveTo(-10, 0);
    ctx.lineTo(-9.6, -5);
    ctx.quadraticCurveTo(-8.6, -14, -2.4, -14.6);
    ctx.lineTo(4.6, -10.6);
    ctx.lineTo(7.4, -5);
    ctx.lineTo(7.4, 0);
    ctx.closePath();
    taper(ctx, 3, -11.4, 2.6, 9.2, -0.8, 2.2);
    hx = 7.4;
    hy = -9.6;
  }
  ctx.moveTo(hx + 3.1, hy);
  ctx.arc(hx, hy, 3.1, 0, TAU);
  if (hat === 1) {
    // a tall felt cap
    ctx.moveTo(hx - 2.6, hy - 1.6);
    ctx.lineTo(hx - 1.2, hy - 7.6);
    ctx.lineTo(hx + 1.6, hy - 7.2);
    ctx.lineTo(hx + 2.8, hy - 1.4);
  } else if (hat === 2) {
    // a veil falling down the back
    ctx.moveTo(hx + 2.6, hy - 2);
    ctx.quadraticCurveTo(hx - 3, hy - 5, hx - 6.4, hy + 3);
    ctx.lineTo(hx - 3, hy + 2);
  }
  ctx.fillStyle = col;
  ctx.fill();
  // the low sun along their backs
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  if (pose === 0) {
    ctx.moveTo(-12.4, -6);
    ctx.quadraticCurveTo(-12.2, -11.4, -7, -11.8);
    ctx.quadraticCurveTo(-1, -12, 3, -8);
  } else if (pose === 1) {
    ctx.moveTo(-8.6, -5);
    ctx.quadraticCurveTo(-6, -8, -3.4, -8.6);
    ctx.lineTo(-3, -18.6);
  } else {
    ctx.moveTo(-9.2, -5);
    ctx.quadraticCurveTo(-8.2, -13.6, -2.4, -14.2);
    ctx.lineTo(4, -10.6);
  }
  ctx.stroke();
  ctx.restore();
}

/** Worshippers in two ranks, foreheads to the dust, bowed toward the Image. */
const kneelingCrowd: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 12) * TILE;
  for (let row = 0; row < 2; row++) {
    const s = row ? 1 : 0.84, dy = row ? 0 : -3;
    const col = row ? '#1e1517' : mix('#2a2026', pal.fog, 0.12);
    const rim = row ? 'rgba(255,170,100,0.4)' : 'rgba(255,170,100,0.28)';
    const step = row ? 21 : 18;
    const n = Math.max(1, Math.round(W / step));
    for (let i = 0; i < n; i++) {
      const px = -W / 2 + (i + 0.5) * (W / n) + rng.range(-3, 3) + (row ? 0 : 8);
      const r = rng.next();
      const pose = r < 0.62 ? 0 : r < 0.82 ? 2 : 1;
      worshipper(ctx, px, dy, s * rng.range(0.92, 1.06), pose, col, rim, rng.int(0, 2));
    }
  }
};

/** The stepped stone dais the Image stands on: dressed blocks, gold inlay, a basalt plinth and offerings. */
const imageDais: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 26) * TILE;
  let y = 0;
  const steps = [[W / 2, 11], [W * 0.4, 10], [W * 0.29, 9]] as const;
  for (let i = 0; i < steps.length; i++) {
    const [hw, hh] = steps[i];
    brickField(ctx, -hw, y - hh, hw, y, 32, hh, ['#a08058', '#94744e', '#ae8c62'], 901 + i, 'rgba(40,24,10,0.45)', 0.6);
    ctx.fillStyle = 'rgba(255,232,190,0.4)';
    ctx.fillRect(-hw, y - hh, hw * 2, 1);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-hw, y - hh + 2.4, hw * 2, 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-hw, y - 1.4, hw * 2, 1.4);
    ctx.fillStyle = 'rgba(255,190,120,0.25)';
    ctx.fillRect(-hw, y - hh, 2, hh);
    ctx.fillStyle = 'rgba(30,12,4,0.35)';
    ctx.fillRect(hw - 3, y - hh, 3, hh);
    y -= hh;
  }
  // the plinth of black stone, banded with gold and written over
  const pw = W * 0.17, ph = 9;
  ctx.beginPath();
  ctx.rect(-pw, y - ph, pw * 2, ph);
  solidify(ctx, metalGrad(ctx, -pw, pw, ['#2e2a32', '#6a6070', '#121016']), OUT, 0.5);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-pw, y - ph, pw * 2, 1.2);
  ctx.fillRect(-pw, y - 1.6, pw * 2, 1);
  ctx.fillStyle = 'rgba(232,200,120,0.5)';
  for (let xx = -pw + 3; xx < pw - 3; xx += rng.range(1.6, 2.8)) {
    ctx.beginPath();
    ctx.moveTo(xx, y - 6.4);
    ctx.lineTo(xx + 1.2, y - 5.9);
    ctx.lineTo(xx, y - 5.4);
    ctx.fill();
  }
  for (const sx of [-1, 1]) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(sx < 0 ? -pw - 1 : pw - 3, y - ph - 1, 4, ph + 1);
  }
  // a central stair up the front
  ctx.fillStyle = '#b8966a';
  ctx.fillRect(-22, -30, 44, 30);
  ctx.strokeStyle = 'rgba(50,28,10,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let yy = -3.75; yy > -30; yy -= 3.75) {
    ctx.moveTo(-22, yy);
    ctx.lineTo(22, yy);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,236,200,0.3)';
  for (let yy = -3.75; yy > -30; yy -= 3.75) ctx.fillRect(-22, yy, 44, 0.6);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-23.5, -30, 2, 30);
  ctx.fillRect(21.5, -30, 2, 30);
  // offerings left on the steps: gold bowls, incense rising, scattered petals
  for (const ox of [-W * 0.33, W * 0.31, -W * 0.18, W * 0.2]) {
    const oy = Math.abs(ox) > W * 0.29 ? -11 : -21;
    ctx.beginPath();
    ctx.ellipse(ox, oy - 1.4, 3.4, 1.6, 0, 0, Math.PI);
    ctx.lineTo(ox - 3.4, oy - 1.4);
    solidify(ctx, GOLD, OUT, 0.35);
    ctx.strokeStyle = 'rgba(220,210,200,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy - 2);
    ctx.bezierCurveTo(ox + 3, oy - 8, ox - 3, oy - 12, ox + 1, oy - 20);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) circle(ctx, rng.range(-W * 0.45, W * 0.45), -rng.range(0, 1) * 0.6 - (rng.chance(0.5) ? 0 : 11), 0.6, rng.chance(0.5) ? '#a82a2a' : '#e8c060');
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.moveTo(-W / 2 - 16, 1);
  ctx.quadraticCurveTo(-W / 2 - 2, -7, -W / 2 + 10, 1);
  ctx.moveTo(W / 2 - 10, 1);
  ctx.quadraticCurveTo(W / 2 + 2, -8, W / 2 + 18, 1);
  ctx.fill();
};

/** Local bounds [x0, y0, x1, y1] of each prop around its anchor, used to skip chunks it cannot touch. */
const BOUNDS: Record<string, (e: Decor) => [number, number, number, number]> = {
  willow: (e) => { const H = (e.h ?? 8) * TILE; return [-H * 0.6, -H * 1.05, H * 0.7, 6]; },
  reeds: (e) => { const W = (e.w ?? 3) * TILE, H = (e.h ?? 3) * TILE; return [-W / 2 - H * 0.3, -H * 1.1, W / 2 + H * 0.3, 32]; },
  date_palm: (e) => { const H = (e.h ?? 9) * TILE; return [-H * 0.55, -H * 1.15, H * 0.7, 6]; },
  ziggurat: (e) => { const W = (e.w ?? 18) * TILE; return [-W / 2 - 26, -W * 0.62, W / 2 + 26, 44]; },
  city_wall: (e) => { const W = (e.w ?? 40) * TILE, H = (e.h ?? 14) * TILE; return [-W / 2 - 24, -H - 12, W / 2 + 24, 4]; },
  gate_arch: (e) => { const W = (e.w ?? 14) * TILE, H = (e.h ?? 13) * TILE; return [-W / 2 - 8, -H * 1.2 - 14, W / 2 + 8, 8]; },
  babylon_banner: () => [-18, -8, 18, 4],
  pot_stack: () => [-24, -32, 22, 4],
  palm_planter: (e) => { const H = (e.h ?? 6) * TILE; return [-H * 0.55, -H * 1.15 - 20, H * 0.6, 4]; },
  market_stall: () => [-36, -52, 36, 4],
  den_grate: (e) => { const W = (e.w ?? 4) * TILE; return [-W / 2 - 18, -24, W / 2 + 18, 96]; },
  straw: (e) => { const W = (e.w ?? 3) * TILE; return [-W, -14, W, 4]; },
  light_shaft: (e) => { const W = (e.w ?? 4) * TILE, H = (e.h ?? 20) * TILE; return [-W, -H - 4, W, 14]; },
  furnace_wall: (e) => { const W = (e.w ?? 60) * TILE, H = (e.h ?? 20) * TILE; return [-W / 2 - 4, -H - 4, W / 2 + 4, 4]; },
  chain_hang: (e) => [-10, -4, 22, (e.h ?? 6) * TILE + 18],
  bellows: () => [-32, -42, 36, 4],
  coal_cart: () => [-36, -50, 24, 4],
  slag_heap: (e) => { const W = (e.w ?? 4) * TILE; return [-W / 2 - 16, -40, W / 2 + 16, 6]; },
  crucible: () => [-34, -90, 44, 4],
  furnace_mouth: (e) => { const W = (e.w ?? 18) * TILE, H = (e.h ?? 15) * TILE; return [-W / 2 - 14, -H - 124, W / 2 + 14, 8]; },
  brick_ruin: (e) => { const W = (e.w ?? 5) * TILE, H = (e.h ?? 3.6) * TILE; return [-W * 0.75, -H - 6, W * 0.75, 4]; },
  obelisk: (e) => [-20, -(e.h ?? 7) * TILE - 16, 20, 4],
  kneeling_crowd: (e) => { const W = (e.w ?? 12) * TILE; return [-W / 2 - 12, -32, W / 2 + 26, 4]; },
  image_dais: (e) => { const W = (e.w ?? 26) * TILE; return [-W / 2 - 20, -64, W / 2 + 20, 4]; },
};

const PROPS: Record<string, PropFn> = {
  willow,
  reeds,
  date_palm: datePalm,
  ziggurat,
  city_wall: cityWall,
  gate_arch: gateArch,
  babylon_banner: bannerRod,
  pot_stack: potStack,
  palm_planter: palmPlanter,
  market_stall: marketStall,
  den_grate: denGrate,
  straw,
  light_shaft: lightShaft,
  furnace_wall: furnaceWall,
  chain_hang: chainHang,
  bellows,
  coal_cart: coalCart,
  slag_heap: slagHeap,
  crucible,
  furnace_mouth: furnaceMouth,
  brick_ruin: brickRuin,
  obelisk,
  kneeling_crowd: kneelingCrowd,
  image_dais: imageDais,
};

/** Decor baked before the rest of a chunk's props, so palms, tents and people stand in front of it. */
export const BACKDROP_CH4: ReadonlySet<string> = new Set(['ziggurat', 'city_wall', 'gate_arch', 'furnace_wall']);

/** Chapter IV props. Returns false for kinds it does not know. */
export function drawPropCh4(ctx: Ctx, e: Decor, pal: BiomePal, seed: number): boolean {
  const fn = PROPS[e.k];
  if (!fn) return false;
  // Tile chunks are baked with a plain scale+translate; skip props that miss this chunk entirely.
  const b = BOUNDS[e.k]?.(e);
  const m = ctx.getTransform();
  if (b && m.b === 0 && m.c === 0) {
    const x = e.x * TILE, y = e.y * TILE;
    const x0 = e.flip ? x - b[2] : x + b[0], x1 = e.flip ? x - b[0] : x + b[2];
    const X0 = m.a * x0 + m.e, X1 = m.a * x1 + m.e, Y0 = m.d * (y + b[1]) + m.f, Y1 = m.d * (y + b[3]) + m.f;
    if (Math.max(X0, X1) < 0 || Math.min(X0, X1) > ctx.canvas.width || Math.max(Y0, Y1) < 0 || Math.min(Y0, Y1) > ctx.canvas.height) return true;
  }
  ctx.save();
  ctx.translate(e.x * TILE, e.y * TILE);
  if (e.flip) ctx.scale(-1, 1);
  fn(ctx, e, pal, new RNG(seed + Math.floor(e.x * 31 + e.y * 7)));
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------- live props

/** Chapter IV decor with an animated overlay (static body baked in the tile cache). */
export const LIVE_CH4: ReadonlySet<string> = new Set(['babylon_banner', 'light_shaft', 'furnace_mouth']);

/** Sideways offset of a banner's cloth at fraction u down its length. */
function clothOff(u: number, sw: number, t: number, ph: number) {
  return sw * u * u + Math.sin(t * 2.3 + u * 4 + ph) * 0.9 * u;
}

/** A flame tongue from a base of width wid at (bx, by) up to height hgt, its tip pushed by sway. Adds to the path. */
function tongue(ctx: Ctx, bx: number, by: number, wid: number, hgt: number, sway: number) {
  ctx.moveTo(bx - wid / 2, by);
  ctx.quadraticCurveTo(bx - wid * 0.55 + sway * 0.3, by - hgt * 0.55, bx + sway, by - hgt);
  ctx.quadraticCurveTo(bx + wid * 0.55 + sway * 0.3, by - hgt * 0.5, bx + wid / 2, by);
  ctx.closePath();
}

const FLAME_C = ['#d8360a', '#ff8a1a', '#fff0a8'] as const;
const FLAME_W = [1, 0.62, 0.32] as const;
const FLAME_H = [1, 0.74, 0.44] as const;

/** Animated overlays: banner cloth, motes in the light, the furnace's fire. Allocation-free. */
export function drawLivePropCh4(ctx: Ctx, e: Decor, t: number) {
  const x = e.x * TILE, y = e.y * TILE;
  switch (e.k) {
    case 'babylon_banner': {
      const H = (e.h ?? 5) * TILE, hw = 9, ph = e.x * 0.7;
      const sw = Math.sin(t * 1.1 + ph) * 3.2 + Math.sin(t * 0.43 + ph) * 1.4;
      ctx.beginPath();
      ctx.moveTo(x - hw, y + 1.6);
      for (let k = 1; k <= 6; k++) {
        const u = k / 6;
        ctx.lineTo(x - hw + clothOff(u, sw, t, ph), y + 1.6 + u * (H - 1.6));
      }
      ctx.lineTo(x + clothOff(0.88, sw, t, ph), y + H - 9);
      for (let k = 6; k >= 1; k--) {
        const u = k / 6;
        ctx.lineTo(x + hw + clothOff(u, sw, t, ph), y + 1.6 + u * (H - 1.6));
      }
      ctx.lineTo(x + hw, y + 1.6);
      ctx.closePath();
      ctx.fillStyle = '#1a3a7a';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // a fold down the middle, the gold border either side
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = 'rgba(0,0,20,0.28)';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2);
      for (let k = 1; k <= 5; k++) {
        const u = k / 6;
        ctx.lineTo(x + 2 + clothOff(u, sw, t, ph), y + 1.6 + u * (H - 1.6));
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = GOLD;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(x + side * (hw - 2), y + 3);
        for (let k = 1; k <= 6; k++) {
          const u = k / 6;
          ctx.lineTo(x + side * (hw - 2) + clothOff(u, sw, t, ph), y + 1.6 + u * (H - 1.6) - (k === 6 ? 2.5 : 0));
        }
      }
      ctx.stroke();
      // Ishtar's eight-pointed star
      const sy = y + H * 0.33, sx = x + clothOff(0.33, sw, t, ph);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU - Math.PI / 2, r = k & 1 ? 2.3 : 6;
        if (!k) ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        else ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      circle(ctx, sx, sy, 1.6, GOLD_HI);
      for (const side of [-1, 1]) circle(ctx, x + side * hw + clothOff(1, sw, t, ph), y + H + 1.5, 1.4, GOLD);
      break;
    }
    case 'light_shaft': {
      const W = (e.w ?? 4) * TILE, H = (e.h ?? 20) * TILE;
      const n = tier() === 2 ? 18 : tier() === 1 ? 11 : 6;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const u = (t * 0.035 + hash2(i, 0, 61)) % 1;
        const wx = x + (hash2(i, 1, 61) - 0.5) * W * (0.8 + u * 0.5) + Math.sin(t * 0.5 + i * 1.7) * 5;
        const a = Math.sin(u * Math.PI) * (0.4 + 0.3 * Math.sin(t * 2 + i));
        blob(ctx, '#fff0c0', wx, y - H + u * H, 2.4, 2.4, a);
      }
      const r = (t * 0.07) % 1;
      blob(ctx, '#ffe6a8', x, y - H + r * H, W * 0.7, H * 0.12, 0.1 * Math.sin(r * Math.PI));
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'furnace_mouth': {
      const W = (e.w ?? 18) * TILE, H = (e.h ?? 15) * TILE;
      const mw = W * 0.21, ms = H * 0.36, crown = ms + mw;
      const q = tier();
      const n = q === 2 ? 11 : q === 1 ? 8 : 5;
      const fl = 0.86 + 0.14 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - mw, y);
      ctx.lineTo(x - mw, y - ms);
      ctx.arc(x, y - ms, mw, Math.PI, 0);
      ctx.lineTo(x + mw, y);
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff6a1a', x, y - ms * 0.6, mw * 1.3, crown * 0.8, 0.4 * fl);
      for (let layer = 0; layer < 3; layer++) {
        ctx.globalCompositeOperation = layer === 2 ? 'lighter' : 'source-over';
        ctx.globalAlpha = layer === 0 ? 0.92 : 0.95;
        ctx.fillStyle = FLAME_C[layer];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const ph = t * (2.2 + hash2(i, 1, 9) * 1.4) + i * 1.7;
          const hgt = crown * (0.5 + 0.28 * Math.sin(ph) * Math.sin(ph * 0.53 + 1) + 0.3 * (1 - Math.abs(u - 0.5) * 2)) * FLAME_H[layer] * fl;
          const wid = ((2 * mw) / n) * 2 * FLAME_W[layer];
          const sway = Math.sin(t * 3.1 + i * 2.1) * wid * 0.35 + Math.sin(t * 7.3 + i) * wid * 0.15;
          tongue(ctx, x - mw + u * 2 * mw, y + 1, wid, hgt, sway);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ffe8a0', x, y - 5, mw * 0.95, 16, 0.6 * fl);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      // tongues that escape over the arch and lick up the dome
      ctx.fillStyle = 'rgba(255,120,30,0.5)';
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ph = t * 1.9 + k * 2.3;
        const hgt = 14 + 18 * (0.5 + 0.5 * Math.sin(ph)) * (0.5 + 0.5 * Math.sin(ph * 1.7 + k));
        tongue(ctx, x + (k - 1) * mw * 0.45, y - crown + 8, mw * 0.4, hgt, Math.sin(t * 2.7 + k) * 6);
      }
      ctx.fill();
      // embers spat up out of the mouth
      const ne = q === 2 ? 28 : q === 1 ? 16 : 8;
      ctx.fillStyle = '#ffd080';
      for (let i = 0; i < ne; i++) {
        const life = (t * 0.42 + i * 0.137) % 1;
        const ex = x + Math.sin(i * 12.9898) * mw * 0.85 + Math.sin(t * 1.3 + i) * 10 * life + life * 16;
        ctx.globalAlpha = (1 - life) * 0.9;
        const sz = 1.8 - life;
        ctx.fillRect(ex, y - ms * 0.35 - life * H * 0.85, sz, sz);
      }
      ctx.globalAlpha = 1;
      blob(ctx, '#ff5a10', x, y - ms, W * 0.44, H * 0.5, 0.14 + 0.08 * fl);
      blob(ctx, '#ffb050', x, y - 2, mw * 1.8, 18, 0.3 * fl);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
  }
}
