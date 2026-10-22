// Swimming and dives: Elior's buoyant 8-way swim, the dash-stroke, breaching
// out of the surface, breath and drowning, and Echoes paddling after him.
// The room side (water volumes, currents, air bells, constants) is in
// game/water.ts; the look is in render/underwater.ts.
//
// Controls in deep water: stick/arrows swim in eight directions; Jump is an
// upward stroke, or at the surface a breach that leaps clear; Dodge is a quick
// dash-stroke with brief i-frames; Attack is a single heavy thrust (no combo
// chain, no launchers), Parry/Block work as on land. Heavy, sub-weapons,
// skills, Balm, the Rally and the Shadow Mantle are refused underwater.

import type { Player } from './player';
import type { EchoUnit } from './echoes';
import { G } from './ctx';
import { input } from '../core/input';
import { approach, clamp, sign } from '../core/math';
import { moveBody } from './physics';
import { fx } from '../render/fx';
import { sfx, audio } from '../audio/audio';
import { emitBubble, splash } from '../render/underwater';
import type { Clip } from '../render/skeleton';
import {
  probeWater, flowAt, inAirPocket, waterRoom, SWIM_DEPTH, BREATH_MAX, BREATH_REFILL, DROWN_DMG, DROWN_TICK,
  SWIM_SPEED, SWIM_ACCEL, FLOAT_DEPTH, type WaterProbe,
} from './water';

/** Dash-stroke: length, speed, cooldown and its i-frame window (seconds into the stroke). */
export const DASH_T = 0.3;
export const DASH_V = 290;
const DASH_CD = 0.5;
const DASH_IFRAMES: [number, number] = [0.02, 0.24];
/** Upward stroke (Jump under water) and the breach out of the surface. */
const STROKE_V = 210;
const BREACH_V = 440;
/** Idle drift toward the surface. */
const RISE = 26;
/** Attacks swing this much slower under water. */
export const SWIM_ATTACK_SPEED = 0.72;

export interface SwimState {
  /** Feet below a water surface. */
  inWater: boolean;
  wading: boolean;
  swimming: boolean;
  /** Head under the surface (or under a flooded ceiling). */
  submerged: boolean;
  /** Head inside an air bell. */
  pocket: boolean;
  surface: number;
  air: boolean;
  breath: number;
  drownT: number;
  /** Breath ring visibility, 0..1. */
  showT: number;
  dashT: number;
  dashCd: number;
  dirX: number;
  dirY: number;
  strokeCd: number;
  /** Seconds since the last kick (the pose quickens). */
  kickT: number;
  breachT: number;
  splashT: number;
  bubbleT: number;
  deniedT: number;
  /** Body angle drawn while swimming (0 upright, π/2 head-first forward). */
  angle: number;
  flowX: number;
  flowY: number;
}

export function makeSwim(): SwimState {
  return {
    inWater: false, wading: false, swimming: false, submerged: false, pocket: false, surface: 0, air: true,
    breath: BREATH_MAX, drownT: 0, showT: 0, dashT: 0, dashCd: 0, dirX: 1, dirY: 0, strokeCd: 0, kickT: 9,
    breachT: 0, splashT: 0, bubbleT: 0, deniedT: 0, angle: 0, flowX: 0, flowY: 0,
  };
}

const P: WaterProbe = { surface: 0, floor: 0, depth: 0, air: true };
const H: WaterProbe = { surface: 0, floor: 0, depth: 0, air: true };
const FLOW = { x: 0, y: 0 };
let muffled = false;

/** The low-pass on the whole mix while the head is under; restored on surfacing. */
export function muffleWater(on: boolean) {
  if (on === muffled) return;
  muffled = on;
  audio.setUnderwater(on);
}

/** Elior is in deep water and in a state the water carries (not a blink or a cinematic). */
export function swimPhysicsOn(p: Player) {
  return p.water.swimming && p.state !== 'execute' && p.state !== 'phantom' && p.state !== 'transform';
}

/** I-frames of the dash-stroke. */
export function swimInvuln(p: Player) {
  const w = p.water, e = DASH_T - w.dashT;
  return p.state === 'swim' && w.dashT > 0 && e > DASH_IFRAMES[0] && e < DASH_IFRAMES[1];
}

const restY = (w: SwimState) => (w.air ? w.surface + FLOAT_DEPTH : -1e9);

// ---------------------------------------------------------------- sensing, breath, transitions

