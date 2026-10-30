// The shade (POLISH_PLAN §12b, after Hollow Knight): falling leaves your silver where you fell, held by a dark
// echo of the hero. Strike it to win the silver back. Shades stack: each death leaves its own. They live in
// the save (`PhaserSave.shades`) and wait in their room until struck.
import Phaser from 'phaser';
import type { FoeLike } from './types';
import type { World } from '../scenes/World';

export interface ShadeSave { room: string; x: number; y: number; silver: number }

export class Shade implements FoeLike {
  /** Marks it apart from foes: it never blocks a shrine, raises the music or calls the Echoes. */
  readonly shade = true;
  alive = true;
  removed = false;
  box: Phaser.Geom.Rectangle;
  x: number;
  private body: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private wisps: Phaser.GameObjects.Particles.ParticleEmitter;
  private t = Math.random() * 6;

  constructor(private w: World, readonly save: ShadeSave) {
    this.x = save.x;
    this.box = new Phaser.Geom.Rectangle(save.x - 12, save.y - 46, 24, 46);
    const p = w.player.sprite;
    // A dark echo of the hero: the same figure, drained to shadow and edged in violet.
    this.body = w.add.image(save.x, save.y, p.texture.key, p.frame.name).setOrigin(p.originX, p.originY).setScale(p.scaleX, p.scaleY)
      .setTint(0x2c1a48).setTintMode(Phaser.TintModes.FILL).setAlpha(0.85).setDepth(8.9);
    this.glow = w.add.image(save.x, save.y - 24, 'glow').setTint(0x9a6af0).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0.6).setDepth(8.8);
    this.wisps = w.add.particles(0, 0, 'glow', { lifespan: 1200, frequency: 140, speedY: { min: -26, max: -10 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.06, end: 0 }, alpha: { start: 0.5, end: 0 }, tint: [0x6a3fb0, 0xb48cff], blendMode: 'ADD',
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-10, -40, 20, 36) } as unknown as Phaser.Types.GameObjects.Particles.EmitZoneData }).setDepth(8.85);
    this.wisps.setPosition(save.x, save.y);
  }

  /** It hovers where you fell, facing you, breathing. */
  update(dt: number) {
    if (this.removed) return;
    this.t += dt;
    const bob = Math.sin(this.t * 2.2) * 3, p = this.w.player;
    this.body.setY(this.save.y + bob - 4).setFlipX(p.x < this.save.x).setAlpha(0.8 + Math.sin(this.t * 3.1) * 0.08);
    this.glow.setY(this.save.y - 24 + bob).setAlpha(0.55 + Math.sin(this.t * 1.7) * 0.1);
    this.box.y = this.save.y - 46 + bob;
  }

  /** Any blow breaks it and the silver comes home. */
  hit() {
    if (!this.alive) return false;
    this.alive = false;
    this.w.recoverShade(this);
    this.w.spark(this.save.x, this.save.y - 24, 0xb48cff, 18);
    this.w.flashLight(this.save.x, this.save.y - 24, 110, '#c8a8ff', 0.4);
    this.w.playEffect('purify', { x: this.save.x, vol: 0.7 });
    this.w.tweens.add({ targets: [this.body, this.glow], alpha: 0, scaleX: '*=1.4', scaleY: '*=1.4', duration: 380, onComplete: () => this.remove() });
    this.wisps.explode(16, this.save.x, this.save.y - 20);
    return true;
  }

  remove() {
    if (this.removed) return;
    this.removed = true; this.alive = false;
    this.body.destroy(); this.glow.destroy(); this.wisps.destroy();
  }
}
