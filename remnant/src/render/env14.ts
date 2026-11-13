// Chapter XIV environment art: the Day of Gog (Ezekiel 38–39, 47). Four lands, each with its own sky, parallax and
// props; tiles keep the shared drawing with each land's palette (BIOMES in environment.ts).
//   unwalled: the land of unwalled villages at rest (38:11): terraced olive hills, white houses with no gate, flocks,
//     a gold morning. Its 'alarm' variant is the same land as the cloud comes up out of the north (38:9).
//   host: the north parts and the camps of the host (38:15): dust, banners and a forest of spears under a bruised sky.
//   shaking: the great shaking (38:19–20): mountains thrown down, walls fallen, ash and red light; its 'cloud' variant
//     is the summit under Gog's cloud, and 'fire' the hail and fire from heaven (38:22).
//   river: the waters from under the threshold (47:1): the house on its hill, the river widening, trees on both banks.

import { makeCanvas, rgba, mix, circle, type Ctx } from './draw';
import { RNG, hash2 } from '../core/math';
import { TILE, type Biome, type EntDef } from '../game/tiles';
import { blob, tier, wrapNoise, fillRidge, strokeRidge, housesSil, palmSil } from './env4';
import { cypressSil } from './env5';
import type { BiomePal, Layer, ParallaxSteps } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
export type Ch14Biome = 'unwalled' | 'host' | 'shaking' | 'river';
export const isCh14 = (b: Biome): b is Ch14Biome => b === 'unwalled' || b === 'host' || b === 'shaking' || b === 'river';

const TAU = Math.PI * 2;
const OUT = '#0e0a0c';

/** Rooms whose seed asks for another mood of their land (rooms14.ts gives these seeds). */
export const SEED = { alarm: 1404, ford: 1410, cloud: 1418, fire: 1419, sea: 1424 } as const;
type Variant = 'morning' | 'alarm' | 'host' | 'ford' | 'shaking' | 'cloud' | 'fire' | 'river' | 'sea';
let variant: Variant = 'morning';

function variantOf(biome: Ch14Biome, seed: number): Variant {
  if (biome === 'unwalled') return seed === SEED.alarm ? 'alarm' : 'morning';
  if (biome === 'host') return seed === SEED.ford ? 'ford' : 'host';
  if (biome === 'shaking') return seed === SEED.cloud ? 'cloud' : seed === SEED.fire ? 'fire' : 'shaking';
  return seed === SEED.sea ? 'sea' : 'river';
}

export function useRoomCh14(biome: Ch14Biome, seed: number) { variant = variantOf(biome, seed); }

// ---------------------------------------------------------------- skies

