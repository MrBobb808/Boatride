// THE IMAGE OF GOLD — the colossus raised on the plain of Dura, cast after
// the king's dream: "This image's head was of fine gold, his breast and his
// arms of silver, his belly and his thighs of brass, His legs of iron, his
// feet part of iron and part of clay." Daniel 2:32–33 (KJV)
//
// It stands on its dais as a still statue until the story wakes it. Mostly
// planted, it turns and steps like a falling wall. A fist slam sends
// shockwaves both ways, a low sweep must be jumped, its gaze burns a line
// along the floor, its brass belly breathes fire, and its stomp brings the
// sky down in pieces. Phase 2 cracks the silver arms and quickens it, and it
// calls lions and priests; phase 3 lights the furnace in its belly and the
// clay feet crack. In every phase, blows to the feet bite deeper.
// Beaten, it sinks onto its broken feet; the story then calls shatter().

import { type HitInfo } from './entity';
import { BossBase } from './bosses2';
import { solve, newJoints, BASE_POSE, POSE_KEYS, type Joints, type Pose, type RigDims } from '../render/skeleton';
import { glow, rgba, poly, ellipse, capsulePath, shade, shadeable, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose, easeOutCubic, easeInQuad, easeInOutSine } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { Enemy } from './enemies';
import type { EnemyKind } from './tiles';

/** Height of the dais the Image stands on (the room art draws the dais). */
export const IMAGE_DAIS_H = 12;
/** Sole to ankle. The rig's origin is the ankle line. */
const FOOT_H = 7;
/** Hits whose impact lands this close to the soles strike the feet. */
const FEET_ZONE = 32;
const STANCE = 14;
const DIMS: RigDims = { torso: 47, head: 10, neck: 4, upperArm: 29, foreArm: 27, thigh: 31, shin: 29, shoulderSpread: 19, hipSpread: 9 };

// ---------------------------------------------------------------- metals

type Metal = 'gold' | 'silver' | 'brass' | 'iron' | 'clay';

// Each metal has its own sheen: gold warm with a hot specular, silver a cold
// mirror with a dark reflected band, brass softer and orange, iron dull and
// blue-grey, clay matte with no shine at all.
const MET: Record<Metal, { c: string; hi: string; line: string; stops: [number, string][] }> = {
  gold: { c: '#d8a840', hi: '#fff4c8', line: '#5a3a0c', stops: [[0, '#9a6e22'], [0.12, '#fff2c0'], [0.24, '#f6d27a'], [0.5, '#d8a840'], [0.8, '#7a5014'], [1, '#a8782a']] },
  silver: { c: '#b4bcc6', hi: '#ffffff', line: '#323a44', stops: [[0, '#6a7480'], [0.1, '#ffffff'], [0.22, '#e2e8ee'], [0.46, '#a8b2bc'], [0.6, '#4e5662'], [0.84, '#3a404a'], [1, '#8a94a0']] },
  brass: { c: '#b8782c', hi: '#ffd89a', line: '#40240a', stops: [[0, '#7a4a18'], [0.16, '#ffd08a'], [0.32, '#e0a050'], [0.62, '#ad6c28'], [1, '#4a2a0e']] },
  iron: { c: '#5c616a', hi: '#c0c8d4', line: '#101114', stops: [[0, '#3a3d44'], [0.18, '#b4bcc8'], [0.32, '#767c86'], [0.7, '#3c3f46'], [1, '#26282c']] },
  clay: { c: '#9c5c3c', hi: '#d09070', line: '#341608', stops: [[0, '#b87a56'], [0.4, '#a0603e'], [1, '#5a2e1c']] },
};
const OUT = '#100804';

const gradCache = new Map<string, CanvasGradient>();
function stopsInto(g: CanvasGradient, m: Metal, dark: boolean) {
  for (const [o, c] of MET[m].stops) g.addColorStop(o, dark ? shade(c, -0.38) : c);
  return g;
}
/** Cylinder sheen across local y in [-R, R]; the lit side is -y. Built once per metal and size. */
function metalGrad(ctx: Ctx, m: Metal, R: number, dark: boolean) {
  const r = Math.round(R * 2) / 2;
  const key = m + r + (dark ? 'd' : '');
  let g = gradCache.get(key);
  if (!g) gradCache.set(key, (g = stopsInto(ctx.createLinearGradient(0, -r, 0, r), m, dark)));
  return g;
}
/** Sheen for a broad plate in a fixed local frame (lit from the front and above). */
function metalPlate(ctx: Ctx, m: Metal, key: string, x0: number, y0: number, x1: number, y1: number, dark = false) {
  const k = m + key + (dark ? 'd' : '');
  let g = gradCache.get(k);
  if (!g) gradCache.set(k, (g = stopsInto(ctx.createLinearGradient(x0, y0, x1, y1), m, dark)));
  return g;
}

/** Add a crack polyline to the path, revealed up to amt (0..1), scaled. */
function crackPath(ctx: Ctx, pts: readonly number[], amt: number, sx = 1, sy = 1) {
  const n = pts.length / 2;
  if (amt <= 0 || n < 2) return;
  const reach = amt * (n - 1);
  ctx.moveTo(pts[0] * sx, pts[1] * sy);
  for (let i = 1; i < n; i++) {
    if (i <= reach) ctx.lineTo(pts[i * 2] * sx, pts[i * 2 + 1] * sy);
    else {
      const f = reach - (i - 1);
      ctx.lineTo((pts[i * 2 - 2] + (pts[i * 2] - pts[i * 2 - 2]) * f) * sx, (pts[i * 2 - 1] + (pts[i * 2 + 1] - pts[i * 2 - 1]) * f) * sy);
      break;
    }
  }
}

// Crack lines. Limbs: (u along, v across as a fraction of radius). Plates: px.
const LIMB_CRACK = [0.06, -0.5, 0.2, 0.25, 0.33, -0.2, 0.48, 0.45, 0.6, -0.05, 0.76, 0.55, 0.94, 0.15];
const LIMB_CRACK2 = [0.15, 0.6, 0.3, 0.1, 0.42, 0.5, 0.58, -0.4, 0.7, -0.1, 0.86, -0.6];
const CHEST_CRACKS = [
  [-15, -46, -10, -40, -13, -34, -6, -29, -9, -22],
  [11, -44, 15, -37, 9, -31, 14, -23],
  [2, -50, -1, -44, 4, -38, 1, -33],
];
const BELLY_CRACKS = [
  [-15, -19, -10, -13, -14, -6, -9, 1],
  [16, -16, 12, -9, 16, -3],
];
const HEAD_CRACKS = [
  [-5, -21, -3, -15, -6, -10, -2, -5, -4, 1],
  [6, -21, 4, -16, 7, -12, 5, -8],
];
const FOOT_CRACKS = [
  [-6, 1, -3, 3, -5, 5, -2, 7],
  [2, -1, 4, 2, 2, 4, 5, 7],
  [-1, 0, 1, 3, -1, 6],
];

