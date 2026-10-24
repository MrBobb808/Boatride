// Elior in Phaser: an Arcade body (12×34, feet at its bottom) with his PNG
// sheet drawn over it. Movement numbers come from the original game
// (remnant/src/game/player.ts): run 142, jump 430, gravity 1500, max fall 560,
// coyote 0.1 s, jump buffer 0.16 s, shorter hops when jump is let go.
// Combat follows it too: a three-hit chain, an air strike, a heavy blow
// charged by holding attack (or heavy) through three levels, a parry with a
// counter window, blocking, a dodge with invulnerability, Balm and skills.

import Phaser from 'phaser';
import { T, TILE } from '../shared';
import { sovereignDamage } from '../../../remnant/src/game/balance';
import { SKILLS, SLOTS, castSkill, type SkillId } from './abilities';
import type { WorldApi, Blow } from './types';

export const GRAV = 1500;
const MAX_FALL = 560;
const RUN = 142;
const JUMP_V = 430;
const COYOTE = 0.1;
const BUFFER = 0.16;
const DODGE_V = 300;
const DODGE_T = 0.32;
/** Covenant Energy: the original's regeneration, gain per landed blow and per perfect parry. */
const CE_REGEN = 2.6, CE_HIT = 2.4, CE_PARRY = 5;

interface Swing { t: number; hit: readonly number[]; dmg: number; force: number; reach: number; heavy?: boolean }
/** The three-hit chain: duration, when the blade lands (fraction), damage scale, knockback, reach. */
const COMBO: Swing[] = [
  { t: 0.3, hit: [0.42, 0.68], dmg: 1, force: 0.8, reach: 34 },
  { t: 0.3, hit: [0.42, 0.68], dmg: 1.1, force: 0.9, reach: 34 },
  { t: 0.42, hit: [0.48, 0.74], dmg: 1.6, force: 1.6, reach: 40 },
];
const AIR: Swing = { t: 0.3, hit: [0.3, 0.7], dmg: 0.9, force: 0.7, reach: 34 };
const HEAVY: Swing = { t: 0.46, hit: [0.42, 0.7], dmg: 2.2, force: 2.4, reach: 44, heavy: true };
/** Charge levels: the hold needed, and the original's damage and poise scales. */
const CHARGE_AT = [0, 0.35, 0.85];
const CHARGE_MULT = [1, 1.35, 1.8];

/** Sheet frames (4×4, 128 px): idle 0–3, run 4–7, rise 8, fall 9, wind-up 10, strike 11, dodge 12–13, hurt 14, cast 15. */
const FRAME = 128, FOOT = 120, DRAW = 56;

type State = 'free' | 'attack' | 'charge' | 'parry' | 'block' | 'heal' | 'cast' | 'dodge' | 'hurt' | 'dead';

export class Player {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Sprite;
  slash: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Graphics;
  state: State = 'free';
  face = 1;
  hp: number;
  maxHp: number;
  maxCe: number;
  /** Shield of Faith: while positive, every blow is blocked. */
  shieldT = 0;
  /** After a perfect parry, the next blow is a counter: certain to be critical, and harder. */
  counterT = 0;
  /** Skill cooldowns, seconds left. */
  cds: Record<SkillId, number> = { sword_word: 0, trumpet: 0, shield_faith: 0 };
  chargeLvl = 0;
  private st = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private combo = 0;
  private queued = false;
  private hitDone = new Set<object>();
  private invuln = 0;
  private dodgeCd = 0;
  private parryT = 0;
  private parryCd = 0;
  private healDone = false;
  private castId: SkillId | null = null;
  /** Arriving from a swap with an Echo: the next blow within this time lands half again harder. */
  swapStrikeT = 0;
  /** While positive, one-way platforms let Elior drop through. */
  dropT = 0;
  private stride = 0;
  private atk: Swing = COMBO[0];
  private atkMult = 1;
  /** Which button the charge is held on (released to swing). */
  private chargeKey: 'attack' | 'heavy' = 'attack';

