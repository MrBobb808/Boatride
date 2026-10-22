// Particles, slash arcs, shockwave rings, damage numbers and screen flashes.
// Everything is pooled and capped by the quality tier.

import { rand, TAU, clamp } from '../core/math';
import { glow, glowSprite, rgba, FONT_DISPLAY, type Ctx } from './draw';
import { settings } from '../core/settings';

export const enum PK {
  Spark, Ember, Smoke, Dust, Shard, Mote, Flame, Drop, Rune, Petal, Flare,
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

/**
 * How much each kind reads on screen: impact stars and flames carry the hit, a wisp of
 * dust barely shows. Bursts and a full pool give way to the faintest first.
 */
const WEIGHT = [1, 1.2, 1, 0.6, 2, 1, 2, 1, 2, 0.6, 3];
/** Accents at or above this weight still spawn once a frame's burst budget is spent. */
const BOLD = 2;

interface Arc {
  x: number; y: number; r: number; a0: number; a1: number; w: number;
  life: number; max: number; c: string; c2: string; face: number; tilt: number;
}
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; c: string; w: number; flat: number }
interface Num { x: number; y: number; vy: number; text: string; life: number; max: number; c: string; size: number; priority: boolean }
interface Column { x: number; y: number; w: number; h: number; life: number; max: number; c: string }
interface Streak { x0: number; y0: number; x1: number; y1: number; life: number; max: number; c: string; w: number }

export class FX {
  ps: Particle[] = [];
  arcs: Arc[] = [];
  rings: Ring[] = [];
  nums: Num[] = [];
  cols: Column[] = [];
  streaks: Streak[] = [];
  flashA = 0;
  flashC = '#ffffff';
  tint = 0;
  tintC = '#000000';
  cap = 900;
  numberCap = 32;
  /** New particles allowed per drawn frame before only bold accents get through (mass deaths, big finishers). */
  frameCap = 240;
  /** Particles spawned since the last drawn frame, and the most in any one frame (debug API). */
  spawned = 0;
  peakSpawned = 0;
  private free: Particle[] = [];
  private tierCap = 900;
  private density = 1;
  private scan = 0;
  private numFont = new Map<number, string>();

  setTier(t: number) {
    this.tierCap = t === 2 ? 900 : t === 1 ? 520 : 260;
    this.applyCaps();
    this.numberCap = t === 2 ? 32 : t === 1 ? 24 : 16;
    while (this.nums.length > this.numberCap) {
      const drop = this.nums.findIndex(n => !n.priority);
      this.nums.splice(drop < 0 ? 0 : drop, 1);
    }
  }

  /** Auto quality's first rung under sustained load: fewer particles, same effects. */
  setDensity(d: number) {
    this.density = d;
    this.applyCaps();
  }

  private applyCaps() {
    this.cap = Math.round(this.tierCap * this.density);
    this.frameCap = Math.round(this.tierCap * 0.27 * this.density);
  }

  /** The live particle a newcomer may replace: the faintest of a few, checked round-robin (no full scan). */
  private faintest(): number {
    const ps = this.ps, n = ps.length;
    let best = -1, bestV = Infinity;
    for (let j = 0; j < 8; j++) {
      const i = (this.scan + j) % n;
      const p = ps[i];
      const v = WEIGHT[p.k] * (p.life / p.max);
      if (v < bestV) { bestV = v; best = i; }
    }
    this.scan = (this.scan + 8) % n;
    return best;
  }

  clear() {
    for (const p of this.ps) { p.on = false; this.free.push(p); }
    this.ps.length = 0;
    this.arcs.length = 0;
    this.rings.length = 0;
    this.nums.length = 0;
    this.cols.length = 0;
    this.streaks.length = 0;
    this.flashA = 0;
  }

