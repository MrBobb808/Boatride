// Tirzah's own progression: her level and experience, stat and skill points, her
// skill tree and her own set of gear (bow, quiver, dagger, hood, garb, amulet,
// charm). It lives in `save.archer` (the shared ArcherSave); her items share
// the inventory, but only her slots take them. Her numbers come from the
// original's derive() over a view of the save holding her level, stats and
// gear, then her tree. Covenant-wide numbers (Echo slots and strength, prices)
// stay Elior's.

import {
  derive, makeItem, itemMods, getItem, type SaveData, type Derived, type ArcherSave,
} from '../../../remnant/src/game/state';
import { ITEMS, STAT_KEYS, ARCHER_SLOTS, xpToNext, type ArcherSlot, type Rarity, type StatKey, type ModKey, type Slot } from '../../../remnant/src/game/data';
import type { Loot } from '../../../remnant/src/game/tiles';
import type { PhaserSave } from './save';

// ---------------------------------------------------------------- the skill tree

export type ArcherTreeId = 'marksman' | 'huntress' | 'warden';
export interface ArcherNode { id: string; tree: ArcherTreeId; name: string; desc: string; ranks: number; cost: number; req: string[]; row: number; col: number; icon: string }
export const ARCHER_TREES: { id: ArcherTreeId; name: string; blurb: string; color: string }[] = [
  { id: 'marksman', name: 'Marksman', blurb: 'The bow: draw, aim and critical shots.', color: '#e6a15a' },
  { id: 'huntress', name: 'Huntress', blurb: 'The dagger, speed and the Wings of the Dawn.', color: '#c48cff' },
  { id: 'warden', name: 'Warden', blurb: 'Endurance, Recall and her abilities.', color: '#7fb3e8' },
];
export const ARCHER_NODES: ArcherNode[] = [
  { id: 't_draw', tree: 'marksman', name: 'Steady Draw', desc: 'Every arrow and blade: +8% damage per rank. Up to 25 ranks.', ranks: 25, cost: 1, req: [], row: 0, col: 1, icon: 'bow' },
  { id: 't_sight', tree: 'marksman', name: 'Long Sight', desc: 'True Aim reaches from 90 to 270 px, and its bonus rises from ×1.25 to ×1.45.', ranks: 1, cost: 1, req: ['t_draw'], row: 1, col: 0, icon: 'target' },
  { id: 't_keen', tree: 'marksman', name: "Hawk's Eye", desc: '+3% critical chance and +10% critical damage per rank. Up to 10 ranks.', ranks: 10, cost: 1, req: ['t_draw'], row: 1, col: 2, icon: 'feather' },
  { id: 't_perfect', tree: 'marksman', name: 'Patient String', desc: 'The Perfect Draw window is half again as wide, and a Perfect shot pierces one more foe.', ranks: 1, cost: 2, req: ['t_sight'], row: 2, col: 0, icon: 'arc' },
  { id: 't_heads', tree: 'marksman', name: 'Headhunter', desc: 'Precision shots to the head deal +35% damage and break more poise.', ranks: 1, cost: 2, req: ['t_keen'], row: 2, col: 2, icon: 'crown' },
  { id: 't_twin', tree: 'marksman', name: 'Twin String', desc: 'A fully charged shot looses a second arrow just behind the first.', ranks: 1, cost: 3, req: ['t_perfect', 't_heads'], row: 3, col: 1, icon: 'quiver' },

  { id: 't_blade', tree: 'huntress', name: 'Keen Dagger', desc: 'Her dagger and bow-bash: +10% damage per rank. Up to 20 ranks.', ranks: 20, cost: 1, req: [], row: 0, col: 1, icon: 'dagger' },
  { id: 't_fleet', tree: 'huntress', name: 'Fleet-Footed', desc: '+4% move speed per rank. Up to 5 ranks.', ranks: 5, cost: 1, req: ['t_blade'], row: 1, col: 0, icon: 'boot' },
  { id: 't_wings', tree: 'huntress', name: 'Dawn Wings', desc: 'The Wings of the Dawn last 1.5 s longer per rank. Up to 4 ranks.', ranks: 4, cost: 1, req: ['t_blade'], row: 1, col: 2, icon: 'mantle' },
  { id: 't_shadow', tree: 'huntress', name: 'Shadowstep', desc: 'A shot loosed within 0.6 s of a dodge is always a critical hit.', ranks: 1, cost: 2, req: ['t_fleet'], row: 2, col: 0, icon: 'dodge' },
  { id: 't_jab', tree: 'huntress', name: 'Dawn Jab', desc: 'The Wings jab hits 40% harder and fells non-boss foes below 55% health (from 40%).', ranks: 1, cost: 2, req: ['t_wings'], row: 2, col: 2, icon: 'spear' },
  { id: 't_huntress', tree: 'huntress', name: 'Night Huntress', desc: 'Under the Wings, +15% critical chance; a jab that fells its foe gives back 15% of the gauge.', ranks: 1, cost: 3, req: ['t_shadow', 't_jab'], row: 3, col: 1, icon: 'heart' },

  { id: 't_vigor', tree: 'warden', name: 'Vigor', desc: '+4% maximum health per rank. Up to 10 ranks.', ranks: 10, cost: 1, req: [], row: 0, col: 0, icon: 'heal' },
  { id: 't_hide', tree: 'warden', name: 'Tanned Hide', desc: 'Each rank reduces remaining incoming damage by 5%. Up to 15 ranks.', ranks: 15, cost: 1, req: [], row: 0, col: 1, icon: 'armor' },
  { id: 't_recall', tree: 'warden', name: 'Swift Recall', desc: 'Recalled arrows deal +60% damage, and each one home mends 1% of her health.', ranks: 1, cost: 1, req: ['t_hide'], row: 1, col: 0, icon: 'recall' },
  { id: 't_focus', tree: 'warden', name: 'Quiet Focus', desc: '+6% ability power and +10 energy per rank. Up to 10 ranks.', ranks: 10, cost: 1, req: ['t_hide'], row: 1, col: 2, icon: 'lamp' },
  { id: 't_deep', tree: 'warden', name: 'Deep Quiver', desc: 'Her abilities recharge 15% faster.', ranks: 1, cost: 2, req: ['t_recall'], row: 2, col: 0, icon: 'quiver' },
  { id: 't_fletch', tree: 'warden', name: 'Elemental Fletching', desc: 'Fire, frost, storm and holy arrows deal +25% damage.', ranks: 1, cost: 2, req: ['t_focus'], row: 2, col: 2, icon: 'flask' },
  { id: 't_covenant', tree: 'warden', name: 'Covenant Archer', desc: 'Her abilities cost 25% less energy, and their arrows deal +30% damage.', ranks: 1, cost: 3, req: ['t_deep', 't_fletch'], row: 3, col: 1, icon: 'sigil' },
];
const NODE = new Map(ARCHER_NODES.map((n) => [n.id, n]));

