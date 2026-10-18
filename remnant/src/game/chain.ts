// Metal links are live combat geometry; the illustrated body remains an atlas.
import { Entity } from './entity';
import type { Player } from './player';
import type { AttackDef } from './weapons';
import { G } from './ctx';
import { overlaps, sign } from '../core/math';
import { los } from './physics';
import { powerDamage } from './power';
import { fx } from '../render/fx';
import type { Ctx } from '../render/draw';
import { fineDetail } from '../render/actors';

/** Only selected moves gain reach, leaving the basic close-range rhythm intact. */
export function chainReach(a: AttackDef): number {
  return a.finisher || ['heavy', 'storm', 'rend', 'cross'].includes(a.id) ? 30 : 0;
}

export function drawChain(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, shade = false, sag = 4) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.min(64, Math.ceil(Math.hypot(dx, dy) / 5)));
  const angle = Math.atan2(dy, dx);
  ctx.strokeStyle = shade ? '#a9b4ff' : '#c2bdad';
  ctx.lineWidth = 1;
  if (!fineDetail()) {
    ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    return;
  }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    ctx.save();
    ctx.translate(x0 + dx * u, y0 + dy * u + Math.sin(u * Math.PI) * sag);
    ctx.rotate(angle);
    ctx.strokeRect(-2, i % 2 ? -0.6 : -1.4, 4, i % 2 ? 1.2 : 2.8);
    ctx.restore();
  }
}

/** The equipped weapon flies, confirms a real hit, then brings Elior to its mark. */
export class ChainBlade extends Entity {
  age = 0;
  returning = false;
  private room: string;
  constructor(public owner: Player, target: Entity | null) {
    super(owner.x + owner.face * 14, owner.cy, 12, 10);
    this.room = G.world.room.id;
    this.team = 'player';
    this.layer = 9;
    const dx = target ? target.cx - this.x : owner.face * 200;
    const dy = target ? target.cy - this.y : 0;
    const len = Math.hypot(dx, dy) || 1;
    this.body.vx = dx / len * 540;
    this.body.vy = dy / len * 540;
  }

  private finish() {
    this.remove = true;
    if (this.owner.weaponFlight === this) this.owner.weaponFlight = null;
  }

  update(dt: number) {
    const p = this.owner, W = G.world;
    if (W.player !== p || W.room.id !== this.room || p.state === 'dead' || p.mantleT <= 0) { this.finish(); return; }
    this.age += dt;
    if (this.age > 1.5) { this.finish(); return; }
    if (this.returning) {
      const dx = p.x - this.x, dy = p.cy - this.y, d = Math.hypot(dx, dy);
      if (d < 16) { this.finish(); return; }
      this.x += dx / d * Math.min(d, 720 * dt);
      this.y += dy / d * Math.min(d, 720 * dt);
      return;
    }
    const x0 = this.x, y0 = this.y;
    const steps = Math.max(1, Math.ceil(540 * dt / 5));
    for (let i = 0; i < steps; i++) {
      this.x += this.body.vx * dt / steps;
      this.y += this.body.vy * dt / steps;
      if (W.solidAt(this.x, this.y) || !los(W.grid, W.solid, x0, y0, this.x, this.y)) { this.returning = true; return; }
      for (const foe of W.foes()) {
        if (!foe.canBeTargeted() || !overlaps(this.hurtbox(), foe.hurtbox())) continue;
        const dir = sign(this.body.vx) || p.face;
        const before = foe.hp;
        const hit = foe.takeHit({ dmg: G.d.atk * G.d.meleeMult * powerDamage() * 1.15, poise: 32, kx: dir * 25, ky: 0, dir, kind: 'melee', src: p, heavy: true, noKnock: true });
        if (!hit) continue;
        p.practiceHit(foe, Math.max(0, before - foe.hp));
        fx.ring(this.x, this.y, 3, 24, '#b8bdff', 0.25, 2);
        this.finish();
        p.weaponImpact(foe);
        return;
      }
    }
    if (this.age >= 0.62 || Math.hypot(this.x - p.x, this.y - p.cy) > 350) this.returning = true;
  }

  draw(ctx: Ctx) {
    const p = this.owner;
    drawChain(ctx, p.x + p.face * p.j.haFX, p.y + p.j.haFY, this.x, this.y, true, 7);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.body.vy, this.body.vx));
    ctx.fillStyle = p.style.weaponColor ?? '#dce0e8';
    const len = p.family === 'greatsword' ? 27 : p.family === 'spear' ? 32 : 21;
    ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(-4, -2.5); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cfae69'; ctx.fillRect(-7, -5, 2, 10);
    ctx.fillStyle = '#44334d'; ctx.fillRect(-15, -1, 9, 2);
    ctx.restore();
  }
}
