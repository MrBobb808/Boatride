// Chapter XIII: the Prince of Tyrus (Ezekiel 26–28). A merchant prince on an island "in the midst of the seas", grown
// rich on a traffick that sells "the persons of men" (Ezekiel 27:13). He says "I am a God" (28:2), he is "wiser than
// Daniel" (28:3), and every precious stone is his covering (28:13). One prince in three movements:
//
// - THE PRINCE (from the start): a sceptre combo, his wares thrown as a fan of precious stones, the slaver's fetter
//   (a chain that drags Elior to him unless it is parried, jumped or dodged), and his hired swords (27:10).
//   He READS Elior: the same kind of blow landed again and again is turned aside until the attack changes.
// - THE COVERING (two thirds): nine stones stand round him and blunt every blow until they are struck off one by
//   one; the stones of fire erupt along the floor in two turns (28:14), and his brightness sweeps the hall (28:17).
// - THE FIRE FROM THE MIDST (one third): "therefore will I bring forth a fire from the midst of thee, it shall
//   devour thee" (28:18). The covering is gone and he burns from within: his health falls by itself while he rages.
//   The fetters he sold men in bind him (Psalm 149:8) and he is brought to ashes. Elior only withstands.

import { BossBase, MP } from './bosses2';
import { type HitInfo } from './entity';
import { solve, newJoints, Chain, drawRibbon, type Joints, type Pose } from '../render/skeleton';
import { glow, rgba, poly, type Ctx } from '../render/draw';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { moveBody } from './physics';
import { SENT_DIMS } from './enemies';
import type { EnemyKind } from './tiles';

type Atk = 'sceptre' | 'wares' | 'fetter' | 'stones' | 'brightness' | 'devour' | 'summon';
/** The kinds of blow he can read. */
export type Read = 'light' | 'heavy' | 'chain' | 'craft';
const READ_WORD: Record<Read, string> = { light: 'quick blows', heavy: 'heavy blows', chain: 'chains', craft: 'arrows and abilities' };
const READ_COLOR: Record<Read, string> = { light: '#eaf6ff', heavy: '#ff8a5a', chain: '#ffb347', craft: '#9ab8ff' };

const PURPLE = '#6a2a7a', GOLD = '#e8c25a', HI = '#fff1c4', FIRE = '#ff7a2a';
/** "The sardius, topaz, and the diamond, the beryl, the onyx, and the jasper, the sapphire, the emerald, and the
 * carbuncle" (Ezekiel 28:13, KJV), in that order. */
export const STONES = ['#c8323a', '#f0c040', '#eaf6ff', '#7ad8c8', '#8a7a9a', '#c86a3a', '#3a6ae0', '#3ac870', '#ff4a6a'] as const;

const STYLE: HumanStyle = {
  skin: '#a87a58', hair: '#140e12', hairKind: 'long', beard: '#140e12', coat: PURPLE, coatDark: '#3a1446', skirt: 24, trim: GOLD,
  pants: '#3a1446', boots: '#1a0e14', glove: GOLD, belt: GOLD, plate: { c: '#c8a040', dark: '#6a4a18', hi: '#fff1c4', tier: 2 },
  helm: 'none', eye: '#fff1c4', eyeGlow: 1, outline: '#08040a',
  weapon: 'staff', weaponColor: GOLD, weaponGlow: '#ff4a6a', weaponGlowAmt: 0.5, offhand: 'none', bulk: 1.3, crest: PURPLE,
};
/** In the last movement the purple is burned off him. */
const BURNT: HumanStyle = { ...STYLE, coat: '#4a1a1a', coatDark: '#1a0808', pants: '#1a0808', trim: FIRE, weaponGlow: FIRE, weaponGlowAmt: 0.9, eye: '#ffb060' };

/** His hired swords, by movement: "They of Persia and of Lud and of Phut were in thine army" (Ezekiel 27:10, KJV). */
const HIRED: EnemyKind[][] = [['knight', 'archer'], ['lion', 'soldier', 'priest']];

interface Mark { x: number; t: number; at: number; set: Set<number> }
interface Beam { x: number; dir: number; t: number; to: number; set: Set<number> }

export class TyrusPrince extends BossBase {
  pixelBox = [-190, -190, 190, 14] as const;
  j: Joints = newJoints();
  pose: Pose = { ...MP.planted };
  target: Pose = { ...MP.planted };
  rate = 8;
  cape: Chain;
  atk: Atk | null = null;
  lastAtk: Atk | null = null;
  step = 0;
  steps = 3;
  grounded = true;
  scale = 1.9;
  marks: Mark[] = [];
  beams: Beam[] = [];
  servants: { remove: boolean; dying: boolean }[] = [];
  callT = 7;
  // ---- he reads Elior
  /** The kind of blow he has read, and how long he keeps it. */
  read: Read | null = null;
  readT = 0;
  /** The run of one kind that he is counting. */
  lastKind: Read | null = null;
  run = 0;
  lastBlowT = -9;
  told = false;
  // ---- the covering
  stones = 0;
  regrowT = 0;
  stoneSpin = 0;
  wings = 0;
  // ---- the fetter
  chainT = 0;
  chainX = 0;
  caught = false;
  // ---- the fire from the midst
  burnAcc = 0;
  burnShow = 0;
  fade = 1;
  bound = 0;