/** Read the water around Elior: wading/swimming, head under, breath, and state changes. Runs every step. */
export function senseWater(p: Player, dt: number) {
  const w = p.water, b = p.body;
  w.dashCd = Math.max(0, w.dashCd - dt);
  w.strokeCd = Math.max(0, w.strokeCd - dt);
  w.breachT = Math.max(0, w.breachT - dt);
  w.splashT = Math.max(0, w.splashT - dt);
  w.deniedT = Math.max(0, w.deniedT - dt);
  w.kickT += dt;
  if (!waterRoom.any) {
    if (w.inWater || w.swimming || w.submerged) { w.inWater = w.wading = w.swimming = w.submerged = w.pocket = false; muffleWater(false); }
    if (p.state === 'swim') p.setState('free');
    w.breath = BREATH_MAX;
    w.showT = Math.max(0, w.showT - dt * 2);
    return;
  }
  const g = G.world.grid;
  const was = w.swimming, wasIn = w.inWater, wasSub = w.submerged;
  const feet = probeWater(g, b.x, b.y - 1, P);
  w.inWater = feet;
  if (feet) { w.surface = P.surface; w.air = P.air; }
  const deep = feet && P.depth > SWIM_DEPTH;
  // Falling in, the feet must sink a little before he swims; a breach is let go.
  w.swimming = deep && (was || b.y - P.surface > 10) && !(w.breachT > 0 && b.vy < 0);
  w.wading = feet && !w.swimming;
  const headY = b.y - b.h + 7;
  w.submerged = probeWater(g, b.x, headY, H);
  w.pocket = w.submerged && inAirPocket(b.x, headY);
  if (w.swimming) flowAt(b.x, b.y - b.h / 2, FLOW);
  else FLOW.x = FLOW.y = 0;
  w.flowX = FLOW.x; w.flowY = FLOW.y;

  // ---- breath
  const breathing = !w.submerged || w.pocket;
  if (breathing) {
    if (w.breath < BREATH_MAX * 0.4 && wasSub && p.state !== 'dead') sfx('gasp', { vol: 0.7 });
    w.breath = Math.min(BREATH_MAX, w.breath + BREATH_REFILL * dt);
    w.drownT = 0;
  } else {
    w.breath = Math.max(0, w.breath - dt);
    if (w.breath <= 0 && p.state !== 'dead' && !G.inCutscene) {
      w.drownT += dt;
      if (w.drownT >= DROWN_TICK) {
        w.drownT -= DROWN_TICK;
        drown(p);
      }
    }
  }
  w.showT = w.submerged || w.breath < BREATH_MAX ? Math.min(1, w.showT + dt * 5) : Math.max(0, w.showT - dt * 1.6);
  muffleWater(w.submerged && !w.pocket && p.state !== 'dead');

  // ---- bubbles from the mouth while under
  if (w.submerged && !w.pocket) {
    w.bubbleT -= dt;
    if (w.bubbleT <= 0) {
      w.bubbleT = w.breath <= 0 ? 0.12 : 0.5 + Math.random() * 0.9;
      emitBubble(b.x + p.face * 3, headY, p.face * 6, -20, w.breath <= 0 ? 1.6 : 1);
      if (Math.random() < 0.5) emitBubble(b.x + p.face * 2, headY + 2, 0, -14, 0.8);
    }
  }

  // ---- transitions
  if (w.swimming && !was) {
    const v = b.vy;
    if (v > 120) {
      splash(b.x, P.surface, Math.min(1.6, v / 300));
      sfx('splash', { vol: Math.min(1, 0.4 + v / 600), pan: G.world.pan(b.x) });
      for (let i = 0; i < 6; i++) emitBubble(b.x + (Math.random() - 0.5) * 12, b.y - Math.random() * 20, 0, -30 - Math.random() * 30, 1.2);
    }
    if (p.state === 'plunge' || p.state === 'airdash' || p.state === 'dodge') p.atk = null;
  }
  if (!w.swimming && wasIn === false && feet && b.vy > 150) {
    // Into the shallows from a jump.
    splash(b.x, P.surface, 0.6);
    sfx('splash', { vol: 0.4, pitch: 1.3, pan: G.world.pan(b.x) });
  }
  if (w.swimming && (p.state === 'free' || p.state === 'airdash' || p.state === 'dodge' || p.state === 'plunge')) {
    p.setState('swim');
  } else if (!w.swimming && p.state === 'swim') p.setState('free');
  // Wading: splashes kicked up with each stride.
  if (w.wading && b.onGround && Math.abs(b.vx) > 40 && w.splashT <= 0) {
    w.splashT = 0.16;
    splash(b.x - p.face * 3, P.surface, 0.25);
    sfx('splashSmall', { vol: 0.35, pitch: 0.9 + Math.random() * 0.3, gap: 120 });
  }
}

