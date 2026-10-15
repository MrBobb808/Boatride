// The corrupted: Husks, Gloom Hounds, Hollow Archers, Fallen Sentinels and
// Veil Wisps. Each has a readable telegraph, a stagger state that opens an
// execution, and its own sound signature.

import { Entity, type HitInfo } from './entity';
import { moveBody, groundAhead, wallAhead, hazardAhead, los } from './physics';
import { Animator, solve, newJoints, BASE_POSE, Chain, drawRibbon, type Clip, type Joints, type Pose, type RigDims } from '../render/skeleton';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { glow, rgba, circle, poly, limb, ellipse, limbShaded, limbStroke, lineGrad, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign, choose, easeOutCubic, easeInQuad, easeOutBack, easeInOutSine } from '../core/math';
import { Proj } from './projectiles';
import type { EnemyKind } from './tiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';

export interface EnemyStats {
  hp: number;
  dmg: number;
  poise: number;
  xp: number;
  silver: [number, number];
  name: string;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  husk: { hp: 46, dmg: 12, poise: 18, xp: 12, silver: [2, 5], name: 'Veil Husk' },
  hound: { hp: 40, dmg: 11, poise: 14, xp: 15, silver: [2, 5], name: 'Gloom Hound' },
  archer: { hp: 42, dmg: 13, poise: 16, xp: 18, silver: [3, 6], name: 'Hollow Archer' },
  sentinel: { hp: 170, dmg: 20, poise: 60, xp: 55, silver: [8, 14], name: 'Fallen Sentinel' },
  wisp: { hp: 30, dmg: 10, poise: 10, xp: 16, silver: [2, 4], name: 'Veil Wisp' },
  brute: { hp: 420, dmg: 26, poise: 130, xp: 85, silver: [12, 20], name: 'Ironbound Brute' },
  bulwark: { hp: 280, dmg: 18, poise: 110, xp: 64, silver: [10, 16], name: 'Shieldwall Bulwark' },
  knight: { hp: 210, dmg: 22, poise: 70, xp: 70, silver: [10, 16], name: 'Crimson Knight' },
};

export const CORRUPT = { glow: '#b04cff', eye: '#ff3355', outline: '#07050a' };

// ---------------------------------------------------------------- shared rig data

const k = (t: number, p: Partial<Pose>, ease?: (x: number) => number) => ({ t, p, ease });

function walkClip(base: Pose, dur: number, amp: number, lean = 0.1): Clip {
  return {
    dur, loop: true, base, steps: [0.25, 0.75],
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return {
        lean: base.lean + lean + Math.sin(p * 2) * 0.03,
        fTh: base.fTh * 0.3 + amp * s, fSh: -0.2 - 0.9 * amp * Math.max(0, Math.cos(p - 0.5)),
        bTh: base.bTh * 0.3 - amp * s, bSh: -0.2 - 0.9 * amp * Math.max(0, Math.cos(p + Math.PI - 0.5)),
        bUA: base.bUA + 0.25 * s * amp, fUA: base.fUA - 0.2 * s * amp,
      };
    },
  };
}
function idleClip(base: Pose, sway = 0.03): Clip {
  return { dur: 2.4, loop: true, base, fn: (u) => ({ lean: base.lean + Math.sin(u * Math.PI * 2) * sway, y: Math.sin(u * Math.PI * 2) * 0.4 }) };
}

export const HUSK_DIMS: RigDims = { torso: 11, head: 4.2, neck: 1.2, upperArm: 7.2, foreArm: 7.2, thigh: 7.6, shin: 7.6, shoulderSpread: 1.3, hipSpread: 1.4 };
const HUSK_BASE: Pose = { ...BASE_POSE, lean: 0.55, head: 0.3, bUA: 0.5, bFA: 0.3, fUA: 0.75, fFA: 0.35, wpn: 0.1, bTh: 0.05, bSh: -0.55, fTh: 0.35, fSh: -0.65 };
const HUSK_CLIPS: Record<string, Clip> = {
  idle: idleClip(HUSK_BASE, 0.06),
  walk: { ...walkClip(HUSK_BASE, 1.0, 0.45, 0.05), fn: (u) => {
    const p = u * Math.PI * 2, s = Math.sin(p);
    return { lean: 0.6 + Math.sin(p) * 0.08, head: 0.3 + Math.sin(p * 2) * 0.1, fTh: 0.2 + 0.4 * s, fSh: -0.4 - 0.6 * Math.max(0, Math.cos(p - 0.5)), bTh: -0.4 * s, bSh: -0.4 - 0.6 * Math.max(0, Math.cos(p + Math.PI - 0.5)), fUA: 0.8 - 0.25 * s, bUA: 0.5 + 0.25 * s };
  } },
  attack: { dur: 1, base: HUSK_BASE, keys: [
    k(0, {}), k(0.4, { lean: 0.05, head: -0.1, fUA: 2.7, fFA: 0.6, bUA: 2.3, bFA: 0.5, fTh: 0.2, fSh: -0.3, bTh: -0.3 }, easeOutCubic),
    k(0.5, { lean: 0.15, fUA: 2.8, bUA: 2.4 }),
    k(0.62, { lean: 0.95, head: 0.2, fUA: 0.6, fFA: 0.1, bUA: 0.4, bFA: 0.2, fTh: 0.8, fSh: -0.6, bTh: -0.6, bSh: -0.2 }, easeInQuad),
    k(1, {}, easeInOutSine),
  ] },
  hurt: { dur: 0.25, base: HUSK_BASE, keys: [k(0, { lean: 0.1, head: 0.6, fUA: 1.6, bUA: 1.2 }), k(1, {}, easeOutCubic)] },
  stagger: { dur: 0.5, base: HUSK_BASE, keys: [k(0, { lean: 0.2, head: 0.6 }), k(1, { lean: 1.05, head: 0.7, fUA: 0.1, bUA: 0.0, fTh: 1.3, fSh: -2.3, bTh: -0.2, bSh: -1.8 }, easeOutCubic)] },
  death: { dur: 0.8, base: HUSK_BASE, keys: [k(0, { lean: 0.2, head: 0.5 }), k(1, { lean: 1.4, head: 0.8, fTh: 1.4, fSh: -2.4, bTh: -0.1, bSh: -1.9, rot: 0.4, y: 3 }, easeInQuad)] },
};

