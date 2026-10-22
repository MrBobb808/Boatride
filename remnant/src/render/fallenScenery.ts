// Backdrops for Chapters VII–IX: five baked layers per room, from the far
// landmark of each Fallen Crown down to dark silhouettes framing the path.
// Each room has its own scenery: the room's place in its chapter is the last
// digit of its seed (0 hub, 1 trail, 2 depths, 3 side, 4 ridge, 5 throne).
//
// The hunt: Varkhos' crag-hall under its antler crown, snowfields, pinewoods
// lit by the moon, hunters' camps, a still lake where deer drink unhunted.
// Pestilence: the queen's hive-spire over a drowned town, willows, sunk boats,
// lantern towers, water that mirrors all of it. Cinders: the forge-mountain
// and Azkar's anvil-citadel, a district of stacks and gantries, the slag
// aqueduct, the procession of ash figures.

import { makeCanvas, rgba, mix, circle, poly, type Ctx } from './draw';
import { RNG } from '../core/math';
import { blob, wrapNoise, fillRidge, strokeRidge, reedSil } from './env4';
import type { BiomePal, Layer, ParallaxSteps } from './environment';
import type { FallenBiome } from './fallenEnv';

const TAU = Math.PI * 2;

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

function add(ctx: Ctx, c: string, x: number, y: number, rx: number, ry: number, a: number) {
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, c, x, y, rx, ry, a);
  ctx.globalCompositeOperation = 'source-over';
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

/** Soft mist lying along a line. */
function mist(ctx: Ctx, w: number, y: number, col: string, a: number, thick = 14) {
  ctx.globalCompositeOperation = 'lighter';
  for (let x = 0; x < w; x += 90) blob(ctx, col, x + 45, y, 110, thick, a);
  ctx.globalCompositeOperation = 'source-over';
}

/** Draw a scene, then its reflection in water below the line wl, darkened and broken by ripples. */
function reflect(ctx: Ctx, w: number, wl: number, depth: number, a: number, water: string, draw: () => void) {
  draw();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, wl, w, depth);
  ctx.clip();
  ctx.translate(0, wl * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = a;
  draw();
  ctx.restore();
  ctx.fillStyle = water;
  ctx.fillRect(0, wl, w, depth);
}

// ---------------------------------------------------------------- the hunt

/** A pine: tapering trunk, drooping tiers, snow on their shoulders, moonlight on the right edges. */
function pine(ctx: Ctx, x: number, base: number, h: number, col: string, snow: string | null, rim: string | null, rng: RNG) {
  box(ctx, col, x - h * 0.018, base - h * 0.3, h * 0.036, h * 0.3);
  const tiers = 5 + rng.int(0, 3);
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers, y = base - h * 0.12 - f * h * 0.8;
    const ww = h * (0.26 * (1 - f) + 0.05) * rng.range(0.85, 1.1), top = y - h * (0.2 - f * 0.08);
    poly(ctx, [x - ww, y, x - ww * 0.5, y - h * 0.05, x, top, x + ww * 0.5, y - h * 0.05, x + ww, y, x + ww * 0.3, y - h * 0.025, x, y - h * 0.01, x - ww * 0.3, y - h * 0.025], col);
    if (snow) poly(ctx, [x - ww * 0.62, y - h * 0.035, x, top, x + ww * 0.62, y - h * 0.035, x + ww * 0.3, y - h * 0.045, x, top + h * 0.05, x - ww * 0.35, y - h * 0.05], snow);
    if (rim) stroke(ctx, rim, Math.max(0.8, h * 0.008), [x + 1, top + 1, x + ww * 0.5, y - h * 0.045, x + ww, y]);
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

/** An antler: a beam sweeping out and up with tines off it. */
function antler(ctx: Ctx, x: number, y: number, s: number, dir: number, col: string, lw: number) {
  stroke(ctx, col, lw, [x, y, x + dir * s * 0.35, y - s * 0.3, x + dir * s * 0.55, y - s * 0.62, x + dir * s * 0.5, y - s]);
  for (const [ax, ay, bx, by] of [[0.3, 0.32, 0.12, 0.42], [0.5, 0.56, 0.32, 0.72], [0.53, 0.8, 0.75, 0.98]])
    stroke(ctx, col, lw * 0.75, [x + dir * s * ax, y - s * ay, x + dir * s * bx, y - s * by]);
}

/**
 * Varkhos' seat seen from afar: a crag of black rock, a long hall on it with
 * a steep roof and two watchtowers, and over the hall a crown of antlers the
 * size of oaks. Its windows burn.
 */
function throneCrag(ctx: Ctx, x: number, base: number, s: number, col: string, rim: string, rng: RNG) {
  const top = base - s * 0.9;
  const pts = [x - s * 0.55, base];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8, xx = x - s * 0.42 + f * s * 0.84;
    const yy = top + Math.abs(f - 0.5) * s * 0.5 + rng.range(-s * 0.04, s * 0.04);
    pts.push(xx, yy);
  }
  pts.push(x + s * 0.6, base);
  poly(ctx, pts, col);
  stroke(ctx, rim, 1, pts.slice(10, pts.length - 2));
  // the hall and its towers
  const hy = top + s * 0.02;
  box(ctx, col, x - s * 0.2, hy - s * 0.14, s * 0.4, s * 0.14);
  poly(ctx, [x - s * 0.24, hy - s * 0.14, x, hy - s * 0.32, x + s * 0.24, hy - s * 0.14], col);
  for (const sx of [-1, 1]) {
    box(ctx, col, x + sx * s * 0.26 - s * 0.03, hy - s * 0.3, s * 0.06, s * 0.3);
    poly(ctx, [x + sx * s * 0.26 - s * 0.05, hy - s * 0.3, x + sx * s * 0.26, hy - s * 0.4, x + sx * s * 0.26 + s * 0.05, hy - s * 0.3], col);
  }
  for (const sx of [-1, 1]) {
    antler(ctx, x + sx * s * 0.04, hy - s * 0.28, s * 0.5, sx, col, Math.max(2, s * 0.03));
    antler(ctx, x + sx * s * 0.04, hy - s * 0.28, s * 0.5, sx, rim, Math.max(0.6, s * 0.006));
  }
  for (let i = 0; i < 5; i++) {
    const wx = x - s * 0.16 + i * s * 0.08;
    box(ctx, '#ffb060', wx, hy - s * 0.09, Math.max(1, s * 0.02), Math.max(1.5, s * 0.04));
  }
  add(ctx, '#ff8a3a', x, hy - s * 0.08, s * 0.35, s * 0.12, 0.35);
  // a thread of smoke from the hall
  for (let j = 0; j < 5; j++) blob(ctx, '#1e1e2c', x + s * 0.1 + j * s * 0.08, hy - s * 0.45 - j * s * 0.12, s * (0.08 + j * 0.04), s * (0.05 + j * 0.02), 0.5);
}

