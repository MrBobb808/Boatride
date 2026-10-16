// The foes of the king's feast (Chapter V):
//
// - VESSEL WRAITH: a gold or silver cup from the temple, taken for the feast
//   and filled with the Veil. It hovers over its prey and tips to pour a
//   stream of burning wine, now and then dives (parryable), and slips aside
//   from a raised blade. Fragile: it rings and shatters when it falls.
// - SCRIBE OF THE VEIL: a palace scribe with a clay tablet and a stylus. It
//   writes a line of burning letters in the air that hangs for a beat and
//   then flies letter by letter; it writes a glyph on the floor under its
//   prey that bursts after a ring; closed in, it raises a sigil or blinks
//   away in a splash of ink. Strike it mid-line and the writing fails.
//
// The letters, floor glyphs and burning wine here also serve the Weigher.

import { Entity, type HitInfo } from './entity';
import { groundAhead, wallAhead } from './physics';
import { Animator, BASE_POSE, type Clip, type Pose, type RigDims } from '../render/skeleton';
import { drawHumanoid, flashStyle, type HumanStyle } from '../render/actors';
import { glow, poly, ellipse, vGrad, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign, easeOutCubic, easeOutBack, easeInOutSine } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { T, TILE } from './tiles';
import { Enemy } from './enemies';

/** Veil ink: violet that burns white at the heart. */
export const INK = { c: '#b04cff', hot: '#f0d8ff', deep: '#3a1050', smoke: '#2a1636' };
const WINE = '#c8306a';

// ---------------------------------------------------------------- letters

// Counterfeit letters: wedge strokes, as on a clay tablet, in unit space (-1..1).
const GLYPHS: readonly (readonly number[])[] = [
  [-0.8, -0.8, 0.8, -0.8, 0, -0.8, 0, 0.9, -0.6, 0.2, 0.6, 0.2],
  [-0.7, -0.9, -0.7, 0.9, -0.7, -0.1, 0.7, -0.6, -0.7, -0.1, 0.7, 0.8],
  [-0.9, 0.8, 0, -0.9, 0, -0.9, 0.9, 0.8, -0.5, 0.1, 0.5, 0.1],
  [-0.8, -0.6, 0.8, -0.6, -0.8, 0.1, 0.8, 0.1, -0.8, 0.8, 0.8, 0.8],
  [-0.6, -0.9, 0.6, -0.2, 0.6, -0.2, -0.6, 0.5, -0.6, 0.5, 0.6, 0.9],
  [0, -0.9, 0, 0.9, -0.8, -0.3, 0.8, -0.3, -0.5, 0.5, 0.5, 0.5],
];

/** A burning letter centred at x, y. heat 0..1 brightens it; caller need not set composite. */
export function drawGlyph(ctx: Ctx, x: number, y: number, s: number, idx: number, a: number, heat: number) {
  if (a <= 0.02) return;
  const g = GLYPHS[idx % GLYPHS.length];
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, s * 2.4, INK.c, a * (0.45 + heat * 0.4));
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < g.length; i += 4) {
    ctx.moveTo(x + g[i] * s, y + g[i + 1] * s);
    ctx.lineTo(x + g[i + 2] * s, y + g[i + 3] * s);
  }
  const p = ctx.globalAlpha;
  ctx.globalAlpha = p * a;
  ctx.strokeStyle = INK.c;
  ctx.lineWidth = Math.max(1, s * 0.42);
  ctx.stroke();
  ctx.strokeStyle = INK.hot;
  ctx.lineWidth = Math.max(0.6, s * 0.16 + heat * 0.4);
  ctx.stroke();
  ctx.globalAlpha = p;
  ctx.globalCompositeOperation = 'source-over';
}

/** A written letter loosed at its prey. A parry breaks it. */
export class Glyph extends Entity {
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  idx: number;
  size: number;
  hitSet = new Set<number>();
  t = 0;

  constructor(x: number, y: number, vx: number, vy: number, dmg: number, idx: number, size = 4) {
    super(x, y, size * 2.4, size * 2.4);
    this.team = 'enemy';
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.idx = idx;
    this.size = size;
    this.life = 2.4;
    this.layer = 9;
    this.grav = 0;
  }

  update(dt: number) {
    this.t += dt;
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const W = G.world;
    if (this.life <= 0 || W.solidAt(this.x, this.y)) return this.burst();
    const r = this.size * 1.2;
    if (W.hitPlayerSide({ x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 }, {
      dmg: this.dmg, poise: 14, kx: sign(this.vx) * 120, ky: -90, dir: sign(this.vx) || 1, kind: 'proj', src: this, parryable: true,
    }, this.hitSet)) this.burst();
    if (Math.random() < dt * 30) fx.spawn(PK.Spark, this.x, this.y, -this.vx * 0.2, -this.vy * 0.2, 0.25, 1.2, 0.2, INK.c, 0, 2);
  }

  parried() {
    this.burst();
  }

  burst() {
    if (this.remove) return;
    this.remove = true;
    sfx('inkBurst', { pan: G.world.pan(this.x), vol: 0.35, pitch: rand(1.2, 1.5), gap: 60 });
    for (let i = 0; i < 6; i++) fx.spawn(PK.Spark, this.x, this.y, rand(-90, 90), rand(-90, 60), 0.3, 1.4, 0.2, i % 2 ? INK.c : INK.hot, 200, 2);
  }

