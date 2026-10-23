// THE PRINCES (Chapter VI): fallen angels set over domains and kingdoms.
// Elior can withstand them; he cannot purify them, and they never become
// Echoes. Beaten, they kneel; the story throws them down.
//
// THE PRINCE OF THE STORM, "the prince of the power of the air" (Ephesians
// 2:2), a winged prince crowned with cloud. His domain is the wind: it blows
// across the summit and turns about, pushing Elior. He calls rows of
// lightning, buffets with his wings, dives from the sky, and rises out of
// reach with Gales about him; strike him from the air, or strike down his
// Gales, to bring him crashing down. At the last he becomes the storm: the
// whole summit is struck except a moving eye.
//
// THE PRINCE OF THE KINGDOM OF PERSIA, who withstood the messenger one and
// twenty days (Daniel 10:13). A spear duelist with fast strings, a guard that
// answers any blow with a counter-thrust, and a long lunge. At "Arise" the
// Undying stand up around him, stronger while he stands, and he adds a sweep
// of his wings and spears that fall from above. At "The Twenty-First Day"
// nothing can touch him for twenty-one days (seconds); survive them and light
// from above breaks his guard. Then he fights on, enraged and open. At the
// end the story calls castDown(): a column of light, and he is thrown down.

import { type HitInfo } from './entity';
import { BossBase } from './bosses2';
import { solve, newJoints, Chain, drawRibbon, POSE_KEYS, type Joints, type Pose, type RigDims } from '../render/skeleton';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { glow, ellipse, shade, poly, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose, easeInQuad, easeOutCubic } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { bossScale } from './difficulty';
import { TILE } from './tiles';
import { SENT_BASE } from './enemies';
import { NPC_DEFS } from './props';
import { Undying, Gale, BOLT, HOST, jag, drawBolt } from './princes';

/** Scratch hit box (no allocation per strike). */
const BOX = { x: 0, y: 0, w: 0, h: 0 };

interface WingPal { dark: string; mid: string; edge: string; tip: string }
const STORM_WING: WingPal = { dark: '#121a2e', mid: '#2a3a60', edge: '#8aa6dc', tip: '#d6e6ff' };
const PERSIA_WING: WingPal = { dark: '#1c0820', mid: '#4a1846', edge: '#e8b84a', tip: '#ffe08a' };
const LIGHT = { c: '#fff1c4', hot: '#ffffff', gold: '#ffcf6b' };

/**
 * One great wing, drawn from its root in world space. f is the facing,
 * spread 0 (folded down the back) .. 1 (raised), flap adds lift.
 */
