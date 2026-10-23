// Chapter III environment art. The Valley of Bones at a bleached dusk:
// colossal skeletons sprawled across the hills and swarm clouds drifting
// under a dim sun. The Hive the locusts built inside the bones: amber resin,
// dark chitin, honeycomb and glowing pods. And the Trial: a starry void ringed
// with light, stone fragments adrift around a floor of gold-inlaid stone.

import { makeCanvas, glowSprite, capsulePath, rgba, shade, mix, circle, ellipse, type Ctx } from './draw';
import { RNG, hash2, fbm1, clamp } from '../core/math';
import { TILE, T, type Biome, type EntDef } from '../game/tiles';
import type { BiomePal, Layer, ParallaxSteps } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
export type Ch3Biome = 'valley' | 'hive' | 'trial';
export const isCh3 = (b: Biome): b is Ch3Biome => b === 'valley' || b === 'hive' || b === 'trial';

const TAU = Math.PI * 2;
const OUT = '#120d09';
const BONE = '#d6cab0';
const BONE_SH = '#aa9c80';
const BONE_BACK = '#8c806a';
const BONE_HI = 'rgba(255,250,236,0.5)';
const BONE_SHADOW = 'rgba(70,56,38,0.45)';
const GOLD = '#c9a04a';
const GOLD_HI = '#f2d68e';
const POD = '#c8f060';

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

function noise2(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
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

/** Pointy-top hexagon (honeycomb walls run vertically). */
function hexPath(ctx: Ctx, cx: number, cy: number, r: number) {
  const hx = r * 0.866, hy = r * 0.5;
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + hx, cy - hy);
  ctx.lineTo(cx + hx, cy + hy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - hx, cy + hy);
  ctx.lineTo(cx - hx, cy - hy);
  ctx.closePath();
}

interface Curve { x: number[]; y: number[]; nx: number[]; ny: number[]; w: number[] }
/** Samples a cubic Bézier (x0,y0 … x3,y3) up to uMax with unit normals and a linear taper w0 → w1. */
function bez(p: readonly number[], n: number, w0: number, w1: number, uMax = 1): Curve {
  const c: Curve = { x: [], y: [], nx: [], ny: [], w: [] };
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * uMax, iu = 1 - u;
    const a = iu * iu * iu, b = 3 * iu * iu * u, cc = 3 * iu * u * u, d = u * u * u;
    c.x.push(a * p[0] + b * p[2] + cc * p[4] + d * p[6]);
    c.y.push(a * p[1] + b * p[3] + cc * p[5] + d * p[7]);
    const dx = 3 * iu * iu * (p[2] - p[0]) + 6 * iu * u * (p[4] - p[2]) + 3 * u * u * (p[6] - p[4]);
    const dy = 3 * iu * iu * (p[3] - p[1]) + 6 * iu * u * (p[5] - p[3]) + 3 * u * u * (p[7] - p[5]);
    const L = Math.hypot(dx, dy) || 1;
    c.nx.push(-dy / L);
    c.ny.push(dx / L);
    c.w.push(w0 + (w1 - w0) * (i / n));
  }
  return c;
}

/** Adds a tapered band along a sampled curve to the path; `jag` splinters the end like broken bone. */
function bandPath(ctx: Ctx, c: Curve, jag = false) {
  const n = c.x.length, e = n - 1;
  ctx.moveTo(c.x[0] + (c.nx[0] * c.w[0]) / 2, c.y[0] + (c.ny[0] * c.w[0]) / 2);
  for (let i = 1; i < n; i++) ctx.lineTo(c.x[i] + (c.nx[i] * c.w[i]) / 2, c.y[i] + (c.ny[i] * c.w[i]) / 2);
  const tx = c.ny[e], ty = -c.nx[e], w = c.w[e] / 2;
  if (jag) {
    ctx.lineTo(c.x[e] + tx * w * 1.8 + c.nx[e] * w * 0.2, c.y[e] + ty * w * 1.8 + c.ny[e] * w * 0.2);
    ctx.lineTo(c.x[e] + tx * w * 0.5, c.y[e] + ty * w * 0.5);
    ctx.lineTo(c.x[e] + tx * w * 1.2 - c.nx[e] * w * 0.6, c.y[e] + ty * w * 1.2 - c.ny[e] * w * 0.6);
  } else {
    ctx.quadraticCurveTo(c.x[e] + tx * w * 1.8, c.y[e] + ty * w * 1.8, c.x[e] - c.nx[e] * w, c.y[e] - c.ny[e] * w);
  }
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(c.x[i] - (c.nx[i] * c.w[i]) / 2, c.y[i] - (c.ny[i] * c.w[i]) / 2);
  ctx.closePath();
}

/** A line running along one side of a curve (side ±1, offset as a fraction of the local width). */
function sideLine(ctx: Ctx, c: Curve, side: number, frac: number, from = 0, to = c.x.length - 1) {
  ctx.beginPath();
  for (let i = from; i <= to; i++) {
    const o = side * c.w[i] * frac;
    const px = c.x[i] + c.nx[i] * o, py = c.y[i] + c.ny[i] * o;
    if (i === from) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

/** A long bone (femur/humerus): shaft with knuckled ends. */
function longBone(ctx: Ctx, ax: number, ay: number, bx: number, by: number, r: number, fill: string) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const nx = -uy * r * 0.6, ny = ux * r * 0.6;
  ctx.beginPath();
  capsulePath(ctx, ax, ay, bx, by, r * 0.6, r * 0.6);
  const knob = (cx: number, cy: number) => {
    ctx.moveTo(cx + r * 0.72, cy);
    ctx.arc(cx, cy, r * 0.72, 0, TAU);
  };
  knob(ax + nx - ux * r * 0.3, ay + ny - uy * r * 0.3);
  knob(ax - nx - ux * r * 0.3, ay - ny - uy * r * 0.3);
  knob(bx + nx + ux * r * 0.3, by + ny + uy * r * 0.3);
  knob(bx - nx + ux * r * 0.3, by - ny + uy * r * 0.3);
  solidify(ctx, fill, OUT, 0.55);
  const s = ny > 0 ? -0.5 : 0.5; // the upper side catches the light
  ctx.beginPath();
  ctx.moveTo(ax + ux * r + nx * s, ay + uy * r + ny * s);
  ctx.lineTo(bx - ux * r + nx * s, by - uy * r + ny * s);
  ctx.strokeStyle = BONE_HI;
  ctx.lineWidth = Math.max(0.5, r * 0.4);
  ctx.lineCap = 'round';
  ctx.stroke();
}

function smallSkull(ctx: Ctx, x: number, y: number, r: number, dir: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.88, 0, 0, TAU);
  ctx.moveTo(r * 0.1, r * 0.3);
  ctx.lineTo(r * 1.12, r * 0.3);
  ctx.lineTo(r * 1.08, r * 0.95);
  ctx.lineTo(r * 0.25, r * 1.02);
  ctx.closePath();
  solidify(ctx, fill, OUT, 0.5);
  ellipse(ctx, r * 0.5, r * 0.1, r * 0.3, r * 0.27, 0, '#1a120c');
  ctx.fillStyle = '#1a120c';
  ctx.fillRect(r * 0.86, r * 0.38, r * 0.14, r * 0.2);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(r * (0.45 + i * 0.22), r * 0.72);
    ctx.lineTo(r * (0.45 + i * 0.22), r * 0.98);
  }
  ctx.stroke();
  ctx.fillStyle = BONE_HI;
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 0.48, r * 0.45, r * 0.18, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Side view of a vertebra: centrum, swept neural spine, transverse knob. */
function vertebra(ctx: Ctx, x: number, y: number, s: number, rot: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.7);
  ctx.quadraticCurveTo(0, -s * 0.45, s, -s * 0.7);
  ctx.lineTo(s * 0.92, s * 0.7);
  ctx.quadraticCurveTo(0, s * 0.45, -s * 0.92, s * 0.7);
  ctx.closePath();
  ctx.moveTo(-s * 0.55, -s * 0.55);
  ctx.lineTo(-s * 0.3, -s * 2.2);
  ctx.lineTo(s * 0.02, -s * 2.35);
  ctx.lineTo(s * 0.45, -s * 0.55);
  ctx.closePath();
  ctx.moveTo(s * 0.4, -s * 0.2);
  ctx.arc(0, -s * 0.2, s * 0.4, 0, TAU);
  solidify(ctx, fill, OUT, 0.5);
  ctx.fillStyle = 'rgba(70,56,40,0.35)';
  ctx.fillRect(-s * 0.85, s * 0.15, s * 1.7, s * 0.45);
  ctx.strokeStyle = BONE_HI;
  ctx.lineWidth = Math.max(0.5, s * 0.22);
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.5);
  ctx.quadraticCurveTo(0, -s * 0.3, s * 0.7, -s * 0.5);
  ctx.stroke();
  ctx.restore();
}

/** A drift of earth over something's base; bottom sits below the ground line. */
function mound(ctx: Ctx, x0: number, x1: number, h: number, col: string, top: string, rng: RNG) {
  const n = Math.max(4, Math.round((x1 - x0) / 6));
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) ys.push(-h * Math.pow(Math.sin((Math.PI * i) / n), 0.6) * rng.range(0.7, 1.15));
  ctx.beginPath();
  ctx.moveTo(x0, 4);
  for (let i = 0; i <= n; i++) ctx.lineTo(x0 + ((x1 - x0) * i) / n, ys[i]);
  ctx.lineTo(x1, 4);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const px = x0 + ((x1 - x0) * i) / n;
    if (!i) ctx.moveTo(px, ys[i] + 0.4);
    else ctx.lineTo(px, ys[i] + 0.4);
  }
  ctx.strokeStyle = top;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------- skies

let valleyG: CanvasGradient | null = null;
let valleyH = 0;
let caveG: CanvasGradient | null = null;
let cavePal: BiomePal | null = null;
let caveH = 0;
let voidG: CanvasGradient | null = null;
let voidH = 0;
const swarm: HTMLCanvasElement[] = [];

/** Swarm clouds: dense specks pre-rendered once (two shapes, two speck sets each to cross-fade). */
function swarmSprites() {
  if (swarm.length) return swarm;
  const SW = 640, SH = 240;
  for (let shape = 0; shape < 2; shape++) {
    const lr = new RNG(4049 + shape * 977);
    const lobes: number[] = [];
    for (let k = 0; k < 6; k++) lobes.push(SW * (0.14 + 0.72 * (k / 5)) + lr.range(-30, 30), SH * 0.5 + lr.range(-38, 38) + Math.sin(k * 1.3 + shape) * 20, lr.range(38, 74));
    const dens = (px: number, py: number) => {
      let d = 0;
      for (let k = 0; k < lobes.length; k += 3) {
        const dx = (px - lobes[k]) / lobes[k + 2], dy = (py - lobes[k + 1]) / (lobes[k + 2] * 0.62);
        d += Math.exp(-(dx * dx + dy * dy));
      }
      return Math.min(1, d);
    };
    for (let variant = 0; variant < 2; variant++) {
      const r = new RNG(7001 + shape * 31 + variant * 7);
      const m = makeCanvas(SW, SH);
      const c = m.ctx;
      // a faint body so the swarm reads as one mass from far away
      for (let k = 0; k < lobes.length; k += 3) {
        c.globalAlpha = 0.16;
        c.drawImage(spr('#1a120c'), lobes[k] - lobes[k + 2] * 1.4, lobes[k + 1] - lobes[k + 2], lobes[k + 2] * 2.8, lobes[k + 2] * 2);
      }
      let placed = 0;
      for (let i = 0; i < 12000 && placed < 2600; i++) {
        const px = r.next() * SW, py = r.next() * SH;
        if (r.next() > dens(px, py) * 0.95) continue;
        c.globalAlpha = 0.4 + r.next() * 0.55;
        c.fillStyle = r.next() < 0.5 ? '#1c140e' : '#2c2016';
        const s = r.next() < 0.15 ? 2.2 : 1.4;
        c.fillRect(px, py, s, s * 0.75);
        placed++;
      }
      c.globalAlpha = 1;
      swarm.push(m.c);
    }
  }
  return swarm;
}