function drown(p: Player) {
  const s = G.save;
  const dmg = Math.max(1, Math.round(G.d.maxHp * DROWN_DMG));
  s.hp -= dmg;
  p.sinceHurt = 0;
  p.flash = 0.12;
  fx.number(p.x, p.y - 40, dmg, false, '#8fd0ff');
  sfx('choke', { vol: 0.8 });
  input.rumble(0.4, 0.3, 120);
  for (let i = 0; i < 5; i++) emitBubble(p.x + p.face * 3, p.y - p.body.h + 7, (Math.random() - 0.5) * 20, -40 - Math.random() * 30, 1.4);
  if (s.hp <= 0) {
    s.hp = 0;
    p.die();
  }
  G.ui.refreshHud();
}

// ---------------------------------------------------------------- control (the 'swim' state)

function deny(p: Player) {
  p.heavyQ = 0;
  if (p.water.deniedT > 0) return;
  p.water.deniedT = 1.2;
  G.ui.toast('Not under water. Swim, thrust, parry or dash-stroke.', 'warn');
  sfx('denied');
}

export function swimControl(p: Player, dt: number) {
  const w = p.water, b = p.body;
  let mx = input.axisX, my = input.axisY;
  const m = Math.hypot(mx, my);
  if (m < 0.2) mx = my = 0;
  else if (m > 1) { mx /= m; my /= m; }
  const rest = restY(w);
  const speed = SWIM_SPEED * G.d.speed * (p.veiled > 0 ? 0.6 : 1) * (p.mantleT > 0 ? 1.15 : 1);
  if (w.dashT > 0) {
    w.dashT = Math.max(0, w.dashT - dt);
    const k = 0.45 + 0.55 * (w.dashT / DASH_T);
    b.vx = w.dirX * DASH_V * k + w.flowX;
    b.vy = w.dirY * DASH_V * k + w.flowY;
    if (w.air && b.y < rest && b.vy < 0) b.vy = 0;
  } else {
    const tvx = mx * speed + w.flowX;
    let tvy = Math.abs(my) > 0.25 ? my * speed : w.air ? clamp((rest - b.y) * 3, -RISE, 80) : -RISE;
    // He can't swim higher than treading water; the breach is a jump.
    if (w.air && tvy < 0) tvy = Math.max(tvy, (rest - b.y) * 4);
    tvy += w.flowY;
    // Plunging in from a height, the water brakes him hard.
    if (Math.abs(b.vy - tvy) > speed) b.vy = tvy + (b.vy - tvy) * Math.exp(-9 * dt);
    if (Math.abs(b.vx - tvx) > speed * 1.4) b.vx = tvx + (b.vx - tvx) * Math.exp(-6 * dt);
    b.vx = approach(b.vx, tvx, SWIM_ACCEL * dt);
    b.vy = approach(b.vy, tvy, SWIM_ACCEL * dt);
  }
  if (Math.abs(mx) > 0.2 && w.dashT <= 0) p.face = sign(mx);

  if (p.jumpBuf > 0) {
    p.jumpBuf = 0;
    if (w.air && b.y - rest < 12) {
      breach(p);
      return;
    }
    if (w.strokeCd <= 0) {
      b.vy = Math.min(b.vy, -STROKE_V);
      w.strokeCd = 0.28;
      w.kickT = 0;
      sfx('swimStroke', { vol: 0.5, pan: G.world.pan(b.x) });
      for (let i = 0; i < 3; i++) emitBubble(b.x - p.face * 4 + (Math.random() - 0.5) * 6, b.y - 4, (Math.random() - 0.5) * 20, -10, 0.9);
    }
  }
  if (p.dodgeBuf > 0 && w.dashCd <= 0) {
    p.dodgeBuf = 0;
    startDash(p, mx, my);
    return;
  }
  if (p.parryBuf > 0 && p.parryCd <= 0) {
    p.startParry();
    return;
  }
  if (p.queued === 'attack') {
    p.queued = null;
    p.combo = 0;
    p.startAttack(p.moves.combo[0]);
    return;
  }
  if (p.heavyQ > 0 || input.pressed('sub') || input.pressed('heal') || input.pressed('ultimate') ||
    input.pressed('skill1') || input.pressed('skill2') || input.pressed('skill3')) {
    deny(p);
    return;
  }
  if (input.pressed('interact') || (input.pressed('up') && G.world.nearInteractable())) {
    G.world.tryInteract();
    return;
  }
  if (input.pressed('echo')) {
    G.ui.echoWheel(true);
    return;
  }
  if (input.pressed('switch')) G.world.switchSupport();
}