const STOPS: Record<Variant, readonly (readonly [number, string])[]> = {
  // a clear gold morning over the hills of Israel
  morning: [[0, '#2a4a7a'], [0.35, '#5a84b0'], [0.6, '#a8c0c8'], [0.78, '#f0d8a8'], [0.9, '#f8e4b8']],
  // the same morning, the north gone brown and dark under the cloud
  alarm: [[0, '#2a2a3a'], [0.35, '#5a5060'], [0.6, '#9a7a68'], [0.78, '#d8a070'], [0.9, '#e8b880']],
  // the north parts: a bruised sky full of dust
  host: [[0, '#1a1418'], [0.35, '#3e2e2e'], [0.6, '#7a5a44'], [0.8, '#b8865a'], [0.92, '#c89a68']],
  // the ford of the host at dusk
  ford: [[0, '#14121e'], [0.35, '#3a2a3a'], [0.6, '#8a4a42'], [0.78, '#d0784a'], [0.9, '#e89a5a']],
  // the great shaking: ash over red light
  shaking: [[0, '#140c0c'], [0.35, '#3a1c18'], [0.6, '#7a3424'], [0.8, '#b8582e'], [0.92, '#c87038']],
  // under Gog's cloud: almost night at noon
  cloud: [[0, '#06060a'], [0.4, '#141418'], [0.7, '#28262a'], [0.9, '#3a3430']],
  // hail and fire: the cloud torn open by white fire
  fire: [[0, '#0a0810'], [0.3, '#2a1a2a'], [0.55, '#8a3a2a'], [0.72, '#f0a050'], [0.86, '#fff0c0']],
  // the river morning: clear, green-gold
  river: [[0, '#3a6aa0'], [0.4, '#7aa8c8'], [0.65, '#c8e0d0'], [0.82, '#f0ecc0'], [0.92, '#f8f0d0']],
  // the healed sea at evening, gold on still water
  sea: [[0, '#2a3a6a'], [0.35, '#6a7aa0'], [0.62, '#d0b8a0'], [0.8, '#f8d8a0'], [0.92, '#fff0c8']],
};
const skyG: Partial<Record<Variant, CanvasGradient>> = {};
const skyH: Partial<Record<Variant, number>> = {};
function skyFill(ctx: Ctx, v: Variant, w: number, h: number) {
  let g = skyG[v];
  if (!g || skyH[v] !== h) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of STOPS[v]) g.addColorStop(o, c);
    skyG[v] = g; skyH[v] = h;
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawSkyCh14(ctx: Ctx, biome: Ch14Biome, _pal: BiomePal, w: number, h: number, interior: boolean, t: number) {
  const k = h / 720, v = interior ? (biome === 'river' ? 'river' : 'cloud') : variant;
  skyFill(ctx, v, w, h);
  if (interior) return;
  if (v === 'morning' || v === 'river' || v === 'sea') {
    // the sun, and slow white cloud
    const sx = w * (v === 'sea' ? 0.24 : 0.7), sy = h * (v === 'sea' ? 0.56 : 0.22), sr = h * 0.05;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, v === 'sea' ? '#ffb070' : '#fff0c0', sx, sy, sr * 9, sr * 5, 0.35);
    blob(ctx, '#fffaf0', sx, sy, sr * 2.6, sr * 2.6, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    circle(ctx, sx, sy, sr, v === 'sea' ? '#ffd8a0' : '#fffbe8');
    for (let i = 0; i < 5; i++) {
      const y = h * (0.12 + i * 0.07), x = ((t * (3 + i) * k * 2 + hash2(i, 141) * w) % (w + 700 * k)) - 350 * k;
      blob(ctx, '#ffffff', x, y, (140 + hash2(i, 143) * 140) * k, (10 + i * 2) * k, 0.4);
    }
    return;
  }
  if (v === 'alarm' || v === 'host' || v === 'ford') {
    // the cloud out of the north: a wall of dust and dark weather on the horizon, rolling toward the land (38:9)
    const near = v === 'alarm' ? 0.2 : 0.55;
    for (let i = 0; i < 9; i++) {
      const x = w * (hash2(i, 151) * 1.2 - 0.1) + Math.sin(t * 0.2 + i) * 20 * k;
      blob(ctx, i & 1 ? '#3a2e2a' : '#5a443a', x, h * (0.16 + hash2(i, 153) * 0.16), (220 + hash2(i, 155) * 160) * k, (50 + near * 90) * k, 0.6 + near * 0.3);
    }
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, v === 'ford' ? '#e07040' : '#c08050', w * 0.5, h * 0.36, w * 0.7, h * 0.08, 0.25);
    ctx.globalCompositeOperation = 'source-over';
    if (v !== 'alarm') lightning(ctx, w, h, t, k, 7.3);
    return;
  }
  if (v === 'shaking') {
    // ash falling through red light, and the pale sun gone small
    circle(ctx, w * 0.3, h * 0.3, h * 0.035, '#f0a070');
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#d0602a', w * 0.3, h * 0.3, h * 0.3, h * 0.2, 0.25);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) blob(ctx, '#2a1410', w * hash2(i, 161), h * (0.15 + i * 0.08), 300 * k, 30 * k, 0.5);
    return;
  }
  // under the cloud (and the fire that breaks it)
  const fire = v === 'fire';
  for (let i = 0; i < 12; i++) {
    const x = ((hash2(i, 171) * w + t * 6 * k * (i % 3 + 1)) % (w + 400 * k)) - 200 * k;
    blob(ctx, i & 1 ? '#0a0a0e' : '#1c1a1e', x, h * (0.08 + hash2(i, 173) * 0.4), (200 + hash2(i, 175) * 200) * k, (40 + hash2(i, 177) * 60) * k, 0.85);
  }
  if (fire) {
    // the cloud torn open: white fire pouring down a rent in the sky
    const rx = w * 0.55;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#fff0c0', rx, h * 0.18, w * 0.18, h * 0.12, 0.6);
    blob(ctx, '#ff9040', rx, h * 0.3, w * 0.3, h * 0.25, 0.3);
    for (let i = 0; i < 7; i++) {
      const x = rx + (hash2(i, 181) - 0.5) * w * 0.5, ph = (t * 1.3 + hash2(i, 183)) % 1;
      ctx.fillStyle = rgba('#ffe8b0', 0.5 * (1 - ph));
      ctx.fillRect(x, h * 0.2 + ph * h * 0.7, 2 * k, 30 * k);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  lightning(ctx, w, h, t, k, fire ? 2.1 : 5.2);
}

/** A fork of lightning every few seconds, with a flash across the sky. */
function lightning(ctx: Ctx, w: number, h: number, t: number, k: number, every: number) {
  const n = Math.floor(t / every), ph = t / every - n;
  if (ph > 0.06) return;
  const a = 1 - ph / 0.06, x0 = w * (0.15 + hash2(n, 191) * 0.7);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#c8d0ff', 0.18 * a);
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = rgba('#f4f6ff', 0.9 * a);
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  let x = x0, y = 0;
  ctx.moveTo(x, y);
  for (let i = 0; i < 9; i++) { x += (hash2(n * 13 + i, 193) - 0.5) * 70 * k; y += h * 0.06; ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- silhouettes

/** An olive tree: a twisted trunk and a wide, broken crown. */
function oliveSil(ctx: Ctx, x: number, base: number, s: number, col: string, rng: RNG, rim: string | null) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.08, base);
  ctx.quadraticCurveTo(x - s * 0.18, base - s * 0.3, x - s * 0.04, base - s * 0.5);
  ctx.lineTo(x + s * 0.06, base - s * 0.5);
  ctx.quadraticCurveTo(x + s * 0.2, base - s * 0.25, x + s * 0.1, base);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const cx = x + rng.range(-s * 0.4, s * 0.4), cy = base - s * rng.range(0.5, 0.82);
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * rng.range(0.18, 0.28), s * rng.range(0.1, 0.16), 0, 0, TAU);
    ctx.fill();
  }
  if (rim) { ctx.fillStyle = rim; ctx.fillRect(x - s * 0.3, base - s * 0.86, s * 0.5, 1); }
}

