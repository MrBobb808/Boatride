// THE GILDED IDOL — a colossal golden construct, the false god of a fallen
// kingdom. Three phases, readable telegraphs, a poise/stagger system with a
// kneeling execution window, a cinematic awakening and a shattering death.

import { bossScale } from './difficulty';
import { Entity, type HitInfo } from './entity';
import { solve, newJoints, BASE_POSE, type Joints, type Pose, type RigDims } from '../render/skeleton';
import { glow, rgba, poly, circle, ellipse, limbShaded, limbStroke, rGrad, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G, flag } from './ctx';
import { approach, clamp, rand, sign, lerp, easeOutCubic, easeInQuad, choose } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';

const DIMS: RigDims = { torso: 66, head: 15, neck: 6, upperArm: 44, foreArm: 42, thigh: 36, shin: 34, shoulderSpread: 32, hipSpread: 14 };
const REST: Pose = { ...BASE_POSE, lean: 0.06, head: 0.05, bUA: 0.25, bFA: 0.35, fUA: 0.3, fFA: 0.35, bTh: -0.18, bSh: -0.12, fTh: 0.2, fSh: -0.2 };
const KNEEL: Pose = { ...REST, lean: 0.5, head: 0.45, fTh: 1.35, fSh: -2.3, bTh: -0.1, bSh: -1.85, fUA: 0.75, fFA: 0.95, bUA: 0.55, bFA: 1.05 };

type Atk = 'sweep' | 'sweepHigh' | 'slam' | 'pillars' | 'step' | 'rain' | 'gaze' | 'double';

export class Idol extends Entity {
  j: Joints = newJoints();
  pose: Pose = { ...KNEEL };
  target: Pose = { ...KNEEL };
  phase = 0; // 0 dormant, 1, 2, 3
  state = 'dormant';
  st = 0;
  poise = 260;
  maxPoise = 260;
  atk: Atk | null = null;
  cd = 2;
  hitSet = new Set<number>();
  markers: { x: number; t: number; kind: 'debris' | 'drop' | 'slam' }[] = [];
  beamX = 0;
  beamOn = 0;
  armorBroken = 0;
  eyes = 0;
  defeatT = 0;
  introT = 0;
  hpShown = 1;
  sweepFrom = 0;
  lastAtk: Atk | null = null;
  combo: Atk[] = [];
  tobiahDone = false;
  staggerFlash = 0;
  name = 'The Gilded Idol';
  phaseMarks = [0.55, 0.22];
  pending: (() => void) | null = null;

  constructor(x: number, y: number) {
    super(x, y, 64, 170);
    this.team = 'enemy';
    this.isFoe = true;
    this.isBoss = true;
    this.heavyBody = true;
    this.collide = true;
    const ng = 1 + (G.save?.ng ?? 0) * 0.6;
    this.maxHp = this.hp = Math.round(2100 * ng * bossScale().hp);
    this.face = 1;
    this.layer = 4;
    this.invuln = 999;
  }

  executable() {
    return this.staggered > 0 && !this.dying && this.state === 'kneel';
  }
  canBeTargeted() {
    return !this.dying && this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'transition' && this.state !== 'dead';
  }

  hurtbox() {
    const kneel = this.state === 'kneel' ? 60 : 0;
    return { x: this.x - 34, y: this.y - 170 + kneel, w: 68, h: 170 - kneel };
  }

  get cy() {
    return this.y - (this.state === 'kneel' ? 60 : 90);
  }

  get dmg() {
    return 22 * (1 + (G.save?.ng ?? 0) * 0.6) * (this.phase >= 3 ? 1.15 : 1) * bossScale().dmg;
  }

  // ---------------------------------------------------------------- lifecycle
  awaken() {
    this.state = 'intro';
    this.st = 0;
    this.introT = 0;
  }

