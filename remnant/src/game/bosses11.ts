// Chapter XI: the Gods of the Nations. Three of them hold the seat on the high places and come down one after
// another, each stronger than Elior: Dagon of the sea, then Molech of the fire, then Baal of the storm. They are
// not gods (Psalm 96:5); they are old powers that took the names men gave them. Each one calls its servants into
// the fight, and when Baal cries out at the last there is no voice, nor any that answered.
//
// - DAGON: a trident in three-strike combos and lunges, and the tide: a wave from each wall along the floor.
// - MOLECH: a burning blade, leaping slams that send flame along the floor, and the furnace: marks under Elior that
//   erupt as pillars of fire.
// - BAAL: storm-spear combos, a step behind Elior, crescents of lightning, and the thunder: bolts that follow him.

import { BossBase, MP } from './bosses2';
import { type HitInfo } from './entity';
import { solve, newJoints, Chain, drawRibbon, type Joints, type Pose } from '../render/skeleton';
import { glow, rgba, poly, circle, ellipse, type Ctx } from '../render/draw';
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

type God = 'dagon' | 'molech' | 'baal';
type Atk = 'combo' | 'lunge' | 'leap' | 'blink' | 'edge' | 'tide' | 'furnace' | 'thunder' | 'summon';

/** A god stands half again as tall as the Crimson Marshal. */
const S = 2.1;

interface GodDef { name: string; sub: string; color: string; hi: string; style: HumanStyle; servants: EnemyKind[]; pool: Atk[]; far: Atk[] }

const base = (o: Partial<HumanStyle>): HumanStyle => ({
  skin: '#3a3036', hair: null, hairKind: 'none', coat: '#2a2030', coatDark: '#140c18', skirt: 16, trim: '#c9a04a',
  pants: '#140c12', boots: '#1a1216', glove: '#1a1216', belt: '#140c10', plate: null, helm: 'none', eye: '#ffffff', eyeGlow: 1,
  outline: '#06040a', weapon: 'spear', offhand: 'none', bulk: 1.4, ...o,
});

const GODS: Record<God, GodDef> = {
  dagon: {
    name: 'Dagon', sub: 'God of the Philistines', color: '#5ad0d8', hi: '#c8fbff',
    style: base({ skin: '#5a7a7c', coat: '#1e4a52', coatDark: '#0e2a30', trim: '#9ad8d0', plate: { c: '#3a6a6e', dark: '#1a3a3e', hi: '#9ae8e8', tier: 2 }, eye: '#c8fbff', weapon: 'spear', weaponColor: '#c8d8d8', weaponGlow: '#5ad0d8', weaponGlowAmt: 0.5, crest: '#5ad0d8' }),
    servants: ['undying', 'knight'], pool: ['combo', 'combo', 'lunge', 'tide'], far: ['tide', 'lunge', 'leap'],
  },
  molech: {
    name: 'Molech', sub: 'God of the Fire', color: '#ff7a2a', hi: '#ffd27a',
    style: base({ skin: '#6a3a22', coat: '#4a1a10', coatDark: '#2a0a06', trim: '#e0a040', plate: { c: '#7a4a24', dark: '#3a1e0e', hi: '#ffb35a', tier: 2 }, eye: '#ffd27a', weapon: 'greatsword', weaponColor: '#c88a5a', weaponGlow: '#ff6a1a', weaponGlowAmt: 0.85, weaponFlame: true, crack: '#ff7a2a', bulk: 1.6 }),
    servants: ['priest', 'brute'], pool: ['combo', 'leap', 'furnace', 'combo'], far: ['furnace', 'leap', 'edge'],
  },
  baal: {
    name: 'Baal', sub: 'Lord of the High Places', color: '#9ab8ff', hi: '#eef4ff',
    style: base({ skin: '#3a3448', coat: '#2a1e44', coatDark: '#140c26', trim: '#e2c86a', plate: { c: '#3a3058', dark: '#1a1430', hi: '#c8d8ff', tier: 3 }, eye: '#eef4ff', weapon: 'spear', weaponColor: '#e8ecff', weaponGlow: '#9ab8ff', weaponGlowAmt: 0.9, runes: '#c8d8ff', crest: '#e2c86a' }),
    servants: ['gale', 'stalker'], pool: ['combo', 'blink', 'thunder', 'edge'], far: ['thunder', 'blink', 'edge', 'leap'],
  },
};
const ORDER: God[] = ['dagon', 'molech', 'baal'];

