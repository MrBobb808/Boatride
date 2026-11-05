// Chapter XII: the King of the North (Daniel 11:36–45). After the gods fell, a man stood up in their place: he does
// according to his will and magnifies himself above every god, and he comes over the land like a whirlwind. He is
// one king in three movements, and he never fights alone: his horsemen ride with him. At the last he comes to his
// end and none helps him, and Michael stands up (Daniel 12:1). Elior only withstands.
//
// - THE WHIRLWIND (from the start): greatsword combos, a spin that crosses the whole floor low (jump it or dodge
//   through it), a leaping slam whose shock runs both ways, and his horsemen.
// - THE OVERFLOW (two thirds): floods that pass over the floor one after another, and tidings out of the north and
//   the east: arrows that fall on marked ground, and a volley skimming low from the east wall.
// - THE FURY (one third): he magnifies himself and grows; three dashes straight through Elior, faster everything.

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

type Atk = 'combo' | 'whirlwind' | 'leap' | 'overflow' | 'tidings' | 'fury' | 'summon';

const RED = '#c83a2a', GOLD = '#e8c25a', HI = '#ffe6c0';

const STYLE: HumanStyle = {
  skin: '#8a6a52', hair: '#1a1210', hairKind: 'short', beard: '#1a1210', coat: '#5a1010', coatDark: '#2e0808', skirt: 18, trim: GOLD,
  pants: '#2e0808', boots: '#140c08', glove: '#2a1a10', belt: GOLD, plate: { c: '#5a5e6a', dark: '#2a2c34', hi: '#d8dce8', tier: 3 },
  helm: 'crown', helmColor: GOLD, helmTrim: '#fff1c4', eye: '#ffe0c0', eyeGlow: 1, outline: '#060408',
  weapon: 'greatsword', weaponColor: '#d8dce8', weaponGlow: RED, weaponGlowAmt: 0.6, offhand: 'none', bulk: 1.45, crest: RED,
};
let ghostStyle: HumanStyle | null = null;
const ghostOf = () => (ghostStyle ??= { ...flashStyle(STYLE), skin: RED, coat: RED, coatDark: RED, pants: RED, boots: RED, glove: RED, belt: RED, plate: { c: RED, dark: RED, hi: RED, tier: 3 }, helmColor: RED, eye: RED, outline: RED, weaponColor: RED });

/** Who rides with him, by movement. */
const HOST: EnemyKind[][] = [['knight', 'lion'], ['soldier', 'archer', 'gale'], ['lion', 'brute', 'stalker']];

interface Ghost { x: number; y: number; face: number; j: Joints; life: number; s: number }
/** Ground marked by the tidings out of the north: arrows fall there a beat later. */
interface Mark { x: number; t: number; at: number; set: Set<number> }

export class NorthKing extends BossBase {
  pixelBox = [-170, -185, 170, 14] as const;
  j: Joints = newJoints();
  pose: Pose = { ...MP.planted };
  target: Pose = { ...MP.planted };
  rate = 8;
  cape: Chain;
  atk: Atk | null = null;
  lastAtk: Atk | null = null;
  step = 0;
  steps = 3;
  ghosts: Ghost[] = [];
  ghostT = 0;
  landX = 0;
  landY = 0;
  grounded = true;
  marks: Mark[] = [];
  /** His host: the riders he has called, and how soon he calls more. */
  servants: { remove: boolean; dying: boolean; die?: () => void }[] = [];
  callT = 5;
  /** He magnifies himself: his size grows in the last movement. */
  scale = 2.0;
  scaleTo = 2.0;
  spinA = 0;
  dashDir = 1;
  fade = 1;
  michael = 0;

  constructor(x: number, y: number) {
    super('north_king', x, y, 34, 76, 925000);
    this.name = 'The King of the North';
    this.sub = 'He Doeth According to His Will';
    this.maxPoise = this.poise = 1300;
    this.kneelTime = 2.4;
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

  get dmg() { return 540 * this.ngMul * this.encounterDamage * (this.phase >= 3 ? 1.25 : this.phase === 2 ? 1.12 : 1); }
  get spd() { return this.phase >= 3 ? 1.45 : this.phase === 2 ? 1.2 : 1.05; }
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
      this.target = { ...MP.rising };
      this.rate = 10;
      sfx('armyHorns', { vol: 0.8 });
      sfx('bossRoar', { pitch: 0.7 });
      fx.ring(this.x, this.y - 50, 12, 280, RED, 0.8, 5);
      G.camera.addTrauma(0.5 * shakeScale());
      G.ui.banner('THE KING OF THE NORTH', this.sub, 'boss');
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
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
  }

