// Particles, slash arcs, shockwave rings, damage numbers and screen flashes.
// Everything is pooled and capped by the quality tier.

import { rand, TAU, clamp } from '../core/math';
import { glow, rgba, FONT_DISPLAY, type Ctx } from './draw';
import { settings } from '../core/settings';

export const enum PK {
  Spark, Ember, Smoke, Dust, Shard, Mote, Flame, Drop, Rune, Petal,
}

interface Particle {
  on: boolean;
  k: PK;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  s0: number; s1: number;
  c: string;
  g: number; drag: number;
  rot: number; vr: number;
  a: number;
}

interface Arc {
  x: number; y: number; r: number; a0: number; a1: number; w: number;
  life: number; max: number; c: string; c2: string; face: number; tilt: number;
}
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; c: string; w: number; flat: number }
interface Num { x: number; y: number; vy: number; text: string; life: number; max: number; c: string; size: number }
interface Column { x: number; y: number; w: number; h: number; life: number; max: number; c: string }

export class FX {
  ps: Particle[] = [];
  arcs: Arc[] = [];
  rings: Ring[] = [];
  nums: Num[] = [];
  cols: Column[] = [];
  flashA = 0;
  flashC = '#ffffff';
  tint = 0;
  tintC = '#000000';
  cap = 900;
  private free: Particle[] = [];

  setTier(t: number) {
    this.cap = t === 2 ? 900 : t === 1 ? 520 : 260;
  }

  clear() {
    for (const p of this.ps) { p.on = false; this.free.push(p); }
    this.ps.length = 0;
    this.arcs.length = 0;
    this.rings.length = 0;
    this.nums.length = 0;
    this.cols.length = 0;
    this.flashA = 0;
  }

  spawn(k: PK, x: number, y: number, vx: number, vy: number, life: number, s0: number, s1: number, c: string, g = 0, drag = 0): Particle | null {
    if (this.ps.length >= this.cap) return null;
    const p = this.free.pop() ?? ({} as Particle);
    p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.c = c; p.g = g; p.drag = drag;
    p.rot = rand(0, TAU); p.vr = rand(-8, 8); p.a = 1;
    this.ps.push(p);
    return p;
  }

  // ----- Composite effects -----

