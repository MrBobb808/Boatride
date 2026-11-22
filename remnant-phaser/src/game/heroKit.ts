// Uri's and Barak's own progression, as Tirzah has hers (game/archer.ts): a level and experience, stat and skill
// points, a skill tree of three branches, and their own set of gear in Elior's kinds of slot (weapon, helm, armor,
// gauntlets, boots, relic, ring). It lives in the optional `PhaserSave.kits`. Their items share the inventory, but a
// piece is worn by one hero at a time: Elior first, then whoever put it on. Their numbers are the original's derive()
// over a view of the save holding their level, stats and gear, then their tree; covenant-wide numbers (the Echoes,
// prices) stay Elior's.
import { derive, makeItem, getItem, wornHooks, type SaveData, type Derived } from '../../../remnant/src/game/state';
import { ITEMS, SLOTS, STAT_KEYS, xpToNext, type Rarity, type Slot, type StatKey } from '../../../remnant/src/game/data';
import type { PhaserSave } from './save';

export type KitHero = 'uri' | 'barak';
export const KIT_HEROES: KitHero[] = ['uri', 'barak'];
export interface KitSave {
  level: number; xp: number; statPoints: number; skillPoints: number;
  stats: Record<StatKey, number>; skills: Record<string, number>; equipment: Partial<Record<Slot, string>>;
}
export const KIT_NAME: Record<KitHero, string> = { uri: 'Uri', barak: 'Barak' };
export const KIT_COLOR: Record<KitHero, string> = { uri: '#ff9a50', barak: '#8fdcff' };

// ---------------------------------------------------------------- the trees

