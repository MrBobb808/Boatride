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
      ctx.fillRect(hash2(i, 65) * w, y, 1.4 * k, 1.4 * k);
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
  ctx.lineWidth = 2.4 * k;
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
    ctx.fillRect(hash2(i, 83) * w, h * (0.9 - life * 0.8), 1.6 * k, 1.6 * k);
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
  ctx.fillRect(ax - aw / 2 - 8 * k, ay - 46 * k, aw + 16 * k, 0.8);
  ctx.fillRect(x0 + 30 * k, wy - 16 * k, x1 - x0 - 60 * k, 0.8);
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
      for (let i = 0; i < 70; i++) ctx.fillRect(fr.range(0, w), water + fr.range(2, h - water - 4), fr.range(8, 40), 0.8);
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
