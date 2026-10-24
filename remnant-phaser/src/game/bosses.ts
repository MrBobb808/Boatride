// Bosses in Phaser. The base follows the original's BossBase
// (remnant/src/game/bosses2.ts): a dormant boss wakes when Elior steps into
// its trigger, plays its intro, then fights through three phases whose
// thresholds cannot be skipped. Breaking its poise (or parrying it) makes it
// kneel, open to half again the damage. The Fallen Crowns follow
// remnant/src/game/fallenBosses.ts and cinderBoss.ts: Varkhos, Morvane and
// Azkar, with their adds, marked hazards and warded final phases, drawn from
// their PNG atlases.
//
// Until gear and stats are ported, health and blows are sized to the Phaser
// Elior at the chapter's arrival level (game/curve.ts), not the original's
// absolute numbers, on the original's default Hard difficulty.

import Phaser from 'phaser';
import { chapterCurve, cleansingBeacon } from '../shared';
import { GRAV } from './player';
import { maxHpAt, powerAt } from './save';
import type { WorldApi, FoeLike } from './types';

/** Settings → Boss difficulty "Hard" (the default) from remnant/src/game/difficulty.ts. */
export const HARD = { hp: 1.3, dmg: 1.25, tempo: 1.1 };
/** Blows of Elior's at the arrival level a Crown can take, before difficulty. */
const HP_IN_BLOWS = 110;
/** A Crown's base blow as a share of Elior's health at the arrival level. */
const BLOW_SHARE = 0.09;

export type BossKey = 'beast_monarch' | 'plague_monarch' | 'cinder_monarch';
export const BOSS_CHAPTER: Record<BossKey, number> = { beast_monarch: 7, plague_monarch: 8, cinder_monarch: 9 };
export const bossPorted = (k: string): k is BossKey => k in BOSS_CHAPTER;

type State = 'dormant' | 'intro' | 'idle' | 'attack' | 'transition' | 'kneel' | 'dead';
interface Box { x: number; y: number; w: number; h: number }

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

export abstract class Boss implements FoeLike {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Sprite;
  fx: Phaser.GameObjects.Graphics;
  box = new Phaser.Geom.Rectangle();
  abstract name: string;
  sub = '';
  color = 0xffe6a8;
  phase = 0;
  state: State = 'dormant';
  st = 0;
  cd = 1;
  hp: number;
  maxHp: number;
  poise = 300;
  maxPoise = 300;
  kneelTime = 4;
  staggered = 0;
  p2At = 0.67;
  p3At = 0.32;
  phaseMarks = [0.67, 0.32];
  face = -1;
  floorY: number;
  /** While warded, blows pass through (the warded final attacks). */
  ward = false;
  removed = false;
  flash = 0;
  defeatT = 0;
  /** Who a blow has already struck this attack. */
  protected hitOnce = new Set<string>();
  protected readonly chapter: number;
  protected readonly base: number;

  constructor(protected w: WorldApi, public key: BossKey, x: number, feet: number, bw: number, bh: number, texture: string) {
    const sc = w.sc;
    this.chapter = BOSS_CHAPTER[key];
    const lv = chapterCurve(this.chapter).level;
    this.maxHp = this.hp = Math.round(powerAt(lv) * HP_IN_BLOWS * HARD.hp);
    this.base = maxHpAt(lv) * BLOW_SHARE * HARD.dmg;
    this.floorY = feet;
    this.rect = sc.add.rectangle(x, feet - bh / 2, bw, bh, 0xffffff, 0);
    sc.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setGravityY(GRAV).setMaxVelocityY(480).setCollideWorldBounds(true);
    this.sprite = sc.add.sprite(x, feet, texture, `${key}-0`).setDepth(7).setScale(bossScale(sc, key));
    this.fx = sc.add.graphics().setDepth(13);
  }

  get x() { return this.body.center.x; }
  get alive() { return this.state !== 'dead'; }
  get fighting() { return this.state === 'idle' || this.state === 'attack' || this.state === 'kneel'; }
  /** This phase's blow. */
  get dmg() { return this.base * (this.phase === 3 ? 1.12 : 1); }