  draw(ctx: Ctx) {
    drawGlyph(ctx, this.x, this.y, this.size, this.idx, Math.min(1, this.life * 4), 0.8 + Math.sin(this.t * 30) * 0.2);
  }

  lights() {
    lighting.add(this.x, this.y, 34, INK.c, 0.6, 0.6);
  }
}

/** A glyph written on the floor: a ring that closes, then a burst of ink and Veil-fire. */
export class InkMark extends Entity {
  t = 0;
  tele: number;
  dmg: number;
  owner: Entity | null;
  idx: number;
  r: number;
  hitSet = new Set<number>();
  burst = false;
  /** Shown as a number in a count rather than a letter. */
  numeral = 0;

  constructor(x: number, y: number, dmg: number, owner: Entity | null, tele = 0.9, r = 18) {
    super(x, y, r * 2, 60);
    this.team = 'enemy';
    this.dmg = dmg;
    this.owner = owner;
    this.tele = tele;
    this.r = r;
    this.idx = Math.floor(rand(0, GLYPHS.length));
    this.layer = 8;
    this.grav = 0;
  }

  update(dt: number) {
    this.t += dt;
    if (!this.burst) {
      if (this.owner && this.owner.dying && !this.owner.isBoss) {
        fx.spawn(PK.Smoke, this.x, this.y - 4, 0, -20, 0.6, 4, 12, INK.smoke, -10, 1);
        this.remove = true;
        return;
      }
      if (this.t >= this.tele) {
        this.burst = true;
        sfx('inkBurst', { pan: G.world.pan(this.x), vol: 0.8 });
        G.camera.addTrauma(0.12 * shakeScale());
        fx.ring(this.x, this.y - 2, 4, this.r * 2.4, INK.c, 0.35, 3, 0.3);
        for (let i = 0; i < 16; i++) fx.spawn(PK.Flame, this.x + rand(-this.r * 0.6, this.r * 0.6), this.y - rand(0, 10), rand(-30, 30), rand(-260, -120), rand(0.3, 0.55), rand(4, 7), 1, i % 3 ? INK.c : INK.hot, 0, 1);
        G.world.hitPlayerSide({ x: this.x - this.r * 0.8, y: this.y - 64, w: this.r * 1.6, h: 64 }, {
          dmg: this.dmg, poise: 30, kx: 0, ky: -300, dir: 0, kind: 'proj', parryable: false, unblockable: true, src: this,
        }, this.hitSet);
      }
      return;
    }
    if (this.t > this.tele + 0.45) this.remove = true;
  }

