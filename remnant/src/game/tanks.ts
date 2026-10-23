// Tanks: foes built to soak up long combos. They shrug off light blows
// (super armor) until their poise breaks; then they are Broken for several
// seconds: down on one knee, taking extra damage, and light enough to be
// launched and juggled. Executions bite deep but do not end them outright.
//
// - Ironbound Brute: a maul, an overhead smash, a wide sweep and a bull rush
//   that leaves it dazed if it meets a wall.
// - Shieldwall Bulwark: a tower shield that stops everything from the front.
//   It turns slowly, so a Phantom Step behind it is the way in.
// - Crimson Knight: the Marshal's honour guard, a fast blade with a parry.

import { type HitInfo } from './entity';
import { wallAhead } from './physics';
import { Animator, BASE_POSE, Chain, drawRibbon, type Clip, type Pose, type RigDims } from '../render/skeleton';
import { type HumanStyle } from '../render/actors';
import { glow, rgba, type Ctx } from '../render/draw';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign, easeOutCubic, easeInQuad, easeOutBack, easeInOutSine } from '../core/math';
import { Proj } from './projectiles';
import { shakeScale } from '../core/settings';
import { Enemy, CORRUPT, SENT_CLIPS, SENT_BASE, SENT_DIMS } from './enemies';

const k = (t: number, p: Partial<Pose>, ease?: (x: number) => number) => ({ t, p, ease });

function idleClip(base: Pose, sway = 0.03): Clip {
  return { dur: 2.6, loop: true, base, fn: (u) => ({ lean: base.lean + Math.sin(u * Math.PI * 2) * sway, y: Math.sin(u * Math.PI * 2) * 0.5 }) };
}
function walkClip(base: Pose, dur: number, amp: number, lean = 0.1): Clip {
  return {
    dur, loop: true, base, steps: [0.25, 0.75],
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return {
        lean: base.lean + lean + Math.sin(p * 2) * 0.03, y: -Math.abs(Math.cos(p)) * 0.8,
        fTh: base.fTh * 0.3 + amp * s, fSh: -0.2 - 0.9 * amp * Math.max(0, Math.cos(p - 0.5)),
        bTh: base.bTh * 0.3 - amp * s, bSh: -0.2 - 0.9 * amp * Math.max(0, Math.cos(p + Math.PI - 0.5)),
      };
    },
  };
}

// ---------------------------------------------------------------- styles

export type TankPalette = 'corrupt' | 'echo';

export function bruteStyle(pal: TankPalette, stage = 0, broken = false): HumanStyle {
  if (pal === 'corrupt') {
    return {
      skin: '#3e3644', hair: null, hairKind: 'none', coat: '#2c2026', coatDark: '#1a1216', skirt: 12, trim: '#4a2a2a',
      pants: '#241c22', boots: '#1e1a20', glove: '#2e2a30', belt: '#1a1214',
      plate: { c: broken ? '#3a3640' : '#4a4650', dark: '#28262c', hi: '#7a7480', tier: broken ? 1 : 2 }, helm: 'visor', helmColor: '#34323a', helmTrim: '#5a3a3a',
      eye: CORRUPT.eye, eyeGlow: 0.9, outline: CORRUPT.outline, weapon: 'maul', weaponColor: '#5a5660', weaponGlow: CORRUPT.glow, weaponGlowAmt: broken ? 0 : 0.25,
      offhand: 'none', crack: broken ? '#ff6a3a' : CORRUPT.glow, bulk: 1.7,
    };
  }
  const gold = '#e2b85a';
  return {
    skin: '#2a2420', hair: null, hairKind: 'none', coat: stage >= 1 ? '#e8dcc0' : '#2a2420', coatDark: stage >= 1 ? '#c8b894' : '#1a1612', skirt: 12, trim: gold,
    pants: '#1a1714', boots: '#1c1a1f', glove: '#1c1a1f', belt: '#14110e',
    plate: { c: '#1c1a1f', dark: '#0e0d10', hi: stage >= 2 ? '#ffe08a' : gold, tier: 2 }, helm: 'visor', helmColor: '#1c1a1f', helmTrim: gold,
    eye: '#ffffff', eyeGlow: 0.9, outline: '#0a0806', weapon: 'maul', weaponColor: '#2a2630', weaponGlow: '#fff3c4', weaponGlowAmt: 0.3 + stage * 0.3, weaponFlame: stage >= 2,
    offhand: 'none', crack: stage === 0 ? '#ffd27a' : null, runes: '#ffe6a8', bulk: 1.7, crest: stage >= 2 ? '#fff3c4' : stage === 1 ? gold : null,
  };
}

