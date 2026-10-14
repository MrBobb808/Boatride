// Darkness overlay with light cut-outs, rendered at quarter resolution and
// scaled up (soft, and cheap on phones), then an additive pass tints lights.

import { makeCanvas, glowSprite, glow, parseColor, type Ctx } from './draw';
import type { Camera, Renderer } from './renderer';

export interface Light {
  x: number;
  y: number;
  r: number;
  c: string;
  a: number;
  /** Strength of the coloured additive bloom (0 = only reveals). */
  bloom: number;
}

export class Lighting {
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lights: Light[] = [];
  private pool: Light[] = [];
  private div = 4;

  constructor() {
    const m = makeCanvas(4, 4);
    this.c = m.c;
    this.ctx = m.ctx;
  }

  begin() {
    for (const l of this.lights) this.pool.push(l);
    this.lights.length = 0;
  }

  add(x: number, y: number, r: number, c: string, a = 1, bloom = 0.5) {
    const l = this.pool.pop() ?? ({} as Light);
    l.x = x; l.y = y; l.r = r; l.c = c; l.a = a; l.bloom = bloom;
    this.lights.push(l);
  }

  render(ctx: Ctx, cam: Camera, r: Renderer, darkness: number, tint: string) {
    if (darkness <= 0.01) return;
    const div = r.tier === 0 ? 6 : 4;
    const w = Math.max(1, Math.ceil(r.bw / div)), h = Math.max(1, Math.ceil(r.bh / div));
    if (this.c.width !== w || this.c.height !== h) {
      this.c.width = w;
      this.c.height = h;
    }
    this.div = div;
    const lc = this.ctx;
    lc.globalCompositeOperation = 'source-over';
    lc.setTransform(1, 0, 0, 1, 0, 0);
    const [tr, tg, tb] = parseColor(tint);
    lc.clearRect(0, 0, w, h);
    lc.fillStyle = `rgba(${tr},${tg},${tb},${darkness.toFixed(3)})`;
    lc.fillRect(0, 0, w, h);
    lc.globalCompositeOperation = 'destination-out';
    const s = cam.s / div;
    const v = cam.view();
    const spr = glowSprite('#ffffff', 128, 1.6);
    for (const l of this.lights) {
      const sx = (l.x - v.x) * s, sy = (l.y - v.y) * s, sr = l.r * s;
      if (sx + sr < 0 || sy + sr < 0 || sx - sr > w || sy - sr > h) continue;
      lc.globalAlpha = Math.min(1, l.a);
      lc.drawImage(spr, sx - sr, sy - sr, sr * 2, sr * 2);
    }
    lc.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.c, 0, 0, w * div, h * div);
    ctx.restore();
  }

  /** Coloured bloom in world space (camera transform already applied). */
  bloom(ctx: Ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      if (l.bloom <= 0) continue;
      glow(ctx, l.x, l.y, l.r * 0.55, l.c, l.a * l.bloom * 0.5);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

export const lighting = new Lighting();