/** Bleached dusk over the Valley: ash above, washed amber at the horizon, a dim low sun, swarms drifting. */
export function drawValleySky(ctx: Ctx, pal: BiomePal, w: number, h: number, t: number) {
  if (!valleyG || valleyH !== h) {
    valleyH = h;
    valleyG = ctx.createLinearGradient(0, 0, 0, h);
    valleyG.addColorStop(0, pal.sky[0]);
    valleyG.addColorStop(0.24, pal.sky[1]);
    valleyG.addColorStop(0.5, pal.sky[2]);
  }
  ctx.fillStyle = valleyG;
  ctx.fillRect(0, 0, w, h);
  // The sun, low and dim, more a pale coin than a fire.
  const sx = w * 0.72, sy = h * 0.2, sr = h * 0.055;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#a87444', sx, sy, sr * 11, sr * 8, 0.28);
  blob(ctx, '#f0d6a8', sx, sy, sr * 3, sr * 3, 0.32);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.6;
  circle(ctx, sx, sy, sr, '#f6e6c4');
  ctx.globalAlpha = 1;
  // Ash haze dragged across the sun.
  ctx.fillStyle = 'rgba(120,98,78,0.22)';
  for (let i = 0; i < 4; i++) {
    const y = h * (0.12 + i * 0.05);
    const x = ((t * (4 + i * 1.6)) % (w + 700)) - 350;
    ctx.beginPath();
    ctx.ellipse(x, y, 360, 5 + i * 2, 0, 0, TAU);
    ctx.ellipse(((x + w * 0.55) % (w + 700)) - 250, y + 16, 260, 4 + i, 0, 0, TAU);
    ctx.fill();
  }
  // Swarm clouds riding the wind, specks seething as two speck sets cross-fade.
  const sp = swarmSprites();
  for (let i = 0; i < 3; i++) {
    const cw = h * (0.5 + 0.16 * i), ch = cw * 0.375;
    const speed = h * (0.012 + 0.006 * i);
    const x = ((t * speed + i * w * 0.47) % (w + cw * 1.4)) - cw * 1.2;
    const y = h * (0.02 + 0.07 * i) + Math.sin(t * 0.21 + i * 2) * h * 0.012;
    const a = sp[(i % 2) * 2], b = sp[(i % 2) * 2 + 1];
    const f = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 2.3);
    const base = 0.75 - i * 0.12;
    if (i === 1) ctx.setTransform(-1, 0, 0, 1, x + cw, y);
    else ctx.setTransform(1, 0, 0, 1, x, y);
    ctx.globalAlpha = base * (0.55 + 0.45 * f);
    ctx.drawImage(a, 0, 0, cw, ch);
    ctx.globalAlpha = base * (0.55 + 0.45 * (1 - f));
    ctx.drawImage(b, 0, 0, cw, ch);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

/** The Hive's backdrop: deep resin dark (cached gradient). */
export function drawCaveSky(ctx: Ctx, pal: BiomePal, w: number, h: number) {
  if (!caveG || cavePal !== pal || caveH !== h) {
    cavePal = pal;
    caveH = h;
    caveG = ctx.createLinearGradient(0, 0, 0, h);
    caveG.addColorStop(0, pal.sky[0]);
    caveG.addColorStop(0.6, pal.sky[1]);
    caveG.addColorStop(1, pal.sky[2]);
  }
  ctx.fillStyle = caveG;
  ctx.fillRect(0, 0, w, h);
}

/** The Trial's void: near-black indigo, slow nebulae, twinkling stars. */
export function drawVoidSky(ctx: Ctx, pal: BiomePal, w: number, h: number, t: number) {
  if (!voidG || voidH !== h) {
    voidH = h;
    voidG = ctx.createLinearGradient(0, 0, 0, h);
    voidG.addColorStop(0, pal.sky[0]);
    voidG.addColorStop(0.6, pal.sky[1]);
    voidG.addColorStop(1, pal.sky[2]);
  }
  ctx.fillStyle = voidG;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#3a2470', w * (0.28 + Math.sin(t * 0.03) * 0.04), h * 0.3, w * 0.42, h * 0.3, 0.3);
  blob(ctx, '#1c3a5e', w * (0.76 + Math.sin(t * 0.025 + 2) * 0.04), h * 0.42, w * 0.34, h * 0.24, 0.24);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff4dc';
  const k = h / 720;
  for (let i = 0; i < 48; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * (0.7 + hash2(i, 5) * 2.4) + i * 1.7);
    ctx.globalAlpha = 0.18 + 0.5 * tw * hash2(i, 11);
    const s = (1 + hash2(i, 9) * 1.4) * k;
    ctx.fillRect(hash2(i, 3) * w, hash2(i, 7) * h * 0.9, s, s);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- parallax

/** Periodic noise across the strip width so the strip tiles without a seam. */
function wrapNoise(w: number, scale: number, sd: number, oct = 4) {
  return (x: number) => {
    const xx = ((x % w) + w) % w, f = xx / w;
    return (1 - f) * fbm1(xx / scale, sd, oct) + f * fbm1((xx - w) / scale, sd, oct);
  };
}

function fillRidge(ctx: Ctx, w: number, h: number, hy: (x: number) => number, col: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, hy(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** A rib cage silhouette lying on a hill: spine along the ground, ribs arching toward `dir`. */
function ribcageSil(ctx: Ctx, cx: number, len: number, hgt: number, gy: (x: number) => number, dir: number, col: string, rim: string, rng: RNG) {
  const n = Math.max(5, Math.round(len / 26));
  const sw = Math.max(2, hgt * 0.05);
  ctx.strokeStyle = col;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = cx - len / 2 + (len * i) / 20;
    const y = gy(x) - hgt * 0.06 - Math.sin((Math.PI * i) / 20) * hgt * 0.08;
    if (!i) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const bx = cx - len / 2 + len * u;
    const by = gy(bx) - hgt * 0.06 - Math.sin(Math.PI * u) * hgt * 0.08;
    const hh = hgt * (0.45 + 0.55 * Math.sin(Math.PI * (0.1 + 0.8 * u))) * rng.range(0.9, 1.05);
    const p = [bx, by, bx - dir * hh * 0.12, by - hh * 0.72, bx + dir * hh * 0.22, by - hh * 1.12, bx + dir * hh * 0.55, by - hh * 0.6];
    const c = bez(p, 14, sw * 1.6, sw * 0.5, rng.chance(0.2) ? rng.range(0.55, 0.8) : 0.97);
    ctx.beginPath();
    bandPath(ctx, c);
    ctx.fillStyle = col;
    ctx.fill();
    sideLine(ctx, c, -dir, 0.3, 2, c.x.length - 2);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // vertebral spike on the spine
    ctx.beginPath();
    ctx.moveTo(bx - sw, by);
    ctx.lineTo(bx - dir * sw * 0.6, by - sw * 2.4);
    ctx.lineTo(bx + sw, by);
    ctx.fill();
  }
}

/** A giant half-buried skull silhouette with a dark socket. */
function skullSil(ctx: Ctx, cx: number, gy: number, s: number, dir: number, col: string, rim: string) {
  ctx.save();
  ctx.translate(cx, gy + s * 0.15);
  ctx.scale(dir, 1);
  ctx.rotate(-0.12);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(-s * 0.08, -s * 0.42, s * 0.46, s * 0.4, 0, 0, TAU);
  ctx.moveTo(s * 0.1, -s * 0.7);
  ctx.lineTo(s * 0.45, -s * 0.5);
  ctx.lineTo(s * 0.5, -s * 0.22);
  ctx.lineTo(s * 0.47, s * 0.05);
  ctx.lineTo(s * 0.05, s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-s * 0.08, -s * 0.42, s * 0.46, s * 0.4, 0, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(s * 0.28, -s * 0.36, s * 0.1, s * 0.09, 0.2, 0, TAU);
  ctx.moveTo(s * 0.44, -s * 0.2);
  ctx.lineTo(s * 0.48, -s * 0.1);
  ctx.lineTo(s * 0.41, -s * 0.08);
  ctx.fill();
  ctx.restore();
}

/** A rising column of swarm specks. */
function swarmColumn(ctx: Ctx, cx: number, base: number, hgt: number, rng: RNG) {
  ctx.fillStyle = '#1e160f';
  for (let i = 0; i < 900; i++) {
    const t = Math.pow(rng.next(), 0.8);
    const spread = 5 + Math.pow(t, 1.6) * hgt * 0.55;
    const g = (rng.next() + rng.next() + rng.next() - 1.5) * 1.4;
    const x = cx + g * spread + Math.sin(t * 7) * hgt * 0.12 * t;
    const y = base - t * hgt;
    ctx.globalAlpha = (0.35 + rng.next() * 0.5) * (1 - t * 0.5);
    const s = rng.next() < 0.2 ? 1.6 : 1.1;
    ctx.fillRect(x, y, s, s * 0.8);
  }
  ctx.globalAlpha = 1;
}

function deadTreeSil(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  const branch = (x0: number, y0: number, len: number, a: number, w: number, d: number) => {
    const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + rng.range(-len * 0.2, len * 0.2), (y0 + y1) / 2, x1, y1);
    ctx.stroke();
    if (d > 0) {
      branch(x1, y1, len * 0.68, a - rng.range(0.25, 0.75), w * 0.62, d - 1);
      if (rng.chance(0.75)) branch(x1, y1, len * 0.62, a + rng.range(0.25, 0.75), w * 0.6, d - 1);
    }
  };
  branch(x, base + 2, h * 0.42, rng.range(-0.25, 0.25), Math.max(2.5, h * 0.06), 3);
}

/** Floating stone island: a flat lit top over a jagged underside. */
function floatRock(ctx: Ctx, cx: number, cy: number, s: number, col: string, rim: string, rng: RNG, column = false) {
  const n = 5;
  const top: number[] = [];
  for (let i = 0; i <= n; i++) top.push(cx - s + (2 * s * i) / n, cy - rng.range(0, s * 0.12));
  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  for (let i = 2; i < top.length; i += 2) ctx.lineTo(top[i], top[i + 1]);
  ctx.lineTo(cx + s * 0.75, cy + s * rng.range(0.3, 0.5));
  ctx.lineTo(cx + s * 0.3, cy + s * rng.range(0.6, 0.85));
  ctx.lineTo(cx + rng.range(-0.15, 0.15) * s, cy + s * rng.range(1.0, 1.4));
  ctx.lineTo(cx - s * 0.35, cy + s * rng.range(0.6, 0.8));
  ctx.lineTo(cx - s * 0.8, cy + s * rng.range(0.25, 0.45));
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  if (column) {
    const cw = s * 0.32, ch = s * rng.range(0.7, 1.2), x0 = cx + rng.range(-0.4, 0.2) * s;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x0, cy - ch);
    ctx.lineTo(x0 + cw * 0.4, cy - ch - cw * 0.3);
    ctx.lineTo(x0 + cw * 0.7, cy - ch + cw * 0.2);
    ctx.lineTo(x0 + cw, cy - ch - cw * 0.1);
    ctx.lineTo(x0 + cw, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, cy);
    ctx.lineTo(x0 + 0.5, cy - ch);
    ctx.stroke();
  }
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(top[0], top[1] + 0.5);
  for (let i = 2; i < top.length; i += 2) ctx.lineTo(top[i], top[i + 1] + 0.5);
  ctx.stroke();
}

export function* buildParallaxCh3(biome: Ch3Biome, pal: BiomePal, seed: number, viewH: number, res: number): ParallaxSteps {
  const layers: Layer[] = [];
  const rng = new RNG(seed);
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

  if (biome === 'valley') {
    // Far range bleached by dust, and something enormous dead along its foot.
    yield mk(0.05, 0.03, (ctx, w, h) => {
      const n1 = wrapNoise(w, 190, seed, 5);
      const r1 = (x: number) => h * 0.75 - (1 - Math.abs(2 * n1(x) - 1)) * h * 0.13;
      fillRidge(ctx, w, h, r1, mix(pal.far, pal.fog, 0.3));
      const n2 = wrapNoise(w, 140, seed + 3, 3);
      const r2 = (x: number) => h * 0.8 - n2(x) * h * 0.05;
      const boneFar = mix(pal.far, pal.fog, 0.24);
      const fr = new RNG(seed + 40);
      const cx = w * 0.3;
      wrap(cx, 200, w, (x) => ribcageSil(ctx, x, 320, 84, r2, 1, boneFar, rgba(pal.fog, 0.18), new RNG(seed + 41)));
      skullSil(ctx, w * 0.3 + 205, r2(w * 0.3 + 205), 52, 1, boneFar, rgba(pal.fog, 0.18));
      for (let i = 0; i < 4; i++) {
        const x = fr.range(w * 0.55, w * 0.95);
        ctx.strokeStyle = boneFar;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, r2(x) + 4);
        ctx.quadraticCurveTo(x + 8, r2(x) - 20, x + fr.range(10, 22), r2(x) - fr.range(26, 42));
        ctx.stroke();
      }
      fillRidge(ctx, w, h, r2, mix(pal.far, pal.fog, 0.1));
    }, res * 0.6);
    // Rolling hills with colossal skeletons; a swarm boils up from behind one.
    yield mk(0.2, 0.08, (ctx, w, h) => {
      const n = wrapNoise(w, 230, seed + 11, 4);
      const hy = (x: number) => h * 0.84 - n(x) * h * 0.06;
      const bone = mix(pal.mid, pal.fog, 0.3), rim = rgba(pal.fog, 0.35);
      const fr = new RNG(seed + 12);
      const s0 = fr.range(0, w * 0.08);
      wrap(s0 + w * 0.12, 150, w, (x) => ribcageSil(ctx, x, 210, 118, hy, 1, bone, rim, new RNG(seed + 13)));
      wrap(s0 + w * 0.36, 60, w, (x) => skullSil(ctx, x, hy(x), 74, -1, bone, rim));
      // a spine snaking over the next hill, ribs snapped short
      wrap(s0 + w * 0.58, 140, w, (x) => ribcageSil(ctx, x, 240, 52, hy, -1, bone, rim, new RNG(seed + 14)));
      // great long bones jutting from the earth
      for (const [ox, len, ang] of [[0.74, 72, 0.35], [0.79, 56, -0.5], [0.96, 48, 0.6]] as const) {
        wrap(s0 + w * ox, 60, w, (x) => {
          const gy = hy(x) + 6;
          longBone(ctx, x, gy, x + Math.sin(ang) * len, gy - Math.cos(ang) * len, 5, bone);
        });
      }
      wrap(s0 + w * 0.86, 120, w, (x) => swarmColumn(ctx, x, hy(x) + 6, h * 0.36, new RNG(seed + 15)));
      fillRidge(ctx, w, h, hy, pal.mid);
      // pale dust on the crests
      ctx.strokeStyle = rgba(pal.fog, 0.22);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        if (!x) ctx.moveTo(x, hy(x) + 0.6);
        else ctx.lineTo(x, hy(x) + 0.6);
      }
      ctx.stroke();
    });
    // Near: dead trees, rib stakes and cairns, dark against the dust.
    yield mk(0.45, 0.18, (ctx, w, h) => {
      const n = wrapNoise(w, 110, seed + 21, 3);
      const hy = (x: number) => h * 0.9 - n(x) * h * 0.03;
      const fr = new RNG(seed + 22);
      let x = fr.range(10, 40);
      while (x < w - 10) {
        const k = fr.int(0, 3);
        const sd = fr.int(0, 99999);
        const a = fr.range(0, 1);
        if (k === 0) wrap(x, 60, w, (xx) => deadTreeSil(ctx, xx, hy(xx), 50 + a * 40, pal.near, new RNG(sd)));
        else if (k === 1) {
          wrap(x, 60, w, (xx) => {
            const gy = hy(xx) + 4, hh = 40 + a * 34, d = sd % 2 ? 1 : -1;
            const c = bez([xx, gy, xx - d * hh * 0.1, gy - hh * 0.7, xx + d * hh * 0.25, gy - hh * 1.1, xx + d * hh * 0.55, gy - hh * 0.75], 12, 7, 2, sd % 3 ? 0.97 : 0.7);
            ctx.beginPath();
            bandPath(ctx, c, sd % 3 === 0);
            ctx.fillStyle = pal.near;
            ctx.fill();
          });
        } else if (k === 2) {
          wrap(x, 30, w, (xx) => {
            const gy = hy(xx) + 2;
            ctx.fillStyle = pal.near;
            let yy = gy;
            for (let i = 0; i < 4; i++) {
              const sw = 13 - i * 2.6, sh = 5 - i * 0.6;
              ctx.beginPath();
              ctx.ellipse(xx + Math.sin(i + sd) * 1.5, yy - sh * 0.8, sw, sh, 0, 0, TAU);
              ctx.fill();
              yy -= sh * 1.5;
            }
            ctx.fillRect(xx - 0.8, yy - 22, 1.6, 24);
            ctx.beginPath();
            ctx.moveTo(xx, yy - 21);
            ctx.quadraticCurveTo(xx + 9, yy - 23, xx + 18, yy - 17);
            ctx.lineTo(xx + 16, yy - 15);
            ctx.quadraticCurveTo(xx + 8, yy - 19, xx, yy - 17);
            ctx.fill();
          });
        } else {
          wrap(x, 40, w, (xx) => {
            const gy = hy(xx) + 4;
            ctx.fillStyle = pal.near;
            for (let i = 0; i < 4; i++) {
              const bx = xx + i * 9 - 14, bh = 14 + ((sd >> i) % 5) * 6;
              ctx.beginPath();
              ctx.moveTo(bx - 2.5, gy);
              ctx.lineTo(bx + (i % 2 ? 2 : -2), gy - bh);
              ctx.lineTo(bx + 2.5, gy);
              ctx.fill();
            }
          });
        }
        x += fr.range(70, 150);
      }
      fillRidge(ctx, w, h, hy, pal.near);
    });
  } else if (biome === 'hive') {
    // Inside the bones: colossal ribs arch overhead, comb grown between them, warm glow deep in.
    yield mk(0.08, 0.05, (ctx, w, h) => {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) blob(ctx, '#b0601a', rng.range(0, w), h * rng.range(0.55, 0.95), rng.range(60, 130), rng.range(40, 90), rng.range(0.12, 0.24));
      ctx.globalCompositeOperation = 'source-over';
      // far comb masses
      const R = 15, HW = R * Math.sqrt(3), VS = R * 1.5;
      for (let j = Math.floor((h * 0.35) / VS); j <= Math.ceil(h / VS); j++) {
        for (let i = -1; i <= Math.ceil(w / HW); i++) {
          const cx = i * HW + (j & 1 ? HW / 2 : 0), cy = j * VS;
          const xx = ((cx % w) + w) % w;
          const f = xx / w;
          const nn = (1 - f) * noise2(xx / 160, cy / 120, seed) + f * noise2((xx - w) / 160, cy / 120, seed);
          if (nn < 0.45) continue;
          ctx.beginPath();
          hexPath(ctx, cx, cy, R);
          ctx.fillStyle = mix(pal.far, '#000000', 0.25);
          ctx.fill();
          ctx.beginPath();
          hexPath(ctx, cx, cy, R - 2.5);
          ctx.fillStyle = hash2(i, j, seed) < 0.18 ? '#4a2a0c' : pal.far;
          ctx.fill();
        }
      }
      const ribCol = mix(pal.far, '#8a6a44', 0.28);
      for (let i = 0; i < 3; i++) {
        const x0 = (w / 3) * i + rng.range(0, 60);
        wrap(x0, 380, w, (x) => {
          const c = bez([x, h + 30, x - 50, h * 0.62, x + 120, h * 0.28, x + 330, h * 0.1], 22, 54, 26);
          ctx.beginPath();
          bandPath(ctx, c);
          ctx.fillStyle = ribCol;
          ctx.fill();
          sideLine(ctx, c, -1, 0.32);
          ctx.strokeStyle = 'rgba(255,190,110,0.12)';
          ctx.lineWidth = 3;
          ctx.stroke();
        });
      }
    }, res * 0.6);
    // Twisted resin columns, hanging strands and pods.
    yield mk(0.28, 0.12, (ctx, w, h) => {
      let x = rng.range(20, 60);
      while (x < w - 30) {
        const sd = rng.int(0, 9999);
        const cw = rng.range(14, 26);
        wrap(x, 50, w, (xx) => {
          const r = new RNG(sd);
          ctx.fillStyle = pal.mid;
          ctx.beginPath();
          for (let y = 0; y <= h; y += 12) ctx.lineTo(xx - cw / 2 + Math.sin(y * 0.02 + sd) * 6 - Math.max(0, (y - h * 0.85) * 0.5), y);
          for (let y = h; y >= 0; y -= 12) ctx.lineTo(xx + cw / 2 + Math.sin(y * 0.02 + sd + 1) * 6 + Math.max(0, (y - h * 0.85) * 0.5), y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(230,140,40,0.16)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let y = 0; y <= h; y += 12) ctx.lineTo(xx - cw * 0.2 + Math.sin(y * 0.02 + sd) * 6, y);
          ctx.stroke();
          // glowing nodules
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 2; k++) {
            const ny = h * r.range(0.5, 0.9);
            blob(ctx, '#ff9a2a', xx + Math.sin(ny * 0.02 + sd) * 6, ny, 9, 9, 0.5);
          }
          ctx.globalCompositeOperation = 'source-over';
        });
        // strands with pods between the columns
        const sx = x + rng.range(40, 90), sy = h * rng.range(0.55, 0.78);
        wrap(sx, 12, w, (xx) => {
          ctx.strokeStyle = pal.mid;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(xx, 0);
          ctx.quadraticCurveTo(xx + 6, sy * 0.6, xx, sy);
          ctx.stroke();
          ctx.fillStyle = '#3a2a0c';
          ctx.beginPath();
          ctx.ellipse(xx, sy + 4, 3.5, 5, 0, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          blob(ctx, POD, xx, sy + 4, 14, 14, 0.45);
          ctx.globalCompositeOperation = 'source-over';
        });
        x += rng.range(110, 200);
      }
      // a lumpy comb floor far below
      const n = wrapNoise(w, 70, seed + 31, 3);
      fillRidge(ctx, w, h, (xx) => h * 0.93 - n(xx) * h * 0.05, pal.mid);
    });
  } else {
    // The Trial: stars, a great faint ring of light, stone adrift.
    yield mk(0.03, 0.02, (ctx, w, h) => {
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, '#3a2470', w * 0.25, h * 0.6, 260, 120, 0.25);
      blob(ctx, '#1c3a5e', w * 0.78, h * 0.72, 220, 100, 0.2);
      for (let i = 0; i < 380; i++) {
        const x = rng.range(0, w), y = rng.range(0, h);
        const b = rng.next();
        ctx.fillStyle = b > 0.9 ? '#fff6e0' : b > 0.6 ? '#d8dcff' : '#b8a8d8';
        ctx.globalAlpha = 0.25 + b * 0.6;
        const s = b > 0.93 ? 1.6 : 0.9;
        ctx.fillRect(x, y, s, s);
        if (b > 0.985) {
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x - 3, y + s / 2 - 0.25, 6 + s, 0.5);
          ctx.fillRect(x + s / 2 - 0.25, y - 3, 0.5, 6 + s);
        }
      }
      ctx.globalAlpha = 1;
      // the ring: layered strokes fake a soft glow without shadowBlur
      const cx = w * 0.28, cy = h * 0.71, R = h * 0.19;
      for (let k = 5; k >= 0; k--) {
        ctx.strokeStyle = rgba('#ffd890', k === 0 ? 0.38 : 0.05 / (k * 0.5));
        ctx.lineWidth = k === 0 ? 1.3 : 2 + k * 5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, R * 0.94, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffe6b0', 0.22);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 0.9, R * 0.85, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU, l = i % 4 ? 3 : 7;
        ctx.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3) * 0.94);
        ctx.lineTo(cx + Math.cos(a) * (R + 3 + l), cy + Math.sin(a) * (R + 3 + l) * 0.94);
      }
      ctx.strokeStyle = rgba('#ffd890', 0.3);
      ctx.stroke();
      blob(ctx, '#ffcf6b', cx, cy, R * 1.2, R * 1.15, 0.08);
      ctx.globalCompositeOperation = 'source-over';
    }, res * 0.6);
    // distant fragments
    yield mk(0.12, 0.06, (ctx, w, h) => {
      for (let i = 0; i < 16; i++) {
        const x = rng.range(10, w - 10), y = h * rng.range(0.5, 0.92), s = rng.range(5, 16);
        const sd = rng.int(0, 9999);
        wrap(x, s * 2, w, (xx) => floatRock(ctx, xx, y, s, mix(pal.mid, '#6a6080', 0.25), rgba('#c8b890', 0.35), new RNG(sd), sd % 4 === 0));
      }
    });
    // near fragments, bigger and darker, with gold glints
    yield mk(0.32, 0.14, (ctx, w, h) => {
      for (let i = 0; i < 7; i++) {
        const x = (w / 7) * i + rng.range(10, 100), y = h * rng.range(0.58, 0.9), s = rng.range(18, 42);
        const sd = rng.int(0, 9999);
        wrap(x, s * 2, w, (xx) => {
          const r = new RNG(sd);
          floatRock(ctx, xx, y, s, mix(pal.near, '#4a4460', 0.3), rgba('#e8d4a0', 0.5), r, sd % 3 === 0);
          ctx.fillStyle = rgba(GOLD_HI, 0.6);
          for (let k = 0; k < 3; k++) ctx.fillRect(xx + r.range(-s * 0.5, s * 0.5), y + r.range(s * 0.1, s * 0.5), 1.1, 1.1);
        });
      }
    });
  }
  return layers;
}