  draw(ctx: Ctx) {
    const x = this.x, y = this.y, r = this.r;
    ctx.globalCompositeOperation = 'lighter';
    if (!this.burst) {
      const u = clamp(this.t / this.tele, 0, 1);
      const pulse = 0.6 + Math.sin(G.time * 20) * 0.25;
      ctx.globalAlpha = 0.3 + u * 0.4;
      ellipse(ctx, x, y - 1, r, r * 0.22, 0, INK.deep);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = INK.c;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(x, y - 1, r, r * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = INK.hot;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y - 1, Math.max(1, r * (1 - u)), Math.max(0.5, r * 0.22 * (1 - u)), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // The letter (or number) stands over its ring.
      if (this.numeral > 0) this.drawTally(ctx, x, y - 9, 0.5 + u * 0.5);
      else drawGlyph(ctx, x, y - 8, 4.5, this.idx, 0.5 + u * 0.5, u);
    } else {
      const bt = this.t - this.tele;
      const k = Math.max(0, 1 - bt / 0.45);
      glow(ctx, x, y - 20, r * 2.2, INK.c, 0.8 * k);
      glow(ctx, x, y - 10, r, INK.hot, 0.8 * k);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Tally strokes: the count, numbered. */
  private drawTally(ctx: Ctx, x: number, y: number, a: number) {
    const n = this.numeral;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 12, INK.c, a * 0.6);
    ctx.globalAlpha = a;
    ctx.strokeStyle = INK.hot;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const m = Math.min(n, 4);
    for (let i = 0; i < m; i++) {
      const sx = x - (m - 1) * 2 + i * 4;
      ctx.moveTo(sx, y - 5);
      ctx.lineTo(sx, y + 5);
    }
    if (n >= 5) {
      ctx.moveTo(x - 8, y + 4);
      ctx.lineTo(x + 8, y - 4);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    if (!this.burst) lighting.add(this.x, this.y - 6, 44, INK.c, 0.6, 0.4);
    else lighting.add(this.x, this.y - 30, 110, INK.c, Math.max(0, 1 - (this.t - this.tele) / 0.45), 0.8);
  }
}

/** A drop of burning wine: it falls, scalds, and pools for a moment where it lands. */
export class WineDrop extends Entity {
  vx: number;
  vy: number;
  dmg: number;
  hitSet = new Set<number>();
  life = 3;

  constructor(x: number, y: number, vx: number, vy: number, dmg: number) {
    super(x, y, 6, 6);
    this.team = 'enemy';
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.layer = 9;
    this.grav = 0;
  }

  update(dt: number) {
    this.life -= dt;
    this.vy = Math.min(420, this.vy + 620 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const W = G.world;
    if (W.hitPlayerSide({ x: this.x - 4, y: this.y - 4, w: 8, h: 8 }, { dmg: this.dmg, poise: 6, kx: sign(this.vx) * 60, ky: -60, dir: sign(this.vx) || 1, kind: 'proj', src: this, parryable: false }, this.hitSet)) {
      this.remove = true;
      return;
    }
    const col = Math.floor(this.x / TILE), row = Math.floor((this.y + 2) / TILE);
    const t = W.grid.get(col, row);
    if (W.solid(t) || t === T.OneWay) {
      const ground = row * TILE;
      W.add(new Proj('puddle', this.x, ground, 'enemy', this.dmg * 0.3, { life: 1.4, w: 18, h: 8, color: WINE }));
      sfx('wineSplash', { pan: W.pan(this.x), vol: 0.35, pitch: rand(0.9, 1.2), gap: 90 });
      fx.embers(this.x, ground - 2, 3, '#ff7aa8', 5);
      this.remove = true;
    } else if (this.life <= 0) this.remove = true;
  }

  draw(ctx: Ctx) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y, 7, WINE, 0.8);
    glow(ctx, this.x, this.y, 2.5, '#ffd0e0', 0.9);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// =====================================================================
// VESSEL WRAITH
// =====================================================================

const CUP_GOLD = '#d8a840', CUP_SILVER = '#c0c8d2';

export class Vessel extends Enemy {
  variant: number;
  tilt = 0;
  hoverT = rand(0, 6);
  pourN = 0;
  evadeCd = 0;
  shattered = false;

  constructor(x: number, y: number, elite: string | null) {
    super('vessel', x, y, 18, 18, elite);
    this.grav = 0;
    this.collide = false;
    this.variant = Math.random() < 0.5 ? 0 : 1;
    this.attackCd = rand(0.8, 2);
    if (elite) this.scale = 1.25;
  }

  groan() {
    sfx('wispHum', { pan: G.world.pan(this.x), vol: 0.35, pitch: 0.7 });
  }

  physics(dt: number) {
    const b = this.body;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.onGround = false;
    b.x = clamp(b.x, 8, G.world.grid.w * TILE - 8);
    if (this.dying && !this.awaitingPurify) {
      b.vy += 600 * dt;
      // It falls, rings once, and breaks.
      if (!this.shattered && (G.world.solidAt(this.x, this.y + 6) || this.deathT > 0.6)) this.shatter();
    }
  }

  private shatter() {
    this.shattered = true;
    this.body.vx = this.body.vy = 0;
    sfx('cupShatter', { pan: G.world.pan(this.x) });
    fx.shards(this.x, this.y, 12, this.variant ? CUP_SILVER : CUP_GOLD, 1.1);
    fx.veilBurst(this.x, this.y - 4, 10, 0.8);
  }

  flinch(h: HitInfo) {
    this.hurtT = 0.2;
    this.body.vx = h.kx * 0.8;
    this.body.vy = h.ky * 0.4;
    this.setState('hover');
  }

  stagger() {
    super.stagger();
    this.body.vy = 50;
  }

  /** The cup's lip, where the wine leaves it. */
  private lip() {
    const f = this.face, s = this.scale, c = Math.cos(this.tilt), sn = Math.sin(this.tilt);
    const lx = 8, ly = -4;
    return { x: this.x + f * s * (lx * c - ly * sn), y: this.y + s * (lx * sn + ly * c) };
  }

  think(dt: number) {
    const b = this.body;
    this.hoverT += dt;
    this.evadeCd -= dt;
    if (!this.aggro) {
      const t = this.pickTarget(250);
      if (t) this.aggro = true;
      b.vx = approach(b.vx, Math.sin(this.hoverT * 0.8 + this.id) * 12, 80 * dt);
      b.vy = approach(b.vy, Math.sin(this.hoverT * 1.9 + this.id) * 10, 80 * dt);
      return;
    }
    this.target = this.pickTarget(540);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const p = G.world.player;
    // A blade raised nearby: slip aside.
    if (this.evadeCd <= 0 && this.state !== 'dive' && t === p && p.state === 'attack' && Math.abs(p.x - this.x) < 58 && Math.abs(p.y - 20 - this.y) < 50) {
      this.evadeCd = this.elite ? 1.1 : 1.7;
      const side = sign(this.x - p.x) || 1;
      b.vx = side * 240;
      b.vy = -150;
      this.tilt = 0;
      this.setState('hover');
      sfx('whoosh', { pan: G.world.pan(this.x), vol: 0.35, pitch: 1.5 });
      return;
    }
    switch (this.state) {
      case 'tilt': {
        // The tell: the cup leans toward its prey, wine welling at the lip.
        this.faceTarget();
        b.vx = approach(b.vx, 0, 300 * dt);
        b.vy = approach(b.vy, 0, 300 * dt);
        this.tilt = approach(this.tilt, 1.25, dt * 3);
        if (this.st >= 0.55) {
          this.setState('pour');
          this.pourN = 0;
          sfx('wineSplash', { pan: G.world.pan(this.x), vol: 0.6, pitch: 0.7 });
        }
        break;
      }
      case 'pour': {
        this.faceTarget();
        this.tilt = approach(this.tilt, 1.7, dt * 2);
        // Drift over the prey while the stream falls.
        b.vx = approach(b.vx, clamp((t.x - this.face * 26 - this.x) * 1.5, -60, 60), 200 * dt);
        b.vy = approach(b.vy, 0, 200 * dt);
        const n = Math.floor(this.st / 0.07);
        while (this.pourN < n && this.pourN < (this.elite ? 18 : 13)) {
          this.pourN++;
          const l = this.lip();
          G.world.add(new WineDrop(l.x, l.y, this.face * rand(30, 70) + b.vx * 0.5, rand(-20, 20), this.dmg * 0.42));
        }
        if (this.st >= (this.elite ? 1.3 : 0.95)) {
          this.attackCd = rand(1.6, 2.6);
          this.setState('hover');
        }
        break;
      }
      case 'windup': {
        this.faceTarget();
        b.vx = approach(b.vx, -this.face * 50, 400 * dt);
        b.vy = approach(b.vy, -40, 300 * dt);
        this.tilt = approach(this.tilt, -0.5, dt * 4);
        if (this.st > 0.45) {
          this.setState('dive');
          this.hitSet.clear();
          const dx = t.x - this.x, dy = t.y - 16 - this.y;
          const d = Math.hypot(dx, dy) || 1;
          b.vx = (dx / d) * 380;
          b.vy = (dy / d) * 380;
          sfx('whoosh', { pan: G.world.pan(this.x), vol: 0.6, pitch: 1.1 });
        }
        break;
      }
      case 'dive': {
        this.tilt = approach(this.tilt, 0.6, dt * 6);
        this.strike(-9, -9, 18, 18, 1, { kx: sign(b.vx) * 160, ky: -120, poise: 16, parryable: true });
        if (this.st > 0.55 || G.world.solidAt(this.x, this.y + 8)) {
          this.setState('rise');
          this.attackCd = rand(1.4, 2.2);
        }
        break;
      }
      case 'rise': {
        b.vx = approach(b.vx, 0, 500 * dt);
        b.vy = approach(b.vy, -130, 600 * dt);
        if (this.st > 0.5) this.setState('hover');
        break;
      }
      default: {
        this.tilt = approach(this.tilt, Math.sin(this.hoverT * 2) * 0.12, dt * 3);
        const side = this.id % 2 ? 1 : -1;
        const hx = t.x + side * 50 + Math.sin(this.hoverT * 1.2) * 26;
        const hy = t.y - 86 + Math.sin(this.hoverT * 2.3) * 10;
        b.vx = approach(b.vx, clamp((hx - this.x) * 2.2, -130, 130), 360 * dt);
        b.vy = approach(b.vy, clamp((hy - this.y) * 2.2, -130, 130), 360 * dt);
        this.faceTarget();
        this.state = 'hover';
        if (this.attackCd <= 0 && Math.abs(t.x - this.x) < 160) {
          if (Math.random() < 0.65) {
            this.setState('tilt');
            sfx('wispHum', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.3 });
          } else this.setState('windup');
        }
      }
    }
  }

  die(h?: HitInfo) {
    super.die(h);
    if (!this.awaitingPurify) this.body.vy = Math.min(this.body.vy, -60);
  }

  draw(ctx: Ctx) {
    if (this.shattered && !this.awaitingPurify) return;
    const f = this.face;
    const t = G.time + this.id;
    const s = this.scale;
    const a = this.dying && !this.awaitingPurify ? clamp(1 - this.deathT / 0.8, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.scale(f * s, s);
    // Veil smoke spilling over the rim and trailing below like wine.
    ctx.strokeStyle = INK.smoke;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ox = -4 + i * 2.6;
      ctx.lineWidth = 2.4 - Math.abs(i - 1.5) * 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, 4);
      ctx.quadraticCurveTo(ox + Math.sin(t * 3 + i) * 4, 12, ox + Math.sin(t * 2 + i * 1.7) * 6 - this.body.vx * f * 0.06, 19 + (i % 2) * 3);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 8, 12, INK.c, 0.3);
    ctx.globalCompositeOperation = 'source-over';
    // A faint face in the smoke above the cup.
    {
      const fy = -11 + Math.sin(t * 1.7) * 1;
      glow(ctx, 0, fy, 11, INK.smoke, 0.75);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, fy, 9, INK.c, 0.25);
      glow(ctx, 2.6, fy - 1, 2.4, '#ff6ad8', 0.9);
      glow(ctx, -1.8, fy - 1, 2.1, '#ff6ad8', 0.75);
      ctx.globalCompositeOperation = 'source-over';
      ellipse(ctx, 0.6, fy + 2.6, 1.6, 1.1 + (this.state === 'pour' ? 0.8 : 0), 0, 'rgba(8,2,12,0.7)');
    }
    // The cup, tipped.
    ctx.rotate(this.tilt);
    const metal = this.variant ? CUP_SILVER : CUP_GOLD;
    const fill = vGrad(ctx, metal, -5, 11, 0.4, -0.45);
    if (this.variant === 0) {
      // A chalice: deep bowl, stem, foot.
      poly(ctx, [-7.5, -4, 7.5, -4, 6, 1.5, 2, 4.6, 1, 8.6, 4.6, 10.2, 4.6, 11.4, -4.6, 11.4, -4.6, 10.2, -1, 8.6, -2, 4.6, -6, 1.5], fill, '#140a02', 0.8);
      ctx.fillStyle = 'rgba(255,240,200,0.45)';
      ctx.fillRect(-5.4, -2.6, 1.1, 4);
      ellipse(ctx, 0, 0.8, 4.6, 1, 0, 'rgba(90,60,10,0.5)');
    } else {
      // A wide silver bowl with ring handles.
      poly(ctx, [-9.5, -3.5, 9.5, -3.5, 7, 2.5, 3.5, 4.6, 3.2, 6.6, -3.2, 6.6, -3.5, 4.6, -7, 2.5], fill, '#0a0c10', 0.8);
      ctx.strokeStyle = metal;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(-10.4, -0.6, 2, 0, Math.PI * 2);
      ctx.moveTo(12.4, -0.6);
      ctx.arc(10.4, -0.6, 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-7, -2.2, 1.1, 3);
    }
    // The rim, full to the brim with dark wine and violet light.
    ellipse(ctx, 0, -4, this.variant ? 9.5 : 7.5, 1.8, 0, '#2a0618');
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -4.5, 7, this.state === 'tilt' || this.state === 'pour' ? '#ff4a9a' : INK.c, 0.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.state === 'tilt') this.glint(ctx, this.lip().x, this.lip().y, '#ff4a9a');
    else if (this.state === 'windup') this.glint(ctx, this.x, this.y - 2, INK.c);
    this.drawFlash(ctx);
  }

