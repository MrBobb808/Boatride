// Power that grows with Elior: power tiers by level (bigger, louder,
// brighter combat), weapon elements with on-hit effects, and the Sovereign
// form from level 100.

import { G } from './ctx';
import { ITEMS } from './data';
import { getItem } from './state';
import { Entity } from './entity';
import { fx, PK } from '../render/fx';
import { glow, rgba, type Ctx } from '../render/draw';
import { sfx } from '../audio/audio';
import { rand, sign, choose } from '../core/math';
import { lighting } from '../render/lighting';
import { mantleMul } from './mantle';
import { sovereignDamage } from './balance';

export type Element = 'fire' | 'frost' | 'storm' | 'shadow' | 'holy' | 'blood';

export const ELEMENTS: Record<Element, { name: string; c: string; core: string; sfx: string; desc: string }> = {
  fire: { name: 'Fire', c: '#ff7a2a', core: '#ffd27a', sfx: 'elemFire', desc: 'Sets foes burning.' },
  frost: { name: 'Frost', c: '#6ad0ff', core: '#e8fbff', sfx: 'elemFrost', desc: 'Chills foes, slowing every move they make.' },
  storm: { name: 'Storm', c: '#b49cff', core: '#f6f0ff', sfx: 'elemStorm', desc: 'Lightning leaps to nearby foes.' },
  shadow: { name: 'Shadow', c: '#8a4aff', core: '#e0d0ff', sfx: 'elemShadow', desc: 'Drinks life and calls a shadow blade to strike again.' },
  holy: { name: 'Light', c: '#ffd77a', core: '#fffaf0', sfx: 'elemHoly', desc: 'Sears the Veil: more damage to great foes.' },
  blood: { name: 'Crimson', c: '#ff3a4a', core: '#ffd0d0', sfx: 'elemBlood', desc: 'Opens wounds that bleed.' },
};

/** The element of the equipped weapon, if any. */
export function weaponElement(): Element | null {
  const s = G.save;
  const wp = s ? getItem(s, s.equipment.weapon) : null;
  return (wp && (ITEMS[wp.id]?.element as Element | undefined)) || null;
}

/**
 * Power tiers: 0 below level 10, then 10, 20, 35, 50, 75, 100 (Sovereign)
 * and 150 (Monarch of the Remnant).
 */
const TIER_LV = [10, 20, 35, 50, 75, 100, 150];
export function powerTier(level = G.save?.level ?? 1) {
  let t = 0;
  for (const l of TIER_LV) if (level >= l) t++;
  return t;
}
export const SOVEREIGN_LV = 100;
export const isSovereign = () => (G.save?.level ?? 0) >= SOVEREIGN_LV;

/** Outgoing damage multiplier from sheer power (on top of stats) and the Shadow Mantle. */
export function powerDamage() {
  const lv = G.save?.level ?? 1;
  return sovereignDamage(lv) * mantleMul();
}

/** Slash colours for the current weapon and power. */
export function slashColors(base: string): [string, string] {
  const el = weaponElement();
  if (isSovereign()) return el ? [ELEMENTS[el].core, ELEMENTS[el].c] : ['#fff6dc', '#ffb347'];
  if (el) return [ELEMENTS[el].core, ELEMENTS[el].c];
  return ['#fffaf0', base];
}

// ---------------------------------------------------------------- elemental hits

let sfxGap = 0;
export function elementHit(e: Entity, el: Element, dmg: number, dir: number, finisher: boolean, dealt = 0) {
  const E = ELEMENTS[el];
  const x = e.cx, y = e.cy;
  if (G.time > sfxGap) {
    sfx(E.sfx, { vol: 0.5, pitch: rand(0.9, 1.1) });
    sfxGap = G.time + 0.08;
  }
  switch (el) {
    case 'fire':
      e.burn = Math.max(e.burn, 3);
      e.burnDps = Math.max(e.burnDps, G.d.atk * 0.3);
      fx.embers(x, y, finisher ? 14 : 6, E.c, 10);
      for (let i = 0; i < (finisher ? 6 : 3); i++) fx.spawn(PK.Flame, x + rand(-8, 8), y + rand(-10, 10), dir * rand(20, 80), rand(-80, -30), 0.4, 6, 1, E.c, -80, 1);
      break;
    case 'frost':
      e.chill = Math.max(e.chill, finisher ? 3.5 : 2.2);
      fx.shards(x, y, finisher ? 10 : 4, E.c, 0.8);
      if (finisher) fx.ring(x, y, 4, 40, E.core, 0.35, 2);
      break;
    case 'storm': {
      if (finisher || Math.random() < 0.35) {
        // Chain lightning to up to two more foes.
        let from = e;
        const hit = new Set<number>([e.id]);
        for (let n = 0; n < (finisher ? 3 : 2); n++) {
          let best: Entity | null = null, bd = 130;
          for (const o of G.world.foes()) {
            if (hit.has(o.id) || !o.canBeTargeted()) continue;
            const d = Math.hypot(o.cx - from.cx, o.cy - from.cy);
            if (d < bd) { bd = d; best = o; }
          }
          if (!best) break;
          hit.add(best.id);
          bolt(from.cx, from.cy, best.cx, best.cy, E.c);
          best.takeHit({ dmg: dmg * 0.4, poise: 6, kx: 0, ky: -40, dir: sign(best.x - from.x) || 1, kind: 'ability', src: G.world.player, noKnock: true });
          from = best;
        }
      }
      fx.hitSparks(x, y, dir, E.core, 6, 1);
      break;
    }
    case 'shadow': {
      const p = G.world.player;
      p.leechHeal(dealt, 0.03);
      fx.veilBurst(x, y, 4, 0.6);
      if (finisher || Math.random() < 0.18) {
        // A shadow blade answers the strike a moment later.
        G.world.after(0.18, () => {
          if (e.dying || e.remove) return;
          fx.slash(e.cx - dir * 6, e.cy, 26, dir > 0 ? -2.6 : 2.6, dir > 0 ? 0.6 : -0.6, 9, 1, E.core, E.c, 0.2);
          e.takeHit({ dmg: dmg * 0.5, poise: 10, kx: dir * 60, ky: -60, dir, kind: 'ability', src: p });
        });
      }
      break;
    }
    case 'holy':
      fx.holyBurst(x, y, finisher ? 12 : 4, 0.6);
      break;
    case 'blood':
      e.bleed = Math.min(4, e.bleed + 1.2);
      e.bleedDps = Math.max(e.bleedDps, G.d.atk * 0.22);
      fx.hitSparks(x, y, dir, E.c, finisher ? 12 : 5, 0.9);
      break;
  }
}