// ---------------------------------------------------------------- hive back wall

const CELL_WALL = ['#24160a', '#4a2c10'];
const CELL_CAP = ['#1c1209', '#5a3612'];
const CELL_CAP_HI = ['rgba(255,190,110,0.05)', 'rgba(255,205,130,0.28)'];
const CELL_EMPTY = ['#0e0805', '#170c05'];
const CELL_HONEY = ['#2e1a08', '#8a4a0e'];
const CELL_HONEY_IN = ['#4e2a0a', '#d0801c'];
const CELL_GRUB = ['#5a4c34', '#c8b07a'];

/**
 * Honeycomb cells, batched by layer so a whole wall costs a handful of fills
 * rather than several per cell. kind 0 capped, 1 empty, 2 honey, 3 larva;
 * lit 1 for panels in the play plane, 0 for the dim back wall.
 */
function combCells(ctx: Ctx, cx: number[], cy: number[], kind: number[], R: number, lit: 0 | 1) {
  const n = cx.length, r = R - 1.5;
  if (!n) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) hexPath(ctx, cx[i], cy[i], R + 0.35);
  ctx.fillStyle = CELL_WALL[lit];
  ctx.fill();
  const layer = (k: number, fill: string, rr = r, dy = 0) => {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (kind[i] !== k && !(k === 1 && kind[i] === 3)) continue;
      hexPath(ctx, cx[i], cy[i] + dy, rr);
      any = true;
    }
    if (any) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    return any;
  };
  if (layer(0, CELL_CAP[lit])) {
    // domed wax caps catching light on their upper rim
    const a0 = Math.PI * 1.15, rr = r * 0.72;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (kind[i] !== 0) continue;
      ctx.moveTo(cx[i] + Math.cos(a0) * rr, cy[i] + r * 0.25 + Math.sin(a0) * rr);
      ctx.arc(cx[i], cy[i] + r * 0.25, rr, a0, Math.PI * 1.85);
    }
    ctx.strokeStyle = CELL_CAP_HI[lit];
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  if (layer(1, CELL_EMPTY[lit])) {
    // light catching the lower walls of the open cells
    const hx = r * 0.78, hy = r * 0.42;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (kind[i] !== 1) continue;
      ctx.moveTo(cx[i] - hx, cy[i] + hy);
      ctx.lineTo(cx[i], cy[i] + r * 0.86);
      ctx.lineTo(cx[i] + hx, cy[i] + hy);
    }
    ctx.strokeStyle = lit ? 'rgba(255,170,80,0.18)' : 'rgba(255,170,80,0.07)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  if (layer(2, CELL_HONEY[lit])) {
    layer(2, CELL_HONEY_IN[lit], r * 0.62, r * 0.12);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (kind[i] !== 2) continue;
      const ex = cx[i] - r * 0.3, ey = cy[i] - r * 0.32;
      ctx.moveTo(ex + r * 0.22 * Math.cos(-0.4), ey + r * 0.22 * Math.sin(-0.4));
      ctx.ellipse(ex, ey, r * 0.22, r * 0.12, -0.4, 0, TAU);
    }
    ctx.fillStyle = 'rgba(255,232,170,0.45)';
    ctx.fill();
  }
  // pale larvae curled asleep in their cells
  let larvae = false;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (kind[i] !== 3) continue;
    const ex = cx[i], ey = cy[i] + r * 0.1;
    ctx.moveTo(ex + r * 0.5 * Math.cos(0.35), ey + r * 0.5 * Math.sin(0.35));
    ctx.ellipse(ex, ey, r * 0.5, r * 0.62, 0.35, 0, TAU);
    larvae = true;
  }
  if (larvae) {
    ctx.fillStyle = CELL_GRUB[lit];
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (kind[i] !== 3) continue;
      ctx.moveTo(cx[i] - r * 0.42, cy[i] - r * 0.05);
      ctx.lineTo(cx[i] + r * 0.3, cy[i] + r * 0.2);
      ctx.moveTo(cx[i] - r * 0.3, cy[i] + r * 0.35);
      ctx.lineTo(cx[i] + r * 0.38, cy[i] + r * 0.52);
    }
    ctx.strokeStyle = 'rgba(40,24,8,0.5)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

const combSpr = new Map<string, HTMLCanvasElement[]>();
/** One pre-rendered back-wall cell per kind at the chunk's pixel scale: stamping beats rasterising hundreds of hexes. */
function combSprites(R: number, s: number) {
  const key = R + '|' + s.toFixed(3);
  let a = combSpr.get(key);
  if (a) return a;
  if (combSpr.size > 6) combSpr.clear();
  a = [];
  const S = Math.ceil((R + 1) * 2 * s);
  for (let k = 0; k < 4; k++) {
    const m = makeCanvas(S, S);
    m.ctx.scale(s, s);
    combCells(m.ctx, [R + 1], [R + 1], [k], R, 0);
    a.push(m.c);
  }
  combSpr.set(key, a);
  return a;
}

/**
 * Honeycomb back wall for the Hive, drawn into a tile chunk over the world rect
 * x0..x1, y0..y1. Where the comb has broken away, the cavern parallax shows through.
 */