  update(dt: number) {
    if (this.state === 'idle' || this.state === 'attack') dt *= bossScale().tempo;
    this.st += dt;
    this.staggerFlash = Math.max(0, this.staggerFlash - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.hpShown = lerp(this.hpShown, this.hp / this.maxHp, Math.min(1, dt * 4));
    const p = G.world.player;
    if (this.state === 'dormant') {
      this.target = { ...KNEEL };
      this.eyes = 0;
    } else if (this.state === 'intro') {
      this.updateIntro(dt);
    } else if (this.state === 'dead') {
      this.updateDeath(dt);
    } else if (this.state === 'transition') {
      this.updateTransition(dt);
    } else if (this.state === 'kneel') {
      this.target = { ...KNEEL, head: 0.5 + Math.sin(G.time * 3) * 0.05 };
      this.staggered -= dt;
      if (Math.random() < dt * 20) fx.spawn(PK.Ember, this.x + rand(-30, 30), this.y - rand(40, 120), 0, -40, 1, 1.5, 0.2, '#ffcf6b');
      if (this.staggered <= 0) {
        this.state = 'idle';
        this.st = 0;
        this.poise = this.maxPoise;
        this.cd = 1.0;
        sfx('bossRoar', { vol: 0.6 });
      }
    } else {
      this.think(dt, p.x);
    }
    // ease pose toward target (heavy, deliberate motion)
    const rate = this.state === 'attack' ? this.atkRate : 4;
    const k = Math.min(1, dt * rate);
    for (const key of Object.keys(this.target) as (keyof Pose)[]) this.pose[key] = lerp(this.pose[key], this.target[key], k);
    solve(this.pose, DIMS, true, this.j);
    this.updateMarkers(dt);
    if (this.beamOn > 0) this.updateBeam(dt);
    if (this.pending && this.st > 0) {
      const f = this.pending;
      this.pending = null;
      f();
    }
  }
  atkRate = 8;

  private updateIntro(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x + 40, y: this.y - 110 };
    if (t < 1.4) {
      this.target = { ...KNEEL };
    } else if (t < 1.5 && this.introT === 0) {
      this.introT = 1;
      sfx('bell', { pitch: 0.5 });
      fx.flash('#ffcf6b', 0.2);
    } else if (t > 1.6 && t < 3.2) {
      this.eyes = Math.min(1, (t - 1.6) / 0.8);
      if (this.introT === 1) {
        this.introT = 2;
        sfx('beamCharge', { vol: 0.6 });
      }
    } else if (t >= 3.2 && this.introT === 2) {
      this.introT = 3;
      this.target = { ...REST, head: -0.35, lean: -0.15, fUA: 2.4, fFA: 0.5, bUA: 2.2, bFA: 0.5 };
      sfx('bossRoar');
      G.camera.addTrauma(0.7 * shakeScale());
      fx.ring(this.x, this.y - 120, 20, 260, '#ffcf6b', 0.9, 6);
      fx.dust(this.x, this.y, 30, 3);
      for (let i = 0; i < 20; i++) fx.spawn(PK.Shard, this.x + rand(-40, 40), this.y - rand(10, 150), rand(-200, 200), rand(-300, -50), 1.4, 4, 2, '#d6a640', 900, 0.4);
      G.ui.banner('THE GILDED IDOL', 'Effigy of a Kingdom\'s Pride', 'boss');
      music.phase = 0;
      music.play('boss', 0.4);
    } else if (t >= 4.6 && this.introT === 3) {
      this.introT = 4;
      this.target = { ...REST };
    } else if (t >= 5.6) {
      this.state = 'idle';
      this.st = 0;
      this.phase = 1;
      this.invuln = 0;
      this.cd = 1.2;
      G.camera.focus = null;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.ui.bossBar(this.name, 'Effigy of a Kingdom\'s Pride');
    }
  }

  // ---------------------------------------------------------------- AI
  private think(dt: number, px: number) {
    if (this.state === 'idle') {
      this.target = { ...REST, lean: 0.06 + Math.sin(G.time * 1.2) * 0.03, head: Math.sin(G.time * 0.7) * 0.05 };
      this.face = px > this.x ? 1 : -1;
      // drift toward the player slowly
      const dx = px - this.x;
      if (Math.abs(dx) > 150) this.x += sign(dx) * Math.min(Math.abs(dx) - 150, 22 * dt);
      this.cd -= dt * (this.phase >= 3 ? 1.35 : this.phase === 2 ? 1.15 : 1);
      if (this.cd <= 0) this.choose(px);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, px);
  }

  private choose(px: number) {
    const dist = Math.abs(px - this.x);
    let pool: Atk[];
    if (this.combo.length) {
      this.start(this.combo.shift()!);
      return;
    }
    if (this.phase === 1) pool = dist < 200 ? ['sweep', 'sweep', 'slam', 'pillars'] : ['slam', 'pillars', 'step', 'step'];
    else pool = dist < 200 ? ['sweep', 'sweepHigh', 'double', 'slam', 'gaze', 'rain'] : ['slam', 'gaze', 'rain', 'pillars', 'step'];
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    if (this.phase >= 3 && Math.random() < 0.45) this.combo = [choose(['pillars', 'rain', 'sweep'] as Atk[])];
    this.start(a);
  }

  private start(a: Atk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.hitSet.clear();
    this.atkRate = 6;
    if (a === 'double') {
      this.atk = 'sweep';
      this.combo.unshift('sweepHigh');
    }
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.cd = cd * (this.phase >= 3 ? 0.7 : this.phase === 2 ? 0.85 : 1);
  }