/** A hunters' lodge of logs, a chimney smoking, a lit window. */
function lodge(ctx: Ctx, x: number, base: number, s: number, col: string, rim: string, rng: RNG) {
  box(ctx, col, x - s * 0.5, base - s * 0.45, s, s * 0.45);
  poly(ctx, [x - s * 0.62, base - s * 0.42, x, base - s * 0.9, x + s * 0.62, base - s * 0.42], col);
  stroke(ctx, '#c8ccd8', Math.max(1, s * 0.03), [x - s * 0.58, base - s * 0.44, x, base - s * 0.88, x + s * 0.58, base - s * 0.44]);
  box(ctx, col, x + s * 0.24, base - s * 0.95, s * 0.1, s * 0.3);
  box(ctx, '#ffb060', x - s * 0.2, base - s * 0.3, s * 0.12, s * 0.12);
  box(ctx, '#ffb060', x + s * 0.12, base - s * 0.3, s * 0.12, s * 0.12);
  add(ctx, '#ff9a40', x, base - s * 0.25, s * 0.5, s * 0.25, 0.3);
  stroke(ctx, rim, 1, [x + s * 0.5, base - s * 0.45, x + s * 0.5, base]);
  for (let j = 0; j < 6; j++) blob(ctx, '#3a3a4c', x + s * 0.29 + j * s * 0.12 + rng.range(-2, 2), base - s * 1.05 - j * s * 0.2, s * (0.1 + j * 0.05), s * (0.07 + j * 0.03), 0.45 - j * 0.05);
}

/** A hide tent, its door glowing. */
function tent(ctx: Ctx, x: number, base: number, s: number, col: string, lit: boolean) {
  stroke(ctx, col, Math.max(1, s * 0.05), [x - s * 0.2, base - s * 1.05, x + s * 0.1, base - s * 0.7]);
  stroke(ctx, col, Math.max(1, s * 0.05), [x + s * 0.2, base - s * 1.05, x - s * 0.1, base - s * 0.7]);
  poly(ctx, [x - s * 0.55, base, x, base - s * 0.85, x + s * 0.55, base], col);
  if (lit) {
    poly(ctx, [x - s * 0.12, base, x, base - s * 0.4, x + s * 0.12, base], '#d07a3a');
    add(ctx, '#ff8a3a', x, base - s * 0.1, s * 0.4, s * 0.2, 0.4);
  }
}

/** A deer, head raised; in the grove nothing hunts it. */
function deer(ctx: Ctx, x: number, base: number, s: number, col: string, dir: number, grazing: boolean) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, base - s * 0.62, s * 0.42, s * 0.17, 0, 0, TAU);
  ctx.fill();
  for (const lx of [-0.3, -0.18, 0.22, 0.32]) stroke(ctx, col, Math.max(1, s * 0.05), [x + lx * s, base - s * 0.55, x + lx * s + s * 0.02, base]);
  const nx = x + dir * s * 0.36, ny = base - s * 0.7;
  const hx = grazing ? nx + dir * s * 0.18 : nx + dir * s * 0.12, hy = grazing ? base - s * 0.12 : base - s * 1.08;
  stroke(ctx, col, Math.max(1.5, s * 0.1), [nx, ny, hx, hy]);
  ctx.beginPath();
  ctx.ellipse(hx + dir * s * 0.06, hy, s * 0.12, s * 0.06, dir * (grazing ? 1.2 : 0.3), 0, TAU);
  ctx.fill();
  if (!grazing) {
    antler(ctx, hx - dir * s * 0.02, hy - s * 0.04, s * 0.4, dir, col, Math.max(1, s * 0.03));
    antler(ctx, hx - dir * s * 0.04, hy - s * 0.04, s * 0.36, -dir, col, Math.max(1, s * 0.03));
  }
  stroke(ctx, col, Math.max(1, s * 0.04), [x - dir * s * 0.4, base - s * 0.68, x - dir * s * 0.48, base - s * 0.6]);
}

/** A totem: a pole with an antlered skull. */
function totem(ctx: Ctx, x: number, base: number, s: number, col: string) {
  box(ctx, col, x - s * 0.03, base - s, s * 0.06, s);
  poly(ctx, [x - s * 0.1, base - s, x + s * 0.1, base - s, x + s * 0.06, base - s * 0.86, x - s * 0.06, base - s * 0.86], col);
  for (const sx of [-1, 1]) antler(ctx, x + sx * s * 0.06, base - s * 0.98, s * 0.4, sx, col, Math.max(1, s * 0.04));
}

function huntOut(b: Builder) {
  const { mk, scatter, seed, slot, pal } = b;
  const ridge = slot === 4, grove = slot === 3, camp = slot === 0;
  const RIM = rgba('#c8d4f8', 0.55);
  // L0: snowfields under the moon, and — from the ridge and the trail — the crag-hall itself.
  mk(0.02, 0.02, (ctx, w, h) => {
    const hz = h * (ridge ? 0.84 : 0.8), n0 = wrapNoise(w, 150, seed, 4), n1 = wrapNoise(w, 50, seed + 1, 3);
    const peak = (x: number) => hz - 10 - n0(x) * h * 0.17 - n1(x) * 10;
    fillRidge(ctx, w, h, peak, '#8a90aa');
    fillRidge(ctx, w, h, (x) => peak(x) + 6 + n1(x) * 18 + n0(x) * 16, '#30344c');
    strokeRidge(ctx, w, peak, rgba('#e0e6f8', 0.6), 1, 0.5);
    // glaciers in the high clefts
    const fr = new RNG(seed + 3);
    for (let i = 0; i < 9; i++) {
      const x = fr.range(0, w), y = peak(x);
      poly(ctx, [x - 10, y + 6, x, y + 1, x + 8, y + 5, x + 2, y + fr.range(18, 34)], '#a8b0c8');
    }
    mist(ctx, w, hz - 4, '#40405a', 0.4, 18);
  }, b.res * 0.7);
  mk(0.04, 0.03, (ctx, w, h) => {
    const hz = h * 0.84, n = wrapNoise(w, 90, seed + 2, 3), col = '#232638';
    if (ridge || slot === 1) throneCrag(ctx, w * (ridge ? 0.36 : 0.26), hz + 4, ridge ? h * 0.19 : h * 0.15, '#2a2e42', RIM, new RNG(seed + 4));
    // a far forest ridge, the trees too small to tell apart
    const hy = (x: number) => hz - n(x) * h * 0.08;
    const fr = new RNG(seed + 5);
    for (let x = 0; x < w; x += fr.range(3, 7)) poly(ctx, [x - 3, hy(x) + 2, x, hy(x) - fr.range(6, 14), x + 3, hy(x) + 2], col);
    fillRidge(ctx, w, h, hy, col);
    mist(ctx, w, hz + 6, '#5a5068', 0.35, 16);
  }, b.res * 0.7);
  // L2: the pinewood, a lodge or the camp's tents, the lake in the grove.
  mk(0.1, 0.06, (ctx, w, h) => {
    const base = h * (grove ? 0.8 : 0.86), col = pal.mid, fr = new RNG(seed + 12), n = wrapNoise(w, 120, seed + 11, 3);
    const ground = (x: number) => base - n(x) * 12;
    const trees = () => scatter(w, fr, grove ? 30 : 14, grove ? 70 : 34, 50, (x, r) => pine(ctx, x, ground(x) + 4, r.range(80, 150), col, '#4a5068', RIM, r));
    if (grove) {
      // a still lake: the pines, the moon and the snow lie in it upside down
      const wl = base - 4;
      reflect(ctx, w, wl, h - wl, 0.55, rgba('#2a3a5a', 0.28), () => {
        new RNG(seed + 12);
        trees();
        fillRidge(ctx, w, wl, ground, col);
      });
      const lr = new RNG(seed + 15);
      ctx.fillStyle = rgba('#c8d8ff', 0.45);
      for (let i = 0; i < 40; i++) ctx.fillRect(lr.range(0, w), wl + lr.range(3, h - wl - 3), lr.range(6, 26), 1);
      scatter(w, lr, 160, 300, 30, (x, r) => deer(ctx, x, wl + 1, r.range(22, 30), col, r.chance(0.5) ? 1 : -1, r.chance(0.4)));
    } else {
      trees();
      if (camp) scatter(w, fr, 90, 160, 30, (x, r) => tent(ctx, x, ground(x) + 2, r.range(18, 26), col, r.chance(0.6)));
      else scatter(w, fr, 320, 520, 40, (x, r) => lodge(ctx, x, ground(x) + 2, r.range(30, 40), col, RIM, r));
      fillRidge(ctx, w, h, ground, col);
    }
    mist(ctx, w, base - 6, '#5a5068', 0.3);
  });
  // L3: nearer trunks, totems and racks on the path's edge.
  mk(0.2, 0.1, (ctx, w, h) => {
    const base = h * 0.9, col = mix(pal.mid, pal.near, 0.55), fr = new RNG(seed + 17);
    scatter(w, fr, 70, 150, 40, (x, r) => {
      const tw = r.range(6, 11);
      box(ctx, col, x - tw / 2, base - r.range(140, 220), tw, 230);
      bareTree(ctx, x, base - r.range(90, 140), r.range(60, 90), col, r);
      box(ctx, rgba('#c8d4f8', 0.2), x + tw / 2 - 1, base - 150, 1, 140);
    });
    if (!grove) scatter(w, fr, 160, 280, 30, (x, r) => totem(ctx, x, base + 2, r.range(36, 50), col));
    if (camp) scatter(w, fr, 200, 300, 30, (x) => {
      stroke(ctx, col, 2, [x - 14, base, x - 10, base - 26, x - 6, base]);
      stroke(ctx, col, 2, [x + 6, base, x + 10, base - 26, x + 14, base]);
      stroke(ctx, col, 2, [x - 12, base - 24, x + 12, base - 24]);
      for (let i = 0; i < 3; i++) poly(ctx, [x - 9 + i * 6, base - 24, x - 4 + i * 6, base - 24, x - 5 + i * 6, base - 10, x - 8 + i * 6, base - 10], col);
    });
    fillRidge(ctx, w, h, (x) => base + (grove ? 14 : 0) + Math.sin(x * 0.02) * 2, col);
    // snow lying on the near bank
    ctx.fillStyle = rgba('#c8ccd8', 0.35);
    for (let x = 0; x < w; x += fr.range(20, 60)) ctx.fillRect(x, base - 1, fr.range(10, 30), 2);
  });
  // L4: the dark frame — great trunks and hanging boughs close to the eye.
  mk(0.38, 0.15, (ctx, w, h) => {
    const base = h * 0.95, col = pal.near, fr = new RNG(seed + 22);
    scatter(w, fr, 220, 360, 50, (x, r) => {
      const tw = r.range(16, 26);
      box(ctx, col, x - tw / 2, 0, tw, base);
      bareTree(ctx, x, base * r.range(0.3, 0.5), r.range(110, 160), col, r);
      box(ctx, '#3a4058', x + tw / 2 - 2, base * 0.25, 2, base * 0.5);
      // a snow-heavy bough reaching into the path
      const by = h * r.range(0.25, 0.45), dir = r.chance(0.5) ? 1 : -1;
      poly(ctx, [x, by, x + dir * 90, by + 20, x + dir * 70, by + 28, x, by + 12], col);
      poly(ctx, [x, by - 1, x + dir * 90, by + 19, x + dir * 60, by + 16], '#5a6078');
    });
    fillRidge(ctx, w, h, () => base, col);
  });
}

