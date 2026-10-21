// Projectiles and timed zones: arrows, Veil orbs, the Sword of the Word,
// shockwaves, molten drops, falling debris, Pillar of Fire, Still Waters.

import { Entity, type HitInfo, type Team } from './entity';
import { TILE, T, isSolid } from './tiles';
import { G } from './ctx';
import { fx, PK } from '../render/fx';
import { glow, rgba, poly, circle, type Ctx } from '../render/draw';
import { sfx } from '../audio/audio';
import { rand, sign, clamp } from '../core/math';
import { lighting } from '../render/lighting';

export type ProjKind = 'arrow' | 'orb' | 'word' | 'wave' | 'lightwave' | 'drop' | 'debris' | 'pillar' | 'waters' | 'puddle' | 'trumpet' | 'rain' | 'flame' | 'arcbolt' | 'star';

export class Proj extends Entity {
  kind: ProjKind;
  life: number;
  maxLife: number;
  dmg: number;
  hitSet = new Set<number>();
  vx = 0;
  vy = 0;
  w: number;
  h: number;
  stuck = false;
  tick = 0;
  color: string;
  reflected = false;
  poise = 10;
  echo = false;
  big = false;
  target: Entity | null = null;

  constructor(kind: ProjKind, x: number, y: number, team: Team, dmg: number, o: Partial<{ vx: number; vy: number; life: number; w: number; h: number; color: string; poise: number; echo: boolean; big: boolean }> = {}) {
    super(x, y, o.w ?? 6, o.h ?? 6);
    this.kind = kind;
    this.team = team;
    this.dmg = dmg;
    this.vx = o.vx ?? 0;
    this.vy = o.vy ?? 0;
    this.life = this.maxLife = o.life ?? 2;
    this.w = o.w ?? 6;
    this.h = o.h ?? 6;
    this.color = o.color ?? '#ffd27a';
    this.poise = o.poise ?? 10;
    this.echo = o.echo ?? false;
    this.big = o.big ?? false;
    this.face = sign(this.vx) || 1;
    this.layer = 9;
  }

  rect() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  private hitInfo(dir: number, extra: Partial<HitInfo> = {}): HitInfo {
    return { dmg: this.dmg, poise: this.poise, kx: dir * 120, ky: -80, dir, kind: this.team === 'player' ? (this.echo ? 'echo' : 'ability') : 'proj', src: this, ...extra };
  }

  private strike(extra: Partial<HitInfo> = {}, once = true): number {
    const dir = sign(this.vx) || this.face;
    const h = this.hitInfo(dir, extra);
    if (this.team === 'player') return G.world.hitEnemies(this.rect(), h, once ? this.hitSet : new Set(), undefined);
    return G.world.hitPlayerSide(this.rect(), h, this.hitSet) ? 1 : 0;
  }

  parried(by: Entity) {
    if (this.kind === 'arrow' || this.kind === 'orb') this.reflect(by);
  }

  reflect(by: Entity) {
    if (this.reflected) return;
    this.reflected = true;
    this.team = 'player';
    this.vx = -this.vx * 1.4;
    this.vy = -Math.abs(this.vy) * 0.3;
    this.dmg *= 2.5;
    this.life = 1.5;
    this.hitSet.clear();
    this.color = '#fff1c4';
    fx.hitSparks(this.x, this.y, sign(this.vx), '#fff1c4', 8);
  }

