// THE LOCUST KING — sovereign of the swarm that devoured the Valley of
// Bones, born from the great cocoon in the brood chamber. Blinding speed,
// scything claw strings, dives from the air, acid, a paralysing screech,
// a swarm at his call, and in the end he eats his own drones to heal.
// Beaten, he kneels; Elior raises him as an Echo.

import { type HitInfo } from './entity';
import { BossBase } from './bosses2';
import { solve, newJoints, type Joints, type Pose } from '../render/skeleton';
import { glow, rgba, ellipse, poly, circle, type Ctx } from '../render/draw';
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
import { SENT_BASE } from './enemies';
import { LOCUST_DIMS, locustStyle, drawLocustWings, drawLocustHead, drawLocustScythes, Drone } from './locusts';

type KAtk = 'claws' | 'dive' | 'acid' | 'screech' | 'swarm' | 'devour' | 'blur';

const KB: Pose = { ...SENT_BASE, lean: 0.3, head: 0.05, bUA: 0.8, bFA: 1.4, fUA: 0.6, fFA: 1.5, wpn: 0.3, bTh: -0.4, bSh: -0.4, fTh: 0.55, fSh: -0.7 };
const KP = {
  ready: KB,
  crouch: { ...KB, lean: 0.55, fTh: 1.0, fSh: -1.6, bTh: 0.1, bSh: -1.4, sq: 0.94 },
  rake1: { ...KB, lean: -0.1, fUA: 2.9, fFA: 0.6, bUA: 0.4, bFA: 0.8 },
  rake2: { ...KB, lean: 0.55, fUA: 0.9, fFA: 0.1, bUA: 2.6, bFA: 0.5, fTh: 0.8, fSh: -0.7, bTh: -0.7, bSh: -0.2 },
  rake3: { ...KB, lean: 0.5, fUA: 2.4, fFA: 0.2, bUA: 0.9, bFA: 0.1, fTh: 0.6, fSh: -0.6, bTh: -0.8, bSh: -0.3 },
  thrust: { ...KB, lean: 0.6, fUA: 1.6, fFA: 0.0, bUA: 1.5, bFA: 0.1, fTh: 0.95, fSh: -0.6, bTh: -0.9, bSh: -0.1 },
  hover: { ...KB, lean: 0.2, fUA: 1.4, fFA: 1.6, bUA: 1.2, bFA: 1.7, fTh: 0.9, fSh: -1.4, bTh: 0.3, bSh: -1.1 },
  dive: { ...KB, lean: 0.9, fUA: 2.0, fFA: 0.2, bUA: 1.9, bFA: 0.3, fTh: 0.5, fSh: -0.4, bTh: -0.2, bSh: -0.3 },
  spit: { ...KB, lean: -0.3, head: -0.5, fUA: 0.4, fFA: 1.3, bUA: 0.3, bFA: 1.4 },
  screech: { ...KB, lean: -0.45, head: -0.7, fUA: 2.3, fFA: 1.2, bUA: 2.2, bFA: 1.2, fTh: 0.4, bTh: -0.5 },
  kneel: { ...KB, lean: 0.6, head: 0.5, fUA: 0.3, fFA: 1.2, bUA: 0.3, bFA: 1.3, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9 },
  curl: { ...KB, lean: 1.1, head: 0.8, fUA: 0.6, fFA: 2.2, bUA: 0.6, bFA: 2.2, fTh: 1.6, fSh: -2.6, bTh: 1.2, bSh: -2.4, sq: 0.9 },
};

/** The king of the swarm stands a head taller than its soldiers. */
const KING_SCALE = 1.65;

export class LocustKing extends BossBase {
  pixelBox = [-130, -230, 130, 12] as const;
  j: Joints = newJoints();
  pose: Pose = { ...KP.curl };
  target: Pose = { ...KP.curl };
  rate = 8;
  atk: KAtk | null = null;
  lastAtk: KAtk | null = null;
  step = 0;
  flying = false;
  wingSpread = 0;
  beat = 0;
  bite = 0;
  diveTo = { x: 0, y: 0 };
  diveN = 0;
  devours = 0;
  ghosts: { x: number; y: number; face: number; j: Joints; life: number }[] = [];
  ghostT = 0;
  style: HumanStyle;
  rageStyle: HumanStyle;
  floorY: number;
  hidden = false;
  /** Set by the story once he has knelt. */
  yielded = false;