/** A set of cracks: a dark split with light inside it. */
function crackSet(ctx: Ctx, list: readonly (readonly number[])[], amt: number, glowC: string, w: number) {
  if (amt <= 0.01) return;
  ctx.beginPath();
  for (const c of list) crackPath(ctx, c, amt);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = glowC;
  ctx.lineWidth = 0.65;
  ctx.globalAlpha = 0.55 + Math.min(1, amt) * 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Sample points down the furnace cone for its hit boxes. */
const CONE_U = [0.3, 0.55, 0.78, 1];

// ---------------------------------------------------------------- poses (arms, torso, head; legs are IK)

const REST: Pose = { ...BASE_POSE, lean: 0.03, head: 0.06, bUA: 0.12, bFA: 0.24, fUA: 0.18, fFA: 0.3, wpn: 0, off: 0 };
const SP = {
  rest: REST,
  dormant: { ...REST, head: 0.2, fUA: 0.1, bUA: 0.06 },
  awake: { ...REST, head: -0.24, lean: -0.08, fUA: 0.55, fFA: 0.75, bUA: 0.45, bFA: 0.7 },
  recoil: { ...REST, lean: -0.22, head: -0.3, fUA: 0.9, fFA: 0.9, bUA: 0.8, bFA: 0.9, y: 2 },
  slamUp: { ...REST, lean: -0.14, head: -0.12, fUA: 3.05, fFA: 0.3, bUA: -0.25, bFA: 0.45 },
  // The fist comes down to the floor a stride ahead: a deep bow, knees bent.
  slamDown: { ...REST, lean: 0.9, head: 0.4, fUA: 0.38, fFA: 0.04, bUA: 0.5, bFA: 0.7, y: 14 },
  sweepBack: { ...REST, lean: 0.3, head: 0.15, fUA: -1.05, fFA: -0.45, bUA: 0.7, bFA: 0.4, y: 7 },
  sweepThrough: { ...REST, lean: 0.78, head: 0.3, fUA: 0.85, fFA: 0.08, bUA: -0.4, bFA: 0.3, y: 14 },
  gaze: { ...REST, lean: 0.14, head: 0.3, fUA: 0.42, fFA: 0.5, bUA: 0.3, bFA: 0.5 },
  breath: { ...REST, lean: -0.2, head: -0.16, fUA: 0.95, fFA: 0.55, bUA: -0.75, bFA: 0.45 },
  stompUp: { ...REST, lean: -0.1, head: 0.05, fUA: 0.85, fFA: 0.45, bUA: -0.55, bFA: 0.45, y: -2 },
  stompDown: { ...REST, lean: 0.14, head: 0.14, fUA: 0.3, bUA: 0.12, y: 4 },
  summon: { ...REST, lean: -0.16, head: -0.38, fUA: 2.6, fFA: 0.35, bUA: 2.45, bFA: 0.35 },
  stepA: { ...REST, lean: 0.08, fUA: -0.12, bUA: 0.4 },
  // A pivot: the shoulders swing through (front arm back, far arm forward), the head leads.
  turnA: { ...REST, lean: 0.1, head: -0.3, fUA: -0.75, fFA: 0.5, bUA: 0.95, bFA: 0.5, y: 3 },
  turnB: { ...REST, lean: 0.06, head: 0.2, fUA: 0.75, fFA: 0.45, bUA: -0.5, bFA: 0.4, y: 2 },
  kneel: { ...REST, lean: 0.48, head: 0.5, fUA: 0.75, fFA: 0.25, bUA: 0.3, bFA: 0.55, y: 24 },
  dead: { ...REST, lean: 0.56, head: 0.7, fUA: 0.5, fFA: 0.45, bUA: 0.2, bFA: 0.5, y: 27 },
};

type IAtk = 'slam' | 'sweep' | 'gaze' | 'breath' | 'stomp' | 'summon' | 'step' | 'turn';

interface Marker { x: number; t: number; p: Proj | null; kind: 0 | 1 }
interface Chunk {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  s: number; m: Metal; verts: Float32Array; at: number; age: number; life: number; out: boolean;
}

export class GoldenImage extends BossBase {
  pixelBox = [-215, -185, 215, 10] as const;
  j: Joints = newJoints();
  pose: Pose = { ...SP.dormant };
  /** Scratch pose: the target plus breathing, solved each frame. */
  dp: Pose = { ...SP.dormant };
  /** Mutable target for poses that track something (the gaze). */
  cp: Pose = { ...SP.gaze };
  tgt: Pose = SP.dormant;
  rate = 4;
  atk: IAtk | null = null;
  lastAtk: IAtk | null = null;
  step = 0;
  struck = false;
  homeX: number;
  /** Feet in world x (0 front, 1 back) and how high each is lifted. */
  footX = [0, 0];
  footL = [0, 0];
  stepFrom = 0;
  stepTo = 0;
  bodyFrom = 0;
  bodyTo = 0;
  turnSq = 1;
  turnT = 0;
  eyes = 0;
  eyeCharge = 0;
  furnace = 0.12;
  beamOn = 0;
  beamX = 0;
  beamX0 = 0;
  breathOn = 0;
  tickT = 0;
  sfxT = 0;
  markX = 0;
  summonCd = 6;
  rainT = 3;
  markers: Marker[] = [];
  crArm = 0;
  crBody = 0;
  crFeet = 0;
  crHead = 0;
  feetFlash = 0;
  feetTold = false;
  /** Seconds the player has spent at the feet (reset when they leave). */
  feetT = 0;
  topY = 0;
  bellyX = 0;
  bellyY = 0;
  eyeX = 0;
  eyeY = 0;
  yielded = false;
  camF = { x: 0, y: 0 };
  // The stone cut out without hands, and the pieces of the Image.
  shatterT = -1;
  shatterDone: (() => void) | null = null;
  stoneX = 0;
  stoneY = 0;
  stoneR = 0;
  stoneOn = false;
  stoneVerts: Float32Array;
  chunks: Chunk[] = [];
  broken = false;
  sink = 0;

  constructor(x: number, y: number) {
    super('golden_image', x, y, 64, 150, 30000);
    this.name = 'The Image of Gold';
    this.sub = 'Idol of the Plain of Dura';
    this.maxPoise = this.poise = 700;
    this.kneelTime = 3.8;
    this.face = -1;
    this.homeX = x;
    this.hitColor = '#ffe6a8';
    this.hitSound = 'hitMetal';
    this.phaseMarks = [0.6, 0.25];
    this.footX[0] = x + this.face * STANCE;
    this.footX[1] = x - this.face * STANCE;
    // A rough stone, not cut by any hand: an irregular outline, made once.
    const n = 9;
    this.stoneVerts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 13 * (0.82 + ((i * 7919) % 13) / 13 * 0.3);
      this.stoneVerts[i * 2] = Math.cos(a) * r;
      this.stoneVerts[i * 2 + 1] = Math.sin(a) * r * 0.86;
    }
    this.animate(0);
  }

  get dmg() {
    return 58 * this.ngMul * (this.phase >= 3 ? 1.15 : 1);
  }
  get spd() {
    return this.phase >= 3 ? 1.3 : this.phase === 2 ? 1.15 : 1;
  }
  /** Floor level the player stands on. */
  get floorY() {
    return this.y;
  }
  /** Where the soles rest (on the dais). */
  get baseY() {
    return this.y - IMAGE_DAIS_H;
  }
  hurtbox() {
    return { x: this.x - 34, y: this.topY, w: 68, h: this.baseY - this.topY };
  }
  get cy() {
    return (this.topY + this.baseY) / 2;
  }
  /** Rig space to world. */
  wx(rx: number) {
    return this.x + this.face * this.turnSq * rx;
  }
  wy(ry: number) {
    return this.baseY - FOOT_H + ry;
  }

  // ------------------------------------------------------------ lifecycle
  updateDormant(_dt: number) {
    this.tgt = SP.dormant;
    this.eyes = approach(this.eyes, 0.08, _dt);
  }

  updateIntro(dt: number) {
    const t = this.st;
    this.camF.x = this.x + this.face * 40;
    this.camF.y = this.y - 92;
    G.camera.focus = this.camF;
    if (t < 0.6) {
      this.tgt = SP.dormant;
      G.camera.addTrauma(dt * 0.4);
    } else if (this.introT === 0) {
      this.introT = 1;
      // The eyes light.
      sfx('goldGong', { vol: 0.9, pitch: 0.8 });
      sfx('beamCharge', { vol: 0.5, pitch: 0.6 });
      fx.flash('#ffcf6b', 0.25);
    } else if (t < 1.8) {
      this.eyes = clamp((t - 0.6) / 0.7, 0, 1);
      if (Math.random() < dt * 30) fx.spawn(PK.Dust, this.x + rand(-30, 30), this.wy(-rand(20, 120)), rand(-10, 10), 30, 1, 2, 5, '#a08a60', 120, 1);
    } else if (this.introT === 1) {
      this.introT = 2;
      // It lifts its head and raises its fists.
      this.tgt = SP.awake;
      this.rate = 2.4;
      sfx('stoneCrack', { vol: 0.8, pitch: 0.7 });
      sfx('rumble', { vol: 0.7 });
      G.camera.addTrauma(0.5 * shakeScale());
    } else if (t > 2.9 && this.introT === 2) {
      this.introT = 3;
      this.tgt = SP.summon;
      this.rate = 6;
      sfx('colossusStep', { vol: 1 });
      sfx('bossRoar', { pitch: 0.55, vol: 0.7 });
      G.camera.addTrauma(0.8 * shakeScale());
      fx.ring(this.x, this.wy(-120), 12, 300, '#ffcf6b', 0.9, 6);
      fx.ring(this.x, this.floorY - 2, 10, 200, '#ffe6a8', 0.6, 4, 0.25);
      fx.dust(this.x, this.floorY, 30, 3);
      G.ui.banner('THE IMAGE OF GOLD', this.sub, 'boss');
    } else if (t > 4.3 && this.introT === 3) {
      this.introT = 4;
      this.tgt = SP.rest;
      this.rate = 4;
    } else if (t > 4.9) {
      this.beginFight();
      this.cd = 1.4;
      G.world.after(3, () => {
        if (!this.feetTold && this.fighting) G.ui.hint('"His feet part of iron and part of clay." Daniel 2:33 (KJV). Strike the feet.');
      });
      G.world.after(10, () => G.ui.hint(null));
    }
  }

  updateKneel(dt: number) {
    this.tgt = SP.kneel;
    this.rate = 3;
    this.placeFeet(dt, 28, -30, 90);
    if (Math.random() < dt * 16) fx.spawn(PK.Ember, this.x + rand(-34, 34), this.wy(-rand(10, 90)), 0, -40, 1, 1.5, 0.2, '#ffcf6b');
  }

  onKneel() {
    this.atk = null;
    this.beamOn = 0;
    this.breathOn = 0;
    this.turnSq = 1;
    this.footL[0] = this.footL[1] = 0;
    sfx('colossusStep', { vol: 1, pitch: 0.8 });
    sfx('stoneCrack', { vol: 0.7 });
    G.ui.toast('The Image falls to one knee. Execute it!', 'good');
  }

  recover() {
    super.recover();
    this.tgt = SP.rest;
    sfx('stoneCrack', { pitch: 1.3, vol: 0.6 });
    sfx('goldGong', { pitch: 1.2, vol: 0.4 });
  }

  takeHit(h: HitInfo): boolean {
    // Blows that land on the feet, iron mixed with clay, bite deeper.
    if (!h.dot && this.fighting && this.state !== 'kneel' && this.invuln <= 0 && !this.dying && h.py !== undefined && h.py > this.baseY - FEET_ZONE) {
      const mul = this.phase >= 3 ? 2.0 : 1.6;
      h = { ...h, dmg: h.dmg * mul, poise: h.poise * 1.25 };
      this.crFeet = Math.min(1, this.crFeet + 0.012);
      this.feetFlash = 0.22;
      const px = h.px ?? this.x;
      for (let i = 0; i < 5; i++) fx.spawn(PK.Shard, px + rand(-4, 4), this.baseY - rand(2, 10), rand(-90, 90), rand(-160, -60), rand(0.4, 0.8), rand(1.2, 2.4), 0.8, i % 2 ? MET.clay.c : MET.clay.hi, 700, 0.5);
      fx.dust(px, this.baseY, 2, 0.8, '#a06a48');
      sfx('stoneCrack', { vol: 0.35, pitch: rand(1.4, 1.7), gap: 150 });
      if (!this.feetTold) {
        this.feetTold = true;
        G.ui.hint(null);
        fx.number(px, this.baseY - 40, 'THE FEET CRUMBLE', false, MET.clay.hi);
      }
    }
    return super.takeHit(h);
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const dx = p.x - this.x;
    const dist = Math.abs(dx);
    this.summonCd -= dt;
    this.feetT = dist < 80 ? this.feetT + dt : Math.max(0, this.feetT - dt * 2);
    if (this.phase >= 3) this.fireRain(dt, p.x);
    if (this.state === 'idle') {
      this.tgt = SP.rest;
      this.rate = 3;
      this.placeFeet(dt, STANCE, -STANCE, 70);
      // A slow thing to turn: a moment behind it is a moment to strike.
      const behind = sign(dx) !== this.face && dist > 36;
      if (behind) {
        this.turnT += dt;
        if (this.turnT > 0.75 / this.spd) {
          this.turnT = 0;
          if (dist < 80 && Math.random() < 0.5) this.start('stomp');
          else this.start('turn');
          return;
        }
      } else this.turnT = 0;
      this.cd -= dt * this.spd;
      if (this.cd <= 0 && !behind) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, p.x);
  }

  private adds() {
    let n = 0;
    for (const e of G.world.ents) if (e instanceof Enemy && !e.dying) n++;
    return n;
  }

  private choose(dist: number) {
    if (this.phase >= 2 && this.summonCd <= 0 && this.adds() < 2 && Math.random() < 0.5) return this.start('summon');
    let pool: IAtk[];
    // Camping at the feet earns more stomps the longer it lasts.
    if (dist < 85 && this.feetT > 2.5 && Math.random() < Math.min(0.75, this.feetT * 0.12)) return this.start('stomp');
    if (dist < 85) pool = ['stomp', 'stomp', 'sweep', 'slam'];
    else if (dist < 220) pool = ['slam', 'sweep', 'breath', 'gaze', 'slam', 'sweep'];
    else pool = ['gaze', 'slam', 'step', 'gaze', 'breath', 'step'];
    if (this.phase >= 3 && dist >= 85) pool.push('breath');
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.65) a = choose(pool);
    if (a === 'step' && !this.canStep()) a = 'gaze';
    this.start(a);
  }

  private canStep() {
    const nx = this.x + this.face * STANCE * 2;
    return Math.abs(nx - this.homeX) < 150;
  }

  private start(a: IAtk) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.struck = false;
    this.tickT = 0;
    this.hitSet.clear();
    if (a === 'step') this.beginStep();
    if (a === 'stomp') {
      this.placeMarkers(this.phase >= 2 ? 5 : 3);
      this.feetT = 0;
    }
    if (a === 'gaze') sfx('beamCharge', { pan: G.world.pan(this.x), vol: 0.7, pitch: 0.7 });
    if (a === 'breath') sfx('furnaceBlast', { pan: G.world.pan(this.x), vol: 0.35, pitch: 0.6 });
    if (a === 'summon') sfx('goldGong', { pan: G.world.pan(this.x), vol: 0.9 });
    if (a === 'slam' || a === 'sweep') sfx('stoneCrack', { pan: G.world.pan(this.x), vol: 0.35, pitch: 0.6 });
  }

  private endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.beamOn = 0;
    this.breathOn = 0;
    this.turnSq = 1;
    this.eyeCharge = 0;
    this.cd = (cd * 0.72 + rand(0, 0.3)) / this.spd;
  }

  private hit(x: number, y: number, w: number, h: number, mul: number, extra: Partial<HitInfo> = {}) {
    const p = G.world.player;
    const dir = sign(p.x - this.x) || this.face;
    return G.world.hitPlayerSide({ x, y, w, h }, { dmg: this.dmg * mul, poise: 40, kx: dir * 240, ky: -220, dir, kind: 'melee', src: this, parryable: false, ...extra }, this.hitSet);
  }

  /** A footfall: dust, a shake, and a crush under the foot. */
  private footfall(fx0: number, vol: number, crush: number) {
    sfx('colossusStep', { pan: G.world.pan(fx0), vol });
    G.camera.addTrauma(0.32 * vol * shakeScale());
    fx.dust(fx0, this.baseY, 10, 1.6, '#9a8a6a');
    fx.ring(fx0, this.baseY - 1, 4, 40, '#e8d8a8', 0.3, 2, 0.25);
    if (crush > 0) {
      this.hitSet.clear();
      this.hit(fx0 - 18, this.floorY - 22, 36, 22, crush, { unblockable: true, ky: -260, poise: 30 });
    }
  }

  private runAttack(dt: number, px: number) {
    const t = this.st;
    const sp = this.spd;
    const f = this.face;
    const W = G.world;
    if (this.atk !== 'step' && this.atk !== 'turn' && this.atk !== 'stomp') this.placeFeet(dt, STANCE, -STANCE, 70);
    switch (this.atk) {
      case 'slam': {
        // Fist raised high (the tell), then down; shockwaves run both ways.
        const n = this.phase >= 2 ? 2 : 1;
        const tel = (this.step === 0 ? 0.95 : 0.62) / sp;
        if (t < tel) {
          this.tgt = SP.slamUp;
          this.rate = 5;
          this.markX = clamp(this.x + f * 64, 24, W.grid.w * 16 - 24);
        } else if (!this.struck) {
          this.struck = true;
          this.tgt = SP.slamDown;
          this.rate = 24;
          const x = this.markX, fy = this.floorY;
          sfx('bossSlam', { pan: W.pan(x), pitch: 0.75 });
          sfx('colossusStep', { pan: W.pan(x), vol: 0.6 });
          G.camera.addTrauma(0.6 * shakeScale());
          fx.dust(x, fy, 22, 2.4, '#9a8a6a');
          fx.ring(x, fy - 2, 8, 100, '#ffcf6b', 0.45, 4, 0.25);
          fx.shards(x, fy - 4, 10, MET.silver.c, 1.2);
          fx.flash('#fff3d0', 0.12);
          this.hitSet.clear();
          this.hit(x - 38, fy - 46, 76, 46, 1.3, { poise: 60, ky: -300 });
          const v = this.phase >= 3 ? 300 : 250;
          W.add(new Proj('wave', x + 18, fy, 'enemy', this.dmg * 0.55, { vx: v, life: 1.9, w: 16, h: 28, color: '#ffcf6b', big: true }));
          W.add(new Proj('wave', x - 18, fy, 'enemy', this.dmg * 0.55, { vx: -v, life: 1.9, w: 16, h: 28, color: '#ffcf6b', big: true }));
        } else if (t > tel + 0.6 / sp) {
          if (this.step + 1 < n) {
            this.step++;
            this.st = 0;
            this.struck = false;
          } else this.endAttack(1.3);
        }
        break;
      }
      case 'sweep': {
        // Arm drawn back low, then a sweep along the floor: jump it.
        const tel = 0.9 / sp, act = 0.34;
        if (t < tel) {
          this.tgt = SP.sweepBack;
          this.rate = 4;
        } else if (t < tel + act) {
          this.tgt = SP.sweepThrough;
          this.rate = 10;
          const u = easeOutCubic((t - tel) / act);
          const x0 = this.x + f * 8, x1 = this.x + f * (10 + 250 * u);
          if (!this.struck) {
            this.struck = true;
            this.hitSet.clear();
            sfx('bossSweep', { pan: W.pan(this.x), pitch: 0.7 });
            sfx('swingHeavy', { pan: W.pan(this.x), pitch: 0.5 });
          }
          this.hit(Math.min(x0, x1), this.floorY - 24, Math.abs(x1 - x0), 24, 1.0, { unblockable: true, kx: f * 280, ky: -240, poise: 50 });
          if (Math.random() < dt * 50) fx.spawn(PK.Dust, x1 + rand(-6, 6), this.floorY - 2, f * rand(40, 120), rand(-40, -10), 0.5, 3, 9, '#9a8a6a', -10, 2);
        } else if (t > tel + act + 0.65 / sp) this.endAttack(1.2);
        break;
      }
      case 'gaze': {
        // The eyes gather light, then burn a line along the floor.
        const tel = 0.85 / sp;
        const dur = this.phase >= 2 ? 2.0 : 1.35;
        if (t < tel) {
          this.tgt = SP.gaze;
          this.rate = 4;
          this.eyeCharge = t / tel;
          this.beamX0 = this.x + f * 34;
          this.beamX = this.beamX0;
        } else if (t < tel + dur) {
          if (this.beamOn === 0) {
            this.beamOn = 1;
            sfx('beam', { pan: W.pan(this.x), vol: 0.8, pitch: 0.8 });
          }
          this.eyeCharge = 1;
          const v = (t - tel) / dur;
          const far = 300;
          let d: number;
          if (this.phase >= 2) d = v < 0.6 ? easeInOutSine(v / 0.6) * far : far - easeInOutSine((v - 0.6) / 0.4) * (far - 50);
          else d = easeInOutSine(v) * far;
          this.beamX = clamp(this.beamX0 + f * d, 16, W.grid.w * 16 - 16);
          // The head follows the line it burns.
          Object.assign(this.cp, SP.gaze);
          this.cp.head = 0.55 - (d / far) * 0.45;
          this.cp.lean = 0.2 - (d / far) * 0.12;
          this.tgt = this.cp;
          this.rate = 8;
          this.tickT -= dt;
          if (this.tickT <= 0) {
            this.tickT = 0.12;
            this.hitSet.clear();
            this.hit(this.beamX - 10, this.floorY - 34, 20, 34, 0.32, { unblockable: true, kx: sign(px - this.beamX || 1) * 140, ky: -200, poise: 25 });
          }
          if (Math.random() < dt * 60) fx.spawn(PK.Spark, this.beamX + rand(-4, 4), this.floorY - 2, rand(-80, 80), rand(-200, -60), 0.35, 1.5, 0.3, '#ffe6a8', 500, 1);
          if (this.phase >= 3 && Math.random() < dt * 4) W.add(new Proj('puddle', this.beamX, this.floorY, 'enemy', this.dmg * 0.12, { life: 1.8, w: 22, h: 8, color: '#ff7a2a' }));
        } else {
          this.beamOn = 0;
          this.eyeCharge = approach(this.eyeCharge, 0, dt * 3);
          if (t > tel + dur + 0.45) this.endAttack(1.1);
        }
        break;
      }
      case 'breath': {
        // The furnace door glows white, then a cone of fire from the belly.
        const tel = 0.95 / sp;
        const dur = this.phase >= 3 ? 1.6 : 1.2;
        if (t < tel) {
          this.tgt = SP.breath;
          this.rate = 4;
          this.furnace = Math.max(this.furnace, t / tel);
          if (Math.random() < dt * 30) fx.spawn(PK.Ember, this.bellyX + rand(-6, 6), this.bellyY + rand(-6, 6), f * rand(20, 80), rand(-60, 0), 0.5, 1.4, 0.2, '#ffb347', 60, 1);
        } else if (t < tel + dur) {
          if (this.breathOn === 0) {
            this.breathOn = 1;
            sfx('furnaceBlast', { pan: W.pan(this.x), vol: 1 });
            G.camera.addTrauma(0.3 * shakeScale());
          }
          this.furnace = 1;
          const L = this.phase >= 3 ? 240 : 200;
          const a = 0.34;
          const ca = Math.cos(a) * f, sa = Math.sin(a);
          const n = G.renderer.tier >= 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const k = rand(0.05, 1);
            const sprd = rand(-0.28, 0.28);
            const sp2 = rand(260, 380);
            fx.spawn(PK.Flame, this.bellyX + ca * 6, this.bellyY + sa * 6, Math.cos(a + sprd) * f * sp2, Math.sin(a + sprd) * sp2, (L / sp2) * k + 0.1, rand(5, 8), rand(12, 18), i % 2 ? '#ff7a2a' : '#ffcf6b', -40, 0.6);
          }
          this.tickT -= dt;
          if (this.tickT <= 0) {
            this.tickT = 0.18;
            this.hitSet.clear();
            for (const u of CONE_U) {
              const cx = this.bellyX + ca * L * u, cy = this.bellyY + sa * L * u;
              const r = 8 + 26 * u;
              if (this.hit(cx - r, cy - r, r * 2, r * 2, 0.3, { unblockable: true, kx: f * 160, ky: -120, poise: 16 })) break;
            }
          }
          this.sfxT -= dt;
          if (this.sfxT <= 0) {
            this.sfxT = 0.3;
            sfx('flame', { pan: W.pan(this.x), vol: 0.5, pitch: 0.7 });
          }
        } else {
          this.breathOn = 0;
          if (t > tel + dur + 0.6 / sp) this.endAttack(1.3);
        }
        break;
      }
      case 'stomp': {
        // The front foot rises (the tell), comes down, and the sky falls in pieces.
        const tel = 0.8 / sp;
        if (t < tel) {
          this.tgt = SP.stompUp;
          this.rate = 4;
          this.footL[0] = approach(this.footL[0], 38, dt * 110);
          this.footL[1] = approach(this.footL[1], 0, dt * 60);
        } else if (!this.struck) {
          this.struck = true;
          this.tgt = SP.stompDown;
          this.rate = 16;
          this.footL[0] = 0;
          const fx0 = this.footX[0];
          sfx('colossusStep', { pan: W.pan(fx0), vol: 1 });
          sfx('bossStomp', { pan: W.pan(fx0), pitch: 0.7 });
          G.camera.addTrauma(0.75 * shakeScale());
          fx.dust(fx0, this.baseY, 24, 2.6, '#9a8a6a');
          fx.ring(fx0, this.floorY - 2, 8, 120, '#e8d8a8', 0.5, 4, 0.22);
          this.hitSet.clear();
          this.hit(this.x - 82, this.floorY - 28, 164, 28, 0.9, { unblockable: true, ky: -330, poise: 50 });
          for (const m of this.markers) {
            if (m.kind !== 0 || m.p) continue;
            m.p = new Proj('debris', m.x, this.floorY - 240 - rand(0, 50), 'enemy', this.dmg * 0.62, { vy: 60, w: 14, h: 12, life: 3.2 });
            W.add(m.p);
          }
        } else if (t > tel + 0.8 / sp) this.endAttack(1.2);
        break;
      }
      case 'summon': {
        // Arms raised, the gong: lions and priests answer from the plain.
        const tel = 1.0;
        this.tgt = SP.summon;
        this.rate = 5;
        if (t < tel) {
          if (Math.random() < dt * 20) fx.spawn(PK.Ember, this.x + rand(-40, 40), this.wy(-rand(60, 130)), 0, -50, 0.8, 1.6, 0.2, '#ffcf6b', -10, 1);
        } else if (!this.struck) {
          this.struck = true;
          sfx('fireBurst', { vol: 0.9 });
          fx.ring(this.x, this.wy(-120), 10, 220, '#ffcf6b', 0.6, 4);
          G.camera.addTrauma(0.3 * shakeScale());
          const n = Math.max(1, (this.phase >= 3 ? 3 : 2) - this.adds());
          const p = W.player;
          for (let i = 0; i < n; i++) {
            const kind: EnemyKind = (i + this.phase) % 2 ? 'priest' : 'lion';
            const side = i % 2 ? 1 : -1;
            const x = clamp(p.x + side * rand(80, 140), 60, this.homeX - 120);
            const e = W.spawnEnemy(kind, x, this.floorY);
            e.attackCd = 1.2;
            fx.column(x, this.floorY, 26, 120, '#ff9a3a', 0.7);
            fx.embers(x, this.floorY - 20, 14, '#ffb347', 12);
          }
        } else if (t > tel + 0.7) {
          this.summonCd = 24;
          this.endAttack(1.0);
        }
        break;
      }
      case 'step': {
        // One ponderous stride: the back foot swings past the front.
        const D = 0.95 / sp;
        const u = clamp(t / D, 0, 1);
        const e = easeInOutSine(u);
        this.tgt = SP.stepA;
        this.rate = 4;
        this.footX[1] = lerp(this.stepFrom, this.stepTo, e);
        this.footL[1] = Math.sin(u * Math.PI) * 18;
        this.x = lerp(this.bodyFrom, this.bodyTo, e);
        if (u >= 1) {
          this.footL[1] = 0;
          this.footfall(this.stepTo, 0.8, 0.6);
          // The moved foot leads now.
          const a = this.footX[0];
          this.footX[0] = this.footX[1];
          this.footX[1] = a;
          this.step++;
          const dist = Math.abs(px - this.x);
          if (this.step < 2 && dist > 260 && this.canStep()) {
            this.st = 0;
            this.beginStep();
          } else this.endAttack(0.7);
        }
        break;
      }
      case 'turn': {
        // Pivot on the spot: the silhouette narrows, the face flips, a footfall.
        const D = 0.75 / sp;
        const u = clamp(t / D, 0, 1);
        this.tgt = u < 0.5 ? SP.turnA : SP.turnB;
        this.rate = 7;
        // The silhouette narrows only partly; the arms swinging through sell the turn.
        this.turnSq = 0.5 + 0.5 * Math.abs(Math.cos(u * Math.PI));
        this.footL[0] = Math.sin(u * Math.PI) * 12;
        if (u >= 0.5 && this.step === 0) {
          this.step = 1;
          this.face = -this.face;
          const a = this.footX[0];
          this.footX[0] = this.footX[1];
          this.footX[1] = a;
          this.footL[1] = this.footL[0];
          this.footL[0] = 0;
        }
        if (this.step === 1) {
          this.footL[1] = Math.sin(u * Math.PI) * 12;
          this.footL[0] = 0;
        }
        if (u >= 1) {
          this.turnSq = 1;
          this.footL[1] = 0;
          this.footfall(this.footX[1], 0.6, 0);
          this.endAttack(0.45);
        }
        break;
      }
    }
  }

  private beginStep() {
    const f = this.face;
    this.stepFrom = this.footX[1];
    this.stepTo = this.footX[0] + f * STANCE * 2;
    this.bodyFrom = this.x;
    this.bodyTo = (this.footX[0] + this.stepTo) / 2;
  }

  /** Feet drift toward their marks (front, back offsets in facing space) with a lift while they travel. */
  private placeFeet(dt: number, front: number, back: number, speed: number) {
    const f = this.face;
    for (let i = 0; i < 2; i++) {
      const tx = this.x + f * (i ? back : front);
      const d = tx - this.footX[i];
      this.footX[i] = approach(this.footX[i], tx, speed * dt);
      this.footL[i] = approach(this.footL[i], Math.min(10, Math.abs(d) * 0.5), 80 * dt);
    }
  }

  private placeMarkers(n: number) {
    const p = G.world.player;
    const W = G.world.grid.w * 16;
    for (let i = 0; i < n; i++) {
      const x = clamp(p.x + (i - (n - 1) / 2) * rand(46, 64) + rand(-12, 12), 30, W - 30);
      this.markers.push({ x, t: 0, p: null, kind: 0 });
    }
  }

  /** Phase 3: molten drops rain on the arena from the furnace's heat. */
  private fireRain(dt: number, px: number) {
    this.rainT -= dt;
    if (this.rainT > 0) return;
    this.rainT = rand(1.8, 2.6);
    const W = G.world;
    for (let i = 0; i < 2; i++) {
      const x = clamp(px + rand(-120, 120), 30, W.grid.w * 16 - 30);
      const pr = new Proj('drop', x, this.floorY - 250, 'enemy', this.dmg * 0.4, { life: 3 });
      W.add(pr);
      this.markers.push({ x, t: 0, p: pr, kind: 1 });
    }
  }

  // ------------------------------------------------------------ phases
  beginTransition() {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.beamOn = 0;
    this.breathOn = 0;
    this.turnSq = 1;
    this.phase = 2;
    this.maxPoise = this.poise = 760;
    this.introT = 0;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.5, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    this.camF.x = this.x;
    this.camF.y = this.y - 90;
    G.camera.focus = this.camF;
    this.placeFeet(dt, STANCE, -STANCE, 70);
    if (t < 1.1) {
      // The silver arms split.
      this.tgt = SP.recoil;
      this.rate = 3;
      this.crArm = Math.max(this.crArm, Math.min(0.7, t * 0.8));
      if (this.introT === 0) {
        this.introT = 1;
        sfx('stoneCrack', { vol: 1, pitch: 0.9 });
        sfx('shatter', { vol: 0.5, pitch: 0.7 });
        fx.flash('#ffffff', 0.3);
      }
      if (Math.random() < dt * 40) {
        const j = this.j;
        const u = Math.random();
        const ax = lerp(j.shFX, j.haFX, u), ay = lerp(j.shFY, j.haFY, u);
        fx.spawn(PK.Spark, this.wx(ax), this.wy(ay), rand(-80, 80), rand(-120, 0), 0.4, 1.6, 0.3, '#e8c8ff', 300, 1);
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      this.tgt = SP.summon;
      this.rate = 7;
      sfx('goldGong', { vol: 1, pitch: 0.7 });
      sfx('bossRoar', { pitch: 0.5, vol: 0.6 });
      fx.ring(this.x, this.wy(-110), 10, 300, '#e8c8ff', 0.8, 6);
      fx.flash('#ffe6a8', 0.3);
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.caption('Light bleeds from the cracks in its silver arms. It moves faster now.');
    } else if (t > 3.0) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.6;
      this.summonCd = 2;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      G.ui.caption(null);
    }
  }

  enterPhase3() {
    this.phase = 3;
    this.maxPoise = Math.max(this.maxPoise, 800);
    this.crFeet = Math.max(this.crFeet, 0.65);
    this.rainT = 2;
    sfx('furnaceBlast', { vol: 1, pitch: 0.8 });
    sfx('stoneCrack', { vol: 0.9, pitch: 0.8 });
    fx.flash('#ff7a2a', 0.3);
    G.camera.addTrauma(0.5 * shakeScale());
    fx.embers(this.bellyX, this.bellyY, 30, '#ffb347', 20);
    G.ui.toast('The furnace in its belly roars, and its clay feet are cracking!', 'warn');
  }

  die() {
    super.die();
    this.atk = null;
    this.beamOn = 0;
    this.breathOn = 0;
    this.turnSq = 1;
    this.footL[0] = this.footL[1] = 0;
    this.markers.length = 0;
    this.introT = 0;
  }

  /** Straight to the beaten, kneeling state (a reload after the fight). */
  yieldNow() {
    this.state = 'dead';
    this.dying = true;
    this.yielded = true;
    this.phase = 3;
    this.introT = 9;
    this.st = 9;
    this.invuln = 999;
    this.eyes = 0.3;
    this.crArm = this.crBody = this.crFeet = this.crHead = 1;
    Object.assign(this.pose, SP.dead);
    this.tgt = SP.dead;
    this.footX[0] = this.x + this.face * 28;
    this.footX[1] = this.x - this.face * 30;
    this.footL[0] = this.footL[1] = 0;
    this.animate(0);
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    if (this.shatterT >= 0) {
      this.updateShatter(dt);
      return;
    }
    this.beamOn = 0;
    this.breathOn = 0;
    if (!this.yielded) {
      this.camF.x = this.x;
      this.camF.y = this.y - 88;
      G.camera.focus = this.camF;
    }
    this.crArm = approach(this.crArm, 1, dt * 0.8);
    this.crBody = approach(this.crBody, 1, dt * 0.8);
    this.crHead = approach(this.crHead, 1, dt * 0.8);
    this.crFeet = approach(this.crFeet, 1, dt * 0.8);
    if (t < 1.4) {
      this.tgt = SP.recoil;
      this.rate = 5;
      this.placeFeet(dt, STANCE, -STANCE, 70);
      if (this.introT === 0 && t > 0.1) {
        this.introT = 1;
        sfx('stoneCrack', { vol: 1, pitch: 0.75 });
      }
      if (Math.random() < dt * 30) fx.hitSparks(this.x + rand(-26, 26), this.wy(-rand(10, 120)), rand(-1, 1), '#ffe6a8', 4, 1);
    } else if (this.introT === 1) {
      this.introT = 2;
      this.tgt = SP.dead;
      this.rate = 2.6;
      sfx('stoneCrack', { vol: 1, pitch: 0.6 });
    } else if (this.introT === 2 || this.introT === 3) {
      this.placeFeet(dt, 28, -30, 80);
      this.eyes = approach(this.eyes, 0.3, dt * 0.5);
      if (this.introT === 2 && t > 2.2) {
        this.introT = 3;
        sfx('colossusStep', { vol: 1, pitch: 0.7 });
        G.camera.addTrauma(0.6 * shakeScale());
        fx.dust(this.x, this.baseY, 30, 2.6, '#9a8a6a');
      }
      if (t > 3.4 && !this.yielded) {
        this.yielded = true;
        this.introT = 9;
        G.camera.focus = null;
        G.world.onBossDefeated(this);
      }
    }
  }

  // ------------------------------------------------------------ the stone and the shattering
  /**
   * The climax: a stone falls from the sky onto the feet, the clay breaks, and
   * the whole Image comes apart top to bottom and blows away like chaff.
   * Resolves after about 4.8 s; only the stone is left.
   */
  shatter(): Promise<void> {
    if (this.shatterT >= 0 || this.broken) return Promise.resolve();
    if (!this.dying) this.yieldNow();
    this.shatterT = 0;
    this.stoneOn = true;
    this.stoneX = this.footX[0] + this.face * 30;
    this.stoneY = this.baseY - 300;
    sfx('stoneFall', { vol: 1 });
    sfx('whoosh', { vol: 0.6, pitch: 0.5 });
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.shatterDone = finish;
      // Never leave the story waiting (a room change mid-climax).
      setTimeout(finish, 8000);
    });
  }

  private updateShatter(dt: number) {
    const t = (this.shatterT += dt);
    const W = G.world;
    this.camF.x = this.x - this.face * 20;
    this.camF.y = this.y - 80;
    G.camera.focus = this.camF;
    const fall = 1.0;
    const hitX = this.footX[0], hitY = this.baseY - 9;
    if (t < fall) {
      // Falling: faster and faster, at a slant, onto the feet.
      const u = easeInQuad(t / fall);
      const x0 = hitX + this.face * 60;
      this.stoneX = lerp(x0, hitX, u);
      this.stoneY = lerp(this.baseY - 320, hitY, u);
      this.stoneR += dt * 2;
      if (Math.random() < dt * 40) fx.spawn(PK.Mote, this.stoneX + rand(-6, 6), this.stoneY + rand(-6, 6), 0, -30, 0.5, 8, 2, '#fff3d0');
      this.eyes = approach(this.eyes, 0.6, dt);
    } else if (this.introT !== 10) {
      // It strikes the feet of iron and clay.
      this.introT = 10;
      this.stoneX = hitX;
      this.stoneY = hitY;
      sfx('stoneCrack', { vol: 1, pitch: 0.55 });
      sfx('bossSlam', { vol: 0.9, pitch: 0.6 });
      fx.flash('#ffffff', 0.85);
      G.camera.addTrauma(1 * shakeScale());
      fx.ring(hitX, this.baseY - 2, 10, 220, '#fff3d0', 0.7, 6, 0.3);
      fx.dust(hitX, this.baseY, 30, 3, '#a07a58');
      for (let i = 0; i < 2; i++) fx.shards(this.footX[i], this.baseY - 4, 16, i ? MET.clay.c : MET.clay.hi, 1.6);
      this.crFeet = 1;
      W.slowmo(0.4, 0.4);
    } else if (t < 1.7) {
      // The feet are gone: it sags, and light pours from every crack.
      this.sink = approach(this.sink, 10, dt * 30);
      this.eyes = approach(this.eyes, 1, dt * 2);
      if (Math.random() < dt * 30) fx.hitSparks(this.x + rand(-30, 30), this.wy(-rand(10, 120)), rand(-1, 1), '#fff3d0', 3, 0.8);
    } else if (!this.broken) {
      this.broken = true;
      this.breakApart();
      sfx('shatterGold', { vol: 1 });
      sfx('shatter', { vol: 0.8, pitch: 0.6 });
      fx.flash('#fff3d0', 0.7);
      G.camera.addTrauma(0.7 * shakeScale());
    }
    if (this.broken) this.updateChunks(dt, t - 1.7);
    if (t > 4.8 && this.shatterDone) {
      const d = this.shatterDone;
      this.shatterDone = null;
      d();
    }
  }

  /** The statue becomes pieces of its five metals, in place. */
  private breakApart() {
    const j = this.j;
    const out = this.chunks;
    const add = (rx: number, ry: number, m: Metal, s: number) => {
      const n = 4 + ((out.length * 5) % 3);
      const verts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
        const r = s * rand(0.65, 1.1);
        verts[i * 2] = Math.cos(a) * r;
        verts[i * 2 + 1] = Math.sin(a) * r;
      }
      out.push({ x: this.wx(rx), y: this.wy(ry) + this.sink, vx: 0, vy: 0, rot: rand(0, 6), vr: 0, s, m, verts, at: 0, age: 0, life: rand(1.7, 2.5), out: false });
    };
    const seg = (ax: number, ay: number, bx: number, by: number, n: number, m: Metal, s: number) => {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        add(lerp(ax, bx, u) + rand(-2, 2), lerp(ay, by, u) + rand(-2, 2), m, s);
      }
    };
    // Torso-frame points to rig space.
    const ca = Math.cos(j.torsoA), sa = Math.sin(j.torsoA);
    const tor = (x: number, y: number, m: Metal, s: number) => add(j.hipX + x * ca - y * sa, j.hipY + x * sa + y * ca, m, s);
    for (let i = 0; i < 9; i++) add(j.headX + rand(-9, 9), j.headY + rand(-22, 14), 'gold', rand(4.5, 7));
    for (let i = 0; i < 12; i++) tor(rand(-21, 21), rand(-49, -22), 'silver', rand(5, 8));
    seg(j.shFX, j.shFY, j.elFX, j.elFY, 3, 'silver', 6);
    seg(j.elFX, j.elFY, j.haFX, j.haFY, 3, 'silver', 5.5);
    seg(j.shBX, j.shBY, j.elBX, j.elBY, 3, 'silver', 6);
    seg(j.elBX, j.elBY, j.haBX, j.haBY, 3, 'silver', 5.5);
    for (let i = 0; i < 10; i++) tor(rand(-17, 17), rand(-21, 4), 'brass', rand(5, 7.5));
    seg(j.hpFX, j.hpFY, j.knFX, j.knFY, 3, 'brass', 6.5);
    seg(j.hpBX, j.hpBY, j.knBX, j.knBY, 3, 'brass', 6.5);
    seg(j.knFX, j.knFY, j.ftFX, j.ftFY, 3, 'iron', 5.5);
    seg(j.knBX, j.knBY, j.ftBX, j.ftBY, 3, 'iron', 5.5);
    for (let i = 0; i < 2; i++) {
      const fx0 = i ? j.ftBX : j.ftFX;
      add(fx0 - 3, j.ftFY + 3, 'clay', 5);
      add(fx0 + 6, j.ftFY + 4, i ? 'iron' : 'clay', 4.5);
    }
    // Top to bottom: each piece lets go after the one above it.
    let top = Infinity, bot = -Infinity;
    for (const c of out) {
      top = Math.min(top, c.y);
      bot = Math.max(bot, c.y);
    }
    for (const c of out) c.at = ((c.y - top) / Math.max(1, bot - top)) * 1.05 + rand(0, 0.15);
  }

  private updateChunks(dt: number, t: number) {
    // The wind carries them away, that no place is found for them.
    const wind = -1;
    const tier = G.renderer.tier;
    for (const c of this.chunks) {
      if (c.out) continue;
      if (t < c.at) continue;
      if (c.age === 0) {
        c.vx = rand(-40, 40);
        c.vy = rand(-60, 10);
        c.vr = rand(-5, 5);
      }
      c.age += dt;
      const k = c.age;
      // A short tumble, then the gust takes it, lifting and scattering.
      c.vy += (k < 0.35 ? 420 : -140) * dt;
      c.vx += wind * (k < 0.25 ? 120 : rand(380, 520)) * dt;
      c.vx *= 1 - 0.4 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (k > 0.4 && Math.random() < dt * (tier >= 2 ? 14 : 6)) {
        fx.spawn(PK.Petal, c.x, c.y, c.vx * 0.6 + rand(-20, 20), c.vy * 0.5 + rand(-20, 20), rand(0.6, 1.2), rand(0.8, 1.6), 0.3, MET[c.m].hi, -30, 1);
      }
      if (k >= c.life) {
        c.out = true;
        if (tier >= 1) fx.spawn(PK.Dust, c.x, c.y, c.vx * 0.5, c.vy * 0.5, 0.8, 3, 9, shade(MET[c.m].c, 0.2), -20, 2);
      }
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    const k = Math.min(1, dt * this.rate);
    const P = this.pose, Tg = this.tgt, D = this.dp;
    for (const key of POSE_KEYS) {
      P[key] = lerp(P[key], Tg[key], k);
      D[key] = P[key];
    }
    // Stone does not breathe, but this does, slowly.
    if (this.state !== 'dormant' && !this.broken) {
      const b = Math.sin(G.time * 1.3);
      D.lean += b * 0.012;
      D.y += b * 0.5 + this.sink;
      D.fUA += Math.sin(G.time * 1.1) * 0.02;
    }
    const j = this.j;
    solve(D, DIMS, false, j);
    // Legs by IK so planted feet stay planted while the body moves.
    const f = this.face;
    for (let i = 0; i < 2; i++) {
      const front = i === 0;
      const hx = front ? j.hpFX : j.hpBX, hy = front ? j.hpFY : j.hpBY;
      const ax = (this.footX[i] - this.x) / f;
      const ay = -this.footL[i];
      const r = legIK(hx, hy, ax, ay, DIMS.thigh, DIMS.shin);
      if (front) {
        j.knFX = r[0]; j.knFY = r[1]; j.ftFX = r[2]; j.ftFY = r[3];
      } else {
        j.knBX = r[0]; j.knBY = r[1]; j.ftBX = r[2]; j.ftBY = r[3];
      }
    }
    // Hurtbox top and the points effects come from.
    const crown = j.headY - 32;
    this.topY = this.wy(Math.min(crown, j.haFY - 8, j.haBY - 8));
    const ca = Math.cos(j.torsoA), sa = Math.sin(j.torsoA);
    const bx = 6, by = -10;
    this.bellyX = this.wx(j.hipX + bx * ca - by * sa);
    this.bellyY = this.wy(j.hipY + bx * sa + by * ca);
    const ex = 4.8 * 1.3, ey = -3.3 * 1.3, ha = j.headA;
    this.eyeX = this.wx(j.headX + ex * Math.cos(ha) - ey * Math.sin(ha));
    this.eyeY = this.wy(j.headY + ex * Math.sin(ha) + ey * Math.cos(ha));
    // Damage shows as cracks.
    const lost = 1 - this.hp / this.maxHp;
    if (!this.dying) {
      this.crBody = approach(this.crBody, clamp(lost * 1.25 - 0.15, 0, 1), dt * 0.5);
      this.crHead = approach(this.crHead, clamp(lost * 1.4 - 0.45, 0, 1), dt * 0.5);
      if (this.phase >= 2) this.crArm = Math.max(this.crArm, clamp(0.55 + (lost - 0.4) * 1.2, 0, 1));
    }
    this.feetFlash = Math.max(0, this.feetFlash - dt);
    if (this.fighting) this.eyes = approach(this.eyes, 1, dt);
    const furnaceRest = this.phase >= 3 ? 0.75 + Math.sin(G.time * 5) * 0.12 : 0.12;
    if (this.atk !== 'breath') this.furnace = approach(this.furnace, furnaceRest, dt * 1.5);
    // Telegraph markers: drop them once their stone lands.
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      if ((m.p && (m.p.remove || m.p.stuck)) || m.t > 4 || (this.state !== 'attack' && !m.p && m.kind === 0)) this.markers.splice(i, 1);
    }
    if (this.phase >= 3 && this.fighting && Math.random() < dt * (G.renderer.tier >= 2 ? 10 : 4)) {
      // Fire everywhere: embers drift up from the furnace and the floor.
      fx.spawn(PK.Ember, this.bellyX + rand(-14, 14), this.bellyY + rand(-10, 10), rand(-30, 30), rand(-90, -40), 1, 1.6, 0.2, '#ffb347', -20, 0.5);
      fx.spawn(PK.Flame, this.x + rand(-160, 160), this.floorY - 2, 0, rand(-60, -30), 0.6, 3, 1, '#ff7a2a', -20, 1);
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const f = this.face;
    // Floor telegraphs, under everything.
    for (const m of this.markers) {
      if (m.p && m.p.stuck) continue;
      const u = m.p ? clamp((m.p.y - (this.floorY - 260)) / 260, 0, 1) : clamp(m.t / 0.8, 0, 1) * 0.4;
      this.floorMark(ctx, m.x, this.floorY, m.kind ? 14 : 18, u, m.kind ? '#ff7a2a' : '#ffcf6b');
    }
    if (this.atk === 'slam' && !this.struck && this.state === 'attack') this.floorMark(ctx, this.markX, this.floorY, 40, this.st / ((this.step === 0 ? 0.95 : 0.62) / this.spd), '#ffcf6b');
    if (this.atk === 'sweep' && this.state === 'attack' && this.st < 0.9 / this.spd) this.sweepWarn(ctx);
    if (this.atk === 'stomp' && this.state === 'attack' && !this.struck) this.floorMark(ctx, this.x, this.floorY, 80, this.st / (0.8 / this.spd), '#ff9a5a');

    if (!this.broken) {
      ctx.save();
      ctx.translate(this.x, this.wy(0) + this.sink);
      ctx.scale(f * this.turnSq, 1);
      this.drawStatue(ctx);
      ctx.restore();
    }
    if (this.broken) this.drawChunks(ctx);
    if (this.stoneOn) this.drawStone(ctx);

    // The gaze beam.
    if (this.beamOn > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ff9a3a';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(this.eyeX, this.eyeY);
      ctx.lineTo(this.beamX, this.floorY - 2);
      ctx.stroke();
      ctx.strokeStyle = '#fff6dc';
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      glow(ctx, this.beamX, this.floorY - 6, 34, '#ff9a3a', 0.9);
      glow(ctx, this.beamX, this.floorY - 4, 14, '#ffffff', 0.8);
      ctx.globalCompositeOperation = 'source-over';
    } else if (this.atk === 'gaze' && this.eyeCharge > 0.35 && this.state === 'attack') {
      // Aim line to where the burn will begin.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + this.eyeCharge * 0.35;
      ctx.strokeStyle = '#ff6a3a';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.eyeX, this.eyeY);
      ctx.lineTo(this.beamX0, this.floorY - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // The furnace cone: a core glow down its axis.
    if (this.breathOn > 0) {
      const L = this.phase >= 3 ? 240 : 200;
      const ca = Math.cos(0.34) * f, sa = Math.sin(0.34);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 5; i++) {
        const u = i / 5;
        const fl = 0.85 + Math.sin(G.time * 30 + i) * 0.15;
        glow(ctx, this.bellyX + ca * L * u * 0.9, this.bellyY + sa * L * u * 0.9, (10 + 30 * u) * fl, '#ff6a1a', 0.55);
      }
      glow(ctx, this.bellyX + ca * 8, this.bellyY + sa * 8, 22, '#fff3d0', 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Tells.
    if (this.state === 'attack') {
      const j = this.j;
      if (this.atk === 'slam' && !this.struck) {
        this.glint(ctx, this.wx(j.haFX), this.wy(j.haFY) + this.sink, '#ffe6a8', 1.2);
      } else if (this.atk === 'sweep' && this.st < 0.9 / this.spd) this.glint(ctx, this.wx(j.haFX), this.wy(j.haFY), '#ff9a5a', 1.2);
      else if (this.atk === 'gaze' && this.beamOn === 0 && this.eyeCharge > 0) this.glint(ctx, this.eyeX, this.eyeY, '#ffcf6b', 0.6 + this.eyeCharge * 0.8);
      else if (this.atk === 'breath' && this.breathOn === 0 && this.st < 0.95 / this.spd) this.glint(ctx, this.bellyX, this.bellyY, '#ff7a2a', 1.3);
      else if (this.atk === 'stomp' && !this.struck) this.glint(ctx, this.wx(j.ftFX), this.wy(j.ftFY), '#ff9a5a', 1.1);
    }
    if (this.flash > 0 && !this.broken) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.cy, 90, '#ffffff', this.flash * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.cy, 110, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private sweepWarn(ctx: Ctx) {
    const a = Math.min(1, this.st * 2) * (0.45 + Math.sin(G.time * 20) * 0.2);
    ctx.save();
    ctx.translate(this.x, this.floorY);
    ctx.scale(this.face, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    let g = gradCache.get('warnBand');
    if (!g) {
      g = ctx.createLinearGradient(0, 0, 260, 0);
      g.addColorStop(0, 'rgba(255,106,58,0.9)');
      g.addColorStop(1, 'rgba(255,106,58,0)');
      gradCache.set('warnBand', g);
    }
    ctx.fillStyle = g;
    ctx.fillRect(8, -16, 252, 14);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /** The whole Image, in rig space (facing +x, ankles on y = 0, soles at FOOT_H). */
  private drawStatue(ctx: Ctx) {
    const j = this.j;
    const shaded = shadeable(MET.gold.c);
    const fine = G.renderer.tier >= 2;
    const glowC = this.dying ? '#fff3d0' : this.phase >= 3 ? '#ffb060' : '#e8c8ff';
    // A king's cloak of Tyrian purple hangs from the shoulders behind the Image, bordered in gold.
    {
      const sw = Math.sin(G.time * 1.3) * 3;
      const top = Math.min(j.shBY, j.shFY) + 2, hem = Math.max(j.knFY, j.knBY) + 6;
      const cl = [j.shBX - 6, top, j.shFX - 2, top + 3, j.hipX - 4, j.hipY + 6, j.hipX - 10 + sw * 0.5, hem, j.hipX - 30 + sw, hem + 3, j.hipX - 42 + sw * 1.2, hem - 6, j.shBX - 22 + sw * 0.5, j.hipY - 4];
      poly(ctx, cl, '#3a1240', OUT, 1.2);
      ctx.strokeStyle = '#220a26';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const k of [0.3, 0.6]) { ctx.moveTo(j.shBX - 8 - k * 8, top + 8); ctx.lineTo(j.hipX - 14 - k * 24 + sw * k, hem); }
      ctx.stroke();
      ctx.strokeStyle = MET.gold.c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(j.hipX - 10 + sw * 0.5, hem); ctx.lineTo(j.hipX - 30 + sw, hem + 3); ctx.lineTo(j.hipX - 42 + sw * 1.2, hem - 6);
      ctx.stroke();
    }
    // Back arm and back leg sit in shadow.
    this.drawArm(ctx, j.shBX, j.shBY, j.elBX, j.elBY, j.haBX, j.haBY, true, shaded, fine, glowC);
    this.drawLeg(ctx, j.hpBX, j.hpBY, j.knBX, j.knBY, j.ftBX, j.ftBY, true, shaded, fine, glowC);
    this.drawLeg(ctx, j.hpFX, j.hpFY, j.knFX, j.knFY, j.ftFX, j.ftFY, false, shaded, fine, glowC);
    this.drawKilt(ctx, shaded, fine);
    this.drawTorso(ctx, shaded, fine, glowC);
    this.drawHead(ctx, shaded, fine, glowC);
    this.drawArm(ctx, j.shFX, j.shFY, j.elFX, j.elFY, j.haFX, j.haFY, false, shaded, fine, glowC);
  }

  /** A metal capsule with its sheen and (optionally) a crack, drawn in the limb's own frame. */
  private limb(ctx: Ctx, ax: number, ay: number, bx: number, by: number, ra: number, rb: number, m: Metal, dark: boolean, shaded: boolean, fine: boolean, crack: readonly number[] | null, amt: number, glowC: string, bands = 0) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 0.0001;
    const c = dx / len, s = dy / len;
    // Keep the lit edge toward the key light (up and forward).
    const flip = -s * 0.36 + c * -0.93 > 0;
    if (flip) ctx.transform(c, s, s, -c, ax, ay);
    else ctx.transform(c, s, -s, c, ax, ay);
    ctx.beginPath();
    capsulePath(ctx, 0, 0, len, 0, ra, rb);
    ctx.fillStyle = shaded ? metalGrad(ctx, m, Math.max(ra, rb), dark) : dark ? shade(MET[m].c, -0.38) : MET[m].c;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    if (fine && !dark && m !== 'clay') {
      // A polished streak along the lit side.
      ctx.beginPath();
      ctx.moveTo(len * 0.12, -ra * 0.55);
      ctx.lineTo(len * 0.86, -rb * 0.55);
      ctx.strokeStyle = MET[m].hi;
      ctx.globalAlpha = m === 'iron' ? 0.35 : 0.7;
      ctx.lineWidth = m === 'silver' ? 1.2 : 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (bands > 0) {
      // Iron hoops riveted round the shin.
      ctx.beginPath();
      for (let i = 1; i <= bands; i++) {
        const x = (len * i) / (bands + 1);
        const r = ra + (rb - ra) * (x / len);
        ctx.moveTo(x, -r);
        ctx.lineTo(x, r);
      }
      ctx.strokeStyle = dark ? '#0a0a0c' : MET.iron.line;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      if (!dark) {
        ctx.beginPath();
        for (let i = 1; i <= bands; i++) {
          const x = (len * i) / (bands + 1) - 1.1;
          const r = ra + (rb - ra) * (x / len);
          ctx.moveTo(x, -r * 0.85);
          ctx.lineTo(x, r * 0.2);
        }
        ctx.strokeStyle = MET.iron.hi;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
    if (crack && amt > 0.01) {
      const r = (ra + rb) / 2;
      ctx.beginPath();
      crackPath(ctx, crack, amt, len, r);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glowC;
      ctx.lineWidth = 0.65;
      ctx.globalAlpha = 0.6 + Math.min(1, amt) * 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (flip) ctx.transform(c, s, s, -c, -(c * ax + s * ay), -(s * ax - c * ay));
    else ctx.transform(c, -s, s, c, -(c * ax + s * ay), s * ax - c * ay);
  }

  private drawArm(ctx: Ctx, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, back: boolean, shaded: boolean, fine: boolean, glowC: string) {
    const cr = this.crArm;
    const sil = back ? shade(MET.silver.c, -0.38) : MET.silver.c;
    if (back) {
      // The far shoulder plate shows past the chest.
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.j.torsoA);
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 8.5, 0, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      ctx.fillStyle = shaded ? metalGrad(ctx, 'silver', 9, true) : sil;
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }
    this.limb(ctx, sx, sy, ex, ey, 8.6, 7, 'silver', back, shaded, fine, LIMB_CRACK, cr, glowC);
    this.limb(ctx, ex, ey, hx, hy, 7, 5.8, 'silver', back, shaded, fine, LIMB_CRACK2, cr * 1.1 - 0.1, glowC);
    // Elbow and fist.
    ellipse(ctx, ex, ey, 7, 7, 0, shaded ? metalGrad(ctx, 'silver', 7, back) : sil);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(ex, ey, 7, -Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.save();
    ctx.translate(hx, hy);
    const dx = hx - ex, dy = hy - ey;
    ctx.rotate(Math.atan2(dy, dx));
    // A clenched fist: a block of knuckles, the thumb folded over.
    poly(ctx, [-3.5, -7, 6, -7.4, 9.6, -3.5, 9.6, 4, 5.5, 7.4, -3.5, 6.8], shaded ? metalGrad(ctx, 'silver', 7.5, back) : sil, OUT, 1.1);
    ctx.strokeStyle = back ? '#20262e' : MET.silver.line;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(6.4, -6); ctx.lineTo(6.4, 6);
    ctx.moveTo(6.4, -2); ctx.lineTo(9.6, -2);
    ctx.moveTo(6.4, 2); ctx.lineTo(9.6, 2);
    ctx.moveTo(0, -7); ctx.quadraticCurveTo(3.5, -3, 6.4, -3.4);
    ctx.stroke();
    if (fine && !back) {
      ctx.strokeStyle = MET.silver.hi;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-2, -6.2);
      ctx.lineTo(5.6, -6.6);
      ctx.stroke();
    }
    ctx.restore();
    if (!back) {
      // Shoulder plate.
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.j.torsoA);
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 9.5, 0, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      ctx.fillStyle = shaded ? metalGrad(ctx, 'silver', 10, false) : sil;
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = MET.silver.hi;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8.6, 7, 0, Math.PI * 1.15, Math.PI * 1.75);
      ctx.stroke();
      ctx.strokeStyle = MET.silver.line;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-10.5, 1.5);
      ctx.lineTo(10.5, 1.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawLeg(ctx: Ctx, hx: number, hy: number, kx: number, ky: number, ax: number, ay: number, back: boolean, shaded: boolean, fine: boolean, glowC: string) {
    // Thighs of brass, legs of iron.
    this.limb(ctx, hx, hy, kx, ky, 9.8, 7.6, 'brass', back, shaded, fine, LIMB_CRACK2, this.crBody * 0.9, glowC);
    this.limb(ctx, kx, ky, ax, ay, 7.2, 5.6, 'iron', back, shaded, fine, LIMB_CRACK, this.crFeet * 0.7, glowC, 2);
    const ir = back ? shade(MET.iron.c, -0.38) : MET.iron.c;
    ellipse(ctx, kx, ky, 6, 6, 0, shaded ? metalGrad(ctx, 'iron', 6, back) : ir);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(kx, ky, 6, 0, Math.PI * 2);
    ctx.stroke();
    if (fine && !back) ellipse(ctx, kx + 1.4, ky - 2.4, 2, 1.2, 0.4, 'rgba(210,220,236,0.55)');
    this.drawFoot(ctx, ax, ay, back, shaded, fine, glowC);
  }

  /** Feet part of iron and part of clay: a clay foot capped, strapped and heeled in iron. */
  private drawFoot(ctx: Ctx, ax: number, ay: number, back: boolean, shaded: boolean, fine: boolean, glowC: string) {
    ctx.save();
    ctx.translate(ax, ay);
    const clay = back ? shade(MET.clay.c, -0.38) : MET.clay.c;
    const iron = back ? shade(MET.iron.c, -0.38) : MET.iron.c;
    const H = FOOT_H;
    poly(ctx, [-6, -1.6, 2.5, -2, 7.5, 1, 12.5, 3, 16.2, 4.6, 17, H, -7.2, H, -8.4, 4.4], shaded ? metalPlate(ctx, 'clay', 'foot', 0, -2, 0, H, back) : clay, OUT, 1.1);
    // Iron toe cap with toes, an iron strap over the instep, an iron heel.
    poly(ctx, [11, 2.4, 16.2, 4.6, 17, H, 10.4, H], shaded ? metalPlate(ctx, 'iron', 'toe', 0, 2, 0, H, back) : iron, OUT, 0.9);
    poly(ctx, [-0.6, -2, 2.8, -2, 4.6, H, 0.8, H], shaded ? metalPlate(ctx, 'iron', 'strap', -1, 0, 4, 0, back) : iron, OUT, 0.8);
    poly(ctx, [-8.4, 4.4, -6.8, 2.2, -5, H, -7.2, H], iron, OUT, 0.7);
    if (fine) {
      ctx.strokeStyle = back ? '#0a0a0c' : MET.iron.line;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(13.2, 3.4); ctx.lineTo(13.4, H);
      ctx.moveTo(15, 4.1); ctx.lineTo(15.3, H);
      ctx.stroke();
      if (!back) {
        ctx.fillStyle = MET.iron.hi;
        ctx.fillRect(1.5, 1, 1, 1);
        ctx.fillRect(1.9, 4.2, 1, 1);
        // Clay is matte: only a dull edge of light on the instep.
        ctx.strokeStyle = MET.clay.hi;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(4.8, -0.6);
        ctx.lineTo(10.8, 2.2);
        ctx.stroke();
      }
    }
    // The clay crumbles: cracks that spread, flaring when struck.
    const amt = this.crFeet;
    if (amt > 0.01) {
      ctx.beginPath();
      for (const c of FOOT_CRACKS) crackPath(ctx, c, amt);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this.feetFlash > 0 ? '#ffffff' : glowC;
      ctx.lineWidth = 0.5 + this.feetFlash * 3;
      ctx.globalAlpha = 0.5 + Math.min(1, amt) * 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.feetFlash > 0 && !back) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 3, 3, 14, '#ffd0a0', this.feetFlash * 3);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /** A wrapped, fringed brass kilt, hanging from the hips to mid-thigh. */
  private drawKilt(ctx: Ctx, shaded: boolean, fine: boolean) {
    const j = this.j;
    const hx = j.hipX, hy = j.hipY;
    const lo = Math.min(j.knFX, j.knBX) - hx, hi = Math.max(j.knFX, j.knBX) - hx;
    const L = Math.min(-17, lo - 4), R = Math.max(18, hi + 5);
    const B = Math.min(12, Math.max(j.knFY, j.knBY) - hy - 10);
    ctx.save();
    ctx.translate(hx, hy);
    // The hem runs on a slant where the cloth wraps.
    poly(ctx, [-18, -3, 18, -3, R, B + 2, L, B - 2], shaded ? metalPlate(ctx, 'brass', 'kilt', 18, -4, -16, 16) : MET.brass.c, OUT, 1.2);
    ctx.strokeStyle = MET.brass.line;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 6.5, -1);
      ctx.lineTo(i * 6.5 + i * 1.2, B - 2 + (i + 2));
    }
    // The wrap's edge.
    ctx.moveTo(14, -2);
    ctx.lineTo(R - 3, B);
    ctx.stroke();
    ctx.strokeStyle = shade(MET.brass.c, -0.32);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L + 1, B - 3.5);
    ctx.lineTo(R - 1, B - 0.5);
    ctx.stroke();
    if (fine) {
      ctx.strokeStyle = MET.brass.hi;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      const n = Math.floor((R - L) / 2.2);
      for (let i = 0; i <= n; i++) {
        const x = L + 1 + i * 2.2;
        const y = B - 2 + ((x - L) / (R - L)) * 4;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(G.time * 2 + x) * 0.4, y + 3.2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTorso(ctx: Ctx, shaded: boolean, fine: boolean, glowC: string) {
    const j = this.j;
    ctx.save();
    ctx.translate(j.hipX, j.hipY);
    ctx.rotate(j.torsoA);
    // Plates are laid out for a 50 px torso.
    ctx.scale(1, DIMS.torso / 50);
    // Belly and hips of brass.
    poly(ctx, [-17.5, 4, 17.5, 4, 17, -6, 15.5, -14, 17, -21, -17, -21, -15.5, -14, -17, -6], shaded ? metalPlate(ctx, 'brass', 'belly', 18, -24, -18, 6) : MET.brass.c, OUT, 1.3);
    if (fine) {
      ctx.strokeStyle = MET.brass.hi;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14.5, -18);
      ctx.quadraticCurveTo(16, -10, 14.6, 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // The furnace door in the belly.
    {
      const fz = this.furnace;
      ellipse(ctx, 5, -9.5, 8.6, 8.6, 0, MET.brass.line);
      ellipse(ctx, 5, -9.5, 6.9, 6.9, 0, fz > 0.2 ? '#3a0e04' : '#1a0c06');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 5, -9.5, 8 + fz * 22, '#ff6a1a', 0.25 + fz * 0.75);
      if (fz > 0.5) glow(ctx, 5, -9.5, 6 + fz * 4, '#fff3d0', (fz - 0.5) * 1.8);
      ctx.globalCompositeOperation = 'source-over';
      // Grille bars.
      ctx.strokeStyle = MET.brass.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(5 + i * 3, -15.8);
        ctx.lineTo(5 + i * 3, -3.2);
      }
      ctx.stroke();
      ctx.strokeStyle = MET.brass.hi;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(5, -9.5, 7.8, Math.PI * 1.1, Math.PI * 1.75);
      ctx.stroke();
    }
    // Belt between brass and silver, studded.
    poly(ctx, [-17, -19.5, 17, -19.5, 18, -24, -18, -24], shaded ? metalPlate(ctx, 'brass', 'belt', 0, -26, 0, -18, true) : MET.brass.line, OUT, 1);
    if (fine) for (let i = -3; i <= 3; i++) ellipse(ctx, i * 5, -21.8, 0.9, 0.9, 0, MET.brass.hi);
    // Breast of silver: a broad V of plate with pectorals and a collar.
    poly(ctx, [-17.5, -23, 17.5, -23, 22, -33, 26.5, -43, 20, -48, 9, -51.5, -9, -51.5, -20, -48, -26.5, -43, -22, -33], shaded ? metalPlate(ctx, 'silver', 'chest', 6, -53, -2, -21) : MET.silver.c, OUT, 1.4);
    // Scale mail of silver below the pectorals: rows of small arcs.
    ctx.strokeStyle = MET.silver.line;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let row = 0; row < 2; row++) {
      for (let x = -15 + (row & 1) * 2.5; x <= 15; x += 5) {
        const y = -27 - row * 3.2;
        ctx.moveTo(x - 2.5, y);
        ctx.quadraticCurveTo(x, y + 2.6, x + 2.5, y);
      }
    }
    ctx.stroke();
    // Pectoral plates: a shadow under each, a bright rim over each.
    ctx.strokeStyle = MET.silver.line;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -49);
    ctx.lineTo(0, -26);
    ctx.moveTo(-22, -42);
    ctx.quadraticCurveTo(-12, -29, -1, -33);
    ctx.moveTo(22, -42);
    ctx.quadraticCurveTo(12, -29, 1, -33);
    ctx.moveTo(-9, -29);
    ctx.lineTo(9, -29);
    ctx.stroke();
    ctx.strokeStyle = MET.silver.hi;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(21, -40.5);
    ctx.quadraticCurveTo(12, -31.5, 2.5, -34.6);
    ctx.moveTo(1.6, -47.5);
    ctx.lineTo(1.6, -36);
    ctx.stroke();
    if (fine && shaded) {
      // Mirror silver: a vertical sheet of light down the chest.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(11, -49);
      ctx.lineTo(16, -49);
      ctx.lineTo(13, -25);
      ctx.lineTo(9, -25);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Collar of plates.
    ctx.strokeStyle = shade(MET.silver.c, -0.28);
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-12.5, -49.5);
    ctx.quadraticCurveTo(0, -42, 12.5, -49.5);
    ctx.stroke();
    if (fine) {
      ctx.fillStyle = MET.silver.hi;
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * 4.6 - 0.6, -46.6 + Math.abs(i) * 0.9, 1.2, 1.2);
    }
    crackSet(ctx, CHEST_CRACKS, this.crBody, glowC, 1.5);
    crackSet(ctx, BELLY_CRACKS, this.crBody * 1.2 - 0.2, glowC, 1.5);
    ctx.restore();
  }

  /** The head of fine gold: a horned tiara, a long curled beard, eyes of light. */
  private drawHead(ctx: Ctx, shaded: boolean, fine: boolean, glowC: string) {
    const j = this.j;
    // Neck.
    this.limb(ctx, j.neckX, j.neckY + 2, j.headX - Math.sin(j.headA) * 6, j.headY + Math.cos(j.headA) * 6, 7, 6.5, 'gold', true, shaded, false, null, 0, glowC);
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    ctx.scale(1.3, 1.3);
    const gold = shaded ? metalPlate(ctx, 'gold', 'head', 12, -8, -12, -2) : MET.gold.c;
    const goldDk = shaded ? metalPlate(ctx, 'gold', 'headDk', 12, -8, -12, -2, true) : shade(MET.gold.c, -0.38);
    const line = MET.gold.line;
    // Long hair in rows of curls down the back of the neck.
    poly(ctx, [-4, -8, -9, -5, -11, 2, -10.5, 10, -7.5, 14, -3.5, 12, -2.5, 3], goldDk, OUT, 0.9);
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let r = 0; r < 4; r++) {
      const y = -1 + r * 3.4;
      for (let x = -10; x < -3.5; x += 2.2) {
        ctx.moveTo(x, y);
        ctx.arc(x + 1, y, 1, Math.PI, 0, true);
      }
    }
    ctx.stroke();
    // Face in profile.
    poly(ctx, [-4.5, -8.4, 6.6, -8.6, 7.6, -5.2, 7, -3.6, 10.6, 1.2, 8.6, 2.2, 9, 3.5, 7.4, 4.6, -1.5, 4, -3, 0], gold, OUT, 0.9);
    // Ear with a ring.
    ellipse(ctx, -0.6, -1.4, 1.4, 2.3, 0.1, goldDk);
    ctx.strokeStyle = MET.gold.hi;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(-0.5, 2, 1, 0, Math.PI * 2);
    ctx.stroke();
    // Beard: long and squared, rows of curls.
    poly(ctx, [-2, 2.2, 7.6, 4.4, 9.2, 7.6, 9.4, 15.2, 7.6, 18.2, 0.8, 18.4, -1.8, 13.5, -2.8, 6], goldDk, OUT, 0.9);
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let r = 0; r < 4; r++) {
      const y = 7.2 + r * 3;
      for (let x = -1.6; x < 8.6; x += 2.1) {
        ctx.moveTo(x, y);
        ctx.arc(x + 1, y, 1, Math.PI, 0, true);
      }
    }
    ctx.stroke();
    if (fine) {
      ctx.strokeStyle = MET.gold.hi;
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(8.6, 6);
      ctx.lineTo(8.8, 15);
      ctx.stroke();
    }
    // Brow, eye socket, moustache, the nose's edge of light.
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(2, -5.4);
    ctx.quadraticCurveTo(4.8, -6.4, 7.4, -5);
    ctx.moveTo(9.3, 3.4);
    ctx.quadraticCurveTo(6.6, 4.9, 3.8, 3.6);
    ctx.stroke();
    ctx.strokeStyle = MET.gold.hi;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(7.4, -3.4);
    ctx.lineTo(10, 0.8);
    ctx.moveTo(5.8, -0.4);
    ctx.quadraticCurveTo(7, 1, 6.6, 2.6);
    ctx.stroke();
    // Diadem across the brow, with rosettes.
    poly(ctx, [-5.2, -8.2, 7.2, -8.4, 7.4, -10.6, -5.4, -10.4], goldDk, OUT, 0.7);
    if (fine) for (let i = 0; i < 4; i++) ellipse(ctx, -3.6 + i * 3.4, -9.4, 0.7, 0.7, 0, MET.gold.hi);
    // Tiara: a flaring cylinder wound with horns, a feathered rim on top.
    poly(ctx, [-5.6, -10.4, 7.4, -10.6, 8.6, -21.4, -6.6, -21], gold, OUT, 0.9);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = line;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = -12.6 - i * 3.1;
      ctx.moveTo(8 + i * 0.3, y);
      ctx.quadraticCurveTo(1, y - 2.6, -6 - i * 0.3, y + 0.8);
    }
    ctx.stroke();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = MET.gold.hi;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = -13.4 - i * 3.1;
      ctx.moveTo(7.6 + i * 0.3, y);
      ctx.quadraticCurveTo(1.5, y - 2.2, -3, y - 0.6);
    }
    ctx.stroke();
    // A crest of rays and a knob at the crown.
    poly(ctx, [-6.8, -21, -5.4, -24, -3.6, -21.3, -1.8, -24.6, 0, -21.4, 1.8, -25, 3.6, -21.5, 5.4, -24.6, 7.2, -21.6, 8.6, -24, 8.6, -21.4], goldDk, OUT, 0.6);
    ellipse(ctx, 1, -25.4, 1.6, 1.6, 0, gold);
    if (fine && shaded) {
      // A hot specular down the front of the tiara and along the cheek.
      ctx.strokeStyle = 'rgba(255,252,232,0.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(6.8, -20);
      ctx.lineTo(6.2, -11.4);
      ctx.moveTo(3.4, -7.4);
      ctx.lineTo(6.2, -7.6);
      ctx.stroke();
    }
    crackSet(ctx, HEAD_CRACKS, this.crHead, glowC, 1.1);
    // The eye: an almond of light.
    const e = this.eyes;
    poly(ctx, [2.8, -3.2, 4.8, -4.3, 6.8, -3.4, 4.9, -2.4], e > 0.15 ? '#fff3d0' : '#3a2408', OUT, 0.4);
    if (e > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const c = this.phase >= 3 && !this.dying ? '#ff6a2a' : '#ffb84a';
      glow(ctx, 4.8, -3.3, 6 + e * 4 + this.eyeCharge * 10, c, 0.5 + e * 0.5);
      if (this.eyeCharge > 0) glow(ctx, 4.8, -3.3, 4 + this.eyeCharge * 5, '#ffffff', this.eyeCharge);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  private drawChunks(ctx: Ctx) {
    const shaded = shadeable(MET.gold.c);
    for (const c of this.chunks) {
      if (c.out) continue;
      const k = c.age > 0 ? clamp(1 - (c.age - c.life * 0.45) / (c.life * 0.55), 0, 1) : 1;
      if (k <= 0.02) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.scale(k, k);
      const v = c.verts;
      ctx.beginPath();
      ctx.moveTo(v[0], v[1]);
      for (let i = 2; i < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
      ctx.closePath();
      ctx.fillStyle = shaded ? metalGrad(ctx, c.m, c.s, false) : MET[c.m].c;
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.strokeStyle = MET[c.m].hi;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(v[0] * 0.8, v[1] * 0.8);
      ctx.lineTo(v[2] * 0.8, v[3] * 0.8);
      ctx.stroke();
      ctx.restore();
    }
    // Light still pours from where it stood, fading.
    const t = this.shatterT - 1.7;
    if (t < 1.6) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.baseY - 70, 90, '#fff3d0', 0.6 * (1 - t / 1.6));
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawStone(ctx: Ctx) {
    const x = this.stoneX, y = this.stoneY;
    const falling = this.shatterT >= 0 && this.shatterT < 1.0;
    ctx.globalCompositeOperation = 'lighter';
    if (falling) {
      // A white trail down from the sky.
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#fff3d0';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + this.face * 14, y - 70);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    glow(ctx, x, y, 46, '#fff3d0', falling ? 0.8 : 0.45 + Math.sin(G.time * 2) * 0.08);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.stoneR);
    const v = this.stoneVerts;
    ctx.beginPath();
    ctx.moveTo(v[0], v[1]);
    for (let i = 2; i < v.length; i += 2) ctx.lineTo(v[i], v[i + 1]);
    ctx.closePath();
    let g = gradCache.get('stone');
    if (!g) {
      g = ctx.createRadialGradient(-4, -5, 1, 0, 0, 15);
      g.addColorStop(0, '#f4f0e8');
      g.addColorStop(0.5, '#bdb6aa');
      g.addColorStop(1, '#6a645a');
      gradCache.set('stone', g);
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#2a2620';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,72,62,0.6)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(1, 1);
    ctx.lineTo(5, -4);
    ctx.stroke();
    ctx.restore();
  }

  drawOverlay(ctx: Ctx) {
    if (this.state === 'kneel') {
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(G.time * 10) * 0.3;
      const y = this.topY - 14;
      glow(ctx, this.x, y, 16, '#ffe6a8', 0.7 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.x, y - 8); ctx.lineTo(this.x + 6, y); ctx.lineTo(this.x, y + 8); ctx.lineTo(this.x - 6, y); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.broken) {
      if (this.stoneOn) lighting.add(this.stoneX, this.stoneY, 90, '#fff3d0', 0.7, 0.5);
      return;
    }
    // Gold catches every light on the plain.
    lighting.add(this.x, this.wy(-85), 170, '#ffd88a', 0.42, 0.25);
    if (this.eyes > 0.05) lighting.add(this.eyeX, this.eyeY, 40 + this.eyeCharge * 60, '#ffcf6b', 0.5 * this.eyes + this.eyeCharge * 0.4, 0.6);
    if (this.furnace > 0.2) lighting.add(this.bellyX, this.bellyY, 60 + this.furnace * 80, '#ff7a2a', this.furnace * 0.9, 0.6);
    if (this.beamOn) lighting.add(this.beamX, this.floorY - 8, 90, '#ff9a3a', 1, 0.8);
    if (this.breathOn) lighting.add(this.bellyX + this.face * 90, this.bellyY + 30, 160, '#ff7a2a', 1, 0.8);
    if (this.dying && (this.crBody > 0.5)) lighting.add(this.x, this.cy, 120, '#fff3d0', 0.5, 0.5);
    if (this.stoneOn) lighting.add(this.stoneX, this.stoneY, 90, '#fff3d0', 0.8, 0.6);
  }
}

/** Two-bone IK for the legs: knee folds forward. Returns [kneeX, kneeY, ankleX, ankleY]. */
const LEG = new Float32Array(4);
function legIK(ax: number, ay: number, bx: number, by: number, l1: number, l2: number) {
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
  const ang = a - Math.acos(c);
  LEG[0] = ax + Math.cos(ang) * l1;
  LEG[1] = ay + Math.sin(ang) * l1;
  LEG[2] = ax + dx;
  LEG[3] = ay + dy;
  return LEG;
}

