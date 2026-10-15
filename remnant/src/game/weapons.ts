// Weapon movesets and Elior's animation clips. Every attack is data:
// timing, hitbox, damage, knockback, slash VFX, and the keyframes that sell it.

import type { Clip, Pose } from '../render/skeleton';
import { BASE_POSE } from '../render/skeleton';
import { easeOutCubic, easeInQuad, easeOutQuad, easeInOutSine, easeOutBack } from '../core/math';
import type { WeaponFamily } from './data';

export interface AttackDef {
  id: string;
  clip: string;
  dur: number;
  /** Active window in normalized clip time. */
  hit: [number, number];
  box: { x: number; y: number; w: number; h: number };
  dmg: number;
  poise: number;
  kx: number;
  ky: number;
  /** Normalized time after which the next attack/dodge may cancel. */
  cancel: number;
  lunge?: number;
  lungeT?: [number, number];
  launch?: boolean;
  pierce?: boolean;
  guardBreak?: boolean;
  stop: number;
  shake: number;
  sfx: string;
  arc?: { cx: number; cy: number; r: number; a0: number; a1: number; w: number; tilt?: number };
  next?: string;
  air?: boolean;
  /** Vertical velocity applied when an air attack connects (keeps juggles alive). */
  hang?: number;
  /** Player vertical velocity at start (launchers that carry Elior up). */
  rise?: number;
  finisher?: boolean;
  /** Number of separate hits spread evenly across the active window. */
  multi?: number;
  /** Draw enemies within this radius toward Elior while active (whirlwinds). */
  pull?: number;
  /** Diving air attack: drives Elior down and forward, ends in an impact on landing. */
  dive?: boolean;
  /** Carries Elior upward whether or not Up is held. */
  forceRise?: boolean;
  /** Attack started automatically when this one completes. */
  auto?: string;
  /** Number of full yaw spins drawn across the attack (sprite turns). */
  spin?: number;
}

const IDLE_BLADE: Pose = {
  ...BASE_POSE,
  lean: 0.08, head: -0.04,
  bUA: -0.3, bFA: 0.55, fUA: 0.35, fFA: 0.85, wpn: 0.95,
  bTh: -0.14, bSh: -0.14, fTh: 0.24, fSh: -0.28,
};
const IDLE_SPEAR: Pose = {
  ...IDLE_BLADE,
  bUA: 1.05, bFA: 0.7, fUA: 0.55, fFA: 1.05, wpn: 0.1, lean: 0.1,
};
const IDLE_GREAT: Pose = {
  ...IDLE_BLADE,
  bUA: 0.5, bFA: 0.9, fUA: 0.45, fFA: 0.95, wpn: 1.05, lean: 0.12, fTh: 0.3, fSh: -0.35, bTh: -0.2,
};

export const IDLE_POSE: Record<WeaponFamily, Pose> = { blade: IDLE_BLADE, spear: IDLE_SPEAR, greatsword: IDLE_GREAT };

// ---------- shared locomotion clips (procedural) ----------

function runClip(base: Pose, armLock = 0.85): Clip {
  return {
    dur: 0.46, loop: true, base, steps: [0.25, 0.75],
    fn: (u) => {
      const p = u * Math.PI * 2;
      const s = Math.sin(p);
      const shinF = -0.25 - 1.15 * Math.max(0, Math.cos(p - 0.5));
      const shinB = -0.25 - 1.15 * Math.max(0, Math.cos(p + Math.PI - 0.5));
      return {
        lean: base.lean + 0.2 + Math.sin(p * 2) * 0.03,
        head: -0.12,
        fTh: 0.78 * s, fSh: shinF,
        bTh: -0.78 * s, bSh: shinB,
        bUA: base.bUA * armLock + 0.75 * s * (1 - armLock * 0.6), bFA: base.bFA + 0.25,
        fUA: base.fUA + 0.1 * Math.sin(p + Math.PI), fFA: base.fFA,
        y: -1.2 * Math.abs(Math.cos(p)),
      };
    },
  };
}

function idleClip(base: Pose): Clip {
  return {
    dur: 3, loop: true, base,
    fn: (u) => {
      const b = Math.sin(u * Math.PI * 2);
      return {
        lean: base.lean + b * 0.025, y: b * 0.35, fUA: base.fUA + b * 0.04, bUA: base.bUA - b * 0.05,
        head: base.head + Math.sin(u * Math.PI * 4) * 0.02,
      };
    },
  };
}

