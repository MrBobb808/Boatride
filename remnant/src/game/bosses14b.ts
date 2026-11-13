// Chapter XIV: the Engine of the North. The host came to take a land that has neither bars nor gates (Ezekiel 38:11)
// with a machine made for walls: a tower on iron-shod wheels, hides on its face against fire, a ram the length of a
// cedar, a deck of bowmen and a door that lets down a company. It is a thing, not a prince, and it is brought down
// in three movements:
//
// - BUILT FOR WALLS (from the start): the ram (drawn back, then driven the length of the floor at knee height: dodge
//   it, or turn it with a parry and it staggers), the roll (the whole tower comes at Elior; it ends against a wall,
//   and the engine stands stuck), pots of fire from the deck, the bowmen's volley, and the door that lets a company out.
// - WRAPPED IN FIRE (two thirds): the hides catch. The ram leaves fire where it strikes, and the deck gouts flame.
// - BROUGHT DOWN (one third): the deck falls in. Rubble rains from the broken top, the rolls come faster, and when
//   it is done the ground shakes and the tower comes down (Ezekiel 38:20).

import { BossBase } from './bosses2';
import { type HitInfo } from './entity';
import { glow, rgba, poly, ellipse, circle, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, choose } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import type { EnemyKind } from './tiles';

type Atk = 'ram' | 'roll' | 'pots' | 'volley' | 'door' | 'flames' | 'rubble';

const TIMBER = '#5a4030', TIMBER_D = '#2e2018', HIDE = '#6a3a28', IRON = '#4a4e58', IRON_L = '#9aa0ac', CRIMSON = '#7a1e22', FIRE = '#ff7a2a';

/** A marked spot where a pot or a stone is on its way down. */
interface Fall { x: number; t: number; at: number }

export class SiegeColossus extends BossBase {
  pixelBox = [-210, -340, 210, 24] as const;
  floorY: number;
  atk: Atk | null = null;
  lastAtk: Atk | null = null;
  step = 0;
  /** Wheel turn, ram extension (0 drawn back .. 1 out), how far it is drawn back, door open, lean of a falling tower. */
  wheel = 0;
  ram = 0;
  pull = 0;
  door = 0;
  tilt = 0;
  tiltTo = 0;
  burning = false;
  broken = false;
  falls: Fall[] = [];
  servants: { remove: boolean; dying: boolean }[] = [];
  callT = 7;
  rollDir = 1;
  fade = 1;
  shudder = 0;
  fireT = 0;
  collapse = 0;

  constructor(x: number, y: number) {
    super('siege_colossus', x, y, 150, 280, 1400000);
    this.name = 'The Engine of the North';
    this.sub = 'Built for Walls';
    this.floorY = y;
    this.maxPoise = this.poise = 1500;
    this.kneelTime = 3.5;
    this.p2At = 0.66;
    this.p3At = 0.33;
    this.phaseMarks = [0.66, 0.33];
    this.face = -1;
    this.hitSound = 'hitMetal';
    this.collide = true;
    this.heavyBody = true;
  }

  get dmg() { return 560 * this.ngMul * this.encounterDamage * (this.phase >= 3 ? 1.2 : this.phase === 2 ? 1.1 : 1); }
  get spd() { return this.phase >= 3 ? 1.35 : this.phase === 2 ? 1.17 : 1.0; }
  get width() { return G.world.grid.w * 16; }
  hurtbox() {
    const h = this.broken ? 190 : 270;
    return { x: this.x - 78, y: this.y - h, w: 156, h };
  }
  get cy() { return this.y - 130; }
  executable() { return false; }

  // ------------------------------------------------------------ lifecycle
  updateDormant(dt: number) {
    this.shudder = Math.max(0, this.shudder - dt);
    this.ram = approach(this.ram, 0, dt);
  }