/** Nothing above the dash-stroke but the water, and it can always be called from a swing's cancel window. */
export function startDash(p: Player, mx = input.axisX, my = input.axisY) {
  const w = p.water;
  const m = Math.hypot(mx, my);
  if (m < 0.2) { w.dirX = p.face; w.dirY = 0; } else { w.dirX = mx / m; w.dirY = my / m; }
  if (w.dirX) p.face = sign(w.dirX);
  w.dashT = DASH_T;
  w.dashCd = DASH_CD;
  w.kickT = 0;
  p.dodgeBuf = p.parryBuf = 0;
  p.queued = null;
  p.atk = null;
  p.setState('swim');
  sfx('dash', { vol: 0.55, pitch: 0.62 });
  for (let i = 0; i < 6; i++) emitBubble(p.x - w.dirX * (4 + i * 3), p.y - 16 - w.dirY * i * 3 + (Math.random() - 0.5) * 8, -w.dirX * 30, -20, 1);
}

/** Leap out of the surface: a full jump, wings and air-dash restored. */
export function breach(p: Player) {
  const w = p.water, b = p.body;
  p.setState('free');
  w.swimming = false;
  w.breachT = 0.4;
  w.dashT = 0;
  b.vy = -BREACH_V;
  b.onGround = false;
  p.airJumps = p.hasDouble() ? 1 : 0;
  p.airDash = 1;
  p.anim.play('jump', 0.05, true);
  splash(b.x, w.surface, 1.1);
  sfx('splash', { vol: 0.75, pitch: 1.1, pan: G.world.pan(b.x) });
}

/** Water instead of gravity: the carried states (a swing, a parry, a stagger) drift and settle. */
export function waterPhysics(p: Player, dt: number) {
  if (p.state === 'swim') return;
  const w = p.water, b = p.body;
  b.vx = w.flowX + (b.vx - w.flowX) * Math.exp(-2.5 * dt);
  const tvy = (w.air ? clamp((restY(w) - b.y) * 3, -RISE, 80) : -RISE) + w.flowY;
  if (Math.abs(b.vy - tvy) > SWIM_SPEED) b.vy = tvy + (b.vy - tvy) * Math.exp(-9 * dt);
  b.vy = approach(b.vy, tvy, 420 * dt);
}

// ---------------------------------------------------------------- the swimming figure

/** Skeleton clips (classic painter): a crawl, and treading water upright. */
export const SWIM_CLIPS: Record<string, Clip> = {
  swim: {
    dur: 0.9, loop: true,
    fn: (u) => {
      const a = u * Math.PI * 2, s = Math.sin(a);
      return {
        lean: 0.05, head: -0.35,
        fUA: 1.7 + 1.35 * s, fFA: 0.25 + 0.35 * Math.max(0, -s), bUA: 1.7 - 1.35 * s, bFA: 0.25 + 0.35 * Math.max(0, s),
        fTh: 0.12 + 0.32 * Math.sin(a * 2), fSh: -0.35 - 0.2 * Math.max(0, Math.cos(a * 2)),
        bTh: 0.12 - 0.32 * Math.sin(a * 2), bSh: -0.35 - 0.2 * Math.max(0, -Math.cos(a * 2)),
        wpn: 1.2,
      };
    },
  },
  tread: {
    dur: 1.4, loop: true,
    fn: (u) => {
      const a = u * Math.PI * 2, s = Math.sin(a);
      return {
        lean: 0.08, head: 0, y: Math.sin(a) * 0.6,
        fUA: 1.25 + 0.35 * s, fFA: 0.5, bUA: 1.25 - 0.35 * s, bFA: 0.5,
        fTh: 0.35 + 0.45 * s, fSh: -1.0 - 0.4 * Math.max(0, s), bTh: 0.35 - 0.45 * s, bSh: -1.0 - 0.4 * Math.max(0, -s),
        wpn: 0.9,
      };
    },
  },
};

