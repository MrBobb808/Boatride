// The foes of Babylon (Chapter IV):
//
// - BRAZEN LION: a bronze beast with a golden mane, cast after the lions on
//   the city gate. It stalks, crouches (the tell), and pounces in a long arc
//   that can be parried; up close it rakes with its claws, and now and then
//   it roars, quickening every foe around it.
// - CHALDEAN FIRE-PRIEST: a robed caster in a tall hat. It keeps its
//   distance, lobs fire, calls a pillar of flame under its prey (a circle
//   on the ground first), and when cornered vanishes in a burst of flame.
//
// The lion drawing is shared with the purified lion Echo.

import { Entity } from './entity';
import { groundAhead, wallAhead } from './physics';
import { Animator, BASE_POSE, type Clip, type Pose, type RigDims } from '../render/skeleton';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { glow, poly, ellipse, limbShaded, limbStroke, vGrad, rGrad, shade, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign, easeOutCubic, easeInQuad, easeOutBack, easeInOutSine } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { T, TILE } from './tiles';
import { Enemy, CORRUPT } from './enemies';

// =====================================================================
// Lion drawing (shared by the foe and the Echo)
// =====================================================================

/** Everything the lion drawer needs, 0..1 unless noted. Reused, never reallocated. */
export interface LionPose {
  /** Stride phase in radians. */
  gait: number;
  /** 0 standing, 1 full run. */
  run: number;
  crouch: number;
  /** Stretched out in the air. */
  air: number;
  /** Body tilt in radians (+ nose down). */
  pitch: number;
  /** Claw swipe: up to 0.5 the paw rises, then it rakes down. */
  claw: number;
  roar: number;
  jaw: number;
  /** Slumped (stagger, kneeling to be purified). */
  down: number;
  /** Squash just after landing. */
  land: number;
  /** Tail lash. */
  lash: number;
  time: number;
}

export const newLionPose = (): LionPose => ({ gait: 0, run: 0, crouch: 0, air: 0, pitch: 0, claw: 0, roar: 0, jaw: 0, down: 0, land: 0, lash: 0, time: 0 });

interface LionPal {
  body: string; dark: string; mane: string; maneDk: string; claw: string;
  eye: string; eyeCore: string; o: string; spec: string; seam: string | null; flat: boolean; patina: string | null;
}

const FLASH_C = 'rgba(255,248,236,1)';
const LION_PALS = {
  foe: { body: '#a06a32', dark: '#5a3414', mane: '#eab448', maneDk: '#b0702a', claw: '#f2e6c8', eye: '#c45cff', eyeCore: '#fbe8ff', o: '#140a04', spec: 'rgba(255,226,170,0.55)', seam: null, flat: false, patina: 'rgba(80,150,130,0.35)' },
  elite: { body: '#7a4a26', dark: '#3a1e0c', mane: '#e07a30', maneDk: '#94401a', claw: '#ffe0c0', eye: '#ff3a6a', eyeCore: '#fff0f4', o: '#120604', spec: 'rgba(255,200,150,0.5)', seam: null, flat: false, patina: 'rgba(90,140,120,0.3)' },
  flash: { body: FLASH_C, dark: FLASH_C, mane: FLASH_C, maneDk: FLASH_C, claw: FLASH_C, eye: '#ffffff', eyeCore: '#ffffff', o: FLASH_C, spec: FLASH_C, seam: null, flat: true, patina: null },
  echo0: { body: '#24201e', dark: '#100e0e', mane: '#b8903e', maneDk: '#5a4218', claw: '#fff3c4', eye: '#ffffff', eyeCore: '#ffffff', o: '#0a0806', spec: 'rgba(255,230,170,0.35)', seam: '#e2b85a', flat: false, patina: null },
  echo1: { body: '#1e1b1c', dark: '#0e0c0c', mane: '#e2b85a', maneDk: '#7a5a22', claw: '#fff3c4', eye: '#ffffff', eyeCore: '#ffffff', o: '#0a0806', spec: 'rgba(255,236,190,0.45)', seam: '#ffd27a', flat: false, patina: null },
  echo2: { body: '#1a1718', dark: '#0c0a0a', mane: '#fff0c0', maneDk: '#c9a04a', claw: '#ffffff', eye: '#ffffff', eyeCore: '#ffffff', o: '#0a0806', spec: 'rgba(255,246,220,0.55)', seam: '#fff3c4', flat: false, patina: null },
} satisfies Record<string, LionPal>;
export type LionLook = keyof typeof LION_PALS;

/** Two-bone IK into a scratch array: [jointX, jointY, endX, endY]. bend picks the side the joint folds to. */
const IKR = new Float32Array(4);
function ik2(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, bend: number) {
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
  IKR[0] = ax + Math.cos(ang) * l1;
  IKR[1] = ay + Math.sin(ang) * l1;
  IKR[2] = ax + dx;
  IKR[3] = ay + dy;
  return IKR;
}

// Leg order: far back, far front, near back, near front. Walk is a lateral
// sequence; the run gathers the pairs into a bound.
const WALK_OFF = [0.5, 0.75, 0, 0.25];
const RUN_OFF = [0.12, 0.6, 0, 0.48];

function legFill(P: LionPal, far: boolean) {
  return far ? P.dark : P.body;
}

/** Paw target relative to the leg root for leg i. Writes into PAW. */
const PAW = new Float32Array(2);
function pawTarget(L: LionPose, i: number, front: boolean, near: boolean) {
  const run = L.run;
  const off = WALK_OFF[i] + (RUN_OFF[i] - WALK_OFF[i]) * run;
  let ph = (L.gait / (Math.PI * 2) + off) % 1;
  if (ph < 0) ph += 1;
  const S = run * 15 + (run > 0.05 ? 3 : 0);
  const lift = 2.5 + run * 4.5;
  const st = 0.62 - run * 0.18;
  let x: number, y: number;
  if (ph < st) {
    x = S / 2 - (ph / st) * S;
    y = 0;
  } else {
    const v = (ph - st) / (1 - st);
    x = -S / 2 + easeInOutSine(v) * S;
    y = -Math.sin(v * Math.PI) * lift;
  }
  x += front ? 1 : -1;
  // Coiled to spring: front paws reach, hind paws gather under the haunches.
  if (L.crouch > 0) {
    const c = L.crouch;
    x += ((front ? 3.5 : 3) - x) * c;
    y *= 1 - c;
  }
  if (L.air > 0) {
    const a = L.air;
    const tx = front ? 9 + (near ? 1.5 : 0) : -11 - (near ? 1.5 : 0);
    const ty = front ? -4 : -3;
    x += (tx - x) * a;
    y += (ty - y) * a;
  }
  if (L.down > 0) {
    const d = L.down;
    x += ((front ? 6 : -5) - x) * d;
    y *= 1 - d;
  }
  // The raking paw.
  if (front && near && L.claw > 0) {
    const c = L.claw;
    const up = c < 0.5 ? easeOutCubic(c / 0.5) : 1 - easeInQuad((c - 0.5) / 0.5);
    const fwd = c < 0.5 ? 13 * up : 13 + 4 * easeInQuad((c - 0.5) / 0.5);
    x += (fwd - x) * Math.min(1, c * 4);
    y += (-13 * up - y) * Math.min(1, c * 4);
  }
  PAW[0] = x;
  PAW[1] = y;
}