  spawn(k: PK, x: number, y: number, vx: number, vy: number, life: number, s0: number, s1: number, c: string, g = 0, drag = 0): Particle | null {
    const w = WEIGHT[k];
    // A burst past this frame's budget keeps only its bold accents, and those within reason.
    if (this.spawned >= this.frameCap && (w < BOLD || this.spawned >= this.frameCap * 1.5)) return null;
    let p: Particle;
    if (this.ps.length >= this.cap) {
      // Full pool: reuse the faintest live particle in place, if the newcomer outshines it.
      const i = this.faintest();
      const old = this.ps[i];
      if (WEIGHT[old.k] * (old.life / old.max) >= w) return null;
      p = old;
    } else {
      p = this.free.pop() ?? ({} as Particle);
      this.ps.push(p);
    }
    this.spawned++;
    p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.c = c; p.g = g; p.drag = drag;
    p.rot = rand(0, TAU); p.vr = rand(-8, 8); p.a = 1;
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
    const f = this.spawn(PK.Flare, x, y, 0, 0, 0.12 + power * 0.03, 16 * power, 26 * power, color);
    if (f) { f.rot = rand(-0.4, 0.4); f.vr = 0; }
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

  /** A bright line that thins and fades: blink paths and lightning-quick dashes. */
  streak(x0: number, y0: number, x1: number, y1: number, c = '#ffe6a8', life = 0.22, w = 3) {
    this.streaks.push({ x0, y0, x1, y1, life, max: life, c, w });
  }

  column(x: number, y: number, w: number, h: number, c: string, life = 0.8) {
    this.cols.push({ x, y, w, h, life, max: life, c });
  }

  number(x: number, y: number, value: number | string, crit = false, color?: string) {
    if (!settings.dmgNumbers && typeof value === 'number') return;
    const text = typeof value === 'number' ? String(Math.round(value)) : value;
    const priority = typeof value === 'string' || color === '#ff8a8a';
    // Preserve incoming damage and status notices when the squad fills the screen.
    if (this.nums.length >= this.numberCap) {
      const drop = this.nums.findIndex(n => !n.priority);
      if (drop < 0 && !priority) return;
      this.nums.splice(drop < 0 ? 0 : drop, 1);
    }
    this.nums.push({
      x: x + rand(-5, 5), y, vy: -70, text, life: crit ? 0.95 : 0.75, max: crit ? 0.95 : 0.75,
      c: color ?? (crit ? '#ffd76a' : '#f4ecdf'), size: crit ? 13 : 9.5, priority,
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
    for (let i = this.streaks.length - 1; i >= 0; i--) if ((this.streaks[i].life -= dt) <= 0) this.streaks.splice(i, 1);
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 1 - 3 * dt;
      if (n.life <= 0) this.nums.splice(i, 1);
    }
    this.flashA = Math.max(0, this.flashA - dt * 3.2);
  }

  /** Normal-blend particles (smoke, dust, shards). Drawn once per frame, so it also opens the next frame's burst budget. */
  drawBack(ctx: Ctx) {
    if (this.spawned > this.peakSpawned) this.peakSpawned = this.spawned;
    this.spawned = 0;
    for (const p of this.ps) {
      const t = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * t;
      if (p.k === PK.Smoke || p.k === PK.Dust) {
        // Soft-edged puff that swells and thins out.
        const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        glow(ctx, p.x, p.y, s * 1.7, p.c, fade * (p.k === PK.Smoke ? 0.85 : 0.6), 0.9);
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
        case PK.Flare: {
          // Four-point impact star: two stretched glows crossing.
          const k = 1 - t;
          const spr = glowSprite(p.c, 64, 1.6);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = k;
          ctx.drawImage(spr, -s, -s * 0.09, s * 2, s * 0.18);
          ctx.drawImage(spr, -s * 0.07, -s * 0.55, s * 0.14, s * 1.1);
          ctx.globalAlpha = k * 0.9;
          const w = glowSprite('#ffffff', 64, 1.6);
          ctx.drawImage(w, -s * 0.5, -s * 0.05, s, s * 0.1);
          ctx.drawImage(w, -s * 0.18, -s * 0.18, s * 0.36, s * 0.36);
          ctx.restore();
          break;
        }
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
    // Slash smears: a crescent that fades from a transparent tail to a hot
    // leading edge, with a bright rim where the blade's edge passed.
    for (const a of this.arcs) {
      const t = 1 - a.life / a.max;
      const alpha = 1 - t * t;
      ctx.save();
      ctx.translate(a.x, a.y);
      if (a.face < 0) ctx.scale(-1, 1);
      ctx.rotate(a.tilt);
      const r = a.r * (1 + t * 0.12);
      const w = a.w * 1.2 * (1 - t * 0.5);
      const a0 = a.a0 + (a.a1 - a.a0) * Math.min(0.6, t * 0.9);
      const a1 = a.a0 + (a.a1 - a.a0) * Math.min(1, 0.55 + t * 1.2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = smearFill(ctx, a0, a1, a.c2, 0.45);
      crescent(ctx, r + w * 0.3, w * 1.7, a0, a1);
      ctx.fillStyle = smearFill(ctx, a0, a1, a.c, 0.95);
      crescent(ctx, r, w, a0, a1);
      ctx.fillStyle = smearFill(ctx, a0 + (a1 - a0) * 0.3, a1, '#ffffff', 1);
      crescent(ctx, r + w * 0.05, w * 0.32, a0 + (a1 - a0) * 0.3, a1);
      // Hot spot where the edge is now.
      const tr = r - w * 0.35;
      glow(ctx, Math.cos(a1) * tr, Math.sin(a1) * tr, w * 2.4, a.c2, alpha * 0.55);
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
    // Streaks: a wide haze and a hot core, both tapering toward the start point.
    ctx.lineCap = 'round';
    for (const st of this.streaks) {
      const t = 1 - st.life / st.max;
      const a = 1 - t;
      const sx = st.x0 + (st.x1 - st.x0) * Math.min(0.85, t * 1.6), sy = st.y0 + (st.y1 - st.y0) * Math.min(0.85, t * 1.6);
      const g = ctx.createLinearGradient(sx, sy, st.x1, st.y1);
      g.addColorStop(0, rgba(st.c, 0));
      g.addColorStop(1, rgba(st.c, 0.55 * a));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = st.w * 2.4 * (1 - t * 0.5);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(st.x1, st.y1);
      ctx.stroke();
      const g2 = ctx.createLinearGradient(sx, sy, st.x1, st.y1);
      g2.addColorStop(0, 'rgba(255,255,255,0)');
      g2.addColorStop(1, rgba('#ffffff', 0.95 * a));
      ctx.strokeStyle = g2;
      ctx.lineWidth = st.w * 0.6 * (1 - t * 0.6);
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

  /** Font strings per tenth of a pixel, built once instead of every number every frame. */
  private font(size: number) {
    const k = Math.round(size * 10);
    let f = this.numFont.get(k);
    if (!f) {
      f = `700 ${(k / 10).toFixed(1)}px ${FONT_DISPLAY}`;
      this.numFont.set(k, f);
    }
    return f;
  }

  drawNumbers(ctx: Ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.nums) {
      const t = 1 - n.life / n.max;
      const pop = t < 0.15 ? 1 + (0.15 - t) * 4 : 1;
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = this.font(n.size * pop);
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

const hasConic = typeof CanvasRenderingContext2D !== 'undefined' && 'createConicGradient' in CanvasRenderingContext2D.prototype;

/** Angular fade along an arc from a0 (transparent) to a1 (full). Flat colour where conic gradients are missing. */
function smearFill(ctx: Ctx, a0: number, a1: number, c: string, peak: number): string | CanvasGradient {
  if (!hasConic) return rgba(c, peak * 0.7);
  const span = Math.min(TAU - 0.01, Math.abs(a1 - a0));
  const f = span / TAU;
  const fwd = a1 >= a0;
  const g = ctx.createConicGradient(fwd ? a0 : a1, 0, 0);
  if (fwd) {
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(f * 0.55, rgba(c, peak * 0.35));
    g.addColorStop(f * 0.92, rgba(c, peak));
    g.addColorStop(f, rgba(c, peak));
    g.addColorStop(Math.min(1, f + 0.002), rgba(c, 0));
  } else {
    g.addColorStop(0, rgba(c, peak));
    g.addColorStop(f * 0.08, rgba(c, peak));
    g.addColorStop(f * 0.45, rgba(c, peak * 0.35));
    g.addColorStop(f, rgba(c, 0));
  }
  return g;
}

/** Smear shape: hair-thin at the tail (a0), swelling to its widest just behind a pointed leading edge (a1). */
function crescent(ctx: Ctx, r: number, w: number, a0: number, a1: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, a0, a1, a1 < a0);
  const N = 12;
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    const ang = a0 + (a1 - a0) * u;
    const th = w * Math.pow(u, 0.7) * (1 - Math.pow(u, 7) * 0.8);
    const rr = r - th;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export const fx = new FX();
