// Sub-weapons, in the old castle-hunter way: thrown with Up + Heavy (or the
// Sub button) and paid for with hearts found in breakable lamps. One is
// carried at a time; picking up another swaps it.

import { G } from './ctx';
import { Entity } from './entity';
import type { Player } from './player';
import { fx, PK } from '../render/fx';
import { glow, rgba, type Ctx } from '../render/draw';
import { lighting } from '../render/lighting';
import { sfx } from '../audio/audio';
import { rand, choose, sign, type Rect } from '../core/math';
import { powerDamage } from './power';
import { strikeLamps } from './lamps';
import { input } from '../core/input';

export type SubId = 'dagger' | 'axe' | 'holy_water' | 'cross' | 'sling';

export const SUBS: Record<SubId, { name: string; cost: number; icon: string; color: string; desc: string }> = {
  dagger: { name: 'Dagger', cost: 1, icon: 'dagger', color: '#e8e4dc', desc: 'Thrown straight and fast.' },
  axe: { name: 'Axe', cost: 2, icon: 'axe', color: '#c9ced6', desc: 'Thrown high in an arc. It cuts through everything it passes and finds foes above you.' },
  holy_water: { name: 'Holy Water', cost: 2, icon: 'flask', color: '#9fd8ff', desc: 'Breaks where it lands into a short-lived pool of holy fire.' },
  cross: { name: 'Cross', cost: 3, icon: 'cross', color: '#ffd77a', desc: 'Flies out and comes back, striking on both passes.' },
  sling: { name: 'David\'s Sling', cost: 1, icon: 'sling', color: '#bfb6a6', desc: '"…took thence a stone, and slang it, and smote the Philistine in his forehead" (1 Samuel 17:49, KJV). Staggers what it strikes.' },
};
export const SUB_IDS = Object.keys(SUBS) as SubId[];
export const MAX_HEARTS = 99;

/** Throw the carried sub-weapon, if there are hearts to pay for it. */
export function throwSub(p: Player): boolean {
  const s = G.save;
  const id = s.sub as SubId | null | undefined;
  if (!id || !SUBS[id]) {
    G.ui.toast('No sub-weapon yet. Break the lamps along the walls to find one.', 'warn');
    sfx('denied');
    return false;
  }
  const def = SUBS[id];
  if ((s.hearts ?? 0) < def.cost) {
    G.ui.toast(`Not enough hearts: ${def.name} needs ${def.cost}.`, 'warn');
    sfx('denied');
    return false;
  }
  if (p.subCd > 0) return false;
  s.hearts = (s.hearts ?? 0) - def.cost;
  p.subCd = id === 'dagger' || id === 'sling' ? 0.22 : 0.36;
  p.throwPose();
  const hx = p.x + p.face * 10, hy = p.y - 24;
  G.world.add(new SubProj(id, hx, hy, p.face));
  sfx(id === 'holy_water' ? 'whoosh' : 'swing', { vol: 0.6, pitch: id === 'dagger' ? 1.6 : id === 'axe' ? 0.9 : 1.2 });
  fx.ring(hx, hy, 2, 12, def.color, 0.15, 1.5);
  return true;
}

export class SubProj extends Entity {
  kind: SubId;
  vx = 0;
  vy = 0;
  life: number;
  spin = 0;
  hitSet = new Set<number>();
  /** Holy water: seconds the fire pool has burned; the cross: has it turned back. */
  pool = -1;
  back = false;
  tickT = 0;
  dir: number;

  constructor(kind: SubId, x: number, y: number, dir: number) {
    super(x, y, 10, 10);
    this.kind = kind;
    this.dir = dir;
    this.team = 'player';
    this.collide = false;
    this.layer = 9;
    const p = G.world.player;
    // Thrown things carry a little of Elior's momentum.
    const carry = p.body.vx * 0.3;
    switch (kind) {
      case 'dagger': this.vx = dir * 520 + carry; this.life = 0.8; break;
      case 'axe': this.vx = dir * 200 + carry; this.vy = -500; this.life = 1.7; break;
      case 'holy_water': this.vx = dir * 170 + carry; this.vy = -200; this.life = 2.6; break;
      case 'cross': this.vx = dir * 430 + carry; this.life = 2.6; break;
      case 'sling': this.vx = dir * 560 + carry; this.vy = -70; this.life = 1.0; break;
    }
  }