function drawFrontLeg(ctx: Ctx, P: LionPal, L: LionPose, i: number, near: boolean, sx: number, sy: number) {
  pawTarget(L, i, true, near);
  const wx = sx + PAW[0], wy = PAW[1] - 1.6;
  const r = ik2(sx, sy, wx, wy, 8.4, 7.6, -1);
  const ex = r[0], ey = r[1], hx = r[2], hy = r[3];
  const c = legFill(P, !near);
  limbStroke(ctx, sx, sy, ex, ey, 3.4, 2.5, P.o, 1.1);
  limbStroke(ctx, ex, ey, hx, hy, 2.4, 1.9, P.o, 1.1);
  limbShaded(ctx, ex, ey, hx, hy, 2.4, 1.9, c, null, 1, !P.flat);
  limbShaded(ctx, sx, sy, ex, ey, 3.4, 2.5, c, null, 1, !P.flat);
  // Paw, toes forward.
  ellipse(ctx, hx + 1.4, hy + 0.5, 2.7, 1.7, 0, c);
  if (near && L.claw > 0.3 && !P.flat) {
    ctx.strokeStyle = P.claw;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const bx = hx + 2.6 + k * 0.4, by = hy - 0.8 + k * 1.1;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + 2.2, by + 0.2, bx + 2.0, by + 1.8);
    }
    ctx.stroke();
  }
}

function drawBackLeg(ctx: Ctx, P: LionPal, L: LionPose, i: number, near: boolean, hx0: number, hy0: number) {
  pawTarget(L, i, false, near);
  const px = hx0 + PAW[0], py = PAW[1] - 1.4;
  // Digitigrade: the hock sits up and behind the paw; IK from hip to hock, knee forward.
  const kx0 = px - 2.6, ky0 = py - 5.2 + L.down * 3;
  const r = ik2(hx0, hy0, kx0, ky0, 8.6, 7.4, 1);
  const kx = r[0], ky = r[1], hkx = r[2], hky = r[3];
  const c = legFill(P, !near);
  limbStroke(ctx, hx0, hy0, kx, ky, 4.6, 2.8, P.o, 1.1);
  limbStroke(ctx, kx, ky, hkx, hky, 2.6, 1.8, P.o, 1.1);
  limbStroke(ctx, hkx, hky, px, py, 1.8, 1.7, P.o, 1.1);
  limbShaded(ctx, hkx, hky, px, py, 1.8, 1.7, c, null, 1, !P.flat);
  limbShaded(ctx, kx, ky, hkx, hky, 2.6, 1.8, c, null, 1, !P.flat);
  limbShaded(ctx, hx0, hy0, kx, ky, 4.6, 2.8, c, null, 1, !P.flat);
  ellipse(ctx, px + 1.2, py + 0.6, 2.6, 1.6, 0, c);
}

/**
 * A Brazen Lion in local space: facing +x, paws on y = 0, about 40 px nose
 * to tail root and 22 px to the top of the mane.
 */
