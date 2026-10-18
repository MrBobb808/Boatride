// Covenant Echoes: purified battle-imprints that fight beside Elior.
// They keep the form and fighting style of what they were, re-forged in
// black-gold armor and white fire. Modes: aggressive / defensive / follow.
// Commands: priority target, recall, synchronized strike, switch.
//
// Each species is a kit: its rig, its look per stage, and its moves as data.
// Melee kits share one brain; the Ranger has its own.

import { Entity, type HitInfo } from './entity';
import { moveBody, groundAhead, wallAhead } from './physics';
import { Animator, solve, newJoints, Chain, drawRibbon, type Joints, type Pose, type Clip, type RigDims, BASE_POSE } from '../render/skeleton';
import { drawHumanoid, type HumanStyle } from '../render/actors';
import { drawEchoSprite } from '../render/creatureSprites';
import { glow, rgba, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign } from '../core/math';
import { SENT_CLIPS, SENT_BASE, SENT_DIMS, ARCH_CLIPS, ARCH_BASE, ARCH_DIMS, sentinelStyle, archerStyle } from './enemies';
import { BRUTE_CLIPS, BRUTE_BASE, BRUTE_DIMS, BULW_CLIPS, BULW_BASE, BULW_DIMS, bruteStyle, bulwarkStyle, knightEchoStyle, marshalStyle } from './tanks';
import { LOCUST_DIMS, locustStyle, drawLocustWings, drawLocustHead, drawLocustScythes } from './locusts';
import { drawLion, newLionPose } from './babylon';
import { ECHO_SPECIES, defaultEchoRole, echoRole, type EchoInst, type EchoOrder, type EchoRole } from './data';
import { tickEchoRole, drawEchoRole, echoSpot } from './echoRoles';
import { echoAtk, echoMaxHp, gainEchoXp, skillRank } from './state';
import { preferredSquadTarget } from './squadOrders';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';

interface Move {
  state: string;
  clip: string;
  /** Seconds. */
  T: number;
  /** Normalized time of the blow. */
  hitU: number;
  box: { x: number; y: number; w: number; h: number };
  mult: number;
  poise: number;
  kx: number;
  ky: number;
  stun?: number;
  minStage?: number;
  weight: number;
  /** Ground slam: dust, ring, shake. */
  slam?: boolean;
  /** Rolling waves of light from this stage on. */
  waveStage?: number;
  /** Dash speed through the blow. */
  dash?: number;
  /** Repeat the move this many extra times while the foe is close. */
  chain?: number;
  /** Teleport behind the target before striking. */
  blink?: boolean;
  /** Spring at the target: launch speed upward, a little before the blow. */
  leap?: number;
  sound: string;
}

export interface EchoKit {
  clips: Record<string, Clip>;
  base: Pose;
  dims: RigDims;
  w: number;
  h: number;
  style: (stage: number) => HumanStyle;
  ranged?: boolean;
  /** Chance to block a frontal blow while not attacking. */
  guard: number;
  /** Damage taken multiplier. */
  armor: number;
  speed: number;
  /** Distance at which it starts a blow. */
  reach: number;
  moves: Move[];
  cape: [number, number] | null;
  capeColor: (stage: number) => string;
  /** Draws foes, stops arrows for Elior in defensive mode, shields nearby allies. */
  guardian: boolean;
  idle: string;
  /** Marshal-class: other Echoes near it fight harder. */
  warden?: boolean;
  /** Extra parts drawn in rig space behind / in front of the body (wings, antennae). */
  under?: (ctx: Ctx, u: EchoUnit) => void;
  over?: (ctx: Ctx, u: EchoUnit) => void;
  /** Draws the whole body instead of the humanoid (beasts). */
  body?: (ctx: Ctx, u: EchoUnit) => void;
}

const SENT_SLASH_BOX = { x: -4, y: -44, w: 40, h: 46 };