  /** Elior stepped into the arena: the intro, then the fight. */
  awaken() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.st = 0;
    this.w.banner(this.name.toUpperCase(), this.sub);
  }

  protected beginFight() {
    this.state = 'idle';
    this.st = 0;
    this.phase = 1;
    this.cd = 1;
    this.w.bossBar(this.name, this.sub);
  }

  update(dt: number) {
    // Hard makes the fight quicker, never the intro.
    if (this.fighting && this.state !== 'kneel') dt *= HARD.tempo;
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    switch (this.state) {
      case 'dormant': break;
      case 'intro': if (this.st > 1.7) this.beginFight(); break;
      case 'transition': this.transition(); break;
      case 'kneel':
        this.staggered -= dt;
        this.body.setVelocityX(0);
        if (this.staggered <= 0) this.recover();
        break;
      case 'dead':
        this.defeatT += dt;
        if (this.defeatT > 1.8 && !this.removed) { this.cleanUp(); this.w.onBossDefeated(this.key); this.remove(); }
        break;
      default: this.think(dt);
    }
    this.move(dt);
    if (!this.removed) this.draw();
  }

  protected recover() {
    this.state = 'idle';
    this.st = 0;
    this.poise = this.maxPoise;
    this.cd = 0.9;
    this.staggered = 0;
  }

  protected kneel() {
    this.state = 'kneel';
    this.st = 0;
    this.staggered = this.kneelTime;
    this.body.setVelocityX(0);
    this.w.shake(0.01, 220);
    this.w.toast(`${this.name.split(' · ')[0]} kneels: strike now.`);
    this.onKneel();
  }
  protected onKneel() {}

  /** A Crown's blow turned aside by Elior's parry. */
  parried() {
    if (!this.fighting || this.ward) return;
    this.poise -= 180;
    this.body.setVelocityX(0);
    if (this.poise <= 0) this.kneel();
    else this.finish(1.4);
  }

  /** Phase gates: no blow carries the health past the next threshold. */
  hit(dmg: number, dir: number, force: number, crit = false) {
    if (!this.fighting || this.ward) return false;
    const kneeling = this.state === 'kneel';
    let d = Math.max(1, Math.round(dmg * (kneeling ? 1.5 : 1) * this.armorMul()));
    const threshold = this.phase === 1 ? this.p2At : this.phase === 2 ? this.p3At : 0;
    // Clamped after rounding: healed health is fractional, and the blow must still cross the line.
    if (threshold) d = Math.min(d, Math.max(1, this.hp - (Math.ceil(this.maxHp * threshold) - 1)));
    this.hp -= d;
    this.flash = 0.1;
    const shown = Math.round(d);
    this.w.floatText(this.x + Phaser.Math.Between(-12, 12), this.body.top + 10, crit ? `${shown}!` : String(shown), crit ? '#ffd23a' : '#ffe6a8');
    this.w.spark(this.x - dir * 10, this.body.center.y, this.color, 8);
    if (!kneeling) {
      this.poise -= dmg * force;
      if (this.poise <= 0) this.kneel();
    }
    if (this.hp <= 0) { this.die(); return true; }
    if (threshold && this.hp < this.maxHp * threshold) {
      if (this.phase === 1) this.beginTransition(); else this.enterPhase3();
    }
    return true;
  }

  protected armorMul() { return 1; }

  protected die() {
    this.hp = 0;
    this.state = 'dead';
    this.st = 0;
    this.defeatT = 0;
    this.ward = false;
    this.cleanUp();
    this.w.bossBar(null);
    this.w.shake(0.012, 500);
    this.w.hitstop(0.15);
  }

  protected finish(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.cd = cd;
    this.body.setVelocityX(0);
  }

  /** Hurt Elior if he is inside `b`, once per attack per tag. */
  protected strike(tag: string, b: Box, mul: number, opts: { hazard?: boolean; unblockable?: boolean; dir?: number } = {}) {
    if (this.hitOnce.has(tag)) return;
    const p = this.w.player;
    if (p.dead) return;
    if (p.x < b.x || p.x > b.x + b.w || p.feet - 12 < b.y || p.feet - 30 > b.y + b.h) return;
    this.hitOnce.add(tag);
    p.hurt({ dmg: Math.round(this.dmg * mul), dir: opts.dir ?? this.face, src: opts.hazard || opts.unblockable ? undefined : this, hazard: opts.hazard, unblockable: opts.unblockable });
  }

  protected faceElior() { this.face = Math.sign(this.w.player.x - this.x) || this.face; }
  protected clampX(x: number) { return Phaser.Math.Clamp(x, 100, this.w.roomW() - 100); }

  protected move(_dt: number) {
    // Kept off the arena's edges, where the gate and walls stand.
    const x = this.clampX(this.x);
    if (x !== this.x) this.body.x = x - this.body.width / 2;
  }

  /** The telegraph flare before a blow. */
  protected glint(x: number, y: number, color = 0xffffff) {
    const g = this.fx, a = 0.6 + Math.sin(this.st * 30) * 0.3;
    g.fillStyle(color, 0.35 * a).fillCircle(x, y, 7);
    g.lineStyle(1, 0xffffff, a).lineBetween(x - 10, y, x + 10, y).lineBetween(x, y - 7, x, y + 7);
  }

  /** A floor ring that shrinks to the moment of impact. */
  protected floorMark(x: number, r: number, u: number, color: number) {
    const g = this.fx, a = 0.5 + Math.sin(this.w.sc.time.now / 1000 * 18) * 0.3;
    g.fillStyle(color, a * 0.3).fillEllipse(x, this.floorY - 1, r * 2, 7);
    g.lineStyle(1.5, color, a).strokeEllipse(x, this.floorY - 1, Math.max(2, r * 2 * (1 - Phaser.Math.Clamp(u, 0, 1))), 7);
  }

  remove() {
    this.removed = true;
    this.cleanUp();
    this.sprite.destroy();
    this.fx.destroy();
    this.rect.destroy();
  }

  protected abstract think(dt: number): void;
  protected abstract beginTransition(): void;
  protected abstract enterPhase3(): void;
  protected abstract transition(): void;
  protected abstract draw(): void;
  protected abstract cleanUp(): void;
}