export function bulwarkStyle(pal: TankPalette, stage = 0, shield = true): HumanStyle {
  if (pal === 'corrupt') {
    return {
      skin: '#3a3340', hair: null, hairKind: 'none', coat: '#30241e', coatDark: '#1e1612', skirt: 10, trim: '#5a3a24',
      pants: '#221a18', boots: '#221c1e', glove: '#2b2526', belt: '#18120e',
      plate: { c: '#3a3028', dark: '#211a16', hi: '#6a5a46', tier: 1 }, helm: 'sentinel', helmColor: '#2e2722', helmTrim: '#6a4a2a',
      eye: CORRUPT.eye, eyeGlow: 0.9, outline: CORRUPT.outline, weapon: 'spear', weaponColor: '#77707e', weaponGlow: CORRUPT.glow, weaponGlowAmt: 0.2,
      offhand: shield ? 'tower' : 'none', offColor: '#3a2a20', offTrim: '#8a5a2a', crack: CORRUPT.glow, bulk: 1.45,
    };
  }
  const gold = '#e2b85a';
  return {
    skin: '#2a2420', hair: null, hairKind: 'none', coat: stage >= 1 ? '#e8dcc0' : '#2a2420', coatDark: stage >= 1 ? '#c8b894' : '#1a1612', skirt: 10, trim: gold,
    pants: '#1a1714', boots: '#1c1a1f', glove: '#1c1a1f', belt: '#14110e',
    plate: { c: '#1c1a1f', dark: '#0e0d10', hi: gold, tier: stage >= 1 ? 2 : 1 }, helm: 'sentinel', helmColor: '#1c1a1f', helmTrim: gold,
    eye: '#ffffff', eyeGlow: 0.9, outline: '#0a0806', weapon: 'spear', weaponColor: '#e8e4dc', weaponGlow: '#fff3c4', weaponGlowAmt: 0.25 + stage * 0.25,
    offhand: stage >= 2 ? 'blazing' : 'tower', offColor: '#1c1a1f', offTrim: gold, crack: stage === 0 ? '#ffd27a' : null, runes: '#ffe6a8', bulk: 1.45,
    crest: stage >= 2 ? '#fff3c4' : null,
  };
}

export function knightStyle(): HumanStyle {
  return {
    skin: '#3a3340', hair: null, hairKind: 'none', coat: '#5a1418', coatDark: '#3a0c10', skirt: 11, trim: '#a8823a',
    pants: '#1e1418', boots: '#221a1e', glove: '#2a2228', belt: '#1a1214',
    plate: { c: '#3a2a2e', dark: '#1e1418', hi: '#8a5a5a', tier: 2 }, helm: 'sentinel', helmColor: '#2e1e22', helmTrim: '#a8823a',
    eye: '#ff3a3a', eyeGlow: 0.9, outline: CORRUPT.outline, weapon: 'blade', weaponColor: '#8a7a80', weaponGlow: '#ff3a4a', weaponGlowAmt: 0.25,
    offhand: 'none', crack: '#ff3a4a', bulk: 1.2,
  };
}

/** The Crimson Marshal: as a foe (crimson and black) or as an Echo (black, gold and crimson). */
export function marshalStyle(pal: 'boss' | 'echo', stage = 0, cracked = false): HumanStyle {
  if (pal === 'boss') {
    return {
      skin: '#3a3036', hair: null, hairKind: 'none', coat: '#7a1218', coatDark: '#4a0a0e', skirt: 13, trim: '#c9a04a',
      pants: '#1a1216', boots: '#1e1418', glove: '#26181c', belt: '#1a1214',
      plate: { c: '#2a1c20', dark: '#140c0e', hi: '#b04048', tier: 2 }, helm: cracked ? 'visor' : 'sentinel', helmColor: '#24161a', helmTrim: '#c9a04a',
      eye: '#ff2a3a', eyeGlow: 1, outline: '#0a0406', weapon: 'greatsword', weaponColor: '#9a8a90', weaponGlow: '#ff2a3a', weaponGlowAmt: cracked ? 0.8 : 0.45, weaponFlame: cracked,
      offhand: 'none', crack: cracked ? '#ff5a3a' : null, bulk: 1.3, crest: '#ff3a3a',
    };
  }
  const gold = '#e2b85a';
  return {
    skin: '#2a2420', hair: null, hairKind: 'none', coat: '#6a1418', coatDark: '#400a0e', skirt: 13, trim: gold,
    pants: '#1a1714', boots: '#1c1a1f', glove: '#1c1a1f', belt: '#14110e',
    plate: { c: '#1c1a1f', dark: '#0e0d10', hi: stage >= 2 ? '#ffe08a' : gold, tier: 2 }, helm: 'sentinel', helmColor: '#1c1a1f', helmTrim: gold,
    eye: '#ffffff', eyeGlow: 0.9, outline: '#0a0806', weapon: 'greatsword', weaponColor: '#e8e4dc', weaponGlow: stage >= 1 ? '#fff3c4' : '#ff6a5a', weaponGlowAmt: 0.45 + stage * 0.25, weaponFlame: stage >= 2,
    offhand: 'none', runes: '#ffe6a8', bulk: 1.3, crest: stage >= 2 ? '#fff3c4' : '#ff4a3a',
  };
}

