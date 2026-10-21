// Chapter VI environment art: the Prince of Persia (Daniel 10). The great river
// Hiddekel at dawn and dusk (wide water, palms, reeds, mist), Shushan the palace
// (glazed brick in blue and gold, winged bulls, the hall of a hundred columns,
// and a storm turning like a wheel over the citadel), and the high places
// above the world: a torn heaven of gold-white light over floors of cloud,
// broken chains hanging in the void and bright marble platforms.

import { makeCanvas, rgba, shade, mix, circle, ellipse, type Ctx } from './draw';
import { RNG, hash2, clamp } from '../core/math';
import { TILE, T, type Biome, type EntDef } from '../game/tiles';
import {
  blob, solidify, tier, wrapNoise, fillRidge, strokeRidge, localView, brickField, merlons, metalGrad, taper,
  palmSil, reedSil, housesSil, rosette, jar,
} from './env4';
import { cypressSil } from './env5';
import type { BiomePal, Layer } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
export type Ch6Biome = 'hiddekel' | 'shushan' | 'highplaces';
export const isCh6 = (b: Biome): b is Ch6Biome => b === 'hiddekel' || b === 'shushan' || b === 'highplaces';

const TAU = Math.PI * 2;
const OUT = '#0e0a0c';
const GOLD = '#d8a840';
const GOLD_HI = '#f8e0a0';
const GOLD_DK = '#7a5014';
const TURQ = '#2a7a9a';
const TURQ_HI = '#5ab0c8';
const LAPIS = '#1e3e7a';
const STONE = '#b8a888';
const STONE_DK = '#5a4e3c';
const LIGHT = '#fff1c4';

/** Room seeds that change a biome's mood: the marsh at dusk, the storm on the high place of the winds. */
const DUSK_SEED = 709;
const STORM_SEED = 739;
/**
 * The sky has no room in hand, so the last parallax build (which runs on every
 * room load) records which variant the room wants.
 */
let skyVariant: 'dawn' | 'dusk' | 'day' | 'storm' = 'day';
/** The room is the hall of columns: its ceiling tiles get cedar beams. */
let hall = false;

// ---------------------------------------------------------------- skies

type SkyKind = 'dawn' | 'dusk' | 'day' | 'storm' | 'hall' | 'heaven';
const SKY_STOPS: Record<SkyKind, readonly (readonly [number, string])[]> = {
  // dawn over the Tigris: night still overhead, rose and gold low on the water
  dawn: [[0, '#1c2440'], [0.3, '#3e4870'], [0.5, '#8a7890'], [0.62, '#d8988a'], [0.72, '#f2c49a'], [0.84, '#f8dcb0']],
  // dusk over the marshes: violet and ember
  dusk: [[0, '#140e28'], [0.3, '#36244a'], [0.5, '#6a3450'], [0.64, '#b85a4a'], [0.76, '#e89a5a'], [0.86, '#f0c080']],
  // Susa in a hazed afternoon, the storm gathering
  day: [[0, '#2e3e66'], [0.35, '#5a6e94'], [0.6, '#a8a8b0'], [0.78, '#e0c8a0'], [0.9, '#ecd6aa']],
  // the high place of the winds: storm-dark, lit from within
  storm: [[0, '#0a0c16'], [0.35, '#1a2034'], [0.62, '#2e3448'], [0.8, '#4a4a58'], [0.95, '#5a5464']],
  // the hall of a hundred columns
  hall: [[0, '#0a0608'], [0.5, '#1c1210'], [0.85, '#3a2416'], [1, '#4a2e18']],
  // above the world: a torn heaven, deep violet giving way to gold-white light
  heaven: [[0, '#1a1236'], [0.25, '#3a2a62'], [0.45, '#8a6a9a'], [0.62, '#e8c49a'], [0.76, '#fff0cc'], [0.9, '#fff8e8']],
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

export function drawSkyCh6(ctx: Ctx, biome: Ch6Biome, pal: BiomePal, w: number, h: number, interior: boolean, t: number) {
  const k = h / 720;
  if (biome === 'highplaces') {
    skyFill(ctx, 'heaven', w, h);
    heavenSky(ctx, w, h, t, k);
    return;
  }
  if (interior) {
    skyFill(ctx, 'hall', w, h);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#a0601a', w * 0.5, h, w * 0.6, h * 0.35, 0.25);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (biome === 'hiddekel') {
    const dusk = skyVariant === 'dusk';
    skyFill(ctx, dusk ? 'dusk' : 'dawn', w, h);
    // the sun low over the water, swollen by mist
    const sx = w * (dusk ? 0.22 : 0.72), sy = h * 0.6, sr = h * 0.06;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, dusk ? '#e0603a' : '#f0a070', sx, sy, sr * 12, sr * 5, 0.4);
    blob(ctx, '#ffe0b0', sx, sy, sr * 3, sr * 3, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    circle(ctx, sx, sy, sr, dusk ? '#ff9a60' : '#ffd8a0');
    // the last stars, and low banks of cloud lit from below
    ctx.fillStyle = '#f4f0ff';
    for (let i = 0; i < 30; i++) {
      const y = hash2(i, 61) * h * 0.3;
      ctx.globalAlpha = (0.2 + 0.4 * hash2(i, 63)) * (1 - y / (h * 0.3));
      ctx.fillRect(hash2(i, 65) * w, y, Math.max(1, 1.4 * k), Math.max(1, 1.4 * k));
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const y = h * (0.2 + i * 0.08);
      const x = ((t * (2 + i) * k * 2 + hash2(i, 67) * w) % (w + 800 * k)) - 400 * k;
      const len = (160 + hash2(i, 69) * 160) * k, th = (10 + i * 3) * k;
      blob(ctx, dusk ? '#3a2240' : '#4a4a6a', x, y, len, th, 0.6);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, dusk ? '#ff8a5a' : '#ffb890', x, y + th * 0.5, len * 0.8, th * 0.3, 0.25);
      ctx.globalCompositeOperation = 'source-over';
    }
    return;
  }
  // Shushan: the storm turning like a wheel over the palace
  const storm = skyVariant === 'storm';
  skyFill(ctx, storm ? 'storm' : 'day', w, h);
  stormWheel(ctx, w * (storm ? 0.62 : 0.66), h * (storm ? 0.18 : 0.14), h * (storm ? 0.62 : 0.34), t, storm);
  if (storm) lightning(ctx, w, h, t, k);
}

/** A storm cloud wheeling slowly: spiral arms of cloud around a dark eye. */
function stormWheel(ctx: Ctx, cx: number, cy: number, R: number, t: number, storm: boolean) {
  const rot = t * (storm ? 0.06 : 0.03);
  const dark = storm ? '#0e1018' : '#3a3e54', mid = storm ? '#2a2e40' : '#6a6c84';
  blob(ctx, dark, cx, cy, R * 1.3, R * 0.55, storm ? 0.8 : 0.45);
  const arms = 4, per = tier() === 2 ? 9 : 6;
  for (let a = 0; a < arms; a++)
    for (let i = 0; i < per; i++) {
      const u = i / per, ang = rot + (a / arms) * TAU + u * 2.6;
      const r = R * (0.15 + u * 0.95);
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.32;
      blob(ctx, i & 1 ? dark : mid, x, y, R * (0.24 - u * 0.1), R * (0.09 - u * 0.03), storm ? 0.7 : 0.4);
    }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, storm ? '#6a7aa8' : '#c8c8e0', cx, cy, R * 0.25, R * 0.09, storm ? 0.25 + 0.15 * Math.sin(t * 3) : 0.15);
  ctx.globalCompositeOperation = 'source-over';
}

/** A flash every few seconds: the sky goes white and a bolt forks down. Deterministic in t, no garbage. */
function lightning(ctx: Ctx, w: number, h: number, t: number, k: number) {
  const P = 3.7, n = Math.floor(t / P), ph = t - n * P;
  if (hash2(n, 0, 71) > 0.75 || ph > 0.35) return;
  const a = ph < 0.06 ? 1 : ph < 0.12 ? 0.3 : ph < 0.18 ? 0.8 : Math.max(0, 1 - (ph - 0.18) / 0.17);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(180,200,255,0.25)';
  ctx.globalAlpha = a;
  ctx.fillRect(0, 0, w, h);
  let x = w * (0.2 + hash2(n, 1, 71) * 0.7), y = 0;
  ctx.strokeStyle = '#e8eeff';
  ctx.lineWidth = Math.max(1.5, 2.4 * k);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 10; i++) {
    x += (hash2(n, i + 2, 72) - 0.5) * 60 * k;
    y += h * 0.055;
    ctx.lineTo(x, y);
    if (i === 4) {
      ctx.lineTo(x + 40 * k, y + h * 0.08);
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Above the world: shafts of light through a rent in the sky, motes turning in them. */
function heavenSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#fff0c0', w * 0.5, h * 0.45, w * 0.5, h * 0.3, 0.45);
  blob(ctx, '#ffffff', w * 0.5, h * 0.42, w * 0.12, h * 0.25, 0.4);
  // rays fanning from the rift
  ctx.fillStyle = 'rgba(255,236,190,0.06)';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.22 + Math.sin(t * 0.1 + i) * 0.02;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.42);
    ctx.lineTo(w * 0.5 + Math.cos(a - 0.05) * w, h * 0.42 - Math.sin(-a - 0.05) * h * 1.4);
    ctx.lineTo(w * 0.5 + Math.cos(a + 0.05) * w, h * 0.42 - Math.sin(-a + 0.05) * h * 1.4);
    ctx.fill();
  }
  ctx.fillStyle = '#fff8e0';
  for (let i = 0; i < 40; i++) {
    const life = (t * 0.05 + hash2(i, 81)) % 1;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.7;
    ctx.fillRect(hash2(i, 83) * w, h * (0.9 - life * 0.8), Math.max(1, 1.6 * k), Math.max(1, 1.6 * k));
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- parallax pieces

/** A low drift of mist (baked into a layer). */
function mistBand(ctx: Ctx, w: number, y: number, thick: number, col: string, a: number, rng: RNG) {
  ctx.globalCompositeOperation = 'lighter';
  for (let x = -40; x < w + 40; x += rng.range(50, 110)) blob(ctx, col, x, y + rng.range(-thick * 0.3, thick * 0.3), rng.range(80, 160), thick, a);
  ctx.globalCompositeOperation = 'source-over';
}

/** Susa on its mound: the citadel wall, the Apadana's columns standing over it. */
function citadelSil(ctx: Ctx, x0: number, x1: number, base: number, k: number, col: string, rim: string) {
  // the mound
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x0 - 40 * k, base);
  ctx.quadraticCurveTo(x0, base - 30 * k, x0 + 40 * k, base - 34 * k);
  ctx.lineTo(x1 - 40 * k, base - 34 * k);
  ctx.quadraticCurveTo(x1, base - 30 * k, x1 + 40 * k, base);
  ctx.fill();
  // the wall with towers
  const wy = base - 34 * k;
  ctx.fillRect(x0 + 30 * k, wy - 16 * k, x1 - x0 - 60 * k, 16 * k);
  merlons(ctx, x0 + 30 * k, x1 - 30 * k, wy - 16 * k, 4 * k, col);
  for (let x = x0 + 30 * k; x < x1 - 40 * k; x += 46 * k) {
    ctx.fillRect(x, wy - 26 * k, 10 * k, 26 * k);
    merlons(ctx, x, x + 10 * k, wy - 26 * k, 3.4 * k, col);
  }
  // the Apadana on its terrace: columns under a long roof
  const ax = (x0 + x1) / 2, aw = (x1 - x0) * 0.36, ay = wy - 22 * k;
  ctx.fillRect(ax - aw / 2 - 6 * k, ay - 2 * k, aw + 12 * k, 4 * k);
  for (let c = 0; c <= 8; c++) ctx.fillRect(ax - aw / 2 + (aw * c) / 8 - 1.2 * k, ay - 40 * k, 2.4 * k, 40 * k);
  ctx.fillRect(ax - aw / 2 - 8 * k, ay - 46 * k, aw + 16 * k, 7 * k);
  ctx.fillStyle = rim;
  ctx.fillRect(ax - aw / 2 - 8 * k, ay - 46 * k, aw + 16 * k, 1);
  ctx.fillRect(x0 + 30 * k, wy - 16 * k, x1 - x0 - 60 * k, 1);
}