function common(base: Pose): Record<string, Clip> {
  return {
    idle: idleClip(base),
    run: runClip(base),
    walk: { ...runClip(base), dur: 0.8 },
    jump: { dur: 0.25, base, keys: [{ t: 0, p: { lean: 0.05, fTh: 1.0, fSh: -1.6, bTh: 0.2, bSh: -0.7, bUA: -1.0, bFA: 0.6, fUA: 0.8, sq: 1.06 } }, { t: 1, p: { lean: 0.08, fTh: 0.8, fSh: -1.4, bTh: 0.05, bSh: -0.6, bUA: -0.8, bFA: 0.5, fUA: 0.7 }, ease: easeOutQuad }] },
    fall: { dur: 0.35, base, keys: [{ t: 0, p: { lean: 0.05, fTh: 0.6, fSh: -0.9, bTh: -0.1, bSh: -0.5, bUA: -1.2, bFA: 0.5, fUA: 0.85 } }, { t: 1, p: { lean: 0.02, fTh: 0.35, fSh: -0.4, bTh: -0.3, bSh: -0.55, bUA: -1.5, bFA: 0.4, fUA: 1.0 }, ease: easeInOutSine }] },
    land: { dur: 0.16, base, keys: [{ t: 0, p: { lean: 0.4, fTh: 0.85, fSh: -1.5, bTh: -0.25, bSh: -1.2, sq: 0.9, bUA: -0.5, fUA: 0.5 } }, { t: 1, p: {}, ease: easeOutCubic }] },
    flip: { dur: 0.36, base, keys: [{ t: 0, p: { fTh: 1.4, fSh: -2.2, bTh: 1.2, bSh: -2.1, bUA: 0.6, bFA: 1.2, fUA: 0.8, fFA: 1.2, rot: 0, lean: 0.3 } }, { t: 0.85, p: { fTh: 1.4, fSh: -2.2, bTh: 1.2, bSh: -2.1, bUA: 0.6, bFA: 1.2, fUA: 0.8, fFA: 1.2, rot: Math.PI * 2, lean: 0.3 }, ease: easeOutQuad }, { t: 1, p: { fTh: 0.5, fSh: -0.8, bTh: -0.1, bSh: -0.5, bUA: -1.1, rot: Math.PI * 2 } }] },
    roll: { dur: 0.34, base, keys: [{ t: 0, p: { lean: 0.6, fTh: 1.5, fSh: -2.3, bTh: 1.1, bSh: -2.2, bUA: 1.0, bFA: 1.3, fUA: 0.9, fFA: 1.4, rot: 0, y: -3 } }, { t: 0.82, p: { lean: 0.6, fTh: 1.5, fSh: -2.3, bTh: 1.1, bSh: -2.2, bUA: 1.0, bFA: 1.3, fUA: 0.9, fFA: 1.4, rot: Math.PI * 2, y: -3 }, ease: easeInOutSine }, { t: 1, p: { lean: 0.35, fTh: 0.7, fSh: -1.2, bTh: -0.3, bSh: -1.0, rot: Math.PI * 2 } }] },
    airdash: { dur: 0.2, base, keys: [{ t: 0, p: { lean: 0.9, fTh: -0.2, fSh: -0.7, bTh: -0.7, bSh: -0.5, fUA: -1.4, fFA: 0.3, wpn: 0.4, bUA: -1.6, bFA: 0.2, head: -0.5 } }, { t: 1, p: { lean: 0.8, fTh: -0.1, fSh: -0.6, bTh: -0.6, bSh: -0.4, fUA: -1.3, fFA: 0.3, wpn: 0.4, bUA: -1.5, bFA: 0.2, head: -0.5 } }] },
    hurt: { dur: 0.3, base, keys: [{ t: 0, p: { lean: -0.45, head: 0.35, bUA: -2.0, bFA: 0.3, fUA: 1.9, fFA: 0.2, fTh: 0.4, fSh: -0.4, bTh: -0.4, bSh: -0.6 } }, { t: 1, p: {}, ease: easeOutCubic }] },
    knockdown: { dur: 0.7, base, keys: [{ t: 0, p: { lean: -0.6, head: 0.4, bUA: -2.2, fUA: 2.1, fTh: 0.8, fSh: -0.3, bTh: 0.4, bSh: -0.2, rot: -0.3 } }, { t: 0.5, p: { lean: -1.2, rot: -1.1, fTh: 1.2, bTh: 0.9, y: 4 } }, { t: 1, p: { lean: 0.3, fTh: 1.2, fSh: -2.2, bTh: -0.2, bSh: -1.8, rot: 0 } }] },
    parry: { dur: 0.28, base, keys: [{ t: 0, p: { lean: -0.05, fUA: 1.95, fFA: 0.95, wpn: 0.6, bUA: 1.1, bFA: 0.7, fTh: 0.55, fSh: -0.45, bTh: -0.45, bSh: -0.3 }, ease: easeOutQuad }, { t: 0.6, p: { lean: -0.05, fUA: 1.95, fFA: 0.95, wpn: 0.6, bUA: 1.1, bFA: 0.7, fTh: 0.55, fSh: -0.45, bTh: -0.45, bSh: -0.3 } }, { t: 1, p: {} }] },
    block: { dur: 0.2, base, keys: [{ t: 0, p: { lean: 0.02, fUA: 1.75, fFA: 1.05, wpn: 0.55, bUA: 1.0, bFA: 0.8, fTh: 0.45, fSh: -0.5, bTh: -0.45, bSh: -0.35, sq: 0.97 } }, { t: 1, p: { lean: 0.02, fUA: 1.75, fFA: 1.05, wpn: 0.55, bUA: 1.0, bFA: 0.8, fTh: 0.45, fSh: -0.5, bTh: -0.45, bSh: -0.35, sq: 0.97 } }] },
    blockHit: { dur: 0.18, base, keys: [{ t: 0, p: { lean: -0.2, fUA: 1.6, fFA: 1.2, wpn: 0.55, bUA: 0.8, bFA: 0.9, fTh: 0.3, fSh: -0.3, bTh: -0.6, bSh: -0.4 } }, { t: 1, p: { lean: 0.02, fUA: 1.75, fFA: 1.05, wpn: 0.55, bUA: 1.0, bFA: 0.8, fTh: 0.45, fSh: -0.5, bTh: -0.45, bSh: -0.35 } }] },
    heal: { dur: 0.9, base, keys: [{ t: 0, p: {} }, { t: 0.3, p: { bUA: 2.3, bFA: 2.3, head: -0.35, lean: -0.05, fUA: 0.15, fFA: 0.3, wpn: 0.3 }, ease: easeOutCubic }, { t: 0.75, p: { bUA: 2.4, bFA: 2.4, head: -0.45, lean: -0.08, fUA: 0.15, fFA: 0.3, wpn: 0.3 } }, { t: 1, p: {}, ease: easeInOutSine }] },
    cast: { dur: 0.42, base, keys: [{ t: 0, p: { lean: -0.05, bUA: 0.4, fUA: 0.9, fFA: 1.4 } }, { t: 0.3, p: { lean: 0.2, fUA: 1.55, fFA: 0.05, wpn: 1.4, bUA: 2.7, bFA: 0.2, fTh: 0.6, fSh: -0.5, bTh: -0.5, bSh: -0.2 }, ease: easeOutBack }, { t: 0.7, p: { lean: 0.18, fUA: 1.5, fFA: 0.05, wpn: 1.4, bUA: 2.6, bFA: 0.2, fTh: 0.6, fSh: -0.5, bTh: -0.5, bSh: -0.2 } }, { t: 1, p: {} }] },
    invoke: { dur: 0.7, base, keys: [{ t: 0, p: { lean: 0.1, bUA: 0.2, fUA: 0.3 } }, { t: 0.35, p: { lean: -0.2, head: -0.4, fUA: 3.0, fFA: 0.1, wpn: 0.05, bUA: 2.9, bFA: 0.1, fTh: 0.3, bTh: -0.3, sq: 1.04 }, ease: easeOutBack }, { t: 0.8, p: { lean: -0.2, head: -0.4, fUA: 3.0, fFA: 0.1, wpn: 0.05, bUA: 2.9, bFA: 0.1, fTh: 0.3, bTh: -0.3, sq: 1.04 } }, { t: 1, p: {} }] },
    kneel: { dur: 0.6, base, keys: [{ t: 0, p: {} }, { t: 1, p: { fTh: 1.45, fSh: -2.5, bTh: -0.15, bSh: -1.95, lean: 0.35, head: 0.3, fUA: 0.2, fFA: 0.4, wpn: -0.3, bUA: 0.3, bFA: 0.5 }, ease: easeOutCubic }] },
    death: { dur: 1.2, base, keys: [{ t: 0, p: { lean: -0.3, head: 0.3 } }, { t: 0.35, p: { fTh: 1.45, fSh: -2.5, bTh: -0.15, bSh: -1.95, lean: 0.55, head: 0.5, fUA: 0.1, bUA: 0.1 }, ease: easeOutCubic }, { t: 1, p: { fTh: 1.45, fSh: -2.5, bTh: -0.15, bSh: -1.95, lean: 1.25, head: 0.6, fUA: 0.4, fFA: 0.2, bUA: 0.6, rot: 0.25, y: 2 }, ease: easeInQuad }] },
    charge: { dur: 0.5, loop: true, base, fn: (u, sec) => ({ lean: -0.12 + Math.sin(sec * 30) * 0.004, fUA: 3.3, fFA: 0.55, wpn: 0.3, bUA: 2.4, bFA: 0.9, fTh: 0.55, fSh: -0.55, bTh: -0.55, bSh: -0.3, head: 0.05, sq: 0.98 }) },
    executeLeap: { dur: 0.35, base, keys: [{ t: 0, p: { lean: 0.2, fTh: 1.2, fSh: -1.8, bTh: 0.6, bSh: -1.5, fUA: 3.2, fFA: 0.2, wpn: 0.1, bUA: 2.8 } }, { t: 1, p: { lean: 0.3, fTh: 1.0, fSh: -1.6, bTh: 0.4, bSh: -1.3, fUA: 3.3, fFA: 0.1, wpn: 0.1, bUA: 2.9 } }] },
    executeStrike: { dur: 0.5, base, keys: [{ t: 0, p: { lean: 0.3, fUA: 3.3, fFA: 0.1, wpn: 0.1, bUA: 2.9 } }, { t: 0.25, p: { lean: 0.9, fUA: 0.4, fFA: 0.0, wpn: -0.4, bUA: 0.5, bFA: 0.2, fTh: 1.2, fSh: -1.9, bTh: -0.3, bSh: -1.6 }, ease: easeInQuad }, { t: 1, p: { lean: 0.8, fUA: 0.4, fFA: 0.0, wpn: -0.4, bUA: 0.4, fTh: 1.2, fSh: -1.9, bTh: -0.3, bSh: -1.6 } }] },
    talk: idleClip(base),
  };
}