function huntIn(b: Builder) {
  const { mk, scatter, seed, slot } = b;
  const hall = slot === 5;
  // L0: the den's back wall, earth and root, firelight pooled low; in the throne hall a vast antler crown carved in it.
  mk(0.04, 0.03, (ctx, w, h) => {
    const n = wrapNoise(w, 90, seed, 4), n2 = wrapNoise(w, 70, seed + 3, 3);
    box(ctx, '#140e10', 0, 0, w, h);
    ctx.fillStyle = 'rgba(60,40,36,0.4)';
    for (let y = h * 0.2; y < h; y += 9) ctx.fillRect(0, y + Math.sin(y) * 3, w, 1);
    if (hall) {
      for (let x = 256; x < w + 256; x += 512)
        for (const sx of [-1, 1]) {
          antler(ctx, x + sx * 30, h * 0.66, h * 0.3, sx, '#2c2024', 7);
          antler(ctx, x + sx * 30, h * 0.66, h * 0.3, sx, '#4a3a36', 2);
        }
    }
    fillCeil(ctx, w, (x) => h * 0.16 + n(x) * h * 0.12, '#2a1e22');
    fillRidge(ctx, w, h, (x) => h * 0.82 - n2(x) * h * 0.12, '#2a1e22');
    for (let x = 60; x < w; x += 220) add(ctx, '#8a4020', x, h * 0.78, 120, 60, 0.3);
    const fr = new RNG(seed + 4);
    ctx.strokeStyle = '#3a2a2a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 50; i++) {
      const x = fr.range(0, w), y = h * 0.16 + n(x) * h * 0.12 - 2;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + fr.range(-8, 8), y + 30, x + fr.range(-6, 6), y + fr.range(30, 100));
    }
    ctx.stroke();
    // great claw gashes in the wall
    for (let x = 140; x < w; x += 380)
      for (let i = 0; i < 3; i++) {
        stroke(ctx, '#0a0607', 4, [x + i * 16, h * 0.42, x + 30 + i * 16, h * 0.66]);
        stroke(ctx, 'rgba(160,90,60,0.35)', 1, [x + 1 + i * 16, h * 0.44, x + 29 + i * 16, h * 0.64]);
      }
  }, b.res * 0.7);
  // L1: rock pillars, bone niches with skulls, wall torches.
  mk(0.1, 0.06, (ctx, w, h) => {
    const col = '#1e1418', base = h * 0.86, fr = new RNG(seed + 8);
    scatter(w, fr, 120, 220, 40, (x, r) => {
      const pw = r.range(26, 44);
      poly(ctx, [x - pw / 2, 0, x + pw / 2, 0, x + pw * 0.4, h * 0.3, x + pw * 0.55, base, x - pw * 0.55, base, x - pw * 0.4, h * 0.3], col);
      stroke(ctx, 'rgba(200,120,80,0.18)', 1, [x + pw * 0.4, h * 0.3, x + pw * 0.55, base]);
      for (let i = 0; i < 3; i++) {
        const ny = h * (0.4 + i * 0.12);
        box(ctx, '#0c0809', x - 7, ny, 14, 9);
        circle(ctx, x, ny + 5, 3, '#8a7c6a');
      }
    });
    scatter(w, fr, 160, 260, 10, (x) => {
      box(ctx, '#2a1c14', x - 1, h * 0.55, 2, 10);
      add(ctx, '#ff8a3a', x, h * 0.54, 26, 26, 0.55);
      circle(ctx, x, h * 0.545, 2.5, '#ffd090');
    });
    fillRidge(ctx, w, h, () => base, col);
  }, b.res * 0.8);
  // L2: bone heaps, cages and (in the hall) antler chandeliers.
  mk(0.16, 0.08, (ctx, w, h) => {
    const col = '#1a1216', base = h * 0.88, fr = new RNG(seed + 14);
    scatter(w, fr, 60, 140, 40, (x, r) => poly(ctx, [x - r.range(8, 18), 0, x + r.range(8, 18), 0, x, r.range(50, 140)], col));
    scatter(w, fr, 90, 180, 50, (x, r) => {
      const s = r.range(26, 44);
      poly(ctx, [x - s, base + 2, x - s * 0.5, base - s * 0.35, x, base - s * 0.45, x + s * 0.6, base - s * 0.3, x + s, base + 2], col);
      for (let i = 0; i < 4; i++) {
        const rx = x + r.range(-0.5, 0.4) * s;
        stroke(ctx, '#3a2e2c', Math.max(1, s * 0.05), [rx, base - s * 0.3, rx + s * 0.15, base - s * 0.7, rx + s * 0.32, base - s * 0.35]);
      }
      circle(ctx, x + r.range(-0.3, 0.3) * s, base - s * 0.42, s * 0.12, '#4a3e38');
    });
    scatter(w, fr, hall ? 160 : 280, hall ? 260 : 440, 40, (x, r) => {
      const y = h * r.range(0.24, 0.34);
      box(ctx, col, x, 0, 1.5, y);
      if (hall || r.chance(0.5)) {
        for (const sx of [-1, 1]) antler(ctx, x, y, 34, sx, col, 3);
        for (const sx of [-1, 1]) add(ctx, '#ff9a40', x + sx * 18, y - 32, 12, 12, 0.5);
      } else {
        box(ctx, col, x - 12, y, 24, 2);
        for (let i = 0; i < 5; i++) box(ctx, col, x - 12 + i * 6, y, 1.5, 30);
        box(ctx, col, x - 12, y + 30, 24, 2);
      }
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  // L3/L4: roots and stalactites close by.
  mk(0.3, 0.12, (ctx, w, h) => {
    const col = '#100a0c', fr = new RNG(seed + 20);
    scatter(w, fr, 120, 220, 40, (x, r) => poly(ctx, [x - r.range(12, 22), 0, x + r.range(12, 22), 0, x + 4, r.range(60, 120), x, r.range(90, 150), x - 4, r.range(50, 100)], col));
    scatter(w, fr, 100, 200, 30, (x, r) => {
      for (let i = 0; i < 4; i++) stroke(ctx, col, 2, [x + i * 5, 0, x + i * 5 + r.range(-10, 10), r.range(60, 140)]);
    });
  });
  mk(0.42, 0.16, (ctx, w, h) => {
    const col = '#080506', fr = new RNG(seed + 24);
    scatter(w, fr, 200, 340, 40, (x, r) => poly(ctx, [x - r.range(18, 30), 0, x + r.range(18, 30), 0, x + 6, r.range(90, 160), x - 6, r.range(70, 120)], col));
    fillRidge(ctx, w, h, (x) => h * 0.97 - Math.abs(Math.sin(x * 0.013)) * 10, col);
  });
}

// ---------------------------------------------------------------- pestilence

/** A willow: a crooked trunk, clumped crown, curtains of moss to the water. */
function willow(ctx: Ctx, x: number, base: number, h: number, col: string, moss: string, rng: RNG) {
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
    const f = i / 6 - 0.5, ox = f * h * 0.56, oy = f * f * h * 0.3;
    ctx.moveTo(cx + ox + h * 0.12, cy + oy);
    ctx.ellipse(cx + ox, cy + oy, h * 0.12, h * 0.08, 0, 0, TAU);
  }
  ctx.fill();
  for (let i = 0; i < 10; i++) {
    const f = i / 9 - 0.5, x0 = cx + f * h * 0.56, y0 = cy + f * f * h * 0.3, len = rng.range(0.2, 0.5) * h;
    poly(ctx, [x0 - h * 0.04, y0, x0 + h * 0.04, y0, x0 + h * 0.03, y0 + len * 0.85, x0, y0 + len, x0 - h * 0.03, y0 + len * 0.8], col);
  }
  ctx.strokeStyle = moss;
  ctx.lineWidth = Math.max(0.8, h * 0.008);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const sx = cx + rng.range(-0.28, 0.28) * h, sy = cy + rng.range(0, 0.06) * h;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + rng.range(-2, 2), sy + rng.range(0.1, 0.3) * h);
  }
  ctx.stroke();
}