/** The host on the march: ranks of spears and standards under the dust, horsemen at the head. */
function hostSil(ctx: Ctx, x0: number, x1: number, base: number, k: number, col: string, rng: RNG) {
  ctx.fillStyle = col;
  ctx.fillRect(x0, base - 8 * k, x1 - x0, 8 * k);
  for (let x = x0; x < x1; x += rng.range(3, 6) * k) {
    const hgt = rng.range(14, 26) * k;
    ctx.fillRect(x, base - hgt, Math.max(1, 0.8 * k), hgt);
    if (rng.chance(0.06)) {
      // a standard: a long cloth from the cross-bar
      ctx.fillRect(x - 4 * k, base - hgt - 1, 9 * k, Math.max(1, k));
      ctx.fillRect(x - 4 * k, base - hgt, 7 * k, 9 * k);
    }
  }
  for (let x = x0; x < x1; x += rng.range(10, 20) * k) {
    // helmets and riders' heads over the line
    ctx.beginPath();
    ctx.ellipse(x, base - 9 * k, 2.4 * k, 2.2 * k, 0, 0, TAU);
    ctx.fill();
    if (rng.chance(0.3)) { ctx.fillRect(x - 4 * k, base - 13 * k, 8 * k, 5 * k); ctx.fillRect(x + 3 * k, base - 16 * k, 2.4 * k, 4 * k); }
  }
}

/** A broken mountain: a summit split and slumped, with the slide fanned out below it. */
function brokenPeak(ctx: Ctx, x: number, base: number, s: number, col: string, rim: string, rng: RNG) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - s, base);
  ctx.lineTo(x - s * 0.35, base - s * 0.95);
  ctx.lineTo(x - s * 0.15, base - s * 0.7);
  ctx.lineTo(x - s * 0.05, base - s * 1.05);
  ctx.lineTo(x + s * 0.08, base - s * 0.62);
  ctx.lineTo(x + s * 0.3, base - s * 0.55);
  ctx.lineTo(x + s * 1.2, base);
  ctx.fill();
  // the crack down its face, lit from within
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let cx = x - s * 0.1, cy = base - s * 0.98;
  ctx.moveTo(cx, cy);
  while (cy < base - 2) { cx += rng.range(-s * 0.06, s * 0.06); cy += s * rng.range(0.06, 0.12); ctx.lineTo(cx, cy); }
  ctx.stroke();
}

/** The house on its hill (Ezekiel's temple): a walled court with a gate facing east and a door at the top. */
function houseOnHill(ctx: Ctx, cx: number, base: number, k: number, col: string, lit: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - 220 * k, base);
  ctx.quadraticCurveTo(cx - 120 * k, base - 70 * k, cx, base - 74 * k);
  ctx.quadraticCurveTo(cx + 120 * k, base - 70 * k, cx + 220 * k, base);
  ctx.fill();
  const y = base - 74 * k;
  ctx.fillRect(cx - 80 * k, y - 26 * k, 160 * k, 26 * k);
  ctx.fillRect(cx - 34 * k, y - 60 * k, 68 * k, 34 * k);
  ctx.fillRect(cx - 12 * k, y - 80 * k, 24 * k, 20 * k);
  for (let i = -3; i <= 3; i++) ctx.fillRect(cx + i * 22 * k - 3 * k, y - 32 * k, 6 * k, 6 * k);
  ctx.fillStyle = lit;
  ctx.fillRect(cx - 5 * k, y - 18 * k, 10 * k, 18 * k);
  // the waters from under the threshold, running east and down the hill
  ctx.fillRect(cx + 5 * k, y - 1, 120 * k, 2 * k);
}

// ---------------------------------------------------------------- parallax

