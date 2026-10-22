// Chapter V environment art: Babylon on the night of the king's feast. The
// dry riverbed under the walls (cracked mud, stranded boats, still moonlit
// puddles, the eastern army's fires on the horizon), the hanging gardens
// climbing into the night, and the palace: glazed brick and gold, cedar,
// purple curtains, the plaster wall where the hand writes, and the Hall of
// Scales. Everything is night: indigo skies, a big moon, lamplight in gold.

import { makeCanvas, rgba, shade, mix, circle, ellipse, type Ctx } from './draw';
import { RNG, hash2, clamp } from '../core/math';
import { TILE, T, type Biome, type EntDef } from '../game/tiles';
import { flag } from '../game/ctx';
import { WRITING } from '../game/writing';
import {
  blob, solidify, tier, wrapNoise, fillRidge, strokeRidge, localView, brickField, merlons, metalGrad, taper,
  palmSil, reedSil, zigguratSil, wallSil, housesSil, lionRelief, dragonRelief, rosetteBand, jar, palmTree, rosette,
} from './env4';
import type { BiomePal, Layer, ParallaxSteps } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
export type Ch5Biome = 'riverbed' | 'gardens' | 'palace';
export const isCh5 = (b: Biome): b is Ch5Biome => b === 'riverbed' || b === 'gardens' || b === 'palace';

const TAU = Math.PI * 2;
const OUT = '#0c0a10';
const GOLD = '#d8a840';
const GOLD_HI = '#f8e0a0';
const GOLD_DK = '#7a5014';
const GLAZE = '#1c3f7a';
const PURPLE = '#4a1a5a';
const PURPLE_HI = '#7a3a8a';
const CEDAR = '#6a3e20';
const LAMP = '#ffb850';
const MOON = '#eae6d6';

// ---------------------------------------------------------------- skies

type SkyKind = Ch5Biome | 'hall';
const SKY_STOPS: Record<SkyKind, readonly (readonly [number, string])[]> = {
  // The east glows faintly where the army's fires burn below the horizon.
  riverbed: [[0, '#03040c'], [0.3, '#081230'], [0.55, '#14214a'], [0.7, '#252f58'], [0.84, '#3a3452']],
  gardens: [[0, '#02040c'], [0.35, '#0a1838'], [0.6, '#1a2e58'], [0.8, '#2c4068']],
  // Over the palace roofs the city's festival lights warm the haze.
  palace: [[0, '#04030e'], [0.35, '#120c30'], [0.6, '#261a48'], [0.8, '#4a2a4a'], [0.95, '#6a3640']],
  // Inside the halls: dark vaults, lamplight pooling low.
  hall: [[0, '#06030a'], [0.5, '#140a1c'], [0.85, '#2a1622'], [1, '#3a2018']],
};
const skyG: Partial<Record<SkyKind, CanvasGradient>> = {};
const skyH: Partial<Record<SkyKind, number>> = {};

const MOON_AT: Record<Ch5Biome, readonly [number, number, number]> = {
  riverbed: [0.74, 0.18, 0.085],
  gardens: [0.3, 0.15, 0.1],
  palace: [0.78, 0.14, 0.08],
};

export function drawSkyCh5(ctx: Ctx, biome: Ch5Biome, pal: BiomePal, w: number, h: number, interior: boolean, t: number) {
  const kind: SkyKind = interior ? 'hall' : biome;
  let g = skyG[kind];
  if (!g || skyH[kind] !== h) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of SKY_STOPS[kind]) g.addColorStop(o, c);
    skyG[kind] = g;
    skyH[kind] = h;
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (interior) {
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#a0501a', w * 0.5, h, w * 0.6, h * 0.35, 0.22 + 0.04 * Math.sin(t * 0.7));
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  const k = h / 720;
  // a faint river of stars, then the stars themselves
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) blob(ctx, '#3a4a7a', w * (0.05 + i * 0.17), h * (0.05 + i * 0.07), w * 0.12, h * 0.07, 0.12);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#eef0ff';
  for (let i = 0; i < 110; i++) {
    const y = hash2(i, 41) * h * 0.62;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash2(i, 43) * 2.4) + i * 1.3);
    ctx.globalAlpha = (0.12 + 0.6 * hash2(i, 47) * tw) * (1 - y / (h * 0.7));
    const s = (0.8 + hash2(i, 49) * (i % 13 === 0 ? 2.4 : 1.2)) * k;
    ctx.fillRect(hash2(i, 45) * w, y, s, s);
  }
  ctx.globalAlpha = 1;
  // a great moon
  const [mxf, myf, mrf] = MOON_AT[biome];
  const mx = w * mxf, my = h * myf, mr = h * mrf;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#4a5a9a', mx, my, mr * 10, mr * 10, 0.35);
  blob(ctx, '#fff4dc', mx, my, mr * 2.8, mr * 2.8, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, mx, my, mr, MOON);
  ctx.fillStyle = 'rgba(150,140,130,0.32)';
  ctx.beginPath();
  ctx.ellipse(mx - mr * 0.32, my - mr * 0.18, mr * 0.34, mr * 0.26, 0.4, 0, TAU);
  ctx.ellipse(mx + mr * 0.3, my + mr * 0.28, mr * 0.26, mr * 0.2, 0, 0, TAU);
  ctx.ellipse(mx + mr * 0.08, my - mr * 0.48, mr * 0.15, mr * 0.12, 0, 0, TAU);
  ctx.ellipse(mx - mr * 0.1, my + mr * 0.45, mr * 0.12, mr * 0.09, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,250,0.35)';
  ctx.beginPath();
  ctx.ellipse(mx - mr * 0.45, my - mr * 0.5, mr * 0.28, mr * 0.12, -0.7, 0, TAU);
  ctx.fill();
  // thin cloud drifting under it
  for (let i = 0; i < 3; i++) {
    const y = h * (0.12 + i * 0.09);
    const x = ((t * (3 + i * 1.4) * k * 3 + hash2(i, 51) * w) % (w + 800 * k)) - 400 * k;
    const len = (150 + hash2(i, 53) * 150) * k, th = (10 + i * 4) * k;
    blob(ctx, '#0a0c24', x, y, len, th, 0.6);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#8a96d4', x - len * 0.1, y - th * 0.5, len * 0.7, th * 0.3, 0.12);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (biome === 'riverbed') {
    // the eastern army's fires warming the low sky
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#c0501a', w * 0.85, h * 0.62, w * 0.3, h * 0.1, 0.16);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- parallax pieces

/** Many lit windows: the whole city keeps the feast. */
function feastWindows(ctx: Ctx, x0: number, x1: number, base: number, hgt: number, n: number, rng: RNG) {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1), y = base - rng.range(2, hgt);
    ctx.fillStyle = rng.chance(0.75) ? 'rgba(255,180,90,0.85)' : 'rgba(255,220,150,0.9)';
    ctx.fillRect(x, y, 1.6, 2.2);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n / 4; i++) blob(ctx, '#ff9a4a', rng.range(x0, x1), base - rng.range(0, hgt), 10, 7, 0.25);
  ctx.globalCompositeOperation = 'source-over';
}

/** A camp of the eastern army on the horizon: tents and small fires, smoke going up. */
function armyCamp(ctx: Ctx, x0: number, x1: number, base: number, col: string, rng: RNG) {
  ctx.fillStyle = col;
  for (let x = x0; x < x1; x += rng.range(5, 12)) {
    const s = rng.range(2.4, 4.4);
    ctx.beginPath();
    ctx.moveTo(x - s, base);
    ctx.lineTo(x, base - s * 1.2);
    ctx.lineTo(x + s, base);
    ctx.fill();
  }
  for (let x = x0 + 6; x < x1; x += rng.range(14, 30)) {
    blob(ctx, '#1a1a2a', x + 4, base - 16, 5, 12, 0.35);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#ff7a2a', x, base - 1, 7, 4, 0.75);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd090';
    ctx.fillRect(x - 0.6, base - 1.8, 1.2, 1.4);
  }
}

/** A cypress: a tall dark flame of foliage. */
export function cypressSil(ctx: Ctx, x: number, base: number, h: number, col: string, rim: string | null) {
  const w = h * 0.11;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, base + 2);
  ctx.quadraticCurveTo(x - w * 1.15, base - h * 0.45, x, base - h);
  ctx.quadraticCurveTo(x + w * 1.15, base - h * 0.45, x + w * 0.5, base + 2);
  ctx.closePath();
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, base - h * 0.96);
    ctx.quadraticCurveTo(x + w * 1.05, base - h * 0.45, x + w * 0.5, base - 2);
    ctx.stroke();
  }
}

/** A round-crowned garden tree silhouette. */
function roundTreeSil(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  ctx.fillStyle = col;
  ctx.fillRect(x - h * 0.03, base - h * 0.5, h * 0.06, h * 0.5 + 2);
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, r = h * rng.range(0.16, 0.24);
    const cx = x + Math.cos(a) * h * 0.18, cy = base - h * 0.68 + Math.sin(a) * h * 0.13;
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, TAU);
  }
  ctx.fill();
}

/** A string of festival lanterns sagging between two points. */
function lanternString(ctx: Ctx, x0: number, x1: number, y: number, sag: number, n: number) {
  ctx.strokeStyle = 'rgba(30,20,20,0.8)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y);
  ctx.stroke();
  for (let i = 1; i < n; i++) {
    const u = i / n, lx = x0 + (x1 - x0) * u, ly = y + sag * 4 * u * (1 - u) + 2;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, i % 3 ? '#ff9a3a' : '#ff5a4a', lx, ly, 6, 6, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = i % 3 ? '#ffc060' : '#ff7a5a';
    ctx.fillRect(lx - 1, ly - 1.4, 2, 2.8);
  }
}

// ---------------------------------------------------------------- parallax