export function drawLion(ctx: Ctx, L: LionPose, look: LionLook) {
  const P: LionPal = LION_PALS[look];
  const t = L.time;
  const flat = P.flat;
  // Leg roots: hips and shoulders. The crouch loads the haunches; the roar sits back.
  const bob = L.run > 0.05 ? Math.abs(Math.sin(L.gait)) * 1.2 * L.run : Math.sin(t * 2) * 0.25;
  const drop = L.land * 3 + L.down * 8;
  const hx = -12, hy = -15.5 + L.crouch * 5.5 + drop + L.roar * 2 - bob * 0.6 + L.pitch * 4;
  const sx = 10, sy = -16 + L.crouch * 3.5 + drop * 0.9 - L.roar * 2.5 - bob - L.pitch * 4;
  const mx = (hx + sx) / 2, my = (hy + sy) / 2;

  // Far legs, darker.
  drawBackLeg(ctx, P, L, 0, false, hx + 1, hy + 1);
  drawFrontLeg(ctx, P, L, 1, false, sx - 1, sy + 1);

  // Tail: lashes when coiled, streams behind in the air, tuft at the end.
  {
    const lash = Math.sin(t * (L.crouch > 0.2 ? 14 : 2.4)) * (1.5 + L.lash * 3.5);
    const trx = hx - 5, tr = hy - 3.5;
    const ex = trx - 13 - L.air * 4, ey = tr + 6 - L.air * 8 + lash * 0.6 - L.roar * 3;
    ctx.strokeStyle = P.o;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(trx, tr);
    ctx.quadraticCurveTo(trx - 8, tr - 7 + lash, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = P.body;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    poly(ctx, [ex + 1, ey - 1, ex - 3.2, ey - 1.5 + lash * 0.2, ex - 4.2, ey + 1.6, ex - 1, ey + 2.4, ex + 1, ey + 1], P.maneDk, P.o, 0.5);
  }

  // Body: deep chest, tucked waist, heavy haunches.
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy - 1.5);
  ctx.quadraticCurveTo(hx - 5.5, hy - 7.5, hx, hy - 7.6);
  ctx.quadraticCurveTo(mx, my - 6.8 + L.crouch * 1.5, sx - 2, sy - 8.2);
  ctx.lineTo(sx + 6, sy - 6);
  ctx.quadraticCurveTo(sx + 9.5, sy - 1, sx + 6, sy + 5.5);
  ctx.quadraticCurveTo(sx + 1, sy + 7.6, sx - 3, sy + 6.2);
  ctx.quadraticCurveTo(mx, my + 4.2, hx + 4, hy + 5.6);
  ctx.quadraticCurveTo(hx - 3.5, hy + 6.5, hx - 6.6, hy + 2.5);
  ctx.closePath();
  ctx.fillStyle = flat ? P.body : vGrad(ctx, P.body, -25, -6, 0.3, -0.42);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = P.o;
  ctx.stroke();
  if (!flat) {
    // Cast bronze: a hot line of light along the back, muscle ridges, belly tufts.
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy - 6.2);
    ctx.quadraticCurveTo(mx, my - 5.6 + L.crouch * 1.5, sx - 3, sy - 6.8);
    ctx.strokeStyle = P.spec;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 4.5, sy - 5);
    ctx.quadraticCurveTo(sx - 5.5, sy + 1, sx - 1.5, sy + 4.5);
    ctx.moveTo(hx + 4, hy - 5);
    ctx.quadraticCurveTo(hx + 6.5, hy + 0.5, hx + 3, hy + 4.6);
    ctx.moveTo(mx - 1, my - 3.2);
    ctx.quadraticCurveTo(mx + 0.4, my, mx - 0.4, my + 2.8);
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    const tuftY = my + 4.4;
    for (let k = 0; k < 4; k++) {
      const bx = hx + 6 + k * 3.6;
      const by = tuftY + (k === 0 || k === 3 ? 0.4 : 0.9);
      poly(ctx, [bx - 1.2, by - 0.6, bx + 1.2, by - 0.6, bx - 0.4 + Math.sin(t * 3 + k) * 0.4, by + 2.2], P.maneDk, null);
    }
    if (P.patina) {
      ctx.fillStyle = P.patina;
      ctx.fillRect(mx - 4, my + 2.5, 3, 1);
      ctx.fillRect(hx - 2, hy + 3.4, 2.4, 1);
    }
    if (P.seam) {
      // Echo: gold seams where the Veil burned out.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = P.seam;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(sx - 4.5, sy - 5);
      ctx.quadraticCurveTo(sx - 5.5, sy + 1, sx - 1.5, sy + 4.5);
      ctx.moveTo(hx + 4, hy - 5);
      ctx.quadraticCurveTo(hx + 6.5, hy + 0.5, hx + 3, hy + 4.6);
      ctx.moveTo(hx - 3, hy - 6.6);
      ctx.quadraticCurveTo(mx, my - 6 + L.crouch * 1.5, sx - 3, sy - 7.4);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Near legs over the body.
  drawBackLeg(ctx, P, L, 2, true, hx, hy);
  // A raking paw comes up in front of the face; otherwise the mane covers the shoulder.
  if (L.claw <= 0) drawFrontLeg(ctx, P, L, 3, true, sx, sy);

  // Head root, then the mane: a full ruff of curled locks framing the head.
  const hdx = sx + 9 + L.crouch * 2 + L.air * 1.5 - L.down * 1, hdy = sy - 7 + L.crouch * 3.5 - L.roar * 4 + L.down * 6;
  const ha = L.crouch * 0.22 - L.roar * 0.5 - L.air * 0.12 - L.claw * 0.1 + L.down * 0.45 + L.pitch * 0.5;
  {
    ctx.save();
    ctx.translate(hdx - 3.5, hdy + 1.5);
    ctx.rotate(ha * 0.5);
    const bristle = L.roar * 2.5 + L.air * 1.2;
    for (let layer = 0; layer < 2; layer++) {
      const n = layer ? 9 : 11;
      const r0 = layer ? 5 : 6, r1 = (layer ? 10.5 : 13) + bristle;
      // Locks sweep from under the jaw, over the crown, down the neck: the face stays clear.
      const a0 = layer ? -2.75 : -2.95, a1 = layer ? 1.75 : 2.05;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = a0 + ((i + 0.5) / n) * (a1 - a0) + Math.sin(t * 2.6 + i * 1.7) * 0.04;
        const w = ((a1 - a0) / n) * 0.75;
        const rr = r1 * (i % 2 ? 0.88 : 1);
        const ca = Math.cos(a), sa = Math.sin(a);
        // A teardrop lock whose tip curls back toward the tail.
        const bx0 = Math.cos(a - w) * r0, by0 = Math.sin(a - w) * r0;
        const bx1 = Math.cos(a + w) * r0, by1 = Math.sin(a + w) * r0;
        const tx = ca * rr - 1.6, ty = sa * rr + 0.4;
        ctx.moveTo(bx0, by0);
        ctx.quadraticCurveTo(Math.cos(a - w * 1.6) * rr * 0.85, Math.sin(a - w * 1.6) * rr * 0.85, tx, ty);
        ctx.quadraticCurveTo(Math.cos(a + w * 0.6) * rr * 0.7, Math.sin(a + w * 0.6) * rr * 0.7, bx1, by1);
        ctx.closePath();
      }
      ctx.moveTo(r0 + 1.5, 0);
      ctx.arc(0, 0, r0 + 1.5, 0, Math.PI * 2);
      // Outline then fill: the locks read as one ruff, not a pile of shapes.
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = P.o;
      ctx.stroke();
      const mc = layer ? P.mane : P.maneDk;
      ctx.fillStyle = flat ? mc : rGrad(ctx, mc, 2, -4, 15, 0.32, -0.28);
      ctx.fill();
    }
    if (!flat) {
      // Engraved strands down each lock.
      ctx.beginPath();
      for (let i = 0; i < 9; i += 1) {
        const a = -2.75 + ((i + 0.5) / 9) * 4.5;
        ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
        ctx.lineTo(Math.cos(a) * 8.6 - 0.8, Math.sin(a) * 8.6 + 0.2);
      }
      ctx.strokeStyle = P.maneDk;
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Head: a broad muzzle, a jaw that opens, Veil in the eye.
  ctx.save();
  ctx.translate(hdx, hdy);
  ctx.rotate(ha);
  ctx.scale(1.12, 1.12);
  const jaw = clamp(L.jaw, 0, 1) * 0.6;
  // Lower jaw, hinged under the eye.
  ctx.save();
  ctx.translate(2.2, 1.2);
  ctx.rotate(jaw);
  if (jaw > 0.05) poly(ctx, [0, -0.4, 8.2, -0.6, 7, 1.5, 1, 1.8], flat ? P.body : '#3a0a0a', null);
  poly(ctx, [-0.6, 0, 8.4, 0.1, 8.2, 1.6, 4.4, 3.1, 0.2, 2.6], flat ? P.body : vGrad(ctx, P.body, -1, 3.5, 0.1, -0.4), P.o, 0.6);
  if (!flat && jaw > 0.05) {
    ctx.fillStyle = P.claw;
    ctx.beginPath();
    ctx.moveTo(6.6, 0.2); ctx.lineTo(7.1, -1.6); ctx.lineTo(7.6, 0.2);
    ctx.fill();
  }
  ctx.restore();
  // Upper head.
  poly(ctx, [-4.8, -2.4, -1.4, -6.1, 3.8, -6, 8.6, -3.9, 10.9, -2.4, 11.4, 0.2, 10.2, 1.4, 2.6, 1.6, -3.4, 2.8], flat ? P.body : vGrad(ctx, P.body, -7, 3, 0.34, -0.3), P.o, 0.75);
  if (!flat) {
    // Brow ridge, muzzle line, nose, whisker pads, upper fang.
    ctx.beginPath();
    ctx.moveTo(2.8, -5.2);
    ctx.quadraticCurveTo(5.5, -5.4, 8, -3.6);
    ctx.moveTo(6.8, -1.6);
    ctx.quadraticCurveTo(8.5, 0.3, 10.4, 0.6);
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = 0.55;
    ctx.stroke();
    poly(ctx, [10, -3.4, 11.5, -2.6, 11.4, -1.3, 10.3, -1.6], P.o, null);
    ctx.beginPath();
    ctx.moveTo(4.2, -3.9);
    ctx.lineTo(9.6, -3.3);
    ctx.strokeStyle = P.spec;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = P.claw;
    ctx.beginPath();
    ctx.moveTo(9.2, 1.2); ctx.lineTo(9.6, 1.2 + 1.6 + jaw * 1.5); ctx.lineTo(10.1, 1.3);
    ctx.fill();
  }
  // Ear, tucked into the mane.
  ellipse(ctx, -1.4, -5.6, 1.7, 1.4, -0.4, P.dark);
  // Eye.
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 5.6, -3.4, 5.5 + L.roar * 3, P.eye, flat ? 0 : 0.95);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = P.eyeCore;
  ctx.beginPath();
  ctx.moveTo(4.4, -3.3); ctx.lineTo(6.8, -3.9); ctx.lineTo(6.4, -2.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (L.claw > 0) drawFrontLeg(ctx, P, L, 3, true, sx, sy);
}

// =====================================================================
// BRAZEN LION
// =====================================================================

const CROUCH_T = 0.45;

export class Lion extends Enemy {
  L = newLionPose();
  gait = rand(0, 6);
  roarCd = rand(5, 9);
  crouchK = 0;
  downK = 0;
  landK = 0;
  combo = 0;
  roared = false;
  /** Elite den lions pounce twice. */
  pounces = 0;

  constructor(x: number, y: number, elite: string | null) {
    super('lion', x, y, elite ? 34 : 30, elite ? 25 : 22, elite);
    if (elite) this.scale = 1.15;
    this.attackCd = rand(0.6, 1.4);
  }

  groan() {
    sfx('houndGrowl', { pan: G.world.pan(this.x), vol: 0.6, pitch: 0.55 });
  }

  get clawT() {
    return this.elite ? 0.44 : 0.5;
  }

  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(240);
      if (t && this.canSee(t)) {
        this.aggro = true;
        sfx('houndGrowl', { pan: G.world.pan(this.x), pitch: 0.5 });
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(500);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    this.roarCd -= dt;
    switch (this.state) {
      case 'crouch': {
        // The tell: haunches drop, tail lashes, eyes flare.
        b.vx = approach(b.vx, 0, 1100 * dt);
        this.faceTarget();
        const tel = this.pounces > 0 ? CROUCH_T * 0.6 : this.elite ? CROUCH_T * 0.85 : CROUCH_T;
        if (this.st >= tel) {
          // Aim the arc to land on the target: flight time from the launch speed.
          const vy = -330, T = (2 * -vy) / 1500;
          b.vy = vy;
          b.vx = this.face * clamp(dist / T, 140, this.elite ? 380 : 340);
          this.airborne = true;
          this.hitSet.clear();
          this.setState('leap');
          sfx('pounce', { pan: G.world.pan(this.x) });
          sfx('whoosh', { pan: G.world.pan(this.x), vol: 0.4, pitch: 0.8 });
        }
        break;
      }
      case 'leap': {
        const s = this.scale;
        this.strike(-6, -24 * s, 34 * s, 26 * s, 1.15, { kx: this.face * 240, ky: -180, poise: 30, parryable: true });
        if (b.onGround && this.st > 0.08) {
          this.landK = 1;
          fx.dust(this.x, this.y, 8, 1.2);
          sfx('land', { pan: G.world.pan(this.x), pitch: 0.6 });
          G.camera.addTrauma(0.08 * shakeScale());
          // The den's elite springs again before you have found your feet.
          if (this.elite && this.pounces === 0 && Math.abs(t.x - this.x) > 50 && Math.abs(t.x - this.x) < 170) {
            this.pounces = 1;
            this.setState('crouch');
          } else {
            this.pounces = 0;
            this.attackCd = rand(0.9, 1.5);
            this.setState('land');
          }
        }
        break;
      }
      case 'land': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st >= 0.34) this.setState('prowl');
        break;
      }
      case 'claw': {
        const T = this.clawT, u = this.st / T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.5 && u < 0.68) {
          if (this.st - dt < 0.5 * T) {
            b.vx = this.face * 140;
            sfx('swing', { pan: G.world.pan(this.x), pitch: 0.75 });
            const s = this.scale;
            fx.slash(this.x + this.face * 14 * s, this.y - 12 * s, 14 * s, -1.7, 0.9, 5, this.face, '#fff1d8', '#ff9a3a', 0.13);
          }
          this.strike(-2, -28 * this.scale, 32 * this.scale, 30 * this.scale, 0.8, { poise: 18 });
        }
        if (u >= 1) {
          if (this.combo < (this.elite ? 2 : 1) && dist < 46) {
            this.combo++;
            this.faceTarget();
            this.hitSet.clear();
            this.setState('claw');
            this.st = T * 0.18;
          } else {
            this.combo = 0;
            this.attackCd = rand(0.5, 0.9);
            this.setState('prowl');
          }
        }
        break;
      }
      case 'roar': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st >= 0.32 && !this.roared) this.doRoar();
        if (this.st >= 1.05) {
          this.attackCd = Math.min(this.attackCd, 0.3);
          this.setState('prowl');
        }
        break;
      }
      default: {
        if (b.onGround && this.attackCd <= 0 && Math.abs(t.y - this.y) < 44) {
          if (dist < 38) {
            this.faceTarget();
            this.hitSet.clear();
            this.combo = 0;
            this.setState('claw');
            break;
          }
          if (dist > 58 && dist < 165 && Math.abs(t.y - this.y) < 30) {
            this.faceTarget();
            this.pounces = 0;
            this.setState('crouch');
            sfx('houndGrowl', { pan: G.world.pan(this.x), pitch: 0.45 });
            break;
          }
        }
        if (this.roarCd <= 0 && b.onGround && dist > 70) {
          this.roarCd = rand(9, 14);
          this.faceTarget();
          this.roared = false;
          this.setState('roar');
          break;
        }
        // Stalk at a little distance while it gathers itself; run in from afar.
        const keep = this.attackCd > 0 ? 74 : 26;
        const speed = dist > 150 ? (this.elite ? 175 : 160) : this.attackCd > 0 ? 70 : 110;
        if (dist < keep - 14) {
          this.walkToward(this.x - sign(dx) * 40, 80, dt);
          this.face = sign(dx) || this.face;
        } else this.walkToward(t.x, speed, dt, keep);
        this.state = 'prowl';
      }
    }
  }

  private doRoar() {
    this.roared = true;
    sfx('roar', { pan: G.world.pan(this.x), pitch: this.elite ? 0.85 : 1 });
    G.camera.addTrauma(0.25 * shakeScale());
    const hx = this.x + this.face * 20 * this.scale, hy = this.y - 20 * this.scale;
    fx.ring(hx, hy, 6, 90, '#ffcf6b', 0.45, 3);
    fx.ring(hx, hy, 4, 60, '#c45cff', 0.35, 2);
    // Its roar quickens every foe around it, itself included.
    for (const e of G.world.ents) {
      if (!(e instanceof Enemy) || e.dying || Math.abs(e.x - this.x) > 230 || Math.abs(e.y - this.y) > 120) continue;
      e.haste = Math.max(e.haste, e === this ? 3 : 5);
      e.aggro = true;
      e.attackCd = Math.min(e.attackCd, 0.4);
      if (e !== this) fx.embers(e.cx, e.cy, 6, '#ffb347', 6);
    }
  }

  update(dt: number) {
    super.update(dt);
    const b = this.body;
    const moving = Math.abs(b.vx) > 12 && b.onGround;
    this.gait += dt * (moving ? 2.6 + Math.abs(b.vx) * 0.06 : 0);
    this.crouchK = approach(this.crouchK, this.state === 'crouch' && !this.dying ? 1 : 0, dt * (this.state === 'crouch' ? 6 : 10));
    this.downK = approach(this.downK, this.staggered > 0 || this.dying ? 1 : 0, dt * 3);
    this.landK = approach(this.landK, 0, dt * 4);
  }

  draw(ctx: Ctx) {
    const L = this.L;
    const b = this.body;
    const st = this.state;
    L.time = G.time + this.id;
    L.gait = this.gait;
    L.run = b.onGround && !this.dying ? clamp(Math.abs(b.vx) / 150, 0, 1) : 0;
    L.crouch = this.crouchK;
    L.air = !b.onGround && !this.dying ? (st === 'leap' ? 1 : 0.5) : 0;
    L.pitch = L.air > 0 ? clamp(b.vy * 0.0012, -0.35, 0.35) : 0;
    L.claw = st === 'claw' && !this.dying ? clamp(this.st / this.clawT, 0, 1) : 0;
    L.roar = st === 'roar' && !this.dying ? (this.st < 0.3 ? this.st / 0.3 : this.st > 0.85 ? Math.max(0, 1 - (this.st - 0.85) / 0.2) : 1) : 0;
    L.jaw = Math.max(L.roar, L.claw > 0.35 ? 0.7 : 0, L.air * 0.8, st === 'hurt' ? 0.35 : 0, this.crouchK * 0.25);
    L.down = this.downK;
    L.land = this.landK;
    L.lash = this.crouchK;
    const alpha = this.dying && !this.awaitingPurify ? clamp(1 - (this.deathT - 0.4) / 0.6, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * this.scale, this.scale);
    drawLion(ctx, L, this.elite ? 'elite' : 'foe');
    if (this.flash > 0) {
      ctx.globalAlpha = alpha * Math.min(0.9, this.flash * 9);
      drawLion(ctx, L, 'flash');
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    const s = this.scale;
    if (st === 'crouch') this.glint(ctx, this.x + this.face * 21 * s, this.y - 21 * s + this.crouchK * 6 * s, '#c45cff');
    else if (st === 'claw' && this.st < 0.5 * this.clawT) this.glint(ctx, this.x + this.face * 18 * s, this.y - 22 * s, '#ff9a3a');
    this.drawFlash(ctx);
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x + this.face * 18, this.y - 18, this.awaitingPurify ? 70 : 32, this.awaitingPurify ? '#b04cff' : this.elite ? '#ff5a6a' : '#c45cff', this.awaitingPurify ? 0.8 : 0.4, 0.4);
  }
}

