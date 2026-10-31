// The guide's trail of light: motes that rise off the hero and stream toward the objective (or the doorway that
// leads to it), like a swarm of scout-flies, then swirl over it once the hero is close. Pooled; nothing is made
// in the frame loop.
import Phaser from 'phaser';

const POOL = 30;
/** How often a mote leaves the hero, and how fast it flies. */
const EVERY = 0.07, SPEED = 165;

interface Mote { img: Phaser.GameObjects.Image; t: number; life: number; x: number; y: number; vx: number; vy: number; ph: number; swirl: boolean }

export class GuideTrail {
  private motes: Mote[] = [];
  private spawnT = 0;
  private swirlT = 0;
  /** True while the trail is showing (for the checks). */
  active = false;

  constructor(private sc: Phaser.Scene) {
    for (let i = 0; i < POOL; i++) {
      const img = sc.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(i % 3 ? 0xffd27a : 0xfff0c0).setDepth(12.6).setVisible(false);
      this.motes.push({ img, t: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, ph: 0, swirl: false });
    }
  }

  private free() { return this.motes.find((m) => m.t >= m.life); }

  /** Each frame: from the hero (hx, hy) toward the goal (gx, gy), or nothing when there is no goal. */
  update(dt: number, hx: number, hy: number, goal: { x: number; y: number } | null) {
    this.active = !!goal;
    if (goal) {
      const dx = goal.x - hx, dy = goal.y - hy, d = Math.hypot(dx, dy);
      if (d > 56) {
        // A stream from the hero: each mote leaves on a slight scatter and homes in on the goal.
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnT = EVERY;
          const m = this.free();
          if (m) {
            const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
            Object.assign(m, { t: 0, life: Math.min(2.2, 0.5 + d / SPEED), x: hx + (Math.random() - 0.5) * 10, y: hy + (Math.random() - 0.5) * 12, vx: Math.cos(a) * SPEED * 0.6, vy: Math.sin(a) * SPEED * 0.6 - 30, ph: Math.random() * 6.28, swirl: false });
          }
        }
      } else {
        // Arrived: a few motes circle over the goal.
        this.swirlT -= dt;
        if (this.swirlT <= 0) {
          this.swirlT = 0.22;
          const m = this.free();
          if (m) Object.assign(m, { t: 0, life: 1.4, x: goal.x, y: goal.y, vx: 0, vy: 0, ph: Math.random() * 6.28, swirl: true });
        }
      }
    }
    for (const m of this.motes) {
      if (m.t >= m.life) { if (m.img.visible) m.img.setVisible(false); continue; }
      m.t += dt;
      const u = m.t / m.life;
      let x: number, y: number;
      if (m.swirl && goal) {
        const a = m.ph + m.t * 3.4, r = 14 + u * 8;
        x = goal.x + Math.cos(a) * r; y = goal.y - 10 - u * 26 + Math.sin(a) * r * 0.35;
      } else {
        if (goal) {
          // Steer toward the goal, harder as the mote ages, with a weave across its path.
          const dx = goal.x - m.x, dy = goal.y - m.y, d = Math.max(1, Math.hypot(dx, dy)), k = 2.2 + u * 6;
          m.vx += ((dx / d) * SPEED - m.vx) * Math.min(1, k * dt);
          m.vy += ((dy / d) * SPEED - m.vy) * Math.min(1, k * dt);
          if (d < 10) m.t = Math.max(m.t, m.life - 0.12);
        }
        m.x += m.vx * dt; m.y += m.vy * dt;
        const w = Math.sin(m.ph + m.t * 9) * 3;
        x = m.x - (m.vy / SPEED) * w; y = m.y + (m.vx / SPEED) * w;
      }
      const a = Math.min(1, u * 6, (1 - u) * 4);
      m.img.setVisible(true).setPosition(x, y).setAlpha(a).setScale(0.15 + 0.08 * Math.sin(m.ph + m.t * 12) ** 2);
    }
  }

  hide() { this.active = false; for (const m of this.motes) { m.t = m.life; m.img.setVisible(false); } }
}