  update(dt: number) {
    this.life -= dt;
    if (this.life <= 0) {
      this.remove = true;
      return;
    }
    const W = G.world;
    switch (this.kind) {
      case 'arcbolt': case 'star': {
        if (this.kind === 'arcbolt' && this.target?.canBeTargeted()) {
          const dx = this.target.x - this.x, dy = this.target.cy - this.y;
          const n = Math.hypot(dx, dy) || 1;
          const f = Math.min(1, dt * 7);
          this.vx += (dx / n * 270 - this.vx) * f;
          this.vy += (dy / n * 270 - this.vy) * f;
        }
        const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) * dt / 5));
        for (let i = 0; i < steps && !this.remove; i++) {
          this.x += this.vx * dt / steps; this.y += this.vy * dt / steps;
          if (W.solidAt(this.x, this.y)) this.remove = true;
          else if (this.strike({ poise: this.poise }) > 0) { this.remove = true; fx.hitSparks(this.x, this.y, sign(this.vx), this.color, 5); }
        }
        break;
      }
      case 'arrow': case 'rain': {
        if (this.stuck) return;
        this.vy += (this.kind === 'rain' ? 300 : 60) * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (W.solidAt(this.x, this.y)) {
          this.stuck = true;
          this.life = Math.min(this.life, 0.6);
          sfx('arrowHit', { vol: 0.5 });
          fx.hitSparks(this.x, this.y, -sign(this.vx), '#c9c0a8', 4, 0.5);
          return;
        }
        // Shield of Faith reflects arrows.
        if (this.team === 'enemy' && W.player.shieldT > 0 && Math.abs(this.x - W.player.x) < 26 && Math.abs(this.y - (W.player.y - 18)) < 30) {
          this.reflect(W.player);
          return;
        }
        // Defensive Sentinel Echoes intercept.
        if (this.team === 'enemy' && W.echoBlocks(this)) return;
        if (this.strike() > 0) {
          this.remove = true;
          sfx('arrowHit');
        }
        if (Math.random() < dt * 40) fx.spawn(PK.Ember, this.x, this.y, 0, 0, 0.2, 0.8, 0.1, this.color);
        break;
      }
      case 'orb': {
        const p = W.player;
        if (this.team === 'enemy' && this.maxLife - this.life < 2.2) {
          const dx = p.x - this.x, dy = p.y - 20 - this.y;
          const d = Math.hypot(dx, dy) || 1;
          this.vx += (dx / d) * 160 * dt;
          this.vy += (dy / d) * 160 * dt;
          const sp = Math.hypot(this.vx, this.vy);
          if (sp > 95) { this.vx *= 95 / sp; this.vy *= 95 / sp; }
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (W.solidAt(this.x, this.y)) return this.burst();
        if (this.team === 'enemy' && p.shieldT > 0 && Math.hypot(this.x - p.x, this.y - p.y + 18) < 28) return this.reflect(p);
        if (this.team === 'enemy' && W.echoBlocks(this)) return;
        if (this.strike({ poise: 4 }) > 0) {
          if (this.team === 'enemy' && !p.isInvuln()) p.veiled = 3;
          this.burst();
        }
        if (Math.random() < dt * 30) fx.spawn(PK.Smoke, this.x, this.y, rand(-10, 10), rand(-10, 10), 0.5, 2, 5, '#2a1636', 0, 1);
        break;
      }
      case 'word': case 'lightwave': {
        this.x += this.vx * dt;
        this.strike({ stop: 0.03 }, true);
        if (W.solidAt(this.x + sign(this.vx) * this.w * 0.4, this.y)) {
          this.life = Math.min(this.life, 0.05);
        }
        if (Math.random() < dt * 60) fx.spawn(PK.Spark, this.x - sign(this.vx) * 6, this.y + rand(-this.h / 2, this.h / 2), -this.vx * 0.2, rand(-30, 30), 0.25, 1.5, 0.3, '#ffe7a3', 0, 2);
        break;
      }
      case 'wave': {
        this.x += this.vx * dt;
        // Stay on the floor; stop at walls or edges.
        const footRow = Math.floor((this.y + 2) / TILE);
        const col = Math.floor((this.x + sign(this.vx) * 6) / TILE);
        if (isSolid(W.grid.get(col, footRow - 1)) || !isSolid(W.grid.get(col, footRow)) && W.grid.get(col, footRow) !== T.OneWay) {
          this.life = Math.min(this.life, 0.08);
        }
        this.strike({ kx: sign(this.vx) * 200, ky: -220, unblockable: this.team === 'enemy' && this.big, parryable: false }, true);
        if (Math.random() < dt * 50) {
          fx.spawn(PK.Spark, this.x + rand(-4, 4), this.y - rand(0, this.h), rand(-20, 20), rand(-140, -60), 0.35, 1.6, 0.2, this.color, 200, 1);
          fx.spawn(PK.Dust, this.x, this.y, -this.vx * 0.1, -20, 0.4, 3, 8, '#7a6a5a', 0, 2);
        }
        break;
      }
      case 'flame': {
        // Breath of fire: a tumbling gout that pools where it lands.
        this.vy += 260 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.strike({ poise: 12, kx: sign(this.vx) * 120, ky: -120, parryable: false }, true);
        const tint = this.color !== '#ffd27a' ? this.color : null;
        if (Math.random() < dt * 40) fx.spawn(PK.Flame, this.x + rand(-3, 3), this.y + rand(-3, 3), this.vx * 0.2, -40, 0.35, 5, 1, tint ?? '#ff8a3a', -60, 1);
        if (W.solidAt(this.x, this.y + 3)) {
          const ground = Math.floor((this.y + 3) / TILE) * TILE;
          W.add(new Proj('puddle', this.x, ground, 'enemy', this.dmg * 0.3, { life: 1.6, w: 22, h: 8, color: this.color }));
          fx.embers(this.x, this.y - 2, 6, tint ?? '#ffb347', 8);
          this.remove = true;
        }
        break;
      }
      case 'drop': {
        this.vy += 700 * dt;
        this.y += this.vy * dt;
        if (W.solidAt(this.x, this.y + 2)) {
          // splash
          const r = { x: this.x - 22, y: this.y - 24, w: 44, h: 28 };
          G.world.hitPlayerSide(r, { dmg: this.dmg, poise: 20, kx: 0, ky: -200, dir: 0, kind: 'proj', parryable: false, unblockable: true, src: this }, new Set());
          sfx('molten', { pan: W.pan(this.x) });
          fx.embers(this.x, this.y - 4, 12, '#ffb347', 10);
          fx.ring(this.x, this.y, 4, 26, '#ff9a3a', 0.3, 2, 0.4);
          const ground = Math.floor((this.y + 2) / TILE) * TILE;
          W.add(new Proj('puddle', this.x, ground, 'enemy', this.dmg * 0.25, { life: 2.2, w: 30, h: 8 }));
          this.remove = true;
        }
        break;
      }
      case 'debris': {
        this.vy += 900 * dt;
        this.y += this.vy * dt;
        this.tick += dt;
        if (!this.stuck) {
          G.world.hitPlayerSide(this.rect(), { dmg: this.dmg, poise: 40, kx: 0, ky: -150, dir: 0, kind: 'proj', parryable: false, unblockable: true, src: this }, this.hitSet);
          if (W.solidAt(this.x, this.y + this.h / 2)) {
            this.stuck = true;
            this.vy = 0;
            this.life = 1.2;
            sfx('wallBreak', { vol: 0.5, pan: W.pan(this.x) });
            fx.dust(this.x, this.y + this.h / 2, 10, 1.4);
            fx.shards(this.x, this.y, 8, '#6a5a48');
            G.camera.addTrauma(0.15);
          }
        } else this.vy = 0;
        break;
      }
      case 'pillar': {
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = 0.16;
          this.hitSet.clear();
          this.strike({ kx: 0, ky: -160, stop: 0.015, poise: 6 }, true);
        }
        if (Math.random() < dt * 80) fx.spawn(PK.Flame, this.x + rand(-12, 12), this.y - rand(0, 20), rand(-10, 10), rand(-260, -160), rand(0.4, 0.7), rand(5, 9), 1, '#fff3d0', 0, 1);
        break;
      }
      case 'waters': {
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = 0.5;
          W.healAlliesIn(this.x - this.w / 2, this.x + this.w / 2, this.y, this.dmg, this.big);
        }
        if (Math.random() < dt * 20) fx.spawn(PK.Mote, this.x + rand(-this.w / 2, this.w / 2), this.y - 2, 0, rand(-30, -10), 1.2, 6, 1, '#9fd8ff');
        break;
      }
      case 'puddle': {
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = 0.4;
          this.hitSet.clear();
          G.world.hitPlayerSide({ x: this.x - this.w / 2, y: this.y - 10, w: this.w, h: 12 }, { dmg: this.dmg, poise: 0, kx: 0, ky: -100, dir: 0, kind: 'proj', parryable: false, unblockable: true, noKnock: true, src: this }, this.hitSet);
        }
        if (Math.random() < dt * 10) fx.spawn(PK.Ember, this.x + rand(-12, 12), this.y - 2, 0, -30, 0.5, 1, 0.2, this.color !== '#ffd27a' ? this.color : '#ffb347');
        break;
      }
      case 'trumpet': {
        const t = 1 - this.life / this.maxLife;
        const r = 12 + t * this.w;
        const box = { x: this.x - r, y: this.y - r * 0.7, w: r * 2, h: r * 1.4 };
        G.world.hitEnemies(box, { dmg: this.dmg, poise: 70, kx: 0, ky: -200, dir: 0, kind: 'ability', guardBreak: true, src: this, stop: 0.05 }, this.hitSet, (e) => {
          e.body.vx = sign(e.x - this.x) * 260;
        });
        if (!this.stuck && t > 0.3) {
          this.stuck = true;
          G.world.breakWalls(this.x, this.y, this.w * 0.8, true);
        }
        break;
      }
    }
  }

  burst() {
    this.remove = true;
    sfx('wispShot', { vol: 0.4, pitch: 0.6 });
    fx.veilBurst(this.x, this.y, 8, 0.6);
  }

  lights() {
    switch (this.kind) {
      case 'arcbolt': case 'star': lighting.add(this.x, this.y, 32, this.color, 0.65, 0.6); break;
      case 'arrow': case 'rain': if (this.team === 'player' || this.reflected) lighting.add(this.x, this.y, 30, this.color, 0.6, 0.6); break;
      case 'orb': lighting.add(this.x, this.y, 40, '#b04cff', 0.7, 0.8); break;
      case 'word': case 'lightwave': lighting.add(this.x, this.y, 80, this.team === 'enemy' ? '#ff3a4a' : '#ffe6a8', 0.9, 0.8); break;
      case 'wave': lighting.add(this.x, this.y - 10, 50, this.color, 0.8, 0.7); break;
      case 'drop': case 'puddle': case 'flame': lighting.add(this.x, this.y, 40, '#ff9a3a', 0.8, 0.6); break;
      case 'pillar': lighting.add(this.x, this.y - 60, 140, '#fff1c4', 1, 0.8); break;
      case 'waters': lighting.add(this.x, this.y - 10, 90, '#9fd8ff', 0.7, 0.5); break;
      case 'trumpet': lighting.add(this.x, this.y, 140, '#ffe6a8', 0.7 * (this.life / this.maxLife), 0.8); break;
    }
  }

  draw(ctx: Ctx) {
    const a = clamp(this.life / Math.min(0.3, this.maxLife), 0, 1);
    switch (this.kind) {
      case 'arcbolt': case 'star': {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.globalAlpha = a;
        ctx.rotate(this.kind === 'star' ? G.time * 18 : Math.atan2(this.vy, this.vx));
        if (this.kind === 'star') {
          ctx.fillStyle = this.color; ctx.beginPath();
          for (let i = 0; i < 8; i++) { const r = i % 2 ? 2 : 7, ang = i * Math.PI / 4; if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
          ctx.closePath(); ctx.fill();
        } else {
          glow(ctx, 0, 0, 13, this.color, 0.7);
          circle(ctx, 0, 0, 4, this.color); circle(ctx, 1, 0, 2, '#ffffff');
          ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-15, 0); ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'arrow': case 'rain': {
        const ang = Math.atan2(this.vy, this.vx);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.stuck ? Math.atan2(this.vy || 0.01, this.vx) : ang);
        ctx.globalAlpha = a;
        const light = this.team === 'player' || this.reflected;
        ctx.strokeStyle = light ? '#fff6dc' : '#2a1a30';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        poly(ctx, [4, -1.6, 7.5, 0, 4, 1.6], light ? '#fff1c4' : '#b04cff');
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, 5, 0, 7, light ? '#ffd27a' : '#b04cff', 0.7);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
      case 'orb': {
        const pulse = 1 + Math.sin(G.time * 12) * 0.15;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this.x, this.y, 16 * pulse, this.reflected ? '#ffd27a' : '#9a3ae0', 0.8);
        glow(ctx, this.x, this.y, 6, '#ffffff', 0.7);
        ctx.globalCompositeOperation = 'source-over';
        circle(ctx, this.x, this.y, 3, this.reflected ? '#fff1c4' : '#2a0f3a');
        break;
      }
      case 'word': case 'lightwave': {
        const f = sign(this.vx);
        const t = 1 - this.life / this.maxLife;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(f, 1);
        ctx.globalCompositeOperation = 'lighter';
        const H = this.h / 2;
        ctx.globalAlpha = (1 - t * 0.5) * (this.kind === 'lightwave' ? 0.7 : 1);
        const foe = this.team === 'enemy';
        // Elemental crescents carry their own colour.
        const tint = !foe && this.color !== '#ffd27a' ? this.color : null;
        ctx.fillStyle = foe ? '#ff2a3a' : tint ?? '#ffb347';
        ctx.beginPath();
        ctx.moveTo(-6, -H);
        ctx.quadraticCurveTo(14, 0, -6, H);
        ctx.quadraticCurveTo(4, 0, -6, -H);
        ctx.fill();
        ctx.fillStyle = foe ? '#ffd0d0' : '#fffaf0';
        ctx.beginPath();
        ctx.moveTo(-2, -H * 0.85);
        ctx.quadraticCurveTo(12, 0, -2, H * 0.85);
        ctx.quadraticCurveTo(6, 0, -2, -H * 0.85);
        ctx.fill();
        glow(ctx, 2, 0, H * 1.4, foe ? '#ff3a4a' : tint ?? '#ffd27a', 0.5);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'wave': {
        ctx.globalCompositeOperation = 'lighter';
        const H = this.h;
        const g = ctx.createLinearGradient(0, this.y - H, 0, this.y);
        g.addColorStop(0, rgba(this.color, 0));
        g.addColorStop(1, rgba(this.color, 0.85 * a));
        ctx.fillStyle = g;
        const f = sign(this.vx);
        ctx.beginPath();
        ctx.moveTo(this.x - f * 18, this.y);
        ctx.quadraticCurveTo(this.x - f * 4, this.y - H, this.x + f * 6, this.y - H * 0.4);
        ctx.lineTo(this.x + f * 8, this.y);
        ctx.closePath();
        ctx.fill();
        glow(ctx, this.x, this.y - 6, 22, this.color, 0.6 * a);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'flame': {
        ctx.globalCompositeOperation = 'lighter';
        const fl = 0.8 + Math.sin(G.time * 30 + this.id) * 0.2;
        const acid = this.color !== '#ffd27a';
        glow(ctx, this.x, this.y, 14 * fl, acid ? this.color : '#ff6a2a', 0.85);
        glow(ctx, this.x, this.y, 6, acid ? '#f0ffd0' : '#ffe6a8', 0.9);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'drop': {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this.x, this.y, 12, '#ff9a3a', 0.9);
        ctx.globalCompositeOperation = 'source-over';
        circle(ctx, this.x, this.y, 3.5, '#ffd27a');
        // telegraph shadow on the floor below
        break;
      }
      case 'debris': {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.stuck ? 0.1 : this.tick * 3);
        ctx.globalAlpha = a;
        poly(ctx, [-this.w / 2, -this.h / 2 + 2, -this.w / 2 + 3, -this.h / 2, this.w / 2, -this.h / 2 + 3, this.w / 2 - 2, this.h / 2, -this.w / 2 + 2, this.h / 2 - 1], '#6a5a48', '#0a0806', 1);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(-this.w / 2 + 2, -this.h / 2 + 1, this.w * 0.5, 2);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
      case 'pillar': {
        const t = 1 - this.life / this.maxLife;
        const grow = Math.min(1, t * 6);
        const fade = Math.min(1, this.life * 3);
        const H = 170 * grow;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(this.x - 20, 0, this.x + 20, 0);
        g.addColorStop(0, rgba('#ff9a3a', 0));
        g.addColorStop(0.3, rgba('#ffcf6b', 0.6 * fade));
        g.addColorStop(0.5, rgba('#ffffff', 0.95 * fade));
        g.addColorStop(0.7, rgba('#ffcf6b', 0.6 * fade));
        g.addColorStop(1, rgba('#ff9a3a', 0));
        ctx.fillStyle = g;
        const wob = Math.sin(G.time * 30) * 2;
        ctx.fillRect(this.x - 18 - wob, this.y - H, 36 + wob * 2, H);
        glow(ctx, this.x, this.y - 10, 50, '#ffcf6b', 0.8 * fade);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'waters': {
        const fade = Math.min(1, this.life * 2, (this.maxLife - this.life) * 3);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, this.y - 30, 0, this.y);
        g.addColorStop(0, rgba('#9fd8ff', 0));
        g.addColorStop(1, rgba('#9fd8ff', 0.35 * fade));
        ctx.fillStyle = g;
        ctx.fillRect(this.x - this.w / 2, this.y - 30, this.w, 30);
        ctx.strokeStyle = rgba('#e8f6ff', 0.7 * fade);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - 1, this.w / 2, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const rr = ((G.time * 0.6 + i / 3) % 1) * this.w / 2;
          ctx.strokeStyle = rgba('#e8f6ff', 0.5 * fade * (1 - rr / (this.w / 2)));
          ctx.beginPath();
          ctx.ellipse(this.x, this.y - 1, rr, rr * 0.08 + 1, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'puddle': {
        const fade = Math.min(1, this.life * 2);
        ctx.globalCompositeOperation = 'lighter';
        const acid = this.color !== '#ffd27a';
        ctx.fillStyle = rgba(acid ? this.color : '#ff7a1a', 0.6 * fade);
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - 1, this.w / 2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        glow(ctx, this.x, this.y - 2, 18, acid ? this.color : '#ff9a3a', 0.4 * fade);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'trumpet': {
        const t = 1 - this.life / this.maxLife;
        const r = 12 + t * this.w;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const rr = r * (1 - i * 0.18);
          ctx.strokeStyle = rgba(i === 0 ? '#ffffff' : '#ffd27a', (1 - t) * (0.9 - i * 0.25));
          ctx.lineWidth = 4 - i;
          ctx.beginPath();
          ctx.ellipse(this.x, this.y, rr, rr * 0.7, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
    }
  }
}
