// Chapter II bosses, built on the classic gate-then-throne arc:
//
// - THE GATEKEEPER: a three-headed hound chained before the Tower of Shinar.
//   Each head bites on its own, it pounces, and it whips its tail at anyone
//   who slips behind it. Halfway down it snaps its chain and breathes fire,
//   and near the end it howls for its pack.
// - THE CRIMSON MARSHAL: the Tower's last commander and an honour duel, so
//   your Echoes only kneel and watch. He fights with three-strike combos, a
//   lunge, a leaping slam, blood-edge crescents, a blink behind you, and a
//   parry that punishes careless swings. Beaten, he kneels and offers his sword.

import { bossScale } from './difficulty';
import { Entity, type HitInfo } from './entity';
import { solve, newJoints, Chain, drawRibbon, type Joints, type Pose } from '../render/skeleton';
import { glow, rgba, poly, circle, ellipse, limbShaded, limbStroke, lineGrad, type Ctx } from '../render/draw';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose, easeOutCubic } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { moveBody } from './physics';
import { SENT_BASE, SENT_DIMS } from './enemies';
import { marshalStyle } from './tanks';

export type BossKey = 'gatekeeper' | 'marshal' | 'locust_king' | 'golden_image' | 'weigher';

/** Shared lifecycle for the Chapter II bosses: intro, phases, kneel, defeat. */
export abstract class BossBase extends Entity {
  key: BossKey;
  phase = 0;
  state = 'dormant';
  st = 0;
  poise = 300;
  maxPoise = 300;
  cd = 2;
  hitSet = new Set<number>();
  hpShown = 1;
  introT = 0;
  defeatT = 0;
  /** Health fractions where the boss bar shows its phase notches. */
  phaseMarks = [0.6, 0.25];
  sub = '';
  kneelTime = 4;
  ngMul: number;
  /** Health fraction where phase 2 begins, then phase 3. */
  p2At = 0.6;
  p3At = 0.25;
  staggerFlash = 0;

  constructor(key: BossKey, x: number, y: number, w: number, h: number, hp: number) {
    super(x, y, w, h);
    this.key = key;
    this.team = 'enemy';
    this.isFoe = true;
    this.isBoss = true;
    this.heavyBody = true;
    this.layer = 4;
    this.invuln = 999;
    const diff = bossScale();
    this.ngMul = 1 + (G.save?.ng ?? 0) * 0.6;
    this.maxHp = this.hp = Math.round(hp * this.ngMul * diff.hp);
    // Every boss's attacks scale with ngMul, so difficulty rides on it too.
    this.ngMul *= diff.dmg;
  }

  get fighting() {
    return this.state === 'idle' || this.state === 'attack' || this.state === 'kneel';
  }
  executable() {
    return this.staggered > 0 && !this.dying && this.state === 'kneel';
  }
  canBeTargeted() {
    return !this.dying && !this.remove && this.fighting && this.visible();
  }
  visible() {
    return true;
  }

  awaken() {
    this.state = 'intro';
    this.st = 0;
    this.introT = 0;
  }

  /** Called once the intro ends. */
  beginFight() {
    this.state = 'idle';
    this.st = 0;
    this.phase = 1;
    this.invuln = 0;
    this.cd = 1.0;
    G.camera.focus = null;
    G.inCutscene = false;
    G.ui.cinematicBars(false);
    G.ui.bossBar(this.name, this.sub);
  }

  update(dt: number) {
    if (this.chill > 0 && this.fighting) dt *= 0.75;
    // Harder settings make the fight itself quicker, never the cutscenes.
    if (this.fighting && this.state !== 'kneel') dt *= bossScale().tempo;
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.staggerFlash = Math.max(0, this.staggerFlash - dt);
    this.hpShown = lerp(this.hpShown, this.hp / this.maxHp, Math.min(1, dt * 4));
    switch (this.state) {
      case 'dormant': this.updateDormant(dt); break;
      case 'intro': this.updateIntro(dt); break;
      case 'transition': this.updateTransition(dt); break;
      case 'dead': this.updateDeath(dt); break;
      case 'kneel':
        this.staggered -= dt;
        this.updateKneel(dt);
        if (this.staggered <= 0) this.recover();
        break;
      default: this.think(dt);
    }
    this.animate(dt);
  }

  abstract updateDormant(dt: number): void;
  abstract updateIntro(dt: number): void;
  abstract updateTransition(dt: number): void;
  abstract updateDeath(dt: number): void;
  abstract updateKneel(dt: number): void;
  abstract think(dt: number): void;
  abstract animate(dt: number): void;
  abstract beginTransition(): void;
  abstract enterPhase3(): void;
  abstract get dmg(): number;

  recover() {
    this.state = 'idle';
    this.st = 0;
    this.poise = this.maxPoise;
    this.cd = 0.9;
    this.staggered = 0;
  }

  /** Return true when the hit was turned aside. */
  guard(_h: HitInfo): boolean {
    return false;
  }

  hitColor = '#ffe6a8';
  hitSound = 'hitHeavy';

  takeHit(h: HitInfo): boolean {
    if (!this.fighting || this.invuln > 0 || this.dying) return false;
    if (h.dot) {
      const d = Math.max(1, Math.round(h.dmg));
      this.hp -= d;
      fx.number(this.x + rand(-20, 20), this.cy - 30, d, false, '#ffb36a');
      if (this.hp <= 0) {
        this.hp = 0;
        this.die();
      }
      return true;
    }
    if (this.state !== 'kneel' && this.guard(h)) return true;
    let dmg = h.dmg;
    if (this.state === 'kneel') dmg *= 1.5;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flash = 0.1;
    const hb = this.hurtbox();
    const px = h.px ?? clamp(this.x - sign(h.dir || 1) * hb.w * 0.3, hb.x, hb.x + hb.w);
    const py = h.py ?? hb.y + hb.h * rand(0.3, 0.7);
    fx.number(px, py - 10, dmg, h.crit);
    fx.hitSparks(px, py, h.dir || 1, this.hitColor, 10, 1.1);
    sfx(h.crit ? 'crit' : this.hitSound, { pan: G.world.pan(this.x), pitch: rand(0.85, 1.05), vol: 0.8 });
    if (h.stop) G.world.hitstop(h.stop * 0.7);
    if (this.state !== 'kneel') {
      this.poise -= h.poise * (h.kind === 'echo' ? 0.5 : 1);
      if (this.poise <= 0) this.kneel();
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return true;
    }
    if (this.phase === 1 && this.hp < this.maxHp * this.p2At) this.beginTransition();
    else if (this.phase === 2 && this.hp < this.maxHp * this.p3At) this.enterPhase3();
    return true;
  }

  kneel() {
    this.state = 'kneel';
    this.st = 0;
    this.staggered = this.kneelTime;
    this.staggerFlash = 0.4;
    sfx('stagger', { pitch: 0.6 });
    G.camera.addTrauma(0.4 * shakeScale());
    fx.dust(this.x, this.y, 18, 2);
    G.world.addRally(15);
    this.onKneel();
  }
  onKneel() {}

  die() {
    if (this.dying) return;
    this.state = 'dead';
    this.st = 0;
    this.dying = true;
    this.defeatT = 0;
    this.staggered = 0;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.ui.bossBar(null);
    G.world.slowmo(1.4, 0.25);
    music.stop(0.6);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
    for (const e of G.world.ents) if (e !== this && e.isFoe && !e.dying && !e.isBoss) e.takeHit({ dmg: 99999, poise: 999, kx: 0, ky: -100, dir: 1, kind: 'ability', src: G.world.player });
  }

  /** Telegraph glint (a four-point flare) for an incoming attack. */
  glint(ctx: Ctx, x: number, y: number, color: string, s = 1) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 18 * s, color, 0.9);
    ctx.strokeStyle = rgba('#ffffff', 0.95);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y); ctx.lineTo(x + 10 * s, y); ctx.moveTo(x, y - 7 * s); ctx.lineTo(x, y + 7 * s);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Floor marker that shrinks to the moment of impact. */
  floorMark(ctx: Ctx, x: number, y: number, r: number, u: number, c: string) {
    const a = 0.5 + Math.sin(G.time * 18) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ellipse(ctx, x, y - 1, r, 3.5, 0, rgba(c, a * 0.5));
    glow(ctx, x, y - 2, r * 1.1, c, a * 0.45);
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y - 1, Math.max(1, r * (1 - clamp(u, 0, 1))), 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// =====================================================================
// THE GATEKEEPER
// =====================================================================

type GAtk = 'bite' | 'triple' | 'pounce' | 'tail' | 'breath' | 'charge' | 'howl';

interface Head {
  /** Rest offset from the neck root, in body space. */
  rx: number; ry: number;
  /** Neck root. */
  bx: number; by: number;
  x: number; y: number;
  open: number;
  ang: number;
  /** 0..1: how far into a bite lunge. */
  lunge: number;
  /** Rear-back before a bite. */
  rear: number;
  glowA: number;
  scale: number;
}

/** Two-bone IK: returns the joint between a root and an end effector. */
function ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, bend: number): [number, number, number, number] {
  let dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.01;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const a = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = a + bend * Math.acos(c);
  return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1, ax + dx, ay + dy];
}

export class Gatekeeper extends BossBase {
  floorY: number;
  lift = 0;
  crouch = 0;
  rearUp = 0;
  tilt = 0;
  gait = 0;
  vx = 0;
  heads: Head[];
  tail: Chain;
  atk: GAtk | null = null;
  lastAtk: GAtk | null = null;
  seq: number[] = [];
  seqI = 0;
  chained = true;
  anchorX: number;
  chainLen = 330;
  turnT = 0;
  jumpFrom = 0;
  jumpTo = 0;
  breathDir = 1;
  breathT = 0;
  howlCd = 0;
  dazed = 0;
  mane = 0;
  embersT = 0;
  hpAtTurn = 0;
  chainBreakT = -1;