/** A floating island of bright stone with a broken column or arch on it. */
function floatIsle(ctx: Ctx, cx: number, cy: number, s: number, col: string, rim: string, rng: RNG, ruin: number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx + s * 0.7, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.25, cy + s * rng.range(0.7, 1));
  ctx.lineTo(cx - s * 0.1, cy + s * rng.range(1, 1.3));
  ctx.lineTo(cx - s * 0.5, cy + s * 0.6);
  ctx.lineTo(cx - s * 0.85, cy + s * 0.25);
  ctx.closePath();
  ctx.fill();
  if (ruin === 1) {
    ctx.fillRect(cx - s * 0.3, cy - s * 1.4, s * 0.16, s * 1.4);
    ctx.fillRect(cx - s * 0.38, cy - s * 1.5, s * 0.32, s * 0.12);
  } else if (ruin === 2) {
    ctx.fillRect(cx - s * 0.6, cy - s * 1.1, s * 0.14, s * 1.1);
    ctx.fillRect(cx + s * 0.46, cy - s * 0.7, s * 0.14, s * 0.7);
    ctx.lineWidth = s * 0.12;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 1.1, s * 0.53, Math.PI, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.fillStyle = rim;
  ctx.fillRect(cx - s, cy - 0.4, s * 2, 1);
}

// ---------------------------------------------------------------- parallax

export function buildParallaxCh6(biome: Ch6Biome, pal: BiomePal, seed: number, interior: boolean, viewH: number, res: number): Layer[] {
  hall = biome === 'shushan' && interior;
  skyVariant = biome === 'hiddekel' ? (seed === DUSK_SEED ? 'dusk' : 'dawn') : seed === STORM_SEED ? 'storm' : 'day';
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
  const rng = new RNG(seed);

  if (biome === 'hiddekel') {
    const dusk = skyVariant === 'dusk';
    const lit = rgba(dusk ? '#ff9a6a' : '#ffc8a0', 0.35);
    // Far: the plain across the river, low hills and groves in the haze.
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8;
      const n0 = wrapNoise(w, 280, seed, 3);
      fillRidge(ctx, w, h, (x) => hz - 6 - n0(x) * 18, mix(pal.far, pal.fog, 0.5));
      const fr = new RNG(seed + 3);
      for (let x = fr.range(0, 60); x < w - 20; x += fr.range(40, 120)) {
        const cnt = fr.int(2, 5);
        for (let i = 0; i < cnt; i++) wrap(x + i * 8, 20, w, (xx) => palmSil(ctx, xx, hz + 1, fr.range(16, 26), mix(pal.far, pal.fog, 0.3), new RNG(seed + i * 7 + Math.floor(x)), null));
      }
      fillRidge(ctx, w, h, (x) => hz + 2, mix(pal.far, pal.fog, 0.25));
      mistBand(ctx, w, hz, 10, dusk ? '#c08a8a' : '#d8c8c8', 0.3, fr);
    }, res * 0.7);
    // Mid: the great river, wide and slow, the far bank's reeds and palms.
    mk(0.15, 0.07, (ctx, w, h) => {
      const bank = h * 0.8, water = h * 0.84;
      const col = pal.mid, fr = new RNG(seed + 12);
      ctx.fillStyle = mix(pal.mid, dusk ? '#c86a4a' : '#d8a080', 0.35);
      ctx.fillRect(0, water - 1, w, h - water);
      ctx.fillStyle = rgba(dusk ? '#ffb07a' : '#ffe0c0', 0.5);
      for (let i = 0; i < 70; i++) ctx.fillRect(fr.range(0, w), water + fr.range(2, h - water - 4), fr.range(8, 40), 1);
      fillRidge(ctx, w, water, (x) => bank, col);
      let x = fr.range(0, 40);
      while (x < w - 20) {
        const sd = fr.int(0, 99999);
        if (fr.chance(0.5)) wrap(x, 30, w, (xx) => palmSil(ctx, xx, bank + 2, fr.range(36, 60), col, new RNG(sd), lit, dusk ? -1 : 1));
        else wrap(x, 30, w, (xx) => reedSil(ctx, xx, bank + 2, 40, 18, col, new RNG(sd)));
        x += fr.range(40, 110);
      }
      ctx.fillStyle = col;
      ctx.fillRect(0, bank, w, water - bank);
      mistBand(ctx, w, water + 4, 8, dusk ? '#c89090' : '#e0d4d4', 0.25, fr);
    });
    // Near: reeds and dead branches, dark against the bright water.
    mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 120, seed + 21, 3);
      const hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22), col = pal.near;
      let x = fr.range(20, 60);
      while (x < w - 30) {
        const sd = fr.int(0, 99999);
        wrap(x, 40, w, (xx) => reedSil(ctx, xx - 20, hy(xx) + 6, 50, 44 + fr.range(0, 26), col, new RNG(sd)));
        x += fr.range(90, 170);
      }
      fillRidge(ctx, w, h, hy, col);
    });
  } else if (biome === 'shushan' && interior) {
    // The hall of a hundred columns: a forest of them receding into lamplit dark.
    mk(0.08, 0.05, (ctx, w, h) => {
      ctx.fillStyle = pal.far;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let x = 32; x < w; x += 64) blob(ctx, '#a0601a', x, h * 0.84, 40, 50, 0.22);
      ctx.globalCompositeOperation = 'source-over';
      const col = mix(pal.far, '#000000', 0.25);
      for (let row = 0; row < 2; row++) {
        const step = row ? 48 : 64, cw = row ? 5 : 8, c = row ? mix(col, pal.far, 0.5) : col;
        for (let x = row * 24; x < w; x += step) {
          ctx.fillStyle = c;
          ctx.fillRect(x - cw / 2, h * 0.2, cw, h * 0.7);
          ctx.fillRect(x - cw * 1.6, h * 0.2 - cw, cw * 3.2, cw);
          ctx.fillRect(x - cw, h * 0.88, cw * 2, h * 0.04);
        }
      }
      ctx.fillStyle = col;
      ctx.fillRect(0, h * 0.14, w, h * 0.06);
      ctx.fillStyle = 'rgba(216,168,64,0.3)';
      ctx.fillRect(0, h * 0.2, w, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, h * 0.9, w, h * 0.1);
    }, res * 0.7);
    mk(0.24, 0.12, (ctx, w, h) => {
      const col = pal.mid;
      for (let x = 60; x < w; x += 200) {
        ctx.fillStyle = col;
        ctx.fillRect(x - 12, h * 0.16, 24, h);
        ctx.fillStyle = 'rgba(255,170,90,0.1)';
        ctx.fillRect(x - 12, h * 0.16, 4, h);
        // a double-bull capital in silhouette
        ctx.fillStyle = col;
        ctx.fillRect(x - 34, h * 0.16 - 18, 68, 12);
        ctx.beginPath();
        ctx.ellipse(x - 30, h * 0.16 - 20, 10, 7, 0, 0, TAU);
        ctx.ellipse(x + 30, h * 0.16 - 20, 10, 7, 0, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, '#ffb850', x + 100, h * 0.7, 30, 26, 0.3);
        ctx.globalCompositeOperation = 'source-over';
      }
    });
  } else if (biome === 'shushan') {
    const storm = skyVariant === 'storm';
    const rim = rgba(storm ? '#8aa0d8' : '#fff0d0', storm ? 0.25 : 0.35);
    // Far: the citadel of Susa on its mound (from the summit of the storm, the city far below).
    mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * (storm ? 0.84 : 0.8);
      const n0 = wrapNoise(w, 300, seed, 3);
      fillRidge(ctx, w, h, (x) => hz - 4 - n0(x) * 14, mix(pal.far, pal.fog, storm ? 0.15 : 0.45));
      const col = mix(pal.far, pal.fog, storm ? 0.1 : 0.32);
      citadelSil(ctx, 120, 560, hz, storm ? 0.7 : 1, col, rim);
      housesSil(ctx, 600, 980, hz - 2, 0.9, col, rim, new RNG(seed + 5), storm ? 0.5 : 0.1);
      fillRidge(ctx, w, h, (x) => hz + 2, mix(pal.far, pal.fog, storm ? 0.05 : 0.25));
    }, res * 0.75);
    // Mid: the royal road through palms and poplars, a caravanserai or two.
    mk(0.16, 0.07, (ctx, w, h) => {
      const n = wrapNoise(w, 220, seed + 11, 4);
      const hy = (x: number) => h * 0.84 - n(x) * h * 0.04;
      const col = pal.mid, fr = new RNG(seed + 12);
      let x = fr.range(0, 40);
      while (x < w - 20) {
        const k = fr.int(0, 3), sd = fr.int(0, 99999);
        if (k === 0) wrap(x, 30, w, (xx) => palmSil(ctx, xx, hy(xx) + 3, fr.range(36, 60), col, new RNG(sd), rim, -1));
        else if (k === 1) wrap(x, 20, w, (xx) => cypressSil(ctx, xx, hy(xx) + 3, fr.range(40, 64), col, rim));
        else if (k === 2) wrap(x, 60, w, (xx) => housesSil(ctx, xx, xx + 60, hy(xx) + 4, 1, col, rim, new RNG(sd), 0.3));
        else wrap(x, 30, w, (xx) => cypressSil(ctx, xx, hy(xx) + 3, fr.range(30, 44), col, null));
        x += fr.range(50, 120);
      }
      fillRidge(ctx, w, h, hy, col);
      strokeRidge(ctx, w, hy, rim, 1);
    });
    // Near: palms and cypress, dark.
    mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 120, seed + 21, 3);
      const hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22), col = pal.near;
      let x = fr.range(20, 60);
      while (x < w - 30) {
        const sd = fr.int(0, 99999);
        if (fr.chance(0.5)) wrap(x, 50, w, (xx) => palmSil(ctx, xx, hy(xx) + 6, 80 + fr.range(0, 50), col, new RNG(sd), null));
        else wrap(x, 20, w, (xx) => cypressSil(ctx, xx, hy(xx) + 6, 90 + fr.range(0, 40), col, null));
        x += fr.range(110, 210);
      }
      fillRidge(ctx, w, h, hy, col);
    });
  } else {
    // Above the world. Far: luminous cloud seas and distant floating ruins.
    mk(0.04, 0.03, (ctx, w, h) => {
      const fr = new RNG(seed + 3);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) blob(ctx, '#fff4dc', fr.range(0, w), h * fr.range(0.62, 0.95), fr.range(90, 180), fr.range(20, 40), fr.range(0.2, 0.35));
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 9; i++) {
        const x = fr.range(20, w - 20), sd = fr.int(0, 9999);
        wrap(x, 30, w, (xx) => floatIsle(ctx, xx, h * fr.range(0.45, 0.75), fr.range(8, 18), mix(pal.far, '#e8d8c0', 0.5), 'rgba(255,248,220,0.6)', new RNG(sd), sd % 3));
      }
    }, res * 0.7);
    // Mid: marble isles adrift, chains hanging from nothing.
    mk(0.15, 0.08, (ctx, w, h) => {
      const fr = new RNG(seed + 13);
      const col = mix(pal.mid, '#cfc4b0', 0.55);
      for (let i = 0; i < 7; i++) {
        const x = (w / 7) * i + fr.range(10, 90), y = h * fr.range(0.5, 0.82), s = fr.range(20, 40), sd = fr.int(0, 9999);
        wrap(x, s * 2, w, (xx) => floatIsle(ctx, xx, y, s, col, 'rgba(255,248,224,0.8)', new RNG(sd), sd % 3));
        if (fr.chance(0.5)) {
          const cx = x + fr.range(-40, 40), L = fr.range(h * 0.2, h * 0.5);
          wrap(cx, 10, w, (xx) => {
            ctx.strokeStyle = mix(pal.mid, '#000000', 0.2);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let yy = 0; yy < L; yy += 6) {
              ctx.moveTo(xx + 1.6, yy + 2.5);
              ctx.ellipse(xx, yy + 2.5, (yy / 6) & 1 ? 0.5 : 1.6, 2.5, 0, 0, TAU);
            }
            ctx.stroke();
          });
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) blob(ctx, '#fff8e8', fr.range(0, w), h * fr.range(0.85, 1), fr.range(100, 200), fr.range(18, 30), 0.35);
      ctx.globalCompositeOperation = 'source-over';
    });
  }
  return layers;
}

// ---------------------------------------------------------------- tiles
// Pixel art draws one world unit per art pixel, so tile detail keeps to whole units.