// ---------- attack clips ----------

const k = (t: number, p: Partial<Pose>, ease?: (x: number) => number) => ({ t, p, ease });

const BLADE_CLIPS: Record<string, Clip> = {
  b1: { dur: 1, keys: [
    k(0, { fUA: 2.9, fFA: 0.5, wpn: 0.4, lean: -0.05, fTh: 0.3, fSh: -0.3, bTh: -0.25, bSh: -0.2, bUA: -0.6, bFA: 0.6 }),
    k(0.2, { fUA: 3.0, fFA: 0.55, wpn: 0.45, lean: -0.08 }),
    k(0.32, { fUA: 2.0, fFA: 0.2, wpn: 0.2, lean: 0.2 }, easeInQuad),
    k(0.45, { fUA: 0.8, fFA: 0.15, wpn: 0.05, lean: 0.34, fTh: 0.65, fSh: -0.5, bTh: -0.55, bSh: -0.2, bUA: -1.0 }, easeOutCubic),
    k(0.7, { fUA: 0.55, fFA: 0.45, wpn: 0.3, lean: 0.28, fTh: 0.6, fSh: -0.5, bTh: -0.5 }),
    k(1, {}, easeInOutSine),
  ] },
  b2: { dur: 1, keys: [
    k(0, { fUA: -0.3, fFA: 0.45, wpn: -0.5, lean: 0.22, fTh: 0.5, fSh: -0.6, bTh: -0.4, bSh: -0.3, bUA: 0.6 }),
    k(0.2, { fUA: -0.45, fFA: 0.5, wpn: -0.55, lean: 0.25 }),
    k(0.32, { fUA: 1.2, fFA: 0.2, wpn: 0.3, lean: 0.25 }, easeInQuad),
    k(0.46, { fUA: 2.6, fFA: 0.2, wpn: 0.3, lean: 0.05, fTh: 0.4, bTh: -0.4, bUA: -1.2 }, easeOutCubic),
    k(0.72, { fUA: 2.3, fFA: 0.6, wpn: 0.4, lean: 0.06 }),
    k(1, {}, easeInOutSine),
  ] },
  b3: { dur: 1, keys: [
    k(0, { fUA: -1.3, fFA: 0.2, wpn: -0.4, lean: -0.12, fTh: 0.2, fSh: -0.4, bTh: -0.3, bSh: -0.3, bUA: 1.0, bFA: 0.4, sq: 0.97 }),
    k(0.28, { fUA: -1.5, fFA: 0.25, wpn: -0.45, lean: -0.16, sq: 0.95 }),
    k(0.38, { fUA: 0.4, fFA: 0.2, wpn: 0.1, lean: 0.25 }, easeInQuad),
    k(0.48, { fUA: 1.6, fFA: 0.0, wpn: 0.0, lean: 0.45, fTh: 1.05, fSh: -0.8, bTh: -0.85, bSh: -0.1, bUA: -1.2, sq: 1 }, easeOutCubic),
    k(0.75, { fUA: 2.1, fFA: 0.3, wpn: 0.4, lean: 0.38, fTh: 1.0, fSh: -0.8, bTh: -0.8, bSh: -0.1 }),
    k(1, {}, easeInOutSine),
  ] },
  b4: { dur: 1, keys: [
    k(0, { fUA: 0.1, fFA: 0.2, wpn: -0.2, lean: 0.35, fTh: 0.9, fSh: -1.4, bTh: -0.3, bSh: -1.0, sq: 0.94 }),
    k(0.25, { fUA: 0.0, fFA: 0.2, wpn: -0.2, lean: 0.4, sq: 0.92 }),
    k(0.42, { fUA: 3.0, fFA: 0.1, wpn: 0.1, lean: -0.1, fTh: 0.2, fSh: -0.3, bTh: -0.1, bSh: -0.3, sq: 1.08, bUA: -1.6 }, easeOutCubic),
    k(1, { fUA: 2.6, fFA: 0.4, wpn: 0.2, lean: 0 }),
  ] },
  air1: { dur: 1, keys: [
    k(0, { fUA: 2.8, fFA: 0.5, wpn: 0.4, lean: 0.0, fTh: 0.9, fSh: -1.3, bTh: 0.2, bSh: -0.8, bUA: -0.8 }),
    k(0.3, { fUA: 2.0, fFA: 0.2, wpn: 0.2, lean: 0.2 }, easeInQuad),
    k(0.45, { fUA: 0.7, fFA: 0.15, wpn: 0.05, lean: 0.35, bUA: -1.1 }, easeOutCubic),
    k(1, { fUA: 0.6, fFA: 0.5, wpn: 0.3, lean: 0.2, fTh: 0.7, fSh: -1.1, bTh: 0.1, bSh: -0.7 }),
  ] },
  air2: { dur: 1, keys: [
    k(0, { fUA: -0.2, fFA: 0.4, wpn: -0.5, lean: 0.25, fTh: 0.9, fSh: -1.4, bTh: 0.3, bSh: -0.9 }),
    k(0.3, { fUA: 1.2, fFA: 0.2, wpn: 0.3, lean: 0.25 }, easeInQuad),
    k(0.45, { fUA: 2.6, fFA: 0.2, wpn: 0.3, lean: 0.05, bUA: -1.3 }, easeOutCubic),
    k(1, { fUA: 2.3, fFA: 0.5, wpn: 0.4, fTh: 0.8, fSh: -1.2, bTh: 0.2, bSh: -0.8 }),
  ] },
  air3: { dur: 1, keys: [
    k(0, { fUA: 3.2, fFA: 0.3, wpn: 0.2, lean: -0.15, fTh: 1.2, fSh: -1.8, bTh: 0.8, bSh: -1.6, rot: 0 }),
    k(0.35, { fUA: 1.0, fFA: 0.1, wpn: 0.0, lean: 0.5, rot: 0.6 }, easeInQuad),
    k(0.5, { fUA: 0.4, fFA: 0.1, wpn: 0.0, lean: 0.55, rot: 0.9, bUA: -1.4 }, easeOutCubic),
    k(1, { fUA: 0.6, fFA: 0.4, wpn: 0.3, lean: 0.25, rot: 0, fTh: 0.7, fSh: -1.1, bTh: 0.1, bSh: -0.7 }),
  ] },
  launch: { dur: 1, keys: [
    k(0, { fUA: 0.0, fFA: 0.2, wpn: -0.3, lean: 0.35, fTh: 0.9, fSh: -1.5, bTh: -0.3, bSh: -1.0, sq: 0.92 }),
    k(0.22, { fUA: -0.1, fFA: 0.2, wpn: -0.3, lean: 0.4, sq: 0.9 }),
    k(0.4, { fUA: 3.0, fFA: 0.1, wpn: 0.1, lean: -0.15, fTh: 0.1, fSh: -0.2, bTh: -0.2, bSh: -0.3, sq: 1.1, bUA: -1.8 }, easeOutCubic),
    k(1, { fUA: 2.7, fFA: 0.3, wpn: 0.2, lean: -0.05, fTh: 0.6, fSh: -1.0, bTh: 0.1, bSh: -0.6 }),
  ] },
  plunge: { dur: 1, keys: [
    k(0, { fUA: 2.9, fFA: 0.4, wpn: 0.3, lean: -0.1, fTh: 1.2, fSh: -1.8, bTh: 0.9, bSh: -1.7 }),
    k(0.3, { fUA: 0.9, fFA: 0.9, wpn: -1.75, lean: 0.25, fTh: 0.5, fSh: -1.0, bTh: 0.2, bSh: -0.9, bUA: 1.6, bFA: 0.9 }, easeOutCubic),
    k(1, { fUA: 0.9, fFA: 0.9, wpn: -1.75, lean: 0.25, fTh: 0.4, fSh: -0.8, bTh: 0.1, bSh: -0.8, bUA: 1.6, bFA: 0.9 }),
  ] },
  slam: { dur: 1, keys: [
    k(0, { fUA: 0.9, fFA: 0.9, wpn: -1.75, lean: 0.6, fTh: 1.3, fSh: -2.2, bTh: -0.3, bSh: -1.7, sq: 0.88, bUA: 1.6, bFA: 0.9 }),
    k(0.5, { fUA: 0.8, fFA: 0.8, wpn: -1.6, lean: 0.55, fTh: 1.2, fSh: -2.0, bTh: -0.3, bSh: -1.6, sq: 0.92 }),
    k(1, {}, easeInOutSine),
  ] },
  dash: { dur: 1, keys: [
    k(0, { fUA: -0.6, fFA: 1.6, wpn: 0.1, lean: 0.3, fTh: 0.8, fSh: -1.0, bTh: -0.6, bSh: -0.3 }),
    k(0.3, { fUA: 1.55, fFA: 0.05, wpn: 0.0, lean: 0.55, fTh: 1.1, fSh: -0.7, bTh: -0.9, bSh: -0.1, bUA: -1.5 }, easeOutBack),
    k(0.7, { fUA: 1.5, fFA: 0.05, wpn: 0.0, lean: 0.5, fTh: 1.0, fSh: -0.7, bTh: -0.85, bSh: -0.1 }),
    k(1, {}, easeInOutSine),
  ] },
  heavy: { dur: 1, keys: [
    k(0, { fUA: 3.35, fFA: 0.55, wpn: 0.3, lean: -0.12, bUA: 2.4, bFA: 0.9, fTh: 0.55, fSh: -0.55, bTh: -0.55, bSh: -0.3 }),
    k(0.18, { fUA: 2.0, fFA: 0.2, wpn: 0.1, lean: 0.3 }, easeInQuad),
    k(0.32, { fUA: 0.55, fFA: 0.1, wpn: -0.1, lean: 0.62, fTh: 1.1, fSh: -1.2, bTh: -0.75, bSh: -0.2, bUA: -0.8, sq: 0.94 }, easeOutCubic),
    k(0.7, { fUA: 0.5, fFA: 0.15, wpn: -0.05, lean: 0.55, fTh: 1.05, fSh: -1.15, bTh: -0.7, bSh: -0.2 }),
    k(1, {}, easeInOutSine),
  ] },
  // Seventy Times Seven: rapid alternating thrusts.
  flurry: { dur: 1, fn: (u) => {
    const s = Math.sin(u * Math.PI * 14), a = Math.abs(s);
    return { fUA: 1.5 + s * 0.12, fFA: 0.05 + (1 - a) * 0.95, wpn: s * 0.12, lean: 0.36 + a * 0.08, fTh: 0.9, fSh: -0.7, bTh: -0.75, bSh: -0.15, bUA: -1.1 + s * 0.45, bFA: 0.5, head: -0.05 };
  } },
  // Storm of Edges: arms flung wide while the sprite yaws around.
  storm: { dur: 1, keys: [
    k(0, { fUA: -1.2, fFA: 0.2, wpn: -0.3, lean: -0.15, sq: 0.95, fTh: 0.6, fSh: -0.8, bTh: -0.6, bSh: -0.4 }),
    k(0.14, { fUA: 1.57, fFA: 0.05, wpn: 0.0, bUA: -1.57, bFA: 0.1, lean: 0.12, fTh: 0.7, fSh: -0.7, bTh: -0.6, bSh: -0.3, sq: 0.97 }, easeInQuad),
    k(0.8, { fUA: 1.6, fFA: 0.05, wpn: 0.05, bUA: -1.55, bFA: 0.1, lean: 0.1, fTh: 0.7, fSh: -0.7, bTh: -0.6, bSh: -0.3 }),
    k(1, {}, easeOutCubic),
  ] },
  // Phantom strike: arrives already mid-swing.
  pstrike: { dur: 1, keys: [
    k(0, { fUA: 2.6, fFA: 0.4, wpn: 0.35, lean: 0.1, fTh: 0.8, fSh: -0.9, bTh: -0.5, bSh: -0.5, bUA: -0.9, sq: 0.94 }),
    k(0.3, { fUA: 0.6, fFA: 0.1, wpn: 0.0, lean: 0.45, fTh: 0.85, fSh: -0.7, bTh: -0.7, bSh: -0.2, bUA: -1.3, sq: 1 }, easeOutCubic),
    k(0.65, { fUA: 0.5, fFA: 0.4, wpn: 0.3, lean: 0.35 }),
    k(1, {}, easeInOutSine),
  ] },
  // Judgment Cross: leap, one diagonal cut, then the crossing cut.
  cross: { dur: 1, keys: [
    k(0, { fUA: 0.2, fFA: 0.4, wpn: -0.3, lean: 0.4, fTh: 1.1, fSh: -1.7, bTh: -0.2, bSh: -1.2, sq: 0.88 }),
    k(0.22, { fUA: 3.3, fFA: 0.2, wpn: 0.2, bUA: 2.8, bFA: 0.3, lean: -0.2, fTh: 0.6, fSh: -1.0, bTh: 0.3, bSh: -0.8, sq: 1.08 }, easeOutCubic),
    k(0.42, { fUA: 0.5, fFA: 0.05, wpn: -0.2, bUA: -0.6, lean: 0.55, fTh: 1.0, fSh: -1.2, bTh: -0.4, bSh: -0.8 }, easeInQuad),
    k(0.55, { fUA: -0.6, fFA: 0.3, wpn: -0.5, lean: 0.3 }),
    k(0.7, { fUA: 2.2, fFA: 0.1, wpn: 0.3, bUA: -1.5, lean: 0.1, fTh: 0.9, fSh: -1.1, bTh: -0.5, bSh: -0.7 }, easeOutCubic),
    k(1, { fUA: 2.0, fFA: 0.4, wpn: 0.4, lean: 0.15 }),
  ] },
  // Heaven's Rend: a drilling dive, blade leading.
  rend: { dur: 1, keys: [
    k(0, { fUA: 3.0, fFA: 0.3, wpn: 0.2, lean: -0.2, fTh: 1.2, fSh: -1.8, bTh: 0.8, bSh: -1.6 }),
    k(0.18, { fUA: 1.0, fFA: 0.05, wpn: -0.5, lean: 0.85, rot: 0.5, fTh: 0.4, fSh: -0.5, bTh: -0.2, bSh: -0.6, bUA: -1.8, bFA: 0.2 }, easeOutCubic),
    k(1, { fUA: 1.0, fFA: 0.05, wpn: -0.5, lean: 0.85, rot: 0.5, fTh: 0.4, fSh: -0.5, bTh: -0.2, bSh: -0.6, bUA: -1.8, bFA: 0.2 }),
  ] },
  counter: { dur: 1, keys: [
    k(0, { fUA: 1.9, fFA: 0.95, wpn: 0.6, lean: -0.05 }),
    k(0.18, { fUA: -0.5, fFA: 1.5, wpn: 0.1, lean: 0.1, fTh: 0.6, fSh: -0.7 }, easeOutQuad),
    k(0.32, { fUA: 1.55, fFA: 0.03, wpn: 0.0, lean: 0.55, fTh: 1.15, fSh: -0.7, bTh: -0.95, bSh: -0.1, bUA: -1.6 }, easeOutBack),
    k(0.7, { fUA: 1.5, fFA: 0.05, wpn: 0.0, lean: 0.5, fTh: 1.1, fSh: -0.7, bTh: -0.9, bSh: -0.1 }),
    k(1, {}, easeInOutSine),
  ] },
};