// ---------------------------------------------------------------- adds

/** Hunt Shades lunge; Brood Cocoons stay rooted and heal their queen. */
export class CrownAdd implements FoeLike {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  g: Phaser.GameObjects.Graphics;
  box = new Phaser.Geom.Rectangle();
  hp: number;
  maxHp: number;
  removed = false;
  private cd = 0.8;
  private windup = 0;
  private dash = 0;
  private struck = false;
  private flash = 0;
  face = 1;

  constructor(private w: WorldApi, private owner: FallenMonarch, x: number, feet: number, public pod: boolean) {
    const sc = w.sc, bw = pod ? 27 : 34, bh = pod ? 46 : 23;
    this.rect = sc.add.rectangle(x, feet - bh / 2, bw, bh, 0xffffff, 0);
    sc.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setGravityY(1200).setMaxVelocityY(450).setCollideWorldBounds(true);
    this.g = sc.add.graphics().setDepth(8);
    this.hp = this.maxHp = Math.round(owner.maxHp * 0.014);
  }

  get alive() { return !this.removed && this.hp > 0; }
  get x() { return this.body.center.x; }

  hit(dmg: number, dir: number) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 0.12;
    this.w.floatText(this.x, this.body.top - 4, String(dmg), '#ffe6a8');
    if (!this.hp) { this.w.spark(this.x, this.body.center.y, this.owner.color, 12); this.remove(); }
    else this.body.setVelocityX(dir * 40);
    return true;
  }

  parried() { this.cd = 1.3; this.windup = 0; this.dash = 0; this.body.setVelocityX(0); }

  update(dt: number) {
    if (this.removed) return;
    if (!this.owner.alive || this.owner.removed) { this.remove(); return; }
    this.flash = Math.max(0, this.flash - dt);
    const b = this.body;
    if (!this.pod) {
      const p = this.w.player;
      dt *= HARD.tempo;
      this.face = Math.sign(p.x - this.x) || this.face;
      if (this.windup > 0) {
        this.windup -= dt;
        b.setVelocityX(0);
        if (this.windup <= 0) { this.dash = 0.35; this.struck = false; b.setVelocityX(this.face * 330); }
      } else if (this.dash > 0) {
        this.dash -= dt;
        if (!this.struck && Math.abs(p.x - this.x) < 22 && Math.abs(p.feet - b.bottom) < 30) {
          this.struck = true;
          p.hurt({ dmg: Math.round(this.owner.dmg * 0.42), dir: this.face, src: this });
        }
        if (this.dash <= 0) this.cd = 1.4;
      } else {
        this.cd -= dt;
        b.setVelocityX(Phaser.Math.Linear(b.velocity.x, this.face * (Math.abs(p.x - this.x) > 75 ? 85 : 0), 0.1));
        if (this.cd <= 0 && Math.abs(p.x - this.x) < 150) this.windup = 0.7;
      }
    }
    this.box.setTo(b.left, b.top, b.width, b.height);
    this.draw();
  }

  private draw() {
    const g = this.g.clear(), b = this.body, x = b.center.x, y = b.bottom, f = this.face;
    const fill = this.flash > 0 ? 0xfff3d9 : this.pod ? 0x35513d : 0x27242d;
    g.fillStyle(fill, 1).lineStyle(1, this.owner.color, 0.9);
    if (this.pod) {
      g.beginPath().moveTo(x - 14, y).lineTo(x - 18, y - 24).lineTo(x - 11, y - 48).lineTo(x, y - 57).lineTo(x + 13, y - 45).lineTo(x + 17, y - 22).lineTo(x + 12, y).closePath().fillPath().strokePath();
      g.lineStyle(1, 0xd8edaa, 0.9);
      for (let i = 0; i < 3; i++) g.lineBetween(x - 12, y - 12 - i * 11, x + 12, y - 19 - i * 10);
    } else {
      const pts = [-23, -6, -19, -19, 4, -22, 13, -29, 15, -20, 27, -15, 19, -7, 13, -3, 8, 0, 5, -7, -11, -6, -15, 0, -19, 0, -19, -7, -30, -12];
      g.beginPath().moveTo(x + pts[0] * f, y + pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(x + pts[i] * f, y + pts[i + 1]);
      g.closePath().fillPath().strokePath();
      g.fillStyle(this.owner.color, 1).fillRect(x + 15 * f - (f < 0 ? 3 : 0), y - 18, 3, 2);
      if (this.windup > 0) g.lineStyle(1, this.owner.color, 0.8).strokeRect(x - 27, y - 33, 55, 35);
    }
    g.fillStyle(this.owner.color, 1).fillRect(x - 20, y - (this.pod ? 64 : 38), 40 * this.hp / this.maxHp, 3);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.g.destroy();
    this.rect.destroy();
  }
}

// ---------------------------------------------------------------- Varkhos and Morvane