/** Choose the stroke and turn the body along the swim (pose.rot: 0 upright, π/2 head-first). */
export function animateSwim(p: Player, dt: number) {
  const w = p.water, b = p.body;
  const vx = b.vx - w.flowX, vy = b.vy - w.flowY;
  const sp = Math.hypot(vx, vy);
  const moving = sp > 34 || w.dashT > 0;
  if (moving) p.anim.play('swim', 0.15, false, w.dashT > 0 ? 2.2 : clamp(sp / SWIM_SPEED, 0.6, 1.5) * (w.kickT < 0.3 ? 1.6 : 1));
  else p.anim.play('tread', 0.25, false, w.kickT < 0.3 ? 2 : 1);
  const target = moving ? clamp(Math.atan2(Math.abs(vx), -vy), 0.15, 2.7) : 0.12;
  const d = target - w.angle;
  w.angle += clamp(d, -7 * dt, 7 * dt);
}

// ---------------------------------------------------------------- Echoes in the water

export interface EchoSwim { on: boolean; tilt: number; stuck: number; breachT: number; lx: number; ly: number }
export const makeEchoSwim = (): EchoSwim => ({ on: false, tilt: 0, stuck: 0, breachT: 0, lx: 0, ly: 0 });

/**
 * Echoes never drown and never fight in deep water: they paddle after Elior,
 * and when he is ashore they surface and leap out toward him. Returns true
 * while it has moved the Echo (its land AI is skipped that step).
 */
export function echoSwim(u: EchoUnit, dt: number): boolean {
  const s = u.swim, b = u.body;
  s.breachT = Math.max(0, s.breachT - dt);
  if (!waterRoom.any || u.recallT > 0) { s.on = false; return false; }
  const g = G.world.grid;
  const deep = probeWater(g, b.x, b.y - 1, P) && P.depth > SWIM_DEPTH;
  if (!deep || (!s.on && b.y - P.surface < 10) || (s.breachT > 0 && b.vy < 0)) {
    s.on = false;
    s.tilt = approach(s.tilt, 0, dt * 4);
    return false;
  }
  if (!s.on) {
    s.on = true;
    s.stuck = 0;
    if (b.vy > 140) splash(b.x, P.surface, 0.7);
  }
  const p = G.world.player;
  const rest = P.air ? P.surface + b.h * 0.72 : -1e9;
  const ashore = !p.water.swimming && p.state !== 'dead';
  const tx = p.x - p.face * (22 + u.slot * 18);
  let ty = ashore ? rest : p.y + (u.slot % 2 ? 8 : -6);
  if (P.air) ty = Math.max(ty, rest);
  if (ashore && P.air && Math.abs(b.y - rest) < 12 && (Math.abs(p.x - b.x) < 140 || s.stuck > 0.8)) {
    // Up and out after him.
    b.vy = -470;
    b.vx = sign(p.x - b.x || 1) * 130;
    u.face = sign(b.vx);
    s.breachT = 0.45;
    s.on = false;
    splash(b.x, P.surface, 0.8);
    sfx('splashSmall', { vol: 0.4, pan: G.world.pan(b.x) });
    return false;
  }
  flowAt(b.x, b.y - b.h / 2, FLOW);
  const dx = tx - b.x, dy = ty - b.y, sp = 150;
  const tvx = clamp(dx * 2.5, -sp, sp) + FLOW.x, tvy = clamp(dy * 2.5, -sp, sp) + FLOW.y;
  if (Math.abs(b.vy - tvy) > sp) b.vy = tvy + (b.vy - tvy) * Math.exp(-9 * dt);
  b.vx = approach(b.vx, tvx, 600 * dt);
  b.vy = approach(b.vy, tvy, 600 * dt);
  if (Math.abs(dx) > 6) u.face = sign(dx);
  moveBody(b, dt, g, G.world.solid, u.collide);
  // Pinned behind a wall or a reef: after a few seconds it rejoins him.
  const far = Math.hypot(dx, dy) > 48, moved = Math.hypot(b.x - s.lx, b.y - s.ly);
  s.lx = b.x; s.ly = b.y;
  s.stuck = far && moved < 40 * dt ? s.stuck + dt : Math.max(0, s.stuck - dt * 0.5);
  if (s.stuck > 3) {
    s.stuck = 0;
    b.x = p.x - p.face * 18;
    b.y = p.y;
    b.vx = b.vy = 0;
    fx.holyBurst(b.x, b.y - 20, 10, 0.6);
  }
  s.tilt = approach(s.tilt, clamp(b.vx * u.face / 150, -0.2, 1) * 0.55, dt * 3);
  if (Math.random() < dt * 0.8) emitBubble(b.x + u.face * 3, b.y - b.h + 6, 0, -18, 0.7);
  return true;
}
