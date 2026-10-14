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

export function shade(c: string, amt: number) {
  return amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt);
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
