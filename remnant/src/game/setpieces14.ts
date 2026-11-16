// Chapter XIV's set pieces, each an entity the story drops into a room (game/story14.ts):
//
// - RidersWall: the flight to the cave of refuge. The host's horsemen sweep along the road behind Elior in a wall of
//   dust, a little slower than he can run: stop, or be slow at a wall or a pit, and they are on him.
// - Aftershocks: the great shaking has not stopped. Every so often the ground trembles, dust marks the places, and
//   stones come down on them a beat later (Ezekiel 38:20: the steep places shall fall).
// - Feud: "every man's sword shall be against his brother" (38:21). Pairs of the host stand and strike one another
//   until Elior comes near; each pair is hurt by the other until then.

import { Entity } from './entity';
import { Enemy } from './enemies';
import { G } from './ctx';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { poly, ellipse, circle, glow, type Ctx } from '../render/draw';
import { rand, clamp } from '../core/math';
import { Proj } from './projectiles';
import { chapterCurve } from './curve';
import { ENEMY_STATS } from './enemies';
import type { Rect } from '../core/math';

const TILE = 16;

// ---------------------------------------------------------------- the riders' wall

export class RidersWall extends Entity {
  t = 0;
  speed: number;
  /** Where they pull up (the cave mouth). */
  stopX: number;
  private hitSet = new Set<number>();
  private hitT = 0;
  private hoofT = 0;
  private riders: { dx: number; ph: number; s: number }[] = [];
  /** For tests: the blows the wall has landed. */
  struck = 0;
  halted = false;
  private haltT = 0;

  constructor(x: number, floorY: number, speed: number, stopX: number) {
    super(x, floorY, 150, 140);
    this.speed = speed;
    this.stopX = stopX;
    this.team = 'enemy';
    this.layer = 8;
    for (let i = 0; i < 9; i++) this.riders.push({ dx: -i * 17 + rand(-6, 6), ph: rand(0, 6), s: 0.8 + rand(0, 0.3) });
  }

  /** Not a target: it cannot be struck, only outrun. */
  hurtbox(): Rect { return { x: this.x, y: this.y, w: 0, h: 0 }; }

  /** How far ahead of the wall Elior is, in pixels. */
  gap() { return G.world.player.x - this.x; }

  update(dt: number) {
    this.t += dt;
    const W = G.world, p = W.player;
    if (this.halted) {
      this.haltT += dt;
      if (this.haltT > 2.5) this.remove = true;
      return;
    }
    // A little faster the farther it goes.
    this.x += (this.speed + Math.min(14, this.t * 1.2)) * dt;
    if (this.x >= this.stopX) { this.halted = true; sfx('horn', { pan: W.pan(this.x), vol: 0.6 }); return; }
    this.hoofT -= dt;
    if (this.hoofT <= 0) {
      this.hoofT = 0.16;
      sfx('step', { pan: W.pan(this.x), vol: 0.5, pitch: 0.45, gap: 60 });
      G.camera.addTrauma(0.03 * shakeScale());
    }
    this.hitT += dt;
    if (this.hitT > 1.1) { this.hitSet.clear(); this.hitT = 0; }
    // The wall's face: whoever is in it is struck and thrown ahead of it.
    const dmg = ENEMY_STATS.knight.dmg * chapterCurve(14).foeDmg * 1.1;
    if (W.hitPlayerSide({ x: this.x - 56, y: this.y - 120, w: 100, h: 120 }, { dmg, poise: 70, kx: 540, ky: -220, dir: 1, kind: 'proj', src: this, unblockable: true, parryable: false }, this.hitSet)) {
      this.struck++;
      sfx('hitHeavy', { pan: W.pan(this.x), vol: 0.8, pitch: 0.7 });
    }
    // Dust rolls up in front of them and trails behind.
    if (Math.random() < dt * 40) fx.spawn(PK.Dust, this.x + rand(-10, 50), this.y - rand(0, 70), rand(40, 120), rand(-30, 10), 0.8, 7, 14, '#8a7258', 0, 2);
    void p;
  }

