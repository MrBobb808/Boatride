// Uri's own journey: a level and XP of his own (the optional PhaserSave.uri), earned in the Horde. He has no gear
// yet, so his numbers are Elior's measured by how far each has come: behind Elior he is weaker, and he learns
// faster until he catches up.
import { xpToNext } from '../../../../remnant/src/game/data';
import type { Derived } from '../../../../remnant/src/game/state';
import type { PhaserSave } from '../save';

export interface UriSave { level: number; xp: number }

export const uriOf = (s: PhaserSave): UriSave => (s.uri ??= { level: 1, xp: 0 });

/** His strength: Elior's, scaled by their levels (from 0.6× far behind him to 1.3× ahead), with a mage's keener eye. */
export function uriStats(s: PhaserSave, elior: Derived): Derived {
  const u = uriOf(s), f = Math.min(1.3, Math.max(0.6, (u.level + 4) / (s.level + 4)));
  return { ...elior, atk: elior.atk * f, maxHp: Math.round(elior.maxHp * (0.7 + 0.3 * f)), crit: Math.min(0.75, elior.crit + 0.04) };
}

/** XP for Uri, three times over while he is behind Elior. Returns the levels he gained. */
export function uriGainXp(s: PhaserSave, amount: number) {
  const u = uriOf(s);
  if (!(amount > 0)) return 0;
  let levels = 0;
  u.xp += Math.round(amount * (u.level < s.level ? 3 : 1));
  while (u.xp >= xpToNext(u.level)) { u.xp -= xpToNext(u.level); u.level++; levels++; }
  return levels;
}
