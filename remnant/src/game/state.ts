// Persistent game state (what a save slot holds) and the derived numbers
// every system reads: health, damage, defense, crits, Echo bonuses.

import {
  ITEMS, STAT_KEYS, SKILLS, AFFIX_POOL, RARITY_AFFIX_COUNT, ECHO_SPECIES, xpToNext,
  type ItemInst, type Slot, type StatKey, type ModKey, type AbilityId, type EchoInst, type Rarity,
} from './data';
import { uid, randInt, rand } from '../core/math';

export interface QuestState {
  stage: number;
  done: boolean;
}

export interface SaveData {
  version: 1;
  name: string;
  created: number;
  updated: number;
  playtime: number;
  level: number;
  xp: number;
  statPoints: number;
  skillPoints: number;
  stats: Record<StatKey, number>;
  skills: Record<string, number>;
  abilities: AbilityId[];
  equippedSkills: (AbilityId | null)[];
  hp: number;
  ce: number;
  balm: number;
  balmMax: number;
  silver: number;
  inventory: ItemInst[];
  equipment: Partial<Record<Slot, string>>;
  materials: Record<string, number>;
  echoes: EchoInst[];
  active: string[];
  storySlots: number;
  formations: { name: string; uids: string[] }[];
  room: string;
  spawn: string;
  altar: { room: string; spawn: string };
  flags: Record<string, number | string | boolean>;
  visited: string[];
  opened: string[];
  defeated: string[];
  quests: Record<string, QuestState>;
  lore: string[];
  choices: Record<string, string>;
  affinity: { mara: number; azriel: number; tobiah: number };
  rally: number;
  ng: number;
  kills: number;
  deaths: number;
  secrets: string[];
  keyItems: string[];
  altarsLit: string[];
  echoMode: 'aggressive' | 'defensive' | 'follow';
  /** Longest combo ever landed. */
  bestCombo?: number;
}

export function makeItem(id: string, rarity?: Rarity, plus = 0, rollAffixes = true): ItemInst {
  const base = ITEMS[id];
  const r = (rarity ?? base.rarity) as Rarity;
  const inst: ItemInst = { uid: uid(), id, rarity: r, plus, affixes: [] };
  if (rollAffixes && base.slot !== 'material' && base.slot !== 'key' && base.slot !== 'consumable' && !base.unique) {
    const n = RARITY_AFFIX_COUNT[r] - RARITY_AFFIX_COUNT[base.rarity];
    const pool = AFFIX_POOL.slice();
    for (let i = 0; i < n && pool.length; i++) {
      const a = pool.splice(randInt(0, pool.length - 1), 1)[0];
      inst.affixes.push({ key: a.key, v: Math.round(rand(a.min, a.max) * (1 + r * 0.15)) });
    }
  }
  return inst;
}

export function newGame(name = 'Elior'): SaveData {
  const s: SaveData = {
    version: 1,
    name,
    created: Date.now(),
    updated: Date.now(),
    playtime: 0,
    level: 1,
    xp: 0,
    statPoints: 0,
    skillPoints: 0,
    stats: { vit: 5, str: 5, agi: 5, end: 5, res: 5, wis: 5 },
    skills: {},
    abilities: [],
    equippedSkills: [null, null, null],
    hp: 9999,
    ce: 0,
    balm: 3,
    balmMax: 3,
    silver: 15,
    inventory: [],
    equipment: {},
    materials: {},
    echoes: [],
    active: [],
    storySlots: 1,
    formations: [],
    room: 'sanctuary',
    spawn: 'start',
    altar: { room: 'sanctuary', spawn: 'altar' },
    flags: {},
    visited: [],
    opened: [],
    defeated: [],
    quests: {},
    lore: [],
    choices: {},
    affinity: { mara: 0, azriel: 0, tobiah: 0 },
    rally: 0,
    ng: 0,
    kills: 0,
    deaths: 0,
    secrets: [],
    keyItems: [],
    altarsLit: ['sanctuary'],
    echoMode: 'follow',
  };
  for (const id of ['militia_sword', 'watch_hood', 'padded_tunic', 'leather_wraps', 'worn_boots']) {
    const it = makeItem(id, undefined, 0, false);
    s.inventory.push(it);
    s.equipment[ITEMS[id].slot as Slot] = it.uid;
  }
  return s;
}

export function getItem(s: SaveData, u: string | undefined) {
  if (!u) return undefined;
  return s.inventory.find((i) => i.uid === u);
}