export function* buildParallaxCh5(biome: Ch5Biome, pal: BiomePal, seed: number, interior: boolean, viewH: number, res: number): ParallaxSteps {
  const layers: Layer[] = [];
  const W = 1024;
  const H = Math.round(viewH * 1.6);
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    const m = makeCanvas(W * r, H * r);
    m.ctx.scale(r, r);
    draw(m.ctx, W, H);
    const l: Layer = { c: m.c, w: W, h: H, fx, fy, oy: 0, res: r };
    layers.push(l);
    return l;
  };
  /** Draw something near a strip edge twice so the wrap is seamless. */
  const wrap = (x: number, reach: number, w: number, f: (x: number) => void) => {
    f(x);
    if (x + reach > w) f(x - w);
    if (x - reach < 0) f(x + w);
  };
  const moonRim = rgba('#b8c4ff', 0.3);

  if (biome === 'palace' && interior) {
    // The far wall of the hall: glazed brick in shadow, lamplit niches, a gold frieze.
    yield mk(0.08, 0.05, (ctx, w, h) => {
      const col = pal.far;
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let x = 64; x < w; x += 128) blob(ctx, '#a0501a', x, h * 0.78, 70, 60, 0.3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let y = 0; y < h; y += 6) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      for (let x = 0; x < w; x += 128) {
        // an arched niche with a lamp burning in it
        const cx = x + 64, top = h * 0.56;
        ctx.fillStyle = '#0c0610';
        ctx.beginPath();
        ctx.moveTo(cx - 20, h * 0.86);
        ctx.lineTo(cx - 20, top);
        ctx.arc(cx, top, 20, Math.PI, 0);
        ctx.lineTo(cx + 20, h * 0.86);
        ctx.fill();
        ctx.strokeStyle = 'rgba(216,168,64,0.45)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, LAMP, cx, h * 0.72, 26, 30, 0.55);
        blob(ctx, '#fff0c0', cx, h * 0.74, 4, 4, 0.9);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#5a3a14';
        ctx.fillRect(cx - 4, h * 0.745, 8, 2);
        // a tall window between niches, the night outside
        const wx = x, wt = h * 0.42;
        ctx.fillStyle = '#0a1230';
        ctx.beginPath();
        ctx.moveTo(wx - 7, h * 0.66);
        ctx.lineTo(wx - 7, wt);
        ctx.arc(wx, wt, 7, Math.PI, 0);
        ctx.lineTo(wx + 7, h * 0.66);
        ctx.fill();
        ctx.fillStyle = 'rgba(230,236,255,0.7)';
        for (let k = 0; k < 4; k++) ctx.fillRect(wx - 5 + hash2(x, k, 3) * 10, wt + hash2(x, k, 5) * (h * 0.22), 0.9, 0.9);
      }
      ctx.fillStyle = '#5a3e14';
      ctx.fillRect(0, h * 0.5, w, 6);
      ctx.fillStyle = 'rgba(216,168,64,0.6)';
      ctx.fillRect(0, h * 0.5, w, 1.2);
      ctx.fillRect(0, h * 0.5 + 5, w, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
    }, res * 0.7);
    // Colonnade: massive columns with gold capitals, lamps on chains, purple swags.
    yield mk(0.26, 0.12, (ctx, w, h) => {
      const col = pal.mid;
      for (let x = 40; x < w; x += 170) {
        ctx.fillStyle = col;
        ctx.fillRect(x - 16, h * 0.28, 32, h);
        ctx.fillStyle = 'rgba(255,170,90,0.12)';
        ctx.fillRect(x - 16, h * 0.28, 4, h);
        ctx.fillStyle = '#4a3410';
        ctx.fillRect(x - 24, h * 0.28 - 10, 48, 12);
        ctx.fillStyle = 'rgba(216,168,64,0.55)';
        ctx.fillRect(x - 24, h * 0.28 - 10, 48, 1.4);
        // purple swag between this column and the next
        ctx.fillStyle = 'rgba(60,16,70,0.9)';
        ctx.beginPath();
        ctx.moveTo(x + 16, h * 0.3);
        ctx.quadraticCurveTo(x + 85, h * 0.42, x + 154, h * 0.3);
        ctx.lineTo(x + 154, h * 0.33);
        ctx.quadraticCurveTo(x + 85, h * 0.46, x + 16, h * 0.33);
        ctx.fill();
        ctx.strokeStyle = 'rgba(216,168,64,0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // a lamp hanging on its chain
        const lx = x + 85, ly = h * 0.62;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, ly - 4);
        ctx.stroke();
        ctx.fillStyle = '#3a2810';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 8, 3, 0, 0, Math.PI);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, LAMP, lx, ly - 3, 30, 26, 0.45);
        blob(ctx, '#fff0c0', lx, ly - 2, 4, 3, 0.9);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = mix(col, '#000000', 0.3);
      ctx.fillRect(0, h * 0.9, w, h * 0.1);
    });
    return layers;
  }

  const rng = new RNG(seed);
  if (biome === 'riverbed') {
    // Far: Babylon feasting behind its walls, the eastern army's fires along the horizon.
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8;
      const n0 = wrapNoise(w, 260, seed, 3);
      fillRidge(ctx, w, h, (x) => hz - 2 - n0(x) * 10, mix(pal.far, '#2a3460', 0.35));
      const col = mix(pal.far, '#1a2448', 0.3), cr = new RNG(seed + 5);
      housesSil(ctx, 40, 430, hz - 12, 1.2, mix(col, '#000000', 0.05), moonRim, cr, 0.7);
      const top = zigguratSil(ctx, 230, hz - 10, 120, 84, 6, col, moonRim, 1);
      wallSil(ctx, 30, 440, hz, 15, mix(col, '#000000', 0.1), moonRim, 36, 1);
      feastWindows(ctx, 40, 430, hz - 8, 40, 70, cr);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff7a2a', 230, top - 3, 18, 14, 0.6);
      blob(ctx, '#c86a2a', 235, hz - 30, 200, 40, 0.18);
      ctx.globalCompositeOperation = 'source-over';
      armyCamp(ctx, 470, 640, hz + 1, mix(pal.far, '#000000', 0.2), new RNG(seed + 7));
      armyCamp(ctx, 760, 980, hz + 1, mix(pal.far, '#000000', 0.2), new RNG(seed + 8));
      const n1 = wrapNoise(w, 170, seed + 3, 3);
      const r1 = (x: number) => hz + 3 + n1(x) * 6;
      fillRidge(ctx, w, h, r1, mix(pal.far, '#000000', 0.1));
      strokeRidge(ctx, w, r1, rgba('#b8c4ff', 0.18), 0.8);
    }, res * 0.75);
    // Mid: the high banks of the emptied river, dead palms and stranded hulls.
    yield mk(0.17, 0.07, (ctx, w, h) => {
      const n = wrapNoise(w, 220, seed + 11, 4);
      const hy = (x: number) => h * 0.84 - n(x) * h * 0.05;
      const col = pal.mid, fr = new RNG(seed + 12);
      let x = fr.range(0, 40);
      while (x < w - 20) {
        const k = fr.int(0, 3), sd = fr.int(0, 99999);
        if (k === 0) {
          wrap(x, 30, w, (xx) => palmSil(ctx, xx, hy(xx) + 3, fr.range(36, 56), col, new RNG(sd), moonRim, 1));
          x += fr.range(40, 90);
        } else if (k === 1) {
          wrap(x, 40, w, (xx) => {
            // a hull lying on its side on the bank
            const gy = hy(xx) + 3;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(xx - 28, gy - 2);
            ctx.quadraticCurveTo(xx - 22, gy - 14, xx, gy - 15);
            ctx.quadraticCurveTo(xx + 22, gy - 14, xx + 30, gy - 6);
            ctx.lineTo(xx + 28, gy + 2);
            ctx.lineTo(xx - 26, gy + 2);
            ctx.fill();
            ctx.strokeStyle = moonRim;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(xx - 22, gy - 13);
            ctx.quadraticCurveTo(xx, gy - 16, xx + 22, gy - 13);
            ctx.stroke();
            ctx.fillStyle = col;
            ctx.fillRect(xx + 2, gy - 38, 1.6, 24);
          });
          x += fr.range(90, 150);
        } else {
          wrap(x, 30, w, (xx) => reedSil(ctx, xx, hy(xx) + 3, 34, 18, col, new RNG(sd)));
          x += fr.range(50, 90);
        }
      }
      fillRidge(ctx, w, h, hy, col);
      strokeRidge(ctx, w, hy, rgba('#b8c4ff', 0.16), 1);
    });
    // Near: dead reeds and the ribs of broken boats, dark against the night.
    yield mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 120, seed + 21, 3);
      const hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22), col = pal.near;
      let x = fr.range(20, 60);
      while (x < w - 30) {
        const sd = fr.int(0, 99999);
        if (fr.chance(0.4)) {
          wrap(x, 40, w, (xx) => {
            const gy = hy(xx) + 6, r = new RNG(sd);
            ctx.strokeStyle = col;
            ctx.lineCap = 'round';
            for (let i = 0; i < 6; i++) {
              const bx = xx - 24 + i * 9, hh = 26 + r.range(-6, 10) - Math.abs(i - 2.5) * 4;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(bx, gy);
              ctx.quadraticCurveTo(bx - 6, gy - hh * 0.7, bx - 2 + (i - 2.5) * 2, gy - hh);
              ctx.stroke();
            }
          });
        } else wrap(x, 40, w, (xx) => reedSil(ctx, xx - 20, hy(xx) + 6, 44, 40 + fr.range(0, 20), col, new RNG(sd)));
        x += fr.range(90, 180);
      }
      fillRidge(ctx, w, h, hy, col);
    });
  } else if (biome === 'gardens') {
    // Far: the city far below, alight for the feast; the ziggurat burning.
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.82;
      const col = mix(pal.far, '#1a2a48', 0.4), cr = new RNG(seed + 4);
      housesSil(ctx, 0, w, hz - 6, 1.1, col, moonRim, cr, 0.6);
      const top = zigguratSil(ctx, 640, hz - 4, 150, 100, 7, mix(col, '#2a3458', 0.3), moonRim, -1);
      feastWindows(ctx, 0, w, hz - 4, 30, 110, cr);
      for (let i = 0; i < 4; i++) lanternString(ctx, 80 + i * 210, 170 + i * 210, hz - 30 - (i & 1) * 8, 6, 9);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff7a2a', 640, top - 3, 22, 16, 0.65);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = mix(pal.far, '#000000', 0.3);
      ctx.fillRect(0, hz + 2, w, h - hz);
    }, res * 0.75);
    // Mid: terraces of the gardens stepping up, cypress spires and round crowns.
    yield mk(0.16, 0.08, (ctx, w, h) => {
      const col = pal.mid, fr = new RNG(seed + 14);
      const base = h * 0.88;
      ctx.fillStyle = col;
      ctx.fillRect(0, base, w, h - base);
      let x = 0;
      while (x < w) {
        const tw = fr.range(110, 180), th = fr.range(30, 70), sd = fr.int(0, 99999);
        wrap(x, tw, w, (xx) => {
          const r = new RNG(sd);
          ctx.fillStyle = col;
          ctx.fillRect(xx, base - th, tw, th + 1);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          for (let ax = xx + 10; ax < xx + tw - 12; ax += 18) {
            ctx.beginPath();
            ctx.moveTo(ax, base);
            ctx.lineTo(ax, base - th * 0.5);
            ctx.arc(ax + 5, base - th * 0.5, 5, Math.PI, 0);
            ctx.lineTo(ax + 10, base);
            ctx.fill();
          }
          ctx.fillStyle = moonRim;
          ctx.fillRect(xx, base - th, tw, 0.8);
          for (let k = 0; k < 3; k++) {
            const cx = xx + r.range(10, tw - 10);
            if (r.chance(0.5)) cypressSil(ctx, cx, base - th, r.range(30, 52), col, moonRim);
            else roundTreeSil(ctx, cx, base - th, r.range(26, 38), col, r);
          }
          // vines spilling over the lip
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let vx = xx + 4; vx < xx + tw - 4; vx += r.range(6, 12)) {
            ctx.moveTo(vx, base - th);
            ctx.quadraticCurveTo(vx + 2, base - th + 8, vx - 1, base - th + r.range(8, 20));
          }
          ctx.stroke();
        });
        x += tw + fr.range(20, 70);
      }
    });
    // Near: tall cypress and a curtain of vines, nearly black.
    yield mk(0.4, 0.16, (ctx, w, h) => {
      const col = pal.near, fr = new RNG(seed + 24);
      const base = h * 0.93;
      ctx.fillStyle = col;
      ctx.fillRect(0, base, w, h - base);
      let x = fr.range(40, 100);
      while (x < w - 30) {
        const ch = fr.range(90, 140);
        wrap(x, 20, w, (xx) => cypressSil(ctx, xx, base, ch, col, rgba('#b8c4ff', 0.2)));
        if (fr.chance(0.6)) wrap(x + 16, 20, w, (xx) => cypressSil(ctx, xx, base, ch * 0.7, col, null));
        x += fr.range(140, 240);
      }
    });
  } else {
    // The palace roofs. Far: the city alight, the walls, the army's fires beyond.
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8;
      const col = mix(pal.far, '#20183a', 0.3), cr = new RNG(seed + 4);
      armyCamp(ctx, 560, 900, hz - 18, mix(pal.far, '#000000', 0.3), cr);
      housesSil(ctx, 0, w, hz - 8, 1.3, col, moonRim, cr, 0.6);
      const top = zigguratSil(ctx, 260, hz - 4, 170, 116, 7, mix(col, '#2a2050', 0.3), moonRim, 1);
      wallSil(ctx, 0, w, hz + 4, 12, mix(col, '#000000', 0.12), moonRim, 40, 1);
      feastWindows(ctx, 0, w, hz - 6, 40, 120, cr);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#ff7a2a', 260, top - 3, 26, 18, 0.65);
      ctx.globalCompositeOperation = 'source-over';
    }, res * 0.75);
    // Mid: palace towers and roofs strung with lanterns.
    yield mk(0.16, 0.08, (ctx, w, h) => {
      const base = h * 0.86, col = pal.mid, fr = new RNG(seed + 14);
      ctx.fillStyle = col;
      ctx.fillRect(0, base, w, h - base);
      let x = fr.range(0, 30), prev = -1, prevTop = 0;
      while (x < w - 20) {
        const bw = fr.range(40, 80), bh = fr.range(50, 110), sd = fr.int(0, 9999);
        wrap(x, bw, w, (xx) => {
          const r = new RNG(sd);
          ctx.fillStyle = col;
          ctx.fillRect(xx, base - bh, bw, bh + 1);
          merlons(ctx, xx, xx + bw, base - bh, 7, col);
          ctx.fillStyle = rgba('#b8c4ff', 0.18);
          ctx.fillRect(xx + bw - 1, base - bh, 1, bh);
          for (let i = 0; i < 5; i++) {
            if (!r.chance(0.6)) continue;
            const wx = xx + r.range(5, bw - 8), wy = base - r.range(10, bh - 10);
            ctx.fillStyle = 'rgba(255,180,90,0.85)';
            ctx.fillRect(wx, wy, 3, 4.5);
            ctx.globalCompositeOperation = 'lighter';
            blob(ctx, '#ff9a4a', wx + 1.5, wy + 2, 8, 8, 0.35);
            ctx.globalCompositeOperation = 'source-over';
          }
        });
        if (prev >= 0) lanternString(ctx, prev, x + 4, Math.max(prevTop, base - bh) + 6, 8, 7);
        prev = x + bw - 4;
        prevTop = base - bh;
        x += bw + fr.range(30, 70);
      }
    });
    // Near: a parapet's merlons and palms in planters.
    yield mk(0.38, 0.15, (ctx, w, h) => {
      const top = h * 0.84, col = pal.near, fr = new RNG(seed + 24);
      ctx.fillStyle = col;
      ctx.fillRect(0, top, w, h - top);
      merlons(ctx, 0, w, top, 9, col);
      ctx.fillStyle = rgba('#b8c4ff', 0.2);
      ctx.fillRect(0, top, w, 0.8);
      let x = fr.range(60, 120);
      while (x < w - 30) {
        const sd = fr.int(0, 9999), ph = fr.range(70, 100);
        wrap(x, 50, w, (xx) => palmSil(ctx, xx, top - 9, ph, col, new RNG(sd), moonRim, 1));
        x += fr.range(180, 280);
      }
    });
  }
  return layers;
}

// ---------------------------------------------------------------- tiles

/** Solid tiles: sun-cracked river mud, moonlit garden stone, glazed palace brick under marble. */
export function drawSolidCh5(ctx: Ctx, biome: Ch5Biome, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
  if (t === T.Seal) base = '#7a5a28';
  if (t === T.Wood) base = pal.plat;
  const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  ctx.fillStyle = mix(dark, '#000000', v * 0.1);
  ctx.fillRect(x, y, TILE, TILE);
  if (biome === 'riverbed') riverTile(ctx, pal, x, y, tx, ty, depth, v, up);
  else if (biome === 'gardens') gardenTile(ctx, pal, x, y, tx, ty, depth, v, up, dn);
  else palaceTile(ctx, pal, x, y, tx, ty, depth, v, up);
  edges(ctx, x, y, dn, lf, rt, 'rgba(180,196,255,0.1)');
}

function edges(ctx: Ctx, x: number, y: number, dn: boolean, lf: boolean, rt: boolean, lit: string) {
  if (!dn) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(x, y + TILE - 2.5, TILE, 2.5);
  }
  if (!lf) {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, 1.6, TILE);
  }
  if (!rt) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x + TILE - 1.8, y, 1.8, TILE);
  }
}

function riverTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean) {
  if (depth <= 1) {
    // silt laid down in bands by the river, a shell or a pebble in it
    ctx.strokeStyle = 'rgba(20,14,8,0.35)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let r = 0; r < 3; r++) {
      const yy = y + 4 + r * 5 + hash2(tx, ty * 3 + r, 201) * 1.5;
      ctx.moveTo(x, yy);
      ctx.quadraticCurveTo(x + 8, yy + (hash2(tx, r, 202) - 0.5) * 2, x + TILE, yy + (hash2(tx + 1, r, 202) - 0.5) * 1);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,190,170,0.1)';
    ctx.fillRect(x, y + 7, TILE, 1.2);
    const k = hash2(tx, ty, 203);
    if (k < 0.05) {
      ctx.strokeStyle = 'rgba(230,220,200,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(x + 8, y + 10, 1.6, Math.PI * 1.1, Math.PI * 2.2);
      ctx.stroke();
    } else if (k < 0.12) ellipse(ctx, x + 4 + hash2(tx, ty, 204) * 8, y + 9, 1.3, 0.9, 0, shade(pal.stone, 0.18));
  }
  if (!up) {
    // dried crust in curling plates, gaps opened between them
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 3.4);
    ctx.fillStyle = 'rgba(200,210,255,0.22)';
    ctx.fillRect(x, y, TILE, 0.8);
    const gap = x + 3 + hash2(tx, ty, 205) * 10;
    ctx.fillStyle = '#120e0a';
    ctx.beginPath();
    ctx.moveTo(gap - 1.2, y - 0.2);
    ctx.lineTo(gap + 1.2, y - 0.2);
    ctx.lineTo(gap + 0.2, y + 5 + v * 3);
    ctx.closePath();
    ctx.fill();
    // a plate edge lifting
    ctx.fillStyle = shade(pal.cap, 0.15);
    ctx.beginPath();
    ctx.moveTo(gap + 1.2, y - 0.2);
    ctx.lineTo(gap + 4, y - 1.4);
    ctx.lineTo(gap + 6, y);
    ctx.fill();
    if (hash2(tx, ty, 206) < 0.22) {
      // a stub of dead reed
      ctx.strokeStyle = pal.capTuft;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const rx = x + 2 + hash2(tx, ty, 207) * 12;
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + 1.6, y - 4 - v * 3);
      ctx.moveTo(rx + 1, y);
      ctx.lineTo(rx - 1, y - 3);
      ctx.stroke();
    }
  }
}

function gardenTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean) {
  if (depth <= 1) {
    const off = ty & 1 ? 8 : 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.3);
    ctx.lineTo(x + TILE, y + 0.3);
    ctx.moveTo(x + off + 0.3, y);
    ctx.lineTo(x + off + 0.3, y + TILE);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,214,255,0.1)';
    ctx.fillRect(x, y + 1, TILE, 0.7);
    ctx.fillRect(x + off + 1, y + 1, 0.7, TILE - 1);
    if (hash2(tx, ty, 211) < 0.14) {
      // moss in the joints
      ctx.fillStyle = 'rgba(70,110,60,0.5)';
      ctx.fillRect(x + hash2(tx, ty, 212) * 10, y + 0.2, 5, 1.4);
    }
  }
  if (!up) {
    ctx.fillStyle = '#1c2c18';
    ctx.fillRect(x, y, TILE, 4);
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 2.8);
    ctx.fillStyle = 'rgba(190,220,200,0.25)';
    ctx.fillRect(x, y, TILE, 0.7);
    ctx.fillStyle = pal.capTuft;
    for (let i = 0; i < 3; i++) {
      const fx = x + hash2(tx, i, 213) * 14;
      ctx.fillRect(fx, y - 1.6 - hash2(tx, i, 214) * 1.6, 0.9, 2.4);
    }
    const k = hash2(tx, ty, 215);
    if (k < 0.3) circle(ctx, x + 3 + hash2(tx, ty, 216) * 10, y - 1.2, 0.9, k < 0.15 ? '#f0ecf8' : '#c83a4a');
  }
  if (!dn && hash2(tx, ty, 217) < 0.5) {
    // ivy hanging under the terrace
    ctx.strokeStyle = '#24381c';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const ix = x + 3 + hash2(tx, ty, 218) * 10, L = 5 + v * 10;
    ctx.moveTo(ix, y + TILE);
    ctx.quadraticCurveTo(ix + 2, y + TILE + L * 0.5, ix, y + TILE + L);
    ctx.stroke();
    ctx.fillStyle = '#34502a';
    for (let k = 3; k < L; k += 3) circle(ctx, ix + (k & 2 ? 1 : -1), y + TILE + k, 0.9, '#34502a');
  }
}

function palaceTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean) {
  if (depth <= 1) {
    if (ty % 6 === 3 && up) {
      ctx.fillStyle = '#0e1e40';
      ctx.fillRect(x, y + 2, TILE, 12);
      ctx.fillStyle = '#c8962e';
      ctx.fillRect(x, y + 2, TILE, 1);
      ctx.fillRect(x, y + 13, TILE, 1);
      rosette(ctx, x + 8, y + 8, 4.2);
    } else {
      ctx.fillStyle = 'rgba(150,190,255,0.12)';
      for (let r = 0; r < 4; r++) ctx.fillRect(x, y + r * 4 + 0.7, TILE, 0.5);
      ctx.strokeStyle = 'rgba(4,8,24,0.7)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let r = 0; r < 4; r++) {
        const yy = y + r * 4;
        ctx.moveTo(x, yy + 0.3);
        ctx.lineTo(x + TILE, yy + 0.3);
        const off = (ty * 4 + r) & 1 ? 4 : 0;
        for (let c = off; c < TILE; c += 8) {
          ctx.moveTo(x + c + 0.3, yy);
          ctx.lineTo(x + c + 0.3, yy + 4);
        }
      }
      ctx.stroke();
    }
  }
  if (!up) {
    // polished marble with a gold inlay
    ctx.fillStyle = '#9a8c78';
    ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = '#d8ccb4';
    ctx.fillRect(x, y, TILE, 3.6);
    ctx.strokeStyle = 'rgba(120,100,90,0.35)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    const vx = x + hash2(tx, ty, 221) * 10;
    ctx.moveTo(vx, y + 0.5);
    ctx.quadraticCurveTo(vx + 3, y + 2, vx + 6, y + 1.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,236,0.5)';
    ctx.fillRect(x, y, TILE, 0.7);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y + 3.6, TILE, 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + 5, TILE, 0.6);
  }
}

/** One-way platforms: reed bundles lashed to poles, carved garden ledges, cedar beams banded in gold. */
export function drawOneWayCh5(ctx: Ctx, biome: Ch5Biome, pal: BiomePal, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'riverbed') {
    ctx.fillStyle = '#4a3c22';
    ctx.fillRect(x, y, TILE, 5.4);
    ctx.fillStyle = '#9a8656';
    ctx.fillRect(x, y, TILE, 3.8);
    ctx.strokeStyle = 'rgba(60,44,20,0.55)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let i = 0.8; i < 5; i += 1.2) {
      ctx.moveTo(x, y + i);
      ctx.lineTo(x + TILE, y + i + 0.2);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(210,220,255,0.25)';
    ctx.fillRect(x, y, TILE, 0.7);
    if ((tx & 1) === 0) {
      ctx.fillStyle = '#3a2a14';
      ctx.fillRect(x + 7, y - 0.4, 1.6, 6.2);
    }
    if (l || r) {
      ctx.fillStyle = '#3a2a16';
      ctx.fillRect(l ? x + 2 : x + TILE - 4, y + 4, 2.2, 10);
    }
    return;
  }
  if (biome === 'gardens') {
    ctx.fillStyle = shade(pal.plat, -0.35);
    ctx.fillRect(x, y, TILE, 5.6);
    ctx.fillStyle = '#8a8270';
    ctx.fillRect(x, y, TILE, 3.6);
    ctx.fillStyle = 'rgba(210,224,255,0.3)';
    ctx.fillRect(x, y, TILE, 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + 3.6, TILE, 0.8);
    if (hash2(tx, ty, 231) < 0.5) {
      ctx.strokeStyle = '#2a4020';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const ix = x + 2 + hash2(tx, ty, 232) * 12;
      ctx.moveTo(ix, y + 4);
      ctx.quadraticCurveTo(ix + 2, y + 8, ix, y + 11 + hash2(tx, ty, 233) * 6);
      ctx.stroke();
    }
    if (l || r) {
      const bx = l ? x : x + TILE - 6;
      ctx.fillStyle = '#6a6252';
      ctx.fillRect(bx, y + 5.6, 6, 2.2);
      ctx.fillRect(bx + 1.2, y + 7.8, 3.6, 2.4);
    }
    return;
  }
  ctx.fillStyle = '#3a200e';
  ctx.fillRect(x, y, TILE, 6);
  ctx.fillStyle = CEDAR;
  ctx.fillRect(x, y, TILE, 4.8);
  ctx.strokeStyle = 'rgba(40,18,6,0.45)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x + TILE, y + 1.8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,214,160,0.3)';
  ctx.fillRect(x, y, TILE, 0.8);
  if (tx % 3 === 0) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(x + 6, y - 0.3, 2.6, 6.4);
    ctx.fillStyle = GOLD_HI;
    ctx.fillRect(x + 6, y - 0.3, 2.6, 0.6);
  }
  if (l || r) {
    const ex = l ? x + 2 : x + TILE - 2;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ex, y + 6);
    ctx.lineTo(ex, y + 10);
    ctx.stroke();
    ctx.fillStyle = PURPLE_HI;
    ctx.beginPath();
    ctx.moveTo(ex - 1.6, y + 10);
    ctx.lineTo(ex + 1.6, y + 10);
    ctx.lineTo(ex + 1, y + 15);
    ctx.lineTo(ex - 1, y + 15);
    ctx.fill();
    circle(ctx, ex, y + 10, 1.2, GOLD);
  }
}

/** Chapter V rooms keep the shared spikes. */
export function drawSpikesCh5(ctx: Ctx, biome: Ch5Biome, tx: number, ty: number): boolean {
  return false;
}

// ---------------------------------------------------------------- liquids

/** What the river left behind: shallow, still puddles on the mud, the moon in them. */
export function drawLiquidCh5(ctx: Ctx, biome: Biome, tt: T, x: number, y: number, top: boolean, tx: number, t: number): boolean {
  if (biome !== 'riverbed' || tt !== T.Water) return false;
  const wy = top ? 9 : 0;
  ctx.fillStyle = '#241c14';
  ctx.fillRect(x, y + (top ? 6 : 0), TILE, TILE - (top ? 6 : 0));
  ctx.fillStyle = 'rgba(30,46,80,0.92)';
  ctx.fillRect(x, y + wy, TILE, TILE - wy);
  if (top) {
    ctx.fillStyle = 'rgba(196,210,255,0.55)';
    ctx.fillRect(x, y + wy, TILE, 0.6);
    ctx.fillStyle = 'rgba(120,140,200,0.25)';
    ctx.fillRect(x, y + wy + 1.6, TILE, 0.5);
    // the moon's light lying in the water, barely trembling
    const s = Math.sin(t * 0.8 + tx * 1.7) * 0.6;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#c8d4ff', x + 8 + s, y + wy + 2.5, 10, 2.2, 0.28);
    ctx.globalCompositeOperation = 'source-over';
    if (hash2(tx, 0, 241) < 0.4) {
      ctx.fillStyle = 'rgba(240,244,255,0.7)';
      ctx.fillRect(x + 3 + hash2(tx, 1, 241) * 9 + s, y + wy + 2.2, 2.4, 0.4);
    }
  }
  return true;
}

// ---------------------------------------------------------------- props

type PropFn = (ctx: Ctx, e: Decor, pal: BiomePal, rng: RNG) => void;

const MUD_DK = '#2a2016';
const REED_DEAD = ['#5a4e36', '#7a6a4a', '#9a8a64'] as const;

// ----- the river

const deadReeds: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 3) * TILE, H = (e.h ?? 3) * TILE;
  ctx.lineCap = 'round';
  for (let layer = 0; layer < 3; layer++) {
    ctx.strokeStyle = REED_DEAD[layer];
    ctx.lineWidth = layer ? 0.9 : 1.2;
    ctx.beginPath();
    const n = Math.round(W / (3 + layer));
    for (let i = 0; i < n; i++) {
      const px = rng.range(-W / 2, W / 2), hh = H * rng.range(0.45, 1);
      if (rng.chance(0.3)) {
        // snapped and bent over
        const kx = px + rng.range(-2, 2), ky = -hh * rng.range(0.4, 0.7), d = rng.chance(0.5) ? 1 : -1;
        ctx.moveTo(px, 30);
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + d * hh * 0.35, ky + hh * 0.2);
      } else {
        const bend = rng.range(-0.2, 0.2) * hh;
        ctx.moveTo(px, 30);
        ctx.quadraticCurveTo(px + bend * 0.2, -hh * 0.5, px + bend, -hh);
      }
    }
    ctx.stroke();
  }
  // ragged heads gone to seed, moonlight on a few stems
  for (let i = 0; i < 5; i++) {
    const px = rng.range(-W / 2, W / 2), py = -H * rng.range(0.55, 0.9);
    ctx.beginPath();
    ctx.ellipse(px, py, 1.4, 3.2, rng.range(-0.3, 0.3), 0, TAU);
    solidify(ctx, '#4a3a26', OUT, 0.3);
    ctx.fillStyle = 'rgba(220,214,190,0.5)';
    for (let k = 0; k < 3; k++) ctx.fillRect(px + rng.range(-2, 2), py - 3 - rng.range(0, 3), 0.6, 0.6);
  }
  ctx.strokeStyle = 'rgba(200,212,255,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const px = rng.range(0, W / 2), hh = H * rng.range(0.4, 0.8);
    ctx.moveTo(px + 0.5, 0);
    ctx.lineTo(px + 0.5 + hh * 0.05, -hh);
  }
  ctx.stroke();
};

/** A river boat left on the mud when the water went: planked hull, high prow, a broken mast. */
const strandedBoat: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 10) * TILE, hh = Math.min(30, W * 0.15);
  ctx.save();
  ctx.translate(0, 3);
  ctx.rotate(-0.05);
  // the hull: a long shallow curve rising to prow and stern posts
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-W / 2, -hh * 1.5);
    ctx.quadraticCurveTo(-W * 0.44, -hh * 0.2, -W * 0.3, 0);
    ctx.lineTo(W * 0.3, 0);
    ctx.quadraticCurveTo(W * 0.46, -hh * 0.2, W / 2, -hh * 1.9);
    ctx.lineTo(W / 2 - 4, -hh * 1.9);
    ctx.quadraticCurveTo(W * 0.4, -hh * 0.9, W * 0.3, -hh);
    ctx.lineTo(-W * 0.3, -hh);
    ctx.quadraticCurveTo(-W * 0.4, -hh * 0.8, -W / 2 + 4, -hh * 1.5);
    ctx.closePath();
  };
  hull();
  solidify(ctx, metalGrad(ctx, -W / 2, W / 2, ['#4a3420', '#8a6a44', '#24180c']), OUT, 0.7);
  ctx.save();
  hull();
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,10,4,0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let k = 1; k < 5; k++) {
    const yy = -hh * (k / 5);
    ctx.moveTo(-W / 2, yy - k * 0.5);
    ctx.quadraticCurveTo(0, yy + 2, W / 2, yy - k * 1.6);
  }
  for (let px = -W * 0.3; px < W * 0.3; px += 18) {
    ctx.moveTo(px, -hh);
    ctx.lineTo(px + 1, 0);
  }
  ctx.stroke();
  // mud caked along the keel, a pale line where the water stood
  ctx.fillStyle = 'rgba(60,46,30,0.85)';
  ctx.fillRect(-W / 2, -hh * 0.3, W, hh * 0.4);
  ctx.fillStyle = 'rgba(200,190,160,0.25)';
  ctx.fillRect(-W / 2, -hh * 0.62, W, 1);
  ctx.restore();
  // gunwale catching the moon
  ctx.strokeStyle = 'rgba(200,214,255,0.4)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-W * 0.42, -hh * 1.05);
  ctx.lineTo(W * 0.42, -hh * 1.05);
  ctx.stroke();
  // the mast, broken, the sail hanging in rags
  const mx = -W * 0.05, mt = -hh - W * 0.28;
  ctx.beginPath();
  taper(ctx, mx, -hh, 3.2, mx + 4, mt, 2.4);
  solidify(ctx, '#5a3e22', OUT, 0.4);
  ctx.beginPath();
  taper(ctx, mx + 4, mt + 2, 2, mx + W * 0.2, mt + 18, 1.6);
  solidify(ctx, '#5a3e22', OUT, 0.35);
  ctx.beginPath();
  ctx.moveTo(mx + 4, mt + 4);
  ctx.lineTo(mx + W * 0.18, mt + 18);
  ctx.lineTo(mx + W * 0.13, mt + 30);
  ctx.lineTo(mx + W * 0.08, mt + 24);
  ctx.lineTo(mx + 5, mt + 34);
  ctx.closePath();
  solidify(ctx, '#8a7a5a', OUT, 0.4);
  ctx.strokeStyle = 'rgba(40,30,20,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(mx + 4, mt);
  ctx.lineTo(-W * 0.42, -hh * 1.4);
  ctx.moveTo(mx + 4, mt);
  ctx.lineTo(W * 0.44, -hh * 1.7);
  ctx.stroke();
  // an oar left across the thwarts
  ctx.beginPath();
  taper(ctx, -W * 0.25, -hh * 1.2, 1.6, W * 0.18, -hh * 0.7, 1.6);
  ctx.moveTo(W * 0.24, -hh * 0.6);
  ctx.ellipse(W * 0.2, -hh * 0.66, 5, 2, 0.1, 0, TAU);
  solidify(ctx, '#6a4a2a', OUT, 0.35);
  ctx.restore();
  // dead reeds against the hull
  ctx.strokeStyle = REED_DEAD[1];
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const px = rng.range(-W * 0.45, W * 0.45), h2 = rng.range(6, 16);
    ctx.moveTo(px, 2);
    ctx.lineTo(px + rng.range(-3, 3), -h2);
  }
  ctx.stroke();
};

