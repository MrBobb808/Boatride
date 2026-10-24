// Elior in Phaser: an Arcade body (12×34, feet at its bottom) with his PNG
// sheet drawn over it. Movement numbers come from the original game
// (remnant/src/game/player.ts): run 142, jump 430, gravity 1500, max fall 560,
// coyote 0.1 s, jump buffer 0.16 s, shorter hops when jump is let go.

import Phaser from 'phaser';
import { T, TILE } from '../shared';
import { maxHpAt, powerAt } from './save';
import type { WorldApi } from './types';

export const GRAV = 1500;
const MAX_FALL = 560;
const RUN = 142;
const JUMP_V = 430;
const COYOTE = 0.1;
const BUFFER = 0.16;
const DODGE_V = 300;
const DODGE_T = 0.32;
/** The three-hit chain: duration, when the blade lands (fraction), damage scale, knockback. */
const COMBO = [
  { t: 0.3, hit: [0.42, 0.68], dmg: 1, force: 0.8 },
  { t: 0.3, hit: [0.42, 0.68], dmg: 1.1, force: 0.9 },
  { t: 0.42, hit: [0.48, 0.74], dmg: 1.6, force: 1.6 },
] as const;
const AIR = { t: 0.3, hit: [0.3, 0.7], dmg: 0.9, force: 0.7 } as const;

/** Sheet frames (4×4, 128 px): idle 0–3, run 4–7, rise 8, fall 9, wind-up 10, strike 11, dodge 12–13, hurt 14, cast 15. */
const FRAME = 128, FOOT = 120, DRAW = 56;

type State = 'free' | 'attack' | 'dodge' | 'hurt' | 'dead';

export class Player {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Sprite;
  slash: Phaser.GameObjects.Image;
  state: State = 'free';
  face = 1;
  hp: number;
  maxHp: number;
  private st = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private combo = 0;
  private queued = false;
  private hitDone = new Set<object>();
  private invuln = 0;
  private dodgeCd = 0;
  /** While positive, one-way platforms let Elior drop through. */
  dropT = 0;
  private stride = 0;
  private atk: { t: number; hit: readonly number[]; dmg: number; force: number } = COMBO[0];

  constructor(private w: WorldApi, x: number, feet: number, face = 1) {
    const sc = w.sc;
    this.rect = sc.add.rectangle(x, feet - 17, 12, 34, 0xffffff, 0);
    sc.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setGravityY(GRAV).setMaxVelocityY(MAX_FALL);
    this.body.setCollideWorldBounds(true);
    this.sprite = sc.add.sprite(x, feet, 'elior', 0).setOrigin(0.5, FOOT / FRAME).setScale(DRAW / FRAME).setDepth(10);
    this.slash = sc.add.image(x, feet, 'slash').setDepth(11).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.maxHp = maxHpAt(w.save.level);
    this.hp = w.save.hp > 0 ? Math.min(w.save.hp, this.maxHp) : this.maxHp;
    this.face = face;
  }

  get x() { return this.body.center.x; }
  get feet() { return this.body.bottom; }
  get y() { return this.body.center.y; }
  get dead() { return this.state === 'dead'; }
  get onGround() { return this.body.blocked.down || this.body.touching.down; }
  get vulnerable() { return this.invuln <= 0 && this.state !== 'dead' && !(this.state === 'dodge' && this.st < DODGE_T - 0.04); }

  placeAt(x: number, feet: number, face = this.face) {
    this.body.reset(x, feet - 17);
    this.face = face;
    this.state = 'free';
  }

  /** Spikes and the Veil: a tile hazard under or inside the body. */
  private hazard() {
    const b = this.body;
    const tx0 = Math.floor((b.left + 2) / TILE), tx1 = Math.floor((b.right - 2) / TILE);
    for (let ty = Math.floor(b.top / TILE); ty <= Math.floor((b.bottom - 1) / TILE); ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.w.tileAt(tx, ty);
        if (t === T.Spikes || t === T.Veil) return t;
      }
    return 0;
  }

  update(dt: number) {
    const c = this.w.controls, b = this.body;
    this.st += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuf = c.pressed('jump') ? BUFFER : Math.max(0, this.jumpBuf - dt);

    if (this.state === 'dead') { b.setVelocityX(b.velocity.x * 0.9); this.draw(); return; }

    // Short hops: letting go of jump on the way up pulls Elior down sooner.
    b.setGravityY(this.state === 'attack' && !this.onGround ? GRAV * 0.35 : b.velocity.y < 0 && !c.down('jump') ? GRAV * 1.9 : GRAV);

    if (this.state === 'free') {
      const ax = c.axis;
      const target = ax * RUN;
      const accel = this.onGround ? 1400 : 900;
      b.setVelocityX(Phaser.Math.Linear(b.velocity.x, target, Math.min(1, (accel * dt) / RUN)));
      if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
      if (this.jumpBuf > 0 && c.down('down') && this.onGround && this.standingOnOneWay()) {
        this.dropT = 0.25;
        this.jumpBuf = 0;
      } else if (this.jumpBuf > 0 && this.coyote > 0) {
        b.setVelocityY(-JUMP_V);
        this.jumpBuf = 0;
        this.coyote = 0;
      }
      if (c.pressed('attack')) this.startAttack(0);
      else if (c.pressed('dodge') && this.dodgeCd <= 0) this.startDodge();
    } else if (this.state === 'attack') {
      const u = this.st / this.atk.t;
      // Planted on the ground; a small lunge into the blow.
      if (this.onGround) b.setVelocityX(u < this.atk.hit[0] ? this.face * 40 : b.velocity.x * 0.8);
      if (c.pressed('attack')) this.queued = true;
      if (c.pressed('dodge') && this.dodgeCd <= 0 && u > this.atk.hit[1]) { this.startDodge(); this.draw(); return; }
      if (u >= this.atk.hit[0] && u <= this.atk.hit[1]) this.strike();
      if (u >= 1) {
        if (this.queued && this.atk !== AIR && this.combo < 2) this.startAttack(this.combo + 1);
        else this.toFree();
      }
    } else if (this.state === 'dodge') {
      b.setVelocityX(this.face * DODGE_V * (1 - (this.st / DODGE_T) * 0.5));
      if (this.st >= DODGE_T) this.toFree();
    } else if (this.state === 'hurt') {
      b.setVelocityX(b.velocity.x * 0.88);
      if (this.st >= 0.3) this.toFree();
    }

    const hz = this.hazard();
    if (hz && this.vulnerable) {
      this.hurt(hz === T.Spikes ? 18 : 10, -this.face);
      if (hz === T.Spikes) b.setVelocityY(-260);
    }
    this.draw(dt);
  }