function box(ctx: Ctx, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** Solid tiles: river loam under grass, Susa's limestone with glazed bands, white-gold marble that frays into light. */
export function drawSolidCh6(ctx: Ctx, biome: Ch6Biome, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
  if (t === T.Seal) base = '#7a5a28';
  if (t === T.Wood) base = pal.plat;
  const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  ctx.fillStyle = mix(dark, '#000000', v * 0.1);
  ctx.fillRect(x, y, TILE, TILE);
  if (biome === 'hiddekel') loamTile(ctx, pal, x, y, tx, ty, depth, v, up);
  else if (biome === 'shushan') susaTile(ctx, pal, x, y, tx, ty, depth, up, dn);
  else marbleTile(ctx, x, y, tx, ty, depth, up, dn);
  if (!dn && biome !== 'highplaces') box(ctx, 'rgba(0,0,0,0.38)', x, y + TILE - 2, TILE, 2);
  if (!lf) box(ctx, biome === 'highplaces' ? 'rgba(255,244,214,0.35)' : 'rgba(255,214,170,0.14)', x, y, 1, TILE);
  if (!rt) box(ctx, 'rgba(0,0,0,0.3)', x + TILE - 2, y, 2, TILE);
}

function loamTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean) {
  if (depth <= 1) {
    // silt laid in bands by the floods, a pebble or a root in it
    const b0 = 4 + Math.floor(hash2(tx, ty, 601) * 3), b1 = 10 + Math.floor(hash2(tx, ty, 602) * 3);
    box(ctx, 'rgba(16,10,6,0.3)', x, y + b0, TILE, 1);
    box(ctx, 'rgba(16,10,6,0.3)', x, y + b1, TILE, 1);
    box(ctx, 'rgba(220,190,150,0.08)', x, y + b0 + 1, TILE, 1);
    const k = hash2(tx, ty, 603);
    if (k < 0.12) box(ctx, shade(pal.stone, 0.25), x + 2 + Math.floor(hash2(tx, ty, 604) * 10), y + b0 + 2, 3, 2);
    else if (k < 0.2 && !up) {
      box(ctx, '#2a1c10', x + 5, y + 4, 1, 5);
      box(ctx, '#2a1c10', x + 6, y + 8, 3, 1);
    }
  }
  if (!up) {
    box(ctx, 'rgba(10,6,2,0.4)', x, y + 3, TILE, 2);
    box(ctx, pal.cap, x, y, TILE, 4);
    // a ragged lower edge to the turf
    ctx.fillStyle = pal.cap;
    for (let i = 0; i < 4; i++) if (hash2(tx, i, 605) < 0.5) ctx.fillRect(x + i * 4 + 1, y + 4, 2, 1);
    box(ctx, skyVariant === 'dusk' ? 'rgba(255,170,120,0.3)' : 'rgba(255,214,170,0.3)', x, y, TILE, 1);
    ctx.fillStyle = pal.capTuft;
    for (let i = 0; i < 4; i++) {
      const gx = x + Math.floor(hash2(tx, i, 606) * 15), gh = 1 + Math.floor(hash2(tx, i, 607) * 3 + v);
      ctx.fillRect(gx, y - gh, 1, gh);
    }
    if (hash2(tx, ty, 608) < 0.12) box(ctx, hash2(tx, ty, 609) < 0.5 ? '#e8d890' : '#f0e8e0', x + 3 + Math.floor(hash2(tx, ty, 610) * 10), y - 2, 1, 1);
  }
}

function susaTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean) {
  if (depth <= 1) {
    if (ty % 5 === 2 && up && !hall) {
      // a course of glazed brick: turquoise between gold, white studs
      box(ctx, TURQ, x, y + 4, TILE, 8);
      box(ctx, GOLD, x, y + 4, TILE, 1);
      box(ctx, GOLD, x, y + 11, TILE, 1);
      box(ctx, TURQ_HI, x, y + 5, TILE, 1);
      box(ctx, '#e8e0c8', x + ((tx & 1) ? 3 : 11), y + 7, 2, 2);
      box(ctx, LAPIS, x + ((tx & 1) ? 11 : 3), y + 7, 2, 2);
    } else {
      // limestone ashlar, half-bond
      const off = ty & 1 ? 8 : 0;
      box(ctx, 'rgba(20,12,6,0.35)', x, y, TILE, 1);
      box(ctx, 'rgba(20,12,6,0.35)', x + off, y, 1, TILE);
      box(ctx, 'rgba(20,12,6,0.25)', x, y + 8, TILE, 1);
      box(ctx, 'rgba(255,236,200,0.1)', x, y + 1, TILE, 1);
      box(ctx, 'rgba(255,236,200,0.1)', x + off + 1, y + 1, 1, TILE - 1);
    }
  }
  if (!up) {
    if (hall) {
      // the polished floor of the hall, its lamps in it
      box(ctx, '#4a3424', x, y, TILE, 5);
      box(ctx, '#7a5a40', x, y, TILE, 3);
      box(ctx, 'rgba(255,200,130,0.35)', x, y, TILE, 1);
      box(ctx, 'rgba(255,190,110,0.18)', x + ((tx * 5) % 11), y + 1, 4, 1);
      box(ctx, 'rgba(0,0,0,0.35)', x + (tx & 1 ? 0 : 15), y, 1, 5);
    } else {
      // the paving of the royal road and the citadel
      box(ctx, shade(pal.cap, -0.35), x, y, TILE, 5);
      box(ctx, pal.cap, x, y, TILE, 4);
      box(ctx, 'rgba(255,248,224,0.45)', x, y, TILE, 1);
      box(ctx, 'rgba(40,28,16,0.5)', x + (tx % 3 === 0 ? 5 : 12), y, 1, 4);
      if (hash2(tx, ty, 611) < 0.18) box(ctx, 'rgba(60,40,20,0.3)', x + 2 + Math.floor(hash2(tx, ty, 612) * 10), y + 2, 3, 1);
    }
  }
  if (!dn && hall) {
    // cedar beams under the roof, gold-studded
    box(ctx, '#2a160a', x, y + TILE - 6, TILE, 6);
    box(ctx, '#5a3418', x, y + TILE - 6, TILE, 4);
    box(ctx, 'rgba(255,190,120,0.25)', x, y + TILE - 2, TILE, 1);
    if ((tx & 1) === 0) box(ctx, GOLD, x + 7, y + TILE - 5, 2, 2);
  }
}

function marbleTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean) {
  if (depth <= 1) {
    box(ctx, 'rgba(255,250,236,0.22)', x, y, TILE, TILE);
    // veins of gold-grey running through the stone
    const k = hash2(tx, ty, 621);
    if (k < 0.45) {
      ctx.fillStyle = k < 0.15 ? 'rgba(200,150,60,0.4)' : 'rgba(110,100,90,0.3)';
      let vx = x + Math.floor(hash2(tx, ty, 622) * 12);
      for (let i = 0; i < 16; i += 2) {
        ctx.fillRect(vx, y + i, 1, 2);
        vx += hash2(tx, ty * 16 + i, 623) < 0.5 ? 1 : -1;
        if (vx < x) vx = x;
        if (vx > x + 15) vx = x + 15;
      }
    }
  }
  if (!up) {
    box(ctx, '#f6f0e2', x, y, TILE, 4);
    box(ctx, GOLD, x, y + 4, TILE, 1);
    box(ctx, '#ffffff', x, y, TILE, 1);
    box(ctx, 'rgba(90,70,40,0.3)', x, y + 5, TILE, 1);
  }
  if (!dn) {
    // the underside does not end; it frays into light
    ctx.globalCompositeOperation = 'lighter';
    box(ctx, 'rgba(255,230,170,0.25)', x, y + TILE - 4, TILE, 4);
    for (let r = 0; r < 6; r++) {
      const keep = 1 - r / 6;
      ctx.fillStyle = r < 2 ? 'rgba(255,240,200,0.5)' : 'rgba(255,226,160,0.35)';
      for (let c = 0; c < 8; c++) if (hash2(tx * 8 + c, ty * 6 + r, 624) < keep) ctx.fillRect(x + c * 2, y + TILE + r * 2, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** One-way platforms: palm logs lashed with rope, cedar beams with glazed ends, slabs of marble floating on light. */
export function drawOneWayCh6(ctx: Ctx, biome: Ch6Biome, pal: BiomePal, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'hiddekel') {
    box(ctx, '#2a1c10', x, y, TILE, 6);
    box(ctx, '#6a4a2a', x, y, TILE, 4);
    box(ctx, '#9a7448', x, y, TILE, 1);
    box(ctx, 'rgba(20,12,6,0.5)', x, y + 2, TILE, 1);
    if ((tx & 1) === 0) {
      box(ctx, '#b89a64', x + 7, y - 1, 2, 7);
      box(ctx, '#6a5434', x + 7, y + 3, 2, 1);
    }
    if (l || r) {
      const px = l ? x + 2 : x + TILE - 5;
      box(ctx, '#3a2614', px, y + 4, 3, 10);
      box(ctx, '#5a4024', px, y + 4, 1, 10);
      // the log end, its rings
      box(ctx, '#8a6a40', l ? x : x + TILE - 2, y, 2, 5);
    }
    return;
  }
  if (biome === 'shushan') {
    box(ctx, '#22120a', x, y, TILE, 7);
    box(ctx, '#6a3e1e', x, y, TILE, 5);
    box(ctx, 'rgba(255,200,140,0.35)', x, y, TILE, 1);
    box(ctx, 'rgba(30,14,6,0.45)', x, y + 3, TILE, 1);
    if (tx % 3 === 0) {
      box(ctx, GOLD, x + 6, y + 1, 2, 2);
      box(ctx, GOLD_HI, x + 6, y + 1, 1, 1);
    }
    if (l || r) {
      // a glazed end-tile, turquoise in gold
      const ex = l ? x : x + TILE - 6;
      box(ctx, GOLD_DK, ex, y - 1, 6, 9);
      box(ctx, TURQ, ex + 1, y, 4, 7);
      box(ctx, TURQ_HI, ex + 1, y, 4, 1);
      box(ctx, '#e8e0c8', ex + 2, y + 3, 2, 2);
    }
    return;
  }
  box(ctx, '#8a7c66', x, y, TILE, 6);
  box(ctx, '#f2ecdc', x, y, TILE, 4);
  box(ctx, '#ffffff', x, y, TILE, 1);
  box(ctx, GOLD, x, y + 4, TILE, 1);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffe0a0', x + 8, y + 9, 12, 5, 0.3);
  if (l || r) {
    // the slab's broken end, crumbs of it floating loose
    const ex = l ? x : x + TILE - 2;
    box(ctx, 'rgba(255,236,190,0.5)', ex, y + 6, 2, 2);
    box(ctx, 'rgba(255,236,190,0.35)', l ? x - 3 : x + TILE + 1, y + 2, 2, 2);
    box(ctx, 'rgba(255,236,190,0.25)', l ? x - 5 : x + TILE + 3, y + 8, 1, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
}

let abyssSpr: HTMLCanvasElement | null = null;
/** A fade from nothing to gold-white, 16 × 48, drawn over the abyss rows. */
function abyss() {
  if (abyssSpr) return abyssSpr;
  const m = makeCanvas(16, 48);
  const g = m.ctx.createLinearGradient(0, 0, 0, 48);
  g.addColorStop(0, 'rgba(255,236,190,0)');
  g.addColorStop(0.45, 'rgba(255,232,180,0.35)');
  g.addColorStop(1, 'rgba(255,248,226,0.95)');
  m.ctx.fillStyle = g;
  m.ctx.fillRect(0, 0, 16, 48);
  abyssSpr = m.c;
  return abyssSpr;
}

/** The high places have no floor: the spike rows are a drop into light, far clouds glowing below. */
export function drawSpikesCh6(ctx: Ctx, biome: Ch6Biome, tx: number, ty: number, top: boolean): boolean {
  if (biome !== 'highplaces') return false;
  const x = tx * TILE, y = ty * TILE;
  if (top) {
    ctx.drawImage(abyss(), x, y - 16, TILE, 48);
    // cloud tops far below, small for the distance
    ctx.fillStyle = 'rgba(255,250,236,0.55)';
    const c0 = Math.floor(hash2(tx, 0, 631) * 10);
    ctx.fillRect(x + c0, y + 9, 6, 2);
    ctx.fillRect(x + c0 + 1, y + 8, 4, 1);
    if (hash2(tx, 1, 631) < 0.5) ctx.fillRect(x + ((c0 + 9) % 14), y + 12, 4, 1);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#ffe6b0', x + 8, y + 12, 18, 8, 0.35);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    box(ctx, 'rgba(255,248,226,0.95)', x, y, TILE, TILE);
  }
  return true;
}

// ---------------------------------------------------------------- liquids

/** The great river at first light (or the marsh pools at dusk): slow water with the sky in it and mist on it. */
export function drawLiquidCh6(ctx: Ctx, biome: Biome, tt: T, x: number, y: number, top: boolean, tx: number, t: number): boolean {
  if (biome !== 'hiddekel' || tt !== T.Water) return false;
  const dusk = skyVariant === 'dusk';
  const wy = top ? 5 : 0;
  ctx.fillStyle = dusk ? 'rgba(52,30,44,0.92)' : 'rgba(36,50,70,0.9)';
  ctx.fillRect(x, y + wy, TILE, TILE - wy);
  if (!top) return true;
  ctx.fillStyle = dusk ? 'rgba(232,148,106,0.85)' : 'rgba(244,204,170,0.85)';
  ctx.fillRect(x, y + wy, TILE, 1);
  ctx.fillStyle = dusk ? 'rgba(200,100,90,0.3)' : 'rgba(200,170,190,0.3)';
  ctx.fillRect(x, y + wy + 2, TILE, 1);
  // light lying on the water in short strokes, drifting downstream
  const g = (t * 5 + hash2(tx, 0, 641) * 16) % 16;
  ctx.fillStyle = dusk ? 'rgba(255,190,130,0.7)' : 'rgba(255,236,210,0.7)';
  ctx.fillRect(x + Math.floor(g), y + wy + 3, 3, 1);
  if (hash2(tx, 1, 641) < 0.5) ctx.fillRect(x + Math.floor((g + 7) % 14), y + wy + 6, 2, 1);
  if (tier() > 0) {
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, dusk ? '#c08080' : '#d8d0d8', x + 8 + Math.sin(t * 0.3 + tx * 0.7) * 6, y + wy - 2, 16, 4, 0.12);
    ctx.globalCompositeOperation = 'source-over';
  }
  return true;
}

// ---------------------------------------------------------------- props: by the river

type PropFn = (ctx: Ctx, e: Decor, pal: BiomePal, rng: RNG) => void;

const MUD = '#3a2c1e';
const REED = ['#4a5a2e', '#5e6e36', '#7a8644'] as const;
const PLUME = '#8a6a3e';

/** A clump of reeds, 1-unit stalks, a plume on some; feet on y. */
function reedClump(ctx: Ctx, x: number, y: number, n: number, hgt: number, rng: RNG) {
  for (let i = 0; i < n; i++) {
    const sx = Math.round(x + (i - n / 2) * 2 + rng.range(-1, 1)), sh = Math.round(hgt * rng.range(0.55, 1));
    const lean = rng.int(-2, 2);
    ctx.fillStyle = REED[i % 3];
    ctx.fillRect(sx, y - sh * 0.5, 1, sh * 0.5);
    ctx.fillRect(sx + (lean > 0 ? 1 : lean < 0 ? -1 : 0), y - sh, 1, sh * 0.5);
    if (rng.chance(0.4)) box(ctx, PLUME, sx + (lean > 0 ? 1 : lean < 0 ? -2 : 0) - 0.5, y - sh - 4, 2, 5);
  }
}

const riverBank: PropFn = (ctx, e, pal, rng) => {
  // The far bank across the channel: mud and reeds above the waterline, a reed skiff tied up.
  const W = (e.w ?? 24) * TILE, hw = W / 2;
  const dusk = skyVariant === 'dusk';
  ctx.fillStyle = MUD;
  ctx.beginPath();
  ctx.moveTo(-hw, 24);
  for (let x = -hw; x <= hw; x += 8) ctx.lineTo(x, 8 + Math.round(Math.sin(x * 0.05) * 2 + hash2(Math.floor(x), 0, 651) * 2));
  ctx.lineTo(hw, 24);
  ctx.fill();
  // wet mud at the waterline, the turf on top lit by the low sun
  box(ctx, '#2a2018', -hw, 17, W, 6);
  box(ctx, 'rgba(255,200,160,0.15)', -hw, 17, W, 1);
  ctx.fillStyle = shade(pal.cap, -0.25);
  for (let x = -hw; x < hw; x += 8) ctx.fillRect(x, 7 + Math.round(Math.sin(x * 0.05) * 2 + hash2(Math.floor(x), 0, 651) * 2), 8, 2);
  ctx.fillStyle = dusk ? 'rgba(255,150,110,0.35)' : 'rgba(255,214,170,0.35)';
  for (let x = -hw; x < hw; x += 8) ctx.fillRect(x, 7 + Math.round(Math.sin(x * 0.05) * 2 + hash2(Math.floor(x), 0, 651) * 2), 8, 1);
  for (let x = -hw + 10; x < hw - 6; x += rng.range(18, 34)) reedClump(ctx, x, 10, rng.int(4, 8), rng.range(12, 24), rng);
  for (let i = 0; i < 5; i++) ellipse(ctx, rng.range(-hw + 10, hw - 10), 16, rng.range(2, 4), 1.5, 0, '#5a4c3a');
  // the skiff: a bundle of reeds bound into a crescent, tied to a stake
  const bx = hw * 0.35;
  box(ctx, '#3a2614', bx + 30, 2, 2, 18);
  box(ctx, '#5a4024', bx + 30, 2, 1, 18);
  ctx.beginPath();
  ctx.moveTo(bx - 22, 13);
  ctx.quadraticCurveTo(bx - 18, 21, bx, 21);
  ctx.quadraticCurveTo(bx + 18, 21, bx + 22, 13);
  ctx.lineTo(bx + 18, 17);
  ctx.quadraticCurveTo(bx, 19, bx - 18, 17);
  ctx.closePath();
  solidify(ctx, '#a08a52', OUT, 0.5);
  ctx.fillStyle = '#6a5a34';
  for (let i = -14; i <= 14; i += 6) ctx.fillRect(bx + i, 17, 1, 3);
  box(ctx, '#c8b07a', bx - 16, 17, 32, 1);
  ctx.strokeStyle = '#c8b07a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + 21, 14);
  ctx.quadraticCurveTo(bx + 26, 12, bx + 30, 6);
  ctx.stroke();
};

const prayerMat: PropFn = (ctx) => {
  // Where Hanan has knelt three full weeks: a worn red mat, a water jar, a cold lamp, a scroll.
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(-12, -3);
  ctx.lineTo(15, -3);
  ctx.lineTo(13, 0);
  ctx.closePath();
  solidify(ctx, '#7a2420', OUT, 0.5);
  box(ctx, GOLD_DK, -12, -3, 27, 1);
  box(ctx, '#a83a2a', -10, -2, 22, 1);
  box(ctx, GOLD, -2, -2, 3, 1);
  ctx.fillStyle = '#e0d4b4';
  for (let i = -15; i <= -13; i += 2) ctx.fillRect(i, -1, 1, 1);
  for (let i = 13; i <= 15; i += 2) ctx.fillRect(i, -1, 1, 1);
  jar(ctx, -21, 0, 3, 9, '#8a5a34', '#c8a070');
  // the lamp, cold
  ctx.beginPath();
  ctx.ellipse(19, -1.5, 4, 1.8, 0, 0, TAU);
  ctx.moveTo(23, -2);
  ctx.lineTo(25, -3);
  ctx.lineTo(23, -1);
  solidify(ctx, '#6a4a30', OUT, 0.5);
  box(ctx, '#2a1a10', 24, -4, 1, 1);
  // the scroll, half unrolled
  box(ctx, OUT, 4, -6, 8, 3);
  box(ctx, '#e8dcb8', 5, -5, 6, 1);
  box(ctx, '#c8b890', 4, -6, 2, 3);
};

const marshHeron: PropFn = (ctx) => {
  // A grey heron standing in the marsh, quite still, watching the water.
  const GREY = '#8a929c', DARK = '#2e323c', PALE = '#dce0e4', LEG = '#8a7a50';
  box(ctx, LEG, -2, -15, 1, 15);
  box(ctx, LEG, 1, -15, 1, 8);
  box(ctx, LEG, 2, -7, 1, 7);
  box(ctx, LEG, -4, 0, 4, 1);
  box(ctx, LEG, 1, 0, 4, 1);
  ctx.beginPath();
  ctx.ellipse(-2, -19, 8, 4.5, -0.3, 0, TAU);
  ctx.moveTo(-8, -15);
  ctx.lineTo(-12, -12);
  ctx.lineTo(-6, -16);
  solidify(ctx, GREY, OUT, 0.5);
  // the folded wing, darker at its tips
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.moveTo(-9, -15);
  ctx.lineTo(-3, -20);
  ctx.lineTo(2, -19);
  ctx.lineTo(-4, -16);
  ctx.closePath();
  ctx.fill();
  box(ctx, '#b8bec6', -6, -22, 8, 1);
  // the long neck in its S, white at the front
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(4, -21);
  ctx.quadraticCurveTo(8, -24, 4, -28);
  ctx.quadraticCurveTo(2, -31, 7, -33);
  ctx.stroke();
  ctx.strokeStyle = PALE;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  box(ctx, DARK, 6, -27, 1, 1);
  box(ctx, DARK, 5, -25, 1, 1);
  ctx.beginPath();
  ctx.ellipse(8, -33.5, 3, 2.2, 0, 0, TAU);
  solidify(ctx, PALE, OUT, 0.5);
  // the dagger bill, the black crest streaming back
  ctx.fillStyle = '#d8a83a';
  ctx.beginPath();
  ctx.moveTo(10, -34.5);
  ctx.lineTo(19, -33);
  ctx.lineTo(10, -32.5);
  ctx.closePath();
  ctx.fill();
  box(ctx, DARK, 4, -35, 5, 1);
  box(ctx, DARK, 1, -34, 4, 1);
  box(ctx, '#ffe060', 9, -34, 1, 1);
  ctx.lineCap = 'butt';
};

const stoneMarker: PropFn = (ctx, e, pal, rng) => {
  // A boundary stone at the edge of Elam, its carving worn shallow.
  ctx.save();
  ctx.rotate(-0.05);
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-7, -20);
  ctx.quadraticCurveTo(-7, -28, 0, -28);
  ctx.quadraticCurveTo(7, -28, 7, -20);
  ctx.lineTo(7, 0);
  ctx.closePath();
  solidify(ctx, '#8a8270', OUT, 0.5);
  box(ctx, 'rgba(255,240,210,0.25)', -6, -24, 2, 23);
  box(ctx, 'rgba(0,0,0,0.25)', 4, -24, 2, 24);
  ctx.fillStyle = '#4a4436';
  ctx.fillRect(-6, -18, 12, 1);
  ctx.fillRect(-6, -9, 12, 1);
  // rows of wedge-marks between the bands
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (rng.chance(0.8)) ctx.fillRect(-5 + c * 3, -16 + r * 2, 2, 1);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (rng.chance(0.7)) ctx.fillRect(-5 + c * 3, -7 + r * 2, 1, 1);
  // a crack, and moss at the foot
  box(ctx, '#2a261e', 2, -27, 1, 4);
  box(ctx, '#2a261e', 3, -24, 1, 3);
  ctx.restore();
  ctx.fillStyle = '#4a5a2a';
  ctx.fillRect(-9, -2, 6, 2);
  ctx.fillRect(3, -1, 7, 1);
  box(ctx, pal.capTuft, -8, -3, 2, 1);
};

// ---------------------------------------------------------------- props: the royal road

const LIME = '#c8b894';
const LIME_LIT = '#e8dcb8';
const LIME_DK = '#7a6c50';

const royalMilestone: PropFn = (ctx, e, pal, rng) => {
  // A marker of the King's road, a station's distance cut into it.
  ctx.beginPath();
  ctx.rect(-9, -5, 18, 5);
  ctx.rect(-6, -29, 12, 24);
  ctx.rect(-8, -33, 16, 4);
  ctx.rect(-6, -36, 12, 3);
  solidify(ctx, LIME, OUT, 0.5);
  box(ctx, LIME_LIT, -6, -29, 2, 24);
  box(ctx, LIME_DK, 4, -29, 2, 24);
  box(ctx, LIME_LIT, -8, -33, 16, 1);
  box(ctx, LIME_DK, -9, -1, 18, 1);
  merlons(ctx, -6, 6, -36, 5, LIME);
  // the inscription panel
  box(ctx, LIME_DK, -3, -26, 6, 15);
  ctx.fillStyle = '#4a3e2a';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) if (rng.chance(0.85)) ctx.fillRect(-2 + c * 3, -25 + r * 2 + (c & 1), 2, 1);
  box(ctx, TURQ, -6, -31, 12, 1);
  // a fallen piece of the cap at its foot
  ctx.beginPath();
  ctx.rect(10, -3, 5, 3);
  solidify(ctx, LIME_DK, OUT, 0.5);
};

const MUDBRICK = ['#a8845a', '#9a784e', '#b48e62', '#a07c52'] as const;

const waystation: PropFn = (ctx, e, pal, rng) => {
  // A post-house of the King's road: mud brick, a gate arch, a shade of reed mats, a lookout.
  const W = (e.w ?? 14) * TILE, hw = W / 2, H = 60;
  ctx.beginPath();
  ctx.rect(-hw + 30, -H, W - 60, H);
  ctx.rect(hw - 52, -H - 26, 34, 26);
  solidify(ctx, MUDBRICK[0], OUT, 0.5);
  brickField(ctx, -hw + 30, -H, hw - 30, 0, 12, 6, MUDBRICK, 657, 'rgba(50,30,14,0.4)', 1);
  brickField(ctx, hw - 52, -H - 26, hw - 18, -H, 12, 6, MUDBRICK, 659, 'rgba(50,30,14,0.4)', 1);
  merlons(ctx, -hw + 30, hw - 30, -H, 8, MUDBRICK[1]);
  merlons(ctx, hw - 52, hw - 18, -H - 26, 7, MUDBRICK[1]);
  box(ctx, 'rgba(255,230,190,0.3)', -hw + 30, -H, W - 60, 1);
  box(ctx, 'rgba(0,0,0,0.22)', -hw + 30, -12, W - 60, 12);
  // the lookout's window, a lamp in it
  box(ctx, '#1a0e08', hw - 40, -H - 18, 8, 10);
  box(ctx, '#ffb850', hw - 37, -H - 13, 2, 3);
  // the gate arch with a glazed band
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-18, -30);
  ctx.arc(0, -30, 18, Math.PI, 0);
  ctx.lineTo(18, 0);
  ctx.closePath();
  ctx.fillStyle = TURQ;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(-14, -30);
  ctx.arc(0, -30, 14, Math.PI, 0);
  ctx.lineTo(14, 0);
  ctx.closePath();
  ctx.fillStyle = '#140a06';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff9a3a', 0, -6, 14, 10, 0.4);
  ctx.globalCompositeOperation = 'source-over';
  box(ctx, GOLD, -18, -31, 4, 1);
  box(ctx, GOLD, 14, -31, 4, 1);
  box(ctx, TURQ_HI, -18, -29, 1, 29);
  // slit windows
  for (const wx of [-hw + 44, -40, 40]) box(ctx, '#1a0e08', wx, -H + 14, 3, 12);
  // the shade: posts, a beam, a sloping roof of reed mats
  const sx0 = -hw + 2, sx1 = -hw + 64;
  ctx.beginPath();
  ctx.rect(sx0 + 2, -34, 3, 34);
  ctx.rect(sx1 - 30, -34, 3, 34);
  ctx.moveTo(sx0 - 4, -32);
  ctx.lineTo(sx1, -40);
  ctx.lineTo(sx1, -35);
  ctx.lineTo(sx0 - 4, -28);
  ctx.closePath();
  solidify(ctx, '#6a4a2a', OUT, 0.5);
  ctx.fillStyle = '#a89058';
  for (let x = sx0; x < sx1; x += 4) ctx.fillRect(x, -32 - ((x - sx0) / (sx1 - sx0 + 4)) * 8, 2, 3);
  // under it: a stone trough, jars and fodder
  ctx.beginPath();
  ctx.rect(sx0 + 8, -8, 22, 8);
  solidify(ctx, '#8a7a62', OUT, 0.5);
  box(ctx, '#3a5a6a', sx0 + 9, -8, 20, 2);
  box(ctx, '#8ac0d0', sx0 + 10, -8, 6, 1);
  jar(ctx, sx0 + 38, 0, 4, 12, '#9a6a40', '#c8a060');
  jar(ctx, sx0 + 46, 0, 3, 9, '#8a5a34', null);
  ctx.beginPath();
  ctx.rect(hw - 30, -10, 18, 10);
  ctx.rect(hw - 26, -16, 12, 6);
  solidify(ctx, '#c8a85a', OUT, 0.5);
  ctx.fillStyle = '#8a6a30';
  for (let i = 0; i < 4; i++) ctx.fillRect(hw - 28 + i * 4, -9 + (i & 1), 3, 1);
  box(ctx, '#8a6a30', hw - 25, -14, 10, 1);
};

/** A camel standing, facing +x, feet on y; s = 1 is about 44 units long. */
function camel(ctx: Ctx, x: number, s: number, rng: RNG, rug: string) {
  const C = '#a8845a', DK = '#6a4c2e';
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(s, s);
  ctx.beginPath();
  taper(ctx, -14, -26, 5, -15, 0, 3);
  taper(ctx, -9, -26, 5, -8, 0, 3);
  taper(ctx, 10, -26, 5, 11, 0, 3);
  taper(ctx, 15, -26, 5, 16, 0, 3);
  ctx.moveTo(18, -28);
  ctx.ellipse(0, -29, 18, 8, 0, 0, TAU);
  ctx.moveTo(10, -36);
  ctx.ellipse(0, -36, 10, 7, 0, 0, TAU);
  taper(ctx, 14, -30, 8, 24, -28, 6);
  taper(ctx, 24, -28, 6, 27, -42, 5);
  ctx.moveTo(35, -43);
  ctx.ellipse(30, -43, 5.5, 3.2, 0.15, 0, TAU);
  solidify(ctx, C, OUT, 0.5);
  // knees, the far legs darker, a fringe on the neck
  box(ctx, DK, -15, -13, 4, 2);
  box(ctx, DK, 10, -13, 4, 2);
  box(ctx, DK, -9, -24, 2, 22);
  box(ctx, DK, 15, -24, 2, 22);
  box(ctx, '#c8a474', -14, -36, 20, 1);
  box(ctx, OUT, 31, -45, 1, 1);
  box(ctx, DK, 34, -41, 2, 1);
  box(ctx, DK, 27, -47, 2, 2);
  // the load: a rug thrown over, two bales roped on
  ctx.beginPath();
  ctx.rect(-10, -38, 20, 12);
  solidify(ctx, rug, OUT, 0.5);
  box(ctx, GOLD, -10, -31, 20, 1);
  box(ctx, '#e8dcb8', -10, -35, 20, 1);
  ctx.beginPath();
  ctx.rect(-16, -42, 12, 9);
  ctx.rect(4, -42, 12, 9);
  solidify(ctx, '#c8b48a', OUT, 0.5);
  box(ctx, '#6a5434', -11, -42, 1, 9);
  box(ctx, '#6a5434', 9, -42, 1, 9);
  if (rng.chance(0.6)) jar(ctx, 0, -42, 3, 7, '#9a6a40', null);
  // the tail
  box(ctx, DK, -19, -30, 1, 9);
  ctx.restore();
}

const caravan: PropFn = (ctx, e, pal, rng) => {
  // A string of camels resting on the King's road, roped head to tail, their loads still on.
  const W = (e.w ?? 10) * TILE;
  camel(ctx, -W * 0.28, 1, rng, '#7a2a2a');
  camel(ctx, W * 0.2, 0.95, rng, '#2a3a6a');
  ctx.strokeStyle = '#c8b07a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-W * 0.28 + 33, -42);
  ctx.quadraticCurveTo(-W * 0.05, -26, W * 0.2 - 18, -28);
  ctx.stroke();
  // goods set down between them
  ctx.beginPath();
  ctx.rect(-8, -8, 14, 8);
  solidify(ctx, '#8a6a40', OUT, 0.5);
  box(ctx, '#c8a060', -8, -5, 14, 1);
  jar(ctx, 12, 0, 4, 12, '#9a6a40', '#c8a060');
  ctx.beginPath();
  ctx.rect(W * 0.2 + 30, -6, 12, 6);
  solidify(ctx, '#3a4a7a', OUT, 0.5);
  box(ctx, GOLD, W * 0.2 + 30, -4, 12, 1);
};

const foreignShrine: PropFn = (ctx, e, pal, rng) => {
  // A roadside shrine to some god of the land: a faceless figure in a sooted niche, old offerings.
  ctx.beginPath();
  ctx.rect(-18, -4, 36, 4);
  ctx.rect(-14, -8, 28, 4);
  ctx.rect(-11, -40, 22, 32);
  ctx.rect(-13, -44, 26, 4);
  solidify(ctx, '#9a8a6a', OUT, 0.5);
  box(ctx, '#c8b890', -14, -8, 28, 1);
  box(ctx, '#c8b890', -13, -44, 26, 1);
  merlons(ctx, -11, 11, -44, 6, '#9a8a6a');
  box(ctx, 'rgba(0,0,0,0.25)', 7, -40, 4, 32);
  // the niche, blackened with old smoke
  box(ctx, '#1a140e', -7, -34, 14, 22);
  box(ctx, 'rgba(20,14,8,0.6)', -6, -42, 12, 8);
  // the figure, its face worn away
  ctx.beginPath();
  ctx.moveTo(-3, -12);
  ctx.lineTo(-2, -24);
  ctx.lineTo(2, -24);
  ctx.lineTo(3, -12);
  ctx.closePath();
  ctx.moveTo(2.5, -26);
  ctx.arc(0, -26, 2.5, 0, TAU);
  ctx.moveTo(-2, -28);
  ctx.lineTo(0, -32);
  ctx.lineTo(2, -28);
  solidify(ctx, '#5a5040', OUT, 0.5);
  // bowls and a burnt-out censer on the step, rags tied to a stake
  ellipse(ctx, -10, -9, 3, 1.4, 0, '#7a5a3a');
  ellipse(ctx, 10, -9, 3, 1.4, 0, '#6a4a30');
  box(ctx, '#3a2a1a', 9, -11, 2, 2);
  box(ctx, '#4a3a28', 20, -24, 2, 24);
  box(ctx, '#8a3a2a', 22, -22, 4, 2);
  box(ctx, '#c8b48a', 22, -18, 3, 2);
  box(ctx, '#3a4a6a', 22, -14, 4, 1);
  if (rng.chance(0.5)) box(ctx, '#e8dcb8', 21, -10, 3, 1);
};

// ---------------------------------------------------------------- props: Shushan the palace

const WALL_BRICK = ['#b89a6a', '#a88a5a', '#c4a676', '#ae9262'] as const;
const ARCHER_ROBE = ['#e8d8a8', '#c89a3a', '#e4e6dc'] as const;
const ARCHER_DOT = ['#7a5a2a', '#5a3a14', '#3a5a7a'] as const;

/** One of the Immortals in glazed relief, spear upright, bow on the shoulder; feet on y, facing +x. */
function archer(ctx: Ctx, x: number, y: number, dir: number, v: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  // the spear, taller than the man, its silver head and gold counterweight
  box(ctx, '#3a2410', 6, -37, 1, 37);
  ctx.fillStyle = '#e0e0d8';
  ctx.beginPath();
  ctx.moveTo(5, -37);
  ctx.lineTo(6.5, -42);
  ctx.lineTo(8, -37);
  ctx.fill();
  box(ctx, GOLD, 5, -2, 3, 2);
  // quiver and bow on the back
  box(ctx, OUT, -8, -27, 5, 16);
  box(ctx, GOLD, -7, -26, 3, 14);
  box(ctx, GOLD_HI, -7, -26, 1, 14);
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-3, -21, 9, Math.PI * 0.62, Math.PI * 1.45);
  ctx.stroke();
  // the robe
  ctx.beginPath();
  ctx.moveTo(-4, -24);
  ctx.lineTo(4, -24);
  ctx.lineTo(5, -2);
  ctx.lineTo(-6, -2);
  ctx.closePath();
  ctx.moveTo(4.5, -28);
  ctx.arc(1, -28, 3.5, 0, TAU);
  solidify(ctx, ARCHER_ROBE[v], OUT, 0.5);
  ctx.fillStyle = ARCHER_DOT[v];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) ctx.fillRect(-3 + c * 3 + (r & 1), -21 + r * 4, 1, 1);
  box(ctx, ARCHER_DOT[v], -5, -5, 10, 1);
  // the face, dark; beard, hair and the twisted headband
  box(ctx, '#4a2e1a', -1, -31, 5, 6);
  box(ctx, '#101828', 1, -27, 3, 4);
  box(ctx, '#101828', -3, -31, 3, 6);
  box(ctx, TURQ_HI, -2, -31, 6, 1);
  box(ctx, '#f0e8d8', 3, -29, 1, 1);
  // the forearm forward, gripping the spear; the shoes
  box(ctx, '#4a2e1a', 1, -19, 5, 2);
  box(ctx, '#c8a040', -4, -2, 4, 2);
  box(ctx, '#c8a040', 1, -2, 4, 2);
  ctx.restore();
}