/** A god's flat afterimage, in its own colour. */
const ghosts = new Map<God, HumanStyle>();
function ghostOf(g: God): HumanStyle {
  let w = ghosts.get(g);
  if (!w) {
    const C = GODS[g].color, St = GODS[g].style;
    w = { ...flashStyle(St), skin: C, coat: C, coatDark: C, pants: C, boots: C, glove: C, belt: C, plate: St.plate ? { c: C, dark: C, hi: C, tier: St.plate.tier } : null, helmColor: C, eye: C, outline: C, weaponColor: C };
    ghosts.set(g, w);
  }
  return w;
}

interface Ghost { x: number; y: number; face: number; j: Joints; life: number }
/** A marked spot of floor that erupts: Molech's fire or Baal's lightning. */
interface Mark { x: number; t: number; at: number; kind: 'fire' | 'bolt'; set: Set<number> }

export class NationGods extends BossBase {
  pixelBox = [-160, -175, 160, 14] as const;
  j: Joints = newJoints();
  pose: Pose = { ...MP.planted };
  target: Pose = { ...MP.planted };
  rate = 8;
  cape: Chain;
  god: God = 'dagon';
  atk: Atk | null = null;
  lastAtk: Atk | null = null;
  step = 0;
  steps = 3;
  hidden = false;
  ghosts: Ghost[] = [];
  ghostT = 0;
  landX = 0;
  landY = 0;
  grounded = true;
  edgeN = 0;
  marks: Mark[] = [];
  /** The servants it has called and how soon it calls again. */
  servants: { remove: boolean; dying: boolean }[] = [];
  callT = 6;
  /** Fades the fallen god out and the next one in, across a change. */
  fade = 1;
  calledDown = false;

  constructor(x: number, y: number) {
    super('nation_gods', x, y, 34, 76, 2100000);
    this.name = 'Dagon';
    this.sub = GODS.dagon.sub;
    this.maxPoise = this.poise = 1200;
    this.kneelTime = 2.6;
    this.p2At = 0.66;
    this.p3At = 0.33;
    this.phaseMarks = [0.66, 0.33];
    this.face = -1;
    this.hitSound = 'hitMetal';
    this.collide = true;
    this.heavyBody = true;
    this.cape = new Chain(9, 7, x, y - 60);
    solve(this.pose, SENT_DIMS, true, this.j);
  }

  get def() { return GODS[this.god]; }
  get dmg() { return 470 * this.ngMul * this.encounterDamage * (this.phase >= 3 ? 1.25 : this.phase === 2 ? 1.12 : 1); }
  get spd() { return this.phase >= 3 ? 1.4 : this.phase === 2 ? 1.2 : 1.05; }
  visible() { return !this.hidden; }
  hurtbox() {
    const low = this.state === 'kneel' || this.state === 'dead' ? 20 : 0;
    return { x: this.x - 17, y: this.y - 76 + low, w: 34, h: 76 - low };
  }
  get cy() { return this.y - 40; }
  hand() { return { x: this.x + this.face * this.j.haFX * S, y: this.y + this.j.haFY * S }; }

  // ------------------------------------------------------------ lifecycle
  updateDormant(_dt: number) {
    this.target = { ...MP.planted, head: 0.1 + Math.sin(G.time * 0.7) * 0.04 };
  }