// Spear: thrusts. Back hand rides the shaft.
const SPEAR_CLIPS: Record<string, Clip> = {
  s1: { dur: 1, keys: [
    k(0, { fUA: 0.4, fFA: 1.6, wpn: -0.45, bUA: 1.0, bFA: 0.9, lean: 0.0, fTh: 0.3, bTh: -0.3 }),
    k(0.25, { fUA: 0.3, fFA: 1.7, wpn: -0.45, lean: -0.05 }),
    k(0.4, { fUA: 1.55, fFA: 0.02, wpn: 0.0, bUA: 1.5, bFA: 0.3, lean: 0.35, fTh: 0.8, fSh: -0.6, bTh: -0.7, bSh: -0.1 }, easeOutBack),
    k(0.7, { fUA: 1.5, fFA: 0.05, wpn: 0.0, bUA: 1.45, bFA: 0.35, lean: 0.3, fTh: 0.75, fSh: -0.6, bTh: -0.65 }),
    k(1, {}, easeInOutSine),
  ] },
  s2: { dur: 1, keys: [
    k(0, { fUA: 0.6, fFA: 1.5, wpn: -0.2, bUA: 1.1, bFA: 0.8, lean: 0.05 }),
    k(0.25, { fUA: 0.5, fFA: 1.6, wpn: -0.25, lean: 0.0 }),
    k(0.4, { fUA: 1.9, fFA: 0.02, wpn: 0.0, bUA: 1.8, bFA: 0.3, lean: 0.25, fTh: 0.7, fSh: -0.5, bTh: -0.7, bSh: -0.1 }, easeOutBack),
    k(0.7, { fUA: 1.85, fFA: 0.05, wpn: 0.0, bUA: 1.75, bFA: 0.35, lean: 0.22 }),
    k(1, {}, easeInOutSine),
  ] },
  s3: { dur: 1, keys: [
    k(0, { fUA: 0.0, fFA: 1.9, wpn: -0.4, bUA: 0.8, bFA: 1.1, lean: -0.2, fTh: 0.1, fSh: -0.4, bTh: -0.2, bSh: -0.5, sq: 0.95 }),
    k(0.3, { fUA: -0.1, fFA: 2.0, wpn: -0.45, lean: -0.25, sq: 0.93 }),
    k(0.45, { fUA: 1.57, fFA: 0.0, wpn: 0.0, bUA: 1.55, bFA: 0.2, lean: 0.6, fTh: 1.25, fSh: -0.8, bTh: -1.0, bSh: -0.05, sq: 1 }, easeOutBack),
    k(0.78, { fUA: 1.5, fFA: 0.05, wpn: 0.0, bUA: 1.5, bFA: 0.25, lean: 0.55, fTh: 1.2, fSh: -0.8, bTh: -0.95 }),
    k(1, {}, easeInOutSine),
  ] },
};

