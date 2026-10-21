// Chapters VII–IX environment art: the domains of the Fallen Crowns.
// The Hunt: a thawing pine forest under a cold moon, grey snow going to mud,
// antler totems, hide banners and stake pits; its depths are bone-strewn dens.
// Pestilence: a sick green marsh over drowned houses, willows hung with moss,
// bog water and bile, quarantine lanterns; its depths are the sporeworks and
// the wax hive of the queen. Cinders: an ash sky over the forge-mountain,
// riveted iron and soot-black brick, slag channels, crucibles and chains.

import { makeCanvas, rgba, mix, shade, circle, poly, type Ctx } from './draw';
import { RNG, hash2 } from '../core/math';
import { TILE, T, type Biome } from '../game/tiles';
import { blob, tier, wrapNoise, fillRidge, reedSil } from './env4';
import type { BiomePal, Layer } from './environment';

export { fallenProp, drawFallenLive, FALLEN_LIVE } from './fallenProps';

export type FallenBiome = 'hunt' | 'plague' | 'cinders';
export const isFallen = (b: Biome): b is FallenBiome => b === 'hunt' || b === 'plague' || b === 'cinders';

const TAU = Math.PI * 2;

function box(ctx: Ctx, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- skies

type SkyKind = 'thaw' | 'den' | 'miasma' | 'hive' | 'ash' | 'forge';
const SKY_STOPS: Record<SkyKind, readonly (readonly [number, string])[]> = {
  // a cold night going grey at the edge, the thaw's first rose low in the trees
  thaw: [[0, '#0a0e1e'], [0.3, '#18203a'], [0.55, '#2e3452'], [0.74, '#5a4a5e'], [0.86, '#a0706a'], [0.96, '#d09a7a']],
  // the dens under the forest: earth-dark, warmed by fires below
  den: [[0, '#060508'], [0.5, '#120d10'], [0.8, '#22161a'], [1, '#3a2018']],
  // the marsh under the swarm: teal gone to bile at the horizon
  miasma: [[0, '#081214'], [0.3, '#142a26'], [0.55, '#2c4a38'], [0.76, '#5e8048'], [0.9, '#a8bc72'], [1, '#c8d092']],
  // the hive and the sporeworks
  hive: [[0, '#050a07'], [0.55, '#0e1c12'], [0.85, '#1c3418'], [1, '#2e4a1c']],
  // ash falling through furnace light
  ash: [[0, '#100c14'], [0.28, '#261a22'], [0.52, '#4e2e30'], [0.74, '#9a5236'], [0.9, '#d8823e'], [1, '#f0a050']],
  // inside the foundry
  forge: [[0, '#080505'], [0.55, '#1a0d0a'], [0.85, '#3a1a0c'], [1, '#5a2a0e']],
};
const skyG: Partial<Record<SkyKind, CanvasGradient>> = {};
const skyH: Partial<Record<SkyKind, number>> = {};

function skyFill(ctx: Ctx, kind: SkyKind, w: number, h: number) {
  let g = skyG[kind];
  if (!g || skyH[kind] !== h) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of SKY_STOPS[kind]) g.addColorStop(o, c);
    skyG[kind] = g;
    skyH[kind] = h;
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function fallenSky(ctx: Ctx, biome: FallenBiome, w: number, h: number, interior: boolean, t: number) {
  const k = h / 720;
  if (interior) {
    skyFill(ctx, biome === 'hunt' ? 'den' : biome === 'plague' ? 'hive' : 'forge', w, h);
    const glowCol = biome === 'hunt' ? '#a0502a' : biome === 'plague' ? '#5a9a3a' : '#ff6a20';
    const pulse = biome === 'cinders' ? 0.05 * Math.sin(t * 2.1) : 0;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, glowCol, w * 0.5, h, w * 0.75, h * 0.42, 0.22 + pulse);
    // light falling through cracks in the roof
    if (tier() > 0) {
      ctx.fillStyle = rgba(biome === 'plague' ? '#b8e090' : biome === 'hunt' ? '#c8c0b0' : '#ffb070', 0.045);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.18 + i * 0.32) + Math.sin(t * 0.1 + i) * 6 * k, s = (30 + i * 10) * k;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.3, 0);
        ctx.lineTo(x + s * 0.3, 0);
        ctx.lineTo(x + s * 2.2, h);
        ctx.lineTo(x + s * 0.6, h);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (biome === 'hunt') thawSky(ctx, w, h, t, k);
  else if (biome === 'plague') miasmaSky(ctx, w, h, t, k);
  else ashSky(ctx, w, h, t, k);
}

function thawSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  skyFill(ctx, 'thaw', w, h);
  ctx.fillStyle = '#e8ecff';
  const s = Math.max(1, Math.round(1.3 * k));
  for (let i = 0; i < 40; i++) {
    const y = hash2(i, 71) * h * 0.5;
    ctx.globalAlpha = (0.2 + 0.5 * hash2(i, 73)) * (1 - y / (h * 0.5)) * (0.75 + 0.25 * Math.sin(t * 1.3 + i * 2.1));
    ctx.fillRect(hash2(i, 75) * w, y, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  // a pale aurora over the hunting grounds, slow as breath
  if (tier() > 0)
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 7; j++) {
        const x = w * (j / 6) + Math.sin(t * 0.05 + i + j) * 40 * k;
        const y = h * (0.13 + i * 0.07) + Math.sin(j * 1.3 + t * 0.08 + i * 2) * h * 0.035;
        blob(ctx, i ? '#3a8aa0' : '#4ac094', x, y, w * 0.12, h * 0.035, 0.1);
      }
  const mx = w * 0.76, my = h * 0.2, mr = h * 0.05;
  blob(ctx, '#b8c4ff', mx, my, mr * 6, mr * 6, 0.16);
  blob(ctx, '#e0805a', w * 0.3, h * 0.95, w * 0.6, h * 0.14, 0.25);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, mx, my, mr, '#ece6d8');
  circle(ctx, mx - mr * 0.32, my - mr * 0.2, mr * 0.22, '#cfc6b6');
  circle(ctx, mx + mr * 0.25, my + mr * 0.35, mr * 0.16, '#d4ccbc');
  circle(ctx, mx + mr * 0.4, my - mr * 0.38, mr * 0.1, '#d4ccbc');
  // the moon's shadowed limb
  circle(ctx, mx + mr * 0.42, my - mr * 0.06, mr * 0.9, rgba('#18203a', 0.4));
  ctx.fillStyle = rgba('#b8a8c0', 0.06);
  for (let i = 0; i < 3; i++) ctx.fillRect(0, h * (0.62 + i * 0.1) + Math.sin(t * 0.12 + i) * 9 * k, w, 17 * k);
}

function miasmaSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  skyFill(ctx, 'miasma', w, h);
  const sx = w * 0.3, sy = h * 0.3;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#c8e090', sx, sy, h * 0.3, h * 0.3, 0.22);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, h * 0.045, rgba('#e8f0c0', 0.75));
  // swarms drifting over the marsh, each a dark breath of specks
  const s = Math.max(1, Math.round(1.5 * k));
  for (let i = 0; i < 4; i++) {
    const span = w + 600 * k;
    const cx = ((t * (5 + i * 2) * k * 3 + hash2(i, 81) * span) % span) - 300 * k;
    const cy = h * (0.14 + i * 0.09);
    blob(ctx, '#0a120c', cx, cy, (120 + i * 20) * k, (24 + i * 4) * k, 0.45);
    ctx.fillStyle = '#081008';
    const n = tier() > 0 ? 18 : 8;
    for (let j = 0; j < n; j++) {
      const px = cx + (hash2(i, j) - 0.5) * 240 * k + Math.sin(t * 2 + j) * 4 * k;
      const py = cy + (hash2(j, i + 5) - 0.5) * 56 * k + Math.cos(t * 1.7 + j * 1.3) * 3 * k;
      ctx.fillRect(px, py, s, s);
    }
  }
  ctx.fillStyle = rgba('#b8d488', 0.06);
  for (let i = 0; i < 3; i++) ctx.fillRect(0, h * (0.6 + i * 0.11) + Math.sin(t * 0.12 + i) * 9 * k, w, 17 * k);
}

function ashSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  skyFill(ctx, 'ash', w, h);
  const sx = w * 0.72, sy = h * 0.23;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff9a50', sx, sy, h * 0.22, h * 0.22, 0.2);
  blob(ctx, '#ff6a20', w * 0.5, h, w * 0.8, h * 0.25, 0.28 + 0.04 * Math.sin(t * 1.3));
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, h * 0.03, '#f0b070');
  // smoke drawn across the sun in bars
  box(ctx, rgba('#5a3a3a', 0.8), sx - h * 0.05, sy - h * 0.008, h * 0.1, h * 0.01);
  box(ctx, rgba('#5a3a3a', 0.6), sx - h * 0.035, sy + h * 0.012, h * 0.08, h * 0.006);
  // columns of smoke from the stacks, leaning with the wind
  const n = tier() > 0 ? 5 : 3;
  for (let i = 0; i < 3; i++) {
    const x = w * (0.12 + i * 0.34);
    for (let j = 0; j < n; j++) {
      const f = j / n;
      blob(ctx, '#24161a', x + Math.sin(t * 0.2 + j + i) * 10 * k + f * 80 * k, h * (0.78 - f * 0.6), (40 + f * 90) * k, (22 + f * 30) * k, 0.4 * (1 - f * 0.5));
    }
  }
  ctx.fillStyle = rgba('#ffb66b', 0.045);
  for (let i = 0; i < 3; i++) ctx.fillRect(0, h * (0.65 + i * 0.1) + Math.sin(t * 0.14 + i) * 5 * k, w, 12 * k);
}

// ---------------------------------------------------------------- parallax pieces

/** A snow-laden pine: a tapering trunk and drooping tiers, snow on each tier's shoulders. */
function pineSil(ctx: Ctx, x: number, base: number, h: number, col: string, snow: string | null, rng: RNG) {
  box(ctx, col, x - h * 0.018, base - h * 0.3, h * 0.036, h * 0.3);
  const tiers = 5 + rng.int(0, 3);
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const y = base - h * 0.12 - f * h * 0.8;
    const ww = h * (0.26 * (1 - f) + 0.05) * rng.range(0.85, 1.1);
    const top = y - h * (0.2 - f * 0.08);
    poly(ctx, [x - ww, y, x - ww * 0.5, y - h * 0.05, x, top, x + ww * 0.5, y - h * 0.05, x + ww, y, x + ww * 0.3, y - h * 0.025, x, y - h * 0.01, x - ww * 0.3, y - h * 0.025], col);
    if (snow) poly(ctx, [x - ww * 0.62, y - h * 0.035, x, top, x + ww * 0.62, y - h * 0.035, x + ww * 0.3, y - h * 0.045, x, top + h * 0.05, x - ww * 0.35, y - h * 0.05], snow);
  }
}

/** A bare winter tree: forked limbs reaching up. */
function bareTree(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  const branch = (x0: number, y0: number, len: number, a: number, lw: number, d: number) => {
    const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (d > 0) {
      branch(x1, y1, len * 0.72, a - rng.range(0.25, 0.65), lw * 0.62, d - 1);
      branch(x1, y1, len * 0.72, a + rng.range(0.25, 0.65), lw * 0.62, d - 1);
    }
  };
  branch(x, base, h * 0.36, rng.range(-0.08, 0.08), Math.max(1.5, h * 0.05), 4);
}

/** A weeping willow: a crooked trunk and a crown of moss-hung strands. */
function willowSil(ctx: Ctx, x: number, base: number, h: number, col: string, moss: string, rng: RNG) {
  const lean = rng.range(-0.2, 0.2) * h;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.05, base);
  ctx.quadraticCurveTo(x - h * 0.02, base - h * 0.4, x + lean - h * 0.02, base - h * 0.75);
  ctx.lineTo(x + lean + h * 0.02, base - h * 0.75);
  ctx.quadraticCurveTo(x + h * 0.03, base - h * 0.4, x + h * 0.06, base);
  ctx.fill();
  const cx = x + lean, cy = base - h * 0.78;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const ox = (i / 6 - 0.5) * h * 0.56, oy = -Math.cos((i / 6 - 0.5) * 2.4) * h * 0.08;
    ctx.moveTo(cx + ox + h * 0.12, cy + oy);
    ctx.ellipse(cx + ox, cy + oy, h * 0.12, h * 0.08, 0, 0, TAU);
  }
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, h * 0.012);
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const sx = cx + rng.range(-0.34, 0.34) * h, sy = cy + rng.range(-0.02, 0.12) * h;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + rng.range(-3, 3), sy + rng.range(0.15, 0.45) * h);
  }
  ctx.stroke();
  ctx.strokeStyle = moss;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const sx = cx + rng.range(-0.3, 0.3) * h, sy = cy + rng.range(0, 0.1) * h;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + rng.range(-2, 2), sy + rng.range(0.1, 0.3) * h);
  }
  ctx.stroke();
}