// =====================================================================
// CHALDEAN FIRE-PRIEST
// =====================================================================

const kf = (t: number, p: Partial<Pose>, ease?: (x: number) => number) => ({ t, p, ease });

export const PRIEST_DIMS: RigDims = { torso: 12.6, head: 4.4, neck: 1.4, upperArm: 7, foreArm: 6.8, thigh: 8.2, shin: 8.4, shoulderSpread: 1.4, hipSpread: 1.3 };
// The staff stands upright in the front hand; the censer hangs from the back hand.
const PB: Pose = { ...BASE_POSE, lean: 0.02, head: -0.04, bUA: 0.15, bFA: 0.55, fUA: 0.5, fFA: 0.95, wpn: 1.55, off: 0, bTh: -0.1, bSh: -0.06, fTh: 0.12, fSh: -0.1 };
const RAISE: Partial<Pose> = { fUA: 2.5, fFA: 0.35, wpn: 0.35, bUA: -0.5, bFA: 0.5, lean: -0.16, head: -0.2, fTh: 0.3, bTh: -0.3 };
const CHANT: Partial<Pose> = { fUA: 2.75, fFA: 0.2, wpn: 0.25, bUA: 2.6, bFA: 0.35, lean: -0.12, head: -0.4, fTh: 0.1, bTh: -0.15 };
const P_KNEEL: Partial<Pose> = { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.3, fUA: 0.4, fFA: 0.6, wpn: 1.0 };