/** A giant fungus whose gills glow. */
function fungus(ctx: Ctx, x: number, base: number, h: number, col: string, glowCol: string | null, rng: RNG) {
  const lean = rng.range(-0.15, 0.15) * h;
  stroke(ctx, col, Math.max(1.5, h * 0.08), [x, base, x + lean * 0.5, base - h * 0.5, x + lean, base - h]);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x + lean, base - h, h * 0.42, h * 0.2, 0, Math.PI, TAU);
  ctx.fill();
  if (glowCol) {
    box(ctx, glowCol, x + lean - h * 0.38, base - h, h * 0.76, Math.max(1, h * 0.03));
    add(ctx, glowCol, x + lean, base - h + h * 0.02, h * 0.4, h * 0.08, 0.5);
  }
}

/** A drowned house: a leaning gable, its windows lit green or dark. */
function house(ctx: Ctx, x: number, base: number, s: number, col: string, lit: string | null, rng: RNG) {
  const w = s * rng.range(0.8, 1.3), hh = s * rng.range(0.6, 1), tilt = rng.range(-0.08, 0.08) * s;
  poly(ctx, [x, base, x + tilt, base - hh, x + w * 0.5 + tilt, base - hh - s * 0.5, x + w + tilt, base - hh, x + w, base], col);
  if (rng.chance(0.4)) box(ctx, col, x + w * 0.7 + tilt, base - hh - s * 0.6, s * 0.12, s * 0.3);
  if (lit && rng.chance(0.45)) {
    box(ctx, lit, x + w * 0.35 + tilt * 0.5, base - hh * 0.6, Math.max(1, s * 0.12), Math.max(1, s * 0.16));
    add(ctx, lit, x + w * 0.4, base - hh * 0.55, s * 0.3, s * 0.2, 0.25);
  }
}

/**
 * Morvane's hive-spire: lumps of wax and bone stacked into a tower that leans
 * as it climbs, its comb-mouths glowing, the swarm turning about its crown.
 */
function hiveSpire(ctx: Ctx, x: number, base: number, s: number, col: string, glowCol: string, rng: RNG) {
  let y = base, cx = x, r = s * 0.22;
  const cells: number[] = [];
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, y - r * 0.6, r, r * 0.8, 0, 0, TAU);
    ctx.fill();
    for (let j = 0; j < 2; j++) if (rng.chance(0.6)) cells.push(cx + rng.range(-0.6, 0.6) * r, y - r * rng.range(0.3, 0.9));
    y -= r * 1.1;
    cx += rng.range(-0.15, 0.25) * r;
    r *= 0.86;
  }
  poly(ctx, [cx - r, y, cx, y - s * 0.3, cx + r, y], col);
  for (let i = 0; i < cells.length; i += 2) {
    box(ctx, glowCol, cells[i], cells[i + 1], Math.max(1, s * 0.03), Math.max(1, s * 0.03));
    add(ctx, glowCol, cells[i], cells[i + 1], s * 0.06, s * 0.06, 0.35);
  }
  // the swarm about the crown
  ctx.fillStyle = col;
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, TAU), d = rng.range(0.1, 0.6) * s;
    ctx.fillRect(cx + Math.cos(a) * d * 1.4, y - s * 0.15 + Math.sin(a) * d * 0.5, 1.5, 1.5);
  }
  add(ctx, glowCol, x, base - s * 0.5, s * 0.5, s * 0.6, 0.18);
}

