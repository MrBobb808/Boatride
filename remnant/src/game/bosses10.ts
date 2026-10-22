// THE PRINCE OF GRECIA (Chapter X): the fallen prince set over the kingdom of
// Grecia, come forth as Daniel 10:20 foretold, in the image of the he goat of
// Daniel 8: one great horn between his eyes, hooves that never touch the
// ground. Elior withstands him and drives his manifestation back; he does not
// destroy the prince, and the prince never becomes an Echo.
//
// I   The He-Goat from the West: ground-skimming charges told by a red line on
//     the floor (jump or dodge through), horn gores (dodge), sarissa thrusts
//     told by a gold glint (parry), and a leaping horn slam on a marked spot.
// II  In the Fury of His Power: chained charges whose last runs into the wall
//     (he reels: punish), and the ram's two broken horns thrown as boomerangs
//     (gold: parry to shatter them).
// III Four Notable Horns: the great horn breaks and four lesser horns call
//     the four winds in turn: the north wind falls in marked columns (step
//     out), the east wind sweeps low (jump), the south wind rises under Elior
//     (keep moving), the west wind sweeps high (stay down). Spent, he falls
//     exposed.
//
// Telegraph colours: gold = parry it, red = dodge or jump it, wind colours =
// the lanes of the four winds. Everything that warns is drawn in drawOverlay,
// above the lighting and outside the pixel shading, so it reads on a phone.

import { Entity, type HitInfo } from './entity';
import { BossBase } from './bosses2';
import { G } from './ctx';
import { bossScale } from './difficulty';
import { approach, clamp, rand, sign, lerp, choose, easeOutCubic } from '../core/math';
import { glow, capsulePath, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music, TRACKS } from '../audio/music';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { TILE } from './tiles';
import { Chain } from '../render/skeleton';
import { Proj } from './projectiles';

/** The fight's music key (the chapter picks the track; until it exists the Persia theme stands in). */
export const GRECIA_MUSIC = 'grecia';

/** Scratch hit box (no allocation per strike). */
const BOX = { x: 0, y: 0, w: 0, h: 0 };

const C = {
  outl: '#07060a',
  marble: '#e8e3d8', marbleMid: '#c8c2b6', marbleDk: '#948e86', vein: '#9a95a2',
  bronze: '#b98238', bronzeHi: '#f6d184', bronzeDk: '#6a4119', bronzeDeep: '#3e250e',
  fur: '#5d6476', furDk: '#353a4c', furHi: '#a3adc2', hoof: '#1e1916',
  crest: '#a8222c', crestDk: '#5c1018', crestHi: '#ff7462', plume: '#f2eee4',
  linen: '#dcd2bb', linenDk: '#a39a84', leather: '#4a2c1c',
  horn: '#f1e8d2', hornDk: '#a8966c', hornHi: '#fffaf0',
  eye: '#c4e8ff', beard: '#cfcbc2',
  wing: '#ece8e0', wingMid: '#c9c4bb', wingDk: '#9a958e', ash: '#4a4448', ashDk: '#262226',
  sea: '#183444', seaMid: '#2c5a6c', seaHi: '#4f8696', foam: '#d8eff0',
  wood: '#6a4a2a', woodHi: '#a8805a',
  ram: '#d9b8ff', ramDk: '#5a3a86', ramHi: '#fff0c8',
};
const TELL = { parry: '#ffd36b', dodge: '#ff5a46', dodgeHot: '#ffd2c4', calm: '#ffe6a8' };
/** The four winds, in the order he calls them: north, east, south, west. */
const WINDS = [
  { c: '#dff2ff', hint: 'The north wind falls in the marked columns: step out of them.' },
  { c: '#ffb35a', hint: 'The east wind sweeps low across the floor: jump it.' },
  { c: '#78e2c6', hint: 'The south wind rises under your feet: keep moving.' },
  { c: '#c8a6ff', hint: 'The west wind sweeps high: stay on the ground.' },
];

// Shades of the palette, worked out once (shade() is cached, but a constant is free).
const FUR_FAR = '#424858', MARBLE_FAR = '#aaa49a', BRONZE_SIDE = '#8a5f27', WING_FAR = '#b7b2aa', WINGMID_FAR = '#98938b', ASH_FAR = '#333034';

interface GPose { pitch: number; drop: number; crouch: number; tuck: number; arm: number; fore: number; spear: number; farArm: number; farFore: number; head: number; wing: number }
const KEYS = ['pitch', 'drop', 'crouch', 'tuck', 'arm', 'fore', 'spear', 'farArm', 'farFore', 'head', 'wing'] as const;
const P0: GPose = { pitch: 0.05, drop: 0, crouch: 0.2, tuck: 0, arm: 0.2, fore: 0.95, spear: -1.3, farArm: -0.15, farFore: 0.7, head: 0.05, wing: 0.4 };
const pose = (o: Partial<GPose>): GPose => ({ ...P0, ...o });
// Arm angles are measured from straight down, forward positive; the spear's is
// from level forward, down positive; all in the body's own (pitched) frame.
const GP = {
  idle: P0,
  glide: pose({ pitch: 0.16, tuck: 0.25, wing: 0.55 }),
  scrape: pose({ pitch: 0.5, drop: 10, crouch: 0.9, tuck: 0.15, arm: -0.25, fore: 1.55, spear: -0.45, farArm: -0.7, farFore: 0.5, head: 0.35, wing: 0.15 }),
  charge: pose({ pitch: 1.22, drop: 22, crouch: 0.1, tuck: 1, arm: -0.6, fore: 1.3, spear: -1.18, farArm: -1.2, farFore: 0.3, head: -0.22, wing: 0.02 }),
  draw: pose({ pitch: -0.05, drop: 4, crouch: 0.5, arm: -0.75, fore: 2.15, spear: 0.12, farArm: 0.55, farFore: 1.0, head: 0.05, wing: 0.3 }),
  thrust: pose({ pitch: 0.3, drop: 8, crouch: 0.55, arm: 1.32, fore: 0.12, spear: 0.18, farArm: -0.7, farFore: 0.5, head: 0.12, wing: 0.2 }),
  goreTell: pose({ pitch: 0.35, drop: 12, crouch: 0.95, arm: 0.1, fore: 1.2, spear: -1.0, head: 0.75, wing: 0.6 }),
  gore: pose({ pitch: -0.35, drop: 0, crouch: 0.1, tuck: 0.35, arm: 0.45, fore: 0.9, spear: -1.45, farArm: 0.6, head: -0.55, wing: 0.85 }),
  crouch: pose({ pitch: 0.25, drop: 14, crouch: 1, arm: 0, fore: 1.2, spear: -1.2, head: 0.35, wing: 1 }),
  rise: pose({ pitch: -0.1, crouch: 0, tuck: 0.8, arm: 0.3, fore: 0.6, spear: -1.5, head: 0, wing: 1 }),
  dive: pose({ pitch: 1.75, crouch: 0, tuck: 1, arm: -0.6, fore: 0.8, spear: -1.6, farArm: -0.9, head: 0.55, wing: 0.9 }),
  stuck: pose({ pitch: 1.5, drop: 26, crouch: 0.3, tuck: 0.7, arm: -0.2, fore: 1.0, spear: -1.5, farArm: 0.4, head: 0.55, wing: 0.55 }),
  cast: pose({ pitch: -0.1, crouch: 0.3, arm: 0.2, fore: 0.9, farArm: 2.6, farFore: 0.3, head: -0.15, wing: 0.9 }),
  throw: pose({ pitch: 0.22, crouch: 0.4, arm: 0.1, fore: 1.0, farArm: 1.35, farFore: 0.05, head: 0.1, wing: 0.6 }),
  aloft: pose({ pitch: -0.05, crouch: 0, tuck: 0.35, arm: 1.55, fore: 0.35, spear: -1.35, farArm: 2.2, farFore: 0.2, head: -0.25, wing: 1 }),
  reel: pose({ pitch: -0.35, drop: 14, crouch: 1, arm: -0.2, fore: 0.4, spear: -1.0, farArm: -0.3, farFore: 0.2, head: -0.45, wing: 0.1 }),
  kneel: pose({ pitch: 0.45, drop: 20, crouch: 1, arm: 0.3, fore: 0.6, spear: -0.7, farArm: 0.2, farFore: 0.5, head: 0.7, wing: 0.05 }),
  roar: pose({ pitch: -0.3, crouch: 0.4, arm: 0.5, fore: 0.5, spear: -1.4, farArm: 1.8, farFore: 0.4, head: -0.6, wing: 1 }),
};

type GAtk = 'charge' | 'gore' | 'thrust' | 'leap' | 'fury' | 'horns' | 'winds';

/** One marked lane of a wind: a column (north, south) or a sweeping band (east, west). */
interface Lane { on: boolean; wind: number; x: number; w: number; t: number; tele: number; act: number; front: number; dir: number; y0: number; y1: number; hits: Set<number> }
const LANES = 10;
/** Seconds a column of the north or south wind blows. */
const COLUMN_ACT = 0.35;
const SWEEP_SPEED = 640;
/** Column offsets of the north wind: one on Elior, one either side. */
const COLS = [-150, 0, 150];
/** Seconds a thrown ram horn takes out and back. */
const FLIGHT = 1.7;

/** One of the ram's two broken horns, thrown out and called back. Gold-tinged: a parry shatters it. */
export class RamHorn extends Entity {
  hits = new Set<number>();
  t = 0;
  spin = 0;
  back = false;
  x0 = 0;
  constructor(public owner: GreciaPrince, public hy: number, public dir: number, public delay: number, public reach: number) {
    super(owner.x, hy, 22, 16);
    this.layer = 8;
    this.collide = false;
    this.grav = 0;
  }
  get flying() {
    return this.t >= this.delay;
  }
  update(dt: number) {
    const o = this.owner;
    if (o.dying || o.remove || !o.fighting) { this.remove = true; return; }
    dt *= bossScale().tempo * o.encounterTempo;
    this.t += dt;
    this.spin += dt * 13 * this.dir;
    if (!this.flying) {
      // Held aloft beside him while it gathers.
      this.x = o.fhx + this.dir * (this.hy < o.floorY - 20 ? 6 : -6);
      this.y = o.fhy - (this.hy < o.floorY - 20 ? 12 : 0);
      this.x0 = this.x;
      return;
    }
    const u = (this.t - this.delay) / FLIGHT;
    if (u >= 1) { this.remove = true; return; }
    if (!this.back && u >= 0.5) { this.back = true; this.hits.clear(); }
    this.x = lerp(this.x0, o.x, u * u) + this.dir * this.reach * Math.sin(u * Math.PI);
    this.y = lerp(this.y, this.hy - Math.sin(u * Math.PI) * 5, Math.min(1, dt * 12));
    if (Math.random() < dt * 30) fx.spawn(PK.Ember, this.x, this.y, -this.dir * 30, rand(-15, 15), 0.35, 2, 0.4, C.ram, 0, 1);
    BOX.x = this.x - 11; BOX.y = this.y - 8; BOX.w = 22; BOX.h = 16;
    const d = this.back ? -this.dir : this.dir;
    const hit: HitInfo = { dmg: o.dmg * 0.7, poise: 35, kx: d * 220, ky: -170, dir: d, kind: 'proj', src: this, parryable: true };
    G.world.hitPlayerSide(BOX, hit, this.hits);
  }
  parried() {
    fx.shards(this.x, this.y, 14, C.ram, 1.2);
    fx.ring(this.x, this.y, 4, 36, C.ram, 0.3, 2);
    sfx('shatter', { pan: G.world.pan(this.x), vol: 0.8, pitch: 1.2 });
    this.remove = true;
    this.owner.hornParried();
  }
  draw(ctx: Ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 20, C.ramDk, 0.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.spin);
    // A ram's horn: a ridged spiral that thins to its point.
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < 9; k++) {
        const a0 = k * 0.5, a1 = a0 + 0.55;
        const r0 = 10 - a0 * 1.5, r1 = 10 - a1 * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        ctx.lineCap = 'round';
        ctx.lineWidth = pass ? 5.4 - k * 0.5 : 7.2 - k * 0.5;
        ctx.strokeStyle = pass ? (k & 1 ? C.ram : C.ramHi) : C.outl;
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.restore();
    if (!this.flying) this.owner.glint(ctx, x, y - 4, TELL.parry, 0.9);
  }
}