type CrownAttack = 'claws' | 'charge' | 'leap' | 'call' | 'hunt' | 'needles' | 'spores' | 'purge';
interface Spore { x: number; t: number; pulse: number }

/** Atlas frames: 0 stand, 1–3 wind-up, strike, follow-through, 4 enraged stand, 5 cast, 6 kneel, 7 fall. */
export class FallenMonarch extends Boss {
  name: string;
  private attack: CrownAttack = 'claws';
  private attackCount = 0;
  private released = false;
  private targetX = 0;
  private launchX = 0;
  private huntStep = -1;
  private beaconX = 0;
  private purgePulse = -1;
  adds: CrownAdd[] = [];
  private spores: Spore[] = [];
  private arrows: Phaser.GameObjects.Rectangle[] = [];

  constructor(w: WorldApi, public plague: boolean, x: number, feet: number) {
    super(w, plague ? 'plague_monarch' : 'beast_monarch', x, feet, plague ? 40 : 50, 90, plague ? 'morvane' : 'varkhos');
    this.name = plague ? 'Morvane · Crown of Pestilence' : 'Varkhos · Crown of the Hunt';
    this.sub = plague ? 'I · The Living Swarm' : 'I · The Unbroken Pack';
    this.color = hex(plague ? '#baed8c' : '#ffbd79');
    this.maxPoise = this.poise = plague ? 560 : 620;
  }

  private get addCount() { return this.adds.filter((a) => a.alive).length; }
  // Each living Hunt Shade sharpens the king's blows.
  get dmg() { return super.dmg * (this.plague ? 1 : 1 + this.addCount * 0.12); }

  protected beginTransition() {
    this.cleanUp();
    this.state = 'transition';
    this.st = 0;
    this.body.setVelocityX(0);
    this.w.banner(this.plague ? 'THE BROOD AWAKENS' : 'THE KING UNLEASHED', this.plague ? 'Destroy the Brood Cocoons to stop her healing' : 'Cut down his Hunt Shades: each strengthens his attacks');
  }
  protected enterPhase3() {
    this.cleanUp();
    this.phase = 3;
    this.state = 'transition';
    this.st = 0;
    this.body.setVelocityX(0);
    this.w.banner(this.plague ? 'THE GREAT MIASMA' : 'THE GREAT HUNT', this.plague ? 'Gold marks clean air · enter the active beacon' : 'Three marked pounces · dodge, then punish the recovery');
  }
  protected transition() {
    if (this.st < 1.4) return;
    this.poise = this.maxPoise;
    this.staggered = 0;
    if (this.phase === 1) {
      this.phase = 2;
      this.summon();
      this.finish(1);
      this.sub = this.plague ? 'II · Brood Cocoons restore the queen' : 'II · Hunt Shades empower the king';
    } else {
      this.sub = this.plague ? 'III · Shelter in gold, strike after the miasma' : 'III · Evade three marks, strike after the landing';
      this.start(this.plague ? 'purge' : 'hunt');
    }
    this.w.bossBar(this.name, this.sub);
  }

  private start(a: CrownAttack) {
    this.attack = a;
    this.state = 'attack';
    this.st = 0;
    this.released = false;
    this.hitOnce.clear();
    this.huntStep = -1;
    this.attackCount++;
    this.faceElior();
    this.lockTarget();
    if (a === 'hunt' || a === 'purge') {
      this.ward = true;
      this.purgePulse = -1;
      this.beaconX = cleansingBeacon(this.w.player.x, this.x, this.w.roomW());
      this.w.toast(a === 'hunt' ? 'Great Hunt: dodge each amber mark. Strike after the third landing.' : 'Great Miasma: enter the gold beacon. Strike after the veil breaks.');
    }
    if (a === 'spores') for (const dx of [-110, 0, 110]) this.spores.push({ x: this.clampX(this.targetX + dx), t: 0, pulse: -1 });
  }

  private lockTarget() {
    this.launchX = this.x;
    this.targetX = Phaser.Math.Clamp(this.w.player.x, 110, this.w.roomW() - 110);
  }

  /** A pounce lands: a ring of impact nothing can parry. */
  private land(tag: string) {
    this.released = true;
    this.w.shake(0.008, 160);
    this.w.spark(this.x, this.floorY - 4, this.color, 14);
    this.strike(tag, { x: this.x - 60, y: this.floorY - 54, w: 120, h: 55 }, 1.7, { unblockable: true });
  }

