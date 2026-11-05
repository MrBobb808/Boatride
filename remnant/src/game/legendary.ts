// Legendary Powers: build-changing effects carried on gear, one per piece, up to seven worn at once.
// Bosses always drop a legendary piece, elites often, chests sometimes, ordinary foes rarely. Breaking one down
// (a sale or Dov's Dismantle) writes its power into the Codex for good, and Dov imprints a learned power onto
// another piece. The effects themselves are the Phaser build's (remnant-phaser/src/game/legends.ts).
import { ITEMS, ARCHER_SLOTS, type ItemInst, type Rarity } from './data';
import type { SaveData } from './state';
import type { Loot } from './tiles';

export type LegendHero = 'elior' | 'tirzah' | 'both';
export interface Legend { name: string; hero: LegendHero; desc: string; color: string }

export const LEGENDS: Record<string, Legend> = {
  chariot: { name: 'Chariot of Fire', hero: 'elior', color: '#ff9a3a', desc: 'Dodging leaves a road of fire that burns every foe who crosses it.' },
  thunder: { name: 'Voice of Thunder', hero: 'elior', color: '#c9b8ff', desc: 'Critical blows call down lightning that leaps to four more foes.' },
  jericho: { name: 'Trumpet of Jericho', hero: 'elior', color: '#ffe6a8', desc: 'A perfect parry looses a shockwave that hurls back and wounds every foe nearby.' },
  gideon: { name: 'Swords of Gideon', hero: 'elior', color: '#fff1c4', desc: 'A combo\'s finishing blow calls three swords of light that circle you for six seconds, cutting all they touch.' },
  samson: { name: 'Samson\'s Fall', hero: 'elior', color: '#ffb347', desc: 'A plunge brings falling stars down along the floor on either side.' },
  pillar: { name: 'Pillar of Fire', hero: 'elior', color: '#ff7a3a', desc: 'Heavy blows raise a pillar of fire beneath the foe.' },
  whirlwind: { name: 'Whirlwind', hero: 'elior', color: '#9fd8ff', desc: 'Every eighth blow in a chain raises a whirlwind that drags foes in and shreds them.' },
  brimstone: { name: 'Brimstone', hero: 'both', color: '#ff6a3a', desc: 'Foes you slay burst into fire that spreads to those beside them.' },
  hawk_split: { name: 'Quiver of the Hawk', hero: 'tirzah', color: '#a6efdc', desc: 'An arrow that slays splits into three bolts that seek new foes.' },
  falling_star: { name: 'Falling Star', hero: 'tirzah', color: '#fff6dc', desc: 'Charged and perfect arrows burst in a blast of starlight where they strike.' },
  arrow_rain: { name: 'Rain of Arrows', hero: 'tirzah', color: '#ffd27a', desc: 'Every sixth arrow that lands calls a rain of arrows down on its foe.' },
  hawk_spirit: { name: 'Spirit of the Hawk', hero: 'tirzah', color: '#c8f0e4', desc: 'Critical arrows loose a spirit hawk that strikes up to three foes.' },
  wind_volley: { name: 'Wind Volley', hero: 'tirzah', color: '#dff4ff', desc: 'Dodging looses a fan of five arrows of wind behind you.' },
};
export const LEGEND_IDS = Object.keys(LEGENDS);

/** Whose gear a piece is. */
export const gearHero = (id: string): 'elior' | 'tirzah' => ((ARCHER_SLOTS as string[]).includes(ITEMS[id]?.slot) ? 'tirzah' : 'elior');
/** The powers a hero's gear can carry. */
export const legendsFor = (hero: 'elior' | 'tirzah') => LEGEND_IDS.filter((k) => LEGENDS[k].hero === hero || LEGENDS[k].hero === 'both');
export const legendOf = (it: ItemInst | undefined | null) => (it?.legend ? LEGENDS[it.legend] : undefined);

/** How likely each source is to drop a legendary piece. */
export const LEGEND_CHANCE = { boss: 1, elite: 0.35, chest: 0.2, foe: 0.012 } as const;
export type LegendSource = keyof typeof LEGEND_CHANCE;

/** A power for a piece of a hero's gear, leaning toward ones not yet learned. */
export function rollLegend(s: SaveData | null, hero: 'elior' | 'tirzah', random = Math.random) {
  const all = legendsFor(hero), fresh = all.filter((k) => !s?.codex?.includes(k));
  const pool = fresh.length && random() < 0.7 ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** Turn a gear drop into a legendary one: at least Legendary rarity, and a power for its hero. */
export function legendary(s: SaveData | null, l: Loot, random = Math.random): Loot {
  if (!l.item || !ITEMS[l.item]) return l;
  return { ...l, rarity: Math.max(l.rarity ?? ITEMS[l.item].rarity, 4) as Rarity, legend: rollLegend(s, gearHero(l.item), random) };
}

/** The powers of the gear a hero wears (one per piece), into `out`. */
export function wornLegends(s: SaveData, hero: 'elior' | 'tirzah', out: Set<string>) {
  out.clear();
  const eq: Partial<Record<string, string>> = hero === 'tirzah' ? s.archer?.equipment ?? {} : s.equipment;
  for (const uid of Object.values(eq)) {
    if (!uid) continue;
    const it = s.inventory.find((i) => i.uid === uid);
    const l = it?.legend && LEGENDS[it.legend];
    if (l && (l.hero === hero || l.hero === 'both')) out.add(it.legend!);
  }
  return out;
}

/** Breaking a legendary piece down writes its power into the Codex. True when it is new there. */
export function learnLegend(s: SaveData, it: ItemInst) {
  if (!it.legend || !LEGENDS[it.legend]) return false;
  s.codex ??= [];
  if (s.codex.includes(it.legend)) return false;
  s.codex.push(it.legend);
  return true;
}

/** What Dov asks to imprint a learned power onto a piece. */
export function imprintCost(it: ItemInst) {
  return { silver: 400 + it.rarity * 250 + it.plus * 100, shards: 2 + Math.max(0, it.rarity - 2) };
}
/** The pieces a learned power can go onto: the hero's gear that does not already carry it. */
export function imprintable(s: SaveData, id: string) {
  const l = LEGENDS[id];
  if (!l) return [];
  return s.inventory.filter((it) => {
    const base = ITEMS[it.id];
    if (!base || ['material', 'key', 'consumable'].includes(base.slot) || it.legend === id) return false;
    const hero = gearHero(it.id);
    return l.hero === 'both' || l.hero === hero;
  });
}
export function imprint(s: SaveData, it: ItemInst, id: string, shardKey: string) {
  const c = imprintCost(it);
  if (!s.codex?.includes(id) || !imprintable(s, id).includes(it) || s.silver < c.silver || (s.materials[shardKey] ?? 0) < c.shards) return false;
  s.silver -= c.silver;
  s.materials[shardKey] -= c.shards;
  it.legend = id;
  return true;
}