const shushanWall: PropFn = (ctx, e) => {
  // The palace wall of Shushan in glazed brick: the archers of the King's guard in procession
  // toward the gate, rosettes over them, towers and stepped battlements against the sky.
  const W = (e.w ?? 60) * TILE, H = (e.h ?? 16) * TILE, hw = W / 2;
  const GW = 46, GT = -150;
  const [vx0, , vx1] = localView(ctx);
  ctx.fillStyle = WALL_BRICK[1];
  ctx.fillRect(-hw, -H, W, H);
  // towers at the ends and either side of the gate stand a little higher
  const towers = [-hw, -hw + 220, -GW - 50, GW, hw - 268, hw - 48];
  for (const tx of towers) ctx.fillRect(tx, -H - 30, 48, 30);
  brickField(ctx, -hw, -H, hw, 0, 16, 8, WALL_BRICK, 671, 'rgba(60,40,20,0.45)', 1);
  for (const tx of towers) {
    brickField(ctx, tx, -H - 30, tx + 48, -H, 16, 8, WALL_BRICK, 673, 'rgba(60,40,20,0.45)', 1);
    merlons(ctx, tx, tx + 48, -H - 30, 10, WALL_BRICK[3]);
    box(ctx, 'rgba(255,240,210,0.25)', tx, -H - 30, 2, H + 30);
    box(ctx, 'rgba(0,0,0,0.2)', tx + 46, -H - 30, 2, H + 30);
    box(ctx, TURQ, tx, -H - 16, 48, 4);
    box(ctx, GOLD, tx, -H - 16, 48, 1);
  }
  merlons(ctx, -hw, hw, -H, 12, WALL_BRICK[3]);
  box(ctx, 'rgba(255,240,210,0.3)', -hw, -H, W, 1);
  // the frieze of archers on a blue ground, rosettes above and below
  const fy = -H + 70, fh = 48;
  for (let side = 0; side < 2; side++) {
    const x0 = side ? GW + 14 : -hw + 6, x1 = side ? hw - 6 : -GW - 14;
    if (x1 < vx0 - 20 || x0 > vx1 + 20) continue;
    box(ctx, GOLD_DK, x0 - 2, fy - 2, x1 - x0 + 4, fh + 4);
    box(ctx, LAPIS, x0, fy, x1 - x0, fh);
    box(ctx, '#2a5294', x0, fy, x1 - x0, 1);
    rosetteBandCh6(ctx, x0, x1, fy - 14, 12, vx0, vx1);
    rosetteBandCh6(ctx, x0, x1, fy + fh + 2, 10, vx0, vx1);
    let i = 0;
    for (let ax = x0 + 12; ax < x1 - 6; ax += 22, i++) {
      if (ax < vx0 - 30 || ax > vx1 + 30) continue;
      archer(ctx, ax, fy + fh - 3, side ? -1 : 1, i % 3);
    }
  }
  // turquoise glazed courses lower down
  box(ctx, TURQ, -hw, -44, W, 6);
  box(ctx, GOLD, -hw, -44, W, 1);
  box(ctx, TURQ_HI, -hw, -43, W, 1);
  // the shade at the foot of the wall
  box(ctx, 'rgba(0,0,0,0.25)', -hw, -14, W, 14);
  // the gate: a glazed arch moulding round a deep passage, bronze leaves folded back
  ctx.beginPath();
  ctx.moveTo(-GW - 10, 0);
  ctx.lineTo(-GW - 10, GT);
  ctx.arc(0, GT, GW + 10, Math.PI, 0);
  ctx.lineTo(GW + 10, 0);
  ctx.closePath();
  ctx.fillStyle = GOLD_DK;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-GW - 7, 0);
  ctx.lineTo(-GW - 7, GT);
  ctx.arc(0, GT, GW + 7, Math.PI, 0);
  ctx.lineTo(GW + 7, 0);
  ctx.closePath();
  ctx.fillStyle = TURQ;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-GW, 0);
  ctx.lineTo(-GW, GT);
  ctx.arc(0, GT, GW, Math.PI, 0);
  ctx.lineTo(GW, 0);
  ctx.closePath();
  ctx.fillStyle = '#120c0a';
  ctx.fill();
  ctx.fillStyle = '#e8e0c8';
  for (let a = 0; a <= 12; a++) {
    const ang = Math.PI + (a / 12) * Math.PI;
    ctx.fillRect(Math.round(Math.cos(ang) * (GW + 4)) - 1, Math.round(GT + Math.sin(ang) * (GW + 4)) - 1, 2, 2);
  }
  // light at the far end of the passage: the courtyard beyond
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffb060', 0, -20, GW * 0.9, 40, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  box(ctx, '#2a1a10', -GW * 0.5, -60, GW, 60);
  box(ctx, 'rgba(255,190,110,0.35)', -GW * 0.5, -60, GW, 60);
  for (const s of [-1, 1]) {
    const lx = s < 0 ? -GW : GW - 12;
    ctx.beginPath();
    ctx.rect(lx, GT + 10, 12, -GT - 10);
    solidify(ctx, '#6a4a22', OUT, 0.5);
    box(ctx, s < 0 ? '#9a7a3a' : '#4a3214', lx + (s < 0 ? 0 : 10), GT + 10, 2, -GT - 10);
    ctx.fillStyle = GOLD;
    for (let y = GT + 18; y < -6; y += 14) {
      ctx.fillRect(lx + 3, y, 2, 2);
      ctx.fillRect(lx + 7, y, 2, 2);
    }
  }
};

