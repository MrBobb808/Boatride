// Pixel-art shading for the bosses drawn as vector rigs. The body is drawn
// into a small CPU-side canvas at one pixel per world unit, then shaded the
// way a pixel artist would: hard-edged silhouette, volume from the
// silhouette (a bevel lit from above and in front), dark contours where
// colours meet, a cool rim light on the far edge, hue-shifted shadows,
// ordered-dither banding instead of smooth gradients, and a selective
// outline. Soft glows pass through untouched. The result is cached and
// re-shaded a few times a second, like a hand-animated sprite.

import { G } from '../game/ctx';
import type { Ctx } from './draw';

/** A body that can be shaded: draws itself in world space around (x, y). */
export interface PixelBody {
  x: number;
  y: number;
  draw(ctx: Ctx): void;
  /** Art extents relative to (x, y): left, top, right, bottom. */
  pixelBox?: readonly [number, number, number, number];
}

interface Cache {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  /** World position of the canvas's top-left corner when shaded. */
  ox: number;
  oy: number;
  frame: number;
}

const DEFAULT_BOX = [-170, -300, 170, 40] as const;
const caches = new WeakMap<PixelBody, Cache>();

let work: HTMLCanvasElement | null = null;
let wctx: CanvasRenderingContext2D | null = null;
let height = new Uint8Array(0);
let edgeMask = new Uint8Array(0);
let frameNo = 0;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

function ensureWork(w: number, h: number) {
  if (!work) {
    work = document.createElement('canvas');
    wctx = work.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  }
  if (work.width < w || work.height < h) {
    work.width = Math.max(work.width, w);
    work.height = Math.max(work.height, h);
  }
  if (height.length < w * h) {
    height = new Uint8Array(w * h);
    edgeMask = new Uint8Array(w * h);
  }
}

/** Advance once per rendered frame (the shading cadence counts frames). */
export function bossPixelFrame() {
  frameNo++;
}

/**
 * Draw `b` shaded as pixel art. Returns false when pixel art is off, so the
 * caller draws it the classic way.
 */
export function drawPixelBody(ctx: Ctx, b: PixelBody): boolean {
  const r = G.renderer;
  if (!r.pixel) return false;
  let cache = caches.get(b);
  // Re-shade at about 40 Hz on high quality, 30 on medium, 20 on low.
  const every = r.tier === 2 ? 3 : r.tier === 1 ? 4 : 6;
  if (!cache || frameNo - cache.frame >= every || frameNo < cache.frame) cache = shade(b, cache);
  // The pose is a few frames old at most; carry it with the body so it never lags its hitbox.
  ctx.drawImage(cache.c, Math.round(cache.ox + (b.x - cache.x)), Math.round(cache.oy + (b.y - cache.y)));
  return true;
}