export const SENT_DIMS: RigDims = { torso: 14, head: 4.8, neck: 1.4, upperArm: 8, foreArm: 7.6, thigh: 9.2, shin: 9.2, shoulderSpread: 1.8, hipSpread: 1.8 };
export const SENT_BASE: Pose = { ...BASE_POSE, lean: 0.12, bUA: 1.3, bFA: 0.45, fUA: 0.35, fFA: 0.95, wpn: 0.85, bTh: -0.28, bSh: -0.18, fTh: 0.38, fSh: -0.38 };
export const SENT_CLIPS: Record<string, Clip> = {
  idle: idleClip(SENT_BASE, 0.02),
  walk: walkClip(SENT_BASE, 0.95, 0.42, 0.05),
  run: walkClip(SENT_BASE, 0.55, 0.65, 0.15),
  guard: { dur: 0.3, base: SENT_BASE, keys: [k(0, { bUA: 1.55, bFA: 0.25, lean: 0.18, sq: 0.97 }), k(1, { bUA: 1.55, bFA: 0.25, lean: 0.18, sq: 0.97 })] },
  slash: { dur: 1, base: SENT_BASE, keys: [
    k(0, {}), k(0.42, { fUA: 3.15, fFA: 0.4, wpn: 0.3, lean: -0.12, bUA: 1.0, fTh: 0.2, bTh: -0.4 }, easeOutCubic),
    k(0.5, { fUA: 3.25, fFA: 0.45, lean: -0.15 }),
    k(0.6, { fUA: 0.75, fFA: 0.1, wpn: 0.0, lean: 0.45, fTh: 0.75, fSh: -0.6, bTh: -0.65, bSh: -0.2 }, easeInQuad),
    k(1, {}, easeInOutSine),
  ] },
  bash: { dur: 1, base: SENT_BASE, keys: [
    k(0, {}), k(0.4, { bUA: 0.7, bFA: 1.2, lean: -0.15, fTh: 0.1, bTh: -0.5, sq: 0.96 }, easeOutCubic),
    k(0.55, { bUA: 1.6, bFA: 0.0, lean: 0.5, fTh: 0.9, fSh: -0.6, bTh: -0.7, bSh: -0.1 }, easeOutBack),
    k(1, {}, easeInOutSine),
  ] },
  slam: { dur: 1, base: SENT_BASE, keys: [
    k(0, {}), k(0.3, { sq: 0.88, lean: 0.3, fUA: 3.2, fFA: 0.3, wpn: 0.2, bUA: 2.0, fTh: 0.9, fSh: -1.5, bTh: -0.2, bSh: -1.2 }, easeOutCubic),
    k(0.55, { sq: 1.05, lean: -0.1, fUA: 3.3, fFA: 0.2, wpn: 0.2, fTh: 0.8, fSh: -1.3, bTh: 0.4, bSh: -1.2 }),
    k(0.7, { lean: 0.8, fUA: 0.4, fFA: 0.1, wpn: -0.5, bUA: 0.9, fTh: 1.2, fSh: -1.9, bTh: -0.3, bSh: -1.6, sq: 0.9 }, easeInQuad),
    k(1, {}, easeInOutSine),
  ] },
  hurt: { dur: 0.25, base: SENT_BASE, keys: [k(0, { lean: -0.15, head: 0.3 }), k(1, {}, easeOutCubic)] },
  stagger: { dur: 0.6, base: SENT_BASE, keys: [k(0, { lean: -0.3, head: 0.4, bUA: 0.2 }), k(1, { lean: 0.7, head: 0.5, bUA: 0.3, bFA: 0.2, fUA: 0.2, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9 }, easeOutCubic)] },
  death: { dur: 1.0, base: SENT_BASE, keys: [k(0, { lean: -0.3, head: 0.4 }), k(0.4, { lean: 0.6, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.2, fUA: 0.2 }, easeOutCubic), k(1, { lean: 0.75, head: 0.6, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.1, fUA: 0.1, wpn: -0.6 })] },
  kneel: { dur: 0.6, base: SENT_BASE, keys: [k(0, {}), k(1, { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.3, fUA: 0.2, wpn: -0.4 }, easeOutCubic)] },
  rise: { dur: 0.8, base: SENT_BASE, keys: [k(0, { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.3, fUA: 0.2 }), k(1, { head: -0.2, fUA: 2.9, fFA: 0.2, wpn: 0.1 }, easeOutCubic)] },
};

export const ARCH_DIMS: RigDims = { torso: 12, head: 4.3, neck: 1.4, upperArm: 7, foreArm: 6.8, thigh: 8, shin: 8.2, shoulderSpread: 1.3, hipSpread: 1.4 };
export const ARCH_BASE: Pose = { ...BASE_POSE, lean: 0.06, bUA: 0.9, bFA: 0.3, off: 0.4, fUA: 0.3, fFA: 0.5, bTh: -0.2, bSh: -0.15, fTh: 0.25, fSh: -0.3 };
export const ARCH_CLIPS: Record<string, Clip> = {
  idle: idleClip(ARCH_BASE, 0.02),
  walk: walkClip(ARCH_BASE, 0.7, 0.55, 0.05),
  back: { ...walkClip(ARCH_BASE, 0.55, 0.6, -0.15) },
  draw: { dur: 1, base: ARCH_BASE, keys: [
    k(0, { bUA: 1.5, bFA: 0.05, off: 0.02, fUA: 1.3, fFA: 0.5, lean: 0.0 }),
    k(1, { bUA: 1.5, bFA: 0.05, off: 0.02, fUA: 1.15, fFA: 1.95, lean: -0.05, fTh: 0.4, fSh: -0.3, bTh: -0.4 }, easeOutCubic),
  ] },
  release: { dur: 0.4, base: ARCH_BASE, keys: [
    k(0, { bUA: 1.5, bFA: 0.05, off: 0.02, fUA: 0.6, fFA: 0.6, lean: -0.12, fTh: 0.4, fSh: -0.3, bTh: -0.4 }),
    k(1, {}, easeInOutSine),
  ] },
  hurt: { dur: 0.25, base: ARCH_BASE, keys: [k(0, { lean: -0.3, head: 0.4 }), k(1, {}, easeOutCubic)] },
  stagger: { dur: 0.5, base: ARCH_BASE, keys: [k(0, { lean: -0.3 }), k(1, { lean: 0.8, head: 0.6, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.2, fUA: 0.1 }, easeOutCubic)] },
  death: { dur: 0.9, base: ARCH_BASE, keys: [k(0, { lean: -0.3 }), k(1, { lean: 1.3, head: 0.8, fTh: 1.4, fSh: -2.4, bTh: -0.1, bSh: -1.9, rot: 0.35, y: 3 }, easeInQuad)] },
  kneel: { dur: 0.6, base: ARCH_BASE, keys: [k(0, {}), k(1, { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.3, fUA: 0.2 }, easeOutCubic)] },
  hop: { dur: 0.4, base: ARCH_BASE, keys: [k(0, { fTh: 1.0, fSh: -1.6, bTh: 0.3, bSh: -1.2, lean: -0.2 }), k(1, { fTh: 0.6, fSh: -1.0, bTh: 0.1, bSh: -0.8 })] },
};

// ---------------------------------------------------------------- styles (corrupted & echo palettes)

export type Palette = 'corrupt' | 'echo';

export function sentinelStyle(pal: Palette, stage = 0): HumanStyle {
  if (pal === 'corrupt') {
    return {
      skin: '#3a3340', hair: null, hairKind: 'none', coat: '#2a1d33', coatDark: '#1a1222', skirt: 11, trim: '#4a2a5a',
      pants: '#1e1824', boots: '#241f2a', glove: '#2b2730', belt: '#16121a',
      plate: { c: '#2d2933', dark: '#18151c', hi: '#5a4a6a', tier: 2 }, helm: 'sentinel', helmColor: '#25222b', helmTrim: '#4a3a5a',
      eye: CORRUPT.eye, eyeGlow: 0.9, outline: CORRUPT.outline, weapon: 'blade', weaponColor: '#77707e', weaponGlow: CORRUPT.glow, weaponGlowAmt: 0.25,
      offhand: 'tower', offColor: '#2b2730', offTrim: '#5b2a6e', crack: CORRUPT.glow, bulk: 1.35,
    };
  }
  const gold = '#e2b85a';
  const base: HumanStyle = {
    skin: '#2a2420', hair: null, hairKind: 'none', coat: stage >= 1 ? '#e8dcc0' : '#2a2420', coatDark: stage >= 1 ? '#c8b894' : '#1a1612', skirt: 11, trim: gold,
    pants: '#1a1714', boots: '#1c1a1f', glove: '#1c1a1f', belt: '#14110e',
    plate: { c: stage >= 1 ? '#1c1a1f' : '#262228', dark: '#0e0d10', hi: stage >= 2 ? '#ffe08a' : gold, tier: stage >= 1 ? 2 : 1 },
    helm: 'sentinel', helmColor: '#1c1a1f', helmTrim: gold, eye: '#ffffff', eyeGlow: 0.9, outline: '#0a0806',
    weapon: 'blade', weaponColor: '#e8e4dc', weaponGlow: '#fff3c4', weaponGlowAmt: 0.3 + stage * 0.3, weaponFlame: stage >= 2,
    offhand: stage === 0 ? 'buckler' : stage === 1 ? 'kite' : 'blazing', offColor: '#1c1a1f', offTrim: gold,
    crack: stage === 0 ? '#ffd27a' : null, runes: '#ffe6a8', bulk: 1.35, crest: stage >= 2 ? '#fff3c4' : stage === 1 ? '#e2b85a' : null,
  };
  return base;
}