export function drawHiveWall(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number) {
  const R = 8.5, HW = R * Math.sqrt(3), VS = R * 1.5;
  const sprites = combSprites(R, Math.abs(ctx.getTransform().a) || 1);
  const j0 = Math.floor(y0 / VS) - 1, j1 = Math.ceil(y1 / VS) + 1;
  const i0 = Math.floor(x0 / HW) - 1, i1 = Math.ceil(x1 / HW) + 1;
  const cells: number[] = [], drips: number[] = [], glows: number[] = [];
  const hx = R * 0.866, hy = R * 0.5;
  const vx = [0, hx, hx, 0, -hx, -hx], vy = [-R, -hy, hy, R, hy, -hy];
  // broken comb at the edges of the holes: rim fragments only
  ctx.beginPath();
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cx = i * HW + (j & 1 ? HW / 2 : 0), cy = j * VS;
      const n = noise2(cx / 150, cy / 110, seed) * 0.72 + noise2(cx / 42, cy / 42, seed + 9) * 0.28;
      if (n < 0.44) continue;
      if (n < 0.5) {
        for (let k = 0; k < 6; k++) {
          if (hash2(i * 6 + k, j, seed + 5) < 0.45) continue;
          ctx.moveTo(cx + vx[k], cy + vy[k]);
          ctx.lineTo(cx + vx[(k + 1) % 6], cy + vy[(k + 1) % 6]);
        }
        continue;
      }
      const h = hash2(i, j, seed + 3);
      const kind = h < 0.55 ? 0 : h < 0.86 ? 1 : h < 0.97 ? 2 : 3;
      cells.push(kind, cx, cy);
      if (kind === 2 && hash2(i, j, seed + 8) < 0.35) drips.push(cx, cy + R * 0.6, 4 + hash2(i, j, seed + 9) * 8);
      if (hash2(i, j, seed + 12) < 0.02) glows.push(cx, cy);
    }
  }
  ctx.strokeStyle = CELL_WALL[0];
  ctx.lineWidth = 2;
  ctx.stroke();
  const D = (R + 1) * 2;
  for (let k = 0; k < cells.length; k += 3) ctx.drawImage(sprites[cells[k]], cells[k + 1] - R - 1, cells[k + 2] - R - 1, D, D);
  // honey sagging out of a few cells
  if (drips.length) {
    ctx.beginPath();
    for (let k = 0; k < drips.length; k += 3) {
      const cx = drips[k], top = drips[k + 1], L = drips[k + 2];
      ctx.moveTo(cx - 1.4, top);
      ctx.lineTo(cx - 1, top + L);
      ctx.arc(cx, top + L, 1.4, Math.PI, 0, true);
      ctx.lineTo(cx + 1.4, top);
      ctx.closePath();
    }
    ctx.fillStyle = '#3e2208';
    ctx.fill();
  }
  // warm light pooling in a few deep cells
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < glows.length; k += 2) blob(ctx, '#c8701a', glows[k], glows[k + 1], 20, 20, 0.22);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- tiles

/** Solid tile surfaces for Chapter III: cracked bone-white earth, resin and chitin, gold-inlaid stone. */
export function drawSolidCh3(ctx: Ctx, biome: Ch3Biome, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
  if (t === T.Seal) base = '#7a5a28';
  if (t === T.Wood) base = pal.plat;
  const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  ctx.fillStyle = mix(dark, '#000000', v * 0.12);
  ctx.fillRect(x, y, TILE, TILE);
  if (biome === 'valley') valleyTile(ctx, pal, x, y, tx, ty, depth, v, up, dn, lf, rt, solid);
  else if (biome === 'hive') hiveTile(ctx, pal, x, y, tx, ty, depth, v, up, dn, lf, rt);
  else trialTile(ctx, pal, x, y, tx, ty, depth, v, up, dn, lf, rt);
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

function valleyTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, solid: (a: number, b: number) => boolean) {
  if (depth <= 1) {
    // Sun-split crust: each tile has a node, and cracks run from it to points on
    // the edges it shares with its neighbours, so the network is continuous.
    const nx = x + 4 + hash2(tx, ty, 11) * 8, ny = y + 4 + hash2(tx, ty, 12) * 8;
    const crack = (dx: number, dy: number) => {
      ctx.beginPath();
      if (rt && hash2(tx, ty, 13) < 0.65) { ctx.moveTo(nx + dx, ny + dy); ctx.lineTo(x + TILE + dx, y + 3 + hash2(tx, ty, 14) * 10 + dy); }
      if (lf && hash2(tx - 1, ty, 13) < 0.65) { ctx.moveTo(nx + dx, ny + dy); ctx.lineTo(x + dx, y + 3 + hash2(tx - 1, ty, 14) * 10 + dy); }
      if (dn && hash2(tx, ty, 15) < 0.55) { ctx.moveTo(nx + dx, ny + dy); ctx.lineTo(x + 3 + hash2(tx, ty, 16) * 10 + dx, y + TILE + dy); }
      if (up && hash2(tx, ty - 1, 15) < 0.55) { ctx.moveTo(nx + dx, ny + dy); ctx.lineTo(x + 3 + hash2(tx, ty - 1, 16) * 10 + dx, y + dy); }
    };
    crack(0, 0);
    ctx.strokeStyle = 'rgba(20,14,8,0.42)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // bleached bone weathering out of the bank
    if (up && hash2(tx, ty, 21) < 0.06) {
      const bx = x + 3 + hash2(tx, ty, 22) * 8, by = y + 4 + hash2(tx, ty, 23) * 8, a = hash2(tx, ty, 24) * Math.PI;
      longBone(ctx, bx, by, bx + Math.cos(a) * 6, by + Math.sin(a) * 3, 1.1, mix(BONE, pal.stoneDark, 0.25 + depth * 0.2));
    }
    ctx.fillStyle = rgba('#fff4dc', 0.03 + v * 0.04);
    ctx.fillRect(x + 1, y + 1, 6, 2);
  }
  if (!up) {
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 3);
    for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 4 + hash2(tx, i, 31) * 2, y + 3, 1.5 + hash2(tx, i, 32) * 2.5, 0.6 + hash2(tx, i, 33) * 1.4);
    ctx.fillStyle = 'rgba(255,250,232,0.24)';
    ctx.fillRect(x, y, TILE, 0.9);
    if (hash2(tx, ty, 34) < 0.07) {
      // a rib or finger bone poking through the crust
      const bx = x + 3 + hash2(tx, ty, 35) * 8, d = hash2(tx, ty, 36) < 0.5 ? 1 : -1;
      const c = bez([bx, y + 2, bx + d * 1, y - 4, bx + d * 4, y - 7, bx + d * 7, y - 6], 6, 2.2, 0.9);
      ctx.beginPath();
      bandPath(ctx, c);
      solidify(ctx, BONE, OUT, 0.4);
    } else {
      // dry grass and grit
      ctx.fillStyle = pal.capTuft;
      for (let i = 0; i < 2; i++) {
        const fx = x + hash2(tx, i, 3) * 14;
        ctx.fillRect(fx, y - 1.2 - hash2(tx, i, 9) * 2.4, 0.9, 2.6);
        ctx.fillRect(fx + 1.2, y - 0.8 - hash2(tx, i, 10) * 1.6, 0.8, 1.8);
      }
      if (hash2(tx, ty, 37) < 0.3) ellipse(ctx, x + 4 + hash2(tx, ty, 38) * 8, y - 0.2, 1.3, 0.8, 0, shade(pal.stone, 0.15));
    }
  }
  if (!dn && hash2(tx, ty, 41) < 0.25) {
    // dry roots dangling from an overhang
    ctx.strokeStyle = 'rgba(40,30,20,0.7)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const rx = x + 3 + v * 9;
    ctx.moveTo(rx, y + TILE);
    ctx.quadraticCurveTo(rx + 2, y + TILE + 3, rx + 0.5, y + TILE + 5 + v * 5);
    ctx.stroke();
  }
  edges(ctx, x, y, dn, lf, rt, 'rgba(255,248,230,0.08)');
}

function chitinPlates(ctx: Ctx, x: number, y: number, ty: number, dy: number) {
  // Overlapping chitin segments, periodic per tile so neighbours line up.
  for (let r = 0; r < 2; r++) {
    const py = y + 6 + r * 8 + dy;
    if (((ty * 2 + r) & 1) === 0) {
      ctx.moveTo(x, py);
      ctx.quadraticCurveTo(x + 4, py + 3.5, x + 8, py);
      ctx.quadraticCurveTo(x + 12, py + 3.5, x + 16, py);
    } else {
      ctx.moveTo(x, py + 1.75);
      ctx.quadraticCurveTo(x + 2, py + 1.75, x + 4, py);
      ctx.quadraticCurveTo(x + 8, py + 3.5, x + 12, py);
      ctx.quadraticCurveTo(x + 14, py + 1.75, x + 16, py + 1.75);
    }
  }
}

function hiveTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  if (depth <= 1) {
    ctx.beginPath();
    chitinPlates(ctx, x, y, ty, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    if (hash2(tx, ty, 41) < 0.12) {
      // resin seeping through the shell
      const rx = x + 3 + hash2(tx, ty, 42) * 10, ry = y + 4 + hash2(tx, ty, 43) * 8;
      ellipse(ctx, rx, ry, 3, 2.2, 0, '#5a3010');
      ellipse(ctx, rx, ry, 2.2, 1.6, 0, '#b8681c');
      ellipse(ctx, rx - 0.6, ry - 0.5, 0.8, 0.5, 0, 'rgba(255,226,150,0.7)');
    }
  }
  if (!up) {
    // a glossy coat of resin over the top, sagging down the face
    ctx.fillStyle = '#8a4e14';
    ctx.fillRect(x, y, TILE, 4);
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 2.8);
    const nd = 1 + ((hash2(tx, ty, 51) * 2) | 0);
    for (let i = 0; i < nd; i++) {
      const dx = x + 2 + hash2(tx, i, 52) * 11, L = 2 + hash2(tx, i, 53) * 5;
      ctx.fillStyle = '#8a4e14';
      ctx.beginPath();
      ctx.moveTo(dx - 1.3, y + 3);
      ctx.lineTo(dx - 1, y + 3 + L);
      ctx.arc(dx, y + 3 + L, 1.1, Math.PI, 0, true);
      ctx.lineTo(dx + 1.3, y + 3);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,232,170,0.6)';
    ctx.fillRect(x + hash2(tx, ty, 54) * 6, y + 0.5, 4 + v * 6, 0.7);
    ctx.fillStyle = pal.capTuft;
    if (hash2(tx, ty, 55) < 0.35) circle(ctx, x + 3 + hash2(tx, ty, 56) * 10, y - 0.6, 1.1, pal.cap);
  }
  if (!dn && hash2(tx, ty, 57) < 0.4) {
    // resin drips hanging from the underside
    const dx = x + 3 + hash2(tx, ty, 58) * 10, L = 3 + hash2(tx, ty, 59) * 6;
    ctx.fillStyle = '#8a4e14';
    ctx.beginPath();
    ctx.moveTo(dx - 2, y + TILE);
    ctx.quadraticCurveTo(dx - 0.6, y + TILE + L * 0.6, dx - 1.2, y + TILE + L);
    ctx.arc(dx, y + TILE + L, 1.2, Math.PI, 0, true);
    ctx.quadraticCurveTo(dx + 0.6, y + TILE + L * 0.6, dx + 2, y + TILE);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,140,0.55)';
    ctx.fillRect(dx - 0.6, y + TILE + L - 0.8, 0.6, 0.6);
  }
  edges(ctx, x, y, dn, lf, rt, 'rgba(255,170,70,0.1)');
}

function trialTile(ctx: Ctx, pal: BiomePal, x: number, y: number, tx: number, ty: number, depth: number, v: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  if (depth <= 1) {
    // dressed ashlar: one course per tile, joints staggered course to course
    const off = ty & 1 ? 8 : 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.3);
    ctx.lineTo(x + TILE, y + 0.3);
    ctx.moveTo(x + off + 0.3, y);
    ctx.lineTo(x + off + 0.3, y + TILE);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x, y + 1.1);
    ctx.lineTo(x + TILE, y + 1.1);
    ctx.moveTo(x + off + 1.1, y + 1);
    ctx.lineTo(x + off + 1.1, y + TILE);
    ctx.stroke();
    if ((ty & 3) === 2) {
      // a running band of gold inlay
      ctx.fillStyle = '#7a5a22';
      ctx.fillRect(x, y + 7.4, TILE, 1.6);
      ctx.fillStyle = GOLD;
      ctx.fillRect(x, y + 7.4, TILE, 0.8);
    } else if (hash2(tx, ty, 51) < 0.07) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 5);
      ctx.lineTo(x + 11, y + 8);
      ctx.lineTo(x + 8, y + 11);
      ctx.lineTo(x + 5, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = GOLD_HI;
      ctx.fillRect(x + 7.4, y + 6.2, 1.2, 1.2);
    }
    ctx.fillStyle = rgba('#ffffff', 0.03 + v * 0.04);
    ctx.fillRect(x + 2, y + 2, 5, 1.5);
  }
  if (!up) {
    ctx.fillStyle = pal.cap;
    ctx.fillRect(x, y, TILE, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x, y, TILE, 0.8);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y + 3, TILE, 0.9);
    if (hash2(tx, ty, 61) < 0.2) {
      ctx.fillStyle = GOLD_HI;
      ctx.fillRect(x + hash2(tx, ty, 62) * 14, y + 3, 1, 0.9);
    }
  }
  edges(ctx, x, y, dn, lf, rt, 'rgba(255,255,255,0.1)');
}