/** A giant marsh fungus: a pale stalk and a cap whose gills glow. */
function fungusSil(ctx: Ctx, x: number, base: number, h: number, col: string, glowCol: string | null, rng: RNG) {
  const lean = rng.range(-0.15, 0.15) * h;
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1.5, h * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x, base - h * 0.5, x + lean, base - h);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x + lean, base - h, h * 0.42, h * 0.2, 0, Math.PI, TAU);
  ctx.fill();
  if (glowCol) {
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, glowCol, x + lean, base - h + h * 0.02, h * 0.4, h * 0.08, 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** A drowned house: a leaning gable over its own reflection. */
function houseSil(ctx: Ctx, x: number, base: number, s: number, col: string, lit: string | null, rng: RNG) {
  const w = s * rng.range(0.8, 1.3), hh = s * rng.range(0.6, 1), tilt = rng.range(-0.08, 0.08) * s;
  poly(ctx, [x, base, x + tilt, base - hh, x + w * 0.5 + tilt, base - hh - s * 0.5, x + w + tilt, base - hh, x + w, base], col);
  if (lit && rng.chance(0.4)) box(ctx, lit, x + w * 0.35 + tilt * 0.5, base - hh * 0.6, Math.max(1, s * 0.12), Math.max(1, s * 0.16));
}

/** A foundry tower with a chimney, a gantry arm and lit windows. */
function foundrySil(ctx: Ctx, x: number, base: number, s: number, col: string, lit: string, rng: RNG) {
  const w = s * rng.range(0.5, 0.75), hh = s * rng.range(0.8, 1.6);
  box(ctx, col, x, base - hh, w, hh);
  poly(ctx, [x - s * 0.06, base - hh, x + w * 0.5, base - hh - s * 0.18, x + w + s * 0.06, base - hh], col);
  const cx = x + w * rng.range(0.15, 0.6), ch = s * rng.range(0.5, 1.1);
  box(ctx, col, cx, base - hh - ch, s * 0.1, ch);
  box(ctx, col, cx - s * 0.02, base - hh - ch, s * 0.14, s * 0.04);
  if (rng.chance(0.6)) {
    box(ctx, col, x + w, base - hh * 0.7, s * 0.4, s * 0.03);
    box(ctx, col, x + w + s * 0.36, base - hh * 0.7, s * 0.02, s * 0.2);
  }
  for (let i = 0; i < 3; i++) if (rng.chance(0.7)) box(ctx, lit, x + w * (0.2 + i * 0.25), base - hh * rng.range(0.3, 0.7), Math.max(1, s * 0.07), Math.max(1, s * 0.12));
}

/** A lattice girder rising out of frame, X-braced. */
function girder(ctx: Ctx, x: number, top: number, base: number, wd: number, col: string) {
  box(ctx, col, x, top, 2, base - top);
  box(ctx, col, x + wd - 2, top, 2, base - top);
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let y = top; y < base; y += wd) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + wd, y + wd);
    ctx.moveTo(x + wd, y);
    ctx.lineTo(x, y + wd);
  }
  ctx.stroke();
}

/** A cog half-sunk in shadow. */
function cog(ctx: Ctx, x: number, y: number, r: number, col: string, teeth: number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * TAU, rr = i & 1 ? r : r * 1.14;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.moveTo(x + r * 0.35, y);
  ctx.arc(x, y, r * 0.35, 0, TAU, true);
  ctx.fill('evenodd');
}

/** Ribs and a skull on a heap: what the hunt leaves. */
function boneHeap(ctx: Ctx, x: number, base: number, s: number, col: string, bone: string, rng: RNG) {
  poly(ctx, [x - s, base, x - s * 0.5, base - s * 0.35, x, base - s * 0.45, x + s * 0.6, base - s * 0.3, x + s, base], col);
  ctx.strokeStyle = bone;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const rx = x + rng.range(-0.5, 0.4) * s;
    ctx.moveTo(rx, base - s * 0.3);
    ctx.quadraticCurveTo(rx + s * 0.15, base - s * 0.75, rx + s * 0.32, base - s * 0.35);
  }
  ctx.stroke();
  circle(ctx, x + rng.range(-0.3, 0.3) * s, base - s * 0.42, s * 0.12, bone);
}

/** A stalactite hanging from the strip's top. */
function drip(ctx: Ctx, x: number, top: number, wd: number, len: number, col: string) {
  poly(ctx, [x - wd, top, x + wd, top, x + wd * 0.3, top + len * 0.7, x, top + len, x - wd * 0.25, top + len * 0.6], col);
}

/** Fill everything above a ridge line: a cave ceiling. */
function fillCeil(ctx: Ctx, w: number, hy: (x: number) => number, col: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, hy(x));
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- parallax

