// The hosts of the fallen princes (Chapter VI):
//
// - UNDYING HOST: a soldier of the fallen host in tarnished plate, with the
//   stubs of wings. Struck down, it kneels in a pale ring of light and rises
//   again after a few seconds at half strength, once, unless it is finished:
//   executed, struck again while it kneels, or killed by a finisher.
// - FALLEN GALE: a flier of storm and feathers. It flashes and marks the
//   ground, then drops a bolt of lightning on the mark. Fragile, and quick to
//   slip aside.
//
// The lightning drawing here also serves the Prince of the Storm.

import { type HitInfo } from './entity';
import { Animator, Chain, drawRibbon } from '../render/skeleton';
import { type HumanStyle } from '../render/actors';
import { glow, poly, ellipse, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign } from '../core/math';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { TILE, T } from './tiles';
import { Enemy, SENT_CLIPS, SENT_BASE, SENT_DIMS } from './enemies';

/** Pale host-light: the glow of a fallen angel's soldiers. */
export const HOST = { glow: '#b8c8ff', hot: '#f4f6ff', dim: '#5a6aa8' };
export const BOLT = { c: '#9ac4ff', hot: '#ffffff' };

/** The floor under x, scanning down from y (one-way ledges count). */
export function floorBelow(x: number, y: number) {
  const W = G.world;
  const col = Math.floor(x / TILE);
  for (let row = Math.max(0, Math.floor(y / TILE)); row < W.grid.h; row++) {
    const t = W.grid.get(col, row);
    if (W.solid(t) || t === T.OneWay) return row * TILE;
  }
  return W.grid.h * TILE;
}

/** Jagged offsets for a bolt, refreshed per strike (no allocation per frame). */
export function jag(out: Float32Array, amp: number) {
  for (let i = 0; i < out.length; i++) out[i] = (i === 0 || i === out.length - 1) ? 0 : rand(-amp, amp);
}

/** A lightning bolt from (x0, y0) down to (x1, y1), bent by the jag offsets. a fades it. */
export function drawBolt(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, j: Float32Array, a: number, w = 1) {
  if (a <= 0.02) return;
  const n = j.length;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const p = ctx.globalAlpha;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = x0 + (x1 - x0) * u + j[i], y = y0 + (y1 - y0) * u;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = p * a * (pass ? 1 : 0.55);
    ctx.strokeStyle = pass ? BOLT.hot : BOLT.c;
    ctx.lineWidth = (pass ? 1.4 : 5) * w;
    ctx.stroke();
  }
  ctx.globalAlpha = p;
  glow(ctx, x1, y1 - 4, 22 * w, BOLT.c, a * 0.8);
  ctx.globalCompositeOperation = 'source-over';
}

// =====================================================================
// UNDYING HOST
// =====================================================================

function hostStyle(elite: boolean): HumanStyle {
  return {
    skin: '#4a4654', hair: null, hairKind: 'none', coat: elite ? '#2a2236' : '#2c2a34', coatDark: '#16141c', skirt: 11, trim: elite ? '#c9a04a' : '#6a6a8a',
    pants: '#1c1a22', boots: '#1e1c24', glove: '#2e2c36', belt: '#14121a',
    plate: { c: elite ? '#3a3448' : '#36343e', dark: '#1a1820', hi: elite ? '#d8c08a' : '#8a8aa8', tier: 2 }, helm: 'sentinel', helmColor: elite ? '#2e2a3a' : '#2a2832', helmTrim: elite ? '#c9a04a' : '#7a7a9a',
    eye: HOST.hot, eyeGlow: 1, outline: '#08070c', weapon: 'spear', weaponColor: '#8a8a9a', weaponGlow: HOST.glow, weaponGlowAmt: 0.3,
    offhand: 'none', crack: HOST.glow, bulk: elite ? 1.35 : 1.25,
  };
}

/** The Captain as an Echo (black and gold, white fire). */
export function undyingEchoStyle(stage = 0): HumanStyle {
  const gold = '#e2b85a';
  return {
    ...hostStyle(true), skin: '#2a2420', coat: stage >= 1 ? '#e8dcc0' : '#2a2420', coatDark: stage >= 1 ? '#c8b894' : '#1a1612', trim: gold,
    plate: { c: '#1c1a1f', dark: '#0e0d10', hi: stage >= 2 ? '#ffe08a' : gold, tier: 2 }, helmColor: '#1c1a1f', helmTrim: gold,
    eye: '#ffffff', outline: '#0a0806', weaponColor: '#e8e4dc', weaponGlow: '#fff3c4', weaponGlowAmt: 0.35 + stage * 0.3, weaponFlame: stage >= 2,
    crack: stage === 0 ? '#ffd27a' : null, runes: '#ffe6a8', crest: stage >= 2 ? '#fff3c4' : null,
  };
}