/** One-way platforms: bone-braced planks, resin shelves, stone slabs. */
export function drawOneWayCh3(ctx: Ctx, biome: Ch3Biome, pal: BiomePal, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'valley') {
    ctx.fillStyle = shade(pal.plat, -0.3);
    ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = pal.plat;
    ctx.fillRect(x, y, TILE, 3.2);
    ctx.fillStyle = 'rgba(255,240,210,0.16)';
    ctx.fillRect(x, y, TILE, 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + ((hash2(tx, ty) * 12) | 0) + 2, y + 0.8, 0.8, 3.4);
    if ((tx & 1) === 0) {
      // rope lashing
      ctx.strokeStyle = '#4e3c24';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 0.4);
      ctx.lineTo(x + 8, y + 5.2);
      ctx.moveTo(x + 8, y - 0.4);
      ctx.lineTo(x + 10, y + 5.2);
      ctx.stroke();
    }
    if (l || r) {
      // a long bone braced under the end
      const bx = l ? x + 3 : x + TILE - 3, d = l ? 1 : -1;
      longBone(ctx, bx, y + 5, bx + d * 6, y + 14, 1.3, BONE_SH);
    } else if (hash2(tx, ty, 61) < 0.18) {
      // a bone charm hanging on a cord
      ctx.strokeStyle = '#3a2c1c';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 5);
      ctx.lineTo(x + 8, y + 10);
      ctx.stroke();
      longBone(ctx, x + 6.5, y + 11, x + 9.5, y + 11.5, 0.8, BONE);
    }
    return;
  }
  if (biome === 'hive') {
    // a shelf of hardened resin, sagging underneath
    const sag = 6 + hash2(tx, ty, 63) * 3;
    ctx.fillStyle = '#6a3a0e';
    ctx.beginPath();
    ctx.moveTo(x - 0.5, y);
    ctx.lineTo(x + TILE + 0.5, y);
    ctx.lineTo(x + TILE + 0.5, y + 3.5);
    ctx.quadraticCurveTo(x + 8, y + sag, x - 0.5, y + 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c47c24';
    ctx.fillRect(x, y, TILE, 2.6);
    ctx.fillStyle = 'rgba(255,232,170,0.6)';
    ctx.fillRect(x + hash2(tx, ty, 64) * 6, y + 0.4, 5, 0.7);
    if (hash2(tx, ty, 65) < 0.35) {
      const dx = x + 4 + hash2(tx, ty, 66) * 8, L = 2 + hash2(tx, ty, 67) * 4, top = y + sag * 0.5 + 1;
      ctx.fillStyle = '#6a3a0e';
      ctx.beginPath();
      ctx.moveTo(dx - 1.2, top);
      ctx.lineTo(dx - 0.9, top + L);
      ctx.arc(dx, top + L, 1, Math.PI, 0, true);
      ctx.lineTo(dx + 1.2, top);
      ctx.fill();
    }
    if (l || r) {
      const ex = l ? x + 1 : x + TILE - 1;
      ellipse(ctx, ex, y + 2.6, 3, 3.2, 0, '#6a3a0e');
      ellipse(ctx, ex, y + 1.6, 2.4, 1.6, 0, '#c47c24');
    }
    return;
  }
  // trial: a pale slab with a gold edge and corbels at the ends
  ctx.fillStyle = shade(pal.plat, -0.4);
  ctx.fillRect(x, y, TILE, 5);
  ctx.fillStyle = pal.plat;
  ctx.fillRect(x, y, TILE, 3.4);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fillRect(x, y, TILE, 0.8);
  ctx.fillStyle = GOLD;
  ctx.fillRect(x, y + 3.4, TILE, 0.7);
  if ((tx & 1) === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + 0.8, 0.6, 4.2);
  }
  if (l || r) {
    const bx = l ? x : x + TILE - 6;
    ctx.fillStyle = shade(pal.plat, -0.3);
    ctx.fillRect(bx, y + 5, 6, 2.2);
    ctx.fillRect(bx + 1.2, y + 7.2, 3.6, 2.4);
    ctx.fillStyle = GOLD;
    ctx.fillRect(bx + 2.5, y + 8, 1, 1);
  }
}

/** Liquid 'w' tiles: a glossy amber resin pool in the Hive, brackish water in the Valley. */
export function drawLiquidCh3(ctx: Ctx, biome: Biome, x: number, y: number, top: boolean, tx: number, t: number): boolean {
  if (biome === 'hive') {
    const wy = top ? Math.sin(t * 0.9 + tx * 0.6) * 0.5 + 4 : 0;
    ctx.fillStyle = '#4a2406';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    ctx.fillStyle = 'rgba(160,80,14,0.55)';
    ctx.fillRect(x, y + wy, TILE, Math.min(5, TILE - wy));
    if (top) {
      ctx.fillStyle = '#e09030';
      ctx.fillRect(x, y + wy, TILE, 1.1);
      // a slow specular glint sliding along the surface
      const g = (t * 6 + tx * 16) % 64;
      if (g < TILE) {
        ctx.fillStyle = 'rgba(255,240,190,0.85)';
        ctx.fillRect(x + g, y + wy + 0.2, 3, 0.7);
      }
      if (hash2(tx, Math.floor(t * 0.6), 9) < 0.08) {
        ctx.strokeStyle = 'rgba(255,214,140,0.55)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(x + 8, y + wy, 1.6, Math.PI, 0);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#a85a14', x + 8, y + 8, 12, 12, 0.18);
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  if (biome === 'valley') {
    const wy = top ? Math.sin(t * 1.6 + tx * 0.8) * 0.6 + 6 : 0;
    ctx.fillStyle = 'rgba(58,60,38,0.72)';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    if (top) {
      ctx.fillStyle = 'rgba(176,170,130,0.4)';
      ctx.fillRect(x, y + wy, TILE, 0.8);
      ctx.fillStyle = 'rgba(120,112,72,0.55)';
      const sx = (tx * 7 + Math.floor(t * 0.5) * 3) % 12;
      ctx.fillRect(x + sx, y + wy + 1.6, 2.5, 0.6);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- props

type PropFn = (ctx: Ctx, e: Decor, pal: BiomePal, rng: RNG) => void;

/** Local bounds [x0, y0, x1, y1] of each prop around its anchor, used to skip chunks it cannot touch. */
const BOUNDS: Record<string, (e: Decor) => [number, number, number, number]> = {
  giant_ribs: (e) => { const W = (e.w ?? 10) * TILE, H = (e.h ?? 9) * TILE; return [-W / 2 - 24, -H * 1.2, W / 2 + H * 0.6 + 24, 12]; },
  giant_skull: (e) => { const u = ((e.w ?? 8) * TILE) / 8; return [-5.2 * u, -7 * u, 5.2 * u, 2 * u]; },
  bone_pile: (e) => { const W = (e.w ?? 2.5) * TILE; return [-W / 2 - 12, -24, W / 2 + 12, 6]; },
  dead_tree: (e) => { const H = (e.h ?? 6) * TILE; return [-0.7 * H, -1.1 * H, 0.7 * H, 6]; },
  bone_arch: (e) => { const W = (e.w ?? 6) * TILE, H = (e.h ?? (e.w ?? 6) * 0.85) * TILE; return [-W / 2 - 24, -H - 24, W / 2 + 24, 8]; },
  cairn: (e) => { const s = (e.w ?? 2) / 2; return [-24 * s, -84 * s, 38 * s, 6]; },
  hive_wall: (e) => { const W = (e.w ?? 6) * TILE, H = (e.h ?? 5) * TILE; return [-W / 2 - 8, -H - 8, W / 2 + 8, 16]; },
  resin_pillar: (e) => [-32, -(e.h ?? 8) * TILE - 12, 32, 6],
  egg_cluster: (e) => { const W = (e.w ?? 2.5) * TILE; return [-W - 4, -44, W + 4, 8]; },
  glow_pod: (e) => [-26, -10, 26, podLen(e) + 32],
  cocoon: (e) => { const W = (e.w ?? 5) * TILE, H = (e.h ?? 7) * TILE; return [-W * 1.3, -H - 60, W * 1.3, 8]; },
  chitin_shells: (e) => { const W = (e.w ?? 3) * TILE; return [-W / 2 - 32, -26, W / 2 + 32, 6]; },
  trial_ring: (e) => { const rx = ((e.w ?? 8) * TILE) / 2; return [-rx * 1.3, -rx * 1.2, rx * 1.3, 14]; },
  trial_pillar: (e) => [-30, -(e.h ?? 7) * TILE - 24, 30, 6],
  trial_banner: (e) => [-20, -4, 20, (e.h ?? 5) * TILE + 6],
};

/** Chapter III props. Returns false for kinds it does not know. */
export function drawPropCh3(ctx: Ctx, e: Decor, pal: BiomePal, seed: number): boolean {
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

const giantRibs: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 10) * TILE, H = (e.h ?? 9) * TILE;
  const k = H / 144;
  const n = Math.max(4, Math.round(W / (25 * Math.sqrt(k))));
  for (let pass = 0; pass < 2; pass++) {
    const back = pass === 0;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const hh = H * (0.42 + 0.58 * Math.sin(Math.PI * (0.08 + 0.84 * u))) * (back ? 0.9 : 1) * rng.range(0.93, 1.04);
      const bx = -W / 2 + W * u + (back ? 10 * k : 0);
      const lean = (u - 0.5) * 0.3;
      const p = [bx, 6, bx - hh * (0.14 - lean * 0.5), -hh * 0.74, bx + hh * (0.2 + lean), -hh * 1.14, bx + hh * (0.52 + lean * 0.6), -hh * 0.6];
      const broken = rng.chance(back ? 0.3 : 0.2);
      const c = bez(p, 20, 10 * k, 2.8 * k, broken ? rng.range(0.55, 0.8) : 0.97);
      ctx.beginPath();
      bandPath(ctx, c, broken);
      solidify(ctx, back ? BONE_BACK : BONE, OUT, 0.8);
      if (back) continue;
      const last = c.x.length - 2;
      sideLine(ctx, c, 1, 0.24, 1, last);
      ctx.strokeStyle = BONE_SHADOW;
      ctx.lineWidth = 2.6 * k;
      ctx.stroke();
      sideLine(ctx, c, -1, 0.22, 2, last);
      ctx.strokeStyle = BONE_HI;
      ctx.lineWidth = 1.4 * k;
      ctx.stroke();
      // hairline cracks across the bone
      ctx.strokeStyle = 'rgba(40,30,20,0.55)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let q = 0; q < 2; q++) {
        const j = rng.int(3, Math.max(4, last - 3)), w = c.w[j] * 0.5;
        ctx.moveTo(c.x[j] - c.nx[j] * w * 0.9, c.y[j] - c.ny[j] * w * 0.9);
        ctx.lineTo(c.x[j] + c.nx[j] * w * 0.1 + 1.5, c.y[j] + c.ny[j] * w * 0.1);
      }
      ctx.stroke();
    }
  }
  // the spine they hang from, sunk in the earth
  for (let x = -W / 2 - 6; x <= W / 2 + 6; x += 10 * k) vertebra(ctx, x, -2 * k, 4.6 * k, 0.12, BONE_SH);
  mound(ctx, -W / 2 - 16, W / 2 + 16, 7 * k, mix(pal.stoneDark, pal.cap, 0.4), rgba(pal.cap, 0.6), rng);
};

const giantSkull: PropFn = (ctx, e, pal, rng) => {
  const u = ((e.w ?? 8) * TILE) / 8;
  ctx.save();
  ctx.translate(0, u * 0.55);
  ctx.rotate(-0.1);
  const g = ctx.createLinearGradient(0, -6 * u, 0, 0.4 * u);
  g.addColorStop(0, '#efe6d0');
  g.addColorStop(0.45, BONE);
  g.addColorStop(1, '#8a7c62');
  ctx.beginPath();
  ctx.ellipse(-0.6 * u, -3 * u, 3.6 * u, 3 * u, 0, 0, TAU);
  // face in profile: brow, nasal bridge, maxilla
  ctx.moveTo(1.2 * u, -5.4 * u);
  ctx.lineTo(2.6 * u, -4.6 * u);
  ctx.quadraticCurveTo(3.4 * u, -4.1 * u, 3.35 * u, -3.5 * u);
  ctx.lineTo(3.25 * u, -2.6 * u);
  ctx.lineTo(3.9 * u, -1.65 * u);
  ctx.lineTo(3.6 * u, -1.35 * u);
  ctx.lineTo(3.78 * u, -0.6 * u);
  ctx.lineTo(3.7 * u, 0.1 * u);
  ctx.lineTo(3.3 * u, 0.5 * u);
  ctx.lineTo(1 * u, 0.5 * u);
  ctx.lineTo(0.4 * u, -1.2 * u);
  ctx.closePath();
  // cheekbone arch
  ctx.moveTo(0, -2.05 * u);
  ctx.lineTo(2.6 * u, -2.3 * u);
  ctx.lineTo(2.75 * u, -1.55 * u);
  ctx.lineTo(0.2 * u, -1.35 * u);
  ctx.closePath();
  solidify(ctx, g, OUT, 1.1);
  // temple hollow and the shadow under the arch
  ctx.fillStyle = 'rgba(60,46,30,0.18)';
  ctx.beginPath();
  ctx.ellipse(0.6 * u, -2.6 * u, 1.3 * u, 0.9 * u, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(40,30,20,0.35)';
  ctx.fillRect(0.3 * u, -1.35 * u, 2.4 * u, 0.25 * u);
  // the socket
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.ellipse(2.3 * u, -2.95 * u, 0.85 * u, 0.75 * u, 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = BONE_HI;
  ctx.lineWidth = 0.35 * u;
  ctx.beginPath();
  ctx.ellipse(2.3 * u, -2.95 * u, 0.85 * u, 0.75 * u, 0.15, 0.3, 2.3);
  ctx.stroke();
  // nasal aperture
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.moveTo(3.15 * u, -2.2 * u);
  ctx.lineTo(3.55 * u, -1.6 * u);
  ctx.lineTo(3.3 * u, -1.42 * u);
  ctx.lineTo(3 * u, -1.7 * u);
  ctx.closePath();
  ctx.fill();
  // teeth, a few lost
  ctx.strokeStyle = 'rgba(30,20,12,0.7)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(1.5 * u, -0.62 * u);
  ctx.lineTo(3.66 * u, -0.62 * u);
  for (let tx = 1.7; tx < 3.6; tx += 0.32) {
    ctx.moveTo(tx * u, -0.62 * u);
    ctx.lineTo(tx * u, 0.1 * u);
  }
  ctx.stroke();
  ctx.fillStyle = '#1a120c';
  ctx.fillRect(2.35 * u, -0.6 * u, 0.3 * u, 0.6 * u);
  ctx.fillRect(3.0 * u, -0.6 * u, 0.3 * u, 0.5 * u);
  // coronal suture
  ctx.strokeStyle = 'rgba(60,46,30,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const px = (0.3 + (i % 2 ? 0.12 : -0.12) - i * 0.06) * u, py = (-5.95 + i * 0.33) * u;
    if (!i) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // a hole broken in the back of the cranium: something lives inside
  ctx.fillStyle = '#140c08';
  ctx.beginPath();
  const hx = -2.5 * u, hy = -4 * u;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, rr = 0.75 * u * rng.range(0.7, 1.15);
    if (!i) ctx.moveTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.85);
    else ctx.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.85);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#d0801c', hx, hy + 0.2 * u, 0.7 * u, 0.6 * u, 0.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(40,28,18,0.6)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(hx + 0.7 * u, hy - 0.2 * u);
  ctx.lineTo(hx + 1.4 * u, hy - 0.6 * u);
  ctx.lineTo(hx + 1.9 * u, hy - 0.4 * u);
  ctx.moveTo(hx - 0.3 * u, hy + 0.7 * u);
  ctx.lineTo(hx - 0.1 * u, hy + 1.5 * u);
  ctx.stroke();
  // dust settled on the crown
  ctx.strokeStyle = rgba(pal.cap, 0.65);
  ctx.lineWidth = 0.22 * u;
  ctx.beginPath();
  ctx.ellipse(-0.6 * u, -3 * u, 3.5 * u, 2.9 * u, 0, Math.PI * 1.2, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
  mound(ctx, -4.8 * u, 4.6 * u, 0.75 * u, mix(pal.stoneDark, pal.cap, 0.4), rgba(pal.cap, 0.6), rng);
};

const bonePile: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 2.5) * TILE;
  const cols = [BONE, BONE_SH, '#c2b498'];
  for (let i = 0; i < 6; i++) {
    const cx = rng.range(-W * 0.32, W * 0.32), cy = -rng.range(1.5, 4.5) - (Math.abs(cx) < W * 0.2 ? 2.5 : 0);
    const a = rng.range(-0.45, 0.45), L = rng.range(10, 17);
    longBone(ctx, cx - (Math.cos(a) * L) / 2, cy - (Math.sin(a) * L) / 2, cx + (Math.cos(a) * L) / 2, cy + (Math.sin(a) * L) / 2, rng.range(1.3, 1.9), rng.pick(cols));
  }
  for (let i = 0; i < 2; i++) {
    const bx = rng.range(-W * 0.3, W * 0.3), d = rng.chance(0.5) ? 1 : -1;
    const c = bez([bx, -1, bx + d * 2, -7, bx + d * 7, -10, bx + d * 11, -8], 8, 2, 0.9);
    ctx.beginPath();
    bandPath(ctx, c);
    solidify(ctx, BONE_SH, OUT, 0.45);
  }
  smallSkull(ctx, rng.range(-3, 3), -9, 4.2, rng.chance(0.5) ? 1 : -1, BONE);
};

const deadTree: PropFn = (ctx, e, pal, rng) => {
  const H = (e.h ?? 6) * TILE;
  const bark = '#4c4238', barkHi = 'rgba(200,184,156,0.35)';
  // roots splayed over the ground
  ctx.strokeStyle = bark;
  ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(d * 6, -1, d * 12 + rng.range(-2, 2), 1);
    ctx.stroke();
  }
  const lean = rng.range(-0.12, 0.12);
  const tx = lean * H, ty = -H * 0.62;
  const trunk = bez([0, 2, lean * H * 0.2 - 3, -H * 0.25, lean * H * 0.7 + 4, -H * 0.45, tx, ty], 14, H * 0.08, H * 0.03);
  ctx.beginPath();
  bandPath(ctx, trunk);
  solidify(ctx, bark, OUT, 0.6);
  sideLine(ctx, trunk, 1, 0.25, 0, trunk.x.length - 2);
  ctx.strokeStyle = barkHi;
  ctx.lineWidth = 1;
  ctx.stroke();
  const branch = (x0: number, y0: number, len: number, a: number, w: number, d: number) => {
    const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = w + 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const mx = (x0 + x1) / 2 + rng.range(-len * 0.25, len * 0.25), my = (y0 + y1) / 2;
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = bark;
    ctx.lineWidth = w;
    ctx.stroke();
    if (d > 0) {
      branch(x1, y1, len * 0.66, a - rng.range(0.3, 0.8), w * 0.62, d - 1);
      if (rng.chance(0.7)) branch(x1, y1, len * 0.6, a + rng.range(0.3, 0.8), w * 0.6, d - 1);
    }
  };
  branch(tx, ty, H * 0.24, lean - 0.5, H * 0.03, 2);
  branch(tx, ty, H * 0.28, lean + 0.45, H * 0.03, 2);
  const mid = 8;
  branch(trunk.x[mid], trunk.y[mid], H * 0.2, rng.chance(0.5) ? -1 : 1.1, H * 0.022, 1);
};