const PRIEST_CLIPS: Record<string, Clip> = {
  idle: { dur: 2.6, loop: true, base: PB, fn: (u) => ({ lean: PB.lean + Math.sin(u * Math.PI * 2) * 0.02, y: Math.sin(u * Math.PI * 2) * 0.35, bUA: PB.bUA + Math.sin(u * Math.PI * 2) * 0.08 }) },
  walk: {
    dur: 0.8, loop: true, base: PB, steps: [0.25, 0.75],
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return {
        lean: PB.lean + 0.06, fTh: 0.04 + 0.4 * s, fSh: -0.15 - 0.4 * Math.max(0, Math.cos(p - 0.5)),
        bTh: -0.04 - 0.4 * s, bSh: -0.15 - 0.4 * Math.max(0, Math.cos(p + Math.PI - 0.5)), bUA: PB.bUA - 0.2 * s,
      };
    },
  },
  back: {
    dur: 0.62, loop: true, base: PB,
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return { lean: -0.12, fTh: 0.04 + 0.42 * s, fSh: -0.15 - 0.45 * Math.max(0, Math.cos(p - 0.5)), bTh: -0.04 - 0.42 * s, bSh: -0.15 - 0.45 * Math.max(0, Math.cos(p + Math.PI - 0.5)), bUA: 0.5 };
    },
  },
  // Fire gathers at the staff head (held to the end of the clip).
  cast: { dur: 1, base: PB, keys: [kf(0, {}), kf(0.7, RAISE, easeOutCubic), kf(1, { ...RAISE, lean: -0.2 })] },
  throw: { dur: 0.42, base: PB, keys: [kf(0, RAISE), kf(0.3, { fUA: 1.5, fFA: 0.05, wpn: 0.6, lean: 0.3, bUA: -0.2, fTh: 0.5, fSh: -0.4, bTh: -0.4 }, easeOutBack), kf(1, {}, easeInOutSine)] },
  chant: { dur: 1, loop: true, base: PB, fn: (u) => ({ ...CHANT, lean: CHANT.lean! + Math.sin(u * Math.PI * 4) * 0.04, head: CHANT.head! + Math.sin(u * Math.PI * 2) * 0.08 }) },
  hurt: { dur: 0.25, base: PB, keys: [kf(0, { lean: -0.3, head: 0.4 }), kf(1, {}, easeOutCubic)] },
  stagger: { dur: 0.5, base: PB, keys: [kf(0, { lean: -0.3 }), kf(1, { ...P_KNEEL, lean: 0.75 }, easeOutCubic)] },
  death: { dur: 0.9, base: PB, keys: [kf(0, { lean: -0.3 }), kf(1, { lean: 1.3, head: 0.8, fTh: 1.4, fSh: -2.4, bTh: -0.1, bSh: -1.9, rot: 0.35, y: 3, wpn: 0.4 }, easeInQuad)] },
  kneel: { dur: 0.6, base: PB, keys: [kf(0, {}), kf(1, P_KNEEL, easeOutCubic)] },
};