export interface KitNode { id: string; hero: KitHero; tree: string; name: string; desc: string; ranks: number; cost: number; req: string[]; row: number; col: number; icon: string }
export const KIT_TREES: Record<KitHero, { id: string; name: string; blurb: string; color: string }[]> = {
  uri: [
    { id: 'pyre', name: 'Pyromancer', blurb: 'His fire: its strength, its Heat and its Scorch.', color: '#ff8a3a' },
    { id: 'kiln', name: 'The Kiln', blurb: 'The great casts: the Great Fireball and the Supernova.', color: '#ffd27a' },
    { id: 'ward', name: 'Ember Ward', blurb: 'Endurance, the shaman and his abilities.', color: '#9be07a' },
  ],
  barak: [
    { id: 'bolt', name: 'Stormcaller', blurb: 'His lightning: strength, leaps and the Thunderhead.', color: '#8fdcff' },
    { id: 'tempest', name: 'Tempest', blurb: 'The Beast, the teleports and the Storm Chain.', color: '#c8a8ff' },
    { id: 'ground', name: 'Grounded', blurb: 'Speed, endurance and his storm abilities.', color: '#f3d79a' },
  ],
};
const N = (hero: KitHero, tree: string, id: string, name: string, desc: string, ranks: number, cost: number, req: string[], row: number, col: number, icon: string): KitNode => ({ id, hero, tree, name, desc, ranks, cost, req, row, col, icon });
export const KIT_NODES: KitNode[] = [
  N('uri', 'pyre', 'u_flame', 'Kindled Hand', 'Every fire he casts: +8% damage per rank. Up to 25 ranks.', 25, 1, [], 0, 1, 'flask'),
  N('uri', 'pyre', 'u_banked', 'Banked Coals', 'His Heat waits half again as long before it cools, and cools a third slower.', 1, 1, ['u_flame'], 1, 0, 'lamp'),
  N('uri', 'pyre', 'u_white', 'White Heat', '+3% critical chance and +10% critical damage per rank. Up to 10 ranks.', 10, 1, ['u_flame'], 1, 2, 'target'),
  N('uri', 'pyre', 'u_catch', 'Quick to Catch', 'A foe Combusts at three Scorch marks, not four.', 1, 2, ['u_banked'], 2, 0, 'arc'),
  N('uri', 'pyre', 'u_tinder', 'Tinder', 'Every blow that lands gives a third more Heat.', 1, 2, ['u_white'], 2, 2, 'feather'),
  N('uri', 'pyre', 'u_furnace', 'Heart of the Furnace', 'At Blazing, every fire of his deals +20% damage.', 1, 3, ['u_catch', 'u_tinder'], 3, 1, 'crown'),
  N('uri', 'kiln', 'u_gather', 'Quick Gathering', 'The Great Fireball gathers 12% faster per rank. Up to 4 ranks.', 4, 1, [], 0, 1, 'arc'),
  N('uri', 'kiln', 'u_great', 'Greater Fireball', 'The Great Fireball and its blast: +10% damage per rank. Up to 10 ranks.', 10, 1, ['u_gather'], 1, 0, 'flask'),
  N('uri', 'kiln', 'u_wide', 'Wide Burst', 'Every burst of his fire reaches 6% further per rank. Up to 5 ranks.', 5, 1, ['u_gather'], 1, 2, 'target'),
  N('uri', 'kiln', 'u_nova', 'Bright Nova', 'The Supernova deals +40% damage.', 1, 2, ['u_great'], 2, 0, 'crown'),
  N('uri', 'kiln', 'u_comet', 'Long Comets', 'The Comet Fan throws two more fireballs.', 1, 2, ['u_wide'], 2, 2, 'feather'),
  N('uri', 'kiln', 'u_sun', 'Second Sun', 'A Supernova leaves him Hot (70 Heat), not cold.', 1, 3, ['u_nova', 'u_comet'], 3, 1, 'sigil'),
  N('uri', 'ward', 'u_vigor', 'Ember Skin', '+4% maximum health per rank. Up to 10 ranks.', 10, 1, [], 0, 0, 'heal'),
  N('uri', 'ward', 'u_hide', 'Scorched Hide', 'Each rank reduces remaining incoming damage by 5%. Up to 15 ranks.', 15, 1, [], 0, 1, 'armor'),
  N('uri', 'ward', 'u_focus', 'Kindled Focus', '+6% ability power and +10 energy per rank. Up to 10 ranks.', 10, 1, ['u_hide'], 1, 2, 'lamp'),
  N('uri', 'ward', 'u_stride', 'Long Stride', '+4% move speed per rank. Up to 5 ranks.', 5, 1, ['u_vigor'], 1, 0, 'boot'),
  N('uri', 'ward', 'u_deep', 'Deep Embers', 'His abilities recharge 15% faster.', 1, 2, ['u_focus'], 2, 2, 'recall'),
  N('uri', 'ward', 'u_bond', "Shaman's Bond", 'The Fusion of Flame lasts 3 s longer, and his abilities cost 25% less energy.', 1, 3, ['u_stride', 'u_deep'], 3, 1, 'mantle'),

  N('barak', 'bolt', 'b_spark', 'Charged Hands', 'Every strike of his: +8% damage per rank. Up to 25 ranks.', 25, 1, [], 0, 1, 'arc'),
  N('barak', 'bolt', 'b_leap', 'Long Leap', 'Chain Lightning leaps to one more foe, and a little further.', 1, 1, ['b_spark'], 1, 0, 'feather'),
  N('barak', 'bolt', 'b_keen', 'Bright Edge', '+3% critical chance and +10% critical damage per rank. Up to 10 ranks.', 10, 1, ['b_spark'], 1, 2, 'target'),
  N('barak', 'bolt', 'b_head', 'Quick Thunderhead', 'Heavy gathers the Thunderhead 40% sooner.', 1, 2, ['b_leap'], 2, 0, 'lamp'),
  N('barak', 'bolt', 'b_burst', 'Wide Burst', 'The Arc Burst and the Thunder Drop reach 25% further.', 1, 2, ['b_keen'], 2, 2, 'crown'),
  N('barak', 'bolt', 'b_fork', 'Forked Heavens', 'Every leap of his lightning loses only a fifth of its strength, not a third.', 1, 3, ['b_head', 'b_burst'], 3, 1, 'sigil'),
  N('barak', 'tempest', 'b_storm', 'Gathering Storm', 'The Storm Chain and the Chain Rush: +10% damage per rank. Up to 10 ranks.', 10, 1, [], 0, 1, 'mantle'),
  N('barak', 'tempest', 'b_reach', 'Far Reach', 'His teleports find foes 20% further away.', 1, 1, ['b_storm'], 1, 0, 'dodge'),
  N('barak', 'tempest', 'b_more', 'Many Hands', 'The Storm Chain runs through two more foes.', 1, 2, ['b_storm'], 1, 2, 'heart'),
  N('barak', 'tempest', 'b_beast', 'Long Tempest', 'The Tempest Beast lasts 1.5 s longer per rank. Up to 4 ranks.', 4, 1, ['b_reach'], 2, 0, 'mantle'),
  N('barak', 'tempest', 'b_sky', 'Open Sky', 'The sky\'s bolt at the end of the Storm Chain strikes 50% harder and wider.', 1, 2, ['b_more'], 2, 2, 'crown'),
  N('barak', 'tempest', 'b_eye', 'Eye of the Storm', 'Becoming the Tempest Beast is itself a Storm Chain through every foe near.', 1, 3, ['b_beast', 'b_sky'], 3, 1, 'sigil'),
  N('barak', 'ground', 'b_vigor', 'Iron Nerve', '+4% maximum health per rank. Up to 10 ranks.', 10, 1, [], 0, 0, 'heal'),
  N('barak', 'ground', 'b_hide', 'Grounded', 'Each rank reduces remaining incoming damage by 5%. Up to 15 ranks.', 15, 1, [], 0, 1, 'armor'),
  N('barak', 'ground', 'b_swift', 'Quicksilver', '+4% move speed per rank. Up to 5 ranks.', 5, 1, ['b_vigor'], 1, 0, 'boot'),
  N('barak', 'ground', 'b_focus', 'Static Focus', '+6% ability power and +10 energy per rank. Up to 10 ranks.', 10, 1, ['b_hide'], 1, 2, 'lamp'),
  N('barak', 'ground', 'b_deep', 'Recharge', 'His storm abilities recharge 15% faster.', 1, 2, ['b_focus'], 2, 2, 'recall'),
  N('barak', 'ground', 'b_palm', 'Hovering Palm', 'He can strike four Static Palms in a jump, and the Thunder Drop heals 2% of his health for each foe it strikes.', 1, 3, ['b_swift', 'b_deep'], 3, 1, 'feather'),
];
const NODE = new Map(KIT_NODES.map((n) => [n.id, n]));