  private dmg(mult: number) {
    return G.d.atk * mult * powerDamage() * G.d.abil;
  }

  private box(): Rect {
    if (this.pool >= 0) return { x: this.x - 22, y: this.y - 26, w: 44, h: 26 };
    const r = this.kind === 'axe' || this.kind === 'cross' ? 9 : 6;
    return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
  }

  private strike(mult: number, poise: number, once: boolean) {
    const box = this.box();
    strikeLamps(box);
    const def = SUBS[this.kind];
    const n = G.world.hitEnemies(box, {
      dmg: this.dmg(mult), poise, kx: sign(this.vx || this.dir) * (this.kind === 'sling' ? 220 : 90), ky: -80,
      dir: sign(this.vx || this.dir) || this.dir, kind: 'ability', src: G.world.player, color: def.color, stop: this.kind === 'sling' ? 0.06 : 0.03,
    }, this.hitSet, (e) => {
      fx.hitSparks(e.cx, e.cy, this.dir, def.color, 6, 0.8);
      if (this.kind === 'holy_water') fx.holyBurst(e.cx, e.cy, 4, 0.5);
    });
    if (n > 0) {
      sfx(this.kind === 'sling' ? 'hitHeavy' : 'hit', { vol: 0.5, pitch: rand(0.95, 1.15) });
      input.rumble(0.2, 0.4, 70);
      if (once) this.remove = true;
    }
    return n;
  }