  draw(ctx: Ctx) {
    const x = this.x, y = this.y, t = this.t, a = this.halted ? Math.max(0, 1 - this.haltT / 2.5) : 1;
    ctx.globalAlpha = a;
    // The cloud: a bank of dust the height of a horse and rider, brown-black in the back and lit from the south.
    for (let i = 0; i < 7; i++) {
      const ox = Math.sin(t * 1.6 + i * 1.3) * 14 - i * 12, oy = -20 - i * 14 + Math.cos(t * 1.1 + i) * 5;
      ellipse(ctx, x + ox - 20, y + oy, 54 - i * 3, 22 + (i % 3) * 6, 0, i % 2 ? '#2a2018' : '#3a2c20');
    }
    // The riders, dark against the dust: horse and lancer in a gallop.
    for (const r of this.riders) {
      const gx = x + r.dx + 8, g = t * (this.halted ? 2 : 11) + r.ph, s = r.s, bob = Math.abs(Math.sin(g)) * 2;
      ctx.save();
      ctx.translate(gx, y - bob);
      ctx.scale(s, s);
      for (const [lx, ph] of [[-14, 0], [-8, 1.6], [9, 3.2], [15, 4.8]] as const) {
        const sw = Math.sin(g + ph) * 7;
        poly(ctx, [lx - 2, -16, lx + 2, -16, lx + 2 + sw, -1, lx - 2 + sw, -1], '#0e0a0c');
      }
      ellipse(ctx, 0, -22, 20, 8, 0, '#0e0a0c');
      poly(ctx, [12, -26, 22, -40, 28, -38, 20, -22], '#0e0a0c');
      ellipse(ctx, 28, -38, 7, 3.5, -0.5, '#0e0a0c');
      poly(ctx, [-4, -30, 6, -30, 4, -52, -2, -52], '#0e0a0c');
      circle(ctx, 1, -55, 4.5, '#0e0a0c');
      ctx.strokeStyle = '#0e0a0c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(2, -42); ctx.lineTo(46, -36);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // A torch or two burning in the dust.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x - 28, y - 56, 36, '#ff7a3a', 0.28 * a);
    glow(ctx, x - 70, y - 48, 30, '#ff7a3a', 0.22 * a);
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    lighting.add(this.x - 30, this.y - 50, 170, '#ff7a3a', 0.55, 0.4);
  }
}

// ---------------------------------------------------------------- the aftershocks

export class Aftershocks extends Entity {
  private timer: number;
  private pending: { x: number; t: number }[] = [];
  /** For tests: the tremors that have come, and the stones sent down. */
  tremors = 0;
  stones = 0;

  constructor(first = 7) {
    super(0, 0, 1, 1);
    this.timer = first;
    this.layer = 1;
  }

  hurtbox(): Rect { return { x: 0, y: 0, w: 0, h: 0 }; }

  /** Gather what a tremor drops: stones near where Elior stands, marked by dust a beat before. */
  shake() {
    const W = G.world, p = W.player, wpx = W.grid.w * TILE;
    this.tremors++;
    sfx('stoneCrack', { vol: 0.8 });
    sfx('bossSlam', { vol: 0.5, pitch: 0.5 });
    G.camera.addTrauma(0.35 * shakeScale());
    const n = 3 + (this.tremors > 3 ? 1 : 0);
    const spots = [p.x + rand(-30, 30)];
    for (let i = 1; i < n; i++) spots.push(p.x + (i % 2 ? 1 : -1) * (70 + i * 55) + rand(-20, 20));
    for (const x of spots) this.pending.push({ x: clamp(x, 40, wpx - 40), t: 0.9 });
  }