export const KITS: Record<string, EchoKit> = {
  sentinel: {
    clips: SENT_CLIPS, base: SENT_BASE, dims: SENT_DIMS, w: 18, h: 40, style: (st) => sentinelStyle('echo', st),
    guard: 0.5, armor: 0.8, speed: 100, reach: 40, guardian: true, idle: 'guard',
    cape: [11, 15], capeColor: (st) => (st >= 1 ? '#e8dcc0' : '#2a2420'),
    moves: [
      { state: 'slash', clip: 'slash', T: 0.8, hitU: 0.58, box: SENT_SLASH_BOX, mult: 1, poise: 18, kx: 140, ky: -120, weight: 1, sound: 'echoAttack' },
      { state: 'bash', clip: 'bash', T: 0.6, hitU: 0.45, box: SENT_SLASH_BOX, mult: 0.8, poise: 45, kx: 280, ky: -120, stun: 0.6, minStage: 1, weight: 0.45, sound: 'shieldBash' },
      { state: 'slam', clip: 'slam', T: 1.0, hitU: 0.7, box: { x: -20, y: -36, w: 60, h: 38 }, mult: 2.0, poise: 18, kx: 140, ky: -120, minStage: 2, weight: 0.4, slam: true, waveStage: 2, sound: 'echoAttack' },
    ],
  },
  archer: {
    clips: ARCH_CLIPS, base: ARCH_BASE, dims: ARCH_DIMS, w: 12, h: 32, style: (st) => archerStyle('echo', st),
    ranged: true, guard: 0, armor: 1, speed: 100, reach: 260, guardian: false, idle: 'idle',
    cape: [11, 15], capeColor: (st) => (st >= 1 ? '#e8dcc0' : '#2a2420'), moves: [],
  },
  brute: {
    clips: BRUTE_CLIPS, base: BRUTE_BASE, dims: BRUTE_DIMS, w: 24, h: 50, style: (st) => bruteStyle('echo', st),
    guard: 0, armor: 0.62, speed: 74, reach: 54, guardian: true, idle: 'idle',
    cape: null, capeColor: () => '#2a2420',
    moves: [
      { state: 'smash', clip: 'smash', T: 1.15, hitU: 0.64, box: { x: -6, y: -48, w: 66, h: 52 }, mult: 2.3, poise: 70, kx: 260, ky: -280, weight: 1, slam: true, waveStage: 1, sound: 'sentinelSlam' },
      { state: 'sweep', clip: 'sweep', T: 0.9, hitU: 0.58, box: { x: -16, y: -50, w: 68, h: 50 }, mult: 1.5, poise: 45, kx: 340, ky: -160, weight: 0.8, sound: 'swingHeavy' },
    ],
  },
  bulwark: {
    clips: BULW_CLIPS, base: BULW_BASE, dims: BULW_DIMS, w: 20, h: 44, style: (st) => bulwarkStyle('echo', st),
    guard: 0.75, armor: 0.7, speed: 92, reach: 56, guardian: true, idle: 'guard',
    cape: null, capeColor: () => '#2a2420',
    moves: [
      { state: 'jab', clip: 'jab', T: 0.7, hitU: 0.52, box: { x: 6, y: -42, w: 52, h: 16 }, mult: 1.0, poise: 20, kx: 160, ky: -60, weight: 1, sound: 'swingSpear' },
      { state: 'shove', clip: 'shove', T: 0.65, hitU: 0.45, box: { x: 0, y: -44, w: 30, h: 44 }, mult: 0.7, poise: 55, kx: 380, ky: -150, stun: 0.5, minStage: 1, weight: 0.5, sound: 'shieldBash' },
    ],
  },
  knight: {
    clips: SENT_CLIPS, base: SENT_BASE, dims: SENT_DIMS, w: 16, h: 40, style: (st) => knightEchoStyle(st),
    guard: 0.25, armor: 0.9, speed: 125, reach: 42, guardian: false, idle: 'guard',
    cape: [11, 15], capeColor: (st) => (st >= 1 ? '#7a1a1e' : '#4a1216'),
    moves: [
      { state: 'slash', clip: 'slash', T: 0.58, hitU: 0.56, box: SENT_SLASH_BOX, mult: 1.0, poise: 20, kx: 140, ky: -110, weight: 1, chain: 1, sound: 'swing' },
      { state: 'lunge', clip: 'bash', T: 0.7, hitU: 0.5, box: { x: 0, y: -40, w: 34, h: 34 }, mult: 1.4, poise: 35, kx: 240, ky: -80, dash: 320, minStage: 1, weight: 0.5, sound: 'swingSpear' },
    ],
  },
  marshal: {
    clips: SENT_CLIPS, base: SENT_BASE, dims: SENT_DIMS, w: 18, h: 42, style: (st) => marshalStyle('echo', st),
    guard: 0.35, armor: 0.75, speed: 150, reach: 48, guardian: false, idle: 'guard', warden: true,
    cape: [12, 17], capeColor: () => '#6a1418',
    moves: [
      { state: 'slash', clip: 'slash', T: 0.48, hitU: 0.55, box: { x: -6, y: -50, w: 50, h: 54 }, mult: 1.3, poise: 30, kx: 160, ky: -130, weight: 1, chain: 2, waveStage: 2, sound: 'swingHeavy' },
      { state: 'lunge', clip: 'bash', T: 0.6, hitU: 0.48, box: { x: 0, y: -42, w: 38, h: 36 }, mult: 1.8, poise: 50, kx: 280, ky: -90, dash: 400, weight: 0.6, sound: 'dash' },
      { state: 'blink', clip: 'slash', T: 0.5, hitU: 0.55, box: { x: -6, y: -50, w: 50, h: 54 }, mult: 2.0, poise: 60, kx: 200, ky: -220, blink: true, minStage: 1, weight: 0.55, sound: 'swingHeavy' },
    ],
  },
};

KITS.locust = {
  clips: SENT_CLIPS, base: { ...SENT_BASE, lean: 0.26, bUA: 0.85, bFA: 1.3, fUA: 0.65, fFA: 1.4, wpn: 0.35, bTh: -0.38, bSh: -0.36, fTh: 0.5, fSh: -0.6 },
  dims: LOCUST_DIMS, w: 18, h: 46, style: (st) => locustStyle('echo', st),
  guard: 0.1, armor: 0.8, speed: 200, reach: 46, guardian: false, idle: 'guard', warden: true,
  cape: null, capeColor: () => '#000000',
  moves: [
    { state: 'slash', clip: 'slash', T: 0.34, hitU: 0.55, box: { x: -6, y: -50, w: 50, h: 54 }, mult: 1.2, poise: 26, kx: 140, ky: -130, weight: 1, chain: 3, waveStage: 2, sound: 'swing' },
    { state: 'lunge', clip: 'bash', T: 0.5, hitU: 0.45, box: { x: 0, y: -46, w: 40, h: 40 }, mult: 1.9, poise: 50, kx: 280, ky: -120, dash: 480, weight: 0.6, sound: 'wingbeat' },
    { state: 'blink', clip: 'slash', T: 0.42, hitU: 0.55, box: { x: -6, y: -50, w: 50, h: 54 }, mult: 2.3, poise: 60, kx: 200, ky: -240, blink: true, minStage: 1, weight: 0.6, sound: 'swingHeavy' },
  ],
  under: (ctx, u) => drawLocustWings(ctx, u.j, 'echo', Math.abs(u.body.vx) > 160 || !u.body.onGround ? 0.85 : 0.08, G.time * (Math.abs(u.body.vx) > 160 || !u.body.onGround ? 46 : 3) + u.id),
  over: (ctx, u) => {
    drawLocustScythes(ctx, u.j, 'echo', 12);
    drawLocustHead(ctx, u.j, 'echo', G.time + u.id, u.state === 'slash' ? 1 : 0);
  },
};