  constructor(x: number, y: number) {
    super('tyrus_prince', x, y, 34, 72, 1050000);
    this.name = 'The Prince of Tyrus';
    this.sub = 'He Saith, I Am a God';
    this.maxPoise = this.poise = 1400;
    this.kneelTime = 2.6;
    this.p2At = 0.66;
    this.p3At = 0.33;
    this.phaseMarks = [0.66, 0.33];
    this.face = -1;
    this.hitSound = 'hitMetal';
    this.collide = true;
    this.heavyBody = true;
    this.cape = new Chain(10, 7, x, y - 60);
    solve(this.pose, SENT_DIMS, true, this.j);
  }

  get dmg() { return 590 * this.ngMul * this.encounterDamage * (this.phase >= 3 ? 1.2 : this.phase === 2 ? 1.1 : 1); }
  get spd() { return this.phase >= 3 ? 1.4 : this.phase === 2 ? 1.15 : 1; }
  /** How many like blows in a row before he has read them. */
  get readAt() { return this.phase >= 2 ? 3 : 4; }
  hurtbox() {
    const low = this.state === 'kneel' || this.state === 'dead' ? 20 : 0, h = 38 * this.scale;
    return { x: this.x - 17, y: this.y - h + low, w: 34, h: h - low };
  }
  get cy() { return this.y - 20 * this.scale; }
  hand() { return { x: this.x + this.face * this.j.haFX * this.scale, y: this.y + this.j.haFY * this.scale }; }

  // ------------------------------------------------------------ lifecycle
  updateDormant(_dt: number) {
    this.target = { ...MP.planted, head: 0.05 + Math.sin(G.time * 0.6) * 0.04 };
  }