/** A boat half sunk, its mast leaning. */
function boat(ctx: Ctx, x: number, wl: number, s: number, col: string) {
  poly(ctx, [x - s * 0.5, wl - s * 0.15, x + s * 0.5, wl - s * 0.3, x + s * 0.35, wl + 2, x - s * 0.4, wl + 2], col);
  stroke(ctx, col, Math.max(1, s * 0.05), [x, wl - s * 0.2, x + s * 0.25, wl - s * 1.1]);
  stroke(ctx, col, Math.max(0.8, s * 0.02), [x + s * 0.25, wl - s * 1.1, x + s * 0.6, wl - s * 0.25]);
}

/** A lantern tower of the quarantine: a tall post-house with a green-gold lamp. */
function lanternTower(ctx: Ctx, x: number, base: number, s: number, col: string) {
  box(ctx, col, x - s * 0.06, base - s, s * 0.12, s);
  poly(ctx, [x - s * 0.16, base - s, x, base - s * 1.22, x + s * 0.16, base - s], col);
  box(ctx, col, x - s * 0.12, base - s * 0.98, s * 0.24, s * 0.08);
  box(ctx, '#e8e070', x - s * 0.05, base - s * 0.95, s * 0.1, s * 0.1);
  add(ctx, '#d8f080', x, base - s * 0.9, s * 0.45, s * 0.45, 0.45);
  // the yellow cloth of quarantine
  poly(ctx, [x + s * 0.06, base - s * 0.8, x + s * 0.3, base - s * 0.76, x + s * 0.26, base - s * 0.62, x + s * 0.06, base - s * 0.66], '#a89038');
}