/** A jagged lightning bolt between two points. */
export function bolt(x0: number, y0: number, x1: number, y1: number, c: string) {
  const n = 6;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const nx = x0 + (x1 - x0) * u + (i < n ? rand(-10, 10) : 0);
    const ny = y0 + (y1 - y0) * u + (i < n ? rand(-10, 10) : 0);
    fx.streak(px, py, nx, ny, i % 2 ? '#ffffff' : c, 0.16, 2.2);
    px = nx;
    py = ny;
  }
  fx.ring(x1, y1, 3, 18, c, 0.2, 2);
}

/** Burning and bleeding foes take damage over time; a chilled foe moves slowly. */
export function tickStatus(e: Entity, dt: number) {
  if (e.chill > 0) e.chill -= dt;
  if (e.burn <= 0 && e.bleed <= 0) return;
  e.dotT += dt;
  if (e.burn > 0) {
    e.burn -= dt;
    if (Math.random() < dt * 14) fx.spawn(PK.Flame, e.cx + rand(-8, 8), e.cy + rand(-10, 10), 0, -50, 0.35, 4, 1, '#ff7a2a', -60, 1);
  }
  if (e.bleed > 0) {
    e.bleed -= dt;
    if (Math.random() < dt * 8) fx.spawn(PK.Spark, e.cx + rand(-6, 6), e.cy, rand(-20, 20), rand(10, 40), 0.4, 1.5, 0.5, '#c01a2a', 200, 1);
  }
  if (e.dotT < 0.5) return;
  e.dotT = 0;
  const dmg = Math.round(((e.burn > 0 ? e.burnDps : 0) + (e.bleed > 0 ? e.bleedDps : 0)) * 0.5);
  if (dmg <= 0 || e.dying) return;
  e.takeHit({ dmg, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'ability', src: G.world.player, noKnock: true, dot: true });
}

// ---------------------------------------------------------------- aura

/** Power aura drawn behind Elior: faint at level 20, blazing at 100. */
export function drawAura(ctx: Ctx, x: number, y: number, face: number) {
  const tier = powerTier();
  if (tier < 2) return;
  const t = G.time;
  const sov = isSovereign();
  const el = weaponElement();
  const c = sov ? '#ffb347' : el ? ELEMENTS[el].c : '#ffd27a';
  ctx.globalCompositeOperation = 'lighter';
  const a = sov ? 0.5 + Math.sin(t * 6) * 0.1 : 0.12 + tier * 0.05;
  glow(ctx, x, y - 20, 26 + tier * 4, c, a);
  if (sov) {
    // Black-gold flame licking upward, and a crown of light.
    glow(ctx, x, y - 22, 46, '#6a2aff', 0.18 + Math.sin(t * 3) * 0.05);
    ctx.strokeStyle = rgba('#ffe6a8', 0.5 + Math.sin(t * 8) * 0.2);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 16, 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  const rate = sov ? 40 : tier * 3;
  if (Math.random() < rate / 120) {
    fx.spawn(PK.Ember, x + rand(-10, 10), y - rand(0, 34), -face * rand(0, 20), rand(-70, -30), 0.6, sov ? 2 : 1.4, 0.2, sov ? choose(['#ffb347', '#ffe6a8', '#9a6aff']) : c, -20, 1);
  }
  if (sov && Math.random() < 1 / 40) bolt(x + rand(-14, 14), y - rand(30, 44), x + rand(-14, 14), y - rand(0, 12), '#c9a8ff');
}

export function auraLight(x: number, y: number) {
  const tier = powerTier();
  if (tier < 2) return;
  const el = weaponElement();
  lighting.add(x, y - 20, 50 + tier * 8, isSovereign() ? '#ffb347' : el ? ELEMENTS[el].c : '#ffd27a', 0.3 + tier * 0.05, 0.5);
}