  private runAttack(dt: number, px: number) {
    const t = this.st;
    const f = this.face;
    const W = G.world;
    const fast = this.phase >= 2 ? 0.85 : 1;
    switch (this.atk) {
      case 'sweep': case 'sweepHigh': {
        const high = this.atk === 'sweepHigh';
        const tel = 0.95 * fast;
        if (t < tel) {
          // Wind up: front arm drawn back, body twisted.
          this.atkRate = 5;
          this.target = high
            ? { ...REST, lean: -0.15, fUA: -1.6, fFA: 0.3, bUA: 0.8, head: -0.1 }
            : { ...REST, lean: 0.35, fUA: -1.2, fFA: 0.2, bUA: 0.5, fTh: 0.6, fSh: -0.9, bTh: -0.5, bSh: -0.6 };
          if (t < dt * 1.5) sfx('bossSweep', { pan: W.pan(this.x), vol: 0.5, pitch: 0.7 });
        } else if (t < tel + 0.32) {
          this.atkRate = 16;
          this.target = high
            ? { ...REST, lean: 0.1, fUA: 1.9, fFA: 0.1, bUA: 0.6 }
            : { ...REST, lean: 0.55, fUA: 1.35, fFA: 0.05, bUA: 0.4, fTh: 0.7, fSh: -1.0, bTh: -0.6, bSh: -0.7 };
          if (t - dt < tel) {
            sfx('bossSweep', { pan: W.pan(this.x) });
            G.camera.addTrauma(0.25 * shakeScale());
          }
          const u = (t - tel) / 0.32;
          const reach = 230;
          const x0 = this.x + f * (20 + reach * Math.max(0, u - 0.25));
          const x1 = this.x + f * (60 + reach * u);
          const box = high ? { x: Math.min(x0, x1) - 10, y: this.y - 108, w: Math.abs(x1 - x0) + 30, h: 46 } : { x: Math.min(x0, x1) - 10, y: this.y - 40, w: Math.abs(x1 - x0) + 30, h: 40 };
          W.hitPlayerSide(box, { dmg: this.dmg, poise: 60, kx: f * 320, ky: -220, dir: f, kind: 'melee', src: this, parryable: true }, this.hitSet);
          if (Math.random() < 0.6) fx.spawn(PK.Spark, x1, box.y + box.h / 2, f * 200, rand(-60, 20), 0.3, 2, 0.3, '#ffe6a8', 200, 2);
          if (!high && Math.random() < 0.5) fx.dust(x1, this.y, 2, 1);
        } else if (t < tel + 0.32 + 0.55) {
          this.atkRate = 4;
          this.target = { ...REST, lean: 0.25, fUA: 1.6, fFA: 0.3 };
        } else this.endAttack(1.3);
        break;
      }
      case 'slam': {
        const tel = 1.05 * fast;
        if (t < 0.05) {
          this.markers.push({ x: clamp(px, 40, W.grid.w * 16 - 40), t: tel + 0.12, kind: 'slam' });
          sfx('bossRoar', { vol: 0.35, pitch: 1.3 });
        }
        if (t < tel) {
          this.atkRate = 4;
          this.target = { ...REST, lean: -0.25, head: -0.25, fUA: 3.1, fFA: 0.3, bUA: 3.0, bFA: 0.3, sq: 1.03 };
          // drift toward the marked spot
          const m = this.markers.find((mm) => mm.kind === 'slam');
          if (m) this.x += clamp(m.x - f * 120 - this.x, -60 * dt, 60 * dt);
        } else if (t < tel + 0.14) {
          this.atkRate = 22;
          this.target = { ...REST, lean: 0.75, head: 0.2, fUA: 1.2, fFA: 0.1, bUA: 1.1, bFA: 0.1, fTh: 0.9, fSh: -1.4, bTh: -0.6, bSh: -0.9, sq: 0.95 };
        } else if (t < tel + 0.9) {
          this.atkRate = 3;
        } else this.endAttack(1.4);
        break;
      }
      case 'pillars': {
        if (t < 0.05) {
          sfx('bossRoar', { vol: 0.8 });
          G.camera.addTrauma(0.35 * shakeScale());
          sfx('rumble');
          const n = this.phase >= 2 ? 5 : 4;
          const w = W.grid.w * 16;
          const xs: number[] = [clamp(px + rand(-10, 10), 40, w - 40)];
          for (let i = 1; i < n; i++) xs.push(clamp(rand(60, w - 80), 40, w - 40));
          xs.forEach((x, i) => this.markers.push({ x, t: 1.1 + i * 0.18, kind: 'debris' }));
        }
        this.target = t < 1 ? { ...REST, lean: -0.3, head: -0.45, fUA: 2.6, fFA: 0.6, bUA: 2.6, bFA: 0.6 } : { ...REST };
        if (t > 1.9) this.endAttack(1.2);
        break;
      }
      case 'step': {
        const dir = sign(px - this.x) || 1;
        this.face = dir;
        const stepT = 0.7;
        const k = Math.floor(t / stepT);
        const u = (t % stepT) / stepT;
        this.target = k % 2 === 0 ? { ...REST, fTh: 0.6, fSh: -0.6, bTh: -0.3, lean: 0.12 } : { ...REST, fTh: -0.2, fSh: -0.3, bTh: 0.4, bSh: -0.5, lean: 0.12 };
        if (Math.abs(px - this.x) > 110) this.x += dir * 70 * dt;
        if (u < dt / stepT * 1.5 && k > 0) {
          sfx('bossStomp', { pan: W.pan(this.x) });
          G.camera.addTrauma(0.22 * shakeScale());
          fx.dust(this.x + dir * 20, this.y, 10, 1.5);
          W.hitPlayerSide({ x: this.x - 50, y: this.y - 20, w: 100, h: 20 }, { dmg: this.dmg * 0.5, poise: 30, kx: dir * 200, ky: -200, dir, kind: 'melee', parryable: false, src: this }, new Set());
        }
        if (t > stepT * 3) this.endAttack(0.4);
        break;
      }
      case 'rain': {
        if (t < 0.05) {
          sfx('bossRoar', { vol: 0.5, pitch: 0.8 });
          const w = W.grid.w * 16;
          const dirL = Math.random() < 0.5;
          const n = 9;
          for (let i = 0; i < n; i++) {
            const x = dirL ? 50 + (i / (n - 1)) * (w - 140) : w - 90 - (i / (n - 1)) * (w - 140);
            this.markers.push({ x, t: 0.9 + i * 0.16, kind: 'drop' });
          }
        }
        this.target = { ...REST, lean: -0.35, head: -0.6, fUA: 2.9, fFA: 0.1, bUA: 2.9, bFA: 0.1 };
        if (t > 0.6 && Math.random() < 0.4) fx.spawn(PK.Ember, this.x + rand(-20, 20), this.y - 140, rand(-80, 80), rand(-200, -100), 0.8, 2, 0.5, '#ffb347', 300, 0.2);
        if (t > 2.6) this.endAttack(1.0);
        break;
      }
      case 'gaze': {
        const tel = 1.0;
        if (t < 0.05) sfx('beamCharge', { pan: W.pan(this.x) });
        if (t < tel) {
          this.target = { ...REST, lean: 0.3, head: 0.5, fUA: 0.6, bUA: 0.5 };
          this.eyes = 1 + t;
        } else if (t < tel + 1.2) {
          if (this.beamOn <= 0) {
            this.beamOn = 1.2;
            this.beamX = this.x + this.face * 50;
            this.sweepFrom = this.face;
            sfx('beam', { pan: W.pan(this.x) });
          }
          this.target = { ...REST, lean: 0.35, head: 0.2 + (t - tel) * 0.3 };
        } else {
          this.eyes = 1;
          this.endAttack(1.2);
        }
        break;
      }
    }
  }