// The lion keeps a humanoid rig only for the shared brain; it is drawn as a beast.
const LP = newLionPose();
KITS.lion = {
  clips: SENT_CLIPS, base: SENT_BASE, dims: SENT_DIMS, w: 28, h: 22, style: (st) => sentinelStyle('echo', st),
  guard: 0, armor: 0.85, speed: 185, reach: 34, guardian: false, idle: 'guard',
  cape: null, capeColor: () => '#000000',
  moves: [
    { state: 'claw', clip: 'slash', T: 0.42, hitU: 0.55, box: { x: -4, y: -26, w: 34, h: 28 }, mult: 1.0, poise: 22, kx: 150, ky: -110, weight: 1, chain: 0, sound: 'swing' },
    { state: 'claw', clip: 'slash', T: 0.38, hitU: 0.55, box: { x: -4, y: -26, w: 34, h: 28 }, mult: 1.0, poise: 22, kx: 150, ky: -110, minStage: 1, weight: 0.8, chain: 1, sound: 'swing' },
    { state: 'pounce', clip: 'bash', T: 0.72, hitU: 0.78, box: { x: -8, y: -30, w: 42, h: 32 }, mult: 1.7, poise: 45, kx: 260, ky: -180, dash: 260, leap: 320, weight: 0.7, slam: true, waveStage: 2, sound: 'pounce' },
  ],
  body: (ctx, u) => {
    const L = LP;
    const b = u.body;
    const m = u.move;
    L.time = G.time + u.id;
    // Stride by distance travelled, so the paws do not slide.
    L.gait = u.x * 0.16;
    L.run = b.onGround ? clamp(Math.abs(b.vx) / 160, 0, 1) : 0;
    const v = m ? u.st / m.T : 0;
    L.crouch = m && m.leap && b.onGround && v < m.hitU - 0.33 ? clamp(v * 5, 0, 1) : 0;
    L.air = b.onGround ? 0 : 1;
    L.pitch = L.air ? clamp(b.vy * 0.0012, -0.35, 0.35) : 0;
    L.claw = m && !m.leap ? clamp(v, 0, 1) : 0;
    L.roar = 0;
    L.jaw = Math.max(L.claw > 0.35 ? 0.7 : 0, L.air * 0.8, L.crouch * 0.3);
    L.down = 0;
    L.land = 0;
    L.lash = L.crouch;
    drawLion(ctx, L, u.inst.stage >= 2 ? 'echo2' : u.inst.stage >= 1 ? 'echo1' : 'echo0');
  },
};

const roleKits: Record<string, EchoKit> = {};
export function kitFor(species: string, role: EchoRole = defaultEchoRole(species)): EchoKit {
  const key = species + ':' + role;
  if (roleKits[key]) return roleKits[key];
  const base = KITS[species] ?? KITS.sentinel;
  const ranged = role === 'mage' || role === 'ranger' || role === 'herald';
  const moves = role === 'ninja' ? [
    { ...KITS.knight.moves[0], T: 0.38, mult: 1.2, chain: 2, blink: true },
    { ...KITS.marshal.moves[1], T: 0.45, minStage: 1, mult: 1.8 },
  ] : role === 'fighter' ? [
    { ...KITS.knight.moves[0], T: 0.42, chain: 2, mult: 1.15 },
    { ...KITS.brute.moves[0], T: 0.72, mult: 2.4, minStage: 1, waveStage: 1 },
  ] : base.moves.length ? base.moves : KITS.sentinel.moves;
  return roleKits[key] = { ...base, ranged, guardian: role === 'guardian',
    guard: role === 'guardian' ? Math.max(0.6, base.guard) : role === 'ninja' ? 0.12 : 0.15,
    armor: role === 'guardian' ? 0.6 : role === 'fighter' ? 0.72 : 0.85,
    speed: role === 'ninja' ? 210 : Math.max(105, base.speed),
    reach: ranged ? 310 : role === 'ninja' ? 48 : Math.max(48, base.reach),
    clips: ranged ? ARCH_CLIPS : { ...SENT_CLIPS, ...base.clips, ...(role === 'fighter' ? BRUTE_CLIPS : {}) }, moves: ranged ? [] : moves,
  };
}

/** Colours of the order marks over the Echoes' heads. */
export const ORDER_MARK: Record<EchoOrder, string> = { guard: '#9fe39a', hunt: '#ff8a6a', flank: '#ffd27a', hold: '#9fd7ff', focus: '#ff5a7a' };

export class EchoUnit extends Entity {
  inst: EchoInst;
  kit: EchoKit;
  anim: Animator;
  pose: Pose = { ...BASE_POSE };
  j: Joints = newJoints();
  state = 'follow';
  st = 0;
  target: Entity | null = null;
  attackCd = 0;
  hitSet = new Set<number>();
  summonT = 0;
  recallT = 0;
  cape: Chain;
  slot: number;
  shots = 0;
  assistCd = 0;
  specialCd = 0;
  bowDraw = 0;
  despawn = 0;
  /** Seconds left for a temporary Echo raised by a Sovereign's finisher. */
  tempT = 0;
  move: Move | null = null;
  chainLeft = 0;
  /** The spot a 'hold' order defends. */
  holdX = 0;
  holdY = 0;
  /** The foe a 'focus' order stays on, or the fight handed over by a swap. */
  focus: Entity | null = null;
  /** Seconds a swap's handoff keeps it on Elior's foe whatever its order. */
  handoffT = 0;
  /** A foe it could not reach, left alone for a moment. */
  private ignore: Entity | null = null;
  private ignoreT = 0;
  private stuckT = 0;
  private lastDx = 0;
  private guardXpCd = 0;
  /** Seconds spent circling for a foe's back without getting there. */
  private flankT = 0;
  private priorityPoll = 0;

  get order(): EchoOrder | undefined {
    return this.inst.order;
  }

  /** Give this Echo an order. Hold marks Elior's spot; focus takes his current foe. */
  setOrder(o: EchoOrder | undefined, foe: Entity | null = null) {
    this.inst.order = o;
    this.inst.targetPriority = undefined;
    this.priorityPoll = 0;
    this.focus = o === 'focus' ? foe : null;
    if (o === 'hold') {
      const p = G.world.player;
      this.holdX = p.x;
      this.holdY = p.y;
    }
  }

  /** Swap handoff: arrive (already at Elior's old place) and press his foe at once. */
  takeOver(foe: Entity | null) {
    if (this.order === 'hold') {
      this.holdX = this.x;
      this.holdY = this.y;
    }
    if (!foe || foe.dying || foe.remove) return;
    this.target = foe;
    this.focus = this.order === 'focus' ? foe : this.focus;
    this.handoffT = 3;
    this.face = sign(foe.x - this.x) || this.face;
    this.attackCd = 0;
    if (this.kit.ranged || this.move) return;
    const m = this.kit.moves.find((mv) => (mv.minStage ?? 0) <= this.inst.stage && !mv.blink && !mv.leap) ?? this.kit.moves[0];
    if (Math.abs(foe.x - this.x) < this.kit.reach + 30) {
      this.begin(m, false);
      this.st = m.T * Math.max(0, m.hitU - 0.3);
    }
  }