  private standingOnOneWay() {
    const ty = Math.floor((this.body.bottom + 1) / TILE);
    return this.w.tileAt(Math.floor(this.x / TILE), ty) === T.OneWay;
  }

  private toFree() {
    this.state = 'free';
    this.st = 0;
    this.slash.setVisible(false);
  }

  private startAttack(n: number) {
    this.atk = this.onGround ? COMBO[n] : AIR;
    this.combo = this.onGround ? n : 0;
    this.state = 'attack';
    this.st = 0;
    this.queued = false;
    this.hitDone.clear();
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
    if (!this.onGround && this.body.velocity.y > 0) this.body.setVelocityY(this.body.velocity.y * 0.4);
  }

  private startDodge() {
    this.state = 'dodge';
    this.st = 0;
    this.dodgeCd = 0.45;
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
    this.slash.setVisible(false);
  }

  /** The blade's reach this frame, in front of Elior. */
  private blade() {
    const reach = this.atk === AIR ? 34 : this.combo === 2 ? 40 : 34;
    const x = this.face > 0 ? this.x : this.x - reach;
    return new Phaser.Geom.Rectangle(x, this.body.top - 4, reach, 40);
  }

  private strike() {
    const box = this.blade();
    for (const f of this.w.foes()) {
      if (!f.alive || this.hitDone.has(f) || !Phaser.Geom.Rectangle.Overlaps(box, f.box)) continue;
      this.hitDone.add(f);
      const dmg = Math.round(powerAt(this.w.save.level) * this.atk.dmg * Phaser.Math.FloatBetween(0.92, 1.08));
      if (f.hit(dmg, this.face, this.atk.force)) this.w.hitstop(this.combo === 2 ? 0.07 : 0.04);
    }
  }

  /** Take a blow; returns false if it did not land (dodging, invulnerable, dead). */
  hurt(dmg: number, dir: number) {
    if (!this.vulnerable) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.w.floatText(this.x, this.body.top - 6, String(dmg), '#ff6a6a');
    this.w.shake(0.006, 140);
    this.invuln = 0.9;
    this.slash.setVisible(false);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.st = 0;
      this.body.setVelocity(dir * 120, -200);
      return true;
    }
    this.state = 'hurt';
    this.st = 0;
    this.body.setVelocity(dir * 170, -170);
    return true;
  }

  heal() {
    this.maxHp = maxHpAt(this.w.save.level);
    this.hp = this.maxHp;
  }

  /** Pick the sheet frame and place the sprite and blade arc on the body. */
  private draw(dt = 0) {
    const b = this.body;
    let f = 0;
    const vx = Math.abs(b.velocity.x);
    if (this.state === 'dead' || this.state === 'hurt') f = 14;
    else if (this.state === 'dodge') f = this.st < 0.13 ? 12 : 13;
    else if (this.state === 'attack') f = this.st / this.atk.t < this.atk.hit[0] ? 10 : 11;
    else if (!this.onGround) f = b.velocity.y < 0 ? 8 : 9;
    else if (vx > 24) { this.stride += dt * (vx / RUN) * 11; f = 4 + (Math.floor(this.stride) % 4); }
    else f = Math.floor(this.w.sc.time.now / 1000 * 3.8) % 4;
    this.sprite.setFrame(f);
    this.sprite.setFlipX(this.face < 0);
    this.sprite.setPosition(Math.round(b.center.x), Math.round(b.bottom));
    // Blink while invulnerable after a blow.
    this.sprite.setAlpha(this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 20) % 2 === 0 ? 0.35 : 1);
    if (this.state === 'dead') this.sprite.setAngle(this.face * -Math.min(80, this.st * 300));
    else this.sprite.setAngle(0);
    // The blade's arc shows from the moment it lands until the swing ends.
    const u = this.state === 'attack' ? this.st / this.atk.t : 0;
    const show = this.state === 'attack' && u >= this.atk.hit[0] && u <= this.atk.hit[1] + 0.15;
    this.slash.setVisible(show);
    if (show) {
      const k = (u - this.atk.hit[0]) / (this.atk.hit[1] + 0.15 - this.atk.hit[0]);
      this.slash.setPosition(b.center.x + this.face * 20, b.center.y - 2)
        .setFlipX(this.face < 0)
        .setScale(this.combo === 2 ? 1.25 : 1, 1)
        .setAngle(this.face * (this.combo === 1 ? 20 : -10))
        .setAlpha(1 - k);
    }
  }
}