  hitSparks(x: number, y: number, dir: number, color = '#ffe6a8', n = 10, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + rand(-0.9, 0.9);
      const sp = rand(120, 360) * power;
      this.spawn(PK.Spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40, rand(0.12, 0.3), rand(1.2, 2.2), 0.3, color, 500, 4);
    }
    this.spawn(PK.Mote, x, y, 0, 0, 0.14, 18 * power, 4, color);
  }

  veilBurst(x: number, y: number, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(30, 140) * power;
      this.spawn(PK.Smoke, x + rand(-4, 4), y + rand(-4, 4), Math.cos(a) * sp, Math.sin(a) * sp - 20, rand(0.5, 1.1), rand(3, 6), rand(10, 18), '#2a1636', -30, 2.5);
    }
    for (let i = 0; i < n / 2; i++) {
      const a = rand(0, TAU), sp = rand(40, 160) * power;
      this.spawn(PK.Drop, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, rand(0.4, 0.8), rand(1.2, 2.4), 0.5, '#a24bd6', 600, 1);
    }
  }

  dust(x: number, y: number, n = 6, spread = 1, color = '#8a7f74') {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.spawn(PK.Dust, x + rand(-3, 3), y - rand(0, 2), dir * rand(20, 80) * spread, rand(-30, -5), rand(0.35, 0.7), rand(2, 4), rand(7, 12), color, -10, 3);
    }
  }

  embers(x: number, y: number, n: number, color = '#ffb35c', spread = 8) {
    for (let i = 0; i < n; i++) {
      this.spawn(PK.Ember, x + rand(-spread, spread), y + rand(-spread, spread), rand(-30, 30), rand(-90, -20), rand(0.6, 1.4), rand(0.8, 1.8), 0.2, color, -20, 0.5);
    }
  }

  holyBurst(x: number, y: number, n = 18, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, 220) * power;
      this.spawn(PK.Spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.2, 0.45), rand(1.2, 2.4), 0.3, i % 3 ? '#ffe7a3' : '#ffffff', 80, 3);
    }
    for (let i = 0; i < n / 2; i++) {
      this.spawn(PK.Flame, x + rand(-8, 8), y + rand(-8, 8), rand(-20, 20), rand(-80, -30), rand(0.4, 0.9), rand(4, 8), 0.5, '#fff3d0', -40, 1);
    }
  }

  shards(x: number, y: number, n: number, color: string, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), sp = rand(80, 260) * power;
      this.spawn(PK.Shard, x + rand(-6, 6), y + rand(-6, 6), Math.cos(a) * sp, Math.sin(a) * sp, rand(0.6, 1.3), rand(2, 4.5), rand(1, 3), color, 900, 0.5);
    }
  }

  slash(x: number, y: number, r: number, a0: number, a1: number, w: number, face: number, c = '#fff1c4', c2 = '#ffb347', life = 0.16, tilt = 0) {
    this.arcs.push({ x, y, r, a0, a1, w, life, max: life, c, c2, face, tilt });
  }

  ring(x: number, y: number, r0: number, r1: number, c: string, life = 0.4, w = 3, flat = 1) {
    this.rings.push({ x, y, r0, r1, life, max: life, c, w, flat });
  }

  column(x: number, y: number, w: number, h: number, c: string, life = 0.8) {
    this.cols.push({ x, y, w, h, life, max: life, c });
  }

  number(x: number, y: number, value: number | string, crit = false, color?: string) {
    if (!settings.dmgNumbers && typeof value === 'number') return;
    const text = typeof value === 'number' ? String(Math.round(value)) : value;
    this.nums.push({
      x: x + rand(-5, 5), y, vy: -70, text, life: crit ? 0.95 : 0.75, max: crit ? 0.95 : 0.75,
      c: color ?? (crit ? '#ffd76a' : '#f4ecdf'), size: crit ? 13 : 9.5,
    });
  }

  flash(color: string, a: number) {
    const lim = settings.reduceFlashes ? 0.18 : 1;
    this.flashC = color;
    this.flashA = Math.max(this.flashA, Math.min(a, lim));
  }

  update(dt: number) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        ps[i] = ps[ps.length - 1];
        ps.pop();
        this.free.push(p);
        continue;
      }
      if (p.drag) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f; p.vy *= f;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) if ((this.arcs[i].life -= dt) <= 0) this.arcs.splice(i, 1);
    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i].life -= dt) <= 0) this.rings.splice(i, 1);
    for (let i = this.cols.length - 1; i >= 0; i--) if ((this.cols[i].life -= dt) <= 0) this.cols.splice(i, 1);
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 1 - 3 * dt;
      if (n.life <= 0) this.nums.splice(i, 1);
    }
    this.flashA = Math.max(0, this.flashA - dt * 3.2);
  }

  /** Normal-blend particles (smoke, dust, shards). */
  drawBack(ctx: Ctx) {
    for (const p of this.ps) {
      const t = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * t;
      if (p.k === PK.Smoke || p.k === PK.Dust) {
        ctx.globalAlpha = (1 - t) * (p.k === PK.Smoke ? 0.55 : 0.4);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.fill();
      } else if (p.k === PK.Shard) {
        ctx.globalAlpha = Math.min(1, p.life / p.max * 2.5);
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.4);
        ctx.lineTo(s * 0.6, -s * 0.7);
        ctx.lineTo(s, s * 0.5);
        ctx.lineTo(-s * 0.4, s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.k === PK.Petal) {
        ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Additive particles and effects. Caller sets 'lighter'. */
  drawAdd(ctx: Ctx) {
    for (const p of this.ps) {
      const t = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * t;
      switch (p.k) {
        case PK.Spark: {
          ctx.globalAlpha = 1 - t * 0.7;
          ctx.strokeStyle = p.c;
          ctx.lineWidth = s;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        }
        case PK.Ember: {
          const fl = 0.6 + 0.4 * Math.sin(p.life * 30 + p.rot * 5);
          glow(ctx, p.x, p.y, s * 4, p.c, (1 - t) * fl * 0.9);
          ctx.globalAlpha = (1 - t) * fl;
          ctx.fillStyle = '#fff5d8';
          ctx.fillRect(p.x - s * 0.4, p.y - s * 0.4, s * 0.8, s * 0.8);
          break;
        }
        case PK.Mote:
          glow(ctx, p.x, p.y, s, p.c, 1 - t);
          break;
        case PK.Flame:
          glow(ctx, p.x, p.y, s * 1.6, p.c, (1 - t) * 0.8, 1.5);
          break;
        case PK.Drop:
          glow(ctx, p.x, p.y, s * 3, p.c, (1 - t) * 0.8);
          break;
        case PK.Rune: {
          ctx.globalAlpha = Math.sin(t * Math.PI);
          ctx.strokeStyle = p.c;
          ctx.lineWidth = 0.8;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * 0.2);
          ctx.beginPath();
          ctx.moveTo(-s, 0); ctx.lineTo(0, -s); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s);
          ctx.stroke();
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    // Slash arcs — crescent with a hot core.
    for (const a of this.arcs) {
      const t = 1 - a.life / a.max;
      const alpha = 1 - t * t;
      ctx.save();
      ctx.translate(a.x, a.y);
      if (a.face < 0) ctx.scale(-1, 1);
      ctx.rotate(a.tilt);
      const r = a.r * (1 + t * 0.12);
      const w = a.w * 1.35 * (1 - t * 0.45);
      const a0 = a.a0, a1 = a.a0 + (a.a1 - a.a0) * Math.min(1, 0.55 + t * 1.2);
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = a.c2;
      crescent(ctx, r + w * 0.25, w * 1.5, a0, a1);
      ctx.globalAlpha = alpha * 0.9;
      crescent(ctx, r, w, a0, a1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = a.c;
      crescent(ctx, r - w * 0.12, w * 0.5, a0 + (a1 - a0) * 0.1, a1);
      ctx.restore();
    }
    // Rings.
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 3));
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.c;
      ctx.lineWidth = r.w * (1 - t * 0.6);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * r.flat, 0, 0, TAU);
      ctx.stroke();
    }
    // Light columns.
    for (const c of this.cols) {
      const t = 1 - c.life / c.max;
      const a = Math.sin(clamp(t, 0, 1) * Math.PI);
      const w = c.w * (0.4 + 0.6 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5));
      const g = ctx.createLinearGradient(c.x - w / 2, 0, c.x + w / 2, 0);
      g.addColorStop(0, rgba(c.c, 0));
      g.addColorStop(0.35, rgba(c.c, 0.5 * a));
      g.addColorStop(0.5, rgba('#ffffff', 0.9 * a));
      g.addColorStop(0.65, rgba(c.c, 0.5 * a));
      g.addColorStop(1, rgba(c.c, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(c.x - w / 2, c.y - c.h, w, c.h);
      glow(ctx, c.x, c.y, w * 1.8, c.c, a * 0.8);
    }
    ctx.globalAlpha = 1;
  }

  drawNumbers(ctx: Ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.nums) {
      const t = 1 - n.life / n.max;
      const pop = t < 0.15 ? 1 + (0.15 - t) * 4 : 1;
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = `700 ${(n.size * pop).toFixed(1)}px ${FONT_DISPLAY}`;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,6,14,0.9)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.c;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }
}

function crescent(ctx: Ctx, r: number, w: number, a0: number, a1: number) {
  // Outer arc forward, inner arc (offset centre) back: thick in the middle, sharp ends.
  ctx.beginPath();
  ctx.arc(0, 0, r, a0, a1, a1 < a0);
  const mid = (a0 + a1) / 2;
  const ox = Math.cos(mid) * w, oy = Math.sin(mid) * w;
  ctx.arc(-ox * 0.6, -oy * 0.6, r - w * 0.4, a1, a0, a1 >= a0);
  ctx.closePath();
  ctx.fill();
}

export const fx = new FX();