  constructor(inst: EchoInst, x: number, y: number, slot: number) {
    const kit = kitFor(inst.species, echoRole(inst));
    super(x, y, kit.w, kit.h);
    this.kit = kit;
    this.inst = inst;
    this.team = 'player';
    this.slot = slot;
    this.specialCd = 0.8 + slot * 0.15;
    this.anim = new Animator(kit.clips, kit.base);
    this.anim.play('idle', 0);
    this.cape = new Chain(7, 4, x, y - 34);
    this.maxHp = echoMaxHp(G.save, inst, G.d);
    this.hp = clamp(inst.hp, 1, this.maxHp);
    this.summonT = 1.1;
    this.layer = 7;
    this.name = ECHO_SPECIES[inst.species].stages[inst.stage].name;
    // A held post and a focused foe belong to one fight: a fresh summon starts free.
    if (inst.order === 'hold' || inst.order === 'focus') inst.order = undefined;
  }

  /** Shield-bearers and heavies: draw foes and guard Elior. */
  get sentinel() {
    return this.kit.guardian;
  }

  refreshStats() {
    this.maxHp = echoMaxHp(G.save, this.inst, G.d);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  setRole(role: EchoRole) {
    this.inst.role = role;
    this.kit = kitFor(this.inst.species, role);
    this.anim = new Animator(this.kit.clips, this.kit.base);
    this.move = null; this.state = 'follow'; this.st = 0; this.attackCd = 0.3;
    this.specialCd = Math.max(this.specialCd, 3);
    this.refreshStats();
  }

  update(dt: number) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.assistCd = Math.max(0, this.assistCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.summonT > 0) {
      this.summonT -= dt;
      if (Math.random() < dt * 40) fx.spawn(PK.Flame, this.x + rand(-10, 10), this.y - rand(0, 40), 0, -60, 0.6, 4, 0.5, '#fff3d0', -40, 1);
    }
    if (this.tempT > 0) {
      this.tempT -= dt;
      if (this.tempT <= 0) this.dismiss();
    }
    if (this.despawn > 0) {
      this.despawn -= dt;
      if (this.despawn <= 0) this.remove = true;
      this.anim.update(dt);
      this.pose = this.anim.sample();
      solve(this.pose, this.kit.dims, true, this.j);
      return;
    }
    const p = G.world.player;
    const b = this.body;
    const mode = G.save.echoMode;
    if (this.recallT > 0) {
      this.recallT -= dt;
      this.collide = false;
      this.grav = 0;
      const tx = p.x - p.face * (16 + this.slot * 14), ty = p.y;
      this.x += (tx - this.x) * Math.min(1, dt * 10);
      this.y += (ty - this.y) * Math.min(1, dt * 10);
      b.vx = b.vy = 0;
      if (Math.random() < dt * 60) fx.spawn(PK.Mote, this.x, this.y - 20, 0, 0, 0.3, 10, 2, '#ffe6a8');
      if (this.recallT <= 0) {
        this.collide = true;
        this.grav = 1;
        if (G.world.solidAt(this.x, this.y - 4)) {
          this.x = p.x;
          this.y = p.y;
        }
      }
      this.animate(dt);
      return;
    }
    this.handoffT = Math.max(0, this.handoffT - dt);
    this.priorityPoll = Math.max(0, this.priorityPoll - dt);
    this.guardXpCd = Math.max(0, this.guardXpCd - dt);
    if (this.ignoreT > 0 && (this.ignoreT -= dt) <= 0) this.ignore = null;
    const order = this.order;
    // Teleport back if very far from Elior (fell off or left behind). Hunters
    // range wider, and a held post is not abandoned for distance alone.
    const leash = order === 'hold' ? 1400 : order === 'hunt' || order === 'focus' ? 720 : 420;
    if (Math.abs(p.x - this.x) > leash || Math.abs(p.y - this.y) > (order === 'hold' ? 900 : 260)) {
      this.x = p.x - p.face * 20;
      this.y = p.y;
      b.vx = b.vy = 0;
      fx.holyBurst(this.x, this.y - 20, 10, 0.6);
    }
    this.chooseTarget(mode);
    tickEchoRole(this, dt);
    // Orders map onto the army's movement styles; hold has its own.
    const how = order === 'guard' ? 'defensive' : order === 'hold' ? 'hold' : order ? 'aggressive' : mode;
    if (this.kit.ranged) this.thinkArcher(dt, how);
    else this.thinkMelee(dt, how);
    this.watchReach(dt);
    b.vy = Math.min(560, b.vy + 1500 * this.grav * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, this.collide);
    if (this.y > G.world.grid.h * 16 + 30) {
      this.x = p.x;
      this.y = p.y;
    }
    this.animate(dt);
    if (this.kit.cape) {
      const f = this.face;
      this.cape.update(this.x + f * (this.j.shBX - 2), this.y + this.j.shBY, dt, -b.vx * 2 - f * 50 + Math.sin(G.time * 2) * 30, 380, 0.88);
    }
  }

  private usable(e: Entity | null): e is Entity {
    return !!e && !e.dying && !e.remove && e !== this.ignore;
  }