/** Total modifiers of one item instance, including upgrades and affixes. */
export function itemMods(it: ItemInst): Partial<Record<ModKey, number>> {
  const base = ITEMS[it.id];
  const out: Partial<Record<ModKey, number>> = {};
  const rarityBoost = 1 + Math.max(0, it.rarity - base.rarity) * 0.18;
  for (const [k, v] of Object.entries(base.mods ?? {})) {
    const key = k as ModKey;
    const mult = v > 0 && !STAT_KEYS.includes(key as StatKey) ? (1 + it.plus * 0.14) * rarityBoost : 1;
    out[key] = Math.round((v as number) * mult * 10) / 10;
  }
  for (const a of it.affixes) out[a.key] = (out[a.key] ?? 0) + a.v;
  return out;
}

export interface Derived {
  stats: Record<StatKey, number>;
  maxHp: number;
  maxCe: number;
  atk: number;
  dr: number;
  crit: number;
  critDmg: number;
  aspd: number;
  speed: number;
  abil: number;
  ceRegen: number;
  echoDmg: number;
  echoHp: number;
  parryWin: number;
  poise: number;
  xpMult: number;
  rallyMult: number;
  lifesteal: number;
  family: 'blade' | 'spear' | 'greatsword';
  weaponPlus: number;
  weaponRarity: number;
  echoSlots: number;
  defense: number;
  meleeMult: number;
}

export const skillRank = (s: SaveData, id: string) => s.skills[id] ?? 0;

/** Echoes that may fight at once: grows with level (2 at 3, 3 at 7, 4 at 11, 5 at 15, 6 at 19), +1 for the Banner skill. */
export function echoSlotsFor(level: number, storySlots: number, banner: boolean) {
  const byLevel = 1 + Math.floor((level + 1) / 4);
  return Math.min(7, Math.max(storySlots, byLevel) + (banner ? 1 : 0));
}
/** The next level at which another Echo slot opens, or null at the cap. */
export function nextSlotLevel(level: number) {
  for (let l = level + 1; l <= 30; l++) if (Math.floor((l + 1) / 4) > Math.floor((level + 1) / 4)) return l;
  return null;
}

export function derive(s: SaveData): Derived {
  const mods: Partial<Record<ModKey, number>> = {};
  for (const slot of Object.keys(s.equipment) as Slot[]) {
    const it = getItem(s, s.equipment[slot]);
    if (!it) continue;
    for (const [k, v] of Object.entries(itemMods(it))) mods[k as ModKey] = (mods[k as ModKey] ?? 0) + (v as number);
  }
  const m = (k: ModKey) => mods[k] ?? 0;
  const stats = { ...s.stats };
  for (const k of STAT_KEYS) stats[k] += m(k);
  const r = (id: string) => skillRank(s, id);
  const weapon = getItem(s, s.equipment.weapon);
  const wb = weapon ? ITEMS[weapon.id] : ITEMS.militia_sword;
  const defense = m('def');
  const drRaw = stats.end * 0.016 + defense * 0.012 + r('g_skin') * 0.05;
  return {
    stats,
    maxHp: Math.round(80 + stats.vit * 12 + (s.level - 1) * 4 + m('hp')),
    maxCe: Math.round(40 + stats.wis * 8 + m('ce') + r('l_lamp') * 8),
    atk: Math.max(1, m('atk')) * (1 + stats.str * 0.06),
    dr: Math.min(0.65, drRaw),
    crit: Math.min(0.75, 0.05 + stats.agi * 0.008 + m('crit') / 100 + (r('w_keen') ? 0.08 : 0)),
    critDmg: 1.5 + m('critDmg') / 100 + (r('w_keen') ? 0.25 : 0),
    aspd: 1 + stats.agi * 0.012 + m('aspd') / 100,
    speed: 1 + m('speed') / 100,
    abil: 1 + stats.wis * 0.05 + m('abil') / 100 + r('l_lamp') * 0.1,
    ceRegen: (1 + m('ceRegen') / 100) * (r('l_radiance') ? 1.5 : 1),
    echoDmg: 1 + m('echoDmg') / 100 + r('c_kin') * 0.1,
    echoHp: 1 + m('echoHp') / 100 + r('c_kin') * 0.1,
    parryWin: (0.15 + stats.res * 0.004) * (1 + m('parry') / 100) * (r('g_timing') ? 1.5 : 1),
    poise: 20 + stats.end * 2 + m('poise'),
    xpMult: 1 + m('xp') / 100,
    rallyMult: (1 + stats.res * 0.04 + m('rally') / 100),
    lifesteal: m('lifesteal') / 100,
    family: (wb.family ?? 'blade'),
    weaponPlus: weapon?.plus ?? 0,
    weaponRarity: weapon?.rarity ?? 0,
    echoSlots: echoSlotsFor(s.level, s.storySlots, r('c_banner') > 0),
    defense,
    meleeMult: 1 + r('w_edge') * 0.08,
  };
}