const mooringPost: PropFn = (ctx) => {
  ctx.beginPath();
  ctx.rect(-3, -30, 6, 32);
  solidify(ctx, metalGrad(ctx, -3, 3, ['#5a4028', '#8a6a44', '#2a1a0c']), OUT, 0.5);
  ctx.fillStyle = 'rgba(60,46,30,0.8)';
  ctx.fillRect(-3, -9, 6, 9);
  ctx.fillStyle = 'rgba(210,200,170,0.3)';
  ctx.fillRect(-3, -9.6, 6, 0.8);
  ctx.beginPath();
  ctx.ellipse(0, -31, 3.2, 1.4, 0, 0, TAU);
  ctx.fillStyle = '#a07a4a';
  ctx.fill();
  // rope wound round it, one end trailing to the mud
  ctx.strokeStyle = '#a89060';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    ctx.moveTo(-3, -22 + k * 2);
    ctx.lineTo(3, -21 + k * 2);
  }
  ctx.moveTo(3, -16);
  ctx.quadraticCurveTo(10, -6, 16, 0);
  ctx.stroke();
  ctx.strokeStyle = '#3a3434';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-4.6, -14, 2.4, 0, TAU);
  ctx.stroke();
};

const fishBones: PropFn = (ctx, e, pal, rng) => {
  const fish = (x: number, s: number, a: number) => {
    ctx.save();
    ctx.translate(x, -1.2 * s);
    ctx.rotate(a);
    ctx.scale(s, s);
    ctx.strokeStyle = '#d6ccb4';
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(7, 0);
    for (let i = -6; i <= 5; i += 1.6) {
      const r = 3.4 * (1 - Math.abs(i + 0.5) / 9);
      ctx.moveTo(i, 0);
      ctx.quadraticCurveTo(i - 0.6, -r * 0.6, i - 1.2, -r);
      ctx.moveTo(i, 0);
      ctx.quadraticCurveTo(i - 0.6, r * 0.6, i - 1.2, r);
    }
    ctx.moveTo(-9, 0);
    ctx.lineTo(-12, -2.6);
    ctx.moveTo(-9, 0);
    ctx.lineTo(-12, 2.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, -2.6);
    ctx.quadraticCurveTo(12, -1.5, 12.4, 0.6);
    ctx.lineTo(7, 2.6);
    ctx.closePath();
    solidify(ctx, '#d6ccb4', OUT, 0.3);
    circle(ctx, 9.4, -0.4, 0.9, '#1a120c');
    ctx.restore();
  };
  fish(-8, 1.2, 0.1);
  fish(10, 0.8, -0.3);
  fish(1, 0.6, 2.9);
  for (let i = 0; i < 6; i++) ctx.fillRect(rng.range(-16, 18), -0.6, 1.4, 0.5);
};

/** The river gate in the wall: an arch over the empty channel, its bronze leaves standing open. */
const riverGate: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 10) * TILE, H = (e.h ?? 12) * TILE;
  const R = W * 0.3, spring = -H * 0.5;
  // the pylon around the arch
  brickField(ctx, -W / 2, -H, W / 2, 0, 10, 5, ['#2a2a3a', '#24242f', '#30303e'], 251, 'rgba(0,0,0,0.5)', 0.6);
  merlons(ctx, -W / 2, W / 2, -H, 10, '#2a2a3a');
  // the water once stood this high: pale stains and weed lines across the stone
  ctx.fillStyle = 'rgba(160,170,150,0.16)';
  ctx.fillRect(-W / 2, -H * 0.22, W, 6);
  ctx.fillStyle = 'rgba(60,80,50,0.35)';
  ctx.fillRect(-W / 2, -H * 0.16, W, 3);
  // the tunnel: dark, with the feast's glow at its far end
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.lineTo(-R, spring);
  ctx.arc(0, spring, R, Math.PI, 0);
  ctx.lineTo(R, 0);
  ctx.closePath();
  ctx.fillStyle = '#05060c';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff9a4a', 0, spring * 0.4, R * 0.7, -spring * 0.5, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#2a2016';
  ctx.fillRect(-R, -4, R * 2, 4);
  // the raised portcullis, its teeth just showing
  ctx.fillStyle = '#1c1a1e';
  for (let px = -R + 4; px < R - 2; px += 7) {
    ctx.fillRect(px, spring - R + 6, 2, 10);
    ctx.beginPath();
    ctx.moveTo(px - 0.6, spring - R + 16);
    ctx.lineTo(px + 1, spring - R + 20);
    ctx.lineTo(px + 2.6, spring - R + 16);
    ctx.fill();
  }
  // the bronze leaves, swung in against the tunnel walls
  for (const sx of [-1, 1]) {
    const hx = sx * R, fx = sx * R * 0.45;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, spring + 6);
    ctx.lineTo(fx, spring * 0.78);
    ctx.lineTo(fx, -6);
    ctx.closePath();
    solidify(ctx, metalGrad(ctx, Math.min(hx, fx), Math.max(hx, fx), ['#8a5e2a', '#d8a860', '#3a2410']), OUT, 0.6);
    ctx.fillStyle = 'rgba(40,24,8,0.6)';
    for (const f of [0.2, 0.5, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(hx, (spring + 6) * f);
      ctx.lineTo(fx, spring * 0.78 * f - 6 * (1 - f));
      ctx.lineTo(fx, spring * 0.78 * f - 6 * (1 - f) + 3);
      ctx.lineTo(hx, (spring + 6) * f + 3);
      ctx.fill();
    }
    ctx.fillStyle = GOLD_HI;
    for (let k = 0; k < 5; k++) circle(ctx, (hx + fx) / 2, spring * 0.6 + k * (-spring * 0.16), 1, GOLD_HI);
  }
  // voussoirs of glazed brick, a gold edge
  ctx.beginPath();
  ctx.moveTo(-R - 12, spring);
  ctx.arc(0, spring, R + 12, Math.PI, 0);
  ctx.lineTo(R, spring);
  ctx.arc(0, spring, R, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = GLAZE;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,10,0.6)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let k = 1; k < 12; k++) {
    const a = Math.PI + (k / 12) * Math.PI;
    ctx.moveTo(Math.cos(a) * R, spring + Math.sin(a) * R);
    ctx.lineTo(Math.cos(a) * (R + 12), spring + Math.sin(a) * (R + 12));
  }
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, spring, R + 12, Math.PI, 0);
  ctx.stroke();
  lionRelief(ctx, -W * 0.34, -H * 0.62, 0.7, 1);
  lionRelief(ctx, W * 0.34, -H * 0.62, 0.7, -1);
};

// ----- the streets of the feast

const revelerTable: PropFn = (ctx, e, pal, rng) => {
  // cushions on the ground, a low table, the remains of the drinking
  for (const [cx, col] of [[-20, '#6a1a3a'], [21, '#2a3a7a']] as const) {
    ctx.beginPath();
    ctx.ellipse(cx, -3, 9, 3.4, 0, 0, TAU);
    solidify(ctx, col, OUT, 0.4);
    ctx.fillStyle = 'rgba(255,220,180,0.2)';
    ctx.fillRect(cx - 6, -5.6, 8, 0.8);
  }
  ctx.beginPath();
  ctx.rect(-16, -12, 32, 3);
  solidify(ctx, CEDAR, OUT, 0.5);
  ctx.fillStyle = '#4a2a14';
  ctx.fillRect(-14, -9, 2.4, 9);
  ctx.fillRect(11.6, -9, 2.4, 9);
  ctx.beginPath();
  ctx.ellipse(-6, -13, 7, 1.6, 0, 0, TAU);
  solidify(ctx, '#b88a3a', OUT, 0.35);
  for (let k = 0; k < 6; k++) circle(ctx, -9 + k * 1.4, -14.4 - (k % 2), 1.3, k & 1 ? '#6a1a4a' : '#8a2a5a');
  // goblets, one tipped and spilling
  for (const gx of [6, 11]) {
    ctx.beginPath();
    ctx.moveTo(gx - 2, -19);
    ctx.lineTo(gx + 2, -19);
    ctx.lineTo(gx + 0.5, -15);
    ctx.lineTo(gx + 0.5, -13.2);
    ctx.lineTo(gx + 1.6, -12);
    ctx.lineTo(gx - 1.6, -12);
    ctx.lineTo(gx - 0.5, -13.2);
    ctx.lineTo(gx - 0.5, -15);
    ctx.closePath();
    solidify(ctx, GOLD, OUT, 0.3);
  }
  ctx.save();
  ctx.translate(-26, -1.6);
  ctx.rotate(1.4);
  ctx.beginPath();
  ctx.moveTo(-2, -4);
  ctx.lineTo(2, -4);
  ctx.lineTo(0.5, 0);
  ctx.lineTo(-0.5, 0);
  ctx.closePath();
  solidify(ctx, GOLD, OUT, 0.3);
  ctx.restore();
  ctx.fillStyle = 'rgba(90,10,24,0.85)';
  ctx.beginPath();
  ctx.ellipse(-33, -0.3, 6, 1, 0, 0, TAU);
  ctx.fill();
  jar(ctx, 28, 0, 4, 12, '#7a2a1a', 'rgba(232,190,110,0.7)');
};

const wineJars: PropFn = (ctx, e, pal, rng) => {
  jar(ctx, -10, 0, 6, 26, '#6a2a1c', 'rgba(232,190,110,0.6)');
  jar(ctx, 3, 0, 6.5, 30, '#7a3420', 'rgba(232,190,110,0.6)');
  jar(ctx, 14, 0, 5, 20, '#5a2418', null);
  // one on its side, its wine run out across the stones
  ctx.save();
  ctx.translate(-24, -5.5);
  ctx.rotate(-1.45);
  jar(ctx, 0, 6, 5, 22, '#6a2a1c', 'rgba(232,190,110,0.6)');
  ctx.restore();
  ctx.fillStyle = 'rgba(90,8,20,0.9)';
  ctx.beginPath();
  ctx.ellipse(-40, -0.3, 10, 1.3, 0, 0, TAU);
  ctx.ellipse(-48, -0.2, 5, 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,180,190,0.3)';
  ctx.fillRect(-44, -0.9, 6, 0.5);
};

// ----- the hanging gardens

const terraceArch: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 8) * TILE, H = (e.h ?? 6) * TILE;
  const R = W * 0.28, spring = -H * 0.55;
  brickField(ctx, -W / 2, -H, W / 2, 0, 16, 8, ['#5e5a50', '#56524a', '#666054'], 261, 'rgba(0,0,0,0.35)', 0.6);
  ctx.fillStyle = 'rgba(190,206,255,0.12)';
  ctx.fillRect(-W / 2, -H, W, 1);
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.lineTo(-R, spring);
  ctx.arc(0, spring, R, Math.PI, 0);
  ctx.lineTo(R, 0);
  ctx.closePath();
  ctx.fillStyle = '#080a10';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, LAMP, 0, spring * 0.5, R * 0.9, -spring * 0.6, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(-1, spring * 0.5 - 4, 2, 4);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#fff0c0', 0, spring * 0.5 - 6, 3, 4, 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#8a8474';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-R - 2.5, 0);
  ctx.lineTo(-R - 2.5, spring);
  ctx.arc(0, spring, R + 2.5, Math.PI, 0);
  ctx.lineTo(R + 2.5, 0);
  ctx.stroke();
  // ivy over the top of the arch
  ctx.fillStyle = '#22361c';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + rng.range(0, Math.PI), r = R + rng.range(0, 10);
    const lx = Math.cos(a) * r, ly = spring + Math.sin(a) * r;
    ctx.moveTo(lx + 3, ly);
    ctx.arc(lx, ly, rng.range(2, 4), 0, TAU);
  }
  ctx.fill();
};

const VINE_LEAF = ['#1e3218', '#2e4a22', '#44682e'] as const;

/** A tree of the gardens: a pomegranate heavy with fruit, or a cypress (chosen by place). */
const gardenTree: PropFn = (ctx, e, pal, rng) => {
  const cyp = (e.v ?? (hash2(Math.floor(e.x), Math.floor(e.y), 271) < 0.5 ? 1 : 0)) === 1;
  if (cyp) {
    const H = (e.h ?? 7) * TILE, w = H * 0.12;
    ctx.beginPath();
    ctx.rect(-2, -10, 4, 12);
    solidify(ctx, '#3a2a1a', OUT, 0.4);
    for (let layer = 0; layer < 3; layer++) {
      const k = 1 - layer * 0.18;
      ctx.beginPath();
      ctx.moveTo(-w * 0.55 * k, -6);
      ctx.quadraticCurveTo(-w * 1.15 * k, -H * 0.45, 0, -H * (1 - layer * 0.04));
      ctx.quadraticCurveTo(w * 1.15 * k, -H * 0.45, w * 0.55 * k, -6);
      ctx.closePath();
      if (layer === 0) solidify(ctx, VINE_LEAF[0], OUT, 0.5);
      else {
        ctx.fillStyle = VINE_LEAF[layer];
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(190,210,255,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const y0 = -H * rng.range(0.15, 0.9), half = w * (1 - Math.abs(y0 / H + 0.45) * 0.9);
      ctx.moveTo(half * 0.2, y0);
      ctx.quadraticCurveTo(half * 0.6, y0 + 2, half * 0.9, y0 + 5);
    }
    ctx.stroke();
    return;
  }
  const H = (e.h ?? 5) * TILE;
  ctx.beginPath();
  taper(ctx, 0, 2, 5, 2, -H * 0.45, 3);
  taper(ctx, 2, -H * 0.42, 2.2, -10, -H * 0.62, 1.4);
  taper(ctx, 2, -H * 0.42, 2.2, 12, -H * 0.66, 1.4);
  solidify(ctx, '#4a3424', OUT, 0.5);
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = VINE_LEAF[layer];
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = rng.range(0, TAU), r = H * rng.range(0.08, 0.32) * (1 - layer * 0.2);
      const cx = Math.cos(a) * r + (layer ? -2 : 0), cy = -H * 0.66 + Math.sin(a) * r * 0.75 - layer * 2;
      const rr = H * rng.range(0.1, 0.15);
      ctx.moveTo(cx + rr, cy);
      ctx.arc(cx, cy, rr, 0, TAU);
    }
    ctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, TAU), r = H * rng.range(0.05, 0.3);
    const fx = Math.cos(a) * r, fy = -H * 0.62 + Math.sin(a) * r * 0.7;
    circle(ctx, fx, fy, 2.4, '#a8202a');
    ctx.fillStyle = '#5a0a14';
    ctx.fillRect(fx - 0.6, fy - 3.2, 1.2, 1.2);
    circle(ctx, fx - 0.8, fy - 0.8, 0.7, 'rgba(255,200,200,0.6)');
  }
};