// Greatsword reuses the blade's arcs with heavier anticipation (slower clip timing does the rest).
const GREAT_CLIPS: Record<string, Clip> = {
  g1: BLADE_CLIPS.b1, g2: BLADE_CLIPS.b2, g3: BLADE_CLIPS.b3, g4: BLADE_CLIPS.b4,
};

export function clipsFor(family: WeaponFamily): Record<string, Clip> {
  const base = IDLE_POSE[family];
  const all: Record<string, Clip> = { ...common(base) };
  const add = (src: Record<string, Clip>) => {
    for (const [n, c] of Object.entries(src)) all[n] = { ...c, base };
  };
  add(BLADE_CLIPS);
  if (family === 'spear') add(SPEAR_CLIPS);
  if (family === 'greatsword') add(GREAT_CLIPS);
  return all;
}

// ---------- movesets ----------

const ARC_DOWN = { cx: 2, cy: -24, r: 21, a0: -2.1, a1: 0.65, w: 7 };
const ARC_UP = { cx: 2, cy: -22, r: 20, a0: 0.9, a1: -1.7, w: 6 };
const ARC_WIDE = { cx: 0, cy: -22, r: 27, a0: -3.0, a1: 0.35, w: 9 };

export interface Moveset {
  combo: AttackDef[];
  extra: AttackDef;
  air: AttackDef[];
  launch: AttackDef;
  plunge: AttackDef;
  dash: AttackDef;
  heavy: AttackDef;
  counter: AttackDef;
  /** Attack, Attack, pause, Attack. */
  flurry: AttackDef;
  flurryEnd: AttackDef;
  /** Heavy during the third strike. */
  storm: AttackDef;
  /** Attack after a dash attack. */
  comet: AttackDef;
  /** Heavy at the end of an air combo. */
  rend: AttackDef;
  /** Phantom Step's arrival strike. */
  pstrike: AttackDef;
  /** Judgment Cross: the Phantom Step finisher. */
  cross: AttackDef;
  speed: number;
  reach: number;
  weight: number;
}