  hurtbox() {
    const s = this.scale;
    return { x: this.x - 10 * s, y: this.y - 14 * s, w: 20 * s, h: 26 * s };
  }
  get cy() {
    return this.y - 2;
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x, this.y - 4, 50, this.state === 'pour' ? '#ff4a9a' : INK.c, 0.6, 0.5);
  }
}

// =====================================================================
// SCRIBE OF THE VEIL
// =====================================================================

const kf = (t: number, p: Partial<Pose>, ease?: (x: number) => number) => ({ t, p, ease });

export const SCRIBE_DIMS: RigDims = { torso: 12.2, head: 4.3, neck: 1.4, upperArm: 7, foreArm: 6.8, thigh: 8.2, shin: 8.4, shoulderSpread: 1.4, hipSpread: 1.3 };
// The tablet rests on the back forearm; the stylus is in the front hand.
const SB: Pose = { ...BASE_POSE, lean: 0.04, head: 0.1, bUA: 0.55, bFA: 1.25, fUA: 0.7, fFA: 1.25, wpn: 0.5, off: 0, bTh: -0.1, bSh: -0.06, fTh: 0.12, fSh: -0.1 };
const WRITE: Partial<Pose> = { fUA: 1.9, fFA: 0.55, bUA: 0.7, bFA: 1.4, lean: -0.05, head: -0.12, fTh: 0.25, bTh: -0.25 };
const FLOOR: Partial<Pose> = { fUA: 0.9, fFA: 0.2, bUA: 0.5, bFA: 1.3, lean: 0.32, head: 0.4, fTh: 0.45, fSh: -0.4, bTh: -0.3 };
const WARD: Partial<Pose> = { bUA: 1.55, bFA: 0.2, fUA: 1.3, fFA: 0.9, lean: -0.08, head: 0.05, fTh: 0.3, bTh: -0.35 };
const S_KNEEL: Partial<Pose> = { lean: 0.55, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.5, fUA: 0.4, fFA: 0.8 };