  private chooseTarget(mode: string) {
    const W = G.world, p = W.player, order = this.order;
    if (this.handoffT > 0 && this.usable(this.target)) return;
    if (order === 'focus') {
      if (this.usable(this.focus)) { this.target = this.focus; return; }
      if (this.focus) {
        // Its foe has fallen: it goes hunting.
        this.focus = null;
        this.inst.order = 'hunt';
      }
    }
    if (this.inst.targetPriority && order === 'hunt') {
      if (this.priorityPoll > 0 && this.usable(this.target)) return;
      this.priorityPoll = 0.25;
      const preferred = preferredSquadTarget(this, this.inst.targetPriority);
      if (preferred) { this.target = preferred; return; }
    }
    const prio = W.priorityTarget;
    if (order !== 'hold' && this.usable(prio)) { this.target = prio; return; }
    let t: Entity | null;
    if (order === 'hold') t = W.nearestEnemy(this.holdX, this.holdY - 20, 150, 0);
    else if (order === 'hunt' || order === 'focus') t = W.nearestEnemy(this.x, this.y - 20, 420, 0);
    else if (order === 'guard') t = W.nearestEnemy(p.x, p.y - 20, 150, 0);
    else if (order === 'flank') t = this.usable(p.lastFoe) ? p.lastFoe : W.nearestEnemy(p.x, p.y - 20, 260, 0);
    else {
      const range = mode === 'aggressive' ? 260 : mode === 'defensive' ? 110 : 150;
      t = W.nearestEnemy(mode === 'aggressive' ? this.x : p.x, p.y - 20, range, 0);
    }
    this.target = t === this.ignore ? null : t;
  }

  /** A foe on a ledge it cannot climb to: give up on it for a few seconds. */
  private watchReach(dt: number) {
    const t = this.target;
    if (!t || this.kit.ranged || this.move) { this.stuckT = 0; return; }
    const dx = Math.abs(t.x - this.x);
    const high = t.y < this.y - 60;
    if (high && this.body.onGround && Math.abs(dx - this.lastDx) < 30 * dt + 0.5) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    this.lastDx = dx;
    if (this.stuckT > 1.6) {
      this.ignore = t;
      this.ignoreT = 3;
      this.target = null;
      this.stuckT = 0;
    }
  }

  /** Where to stand to strike t: behind it when flanking, and spread out when others share the foe. */
  private standX(t: Entity) {
    const p = G.world.player;
    const reach = this.kit.reach - 10;
    if (this.order === 'flank') {
      const back = -(t.face || sign(p.x - t.x) || 1);
      return t.x + back * (t.body.w / 2 + 16);
    }
    let rank = 0;
    for (const e of G.world.echoes) if (e !== this && e.target === t && e.slot < this.slot) rank++;
    if (rank === 0) return t.x + sign(this.x - t.x || 1) * reach;
    // Crowding: alternate sides of the foe, a step farther each time.
    const side = rank % 2 ? -sign(p.x - t.x || 1) : sign(p.x - t.x || 1);
    return t.x + side * (reach + Math.floor(rank / 2) * 10);
  }

  private follow(dt: number, speed: number) {
    const p = G.world.player;
    const b = this.body;
    const tx = p.x - p.face * (22 + this.slot * 18);
    const dx = tx - this.x;
    if (Math.abs(dx) > 10) {
      const dir = sign(dx);
      this.face = dir;
      const fast = Math.abs(dx) > 90 ? 1.6 : 1;
      b.vx = approach(b.vx, dir * speed * fast, 900 * dt);
      // hop up ledges after Elior
      if (b.onGround && (wallAhead(b, dir, G.world.grid, G.world.solid) || (p.y < this.y - 20 && Math.abs(dx) < 80))) b.vy = -420;
      if (b.onGround && !groundAhead(b, dir, G.world.grid, G.world.solid) && p.y <= this.y + 4) b.vy = -380;
    } else {
      b.vx = approach(b.vx, 0, 900 * dt);
      this.face = p.face;
    }
  }

  private pickMove(): Move | null {
    const stage = this.inst.stage;
    const avail = this.kit.moves.filter((m) => (m.minStage ?? 0) <= stage);
    if (!avail.length) return null;
    let total = 0;
    for (const m of avail) total += m.weight;
    let r = Math.random() * total;
    for (const m of avail) {
      r -= m.weight;
      if (r <= 0) return m;
    }
    return avail[0];
  }

  private thinkMelee(dt: number, mode: string) {
    const b = this.body;
    const t = this.target;
    const m = this.move;
    if (m) {
      const u = this.st / m.T;
      if (m.leap) {
        // Crouch, spring, and carry through the air onto the target.
        const lu = m.hitU - 0.33;
        if (u >= lu && this.st - dt < lu * m.T && b.onGround) {
          const T = (2 * m.leap) / 1500;
          const dx = t ? Math.abs(t.x - this.x) : 80;
          b.vy = -m.leap;
          b.vx = this.face * clamp(dx / T, 120, m.dash ?? 300);
        } else if (b.onGround && (u < lu || this.st > lu * m.T + 0.1)) b.vx = approach(b.vx, 0, 900 * dt);
      } else if (m.dash && u > m.hitU - 0.12 && u < m.hitU + 0.14) b.vx = this.face * m.dash;
      else b.vx = approach(b.vx, 0, 900 * dt);
      if (u >= m.hitU && this.st - dt < m.hitU * m.T) this.blow(m);
      if (u >= 1) {
        if (this.chainLeft > 0 && t && !t.dying && Math.abs(t.x - this.x) < this.kit.reach + 16) {
          this.chainLeft--;
          this.begin(m, true);
          return;
        }
        this.move = null;
        this.attackCd = m.slam ? 1.1 : rand(0.35, 0.65) * (this.kit.warden ? 0.7 : 1);
        this.state = 'follow';
      }
      return;
    }
    if (t && (mode !== 'follow' || Math.abs(t.x - G.world.player.x) < 120)) {
      const dx = t.x - this.x;
      const dist = Math.abs(dx);
      this.face = sign(dx) || this.face;
      // A flanker holds its blow until it is behind the foe (or has tried for a while).
      const atBack = sign(this.x - t.x) === -(t.face || 1);
      this.flankT = this.order === 'flank' && !atBack ? this.flankT + dt : 0;
      const behind = this.order !== 'flank' || atBack || this.flankT > 1.6;
      const mv = this.attackCd <= 0 && b.onGround && behind ? this.pickMove() : null;
      if (mv && (dist < this.kit.reach || (mv.dash && dist < 150) || (mv.blink && dist < 170))) {
        this.begin(mv, false);
        return;
      }
      if (mode === 'defensive') {
        // Hold a line just in front of Elior.
        const p = G.world.player;
        const guardX = p.x + sign(t.x - p.x) * 26;
        this.walk(guardX, this.kit.speed * 0.9, dt);
      } else if (mode === 'hold' && Math.abs(t.x - this.holdX) > 170) this.walk(this.holdX, this.kit.speed, dt);
      else if (this.order === 'flank' && !behind) {
        // Circle round: hop over the foe if it stands between.
        const sx = this.standX(t);
        this.walk(sx, this.kit.speed * 1.15, dt, 4);
        if (b.onGround && Math.abs(t.x - this.x) < t.body.w / 2 + 12 && sign(sx - this.x) === sign(t.x - this.x)) b.vy = -440;
      } else this.walk(this.standX(t), this.kit.speed, dt, 6);
    } else if (mode === 'hold') this.walk(this.holdX, this.kit.speed, dt, 8);
    else this.follow(dt, this.kit.speed + 10);
  }