/** A band of white-and-gold rosettes on dark blue, clipped to the view. */
function rosetteBandCh6(ctx: Ctx, x0: number, x1: number, y: number, hgt: number, vx0: number, vx1: number) {
  box(ctx, '#0e2246', x0, y, x1 - x0, hgt);
  box(ctx, GOLD, x0, y, x1 - x0, 1);
  box(ctx, GOLD, x0, y + hgt - 1, x1 - x0, 1);
  const r = hgt * 0.36, step = hgt * 1.2;
  for (let x = x0 + step / 2; x < x1; x += step) if (x > vx0 - 8 && x < vx1 + 8) rosette(ctx, Math.round(x), y + hgt / 2, r);
}

const LAMASSU = '#c8b48a', LAMASSU_DK = '#6a5a3e', LAMASSU_LIT = '#ece0c0';

const wingedBull: PropFn = (ctx) => {
  // A guardian bull of the gate: a bull's body striding on its plinth, great wings swept up behind,
  // a bearded man's head under a tall horned crown. Carved stone, not a god.
  ctx.beginPath();
  ctx.rect(-48, -10, 96, 10);
  solidify(ctx, '#8a7a5c', OUT, 0.5);
  box(ctx, LAMASSU_LIT, -48, -10, 96, 1);
  box(ctx, 'rgba(0,0,0,0.3)', -48, -3, 96, 3);
  // the wing, behind the body, feathers in rows sweeping up and back
  ctx.beginPath();
  ctx.moveTo(18, -60);
  ctx.quadraticCurveTo(-6, -88, -44, -104);
  ctx.lineTo(-48, -96);
  ctx.quadraticCurveTo(-40, -66, -26, -50);
  ctx.closePath();
  solidify(ctx, LAMASSU, OUT, 0.5);
  ctx.fillStyle = LAMASSU_DK;
  for (let r = 0; r < 6; r++) {
    const u = r / 6;
    ctx.fillRect(Math.round(-42 + u * 22), Math.round(-98 + u * 40), Math.round(30 + u * 22), 1);
  }
  for (let i = 0; i < 6; i++) ctx.fillRect(-44 + i * 4, -97 + i * 3, 1, 34 - i * 3);
  box(ctx, LAMASSU_LIT, -44, -104, 6, 2);
  // the body and five legs
  ctx.beginPath();
  ctx.ellipse(-4, -46, 34, 16, 0, 0, TAU);
  ctx.moveTo(38, -50);
  ctx.ellipse(26, -50, 12, 18, 0, 0, TAU);
  ctx.rect(-36, -46, 9, 36);
  ctx.rect(-22, -40, 8, 30);
  ctx.rect(18, -42, 9, 32);
  ctx.rect(30, -42, 9, 32);
  ctx.rect(26, -40, 8, 30);
  solidify(ctx, LAMASSU, OUT, 0.5);
  // hooves, the belly's shade, curls of hair along flank and chest
  ctx.fillStyle = LAMASSU_DK;
  for (const lx of [-36, -22, 18, 30]) ctx.fillRect(lx, -14, 9, 4);
  box(ctx, 'rgba(60,44,24,0.35)', -34, -36, 60, 6);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) ctx.fillRect(-30 + c * 8 + (r & 1) * 4, -58 + r * 5, 2, 2);
  for (let r = 0; r < 4; r++) ctx.fillRect(30 + (r & 1) * 3, -60 + r * 6, 3, 2);
  box(ctx, LAMASSU_LIT, -30, -61, 50, 1);
  // the tail, ending in a tuft
  box(ctx, LAMASSU_DK, -40, -48, 2, 26);
  box(ctx, LAMASSU_DK, -42, -24, 5, 5);
  // the head: beard in tiers of curls, the face, the crown with its horns
  ctx.beginPath();
  ctx.rect(26, -82, 14, 16);
  ctx.rect(24, -68, 16, 16);
  ctx.rect(26, -98, 14, 16);
  solidify(ctx, LAMASSU, OUT, 0.5);
  ctx.fillStyle = LAMASSU_DK;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) ctx.fillRect(25 + c * 4, -66 + r * 4, 2, 2);
  box(ctx, LAMASSU_LIT, 38, -80, 3, 12);
  box(ctx, OUT, 36, -76, 2, 1);
  box(ctx, LAMASSU_DK, 39, -72, 2, 1);
  box(ctx, LAMASSU_DK, 26, -96, 14, 1);
  box(ctx, LAMASSU_DK, 26, -90, 14, 1);
  box(ctx, LAMASSU_DK, 26, -86, 14, 1);
  box(ctx, LAMASSU_LIT, 26, -98, 14, 1);
  // the horns wrapped round the crown's foot
  box(ctx, LAMASSU_DK, 24, -84, 18, 2);
  box(ctx, LAMASSU_DK, 40, -88, 3, 4);
  // the shade side
  box(ctx, 'rgba(0,0,0,0.18)', -38, -60, 6, 50);
};

const persianBanner: PropFn = (ctx, e) => {
  // The standard's rod and finials; the cloth is drawn live. Near a ceiling it hangs on cords,
  // in the open it stands on a pole that runs down out of sight behind the ground.
  const hang = e.y <= 3;
  if (hang) {
    box(ctx, '#3a2a18', -7, 0, 1, 8);
    box(ctx, '#3a2a18', 6, 0, 1, 8);
  } else {
    ctx.beginPath();
    ctx.rect(-1, -14, 3, 30 * TILE);
    solidify(ctx, '#4a3018', OUT, 0.5);
    box(ctx, '#7a5430', -1, -14, 1, 30 * TILE);
    circle(ctx, 0.5, -16, 3, GOLD);
    box(ctx, GOLD_HI, -1, -18, 2, 1);
  }
  const cy = hang ? 8 : 0;
  ctx.beginPath();
  ctx.rect(-12, cy - 2, 25, 3);
  solidify(ctx, GOLD_DK, OUT, 0.5);
  box(ctx, GOLD, -12, cy - 2, 25, 1);
  circle(ctx, -13, cy - 0.5, 2, GOLD);
  circle(ctx, 14, cy - 0.5, 2, GOLD);
};

const COL = '#a89470', COL_LIT = '#d0bc94', COL_DK = '#5a4a34';

/** A double-bull capital: two kneeling bulls back to back, a beam seat between their necks. */
function bullCapital(ctx: Ctx, y: number) {
  ctx.beginPath();
  ctx.rect(-26, y, 52, 12);
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 34 + 7, y + 4);
    ctx.ellipse(s * 34, y + 4, 9, 7, 0, 0, TAU);
    ctx.rect(s > 0 ? 34 : -40, y + 8, 6, 12);
    ctx.rect(s > 0 ? 24 : -30, y + 10, 6, 10);
  }
  solidify(ctx, COL, OUT, 0.5);
  ctx.fillStyle = COL_DK;
  for (const s of [-1, 1]) {
    // horn, ear, eye, the folded forelegs
    ctx.fillRect(s > 0 ? 34 : -40, y - 6, 6, 3);
    ctx.fillRect(s > 0 ? 38 : -41, y - 9, 3, 4);
    ctx.fillRect(s > 0 ? 37 : -39, y + 1, 2, 2);
    ctx.fillRect(s > 0 ? 26 : -32, y + 18, 16, 2);
    for (let r = 0; r < 3; r++) ctx.fillRect(s > 0 ? 18 + r * 3 : -21 - r * 3, y + 2 + r * 3, 2, 2);
  }
  box(ctx, COL_LIT, -26, y, 52, 1);
  box(ctx, COL_DK, -26, y + 11, 52, 1);
  // the saddle where the roof beam rests
  box(ctx, '#4a2a14', -10, y - 4, 20, 4);
}

const bullColumn: PropFn = (ctx, e) => {
  // A column of the Apadana: bell base, fluted shaft, scrolls, then the double bull holding the roof.
  const H = (e.h ?? 24) * TILE;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.quadraticCurveTo(-16, -12, -11, -16);
  ctx.lineTo(11, -16);
  ctx.quadraticCurveTo(16, -12, 18, 0);
  ctx.closePath();
  ctx.rect(-13, -20, 26, 4);
  ctx.rect(-9, -H + 52, 18, H - 72);
  ctx.rect(-13, -H + 34, 26, 18);
  solidify(ctx, COL, OUT, 0.5);
  // the bell's petals
  ctx.fillStyle = COL_DK;
  for (let i = -14; i <= 14; i += 4) ctx.fillRect(i, -10, 1, 9);
  box(ctx, COL_LIT, -13, -20, 26, 1);
  // flutes
  ctx.fillStyle = COL_DK;
  for (let x = -7; x <= 7; x += 3) ctx.fillRect(x, -H + 54, 1, H - 76);
  box(ctx, COL_LIT, -9, -H + 52, 2, H - 72);
  box(ctx, 'rgba(0,0,0,0.25)', 6, -H + 52, 3, H - 72);
  // the scrolls: paired volutes stacked under the bulls
  for (const s of [-1, 1]) {
    ctx.strokeStyle = COL_DK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s * 10, -H + 42, 4, 0, TAU);
    ctx.stroke();
  }
  box(ctx, COL_DK, -13, -H + 34, 26, 1);
  box(ctx, GOLD, -13, -H + 51, 26, 1);
  bullCapital(ctx, -H + 14);
};