function priestStyle(elite: boolean): HumanStyle {
  const robe = elite ? '#5e0f14' : '#7a2a12';
  return {
    skin: '#7a5a4c', hair: null, hairKind: 'none', beard: null,
    coat: robe, coatDark: shade(robe, -0.4), skirt: 17, trim: '#d8a94c',
    // The robe falls to the ankles; the stride shows as folds of the same cloth.
    pants: shade(robe, -0.12), boots: '#2a1a10', glove: '#7a5a4c', belt: '#d8a94c',
    plate: null, helm: 'none', eye: '#ffb04a', eyeGlow: 1, outline: '#0c0604',
    weapon: 'staff', weaponColor: '#5a3a1e', offhand: 'none', crack: null, bulk: 1.06,
  };
}

/** A pillar of fire called under the priest's prey: a ring on the ground, then the flame. */
export class FirePillar extends Entity {
  t = 0;
  tele: number;
  burn = 0.7;
  dmg: number;
  owner: Enemy | null;
  hitSet = new Set<number>();
  tickT = 0;
  erupted = false;
  grad: CanvasGradient | null = null;

  constructor(x: number, y: number, dmg: number, owner: Enemy | null, tele = 0.8) {
    super(x, y, 30, 96);
    this.team = 'enemy';
    this.dmg = dmg;
    this.owner = owner;
    this.tele = tele;
    this.layer = 8;
    this.grav = 0;
  }

  update(dt: number) {
    this.t += dt;
    if (!this.erupted) {
      // The caster struck down mid-chant: the ring gutters out.
      if (this.owner && this.owner.dying) {
        fx.spawn(PK.Smoke, this.x, this.y - 4, 0, -20, 0.6, 4, 12, '#3a2a24', -10, 1);
        this.remove = true;
        return;
      }
      if (Math.random() < dt * 30) fx.spawn(PK.Ember, this.x + rand(-14, 14), this.y - 1, 0, rand(-60, -20), 0.5, 1.2, 0.2, '#ff8a3a', 0, 1);
      if (this.t >= this.tele) {
        this.erupted = true;
        this.tickT = 0;
        sfx('fireBurst', { pan: G.world.pan(this.x) });
        sfx('pillarFire', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.8 });
        G.camera.addTrauma(0.15 * shakeScale());
        fx.ring(this.x, this.y - 2, 4, 40, '#ff9a3a', 0.35, 3, 0.3);
        G.world.hitPlayerSide({ x: this.x - 14, y: this.y - 92, w: 28, h: 92 }, {
          dmg: this.dmg, poise: 30, kx: 0, ky: -320, dir: 0, kind: 'proj', parryable: false, unblockable: true, src: this,
        }, this.hitSet);
      }
      return;
    }
    const bt = this.t - this.tele;
    this.tickT -= dt;
    if (this.tickT <= 0 && bt > 0.12) {
      this.tickT = 0.2;
      this.hitSet.clear();
      G.world.hitPlayerSide({ x: this.x - 12, y: this.y - 80, w: 24, h: 80 }, {
        dmg: this.dmg * 0.22, poise: 4, kx: 0, ky: -120, dir: 0, kind: 'proj', parryable: false, unblockable: true, noKnock: true, src: this,
      }, this.hitSet);
    }
    if (Math.random() < dt * 70) fx.spawn(PK.Flame, this.x + rand(-10, 10), this.y - rand(0, 20), rand(-12, 12), rand(-280, -170), rand(0.35, 0.6), rand(5, 9), 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffcf6b', 0, 1);
    if (bt >= this.burn) this.remove = true;
  }