/** The fountain's stone: basin, pedestal and bowl, a lion's head to spout (water drawn live). */
const fountain: PropFn = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(-26, -9);
  ctx.lineTo(26, -9);
  ctx.lineTo(26, 0);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -26, 26, ['#8a8474', '#c8c2b2', '#4a463e']), OUT, 0.5);
  ctx.beginPath();
  ctx.ellipse(0, -9, 26, 3.4, 0, 0, TAU);
  solidify(ctx, '#a8a292', OUT, 0.5);
  ctx.beginPath();
  ctx.ellipse(0, -9, 23, 2.4, 0, 0, TAU);
  ctx.fillStyle = '#1a2a4a';
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-3.5, -30, 7, 21);
  solidify(ctx, metalGrad(ctx, -3.5, 3.5, ['#8a8474', '#c8c2b2', '#4a463e']), OUT, 0.5);
  ctx.beginPath();
  ctx.moveTo(-12, -32);
  ctx.quadraticCurveTo(0, -24, 12, -32);
  ctx.closePath();
  ctx.ellipse(0, -32, 12, 2.2, 0, 0, TAU);
  solidify(ctx, '#a8a292', OUT, 0.5);
  ctx.beginPath();
  ctx.ellipse(0, -32, 10, 1.6, 0, 0, TAU);
  ctx.fillStyle = '#1a2a4a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -37, 3.6, 0, TAU);
  solidify(ctx, GOLD, OUT, 0.4);
  circle(ctx, -1.2, -38, 0.6, '#3a2008');
  ctx.fillStyle = 'rgba(190,206,255,0.3)';
  ctx.fillRect(-25, -9, 10, 0.8);
};

/** The waterwheel's frame and channels (the wheel turns live). */
const irrigationWheel: PropFn = (ctx, e) => {
  const H = (e.h ?? 8) * TILE, R = H * 0.42, cy = -R - 6;
  // the trough it lifts from and the aqueduct it feeds
  ctx.beginPath();
  ctx.rect(-R - 10, -8, R * 2 + 20, 8);
  solidify(ctx, '#6a6252', OUT, 0.5);
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(-R - 8, -7, R * 2 + 16, 3);
  ctx.beginPath();
  ctx.rect(-R - 30, cy - R - 4, R + 26, 6);
  solidify(ctx, '#7a7262', OUT, 0.5);
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(-R - 30, cy - R - 3, R + 24, 2);
  for (const px of [-R - 24, -R - 4]) {
    ctx.beginPath();
    ctx.rect(px, cy - R + 2, 5, -cy + R - 10);
    solidify(ctx, '#5e584a', OUT, 0.4);
  }
  // timber trestles holding the axle
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    taper(ctx, sx * 14, 0, 4, 0, cy, 3);
    solidify(ctx, CEDAR, OUT, 0.5);
  }
  ctx.beginPath();
  ctx.arc(0, cy, 4, 0, TAU);
  solidify(ctx, '#3a2a1a', OUT, 0.4);
};

const flowerBed: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 3) * TILE;
  ctx.beginPath();
  ctx.rect(-W / 2, -7, W, 7);
  solidify(ctx, metalGrad(ctx, -W / 2, W / 2, ['#7a7464', '#b0aa98', '#3e3a32']), OUT, 0.5);
  ctx.fillStyle = '#1e1810';
  ctx.fillRect(-W / 2 + 1.5, -8, W - 3, 1.6);
  ctx.strokeStyle = '#2e4a22';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  const heads: number[] = [];
  for (let i = 0; i < 16; i++) {
    const px = rng.range(-W / 2 + 3, W / 2 - 3), hh = rng.range(6, 16);
    ctx.moveTo(px, -8);
    ctx.quadraticCurveTo(px + rng.range(-2, 2), -8 - hh * 0.6, px + rng.range(-2, 2), -8 - hh);
    heads.push(px, -8 - hh);
  }
  ctx.stroke();
  ctx.fillStyle = '#3a5a2a';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse(rng.range(-W / 2 + 3, W / 2 - 3), -9 - rng.range(0, 6), 2.6, 1, rng.range(-0.8, 0.8), 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < heads.length; i += 2) {
    const k = (i / 2) % 4;
    const col = k === 0 ? '#f2eef8' : k === 1 ? '#c02a3a' : k === 2 ? '#5a4ab0' : '#f0d070';
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU;
      circle(ctx, heads[i] + Math.cos(a) * 1.3, heads[i + 1] + Math.sin(a) * 1.3, 1.1, col);
    }
    circle(ctx, heads[i], heads[i + 1], 0.7, '#e8c040');
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < heads.length; i += 8) blob(ctx, '#c8d4ff', heads[i], heads[i + 1], 5, 5, 0.25);
  ctx.globalCompositeOperation = 'source-over';
};

// ----- the palace

const BEAST = '#e4b64c';
const BEAST_OUT = '#08122a';

/** An aurochs striding in glazed relief, feet on y, facing dir; s = 1 is about 40 units long. */
function bullRelief(ctx: Ctx, x: number, y: number, s: number, dir: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  ctx.beginPath();
  ctx.ellipse(-2, -12.5, 13.5, 6, -0.03, 0, TAU);
  ctx.moveTo(15.5, -14);
  ctx.ellipse(12.5, -14, 4.2, 3.4, 0.35, 0, TAU);
  taper(ctx, -12, -12, 6, -14, -4, 3.4);
  taper(ctx, -14, -4, 3.2, -15, -0.4, 3);
  taper(ctx, -8, -11, 5, -7.4, -4, 3);
  taper(ctx, -7.4, -4, 3, -6.8, -0.4, 2.8);
  taper(ctx, 4, -11, 4.6, 3.4, -4, 3);
  taper(ctx, 3.4, -4, 3, 3, -0.4, 2.8);
  taper(ctx, 8, -11, 4.6, 10.6, -4, 3);
  taper(ctx, 10.6, -4, 3, 12, -0.4, 2.8);
  taper(ctx, -15, -15, 1.6, -18, -9, 1.2);
  ctx.moveTo(-16.6, -7);
  ctx.ellipse(-18, -7.6, 1.4, 2.4, 0.2, 0, TAU);
  solidify(ctx, BEAST, BEAST_OUT, 0.45);
  // horns sweeping forward, the curled hair of the neck and shoulder
  ctx.strokeStyle = BEAST_OUT;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(11, -17);
  ctx.quadraticCurveTo(13, -23, 18.5, -22.5);
  ctx.stroke();
  ctx.strokeStyle = '#f6eed6';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(110,60,10,0.55)';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const cx = 3 + i * 1.6, cy = -16 + (i & 1) * 2.4;
    ctx.moveTo(cx + 1, cy);
    ctx.arc(cx, cy, 1, 0, TAU);
  }
  ctx.moveTo(-12, -7.4);
  ctx.quadraticCurveTo(-2, -5.8, 6, -7.2);
  ctx.stroke();
  circle(ctx, 13.6, -15, 0.6, BEAST_OUT);
  ctx.strokeStyle = 'rgba(255,246,206,0.75)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-14, -16.6);
  ctx.quadraticCurveTo(-4, -19, 6, -18);
  ctx.stroke();
  ctx.restore();
}

const paletteColumn: PropFn = (ctx, e) => {
  const H = (e.h ?? 18) * TILE;
  // plinth with a glazed band
  ctx.beginPath();
  ctx.rect(-16, -10, 32, 10);
  solidify(ctx, '#2a3c6a', OUT, 0.5);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-16, -10, 32, 1.2);
  ctx.fillRect(-16, -2, 32, 1);
  rosette(ctx, -8, -5.4, 2.6);
  rosette(ctx, 8, -5.4, 2.6);
  ctx.beginPath();
  ctx.ellipse(0, -11.5, 13, 2.6, 0, 0, TAU);
  solidify(ctx, '#c8bca4', OUT, 0.4);
  // fluted shaft, lamplight down its left side
  const top = -H + 22;
  ctx.beginPath();
  ctx.rect(-10, top, 20, -12 - top);
  solidify(ctx, metalGrad(ctx, -10, 10, ['#c4b8a0', '#f0e6d0', '#5a5040']), OUT, 0.5);
  ctx.strokeStyle = 'rgba(60,40,20,0.3)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let fx = -6; fx <= 6; fx += 3) {
    ctx.moveTo(fx, top + 2);
    ctx.lineTo(fx, -13);
  }
  ctx.stroke();
  // a gilt collar at eye height, with a lamp on a bracket where the columns are tall
  const cy = -Math.min(H * 0.42, 120);
  ctx.fillStyle = GOLD_DK;
  ctx.fillRect(-11.5, cy - 5, 23, 10);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-11.5, cy - 5, 23, 1.4);
  ctx.fillRect(-11.5, cy + 3.6, 23, 1.4);
  rosette(ctx, -4.5, cy, 2.4);
  rosette(ctx, 4.5, cy, 2.4);
  if (H > 200) {
    ctx.strokeStyle = GOLD_DK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, cy + 10);
    ctx.quadraticCurveTo(-18, cy + 8, -19, cy - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-19, cy - 2, 4.4, 1.8, 0, 0, Math.PI);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.fillStyle = '#ffe8a8';
    ctx.beginPath();
    ctx.moveTo(-20.4, cy - 2);
    ctx.quadraticCurveTo(-19.6, cy - 6.5, -19, cy - 7.6);
    ctx.quadraticCurveTo(-18, cy - 5, -17.6, cy - 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, LAMP, -19, cy - 5, 20, 20, 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const f of [0.2, 0.75]) {
    const by = top + (-12 - top) * f;
    ctx.fillStyle = GOLD_DK;
    ctx.fillRect(-10.5, by, 21, 3);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-10.5, by, 21, 1.3);
  }
  // a capital of gilded volutes and two bulls back to back, carrying the beam
  ctx.beginPath();
  ctx.rect(-12, top - 6, 24, 6);
  solidify(ctx, GOLD, OUT, 0.5);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 11, top - 3, 4, 0, TAU);
    solidify(ctx, GOLD, OUT, 0.4);
    circle(ctx, sx * 11, top - 3, 1.6, GOLD_DK);
    ctx.save();
    ctx.translate(sx * 2, top - 6);
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -10);
    ctx.quadraticCurveTo(8, -12, 14, -9);
    ctx.lineTo(17, -7);
    ctx.lineTo(16, -4);
    ctx.lineTo(12, -4.6);
    ctx.lineTo(11, 0);
    ctx.closePath();
    solidify(ctx, metalGrad(ctx, 0, 17, [GOLD, GOLD_HI, GOLD_DK]), OUT, 0.45);
    ctx.strokeStyle = '#f6eed6';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(12, -10);
    ctx.quadraticCurveTo(13, -14, 16, -14);
    ctx.stroke();
    circle(ctx, 14, -8, 0.6, OUT);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.rect(-22, top - 22, 44, 6);
  solidify(ctx, CEDAR, OUT, 0.5);
  ctx.fillStyle = 'rgba(255,214,160,0.3)';
  ctx.fillRect(-22, top - 22, 44, 0.8);
};

/** A glazed frieze band: rosettes above and below, gold lions, bulls and dragons walking between. */
const glazedFrieze: PropFn = (ctx, e) => {
  const W = (e.w ?? 40) * TILE, hgt = 44;
  const x0 = -W / 2, x1 = W / 2, v = localView(ctx);
  rosetteBand(ctx, Math.max(x0, v[0] - 20), Math.min(x1, v[2] + 20), -hgt, 9);
  ctx.fillStyle = '#16346a';
  ctx.fillRect(Math.max(x0, v[0] - 20), -hgt + 9, Math.min(x1, v[2] + 20) - Math.max(x0, v[0] - 20), hgt - 18);
  rosetteBand(ctx, Math.max(x0, v[0] - 20), Math.min(x1, v[2] + 20), -9, 9);
  const step = 64;
  let i = 0;
  for (let x = x0 + step / 2; x < x1; x += step, i++) {
    if (x < v[0] - 40 || x > v[2] + 40) continue;
    const k = i % 3;
    if (k === 0) lionRelief(ctx, x, -10.5, 0.62, 1);
    else if (k === 1) bullRelief(ctx, x, -10.5, 0.62, 1);
    else dragonRelief(ctx, x, -10.5, 0.62, 1);
  }
};

/** The fixed part of a curtain: its gilded rod and rings (the drapery sways live). */
const curtainRod: PropFn = (ctx) => {
  ctx.fillStyle = GOLD_DK;
  ctx.fillRect(-26, -1, 52, 3);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-26, -1, 52, 1.2);
  circle(ctx, -27.5, 0.5, 2.4, GOLD);
  circle(ctx, 27.5, 0.5, 2.4, GOLD);
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(-1, -8, 2, 7);
};

/** A long feasting table under a white cloth: roast fowl, bread, fruit, gold cups, candles. */
const feastTable: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 12) * TILE, hw = W / 2, top = -17;
  // carved legs with lion's feet showing under the cloth
  for (const lx of [-hw + 6, hw - 6]) {
    ctx.beginPath();
    taper(ctx, lx, top, 3, lx, -2, 3.4);
    ctx.moveTo(lx + 3.4, -1.4);
    ctx.ellipse(lx, -1.4, 3.4, 1.6, 0, 0, TAU);
    solidify(ctx, GOLD_DK, OUT, 0.4);
  }
  // the cloth, a purple runner fringed with gold
  ctx.beginPath();
  ctx.moveTo(-hw, top);
  ctx.lineTo(hw, top);
  ctx.lineTo(hw - 2, -5);
  for (let x = hw - 2; x > -hw + 2; x -= 8) ctx.quadraticCurveTo(x - 4, -3.5, x - 8, -5);
  ctx.closePath();
  solidify(ctx, '#e4dcc8', OUT, 0.5);
  ctx.fillStyle = 'rgba(120,100,90,0.25)';
  for (let x = -hw + 6; x < hw - 4; x += 8) ctx.fillRect(x, top + 2, 1.2, 10);
  ctx.fillStyle = PURPLE;
  ctx.fillRect(-hw, top, W, 4);
  ctx.fillStyle = GOLD;
  for (let x = -hw + 1; x < hw; x += 2.2) ctx.fillRect(x, top + 4, 0.7, 1.8);
  ctx.fillStyle = 'rgba(255,240,220,0.4)';
  ctx.fillRect(-hw, top, W, 0.7);
  // the feast along the board
  let x = -hw + 8;
  let k = 0;
  while (x < hw - 6) {
    const kind = (k + rng.int(0, 2)) % 5;
    if (kind === 0) {
      // a roast bird on a silver dish
      ellipse(ctx, x, top - 0.6, 7, 1.4, 0, '#b8bcc6');
      ctx.beginPath();
      ctx.ellipse(x, top - 4, 5, 3.4, 0, 0, TAU);
      solidify(ctx, '#8a4a1e', OUT, 0.4);
      ctx.beginPath();
      taper(ctx, x + 3, top - 4, 1.6, x + 7, top - 7, 1);
      solidify(ctx, '#8a4a1e', OUT, 0.3);
      ctx.fillStyle = 'rgba(255,210,160,0.45)';
      ctx.fillRect(x - 3, top - 6.4, 4, 0.8);
    } else if (kind === 1) {
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.ellipse(x - 4 + j * 4, top - 1.8, 2.6, 2, 0, Math.PI, 0);
        solidify(ctx, '#c89a5a', OUT, 0.3);
      }
    } else if (kind === 2) {
      // grapes and pomegranates heaped in a gold bowl
      ctx.beginPath();
      ctx.ellipse(x, top - 1.4, 6, 2.4, 0, 0, Math.PI);
      ctx.lineTo(x - 6, top - 1.4);
      solidify(ctx, GOLD, OUT, 0.35);
      for (let j = 0; j < 7; j++) circle(ctx, x - 3.6 + (j % 4) * 2.2, top - 2.8 - (j > 3 ? 1.8 : 0), 1.2, j & 1 ? '#4a1a5a' : '#6a2a7a');
      circle(ctx, x + 3, top - 4, 2, '#a8202a');
    } else if (kind === 3) {
      // gold goblets
      for (const gx of [x - 3, x + 3]) {
        ctx.beginPath();
        ctx.moveTo(gx - 2, top - 8);
        ctx.lineTo(gx + 2, top - 8);
        ctx.lineTo(gx + 0.5, top - 4);
        ctx.lineTo(gx + 0.5, top - 1.4);
        ctx.lineTo(gx + 1.8, top);
        ctx.lineTo(gx - 1.8, top);
        ctx.lineTo(gx - 0.5, top - 1.4);
        ctx.lineTo(gx - 0.5, top - 4);
        ctx.closePath();
        solidify(ctx, GOLD, OUT, 0.3);
      }
    } else {
      // a candle burning
      ctx.fillStyle = '#efe6d0';
      ctx.fillRect(x - 1, top - 9, 2, 9);
      ctx.fillStyle = GOLD;
      ctx.fillRect(x - 2.4, top - 1, 4.8, 1);
      ctx.fillStyle = '#ffe8a8';
      ctx.beginPath();
      ctx.moveTo(x - 1, top - 9);
      ctx.quadraticCurveTo(x - 0.6, top - 12.4, x, top - 13.4);
      ctx.quadraticCurveTo(x + 0.8, top - 11.4, x + 1, top - 9);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, LAMP, x, top - 11, 12, 12, 0.55);
      ctx.globalCompositeOperation = 'source-over';
    }
    x += rng.range(13, 19);
    k++;
  }
};