/** Stubs of wings behind a host soldier, in rig space. spread 0..1. */
export function drawHostWings(ctx: Ctx, sx: number, sy: number, spread: number, c: string, edge: string) {
  for (let w = 0; w < 2; w++) {
    const a = -2.4 + spread * 0.5 + w * 0.35;
    const L = 14 + spread * 4 - w * 3;
    const tx = sx + Math.cos(a) * L, ty = sy + Math.sin(a) * L;
    poly(ctx, [sx, sy, tx, ty, sx + Math.cos(a + 0.5) * L * 0.75, sy + Math.sin(a + 0.5) * L * 0.75, sx + Math.cos(a + 0.9) * L * 0.5, sy + Math.sin(a + 0.9) * L * 0.5], c, edge, 0.5);
  }
}

const RISE_T = 3;

export class Undying extends Enemy {
  combo = 0;
  /** Has it already risen once? */
  risen = false;
  downT = 0;
  /** Empowered by the prince of Persia while he stands. */
  empowered = false;
  cape: Chain;

  constructor(x: number, y: number, elite: string | null) {
    super('undying', x, y, 16, 40, elite);
    this.dims = SENT_DIMS;
    this.style = hostStyle(!!elite);
    this.anim = new Animator(SENT_CLIPS, SENT_BASE);
    this.anim.play('idle', 0);
    this.superArmor = !!elite;
    this.cape = new Chain(6, 4, x, y - 34);
    this.attackCd = rand(0.6, 1.4);
    if (elite) this.scale = 1.12;
  }

  groan() {
    sfx('sentinelClank', { pan: G.world.pan(this.x), vol: 0.45, pitch: 0.8 });
  }

  /** It can be finished on its knees: an execution ends it for good. */
  executable() {
    return (this.state === 'down' && !this.dying) || super.executable();
  }

  takeHit(h: HitInfo): boolean {
    if (this.state === 'down' && !this.dying) {
      if (this.invuln > 0) return false;
      // Struck again while it kneels: it does not rise.
      this.finish(h);
      return true;
    }
    if (this.empowered && !h.dot) h = { ...h, dmg: h.dmg * 0.8 };
    return super.takeHit(h);
  }

  die(h?: HitInfo) {
    if (this.dying) return;
    const finisher = G.world.player.state === 'execute';
    if (!this.risen && !finisher && this.state !== 'down') {
      this.goDown();
      return;
    }
    this.finish(h);
  }

  private finish(h?: HitInfo) {
    this.hp = 0;
    this.downT = 0;
    if (this.state === 'down') {
      fx.ring(this.x, this.y - 2, 4, 40, HOST.glow, 0.35, 3, 0.3);
      fx.holyBurst(this.cx, this.cy, 10, 0.7);
      sfx('enemyDie', { pan: G.world.pan(this.x), pitch: 0.7 });
    }
    super.die(h);
  }

  /** Down, not dead: it kneels in its ring of light and gathers itself. */
  private goDown() {
    this.hp = 1;
    this.state = 'down';
    this.st = 0;
    this.downT = RISE_T;
    this.staggered = 0;
    this.hurtT = 0;
    this.invuln = 0.3;
    this.anim?.play('kneel', 0.08, true);
    this.body.vx *= 0.3;
    sfx('stagger', { pan: G.world.pan(this.x), pitch: 0.7 });
    fx.ring(this.x, this.y - 2, 4, 26, HOST.glow, 0.4, 2, 0.3);
  }

  private rise() {
    this.risen = true;
    this.hp = Math.round(this.maxHp * 0.5);
    this.poise = this.maxPoise;
    this.attackCd = 0.6;
    this.setState('rise', 'rise', 0.06);
    sfx('undyingRise', { pan: G.world.pan(this.x) });
    sfx('arise', { pan: G.world.pan(this.x), vol: 0.35, pitch: 1.3 });
    fx.column(this.x, this.y, 20, 90, HOST.glow, 0.6);
    fx.ring(this.x, this.y - 20, 6, 50, HOST.glow, 0.4, 3);
    G.camera.addTrauma(0.12 * shakeScale());
  }

