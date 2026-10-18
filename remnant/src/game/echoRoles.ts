import { G } from './ctx';
import { Entity } from './entity';
import type { EchoUnit } from './echoes';
import { ECHO_ROLES, echoRole } from './data';
import { echoAtk } from './state';
import { Proj } from './projectiles';
import { los } from './physics';
import { T, TILE } from './tiles';
import { fx } from '../render/fx';
import { drawEchoSprite } from '../render/creatureSprites';
import { drawHumanoid } from '../render/actors';
import { sfx } from '../audio/audio';
import { sign } from '../core/math';
import type { Ctx } from '../render/draw';

/** Check the entire body before an ally or its double blinks. */
export function echoSpot(u: EchoUnit, t: Entity, side: number) {
  const W = G.world;
  const x = t.x + side * (t.body.w / 2 + u.body.w / 2 + 9), y = t.y;
  if (x < u.body.w || x > W.grid.w * TILE - u.body.w || y < u.body.h || y > W.grid.h * TILE) return null;
  for (let cy = Math.floor((y - u.body.h) / TILE); cy <= Math.floor((y - 1) / TILE); cy++) {
    for (let cx = Math.floor((x - u.body.w / 2) / TILE); cx <= Math.floor((x + u.body.w / 2) / TILE); cx++) if (W.solid(W.grid.get(cx, cy))) return null;
  }
  const floor = W.grid.get(Math.floor(x / TILE), Math.floor(y / TILE));
  if (floor === T.Spikes || floor === T.Veil || !los(W.grid, W.solid, u.x, u.cy, x, y - u.body.h / 2)) return null;
  return { x, y };
}

function bolt(u: EchoUnit, t: Entity, mult: number, kind: 'arcbolt' | 'star', spread = 0) {
  const dx = t.x - u.x, dy = t.cy - u.cy;
  const a = Math.atan2(dy, dx) + spread, speed = kind === 'star' ? 440 : 270;
  const pr = new Proj(kind, u.x + u.face * 12, u.cy, 'player', echoAtk(G.save, u.inst, G.d) * mult, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1.8, w: 10, h: 10, color: ECHO_ROLES[echoRole(u.inst)].color, echo: true, poise: 18 });
  pr.target = t;
  G.world.add(pr);
}

export function tickEchoRole(u: EchoUnit, dt: number) {
  u.specialCd = Math.max(0, u.specialCd - dt);
  if (u.specialCd > 0 || u.summonT > 0.3 || u.move || u.state === 'draw') return;
  const W = G.world, p = W.player, role = echoRole(u.inst), st = u.inst.stage;
  const t = u.target;
  const near = Math.hypot(u.x - p.x, u.y - p.y) < 190;
  if (role === 'herald') {
    let wounded = near && G.save.hp < G.d.maxHp;
    for (const e of W.echoes) if (Math.hypot(e.x - u.x, e.y - u.y) < 180 && e.hp < e.maxHp && !e.remove && e.despawn <= 0) wounded = true;
    if (!wounded) return;
    W.healAlliesIn(u.x - 180, u.x + 180, u.y, 0.1 + st * 0.04, false);
    if (near && st > 0) G.save.ce = Math.min(G.d.maxCe, G.save.ce + 8 + st * 4);
    fx.ring(u.x, u.cy, 8, 180, '#9de6bb', 0.7, 3);
    sfx('stillWaters', { vol: 0.55 });
    u.specialCd = 7;
    u.gainXp(2);
    return;
  }
  if (!t?.canBeTargeted() || Math.hypot(t.x - u.x, t.cy - u.cy) > 340 || !los(W.grid, W.solid, u.x, u.cy, t.x, t.cy)) return;
  const atk = echoAtk(G.save, u.inst, G.d) * W.commanderAura(u.x, u.y, u);
  if (role === 'guardian') {
    if (!near) return;
    p.shieldT = Math.max(p.shieldT, 0.65 + st * 0.25);
    for (const e of W.echoes) if (Math.hypot(e.x - u.x, e.y - u.y) < 150 && !e.remove && e.despawn <= 0) e.invuln = Math.max(e.invuln, 0.65 + st * 0.25);
    fx.ring(p.x, p.cy, 8, 34, '#8ecbff', 0.55, 3);
    u.specialCd = 8;
  } else if (role === 'mage') {
    for (let i = -1; i <= 1; i++) bolt(u, t, 0.85, 'arcbolt', i * 0.18);
    if (st >= 1) W.add(new Proj('pillar', t.x, W.groundY(t.x, t.y), 'player', atk * 0.32, { life: 1.1, w: 46, h: 150, color: '#a9a3ff', echo: true }));
    if (st >= 2) {
      let last: Entity = u, hits = 0;
      for (const e of W.foes()) if (hits < 3 && e.canBeTargeted() && Math.hypot(e.x - t.x, e.cy - t.cy) < 180 && los(W.grid, W.solid, last.x, last.cy, e.x, e.cy)) {
        fx.streak(last.x, last.cy, e.x, e.cy, '#b9b5ff', 0.4, 3);
        e.takeHit({ dmg: atk * 1.4, poise: 35, kx: 0, ky: -80, dir: u.face, kind: 'echo', src: u });
        last = e; hits++;
      }
    }
    sfx('swordWord', { vol: 0.55, pitch: 1.5 });
    u.specialCd = 6;
  } else if (role === 'ninja') {
    const spot = echoSpot(u, t, sign(t.x - u.x) || u.face);
    if (!spot) return;
    fx.streak(u.x, u.cy, spot.x, spot.y - u.body.h / 2, '#c4a0ff', 0.3, 3);
    u.x = spot.x; u.y = spot.y; u.body.vx = u.body.vy = 0;
    u.face = sign(t.x - u.x) || 1;
    u.invuln = Math.max(u.invuln, 0.7);
    u.attackCd = Math.max(u.attackCd, 0.2);
    bolt(u, t, 1.3, 'star');
    if (st >= 1) for (let i = 0; i < (st === 2 ? 3 : 2); i++) W.add(new Mirage(u, t, i % 2 ? 1 : -1, i * 0.09));
    if (st >= 2) bolt(u, t, 2.2, 'arcbolt');
    sfx('dash', { vol: 0.65, pitch: 1.6 });
    u.specialCd = 6;
  } else if (role === 'fighter') {
    if (Math.hypot(t.x - u.x, t.cy - u.cy) > 95) return;
    W.hitEnemies({ x: u.x - 65, y: u.y - 90, w: 130, h: 100 }, { dmg: atk * 2.8, poise: 85, kx: u.face * 80, ky: -360, dir: u.face, kind: 'echo', src: u, launch: true, guardBreak: true }, new Set());
    fx.ring(u.x, u.y - 8, 8, 65, '#ffad7d', 0.4, 4, 0.4);
    if (st >= 1) W.add(new Proj('wave', u.x, u.y, 'player', atk * 1.3, { vx: u.face * 270, life: 0.9, w: 18, h: 30, color: '#ffad7d', echo: true }));
    sfx('hitHeavy', { vol: 0.75 });
    u.specialCd = 6.5;
  } else return;
  u.gainXp(2);
}