  onKneel() {
    this.atk = null;
    this.collide = true;
    this.marks.length = 0;
    G.ui.toast('The king staggers: strike now.', 'good');
  }

  recover() {
    super.recover();
    this.target = { ...MP.guard };
    sfx('swingHeavy', { pitch: 0.6 });
  }

  guard(_h: HitInfo) { return false; }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const dx = p.x - this.x, dist = Math.abs(dx);
    this.tickMarks(dt);
    this.callHost(dt);
    if (this.state === 'idle') {
      this.face = sign(dx) || this.face;
      this.target = { ...MP.guard, lean: 0.2 + Math.sin(G.time * 2) * 0.03 };
      const want = dist > 90 ? sign(dx) * 90 * this.spd : dist < 40 ? -sign(dx) * 50 : 0;
      this.body.vx = approach(this.body.vx, want, 540 * dt);
      this.physics(dt);
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const ph = this.phase;
    const near: Atk[] = ph >= 3 ? ['combo', 'fury', 'whirlwind', 'combo'] : ph === 2 ? ['combo', 'combo', 'whirlwind', 'overflow'] : ['combo', 'combo', 'whirlwind', 'leap'];
    const far: Atk[] = ph >= 3 ? ['fury', 'tidings', 'leap', 'overflow'] : ph === 2 ? ['tidings', 'overflow', 'leap', 'whirlwind'] : ['whirlwind', 'leap', 'leap'];
    const pool = dist < 100 ? near : far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    this.start(a);
  }