const blade: Moveset = {
  speed: 1, reach: 1, weight: 1,
  combo: [
    { id: 'b1', clip: 'b1', dur: 0.36, hit: [0.3, 0.5], box: { x: 2, y: -42, w: 30, h: 44 }, dmg: 1.0, poise: 10, kx: 70, ky: -40, cancel: 0.55, lunge: 70, lungeT: [0.25, 0.5], stop: 0.045, shake: 0.12, sfx: 'swing', arc: ARC_DOWN },
    { id: 'b2', clip: 'b2', dur: 0.34, hit: [0.3, 0.5], box: { x: 2, y: -46, w: 30, h: 48 }, dmg: 1.05, poise: 10, kx: 60, ky: -90, cancel: 0.55, lunge: 70, lungeT: [0.25, 0.5], stop: 0.045, shake: 0.12, sfx: 'swing', arc: ARC_UP },
    { id: 'b3', clip: 'b3', dur: 0.5, hit: [0.36, 0.56], box: { x: -6, y: -44, w: 44, h: 46 }, dmg: 1.6, poise: 26, kx: 230, ky: -140, cancel: 0.72, lunge: 160, lungeT: [0.35, 0.55], stop: 0.085, shake: 0.32, sfx: 'swingHeavy', arc: ARC_WIDE, finisher: true },
  ],
  extra: { id: 'b4', clip: 'b4', dur: 0.48, hit: [0.3, 0.52], box: { x: 0, y: -58, w: 32, h: 62 }, dmg: 1.4, poise: 20, kx: 40, ky: -420, launch: true, cancel: 0.6, stop: 0.07, shake: 0.22, sfx: 'swingHeavy', arc: { ...ARC_UP, r: 26 }, rise: -250, finisher: true },
  air: [
    { id: 'air1', clip: 'air1', dur: 0.32, hit: [0.25, 0.5], box: { x: 0, y: -42, w: 32, h: 46 }, dmg: 0.95, poise: 8, kx: 50, ky: -120, cancel: 0.55, stop: 0.04, shake: 0.1, sfx: 'swing', arc: ARC_DOWN, air: true, hang: -150 },
    { id: 'air2', clip: 'air2', dur: 0.32, hit: [0.25, 0.5], box: { x: 0, y: -46, w: 32, h: 50 }, dmg: 0.95, poise: 8, kx: 50, ky: -140, cancel: 0.55, stop: 0.04, shake: 0.1, sfx: 'swing', arc: ARC_UP, air: true, hang: -150 },
    { id: 'air3', clip: 'air3', dur: 0.4, hit: [0.3, 0.55], box: { x: -4, y: -40, w: 40, h: 50 }, dmg: 1.35, poise: 18, kx: 200, ky: 260, cancel: 0.7, stop: 0.07, shake: 0.25, sfx: 'swingHeavy', arc: { cx: 0, cy: -20, r: 24, a0: -2.4, a1: 1.2, w: 8 }, air: true, hang: -60, finisher: true },
  ],
  launch: { id: 'launch', clip: 'launch', dur: 0.46, hit: [0.25, 0.5], box: { x: 0, y: -60, w: 32, h: 64 }, dmg: 1.2, poise: 18, kx: 30, ky: -440, launch: true, cancel: 0.5, stop: 0.06, shake: 0.18, sfx: 'swingHeavy', arc: { ...ARC_UP, r: 26 }, rise: -300 },
  plunge: { id: 'plunge', clip: 'plunge', dur: 2, hit: [0.0, 1.0], box: { x: -10, y: -20, w: 28, h: 30 }, dmg: 1.4, poise: 22, kx: 120, ky: -150, cancel: 1, stop: 0.08, shake: 0.4, sfx: 'swingHeavy' },
  dash: { id: 'dash', clip: 'dash', dur: 0.4, hit: [0.25, 0.55], box: { x: 0, y: -36, w: 38, h: 30 }, dmg: 1.3, poise: 16, kx: 180, ky: -60, cancel: 0.6, lunge: 300, lungeT: [0.2, 0.5], stop: 0.06, shake: 0.18, sfx: 'swingSpear', arc: { cx: 6, cy: -22, r: 30, a0: -0.25, a1: 0.25, w: 6 } },
  heavy: { id: 'heavy', clip: 'heavy', dur: 0.56, hit: [0.18, 0.4], box: { x: -4, y: -56, w: 48, h: 60 }, dmg: 1.9, poise: 40, kx: 260, ky: -160, cancel: 0.7, lunge: 140, lungeT: [0.12, 0.32], stop: 0.1, shake: 0.4, sfx: 'swingHeavy', arc: { cx: 2, cy: -24, r: 30, a0: -2.3, a1: 0.9, w: 12 }, finisher: true },
  counter: { id: 'counter', clip: 'counter', dur: 0.46, hit: [0.25, 0.5], box: { x: 0, y: -40, w: 44, h: 36 }, dmg: 2.6, poise: 60, kx: 240, ky: -120, cancel: 0.65, lunge: 320, lungeT: [0.2, 0.4], stop: 0.12, shake: 0.4, sfx: 'swingHeavy', arc: { cx: 6, cy: -24, r: 32, a0: -0.3, a1: 0.3, w: 8 }, guardBreak: true, finisher: true },
  flurry: { id: 'flurry', clip: 'flurry', dur: 0.66, hit: [0.1, 0.9], box: { x: 0, y: -40, w: 38, h: 26 }, dmg: 0.42, poise: 5, kx: 22, ky: -24, cancel: 0.95, multi: 7, lunge: 40, lungeT: [0.05, 0.9], stop: 0.018, shake: 0.06, sfx: 'swing', auto: 'flurryEnd' },
  flurryEnd: { id: 'flurryEnd', clip: 'dash', dur: 0.42, hit: [0.25, 0.5], box: { x: 0, y: -38, w: 46, h: 30 }, dmg: 1.6, poise: 32, kx: 280, ky: -100, cancel: 0.6, lunge: 140, lungeT: [0.2, 0.45], stop: 0.09, shake: 0.32, sfx: 'swingHeavy', arc: { cx: 6, cy: -24, r: 32, a0: -0.3, a1: 0.3, w: 9 }, finisher: true },
  storm: { id: 'storm', clip: 'storm', dur: 0.66, hit: [0.14, 0.82], box: { x: -36, y: -46, w: 72, h: 48 }, dmg: 0.85, poise: 14, kx: 30, ky: -70, cancel: 0.86, multi: 4, pull: 80, spin: 2, stop: 0.03, shake: 0.16, sfx: 'swingHeavy', finisher: true },
  comet: { id: 'comet', clip: 'launch', dur: 0.46, hit: [0.2, 0.56], box: { x: -4, y: -66, w: 40, h: 72 }, dmg: 1.4, poise: 26, kx: 20, ky: -470, launch: true, cancel: 0.5, multi: 2, stop: 0.06, shake: 0.2, sfx: 'swingHeavy', arc: { ...ARC_UP, r: 30, w: 8 }, rise: -400, forceRise: true },
  rend: { id: 'rend', clip: 'rend', dur: 0.55, hit: [0.12, 1], box: { x: -4, y: -30, w: 38, h: 42 }, dmg: 0.75, poise: 12, kx: 60, ky: 160, cancel: 1, multi: 4, dive: true, air: true, stop: 0.03, shake: 0.12, sfx: 'swingHeavy' },
  pstrike: { id: 'pstrike', clip: 'pstrike', dur: 0.26, hit: [0.12, 0.55], box: { x: -6, y: -44, w: 40, h: 46 }, dmg: 1.15, poise: 20, kx: 60, ky: -120, cancel: 0.42, stop: 0.04, shake: 0.14, sfx: 'swing', arc: { ...ARC_DOWN, r: 23, w: 8 } },
  cross: { id: 'cross', clip: 'cross', dur: 0.72, hit: [0.36, 0.78], box: { x: -30, y: -58, w: 66, h: 66 }, dmg: 2.3, poise: 90, kx: 220, ky: -340, launch: true, guardBreak: true, cancel: 0.88, multi: 2, stop: 0.1, shake: 0.55, sfx: 'swingHeavy', finisher: true },
};