// ---------------------------------------------------------------- the save

/** Their gear for a journey already under way: a fresh piece like each Elior wears (same kind, rarity and Power,
 * none of his rolled lines), so neither is weaker for gaining his own kit. */
function startKit(s: PhaserSave, level: number, xp: number): KitSave {
  const k: KitSave = { level: Math.max(1, level), xp, statPoints: Math.max(0, Math.floor(s.statPoints)), skillPoints: Math.max(0, level - 1), stats: { ...s.stats }, skills: {}, equipment: {} };
  for (const slot of SLOTS) {
    const his = getItem(s, s.equipment[slot]);
    if (!his || ITEMS[his.id]?.unique) continue;
    const it = makeItem(his.id, his.rarity as Rarity, 0, false);
    if (his.lootPower) it.lootPower = his.lootPower;
    s.inventory.push(it);
    k.equipment[slot] = it.uid;
  }
  return k;
}

/** The hero's kit, made the first time it is asked for (Uri from the level he earned, Barak at Elior's level). */
export function kitOf(s: PhaserSave, hero: KitHero): KitSave {
  const kits = (s.kits ??= {});
  return (kits[hero] ??= hero === 'uri' ? startKit(s, s.uri?.level ?? 1, s.uri?.xp ?? 0) : startKit(s, s.level, 0));
}

/** Keep loaded kits well-formed: numbers whole, ranks within their nodes, gear that fits its slot and is not worn by
 * Elior or the other kit. */
export function settleKits(s: PhaserSave) {
  if (!s.kits || typeof s.kits !== 'object') return;
  const num = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min);
  const taken = new Set(Object.values(s.equipment ?? {}));
  for (const hero of KIT_HEROES) {
    const k = s.kits[hero];
    if (!k) continue;
    if (typeof k !== 'object' || !Number.isFinite(k.level)) { delete s.kits[hero]; continue; }
    k.level = num(k.level, 1); k.xp = Math.max(0, Number(k.xp) || 0); k.statPoints = num(k.statPoints); k.skillPoints = num(k.skillPoints);
    const st = (k.stats ?? {}) as Record<StatKey, number>;
    k.stats = Object.fromEntries(STAT_KEYS.map((key) => [key, num(st[key], 1)])) as Record<StatKey, number>;
    const sk = k.skills && typeof k.skills === 'object' ? k.skills : {};
    k.skills = {};
    for (const [id, rk] of Object.entries(sk)) { const n = NODE.get(id); if (n && n.hero === hero && num(rk) > 0) k.skills[id] = Math.min(n.ranks, num(rk)); }
    const eq = k.equipment && typeof k.equipment === 'object' ? k.equipment : {};
    k.equipment = {};
    for (const slot of SLOTS) { const it = getItem(s, eq[slot]); if (it && ITEMS[it.id]?.slot === slot && !taken.has(it.uid)) { k.equipment[slot] = it.uid; taken.add(it.uid); } }
  }
}

/** Who wears a piece, of Uri and Barak (Elior's and Tirzah's own gear is the shared isWorn's). */
export function kitWearer(s: SaveData, uid: string): KitHero | null {
  const kits = (s as PhaserSave).kits;
  if (!kits) return null;
  for (const hero of KIT_HEROES) if (kits[hero] && Object.values(kits[hero]!.equipment).includes(uid)) return hero;
  return null;
}
// The shared isWorn counts their gear too, so the store will not sell it nor the forge break it.
wornHooks.push((s, uid) => !!kitWearer(s, uid));