  constructor(private w: WorldApi, x: number, feet: number, face = 1) {
    const sc = w.sc;
    this.rect = sc.add.rectangle(x, feet - 17, 12, 34, 0xffffff, 0);
    sc.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setGravityY(GRAV).setMaxVelocityY(MAX_FALL);
    this.body.setCollideWorldBounds(true);
    this.sprite = sc.add.sprite(x, feet, 'elior', 0).setOrigin(0.5, FOOT / FRAME).setScale(DRAW / FRAME).setDepth(10);
    this.slash = sc.add.image(x, feet, 'slash').setDepth(11).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.aura = sc.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    this.maxHp = w.d.maxHp;
    this.maxCe = w.d.maxCe;
    this.hp = w.save.hp > 0 ? Math.min(w.save.hp, this.maxHp) : this.maxHp;
    this.face = face;
  }

  get x() { return this.body.center.x; }
  get feet() { return this.body.bottom; }
  get y() { return this.body.center.y; }
  get dead() { return this.state === 'dead'; }
  get onGround() { return this.body.blocked.down || this.body.touching.down; }
  get vulnerable() { return this.invuln <= 0 && this.state !== 'dead' && !(this.state === 'dodge' && this.st < DODGE_T - 0.04); }
  get ce() { return this.w.save.ce; }
  /** A blow's base: the original's attack from stats and gear, its melee multiplier and the level's power tier. */
  power() { const d = this.w.d; return d.atk * d.meleeMult * sovereignDamage(this.w.save.level); }
  /** A Covenant skill's base: attack times the original's ability power. */
  skillPower() { const d = this.w.d; return d.atk * d.abil * sovereignDamage(this.w.save.level); }

  /** A moment untouchable (an Echo exchange). */
  grantInvuln(t: number) { this.invuln = Math.max(this.invuln, t); }

  placeAt(x: number, feet: number, face = this.face) {
    this.body.reset(x, feet - 17);
    this.face = face;
    this.state = 'free';
  }