  protected think(dt: number) {
    this.tickSpores(dt);
    // Each Brood Cocoon mends the queen until it is cut down.
    if (this.plague && this.phase === 2 && this.addCount) this.hp = Math.min(this.maxHp * this.p2At, this.hp + this.maxHp * 0.003 * this.addCount * dt);
    const b = this.body;
    if (this.state === 'idle') {
      b.setVelocityX(b.velocity.x * 0.85);
      this.cd -= dt;
      if (this.cd <= 0) {
        const cycle: CrownAttack[] = this.plague ? ['needles', 'spores', 'claws', 'call'] : ['claws', 'charge', 'leap', 'call'];
        this.start(this.phase === 3 && this.attackCount % 4 === 0 ? (this.plague ? 'purge' : 'hunt') : cycle[this.attackCount % 4]);
      }
      return;
    }
    const t = this.st;
    switch (this.attack) {
      case 'claws':
      case 'charge': {
        const tell = this.attack === 'charge' ? 0.9 : 0.75;
        const lunging = t >= tell && t < tell + 0.3;
        b.setVelocityX(lunging ? this.face * (this.attack === 'charge' ? 580 : 230) : 0);
        if (lunging) this.strike('claw', { x: this.x + (this.face > 0 ? 0 : -80), y: this.floorY - 68, w: 80, h: 65 }, 1.35);
        if (t > 2) this.finish(1.2);
        break;
      }
      case 'leap':
        if (t >= 1.35 && !this.released) this.land('leap');
        if (t > 2.5) this.finish(1.3);
        break;
      case 'call':
        if (t >= 1 && !this.released) {
          this.released = true;
          if (this.phase >= 2) this.summon(); else { this.start(this.plague ? 'spores' : 'leap'); return; }
        }
        if (t > 1.9) this.finish(1.1);
        break;
      case 'needles':
        if (t >= 1 && !this.released) {
          this.released = true;
          for (const vy of [-45, 0, 45]) this.needle(vy);
        }
        if (t > 2.1) this.finish(1.1);
        break;
      case 'spores':
        if (t > 2.4) this.finish(1.1);
        break;
      case 'hunt': {
        const step = Math.min(2, Math.floor(t / 1.25));
        if (step !== this.huntStep) { this.huntStep = step; this.lockTarget(); this.released = false; }
        if (t % 1.25 >= 1.1 && !this.released) this.land(`hunt${step}`);
        if (t > 3.8) { this.ward = false; this.finish(2.5); this.w.toast('The hunt ends: Varkhos is exposed.'); }
        break;
      }
      case 'purge': {
        // Three pulses of miasma over everything but the beacon's clean air.
        const pulse = Math.min(2, Math.floor((t - 1.6) / 1.1));
        if (t >= 1.6 && t < 4.9 && pulse !== this.purgePulse) {
          this.purgePulse = pulse;
          const p = this.w.player;
          if (Math.abs(p.x - this.beaconX) >= 80) this.strike(`purge${pulse}`, { x: 0, y: this.floorY - 180, w: this.w.roomW(), h: 181 }, 2.4, { hazard: true, dir: 0 });
          // The beacon's clean air restores a little.
          else p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.02);
        }
        if (t > 4.9) { this.ward = false; this.finish(2.7); this.w.toast('The miasma breaks: Morvane is exposed.'); }
        break;
      }
    }
  }

  private needle(vy: number) {
    const sc = this.w.sc;
    const n = sc.add.rectangle(this.x + this.face * 28, this.floorY - 47, 15, 5, this.color).setDepth(9);
    sc.physics.add.existing(n);
    const nb = n.body as Phaser.Physics.Arcade.Body;
    nb.setAllowGravity(false).setVelocity(this.face * 260, vy);
    this.arrows.push(n);
    const born = sc.time.now, dmg = Math.round(this.dmg * 0.65), dir = this.face;
    const tick = () => {
      if (!n.active) return;
      const p = this.w.player;
      if (sc.time.now - born > 3000 || n.x < 0 || n.x > this.w.roomW()) { n.destroy(); return; }
      if (Math.abs(n.x - p.x) < 10 && n.y > p.feet - 34 && n.y < p.feet) { p.hurt({ dmg, dir, ranged: true }); n.destroy(); return; }
      sc.time.delayedCall(16, tick);
    };
    tick();
  }

  private tickSpores(dt: number) {
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const s = this.spores[i];
      s.t += dt;
      if (s.t > 4) { this.spores.splice(i, 1); continue; }
      if (s.t < 1.05) continue;
      const pulse = Math.floor((s.t - 1.05) / 0.65);
      if (pulse !== s.pulse) { s.pulse = pulse; this.hitOnce.delete(`spore${i}`); }
      this.strike(`spore${i}`, { x: s.x - 38, y: this.floorY - 65, w: 76, h: 66 }, 0.45, { hazard: true, dir: 0 });
    }
  }

  private summon() {
    this.adds = this.adds.filter((a) => a.alive);
    for (let i = this.adds.length; i < 2; i++) {
      const a = new CrownAdd(this.w, this, this.clampX(this.x + (i ? -155 : 155)), this.floorY, this.plague);
      this.w.addFoe(a);
      this.adds.push(a);
    }
  }

  protected cleanUp() {
    for (const a of this.adds) a.remove();
    this.adds = [];
    this.spores = [];
    for (const n of this.arrows) n.destroy();
    this.arrows = [];
    this.ward = false;
  }

  protected move(dt: number) {
    const b = this.body;
    // The leap and the hunt's pounces arc through the air to their mark.
    let u = -1;
    if (this.state === 'attack' && this.attack === 'leap') u = Phaser.Math.Clamp((this.st - 0.9) / 0.45, 0, 1);
    if (this.state === 'attack' && this.attack === 'hunt') u = Phaser.Math.Clamp(((this.st % 1.25) - 0.75) / 0.35, 0, 1);
    if (u > 0 && u < 1) {
      b.setAllowGravity(false);
      const nx = this.launchX + (this.targetX - this.launchX) * u, ny = this.floorY - Math.sin(u * Math.PI) * 76;
      b.reset(nx, ny - b.height / 2);
    } else {
      b.setAllowGravity(true);
      if (u >= 0) b.setVelocityX(0);
    }
    super.move(dt);
  }

  protected draw() {
    const b = this.body;
    let frame = this.phase >= 2 ? 4 : 0;
    if (this.state === 'attack') frame = this.attack === 'call' || this.attack === 'spores' || this.attack === 'purge' ? 5 : this.st < 0.75 ? 1 : this.st < 1.5 ? 2 : 3;
    if (this.state === 'kneel') frame = 6;
    if (this.state === 'dead') frame = 7;
    this.sprite.setFrame(`${this.key}-${frame}`).setFlipX(this.face < 0).setPosition(Math.round(b.center.x), Math.round(b.bottom));
    this.sprite.setAlpha(this.state === 'dead' ? Math.max(0.2, 1 - this.defeatT * 0.3) : 1);
    if (this.flash > 0) this.sprite.setTint(0xfff6e5).setTintMode(Phaser.TintModes.FILL);
    else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.box.setTo(b.left, b.top, b.width, b.height);
    const g = this.fx.clear();
    for (const s of this.spores) {
      g.fillStyle(this.color, s.t < 1.05 ? 0.1 : 0.25).fillRect(s.x - 38, this.floorY - 65, 76, 65);
      g.lineStyle(1, this.color, 0.9).strokeRect(s.x - 38, this.floorY - 65, 76, 65);
      if (s.t < 1.05) this.floorMark(s.x, 38, s.t / 1.05, this.color);
    }
    if (this.state !== 'attack') return;
    if ((this.attack === 'claws' && this.st < 0.75) || (this.attack === 'charge' && this.st < 0.9)) this.glint(this.x + this.face * 30, b.bottom - 57, this.color);
    if (this.attack === 'charge' && this.st < 0.9) g.fillStyle(this.color, 0.15).fillRect(this.face > 0 ? this.x : this.x - 270, this.floorY - 12, 270, 12);
    if (this.attack === 'hunt' || this.attack === 'leap') {
      const t = this.attack === 'hunt' ? this.st % 1.25 : this.st, tell = this.attack === 'hunt' ? 0.75 : 0.9;
      if (t < tell + 0.4) this.floorMark(this.targetX, 60, Phaser.Math.Clamp(t / tell, 0, 1), this.color);
    }
    if (this.attack === 'purge') {
      const W = this.w.roomW(), a = this.st < 1.6 ? 0.05 : 0.18;
      g.fillStyle(this.color, a).fillRect(0, this.floorY - 180, this.beaconX - 80, 180).fillRect(this.beaconX + 80, this.floorY - 180, W - this.beaconX - 80, 180);
      g.lineStyle(2, 0xffdf91, 1).strokeRect(this.beaconX - 80, this.floorY - 85, 160, 85);
      g.fillStyle(0xffdf91, 0.15).fillRect(this.beaconX - 80, this.floorY - 85, 160, 85);
    }
  }
}

