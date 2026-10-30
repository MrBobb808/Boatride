// What the fallen leave: XP gems (blue, green, red by worth), silver, the odd heart, and an elite's chest. They wait
// on the ground until the hero comes near, then fly to them.
import Phaser from 'phaser';
import type { Horde } from '../../scenes/Horde';

export type DropKind = 'gem' | 'coin' | 'heart' | 'chest';
interface Drop { img: Phaser.GameObjects.Image; kind: DropKind; x: number; y: number; v: number; t: number; pull: boolean; alive: boolean }

const MAX = 320;

export class Pickups {
  private list: Drop[] = [];
  private live = 0;

  constructor(private h: Horde) {
    for (let i = 0; i < MAX; i++) this.list.push({ img: h.wl(h.add.image(0, 0, 'hz-gem-0').setVisible(false)), kind: 'gem', x: 0, y: 0, v: 0, t: 0, pull: false, alive: false });
  }

  drop(kind: DropKind, x: number, y: number, v: number) {
    let d = this.list.find((o) => !o.alive);
    if (!d) {
      // Full: a new gem's worth joins the nearest gem already lying there.
      if (kind !== 'gem') return;
      let best: Drop | null = null, bd = Infinity;
      for (const o of this.list) if (o.kind === 'gem') { const dd = (o.x - x) ** 2 + (o.y - y) ** 2; if (dd < bd) { bd = dd; best = o; } }
      if (best) { best.v += v; this.look(best); }
      return;
    }
    d.kind = kind; d.x = x + (Math.random() - 0.5) * 6; d.y = y + (Math.random() - 0.5) * 6; d.v = v; d.t = 0; d.pull = false; d.alive = true;
    d.img.setVisible(true).setScale(1).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
    this.look(d);
    this.live++;
  }

  private look(d: Drop) {
    const tex = d.kind === 'gem' ? `hz-gem-${d.v >= 8 ? 2 : d.v >= 3 ? 1 : 0}` : d.kind === 'coin' ? 'hz-coin' : d.kind === 'heart' ? 'hz-heart' : 'hz-chest';
    d.img.setTexture(tex).setOrigin(0.5, 1);
  }

  /** Every gem on the field flies home (a stage cleared). */
  gather() { for (const d of this.list) if (d.alive && d.kind !== 'chest') d.pull = true; }

  clear() { for (const d of this.list) { d.alive = false; d.img.setVisible(false); } this.live = 0; }

  update(dt: number, hx: number, hy: number, reach: number) {
    if (!this.live) return;
    const r2 = reach * reach;
    for (const d of this.list) {
      if (!d.alive) continue;
      d.t += dt;
      const dx = hx - d.x, dy = hy - 8 - d.y, dist2 = dx * dx + dy * dy;
      if (!d.pull && dist2 < (d.kind === 'chest' ? 400 : r2)) d.pull = true;
      if (d.pull) {
        const dist = Math.sqrt(dist2) || 1, sp = 190 + 320 * Math.min(1, 50 / dist);
        d.x += (dx / dist) * sp * dt; d.y += (dy / dist) * sp * dt;
        if (dist < 10) { this.h.collect(d.kind, d.v); d.alive = false; d.img.setVisible(false); this.live--; continue; }
      }
      // Gems bob a little where they lie.
      const bob = d.kind === 'gem' && !d.pull ? Math.round(Math.sin(d.t * 4 + d.x) * 1.2) : 0;
      d.img.setPosition(Math.round(d.x), Math.round(d.y) + bob).setDepth(d.pull ? d.y + 50 : -35000 + d.y * 0.001);
    }
  }
}
