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
import type { BiomePal, Layer } from './environment';

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
function cypressSil(ctx: Ctx, x: number, base: number, h: number, col: string, rim: string | null) {
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

export function buildParallaxCh5(biome: Ch5Biome, pal: BiomePal, seed: number, interior: boolean, viewH: number, res: number): Layer[] {
  const layers: Layer[] = [];
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
  const moonRim = rgba('#b8c4ff', 0.3);

  if (biome === 'palace' && interior) {
    // The far wall of the hall: glazed brick in shadow, lamplit niches, a gold frieze.
    mk(0.08, 0.05, (ctx, w, h) => {
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
    mk(0.26, 0.12, (ctx, w, h) => {
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
    mk(0.04, 0.03, (ctx, w, h) => {
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
    mk(0.17, 0.07, (ctx, w, h) => {
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
    mk(0.42, 0.16, (ctx, w, h) => {
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
    mk(0.04, 0.03, (ctx, w, h) => {
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
    mk(0.16, 0.08, (ctx, w, h) => {
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
    mk(0.4, 0.16, (ctx, w, h) => {
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
    mk(0.04, 0.03, (ctx, w, h) => {
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
    mk(0.16, 0.08, (ctx, w, h) => {
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
    mk(0.38, 0.15, (ctx, w, h) => {
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