export function archerStyle(pal: Palette, stage = 0, elite = false): HumanStyle {
  if (pal === 'corrupt') {
    return {
      skin: '#3a3340', hair: null, hairKind: 'none', coat: elite ? '#3a1d3a' : '#2e2436', coatDark: '#1e1626', skirt: 7, trim: elite ? '#8a3aa0' : null,
      pants: '#1e1824', boots: '#221c26', glove: '#2a2230', belt: '#16121a', plate: null, helm: 'archer', helmColor: elite ? '#2e1a30' : '#241c2c', helmTrim: elite ? '#b04cff' : undefined,
      eye: CORRUPT.eye, eyeGlow: 0.9, outline: CORRUPT.outline, weapon: 'none', offhand: 'bow', offColor: '#3a2a22', offTrim: '#c890ff',
      weaponGlow: CORRUPT.glow, crack: CORRUPT.glow, bulk: elite ? 1.1 : 1,
    };
  }
  const gold = '#e2b85a';
  return {
    skin: '#2a2420', hair: null, hairKind: 'none', coat: stage >= 1 ? '#e8dcc0' : '#2c2622', coatDark: stage >= 1 ? '#c8b894' : '#1a1612', skirt: 7, trim: gold,
    pants: '#1a1714', boots: '#1c1a1f', glove: '#1c1a1f', belt: '#14110e', plate: stage >= 2 ? { c: '#1c1a1f', dark: '#0e0d10', hi: '#ffe08a', tier: 1 } : null,
    helm: stage >= 2 ? 'visor' : 'archer', helmColor: stage >= 2 ? '#1c1a1f' : '#2a2420', helmTrim: gold, eye: '#ffffff', eyeGlow: 0.9, outline: '#0a0806',
    weapon: 'none', offhand: 'bow', offColor: '#d6b062', offTrim: '#fff3c4', weaponGlow: '#ffe6a8', crack: stage === 0 ? '#ffd27a' : null, runes: '#ffe6a8', bulk: 1,
    crest: stage >= 2 ? '#fff3c4' : null,
  };
}

export const HUSK_STYLE = (variant: number): HumanStyle => ({
  skin: '#3e3644', hair: null, hairKind: 'none', coat: variant % 2 ? '#2e2228' : '#2a2230', coatDark: '#1a141e', skirt: 7, trim: null,
  pants: '#221c26', boots: '#1e1a20', glove: '#3e3644', belt: variant % 2 ? '#2a1e18' : null,
  plate: variant === 2 ? { c: '#4a4248', dark: '#2a2428', hi: '#6a5a62', tier: 1 } : null, helm: 'husk', helmColor: '#1e1824',
  eye: CORRUPT.eye, eyeGlow: 0.9, outline: CORRUPT.outline, weapon: 'claws', offhand: 'none', crack: CORRUPT.glow, bulk: 0.95,
});

// ---------------------------------------------------------------- base enemy

export abstract class Enemy extends Entity {
  kind: EnemyKind;
  stats: EnemyStats;
  anim: Animator | null = null;
  pose: Pose = { ...BASE_POSE };
  j: Joints = newJoints();
  dims: RigDims | null = null;
  style: HumanStyle | null = null;
  state = 'idle';
  st = 0;
  aggro = false;
  poise: number;
  maxPoise: number;
  poiseDelay = 0;
  attackCd = 1;
  elite: string | null;
  deathT = 0;
  hpBarT = 0;
  spawnX: number;
  spawnY: number;
  dmg: number;
  hurtT = 0;
  airborne = false;
  superArmor = false;
  target: Entity | null = null;
  hitSet = new Set<number>();
  purifiable = false;
  awaitingPurify = false;
  groanT = rand(3, 8);
  def: { x: number; y: number };
  scale = 1;
  /** Broken tanks can be launched and juggled. */
  juggleWhenBroken = false;
  /** Damage taken while staggered/broken. */
  brokenMul = 1.25;
  /** Tanks survive executions (they take a heavy chunk instead). */
  tank = false;
  execUsed = false;

  constructor(kind: EnemyKind, x: number, y: number, w: number, h: number, elite: string | null) {
    super(x, y, w, h);
    this.kind = kind;
    this.team = 'enemy';
    this.stats = ENEMY_STATS[kind];
    const ng = 1 + (G.save?.ng ?? 0) * 0.6;
    const em = elite ? 2.0 : 1;
    this.maxHp = this.hp = Math.round(this.stats.hp * ng * em);
    this.dmg = this.stats.dmg * ng * (elite ? 1.15 : 1);
    this.maxPoise = this.poise = this.stats.poise * (elite ? 1.6 : 1);
    this.elite = elite;
    this.purifiable = !!elite;
    this.spawnX = x;
    this.spawnY = y;
    this.def = { x, y };
    this.name = elite ? 'Elite ' + this.stats.name : this.stats.name;
    this.layer = 6;
    this.isFoe = true;
  }

  executable() {
    return this.staggered > 0 && !this.dying && !this.execUsed;
  }

  setState(s: string, clip?: string, blend = 0.08, speed = 1) {
    this.state = s;
    this.st = 0;
    if (clip && this.anim) this.anim.play(clip, blend, true, speed);
  }

  pickTarget(range: number): Entity | null {
    return G.world.targetFor(this, range);
  }

  canSee(e: Entity) {
    return los(G.world.grid, G.world.solid, this.x, this.y - this.body.h * 0.7, e.x, e.y - 20);
  }

  physics(dt: number, gravity = 1500) {
    const b = this.body;
    if (this.grav > 0) b.vy = Math.min(560, b.vy + gravity * this.grav * dt);
    const wasAir = !b.onGround;
    moveBody(b, dt, G.world.grid, G.world.solid, this.collide);
    if (b.onGround && wasAir && this.airborne) {
      this.airborne = false;
      if (b.vy >= 0) fx.dust(this.x, this.y, 4, 0.7);
    }
    // keep inside room
    const maxX = G.world.grid.w * 16 - 4;
    if (this.x < 4) this.x = 4;
    if (this.x > maxX) this.x = maxX;
    if (this.y > G.world.grid.h * 16 + 40) {
      this.hp = 0;
      this.die();
    }
  }