const spear: Moveset = {
  ...blade,
  speed: 0.95, reach: 1.5, weight: 1,
  combo: [
    { id: 's1', clip: 's1', dur: 0.34, hit: [0.36, 0.56], box: { x: 6, y: -34, w: 48, h: 16 }, dmg: 1.0, poise: 9, kx: 90, ky: -30, cancel: 0.58, lunge: 90, lungeT: [0.3, 0.5], stop: 0.04, shake: 0.1, sfx: 'swingSpear' },
    { id: 's2', clip: 's2', dur: 0.34, hit: [0.36, 0.56], box: { x: 6, y: -44, w: 46, h: 18 }, dmg: 1.05, poise: 9, kx: 90, ky: -60, cancel: 0.58, lunge: 90, lungeT: [0.3, 0.5], stop: 0.04, shake: 0.1, sfx: 'swingSpear' },
    { id: 's3', clip: 's3', dur: 0.52, hit: [0.4, 0.62], box: { x: 4, y: -36, w: 66, h: 18 }, dmg: 1.7, poise: 22, kx: 260, ky: -80, cancel: 0.74, lunge: 240, lungeT: [0.38, 0.6], stop: 0.08, shake: 0.3, sfx: 'swingHeavy', pierce: true, finisher: true },
  ],
  dash: { ...blade.dash, box: { x: 0, y: -36, w: 60, h: 20 }, clip: 's3', pierce: true, dmg: 1.5, lunge: 360 },
  counter: { ...blade.counter, clip: 's3', box: { x: 0, y: -38, w: 66, h: 22 }, pierce: true },
  flurry: { ...blade.flurry, box: { x: 4, y: -40, w: 56, h: 18 }, multi: 8, pierce: true },
  flurryEnd: { ...blade.flurryEnd, clip: 's3', box: { x: 0, y: -38, w: 70, h: 22 }, pierce: true },
  storm: { ...blade.storm, box: { x: -46, y: -46, w: 92, h: 48 } },
};

