// Chapter XIV: the Day of Gog (Ezekiel 38–39). The shared base of its two armoured bosses, and the first of them:
// the princes of Meshech and Tubal, the chief prince's two captains ("Gog, the chief prince of Meshech and Tubal",
// Ezekiel 38:2). They are one encounter with one life between them and two bodies on the floor:
//
// - THE BUCKLERS OF MESHECH (from the start): Meshech comes forward behind a tower shield: spear thrusts, a shield
//   bash, and the wall (planted, he turns every blow from the front aside: strike him from behind, or break it with
//   a heavy blow). Tubal stands on a height and shoots: volleys, and arrows that fall on marked ground.
// - THE BOW OF TUBAL (two thirds): Tubal comes down to the floor, "an instructer of every artificer in brass and
//   iron" (Genesis 4:22): dashes through Elior, fans of arrows, forge fire up out of the ground, and leaps from
//   height to height. Meshech charges the length of the floor behind his shield.
// - BROTHERS IN IRON (one third): both at once, faster, and Meshech's leaping slam.
//
// Either body takes the blow; the life is shared, and a poise broken on one kneels both.

import { BossBase, MP, type BossKey } from './bosses2';
import { Entity, type HitInfo } from './entity';
import { solve, newJoints, Chain, drawRibbon, type Joints, type Pose } from '../render/skeleton';
import { glow, rgba, poly, ellipse, type Ctx } from '../render/draw';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { moveBody } from './physics';
import { SENT_DIMS, ARCH_DIMS, ARCH_BASE } from './enemies';
import { T } from './tiles';
import type { EnemyKind } from './tiles';

// ---------------------------------------------------------------- shared: marks, ghosts and the humanoid base

export type MarkKind = 'arrow' | 'fire' | 'hail' | 'bolt';
/** Ground marked for a blow a beat later: arrows, a pillar of forge fire, hail and fire, or lightning. */
export interface Mark { x: number; t: number; at: number; kind: MarkKind; set: Set<number> }
export const MARK_C: Record<MarkKind, string> = { arrow: '#ffd27a', fire: '#ff7a2a', hail: '#d8ecff', bolt: '#9ab8ff' };
export interface Ghost14 { x: number; y: number; face: number; j: Joints; life: number; s: number }

/** A flat afterimage of a style in one colour. */
export function ghostOf(S: HumanStyle, C: string): HumanStyle {
  return { ...flashStyle(S), skin: C, coat: C, coatDark: C, pants: C, boots: C, glove: C, belt: C, plate: S.plate ? { c: C, dark: C, hi: C, tier: S.plate.tier } : null, helmColor: C, eye: C, outline: C, weaponColor: C };
}

export abstract class Prince14 extends BossBase {
  j: Joints = newJoints();
  pose: Pose = { ...MP.planted };
  target: Pose = { ...MP.planted };
  rate = 8;
  atk: string | null = null;
  lastAtk: string | null = null;
  step = 0;
  steps = 3;
  ghosts: Ghost14[] = [];
  ghostT = 0;
  grounded = true;
  marks: Mark[] = [];
  servants: { remove: boolean; dying: boolean }[] = [];
  callT = 6;
  scale = 2;
  scaleTo = 2;
  fade = 1;
  spinA = 0;
  cape: Chain;
  /** A blow struck through a partner skips this body's guard. */
  viaPartner = false;
  protected capeColor = '#3a1c10';
  abstract readonly style: HumanStyle;
  abstract readonly ghostStyle: HumanStyle;

  constructor(key: BossKey, x: number, y: number, hp: number) {
    super(key, x, y, 34, 76, hp);
    this.heavyBody = true;
    this.collide = true;
    this.hitSound = 'hitMetal';
    this.cape = new Chain(10, 7, x, y - 60);
    solve(this.pose, SENT_DIMS, true, this.j);
  }

  hurtbox() {
    const low = this.state === 'kneel' || this.state === 'dead' ? 20 : 0, h = 38 * this.scale;
    return { x: this.x - 17, y: this.y - h + low, w: 34, h: h - low };
  }
  get cy() { return this.y - 20 * this.scale; }
  hand() { return { x: this.x + this.face * this.j.haFX * this.scale, y: this.y + this.j.haFY * this.scale }; }
  get width() { return G.world.grid.w * 16; }

  updateDormant(_dt: number) {
    this.target = { ...MP.planted, head: 0.05 + Math.sin(G.time * 0.6) * 0.04 };
  }

  updateKneel(dt: number) {
    this.target = { ...MP.kneel, head: 0.5 + Math.sin(G.time * 3) * 0.05 };
    this.physics(dt);
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
  }

  recover() {
    super.recover();
    this.target = { ...MP.guard };
    sfx('swingHeavy', { pitch: 0.6 });
  }

  guard(_h: HitInfo) { return false; }

  protected idleWalk(dt: number, dx: number, dist: number, near = 90, speed = 90) {
    this.face = sign(dx) || this.face;
    this.target = { ...MP.guard, lean: 0.2 + Math.sin(G.time * 2) * 0.03 };
    const want = dist > near ? sign(dx) * speed * this.spd : dist < 40 ? -sign(dx) * 50 : 0;
    this.body.vx = approach(this.body.vx, want, 540 * dt);
    this.physics(dt);
    this.cd -= dt * this.spd;
  }

  abstract get spd(): number;

  protected start(a: string, steps = 3) {
    this.atk = a;
    this.lastAtk = a;
    this.state = 'attack';
    this.st = 0;
    this.step = 0;
    this.steps = steps;
    this.hitSet.clear();
    this.face = sign(G.world.player.x - this.x) || this.face;
  }

  protected endAttack(cd: number) {
    this.state = 'idle';
    this.st = 0;
    this.atk = null;
    this.collide = true;
    this.cd = cd / this.spd;
    this.rate = 8;
  }

  protected physics(dt: number) {
    const b = this.body;
    b.vy = Math.min(800, b.vy + 1500 * this.grav * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, true);
    this.grounded = b.onGround;
    this.x = clamp(this.x, 40, this.width - 40);
  }

  protected hit(bx: number, by: number, bw: number, bh: number, mul: number, extra: Partial<HitInfo> = {}) {
    const f = this.face, k = this.scale / 2;
    const x = f > 0 ? this.x + bx * k : this.x - (bx + bw) * k;
    return G.world.hitPlayerSide({ x, y: this.y + by * k, w: bw * k, h: bh * k }, { dmg: this.dmg * mul, poise: 40, kx: f * 260, ky: -200, dir: f, kind: 'melee', src: this, parryable: true, ...extra }, this.hitSet);
  }