  update(dt: number) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hpBarT = Math.max(0, this.hpBarT - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dying) {
      this.deathT += dt;
      this.body.vx = approach(this.body.vx, 0, 400 * dt);
      this.physics(dt);
      this.anim?.update(dt);
      if (this.anim) this.pose = this.anim.sample();
      if (this.dims) solve(this.pose, this.dims, this.body.onGround, this.j);
      if (this.awaitingPurify) {
        if (Math.random() < dt * 20) fx.spawn(PK.Smoke, this.x + rand(-10, 10), this.y - rand(0, 30), rand(-10, 10), -30, 1, 3, 9, '#2a1636', -20, 1);
        return;
      }
      if (this.deathT > 1.0) {
        this.remove = true;
        fx.veilBurst(this.cx, this.cy, 16, 1);
      } else if (Math.random() < dt * 30) {
        fx.spawn(PK.Smoke, this.x + rand(-8, 8), this.y - rand(0, 24), rand(-10, 10), -40, 0.8, 2, 7, '#2a1636', -20, 1);
      }
      return;
    }
    if (this.staggered > 0) {
      this.staggered -= dt;
      this.body.vx = approach(this.body.vx, 0, 500 * dt);
      if (this.staggered <= 0) {
        this.poise = this.maxPoise;
        this.onRecover();
      }
    } else {
      if (this.poiseDelay > 0) this.poiseDelay -= dt;
      else this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.35 * dt);
      if (this.hurtT > 0) {
        this.hurtT -= dt;
        this.body.vx = approach(this.body.vx, 0, (this.airborne ? 120 : 700) * dt);
      } else this.think(dt);
    }
    this.physics(dt);
    if (this.anim) {
      this.anim.update(dt);
      this.pose = this.anim.sample();
    }
    if (this.dims) solve(this.pose, this.dims, this.body.onGround, this.j);
    this.groanT -= dt;
    if (this.groanT <= 0 && this.aggro) {
      this.groanT = rand(4, 9);
      this.groan();
    }
  }

  groan() {}
  abstract think(dt: number): void;
  /** Called when a stagger ends. */
  onRecover() {
    this.setState('idle', 'idle', 0.2);
  }

  takeHit(h: HitInfo): boolean {
    if (this.dying || this.invuln > 0) return false;
    let dmg = h.dmg;
    this.aggro = true;
    if (this.guardCheck(h)) return true;
    if (this.staggered > 0) dmg *= this.brokenMul;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.hpBarT = 3;
    this.flash = 0.12;
    const px = h.px ?? this.cx - sign(h.dir || 1) * this.body.w * 0.3;
    const py = h.py ?? this.cy - 4;
    fx.number(this.x, this.y - this.body.h - 6, dmg, h.crit);
    fx.hitSparks(px, py, h.dir || 1, h.crit ? '#ffe08a' : '#fff1c4', h.crit ? 14 : 9, h.crit ? 1.3 : 1);
    fx.veilBurst(px, py, 4, 0.5);
    sfx(h.crit ? 'crit' : h.heavy ? 'hitHeavy' : 'hit', { pan: G.world.pan(this.x), pitch: rand(0.9, 1.1) });
    if (h.stop) G.world.hitstop(h.stop * (h.kind === 'echo' ? 0.3 : 1));
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(h);
      return true;
    }
    if (this.staggered <= 0) {
      this.poise -= h.poise;
      this.poiseDelay = 1.2;
      if (this.poise <= 0) {
        this.stagger();
      } else if (!this.superArmor || h.heavy) {
        this.flinch(h);
      }
    }
    if (!this.heavyBody && !h.noKnock) {
      const kb = this.superArmor && this.staggered <= 0 ? 0.25 : this.tank ? 0.55 : 1;
      this.body.vx = h.kx * kb;
      if (h.launch && (this.staggered <= 0 || this.juggleWhenBroken)) {
        this.body.vy = h.ky;
        this.airborne = true;
      } else if (h.ky < -150 && !this.body.onGround) {
        this.body.vy = Math.min(this.body.vy, h.ky * 0.6);
      } else if (!this.body.onGround) {
        this.body.vy = Math.min(this.body.vy, -60);
      }
    }
    return true;
  }

  /** Return true if the hit was absorbed by a guard. */
  guardCheck(_h: HitInfo): boolean {
    return false;
  }

  flinch(_h: HitInfo) {
    this.hurtT = 0.22;
    this.setState('hurt', 'hurt', 0.02);
  }

  stagger() {
    this.staggered = this.elite ? 2.4 : 2.0;
    this.hurtT = 0;
    this.setState('stagger', 'stagger', 0.05);
    sfx('stagger', { pan: G.world.pan(this.x) });
    fx.ring(this.cx, this.cy, 6, 30, '#fff1c4', 0.3, 2);
    G.world.addRally(4);
  }

  parried(_by: Entity) {
    this.poise -= this.maxPoise * 0.6;
    this.poiseDelay = 1.5;
    if (this.poise <= 0) this.stagger();
    else {
      this.hurtT = 0.5;
      this.setState('hurt', 'hurt', 0.02);
      this.body.vx = -this.face * 140;
    }
  }

  die(_h?: HitInfo) {
    if (this.dying) return;
    this.dying = true;
    this.deathT = 0;
    this.staggered = 0;
    this.setState('death', 'death', 0.05);
    sfx('enemyDie', { pan: G.world.pan(this.x) });
    if (this.purifiable && !G.save.defeated.includes(this.elite!)) {
      this.awaitingPurify = true;
      this.setState('death', 'kneel', 0.1);
    }
    G.world.onEnemyKilled(this);
  }

  /** Hitbox attack helper: strikes player/echoes in a box relative to facing. */
  strike(bx: number, by: number, bw: number, bh: number, dmgMul = 1, extra: Partial<HitInfo> = {}) {
    const x = this.face > 0 ? this.x + bx : this.x - bx - bw;
    return G.world.hitPlayerSide({ x, y: this.y + by, w: bw, h: bh }, {
      dmg: this.dmg * dmgMul, poise: 20, kx: this.face * 180, ky: -140, dir: this.face, kind: 'melee', src: this, parryable: true, ...extra,
    }, this.hitSet);
  }

  faceTarget() {
    if (this.target) this.face = this.target.x > this.x ? 1 : -1;
  }

  /** Walk toward x unless a ledge, wall or hazard is ahead. */
  walkToward(tx: number, speed: number, dt: number, minDist = 0) {
    const b = this.body;
    const dx = tx - this.x;
    if (Math.abs(dx) <= minDist) {
      b.vx = approach(b.vx, 0, 800 * dt);
      return false;
    }
    const dir = sign(dx);
    this.face = dir;
    const blocked = (b.onGround && (!groundAhead(b, dir, G.world.grid, G.world.solid) || hazardAhead(b, dir, G.world.grid))) || wallAhead(b, dir, G.world.grid, G.world.solid);
    b.vx = approach(b.vx, blocked ? 0 : dir * speed, 900 * dt);
    return !blocked;
  }

  drawHumanoidBody(ctx: Ctx) {
    if (!this.style || !this.dims) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face, 1);
    if (this.dying && !this.awaitingPurify) ctx.globalAlpha = clamp(1 - (this.deathT - 0.4) / 0.6, 0, 1);
    drawHumanoid(ctx, this.j, this.style, G.time + this.id, this.pose.rot, this.body.vx * this.face, this.body.vy);
    if (this.flash > 0) {
      // White-out on the frames right after a hit.
      ctx.globalAlpha = Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, this.j, flashStyle(this.style), G.time + this.id, this.pose.rot, this.body.vx * this.face, this.body.vy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    this.drawFlash(ctx);
  }

  drawFlash(ctx: Ctx) {
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.cx, this.cy, this.body.h * 0.8, '#ffffff', this.flash * 5);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay(ctx: Ctx) {
    if (this.dying) {
      if (this.awaitingPurify) {
        ctx.globalCompositeOperation = 'lighter';
        const p = 0.6 + Math.sin(G.time * 4) * 0.2;
        glow(ctx, this.cx, this.cy, 40, '#b04cff', 0.4 * p);
        glow(ctx, this.cx, this.cy - 6, 18, '#ffe6a8', 0.35 * p);
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }
    // compact health bar
    if ((this.hpBarT > 0 || this.elite) && !G.world.bossActive) {
      const w = Math.max(18, this.body.w * 1.6), x = this.x - w / 2, y = this.y - this.body.h - 10;
      ctx.fillStyle = 'rgba(8,6,12,0.75)';
      ctx.fillRect(x - 0.6, y - 0.6, w + 1.2, 3.2);
      ctx.fillStyle = this.elite ? '#d04a6a' : '#b03a4a';
      ctx.fillRect(x, y, w * (this.hp / this.maxHp), 2);
      if (this.maxPoise > 20) {
        ctx.fillStyle = '#e8d8a8';
        ctx.fillRect(x, y + 2.4, w * clamp(this.poise / this.maxPoise, 0, 1), 0.8);
      }
    }
    if (this.staggered > 0) {
      // execution sigil
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(G.time * 10) * 0.3;
      const y = this.y - this.body.h - 16;
      glow(ctx, this.x, y, 12, '#ffe6a8', 0.7 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.x, y - 6); ctx.lineTo(this.x + 5, y); ctx.lineTo(this.x, y + 6); ctx.lineTo(this.x - 5, y); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.cx, this.cy - 6, this.awaitingPurify ? 70 : 34, '#b04cff', this.awaitingPurify ? 0.8 : 0.35, 0.35);
  }

  /** Telegraph glint (eye flash) for an incoming attack. */
  glint(ctx: Ctx, x: number, y: number, color = '#ff5a6a') {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 14, color, 0.9);
    ctx.strokeStyle = rgba('#ffffff', 0.9);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- Husk

export class Husk extends Enemy {
  variant: number;
  constructor(x: number, y: number, elite: string | null) {
    super('husk', x, y, 13, 30, elite);
    this.dims = HUSK_DIMS;
    this.variant = Math.floor(rand(0, 3));
    this.style = HUSK_STYLE(this.variant);
    this.anim = new Animator(HUSK_CLIPS, HUSK_BASE);
    this.anim.play('idle', 0);
    this.anim.time = rand(0, 2);
  }
  groan() {
    sfx('huskGroan', { pan: G.world.pan(this.x), vol: 0.6, pitch: rand(0.85, 1.15) });
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(170);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      if (this.state !== 'idle') this.setState('idle', 'idle', 0.2);
      return;
    }
    this.target = this.pickTarget(420);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dist = Math.abs(t.x - this.x);
    switch (this.state) {
      case 'attack': {
        b.vx = approach(b.vx, 0, 800 * dt);
        const u = this.st / 0.95;
        if (u > 0.5 && u < 0.66) {
          if (this.st - dt < 0.5 * 0.95) {
            b.vx = this.face * 150;
            sfx('huskAttack', { pan: G.world.pan(this.x) });
          }
          this.strike(-2, -30, 24, 30);
        }
        if (u >= 1) {
          this.attackCd = rand(0.7, 1.3);
          this.setState('chase', 'walk', 0.15);
        }
        break;
      }
      default: {
        if (dist < 30 && this.attackCd <= 0 && Math.abs(t.y - this.y) < 30) {
          this.faceTarget();
          this.hitSet.clear();
          this.setState('attack', 'attack', 0.06, 1 / 0.95);
          break;
        }
        const moving = this.walkToward(t.x, 36 + (this.variant === 1 ? 10 : 0), dt, 22);
        const want = moving && Math.abs(b.vx) > 5 ? 'walk' : 'idle';
        if (this.anim!.name !== want) this.anim!.play(want, 0.15);
        this.state = 'chase';
      }
    }
  }
  draw(ctx: Ctx) {
    this.drawHumanoidBody(ctx);
    if (this.state === 'attack' && this.st < 0.5 * 0.95 && this.st > 0.15) {
      this.glint(ctx, this.x + this.face * 3, this.y - 30);
    }
  }
}

