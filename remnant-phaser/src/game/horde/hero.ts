// The hero seen from above: the same baked fighter atlases as the story (game/actionArt.ts), turned to face the way
// they move, with a shadow, a dash trail and the one-shot clips the auto-weapons play.
import Phaser from 'phaser';
import { actionAtlas, actionFrame, ACTION_FOOT, ACTION_CELL } from '../actionArt';
import type { WeaponFamily } from '../../../../remnant/src/game/data';
import type { HeroId } from './defs';
import { uriAtlas, crownAtlas } from './uriArt';

const LOOP: Record<string, number> = { idle: 1.6, run: 0.62 };

export class HordeHero {
  x = 0;
  y = 0;
  /** Its velocity, which the monarch reads to aim ahead. */
  vx = 0;
  vy = 0;
  face = 1;
  hero: HeroId = 'elior';
  /** In the Shadow Mantle (Elior) or the Wings of Dawn (Tirzah). */
  form = false;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private wings: Phaser.GameObjects.Image;
  private trail: { img: Phaser.GameObjects.Image; life: number }[] = [];
  private trailT = 0;
  private loopT = 0;
  private moving = false;
  /** A one-shot clip in play over the run or idle loop. */
  private shot: { clip: string; t: number; dur: number } | null = null;
  private keys: Record<string, string> = {};
  hurtT = 0;

  constructor(private sc: Phaser.Scene, wl: <T extends Phaser.GameObjects.GameObject>(o: T) => T, family: WeaponFamily) {
    // Both heroes, in and out of their forms, are baked before the first stage so a switch never hitches.
    this.keys.elior = actionAtlas(sc, 'elior', family);
    this.keys.tirzah = actionAtlas(sc, 'tirzah', 'blade');
    this.keys['elior-form'] = actionAtlas(sc, 'elior', family, true);
    this.keys['tirzah-form'] = actionAtlas(sc, 'tirzah', 'blade', true);
    // Uri and his Crown of Flame are painted, not cut from parts (game/horde/uriArt.ts).
    this.keys.uri = uriAtlas(sc);
    this.keys['uri-form'] = crownAtlas(sc);
    this.shadow = wl(sc.add.image(0, 0, 'hz-shadow').setScale(0.9, 1));
    this.wings = wl(sc.add.image(0, 0, 'vfx-transform', 27).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setScale(0.62));
    for (let i = 0; i < 5; i++) this.trail.push({ img: wl(sc.add.image(0, 0, this.keys.elior, 'idle:0').setVisible(false).setTint(0xb48cff).setTintMode(Phaser.TintModes.FILL)), life: 0 });
    this.sprite = wl(sc.add.sprite(0, 0, this.keys.elior, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.82));
  }

  get key() { return this.keys[this.hero + (this.form ? '-form' : '')]; }

  /** Play a one-shot clip (a swing, a loosed arrow) over the movement loop. */
  play(clip: string, dur: number) { this.shot = { clip, t: 0, dur }; }

  /** Turn toward a target the weapon chose. */
  look(dx: number) { if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1; }

  update(dt: number, mx: number, my: number, dashing: boolean, invuln: boolean) {
    this.moving = Math.abs(mx) + Math.abs(my) > 0.05;
    if (this.moving && !this.shot && Math.abs(mx) > 0.05) this.face = mx > 0 ? 1 : -1;
    this.loopT += dt;
    let clip = this.moving ? 'run' : 'idle', u = (this.loopT % LOOP[clip]) / LOOP[clip];
    if (this.shot) {
      this.shot.t += dt;
      if (this.shot.t >= this.shot.dur) this.shot = null;
      else { clip = this.shot.clip; u = this.shot.t / this.shot.dur; }
    }
    if (dashing) clip = this.hero === 'elior' ? 'dash' : 'roll', u = 0.5;
    const key = this.key;
    // The painted figures are drawn at one pixel per unit and smaller than the fighters' atlases.
    this.sprite.setTexture(key, actionFrame(this.sc, key, clip, u)).setScale(this.hero === 'uri' ? 1.05 : 0.82).setFlipX(this.face < 0).setPosition(Math.round(this.x), Math.round(this.y)).setDepth(this.y);
    // A hurt flash, then a flicker while the blow's grace lasts.
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hurtT > 0.12) this.sprite.setTint(0xff5a5a).setTintMode(Phaser.TintModes.FILL); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.sprite.setAlpha(invuln && !dashing ? (Math.floor(this.sc.time.now / 70) % 2 ? 0.45 : 1) : 1);
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y) + 1).setDepth(-40000 + this.y * 0.001);
    this.wings.setVisible(this.form && this.hero === 'tirzah');
    if (this.wings.visible) this.wings.setPosition(this.x - this.face * 2, this.y - 26 + Math.sin(this.loopT * 3) * 1.5).setDepth(this.y - 0.5).setAlpha(0.75);
    // The dash leaves fading copies behind.
    this.trailT -= dt;
    if (dashing && this.trailT <= 0) {
      const g = this.trail.find((t) => t.life <= 0);
      if (g) { g.life = 0.22; g.img.setTexture(key, this.sprite.frame.name).setOrigin(this.sprite.originX, this.sprite.originY).setScale(this.sprite.scaleX).setFlipX(this.face < 0).setPosition(this.sprite.x, this.sprite.y).setDepth(this.y - 1).setTint(this.hero === 'tirzah' ? 0xffe6a8 : 0xb48cff).setTintMode(Phaser.TintModes.FILL); }
      this.trailT = 0.04;
    }
    for (const t of this.trail) { t.life -= dt; t.img.setVisible(t.life > 0).setAlpha(Math.max(0, t.life / 0.22) * 0.55); }
  }
}
