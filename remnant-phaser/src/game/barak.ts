import { fx } from '../../../remnant/src/render/fx';
import { bolt } from '../../../remnant/src/game/power';
import { settings } from '../classic/shim/settings';
import type { Player } from './player';
import type { FoeLike, WorldApi } from './types';
export { barakFrame } from './barakArt';

/** A jab finds one foe at arm's length. The heavier discharge can leap twice,
 * choosing the nearest visible foe from the last impact on each hop. */
export function discharge(w: WorldApi, p: Player, heavy: boolean) {
  const targets = w.foes().slice();
  const hit = new Set<FoeLike>();
  let x = p.x, y = p.feet - 25;
  let power = p.power() * (heavy ? 1.35 : 0.85);
  const range = heavy ? 104 : 42;
  w.strikeLamps({ x: p.face > 0 ? x : x - 32, y: y - 10, w: 32, h: 26 });
  w.playEffect(heavy ? 'thunder' : 'swing', { vol: heavy ? 0.45 : 0.65 });
  for (let hop = 0; hop < (heavy ? 3 : 1); hop++) {
    let next: FoeLike | undefined, distance = hop ? 84 : range;
    for (const f of targets) {
      const phase = f as FoeLike & { fighting?: boolean; ward?: boolean };
      if (!f.alive || f.removed || phase.ward || phase.fighting === false || hit.has(f)) continue;
      const box = f.box;
      const bx = Math.max(box.left, Math.min(x, box.right));
      const by = Math.max(box.top, Math.min(y, box.bottom));
      if (!hop && (bx - x) * p.face < -6) continue;
      const d = Math.hypot(bx - x, by - y);
      if (d <= distance && p.lineOfSight(bx, by, x, y)) { next = f; distance = d; }
    }
    if (!next) break;
    const bx = next.box.centerX, by = next.box.centerY;
    const damage = Math.max(1, Math.round(power)), dir = Math.sign(bx - x) || p.face;
    const before = next.hp;
    if (!next.hit(damage, dir, 0.35, false, { poise: heavy ? 17 : 9 })) break;
    if (!settings.reduceFlashes) bolt(x, y, bx, by, '#88dfff');
    else w.spark(bx, by, 0x88dfff, 3);
    hit.add(next);
    const dealt = before !== undefined && next.hp !== undefined ? Math.max(0, before - next.hp) : damage;
    w.heroHit(next, dealt, heavy);
    w.legends?.onHit(next, { heavy, crit: false, ender: false });
    x = bx; y = by; power *= 0.65;
  }
  return hit.size;
}

export type StormMove = import('./abilities').StormSkill | 'skybreaker';
type Impact = StormMove | 'dash' | 'guard';
const STORM = {
  piercing_current: { range: 42, power: 2.8, forward: true },
  forked_spear: { range: 230, power: 2.1, forward: true },
  thunderclap: { range: 92, power: 1.9, forward: false },
  skybreaker: { range: 240, power: 2.5, forward: false },
  dash: { range: 29, power: 0.55, forward: false },
  guard: { range: 65, power: 1.4, forward: false },
} as const;

/** A rush may overlap a foe for several frames. Each pulse owns its hit set. */
export function stormHit(w: WorldApi, p: Player, move: Impact, hit: Set<FoeLike>) {
  const spec = STORM[move], x = p.x, y = p.y;
  const sustained = move === 'dash' || move === 'piercing_current';
  if (!sustained) {
    w.playEffect('thunder', { vol: move === 'skybreaker' ? 0.7 : 0.45 });
    w.spark(x, y, 0x81deff, settings.reduceFlashes ? 3 : 10);
    if (move === 'thunderclap' || move === 'guard') fx.ring(x, y, 6, spec.range, '#96ddff', 0.25, settings.reduceFlashes ? 1 : 3);
    if (move === 'forked_spear' && !settings.reduceFlashes) {
      let reach = 0;
      while (reach + 6 <= spec.range && p.lineOfSight(x + p.face * (reach + 6), y)) reach += 6;
      bolt(x, y, x + p.face * reach, y, '#99dcff');
    }
  }
  for (const f of w.foes().slice()) {
    if (!f.alive || f.removed || hit.has(f)) continue;
    const b = f.box, bx = Math.max(b.left, Math.min(x, b.right)), by = Math.max(b.top, Math.min(y, b.bottom));
    if (Math.hypot(bx-x, by-y) > spec.range || !p.lineOfSight(bx, by)) continue;
    if (spec.forward && ((bx-x)*p.face < -3 || Math.abs(by-y) > 25)) continue;
    const dir = Math.sign(b.centerX-x) || p.face, damage = Math.max(1, Math.round(p.power()*spec.power));
    const before = f.hp;
    if (!f.hit(damage, dir, move === 'thunderclap' ? 2 : 0.6, false, { guardBreak: move === 'thunderclap', poise: sustained ? 14 : 38 })) continue;
    hit.add(f);
    if (!settings.reduceFlashes) bolt(move === 'skybreaker' ? b.centerX : x, move === 'skybreaker' ? by-110 : y, b.centerX, b.centerY, '#8acfff');
    w.heroHit(f, before !== undefined && f.hp !== undefined ? Math.max(0, before-f.hp) : damage, !sustained);
  }
}
