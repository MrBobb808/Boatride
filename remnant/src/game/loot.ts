// Gear rolls shared by the world and arena rewards.
import { ITEMS } from './data';
import type { Loot } from './tiles';
const GEAR_POOL: { id: string; w: number }[] = [
  { id: 'iron_cap', w: 3 }, { id: 'chain_hauberk', w: 3 }, { id: 'bronze_gauntlets', w: 3 }, { id: 'greaves', w: 3 },
  { id: 'copper_ring', w: 3 }, { id: 'ember_lamp', w: 2 }, { id: 'ring_of_vigil', w: 1 }, { id: 'bell_shard', w: 1 },
  { id: 'rusted_greatsword', w: 2 }, { id: 'archer_bracers', w: 1 }, { id: 'watchman_spear', w: 1 }, { id: 'pilgrim_boots', w: 1 },
];

export function rollGear(minBoost = 0): Loot {
  const total = GEAR_POOL.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  let id = GEAR_POOL[0].id;
  for (const g of GEAR_POOL) {
    r -= g.w;
    if (r <= 0) { id = g.id; break; }
  }
  const base = ITEMS[id].rarity;
  const roll = Math.random();
  let boost = roll < 0.6 ? 0 : roll < 0.9 ? 1 : roll < 0.985 ? 2 : 3;
  boost = Math.max(boost, minBoost);
  return { item: id, rarity: Math.min(4, base + boost) };
}