  destroy() {
    this.sprite.destroy();
    this.slash.destroy();
    this.aura.destroy();
    this.rect.destroy();
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
    const c = this.w.controls, b = this.body, s = this.w.save;
    this.st += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.swapStrikeT = Math.max(0, this.swapStrikeT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    for (const k of SLOTS) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.state !== 'dead') s.ce = Math.min(this.maxCe, s.ce + CE_REGEN * this.w.d.ceRegen * dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuf = c.pressed('jump') ? BUFFER : Math.max(0, this.jumpBuf - dt);

    if (this.state === 'dead') { b.setVelocityX(b.velocity.x * 0.9); this.draw(); return; }

    // Short hops: letting go of jump on the way up pulls Elior down sooner.
    const airSwing = (this.state === 'attack' || this.state === 'charge') && !this.onGround;
    b.setGravityY(airSwing ? GRAV * 0.35 : b.velocity.y < 0 && !c.down('jump') ? GRAV * 1.9 : GRAV);

    switch (this.state) {
      case 'free': {
        const ax = c.axis;
        const accel = this.onGround ? 1400 : 900;
        b.setVelocityX(Phaser.Math.Linear(b.velocity.x, ax * RUN, Math.min(1, (accel * dt) / RUN)));
        if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
        if (this.jumpBuf > 0 && c.down('down') && this.onGround && this.standingOnOneWay()) {
          this.dropT = 0.25;
          this.jumpBuf = 0;
        } else if (this.jumpBuf > 0 && this.coyote > 0) {
          b.setVelocityY(-JUMP_V);
          this.jumpBuf = 0;
          this.coyote = 0;
        }
        if (this.defence()) break;
        if (c.pressed('heavy') && this.onGround) this.startCharge('heavy');
        else if (c.pressed('attack')) this.startAttack(0);
        else if (c.pressed('heal')) this.startHeal();
        else this.trySkill();
        break;
      }
      case 'attack': {
        const u = this.st / this.atk.t;
        // Planted on the ground; a small lunge into the blow.
        if (this.onGround) b.setVelocityX(u < this.atk.hit[0] ? this.face * (this.atk.heavy ? 60 : 40) : b.velocity.x * 0.8);
        if (c.pressed('attack')) this.queued = true;
        if (u > this.atk.hit[1] && this.defence()) break;
        if (u >= this.atk.hit[0] && u <= this.atk.hit[1]) this.strike();
        if (u >= 1) {
          // Still holding attack after the first swing: charge a heavy blow (touch-friendly).
          if (this.atk === COMBO[0] && c.down('attack') && !this.queued && this.onGround) this.startCharge('attack');
          else if (this.queued && !this.atk.heavy && this.atk !== AIR && this.combo < 2) this.startAttack(this.combo + 1);
          else this.toFree();
        }
        break;
      }
      case 'charge': {
        b.setVelocityX(b.velocity.x * 0.8);
        if (Math.abs(c.axis) > 0.3) this.face = Math.sign(c.axis);
        const lvl = this.st >= CHARGE_AT[2] ? 2 : this.st >= CHARGE_AT[1] ? 1 : 0;
        if (lvl > this.chargeLvl) {
          this.chargeLvl = lvl;
          this.w.spark(this.x + this.face * 4, this.body.top - 4, lvl >= 2 ? 0xfff1c4 : 0xe8c27a, 6 + lvl * 4);
        }
        if (this.defence()) break;
        if (!c.down(this.chargeKey)) this.release();
        break;
      }
      case 'parry':
        b.setVelocityX(b.velocity.x * 0.7);
        // A perfect parry opens straight into the riposte.
        if (this.counterT > 0 && c.pressed('attack')) { this.startAttack(0); break; }
        if (this.counterT > 0 && c.pressed('heavy')) { this.startCharge('heavy'); break; }
        // Held past the window, the guard stays up as a block.
        if (this.st >= 0.3) this.state = c.down('parry') ? 'block' : 'free';
        break;
      case 'block':
        b.setVelocityX(b.velocity.x * 0.7);
        if (!c.down('parry')) this.toFree();
        break;
      case 'heal':
        b.setVelocityX(Phaser.Math.Linear(b.velocity.x, c.axis * 30, 0.2));
        if (!this.healDone && this.st >= 0.5) {
          this.healDone = true;
          const amt = Math.round(this.maxHp * 0.42);
          this.hp = Math.min(this.maxHp, this.hp + amt);
          this.w.floatText(this.x, this.body.top - 10, `+${amt}`, '#9fe39a');
          this.w.spark(this.x, this.y, 0x9fe39a, 12);
        }
        if (this.st >= 0.9) this.toFree();
        else if (this.healDone && c.pressed('dodge')) this.startDodge();
        break;
      case 'cast':
        b.setVelocityX(b.velocity.x * 0.7);
        if (this.castId && this.st >= 0.12) {
          castSkill(this.w, this, this.castId);
          this.castId = null;
        }
        // Once the skill is loosed, another can follow straight on.
        if (!this.castId && this.st >= 0.2 && this.trySkill()) break;
        if (this.st >= 0.3) this.toFree();
        break;
      case 'dodge':
        b.setVelocityX(this.face * DODGE_V * (1 - (this.st / DODGE_T) * 0.5));
        if (this.st >= DODGE_T) this.toFree();
        break;
      case 'hurt':
        b.setVelocityX(b.velocity.x * 0.88);
        if (this.st >= 0.3) this.toFree();
        break;
    }

    const hz = this.hazard();
    if (hz && this.vulnerable) {
      this.hurt({ dmg: hz === T.Spikes ? 18 : 10, dir: 0, hazard: true });
      if (hz === T.Spikes) b.setVelocityY(-260);
    }
    this.draw(dt);
  }

  /** Dodge or parry, from free or from the tail of a swing. */
  private defence() {
    const c = this.w.controls;
    if (c.pressed('dodge') && this.dodgeCd <= 0) { this.startDodge(); return true; }
    if (c.pressed('parry') && this.parryCd <= 0 && this.onGround) { this.startParry(); return true; }
    return false;
  }

  private trySkill() {
    const c = this.w.controls, s = this.w.save;
    const n = c.pressed('skill1') ? 0 : c.pressed('skill2') ? 1 : c.pressed('skill3') ? 2 : -1;
    if (n < 0) return false;
    const id = SLOTS[n], def = SKILLS[id];
    if (this.cds[id] > 0) return false;
    if (s.ce < def.cost) { this.w.floatText(this.x, this.body.top - 8, 'Not enough Covenant Energy', '#9fc4ff'); return false; }
    s.ce -= def.cost;
    this.cds[id] = def.cd;
    this.castId = id;
    this.state = 'cast';
    this.st = 0;
    this.slash.setVisible(false);
    return true;
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
    this.atkMult = 1;
    this.combo = this.onGround ? n : 0;
    this.begin();
    if (!this.onGround && this.body.velocity.y > 0) this.body.setVelocityY(this.body.velocity.y * 0.4);
  }

  private begin() {
    this.state = 'attack';
    this.st = 0;
    this.queued = false;
    this.hitDone.clear();
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
  }

  private startCharge(key: 'attack' | 'heavy') {
    this.state = 'charge';
    this.st = 0;
    this.chargeLvl = 0;
    this.chargeKey = key;
    this.slash.setVisible(false);
  }

  /** Let go of a charge: the heavy blow, stronger for every level reached. */
  private release() {
    this.atk = HEAVY;
    this.atkMult = CHARGE_MULT[this.chargeLvl];
    this.combo = 2;
    this.begin();
    if (this.chargeLvl >= 2) this.w.shake(0.006, 120);
  }

  private startParry() {
    this.state = 'parry';
    this.st = 0;
    this.parryT = this.w.d.parryWin;
    this.parryCd = 0.32;
    this.slash.setVisible(false);
  }

  private startHeal() {
    const s = this.w.save;
    if (!this.onGround) return;
    if (s.balm <= 0) { this.w.floatText(this.x, this.body.top - 8, 'No Balm left: rest at an altar', '#ff9a9a'); return; }
    if (this.hp >= this.maxHp) return;
    s.balm--;
    this.state = 'heal';
    this.st = 0;
    this.healDone = false;
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
    const reach = this.atk.reach;
    const x = this.face > 0 ? this.x : this.x - reach;
    return new Phaser.Geom.Rectangle(x, this.body.top - 4, reach, 40);
  }

  private strike() {
    const box = this.blade();
    for (const f of this.w.foes()) {
      if (!f.alive || this.hitDone.has(f) || !Phaser.Geom.Rectangle.Overlaps(box, f.box)) continue;
      this.hitDone.add(f);
      const counter = this.counterT > 0;
      const d = this.w.d, crit = counter || Math.random() < d.crit;
      let dmg = this.power() * this.atk.dmg * this.atkMult * (this.atk.heavy ? d.heavyMult : 1) * Phaser.Math.FloatBetween(0.92, 1.08);
      if (crit) dmg *= d.critDmg;
      if (counter) dmg *= 1.5;
      // Arriving from a swap: the first blow carries the momentum.
      const swap = this.swapStrikeT > 0 ? 1.5 : 1;
      const force = this.atk.force * this.atkMult * (counter ? 1.5 : 1) * swap;
      if (f.hit(Math.round(dmg * swap), this.face, force, crit)) {
        this.counterT = 0;
        this.swapStrikeT = 0;
        this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + CE_HIT);
        this.w.hitstop(this.atk.heavy ? 0.08 : this.combo === 2 || crit ? 0.06 : 0.04);
      }
    }
  }