function drawWing(ctx: Ctx, x: number, y: number, f: number, spread: number, flap: number, L: number, P: WingPal, far: boolean, detail: boolean) {
  // Direction of the wing arm, measured up from straight back.
  const phi = lerp(-1.3, 0.85, spread) + flap * 0.5 + (far ? 0.14 : 0);
  const ax = -Math.cos(phi) * f, ay = -Math.sin(phi);
  const phi2 = phi + 0.28 * spread;
  const bx = -Math.cos(phi2) * f, by = -Math.sin(phi2);
  const ex = x + ax * L * 0.4, ey = y + ay * L * 0.4 - 3 * spread;
  const wx = x + bx * L * 0.78, wy = y + by * L * 0.78;
  const tx = x + bx * L, ty = y + by * L;
  const fan = lerp(0.3, 1.25, spread);
  const dark = far ? shade(P.dark, -0.25) : P.dark, mid = far ? shade(P.mid, -0.3) : P.mid;
  ctx.lineJoin = 'miter';
  // Flight feathers, outermost first so the inner ones lie over them. Each is a long
  // blade from the arm with a lit leading edge and a pale tip.
  const N = detail ? 9 : 6;
  for (let i = N - 1; i >= 0; i--) {
    const u = (i + 1) / N;
    const px = u < 0.5 ? lerp(x, ex, u * 2) : lerp(ex, wx, (u - 0.5) * 2), py = u < 0.5 ? lerp(y, ey, u * 2) : lerp(ey, wy, (u - 0.5) * 2);
    const fp = phi - fan * (1 - u * 0.75);
    const fl = L * (0.4 + 0.34 * u);
    const dx = -Math.cos(fp) * f, dy = -Math.sin(fp);
    const nx = -dy, ny = dx, w = 2.4 + u * 1.8;
    const fx2 = px + dx * fl, fy2 = py + dy * fl;
    ctx.beginPath();
    ctx.moveTo(px - nx * w, py - ny * w);
    ctx.lineTo(px + dx * fl * 0.82 - nx * w * 0.8, py + dy * fl * 0.82 - ny * w * 0.8);
    ctx.lineTo(fx2, fy2);
    ctx.lineTo(px + dx * fl * 0.82 + nx * w * 0.9, py + dy * fl * 0.82 + ny * w * 0.9);
    ctx.lineTo(px + nx * w, py + ny * w);
    ctx.closePath();
    ctx.fillStyle = i & 1 ? dark : shade(dark, 0.08);
    ctx.fill();
    ctx.strokeStyle = OUTL;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (detail) {
      // The shaft, and the lit vane.
      ctx.strokeStyle = mid;
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx * fl * 0.9, py + dy * fl * 0.9); ctx.stroke();
      ctx.strokeStyle = P.edge;
      ctx.beginPath(); ctx.moveTo(px + dx * fl * 0.3 - nx * w * 0.9, py + dy * fl * 0.3 - ny * w * 0.9); ctx.lineTo(px + dx * fl * 0.8 - nx * w * 0.75, py + dy * fl * 0.8 - ny * w * 0.75); ctx.stroke();
    }
    ctx.fillStyle = P.tip;
    ctx.fillRect(Math.round(fx2 - dx * 2) - 1, Math.round(fy2 - dy * 2) - 1, 2, 2);
  }
  // The arm of the wing, lit along its leading edge.
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTL;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = mid;
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.strokeStyle = P.edge;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(ex, ey - 1.2); ctx.lineTo(wx, wy - 1); ctx.stroke();
  ctx.lineCap = 'butt';
  // Two rows of covert feathers: scallops along the arm.
  if (detail) {
    const cp = phi - fan * 0.55;
    const cdx = -Math.cos(cp) * f, cdy = -Math.sin(cp);
    for (let row = 0; row < 2; row++) {
      const n = 7 - row * 2, len = 6 + row * 4;
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const px = u < 0.5 ? lerp(x, ex, u * 2) : lerp(ex, wx, (u - 0.5) * 2), py = u < 0.5 ? lerp(y, ey, u * 2) : lerp(ey, wy, (u - 0.5) * 2);
        const ox = px + cdx * (row * 6 + 2), oy = py + cdy * (row * 6 + 2);
        ctx.beginPath();
        ctx.ellipse(ox + cdx * len * 0.5, oy + cdy * len * 0.5, len * 0.6, 2.6, Math.atan2(cdy, cdx), 0, Math.PI * 2);
        ctx.fillStyle = row ? mid : shade(mid, 0.12);
        ctx.fill();
        ctx.strokeStyle = OUTL;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = P.tip;
  ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
}

const OUTL = '#06040a';

/** Where a wing's tip is (for telegraph glints). */
function wingTip(x: number, y: number, f: number, spread: number, flap: number, L: number) {
  const phi = lerp(-1.3, 0.85, spread) + flap * 0.5 + 0.28 * spread;
  return { x: x - Math.cos(phi) * f * L, y: y - Math.sin(phi) * L };
}

// =====================================================================
// Shared body of a prince: a rig drawn large, great wings, a cape.
// =====================================================================

abstract class Prince extends BossBase {
  j: Joints = newJoints();
  pose: Pose;
  target: Pose;
  rate = 9;
  S: number;
  dims: RigDims;
  style: HumanStyle;
  floorY: number;
  homeX: number;
  step = 0;
  struck = false;
  /** Wing spread (0 folded .. 1 raised), its target, and the beat. */
  wing = 0.25;
  wingT = 0.25;
  beat = 0;
  beatAmp = 0.15;
  beatRate = 4;
  /** Off the ground: the rig hangs from the hip. */
  airborne = false;
  cape: Chain;
  camF = { x: 0, y: 0 };
  yielded = false;
  /** The end (thrown down by the story). */
  endT = -1;
  endDone: (() => void) | null = null;
  fade = 1;
  wingL: number;
  pal: WingPal;

  constructor(key: 'storm_prince' | 'persia_prince', x: number, y: number, w: number, h: number, hp: number, base: Pose, S: number, wingL: number, pal: WingPal) {
    super(key, x, y, w, h, hp);
    const def = NPC_DEFS[key];
    this.dims = def.dims;
    this.S = S;
    this.wingL = wingL;
    this.pal = pal;
    this.style = def.style;
    this.pose = { ...base };
    this.target = { ...base };
    this.floorY = y;
    this.homeX = x;
    this.face = -1;
    this.collide = false;
    this.cape = new Chain(8, 5, x, y - 60);
    solve(this.pose, this.dims, true, this.j);
  }

  hurtbox() {
    const low = this.state === 'kneel' || this.state === 'dead' ? 26 : 0;
    const w = this.body.w, h = this.body.h - low;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }
  get cy() {
    return this.y - this.body.h * 0.5;
  }

  setPose(p: Pose, rate = 9) {
    this.target = p;
    this.rate = rate;
  }

  /** World position of a rig point. */
  wx(lx: number) {
    return this.x + this.face * lx * this.S;
  }
  wy(ly: number) {
    return this.y + ly * this.S;
  }
  hand() {
    return { x: this.wx(this.j.haFX), y: this.wy(this.j.haFY) };
  }
  /** Wing root: between the shoulder blades. */
  rootX() {
    return this.wx((this.j.shBX + this.j.neckX) * 0.5 - 1.5);
  }
  rootY() {
    return this.wy((this.j.shBY + this.j.neckY) * 0.5 + 1.5);
  }

  /** A blow on the player's side; a scratch box, so a strike costs nothing extra. */
  strike(x: number, y: number, w: number, h: number, mul: number, extra?: Partial<HitInfo>) {
    const p = G.world.player;
    BOX.x = x; BOX.y = y; BOX.w = w; BOX.h = h;
    const dir = sign(p.x - (x + w / 2)) || this.face;
    const hit: HitInfo = { dmg: this.dmg * mul, poise: 45, kx: dir * 260, ky: -200, dir, kind: 'melee', src: this, parryable: false };
    if (extra) Object.assign(hit, extra);
    return G.world.hitPlayerSide(BOX, hit, this.hitSet);
  }

  facePlayer() {
    const p = G.world.player;
    if (Math.abs(p.x - this.x) > 6) this.face = p.x < this.x ? -1 : 1;
  }

  /** Arena bounds (inside the walls). */
  get left() {
    return 3 * TILE + 24;
  }
  get right() {
    return (G.world.grid.w - 2) * TILE - 24;
  }

  animRig(dt: number) {
    const k = Math.min(1, dt * this.rate);
    const p = this.pose, t = this.target;
    for (const key of POSE_KEYS) p[key] += (t[key] - p[key]) * k;
    solve(p, this.dims, !this.airborne, this.j);
    this.wing = approach(this.wing, this.wingT, dt * 3.2);
    this.beat += dt * this.beatRate;
    this.cape.update(this.wx(this.j.shBX - 1), this.wy(this.j.shBY), dt, -this.face * 70, 380, 0.88);
  }

  flapNow() {
    return Math.sin(this.beat) * this.beatAmp;
  }

  drawWings(ctx: Ctx, far: boolean) {
    const tier = G.renderer.tier;
    const fl = this.flapNow();
    const rx = this.rootX(), ry = this.rootY();
    if (far) drawWing(ctx, rx - this.face * 3, ry - 2, this.face, this.wing, fl * 0.85, this.wingL * 0.92, this.pal, true, false);
    else drawWing(ctx, rx, ry, this.face, this.wing, fl, this.wingL, this.pal, false, tier >= 1);
  }

  drawRig(ctx: Ctx) {
    const S = this.S;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * S, S);
    drawHumanoid(ctx, this.j, this.style, G.time, this.pose.rot);
    if (!this.pose.rot) this.drawRegalia(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, this.j, flashStyle(this.style), G.time, this.pose.rot);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** A prince's regalia over the rig: breastplate and emblem, layered pauldron, belt and tassets. */
  drawRegalia(ctx: Ctx) {
    const j = this.j, P = this.pal, storm = this.pal === STORM_WING;
    const a = j.torsoA, ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
    const len = Math.hypot(j.neckX - j.hipX, j.neckY - j.hipY);
    const Q = (u: number, r: number): [number, number] => [j.hipX + ux * u + rx * r, j.hipY + uy * u + ry * r];
    const pts = (...p: [number, number][]) => p.flat();
    const metal = storm ? '#3a4a6e' : '#c89a3a', metalHi = storm ? '#bcd4ff' : '#ffe6a0', metalDk = storm ? '#1a2238' : '#7a5a1e';
    // Breastplate.
    poly(ctx, pts(Q(len * 0.95, -4.2), Q(len * 0.95, 4.8), Q(len * 0.5, 5.2), Q(len * 0.36, 0.5), Q(len * 0.5, -4.4)), metal, OUTL, 0.6);
    const [c0x, c0y] = Q(len * 0.92, 4.2), [c1x, c1y] = Q(len * 0.55, 4.6);
    ctx.strokeStyle = metalHi; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(c0x, c0y); ctx.lineTo(c1x, c1y); ctx.stroke();
    const [ex2, ey2] = Q(len * 0.7, 0.8);
    if (storm) {
      // A bolt of silver set into the plate.
      ctx.strokeStyle = metalHi; ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(ex2 - 1, ey2 - 3.5); ctx.lineTo(ex2 + 1, ey2 - 0.5); ctx.lineTo(ex2 - 1, ey2 + 0.5); ctx.lineTo(ex2 + 1, ey2 + 3.5);
      ctx.stroke();
    } else {
      // A winged sun in gold relief.
      ellipse(ctx, ex2, ey2, 1.6, 1.6, 0, '#ffe6a0');
      ctx.strokeStyle = '#7a1a3a'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(ex2 - 4, ey2 - 0.5); ctx.lineTo(ex2 - 1.8, ey2); ctx.moveTo(ex2 + 1.8, ey2); ctx.lineTo(ex2 + 4, ey2 - 0.5); ctx.stroke();
    }
    // Belt with a jewel, and three tassets hanging over the hips.
    poly(ctx, pts(Q(1.2, -4.6), Q(1.2, 5), Q(-0.6, 5), Q(-0.6, -4.6)), metalDk, OUTL, 0.5);
    const [bx2, by2] = Q(0.3, 1.5);
    ellipse(ctx, bx2, by2, 1, 1, 0, storm ? '#9ac8ff' : '#b0203a');
    for (let k = -1; k <= 1; k++) {
      const r0 = k * 3.4 - 1.2, r1 = r0 + 3;
      poly(ctx, pts(Q(-0.6, r0), Q(-0.6, r1), Q(-5.5 + Math.abs(k), r1 - 0.3), Q(-6 + Math.abs(k), r0 + 0.3)), k ? metal : shade(metal, 0.12), OUTL, 0.5);
    }
    // A layered pauldron of three overlapping plates on the near shoulder.
    const pa = Math.atan2(j.elFY - j.shFY, j.elFX - j.shFX) - Math.PI / 2;
    ctx.save();
    ctx.translate(j.shFX, j.shFY);
    ctx.rotate(pa);
    for (let k = 2; k >= 0; k--) {
      ctx.beginPath();
      ctx.ellipse(0, 0.8 + k * 1.6, 4.6 - k * 0.4, 3 - k * 0.3, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = k ? shade(metal, -0.15 * k) : metal;
      ctx.fill();
      ctx.strokeStyle = OUTL; ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.strokeStyle = metalHi; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(0, 0.8, 4.2, 2.6, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.restore();
    void P;
  }

  /** Kneeling marker over a broken prince: execute now. */
  drawOverlay(ctx: Ctx) {
    if (this.state !== 'kneel') return;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.7 + Math.sin(G.time * 10) * 0.3;
    const y = Math.round(this.y - this.body.h - 6);
    const x = Math.round(this.x);
    glow(ctx, x, y, 16, '#ffe6a8', 0.7 * p);
    ctx.globalAlpha = p;
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A promise for the story that resolves when the ending finishes (never later than `ms`). */
  protected ending(ms: number) {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.endDone = finish;
      setTimeout(finish, ms);
    });
  }

  protected resolveEnd() {
    const d = this.endDone;
    this.endDone = null;
    d?.();
  }

  /** Clear enemy shots (phase changes and death). */
  protected clearShots() {
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  /** Move the player sideways against the walls (the storm's wind). */
  protected shove(dx: number) {
    const p = G.world.player;
    if (p.state === 'dead' || p.state === 'execute' || G.inCutscene) return;
    const b = p.body;
    const W = G.world;
    let nx = b.x + dx;
    const top = Math.floor((b.y - b.h + 0.01) / TILE), bot = Math.floor((b.y - 0.01) / TILE);
    const col = Math.floor((nx + sign(dx) * b.w / 2) / TILE);
    for (let r = top; r <= bot; r++) {
      if (W.solid(W.grid.get(col, r))) {
        nx = dx > 0 ? col * TILE - b.w / 2 - 0.01 : (col + 1) * TILE + b.w / 2 + 0.01;
        break;
      }
    }
    b.x = clamp(nx, this.left - 16, this.right + 16);
  }
}

// =====================================================================
// THE PRINCE OF THE STORM
// =====================================================================

type SAtk = 'sweep' | 'row' | 'dive' | 'aloft' | 'crash' | 'eye';

const SB: Pose = { ...SENT_BASE, bUA: -0.5, bFA: 0.4, fUA: 0.5, fFA: 0.5, wpn: 0, lean: 0.1 };
const SP = {
  hover: { ...SB, lean: 0.12, head: 0.05, fUA: 0.75, fFA: 0.7, bUA: -0.65, bFA: 0.5, fTh: 0.4, fSh: -0.75, bTh: -0.05, bSh: -0.5 },
  cast: { ...SB, lean: -0.12, head: -0.25, fUA: 3.0, fFA: 0.15, bUA: -0.9, bFA: 0.4, fTh: 0.3, fSh: -0.55, bTh: -0.1, bSh: -0.45 },
  point: { ...SB, lean: 0.15, head: 0.05, fUA: 1.75, fFA: 0.05, bUA: -0.8, bFA: 0.3, fTh: 0.35, fSh: -0.65, bTh: -0.1, bSh: -0.45 },
  windup: { ...SB, lean: -0.3, head: -0.1, fUA: -0.9, fFA: 0.6, bUA: -1.1, bFA: 0.5, fTh: 0.3, fSh: -0.55, bTh: -0.2, bSh: -0.5 },
  sweep: { ...SB, lean: 0.45, head: 0.1, fUA: 2.0, fFA: 0.2, bUA: 1.5, bFA: 0.3, fTh: 0.5, fSh: -0.65, bTh: -0.3, bSh: -0.35 },
  dive: { ...SB, lean: 0.9, head: -0.35, fUA: 2.7, fFA: 0.05, bUA: 2.5, bFA: 0.1, fTh: 0.15, fSh: -0.2, bTh: -0.25, bSh: -0.3 },
  land: { ...SB, lean: 0.55, head: 0.1, fUA: 1.2, fFA: 0.3, bUA: -0.6, bFA: 0.4, fTh: 1.25, fSh: -1.9, bTh: 0.05, bSh: -1.5, sq: 0.94 },
  rise: { ...SB, lean: -0.05, head: -0.3, fUA: 2.3, fFA: 0.3, bUA: 2.1, bFA: 0.35, fTh: 0.3, fSh: -0.5, bTh: -0.1, bSh: -0.45 },
  kneel: { ...SB, lean: 0.4, head: 0.45, fUA: 0.5, fFA: 0.5, bUA: 0.2, bFA: 0.6, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9 },
  stagger: { ...SB, lean: -0.35, head: -0.4, fUA: 0.3, fFA: 0.4, bUA: -0.5, bFA: 0.6, fTh: 0.4, fSh: -0.6, bTh: -0.4, bSh: -0.5 },
  prone: { ...SB, lean: 0.4, head: 0.5, fUA: 2.2, fFA: 0.3, bUA: 2.0, bFA: 0.3, fTh: 0.2, fSh: -0.1, bTh: -0.1, bSh: -0.1, rot: 1.45 },
};

/** A lightning strike on a column of the summit. */
interface Strike { on: boolean; x: number; t: number; tele: number; life: number; w: number; mul: number; j: Float32Array }
const STRIKES = 40;
/** Wind streaks blowing across the view. */
interface Streak { x: number; y: number; len: number; life: number }

/** Height of a strike column above the floor (it falls from the clouds). */
const SKY = 330;

export class StormPrince extends Prince {
  pixelBox = [-315, -205, 315, 158] as const;
  atk: SAtk | null = null;
  last: SAtk | null = null;
  strikes: Strike[] = [];
  streaks: Streak[] = [];
  wind = 0;
  windDir = 1;
  windT = 6;
  windWarn = 0;
  hoverH = 14;
  gales: Gale[] = [];
  counted = new Set<number>();
  /** Out of reach in the clouds: how close he is to being dragged down (0..100). */
  ground = 0;
  aloftCd = 10;
  eyeCd = 0;
  eyeX = 0;
  eyeVx = 0;
  eyeR = 58;
  eyeN = 0;
  eyePulse = 0;
  eyeOn = 0;
  tx = 0;
  ty = 0;
  told = false;
  crackJ = new Float32Array(7);
  crackT = 0;
  crackX = 0;
  crackY = 0;

  constructor(x: number, y: number) {
    super('storm_prince', x, y, 30, 84, 60000, SP.hover, 2.0, 70, STORM_WING);
    this.name = 'The Prince of the Power of the Air';
    this.sub = 'Monarch of Storms';
    this.maxPoise = this.poise = 1400;
    this.kneelTime = 4;
    this.hitColor = '#cfe0ff';
    this.hitSound = 'hitHeavy';
    this.phaseMarks = [0.6, 0.25];
    this.p2At = 0.6;
    this.p3At = 0.25;
    this.airborne = true;
    this.wing = this.wingT = 0.1;
    for (let i = 0; i < STRIKES; i++) this.strikes.push({ on: false, x: 0, t: 0, tele: 0, life: 0, w: 30, mul: 1, j: new Float32Array(10) });
    for (let i = 0; i < 26; i++) this.streaks.push({ x: 0, y: 0, len: 0, life: 0 });
    this.style = { ...this.style, weapon: 'none', offhand: 'none' };
  }

  get dmg() {
    return 190 * this.ngMul * (this.phase >= 3 ? 1.16 : this.phase === 2 ? 1.08 : 1);
  }
  get spd() {
    return this.phase >= 3 ? 1.22 : this.phase === 2 ? 1.1 : 1;
  }
  get aloft() {
    return this.atk === 'aloft' || this.atk === 'eye';
  }

  // ------------------------------------------------------------ lifecycle
  updateDormant(dt: number) {
    this.hoverH = approach(this.hoverH, 4, dt * 10);
    this.y = this.floorY - this.hoverH;
    this.setPose(SP.kneel, 4);
    this.wingT = 0.05;
    this.beatAmp = 0.04;
  }

  updateIntro(dt: number) {
    const t = this.st;
    this.camF.x = this.x - 30;
    this.camF.y = this.y - 90;
    G.camera.focus = this.camF;
    if (t < 0.6) {
      this.setPose(SP.kneel, 4);
    } else if (this.introT === 0) {
      this.introT = 1;
      sfx('thunder', { vol: 1 });
      fx.flash('#cfe0ff', 0.35);
      G.camera.addTrauma(0.5 * shakeScale());
    } else if (t < 2.2) {
      // He rises; the wings open.
      this.setPose(SP.rise, 3);
      this.wingT = 1;
      this.beatAmp = 0.3;
      this.beatRate = 6;
      this.hoverH = approach(this.hoverH, 46, dt * 40);
      if (Math.random() < dt * 30) fx.spawn(PK.Spark, this.x + rand(-60, 60), this.y - rand(0, 100), rand(-40, 40), rand(-40, 40), 0.3, 1.5, 0.3, BOLT.c, 0, 1);
    } else if (this.introT === 1) {
      this.introT = 2;
      sfx('bossRoar', { pitch: 1.25, vol: 0.7 });
      sfx('stormGust', { vol: 1 });
      fx.ring(this.x, this.y - 50, 12, 260, BOLT.c, 0.8, 5);
      G.camera.addTrauma(0.6 * shakeScale());
      G.ui.banner('THE PRINCE OF THE STORM', 'The Prince of the Power of the Air', 'boss');
      this.strikeAt(this.x - 130, 0.25, 0);
      this.strikeAt(this.x + 130, 0.4, 0);
    } else if (t > 3.6) {
      this.hoverH = 14;
      this.beginFight();
      music.phase = 0;
      this.cd = 1.2;
      this.windT = 3;
    }
    if (t >= 2.2) this.hoverH = approach(this.hoverH, 14, dt * 30);
    this.y = this.floorY - this.hoverH;
  }

  updateKneel(dt: number) {
    this.hoverH = approach(this.hoverH, 0, dt * 120);
    this.y = this.floorY - this.hoverH;
    this.setPose(SP.kneel, 7);
    this.wingT = 0;
    this.beatAmp = 0.03;
    this.wind = approach(this.wind, 0, dt * 80);
    this.updateStrikes(dt);
    if (Math.random() < dt * 8) fx.spawn(PK.Smoke, this.x + rand(-20, 20), this.y - rand(10, 60), rand(-10, 10), -24, 1, 3, 10, '#3a4a6a', -10, 1);
  }

  onKneel() {
    this.atk = null;
    this.step = 0;
    G.ui.toast('The Prince of the Storm is down. Execute him!', 'good');
  }

  recover() {
    super.recover();
    sfx('stormGust', { vol: 0.8 });
    this.cd = 0.7;
    this.kneelTime = 4;
    this.aloftCd = Math.max(this.aloftCd, 8);
  }

  beginTransition() {
    this.phase = 2;
    this.toTransition(1300);
  }

  enterPhase3() {
    this.phase = 3;
    this.toTransition(1500);
  }

  private toTransition(poise: number) {
    this.state = 'transition';
    this.st = 0;
    this.introT = 0;
    this.atk = null;
    this.maxPoise = this.poise = poise;
    this.clearShots();
    for (const s of this.strikes) s.on = false;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.5, 0.4);
  }

  updateTransition(dt: number) {
    const t = this.st;
    this.camF.x = this.x;
    this.camF.y = this.floorY - 120;
    G.camera.focus = this.camF;
    this.setPose(SP.cast, 4);
    this.wingT = 1;
    this.beatAmp = 0.3;
    this.hoverH = approach(this.hoverH, 70, dt * 60);
    this.y = this.floorY - this.hoverH;
    this.wind = approach(this.wind, 0, dt * 100);
    if (t > 0.7 && this.introT === 0) {
      this.introT = 1;
      sfx('thunder', { vol: 1, pitch: this.phase >= 3 ? 0.8 : 1 });
      sfx('bossRoar', { pitch: 1.2, vol: 0.6 });
      fx.flash('#cfe0ff', 0.4);
      G.camera.addTrauma(0.7 * shakeScale());
      music.bossPhase(this.phase - 1);
      if (this.phase === 2) G.ui.banner('THE STORM BREAKS', 'Every wind over Elam bends to him', 'boss');
      else G.ui.banner('THE EYE OF THE STORM', 'Stand where the storm is still', 'boss');
      for (let i = -2; i <= 2; i++) if (i) this.strikeAt(this.x + i * 90, 0.3 + Math.abs(i) * 0.12, 0);
    }
    this.updateStrikes(dt);
    if (t > 2.4) {
      this.state = 'idle';
      this.st = 0;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.focus = null;
      if (this.phase === 2) this.start('aloft');
      else this.start('eye');
    }
  }

  die() {
    super.die();
    this.atk = null;
    this.introT = 0;
    for (const s of this.strikes) s.on = false;
    this.wind = 0;
  }

  yieldNow() {
    this.state = 'dead';
    this.dying = true;
    this.yielded = true;
    this.phase = 3;
    this.introT = 9;
    this.st = 9;
    this.invuln = 999;
    this.atk = null;
    this.hoverH = 0;
    this.y = this.floorY;
    this.x = clamp(this.x, this.left + 40, this.right - 40);
    this.setPose(SP.kneel, 99);
    this.pose = { ...SP.kneel };
    this.wing = this.wingT = 0;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    this.updateStrikes(dt);
    this.wind = 0;
    if (this.endT >= 0) {
      this.updateFall(dt);
      return;
    }
    // He drops out of the air to his knees.
    this.hoverH = approach(this.hoverH, 0, dt * 160);
    this.y = this.floorY - this.hoverH;
    this.setPose(t < 1 ? SP.stagger : SP.kneel, 5);
    this.wingT = t < 1 ? 0.7 : 0;
    this.beatAmp = 0.05;
    if (!this.yielded) {
      this.camF.x = this.x;
      this.camF.y = this.y - 70;
      G.camera.focus = this.camF;
    }
    if (this.introT === 0 && t > 0.1) {
      this.introT = 1;
      sfx('thunder', { vol: 0.8, pitch: 0.7 });
    }
    if (this.introT === 1 && this.hoverH <= 0.5) {
      this.introT = 2;
      sfx('bossSlam', { vol: 0.8 });
      G.camera.addTrauma(0.5 * shakeScale());
      fx.dust(this.x, this.floorY, 22, 2.2);
    }
    if (t > 2.6 && !this.yielded) {
      this.yielded = true;
      this.introT = 9;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  /**
   * The end of the Prince of the Storm: he tries once more to rise, the
   * wind tears loose from him, he is thrown down on the stones, and he
   * comes apart like a cloud. Resolves after about 4.4 s.
   */
  fall(): Promise<void> {
    if (this.endT >= 0) return Promise.resolve();
    if (!this.dying) this.yieldNow();
    this.endT = 0;
    this.introT = 20;
    return this.ending(8000);
  }

  private updateFall(dt: number) {
    const t = (this.endT += dt);
    this.camF.x = this.x;
    this.camF.y = this.floorY - 60;
    G.camera.focus = this.camF;
    const tier = G.renderer.tier;
    if (t < 0.9) {
      // One last beat of the wings; he lifts a hand's breadth.
      this.setPose(SP.rise, 4);
      this.wingT = 1;
      this.beatAmp = 0.35;
      this.beatRate = 9;
      this.hoverH = approach(this.hoverH, 16, dt * 30);
      if (this.introT === 20 && t > 0.2) {
        this.introT = 21;
        sfx('wingbeat', { vol: 0.9, pitch: 0.7 });
      }
    } else if (this.introT === 21) {
      this.introT = 22;
      // The wind tears loose from him: he is thrown down.
      sfx('thunder', { vol: 1 });
      sfx('stormGust', { vol: 1, pitch: 0.7 });
      sfx('bossSlam', { vol: 1, pitch: 0.8 });
      fx.flash('#cfe0ff', 0.45);
      G.camera.addTrauma(0.8 * shakeScale());
      this.hoverH = 0;
      this.pose = { ...SP.prone, rot: 0.6 };
      this.setPose(SP.prone, 10);
      fx.dust(this.x, this.floorY, 30, 2.6);
      fx.ring(this.x, this.floorY - 4, 10, 220, BOLT.c, 0.6, 4, 0.25);
      // The wings come apart into feathers and wind.
      const rx = this.rootX(), ry = this.rootY();
      for (let i = 0; i < (tier >= 2 ? 40 : 18); i++) fx.spawn(PK.Petal, rx + rand(-50, 50), ry + rand(-40, 20), rand(-160, 160), rand(-160, -20), rand(1.2, 2.2), rand(1.2, 2), 0.8, Math.random() < 0.5 ? STORM_WING.mid : STORM_WING.edge, 120, 1.5);
    } else if (t < 4.4) {
      this.wingT = 0;
      this.wing = approach(this.wing, 0, dt * 2);
      this.fade = approach(this.fade, 0, dt * 0.42);
      if (this.introT === 22 && t > 1.6) {
        this.introT = 23;
        sfx('stormGust', { vol: 0.7, pitch: 0.5 });
      }
      if (Math.random() < dt * (tier >= 2 ? 50 : 20)) fx.spawn(PK.Smoke, this.x + rand(-36, 36), this.floorY - rand(4, 30), rand(-20, 20) + 40, rand(-90, -40), rand(1.2, 2), 4, 14, Math.random() < 0.5 ? '#3a4a6a' : '#8aa6dc', -20, 1);
      if (Math.random() < dt * (tier >= 2 ? 20 : 8)) fx.spawn(PK.Spark, this.x + rand(-30, 30), this.floorY - rand(4, 24), rand(-60, 60), rand(-80, -20), 0.3, 1.5, 0.3, BOLT.c, 0, 1);
    }
    this.y = this.floorY - this.hoverH;
    if (t > 4.4) this.resolveEnd();
  }

  // ------------------------------------------------------------ hits
  /** Out of reach in the clouds: only a blow struck from the air lands (and drags him down). */
  guard(h: HitInfo): boolean {
    if (!this.aloft) return false;
    const p = G.world.player;
    const air = h.src === p && !p.grounded && (h.kind === 'melee' || h.kind === 'ability');
    if (air && this.atk === 'aloft') {
      this.ground += 20 + (h.heavy ? 12 : 0);
      if (this.ground >= 100) this.dragDown();
      return false;
    }
    if (!h.dot) {
      sfx('stormGust', { vol: 0.25, pitch: 1.6, gap: 120 });
      fx.hitSparks(h.px ?? this.x, h.py ?? this.cy, h.dir || 1, BOLT.c, 4, 0.6);
    }
    return true;
  }

  /** Brought down from the air: he crashes to the stones and kneels. */
  private dragDown() {
    this.ground = 0;
    G.ui.toast('The Prince of the Storm is dragged from the sky!', 'good');
    sfx('thunder', { vol: 0.8, pitch: 1.3 });
    fx.flash('#cfe0ff', 0.25);
    this.atk = 'crash';
    this.step = 0;
    this.st = 0;
    this.state = 'attack';
    this.ty = 0;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const W = G.world;
    this.updateWind(dt);
    this.updateStrikes(dt);
    this.trackGales();
    this.aloftCd -= dt;
    this.eyeCd -= dt;
    if (this.state === 'idle') {
      this.facePlayer();
      this.setPose(SP.hover, 6);
      this.wingT = 0.55;
      this.beatAmp = 0.22;
      this.beatRate = 5;
      // Glide at arm's reach of a buffet, a little above the stones.
      const want = clamp(p.x + sign(this.x - p.x || 1) * 92, this.left + 30, this.right - 30);
      const v = clamp((want - this.x) * 1.6, -150, 150) * this.spd;
      this.x += v * dt;
      this.hoverH = approach(this.hoverH, 14 + Math.sin(G.time * 2.2) * 3, dt * 60);
      this.y = this.floorY - this.hoverH;
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(Math.abs(p.x - this.x), p.y < this.floorY - 40);
    } else this.runAttack(dt, p, W);
  }

  private choose(dist: number, playerHigh: boolean) {
    if (this.phase >= 3 && this.eyeCd <= 0) return this.start('eye');
    if (this.aloftCd <= 0) return this.start('aloft');
    let pool: SAtk[];
    if (playerHigh) pool = ['row', 'dive', 'row'];
    else if (dist < 120) pool = this.phase >= 2 ? ['sweep', 'sweep', 'dive', 'row'] : ['sweep', 'sweep', 'row', 'dive'];
    else pool = ['row', 'dive', 'dive', 'row'];
    let k = choose(pool);
    if (k === this.last && Math.random() < 0.65) k = choose(pool);
    this.start(k);
  }

  private start(k: SAtk) {
    this.atk = k;
    this.last = k;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.struck = false;
    this.hitSet.clear();
    if (k === 'sweep') sfx('wingbeat', { pan: G.world.pan(this.x), vol: 0.7, pitch: 0.8 });
    if (k === 'row') sfx('galeCharge', { pan: G.world.pan(this.x), vol: 0.8, pitch: 0.7 });
    if (k === 'dive') sfx('wingbeat', { pan: G.world.pan(this.x), vol: 0.9, pitch: 0.6 });
    if (k === 'aloft') {
      this.ground = 0;
      this.aloftCd = 26;
      sfx('stormGust', { vol: 0.9 });
      sfx('wingbeat', { vol: 1, pitch: 0.55 });
      if (!this.told) {
        this.told = true;
        G.ui.toast('He rises out of reach. Strike him from the air, or strike down his Gales.', 'info');
      }
    }
    if (k === 'eye') {
      this.eyeCd = 30;
      this.eyeN = 0;
      this.eyePulse = 1.3;
      this.eyeOn = 0;
      const p = G.world.player;
      this.eyeX = clamp(p.x, this.left + 60, this.right - 60);
      this.eyeVx = rand(0, 1) < 0.5 ? -60 : 60;
      sfx('thunder', { vol: 0.9, pitch: 0.8 });
    }
  }

  private end(cd: number) {
    this.state = 'idle';
    this.atk = null;
    this.st = 0;
    this.cd = (cd + rand(0, 0.25)) / this.spd;
  }

  private runAttack(dt: number, p: typeof G.world.player, W: typeof G.world) {
    const t = this.st;
    const f = this.face;
    switch (this.atk) {
      case 'sweep': {
        // Wings drawn back (the tell), then a buffet that hurls Elior away. Twice in the later phases.
        const twice = this.phase >= 2;
        const w1 = 0.5;
        if (t < w1) {
          this.setPose(SP.windup, 8);
          this.wingT = 1;
          this.beatAmp = 0.05;
          this.x += f * -20 * dt;
        } else if (this.step === 0) {
          this.step = 1;
          this.hitSet.clear();
          sfx('bossSweep', { pan: W.pan(this.x), vol: 0.9 });
          sfx('stormGust', { pan: W.pan(this.x), vol: 0.7, pitch: 1.2 });
          fx.slash(this.x + f * 30, this.y - 46, 60, -1.4, 1.2, 10, f, '#d6e6ff', '#6a8ad0', 0.2);
        }
        if (this.step === 1 && t < w1 + 0.14) {
          this.setPose(SP.sweep, 16);
          this.wingT = 0.2;
          this.strike(f > 0 ? this.x - 10 : this.x - 92, this.y - 84, 102, 88, 1, { kx: f * 420, ky: -260, poise: 60 });
        }
        if (twice) {
          if (this.step === 1 && t > w1 + 0.32) {
            this.step = 2;
            this.face = -f;
            this.hitSet.clear();
          }
          if (this.step === 2 && t < w1 + 0.62) {
            this.setPose(SP.windup, 10);
            this.wingT = 1;
          } else if (this.step === 2) {
            this.step = 3;
            sfx('bossSweep', { pan: W.pan(this.x), vol: 0.9, pitch: 1.1 });
            fx.slash(this.x + this.face * 30, this.y - 46, 60, -1.4, 1.2, 10, this.face, '#d6e6ff', '#6a8ad0', 0.2);
          }
          if (this.step === 3 && t < w1 + 0.76) {
            this.setPose(SP.sweep, 16);
            this.wingT = 0.2;
            const ff = this.face;
            this.strike(ff > 0 ? this.x - 10 : this.x - 92, this.y - 84, 102, 88, 0.85, { kx: ff * 420, ky: -260, poise: 60 });
          }
          if (t > w1 + 1.25) this.end(0.75);
        } else if (t > w1 + 0.85) this.end(0.75);
        break;
      }
      case 'row': {
        // A hand to the clouds; lightning falls in rows across the summit. Stand in the gaps.
        this.setPose(t < 0.9 ? SP.cast : SP.hover, 7);
        this.wingT = 0.8;
        if (this.step === 0 && t > 0.3) {
          this.step = 1;
          sfx('thunder', { vol: 0.5, pitch: 1.4 });
          const v = G.camera.view();
          const gap = this.phase >= 3 ? 76 : 84;
          const x0 = Math.max(this.left - 20, v.x - 40) + rand(0, gap);
          const x1 = Math.min(this.right + 20, v.x + v.w + 40);
          const tA = this.phase >= 2 ? 0.85 : 0.95;
          let i = 0;
          for (let x = x0; x <= x1; x += gap, i++) {
            this.strikeAt(x, i % 2 ? tA + 0.6 : tA, 0.9);
            // The later phases strike the first row again.
            if (this.phase >= 2 && i % 2 === 0) this.strikeAt(x, tA + 1.2, 0.9);
          }
        }
        if (t > 1.3) this.end(1.0);
        break;
      }
      case 'dive': {
        this.diveStep(dt, t, p, W, 0);
        break;
      }
      case 'aloft': {
        this.aloftStep(dt, t, p, W);
        break;
      }
      case 'crash': {
        // Dragged out of the sky: he falls like a stone, and kneels.
        this.setPose(SP.stagger, 8);
        this.wingT = 0.9;
        this.beatAmp = 0.5;
        this.beatRate = 14;
        this.ty += 900 * dt;
        this.hoverH = Math.max(0, this.hoverH - this.ty * dt);
        this.y = this.floorY - this.hoverH;
        if (this.hoverH <= 0) {
          sfx('bossSlam', { pan: W.pan(this.x), vol: 1 });
          G.camera.addTrauma(0.6 * shakeScale());
          fx.dust(this.x, this.floorY, 26, 2.4);
          fx.ring(this.x, this.floorY - 3, 10, 120, '#cfe0ff', 0.4, 3, 0.25);
          this.atk = null;
          this.kneelTime = 4.6;
          this.kneel();
        }
        break;
      }
      case 'eye': {
        this.eyeStep(dt, t, p, W);
        break;
      }
    }
  }

  /** Rise, lock on, dive. from: height already gained (a dive out of the clouds). */
  private diveStep(dt: number, t: number, p: typeof G.world.player, W: typeof G.world, _from: number) {
    const f = this.face;
    const rise = 0.6, hang = 0.4;
    if (this.step === 0) {
      // Up into the air, drifting over Elior.
      this.setPose(SP.rise, 6);
      this.wingT = 1;
      this.beatAmp = 0.4;
      this.beatRate = 9;
      this.hoverH = approach(this.hoverH, 150, dt * 320);
      this.x = approach(this.x, clamp(p.x - f * 40, this.left, this.right), dt * 160);
      this.y = this.floorY - this.hoverH;
      if (t > rise) {
        this.step = 1;
        this.st = 0;
        this.tx = clamp(p.x, this.left, this.right);
        this.facePlayer();
        sfx('galeCharge', { pan: W.pan(this.x), vol: 0.7, pitch: 1.3 });
      }
    } else if (this.step === 1) {
      // The tell: wings fold, a glint, the mark on the stones.
      this.setPose(SP.dive, 10);
      this.wingT = 0.15;
      this.beatAmp = 0;
      if (t > hang) {
        this.step = 2;
        this.st = 0;
        this.hitSet.clear();
        sfx('whoosh', { pan: W.pan(this.x), vol: 0.9, pitch: 0.6 });
      }
    } else if (this.step === 2) {
      // Down like a bolt.
      this.pose.rot = approach(this.pose.rot, 0.5 * this.face, dt * 6);
      const dx = this.tx - this.x;
      const sp = 820;
      const d = Math.hypot(dx, this.hoverH) || 1;
      this.x += (dx / d) * sp * dt;
      this.hoverH = Math.max(0, this.hoverH - (this.hoverH / d) * sp * dt);
      this.y = this.floorY - this.hoverH;
      this.strike(this.x - 22, this.y - 70, 44, 74, 1.15, { kx: this.face * 300, ky: -300, poise: 70 });
      if (Math.random() < dt * 60) fx.spawn(PK.Spark, this.x + rand(-10, 10), this.y - rand(10, 70), rand(-30, 30), -80, 0.25, 1.5, 0.3, BOLT.c, 0, 1);
      if (this.hoverH <= 0.5 || Math.abs(dx) < 4 && this.hoverH < 2) {
        this.step = 3;
        this.st = 0;
        this.hoverH = 0;
        this.y = this.floorY;
        this.pose.rot = 0;
        this.hitSet.clear();
        sfx('bossSlam', { pan: W.pan(this.x), vol: 1 });
        sfx('thunder', { pan: W.pan(this.x), vol: 0.5, pitch: 1.5 });
        G.camera.addTrauma(0.55 * shakeScale());
        fx.dust(this.x, this.floorY, 22, 2.2);
        fx.ring(this.x, this.floorY - 3, 10, 100, '#cfe0ff', 0.4, 4, 0.25);
        // A shock along the stones: jump it.
        this.strike(this.x - 96, this.floorY - 16, 192, 16, 0.6, { ky: -320, poise: 50 });
      }
    } else {
      // Landed: the opening.
      this.setPose(SP.land, 10);
      this.wingT = 0.6;
      if (t > 0.25) this.hoverH = approach(this.hoverH, 14, dt * 30);
      this.y = this.floorY - this.hoverH;
      if (t > (this.phase >= 3 ? 0.6 : 0.8)) this.end(0.6);
    }
  }

  /** Hover spots over the summit's ledges, out of reach of the stones. */
  private spot(i: number) {
    const W = G.world;
    const n = W.grid.w;
    // Over the three ledges: left, middle, right.
    const x = i === 0 ? n * 0.25 * TILE : i === 1 ? n * 0.46 * TILE : n * 0.69 * TILE;
    return clamp(x, this.left + 60, this.right - 60);
  }

  private aloftStep(dt: number, t: number, p: typeof G.world.player, W: typeof G.world) {
    const life = this.phase >= 2 ? 11 : 9.5;
    if (this.step === 0) {
      // Up into the storm; the Gales come.
      this.setPose(SP.rise, 5);
      this.wingT = 1;
      this.beatAmp = 0.4;
      this.beatRate = 8;
      if (t < 0.05) {
        // The ledge nearest Elior that he is not already over.
        let best = 0, bd = 1e9;
        for (let i = 0; i < 3; i++) {
          const d = Math.abs(this.spot(i) - p.x) + rand(0, 60);
          if (d < bd) { bd = d; best = i; }
        }
        this.tx = this.spot(best);
      }
      this.x = approach(this.x, this.tx, dt * 220);
      this.hoverH = approach(this.hoverH, this.hoverAt(this.x), dt * 200);
      this.y = this.floorY - this.hoverH;
      if (t > 1.1) {
        this.step = 1;
        this.st = 0;
        this.cd = 0.8;
        const n = this.phase >= 2 ? 3 : 2;
        const v = G.camera.view();
        for (let i = 0; i < n; i++) {
          const gx = clamp(i === 0 ? v.x + 50 : i === 1 ? v.x + v.w - 50 : this.x, this.left, this.right);
          const g = W.spawnEnemy('gale', gx, this.floorY - rand(150, 200)) as Gale;
          g.xpOverride = 40;
          this.gales.push(g);
          fx.ring(g.x, g.y, 4, 40, BOLT.c, 0.4, 2);
          sfx('galeCrackle', { pan: W.pan(gx), vol: 0.6 });
        }
      }
    } else if (this.step === 1) {
      // Over the ledges, out of reach, calling bolts down on Elior.
      this.wingT = 0.85;
      this.beatAmp = 0.28;
      this.beatRate = 5;
      this.facePlayer();
      this.x = approach(this.x, this.tx, dt * 40);
      this.hoverH = approach(this.hoverH, this.hoverAt(this.x) + Math.sin(G.time * 1.8) * 4, dt * 60);
      this.y = this.floorY - this.hoverH;
      this.cd -= dt * this.spd;
      this.setPose(this.cd < 0.35 ? SP.point : SP.hover, 7);
      if (this.cd <= 0) {
        this.cd = this.phase >= 2 ? 1.35 : 1.6;
        this.strikeAt(p.x + p.body.vx * 0.25, 0.8, 0.8);
        sfx('galeCharge', { pan: W.pan(p.x), vol: 0.5, pitch: 1.1 });
        // Now and then, drift to another ledge.
        if (Math.random() < 0.35) this.tx = this.spot(Math.floor(rand(0, 3)));
      }
      if (t > life) {
        // Not brought down: he comes down on his own terms.
        this.atk = 'dive';
        this.step = 1;
        this.st = 0;
        this.tx = clamp(p.x, this.left, this.right);
        sfx('galeCharge', { pan: W.pan(this.x), vol: 0.7, pitch: 1.3 });
      }
    }
  }

  /** How high he hangs over x: above the ledge there, out of reach from the stones. */
  private hoverAt(x: number) {
    const mid = Math.abs(x - this.spot(1)) < 80;
    return mid ? 214 : 150;
  }

  private eyeStep(dt: number, t: number, p: typeof G.world.player, W: typeof G.world) {
    // He becomes the storm: everything is struck but the eye, which wanders.
    const pulses = 8;
    this.setPose(SP.cast, 4);
    this.wingT = 1;
    this.beatAmp = 0.25;
    this.beatRate = 4;
    this.x = approach(this.x, this.spot(1), dt * 120);
    this.hoverH = approach(this.hoverH, 236, dt * 140);
    this.y = this.floorY - this.hoverH;
    this.eyeOn = approach(this.eyeOn, this.eyeN < pulses ? 1 : 0, dt * 2);
    // The eye drifts; it turns at the walls and now and then on its own.
    this.eyeX += this.eyeVx * dt;
    if (this.eyeX < this.left + 70 || this.eyeX > this.right - 70) this.eyeVx = -this.eyeVx;
    this.eyeX = clamp(this.eyeX, this.left + 70, this.right - 70);
    if (Math.random() < dt * 0.35) this.eyeVx = -this.eyeVx;
    if (this.eyeN < pulses) {
      this.eyePulse -= dt;
      if (this.eyePulse <= 0) {
        this.eyeN++;
        this.eyePulse = 1.15;
        this.hitSet.clear();
        sfx('thunder', { pan: W.pan(p.x), vol: 0.75, pitch: rand(0.9, 1.2) });
        sfx('galeBolt', { pan: W.pan(p.x), vol: 0.6 });
        G.camera.addTrauma(0.25 * shakeScale());
        fx.flash('#cfe0ff', 0.12);
        // Bolts across the view, outside the eye.
        const v = G.camera.view();
        for (let x = v.x + rand(0, 40); x < v.x + v.w; x += 44) {
          if (Math.abs(x - this.eyeX) < this.eyeR + 6) continue;
          this.strikeAt(x, 0, 0);
        }
        if (Math.abs(p.x - this.eyeX) > this.eyeR - 4 && p.state !== 'dead') {
          this.strike(p.x - 4, p.y - 40, 8, 40, 0.7, { kind: 'proj', unblockable: true, kx: 0, ky: -180, poise: 40 });
        }
      }
    } else if (t > pulses * 1.15 + 1.6) {
      // Down out of the storm onto Elior.
      this.atk = 'dive';
      this.step = 1;
      this.st = 0;
      this.tx = clamp(p.x, this.left, this.right);
      sfx('galeCharge', { pan: W.pan(this.x), vol: 0.7, pitch: 1.3 });
    }
  }

  // ------------------------------------------------------------ the storm's domain
  private updateWind(dt: number) {
    const str = this.phase >= 3 ? 82 : this.phase === 2 ? 66 : 48;
    this.windT -= dt;
    if (this.windT < 1.2 && this.windWarn === 0) {
      // The tell: the wind falls still and the streaks turn.
      this.windWarn = 1;
      sfx('stormGust', { vol: 0.8, pitch: this.windDir > 0 ? 0.8 : 1.1 });
    }
    if (this.windT <= 0) {
      this.windDir = -this.windDir;
      this.windT = this.phase >= 3 ? 5.5 : 7;
      this.windWarn = 0;
    }
    const want = this.windT < 1.2 ? 0 : this.windDir * str;
    this.wind = approach(this.wind, want, dt * 90);
    if (Math.abs(this.wind) > 1) this.shove(this.wind * dt);
  }

  private trackGales() {
    for (let i = this.gales.length - 1; i >= 0; i--) {
      const g = this.gales[i];
      if (g.dying || g.remove) {
        // A Gale struck down while he hangs in the air drags him lower.
        if (g.dying && !this.counted.has(g.id) && this.atk === 'aloft' && this.step === 1) {
          this.counted.add(g.id);
          this.ground += 40;
          fx.streak(g.x, g.y, this.x, this.y - 40, BOLT.c, 0.3, 2);
          if (this.ground >= 100) this.dragDown();
        }
        this.gales.splice(i, 1);
      }
    }
  }

  strikeAt(x: number, tele: number, mul: number) {
    for (const s of this.strikes) {
      if (s.on) continue;
      s.on = true;
      s.x = clamp(x, this.left - 20, this.right + 20);
      s.t = 0;
      s.tele = tele;
      s.life = 0.28;
      s.w = 30;
      s.mul = mul;
      jag(s.j, 7);
      return s;
    }
    return null;
  }

  private updateStrikes(dt: number) {
    const W = G.world;
    for (const s of this.strikes) {
      if (!s.on) continue;
      const was = s.t;
      s.t += dt;
      if (was < s.tele && s.t >= s.tele) {
        if (s.mul > 0) sfx('galeBolt', { pan: W.pan(s.x), vol: 0.55, pitch: rand(0.9, 1.15), gap: 40 });
        fx.dust(s.x, this.floorY, 4, 1, '#9aaac8');
        fx.spawn(PK.Spark, s.x, this.floorY - 2, rand(-80, 80), rand(-160, -60), 0.35, 1.8, 0.3, BOLT.hot, 300, 1);
        if (s.mul > 0 && this.fighting) {
          this.hitSet.clear();
          this.strike(s.x - s.w / 2, this.floorY - SKY, s.w, SKY, s.mul, { kind: 'proj', unblockable: true, kx: 0, ky: -200, poise: 40 });
        }
        if (Math.random() < 0.5) jag(s.j, 7);
      }
      if (s.t > s.tele + s.life) s.on = false;
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    this.animRig(dt);
    // Wind streaks across the view (fewer on the low tier).
    const tier = G.renderer.tier;
    const v = G.camera.view();
    const n = tier >= 2 ? 26 : tier === 1 ? 16 : 8;
    const strong = Math.abs(this.wind) > 4 && this.fade > 0.5;
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      if (s.life > 0) {
        s.life -= dt;
        s.x += this.wind * 6 * dt;
      } else if (strong && i < n && Math.random() < dt * 3) {
        s.life = rand(0.4, 0.9);
        s.len = rand(14, 34);
        s.x = this.wind > 0 ? v.x + rand(-40, v.w * 0.6) : v.x + rand(v.w * 0.4, v.w + 40);
        s.y = v.y + rand(10, v.h - 10);
      }
    }
    // Crackle between the wingtips.
    this.crackT -= dt;
    if (this.crackT <= 0 && this.fade > 0.5 && this.state !== 'dormant') {
      this.crackT = rand(0.25, 0.7) / (tier >= 1 ? 1 : 0.5);
      const tp = wingTip(this.rootX(), this.rootY(), this.face, this.wing, this.flapNow(), this.wingL);
      this.crackX = tp.x;
      this.crackY = tp.y;
      jag(this.crackJ, 4);
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const tier = G.renderer.tier;
    // Wind.
    if (this.fade > 0.05) {
      ctx.strokeStyle = '#c8d8f0';
      ctx.lineWidth = 1;
      for (const s of this.streaks) {
        if (s.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, s.life * 2) * 0.45;
        ctx.beginPath();
        ctx.moveTo(Math.round(s.x), Math.round(s.y) + 0.5);
        ctx.lineTo(Math.round(s.x - sign(this.wind) * s.len), Math.round(s.y) + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // The eye of the storm: a still ring of clear air on the stones.
    if (this.eyeOn > 0.02) this.drawEye(ctx);
    // Strike tells and bolts.
    for (const s of this.strikes) {
      if (!s.on) continue;
      if (s.t < s.tele) {
        const u = s.t / s.tele;
        if (s.mul > 0) this.floorMark(ctx, s.x, this.floorY, 16, u, BOLT.c);
        // A thin flicker where it will fall, brightening.
        if (Math.sin(G.time * 40 + s.x) > 0.2 - u) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.18 + u * 0.4;
          ctx.fillStyle = BOLT.c;
          ctx.fillRect(Math.round(s.x), this.floorY - SKY, 1, SKY);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        const a = 1 - (s.t - s.tele) / s.life;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.x, this.floorY - 6, 26, BOLT.c, a * 0.7);
        ctx.globalCompositeOperation = 'source-over';
        drawBolt(ctx, s.x, this.floorY - SKY, s.x, this.floorY, s.j, a, 2);
      }
    }
    // The dive mark.
    if (this.atk === 'dive' && this.step >= 1 && this.step < 3) this.floorMark(ctx, this.tx, this.floorY, 34, this.step === 1 ? this.st / 0.4 : 1, BOLT.c);
    if (this.fade <= 0.02) return;
    ctx.globalAlpha = this.fade;
    // Storm aura behind him.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 46, 70, '#6a8ad0', (this.aloft ? 0.32 : 0.18) * this.fade);
    ctx.globalCompositeOperation = 'source-over';
    this.drawWings(ctx, true);
    drawRibbon(ctx, this.cape, 12, 18, '#1e2a4a', '#04060c');
    this.drawRig(ctx);
    this.drawWings(ctx, false);
    this.drawCrown(ctx, tier);
    ctx.globalAlpha = 1;
    // Crackle.
    if (this.crackT > 0.12 && this.fade > 0.5 && tier >= 1) {
      const rx = this.rootX(), ry = this.rootY();
      drawBolt(ctx, this.crackX, this.crackY, rx, ry, this.crackJ, 0.7, 1);
    }
    this.drawTells(ctx);
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 40, 60, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** The crown of cloud: dark puffs about his head with a cold light inside. */
  private drawCrown(ctx: Ctx, tier: number) {
    const hx = this.wx(this.j.headX), hy = this.wy(this.j.headY) - 9;
    const t = G.time;
    ctx.fillStyle = '#2a3654';
    for (let i = 0; i < 5; i++) {
      const a = t * 0.8 + i * 1.2566;
      const r = 7 + Math.sin(t * 2 + i) * 1.5;
      ellipse(ctx, Math.round(hx + Math.cos(a) * 11), Math.round(hy + Math.sin(a) * 3.5), r, r * 0.6, 0, '#2a3654');
    }
    ellipse(ctx, Math.round(hx), Math.round(hy - 1), 9, 4, 0, '#3e4c70');
    // Three tines of light.
    ctx.fillStyle = BOLT.hot;
    for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(hx + i * 6), Math.round(hy - 8 - (i === 0 ? 3 : 0)), 1, 5 + (i === 0 ? 3 : 0));
    if (tier >= 1) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hx, hy - 3, 16, BOLT.c, 0.35 + Math.sin(t * 6) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawTells(ctx: Ctx) {
    if (this.state !== 'attack') return;
    const t = this.st;
    if (this.atk === 'sweep' && ((this.step === 0 && t < 0.4) || (this.step === 2))) {
      const tp = wingTip(this.rootX(), this.rootY(), this.face, this.wing, this.flapNow(), this.wingL);
      this.glint(ctx, tp.x, tp.y, BOLT.c, 1.1);
    }
    if (this.atk === 'row' && t < 0.5) {
      const h = this.hand();
      this.glint(ctx, h.x, h.y - 4, BOLT.c, 1.2);
    }
    if (this.atk === 'dive' && this.step === 1) this.glint(ctx, this.x, this.y - 60, BOLT.hot, 1.3);
    if (this.atk === 'aloft' && this.step === 1) {
      // How close he is to falling: a ring that fills.
      const u = clamp(this.ground / 100, 0, 1);
      const x = Math.round(this.x), y = Math.round(this.y + 10);
      ctx.strokeStyle = '#0a0e18';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
      if (u > 0) {
        ctx.strokeStyle = '#ffe6a8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
        ctx.stroke();
      }
    }
    if (this.aloft && this.step === 1 && this.cd < 0.35) {
      const h = this.hand();
      this.glint(ctx, h.x, h.y, BOLT.c, 0.9);
    }
  }

  private drawEye(ctx: Ctx) {
    const a = this.eyeOn;
    const v = G.camera.view();
    const fy = this.floorY;
    const x = Math.round(this.eyeX), r = this.eyeR;
    const warn = this.eyeN < 8 ? clamp(1 - this.eyePulse / 0.8, 0, 1) : 0;
    // The struck ground outside the eye darkens and flickers before each blow.
    ctx.globalAlpha = a * (0.22 + warn * 0.3);
    ctx.fillStyle = '#0a1024';
    ctx.fillRect(Math.floor(v.x), Math.floor(v.y), Math.ceil(x - r - v.x), Math.ceil(v.h));
    ctx.fillRect(x + r, Math.floor(v.y), Math.ceil(v.x + v.w - (x + r)), Math.ceil(v.h));
    ctx.globalAlpha = 1;
    if (warn > 0 && Math.sin(G.time * 36) > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * warn * 0.5;
      ctx.fillStyle = BOLT.c;
      ctx.fillRect(Math.floor(v.x), fy - 2, Math.ceil(x - r - v.x), 2);
      ctx.fillRect(x + r, fy - 2, Math.ceil(v.x + v.w - (x + r)), 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // The eye: clear, pale, edged in light.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, fy - 30, r * 1.3, '#dfe9ff', 0.25 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#f4f8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r, fy - 1);
    ctx.lineTo(x - r, fy - 70);
    ctx.moveTo(x + r, fy - 1);
    ctx.lineTo(x + r, fy - 70);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, fy - 1, r, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  lights() {
    if (this.fade < 0.05) return;
    lighting.add(this.x, this.y - 50, 120, '#8aa6dc', (this.aloft ? 0.6 : 0.4) * this.fade, 0.35);
    lighting.add(this.wx(this.j.headX), this.wy(this.j.headY) - 10, 40, BOLT.c, 0.6 * this.fade, 0.6);
    for (const s of this.strikes) {
      if (!s.on) continue;
      if (s.t >= s.tele) lighting.add(s.x, this.floorY - 60, 110, BOLT.c, 1 - (s.t - s.tele) / s.life, 0.8);
    }
    if (this.eyeOn > 0.1) lighting.add(this.eyeX, this.floorY - 30, 80, '#dfe9ff', 0.5 * this.eyeOn, 0.4);
  }
}

// =====================================================================
// THE PRINCE OF THE KINGDOM OF PERSIA
// =====================================================================

type PAtk = 'string' | 'guard' | 'counter' | 'lunge' | 'sweep' | 'volley' | 'arise';

const PB: Pose = { ...SENT_BASE, bUA: 0.9, bFA: 1.2, fUA: 0.6, fFA: 1.0, wpn: 0.9 };
const PP = {
  ready: { ...PB, lean: 0.15, fUA: 0.95, fFA: 0.5, wpn: 0.55, fTh: 0.45, fSh: -0.45, bTh: -0.35, bSh: -0.2 },
  draw: { ...PB, lean: -0.1, fUA: -0.45, fFA: 1.95, bUA: 1.0, bFA: 0.6, wpn: 0.05, fTh: 0.3, fSh: -0.3, bTh: -0.5, bSh: -0.3 },
  thrust: { ...PB, lean: 0.45, fUA: 1.6, fFA: -0.05, bUA: 1.4, bFA: 0.1, wpn: 0.0, fTh: 0.95, fSh: -0.6, bTh: -0.9, bSh: -0.1 },
  high: { ...PB, lean: -0.15, fUA: 3.0, fFA: 0.35, bUA: 2.6, bFA: 0.5, wpn: 0.3, fTh: 0.25, fSh: -0.2, bTh: -0.45, bSh: -0.2 },
  slash: { ...PB, lean: 0.5, fUA: 0.8, fFA: 0.05, bUA: 0.9, bFA: 0.2, wpn: -0.05, fTh: 0.8, fSh: -0.7, bTh: -0.7, bSh: -0.2 },
  guard: { ...PB, lean: 0.2, fUA: 0.75, fFA: 1.35, bUA: 1.1, bFA: 1.2, wpn: 0.35, fTh: 0.5, fSh: -0.55, bTh: -0.4, bSh: -0.3 },
  crouch: { ...PB, lean: 0.4, fUA: 0.2, fFA: 1.7, bUA: 0.2, bFA: 1.5, wpn: 0.6, fTh: 1.0, fSh: -1.6, bTh: 0.2, bSh: -1.4, sq: 0.94 },
  lift: { ...PB, lean: -0.2, head: -0.35, fUA: 2.9, fFA: 0.1, wpn: 0.2, bUA: 2.2, bFA: 0.5, fTh: 0.15, fSh: -0.1, bTh: -0.15, bSh: -0.1 },
  spread: { ...PB, lean: -0.15, head: -0.2, fUA: 0.4, fFA: 0.6, bUA: -0.4, bFA: 0.5, fTh: 0.5, fSh: -0.7, bTh: -0.4, bSh: -0.4, sq: 0.96 },
  spin: { ...PB, lean: 0.3, fUA: 1.9, fFA: 0.1, bUA: -1.2, bFA: 0.2, wpn: 0.05, fTh: 0.6, fSh: -0.7, bTh: -0.5, bSh: -0.3 },
  kneel: { ...PB, lean: 0.35, head: 0.4, fUA: 0.9, fFA: 0.55, bUA: 0.9, bFA: 0.75, wpn: 1.55, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9 },
  planted: { ...PB, lean: 0.05, head: 0.15, fUA: 0.65, fFA: 0.6, bUA: 0.7, bFA: 0.75, wpn: 1.35, fTh: 0.08, fSh: -0.05, bTh: -0.1, bSh: -0.05 },
  stagger: { ...PB, lean: -0.35, head: -0.4, fUA: 0.3, fFA: 0.4, bUA: -0.5, bFA: 0.6, wpn: 0.9, fTh: 0.4, fSh: -0.3, bTh: -0.6, bSh: -0.5 },
  prone: { ...PB, lean: 0.4, head: 0.5, fUA: 2.4, fFA: 0.2, bUA: 2.2, bFA: 0.3, wpn: 0.4, fTh: 0.2, fSh: -0.1, bTh: -0.1, bSh: -0.1, rot: 1.45 },
};

/** A spear that falls from above. */
interface Spear { on: boolean; x: number; y: number; vy: number; t: number; tele: number; stuck: number }
const SPEARS = 16;
/** Seconds the Twenty-First Day lasts (one per day). */
const DAYS = 21;

export class PersiaPrince extends Prince {
  pixelBox = [-135, -115, 135, 26] as const;
  atk: PAtk | null = null;
  last: PAtk | null = null;
  n = 0;
  hits = 3;
  spears: Spear[] = [];
  hosts: Undying[] = [];
  ariseCd = 8;
  /** The Twenty-First Day: 0 not yet; 1..21 the day; 22 the light has come. */
  day = 0;
  dayT = 0;
  broken = false;
  enraged = false;
  lightT = -1;
  lunge = 0;
  told = false;
  /** Column of light at the end (0..1 width). */
  column = 0;
  columnA = 0;
  sinkY = 0;

  constructor(x: number, y: number) {
    super('persia_prince', x, y, 32, 90, 80000, PP.planted, 2.1, 66, PERSIA_WING);
    this.name = 'The Prince of the Kingdom of Persia';
    this.sub = 'The Monarch';
    this.maxPoise = this.poise = 1500;
    this.kneelTime = 3.6;
    this.hitColor = '#ffe6a8';
    this.hitSound = 'hitMetal';
    this.phaseMarks = [0.65, 0.3];
    this.p2At = 0.65;
    this.p3At = 0.3;
    this.wing = this.wingT = 0.15;
    this.beatAmp = 0.04;
    for (let i = 0; i < SPEARS; i++) this.spears.push({ on: false, x: 0, y: 0, vy: 0, t: 0, tele: 0, stuck: 0 });
  }

  get dmg() {
    return 200 * this.ngMul * (this.enraged ? 1.15 : this.phase >= 2 ? 1.06 : 1);
  }
  get spd() {
    return this.enraged ? 1.25 : this.day > 0 && !this.broken ? 1.2 : this.phase === 2 ? 1.1 : 1;
  }
  /** While the Twenty-First Day lasts, nothing touches him. */
  get untouchable() {
    return this.day > 0 && !this.broken;
  }

  // ------------------------------------------------------------ lifecycle
  updateDormant(_dt: number) {
    this.setPose(PP.planted, 4);
    this.wingT = 0.15;
  }

  updateIntro(dt: number) {
    const t = this.st;
    this.camF.x = this.x - 30;
    this.camF.y = this.y - 100;
    G.camera.focus = this.camF;
    if (t < 0.5) {
      this.setPose(PP.planted, 4);
    } else if (this.introT === 0) {
      this.introT = 1;
      sfx('princeHorn', { vol: 0.8 });
      sfx('wingbeat', { vol: 0.9, pitch: 0.5 });
    } else if (t < 2.0) {
      this.setPose(PP.lift, 3);
      this.wingT = 1;
      this.beatAmp = 0.12;
    } else if (this.introT === 1) {
      this.introT = 2;
      sfx('monarchRoar', { vol: 0.9 });
      sfx('bossSlam', { vol: 0.8, pitch: 0.7 });
      G.camera.addTrauma(0.7 * shakeScale());
      fx.ring(this.x, this.y - 2, 10, 260, LIGHT.gold, 0.6, 5, 0.25);
      fx.dust(this.x, this.y, 26, 2.4);
      G.ui.banner('THE PRINCE OF THE KINGDOM OF PERSIA', 'He withstood the messenger one and twenty days', 'boss');
    } else if (t > 2.4) {
      this.setPose(PP.ready, 5);
      this.wingT = 0.3;
    }
    if (t > 3.8) {
      this.beginFight();
      music.phase = 0;
      this.cd = 1.0;
    }
    void dt;
  }

  updateKneel(dt: number) {
    this.setPose(PP.kneel, 7);
    this.wingT = 0.05;
    this.updateSpears(dt);
    this.updateLight(dt);
    if (Math.random() < dt * 6) fx.spawn(PK.Ember, this.x + rand(-18, 18), this.y - rand(10, 70), rand(-10, 10), -30, 1, 2, 0.5, LIGHT.gold, -20, 1);
  }

  onKneel() {
    this.atk = null;
    this.step = 0;
    this.lunge = 0;
    G.ui.toast(this.broken && !this.enraged ? 'His guard is broken. Strike now!' : 'The prince kneels. Execute him!', 'good');
  }

  recover() {
    super.recover();
    this.cd = this.enraged ? 0.5 : 0.8;
    if (this.broken && !this.enraged) {
      // Up again, and furious: the final fight.
      this.enraged = true;
      this.maxPoise = this.poise = 950;
      this.kneelTime = 3.2;
      sfx('monarchRoar', { vol: 1, pitch: 1.1 });
      G.camera.addTrauma(0.6 * shakeScale());
      fx.ring(this.x, this.y - 40, 10, 220, '#ff9a2a', 0.6, 5);
      G.ui.banner('THE PRINCE, ENRAGED', 'His guard is broken. He will not yield.', 'boss');
      music.bossPhase(3);
    }
  }

  beginTransition() {
    // Arise.
    this.phase = 2;
    this.toTransition(1500);
  }

  enterPhase3() {
    // The Twenty-First Day.
    this.phase = 3;
    this.toTransition(99999);
  }

  private toTransition(poise: number) {
    this.state = 'transition';
    this.st = 0;
    this.introT = 0;
    this.atk = null;
    this.lunge = 0;
    this.maxPoise = this.poise = poise;
    this.clearShots();
    for (const s of this.spears) s.on = false;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.5, 0.4);
  }

  updateTransition(dt: number) {
    const t = this.st;
    this.camF.x = this.x;
    this.camF.y = this.y - 100;
    G.camera.focus = this.camF;
    this.updateSpears(dt);
    if (this.phase === 2) {
      // ARISE: the spear raised, the host stands up out of the stones.
      this.setPose(t < 1.6 ? PP.lift : PP.ready, 4);
      this.wingT = 1;
      this.beatAmp = 0.15;
      if (t > 0.6 && this.introT === 0) {
        this.introT = 1;
        sfx('princeHorn', { vol: 1 });
        sfx('monarchRoar', { vol: 0.8 });
        G.camera.addTrauma(0.6 * shakeScale());
        music.bossPhase(1);
        G.ui.banner('ARISE', 'The host of the prince stands with him', 'boss');
        this.raise(3);
      }
      if (t > 2.8) this.endTransition();
    } else {
      // THE TWENTY-FIRST DAY.
      this.setPose(t < 1.4 ? PP.lift : PP.guard, 4);
      this.wingT = 1;
      this.beatAmp = 0.1;
      if (t > 0.5 && this.introT === 0) {
        this.introT = 1;
        sfx('monarchRoar', { vol: 1, pitch: 0.9 });
        sfx('bell', { vol: 0.8, pitch: 0.6 });
        fx.flash('#ffcf6b', 0.3);
        G.camera.addTrauma(0.7 * shakeScale());
        music.bossPhase(2);
        G.ui.banner('THE TWENTY-FIRST DAY', 'Nothing can touch him. Stand, and withstand.', 'boss');
      }
      if (t > 2.6) {
        this.day = 1;
        this.dayT = 0;
        G.ui.caption('Day 1 of 21');
        this.endTransition();
      }
    }
  }

  private endTransition() {
    this.state = 'idle';
    this.st = 0;
    this.cd = 0.5;
    G.inCutscene = false;
    G.ui.cinematicBars(false);
    G.camera.focus = null;
  }

  die() {
    // His host falls with him, for good.
    for (const u of this.hosts) {
      u.risen = true;
      u.empowered = false;
    }
    super.die();
    this.atk = null;
    this.introT = 0;
    this.lunge = 0;
    for (const s of this.spears) s.on = false;
    if (this.day > 0) G.ui.caption(null);
  }

  yieldNow() {
    this.state = 'dead';
    this.dying = true;
    this.yielded = true;
    this.phase = 3;
    this.introT = 9;
    this.st = 9;
    this.invuln = 999;
    this.atk = null;
    this.y = this.floorY;
    this.x = clamp(this.x, this.left + 40, this.right - 40);
    this.pose = { ...PP.kneel };
    this.setPose(PP.kneel, 99);
    this.wing = this.wingT = 0.05;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    this.updateSpears(dt);
    this.updateLight(dt);
    if (this.endT >= 0) {
      this.updateCast(dt);
      return;
    }
    this.setPose(t < 0.9 ? PP.stagger : PP.kneel, 5);
    this.wingT = t < 0.9 ? 0.8 : 0.05;
    if (!this.yielded) {
      this.camF.x = this.x;
      this.camF.y = this.y - 80;
      G.camera.focus = this.camF;
    }
    if (this.introT === 0 && t > 0.1) {
      this.introT = 1;
      sfx('monarchRoar', { vol: 0.7, pitch: 0.8 });
    }
    if (this.introT === 1 && t > 0.9) {
      this.introT = 2;
      sfx('bossSlam', { vol: 0.7, pitch: 0.8 });
      G.camera.addTrauma(0.4 * shakeScale());
      fx.dust(this.x, this.y, 20, 2);
    }
    if (t > 2.6 && !this.yielded) {
      this.yielded = true;
      this.introT = 9;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  /**
   * Help comes. A column of light falls from above on the prince; he lifts
   * his spear against it, is thrown down, and dissolves. Elior's hand is not
   * the one that does it. Resolves after about 4.8 s.
   */
  castDown(): Promise<void> {
    if (this.endT >= 0) return Promise.resolve();
    if (!this.dying) this.yieldNow();
    this.endT = 0;
    this.introT = 30;
    return this.ending(9000);
  }

  private updateCast(dt: number) {
    const t = (this.endT += dt);
    const tier = G.renderer.tier;
    this.camF.x = this.x;
    this.camF.y = this.floorY - 90;
    G.camera.focus = this.camF;
    if (t < 1.1) {
      // He rises to his feet and lifts his spear at the light gathering above.
      this.setPose(PP.lift, 4);
      this.wingT = 1;
      this.beatAmp = 0.2;
      this.beatRate = 8;
      this.column = approach(this.column, 0.18, dt * 0.4);
      this.columnA = approach(this.columnA, 0.6, dt * 1.2);
      if (this.introT === 30 && t > 0.15) {
        this.introT = 31;
        sfx('beamCharge', { vol: 0.8, pitch: 0.8 });
      }
    } else if (this.introT === 31) {
      this.introT = 32;
      // The light falls: he is thrown down.
      sfx('trumpet', { vol: 1 });
      sfx('elemHoly', { vol: 1 });
      sfx('bossSlam', { vol: 1, pitch: 0.7 });
      fx.flash('#ffffff', 0.7);
      G.camera.addTrauma(0.9 * shakeScale());
      this.column = 1;
      this.columnA = 1;
      this.pose = { ...PP.prone, rot: 0.5 };
      this.setPose(PP.prone, 10);
      this.wingT = 0;
      fx.dust(this.x, this.floorY, 30, 3);
      fx.ring(this.x, this.floorY - 4, 10, 280, LIGHT.c, 0.7, 5, 0.25);
      fx.holyBurst(this.x, this.floorY - 30, tier >= 2 ? 30 : 14, 1.4);
      // The spear clatters away; the host goes out like lamps.
      for (const u of this.hosts) if (!u.dying) {
        u.risen = true;
        u.takeHit({ dmg: 99999, poise: 999, kx: 0, ky: -100, dir: 1, kind: 'ability', src: G.world.player });
      }
    } else if (t < 4.8) {
      this.column = approach(this.column, 0.55, dt * 0.5);
      this.columnA = approach(this.columnA, t > 3.4 ? 0 : 0.85, dt * 0.8);
      this.fade = approach(this.fade, 0, dt * 0.45);
      this.wing = approach(this.wing, 0, dt);
      if (this.introT === 32 && t > 1.6) {
        this.introT = 33;
        sfx('veilTear', { vol: 0.8, pitch: 0.5 });
      }
      // He comes apart: dark embers going up, gold falling.
      if (Math.random() < dt * (tier >= 2 ? 50 : 20)) fx.spawn(PK.Smoke, this.x + rand(-34, 34), this.floorY - rand(4, 30), rand(-20, 20), rand(-110, -50), rand(1.2, 2), 4, 14, Math.random() < 0.5 ? '#1c0820' : '#4a1846', -20, 1);
      if (Math.random() < dt * (tier >= 2 ? 30 : 12)) fx.spawn(PK.Ember, this.x + rand(-30, 30), this.floorY - rand(4, 40), rand(-30, 30), rand(-120, -50), rand(0.8, 1.4), 2, 0.5, Math.random() < 0.5 ? LIGHT.gold : '#ff9a2a', -30, 1);
    }
    if (t > 4.8) this.resolveEnd();
  }

  // ------------------------------------------------------------ hits
  guard(h: HitInfo): boolean {
    if (h.dot) return false;
    if (this.untouchable) {
      // Turned aside: nothing touches him on the twenty-first day.
      sfx('clash', { pan: G.world.pan(this.x), vol: 0.5, pitch: rand(1.2, 1.5), gap: 90 });
      fx.hitSparks(h.px ?? this.x - (h.dir || 1) * 14, h.py ?? this.cy, -(h.dir || 1), LIGHT.gold, 5, 0.8);
      if (!this.told) {
        this.told = true;
        G.ui.toast('Nothing touches him now. Stand until the day is done.', 'info');
      }
      return true;
    }
    if (this.atk === 'guard' && this.step === 0 && (h.kind === 'melee' || h.kind === 'ability')) {
      // Struck into his guard: turned aside, and answered.
      sfx('parry', { pan: G.world.pan(this.x), vol: 0.8, pitch: 0.8 });
      fx.hitSparks(this.x + this.face * 20, this.y - 50, this.face, LIGHT.gold, 12, 1.2);
      G.world.hitstop(0.06);
      this.facePlayer();
      this.start('counter');
      return true;
    }
    return false;
  }

  takeHit(h: HitInfo): boolean {
    // Broken and enraged, he has lowered his guard: blows bite deeper.
    if (this.enraged && !h.dot) h = { ...h, dmg: h.dmg * 1.3 };
    return super.takeHit(h);
  }

  /** A perfect parry of one of his thrusts breaks his string. */
  parried() {
    if (this.state !== 'attack' || this.untouchable) return;
    this.atk = null;
    this.state = 'idle';
    this.lunge = 0;
    this.cd = 1.0;
    this.st = 0;
    this.poise -= 260;
    this.staggerFlash = 0.25;
    sfx('stagger', { pitch: 0.8, vol: 0.6 });
    if (this.poise <= 0) this.kneel();
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player;
    const W = G.world;
    this.updateSpears(dt);
    this.updateLight(dt);
    this.updateHosts();
    this.ariseCd -= dt;
    if (this.untouchable) this.updateDay(dt);
    if (this.lunge !== 0) {
      // Sliding out of a lunge.
      this.x = clamp(this.x + this.lunge * dt, this.left, this.right);
      this.lunge = approach(this.lunge, 0, dt * 900);
    }
    if (this.state === 'idle') {
      this.facePlayer();
      this.setPose(PP.ready, 7);
      this.wingT = this.untouchable ? 0.6 : 0.3;
      this.beatAmp = 0.05;
      // A duelist's distance: inside his spear, outside Elior's blade.
      const dist = Math.abs(p.x - this.x);
      const want = clamp(p.x + sign(this.x - p.x || 1) * 74, this.left, this.right);
      const sp = 100 * this.spd;
      if (Math.abs(want - this.x) > 6) this.x = approach(this.x, want, sp * dt);
      this.cd -= dt * this.spd;
      if (this.cd <= 0) this.choose(dist);
    } else this.runAttack(dt, p, W);
    this.y = this.floorY;
  }

  private choose(dist: number) {
    const alive = this.hosts.length;
    if (this.phase >= 2 && !this.untouchable && this.ariseCd <= 0 && alive < 2) return this.start('arise');
    let pool: PAtk[];
    if (this.untouchable) pool = dist < 120 ? ['string', 'sweep', 'lunge', 'volley'] : ['lunge', 'volley', 'volley', 'string'];
    else if (this.phase === 1) pool = dist < 110 ? ['string', 'string', 'guard', 'lunge'] : ['lunge', 'string', 'guard'];
    else pool = dist < 110 ? ['string', 'sweep', 'guard', 'string', 'volley'] : ['lunge', 'volley', 'string', 'sweep'];
    let k = choose(pool);
    if (k === this.last && Math.random() < 0.6) k = choose(pool);
    this.start(k);
  }

  private start(k: PAtk) {
    this.atk = k;
    this.last = k;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.n = 0;
    this.struck = false;
    this.hitSet.clear();
    this.hits = this.enraged ? 5 : this.phase >= 2 ? 4 : 3;
    if (k === 'guard') sfx('clash', { pan: G.world.pan(this.x), vol: 0.4, pitch: 0.7 });
    if (k === 'lunge') sfx('galeCharge', { pan: G.world.pan(this.x), vol: 0.4, pitch: 0.6 });
    if (k === 'sweep') sfx('wingbeat', { pan: G.world.pan(this.x), vol: 0.9, pitch: 0.6 });
    if (k === 'volley') sfx('princeHorn', { pan: G.world.pan(this.x), vol: 0.45, pitch: 1.3 });
    if (k === 'counter') this.hitSet.clear();
  }

  private end(cd: number) {
    this.state = 'idle';
    this.atk = null;
    this.st = 0;
    this.cd = (cd + rand(0, 0.2)) / this.spd;
  }

  /** The spear's reach in front of him, at a height. */
  private spearHit(reach: number, y0: number, h: number, mul: number, extra?: Partial<HitInfo>) {
    const f = this.face;
    return this.strike(f > 0 ? this.x + 4 : this.x - 4 - reach, this.y - y0, reach, h, mul, { parryable: true, ...extra });
  }

  private runAttack(dt: number, p: typeof G.world.player, W: typeof G.world) {
    const t = this.st;
    const f = this.face;
    switch (this.atk) {
      case 'string': {
        // Fast strings: thrust, cut, thrust. The first is told by a glint; the rest come quick.
        const first = 0.42, each = this.enraged ? 0.26 : 0.3;
        const at = first + this.n * each;
        if (t < at - 0.12) {
          this.setPose(this.n % 2 ? PP.high : PP.draw, 12);
          if (this.n > 0 && Math.abs(p.x - this.x) > 50) this.x += f * 70 * dt;
        } else if (t < at + 0.1) {
          if (!this.struck) {
            this.struck = true;
            this.hitSet.clear();
            sfx(this.n % 2 ? 'swingSpear' : 'spearThrust', { pan: W.pan(this.x), vol: 0.8, pitch: rand(0.9, 1.05) });
            this.x += f * 16;
            if (this.n % 2) fx.slash(this.x + f * 34, this.y - 52, 50, -1.6, 0.9, 7, f, '#ffe6a8', '#c87a2a', 0.16);
            else fx.streak(this.x + f * 20, this.y - 46, this.x + f * 104, this.y - 46, '#ffe6a8', 0.14, 2);
          }
          this.setPose(this.n % 2 ? PP.slash : PP.thrust, 22);
          if (this.n % 2) this.spearHit(80, 84, 76, 0.55, { kx: f * 160, ky: -120, poise: 30 });
          else this.spearHit(104, 54, 18, 0.55, { kx: f * 160, ky: -100, poise: 30 });
        } else {
          this.n++;
          this.struck = false;
          if (this.n >= this.hits) {
            this.setPose(PP.ready, 6);
            if (t > at + (this.enraged ? 0.45 : 0.6)) this.end(0.55);
            this.n = this.hits;
          }
        }
        if (this.n >= this.hits && t > first + this.hits * each + (this.enraged ? 0.45 : 0.6)) this.end(0.55);
        break;
      }
      case 'guard': {
        // Planted, spear across, a shimmer of gold: strike into it and he answers.
        this.setPose(PP.guard, 10);
        this.wingT = 0.7;
        this.facePlayer();
        const hold = this.enraged ? 0.9 : 1.3;
        if (t > hold && this.step === 0) {
          // Nobody bit: he steps in with a thrust of his own.
          this.step = 1;
          this.st = 0;
        }
        if (this.step === 1) {
          if (this.st < 0.32) this.setPose(PP.draw, 12);
          else if (this.st < 0.48) {
            if (!this.struck) {
              this.struck = true;
              sfx('spearThrust', { pan: W.pan(this.x), vol: 0.9 });
              this.x += f * 24;
              fx.streak(this.x + f * 20, this.y - 46, this.x + f * 110, this.y - 46, '#ffe6a8', 0.16, 2);
            }
            this.setPose(PP.thrust, 22);
            this.spearHit(110, 54, 18, 0.9, { kx: f * 260, ky: -140, poise: 50 });
          } else if (this.st > 0.9) this.end(0.5);
        }
        break;
      }
      case 'counter': {
        // The answer: almost no tell, a long thrust. Dodge on the parry's ring.
        if (t < 0.2) this.setPose(PP.draw, 18);
        else if (t < 0.36) {
          if (!this.struck) {
            this.struck = true;
            sfx('spearThrust', { pan: W.pan(this.x), vol: 1, pitch: 0.9 });
            this.x += f * 30;
            fx.streak(this.x + f * 20, this.y - 46, this.x + f * 120, this.y - 46, '#fff6dc', 0.18, 3);
          }
          this.setPose(PP.thrust, 24);
          this.spearHit(118, 60, 26, 1.3, { kx: f * 320, ky: -180, poise: 70, parryable: false });
        } else if (t > 0.85) this.end(0.55);
        break;
      }
      case 'lunge': {
        // A long lunge across the floor, told by a crouch, a glint and a line on the stones.
        const wind = this.enraged ? 0.48 : 0.6;
        if (t < wind) {
          this.setPose(PP.crouch, 9);
          this.facePlayer();
          this.wingT = 0.9;
        } else if (t < wind + 0.5) {
          if (this.step === 0) {
            this.step = 1;
            this.hitSet.clear();
            sfx('spearThrust', { pan: W.pan(this.x), vol: 1, pitch: 0.75 });
            sfx('wingbeat', { pan: W.pan(this.x), vol: 0.8, pitch: 0.8 });
            fx.dust(this.x, this.y, 10, 1.4);
          }
          this.setPose(PP.thrust, 20);
          this.wingT = 0.2;
          this.x = clamp(this.x + f * 470 * dt, this.left, this.right);
          this.spearHit(96, 58, 30, 1.2, { kx: f * 340, ky: -180, poise: 70 });
          if (Math.random() < dt * 40) fx.spawn(PK.Ember, this.x - f * 10, this.y - rand(20, 60), -f * 80, rand(-20, 20), 0.3, 2, 0.4, LIGHT.gold, 0, 1);
        } else {
          this.setPose(PP.ready, 6);
          if (t > wind + 0.5 + (this.enraged ? 0.45 : 0.7)) this.end(0.5);
        }
        break;
      }
      case 'sweep': {
        // Wings raised (the glint on both tips), then swept low across the floor on both sides. Jump it.
        const wind = this.enraged ? 0.48 : 0.6;
        if (t < wind) {
          this.setPose(PP.spread, 8);
          this.wingT = 1;
          this.beatAmp = 0;
        } else if (t < wind + 0.2) {
          if (this.step === 0) {
            this.step = 1;
            this.hitSet.clear();
            sfx('bossSweep', { pan: W.pan(this.x), vol: 1, pitch: 0.8 });
            sfx('wingbeat', { pan: W.pan(this.x), vol: 1, pitch: 0.7 });
            fx.dust(this.x - 90, this.y, 8, 1.6);
            fx.dust(this.x + 90, this.y, 8, 1.6);
            fx.ring(this.x, this.y - 6, 20, 130, LIGHT.gold, 0.3, 3, 0.2);
          }
          this.setPose(PP.spin, 18);
          this.wingT = 0;
          this.strike(this.x - 124, this.y - 30, 248, 30, 1.0, { kx: sign(p.x - this.x || 1) * 300, ky: -260, poise: 60 });
        } else {
          this.setPose(PP.ready, 6);
          this.wingT = 0.3;
          if (t > wind + 0.8) this.end(0.5);
        }
        break;
      }
      case 'volley': {
        // He calls; spears fall from above onto marks around Elior.
        this.setPose(t < 0.7 ? PP.lift : PP.ready, 7);
        this.wingT = 0.8;
        if (this.step === 0 && t > 0.35) {
          this.step = 1;
          const n = this.enraged || this.untouchable ? 7 : 5;
          const gap = 40;
          const c = p.x + p.body.vx * 0.3;
          for (let i = 0; i < n; i++) {
            const o = (i - (n - 1) / 2) * gap + rand(-6, 6);
            this.dropSpear(c + o, 0.7 + Math.abs(i - (n - 1) / 2) * 0.14);
          }
        }
        if (this.step === 1 && (this.enraged || this.untouchable) && t > 1.3) {
          // A second fall where Elior went.
          this.step = 2;
          for (let i = -1; i <= 1; i++) this.dropSpear(p.x + i * 34, 0.75);
        }
        if (t > 1.4) this.end(0.6);
        break;
      }
      case 'arise': {
        this.setPose(t < 1.0 ? PP.lift : PP.ready, 5);
        this.wingT = 1;
        if (this.step === 0 && t > 0.5) {
          this.step = 1;
          sfx('princeHorn', { vol: 0.7, pitch: 1.1 });
          this.raise(this.phase >= 2 && this.hosts.length === 0 ? 3 : 2);
        }
        if (t > 1.3) this.end(0.6);
        break;
      }
    }
  }

  /** Raise n of the Undying around him (never more than four standing). */
  private raise(n: number) {
    const W = G.world;
    this.ariseCd = 15;
    for (let i = 0; i < n && this.hosts.length < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const x = clamp(this.x + side * (90 + Math.floor(i / 2) * 60) + rand(-10, 10), this.left, this.right);
      const u = W.spawnEnemy('undying', x, this.floorY) as Undying;
      u.empowered = true;
      u.xpOverride = 40;
      u.face = -side;
      this.hosts.push(u);
      fx.ring(x, this.floorY - 2, 6, 50, HOST.glow, 0.5, 3, 0.3);
      fx.column(x, this.floorY, 22, 90, HOST.glow, 0.6);
    }
    sfx('arise', { vol: 0.8 });
    sfx('undyingRise', { vol: 0.7 });
  }

  private updateHosts() {
    for (let i = this.hosts.length - 1; i >= 0; i--) {
      const u = this.hosts[i];
      if (u.remove || (u.dying && !u.awaitingPurify)) this.hosts.splice(i, 1);
    }
  }

  private dropSpear(x: number, tele: number) {
    for (const s of this.spears) {
      if (s.on) continue;
      s.on = true;
      s.x = clamp(x, this.left - 10, this.right + 10);
      s.y = this.floorY - 250;
      s.vy = 0;
      s.t = 0;
      s.tele = tele;
      s.stuck = 0;
      return;
    }
  }

  private updateSpears(dt: number) {
    const W = G.world;
    for (const s of this.spears) {
      if (!s.on) continue;
      s.t += dt;
      if (s.stuck > 0) {
        s.stuck -= dt;
        if (s.stuck <= 0) s.on = false;
        continue;
      }
      if (s.t < s.tele) continue;
      s.vy = Math.min(1100, s.vy + 3200 * dt);
      s.y += s.vy * dt;
      if (this.fighting) {
        BOX.x = s.x - 5; BOX.y = s.y - 34; BOX.w = 10; BOX.h = 34;
        const p = W.player;
        if (BOX.x < p.x + 8 && BOX.x + BOX.w > p.x - 8 && BOX.y < p.y && BOX.y + BOX.h > p.y - 40) {
          // One spear, one wound: a set of its own so neighbours still land.
          SPEAR_SET.clear();
          W.hitPlayerSide(BOX, { dmg: this.dmg * 0.7, poise: 40, kx: 0, ky: -160, dir: this.face, kind: 'proj', src: this, parryable: false }, SPEAR_SET);
        }
      }
      if (s.y >= this.floorY) {
        s.y = this.floorY;
        s.stuck = 0.6;
        sfx('hitMetal', { pan: W.pan(s.x), vol: 0.35, pitch: rand(1.1, 1.4), gap: 40 });
        fx.dust(s.x, this.floorY, 4, 0.8);
      }
    }
  }

  /** The Twenty-First Day: a counter on the HUD, then the light. */
  private updateDay(dt: number) {
    const p = G.world.player;
    if (p.state === 'dead') {
      G.ui.caption(null);
      return;
    }
    // Days pass in real seconds, whatever the boss tempo.
    this.dayT += dt / bossScale().tempo;
    if (this.dayT >= 1) {
      this.dayT -= 1;
      this.day++;
      if (this.day <= DAYS) {
        G.ui.caption(`Day ${this.day} of ${DAYS}`);
        if (this.day % 7 === 0) sfx('bell', { vol: 0.4, pitch: 0.6 + this.day / 40 });
      } else this.breakGuard();
    }
  }

  /** The day is done: light from above breaks his guard. */
  private breakGuard() {
    this.broken = true;
    this.day = DAYS + 1;
    this.atk = null;
    this.lunge = 0;
    this.lightT = 0;
    for (const s of this.spears) s.on = false;
    G.ui.caption('The twenty-first day is done. Light breaks through.');
    G.world.after(3.2, () => G.ui.caption(null));
    sfx('trumpet', { vol: 0.8 });
    sfx('elemHoly', { vol: 0.9 });
    fx.flash('#fff1c4', 0.5);
    G.camera.addTrauma(0.6 * shakeScale());
    // His host gutters: no longer strengthened.
    for (const u of this.hosts) u.empowered = false;
    this.maxPoise = this.poise = 950;
    this.kneelTime = 6;
    this.kneel();
    G.ui.banner('HIS GUARD IS BROKEN', 'Strike while the light holds him', 'boss');
  }

  private updateLight(dt: number) {
    if (this.lightT < 0) return;
    this.lightT += dt;
    if (this.lightT > 2.4) this.lightT = -1;
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    this.animRig(dt);
    if (this.untouchable && Math.random() < dt * 14) fx.spawn(PK.Ember, this.x + rand(-20, 20), this.y - rand(10, 80), rand(-10, 10), -40, 0.6, 2, 0.5, LIGHT.gold, -20, 1);
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    const tier = G.renderer.tier;
    // Falling spears: a glint above while they wait, a mark on the stones.
    for (const s of this.spears) {
      if (!s.on) continue;
      if (s.t < s.tele && s.stuck <= 0) this.floorMark(ctx, s.x, this.floorY, 12, s.t / s.tele, LIGHT.gold);
      this.drawSpear(ctx, s);
    }
    // Lunge line.
    if (this.atk === 'lunge' && this.step === 0) {
      const u = clamp(this.st / 0.6, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + u * 0.4;
      ctx.fillStyle = LIGHT.gold;
      const x0 = this.x + this.face * 20;
      const len = 240 * u;
      ctx.fillRect(Math.round(this.face > 0 ? x0 : x0 - len), this.floorY - 2, Math.round(len), 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // The light that breaks him, and the column that casts him down.
    if (this.lightT >= 0) this.drawLight(ctx, 26 + this.lightT * 10, clamp(1 - this.lightT / 2.4, 0, 1));
    if (this.fade <= 0.02) {
      if (this.columnA > 0.02) this.drawLight(ctx, 20 + this.column * 60, this.columnA);
      return;
    }
    ctx.globalAlpha = this.fade;
    // A dark gold aura; brighter while nothing can touch him.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 50, 74, this.enraged ? '#ff6a2a' : '#c88a2a', (this.untouchable ? 0.35 : 0.16) * this.fade);
    ctx.globalCompositeOperation = 'source-over';
    this.drawWings(ctx, true);
    drawRibbon(ctx, this.cape, 13, 19, '#3a1440', '#0a0406');
    this.drawRig(ctx);
    this.drawWings(ctx, false);
    ctx.globalAlpha = 1;
    if (this.untouchable && tier >= 0) {
      // Untouchable: a ring of gold that turns blows aside.
      const p = 0.5 + Math.sin(G.time * 8) * 0.25;
      ctx.globalAlpha = p;
      ctx.strokeStyle = LIGHT.gold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x), Math.round(this.y - 46), 30, 50, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.atk === 'guard' && this.step === 0) {
      // The guard: a bright shield of gold before the spear.
      const x = Math.round(this.x + this.face * 26), y = Math.round(this.y - 50);
      const p = 0.6 + Math.sin(G.time * 14) * 0.3;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, 30, LIGHT.gold, 0.4 * p);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = p;
      ctx.strokeStyle = LIGHT.c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - this.face * 20, y, 34, this.face > 0 ? -0.9 : Math.PI - 0.9, this.face > 0 ? 0.9 : Math.PI + 0.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.columnA > 0.02) this.drawLight(ctx, 20 + this.column * 60, this.columnA);
    this.drawTells(ctx);
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 40, 60, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawTells(ctx: Ctx) {
    if (this.state !== 'attack') return;
    const t = this.st;
    const h = this.hand();
    if (this.atk === 'string' && this.n === 0 && t < 0.34) this.glint(ctx, h.x + this.face * 10, h.y - 4, LIGHT.gold);
    if (this.atk === 'guard' && this.step === 1 && this.st < 0.3) this.glint(ctx, h.x, h.y - 4, LIGHT.gold);
    if (this.atk === 'counter' && t < 0.2) this.glint(ctx, h.x, h.y - 4, '#ffffff', 1.3);
    if (this.atk === 'lunge' && t < 0.5) this.glint(ctx, h.x, h.y - 4, LIGHT.gold, 1.2);
    if (this.atk === 'sweep' && t < 0.5) {
      const rx = this.rootX(), ry = this.rootY();
      const a = wingTip(rx, ry, this.face, this.wing, this.flapNow(), this.wingL);
      this.glint(ctx, a.x, a.y, LIGHT.gold);
      this.glint(ctx, rx + (rx - a.x) * 0.2, a.y + 4, LIGHT.gold, 0.8);
    }
    if (this.atk === 'volley' && t < 0.5) this.glint(ctx, h.x, h.y - 20, LIGHT.gold, 1.2);
  }

  private drawSpear(ctx: Ctx, s: Spear) {
    const a = s.stuck > 0 ? s.stuck / 0.6 : 1;
    const x = Math.round(s.x), y = Math.round(s.y);
    ctx.globalAlpha = a;
    // Shaft, point down.
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x - 1, y - 40, 2, 32);
    ctx.fillStyle = '#e8c25a';
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x - 3, y - 8);
    ctx.lineTo(x + 3, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(x - 2, y - 10, 4, 2);
    if (s.t < s.tele) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 4, 10, LIGHT.gold, 0.6 + Math.sin(G.time * 20) * 0.3);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /** A column of light from above on the prince. */
  private drawLight(ctx: Ctx, w: number, a: number) {
    const v = G.camera.view();
    const x = Math.round(this.x), top = Math.floor(v.y) - 4;
    const h = this.floorY - top;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = LIGHT.c;
    ctx.fillRect(x - Math.round(w), top, Math.round(w * 2), h);
    ctx.globalAlpha = a * 0.6;
    ctx.fillRect(x - Math.round(w * 0.45), top, Math.round(w * 0.9), h);
    ctx.globalAlpha = a;
    ctx.fillStyle = LIGHT.hot;
    ctx.fillRect(x - Math.round(w * 0.15), top, Math.max(2, Math.round(w * 0.3)), h);
    ctx.globalAlpha = 1;
    glow(ctx, x, this.floorY - 10, w * 2, LIGHT.c, a * 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (this.fade > 0.05) {
      lighting.add(this.x, this.y - 50, 120, this.enraged ? '#ff8a3a' : '#e8a84a', (this.untouchable ? 0.65 : 0.4) * this.fade, 0.35);
      const h = this.hand();
      lighting.add(h.x, h.y - 20, 40, LIGHT.gold, 0.5 * this.fade, 0.6);
    }
    if (this.lightT >= 0) lighting.add(this.x, this.floorY - 80, 200, LIGHT.c, 1 - this.lightT / 2.4, 0.8);
    if (this.columnA > 0.05) lighting.add(this.x, this.floorY - 80, 240, LIGHT.c, this.columnA, 0.9);
    for (const s of this.spears) if (s.on && s.t < s.tele) lighting.add(s.x, s.y, 30, LIGHT.gold, 0.5, 0.6);
  }
}

const SPEAR_SET = new Set<number>();

export type ChapterVIBoss = StormPrince | PersiaPrince;
// Keep the easing helpers referenced for later tuning of the falls.
void easeInQuad;
void easeOutCubic;