/** Put a piece on a kit hero, taking it off whoever else of the two wore it (Elior's own gear cannot be taken). */
export function equipKit(s: PhaserSave, hero: KitHero, slot: Slot, uid: string | null) {
  const k = kitOf(s, hero);
  if (uid && Object.values(s.equipment).includes(uid)) return false;
  if (uid) for (const other of KIT_HEROES) { const o = s.kits?.[other]; if (o && o.equipment[slot] === uid) delete o.equipment[slot]; }
  if (uid) k.equipment[slot] = uid; else delete k.equipment[slot];
  return true;
}

// ---------------------------------------------------------------- levels and points

/** A rank in one of their nodes (0 when none, or no kit yet). */
export const krank = (s: SaveData, hero: KitHero, id: string) => (s as PhaserSave).kits?.[hero]?.skills[id] ?? 0;
/** A rank in the tree of the hero in play (0 for Elior and Tirzah). */
export const playRank = (s: SaveData, id: string) => {
  const h = (s as PhaserSave).playableHero;
  return h === 'uri' || h === 'barak' ? krank(s, h, id) : 0;
};

export function canLearnKit(s: PhaserSave, hero: KitHero, id: string) {
  const k = s.kits?.[hero], n = NODE.get(id);
  if (!k || !n || n.hero !== hero || krank(s, hero, id) >= n.ranks || k.skillPoints < n.cost) return false;
  // Capstones need both prerequisites; the others either.
  return !n.req.length || (n.row === 3 ? n.req.every((r) => krank(s, hero, r) > 0) : n.req.some((r) => krank(s, hero, r) > 0));
}
export function learnKit(s: PhaserSave, hero: KitHero, id: string, requested = 1) {
  let n = 0;
  while (n < Math.min(50, requested) && canLearnKit(s, hero, id)) { const k = s.kits![hero]!; k.skillPoints -= NODE.get(id)!.cost; k.skills[id] = krank(s, hero, id) + 1; n++; }
  return n;
}
export function allocateKit(s: PhaserSave, hero: KitHero, key: StatKey, requested = 1) {
  const k = kitOf(s, hero);
  if (!STAT_KEYS.includes(key)) return 0;
  const n = Math.min(Math.max(0, Math.floor(requested)), Math.floor(k.statPoints));
  k.stats[key] += n; k.statPoints -= n;
  return n;
}

/** Experience for a kit hero: +3 stat points and a skill point a level. Three times over while behind Elior, so a
 * hero brought in late catches up. Returns the levels gained. */
export function kitGainXp(s: PhaserSave, hero: KitHero, amount: number) {
  const k = kitOf(s, hero);
  if (!(amount > 0)) return 0;
  let levels = 0;
  k.xp += Math.round(amount * (k.level < s.level ? 3 : 1));
  while (k.xp >= xpToNext(k.level)) { k.xp -= xpToNext(k.level); k.level++; k.statPoints += 3; k.skillPoints += 1; levels++; }
  return levels;
}

// ---------------------------------------------------------------- their numbers

/** Their stats: the original's derive() over their level, stats and gear, then their tree. Uri keeps a mage's keener
 * eye (+4% critical chance). */
export function kitStats(s: PhaserSave, hero: KitHero, elior: Derived): Derived {
  const k = kitOf(s, hero);
  // A piece Elior has since put on is his alone.
  for (const slot of SLOTS) if (k.equipment[slot] && s.equipment[slot] === k.equipment[slot]) delete k.equipment[slot];
  const d = derive({ ...s, level: k.level, xp: k.xp, stats: k.stats, skills: {}, equipment: k.equipment, weaponMastery: {} });
  const r = (id: string) => k.skills[id] ?? 0, p = hero === 'uri' ? 'u_' : 'b_';
  d.meleeMult *= 1 + r(hero === 'uri' ? 'u_flame' : 'b_spark') * 0.08;
  d.crit = Math.min(0.75, d.crit + r(hero === 'uri' ? 'u_white' : 'b_keen') * 0.03 + (hero === 'uri' ? 0.04 : 0));
  d.critDmg += r(hero === 'uri' ? 'u_white' : 'b_keen') * 0.1;
  d.speed *= 1 + r(hero === 'uri' ? 'u_stride' : 'b_swift') * 0.04;
  d.maxHp = Math.round(d.maxHp * (1 + r(p + 'vigor') * 0.04));
  d.dr = Math.min(0.9, 1 - (1 - d.dr) * Math.pow(0.95, r(p + 'hide')));
  d.abil += r(p + 'focus') * 0.06;
  d.maxCe += r(p + 'focus') * 10;
  d.skillRecharge *= r(p + 'deep') ? 1.15 : 1;
  // The covenant's numbers stay Elior's: they belong to the Echoes and the store.
  d.echoSlots = elior.echoSlots; d.echoDmg = elior.echoDmg; d.echoHp = elior.echoHp;
  d.rallyMult = Math.max(d.rallyMult, elior.rallyMult);
  d.barter = elior.barter; d.salvage = elior.salvage;
  return d;
}