  constructor(x: number, y: number) {
    super('locust_king', x, y, 22, 62, 5200);
    this.name = 'The Locust King';
    this.sub = 'Sovereign of the Devouring Swarm';
    this.maxPoise = this.poise = 320;
    this.kneelTime = 3.4;
    this.face = -1;
    this.floorY = y;
    this.hitColor = '#d0ffa0';
    this.hitSound = 'hitHeavy';
    this.style = locustStyle('king');
    this.rageStyle = { ...locustStyle('king'), crack: '#ff2a3a', eye: '#ff6a3a', weaponGlow: '#ff3a4a', weaponGlowAmt: 0.6 };
    this.phaseMarks = [0.6, 0.25];
    solve(this.pose, LOCUST_DIMS, true, this.j);
  }

  get dmg() {
    return 34 * this.ngMul * (this.phase >= 3 ? 1.15 : 1);
  }
  get spd() {
    return this.phase >= 3 ? 1.35 : this.phase === 2 ? 1.15 : 1;
  }
  visible() {
    return !this.hidden;
  }
  hurtbox() {
    const low = this.state === 'kneel' || this.state === 'dead' ? 16 : 0;
    return { x: this.x - 13, y: this.y - 62 + low, w: 26, h: 62 - low };
  }
  get cy() {
    return this.y - 32;
  }
  hand() {
    const S = KING_SCALE;
    return { x: this.x + this.face * this.j.haFX * S, y: this.y + this.j.haFY * S };
  }

  // ------------------------------------------------------------ lifecycle
  updateDormant(_dt: number) {
    // Curled in the cocoon until the story wakes him.
    this.target = { ...KP.curl };
  }