export function* buildParallaxCh14(biome: Ch14Biome, pal: BiomePal, seed: number, interior: boolean, viewH: number, res: number): ParallaxSteps {
  const v = variantOf(biome, seed);
  const layers: Layer[] = [];
  const W = 1024, H = Math.round(viewH * 1.6);
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    const m = makeCanvas(W * r, H * r);
    m.ctx.scale(r, r);
    draw(m.ctx, W, H);
    const l: Layer = { c: m.c, w: W, h: H, fx, fy, oy: 0, res: r };
    layers.push(l);
    return l;
  };
  const wrap = (x: number, reach: number, w: number, f: (x: number) => void) => { f(x); if (x + reach > w) f(x - w); if (x - reach < 0) f(x + w); };
  if (interior) {
    // inside the refuge or the house: dim stone, lamplight
    yield mk(0.1, 0.05, (ctx, w, h) => {
      ctx.fillStyle = pal.far; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let x = 40; x < w; x += 120) blob(ctx, '#c08040', x, h * 0.6, 50, 70, 0.2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = mix(pal.far, '#000000', 0.3);
      for (let x = 0; x < w; x += 120) ctx.fillRect(x + 50, h * 0.2, 20, h * 0.8);
    }, res * 0.7);
    return layers;
  }
  const rim = rgba(v === 'shaking' || v === 'fire' ? '#ff9a5a' : v === 'cloud' ? '#8a8a9a' : '#fff0c8', 0.4);

  if (biome === 'unwalled') {
    // Far: the hills of Israel in blue haze, villages on their shoulders.
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.76, n = wrapNoise(w, 260, seed, 3);
      const hy = (x: number) => hz - 30 - n(x) * 50;
      fillRidge(ctx, w, h, hy, mix(pal.far, pal.fog, 0.3));
      const fr = new RNG(seed + 1);
      for (let x = fr.range(30, 90); x < w - 60; x += fr.range(140, 260)) wrap(x, 60, w, (xx) => housesSil(ctx, xx, xx + 50, hy(xx) + 4, 0.6, mix(pal.far, pal.fog, 0.55), rim, new RNG(seed + Math.floor(x)), 0.2));
    }, res * 0.7);
    // Mid: terraced olive groves and walled vineyards (no wall around any village).
    yield mk(0.14, 0.07, (ctx, w, h) => {
      const n = wrapNoise(w, 200, seed + 11, 4), hy = (x: number) => h * 0.84 - n(x) * h * 0.06;
      const fr = new RNG(seed + 12), col = pal.mid;
      for (let x = fr.range(0, 40); x < w - 20; x += fr.range(40, 90)) {
        const sd = fr.int(0, 99999);
        if (fr.chance(0.75)) wrap(x, 30, w, (xx) => oliveSil(ctx, xx, hy(xx) + 3, fr.range(30, 46), col, new RNG(sd), rim));
        else wrap(x, 20, w, (xx) => cypressSil(ctx, xx, hy(xx) + 3, fr.range(36, 52), col, rim));
      }
      fillRidge(ctx, w, h, hy, col);
      strokeRidge(ctx, w, hy, rim, 1);
    });
    yield mk(0.4, 0.15, (ctx, w, h) => {
      const n = wrapNoise(w, 140, seed + 21, 3), hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22);
      for (let x = fr.range(20, 60); x < w - 30; x += fr.range(120, 220)) { const sd = fr.int(0, 99999); wrap(x, 50, w, (xx) => oliveSil(ctx, xx, hy(xx) + 5, 80 + fr.range(0, 30), pal.near, new RNG(sd), null)); }
      fillRidge(ctx, w, h, hy, pal.near);
    });
  } else if (biome === 'host') {
    const ford = v === 'ford';
    // Far: the north parts, and the host covering them like a cloud.
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.78, n = wrapNoise(w, 300, seed, 3);
      fillRidge(ctx, w, h, (x) => hz - 20 - n(x) * 30, mix(pal.far, pal.fog, 0.45));
      hostSil(ctx, 0, w, hz, 0.7, mix(pal.far, pal.fog, 0.3), new RNG(seed + 2));
      ctx.globalCompositeOperation = 'lighter';
      const fr = new RNG(seed + 3);
      for (let i = 0; i < 16; i++) blob(ctx, '#ff8a3a', fr.range(0, w), hz - fr.range(2, 10), fr.range(4, 10), fr.range(3, 6), 0.4);
      ctx.globalCompositeOperation = 'source-over';
    }, res * 0.7);
    // Mid: camps of the host: tents, standards, a siege tower or two; at the ford, the river and the host crossing it.
    yield mk(0.15, 0.07, (ctx, w, h) => {
      const n = wrapNoise(w, 220, seed + 11, 4), hy = (x: number) => h * 0.84 - n(x) * h * 0.04;
      const fr = new RNG(seed + 12), col = pal.mid;
      if (ford) { ctx.fillStyle = mix(pal.mid, '#d0784a', 0.3); ctx.fillRect(0, h * 0.86, w, h * 0.14); }
      for (let x = fr.range(0, 60); x < w - 40; x += fr.range(70, 150)) {
        const kind = fr.int(0, 2), sd = fr.int(0, 99999);
        if (kind === 0) wrap(x, 30, w, (xx) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(xx - 22, hy(xx) + 2); ctx.lineTo(xx, hy(xx) - 24); ctx.lineTo(xx + 22, hy(xx) + 2); ctx.fill(); ctx.fillRect(xx - 1, hy(xx) - 34, 2, 10); });
        else if (kind === 1) wrap(x, 20, w, (xx) => { ctx.fillStyle = col; ctx.fillRect(xx - 14, hy(xx) - 70, 28, 72); ctx.fillRect(xx - 18, hy(xx) - 76, 36, 8); for (let y = 0; y < 60; y += 12) ctx.fillRect(xx - 16, hy(xx) - 66 + y, 32, 2); });
        else wrap(x, 60, w, (xx) => hostSil(ctx, xx, xx + 70, hy(xx) + 2, 1, col, new RNG(sd)));
      }
      fillRidge(ctx, w, h, hy, col);
      strokeRidge(ctx, w, hy, rim, 1);
    });
    yield mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 130, seed + 21, 3), hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22);
      ctx.fillStyle = pal.near;
      for (let x = fr.range(20, 60); x < w - 30; x += fr.range(30, 70)) wrap(x, 6, w, (xx) => { const L = fr.range(40, 90); ctx.save(); ctx.translate(xx, hy(xx) + 4); ctx.rotate(fr.range(-0.5, 0.5)); ctx.fillRect(-1, -L, 2, L); ctx.restore(); });
      fillRidge(ctx, w, h, hy, pal.near);
    });
  } else if (biome === 'shaking') {
    const cloud = v === 'cloud' || v === 'fire';
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8, fr = new RNG(seed + 2), col = mix(pal.far, pal.fog, cloud ? 0.15 : 0.4);
      for (let x = fr.range(40, 120); x < w; x += fr.range(160, 280)) { const sd = fr.int(0, 9999); wrap(x, 220, w, (xx) => brokenPeak(ctx, xx, hz, fr.range(80, 140), col, rim, new RNG(sd))); }
      fillRidge(ctx, w, h, () => hz, col);
    }, res * 0.7);
    // Mid: walls fallen to the ground, the steep places slid away.
    yield mk(0.16, 0.08, (ctx, w, h) => {
      const n = wrapNoise(w, 180, seed + 11, 4), hy = (x: number) => h * 0.84 - n(x) * h * 0.07;
      const fr = new RNG(seed + 12), col = pal.mid;
      for (let x = fr.range(0, 60); x < w - 40; x += fr.range(80, 170)) {
        wrap(x, 50, w, (xx) => {
          ctx.fillStyle = col;
          // a wall section, tipped and broken, its blocks spilled
          ctx.save(); ctx.translate(xx, hy(xx) + 2); ctx.rotate(fr.range(-0.35, 0.35));
          ctx.fillRect(-30, -26, 60, 26); for (let i = -30; i < 30; i += 10) ctx.fillRect(i, -32, 6, 6);
          ctx.restore();
          for (let i = 0; i < 5; i++) ctx.fillRect(xx + 34 + i * 7, hy(xx) - 3 - (i % 2) * 3, 6, 5);
        });
      }
      fillRidge(ctx, w, h, hy, col);
      strokeRidge(ctx, w, hy, rim, 1);
    });
    yield mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 110, seed + 21, 4), hy = (x: number) => h * 0.9 - n(x) * h * 0.05;
      fillRidge(ctx, w, h, hy, pal.near);
      // fissures glowing in the near ground
      ctx.globalCompositeOperation = 'lighter';
      const fr = new RNG(seed + 23);
      for (let i = 0; i < 6; i++) blob(ctx, cloud ? '#6a6a7a' : '#ff6a2a', fr.range(0, w), hy(fr.range(0, w)) + 10, 30, 3, 0.35);
      ctx.globalCompositeOperation = 'source-over';
    });
  } else {
    const sea = v === 'sea';
    // Far: the house on its hill in the west, and the river running out from it.
    yield mk(0.04, 0.03, (ctx, w, h) => {
      const hz = h * 0.8, col = mix(pal.far, pal.fog, 0.5);
      fillRidge(ctx, w, h, (x) => hz - 10 - Math.sin(x / 90) * 6, col);
      if (!sea) houseOnHill(ctx, w * 0.3, hz, 1, col, rgba('#fff4d0', 0.8));
      ctx.fillStyle = rgba('#cfe8ff', 0.6);
      ctx.fillRect(0, hz - 1, w, 2);
    }, res * 0.7);
    // Mid: the river widening, trees on both banks (47:12); at the sea, still water to the horizon.
    yield mk(0.15, 0.07, (ctx, w, h) => {
      const bank = h * 0.84, fr = new RNG(seed + 12), col = pal.mid;
      ctx.fillStyle = mix(pal.mid, '#7ab8d0', sea ? 0.6 : 0.45);
      ctx.fillRect(0, bank + 2, w, h - bank);
      ctx.fillStyle = rgba('#ffffff', 0.4);
      for (let i = 0; i < 60; i++) ctx.fillRect(fr.range(0, w), bank + fr.range(4, h - bank - 4), fr.range(8, 30), 1);
      for (let x = fr.range(0, 40); x < w - 20; x += fr.range(sea ? 120 : 40, sea ? 260 : 90)) {
        const sd = fr.int(0, 99999);
        if (fr.chance(0.6)) wrap(x, 30, w, (xx) => oliveSil(ctx, xx, bank + 3, fr.range(34, 54), col, new RNG(sd), rim));
        else wrap(x, 30, w, (xx) => palmSil(ctx, xx, bank + 3, fr.range(40, 60), col, new RNG(sd), rim, 1));
      }
      fillRidge(ctx, w, h, () => bank, col);
    });
    yield mk(0.42, 0.16, (ctx, w, h) => {
      const n = wrapNoise(w, 140, seed + 21, 3), hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22);
      for (let x = fr.range(20, 60); x < w - 30; x += fr.range(130, 230)) { const sd = fr.int(0, 99999); wrap(x, 50, w, (xx) => oliveSil(ctx, xx, hy(xx) + 5, 90 + fr.range(0, 30), pal.near, new RNG(sd), null)); }
      fillRidge(ctx, w, h, hy, pal.near);
    });
  }
  return layers;
}