/** Her rank in a tree node (0 when she has none). */
export const trank = (s: SaveData, id: string) => s.archer?.skills[id] ?? 0;

export function canLearnArcher(s: SaveData, id: string) {
  const a = s.archer, n = NODE.get(id);
  if (!a || !n || trank(s, id) >= n.ranks || a.skillPoints < n.cost) return false;
  // Capstones need both prerequisites; others need either.
  return !n.req.length || (n.row === 3 ? n.req.every((r) => trank(s, r) > 0) : n.req.some((r) => trank(s, r) > 0));
}
export function learnArcher(s: SaveData, id: string, requested = 1) {
  let n = 0;
  while (n < Math.min(50, requested) && canLearnArcher(s, id)) {
    s.archer!.skillPoints -= NODE.get(id)!.cost;
    s.archer!.skills[id] = trank(s, id) + 1;
    n++;
  }
  return n;
}
export function allocateArcher(s: SaveData, key: StatKey, requested = 1) {
  const a = s.archer;
  if (!a || !STAT_KEYS.includes(key)) return 0;
  const n = Math.min(Math.max(0, Math.floor(requested)), Math.floor(a.statPoints));
  a.stats[key] += n; a.statPoints -= n;
  return n;
}

// ---------------------------------------------------------------- level and experience

