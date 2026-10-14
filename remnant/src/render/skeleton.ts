// Skeletal animation: poses are joint angles, clips are keyframes or procedural
// functions, and the animator cross-fades between them. Feet are grounded
// automatically, so crouches and lunges never float or sink.

import { lerp, clamp } from '../core/math';

export interface Pose {
  x: number; y: number;
  lean: number; head: number;
  bUA: number; bFA: number; fUA: number; fFA: number;
  bTh: number; bSh: number; fTh: number; fSh: number;
  wpn: number;
  /** Off-hand item angle relative to back forearm (shields, bows). */
  off: number;
  /** Vertical squash/stretch (1 = none). */
  sq: number;
  /** Whole-body rotation about the hip (rolls, flips). */
  rot: number;
}

export const POSE_KEYS: (keyof Pose)[] = [
  'x', 'y', 'lean', 'head', 'bUA', 'bFA', 'fUA', 'fFA', 'bTh', 'bSh', 'fTh', 'fSh', 'wpn', 'off', 'sq', 'rot',
];

export const BASE_POSE: Pose = {
  x: 0, y: 0, lean: 0.06, head: 0,
  bUA: -0.15, bFA: 0.35, fUA: 0.25, fFA: 0.5,
  bTh: -0.08, bSh: -0.05, fTh: 0.12, fSh: -0.12,
  wpn: 0.6, off: 0, sq: 1, rot: 0,
};

export function pose(p: Partial<Pose>, base: Pose = BASE_POSE): Pose {
  return { ...base, ...p };
}

