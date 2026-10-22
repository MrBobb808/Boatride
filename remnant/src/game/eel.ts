// BRINE EEL (`eel`): an aquatic foe for any flooded room. Original fiction.
//
// It hides in a lair (where it was placed; set `face` toward open water) and
// cannot be struck there. When prey comes within reach it coils: its eyes
// flare and a line of light marks the path it will take. Then it darts along
// that line, snaps its jaws at the end of it, and swims back to the lair. The
// bite can be parried, which leaves it stunned and open out in the water.
// It swims (no gravity) and never leaves the water.

import type { Entity } from './entity';
import { Enemy } from './enemies';
import { G } from './ctx';
import { inWater } from './water';
import { approach, clamp, rand } from '../core/math';
import { glow, rgba, type Ctx } from '../render/draw';
import { sfx } from '../audio/audio';
import { lighting } from '../render/lighting';

/** Telegraph (coil), dart speed and reach, the bite window, and the rest between attacks. */
export const EEL = { coil: 0.62, dartV: 420, reach: 170, sight: 190, bite: 0.32, rest: [1.4, 2.2] as const };
const C = { body: '#1c3a3e', back: '#10262a', belly: '#6f9a86', fin: '#2e5a5a', line: '#061012', glow: '#7fffd4', eye: '#e8ff8a' };
const N = 12;
const SPOT = 'rgba(127,255,212,0.75)';
const DASH = [4, 3];
const NODASH: number[] = [];

export class Eel extends Enemy {
  aquatic = true;
  lairX: number;
  lairY: number;
  dirX = 1;
  dirY = 0;
  dartLen = 0;
  travelled = 0;
  jaw = 0;

  constructor(x: number, y: number, elite: string | null) {
    super('eel', x, y - 2, 16, 12, elite);
    this.grav = 0;
    this.lairX = x;
    this.lairY = y - 2;
    this.attackCd = rand(0.6, 1.2);
    this.state = 'lurk';
    this.layer = 5;
    if (elite) this.scale = 1.15;
  }

  /** Hidden in its lair it is neither struck nor targeted. */
  private get hidden() {
    return this.state === 'lurk' && Math.hypot(this.x - this.lairX, this.y - this.lairY) < 6 && !this.dying && this.staggered <= 0;
  }
  canBeTargeted() {
    return super.canBeTargeted() && !this.hidden;
  }

  groan() {
    sfx('swimStroke', { pan: G.world.pan(this.x), vol: 0.35, pitch: 0.6 });
  }

  parried(_by: Entity) {
    this.poise = 0;
    this.stagger();
    this.body.vx = -this.dirX * 120;
    this.body.vy = -this.dirY * 120;
    this.jaw = 0;
  }

  onRecover() {
    this.setState('retreat');
  }

  /** Prey it can reach: close, seen, and under water itself (or right at the edge of it). */
  private prey(): Entity | null {
    const t = this.pickTarget(EEL.sight);
    if (!t || !this.canSee(t)) return null;
    if (!inWater(G.world.grid, t.x, t.cy) && !inWater(G.world.grid, t.x, t.y - 2)) return null;
    return t;
  }