export class GreciaPrince extends BossBase {
  // Wings, sarissa and crest: the art reaches far either side and well above the head.
  pixelBox = [-170, -178, 170, 26] as const;
  atk: GAtk | null = null;
  last: GAtk | null = null;
  n = 0;
  step = 0;
  struck = false;
  /** Seconds the current attack has been told before it first strikes (checked by the browser test). */
  told = 0;
  activeTell = -1;
  lastLaneTell = -1;
  floorY: number;
  wallL = 0;
  wallR = 0;
  pz: GPose = { ...P0 };
  pt: GPose = P0;
  rate = 8;
  beat = 0;
  flapAmp = 0.12;
  /** Height above the floor (leaps, the winds). He is drawn hovering a little above even this. */
  air = 0;
  vx = 0;
  chargeDir = 1;
  chargeTo = 0;
  final = false;
  furyN = 3;
  leapFrom = 0;
  leapTo = 0;
  rams: RamHorn[] = [];
  lanes: Lane[] = [];
  wind = -1;
  windT = 0;
  windSpawned = 0;
  ward = false;
  told4 = false;
  /** 0 whole, 1 cracking, 2 broken: the great horn. */
  horn = 0;
  crack = 0;
  /** Growth of the four lesser horns (0..1). */
  four = 0;
  piece = { on: false, x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, t: 0 };
  since = 0;
  baseKneel = 3.4;
  cape: Chain;
  camF = { x: 0, y: 0 };
  fade = 1;
  driftX = 0;
  /** World positions worked out each step: the far hand (for the ram horns), the horn and spear tips (for tells). */
  fhx = 0; fhy = 0; htx = 0; hty = 0; stx = 0; sty = 0;
  private tx = 0;
  private ty = 0;
  private tip = { told: false, wall: false, ram: false, ward: false };

  constructor(x: number, y: number) {
    super('grecia_prince', x, y, 40, 116, 1250000);
    this.name = 'The Prince of Grecia';
    this.sub = 'I · The He-Goat from the West';
    this.floorY = y;
    this.face = -1;
    this.collide = false;
    this.maxPoise = this.poise = 900;
    this.kneelTime = this.baseKneel;
    this.p2At = 0.66;
    this.p3At = 0.33;
    this.phaseMarks = [0.66, 0.33];
    this.hitColor = '#f4e6c0';
    this.hitSound = 'hitMetal';
    this.cape = new Chain(7, 8, x, y - 86);
    for (let i = 0; i < LANES; i++) this.lanes.push({ on: false, wind: 0, x: 0, w: 0, t: 0, tele: 1, act: 0, front: 0, dir: 1, y0: 0, y1: 0, hits: new Set() });
  }

  get dmg() {
    return 340 * this.ngMul * this.encounterDamage * (this.phase === 3 ? 1.12 : this.phase === 2 ? 1.06 : 1);
  }
  /** Quicker in the fury of his power. */
  get spd() {
    return this.phase === 3 ? 1.15 : this.phase === 2 ? 1.1 : 1;
  }
  get left() {
    return this.wallL + 34;
  }
  get right() {
    return this.wallR - 34;
  }
  get charging() {
    return (this.atk === 'charge' || this.atk === 'fury') && this.step === 1 && this.state === 'attack';
  }
  /** Drawn hovering: the he goat "touched not the ground". */
  get hover() {
    return this.charging ? 9 : 7 + Math.sin(G.time * 2.3) * 2;
  }

  /** The arena's inner walls, found from the tiles at his height (trial arena and throne alike). */
  private scanWalls() {
    const W = G.world, row = Math.floor((this.floorY - 24) / TILE);
    const c0 = clamp(Math.floor(this.x / TILE), 1, W.grid.w - 2);
    let l = c0, r = c0;
    while (l > 0 && !W.solid(W.grid.get(l - 1, row))) l--;
    while (r < W.grid.w - 1 && !W.solid(W.grid.get(r + 1, row))) r++;
    this.wallL = l * TILE;
    this.wallR = (r + 1) * TILE;
  }

  hurtbox() {
    if (this.charging) return { x: this.x - 36, y: this.y - 52, w: 72, h: 50 };
    const low = this.state === 'kneel' || this.state === 'dead' ? 30 : 0;
    const h = this.body.h - low;
    return { x: this.x - this.body.w / 2, y: this.y - h, w: this.body.w, h };
  }
  get cy() {
    return this.y - 58;
  }
  canBeTargeted() {
    return super.canBeTargeted() && !this.ward;
  }

  // ------------------------------------------------------------ lifecycle
  awaken() {
    super.awaken();
    this.scanWalls();
  }
  updateDormant(_dt: number) {
    this.pt = GP.idle;
  }

  updateIntro(_dt: number) {
    const t = this.st;
    this.camF.x = this.x - 20;
    this.camF.y = this.floorY - 90;
    G.camera.focus = this.camF;
    if (!this.wallR) this.scanWalls();
    if (t < 0.6) {
      this.pt = GP.kneel;
      this.flapAmp = 0.03;
    } else if (this.introT === 0) {
      this.introT = 1;
      sfx('princeHorn', { vol: 0.8, pitch: 0.85 });
      sfx('wingbeat', { vol: 0.9, pitch: 0.55 });
      sfx('stormGust', { vol: 0.7 });
    } else if (t < 1.7) {
      this.pt = GP.roar;
      this.flapAmp = 0.2;
      this.air = approach(this.air, 26, _dt * 40);
    } else if (this.introT === 1) {
      this.introT = 2;
      sfx('monarchRoar', { vol: 1, pitch: 0.8 });
      sfx('thunder', { vol: 0.8 });
      sfx('bossSlam', { vol: 0.8, pitch: 0.6 });
      G.camera.addTrauma(0.75 * shakeScale());
      G.camera.punch = 0.06;
      fx.flash('#dff2ff', 0.3);
      fx.ring(this.x, this.floorY - 2, 10, 300, '#dff2ff', 0.6, 5, 0.25);
      fx.dust(this.x, this.floorY, 28, 2.6);
      G.ui.banner('THE PRINCE OF GRECIA', 'The prince of the kingdom of Grecia', 'boss');
      G.ui.caption('an he goat came from the west on the face of the whole earth, and touched not the ground', 'Daniel 8:5 (KJV)');
      G.world.after(4.5, () => { if (!this.dying) G.ui.caption(null); });
    } else if (t > 2.3) {
      this.pt = GP.idle;
      this.flapAmp = 0.12;
      this.air = approach(this.air, 0, _dt * 30);
    }
    if (t > 3.5) {
      this.air = 0;
      this.beginFight();
      G.camera.viewMultTarget = 1.2;
      music.play(TRACKS[GRECIA_MUSIC] ? GRECIA_MUSIC : 'persia', 0.6);
      music.phase = 0;
      this.cd = 1.0;
    }
  }

  updateKneel(dt: number) {
    this.updateLanes(dt);
    this.pt = this.wallHitT > 0 ? GP.reel : GP.kneel;
    this.flapAmp = 0.02;
    this.air = approach(this.air, 0, dt * 400);
    this.wallHitT = Math.max(0, this.wallHitT - dt);
  }
  wallHitT = 0;

  onKneel() {
    this.atk = null;
    this.step = 0;
    this.ward = false;
    this.vx = 0;
  }

  recover() {
    super.recover();
    this.kneelTime = this.baseKneel;
    this.cd = this.phase === 3 ? 0.6 : 0.8;
  }

  beginTransition() {
    this.toTransition();
  }
  enterPhase3() {
    this.phase = 3;
    this.toTransition();
    G.inCutscene = true;
    G.ui.cinematicBars(true);
  }
  private toTransition() {
    this.state = 'transition';
    this.st = 0;
    this.introT = 0;
    this.atk = null;
    this.ward = false;
    this.invuln = 999;
    this.vx = 0;
    this.poise = this.maxPoise;
    this.staggered = 0;
    this.clearHazards();
  }

  updateTransition(dt: number) {
    const t = this.st;
    if (this.phase === 1) {
      // In the fury of his power.
      this.pt = t < 1.3 ? GP.roar : GP.scrape;
      this.flapAmp = 0.25;
      this.air = approach(this.air, t < 1.2 ? 30 : 0, dt * 60);
      if (this.introT === 0 && t > 0.35) {
        this.introT = 1;
        sfx('monarchRoar', { vol: 1, pitch: 0.95 });
        sfx('stormGust', { vol: 0.9, pitch: 0.8 });
        G.camera.addTrauma(0.6 * shakeScale());
        fx.ring(this.x, this.y - 50, 10, 240, TELL.dodge, 0.5, 4);
        music.phase = 1;
        G.ui.banner('IN THE FURY OF HIS POWER', 'The last charge strikes the wall · the ram’s horns come back', 'boss');
        G.ui.caption('and ran unto him in the fury of his power', 'Daniel 8:6 (KJV)');
        G.world.after(4, () => { if (!this.dying) G.ui.caption(null); });
      }
      if (t > 1.9) {
        this.phase = 2;
        this.invuln = 0;
        this.air = 0;
        this.sub = 'II · In the Fury of His Power';
        G.ui.bossBar(this.name, this.sub);
        this.state = 'idle';
        this.st = 0;
        this.start('fury');
      }
      return;
    }
    // The great horn is broken; four come up for it.
    this.camF.x = this.x;
    this.camF.y = this.floorY - 100;
    G.camera.focus = this.camF;
    const tier = G.renderer.tier;
    if (t < 1.4) {
      this.pt = GP.roar;
      this.flapAmp = 0.3;
      this.air = approach(this.air, 40, dt * 50);
      this.horn = 1;
      this.crack = clamp((t - 0.5) / 0.9, 0, 1);
      if (this.introT === 0) {
        this.introT = 1;
        sfx('beamCharge', { vol: 0.8, pitch: 0.7 });
      }
      if (this.introT === 1 && t > 0.6) {
        this.introT = 2;
        G.world.slowmo(0.9, 0.3);
        sfx('stoneCrack', { vol: 1, pitch: 0.8 });
      }
    } else if (this.introT === 2) {
      // The crack.
      this.introT = 3;
      this.horn = 2;
      this.crack = 0;
      sfx('shatter', { vol: 1, pitch: 0.6 });
      sfx('thunder', { vol: 1 });
      sfx('bossSlam', { vol: 0.9, pitch: 0.5 });
      fx.flash('#ffffff', 0.85);
      G.camera.addTrauma(1 * shakeScale());
      G.camera.punch = 0.1;
      G.world.hitstop(0.14);
      this.headPoint(14, -36);
      fx.shards(this.tx, this.ty, tier >= 2 ? 26 : 14, C.horn, 1.6);
      fx.ring(this.tx, this.ty, 6, 160, '#ffffff', 0.5, 4);
      const pc = this.piece;
      pc.on = true; pc.x = this.tx; pc.y = this.ty; pc.vx = -this.face * 60; pc.vy = -260; pc.a = -1; pc.va = -this.face * 9; pc.t = 0;
    } else if (t < 3.2) {
      this.pt = GP.aloft;
      this.four = clamp((t - 1.6) / 1.2, 0, 1);
      if (this.introT === 3 && t > 1.7) {
        this.introT = 4;
        this.headPoint(4, -18);
        for (let k = 0; k < 4; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 2;
          fx.streak(this.tx, this.ty, this.tx + Math.cos(a) * 180, this.ty + Math.sin(a) * 180, WINDS[k].c, 0.5, 3);
        }
        sfx('bell', { vol: 0.8, pitch: 0.7 });
        sfx('stormGust', { vol: 1 });
        music.phase = 2;
        G.ui.banner('FOUR NOTABLE HORNS', 'Survive the four winds; then he falls exposed', 'boss');
        G.ui.caption('the great horn was broken; and for it came up four notable ones toward the four winds of heaven', 'Daniel 8:8 (KJV)');
        G.world.after(5, () => { if (!this.dying) G.ui.caption(null); });
      }
    } else {
      this.four = 1;
      this.invuln = 0;
      this.sub = 'III · Four Notable Horns toward the Four Winds';
      G.ui.bossBar(this.name, this.sub);
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      this.maxPoise = this.poise = 700;
      this.state = 'idle';
      this.st = 0;
      this.start('winds');
    }
  }