const boneArch: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 6) * TILE, H = (e.h ?? (e.w ?? 6) * 0.85) * TILE;
  const a = W / 2, b = H;
  const L = (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / 2;
  const n = Math.max(7, Math.round(L / 10));
  const k = Math.sqrt(W / 96);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), th = Math.PI * (1 - u);
    const px = Math.cos(th) * a, py = -Math.sin(th) * b;
    const ang = Math.atan2(b * Math.cos(th), a * Math.sin(th));
    const s = (5.6 - 1.8 * u) * k;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    // local -y points away from the arch's centre: the spines bristle outward
    vertebra(ctx, 0, 0, s, 0, i % 2 ? BONE : '#cbbea2');
    ctx.restore();
  }
  for (const side of [-1, 1]) mound(ctx, side * a - 12 * k, side * a + 12 * k, 6 * k, mix(pal.stoneDark, pal.cap, 0.4), rgba(pal.cap, 0.6), rng);
};

const cairn: PropFn = (ctx, e, pal, rng) => {
  const s = (e.w ?? 2) / 2;
  const sizes = [[15, 5.5], [12, 5], [9.5, 4.5], [7, 4], [5, 3.4]];
  let y = 0;
  for (const [rw, rh] of sizes) {
    const w = rw * s, h = rh * s, cx = rng.range(-1.5, 1.5) * s, cy = y - h * 0.85;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, j = rng.range(0.88, 1.1);
      const px = cx + Math.cos(a) * w * j, py = cy + Math.sin(a) * h * j * (Math.sin(a) > 0 ? 0.8 : 1);
      if (!i) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    solidify(ctx, mix(pal.stone, pal.stoneDark, rng.range(0.15, 0.5)), OUT, 0.6);
    ctx.fillStyle = 'rgba(255,245,220,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.15, cy - h * 0.45, w * 0.55, h * 0.28, 0, 0, TAU);
    ctx.fill();
    y = cy - h * 0.75;
  }
  // a staff with a faded cloth strip streaming in the wind
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(-0.8, y - 22 * s, 1.6, 24 * s);
  const ty = y - 20 * s;
  const top: number[] = [], bot: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const px = 0.8 + i * 2.6 * s, wv = Math.sin(i * 0.9 + 0.5) * 1.6 + i * 0.7, w = 3.4 * s * (1 - i * 0.06);
    top.push(px, ty + wv);
    bot.push(px, ty + wv + w);
  }
  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  for (let i = 2; i < top.length; i += 2) ctx.lineTo(top[i], top[i + 1]);
  ctx.lineTo(top[top.length - 2] + 2, top[top.length - 1] + 1);
  ctx.lineTo(bot[bot.length - 2] + 1, bot[bot.length - 1] - 0.5);
  for (let i = bot.length - 2; i >= 0; i -= 2) ctx.lineTo(bot[i], bot[i + 1]);
  ctx.closePath();
  solidify(ctx, '#8c3626', OUT, 0.45);
  ctx.strokeStyle = 'rgba(40,10,6,0.45)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 2; i < top.length - 2; i += 4) {
    ctx.moveTo(top[i], top[i + 1] + 0.6);
    ctx.lineTo(bot[i], bot[i + 1] - 0.4);
  }
  ctx.stroke();
  if (rng.chance(0.6)) smallSkull(ctx, 9 * s, -3, 3, -1, BONE_SH);
};

// ----- hive

const hiveWall: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 6) * TILE, H = (e.h ?? 5) * TILE;
  const N = 30;
  const pts: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a);
    const r = 1 + (rng.next() - 0.5) * 0.14 + 0.05 * Math.sin(a * 3 + 1.3);
    pts.push(Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (W / 2) * r, Math.min(2, -H / 2 + Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (H / 2) * r));
  }
  const outline = () => {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const mx = (pts[i * 2] + pts[j * 2]) / 2, my = (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2;
      if (!i) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx, my);
    }
    ctx.quadraticCurveTo(pts[0], pts[1], (pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = '#1a0e06';
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  const R = 7, HW = R * Math.sqrt(3), VS = R * 1.5;
  const xs: number[] = [], ys: number[] = [], ks: number[] = [];
  for (let j = Math.floor(-H / VS) - 1; j <= 1; j++) {
    for (let i = Math.floor(-W / 2 / HW) - 1; i <= Math.ceil(W / 2 / HW) + 1; i++) {
      const h = rng.next();
      xs.push(i * HW + (j & 1 ? HW / 2 : 0));
      ys.push(j * VS);
      ks.push(h < 0.42 ? 0 : h < 0.62 ? 1 : h < 0.92 ? 2 : 3);
    }
  }
  combCells(ctx, xs, ys, ks, R, 1);
  // edge darkening so the panel sits into the wall
  const g = ctx.createRadialGradient(0, -H / 2, Math.min(W, H) * 0.2, 0, -H / 2, Math.max(W, H) * 0.62);
  g.addColorStop(0, 'rgba(10,4,0,0)');
  g.addColorStop(1, 'rgba(10,4,0,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(-W, -H - 4, W * 2, H + 8);
  ctx.restore();
  // a rim of resin, sagging into drips along the bottom
  outline();
  ctx.strokeStyle = '#6a3a0e';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,160,70,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#6a3a0e';
  for (let i = 0; i < 4; i++) {
    const dx = rng.range(-W * 0.35, W * 0.35), L = rng.range(4, 10);
    ctx.beginPath();
    ctx.moveTo(dx - 1.6, -2);
    ctx.lineTo(dx - 1.1, L);
    ctx.arc(dx, L, 1.2, Math.PI, 0, true);
    ctx.lineTo(dx + 1.6, -2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) blob(ctx, '#d07a1a', rng.range(-W * 0.3, W * 0.3), -H * rng.range(0.25, 0.75), 16, 16, 0.3);
  ctx.globalCompositeOperation = 'source-over';
};

const resinPillar: PropFn = (ctx, e, pal, rng) => {
  const H = (e.h ?? 8) * TILE;
  const ph = rng.range(0, TAU);
  const n = Math.max(12, Math.round(H / 8));
  const cxAt = (s: number) => Math.sin(s * 5 + ph) * 3;
  const hwAt = (s: number) => 9 + 10 * Math.pow(1 - s, 6) + 11 * Math.pow(s, 7) + Math.sin(s * 11 + ph * 2) * 1.6;
  const shape = () => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      ctx.lineTo(cxAt(s) - hwAt(s), -s * H);
    }
    for (let i = n; i >= 0; i--) {
      const s = i / n;
      ctx.lineTo(cxAt(s) + hwAt(s) * (1 + 0.08 * Math.sin(s * 7 + ph)), -s * H);
    }
    ctx.closePath();
  };
  shape();
  const g = ctx.createLinearGradient(-20, 0, 20, 0);
  g.addColorStop(0, '#160a04');
  g.addColorStop(0.3, '#5e3410');
  g.addColorStop(0.48, '#8a5418');
  g.addColorStop(0.8, '#331c0c');
  g.addColorStop(1, '#120802');
  solidify(ctx, g, OUT, 0.8);
  ctx.save();
  shape();
  ctx.clip();
  for (let q = 0; q < 4; q++) {
    const off = rng.range(-0.7, 0.7), lw = rng.range(1.2, 3);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const px = cxAt(s) + off * hwAt(s);
      if (!i) ctx.moveTo(px, -s * H);
      else ctx.lineTo(px, -s * H);
    }
    ctx.strokeStyle = 'rgba(232,150,50,0.26)';
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  for (let yy = -12; yy > -H + 10; yy -= rng.range(14, 24)) {
    const s = -yy / H, cx = cxAt(s), hw = hwAt(s) + 2;
    ctx.beginPath();
    ctx.moveTo(cx - hw, yy);
    ctx.quadraticCurveTo(cx, yy + 4.5, cx + hw, yy);
    ctx.strokeStyle = 'rgba(12,6,2,0.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - hw, yy + 1.7);
    ctx.quadraticCurveTo(cx, yy + 6.2, cx + hw, yy + 1.7);
    ctx.strokeStyle = 'rgba(255,190,100,0.13)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // a patch of comb grown into the column
  const cs = rng.range(0.35, 0.6);
  const px: number[] = [], py: number[] = [], pk: number[] = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = 0; j < 2; j++) {
      px.push(cxAt(cs) + i * 8.6 + (j ? 4.3 : 0));
      py.push(-cs * H + j * 7.5);
      pk.push(rng.int(0, 2));
    }
  }
  combCells(ctx, px, py, pk, 5, 1);
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  for (let q = 0; q < 2; q++) {
    const s = rng.range(0.15, 0.85);
    const nx = cxAt(s) + rng.range(-4, 4), ny = -s * H;
    blob(ctx, '#ff9a2a', nx, ny, 12, 12, 0.55);
    ellipse(ctx, nx, ny, 2.4, 2, 0, 'rgba(255,200,110,0.8)');
  }
  ctx.globalCompositeOperation = 'source-over';
  ellipse(ctx, cxAt(0), 0, 26, 3.4, 0, '#5a300c');
  ctx.fillStyle = 'rgba(255,214,140,0.4)';
  ctx.fillRect(cxAt(0) - 14, -2.4, 10, 0.7);
};

interface Egg { x: number; y: number; rx: number; ry: number; rot: number; ph: number }
const eggCache = new WeakMap<Decor, Egg[]>();
/** Egg layout from the def's position only, so the live pulse lines up with the baked eggs. */
function eggsOf(e: Decor): Egg[] {
  let eggs = eggCache.get(e);
  if (eggs) return eggs;
  const n = Math.max(3, Math.round(6 * ((e.w ?? 2.5) / 2.5)));
  const kx = (e.x * 13) | 0, ky = (e.y * 7) | 0;
  eggs = [];
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2;
    const h1 = hash2(kx + i, ky, 71), h2 = hash2(kx + i, ky, 72);
    const back = i % 2 === 1;
    const ry = 7.6 + h2 * 2.4;
    eggs.push({ x: c * 6 + (h1 - 0.5) * 2.4, y: -ry * 0.9 - (back ? 3.5 : 0), rx: 4.2 + h1 * 1.2, ry, rot: c * 0.1 + (h1 - 0.5) * 0.22, ph: h2 * TAU });
  }
  eggs.sort((a, b) => a.y - b.y);
  eggCache.set(e, eggs);
  return eggs;
}

