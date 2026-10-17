// Pixel-art characters. The same skeleton and animation that drive the
// classic painter are rasterized here at one pixel per world unit: limbs and
// cloth as hard-edged shapes lit from one side with hue-shifted colour ramps,
// a dark contour wherever a part crosses another, a selective outline round
// the silhouette, and a face placed pixel by pixel. Everything is written into
// one small buffer, so it costs a few thousand array writes and a single blit.

import type { Joints, Chain } from './skeleton';
import type { HumanStyle, WeaponPts } from './actors';
import { parseColor, glow, type Ctx } from './draw';

const W = 128, H = 128;
/** Where the feet sit in the buffer. */
const OX = 64, OY = 100;

// Light from above and a little in front: faces, chests and blade edges catch it.
const LX = 0.42, LY = -0.91;

type Ramp = Uint32Array; // deep, shadow, base, light, highlight
const DEEP = 0, SHADOW = 1, BASE = 2, LIGHT = 3, HI = 4;

const pix = new Uint32Array(W * H);
/** Which shape wrote each pixel (0 = empty, 255 = outline). */
const own = new Uint8Array(W * H);
/** The outline colour a pixel asks of its empty neighbours. */
const edge = new Uint32Array(W * H);
let canvas: HTMLCanvasElement | null = null;
let cctx: CanvasRenderingContext2D | null = null;
let image: ImageData | null = null;

let part = 0;
let face = 1;
let bx0 = W, by0 = H, bx1 = -1, by1 = -1;

const pack = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const INK = pack(10, 7, 12);

// ---------------------------------------------------------------- colour ramps

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) { const v = Math.round(l * 255); return pack(v, v, v); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return pack(f(h + 1 / 3), f(h), f(h - 1 / 3));
}

/** Turn h toward target by at most amt degrees. */
function hueToward(h: number, target: number, amt: number) {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}

const ramps = new Map<string, Ramp>();
/** Shadows lean cool and violet, lights lean warm: the hue shift that makes pixel art glow. */
function ramp(c: string): Ramp {
  let r = ramps.get(c);
  if (r) return r;
  const [R, G, B] = parseColor(c);
  const [h, s, l] = toHsl(R, G, B);
  r = new Uint32Array(5);
  // Warm hues (skin, leather, gold) would swing red on the way to violet; keep them muted.
  const warm = s > 0.2 && (h < 60 || h > 330);
  r[DEEP] = fromHsl(hueToward(h, 255, warm ? 10 : 20), warm ? s * 0.75 : s * 1.05 + 0.04, l * 0.42);
  r[SHADOW] = fromHsl(hueToward(h, 255, warm ? 5 : 11), warm ? s * 0.82 : s * 1.05 + 0.02, l * 0.74);
  r[BASE] = pack(R, G, B);
  r[LIGHT] = fromHsl(hueToward(h, 48, 9), s * 0.96, l + (1 - l) * 0.2 + 0.035);
  r[HI] = fromHsl(hueToward(h, 50, 16), s * 0.85, l + (1 - l) * 0.46 + 0.07);
  ramps.set(c, r);
  return r;
}

/** Darker copy of a colour (the far arm and leg), as its own ramp. */
const backCache = new Map<string, string>();
function back(c: string, amt = 0.3) {
  const k = c + amt;
  let o = backCache.get(k);
  if (!o) {
    const [r, g, b] = parseColor(c);
    const m = 1 - amt;
    o = `rgb(${Math.round(r * m)},${Math.round(g * m)},${Math.round(b * m)})`;
    backCache.set(k, o);
  }
  return o;
}

// ---------------------------------------------------------------- buffer

function ensure() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  cctx = canvas.getContext('2d');
  image = new ImageData(new Uint8ClampedArray(pix.buffer), W, H);
}

function clear() {
  if (bx1 >= bx0) {
    for (let y = Math.max(0, by0 - 1); y <= Math.min(H - 1, by1 + 1); y++) {
      const a = y * W + Math.max(0, bx0 - 1), b = y * W + Math.min(W - 1, bx1 + 1);
      pix.fill(0, a, b + 1);
      own.fill(0, a, b + 1);
    }
  }
  bx0 = W; by0 = H; bx1 = -1; by1 = -1;
  part = 0;
}

/** Local (x forward, y down, feet at 0) to a buffer column / row. */
const colOf = (x: number) => Math.floor(OX + face * x);
const rowOf = (y: number) => Math.floor(OY + y);

function range(x0: number, x1: number, y0: number, y1: number) {
  let c0 = face > 0 ? Math.floor(OX + x0) : Math.floor(OX - x1);
  let c1 = face > 0 ? Math.ceil(OX + x1) : Math.ceil(OX - x0);
  let r0 = Math.floor(OY + y0), r1 = Math.ceil(OY + y1);
  c0 = Math.max(1, c0); r0 = Math.max(1, r0);
  c1 = Math.min(W - 2, c1); r1 = Math.min(H - 2, r1);
  if (c0 < bx0) bx0 = c0;
  if (c1 > bx1) bx1 = c1;
  if (r0 < by0) by0 = r0;
  if (r1 > by1) by1 = r1;
  RC[0] = c0; RC[1] = c1; RC[2] = r0; RC[3] = r1;
}
const RC = new Int32Array(4);

function put(i: number, c: number, deepC: number) {
  pix[i] = c;
  own[i] = part;
  edge[i] = deepC;
}

/** One pixel of detail on top of what is there (eyes, buckles, glints). */
function dot(x: number, y: number, c: number) {
  const cx = colOf(x), cy = rowOf(y);
  if (cx < 1 || cy < 1 || cx > W - 2 || cy > H - 2) return;
  const i = cy * W + cx;
  if (!own[i]) { own[i] = part || 1; edge[i] = INK; }
  pix[i] = c;
  if (cx < bx0) bx0 = cx;
  if (cx > bx1) bx1 = cx;
  if (cy < by0) by0 = cy;
  if (cy > by1) by1 = cy;
}

/** A 1-pixel line of detail. */
function line(x0: number, y0: number, x1: number, y1: number, c: number) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) dot(x0 + (x1 - x0) * (k / n), y0 + (y1 - y0) * (k / n), c);
}

// ---------------------------------------------------------------- shapes

const level = (n: number) => (n > 0.5 ? LIGHT : n > -0.22 ? BASE : SHADOW);