  die() {
    this.clearHazards();
    super.die();
    this.atk = null;
    this.ward = false;
    this.introT = 0;
    G.ui.caption(null);
  }

  /** Driven back, not destroyed: the four horns scatter to the winds and the storm carries his form away west. */
  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    this.camF.x = this.x;
    this.camF.y = this.floorY - 80;
    G.camera.focus = this.camF;
    this.air = approach(this.air, t < 1 ? 20 : 8, dt * 40);
    this.pt = t < 1 ? GP.reel : GP.kneel;
    this.flapAmp = t < 1 ? 0.3 : 0.05;
    if (this.introT === 0 && t > 0.1) {
      this.introT = 1;
      sfx('monarchRoar', { vol: 0.9, pitch: 0.7 });
    }
    if (this.introT === 1 && t > 1) {
      this.introT = 2;
      this.headPoint(4, -18);
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 2;
        fx.streak(this.tx, this.ty, this.tx + Math.cos(a) * 260, this.ty + Math.sin(a) * 260, WINDS[k].c, 0.7, 3);
      }
      this.four = 0;
      if (this.horn !== 2) this.horn = 2;
      sfx('stormGust', { vol: 1, pitch: 0.7 });
      sfx('bell', { vol: 0.7, pitch: 0.5 });
      fx.flash('#dff2ff', 0.4);
      G.camera.addTrauma(0.5 * shakeScale());
    }
    if (t > 1.2) {
      // The wind takes him the way he came: west.
      this.driftX = approach(this.driftX, -90, dt * 70);
      this.x += this.driftX * dt;
      this.fade = approach(this.fade, 0, dt * 0.5);
      const tier = G.renderer.tier;
      if (Math.random() < dt * (tier >= 2 ? 40 : 16)) fx.spawn(PK.Smoke, this.x + rand(-30, 30), this.y - rand(10, 110), rand(-80, -30), rand(-30, 10), rand(1, 1.6), 4, 14, Math.random() < 0.5 ? C.sea : C.fur, 0, 1);
      if (Math.random() < dt * (tier >= 2 ? 24 : 10)) fx.spawn(PK.Spark, this.x + rand(-40, 40), this.y - rand(40, 110), rand(-90, -20), rand(-20, 30), rand(0.8, 1.4), 2, 1, C.wing, 60, 1);
    }
    if (t > 3.4 && !this.remove) {
      this.remove = true;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ hits
  takeHit(h: HitInfo): boolean {
    if (this.ward) {
      if (!h.dot) {
        // High in the winds: blows glance off.
        sfx('clash', { pan: G.world.pan(this.x), vol: 0.4, pitch: rand(1.2, 1.5), gap: 90 });
        fx.hitSparks(h.px ?? this.x, h.py ?? this.cy, -(h.dir || 1), WINDS[Math.max(0, this.wind)].c, 5, 0.8);
        if (!this.tip.ward) {
          this.tip.ward = true;
          G.ui.toast('He rides the four winds: nothing reaches him there. Survive them.', 'info');
        }
      }
      return false;
    }
    const threshold = this.phase === 1 ? this.p2At : this.phase === 2 ? this.p3At : 0;
    // The great horn broken, he is weakened.
    let dmg = h.dmg * (this.horn === 2 && !h.dot ? 1.15 : 1);
    if (threshold && this.fighting) {
      // Phase marks hold even against enormous blows and burns.
      const allowed = Math.max(1, this.hp - Math.ceil(this.maxHp * threshold) + 1);
      dmg = Math.min(dmg, allowed / (!h.dot && this.state === 'kneel' ? 1.5 : 1));
    }
    const hit = super.takeHit(dmg === h.dmg ? h : { ...h, dmg });
    if (hit && this.fighting && threshold && this.hp < this.maxHp * threshold) {
      if (this.phase === 1) this.beginTransition();
      else this.enterPhase3();
    }
    return hit;
  }

  /** A perfect parry of a sarissa thrust breaks the string. */
  parried() {
    if (this.state !== 'attack' || this.ward) return;
    this.poise -= 260;
    this.staggerFlash = 0.3;
    sfx('stagger', { pitch: 0.8, vol: 0.7 });
    fx.hitSparks(this.stx, this.sty, -this.face, TELL.parry, 14, 1.2);
    if (this.poise <= 0) { this.kneel(); return; }
    this.atk = null;
    this.state = 'idle';
    this.st = 0;
    this.cd = 1.1;
    this.pz.pitch -= 0.3;
  }

  /** A ram horn turned aside shakes him too. */
  hornParried() {
    if (!this.fighting || this.state === 'kneel') return;
    this.poise -= 150;
    this.staggerFlash = 0.2;
    if (this.poise <= 0) this.kneel();
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    if (!this.wallR) this.scanWalls();
    this.updateLanes(dt);
    if (this.state === 'idle') {
      const p = G.world.player;
      this.facePlayer();
      this.ward = false;
      this.air = approach(this.air, 0, dt * 300);
      // A spear's length away: inside the sarissa, outside Elior's blade.
      const want = clamp(p.x + sign(this.x - p.x || 1) * 105, this.left, this.right);
      const dx = want - this.x;
      this.vx = approach(this.vx, Math.abs(dx) > 8 ? sign(dx) * 150 * this.spd : 0, dt * 600);
      this.x = clamp(this.x + this.vx * dt, this.left, this.right);
      this.pt = Math.abs(this.vx) > 40 ? GP.glide : GP.idle;
      this.flapAmp = 0.12;
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(Math.abs(p.x - this.x));
      return;
    }
    this.runAttack(dt);
  }

  facePlayer() {
    const p = G.world.player;
    if (Math.abs(p.x - this.x) > 6) this.face = p.x < this.x ? -1 : 1;
  }

  private choose(dist: number) {
    if (this.phase === 3 && this.since >= 2) return this.start('winds');
    let pool: GAtk[];
    if (this.phase === 1) pool = dist > 190 ? ['charge', 'leap', 'charge', 'thrust'] : dist < 125 ? ['thrust', 'gore', 'thrust', 'leap'] : ['thrust', 'charge', 'gore', 'leap'];
    else pool = dist > 190 ? ['fury', 'horns', 'charge', 'leap'] : dist < 125 ? ['thrust', 'gore', 'horns', 'fury'] : ['fury', 'horns', 'thrust', 'gore', 'leap'];
    let k = choose(pool);
    if (k === this.last) k = choose(pool);
    this.start(k);
  }

  start(k: GAtk) {
    this.atk = k;
    this.last = k;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.n = 0;
    this.struck = false;
    this.final = false;
    this.told = 0;
    this.activeTell = -1;
    this.hitSet.clear();
    this.vx = 0;
    this.facePlayer();
    this.since = k === 'winds' ? 0 : this.since + 1;
    const pan = G.world.pan(this.x);
    if (k === 'charge' || k === 'fury') {
      this.furyN = this.phase >= 3 ? 4 : 3;
      this.aimCharge(k === 'fury' && this.furyN === 1);
      sfx('galeCharge', { pan, vol: 0.6, pitch: 0.6 });
      if (!this.tip.told) {
        this.tip.told = true;
        G.ui.toast('Red line: he charges low along it. Jump it or dodge through.', 'warn');
      }
    }
    if (k === 'thrust') sfx('swingSpear', { pan, vol: 0.5, pitch: 0.7 });
    if (k === 'gore') sfx('monarchRoar', { pan, vol: 0.45, pitch: 1.3 });
    if (k === 'leap') sfx('wingbeat', { pan, vol: 0.9, pitch: 0.6 });
    if (k === 'horns') {
      sfx('princeHorn', { pan, vol: 0.6, pitch: 1.2 });
      this.throwRams();
    }
    if (k === 'winds') {
      this.wind = -1;
      this.windT = 0;
      this.ward = true;
      sfx('stormGust', { vol: 0.9, pitch: 0.7 });
    }
  }

  private end(cd: number) {
    this.state = 'idle';
    this.atk = null;
    this.st = 0;
    this.step = 0;
    this.cd = (cd + rand(0, 0.2)) / this.spd;
  }

  /** Point the next charge: toward Elior, to the far side (or, at the end of a fury, into the wall). */
  private aimCharge(final: boolean) {
    this.facePlayer();
    this.chargeDir = this.face;
    this.final = final;
    this.chargeTo = final ? (this.face > 0 ? this.wallR - 24 : this.wallL + 24) : this.face > 0 ? this.right - 10 : this.left + 10;
    this.hitSet.clear();
  }

  private runAttack(dt: number) {
    const t = this.st;
    const f = this.face;
    const W = G.world;
    switch (this.atk) {
      case 'charge':
      case 'fury': {
        const fury = this.atk === 'fury';
        const tell = this.final ? 0.75 : fury ? (this.n === 0 ? 0.62 : 0.45) : this.phase === 1 ? 0.85 : 0.65;
        if (this.step === 0) {
          // Head down, a hoof pawing the air: the line burns along the floor.
          this.pt = GP.scrape;
          this.flapAmp = 0.05;
          this.told += dt;
          if (Math.random() < dt * 30) fx.dust(this.x - f * 22, this.floorY, 1, 0.9);
          if (t >= tell) {
            this.step = 1;
            this.st = 0;
            if (this.activeTell < 0) this.activeTell = this.told;
            this.hitSet.clear();
            this.vx = 0;
            sfx('stormGust', { pan: W.pan(this.x), vol: 0.9, pitch: 1.2 });
            sfx('whoosh', { pan: W.pan(this.x), vol: 1, pitch: 0.6 });
            fx.ring(this.x, this.floorY - 20, 6, 60, C.foam, 0.25, 2, 0.4);
          }
          break;
        }
        if (this.step === 1) {
          // Skimming the floor faster than sight: horn and body low, jumpable.
          this.pt = GP.charge;
          this.flapAmp = 0;
          const d = this.chargeDir;
          this.vx = approach(this.vx, d * 820 * (this.phase >= 2 ? 1.08 : 1), dt * 5200);
          this.x += this.vx * dt;
          BOX.x = this.x - 34; BOX.y = this.floorY - 36; BOX.w = 68; BOX.h = 36;
          const hit: HitInfo = { dmg: this.dmg * 1.2, poise: 70, kx: d * 420, ky: -260, dir: d, kind: 'melee', src: this, unblockable: true, parryable: false };
          if (W.hitPlayerSide(BOX, hit, this.hitSet)) {
            W.hitstop(0.07);
            G.camera.addTrauma(0.35 * shakeScale());
          }
          if (Math.random() < dt * 60) fx.dust(this.x - d * 30, this.floorY, 1, 1.4, '#9aa4ac');
          if (Math.random() < dt * 40) fx.spawn(PK.Spark, this.x + rand(-20, 20), this.y - rand(10, 40), -d * rand(120, 260), 0, 0.25, 2, 0.5, C.foam, 0, 1);
          if (d > 0 ? this.x >= this.chargeTo : this.x <= this.chargeTo) {
            this.x = this.chargeTo;
            this.vx = 0;
            if (this.final) { this.wallImpact(); return; }
            this.step = 2;
            this.st = 0;
            fx.dust(this.x, this.floorY, 8, 1.6);
          }
          break;
        }
        // Wheeling about.
        this.pt = GP.glide;
        if (fury && this.n < this.furyN - 1 && t > 0.24) {
          this.n++;
          this.step = 0;
          this.st = 0;
          this.aimCharge(this.n === this.furyN - 1);
          sfx('galeCharge', { pan: W.pan(this.x), vol: 0.5, pitch: 0.7 + this.n * 0.1 });
        } else if (!fury && t > 0.55) this.end(0.8);
        break;
      }
      case 'gore': {
        const tell = this.phase === 1 ? 0.6 : 0.5;
        if (t < tell) {
          this.pt = GP.goreTell;
          this.told += dt;
          this.facePlayer();
        } else if (t < tell + 0.26) {
          if (!this.struck) {
            this.struck = true;
            if (this.activeTell < 0) this.activeTell = this.told;
            sfx('bossSweep', { pan: W.pan(this.x), vol: 0.9, pitch: 1.1 });
            fx.slash(this.x + f * 40, this.y - 70, 52, 1.2, -1.4, 7, f, '#ffffff', TELL.dodge, 0.2);
          }
          this.pt = GP.gore;
          this.rate = 16;
          this.x = clamp(this.x + f * 220 * dt, this.left, this.right);
          this.strike(f > 0 ? this.x : this.x - 80, this.floorY - 128, 80, 120, 1.1, { kx: f * 200, ky: -460, poise: 70, unblockable: true, parryable: false });
        } else {
          this.rate = 8;
          this.pt = GP.idle;
          if (t > tell + 0.85) this.end(0.7);
        }
        break;
      }
      case 'thrust': {
        // A string of sarissa thrusts, each told by a glint at the point. Parry them.
        const count = this.phase === 1 ? 2 : 3;
        const first = this.phase === 1 ? 0.55 : 0.48, each = this.phase === 1 ? 0.5 : 0.42;
        const at = first + this.n * each;
        if (this.n >= count) {
          this.pt = GP.idle;
          if (t > at + 0.35) this.end(0.6);
          break;
        }
        if (t < at - 0.06) {
          this.pt = GP.draw;
          this.rate = 12;
          this.told += dt;
          if (this.n > 0 && Math.abs(G.world.player.x - this.x) > 90) this.x = clamp(this.x + f * 60 * dt, this.left, this.right);
        } else if (t < at + 0.12) {
          if (!this.struck) {
            this.struck = true;
            this.hitSet.clear();
            if (this.activeTell < 0) this.activeTell = this.told;
            sfx('spearThrust', { pan: W.pan(this.x), vol: 0.9, pitch: rand(0.85, 1) });
            this.x = clamp(this.x + f * 14, this.left, this.right);
            fx.streak(this.x + f * 30, this.floorY - 36, this.x + f * 140, this.floorY - 32, TELL.parry, 0.14, 2);
          }
          this.pt = GP.thrust;
          this.rate = 24;
          this.strike(f > 0 ? this.x + 18 : this.x - 140, this.floorY - 60, 122, 44, 0.7, { kx: f * 200, ky: -120, poise: 35, parryable: true });
        } else {
          this.n++;
          this.struck = false;
        }
        break;
      }
      case 'leap': {
        const tell = 0.55;
        if (this.step === 0) {
          this.pt = GP.crouch;
          this.told += dt;
          this.flapAmp = 0.2;
          if (t < 0.4) this.leapTo = clamp(G.world.player.x, this.left, this.right);
          if (t >= tell) {
            this.step = 1;
            this.st = 0;
            this.leapFrom = this.x;
            this.face = sign(this.leapTo - this.x) || this.face;
            sfx('wingbeat', { pan: W.pan(this.x), vol: 1, pitch: 0.5 });
            fx.dust(this.x, this.floorY, 10, 1.8);
          }
        } else if (this.step === 1) {
          // Up, and over the mark.
          const u = clamp(t / 0.5, 0, 1);
          this.pt = GP.rise;
          this.x = lerp(this.leapFrom, this.leapTo, easeOutCubic(u));
          this.air = Math.sin(u * Math.PI / 2) * 150;
          this.told += dt;
          if (u >= 1) { this.step = 2; this.st = 0; }
        } else if (this.step === 2) {
          // The turn in the air, horn down.
          this.pt = GP.dive;
          this.rate = 10;
          this.told += dt;
          if (t > 0.22) { this.step = 3; this.st = 0; }
        } else if (this.step === 3) {
          this.air = Math.max(0, this.air - dt * 1100);
          if (this.air <= 0) {
            this.step = 4;
            this.st = 0;
            if (this.activeTell < 0) this.activeTell = this.told;
            this.hitSet.clear();
            sfx('bossSlam', { pan: W.pan(this.x), vol: 1, pitch: 0.7 });
            sfx('stoneCrack', { pan: W.pan(this.x), vol: 0.6 });
            G.camera.addTrauma(0.6 * shakeScale());
            W.hitstop(0.06);
            fx.ring(this.x, this.floorY - 2, 6, 120, '#dff2ff', 0.4, 4, 0.25);
            fx.dust(this.x, this.floorY, 22, 2.2);
            fx.shards(this.x + f * 20, this.floorY - 4, 10, '#a49c8a', 1);
            this.strike(this.x - 70, this.floorY - 62, 140, 62, 1.4, { kx: 0, ky: -380, poise: 80, unblockable: true, parryable: false });
          }
        } else {
          // Horn driven into the stones: open for a moment.
          this.pt = GP.stuck;
          this.rate = 14;
          if (t > 0.95) { this.rate = 8; this.end(0.6); }
        }
        break;
      }
      case 'horns': {
        this.pt = t < 0.7 ? GP.cast : GP.throw;
        this.flapAmp = 0.15;
        if (t < 0.7) this.told += dt;
        else if (this.activeTell < 0) {
          this.activeTell = this.told;
          sfx('swingHeavy', { pan: W.pan(this.x), vol: 0.9, pitch: 0.7 });
        }
        if (t > 1.6) this.end(0.9);
        break;
      }
      case 'winds':
        this.runWinds(dt);
        break;
    }
  }

  /** A blow on the player's side through the scratch box. */
  private strike(x: number, y: number, w: number, h: number, mul: number, extra: Partial<HitInfo>) {
    const p = G.world.player;
    BOX.x = x; BOX.y = y; BOX.w = w; BOX.h = h;
    const dir = sign(p.x - this.x) || this.face;
    const hit: HitInfo = { dmg: this.dmg * mul, poise: 45, kx: dir * 240, ky: -200, dir, kind: 'melee', src: this, parryable: false };
    Object.assign(hit, extra);
    return G.world.hitPlayerSide(BOX, hit, this.hitSet);
  }

  /** The end of a fury: into the wall, and he reels. */
  private wallImpact() {
    const W = G.world;
    const wx = this.chargeDir > 0 ? this.wallR : this.wallL;
    sfx('wallBreak', { pan: W.pan(wx), vol: 1 });
    sfx('bossSlam', { pan: W.pan(wx), vol: 1, pitch: 0.55 });
    G.camera.addTrauma(0.9 * shakeScale());
    G.camera.punch = 0.08;
    W.hitstop(0.12);
    fx.flash('#ffffff', 0.25);
    fx.shards(wx, this.floorY - 50, G.renderer.tier >= 2 ? 22 : 12, '#a49c8a', 1.6);
    fx.dust(wx - this.chargeDir * 10, this.floorY - 30, 18, 2.4);
    fx.ring(wx, this.floorY - 50, 6, 90, '#ffffff', 0.35, 3);
    this.x = clamp(this.x - this.chargeDir * 18, this.wallL + 24, this.wallR - 24);
    this.wallHitT = 0.9;
    this.kneelTime = 3.6;
    this.kneel();
    if (!this.tip.wall) {
      this.tip.wall = true;
      G.ui.toast('He struck the wall and reels. Strike now!', 'good');
    }
  }

  /** The ram's two broken horns: one skims low (jump or parry), one flies at the chest (dodge or parry). */
  private throwRams() {
    for (const r of this.rams) r.remove = true;
    this.rams.length = 0;
    const f = this.face;
    const low = new RamHorn(this, this.floorY - 13, f, 0.7, 330);
    const high = new RamHorn(this, this.floorY - 27, f, 1.1, 300);
    this.rams.push(low, high);
    G.world.add(low);
    G.world.add(high);
    if (!this.tip.ram) {
      this.tip.ram = true;
      G.ui.toast('The ram’s broken horns come back to him. Gold: parry them to shatter them.', 'warn');
    }
  }

  // ------------------------------------------------------------ the four winds
  private runWinds(dt: number) {
    const t = this.st;
    const mid = (this.left + this.right) * 0.5;
    if (this.step === 0) {
      // Up over the middle of the arena.
      this.pt = GP.aloft;
      this.flapAmp = 0.22;
      this.ward = true;
      this.x = approach(this.x, mid, dt * 420);
      this.air = approach(this.air, 118, dt * 220);
      this.face = G.world.player.x < this.x ? -1 : 1;
      if (t > 0.9) {
        this.step = 1;
        this.st = 0;
        this.wind = -1;
        this.nextWind();
        if (!this.told4) {
          this.told4 = true;
          G.ui.toast('Four winds, then he falls exposed. Read each lane and survive it.', 'warn');
        }
      }
      return;
    }
    if (this.step === 1) {
      this.pt = GP.aloft;
      this.ward = true;
      this.air = 118 + Math.sin(G.time * 2) * 4;
      this.face = G.world.player.x < this.x ? -1 : 1;
      this.windT += dt;
      // The south wind rises three times, each under where Elior stands.
      if (this.wind === 2 && this.windSpawned < 3 && this.windT >= this.windSpawned * 0.5) this.spawnGeyser();
      let any = false;
      for (const l of this.lanes) if (l.on) { any = true; break; }
      if (!any && (this.wind !== 2 || this.windSpawned >= 3) && this.windT > 0.4) {
        if (this.wind < 3) this.nextWind();
        else { this.step = 2; this.st = 0; this.wind = -1; sfx('stormGust', { vol: 0.6, pitch: 0.5 }); }
      }
      return;
    }
    // Spent: he falls, exposed.
    this.pt = GP.reel;
    this.air = Math.max(0, this.air - dt * 520);
    if (this.air <= 0) {
      this.ward = false;
      sfx('bossSlam', { vol: 0.9, pitch: 0.65 });
      G.camera.addTrauma(0.5 * shakeScale());
      fx.dust(this.x, this.floorY, 20, 2);
      this.kneelTime = 4.6;
      this.kneel();
      G.ui.toast('The four winds are spent. He falls exposed: strike!', 'good');
    }
  }

  private nextWind() {
    this.wind++;
    this.windT = 0;
    this.windSpawned = 0;
    const k = this.wind, p = G.world.player;
    if (this.cycleTips < 4) {
      this.cycleTips++;
      G.ui.toast(WINDS[k].hint, 'warn');
    }
    sfx('stormGust', { vol: 0.9, pitch: 0.8 + k * 0.12 });
    sfx('bell', { vol: 0.35, pitch: 0.5 + k * 0.15 });
    if (k === 0) {
      // North: three columns fall, one on Elior; the gaps between are safe.
      const c = clamp(p.x, this.left, this.right);
      for (const dx of COLS) this.lane(0, clamp(c + dx, this.left, this.right), 64, 1.05, COLUMN_ACT, this.floorY - 260, this.floorY, 0);
    } else if (k === 1) {
      // East: a low band sweeps from the east wall.
      this.lane(1, this.wallR, 52, 0.9, 0, this.floorY - 30, this.floorY, -1);
    } else if (k === 3) {
      // West: a high band sweeps from the west wall, over a grounded Elior's head.
      this.lane(3, this.wallL, 52, 0.9, 0, this.floorY - 140, this.floorY - 44, 1);
    }
  }
  cycleTips = 0;

  private spawnGeyser() {
    const p = G.world.player;
    this.windSpawned++;
    this.lane(2, clamp(p.x + p.body.vx * 0.25, this.left, this.right), 58, 0.7, 0.3, this.floorY - 230, this.floorY, 0);
  }

  private lane(wind: number, x: number, w: number, tele: number, act: number, y0: number, y1: number, dir: number) {
    for (const l of this.lanes) {
      if (l.on) continue;
      l.on = true; l.wind = wind; l.x = x; l.w = w; l.t = 0; l.tele = tele; l.act = act; l.front = x; l.dir = dir; l.y0 = y0; l.y1 = y1;
      l.hits.clear();
      return;
    }
  }

  private updateLanes(dt: number) {
    const W = G.world;
    for (const l of this.lanes) {
      if (!l.on) continue;
      l.t += dt;
      if (l.t < l.tele) continue;
      if (l.dir) {
        // A sweeping band: the front carries the blow.
        if (l.t - dt < l.tele) sfx('stormGust', { pan: W.pan(l.front), vol: 1, pitch: l.wind === 1 ? 1.1 : 0.7 });
        l.front += l.dir * SWEEP_SPEED * dt;
        if (l.dir > 0 ? l.front > this.wallR + 30 : l.front < this.wallL - 30) { l.on = false; continue; }
        BOX.x = l.front - l.w / 2; BOX.y = l.y0; BOX.w = l.w; BOX.h = l.y1 - l.y0;
        const hit: HitInfo = { dmg: this.dmg * 0.9, poise: 50, kx: l.dir * 360, ky: -200, dir: l.dir, kind: 'proj', src: this, unblockable: true, parryable: false };
        if (W.hitPlayerSide(BOX, hit, l.hits)) this.lastLaneTell = l.tele;
        if (Math.random() < dt * 50) fx.spawn(PK.Spark, l.front + rand(-20, 20), rand(l.y0, l.y1), l.dir * rand(200, 380), rand(-20, 20), 0.3, 2, 0.5, WINDS[l.wind].c, 0, 1);
        continue;
      }
      if (l.t - dt < l.tele) {
        // A column blows.
        sfx(l.wind === 0 ? 'thunder' : 'stormGust', { pan: W.pan(l.x), vol: l.wind === 0 ? 0.55 : 0.8, pitch: l.wind === 0 ? 1.3 : 1.2, gap: 60 });
        fx.dust(l.x, this.floorY, 8, 1.4, '#9aa4ac');
        fx.ring(l.x, this.floorY - 2, 4, l.w * 0.8, WINDS[l.wind].c, 0.3, 2, 0.3);
      }
      if (l.t > l.tele + l.act) { l.on = false; continue; }
      BOX.x = l.x - l.w / 2; BOX.y = l.y0; BOX.w = l.w; BOX.h = l.y1 - l.y0;
      const p = W.player;
      const hit: HitInfo = { dmg: this.dmg * (l.wind === 0 ? 1 : 0.9), poise: 50, kx: sign(p.x - l.x || 1) * 160, ky: l.wind === 2 ? -560 : -120, dir: 0, kind: 'hazard', src: this, unblockable: true };
      if (W.hitPlayerSide(BOX, hit, l.hits)) this.lastLaneTell = l.tele;
    }
  }

  private clearHazards() {
    for (const l of this.lanes) l.on = false;
    for (const r of this.rams) r.remove = true;
    this.rams.length = 0;
    this.wind = -1;
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    const a = 1 - Math.exp(-dt * this.rate);
    const p = this.pz, t = this.pt;
    for (const k of KEYS) p[k] += (t[k] - p[k]) * a;
    this.beat += dt * (this.ward ? 7 : 4.2);
    this.y = this.floorY - this.air;
    // The broken horn tumbles away and lies on the stones a while.
    const pc = this.piece;
    if (pc.on) {
      pc.t += dt;
      if (pc.y < this.floorY - 3) {
        pc.vy += 900 * dt; pc.x += pc.vx * dt; pc.y += pc.vy * dt; pc.a += pc.va * dt;
        if (pc.y >= this.floorY - 3) { pc.y = this.floorY - 3; sfx('hitMetal', { vol: 0.5, pitch: 0.7 }); fx.dust(pc.x, this.floorY, 6, 1); }
      }
      if (pc.t > 9) pc.on = false;
    }
    // World points the tells and the ram horns need.
    this.bodyPoint(-3 + Math.sin(p.farArm) * 16 + Math.sin(p.farArm + p.farFore) * 14, -87 + Math.cos(p.farArm) * 16 + Math.cos(p.farArm + p.farFore) * 14);
    this.fhx = this.tx; this.fhy = this.ty;
    this.headPoint(this.horn === 2 ? 4 : 24.5, this.horn === 2 ? -18 : -39.5);
    this.htx = this.tx; this.hty = this.ty;
    const hx = 2 + Math.sin(p.arm) * 16 + Math.sin(p.arm + p.fore) * 14, hy = -86 + Math.cos(p.arm) * 16 + Math.cos(p.arm + p.fore) * 14;
    this.bodyPoint(hx + Math.cos(p.spear) * 92, hy + Math.sin(p.spear) * 92);
    this.stx = this.tx; this.sty = this.ty;
    this.bodyPoint(-6, -86);
    this.cape.update(this.tx, this.ty, dt, -this.face * (this.charging ? 900 : 120) + Math.sin(G.time * 3) * 60, this.charging ? 40 : 260, 0.86);
    if (this.horn === 2 && this.four > 0.5 && this.fighting && Math.random() < dt * 6 && G.renderer.tier >= 1) {
      const k = (Math.random() * 4) | 0;
      fx.spawn(PK.Ember, this.htx + rand(-8, 8), this.hty + rand(-6, 6), rand(-10, 10), -30, 0.6, 2, 0.5, WINDS[k].c, -20, 1);
    }
  }

  /** World position of a point in the body's frame (origin under the hooves, x forward), into tx/ty. */
  private bodyPoint(bx: number, by: number) {
    const p = this.pz, c = Math.cos(p.pitch), s = Math.sin(p.pitch);
    const py = by + 50;
    const rx = bx * c - py * s, ry = bx * s + py * c;
    this.tx = this.x + this.face * rx;
    this.ty = this.y - this.hover + p.drop + p.crouch * 6 + ry - 50;
  }
  /** As bodyPoint, for a point in the head's frame (origin at the top of the neck). */
  private headPoint(hx: number, hy: number) {
    const c = Math.cos(this.pz.head), s = Math.sin(this.pz.head);
    this.bodyPoint(5 + hx * c - hy * s, -94 + hx * s + hy * c);
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const pc = this.piece;
    if (pc.on) this.drawPiece(ctx);
    if (this.fade <= 0.01) return;
    const p = this.pz;
    const detail = G.renderer.tier >= 1;
    ctx.globalAlpha = this.fade;
    // His shadow on the stones, a hand's breadth below the hooves.
    ctx.globalAlpha = this.fade * clamp(0.32 - this.air * 0.0015, 0.08, 0.32);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), this.floorY - 1, Math.max(10, 32 - this.air * 0.1), 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = this.fade;
    this.drawCape(ctx, detail);
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - this.hover + p.drop + p.crouch * 6));
    ctx.scale(this.face, 1);
    ctx.translate(0, -50);
    ctx.rotate(p.pitch);
    ctx.translate(0, 50);
    ctx.lineJoin = 'round';
    this.drawWing(ctx, true, detail);
    this.drawLeg(ctx, true);
    this.drawArm(ctx, true);
    this.drawTorso(ctx, detail);
    this.drawLeg(ctx, false);
    this.drawSkirt(ctx);
    this.drawHead(ctx, detail);
    this.drawSpear(ctx, detail);
    this.drawArm(ctx, false);
    this.drawWing(ctx, false, detail);
    if (this.flash > 0 || this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 2, -66, 66, '#ffffff', Math.max(this.flash * 5, this.staggerFlash * 2));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The sea-storm cloak: deep water from the shoulders, foam at the hem. */
  private drawCape(ctx: Ctx, detail: boolean) {
    const ch = this.cape, n = ch.n;
    ctx.beginPath();
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < n; k++) {
        const i = pass ? n - 1 - k : k;
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        let dx = ch.xs[i1] - ch.xs[i0], dy = ch.ys[i1] - ch.ys[i0];
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        const w = (8 + i * 2.6) * (pass ? -1 : 1);
        const x = ch.xs[i] - dy * w, y = ch.ys[i] + dx * w;
        if (pass === 0 && k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = C.sea;
    ctx.fill();
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 1;
    ctx.stroke();
    // The swell: lighter water down the middle of the cloak.
    ctx.strokeStyle = C.seaMid;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ch.xs[0], ch.ys[0]);
    for (let i = 1; i < n - 1; i++) ctx.lineTo(ch.xs[i], ch.ys[i]);
    ctx.stroke();
    if (!detail) return;
    ctx.strokeStyle = C.seaHi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < n - 1; i++) {
      ctx.moveTo(ch.xs[i] - 2, ch.ys[i] - 1);
      ctx.lineTo(ch.xs[i + 1] - 1, ch.ys[i + 1]);
    }
    ctx.stroke();
    // Foam breaking along the hem.
    const i = n - 1, j = n - 2;
    const dx = ch.xs[i] - ch.xs[j], dy = ch.ys[i] - ch.ys[j];
    const l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.strokeStyle = C.foam;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const fx2 = ch.xs[i] + nx * k * 5, fy2 = ch.ys[i] + ny * k * 5;
      const ph = G.time * 4 + k;
      ctx.moveTo(fx2 - 2, fy2);
      ctx.quadraticCurveTo(fx2 + 1, fy2 - 3 - Math.sin(ph), fx2 + 3, fy2 + 0.5);
    }
    ctx.stroke();
  }

  /** A torn wing of white marble feathers going to ash at the tips. */
  private drawWing(ctx: Ctx, far: boolean, detail: boolean) {
    const s = this.pz.wing, fl = Math.sin(this.beat) * this.flapAmp;
    const rx = far ? -3 : -8, ry = far ? -88 : -84, L = far ? 64 : 76;
    const phi = lerp(-1.05, 1.15, s) + fl * 0.5 + (far ? 0.14 : 0);
    const ax = -Math.cos(phi), ay = -Math.sin(phi);
    const phi2 = phi + 0.3 * s;
    const bx = -Math.cos(phi2), by = -Math.sin(phi2);
    const ex = rx + ax * L * 0.38, ey = ry + ay * L * 0.38 - 2 * s;
    const wx = rx + bx * L * 0.78, wy = ry + by * L * 0.78;
    const tx = rx + bx * L, ty = ry + by * L;
    const fan = lerp(0.35, 1.3, s);
    const N = detail ? 10 : 6;
    const marble = far ? WING_FAR : C.wing, mid = far ? WINGMID_FAR : C.wingMid, ash = far ? ASH_FAR : C.ash;
    for (let i = N - 1; i >= 0; i--) {
      const u = (i + 1) / N;
      const px = u < 0.5 ? lerp(rx, ex, u * 2) : lerp(ex, wx, (u - 0.5) * 2), py = u < 0.5 ? lerp(ry, ey, u * 2) : lerp(ey, wy, (u - 0.5) * 2);
      const fp = phi - fan * (1 - u * 0.75);
      // Every third feather is torn short; its end is ragged.
      const torn = i % 3 === 1;
      const flen = L * (0.42 + 0.36 * u) * (torn ? 0.8 : 1);
      const dx = -Math.cos(fp), dy = -Math.sin(fp);
      const nx = -dy, ny = dx, w = 2.6 + u * 2;
      const mx = px + dx * flen * 0.6, my = py + dy * flen * 0.6;
      // Marble vane.
      ctx.beginPath();
      ctx.moveTo(px - nx * w, py - ny * w);
      ctx.lineTo(mx - nx * w * 0.9, my - ny * w * 0.9);
      ctx.lineTo(mx + nx * w * 0.95, my + ny * w * 0.95);
      ctx.lineTo(px + nx * w, py + ny * w);
      ctx.closePath();
      ctx.fillStyle = i & 1 ? marble : mid;
      ctx.fill();
      ctx.strokeStyle = C.outl;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // The ashen end.
      const ex2 = px + dx * flen, ey2 = py + dy * flen;
      ctx.beginPath();
      ctx.moveTo(mx - nx * w * 0.9, my - ny * w * 0.9);
      if (torn) {
        ctx.lineTo(ex2 - nx * w * 0.5, ey2 - ny * w * 0.5);
        ctx.lineTo(ex2 - dx * 3, ey2 - dy * 3);
        ctx.lineTo(ex2 + nx * w * 0.6 + dx * 1.5, ey2 + ny * w * 0.6 + dy * 1.5);
      } else ctx.lineTo(ex2, ey2);
      ctx.lineTo(mx + nx * w * 0.95, my + ny * w * 0.95);
      ctx.closePath();
      ctx.fillStyle = i & 1 ? ash : C.ashDk;
      ctx.fill();
      ctx.stroke();
      if (detail) {
        ctx.strokeStyle = far ? C.wingDk : C.hornHi;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(px + dx * flen * 0.08 - nx * w * 0.7, py + dy * flen * 0.08 - ny * w * 0.7);
        ctx.lineTo(mx - nx * w * 0.65, my - ny * w * 0.65);
        ctx.stroke();
        // Embers still eating at the ash.
        ctx.fillStyle = '#ff9a5a';
        if ((i * 7 + ((G.time * 3) | 0)) % 5 === 0) ctx.fillRect(Math.round(ex2 - dx * 4) - 1, Math.round(ey2 - dy * 4) - 1, 2, 1);
      }
    }
    // The bone of the wing, marble lit along its leading edge.
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 5.2;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = mid;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = marble;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(rx, ry - 1); ctx.lineTo(ex, ey - 1.2); ctx.lineTo(wx, wy - 1); ctx.stroke();
    ctx.lineCap = 'butt';
    if (detail) {
      // Coverts: a scalloped row along the arm.
      const cp = phi - fan * 0.55, cdx = -Math.cos(cp), cdy = -Math.sin(cp), ang = Math.atan2(cdy, cdx);
      for (let k = 0; k < 6; k++) {
        const u = (k + 0.5) / 6;
        const px = u < 0.5 ? lerp(rx, ex, u * 2) : lerp(ex, wx, (u - 0.5) * 2), py = u < 0.5 ? lerp(ry, ey, u * 2) : lerp(ey, wy, (u - 0.5) * 2);
        ctx.beginPath();
        ctx.ellipse(px + cdx * 5, py + cdy * 5, 6, 2.6, ang, 0, Math.PI * 2);
        ctx.fillStyle = k & 1 ? marble : mid;
        ctx.fill();
        ctx.strokeStyle = C.outl;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }

  /** A storm-grey goat's leg: thigh, the backward hock, a bronze-shod cloven hoof. */
  private drawLeg(ctx: Ctx, far: boolean) {
    const p = this.pz;
    const paddle = Math.sin(this.beat * 0.6 + (far ? Math.PI : 0)) * 0.12 * (1 - p.tuck);
    const hx = far ? 3 : -1, hy = -50;
    const a0 = 0.55 + p.crouch * 0.5 + p.tuck * 0.95 + paddle + (far ? 0.12 : 0);
    const a1 = a0 - (1.5 + p.crouch * 0.5 + p.tuck * 1.0);
    const a2 = a1 + 1.05 + p.tuck * 0.5;
    const a3 = a2 - 0.25;
    const kx = hx + Math.sin(a0) * 20, ky = hy + Math.cos(a0) * 20;
    const hkx = kx + Math.sin(a1) * 17, hky = ky + Math.cos(a1) * 17;
    const fx2 = hkx + Math.sin(a2) * 14, fy2 = hky + Math.cos(a2) * 14;
    const tx = fx2 + Math.sin(a3) * 6, ty = fy2 + Math.cos(a3) * 6;
    const fur = far ? FUR_FAR : C.fur;
    // Outline every segment first so the joints read as one leg.
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); capsulePath(ctx, hx, hy, kx, ky, 7.5, 5); ctx.stroke();
    ctx.beginPath(); capsulePath(ctx, kx, ky, hkx, hky, 4.6, 3.2); ctx.stroke();
    ctx.beginPath(); capsulePath(ctx, hkx, hky, fx2, fy2, 3, 2.3); ctx.stroke();
    ctx.fillStyle = fur;
    ctx.beginPath(); capsulePath(ctx, hx, hy, kx, ky, 7.5, 5); ctx.fill();
    ctx.beginPath(); capsulePath(ctx, kx, ky, hkx, hky, 4.6, 3.2); ctx.fill();
    ctx.beginPath(); capsulePath(ctx, hkx, hky, fx2, fy2, 3, 2.3); ctx.fill();
    // Shaggy fur at the back of the thigh and a feathered hock.
    ctx.fillStyle = far ? C.furDk : C.fur;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy + 2);
    ctx.lineTo(hx - 10, hy + 9);
    ctx.lineTo(hx - 5, hy + 8);
    ctx.lineTo(hx - 8, hy + 15);
    ctx.lineTo((hx + kx) / 2 - 3, (hy + ky) / 2 + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hkx - 2, hky - 2);
    ctx.lineTo(hkx - 8, hky + 3);
    ctx.lineTo(hkx - 3, hky + 2);
    ctx.lineTo(hkx - 6, hky + 7);
    ctx.lineTo(hkx + 1, hky + 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (!far) {
      // Lit fur along the front of the thigh and shin.
      ctx.strokeStyle = C.furHi;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy + 1); ctx.lineTo(kx + 2.5, ky - 2);
      ctx.moveTo(kx - 1, ky + 2); ctx.lineTo(hkx + 0.5, hky - 1);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // The hoof: dark horn, a bronze shoe, split at the toe.
    const hdx = Math.sin(a3), hdy = Math.cos(a3), hnx = -hdy, hny = hdx;
    ctx.beginPath();
    ctx.moveTo(fx2 + hnx * 3, fy2 + hny * 3);
    ctx.lineTo(tx + hnx * 3.6, ty + hny * 3.6);
    ctx.lineTo(tx - hnx * 2.6, ty - hny * 2.6);
    ctx.lineTo(fx2 - hnx * 2.4, fy2 - hny * 2.4);
    ctx.closePath();
    ctx.fillStyle = C.hoof;
    ctx.fill();
    ctx.strokeStyle = far ? C.bronzeDk : C.bronze;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tx + hnx * 3.4 - hdx * 1.5, ty + hny * 3.4 - hdy * 1.5);
    ctx.lineTo(tx - hnx * 2.4 - hdx * 1.5, ty - hny * 2.4 - hdy * 1.5);
    ctx.stroke();
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(tx + hnx * 0.5, ty + hny * 0.5); ctx.lineTo(tx + hnx * 0.5 - hdx * 3, ty + hny * 0.5 - hdy * 3); ctx.stroke();
  }

  /** An arm in marble with a bronze vambrace. The near one grips the sarissa. */
  private drawArm(ctx: Ctx, far: boolean) {
    const p = this.pz;
    const sx = far ? -3 : 2, sy = far ? -87 : -86;
    const a = far ? p.farArm : p.arm, f = far ? p.farFore : p.fore;
    const ex = sx + Math.sin(a) * 16, ey = sy + Math.cos(a) * 16;
    const hx = ex + Math.sin(a + f) * 14, hy = ey + Math.cos(a + f) * 14;
    const skin = far ? MARBLE_FAR : C.marble, metal = far ? C.bronzeDk : C.bronze;
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); capsulePath(ctx, sx, sy, ex, ey, 4.4, 3.5); ctx.stroke();
    ctx.beginPath(); capsulePath(ctx, ex, ey, hx, hy, 3.5, 2.9); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); capsulePath(ctx, sx, sy, ex, ey, 4.4, 3.5); ctx.fill();
    ctx.fillStyle = metal;
    ctx.beginPath(); capsulePath(ctx, ex, ey, hx, hy, 3.5, 2.9); ctx.fill();
    // Vein of grey in the marble, and the vambrace's lit ridge.
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = far ? C.marbleDk : C.vein;
    ctx.beginPath(); ctx.moveTo(sx + (ex - sx) * 0.2 + 1, sy + (ey - sy) * 0.2); ctx.lineTo(sx + (ex - sx) * 0.7 - 1, sy + (ey - sy) * 0.7 + 1); ctx.stroke();
    if (!far) {
      ctx.strokeStyle = C.bronzeHi;
      ctx.beginPath(); ctx.moveTo(ex + (hx - ex) * 0.15, ey + (hy - ey) * 0.15 - 1.6); ctx.lineTo(ex + (hx - ex) * 0.85, ey + (hy - ey) * 0.85 - 1.4); ctx.stroke();
    }
    // The fist.
    ctx.beginPath();
    ctx.arc(hx, hy, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (!far) {
      // The near pauldron: three lapped bronze plates, and linen strips beneath.
      const pa = Math.atan2(ey - sy, ex - sx) - Math.PI / 2;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(pa);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.rect(-4 + k * 3, 2, 2.6, 7 - k);
        ctx.fillStyle = k & 1 ? C.linenDk : C.linen;
        ctx.fill();
        ctx.strokeStyle = C.outl; ctx.lineWidth = 0.5; ctx.stroke();
      }
      for (let k = 2; k >= 0; k--) {
        ctx.beginPath();
        ctx.ellipse(0, 0.6 + k * 1.8, 6 - k * 0.5, 3.6 - k * 0.4, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = k ? C.bronzeDk : C.bronze;
        ctx.fill();
        ctx.strokeStyle = C.outl; ctx.lineWidth = 0.6; ctx.stroke();
      }
      ctx.strokeStyle = C.bronzeHi; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(0, 0.6, 5.4, 3, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.restore();
    }
  }

  /** The sarissa: a long ash-wood shaft, a bronze leaf blade and a butt spike. */
  private drawSpear(ctx: Ctx, detail: boolean) {
    const p = this.pz;
    const ex = 2 + Math.sin(p.arm) * 16, ey = -86 + Math.cos(p.arm) * 16;
    const hx = ex + Math.sin(p.arm + p.fore) * 14, hy = ey + Math.cos(p.arm + p.fore) * 14;
    const dx = Math.cos(p.spear), dy = Math.sin(p.spear);
    const ax = hx - dx * 50, ay = hy - dy * 50, bx = hx + dx * 82, by = hy + dy * 82;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.outl; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = C.wood; ctx.lineWidth = 2;
    ctx.stroke();
    if (detail) {
      ctx.strokeStyle = C.woodHi; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(ax - dy * 0.6, ay + dx * -0.6); ctx.lineTo(bx - dy * 0.6, by - dx * 0.6); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // Leaf blade, socket ring and butt spike.
    const nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(bx - nx * 1.4, by - ny * 1.4);
    ctx.lineTo(bx + dx * 4 - nx * 3.6, by + dy * 4 - ny * 3.6);
    ctx.lineTo(bx + dx * 14, by + dy * 14);
    ctx.lineTo(bx + dx * 4 + nx * 3.6, by + dy * 4 + ny * 3.6);
    ctx.lineTo(bx + nx * 1.4, by + ny * 1.4);
    ctx.closePath();
    ctx.fillStyle = C.bronze;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = C.bronzeHi; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(bx + dx * 2, by + dy * 2); ctx.lineTo(bx + dx * 12.5, by + dy * 12.5); ctx.stroke();
    ctx.fillStyle = C.bronzeHi;
    ctx.fillRect(Math.round(bx - dx * 2) - 1, Math.round(by - dy * 2) - 1, 2, 2);
    ctx.beginPath();
    ctx.moveTo(ax + nx * 1.6, ay + ny * 1.6);
    ctx.lineTo(ax - dx * 6, ay - dy * 6);
    ctx.lineTo(ax - nx * 1.6, ay - ny * 1.6);
    ctx.closePath();
    ctx.fillStyle = C.bronzeDk;
    ctx.fill();
  }

  /** Bronze muscle cuirass with the Macedonian star, over a marble chest. */
  private drawTorso(ctx: Ctx, detail: boolean) {
    // The neck first; the cuirass's collar sits over it.
    ctx.strokeStyle = C.outl; ctx.lineWidth = 1.4;
    ctx.beginPath(); capsulePath(ctx, 2, -86, 5, -95, 5, 4.2); ctx.stroke();
    ctx.fillStyle = C.marbleMid;
    ctx.beginPath(); capsulePath(ctx, 2, -86, 5, -95, 5, 4.2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9, -50); ctx.lineTo(-12, -62); ctx.lineTo(-12.5, -76); ctx.lineTo(-9.5, -87); ctx.lineTo(-3, -92);
    ctx.lineTo(6, -92); ctx.lineTo(12, -86.5); ctx.lineTo(14.5, -78); ctx.lineTo(13, -68); ctx.lineTo(9.5, -58); ctx.lineTo(8.5, -50);
    ctx.closePath();
    ctx.fillStyle = C.bronze;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 1; ctx.stroke();
    // The back half in shadow.
    ctx.beginPath();
    ctx.moveTo(-9, -50); ctx.lineTo(-12, -62); ctx.lineTo(-12.5, -76); ctx.lineTo(-9.5, -87); ctx.lineTo(-5, -89);
    ctx.lineTo(-6.5, -74); ctx.lineTo(-5, -60); ctx.lineTo(-3.5, -50);
    ctx.closePath();
    ctx.fillStyle = BRONZE_SIDE;
    ctx.fill();
    // Sculpted chest and belly, lit from above.
    ctx.strokeStyle = C.bronzeDk; ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2, -84); ctx.quadraticCurveTo(10, -84, 13.5, -77);
    ctx.moveTo(4, -71); ctx.lineTo(12, -71);
    ctx.moveTo(4, -65); ctx.lineTo(10.5, -64.5);
    ctx.moveTo(4, -59); ctx.lineTo(9, -58.5);
    ctx.moveTo(3.5, -77); ctx.lineTo(3.5, -54);
    ctx.stroke();
    ctx.strokeStyle = C.bronzeHi; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(1, -89); ctx.quadraticCurveTo(9, -89.5, 12.5, -84);
    ctx.moveTo(5, -72.2); ctx.lineTo(11.5, -72.2);
    ctx.moveTo(5, -66.2); ctx.lineTo(10, -65.8);
    ctx.stroke();
    // The sixteen-rayed star of Macedon, eight rays at this size.
    const sx = 8, sy = -79;
    ctx.strokeStyle = C.bronzeHi; ctx.lineWidth = detail ? 0.8 : 1;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      ctx.moveTo(sx + Math.cos(a) * 1.2, sy + Math.sin(a) * 1.2);
      ctx.lineTo(sx + Math.cos(a) * 3.8, sy + Math.sin(a) * 3.8);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff3c8';
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
    // Belt with bronze studs.
    ctx.beginPath();
    ctx.rect(-10.5, -55, 20.5, 5);
    ctx.fillStyle = C.leather;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = C.bronzeHi;
    for (let k = 0; k < 4; k++) ctx.fillRect(-7 + k * 5, -53.5, 1.6, 1.6);
  }

  /** The pteruges: linen and leather strips over the hips, crimson-edged. */
  private drawSkirt(ctx: Ctx) {
    for (let layer = 0; layer < 2; layer++) {
      for (let k = 0; k < 5; k++) {
        const x0 = -10 + k * 4.3 + layer * 2.1, len = layer ? 11 : 14;
        const sway = Math.sin(this.beat * 0.8 + k) * 0.8 + this.pz.tuck * 2;
        ctx.beginPath();
        ctx.moveTo(x0, -51);
        ctx.lineTo(x0 + 3.8, -51);
        ctx.lineTo(x0 + 3.6 - sway, -51 + len);
        ctx.lineTo(x0 - 0.2 - sway, -51 + len);
        ctx.closePath();
        ctx.fillStyle = layer ? C.linen : C.leather;
        ctx.fill();
        ctx.strokeStyle = C.outl; ctx.lineWidth = 0.6; ctx.stroke();
        if (layer) {
          ctx.fillStyle = C.crest;
          ctx.fillRect(Math.round(x0 - sway), -51 + len - 2, 4, 1.5);
        }
      }
    }
  }

  /** Marble face and goat's beard, an Attic helm with a crimson crest, and the horn between his eyes. */
  private drawHead(ctx: Ctx, detail: boolean) {
    const p = this.pz;
    ctx.save();
    ctx.translate(5, -94);
    ctx.rotate(p.head);
    // Crest, behind the helm: a long crimson plume streaming back in the wind.
    const sway = Math.sin(G.time * 3.2) * 1.6 + (this.charging ? 4 : 0);
    ctx.beginPath();
    ctx.moveTo(5, -16);
    ctx.quadraticCurveTo(5, -24, -3, -26);
    ctx.quadraticCurveTo(-14, -26, -22, -18 + sway * 0.4);
    ctx.quadraticCurveTo(-28, -12 + sway, -27, -4 + sway);
    ctx.quadraticCurveTo(-22, -10, -15, -14);
    ctx.quadraticCurveTo(-7, -17, -2, -16);
    ctx.closePath();
    ctx.fillStyle = C.crest;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = C.crestHi; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(3.5, -20); ctx.quadraticCurveTo(-2, -24.6, -12, -23.6); ctx.stroke();
    ctx.strokeStyle = C.plume; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-4, -21); ctx.quadraticCurveTo(-15, -21, -23, -10 + sway); ctx.stroke();
    if (detail) {
      ctx.strokeStyle = C.crestDk; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(-6 - k * 4, -18 + k); ctx.lineTo(-10 - k * 4, -14 + k * 2 + sway * 0.5); }
      ctx.stroke();
    }
    // Goat's ear, swept back below the helm.
    ctx.beginPath();
    ctx.moveTo(-1, -8); ctx.lineTo(-10, -3); ctx.lineTo(-2, -4.5);
    ctx.closePath();
    ctx.fillStyle = C.marbleMid;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.7; ctx.stroke();
    // Face, in profile.
    ctx.beginPath();
    ctx.moveTo(-4, 1); ctx.lineTo(-6, -8); ctx.lineTo(0, -14); ctx.lineTo(6, -12); ctx.lineTo(8.2, -8.4);
    ctx.lineTo(8.6, -6.4); ctx.lineTo(10.6, -2.8); ctx.lineTo(8.6, -2); ctx.lineTo(8.8, -0.4); ctx.lineTo(7.6, 0.6); ctx.lineTo(8, 2);
    ctx.lineTo(7, 3.4); ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fillStyle = C.marble;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.9; ctx.stroke();
    // The rough goat's beard, long and pointed.
    ctx.beginPath();
    ctx.moveTo(7.6, 1.6); ctx.lineTo(6.4, 8); ctx.lineTo(3.6, 13.5 + Math.sin(G.time * 2.5) * 0.6); ctx.lineTo(2.6, 7.5); ctx.lineTo(0, 3.6);
    ctx.closePath();
    ctx.fillStyle = C.beard;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.7; ctx.stroke();
    if (detail) {
      ctx.strokeStyle = C.marbleDk; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(5.6, 3); ctx.lineTo(4, 10); ctx.moveTo(3.6, 3.5); ctx.lineTo(3.2, 8); ctx.stroke();
    }
    // Eye: a storm-lit slit under the brow.
    ctx.fillStyle = C.outl;
    ctx.fillRect(4, -8, 4, 2);
    ctx.fillStyle = C.eye;
    ctx.fillRect(5.5, -7.6, 2.2, 1.2);
    // Attic helm: bronze dome, brow band and a cheek guard.
    ctx.beginPath();
    ctx.moveTo(-7, -5); ctx.lineTo(-7.6, -11); ctx.lineTo(-3, -16); ctx.lineTo(3, -16.6); ctx.lineTo(7.4, -13); ctx.lineTo(9.2, -9.6);
    ctx.lineTo(6.8, -9.4); ctx.lineTo(2, -10); ctx.lineTo(-4, -8.6);
    ctx.closePath();
    ctx.fillStyle = C.bronze;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2.6, -10); ctx.lineTo(6.2, -9.4); ctx.lineTo(5.2, -3); ctx.lineTo(2.4, -1.4); ctx.lineTo(1.2, -6);
    ctx.closePath();
    ctx.fillStyle = C.bronzeDk;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = C.bronzeHi; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-6, -11.5); ctx.quadraticCurveTo(-1, -16.4, 6.6, -12.6); ctx.stroke();
    ctx.strokeStyle = C.bronzeDeep; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-6.6, -8); ctx.lineTo(8, -10.2); ctx.stroke();
    // Crest holder.
    ctx.fillStyle = C.bronzeDk;
    ctx.fillRect(-1, -18, 5, 2.4);
    // The horns.
    if (this.horn < 2) this.drawGreatHorn(ctx);
    else this.drawFourHorns(ctx);
    ctx.restore();
  }

  /** The notable horn between his eyes: ivory, spiralled, rising from the brow. */
  private drawGreatHorn(ctx: Ctx) {
    ctx.save();
    ctx.translate(7.4, -10);
    ctx.rotate(-1.05);
    ctx.beginPath();
    ctx.moveTo(0, -3.4);
    ctx.quadraticCurveTo(18, -3.4, 34, 0.4);
    ctx.quadraticCurveTo(18, 2.2, 0, 3.4);
    ctx.closePath();
    ctx.fillStyle = C.horn;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.9; ctx.stroke();
    // Spiral ridges wound up the shaft.
    ctx.strokeStyle = C.hornDk; ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const x = 2 + k * 4.2, w = 3.3 * (1 - x / 36);
      ctx.moveTo(x, -w);
      ctx.lineTo(x + 2.6, w);
    }
    ctx.stroke();
    ctx.strokeStyle = C.hornHi; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(2, -2.4); ctx.quadraticCurveTo(16, -2.6, 30, -0.2); ctx.stroke();
    if (this.horn === 1 && this.crack > 0) {
      // The crack running through it.
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(10, -3.2);
      ctx.lineTo(11.5, -1);
      ctx.lineTo(10, 0.4 + this.crack);
      ctx.lineTo(12, 3 * this.crack);
      if (this.crack > 0.5) { ctx.moveTo(11.5, -1); ctx.lineTo(16 * this.crack, -2.2); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The great horn broken off, and four notable ones come up for it, one toward each wind. */
  private drawFourHorns(ctx: Ctx) {
    // The stump.
    ctx.save();
    ctx.translate(7.4, -10);
    ctx.rotate(-1.05);
    ctx.beginPath();
    ctx.moveTo(0, -3.4); ctx.lineTo(7, -3); ctx.lineTo(9, -1.2); ctx.lineTo(7.4, 0.4); ctx.lineTo(9.4, 1.8); ctx.lineTo(7, 2.9); ctx.lineTo(0, 3.4);
    ctx.closePath();
    ctx.fillStyle = C.horn;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
    const g = this.four;
    if (g <= 0) return;
    for (let k = 0; k < 4; k++) {
      const len = (k === 1 || k === 2 ? 19 : 15) * g;
      const lit = this.wind === k;
      ctx.save();
      ctx.translate(5 - k * 3, -13 - (k === 1 || k === 2 ? 2 : 0));
      ctx.rotate(-1.15 - k * 0.42);
      ctx.beginPath();
      ctx.moveTo(0, -2.3);
      ctx.quadraticCurveTo(len * 0.6, -2.2, len, 0.4);
      ctx.quadraticCurveTo(len * 0.6, 1.6, 0, 2.3);
      ctx.closePath();
      ctx.fillStyle = C.horn;
      ctx.fill();
      ctx.strokeStyle = C.outl; ctx.lineWidth = 0.8; ctx.stroke();
      // Each horn's point takes its wind's colour.
      ctx.beginPath();
      ctx.moveTo(len * 0.55, -1.6);
      ctx.quadraticCurveTo(len * 0.8, -1.2, len, 0.4);
      ctx.quadraticCurveTo(len * 0.8, 1.2, len * 0.55, 1.4);
      ctx.closePath();
      ctx.fillStyle = WINDS[k].c;
      ctx.fill();
      if (lit) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, len, 0, 16, WINDS[k].c, 0.9);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
  }

  private drawPiece(ctx: Ctx) {
    const pc = this.piece;
    ctx.save();
    ctx.globalAlpha = clamp(9 - pc.t, 0, 1);
    ctx.translate(Math.round(pc.x), Math.round(pc.y));
    ctx.rotate(pc.a);
    ctx.beginPath();
    ctx.moveTo(-12, -2.6); ctx.lineTo(-9, -0.6); ctx.lineTo(-12, 1.2); ctx.lineTo(-10, 2.6);
    ctx.quadraticCurveTo(4, 1.8, 14, 0.3);
    ctx.quadraticCurveTo(4, -2.8, -12, -2.6);
    ctx.closePath();
    ctx.fillStyle = C.horn;
    ctx.fill();
    ctx.strokeStyle = C.outl; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------ tells (above the light, never pixel-shaded)
  drawOverlay(ctx: Ctx) {
    if (this.fade <= 0.05) return;
    for (const l of this.lanes) if (l.on) this.drawLane(ctx, l);
    if (this.state === 'kneel') this.drawExposed(ctx);
    if (this.ward && this.wind >= 0) this.drawCompass(ctx);
    if (this.state !== 'attack') return;
    const t = this.st;
    const atk = this.atk;
    if ((atk === 'charge' || atk === 'fury') && this.step === 0) this.drawChargeLine(ctx);
    if (atk === 'gore' && t < (this.phase === 1 ? 0.6 : 0.5)) this.glint(ctx, this.htx, this.hty, TELL.dodge, 1.2);
    if (atk === 'thrust' && !this.struck && this.n < (this.phase === 1 ? 2 : 3)) {
      const at = (this.phase === 1 ? 0.55 : 0.48) + this.n * (this.phase === 1 ? 0.5 : 0.42);
      if (t > at - 0.4) this.glint(ctx, this.stx, this.sty, TELL.parry, 1.1);
    }
    if (atk === 'leap' && this.step < 4) {
      const u = this.step === 0 ? 0 : this.step === 1 ? 0.4 + t * 0.6 : this.step === 2 ? 0.7 : 0.9;
      this.floorMark(ctx, this.leapTo, this.floorY, 70, u, TELL.dodge);
      if (this.step === 0) this.glint(ctx, this.htx, this.hty, TELL.dodge, 1);
    }
  }

  /** The charge's line: from his hooves along the floor to where he will stop, chevrons running its way. */
  private drawChargeLine(ctx: Ctx) {
    const fury = this.atk === 'fury';
    const tell = this.final ? 0.75 : fury ? (this.n === 0 ? 0.62 : 0.45) : this.phase === 1 ? 0.85 : 0.65;
    const u = clamp(this.st / tell, 0, 1);
    const d = this.chargeDir, x0 = this.x + d * 24, x1 = this.chargeTo + d * 24;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const y = this.floorY;
    const pulse = 0.75 + Math.sin(G.time * 22) * 0.25;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.12 + 0.22 * u) * pulse;
    ctx.fillStyle = TELL.dodge;
    ctx.fillRect(Math.round(lo), y - 36, Math.round(hi - lo), 36);
    ctx.globalAlpha = 0.5 + 0.5 * u;
    ctx.fillRect(Math.round(lo), y - 3, Math.round((hi - lo)), 3);
    ctx.fillStyle = TELL.dodgeHot;
    const reach = (hi - lo) * Math.min(1, u * 1.4);
    ctx.fillRect(Math.round(d > 0 ? lo : hi - reach), y - 2, Math.round(reach), 1);
    // Chevrons, running the way he will come.
    ctx.strokeStyle = TELL.dodgeHot;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85 * pulse;
    ctx.beginPath();
    const off = (G.time * 160) % 34;
    for (let x = lo + off; x < hi - 6; x += 34) {
      const cx = d > 0 ? x : hi - (x - lo);
      ctx.moveTo(cx - d * 5, y - 24);
      ctx.lineTo(cx + d * 3, y - 18);
      ctx.lineTo(cx - d * 5, y - 12);
    }
    ctx.stroke();
    if (this.final) {
      // The wall he will strike: a starburst where he will hit.
      const wx = d > 0 ? this.wallR - 2 : this.wallL + 2, wy = y - 40;
      ctx.globalAlpha = pulse;
      glow(ctx, wx, wy, 34, TELL.dodge, 0.8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + 0.3;
        ctx.moveTo(wx + Math.cos(a) * 4, wy + Math.sin(a) * 6);
        ctx.lineTo(wx + Math.cos(a) * 14, wy + Math.sin(a) * 20);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.glint(ctx, this.htx, this.hty, TELL.dodge, 1.1);
  }

  private drawLane(ctx: Ctx, l: Lane) {
    const c = WINDS[l.wind].c;
    const u = clamp(l.t / l.tele, 0, 1);
    const pulse = 0.7 + Math.sin(G.time * 18) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    if (l.dir) {
      // A band across the arena: outlined while it gathers, the front a wall of wind.
      const x0 = this.wallL, x1 = this.wallR;
      const live = l.t >= l.tele;
      const a0 = live ? (l.dir > 0 ? l.front : x0) : x0, a1 = live ? (l.dir > 0 ? x1 : l.front) : x1;
      ctx.globalAlpha = (live ? 0.16 : 0.06 + u * 0.12) * pulse;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(a0), Math.round(l.y0), Math.max(0, Math.round(a1 - a0)), Math.round(l.y1 - l.y0));
      ctx.globalAlpha = 0.8;
      ctx.fillRect(Math.round(a0), Math.round(l.y0), Math.max(0, Math.round(a1 - a0)), 1);
      ctx.fillRect(Math.round(a0), Math.round(l.y1) - 1, Math.max(0, Math.round(a1 - a0)), 1);
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9 * pulse;
      ctx.beginPath();
      const my = (l.y0 + l.y1) / 2, hh = Math.min(10, (l.y1 - l.y0) * 0.3);
      const off = (G.time * 140) % 40;
      for (let x = a0 + off; x < a1; x += 40) {
        const cx = l.dir > 0 ? x : a1 - (x - a0);
        ctx.moveTo(cx - l.dir * 5, my - hh);
        ctx.lineTo(cx + l.dir * 4, my);
        ctx.lineTo(cx - l.dir * 5, my + hh);
      }
      ctx.stroke();
      const fx2 = live ? l.front : l.dir > 0 ? x0 + 6 : x1 - 6;
      ctx.globalAlpha = live ? 0.9 : 0.3 + u * 0.5;
      glow(ctx, fx2, my, (l.y1 - l.y0) * 0.9, c, 0.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(fx2) - 2, Math.round(l.y0), 4, Math.round(l.y1 - l.y0));
    } else {
      const x = Math.round(l.x - l.w / 2), w = Math.round(l.w);
      const top = Math.round(l.y0), h = Math.round(l.y1 - l.y0);
      if (l.t < l.tele) {
        ctx.globalAlpha = (0.08 + u * 0.18) * pulse;
        ctx.fillStyle = c;
        ctx.fillRect(x, top, w, h);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, top, 1, h);
        ctx.fillRect(x + w - 1, top, 1, h);
        ctx.fillRect(x, Math.round(l.y1) - 3, w, 3);
        // Chevrons: falling for the north wind, rising for the south.
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9 * pulse;
        ctx.beginPath();
        const down = l.wind === 0 ? 1 : -1, off = (G.time * 90) % 30;
        for (let k = 0; k < 7; k++) {
          const yy = down > 0 ? top + off + k * 30 : l.y1 - off - k * 30;
          if (yy < top || yy > l.y1) continue;
          ctx.moveTo(l.x - 8, yy - down * 5);
          ctx.lineTo(l.x, yy + down * 2);
          ctx.lineTo(l.x + 8, yy - down * 5);
        }
        ctx.stroke();
      } else {
        const v = clamp(1 - (l.t - l.tele) / l.act, 0, 1);
        const hh = l.wind === 2 ? Math.round(h * Math.min(1, (l.t - l.tele) * 8)) : h;
        ctx.globalAlpha = 0.55 * v + 0.2;
        ctx.fillStyle = c;
        ctx.fillRect(x, Math.round(l.y1) - hh, w, hh);
        ctx.globalAlpha = v;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(l.x) - 3, Math.round(l.y1) - hh, 6, hh);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** While he rides the winds: an arrow over him for the wind that blows, and its horn's colour. */
  private drawCompass(ctx: Ctx) {
    const k = this.wind, c = WINDS[k].c;
    const x = Math.round(this.x), y = Math.round(this.y - 150);
    // Where the wind comes from: north falls, east blows west, south rises, west blows east.
    const ax = k === 1 ? -1 : k === 3 ? 1 : 0, ay = k === 0 ? 1 : k === 2 ? -1 : 0;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 22, c, 0.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = C.outl;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(x - ax * 9, y - ay * 9);
      ctx.lineTo(x + ax * 9, y + ay * 9);
      ctx.moveTo(x + ax * 9 - ax * 6 + ay * 5, y + ay * 9 - ay * 6 + ax * 5);
      ctx.lineTo(x + ax * 9, y + ay * 9);
      ctx.lineTo(x + ax * 9 - ax * 6 - ay * 5, y + ay * 9 - ay * 6 - ax * 5);
      ctx.stroke();
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
    }
    ctx.lineCap = 'butt';
    // Pips: which of the four winds this is.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < k ? '#5a5560' : i === k ? '#ffffff' : WINDS[i].c;
      ctx.fillRect(x - 14 + i * 8, y + 16, 4, 4);
    }
    // The ward: nothing reaches him up here.
    ctx.globalAlpha = 0.45 + Math.sin(G.time * 8) * 0.2;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, Math.round(this.y - 58), 40, 66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Over a reeling or spent prince: strike now. */
  private drawExposed(ctx: Ctx) {
    const x = Math.round(this.x), y = Math.round(this.y - 108);
    const p = 0.7 + Math.sin(G.time * 10) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 16, TELL.calm, 0.7 * p);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = p;
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.closePath();
    ctx.stroke();
    if (this.wallHitT > 0 || this.kneelTime === 3.6) {
      // Dazed from the wall: stars wheel about the horn.
      ctx.fillStyle = '#fff6dc';
      for (let k = 0; k < 3; k++) {
        const a = G.time * 5 + k * 2.1;
        ctx.fillRect(Math.round(this.htx + Math.cos(a) * 12) - 1, Math.round(this.hty + Math.sin(a) * 4) - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  lights() {
    if (this.fade < 0.05) return;
    lighting.add(this.x, this.y - 60, 120, '#9ab8d8', 0.35 * this.fade, 0.3);
    lighting.add(this.htx, this.hty, 50, this.horn === 2 ? '#dff2ff' : '#fff6dc', 0.6 * this.fade, 0.6);
    if (this.charging) lighting.add(this.x, this.floorY - 20, 90, TELL.dodge, 0.4, 0.5);
    for (const l of this.lanes) if (l.on && l.t >= l.tele) lighting.add(l.dir ? l.front : l.x, (l.y0 + l.y1) / 2, 90, WINDS[l.wind].c, 0.7, 0.6);
  }
}