export function fallenParallax(biome: FallenBiome, pal: BiomePal, seed: number, interior: boolean, viewH: number, res: number): Layer[] {
  const layers: Layer[] = [];
  const W = 1024, H = Math.round(viewH * 1.6);
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
  const scatter = (w: number, rng: RNG, lo: number, hi: number, reach: number, f: (x: number, r: RNG) => void) => {
    for (let x = rng.range(0, lo); x < w; x += rng.range(lo, hi)) {
      const sd = rng.int(0, 99999);
      wrap(x, reach, w, (xx) => f(xx, new RNG(sd)));
    }
  };
  const mist = (ctx: Ctx, w: number, y: number, col: string, a: number) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 0; x < w; x += 90) blob(ctx, col, x + 45, y, 110, 14, a);
    ctx.globalCompositeOperation = 'source-over';
  };

  if (biome === 'hunt' && !interior) {
    // Far: a range of snowfields, the thaw eating them from below.
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8, n0 = wrapNoise(w, 150, seed, 4), n1 = wrapNoise(w, 50, seed + 1, 3);
      const peak = (x: number) => hz - 10 - n0(x) * h * 0.17 - n1(x) * 10;
      fillRidge(ctx, w, h, peak, '#8a90aa');
      // the snowline sits lower on the high peaks; the thaw has bared the rest
      fillRidge(ctx, w, h, (x) => peak(x) + 6 + n1(x) * 18 + n0(x) * 16, '#30344c');
      ctx.strokeStyle = rgba('#c8d0e8', 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        if (x) ctx.lineTo(x, peak(x) + 0.5);
        else ctx.moveTo(x, peak(x) + 0.5);
      }
      ctx.stroke();
      const n2 = wrapNoise(w, 80, seed + 2, 3);
      fillRidge(ctx, w, h, (x) => hz + 6 - n2(x) * h * 0.1, '#1e2234');
      mist(ctx, w, hz + 4, '#504860', 0.35);
    }, res * 0.7);
    // Mid: the pinewood, snow on its boughs, a watchtower's lamp.
    mk(0.12, 0.07, (ctx, w, h) => {
      const base = h * 0.86, col = pal.mid, fr = new RNG(seed + 12), n = wrapNoise(w, 120, seed + 11, 3);
      scatter(w, fr, 14, 34, 50, (x, r) => pineSil(ctx, x, base - n(x) * 12 + 4, r.range(80, 150), col, '#4a5068', r));
      scatter(w, fr, 300, 500, 30, (x) => {
        box(ctx, col, x - 10, base - 96, 2, 96);
        box(ctx, col, x + 8, base - 96, 2, 96);
        poly(ctx, [x - 16, base - 96, x, base - 112, x + 16, base - 96], col);
        box(ctx, col, x - 12, base - 96, 24, 14);
        box(ctx, '#e0a050', x - 3, base - 92, 3, 5);
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#ff9a40', x - 1, base - 90, 16, 12, 0.3);
        ctx.globalCompositeOperation = 'source-over';
      });
      fillRidge(ctx, w, h, (x) => base - n(x) * 12, col);
      mist(ctx, w, base - 6, '#5a5068', 0.3);
    });
    // Near: great dark trunks and bare limbs, totems on the path.
    mk(0.36, 0.14, (ctx, w, h) => {
      const base = h * 0.93, col = pal.near, fr = new RNG(seed + 22);
      scatter(w, fr, 160, 260, 40, (x, r) => {
        const tw = r.range(12, 22);
        box(ctx, col, x - tw / 2, 0, tw, base);
        bareTree(ctx, x, base * r.range(0.25, 0.5), r.range(110, 160), col, r);
        box(ctx, '#3a4058', x - tw / 2 + 2, base * 0.3, 2, base * 0.4);
      });
      scatter(w, fr, 140, 240, 20, (x, r) => {
        box(ctx, col, x - 2, base - 60, 4, 60);
        poly(ctx, [x - 8, base - 60, x + 8, base - 60, x + 5, base - 50, x - 5, base - 50], col);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const sx of [-1, 1]) {
          ctx.moveTo(x + sx * 4, base - 60);
          ctx.quadraticCurveTo(x + sx * 18, base - 70, x + sx * 16, base - 86);
          ctx.moveTo(x + sx * 12, base - 70);
          ctx.lineTo(x + sx * 22, base - 74 - r.range(0, 4));
        }
        ctx.stroke();
      });
      fillRidge(ctx, w, h, () => base, col);
    });
    return layers;
  }
  if (biome === 'hunt') {
    // Den walls: earth and root, bones heaped where the packs eat.
    mk(0.06, 0.04, (ctx, w, h) => {
      const n = wrapNoise(w, 90, seed, 4), n2 = wrapNoise(w, 70, seed + 3, 3);
      fillCeil(ctx, w, (x) => h * 0.14 + n(x) * h * 0.14, '#2a1e22');
      fillRidge(ctx, w, h, (x) => h * 0.8 - n2(x) * h * 0.14, '#2a1e22');
      ctx.globalCompositeOperation = 'lighter';
      for (let x = 60; x < w; x += 220) blob(ctx, '#8a4020', x, h * 0.8, 120, 50, 0.22);
      ctx.globalCompositeOperation = 'source-over';
      const fr = new RNG(seed + 4);
      ctx.strokeStyle = '#3a2a2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const x = fr.range(0, w), y = h * 0.14 + n(x) * h * 0.14 - 2;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + fr.range(-8, 8), y + 30, x + fr.range(-6, 6), y + fr.range(30, 90));
      }
      ctx.stroke();
    }, res * 0.7);
    mk(0.16, 0.08, (ctx, w, h) => {
      const col = '#1a1216', base = h * 0.88, fr = new RNG(seed + 14);
      scatter(w, fr, 60, 140, 40, (x, r) => drip(ctx, x, 0, r.range(8, 18), r.range(50, 140), col));
      scatter(w, fr, 90, 180, 50, (x, r) => boneHeap(ctx, x, base + 2, r.range(26, 44), col, '#5a4a44', r));
      // antler chandeliers on chains
      scatter(w, fr, 260, 420, 40, (x) => {
        box(ctx, col, x, 0, 1.5, h * 0.3);
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const sx of [-1, 1]) {
          ctx.moveTo(x, h * 0.3);
          ctx.quadraticCurveTo(x + sx * 26, h * 0.3 + 6, x + sx * 34, h * 0.3 - 14);
          ctx.moveTo(x + sx * 18, h * 0.3 + 2);
          ctx.lineTo(x + sx * 22, h * 0.3 - 12);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        for (const sx of [-1, 1]) blob(ctx, '#ff9a40', x + sx * 34, h * 0.3 - 18, 12, 12, 0.5);
        ctx.globalCompositeOperation = 'source-over';
      });
      fillRidge(ctx, w, h, () => base, col);
    });
    mk(0.4, 0.15, (ctx, w, h) => {
      const col = '#0a0708', fr = new RNG(seed + 24);
      scatter(w, fr, 180, 320, 40, (x, r) => drip(ctx, x, 0, r.range(16, 30), r.range(80, 160), col));
      scatter(w, fr, 140, 260, 30, (x, r) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.moveTo(x + i * 5, 0);
          ctx.quadraticCurveTo(x + i * 5 + r.range(-10, 10), 60, x + i * 4 + r.range(-6, 6), r.range(70, 150));
        }
        ctx.stroke();
      });
    });
    return layers;
  }
  if (biome === 'plague' && !interior) {
    // Far: the drowned town, its plague towers lit green.
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8, col = '#2a4234', fr = new RNG(seed + 2), n = wrapNoise(w, 140, seed, 3);
      fillRidge(ctx, w, h, (x) => hz - 20 - n(x) * h * 0.14, '#365640');
      scatter(w, fr, 24, 60, 30, (x, r) => houseSil(ctx, x, hz + 2, r.range(16, 26), col, '#9ad070', r));
      scatter(w, fr, 160, 300, 20, (x, r) => {
        const th = r.range(70, 120);
        box(ctx, col, x - 5, hz - th, 10, th);
        poly(ctx, [x - 9, hz - th, x, hz - th - 22, x + 9, hz - th], col);
        box(ctx, '#b8e080', x - 1, hz - th + 8, 2, 4);
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#8ad050', x, hz - th + 10, 14, 14, 0.4);
        ctx.globalCompositeOperation = 'source-over';
      });
      box(ctx, '#2a4234', 0, hz, w, h - hz);
      ctx.fillStyle = rgba('#a8c878', 0.25);
      for (let i = 0; i < 60; i++) ctx.fillRect(fr.range(0, w), hz + fr.range(2, h - hz - 2), fr.range(6, 30), 1);
      mist(ctx, w, hz, '#5a7a48', 0.35);
    }, res * 0.7);
    // Mid: willows over the bog, their moss hanging to the water.
    mk(0.13, 0.07, (ctx, w, h) => {
      const base = h * 0.86, col = pal.mid, fr = new RNG(seed + 12), n = wrapNoise(w, 100, seed + 13, 3);
      scatter(w, fr, 70, 150, 70, (x, r) => willowSil(ctx, x, base + 2, r.range(90, 150), col, '#4a6a3c', r));
      scatter(w, fr, 40, 90, 30, (x, r) => fungusSil(ctx, x, base + 2, r.range(18, 34), col, '#9ae060', r));
      fillRidge(ctx, w, h, (x) => base - n(x) * 8, col);
      mist(ctx, w, base - 4, '#6a8a50', 0.35);
    });
    // Near: reeds and fungus stalks, dark against the haze.
    mk(0.38, 0.15, (ctx, w, h) => {
      const base = h * 0.93, col = pal.near, fr = new RNG(seed + 22);
      scatter(w, fr, 30, 70, 40, (x, r) => reedSil(ctx, x - 20, base + 4, 46, r.range(40, 80), col, r));
      scatter(w, fr, 160, 300, 50, (x, r) => fungusSil(ctx, x, base + 2, r.range(50, 90), col, '#7ad040', r));
      fillRidge(ctx, w, h, () => base, col);
    });
    return layers;
  }
  if (biome === 'plague') {
    // The sporeworks and the hive: vats glowing through their ports, wax and pipe.
    mk(0.06, 0.04, (ctx, w, h) => {
      const col = '#14241a', base = h * 0.84, fr = new RNG(seed + 2);
      scatter(w, fr, 120, 200, 70, (x, r) => {
        const vw = r.range(40, 64), vh = r.range(90, 150);
        box(ctx, col, x - vw / 2, base - vh, vw, vh);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(x, base - vh, vw / 2, vw * 0.22, 0, Math.PI, TAU);
        ctx.fill();
        box(ctx, '#1e3424', x - vw / 2, base - vh * 0.6, vw, 3);
        box(ctx, '#1e3424', x - vw / 2, base - vh * 0.25, vw, 3);
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#6ac040', x, base - vh * 0.45, vw * 0.35, vh * 0.2, 0.35);
        ctx.globalCompositeOperation = 'source-over';
        circle(ctx, x, base - vh * 0.45, 5, '#9ae070');
        box(ctx, col, x + vw / 2, base - vh * 0.8, r.range(30, 70), 6);
      });
      fillCeil(ctx, w, () => h * 0.1, col);
      fillRidge(ctx, w, h, () => base, col);
    }, res * 0.7);
    mk(0.16, 0.08, (ctx, w, h) => {
      const col = '#0c1810', fr = new RNG(seed + 12), base = h * 0.9;
      // fragments of wax comb
      ctx.strokeStyle = '#1c3020';
      ctx.lineWidth = 2;
      scatter(w, fr, 200, 340, 60, (x, r) => {
        const cx0 = x, cy0 = h * r.range(0.25, 0.5), s = 10;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const hx = cx0 + (i % 3) * s * 1.7 + ((i / 3) | 0) % 2 * s * 0.85, hy = cy0 + ((i / 3) | 0) * s * 1.5;
          for (let a = 0; a <= 6; a++) {
            const px = hx + Math.cos((a / 6) * TAU + Math.PI / 6) * s, py = hy + Math.sin((a / 6) * TAU + Math.PI / 6) * s;
            if (a) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          }
        }
        ctx.stroke();
      });
      // cocoons hung on threads
      scatter(w, fr, 70, 150, 20, (x, r) => {
        const len = r.range(40, 140);
        box(ctx, col, x, 0, 1, len);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(x, len + 12, 6, 14, 0, 0, TAU);
        ctx.fill();
      });
      fillRidge(ctx, w, h, () => base, col);
    });
    mk(0.4, 0.15, (ctx, w, h) => {
      const col = '#060c08', fr = new RNG(seed + 22);
      box(ctx, col, 0, 0, w, 14);
      scatter(w, fr, 90, 200, 20, (x, r) => box(ctx, col, x, 0, r.range(10, 18), r.range(30, 70)));
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 50; i++) {
        const x = fr.range(0, w);
        ctx.moveTo(x, 12);
        ctx.lineTo(x + fr.range(-2, 2), fr.range(30, 110));
      }
      ctx.stroke();
    });
    return layers;
  }
  if (!interior) {
    // Far: the forge-mountain, lava threading its flanks, a plume over it.
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.78, n = wrapNoise(w, 70, seed, 3);
      const cone = (x: number) => {
        const d = Math.abs(((x - w * 0.55 + w * 1.5) % w) - w * 0.5) / (w * 0.5);
        return hz - Math.max(0, 1 - d * 1.6) * h * 0.42 - n(x) * 14;
      };
      fillRidge(ctx, w, h, cone, '#3a2428');
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff7a30', 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const fr = new RNG(seed + 3);
      for (let i = 0; i < 7; i++) {
        let x = w * 0.55 + fr.range(-30, 30), y = cone(w * 0.55) + 6;
        ctx.moveTo(x, y);
        for (let j = 0; j < 10; j++) {
          x += fr.range(-12, 12) + (i - 3) * 4;
          y += fr.range(12, 22);
          if (y > hz) break;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      blob(ctx, '#ff6a20', w * 0.55, cone(w * 0.55), 50, 22, 0.5);
      ctx.globalCompositeOperation = 'source-over';
      for (let j = 0; j < 6; j++) blob(ctx, '#2a181c', w * 0.55 + j * 22, cone(w * 0.55) - 20 - j * 26, 30 + j * 14, 16 + j * 6, 0.6);
      fillRidge(ctx, w, h, (x) => hz + 4 - n(x + 300) * 20, '#2c1c20');
    }, res * 0.7);
    // Mid: foundry towers, stacks and gantries.
    mk(0.13, 0.07, (ctx, w, h) => {
      const base = h * 0.88, col = pal.mid, fr = new RNG(seed + 12);
      scatter(w, fr, 50, 110, 60, (x, r) => foundrySil(ctx, x, base, r.range(60, 110), col, '#e08a40', r));
      fillRidge(ctx, w, h, () => base, col);
      ctx.globalCompositeOperation = 'lighter';
      for (let x = 30; x < w; x += 160) blob(ctx, '#ff7a30', x, base, 80, 12, 0.18);
      ctx.globalCompositeOperation = 'source-over';
    });
    // Near: girders and hanging hooks.
    mk(0.38, 0.15, (ctx, w, h) => {
      const base = h * 0.94, col = pal.near, fr = new RNG(seed + 22);
      scatter(w, fr, 200, 340, 30, (x) => girder(ctx, x, 0, base, 14, col));
      box(ctx, col, 0, h * 0.08, w, 6);
      scatter(w, fr, 90, 200, 10, (x, r) => {
        const len = r.range(40, 140);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.08);
        ctx.lineTo(x, h * 0.08 + len);
        ctx.arc(x + 4, h * 0.08 + len + 2, 4, Math.PI, Math.PI * 0.2, true);
        ctx.stroke();
      });
      fillRidge(ctx, w, h, () => base, col);
    });
    return layers;
  }
  // Inside the foundry: furnace mouths in the far wall, cogs and chains, a truss overhead.
  mk(0.06, 0.04, (ctx, w, h) => {
    const col = '#20120e', base = h * 0.86, fr = new RNG(seed + 2);
    box(ctx, col, 0, 0, w, h);
    ctx.fillStyle = '#281812';
    for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 0 : 12; x < w; x += 24) ctx.fillRect(x, y, 22, 8);
    scatter(w, fr, 150, 240, 60, (x, r) => {
      const aw = r.range(40, 60), ah = r.range(50, 80);
      ctx.fillStyle = '#0c0606';
      ctx.beginPath();
      ctx.moveTo(x - aw / 2, base);
      ctx.lineTo(x - aw / 2, base - ah);
      ctx.arc(x, base - ah, aw / 2, Math.PI, TAU);
      ctx.lineTo(x + aw / 2, base);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff6a1a', x, base - ah * 0.4, aw * 0.6, ah * 0.6, 0.6);
      blob(ctx, '#ffc070', x, base - ah * 0.25, aw * 0.3, ah * 0.25, 0.4);
      ctx.globalCompositeOperation = 'source-over';
    });
    box(ctx, '#140a08', 0, base, w, h - base);
  }, res * 0.7);
  mk(0.16, 0.08, (ctx, w, h) => {
    const col = '#100806', fr = new RNG(seed + 12), base = h * 0.92;
    scatter(w, fr, 220, 380, 70, (x, r) => cog(ctx, x, h * r.range(0.3, 0.6), r.range(30, 56), col, r.int(9, 14)));
    scatter(w, fr, 80, 160, 10, (x, r) => {
      const len = r.range(60, h * 0.6);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, len);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  mk(0.4, 0.15, (ctx, w, h) => {
    const col = '#060303', fr = new RNG(seed + 22);
    box(ctx, col, 0, 0, w, 10);
    box(ctx, col, 0, 30, w, 4);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 24) {
      ctx.moveTo(x, 10);
      ctx.lineTo(x + 12, 30);
      ctx.lineTo(x + 24, 10);
    }
    ctx.stroke();
    scatter(w, fr, 200, 360, 30, (x) => girder(ctx, x, 34, h, 12, col));
  });
  return layers;
}

// ---------------------------------------------------------------- tiles

const SNOW = '#c8ccd8', SNOW_LIT = '#eef0f8', SNOW_DK = '#8a90a8';
const MOSS = '#5a7a3c', MOSS_LIT = '#8aac58', MOSS_DK = '#2e4422';
const IRON = '#4a3e3c', IRON_LIT = '#8a7464', IRON_DK = '#221a1a', HOT = '#ff8a3a';

/** Solid ground: thawing loam under grey snow, peat under moss, soot-black brick under iron. */
export function drawSolidFallen(ctx: Ctx, biome: FallenBiome, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean, interior: boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
  if (t === T.Seal) base = '#7a5a28';
  if (t === T.Wood) base = pal.plat;
  const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  box(ctx, mix(dark, '#000000', v * 0.12), x, y, TILE, TILE);
  if (biome === 'hunt') huntTile(ctx, x, y, tx, ty, depth, up, dn, lf, rt, interior);
  else if (biome === 'plague') plagueTile(ctx, x, y, tx, ty, depth, up, dn, lf, rt, interior);
  else cinderTile(ctx, x, y, tx, ty, depth, up, dn, interior);
  if (!lf) box(ctx, 'rgba(255,230,200,0.08)', x, y, 1, TILE);
  if (!rt) box(ctx, 'rgba(0,0,0,0.3)', x + TILE - 2, y, 2, TILE);
}

function huntTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, interior: boolean) {
  if (depth <= 1) {
    // earth in bands, a stone or a root through it
    const b0 = 5 + Math.floor(hash2(tx, ty, 701) * 4);
    box(ctx, 'rgba(10,6,8,0.32)', x, y + b0, TILE, 1);
    box(ctx, 'rgba(200,180,170,0.06)', x, y + b0 + 1, TILE, 1);
    const k = hash2(tx, ty, 702);
    if (k < 0.14) {
      const sx = x + 2 + Math.floor(hash2(tx, ty, 703) * 10);
      box(ctx, '#5a5058', sx, y + b0 + 3, 4, 3);
      box(ctx, '#7a7078', sx, y + b0 + 3, 3, 1);
    } else if (interior && k < 0.24) {
      // a bone in the den wall
      const bx = x + 3 + Math.floor(hash2(tx, ty, 704) * 6);
      box(ctx, '#b8ac98', bx, y + 9, 6, 2);
      box(ctx, '#d8ccb8', bx - 1, y + 8, 2, 2);
      box(ctx, '#d8ccb8', bx + 5, y + 10, 2, 2);
    }
    // claw marks on exposed faces: three strokes raking down
    if ((!lf || !rt) && hash2(tx, ty, 705) < 0.18) {
      ctx.fillStyle = 'rgba(8,4,6,0.6)';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 8; j++) ctx.fillRect(x + 4 + i * 3 + (j >> 2), y + 3 + j, 1, 1);
      ctx.fillStyle = 'rgba(220,200,190,0.18)';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 5 + i * 3, y + 3, 1, 6);
    }
  }
  if (!up) {
    if (interior) {
      // trampled den floor: packed earth, straw and bone chips
      box(ctx, '#3a2c2a', x, y, TILE, 4);
      box(ctx, '#5a4640', x, y, TILE, 1);
      ctx.fillStyle = '#8a7458';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + Math.floor(hash2(tx, i, 706) * 14), y + 1 + i, 3, 1);
      if (hash2(tx, ty, 707) < 0.15) box(ctx, '#c8bca8', x + 4 + Math.floor(hash2(tx, ty, 708) * 8), y - 1, 3, 1);
      return;
    }
    // the thaw: a grey crust of old snow, broken where dead grass shows through
    const melt = hash2(tx, ty, 709) < 0.35;
    box(ctx, '#2a2024', x, y + 3, TILE, 2);
    if (melt) {
      box(ctx, '#4a4038', x, y, TILE, 4);
      ctx.fillStyle = '#8a7a58';
      for (let i = 0; i < 5; i++) {
        const gx = x + Math.floor(hash2(tx, i, 710) * 15), gh = 2 + Math.floor(hash2(tx, i, 711) * 3);
        ctx.fillRect(gx, y - gh + 1, 1, gh);
      }
      box(ctx, SNOW_DK, x + Math.floor(hash2(tx, ty, 712) * 8), y, 5, 2);
      box(ctx, 'rgba(160,190,230,0.35)', x + 2, y + 2, 6, 1);
    } else {
      box(ctx, SNOW_DK, x, y, TILE, 4);
      box(ctx, SNOW, x, y, TILE, 3);
      box(ctx, SNOW_LIT, x, y, TILE, 1);
      // a ragged lower edge to the crust, and its drifts
      ctx.fillStyle = SNOW_DK;
      for (let i = 0; i < 4; i++) if (hash2(tx, i, 713) < 0.5) ctx.fillRect(x + i * 4, y + 4, 3, 1);
      if (hash2(tx, ty, 714) < 0.3) {
        box(ctx, SNOW, x + 4, y - 1, 7, 1);
        box(ctx, SNOW_LIT, x + 5, y - 1, 4, 1);
      }
      if (hash2(tx, ty, 715) < 0.15) box(ctx, '#3a2a2e', x + 3 + Math.floor(hash2(tx, ty, 716) * 9), y + 1, 2, 1);
    }
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.38)', x, y + TILE - 2, TILE, 2);
    // roots, or icicles where the meltwater refroze
    const k = hash2(tx, ty, 717);
    if (k < 0.3) {
      const rx = x + 3 + Math.floor(hash2(tx, ty, 718) * 9), len = 3 + Math.floor(k * 20);
      box(ctx, '#2a1e1a', rx, y + TILE, 1, len);
      box(ctx, '#2a1e1a', rx + 1, y + TILE + len - 2, 1, 2);
    } else if (!interior && k < 0.45) {
      const ix = x + 4 + Math.floor(hash2(tx, ty, 719) * 7);
      poly(ctx, [ix, y + TILE, ix + 3, y + TILE, ix + 1.5, y + TILE + 6], 'rgba(200,220,240,0.7)');
    }
  }
}

function plagueTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, interior: boolean) {
  if (depth <= 1) {
    if (interior) {
      // the sporeworks' brick, green-glazed in courses, rust weeping from the joints
      const off = ty & 1 ? 8 : 0;
      box(ctx, 'rgba(6,12,8,0.4)', x, y, TILE, 1);
      box(ctx, 'rgba(6,12,8,0.4)', x + off, y, 1, TILE);
      box(ctx, 'rgba(6,12,8,0.3)', x, y + 8, TILE, 1);
      if (ty % 4 === 1) {
        box(ctx, '#3a6a44', x, y + 2, TILE, 4);
        box(ctx, '#5a9a5a', x, y + 2, TILE, 1);
      }
      if (hash2(tx, ty, 721) < 0.12) box(ctx, 'rgba(140,70,30,0.45)', x + off + 1, y + 1, 1, 6 + Math.floor(hash2(tx, ty, 722) * 6));
    } else {
      // peat laid in mats, a glowing spore in it now and then
      const b0 = 4 + Math.floor(hash2(tx, ty, 723) * 4), b1 = 10 + Math.floor(hash2(tx, ty, 724) * 3);
      box(ctx, 'rgba(6,10,6,0.3)', x, y + b0, TILE, 1);
      box(ctx, 'rgba(6,10,6,0.3)', x, y + b1, TILE, 1);
      if (hash2(tx, ty, 725) < 0.12) {
        const sx = x + 2 + Math.floor(hash2(tx, ty, 726) * 11);
        box(ctx, '#8ad050', sx, y + b0 + 2, 1, 1);
        box(ctx, 'rgba(140,220,90,0.35)', sx - 1, y + b0 + 1, 3, 3);
      }
    }
  }
  if (!up) {
    // a thick moss pelt, hanging over the edges, a fungus or two on it
    box(ctx, MOSS_DK, x, y, TILE, 5);
    box(ctx, MOSS, x, y, TILE, 3);
    box(ctx, MOSS_LIT, x, y, TILE, 1);
    ctx.fillStyle = MOSS_DK;
    for (let i = 0; i < 4; i++) if (hash2(tx, i, 727) < 0.6) ctx.fillRect(x + i * 4 + 1, y + 5, 2, 1 + Math.floor(hash2(tx, i, 728) * 3));
    if (!lf) box(ctx, MOSS, x - 1, y + 1, 2, 5);
    if (!rt) box(ctx, MOSS, x + TILE - 1, y + 1, 2, 5);
    const k = hash2(tx, ty, 729);
    if (k < 0.12) {
      // a small toadstool, its cap pale and spotted
      const fx = x + 3 + Math.floor(hash2(tx, ty, 730) * 9);
      box(ctx, '#c8c8a0', fx + 1, y - 3, 1, 3);
      box(ctx, '#a8d070', fx - 1, y - 5, 5, 2);
      box(ctx, '#e8f0b0', fx, y - 5, 1, 1);
    } else if (k < 0.3) {
      ctx.fillStyle = '#6a8a40';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + Math.floor(hash2(tx, i, 731) * 15), y - 2, 1, 2);
    }
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.38)', x, y + TILE - 2, TILE, 2);
    // slime gathering into drips
    const k = hash2(tx, ty, 732);
    if (k < 0.35) {
      const dx = x + 2 + Math.floor(hash2(tx, ty, 733) * 11), len = 2 + Math.floor(k * 18);
      box(ctx, 'rgba(120,180,70,0.6)', dx, y + TILE, 1, len);
      box(ctx, 'rgba(150,220,90,0.8)', dx, y + TILE + len, 1, 1);
    }
  }
}

function cinderTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean, interior: boolean) {
  if (depth <= 1) {
    // soot-black brick, every few courses bound with a riveted iron plate
    const off = ty & 1 ? 8 : 0;
    box(ctx, 'rgba(0,0,0,0.4)', x, y, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.4)', x + off, y, 1, 8);
    box(ctx, 'rgba(0,0,0,0.35)', x, y + 8, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.4)', x + ((off + 8) % 16), y + 8, 1, 8);
    box(ctx, 'rgba(255,200,160,0.06)', x, y + 1, TILE, 1);
    if (hash2(tx >> 1, ty, 741) < 0.22 && up) {
      box(ctx, IRON_DK, x, y + 2, TILE, 10);
      box(ctx, IRON, x, y + 3, TILE, 8);
      box(ctx, IRON_LIT, x, y + 3, TILE, 1);
      box(ctx, '#c8a080', x + 3, y + 5, 1, 1);
      box(ctx, '#c8a080', x + 12, y + 5, 1, 1);
      box(ctx, '#c8a080', x + 3, y + 9, 1, 1);
      box(ctx, '#c8a080', x + 12, y + 9, 1, 1);
    }
    // cracks still holding heat
    if (hash2(tx, ty, 742) < 0.08) {
      box(ctx, HOT, x + 5, y + 4, 1, 3);
      box(ctx, HOT, x + 6, y + 7, 2, 1);
      box(ctx, '#ffd090', x + 5, y + 5, 1, 1);
    }
  }
  if (!up) {
    // the iron walkway: a plate on a lip, a seam glowing where it was welded
    box(ctx, IRON_DK, x, y, TILE, 5);
    box(ctx, interior ? '#5a4842' : '#6a564a', x, y, TILE, 4);
    box(ctx, IRON_LIT, x, y, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.5)', x + (tx & 1 ? 0 : 15), y, 1, 4);
    if ((tx & 1) === 0) box(ctx, '#c8a080', x + 3, y + 2, 1, 1);
    if (hash2(tx, ty, 743) < 0.16) {
      box(ctx, HOT, x + 2, y + 4, 12, 1);
      box(ctx, '#ffd090', x + 5, y + 4, 4, 1);
    }
    if (hash2(tx, ty, 744) < 0.2) box(ctx, '#2a1e1c', x + 2 + Math.floor(hash2(tx, ty, 745) * 10), y - 1, 3, 1);
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.45)', x, y + TILE - 3, TILE, 3);
    // a slag drip, still warm
    if (hash2(tx, ty, 746) < 0.15) {
      const dx = x + 3 + Math.floor(hash2(tx, ty, 747) * 9);
      box(ctx, '#5a2a1a', dx, y + TILE, 2, 3);
      box(ctx, HOT, dx, y + TILE + 3, 2, 1);
    }
  }
}