  update(dt: number) {
    const W = G.world;
    this.life -= dt;
    if (this.life <= 0) { this.remove = true; return; }
    this.spin += dt * (this.kind === 'axe' ? 16 : this.kind === 'cross' ? 20 : 8);
    if (this.pool >= 0) {
      // Holy fire: strike everything in it a few times a second.
      this.pool += dt;
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.25;
        this.hitSet.clear();
        this.strike(0.35, 8, false);
      }
      if (Math.random() < dt * 40) fx.spawn(PK.Flame, this.x + rand(-20, 20), this.y - rand(0, 6), rand(-10, 10), rand(-90, -40), 0.45, 5, 1, choose(['#9fd8ff', '#e8f6ff', '#ffe6a8']), -60, 1);
      if (this.pool > 1.4) this.remove = true;
      return;
    }
    switch (this.kind) {
      case 'dagger':
        this.x += this.vx * dt;
        if (Math.random() < dt * 30) fx.spawn(PK.Spark, this.x, this.y, -this.vx * 0.1, 0, 0.15, 1.2, 0.2, '#ffffff', 0, 1);
        this.strike(1.1, 14, true);
        break;
      case 'axe':
        this.vy += 1100 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.strike(1.7, 30, false);
        if (this.y > W.grid.h * 16 + 40) this.remove = true;
        break;
      case 'holy_water': {
        this.vy += 900 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (W.solidAt(this.x, this.y + 4) || this.strike(0.5, 10, false) > 0) this.burst();
        break;
      }
      case 'cross': {
        // Out, slow, turn, and home back toward Elior.
        const p = W.player;
        const ax = this.back ? sign(p.x - this.x) * 900 : -this.dir * 520;
        this.vx += ax * dt;
        if (!this.back && sign(this.vx) !== this.dir) {
          this.back = true;
          this.hitSet.clear();
        }
        if (this.back) {
          this.vx = Math.max(-420, Math.min(420, this.vx));
          this.y += (p.y - 24 - this.y) * Math.min(1, dt * 4);
          if (Math.abs(p.x - this.x) < 14 && Math.abs(p.y - 24 - this.y) < 20) this.remove = true;
        }
        this.x += this.vx * dt;
        this.strike(1.3, 20, false);
        break;
      }
      case 'sling':
        this.vy += 300 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.strike(1.4, 90, true);
        break;
    }
    // Walls stop everything but the axe and the cross.
    if (this.kind !== 'axe' && this.kind !== 'cross' && this.pool < 0 && W.solidAt(this.x, this.y)) {
      if (this.kind === 'holy_water') this.burst();
      else {
        fx.hitSparks(this.x, this.y, -this.dir, '#e8e4dc', 5, 0.6);
        this.remove = true;
      }
    }
  }

  private burst() {
    const W = G.world;
    // Settle on the floor below where the flask broke.
    let y = this.y;
    for (let i = 0; i < 6 && !W.solidAt(this.x, y + 2); i++) y += 8;
    this.y = Math.floor((y + 2) / 16) * 16;
    this.pool = 0;
    this.life = 2;
    this.tickT = 0;
    sfx('pillarFire', { vol: 0.45, pitch: 1.3 });
    fx.shards(this.x, this.y - 4, 8, '#bfe6ff', 0.6);
    fx.holyBurst(this.x, this.y - 8, 8, 0.6);
  }

  draw(ctx: Ctx) {
    const def = SUBS[this.kind];
    const x = this.x, y = this.y;
    if (this.pool >= 0) {
      const k = Math.min(1, this.pool * 4, (1.4 - this.pool) * 3);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 8, 30, '#6ab8ff', 0.4 * k);
      for (let i = 0; i < 5; i++) {
        const fxx = x - 18 + i * 9, h = 10 + Math.sin(G.time * 14 + i * 2) * 4;
        glow(ctx, fxx, y - h * 0.6, 6, i % 2 ? '#e8f6ff' : '#9fd8ff', 0.6 * k);
      }
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, 10, def.color, 0.35);
    ctx.globalCompositeOperation = 'source-over';
    const f = sign(this.vx) || this.dir;
    switch (this.kind) {
      case 'dagger':
        ctx.scale(f * 1.35, 1.35);
        ctx.fillStyle = '#e8e4dc';
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-2, -1.6); ctx.lineTo(-2, 1.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7a5a3a';
        ctx.fillRect(-6, -1, 4, 2);
        ctx.fillStyle = '#c9a04a';
        ctx.fillRect(-2.5, -3, 1.2, 6);
        break;
      case 'axe':
        ctx.rotate(this.spin * f);
        ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.fillStyle = '#c9ced6';
        ctx.beginPath(); ctx.moveTo(4, -1); ctx.quadraticCurveTo(10, -7, 9, 0); ctx.quadraticCurveTo(10, 7, 4, 1); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-4, -1); ctx.quadraticCurveTo(-10, -7, -9, 0); ctx.quadraticCurveTo(-10, 7, -4, 1); ctx.closePath(); ctx.fill();
        break;
      case 'holy_water':
        ctx.rotate(this.spin * 0.5 * f);
        ctx.fillStyle = rgba('#bfe6ff', 0.85);
        ctx.beginPath(); ctx.ellipse(0, 1, 3.6, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8f6ff';
        ctx.fillRect(-1.2, -6, 2.4, 3);
        ctx.fillStyle = '#c9a04a';
        ctx.fillRect(-1.6, -7, 3.2, 1.2);
        break;
      case 'cross':
        ctx.rotate(this.spin * f);
        ctx.fillStyle = '#ffd77a';
        ctx.fillRect(-1.6, -8, 3.2, 16);
        ctx.fillRect(-6, -3.6, 12, 3.2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(-0.6, -7, 1.2, 14);
        break;
      case 'sling':
        ctx.fillStyle = '#bfb6a6';
        ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(-0.8, -0.8, 0.9, 0, Math.PI * 2); ctx.fill();
        break;
    }
    ctx.restore();
  }

  lights() {
    if (this.pool >= 0) lighting.add(this.x, this.y - 10, 60, '#9fd8ff', 0.7, 0.5);
    else if (this.kind === 'cross') lighting.add(this.x, this.y, 36, '#ffd77a', 0.5, 0.3);
  }
}
