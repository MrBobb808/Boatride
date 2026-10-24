// A small animated flame (torches, braziers, candles), in its own module so the
// NPCs and the Phaser build can draw it without loading the environment.
import { glow, poly, type Ctx } from './draw';

export function flame(ctx: Ctx, x: number, y: number, s: number, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y - s * 0.4, s * 2.2, '#ff8a2a', 0.55);
  const w = Math.sin(t * 17) * s * 0.15;
  poly(ctx, [x - s * 0.45, y, x - s * 0.2 + w, y - s * 0.9, x + w * 1.5, y - s * 1.5, x + s * 0.25 + w, y - s * 0.8, x + s * 0.45, y], 'rgba(255,140,50,0.85)');
  poly(ctx, [x - s * 0.22, y, x + w * 0.8, y - s * 0.9, x + s * 0.22, y], 'rgba(255,240,190,0.95)');
  ctx.globalCompositeOperation = 'source-over';
}