  private start(a: Atk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.hitSet.clear();
    this.steps = this.phase >= 3 ? 4 : 3;
    this.face = sign(G.world.player.x - this.x) || this.face;
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.collide = true;
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

  private swingFx(a0: number, a1: number, r = 56) {
    const hd = this.hand();
    fx.slash(hd.x, hd.y - 6, r * this.scale / 2, a0, a1, 12, this.face, HI, RED, 0.2);
  }

  /** He never fights alone: his host rides in at the edges, a few at a time. */
  private callHost(dt: number) {
    this.callT -= dt;
    this.servants = this.servants.filter((e) => !e.remove && !e.dying);
    if (this.callT <= 0 && this.state === 'idle' && this.servants.length < (this.phase >= 3 ? 5 : 4)) this.start('summon');
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body;
    switch (this.atk) {
      case 'combo': {
        // Down-stroke, rising stroke, thrust; in his fury, a fourth.
        const kind = this.step % 3;
        const tel = (this.step === 0 ? 0.48 : kind === 2 ? 0.34 : 0.28) / sp;
        const act = 0.14, rec = this.step === this.steps - 1 ? 0.6 : 0.12;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.overhead : kind === 1 ? MP.low : MP.draw;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 0 ? MP.downcut : kind === 1 ? MP.rising : MP.thrust;
          if (t - dt < tel) {
            b.vx = f * (kind === 2 ? 360 : 210);
            sfx(kind === 2 ? 'spearThrust' : 'swingHeavy', { pan: W.pan(this.x), pitch: 0.55 });
            if (kind === 0) this.swingFx(-2.6, 0.9);
            else if (kind === 1) this.swingFx(1.0, -2.4);
            else fx.streak(this.x + f * 14, this.y - 42, this.x + f * 130, this.y - 42, RED, 0.2, 4);
          }
          if (kind === 0) this.hit(-4, -96, 94, 96, 1, { poise: 50 });
          else if (kind === 1) this.hit(-4, -104, 86, 100, 1, { poise: 50, ky: -360, kx: f * 140 });
          else this.hit(0, -58, 128, 30, 1.3, { poise: 66, kx: f * 360, ky: -180 });
        } else if (t < tel + act + rec) this.rate = 8;
        else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (this.step >= this.steps || Math.abs(dx) > 160) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'whirlwind': {
        // "Like a whirlwind" (Daniel 11:40): he lowers his shoulder, then spins the whole length of the floor with
        // the blade low. Jump it, or dodge through it.
        const tel = 0.62 / Math.min(sp, 1.25), w = W.grid.w * 16;
        if (t < tel) {
          this.rate = 10;
          this.target = MP.low;
          b.vx = approach(b.vx, -f * 40, 600 * dt);
          if (t < dt * 1.5) { sfx('charge', { pan: W.pan(this.x), pitch: 0.7 }); sfx('stormGust', { vol: 0.6 }); }
          this.physics(dt);
          break;
        }
        if (this.step === 0) { this.step = 1; this.collide = false; this.dashDir = f; sfx('waveWhoosh', { pan: W.pan(this.x), pitch: 0.7 }); }
        this.rate = 30;
        this.target = MP.rising;
        this.spinA += dt * 24;
        b.vx = this.dashDir * 560 * Math.min(sp, 1.3);
        this.physics(dt);
        // The blade sweeps the floor around him: high enough to reach the knees, low enough to leap.
        W.hitPlayerSide({ x: this.x - 46, y: this.y - 40, w: 92, h: 40 }, { dmg: this.dmg * 0.9, poise: 60, kx: this.dashDir * 320, ky: -260, dir: this.dashDir, kind: 'melee', src: this, unblockable: true, parryable: false }, this.hitSet);
        if (Math.random() < dt * 40) fx.spawn(PK.Dust, this.x + rand(-30, 30), this.y - 2, -this.dashDir * 80, -30, 0.4, 3, 8, '#8a7a6a', 0, 2);
        this.ghostT -= dt;
        if (this.ghostT <= 0) this.addGhost();
        const atWall = (this.dashDir > 0 && this.x >= w - 60) || (this.dashDir < 0 && this.x <= 60);
        if (atWall || t > tel + 2.2) {
          b.vx = 0;
          G.camera.addTrauma(0.3 * shakeScale());
          fx.dust(this.x, this.y, 16, 2);
          this.endAttack(1.0);
        }
        break;
      }
      case 'leap': {
        const tel = 0.34;
        if (t < tel) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = approach(b.vx, 0, 900 * dt);
          this.physics(dt);
        } else if (this.step === 0) {
          this.step = 1;
          const p = W.player;
          this.landX = clamp(p.x, 60, W.grid.w * 16 - 60);
          this.landY = p.body.onGround ? p.y : this.y;
          b.vy = -640;
          b.vx = clamp((this.landX - this.x) / 0.82, -520, 520);
          b.onGround = false;
          sfx('jump', { pan: W.pan(this.x), pitch: 0.42 });
          fx.dust(this.x, this.y, 14, 2);
          this.target = MP.air;
          this.rate = 10;
          this.physics(dt);
        } else if (this.step === 1) {
          this.target = b.vy > 0 ? MP.plunge : MP.air;
          this.rate = b.vy > 0 ? 18 : 10;
          this.physics(dt);
          if (b.vy > 0) this.hit(-20, -72, 74, 72, 1, { poise: 52 });
          if ((this.grounded && t > tel + 0.1) || t > 2.6) {
            this.step = 2;
            this.st = tel + 0.1;
            b.vx = 0;
            this.target = MP.downcut;
            this.rate = 30;
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 0.9, vol: 0.9 });
            G.camera.addTrauma(0.6 * shakeScale());
            fx.dust(this.x, this.y, 26, 2.6);
            fx.ring(this.x, this.y - 2, 8, 150, RED, 0.45, 4, 0.25);
            this.hitSet.clear();
            const d = sign(W.player.x - this.x) || 1;
            W.hitPlayerSide({ x: this.x - 100, y: this.y - 48, w: 200, h: 48 }, { dmg: this.dmg * 1.15, poise: 60, kx: d * 300, ky: -320, dir: d, kind: 'melee', src: this, unblockable: true }, this.hitSet);
            for (const s of [-1, 1]) W.add(new Proj('wave', this.x + s * 26, this.y, 'enemy', this.dmg * 0.65, { vx: s * 300, life: 1.6, w: 16, h: 28, color: RED, big: true }));
          }
        } else {
          this.rate = 6;
          this.physics(dt);
          if (t > tel + 0.1 + 0.6) this.endAttack(1.1);
        }
        break;
      }
      case 'overflow': {
        // "He shall overflow and pass over" (Daniel 11:40): floods run the length of the floor one after another,
        // from his side and then from the far wall.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = t < 0.6 ? MP.overhead : MP.downcut;
        const n = this.phase >= 3 ? 4 : 3, w = W.grid.w * 16;
        if (t < dt * 1.5) { sfx('beamCharge', { pitch: 0.6, vol: 0.5 }); sfx('splash', { vol: 0.6 }); }
        if (this.step < n && t >= 0.6 + this.step * 0.75 / sp) {
          const from = this.step % 2 ? (this.x < w / 2 ? w - 70 : 70) : this.x;
          const dir = this.step % 2 ? (this.x < w / 2 ? -1 : 1) : f;
          this.step++;
          sfx('waveWhoosh', { pan: W.pan(from), vol: 0.8 });
          G.camera.addTrauma(0.25 * shakeScale());
          W.add(new Proj('wave', from + dir * 20, this.y, 'enemy', this.dmg * 0.75, { vx: dir * 300, life: 4, w: 20, h: 34, color: '#7ab0d8', big: true }));
        }
        if (t > 0.6 + n * 0.75 / sp + 1.0) this.endAttack(1.2);
        break;
      }
      case 'tidings': {
        // "Tidings out of the east and out of the north shall trouble him" (Daniel 11:44): arrows fall on ground
        // marked from the north, and a volley skims low from the east wall.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        const rounds = this.phase >= 3 ? 3 : 2, w = W.grid.w * 16;
        if (this.step < rounds && t >= this.step * 1.1) {
          this.step++;
          const px = W.player.x;
          for (const o of [0, -110, 110]) this.mark(px + o + rand(-10, 10), 0.85);
          sfx('horn', { vol: 0.6 });
          // The east wall's volley: low, along the floor, a beat after the marks.
          G.world.after(0.5, () => {
            if (this.state !== 'attack' || this.atk !== 'tidings') return;
            sfx('arrowRain', { vol: 0.7 });
            for (let i = 0; i < 3; i++) W.add(new Proj('arrow', w - 40 - i * 26, this.y - 16, 'enemy', this.dmg * 0.55, { vx: -560, vy: -20, life: 2.4, w: 12, h: 6, color: '#ffd27a' }));
          });
        }
        if (t > rounds * 1.1 + 1.0) this.endAttack(1.1);
        break;
      }
      case 'fury': {
        // "He shall go forth with great fury" (Daniel 11:44): three dashes straight through Elior, each telegraphed.
        const n = 3, tel = 0.42 / Math.min(sp, 1.4), run = 0.28, cyc = tel + run + 0.12;
        const k = Math.floor(t / cyc), u = t - k * cyc;
        if (k >= n) {
          b.vx = approach(b.vx, 0, 1800 * dt);
          this.physics(dt);
          this.target = MP.guard;
          if (t > n * cyc + 0.4) this.endAttack(1.2);
          break;
        }
        if (u < tel) {
          if (this.step === k) { this.step = k + 1; this.hitSet.clear(); this.face = sign(W.player.x - this.x) || this.face; sfx('charge', { pan: W.pan(this.x), pitch: 1.1, vol: 0.6 }); }
          this.collide = true;
          this.rate = 14;
          this.target = MP.draw;
          b.vx = approach(b.vx, 0, 1800 * dt);
        } else if (u < tel + run) {
          this.collide = false;
          this.rate = 30;
          this.target = MP.thrust;
          b.vx = this.face * 900;
          this.hit(-10, -70, 90, 70, 1.1, { poise: 60, kx: this.face * 340, ky: -220, parryable: false });
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
        } else b.vx = approach(b.vx, 0, 2400 * dt);
        this.physics(dt);
        break;
      }
      case 'summon': {
        // His host rides in at the edges of the palace floor.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        if (t >= 0.6 && this.step === 0) {
          this.step = 1;
          this.callT = this.phase >= 3 ? 8 : 11;
          sfx('armyHorns', { vol: 0.7 });
          G.ui.toast('The king calls his horsemen', 'warn');
          const w = W.grid.w * 16, n = this.phase >= 3 ? 3 : 2, host = HOST[Math.min(2, this.phase - 1)];
          for (let i = 0; i < n; i++) {
            const x = i % 2 ? w - 120 - rand(0, 80) : 120 + rand(0, 80);
            const e = W.spawnEnemy(host[i % host.length], x, this.y);
            this.servants.push(e);
            fx.column(x, this.y, 26, 150, RED, 0.6);
            fx.dust(x, this.y, 10, 1.4);
          }
        }
        if (t > 1.3) this.endAttack(0.8);
        break;
      }
    }
  }

  private mark(x: number, delay: number) {
    const w = G.world.grid.w * 16;
    this.marks.push({ x: clamp(x, 60, w - 60), t: 0, at: delay, set: new Set() });
  }

  private tickMarks(dt: number) {
    const W = G.world;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      const was = m.t;
      m.t += dt;
      if (m.t < m.at) continue;
      if (was < m.at) {
        sfx('arrowRain', { pan: W.pan(m.x), vol: 0.6 });
        for (let k = 0; k < 6; k++) fx.streak(m.x + rand(-26, 26) + 30, this.y - 220, m.x + rand(-26, 26), this.y - 4, '#ffd27a', 0.2, 2);
        fx.dust(m.x, this.y, 8, 1.4);
      }
      if (m.t < m.at + 0.3) {
        W.hitPlayerSide({ x: m.x - 30, y: this.y - 200, w: 60, h: 200 }, { dmg: this.dmg * 0.7, poise: 30, kx: 0, ky: -160, dir: 0, kind: 'proj', src: this, unblockable: true, parryable: false }, m.set);
      } else this.marks.splice(i, 1);
    }
  }

  private addGhost() {
    this.ghostT = 0.05;
    this.ghosts.push({ x: this.x, y: this.y, face: this.face, j: { ...this.j }, life: 0.35, s: this.scale });
    if (this.ghosts.length > 7) this.ghosts.shift();
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
    this.maxPoise = this.poise = phase >= 3 ? 1500 : 1400;
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
        sfx('bossRoar', { pitch: 0.6 });
        G.camera.addTrauma(0.4 * shakeScale());
        G.ui.caption(this.phase === 2
          ? '“He shall enter into the countries, and shall overflow and pass over.” · Daniel 11:40 (KJV)'
          : '“He shall exalt himself, and magnify himself above every god.” · Daniel 11:36 (KJV)');
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      this.target = { ...MP.rising, head: -0.3 };
      this.rate = 8;
      if (this.phase >= 3) { this.scaleTo = 2.35; this.sub = 'He Magnifieth Himself'; } else this.sub = 'He Overfloweth and Passeth Over';
      fx.flash(RED, 0.3);
      fx.ring(this.x, this.y - 40, 10, 320, RED, 0.9, 6);
      fx.column(this.x, this.y, 60, 320, HI, 0.6);
      sfx('armyHorns', { vol: 0.9 });
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.banner('THE KING OF THE NORTH', this.sub, 'boss');
      music.bossPhase(this.phase - 1);
      this.callT = 2.5;
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
    this.ghosts.length = 0;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 50 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 1.6) {
      // He comes to his end, and none helps him: his host melts away and leaves him alone.
      this.target = { ...MP.kneel, lean: 0.5, head: 0.3 };
      this.rate = 5;
      if (this.introT !== 7) {
        this.introT = 7;
        sfx('bossRoar', { pitch: 0.5 });
        G.ui.caption('“Yet he shall come to his end, and none shall help him.” · Daniel 11:45 (KJV)');
        for (const e of this.servants) if (!e.remove && !e.dying) { const x = (e as unknown as { x: number }).x, y = (e as unknown as { y: number }).y; fx.dust(x, y, 10, 1.4); e.remove = true; }
        this.servants.length = 0;
      }
    } else if (this.introT === 7) {
      // Michael stands up: a great light over the seas. The victory is not Elior's to take.
      this.introT = 8;
      fx.flash('#fff6dc', 0.7);
      fx.column(this.x, this.y, 140, 460, '#fff3d0', 1.6);
      fx.holyBurst(this.x, this.y - 60, 44, 2.2);
      fx.ring(this.x, this.y - 80, 20, 420, '#fff1c4', 1.2, 6);
      sfx('trumpet', { vol: 1 });
      sfx('bell', { vol: 0.8 });
      G.camera.addTrauma(0.8 * shakeScale());
      G.ui.caption('“And at that time shall Michael stand up, the great prince which standeth for the children of thy people.” · Daniel 12:1 (KJV)');
      this.target = { ...MP.kneel, lean: 0.9, head: 0.8 };
    } else if (t > 2.0 && t < 4.4) {
      this.michael = Math.min(1, (t - 1.6) / 0.6);
      this.fade = Math.max(0, 1 - (t - 2.4) / 1.6);
    } else if (t >= 4.4 && this.introT === 8) {
      this.introT = 9;
      this.fade = 0;
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
    this.scale = approach(this.scale, this.scaleTo, dt * 0.5);
    const f = this.face, S = this.scale;
    this.cape.update(this.x + f * (this.j.shBX - 2) * S, this.y + this.j.shBY * S, dt, -this.body.vx * 2 - f * 70, 420, 0.88);
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.state === 'dead') return;
    // The king's air: dust off his cloak, and embers once he magnifies himself.
    if (Math.random() < dt * (this.phase >= 3 ? 20 : 8)) {
      const hx = this.x + rand(-20, 20), hy = this.y - rand(20, 90);
      if (this.phase >= 3) fx.spawn(PK.Ember, hx, hy, rand(-10, 10), rand(-60, -20), 0.6, 2.5, 0.6, '#ff6a3a');
      else fx.spawn(PK.Dust, hx, this.y - 2, rand(-20, 20), -10, 0.6, 3, 6, '#8a7a6a', 0, 2);
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const f = this.face, S = this.scale;
    for (const m of this.marks) if (m.t < m.at) this.floorMark(ctx, m.x, this.y, 34, m.t / m.at, '#ffd27a');
    if (this.atk === 'leap' && this.step === 1) this.floorMark(ctx, this.landX, this.landY, 70, this.st / 0.9, RED);
    for (const gh of this.ghosts) {
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.scale(gh.face * gh.s, gh.s);
      ctx.globalAlpha = clamp(gh.life / 0.35, 0, 1) * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      drawHumanoid(ctx, gh.j, ghostOf(), G.time, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Michael's light, standing up over the king at the end.
    if (this.michael > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 160, 220, '#fff3d0', 0.5 * this.michael);
      for (const s of [-1, 1]) glow(ctx, this.x + s * 90, this.y - 190, 120, '#fff1c4', 0.3 * this.michael);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.fade <= 0) return;
    ctx.globalAlpha = this.fade;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 50, 80, RED, (0.15 + Math.sin(G.time * 3) * 0.04) * this.fade);
    ctx.globalCompositeOperation = 'source-over';
    drawRibbon(ctx, this.cape, 20, 26, '#5a1010', '#060408');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f * S, S);
    if (this.atk === 'whirlwind' && this.step === 1) ctx.rotate(Math.sin(this.spinA) * 0.12);
    drawHumanoid(ctx, this.j, STYLE, G.time, this.pose.rot, this.body.vx * f / S, this.body.vy / S);
    this.drawCrown(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9) * this.fade;
      drawHumanoid(ctx, this.j, flashStyle(STYLE), G.time, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // The whirlwind: a ring of the blade's light around him as he spins.
    if (this.atk === 'whirlwind' && this.step === 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(HI, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 20, 46, 12, 0, this.spinA % 6.28, (this.spinA % 6.28) + 4.2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.state === 'attack') {
      const hd = this.hand(), t = this.st;
      if ((this.atk === 'combo' && this.step === 0 && t < 0.45 / this.spd) || (this.atk === 'whirlwind' && this.step === 0) || (this.atk === 'fury' && t % (0.42 / Math.min(this.spd, 1.4) + 0.4) < 0.36)) this.glint(ctx, hd.x, hd.y - 8, RED, 1.3);
    }
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 40, 70, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** A tall northern crown over the helm: iron spikes tipped with gold. */
  private drawCrown(ctx: Ctx) {
    const j = this.j;
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    poly(ctx, [-7, -6, -6, -17, -3, -10, -1, -21, 1, -10, 4, -19, 6, -10, 8, -15, 8, -6], '#5a5e6a', '#060408', 0.6);
    for (const x of [-6, -1, 4, 8]) poly(ctx, [x - 1, -14 - (x === -1 ? 5 : 2), x + 1, -14 - (x === -1 ? 5 : 2), x, -18 - (x === -1 ? 4 : 0)], GOLD);
    poly(ctx, [-7, -6, 8, -6, 8, -8, -7, -8], GOLD);
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
    if (this.fade > 0) lighting.add(this.x, this.y - 50, 130, RED, 0.6 * this.fade, 0.4);
    for (const m of this.marks) lighting.add(m.x, this.y - 20, 60, '#ffd27a', 0.6, 0.6);
    if (this.michael > 0) lighting.add(this.x, this.y - 120, 300, '#fff3d0', this.michael, 0.95);
  }
}