// ---------------------------------------------------------------- Gloom Hound (quadruped)

export class Hound extends Enemy {
  phase = 0;
  tail: Chain;
  gait = 0;
  constructor(x: number, y: number, elite: string | null) {
    super('hound', x, y, 24, 16, elite);
    this.tail = new Chain(6, 3, x, y - 12);
  }
  groan() {
    sfx('houndGrowl', { pan: G.world.pan(this.x), vol: 0.6 });
  }
  stagger() {
    super.stagger();
  }
  flinch() {
    this.hurtT = 0.22;
    this.state = 'hurt';
    this.st = 0;
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(210);
      if (t && this.canSee(t)) {
        this.aggro = true;
        sfx('houndBark', { pan: G.world.pan(this.x) });
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(460);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    switch (this.state) {
      case 'crouch': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.faceTarget();
        if (this.st >= 0.42) {
          this.setState('pounce');
          b.vx = this.face * clamp(dist * 2.6, 160, 280);
          b.vy = -250;
          this.airborne = true;
          this.hitSet.clear();
          sfx('houndBark', { pan: G.world.pan(this.x), pitch: 1.2 });
        }
        break;
      }
      case 'pounce': {
        this.strike(0, -18, 22, 18, 1, { kx: this.face * 140, ky: -120 });
        if (b.onGround && this.st > 0.1) {
          this.setState('recover');
          this.attackCd = rand(0.9, 1.5);
        }
        break;
      }
      case 'bite': {
        b.vx = approach(b.vx, 0, 800 * dt);
        if (this.st > 0.22 && this.st < 0.34) this.strike(0, -16, 18, 16);
        if (this.st >= 0.6) {
          this.setState('run');
          this.attackCd = rand(0.6, 1);
        }
        break;
      }
      case 'recover': {
        b.vx = approach(b.vx, 0, 700 * dt);
        if (this.st >= 0.45) this.setState('run');
        break;
      }
      default: {
        if (this.attackCd <= 0 && dist > 50 && dist < 120 && Math.abs(t.y - this.y) < 40 && b.onGround) {
          this.setState('crouch');
          sfx('houndGrowl', { pan: G.world.pan(this.x), pitch: 1.1 });
          break;
        }
        if (this.attackCd <= 0 && dist < 34 && b.onGround) {
          this.faceTarget();
          this.hitSet.clear();
          this.setState('bite');
          break;
        }
        // circle at a little distance while on cooldown
        const keep = this.attackCd > 0 ? 70 : 20;
        if (dist < keep - 10) this.walkToward(this.x - sign(dx) * 40, 110, dt);
        else this.walkToward(t.x, 150, dt, keep);
        this.state = 'run';
      }
    }
  }
  update(dt: number) {
    super.update(dt);
    this.gait += dt * (4 + Math.abs(this.body.vx) * 0.06);
    const f = this.face;
    this.tail.update(this.x - f * 11, this.y - 13, dt, -this.body.vx * 3 - f * 100, -60 + Math.sin(G.time * 5) * 40, 0.85);
  }
  draw(ctx: Ctx) {
    const f = this.face;
    const t = this.gait;
    const crouch = this.state === 'crouch' ? Math.min(1, this.st / 0.3) : 0;
    const air = !this.body.onGround;
    const stag = this.staggered > 0 ? 1 : 0;
    const dyingA = this.dying ? clamp(1 - (this.deathT - 0.3) / 0.7, 0, 1) : 1;
    ctx.globalAlpha = dyingA;
    // smoke tail
    drawRibbon(ctx, this.tail, 4, 0.5, '#140e1a', CORRUPT.outline);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f, 1);
    const run = Math.abs(this.body.vx) > 20 && !air;
    const bob = run ? Math.sin(t * 2) * 1.2 : 0;
    const bodyY = -12 + crouch * 4 + bob + stag * 4 + (this.dying ? Math.min(6, this.deathT * 12) : 0);
    const o = CORRUPT.outline;
    const legs = (phase: number, hipX: number, front: boolean, back: boolean) => {
      let a = run ? Math.sin(t * 2 + phase) * 0.9 : 0.1;
      if (air) a = front ? 0.9 : -0.9;
      if (crouch) a = front ? 0.5 : -0.4;
      const len1 = 6.5, len2 = 6.5;
      const kx = hipX + Math.sin(a) * len1, ky = bodyY + 3 + Math.cos(a) * len1;
      const fa = a + (front ? -0.7 : 0.8) - (run ? Math.max(0, Math.cos(t * 2 + phase)) * 0.6 : 0);
      const fx2 = kx + Math.sin(fa) * len2, fy2 = Math.min(0, ky + Math.cos(fa) * len2);
      const c = back ? '#0c0810' : '#221a2a';
      limbStroke(ctx, hipX, bodyY + 2, kx, ky, 2.6, 1.8, o, 1.2);
      limbStroke(ctx, kx, ky, fx2, fy2, 1.8, 1.3, o, 1.2);
      limbShaded(ctx, kx, ky, fx2, fy2, 1.8, 1.3, c, null);
      limbShaded(ctx, hipX, bodyY + 2, kx, ky, 2.6, 1.8, c, null);
    };
    legs(Math.PI, 7, true, true);
    legs(0, -8, false, true);
    // body
    ctx.beginPath();
    ctx.moveTo(-12, bodyY - 1);
    ctx.quadraticCurveTo(-4, bodyY - 8 + crouch * 2, 8, bodyY - 6);
    ctx.quadraticCurveTo(13, bodyY - 1, 10, bodyY + 4);
    ctx.quadraticCurveTo(0, bodyY + 7, -11, bodyY + 4);
    ctx.closePath();
    ctx.fillStyle = lineGrad(ctx, 0, bodyY - 8, 0, bodyY + 7, '#241a2c', 0.22, -0.35);
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = o;
    ctx.stroke();
    // smoke mane spikes
    for (let i = 0; i < 6; i++) {
      const sx = -8 + i * 3.2;
      const sh = 4 + Math.sin(G.time * 8 + i) * 1.5;
      poly(ctx, [sx, bodyY - 5, sx + 1.5, bodyY - 5 - sh, sx + 3, bodyY - 5], '#0e0912');
    }
    // violet ribs
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(CORRUPT.glow, 0.7);
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-4 + i * 4, bodyY - 4);
      ctx.lineTo(-3 + i * 4, bodyY + 3);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    legs(0, 9, true, false);
    legs(Math.PI, -6, false, false);
    // head
    const hx = 12, hy = bodyY - 4 + crouch * 3;
    const open = this.state === 'bite' || this.state === 'pounce' ? 0.6 : crouch * 0.3;
    poly(ctx, [hx - 3, hy - 3, hx + 3, hy - 5, hx + 10, hy - 2, hx + 10, hy, hx + 2, hy + 1], lineGrad(ctx, hx, hy - 5, hx, hy + 1, '#2a2032', 0.25, -0.3), o, 0.7);
    // Fangs.
    ctx.fillStyle = '#d8ccd8';
    ctx.beginPath();
    ctx.moveTo(hx + 7.5, hy + 0.6); ctx.lineTo(hx + 8.2, hy + 2.2 + open * 1.5); ctx.lineTo(hx + 8.8, hy + 0.6);
    ctx.moveTo(hx + 4.5, hy + 0.9); ctx.lineTo(hx + 5.1, hy + 2.1 + open * 1.2); ctx.lineTo(hx + 5.7, hy + 0.9);
    ctx.fill();
    poly(ctx, [hx + 1, hy + 1, hx + 9, hy + 1 + open * 2, hx + 8, hy + 3 + open * 4, hx, hy + 3], '#140e18', o, 0.6);
    // ears
    poly(ctx, [hx - 1, hy - 3, hx - 3, hy - 9, hx + 2, hy - 4], '#140e18', o, 0.5);
    // eye
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, hx + 5, hy - 2.2, 5, CORRUPT.eye, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd0d6';
    ctx.fillRect(hx + 4.4, hy - 2.8, 1.6, 0.9);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.state === 'crouch') this.glint(ctx, this.x + f * 16, this.y - 16);
    this.drawFlash(ctx);
  }
}

