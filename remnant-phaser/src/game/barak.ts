import { bolt } from '../../../remnant/src/game/power';
import { settings } from '../classic/shim/settings';
import type { Player } from './player';
import type { FoeLike, WorldApi } from './types';

export function barakFrame(clip: string, progress: number) {
  switch (clip) {
    case 'run': case 'swim': return progress < 0.5 ? 1 : 2;
    case 'jump': case 'fall': return 3;
    case 'roll': case 'airdash': return 4;
    case 'jab': return 5;
    case 'arc': case 'cast': case 'invoke': return 6;
    case 'death': case 'hurt': case 'land': case 'block': case 'parry': return 7;
    default: return 0;
  }
}

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