// ---------------------------------------------------------------- Azkar

type CinderAttack = 'hammer' | 'fault' | 'sweep' | 'bellows';
interface Fault { x: number; t: number; fired: boolean; id: number }
interface Wave { g: Phaser.GameObjects.Graphics; x: number; dir: number; life: number; id: number }

/** Atlas frames: 0 stand, 1 wind-up, 2 strike, 3 kneel or fall. */
export class CinderMonarch extends Boss {
  name = 'Azkar · Crown of Cinders';
  private attack: CinderAttack = 'hammer';
  private attackCount = 0;
  private released = false;
  private faults: Fault[] = [];
  private waves: Wave[] = [];
  private bellowsStep = -1;
  private nextId = 0;
  armor = false;

  constructor(w: WorldApi, x: number, feet: number) {
    super(w, 'cinder_monarch', x, feet, 48, 94, 'azkar');
    this.sub = 'I · The Living Anvil';
    this.color = hex('#ffb16b');
    this.maxPoise = this.poise = 680;
    this.kneelTime = 3.2;
  }

  // Tempered armor turns aside nearly half of every blow until it is broken.
  protected armorMul() { return this.armor && this.state !== 'kneel' ? 0.55 : 1; }
  get dmg() { return this.base * (this.phase === 3 ? 1.1 : 1); }