  private updateBeam(dt: number) {
    const W = G.world;
    this.beamOn -= dt;
    this.beamX += this.sweepFrom * 300 * dt;
    const box = { x: this.beamX - 10, y: this.y - 38, w: 20, h: 38 };
    W.hitPlayerSide(box, { dmg: this.dmg * 0.8, poise: 40, kx: this.sweepFrom * 200, ky: -260, dir: this.sweepFrom, kind: 'proj', parryable: false, unblockable: true, src: this }, this.hitSet);
    if (Math.random() < 0.8) {
      fx.spawn(PK.Spark, this.beamX, this.y - 2, rand(-80, 80), rand(-200, -80), 0.35, 2, 0.3, '#ffb347', 500, 1);
      fx.spawn(PK.Smoke, this.beamX, this.y - 4, rand(-10, 10), -40, 0.7, 4, 10, '#3a2010', -10, 1);
    }
    if (this.beamOn <= 0 || W.solidAt(this.beamX, this.y - 10)) this.beamOn = 0;
  }

  private updateMarkers(dt: number) {
    const W = G.world;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t -= dt;
      if (m.kind === 'debris' && Math.random() < dt * 25) fx.spawn(PK.Dust, m.x + rand(-10, 10), 34 + rand(0, 10), 0, rand(40, 120), 0.6, 1.5, 3, '#8a7a6a', 200, 0);
      if (m.t <= 0) {
        this.markers.splice(i, 1);
        if (m.kind === 'debris') {
          W.add(new Proj('debris', m.x, 40, 'enemy', this.dmg * 0.9, { vy: 80, life: 4, w: 22, h: 22 }));
        } else if (m.kind === 'drop') {
          W.add(new Proj('drop', m.x, 40, 'enemy', this.dmg * 0.75, { vy: 200, life: 3, w: 8, h: 8 }));
        } else if (m.kind === 'slam') {
          const x = m.x;
          sfx('bossSlam', { pan: W.pan(x) });
          G.camera.addTrauma(0.7 * shakeScale());
          G.camera.punch = 0.04;
          fx.dust(x, this.y, 24, 2.5);
          fx.ring(x, this.y - 2, 10, 110, '#ffcf6b', 0.5, 5, 0.25);
          fx.shards(x, this.y - 6, 14, '#a08050', 1.3);
          W.hitPlayerSide({ x: x - 44, y: this.y - 50, w: 88, h: 50 }, { dmg: this.dmg * 1.25, poise: 80, kx: sign(W.player.x - x) * 300, ky: -320, dir: sign(W.player.x - x), kind: 'melee', src: this, parryable: false, unblockable: true }, new Set());
          const col = this.phase >= 2 ? '#ff9a3a' : '#ffcf6b';
          W.add(new Proj('wave', x + 30, this.y, 'enemy', this.dmg * 0.7, { vx: 240, life: 2.2, w: 14, h: 26, color: col, big: true }));
          W.add(new Proj('wave', x - 30, this.y, 'enemy', this.dmg * 0.7, { vx: -240, life: 2.2, w: 14, h: 26, color: col, big: true }));
          if (this.phase >= 3) {
            for (let k = 1; k <= 3; k++) {
              this.markers.push({ x: x + k * 70, t: 0.3 + k * 0.15, kind: 'drop' });
              this.markers.push({ x: x - k * 70, t: 0.3 + k * 0.15, kind: 'drop' });
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- damage & phases
  takeHit(h: HitInfo): boolean {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dead' || this.state === 'transition' || this.invuln > 0) return false;
    if (h.dot) {
      const d = Math.max(1, Math.round(h.dmg));
      this.hp -= d;
      fx.number(this.x + rand(-20, 20), this.y - 100, d, false, '#ffb36a');
      if (this.hp <= 0) {
        this.hp = 0;
        this.die();
      }
      return true;
    }
    let dmg = h.dmg;
    if (this.state === 'kneel') dmg *= 1.5;
    if (this.armorBroken > 0 && h.py !== undefined && h.py < this.y - 90) dmg *= 1.3;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flash = 0.08;
    fx.number(h.px ?? this.x - sign(h.dir || 1) * 30, (h.py ?? this.y - 60) - 10, dmg, h.crit);
    fx.hitSparks(this.x - sign(h.dir || 1) * 28, this.y - rand(20, 80), h.dir || 1, '#ffe6a8', 10, 1.1);
    if (Math.random() < 0.5) fx.shards(this.x - sign(h.dir || 1) * 28, this.y - rand(20, 80), 2, '#d6a640', 0.6);
    sfx('hitMetal', { pan: G.world.pan(this.x), pitch: rand(0.8, 1.0), vol: 0.8 });
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
    if (this.phase === 1 && this.hp < this.maxHp * 0.55) this.beginTransition();
    else if (this.phase === 2 && this.hp < this.maxHp * 0.22) {
      this.phase = 3;
      music.phase = 2;
      sfx('bossRoar');
      fx.flash('#ff9a3a', 0.25);
      G.ui.toast('The Idol burns with desperate fury.', 'warn');
    }
    return true;
  }

  parried() {
    if (this.atk === 'sweep' || this.atk === 'sweepHigh') {
      this.poise -= 140;
      sfx('stagger');
      fx.ring(this.x + this.face * 60, this.y - 30, 6, 60, '#fff1c4', 0.3, 3);
      if (this.poise <= 0) this.kneel();
      else {
        this.state = 'idle';
        this.st = 0;
        this.cd = 1.6;
        this.atk = null;
        this.target = { ...REST, lean: -0.3, head: -0.3 };
      }
    }
  }

  kneel() {
    this.state = 'kneel';
    this.st = 0;
    this.atk = null;
    this.beamOn = 0;
    this.combo.length = 0;
    this.staggered = 4.2;
    this.atkRate = 6;
    sfx('stagger', { pitch: 0.6 });
    sfx('bossStomp');
    G.camera.addTrauma(0.5 * shakeScale());
    fx.dust(this.x, this.y, 24, 2.4);
    G.ui.toast('The Idol kneels — strike its head to execute!', 'good');
    G.world.addRally(15);
  }

  private beginTransition() {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.beamOn = 0;
    this.markers = this.markers.filter((m) => m.kind !== 'slam');
    this.phase = 2;
    this.maxPoise = 320;
    this.poise = 320;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.6, 0.4);
  }

  private updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 110 };
    if (t < 1.2) {
      this.target = { ...KNEEL, lean: 0.3, head: 0.6 };
      if (Math.random() < dt * 30) fx.hitSparks(this.x + rand(-30, 30), this.y - rand(50, 150), 1, '#ffcf6b', 2);
      G.camera.addTrauma(dt * 0.8);
    } else if (this.armorBroken === 0) {
      this.armorBroken = 1;
      sfx('shatter');
      sfx('bossRoar');
      fx.flash('#ffe6a8', 0.6);
      G.camera.addTrauma(0.9 * shakeScale());
      fx.shards(this.x, this.y - 110, 40, '#d6a640', 2.2);
      fx.shards(this.x, this.y - 70, 20, '#b08a40', 1.8);
      fx.ring(this.x, this.y - 110, 10, 300, '#ff9a3a', 0.8, 6);
      fx.embers(this.x, this.y - 100, 40, '#ffb347', 50);
      this.target = { ...REST, lean: -0.3, head: -0.5, fUA: 2.6, fFA: 0.4, bUA: 2.6, bFA: 0.4 };
      music.phase = 1;
      G.ui.caption('Its gilding falls away. What burns beneath was never gold.');
    } else if (t > 3.4) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.8;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      G.ui.caption(null);
      // Tobiah keeps his promise.
      if (flag('tobiah_saved') && !this.tobiahDone) {
        this.tobiahDone = true;
        this.pending = () => G.world.tobiahAssist(this);
      }
    }
  }

  die() {
    this.state = 'dead';
    this.st = 0;
    this.dying = true;
    this.beamOn = 0;
    this.markers.length = 0;
    this.defeatT = 0;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.ui.bossBar(null);
    G.world.slowmo(1.5, 0.25);
    music.stop(0.4);
    sfx('shatter');
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  private updateDeath(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 100 };
    this.defeatT = t;
    if (t < 2.2) {
      this.target = { ...REST, lean: -0.4, head: -0.6, fUA: 2.2, bUA: 2.4 };
      G.camera.addTrauma(dt * 1.2 * shakeScale());
      if (Math.random() < dt * 14) {
        sfx('hitMetal', { pitch: rand(1, 1.6), vol: 0.6 });
        fx.hitSparks(this.x + rand(-40, 40), this.y - rand(30, 170), rand(-1, 1), '#fff6dc', 6, 1.2);
      }
    } else if (t < 3.6) {
      this.target = { ...KNEEL, lean: 0.8, head: 0.9 };
    } else if (t < 3.7 && this.introT !== 9) {
      this.introT = 9;
      sfx('shatter');
      sfx('bossSlam');
      fx.flash('#ffffff', 0.8);
      fx.shards(this.x, this.y - 100, 60, '#d6a640', 2.6);
      fx.holyBurst(this.x, this.y - 100, 40, 2.5);
      fx.column(this.x, this.y, 120, 400, '#fff3c4', 2.0);
      G.camera.addTrauma(1);
    } else if (t > 6) {
      this.remove = true;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ---------------------------------------------------------------- rendering
  draw(ctx: Ctx) {
    const j = this.j;
    const f = this.face;
    const t = G.time;
    const dissolve = this.state === 'dead' && this.defeatT > 3.6 ? clamp((this.defeatT - 3.6) / 1.4, 0, 1) : 0;
    if (dissolve >= 1) return;
    // floor markers & telegraphs (drawn under the idol)
    for (const m of this.markers) {
      const a = 0.5 + Math.sin(t * 18) * 0.3;
      ctx.globalCompositeOperation = 'lighter';
      const c = m.kind === 'slam' ? '#ff4a3a' : m.kind === 'drop' ? '#ff9a3a' : '#ffcf6b';
      ellipse(ctx, m.x, this.y - 1, m.kind === 'slam' ? 44 : 16, 3.5, 0, rgba(c, a * 0.6));
      glow(ctx, m.x, this.y - 2, m.kind === 'slam' ? 50 : 24, c, a * 0.5);
      if (m.kind === 'slam') {
        ctx.strokeStyle = rgba(c, a);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(m.x, this.y - 1, 44 * (1 - Math.min(1, m.t)), 3.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // sweep warning line
    if (this.state === 'attack' && (this.atk === 'sweep' || this.atk === 'sweepHigh') && this.st < 0.95) {
      const y = this.atk === 'sweepHigh' ? this.y - 86 : this.y - 14;
      ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, this.st * 2) * (0.4 + Math.sin(t * 20) * 0.2);
      const g = ctx.createLinearGradient(this.x, 0, this.x + f * 290, 0);
      g.addColorStop(0, rgba('#ff6a3a', a));
      g.addColorStop(1, rgba('#ff6a3a', 0));
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(this.x, this.x + f * 290), y - 3, 290, 6);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f, 1);
    if (dissolve > 0) ctx.globalAlpha = 1 - dissolve;
    const gold = '#c9a04a', goldHi = '#f2d48a', goldDk = '#6a4a1a', o = '#120a04';
    const broken = this.armorBroken > 0;
    // Polished gold: a hot specular band near the lit edge, deep shadow, then bounce light.
    const goldGrad = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#b08a3e');
      g.addColorStop(0.15, '#ffe39a');
      g.addColorStop(0.25, goldHi);
      g.addColorStop(0.5, gold);
      g.addColorStop(0.84, goldDk);
      g.addColorStop(1, '#86642a');
      return g;
    };
    // false halo — a spiked sun-disc behind the head
    {
      const hx = j.headX, hy = j.headY;
      ctx.save();
      ctx.translate(hx - 4, hy + 2);
      ctx.rotate(t * 0.15);
      const R = 34;
      for (let i = 0; i < 16; i++) {
        if (broken && (i % 5 === 1 || i % 7 === 3)) continue;
        const a = (i / 16) * Math.PI * 2;
        const r2 = i % 2 ? R * 1.25 : R * 1.45;
        poly(ctx, [Math.cos(a - 0.08) * R, Math.sin(a - 0.08) * R, Math.cos(a) * r2, Math.sin(a) * r2, Math.cos(a + 0.08) * R, Math.sin(a + 0.08) * R], i % 2 ? goldDk : gold, o, 1);
      }
      ctx.lineWidth = 5;
      ctx.strokeStyle = gold;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * (broken ? 1.6 : 2));
      ctx.stroke();
      ctx.restore();
    }
    // back arm
    this.drawArm(ctx, j.shBX, j.shBY, j.elBX, j.elBY, j.haBX, j.haBY, true, goldGrad, o);
    // legs
    this.drawLeg(ctx, j.hpBX, j.hpBY, j.knBX, j.knBY, j.ftBX, j.ftBY, true, goldGrad, o);
    this.drawLeg(ctx, j.hpFX, j.hpFY, j.knFX, j.knFY, j.ftFX, j.ftFY, false, goldGrad, o);
    // tassets (plate skirt)
    for (let i = -2; i <= 2; i++) {
      const x = j.hipX + i * 11;
      poly(ctx, [x - 6, j.hipY - 6, x + 6, j.hipY - 6, x + 5, j.hipY + 20 - Math.abs(i) * 3, x - 5, j.hipY + 22 - Math.abs(i) * 3], goldGrad(x - 6, j.hipY, x + 6, j.hipY + 20), o, 1.2);
    }
    // torso
    const a = j.torsoA;
    const ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
    const P = (u: number, r: number) => [j.hipX + ux * u + rx * r, j.hipY + uy * u + ry * r];
    const L = DIMS.torso;
    const torso = [...P(-4, -22), ...P(-4, 24), ...P(L * 0.55, 34), ...P(L * 0.95, 38), ...P(L * 1.02, 12), ...P(L * 1.02, -14), ...P(L * 0.95, -34), ...P(L * 0.5, -30)];
    const [tcx, tcy] = P(L * 0.55, 0);
    poly(ctx, torso, goldGrad(tcx - 30, tcy - 40, tcx + 30, tcy + 40), o, 1.6);
    // Engraved breastplate: centre ridge, pectoral curves, belly lames and rivets.
    {
      const line = (pts: number[][], c: string, w: number) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.stroke();
      };
      line([P(L * 0.98, 2), P(L * 0.42, 3)], rgba(goldDk, 0.8), 1.4);
      line([P(L * 0.98, 3.4), P(L * 0.42, 4.4)], rgba('#fff2c8', 0.5), 0.8);
      line([P(L * 0.86, -26), P(L * 0.64, -14), P(L * 0.6, 2)], rgba(goldDk, 0.7), 1.2);
      line([P(L * 0.86, 32), P(L * 0.62, 22), P(L * 0.6, 4)], rgba(goldDk, 0.7), 1.2);
      for (const u of [0.32, 0.18]) {
        line([P(L * u, -24), P(L * u, 27)], rgba(goldDk, 0.85), 1.4);
        line([P(L * u + 1.6, -23), P(L * u + 1.6, 26)], rgba('#fff2c8', 0.35), 0.8);
      }
      for (const [u, r] of [[0.92, -28], [0.92, 32], [0.5, -27], [0.5, 30], [0.08, -21], [0.08, 22]]) {
        const [rx0, ry0] = P(L * u, r);
        circle(ctx, rx0, ry0, 1.7, goldHi);
        circle(ctx, rx0 - 0.5, ry0 - 0.5, 0.7, '#fff6dc');
      }
    }
    // sun-disc emblem / molten core
    const [ex, ey] = P(L * 0.62, 4);
    if (!broken) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = goldHi;
      ctx.beginPath();
      ctx.arc(ex, ey, 13, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(an) * 15, ey + Math.sin(an) * 15);
        ctx.lineTo(ex + Math.cos(an) * 20, ey + Math.sin(an) * 20);
        ctx.stroke();
      }
      circle(ctx, ex, ey, 6, '#7a2ab0');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, ex, ey, 18, '#b04cff', 0.5 + Math.sin(t * 3) * 0.2);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // fractured plates reveal a molten heart veined with Veil
      poly(ctx, [ex - 20, ey - 26, ex + 4, ey - 30, ex + 22, ey - 10, ex + 18, ey + 18, ex - 6, ey + 26, ex - 22, ey + 8], '#2a0e04', o, 1.2);
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + Math.sin(t * 6) * 0.25;
      glow(ctx, ex, ey, 46, '#ff7a1a', 0.75 * pulse);
      glow(ctx, ex, ey, 22, '#ffe6a8', 0.9 * pulse);
      ctx.strokeStyle = rgba('#c45cff', 0.8);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const an = i * 1.3 + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(an) * 22, ey + Math.sin(an) * 22);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // jagged plate edges
      ctx.strokeStyle = goldHi;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex - 20, ey - 26); ctx.lineTo(ex - 12, ey - 18); ctx.lineTo(ex - 4, ey - 30);
      ctx.moveTo(ex + 22, ey - 10); ctx.lineTo(ex + 12, ey); ctx.lineTo(ex + 18, ey + 18);
      ctx.stroke();
    }
    // pauldrons + head + front arm
    this.drawHead(ctx, goldGrad, o, broken);
    this.drawArm(ctx, j.shFX, j.shFY, j.elFX, j.elFY, j.haFX, j.haFY, false, goldGrad, o);
    // death cracks of light
    if (this.state === 'dead') {
      ctx.globalCompositeOperation = 'lighter';
      const n = Math.min(14, Math.floor(this.defeatT * 6));
      ctx.strokeStyle = '#fff6dc';
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const an = i * 2.39;
        const r0 = 8, r1 = 40 + (i % 3) * 25;
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(an) * r0, ey + Math.sin(an) * r0);
        ctx.lineTo(ex + Math.cos(an) * r1, ey + Math.sin(an) * r1);
        ctx.stroke();
      }
      glow(ctx, ex, ey, 60 + this.defeatT * 20, '#fff6dc', Math.min(1, this.defeatT * 0.4));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 90, 110, '#ffffff', this.flash * 2.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    // gaze beam
    if (this.beamOn > 0) {
      const hx = this.x + f * (j.headX + 6), hy = this.y + j.headY;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff9a3a', 0.6);
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(this.beamX, this.y);
      ctx.stroke();
      ctx.strokeStyle = rgba('#fff3d0', 0.95);
      ctx.lineWidth = 5;
      ctx.stroke();
      glow(ctx, this.beamX, this.y - 6, 40, '#ff9a3a', 0.9);
      glow(ctx, hx, hy, 26, '#ffcf6b', 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.state === 'kneel') {
      const hx = this.x + f * j.headX, hy = this.y + j.headY;
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(t * 10) * 0.3;
      glow(ctx, hx, hy - 30, 18, '#ffe6a8', 0.8 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 40); ctx.lineTo(hx + 8, hy - 30); ctx.lineTo(hx, hy - 20); ctx.lineTo(hx - 8, hy - 30); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawLeg(ctx: Ctx, hx: number, hy: number, kx: number, ky: number, fx2: number, fy2: number, back: boolean, gg: (a: number, b: number, c: number, d: number) => CanvasGradient, o: string) {
    const dk = back ? '#4a3210' : '#6a4a1a';
    const foot = [fx2 - 12, fy2, fx2 - 10, fy2 - 9, fx2 + 8, fy2 - 8, fx2 + 20, fy2 - 2, fx2 + 20, fy2];
    limbStroke(ctx, hx, hy, kx, ky, 12, 10, o, 2.6);
    limbStroke(ctx, kx, ky, fx2, fy2, 10, 9, o, 2.6);
    poly(ctx, foot, null, o, 2.4);
    poly(ctx, foot, back ? '#4a3210' : gg(fx2 - 12, fy2 - 9, fx2 + 20, fy2), null);
    limbShaded(ctx, kx, ky, fx2, fy2, 10, 9, back ? '#5a3e14' : '#9a7a32', null, 1, true);
    limbShaded(ctx, hx, hy, kx, ky, 12, 10, back ? '#5a3e14' : '#8a6a2a', null, 1, true);
    // greave plate & knee cop
    limbShaded(ctx, kx + (fx2 - kx) * 0.15, ky + (fy2 - ky) * 0.15, kx + (fx2 - kx) * 0.85, ky + (fy2 - ky) * 0.85, 9, 7.5, back ? dk : '#c9a04a', o, 1.2, true);
    ctx.beginPath();
    ctx.arc(kx, ky, 9, 0, Math.PI * 2);
    ctx.fillStyle = back ? '#5a3e14' : rGrad(ctx, '#e2c070', -3, -3, 11, 0.4, -0.35);
    if (!back) {
      ctx.save();
      ctx.translate(kx, ky);
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = o;
    ctx.stroke();
  }

  private drawArm(ctx: Ctx, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, back: boolean, gg: (a: number, b: number, c: number, d: number) => CanvasGradient, o: string) {
    limbStroke(ctx, sx, sy, ex, ey, 11, 9, o, 2.6);
    limbStroke(ctx, ex, ey, hx, hy, 10, 11, o, 2.6);
    limbShaded(ctx, ex, ey, hx, hy, 10, 11, back ? '#5a3e14' : '#b08a3a', null, 1, true);
    limbShaded(ctx, sx, sy, ex, ey, 11, 9, back ? '#5a3e14' : '#9a7a32', null, 1, true);
    ctx.save();
    ctx.translate(ex, ey);
    circle(ctx, 0, 0, 8, back ? '#4a3210' : rGrad(ctx, '#c9a04a', -2.5, -2.5, 9, 0.4, -0.3));
    ctx.restore();
    // fist
    ctx.save();
    ctx.translate(hx, hy);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = back ? '#5a3e14' : rGrad(ctx, '#b08a3a', -4, -5, 16, 0.42, -0.35);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = o;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = back ? '#3a2408' : '#6a4a1a';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hx + i * 5, hy - 10);
      ctx.lineTo(hx + i * 5 + 2, hy + 4);
      ctx.stroke();
    }
    // pauldron
    if (!back || true) {
      ctx.save();
      ctx.translate(sx, sy);
      const an = Math.atan2(ey - sy, ex - sx);
      ctx.rotate(an - Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 4, 22, 17, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = back ? '#5a3e14' : gg(-20, -16, 20, 10);
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (!(back && this.armorBroken)) {
        for (let i = -1; i <= 1; i++) poly(ctx, [i * 10 - 3, -10 + Math.abs(i) * 4, i * 12, -24 + Math.abs(i) * 6, i * 10 + 3, -10 + Math.abs(i) * 4], back ? '#4a3210' : '#e2c070', o, 1);
      }
      ctx.restore();
    }
  }

  private drawHead(ctx: Ctx, gg: (a: number, b: number, c: number, d: number) => CanvasGradient, o: string, broken: boolean) {
    const j = this.j;
    const hx = j.headX, hy = j.headY;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(j.headA);
    const R = 15;
    // neck gorget
    poly(ctx, [-12, 10, 12, 10, 14, 20, -14, 20], '#7a5a22', o, 1.2);
    // serene mask
    ctx.beginPath();
    ctx.moveTo(-R * 0.9, -R * 0.6);
    ctx.quadraticCurveTo(0, -R * 1.25, R * 0.95, -R * 0.55);
    ctx.lineTo(R * 1.05, R * 0.4);
    ctx.quadraticCurveTo(R * 0.6, R * 1.25, 0, R * 1.2);
    ctx.quadraticCurveTo(-R * 0.8, R * 1.0, -R * 0.95, R * 0.2);
    ctx.closePath();
    ctx.fillStyle = gg(-R, -R, R, R);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // features: closed serene eyes become hollow sockets with violet fire
    const eyeA = this.eyes;
    for (const ex of [R * 0.15, R * 0.62]) {
      ctx.fillStyle = '#1a0c04';
      ctx.beginPath();
      ctx.ellipse(ex, -R * 0.1, 3.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (eyeA > 0) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, ex, -R * 0.1, 8 + eyeA * 5, this.phase >= 2 ? '#ff9a3a' : '#b04cff', Math.min(1, eyeA));
        glow(ctx, ex, -R * 0.1, 3, '#ffffff', Math.min(1, eyeA) * 0.8);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.strokeStyle = '#6a4a1a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(R * 0.85, R * 0.0);
    ctx.lineTo(R * 1.0, R * 0.35);
    ctx.moveTo(R * 0.3, R * 0.65);
    ctx.lineTo(R * 0.75, R * 0.6);
    ctx.stroke();
    if (broken) {
      // a shard of the mask is gone; void and fire behind it
      poly(ctx, [R * 0.2, -R * 0.9, R * 0.95, -R * 0.55, R * 1.05, R * 0.1, R * 0.4, R * 0.25], '#1a0804', o, 1);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, R * 0.6, -R * 0.2, 14, '#ff7a1a', 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
    // crown
    poly(ctx, [-R * 0.95, -R * 0.55, -R * 1.1, -R * 1.6, -R * 0.55, -R * 1.05, -R * 0.1, -R * 2.0, R * 0.35, -R * 1.05, R * 0.85, -R * 1.7, R * 0.95, -R * 0.55], gg(-R, -R * 2, R, -R * 0.5), o, 1.3);
    circle(ctx, -R * 0.1, -R * 1.0, 2.6, '#a0203a');
    ctx.restore();
  }

  lights() {
    if (this.state === 'dormant') return;
    lighting.add(this.x, this.y - 100, 260, '#ffcf6b', 0.7, 0.25);
    if (this.armorBroken) lighting.add(this.x + this.face * 10, this.y - 110, 120, '#ff7a1a', 0.9, 0.6);
    for (const m of this.markers) lighting.add(m.x, this.y - 4, 50, '#ff6a3a', 0.6, 0.4);
    if (this.beamOn > 0) lighting.add(this.beamX, this.y - 10, 90, '#ff9a3a', 1, 0.6);
  }
}

export const idolRest = REST;
export { easeOutCubic, easeInQuad, approach };