const tributeRelief: PropFn = (ctx, e, pal, rng) => {
  // The peoples of the empire bringing gifts: bearers with vessels and bowls, led animals,
  // each delegation parted from the next by a cypress, all in pale relief.
  const W = (e.w ?? 80) * TILE, H = (e.h ?? 6) * TILE, hw = W / 2;
  const [vx0, , vx1] = localView(ctx);
  const x0 = Math.max(-hw, vx0 - 40), x1 = Math.min(hw, vx1 + 40);
  if (x0 >= x1) return;
  box(ctx, OUT, x0, -H - 1, x1 - x0, H + 2);
  box(ctx, '#8a7656', x0, -H, x1 - x0, H);
  box(ctx, '#a8946c', x0, -H, x1 - x0, 10);
  box(ctx, '#a8946c', x0, -10, x1 - x0, 10);
  box(ctx, COL_DK, x0, -H + 10, x1 - x0, 1);
  box(ctx, COL_DK, x0, -11, x1 - x0, 1);
  for (let x = Math.ceil((x0 + hw) / 12) * 12 - hw; x < x1; x += 12) {
    circle(ctx, x + 6, -H + 5, 3, '#c8b48a');
    circle(ctx, x + 6, -5, 3, '#c8b48a');
    box(ctx, GOLD_DK, x + 5, -H + 4, 2, 2);
    box(ctx, GOLD_DK, x + 5, -6, 2, 2);
  }
  // the procession, in 30-unit steps across the band
  const base = -12;
  const s0 = Math.floor((x0 + hw) / 30) - 1, s1 = Math.ceil((x1 + hw) / 30) + 1;
  for (let s = Math.max(0, s0); s <= s1; s++) {
    const x = -hw + 15 + s * 30;
    if (x > hw - 10) break;
    const kind = s % 6;
    if (kind === 0) reliefCypress(ctx, x, base, H - 24);
    else if (kind === 4) reliefAnimal(ctx, x, base, s % 12 === 4 ? 0 : 1);
    else reliefBearer(ctx, x, base, kind, s);
  }
};

const RELIEF = '#c0aa82', RELIEF_DK = '#4a3a24', RELIEF_LIT = '#e0cca4';

function reliefCypress(ctx: Ctx, x: number, y: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + 7, y - h * 0.5, x + 4, y - 4);
  ctx.lineTo(x - 4, y - 4);
  ctx.quadraticCurveTo(x - 7, y - h * 0.5, x, y - h);
  ctx.rect(x - 1, y - 4, 2, 4);
  solidify(ctx, RELIEF, RELIEF_DK, 0.5);
  ctx.fillStyle = RELIEF_DK;
  for (let yy = y - h + 8; yy < y - 6; yy += 5) ctx.fillRect(x - 3, yy, 6, 1);
}

/** A tribute-bearer walking right; kind picks the gift and the hat. */
function reliefBearer(ctx: Ctx, x: number, y: number, kind: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 30);
  ctx.lineTo(x + 4, y - 30);
  ctx.lineTo(x + 7, y - 2);
  ctx.lineTo(x - 7, y - 2);
  ctx.closePath();
  ctx.moveTo(x + 3.5, y - 34);
  ctx.arc(x, y - 34, 3.5, 0, TAU);
  ctx.rect(x - 5, y - 2, 4, 2);
  ctx.rect(x + 1, y - 2, 5, 2);
  solidify(ctx, RELIEF, RELIEF_DK, 0.5);
  box(ctx, RELIEF_LIT, x - 5, y - 29, 1, 26);
  box(ctx, RELIEF_DK, x + 2, y - 33, 2, 4);
  // hats: felt cap, hood, or a tall tiara
  if (s % 3 === 0) box(ctx, RELIEF_DK, x - 4, y - 39, 7, 2);
  else if (s % 3 === 1) {
    box(ctx, RELIEF, x - 4, y - 41, 6, 4);
    box(ctx, RELIEF_DK, x - 4, y - 37, 7, 1);
  } else box(ctx, RELIEF_DK, x - 4, y - 38, 1, 6);
  // the gift held out before him
  if (kind === 1) {
    jar(ctx, x + 9, y - 18, 4, 11, RELIEF, null);
    box(ctx, RELIEF, x + 2, y - 22, 6, 2);
  } else if (kind === 2) {
    box(ctx, RELIEF, x + 2, y - 22, 7, 2);
    ellipse(ctx, x + 10, y - 24, 5, 2, 0, RELIEF_LIT);
    box(ctx, RELIEF_DK, x + 5, y - 23, 10, 1);
    ellipse(ctx, x + 10, y - 26, 3, 1.5, 0, RELIEF_LIT);
  } else {
    // a folded garment over the arms
    ctx.beginPath();
    ctx.rect(x + 2, y - 24, 10, 6);
    solidify(ctx, RELIEF_LIT, RELIEF_DK, 0.5);
    box(ctx, RELIEF_DK, x + 2, y - 21, 10, 1);
  }
}

/** A led animal: a ram with a curled horn, or a humped bull. */
function reliefAnimal(ctx: Ctx, x: number, y: number, kind: number) {
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 11, 6, 0, 0, TAU);
  ctx.rect(x - 9, y - 12, 3, 12);
  ctx.rect(x - 4, y - 12, 3, 12);
  ctx.rect(x + 4, y - 12, 3, 12);
  ctx.rect(x + 8, y - 12, 3, 12);
  ctx.moveTo(x + 18, y - 20);
  ctx.ellipse(x + 14, y - 20, 4.5, 3.5, 0.3, 0, TAU);
  if (kind === 1) {
    ctx.moveTo(x + 4, y - 20);
    ctx.ellipse(x - 1, y - 20, 5, 4, 0, 0, TAU);
  }
  solidify(ctx, RELIEF, RELIEF_DK, 0.5);
  if (kind === 0) {
    ctx.strokeStyle = RELIEF_DK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x + 12, y - 21, 3, Math.PI * 0.9, Math.PI * 2.4);
    ctx.stroke();
    ctx.fillStyle = RELIEF_DK;
    for (let i = -8; i <= 6; i += 3) ctx.fillRect(x + i, y - 17 + ((i / 3) & 1), 2, 1);
  } else box(ctx, RELIEF_DK, x + 12, y - 25, 4, 1);
  box(ctx, RELIEF_LIT, x - 8, y - 20, 14, 1);
}

const STORM_BRICK = ['#3a3a48', '#34343f', '#42424f', '#2e2e38'] as const;

const zigguratSummit: PropFn = (ctx, e) => {
  // The top terraces of the high place, wet with rain, a stair up the middle.
  const W = (e.w ?? 70) * TILE, H = (e.h ?? 10) * TILE, hw = W / 2;
  const tiers = [[hw, H * 0.4], [hw * 0.74, H * 0.7], [hw * 0.5, H]] as const;
  for (let i = 0; i < 3; i++) {
    const [w, top] = tiers[i], y0 = i ? -tiers[i - 1][1] : 0;
    ctx.fillStyle = STORM_BRICK[0];
    ctx.fillRect(-w, -top, w * 2, top + y0);
    brickField(ctx, -w, -top, w, y0, 16, 8, STORM_BRICK, 691 + i, 'rgba(8,8,14,0.6)', 1);
    // a glazed course at each terrace's lip, the rain shining on it
    box(ctx, LAPIS, -w, -top, w * 2, 5);
    box(ctx, GOLD_DK, -w, -top + 5, w * 2, 1);
    box(ctx, 'rgba(160,190,255,0.3)', -w, -top, w * 2, 1);
    box(ctx, 'rgba(160,190,255,0.18)', -w, -top, 2, top + y0);
    box(ctx, 'rgba(0,0,0,0.35)', w - 3, -top, 3, top + y0);
    merlons(ctx, -w, w, -top, 8, STORM_BRICK[3]);
  }
  // the stair
  const sw = 34;
  box(ctx, '#4a4a58', -sw, -H, sw * 2, H);
  ctx.fillStyle = '#26262e';
  for (let y = -H + 4; y < 0; y += 5) ctx.fillRect(-sw, y, sw * 2, 1);
  box(ctx, 'rgba(160,190,255,0.25)', -sw, -H, 1, H);
  box(ctx, 'rgba(0,0,0,0.35)', sw - 2, -H, 2, H);
  // streaks of rain running down
  ctx.fillStyle = 'rgba(150,170,220,0.12)';
  for (let x = -hw + 7; x < hw; x += 23) ctx.fillRect(x, -H * 0.4 + ((x * 7) & 15), 1, 30);
};

const stormAltar: PropFn = (ctx, e) => {
  // The altar on the summit, horned at its corners, and the great bronze wheel standing behind it.
  const W = (e.w ?? 10) * TILE, hw = W / 2;
  // the wheel
  const wy = -82, R = 36;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, wy, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#6a5a2e';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,180,160,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, wy, R + 1, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.strokeStyle = '#4a3e20';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    ctx.moveTo(Math.cos(a) * 6, wy + Math.sin(a) * 6);
    ctx.lineTo(Math.cos(a) * (R - 2), wy + Math.sin(a) * (R - 2));
  }
  ctx.stroke();
  circle(ctx, 0, wy, 7, '#6a5a2e');
  circle(ctx, 0, wy, 3, OUT);
  box(ctx, 'rgba(170,200,255,0.4)', -R, wy - 1, 4, 1);
  // its stand
  ctx.beginPath();
  ctx.rect(-4, wy + R - 4, 8, -wy - R - 8);
  solidify(ctx, '#3a3020', OUT, 0.5);
  // the steps and the altar block
  ctx.beginPath();
  ctx.rect(-hw, -6, W, 6);
  ctx.rect(-hw + 14, -12, W - 28, 6);
  ctx.rect(-26, -36, 52, 24);
  ctx.moveTo(-26, -36);
  ctx.lineTo(-26, -44);
  ctx.lineTo(-18, -36);
  ctx.moveTo(26, -36);
  ctx.lineTo(18, -36);
  ctx.lineTo(26, -44);
  solidify(ctx, '#2c2c36', OUT, 0.5);
  box(ctx, 'rgba(160,190,255,0.35)', -hw, -6, W, 1);
  box(ctx, 'rgba(160,190,255,0.35)', -hw + 14, -12, W - 28, 1);
  box(ctx, 'rgba(160,190,255,0.3)', -26, -36, 52, 1);
  box(ctx, LAPIS, -22, -30, 44, 4);
  box(ctx, GOLD_DK, -22, -26, 44, 1);
  box(ctx, 'rgba(0,0,0,0.35)', 22, -36, 4, 24);
  // scorch where the lightning has struck it
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#6a8ad8', 0, -38, 20, 6, 0.3);
  ctx.globalCompositeOperation = 'source-over';
};

// ---------------------------------------------------------------- props: the marsh and the high places

const deadTree: PropFn = (ctx, e, pal, rng) => {
  // A tamarisk killed by salt, bleached grey, its branches bare against the sky.
  const BARK = '#6a6258', BARK_DK = '#3a342c', BARK_LIT = '#a8a090';
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(-3, -24);
  ctx.lineTo(-6, -40);
  ctx.lineTo(-2, -40);
  ctx.lineTo(1, -26);
  ctx.lineTo(3, -36);
  ctx.lineTo(6, -35);
  ctx.lineTo(3, -22);
  ctx.lineTo(5, 0);
  ctx.closePath();
  solidify(ctx, BARK, OUT, 0.5);
  box(ctx, BARK_LIT, -3, -22, 1, 21);
  box(ctx, BARK_DK, 2, -20, 1, 20);
  // bare limbs, a crook at each end
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const limbs = [[-4, -38, -16, -50, -20, -49], [-3, -30, -14, -34, -18, -40], [4, -34, 14, -48, 18, -47], [3, -26, 12, -28, 15, -33], [-1, -40, 0, -54, 3, -57]];
  for (const [x0, y0, x1, y1, x2, y2] of limbs) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.strokeStyle = BARK;
  ctx.lineWidth = 1;
  for (const [x0, y0, x1, y1, x2, y2] of limbs) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // roots and a ring of salt crust
  box(ctx, BARK_DK, -9, -1, 4, 1);
  box(ctx, BARK_DK, 5, -1, 5, 1);
  box(ctx, '#d8d4c4', -11, 0, 22, 1);
  if (rng.chance(0.5)) box(ctx, '#2e323c', 12, -47, 3, 2);
  void pal; void e;
};

const RIFT = '#fff1c4', RIFT_HOT = '#fffaf0', RIFT_DEEP = '#c8945a';