export function knightEchoStyle(stage = 0): HumanStyle {
  const gold = '#e2b85a';
  return {
    ...knightStyle(), skin: '#2a2420', coat: stage >= 1 ? '#7a1a1e' : '#4a1216', coatDark: '#2a0a0c', trim: gold,
    plate: { c: '#1c1a1f', dark: '#0e0d10', hi: gold, tier: 2 }, helmColor: '#1c1a1f', helmTrim: gold,
    eye: '#ffffff', outline: '#0a0806', weaponColor: '#e8e4dc', weaponGlow: '#fff3c4', weaponGlowAmt: 0.3 + stage * 0.3, weaponFlame: stage >= 2,
    crack: stage === 0 ? '#ffd27a' : null, runes: '#ffe6a8', crest: stage >= 2 ? '#fff3c4' : null,
  };
}

// ---------------------------------------------------------------- rigs

export const BRUTE_DIMS: RigDims = { torso: 15, head: 4.6, neck: 1.6, upperArm: 9, foreArm: 8.6, thigh: 10, shin: 9.6, shoulderSpread: 2.4, hipSpread: 2.2 };
export const BRUTE_BASE: Pose = { ...BASE_POSE, lean: 0.22, head: 0.12, bUA: 0.55, bFA: 1.0, fUA: 0.5, fFA: 1.0, wpn: 1.1, bTh: -0.32, bSh: -0.22, fTh: 0.42, fSh: -0.42 };
const BRUTE_KNEEL: Partial<Pose> = { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, fUA: 0.6, fFA: 0.5, wpn: -0.4, bUA: 0.5, bFA: 0.6 };
export const BRUTE_CLIPS: Record<string, Clip> = {
  idle: idleClip(BRUTE_BASE, 0.03),
  walk: walkClip(BRUTE_BASE, 1.25, 0.36, 0.05),
  run: walkClip({ ...BRUTE_BASE, fUA: 0.9, fFA: 0.6, wpn: 0.8 }, 0.5, 0.7, 0.4),
  smash: { dur: 1, base: BRUTE_BASE, keys: [
    k(0, {}),
    k(0.45, { fUA: 3.2, fFA: 0.4, wpn: 0.3, bUA: 2.95, bFA: 0.5, lean: -0.22, sq: 1.05, fTh: 0.3, bTh: -0.4 }, easeOutCubic),
    k(0.56, { fUA: 3.3, fFA: 0.45, wpn: 0.35, bUA: 3.0, bFA: 0.5, lean: -0.26 }),
    k(0.66, { fUA: 0.55, fFA: 0.1, wpn: 0.5, bUA: 0.45, bFA: 0.3, lean: 0.7, fTh: 1.0, fSh: -0.9, bTh: -0.6, bSh: -0.3, sq: 0.9 }, easeInQuad),
    k(0.85, { fUA: 0.55, fFA: 0.1, wpn: 0.5, bUA: 0.45, bFA: 0.3, lean: 0.65, fTh: 0.95, fSh: -0.9, bTh: -0.6, bSh: -0.3 }),
    k(1, {}, easeInOutSine),
  ] },
  sweep: { dur: 1, base: BRUTE_BASE, keys: [
    k(0, {}),
    k(0.42, { fUA: -1.0, fFA: -0.3, wpn: -0.3, bUA: -0.7, bFA: -0.2, lean: -0.18, fTh: 0.2, bTh: -0.55, sq: 0.97 }, easeOutCubic),
    k(0.6, { fUA: 1.5, fFA: 0.05, wpn: 0.05, bUA: 1.3, bFA: 0.2, lean: 0.42, fTh: 0.85, fSh: -0.6, bTh: -0.65, bSh: -0.2 }, easeInQuad),
    k(0.8, { fUA: 1.7, fFA: 0.1, wpn: 0.1, bUA: 1.5, bFA: 0.2, lean: 0.38 }),
    k(1, {}, easeInOutSine),
  ] },
  hurt: { dur: 0.3, base: BRUTE_BASE, keys: [k(0, { lean: -0.05, head: 0.3 }), k(1, {}, easeOutCubic)] },
  stagger: { dur: 0.6, base: BRUTE_BASE, keys: [k(0, { lean: -0.3, head: 0.4, fUA: 1.8 }), k(1, BRUTE_KNEEL, easeOutCubic)] },
  death: { dur: 1.2, base: BRUTE_BASE, keys: [k(0, { lean: -0.3, head: 0.4 }), k(0.4, BRUTE_KNEEL, easeOutCubic), k(1, { ...BRUTE_KNEEL, lean: 1.2, rot: 0.3, y: 4, wpn: -1.2 }, easeInQuad)] },
  kneel: { dur: 0.6, base: BRUTE_BASE, keys: [k(0, {}), k(1, BRUTE_KNEEL, easeOutCubic)] },
  roar: { dur: 1, base: BRUTE_BASE, keys: [
    k(0, BRUTE_KNEEL),
    k(0.35, { lean: -0.38, head: -0.55, fUA: 2.3, bUA: 2.3, fFA: 0.7, bFA: 0.7, wpn: 0.4, sq: 1.07 }, easeOutBack),
    k(0.75, { lean: -0.35, head: -0.5, fUA: 2.4, bUA: 2.4, fFA: 0.7, bFA: 0.7, wpn: 0.4, sq: 1.06 }),
    k(1, {}, easeInOutSine),
  ] },
};