  protected swingFx(a0: number, a1: number, r = 56, c = '#ffe6c0', c2 = '#ff7a2a') {
    const hd = this.hand();
    fx.slash(hd.x, hd.y - 6, r * this.scale / 2, a0, a1, 12, this.face, c, c2, 0.2);
  }

  protected addGhost() {
    this.ghostT = 0.05;
    this.ghosts.push({ x: this.x, y: this.y, face: this.face, j: { ...this.j }, life: 0.35, s: this.scale });
    if (this.ghosts.length > 7) this.ghosts.shift();
  }

  // ------------------------------------------------------------ marks
  mark(kind: MarkKind, x: number, delay: number) {
    this.marks.push({ x: clamp(x, 60, this.width - 60), t: 0, at: delay, kind, set: new Set() });
  }

  protected tickMarks(dt: number) {
    const W = G.world;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      const was = m.t;
      m.t += dt;
      if (m.t < m.at) continue;
      const C = MARK_C[m.kind];
      if (was < m.at) {
        if (m.kind === 'arrow') {
          sfx('arrowRain', { pan: W.pan(m.x), vol: 0.6 });
          for (let k = 0; k < 6; k++) fx.streak(m.x + rand(-26, 26) + 30, this.y - 220, m.x + rand(-26, 26), this.y - 4, C, 0.2, 2);
          fx.dust(m.x, this.y, 8, 1.4);
        } else if (m.kind === 'fire') {
          sfx('pillarFire', { pan: W.pan(m.x), vol: 0.7 });
          fx.column(m.x, this.y, 28, 170, C, 0.5);
          fx.embers(m.x, this.y - 6, 14, '#ffb35c', 12);
        } else if (m.kind === 'hail') {
          sfx('bossSlam', { pan: W.pan(m.x), vol: 0.6, pitch: 1.3 });
          fx.column(m.x, this.y, 24, 240, '#ffffff', 0.4);
          fx.shards(m.x, this.y - 4, 12, '#e8f2ff', 1.2);
          fx.embers(m.x, this.y - 4, 10, '#ffb35c', 10);
          fx.dust(m.x, this.y, 8, 1.6);
          G.camera.addTrauma(0.12 * shakeScale());
        } else {
          sfx('thunder', { pan: W.pan(m.x), vol: 0.6 });
          fx.column(m.x, this.y, 14, 360, '#eef4ff', 0.25);
          fx.flash('#c8d0ff', 0.1);
        }
      }
      if (m.t < m.at + 0.3) {
        const w = m.kind === 'bolt' ? 36 : m.kind === 'hail' ? 52 : m.kind === 'fire' ? 56 : 60;
        W.hitPlayerSide({ x: m.x - w / 2, y: this.y - 200, w, h: 200 }, { dmg: this.dmg * (m.kind === 'hail' ? 0.65 : 0.7), poise: 30, kx: 0, ky: -160, dir: 0, kind: 'proj', src: this, unblockable: true, parryable: false }, m.set);
      } else this.marks.splice(i, 1);
    }
  }

  protected drawMarks(ctx: Ctx) {
    for (const m of this.marks) if (m.t < m.at) this.floorMark(ctx, m.x, this.y, m.kind === 'hail' ? 30 : 34, m.t / m.at, MARK_C[m.kind]);
  }

  // ------------------------------------------------------------ animation and the shared look
  protected ambient(dt: number) {
    if (Math.random() < dt * 8) fx.spawn(PK.Dust, this.x + rand(-20, 20), this.y - 2, rand(-20, 20), -10, 0.6, 3, 6, '#8a7a6a', 0, 2);
  }

  animate(dt: number) {
    const k = Math.min(1, dt * this.rate);
    for (const key of Object.keys(this.target) as (keyof Pose)[]) this.pose[key] = lerp(this.pose[key], this.target[key], k);
    solve(this.pose, SENT_DIMS, true, this.j);
    this.scale = approach(this.scale, this.scaleTo, dt * 0.5);
    const f = this.face, S = this.scale;
    this.cape.update(this.x + f * (this.j.shBX - 2) * S, this.y + this.j.shBY * S, dt, -this.body.vx * 2 - f * 70, 420, 0.88);
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.state === 'dead') return;
    this.ambient(dt);
  }

  /** Drawn behind the body (auras, the casting of a movement). */
  protected drawBack(_ctx: Ctx) {}
  /** Drawn on the body, in its local space (crowns, plumes). */
  protected drawOn(_ctx: Ctx) {}
  /** Drawn after the body (rings, telegraphs). */
  protected drawFront(_ctx: Ctx) {}
  protected glow = '#ff7a2a';

  draw(ctx: Ctx) {
    const f = this.face, S = this.scale;
    this.drawMarks(ctx);
    for (const gh of this.ghosts) {
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.scale(gh.face * gh.s, gh.s);
      ctx.globalAlpha = clamp(gh.life / 0.35, 0, 1) * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      drawHumanoid(ctx, gh.j, this.ghostStyle, G.time, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.fade <= 0) return;
    ctx.globalAlpha = this.fade;
    this.drawBack(ctx);
    drawRibbon(ctx, this.cape, 20, 26, this.capeColor, '#060408');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(f * S, S);
    drawHumanoid(ctx, this.j, this.style, G.time, this.pose.rot, this.body.vx * f / S, this.body.vy / S);
    this.drawOn(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9) * this.fade;
      drawHumanoid(ctx, this.j, flashStyle(this.style), G.time, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    this.drawFront(ctx);
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 40, 70, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay(ctx: Ctx) {
    if (this.state !== 'kneel') return;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.7 + Math.sin(G.time * 10) * 0.3, y = this.y - 46 * this.scale;
    glow(ctx, this.x, y, 16, '#ffe6a8', 0.7 * p);
    ctx.strokeStyle = rgba('#fff6dc', p);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.x, y - 8); ctx.lineTo(this.x + 6, y); ctx.lineTo(this.x, y + 8); ctx.lineTo(this.x - 6, y); ctx.closePath();
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (this.fade > 0) lighting.add(this.x, this.y - 50, 120, this.glow, 0.5 * this.fade, 0.4);
    for (const m of this.marks) lighting.add(m.x, this.y - 20, 60, MARK_C[m.kind], 0.6, 0.6);
  }

  /** The host rides in at the edges of the floor. */
  protected callHost(dt: number, host: EnemyKind[], cap: number) {
    this.callT -= dt;
    this.servants = this.servants.filter((e) => !e.remove && !e.dying);
    if (this.callT <= 0 && this.state === 'idle' && this.servants.length < cap) this.start('summon');
    return host;
  }

  protected summon(host: EnemyKind[], n: number, color: string, every: number, say = 'The host rides in') {
    const W = G.world, w = this.width;
    this.callT = every;
    sfx('armyHorns', { vol: 0.7 });
    G.ui.toast(say, 'warn');
    for (let i = 0; i < n; i++) {
      const x = i % 2 ? w - 120 - rand(0, 80) : 120 + rand(0, 80);
      const e = W.spawnEnemy(host[i % host.length], x, this.y);
      this.servants.push(e);
      fx.column(x, this.y, 26, 150, color, 0.6);
      fx.dust(x, this.y, 10, 1.4);
    }
  }

  protected clearServants() {
    for (const e of this.servants) if (!e.remove && !e.dying) {
      const x = (e as unknown as { x: number }).x, y = (e as unknown as { y: number }).y;
      fx.dust(x, y, 10, 1.4);
      e.remove = true;
    }
    this.servants.length = 0;
  }
}

// ---------------------------------------------------------------- Meshech and Tubal

type MAtk = 'thrust' | 'bash' | 'wall' | 'charge' | 'slam' | 'summon';

const BRONZE = '#c8943a', COPPER = '#c8501a', HI = '#ffe6c0';

const MESHECH: HumanStyle = {
  skin: '#7a5a44', hair: '#1a1210', hairKind: 'short', beard: '#1a1210', coat: '#3a2418', coatDark: '#1e120a', skirt: 18, trim: BRONZE,
  pants: '#241810', boots: '#140c08', glove: '#2a1a10', belt: BRONZE, plate: { c: '#8a6a3a', dark: '#4a361c', hi: '#f0d08a', tier: 3 },
  helm: 'visor', helmColor: '#8a6a3a', helmTrim: '#f0d08a', eye: '#ffe0b0', eyeGlow: 0.6, outline: '#060408',
  weapon: 'spear', weaponColor: '#d8dce8', weaponGlow: '#ffb347', weaponGlowAmt: 0.35, offhand: 'tower', offColor: '#6a4a24', offTrim: '#e8c25a', bulk: 1.5, crest: COPPER,
};
const TUBAL: HumanStyle = {
  skin: '#8a6048', hair: '#1a1210', hairKind: 'braid', beard: null, coat: '#2a3a3c', coatDark: '#141e20', skirt: 14, trim: '#d8a850',
  pants: '#1a2224', boots: '#120c08', glove: '#1a1210', belt: '#d8a850', plate: null,
  helm: 'archer', helmColor: '#3a4a4c', helmTrim: '#d8a850', eye: '#ffd8a0', eyeGlow: 0.8, outline: '#060408',
  weapon: 'blade', weaponColor: '#d8dce8', weaponGlow: '#ff9a3a', weaponGlowAmt: 0.5, offhand: 'bow', offColor: '#6a4a2a', offTrim: '#d8a850', bowDraw: 0, bulk: 1.15, scarf: '#c8501a',
};

/** Where the arena's heights are: runs of three or more tiles of standing room above the floor, by x. */
function perchesOf(floorY: number): { x: number; y: number }[] {
  const g = G.world.grid, out: { x: number; y: number }[] = [], floorRow = Math.round(floorY / 16);
  for (let ty = 3; ty < floorRow - 2; ty++) {
    let run = 0;
    for (let tx = 0; tx <= g.w; tx++) {
      const t = tx < g.w ? g.get(tx, ty) : T.Empty;
      const standing = (t === T.OneWay || t === T.Stone || t === T.Brick || t === T.Wood) && g.get(tx, ty - 1) === T.Empty && g.get(tx, ty - 2) === T.Empty;
      if (standing) run++;
      else {
        if (run >= 3) out.push({ x: (tx - run / 2) * 16, y: ty * 16 });
        run = 0;
      }
    }
  }
  return out.sort((a, b) => a.x - b.x).slice(0, 5);
}

type TAct = 'volley' | 'fan' | 'rain' | 'dash' | 'forge' | 'leap';
const TB: Pose = { ...ARCH_BASE };
const TP = {
  idle: TB,
  aim: { ...TB, lean: -0.04, fUA: 1.45, fFA: -0.05, bUA: 1.5, bFA: 0.05, off: 0.1 },
  aimUp: { ...TB, lean: -0.2, fUA: 2.4, fFA: 0.1, bUA: 2.5, bFA: 0.1, off: 0.1 },
  crouch: { ...MP.crouch, off: 0.4 },
  dash: { ...MP.thrust, off: 0.4 },
  air: { ...MP.air, off: 0.4 },
  forge: { ...MP.overhead, off: 0.4 },
  kneel: { ...MP.kneel, off: 0.4 },
};

/** Tubal: the second body of the encounter. His blows are his own; every blow he takes is his brother's. */
export class Tubal14 extends Entity {
  boss: MeshechTubal;
  j: Joints = newJoints();
  pose: Pose = { ...TP.idle };
  target: Pose = { ...TP.idle };
  rate = 10;
  style: HumanStyle = { ...TUBAL };
  scale = 1.85;
  act: TAct | null = null;
  actT = 0;
  cd = 3;
  stunT = 0;
  perches: { x: number; y: number }[] = [];
  perch = 0;
  onHeight = true;
  floorY: number;
  draw01 = 0;
  evadeCd = 0;
  leap: { t: number; dur: number; x0: number; y0: number; x1: number; y1: number; h: number; to: number } | null = null;
  hitSet = new Set<number>();
  dashDir = 1;
  flung = false;
  fade = 1;
  ghostT = 0;

  constructor(boss: MeshechTubal, x: number, y: number) {
    super(x, y, 28, 70);
    this.boss = boss;
    this.floorY = y;
    this.team = 'enemy';
    this.isFoe = true;
    this.layer = 4;
    this.name = 'Tubal';
    this.heavyBody = true;
    this.collide = false;
    solve(this.pose, ARCH_DIMS, true, this.j);
    this.perches = perchesOf(y);
    // He begins on the height farthest to the right.
    this.perch = Math.max(0, this.perches.length - 1);
    const p = this.perches[this.perch];
    if (p) { this.x = p.x; this.y = p.y; this.onHeight = true; } else this.onHeight = false;
    this.face = -1;
  }

  hurtbox() {
    const h = 38 * this.scale, low = this.stunT > 0 || this.dying ? 16 : 0;
    return { x: this.x - 13, y: this.y - h + low, w: 26, h: h - low };
  }
  get cy() { return this.y - 24 * this.scale; }
  canBeTargeted() { return !this.dying && !this.remove && this.boss.fighting; }
  executable() { return false; }

  get phase() { return Math.max(1, this.boss.phase); }
  get dmg() { return this.boss.dmg * 0.6; }

  /** Every blow he takes is the life they share. */
  takeHit(h: HitInfo): boolean {
    const B = this.boss;
    if (!B.fighting || B.invuln > 0 || B.dying) return false;
    this.flash = 0.1;
    B.viaPartner = true;
    const hit = B.takeHit({ ...h, px: h.px ?? this.x - sign(h.dir || 1) * 6, py: h.py ?? this.y - 30 * this.scale });
    B.viaPartner = false;
    return hit;
  }

  /** Both brothers go down together. */
  stun(t: number) {
    this.stunT = t;
    this.act = null;
    this.leap = null;
    this.draw01 = 0;
    this.target = { ...TP.kneel };
  }

  fall() {
    this.dying = true;
    this.act = null;
    this.leap = null;
    this.draw01 = 0;
    this.target = { ...TP.kneel, lean: 0.5, head: 0.4 };
    this.rate = 5;
  }

  // ------------------------------------------------------------ behaviour (driven by the boss, at the boss's pace)
  update(_dt: number) {
    if (this.boss.remove) this.remove = true;
  }

  private lowestFloor() { return this.floorY; }

  /** One step of his own life. `dt` is the boss's own scaled time. */
  run(dt: number) {
    const B = this.boss, W = G.world, p = W.player;
    this.flash = Math.max(0, this.flash - dt);
    if (this.dying) { this.pace(dt); return; }
    if (!B.fighting && B.state !== 'transition') { this.settle(dt); this.pace(dt); return; }
    if (B.state === 'transition') { this.settle(dt); this.pace(dt); return; }
    if (this.stunT > 0) { this.stunT -= dt; this.target = { ...TP.kneel }; this.rate = 8; this.pace(dt); return; }
    this.cd -= dt * B.spd;
    this.evadeCd -= dt;
    const dx = p.x - this.x, dist = Math.abs(dx);
    if (this.leap) { this.moveLeap(dt); this.pace(dt); return; }
    if (this.act) { this.runAct(dt, dx); this.pace(dt); return; }
    this.face = sign(dx) || this.face;
    this.target = { ...TP.idle, lean: 0.06 + Math.sin(G.time * 2) * 0.02 };
    this.rate = 8;
    this.style.bowDraw = 0;
    // On a height he is out of reach, until Elior climbs to him: then he leaps away.
    if (this.onHeight && this.evadeCd <= 0 && dist < 110 && Math.abs(p.y - this.y) < 80 && this.perches.length > 1) { this.hop(true); return; }
    // On the floor he keeps his distance, a bow's length from Elior.
    if (!this.onHeight) {
      const want = dist > 250 ? sign(dx) * 120 : dist < 130 ? -sign(dx) * 140 : 0;
      this.x = clamp(this.x + want * dt * B.spd, 50, B.width - 50);
      this.y = this.floorY;
    }
    if (this.cd <= 0) this.choose(dist);
    this.pace(dt);
  }

  private choose(dist: number) {
    const ph = this.phase, floor = !this.onHeight;
    let pool: TAct[];
    if (ph === 1) pool = ['volley', 'volley', 'rain'];
    else if (ph === 2) pool = floor ? (dist > 190 ? ['fan', 'forge', 'dash', 'leap'] : ['dash', 'fan', 'forge']) : ['fan', 'volley', 'leap'];
    else pool = floor ? ['dash', 'fan', 'forge', 'rain', 'leap'] : ['fan', 'rain', 'leap', 'volley'];
    let a = choose(pool);
    if (a === this.act) a = choose(pool);
    // A dash needs the floor; a volley from the floor is a fan.
    if (a === 'dash' && this.onHeight) a = 'fan';
    if (a === 'leap' && this.perches.length < 1) a = 'fan';
    this.begin(a);
  }

  private begin(a: TAct) {
    this.act = a;
    this.actT = 0;
    this.hitSet.clear();
    this.flung = false;
    if (a === 'leap') { this.act = null; this.hop(false); }
  }

  private endAct(cd: number) {
    this.act = null;
    this.actT = 0;
    this.draw01 = 0;
    this.style.bowDraw = 0;
    const ph = this.phase;
    this.cd = cd * (ph >= 3 ? 0.6 : ph === 2 ? 0.85 : 1.15);
  }

  private aimAt(): { vx: number; vy: number } {
    const p = G.world.player, sx = this.x + this.face * 12, sy = this.y - 22 * this.scale / 1.2;
    const tx = p.x + (p.body.vx || 0) * 0.2, ty = p.y - 16;
    const speed = 480, d = Math.hypot(tx - sx, ty - sy) || 1, time = d / speed;
    return { vx: (tx - sx) / time, vy: (ty - sy) / time - 60 * time * 0.5 };
  }

  private shoot(spread: number, mul: number, speed = 1) {
    const sx = this.x + this.face * 12, sy = this.y - 22 * this.scale / 1.2, a = this.aimAt();
    const ang = Math.atan2(a.vy, a.vx) + spread, sp = Math.hypot(a.vx, a.vy) * speed;
    G.world.add(new Proj('arrow', sx, sy, 'enemy', this.dmg * mul, { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 2.6, w: 10, h: 4, color: '#ffb35c' }));
  }

  private runAct(dt: number, dx: number) {
    const W = G.world, t = (this.actT += dt), B = this.boss, ph = this.phase;
    switch (this.act) {
      case 'volley': case 'fan': {
        // The bow is drawn, the aim line holds on Elior, and the string is let go.
        const tel = (this.act === 'fan' ? 0.62 : 0.78) / Math.min(B.spd, 1.4);
        this.face = sign(dx) || this.face;
        this.target = { ...TP.aim };
        this.rate = 10;
        this.draw01 = Math.min(1, t / tel);
        this.style.bowDraw = this.draw01;
        if (t < dt * 1.5) sfx('bowDraw', { pan: W.pan(this.x) });
        if (!this.flung && t >= tel) {
          this.flung = true;
          sfx('bowRelease', { pan: W.pan(this.x) });
          if (this.act === 'fan') for (const s of ph >= 3 ? [-0.36, -0.18, 0, 0.18, 0.36] : [-0.3, -0.15, 0, 0.15, 0.3]) this.shoot(s, 0.5);
          else for (let i = 0; i < (ph >= 3 ? 4 : 3); i++) W.after(i * 0.16, () => { if (!this.dying && !this.remove && this.stunT <= 0) this.shoot(rand(-0.03, 0.03), 0.6); });
        }
        if (t > tel + 0.35 + (this.act === 'volley' ? 0.5 : 0)) this.endAct(this.act === 'fan' ? 1.4 : 1.8);
        break;
      }
      case 'rain': {
        // Arrows loosed high fall on ground marked a beat before.
        this.target = { ...TP.aimUp };
        this.rate = 10;
        this.draw01 = Math.min(1, t / 0.5);
        this.style.bowDraw = this.draw01;
        if (!this.flung && t >= 0.5) {
          this.flung = true;
          sfx('bowRelease', { pan: W.pan(this.x), pitch: 0.8 });
          const px = W.player.x, n = ph >= 3 ? 5 : 3;
          for (let i = 0; i < n; i++) B.mark('arrow', px + (i - (n - 1) / 2) * 96 + rand(-14, 14), 0.8 + i * 0.1);
        }
        if (t > 1.1) this.endAct(1.8);
        break;
      }
      case 'dash': {
        // Crouched and gone: a dash straight through Elior, and the blade across his path.
        const tel = 0.5 / Math.min(B.spd, 1.4), run = 0.26;
        if (t < tel) {
          this.face = sign(dx) || this.face;
          this.dashDir = this.face;
          this.target = { ...TP.crouch };
          this.rate = 12;
          this.style.bowDraw = 0;
          if (t < dt * 1.5) sfx('charge', { pan: W.pan(this.x), pitch: 1.2, vol: 0.6 });
        } else if (t < tel + run) {
          this.target = { ...TP.dash };
          this.rate = 30;
          this.x = clamp(this.x + this.dashDir * 780 * dt, 50, B.width - 50);
          this.ghostT -= dt;
          if (this.ghostT <= 0) { this.ghostT = 0.04; fx.streak(this.x - this.dashDir * 30, this.y - 36, this.x, this.y - 36, '#d8a850', 0.18, 3); }
          W.hitPlayerSide({ x: this.x - 22, y: this.y - 62, w: 44, h: 62 }, { dmg: this.dmg * 1.1, poise: 50, kx: this.dashDir * 340, ky: -220, dir: this.dashDir, kind: 'melee', src: this, parryable: false }, this.hitSet);
        } else if (t > tel + run + 0.35) this.endAct(1.2);
        break;
      }
      case 'forge': {
        // Tubal-cain, an instructer of every artificer in brass and iron: the forge fire comes up out of the ground.
        this.target = { ...TP.forge };
        this.rate = 12;
        if (t < dt * 1.5) { sfx('beamCharge', { pan: W.pan(this.x), pitch: 0.7, vol: 0.5 }); fx.embers(this.x, this.y - 40, 12, '#ffb35c', 14); }
        if (!this.flung && t >= 0.65) {
          this.flung = true;
          const px = W.player.x, n = ph >= 3 ? 4 : 3;
          for (let i = 0; i < n; i++) B.mark('fire', px + (i - (n - 1) / 2) * 90 * (this.face || 1) + rand(-10, 10), 0.85 + i * 0.12);
          sfx('scaleClang', { pan: W.pan(this.x), vol: 0.7 });
        }
        if (t > 1.3) this.endAct(1.6);
        break;
      }
      default: this.endAct(1);
    }
  }

  /** He leaps from height to height (or down to the floor, or up from it). */
  private hop(evade: boolean) {
    const p = G.world.player;
    // Evading: the height farthest from Elior. Otherwise any other one, or the floor in the second and third movements.
    let opts = this.perches.map((q, i) => ({ q, i })).filter(({ i }) => !(this.onHeight && i === this.perch));
    if (evade) opts.sort((a, b) => Math.abs(b.q.x - p.x) - Math.abs(a.q.x - p.x));
    else opts = opts.sort(() => Math.random() - 0.5);
    const floorOk = !this.onHeight || (this.phase >= 2 && !evade);
    let to = -1, x1 = this.x, y1 = this.y;
    if (floorOk && (!opts.length || Math.random() < 0.4)) {
      x1 = clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * rand(180, 280), 80, this.boss.width - 80);
      y1 = this.floorY;
    } else if (opts.length) { to = opts[0].i; x1 = opts[0].q.x; y1 = opts[0].q.y; }
    else { this.cd = 1.5; return; }
    const dist = Math.hypot(x1 - this.x, y1 - this.y);
    this.leap = { t: 0, dur: clamp(dist / 520, 0.45, 0.85), x0: this.x, y0: this.y, x1, y1, h: 70 + Math.min(80, dist * 0.18), to };
    this.evadeCd = 2.4;
    this.act = null;
    this.target = { ...TP.air };
    this.rate = 14;
    sfx('jump', { pan: G.world.pan(this.x), pitch: 0.7, vol: 0.7 });
    fx.dust(this.x, this.y, 8, 1.4);
  }

  private moveLeap(dt: number) {
    const L = this.leap!;
    L.t += dt;
    const u = Math.min(1, L.t / L.dur);
    this.x = lerp(L.x0, L.x1, u);
    this.y = lerp(L.y0, L.y1, u) - Math.sin(u * Math.PI) * L.h;
    this.face = sign(L.x1 - L.x0) || this.face;
    this.target = { ...TP.air };
    if (u >= 1) {
      this.leap = null;
      this.x = L.x1;
      this.y = L.y1;
      this.onHeight = L.to >= 0;
      if (L.to >= 0) this.perch = L.to;
      fx.dust(this.x, this.y, 10, 1.6);
      sfx('land', { pan: G.world.pan(this.x), vol: 0.6 });
      this.cd = Math.min(this.cd, 0.9);
      this.target = { ...TP.idle };
    }
  }

  /** In a movement change or a cutscene he holds where he stands (a height, or the floor). */
  private settle(_dt: number) {
    this.target = { ...TP.idle, lean: 0.06 };
    this.style.bowDraw = 0;
    this.act = null;
    this.leap = null;
    const p = G.world.player;
    this.face = sign(p.x - this.x) || this.face;
  }

  private pace(dt: number) {
    const k = Math.min(1, dt * this.rate);
    for (const key of Object.keys(this.target) as (keyof Pose)[]) this.pose[key] = lerp(this.pose[key], this.target[key], k);
    solve(this.pose, ARCH_DIMS, true, this.j);
  }

  draw(ctx: Ctx) {
    if (this.fade <= 0) return;
    const S = this.scale;
    // Aim line while the bow is drawn.
    if (this.act && (this.act === 'volley' || this.act === 'fan') && this.draw01 > 0.5) {
      const a = this.aimAt(), sx = this.x + this.face * 12, sy = this.y - 22 * S / 1.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffb35c', 0.3 * this.draw01);
      ctx.lineWidth = 0.9;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + a.vx * 0.5, sy + a.vy * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = this.fade;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * S, S);
    drawHumanoid(ctx, this.j, this.style, G.time, this.pose.rot, 0, 0);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9) * this.fade;
      drawHumanoid(ctx, this.j, flashStyle(this.style), G.time, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.act === 'dash' && this.actT < 0.5) this.boss.glintAt(ctx, this.x + this.face * 12, this.y - 40, '#d8a850');
    if (this.act === 'forge') this.boss.glintAt(ctx, this.x + this.face * 18, this.y - 70, '#ff7a2a');
  }

  drawOverlay(ctx: Ctx) {
    if (this.stunT <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.7 + Math.sin(G.time * 10) * 0.3, y = this.y - 40 * this.scale;
    glow(ctx, this.x, y, 14, '#ffe6a8', 0.6 * p);
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() { lighting.add(this.x, this.y - 40, 90, '#ffb35c', 0.5, 0.4); }
}

export class MeshechTubal extends Prince14 {
  pixelBox = [-190, -190, 190, 14] as const;
  readonly style = MESHECH;
  readonly ghostStyle = ghostOf(MESHECH, COPPER);
  protected capeColor = '#5a2a10';
  protected glow = COPPER;
  partner: Tubal14 | null = null;
  walled = false;
  wallT = 0;
  dashDir = 1;
  landX = 0;
  landY = 0;

  constructor(x: number, y: number) {
    super('meshech_tubal', x, y, 1250000);
    this.name = 'The Princes of Meshech and Tubal';
    this.sub = 'Bucklers and Shields';
    this.maxPoise = this.poise = 1100;
    this.kneelTime = 3;
    this.p2At = 0.66;
    this.p3At = 0.33;
    this.phaseMarks = [0.66, 0.33];
    this.face = -1;
  }

  get dmg() { return 500 * this.ngMul * this.encounterDamage * (this.phase >= 3 ? 1.22 : this.phase === 2 ? 1.1 : 1); }
  get spd() { return this.phase >= 3 ? 1.4 : this.phase === 2 ? 1.18 : 1.05; }

  /** His brother takes his place on the heights as soon as the encounter wakes (or the room first runs). */
  private ensurePartner() {
    if (this.partner) return;
    this.partner = new Tubal14(this, this.x + 130, this.y);
    G.world.add(this.partner);
  }
  glintAt(ctx: Ctx, x: number, y: number, c: string) { this.glint(ctx, x, y, c, 1.1); }

  // ------------------------------------------------------------ lifecycle
  updateDormant(dt: number) {
    this.ensurePartner();
    super.updateDormant(dt);
    this.partner!.run(dt);
  }

  updateIntro(dt: number) {
    this.ensurePartner();
    const t = this.st;
    G.camera.focus = { x: this.x - 30, y: this.y - 60 };
    if (t < 0.6) this.target = { ...MP.planted, head: 0.2 };
    else if (this.introT === 0) {
      this.introT = 1;
      this.target = { ...MP.rising };
      this.rate = 10;
      sfx('armyHorns', { vol: 0.8 });
      sfx('bossRoar', { pitch: 0.8 });
      fx.ring(this.x, this.y - 50, 12, 280, COPPER, 0.8, 5);
      G.camera.addTrauma(0.4 * shakeScale());
      G.ui.banner('THE PRINCES OF MESHECH AND TUBAL', this.sub, 'boss');
      music.play('duel', 0.6);
      music.phase = 0;
    } else if (t > 2.2) {
      this.target = { ...MP.guard };
      this.beginFight();
      G.camera.viewMultTarget = 1.2;
      if (this.partner) this.partner.cd = 2.2;
    }
    this.partner!.run(dt);
  }

  updateKneel(dt: number) {
    super.updateKneel(dt);
    this.partner?.run(dt);
  }

  onKneel() {
    this.atk = null;
    this.walled = false;
    this.collide = true;
    this.marks.length = 0;
    this.partner?.stun(this.kneelTime * 0.85);
    G.ui.toast('The brothers stagger: strike now.', 'good');
  }

  guard(h: HitInfo) {
    if (this.viaPartner || !this.walled) return false;
    // The wall turns aside everything from the front. A heavy blow breaks it; a blow from behind never meets it.
    if (h.guardBreak || h.heavy) {
      this.walled = false;
      this.poise -= 70;
      sfx('shieldBreak', { pan: G.world.pan(this.x) });
      fx.shards(this.x + this.face * 20, this.y - 40, 14, '#e8c25a', 1.2);
      G.ui.toast('The wall is broken', 'good');
      return false;
    }
    if (h.dir !== 0 && sign(h.dir) === -this.face) {
      sfx('hitMetal', { pan: G.world.pan(this.x), pitch: 0.7 });
      fx.hitSparks(this.x + this.face * 22, this.y - 40, -this.face, '#ffe6a8', 8, 1);
      if (Math.random() < 0.5) G.world.hitstop(0.03);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player, dx = p.x - this.x, dist = Math.abs(dx);
    this.tickMarks(dt);
    this.partner?.run(dt);
    this.callHost(dt, ['knight', 'bulwark'], this.phase >= 3 ? 3 : 2);
    if (this.state === 'idle') {
      this.idleWalk(dt, dx, dist, 80, 95);
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const ph = this.phase;
    const near: MAtk[] = ph >= 3 ? ['thrust', 'bash', 'wall', 'thrust'] : ph === 2 ? ['thrust', 'bash', 'wall', 'bash'] : ['thrust', 'thrust', 'bash', 'wall'];
    const far: MAtk[] = ph >= 3 ? ['charge', 'slam', 'charge', 'wall'] : ph === 2 ? ['charge', 'wall', 'charge'] : ['wall', 'bash', 'thrust'];
    const pool = dist < 110 ? near : far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    this.start(a, a === 'thrust' ? (ph >= 3 ? 4 : 3) : 1);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body;
    switch (this.atk as MAtk) {
      case 'thrust': {
        // Spear: thrust, thrust, and a sweeping cut across the legs.
        const kind = this.step % 3 === 2 ? 1 : 0;
        const tel = (this.step === 0 ? 0.46 : 0.3) / sp, act = 0.14, rec = this.step === this.steps - 1 ? 0.6 : 0.1;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.draw : MP.low;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 0 ? MP.thrust : MP.rising;
          if (t - dt < tel) {
            b.vx = f * (kind === 0 ? 340 : 200);
            sfx('spearThrust', { pan: W.pan(this.x), pitch: 0.6 });
            if (kind === 0) fx.streak(this.x + f * 14, this.y - 44, this.x + f * 150, this.y - 44, '#ffe6c0', 0.2, 4);
            else this.swingFx(1.0, -2.4);
          }
          if (kind === 0) this.hit(0, -62, 150, 28, 1, { poise: 60, kx: f * 360, ky: -170 });
          else this.hit(-4, -50, 120, 56, 1.05, { poise: 50, ky: -300, kx: f * 140 });
        } else if (t < tel + act + rec) this.rate = 8;
        else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (this.step >= this.steps || Math.abs(dx) > 190) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'bash': {
        // The tower shield driven forward: a short lunge that throws Elior back.
        const tel = 0.5 / sp, act = 0.22;
        if (t < tel) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = approach(b.vx, -f * 40, 600 * dt);
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = MP.thrust;
          if (t - dt < tel) { b.vx = f * 460; sfx('swingHeavy', { pan: W.pan(this.x), pitch: 0.5 }); fx.dust(this.x, this.y, 8, 1.6); }
          this.hit(-6, -92, 86, 92, 1.15, { poise: 80, kx: f * 440, ky: -240 });
        } else if (t < tel + act + 0.7) { b.vx = approach(b.vx, 0, 1600 * dt); this.rate = 8; }
        else this.endAttack(1.1);
        this.physics(dt);
        break;
      }
      case 'wall': {
        // The shield planted: every blow from the front is turned aside until he lifts it. A heavy blow breaks it.
        b.vx = approach(b.vx, 0, 1200 * dt);
        this.physics(dt);
        this.face = this.walled ? this.face : sign(dx) || this.face;
        const raise = 0.5 / sp, hold = this.phase >= 3 ? 3.0 : 2.4;
        if (t < raise) {
          this.rate = 12;
          this.target = MP.crouch;
          if (t < dt * 1.5) sfx('sentinelSlam', { pan: W.pan(this.x), vol: 0.8 });
        } else if (t < raise + hold) {
          this.walled = true;
          this.rate = 10;
          this.target = { ...MP.guard, lean: 0.3, fUA: 1.3 };
          // He answers a foe who stays at the shield with a short bash of his own.
          if (this.step === 0 && Math.abs(dx) < 70 && t > raise + 0.9) { this.step = 1; this.walled = false; this.atk = 'bash'; this.st = 0.5 / sp; this.hitSet.clear(); }
        } else {
          this.walled = false;
          this.target = MP.guard;
          if (t > raise + hold + 0.5) this.endAttack(1.0);
        }
        break;
      }
      case 'charge': {
        // The shield lowered, he runs the length of the floor. A wall stops him, and he stands dazed against it.
        const tel = 0.7 / Math.min(sp, 1.3), w = this.width;
        if (t < tel) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = approach(b.vx, -f * 30, 600 * dt);
          if (t < dt * 1.5) { sfx('charge', { pan: W.pan(this.x), pitch: 0.6 }); this.dashDir = f; }
          this.physics(dt);
          break;
        }
        if (this.step === 0) { this.step = 1; this.collide = false; this.dashDir = f; sfx('armyHorns', { vol: 0.5, pitch: 0.8 }); }
        this.rate = 30;
        this.target = MP.thrust;
        if (this.step === 1) {
          b.vx = this.dashDir * 560 * Math.min(sp, 1.25);
          this.physics(dt);
          this.hit(-8, -90, 90, 90, 1.25, { poise: 80, kx: this.dashDir * 440, ky: -240, parryable: false });
          if (Math.random() < dt * 40) fx.spawn(PK.Dust, this.x - this.dashDir * 20, this.y - 2, -this.dashDir * 60, -20, 0.4, 3, 8, '#8a7a6a', 0, 2);
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
          const atWall = (this.dashDir > 0 && this.x >= w - 70) || (this.dashDir < 0 && this.x <= 70);
          if (atWall || t > tel + 2.4) {
            this.step = 2;
            this.st = tel;
            b.vx = 0;
            this.collide = true;
            G.camera.addTrauma(0.5 * shakeScale());
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 0.8 });
            fx.dust(this.x, this.y, 22, 2.4);
            if (atWall) this.poise -= 220;
          }
        } else {
          // Dazed against the wall: an opening.
          this.rate = 6;
          this.target = { ...MP.stagger };
          b.vx = 0;
          this.physics(dt);
          if (t > tel + 1.0) this.endAttack(1.1);
        }
        break;
      }
      case 'slam': {
        // A leap onto Elior's ground: the shock runs both ways along the floor.
        const tel = 0.38;
        if (t < tel) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = approach(b.vx, 0, 900 * dt);
          this.physics(dt);
        } else if (this.step === 0) {
          this.step = 1;
          const p = W.player;
          this.landX = clamp(p.x, 60, this.width - 60);
          this.landY = p.body.onGround ? p.y : this.y;
          b.vy = -620;
          b.vx = clamp((this.landX - this.x) / 0.8, -520, 520);
          b.onGround = false;
          sfx('jump', { pan: W.pan(this.x), pitch: 0.45 });
          fx.dust(this.x, this.y, 14, 2);
          this.target = MP.air;
          this.rate = 10;
          this.physics(dt);
        } else if (this.step === 1) {
          this.target = b.vy > 0 ? MP.plunge : MP.air;
          this.rate = b.vy > 0 ? 18 : 10;
          this.physics(dt);
          if (b.vy > 0) this.hit(-20, -74, 76, 74, 1, { poise: 52 });
          if ((this.grounded && t > tel + 0.1) || t > 2.6) {
            this.step = 2;
            this.st = tel + 0.1;
            b.vx = 0;
            this.target = MP.downcut;
            this.rate = 30;
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 0.9, vol: 0.9 });
            G.camera.addTrauma(0.6 * shakeScale());
            fx.dust(this.x, this.y, 26, 2.6);
            fx.ring(this.x, this.y - 2, 8, 150, COPPER, 0.45, 4, 0.25);
            this.hitSet.clear();
            const d = sign(W.player.x - this.x) || 1;
            W.hitPlayerSide({ x: this.x - 100, y: this.y - 48, w: 200, h: 48 }, { dmg: this.dmg * 1.15, poise: 60, kx: d * 300, ky: -320, dir: d, kind: 'melee', src: this, unblockable: true }, this.hitSet);
            for (const s of [-1, 1]) W.add(new Proj('wave', this.x + s * 26, this.y, 'enemy', this.dmg * 0.65, { vx: s * 320, life: 1.6, w: 16, h: 28, color: COPPER, big: true }));
          }
        } else {
          this.rate = 6;
          this.physics(dt);
          if (t > tel + 0.1 + 0.6) this.endAttack(1.1);
        }
        break;
      }
      case 'summon': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        if (t >= 0.6 && this.step === 0) {
          this.step = 1;
          this.summon(['knight', 'bulwark', 'archer'], this.phase >= 3 ? 3 : 2, COPPER, this.phase >= 3 ? 11 : 14, 'The captains call their bands');
        }
        if (t > 1.3) this.endAttack(0.8);
        break;
      }
    }
  }

  // ------------------------------------------------------------ the three movements
  beginTransition() { this.change(2); }
  enterPhase3() { this.change(3); }

  private change(phase: number) {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.walled = false;
    this.collide = true;
    this.phase = phase;
    this.introT = 0;
    this.invuln = 999;
    this.marks.length = 0;
    this.maxPoise = this.poise = phase >= 3 ? 1300 : 1200;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.6, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 60 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    this.partner?.run(dt);
    if (t < 0.9) {
      this.target = { ...MP.kneel, lean: 0.3, head: 0.4 };
      this.rate = 6;
      if (this.introT === 0) {
        this.introT = 1;
        sfx('bossRoar', { pitch: 0.7 });
        G.camera.addTrauma(0.35 * shakeScale());
        G.ui.caption(this.phase === 2
          ? '“And I will turn thee back, and put hooks into thy jaws, and I will bring thee forth,” · Ezekiel 38:4 (KJV)'
          : '“...a great company with bucklers and shields, all of them handling swords:” · Ezekiel 38:4 (KJV)');
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      this.target = { ...MP.rising, head: -0.3 };
      this.rate = 8;
      this.sub = this.phase === 2 ? 'The Bow of Tubal' : 'Brothers in Iron';
      fx.flash(COPPER, 0.25);
      fx.ring(this.x, this.y - 40, 10, 300, COPPER, 0.9, 6);
      fx.column(this.x, this.y, 50, 300, HI, 0.6);
      sfx('armyHorns', { vol: 0.9 });
      G.camera.addTrauma(0.6 * shakeScale());
      G.ui.banner('THE PRINCES OF MESHECH AND TUBAL', this.sub, 'boss');
      music.bossPhase(this.phase - 1);
      this.callT = 3;
      // Tubal comes down to the floor in the second movement.
      if (this.partner && this.phase === 2) this.partner.cd = 0.8;
    } else if (t > 2.2) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.8;
      this.invuln = 0;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.ui.caption(null);
      G.ui.bossBar(this.name, this.sub);
      G.camera.focus = null;
    }
  }

  die() {
    super.die();
    this.atk = null;
    this.walled = false;
    this.collide = true;
    this.marks.length = 0;
    this.ghosts.length = 0;
    this.partner?.fall();
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 50 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    this.partner?.run(dt);
    if (t < 2.2) {
      this.target = { ...MP.kneel, lean: 0.5, head: 0.3 };
      this.rate = 5;
      if (this.introT !== 7) {
        this.introT = 7;
        sfx('bossRoar', { pitch: 0.55 });
        G.ui.caption('“...and I will bring thee forth, and all thine army,” · Ezekiel 38:4 (KJV)');
        this.clearServants();
      }
    } else if (t < 4.2) {
      this.fade = Math.max(0, 1 - (t - 2.2) / 1.6);
      if (this.partner) this.partner.fade = this.fade;
      if (this.introT === 7) { this.introT = 8; fx.flash(COPPER, 0.4); sfx('bell', { vol: 0.6 }); fx.holyBurst(this.x, this.y - 40, 30, 1.6); }
    } else if (this.introT === 8) {
      this.introT = 9;
      this.fade = 0;
      if (this.partner) { this.partner.fade = 0; this.partner.remove = true; }
      G.ui.caption(null);
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  // ------------------------------------------------------------ the look
  protected drawFront(ctx: Ctx) {
    if (this.walled) {
      // The shield wall: a pale arc of bronze light before the shield.
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x + this.face * 28, this.y - 46, 54, '#ffcf6b', 0.22 + Math.sin(G.time * 12) * 0.05);
      ctx.strokeStyle = rgba('#ffe6a8', 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x + this.face * 26, this.y - 46, 12, 52, 0, -Math.PI / 2, Math.PI / 2, this.face < 0);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.atk === 'charge' && this.step === 0 && this.st < 0.7) this.floorMark(ctx, this.x + this.face * 200, this.y, 80, this.st / 0.7, COPPER);
    if (this.atk === 'slam' && this.step === 1) this.floorMark(ctx, this.landX, this.landY, 70, this.st / 0.9, COPPER);
    if (this.state === 'attack') {
      const hd = this.hand(), t = this.st;
      if ((this.atk === 'thrust' && this.step === 0 && t < 0.45 / this.spd) || this.atk === 'bash' && t < 0.5 / this.spd) this.glint(ctx, hd.x, hd.y - 8, COPPER, 1.3);
    }
  }

  protected drawOn(ctx: Ctx) {
    // A tall crest of horsehair over the helm.
    const j = this.j;
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    poly(ctx, [-5, -7, -4, -15, 0, -19, 5, -14, 6, -7], COPPER, '#060408', 0.5);
    poly(ctx, [-5, -7, 7, -7, 7, -9, -5, -9], BRONZE);
    ctx.restore();
  }
}