/** The level of the hero in play: hers while she fights, else Elior's. */
export const heroLevel = (s: SaveData) => (s as PhaserSave).playableHero === 'tirzah' ? archerLevel(s) : s.level;
export const archerLevel = (s: SaveData) => s.archer?.level ?? s.level;

/** Her experience: +3 stat points and +1 skill point a level, as Elior's. Returns the levels gained. */
export function archerGainXp(s: SaveData, amount: number) {
  const a = s.archer;
  if (!a || !(amount > 0)) return 0;
  let levels = 0;
  a.xp += amount;
  while (a.xp >= xpToNext(a.level)) { a.xp -= xpToNext(a.level); a.level++; a.statPoints += 3; a.skillPoints += 1; levels++; }
  return levels;
}

// ---------------------------------------------------------------- her numbers

/** Her stats: the original's derive() over her level, stats and gear, then her tree. */
export function archerStats(s: SaveData, elior: Derived): Derived {
  const a = s.archer;
  if (!a) return elior;
  // No weapon mastery and none of Elior's tree: her own tree is applied below.
  const d = derive({ ...s, level: a.level, xp: a.xp, stats: a.stats, skills: {}, equipment: a.equipment, weaponMastery: {} });
  const r = (id: string) => a.skills[id] ?? 0;
  d.meleeMult *= 1 + r('t_draw') * 0.08;
  d.crit = Math.min(0.75, d.crit + r('t_keen') * 0.03);
  d.critDmg += r('t_keen') * 0.1;
  d.speed *= 1 + r('t_fleet') * 0.04;
  d.maxHp = Math.round(d.maxHp * (1 + r('t_vigor') * 0.04));
  d.dr = Math.min(0.9, 1 - (1 - d.dr) * Math.pow(0.95, r('t_hide')));
  d.abil += r('t_focus') * 0.06;
  d.maxCe += r('t_focus') * 10;
  d.skillRecharge *= r('t_deep') ? 1.15 : 1;
  // The covenant's numbers stay Elior's: they belong to the Echoes and the store.
  d.echoSlots = elior.echoSlots; d.echoDmg = elior.echoDmg; d.echoHp = elior.echoHp;
  d.rallyMult = Math.max(d.rallyMult, elior.rallyMult);
  d.barter = elior.barter; d.salvage = elior.salvage;
  return d;
}

/** Her bow's element, if it has one (an arrow type nocked takes precedence). */
export function bowElement(s: SaveData) {
  const bow = getItem(s, s.archer?.equipment.bow);
  return bow ? ITEMS[bow.id].element ?? null : null;
}

// ---------------------------------------------------------------- her gear

const STARTER: Record<ArcherSlot, string | null> = { bow: 'hunters_bow', quiver: 'quiver_hide', dagger: 'flint_knife', hood: 'hood_wool', garb: 'garb_leather', amulet: null, charm: 'charm_arrowhead' };
/** For a journey already under way, her kit matches the main stat of what Elior wears in the slot it echoes. */
const MATCH: Partial<Record<ArcherSlot, [Slot, ModKey, string]>> = {
  bow: ['weapon', 'atk', 'hunters_bow'], hood: ['helm', 'def', 'hood_wool'], garb: ['armor', 'hp', 'garb_leather'],
  quiver: ['gauntlets', 'atk', 'quiver_fletcher'], amulet: ['relic', 'ce', 'amulet_feather'], charm: ['ring', 'hp', 'charm_arrowhead'],
};

/** A fresh Tirzah at Elior's level: his stats as allocated, a skill point for every level, and a kit that keeps up. */
export function newArcher(s: SaveData): ArcherSave {
  const a: ArcherSave = { level: Math.max(1, s.level), xp: 0, statPoints: Math.max(0, Math.floor(s.statPoints)), skillPoints: Math.max(0, s.level - 1), stats: { ...s.stats }, skills: {}, equipment: {} };
  for (const slot of ARCHER_SLOTS) {
    // A new journey starts plain; one under way matches what he wears.
    const m = MATCH[slot], his = m && s.level > 1 ? getItem(s, s.equipment[m[0]]) : undefined;
    const id = his && m ? m[2] : STARTER[slot];
    if (!id) continue;
    const it = makeItem(id, Math.max(his?.rarity ?? 0, ITEMS[id].rarity) as Rarity, 0, false);
    if (his && m) {
      // Find the Power that brings her piece's main stat level with his.
      const want = itemMods(his)[m[1]] ?? 0, base = itemMods(it)[m[1]] ?? 0;
      if (base > 0 && want > base) it.lootPower = Math.min(100000, Math.ceil((want / base - 1) / 0.02));
    }
    s.inventory.push(it);
    a.equipment[slot] = it.uid;
  }
  return a;
}