  draw(ctx: Ctx) {
    const x = this.x, y = this.y;
    ctx.globalCompositeOperation = 'lighter';
    if (!this.erupted) {
      // Shrinking ring and a rune band: stand here and burn.
      const u = clamp(this.t / this.tele, 0, 1);
      const pulse = 0.55 + Math.sin(G.time * 22) * 0.25;
      ctx.globalAlpha = 0.35 + u * 0.4;
      ellipse(ctx, x, y - 1, 18, 4, 0, '#ff5a1a');
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffcf6b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 18, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#fff3d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y - 1, Math.max(1, 18 * (1 - u)), Math.max(0.5, 4 * (1 - u)), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      glow(ctx, x, y - 3, 24 + u * 10, '#ff7a2a', 0.35 + u * 0.35);
    } else {
      const bt = this.t - this.tele;
      const grow = Math.min(1, bt * 8);
      const fade = Math.min(1, (this.burn - bt) * 4);
      const H = 110 * grow;
      if (!this.grad) {
        const g = ctx.createLinearGradient(-16, 0, 16, 0);
        g.addColorStop(0, 'rgba(255,90,20,0)');
        g.addColorStop(0.3, 'rgba(255,140,50,0.7)');
        g.addColorStop(0.5, 'rgba(255,246,220,0.95)');
        g.addColorStop(0.7, 'rgba(255,140,50,0.7)');
        g.addColorStop(1, 'rgba(255,90,20,0)');
        this.grad = g;
      }
      const wob = Math.sin(G.time * 34) * 1.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = fade;
      ctx.fillStyle = this.grad;
      ctx.beginPath();
      ctx.moveTo(-16 - wob, 0);
      ctx.quadraticCurveTo(-12, -H * 0.6, -4 + wob, -H);
      ctx.lineTo(4 - wob, -H);
      ctx.quadraticCurveTo(12, -H * 0.6, 16 + wob, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      glow(ctx, x, y - 8, 46, '#ff7a2a', 0.8 * fade);
      glow(ctx, x, y - H * 0.5, 34, '#ffcf6b', 0.5 * fade);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (!this.erupted) lighting.add(this.x, this.y - 6, 50, '#ff7a2a', 0.6, 0.4);
    else lighting.add(this.x, this.y - 50, 130, '#ff9a3a', 1, 0.8);
  }
}

export class Priest extends Enemy {
  censer = 0;
  cornerT = 0;
  blinkCd = 2;
  fade = 1;
  blinkTo = 0;
  charge = 0;
  pillarCd = rand(1.5, 3);
  volley = 0;
  pal: HumanStyle;

  constructor(x: number, y: number, elite: string | null) {
    super('priest', x, y, 12, 34, elite);
    this.dims = PRIEST_DIMS;
    this.pal = priestStyle(!!elite);
    this.style = this.pal;
    this.anim = new Animator(PRIEST_CLIPS, PB);
    this.anim.play('idle', 0);
    this.anim.time = rand(0, 2);
    this.attackCd = rand(1, 2);
    if (elite) this.scale = 1.1;
  }

  groan() {
    sfx('chant', { pan: G.world.pan(this.x), vol: 0.35, pitch: rand(0.9, 1.1) });
  }

  canBeTargeted() {
    return super.canBeTargeted() && this.state !== 'vanish';
  }

  /** Can it stand at x on its current floor (stone, brick or a ledge)? */
  private standable(x: number) {
    const W = G.world;
    const col = Math.floor(x / TILE), row = Math.floor((this.y + 3) / TILE);
    const under = W.grid.get(col, row);
    if (!(W.solid(under) || under === T.OneWay)) return false;
    return !W.solidAt(x, this.y - 6) && !W.solidAt(x, this.y - 26) && x > 20 && x < W.grid.w * TILE - 20;
  }

  think(dt: number) {
    const b = this.body;
    this.blinkCd -= dt;
    this.pillarCd -= dt;
    if (!this.aggro) {
      const t = this.pickTarget(this.elite ? 330 : 290);
      if (t && this.canSee(t)) {
        this.aggro = true;
        sfx('chant', { pan: G.world.pan(this.x), vol: 0.5 });
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(540);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    const castT = this.elite ? 0.5 : 0.62;
    switch (this.state) {
      case 'cast': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.faceTarget();
        this.charge = Math.min(1, this.st / castT);
        if (this.st >= castT) {
          this.fire(t);
          this.charge = 0;
          this.setState('throw', 'throw', 0.03);
        }
        break;
      }
      case 'throw': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st >= 0.42) {
          if (this.volley > 0) {
            this.volley--;
            this.setState('cast', 'cast', 0.05, 1 / (castT * 0.6));
            this.st = castT * 0.4;
          } else {
            this.attackCd = this.elite ? rand(1.0, 1.6) : rand(1.5, 2.3);
            this.setState('move', 'idle', 0.15);
          }
        }
        break;
      }
      case 'chant': {
        // Calls the pillar early, then holds the chant until it erupts.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.faceTarget();
        if (this.st < dt * 1.5) {
          sfx('chant', { pan: G.world.pan(this.x) });
          const tx = clamp(t.x + (t.body.vx || 0) * 0.15, 20, G.world.grid.w * TILE - 20);
          G.world.add(new FirePillar(tx, t.body.onGround ? t.y : this.y, this.dmg * 1.05, this, 0.8));
          if (this.elite) {
            // The elite rings its prey: a second pillar a stride away.
            const side = Math.random() < 0.5 ? -1 : 1;
            G.world.add(new FirePillar(clamp(tx + side * 44, 20, G.world.grid.w * TILE - 20), t.body.onGround ? t.y : this.y, this.dmg * 1.05, this, 1.05));
          }
        }
        if (Math.random() < dt * 20) fx.spawn(PK.Ember, this.x + this.face * 4 + rand(-6, 6), this.y - 40 + rand(-4, 4), rand(-20, 20), -40, 0.5, 1.4, 0.2, '#ffb347', 0, 1);
        if (this.st >= 1.0) {
          this.pillarCd = this.elite ? rand(4, 6) : rand(5.5, 8);
          this.attackCd = rand(0.8, 1.3);
          this.setState('move', 'idle', 0.2);
        }
        break;
      }
      case 'vanish': {
        // Gone in a burst of flame, back a short way off.
        b.vx = 0;
        this.invuln = 0.2;
        if (this.st < 0.28) this.fade = 1 - this.st / 0.28;
        else {
          if (this.fade <= 0.001 && this.blinkTo) {
            this.x = this.blinkTo;
            this.blinkTo = 0;
            this.faceTarget();
            this.burst();
          }
          this.fade = Math.min(1, (this.st - 0.28) / 0.25);
        }
        if (this.st >= 0.55) {
          this.fade = 1;
          this.invuln = 0;
          this.attackCd = Math.min(this.attackCd, 0.35);
          this.setState('move', 'idle', 0.1);
        }
        break;
      }
      default: {
        this.faceTarget();
        const away = -sign(dx) || -this.face;
        // Cornered: the wall or the drop is at its back and the blade is close.
        const blocked = b.onGround && (wallAhead(b, away, G.world.grid, G.world.solid, 14) || !groundAhead(b, away, G.world.grid, G.world.solid, 12));
        if (dist < 64 && (blocked || dist < 30)) this.cornerT += dt;
        else this.cornerT = Math.max(0, this.cornerT - dt);
        if (this.cornerT > (this.elite ? 0.25 : 0.4) && this.blinkCd <= 0 && b.onGround) {
          if (this.startVanish(t)) break;
        }
        if (this.attackCd <= 0 && b.onGround && dist < 320 && this.canSee(t)) {
          if (this.pillarCd <= 0 && t.body.onGround) {
            this.setState('chant', 'chant', 0.12);
            break;
          }
          this.volley = this.elite ? 2 : 0;
          this.setState('cast', 'cast', 0.08, 1 / castT);
          sfx('fireball', { pan: G.world.pan(this.x), vol: 0.45, pitch: 0.7 });
          break;
        }
        // Keep the blade at arm's length: back away, then hold.
        let moving = false;
        if (dist > 230) moving = this.walkToward(t.x, 60, dt, 200);
        else if (dist < 110) {
          moving = this.walkToward(this.x + away * 40, 64, dt);
          this.face = sign(dx) || this.face;
        } else b.vx = approach(b.vx, 0, 600 * dt);
        const want = moving && Math.abs(b.vx) > 8 ? (sign(b.vx) === this.face ? 'walk' : 'back') : 'idle';
        if (this.anim!.name !== want && this.state === 'move') this.anim!.play(want, 0.15);
        this.state = 'move';
      }
    }
  }

  private startVanish(t: Entity) {
    const away = sign(this.x - t.x) || -this.face;
    // Prefer the far side of the room from the blade; else slip past it.
    const tries = [this.x + away * 150, this.x + away * 110, t.x - away * 120, t.x - away * 160];
    for (const x of tries) {
      if (!this.standable(x)) continue;
      this.blinkTo = x;
      this.blinkCd = this.elite ? 4.5 : 6.5;
      this.cornerT = 0;
      this.hurtT = 0;
      this.setState('vanish', 'idle', 0.05);
      this.burst();
      return true;
    }
    this.blinkCd = 1.5;
    return false;
  }

  private burst() {
    sfx('fireBurst', { pan: G.world.pan(this.x), vol: 0.8 });
    fx.ring(this.x, this.y - 16, 4, 34, '#ff9a3a', 0.3, 3);
    for (let i = 0; i < 14; i++) fx.spawn(PK.Flame, this.x + rand(-8, 8), this.y - rand(0, 34), rand(-60, 60), rand(-140, -40), rand(0.3, 0.6), rand(4, 7), 1, i % 3 ? '#ff7a2a' : '#ffcf6b', -40, 1);
    fx.embers(this.x, this.y - 16, 10, '#ffb347', 10);
  }

  /** Staff head in world space. */
  private tip() {
    const j = this.j;
    const s = this.scale;
    const a = j.wpnA;
    const hx = j.haFX + Math.sin(a) * 16, hy = j.haFY + Math.cos(a) * 16;
    return { x: this.x + this.face * hx * s, y: this.y + hy * s };
  }

  fire(t: Entity) {
    const tp = this.tip();
    const n = this.elite && this.volley === 0 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      // A lob that lands on the target (flame falls at 260 px/s²).
      const lead = (t.body.vx || 0) * 0.3;
      const tx = t.x + lead + (i - (n - 1) / 2) * 30;
      const T = clamp(Math.abs(tx - tp.x) / 260, 0.45, 1.0);
      const vx = (tx - tp.x) / T;
      const vy = ((t.y - 12) - tp.y - 0.5 * 260 * T * T) / T;
      G.world.add(new Proj('flame', tp.x, tp.y, 'enemy', this.dmg * 0.75, { vx, vy, life: 2.4, w: 12, h: 12, color: '#ff6a1a' }));
    }
    sfx('fireball', { pan: G.world.pan(this.x) });
    fx.embers(tp.x, tp.y, 6, '#ffb347', 4);
  }