/** The plaster wall beside the lampstand, warm in its light. (The writing is drawn live.) */
const plasterWall: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 14) * TILE, H = (e.h ?? 10) * TILE, hw = W / 2;
  brickField(ctx, -hw - 8, -H - 8, hw + 8, 0, 8, 4, ['#1c3f7a', '#183872', '#224a8c'], 281, 'rgba(4,10,28,0.7)', 0.5);
  ctx.fillStyle = '#b8ac94';
  ctx.fillRect(-hw, -H, W, H - 4);
  // a mottled skim of plaster, trowel marks
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(160,140,110,0.08)' : 'rgba(255,255,240,0.12)';
    ctx.beginPath();
    ctx.ellipse(rng.range(-hw + 6, hw - 6), -rng.range(10, H - 8), rng.range(6, 16), rng.range(3, 7), rng.range(0, 3), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,100,80,0.12)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const sx = rng.range(-hw + 4, hw - 20), sy = -rng.range(8, H - 8);
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 8, sy - 2, sx + rng.range(12, 22), sy + rng.range(-2, 2));
  }
  ctx.stroke();
  // the lampstand's light falls across it from the left
  const g = ctx.createRadialGradient(-hw - 30, -H * 0.4, 10, -hw - 30, -H * 0.4, W * 1.1);
  g.addColorStop(0, 'rgba(255,180,90,0.3)');
  g.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(-hw, -H, W, H - 4);
  ctx.globalCompositeOperation = 'source-over';
  const sg = ctx.createLinearGradient(-hw, 0, hw, 0);
  sg.addColorStop(0, 'rgba(20,8,20,0.05)');
  sg.addColorStop(1, 'rgba(20,8,20,0.5)');
  ctx.fillStyle = sg;
  ctx.fillRect(-hw, -H, W, H - 4);
  const tg = ctx.createLinearGradient(0, -H, 0, -H * 0.5);
  tg.addColorStop(0, 'rgba(20,8,20,0.35)');
  tg.addColorStop(1, 'rgba(20,8,20,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(-hw, -H, W, H * 0.5);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-hw - 1.5, -H - 1.5, W + 3, 1.5);
  ctx.fillRect(-hw - 1.5, -4, W + 3, 1.5);
  ctx.fillRect(-hw - 1.5, -H - 1.5, 1.5, H - 1);
  ctx.fillRect(hw, -H - 1.5, 1.5, H - 1);
};

/** The great golden lampstand: lion-footed base, a knopped shaft, seven arms (flames drawn live). */
const greatLampstand: PropFn = (ctx, e) => {
  const H = (e.h ?? 8) * TILE, ty = -H + 4;
  for (const sx of [-1, 0, 1]) {
    ctx.beginPath();
    taper(ctx, 0, -14, 3, sx * 12, -2, 2.4);
    ctx.moveTo(sx * 12 + 3, -1.6);
    ctx.ellipse(sx * 12, -1.6, 3, 1.6, 0, 0, TAU);
    solidify(ctx, metalGrad(ctx, -14, 14, [GOLD, GOLD_HI, GOLD_DK]), OUT, 0.45);
  }
  ctx.beginPath();
  ctx.rect(-2.4, ty, 4.8, -14 - ty);
  solidify(ctx, metalGrad(ctx, -2.4, 2.4, [GOLD, GOLD_HI, GOLD_DK]), OUT, 0.45);
  for (let k = 1; k <= 3; k++) {
    const r = k * 11;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.arc(0, ty, r, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,190,0.6)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, ty, r - 0.6, Math.PI * 0.55, Math.PI * 0.95);
    ctx.stroke();
  }
  for (const ky of [-30, -H * 0.5, ty + 36]) {
    ctx.beginPath();
    ctx.ellipse(0, ky, 4.4, 2.4, 0, 0, TAU);
    solidify(ctx, GOLD, OUT, 0.35);
  }
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 11 - 3.4, ty - 1);
    ctx.quadraticCurveTo(i * 11, ty + 3.2, i * 11 + 3.4, ty - 1);
    ctx.closePath();
    solidify(ctx, GOLD, OUT, 0.35);
  }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, LAMP, 0, ty - 6, 60, 36, 0.35);
  ctx.globalCompositeOperation = 'source-over';
};

const throneDais: PropFn = (ctx, e) => {
  const W = (e.w ?? 12) * TILE;
  let y = 0;
  for (const [hw, hh] of [[W / 2, 5], [W * 0.38, 5], [W * 0.26, 5]] as const) {
    ctx.beginPath();
    ctx.rect(-hw, y - hh, hw * 2, hh);
    solidify(ctx, '#cfc2a8', OUT, 0.45);
    ctx.fillStyle = 'rgba(255,250,236,0.45)';
    ctx.fillRect(-hw, y - hh, hw * 2, 0.7);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-hw, y - hh + 2, hw * 2, 0.6);
    y -= hh;
  }
  ctx.fillStyle = PURPLE;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(10, 0);
  ctx.lineTo(8, -15);
  ctx.lineTo(-8, -15);
  ctx.fill();
  // the throne: a high back with a sun disc, lions for arms
  const by = -15;
  ctx.beginPath();
  ctx.moveTo(-14, by);
  ctx.lineTo(-14, by - 52);
  ctx.quadraticCurveTo(0, by - 66, 14, by - 52);
  ctx.lineTo(14, by);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -14, 14, [GOLD, GOLD_HI, GOLD_DK]), OUT, 0.6);
  ctx.fillStyle = PURPLE;
  ctx.fillRect(-10, by - 46, 20, 34);
  ctx.beginPath();
  ctx.arc(0, by - 52, 6, 0, TAU);
  solidify(ctx, GOLD_HI, OUT, 0.4);
  ctx.beginPath();
  ctx.rect(-16, by - 14, 32, 6);
  solidify(ctx, GOLD, OUT, 0.5);
  ctx.beginPath();
  ctx.ellipse(0, by - 15, 13, 3, 0, Math.PI, 0);
  ctx.fillStyle = PURPLE_HI;
  ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.rect(sx * 16 - (sx < 0 ? 0 : 5), by - 24, 5, 24);
    solidify(ctx, GOLD, OUT, 0.4);
    ctx.beginPath();
    ctx.arc(sx * 18.5, by - 26, 4, 0, TAU);
    solidify(ctx, '#d89838', OUT, 0.4);
    circle(ctx, sx * 19.5, by - 26.6, 0.6, OUT);
  }
};

const rooftopParapet: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 14) * TILE, hw = W / 2, hgt = 22;
  brickField(ctx, -hw, -hgt, hw, 0, 8, 4, ['#1c3a72', '#183468', '#22447e'], 291 + Math.floor(e.x), 'rgba(4,10,28,0.7)', 0.5);
  merlons(ctx, -hw, hw, -hgt, 10, '#1c3a72');
  ctx.fillStyle = GOLD;
  ctx.fillRect(-hw, -hgt - 1, W, 1.4);
  ctx.fillStyle = 'rgba(190,206,255,0.25)';
  ctx.fillRect(-hw, -hgt - 1, W, 0.5);
  for (let x = -hw + 40; x < hw - 20; x += 80) {
    ctx.fillStyle = '#05060c';
    ctx.beginPath();
    ctx.moveTo(x - 4, -4);
    ctx.lineTo(x - 4, -12);
    ctx.arc(x, -12, 4, Math.PI, 0);
    ctx.lineTo(x + 4, -4);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, LAMP, x, -9, 10, 10, 0.6);
    blob(ctx, '#fff0c0', x, -9, 2, 2.6, 0.9);
    ctx.globalCompositeOperation = 'source-over';
  }
};

/** A tall arched window open on the night: stars, a crescent of the moon, a gilt lattice. */
const starWindow: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 8) * TILE, H = (e.h ?? 7) * TILE, hw = W / 2;
  const R = hw * 0.62, spring = -H + R + 6;
  const opening = () => {
    ctx.beginPath();
    ctx.moveTo(-R, -6);
    ctx.lineTo(-R, spring);
    ctx.arc(0, spring, R, Math.PI, 0);
    ctx.lineTo(R, -6);
    ctx.closePath();
  };
  // moonlight spilling down into the hall
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(160,180,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(-R, -6);
  ctx.lineTo(R, -6);
  ctx.lineTo(R + 70, 260);
  ctx.lineTo(-R + 20, 260);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  brickField(ctx, -hw, -H, hw, 0, 8, 4, ['#1c3f7a', '#183872', '#224a8c'], 301, 'rgba(4,10,28,0.7)', 0.5);
  opening();
  const g = ctx.createLinearGradient(0, -H, 0, 0);
  g.addColorStop(0, '#060a24');
  g.addColorStop(1, '#1e2a58');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  opening();
  ctx.clip();
  ctx.fillStyle = '#eef0ff';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = rng.range(0.3, 0.9);
    const s = rng.chance(0.15) ? 1.4 : 0.8;
    ctx.fillRect(rng.range(-R, R), rng.range(-H, -8), s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#9aa8ff', R * 0.4, spring - R * 0.1, R * 1.2, R * 1.2, 0.3);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, R * 0.4, spring - R * 0.1, R * 0.36, MOON);
  circle(ctx, R * 0.52, spring - R * 0.18, R * 0.34, '#0c1234');
  // the gilt lattice
  ctx.strokeStyle = 'rgba(216,168,64,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let d = -H; d < H; d += 12) {
    ctx.moveTo(-R, d);
    ctx.lineTo(R, d + R * 2);
    ctx.moveTo(R, d);
    ctx.lineTo(-R, d + R * 2);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  opening();
  ctx.stroke();
  ctx.fillStyle = '#cfc2a8';
  ctx.fillRect(-R - 6, -7, R * 2 + 12, 5);
};

const vesselShelf: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 10) * TILE, hw = W / 2, H = 90;
  ctx.fillStyle = '#0e1a36';
  ctx.fillRect(-hw, -H, W, H);
  brickField(ctx, -hw, -H, hw, 0, 8, 4, ['#132a56', '#10244c', '#16305e'], 311, 'rgba(0,0,10,0.55)', 0.4);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, LAMP, 0, -H * 0.5, hw * 1.1, H * 0.6, 0.18);
  ctx.globalCompositeOperation = 'source-over';
  for (let s = 0; s < 3; s++) {
    const sy = -6 - s * 29;
    ctx.beginPath();
    ctx.rect(-hw, sy, W, 3.4);
    solidify(ctx, CEDAR, OUT, 0.4);
    ctx.fillStyle = 'rgba(255,214,160,0.35)';
    ctx.fillRect(-hw, sy, W, 0.7);
    let x = -hw + 8;
    while (x < hw - 6) {
      const gold = rng.chance(0.6), col = gold ? GOLD : '#c8ccd6', hi = gold ? GOLD_HI : '#ffffff', kind = rng.int(0, 3);
      ctx.beginPath();
      if (kind === 0) {
        // a goblet
        ctx.moveTo(x - 3, sy - 13);
        ctx.lineTo(x + 3, sy - 13);
        ctx.lineTo(x + 0.8, sy - 6);
        ctx.lineTo(x + 0.8, sy - 2);
        ctx.lineTo(x + 2.6, sy);
        ctx.lineTo(x - 2.6, sy);
        ctx.lineTo(x - 0.8, sy - 2);
        ctx.lineTo(x - 0.8, sy - 6);
        ctx.closePath();
      } else if (kind === 1) {
        // a bowl
        ctx.ellipse(x, sy - 5, 6, 5, 0, 0, Math.PI);
        ctx.lineTo(x - 6, sy - 5);
      } else if (kind === 2) {
        // a ewer
        ctx.moveTo(x - 2, sy);
        ctx.quadraticCurveTo(x - 6, sy - 6, x - 2, sy - 11);
        ctx.lineTo(x - 1, sy - 15);
        ctx.lineTo(x + 3, sy - 16);
        ctx.lineTo(x + 1.4, sy - 11);
        ctx.quadraticCurveTo(x + 6, sy - 6, x + 2, sy);
        ctx.closePath();
      } else {
        // a censer with a domed lid
        ctx.ellipse(x, sy - 5, 4.4, 4, 0, 0, TAU);
        ctx.moveTo(x - 4, sy - 7);
        ctx.quadraticCurveTo(x, sy - 15, x + 4, sy - 7);
        ctx.closePath();
      }
      solidify(ctx, col, OUT, 0.35);
      ctx.fillStyle = hi;
      ctx.fillRect(x - 2, sy - 9, 0.8, 4);
      if (rng.chance(0.3)) {
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#fff0c0', x - 1.6, sy - 9, 4, 4, 0.7);
        ctx.globalCompositeOperation = 'source-over';
      }
      x += rng.range(11, 16);
    }
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-hw, -H, W, H);
};

