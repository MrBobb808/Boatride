// Combat feedback without per-hit allocation: pooled damage numbers that stack
// instead of overlapping, pooled impact sparks, and the gold purification
// dissolve when a foe falls. Everything advances on the world's update, so it
// freezes with hit-stop and menus like the fight itself.
import Phaser from 'phaser';
import { settings } from '../classic/shim/settings';

const NUMBERS = 28;
type Kind = 'hit' | 'crit' | 'heal' | 'hurt' | 'note';
interface Num { t: Phaser.GameObjects.Text; life: number; max: number; x: number; y: number; vy: number; kind: Kind; scale: number; jitter: number }

const STYLE: Record<Kind, { size: number; life: number; rise: number }> = {
  hit: { size: 9, life: 0.62, rise: 30 },
  crit: { size: 12, life: 0.8, rise: 34 },
  heal: { size: 9, life: 0.9, rise: 18 },
  hurt: { size: 10, life: 0.7, rise: 24 },
  note: { size: 8, life: 1, rise: 16 },
};

/** Which look a number gets, from what the caller already passes (text and colour). */
function kindOf(text: string, color: string, crit: boolean): Kind {
  if (crit || color === '#ffd23a') return 'crit';
  if (text.startsWith('+')) return 'heal';
  // Only numbers are blows; a red message ("No Balm left") is a note, not a hit taken.
  if (!/^\d+$/.test(text)) return 'note';
  return /^#ff[6-9a]/i.test(color) ? 'hurt' : 'hit';
}

export class Feedback {
  private nums: Num[];
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private glows: { img: Phaser.GameObjects.Image; life: number }[];

  constructor(private sc: Phaser.Scene) {
    if (!sc.textures.exists('fb-dot')) {
      const t = sc.textures.createCanvas('fb-dot', 4, 4)!, c = t.getContext();
      c.fillStyle = '#ffffff'; c.fillRect(1, 0, 2, 4); c.fillRect(0, 1, 4, 2); t.refresh();
    }
    this.nums = Array.from({ length: NUMBERS }, () => ({
      t: sc.add.text(0, 0, '', { fontFamily: 'Cinzel, Georgia, serif', fontSize: '9px', color: '#ffe6a8', stroke: '#07050a', strokeThickness: 2, fontStyle: 'bold' })
        .setOrigin(0.5).setResolution(4).setDepth(20).setVisible(false),
      life: 0, max: 1, x: 0, y: 0, vy: 0, kind: 'hit' as Kind, scale: 1, jitter: 0,
    }));
    this.sparks = sc.add.particles(0, 0, 'fb-dot', { emitting: false, maxParticles: 120, lifespan: { min: 220, max: 420 }, speed: { min: 30, max: 120 }, angle: { min: 0, max: 360 }, scale: { start: 0.7, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD' }).setDepth(15);
    // Purification: gold motes lift out of the fallen foe.
    this.motes = sc.add.particles(0, 0, 'fb-dot', { emitting: false, maxParticles: 160, lifespan: { min: 600, max: 1000 }, speedX: { min: -14, max: 14 }, speedY: { min: -46, max: -16 }, gravityY: -12, scale: { start: 0.8, end: 0 }, alpha: { start: 0.95, end: 0 }, tint: [0xffe6a8, 0xfff6dc, 0xe8c27a], blendMode: 'ADD' }).setDepth(16);
    this.glows = Array.from({ length: 6 }, () => ({ img: sc.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(15).setVisible(false), life: 0 }));
  }

  /** A damage, heal or status number. New numbers near a fresh one step above it instead of covering it. */
  number(x: number, y: number, text: string, color: string, crit = false) {
    const kind = kindOf(text, color, crit), st = STYLE[kind];
    let slot = this.nums[0];
    for (const n of this.nums) if (n.life <= 0 || n.life < slot.life) { slot = n; if (n.life <= 0) break; }
    let stack = 0;
    // Step above every number still clearly visible near this spot (wide numbers need room too).
    for (const n of this.nums) if (n !== slot && n.life > n.max * 0.35 && Math.abs(n.x - x) < 22 && Math.abs(n.y - y) < 12 + stack * 9) stack++;
    slot.kind = kind; slot.x = x + (stack ? (stack % 2 ? 5 : -5) : 0); slot.y = y - Math.min(4, stack) * 9;
    slot.life = slot.max = st.life; slot.vy = -st.rise / st.life;
    slot.scale = kind === 'crit' ? 1.5 : 1; slot.jitter = kind === 'hurt' ? 2 : 0;
    slot.t.setText(kind === 'crit' ? text + '!' : text).setColor(color).setFontSize(st.size).setPosition(slot.x, slot.y).setAlpha(1).setScale(slot.scale).setVisible(true);
  }

  spark(x: number, y: number, color: number, n = 6) {
    if (settings.quality === 'low') n = Math.ceil(n / 2);
    this.sparks.setParticleTint(color);
    this.sparks.emitParticleAt(x, y, n);
  }

  /** The purification dissolve over a fallen foe's body; elites also leave a brief light. */
  dissolve(x: number, y: number, w: number, h: number, elite: boolean) {
    const n = Math.round((settings.quality === 'low' ? 6 : 14) * (elite ? 1.8 : 1) * Math.min(2, Math.max(0.7, h / 34)));
    for (let i = 0; i < n; i++) this.motes.emitParticleAt(x + (Math.random() - 0.5) * w, y - Math.random() * h, 1);
    if (!elite || settings.reduceFlashes) return;
    const g = this.glows.find((o) => o.life <= 0) ?? this.glows[0];
    g.life = 0.5;
    g.img.setPosition(x, y - h / 2).setDisplaySize(w * 3, h * 2).setTint(0xffe6a8).setAlpha(0.5).setVisible(true);
  }

  update(dt: number) {
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) { n.t.setVisible(false); continue; }
      const k = 1 - n.life / n.max;
      n.y += n.vy * dt * (1 - k * 0.6);
      // Crits pop large and settle; hurt numbers shiver briefly.
      const s = n.kind === 'crit' ? 1 + (n.scale - 1) * Math.max(0, 1 - k * 5) : 1;
      const jx = n.jitter && k < 0.25 ? (Math.random() - 0.5) * n.jitter : 0;
      n.t.setPosition(n.x + jx, n.y).setScale(s).setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
    for (const g of this.glows) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) g.img.setVisible(false); else g.img.setAlpha(g.life);
    }
  }

  /** Room exit: nothing in flight survives into the next room. */
  clear() {
    for (const n of this.nums) { n.life = 0; n.t.setVisible(false); }
    for (const g of this.glows) { g.life = 0; g.img.setVisible(false); }
    this.sparks.killAll(); this.motes.killAll();
  }

  destroy() {
    for (const n of this.nums) n.t.destroy();
    for (const g of this.glows) g.img.destroy();
    this.sparks.destroy(); this.motes.destroy();
  }
}
