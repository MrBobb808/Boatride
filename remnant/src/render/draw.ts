// Drawing primitives: tapered limbs, glow sprites (pre-rendered, never shadowBlur
// — shadowBlur is slow on iOS Safari), and small shape helpers.

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

/** Free a canvas's backing store right away (iOS caps total canvas memory). */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (!c) return;
  c.width = 1;
  c.height = 1;
}

/** Capsule from a to b with radii ra, rb. Adds to current path. */
export function capsulePath(ctx: Ctx, ax: number, ay: number, bx: number, by: number, ra: number, rb: number) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.0001;
  const ang = Math.atan2(dy, dx);
  // Angle offset for tangent lines between circles of different radii.
  const d = Math.max(-0.99, Math.min(0.99, (ra - rb) / len));
  const off = Math.acos(d);
  ctx.moveTo(ax + Math.cos(ang + off) * ra, ay + Math.sin(ang + off) * ra);
  ctx.arc(ax, ay, ra, ang + off, ang - off, false);
  ctx.arc(bx, by, rb, ang - off, ang + off, false);
  ctx.closePath();
}

export function limb(
  ctx: Ctx, ax: number, ay: number, bx: number, by: number, ra: number, rb: number,
  fill: string | CanvasGradient, outline: string | null, lw = 1.1,
) {
  ctx.beginPath();
  capsulePath(ctx, ax, ay, bx, by, ra, rb);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
}

// ---------- Shaded fills ----------
// Characters are lit from above and a little in front (in their own facing
// space, so the light turns with them like a key light on a stage). Gradients
// are built once per colour and size in a local frame and reused through
// ctx transforms, so shading costs a transform rather than a new gradient.

const LX = 0.36, LY = -0.93;
const gradCache = new Map<string, CanvasGradient>();

let shadingOn = true;
/** Turned off on the lowest quality tier: every shaded fill falls back to flat colour. */
export function setShading(on: boolean) {
  shadingOn = on;
}

/** Only opaque colours are shaded; translucent ones (ghosts) stay flat. */
export function shadeable(c: unknown): c is string {
  return shadingOn && typeof c === 'string' && (c[0] === '#' || c.startsWith('rgb('));
}

function cached(key: string, make: () => CanvasGradient) {
  let g = gradCache.get(key);
  if (!g) {
    if (gradCache.size > 700) gradCache.clear();
    g = make();
    gradCache.set(key, g);
  }
  return g;
}

/** Cylinder shading across local y in [-R, R]; the lit side is -y. */
export function cylGrad(ctx: Ctx, color: string, R: number, metal = false): CanvasGradient {
  const r = Math.round(R * 4) / 4;
  return cached((metal ? 'm' : 'c') + color + r, () => {
    const g = ctx.createLinearGradient(0, -r, 0, r);
    if (metal) {
      g.addColorStop(0, shade(color, 0.04));
      g.addColorStop(0.24, shade(color, 0.36));
      g.addColorStop(0.4, color);
      g.addColorStop(0.75, shade(color, -0.3));
      g.addColorStop(1, shade(color, -0.12));
    } else {
      g.addColorStop(0, shade(color, 0.06));
      g.addColorStop(0.25, shade(color, 0.16));
      g.addColorStop(0.52, color);
      g.addColorStop(0.82, shade(color, -0.26));
      g.addColorStop(1, shade(color, -0.4));
    }
    return g;
  });
}

/** Vertical gradient in local space from y0 (lit) to y1 (shadow). */
export function vGrad(ctx: Ctx, color: string, y0: number, y1: number, hi = 0.14, lo = -0.3): CanvasGradient {
  return cached('v' + color + y0 + ',' + y1 + ',' + hi + ',' + lo, () => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(color, hi));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, lo));
    return g;
  });
}

/** Radial highlight in local space (heads, domes). */
export function rGrad(ctx: Ctx, color: string, cx: number, cy: number, r: number, hi = 0.16, lo = -0.22): CanvasGradient {
  return cached('r' + color + cx + ',' + cy + ',' + r + ',' + hi + ',' + lo, () => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, shade(color, hi));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, lo));
    return g;
  });
}

/** Linear gradient between two world points, built per call (for shapes that deform). */
export function lineGrad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, hi = 0.14, lo = -0.3, metal = false): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (metal) {
    g.addColorStop(0, shade(color, 0.1));
    g.addColorStop(0.3, shade(color, 0.5));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, -0.32));
  } else {
    g.addColorStop(0, shade(color, hi));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, lo));
  }
  return g;
}