  think(dt: number) {
    const b = this.body;
    if (this.state === 'down') {
      b.vx = approach(b.vx, 0, 500 * dt);
      this.downT -= dt;
      if (Math.random() < dt * 14) fx.spawn(PK.Mote, this.x + rand(-10, 10), this.y - rand(0, 20), 0, -30, 0.6, 4, 1, HOST.glow);
      if (this.downT <= 0) this.rise();
      return;
    }
    if (this.state === 'rise') {
      b.vx = approach(b.vx, 0, 600 * dt);
      if (this.st >= 0.7) this.setState('move', 'walk', 0.15);
      return;
    }
    if (!this.aggro) {
      const t = this.pickTarget(220);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(520);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    const sp = this.empowered ? 1.25 : 1;
    const s = this.scale;
    switch (this.state) {
      case 'slash': {
        const T0 = (this.combo === 0 ? 0.85 : 0.6) / sp;
        const u = this.st / T0;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.55 && u < 0.7) {
          if (this.st - dt < 0.55 * T0) {
            b.vx = this.face * 130;
            sfx('swingSpear', { pan: G.world.pan(this.x), pitch: 0.85 });
          }
          this.strike(-4, -44 * s, 46 * s, 46 * s, this.empowered ? 1.2 : 1, { poise: 30 });
        }
        if (u >= 1) {
          if (this.combo < (this.elite ? 2 : 1) && dist < 64) {
            this.combo++;
            this.faceTarget();
            this.hitSet.clear();
            this.setState('slash', 'slash', 0.05, 1 / ((0.6) / sp));
          } else {
            this.combo = 0;
            this.attackCd = rand(0.7, 1.2) / sp;
            this.setState('move', 'walk', 0.2);
          }
        }
        break;
      }
      case 'thrust': {
        // A long lunge with the spear: crouch (the tell), then drive.
        const T0 = 0.95 / sp;
        const u = this.st / T0;
        if (u < 0.45) b.vx = approach(b.vx, 0, 900 * dt);
        else if (u < 0.62) {
          if (this.st - dt < 0.45 * T0) {
            sfx('swingSpear', { pan: G.world.pan(this.x), pitch: 0.7 });
            fx.streak(this.x, this.y - 26, this.x + this.face * 80, this.y - 26, HOST.glow, 0.2, 2);
          }
          b.vx = this.face * 330;
          this.strike(0, -36 * s, 46 * s, 22 * s, 1.15, { poise: 40, kx: this.face * 260 });
        } else b.vx = approach(b.vx, 0, 1200 * dt);
        if (u >= 1) {
          this.attackCd = rand(0.9, 1.4) / sp;
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround && Math.abs(t.y - this.y) < 40) {
          if (dist < 56) {
            this.hitSet.clear();
            this.combo = 0;
            this.setState('slash', 'slash', 0.06, 1 / (0.85 / sp));
            break;
          }
          if (dist > 70 && dist < 170 && Math.random() < dt * 2) {
            this.hitSet.clear();
            this.setState('thrust', 'bash', 0.06, 1 / (0.95 / sp));
            break;
          }
        }
        const moving = this.walkToward(t.x, (this.elite ? 66 : 56) * sp, dt, 40);
        const want = moving && Math.abs(b.vx) > 5 ? 'walk' : 'guard';
        if (this.anim!.name !== want) this.anim!.play(want, 0.2);
        this.state = 'move';
      }
    }
  }

  update(dt: number) {
    if (this.empowered && !this.dying && Math.random() < dt * 8) fx.spawn(PK.Ember, this.x + rand(-8, 8), this.y - rand(10, 40), 0, -40, 0.5, 1.4, 0.2, '#ffcf6b', -20, 1);
    super.update(dt);
    const f = this.face;
    this.cape.update(this.x + f * (this.j.shBX - 2), this.y + this.j.shBY, dt, -this.body.vx * 2 - f * 50, 380, 0.88);
  }