/** One-way platforms: lashed logs, a rotten boardwalk on stilts, an iron grating on a truss. */
export function drawOneWayFallen(ctx: Ctx, biome: FallenBiome, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'hunt') {
    box(ctx, '#1c1214', x, y, TILE, 7);
    box(ctx, '#5a4034', x, y, TILE, 5);
    box(ctx, '#8a6a52', x, y, TILE, 1);
    box(ctx, 'rgba(20,10,8,0.5)', x, y + 3, TILE, 1);
    box(ctx, SNOW, x + Math.floor(hash2(tx, ty, 751) * 6), y - 1, 6, 1);
    if (tx % 3 === 0) {
      // a hide strap around the logs
      box(ctx, '#a08060', x + 7, y - 1, 2, 8);
      box(ctx, '#6a5040', x + 7, y + 4, 2, 1);
    }
    if (l || r) {
      const px = l ? x + 1 : x + TILE - 4;
      box(ctx, '#2a1c18', px, y - 6, 3, 18);
      box(ctx, '#4a3428', px, y - 6, 1, 18);
      box(ctx, SNOW_LIT, px, y - 7, 3, 1);
      box(ctx, '#7a5a44', l ? x : x + TILE - 2, y, 2, 5);
    }
    return;
  }
  if (biome === 'plague') {
    box(ctx, '#121c12', x, y, TILE, 6);
    // warped planks with gaps between
    for (let i = 0; i < 2; i++) {
      const px = x + i * 8, sag = hash2(tx, i, 752) < 0.3 ? 1 : 0;
      box(ctx, '#4a4a32', px, y + sag, 7, 4);
      box(ctx, '#6a6a46', px, y + sag, 7, 1);
    }
    box(ctx, MOSS, x + Math.floor(hash2(tx, ty, 753) * 10), y - 1, 4, 1);
    if (hash2(tx, ty, 754) < 0.4) box(ctx, MOSS_DK, x + 3 + Math.floor(hash2(tx, ty, 755) * 9), y + 5, 1, 3 + Math.floor(hash2(tx, ty, 756) * 4));
    if (l || r) {
      const px = l ? x + 2 : x + TILE - 5;
      box(ctx, '#2a2a1c', px, y, 3, 14);
      box(ctx, '#3a3a26', px, y, 1, 14);
      box(ctx, '#8a7a50', px - 1, y + 2, 5, 1);
    }
    return;
  }
  // iron grating on a riveted truss
  box(ctx, IRON_DK, x, y, TILE, 5);
  box(ctx, '#6a564a', x, y, TILE, 3);
  box(ctx, IRON_LIT, x, y, TILE, 1);
  ctx.fillStyle = IRON_DK;
  for (let i = 1; i < TILE; i += 3) ctx.fillRect(x + i, y + 1, 1, 2);
  ctx.strokeStyle = '#3a2e2c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 5);
  ctx.lineTo(x + 8, y + 9);
  ctx.lineTo(x + 16, y + 5);
  ctx.stroke();
  box(ctx, '#3a2e2c', x, y + 9, TILE, 1);
  if ((tx & 1) === 0) box(ctx, '#c8a080', x + 8, y + 1, 1, 1);
  if (l || r) {
    const bx = l ? x : x + TILE - 4;
    box(ctx, IRON_DK, bx, y - 1, 4, 11);
    box(ctx, IRON, bx + 1, y, 2, 9);
  }
}

