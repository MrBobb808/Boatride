// Chapter X environment art: the coast of Chittim under the storm of the
// prince of Grecia. A grey sea breaking on white marble, wrecked ships and
// drowned beacons, olive trees bent by the wind, colonnades standing in the
// surf, and on the highest cliff the prince's citadel under a spiralling horn.
// Below the tide: the Sunken Temple in blue-green gloom, light falling through
// the water onto statues whose faces the sea has worn away; and the Drowned
// Library, its scrolls still on the shelves.

import { rgba, mix, circle, poly, ellipse, type Ctx } from './draw';
import { RNG, hash2 } from '../core/math';
import { TILE, T, type EntDef } from '../game/tiles';
import { flag } from '../game/ctx';
import { blob, tier, wrapNoise, fillRidge, strokeRidge, solidify } from './env4';
import type { BiomePal, Layer } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
const TAU = Math.PI * 2;
const OUT = '#0a0c10';
const MARBLE = '#d8d2c4', MARBLE_LIT = '#f4f0e6', MARBLE_DK = '#8a8478', MARBLE_DEEP = '#5a5a54';
const BRONZE = '#a8783a', BRONZE_LIT = '#e0b060', SEA = '#1e3a44', FOAM = '#dce8e8', KELP = '#2e5a3a', KELP_LIT = '#5a8a4a';