const greatsword: Moveset = {
  ...blade,
  speed: 0.72, reach: 1.25, weight: 1.6,
  combo: [
    { ...blade.combo[0], id: 'g1', clip: 'g1', dur: 0.56, box: { x: -2, y: -54, w: 42, h: 58 }, dmg: 1.6, poise: 24, kx: 140, ky: -60, stop: 0.08, shake: 0.25, sfx: 'swingHeavy', arc: { ...ARC_DOWN, r: 28, w: 10 } },
    { ...blade.combo[1], id: 'g2', clip: 'g2', dur: 0.54, box: { x: -2, y: -60, w: 42, h: 62 }, dmg: 1.65, poise: 24, kx: 120, ky: -200, stop: 0.08, shake: 0.25, sfx: 'swingHeavy', arc: { ...ARC_UP, r: 28, w: 10 } },
    { ...blade.combo[2], id: 'g3', clip: 'g3', dur: 0.74, box: { x: -14, y: -54, w: 60, h: 56 }, dmg: 2.6, poise: 50, kx: 320, ky: -180, stop: 0.12, shake: 0.45, guardBreak: true, arc: { ...ARC_WIDE, r: 36, w: 13 } },
  ],
  heavy: { ...blade.heavy, dur: 0.7, box: { x: -6, y: -66, w: 60, h: 70 }, dmg: 2.6, poise: 70, guardBreak: true, arc: { cx: 2, cy: -26, r: 38, a0: -2.3, a1: 0.9, w: 15 } },
  flurry: { ...blade.flurry, dur: 0.82, multi: 5, dmg: 0.7, poise: 9, box: { x: -2, y: -48, w: 50, h: 34 } },
  flurryEnd: { ...blade.flurryEnd, dur: 0.5, dmg: 2.3, poise: 50, guardBreak: true },
  storm: { ...blade.storm, dur: 0.8, dmg: 1.25, poise: 22, box: { x: -46, y: -56, w: 92, h: 58 } },
  rend: { ...blade.rend, dmg: 1.05, poise: 18 },
  cross: { ...blade.cross, dmg: 2.9 },
};

export const MOVESETS: Record<WeaponFamily, Moveset> = { blade, spear, greatsword };

/** Rising Verdict (Relentless skill) per family. */
export function extraFor(f: WeaponFamily): AttackDef {
  const base = MOVESETS[f].extra;
  if (f === 'greatsword') return { ...base, dur: 0.62, dmg: 2.0, poise: 34, box: { x: -4, y: -70, w: 44, h: 74 } };
  if (f === 'spear') return { ...base, box: { x: 4, y: -64, w: 40, h: 68 } };
  return base;
}