// ---------------------------------------------------------------- props

type PropFn = (ctx: Ctx, e: Decor, pal: BiomePal, rng: RNG) => void;
const px = (ctx: Ctx, c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

const PROPS: Record<string, PropFn> = {
  /** A whitewashed house of the unwalled villages: flat roof, one door, no gate (38:11). */
  stone_house: (ctx, e) => {
    const w = (e.w ?? 5) * TILE, h = (e.h ?? 4) * TILE;
    px(ctx, OUT, -1, -h - 1, w + 2, h + 1);
    px(ctx, '#e8dcc0', 0, -h, w, h);
    px(ctx, '#c8b898', 0, -h, w, 3);
    px(ctx, '#b8a888', 0, -6, w, 6);
    px(ctx, '#5a4430', w * 0.42, -22, 12, 22);
    px(ctx, '#3a2a1c', w * 0.42 + 2, -20, 8, 20);
    px(ctx, '#3a3040', w * 0.15, -h + 12, 8, 8);
    px(ctx, '#3a3040', w * 0.72, -h + 12, 8, 8);
    // roof parapet and a ladder up to it
    px(ctx, '#d8ccb0', -2, -h - 4, w + 4, 4);
    for (let y = -h + 4; y < 0; y += 5) px(ctx, '#6a4a30', w - 8, y, 6, 1);
  },
  /** An old olive tree. */
  olive_tree: (ctx, e, _p, rng) => {
    const s = (e.h ?? 5) * TILE;
    oliveSil(ctx, 0, 0, s, '#4a4a2a', rng, null);
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 18; i++) px(ctx, '#8a9a5a', rng.range(-s * 0.4, s * 0.4), -s * rng.range(0.5, 0.85), 2, 2);
    ctx.globalAlpha = 1;
  },
  /** A stone well with a wooden beam and bucket. */
  well: (ctx) => {
    px(ctx, OUT, -15, -15, 30, 15);
    px(ctx, '#a89878', -14, -14, 28, 14);
    px(ctx, '#7a6a52', -14, -14, 28, 2);
    px(ctx, '#5a4430', -13, -36, 3, 22); px(ctx, '#5a4430', 10, -36, 3, 22);
    px(ctx, '#6a4a30', -14, -38, 28, 3);
    px(ctx, '#8a6a42', -2, -30, 5, 6);
  },
  /** A sheepfold of piled stone, and the flock. */
  sheepfold: (ctx, e, _p, rng) => {
    const w = (e.w ?? 8) * TILE;
    for (let x = 0; x < w; x += 6) px(ctx, x % 12 ? '#9a8e76' : '#8a7e66', x, -8 - ((x / 6) % 2), 6, 8 + ((x / 6) % 2));
    for (let i = 0; i < (e.v ?? 5); i++) {
      const x = rng.range(8, w - 8);
      px(ctx, '#f0ece0', x - 6, -16, 12, 7); px(ctx, '#2a2420', x + 5, -18, 4, 4); px(ctx, '#2a2420', x - 4, -9, 1, 4); px(ctx, '#2a2420', x + 3, -9, 1, 4);
    }
  },
  /** A row of vines on stakes. */
  vine_row: (ctx, e, _p, rng) => {
    const w = (e.w ?? 6) * TILE;
    for (let x = 4; x < w; x += 12) {
      px(ctx, '#5a4430', x, -18, 2, 18);
      for (let i = 0; i < 5; i++) px(ctx, i % 2 ? '#5a7a32' : '#7a9a3a', x - 5 + rng.range(0, 8), -20 + rng.range(0, 10), 4, 3);
      if (rng.chance(0.5)) px(ctx, '#6a2a5a', x + 2, -10, 3, 4);
    }
    px(ctx, '#6a5a3a', 0, -14, w, 1);
  },
  /** The watchtower of the villages, a stair of fieldstone. */
  watch_tower: (ctx, e) => {
    const h = (e.h ?? 10) * TILE;
    px(ctx, OUT, -17, -h - 1, 34, h + 1);
    px(ctx, '#b0a080', -16, -h, 32, h);
    for (let y = -h + 8; y < 0; y += 10) px(ctx, '#9a8a6a', -16, y, 32, 1);
    px(ctx, '#3a2a20', -4, -16, 8, 16);
    px(ctx, '#c8b898', -20, -h - 6, 40, 6);
  },
  /** A standard of the host: a long dark cloth with a pale sign, on a cross-bar. Moves in the wind (live). */
  host_banner: () => {},
  /** A siege tower, half built or half burned. */
  siege_tower: (ctx, e, _p, rng) => {
    const h = (e.h ?? 9) * TILE, w = 40;
    px(ctx, OUT, -w / 2 - 1, -h - 1, w + 2, h + 1);
    px(ctx, '#5a4430', -w / 2, -h, w, h);
    for (let y = -h + 10; y < 0; y += 14) px(ctx, '#3a2a1c', -w / 2, y, w, 3);
    for (let x = -w / 2; x < w / 2; x += 10) px(ctx, '#6a5038', x, -h, 2, h);
    if (e.v) for (let i = 0; i < 12; i++) px(ctx, i % 2 ? '#1c140e' : '#2a1c12', rng.range(-w / 2, w / 2), -rng.range(0, h), 6, 6);
    px(ctx, '#3a2a1c', -w / 2 - 4, -h - 6, w + 8, 6);
  },
  /** A buckler wall: shields set edge to edge (38:4). */
  shield_wall: (ctx, e) => {
    const w = (e.w ?? 6) * TILE;
    for (let x = 0; x < w; x += 12) { px(ctx, OUT, x - 1, -21, 14, 21); px(ctx, '#7a5a3a', x, -20, 12, 20); px(ctx, '#b89a5a', x + 4, -12, 4, 4); px(ctx, '#5a4028', x, -20, 12, 2); }
  },
  /** A cairn of spears and bucklers waiting for the fire (39:9). */
  spear_cairn: (ctx, _e, _p, rng) => {
    for (let i = 0; i < 14; i++) {
      ctx.save(); ctx.translate(rng.range(-14, 14), 0); ctx.rotate(rng.range(-0.7, 0.7));
      px(ctx, '#6a5038', -1, -rng.range(20, 34), 2, 34); px(ctx, '#a8a8b0', -2, -36, 4, 5); ctx.restore();
    }
    for (let i = 0; i < 4; i++) { const x = rng.range(-14, 10); px(ctx, '#7a5a3a', x, -10 - i * 3, 12, 10); }
  },
  /** A section of wall thrown down to the ground (38:20). */
  broken_wall: (ctx, e, _p, rng) => {
    const w = (e.w ?? 7) * TILE;
    for (let x = 0; x < w; x += 9) { const hh = rng.range(4, 26); px(ctx, OUT, x - 1, -hh - 1, 10, hh + 1); px(ctx, x % 18 ? '#8a6a5a' : '#7a5a4a', x, -hh, 9, hh); }
    for (let i = 0; i < 6; i++) px(ctx, '#6a4a3a', rng.range(0, w), -rng.range(2, 6), 8, 6);
  },
  /** A boundary stone split by the shaking. */
  boundary_stone: (ctx) => {
    px(ctx, OUT, -9, -31, 18, 31); px(ctx, '#9a8a7a', -8, -30, 7, 30); px(ctx, '#8a7a6a', 1, -28, 7, 28); px(ctx, '#ff8a4a', -1, -30, 2, 30);
  },
  /** A burial marker of the seven months (39:12). */
  grave_marker: (ctx, e) => {
    px(ctx, OUT, -5, -23, 10, 23); px(ctx, '#d8d0c0', -4, -22, 8, 22); px(ctx, '#a8a090', -4, -22, 8, 2);
    if (e.v) px(ctx, '#e8c860', -1, -18, 2, 8);
  },
  /** The door of the house, with water running from under the threshold (47:1). */
  temple_door: (ctx) => {
    px(ctx, OUT, -41, -97, 82, 97);
    px(ctx, '#e8dcc0', -40, -96, 80, 96);
    px(ctx, '#c8b898', -40, -96, 80, 6);
    px(ctx, '#3a2a1c', -16, -64, 32, 64);
    px(ctx, '#e8c860', -18, -68, 36, 4);
    px(ctx, '#7ac8e8', -12, -3, 60, 3);
  },
  /** A tree by the river: broad, heavy with fruit, its leaf unfading (47:12). */
  healing_tree: (ctx, e, _p, rng) => {
    const s = (e.h ?? 7) * TILE;
    px(ctx, '#3a2a1c', -4, -s * 0.5, 8, s * 0.5);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#3a7a3a' : '#4a9a42'; ctx.beginPath(); ctx.ellipse(rng.range(-s * 0.35, s * 0.35), -s * rng.range(0.55, 0.95), s * 0.2, s * 0.14, 0, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 10; i++) px(ctx, i % 2 ? '#f0a040' : '#e86a3a', rng.range(-s * 0.35, s * 0.35), -s * rng.range(0.55, 0.9), 3, 3);
  },
  /** A river marker of a thousand cubits (47:3–5). */
  cubit_marker: (ctx, e) => {
    px(ctx, OUT, -4, -41, 8, 41); px(ctx, '#c8b898', -3, -40, 6, 40);
    for (let i = 0; i < (e.v ?? 1); i++) px(ctx, '#3a6aa0', -3, -36 + i * 6, 6, 2);
  },
};

