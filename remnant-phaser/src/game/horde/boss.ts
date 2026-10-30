// A stage's monarch: one of the Fallen Crowns' painted atlases (game/bosses.ts cuts their frames), seen from above.
// It walks the hero down and, in turn, charges along a marked line, looses rings of fire, slams marked ground and
// calls its brood. Below half its health it does all of it faster.
import Phaser from 'phaser';
import { bossScale } from '../bosses';
import { BOSS_NAMES, type BossId } from './defs';
import type { Horde } from '../../scenes/Horde';

const TEX: Record<BossId, [string, number]> = { beast_monarch: ['varkhos', 8], plague_monarch: ['morvane', 8], cinder_monarch: ['azkar', 4] };
type Move = 'charge' | 'volley' | 'slam' | 'summon';

export class HordeBoss {
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  readonly name: string;
  readonly title: string;
  /** Its body's radius, for blows and its touch. */
  readonly r = 26;
  alive = true;
  private img: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private mark: Phaser.GameObjects.Graphics;
  private state: 'walk' | 'wind' | Move = 'walk';
  private st = 0;
  private atkT = 2.2;
  private move: Move = 'charge';
  private dx = 0;
  private dy = 0;
  private slams: { x: number; y: number }[] = [];
  private flashT = 0;
  private animT = 0;
  private face = 1;
  private turn = 0;

  constructor(private h: Horde, readonly id: BossId, x: number, y: number, hp: number, private dmg: number) {
    this.x = x; this.y = y; this.maxHp = this.hp = hp;
    [this.name, this.title] = BOSS_NAMES[id];
    const [tex] = TEX[id];
    this.shadow = h.wl(h.add.image(x, y, 'hz-shadow').setScale(3.2, 2.6));
    this.img = h.wl(h.add.image(x, y, tex, `${id}-0`).setScale(bossScale(h, id) * 0.7));
    this.mark = h.wl(h.add.graphics().setDepth(-20000));
  }

  get phase2() { return this.hp < this.maxHp * 0.5; }