  draw(ctx: Ctx) {
    const down = this.state === 'down' && !this.dying;
    if (down) {
      // The ring it kneels in: it closes as the rising nears.
      const u = clamp(1 - this.downT / RISE_T, 0, 1);
      const pulse = 0.6 + Math.sin(G.time * (8 + u * 14)) * 0.3;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 18, 34 + u * 10, HOST.glow, 0.25 + u * 0.35);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = HOST.glow;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 1, 22, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = HOST.hot;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 1, Math.max(1, 22 * (1 - u)), Math.max(0.4, 4 * (1 - u)), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!this.dying || this.awaitingPurify) {
      drawRibbon(ctx, this.cape, 9, 12, this.elite ? '#2a1a36' : '#1e1c26', '#08070c');
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.face * this.scale, this.scale);
      drawHostWings(ctx, this.j.shBX - 1, this.j.shBY + 1, this.state === 'rise' ? 1 : 0.2, this.elite ? '#2e2638' : '#26242e', '#08070c');
      ctx.restore();
    }
    if (this.scale !== 1) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.x, -this.y);
      this.drawHumanoidBody(ctx);
      ctx.restore();
    } else this.drawHumanoidBody(ctx);
    if (this.empowered && !this.dying) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 22, 26, '#ffcf6b', 0.25 + Math.sin(G.time * 6) * 0.08);
      ctx.globalCompositeOperation = 'source-over';
    }
    const tell = (this.state === 'slash' && this.st < 0.5 * (this.combo === 0 ? 0.85 : 0.6)) || (this.state === 'thrust' && this.st < 0.4);
    if (tell) this.glint(ctx, this.x + this.face * 8 * this.scale, this.y - 40 * this.scale, this.state === 'thrust' ? '#ffffff' : HOST.glow);
  }

  drawOverlay(ctx: Ctx) {
    super.drawOverlay(ctx);
    if (this.state === 'down' && !this.dying) {
      // Finish it: the same sigil as a stagger.
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(G.time * 10) * 0.3;
      const y = this.y - this.body.h - 10;
      glow(ctx, this.x, y, 12, '#ffe6a8', 0.7 * p);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    const down = this.state === 'down';
    lighting.add(this.cx, this.cy - 6, down ? 70 : 36, this.awaitingPurify ? '#b04cff' : HOST.glow, down ? 0.8 : 0.35, 0.4);
  }
}

// =====================================================================
// FALLEN GALE
// =====================================================================

export class Gale extends Enemy {
  hoverT = rand(0, 6);
  markX = 0;
  markY = 0;
  boltT = 0;
  evadeCd = 0;
  beat = rand(0, 6);
  jagA = new Float32Array(9);

  constructor(x: number, y: number, elite: string | null) {
    super('gale', x, y, 18, 16, elite);
    this.grav = 0;
    this.collide = false;
    this.attackCd = rand(1, 2.2);
  }

  groan() {
    sfx('galeCrackle', { pan: G.world.pan(this.x), vol: 0.35 });
  }

  physics(dt: number) {
    const b = this.body;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.onGround = false;
    b.x = clamp(b.x, 8, G.world.grid.w * TILE - 8);
    b.y = Math.max(b.y, 24);
    if (this.dying && !this.awaitingPurify) b.vy += 500 * dt;
  }

  flinch(h: HitInfo) {
    this.hurtT = 0.18;
    this.body.vx = h.kx * 0.8;
    this.body.vy = h.ky * 0.4;
    if (this.state === 'charge') this.attackCd = 0.8;
    this.setState('hover');
  }

  stagger() {
    super.stagger();
    this.body.vy = 40;
  }

  think(dt: number) {
    const b = this.body;
    this.hoverT += dt;
    this.evadeCd -= dt;
    this.boltT = Math.max(0, this.boltT - dt);
    if (!this.aggro) {
      const t = this.pickTarget(260);
      if (t) this.aggro = true;
      b.vx = approach(b.vx, Math.sin(this.hoverT + this.id) * 14, 80 * dt);
      b.vy = approach(b.vy, Math.sin(this.hoverT * 1.7 + this.id) * 10, 80 * dt);
      return;
    }
    this.target = this.pickTarget(600);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const p = G.world.player;
    if (this.evadeCd <= 0 && this.state !== 'charge' && t === p && p.state === 'attack' && Math.abs(p.x - this.x) < 60 && Math.abs(p.y - 20 - this.y) < 60) {
      this.evadeCd = 1.5;
      b.vx = (sign(this.x - p.x) || 1) * 260;
      b.vy = -180;
      this.setState('hover');
      return;
    }
    if (this.state === 'charge') {
      // The tell: it flashes, and a mark burns on the ground where the bolt will fall.
      b.vx = approach(b.vx, 0, 300 * dt);
      b.vy = approach(b.vy, 0, 300 * dt);
      if (this.st < 0.45) {
        this.markX = approach(this.markX, t.x, 220 * dt);
        this.markY = floorBelow(this.markX, t.y - 30);
      }
      if (this.st >= 0.85) {
        jag(this.jagA, 6);
        this.boltT = 0.25;
        this.hitSet.clear();
        G.world.hitPlayerSide({ x: this.markX - 12, y: this.markY - 70, w: 24, h: 70 }, {
          dmg: this.dmg, poise: 30, kx: sign(p.x - this.markX) * 140, ky: -200, dir: sign(p.x - this.markX) || 1, kind: 'proj', parryable: false, unblockable: true, src: this,
        }, this.hitSet);
        sfx('galeBolt', { pan: G.world.pan(this.markX) });
        sfx('thunder', { pan: G.world.pan(this.markX), vol: 0.4, pitch: 1.4 });
        fx.ring(this.markX, this.markY - 2, 4, 36, BOLT.c, 0.3, 3, 0.3);
        fx.hitSparks(this.markX, this.markY - 4, 0, BOLT.hot, 10, 1);
        G.camera.addTrauma(0.1 * shakeScale());
        this.attackCd = rand(2, 3);
        this.setState('hover');
      }
      return;
    }
    const side = this.id % 2 ? 1 : -1;
    const hx = t.x + side * 70 + Math.sin(this.hoverT * 1.1) * 40;
    const hy = t.y - 110 + Math.sin(this.hoverT * 2.2) * 14;
    b.vx = approach(b.vx, clamp((hx - this.x) * 2, -150, 150), 380 * dt);
    b.vy = approach(b.vy, clamp((hy - this.y) * 2, -150, 150), 380 * dt);
    this.faceTarget();
    this.state = 'hover';
    if (this.attackCd <= 0 && Math.abs(t.x - this.x) < 220) {
      this.setState('charge');
      this.markX = t.x;
      this.markY = floorBelow(t.x, t.y - 30);
      sfx('galeCrackle', { pan: G.world.pan(this.x), vol: 0.6, pitch: 1.3 });
    }
  }