// ---------------------------------------------------------------- Hollow Archer

export class Archer extends Enemy {
  drawAmt = 0;
  volley = 0;
  constructor(x: number, y: number, elite: string | null) {
    super('archer', x, y, 12, 32, elite);
    this.dims = ARCH_DIMS;
    this.style = archerStyle('corrupt', 0, !!elite);
    this.anim = new Animator(ARCH_CLIPS, ARCH_BASE);
    this.anim.play('idle', 0);
    if (elite) {
      this.scale = 1.1;
      this.superArmor = false;
    }
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(this.elite ? 340 : 280);
      if (t && this.canSee(t)) this.aggro = true;
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(520);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    const drawTime = this.elite ? 0.55 : 0.75;
    switch (this.state) {
      case 'draw': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.faceTarget();
        this.drawAmt = Math.min(1, this.st / drawTime);
        if (this.st >= drawTime) {
          this.fire(t);
          this.setState('release', 'release', 0.03);
          this.drawAmt = 0;
        }
        break;
      }
      case 'release': {
        if (this.st >= 0.4) {
          if (this.elite && this.volley > 0) {
            this.volley--;
            this.setState('draw', 'draw', 0.05, 1 / (drawTime * 0.6));
            this.st = drawTime * 0.4;
          } else {
            this.attackCd = this.elite ? rand(1.0, 1.6) : rand(1.6, 2.4);
            this.setState('move', 'idle', 0.15);
          }
        }
        break;
      }
      case 'hop': {
        if (b.onGround && this.st > 0.1) this.setState('move', 'idle', 0.1);
        break;
      }
      default: {
        this.faceTarget();
        if (dist < 70 && b.onGround && this.st > 0.3) {
          // leap away
          const away = -sign(dx);
          if (groundAhead(b, away, G.world.grid, G.world.solid, 30) && !wallAhead(b, away, G.world.grid, G.world.solid, 20)) {
            b.vx = away * 170;
            b.vy = -260;
            this.airborne = true;
            this.setState('hop', 'hop', 0.05);
            sfx('jump', { pan: G.world.pan(this.x), vol: 0.5 });
            break;
          }
        }
        if (this.attackCd <= 0 && dist < 330 && this.canSee(t)) {
          this.volley = this.elite ? 2 : 0;
          this.setState('draw', 'draw', 0.08, 1 / drawTime);
          sfx('bowDraw', { pan: G.world.pan(this.x) });
          break;
        }
        if (dist > 240) this.walkToward(t.x, 55, dt, 200);
        else if (dist < 120) {
          const ok = this.walkToward(this.x - sign(dx) * 50, 50, dt);
          this.face = sign(dx);
          if (!ok) b.vx = approach(b.vx, 0, 600 * dt);
        } else b.vx = approach(b.vx, 0, 600 * dt);
        const want = Math.abs(b.vx) > 8 ? (sign(b.vx) === this.face ? 'walk' : 'back') : 'idle';
        if (this.anim!.name !== want && this.state === 'move') this.anim!.play(want, 0.15);
        this.state = 'move';
      }
    }
  }
  fire(t: Entity) {
    const sx = this.x + this.face * 10, sy = this.y - 22;
    const tx = t.x + (t.body.vx || 0) * 0.25, ty = t.y - 16;
    const speed = this.elite ? 340 : 290;
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    const time = d / speed;
    let vx = (tx - sx) / time, vy = (ty - sy) / time - 60 * time * 0.5;
    const spreads = this.elite && this.volley === 0 ? [-0.12, 0, 0.12] : [0];
    for (const s of spreads) {
      const ang = Math.atan2(vy, vx) + s;
      const sp = Math.hypot(vx, vy);
      G.world.add(new Proj('arrow', sx, sy, 'enemy', this.dmg, { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 2.5, w: 8, h: 4, color: CORRUPT.glow }));
    }
    sfx('bowRelease', { pan: G.world.pan(this.x) });
  }
  draw(ctx: Ctx) {
    if (this.style) this.style.bowDraw = this.state === 'draw' ? this.drawAmt : 0;
    if (this.elite) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1.1, 1.1);
      ctx.translate(-this.x, -this.y);
      this.drawHumanoidBody(ctx);
      ctx.restore();
    } else this.drawHumanoidBody(ctx);
    if (this.state === 'draw' && this.drawAmt > 0.6 && this.target) {
      // aim line telegraph
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(CORRUPT.glow, 0.25 * this.drawAmt);
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(this.x + this.face * 10, this.y - 22);
      ctx.lineTo(this.target.x, this.target.y - 16);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      if (this.drawAmt > 0.85) this.glint(ctx, this.x + this.face * 12, this.y - 22, CORRUPT.glow);
    }
  }
}