const treasureHeap: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 6) * TILE, hw = W / 2, H = Math.min(34, W * 0.3);
  // vessels and a crown half-buried in the heap
  jar(ctx, -hw * 0.4, -H * 0.5, 5, 16, GOLD, 'rgba(120,70,10,0.7)');
  jar(ctx, hw * 0.5, -H * 0.35, 4, 13, '#c8ccd6', null);
  ctx.beginPath();
  ctx.moveTo(-hw, 1);
  ctx.bezierCurveTo(-hw * 0.6, -H * 0.9, hw * 0.5, -H * 1.1, hw, 1);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -hw, hw, [GOLD, GOLD_HI, GOLD_DK]), OUT, 0.5);
  for (let i = 0; i < W * 1.2; i++) {
    const u = rng.range(-0.95, 0.95), px = u * hw;
    const sy = -H * 0.75 * (1 - u * u) * rng.range(0.1, 1);
    circle(ctx, px, sy, rng.range(1.2, 2), rng.chance(0.5) ? '#f0c860' : '#b8862a');
  }
  ctx.save();
  ctx.translate(hw * 0.1, -H * 0.72);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-7, -6);
  ctx.lineTo(-4, -3);
  ctx.lineTo(0, -8);
  ctx.lineTo(4, -3);
  ctx.lineTo(7, -6);
  ctx.lineTo(7, 0);
  ctx.closePath();
  solidify(ctx, GOLD_HI, OUT, 0.4);
  circle(ctx, 0, -2.2, 1.2, '#c0202a');
  ctx.restore();
  for (let i = 0; i < 6; i++) circle(ctx, rng.range(-hw * 0.7, hw * 0.7), -rng.range(2, H * 0.6), 1.2, rng.pick(['#c0202a', '#20a050', '#3050d0']));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const gx = rng.range(-hw * 0.7, hw * 0.7), gy = -rng.range(4, H * 0.7);
    blob(ctx, '#fff0c0', gx, gy, 5, 5, 0.6);
    ctx.fillStyle = 'rgba(255,250,230,0.8)';
    ctx.fillRect(gx - 3, gy - 0.25, 6, 0.5);
    ctx.fillRect(gx - 0.25, gy - 3, 0.5, 6);
  }
  ctx.globalCompositeOperation = 'source-over';
};

/** The great balance of the Hall of Scales: its stepped base and post (beam and pans swing live). */
const balanceBase: PropFn = (ctx, e) => {
  const W = (e.w ?? 30) * TILE, H = (e.h ?? 20) * TILE;
  const piv = -H * 0.72;
  for (const [hw, y0, hh] of [[W * 0.16, 0, 8], [W * 0.12, -8, 7], [W * 0.08, -15, 6]] as const) {
    ctx.beginPath();
    ctx.rect(-hw, y0 - hh, hw * 2, hh);
    solidify(ctx, metalGrad(ctx, -hw, hw, ['#4a3e48', '#7a6c76', '#1e1820']), OUT, 0.5);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-hw, y0 - hh, hw * 2, 1);
  }
  ctx.beginPath();
  ctx.moveTo(-9, -21);
  ctx.lineTo(9, -21);
  ctx.lineTo(5, piv);
  ctx.lineTo(-5, piv);
  ctx.closePath();
  solidify(ctx, metalGrad(ctx, -9, 9, ['#a0703a', '#e0b070', '#4a3010']), OUT, 0.6);
  for (let y = -40; y > piv + 10; y -= 34) {
    ctx.fillStyle = GOLD_DK;
    ctx.fillRect(-8, y, 16, 4);
    ctx.fillStyle = GOLD_HI;
    ctx.fillRect(-8, y, 16, 1);
  }
  // the finial: a gold disc with rays, above the pivot
  ctx.beginPath();
  ctx.arc(0, piv - 14, 8, 0, TAU);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    ctx.moveTo(Math.cos(a) * 9, piv - 14 + Math.sin(a) * 9);
    ctx.lineTo(Math.cos(a + 0.13) * 14, piv - 14 + Math.sin(a + 0.13) * 14);
    ctx.lineTo(Math.cos(a + 0.26) * 9, piv - 14 + Math.sin(a + 0.26) * 9);
  }
  solidify(ctx, GOLD, OUT, 0.45);
  circle(ctx, -2, piv - 16, 2.6, GOLD_HI);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffd890', 0, piv - 14, 30, 30, 0.35);
  ctx.globalCompositeOperation = 'source-over';
};

/** Local bounds [x0, y0, x1, y1] of each prop around its anchor, used to skip chunks it cannot touch. */
const BOUNDS: Record<string, (e: Decor) => [number, number, number, number]> = {
  dead_reeds: (e) => { const W = (e.w ?? 3) * TILE, H = (e.h ?? 3) * TILE; return [-W / 2 - H * 0.4, -H * 1.1, W / 2 + H * 0.4, 32]; },
  stranded_boat: (e) => { const W = (e.w ?? 10) * TILE; return [-W / 2 - 8, -W * 0.5 - 30, W / 2 + 8, 8]; },
  mooring_post: () => [-10, -36, 18, 4],
  fish_bones: () => [-24, -10, 26, 4],
  river_gate: (e) => { const W = (e.w ?? 10) * TILE, H = (e.h ?? 12) * TILE; return [-W / 2 - 4, -H - 12, W / 2 + 4, 4]; },
  reveler_table: () => [-56, -24, 34, 4],
  wine_jars: () => [-60, -36, 22, 4],
  terrace_arch: (e) => { const W = (e.w ?? 8) * TILE, H = (e.h ?? 6) * TILE; return [-W / 2 - 4, -H - 4, W / 2 + 4, 4]; },
  garden_tree: (e) => { const H = (e.h ?? 7) * TILE; return [-H * 0.5, -H * 1.1, H * 0.5, 4]; },
  fountain: () => [-30, -44, 30, 4],
  irrigation_wheel: (e) => { const H = (e.h ?? 8) * TILE; return [-H * 0.42 - 34, -H - 12, H * 0.42 + 14, 4]; },
  flower_bed: (e) => { const W = (e.w ?? 3) * TILE; return [-W / 2 - 6, -30, W / 2 + 6, 4]; },
  vessel_shelf: (e) => { const W = (e.w ?? 10) * TILE; return [-W / 2 - 4, -96, W / 2 + 4, 4]; },
  treasure_heap: (e) => { const W = (e.w ?? 6) * TILE; return [-W / 2 - 6, -46, W / 2 + 6, 4]; },
  palace_column: (e) => [-26, -(e.h ?? 18) * TILE - 4, 26, 4],
  glazed_frieze: (e) => { const W = (e.w ?? 40) * TILE; return [-W / 2 - 24, -48, W / 2 + 24, 4]; },
  feast_table: (e) => { const W = (e.w ?? 12) * TILE; return [-W / 2 - 4, -36, W / 2 + 4, 4]; },
  plaster_wall: (e) => { const W = (e.w ?? 14) * TILE, H = (e.h ?? 10) * TILE; return [-W / 2 - 10, -H - 10, W / 2 + 10, 2]; },
  great_lampstand: (e) => [-60, -(e.h ?? 8) * TILE - 40, 60, 4],
  throne_dais: (e) => { const W = (e.w ?? 12) * TILE; return [-W / 2 - 4, -90, W / 2 + 4, 4]; },
  rooftop_parapet: (e) => { const W = (e.w ?? 14) * TILE; return [-W / 2 - 4, -34, W / 2 + 4, 4]; },
  star_window: (e) => { const W = (e.w ?? 8) * TILE, H = (e.h ?? 7) * TILE; return [-W / 2 - 4, -H - 4, W / 2 + 90, 264]; },
  balance_scales: (e) => { const H = (e.h ?? 20) * TILE, W = (e.w ?? 30) * TILE; return [-W * 0.18, -H - 10, W * 0.18, 4]; },
};

const PROPS: Record<string, PropFn> = {
  dead_reeds: deadReeds,
  stranded_boat: strandedBoat,
  mooring_post: mooringPost,
  fish_bones: fishBones,
  river_gate: riverGate,
  feast_lanterns: () => {},
  reveler_table: revelerTable,
  wine_jars: wineJars,
  terrace_arch: terraceArch,
  hanging_vines: () => {},
  garden_tree: gardenTree,
  fountain,
  irrigation_wheel: irrigationWheel,
  flower_bed: flowerBed,
  vessel_shelf: vesselShelf,
  treasure_heap: treasureHeap,
  palace_column: paletteColumn,
  glazed_frieze: glazedFrieze,
  curtain: curtainRod,
  feast_table: feastTable,
  plaster_wall: plasterWall,
  great_lampstand: greatLampstand,
  throne_dais: throneDais,
  rooftop_parapet: rooftopParapet,
  star_window: starWindow,
  balance_scales: balanceBase,
};

/** Decor baked before the rest of a chunk's props, so tables, columns and people stand in front of it. */
export const BACKDROP_CH5: ReadonlySet<string> = new Set(['glazed_frieze', 'plaster_wall', 'terrace_arch', 'star_window', 'balance_scales']);