  constructor(x: number, y: number) {
    super('gatekeeper', x, y, 130, 96, 3000);
    this.name = 'The Gatekeeper';
    this.sub = 'Hound of the Tower Gate';
    this.floorY = y;
    this.maxPoise = this.poise = 340;
    this.kneelTime = 4.2;
    this.face = -1;
    this.anchorX = x + 150;
    this.hitColor = '#ffb36a';
    this.hitSound = 'hitHeavy';
    this.tail = new Chain(9, 8, x + 60, y - 60);
    const mk = (bx: number, by: number, rx: number, ry: number, scale: number): Head => ({ bx, by, rx, ry, x: bx + rx, y: by + ry, open: 0, ang: 0, lunge: 0, rear: 0, glowA: 0.4, scale });
    // far (high), middle, near (low)
    this.heads = [mk(36, -84, 30, -32, 0.92), mk(44, -76, 42, -16, 1), mk(40, -64, 36, 4, 0.96)];
  }

  get dmg() {
    return 30 * this.ngMul * (this.phase >= 3 ? 1.15 : 1);
  }

  hurtbox() {
    const f = this.face;
    const top = this.y - 104 - this.lift + this.crouch * 16;
    const x0 = f > 0 ? this.x - 70 : this.x - 96;
    return { x: x0, y: top, w: 166, h: this.y - top - 8 - this.lift * 0.3 };
  }
  get cy() {
    return this.y - 60 - this.lift + this.crouch * 12;
  }

  /** World position of a head (for hitboxes and effects). */
  headWorld(i: number) {
    const h = this.heads[i];
    return { x: this.x + this.face * h.x, y: this.y - this.lift + this.crouch * 12 + h.y };
  }

  updateDormant(_dt: number) {
    this.crouch = approach(this.crouch, 0.7, _dt);
    for (const h of this.heads) {
      h.glowA = 0.1;
      h.open = 0;
    }
  }