/** A tapered limb with cylinder shading facing the key light. */
export function limbShaded(
  ctx: Ctx, ax: number, ay: number, bx: number, by: number, ra: number, rb: number,
  fill: string, outline: string | null, lw = 1.1, metal = false,
) {
  if (!shadeable(fill)) {
    limb(ctx, ax, ay, bx, by, ra, rb, fill, outline, lw);
    return;
  }
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.0001;
  const c = dx / len, s = dy / len;
  // Local +y in world is (-s, c); flip it when it faces the light so the
  // gradient's lit end (-y) always points toward the light.
  const flip = -s * LX + c * LY > 0;
  // Enter the limb's frame, draw, then apply the exact inverse (cheaper than save/restore).
  if (flip) ctx.transform(c, s, s, -c, ax, ay);
  else ctx.transform(c, s, -s, c, ax, ay);
  ctx.beginPath();
  capsulePath(ctx, 0, 0, len, 0, ra, rb);
  ctx.fillStyle = cylGrad(ctx, fill, Math.max(ra, rb), metal);
  ctx.fill();
  if (outline) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
  if (flip) ctx.transform(c, s, s, -c, -(c * ax + s * ay), -(s * ax - c * ay));
  else ctx.transform(c, -s, s, c, -(c * ax + s * ay), s * ax - c * ay);
}

/**
 * Outline-only pass for a capsule. Stroking every segment of a limb before
 * filling any of them hides the seams at knees and elbows: each fill covers
 * the neighbouring segment's inner outline, leaving one clean silhouette.
 */
export function limbStroke(ctx: Ctx, ax: number, ay: number, bx: number, by: number, ra: number, rb: number, outline: string, lw: number) {
  ctx.beginPath();
  capsulePath(ctx, ax, ay, bx, by, ra, rb);
  ctx.lineWidth = lw;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

/** A light stripe along a limb, offset toward the upper-left key light. */
export function limbHighlight(ctx: Ctx, ax: number, ay: number, bx: number, by: number, r: number, color: string) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const o = r * 0.45;
  ctx.beginPath();
  ctx.moveTo(ax + nx * o + dx * 0.12, ay + ny * o + dy * 0.12);
  ctx.lineTo(bx + nx * o - dx * 0.12, by + ny * o - dy * 0.12);
  ctx.lineWidth = Math.max(0.6, r * 0.45);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

export function poly(ctx: Ctx, pts: number[], fill: string | CanvasGradient | null, stroke?: string | null, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function circle(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------- Glow sprites ----------

const glowCache = new Map<string, HTMLCanvasElement>();

/** Radial glow sprite: drawn with drawImage, cheap and pretty. size = diameter in px. */
export function glowSprite(color: string, size = 128, falloff = 2): HTMLCanvasElement {
  const key = color + '|' + size + '|' + falloff;
  let c = glowCache.get(key);
  if (c) return c;
  const m = makeCanvas(size, size);
  const g = m.ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = parseColor(color);
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = Math.pow(1 - t, falloff);
    g.addColorStop(t, `rgba(${r},${gg},${b},${a.toFixed(3)})`);
  }
  m.ctx.fillStyle = g;
  m.ctx.fillRect(0, 0, size, size);
  c = m.c;
  glowCache.set(key, c);
  return c;
}

/** Draw a glow centred at x,y with world radius r. Caller sets composite. */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1, falloff = 2) {
  if (alpha <= 0.003 || r <= 0) return;
  const spr = glowSprite(color, 128, falloff);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

const colorCache = new Map<string, [number, number, number]>();
export function parseColor(c: string): [number, number, number] {
  const hit = colorCache.get(c);
  if (hit) return hit;
  let out: [number, number, number] = [255, 255, 255];
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = c.match(/\d+(\.\d+)?/g);
    if (m) out = [+m[0], +m[1], +m[2]];
  }
  colorCache.set(c, out);
  return out;
}

export function rgba(c: string, a: number) {
  const [r, g, b] = parseColor(c);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

export function mix(c1: string, c2: string, t: number) {
  const a = parseColor(c1), b = parseColor(c2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const shadeCache = new Map<string, string>();
export function shade(c: string, amt: number) {
  const key = c + '|' + amt;
  let out = shadeCache.get(key);
  if (out === undefined) {
    if (shadeCache.size > 2000) shadeCache.clear();
    out = amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt);
    shadeCache.set(key, out);
  }
  return out;
}

/** Text with dark outline for legibility on any background. */
export function outlinedText(ctx: Ctx, text: string, x: number, y: number, fill: string, outline = 'rgba(0,0,0,0.85)', lw = 3) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export const FONT_DISPLAY = '"Cinzel", "Trajan Pro", "Optima", "Palatino", serif';
export const FONT_BODY = '"Cormorant Garamond", "Baskerville", "Palatino", "Georgia", serif';