/** A tapered limb from a to b, lit as a cylinder. */
function capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb: number, r: Ramp, opts = 0) {
  if (!(opts & SAME)) part++;
  const metal = (opts & METAL) !== 0;
  const rm = Math.max(ra, rb);
  range(Math.min(ax, bx) - rm, Math.max(ax, bx) + rm, Math.min(ay, by) - rm, Math.max(ay, by) + rm);
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  const [c0, c1, r0, r1] = RC;
  for (let row = r0; row <= r1; row++) {
    const ly = row + 0.5 - OY;
    for (let col = c0; col <= c1; col++) {
      const lx = (col + 0.5 - OX) * face;
      let t = ((lx - ax) * dx + (ly - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = lx - (ax + dx * t), oy = ly - (ay + dy * t);
      const rr = ra + (rb - ra) * t;
      const d2 = ox * ox + oy * oy;
      if (d2 > rr * rr) continue;
      const i = row * W + col;
      const o = own[i];
      if (o && o !== part && !(opts & SAME) && d2 > (rr - 0.9) * (rr - 0.9)) { put(i, r[DEEP], r[DEEP]); continue; }
      const n = (ox * LX + oy * LY) / (rr || 1);
      put(i, r[metal && n > 0.72 ? HI : level(n)], r[DEEP]);
    }
  }
}
const SAME = 1, METAL = 2;

const PTS = new Float64Array(64);
let np = 0;
const P = (x: number, y: number) => { PTS[np++] = x; PTS[np++] = y; };

/**
 * Fill the polygon in PTS. Shading: across the axis (ax, ay) through
 * (cx, cy) with half-width hw as a cylinder; hw < 0 shades as a sphere of
 * radius -hw; hw = 0 is flat at `flat`.
 */
function poly(r: Ramp, cx: number, cy: number, ax: number, ay: number, hw: number, flat = BASE, contour = true) {
  part++;
  const n = np >> 1;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const x = PTS[k * 2], y = PTS[k * 2 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  range(x0, x1, y0, y1);
  const [c0, c1, r0, r1] = RC;
  for (let row = r0; row <= r1; row++) {
    const ly = row + 0.5 - OY;
    for (let col = c0; col <= c1; col++) {
      const lx = (col + 0.5 - OX) * face;
      let inside = false, dmin = 9;
      for (let k = 0, m = n - 1; k < n; m = k++) {
        const xa = PTS[k * 2], ya = PTS[k * 2 + 1], xb = PTS[m * 2], yb = PTS[m * 2 + 1];
        if ((ya > ly) !== (yb > ly) && lx < ((xb - xa) * (ly - ya)) / (yb - ya) + xa) inside = !inside;
        if (contour) {
          const ex = xb - xa, ey = yb - ya, l2 = ex * ex + ey * ey || 1e-6;
          let t = ((lx - xa) * ex + (ly - ya) * ey) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = lx - xa - ex * t, qy = ly - ya - ey * t, d = qx * qx + qy * qy;
          if (d < dmin) dmin = d;
        }
      }
      if (!inside) continue;
      const i = row * W + col;
      const o = own[i];
      if (contour && o && o !== part && dmin < 0.8) { put(i, r[DEEP], r[DEEP]); continue; }
      let lv = flat;
      if (hw > 0) {
        let u = ((lx - cx) * ax + (ly - cy) * ay) / hw;
        u = u < -1 ? -1 : u > 1 ? 1 : u;
        lv = level((ax * LX + ay * LY) * u + 0.12);
      } else if (hw < 0) {
        const nx = (lx - cx) / -hw, ny = (ly - cy) / -hw;
        lv = level(nx * LX + ny * LY);
      }
      put(i, r[lv], r[DEEP]);
    }
  }
  np = 0;
}

/** Wrap the silhouette in a 1-pixel outline, darker than whatever it borders. */
function outline() {
  for (let y = Math.max(1, by0 - 1); y <= Math.min(H - 2, by1 + 1); y++) {
    for (let x = Math.max(1, bx0 - 1); x <= Math.min(W - 2, bx1 + 1); x++) {
      const i = y * W + x;
      if (own[i]) continue;
      const n = own[i - 1] && own[i - 1] < 255 ? i - 1 : own[i + 1] && own[i + 1] < 255 ? i + 1 : own[i - W] && own[i - W] < 255 ? i - W : own[i + W] && own[i + W] < 255 ? i + W : -1;
      if (n < 0) continue;
      const e = edge[n];
      // Halfway between the neighbour's deepest tone and ink.
      pix[i] = (255 << 24 | (((e >> 16 & 255) + 10) >> 1) << 16 | (((e >> 8 & 255) + 7) >> 1) << 8 | ((e & 255) + 12) >> 1) >>> 0;
      own[i] = 255;
    }
  }
  bx0--; by0--; bx1++; by1++;
}

// ---------------------------------------------------------------- the body

/** Rotated copy of the joints (a roll or flip turns the whole body about the hips). */
const J: Joints = {
  hipX: 0, hipY: 0, neckX: 0, neckY: 0, headX: 0, headY: 0, headA: 0, shFX: 0, shFY: 0, shBX: 0, shBY: 0,
  elFX: 0, elFY: 0, haFX: 0, haFY: 0, elBX: 0, elBY: 0, haBX: 0, haBY: 0, hpFX: 0, hpFY: 0, hpBX: 0, hpBY: 0,
  knFX: 0, knFY: 0, ftFX: 0, ftFY: 0, knBX: 0, knBY: 0, ftBX: 0, ftBY: 0, wpnA: 0, offA: 0, foreFA: 0, foreBA: 0, torsoA: 0,
};
const XY = ['hip', 'neck', 'head', 'shF', 'shB', 'elF', 'haF', 'elB', 'haB', 'hpF', 'hpB', 'knF', 'ftF', 'knB', 'ftB'] as const;

function rotated(j: Joints, rot: number) {
  const cx = j.hipX, cy = j.hipY - 4, c = Math.cos(rot), s = Math.sin(rot);
  const src = j as unknown as Record<string, number>, dst = J as unknown as Record<string, number>;
  for (const k of XY) {
    const x = src[k + 'X'] - cx, y = src[k + 'Y'] - cy;
    dst[k + 'X'] = cx + x * c - y * s;
    dst[k + 'Y'] = cy + x * s + y * c;
  }
  J.headA = j.headA + rot;
  J.torsoA = j.torsoA + rot;
  J.wpnA = j.wpnA - rot;
  J.offA = j.offA - rot;
  return J;
}

function leg(j: Joints, S: HumanStyle, isBack: boolean) {
  const hx = isBack ? j.hpBX : j.hpFX, hy = isBack ? j.hpBY : j.hpFY;
  const kx = isBack ? j.knBX : j.knFX, ky = isBack ? j.knBY : j.knFY;
  const fx = isBack ? j.ftBX : j.ftFX, fy = isBack ? j.ftBY : j.ftFY;
  const B = S.bulk;
  const pants = ramp(isBack ? back(S.pants) : S.pants), boot = ramp(isBack ? back(S.boots) : S.boots);
  capsule(hx, hy, kx, ky, 3.0 * B, 2.5 * B, pants);
  capsule(kx, ky, fx, fy - 1, 2.4 * B, 2.0 * B, boot);
  // Foot: toe forward, flat sole.
  P(fx - 2.2 * B, fy - 2.2); P(fx + 2.0 * B, fy - 1.8); P(fx + 4.0 * B, fy - 0.4); P(fx + 4.0 * B, fy + 0.5); P(fx - 2.4 * B, fy + 0.5);
  poly(boot, fx, fy - 1, 0, -1, 1.6);
  line(fx - 2.2 * B, fy, fx + 3.6 * B, fy, boot[DEEP]);
  // Cuff of the boot.
  const sx = fx - kx, sy = fy - ky, sl = Math.hypot(sx, sy) || 1;
  const cx = kx + sx * 0.25, cy = ky + sy * 0.25, nx = -sy / sl * 2.2 * B, ny = sx / sl * 2.2 * B;
  line(cx - nx, cy - ny, cx + nx, cy + ny, boot[isBack ? SHADOW : LIGHT]);
  if (S.plate && S.plate.tier >= 1) {
    const pr = ramp(isBack ? S.plate.dark : S.plate.c);
    capsule(kx + sx * 0.12, ky + sy * 0.12, kx + sx * 0.72, ky + sy * 0.72, 2.2 * B, 1.8 * B, pr, METAL);
    capsule(kx, ky, kx, ky, 2.1 * B, 2.1 * B, ramp(isBack ? S.plate.dark : S.plate.hi), METAL);
  }
}

function arm(j: Joints, S: HumanStyle, isBack: boolean) {
  const sx = isBack ? j.shBX : j.shFX, sy = isBack ? j.shBY : j.shFY;
  const ex = isBack ? j.elBX : j.elFX, ey = isBack ? j.elBY : j.elFY;
  const hx = isBack ? j.haBX : j.haFX, hy = isBack ? j.haBY : j.haFY;
  const B = S.bulk;
  const sleeve = ramp(isBack ? back(S.coat, 0.32) : S.coat), glove = ramp(isBack ? back(S.glove) : S.glove);
  capsule(sx, sy, ex, ey, 2.5 * B, 2.1 * B, sleeve);
  capsule(ex, ey, hx, hy, 2.1 * B, 1.8 * B, glove);
  if (S.plate && S.plate.tier >= 2) {
    capsule(ex + (hx - ex) * 0.2, ey + (hy - ey) * 0.2, ex + (hx - ex) * 0.75, ey + (hy - ey) * 0.75, 2.0 * B, 1.7 * B, ramp(isBack ? S.plate.dark : S.plate.c), METAL);
  } else {
    // Cuff where the glove meets the sleeve.
    const fx = hx - ex, fy = hy - ey, fl = Math.hypot(fx, fy) || 1;
    const cx = ex + fx * 0.15, cy = ey + fy * 0.15, nx = -fy / fl * 1.9 * B, ny = fx / fl * 1.9 * B;
    line(cx - nx, cy - ny, cx + nx, cy + ny, glove[DEEP]);
  }
  if (S.runes && !isBack) {
    const rc = ramp(S.runes)[HI];
    dot(ex + (hx - ex) * 0.35, ey + (hy - ey) * 0.35, rc);
    dot(ex + (hx - ex) * 0.6 + 0.8, ey + (hy - ey) * 0.6, rc);
  }
  capsule(hx, hy, hx, hy, 2.0 * B, 2.0 * B, glove, SAME);
}

function skirt(j: Joints, S: HumanStyle, time: number, flowX: number, liftY: number) {
  const B = S.bulk;
  const ux = Math.sin(j.torsoA), uy = -Math.cos(j.torsoA), rx = Math.cos(j.torsoA), ry = Math.sin(j.torsoA);
  const hx = j.hipX, hy = j.hipY, L = S.skirt;
  const trail = -flowX * L * 0.42;
  const lift = -Math.max(0, liftY) * L * 0.38 - Math.abs(flowX) * L * 0.12;
  const amp = 0.25 + Math.abs(flowX) * 0.8 + Math.abs(liftY) * 0.6;
  const wv = (i: number) => Math.sin(time * 7.5 + i * 1.4) * amp;
  const midK = (j.knFX + j.knBX) / 2;
  P(hx - rx * 4.4 * B + ux, hy - ry * 4.4 * B + uy);
  P(hx + rx * 4.6 * B + ux, hy + ry * 4.6 * B + uy);
  P((j.knFX + hx) / 2 + 3 * B + trail * 0.25, hy + L * 0.95 + lift * 0.4 + wv(0) * 0.3);
  P((j.knFX + midK) / 2 + 1 + trail * 0.45, hy + L * 0.98 + lift * 0.6 + wv(1));
  P(midK + 1 + trail * 0.65, hy + L + lift * 0.8 + wv(2));
  P((midK + j.knBX) / 2 - 1 + trail * 0.85, hy + L * 0.96 + lift + wv(3));
  P((j.knBX + hx) / 2 - 3.5 * B + trail, hy + L * 0.9 + lift + wv(4));
  const hemX0 = PTS[4], hemY0 = PTS[5], hemX1 = PTS[12], hemY1 = PTS[13], midX = PTS[8], midY = PTS[9];
  const r = ramp(back(S.coat, 0.22));
  poly(r, hx, hy, rx, ry, 4.5 * B);
  // A fold down the tail, and the hem.
  line(hx - rx * 0.8, hy + 2, midX - 0.5, midY - 2, r[SHADOW]);
  if (S.trim) {
    const t = ramp(S.trim)[BASE];
    line(hemX0, hemY0 - 0.5, midX, midY - 0.5, t);
    line(midX, midY - 0.5, hemX1, hemY1 - 0.5, t);
  }
}

function torso(j: Joints, S: HumanStyle) {
  const B = S.bulk;
  const a = j.torsoA, ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
  const hx = j.hipX, hy = j.hipY, len = Math.hypot(j.neckX - hx, j.neckY - hy);
  const Q = (u: number, r: number) => P(hx + ux * u + rx * r, hy + uy * u + ry * r);
  const X = (u: number, r: number) => hx + ux * u + rx * r, Y = (u: number, r: number) => hy + uy * u + ry * r;
  const coat = ramp(S.coat);
  Q(-1, -4.2 * B); Q(-1, 4.4 * B); Q(len * 0.55, 5.0 * B); Q(len * 0.95, 4.6 * B);
  Q(len * 1.02, 1.5); Q(len * 1.02, -2.5); Q(len * 0.95, -4.4 * B); Q(len * 0.5, -4.8 * B);
  poly(coat, X(len * 0.5, 0), Y(len * 0.5, 0), rx, ry, 4.8 * B);
  // The back falls into the coat's dark colour.
  const dark = ramp(S.coatDark);
  for (let u = 0; u < len * 0.92; u += 1) dot(X(u, -4.0 * B), Y(u, -4.0 * B), dark[BASE]);
  if (S.trim) line(X(len * 0.95, 1.2), Y(len * 0.95, 1.2), X(len * 0.15, 2.4), Y(len * 0.15, 2.4), ramp(S.trim)[LIGHT]);
  if (S.plate) {
    const pr = ramp(S.plate.c);
    Q(len * 0.35, -4.0 * B); Q(len * 0.3, 4.4 * B); Q(len * 0.62, 5.0 * B); Q(len * 0.92, 4.2 * B); Q(len * 0.92, -3.8 * B);
    poly(pr, X(len * 0.62, 0), Y(len * 0.62, 0), rx, ry, 4.6 * B);
    line(X(len * 0.47, -3.6 * B), Y(len * 0.47, -3.6 * B), X(len * 0.47, 4.3 * B), Y(len * 0.47, 4.3 * B), pr[DEEP]);
    // A glint on the chest, and the covenant sigil on the best plate.
    dot(X(len * 0.8, 3.0 * B), Y(len * 0.8, 3.0 * B), pr[HI]);
    if (S.plate.tier >= 2) {
      const hi = ramp(S.plate.hi);
      const sx = X(len * 0.68, 1.0), sy = Y(len * 0.68, 1.0);
      line(sx, sy - 1.5, sx, sy + 1.5, hi[BASE]);
      line(sx - 1, sy - 0.5, sx + 1, sy - 0.5, hi[BASE]);
      line(X(len * 0.9, 0.2), Y(len * 0.9, 0.2), X(len * 0.9, 3.6), Y(len * 0.9, 3.6), hi[LIGHT]);
    }
  }
  if (S.belt) {
    const br = ramp(S.belt);
    line(X(1.6, -4.2 * B), Y(1.6, -4.2 * B), X(1.6, 4.4 * B), Y(1.6, 4.4 * B), br[BASE]);
    line(X(2.4, -4.2 * B), Y(2.4, -4.2 * B), X(2.4, 4.4 * B), Y(2.4, 4.4 * B), br[SHADOW]);
    const gold = ramp('#d9b45a');
    dot(X(2.0, 1.8), Y(2.0, 1.8), gold[LIGHT]);
    dot(X(2.0, 2.8), Y(2.0, 2.8), gold[BASE]);
  }
  if (S.scarf) {
    // The scarf's wrap round the neck.
    const sr = ramp(S.scarf);
    capsule(X(len * 0.97, -2.6 * B), Y(len * 0.97, -2.6 * B), X(len * 0.97, 2.8 * B), Y(len * 0.97, 2.8 * B), 1.9, 1.9, sr);
  }
}

function pauldron(j: Joints, S: HumanStyle) {
  const p = S.plate!;
  const a = Math.atan2(j.elFY - j.shFY, j.elFX - j.shFX) - Math.PI / 2;
  const c = Math.cos(a), s = Math.sin(a), w = 3.9 * S.bulk;
  const T = (u: number, v: number) => P(j.shFX + u * c - v * s, j.shFY + u * s + v * c);
  for (let k = 0; k <= 8; k++) {
    const t = Math.PI + (k / 8) * Math.PI;
    T(Math.cos(t) * w, 0.6 + Math.sin(t) * 3.1);
  }
  const pr = ramp(p.c);
  poly(pr, j.shFX, j.shFY - 1, 0, 0, -4.2);
  const hi = ramp(p.hi);
  // Rim of the dome.
  const rx0 = j.shFX + (-w * 0.8) * c - (-1.4) * s, ry0 = j.shFY + (-w * 0.8) * s + (-1.4) * c;
  const rx1 = j.shFX + (w * 0.8) * c - (-1.4) * s, ry1 = j.shFY + (w * 0.8) * s + (-1.4) * c;
  line(rx0, ry0, rx1, ry1, p.tier >= 2 ? hi[BASE] : pr[LIGHT]);
}

// ---------------------------------------------------------------- the head

let hc = 1, hs = 0, hX = 0, hY = 0;
const HP = (u: number, v: number) => P(hX + u * hc - v * hs, hY + u * hs + v * hc);
const hx_ = (u: number, v: number) => hX + u * hc - v * hs;
const hy_ = (u: number, v: number) => hY + u * hs + v * hc;
const hdot = (u: number, v: number, c: number) => dot(hx_(u, v), hy_(u, v), c);

function head(j: Joints, S: HumanStyle, time: number, flowX: number, liftY: number) {
  const a = j.headA, R = 4.5;
  hc = Math.cos(a); hs = Math.sin(a); hX = j.headX; hY = j.headY;
  const skin = ramp(S.skin);
  capsule(j.neckX, j.neckY, j.headX - hs * 2.5, j.headY + hc * 2.5, 1.6, 1.5, ramp(back(S.skin, 0.12)));
  const hooded = S.helm === 'hood_up' || S.helm === 'archer' || S.helm === 'husk';
  const sway = Math.sin(time * 2.2) * 0.3 - flowX * 1.1, lift = -Math.max(0, liftY) * 1.2;
  const hair = S.hair ? ramp(S.hair) : null;
  if (hooded) {
    const hr = ramp(back(S.helmColor ?? S.coat, 0.15));
    HP(-5.8 + sway * 0.4, 3.5); HP(-6.2 + sway * 0.5, -2.5); HP(-3.5, -6.5); HP(1.5, -6.6); HP(5.2, -3.4); HP(5.6, 1.6); HP(3.5, 4.5);
    poly(hr, hX, hY, 0, 0, -6.5);
  }
  if (hair && S.hairKind === 'long') {
    HP(-4.5, -3.5); HP(-6.5 + sway, 2 + lift); HP(-6 + sway * 1.6, 9 + lift); HP(-3 + sway, 10 + lift); HP(-1.5, 3);
    poly(hair, hX, hY, 0, 0, -9);
  }
  if (hair && S.hairKind === 'braid') {
    HP(-4.5, -2.5); HP(-5.5 + sway * 0.5, 2); HP(-5 + sway, 6 + lift); HP(-6 + sway * 1.5, 10 + lift); HP(-4 + sway * 1.5, 11 + lift); HP(-3.5 + sway, 6 + lift); HP(-2.5, 2);
    poly(hair, hX, hY, 0, 0, -9);
  }
  const bare = !hooded && S.helm !== 'visor' && S.helm !== 'sentinel' && S.helm !== 'mask' && S.helm !== 'oversized';
  // Skull and jaw, nose forward.
  HP(-R * 0.95, -R * 0.2); HP(-R * 0.72, -R * 0.88); HP(0, -R * 1.02); HP(R * 0.75, -R * 0.85); HP(R * 1.0, -R * 0.1);
  HP(R * 1.2, R * 0.18); HP(R * 0.95, R * 0.35); HP(R * 0.85, R * 0.82); HP(R * 0.25, R * 1.05); HP(-R * 0.45, R * 0.85); HP(-R * 0.95, R * 0.25);
  poly(skin, hx_(R * 0.1, -R * 0.55), hy_(R * 0.1, -R * 0.55), 0, 0, -R * 1.9);
  // Cheek light and the shadow under the nose.
  hdot(R * 0.75, R * 0.15, skin[LIGHT]);
  hdot(R * 0.95, R * 0.42, skin[SHADOW]);
  if (bare) hdot(-R * 0.12, R * 0.15, skin[SHADOW]);
  if (S.beard) {
    const br = ramp(S.beard);
    HP(R * 1.0, R * 0.35); HP(R * 0.9, R * 1.2); HP(R * 0.2, R * 1.6); HP(-R * 0.5, R * 0.9); HP(-R * 0.2, R * 0.4); HP(R * 0.5, R * 0.6);
    poly(br, hx_(R * 0.3, R * 0.6), hy_(R * 0.3, R * 0.6), 0, 0, -R * 1.2, BASE, false);
    hdot(R * 0.8, R * 0.5, br[DEEP]);
  } else if (bare) {
    hdot(R * 0.78, R * 0.66, skin[DEEP]);
  }
  // Eye and brow: two pixels and a line carry the whole face at this size.
  const ex = R * 0.52, ey = -R * 0.12;
  if (S.helm !== 'visor' && S.helm !== 'sentinel' && S.helm !== 'mask') {
    if (S.eyeGlow > 0) {
      const e = ramp(S.eye);
      hdot(ex, ey, e[HI]);
      hdot(ex + 1, ey, e[LIGHT]);
    } else if ((time % 4.3) < 0.11) {
      hdot(ex, ey, skin[DEEP]);
      hdot(ex + 1, ey, skin[DEEP]);
    } else if (!S.flat) {
      hdot(ex - 0.2, ey, pack(236, 228, 214));
      hdot(ex + 0.9, ey, pack(28, 18, 14));
    }
    if (hair && !S.flat) {
      hdot(ex - 0.6, ey - 1.4, hair[DEEP]);
      hdot(ex + 0.6, ey - 1.5, hair[DEEP]);
      hdot(ex + 1.6, ey - 1.3, hair[SHADOW]);
    }
  }
  if (hair && (S.hairKind === 'spiky' || S.hairKind === 'short' || S.hairKind === 'long' || S.hairKind === 'braid')) {
    if (S.hairKind === 'spiky') {
      const b = sway, bl = lift * 0.6;
      HP(R * 1.05, -R * 0.35); HP(R * 0.7, -R * 1.25); HP(-R * 0.1, -R * 1.45 - 0.5); HP(-R * 0.9, -R * 1.2);
      HP(-R * 1.7 + b, -R * 1.05 + bl); HP(-R * 1.1, -R * 0.6); HP(-R * 1.9 + b * 1.3, -R * 0.25 + bl); HP(-R * 1.05, R * 0.05);
      HP(-R * 1.5 + b * 1.2, R * 0.55 + bl); HP(-R * 0.75, R * 0.35); HP(-R * 0.35, -R * 0.35); HP(R * 0.15, -R * 0.75); HP(R * 0.45, -R * 0.45);
      poly(hair, hx_(0, -R * 0.4), hy_(0, -R * 0.4), 0, 0, -R * 1.5);
      // Fringe, and the strands that make it read as spikes.
      HP(R * 0.75, -R * 0.95); HP(R * 1.15, -R * 0.15); HP(R * 0.55, -R * 0.55);
      poly(hair, 0, 0, 0, 0, 0, SHADOW, false);
      hdot(-R * 0.3, -R * 1.05, hair[DEEP]);
      hdot(-R * 0.65, -R * 0.75, hair[DEEP]);
      hdot(-R * 1.15, -R * 0.55, hair[DEEP]);
      hdot(R * 0.2, -R * 1.2, hair[HI]);
      hdot(R * 0.45, -R * 1.1, hair[LIGHT]);
    } else {
      HP(R * 1.0, -R * 0.4); HP(R * 0.6, -R * 1.15); HP(-R * 0.3, -R * 1.2); HP(-R * 1.05, -R * 0.6); HP(-R * 1.05, R * 0.3); HP(-R * 0.4, -R * 0.2); HP(R * 0.3, -R * 0.65);
      poly(hair, hx_(0, -R * 0.4), hy_(0, -R * 0.4), 0, 0, -R * 1.4);
      hdot(R * 0.1, -R * 1.0, hair[HI]);
    }
  }
  switch (S.helm) {
    case 'hood_up': case 'archer': case 'husk': {
      const hr = ramp(S.helmColor ?? S.coat);
      HP(-5.6 + sway * 0.3, 2.5); HP(-5.4, -3.2); HP(-2.4, -6.3); HP(2.4, -6.3); HP(5.4, -3.6); HP(5.8, -0.6); HP(4.2, -1.6);
      HP(2.2, -4.1); HP(-1.2, -4.4); HP(-3.6, -1.2); HP(-3.2, 3.2);
      poly(hr, hX, hY, 0, 0, -6.5);
      break;
    }
    case 'cap': {
      const c = ramp(S.helmColor ?? '#6d6a66');
      for (let k = 0; k <= 10; k++) {
        const t = Math.PI + (k / 10) * Math.PI;
        HP(Math.cos(t) * R * 1.12, -R * 0.45 + Math.sin(t) * R * 0.85);
      }
      poly(c, hx_(R * 0.3, -R * 0.9), hy_(R * 0.3, -R * 0.9), 0, 0, -R * 1.3);
      for (let u = -R * 1.1; u <= R * 1.1; u += 1) hdot(u, -R * 0.5, c[LIGHT]);
      hdot(R * 0.35, -R * 1.0, c[HI]);
      break;
    }
    case 'visor': case 'sentinel': {
      const c = ramp(S.helmColor ?? '#2c2a30');
      HP(-R * 1.05, R * 0.9); HP(-R * 1.15, -R * 0.6); HP(-R * 0.4, -R * 1.35); HP(R * 0.7, -R * 1.25); HP(R * 1.25, -R * 0.4);
      HP(R * 1.25, R * 0.95); HP(R * 0.4, R * 1.2); HP(-R * 0.6, R * 1.1);
      poly(c, hx_(R * 0.35, -R * 0.6), hy_(R * 0.35, -R * 0.6), 0, 0, -R * 1.5);
      const slit = S.eyeGlow > 0 ? ramp(S.eye)[HI] : pack(11, 10, 13);
      for (let u = R * 0.15; u <= R * 1.2; u += 1) hdot(u, -R * 0.15, slit);
      hdot(R * 0.75, R * 0.3, slit);
      hdot(R * 0.75, R * 0.55, slit);
      if (S.helmTrim) {
        const t = ramp(S.helmTrim)[BASE];
        for (let u = -R * 0.4; u <= R * 0.7; u += 1) hdot(u, -R * 1.25, t);
      }
      hdot(R * 0.5, -R * 1.0, c[HI]);
      break;
    }
    case 'crown': {
      const g = ramp('#e2b24c');
      HP(-R * 0.95, -R * 0.75); HP(-R * 1.1, -R * 1.75); HP(-R * 0.5, -R * 1.15); HP(0, -R * 1.95); HP(R * 0.5, -R * 1.15); HP(R * 1.1, -R * 1.75); HP(R * 0.95, -R * 0.75);
      poly(g, hx_(0, -R * 1.2), hy_(0, -R * 1.2), 0, 0, -R * 1.2);
      hdot(0, -R * 1.0, pack(176, 35, 58));
      hdot(-R * 0.6, -R * 1.0, g[HI]);
      break;
    }
    case 'oversized': {
      const c = ramp(S.helmColor ?? '#7a776f');
      for (let k = 0; k <= 10; k++) {
        const t = Math.PI * 0.95 + (k / 10) * Math.PI * 1.1;
        HP(-0.3 + Math.cos(t) * R * 1.32, -R * 0.35 + Math.sin(t) * R * 1.05);
      }
      poly(c, hx_(R * 0.3, -R), hy_(R * 0.3, -R), 0, 0, -R * 1.6);
      for (let u = -R * 1.3; u <= R * 1.3; u += 1) hdot(u, -R * 0.4, c[LIGHT]);
      break;
    }
    case 'mask': {
      const m = ramp('#e9e2d6');
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        HP(R * 0.25 + Math.cos(t) * R * 0.95, -R * 0.1 + Math.sin(t) * R * 1.15);
      }
      poly(m, hx_(R * 0.5, -R * 0.5), hy_(R * 0.5, -R * 0.5), 0, 0, -R * 1.4);
      hdot(R * 0.65, -R * 0.3, pack(18, 12, 20));
      hdot(R * 0.85, R * 0.2, ramp('#d6a640')[BASE]);
      break;
    }
  }
}

// ---------------------------------------------------------------- weapons

const wp: WeaponPts = { bx: 0, by: 0, tx: 0, ty: 0 };

function weapon(j: Joints, S: HumanStyle) {
  const dx = Math.sin(j.wpnA), dy = Math.cos(j.wpnA), px = -dy, py = dx;
  const hx = j.haFX, hy = j.haFY;
  wp.bx = hx; wp.by = hy; wp.tx = hx; wp.ty = hy;
  const steel = ramp(S.weaponColor ?? '#cfd4dc');
  const gold = ramp('#c9a14e'), wood = ramp('#5b4130'), leather = ramp('#4a3324');
  const glowC = S.weaponGlow && (S.weaponGlowAmt ?? 0) > 0 ? ramp(S.weaponGlow) : null;
  if (S.weapon === 'blade' || S.weapon === 'greatsword') {
    const big = S.weapon === 'greatsword';
    const L = big ? 30 : 22, Wd = big ? 2.4 : 1.5, grip = big ? 5 : 3.5;
    capsule(hx - dx * grip, hy - dy * grip, hx + dx * 1.2, hy + dy * 1.2, 0.9, 0.9, leather);
    capsule(hx - dx * grip, hy - dy * grip, hx - dx * grip, hy - dy * grip, 1.3, 1.3, gold, METAL);
    const gx = hx + dx * 1.6, gy = hy + dy * 1.6, gw = big ? 5.0 : 3.6;
    capsule(gx - px * gw, gy - py * gw, gx + px * gw, gy + py * gw, 0.9, 0.9, gold, METAL);
    const b0x = gx + dx * 0.8, b0y = gy + dy * 0.8, tx = gx + dx * L, ty = gy + dy * L;
    const sx = tx - dx * 3, sy = ty - dy * 3;
    P(b0x - px * Wd, b0y - py * Wd); P(b0x + px * Wd, b0y + py * Wd); P(sx + px * Wd * 0.9, sy + py * Wd * 0.9); P(tx, ty); P(sx - px * Wd * 0.9, sy - py * Wd * 0.9);
    poly(steel, b0x, b0y, px, py, Wd + 0.3);
    // The edge that faces the light, and the fuller (alight on a blessed blade).
    const e = px * LX + py * LY > 0 ? 1 : -1;
    line(b0x + px * (Wd - 0.6) * e + dx, b0y + py * (Wd - 0.6) * e + dy, sx + px * (Wd - 0.7) * e, sy + py * (Wd - 0.7) * e, steel[HI]);
    line(b0x + dx * 1.5, b0y + dy * 1.5, b0x + dx * L * 0.62, b0y + dy * L * 0.62, glowC ? glowC[HI] : steel[SHADOW]);
    wp.bx = b0x; wp.by = b0y; wp.tx = tx; wp.ty = ty;
  } else if (S.weapon === 'spear') {
    const x0 = hx - dx * 12, y0 = hy - dy * 12, x1 = hx + dx * 30, y1 = hy + dy * 30;
    capsule(x0, y0, x1, y1, 0.9, 0.9, wood);
    capsule(x0, y0, x0, y0, 1.1, 1.1, gold, METAL);
    capsule(x1 - dx * 1.8, y1 - dy * 1.8, x1 + dx * 0.8, y1 + dy * 0.8, 1.2, 1.2, gold, METAL);
    const tx = x1 + dx * 9, ty = y1 + dy * 9, mx = x1 + dx * 3.2, my = y1 + dy * 3.2;
    P(x1 + dx * 0.4, y1 + dy * 0.4); P(mx + px * 2.4, my + py * 2.4); P(tx, ty); P(mx - px * 2.4, my - py * 2.4);
    poly(steel, mx, my, px, py, 2.4);
    if (glowC) line(x1 + dx, y1 + dy, tx - dx * 1.5, ty - dy * 1.5, glowC[HI]);
    wp.bx = x1; wp.by = y1; wp.tx = tx; wp.ty = ty;
  }
}

// ---------------------------------------------------------------- other arms

function otherWeapon(j: Joints, S: HumanStyle) {
  const dx = Math.sin(j.wpnA), dy = Math.cos(j.wpnA), px = -dy, py = dx;
  const hx = j.haFX, hy = j.haFY;
  const steel = ramp(S.weaponColor ?? '#cfd4dc');
  switch (S.weapon) {
    case 'claws': {
      const cl = ramp('#2a2232');
      for (let i = -1; i <= 1; i++) {
        const sx = hx + px * i * 0.9, sy = hy + py * i * 0.9;
        capsule(sx, sy, sx + dx * 6, sy + dy * 6, 0.7, 0.4, cl, i > -1 ? SAME : 0);
      }
      wp.tx = hx + dx * 6; wp.ty = hy + dy * 6;
      break;
    }
    case 'hammer': {
      capsule(hx - dx * 3, hy - dy * 3, hx + dx * 10, hy + dy * 10, 0.8, 0.8, ramp('#5b4130'));
      const cx = hx + dx * 10, cy = hy + dy * 10;
      P(cx - px * 3.5 - dx, cy - py * 3.5 - dy); P(cx + px * 3.5 - dx, cy + py * 3.5 - dy); P(cx + px * 3.5 + dx * 2.5, cy + py * 3.5 + dy * 2.5); P(cx - px * 3.5 + dx * 2.5, cy - py * 3.5 + dy * 2.5);
      poly(ramp('#55555c'), cx, cy, dx, dy, 2);
      wp.tx = cx; wp.ty = cy;
      break;
    }
    case 'maul': {
      const L = 24, x0 = hx - dx * 7, y0 = hy - dy * 7, x1 = hx + dx * L, y1 = hy + dy * L;
      capsule(x0, y0, x1, y1, 1.2, 1.2, ramp('#4a3626'));
      const bands = ramp('#6a6470');
      for (const t of [0.35, 0.7]) {
        const bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
        capsule(bx - dx * 0.8, by - dy * 0.8, bx + dx * 0.8, by + dy * 0.8, 1.6, 1.6, bands, METAL);
      }
      const hw = 6.5, hl = 5.5;
      P(x1 - px * hw - dx * 1.5, y1 - py * hw - dy * 1.5); P(x1 + px * hw - dx * 1.5, y1 + py * hw - dy * 1.5);
      P(x1 + px * hw + dx * hl, y1 + py * hw + dy * hl); P(x1 - px * hw + dx * hl, y1 - py * hw + dy * hl);
      poly(steel, x1, y1, px, py, hw);
      line(x1 - px * hw * 0.8 + dx * hl * 0.5, y1 - py * hw * 0.8 + dy * hl * 0.5, x1 + px * hw * 0.8 + dx * hl * 0.5, y1 + py * hw * 0.8 + dy * hl * 0.5, steel[DEEP]);
      wp.bx = x1 - dx * 6; wp.by = y1 - dy * 6; wp.tx = x1 + dx * hl; wp.ty = y1 + dy * hl;
      break;
    }
    case 'book': {
      P(hx - 3, hy - 4); P(hx + 3, hy - 4.5); P(hx + 3, hy + 1); P(hx - 3, hy + 1.5);
      poly(ramp('#5a2b2b'), hx, hy - 1.5, 0, -1, 3);
      line(hx - 2.3, hy - 3.6, hx - 2.3, hy + 0.8, pack(232, 220, 192));
      dot(hx + 0.5, hy - 1.6, ramp('#c9a14e')[LIGHT]);
      break;
    }
    case 'staff': {
      capsule(hx - dx * 14, hy - dy * 14, hx + dx * 16, hy + dy * 16, 0.85, 0.85, ramp('#4d3a2a'));
      wp.tx = hx + dx * 16; wp.ty = hy + dy * 16;
      break;
    }
  }
}

function offhand(j: Joints, S: HumanStyle, time: number) {
  const hx = j.haBX, hy = j.haBY;
  const c = ramp(S.offColor ?? '#3a3640'), trim = ramp(S.offTrim ?? '#6b6470');
  switch (S.offhand) {
    case 'tower': case 'blazing': case 'kite': {
      const tower = S.offhand !== 'kite';
      const w = (tower ? 7.5 : 7) * S.bulk, h = (tower ? 15 : 12) * S.bulk;
      const x = hx + (tower ? 2.5 : 2.2), y = hy - h * (tower ? 0.55 : 0.5);
      if (tower) { P(x - w / 2, y); P(x + w / 2, y); P(x + w / 2, y + h * 0.8); P(x + w * 0.3, y + h * 0.97); P(x, y + h + 1.5); P(x - w * 0.3, y + h * 0.97); P(x - w / 2, y + h * 0.8); }
      else { P(x - w / 2, y); P(x + w / 2, y); P(x + w / 2, y + h * 0.45); P(x, y + h); P(x - w / 2, y + h * 0.45); }
      poly(c, x, y + h / 2, 1, 0, w / 2);
      // Rim, cross and boss.
      line(x - w / 2 + 1, y + 1, x + w / 2 - 1, y + 1, trim[LIGHT]);
      line(x, y + 2, x, y + h - 2, trim[BASE]);
      if (tower) line(x - w / 2 + 1.5, y + h * 0.4, x + w / 2 - 1.5, y + h * 0.4, trim[BASE]);
      dot(x, y + h * 0.4, trim[HI]);
      dot(x - w / 2 + 1, y + h * 0.1 + 1, trim[LIGHT]);
      dot(x + w / 2 - 1, y + h * 0.1 + 1, trim[LIGHT]);
      break;
    }
    case 'buckler': {
      capsule(hx + 1.5, hy, hx + 1.5, hy, 4 * S.bulk, 4 * S.bulk, c, METAL);
      dot(hx + 1.5, hy, trim[HI]);
      break;
    }
    case 'bow': {
      const dx = Math.sin(j.offA), dy = Math.cos(j.offA), px = -dy, py = dx;
      const L = 15, pull = (S.bowDraw ?? 0) * 7;
      const wood = c;
      part++;
      for (const sg of [1, -1]) {
        const tx = hx + px * L * sg + dx * 3, ty = hy + py * L * sg + dy * 3;
        const mx = hx + dx * 5 + (tx - hx) * 0.5, my = hy + dy * 5 + (ty - hy) * 0.5;
        let lx = hx + dx * 1.2, ly = hy + dy * 1.2;
        for (let k = 1; k <= 6; k++) {
          const t = k / 6, u = 1 - t;
          const qx = u * u * (hx + dx * 1.2) + 2 * u * t * mx + t * t * tx, qy = u * u * (hy + dy * 1.2) + 2 * u * t * my + t * t * ty;
          capsule(lx, ly, qx, qy, 0.9, 0.9, wood, SAME);
          lx = qx; ly = qy;
        }
      }
      const sx = hx - dx * pull, sy = hy - dy * pull, str = trim[LIGHT];
      line(hx + px * L + dx * 3, hy + py * L + dy * 3, sx, sy, str);
      line(sx, sy, hx - px * L + dx * 3, hy - py * L + dy * 3, str);
      if ((S.bowDraw ?? 0) > 0.05) line(sx, sy, hx + dx * 6, hy + dy * 6, S.weaponGlow ? ramp(S.weaponGlow)[HI] : pack(216, 203, 176));
      break;
    }
    case 'lantern': {
      line(hx, hy, hx, hy + 2.5, pack(58, 44, 32));
      P(hx - 2, hy + 2.5); P(hx + 2, hy + 2.5); P(hx + 2.4, hy + 7); P(hx - 2.4, hy + 7);
      poly(ramp('#c58d3a'), hx, hy + 5, 1, 0, 2.4);
      const f = (time * 12) % 2 < 1 ? pack(255, 236, 180) : pack(255, 214, 140);
      dot(hx - 0.5, hy + 4.5, f); dot(hx + 0.5, hy + 4.5, f); dot(hx - 0.5, hy + 5.5, f); dot(hx + 0.5, hy + 5.5, f);
      break;
    }
  }
}

// ---------------------------------------------------------------- ribbons

function ribbon(ch: Chain, w0: number, w1: number, c: string, ox: number, oy: number) {
  const r = ramp(c);
  part++;
  for (let i = 0; i < ch.n - 1; i++) {
    const t0 = i / (ch.n - 1), t1 = (i + 1) / (ch.n - 1);
    const ax = (ch.xs[i] - ox) * face, ay = ch.ys[i] - oy, bx = (ch.xs[i + 1] - ox) * face, by = ch.ys[i + 1] - oy;
    capsule(ax, ay, bx, by, (w0 + (w1 - w0) * t0) / 2, (w0 + (w1 - w0) * t1) / 2, r, SAME);
  }
}

// ---------------------------------------------------------------- entry point

let enabled = false;
/** The renderer turns pixel characters on with the pixel-art style. */
export function setPixelArt(on: boolean) {
  enabled = on;
}

export interface PixelExtras {
  /** World-space chains drawn behind the body: cape, then scarf. */
  cape: Chain | null;
  capeColor: string;
  capeTrim: string | null;
  scarf: Chain | null;
  /** The body's world position (the chains are in world space). */
  x: number;
  y: number;
}

let extras: PixelExtras | null = null;
/** Chains for the next paint only (Elior's cape and scarf). */
export function setPixelExtras(e: PixelExtras | null) {
  extras = e;
}

/** Translucent styles (afterimages) keep the classic painter. */
const opaque = (c: string) => c[0] === '#' || c.startsWith('rgb(') || c.endsWith(',1)');

/**
 * Paint a humanoid as pixel art at the origin of the current transform
 * (local space: x forward, feet at 0), snapped to whole pixels. Returns the
 * weapon's base and tip like drawHumanoid, or null when this body cannot be
 * painted (pixel art off, a rotated or giant frame, a see-through style) and
 * the classic painter should draw it.
 */
export function paintPixelHumanoid(ctx: Ctx, j0: Joints, S: HumanStyle, time: number, rot: number, vx: number, vy: number): WeaponPts | null {
  const ex = extras;
  extras = null;
  if (!enabled || !opaque(S.skin) || !opaque(S.coat)) return null;
  if (Math.abs(j0.headY) > 70 || Math.abs(j0.headX) > 40 || j0.hipY < -40) return null;
  const m = ctx.getTransform();
  if (Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3 || m.d <= 0) return null;
  ensure();
  clear();
  face = m.a < 0 ? -1 : 1;
  const j = rotated(j0, rot);
  const flowX = Math.max(-1.2, Math.min(1.2, vx / 210)), liftY = Math.max(-1, Math.min(1, vy / 320));
  wp.bx = j.haFX; wp.by = j.haFY; wp.tx = j.haFX; wp.ty = j.haFY;
  if (ex) {
    if (ex.cape) {
      ribbon(ex.cape, 7, 10, ex.capeColor, ex.x, ex.y);
      if (ex.capeTrim) ribbon(ex.cape, 1.5, 2, ex.capeTrim, ex.x, ex.y);
    }
    if (ex.scarf && S.scarf) ribbon(ex.scarf, 3.4, 1.4, S.scarf, ex.x, ex.y);
  }
  arm(j, S, true);
  leg(j, S, true);
  if (S.skirt > 0) skirt(j, S, time, flowX, liftY);
  torso(j, S);
  if (S.offhand !== 'none') offhand(j, S, time);
  leg(j, S, false);
  head(j, S, time, flowX, liftY);
  if (S.weapon === 'blade' || S.weapon === 'greatsword' || S.weapon === 'spear') weapon(j, S);
  else otherWeapon(j, S);
  arm(j, S, false);
  if (S.plate && S.plate.tier >= 1) pauldron(j, S);
  if (S.crack) {
    const cr = ramp(S.crack)[HI];
    const a = j.torsoA, ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
    const len = Math.hypot(j.neckX - j.hipX, j.neckY - j.hipY);
    const X = (u: number, r: number) => j.hipX + ux * u + rx * r, Y = (u: number, r: number) => j.hipY + uy * u + ry * r;
    line(X(len * 0.85, -2), Y(len * 0.85, -2), X(len * 0.6, 1), Y(len * 0.6, 1), cr);
    line(X(len * 0.6, 1), Y(len * 0.6, 1), X(len * 0.2, 2.5), Y(len * 0.2, 2.5), cr);
  }
  outline();
  // Upload only the touched rectangle, then place it on whole pixels.
  const c0 = Math.max(0, bx0), r0 = Math.max(0, by0), cw = Math.min(W, bx1 + 1) - c0, rh = Math.min(H, by1 + 1) - r0;
  if (cw > 0 && rh > 0) {
    cctx!.putImageData(image!, 0, 0, c0, r0, cw, rh);
    ctx.save();
    ctx.setTransform(Math.abs(m.a), 0, 0, m.d, Math.round(m.e), Math.round(m.f));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas!, c0, r0, cw, rh, c0 - OX, r0 - OY, cw, rh);
    ctx.restore();
  }
  // Lights go on softly over the pixels: blessed blades, burning eyes, runes, cracks.
  ctx.globalCompositeOperation = 'lighter';
  if (S.weaponGlow && (S.weaponGlowAmt ?? 0) > 0) {
    const ga = S.weaponGlowAmt!;
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + (i / 3) * 0.7;
      glow(ctx, wp.bx + (wp.tx - wp.bx) * t, wp.by + (wp.ty - wp.by) * t, 5 + ga * 4, S.weaponGlow, 0.3 * ga);
    }
    if (S.weaponFlame) {
      for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.22 + Math.sin(time * 7 + i) * 0.03;
        glow(ctx, wp.bx + (wp.tx - wp.bx) * t, wp.by + (wp.ty - wp.by) * t - 2 - Math.abs(Math.sin(time * 9 + i)) * 2, 4, '#fff6dc', 0.5);
      }
    }
  }
  if (S.eyeGlow > 0 && S.helm !== 'mask') glow(ctx, hx_(4.5 * 0.6, -0.55), hy_(4.5 * 0.6, -0.55), 4.5, S.eye, S.eyeGlow);
  if (S.runes) glow(ctx, (j.elFX + j.haFX) / 2, (j.elFY + j.haFY) / 2, 3.5, S.runes, 0.3);
  if (S.crack) glow(ctx, j.hipX + (j.neckX - j.hipX) * 0.6, j.hipY + (j.neckY - j.hipY) * 0.6, 6, S.crack, 0.45);
  if (S.offhand === 'lantern') glow(ctx, j.haBX, j.haBY + 5, 14, '#ffb35c', 0.8 + Math.sin(time * 12) * 0.1);
  if (S.offhand === 'blazing') glow(ctx, j.haBX + 2.5, j.haBY, 16, '#fff2c4', 0.55 + Math.sin(time * 6) * 0.1);
  ctx.globalCompositeOperation = 'source-over';
  // The joints were turned by rot before painting, so these points already are.
  return wp;
}