export const BULW_DIMS: RigDims = { torso: 14, head: 4.8, neck: 1.4, upperArm: 8, foreArm: 7.6, thigh: 9.2, shin: 9.2, shoulderSpread: 1.9, hipSpread: 1.9 };
export const BULW_BASE: Pose = { ...BASE_POSE, lean: 0.14, bUA: 1.3, bFA: 0.4, fUA: 0.6, fFA: 0.95, wpn: 0.0, bTh: -0.32, bSh: -0.2, fTh: 0.42, fSh: -0.42 };
const BULW_KNEEL: Partial<Pose> = { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.3, bFA: 0.4, fUA: 0.2, fFA: 0.6, wpn: -0.6 };
export const BULW_CLIPS: Record<string, Clip> = {
  idle: idleClip(BULW_BASE, 0.015),
  walk: walkClip(BULW_BASE, 1.05, 0.34, 0.04),
  guard: { dur: 0.3, base: BULW_BASE, keys: [k(0, { bUA: 1.5, bFA: 0.2, lean: 0.2, sq: 0.97 }), k(1, { bUA: 1.5, bFA: 0.2, lean: 0.2, sq: 0.97 })] },
  jab: { dur: 1, base: BULW_BASE, keys: [
    k(0, { bUA: 1.5, bFA: 0.2, lean: 0.2 }),
    k(0.4, { fUA: 0.15, fFA: 1.45, wpn: 0.0, bUA: 1.5, bFA: 0.2, lean: 0.05, fTh: 0.3, bTh: -0.4 }, easeOutCubic),
    k(0.55, { fUA: 1.45, fFA: 0.08, wpn: 0.0, bUA: 1.5, bFA: 0.2, lean: 0.38, fTh: 0.8, fSh: -0.6, bTh: -0.7, bSh: -0.1 }, easeOutBack),
    k(0.75, { fUA: 1.4, fFA: 0.1, wpn: 0.0, bUA: 1.5, bFA: 0.2, lean: 0.34 }),
    k(1, {}, easeInOutSine),
  ] },
  shove: { dur: 1, base: BULW_BASE, keys: [
    k(0, {}), k(0.4, { bUA: 0.8, bFA: 1.0, lean: -0.12, fTh: 0.1, bTh: -0.5, sq: 0.96 }, easeOutCubic),
    k(0.55, { bUA: 1.65, bFA: 0.0, lean: 0.5, fTh: 0.9, fSh: -0.6, bTh: -0.7, bSh: -0.1 }, easeOutBack),
    k(1, {}, easeInOutSine),
  ] },
  hurt: { dur: 0.25, base: BULW_BASE, keys: [k(0, { lean: -0.12, head: 0.3 }), k(1, {}, easeOutCubic)] },
  stagger: { dur: 0.6, base: BULW_BASE, keys: [k(0, { lean: -0.3, head: 0.4, bUA: -0.4 }), k(1, BULW_KNEEL, easeOutCubic)] },
  death: { dur: 1.0, base: BULW_BASE, keys: [k(0, { lean: -0.3, head: 0.4 }), k(0.4, BULW_KNEEL, easeOutCubic), k(1, { ...BULW_KNEEL, lean: 1.2, rot: 0.3, y: 3 }, easeInQuad)] },
  kneel: { dur: 0.6, base: BULW_BASE, keys: [k(0, {}), k(1, BULW_KNEEL, easeOutCubic)] },
  rise: { dur: 0.7, base: BULW_BASE, keys: [k(0, BULW_KNEEL), k(1, {}, easeOutCubic)] },
};

// ---------------------------------------------------------------- shared tank behaviour