function box(ctx: Ctx, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function stroke(ctx: Ctx, c: string, lw: number, pts: number[]) {
  ctx.strokeStyle = c;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

function shape(ctx: Ctx, pts: number[], fill: string, out = OUT, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  solidify(ctx, fill, out, lw);
}

function add(ctx: Ctx, c: string, x: number, y: number, rx: number, ry: number, a: number) {
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, c, x, y, rx, ry, a);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- sky

const skyG: Record<string, CanvasGradient> = {};
const skyH: Record<string, number> = {};
function skyFill(ctx: Ctx, kind: 'tempest' | 'deep', w: number, h: number) {
  let g = skyG[kind];
  if (!g || skyH[kind] !== h) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    const stops: [number, string][] = kind === 'tempest'
      ? [[0, '#0a0e16'], [0.3, '#18222e'], [0.55, '#2e3c48'], [0.75, '#4e5e66'], [0.9, '#7c8c8a'], [1, '#98a49c']]
      : [[0, '#0c3440'], [0.4, '#0a2430'], [0.8, '#071822'], [1, '#05121a']];
    for (const [o, c] of stops) g.addColorStop(o, c);
    skyG[kind] = g;
    skyH[kind] = h;
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** The storm over the coast: drifting cloud banks, slanting rain, and now and then the lightning. */
export function greciaSky(ctx: Ctx, w: number, h: number, interior: boolean, t: number) {
  const k = h / 720;
  if (interior) {
    skyFill(ctx, 'deep', w, h);
    // light falling through the water from far above, swaying
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(140,220,220,0.05)';
    for (let i = 0; i < 4; i++) {
      const x = w * (0.12 + i * 0.26) + Math.sin(t * 0.3 + i * 1.7) * 18 * k, s = (24 + i * 8) * k;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.4, 0);
      ctx.lineTo(x + s * 0.4, 0);
      ctx.lineTo(x + s * 1.6 + Math.sin(t * 0.4 + i) * 10 * k, h);
      ctx.lineTo(x + s * 0.2, h);
      ctx.fill();
    }
    blob(ctx, '#3a9aa0', w * 0.5, 0, w * 0.6, h * 0.25, 0.18);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  skyFill(ctx, 'tempest', w, h);
  // cloud banks, darker above, drifting with the wind
  for (let i = 0; i < 6; i++) {
    const span = w + 700 * k;
    const x = ((t * (6 + i * 3) * k + hash2(i, 91) * span) % span) - 350 * k;
    const y = h * (0.08 + i * 0.07);
    blob(ctx, i < 3 ? '#0a0e14' : '#1c2630', x, y, (220 + i * 30) * k, (40 + i * 6) * k, 0.55);
    blob(ctx, '#2a3640', x + 60 * k, y + 18 * k, 160 * k, 20 * k, 0.35);
  }
  // lightning: every few seconds a bolt and a flash; the bolt is the same for the whole strike
  const cycle = 6.5, ph = t % cycle, n = Math.floor(t / cycle);
  if (ph < 0.42) {
    const a = ph < 0.08 ? 0.5 : ph < 0.16 ? 0.15 : ph < 0.24 ? 0.38 : 0.1 * (1 - ph / 0.42);
    ctx.fillStyle = rgba('#dfe8ff', a * 0.5);
    ctx.fillRect(0, 0, w, h);
    if (ph < 0.3) {
      let x = w * (0.2 + hash2(n, 93) * 0.6), y = 0;
      ctx.strokeStyle = rgba('#f4f8ff', 0.9);
      ctx.lineWidth = Math.max(1, 2 * k);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 9; j++) {
        x += (hash2(n, j, 95) - 0.5) * 60 * k;
        y += h * 0.07;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // rain, slanting in the wind
  if (tier() > 0) {
    ctx.strokeStyle = 'rgba(190,210,220,0.18)';
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    const n2 = tier() === 2 ? 70 : 40;
    for (let i = 0; i < n2; i++) {
      const x = (hash2(i, 97) * w + t * 260 * k) % (w + 40 * k) - 20 * k;
      const y = (hash2(i, 98) * h + t * 900 * k) % h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10 * k, y + 26 * k);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- scenery pieces

/** A Greek temple front: steps, a row of columns, an entablature and a pediment; broken if ruined. */
function templeSil(ctx: Ctx, x: number, base: number, w: number, h: number, col: string, rim: string | null, ruin: number, rng: RNG) {
  const steps = h * 0.1, colH = h * 0.62, ent = h * 0.1;
  box(ctx, col, x - w * 0.04, base - steps, w * 1.08, steps);
  const n = Math.max(4, Math.round(w / (h * 0.16)));
  const cw = (w / n) * 0.42;
  for (let i = 0; i < n; i++) {
    const cx = x + (i + 0.5) * (w / n);
    const broken = ruin > 0 && rng.chance(ruin);
    const ch = broken ? colH * rng.range(0.2, 0.75) : colH;
    box(ctx, col, cx - cw / 2, base - steps - ch, cw, ch);
    if (rim) box(ctx, rim, cx + cw / 2 - Math.max(1, cw * 0.18), base - steps - ch, Math.max(1, cw * 0.18), ch);
  }
  if (ruin < 0.5) {
    const top = base - steps - colH;
    box(ctx, col, x - w * 0.02, top - ent, w * 1.04, ent);
    if (ruin < 0.2) poly(ctx, [x - w * 0.03, top - ent, x + w * 0.5, top - ent - h * 0.2, x + w * 1.03, top - ent], col);
    else poly(ctx, [x - w * 0.03, top - ent, x + w * 0.3, top - ent - h * 0.12, x + w * 0.42, top - ent], col);
    if (rim) box(ctx, rim, x - w * 0.02, top - ent, w * 1.04, 1);
  }
}

/**
 * The prince's citadel on the highest sea-cliff: walls and a long colonnade,
 * and over it a tower twisted like a horn, lit from within, the storm turning
 * about its tip.
 */
function hornCitadel(ctx: Ctx, x: number, base: number, s: number, col: string, rim: string, rng: RNG) {
  // the cliff, sheer on the sea side
  poly(ctx, [x - s * 0.7, base, x - s * 0.55, base - s * 0.4, x - s * 0.4, base - s * 0.62, x + s * 0.3, base - s * 0.66, x + s * 0.5, base - s * 0.45, x + s * 0.62, base], col);
  stroke(ctx, rim, 1, [x - s * 0.55, base - s * 0.4, x - s * 0.4, base - s * 0.62, x + s * 0.3, base - s * 0.66]);
  const top = base - s * 0.64;
  templeSil(ctx, x - s * 0.36, top, s * 0.5, s * 0.22, col, rim, 0, rng);
  box(ctx, col, x + s * 0.18, top - s * 0.12, s * 0.12, s * 0.12);
  // the horn tower: a tapering spiral of segments
  let cx = x + s * 0.1, y = top - s * 0.06, wdt = s * 0.1;
  for (let i = 0; i < 12; i++) {
    const nx = cx + Math.sin(i * 0.7) * s * 0.02 + s * 0.006 * i, ny = y - s * 0.07;
    poly(ctx, [cx - wdt, y, nx - wdt * 0.88, ny, nx + wdt * 0.88, ny, cx + wdt, y], col);
    stroke(ctx, rim, 1, [cx - wdt, y - s * 0.02, nx + wdt * 0.88, ny + s * 0.01]);
    cx = nx;
    y = ny;
    wdt *= 0.88;
  }
  poly(ctx, [cx - wdt, y, cx + s * 0.04, y - s * 0.12, cx + wdt, y], col);
  for (let i = 0; i < 4; i++) {
    const wy = top - s * (0.12 + i * 0.12);
    box(ctx, '#e8d090', x + s * 0.1 + Math.sin(i) * s * 0.01, wy, Math.max(1, s * 0.012), Math.max(1.5, s * 0.025));
  }
  add(ctx, '#c8d8ff', cx, y - s * 0.1, s * 0.25, s * 0.18, 0.25);
  add(ctx, '#ffd890', x + s * 0.1, top - s * 0.3, s * 0.12, s * 0.3, 0.2);
}

/** A storm wave: a curling crest with foam on its lip. */
function wave(ctx: Ctx, x: number, base: number, s: number, col: string, foam: string) {
  poly(ctx, [x - s, base, x - s * 0.4, base - s * 0.25, x + s * 0.1, base - s * 0.5, x + s * 0.45, base - s * 0.45, x + s * 0.6, base - s * 0.3, x + s * 0.4, base - s * 0.32, x + s * 0.5, base - s * 0.15, x + s, base], col);
  stroke(ctx, foam, Math.max(1, s * 0.05), [x - s * 0.3, base - s * 0.3, x + s * 0.1, base - s * 0.5, x + s * 0.45, base - s * 0.45, x + s * 0.58, base - s * 0.3]);
}

/** A wrecked ship on the rocks, its mast snapped and sail in rags. */
function wreck(ctx: Ctx, x: number, base: number, s: number, col: string, tilt: number) {
  ctx.save();
  ctx.translate(x, base);
  ctx.rotate(tilt);
  poly(ctx, [-s, -s * 0.15, -s * 0.8, s * 0.12, s * 0.7, s * 0.14, s * 1.05, -s * 0.25, s * 0.7, -s * 0.1, -s * 0.6, -s * 0.12], col);
  stroke(ctx, col, Math.max(1, s * 0.05), [0, -s * 0.1, s * 0.05, -s * 1.1]);
  poly(ctx, [s * 0.05, -s * 1.0, s * 0.55, -s * 0.85, s * 0.4, -s * 0.6, s * 0.5, -s * 0.45, s * 0.05, -s * 0.5], col);
  stroke(ctx, col, Math.max(1, s * 0.03), [-s * 0.6, -s * 0.12, s * 0.05, -s * 1.1, s * 1.0, -s * 0.22]);
  ctx.restore();
}

/** An olive tree bent by the sea wind, its crown in ragged clumps. */
function olive(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  const lean = h * 0.35;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.06, base);
  ctx.bezierCurveTo(x - h * 0.02, base - h * 0.3, x + lean * 0.3, base - h * 0.45, x + lean, base - h * 0.62);
  ctx.lineTo(x + lean + h * 0.04, base - h * 0.58);
  ctx.bezierCurveTo(x + lean * 0.5, base - h * 0.4, x + h * 0.08, base - h * 0.28, x + h * 0.08, base);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const cx = x + lean + rng.range(-0.45, 0.35) * h, cy = base - h * 0.62 + rng.range(-0.18, 0.06) * h;
    ellipse(ctx, cx, cy, h * rng.range(0.1, 0.17), h * rng.range(0.05, 0.08), -0.25, col);
  }
}

/** A lighthouse on a headland, its brazier burning. */
function lighthouse(ctx: Ctx, x: number, base: number, s: number, col: string) {
  poly(ctx, [x - s * 0.5, base, x - s * 0.3, base - s * 0.3, x + s * 0.35, base - s * 0.28, x + s * 0.6, base], col);
  poly(ctx, [x - s * 0.1, base - s * 0.28, x - s * 0.07, base - s * 1.1, x + s * 0.07, base - s * 1.1, x + s * 0.1, base - s * 0.28], col);
  box(ctx, col, x - s * 0.1, base - s * 1.16, s * 0.2, s * 0.06);
  add(ctx, '#ffb060', x, base - s * 1.2, s * 0.4, s * 0.3, 0.6);
  circle(ctx, x, base - s * 1.2, Math.max(1.5, s * 0.04), '#ffe0a0');
  // its beam, swept toward the sea
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,220,150,0.06)';
  ctx.beginPath();
  ctx.moveTo(x, base - s * 1.2);
  ctx.lineTo(x - s * 3, base - s * 1.5);
  ctx.lineTo(x - s * 3, base - s * 0.9);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** White houses of the harbour stacked on the slope, a few lamps lit. */
function harbourTown(ctx: Ctx, x0: number, x1: number, base: number, s: number, col: string, roof: string, rng: RNG) {
  let x = x0;
  while (x < x1) {
    const w = s * rng.range(0.6, 1.1), h = s * rng.range(0.5, 1.0), y = base - rng.range(0, s * 0.6);
    box(ctx, col, x, y - h, w, h + (base - y));
    box(ctx, roof, x - 1, y - h - s * 0.06, w + 2, s * 0.08);
    if (rng.chance(0.5)) box(ctx, '#ffcf80', x + w * 0.4, y - h * 0.55, Math.max(1, s * 0.1), Math.max(1, s * 0.14));
    x += w + rng.range(0, s * 0.2);
  }
}

/** A colossal statue in the deep, robed, its face worn away by the sea. */
function drownedColossus(ctx: Ctx, x: number, base: number, s: number, col: string, rim: string) {
  poly(ctx, [x - s * 0.22, base, x - s * 0.18, base - s * 0.6, x - s * 0.12, base - s * 0.8, x + s * 0.12, base - s * 0.8, x + s * 0.18, base - s * 0.6, x + s * 0.22, base], col);
  ellipse(ctx, x, base - s * 0.88, s * 0.08, s * 0.1, 0, col);
  stroke(ctx, col, Math.max(2, s * 0.05), [x + s * 0.12, base - s * 0.74, x + s * 0.3, base - s * 0.9, x + s * 0.34, base - s * 1.1]);
  for (let i = 0; i < 5; i++) stroke(ctx, rim, 1, [x - s * 0.14 + i * s * 0.07, base - s * 0.75, x - s * 0.18 + i * s * 0.09, base]);
}

/** A school of small fish, a drifting smear of dashes. */
function school(ctx: Ctx, x: number, y: number, s: number, col: string, rng: RNG) {
  ctx.fillStyle = col;
  for (let i = 0; i < 24; i++) {
    const fx = x + rng.range(-1, 1) * s, fy = y + rng.range(-0.4, 0.4) * s;
    ctx.fillRect(fx, fy, 3, 1);
  }
}

/** A tall strand of kelp. */
function kelp(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  const pts = [x, base];
  for (let i = 1; i <= 8; i++) pts.push(x + Math.sin(i * 0.8 + rng.range(0, 3)) * h * 0.05, base - (h * i) / 8);
  stroke(ctx, col, Math.max(1.5, h * 0.025), pts);
  for (let i = 2; i < 8; i++) ellipse(ctx, pts[i * 2] + (i & 1 ? 4 : -4), pts[i * 2 + 1], 5, 2, i & 1 ? 0.5 : -0.5, col);
}

function mist(ctx: Ctx, w: number, y: number, col: string, a: number, thick = 14) {
  ctx.globalCompositeOperation = 'lighter';
  for (let x = 0; x < w; x += 90) blob(ctx, col, x + 45, y, 110, thick, a);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- parallax

interface Builder {
  mk: (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r?: number) => void;
  scatter: (w: number, rng: RNG, lo: number, hi: number, reach: number, f: (x: number, r: RNG) => void) => void;
  seed: number;
  slot: number;
  pal: BiomePal;
  res: number;
}

/** Room place in its chapter: 0 harbour, 1 colonnade, 2 sunken temple, 3 library, 4 cliffs, 5 throne. */
export function greciaParallax(b: Builder, interior: boolean) {
  const { mk, scatter, seed, slot, pal } = b;
  if (interior) return slot === 3 ? library(b) : sunken(b);
  const RIM = rgba('#c8dcff', 0.45), harbour = slot === 0, cliffs = slot === 4 || slot === 5;
  // L0: the open sea, islands with their temples, and the horned citadel on its cliff.
  mk(0.02, 0.02, (ctx, w, h) => {
    const hz = h * 0.8, fr = new RNG(seed + 1);
    box(ctx, '#2c3a44', 0, hz, w, h - hz);
    ctx.fillStyle = rgba('#a8b8bc', 0.25);
    for (let i = 0; i < 80; i++) ctx.fillRect(fr.range(0, w), hz + fr.range(2, h - hz - 2), fr.range(4, 22), 1);
    for (let i = 0; i < 4; i++) {
      const x = fr.range(0, w), iw = fr.range(40, 90), ih = fr.range(8, 18);
      poly(ctx, [x - iw, hz + 1, x - iw * 0.4, hz - ih, x + iw * 0.3, hz - ih * 0.8, x + iw, hz + 1], '#2a343e');
      if (fr.chance(0.6)) templeSil(ctx, x - iw * 0.2, hz - ih * 0.8, iw * 0.4, ih * 1.2, '#2a343e', null, 0.3, fr);
    }
    const cs = cliffs ? h * 0.26 : h * 0.18;
    hornCitadel(ctx, w * (slot === 5 ? 0.3 : cliffs ? 0.36 : 0.22), hz + 2, cs, '#1e2630', RIM, new RNG(seed + 2));
    mist(ctx, w, hz, '#5a6a72', 0.35, 16);
  }, b.res * 0.7);
  // L1: the sea running high — rolling crests, a wreck, the harbour light.
  mk(0.05, 0.035, (ctx, w, h) => {
    const base = h * 0.84, col = '#24323c', fr = new RNG(seed + 4);
    box(ctx, col, 0, base, w, h - base);
    scatter(w, fr, 40, 90, 60, (x, r) => wave(ctx, x, base + 2, r.range(18, 34), col, rgba(FOAM, 0.55)));
    scatter(w, fr, 280, 460, 60, (x, r) => wreck(ctx, x, base, r.range(20, 30), col, r.range(-0.25, 0.25)));
    if (harbour || slot === 1) scatter(w, fr, 380, 560, 60, (x, r) => lighthouse(ctx, x, base + 2, r.range(40, 56), col));
    ctx.fillStyle = rgba(FOAM, 0.35);
    for (let i = 0; i < 60; i++) ctx.fillRect(fr.range(0, w), base + fr.range(2, h - base - 2), fr.range(4, 16), 1);
    mist(ctx, w, base - 2, '#6a7a80', 0.3);
  }, b.res * 0.8);
  // L2: the coast — temples standing in the surf, the white town, cliff stairs.
  mk(0.11, 0.06, (ctx, w, h) => {
    const base = h * 0.86, col = pal.mid, fr = new RNG(seed + 12), n = wrapNoise(w, 120, seed + 11, 3);
    const ground = (x: number) => base - n(x) * (cliffs ? 50 : 14);
    if (harbour) {
      harbourTown(ctx, 0, w, base - 6, 26, col, '#1a222c', fr);
      scatter(w, fr, 70, 130, 20, (x, r) => {
        stroke(ctx, col, 2, [x, base, x, base - r.range(50, 80)]);
        stroke(ctx, col, 1, [x - 16, base - 40, x, base - 70, x + 16, base - 40]);
      });
    } else scatter(w, fr, 140, 260, 70, (x, r) => templeSil(ctx, x, ground(x) + 2, r.range(60, 110), r.range(46, 70), col, RIM, r.range(0.2, 0.7), r));
    scatter(w, fr, 60, 140, 40, (x, r) => olive(ctx, x, ground(x) + 2, r.range(36, 56), col, r));
    fillRidge(ctx, w, h, ground, col);
    strokeRidge(ctx, w, ground, rgba('#c8d4dc', 0.3), 1);
    mist(ctx, w, base - 4, '#6a7a82', 0.3);
  });
  // L3: broken columns, statues, nets on their poles.
  mk(0.22, 0.1, (ctx, w, h) => {
    const base = h * 0.91, col = mix(pal.mid, pal.near, 0.55), fr = new RNG(seed + 17);
    scatter(w, fr, 70, 150, 30, (x, r) => {
      const ch = r.range(40, 110), cw = r.range(10, 16);
      box(ctx, col, x - cw / 2, base - ch, cw, ch);
      box(ctx, col, x - cw * 0.8, base - ch - 5, cw * 1.6, 5);
      box(ctx, rgba('#c8d4dc', 0.2), x + cw / 2 - 2, base - ch, 2, ch);
    });
    scatter(w, fr, 160, 280, 30, (x, r) => olive(ctx, x, base + 2, r.range(60, 90), col, r));
    if (harbour) scatter(w, fr, 140, 220, 30, (x) => {
      stroke(ctx, col, 2, [x - 20, base, x - 20, base - 40]);
      stroke(ctx, col, 2, [x + 20, base, x + 20, base - 40]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.moveTo(x - 20, base - 38 + i * 4);
        ctx.quadraticCurveTo(x, base - 30 + i * 4, x + 20, base - 38 + i * 4);
      }
      ctx.stroke();
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  // L4: black rocks and the surf breaking over them, close to the eye.
  mk(0.4, 0.15, (ctx, w, h) => {
    const base = h * 0.96, col = pal.near, fr = new RNG(seed + 22);
    scatter(w, fr, 160, 300, 60, (x, r) => {
      const rw = r.range(40, 80), rh = r.range(30, 70);
      poly(ctx, [x - rw, base, x - rw * 0.6, base - rh * 0.7, x - rw * 0.1, base - rh, x + rw * 0.5, base - rh * 0.6, x + rw, base], col);
      add(ctx, '#c8e0e8', x - rw * 0.2, base - rh * 1.05, rw * 0.6, rh * 0.3, 0.12);
    });
    scatter(w, fr, 260, 420, 30, (x, r) => {
      const cw = r.range(16, 24);
      box(ctx, col, x - cw / 2, 0, cw, base);
      box(ctx, col, x - cw, h * 0.06, cw * 2, 8);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
}

function sunken(b: Builder) {
  const { mk, scatter, seed } = b;
  // L0: the temple's far halls in blue gloom, a colossus standing in them.
  mk(0.04, 0.03, (ctx, w, h) => {
    const base = h * 0.88, fr = new RNG(seed + 2);
    box(ctx, '#0a2028', 0, 0, w, h);
    for (let row = 0; row < 2; row++) {
      const col = row ? '#0e2a32' : '#0c242c', step = row ? 44 : 64, cw = row ? 7 : 11;
      for (let x = row * 22; x < w; x += step) {
        box(ctx, col, x - cw / 2, h * 0.3, cw, base - h * 0.3);
        box(ctx, col, x - cw, h * 0.3 - cw * 0.6, cw * 2, cw * 0.6);
      }
      box(ctx, row ? '#0e2a32' : '#0c242c', 0, h * 0.24, w, h * 0.06);
    }
    scatter(w, fr, 380, 560, 60, (x) => drownedColossus(ctx, x, base, h * 0.5, '#0e2c36', 'rgba(120,200,200,0.12)'));
    box(ctx, '#081a20', 0, base, w, h - base);
  }, b.res * 0.7);
  // L1: nearer columns wound with kelp, a fish school turning.
  mk(0.1, 0.06, (ctx, w, h) => {
    const col = '#0a1e26', base = h * 0.9, fr = new RNG(seed + 6);
    scatter(w, fr, 110, 200, 40, (x, r) => {
      const cw = r.range(16, 22), broken = r.chance(0.4);
      box(ctx, col, x - cw / 2, broken ? h * r.range(0.4, 0.6) : h * 0.2, cw, base);
      if (!broken) box(ctx, col, x - cw, h * 0.2 - 8, cw * 2, 8);
      kelp(ctx, x + cw * 0.6, base, h * r.range(0.3, 0.5), '#123a2a', r);
      box(ctx, 'rgba(120,200,210,0.12)', x - cw / 2, h * 0.2, 2, base - h * 0.2);
    });
    scatter(w, fr, 200, 340, 40, (x, r) => school(ctx, x, h * r.range(0.3, 0.6), 30, 'rgba(160,210,220,0.35)', r));
    fillRidge(ctx, w, h, () => base, col);
  }, b.res * 0.8);
  // L2: sunken amphorae and fallen drums among the coral.
  mk(0.16, 0.08, (ctx, w, h) => {
    const col = '#081820', base = h * 0.92, fr = new RNG(seed + 12);
    scatter(w, fr, 60, 140, 30, (x, r) => {
      const s = r.range(10, 16);
      ellipse(ctx, x, base - s, s * 0.5, s, r.range(-0.6, 0.6), col);
      box(ctx, col, x - s * 0.2, base - s * 2.1, s * 0.4, s * 0.4);
    });
    scatter(w, fr, 90, 180, 40, (x, r) => {
      for (let i = 0; i < 5; i++) stroke(ctx, '#1a3a32', 2, [x + i * 4, base, x + i * 4 + r.range(-8, 8), base - r.range(14, 30)]);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  mk(0.3, 0.12, (ctx, w, h) => {
    const fr = new RNG(seed + 18);
    scatter(w, fr, 70, 150, 30, (x, r) => kelp(ctx, x, h, h * r.range(0.4, 0.7), '#061410', r));
    ctx.fillStyle = 'rgba(180,230,240,0.3)';
    for (let i = 0; i < 70; i++) {
      const s = fr.range(1, 3);
      ctx.fillRect(fr.range(0, w), fr.range(0, h), s, s);
    }
  });
  mk(0.42, 0.16, (ctx, w, h) => {
    const col = '#040c10', fr = new RNG(seed + 22);
    scatter(w, fr, 220, 360, 40, (x, r) => {
      const cw = r.range(20, 30);
      box(ctx, col, x, 0, cw, h);
      for (let y = 20; y < h; y += 80) box(ctx, col, x - 4, y, cw + 8, 6);
    });
    fillRidge(ctx, w, h, () => h * 0.97, col);
  });
}

function library(b: Builder) {
  const { mk, scatter, seed } = b;
  // L0: the reading hall, its arched windows looking out into green water.
  mk(0.04, 0.03, (ctx, w, h) => {
    const base = h * 0.88;
    box(ctx, '#161a1e', 0, 0, w, h);
    ctx.fillStyle = '#1c2228';
    for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 0 : 14; x < w; x += 28) ctx.fillRect(x, y, 26, 10);
    for (let x = 60; x < w; x += 170) {
      ctx.fillStyle = '#0c3a40';
      ctx.beginPath();
      ctx.moveTo(x - 22, h * 0.7);
      ctx.lineTo(x - 22, h * 0.42);
      ctx.arc(x, h * 0.42, 22, Math.PI, TAU);
      ctx.lineTo(x + 22, h * 0.7);
      ctx.fill();
      add(ctx, '#3a9aa0', x, h * 0.5, 30, 50, 0.3);
      box(ctx, '#161a1e', x - 1, h * 0.36, 2, h * 0.34);
    }
    box(ctx, '#101418', 0, base, w, h - base);
  }, b.res * 0.7);
  // L1: shelves of scrolls, floor to ceiling.
  mk(0.1, 0.06, (ctx, w, h) => {
    const col = '#20201c', base = h * 0.9, fr = new RNG(seed + 6);
    scatter(w, fr, 120, 200, 60, (x, r) => {
      const sw = r.range(50, 80), sh = h * 0.55;
      box(ctx, col, x, base - sh, sw, sh);
      for (let i = 0; i < 6; i++) {
        const y = base - sh + 6 + i * (sh / 6);
        box(ctx, '#121210', x + 3, y, sw - 6, sh / 6 - 4);
        for (let j = 0; j < Math.floor((sw - 8) / 5); j++) if (r.chance(0.8)) circle(ctx, x + 6 + j * 5, y + sh / 12, 2, r.chance(0.5) ? '#a89870' : '#c8b88a');
      }
    });
    scatter(w, fr, 200, 340, 20, (x) => {
      stroke(ctx, col, 1, [x, 0, x, h * 0.3]);
      add(ctx, '#ffb060', x, h * 0.32, 18, 18, 0.5);
      circle(ctx, x, h * 0.32, 3, '#ffd890');
    });
    fillRidge(ctx, w, h, () => base, col);
  }, b.res * 0.8);
  mk(0.18, 0.08, (ctx, w, h) => {
    const col = '#121410', base = h * 0.93, fr = new RNG(seed + 12);
    scatter(w, fr, 140, 260, 30, (x) => {
      box(ctx, col, x - 20, base - 22, 40, 4);
      box(ctx, col, x - 16, base - 18, 3, 18);
      box(ctx, col, x + 13, base - 18, 3, 18);
      box(ctx, '#d8c8a0', x - 10, base - 25, 14, 3);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  mk(0.4, 0.15, (ctx, w, h) => {
    const col = '#080a0a', fr = new RNG(seed + 22);
    scatter(w, fr, 240, 380, 40, (x, r) => {
      const cw = r.range(18, 26);
      box(ctx, col, x, 0, cw, h);
    });
    box(ctx, col, 0, 0, w, 10);
  });
}

// ---------------------------------------------------------------- tiles

/** Marble worn by the sea: ashlar with barnacles and weed, a slab top wet with spray or sand. */
export function drawSolidGrecia(ctx: Ctx, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean, interior: boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  const base = t === T.Seal ? '#7a5a28' : interior ? '#7a8480' : pal.stone;
  const dark = mix(base, interior ? '#1a2a2e' : pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  box(ctx, mix(dark, '#000000', v * 0.1), x, y, TILE, TILE);
  if (depth <= 1) {
    const off = ty & 1 ? 8 : 0;
    box(ctx, 'rgba(20,24,28,0.35)', x, y, TILE, 1);
    box(ctx, 'rgba(20,24,28,0.35)', x + off, y, 1, TILE);
    box(ctx, 'rgba(255,255,250,0.12)', x, y + 1, TILE, 1);
    box(ctx, 'rgba(255,255,250,0.08)', x + off + 1, y + 1, 1, TILE - 2);
    // a vein in the marble
    if (hash2(tx, ty, 801) < 0.3) {
      ctx.fillStyle = 'rgba(90,96,100,0.35)';
      let vx = x + Math.floor(hash2(tx, ty, 802) * 12);
      for (let i = 0; i < 16; i += 2) {
        ctx.fillRect(vx, y + i, 1, 2);
        vx += hash2(tx, ty * 16 + i, 803) < 0.5 ? 1 : -1;
      }
    }
    // barnacles low on the sea-facing faces
    if ((!lf || !rt || !dn) && hash2(tx, ty, 804) < 0.4) {
      ctx.fillStyle = '#c8c4b4';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + Math.floor(hash2(tx, i, 805) * 12), y + 8 + Math.floor(hash2(ty, i, 806) * 7), 2, 1);
      ctx.fillStyle = '#6a6a5e';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 3 + Math.floor(hash2(tx, i, 807) * 10), y + 10 + Math.floor(hash2(ty, i, 808) * 5), 1, 1);
    }
  }
  if (!up) {
    // the slab top, and weed or sand where the sea leaves it
    box(ctx, MARBLE_DEEP, x, y, TILE, 5);
    box(ctx, interior ? '#a8b0aa' : MARBLE, x, y, TILE, 3);
    box(ctx, interior ? '#c8d0cc' : MARBLE_LIT, x, y, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.4)', x + (tx % 3 === 0 ? 0 : 15), y, 1, 4);
    const k = hash2(tx, ty, 809);
    if (k < 0.3) {
      ctx.fillStyle = KELP;
      for (let i = 0; i < 4; i++) {
        const gx = x + Math.floor(hash2(tx, i, 810) * 15), gh = 2 + Math.floor(hash2(tx, i, 811) * 3);
        ctx.fillRect(gx, y - gh + 1, 1, gh);
      }
      box(ctx, KELP_LIT, x + Math.floor(k * 30) % 12, y - 1, 2, 1);
    } else if (k < 0.45 && !interior) {
      box(ctx, '#c8b890', x + 2, y, 10, 2);
      box(ctx, '#e0d4b0', x + 4, y, 5, 1);
    }
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.35)', x, y + TILE - 2, TILE, 2);
    if (hash2(tx, ty, 812) < 0.25) {
      const dx = x + 3 + Math.floor(hash2(tx, ty, 813) * 9);
      box(ctx, KELP, dx, y + TILE, 1, 3 + Math.floor(hash2(tx, ty, 814) * 6));
    }
  }
  if (!lf) box(ctx, 'rgba(255,255,250,0.12)', x, y, 1, TILE);
  if (!rt) box(ctx, 'rgba(0,0,0,0.28)', x + TILE - 2, y, 2, TILE);
}

/** A marble lintel cut with the meander. */
export function drawOneWayGrecia(ctx: Ctx, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  box(ctx, MARBLE_DEEP, x, y, TILE, 7);
  box(ctx, MARBLE, x, y, TILE, 6);
  box(ctx, MARBLE_LIT, x, y, TILE, 1);
  // the key pattern, one turn per tile
  ctx.fillStyle = MARBLE_DK;
  ctx.fillRect(x + 1, y + 2, 1, 3);
  ctx.fillRect(x + 1, y + 4, 6, 1);
  ctx.fillRect(x + 6, y + 2, 1, 3);
  ctx.fillRect(x + 3, y + 2, 4, 1);
  ctx.fillRect(x + 3, y + 2, 1, 2);
  ctx.fillRect(x + 9, y + 2, 6, 1);
  ctx.fillRect(x + 9, y + 2, 1, 3);
  ctx.fillRect(x + 14, y + 2, 1, 3);
  ctx.fillRect(x + 11, y + 4, 4, 1);
  if (hash2(tx, ty, 815) < 0.3) box(ctx, KELP, x + Math.floor(hash2(tx, ty, 816) * 12), y + 6, 1, 4);
  if (l || r) {
    const ex = l ? x : x + TILE - 4;
    box(ctx, MARBLE_DK, ex, y - 1, 4, 9);
    box(ctx, MARBLE_LIT, ex + 1, y - 1, 2, 1);
  }
}

/** Sea urchins and broken coral. */
export function drawSpikesGrecia(ctx: Ctx, tx: number, ty: number) {
  const x = tx * TILE, y = ty * TILE;
  for (let i = 0; i < 2; i++) {
    const cx = x + 4 + i * 8, cy = y + 12 - Math.floor(hash2(tx, i, 817) * 2);
    ctx.strokeStyle = '#2a1a2e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let a = 0; a < 10; a++) {
      const an = (a / 10) * TAU;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(an) * 6, cy + Math.sin(an) * 5 - 1);
    }
    ctx.stroke();
    circle(ctx, cx, cy, 3, '#3a2440');
    box(ctx, '#8a6a9a', cx - 1, cy - 2, 1, 1);
  }
  box(ctx, '#c86a5a', x + 7, y + 13, 2, 3);
  return true;
}

/** The sea: green-grey and clouded, foam riding the swell; seen from inside it is clear enough to swim. */
export function drawLiquidGrecia(ctx: Ctx, tt: T, x: number, y: number, top: boolean, tx: number, t: number) {
  if (tt !== T.Water) return false;
  const swell = top ? 4 + Math.sin(t * 1.6 + tx * 0.55) * 1.6 : 0;
  ctx.fillStyle = top ? 'rgba(30,70,80,0.62)' : 'rgba(20,56,66,0.5)';
  ctx.fillRect(x, y + swell, TILE, TILE - swell);
  if (!top) return true;
  ctx.fillStyle = rgba(FOAM, 0.85);
  ctx.fillRect(x, y + swell, TILE, 1);
  const f = Math.floor((t * 6 + hash2(tx, 0, 818) * 16) % 16);
  ctx.fillStyle = rgba(FOAM, 0.6);
  ctx.fillRect(x + ((f + 3) % 14), y + swell + 2, 3, 1);
  if (hash2(tx, 1, 818) < 0.5) ctx.fillRect(x + ((f + 9) % 14), y + swell + 4, 2, 1);
  if (tier() > 0) add(ctx, '#7ab8c0', x + 8, y + swell + 3, 12, 4, 0.12);
  return true;
}

// ---------------------------------------------------------------- props

type PropFn = (ctx: Ctx, e: Decor, rng: RNG) => void;

/** A fluted column: standing with its capital (v0), snapped (v1), or fallen drums (v2). */
const column: PropFn = (ctx, e, rng) => {
  const v = e.v ?? 0;
  if (v === 2) {
    for (let i = 0; i < 3; i++) {
      const cx = -22 + i * 20, r = 9 - i;
      ellipse(ctx, cx, -r, r * 1.1, r, 0, OUT);
      ellipse(ctx, cx, -r, r, r - 1, 0, MARBLE_DK);
      ellipse(ctx, cx - 2, -r - 2, r * 0.6, r * 0.4, 0, MARBLE);
    }
    return;
  }
  const h = v === 1 ? rng.range(40, 70) : 110;
  shape(ctx, [-14, 0, -14, -6, -10, -8, -10, -h, 10, -h, 10, -8, 14, -6, 14, 0], MARBLE);
  for (let i = -6; i <= 6; i += 4) box(ctx, MARBLE_DK, i, -h, 1, h - 8);
  box(ctx, MARBLE_LIT, -9, -h, 2, h - 8);
  box(ctx, MARBLE_DK, 8, -h, 2, h - 8);
  if (v === 1) {
    poly(ctx, [-10, -h, -4, -h - 8, 2, -h - 3, 6, -h - 10, 10, -h], MARBLE);
    stroke(ctx, OUT, 1, [-10, -h, -4, -h - 8, 2, -h - 3, 6, -h - 10, 10, -h]);
  } else {
    shape(ctx, [-16, -h, -13, -h - 6, 13, -h - 6, 16, -h], MARBLE_LIT);
    shape(ctx, [-18, -h - 6, 18, -h - 6, 18, -h - 12, -18, -h - 12], MARBLE);
    for (const s of [-1, 1]) circle(ctx, s * 13, -h - 4, 3, MARBLE_DK);
  }
  box(ctx, KELP, -14, -4, 28, 2);
};

/** A marble figure, robed, holding a broken spear; its head lies at its feet (v1). */
const statue: PropFn = (ctx, e) => {
  shape(ctx, [-16, 0, -16, -8, 16, -8, 16, 0], MARBLE_DK);
  shape(ctx, [-10, -8, -12, -40, -8, -58, 8, -58, 12, -40, 10, -8], MARBLE);
  for (let i = 0; i < 4; i++) box(ctx, MARBLE_DK, -7 + i * 4, -50, 1, 40);
  box(ctx, MARBLE_LIT, -9, -54, 2, 44);
  stroke(ctx, OUT, 3, [9, -50, 16, -66, 18, -78]);
  stroke(ctx, MARBLE_LIT, 1.6, [9, -50, 16, -66, 18, -78]);
  if (e.v === 1) {
    ellipse(ctx, -22, -6, 6, 6, 0, OUT);
    ellipse(ctx, -22, -6, 5, 5, 0, MARBLE);
    box(ctx, MARBLE_DK, -25, -7, 4, 1);
    shape(ctx, [-6, -58, 6, -58, 4, -62, -4, -62], MARBLE_DK);
  } else {
    ellipse(ctx, 0, -64, 6, 7, 0, OUT);
    ellipse(ctx, 0, -64, 5, 6, 0, MARBLE);
    box(ctx, MARBLE_DK, -3, -64, 6, 1);
  }
};

/** Amphorae, standing and fallen. */
const amphora: PropFn = (ctx, e, rng) => {
  const n = 2 + (e.v ?? 0);
  for (let i = 0; i < n; i++) {
    const x = -12 + i * 12, fallen = rng.chance(0.3), c = rng.chance(0.5) ? '#a8603a' : '#8a5032';
    ctx.save();
    ctx.translate(x, fallen ? -6 : 0);
    if (fallen) ctx.rotate(Math.PI / 2 * (rng.chance(0.5) ? 1 : -1));
    shape(ctx, [-2, 0, -6, -6, -6, -14, -3, -18, -3, -22, 3, -22, 3, -18, 6, -14, 6, -6, 2, 0], c);
    box(ctx, '#2a1a12', -6, -12, 12, 2);
    box(ctx, '#d89a6a', -4, -16, 2, 8);
    ctx.restore();
  }
};

/** A ship's anchor fouled with weed. */
const anchor: PropFn = (ctx) => {
  stroke(ctx, OUT, 4, [0, -2, 0, -40]);
  stroke(ctx, '#5a5a56', 2.4, [0, -2, 0, -40]);
  stroke(ctx, OUT, 4, [-14, -14, -10, -4, 0, -2, 10, -4, 14, -14]);
  stroke(ctx, '#5a5a56', 2.4, [-14, -14, -10, -4, 0, -2, 10, -4, 14, -14]);
  stroke(ctx, '#5a5a56', 2, [-8, -34, 8, -34]);
  ctx.strokeStyle = '#5a5a56';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -44, 4, 0, TAU);
  ctx.stroke();
  stroke(ctx, KELP, 1.5, [0, -20, -4, -10, 2, -4]);
};

/** A wrecked hull on the beach, ribs showing. */
const wreckProp: PropFn = (ctx) => {
  shape(ctx, [-60, 0, -54, -20, -30, -30, 30, -32, 58, -24, 64, 0], '#3a2a20');
  for (let i = 0; i < 7; i++) stroke(ctx, '#5a4030', 2, [-44 + i * 15, -2, -42 + i * 15, -28]);
  box(ctx, '#6a5038', -54, -22, 112, 3);
  stroke(ctx, OUT, 4, [10, -30, 22, -96]);
  stroke(ctx, '#5a4030', 2.4, [10, -30, 22, -96]);
  shape(ctx, [20, -90, 50, -80, 40, -60, 44, -50, 16, -54], '#b8aa8a', OUT, 0.8);
  stroke(ctx, '#3a2a20', 1, [22, -96, 60, -10]);
};

/** An olive tree, bent away from the sea. */
const oliveProp: PropFn = (ctx, e, rng) => {
  const h = 120 + (e.v ?? 0) * 20;
  ctx.fillStyle = '#3a3428';
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.bezierCurveTo(-8, -h * 0.3, 10, -h * 0.4, 26, -h * 0.6);
  ctx.lineTo(32, -h * 0.56);
  ctx.bezierCurveTo(18, -h * 0.36, 8, -h * 0.26, 10, 0);
  ctx.fill();
  stroke(ctx, '#5a5040', 1, [-6, -10, -4, -h * 0.3, 14, -h * 0.46]);
  for (let i = 0; i < 12; i++) {
    const cx = 26 + rng.range(-46, 34), cy = -h * 0.62 + rng.range(-24, 10);
    ellipse(ctx, cx, cy, rng.range(12, 20), rng.range(6, 9), -0.2, OUT);
    ellipse(ctx, cx, cy, rng.range(10, 18), rng.range(5, 8), -0.2, i % 3 ? '#4a5a3a' : '#6a7a52');
    box(ctx, '#9aa880', cx - 4, cy - 4, 4, 1);
  }
};

/** Nets drying on poles, cork floats on them. */
const nets: PropFn = (ctx) => {
  for (const x of [-24, 24]) {
    stroke(ctx, OUT, 3.4, [x, 0, x, -46]);
    stroke(ctx, '#6a5040', 1.8, [x, 0, x, -46]);
  }
  ctx.strokeStyle = '#8a8070';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    ctx.moveTo(-24, -44 + i * 5);
    ctx.quadraticCurveTo(0, -34 + i * 5, 24, -44 + i * 5);
  }
  for (let i = 0; i < 7; i++) {
    ctx.moveTo(-18 + i * 6, -42);
    ctx.lineTo(-18 + i * 6, -10);
  }
  ctx.stroke();
  for (let i = 0; i < 5; i++) circle(ctx, -16 + i * 8, -40 + (i & 1) * 3, 2, '#c89040');
};

/** A sailcloth awning on oars, the harbour's shelter. */
const awning: PropFn = (ctx) => {
  for (const x of [-30, 30]) {
    stroke(ctx, OUT, 3.4, [x, 0, x, -50]);
    stroke(ctx, '#7a5a3a', 1.8, [x, 0, x, -50]);
  }
  shape(ctx, [-36, -50, 36, -54, 34, -40, 20, -46, 0, -40, -20, -46, -34, -40], '#c8b890');
  for (let i = 0; i < 4; i++) box(ctx, '#8a6a42', -26 + i * 16, -50, 6, 8);
  shape(ctx, [-20, 0, -18, -12, 18, -12, 20, 0], '#6a5038');
  box(ctx, '#c86a3a', -14, -16, 10, 4);
  box(ctx, '#d8c8a0', 2, -15, 10, 3);
};

/** A shelf of scrolls in the Drowned Library. */
const shelf: PropFn = (ctx, e, rng) => {
  const h = 70;
  shape(ctx, [-24, 0, -24, -h, 24, -h, 24, 0], '#3a3024');
  for (let i = 0; i < 4; i++) {
    const y = -h + 6 + i * 16;
    box(ctx, '#1a140e', -21, y, 42, 12);
    for (let j = 0; j < 8; j++) if (rng.chance(e.v === 1 ? 0.5 : 0.85)) {
      circle(ctx, -17 + j * 5, y + 7, 2.2, rng.chance(0.5) ? '#c8b88a' : '#a89870');
      box(ctx, '#6a4a2a', -18 + j * 5, y + 6, 2, 1);
    }
  }
  box(ctx, '#5a4a36', -24, -h, 48, 2);
  box(ctx, KELP, -24, -6, 48, 3);
};

/** Seaweed swaying in the swell; drawn live. */
const KELP_LIVE = (ctx: Ctx, e: Decor, t: number) => {
  const h = (e.h ?? 4) * TILE, ph = (e.x * 1.3) % TAU;
  for (let s = 0; s < 3; s++) {
    const pts = [s * 6 - 6, 0];
    for (let i = 1; i <= 8; i++) {
      const f = i / 8, sway = Math.sin(t * 1.4 + ph + s + f * 2.5) * 6 * f;
      pts.push(s * 6 - 6 + sway, -h * f * (0.7 + s * 0.15));
    }
    stroke(ctx, s === 1 ? KELP_LIT : KELP, 2, pts);
  }
};

/** A lighthouse beacon on the harbour mole: the tower baked, its flame live. */
const lighthouseProp: PropFn = (ctx) => {
  shape(ctx, [-20, 0, -16, -12, 16, -12, 20, 0], MARBLE_DK);
  shape(ctx, [-12, -12, -9, -120, 9, -120, 12, -12], MARBLE);
  for (let y = -30; y > -120; y -= 22) box(ctx, MARBLE_DK, -11, y, 22, 2);
  box(ctx, MARBLE_LIT, -10, -118, 3, 104);
  box(ctx, '#2a1e14', -4, -60, 8, 12);
  shape(ctx, [-16, -120, 16, -120, 12, -126, -12, -126], BRONZE);
  shape(ctx, [-12, -126, -10, -138, 10, -138, 12, -126], '#3a2a1a');
};

/** The storm wall before the throne road: two marble pylons; the storm between them is live. */
const gate: PropFn = (ctx) => {
  for (const s of [-1, 1]) {
    shape(ctx, [s * 20, 0, s * 22, -110, s * 40, -110, s * 42, 0], MARBLE);
    box(ctx, MARBLE_LIT, s * 31 - 8, -108, 2, 106);
    for (let y = -96; y < 0; y += 24) box(ctx, MARBLE_DK, s * 31 - 10, y, 20, 2);
    shape(ctx, [s * 18, -110, s * 44, -110, s * 46, -118, s * 16, -118], MARBLE_LIT);
    // a bronze horn crowning each pylon
    stroke(ctx, OUT, 4, [s * 31, -118, s * 26, -132, s * 34, -146]);
    stroke(ctx, BRONZE_LIT, 2, [s * 31, -118, s * 26, -132, s * 34, -146]);
  }
};

/** The prince's seat: a marble throne under a great spiral horn, four lesser horns waiting at its foot. */
const throne: PropFn = (ctx) => {
  // the great horn rising behind
  const pts: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const f = i / 14;
    pts.push(Math.sin(f * 7) * 10 * (1 - f) + f * 8, -60 - f * 140);
  }
  for (let i = 0; i < pts.length - 2; i += 2) {
    const wdt = 14 * (1 - i / pts.length) + 2;
    stroke(ctx, OUT, wdt + 2, [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]);
    stroke(ctx, i % 4 ? BRONZE : BRONZE_LIT, wdt, [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]);
  }
  shape(ctx, [-56, 0, -52, -26, -36, -32, -34, -96, -20, -110, 20, -110, 34, -96, 36, -32, 52, -26, 56, 0], MARBLE);
  box(ctx, MARBLE_LIT, -32, -94, 3, 62);
  shape(ctx, [-24, -86, 24, -86, 26, -36, -26, -36], '#3a5060');
  for (let i = 0; i < 5; i++) box(ctx, '#2a3c4a', -22 + i * 10, -84, 2, 48);
  shape(ctx, [-34, -32, 34, -32, 34, -24, -34, -24], MARBLE_LIT);
  for (let i = 0; i < 4; i++) {
    const x = -42 + i * 28;
    stroke(ctx, OUT, 3, [x, -24, x - 3, -36, x + 2, -46]);
    stroke(ctx, BRONZE, 1.6, [x, -24, x - 3, -36, x + 2, -46]);
  }
  add(ctx, '#c8d8ff', 0, -140, 40, 60, 0.15);
};

const PROPS: Record<string, PropFn> = {
  grecia_column: column,
  grecia_statue: statue,
  grecia_amphora: amphora,
  grecia_anchor: anchor,
  grecia_wreck: wreckProp,
  grecia_olive: oliveProp,
  grecia_nets: nets,
  grecia_awning: awning,
  grecia_shelf: shelf,
  grecia_lighthouse: lighthouseProp,
  grecia_gate: gate,
  grecia_throne: throne,
};

export const GRECIA_LIVE: ReadonlySet<string> = new Set(['grecia_gate', 'grecia_lighthouse', 'grecia_kelp', 'grecia_banner']);

export function greciaProp(ctx: Ctx, e: Decor): boolean {
  const f = PROPS[e.k];
  if (!f) return GRECIA_LIVE.has(e.k);
  ctx.save();
  ctx.translate(e.x * TILE, e.y * TILE);
  if (e.flip) ctx.scale(-1, 1);
  f(ctx, e, new RNG(Math.floor(e.x * 31 + e.y * 7)));
  ctx.restore();
  return true;
}

export function drawGreciaLive(ctx: Ctx, e: Decor, t: number) {
  const ph = hash2(e.x | 0, e.y | 0, 819) * TAU;
  ctx.save();
  ctx.translate(e.x * TILE, e.y * TILE);
  switch (e.k) {
    case 'grecia_kelp':
      KELP_LIVE(ctx, e, t);
      break;
    case 'grecia_lighthouse': {
      const fl = 0.85 + 0.15 * Math.sin(t * 9 + ph);
      add(ctx, '#ff9a40', 0, -142, 30 * fl, 26 * fl, 0.6);
      poly(ctx, [-6, -138, 0, -152 - 4 * fl, 6, -138], '#ffd080');
      poly(ctx, [-3, -138, 0, -146 - 2 * fl, 3, -138], '#fff4d0');
      break;
    }
    case 'grecia_banner': {
      // a sail-cloth pennant streaming hard in the storm
      const h = (e.h ?? 4) * TILE;
      stroke(ctx, OUT, 3, [0, 0, 0, -h - 18]);
      stroke(ctx, '#7a5a3a', 1.4, [0, 0, 0, -h - 18]);
      const pts = [1, -h - 16];
      for (let i = 1; i <= 6; i++) pts.push(1 + i * 6, -h - 16 + Math.sin(t * 6 + ph + i * 0.9) * 2.5 * (i / 6) + i * 0.4);
      for (let i = 6; i >= 1; i--) pts.push(1 + i * 6, -h - 4 + Math.sin(t * 6 + ph + i * 0.9) * 2.5 * (i / 6) + i * 0.4);
      pts.push(1, -h - 4);
      poly(ctx, pts, '#2a4a6a', OUT, 1);
      box(ctx, '#d8c8a0', 6, -h - 12, 8, 2);
      break;
    }
    case 'grecia_gate': {
      if (flag('ch10_boundary_open')) break;
      // the storm wall: wind-driven spray between the pylons, lightning crawling in it
      const a = 0.28 + 0.08 * Math.sin(t * 2.4);
      ctx.fillStyle = rgba('#8ab0c8', a);
      ctx.fillRect(-20, -108, 40, 108);
      ctx.strokeStyle = rgba('#e8f0ff', 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = -100 + ((i * 18 + t * 70) % 104);
        ctx.moveTo(-18, y);
        ctx.lineTo(18, y + 8);
      }
      ctx.stroke();
      if ((t * 1.7) % 3 < 0.15) stroke(ctx, '#f4f8ff', 1.5, [-4, -104, 4, -80, -3, -60, 5, -36]);
      add(ctx, '#a8c8e8', 0, -54, 30, 56, 0.25);
      break;
    }
  }
  ctx.restore();
}