  protected beginTransition() {
    this.cleanUp();
    this.state = 'transition';
    this.st = 0;
    this.body.setVelocityX(0);
    this.w.banner('THE TEMPERED CROWN', 'Armor reduces damage · parry the hammer to shatter it');
  }
  protected enterPhase3() {
    this.cleanUp();
    this.phase = 3;
    this.armor = false;
    this.state = 'transition';
    this.st = 0;
    this.body.setVelocityX(0);
    this.w.banner('THE LAST BELLOWS', 'Three eruptions · leave each marked crack, then strike');
  }
  protected transition() {
    if (this.st < 1.5) return;
    this.poise = this.maxPoise;
    this.staggered = 0;
    if (this.phase === 1) {
      this.phase = 2;
      this.armor = true;
      this.sub = 'II · Parry to break the tempered armor';
      this.finish(1.2);
    } else {
      this.sub = 'III · Evade the bellows, punish the broken furnace';
      this.start('bellows');
    }
    this.w.bossBar(this.name, this.sub);
  }
  protected onKneel() { this.armor = false; this.cleanUp(); }
  protected recover() { super.recover(); this.armor = this.phase === 2; }

  parried() {
    if (!this.fighting || this.ward) return;
    this.poise -= 230;
    this.body.setVelocityX(0);
    if (this.phase === 2 || this.poise <= 0) { this.kneel(); this.w.toast('The armor shatters: Azkar is exposed.'); }
    else this.finish(1.8);
  }

  private start(a: CinderAttack) {
    this.attack = a;
    this.attackCount++;
    this.state = 'attack';
    this.st = 0;
    this.released = false;
    this.hitOnce.clear();
    this.body.setVelocityX(0);
    this.faceElior();
    if (a === 'fault') this.mark(this.w.player.x);
    if (a === 'bellows') {
      this.cleanUp();
      this.ward = true;
      this.bellowsStep = -1;
      this.w.toast('Last Bellows: leave each orange crack. Azkar weakens after the third eruption.');
    }
  }

  private mark(x: number) { this.faults.push({ x: this.clampX(x), t: 0, fired: false, id: this.nextId++ }); }

  private tickHeat(dt: number) {
    for (let i = this.faults.length - 1; i >= 0; i--) {
      const f = this.faults[i];
      f.t += dt;
      if (f.t > 2.15) { this.faults.splice(i, 1); continue; }
      if (f.t < 1.7) continue;
      if (!f.fired) { f.fired = true; this.w.shake(0.006, 120); this.w.spark(f.x, this.floorY - 4, this.color, 10); }
      this.strike(`fault${f.id}`, { x: f.x - 38, y: this.floorY - 180, w: 76, h: 181 }, 1.3, { hazard: true, dir: 0 });
    }
    // Low fire waves: jump them.
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.life -= dt;
      wv.x += wv.dir * 210 * dt;
      if (wv.life <= 0 || wv.x < 70 || wv.x > this.w.roomW() - 50) { wv.g.destroy(); this.waves.splice(i, 1); continue; }
      this.strike(`wave${wv.id}`, { x: wv.x - 15, y: this.floorY - 24, w: 30, h: 24 }, 0.8, { hazard: true, dir: wv.dir });
      const g = wv.g.clear(), x = wv.x, y = this.floorY;
      g.fillStyle(0xec793e, 1).lineStyle(1, 0xffdc9e, 1);
      g.beginPath().moveTo(x - 18, y).lineTo(x - 11, y - 12).lineTo(x - 3, y - 28).lineTo(x + 3, y - 12).lineTo(x + 15, y - 20).lineTo(x + 18, y).closePath().fillPath().strokePath();
    }
  }

  protected think(dt: number) {
    this.tickHeat(dt);
    const b = this.body;
    if (this.state === 'idle') {
      const dx = this.w.player.x - this.x;
      this.face = Math.sign(dx) || this.face;
      b.setVelocityX(Phaser.Math.Linear(b.velocity.x, Math.abs(dx) > 115 ? this.face * 80 : 0, 0.1));
      this.cd -= dt;
      if (this.cd <= 0) {
        const seq: CinderAttack[] = ['hammer', 'fault', 'sweep', 'hammer'];
        this.start(this.phase === 3 && this.attackCount % 4 === 0 ? 'bellows' : seq[this.attackCount % 4]);
      }
      return;
    }
    const t = this.st;
    if (this.attack === 'hammer') {
      if (t >= 0.95 && t < 1.2) {
        b.setVelocityX(this.face * 130);
        this.strike('hammer', { x: this.x + (this.face > 0 ? 0 : -100), y: this.floorY - 85, w: 100, h: 85 }, 1.4);
      } else b.setVelocityX(0);
      if (t > 2.15) this.finish(1.1);
    } else if (this.attack === 'fault') {
      if (t > 2.4) this.finish(1.1);
    } else if (this.attack === 'sweep') {
      if (t >= 1.2 && !this.released) {
        this.released = true;
        for (const dir of [-1, 1]) this.waves.push({ g: this.w.sc.add.graphics().setDepth(9), x: this.x + dir * 44, dir, life: 5, id: this.nextId++ });
      }
      if (t > 2.45) this.finish(1.2);
    } else {
      // The Last Bellows: three rounds of three cracks around Elior.
      const step = Math.min(2, Math.floor(t / 2.4));
      if (step !== this.bellowsStep) {
        this.bellowsStep = step;
        const x = this.w.player.x;
        this.mark(x); this.mark(x - 185); this.mark(x + 185);
      }
      if (t > 7.15) { this.ward = false; this.finish(3.1); this.w.toast('The furnace breaks: Azkar is exposed.'); }
    }
  }

  protected cleanUp() {
    this.faults = [];
    for (const wv of this.waves) wv.g.destroy();
    this.waves = [];
    this.ward = false;
  }

  protected draw() {
    const b = this.body;
    const frame = this.state === 'dead' || this.state === 'kneel' ? 3 : this.state === 'attack' ? (this.st < (this.attack === 'hammer' ? 0.95 : 1.2) ? 1 : 2) : 0;
    this.sprite.setFrame(`cinder_monarch-${frame}`).setFlipX(this.face < 0).setPosition(Math.round(b.center.x), Math.round(b.bottom));
    this.sprite.setAlpha(this.state === 'dead' ? Math.max(0.15, 1 - this.defeatT * 0.35) : 1);
    if (this.flash > 0) this.sprite.setTint(0xfff6e5).setTintMode(Phaser.TintModes.FILL);
    else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.box.setTo(b.left, b.top, b.width, b.height);
    const g = this.fx.clear();
    if (this.armor) g.lineStyle(2, 0xffe5b1, 0.8).beginPath().arc(this.x, b.bottom - 52, 34, -2.7, -0.4).strokePath();
    for (const f of this.faults) {
      const active = f.t >= 1.7;
      g.fillStyle(this.color, active ? 0.6 : 0.12).fillRect(f.x - 38, this.floorY - (active ? 180 : 8), 76, active ? 180 : 8);
      g.lineStyle(active ? 2 : 1, active ? 0xfff0c9 : this.color, 1).strokeRect(f.x - 38, this.floorY - 10, 76, 10);
      if (!active) this.floorMark(f.x, 38, f.t / 1.7, this.color);
    }
    if (this.state === 'attack' && this.attack === 'hammer' && this.st < 0.95) this.glint(this.x + this.face * 40, b.bottom - 92, 0xffd89a);
    if (this.state === 'attack' && this.attack === 'sweep' && this.st < 1.2) g.lineStyle(2, 0xffca83, 1).lineBetween(this.x - 80, this.floorY - 20, this.x + 80, this.floorY - 20);
  }
}