  update(dt: number) {
    if (G.inCutscene || G.world.bossActive) return;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = rand(8, 12); this.shake(); }
    const W = G.world, p = W.player;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const s = this.pending[i];
      s.t -= dt;
      // The warning: dust shaken loose along the ground where the stone will land.
      if (Math.random() < dt * 30) fx.spawn(PK.Dust, s.x + rand(-14, 14), p.y - 2, rand(-10, 10), rand(-60, -20), 0.5, 4, 8, '#8a7a66', 0, 2);
      if (s.t <= 0) {
        this.pending.splice(i, 1);
        this.stones++;
        const dmg = ENEMY_STATS.knight.dmg * chapterCurve(14).foeDmg * 0.9;
        W.add(new Proj('debris', s.x, Math.max(12, p.y - 300), 'enemy', dmg, { life: 3, w: 18, h: 18, color: '#b8a888', big: true }));
      }
    }
  }

  draw(ctx: Ctx) {
    // Where a stone is coming down: a ring on the ground that closes.
    const p = G.world.player;
    for (const s of this.pending) {
      const u = 1 - s.t / 0.9, a = 0.35 + Math.sin(G.time * 18) * 0.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,214,150,${a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(s.x, p.y - 1, Math.max(2, 30 * (1 - u)), 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// ---------------------------------------------------------------- the feud

interface Pair { a: Enemy; b: Enemy; t: number; done: boolean }

export class Feud extends Entity {
  private pairs: Pair[] = [];
  private armed = false;
  /** For tests: blows the host has traded. */
  traded = 0;

  constructor() {
    super(0, 0, 1, 1);
    this.layer = 1;
  }

  hurtbox(): Rect { return { x: 0, y: 0, w: 0, h: 0 }; }

  /** Pair the foes that stand within a stride of one another. */
  private arm() {
    this.armed = true;
    const foes = G.world.ents.filter((e): e is Enemy => e instanceof Enemy && !e.dying && !e.remove && !e.isBoss && !e.elite).sort((a, b) => a.x - b.x);
    const used = new Set<Enemy>();
    for (let i = 0; i < foes.length - 1; i++) {
      const a = foes[i], b = foes[i + 1];
      if (used.has(a) || used.has(b) || b.x - a.x > 90 || Math.abs(a.y - b.y) > 20) continue;
      used.add(a); used.add(b);
      this.pairs.push({ a, b, t: rand(0.2, 0.7), done: false });
    }
  }

  update(dt: number) {
    if (!this.armed) this.arm();
    const p = G.world.player;
    for (const pr of this.pairs) {
      if (pr.done) continue;
      const { a, b } = pr;
      if (a.dying || b.dying || a.remove || b.remove) { pr.done = true; continue; }
      // It ends when Elior comes near, or when either has had enough: they turn on him, wounded.
      const near = Math.min(Math.abs(p.x - a.x), Math.abs(p.x - b.x)) < 230;
      if (near || a.aggro || b.aggro || a.hp < a.maxHp * 0.4 || b.hp < b.maxHp * 0.4) {
        pr.done = true;
        if (near) { fx.hitSparks((a.x + b.x) / 2, a.y - 24, 1, '#ffe6a8', 8, 1); }
        continue;
      }
      a.aggro = false; b.aggro = false;
      a.face = b.x > a.x ? 1 : -1;
      b.face = -a.face;
      a.body.vx = 0; b.body.vx = 0;
      pr.t -= dt;
      if (pr.t <= 0) {
        pr.t = rand(0.55, 0.85);
        this.traded++;
        for (const e of [a, b]) { e.hp = Math.max(1, e.hp - e.maxHp * 0.05); e.flash = 0.1; }
        const mx = (a.x + b.x) / 2, my = a.y - 26;
        fx.hitSparks(mx, my, 1, '#ffe6a8', 8, 1);
        fx.hitSparks(mx, my, -1, '#ffe6a8', 6, 0.8);
        sfx('clash', { pan: G.world.pan(mx), vol: 0.6, pitch: rand(0.85, 1.15) });
      }
    }
  }

  draw(_ctx: Ctx) {}
}