  /**
   * Take a blow. A perfect parry turns it aside and staggers a melee attacker;
   * a raised guard (or the Shield of Faith) blocks most of it. Returns whether
   * any of it landed.
   */
  hurt(h: Blow) {
    if (this.state === 'dead') return false;
    if (!h.hazard && !this.vulnerable && this.shieldT <= 0) return false;
    const facing = h.dir === 0 || Math.sign(h.dir) !== this.face;
    if (!h.hazard && this.shieldT > 0) {
      h.src?.parried();
      this.w.spark(this.x + this.face * 10, this.y, 0x9fd8ff, 8);
      return false;
    }
    if (!h.hazard && !h.unblockable && this.parryT > 0 && facing) {
      this.parryT = 0;
      this.counterT = 0.75;
      this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + CE_PARRY);
      h.src?.parried();
      this.w.spark(this.x + this.face * 10, this.y - 6, 0xfff6dc, 16);
      this.w.floatText(this.x, this.body.top - 10, 'PARRY', '#fff1c4');
      this.w.hitstop(0.08);
      this.w.shake(0.004, 100);
      return false;
    }
    // The original's armour: damage reduction from Endurance and gear (half of it against hazards).
    const dr = this.w.d.dr * (h.hazard ? 0.5 : 1);
    let dmg = h.dmg * (1 - dr);
    if (!h.hazard && !h.unblockable && (this.state === 'block' || this.state === 'parry') && facing) {
      dmg = Math.max(1, Math.round(dmg * 0.25));
      this.hp = Math.max(1, this.hp - dmg);
      this.w.floatText(this.x, this.body.top - 6, String(dmg), '#e8c8a0');
      this.w.spark(this.x + this.face * 8, this.y - 4, 0xffe6a8, 6);
      this.body.setVelocityX(-this.face * 80);
      return true;
    }
    dmg = Math.max(1, Math.round(dmg));
    this.hp = Math.max(0, this.hp - dmg);
    this.w.floatText(this.x, this.body.top - 6, String(dmg), '#ff6a6a');
    this.w.shake(0.006, 140);
    this.invuln = 0.9;
    this.slash.setVisible(false);
    const dir = h.dir || -this.face;
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
    this.maxHp = this.w.d.maxHp;
    this.maxCe = this.w.d.maxCe;
    this.hp = this.maxHp;
  }

  /** Pick the sheet frame and place the sprite, blade arc and auras on the body. */
  private draw(dt = 0) {
    const b = this.body;
    let f = 0;
    const vx = Math.abs(b.velocity.x);
    if (this.state === 'dead' || this.state === 'hurt') f = 14;
    else if (this.state === 'dodge') f = this.st < 0.13 ? 12 : 13;
    else if (this.state === 'attack') f = this.st / this.atk.t < this.atk.hit[0] ? 10 : 11;
    else if (this.state === 'charge' || this.state === 'parry' || this.state === 'block') f = 10;
    else if (this.state === 'heal' || this.state === 'cast') f = 15;
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
      const big = this.atk.heavy ? 1.2 + this.atkMult * 0.25 : this.combo === 2 ? 1.25 : 1;
      this.slash.setPosition(b.center.x + this.face * 20, b.center.y - 2)
        .setFlipX(this.face < 0)
        .setScale(big, this.atk.heavy ? 1.3 : 1)
        .setAngle(this.face * (this.combo === 1 ? 20 : -10))
        .setTint(this.atk.heavy ? 0xffd27a : 0xffffff)
        .setAlpha(1 - k);
    }
    // Charge glow, the parry flash, the shield bubble.
    const g = this.aura.clear();
    if (this.state === 'charge') {
      const r = 10 + this.chargeLvl * 6 + Math.sin(this.st * 30) * 1.5;
      g.lineStyle(1.5, this.chargeLvl >= 2 ? 0xfff1c4 : 0xe8c27a, 0.8).strokeCircle(b.center.x, b.center.y, r);
    }
    if (this.parryT > 0) g.lineStyle(2, 0xfff6dc, 0.9).strokeCircle(b.center.x + this.face * 8, b.center.y - 2, 9);
    else if (this.state === 'block') g.lineStyle(1.5, 0xffe6a8, 0.5).strokeCircle(b.center.x + this.face * 8, b.center.y - 2, 9);
    if (this.shieldT > 0) g.lineStyle(2, 0x9fd8ff, 0.4 + 0.3 * Math.sin(this.st * 20)).strokeCircle(b.center.x, b.center.y, 22);
    if (this.counterT > 0) g.fillStyle(0xfff1c4, 0.7).fillCircle(b.center.x + this.face * 10, b.top - 2, 1.5);
  }
}