  updateIntro(_dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 40, y: this.y - 140 };
    if (t < 0.8) { this.pull = Math.min(1, t / 0.8); this.shudder = 0.3; }
    else if (this.introT === 0) {
      this.introT = 1;
      this.ram = 1;
      this.pull = 0;
      sfx('bossSlam', { pitch: 0.55, vol: 0.9 });
      sfx('armyHorns', { vol: 0.8, pitch: 0.8 });
      sfx('chainRattle', { vol: 0.7 });
      fx.dust(this.x, this.y, 30, 3);
      G.camera.addTrauma(0.6 * shakeScale());
      G.ui.banner('THE ENGINE OF THE NORTH', this.sub, 'boss');
      music.play('tower', 0.6);
      music.phase = 0;
    } else if (t > 2.3) {
      this.ram = 0;
      this.beginFight();
    }
    this.animate(_dt);
  }

  updateKneel(dt: number) {
    this.shudder = 0.12;
    this.body.vx = approach(this.body.vx, 0, 900 * dt);
    this.pull = approach(this.pull, 0.2, dt);
    this.ram = approach(this.ram, 0, dt * 2);
  }

  onKneel() {
    this.atk = null;
    this.collide = true;
    this.falls.length = 0;
    this.ram = 0;
    G.ui.toast('The engine is stuck: strike now.', 'good');
  }

  recover() {
    super.recover();
    sfx('chainRattle', { vol: 0.6 });
  }

  guard(_h: HitInfo) { return false; }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player, dx = p.x - this.x, dist = Math.abs(dx);
    this.tickFalls(dt);
    this.callT -= dt;
    this.servants = this.servants.filter((e) => !e.remove && !e.dying);
    if (this.state === 'idle') {
      // It turns, slowly, to face Elior, and creeps toward him on its wheels.
      if (Math.abs(dx) > 30) this.face = sign(dx) || this.face;
      const want = dist > 230 ? sign(dx) * 55 * this.spd : 0;
      this.body.vx = approach(this.body.vx, want, 300 * dt);
      this.move(dt);
      this.pull = approach(this.pull, 0, dt * 2);
      this.cd -= dt * this.spd;
      if (this.callT <= 0 && this.servants.length < (this.phase >= 3 ? 3 : 2)) this.start('door');
      else if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const ph = this.phase;
    const near: Atk[] = ph >= 3 ? ['ram', 'rubble', 'roll', 'ram'] : ph === 2 ? ['ram', 'flames', 'ram', 'roll'] : ['ram', 'ram', 'pots', 'roll'];
    const far: Atk[] = ph >= 3 ? ['roll', 'rubble', 'pots'] : ph === 2 ? ['volley', 'flames', 'pots', 'roll'] : ['volley', 'pots', 'roll', 'volley'];
    const pool = dist < 200 ? near : far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    if (this.broken && a === 'volley') a = 'rubble';
    this.start(a);
  }

  private start(a: Atk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.hitSet.clear();
    this.face = sign(G.world.player.x - this.x) || this.face;
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.collide = true;
    this.cd = cd / this.spd;
  }

  private move(dt: number) {
    const b = this.body;
    this.x = clamp(this.x + b.vx * dt, 110, this.width - 110);
    this.y = this.floorY;
    b.vy = 0;
    this.wheel += (b.vx * dt) / 34;
  }

  /** A box in front of the engine, measured from its centre toward the way it faces. */
  private hit(bx: number, by: number, bw: number, bh: number, mul: number, extra: Partial<HitInfo> = {}) {
    const f = this.face;
    const x = f > 0 ? this.x + bx : this.x - (bx + bw);
    return G.world.hitPlayerSide({ x, y: this.y + by, w: bw, h: bh }, { dmg: this.dmg * mul, poise: 60, kx: f * 300, ky: -220, dir: f, kind: 'melee', src: this, parryable: true, ...extra }, this.hitSet);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body;
    switch (this.atk) {
      case 'ram': {
        // The ram drawn back on its chains, then driven out along the floor at knee height. Dodge it, or turn it with a parry.
        const tel = 1.0 / sp, act = 0.32, hold = 0.5;
        b.vx = approach(b.vx, 0, 900 * dt);
        this.move(dt);
        if (t < tel) {
          this.pull = Math.min(1, t / (tel * 0.9));
          this.ram = 0;
          if (t < dt * 1.5) sfx('chainRattle', { pan: W.pan(this.x), vol: 0.7 });
        } else if (t < tel + act) {
          if (t - dt < tel) { sfx('bossSweep', { pan: W.pan(this.x), pitch: 0.6, vol: 0.9 }); sfx('swingHeavy', { pan: W.pan(this.x), pitch: 0.4 }); }
          this.pull = 0;
          this.ram = Math.min(1, (t - tel) / (act * 0.6));
          this.hit(30, -62, 90 + this.ram * 190, 46, 1.2, { poise: 110, kx: f * 420, ky: -180 });
        } else if (t < tel + act + hold) {
          this.ram = 1;
          if (t - dt < tel + act) {
            G.camera.addTrauma(0.3 * shakeScale());
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 0.8, vol: 0.8 });
            fx.dust(this.x + f * 250, this.y, 14, 2);
            // A burning engine leaves its fire where the ram lands.
            if (this.burning) for (const o of [190, 250, 310]) W.add(new Proj('puddle', this.x + f * o, this.y, 'enemy', this.dmg * 0.25, { life: 3, w: 34, h: 9, color: FIRE }));
          }
        } else {
          this.ram = approach(this.ram, 0, dt * 2.4);
          if (t > tel + act + hold + 0.5) this.endAttack(1.2);
        }
        break;
      }
      case 'roll': {
        // The whole tower rolls at Elior and does not stop for him. It stops against the wall, and stands stuck.
        const tel = 1.1 / Math.min(sp, 1.3), w = this.width;
        if (t < tel) {
          b.vx = approach(b.vx, -f * 40, 400 * dt);
          this.move(dt);
          this.shudder = 0.3;
          if (t < dt * 1.5) { sfx('armyHorns', { pan: W.pan(this.x), vol: 0.8, pitch: 0.7 }); sfx('chainRattle', { vol: 0.5 }); this.rollDir = f; }
          break;
        }
        if (this.step === 0) { this.step = 1; this.collide = false; this.rollDir = f; this.ram = 0; this.pull = 0.5; }
        if (this.step === 1) {
          const k = Math.min(1, (t - tel) / 1.2);
          b.vx = this.rollDir * (190 + 190 * k) * Math.min(sp, 1.3);
          this.move(dt);
          this.hit(-70, -270, 150, 270, 1.35, { poise: 120, kx: this.rollDir * 460, ky: -260, parryable: false, unblockable: true });
          if (Math.random() < dt * 50) fx.spawn(PK.Dust, this.x - this.rollDir * 80, this.y - 2, -this.rollDir * 60, -20, 0.5, 4, 10, '#8a7a6a', 0, 2);
          const atWall = (this.rollDir > 0 && this.x >= w - 112) || (this.rollDir < 0 && this.x <= 112);
          if (atWall || t > tel + 4) {
            this.step = 2;
            this.collide = true;
            b.vx = 0;
            G.camera.addTrauma(0.8 * shakeScale());
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 0.55, vol: 1 });
            sfx('stoneCrack', { vol: 0.8 });
            fx.dust(this.x, this.y, 36, 3.2);
            fx.ring(this.x, this.y - 2, 10, 220, '#c8a878', 0.6, 5, 0.3);
            // The crash shakes stones loose from the deck above.
            for (let i = 0; i < 4; i++) this.drop(clamp(this.x - this.rollDir * rand(60, 360), 60, w - 60), 0.9 + i * 0.1, 'debris');
            if (atWall) { this.poise = 0; this.kneel(); }
          }
        } else if (t > tel + 5) this.endAttack(1.0);
        break;
      }
      case 'pots': {
        // The bowmen on the deck hurl pots of fire: each falls on a marked spot of floor.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.move(dt);
        const n = this.phase >= 3 ? 5 : this.phase === 2 ? 4 : 3;
        if (t < dt * 1.5) sfx('molten', { pan: W.pan(this.x), pitch: 0.7, vol: 0.6 });
        if (this.step < n && t >= 0.5 + this.step * 0.28 / sp) {
          const px = W.player.x + (this.step - (n - 1) / 2) * 90 + rand(-18, 18);
          this.step++;
          this.drop(clamp(px, 70, this.width - 70), 1.0, 'pot');
        }
        if (t > 0.5 + n * 0.28 / sp + 1.4) this.endAttack(1.1);
        break;
      }
      case 'volley': {
        // Arrows from the deck, in a fan toward Elior.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.move(dt);
        const rounds = this.phase >= 2 ? 3 : 2;
        if (this.step < rounds && t >= 0.5 + this.step * 0.8 / sp) {
          this.step++;
          sfx('arrowRain', { pan: W.pan(this.x), vol: 0.7 });
          const sx = this.x + f * 40, sy = this.y - 270, p = W.player;
          for (const s of [-0.3, -0.15, 0, 0.15, 0.3]) {
            const ang = Math.atan2(p.y - 16 - sy, p.x - sx) + s, sp2 = 460;
            W.add(new Proj('arrow', sx + rand(-24, 24), sy, 'enemy', this.dmg * 0.45, { vx: Math.cos(ang) * sp2, vy: Math.sin(ang) * sp2, life: 2.6, w: 10, h: 4, color: '#ffd27a' }));
          }
        }
        if (t > 0.5 + rounds * 0.8 / sp + 0.9) this.endAttack(1.2);
        break;
      }
      case 'door': {
        // The door on the engine's face drops, and a company comes out of it.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.move(dt);
        if (t < 0.6) this.door = Math.min(1, t / 0.5);
        if (t >= 0.6 && this.step === 0) {
          this.step = 1;
          this.callT = this.phase >= 3 ? 10 : 13;
          sfx('armyHorns', { vol: 0.7 });
          sfx('bossSlam', { pan: W.pan(this.x), pitch: 1.2, vol: 0.5 });
          G.ui.toast('A company comes out of the engine', 'warn');
          const host: EnemyKind[] = this.phase >= 3 ? ['brute', 'lion', 'knight'] : this.phase === 2 ? ['knight', 'archer', 'brute'] : ['knight', 'archer', 'hound'];
          const n = this.phase >= 3 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const e = W.spawnEnemy(host[i % host.length], this.x + f * (110 + i * 44), this.y);
            this.servants.push(e);
            fx.dust(this.x + f * (110 + i * 44), this.y, 10, 1.4);
          }
        }
        if (t > 1.6) { this.door = approach(this.door, 0, dt * 2); if (this.door <= 0) this.endAttack(0.8); }
        break;
      }
      case 'flames': {
        // The burning deck gouts flame down onto the floor before it: gouts that tumble and pool.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.move(dt);
        const n = this.phase >= 3 ? 5 : 4;
        if (t < dt * 1.5) sfx('flame', { pan: W.pan(this.x), pitch: 0.7, vol: 0.7 });
        if (this.step < n && t >= 0.5 + this.step * 0.3 / sp) {
          this.step++;
          sfx('fireBurst', { pan: W.pan(this.x), vol: 0.5 });
          const k = this.step - 1;
          W.add(new Proj('flame', this.x + f * 50, this.y - 250, 'enemy', this.dmg * 0.55, { vx: f * (90 + k * 70), vy: -60 + rand(-30, 30), life: 2.2, w: 14, h: 14, color: FIRE, big: true }));
        }
        if (t > 0.5 + n * 0.3 / sp + 1.4) this.endAttack(1.2);
        break;
      }
      case 'rubble': {
        // The broken top sheds stones: they fall on marked ground, in a sweep across the floor.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.move(dt);
        const n = 7;
        if (t < dt * 1.5) { sfx('stoneCrack', { vol: 0.7 }); G.camera.addTrauma(0.25 * shakeScale()); }
        if (this.step < n && t >= 0.4 + this.step * 0.2 / sp) {
          const k = this.step++, px = W.player.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 80 + rand(-14, 14);
          this.drop(clamp(px, 70, this.width - 70), 0.95, 'debris');
        }
        if (t > 0.4 + n * 0.2 / sp + 1.3) this.endAttack(1.2);
        break;
      }
    }
  }

  /** A pot or a stone starts down from the deck onto marked floor. */
  private drop(x: number, fall: number, kind: 'pot' | 'debris') {
    this.falls.push({ x, t: 0, at: fall });
    const W = G.world, top = this.y - 340, big = kind === 'pot';
    if (big) W.add(new Proj('drop', x, top, 'enemy', this.dmg * 0.7, { life: 3, w: 12, h: 12, color: FIRE }));
    else W.add(new Proj('debris', x, top, 'enemy', this.dmg * 0.65, { life: 3, w: 18, h: 18, color: '#b8a888', big: true }));
  }

  private tickFalls(dt: number) {
    for (let i = this.falls.length - 1; i >= 0; i--) {
      this.falls[i].t += dt;
      if (this.falls[i].t > this.falls[i].at + 0.25) this.falls.splice(i, 1);
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
    this.falls.length = 0;
    this.ram = 0;
    this.maxPoise = this.poise = phase >= 3 ? 1700 : 1600;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.6, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 140 };
    this.body.vx = approach(this.body.vx, 0, 900 * dt);
    this.shudder = 0.3;
    if (t < 0.9) {
      if (this.introT === 0) {
        this.introT = 1;
        sfx('stoneCrack', { vol: 0.8 });
        G.camera.addTrauma(0.4 * shakeScale());
        G.ui.caption(this.phase === 2
          ? '“For in my jealousy and in the fire of my wrath have I spoken,” · Ezekiel 38:19 (KJV)'
          : '“...and every wall shall fall to the ground.” · Ezekiel 38:20 (KJV)');
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      if (this.phase === 2) {
        this.burning = true;
        this.sub = 'Wrapped in Fire';
        fx.flash(FIRE, 0.3);
        sfx('flame', { vol: 0.9, pitch: 0.6 });
        sfx('fireBurst', { vol: 0.8 });
      } else {
        this.broken = true;
        this.tiltTo = 0.05;
        this.sub = 'Brought Down';
        fx.flash('#c8a878', 0.3);
        sfx('bossSlam', { vol: 1, pitch: 0.5 });
        sfx('stoneCrack', { vol: 0.9 });
        fx.dust(this.x, this.y - 200, 40, 3.4);
        // The deck falls in: stones, planks and the bowmen with them.
        for (let i = 0; i < 6; i++) fx.spawn(PK.Dust, this.x + rand(-70, 70), this.y - rand(150, 260), rand(-60, 60), rand(20, 120), 0.9, 6, 12, '#8a7a6a', 0, 2);
      }
      fx.ring(this.x, this.y - 120, 12, 320, FIRE, 0.9, 6);
      fx.column(this.x, this.y, 70, 340, '#ffe6c0', 0.6);
      sfx('armyHorns', { vol: 0.9, pitch: 0.8 });
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.banner('THE ENGINE OF THE NORTH', this.sub, 'boss');
      music.bossPhase(this.phase - 1);
      this.callT = 3;
    } else if (t > 2.3) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.9;
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
    this.falls.length = 0;
    this.collide = true;
    for (const e of this.servants) if (!e.remove && !e.dying) e.remove = true;
    this.servants.length = 0;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 140 };
    this.body.vx = approach(this.body.vx, 0, 900 * dt);
    if (t < 1.4) {
      // The ground begins to shake under it.
      this.shudder = 0.5;
      if (this.introT !== 7) {
        this.introT = 7;
        sfx('stoneCrack', { vol: 1 });
        sfx('bossRoar', { pitch: 0.4, vol: 0.7 });
        G.ui.caption('“...and every wall shall fall to the ground.” · Ezekiel 38:20 (KJV)');
      }
      if (Math.random() < dt * 14) G.camera.addTrauma(0.12 * shakeScale());
    } else if (t < 4.0) {
      // It comes down: it leans, the deck goes, and the whole of it falls apart in dust.
      this.tiltTo = 0.5 * sign(this.face || 1);
      this.tilt = approach(this.tilt, this.tiltTo, dt * 0.35);
      this.collapse = Math.min(1, (t - 1.4) / 2.2);
      this.fade = Math.max(0, 1 - Math.max(0, t - 2.6) / 1.4);
      if (Math.random() < dt * 40) fx.spawn(PK.Dust, this.x + rand(-90, 90), this.y - rand(0, 220), rand(-40, 40), rand(-20, 40), 0.9, 7, 14, '#8a7a6a', 0, 2);
      if (this.introT === 7) { this.introT = 8; sfx('bossSlam', { vol: 1, pitch: 0.45 }); G.camera.addTrauma(0.8 * shakeScale()); fx.flash('#c8a878', 0.4); }
    } else if (this.introT === 8) {
      this.introT = 9;
      this.fade = 0;
      G.ui.caption(null);
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    this.shudder = Math.max(0, this.shudder - dt);
    this.fireT += dt;
    this.tilt = approach(this.tilt, this.state === 'dead' ? this.tilt : this.tiltTo, dt * 0.3);
    if (this.state === 'dead') return;
    if (this.burning && Math.random() < dt * 30) {
      const x = this.x + rand(-70, 70), y = this.y - rand(40, this.broken ? 190 : 260);
      fx.spawn(PK.Flame, x, y, rand(-10, 10), rand(-70, -30), 0.5, 6, 1, FIRE, -60, 1);
      if (Math.random() < 0.3) fx.spawn(PK.Smoke, x, y - 10, rand(-8, 8), rand(-40, -20), 0.9, 5, 12, '#2a2220', 0, 1);
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    for (const m of this.falls) if (m.t < m.at) this.floorMark(ctx, m.x, this.floorY, 36, m.t / m.at, FIRE);
    if (this.fade <= 0) return;
    const f = this.face, sh = this.shudder > 0 ? Math.sin(G.time * 60) * Math.min(2, this.shudder * 6) : 0;
    ctx.globalAlpha = this.fade;
    ctx.save();
    ctx.translate(this.x + sh, this.y);
    ctx.rotate(this.tilt * 0.4);
    ctx.scale(f, 1);
    this.drawEngine(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.55, this.flash * 6) * this.fade;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -130, 130, '#ffffff', 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // The ram's telegraph: a long strip of floor before it.
    if (this.state === 'attack' && this.atk === 'ram' && this.st < 1.0 / this.spd) {
      const u = this.st / (1.0 / this.spd);
      this.floorMark(ctx, this.x + f * 200, this.y, 150, u, '#ff9a4a');
    }
    if (this.state === 'attack' && this.atk === 'roll' && this.step === 0 && this.st < 1.1) this.floorMark(ctx, this.x + f * 230, this.y, 200, this.st / 1.1, '#ffcf6b');
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 130, 120, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** The tower, in its own space: +x is the way it faces, the origin at the middle of its floor. */
  private drawEngine(ctx: Ctx) {
    const top = this.broken ? -190 : -270;
    // Wheels, big and iron-shod.
    for (const wx of [-62, 56]) this.drawWheel(ctx, wx, -34, 34);
    // Chassis: a timber raft with iron bands.
    poly(ctx, [-92, -34, 92, -34, 88, -64, -88, -64], TIMBER_D, '#060408', 1);
    for (const x of [-70, -20, 30, 74]) poly(ctx, [x - 3, -34, x + 3, -34, x + 3, -64, x - 3, -64], IRON);
    // The ram: a cedar log slung on chains, ironed at the head, driven out of the front.
    const ramX = 24 + this.ram * 190 - this.pull * 46;
    this.drawRam(ctx, ramX);
    // The tower: three stories of tarred timber, hides on its face, narrowing toward the deck.
    const w0 = 80, w1 = this.broken ? 70 : 62;
    poly(ctx, [-w0, -64, w0, -64, w1, top, -w1, top], TIMBER, '#060408', 1.2);
    // Hides nailed across the face (wet, against fire).
    for (let i = 0; i < 3; i++) {
      const y0 = -64 - i * 70, y1 = y0 - 62, wa = w0 - i * 6, wb = w0 - (i + 1) * 6;
      if (y1 < top) break;
      poly(ctx, [-wa + 6, y0 - 4, wa - 6, y0 - 4, wb - 6, y1, -wb + 6, y1], this.burning ? '#8a3a20' : HIDE, '#2e1c14', 0.8);
      for (let k = -2; k <= 2; k++) circle(ctx, k * 24, (y0 + y1) / 2, 1.8, IRON_L);
    }
    // Cross-braces, and slits that glow where the bowmen stand.
    ctx.strokeStyle = TIMBER_D;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w0, -64); ctx.lineTo(w1, top); ctx.moveTo(w0, -64); ctx.lineTo(-w1, top);
    ctx.stroke();
    // The door: set into the face, lowered like a bridge when it opens.
    this.drawDoor(ctx);
    // The deck: crenellations, bowmen against the sky, a standard.
    if (!this.broken) this.drawDeck(ctx, top, w1);
    else this.drawBrokenTop(ctx, top, w1);
    // Fire: a glow in the hides, and the flames themselves are particles.
    if (this.burning) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -130, 120, FIRE, 0.18 + Math.sin(this.fireT * 9) * 0.05);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawWheel(ctx: Ctx, x: number, y: number, r: number) {
    circle(ctx, x, y, r, '#2a1c14');
    circle(ctx, x, y, r - 5, TIMBER);
    ctx.strokeStyle = IRON;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = TIMBER_D;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = this.wheel + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
      ctx.stroke();
    }
    circle(ctx, x, y, 6, IRON_L);
  }

  private drawRam(ctx: Ctx, tip: number) {
    // Chains from the tower, the log, and a bronze ram's head at its end.
    ctx.strokeStyle = IRON;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(10, -120); ctx.lineTo(tip - 30, -62); ctx.moveTo(56, -120); ctx.lineTo(tip + 10, -62);
    ctx.stroke();
    poly(ctx, [tip - 150, -80, tip + 10, -80, tip + 10, -50, tip - 150, -50], '#7a5a3a', '#060408', 1.2);
    for (const x of [tip - 110, tip - 60, tip - 10]) poly(ctx, [x, -80, x + 4, -80, x + 4, -50, x, -50], IRON);
    // The head: a ram's, with curled horns.
    poly(ctx, [tip + 10, -84, tip + 34, -76, tip + 46, -66, tip + 34, -54, tip + 10, -46], '#c8943a', '#060408', 1);
    poly(ctx, [tip + 12, -82, tip + 28, -92, tip + 40, -88, tip + 36, -78], '#e8c25a', '#060408', 0.8);
    poly(ctx, [tip + 12, -48, tip + 28, -38, tip + 40, -42, tip + 36, -52], '#e8c25a', '#060408', 0.8);
    if (this.burning) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, tip + 20, -66, 30, FIRE, 0.4);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawDoor(ctx: Ctx) {
    // On the face, at the second story; drawn open as a bridge that drops forward.
    const x0 = 56, y0 = -96;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(this.door * 1.15);
    poly(ctx, [0, 0, 36, 0, 36, 4, 0, 4], '#7a5a3a', '#060408', 1);
    ctx.restore();
    if (this.door > 0.1) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x0 - 8, y0 - 18, 30, '#ffb35c', 0.35 * this.door);
      ctx.globalCompositeOperation = 'source-over';
    }
    poly(ctx, [x0 - 30, y0, x0, y0, x0, y0 - 44, x0 - 30, y0 - 44], this.door > 0.1 ? '#1a1008' : '#3a2616', '#060408', 1);
  }

  private drawDeck(ctx: Ctx, top: number, w: number) {
    poly(ctx, [-w - 10, top, w + 10, top, w + 10, top - 12, -w - 10, top - 12], TIMBER_D, '#060408', 1);
    for (let x = -w - 6; x <= w; x += 22) poly(ctx, [x, top - 12, x + 12, top - 12, x + 12, top - 28, x, top - 28], TIMBER, '#060408', 1);
    // Bowmen: dark shapes against the sky, drawing.
    for (let i = 0; i < 4; i++) {
      const x = -w + 14 + i * 36, bob = Math.sin(this.fireT * 2 + i) * 1;
      circle(ctx, x, top - 38 + bob, 5, '#1a1214');
      poly(ctx, [x - 5, top - 28, x + 5, top - 28, x + 4, top - 44 + bob, x - 4, top - 44 + bob], '#1a1214');
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + 8, top - 36 + bob, 8, -1.1, 1.1);
      ctx.stroke();
    }
    // A long standard of the north from a pole at the back.
    ctx.strokeStyle = TIMBER_D;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w + 4, top - 12); ctx.lineTo(-w + 4, top - 90);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const wave = Math.sin(this.fireT * 4 + i * 0.6) * (i / 10) * 4;
      poly(ctx, [-w + 5 - i * 3, top - 86 + i * 2 + wave, -w + 8 - i * 3, top - 86 + i * 2 + wave, -w + 8 - i * 3, top - 84 + i * 2 + wave + 3, -w + 5 - i * 3, top - 84 + i * 2 + wave + 3], i % 3 === 0 ? '#2a1418' : CRIMSON);
    }
  }

  private drawBrokenTop(ctx: Ctx, top: number, w: number) {
    // A ragged top: splintered posts, a fallen beam hanging by a chain.
    poly(ctx, [-w, top, -w + 18, top - 26, -w + 30, top - 8, -w + 52, top - 34, -w + 70, top - 4, w, top], TIMBER_D, '#060408', 1);
    poly(ctx, [w - 10, top, w - 26, top - 20, w - 36, top - 4], TIMBER, '#060408', 1);
    ctx.strokeStyle = IRON;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w - 22, top - 4); ctx.lineTo(w - 16, top + 36);
    ctx.stroke();
    poly(ctx, [w - 40, top + 36, w + 2, top + 30, w + 4, top + 38, w - 38, top + 44], '#7a5a3a', '#060408', 1);
  }

  drawOverlay(ctx: Ctx) {
    if (this.state !== 'kneel') return;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.7 + Math.sin(G.time * 10) * 0.3, y = this.y - 150;
    glow(ctx, this.x, y, 20, '#ffe6a8', 0.7 * p);
    ctx.strokeStyle = rgba('#fff6dc', p);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(this.x, y - 10); ctx.lineTo(this.x + 8, y); ctx.lineTo(this.x, y + 10); ctx.lineTo(this.x - 8, y); ctx.closePath();
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (this.fade <= 0) return;
    if (this.burning) lighting.add(this.x, this.y - 130, 220, FIRE, 0.9 * this.fade, 0.5);
    else lighting.add(this.x + this.face * 60, this.y - 100, 120, '#ffb35c', 0.5 * this.fade, 0.3);
    for (const m of this.falls) lighting.add(m.x, this.floorY - 20, 50, FIRE, 0.6, 0.6);
  }
}