/** Chapter V props. Returns false for kinds it does not know. */
export function drawPropCh5(ctx: Ctx, e: Decor, pal: BiomePal, seed: number): boolean {
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

// ---------------------------------------------------------------- the writing on the wall

/** Strokes of each letter in a unit box (x right, y down), as polylines. */
const GLYPH: Record<string, number[][]> = {
  M: [[0, 1, 0, 0, 0.5, 0.6, 1, 0, 1, 1]],
  E: [[1, 0, 0, 0, 0, 1, 1, 1], [0, 0.5, 0.72, 0.5]],
  N: [[0, 1, 0, 0, 1, 1, 1, 0]],
  T: [[0, 0, 1, 0], [0.5, 0, 0.5, 1]],
  K: [[0, 0, 0, 1], [1, 0, 0, 0.6], [0.32, 0.38, 1, 1]],
  L: [[0, 0, 0, 1, 0.9, 1]],
  U: [[0, 0, 0, 0.75, 0.25, 1, 0.75, 1, 1, 0.75, 1, 0]],
  P: [[0, 1, 0, 0, 0.72, 0, 1, 0.16, 1, 0.4, 0.72, 0.55, 0, 0.55]],
  H: [[0, 0, 0, 1], [1, 0, 1, 1], [0, 0.5, 1, 0.5]],
  A: [[0, 1, 0.5, 0, 1, 1], [0.22, 0.62, 0.78, 0.62]],
  R: [[0, 1, 0, 0, 0.72, 0, 1, 0.16, 1, 0.4, 0.72, 0.55, 0, 0.55], [0.45, 0.55, 1, 1]],
  S: [[1, 0.12, 0.78, 0, 0.22, 0, 0, 0.16, 0, 0.38, 0.22, 0.5, 0.78, 0.5, 1, 0.62, 1, 0.86, 0.78, 1, 0.22, 1, 0, 0.88]],
  I: [[0.5, 0, 0.5, 1], [0.2, 0, 0.8, 0], [0.2, 1, 0.8, 1]],
};
const WORDS = [['MENE', 'MENE'], ['TEKEL', 'UPHARSIN']] as const;

interface Script { seg: Float32Array; n: number; total: number }
const scripts = new WeakMap<Decor, Script>();

/**
 * MENE, MENE, TEKEL, UPHARSIN laid out on the plaster in two lines, as segments
 * [x0, y0, x1, y1, startLen] in the wall's local space, with a slight tremor so
 * it reads as written by hand. Built once per wall.
 */
function scriptOf(e: Decor): Script {
  let s = scripts.get(e);
  if (s) return s;
  const W = (e.w ?? 14) * TILE, H = (e.h ?? 10) * TILE;
  // size the letters so the longer line fits the plaster with a margin
  let widest = 0;
  for (const line of WORDS) {
    // in letter heights: each letter advances 0.81, the last has no tail, words part by 0.66
    let n = -0.66;
    for (const w of line) n += w.length * 0.81 - 0.21 + 0.66;
    widest = Math.max(widest, n);
  }
  const lh = Math.min(28, H * 0.24, (W * 0.84) / widest), lw = lh * 0.6, adv = lw * 1.35, gap = lw * 1.1;
  const out: number[] = [];
  let total = 0;
  for (let li = 0; li < WORDS.length; li++) {
    const line = WORDS[li];
    let width = -gap;
    for (const w of line) width += w.length * adv - (adv - lw) + gap;
    let cx = -width / 2;
    const top = -H + H * (li ? 0.55 : 0.2);
    for (const w of line) {
      for (let c = 0; c < w.length; c++) {
        for (const stroke of GLYPH[w[c]]) {
          for (let k = 0; k + 3 < stroke.length; k += 2) {
            const j = (i: number, sd: number) => (hash2(Math.floor(cx * 7 + i * 13), li * 31 + k, sd) - 0.5) * lh * 0.05;
            const x0 = cx + stroke[k] * lw + j(0, 1), y0 = top + stroke[k + 1] * lh + j(0, 2);
            const x1 = cx + stroke[k + 2] * lw + j(1, 1), y1 = top + stroke[k + 3] * lh + j(1, 2);
            out.push(x0, y0, x1, y1, total);
            total += Math.hypot(x1 - x0, y1 - y0);
          }
        }
        cx += adv;
      }
      cx += gap - (adv - lw);
    }
  }
  s = { seg: new Float32Array(out), n: out.length / 5, total };
  scripts.set(e, s);
  return s;
}

/** Adds the written part (up to length upto) to the path; returns the pen's position in pen[]. */
function scriptPath(ctx: Ctx, s: Script, ox: number, oy: number, upto: number, pen: Float32Array) {
  const g = s.seg;
  let lx = NaN, ly = NaN;
  ctx.beginPath();
  for (let i = 0; i < s.n; i++) {
    const o = i * 5, st = g[o + 4];
    if (st >= upto) break;
    const x0 = ox + g[o], y0 = oy + g[o + 1];
    let x1 = ox + g[o + 2], y1 = oy + g[o + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (st + len > upto && len > 0) {
      const f = (upto - st) / len;
      x1 = x0 + (x1 - x0) * f;
      y1 = y0 + (y1 - y0) * f;
    }
    if (x0 !== lx || y0 !== ly) ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    lx = x1;
    ly = y1;
  }
  pen[0] = lx;
  pen[1] = ly;
}

const PEN = new Float32Array(2);

/** The fingers of a hand made of light, the pen point at (x, y): holy, soft, without menace. */
function handOfLight(ctx: Ctx, x: number, y: number, t: number) {
  const bob = Math.sin(t * 9) * 0.5;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(1.5, 1.5);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffe2a0', 16, -12, 22, 18, 0.3);
  blob(ctx, '#fff6dc', 1, -1, 5, 5, 0.75);
  // the index finger at the point, the middle beside it, the others curled, the thumb tucked;
  // the back of the hand fades into light where a wrist would be
  ctx.beginPath();
  taper(ctx, 12, -12, 3.2, 0.6, -0.6, 2.2);
  ctx.moveTo(1.8, -0.6);
  ctx.arc(0.6, -0.6, 1.2, 0, TAU);
  taper(ctx, 15, -10, 3.2, 5, -1.6, 2.2);
  ctx.moveTo(6.1, -1.6);
  ctx.arc(5, -1.6, 1.1, 0, TAU);
  taper(ctx, 17, -7.5, 3, 11.4, -3.4, 2.4);
  taper(ctx, 18.6, -5, 2.6, 15, -2.8, 2.2);
  taper(ctx, 11, -16, 3.4, 5.6, -8.4, 2.4);
  ctx.moveTo(11, -17);
  ctx.lineTo(20.5, -12.5);
  ctx.lineTo(21, -5.5);
  ctx.lineTo(14, -6.5);
  ctx.lineTo(9.6, -11);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,240,206,0.4)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,232,170,0.7)';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  blob(ctx, '#fff2d0', 23, -16, 9, 8, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

const SCORCH = 'rgba(46,14,4,0.75)';

function drawWriting(ctx: Ctx, e: Decor, x: number, y: number, t: number) {
  const done = flag('ch5_writing');
  const p = done ? 1 : clamp(WRITING.p, 0, 1);
  if (p <= 0 && !WRITING.hand) return;
  const s = scriptOf(e);
  const upto = p * s.total;
  scriptPath(ctx, s, x, y, upto, PEN);
  const fl = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // burned into the plaster, then burning on it
  ctx.strokeStyle = SCORCH;
  ctx.lineWidth = 4.4;
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3 * fl;
  ctx.strokeStyle = '#ff5a10';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.globalAlpha = 0.9 * fl;
  ctx.strokeStyle = '#ff9a2a';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#ffe8a8';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!done && p < 1 && PEN[0] === PEN[0]) {
    // the fresh stroke burns white where the finger has just passed
    blob(ctx, '#fff0c0', PEN[0], PEN[1], 9, 9, 0.8);
    ctx.fillStyle = '#ffd890';
    for (let i = 0; i < 6; i++) {
      const life = (t * 1.7 + i * 0.17) % 1;
      ctx.globalAlpha = 1 - life;
      ctx.fillRect(PEN[0] + Math.sin(i * 7.7) * 6 * life, PEN[1] - life * 10, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  if (WRITING.hand && PEN[0] === PEN[0]) handOfLight(ctx, PEN[0], PEN[1], t);
  else if (WRITING.hand) {
    const g = s.seg;
    handOfLight(ctx, x + g[0], y + g[1], t);
  }
}

// ---------------------------------------------------------------- live props

/** Chapter V decor with an animated overlay (static body baked in the tile cache). */
export const LIVE_CH5: ReadonlySet<string> = new Set(['feast_lanterns', 'hanging_vines', 'fountain', 'irrigation_wheel', 'curtain', 'plaster_wall', 'great_lampstand', 'balance_scales']);

let scaleTilt = 0;
/** Tilt of the Hall of Scales' great balance in radians (positive drops the right pan); it also sways a little by itself. */
export function setScaleTilt(a: number) {
  scaleTilt = a;
}

const CHAIN_DASH = [2.2, 1.4];
const WATER_DASH = [3, 2];
const NO_DASH: number[] = [];
const LANTERN_C = ['#c8302a', '#e0a030', '#f0e6d0'] as const;

function lampFlame(ctx: Ctx, x: number, y: number, s: number, t: number) {
  const w = Math.sin(t * 17) * s * 0.15;
  ctx.fillStyle = 'rgba(255,150,60,0.85)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.45, y);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.8, x + w * 1.5, y - s * 1.6);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.8, x + s * 0.45, y);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,244,200,0.95)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y - s * 0.4, s * 0.18, s * 0.42, 0, 0, TAU);
  ctx.fill();
}

/** Animated overlays. Allocation-free: constant colours, cached sprites and dash arrays. */
export function drawLivePropCh5(ctx: Ctx, e: Decor, t: number) {
  const x = e.x * TILE, y = e.y * TILE, fx = e.flip ? -1 : 1;
  const q = tier();
  switch (e.k) {
    case 'feast_lanterns': {
      const W = (e.w ?? 20) * TILE, hw = W / 2, sag = Math.min(40, W * 0.07);
      const sw = Math.sin(t * 0.7 + e.x) * 2;
      ctx.strokeStyle = 'rgba(30,20,24,0.9)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - hw, y);
      ctx.quadraticCurveTo(x + sw, y + sag * 2, x + hw, y);
      ctx.stroke();
      circle(ctx, x - hw, y, 1.6, GOLD_DK);
      circle(ctx, x + hw, y, 1.6, GOLD_DK);
      const n = Math.max(3, Math.floor(W / 22));
      for (let i = 1; i < n; i++) {
        const u = i / n, iu = 1 - u;
        const sx = iu * iu * (x - hw) + 2 * iu * u * (x + sw) + u * u * (x + hw);
        const sy = iu * iu * y + 2 * iu * u * (y + sag * 2) + u * u * y;
        const a = Math.sin(t * 1.6 + i * 0.7) * 0.18;
        const lx = sx + Math.sin(a) * 7, ly = sy + Math.cos(a) * 7;
        ctx.strokeStyle = 'rgba(30,20,24,0.8)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(lx, ly - 3);
        ctx.stroke();
        if (q > 0) {
          ctx.globalCompositeOperation = 'lighter';
          blob(ctx, i % 3 === 1 ? '#ff9a3a' : '#ff6a3a', lx, ly, 13, 13, 0.4);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = LANTERN_C[i % 3];
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3.2, 4.2, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.55)';
        ctx.fillRect(lx - 0.8, ly - 2.6, 1.6, 4.4);
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(lx - 2, ly - 4.6, 4, 1);
        ctx.fillRect(lx - 1.6, ly + 3.8, 3.2, 1);
      }
      break;
    }
    case 'hanging_vines': {
      const H = (e.h ?? 5) * TILE;
      const strands = q === 2 ? 6 : 4, segs = 9;
      ctx.strokeStyle = '#1e3218';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < strands; i++) {
        const sx = x + (i - (strands - 1) / 2) * 5, L = H * (0.55 + hash2(i, Math.floor(e.x), 281) * 0.45);
        ctx.moveTo(sx, y);
        for (let k = 1; k <= segs; k++) {
          const u = k / segs;
          ctx.lineTo(sx + Math.sin(t * 0.9 + i * 1.3 + u * 2.4) * 3.5 * u, y + u * L);
        }
      }
      ctx.stroke();
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? '#3e6028' : '#24401c';
        ctx.beginPath();
        for (let i = 0; i < strands; i++) {
          const sx = x + (i - (strands - 1) / 2) * 5, L = H * (0.55 + hash2(i, Math.floor(e.x), 281) * 0.45);
          for (let k = 1 + layer; k <= segs; k += 2) {
            const u = k / segs, px = sx + Math.sin(t * 0.9 + i * 1.3 + u * 2.4) * 3.5 * u + (k & 1 ? 1.6 : -1.6), py = y + u * L;
            ctx.moveTo(px + 2.2, py);
            ctx.ellipse(px, py, 2.2, 1.2, k & 1 ? 0.6 : -0.6, 0, TAU);
          }
        }
        ctx.fill();
      }
      if (q === 2) {
        ctx.fillStyle = '#f4f0e4';
        for (let i = 0; i < strands; i += 2) {
          const sx = x + (i - (strands - 1) / 2) * 5, L = H * (0.55 + hash2(i, Math.floor(e.x), 281) * 0.45), u = 0.6;
          circle(ctx, sx + Math.sin(t * 0.9 + i * 1.3 + u * 2.4) * 3.5 * u, y + u * L, 1.3, '#f4f0e4');
        }
      }
      break;
    }
    case 'fountain': {
      ctx.lineCap = 'round';
      ctx.setLineDash(WATER_DASH);
      ctx.lineDashOffset = -t * 24;
      ctx.strokeStyle = 'rgba(190,212,255,0.7)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      // the jet, splitting into two arcs; the bowl overflowing into the basin
      ctx.moveTo(x, y - 40);
      ctx.lineTo(x, y - 48);
      ctx.moveTo(x, y - 48);
      ctx.quadraticCurveTo(x - 10, y - 54, x - 18, y - 11);
      ctx.moveTo(x, y - 48);
      ctx.quadraticCurveTo(x + 10, y - 54, x + 18, y - 11);
      ctx.moveTo(x - 10, y - 32);
      ctx.quadraticCurveTo(x - 12, y - 24, x - 12, y - 11);
      ctx.moveTo(x + 10, y - 32);
      ctx.quadraticCurveTo(x + 12, y - 24, x + 12, y - 11);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.strokeStyle = 'rgba(200,220,255,0.35)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const life = (t * 0.8 + i * 0.25) % 1, rx = i & 1 ? 18 : 12;
        const cx = x + (i < 2 ? -rx : rx);
        ctx.moveTo(cx + 1 + life * 5, y - 10);
        ctx.ellipse(cx, y - 10, 1 + life * 5, 0.4 + life * 0.8, 0, 0, TAU);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#a8c0ff', x, y - 30, 22, 26, 0.12);
      if (q > 0) {
        ctx.fillStyle = 'rgba(230,240,255,0.8)';
        for (let i = 0; i < 6; i++) {
          const life = (t * 1.3 + i * 0.167) % 1, side = i & 1 ? 1 : -1;
          ctx.fillRect(x + side * (18 + life * 4), y - 11 - Math.sin(life * Math.PI) * 4, 0.8, 0.8);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'irrigation_wheel': {
      const H = (e.h ?? 8) * TILE, R = H * 0.42, cy = y - R - 6, a0 = t * 0.35;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? CEDAR : OUT;
        ctx.lineWidth = pass ? 3.4 : 5;
        ctx.beginPath();
        ctx.arc(x, cy, R, 0, TAU);
        ctx.moveTo(x + R * 0.82, cy);
        ctx.arc(x, cy, R * 0.82, 0, TAU);
        for (let k = 0; k < 8; k++) {
          const a = a0 + (k / 8) * TAU;
          ctx.moveTo(x, cy);
          ctx.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#9a5a32';
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = a0 + (k / 12) * TAU, px = x + Math.cos(a) * (R + 4), py = cy + Math.sin(a) * (R + 4);
        ctx.moveTo(px + 3, py);
        ctx.ellipse(px, py, 3, 2.2, a, 0, TAU);
      }
      ctx.fill();
      circle(ctx, x, cy, 3, '#5a3a1a');
      // the pots tip their water into the channel at the top, and drip as they rise
      ctx.strokeStyle = 'rgba(180,204,255,0.6)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash(WATER_DASH);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath();
      ctx.moveTo(x - R * 0.3, cy - R - 2);
      ctx.quadraticCurveTo(x - R * 0.45, cy - R - 4, x - R * 0.6, cy - R + 1);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.fillStyle = 'rgba(200,220,255,0.7)';
      for (let i = 0; i < 5; i++) {
        const life = (t * 0.9 + i * 0.2) % 1, a = Math.PI * 0.15 - i * 0.25;
        ctx.fillRect(x + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4) + life * 30, 0.9, 1.6);
      }
      break;
    }
    case 'curtain': {
      const H = (e.h ?? 10) * TILE, ph = e.x * 0.9;
      for (let side = -1; side <= 1; side += 2) {
        const L = side < 0 ? -24 : 2, Rr = side < 0 ? -2 : 24;
        const sw = Math.sin(t * 0.7 + ph + side) * 2.6;
        // the panel: hanging from the rod, drawn in at the middle, scalloped at the hem
        ctx.beginPath();
        ctx.moveTo(x + L, y);
        ctx.lineTo(x + Rr, y);
        for (let k = 1; k <= 6; k++) {
          const u = k / 6;
          ctx.lineTo(x + Rr + sw * u * u - (side < 0 ? 0 : u * 3), y + u * H);
        }
        for (let f = 4; f >= 1; f--) {
          const fx0 = L + ((Rr - L) * f) / 4, fx1 = L + ((Rr - L) * (f - 1)) / 4;
          ctx.quadraticCurveTo(x + (fx0 + fx1) / 2 + sw, y + H + 3, x + fx1 + sw, y + H);
        }
        for (let k = 5; k >= 1; k--) {
          const u = k / 6;
          ctx.lineTo(x + L + sw * u * u + (side < 0 ? u * 3 : 0), y + u * H);
        }
        ctx.closePath();
        ctx.fillStyle = PURPLE;
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        // folds in shadow, their crests catching lamplight
        ctx.strokeStyle = 'rgba(16,0,24,0.45)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let f = 1; f < 4; f++) {
          const fx0 = x + L + ((Rr - L) * f) / 4;
          ctx.moveTo(fx0, y + 2);
          for (let k = 1; k <= 6; k++) ctx.lineTo(fx0 + sw * (k / 6) * (k / 6), y + (k / 6) * H);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(190,130,210,0.3)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let f = 1; f < 4; f++) {
          const fx0 = x + L + ((Rr - L) * f) / 4 + 2.4;
          ctx.moveTo(fx0, y + 2);
          for (let k = 1; k <= 6; k++) ctx.lineTo(fx0 + sw * (k / 6) * (k / 6), y + (k / 6) * H);
        }
        ctx.stroke();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.6;
        ctx.setLineDash(CHAIN_DASH);
        ctx.beginPath();
        ctx.moveTo(x + L + sw, y + H + 1.5);
        ctx.lineTo(x + Rr + sw, y + H + 1.5);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
      }
      break;
    }
    case 'plaster_wall':
      drawWriting(ctx, e, x, y, t);
      break;
    case 'great_lampstand': {
      const H = (e.h ?? 8) * TILE, ty = y - H + 3;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = -3; i <= 3; i++) {
        const fl = 0.85 + Math.sin(t * 13 + i * 1.7) * 0.08 + Math.sin(t * 7.3 + i) * 0.07;
        if (q > 0) blob(ctx, LAMP, x + i * 11, ty - 6, 12 * fl, 12 * fl, 0.45);
        lampFlame(ctx, x + i * 11, ty, 5.5 * fl, t + i);
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'balance_scales': {
      const W = (e.w ?? 30) * TILE, H = (e.h ?? 20) * TILE;
      const px = x, py = y - H * 0.72, L = W * 0.4, D = H * 0.38;
      const a = (scaleTilt + Math.sin(t * 0.45) * 0.02) * fx;
      const ca = Math.cos(a), sa = Math.sin(a);
      // chains and pans first, so the beam crosses over them
      for (let side = -1; side <= 1; side += 2) {
        const ex = px + side * L * ca, ey = py + side * L * sa;
        const pcy = ey + D;
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 1.6;
        ctx.setLineDash(CHAIN_DASH);
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(ex, ey + 3);
          ctx.lineTo(ex + k * 30, pcy - 2);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,150,0.5)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
        ctx.beginPath();
        ctx.moveTo(ex - 34, pcy - 2);
        ctx.quadraticCurveTo(ex, pcy + 20, ex + 34, pcy - 2);
        ctx.closePath();
        ctx.fillStyle = '#7a4e22';
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,200,130,0.4)';
        ctx.fillRect(ex - 22, pcy + 3, 18, 1);
        ctx.fillStyle = '#b07a3a';
        ctx.beginPath();
        ctx.ellipse(ex, pcy - 2, 34, 3, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        circle(ctx, ex, ey + 2, 2.4, GOLD);
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-L - 6, -3);
      ctx.lineTo(L + 6, -3);
      ctx.lineTo(L + 6, 3);
      ctx.lineTo(-L - 6, 3);
      ctx.closePath();
      ctx.fillStyle = '#9a6a30';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,150,0.5)';
      ctx.fillRect(-L, -2.6, L * 2, 0.9);
      ctx.fillStyle = GOLD;
      ctx.fillRect(-L - 8, -4.5, 6, 9);
      ctx.fillRect(L + 2, -4.5, 6, 9);
      ctx.restore();
      circle(ctx, px, py, 5, GOLD);
      circle(ctx, px - 1.2, py - 1.2, 1.8, GOLD_HI);
      break;
    }
  }
}