const BOUNDS: Record<string, (e: Decor) => [number, number, number, number]> = {
  stone_house: (e) => [-4, -(e.h ?? 4) * TILE - 8, (e.w ?? 5) * TILE + 4, 2],
  watch_tower: (e) => [-22, -(e.h ?? 10) * TILE - 8, 22, 2],
  siege_tower: (e) => [-26, -(e.h ?? 9) * TILE - 8, 26, 2],
  olive_tree: (e) => [-(e.h ?? 5) * TILE * 0.7, -(e.h ?? 5) * TILE, (e.h ?? 5) * TILE * 0.7, 2],
  healing_tree: (e) => [-(e.h ?? 7) * TILE * 0.6, -(e.h ?? 7) * TILE * 1.1, (e.h ?? 7) * TILE * 0.6, 2],
  temple_door: () => [-44, -100, 64, 2],
};

/** Decor baked behind the rest of a chunk's props. */
export const BACKDROP_CH14: ReadonlySet<string> = new Set(['stone_house', 'watch_tower', 'temple_door']);

/** Chapter XIV props. Returns false for kinds it does not know. */
export function drawPropCh14(ctx: Ctx, e: Decor, pal: BiomePal, seed: number): boolean {
  const fn = PROPS[e.k];
  if (!fn) return false;
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

/** Decor that moves every frame. */
export const LIVE_CH14: ReadonlySet<string> = new Set(['host_banner', 'river_fish', 'hail_fall']);

export function drawLivePropCh14(ctx: Ctx, e: Decor, t: number) {
  const x = e.x * TILE, y = e.y * TILE;
  if (e.k === 'host_banner') {
    // a long dark standard rippling on its pole
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(x - 1, y - 70, 2, 70);
    ctx.fillRect(x - 1, y - 70, 24, 2);
    for (let i = 0; i < 12; i++) {
      const wave = Math.sin(t * 3 + i * 0.6 + x) * (i / 12) * 4;
      ctx.fillStyle = i % 4 === 0 ? '#2a1418' : '#4a1c22';
      ctx.fillRect(x + 1 + wave, y - 68 + i * 3, 21, 3);
    }
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(x + 9, y - 60, 6, 6);
    return;
  }
  if (e.k === 'river_fish') {
    // a shoal turning in the healed water (47:9)
    for (let i = 0; i < (e.v ?? 6); i++) {
      const a = t * 0.8 + i * 1.1, fx = x + Math.cos(a) * 30 + i * 4, fy = y + Math.sin(a * 1.3) * 6;
      ctx.fillStyle = i % 2 ? '#c8d8e0' : '#e8f0f0';
      ctx.fillRect(fx, fy, 5, 2);
      ctx.fillRect(fx + (Math.cos(a) > 0 ? -2 : 5), fy - 1, 2, 4);
    }
    return;
  }
  if (e.k === 'hail_fall') {
    // great hailstones and fire falling across a band of the room (38:22)
    const w = (e.w ?? 20) * TILE, fallH = (e.h ?? 14) * TILE, n = tier() === 2 ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const ph = (t * (0.7 + hash2(i, 201) * 0.6) + hash2(i, 203)) % 1;
      const hx = x + hash2(i, 205) * w, hy = y - fallH + ph * fallH;
      if (i % 3 === 0) { ctx.fillStyle = 'rgba(255,160,64,0.8)'; ctx.fillRect(hx, hy - 8, 2, 8); }
      else { ctx.fillStyle = '#e8f0ff'; ctx.fillRect(hx, hy, 4, 4); ctx.fillStyle = 'rgba(200,220,255,0.5)'; ctx.fillRect(hx + 1, hy - 6, 2, 6); }
    }
  }
}