  updateIntro(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 40, y: this.y - 80 };
    if (t < 1.0) {
      this.crouch = 0.7;
    } else if (this.introT === 0) {
      this.introT = 1;
      sfx('chains', { vol: 0.9 });
      sfx('houndGrowl', { pitch: 0.4, vol: 1 });
    } else if (t < 2.4) {
      // The eyes light one head at a time.
      this.crouch = approach(this.crouch, 0, dt * 0.8);
      this.heads.forEach((h, i) => (h.glowA = clamp((t - 1.1 - i * 0.35) * 2, 0.1, 1)));
    } else if (this.introT === 1) {
      this.introT = 2;
      this.rearUp = 1;
      this.heads.forEach((h) => (h.open = 1));
      sfx('roar', { pitch: 0.7 });
      sfx('bossRoar', { pitch: 1.2, vol: 0.6 });
      G.camera.addTrauma(0.7 * shakeScale());
      fx.ring(this.x, this.y - 90, 20, 280, '#ff7a2a', 0.9, 6);
      fx.dust(this.x, this.y, 30, 3);
      fx.embers(this.x, this.y - 80, 30, '#ff9a3a', 40);
      G.ui.banner('THE GATEKEEPER', 'Hound of the Tower Gate', 'boss');
      music.phase = 0;
      music.play('gatekeeper', 0.3);
    } else if (t > 3.8 && this.introT === 2) {
      this.introT = 3;
      this.rearUp = 0;
      this.heads.forEach((h) => (h.open = 0));
    } else if (t > 4.6) {
      this.beginFight();
    }
  }

  updateKneel(_dt: number) {
    this.crouch = approach(this.crouch, 1, _dt * 4);
    this.vx = approach(this.vx, 0, 900 * _dt);
    this.x += this.vx * _dt;
    if (Math.random() < _dt * 14) fx.spawn(PK.Ember, this.x + rand(-50, 50), this.y - rand(20, 80), 0, -40, 1, 1.5, 0.2, '#ff9a3a');
  }

  onKneel() {
    this.atk = null;
    this.breathT = 0;
    this.lift = 0;
    this.tilt = 0;
    this.rearUp = 0;
    G.ui.toast('The Gatekeeper collapses. Strike a head to execute!', 'good');
  }

  recover() {
    super.recover();
    sfx('roar', { pitch: 0.8, vol: 0.7 });
    this.dazed = 0;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const W = G.world;
    const spd = this.phase >= 3 ? 1.3 : this.phase === 2 ? 1.12 : 1;
    this.howlCd -= dt;
    if (this.state === 'idle') {
      this.crouch = approach(this.crouch, 0, dt * 3);
      this.rearUp = approach(this.rearUp, 0, dt * 3);
      if (this.dazed > 0) {
        this.dazed -= dt;
        this.crouch = 0.5;
        if (Math.random() < dt * 8) fx.spawn(PK.Spark, this.x + this.face * 70 + rand(-10, 10), this.y - 100, rand(-30, 30), -20, 0.5, 2, 0.5, '#fff1c4', 0, 1);
        return;
      }
      const dx = p.x - this.x;
      const behind = sign(dx) !== this.face && Math.abs(dx) > 30;
      // A slow beast to turn: a window behind it, punished by the tail.
      if (behind) {
        this.turnT += dt;
        if (Math.abs(dx) < 150 && this.cd <= 0.6 && this.turnT > 0.25) {
          this.start('tail');
          return;
        }
        if (this.turnT > (this.phase >= 2 ? 0.55 : 0.85)) {
          this.face = sign(dx) || this.face;
          this.turnT = 0;
          fx.dust(this.x, this.y, 8, 1.4);
          sfx('bossStomp', { vol: 0.4, pitch: 1.3 });
        }
      } else this.turnT = 0;
      // Pace toward bite range.
      const want = Math.abs(dx) > 150 ? sign(dx) * 70 * spd : Math.abs(dx) < 90 ? -sign(dx) * 40 : 0;
      this.vx = approach(this.vx, behind ? 0 : want, 300 * dt);
      this.move(dt);
      this.cd -= dt * spd;
      if (this.cd <= 0) this.choose(Math.abs(dx));
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, spd, p.x, W);
  }

  private move(dt: number) {
    const W = G.world;
    let nx = this.x + this.vx * dt;
    const w = W.grid.w * 16;
    nx = clamp(nx, 70, w - 70);
    if (this.chained) nx = clamp(nx, this.anchorX - this.chainLen, this.anchorX + 40);
    this.x = nx;
    this.gait += dt * Math.abs(this.vx) * 0.05;
  }

  private choose(dist: number) {
    let pool: GAtk[];
    if (this.phase >= 3 && this.howlCd <= 0) {
      this.start('howl');
      return;
    }
    if (dist < 160) pool = this.phase === 1 ? ['bite', 'bite', 'triple', 'pounce'] : ['bite', 'triple', 'triple', 'breath', 'pounce'];
    else pool = this.phase === 1 ? ['pounce', 'pounce', 'triple'] : ['pounce', 'breath', 'charge', 'charge'];
    if (this.chained && dist > this.chainLen + 40) pool = ['pounce'];
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.65) a = choose(pool);
    this.start(a);
  }

  private start(a: GAtk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.hitSet.clear();
    this.turnT = 0;
    const p = G.world.player;
    if (a !== 'tail') this.face = sign(p.x - this.x) || this.face;
    if (a === 'bite') this.seq = [choose([0, 1, 2])];
    else if (a === 'triple') this.seq = this.phase >= 3 ? [0, 2, 1, 2] : [0, 2, 1];
    this.seqI = 0;
    this.lift = 0;
    this.tilt = 0;
    if (a === 'pounce') {
      this.jumpFrom = this.x;
      let tx = clamp(p.x - this.face * 30, 80, G.world.grid.w * 16 - 80);
      if (this.chained) tx = clamp(tx, this.anchorX - this.chainLen, this.anchorX + 40);
      this.jumpTo = tx;
    }
    if (a === 'breath') this.breathDir = Math.random() < 0.5 ? 1 : -1;
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.lift = 0;
    this.cd = cd * (this.phase >= 3 ? 0.65 : this.phase === 2 ? 0.8 : 1);
    for (const h of this.heads) {
      h.lunge = 0;
      h.rear = 0;
    }
  }

  private runAttack(dt: number, spd: number, px: number, W: typeof G.world) {
    const t = this.st;
    const f = this.face;
    switch (this.atk) {
      case 'bite': case 'triple': {
        // Each head: rear back (telegraph), snap forward, recoil.
        const first = this.atk === 'bite' ? 0.62 : 0.5;
        const tel = (this.seqI === 0 ? first : 0.3) / spd;
        const snap = 0.16, hold = 0.14;
        const i = this.seq[this.seqI];
        const h = this.heads[i];
        const u = t;
        this.vx = approach(this.vx, 0, 600 * dt);
        if (u < tel) {
          h.rear = easeOutCubic(u / tel);
          h.open = 0.4 * h.rear;
          h.glowA = 1;
          if (u < dt * 1.5) sfx('houndGrowl', { pan: W.pan(this.x), pitch: 0.55 + i * 0.1 });
        } else if (u < tel + snap) {
          const k = (u - tel) / snap;
          h.rear = 1 - k;
          h.lunge = easeOutCubic(k);
          h.open = 1 - k * 0.7;
          if (u - dt < tel) {
            sfx('bite', { pan: W.pan(this.x), pitch: 0.8 + i * 0.12 });
            this.x += f * 10;
          }
          if (k > 0.45) {
            const hw = this.headWorld(i);
            const last = this.atk === 'triple' && this.seqI === this.seq.length - 1;
            const set = this.hitSet;
            if (W.hitPlayerSide({ x: hw.x - 22, y: hw.y - 20, w: 44, h: 40 }, { dmg: this.dmg * (last ? 1.25 : 0.9), poise: last ? 50 : 30, kx: f * (last ? 300 : 180), ky: last ? -240 : -120, dir: f, kind: 'melee', src: this, parryable: true }, set)) {
              fx.hitSparks(hw.x, hw.y, f, '#ffb36a', 8, 1);
            }
          }
        } else if (u < tel + snap + hold) {
          h.lunge = 1;
          h.open = 0.2;
        } else {
          h.lunge = 0;
          h.rear = 0;
          this.seqI++;
          this.st = 0;
          this.hitSet.clear();
          if (this.seqI >= this.seq.length) this.endAttack(this.atk === 'triple' ? 1.4 : 1.0);
        }
        break;
      }
      case 'pounce': {
        const tel = 0.6 / Math.min(spd, 1.15), air = 0.62;
        if (t < tel) {
          this.crouch = easeOutCubic(t / tel);
          this.heads.forEach((h) => (h.glowA = 1));
          if (t < dt * 1.5) sfx('houndGrowl', { pan: W.pan(this.x), pitch: 0.45, vol: 1 });
        } else if (t < tel + air) {
          const u = (t - tel) / air;
          if (t - dt < tel) {
            sfx('roar', { pan: W.pan(this.x), pitch: 1.1, vol: 0.6 });
            fx.dust(this.x, this.y, 16, 2);
          }
          this.crouch = 0;
          this.x = lerp(this.jumpFrom, this.jumpTo, u);
          this.lift = Math.sin(Math.PI * u) * 96;
          this.tilt = (0.5 - u) * 0.5;
          if (u > 0.5) {
            const hb = this.hurtbox();
            W.hitPlayerSide({ x: hb.x + 10, y: hb.y + 20, w: hb.w - 20, h: hb.h - 10 }, { dmg: this.dmg * 1.1, poise: 60, kx: f * 260, ky: -260, dir: f, kind: 'melee', src: this }, this.hitSet);
          }
        } else if (this.lift > 0 || t < tel + air + dt * 2) {
          this.lift = 0;
          this.tilt = 0;
          this.x = this.jumpTo;
          this.land();
        } else {
          this.crouch = approach(this.crouch, 0, dt * 3);
          if (t > tel + air + 0.75) this.endAttack(1.3);
        }
        break;
      }
      case 'tail': {
        // Strikes behind the beast without turning.
        const tel = 0.42;
        if (t < tel) {
          if (t < dt * 1.5) sfx('whoosh', { pan: W.pan(this.x), pitch: 0.6 });
        } else if (t < tel + 0.22) {
          if (t - dt < tel) {
            sfx('bossSweep', { pan: W.pan(this.x), pitch: 1.3, vol: 0.7 });
            G.camera.addTrauma(0.2 * shakeScale());
          }
          const x0 = f > 0 ? this.x - 170 : this.x + 40;
          if (W.hitPlayerSide({ x: x0, y: this.y - 64, w: 130, h: 60 }, { dmg: this.dmg * 0.9, poise: 50, kx: -f * 300, ky: -200, dir: -f, kind: 'melee', src: this, parryable: true }, this.hitSet)) {
            fx.hitSparks(x0 + 65, this.y - 30, -f, '#ffb36a', 8, 1);
          }
          if (this.phase >= 2 && Math.random() < 0.6) fx.spawn(PK.Flame, x0 + rand(0, 130), this.y - rand(10, 50), -f * 120, -30, 0.4, 6, 1, '#ff8a3a', -60, 1);
        } else if (t > tel + 0.65) {
          // Then it wheels round to face you.
          this.face = sign(px - this.x) || this.face;
          fx.dust(this.x, this.y, 10, 1.4);
          this.endAttack(0.8);
        }
        break;
      }
      case 'breath': {
        const tel = 0.75, dur = 1.35;
        const mid = this.heads[1];
        if (t < tel) {
          this.rearUp = easeOutCubic(t / tel) * 0.7;
          mid.rear = this.rearUp;
          mid.open = 0.6;
          mid.glowA = 1;
          this.vx = approach(this.vx, 0, 600 * dt);
          if (t < dt * 1.5) sfx('beamCharge', { pan: W.pan(this.x), pitch: 1.4, vol: 0.6 });
          if (Math.random() < dt * 30) {
            const hw = this.headWorld(1);
            fx.spawn(PK.Ember, hw.x + f * 20 + rand(-30, 30), hw.y + rand(-20, 20), f * -40, rand(-20, 20), 0.5, 2, 0.3, '#ffb347', 0, 1);
          }
        } else if (t < tel + dur) {
          const u = (t - tel) / dur;
          this.rearUp = 0.25;
          mid.rear = 0;
          mid.lunge = 0.4;
          mid.open = 1;
          if (t - dt < tel) sfx('flame', { pan: W.pan(this.x), vol: 1 });
          this.breathT += dt;
          // Sweeps near to far or far to near; the gap is the way through.
          const sweep = this.breathDir > 0 ? u : 1 - u;
          while (this.breathT > 0.065) {
            this.breathT -= 0.065;
            const hw = this.headWorld(1);
            const sp = lerp(120, 360, sweep);
            W.add(new Proj('flame', hw.x + f * 26, hw.y + 6, 'enemy', this.dmg * 0.45, { vx: f * sp + rand(-20, 20), vy: rand(-90, -40), life: 2, w: 12, h: 12 }));
          }
          G.camera.addTrauma(dt * 0.4);
        } else {
          this.rearUp = approach(this.rearUp, 0, dt * 3);
          mid.lunge = 0;
          mid.open = 0;
          if (t > tel + dur + 0.6) this.endAttack(1.5);
        }
        break;
      }
      case 'charge': {
        const tel = 0.55, run = 1.25;
        if (t < tel) {
          this.crouch = 0.35;
          this.heads.forEach((h) => { h.glowA = 1; h.open = 0.5; });
          if (t < dt * 1.5) sfx('roar', { pan: W.pan(this.x), pitch: 0.9, vol: 0.8 });
        } else if (t < tel + run) {
          this.crouch = 0.15;
          this.vx = approach(this.vx, f * 430, 2400 * dt);
          const before = this.x;
          this.move(dt);
          this.gait += dt * 6;
          const hb = this.hurtbox();
          W.hitPlayerSide({ x: hb.x, y: hb.y + 20, w: hb.w, h: hb.h - 20 }, { dmg: this.dmg, poise: 60, kx: f * 340, ky: -280, dir: f, kind: 'melee', src: this }, this.hitSet);
          if (Math.random() < dt * 20) fx.dust(this.x - f * 50, this.y, 2, 1.6);
          const w = W.grid.w * 16;
          // Into a wall: dazed, an opening.
          if (Math.abs(this.x - before) < Math.abs(this.vx) * dt * 0.5 || this.x <= 71 || this.x >= w - 71) {
            sfx('wallBreak', { pan: W.pan(this.x), vol: 0.8 });
            G.camera.addTrauma(0.6 * shakeScale());
            fx.shards(this.x + f * 80, this.y - 50, 16, '#7a5a4a', 1.6);
            fx.dust(this.x + f * 70, this.y - 30, 16, 2);
            this.vx = -f * 120;
            this.dazed = 1.8;
            this.poise -= 90;
            this.endAttack(0.6);
            if (this.poise <= 0) this.kneel();
            break;
          }
        } else {
          this.vx = approach(this.vx, 0, 1300 * dt);
          this.move(dt);
          if (Math.abs(this.vx) < 10) {
            this.face = sign(px - this.x) || this.face;
            this.endAttack(1.0);
          }
        }
        break;
      }
      case 'howl': {
        this.vx = approach(this.vx, 0, 600 * dt);
        if (t < 0.5) {
          this.rearUp = easeOutCubic(t / 0.5);
          this.heads.forEach((h) => { h.open = this.rearUp; h.glowA = 1; });
        } else if (this.introT !== 7) {
          this.introT = 7;
          this.howlCd = 15;
          sfx('howl', { pan: W.pan(this.x) });
          G.camera.addTrauma(0.5 * shakeScale());
          fx.ring(this.x + f * 40, this.y - 120, 10, 240, '#ff6a2a', 0.8, 5);
          // The pack answers from the edges of the arena.
          const alive = W.ents.filter((e) => e.isFoe && !e.dying && !e.isBoss).length;
          const v = G.camera.view();
          for (let i = 0; i < Math.min(2, 3 - alive); i++) {
            const side = i === 0 ? -1 : 1;
            const x = clamp(side < 0 ? v.x + 30 : v.x + v.w - 30, 40, W.grid.w * 16 - 40);
            const hd = W.spawnEnemy('hound', x, this.floorY);
            hd.face = side < 0 ? 1 : -1;
            fx.veilBurst(hd.cx, hd.cy, 12, 1);
            fx.embers(hd.x, hd.y - 8, 10, '#ff9a3a', 10);
          }
        } else if (t > 1.7) {
          this.introT = 3;
          this.rearUp = 0;
          this.heads.forEach((h) => (h.open = 0));
          this.endAttack(0.8);
        }
        break;
      }
    }
  }

  private land() {
    const W = G.world;
    sfx('bossStomp', { pan: W.pan(this.x) });
    sfx('bossSlam', { pan: W.pan(this.x), vol: 0.6, pitch: 1.2 });
    G.camera.addTrauma(0.55 * shakeScale());
    fx.dust(this.x, this.y, 30, 3);
    fx.ring(this.x, this.y - 2, 10, 130, '#ff9a5a', 0.5, 4, 0.25);
    W.hitPlayerSide({ x: this.x - 100, y: this.y - 40, w: 200, h: 40 }, { dmg: this.dmg * 0.8, poise: 50, kx: sign(W.player.x - this.x) * 280, ky: -300, dir: sign(W.player.x - this.x) || 1, kind: 'melee', src: this, unblockable: true }, this.hitSet);
    if (this.phase >= 2) {
      const col = '#ff7a2a';
      W.add(new Proj('wave', this.x + 60, this.y, 'enemy', this.dmg * 0.6, { vx: 250, life: 1.8, w: 14, h: 24, color: col, big: true }));
      W.add(new Proj('wave', this.x - 60, this.y, 'enemy', this.dmg * 0.6, { vx: -250, life: 1.8, w: 14, h: 24, color: col, big: true }));
    }
  }

  // ------------------------------------------------------------ phases
  beginTransition() {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.lift = 0;
    this.phase = 2;
    this.maxPoise = this.poise = 380;
    this.introT = 0;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.5, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: (this.x + this.anchorX) / 2, y: this.y - 90 };
    if (t < 1.4) {
      // Straining against the chain.
      this.rearUp = 0.6 + Math.sin(t * 20) * 0.1;
      this.heads.forEach((h, i) => { h.open = 0.6 + Math.sin(t * 14 + i) * 0.3; h.glowA = 1; });
      this.vx = -this.face * 20;
      G.camera.addTrauma(dt * 0.9);
      if (Math.random() < dt * 10) sfx('chains', { vol: 0.5, pitch: rand(0.8, 1.2) });
    } else if (this.introT === 0) {
      this.introT = 1;
      this.chained = false;
      this.chainBreakT = 0;
      sfx('shatter');
      sfx('roar', { pitch: 0.75 });
      fx.flash('#ffb36a', 0.4);
      G.camera.addTrauma(0.9 * shakeScale());
      const hw = this.headWorld(1);
      fx.shards(hw.x - this.face * 30, hw.y + 20, 30, '#5a5258', 2);
      fx.ring(this.x, this.y - 80, 20, 320, '#ff7a2a', 0.9, 6);
      fx.embers(this.x, this.y - 70, 50, '#ff9a3a', 60);
      this.mane = 0.01;
      music.phase = 1;
      G.ui.caption('The chain parts like thread. Fire runs down its spine.');
    } else if (t > 3.4) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.6;
      this.rearUp = 0;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      G.ui.caption(null);
    }
  }

  enterPhase3() {
    this.phase = 3;
    this.howlCd = 0;
    music.phase = 2;
    sfx('roar', { pitch: 0.65 });
    fx.flash('#ff7a2a', 0.25);
    G.ui.toast('The Gatekeeper calls its pack!', 'warn');
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 70 };
    this.lift = 0;
    if (t < 2.0) {
      this.rearUp = 0.8 * (1 - t / 2);
      this.heads.forEach((h, i) => { h.open = 0.8; h.glowA = 1 - t / 2.4; h.rear = Math.sin(t * 8 + i) * 0.3; });
      G.camera.addTrauma(dt * 0.8 * shakeScale());
      if (Math.random() < dt * 10) fx.embers(this.x + rand(-60, 60), this.y - rand(20, 100), 4, '#ff9a3a', 16);
      if (this.introT !== 8) {
        this.introT = 8;
        sfx('howl', { pitch: 0.6, vol: 0.8 });
      }
    } else if (t < 3.2) {
      this.crouch = approach(this.crouch, 1, dt * 2);
      this.heads.forEach((h) => { h.open = 0.2; h.glowA = 0; h.rear = 0; });
    } else if (this.introT !== 9) {
      this.introT = 9;
      sfx('bossStomp');
      sfx('shatter', { vol: 0.6, pitch: 0.7 });
      G.camera.addTrauma(0.6);
      fx.dust(this.x, this.y, 40, 3);
      fx.embers(this.x, this.y - 50, 60, '#ff9a3a', 70);
      fx.holyBurst(this.x, this.y - 60, 30, 2);
      fx.column(this.x, this.y, 120, 300, '#fff3c4', 1.6);
    } else if (t > 5.6) {
      this.remove = true;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    const f = this.face;
    for (const [i, h] of this.heads.entries()) {
      // Idle sway: each head has a mind of its own.
      const sway = Math.sin(G.time * (1.3 + i * 0.4) + i * 2) * 3;
      const tx = h.rx - h.rear * 16 + h.lunge * 72 - this.rearUp * 6;
      const ty = h.ry + sway - h.rear * 10 + h.lunge * (24 + i * 6) - this.rearUp * 22;
      h.x = lerp(h.x, h.bx + tx, Math.min(1, dt * (h.lunge > 0 ? 30 : 12)));
      h.y = lerp(h.y, h.by + ty, Math.min(1, dt * (h.lunge > 0 ? 30 : 12)));
      h.ang = lerp(h.ang, -0.25 * h.rear + 0.35 * h.lunge - this.rearUp * 0.6, Math.min(1, dt * 14));
      if (this.state === 'idle' || this.state === 'dormant') {
        h.open = approach(h.open, 0.08 + Math.max(0, Math.sin(G.time * 2 + i * 1.7)) * 0.12, dt * 2);
        h.glowA = approach(h.glowA, this.state === 'dormant' ? 0.1 : 0.7, dt * 2);
      }
    }
    if (this.mane > 0) this.mane = Math.min(1, this.mane + dt * 0.8);
    if (this.chainBreakT >= 0) this.chainBreakT += dt;
    const tx = this.x - f * 66, ty = this.y - 70 - this.lift + this.crouch * 12;
    this.tail.update(tx, ty, dt, -f * 260 - this.vx * 2, -120 + Math.sin(G.time * 3) * 80, 0.86);
    // Tail raised to strike.
    if (this.atk === 'tail' && this.st < 0.42) this.tail.update(tx, ty, dt, -f * 200, -900, 0.86);
    if (this.atk === 'tail' && this.st >= 0.42 && this.st < 0.64) this.tail.update(tx, ty, dt, -f * 1400, 600, 0.86);
    if (this.mane > 0 && this.state !== 'dead') {
      this.embersT -= dt;
      if (this.embersT <= 0) {
        this.embersT = 0.05;
        fx.spawn(PK.Flame, this.x + f * rand(-20, 40), this.y - 88 - this.lift + rand(-6, 6), rand(-20, 20), rand(-80, -40), 0.4, 6, 1, '#ff8a3a', -80, 1);
      }
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const f = this.face;
    const t = G.time;
    const fade = this.state === 'dead' && this.defeatT > 3.2 ? clamp((this.defeatT - 3.2) / 1.6, 0, 1) : 0;
    if (fade >= 1) return;
    // Telegraphs on the floor.
    if (this.atk === 'pounce' && this.state === 'attack') {
      const tel = 0.6;
      this.floorMark(ctx, this.jumpTo, this.floorY, 80, this.st / (tel + 0.62), '#ff6a2a');
    }
    if (this.atk === 'charge' && this.st < 0.55) {
      ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, this.st * 3) * (0.4 + Math.sin(t * 20) * 0.2);
      const g = ctx.createLinearGradient(this.x, 0, this.x + f * 400, 0);
      g.addColorStop(0, rgba('#ff6a3a', a));
      g.addColorStop(1, rgba('#ff6a3a', 0));
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(this.x, this.x + f * 400), this.y - 40, 400, 6);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Chain to the gate.
    if (this.chained || (this.chainBreakT >= 0 && this.chainBreakT < 1.2)) this.drawChain(ctx);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f, 1);
    if (fade > 0) ctx.globalAlpha = 1 - fade;
    const bodyDY = -this.lift + this.crouch * 14;
    const o = '#0a0608';
    const hide = '#1e1519', hideHi = '#3c2c30', hideDk = '#0e0a0c';
    const run = Math.abs(this.vx) > 15 && this.lift === 0;
    const g = this.gait;
    // Shoulder and hip anchors in local space.
    const tiltY = this.rearUp * 18;
    const shX = 30, shY = -68 + bodyDY - tiltY, hpX = -46, hpY = -62 + bodyDY + tiltY * 0.3;
    const leg = (hx: number, hy: number, phase: number, front: boolean, far: boolean) => {
      let footX = hx + (front ? 6 : -2), footY = 0;
      if (run) {
        footX += Math.sin(g + phase) * 22;
        footY = -Math.max(0, Math.cos(g + phase)) * 12;
      } else if (this.lift > 0) {
        footX = hx + (front ? 22 : -26);
        footY = hy + 44;
      }
      if (this.state === 'kneel' && front) {
        footX = hx + 26;
        footY = 0;
      }
      const l1 = front ? 30 : 34, l2 = front ? 34 : 36;
      const [kx, ky, ex, ey] = ik(hx, hy, footX, Math.min(0, footY), l1, l2, front ? 1 : -1);
      const c = far ? hideDk : hide;
      const w1 = front ? 9 : 12;
      limbStroke(ctx, hx, hy, kx, ky, w1, 6.5, o, 1.6);
      limbStroke(ctx, kx, ky, ex, ey, 6.5, 4.6, o, 1.6);
      limbShaded(ctx, kx, ky, ex, ey, 6.5, 4.6, c, null);
      limbShaded(ctx, hx, hy, kx, ky, w1, 6.5, c, null);
      // Paw and claws.
      ellipse(ctx, ex + 3, ey - 2.5, 7, 4, 0, far ? hideDk : '#241a1e');
      for (let c2 = 0; c2 < 3; c2++) poly(ctx, [ex + 6 + c2 * 2.4, ey - 2, ex + 9 + c2 * 2.4, ey + 0.6, ex + 6.5 + c2 * 2.4, ey - 0.2], '#c8b8a8');
      if (!far && this.phase >= 2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba('#ff7a2a', 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hx, hy + 4);
        ctx.lineTo((hx + kx) / 2 + 2, (hy + ky) / 2);
        ctx.lineTo(kx, ky);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    // Far legs.
    leg(shX - 10, shY + 6, Math.PI * 0.5, true, true);
    leg(hpX - 10, hpY + 4, Math.PI * 1.5, false, true);
    // Tail (in world space).
    ctx.restore();
    ctx.save();
    if (fade > 0) ctx.globalAlpha = 1 - fade;
    drawRibbon(ctx, this.tail, 13, 3, hide, o);
    {
      const n = this.tail.n - 1;
      const tx = this.tail.xs[n], ty = this.tail.ys[n];
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, tx, ty, this.phase >= 2 ? 26 : 14, '#ff7a2a', this.phase >= 2 ? 0.9 : 0.5);
      ctx.globalCompositeOperation = 'source-over';
      if (this.atk === 'tail' && this.st < 0.42) this.glint(ctx, tx, ty, '#ff6a2a', 1.2);
    }
    ctx.restore();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f, 1);
    if (fade > 0) ctx.globalAlpha = 1 - fade;
    // Torso: heavy forequarters, lean hindquarters.
    {
      const y0 = bodyDY;
      ctx.beginPath();
      ctx.moveTo(-74, -66 + y0 + tiltY * 0.4);
      ctx.bezierCurveTo(-60, -84 + y0, -20, -84 + y0 - tiltY * 0.5, 16, -98 + y0 - tiltY);
      ctx.bezierCurveTo(40, -106 + y0 - tiltY, 62, -86 + y0 - tiltY, 62, -62 + y0 - tiltY * 0.8);
      ctx.bezierCurveTo(60, -44 + y0 - tiltY * 0.5, 40, -34 + y0, 18, -38 + y0);
      ctx.bezierCurveTo(-10, -40 + y0, -30, -34 + y0, -52, -40 + y0 + tiltY * 0.2);
      ctx.bezierCurveTo(-70, -42 + y0, -80, -54 + y0, -74, -66 + y0 + tiltY * 0.4);
      ctx.closePath();
      ctx.fillStyle = lineGrad(ctx, 0, -104 + y0, 0, -36 + y0, hide, 0.22, -0.4);
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = o;
      ctx.stroke();
      // Rib shadows and a ridge of spines.
      ctx.strokeStyle = rgba(hideDk, 0.9);
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-8 + i * 10, -76 + y0 - tiltY * 0.3);
        ctx.quadraticCurveTo(-4 + i * 10, -58 + y0, -10 + i * 10, -44 + y0);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const sx = -62 + i * 11, sy = -78 + y0 - (i > 4 ? (i - 4) * 4 : 0) - (i / 8) * tiltY;
        const sh = 8 + (i > 3 && i < 8 ? 6 : 0) + Math.sin(t * 6 + i) * 1;
        poly(ctx, [sx - 4, sy + 3, sx + 1, sy - sh, sx + 4, sy + 3], hideDk, o, 1);
      }
      // Highlight along the back.
      ctx.strokeStyle = rgba(hideHi, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-60, -76 + y0);
      ctx.bezierCurveTo(-30, -82 + y0, 0, -88 + y0 - tiltY * 0.5, 22, -96 + y0 - tiltY);
      ctx.stroke();
      // Molten cracks.
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.55 + Math.sin(t * 3) * 0.2 + (this.phase >= 2 ? 0.25 : 0);
      ctx.strokeStyle = rgba('#ff7a2a', pulse);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-50, -62 + y0); ctx.lineTo(-38, -56 + y0); ctx.lineTo(-30, -64 + y0); ctx.lineTo(-18, -58 + y0);
      ctx.moveTo(4, -80 + y0 - tiltY * 0.4); ctx.lineTo(14, -70 + y0); ctx.lineTo(10, -58 + y0); ctx.lineTo(22, -50 + y0);
      ctx.moveTo(34, -88 + y0 - tiltY); ctx.lineTo(42, -76 + y0 - tiltY * 0.7); ctx.lineTo(52, -72 + y0 - tiltY * 0.7);
      ctx.stroke();
      glow(ctx, 10, -64 + y0, 30, '#ff6a1a', pulse * 0.35);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Near legs.
    leg(hpX, hpY, Math.PI * 0.5, false, false);
    leg(shX, shY, Math.PI * 1.5, true, false);
    // Necks and heads, back to front.
    for (let i = 0; i < 3; i++) this.drawHead(ctx, i, bodyDY);
    // Collar.
    {
      const y0 = bodyDY - tiltY;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#2a2224';
      ctx.beginPath();
      ctx.moveTo(38, -96 + y0);
      ctx.quadraticCurveTo(58, -78 + y0, 50, -54 + y0);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = o;
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const u = k / 3;
        const sx = lerp(40, 52, u), sy = lerp(-94, -58, u) + y0;
        poly(ctx, [sx, sy - 3, sx + 8, sy, sx, sy + 3], '#8a7a70', o, 0.8);
      }
    }
    // Fire mane.
    if (this.mane > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const y0 = bodyDY - tiltY;
      for (let i = 0; i < 7; i++) {
        const mx = 6 + i * 7, my = -96 + y0 + Math.abs(i - 3) * 2;
        const fl = (14 + Math.sin(t * 9 + i * 1.7) * 5) * this.mane;
        const gr = ctx.createLinearGradient(mx, my, mx, my - fl);
        gr.addColorStop(0, rgba('#ff6a1a', 0.85));
        gr.addColorStop(0.6, rgba('#ffb347', 0.5));
        gr.addColorStop(1, rgba('#ffe6a8', 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(mx - 5, my);
        ctx.quadraticCurveTo(mx - 3, my - fl * 0.6, mx + Math.sin(t * 7 + i) * 3, my - fl);
        ctx.quadraticCurveTo(mx + 3, my - fl * 0.6, mx + 5, my);
        ctx.closePath();
        ctx.fill();
      }
      glow(ctx, 30, -96 + y0, 50, '#ff6a1a', 0.35 * this.mane);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0 || this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -64 + bodyDY, 110, '#ffffff', Math.max(this.flash * 4, this.staggerFlash));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawHead(ctx: Ctx, i: number, bodyDY: number) {
    const h = this.heads[i];
    const o = '#0a0608';
    const far = i === 0;
    const hide = far ? '#171013' : '#211719';
    const y0 = bodyDY - this.rearUp * 18;
    const bx = h.bx, by = h.by + y0;
    const hx = h.x, hy = h.y + bodyDY;
    // Neck: a thick muscled curve.
    const mx = (bx + hx) / 2 - 4, my = (by + hy) / 2 - 6;
    limbStroke(ctx, bx, by, mx, my, 15, 12, o, 1.6);
    limbStroke(ctx, mx, my, hx - 6, hy, 12, 10, o, 1.6);
    limbShaded(ctx, bx, by, mx, my, 15, 12, hide, null);
    limbShaded(ctx, mx, my, hx - 6, hy, 12, 10, hide, null);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(h.ang);
    const s = h.scale * 1.15;
    ctx.scale(s, s);
    const open = clamp(h.open, 0, 1) * 0.55;
    // Lower jaw, hinged behind the eye.
    ctx.save();
    ctx.translate(-4, 3);
    ctx.rotate(open);
    poly(ctx, [0, -1, 26, 0, 25, 4, 6, 7, -4, 4], lineGrad(ctx, 0, -1, 0, 7, '#1a1214', 0.15, -0.3), o, 1.2);
    // Lower fangs.
    for (let k = 0; k < 3; k++) poly(ctx, [10 + k * 5, 0, 12 + k * 5, -4.5, 14 + k * 5, 0], '#e8dccc');
    ctx.restore();
    // Mouth glow (fire in the throat).
    if (open > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 8, 4, 16, '#ff7a2a', open * 1.4);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Skull and muzzle.
    poly(ctx, [-12, -6, -2, -13, 12, -11, 28, -5, 30, 0, 26, 3, 6, 4, -8, 5], lineGrad(ctx, 0, -13, 0, 5, hide, 0.24, -0.35), o, 1.3);
    // Brow ridge and nose.
    poly(ctx, [-2, -11, 10, -12, 14, -9, 2, -8], '#2c2024');
    ellipse(ctx, 29, -2.5, 2.6, 2, 0, '#0a0608');
    // Upper fangs.
    for (let k = 0; k < 3; k++) poly(ctx, [12 + k * 5, 2.5, 14 + k * 5, 7.5 + open * 3, 16 + k * 5, 2.5], '#f0e6d8');
    // Ears / horns.
    poly(ctx, [-6, -10, -18, -26, -14, -22, -1, -12], '#140e10', o, 1);
    poly(ctx, [-10, -8, -24, -18, -20, -16, -4, -7], '#0e0a0c', o, 1);
    // Eye.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 9, -7, 12, '#ff3a1a', h.glowA);
    ctx.globalCompositeOperation = 'source-over';
    poly(ctx, [5, -7.5, 9, -9.5, 13, -7.5, 9, -6], h.glowA > 0.2 ? '#ffd27a' : '#3a1a14');
    // Molten seam along the jaw.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ff7a2a', 0.5 + h.glowA * 0.3);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(4, -3);
    ctx.lineTo(16, -2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // Telegraph glint on a rearing head.
    if (h.rear > 0.3 && (this.atk === 'bite' || this.atk === 'triple')) this.glint(ctx, hx + 14, hy - 8, '#ff5a2a', 0.9);
    if (this.atk === 'pounce' && this.st < 0.6 && i === 1) this.glint(ctx, hx + 10, hy - 8, '#ff5a2a', 1.1);
  }

  private drawChain(ctx: Ctx) {
    const f = this.face;
    const cx = this.x + f * 50, cy = this.y - 70 - this.lift + this.crouch * 12 - this.rearUp * 18;
    const ax = this.anchorX + 60, ay = this.floorY - 70;
    const dist = Math.abs(ax - cx);
    const slack = Math.max(0, this.chainLen + 60 - dist);
    let ex = cx, ey = cy;
    // After the break the loose end falls away.
    if (this.chainBreakT >= 0) {
      const u = Math.min(1, this.chainBreakT / 1.2);
      ex = lerp(cx, ax - 80, u);
      ey = lerp(cy, this.floorY, u);
      ctx.globalAlpha = 1 - u * 0.6;
    }
    const sag = Math.min(70, slack * 0.25 + 6);
    const n = 22;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = lerp(ex, ax, u);
      const y = lerp(ey, ay, u) + Math.sin(Math.PI * u) * sag;
      const r = k % 2 ? 3.2 : 4;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = k % 2 ? '#3a3236' : '#5a5056';
      ctx.beginPath();
      ctx.ellipse(x, y, r, k % 2 ? 1.6 : 2.6, Math.atan2(ay - ey, ax - ex), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Wall ring.
    circle(ctx, ax, ay, 6, '#2a2224');
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6a5a5a';
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawOverlay(ctx: Ctx) {
    if (this.state === 'kneel') {
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(G.time * 10) * 0.3;
      const hw = this.headWorld(1);
      glow(ctx, hw.x, hw.y - 30, 16, '#ffe6a8', 0.7 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const y = hw.y - 30;
      ctx.moveTo(hw.x, y - 8); ctx.lineTo(hw.x + 6, y); ctx.lineTo(hw.x, y + 8); ctx.lineTo(hw.x - 6, y); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.state === 'dormant') return;
    if (this.state === 'dead' && this.defeatT > 3.2) return;
    lighting.add(this.x, this.y - 70 - this.lift, 200, '#ff7a2a', 0.55 + (this.phase >= 2 ? 0.2 : 0), 0.3);
    for (let i = 0; i < 3; i++) {
      const hw = this.headWorld(i);
      lighting.add(hw.x, hw.y, 40, '#ff4a1a', 0.5 * this.heads[i].glowA, 0.6);
    }
    if (this.atk === 'breath' && this.state === 'attack') {
      const hw = this.headWorld(1);
      lighting.add(hw.x + this.face * 60, hw.y + 20, 160, '#ff9a3a', 1, 0.7);
    }
  }
}

// =====================================================================
// THE CRIMSON MARSHAL
// =====================================================================

type MAtk = 'combo' | 'lunge' | 'leap' | 'edge' | 'blink' | 'riposte';

const MB: Pose = { ...SENT_BASE, bUA: 0.95, bFA: 1.15, fUA: 0.55, fFA: 1.05, wpn: 0.75 };
const MP = {
  ready: MB,
  guard: { ...MB, lean: 0.2, fUA: 0.75, fFA: 1.35, bUA: 1.1, bFA: 1.2, wpn: 0.35, fTh: 0.5, fSh: -0.55, bTh: -0.4, bSh: -0.3 },
  overhead: { ...MB, lean: -0.15, fUA: 3.1, fFA: 0.35, bUA: 2.8, bFA: 0.5, wpn: 0.3, fTh: 0.25, bTh: -0.45 },
  downcut: { ...MB, lean: 0.5, fUA: 0.8, fFA: 0.05, bUA: 0.9, bFA: 0.2, wpn: -0.05, fTh: 0.8, fSh: -0.7, bTh: -0.7, bSh: -0.2 },
  low: { ...MB, lean: 0.35, fUA: -0.35, fFA: 0.1, bUA: -0.2, bFA: 0.3, wpn: 0.4, fTh: 0.6, fSh: -0.9, bTh: -0.5, bSh: -0.4 },
  rising: { ...MB, lean: -0.25, fUA: 2.7, fFA: 0.25, bUA: 2.4, bFA: 0.4, wpn: 0.15, fTh: 0.3, bTh: -0.3 },
  draw: { ...MB, lean: -0.05, fUA: -0.4, fFA: 1.75, bUA: -0.2, bFA: 1.6, wpn: 0.15, fTh: 0.2, bTh: -0.5, bSh: -0.3 },
  thrust: { ...MB, lean: 0.45, fUA: 1.6, fFA: -0.05, bUA: 1.4, bFA: 0.1, wpn: 0.0, fTh: 0.95, fSh: -0.6, bTh: -0.9, bSh: -0.1 },
  crouch: { ...MB, lean: 0.4, fUA: 0.2, fFA: 1.7, bUA: 0.2, bFA: 1.5, wpn: 0.6, fTh: 1.0, fSh: -1.6, bTh: 0.2, bSh: -1.4, sq: 0.94 },
  air: { ...MB, lean: 0.1, fUA: 3.0, fFA: 0.3, bUA: 2.8, bFA: 0.4, wpn: 0.2, fTh: 1.3, fSh: -1.7, bTh: 0.5, bSh: -1.3 },
  plunge: { ...MB, lean: 0.55, fUA: 1.0, fFA: 0.4, bUA: 1.0, bFA: 0.5, wpn: 1.2, fTh: 1.1, fSh: -1.6, bTh: -0.2, bSh: -1.0 },
  kneel: { ...MB, lean: 0.35, head: 0.4, fUA: 0.9, fFA: 0.55, bUA: 0.9, bFA: 0.75, wpn: 1.55, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9 },
  salute: { ...MB, lean: 0, head: -0.1, fUA: 0.55, fFA: 2.25, bUA: 0.2, bFA: 0.3, wpn: 0.35, fTh: 0.08, fSh: -0.05, bTh: -0.08, bSh: -0.05 },
  planted: { ...MB, lean: 0.05, head: 0.15, fUA: 0.65, fFA: 0.6, bUA: 0.7, bFA: 0.75, wpn: 1.35, fTh: 0.08, fSh: -0.05, bTh: -0.1, bSh: -0.05 },
  stagger: { ...MB, lean: -0.35, head: -0.4, fUA: 0.3, fFA: 0.4, bUA: -0.5, bFA: 0.6, wpn: 0.9, fTh: 0.4, fSh: -0.3, bTh: -0.6, bSh: -0.5 },
};

/** A flat, glowing silhouette of a style (afterimages). */
const ghostCache = new WeakMap<HumanStyle, HumanStyle>();
function ghostStyle(S: HumanStyle): HumanStyle {
  let w = ghostCache.get(S);
  if (!w) {
    const C = 'rgba(255,60,70,1)';
    w = { ...flashStyle(S), skin: C, coat: C, coatDark: C, pants: C, boots: C, glove: C, belt: C, plate: S.plate ? { c: C, dark: C, hi: C, tier: S.plate.tier } : null, helmColor: C, eye: C, outline: C, weaponColor: C, offColor: C, offTrim: C };
    ghostCache.set(S, w);
  }
  return w;
}

interface Ghost { x: number; y: number; face: number; j: Joints; life: number }

export class Marshal extends BossBase {
  j: Joints = newJoints();
  pose: Pose = { ...MP.planted };
  target: Pose = { ...MP.planted };
  rate = 8;
  cape: Chain;
  atk: MAtk | null = null;
  lastAtk: MAtk | null = null;
  step = 0;
  steps = 3;
  parryCd = 0;
  hidden = false;
  ghosts: Ghost[] = [];
  ghostT = 0;
  landX = 0;
  landY = 0;
  styleBoss: HumanStyle;
  styleCracked: HumanStyle;
  edgeN = 0;
  grounded = true;
  /** Set by the story once the duel is won. */
  yielded = false;

  constructor(x: number, y: number) {
    super('marshal', x, y, 20, 54, 3200);
    this.name = 'The Crimson Marshal';
    this.sub = 'Commander of the Tower';
    this.maxPoise = this.poise = 300;
    this.kneelTime = 3.6;
    this.face = -1;
    this.hitColor = '#ffd0d0';
    this.hitSound = 'hitMetal';
    this.collide = true;
    this.heavyBody = true;
    this.cape = new Chain(8, 5, x, y - 44);
    this.styleBoss = marshalStyle('boss', 0, false);
    this.styleCracked = marshalStyle('boss', 0, true);
    solve(this.pose, SENT_DIMS, true, this.j);
  }

  get dmg() {
    return 28 * this.ngMul * (this.phase >= 3 ? 1.12 : 1);
  }
  get spd() {
    return this.phase >= 3 ? 1.3 : this.phase === 2 ? 1.12 : 1;
  }
  visible() {
    return !this.hidden;
  }
  hurtbox() {
    const kneel = this.state === 'kneel' || this.state === 'dead' ? 14 : 0;
    return { x: this.x - 12, y: this.y - 54 + kneel, w: 24, h: 54 - kneel };
  }
  get cy() {
    return this.y - 28;
  }

  /** Weapon tip in world space (for effects). */
  tip() {
    const S = 1.3;
    const a = this.j.wpnA;
    const L = 30;
    return { x: this.x + this.face * (this.j.haFX + Math.sin(a) * L) * S, y: this.y + (this.j.haFY + Math.cos(a) * L) * S };
  }
  hand() {
    const S = 1.3;
    return { x: this.x + this.face * this.j.haFX * S, y: this.y + this.j.haFY * S };
  }

  // ------------------------------------------------------------ lifecycle
  updateDormant(_dt: number) {
    this.target = { ...MP.planted, head: 0.15 + Math.sin(G.time * 0.8) * 0.03 };
  }

  updateIntro(_dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 30, y: this.y - 40 };
    if (t < 1.2) {
      this.target = { ...MP.planted, head: 0.2 };
    } else if (this.introT === 0) {
      this.introT = 1;
      // He draws the blade from the floor.
      sfx('swingHeavy', { pitch: 0.7 });
      fx.shards(this.x + this.face * 14, this.y, 8, '#6a5a5a', 1);
      this.target = { ...MP.ready };
    } else if (t > 2.0 && this.introT === 1) {
      this.introT = 2;
      // The salute: blade before the face.
      this.target = { ...MP.salute };
      sfx('clash', { pitch: 1.4, vol: 0.5 });
      sfx('bell', { pitch: 0.7, vol: 0.5 });
    } else if (t > 3.4 && this.introT === 2) {
      this.introT = 3;
      this.target = { ...MP.guard };
      sfx('swingHeavy', { pitch: 0.9 });
      fx.ring(this.x, this.y - 30, 10, 200, '#ff3a4a', 0.7, 4);
      G.camera.addTrauma(0.3 * shakeScale());
      G.ui.banner('THE CRIMSON MARSHAL', 'Commander of the Tower', 'boss');
      music.phase = 0;
      music.play('duel', 0.3);
    } else if (t > 4.6) {
      this.beginFight();
    }
  }

  updateKneel(_dt: number) {
    this.target = { ...MP.kneel, head: 0.5 + Math.sin(G.time * 3) * 0.05 };
    this.physics(_dt);
    this.body.vx = approach(this.body.vx, 0, 600 * _dt);
  }

  onKneel() {
    this.atk = null;
    this.hidden = false;
    this.grav = 1;
    this.rate = 10;
    G.ui.toast('The Marshal falters. Execute him!', 'good');
  }

  recover() {
    super.recover();
    sfx('swingHeavy', { pitch: 0.8 });
    this.target = { ...MP.guard };
    this.parryCd = 0.6;
  }

  guard(h: HitInfo): boolean {
    // A swordsman's parry: some frontal blows are turned aside, then answered.
    if (this.state !== 'idle' || this.parryCd > 0 || h.guardBreak || h.heavy || h.kind !== 'melee') return false;
    const frontal = h.dir !== 0 && sign(h.dir) !== this.face;
    if (!frontal) return false;
    const chance = this.phase >= 3 ? 0.55 : this.phase === 2 ? 0.45 : 0.35;
    if (Math.random() > chance) return false;
    this.parryCd = this.phase >= 3 ? 1.6 : 2.2;
    sfx('clash', { pan: G.world.pan(this.x) });
    sfx('parry', { pan: G.world.pan(this.x), pitch: 0.7 });
    const hd = this.hand();
    fx.hitSparks(hd.x + this.face * 8, hd.y - 6, -this.face, '#ffd0d0', 16, 1.3);
    fx.ring(hd.x + this.face * 6, hd.y - 6, 4, 34, '#ff6a7a', 0.25, 2);
    const p = G.world.player;
    if (h.src === p) {
      p.body.vx = this.face * 190;
      fx.number(p.x, p.y - 44, 'PARRIED', false, '#ff8a8a');
    }
    G.world.hitstop(0.08);
    this.start('riposte');
    return true;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    this.parryCd = Math.max(0, this.parryCd - dt);
    const p = G.world.player;
    const dx = p.x - this.x;
    const dist = Math.abs(dx);
    if (this.state === 'idle') {
      this.face = sign(dx) || this.face;
      this.target = { ...MP.guard, lean: 0.2 + Math.sin(G.time * 2) * 0.03 };
      // Measured footwork: close to striking range, never rush blindly.
      const want = dist > 70 ? sign(dx) * 70 * this.spd : dist < 34 ? -sign(dx) * 50 : 0;
      this.body.vx = approach(this.body.vx, want, 500 * dt);
      this.physics(dt);
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    let pool: MAtk[];
    if (this.phase === 1) pool = dist < 80 ? ['combo', 'combo', 'lunge'] : dist < 200 ? ['lunge', 'leap', 'combo'] : ['leap', 'lunge'];
    else pool = dist < 80 ? ['combo', 'combo', 'blink', 'leap'] : dist < 200 ? ['lunge', 'edge', 'blink', 'leap'] : ['edge', 'blink', 'leap'];
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.6) a = choose(pool);
    this.start(a);
  }

  private start(a: MAtk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.edgeN = 0;
    this.hitSet.clear();
    this.steps = this.phase >= 3 ? 4 : 3;
    const p = G.world.player;
    if (a !== 'blink') this.face = sign(p.x - this.x) || this.face;
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.hidden = false;
    this.cd = cd / this.spd;
    this.rate = 8;
  }

  private physics(dt: number) {
    const b = this.body;
    b.vy = Math.min(700, b.vy + 1500 * this.grav * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, true);
    this.grounded = b.onGround;
    const w = G.world.grid.w * 16;
    this.x = clamp(this.x, 24, w - 24);
  }

  private swingFx(a0: number, a1: number, r = 34) {
    const hd = this.hand();
    fx.slash(hd.x, hd.y - 4, r, a0, a1, 9, this.face, '#ffe0e0', '#ff2a3a', 0.18);
  }

  private hit(bx: number, by: number, bw: number, bh: number, mul: number, extra: Partial<HitInfo> = {}) {
    const f = this.face;
    const x = f > 0 ? this.x + bx : this.x - bx - bw;
    return G.world.hitPlayerSide({ x, y: this.y + by, w: bw, h: bh }, { dmg: this.dmg * mul, poise: 30, kx: f * 200, ky: -150, dir: f, kind: 'melee', src: this, parryable: true, ...extra }, this.hitSet);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st;
    const f = this.face;
    const W = G.world;
    const sp = this.spd;
    const b = this.body;
    switch (this.atk) {
      case 'combo': case 'riposte': {
        // Down-cut, rising cut, thrust (and in the last phase, a second down-cut).
        const riposte = this.atk === 'riposte';
        const kind = riposte ? 2 : this.step % 3;
        const tel = (riposte ? 0.22 : this.step === 0 ? 0.48 : kind === 2 ? 0.36 : 0.3) / sp;
        const act = 0.12, rec = this.step === this.steps - 1 || riposte ? 0.55 : 0.12;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.overhead : kind === 1 ? MP.low : MP.draw;
          if (t < dt * 1.5 && this.step === 0) sfx('swing', { pan: W.pan(this.x), pitch: 0.6, vol: 0.4 });
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 0 ? MP.downcut : kind === 1 ? MP.rising : MP.thrust;
          if (t - dt < tel) {
            b.vx = f * (kind === 2 ? 300 : 180);
            sfx(kind === 2 ? 'swingSpear' : 'swingHeavy', { pan: W.pan(this.x), pitch: 0.85 });
            if (kind === 0) this.swingFx(-2.6, 0.9, 38);
            else if (kind === 1) this.swingFx(1.0, -2.4, 36);
            else fx.streak(this.x + f * 10, this.y - 30, this.x + f * 80, this.y - 30, '#ff6a7a', 0.18, 3);
          }
          if (kind === 0) this.hit(-2, -66, 62, 66, 1, { poise: 34 });
          else if (kind === 1) this.hit(-2, -74, 56, 70, 1, { poise: 34, ky: -320, kx: f * 120 });
          else this.hit(0, -40, 84, 22, 1.3, { poise: 50, kx: f * 320, ky: -160 });
        } else if (t < tel + act + rec) {
          this.rate = 8;
        } else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (riposte || this.step >= this.steps || Math.abs(dx) > 110) this.endAttack(riposte ? 0.8 : 1.1);
        }
        break;
      }
      case 'lunge': {
        const tel = 0.45 / Math.min(sp, 1.2);
        if (t < tel) {
          this.rate = 10;
          this.target = MP.draw;
          b.vx = approach(b.vx, -f * 30, 600 * dt);
          if (t < dt * 1.5) sfx('charge', { pan: W.pan(this.x), pitch: 1.3, vol: 0.5 });
        } else if (t < tel + 0.22) {
          this.rate = 30;
          this.target = MP.thrust;
          if (t - dt < tel) {
            sfx('dash', { pan: W.pan(this.x), pitch: 0.7 });
            fx.streak(this.x, this.y - 30, this.x + f * 140, this.y - 30, '#ff3a4a', 0.25, 4);
          }
          b.vx = f * 640;
          this.hit(0, -44, 50, 30, 1.25, { poise: 50, kx: f * 300, ky: -180 });
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
        } else {
          this.rate = 8;
          b.vx = approach(b.vx, 0, 1800 * dt);
          if (t > tel + 0.22 + 0.5) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'leap': {
        const tel = 0.32;
        if (t < tel) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = approach(b.vx, 0, 900 * dt);
          this.physics(dt);
        } else if (this.step === 0) {
          this.step = 1;
          const p = W.player;
          this.landX = clamp(p.x, 40, W.grid.w * 16 - 40);
          this.landY = p.body.onGround ? p.y : this.y;
          const T = 0.78;
          b.vy = -585;
          b.vx = clamp((this.landX - this.x) / T, -460, 460);
          b.onGround = false;
          sfx('jump', { pan: W.pan(this.x), pitch: 0.6 });
          fx.dust(this.x, this.y, 10, 1.6);
          this.target = MP.air;
          this.rate = 10;
          this.physics(dt);
        } else if (this.step === 1) {
          this.target = b.vy > 0 ? MP.plunge : MP.air;
          this.rate = b.vy > 0 ? 18 : 10;
          this.physics(dt);
          if (b.vy > 0) this.hit(-14, -50, 52, 52, 1, { poise: 40 });
          if (this.grounded && t > tel + 0.1) {
            this.step = 2;
            this.st = tel + 0.1;
            b.vx = 0;
            this.target = MP.downcut;
            this.rate = 30;
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 1.4, vol: 0.7 });
            G.camera.addTrauma(0.45 * shakeScale());
            fx.dust(this.x, this.y, 20, 2.2);
            fx.ring(this.x, this.y - 2, 6, 90, '#ff6a7a', 0.4, 3, 0.25);
            this.hitSet.clear();
            W.hitPlayerSide({ x: this.x - 70, y: this.y - 34, w: 140, h: 34 }, { dmg: this.dmg * 1.1, poise: 50, kx: sign(W.player.x - this.x) * 260, ky: -280, dir: sign(W.player.x - this.x) || 1, kind: 'melee', src: this, unblockable: true }, this.hitSet);
            if (this.phase >= 2) {
              W.add(new Proj('wave', this.x + 20, this.y, 'enemy', this.dmg * 0.6, { vx: 260, life: 1.4, w: 14, h: 24, color: '#ff3a4a', big: true }));
              W.add(new Proj('wave', this.x - 20, this.y, 'enemy', this.dmg * 0.6, { vx: -260, life: 1.4, w: 14, h: 24, color: '#ff3a4a', big: true }));
            }
          }
          if (t > 2.5) this.step = 2;
        } else {
          this.rate = 6;
          this.physics(dt);
          if (t > tel + 0.1 + 0.6) this.endAttack(1.1);
        }
        break;
      }
      case 'edge': {
        // Blood-edge crescents: the first skims the floor (jump it); the
        // second, in the last phase, flies at head height (dodge through it).
        const tel = 0.5 / Math.min(sp, 1.2);
        const n = this.phase >= 3 ? 2 : 1;
        const cyc = tel + 0.35;
        const k = Math.floor(t / cyc);
        const u = t - k * cyc;
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        if (k >= n) {
          this.target = MP.guard;
          if (t > n * cyc + 0.35) this.endAttack(1.2);
          break;
        }
        const low = k === 0;
        if (u < tel) {
          this.rate = 10;
          this.target = low ? MP.low : MP.overhead;
          if (u < dt * 1.5) sfx('beamCharge', { pan: W.pan(this.x), pitch: 1.8, vol: 0.4 });
        } else {
          this.rate = 30;
          this.target = low ? MP.rising : MP.downcut;
          if (this.edgeN === k) {
            this.edgeN++;
            sfx('swordWord', { pan: W.pan(this.x), pitch: 0.7 });
            this.swingFx(low ? 1.0 : -2.6, low ? -2.2 : 0.9, 40);
            const y = low ? this.y - 10 : this.y - 34;
            W.add(new Proj('word', this.x + f * 18, y, 'enemy', this.dmg * 0.9, { vx: f * 380, life: 1.6, w: 18, h: low ? 20 : 26, color: '#ff3a4a', poise: 30 }));
          }
        }
        break;
      }
      case 'blink': {
        // Vanish in crimson smoke; reappear behind Elior and cut.
        const p = W.player;
        if (t < 0.18) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = 0;
        } else if (!this.hidden && this.step === 0) {
          this.hidden = true;
          this.step = 1;
          sfx('whoosh', { pan: W.pan(this.x), pitch: 0.6 });
          fx.veilBurst(this.x, this.y - 28, 16, 1.2);
          for (let i = 0; i < 12; i++) fx.spawn(PK.Smoke, this.x + rand(-10, 10), this.y - rand(0, 50), rand(-40, 40), rand(-60, -10), 0.6, 4, 12, '#5a0a14', -10, 1);
          this.addGhost();
        } else if (this.step === 1 && t > 0.18 + 0.42 / sp) {
          this.step = 2;
          this.hidden = false;
          const side = -(p.face || 1);
          let nx = p.x + side * 40;
          const w = W.grid.w * 16;
          if (nx < 30 || nx > w - 30 || W.solidAt(nx, p.y - 20)) nx = p.x - side * 40;
          this.x = clamp(nx, 30, w - 30);
          this.y = p.body.onGround ? p.y : this.y;
          b.vx = b.vy = 0;
          this.face = sign(p.x - this.x) || -side;
          sfx('dash', { pan: W.pan(this.x), pitch: 1.6, vol: 0.6 });
          fx.veilBurst(this.x, this.y - 28, 12, 1);
          fx.ring(this.x, this.y - 28, 4, 40, '#ff3a4a', 0.3, 2);
          this.target = MP.overhead;
          this.rate = 30;
          this.st = 0.18 + 0.42 / sp;
        } else if (this.step === 2) {
          const t2 = t - (0.18 + 0.42 / sp);
          if (t2 < 0.3) {
            this.target = MP.overhead;
            this.rate = 16;
          } else if (t2 < 0.42) {
            this.target = MP.downcut;
            this.rate = 30;
            if (t2 - dt < 0.3) {
              sfx('swingHeavy', { pan: W.pan(this.x), pitch: 0.8 });
              this.swingFx(-2.6, 0.9, 38);
              b.vx = this.face * 160;
            }
            this.hit(-2, -66, 62, 66, 1.15, { poise: 40 });
          } else if (t2 > 0.95) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
    }
  }

  private addGhost() {
    this.ghostT = 0.05;
    const j = { ...this.j };
    this.ghosts.push({ x: this.x, y: this.y, face: this.face, j, life: 0.35 });
    if (this.ghosts.length > 6) this.ghosts.shift();
  }

  // ------------------------------------------------------------ phases
  beginTransition() {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.hidden = false;
    this.phase = 2;
    this.maxPoise = this.poise = 330;
    this.introT = 0;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.5, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 40 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 1.0) {
      this.target = { ...MP.stagger };
      this.rate = 6;
    } else if (this.introT === 0) {
      this.introT = 1;
      sfx('shatter', { pitch: 1.3 });
      sfx('hitMetal', { pitch: 0.6 });
      fx.shards(this.x + this.face * 4, this.y - 52, 18, '#3a2a2e', 1.4);
      fx.flash('#ff3a4a', 0.3);
      G.camera.addTrauma(0.5 * shakeScale());
      this.target = { ...MP.planted, head: -0.2 };
      G.ui.caption('His helm splits and falls. Beneath it, a face set like flint.');
    } else if (t > 2.0 && this.introT === 1) {
      this.introT = 2;
      this.target = { ...MP.rising };
      this.rate = 14;
      sfx('swordWord', { pitch: 0.5 });
      sfx('pillarFire', { vol: 0.6 });
      fx.ring(this.x, this.y - 30, 10, 260, '#ff3a4a', 0.9, 5);
      fx.embers(this.x, this.y - 40, 40, '#ff4a3a', 30);
      G.camera.addTrauma(0.6 * shakeScale());
      music.phase = 1;
    } else if (t > 3.4) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.6;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      G.ui.caption(null);
    }
  }

  enterPhase3() {
    this.phase = 3;
    music.phase = 2;
    sfx('swordWord', { pitch: 0.4 });
    fx.flash('#ff3a4a', 0.25);
    fx.ring(this.x, this.y - 30, 10, 200, '#ff3a4a', 0.7, 4);
    G.ui.toast('The Marshal will not yield.', 'warn');
  }

  die() {
    super.die();
    this.atk = null;
    this.hidden = false;
    this.ghosts.length = 0;
  }

  /** Restore the kneeling, defeated Marshal (a reload before Elior chose). */
  yieldNow() {
    this.state = 'dead';
    this.dying = true;
    this.yielded = true;
    this.introT = 9;
    this.st = 4;
    this.invuln = 999;
    this.pose = { ...MP.kneel };
    this.target = { ...MP.kneel };
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 34 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 1.0) {
      this.target = { ...MP.stagger };
      this.rate = 5;
    } else if (this.introT !== 9) {
      this.introT = 9;
      // Down on one knee, the blade driven into the floor.
      this.target = { ...MP.kneel };
      this.rate = 6;
      sfx('clash', { pitch: 0.6 });
      fx.dust(this.x + this.face * 20, this.y, 12, 1.4);
      fx.shards(this.x + this.face * 20, this.y, 10, '#6a5a5a', 1);
      G.camera.addTrauma(0.3);
    } else if (t > 3.0 && !this.yielded) {
      this.yielded = true;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    const k = Math.min(1, dt * this.rate);
    for (const key of Object.keys(this.target) as (keyof Pose)[]) this.pose[key] = lerp(this.pose[key], this.target[key], k);
    solve(this.pose, SENT_DIMS, true, this.j);
    const f = this.face;
    const S = 1.3;
    this.cape.update(this.x + f * (this.j.shBX - 2) * S, this.y + this.j.shBY * S, dt, -this.body.vx * 2 - f * 60, 420, 0.88);
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.phase >= 3 && this.state === 'attack' && !this.hidden) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.addGhost();
        this.ghostT = 0.09;
      }
    }
    if (this.phase >= 2 && !this.hidden && this.state !== 'dead' && Math.random() < dt * 24) {
      const tp = this.tip();
      fx.spawn(PK.Flame, tp.x + rand(-4, 4), tp.y + rand(-4, 4), rand(-10, 10), rand(-60, -30), 0.3, 3, 0.5, '#ff4a3a', -60, 1);
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const f = this.face;
    const S = 1.3;
    const style = this.phase >= 2 ? this.styleCracked : this.styleBoss;
    // Leap target.
    if (this.atk === 'leap' && this.step === 1) this.floorMark(ctx, this.landX, this.landY, 50, this.st / 0.9, '#ff3a4a');
    // Afterimages.
    for (const gh of this.ghosts) {
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.scale(gh.face * S, S);
      ctx.globalAlpha = clamp(gh.life / 0.35, 0, 1) * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      drawHumanoid(ctx, gh.j, ghostStyle(style), G.time, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.hidden) return;
    // Crimson aura in the later phases.
    if (this.phase >= 2) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 30, 46, '#ff2a3a', 0.18 + Math.sin(G.time * 5) * 0.05);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawRibbon(ctx, this.cape, 13, 17, '#7a1218', '#0a0406');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f * S, S);
    drawHumanoid(ctx, this.j, style, G.time, this.pose.rot, this.body.vx * f / S, this.body.vy / S);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, this.j, flashStyle(style), G.time, this.pose.rot);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Telegraph glints.
    if (this.state === 'attack') {
      const hd = this.hand();
      const t = this.st;
      if ((this.atk === 'combo' && this.step === 0 && t < 0.4 / this.spd) || (this.atk === 'lunge' && t < 0.42) || (this.atk === 'edge' && t % (0.5 / Math.min(this.spd, 1.2) + 0.35) < 0.4) || (this.atk === 'riposte' && t < 0.2)) this.glint(ctx, hd.x, hd.y - 6, '#ff3a4a');
      if (this.atk === 'blink' && this.step === 2 && t - (0.18 + 0.42 / this.spd) < 0.28) this.glint(ctx, this.x, this.y - 50, '#ff3a4a', 1.2);
    }
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 30, 50, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay(ctx: Ctx) {
    if (this.state === 'kneel') {
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(G.time * 10) * 0.3;
      const y = this.y - 66;
      glow(ctx, this.x, y, 14, '#ffe6a8', 0.7 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.x, y - 7); ctx.lineTo(this.x + 5, y); ctx.lineTo(this.x, y + 7); ctx.lineTo(this.x - 5, y); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.state === 'dead' && this.yielded) {
      // The purifying light waits on Elior's choice.
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.6 + Math.sin(G.time * 3) * 0.2;
      glow(ctx, this.x, this.y - 26, 50, '#ff3a4a', 0.25 * p);
      glow(ctx, this.x, this.y - 30, 24, '#ffe6a8', 0.3 * p);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.hidden) return;
    lighting.add(this.x, this.y - 30, 90, '#ff2a3a', this.phase >= 2 ? 0.7 : 0.45, 0.4);
    if (this.phase >= 2) {
      const tp = this.tip();
      lighting.add(tp.x, tp.y, 50, '#ff4a3a', 0.8, 0.6);
    }
  }
}

export type ChapterIIBoss = Gatekeeper | Marshal;
export { circle };