abstract class Tank extends Enemy {
  brokenFor = 0;
  constructor(kind: 'brute' | 'bulwark', x: number, y: number, w: number, h: number, elite: string | null) {
    super(kind, x, y, w, h, elite);
    this.superArmor = true;
    this.tank = true;
    this.juggleWhenBroken = true;
    this.brokenMul = 1.6;
  }

  /** Poise broken: down on one knee, open to a long combo. */
  stagger() {
    this.staggered = this.elite ? 5 : 4.5;
    this.brokenFor = this.staggered;
    this.hurtT = 0;
    this.superArmor = false;
    this.grav = 0.72;
    this.setState('stagger', 'stagger', 0.05);
    sfx('stagger', { pan: G.world.pan(this.x), pitch: 0.7 });
    sfx('shieldBreak', { pan: G.world.pan(this.x), pitch: 0.85 });
    fx.ring(this.cx, this.cy, 8, 44, '#fff1c4', 0.35, 3);
    fx.shards(this.cx, this.cy - 6, 10, '#6a6470', 1.2);
    G.camera.addTrauma(0.2 * shakeScale());
    G.world.addRally(8);
    fx.number(this.x, this.y - this.body.h - 16, 'BROKEN', true, '#ffcf6b');
    this.onBroken();
  }
  onBroken() {}

  onRecover() {
    this.superArmor = true;
    this.grav = 1;
    this.brokenFor = 0;
    this.execUsed = false;
    this.attackCd = 0.6;
  }

  update(dt: number) {
    super.update(dt);
    // A broken tank floats a little after a launch so juggles can continue.
    if (this.staggered > 0 && !this.body.onGround && this.body.vy > 0) this.body.vy = Math.min(this.body.vy, 220);
  }