/** Hunters' stakes, a bramble of thorns, hot iron teeth. */
export function drawSpikesFallen(ctx: Ctx, biome: FallenBiome, tx: number, ty: number): boolean {
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'hunt') {
    for (let i = 0; i < 3; i++) {
      const sx = x + 3 + i * 5, top = y + 3 + Math.floor(hash2(tx, i, 761) * 4), lean = hash2(tx, i, 762) < 0.5 ? -1 : 1;
      poly(ctx, [sx - 2, y + TILE, sx + lean, top, sx + 2, y + TILE], '#5a4030', '#0a0606', 0.6);
      box(ctx, '#c8b090', sx + lean, top + 1, 1, 3);
      box(ctx, '#7a2018', sx + lean, top + 4, 1, 2);
    }
    return true;
  }
  if (biome === 'plague') {
    ctx.strokeStyle = '#1e2a16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const sx = x + 2 + i * 6;
      ctx.moveTo(sx, y + TILE);
      ctx.quadraticCurveTo(sx + 5, y + 8, sx + 1, y + 3 + hash2(tx, i, 763) * 4);
    }
    ctx.stroke();
    ctx.fillStyle = '#b8c890';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 1 + Math.floor(hash2(tx, i, 764) * 14), y + 4 + Math.floor(hash2(tx, i, 765) * 10), 1, 1);
    box(ctx, '#8ad050', x + 4 + Math.floor(hash2(tx, ty, 766) * 8), y + 9, 2, 2);
    return true;
  }
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4 + 2;
    poly(ctx, [sx - 2, y + TILE, sx, y + 4 + hash2(tx, i, 767) * 3, sx + 2, y + TILE], '#4a3a36', '#0a0606', 0.5);
    box(ctx, HOT, sx - 1, y + TILE - 4, 2, 3);
  }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff6a20', x + 8, y + TILE - 2, 12, 5, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}

/** Meltwater, bog and quench water; bile and molten slag where the veil would be. */
export function drawLiquidFallen(ctx: Ctx, biome: FallenBiome, tt: T, x: number, y: number, top: boolean, tx: number, t: number): boolean {
  if (tt === T.Water) {
    const wy = top ? 5 : 0;
    ctx.fillStyle = biome === 'hunt' ? 'rgba(40,56,84,0.88)' : biome === 'plague' ? 'rgba(34,46,26,0.92)' : 'rgba(30,24,28,0.9)';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    if (!top) return true;
    ctx.fillStyle = biome === 'hunt' ? 'rgba(190,210,240,0.8)' : biome === 'plague' ? 'rgba(150,180,90,0.7)' : 'rgba(230,140,90,0.7)';
    ctx.fillRect(x, y + wy, TILE, 1);
    const g = (t * 4 + hash2(tx, 0, 771) * 16) % 16;
    if (biome === 'hunt') {
      // floes of ice turning in the meltwater
      if (hash2(tx, 1, 771) < 0.4) {
        ctx.fillStyle = 'rgba(220,232,248,0.85)';
        ctx.fillRect(x + Math.floor(g * 0.4) + 2, y + wy - 1, 6, 2);
      }
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      ctx.fillRect(x + Math.floor(g), y + wy + 3, 3, 1);
    } else if (biome === 'plague') {
      // scum, and a bubble rising now and then
      ctx.fillStyle = 'rgba(110,140,60,0.7)';
      ctx.fillRect(x + Math.floor(hash2(tx, 2, 771) * 10), y + wy + 1, 5, 1);
      const b = (t * 0.7 + hash2(tx, 3, 771)) % 1;
      if (b < 0.2) {
        ctx.fillStyle = 'rgba(160,200,100,0.8)';
        ctx.fillRect(x + 7, y + wy - 1, 2, 1);
      }
    } else {
      // steam off the quench
      if (tier() > 0) blob(ctx, '#a89890', x + 8 + Math.sin(t + tx) * 4, y + wy - 6 - ((t * 8 + tx * 5) % 10), 10, 6, 0.12);
    }
    return true;
  }
  if (tt !== T.Veil) return false;
  const wy = top ? 3 + Math.sin(t * 2.4 + tx) * 0.8 : 0;
  if (biome === 'cinders' || biome === 'hunt') {
    // molten slag: a dark crust over a bright melt that shows in the cracks
    ctx.fillStyle = '#c8461a';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    if (top) {
      ctx.fillStyle = '#ffb050';
      ctx.fillRect(x, y + wy, TILE, 1);
      ctx.fillStyle = '#4a1e14';
      const o = Math.floor((t * 3 + hash2(tx, 0, 772) * 16) % 16);
      ctx.fillRect(x + ((o + 2) % 12), y + wy + 2, 5, 2);
      ctx.fillRect(x + ((o + 9) % 12), y + wy + 5, 4, 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#ff7a2a', x + 8, y + 8, 14, 10, 0.35 + 0.1 * Math.sin(t * 3 + tx));
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  // bile: a poison-bright pool that boils
  ctx.fillStyle = '#2a4a14';
  ctx.fillRect(x, y + wy, TILE, TILE - wy);
  if (top) {
    ctx.fillStyle = '#b8f060';
    ctx.fillRect(x, y + wy, TILE, 1);
    const b = (t * 0.9 + hash2(tx, 4, 772)) % 1;
    ctx.fillStyle = 'rgba(190,250,110,0.85)';
    if (b < 0.5) {
      const r = Math.round(1 + b * 4);
      ctx.fillRect(x + 4 + Math.floor(hash2(tx, 5, 772) * 6), y + wy - r + 1, r, r);
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#7ad030', x + 8, y + 8, 14, 10, 0.3);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}