  updateIntro(_dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 30, y: this.y - 60 };
    if (t < 0.6) this.target = { ...MP.planted, head: 0.2 };
    else if (this.introT === 0) {
      this.introT = 1;
      this.target = { ...MP.salute };
      this.rate = 8;
      sfx('bell', { vol: 0.7, pitch: 0.7 });
      sfx('bossRoar', { pitch: 0.85 });
      fx.ring(this.x, this.y - 50, 12, 280, GOLD, 0.8, 5);
      for (let i = 0; i < 9; i++) fx.shards(this.x + rand(-40, 40), this.y - rand(30, 110), 2, STONES[i], 0.8);
      G.camera.addTrauma(0.4 * shakeScale());
      G.ui.banner('THE PRINCE OF TYRUS', this.sub, 'boss');
      music.play('persia', 0.6);
      music.phase = 0;
    } else if (t > 2.2) {
      this.target = { ...MP.guard };
      this.beginFight();
    }
  }

  updateKneel(dt: number) {
    this.target = { ...MP.kneel, head: 0.5 + Math.sin(G.time * 3) * 0.05 };
    this.physics(dt);
    this.consume(dt);
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
  }

  onKneel() {
    this.atk = null;
    this.collide = true;
    this.marks.length = 0;
    this.beams.length = 0;
    this.chainT = 0;
    this.read = null;
    this.readT = 0;
    this.run = 0;
    G.ui.toast('The prince staggers: strike now.', 'good');
  }

  recover() {
    super.recover();
    this.target = { ...MP.guard };
    if (this.phase === 2 && this.stones <= 0) this.regrowT = 9;
  }

  // ------------------------------------------------------------ he reads; the covering
  private kindOf(h: HitInfo): Read | null {
    if (h.kind === 'echo' || h.kind === 'hazard') return null;
    if (h.tag === 'chain') return 'chain';
    if (h.kind === 'ability' || h.kind === 'proj') return 'craft';
    return h.heavy || h.launch ? 'heavy' : 'light';
  }

  takeHit(h: HitInfo): boolean {
    if (!this.fighting || this.invuln > 0 || this.dying || h.dot || this.state === 'kneel') return super.takeHit(h);
    const k = this.kindOf(h);
    if (!k) return super.takeHit(this.stones > 0 ? { ...h, dmg: h.dmg * 0.45 } : h);
    // The many hits of one move count as one blow.
    const fresh = k !== this.lastKind || G.time - this.lastBlowT > 0.25;
    let mul = 1, poise = h.poise;
    if (this.readT > 0 && k === this.read) {
      // Read: the blow is turned on his sceptre and barely lands.
      mul = 0.2; poise = 0;
      if (fresh) {
        fx.hitSparks(this.x - sign(h.dir || 1) * 14, this.cy, -(h.dir || 1), READ_COLOR[k], 8, 0.8);
        sfx('parry', { pan: G.world.pan(this.x), pitch: 1.3, vol: 0.5 });
        fx.number(this.x, this.cy - 46, 'READ', false, READ_COLOR[k]);
      }
    } else {
      if (this.readT > 0) {
        // Surprised by a different attack: the read is broken and he reels.
        this.readT = 0; this.read = null;
        poise += this.maxPoise * 0.15;
        fx.ring(this.x, this.cy, 8, 70, HI, 0.3, 3);
        sfx('guardBreak', { pan: G.world.pan(this.x), vol: 0.6 });
        this.run = 0; this.lastKind = null;
      }
      if (fresh) {
        if (k === this.lastKind) this.run++; else { this.lastKind = k; this.run = 1; }
        if (this.run >= this.readAt) this.readNow(k);
        if (this.stones > 0) this.strikeStone();
      }
    }
    if (fresh) this.lastBlowT = G.time;
    if (this.stones > 0) mul *= 0.45;
    return super.takeHit(mul === 1 && poise === h.poise ? h : { ...h, dmg: h.dmg * mul, poise });
  }

  private readNow(k: Read) {
    this.read = k;
    this.readT = 5;
    this.run = 0;
    sfx('veil', { pan: G.world.pan(this.x), pitch: 1.4, vol: 0.6 });
    fx.ring(this.x, this.y - 62 * this.scale, 30, 6, READ_COLOR[k], 0.35, 2);
    G.ui.toast(this.told ? `He has read your ${READ_WORD[k]}.` : `He has read your ${READ_WORD[k]}: change your attack.`, 'warn');
    this.told = true;
  }

  /** One stone of the covering is struck off. When the ninth goes he is bare, and falls to his knee. */
  private strikeStone() {
    this.stones--;
    const c = STONES[this.stones];
    fx.shards(this.x, this.cy - 10, 8, c, 1.2);
    sfx('shatter', { pan: G.world.pan(this.x), pitch: 1.1 + (9 - this.stones) * 0.05, vol: 0.6 });
    if (this.stones > 0) return;
    fx.flash(HI, 0.25);
    fx.ring(this.x, this.cy, 12, 200, HI, 0.5, 4);
    G.camera.addTrauma(0.5 * shakeScale());
    G.ui.toast('His covering is broken.', 'good');
    this.poise = 0;
  }

  private cover() {
    this.stones = 9;
    this.regrowT = 0;
    sfx('bell', { vol: 0.5, pitch: 1.3 });
    for (let i = 0; i < 9; i++) fx.shards(this.x + rand(-50, 50), this.cy + rand(-40, 40), 2, STONES[i], 0.6);
    fx.ring(this.x, this.cy, 160, 20, GOLD, 0.5, 3);
  }

  /** The fire from the midst of him: in the last movement his health falls by itself. */
  private consume(dt: number) {
    if (this.phase < 3 || this.dying) return;
    this.burnAcc += this.maxHp * 0.0035 * dt;
    this.burnShow += dt;
    if (this.burnAcc < 1) return;
    const d = Math.floor(this.burnAcc);
    this.burnAcc -= d;
    this.hp -= d;
    if (this.burnShow >= 1) { this.burnShow = 0; fx.number(this.x + rand(-16, 16), this.cy - 30, Math.round(this.maxHp * 0.0035), false, '#ffb36a'); }
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const dx = p.x - this.x, dist = Math.abs(dx);
    this.tickMarks(dt);
    this.tickBeams(dt);
    this.readT = Math.max(0, this.readT - dt);
    if (this.readT <= 0) this.read = null;
    if (this.phase === 2 && this.stones <= 0 && this.regrowT > 0) { this.regrowT -= dt; if (this.regrowT <= 0) this.cover(); }
    this.consume(dt);
    if (this.dying) return;
    this.servants = this.servants.filter((e) => !e.remove && !e.dying);
    this.callT -= dt;
    if (this.state === 'idle') {
      this.face = sign(dx) || this.face;
      this.target = { ...MP.guard, lean: 0.15 + Math.sin(G.time * 2) * 0.03 };
      const want = dist > 96 ? sign(dx) * 84 * this.spd : dist < 44 ? -sign(dx) * 50 : 0;
      this.body.vx = approach(this.body.vx, want, 540 * dt);
      this.physics(dt);
      this.cd -= dt * this.spd;
      if (this.callT <= 0 && this.phase < 3 && this.servants.length < 3) this.start('summon');
      else if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const ph = this.phase;
    const near: Atk[] = ph >= 3 ? ['devour', 'sceptre', 'devour', 'stones'] : ph === 2 ? ['sceptre', 'sceptre', 'stones', 'brightness'] : ['sceptre', 'sceptre', 'wares', 'fetter'];
    const far: Atk[] = ph >= 3 ? ['fetter', 'wares', 'brightness', 'stones'] : ph === 2 ? ['wares', 'fetter', 'brightness', 'stones'] : ['wares', 'fetter', 'fetter'];
    const pool = dist < 110 ? near : far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    this.start(a);
  }

  start(a: Atk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.hitSet.clear();
    this.steps = this.phase >= 3 ? 4 : 3;
    this.caught = false;
    this.chainT = 0;
    this.face = sign(G.world.player.x - this.x) || this.face;
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.collide = true;
    this.chainT = 0;
    this.cd = cd / this.spd;
    this.rate = 8;
  }

  private physics(dt: number) {
    const b = this.body;
    b.vy = Math.min(800, b.vy + 1500 * this.grav * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, true);
    this.grounded = b.onGround;
    this.x = clamp(this.x, 40, G.world.grid.w * 16 - 40);
  }

  private hit(bx: number, by: number, bw: number, bh: number, mul: number, extra: Partial<HitInfo> = {}) {
    const f = this.face, k = this.scale / 2;
    const x = f > 0 ? this.x + bx * k : this.x - (bx + bw) * k;
    return G.world.hitPlayerSide({ x, y: this.y + by * k, w: bw * k, h: bh * k }, { dmg: this.dmg * mul, poise: 40, kx: f * 260, ky: -200, dir: f, kind: 'melee', src: this, parryable: true, ...extra }, this.hitSet);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body, fire = this.phase >= 3;
    switch (this.atk) {
      case 'sceptre': {
        // Down-stroke, a rising sweep, a thrust; burning, a fourth.
        const kind = this.step % 3;
        const tel = (this.step === 0 ? 0.5 : kind === 2 ? 0.34 : 0.28) / sp;
        const act = 0.14, rec = this.step === this.steps - 1 ? 0.62 : 0.12;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.overhead : kind === 1 ? MP.low : MP.draw;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 0 ? MP.downcut : kind === 1 ? MP.rising : MP.thrust;
          if (t - dt < tel) {
            b.vx = f * (kind === 2 ? 340 : 200);
            sfx(kind === 2 ? 'spearThrust' : 'swingHeavy', { pan: W.pan(this.x), pitch: 0.7 });
            const hd = this.hand(), c = fire ? FIRE : '#ff4a6a';
            if (kind === 0) fx.slash(hd.x, hd.y - 6, 54, -2.6, 0.9, 12, f, HI, c, 0.2);
            else if (kind === 1) fx.slash(hd.x, hd.y - 6, 54, 1.0, -2.4, 12, f, HI, c, 0.2);
            else fx.streak(this.x + f * 14, this.y - 40, this.x + f * 126, this.y - 40, c, 0.2, 4);
          }
          if (kind === 0) this.hit(-4, -96, 94, 96, 1, { poise: 50 });
          else if (kind === 1) this.hit(-4, -104, 86, 100, 1, { poise: 50, ky: -360, kx: f * 140 });
          else this.hit(0, -58, 128, 30, 1.25, { poise: 66, kx: f * 360, ky: -180 });
        } else if (t < tel + act + rec) this.rate = 8;
        else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (this.step >= this.steps || Math.abs(dx) > 170) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'wares': {
        // "With the multitude of thy riches and of thy merchandise" (Ezekiel 27:33): his wares, thrown. Two fans of
        // precious stones with gaps between them; jump the low ones or step between.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = t < 0.5 ? MP.salute : MP.thrust;
        this.rate = t < 0.5 ? 8 : 24;
        const fans = fire ? 3 : 2;
        if (t < dt * 1.5) sfx('beamCharge', { pan: W.pan(this.x), pitch: 1.4, vol: 0.5 });
        if (this.step < fans && t >= 0.5 + this.step * 0.55 / sp) {
          const n = this.phase >= 2 ? 5 : 4, p = W.player, hd = this.hand();
          const ox = this.x + f * 20, oy = hd.y - 30;
          const aim = Math.atan2((p.y - 24) - oy, p.x - ox), off = this.step % 2 ? 0.5 : 0;
          for (let i = 0; i < n; i++) {
            const a = aim + (i - (n - 1) / 2 + off) * 0.24;
            W.add(new Proj('star', ox, oy, 'enemy', this.dmg * 0.45, { vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 3, w: 9, h: 9, color: STONES[(i * 2 + this.step * 3) % 9], poise: 16 }));
          }
          this.step++;
          sfx('shatter', { pan: W.pan(this.x), pitch: 1.5, vol: 0.6 });
          fx.ring(ox, oy, 4, 40, GOLD, 0.25, 2);
        }
        if (t > 0.5 + fans * 0.55 / sp + 0.7) this.endAttack(1.0);
        break;
      }
      case 'fetter': {
        // The slaver's chain: thrown straight along the floor at chest height. It drags whoever it takes to his feet,
        // and the sceptre comes down. Parry it, jump it or dodge it and it falls slack, and he is open.
        const tel = 0.6 / Math.min(sp, 1.25), out = 0.26, reach = 340;
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        if (t < tel) {
          this.rate = 12;
          this.target = MP.draw;
          if (t < dt * 1.5) sfx('chainWhirl', { pan: W.pan(this.x), vol: 0.7 });
        } else if (t < tel + out) {
          this.rate = 30;
          this.target = MP.thrust;
          if (this.step === 0) { this.step = 1; sfx('chainThrow', { pan: W.pan(this.x) }); }
          this.chainT = (t - tel) / out;
          this.chainX = this.x + f * (30 + reach * this.chainT);
          const x0 = Math.min(this.x + f * 24, this.chainX), w = Math.abs(this.chainX - (this.x + f * 24));
          // Knocked toward him: the chain pulls.
          if (!this.caught && W.hitPlayerSide({ x: x0, y: this.y - 50, w, h: 26 }, { dmg: this.dmg * 0.4, poise: 30, kx: -f * 560, ky: -150, dir: -f, kind: 'melee', src: this, parryable: true }, this.hitSet)) {
            this.caught = true;
            sfx('chainBite', { pan: W.pan(W.player.x) });
            G.ui.toast('Fettered', 'warn');
          }
        } else if (this.caught) {
          // The catch: the sceptre comes down where the chain brought him.
          const u = t - tel - out;
          this.chainT = Math.max(0, 1 - u / 0.2);
          if (u < 0.34) { this.rate = 14; this.target = MP.overhead; }
          else if (u < 0.5) {
            this.rate = 30; this.target = MP.downcut;
            if (this.step === 1) { this.step = 2; this.hitSet.clear(); sfx('bossSlam', { pan: W.pan(this.x), pitch: 1.1, vol: 0.8 }); G.camera.addTrauma(0.4 * shakeScale()); fx.dust(this.x + f * 50, this.y, 14, 2); }
            this.hit(-10, -100, 110, 100, 1.2, { poise: 60, parryable: false });
          } else if (u > 1.0) this.endAttack(1.0);
        } else {
          // Slack: he hauls it back hand over hand, wide open.
          const u = t - tel - out;
          this.chainT = Math.max(0, 1 - u / 0.7);
          this.rate = 6;
          this.target = MP.stagger;
          if (this.step === 1) { this.step = 2; this.poise -= this.maxPoise * 0.1; if (this.poise <= 0) { this.kneel(); return; } }
          if (u > 1.1) this.endAttack(0.8);
        }
        break;
      }
      case 'stones': {
        // "Thou hast walked up and down in the midst of the stones of fire" (Ezekiel 28:14): the floor erupts in two
        // turns, every other stone and then the ones between. Stand where the first has burned.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = t < 0.5 ? MP.overhead : MP.downcut;
        this.rate = t < 0.5 ? 10 : 26;
        const turns = fire ? 3 : 2;
        if (this.step < turns && t >= 0.5 + this.step * 0.8 / sp) {
          const w = W.grid.w * 16, odd = this.step % 2;
          for (let x = 88 + odd * 64, i = 0; x < w - 60; x += 128, i++) this.marks.push({ x, t: 0, at: 0.85, set: new Set() });
          this.step++;
          sfx('quake', { vol: 0.5 });
          G.camera.addTrauma(0.2 * shakeScale());
        }
        if (t > 0.5 + turns * 0.8 / sp + 1.0) this.endAttack(1.1);
        break;
      }
      case 'brightness': {
        // "Thou hast corrupted thy wisdom by reason of thy brightness" (Ezekiel 28:17): a wall of light crosses the
        // hall from the far wall to him (burning, from both). Dodge through it.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        this.rate = 8;
        const w = W.grid.w * 16;
        if (this.step === 0 && t >= 0.7) {
          this.step = 1;
          sfx('beamFire', { vol: 0.7 });
          const pSide = W.player.x < this.x ? -1 : 1;
          for (const s of fire ? [pSide, -pSide] : [pSide]) this.beams.push({ x: s < 0 ? 50 : w - 50, dir: -s, t: 0, to: this.x + s * 30, set: new Set() });
        } else if (this.step === 0 && t < dt * 1.5) sfx('beamCharge', { vol: 0.6, pitch: 0.9 });
        if (this.step === 1 && !this.beams.length) this.endAttack(1.0);
        break;
      }
      case 'devour': {
        // The fire comes out of the midst of him: a burst all round, a wave along the floor each way, and gouts
        // that pool. It costs him: the fire is his own.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        const tel = 0.75;
        if (t < tel) {
          this.rate = 8;
          this.target = MP.crouch;
          if (t < dt * 1.5) sfx('beamCharge', { pan: W.pan(this.x), pitch: 0.6, vol: 0.7 });
        } else if (this.step === 0) {
          this.step = 1;
          this.target = MP.rising;
          this.rate = 30;
          sfx('explode', { pan: W.pan(this.x), vol: 0.9 });
          G.camera.addTrauma(0.6 * shakeScale());
          fx.flash(FIRE, 0.2);
          fx.ring(this.x, this.cy, 14, 150, FIRE, 0.4, 6);
          fx.embers(this.x, this.cy, 30, '#ffb347', 40);
          this.hitSet.clear();
          const d = sign(W.player.x - this.x) || 1;
          W.hitPlayerSide({ x: this.x - 125, y: this.y - 150, w: 250, h: 150 }, { dmg: this.dmg * 1.2, poise: 70, kx: d * 380, ky: -300, dir: d, kind: 'melee', src: this, unblockable: true, parryable: false }, this.hitSet);
          for (const s of [-1, 1]) {
            W.add(new Proj('wave', this.x + s * 30, this.y, 'enemy', this.dmg * 0.6, { vx: s * 320, life: 1.8, w: 16, h: 30, color: FIRE, big: true }));
            for (let i = 0; i < 2; i++) W.add(new Proj('flame', this.x + s * 10, this.cy, 'enemy', this.dmg * 0.4, { vx: s * (150 + i * 110), vy: -260 - i * 40, life: 3, w: 10, h: 10, color: '#ff8a3a' }));
          }
          // It devours him.
          this.hp = Math.max(1, this.hp - Math.round(this.maxHp * 0.008));
        } else if (t > tel + 1.0) this.endAttack(1.2);
        break;
      }
      case 'summon': {
        // His traffick buys swords.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.salute;
        if (t >= 0.6 && this.step === 0) {
          this.step = 1;
          this.callT = 14;
          sfx('coin', { vol: 0.8 });
          sfx('horn', { vol: 0.6 });
          G.ui.toast('The prince hires swords', 'warn');
          const w = W.grid.w * 16, host = HIRED[Math.min(1, this.phase - 1)];
          for (let i = 0; i < 2; i++) {
            const x = i % 2 ? w - 120 - rand(0, 80) : 120 + rand(0, 80);
            this.servants.push(W.spawnEnemy(host[(i + (this.callT | 0)) % host.length], x, this.y));
            fx.column(x, this.y, 26, 150, GOLD, 0.6);
            fx.dust(x, this.y, 10, 1.4);
          }
        }
        if (t > 1.3) this.endAttack(0.8);
        break;
      }
    }
  }

  private tickMarks(dt: number) {
    const W = G.world;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      const was = m.t;
      m.t += dt;
      if (m.t < m.at) continue;
      if (was < m.at) {
        if (i % 3 === 0) sfx('fireBurst', { pan: W.pan(m.x), vol: 0.4 });
        fx.column(m.x, this.y, 30, 150, FIRE, 0.35);
        fx.embers(m.x, this.y - 10, 5, '#ffb347', 14);
      }
      if (m.t < m.at + 0.3) {
        W.hitPlayerSide({ x: m.x - 22, y: this.y - 150, w: 44, h: 150 }, { dmg: this.dmg * 0.7, poise: 40, kx: 0, ky: -260, dir: 0, kind: 'proj', src: this, unblockable: true, parryable: false }, m.set);
      } else this.marks.splice(i, 1);
    }
  }

  private tickBeams(dt: number) {
    const W = G.world;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const m = this.beams[i];
      m.t += dt;
      m.x += m.dir * 400 * dt;
      W.hitPlayerSide({ x: m.x - 13, y: this.y - 230, w: 26, h: 230 }, { dmg: this.dmg * 0.8, poise: 50, kx: m.dir * 300, ky: -220, dir: m.dir, kind: 'proj', src: this, unblockable: true, parryable: false }, m.set);
      if (Math.random() < dt * 30) fx.spawn(PK.Spark, m.x, this.y - rand(0, 200), -m.dir * 60, rand(-30, 30), 0.3, 2, 0.3, HI, 0, 2);
      if ((m.dir > 0 && m.x >= m.to) || (m.dir < 0 && m.x <= m.to)) this.beams.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ the three movements
  beginTransition() { this.change(2); }
  enterPhase3() { this.change(3); }

  private change(phase: number) {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.collide = true;
    this.phase = phase;
    this.introT = 0;
    this.invuln = 999;
    this.marks.length = 0;
    this.beams.length = 0;
    this.chainT = 0;
    this.read = null;
    this.readT = 0;
    this.run = 0;
    this.maxPoise = this.poise = phase >= 3 ? 1600 : 1500;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.6, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 60 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 0.9) {
      this.target = { ...MP.kneel, lean: 0.4, head: 0.4 };
      this.rate = 6;
      if (this.introT === 0) {
        this.introT = 1;
        sfx('bossRoar', { pitch: this.phase >= 3 ? 0.55 : 0.75 });
        G.camera.addTrauma(0.4 * shakeScale());
        G.ui.caption(this.phase === 2
          ? '“Thou art the anointed cherub that covereth; and I have set thee so.” · Ezekiel 28:14 (KJV)'
          : '“…therefore will I bring forth a fire from the midst of thee, it shall devour thee…” · Ezekiel 28:18 (KJV)');
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      this.target = { ...MP.rising, head: -0.3 };
      this.rate = 8;
      if (this.phase >= 3) {
        // The covering burns off him, and his hired swords will not stay to watch.
        this.sub = 'A Fire from the Midst of Him';
        for (let i = 0; i < this.stones; i++) fx.shards(this.x + rand(-40, 40), this.cy + rand(-40, 40), 5, STONES[i], 1.4);
        this.stones = 0;
        this.regrowT = 0;
        fx.flash(FIRE, 0.35);
        fx.embers(this.x, this.cy, 40, '#ffb347', 50);
        sfx('explode', { vol: 0.8 });
        for (const e of this.servants) if (!e.remove && !e.dying) { const q = e as unknown as { x: number; y: number }; fx.dust(q.x, q.y, 10, 1.4); e.remove = true; }
        this.servants.length = 0;
      } else {
        this.sub = 'Every Precious Stone His Covering';
        this.cover();
        fx.flash(HI, 0.3);
      }
      fx.ring(this.x, this.y - 40, 10, 320, this.phase >= 3 ? FIRE : GOLD, 0.9, 6);
      fx.column(this.x, this.y, 60, 320, HI, 0.6);
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.banner('THE PRINCE OF TYRUS', this.sub, 'boss');
      music.bossPhase(this.phase - 1);
      this.callT = 6;
    } else if (t > 2.2) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.8;
      this.invuln = 0;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.ui.caption(null);
      G.ui.bossBar(this.name, this.sub);
      G.camera.focus = null;
    }
  }

  die() {
    super.die();
    this.atk = null;
    this.collide = true;
    this.marks.length = 0;
    this.beams.length = 0;
    this.chainT = 0;
    this.read = null;
    this.readT = 0;
    this.stones = 0;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 50 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 2.2) {
      // A man, and no God.
      this.target = { ...MP.kneel, lean: 0.5, head: 0.3 };
      this.rate = 5;
      if (this.introT !== 7) {
        this.introT = 7;
        sfx('bossRoar', { pitch: 0.5 });
        G.ui.caption('“Wilt thou yet say before him that slayeth thee, I am God? but thou shalt be a man, and no God, in the hand of him that slayeth thee.” · Ezekiel 28:9 (KJV)');
        for (const e of this.servants) if (!e.remove && !e.dying) { const q = e as unknown as { x: number; y: number }; fx.dust(q.x, q.y, 10, 1.4); e.remove = true; }
        this.servants.length = 0;
      }
    } else if (t < 4.2) {
      // The fetters he sold men in rise out of the floor and take him.
      if (this.introT === 7) {
        this.introT = 8;
        sfx('chainThrow', { vol: 0.9 });
        sfx('chainBite', { vol: 0.9 });
        G.camera.addTrauma(0.4 * shakeScale());
        G.ui.caption('“To bind their kings with chains, and their nobles with fetters of iron” · Psalm 149:8 (KJV)');
      }
      this.bound = Math.min(1, (t - 2.2) / 0.5);
      this.target = { ...MP.kneel, lean: 0.2, head: -0.3 };
    } else if (t < 7.0) {
      // And the fire from the midst of him brings him to ashes, in the sight of all.
      if (this.introT === 8) {
        this.introT = 9;
        fx.flash(FIRE, 0.5);
        fx.column(this.x, this.y, 120, 420, '#ffb347', 1.6);
        fx.ring(this.x, this.y - 60, 20, 380, FIRE, 1.2, 6);
        sfx('explode', { vol: 1 });
        sfx('bell', { vol: 0.8 });
        G.camera.addTrauma(0.8 * shakeScale());
        G.ui.caption('“…I will bring thee to ashes upon the earth in the sight of all them that behold thee.” · Ezekiel 28:18 (KJV)');
      }
      this.fade = Math.max(0, 1 - (t - 4.6) / 1.8);
      if (this.fade > 0 && Math.random() < dt * 60) fx.spawn(PK.Ember, this.x + rand(-22, 22), this.y - rand(0, 120), rand(-20, 20), rand(-90, -30), 0.9, 2.5, 0.5, Math.random() < 0.5 ? '#ffb347' : '#6a6068');
    } else if (this.introT === 9) {
      this.introT = 10;
      this.fade = 0;
      this.bound = 0;
      G.ui.caption(null);
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    const k = Math.min(1, dt * this.rate);
    for (const key of Object.keys(this.target) as (keyof Pose)[]) this.pose[key] = lerp(this.pose[key], this.target[key], k);
    solve(this.pose, SENT_DIMS, true, this.j);
    const f = this.face, S = this.scale;
    this.cape.update(this.x + f * (this.j.shBX - 2) * S, this.y + this.j.shBY * S, dt, -this.body.vx * 2 - f * 70, 420, 0.88);
    this.stoneSpin += dt * (this.stones > 0 ? 1.6 : 0.6);
    this.wings = approach(this.wings, this.phase >= 2 && this.state !== 'dead' ? 1 : 0, dt * 0.9);
    if (this.state === 'dead' || this.state === 'dormant') return;
    if (this.phase >= 3 && Math.random() < dt * 26) fx.spawn(PK.Flame, this.x + rand(-14, 14), this.cy + rand(-30, 20), rand(-20, 20), rand(-120, -60), 0.5, 4, 1, Math.random() < 0.5 ? FIRE : '#ffcf6b', -40, 1);
    else if (this.phase < 3 && Math.random() < dt * 5) fx.spawn(PK.Mote, this.x + rand(-30, 30), this.y - rand(10, 120), rand(-6, 6), rand(-20, -6), 1.2, 2, 0.5, choose(STONES as unknown as string[]), -6, 1);
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const f = this.face, S = this.scale, fire = this.phase >= 3;
    for (const m of this.marks) if (m.t < m.at) this.floorMark(ctx, m.x, this.y, 24, m.t / m.at, FIRE);
    if (this.atk === 'devour' && this.step === 0) this.floorMark(ctx, this.x, this.y, 125, this.st / 0.75, FIRE);
    if (this.atk === 'brightness' && this.step === 0) {
      const w = G.world.grid.w * 16, side = G.world.player.x < this.x ? 50 : w - 50;
      this.glint(ctx, side, this.y - 100, HI, 1.6 + Math.sin(G.time * 20) * 0.3);
      if (fire) this.glint(ctx, w - side, this.y - 100, HI, 1.6);
    }
    // His brightness: a wall of light.
    for (const m of this.beams) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(HI, 0.55);
      ctx.fillRect(m.x - 5, this.y - 240, 10, 240);
      ctx.fillStyle = rgba(GOLD, 0.25);
      ctx.fillRect(m.x - 13, this.y - 240, 26, 240);
      glow(ctx, m.x, this.y - 6, 40, HI, 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.fade <= 0) return;
    ctx.globalAlpha = this.fade;
    if (this.wings > 0.02) this.drawWings(ctx);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 50, 80, fire ? FIRE : PURPLE, (0.16 + Math.sin(G.time * 3) * 0.04) * this.fade);
    if (fire) glow(ctx, this.x, this.cy, 26 + Math.sin(G.time * 9) * 4, '#ffcf6b', 0.55 * this.fade);
    ctx.globalCompositeOperation = 'source-over';
    drawRibbon(ctx, this.cape, 20, 26, fire ? '#4a1a1a' : PURPLE, '#08040a');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f * S, S);
    drawHumanoid(ctx, this.j, fire ? BURNT : STYLE, G.time, this.pose.rot, this.body.vx * f / S, this.body.vy / S);
    this.drawRegalia(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9) * this.fade;
      drawHumanoid(ctx, this.j, flashStyle(STYLE), G.time, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // The covering: the stones that are left stand round him.
    for (let i = 0; i < this.stones; i++) {
      const a = this.stoneSpin + i * (Math.PI * 2 / 9), back = Math.sin(a) < 0;
      const x = this.x + Math.cos(a) * 46, y = this.cy - 6 + Math.sin(a) * 13 + Math.sin(G.time * 2 + i) * 3;
      this.gem(ctx, x, y, back ? 3.2 : 4.4, STONES[i], back ? 0.55 : 1);
    }
    // The fetter.
    if (this.chainT > 0 && this.atk === 'fetter') {
      const hd = this.hand(), n = 14, tx = hd.x + (this.chainX - hd.x) * (this.st < 1 ? 1 : this.chainT), ty = this.y - 38;
      ctx.strokeStyle = '#3a3440';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hd.x, hd.y);
      for (let i = 1; i <= n; i++) { const u = i / n; ctx.lineTo(hd.x + (tx - hd.x) * u, hd.y + (ty - hd.y) * u + Math.sin(u * Math.PI) * 10 * (1 - this.chainT) + (i % 2 ? 1.5 : -1.5)); }
      ctx.stroke();
      ctx.strokeStyle = '#8a8490';
      ctx.lineWidth = 1;
      ctx.stroke();
      poly(ctx, [tx, ty - 5, tx + f * 9, ty, tx, ty + 5, tx - f * 3, ty], '#8a8490', '#08040a', 0.8);
    }
    if (this.state === 'attack' && this.atk === 'fetter' && this.step === 0) { const hd = this.hand(); this.glint(ctx, hd.x, hd.y - 6, '#c8c0d8', 1.3); }
    if (this.state === 'attack' && this.atk === 'sceptre' && this.step === 0 && this.st < 0.45 / this.spd) { const hd = this.hand(); this.glint(ctx, hd.x, hd.y - 8, '#ff4a6a', 1.3); }
    // He has read a kind of blow: an open eye over him, in that blow's colour.
    if (this.readT > 0 && this.read && this.fighting) {
      const c = READ_COLOR[this.read], y = this.y - 44 * S - 14, a = Math.min(1, this.readT);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, y, 18, c, 0.5 * a);
      ctx.strokeStyle = rgba(c, a);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(this.x, y, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', a);
      ctx.fillRect(this.x - 2, y - 2, 4, 4);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Bound: the fetters of the fairs come up out of the floor.
    if (this.bound > 0 && this.fade > 0) {
      ctx.strokeStyle = rgba('#c8c0d8', this.bound * this.fade);
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) for (const k of [70, 130]) {
        ctx.beginPath(); ctx.moveTo(this.x + s * k, this.y); ctx.lineTo(this.x + s * 8, this.y - 34 - (k > 100 ? 22 : 0)); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 44, 40, '#c8c0d8', 0.35 * this.bound * this.fade);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 40, 70, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** A cut stone: a small lozenge with a lit facet. */
  private gem(ctx: Ctx, x: number, y: number, r: number, c: string, a: number) {
    ctx.globalAlpha = a * this.fade;
    poly(ctx, [x, y - r * 1.3, x + r, y, x, y + r * 1.3, x - r, y], c, '#08040a', 0.6);
    poly(ctx, [x, y - r * 1.3, x + r, y, x, y], rgba('#ffffff', 0.45));
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, r * 3, c, 0.5 * a * this.fade);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = this.fade;
  }

  /** The covering cherub's wings behind the man: the power behind the throne (Ezekiel 28:14). Burning at the last. */
  private drawWings(ctx: Ctx) {
    const fire = this.phase >= 3, k = this.wings, beat = Math.sin(G.time * (fire ? 5 : 1.6)) * 0.06;
    const edge = fire ? FIRE : GOLD, body = fire ? '#2a0e0a' : '#2a1238';
    const shrink = fire ? 0.55 + 0.45 * clamp(this.hp / (this.maxHp * 0.33), 0, 1) : 1;
    ctx.save();
    ctx.translate(this.x, this.y - 58 * this.scale / 2 - 30);
    ctx.globalAlpha = 0.85 * k * this.fade;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s * k * shrink, k * shrink);
      ctx.rotate(-0.1 + beat);
      for (let i = 0; i < 6; i++) {
        const a = -0.9 + i * 0.3, len = 120 - i * 12, x = Math.cos(a) * len, y = Math.sin(a) * len;
        poly(ctx, [6, -4, x, y, x * 0.82 + 8, y * 0.82 + 22, 10, 14], body, edge, 0.8);
      }
      // Stones set in the wing, like eyes.
      this.gemAt(ctx, 62, -30, STONES[s < 0 ? 6 : 0]);
      this.gemAt(ctx, 86, -6, STONES[s < 0 ? 7 : 1]);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = this.fade;
  }
  private gemAt(ctx: Ctx, x: number, y: number, c: string) {
    poly(ctx, [x, y - 4, x + 3, y, x, y + 4, x - 3, y], c, '#08040a', 0.5);
  }

  /** His tall tiara, and the breastplate of nine stones (in the humanoid's own space). */
  private drawRegalia(ctx: Ctx) {
    const j = this.j;
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    poly(ctx, [-6.5, -6, -5, -15, -1.5, -21, 2, -21, 6, -15, 7.5, -6], this.phase >= 3 ? '#4a1a1a' : PURPLE, '#08040a', 0.6);
    poly(ctx, [-7, -6, 8, -6, 8, -8.5, -7, -8.5], GOLD);
    poly(ctx, [-5, -15, 6, -15, 5.6, -16.5, -4.6, -16.5], GOLD);
    poly(ctx, [0.2, -22.5, 2, -20, 0.2, -17.5, -1.6, -20], STONES[8], '#08040a', 0.4);
    for (const [x, c] of [[-4, STONES[6]], [0.5, STONES[1]], [5, STONES[7]]] as const) poly(ctx, [x, -8.6, x + 1.4, -7.2, x, -5.8, x - 1.4, -7.2], c);
    ctx.restore();
    if (this.phase >= 3) return;
    // Three rows of three on his breast.
    const mx = (j.neckX + j.hipX) / 2, my = (j.neckY + j.hipY) / 2 - 3;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-j.torsoA);
    poly(ctx, [-5.5, -6, 5.5, -6, 5.5, 6, -5.5, 6], '#6a4a18', '#08040a', 0.5);
    for (let i = 0; i < 9; i++) {
      const x = (i % 3 - 1) * 3.4, y = (Math.floor(i / 3) - 1) * 3.6;
      ctx.fillStyle = this.phase === 2 && i >= this.stones ? '#2a1c10' : STONES[i];
      ctx.fillRect(x - 1.1, y - 1.2, 2.2, 2.4);
    }
    ctx.restore();
  }

  drawOverlay(ctx: Ctx) {
    if (this.state !== 'kneel') return;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.7 + Math.sin(G.time * 10) * 0.3, y = this.y - 46 * this.scale;
    glow(ctx, this.x, y, 16, '#ffe6a8', 0.7 * p);
    ctx.strokeStyle = rgba('#fff6dc', p);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.x, y - 8); ctx.lineTo(this.x + 6, y); ctx.lineTo(this.x, y + 8); ctx.lineTo(this.x - 6, y); ctx.closePath();
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (this.fade > 0) lighting.add(this.x, this.y - 50, this.phase >= 3 ? 170 : 130, this.phase >= 3 ? FIRE : '#c88ae0', 0.6 * this.fade, 0.4);
    for (const m of this.marks) lighting.add(m.x, this.y - 20, 50, FIRE, 0.6, 0.6);
    for (const m of this.beams) lighting.add(m.x, this.y - 80, 110, HI, 0.9, 0.8);
  }
}