const eggCluster: PropFn = (ctx, e) => {
  const eggs = eggsOf(e);
  const W = (e.w ?? 2.5) * TILE;
  ellipse(ctx, 0, 0, W * 0.55, 3, 0, '#3a1c08');
  for (const g of eggs) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, TAU);
    const gr = ctx.createRadialGradient(0, g.ry * 0.3, 0, 0, 0, g.ry * 1.1);
    gr.addColorStop(0, '#e8b462');
    gr.addColorStop(0.45, '#a0601c');
    gr.addColorStop(1, '#2e1406');
    solidify(ctx, gr, '#1a0a03', 0.7);
    // something folded inside, only a shadow through the shell
    ctx.fillStyle = 'rgba(50,20,6,0.3)';
    ctx.beginPath();
    ctx.ellipse(g.rx * 0.12, -g.ry * 0.05, g.rx * 0.42, g.ry * 0.55, 0.35, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,20,6,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) {
      ctx.moveTo(-g.rx * 0.25, k * g.ry * 0.22);
      ctx.lineTo(g.rx * 0.45, k * g.ry * 0.22 + g.ry * 0.12);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,206,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx * 0.74, g.ry * 0.8, 0, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
    ctx.restore();
  }
  // glistening goo binding them
  ctx.strokeStyle = 'rgba(200,130,50,0.45)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < eggs.length - 1; i++) {
    const a = eggs[i], b = eggs[i + 1];
    ctx.moveTo(a.x, a.y + a.ry * 0.4);
    ctx.quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + 4, b.x, b.y + b.ry * 0.4);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffa030', 0, -7, W * 0.6, 10, 0.12);
  ctx.globalCompositeOperation = 'source-over';
};

const podLen = (e: Decor) => Math.max(14, (e.h ?? 2) * TILE - 4);
const podSway = (e: Decor) => (hash2((e.x * 5) | 0, (e.y * 3) | 0, 91) - 0.5) * 8;

const glowPod: PropFn = (ctx, e) => {
  const L = podLen(e), sx = podSway(e);
  // tendrils rooting it to the ceiling
  ctx.strokeStyle = '#2a1a0a';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const d of [-5, 4]) {
    ctx.moveTo(d, -2);
    ctx.quadraticCurveTo(d * 0.6, 3, sx * 0.25, 7);
  }
  ctx.stroke();
  const c = bez([0, -8, 2, L * 0.3, sx - 2, L * 0.6, sx, L - 7], 12, 3.4, 1.6);
  ctx.beginPath();
  bandPath(ctx, c);
  solidify(ctx, '#3a2410', OUT, 0.5);
  ctx.beginPath();
  ctx.moveTo(sx, L - 9.5);
  ctx.bezierCurveTo(sx + 8.5, L - 6, sx + 9, L + 6, sx, L + 9);
  ctx.bezierCurveTo(sx - 9, L + 6, sx - 8.5, L - 6, sx, L - 9.5);
  const gr = ctx.createRadialGradient(sx - 1.5, L - 1, 0, sx, L, 10);
  gr.addColorStop(0, '#f6ffc8');
  gr.addColorStop(0.4, '#c4d85a');
  gr.addColorStop(1, '#404e12');
  solidify(ctx, gr, '#141a04', 0.6);
  ctx.strokeStyle = 'rgba(50,64,10,0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(sx, L - 9);
  ctx.quadraticCurveTo(sx - 4, L, sx - 2, L + 8);
  ctx.moveTo(sx, L - 9);
  ctx.quadraticCurveTo(sx + 5, L - 1, sx + 3, L + 7);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,230,0.6)';
  ctx.beginPath();
  ctx.ellipse(sx - 3, L - 4, 1.6, 2.6, 0.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#3a4a10';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const d of [-2.5, 1, 3]) {
    ctx.moveTo(sx + d, L + 8);
    ctx.quadraticCurveTo(sx + d + 1, L + 11, sx + d - 0.5, L + 13 + Math.abs(d));
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, POD, sx, L, 20, 20, 0.3);
  ctx.globalCompositeOperation = 'source-over';
};

const cocoonCx = (s: number, W: number) => Math.sin(s * 2.6 + 0.4) * W * 0.04;

const cocoon: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 5) * TILE, H = (e.h ?? 7) * TILE;
  const open = e.v === 1;
  const n = 30;
  const hwAt = (s: number, side: number) => (W / 2) * Math.pow(Math.sin(Math.PI * (0.035 + 0.965 * s)), 0.62) * (1 - 0.3 * s) * (1 + 0.045 * Math.sin(s * (side > 0 ? 7 : 9) + side));
  const shell = () => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      ctx.lineTo(cocoonCx(s, W) - hwAt(s, -1), -s * H - 2);
    }
    for (let i = n; i >= 0; i--) {
      const s = i / n;
      ctx.lineTo(cocoonCx(s, W) + hwAt(s, 1), -s * H - 2);
    }
    ctx.closePath();
  };
  // silk tethers up into the dark
  ctx.lineCap = 'round';
  for (const [x0, y0, dx, dy] of [[0, -H, -4, -46], [0, -H, 6, -50], [-W * 0.3, -H * 0.72, -W * 0.7, -H * 0.42], [W * 0.3, -H * 0.7, W * 0.75, -H * 0.45]] as const) {
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba('#b07a48', 0.5 - k * 0.15);
      ctx.lineWidth = 1.3 - k * 0.3;
      ctx.beginPath();
      ctx.moveTo(x0 + (dx * k) / 3, y0 + (dy * k) / 3);
      ctx.lineTo(x0 + (dx * (k + 1)) / 3, y0 + (dy * (k + 1)) / 3);
      ctx.stroke();
    }
  }
  // roots of resin gripping the floor
  ctx.strokeStyle = '#3a1a0e';
  for (let i = 0; i < 6; i++) {
    const d = i % 2 ? 1 : -1, sx = d * rng.range(4, 12);
    ctx.lineWidth = rng.range(1.5, 3);
    ctx.beginPath();
    ctx.moveTo(sx, -6);
    ctx.quadraticCurveTo(sx + d * 10, -3, d * rng.range(W * 0.35, W * 0.7), 1);
    ctx.stroke();
  }
  ellipse(ctx, 0, 0, W * 0.42, 3.4, 0, '#3e180c');
  shell();
  ctx.fillStyle = open ? '#2a100a' : '#3a1610';
  ctx.fill();
  ctx.save();
  shell();
  ctx.clip();
  if (!open) {
    // the thing inside is alive: red light through the membrane
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#ff3a1c', cocoonCx(0.42, W), -H * 0.42, W * 0.62, H * 0.5, 0.8);
    blob(ctx, '#ff9a50', cocoonCx(0.45, W), -H * 0.45, W * 0.26, H * 0.22, 0.45);
    ctx.globalCompositeOperation = 'source-over';
    // folded silhouette of what sleeps inside
    const cx = cocoonCx(0.5, W);
    ctx.fillStyle = 'rgba(26,6,4,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, -H * 0.72, W * 0.12, W * 0.1, 0, 0, TAU);
    ctx.ellipse(cx, -H * 0.58, W * 0.17, H * 0.085, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + W * 0.03, -H * 0.36, W * 0.15, H * 0.17, 0.12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(26,6,4,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - W * 0.14, -H * 0.42, W * 0.07, H * 0.23, 0.18, 0, TAU);
    ctx.ellipse(cx + W * 0.16, -H * 0.42, W * 0.07, H * 0.23, -0.14, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,6,4,0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const d of [-1, 1]) {
      ctx.moveTo(cx + d * W * 0.12, -H * 0.56);
      ctx.lineTo(cx + d * W * 0.25, -H * 0.47);
      ctx.lineTo(cx + d * W * 0.15, -H * 0.3);
      ctx.moveTo(cx + d * W * 0.04, -H * 0.79);
      ctx.quadraticCurveTo(cx + d * W * 0.1, -H * 0.88, cx + d * W * 0.2, -H * 0.86);
    }
    ctx.stroke();
    // veins in the membrane
    ctx.strokeStyle = 'rgba(150,30,18,0.6)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let v = 0; v < 6; v++) {
      let px = rng.range(-W * 0.3, W * 0.3), py = -H * rng.range(0.15, 0.85);
      ctx.moveTo(px, py);
      for (let s = 0; s < 6; s++) {
        px += rng.range(-5, 5);
        py += rng.range(-9, 9);
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  } else {
    // split open and empty: a ragged slit onto a dark, wet hollow
    const L: number[] = [], R: number[] = [];
    for (let i = 0; i <= 16; i++) {
      const s = 0.1 + (0.8 * i) / 16, open2 = Math.sin((Math.PI * i) / 16);
      const hw = hwAt(s, 1) * 0.62 * open2;
      const cx = cocoonCx(s, W);
      L.push(cx - hw - rng.range(0, 3) * open2, -s * H);
      R.push(cx + hw + rng.range(0, 3) * open2, -s * H);
    }
    const slit = () => {
      ctx.beginPath();
      ctx.moveTo(L[0], L[1]);
      for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
      for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
      ctx.closePath();
    };
    slit();
    ctx.fillStyle = '#0a0403';
    ctx.fill();
    ctx.save();
    slit();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#a02810', cocoonCx(0.3, W), -H * 0.25, W * 0.3, H * 0.25, 0.25);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(200,110,60,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = -H * rng.range(0.3, 0.8);
      ctx.moveTo(-W * 0.3, yy);
      ctx.quadraticCurveTo(0, yy + rng.range(6, 14), W * 0.3, yy - rng.range(-3, 3));
    }
    ctx.stroke();
    ctx.restore();
    // peeled lips
    for (const side of [L, R]) {
      ctx.beginPath();
      ctx.moveTo(side[0], side[1]);
      for (let i = 2; i < side.length; i += 2) ctx.lineTo(side[i], side[i + 1]);
      ctx.strokeStyle = '#6a2a1a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,130,100,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // wrapping bands of silk and resin
  let yy = -H * 0.06;
  for (let k = 0; k < 10; k++) {
    const tilt = (k % 2 ? 1 : -1) * W * rng.range(0.06, 0.16);
    const lw = rng.range(2.5, 6.5) * (open ? 0.6 : 1);
    const a = rng.range(4, 12), b = rng.range(-6, 4);
    const band = (dy: number) => {
      ctx.beginPath();
      ctx.moveTo(-W, yy + tilt + dy);
      ctx.bezierCurveTo(-W * 0.3, yy + a + dy, W * 0.3, yy + b + dy, W, yy - tilt + dy);
    };
    band(0);
    ctx.strokeStyle = k % 3 === 0 ? '#2a0e08' : 'rgba(58,20,12,0.85)';
    ctx.lineWidth = lw;
    ctx.stroke();
    band(-lw / 2);
    ctx.strokeStyle = 'rgba(230,160,120,0.14)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    yy -= H * rng.range(0.07, 0.12);
    if (yy < -H * 0.95) break;
  }
  const g = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  g.addColorStop(0, 'rgba(10,2,0,0.85)');
  g.addColorStop(0.28, 'rgba(10,2,0,0)');
  g.addColorStop(0.68, 'rgba(10,2,0,0)');
  g.addColorStop(1, 'rgba(10,2,0,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(-W, -H - 4, W * 2, H + 8);
  ctx.restore();
  shell();
  ctx.strokeStyle = '#0e0402';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // wet sheen down the lit side
  ctx.strokeStyle = 'rgba(255,200,170,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 3; i <= 24; i++) {
    const s = i / n;
    const px = cocoonCx(s, W) - hwAt(s, -1) * 0.72, py = -s * H - 2;
    if (i === 3) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  if (open) {
    // shed shards and a spreading pool
    ellipse(ctx, W * 0.1, 0, W * 0.5, 3.6, 0, '#4a160a');
    ctx.fillStyle = 'rgba(255,170,120,0.35)';
    ctx.fillRect(-W * 0.2, -1.8, W * 0.3, 0.7);
    for (let i = 0; i < 3; i++) {
      const sx = rng.range(-W * 0.8, W * 0.8), w = rng.range(6, 10);
      ctx.beginPath();
      ctx.moveTo(sx - w, 1);
      ctx.quadraticCurveTo(sx, -w * 0.7, sx + w, 1);
      ctx.lineTo(sx + w * 0.6, 0);
      ctx.quadraticCurveTo(sx, -w * 0.4, sx - w * 0.6, 0);
      ctx.closePath();
      solidify(ctx, '#3a1610', '#0e0402', 0.5);
    }
  }
};

/** A shed locust skin in profile, hollow and split down the back. Origin at the belly, facing +x. */
function husk(ctx: Ctx, rng: RNG) {
  const shellC = 'rgba(184,136,72,0.85)', dark = 'rgba(140,96,48,0.9)', line = '#22140a';
  // folded wings lying along the back
  ctx.beginPath();
  ctx.moveTo(-1, -9);
  ctx.quadraticCurveTo(-14, -11.5, -27, -7.5);
  ctx.quadraticCurveTo(-15, -6.5, -2, -6.5);
  ctx.closePath();
  solidify(ctx, 'rgba(214,200,164,0.4)', 'rgba(60,40,20,0.55)', 0.3);
  // abdomen tapering behind
  ctx.beginPath();
  ctx.moveTo(-1, -7.5);
  ctx.quadraticCurveTo(-12, -8.5, -23, -4.5);
  ctx.quadraticCurveTo(-24.5, -2.5, -22, -1.5);
  ctx.quadraticCurveTo(-12, 0.5, -1, -0.5);
  ctx.closePath();
  solidify(ctx, shellC, line, 0.45);
  ctx.strokeStyle = 'rgba(46,28,12,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 1; i < 7; i++) {
    const x = -1 - i * 3.2, top = -7.6 + i * 0.5;
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x - 1, (top - 0.5) / 2, x, -0.4 + i * 0.1);
  }
  ctx.stroke();
  // pronotum saddle
  ctx.beginPath();
  ctx.moveTo(-3, -0.5);
  ctx.lineTo(-3.5, -8.5);
  ctx.quadraticCurveTo(2, -11, 7, -8.5);
  ctx.lineTo(7, -1);
  ctx.closePath();
  solidify(ctx, dark, line, 0.5);
  // head capsule, its great eye now an empty ring
  ctx.beginPath();
  ctx.ellipse(10.5, -5.5, 4.2, 5.6, 0.25, 0, TAU);
  solidify(ctx, shellC, line, 0.5);
  ctx.strokeStyle = 'rgba(236,206,150,0.75)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(11.4, -7.4, 1.9, 2.3, 0.2, 0, TAU);
  ctx.stroke();
  // the split it crawled out of
  ctx.strokeStyle = '#140a04';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -8.6);
  ctx.lineTo(-3, -9.6);
  ctx.lineTo(0, -10.4);
  ctx.lineTo(2.5, -10.1);
  ctx.lineTo(5, -10.6);
  ctx.lineTo(8, -9.9);
  ctx.lineTo(10, -10.8);
  ctx.stroke();
  // antenna, legs, and the big hind leg folded like a jack-knife
  ctx.strokeStyle = line;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(12.5, -10.5);
  ctx.quadraticCurveTo(16, -15, 21 + rng.range(-2, 2), -15);
  ctx.moveTo(2, -1);
  ctx.lineTo(4.5, 1);
  ctx.lineTo(6.5, 0.8);
  ctx.moveTo(6, -1);
  ctx.lineTo(9, 1);
  ctx.lineTo(11, 0.8);
  ctx.stroke();
  const femur = bez([-1, -3, -6, -9, -12, -12, -16, -11], 8, 3.6, 1.6);
  ctx.beginPath();
  bandPath(ctx, femur);
  solidify(ctx, dark, line, 0.45);
  ctx.strokeStyle = 'rgba(46,28,12,0.55)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let i = 2; i < 8; i++) {
    ctx.moveTo(femur.x[i] - 1, femur.y[i] - 0.6);
    ctx.lineTo(femur.x[i] + 0.6, femur.y[i] + 0.8);
  }
  ctx.moveTo(-16, -11);
  ctx.lineTo(-21, 0.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,180,0.3)';
  ctx.fillRect(-2, -10, 6, 0.7);
}