  think(dt: number) {
    const b = this.body;
    if (this.hidden) this.invuln = 0.05;
    this.jaw = approach(this.jaw, this.state === 'bite' ? 1 : this.state === 'coil' ? 0.35 : 0, dt * 8);
    switch (this.state) {
      case 'coil': {
        // The tell: it draws back into its lair mouth, eyes flaring, the line burning.
        const back = clamp(this.st / EEL.coil, 0, 1) * 4;
        b.vx = (this.lairX - this.dirX * back - this.x) * 12;
        b.vy = (this.lairY - this.dirY * back - this.y) * 12;
        if (this.st >= EEL.coil / (this.elite ? 1.2 : 1)) {
          this.hitSet.clear();
          this.travelled = 0;
          this.setState('dart');
          sfx('whoosh', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.3 });
          sfx('splashSmall', { pan: G.world.pan(this.x), vol: 0.4, pitch: 0.7 });
        }
        break;
      }
      case 'dart': {
        const v = EEL.dartV * (this.elite ? 1.1 : 1);
        b.vx = this.dirX * v;
        b.vy = this.dirY * v;
        this.travelled += v * dt;
        this.strike(-9, -12, 18, 12, 0.6, { poise: 10, kx: this.dirX * 160, ky: this.dirY * 160 - 60 });
        // Its line ends, a wall stops it, or it would leave the water: it bites there.
        const ahead = this.x + this.dirX * 10, aheadY = this.y - 6 + this.dirY * 10;
        if (this.travelled >= this.dartLen || this.st > 0.8 || !inWater(G.world.grid, ahead, aheadY) || G.world.solidAt(ahead, aheadY)) {
          this.hitSet.clear();
          this.setState('bite');
          sfx('houndBark', { pan: G.world.pan(this.x), vol: 0.45, pitch: 0.55 });
        }
        break;
      }
      case 'bite': {
        b.vx = approach(b.vx, 0, 2400 * dt);
        b.vy = approach(b.vy, 0, 2400 * dt);
        if (this.st > 0.08 && this.st < 0.2) this.strike(-12, -16, 24, 20, 1, { poise: 26, kx: this.dirX * 200, ky: this.dirY * 120 - 100 });
        if (this.st >= EEL.bite) this.setState('retreat');
        break;
      }
      case 'lurk': {
        b.vx = (this.lairX - this.x) * 6;
        b.vy = (this.lairY - this.y) * 6;
        const t = this.attackCd <= 0 ? this.prey() : null;
        if (t) {
          this.aggro = true;
          this.target = t;
          const dx = t.x - this.lairX, dy = t.cy - (this.lairY - 6);
          const d = Math.hypot(dx, dy) || 1;
          this.dirX = dx / d;
          this.dirY = dy / d;
          this.face = this.dirX >= 0 ? 1 : -1;
          this.dartLen = Math.min(d + 18, EEL.reach * this.scale);
          this.setState('coil');
          sfx('houndGrowl', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.5 });
        }
        break;
      }
      default: {
        // Retreat (also after a flinch or a stun): back into the lair.
        const dx = this.lairX - this.x, dy = this.lairY - this.y, d = Math.hypot(dx, dy);
        const sp = 150;
        b.vx = approach(b.vx, d > 1 ? (dx / d) * Math.min(sp, d * 8) : 0, 900 * dt);
        b.vy = approach(b.vy, d > 1 ? (dy / d) * Math.min(sp, d * 8) : 0, 900 * dt);
        if (Math.abs(dx) > 2) this.face = dx > 0 ? -1 : 1;
        if (d < 3) {
          this.x = this.lairX;
          this.y = this.lairY;
          b.vx = b.vy = 0;
          this.attackCd = rand(EEL.rest[0], EEL.rest[1]) / (this.elite ? 1.25 : 1);
          this.setState('lurk');
        }
      }
    }
  }

  update(dt: number) {
    super.update(dt);
    // Knocked about by blows, it still drifts back toward stillness.
    if (this.staggered > 0 || this.hurtT > 0 || this.dying) {
      this.body.vy = approach(this.body.vy, this.dying ? 20 : 0, 400 * dt);
    }
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx: Ctx) {
    const fade = this.dying && !this.awaitingPurify ? clamp(1 - (this.deathT - 0.4) / 0.6, 0, 1) : 1;
    const s = this.scale, t = G.time + this.id;
    const lx = this.lairX, ly = this.lairY - 6;
    // The lair: a dark mouth in the rock.
    ctx.fillStyle = '#05090b';
    ctx.beginPath();
    ctx.ellipse(lx, ly, 9 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a4448';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.fillRect(Math.round(lx + Math.cos(a) * 9 * s - 2), Math.round(ly + Math.sin(a) * 7 * s - 1.5), 4, 3);
    }
    if (fade <= 0.01) return;
    ctx.globalAlpha = fade;
    // The body runs from the lair to the head, waving side to side.
    const hx = this.x, hy = this.y - 6;
    const dx = hx - lx, dy = hy - ly, d = Math.hypot(dx, dy);
    const nx = d > 0.5 ? -dy / d : 0, ny = d > 0.5 ? dx / d : 1;
    const wave = this.state === 'dart' ? 1.5 : this.state === 'coil' ? 0.6 : 3;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = pass === 0 ? C.line : pass === 1 ? C.body : C.belly;
      let px = lx, py = ly;
      for (let i = 1; i <= N; i++) {
        const u = i / N;
        const w = Math.sin(t * 9 - u * 6) * wave * Math.sin(u * Math.PI) * s;
        const x = lx + dx * u + nx * w, y = ly + dy * u + ny * w;
        const thick = (2.5 + u * 4.5) * s;
        ctx.lineWidth = pass === 0 ? thick + 2 : pass === 1 ? thick : Math.max(1, thick * 0.35);
        // The pale belly runs along the underside.
        const o = pass === 2 ? thick * 0.3 : 0;
        ctx.beginPath(); ctx.moveTo(px + nx * o, py + ny * o); ctx.lineTo(x + nx * o, y + ny * o); ctx.stroke();
        // Glowing spots down its flank.
        if (pass === 1 && i % 3 === 0 && i < N) {
          ctx.fillStyle = SPOT;
          ctx.fillRect(Math.round(x - nx * thick * 0.25), Math.round(y - ny * thick * 0.25), 1, 1);
        }
        px = x; py = y;
      }
    }
    ctx.lineCap = 'butt';
    // The head: a wedge along the dart line, the jaw opening to bite.
    const a = d > 2 ? Math.atan2(dy, dx) : this.state === 'lurk' ? Math.atan2(this.dirY, this.dirX) : (this.face > 0 ? 0 : Math.PI);
    ctx.save();
    ctx.translate(Math.round(hx), Math.round(hy));
    ctx.rotate(a);
    ctx.scale(s, Math.cos(a) < 0 ? -s : s);
    const jaw = this.jaw * 0.6;
    ctx.fillStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(-6, -5); ctx.lineTo(4, -5); ctx.lineTo(11, -1); ctx.lineTo(4, 1); ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.moveTo(-5, -4); ctx.lineTo(4, -4); ctx.lineTo(10, -1); ctx.lineTo(4, 0); ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();
    // lower jaw
    ctx.save();
    ctx.translate(-1, 1);
    ctx.rotate(jaw);
    ctx.fillStyle = C.line;
    ctx.fillRect(-4, -0.5, 13, 3.5);
    ctx.fillStyle = C.belly;
    ctx.fillRect(-3, 0, 11, 2);
    if (this.jaw > 0.2) { ctx.fillStyle = '#e8eadc'; for (let i = 0; i < 4; i++) ctx.fillRect(1 + i * 2, -0.5, 1, 1); }
    ctx.restore();
    if (this.jaw > 0.2) { ctx.fillStyle = '#e8eadc'; for (let i = 0; i < 4; i++) ctx.fillRect(1 + i * 2, 0, 1, 1); }
    // dorsal fin
    ctx.fillStyle = C.fin;
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-2, -8); ctx.lineTo(2, -4); ctx.closePath(); ctx.fill();
    // eye
    ctx.fillStyle = C.eye;
    ctx.fillRect(4, -3, 2, 1.5);
    if (this.flash > 0) {
      ctx.globalAlpha = fade * Math.min(0.9, this.flash * 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -5, 17, 9);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx: Ctx) {
    if (!this.dying && this.state === 'coil') {
      const u = clamp(this.st / EEL.coil, 0, 1), a = 0.45 + Math.sin(G.time * 22) * 0.25;
      const x0 = this.lairX, y0 = this.lairY - 6;
      const x1 = x0 + this.dirX * this.dartLen, y1 = y0 + this.dirY * this.dartLen;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.glow, a * 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash(DASH);
      ctx.lineDashOffset = -G.time * 30;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash(NODASH);
      // The line fills from the lair as the strike nears.
      ctx.strokeStyle = rgba(C.glow, 0.9);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u); ctx.stroke();
      glow(ctx, x1, y1, 10, C.glow, a * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      if (this.st > 0.12) this.glint(ctx, this.x + this.dirX * 6, this.y - 8 + this.dirY * 6, C.eye);
    }
    super.drawOverlay(ctx);
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x, this.y - 6, this.state === 'coil' ? 46 : 26, C.glow, this.state === 'coil' ? 0.6 : 0.3, 0.4);
  }
}