// ---------------------------------------------------------------- Fallen Sentinel

export class Sentinel extends Enemy {
  combo = 0;
  guardUp = true;
  cape: Chain;
  constructor(x: number, y: number, elite: string | null) {
    super('sentinel', x, y, 18, 42, elite);
    this.dims = SENT_DIMS;
    this.style = sentinelStyle('corrupt');
    this.anim = new Animator(SENT_CLIPS, SENT_BASE);
    this.anim.play('idle', 0);
    this.superArmor = true;
    this.cape = new Chain(7, 4, x, y - 36);
    if (elite) this.name = 'Fallen Sentinel';
  }
  groan() {
    sfx('sentinelClank', { pan: G.world.pan(this.x), vol: 0.6 });
  }
  guardCheck(h: HitInfo) {
    const frontal = h.dir !== 0 && sign(h.dir) !== this.face;
    if (!this.guardUp || !frontal || h.guardBreak || h.kind === 'ability' || this.staggered > 0 || this.state === 'slash' || this.state === 'slam' || this.state === 'bash') return false;
    if (h.heavy && !h.guardBreak) {
      this.poise -= h.poise * 0.6;
      if (this.poise <= 0) {
        this.stagger();
        return false;
      }
    }
    sfx('block', { pan: G.world.pan(this.x) });
    fx.hitSparks(this.x + this.face * 10, this.y - 24, -this.face, '#d8c8ff', 7);
    this.body.vx = -this.face * 40;
    if (h.src && h.src === G.world.player && h.kind === 'melee') {
      G.world.player.body.vx = this.face * 120;
    }
    this.anim?.play('guard', 0.03, true);
    // Counter-bash after a few blocked hits.
    this.combo++;
    if (this.combo >= 3 && this.state !== 'bash') {
      this.combo = 0;
      this.hitSet.clear();
      this.setState('bash', 'bash', 0.04, 1 / 0.7);
    }
    return true;
  }
  stagger() {
    super.stagger();
    this.guardUp = false;
    sfx('shieldBash', { pan: G.world.pan(this.x), pitch: 0.7 });
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(190);
      if (t && this.canSee(t)) {
        this.aggro = true;
        sfx('sentinelClank', { pan: G.world.pan(this.x) });
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(480);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    this.guardUp = this.state === 'move' || this.state === 'guard';
    const slashT = this.elite ? 0.95 : 1.05;
    switch (this.state) {
      case 'slash': {
        b.vx = approach(b.vx, 0, 900 * dt);
        const u = this.st / slashT;
        if (u > 0.55 && u < 0.7) {
          if (this.st - dt < 0.55 * slashT) {
            b.vx = this.face * 120;
            sfx('swingHeavy', { pan: G.world.pan(this.x), pitch: 0.8 });
          }
          this.strike(-4, -46, 38, 48, 1, { poise: 40 });
        }
        if (u >= 1) {
          if (this.elite && this.combo < 1 && dist < 60) {
            this.combo++;
            this.hitSet.clear();
            this.setState('slash', 'slash', 0.06, 1 / (slashT * 0.85));
            this.st = slashT * 0.15;
          } else {
            this.combo = 0;
            this.attackCd = rand(0.8, 1.4);
            this.setState('move', 'walk', 0.2);
          }
        }
        break;
      }
      case 'bash': {
        const u = this.st / 0.7;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.4 && u < 0.6) {
          if (this.st - dt < 0.4 * 0.7) {
            b.vx = this.face * 200;
            sfx('shieldBash', { pan: G.world.pan(this.x) });
          }
          this.strike(0, -40, 26, 40, 0.7, { kx: this.face * 320, ky: -180, poise: 60, parryable: true });
        }
        if (u >= 1) {
          this.attackCd = rand(0.6, 1.0);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      case 'slam': {
        const T = 1.3;
        const u = this.st / T;
        if (u < 0.3) b.vx = approach(b.vx, 0, 900 * dt);
        if (u >= 0.3 && this.st - dt < 0.3 * T) {
          b.vy = -320;
          b.vx = clamp(dx * 1.6, -220, 220);
          this.face = sign(dx) || this.face;
          this.airborne = true;
        }
        if (u > 0.4 && b.onGround && this.st - dt >= 0.3 * T + 0.05 && !this.slammed) {
          this.slammed = true;
          b.vx = 0;
          sfx('sentinelSlam', { pan: G.world.pan(this.x) });
          fx.dust(this.x, this.y, 14, 1.8);
          fx.ring(this.x + this.face * 14, this.y, 6, 60, CORRUPT.glow, 0.4, 3, 0.3);
          G.camera.addTrauma(0.4 * shakeScale());
          this.strike(-10, -30, 50, 32, 1.3, { unblockable: true, parryable: false, kx: this.face * 260, ky: -260, poise: 80 });
          if (this.elite) {
            G.world.add(new Proj('wave', this.x + 20, this.y, 'enemy', this.dmg * 0.7, { vx: 200, life: 1.4, w: 14, h: 22, color: CORRUPT.glow }));
            G.world.add(new Proj('wave', this.x - 20, this.y, 'enemy', this.dmg * 0.7, { vx: -200, life: 1.4, w: 14, h: 22, color: CORRUPT.glow }));
          }
        }
        if (u >= 1) {
          this.slammed = false;
          this.attackCd = rand(1.0, 1.6);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround) {
          if (dist < 46 && Math.abs(t.y - this.y) < 40) {
            this.hitSet.clear();
            if (Math.random() < 0.35) this.setState('bash', 'bash', 0.06, 1 / 0.7);
            else this.setState('slash', 'slash', 0.06, 1 / slashT);
            break;
          }
          if (dist > 80 && dist < 170 && Math.random() < (this.elite ? 0.02 : 0.01)) {
            this.hitSet.clear();
            this.slammed = false;
            this.setState('slam', 'slam', 0.06, 1 / 1.3);
            sfx('sentinelClank', { pan: G.world.pan(this.x), pitch: 0.7 });
            break;
          }
        }
        const moving = this.walkToward(t.x, this.elite ? 52 : 40, dt, 36);
        const want = moving && Math.abs(b.vx) > 5 ? 'walk' : 'guard';
        if (this.anim!.name !== want) this.anim!.play(want, 0.2);
        this.state = 'move';
      }
    }
  }
  slammed = false;
  update(dt: number) {
    super.update(dt);
    const f = this.face;
    this.cape.update(this.x + f * (this.j.shBX - 2), this.y + this.j.shBY, dt, -this.body.vx * 2 - f * 50, 400, 0.88);
  }
  draw(ctx: Ctx) {
    if (!this.dying || this.awaitingPurify) drawRibbon(ctx, this.cape, 12, 15, '#1e1424', CORRUPT.outline);
    this.drawHumanoidBody(ctx);
    const telegraph = (this.state === 'slash' && this.st < 0.5) || (this.state === 'bash' && this.st < 0.25) || (this.state === 'slam' && this.st < 0.4);
    if (telegraph) this.glint(ctx, this.x + this.face * 4, this.y - 44, this.state === 'slam' ? '#ff2a3a' : '#ff6a7a');
  }
}

// ---------------------------------------------------------------- Veil Wisp

export class Wisp extends Enemy {
  hoverX: number;
  hoverY: number;
  charge = 0;
  fade = 1;
  tele = 0;
  constructor(x: number, y: number, elite: string | null) {
    super('wisp', x, y, 14, 18, elite);
    this.grav = 0;
    this.collide = false;
    this.hoverX = x;
    this.hoverY = y;
  }
  groan() {
    sfx('wispHum', { pan: G.world.pan(this.x), vol: 0.5 });
  }
  physics(dt: number) {
    const b = this.body;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.onGround = false;
    if (this.dying && !this.awaitingPurify) b.vy += 200 * dt;
  }
  flinch(h: HitInfo) {
    this.hurtT = 0.2;
    this.body.vx = h.kx * 0.6;
    this.body.vy = h.ky * 0.3;
    this.charge = 0;
    this.state = 'drift';
  }
  stagger() {
    super.stagger();
    this.body.vy = 30;
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(220);
      if (t && this.canSee(t)) this.aggro = true;
      b.vx = approach(b.vx, Math.sin(G.time * 0.8 + this.id) * 10, 60 * dt);
      b.vy = approach(b.vy, Math.sin(G.time * 1.6 + this.id) * 12, 60 * dt);
      return;
    }
    this.target = this.pickTarget(460);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    this.faceTarget();
    if (this.state === 'tele') {
      this.fade = Math.max(0, 1 - this.st / 0.3);
      if (this.st >= 0.3 && this.tele === 0) {
        this.tele = 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.x = clamp(t.x + side * rand(80, 120), 20, G.world.grid.w * 16 - 20);
        this.y = t.y - rand(60, 90);
      }
      if (this.st >= 0.3) this.fade = Math.min(1, (this.st - 0.3) / 0.3);
      if (this.st >= 0.6) {
        this.tele = 0;
        this.fade = 1;
        this.state = 'drift';
        this.attackCd = 0.8;
      }
      return;
    }
    if (this.state === 'charge') {
      b.vx = approach(b.vx, 0, 200 * dt);
      b.vy = approach(b.vy, 0, 200 * dt);
      this.charge = Math.min(1, this.st / 0.7);
      if (this.st >= 0.7) {
        const dx = t.x - this.x, dy = t.y - 18 - this.y, d = Math.hypot(dx, dy) || 1;
        G.world.add(new Proj('orb', this.x + this.face * 6, this.y, 'enemy', this.dmg, { vx: (dx / d) * 80, vy: (dy / d) * 80, life: 3.2, w: 10, h: 10 }));
        sfx('wispShot', { pan: G.world.pan(this.x) });
        this.charge = 0;
        this.attackCd = rand(2.0, 3.0);
        this.state = 'drift';
      }
      return;
    }
    // drift toward a hover point beside & above the target
    const side = this.x < t.x ? -1 : 1;
    this.hoverX = t.x + side * 95;
    this.hoverY = t.y - 70 + Math.sin(G.time * 1.3 + this.id) * 12;
    b.vx = approach(b.vx, clamp((this.hoverX - this.x) * 1.2, -70, 70), 160 * dt);
    b.vy = approach(b.vy, clamp((this.hoverY - this.y) * 1.2, -60, 60), 160 * dt);
    if (Math.hypot(t.x - this.x, t.y - this.y) < 45 && Math.random() < dt * 2) {
      this.state = 'tele';
      this.st = 0;
      sfx('wispHum', { pan: G.world.pan(this.x), pitch: 1.4 });
      return;
    }
    if (this.attackCd <= 0 && this.canSee(t)) {
      this.state = 'charge';
      this.st = 0;
      sfx('wispHum', { pan: G.world.pan(this.x), vol: 0.7 });
    }
  }
  hurtbox() {
    return { x: this.x - 7, y: this.y - 9, w: 14, h: 18 };
  }
  get cy() {
    return this.y;
  }
  draw(ctx: Ctx) {
    const t = G.time + this.id;
    const a = (this.dying && !this.awaitingPurify ? clamp(1 - this.deathT / 0.8, 0, 1) : 1) * this.fade;
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    // tendrils
    ctx.strokeStyle = '#1e1028';
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const ox = (i - 2) * 2.5;
      ctx.lineWidth = 2.2 - Math.abs(i - 2) * 0.4;
      ctx.beginPath();
      ctx.moveTo(this.x + ox, this.y + 4);
      ctx.quadraticCurveTo(this.x + ox + Math.sin(t * 3 + i) * 5, this.y + 12, this.x + ox + Math.sin(t * 2 + i * 1.7) * 7 - this.body.vx * 0.1, this.y + 20 + i % 2 * 3);
      ctx.stroke();
    }
    // hooded shroud
    poly(ctx, [this.x - 7, this.y + 6, this.x - 6, this.y - 5, this.x - 2, this.y - 10, this.x + 3, this.y - 10, this.x + 7, this.y - 4, this.x + 7, this.y + 6, this.x + 3, this.y + 3, this.x, this.y + 7, this.x - 3, this.y + 3], '#22142e', CORRUPT.outline, 0.8);
    ellipse(ctx, this.x + this.face * 1.5, this.y - 3, 3.5, 4, 0, '#08040c');
    ctx.globalCompositeOperation = 'lighter';
    const c = this.charge;
    glow(ctx, this.x + this.face * 1.5, this.y - 3, 7 + c * 14, CORRUPT.glow, 0.6 + c * 0.4);
    glow(ctx, this.x + this.face * 1.5, this.y - 3, 3, '#ffffff', 0.6);
    if (c > 0) {
      ctx.strokeStyle = rgba('#d8a0ff', c);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x + this.face * 1.5, this.y - 3, 18 * (1 - c) + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.drawFlash(ctx);
  }
  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x, this.y, 50 + this.charge * 30, CORRUPT.glow, 0.7 * this.fade, 0.6);
  }
}


export { choose, circle };