const SCRIBE_CLIPS: Record<string, Clip> = {
  idle: { dur: 2.6, loop: true, base: SB, fn: (u) => ({ lean: SB.lean + Math.sin(u * Math.PI * 2) * 0.02, y: Math.sin(u * Math.PI * 2) * 0.35, fFA: SB.fFA + Math.sin(u * Math.PI * 6) * 0.08 }) },
  walk: {
    dur: 0.8, loop: true, base: SB, steps: [0.25, 0.75],
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return { lean: SB.lean + 0.06, fTh: 0.04 + 0.42 * s, fSh: -0.15 - 0.42 * Math.max(0, Math.cos(p - 0.5)), bTh: -0.04 - 0.42 * s, bSh: -0.15 - 0.42 * Math.max(0, Math.cos(p + Math.PI - 0.5)) };
    },
  },
  back: {
    dur: 0.62, loop: true, base: SB,
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return { lean: -0.12, fTh: 0.04 + 0.42 * s, fSh: -0.15 - 0.45 * Math.max(0, Math.cos(p - 0.5)), bTh: -0.04 - 0.42 * s, bSh: -0.15 - 0.45 * Math.max(0, Math.cos(p + Math.PI - 0.5)) };
    },
  },
  // The stylus scratches letters into the air.
  write: { dur: 0.42, loop: true, base: SB, fn: (u) => ({ ...WRITE, fUA: WRITE.fUA! + Math.sin(u * Math.PI * 2) * 0.22, fFA: WRITE.fFA! + Math.cos(u * Math.PI * 4) * 0.25 }) },
  hold: { dur: 0.3, base: SB, keys: [kf(0, WRITE), kf(1, { ...WRITE, fUA: 2.3, fFA: 0.2, lean: -0.12 }, easeOutCubic)] },
  loose: { dur: 0.5, base: SB, keys: [kf(0, { ...WRITE, fUA: 2.3, fFA: 0.2 }), kf(0.3, { fUA: 1.5, fFA: 0.05, lean: 0.2, fTh: 0.4, bTh: -0.35 }, easeOutBack), kf(1, {}, easeInOutSine)] },
  floor: { dur: 0.6, base: SB, keys: [kf(0, {}), kf(0.5, FLOOR, easeOutCubic), kf(1, FLOOR)] },
  ward: { dur: 0.25, base: SB, keys: [kf(0, {}), kf(1, WARD, easeOutBack)] },
  hurt: { dur: 0.25, base: SB, keys: [kf(0, { lean: -0.3, head: 0.4 }), kf(1, {}, easeOutCubic)] },
  stagger: { dur: 0.5, base: SB, keys: [kf(0, { lean: -0.3 }), kf(1, { ...S_KNEEL, lean: 0.75 }, easeOutCubic)] },
  death: { dur: 0.9, base: SB, keys: [kf(0, { lean: -0.3 }), kf(1, { lean: 1.3, head: 0.8, fTh: 1.4, fSh: -2.4, bTh: -0.1, bSh: -1.9, rot: 0.35, y: 3 }, easeOutCubic)] },
  kneel: { dur: 0.6, base: SB, keys: [kf(0, {}), kf(1, S_KNEEL, easeOutCubic)] },
};