/** A bounded, short-lived double. It attacks once and vanishes with its room. */
class Mirage extends Entity {
  t = 0;
  struck = false;
  constructor(public owner: EchoUnit, public target: Entity, side: number, public delay: number) {
    const spot = echoSpot(owner, target, side);
    super(spot?.x ?? owner.x, spot?.y ?? owner.y, owner.body.w, owner.body.h);
    this.face = sign(target.x - this.x) || 1;
    this.team = 'player';
    this.layer = 7;
    if (!spot) this.remove = true;
  }
  update(dt: number) {
    this.t += dt;
    if (this.owner.remove || this.owner.despawn > 0 || this.t > this.delay + 0.65) { this.remove = true; return; }
    if (!this.struck && this.t > this.delay + 0.2) {
      this.struck = true;
      const t = this.target, W = G.world;
      if (t.canBeTargeted() && Math.hypot(t.x - this.x, t.cy - this.cy) < 90 && los(W.grid, W.solid, this.x, this.cy, t.x, t.cy)) {
        t.takeHit({ dmg: echoAtk(G.save, this.owner.inst, G.d) * 0.9, poise: 25, kx: 0, ky: -70, dir: this.face, kind: 'echo', src: this.owner, noKnock: true });
        fx.slash(t.x, t.cy, 28, -2.4, 0.7, 6, this.face, '#ffffff', '#c4a0ff', 0.25);
      }
    }
  }
  draw(ctx: Ctx) {
    if (this.t < this.delay) return;
    ctx.save();
    ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    ctx.globalAlpha = 0.5 * Math.max(0, 1 - (this.t - this.delay) / 0.65);
    if (!drawEchoSprite(ctx, this.owner)) drawHumanoid(ctx, this.owner.j, this.owner.kit.style(this.owner.inst.stage), G.time);
    ctx.restore();
  }
}

/** Small role emblems remain readable over every original creature silhouette. */
export function drawEchoRole(ctx: Ctx, u: EchoUnit) {
  const role = echoRole(u.inst), y = -u.body.h - 13;
  if (role === 'mage' || role === 'herald') {
    ctx.strokeStyle = ECHO_ROLES[role].color; ctx.lineWidth = 1;
    const orbY = -u.body.h * 0.6 + Math.sin(G.time * 3 + u.id) * 3;
    ctx.beginPath(); ctx.arc(15, orbY, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff6ed'; ctx.fillRect(13, orbY - 2, 4, 4);
  }
  ctx.fillStyle = '#0d0b16'; ctx.fillRect(-5, y - 5, 10, 10);
  ctx.strokeStyle = ECHO_ROLES[role].color; ctx.fillStyle = ECHO_ROLES[role].color; ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (role === 'mage') { ctx.arc(0, y, 3, 0, Math.PI * 2); ctx.moveTo(-4, y); ctx.lineTo(4, y); }
  else if (role === 'ninja') { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(0, y); ctx.lineTo(Math.cos(a) * 4, y + Math.sin(a) * 4); } }
  else if (role === 'herald') { ctx.moveTo(-3, y); ctx.lineTo(3, y); ctx.moveTo(0, y - 3); ctx.lineTo(0, y + 3); }
  else if (role === 'fighter') { ctx.rect(-3, y - 2, 6, 5); }
  else if (role === 'guardian') { ctx.moveTo(-3, y - 3); ctx.lineTo(3, y - 3); ctx.lineTo(2, y + 2); ctx.lineTo(0, y + 4); ctx.lineTo(-2, y + 2); ctx.closePath(); }
  else { ctx.moveTo(-2, y - 4); ctx.quadraticCurveTo(5, y, -2, y + 4); ctx.moveTo(-2, y - 4); ctx.lineTo(-2, y + 4); }
  ctx.stroke();
}
