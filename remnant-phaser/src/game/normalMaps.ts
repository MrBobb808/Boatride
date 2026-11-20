// Normal maps for 2D art, worked out from the art itself, so Phaser's lights (game/dynLights.ts) can shade a sprite as
// a rounded shape: each figure is treated as a pillow that rises from its silhouette over a few pixels, with a little
// of the art's own light and shade on top. Done once per texture, never per frame.
import type Phaser from 'phaser';

/** How many pixels in from the silhouette the pillow reaches full height, and how strongly the slope tilts it. */
const RIM = 5, STRENGTH = 1.7;

/** The normal map of `src` (RGB = the normal, +Y up as the lighting shader reads it). `mirror` flips it left to right
 * in meaning, not in place: for a sprite drawn flipped, whose normals must point the other way. */
export function normalsFrom(src: HTMLCanvasElement | HTMLImageElement, mirror = false): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  // Distance in from the nearest clear pixel (two chamfer passes), capped at RIM.
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = d[i * 4 + 3] > 16 ? RIM : 0;
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = dist[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, dist[i - 1] + 1);
    if (y > 0) { v = Math.min(v, dist[i - w] + 1); if (x > 0) v = Math.min(v, dist[i - w - 1] + D); if (x < w - 1) v = Math.min(v, dist[i - w + 1] + D); }
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) v = Math.min(v, 1);
    dist[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = dist[i]; if (!v) continue;
    if (x < w - 1) v = Math.min(v, dist[i + 1] + 1);
    if (y < h - 1) { v = Math.min(v, dist[i + w] + 1); if (x < w - 1) v = Math.min(v, dist[i + w + 1] + D); if (x > 0) v = Math.min(v, dist[i + w - 1] + D); }
    dist[i] = v;
  }
  // Height: the pillow, eased so the middle is flat and the edge rolls away, with the art's luminance as a small relief.
  const ht = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = dist[i] / RIM; if (!t) continue;
    const lum = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
    ht[i] = 1 - (1 - t) * (1 - t) + (lum - 0.5) * 0.3;
  }
  const sx = mirror ? 1 : -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    if (!dist[i]) { d[o] = 128; d[o + 1] = 128; d[o + 2] = 255; d[o + 3] = 255; continue; }
    const gx = (x < w - 1 ? ht[i + 1] : 0) - (x > 0 ? ht[i - 1] : 0);
    const gy = (y < h - 1 ? ht[i + w] : 0) - (y > 0 ? ht[i - w] : 0);
    // A slope rising to the right faces left; one rising downward (the top edge) faces up, which is +Y to the shader.
    let nx = sx * gx * STRENGTH, ny = gy * STRENGTH, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    d[o] = Math.round((nx * 0.5 + 0.5) * 255); d[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); d[o + 2] = Math.round((nz * 0.5 + 0.5) * 255); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Give a texture its normal map, once, and a twin (`key~L`) that shares its frames and art but carries the mirrored
 * normals, for when the sprite is drawn flipped (Phaser turns a normal map with the sprite, but does not mirror it).
 * Returns false when the texture cannot be read (not a canvas or image). */
export function lightTexture(sc: Phaser.Scene, key: string): boolean {
  const tm = sc.textures;
  if (tm.exists(key + '~L')) return true;
  const tex = tm.get(key), src = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  if (!src || !('width' in src) || !src.width) return false;
  tex.setDataSource(normalsFrom(src));
  // The twin: the same pixels under another key, every frame copied with its trim and data.
  const art = document.createElement('canvas'); art.width = src.width; art.height = src.height; art.getContext('2d')!.drawImage(src, 0, 0);
  const twin = tm.addCanvas(key + '~L', art);
  if (!twin) return false;
  for (const name of tex.getFrameNames()) {
    const f = tex.get(name), g = twin.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    if (!g) continue;
    if (f.trimmed) g.setTrim(f.realWidth, f.realHeight, f.x, f.y, f.cutWidth, f.cutHeight);
    g.customData = f.customData;
  }
  twin.setDataSource(normalsFrom(src, true));
  return true;
}