function shade(b: PixelBody, prev: Cache | undefined): Cache {
  const box = b.pixelBox ?? DEFAULT_BOX;
  const W = Math.ceil(box[2] - box[0]), H = Math.ceil(box[3] - box[1]);
  ensureWork(W, H);
  const wc = wctx!;
  const ox = Math.floor(b.x + box[0]), oy = Math.floor(b.y + box[1]);
  wc.setTransform(1, 0, 0, 1, 0, 0);
  wc.globalAlpha = 1;
  wc.globalCompositeOperation = 'source-over';
  wc.clearRect(0, 0, W, H);
  wc.setTransform(1, 0, 0, 1, -ox, -oy);
  b.draw(wc);
  wc.setTransform(1, 0, 0, 1, 0, 0);
  const img = wc.getImageData(0, 0, W, H);
  const d = img.data;

  // Tight bounds of what was drawn.
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (d[row + x * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  let out = prev?.c;
  if (x1 < x0) {
    if (!out) { out = document.createElement('canvas'); out.width = out.height = 1; }
    const c: Cache = { c: out, x: b.x, y: b.y, ox, oy, frame: frameNo };
    caches.set(b, c);
    return c;
  }
  // One pixel of margin for the outline.
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

  // Height: distance inside the solid silhouette, capped (a two-pass chamfer).
  const CAP = 6;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (d[i * 4 + 3] < 120) { height[i] = 0; continue; }
      const up = y > y0 ? height[i - W] : 0, left = x > x0 ? height[i - 1] : 0;
      height[i] = Math.min(CAP, Math.min(up, left) + 1);
    }
  }
  for (let y = y1; y >= y0; y--) {
    for (let x = x1; x >= x0; x--) {
      const i = y * W + x;
      if (!height[i]) continue;
      const dn = y < y1 ? height[i + W] : 0, rt = x < x1 ? height[i + 1] : 0;
      const v = Math.min(dn, rt) + 1;
      if (v < height[i]) height[i] = v;
    }
  }
  // Contours where two different colours meet inside the body: mark the darker side.
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const i = y * W + x;
      edgeMask[i] = 0;
      if (!height[i]) continue;
      const p = i * 4, l = d[p] * 2 + d[p + 1] * 3 + d[p + 2];
      const q = (i + 1) * 4, s = (i + W) * 4;
      if (height[i + 1]) {
        const l2 = d[q] * 2 + d[q + 1] * 3 + d[q + 2];
        if (Math.abs(l - l2) > 330) edgeMask[l < l2 ? i : i + 1] = 1;
      }
      if (height[i + W]) {
        const l3 = d[s] * 2 + d[s + 1] * 3 + d[s + 2];
        if (Math.abs(l - l3) > 330) edgeMask[l < l3 ? i : i + W] = 1;
      }
    }
  }

  // Shade every solid pixel; soft glows (low alpha) are left as they are.
  // Light comes from above and slightly in front; the rim light from behind.
  for (let y = y0; y <= y1; y++) {
    const by = (y - oy) & 3;
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x, p = i * 4;
      const h = height[i];
      if (!h) {
        // Outline: an empty pixel touching the solid body.
        const n = (x > x0 && height[i - 1]) || (x < x1 && height[i + 1]) || (y > y0 && height[i - W]) || (y < y1 && height[i + W]);
        if (n) {
          const j = (x > x0 && height[i - 1] ? i - 1 : x < x1 && height[i + 1] ? i + 1 : y > y0 && height[i - W] ? i - W : i + W) * 4;
          d[p] = (d[j] * 0.22 + 4) | 0; d[p + 1] = (d[j + 1] * 0.2 + 3) | 0; d[p + 2] = (d[j + 2] * 0.24 + 8) | 0; d[p + 3] = 255;
        }
        continue;
      }
      // Slope of the silhouette's height field: a bevel that gives flat shapes volume.
      const hl = x > x0 ? height[i - 1] : 0, hr = x < x1 ? height[i + 1] : 0;
      const hu = y > y0 ? height[i - W] : 0, hd = y < y1 ? height[i + W] : 0;
      const gx = hr - hl, gy = hd - hu;
      // The gradient points inward, so an upper edge (inward = down) faces the light above.
      let lit = (gx * 0.45 + gy * 0.9) * 0.5;
      if (h >= CAP) lit = 0.08;
      lit = lit < -1 ? -1 : lit > 1 ? 1 : lit;
      let k = 1 + lit * 0.42;
      let warm = lit * 0.07;
      if (edgeMask[i]) { k *= 0.55; warm = -0.08; }
      // A cool rim on the edge facing away from the light.
      const rim = h === 1 && lit < -0.2;
      let rr = d[p] * k * (1 + warm), gg = d[p + 1] * k, bb = d[p + 2] * k * (1 - warm);
      if (rim && !edgeMask[i]) { rr = rr * 0.7 + 60; gg = gg * 0.7 + 70; bb = bb * 0.7 + 95; }
      // Ordered dither between 18 levels per channel: the grain of hand-shaded pixel art.
      const t = BAYER[by * 4 + ((x - ox) & 3)] * 14;
      rr = Math.round((rr + t) / 14) * 14; gg = Math.round((gg + t) / 14) * 14; bb = Math.round((bb + t) / 14) * 14;
      d[p] = rr < 0 ? 0 : rr > 255 ? 255 : rr;
      d[p + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
      d[p + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb;
      d[p + 3] = 255;
    }
  }
  wc.putImageData(img, 0, 0, x0, y0, bw, bh);
  if (!out) out = document.createElement('canvas');
  if (out.width !== bw || out.height !== bh) { out.width = bw; out.height = bh; }
  const oc = out.getContext('2d')!;
  oc.clearRect(0, 0, bw, bh);
  oc.drawImage(work!, x0, y0, bw, bh, 0, 0, bw, bh);
  const c: Cache = { c: out, x: b.x, y: b.y, ox: ox + x0, oy: oy + y0, frame: frameNo };
  caches.set(b, c);
  return c;
}
