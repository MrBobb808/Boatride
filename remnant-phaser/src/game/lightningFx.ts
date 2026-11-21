// Barak's lightning, drawn live: jagged arcs that re-strike every frame they last (so they crackle rather than sit
// still), a wide pale glow under a white core, and short forks breaking off. Every arc comes from a fixed pool and is
// redrawn into one Graphics, so nothing is made while the fight runs.
import Phaser from 'phaser';
import { settings } from '../classic/shim/settings';

interface Arc { x0: number; y0: number; x1: number; y1: number; t: number; life: number; width: number; color: number; forks: number }
const POOL = 28;

export class LightningFx {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly arcs: Arc[] = [];
  private live = 0;

  constructor(sc: Phaser.Scene, depth = 13) {
    this.g = sc.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < POOL; i++) this.arcs.push({ x0: 0, y0: 0, x1: 0, y1: 0, t: -1, life: 0, width: 0, color: 0, forks: 0 });
  }

  /** An arc from (x0, y0) to (x1, y1) for `life` seconds. A full pool gives the oldest arc away. */
  zap(x0: number, y0: number, x1: number, y1: number, o: { life?: number; width?: number; color?: number; forks?: number } = {}) {
    let a = this.arcs.find((r) => r.t < 0);
    if (!a) { a = this.arcs[0]; for (const r of this.arcs) if (r.t / r.life > a.t / a.life) a = r; }
    a.x0 = x0; a.y0 = y0; a.x1 = x1; a.y1 = y1; a.t = 0;
    a.life = o.life ?? 0.22; a.width = o.width ?? 2; a.color = o.color ?? 0x8fdcff; a.forks = settings.reduceFlashes ? 0 : o.forks ?? 1;
    this.live++;
  }

  step(dt: number) {
    const g = this.g;
    if (!this.live) return;
    g.clear();
    this.live = 0;
    for (const a of this.arcs) {
      if (a.t < 0) continue;
      a.t += dt;
      if (a.t >= a.life) { a.t = -1; continue; }
      this.live++;
      const u = a.t / a.life;
      // It strikes at full strength and thins away; with Reduce flashes it fades without flickering.
      const flick = settings.reduceFlashes ? 1 : 0.65 + 0.35 * Math.random();
      const fade = (1 - u * u) * flick * (settings.reduceFlashes ? 0.6 : 1);
      this.bolt(a.x0, a.y0, a.x1, a.y1, a.width * 2.6, a.color, 0.28 * fade, 7);
      this.bolt(a.x0, a.y0, a.x1, a.y1, a.width, 0xf2ffff, fade, 7);
      for (let f = 0; f < a.forks; f++) {
        // A fork leaves from somewhere along the arc and dies out to one side.
        const k = 0.25 + Math.random() * 0.5, sx = a.x0 + (a.x1 - a.x0) * k, sy = a.y0 + (a.y1 - a.y0) * k;
        const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0) * (0.2 + Math.random() * 0.2), ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
        this.bolt(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, Math.max(1, a.width * 0.5), a.color, 0.8 * fade, 4);
      }
    }
    if (!this.live) g.clear();
  }

  /** One jagged stroke, its kinks worked out as it is drawn. */
  private bolt(x0: number, y0: number, x1: number, y1: number, width: number, color: number, alpha: number, n: number) {
    const g = this.g, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, jag = Math.min(16, l * 0.18);
    g.lineStyle(width, color, alpha).beginPath().moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const j = (Math.random() - 0.5) * jag; g.lineTo(x0 + dx * (i / n) + nx * j, y0 + dy * (i / n) + ny * j); }
    g.lineTo(x1, y1).strokePath();
  }

  /** How many arcs are crackling now (for the checks). */
  get count() { return this.live; }

  destroy() { this.g.destroy(); }
}
