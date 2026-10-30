// Uri's summoned ally: a great orc shaman, a cleansed battle-imprint like the Echoes, who walks at his shoulder
// while he fights and chants on its own: hail of fire on the horde, a war-cry that slows it, and a burning ward
// around Uri. In the Crown of Flame the two are one, and the shaman steps into him.
import Phaser from 'phaser';
import { actionFrame, ACTION_FOOT, ACTION_CELL } from '../actionArt';
import { shamanAtlas } from './uriArt';
import type { Horde } from '../../scenes/Horde';

export class Shaman {
  x = 0;
  y = 0;
  private face = 1;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private key: string;
  private on = false;
  private loopT = 0;
  private shot: { clip: string; t: number; dur: number } | null = null;
  private hailT = 1.5;
  private cryT = 6;
  private wardT = 4;
  /** Seconds the burning ward has left. */
  ward = 0;
  private wardTick = 0;

  constructor(private h: Horde) {
    this.key = shamanAtlas(h);
    this.shadow = h.wl(h.add.image(0, 0, 'hz-shadow').setScale(1.3, 1.2).setVisible(false));
    this.sprite = h.wl(h.add.sprite(0, 0, this.key, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setVisible(false));
  }

  get active() { return this.on; }

  /** Called to Uri's side (a flare where it forms), or sent away. */
  show(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.sprite.setVisible(on); this.shadow.setVisible(on);
    if (!on) { this.ward = 0; return; }
    const hero = this.h.hero;
    this.x = hero.x - hero.face * 28; this.y = hero.y - 4;
    this.h.arsenal.boom('vfx-status', 0, 8, this.x, this.y + 4, 0.5, 0.7);
  }

  update(dt: number) {
    if (!this.on) return;
    const h = this.h, hero = h.hero;
    // It keeps to Uri's back shoulder.
    const tx = hero.x - hero.face * 28, ty = hero.y - 4, dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    const k = Math.min(1, dt * (d > 80 ? 10 : 5));
    this.x += dx * k; this.y += dy * k;
    if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
    if (!this.shot && h.boss) this.face = h.boss.x > this.x ? 1 : -1;
    this.loopT += dt;
    // Its chants, each on its own clock (Haste quickens them).
    this.hailT -= dt; this.cryT -= dt; this.wardT -= dt;
    if (this.hailT <= 0) { this.hailT = 3.2 * h.cdMult; this.hail(); }
    if (this.cryT <= 0) { this.cryT = 9 * h.cdMult; this.warCry(); }
    if (this.wardT <= 0) { this.wardT = 8 * h.cdMult; this.ward = 3; this.play('cast', 0.42); h.sfx('flame', 0.5); }
    if (this.ward > 0) {
      this.ward -= dt; this.wardTick -= dt;
      if (this.wardTick <= 0) { this.wardTick = 0.4; h.arsenal.ring(hero.x, hero.y, 46 * h.areaMult, 6); }
    }
    let clip = d > 6 ? 'run' : 'idle', u = (this.loopT % (clip === 'run' ? 0.62 : 1.6)) / (clip === 'run' ? 0.62 : 1.6);
    if (this.shot) {
      this.shot.t += dt;
      if (this.shot.t >= this.shot.dur) this.shot = null; else { clip = this.shot.clip; u = this.shot.t / this.shot.dur; }
    }
    this.sprite.setTexture(this.key, actionFrame(h, this.key, clip, u)).setFlipX(this.face < 0).setPosition(Math.round(this.x), Math.round(this.y)).setDepth(this.y);
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y) + 1).setDepth(-40000 + this.y * 0.001);
  }

  private play(clip: string, dur: number) { this.shot = { clip, t: 0, dur }; }

  /** Hail of fire: three strikes on foes near Uri. */
  private hail() {
    const h = this.h, picks = h.arsenal.targets(220, 3);
    if (!picks.length) return;
    this.play('invoke', 0.5);
    picks.forEach((p, i) => h.time.delayedCall(80 + i * 140, () => h.arsenal.firefall(p.x, p.y, 26 * h.areaMult, 16)));
  }

  /** The war-cry: the horde around Uri falters. */
  private warCry() {
    const h = this.h, hero = h.hero, r = 120 * h.areaMult;
    this.play('invoke', 0.6);
    h.arsenal.boom('vfx-impacts', 18, 6, this.x, this.y - 20, 0.45, 1.3, 0xff9a50);
    h.swarm.near(hero.x, hero.y, r, (f) => { f.slowT = Math.max(f.slowT, 2.5); f.slowK = Math.min(f.slowK, 0.45); });
    h.sfx('roar', 0.6); h.shake(0.004, 160);
  }

  destroy() { this.sprite.destroy(); this.shadow.destroy(); }
}