function scribeStyle(elite: boolean): HumanStyle {
  const robe = elite ? '#1e1430' : '#22203a';
  return {
    skin: '#7a5a4c', hair: null, hairKind: 'none', beard: '#1a1210',
    coat: robe, coatDark: '#100c1a', skirt: 16, trim: elite ? '#c9a04a' : '#7a5ac8',
    pants: '#1a1830', boots: '#140f0c', glove: '#7a5a4c', belt: '#7a5ac8',
    plate: null, helm: 'none', eye: '#e8b0ff', eyeGlow: 0.9, outline: '#08060c',
    weapon: 'none', offhand: 'none', crack: null, bulk: 1.0,
  };
}

interface Letter { x: number; y: number; idx: number; t: number }

export class Scribe extends Enemy {
  pal: HumanStyle;
  letters: Letter[] = [];
  lineN = 4;
  fired = 0;
  wardCd = 0;
  blinkCd = 2;
  cornerT = 0;
  markCd = rand(2, 4);
  fade = 1;
  blinkTo = 0;
  warding = 0;

  constructor(x: number, y: number, elite: string | null) {
    super('scribe', x, y, 12, 34, elite);
    this.dims = SCRIBE_DIMS;
    this.pal = scribeStyle(!!elite);
    this.style = this.pal;
    this.anim = new Animator(SCRIBE_CLIPS, SB);
    this.anim.play('idle', 0);
    this.anim.time = rand(0, 2);
    this.attackCd = rand(1, 2);
    if (elite) this.scale = 1.08;
  }

  groan() {
    sfx('glyphBurn', { pan: G.world.pan(this.x), vol: 0.3, pitch: rand(0.8, 1.1) });
  }

  canBeTargeted() {
    return super.canBeTargeted() && this.state !== 'vanish';
  }

  /** The sigil turns frontal blows while it is raised. */
  guardCheck(h: HitInfo) {
    if (this.warding <= 0 || h.guardBreak || h.kind === 'ability' || this.staggered > 0) return false;
    if (h.dir !== 0 && sign(h.dir) === this.face) return false;
    sfx('block', { pan: G.world.pan(this.x), pitch: 1.3 });
    fx.hitSparks(this.x + this.face * 12, this.y - 22, -this.face, INK.hot, 8);
    this.poise -= h.poise * (h.heavy ? 0.9 : 0.4);
    if (this.poise <= 0) {
      this.warding = 0;
      this.stagger();
      return false;
    }
    return true;
  }

  /** Struck mid-line: the writing fails. */
  private spoil() {
    if (!this.letters.length) return;
    for (const l of this.letters) fx.spawn(PK.Smoke, l.x, l.y, rand(-10, 10), -20, 0.5, 3, 8, INK.smoke, -10, 1);
    this.letters.length = 0;
  }
  flinch(h: HitInfo) {
    if (this.state === 'write' || this.state === 'hold') this.spoil();
    super.flinch(h);
  }
  stagger() {
    this.spoil();
    this.warding = 0;
    super.stagger();
  }
  die(h?: HitInfo) {
    this.spoil();
    super.die(h);
  }

  private standable(x: number) {
    const W = G.world;
    const col = Math.floor(x / TILE), row = Math.floor((this.y + 3) / TILE);
    const under = W.grid.get(col, row);
    if (!(W.solid(under) || under === T.OneWay)) return false;
    return !W.solidAt(x, this.y - 6) && !W.solidAt(x, this.y - 26) && x > 20 && x < W.grid.w * TILE - 20;
  }