function plagueOut(b: Builder) {
  const { mk, scatter, seed, slot, pal } = b;
  const town = slot === 0 || slot === 3, causeway = slot === 4;
  const LIT = '#b8e070';
  // L0: the drowned town far off and, always in sight, the queen's spire.
  mk(0.02, 0.02, (ctx, w, h) => {
    const hz = h * 0.8, n = wrapNoise(w, 160, seed, 3);
    fillRidge(ctx, w, h, (x) => hz - 16 - n(x) * h * 0.12, '#3e5c44');
    hiveSpire(ctx, w * (causeway ? 0.34 : 0.26), hz + 4, h * (causeway ? 0.18 : 0.14), '#22382a', '#a8e060', new RNG(seed + 6));
    const fr = new RNG(seed + 2);
    scatter(w, fr, 22, 50, 30, (x, r) => house(ctx, x, hz + 2, r.range(12, 20), '#2c4434', LIT, r));
    box(ctx, '#2c4434', 0, hz, w, h - hz);
    ctx.fillStyle = rgba('#a8c878', 0.22);
    for (let i = 0; i < 60; i++) ctx.fillRect(fr.range(0, w), hz + fr.range(2, h - hz - 2), fr.range(6, 30), 1);
    mist(ctx, w, hz, '#5a7a48', 0.4, 18);
  }, b.res * 0.7);
  // L1: lantern towers and roofs of the quarantine, or a line of dead trees over the marsh.
  mk(0.05, 0.035, (ctx, w, h) => {
    const wl = h * 0.83, col = '#24382a', fr = new RNG(seed + 8);
    reflect(ctx, w, wl, h - wl, 0.3, rgba('#1c2c1e', 0.55), () => {
      const r0 = new RNG(seed + 9);
      if (town) {
        scatter(w, r0, 26, 60, 30, (x, r) => house(ctx, x, wl + 1, r.range(18, 30), col, LIT, r));
        scatter(w, r0, 150, 260, 20, (x, r) => lanternTower(ctx, x, wl + 1, r.range(50, 70), col));
      } else {
        scatter(w, r0, 40, 90, 40, (x, r) => bareTree(ctx, x, wl + 1, r.range(50, 90), col, r));
        scatter(w, r0, 200, 360, 20, (x, r) => lanternTower(ctx, x, wl + 1, r.range(40, 56), col));
      }
      fillRidge(ctx, w, wl + 2, () => wl - 2, col);
    });
    ctx.fillStyle = rgba('#c8e090', 0.3);
    for (let i = 0; i < 50; i++) ctx.fillRect(fr.range(0, w), wl + fr.range(3, h - wl - 3), fr.range(6, 26), 1);
    mist(ctx, w, wl, '#6a8a50', 0.3);
  }, b.res * 0.8);
  // L2: willows over the bog, giant fungi, boats sunk at their moorings.
  mk(0.11, 0.06, (ctx, w, h) => {
    const base = h * 0.86, col = pal.mid, fr = new RNG(seed + 12), n = wrapNoise(w, 100, seed + 13, 3);
    const ground = (x: number) => base - n(x) * 8;
    scatter(w, fr, 70, 150, 70, (x, r) => willow(ctx, x, ground(x) + 2, r.range(90, 150), col, '#4a6a3c', r));
    scatter(w, fr, 40, 90, 30, (x, r) => fungus(ctx, x, ground(x) + 2, r.range(18, 34), col, '#9ae060', r));
    if (!town) scatter(w, fr, 180, 320, 30, (x, r) => boat(ctx, x, ground(x) + 1, r.range(24, 34), col));
    fillRidge(ctx, w, h, ground, col);
    strokeRidge(ctx, w, ground, rgba('#a8d070', 0.35), 1);
    mist(ctx, w, base - 4, '#6a8a50', 0.35);
  });
  // L3: reeds, fungus stalks, broken fences and the quarantine's ropes.
  mk(0.22, 0.1, (ctx, w, h) => {
    const base = h * 0.91, col = mix(pal.mid, pal.near, 0.55), fr = new RNG(seed + 17);
    scatter(w, fr, 40, 90, 40, (x, r) => reedSil(ctx, x - 20, base + 3, 40, r.range(26, 50), col, r));
    scatter(w, fr, 120, 220, 40, (x, r) => fungus(ctx, x, base + 2, r.range(36, 60), col, '#7ad040', r));
    scatter(w, fr, 160, 260, 50, (x, r) => {
      for (let i = 0; i < 5; i++) box(ctx, col, x + i * 9, base - r.range(14, 22), 3, 24);
      stroke(ctx, col, 1.5, [x, base - 12, x + 40, base - 10]);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  // L4: dark reeds and hanging moss close to the eye.
  mk(0.4, 0.15, (ctx, w, h) => {
    const base = h * 0.95, col = pal.near, fr = new RNG(seed + 22);
    scatter(w, fr, 30, 70, 40, (x, r) => reedSil(ctx, x - 20, base + 4, 46, r.range(40, 80), col, r));
    scatter(w, fr, 200, 340, 60, (x, r) => {
      const y = h * r.range(0.1, 0.25);
      stroke(ctx, col, 8, [x - 60, 0, x - 20, y, x + 40, y - 10, x + 80, 0]);
      for (let i = 0; i < 12; i++) stroke(ctx, col, 1.5, [x - 40 + i * 9, y - 4, x - 40 + i * 9 + r.range(-2, 2), y + r.range(20, 80)]);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
}

function plagueIn(b: Builder) {
  const { mk, scatter, seed, slot } = b;
  const hive = slot === 5;
  // L0: the far wall — comb in the hive, tiled brick and great vats in the sporeworks.
  mk(0.04, 0.03, (ctx, w, h) => {
    box(ctx, '#0e1a12', 0, 0, w, h);
    if (hive) {
      const s = 12, fr = new RNG(seed + 1);
      for (let row = 0, y = 0; y < h; row++, y += s * 1.5)
        for (let x = (row & 1) * s * 0.87; x < w; x += s * 1.74) {
          ctx.fillStyle = fr.chance(0.06) ? '#3a6a2a' : '#162a1a';
          ctx.beginPath();
          for (let a = 0; a < 6; a++) ctx.lineTo(x + Math.cos((a / 6) * TAU + Math.PI / 6) * s * 0.92, y + Math.sin((a / 6) * TAU + Math.PI / 6) * s * 0.92);
          ctx.fill();
        }
      for (let x = 40; x < w; x += 160) add(ctx, '#6ac040', x, h * 0.6, 60, 80, 0.2);
    } else {
      ctx.fillStyle = '#16261a';
      for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 0 : 12; x < w; x += 24) ctx.fillRect(x, y, 22, 8);
      for (let y = h * 0.3; y < h; y += 60) box(ctx, '#24442c', 0, y, w, 4);
    }
    fillCeil(ctx, w, () => h * 0.1, '#0a140c');
  }, b.res * 0.7);
  // L1: vats or wax pillars, their glow.
  mk(0.08, 0.05, (ctx, w, h) => {
    const col = '#14241a', base = h * 0.86, fr = new RNG(seed + 2);
    scatter(w, fr, 120, 200, 70, (x, r) => {
      if (hive) {
        const pw = r.range(30, 50);
        poly(ctx, [x - pw / 2, 0, x + pw / 2, 0, x + pw * 0.3, h * 0.4, x + pw * 0.6, base, x - pw * 0.6, base, x - pw * 0.3, h * 0.4], col);
        for (let i = 0; i < 4; i++) add(ctx, '#7ad040', x + r.range(-8, 8), h * r.range(0.3, 0.8), 6, 6, 0.6);
        return;
      }
      const vw = r.range(40, 64), vh = r.range(90, 150);
      box(ctx, col, x - vw / 2, base - vh, vw, vh);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, base - vh, vw / 2, vw * 0.22, 0, Math.PI, TAU);
      ctx.fill();
      for (const f of [0.6, 0.25]) box(ctx, '#2a4430', x - vw / 2, base - vh * f, vw, 3);
      add(ctx, '#6ac040', x, base - vh * 0.45, vw * 0.35, vh * 0.2, 0.35);
      circle(ctx, x, base - vh * 0.45, 5, '#9ae070');
      box(ctx, col, x + vw / 2, base - vh * 0.8, r.range(30, 70), 6);
      box(ctx, col, x - 3, 0, 6, base - vh - vw * 0.2);
    });
    fillRidge(ctx, w, h, () => base, col);
    // a channel of bile along the floor
    box(ctx, '#2a4a14', 0, base - 3, w, 3);
    for (let x = 0; x < w; x += 70) add(ctx, '#8ae040', x + 35, base - 2, 40, 6, 0.35);
  }, b.res * 0.8);
  // L2: catwalks and hanging cocoons.
  mk(0.15, 0.08, (ctx, w, h) => {
    const col = '#0c1810', fr = new RNG(seed + 12), base = h * 0.9;
    if (!hive) {
      box(ctx, col, 0, h * 0.42, w, 4);
      for (let x = 0; x < w; x += 18) stroke(ctx, col, 1, [x, h * 0.42 + 4, x + 9, h * 0.42 + 14, x + 18, h * 0.42 + 4]);
      box(ctx, col, 0, h * 0.42 + 14, w, 2);
    }
    scatter(w, fr, 50, 120, 20, (x, r) => {
      const len = r.range(30, hive ? 180 : 120);
      box(ctx, col, x, 0, 1, len);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, len + 12, 6, 14, 0, 0, TAU);
      ctx.fill();
      if (r.chance(0.3)) add(ctx, '#7ad040', x, len + 12, 6, 12, 0.4);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  mk(0.3, 0.12, (ctx, w, h) => {
    const col = '#081008', fr = new RNG(seed + 18);
    box(ctx, col, 0, 0, w, 10);
    scatter(w, fr, 90, 180, 20, (x, r) => box(ctx, col, x, 0, r.range(10, 18), r.range(30, 70)));
    for (let i = 0; i < 60; i++) {
      const x = fr.range(0, w);
      stroke(ctx, col, 1.5, [x, 10, x + fr.range(-2, 2), fr.range(30, 110)]);
    }
  });
  mk(0.42, 0.16, (ctx, w, h) => {
    const col = '#040804', fr = new RNG(seed + 22);
    scatter(w, fr, 220, 360, 40, (x, r) => {
      const pw = r.range(14, 22);
      box(ctx, col, x, 0, pw, h);
      for (let y = 30; y < h; y += 70) box(ctx, col, x - 3, y, pw + 6, 6);
    });
    fillRidge(ctx, w, h, () => h * 0.97, col);
  });
}

// ---------------------------------------------------------------- cinders

/** A foundry block: a tower with stacks, a gantry arm and lit windows. */
function foundry(ctx: Ctx, x: number, base: number, s: number, col: string, lit: string, rng: RNG) {
  const w = s * rng.range(0.5, 0.75), hh = s * rng.range(0.8, 1.6);
  box(ctx, col, x, base - hh, w, hh);
  poly(ctx, [x - s * 0.06, base - hh, x + w * 0.5, base - hh - s * 0.18, x + w + s * 0.06, base - hh], col);
  for (let k = 0; k < rng.int(1, 3); k++) {
    const cx = x + w * rng.range(0.1, 0.7), ch = s * rng.range(0.5, 1.1);
    box(ctx, col, cx, base - hh - ch, s * 0.09, ch);
    box(ctx, col, cx - s * 0.02, base - hh - ch, s * 0.13, s * 0.04);
    add(ctx, '#ff7a30', cx + s * 0.045, base - hh - ch, s * 0.08, s * 0.05, 0.35);
  }
  if (rng.chance(0.6)) {
    box(ctx, col, x + w, base - hh * 0.7, s * 0.4, s * 0.03);
    box(ctx, col, x + w + s * 0.36, base - hh * 0.7, s * 0.02, s * 0.2);
  }
  for (let i = 0; i < 6; i++) if (rng.chance(0.6)) box(ctx, lit, x + w * (0.15 + (i % 3) * 0.28), base - hh * (i < 3 ? 0.35 : 0.65), Math.max(1, s * 0.07), Math.max(1, s * 0.11));
}

/** A smoke plume: billows that widen and fade as they rise. */
function plume(ctx: Ctx, x: number, y: number, s: number, col: string, lean: number) {
  for (let j = 0; j < 7; j++) {
    const f = j / 7;
    blob(ctx, col, x + f * lean * s, y - f * s * 1.6, s * (0.12 + f * 0.4), s * (0.08 + f * 0.2), 0.55 * (1 - f * 0.6));
  }
}

/**
 * Azkar's citadel: a fortress cast in the shape of an anvil on the shoulder of
 * the forge-mountain, a hammer-crane over it, its horn-end pouring slag.
 */
function anvilCitadel(ctx: Ctx, x: number, base: number, s: number, col: string) {
  poly(ctx, [x - s * 0.6, base, x - s * 0.3, base - s * 0.35, x + s * 0.3, base - s * 0.35, x + s * 0.6, base], col);
  const top = base - s * 0.35;
  poly(ctx, [x - s * 0.18, top, x - s * 0.24, top - s * 0.18, x - s * 0.4, top - s * 0.22, x - s * 0.62, top - s * 0.3, x + s * 0.34, top - s * 0.3, x + s * 0.34, top - s * 0.18, x + s * 0.2, top - s * 0.14, x + s * 0.16, top], col);
  for (let i = 0; i < 4; i++) box(ctx, col, x - s * 0.15 + i * s * 0.12, top - s * 0.42, s * 0.05, s * 0.12);
  // the hammer-crane
  box(ctx, col, x + s * 0.28, top - s * 0.75, s * 0.04, s * 0.45);
  box(ctx, col, x - s * 0.1, top - s * 0.75, s * 0.42, s * 0.03);
  box(ctx, col, x - s * 0.06, top - s * 0.72, s * 0.01, s * 0.2);
  box(ctx, col, x - s * 0.13, top - s * 0.52, s * 0.15, s * 0.08);
  for (let i = 0; i < 6; i++) box(ctx, '#ff9a40', x - s * 0.1 + i * s * 0.07, top - s * 0.24, Math.max(1, s * 0.015), Math.max(1.5, s * 0.03));
  // slag pouring from the horn down the mountainside
  ctx.globalCompositeOperation = 'lighter';
  stroke(ctx, 'rgba(255,120,40,0.8)', Math.max(1.5, s * 0.02), [x - s * 0.62, top - s * 0.28, x - s * 0.66, top, x - s * 0.7, base + s * 0.2]);
  blob(ctx, '#ff6a20', x - s * 0.68, base, s * 0.18, s * 0.08, 0.5);
  blob(ctx, '#ff8a3a', x, top - s * 0.2, s * 0.4, s * 0.15, 0.3);
  ctx.globalCompositeOperation = 'source-over';
}

/** Aqueduct arches carrying a channel of slag, falls of it where the stone has broken. */
function aqueduct(ctx: Ctx, w: number, top: number, base: number, col: string, rng: RNG) {
  box(ctx, col, 0, top, w, 10);
  const span = 64;
  ctx.fillStyle = col;
  for (let x = 0; x < w; x += span) {
    ctx.beginPath();
    ctx.moveTo(x, top + 10);
    ctx.lineTo(x + span, top + 10);
    ctx.lineTo(x + span, base);
    ctx.lineTo(x + span - 10, base);
    ctx.lineTo(x + span - 10, top + 40);
    ctx.arc(x + span / 2, top + 40, span / 2 - 10, 0, Math.PI, true);
    ctx.lineTo(x + 10, base);
    ctx.lineTo(x, base);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  box(ctx, 'rgba(255,120,40,0.85)', 0, top - 2, w, 2);
  for (let x = 0; x < w; x += 80) blob(ctx, '#ff6a20', x + 40, top - 2, 50, 6, 0.4);
  for (let i = 0; i < 3; i++) {
    const x = rng.range(20, w - 20);
    stroke(ctx, 'rgba(255,140,60,0.75)', 2, [x, top + 4, x + rng.range(-3, 3), base]);
    blob(ctx, '#ff7a2a', x, base, 24, 8, 0.5);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Ash figures kneeling in a line along the procession road. */
function kneeler(ctx: Ctx, x: number, base: number, s: number, col: string) {
  poly(ctx, [x - s * 0.3, base, x - s * 0.25, base - s * 0.25, x - s * 0.12, base - s * 0.62, x + s * 0.12, base - s * 0.62, x + s * 0.2, base - s * 0.3, x + s * 0.35, base], col);
  circle(ctx, x, base - s * 0.72, s * 0.11, col);
  stroke(ctx, col, Math.max(1, s * 0.08), [x - s * 0.1, base - s * 0.55, x - s * 0.22, base - s * 0.9]);
  stroke(ctx, col, Math.max(1, s * 0.08), [x + s * 0.1, base - s * 0.55, x + s * 0.22, base - s * 0.92]);
}

/** A gantry crane with a crucible on its chain, glowing. */
function crane(ctx: Ctx, x: number, base: number, s: number, col: string) {
  for (const sx of [-1, 1]) stroke(ctx, col, Math.max(2, s * 0.03), [x + sx * s * 0.25, base, x + sx * s * 0.08, base - s]);
  stroke(ctx, col, Math.max(2, s * 0.04), [x - s * 0.2, base - s, x + s * 0.7, base - s]);
  stroke(ctx, col, 1, [x + s * 0.55, base - s, x + s * 0.55, base - s * 0.55]);
  poly(ctx, [x + s * 0.47, base - s * 0.55, x + s * 0.63, base - s * 0.55, x + s * 0.6, base - s * 0.42, x + s * 0.5, base - s * 0.42], col);
  add(ctx, '#ff8a3a', x + s * 0.55, base - s * 0.56, s * 0.12, s * 0.06, 0.6);
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

function cinderOut(b: Builder) {
  const { mk, scatter, seed, slot, pal } = b;
  const procession = slot === 1, aqueductRoom = slot === 4;
  // L0: the forge-mountain, lava on its flanks, and Azkar's citadel on its shoulder.
  mk(0.02, 0.02, (ctx, w, h) => {
    const hz = h * 0.8, n = wrapNoise(w, 70, seed, 3), cx = w * 0.36;
    const cone = (x: number) => {
      const d = Math.abs(((x - cx + w * 1.5) % w) - w * 0.5) / (w * 0.5);
      return hz - Math.max(0, 1 - d * 1.5) * h * 0.24 - n(x) * 14;
    };
    fillRidge(ctx, w, h, cone, '#3a2428');
    strokeRidge(ctx, w, cone, 'rgba(255,140,80,0.3)', 1);
    const fr = new RNG(seed + 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ff7a30', 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    // lava runs down the flanks; a run never leaves the mountain's face
    for (let i = 0; i < 4; i++) {
      let x = cx + fr.range(-14, 14), y = cone(x) + 4;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += fr.range(-4, 4) + (i - 1.5) * 4;
        y = Math.max(y + fr.range(6, 12), cone(x) + 3);
        if (y > hz) break;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    blob(ctx, '#ff6a20', cx, cone(cx), 60, 26, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    plume(ctx, cx, cone(cx) - 8, h * 0.3, '#2a181c', 0.6);
    anvilCitadel(ctx, cx - w * 0.17, cone(cx - w * 0.17) + 8, h * 0.13, '#24161a');
    fillRidge(ctx, w, h, (x) => hz + 4 - n(x + 300) * 20, '#2c1c20');
  }, b.res * 0.7);
  // L1: the foundry district — stacks, smoke and furnace light.
  mk(0.05, 0.035, (ctx, w, h) => {
    const base = h * 0.84, col = '#2a1c20', fr = new RNG(seed + 8);
    scatter(w, fr, 30, 70, 50, (x, r) => foundry(ctx, x, base, r.range(40, 70), col, '#c8703a', r));
    scatter(w, fr, 140, 240, 40, (x, r) => plume(ctx, x, base - r.range(80, 120), r.range(50, 80), '#2a1c20', r.range(0.3, 0.8)));
    box(ctx, col, 0, base, w, h - base);
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 30; x < w; x += 120) blob(ctx, '#ff6a20', x, base, 70, 14, 0.25);
    ctx.globalCompositeOperation = 'source-over';
  }, b.res * 0.8);
  // L2: the aqueduct of slag, the procession road of ash figures, or the nearer foundries.
  mk(0.11, 0.06, (ctx, w, h) => {
    const base = h * 0.88, col = pal.mid, fr = new RNG(seed + 12);
    if (aqueductRoom) aqueduct(ctx, w, h * 0.6, base, col, fr);
    else scatter(w, fr, 60, 130, 60, (x, r) => foundry(ctx, x, base, r.range(70, 110), col, '#e08a40', r));
    if (procession) {
      box(ctx, col, 0, base - 18, w, 18);
      scatter(w, fr, 22, 34, 10, (x, r) => kneeler(ctx, x, base - 18, r.range(18, 24), col));
      for (let x = 60; x < w; x += 180) {
        box(ctx, col, x, base - 80, 3, 62);
        poly(ctx, [x + 3, base - 80, x + 24, base - 76, x + 20, base - 54, x + 3, base - 58], '#5a2a20');
      }
    }
    fillRidge(ctx, w, h, () => base, col);
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 30; x < w; x += 160) blob(ctx, '#ff7a30', x, base, 80, 12, 0.2);
    ctx.globalCompositeOperation = 'source-over';
  });
  // L3: cranes with crucibles, pipe runs and chains.
  mk(0.22, 0.1, (ctx, w, h) => {
    const base = h * 0.92, col = mix(pal.mid, pal.near, 0.55), fr = new RNG(seed + 17);
    scatter(w, fr, 180, 300, 70, (x, r) => crane(ctx, x, base, r.range(90, 130), col));
    box(ctx, col, 0, h * 0.5, w, 8);
    for (let x = 0; x < w; x += 64) box(ctx, col, x, h * 0.5 - 3, 6, 14);
    scatter(w, fr, 120, 220, 20, (x, r) => stroke(ctx, col, 7, [x, h * 0.5 + 8, x, base - r.range(0, 40), x + r.range(20, 50), base - r.range(0, 30)]));
    fillRidge(ctx, w, h, () => base, col);
  });
  // L4: girders and hanging hooks, very near.
  mk(0.4, 0.15, (ctx, w, h) => {
    const base = h * 0.95, col = pal.near, fr = new RNG(seed + 22);
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
}

function cinderIn(b: Builder) {
  const { mk, scatter, seed, slot } = b;
  const throne = slot === 5;
  // L0: the far wall — brick and furnace mouths; in the throne hall a colossal anvil in relief.
  mk(0.04, 0.03, (ctx, w, h) => {
    const base = h * 0.86, fr = new RNG(seed + 2);
    box(ctx, '#20120e', 0, 0, w, h);
    ctx.fillStyle = '#2a1812';
    for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 0 : 12; x < w; x += 24) ctx.fillRect(x, y, 22, 8);
    if (throne)
      for (let x = 256; x < w + 256; x += 512) {
        poly(ctx, [x - 120, h * 0.42, x + 140, h * 0.42, x + 100, h * 0.5, x + 40, h * 0.52, x + 50, h * 0.66, x - 50, h * 0.66, x - 40, h * 0.52, x - 90, h * 0.5, x - 170, h * 0.45], '#140a08');
        stroke(ctx, 'rgba(255,140,70,0.3)', 1, [x - 120, h * 0.42, x + 140, h * 0.42]);
      }
    scatter(w, fr, 150, 240, 60, (x, r) => {
      const aw = r.range(40, 60), ah = r.range(50, 80);
      ctx.fillStyle = '#0c0606';
      ctx.beginPath();
      ctx.moveTo(x - aw / 2, base);
      ctx.lineTo(x - aw / 2, base - ah);
      ctx.arc(x, base - ah, aw / 2, Math.PI, TAU);
      ctx.lineTo(x + aw / 2, base);
      ctx.fill();
      add(ctx, '#ff6a1a', x, base - ah * 0.4, aw * 0.6, ah * 0.6, 0.6);
      add(ctx, '#ffc070', x, base - ah * 0.25, aw * 0.3, ah * 0.25, 0.4);
      for (let i = 0; i < 4; i++) box(ctx, '#0c0606', x - aw / 2 + 4 + i * (aw - 8) / 3, base - ah * 0.6, 3, ah * 0.6);
    });
    box(ctx, '#140a08', 0, base, w, h - base);
    // a channel of melt along the foot of the wall
    ctx.globalCompositeOperation = 'lighter';
    box(ctx, 'rgba(255,110,40,0.7)', 0, base + 3, w, 2);
    for (let x = 0; x < w; x += 90) blob(ctx, '#ff6a20', x + 45, base + 4, 60, 8, 0.35);
    ctx.globalCompositeOperation = 'source-over';
  }, b.res * 0.7);
  // L1: catwalks and pipes in front of the wall.
  mk(0.09, 0.05, (ctx, w, h) => {
    const col = '#160c0a', fr = new RNG(seed + 6);
    box(ctx, col, 0, h * 0.4, w, 4);
    for (let x = 0; x < w; x += 18) stroke(ctx, col, 1, [x, h * 0.4 + 4, x + 9, h * 0.4 + 14, x + 18, h * 0.4 + 4]);
    box(ctx, col, 0, h * 0.4 + 14, w, 2);
    for (let x = 0; x < w; x += 40) box(ctx, col, x, h * 0.4 - 16, 2, 16);
    box(ctx, col, 0, h * 0.4 - 16, w, 2);
    scatter(w, fr, 100, 200, 20, (x, r) => stroke(ctx, col, 6, [x, 0, x, h * r.range(0.5, 0.8), x + r.range(30, 60), h * r.range(0.5, 0.8)]));
  }, b.res * 0.8);
  // L2: great cogs and hanging chains.
  mk(0.15, 0.08, (ctx, w, h) => {
    const col = '#100806', fr = new RNG(seed + 12), base = h * 0.92;
    scatter(w, fr, 220, 380, 70, (x, r) => cog(ctx, x, h * r.range(0.3, 0.6), r.range(30, 56), col, r.int(9, 14)));
    scatter(w, fr, 70, 150, 10, (x, r) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, r.range(60, h * 0.6));
      ctx.stroke();
      ctx.setLineDash([]);
    });
    fillRidge(ctx, w, h, () => base, col);
  });
  // L3: hanging crucibles glowing.
  mk(0.26, 0.11, (ctx, w, h) => {
    const col = '#0a0504', fr = new RNG(seed + 16);
    scatter(w, fr, 200, 340, 30, (x, r) => {
      const y = h * r.range(0.3, 0.45);
      stroke(ctx, col, 2, [x, 0, x, y]);
      poly(ctx, [x - 16, y, x + 16, y, x + 12, y + 20, x - 12, y + 20], col);
      add(ctx, '#ff7a2a', x, y, 22, 8, 0.6);
    });
  });
  // L4: the truss overhead and girders, very near.
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
}

// ---------------------------------------------------------------- build

interface Builder {
  mk: (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r?: number) => void;
  scatter: (w: number, rng: RNG, lo: number, hi: number, reach: number, f: (x: number, r: RNG) => void) => void;
  seed: number;
  slot: number;
  pal: BiomePal;
  res: number;
}

/** Bakes one strip per step: the builders only queue their strips, so idle time can spread the bake over several slices. */
export function* fallenParallax(biome: FallenBiome, pal: BiomePal, seed: number, interior: boolean, viewH: number, res: number): ParallaxSteps {
  const layers: Layer[] = [];
  const W = 1024, H = Math.round(viewH * 1.6);
  const queued: { fx: number; fy: number; draw: (ctx: Ctx, w: number, h: number) => void; r: number }[] = [];
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    queued.push({ fx, fy, draw, r });
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
  const b: Builder = { mk, scatter, seed, slot: seed % 100, pal, res };
  if (biome === 'hunt') (interior ? huntIn : huntOut)(b);
  else if (biome === 'plague') (interior ? plagueIn : plagueOut)(b);
  else (interior ? cinderIn : cinderOut)(b);
  // Each strip draws from its own seeded RNGs, so baking them later and one at a time gives the same pixels.
  for (const q of queued) {
    const m = makeCanvas(W * q.r, H * q.r);
    m.ctx.scale(q.r, q.r);
    q.draw(m.ctx, W, H);
    const l: Layer = { c: m.c, w: W, h: H, fx: q.fx, fy: q.fy, oy: 0, res: q.r };
    layers.push(l);
    yield l;
  }
  return layers;
}