/** Bring older saves up to date with features added since they were written. */
export function migrateSave(s: SaveData) {
  if (s.flags.relic_taken && !s.flags.phantom) s.flags.phantom = true;
  if (s.bestCombo === undefined) s.bestCombo = 0;
}

export function addMaterial(s: SaveData, id: string, n = 1) {
  s.materials[id] = (s.materials[id] ?? 0) + n;
}

export function hasMaterials(s: SaveData, cost: Record<string, number>) {
  return Object.entries(cost).every(([k, v]) => (k === 'silver' ? s.silver >= v : (s.materials[k] ?? 0) >= v));
}
export function payMaterials(s: SaveData, cost: Record<string, number>) {
  if (!hasMaterials(s, cost)) return false;
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'silver') s.silver -= v;
    else s.materials[k] -= v;
  }
  return true;
}

export function upgradeCost(it: ItemInst): Record<string, number> {
  const p = it.plus + 1;
  const cost: Record<string, number> = { silver: 25 * p * (1 + it.rarity * 0.5), iron_scrap: 2 + p };
  if (p >= 3) cost.veil_shard = p - 1;
  if (p >= 5) cost.covenant_fragment = 1;
  cost.silver = Math.round(cost.silver);
  return cost;
}
export const MAX_PLUS = 5;

export function gainXp(s: SaveData, amount: number): number {
  let levels = 0;
  s.xp += amount;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    s.statPoints += 3;
    s.skillPoints += 1;
    levels++;
  }
  return levels;
}

export function makeEcho(species: string): EchoInst {
  const sp = ECHO_SPECIES[species];
  return { uid: uid(), species, level: 1, xp: 0, stage: 0, hp: sp.baseHp };
}

export function echoMaxHp(s: SaveData, e: EchoInst, d: Derived) {
  const sp = ECHO_SPECIES[e.species];
  return Math.round(sp.baseHp * (1 + (e.level - 1) * 0.12) * (1 + e.stage * 0.35) * d.echoHp);
}
export function echoAtk(s: SaveData, e: EchoInst, d: Derived) {
  const sp = ECHO_SPECIES[e.species];
  return sp.baseAtk * (1 + (e.level - 1) * 0.1) * (1 + e.stage * 0.4) * d.echoDmg;
}

export function canLearn(s: SaveData, id: string) {
  const node = SKILLS.find((n) => n.id === id);
  if (!node) return false;
  if (skillRank(s, id) >= node.ranks) return false;
  if (s.skillPoints < node.cost) return false;
  return node.req.length === 0 || reqOk(s, node.req, id);
}
function reqOk(s: SaveData, req: string[], id: string) {
  // Capstones (two prerequisites in the bottom row) need both; others need any.
  const node = SKILLS.find((n) => n.id === id)!;
  if (node.row === 3) return req.every((r) => skillRank(s, r) > 0);
  return req.some((r) => skillRank(s, r) > 0);
}

export function learn(s: SaveData, id: string) {
  if (!canLearn(s, id)) return false;
  const node = SKILLS.find((n) => n.id === id)!;
  s.skillPoints -= node.cost;
  s.skills[id] = skillRank(s, id) + 1;
  if (node.grants && !s.abilities.includes(node.grants)) {
    s.abilities.push(node.grants);
    const free = s.equippedSkills.indexOf(null);
    if (free >= 0) s.equippedSkills[free] = node.grants;
  }
  if (id === 'g_balm') { s.balmMax += 1; s.balm += 1; }
  return true;
}

export function grantAbility(s: SaveData, id: AbilityId) {
  if (s.abilities.includes(id)) return;
  s.abilities.push(id);
  const free = s.equippedSkills.indexOf(null);
  if (free >= 0) s.equippedSkills[free] = id;
}

export function setQuest(s: SaveData, id: string, stage: number, done = false) {
  const q = s.quests[id] ?? { stage: 0, done: false };
  if (q.done) return false;
  if (stage < q.stage && !done) return false;
  q.stage = stage;
  q.done = done;
  s.quests[id] = q;
  return true;
}