  drawOverlay(ctx: Ctx) {
    super.drawOverlay(ctx);
    if (this.staggered > 0 && !this.dying) {
      // Broken timer ring.
      const f = clamp(this.staggered / (this.brokenFor || 1), 0, 1);
      const y = this.y - this.body.h - 20;
      ctx.strokeStyle = rgba('#ffcf6b', 0.8);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(this.x, y, 9, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- Ironbound Brute

export class Brute extends Tank {
  rushT = 0;
  dazedHit = false;
  constructor(x: number, y: number, elite: string | null) {
    super('brute', x, y, 26, 52, elite);
    this.dims = BRUTE_DIMS;
    this.style = bruteStyle('corrupt');
    this.anim = new Animator(BRUTE_CLIPS, BRUTE_BASE);
    this.anim.play('idle', 0);
    this.anim.time = rand(0, 2);
    if (elite) this.name = 'Overseer of the Kilns';
  }
  groan() {
    sfx('sentinelClank', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.6 });
  }
  onBroken() {
    this.style = bruteStyle('corrupt', 0, true);
  }
  onRecover() {
    super.onRecover();
    this.style = bruteStyle('corrupt');
    this.hitSet.clear();
    this.setState('roar', 'roar', 0.1, 1 / 1.0);
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(200);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
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
    const fast = this.elite ? 0.88 : 1;
    switch (this.state) {
      case 'roar': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st > 0.35 && this.st - dt <= 0.35) {
          sfx('roar', { pan: G.world.pan(this.x), pitch: 0.7 });
          fx.ring(this.x, this.y - 30, 10, 80, CORRUPT.glow, 0.45, 4, 0.6);
          G.camera.addTrauma(0.3 * shakeScale());
          // The roar shoves away anyone standing too close.
          this.strike(-34, -50, 68, 52, 0.4, { kx: sign(dx || 1) * 380, ky: -200, poise: 60, unblockable: true, parryable: false });
        }
        if (this.st >= 1.0) this.setState('move', 'walk', 0.2);
        break;
      }
      case 'smash': {
        const T = 1.25 * fast, u = this.st / T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u >= 0.64 && this.st - dt < 0.64 * T) {
          sfx('sentinelSlam', { pan: G.world.pan(this.x), pitch: 0.75 });
          fx.dust(this.x + this.face * 26, this.y, 16, 2);
          fx.ring(this.x + this.face * 26, this.y, 8, 70, CORRUPT.glow, 0.45, 3, 0.3);
          fx.shards(this.x + this.face * 26, this.y - 4, 8, '#5a5060', 1.3);
          G.camera.addTrauma(0.5 * shakeScale());
          this.strike(-6, -46, 64, 50, 1.5, { poise: 90, kx: this.face * 300, ky: -300 });
          if (this.elite || this.hp < this.maxHp * 0.5) {
            G.world.add(new Proj('wave', this.x + this.face * 34, this.y, 'enemy', this.dmg * 0.6, { vx: this.face * 240, life: 1.3, w: 14, h: 22, color: CORRUPT.glow }));
          }
        }
        if (u >= 1) {
          this.attackCd = rand(0.9, 1.5);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      case 'sweep': {
        const T = 0.95 * fast, u = this.st / T;
        b.vx = approach(b.vx, u > 0.5 && u < 0.62 ? this.face * 90 : 0, 900 * dt);
        if (u > 0.55 && u < 0.7) {
          if (this.st - dt < 0.55 * T) {
            sfx('swingHeavy', { pan: G.world.pan(this.x), pitch: 0.6 });
            fx.slash(this.x + this.face * 6, this.y - 26, 38, -2.6, 0.6, 12, this.face, '#d8b8ff', CORRUPT.glow, 0.2);
          }
          this.strike(-16, -50, 66, 50, 1.15, { kx: this.face * 380, ky: -170, poise: 70 });
        }
        if (u >= 1) {
          this.attackCd = rand(0.7, 1.2);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      case 'rush': {
        // Windup, then a straight bull rush until it hits something.
        if (this.st < 0.55) {
          b.vx = approach(b.vx, -this.face * 30, 600 * dt);
          if (Math.random() < dt * 30) fx.dust(this.x - this.face * 10, this.y, 1, 0.6);
          break;
        }
        if (this.st - dt < 0.55) sfx('roar', { pan: G.world.pan(this.x), pitch: 0.9, vol: 0.7 });
        b.vx = this.face * 210;
        this.rushT += dt;
        if (Math.random() < dt * 40) fx.dust(this.x - this.face * 12, this.y, 1, 0.9);
        this.strike(0, -48, 30, 48, 1.1, { kx: this.face * 420, ky: -240, poise: 90 });
        if (wallAhead(b, this.face, G.world.grid, G.world.solid)) {
          // Rammed a wall: dazed and open.
          b.vx = -this.face * 60;
          sfx('wallBreak', { pan: G.world.pan(this.x), vol: 0.6 });
          fx.shards(this.x + this.face * 14, this.y - 30, 10, '#6a6070', 1.2);
          G.camera.addTrauma(0.45 * shakeScale());
          this.poise = 0;
          this.stagger();
          this.staggered = 2.4;
          this.brokenFor = 2.4;
          break;
        }
        if (this.rushT > 1.1 || (sign(t.x - this.x) !== this.face && Math.abs(t.x - this.x) > 50)) {
          this.attackCd = rand(1.0, 1.6);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround) {
          if (dist < 58 && Math.abs(t.y - this.y) < 46) {
            this.hitSet.clear();
            if (Math.random() < 0.55) this.setState('smash', 'smash', 0.08, 1 / (1.25 * fast));
            else this.setState('sweep', 'sweep', 0.08, 1 / (0.95 * fast));
            break;
          }
          if (dist > 110 && dist < 260 && Math.abs(t.y - this.y) < 30 && Math.random() < dt * (this.elite ? 1.4 : 0.9)) {
            this.hitSet.clear();
            this.rushT = 0;
            this.setState('rush', 'run', 0.1);
            break;
          }
        }
        const moving = this.walkToward(t.x, this.elite ? 40 : 32, dt, 46);
        const want = moving && Math.abs(b.vx) > 5 ? 'walk' : 'idle';
        if (this.anim!.name !== want) this.anim!.play(want, 0.2);
        this.state = 'move';
      }
    }
  }
  draw(ctx: Ctx) {
    this.drawHumanoidBody(ctx);
    const T = this.elite ? 0.88 : 1;
    const telegraph = (this.state === 'smash' && this.st < 0.6 * 1.25 * T && this.st > 0.2) || (this.state === 'sweep' && this.st < 0.5 * 0.95 * T && this.st > 0.15) || (this.state === 'rush' && this.st < 0.55);
    if (telegraph) this.glint(ctx, this.x + this.face * 6, this.y - 50, this.state === 'rush' ? '#ff2a3a' : '#ff6a7a');
  }
}

// ---------------------------------------------------------------- Shieldwall Bulwark

export class Bulwark extends Tank {
  turnT = 0;
  shieldUp = true;
  constructor(x: number, y: number, elite: string | null) {
    super('bulwark', x, y, 22, 46, elite);
    this.dims = BULW_DIMS;
    this.style = bulwarkStyle('corrupt');
    this.anim = new Animator(BULW_CLIPS, BULW_BASE);
    this.anim.play('guard', 0);
    if (elite) this.name = 'Bulwark of the Tower';
  }
  groan() {
    sfx('sentinelClank', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.85 });
  }
  guardCheck(h: HitInfo) {
    const frontal = h.dir !== 0 && sign(h.dir) !== this.face;
    if (!this.shieldUp || !frontal || this.staggered > 0 || this.dying) return false;
    if (h.kind === 'ability' && !h.guardBreak) {
      // Holy power still bites through, at half strength.
      h.dmg *= 0.5;
      return false;
    }
    // Every blocked blow wears the shield arm down; guard breakers hit hard.
    this.poise -= h.poise * (h.guardBreak ? 1.6 : 0.3);
    this.poiseDelay = 1.4;
    if (this.poise <= 0) {
      this.stagger();
      return false;
    }
    sfx('armorClank', { pan: G.world.pan(this.x), gap: 50 });
    fx.hitSparks(this.x + this.face * 12, this.y - 26, -this.face, '#e8c8a8', 8);
    this.body.vx = -this.face * 30;
    if (h.src && h.src === G.world.player && h.kind === 'melee') G.world.player.body.vx = this.face * 140;
    this.anim?.play('guard', 0.03, true);
    return true;
  }
  onBroken() {
    this.shieldUp = false;
    this.style = bulwarkStyle('corrupt', 0, false);
    // The shield clatters away.
    fx.shards(this.x + this.face * 10, this.y - 24, 14, '#5a4030', 1.4);
  }
  onRecover() {
    super.onRecover();
    this.shieldUp = true;
    this.style = bulwarkStyle('corrupt');
    this.setState('move', 'rise', 0.1);
    sfx('shieldBash', { pan: G.world.pan(this.x), pitch: 0.8 });
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(190);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
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
    // Slow to turn behind its shield: the opening Phantom Step exploits.
    if (sign(dx) !== this.face && dist > 6) {
      this.turnT += dt;
      if (this.turnT > (this.elite ? 0.55 : 0.8)) {
        this.face = sign(dx);
        this.turnT = 0;
        sfx('sentinelClank', { pan: G.world.pan(this.x), vol: 0.4, pitch: 1.1 });
      }
    } else this.turnT = 0;
    switch (this.state) {
      case 'jab': {
        const T = 0.75, u = this.st / T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.5 && u < 0.64) {
          if (this.st - dt < 0.5 * T) sfx('swingSpear', { pan: G.world.pan(this.x) });
          this.strike(6, -42, 50, 16, 0.9, { poise: 30, kx: this.face * 200, ky: -60 });
        }
        if (u >= 1) {
          this.attackCd = rand(0.6, 1.1);
          this.setState('move', 'guard', 0.2);
        }
        break;
      }
      case 'shove': {
        const T = 0.7, u = this.st / T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.4 && u < 0.6) {
          if (this.st - dt < 0.4 * T) {
            b.vx = this.face * 180;
            sfx('shieldBash', { pan: G.world.pan(this.x) });
          }
          this.strike(0, -44, 28, 44, 0.6, { kx: this.face * 420, ky: -170, poise: 70, parryable: true });
        }
        if (u >= 1) {
          this.attackCd = rand(0.6, 1.0);
          this.setState('move', 'guard', 0.2);
        }
        break;
      }
      default: {
        if (this.attackCd <= 0 && b.onGround && this.turnT === 0 && sign(dx) === this.face) {
          if (dist < 40 && Math.abs(t.y - this.y) < 40) {
            this.hitSet.clear();
            this.setState('shove', 'shove', 0.06, 1 / 0.7);
            break;
          }
          if (dist < 70 && Math.abs(t.y - this.y) < 40) {
            this.hitSet.clear();
            this.setState('jab', 'jab', 0.06, 1 / 0.75);
            break;
          }
        }
        // Advance step by step behind the shield, never turning its back.
        const want = dist > 54 ? sign(dx) : 0;
        b.vx = approach(b.vx, want === this.face ? want * (this.elite ? 34 : 26) : 0, 500 * dt);
        if (b.onGround && want && wallAhead(b, want, G.world.grid, G.world.solid)) b.vx = 0;
        const clip = Math.abs(b.vx) > 5 ? 'walk' : 'guard';
        if (this.anim!.name !== clip && this.anim!.name !== 'rise') this.anim!.play(clip, 0.2);
        if (this.anim!.name === 'rise' && this.anim!.done) this.anim!.play('guard', 0.2);
        this.state = 'move';
      }
    }
  }
  draw(ctx: Ctx) {
    this.drawHumanoidBody(ctx);
    if ((this.state === 'jab' && this.st < 0.5 * 0.75 && this.st > 0.12) || (this.state === 'shove' && this.st < 0.4 * 0.7)) {
      this.glint(ctx, this.x + this.face * 4, this.y - 44, '#ff6a7a');
    }
    if (this.turnT > 0.15 && !this.dying) {
      // A visible "turning" tell: the helm glances back.
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x - this.face * 6, this.y - 44, 8, '#ffcf6b', 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// ---------------------------------------------------------------- Crimson Knight

/** The Marshal's honour guard: a duelist in red, quick to parry. */
export class Knight extends Enemy {
  combo = 0;
  parryCd = 0;
  cape: Chain;
  constructor(x: number, y: number, elite: string | null) {
    super('knight', x, y, 16, 40, elite);
    this.dims = SENT_DIMS;
    this.style = knightStyle();
    this.anim = new Animator(SENT_CLIPS, SENT_BASE);
    this.anim.play('idle', 0);
    this.cape = new Chain(7, 4, x, y - 34);
    this.superArmor = false;
    if (elite) this.name = 'Knight-Captain of the Tower';
  }
  groan() {
    sfx('sentinelClank', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.2 });
  }
  guardCheck(h: HitInfo) {
    // A practised parry: turns aside some frontal blows, then ripostes.
    const frontal = h.dir !== 0 && sign(h.dir) !== this.face;
    if (!frontal || this.parryCd > 0 || h.guardBreak || h.kind !== 'melee' || this.staggered > 0 || this.state === 'slash' || this.state === 'lunge') return false;
    if (Math.random() > (this.elite ? 0.4 : 0.28)) return false;
    this.parryCd = 2.2;
    sfx('parry', { pan: G.world.pan(this.x), pitch: 0.8 });
    fx.hitSparks(this.x + this.face * 10, this.y - 26, -this.face, '#ffb0b0', 12, 1.1);
    if (h.src === G.world.player) G.world.player.body.vx = this.face * 160;
    this.hitSet.clear();
    this.setState('slash', 'slash', 0.03, 1 / 0.6);
    this.st = 0.12;
    return true;
  }
  think(dt: number) {
    const b = this.body;
    this.parryCd = Math.max(0, this.parryCd - dt);
    if (!this.aggro) {
      const t = this.pickTarget(220);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
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
    switch (this.state) {
      case 'slash': {
        const T = 0.6, u = this.st / T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.52 && u < 0.68) {
          if (this.st - dt < 0.52 * T) {
            b.vx = this.face * 140;
            sfx('swing', { pan: G.world.pan(this.x), pitch: 0.85 });
            fx.slash(this.x + this.face * 4, this.y - 26, 24, -2.0, 0.6, 7, this.face, '#ffd0d0', '#ff3a4a', 0.15);
          }
          this.strike(-4, -44, 38, 46, 1, { poise: 30 });
        }
        if (u >= 1) {
          if (this.combo < (this.elite ? 2 : 1) && dist < 60) {
            this.combo++;
            this.hitSet.clear();
            this.setState('slash', 'slash', 0.05, 1 / 0.55);
          } else {
            this.combo = 0;
            this.attackCd = rand(0.6, 1.1);
            this.setState('move', 'walk', 0.2);
          }
        }
        break;
      }
      case 'lunge': {
        const u = this.st / 0.75;
        if (u < 0.45) b.vx = approach(b.vx, 0, 900 * dt);
        else if (u < 0.7) {
          if (this.st - dt < 0.45 * 0.75) {
            sfx('dash', { pan: G.world.pan(this.x), pitch: 0.8 });
            fx.streak(this.x, this.y - 22, this.x + this.face * 60, this.y - 22, '#ff6a7a', 0.2, 3);
          }
          b.vx = this.face * 330;
          this.strike(0, -40, 30, 34, 1.1, { poise: 40, kx: this.face * 260 });
        } else b.vx = approach(b.vx, 0, 1200 * dt);
        if (u >= 1) {
          this.attackCd = rand(0.7, 1.2);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround && Math.abs(t.y - this.y) < 40) {
          if (dist < 46) {
            this.hitSet.clear();
            this.setState('slash', 'slash', 0.06, 1 / 0.6);
            break;
          }
          if (dist > 80 && dist < 170 && Math.random() < dt * 1.5) {
            this.hitSet.clear();
            this.setState('lunge', 'bash', 0.06, 1 / 0.75);
            break;
          }
        }
        const moving = this.walkToward(t.x, this.elite ? 70 : 58, dt, 34);
        const want = moving && Math.abs(b.vx) > 5 ? 'walk' : 'guard';
        if (this.anim!.name !== want) this.anim!.play(want, 0.2);
        this.state = 'move';
      }
    }
  }
  update(dt: number) {
    super.update(dt);
    const f = this.face;
    this.cape.update(this.x + f * (this.j.shBX - 2), this.y + this.j.shBY, dt, -this.body.vx * 2 - f * 50, 400, 0.88);
  }
  draw(ctx: Ctx) {
    if (!this.dying || this.awaitingPurify) drawRibbon(ctx, this.cape, 11, 15, '#6a1418', CORRUPT.outline);
    this.drawHumanoidBody(ctx);
    if ((this.state === 'slash' && this.st < 0.45 * 0.6) || (this.state === 'lunge' && this.st < 0.45 * 0.75)) this.glint(ctx, this.x + this.face * 4, this.y - 40, '#ff3a4a');
  }
}

export { easeOutBack };
