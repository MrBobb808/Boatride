// Reforging (NEXT_PLAN C3): Dov re-rolls one rolled line of a piece of gear within that line's own range, for silver
// and Relic Shards. He never makes a line worse: the better of the old value and the new is kept, and the chance of a
// better one is shown before the player pays. Pure numbers and the save; the pane is in ui/menus.ts.
import { AFFIX_POOL, type ItemInst, type ModKey } from './data';
import type { SaveData } from './state';

export const REFORGE_SHARD = 'relic_dust';
const pool = (key: ModKey) => AFFIX_POOL.find((a) => a.key === key);
/** The range a line can roll on this piece (the same rule makeItem rolls by). */
export function lineRange(it: ItemInst, key: ModKey): { lo: number; hi: number } | null {
  const a = pool(key);
  if (!a) return null;
  const k = 1 + it.rarity * 0.15;
  return { lo: Math.round(a.min * k), hi: Math.round(a.max * k) };
}
/** Where a line sits in its range, 0–1 (a line above its range, from older loot, reads as full). */
export function lineAt(it: ItemInst, i: number) {
  const a = it.affixes[i], r = a && lineRange(it, a.key);
  if (!a || !r) return 1;
  return r.hi <= r.lo ? 1 : Math.max(0, Math.min(1, (a.v - r.lo) / (r.hi - r.lo)));
}
/** The chance a reforge betters this line: the share of its range above where it stands. */
export function betterChance(it: ItemInst, i: number) {
  const a = it.affixes[i], r = a && lineRange(it, a.key);
  if (!a || !r || a.v >= r.hi) return 0;
  return (r.hi - Math.max(a.v, r.lo - 1)) / (r.hi - r.lo + 1);
}
export const reforgeCost = (it: ItemInst) => ({ silver: 120 * (it.rarity + 1), shards: it.rarity >= 3 ? 2 : 1 });
export const canReforge = (s: SaveData, it: ItemInst, i: number) => {
  const c = reforgeCost(it);
  return betterChance(it, i) > 0 && s.silver >= c.silver && (s.materials[REFORGE_SHARD] ?? 0) >= c.shards;
};
/** Reforge line `i`. Returns the old and new values (equal when the roll was no better), or null if it cannot be done. */
export function reforge(s: SaveData, it: ItemInst, i: number, random: () => number = Math.random): { was: number; now: number } | null {
  if (!canReforge(s, it, i)) return null;
  const a = it.affixes[i], r = lineRange(it, a.key)!, c = reforgeCost(it);
  s.silver -= c.silver;
  s.materials[REFORGE_SHARD] = (s.materials[REFORGE_SHARD] ?? 0) - c.shards;
  const roll = r.lo + Math.floor(Math.min(0.999999, Math.max(0, random())) * (r.hi - r.lo + 1)), was = a.v;
  a.v = Math.max(was, roll);
  return { was, now: a.v };
}