/** The boss a room's `boss` entity names, if it is ported. */
export function makeBoss(w: WorldApi, k: BossKey, x: number, feet: number): Boss {
  if (k === 'cinder_monarch') return new CinderMonarch(w, x, feet);
  return new FallenMonarch(w, k === 'plague_monarch', x, feet);
}

/**
 * Atlas frames, cut once at boot. Crops are the original's (remnant/src/render/fallenArt.ts):
 * [sx, sy, sw, sh, pivotX, pivotY] in atlas pixels, drawn at the original's scale.
 */
export function cutBossFrames(scene: Phaser.Scene) {
  // Each frame carries its own pivot (the feet), so a sprite stays planted as its crop width changes.
  const add = (tex: string, name: string, c: number[]) => {
    const t = scene.textures.get(tex);
    if (!t || t.key === '__MISSING' || t.has(name)) return;
    const f = t.add(name, 0, c[0], c[1], c[2], c[3]);
    if (!f) return;
    f.customPivot = true;
    f.pivotX = c[4] / c[2];
    f.pivotY = c[5] / c[3];
  };
  const BEAST = [[0, 0, 355, 512, 211, 500], [355, 0, 380, 512, 192, 500], [735, 0, 480, 512, 226, 500], [1215, 0, 321, 512, 177, 500], [0, 512, 425, 512, 228, 472], [425, 512, 380, 512, 190, 472], [805, 512, 365, 512, 185, 472], [1170, 512, 366, 512, 193, 472]];
  BEAST.forEach((c, i) => add('varkhos', `beast_monarch-${i}`, c));
  const size = scene.textures.get('morvane').getSourceImage().width / 2;
  for (let i = 0; i < 8; i++) {
    const idx = i === 0 ? 0 : i === 7 || i === 6 ? 3 : i === 1 ? 1 : 2;
    add('morvane', `plague_monarch-${i}`, [(idx % 2) * size, Math.floor(idx / 2) * size, size, size, size * 0.6, size * 0.96]);
  }
  const unit = scene.textures.get('azkar').getSourceImage().width / 1254;
  const CINDER = [[0, 0, 660, 640, 395, 604], [660, 0, 594, 640, 420, 612], [0, 640, 760, 614, 395, 548], [760, 640, 494, 614, 295, 546]];
  CINDER.forEach((c, i) => add('azkar', `cinder_monarch-${i}`, c.map((v) => v * unit)));
}

/** The scale each atlas is drawn at (the original's). */
export function bossScale(scene: Phaser.Scene, key: BossKey) {
  if (key === 'beast_monarch') return 0.24;
  if (key === 'plague_monarch') return 118 / (scene.textures.get('morvane').getSourceImage().width / 2);
  return 0.21 / (scene.textures.get('azkar').getSourceImage().width / 1254);
}