/** Keep a loaded ArcherSave well-formed, creating it for a journey that has none. */
export function settleArcher(s: SaveData) {
  if (!s.archer || typeof s.archer !== 'object' || !Number.isFinite(s.archer.level)) { s.archer = newArcher(s); return; }
  const a = s.archer, num = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min);
  a.level = num(a.level, 1); a.xp = Math.max(0, Number(a.xp) || 0); a.statPoints = num(a.statPoints); a.skillPoints = num(a.skillPoints);
  const st = (a.stats ?? {}) as Record<StatKey, number>;
  a.stats = Object.fromEntries(STAT_KEYS.map((k) => [k, num(st[k], 1)])) as Record<StatKey, number>;
  const sk = a.skills && typeof a.skills === 'object' ? a.skills : {};
  a.skills = {};
  for (const [id, rk] of Object.entries(sk)) { const n = NODE.get(id); if (n && num(rk) > 0) a.skills[id] = Math.min(n.ranks, num(rk)); }
  const eq = a.equipment && typeof a.equipment === 'object' ? a.equipment : {};
  a.equipment = {};
  for (const slot of ARCHER_SLOTS) { const it = getItem(s, eq[slot]); if (it && ITEMS[it.id]?.slot === slot) a.equipment[slot] = it.uid; }
}

// ---------------------------------------------------------------- drops

/** Her keepsakes, won once: Ehud's Blade from the Crimson Marshal, the Bow of Jonathan from the prince of Persia. */
export const ARCHER_KEEPSAKES: Record<string, string> = { marshal: 'ehuds_blade', persia_prince: 'bow_of_jonathan' };

const DROP_SLOTS: [ArcherSlot, number][] = [['bow', 30], ['quiver', 15], ['dagger', 15], ['hood', 12], ['garb', 12], ['amulet', 8], ['charm', 8]];
/** Her items by slot, cheapest first (keepsakes come only from the story). */
const BASES = new Map<ArcherSlot, string[]>(ARCHER_SLOTS.map((sl) => [sl, Object.values(ITEMS).filter((b) => b.slot === sl && !b.unique).sort((x, y) => x.rarity - y.rarity).map((b) => b.id)]));

/** Gear Power for her drops: it climbs with her level, so a bow found late is worth carrying. */
export const archerLootPower = (level: number, chapter: number) => Math.round(6 + Math.pow(Math.max(1, level), 1.35) + Math.max(1, chapter) * 3);

/** One piece of her gear: rarer from elites and bosses and later chapters, its Power set by her level. */
export function archerDrop(s: SaveData, chapter: number, source: 'foe' | 'elite' | 'boss', random = Math.random): Loot {
  const total = DROP_SLOTS.reduce((t, [, w]) => t + w, 0);
  let r = random() * total, slot: ArcherSlot = 'bow';
  for (const [sl, w] of DROP_SLOTS) { r -= w; if (r <= 0) { slot = sl; break; } }
  const tier = Math.min(3, Math.max(0, Math.floor((chapter - 1) / 2)));
  const rarity = Math.min(5, tier + (source === 'boss' ? 2 : source === 'elite' ? 1 : 0) + (random() < 0.25 ? 1 : 0)) as Rarity;
  const list = BASES.get(slot)!, fits = list.filter((id) => ITEMS[id].rarity <= rarity);
  const best = ITEMS[fits[fits.length - 1] ?? list[0]].rarity, pool = fits.filter((id) => ITEMS[id].rarity === best);
  const id = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? list[0];
  return { item: id, rarity: Math.max(rarity, ITEMS[id].rarity), power: archerLootPower(archerLevel(s), chapter) };
}
