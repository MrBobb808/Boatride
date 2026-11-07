// The Ascension tree and the relics (POLISH_PLAN §18m): what outlasts every Ascension besides the Seals' own strength.
// Seals buy ranks in a small tree of three branches (the Blade, the Wall, the Wealth), each a few plain steps and a
// capstone that changes how a watch goes. A Seal spent keeps its strength: the tree is a choice of where the Seals point,
// never a cost to the wall, and the tree can be cleared for free to choose again. Relics drop from gate holders, one
// kind for each of the eight places, and rise in rank as they drop again; he wears a few at a time. Pure numbers and the
// save (type-only import from defs, so no import cycle); the stats fold the bonuses in (defs.ts watchStats).
import type { WatchSave } from './defs';

// ---------------------------------------------------------------- the tree

export type Branch = 'blade' | 'wall' | 'wealth';
export type NodeId = 'edge' | 'keen' | 'oath' | 'stone' | 'mend' | 'reliquary' | 'tithe' | 'vigil' | 'march';
export interface TreeNode {
  id: NodeId; branch: Branch; name: string;
  /** What one rank gives (the card's line), and the highest rank. */
  per: string; max: number;
  /** Seals for rank r+1: base + step × r. */
  base: number; step: number;
  /** The rank of another node that opens it. */
  needs?: [NodeId, number];
}
export const BRANCHES: Record<Branch, { name: string; line: string }> = {
  blade: { name: 'The Blade', line: 'Harder blows, and the gates fall' },
  wall: { name: 'The Wall', line: 'He stands longer, and wears more relics' },
  wealth: { name: 'The Wealth', line: 'More coins, longer away, a running start' },
};
// Prerequisites come before the nodes they open (migrate checks in this order).
export const NODES: TreeNode[] = [
  { id: 'edge', branch: 'blade', name: 'Whetted Edge', per: '+8% blows', max: 10, base: 1, step: 1 },
  { id: 'keen', branch: 'blade', name: 'Keen Eye', per: '+1% critical chance (past its cap)', max: 10, base: 2, step: 1, needs: ['edge', 3] },
  { id: 'oath', branch: 'blade', name: "Gatebreaker's Oath", per: '+25% against gate holders · +3 s on their clock', max: 4, base: 4, step: 2, needs: ['keen', 3] },
  { id: 'stone', branch: 'wall', name: 'Living Stone', per: '+10% health', max: 10, base: 1, step: 1 },
  { id: 'mend', branch: 'wall', name: 'Quiet Mending', per: '+0.3% health a second (past its cap)', max: 5, base: 2, step: 1, needs: ['stone', 3] },
  { id: 'reliquary', branch: 'wall', name: 'The Reliquary', per: 'one more relic worn', max: 2, base: 8, step: 8, needs: ['mend', 2] },
  { id: 'tithe', branch: 'wealth', name: 'Tithe of the Wall', per: '+8% coins', max: 10, base: 1, step: 1 },
  { id: 'vigil', branch: 'wealth', name: 'The Long Vigil', per: '+1 hour counted away', max: 6, base: 2, step: 1, needs: ['tithe', 3] },
  { id: 'march', branch: 'wealth', name: 'Forced March', per: 'each new watch begins 10 stages on', max: 4, base: 6, step: 4, needs: ['vigil', 2] },
];
export const NODE: Record<NodeId, TreeNode> = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, TreeNode>;

export const rankOf = (w: WatchSave, id: NodeId) => w.tree?.[id] ?? 0;
/** Seals for the next rank (from `rank`). */
export const nodeCost = (id: NodeId, rank: number) => NODE[id].base + NODE[id].step * rank;
/** Seals in the tree now (the sum of every rank's price). */
export function spent(w: WatchSave) {
  let s = 0;
  for (const n of NODES) for (let r = 0; r < rankOf(w, n.id); r++) s += nodeCost(n.id, r);
  return s;
}
/** Seals not yet in the tree. Every Seal keeps its strength either way (defs.ts sealBonus counts them all). */
export const sealsFree = (w: WatchSave) => Math.max(0, w.seals - spent(w));
/** Why a rank cannot be bought now, or null when it can. */
export function blocked(w: WatchSave, id: NodeId): 'max' | 'locked' | 'seals' | null {
  const n = NODE[id], r = rankOf(w, id);
  if (r >= n.max) return 'max';
  if (n.needs && rankOf(w, n.needs[0]) < n.needs[1]) return 'locked';
  return nodeCost(id, r) > sealsFree(w) ? 'seals' : null;
}
export function buyNode(w: WatchSave, id: NodeId) {
  if (blocked(w, id)) return false;
  (w.tree ??= {})[id] = rankOf(w, id) + 1;
  return true;
}
/** What a node gives at rank `r`, in all (the card's line). */
export function nodeSays(id: NodeId, r: number): string {
  switch (id) {
    case 'edge': return `+${8 * r}% blows`;
    case 'keen': return `+${r}% critical chance`;
    case 'oath': return `+${25 * r}% against holders · +${3 * r} s`;
    case 'stone': return `+${10 * r}% health`;
    case 'mend': return `+${(0.3 * r).toFixed(1)}% health a second`;
    case 'reliquary': return `${2 + r} relics worn`;
    case 'tithe': return `+${8 * r}% coins`;
    case 'vigil': return `${12 + r} hours counted away`;
    case 'march': return `each watch begins at stage ${1 + 10 * r}`;
  }
}
/** Clear the tree; every Seal comes back to be placed again. */
export function resetTree(w: WatchSave) { const s = spent(w); w.tree = {}; return s; }