  update(dt: number) {
    super.update(dt);
    this.censer += dt;
    if (this.state !== 'cast') this.charge = approach(this.charge, 0, dt * 4);
    if (!this.dying && this.fade > 0.5 && Math.random() < dt * 6) {
      // Incense smoke from the censer.
      const cx = this.x + this.face * (this.j.haBX + 1) * this.scale, cy = this.y + (this.j.haBY + 8) * this.scale;
      fx.spawn(PK.Smoke, cx, cy, rand(-6, 6), -18, 1.2, 1.5, 6, '#4a3a3a', -6, 1);
    }
  }

  draw(ctx: Ctx) {
    if (this.fade <= 0.02) return;
    const j = this.j;
    const f = this.face;
    const s = this.scale;
    const deadA = this.dying && !this.awaitingPurify ? clamp(1 - (this.deathT - 0.4) / 0.6, 0, 1) : 1;
    const a = deadA * this.fade;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.scale(f * s, s);
    // Censer on its chain, swinging behind the body.
    {
      const sw = Math.sin(this.censer * 3.2) * 0.45 - this.body.vx * f * 0.003;
      const hx = j.haBX, hy = j.haBY;
      const cx = hx + Math.sin(sw) * 7, cy = hy + Math.cos(sw) * 7;
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      poly(ctx, [cx - 2.2, cy, cx + 2.2, cy, cx + 1.4, cy + 2.4, cx - 1.4, cy + 2.4], '#b8862e', '#1a0e04', 0.4);
      ctx.fillStyle = '#e8c070';
      ctx.fillRect(cx - 2.2, cy - 0.5, 4.4, 0.7);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy + 0.5, 5, '#ff8a3a', 0.6 + Math.sin(this.censer * 9) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawHumanoid(ctx, j, this.pal, G.time + this.id, this.pose.rot, this.body.vx * f, this.body.vy);
    this.drawRegalia(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = a * Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, j, flashStyle(this.pal), G.time + this.id, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Fire gathering at the staff head.
    if (this.charge > 0 && !this.dying) {
      const tp = this.tip();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, tp.x, tp.y, 6 + this.charge * 12, '#ff6a1a', 0.5 + this.charge * 0.5);
      glow(ctx, tp.x, tp.y, 3 + this.charge * 4, '#fff3d0', 0.9);
      ctx.globalCompositeOperation = 'source-over';
      if (this.charge > 0.6) this.glint(ctx, tp.x, tp.y, '#ff8a3a');
    }
    if (this.state === 'chant' && this.st < 0.5) this.glint(ctx, this.x + f * 2 * s, this.y - 44 * s, '#ffb347');
    this.drawFlash(ctx);
  }

  /** The tall hat, the long curled beard and the staff's gilded head, in rig space. */
  private drawRegalia(ctx: Ctx) {
    const j = this.j;
    const o = '#0c0604';
    const gold = '#d8a94c';
    const hatC = this.elite ? '#2a0a10' : '#3a1a10';
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    const R = 4.5;
    // Beard: squared and ringed in curls, Babylonian fashion.
    poly(ctx, [R * 0.15, R * 0.5, R * 1.0, R * 0.6, R * 0.95, R * 1.65, R * 0.7, R * 2.05, R * 0.05, R * 1.95, -R * 0.2, R * 1.0], vGrad(ctx, '#2a1c16', 0, R * 2.1, 0.12, -0.3), o, 0.45);
    ctx.strokeStyle = 'rgba(140,105,80,0.7)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    for (let r = 0; r < 3; r++) {
      const y = R * (0.95 + r * 0.36);
      for (let x = 0; x < R * 0.85; x += 1.1) {
        ctx.moveTo(x, y);
        ctx.arc(x + 0.5, y, 0.5, Math.PI, 0, true);
      }
    }
    ctx.stroke();
    // Tall hat: a flared cylinder with gold bands and a crescent at the crown.
    const y0 = -R * 0.6, y1 = -R * 2.55;
    poly(ctx, [-R * 0.95, y0, R * 0.95, y0, R * 0.8, y1, -R * 0.75, y1 - 0.3], vGrad(ctx, hatC, y1, y0, 0.25, -0.25), o, 0.5);
    ctx.fillStyle = gold;
    ctx.fillRect(-R * 0.95, y0 - 1.0, R * 1.9, 1.0);
    ctx.fillRect(-R * 0.86, y0 - R * 1.15, R * 1.74, 0.6);
    ctx.fillRect(-R * 0.78, y1 - 0.4, R * 1.6, 0.8);
    // A rosette on the band, a crescent at the crown.
    ellipse(ctx, R * 0.45, y0 - R * 0.6, 0.8, 0.8, 0, gold);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, y1 - 2, 1.6, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
    // Staff head: a gilded ring that cups the flame.
    const a = j.wpnA;
    const tx = j.haFX + Math.sin(a) * 16, ty = j.haFY + Math.cos(a) * 16;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(tx, ty, 2.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, tx, ty, 4 + this.charge * 2, '#ff8a3a', 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    if (this.awaitingPurify) {
      super.lights();
      return;
    }
    lighting.add(this.x, this.y - 22, 46 + this.charge * 40, '#ff8a3a', (0.45 + this.charge * 0.4) * this.fade, 0.4);
  }
}

export { CORRUPT };