export function blendPose(a: Pose, b: Pose, t: number, out: Pose = { ...a }): Pose {
  for (const k of POSE_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

export interface RigDims {
  torso: number; head: number; neck: number;
  upperArm: number; foreArm: number; thigh: number; shin: number;
  shoulderSpread: number; hipSpread: number;
}

export interface Joints {
  hipX: number; hipY: number;
  neckX: number; neckY: number;
  headX: number; headY: number; headA: number;
  shFX: number; shFY: number; shBX: number; shBY: number;
  elFX: number; elFY: number; haFX: number; haFY: number;
  elBX: number; elBY: number; haBX: number; haBY: number;
  hpFX: number; hpFY: number; hpBX: number; hpBY: number;
  knFX: number; knFY: number; ftFX: number; ftFY: number;
  knBX: number; knBY: number; ftBX: number; ftBY: number;
  /** Absolute angles (direction = (sin a, cos a)). */
  wpnA: number; offA: number; foreFA: number; foreBA: number;
  torsoA: number;
}

export function newJoints(): Joints {
  return {
    hipX: 0, hipY: 0, neckX: 0, neckY: 0, headX: 0, headY: 0, headA: 0,
    shFX: 0, shFY: 0, shBX: 0, shBY: 0, elFX: 0, elFY: 0, haFX: 0, haFY: 0,
    elBX: 0, elBY: 0, haBX: 0, haBY: 0, hpFX: 0, hpFY: 0, hpBX: 0, hpBY: 0,
    knFX: 0, knFY: 0, ftFX: 0, ftFY: 0, knBX: 0, knBY: 0, ftBX: 0, ftBY: 0,
    wpnA: 0, offA: 0, foreFA: 0, foreBA: 0, torsoA: 0,
  };
}

/**
 * Forward kinematics in local space: x forward (facing right), y down,
 * origin at the feet. If `grounded`, the lowest foot is placed on y = 0.
 */
export function solve(p: Pose, d: RigDims, grounded: boolean, j: Joints = newJoints()): Joints {
  const s = p.sq;
  // Legs relative to hip (hip at 0,0 for now).
  const fth = p.fTh, bth = p.bTh;
  const kFx = Math.sin(fth) * d.thigh, kFy = Math.cos(fth) * d.thigh * s;
  const fFx = kFx + Math.sin(fth + p.fSh) * d.shin, fFy = kFy + Math.cos(fth + p.fSh) * d.shin * s;
  const kBx = Math.sin(bth) * d.thigh, kBy = Math.cos(bth) * d.thigh * s;
  const fBx = kBx + Math.sin(bth + p.bSh) * d.shin, fBy = kBy + Math.cos(bth + p.bSh) * d.shin * s;
  let hipY: number;
  if (grounded) hipY = -Math.max(fFy, fBy) + p.y;
  else hipY = -(d.thigh + d.shin) * 0.97 * s + p.y;
  const hipX = p.x;
  j.hipX = hipX;
  j.hipY = hipY;
  const hs = d.hipSpread;
  j.hpFX = hipX + hs; j.hpFY = hipY;
  j.hpBX = hipX - hs; j.hpBY = hipY;
  j.knFX = j.hpFX + kFx; j.knFY = hipY + kFy;
  j.ftFX = j.hpFX + fFx; j.ftFY = hipY + fFy;
  j.knBX = j.hpBX + kBx; j.knBY = hipY + kBy;
  j.ftBX = j.hpBX + fBx; j.ftBY = hipY + fBy;
  // Torso.
  const tl = d.torso * s;
  j.torsoA = p.lean;
  const tx = Math.sin(p.lean), ty = -Math.cos(p.lean);
  j.neckX = hipX + tx * tl;
  j.neckY = hipY + ty * tl;
  const shoulderT = 0.86;
  const sx = hipX + tx * tl * shoulderT, sy = hipY + ty * tl * shoulderT;
  const ss = d.shoulderSpread;
  j.shFX = sx + ss * Math.cos(p.lean); j.shFY = sy + ss * Math.sin(p.lean);
  j.shBX = sx - ss * Math.cos(p.lean); j.shBY = sy - ss * Math.sin(p.lean);
  j.headA = p.lean * 0.6 + p.head;
  j.headX = j.neckX + Math.sin(j.headA) * (d.neck + d.head * 0.8);
  j.headY = j.neckY - Math.cos(j.headA) * (d.neck + d.head * 0.8);
  // Arms.
  j.elFX = j.shFX + Math.sin(p.fUA) * d.upperArm; j.elFY = j.shFY + Math.cos(p.fUA) * d.upperArm;
  j.foreFA = p.fUA + p.fFA;
  j.haFX = j.elFX + Math.sin(j.foreFA) * d.foreArm; j.haFY = j.elFY + Math.cos(j.foreFA) * d.foreArm;
  j.elBX = j.shBX + Math.sin(p.bUA) * d.upperArm; j.elBY = j.shBY + Math.cos(p.bUA) * d.upperArm;
  j.foreBA = p.bUA + p.bFA;
  j.haBX = j.elBX + Math.sin(j.foreBA) * d.foreArm; j.haBY = j.elBY + Math.cos(j.foreBA) * d.foreArm;
  j.wpnA = j.foreFA + p.wpn;
  j.offA = j.foreBA + p.off;
  return j;
}

// ---------- Clips & animator ----------

export type Ease = (t: number) => number;
export interface Key {
  t: number;
  p: Partial<Pose>;
  ease?: Ease;
}
export interface Clip {
  dur: number;
  loop?: boolean;
  keys?: Key[];
  /** Procedural clip; receives normalized time (0..1, wraps if loop) and seconds. */
  fn?: (u: number, sec: number, param: number) => Partial<Pose>;
  base?: Pose;
  /** Normalized times at which to emit footstep events. */
  steps?: number[];
}

export class Animator {
  name = '';
  clip: Clip | null = null;
  time = 0;
  speed = 1;
  param = 0;
  private from: Pose = { ...BASE_POSE };
  private blendT = 1;
  private blendDur = 0.1;
  out: Pose = { ...BASE_POSE };
  private tmp: Pose = { ...BASE_POSE };
  onStep: (() => void) | null = null;
  private lastU = 0;

  constructor(public clips: Record<string, Clip>, public base: Pose = BASE_POSE) {}

  play(name: string, blend = 0.08, restart = false, speed = 1) {
    if (name === this.name && !restart) {
      this.speed = speed;
      return;
    }
    const c = this.clips[name];
    if (!c) return;
    this.from = { ...this.out };
    this.name = name;
    this.clip = c;
    this.time = 0;
    this.lastU = 0;
    this.speed = speed;
    this.blendDur = blend;
    this.blendT = blend > 0 ? 0 : 1;
  }

  get u() {
    if (!this.clip) return 0;
    const raw = this.time / this.clip.dur;
    return this.clip.loop ? raw % 1 : Math.min(1, raw);
  }
  get done() {
    return !!this.clip && !this.clip.loop && this.time >= this.clip.dur;
  }

  update(dt: number) {
    if (!this.clip) return;
    this.time += dt * this.speed;
    if (this.blendT < 1) this.blendT = Math.min(1, this.blendT + dt / Math.max(0.0001, this.blendDur));
    const u = this.u;
    if (this.clip.steps && this.onStep) {
      for (const st of this.clip.steps) {
        const crossed = this.lastU <= u ? this.lastU < st && u >= st : this.lastU < st || u >= st;
        if (crossed) this.onStep();
      }
    }
    this.lastU = u;
  }

  sample(): Pose {
    const c = this.clip;
    if (!c) return this.out;
    const base = c.base ?? this.base;
    const cur = this.tmp;
    const u = this.u;
    if (c.fn) {
      Object.assign(cur, base, c.fn(u, this.time, this.param));
    } else if (c.keys && c.keys.length) {
      const keys = c.keys;
      let i = 0;
      while (i < keys.length - 1 && keys[i + 1].t <= u) i++;
      const k0 = keys[i];
      const k1 = keys[Math.min(i + 1, keys.length - 1)];
      const p0 = k0.p, p1 = k1.p;
      let t = k1.t > k0.t ? clamp((u - k0.t) / (k1.t - k0.t), 0, 1) : 1;
      if (k1.ease) t = k1.ease(t);
      for (const k of POSE_KEYS) {
        const a = p0[k] ?? base[k];
        const b = p1[k] ?? base[k];
        cur[k] = a + (b - a) * t;
      }
    } else Object.assign(cur, base);
    if (this.blendT < 1) {
      const t = this.blendT * this.blendT * (3 - 2 * this.blendT);
      blendPose(this.from, cur, t, this.out);
    } else Object.assign(this.out, cur);
    return this.out;
  }
}

// ---------- Verlet chain for capes, scarves, tails, banners ----------

export class Chain {
  xs: Float32Array; ys: Float32Array; pxs: Float32Array; pys: Float32Array;
  constructor(public n: number, public seg: number, x = 0, y = 0) {
    this.xs = new Float32Array(n); this.ys = new Float32Array(n);
    this.pxs = new Float32Array(n); this.pys = new Float32Array(n);
    this.reset(x, y);
  }
  reset(x: number, y: number) {
    for (let i = 0; i < this.n; i++) {
      this.xs[i] = this.pxs[i] = x;
      this.ys[i] = this.pys[i] = y + i * this.seg;
    }
  }
  update(ax: number, ay: number, dt: number, gx: number, gy: number, damping = 0.9) {
    const { xs, ys, pxs, pys, n } = this;
    xs[0] = ax; ys[0] = ay; pxs[0] = ax; pys[0] = ay;
    const dt2 = dt * dt;
    for (let i = 1; i < n; i++) {
      const vx = (xs[i] - pxs[i]) * damping, vy = (ys[i] - pys[i]) * damping;
      pxs[i] = xs[i]; pys[i] = ys[i];
      xs[i] += vx + gx * dt2;
      ys[i] += vy + gy * dt2;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) {
        const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1];
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - this.seg) / d;
        if (i === 1) {
          xs[i] -= dx * diff; ys[i] -= dy * diff;
        } else {
          xs[i] -= dx * diff * 0.5; ys[i] -= dy * diff * 0.5;
          xs[i - 1] += dx * diff * 0.5; ys[i - 1] += dy * diff * 0.5;
        }
      }
    }
  }
  /** Teleport whole chain by an offset (room transitions). */
  shift(dx: number, dy: number) {
    for (let i = 0; i < this.n; i++) {
      this.xs[i] += dx; this.ys[i] += dy; this.pxs[i] += dx; this.pys[i] += dy;
    }
  }
}

/** Fill a ribbon along a chain, width tapering from w0 to w1. */
export function drawRibbon(
  ctx: CanvasRenderingContext2D, ch: Chain, w0: number, w1: number, fill: string | CanvasGradient,
  stroke: string | null = null, startX?: number, startY?: number,
) {
  const n = ch.n;
  const left: number[] = [], right: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i === 0 && startX !== undefined ? startX : ch.xs[i];
    const y = i === 0 && startY !== undefined ? startY : ch.ys[i];
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let dx = ch.xs[i1] - ch.xs[i0], dy = ch.ys[i1] - ch.ys[i0];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    left.push(x - dy * w, y + dx * w);
    right.push(x + dy * w, y - dx * w);
  }
  ctx.beginPath();
  ctx.moveTo(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