  updateIntro(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 50 };
    if (t < 1.0) {
      this.target = { ...KP.curl };
      G.camera.addTrauma(dt * 0.6);
    } else if (this.introT === 0) {
      this.introT = 1;
      // He unfolds.
      this.target = { ...KP.crouch };
      this.rate = 3;
      sfx('chitter', { pitch: 0.6, vol: 1 });
    } else if (t > 2.0 && this.introT === 1) {
      this.introT = 2;
      this.target = { ...KP.screech };
      this.rate = 10;
      this.wingSpread = 1;
      sfx('screech');
      G.camera.addTrauma(0.8 * shakeScale());
      fx.ring(this.x, this.y - 40, 10, 320, '#c9a8ff', 0.9, 6);
      fx.ring(this.x, this.y - 40, 10, 220, '#ff3a4a', 0.7, 4);
      G.ui.banner('THE LOCUST KING', 'Sovereign of the Devouring Swarm', 'boss');
      music.phase = 0;
      music.play('swarm', 0.3);
    } else if (t > 3.6 && this.introT === 2) {
      this.introT = 3;
      this.target = { ...KP.ready };
      this.rate = 8;
      this.wingSpread = 0.15;
    } else if (t > 4.3) {
      this.beginFight();
    }
  }

  updateKneel(dt: number) {
    this.target = { ...KP.kneel, head: 0.5 + Math.sin(G.time * 3) * 0.05 };
    this.flying = false;
    this.physics(dt);
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
  }

  onKneel() {
    this.atk = null;
    this.hidden = false;
    this.flying = false;
    this.wingSpread = 0;
    this.rate = 10;
    G.ui.toast('The Locust King falls to his knees. Execute him!', 'good');
  }

  recover() {
    super.recover();
    sfx('screech', { vol: 0.5, pitch: 1.3 });
    this.target = { ...KP.ready };
  }

  takeHit(h: HitInfo): boolean {
    const ok = super.takeHit(h);
    if (ok && !h.dot && this.state === 'attack' && this.atk === 'devour') {
      // Interrupt the meal.
      this.endAttack(0.6);
    }
    return ok;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const dx = p.x - this.x;
    const dist = Math.abs(dx);
    if (this.phase >= 3 && this.state !== 'kneel') this.hp = Math.min(this.maxHp * this.p3At * 1.2, this.hp + this.maxHp * 0.003 * dt);
    if (this.state === 'idle') {
      this.face = sign(dx) || this.face;
      this.flying = false;
      this.wingSpread = approach(this.wingSpread, this.phase >= 2 ? 0.3 : 0.1, dt);
      this.target = { ...KP.ready, lean: 0.3 + Math.sin(G.time * 4) * 0.04 };
      const want = dist > 90 ? sign(dx) * 110 * this.spd : dist < 40 ? -sign(dx) * 70 : 0;
      this.body.vx = approach(this.body.vx, want, 700 * dt);
      this.physics(dt);
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const drones = G.world.ents.filter((e) => e instanceof Drone && !e.dying).length;
    if (this.phase >= 3 && drones > 0 && this.devours < 4 && Math.random() < 0.45) return this.start('devour');
    if (this.phase >= 2 && drones === 0 && Math.random() < 0.3) return this.start('swarm');
    let pool: KAtk[];
    if (this.phase === 1) pool = dist < 90 ? ['claws', 'claws', 'dive', 'acid'] : ['dive', 'acid', 'claws'];
    else pool = dist < 90 ? ['claws', 'blur', 'screech', 'dive'] : ['dive', 'acid', 'blur', 'screech', 'claws'];
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.6) a = choose(pool);
    this.start(a);
  }

  private start(a: KAtk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.diveN = 0;
    this.hitSet.clear();
    const p = G.world.player;
    if (a !== 'blur') this.face = sign(p.x - this.x) || this.face;
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.hidden = false;
    this.flying = false;
    this.cd = cd / this.spd;
    this.rate = 8;
  }

  private physics(dt: number) {
    const b = this.body;
    if (!this.flying) b.vy = Math.min(800, b.vy + 1500 * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, true);
    const w = G.world.grid.w * 16;
    this.x = clamp(this.x, 24, w - 24);
  }

  private hit(bx: number, by: number, bw: number, bh: number, mul: number, extra: Partial<HitInfo> = {}) {
    const f = this.face;
    const x = f > 0 ? this.x + bx : this.x - bx - bw;
    return G.world.hitPlayerSide({ x, y: this.y + by, w: bw, h: bh }, { dmg: this.dmg * mul, poise: 26, kx: f * 200, ky: -150, dir: f, kind: 'melee', src: this, parryable: true, ...extra }, this.hitSet);
  }

  private rakeFx(a0: number, a1: number) {
    const hd = this.hand();
    fx.slash(hd.x, hd.y - 4, 30, a0, a1, 8, this.face, '#f4ffe0', '#9a5aff', 0.16);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st;
    const f = this.face;
    const W = G.world;
    const sp = this.spd;
    const b = this.body;
    switch (this.atk) {
      case 'claws': {
        // A string of rakes, each with a short forward skip.
        const n = this.phase >= 3 ? 6 : this.phase === 2 ? 5 : 4;
        const tel = (this.step === 0 ? 0.42 : 0.16) / sp;
        const act = 0.1;
        b.vx = approach(b.vx, 0, 1200 * dt);
        if (t < tel) {
          this.rate = 14;
          this.target = this.step % 2 ? KP.rake1 : KP.rake3;
          if (this.step === 0 && t < dt * 1.5) sfx('chitter', { pan: W.pan(this.x), pitch: 1.4 });
        } else if (t < tel + act) {
          this.rate = 34;
          this.target = this.step % 2 ? KP.rake2 : KP.thrust;
          this.bite = 1;
          if (t - dt < tel) {
            b.vx = f * 220;
            sfx('swing', { pan: W.pan(this.x), pitch: 1.2 + this.step * 0.05 });
            if (this.step % 2) this.rakeFx(-2.6, 0.8);
            else this.rakeFx(0.9, -2.2);
          }
          this.hit(-2, -60, 48, 60, this.step === n - 1 ? 1.2 : 0.7, { poise: this.step === n - 1 ? 40 : 18 });
        } else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (this.step >= n || Math.abs(dx) > 120) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'dive': {
        // Take wing, hover, mark a spot, and fall on it.
        const p = W.player;
        if (this.step === 0) {
          this.flying = true;
          this.wingSpread = 1;
          this.target = KP.hover;
          b.vx = approach(b.vx, 0, 600 * dt);
          b.vy = approach(b.vy, -260, 1400 * dt);
          if (t < dt * 1.5) {
            sfx('wingbeat', { pan: W.pan(this.x) });
            fx.dust(this.x, this.y, 12, 1.6);
          }
          if (t > 0.45 || this.y < this.floorY - 120) {
            this.step = 1;
            this.st = 0;
          }
        } else if (this.step === 1) {
          b.vx = approach(b.vx, 0, 900 * dt);
          b.vy = approach(b.vy, 0, 900 * dt);
          this.face = sign(p.x - this.x) || this.face;
          this.diveTo = { x: clamp(p.x, 30, W.grid.w * 16 - 30), y: p.body.onGround ? p.y : this.floorY };
          if (t > 0.38 / Math.min(sp, 1.2)) {
            this.step = 2;
            this.st = 0;
            this.hitSet.clear();
            sfx('screech', { vol: 0.4, pitch: 1.6 });
          }
        } else if (this.step === 2) {
          this.target = KP.dive;
          this.rate = 20;
          const ddx = this.diveTo.x - this.x, ddy = this.diveTo.y - this.y;
          const d = Math.hypot(ddx, ddy) || 1;
          b.vx = (ddx / d) * 760;
          b.vy = (ddy / d) * 760;
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
          this.hit(-14, -56, 44, 56, 1.1, { poise: 40, ky: -260 });
          if (b.onGround || d < 14 || t > 0.8) {
            this.flying = false;
            this.step = 3;
            this.st = 0;
            b.vx = 0;
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 1.5, vol: 0.7 });
            G.camera.addTrauma(0.45 * shakeScale());
            fx.dust(this.x, this.y, 22, 2.2);
            fx.ring(this.x, this.y - 2, 6, 100, '#c9a8ff', 0.4, 3, 0.25);
            this.hitSet.clear();
            W.hitPlayerSide({ x: this.x - 70, y: this.y - 30, w: 140, h: 30 }, { dmg: this.dmg * 0.8, poise: 40, kx: sign(W.player.x - this.x) * 240, ky: -260, dir: sign(W.player.x - this.x) || 1, kind: 'melee', src: this, unblockable: true }, this.hitSet);
          }
        } else {
          this.target = KP.crouch;
          this.wingSpread = approach(this.wingSpread, 0.2, dt * 2);
          this.diveN++;
          if (this.phase >= 2 && this.diveN === 1 && Math.random() < 0.6) {
            this.step = 0;
            this.st = 0;
          } else if (t > 0.5) this.endAttack(1.1);
        }
        this.physics(dt);
        break;
      }
      case 'acid': {
        // Three globs of acid, arcing.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        const p = W.player;
        this.target = t < 0.45 ? KP.spit : KP.ready;
        this.bite = t < 0.45 ? 1 : 0;
        if (t < dt * 1.5) sfx('chitter', { pan: W.pan(this.x), pitch: 0.8 });
        for (let k = 0; k < (this.phase >= 2 ? 5 : 3); k++) {
          const at = 0.4 + k * 0.14;
          if (t - dt < at && t >= at) {
            const tx = p.x + rand(-60, 60) + k * 10 * f;
            const T = 0.75;
            const vx = (tx - this.x) / T;
            const vy = ((p.y - 10) - (this.y - 50) - 0.5 * 260 * T * T) / T;
            W.add(new Proj('flame', this.x + f * 12, this.y - 50, 'enemy', this.dmg * 0.5, { vx, vy, life: 2.2, w: 12, h: 12, color: '#9aff3a' }));
            sfx('acid', { pan: W.pan(this.x) });
          }
        }
        if (t > 1.3) this.endAttack(1.2);
        break;
      }
      case 'screech': {
        // The paralysing cry: dodge through it or be pinned in place.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        const tel = 0.8 / Math.min(sp, 1.2);
        if (t < tel) {
          this.target = KP.screech;
          this.rate = 6;
          this.wingSpread = 1;
          if (Math.random() < dt * 30) fx.spawn(PK.Spark, this.x + rand(-20, 20), this.y - rand(30, 60), rand(-40, 40), rand(-40, 0), 0.3, 1.5, 0.3, '#c9a8ff', 0, 1);
          G.camera.addTrauma(dt * 0.6);
        } else if (this.step === 0) {
          this.step = 1;
          sfx('screech');
          fx.ring(this.x, this.y - 40, 10, 260, '#c9a8ff', 0.6, 8);
          fx.ring(this.x, this.y - 40, 6, 200, '#ffffff', 0.4, 3);
          G.camera.addTrauma(0.6 * shakeScale());
          const p = W.player;
          if (Math.hypot(p.x - this.x, p.y - this.y) < 230) {
            this.hitSet.clear();
            W.hitPlayerSide({ x: p.x - 10, y: p.y - 40, w: 20, h: 40 }, { dmg: this.dmg * 0.5, poise: 99, kx: sign(p.x - this.x) * 160, ky: -120, dir: sign(p.x - this.x) || 1, kind: 'melee', src: this, unblockable: true, stun: 0.9 }, this.hitSet);
          }
        } else if (t > tel + 0.7) {
          this.wingSpread = 0.3;
          this.endAttack(0.8);
        }
        break;
      }
      case 'swarm': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = KP.screech;
        this.wingSpread = 1;
        if (t > 0.5 && this.step === 0) {
          this.step = 1;
          sfx('buzz', { vol: 1, pitch: 0.8 });
          sfx('screech', { vol: 0.5, pitch: 1.4 });
          const v = G.camera.view();
          for (let i = 0; i < 3; i++) {
            const x = clamp(i === 1 ? this.x : i === 0 ? v.x + 40 : v.x + v.w - 40, 30, W.grid.w * 16 - 30);
            const d = W.spawnEnemy('drone', x, this.floorY - rand(90, 140));
            fx.veilBurst(d.cx, d.cy, 10, 1);
          }
        }
        if (t > 1.2) this.endAttack(0.9);
        break;
      }
      case 'devour': {
        // Dart to a drone and eat it.
        const d = W.ents.find((e) => e instanceof Drone && !e.dying) as Drone | undefined;
        if (!d) {
          this.endAttack(0.5);
          break;
        }
        this.face = sign(d.x - this.x) || this.face;
        if (Math.abs(d.x - this.x) > 26 || Math.abs(d.y - this.y) > 60) {
          this.flying = true;
          this.wingSpread = 1;
          this.target = KP.dive;
          b.vx = approach(b.vx, sign(d.x - this.x) * 420, 2400 * dt);
          b.vy = approach(b.vy, clamp((d.y + 20 - this.y) * 4, -300, 300), 1800 * dt);
          d.body.vx *= 0.5;
          this.physics(dt);
          if (t > 2) this.endAttack(0.6);
        } else {
          this.bite = 1;
          d.hp = 0;
          d.remove = true;
          this.devours++;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.035);
          sfx('bite', { pitch: 0.7 });
          fx.hitSparks(d.cx, d.cy, this.face, '#9aff3a', 16, 1.2);
          fx.number(this.x, this.y - 70, 'DEVOURS', false, '#9aff3a');
          this.endAttack(0.8);
        }
        break;
      }
      case 'blur': {
        // A dash too fast to see; he is behind you before you turn.
        const p = W.player;
        if (this.step === 0) {
          this.step = 1;
          const side = -(p.face || 1);
          const nx = clamp(p.x + side * 36, 30, W.grid.w * 16 - 30);
          for (let i = 0; i < 5; i++) {
            const u = i / 4;
            this.ghosts.push({ x: lerp(this.x, nx, u), y: this.y, face: this.face, j: { ...this.j }, life: 0.3 + u * 0.1 });
          }
          fx.streak(this.x, this.y - 30, nx, p.y - 30, '#c9a8ff', 0.25, 4);
          sfx('dash', { pan: W.pan(this.x), pitch: 1.7 });
          this.x = nx;
          this.y = p.body.onGround ? p.y : this.y;
          b.vx = b.vy = 0;
          this.face = sign(p.x - this.x) || -side;
          this.target = KP.rake1;
          this.rate = 30;
          this.hitSet.clear();
        } else if (t < 0.24) {
          this.target = KP.rake1;
        } else if (t < 0.36) {
          this.target = KP.rake2;
          this.rate = 34;
          if (t - dt < 0.24) {
            this.rakeFx(-2.6, 0.8);
            sfx('swingHeavy', { pan: W.pan(this.x), pitch: 1.2 });
          }
          this.hit(-2, -60, 50, 60, 1.1, { poise: 36 });
        } else if (t > 0.8) this.endAttack(0.9);
        this.physics(dt);
        break;
      }
    }
  }

  private addGhost() {
    this.ghostT = 0.04;
    this.ghosts.push({ x: this.x, y: this.y, face: this.face, j: { ...this.j }, life: 0.3 });
    if (this.ghosts.length > 8) this.ghosts.shift();
  }

  // ------------------------------------------------------------ phases
  beginTransition() {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.flying = false;
    this.phase = 2;
    this.maxPoise = this.poise = 360;
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
    this.flying = false;
    this.physics(dt);
    if (t < 1.0) {
      this.target = { ...KP.curl };
      this.rate = 6;
    } else if (this.introT === 0) {
      this.introT = 1;
      this.target = { ...KP.screech };
      this.rate = 12;
      this.wingSpread = 1;
      sfx('screech', { pitch: 0.8 });
      fx.ring(this.x, this.y - 40, 10, 300, '#ff3a4a', 0.8, 6);
      fx.flash('#c9a8ff', 0.3);
      G.camera.addTrauma(0.7 * shakeScale());
      music.phase = 1;
      G.ui.caption('His wings unfold to their full span. The swarm in the walls answers him.');
    } else if (t > 3.0) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.4;
      this.wingSpread = 0.3;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      G.ui.caption(null);
    }
  }

  enterPhase3() {
    this.phase = 3;
    music.phase = 2;
    sfx('screech', { pitch: 0.7 });
    fx.flash('#ff3a4a', 0.25);
    G.ui.toast('The Locust King hungers. He heals as he fights, and feeds on his swarm.', 'warn');
  }

  die() {
    super.die();
    this.atk = null;
    this.flying = false;
    this.hidden = false;
    this.ghosts.length = 0;
  }

  yieldNow() {
    this.state = 'dead';
    this.dying = true;
    this.yielded = true;
    this.introT = 9;
    this.st = 4;
    this.invuln = 999;
    this.pose = { ...KP.kneel };
    this.target = { ...KP.kneel };
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 34 };
    this.flying = false;
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    this.wingSpread = approach(this.wingSpread, 0, dt);
    if (t < 1.2) {
      this.target = { ...KP.screech };
      this.rate = 4;
      if (Math.random() < dt * 10) fx.hitSparks(this.x + rand(-14, 14), this.y - rand(10, 60), rand(-1, 1), '#c9a8ff', 4, 1);
    } else if (this.introT !== 9) {
      this.introT = 9;
      this.target = { ...KP.kneel };
      this.rate = 5;
      sfx('chitter', { pitch: 0.5 });
      fx.dust(this.x, this.y, 14, 1.4);
      G.camera.addTrauma(0.3);
    } else if (t > 3.2 && !this.yielded) {
      this.yielded = true;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    const k = Math.min(1, dt * this.rate);
    for (const key of Object.keys(this.target) as (keyof Pose)[]) this.pose[key] = lerp(this.pose[key], this.target[key], k);
    solve(this.pose, LOCUST_DIMS, !this.flying, this.j);
    this.beat += dt * (this.flying || this.wingSpread > 0.8 ? 48 : 4);
    this.bite = approach(this.bite, 0, dt * 4);
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.phase >= 3 && this.state === 'attack') {
      this.ghostT -= dt;
      if (this.ghostT <= 0) this.addGhost();
    }
    if (this.flying && Math.random() < dt * 20) fx.spawn(PK.Dust, this.x + rand(-10, 10), this.y + 2, 0, 40, 0.4, 3, 8, '#8a8070', 0, 2);
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    // Unseen inside the cocoon until it splits.
    if (this.state === 'dormant') return;
    const f = this.face;
    const S = KING_SCALE;
    const style = this.phase >= 3 ? this.rageStyle : this.style;
    // Dive target.
    if (this.atk === 'dive' && this.step === 1) this.floorMark(ctx, this.diveTo.x, this.diveTo.y, 54, this.st / 0.38, '#c9a8ff');
    // Afterimages.
    for (const gh of this.ghosts) {
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.scale(gh.face * S, S);
      ctx.globalAlpha = clamp(gh.life / 0.3, 0, 1) * 0.3;
      ctx.globalCompositeOperation = 'lighter';
      drawHumanoid(ctx, gh.j, flashStyle(style), G.time, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.hidden) return;
    // Aura.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 32, 50, this.phase >= 3 ? '#ff2a3a' : '#7a3ab0', 0.2 + Math.sin(G.time * 5) * 0.05);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f * S, S);
    drawLocustWings(ctx, this.j, 'king', this.wingSpread, this.beat);
    const j = this.j, tm = G.time, rage = this.phase >= 3;
    // The swollen abdomen of a hive-king, trailing behind in banded segments.
    {
      const ax = j.hipX - 3, ay = j.hipY + 1;
      const sw = Math.sin(tm * 2.4) * 1.5;
      for (let k = 4; k >= 0; k--) {
        const cx = ax - 4 - k * 4.2, cy = ay + 2 + k * 2.4 + sw * k * 0.3, rr = 5.6 - k * 0.6;
        ellipse(ctx, cx, cy, rr + 0.8, rr * 0.8 + 0.8, -0.5, '#0a0610');
        ellipse(ctx, cx, cy, rr, rr * 0.8, -0.5, k & 1 ? '#3a2850' : '#4e3668');
        ellipse(ctx, cx + 1, cy - 1.6, rr * 0.5, rr * 0.25, -0.5, '#7a5aa0');
      }
      // A stinger, and the Veil glowing inside the gut.
      poly(ctx, [ax - 24, ay + 12 + sw, ax - 30, ay + 17 + sw, ax - 23, ay + 15 + sw], '#d8c8e8', '#0a0610', 0.5);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, ax - 10, ay + 6, 9, rage ? '#ff3a4a' : '#b04cff', 0.45 + Math.sin(tm * 4) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawHumanoid(ctx, this.j, style, G.time, this.pose.rot, (this.body.vx * f) / S, this.body.vy / S);
    // Overlapping chitin plates over the chest, each with a sheen, and a pair of glowing sacs.
    {
      const a = j.torsoA, ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
      const len = Math.hypot(j.neckX - j.hipX, j.neckY - j.hipY);
      const Q = (u: number, r: number) => [j.hipX + ux * u + rx * r, j.hipY + uy * u + ry * r];
      for (let k = 0; k < 4; k++) {
        const u = len * (0.82 - k * 0.17);
        poly(ctx, [...Q(u, -3.8), ...Q(u, 4.4), ...Q(u - len * 0.15, 4.0), ...Q(u - len * 0.15, -3.4)], k & 1 ? '#2a1e3a' : '#3a2a52', '#0a0610', 0.5);
        const [hx0, hy0] = Q(u - 0.7, -3.2), [hx1, hy1] = Q(u - 0.7, 3.8);
        ctx.strokeStyle = '#8a6ab0';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
      }
      for (const r of [-1.8, 2.4]) {
        const [sx, sy] = Q(len * 0.55, r);
        circle(ctx, sx, sy, 1.1, rage ? '#ff6a5a' : '#d68cff');
      }
    }
    drawLocustScythes(ctx, this.j, 'king', 15);
    drawLocustHead(ctx, this.j, 'king', G.time, this.bite);
    // A crown of chitin thorns, swept back, tipped with Veil-light.
    {
      ctx.save();
      ctx.translate(j.headX, j.headY);
      ctx.rotate(j.headA);
      const spikes = [[-4, -4, -7, -12], [-1.5, -5, -2.5, -14], [1.2, -5, 1.5, -13], [3.5, -4.2, 5, -10]];
      for (const [x0, y0, x1, y1] of spikes) {
        poly(ctx, [x0 - 1.2, y0, x1, y1, x0 + 1.2, y0], '#2a1e3a', '#0a0610', 0.5);
        circle(ctx, x1, y1, 0.7, rage ? '#ff6a5a' : '#e0b0ff');
      }
      ctx.restore();
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, this.j, flashStyle(style), G.time, this.pose.rot);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Tells.
    if (this.state === 'attack') {
      const hd = this.hand();
      if ((this.atk === 'claws' && this.step === 0 && this.st < 0.4) || (this.atk === 'blur' && this.st < 0.24)) this.glint(ctx, hd.x, hd.y - 6, '#c9a8ff');
      if (this.atk === 'screech' && this.step === 0) this.glint(ctx, this.x + f * 8, this.y - 60, '#ff3a4a', 1.3);
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
      const y = this.y - 72;
      glow(ctx, this.x, y, 14, '#ffe6a8', 0.7 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.x, y - 7); ctx.lineTo(this.x + 5, y); ctx.lineTo(this.x, y + 7); ctx.lineTo(this.x - 5, y); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.state === 'dead' && this.yielded) {
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.6 + Math.sin(G.time * 3) * 0.2;
      glow(ctx, this.x, this.y - 30, 56, '#8a4aff', 0.28 * p);
      glow(ctx, this.x, this.y - 34, 26, '#ffe6a8', 0.3 * p);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.hidden || this.state === 'dormant') return;
    lighting.add(this.x, this.y - 32, 100, this.phase >= 3 ? '#ff2a3a' : '#9a5aff', 0.55, 0.4);
  }
}

export { easeOutCubic };