// ---------------------------------------------------------------- relics

export type RelicId = 'lantern' | 'horn' | 'amulet' | 'bell' | 'censer' | 'eye' | 'crown' | 'key';
export interface Relic { id: RelicId; name: string; /** What one rank gives. */ per: string; /** The place whose holder carries it. */ place: string; d: string; c: string }
/** One for each of the eight places, in their order (gate 1's holder carries the first; gate 9's the first again). */
export const RELICS: Relic[] = [
  { id: 'lantern', name: 'Grave Lantern', per: '+10% coins', place: 'The Restless Graves', d: 'M9 3h6M10 3v3M14 3v3M7 6h10l-1 12H8zM12 10v4M9 21h6', c: '#ffc94d' },
  { id: 'horn', name: "Hunter's Horn", per: '+8% blows', place: 'The Autumn Wood', d: 'M4 8c6 0 10 2 16 8l-3 3C12 14 8 12 4 12zM4 8v4', c: '#ff8a5c' },
  { id: 'amulet', name: 'Mire Amulet', per: '+10% health', place: 'The Drowned Mire', d: 'M8 3l4 5 4-5M12 8a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 11v6M9 14h6', c: '#3ee6aa' },
  { id: 'bell', name: 'Night Bell', per: 'abilities 5% sooner', place: 'The Town at Dusk', d: 'M12 3a6 6 0 0 0-6 6v5l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 20a2 2 0 0 0 4 0', c: '#5ccbff' },
  { id: 'censer', name: 'Censer of the Nave', per: '+20% against gate holders', place: 'The Fallen Nave', d: 'M12 2v4M6 10h12l-2 7H8zM9 17l-1 4h8l-1-4M10 6c0 1.5 4 1.5 4 0', c: '#ff5f8a' },
  { id: 'eye', name: "Sleeper's Eye", per: '+2% critical chance', place: 'The Sleeping Town', d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', c: '#ffd76b' },
  { id: 'crown', name: 'Broken Crown', per: '+20% critical damage', place: 'The Broken Quarter', d: 'M3 18h18M4 18l-1-10 5 4 4-7 4 7 5-4-1 10M10 9l2 3', c: '#ff8d3c' },
  { id: 'key', name: 'Key of the Depths', per: 'shadows strike 12% harder', place: 'The Castle Depths', d: 'M8 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h9M18 12v3M21 12v2', c: '#b08cff' },
];
export const RELIC: Record<RelicId, Relic> = Object.fromEntries(RELICS.map((r) => [r.id, r])) as Record<RelicId, Relic>;
export const RELIC_MAX = 5;
/** A holder's fall drops its relic one time in four; after five falls without one, the sixth always does (a pity, shown
 * in the Hero tab, as the idle-economy skill asks for any chance a player waits on). */
export const RELIC_CHANCE = 0.25, RELIC_PITY = 6;
export const relicOfGate = (gate: number) => RELICS[(gate - 1) % RELICS.length];
export const relicRank = (w: WatchSave, id: RelicId) => w.relics?.[id] ?? 0;
/** How many he wears: two, and the Reliquary's ranks. */
export const relicSlots = (w: WatchSave) => 2 + rankOf(w, 'reliquary');
export const worn = (w: WatchSave) => (w.worn ?? []).filter((id) => relicRank(w, id) > 0).slice(0, relicSlots(w));

export interface RelicDrop { relic: Relic; rank: number; first: boolean; wornNow: boolean }
/** A gate holder fell: roll its relic (`rnd` in 0–1). A relic at its height drops nothing and leaves the pity as it is. */
export function rollRelic(w: WatchSave, gate: number, rnd: number): RelicDrop | null {
  const relic = relicOfGate(gate), rank = relicRank(w, relic.id);
  if (rank >= RELIC_MAX) return null;
  const pity = (w.relicPity ?? 0) + 1;
  if (rnd >= RELIC_CHANCE && pity < RELIC_PITY) { w.relicPity = pity; return null; }
  w.relicPity = 0;
  (w.relics ??= {})[relic.id] = rank + 1;
  // A first relic goes on by itself while a slot is free.
  const on = (w.worn ??= []);
  let wornNow = false;
  if (!rank && !on.includes(relic.id) && worn(w).length < relicSlots(w)) { on.push(relic.id); wornNow = true; }
  return { relic, rank: rank + 1, first: !rank, wornNow };
}
/** What a relic gives at rank `r`. */
export function relicSays(id: RelicId, r: number): string {
  switch (id) {
    case 'lantern': return `+${10 * r}% coins`;
    case 'horn': return `+${8 * r}% blows`;
    case 'amulet': return `+${10 * r}% health`;
    case 'bell': return `abilities ${5 * r}% sooner`;
    case 'censer': return `+${20 * r}% against holders`;
    case 'eye': return `+${2 * r}% critical chance`;
    case 'crown': return `+${20 * r}% critical damage`;
    case 'key': return `shadows +${12 * r}%`;
  }
}
/** Put a relic on, or take it off. False when it is not his, or every slot is full. */
export function toggleRelic(w: WatchSave, id: RelicId) {
  const on = (w.worn = worn(w));
  const i = on.indexOf(id);
  if (i >= 0) { on.splice(i, 1); return true; }
  if (relicRank(w, id) <= 0 || on.length >= relicSlots(w)) return false;
  on.push(id);
  return true;
}

// ---------------------------------------------------------------- what they add

export interface AscendBonus {
  /** Multipliers on his blows, health and coins. */
  atk: number; hp: number; coins: number;
  /** Added to critical chance (past the track's cap), critical damage, and regeneration (a share a second, past its cap). */
  crit: number; critDmg: number; regen: number;
  /** Multipliers against gate holders, on the abilities' waits, and on the shadows' blows. */
  holder: number; cd: number; shadow: number;
  /** Seconds added to a holder's clock, hours added to the time counted away, and the stage a new watch begins at. */
  bossTime: number; awayHours: number; start: number;
}
export function ascendBonus(w: WatchSave): AscendBonus {
  const t = (id: NodeId) => rankOf(w, id), b: AscendBonus = {
    atk: 1 + 0.08 * t('edge'), hp: 1 + 0.1 * t('stone'), coins: 1 + 0.08 * t('tithe'),
    crit: 0.01 * t('keen'), critDmg: 0, regen: 0.003 * t('mend'),
    holder: 1 + 0.25 * t('oath'), cd: 1, shadow: 1,
    bossTime: 3 * t('oath'), awayHours: t('vigil'), start: 1 + 10 * t('march'),
  };
  for (const id of worn(w)) {
    const r = relicRank(w, id);
    switch (id) {
      case 'lantern': b.coins *= 1 + 0.1 * r; break;
      case 'horn': b.atk *= 1 + 0.08 * r; break;
      case 'amulet': b.hp *= 1 + 0.1 * r; break;
      case 'bell': b.cd *= 1 - 0.05 * r; break;
      case 'censer': b.holder *= 1 + 0.2 * r; break;
      case 'eye': b.crit += 0.02 * r; break;
      case 'crown': b.critDmg += 0.2 * r; break;
      case 'key': b.shadow *= 1 + 0.12 * r; break;
    }
  }
  return b;
}

/** Repair the tree and the relics (the save-systems and idle-economy skills: repair, never refuse). Unknown ids go,
 * ranks are whole and within their height, a rank whose way in is gone goes with it, and a tree that costs more Seals
 * than he has is cleared (its Seals come back). */
export function migrateAscension(w: WatchSave) {
  const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  if (w.tree !== undefined) {
    const old = w.tree && typeof w.tree === 'object' ? w.tree : {};
    w.tree = {};
    for (const n of NODES) {
      const r = whole(old[n.id], n.max);
      if (r && (!n.needs || rankOf(w, n.needs[0]) >= n.needs[1])) w.tree[n.id] = r;
    }
    if (spent(w) > w.seals) w.tree = {};
  }
  if (w.relics !== undefined) {
    const old = w.relics && typeof w.relics === 'object' ? w.relics : {};
    w.relics = {};
    for (const r of RELICS) { const k = whole(old[r.id], RELIC_MAX); if (k) w.relics[r.id] = k; }
  }
  if (w.worn !== undefined) w.worn = Array.isArray(w.worn) ? [...new Set(w.worn.filter((id): id is RelicId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(RELIC, id)))].filter((id) => relicRank(w, id) > 0).slice(0, relicSlots(w)) : [];
  if (w.relicPity !== undefined) w.relicPity = whole(w.relicPity, RELIC_PITY - 1);
}