  update(dt: number) {
    super.update(dt);
    this.beat += dt * (this.state === 'charge' ? 30 : 14);
  }

  draw(ctx: Ctx) {
    const t = G.time + this.id;
    const a = this.dying && !this.awaitingPurify ? clamp(1 - this.deathT / 0.8, 0, 1) : 1;
    if (a <= 0.02) return;
    // The mark and the bolt.
    if (this.state === 'charge' && !this.dying) {
      const u = clamp(this.st / 0.85, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + u * 0.5;
      ellipse(ctx, this.markX, this.markY - 1, 14, 3, 0, BOLT.c);
      ctx.globalAlpha = 0.5 + Math.sin(G.time * 30) * 0.3;
      ctx.strokeStyle = BOLT.hot;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(this.markX, this.markY - 1, Math.max(1, 14 * (1 - u)), Math.max(0.4, 3 * (1 - u)), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.boltT > 0) drawBolt(ctx, this.x, this.y, this.markX, this.markY, this.jagA, this.boltT / 0.25);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.scale(this.face, 1);
    // Storm-dark wings beating.
    const flap = Math.sin(this.beat);
    for (const s of [-1, 1]) {
      const ang = -1.2 + s * 0.15 + flap * 0.6 * (s > 0 ? 1 : 0.8);
      ctx.save();
      ctx.rotate(ang);
      poly(ctx, [0, 0, -14, -3, -18, 1, -13, 3, -16, 6, -9, 5, -10, 8, 0, 3], s > 0 ? '#3a4458' : '#262c3a', '#0a0c12', 0.6);
      ctx.restore();
    }
    // A knot of cloud with a burning eye.
    glow(ctx, 0, 0, 13, '#2a3040', 0.95);
    glow(ctx, -3, 2, 9, '#3a4458', 0.8);
    ctx.globalCompositeOperation = 'lighter';
    const charge = this.state === 'charge' ? clamp(this.st / 0.85, 0, 1) : 0;
    glow(ctx, 2, -1, 6 + charge * 12, BOLT.c, 0.6 + charge * 0.4);
    glow(ctx, 2.6, -1.2, 2.4, BOLT.hot, 0.95);
    // Crackle around it.
    if (charge > 0.2 || Math.sin(t * 7) > 0.85) {
      ctx.strokeStyle = BOLT.c;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = t * 9 + i * 2.1;
        ctx.moveTo(Math.cos(ang) * 6, Math.sin(ang) * 6);
        ctx.lineTo(Math.cos(ang + 0.4) * 11, Math.sin(ang + 0.4) * 11);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.state === 'charge' && this.st > 0.3) this.glint(ctx, this.x, this.y, BOLT.c);
    this.drawFlash(ctx);
  }

  hurtbox() {
    return { x: this.x - 11, y: this.y - 11, w: 22, h: 22 };
  }
  get cy() {
    return this.y;
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x, this.y, 50 + (this.state === 'charge' ? 50 : 0), BOLT.c, 0.6, 0.6);
    if (this.boltT > 0) lighting.add(this.markX, this.markY - 30, 140, BOLT.c, this.boltT * 4, 0.9);
  }
}