  updateIntro(_dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 30, y: this.y - 60 };
    if (t < 0.6) this.target = { ...MP.planted, head: 0.25 };
    else if (this.introT === 0) {
      this.introT = 1;
      this.target = { ...MP.rising };
      this.rate = 10;
      sfx('bossRoar', { pitch: 0.6 });
      fx.ring(this.x, this.y - 50, 12, 260, this.def.color, 0.8, 5);
      G.camera.addTrauma(0.5 * shakeScale());
      G.ui.banner(this.def.name.toUpperCase(), this.def.sub, 'boss');
      music.play('persia', 0.6);
      music.phase = 0;
    } else if (t > 2.2) {
      this.target = { ...MP.guard };
      this.beginFight();
      this.sub = this.def.sub;
    }
  }

  updateKneel(dt: number) {
    this.target = { ...MP.kneel, head: 0.5 + Math.sin(G.time * 3) * 0.05 };
    this.physics(dt);
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
  }

  onKneel() {
    this.atk = null;
    this.hidden = false;
    this.marks.length = 0;
    G.ui.toast(`${this.def.name} staggers: strike now.`, 'good');
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
    this.callServants(dt);
    if (this.state === 'idle') {
      this.face = sign(dx) || this.face;
      this.target = { ...MP.guard, lean: 0.2 + Math.sin(G.time * 2) * 0.03 };
      const want = dist > 90 ? sign(dx) * 85 * this.spd : dist < 40 ? -sign(dx) * 50 : 0;
      this.body.vx = approach(this.body.vx, want, 520 * dt);
      this.physics(dt);
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const pool = dist < 100 ? this.def.pool : this.def.far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.65) a = choose(pool);
    this.start(a);
  }

  private start(a: Atk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.edgeN = 0;
    this.hitSet.clear();
    this.steps = this.phase >= 3 ? 4 : 3;
    if (a !== 'blink') this.face = sign(G.world.player.x - this.x) || this.face;
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
    b.vy = Math.min(800, b.vy + 1500 * this.grav * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, true);
    this.grounded = b.onGround;
    this.x = clamp(this.x, 40, G.world.grid.w * 16 - 40);
  }

  private hit(bx: number, by: number, bw: number, bh: number, mul: number, extra: Partial<HitInfo> = {}) {
    const f = this.face;
    const x = f > 0 ? this.x + bx : this.x - bx - bw;
    return G.world.hitPlayerSide({ x, y: this.y + by, w: bw, h: bh }, { dmg: this.dmg * mul, poise: 40, kx: f * 260, ky: -200, dir: f, kind: 'melee', src: this, parryable: true, ...extra }, this.hitSet);
  }

  private swingFx(a0: number, a1: number, r = 54) {
    const hd = this.hand();
    fx.slash(hd.x, hd.y - 6, r, a0, a1, 12, this.face, this.def.hi, this.def.color, 0.2);
  }

  /** The gods are never alone: they call servants to their side, up to a few at a time. */
  private callServants(dt: number) {
    this.callT -= dt;
    this.servants = this.servants.filter((e) => !e.remove && !e.dying);
    if (this.callT <= 0 && this.state === 'idle' && this.servants.length < (this.phase >= 3 ? 5 : 4)) this.start('summon');
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body;
    switch (this.atk) {
      case 'combo': {
        // Down-stroke, rising stroke, thrust; in the last god, a fourth.
        const kind = this.step % 3;
        const tel = (this.step === 0 ? 0.5 : kind === 2 ? 0.36 : 0.3) / sp;
        const act = 0.14, rec = this.step === this.steps - 1 ? 0.6 : 0.12;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.overhead : kind === 1 ? MP.low : MP.draw;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 0 ? MP.downcut : kind === 1 ? MP.rising : MP.thrust;
          if (t - dt < tel) {
            b.vx = f * (kind === 2 ? 340 : 200);
            sfx(kind === 2 ? 'swingSpear' : 'swingHeavy', { pan: W.pan(this.x), pitch: 0.6 });
            if (kind === 0) this.swingFx(-2.6, 0.9);
            else if (kind === 1) this.swingFx(1.0, -2.4);
            else fx.streak(this.x + f * 14, this.y - 42, this.x + f * 120, this.y - 42, this.def.color, 0.2, 4);
            if (this.god === 'molech') fx.embers(this.x + f * 50, this.y - 40, 10, '#ff7a2a', 20);
          }
          if (kind === 0) this.hit(-4, -96, 92, 96, 1, { poise: 48 });
          else if (kind === 1) this.hit(-4, -104, 84, 100, 1, { poise: 48, ky: -360, kx: f * 140 });
          else this.hit(0, -58, 124, 30, 1.3, { poise: 64, kx: f * 360, ky: -180 });
        } else if (t < tel + act + rec) this.rate = 8;
        else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (this.step >= this.steps || Math.abs(dx) > 150) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'lunge': {
        const tel = 0.45 / Math.min(sp, 1.2);
        if (t < tel) {
          this.rate = 10;
          this.target = MP.draw;
          b.vx = approach(b.vx, -f * 30, 600 * dt);
          if (t < dt * 1.5) sfx('charge', { pan: W.pan(this.x), pitch: 0.9, vol: 0.6 });
        } else if (t < tel + 0.26) {
          this.rate = 30;
          this.target = MP.thrust;
          if (t - dt < tel) {
            sfx('dash', { pan: W.pan(this.x), pitch: 0.5 });
            fx.streak(this.x, this.y - 42, this.x + f * 200, this.y - 42, this.def.color, 0.25, 5);
          }
          b.vx = f * 720;
          this.hit(0, -64, 70, 42, 1.3, { poise: 64, kx: f * 340, ky: -200 });
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
        } else {
          this.rate = 8;
          b.vx = approach(b.vx, 0, 1800 * dt);
          if (t > tel + 0.26 + 0.5) this.endAttack(1.0);
        }
        this.physics(dt);
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
          b.vy = -620;
          b.vx = clamp((this.landX - this.x) / 0.82, -500, 500);
          b.onGround = false;
          sfx('jump', { pan: W.pan(this.x), pitch: 0.45 });
          fx.dust(this.x, this.y, 14, 2);
          this.target = MP.air;
          this.rate = 10;
          this.physics(dt);
        } else if (this.step === 1) {
          this.target = b.vy > 0 ? MP.plunge : MP.air;
          this.rate = b.vy > 0 ? 18 : 10;
          this.physics(dt);
          if (b.vy > 0) this.hit(-20, -72, 74, 72, 1, { poise: 50 });
          if ((this.grounded && t > tel + 0.1) || t > 2.6) {
            this.step = 2;
            this.st = tel + 0.1;
            b.vx = 0;
            this.target = MP.downcut;
            this.rate = 30;
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 1.0, vol: 0.9 });
            G.camera.addTrauma(0.6 * shakeScale());
            fx.dust(this.x, this.y, 26, 2.6);
            fx.ring(this.x, this.y - 2, 8, 140, this.def.color, 0.45, 4, 0.25);
            this.hitSet.clear();
            const d = sign(W.player.x - this.x) || 1;
            W.hitPlayerSide({ x: this.x - 100, y: this.y - 48, w: 200, h: 48 }, { dmg: this.dmg * 1.15, poise: 60, kx: d * 300, ky: -320, dir: d, kind: 'melee', src: this, unblockable: true }, this.hitSet);
            // Every god's slam runs along the floor both ways: jump it.
            for (const s of [-1, 1]) W.add(new Proj('wave', this.x + s * 26, this.y, 'enemy', this.dmg * 0.65, { vx: s * 290, life: 1.6, w: 16, h: 28, color: this.def.color, big: true }));
          }
        } else {
          this.rate = 6;
          this.physics(dt);
          if (t > tel + 0.1 + 0.6) this.endAttack(1.1);
        }
        break;
      }
      case 'edge': {
        // Crescents: the first skims the floor (jump it), the second flies at head height (dodge through it).
        const tel = 0.48 / Math.min(sp, 1.2), n = 2, cyc = tel + 0.32;
        const k = Math.floor(t / cyc), u = t - k * cyc;
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        if (k >= n) {
          this.target = MP.guard;
          if (t > n * cyc + 0.35) this.endAttack(1.1);
          break;
        }
        const low = k === 0;
        if (u < tel) {
          this.rate = 10;
          this.target = low ? MP.low : MP.overhead;
          if (u < dt * 1.5) sfx('beamCharge', { pan: W.pan(this.x), pitch: 1.4, vol: 0.5 });
        } else {
          this.rate = 30;
          this.target = low ? MP.rising : MP.downcut;
          if (this.edgeN === k) {
            this.edgeN++;
            sfx('swordWord', { pan: W.pan(this.x), pitch: 0.55 });
            this.swingFx(low ? 1.0 : -2.6, low ? -2.2 : 0.9, 60);
            W.add(new Proj('word', this.x + f * 26, low ? this.y - 12 : this.y - 50, 'enemy', this.dmg * 0.9, { vx: f * 420, life: 1.8, w: 22, h: low ? 24 : 32, color: this.def.color, poise: 40 }));
          }
        }
        break;
      }
      case 'blink': {
        // Gone in a crack of thunder; behind Elior, and the spear comes down.
        const p = W.player, hideT = 0.36 / sp;
        if (t < 0.2) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = 0;
        } else if (!this.hidden && this.step === 0) {
          this.hidden = true;
          this.step = 1;
          sfx('thunder', { pan: W.pan(this.x), vol: 0.6 });
          fx.ring(this.x, this.y - 40, 6, 80, this.def.hi, 0.3, 3);
          this.addGhost();
        } else if (this.step === 1 && t > 0.2 + hideT) {
          this.step = 2;
          this.hidden = false;
          const side = -(p.face || 1), w = W.grid.w * 16;
          let nx = p.x + side * 56;
          if (nx < 50 || nx > w - 50 || W.solidAt(nx, p.y - 30)) nx = p.x - side * 56;
          this.x = clamp(nx, 50, w - 50);
          this.y = p.body.onGround ? p.y : this.y;
          b.vx = b.vy = 0;
          this.face = sign(p.x - this.x) || -side;
          sfx('dash', { pan: W.pan(this.x), pitch: 1.4, vol: 0.7 });
          fx.column(this.x, this.y, 30, 200, this.def.hi, 0.35);
          this.target = MP.overhead;
          this.rate = 30;
          this.st = 0.2 + hideT;
        } else if (this.step === 2) {
          const t2 = t - (0.2 + hideT);
          if (t2 < 0.28) { this.target = MP.overhead; this.rate = 16; }
          else if (t2 < 0.42) {
            this.target = MP.downcut;
            this.rate = 30;
            if (t2 - dt < 0.28) { sfx('swingHeavy', { pan: W.pan(this.x), pitch: 0.7 }); this.swingFx(-2.6, 0.9, 58); b.vx = this.face * 180; }
            this.hit(-4, -96, 92, 96, 1.2, { poise: 56 });
          } else if (t2 > 0.95) this.endAttack(0.9);
        }
        this.physics(dt);
        break;
      }
      case 'tide': {
        // Dagon lifts the trident and the sea answers from both walls: a wave along the floor from each side.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = t < 0.7 ? MP.rising : MP.planted;
        if (t < dt * 1.5) { sfx('splash', { vol: 0.8 }); sfx('waveWhoosh', { vol: 0.7 }); sfx('beamCharge', { pitch: 0.6, vol: 0.5 }); }
        const w = W.grid.w * 16;
        if (t >= 0.7 && this.step === 0) {
          this.step = 1;
          G.camera.addTrauma(0.35 * shakeScale());
          for (const [x, s] of [[90, 1], [w - 90, -1]] as const) W.add(new Proj('wave', x, this.y, 'enemy', this.dmg * 0.8, { vx: s * 250, life: 4, w: 20, h: 34, color: '#5ad0d8', big: true }));
        }
        // In the later gods' company the sea comes twice.
        if (this.phase >= 2 && t >= 1.9 && this.step === 1) {
          this.step = 2;
          for (const [x, s] of [[90, 1], [w - 90, -1]] as const) W.add(new Proj('wave', x, this.y, 'enemy', this.dmg * 0.8, { vx: s * 300, life: 4, w: 20, h: 34, color: '#5ad0d8', big: true }));
        }
        if (t > 2.4) this.endAttack(1.2);
        break;
      }
      case 'furnace': {
        // Molech marks the ground under Elior and either side of him; each mark erupts as a pillar of fire.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = t < 0.5 ? MP.overhead : MP.downcut;
        const rounds = this.phase >= 3 ? 3 : 2;
        const k = Math.min(rounds, Math.floor(t / 0.9));
        if (k > this.step - 1 && this.step < rounds && t >= this.step * 0.9) {
          const x = W.player.x;
          this.step++;
          sfx('pillarFire', { vol: 0.5, pan: W.pan(x) });
          for (const o of [0, -170, 170]) this.mark(x + o, 'fire', 1.0);
        }
        if (t > rounds * 0.9 + 1.2) this.endAttack(1.2);
        break;
      }
      case 'thunder': {
        // Baal calls lightning in a chain: each bolt marks where Elior stands now, and strikes a beat later.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        const n = this.phase >= 3 ? 6 : 4;
        if (this.step < n && t >= this.step * 0.42) {
          this.step++;
          this.mark(W.player.x, 'bolt', 0.72);
          if (this.step === 1) sfx('thunder', { vol: 0.7 });
        }
        if (t > n * 0.42 + 1.0) this.endAttack(1.1);
        break;
      }
      case 'summon': {
        // The god calls its servants: they rise out of the ground at the edges of the seat.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        if (t >= 0.6 && this.step === 0) {
          this.step = 1;
          this.callT = this.phase >= 3 ? 9 : 12;
          sfx('bossRoar', { pitch: 0.8, vol: 0.6 });
          G.ui.toast(`${this.def.name} calls his servants`, 'warn');
          const w = W.grid.w * 16, n = this.phase >= 3 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const x = i % 2 ? w - 120 - rand(0, 80) : 120 + rand(0, 80);
            const e = W.spawnEnemy(this.def.servants[i % this.def.servants.length], x, this.y);
            this.servants.push(e);
            fx.column(x, this.y, 26, 160, this.def.color, 0.6);
            fx.dust(x, this.y, 10, 1.4);
          }
        }
        if (t > 1.3) this.endAttack(0.8);
        break;
      }
    }
  }

  private mark(x: number, kind: 'fire' | 'bolt', delay: number) {
    const w = G.world.grid.w * 16;
    this.marks.push({ x: clamp(x, 60, w - 60), t: 0, at: delay, kind, set: new Set() });
  }

  private tickMarks(dt: number) {
    const W = G.world;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      const was = m.t;
      m.t += dt;
      if (m.t < m.at) continue;
      if (was < m.at) {
        if (m.kind === 'fire') { sfx('pillarFire', { pan: W.pan(m.x), vol: 0.7 }); fx.column(m.x, this.y, 46, 230, '#ff7a2a', 0.5); fx.embers(m.x, this.y - 30, 20, '#ffb347', 30); }
        else { sfx('thunder', { pan: W.pan(m.x), vol: 0.8 }); fx.column(m.x, this.y, 22, 320, '#eef4ff', 0.25); fx.flash('#c8d8ff', 0.12); fx.ring(m.x, this.y - 2, 6, 60, '#9ab8ff', 0.3, 3); }
        G.camera.addTrauma(0.2 * shakeScale());
      }
      if (m.t < m.at + 0.32) {
        const half = m.kind === 'fire' ? 30 : 18;
        W.hitPlayerSide({ x: m.x - half, y: this.y - 240, w: half * 2, h: 240 }, { dmg: this.dmg * (m.kind === 'fire' ? 0.95 : 0.85), poise: 40, kx: 0, ky: -260, dir: 0, kind: 'proj', src: this, unblockable: true, parryable: false }, m.set);
      } else this.marks.splice(i, 1);
    }
  }

  private addGhost() {
    this.ghostT = 0.05;
    this.ghosts.push({ x: this.x, y: this.y, face: this.face, j: { ...this.j }, life: 0.35 });
    if (this.ghosts.length > 6) this.ghosts.shift();
  }

  // ------------------------------------------------------------ the gods, one after another
  beginTransition() { this.change(2); }
  enterPhase3() { this.change(3); }

  /** The god in front of Elior falls on its face, and the next comes down to take its place. */
  private change(phase: number) {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.hidden = false;
    this.phase = phase;
    this.introT = 0;
    this.invuln = 999;
    this.marks.length = 0;
    this.maxPoise = this.poise = phase >= 3 ? 1400 : 1300;
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
    const fallen = this.god;
    if (t < 1.2) {
      // The god pitches forward onto its face.
      this.target = { ...MP.kneel, lean: 0.9, head: 0.8 };
      this.rate = 4;
      if (this.introT === 0) {
        this.introT = 1;
        sfx('bossSlam', { pitch: 0.5 });
        G.camera.addTrauma(0.5 * shakeScale());
        G.ui.caption(fallen === 'dagon' ? '“Behold, Dagon was fallen upon his face to the earth.” · 1 Samuel 5:3 (KJV)' : 'The furnace goes cold. Molech falls, and does not rise.');
      }
      this.fade = 1 - t / 1.2 * 0.85;
    } else if (this.introT === 1) {
      // The next god comes down where the last one fell.
      this.introT = 2;
      this.god = ORDER[Math.min(2, this.phase - 1)];
      this.name = this.def.name;
      this.sub = this.def.sub;
      this.pose = { ...MP.crouch };
      this.target = { ...MP.rising };
      this.rate = 10;
      fx.flash(this.def.color, 0.35);
      fx.column(this.x, this.y, 60, 320, this.def.hi, 0.7);
      fx.ring(this.x, this.y - 40, 10, 300, this.def.color, 0.9, 6);
      sfx('bossRoar', { pitch: this.god === 'molech' ? 0.5 : 0.75 });
      if (this.god === 'molech') sfx('pillarFire'); else sfx('thunder');
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.banner(this.def.name.toUpperCase(), this.def.sub, 'boss');
      G.ui.caption(null);
      music.bossPhase(this.phase - 1);
      this.callT = 3;
    } else if (t < 2.4) this.fade = Math.min(1, (t - 1.2) / 0.6);
    else {
      this.fade = 1;
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.8;
      this.invuln = 0;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.ui.bossBar(this.name, this.sub);
      G.camera.focus = null;
    }
  }

  die() {
    super.die();
    this.atk = null;
    this.hidden = false;
    this.marks.length = 0;
    this.ghosts.length = 0;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 50 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 1.4) {
      // Baal cries out to the sky.
      this.target = { ...MP.rising, head: -0.5 };
      this.rate = 5;
      if (this.introT !== 7) { this.introT = 7; sfx('bossRoar', { pitch: 0.55 }); G.ui.caption('“But there was no voice, nor any that answered.” · 1 Kings 18:26 (KJV)'); }
    } else if (this.introT === 7) {
      // Fire out of a clear sky: the victory is not Elior's to take.
      this.introT = 8;
      this.calledDown = true;
      fx.flash('#fff6dc', 0.7);
      fx.column(this.x, this.y, 120, 420, '#fff3d0', 1.4);
      fx.holyBurst(this.x, this.y - 50, 40, 2);
      fx.embers(this.x, this.y - 30, 60, '#ffd27a', 60);
      sfx('pillarFire', { vol: 1 });
      sfx('thunder', { vol: 0.8 });
      G.camera.addTrauma(1 * shakeScale());
      G.ui.caption('“Then the fire of the LORD fell.” · 1 Kings 18:38 (KJV)');
      this.target = { ...MP.kneel, lean: 0.9, head: 0.8 };
    } else if (t > 2.2 && t < 4) this.fade = Math.max(0, 1 - (t - 2.2) / 1.4);
    else if (t >= 4 && this.introT === 8) {
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
    const f = this.face;
    this.cape.update(this.x + f * (this.j.shBX - 2) * S, this.y + this.j.shBY * S, dt, -this.body.vx * 2 - f * 70, 420, 0.88);
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.state === 'dead' || this.hidden) return;
    // Each god's own air: sea spray, embers, sparks.
    if (Math.random() < dt * 18) {
      const hx = this.x + rand(-20, 20), hy = this.y - rand(20, 90);
      if (this.god === 'dagon') fx.spawn(PK.Mote, hx, hy, rand(-10, 10), rand(-30, -10), 0.8, 3, 1, '#9ae8e8');
      else if (this.god === 'molech') fx.spawn(PK.Flame, hx, hy, rand(-10, 10), rand(-70, -30), 0.4, 4, 0.6, '#ff6a1a', -60, 1);
      else fx.spawn(PK.Spark, hx, hy, rand(-60, 60), rand(-60, 60), 0.2, 1.5, 0.3, '#c8d8ff', 0, 2);
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const f = this.face, d = this.def, style = d.style;
    // Telegraphs on the floor: fire marks and lightning marks.
    for (const m of this.marks) if (m.t < m.at) this.floorMark(ctx, m.x, this.y, m.kind === 'fire' ? 34 : 22, m.t / m.at, m.kind === 'fire' ? '#ff7a2a' : '#c8d8ff');
    if (this.atk === 'leap' && this.step === 1) this.floorMark(ctx, this.landX, this.landY, 70, this.st / 0.9, d.color);
    for (const gh of this.ghosts) {
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.scale(gh.face * S, S);
      ctx.globalAlpha = clamp(gh.life / 0.35, 0, 1) * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      drawHumanoid(ctx, gh.j, ghostOf(this.god), G.time, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.hidden || this.fade <= 0) return;
    ctx.globalAlpha = this.fade;
    // A god's light: it stands in its own glow.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 50, 80, d.color, (0.2 + Math.sin(G.time * 4) * 0.05) * this.fade);
    ctx.globalCompositeOperation = 'source-over';
    drawRibbon(ctx, this.cape, 18, 24, this.god === 'dagon' ? '#1e4a52' : this.god === 'molech' ? '#5a1a0c' : '#2a1e44', '#06040a');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f * S, S);
    drawHumanoid(ctx, this.j, style, G.time, this.pose.rot, this.body.vx * f / S, this.body.vy / S);
    this.drawHead(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9) * this.fade;
      drawHumanoid(ctx, this.j, flashStyle(style), G.time, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.state === 'attack') {
      const hd = this.hand(), t = this.st;
      if ((this.atk === 'combo' && this.step === 0 && t < 0.45 / this.spd) || (this.atk === 'lunge' && t < 0.42) || (this.atk === 'edge' && t % (0.48 / Math.min(this.spd, 1.2) + 0.32) < 0.4)) this.glint(ctx, hd.x, hd.y - 8, d.color, 1.3);
      if (this.atk === 'blink' && this.step === 2 && t - (0.2 + 0.36 / this.spd) < 0.26) this.glint(ctx, this.x, this.y - 80, d.hi, 1.5);
    }
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 40, 70, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** What makes each god itself: Dagon's fish-hood and fin, Molech's bull horns, Baal's storm crown. */
  private drawHead(ctx: Ctx) {
    const j = this.j;
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    if (this.god === 'dagon') {
      // A great fish's head worn as a hood, its jaw over the brow, and a fin down the back.
      ellipse(ctx, -1, -4, 9, 6.5, -0.2, '#2e6a6e');
      poly(ctx, [6, -6, 12, -3, 6, 0], '#9ad8d0', '#06040a', 0.5);
      circle(ctx, 3, -7, 1.4, '#c8fbff');
      circle(ctx, 3, -7, 0.6, '#06040a');
      for (let i = 0; i < 4; i++) poly(ctx, [-6 - i * 2.5, -8 + i * 3, -11 - i * 2.5, -9 + i * 3, -7 - i * 2.5, -5 + i * 3], '#5ad0d8', '#06040a', 0.4);
    } else if (this.god === 'molech') {
      // Bull horns, broad and swept forward, glowing at the tips.
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 3, -5);
        ctx.quadraticCurveTo(sd * 13, -6, sd * 12, -16);
        ctx.lineTo(sd * 9, -12);
        ctx.quadraticCurveTo(sd * 9, -6, sd * 2, -2);
        ctx.closePath();
        ctx.fillStyle = sd > 0 ? '#e0d0b0' : '#9a8a70';
        ctx.fill();
        ctx.strokeStyle = '#06040a'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, sd * 12, -16, 4, '#ff7a2a', 0.6 + Math.sin(G.time * 6) * 0.2);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // A tall horned crown of gold, crackling.
      poly(ctx, [-6, -6, -4, -18, -1, -10, 1, -22, 3, -10, 6, -18, 7, -6], '#e2c86a', '#06040a', 0.6);
      poly(ctx, [-5, -7, 6, -7, 5, -9, -4, -9], '#9a7a2a');
      if (Math.random() < 0.5) {
        ctx.strokeStyle = rgba('#eef4ff', 0.9);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(1, -22); ctx.lineTo(1 + rand(-4, 4), -26); ctx.lineTo(1 + rand(-6, 6), -30);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawOverlay(ctx: Ctx) {
    if (this.state !== 'kneel') return;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.7 + Math.sin(G.time * 10) * 0.3, y = this.y - 92;
    glow(ctx, this.x, y, 16, '#ffe6a8', 0.7 * p);
    ctx.strokeStyle = rgba('#fff6dc', p);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.x, y - 8); ctx.lineTo(this.x + 6, y); ctx.lineTo(this.x, y + 8); ctx.lineTo(this.x - 6, y); ctx.closePath();
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (this.hidden || this.fade <= 0) return;
    lighting.add(this.x, this.y - 50, 140, this.def.color, 0.7 * this.fade, 0.5);
    for (const m of this.marks) lighting.add(m.x, this.y - 20, 60, m.kind === 'fire' ? '#ff7a2a' : '#c8d8ff', 0.6, 0.6);
    if (this.calledDown) lighting.add(this.x, this.y - 60, 240, '#fff3d0', 1, 0.9);
  }
}