  private begin(m: Move, chained: boolean) {
    this.move = m;
    this.state = m.state;
    this.st = 0;
    this.hitSet.clear();
    if (!chained) this.chainLeft = (m.chain ?? 0) + (this.kit === KITS.knight && this.inst.stage >= 2 ? 1 : 0);
    if (m.blink && this.target) {
      const t = this.target;
      const side = sign(t.x - this.x) || this.face;
      const spot = echoSpot(this, t, side);
      const tx = spot?.x ?? this.x;
      if (spot) {
        fx.streak(this.x, this.y - 22, tx, t.y - 22, '#ffd0c0', 0.22, 3);
        fx.spawn(PK.Smoke, this.x, this.y - 18, 0, -20, 0.4, 5, 12, '#1a1012', -20, 2);
        this.x = tx;
        this.y = t.y;
        this.face = sign(t.x - this.x) || -side;
        sfx('dash', { pan: G.world.pan(this.x), pitch: 1.5, vol: 0.6 });
      }
    }
    this.anim.play(m.clip, 0.06, true, 1 / m.T);
  }

  private blow(m: Move) {
    const stage = this.inst.stage;
    let atk = echoAtk(G.save, this.inst, G.d) * G.world.commanderAura(this.x, this.y, this);
    let poiseMul = 1;
    const t = this.target;
    if (this.order === 'flank' && t && sign(this.x - t.x) === -(t.face || 1)) {
      // A blow in the back: harder, and it breaks guard sooner.
      atk *= 1.3;
      poiseMul = 1.6;
      fx.ring(t.x, t.cy, 4, 22, '#ffd27a', 0.25, 2);
    }
    sfx(m.sound, { pan: G.world.pan(this.x), vol: 0.8 });
    const box = m.box;
    const x = this.face > 0 ? this.x + box.x : this.x - box.x - box.w;
    G.world.hitEnemies({ x, y: this.y + box.y, w: box.w, h: box.h }, {
      dmg: atk * m.mult, poise: m.poise * poiseMul, kx: this.face * m.kx, ky: m.ky, dir: this.face, kind: 'echo', src: this, stop: 0.02, stun: m.stun ?? 0,
    }, this.hitSet, () => {
      this.gainXp(1);
      if (echoRole(this.inst) === 'fighter' && stage >= 2) this.inst.hp = this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03);
    });
    if (!m.slam) {
      const big = this.kit === KITS.marshal || this.kit === KITS.brute;
      fx.slash(this.x + this.face * 4, this.y - this.kit.h * 0.62, big ? 30 : 24, -2.0, 0.6, big ? 9 : 7, this.face, '#fffaf0', this.kit === KITS.marshal ? '#ff8a6a' : '#ffe6a8', 0.15);
    } else {
      fx.dust(this.x + this.face * 20, this.y, 12, 1.5);
      fx.ring(this.x + this.face * 20, this.y, 6, 56, '#fff3c4', 0.35, 3, 0.3);
      G.camera.addTrauma(0.15);
    }
    if (m.waveStage !== undefined && stage >= m.waveStage) {
      const c = this.kit === KITS.marshal ? '#ffd8b0' : '#fff3c4';
      G.world.add(new Proj('wave', this.x + this.face * 16, this.y, 'player', atk * 0.9, { vx: this.face * 240, life: 1.2, w: 14, h: 24, color: c, echo: true }));
      if (m.slam) G.world.add(new Proj('wave', this.x - this.face * 16, this.y, 'player', atk * 0.9, { vx: -this.face * 240, life: 1.2, w: 14, h: 24, color: c, echo: true }));
    }
  }

  private thinkArcher(dt: number, mode: string) {
    const b = this.body;
    const t = this.target;
    const atk = echoAtk(G.save, this.inst, G.d) * G.world.commanderAura(this.x, this.y, this);
    const stage = this.inst.stage;
    if (this.state === 'draw') {
      b.vx = approach(b.vx, 0, 900 * dt);
      this.bowDraw = Math.min(1, this.st / 0.5);
      if (t) this.face = sign(t.x - this.x) || this.face;
      if (this.st >= 0.5) {
        this.bowDraw = 0;
        this.state = 'follow';
        this.attackCd = rand(0.65, 0.95);
        if (t && !t.dying) {
          this.shots++;
          const sx = this.x + this.face * 10, sy = this.y - 22;
          const tx = t.x, ty = t.cy;
          const d = Math.hypot(tx - sx, ty - sy) || 1;
          const sp = 380;
          const pierce = stage >= 1 && this.shots % 3 === 0;
          const magic = echoRole(this.inst) === 'mage' || echoRole(this.inst) === 'herald';
          const shot = new Proj(magic ? 'arcbolt' : pierce ? 'word' : 'arrow', sx, sy, 'player', atk * (pierce ? 1.6 : 1), {
            vx: ((tx - sx) / d) * sp, vy: ((ty - sy) / d) * sp - 20, life: pierce ? 0.8 : 2, w: pierce ? 16 : 8, h: pierce ? 24 : 4, color: '#ffe6a8', echo: true,
          });
          shot.target = t;
          G.world.add(shot);
          if (!magic && stage >= 2 && this.shots % 5 === 0) this.rain(t, atk);
          sfx('bowRelease', { pan: G.world.pan(this.x), pitch: 1.2 });
          this.anim.play('release', 0.03, true);
          this.gainXp(1);
        }
      }
      return;
    }
    if (t) {
      const dx = t.x - this.x, dist = Math.abs(dx);
      this.face = sign(dx) || this.face;
      if (this.attackCd <= 0 && dist < this.kit.reach) {
        this.state = 'draw';
        this.st = 0;
        this.anim.play('draw', 0.06, true, 2);
        return;
      }
      if (dist < 70) this.walk(this.x - sign(dx) * 40, 80, dt);
      else if (mode === 'hold') this.walk(this.holdX, 90, dt, 8);
      else if (mode === 'aggressive' && dist > 200) this.walk(t.x, 90, dt, 180);
      else this.follow(dt, 100);
    } else if (mode === 'hold') this.walk(this.holdX, 110, dt, 8);
    else this.follow(dt, 110);
  }

  private rain(t: Entity, atk: number) {
    for (let i = 0; i < 6; i++) {
      G.world.add(new Proj('rain', t.x + rand(-40, 40), t.y - 200 - i * 20, 'player', atk * 0.6, { vx: rand(-10, 10), vy: 300, life: 1.6, w: 6, h: 10, color: '#fff3c4', echo: true }));
    }
    fx.column(t.x, t.y - 120, 40, 60, '#fff3c4', 0.5);
  }

  private walk(tx: number, speed: number, dt: number, stop = 6) {
    const b = this.body;
    const dx = tx - this.x;
    if (Math.abs(dx) < stop) {
      b.vx = approach(b.vx, 0, 900 * dt);
      return;
    }
    const dir = sign(dx);
    b.vx = approach(b.vx, dir * speed, 900 * dt);
    if (b.onGround && wallAhead(b, dir, G.world.grid, G.world.solid)) b.vy = -420;
  }

  private animate(dt: number) {
    const b = this.body;
    const busy = this.move !== null || this.state === 'draw';
    if ((!busy && this.anim.name !== 'release') || (this.anim.name === 'release' && this.anim.done)) {
      if (Math.abs(b.vx) > 12) this.anim.play('walk', 0.15, false, Math.min(2, Math.abs(b.vx) / 60));
      else this.anim.play(this.target && !this.kit.ranged ? this.kit.idle : 'idle', 0.2);
    }
    this.anim.update(dt);
    this.pose = this.anim.sample();
    solve(this.pose, this.kit.dims, b.onGround || this.recallT > 0, this.j);
  }

  /** Summon-assisted combination: follow up Elior's finisher on the same foe. */
  assist(e: Entity) {
    if (this.assistCd > 0 || this.recallT > 0 || this.summonT > 0 || this.move) return;
    this.assistCd = 3.5;
    if (this.kit.ranged) {
      this.attackCd = 0;
      return;
    }
    this.x = e.x - G.world.player.face * (e.body.w / 2 + 14);
    this.y = e.y;
    this.face = G.world.player.face;
    fx.holyBurst(this.x, this.y - 20, 8, 0.6);
    this.target = e;
    const m = this.kit.moves.find((mv) => mv.stun && (mv.minStage ?? 0) <= this.inst.stage) ?? this.kit.moves[0];
    this.begin(m, false);
    this.st = m.T * Math.max(0, m.hitU - 0.25);
  }

  /** Switch: arrive beside a foe already swinging. */
  tagIn(t: Entity | null) {
    this.summonT = 0.25;
    if (!t || this.kit.ranged) {
      if (t) this.attackCd = 0;
      return;
    }
    this.x = t.x - sign(t.x - G.world.player.x || 1) * (t.body.w / 2 + 14);
    this.y = t.y;
    this.face = sign(t.x - this.x) || 1;
    this.target = t;
    fx.column(this.x, this.y, 30, 120, '#fff3c4', 0.6);
    const m = this.kit.moves.reduce((a, b) => (b.mult > a.mult && (b.minStage ?? 0) <= this.inst.stage && !b.blink ? b : a), this.kit.moves[0]);
    this.begin(m, false);
    this.st = m.T * Math.max(0, m.hitU - 0.2);
  }

  gainXp(n: number) {
    const mult = skillRank(G.save, 'c_glory') ? 1.6 : 1;
    if (gainEchoXp(this.inst, n * mult) > 0) {
      this.refreshStats();
      this.hp = this.inst.hp = this.maxHp;
      G.ui.toast(`${this.name} reached level ${this.inst.level}`, 'good');
      fx.holyBurst(this.x, this.y - 30, 12, 0.7);
      sfx('pickup', { pitch: 1.3 });
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.invuln > 0 || this.recallT > 0 || this.summonT > 0.4 || this.despawn > 0) return false;
    // A guard learns from the blows it takes for Elior.
    if (this.order === 'guard' && this.guardXpCd <= 0) {
      this.guardXpCd = 1.5;
      this.gainXp(1);
    }
    const frontal = h.dir !== 0 && sign(h.dir) !== this.face;
    const guard = this.kit.guard + (this.kit.guard > 0 ? this.inst.stage * 0.12 : 0);
    if (frontal && !this.move && Math.random() < guard) {
      sfx('block', { pan: G.world.pan(this.x), vol: 0.7 });
      fx.hitSparks(this.x + this.face * 10, this.y - 24, -this.face, '#fff1c4', 6);
      this.hp -= h.dmg * 0.2;
    } else {
      const unmoved = this.inst.species === 'brute' && this.inst.stage >= 2 ? 0.5 : 1;
      this.hp -= h.dmg * this.kit.armor * unmoved;
      this.flash = 0.12;
      if (this.kit !== KITS.brute) this.body.vx = h.kx * 0.4;
      fx.hitSparks(this.cx, this.cy, h.dir || 1, '#ffe6a8', 5);
      sfx('hit', { pan: G.world.pan(this.x), vol: 0.6 });
    }
    this.inst.hp = this.hp;
    if (this.hp <= 0) {
      this.hp = 0;
      this.inst.hp = 0;
      this.inst.downFor = 25;
      fx.holyBurst(this.cx, this.cy, 20, 1);
      sfx('enemyDie', { pitch: 1.5 });
      G.ui.toast(`${this.name} faded. It will return in 25 seconds.`, 'warn');
      this.remove = true;
      G.world.onEchoFallen(this);
    }
    G.ui.refreshHud();
    return true;
  }

  recall() {
    this.recallT = 0.45;
    this.state = 'follow';
    this.move = null;
    if (skillRank(G.save, 'c_recall')) {
      this.invuln = 2;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
      this.inst.hp = this.hp;
    }
  }

  dismiss() {
    this.despawn = 0.5;
    this.move = null;
    fx.column(this.x, this.y, 30, 80, '#ffe6a8', 0.5);
    this.inst.hp = this.hp;
  }

  syncStrike(t: Entity, mult: number) {
    this.x = t.x - (this.slot % 2 ? 1 : -1) * 28;
    this.y = t.y;
    this.face = sign(t.x - this.x) || 1;
    this.body.vx = this.body.vy = 0;
    fx.column(this.x, this.y, 26, 90, '#fff3c4', 0.5);
    const atk = echoAtk(G.save, this.inst, G.d) * mult;
    t.takeHit({ dmg: atk * 2.5, poise: 60, kx: this.face * 160, ky: -200, dir: this.face, kind: 'echo', src: this, stop: 0.03 });
    fx.slash(t.x, t.cy, 26, -2.2, 0.8, 9, this.face, '#ffffff', '#ffe6a8', 0.25);
    this.gainXp(4);
  }

  draw(ctx: Ctx) {
    const reveal = this.summonT > 0 ? clamp(1 - this.summonT / 1.1, 0, 1) : 1;
    const fade = this.despawn > 0 ? this.despawn / 0.5 : 1;
    const style = this.kit.style(this.inst.stage);
    if (this.kit.ranged) style.bowDraw = this.state === 'draw' ? this.bowDraw : 0;
    // white fire aura
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - this.kit.h * 0.45, this.kit.h * 0.75, this.tempT > 0 ? '#9a6aff' : this.kit.warden ? '#ffd0b0' : '#fff3c4', (this.tempT > 0 ? 0.32 : 0.18) * fade);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    if (reveal < 1) {
      // materialize from the top down
      const h = this.body.h + 20;
      ctx.beginPath();
      ctx.rect(this.x - 50, this.y - h, 100, h * reveal + 2);
      ctx.clip();
    }
    ctx.globalAlpha = (this.recallT > 0 ? 0.5 : 0.95) * fade;
    ctx.translate(this.x, this.y);
    ctx.scale(this.face, 1);
    if (!drawEchoSprite(ctx, this)) {
      // World-space cloth belongs only to the procedural fallback.
      if (this.kit.cape) {
        ctx.save(); ctx.scale(this.face, 1); ctx.translate(-this.x, -this.y);
        drawRibbon(ctx, this.cape, this.kit.cape[0], this.kit.cape[1], this.kit.capeColor(this.inst.stage), '#0a0806');
        ctx.restore();
      }
      this.kit.under?.(ctx, this);
      if (this.kit.body) this.kit.body(ctx, this);
      else drawHumanoid(ctx, this.j, style, G.time + this.id, this.pose.rot, this.body.vx * this.face, this.body.vy);
      this.kit.over?.(ctx, this);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(this.x, this.y); drawEchoRole(ctx, this); ctx.restore();
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.cx, this.cy, 26, '#ffffff', this.flash * 4);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (reveal < 1) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - this.body.h * (1 - reveal), 22, '#ffffff', 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay(ctx: Ctx) {
    if (this.despawn <= 0) {
      const o = this.order;
      const top = this.y - this.body.h - 14;
      if (o) {
        // Its order, as a small mark over its head.
        const c = ORDER_MARK[o];
        ctx.fillStyle = 'rgba(8,6,12,0.75)';
        ctx.beginPath();
        ctx.arc(this.x, top, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (o === 'guard') { ctx.moveTo(this.x - 2.5, top - 2); ctx.lineTo(this.x + 2.5, top - 2); ctx.lineTo(this.x + 2.5, top + 0.5); ctx.lineTo(this.x, top + 3); ctx.lineTo(this.x - 2.5, top + 0.5); ctx.closePath(); }
        else if (o === 'hunt') { ctx.moveTo(this.x - 2.5, top - 2.5); ctx.lineTo(this.x + 2.5, top); ctx.lineTo(this.x - 2.5, top + 2.5); }
        else if (o === 'flank') { ctx.arc(this.x, top, 2.6, -Math.PI * 0.9, Math.PI * 0.4); }
        else if (o === 'hold') { ctx.moveTo(this.x, top - 3); ctx.lineTo(this.x, top + 3); ctx.moveTo(this.x - 2.5, top + 3); ctx.lineTo(this.x + 2.5, top + 3); }
        else { ctx.arc(this.x, top, 2.6, 0, Math.PI * 2); ctx.moveTo(this.x + 0.6, top); ctx.arc(this.x, top, 0.6, 0, Math.PI * 2); }
        ctx.stroke();
      }
      if (o === 'hold') {
        // The post it keeps, marked on the ground.
        ctx.strokeStyle = rgba('#9fd7ff', 0.35 + Math.sin(G.time * 3) * 0.1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(this.holdX, this.holdY, 22, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (G.world.swapPick === this) {
        // Swap destination: a gold chevron bobbing over the Echo Elior would trade places with.
        const y = top - (o ? 12 : 4) + Math.sin(G.time * 6) * 1.5;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this.x, y, 12, '#ffd27a', 0.45);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#ffe6a8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(this.x - 4, y - 3); ctx.lineTo(this.x, y + 1.5); ctx.lineTo(this.x + 4, y - 3);
        ctx.stroke();
      }
    }
    // compact health pip bar, shown when hurt
    if (this.hp < this.maxHp && this.despawn <= 0) {
      const w = 16, x = this.x - w / 2, y = this.y - this.body.h - 8;
      ctx.fillStyle = 'rgba(8,6,12,0.7)';
      ctx.fillRect(x - 0.5, y - 0.5, w + 1, 2.6);
      ctx.fillStyle = '#e8c86a';
      ctx.fillRect(x, y, w * (this.hp / this.maxHp), 1.6);
    }
    if (this.inst.commander || this.kit.warden) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(this.kit.warden ? '#ffb090' : '#ffe6a8', 0.5);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 60, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    lighting.add(this.x, this.y - 20, 70, this.kit.warden ? '#ffd0b0' : '#fff3c4', 0.6, 0.3);
  }
}
