// All supers spend the same earned gauge; their effects are deliberately different.
import { G } from './ctx';
import { SUPER_MOVES, type SuperId } from './data';
import type { Entity } from './entity';
import { echoMaxHp } from './state';
import { los } from './physics';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { sign } from '../core/math';
import { shakeScale } from '../core/settings';
import { rgba, type Ctx } from '../render/draw';

export const selectedSuper = () => G.save.equippedSuper && SUPER_MOVES[G.save.equippedSuper] ? G.save.equippedSuper : 'rally';

export function superTarget(): Entity | null {
  const p = G.world.player;
  const t = G.world.nearestEnemy(p.x, p.cy, 380, 0);
  return t && p.blinkSpot(t) ? t : null;
}

export function alternateSuper(id: SuperId, before: number, now: number, target: Entity | null) {
  const W = G.world, p = W.player, d = G.d, s = G.save;
  const crossed = (at: number) => before < at && now >= at;
  const color = SUPER_MOVES[id].color;
  if (id === 'tempest') {
    for (let i = 0; i < 5; i++) if (crossed(0.45 + i * 0.32) && target?.canBeTargeted() && p.blinkToFoe(target)) {
      const final = i === 4;
      target.takeHit({ dmg: d.atk * d.abil * (final ? 6 : 2.6), poise: final ? 120 : 30, kx: final ? p.face * 240 : 0, ky: final ? -260 : 0, dir: p.face, kind: 'ability', src: p, guardBreak: true, noKnock: !final });
      fx.slash(target.x, target.cy, final ? 54 : 34, -2.4, 0.8, final ? 13 : 8, p.face, '#ffffff', color, 0.32);
      fx.veilBurst(target.x, target.cy, 10, 0.7);
      G.camera.addTrauma((final ? 0.5 : 0.16) * shakeScale());
      sfx(final ? 'execute' : 'swingHeavy');
    }
  } else if (id === 'dawnfall') {
    for (const at of [0.65, 1.15, 1.8]) if (crossed(at)) {
      const v = G.camera.view();
      for (const e of W.foes()) {
        if (!e.canBeTargeted() || e.x < v.x || e.x > v.x + v.w || !los(W.grid, W.solid, p.x, p.cy, e.x, e.cy)) continue;
        fx.column(e.x, e.y, at === 1.8 ? 65 : 40, 300, color, 0.65);
        fx.ring(e.x, e.y, 4, 65, color, 0.45, 3, 0.35);
        e.takeHit({ dmg: d.atk * d.abil * (at === 1.8 ? 4.8 : 2.5), poise: 90, kx: sign(e.x - p.x) * 90, ky: -160, dir: sign(e.x - p.x) || 1, kind: 'ability', src: p, guardBreak: true });
      }
      sfx('pillarFire');
      fx.flash(color, 0.25);
      G.camera.addTrauma(0.3 * shakeScale());
    }
  } else if (id === 'renewal' && crossed(0.8)) {
    s.hp = Math.min(d.maxHp, s.hp + d.maxHp * 0.45);
    s.ce = d.maxCe;
    p.shieldT = 4;
    for (const e of s.echoes) if (s.active.includes(e.uid)) {
      e.downFor = 0;
      e.hp = echoMaxHp(s, e, d);
    }
    for (const e of W.echoes) if (!e.remove && e.despawn <= 0) {
      e.hp = e.inst.hp = e.maxHp;
      e.invuln = Math.max(e.invuln, 4);
    }
    W.summonEchoes(true);
    W.hitEnemies({ x: p.x - 160, y: p.y - 120, w: 320, h: 140 }, { dmg: d.atk * d.abil * 4, poise: 100, kx: 0, ky: -180, dir: p.face, kind: 'ability', src: p, guardBreak: true }, new Set());
    fx.ring(p.x, p.cy, 8, 180, color, 1.0, 5);
    fx.column(p.x, p.y, 65, 300, color, 1.2);
    fx.number(p.x, p.y - 54, 'RENEWED', true, color);
    sfx('stillWaters');
    G.ui.refreshHud();
  }
}

export function drawAlternateSuper(ctx: Ctx, id: SuperId, t: number, x: number, y: number) {
  const c = SUPER_MOVES[id].color;
  ctx.strokeStyle = rgba(c, Math.min(0.8, t * 2) * Math.max(0, 1 - Math.max(0, t - 1.8)));
  ctx.lineWidth = 2;
  const r = 20 + Math.min(1, t) * 90;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, r, r * 0.25, 0, 0, Math.PI * 2);
  ctx.stroke();
}