  think(dt: number) {
    const b = this.body;
    this.wardCd -= dt;
    this.blinkCd -= dt;
    this.markCd -= dt;
    this.warding = Math.max(0, this.warding - dt);
    if (!this.aggro) {
      const t = this.pickTarget(300);
      if (t && this.canSee(t)) this.aggro = true;
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
    const s = this.scale;
    switch (this.state) {
      case 'write': {
        // A letter every beat, written out in a line before the scribe.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.faceTarget();
        const want = Math.min(this.lineN, 1 + Math.floor(this.st / 0.15));
        while (this.letters.length < want) {
          const i = this.letters.length;
          this.letters.push({ x: this.x + this.face * (16 + i * 11) * s, y: this.y - (44 + Math.sin(i * 1.3) * 4) * s, idx: Math.floor(rand(0, 6)), t: 0 });
          sfx('glyphBurn', { pan: G.world.pan(this.x), vol: 0.45, pitch: 1 + i * 0.06 });
        }
        if (this.st >= this.lineN * 0.15 + 0.05) this.setState('hold', 'hold', 0.05);
        break;
      }
      case 'hold': {
        // The line hangs, burning: the tell.
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st >= 0.5) {
          this.fired = 0;
          this.setState('loose', 'loose', 0.04);
        }
        break;
      }
      case 'loose': {
        // Then the letters fly, one by one.
        const n = Math.floor(this.st / 0.14) + 1;
        while (this.fired < n && this.letters.length) {
          const l = this.letters.shift()!;
          this.fired++;
          const tx = t.x + (t.body.vx || 0) * 0.2, ty = t.y - 16;
          const d = Math.hypot(tx - l.x, ty - l.y) || 1;
          G.world.add(new Glyph(l.x, l.y, ((tx - l.x) / d) * 240, ((ty - l.y) / d) * 240, this.dmg * 0.55, l.idx, 4 * s));
          sfx('glyphBurn', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.4 });
        }
        if (!this.letters.length && this.st > 0.5) {
          this.attackCd = this.elite ? rand(1.2, 1.8) : rand(1.6, 2.4);
          this.setState('move', 'idle', 0.15);
        }
        break;
      }
      case 'floor': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st < dt * 1.5) {
          const gy = t.body.onGround ? t.y : this.y;
          G.world.add(new InkMark(clamp(t.x, 20, G.world.grid.w * TILE - 20), gy, this.dmg * 1.0, this, 0.9));
          if (this.elite) G.world.add(new InkMark(clamp(t.x + (Math.random() < 0.5 ? -40 : 40), 20, G.world.grid.w * TILE - 20), gy, this.dmg, this, 1.15));
          sfx('glyphBurn', { pan: G.world.pan(this.x), vol: 0.7, pitch: 0.7 });
        }
        if (this.st >= 0.75) {
          this.markCd = this.elite ? rand(3.5, 5) : rand(4.5, 7);
          this.attackCd = rand(0.8, 1.3);
          this.setState('move', 'idle', 0.2);
        }
        break;
      }
      case 'ward': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.faceTarget();
        if (this.st >= 0.75) {
          this.warding = 0;
          // Still pressed: slip away in a splash of ink.
          if (dist < 46 && this.blinkCd <= 0 && this.startVanish(t)) break;
          this.attackCd = Math.min(this.attackCd, 0.4);
          this.setState('move', 'idle', 0.15);
        }
        break;
      }
      case 'vanish': {
        b.vx = 0;
        this.invuln = 0.2;
        if (this.st < 0.26) this.fade = 1 - this.st / 0.26;
        else {
          if (this.blinkTo) {
            this.x = this.blinkTo;
            this.blinkTo = 0;
            this.faceTarget();
            this.splash();
          }
          this.fade = Math.min(1, (this.st - 0.26) / 0.24);
        }
        if (this.st >= 0.5) {
          this.fade = 1;
          this.invuln = 0;
          this.attackCd = Math.min(this.attackCd, 0.3);
          this.setState('move', 'idle', 0.1);
        }
        break;
      }
      default: {
        this.faceTarget();
        const p = G.world.player;
        // Closed in and a blade rising: the sigil.
        if (dist < 44 && this.wardCd <= 0 && b.onGround && t === p && (p.state === 'attack' || p.state === 'charge')) {
          this.wardCd = this.elite ? 2.6 : 3.6;
          this.warding = 0.75;
          this.setState('ward', 'ward', 0.04);
          sfx('glyphBurn', { pan: G.world.pan(this.x), pitch: 0.6 });
          break;
        }
        const away = -sign(dx) || -this.face;
        const blocked = b.onGround && (wallAhead(b, away, G.world.grid, G.world.solid, 14) || !groundAhead(b, away, G.world.grid, G.world.solid, 12));
        if (dist < 60 && (blocked || dist < 28)) this.cornerT += dt;
        else this.cornerT = Math.max(0, this.cornerT - dt);
        if (this.cornerT > 0.45 && this.blinkCd <= 0 && b.onGround && this.startVanish(t)) break;
        if (this.attackCd <= 0 && b.onGround && dist < 300 && this.canSee(t)) {
          if (this.markCd <= 0 && t.body.onGround) {
            this.setState('floor', 'floor', 0.1);
            break;
          }
          this.letters.length = 0;
          this.lineN = this.elite ? Math.floor(rand(5, 8)) : Math.floor(rand(3, 6));
          this.setState('write', 'write', 0.1);
          break;
        }
        // Mid range: close the gap slowly, back off from a blade.
        let moving = false;
        if (dist > 210) moving = this.walkToward(t.x, 58, dt, 180);
        else if (dist < 105) {
          moving = this.walkToward(this.x + away * 40, 66, dt);
          this.face = sign(dx) || this.face;
        } else b.vx = approach(b.vx, 0, 600 * dt);
        const want = moving && Math.abs(b.vx) > 8 ? (sign(b.vx) === this.face ? 'walk' : 'back') : 'idle';
        if (this.anim!.name !== want && this.state === 'move') this.anim!.play(want, 0.15);
        this.state = 'move';
      }
    }
    // Written letters drift a little as they burn.
    for (const l of this.letters) {
      l.t += dt;
      l.y += Math.sin(l.t * 6 + l.idx) * 4 * dt;
    }
  }

  private startVanish(t: Entity) {
    const away = sign(this.x - t.x) || -this.face;
    for (const x of [this.x + away * 140, this.x + away * 100, t.x - away * 110, t.x - away * 150]) {
      if (!this.standable(x)) continue;
      this.blinkTo = x;
      this.blinkCd = this.elite ? 4.5 : 6.5;
      this.cornerT = 0;
      this.spoil();
      this.setState('vanish', 'idle', 0.05);
      this.splash();
      return true;
    }
    this.blinkCd = 1.5;
    return false;
  }

  private splash() {
    sfx('inkBurst', { pan: G.world.pan(this.x), vol: 0.8 });
    fx.ring(this.x, this.y - 16, 4, 32, INK.c, 0.3, 3);
    for (let i = 0; i < 14; i++) fx.spawn(PK.Drop, this.x + rand(-6, 6), this.y - rand(4, 30), rand(-90, 90), rand(-140, -20), rand(0.4, 0.7), rand(1.4, 2.4), 0.6, i % 3 ? '#4a1a70' : INK.c, 500, 1);
    fx.veilBurst(this.x, this.y - 16, 8, 0.7);
  }

  draw(ctx: Ctx) {
    // The line hangs in the air until it is loosed (or spoiled).
    for (let i = 0; i < this.letters.length; i++) {
      const l = this.letters[i];
      const heat = this.state === 'hold' ? 0.6 + Math.sin(G.time * 24 + i) * 0.4 : 0.3;
      drawGlyph(ctx, l.x, l.y, 4 * this.scale, l.idx, Math.min(1, l.t * 6), heat);
    }
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
    drawHumanoid(ctx, j, this.pal, G.time + this.id, this.pose.rot, this.body.vx * f, this.body.vy);
    this.drawTools(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = a * Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, j, flashStyle(this.pal), G.time + this.id, this.pose.rot);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.warding > 0) {
      // A sigil disc held before it.
      const x = this.x + f * 13 * s, y = this.y - 22 * s;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, 16, INK.c, 0.6);
      ctx.strokeStyle = INK.hot;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      drawGlyph(ctx, x, y, 3.4, 3, 0.9, 0.8);
    }
    if (this.state === 'floor' && this.st < 0.4) this.glint(ctx, this.x + f * 12 * s, this.y - 18 * s, INK.c);
    this.drawFlash(ctx);
  }

  /** The clay tablet on the back arm, the stylus in the front hand, and a scribe's cap. */
  private drawTools(ctx: Ctx) {
    const j = this.j;
    const o = '#08060c';
    // Tablet: a rounded slab of clay with lines of wedges.
    ctx.save();
    ctx.translate(j.haBX, j.haBY);
    ctx.rotate(j.foreBA - Math.PI / 2 + 0.3);
    poly(ctx, [-1.5, -4.5, 3.5, -4.5, 4, 3.5, -1, 4], vGrad(ctx, '#9a6a48', -4.5, 4, 0.18, -0.3), o, 0.45);
    ctx.strokeStyle = 'rgba(60,30,20,0.7)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (let r = 0; r < 4; r++) {
      ctx.moveTo(-0.6, -3 + r * 1.8);
      ctx.lineTo(3, -3 + r * 1.8);
    }
    ctx.stroke();
    ctx.restore();
    // Stylus: a reed, its tip lit with ink while it writes.
    const a = j.foreFA;
    const dx = Math.sin(a), dy = Math.cos(a);
    ctx.strokeStyle = '#c8b080';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(j.haFX - dx * 2, j.haFY - dy * 2);
    ctx.lineTo(j.haFX + dx * 5, j.haFY + dy * 5);
    ctx.stroke();
    if (this.state === 'write' || this.state === 'hold' || this.state === 'floor') {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, j.haFX + dx * 5, j.haFY + dy * 5, 4, INK.c, 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    // A low round cap.
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    const R = 4.5;
    ctx.beginPath();
    ctx.ellipse(-0.2, -R * 0.62, R * 1.02, R * 0.62, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, this.elite ? '#3a1a50' : '#2c2848', -R * 1.3, -R * 0.6, 0.25, -0.2);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = this.pal.trim ?? '#7a5ac8';
    ctx.fillRect(-R * 1.0, -R * 0.72, R * 2.0, 0.7);
    ctx.restore();
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    if (this.awaitingPurify) {
      super.lights();
      return;
    }
    lighting.add(this.x, this.y - 30, 40 + this.letters.length * 10, INK.c, 0.5 * this.fade, 0.4);
  }
}
