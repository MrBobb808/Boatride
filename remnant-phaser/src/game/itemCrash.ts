// The Item Crash, in the old castle-hunter way: Up + Sub with ten hearts spends them all at once on the carried
// sub-weapon made great. The Dagger becomes a storm of blades both ways, the Axe a wheel of axes thrown up and over,
// Holy Water a rain of flasks across the whole view, the Cross the Grand Cross (a pillar of light and crosses flying
// out at three heights), and David's Sling the five smooth stones (1 Samuel 17:40, KJV), each finding a foe. The
// projectiles are the shared sub-weapons' own (remnant/src/game/subweapons.ts), so they strike, burn and return as
// they always do; the Crash adds the number, the aim and the moment.
import { G } from '../classic/shim/ctx';
import { sfx } from '../classic/shim/audio';
import { settings } from '../classic/shim/settings';
import { SUBS, SubProj, type SubId } from '../../../remnant/src/game/subweapons';
import { fx } from '../../../remnant/src/render/fx';
import type { WorldApi } from './types';

/** Hearts a Crash costs, whatever the sub-weapon. */
export const CRASH_COST = 10;

const NAMES: Record<SubId, [string, string]> = {
  dagger: ['DAGGER STORM', 'Blades both ways, again and again'],
  axe: ['AXE WHEEL', 'Axes thrown up and over all around'],
  holy_water: ['HOLY FLOOD', 'Holy fire rained across the ground'],
  cross: ['GRAND CROSS', 'A pillar of light, and the crosses fly'],
  sling: ['FIVE SMOOTH STONES', '“chose him five smooth stones out of the brook” · 1 Samuel 17:40 (KJV)'],
};

interface Hero { x: number; y: number; feet: number; face: number; grantInvuln(t: number): void }

/** Crash the carried sub-weapon. False (and nothing spent) without one, or without the hearts. */
export function itemCrash(w: WorldApi, p: Hero): boolean {
  const s = G.save, id = s.sub as SubId | null | undefined;
  if (!id || !SUBS[id]) return false;
  if ((s.hearts ?? 0) < CRASH_COST) { w.toast(`The Item Crash needs ${CRASH_COST} hearts (${s.hearts ?? 0} now).`); sfx('denied'); return false; }
  s.hearts = (s.hearts ?? 0) - CRASH_COST;
  const color = SUBS[id].color, v = w.sc.cameras.main.worldView, hx = p.x, hy = p.y - 24;
  const throwOne = (kind: SubId, x: number, y: number, dir: number, vx?: number, vy?: number) => {
    const sp = new SubProj(kind, x, y, dir);
    if (vx !== undefined) sp.vx = vx;
    if (vy !== undefined) sp.vy = vy;
    G.world.add(sp);
    return sp;
  };
  // The moment: the world held still a breath, light out of him, his name for it.
  p.grantInvuln(0.9);
  w.slowTime(0.6, 0.35);
  w.shake(0.008, 260);
  w.flashLight?.(hx, hy, 220, color, 0.5);
  if (!settings.reduceFlashes) fx.flash(color, 0.25);
  fx.ring(hx, hy, 6, 120, color, 0.5, 4);
  const [name, sub] = NAMES[id];
  w.banner(name, sub);
  sfx('mantleReady', { vol: 0.7 });
  // On the scene's clock, so a pause holds the volleys too.
  const later = (sec: number, fn: () => void) => w.sc.time.delayedCall(sec * 1000, fn);
  switch (id) {
    case 'dagger':
      // Six volleys, both ways, at three heights.
      for (let n = 0; n < 6; n++) later(n * 0.08, () => { for (const dir of [1, -1]) for (const dy of [-12, 0, 12]) throwOne('dagger', p.x + dir * 8, p.y - 24 + dy + (n % 2) * 5, dir); sfx('swing', { vol: 0.4, pitch: 1.6 }); });
      break;
    case 'axe':
      // Ten axes in a fountain, near ones high, far ones long.
      for (let n = 0; n < 10; n++) later(n * 0.06, () => { const dir = n % 2 ? 1 : -1; throwOne('axe', p.x, p.y - 26, dir, dir * (90 + n * 26), -520 - (n % 3) * 90); sfx('swing', { vol: 0.35, pitch: 0.9 }); });
      break;
    case 'holy_water':
      // Seven flasks fall from the top of the view, spread across it, and break into fire.
      for (let n = 0; n < 7; n++) later(0.05 + n * 0.09, () => { const x = v.x + v.width * ((n + 0.5) / 7); throwOne('holy_water', x, v.y + 6, n % 2 ? 1 : -1, 0, 120); });
      break;
    case 'cross':
      // The pillar, then crosses out both ways at three heights; they return as crosses do.
      fx.column(hx, p.feet, 46, 520, '#ffe6a0', 0.9);
      for (let n = 0; n < 3; n++) later(0.12 + n * 0.1, () => { for (const dir of [1, -1]) throwOne('cross', p.x, p.y - 40 + n * 16, dir); sfx('swing', { vol: 0.4, pitch: 1.2 }); });
      break;
    case 'sling': {
      // Five stones, each sent at its own foe (the nearest first), or fanned ahead when there are not five.
      const foes = w.foes().filter((f) => f.alive && !f.removed).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 5);
      for (let n = 0; n < 5; n++) later(n * 0.1, () => {
        const f = foes[n % Math.max(1, foes.length)], sx = p.x + p.face * 8, sy = p.y - 26;
        if (f?.alive) { const dx = f.box.centerX - sx, dy = f.box.centerY - sy, d = Math.hypot(dx, dy) || 1; throwOne('sling', sx, sy, Math.sign(dx) || p.face, (dx / d) * 620, (dy / d) * 620 - 40); }
        else throwOne('sling', sx, sy, p.face, p.face * 560, -160 + n * 60);
        sfx('swing', { vol: 0.45, pitch: 1.1 });
      });
      break;
    }
  }
  return true;
}