const heavenRift: PropFn = (ctx, e, pal, rng) => {
  // The heavens opened behind the high places: a vertical tear of gold-white light,
  // shafts falling from it, and faint stairs of light climbing toward it.
  const W = (e.w ?? 96) * TILE, H = (e.h ?? 30) * TILE;
  const top = -H;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, RIFT_DEEP, 0, top + H * 0.32, W * 0.34, H * 0.42, 0.35);
  blob(ctx, RIFT, 0, top + H * 0.3, W * 0.16, H * 0.3, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  // the tear itself, ragged-edged
  ctx.beginPath();
  ctx.moveTo(0, top + 6);
  for (let i = 1; i <= 12; i++) ctx.lineTo(Math.round(((i & 1) ? 9 : 4) + rng.range(-2, 2) + i * 0.8), Math.round(top + 6 + i * H * 0.05));
  for (let i = 12; i >= 1; i--) ctx.lineTo(Math.round(-((i & 1) ? 4 : 9) - rng.range(-2, 2) - i * 0.6), Math.round(top + 6 + i * H * 0.05));
  ctx.closePath();
  ctx.fillStyle = RIFT;
  ctx.fill();
  box(ctx, RIFT_HOT, -2, top + 10, 4, Math.round(H * 0.56));
  // shafts of light falling out of it
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = RIFT;
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    ctx.beginPath();
    ctx.moveTo(i * 3, top + H * 0.3);
    ctx.lineTo(i * 3 + 2, top + H * 0.3);
    ctx.lineTo(i * W * 0.11 + 14, 0);
    ctx.lineTo(i * W * 0.11 - 14, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // stairs of light climbing toward the tear
  for (let s = 0; s < 9; s++) {
    const y = Math.round(-H * 0.28 - s * 14), x = Math.round(-W * 0.2 + s * 9);
    box(ctx, 'rgba(255,241,196,0.32)', x, y, 22, 2);
    box(ctx, 'rgba(255,250,240,0.55)', x, y, 22, 1);
  }
  // motes drifting in the light
  for (let i = 0; i < 40; i++) box(ctx, 'rgba(255,240,200,0.6)', Math.round(rng.range(-W * 0.3, W * 0.3)), Math.round(rng.range(top, 0)), 1, 1);
  void pal;
};

const throneProp: PropFn = (ctx, e) => {
  // The throne of the prince of Persia, set on clouds: a high back of beaten gold with a winged disc
  // at its crown, lions on its arms, six steps up to it. It is empty when he stands to fight.
  const W = (e.w ?? 16) * TILE, H = (e.h ?? 14) * TILE, hw = W / 2;
  // steps
  for (let s = 0; s < 6; s++) {
    const sw = W - s * 14, y = -s * 6;
    ctx.beginPath();
    ctx.rect(-sw / 2, y - 6, sw, 6);
    solidify(ctx, s & 1 ? '#d8ccb0' : '#e8dcc0', OUT, 0.5);
    box(ctx, '#fff6e0', -sw / 2, y - 6, sw, 1);
    box(ctx, GOLD_DK, -sw / 2, y - 1, sw, 1);
  }
  const base = -36;
  // the high back
  ctx.beginPath();
  ctx.moveTo(-26, base);
  ctx.lineTo(-26, base - H * 0.62);
  ctx.quadraticCurveTo(0, base - H * 0.86, 26, base - H * 0.62);
  ctx.lineTo(26, base);
  ctx.closePath();
  solidify(ctx, GOLD, OUT, 0.6);
  box(ctx, GOLD_HI, -24, Math.round(base - H * 0.6), 3, Math.round(H * 0.58));
  box(ctx, GOLD_DK, 20, Math.round(base - H * 0.6), 4, Math.round(H * 0.6));
  // inset panel of lapis with a gold rosette
  ctx.beginPath();
  ctx.rect(-16, Math.round(base - H * 0.56), 32, Math.round(H * 0.42));
  solidify(ctx, LAPIS, OUT, 0.5);
  box(ctx, TURQ, -16, Math.round(base - H * 0.56), 32, 1);
  rosette(ctx, 0, Math.round(base - H * 0.38), 6);
  // seat, arms and their lions
  ctx.beginPath();
  ctx.rect(-30, base - 14, 60, 14);
  solidify(ctx, '#b8862e', OUT, 0.5);
  box(ctx, GOLD_HI, -30, base - 14, 60, 1);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.rect(sx * 30 - (sx > 0 ? 8 : 0), base - 28, 8, 28);
    solidify(ctx, GOLD, OUT, 0.5);
    // a couchant lion's head on the arm
    ctx.beginPath();
    ctx.ellipse(sx * 34, base - 30, 6, 5, 0, 0, TAU);
    solidify(ctx, GOLD, OUT, 0.5);
    box(ctx, GOLD_DK, sx * 34 - 3, base - 31, 6, 1);
    box(ctx, OUT, sx * 34 + sx * 2, base - 31, 1, 1);
  }
  // purple cushion
  box(ctx, '#3a1440', -26, base - 18, 52, 4);
  box(ctx, '#5a2a66', -26, base - 18, 52, 1);
  void hw;
};

const wingedDisc: PropFn = (ctx, e) => {
  // A winged sun-disc hung high over the throne: the emblem of a kingdom, gilded and cold.
  const W = (e.w ?? 22) * TILE, hw = W / 2;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * 8, -4);
    ctx.lineTo(sx * hw, -10);
    ctx.lineTo(sx * (hw - 6), -2);
    ctx.lineTo(sx * hw * 0.9, 2);
    ctx.lineTo(sx * (hw * 0.9 - 8), 6);
    ctx.lineTo(sx * hw * 0.7, 9);
    ctx.lineTo(sx * 8, 6);
    ctx.closePath();
    solidify(ctx, GOLD, OUT, 0.5);
    ctx.fillStyle = GOLD_DK;
    for (let r = 0; r < 3; r++) ctx.fillRect(Math.min(sx * 10, sx * (hw - 10)), -3 + r * 4, Math.abs(hw - 20), 1);
    box(ctx, GOLD_HI, Math.min(sx * 10, sx * (hw - 4)), -6, Math.abs(hw - 14), 1);
  }
  // the tail feathers below and the disc
  ctx.beginPath();
  ctx.moveTo(-6, 6);
  ctx.lineTo(6, 6);
  ctx.lineTo(3, 18);
  ctx.lineTo(-3, 18);
  ctx.closePath();
  solidify(ctx, GOLD, OUT, 0.5);
  box(ctx, GOLD_DK, -1, 7, 1, 10);
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, TAU);
  solidify(ctx, '#e8b84a', OUT, 0.5);
  circle(ctx, 0, 0, 5, GOLD_HI);
  box(ctx, '#fffaf0', -2, -3, 2, 2);
};

const BOUNDS: Record<string, (e: Decor) => [number, number, number, number]> = {
  heaven_rift: (e) => { const W = (e.w ?? 96) * TILE, H = (e.h ?? 30) * TILE; return [-W / 2, -H - 10, W / 2, 4]; },
  shushan_wall: (e) => { const W = (e.w ?? 60) * TILE, H = (e.h ?? 16) * TILE; return [-W / 2 - 10, -H - 30, W / 2 + 10, 4]; },
  tribute_relief: (e) => { const W = (e.w ?? 80) * TILE, H = (e.h ?? 6) * TILE; return [-W / 2 - 4, -H - 4, W / 2 + 4, 4]; },
  ziggurat_summit: (e) => { const W = (e.w ?? 70) * TILE, H = (e.h ?? 10) * TILE; return [-W / 2 - 4, -H - 40, W / 2 + 4, 4]; },
  river_bank: (e) => { const W = (e.w ?? 24) * TILE; return [-W / 2 - 4, -40, W / 2 + 40, 30]; },
};

const PROPS: Record<string, PropFn> = {
  river_bank: riverBank,
  prayer_mat: prayerMat,
  marsh_heron: marshHeron,
  dead_tree: deadTree,
  stone_marker: stoneMarker,
  royal_milestone: royalMilestone,
  waystation,
  caravan,
  foreign_shrine: foreignShrine,
  shushan_wall: shushanWall,
  winged_bull: wingedBull,
  persian_banner: persianBanner,
  bull_column: bullColumn,
  tribute_relief: tributeRelief,
  ziggurat_summit: zigguratSummit,
  storm_altar: stormAltar,
  heaven_rift: heavenRift,
  broken_chain: () => {},
  cloud_bank: () => {},
  prince_throne: throneProp,
  winged_disc: wingedDisc,
};

/** Decor baked before the rest of a chunk's props, so columns, bulls and people stand in front of it. */
export const BACKDROP_CH6: ReadonlySet<string> = new Set(['shushan_wall', 'tribute_relief', 'ziggurat_summit', 'heaven_rift', 'river_bank']);

/** Chapter VI props. Returns false for kinds it does not know. */
export function drawPropCh6(ctx: Ctx, e: Decor, pal: BiomePal, seed: number): boolean {
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

/** Decor that moves every frame: standards in the wind, chains over the void, drifting cloud. */
export const LIVE_CH6: ReadonlySet<string> = new Set(['persian_banner', 'broken_chain', 'cloud_bank']);

export function drawLivePropCh6(ctx: Ctx, e: Decor, t: number) {
  const x = e.x * TILE, y = e.y * TILE;
  switch (e.k) {
    case 'persian_banner': {
      // A long purple standard with a gold border and a sun-disc, rippling.
      const hang = e.y <= 3;
      const top = Math.round(y + (hang ? 10 : 2)), H = (e.h ?? 5) * TILE, W = 22;
      const wind = skyVariant === 'storm' ? 2.5 : 1;
      for (let row = 0; row < H; row++) {
        const u = row / H;
        const off = Math.round(Math.sin(t * 2.4 * wind - row * 0.18 + e.x) * u * 3 * wind);
        const narrow = row > H - 8 ? (row - (H - 8)) : 0;
        const w0 = Math.round(-W / 2 + narrow), w1 = Math.round(W / 2 - narrow);
        ctx.fillStyle = OUT;
        ctx.fillRect(x + w0 - 1 + off, top + row, w1 - w0 + 2, 1);
        ctx.fillStyle = (row % 18) < 2 ? GOLD : '#4a1a58';
        ctx.fillRect(x + w0 + off, top + row, w1 - w0, 1);
        ctx.fillStyle = GOLD;
        ctx.fillRect(x + w0 + off, top + row, 1, 1);
        ctx.fillRect(x + w1 - 1 + off, top + row, 1, 1);
        if (row > 8 && row < 18) ctx.fillRect(x - 3 + off + (row > 10 && row < 16 ? -1 : 0), top + row, row > 10 && row < 16 ? 8 : 6, 1);
      }
      break;
    }
    case 'broken_chain': {
      // A fallen angel's chain hanging over nothing, its last links snapped.
      const n = Math.max(4, Math.floor(((e.h ?? 10) * TILE) / 7));
      const sw = Math.sin(t * 0.8 + e.x) * 0.06;
      for (let i = 0; i < n; i++) {
        const lx = Math.round(x + Math.sin(sw * i) * i * 7), ly = Math.round(y + i * 7);
        const side = i & 1;
        ctx.fillStyle = OUT;
        ctx.fillRect(lx - (side ? 2 : 4), ly - 1, side ? 4 : 8, 9);
        ctx.fillStyle = '#6a6470';
        if (side) ctx.fillRect(lx - 1, ly, 2, 7);
        else { ctx.fillRect(lx - 3, ly, 6, 7); ctx.fillStyle = OUT; ctx.fillRect(lx - 1, ly + 2, 2, 3); ctx.fillStyle = '#a8a2b0'; ctx.fillRect(lx - 3, ly, 1, 6); }
      }
      // the snapped end glints
      const ex = Math.round(x + Math.sin(sw * n) * n * 7), ey = Math.round(y + n * 7);
      ctx.fillStyle = '#c8c2d0';
      ctx.fillRect(ex - 2, ey, 1, 2);
      ctx.fillRect(ex + 1, ey + 1, 1, 2);
      break;
    }
    case 'cloud_bank': {
      // The floor of the high places: rolling cloud, lit from above.
      const W = (e.w ?? 40) * TILE, hw = W / 2;
      const drift = (t * 4) % 24;
      for (let i = -1; i < W / 24 + 1; i++) {
        const cx = Math.round(x - hw + i * 24 + drift), r = 10 + ((i * 7 + Math.floor(e.x)) % 3) * 3;
        if (cx < x - hw - 12 || cx > x + hw + 12) continue;
        ellipse(ctx, cx, y - 4, r + 2, r * 0.55 + 1, 0, 'rgba(120,96,140,0.55)');
        ellipse(ctx, cx, y - 5, r, r * 0.5, 0, 'rgba(240,226,236,0.8)');
        ctx.fillStyle = 'rgba(255,250,240,0.9)';
        ctx.fillRect(cx - Math.round(r * 0.5), Math.round(y - 5 - r * 0.45), Math.round(r), 1);
      }
      break;
    }
  }
}