const chitinShells: PropFn = (ctx, e, pal, rng) => {
  const W = (e.w ?? 3) * TILE;
  const n = Math.max(1, Math.round(W / 44));
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + (W * (i + 0.5)) / n + rng.range(-3, 3), s = rng.range(0.85, 1.05);
    ctx.save();
    ctx.translate(cx, 0.5);
    ctx.rotate(rng.range(-0.08, 0.08));
    ctx.scale(rng.chance(0.3) ? -s : s, s);
    husk(ctx, rng);
    ctx.restore();
  }
  // a torn-off hind leg lying apart
  const lx = rng.range(-W * 0.4, W * 0.4);
  ctx.strokeStyle = '#2e1c0c';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx - 6, -0.5);
  ctx.lineTo(lx + 2, -3.5);
  ctx.lineTo(lx + 7, -0.4);
  ctx.stroke();
};

// ----- trial

const trialRing: PropFn = (ctx, e) => {
  const rx = ((e.w ?? 8) * TILE) / 2, ry = Math.max(4, rx * 0.12), cy = -ry * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ffcf6b', 0, cy, rx * 1.15, ry * 2.6, 0.35);
  // a faint column of light rising from the circle
  blob(ctx, '#ffd27a', 0, cy - rx * 0.3, rx * 0.8, rx * 0.5, 0.12);
  for (const [k, lw, a] of [[1, 3.4, 0.2], [1, 1.1, 0.8], [0.78, 0.7, 0.5]] as const) {
    ctx.strokeStyle = rgba('#ffe0a0', a);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx * k, ry * k, 0, 0, TAU);
    ctx.stroke();
  }
  // runes between the rings, brighter on the near side
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, s = Math.sin(a);
    const px = Math.cos(a) * rx * 0.89, py = cy + s * ry * 0.89;
    ctx.strokeStyle = rgba(GOLD_HI, 0.35 + 0.35 * (s + 1) * 0.5);
    ctx.beginPath();
    const r = 1.3;
    switch (i % 4) {
      case 0: ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r * 0.6); ctx.lineTo(px, py + r * 0.6); break;
      case 1: ctx.moveTo(px - r, py + r * 0.5); ctx.lineTo(px, py - r * 0.5); ctx.lineTo(px + r, py + r * 0.5); break;
      case 2: ctx.arc(px, py, r * 0.6, 0, TAU); break;
      default: ctx.moveTo(px - r, py - r * 0.4); ctx.lineTo(px + r, py + r * 0.4); break;
    }
    ctx.stroke();
  }
  // a seven-pointed star inscribed in the inner ring
  ctx.strokeStyle = rgba('#ffe0a0', 0.4);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = ((i * 3) / 7) * TAU - Math.PI / 2;
    const px = Math.cos(a) * rx * 0.74, py = cy + Math.sin(a) * ry * 0.74;
    if (!i) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
};

const trialPillar: PropFn = (ctx, e, pal) => {
  const H = (e.h ?? 7) * TILE, top = -H;
  const stone = pal.stone;
  // plinth
  ctx.fillStyle = shade(stone, -0.25);
  ctx.fillRect(-15, -5, 30, 5);
  ctx.fillStyle = shade(stone, -0.1);
  ctx.fillRect(-13, -10, 26, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-15, -5, 30, 0.8);
  ctx.fillRect(-13, -10, 26, 0.8);
  // shaft
  const g = ctx.createLinearGradient(-9, 0, 9, 0);
  g.addColorStop(0, shade(stone, -0.3));
  g.addColorStop(0.3, shade(stone, 0.12));
  g.addColorStop(0.55, stone);
  g.addColorStop(1, shade(stone, -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(-9, top + 12, 18, H - 22);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = -5; i <= 5; i += 3.3) {
    ctx.moveTo(i, top + 14);
    ctx.lineTo(i, -11);
  }
  ctx.stroke();
  // gold bands and a vertical inlay
  for (const f of [0.3, 0.65]) {
    const by = top + 12 + (H - 22) * f;
    ctx.fillStyle = '#7a5a22';
    ctx.fillRect(-9.5, by, 19, 2.6);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-9.5, by, 19, 1.2);
    ctx.fillStyle = GOLD_HI;
    ctx.fillRect(-4, by, 3, 0.8);
  }
  ctx.fillStyle = rgba(GOLD, 0.7);
  ctx.fillRect(-0.5, top + 16, 1, H - 30);
  // capital
  ctx.fillStyle = shade(stone, -0.12);
  ctx.fillRect(-13, top + 7, 26, 5);
  ctx.fillStyle = shade(stone, 0.05);
  ctx.fillRect(-11, top + 3, 22, 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-13, top + 11, 26, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-11, top + 3, 22, 0.8);
  // bronze brazier bowl
  ctx.beginPath();
  ctx.moveTo(-12, top - 6);
  ctx.lineTo(12, top - 6);
  ctx.quadraticCurveTo(10, top + 1, 4, top + 3);
  ctx.lineTo(-4, top + 3);
  ctx.quadraticCurveTo(-10, top + 1, -12, top - 6);
  ctx.closePath();
  solidify(ctx, '#6a4a24', OUT, 0.6);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-12.5, top - 7, 25, 1.6);
  ctx.fillStyle = '#1a0a04';
  ctx.fillRect(-10, top - 5.4, 20, 1.4);
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff8a2a', 0, top - 5, 12, 6, 0.6);
  ctx.globalCompositeOperation = 'source-over';
};

const BANNER_C = [['#d6cdb8', '#9a907a'], ['#7a1a1e', '#4a0c10'], ['#2a2e5e', '#161838']] as const;

const trialBanner: PropFn = (ctx, e) => {
  const H = (e.h ?? 5) * TILE, w = 10;
  const [c0, c1] = BANNER_C[clamp(e.v ?? 0, 0, 2) | 0];
  // rod with finials
  ctx.fillStyle = '#7a5a22';
  ctx.fillRect(-14, 0, 28, 2.4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-14, 0, 28, 1);
  circle(ctx, -15, 1.2, 1.8, GOLD);
  circle(ctx, 15, 1.2, 1.8, GOLD);
  // cloth with a swallowtail, hanging in still folds
  ctx.beginPath();
  ctx.moveTo(-w, 2);
  ctx.lineTo(w, 2);
  ctx.quadraticCurveTo(w + 1.2, H * 0.5, w, H);
  ctx.lineTo(0, H - 9);
  ctx.lineTo(-w, H);
  ctx.quadraticCurveTo(-w - 1.2, H * 0.5, -w, 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, c1);
  g.addColorStop(0.2, c0);
  g.addColorStop(0.42, c1);
  g.addColorStop(0.62, c0);
  g.addColorStop(0.85, c0);
  g.addColorStop(1, c1);
  solidify(ctx, g, OUT, 0.6);
  // gold trim
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-w + 2, 4);
  ctx.lineTo(-w + 2, H - 3);
  ctx.moveTo(w - 2, 4);
  ctx.lineTo(w - 2, H - 3);
  ctx.moveTo(-w + 2, H - 3);
  ctx.lineTo(0, H - 11);
  ctx.lineTo(w - 2, H - 3);
  ctx.stroke();
  // emblem: a ring of light pierced by a flame
  const ey = H * 0.36;
  ctx.strokeStyle = GOLD_HI;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, ey, 5, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = GOLD_HI;
  ctx.beginPath();
  ctx.moveTo(0, ey - 8);
  ctx.quadraticCurveTo(2.6, ey - 1, 0, ey + 3);
  ctx.quadraticCurveTo(-2.6, ey - 1, 0, ey - 8);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const dy = H * 0.6 + i * 6;
    ctx.beginPath();
    ctx.moveTo(0, dy - 1.6);
    ctx.lineTo(1.6, dy);
    ctx.lineTo(0, dy + 1.6);
    ctx.lineTo(-1.6, dy);
    ctx.fill();
  }
};

const PROPS: Record<string, PropFn> = {
  giant_ribs: giantRibs,
  giant_skull: giantSkull,
  bone_pile: bonePile,
  dead_tree: deadTree,
  bone_arch: boneArch,
  cairn,
  hive_wall: hiveWall,
  resin_pillar: resinPillar,
  egg_cluster: eggCluster,
  glow_pod: glowPod,
  cocoon,
  chitin_shells: chitinShells,
  trial_ring: trialRing,
  trial_pillar: trialPillar,
  trial_banner: trialBanner,
};

// ---------------------------------------------------------------- live props

/** Chapter III decor with an animated overlay (static body baked in the tile cache). */
export const LIVE_CH3: ReadonlySet<string> = new Set(['cocoon', 'glow_pod', 'egg_cluster', 'trial_ring', 'trial_pillar']);

function holyFlame(ctx: Ctx, x: number, y: number, s: number, t: number) {
  const w = Math.sin(t * 17) * s * 0.16, w2 = Math.sin(t * 11 + 1) * s * 0.12;
  ctx.fillStyle = 'rgba(255,150,60,0.8)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.8, x + w * 1.6, y - s * 1.75);
  ctx.quadraticCurveTo(x + s * 0.55 + w2, y - s * 0.8, x + s * 0.55, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,232,160,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y);
  ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.6, x + w, y - s * 1.15);
  ctx.quadraticCurveTo(x + s * 0.3 + w2 * 0.5, y - s * 0.6, x + s * 0.3, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,244,0.95)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.4, y - s * 0.25, s * 0.14, s * 0.3, 0, 0, TAU);
  ctx.fill();
}

/** Animated overlays (pulses, flames, motes). Allocation-free: cached sprites and constant colours. */
export function drawLivePropCh3(ctx: Ctx, e: Decor, t: number) {
  const x = e.x * TILE, y = e.y * TILE, fx = e.flip ? -1 : 1;
  ctx.globalCompositeOperation = 'lighter';
  switch (e.k) {
    case 'cocoon': {
      if (e.v === 1) break;
      const W = (e.w ?? 5) * TILE, H = (e.h ?? 7) * TILE;
      // a slow heartbeat: two beats, then rest
      const ph = (t * 0.75) % 1;
      const beat = Math.exp(-ph * 10) + (ph > 0.2 ? 0.6 * Math.exp(-(ph - 0.2) * 12) : 0);
      const cx = x + cocoonCx(0.42, W) * fx;
      blob(ctx, '#ff2a14', cx, y - H * 0.42, W * (0.72 + 0.1 * beat), H * (0.52 + 0.06 * beat), 0.1 + 0.32 * beat);
      blob(ctx, '#ff9050', cx, y - H * 0.45, W * 0.24, H * 0.2, 0.06 + 0.3 * beat);
      break;
    }
    case 'glow_pod': {
      const L = podLen(e), sx = x + podSway(e) * fx;
      const p = 0.5 + 0.5 * Math.sin(t * 1.7 + e.x * 0.9);
      blob(ctx, POD, sx, y + L, 24 + 6 * p, 24 + 6 * p, 0.12 + 0.22 * p);
      blob(ctx, '#f4ffc0', sx, y + L, 6, 7.5, 0.2 + 0.35 * p);
      break;
    }
    case 'egg_cluster': {
      const eggs = eggsOf(e);
      for (let i = 0; i < eggs.length; i++) {
        const g = eggs[i];
        const p = 0.5 + 0.5 * Math.sin(t * 2.1 + g.ph);
        blob(ctx, '#ffb040', x + g.x * fx, y + g.y, g.rx * 2, g.ry * 1.5, 0.03 + 0.14 * p * p);
      }
      break;
    }
    case 'trial_ring': {
      const rx = ((e.w ?? 8) * TILE) / 2, ry = Math.max(4, rx * 0.12), cy = y - ry * 0.5;
      const p = 0.5 + 0.5 * Math.sin(t * 1.3 + e.x);
      blob(ctx, '#ffcf6b', x, cy, rx * 1.1, ry * 2.6, 0.08 + 0.12 * p);
      // motes running around the circle, brighter on the near side
      for (let k = 0; k < 8; k++) {
        const a = t * 0.45 + (k * TAU) / 8, s = Math.sin(a);
        blob(ctx, '#ffd890', x + Math.cos(a) * rx * 0.89, cy + s * ry * 0.89, 5, 4, 0.2 + 0.3 * (s + 1) * 0.5);
      }
      // sparks rising off it
      ctx.fillStyle = '#fff0c0';
      for (let k = 0; k < 7; k++) {
        const life = (t * 0.3 + k * 0.143) % 1;
        ctx.globalAlpha = (1 - life) * 0.8 * Math.min(1, life * 6);
        ctx.fillRect(x + Math.cos(k * 2.4) * rx * 0.7 * (1 - life * 0.25) - 0.6, cy - life * rx * 0.7 - 0.6, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'trial_pillar': {
      const H = (e.h ?? 7) * TILE;
      const fy = y - H - 6;
      const fl = 0.85 + Math.sin(t * 13 + e.x) * 0.08 + Math.sin(t * 7.3 + e.y) * 0.07;
      blob(ctx, '#ffb050', x, fy - 6, 26 * fl, 26 * fl, 0.4);
      holyFlame(ctx, x, fy, 10 * fl, t + e.x);
      break;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