  update(dt: number) {
    if (!this.alive) return;
    const h = this.h, hx = h.hero.x, hy = h.hero.y;
    let dx = hx - this.x, dy = hy - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const tempo = this.phase2 ? 1.35 : 1;
    this.st += dt * tempo; this.animT += dt; this.flashT = Math.max(0, this.flashT - dt);
    this.mark.clear();
    if (this.state === 'walk') {
      this.x += dx * 34 * tempo * dt; this.y += dy * 34 * tempo * dt;
      this.face = dx >= 0 ? 1 : -1;
      this.atkT -= dt * tempo;
      if (this.atkT <= 0) {
        const order: Move[] = ['charge', 'volley', 'slam', 'charge', 'summon', 'slam'];
        this.move = order[this.turn++ % order.length];
        this.state = 'wind'; this.st = 0; this.dx = dx; this.dy = dy;
        this.slams = this.move === 'slam' ? [{ x: hx, y: hy }, { x: hx + h.hero.vx * 0.5, y: hy + h.hero.vy * 0.5 }, ...(this.phase2 ? [{ x: hx + (Math.random() - 0.5) * 120, y: hy + (Math.random() - 0.5) * 120 }] : [])] : [];
        h.sfx(this.move === 'charge' ? 'bossRoar' : 'monarchRoar', 0.5);
      }
    } else if (this.state === 'wind') {
      const wind = this.move === 'slam' ? 0.95 : this.move === 'charge' ? 0.8 : 0.55;
      if (this.move === 'charge') {
        // The marked lane: it keeps turning toward the hero until the last moment.
        if (this.st < wind * 0.6) { this.dx = dx; this.dy = dy; }
        const len = 300, w = 34;
        this.mark.fillStyle(0xff3030, 0.12 + (this.st / wind) * 0.2);
        this.mark.beginPath();
        const px = -this.dy * w / 2, py = this.dx * w / 2;
        this.mark.moveTo(this.x + px, this.y + py); this.mark.lineTo(this.x + px + this.dx * len, this.y + py + this.dy * len);
        this.mark.lineTo(this.x - px + this.dx * len, this.y - py + this.dy * len); this.mark.lineTo(this.x - px, this.y - py);
        this.mark.closePath(); this.mark.fillPath();
      } else if (this.move === 'slam') {
        for (const s of this.slams) {
          this.mark.fillStyle(0xff3030, 0.1 + (this.st / wind) * 0.25).fillEllipse(s.x, s.y, 120 * (this.st / wind), 96 * (this.st / wind));
          this.mark.lineStyle(2, 0xff6a50, 0.8).strokeEllipse(s.x, s.y, 120, 96);
        }
      }
      if (this.st >= wind) { this.state = this.move; this.st = 0; this.strike(); }
    } else if (this.state === 'charge') {
      this.x += this.dx * 330 * dt; this.y += this.dy * 330 * dt;
      this.face = this.dx >= 0 ? 1 : -1;
      if (this.st > 0.85) this.rest();
    } else if (this.st > 0.5) this.rest();
    // Its body hurts to touch, and a charge hurts more.
    if ((hx - this.x) ** 2 + (hy - this.y) ** 2 < (this.r + 10) ** 2) h.hurtHero(this.dmg * (this.state === 'charge' ? 1.6 : 1));
    const [tex, n] = TEX[this.id];
    const f = this.state === 'wind' ? Math.min(n - 1, 2) : this.state === 'walk' ? Math.floor(this.animT * 4) % 2 : Math.min(n - 1, 3);
    this.img.setTexture(tex, `${this.id}-${f}`).setPosition(Math.round(this.x), Math.round(this.y)).setFlipX(this.face < 0).setDepth(this.y);
    if (this.flashT > 0) this.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else if (this.phase2) this.img.setTint(0xffb0a0).setTintMode(Phaser.TintModes.MULTIPLY); else this.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.shadow.setPosition(this.x, this.y + 2).setDepth(-40000 + this.y * 0.001);
  }

  private strike() {
    const h = this.h;
    if (this.move === 'volley') {
      const n = this.phase2 ? 20 : 14, off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; h.swarm.shoot(this.x, this.y - 30, Math.cos(a), Math.sin(a), this.dmg * 0.6, 100); }
      if (this.phase2) h.time.delayedCall(350, () => { if (!this.alive) return; for (let i = 0; i < n; i++) { const a = off + ((i + 0.5) / n) * Math.PI * 2; h.swarm.shoot(this.x, this.y - 30, Math.cos(a), Math.sin(a), this.dmg * 0.6, 100); } });
      h.sfx('fireBurst', 0.6);
    } else if (this.move === 'slam') {
      for (const s of this.slams) {
        h.arsenal.boom('vfx-impacts', 12, 6, s.x, s.y, 0.4, 0.9);
        if (((h.hero.x - s.x) / 60) ** 2 + ((h.hero.y - s.y) / 48) ** 2 < 1) h.hurtHero(this.dmg * 1.4);
      }
      h.shake(0.01, 220); h.sfx('bossSlam', 0.7);
    } else if (this.move === 'summon') {
      const n = this.phase2 ? 8 : 6;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; h.spawnFoe(this.x + Math.cos(a) * 50, this.y + Math.sin(a) * 40); }
      h.arsenal.boom('vfx-status', 40, 8, this.x, this.y, 0.6, 1.2);
      h.sfx('summon', 0.6);
    } else if (this.move === 'charge') h.sfx('bossStomp', 0.6);
  }

  private rest() { this.state = 'walk'; this.st = 0; this.atkT = this.phase2 ? 1.3 : 2; this.mark.clear(); }

  /** A blow: true if it reached the monarch. */
  hit(dmg: number) {
    if (!this.alive) return false;
    this.hp -= dmg; this.flashT = 0.06;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  destroy() { this.img.destroy(); this.shadow.destroy(); this.mark.destroy(); }
}
