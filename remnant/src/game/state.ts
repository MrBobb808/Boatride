// Persistent game state (what a save slot holds) and the derived numbers
// every system reads: health, damage, defense, crits, Echo bonuses.

import type { SettlementSave } from './settlement';
import {
  ITEMS, STAT_KEYS, SKILLS, AFFIX_POOL, RARITY_AFFIX_COUNT, ECHO_SPECIES, xpToNext,
  ABILITIES, SUPER_MOVES, ECHO_ROLES, TRIAL_REWARDS, ECHO_LEVEL_CAP, echoXpToNext, type SuperId,
  type ItemInst, type Slot, type StatKey, type ModKey, type AbilityId, type EchoInst, type Rarity,
} from './data';
import { uid, randInt, rand } from '../core/math';
import { runBlessings } from './blessings';
import { ASCENDANT_LOOT, lootScale, waveLootPower, sovereignDamage, softGrowth, trainingBonus } from './balance';
import { masteryRank, migrateProgression, contractPrize, contractWins, type GearSetId, type ContractId, type ProgressionData } from './progression';

export interface QuestState {
  stage: number;
  done: boolean;
}

export interface SaveData extends ProgressionData {
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
  /** Shadow Mantle gauge, 0–100 (from level 25). */
  mantle?: number;
  /** Hearts (sub-weapon ammunition) and the sub-weapon carried. */
  hearts?: number;
  sub?: string | null;
  /** Foes slain, by kind, for the Bestiary. */
  bestiary?: Record<string, number>;
  ng: number;
  kills: number;
  deaths: number;
  secrets: string[];
  keyItems: string[];
  altarsLit: string[];
  echoMode: 'aggressive' | 'defensive' | 'follow';
  /** How many of the lineup to call out: the lead, the lead two, the hand-picked squad, or the whole lineup (default). */
  summonPreset?: 'one' | 'two' | 'squad' | 'all';
  /** The hand-picked squad (Echo uids) for summonPreset 'squad'. */
  squadPick?: string[];
  /** Longest combo ever landed. */
  bestCombo?: number;
  equippedSuper?: SuperId;
  /** Earned by defeating originals; consumed only when the player absorbs one. */
  echoImprints?: Record<string, number>;
  trialMilestones?: number[];
  /** Remnant's Rest: tier last seen, accepted requests, titles (game/settlement.ts). */
  settlement?: SettlementSave;
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
    const mult = v > 0 && !STAT_KEYS.includes(key as StatKey) ? (1 + it.plus * 0.14) * rarityBoost * (1 + Math.min(100, Math.max(0, it.trialTier ?? 0)) * 0.15) : 1;
    const power = it.lootPower ? lootScale(it.lootPower, key === 'atk' || key === 'hp' || key === 'ce') : 1;
    out[key] = Math.round((v as number) * mult * power * 10) / 10;
  }
  for (const a of it.affixes) out[a.key] = (out[a.key] ?? 0) + a.v * (it.lootPower ? lootScale(it.lootPower, false) : 1);
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
  hpRegen: number;
  masteryRank: number;
  sets: Record<GearSetId, number>;
  skillRecharge: number;
  pursuitRecharge: number;
  heavyMult: number;
  heavyPoiseMult: number;
}

export const skillRank = (s: SaveData, id: string) => s.skills[id] ?? 0;

/** Echoes that may fight at once: grows with level (2 at 3, 3 at 7, 4 at 11, 5 at 15, 6 at 19), +1 for the Banner skill. */
/** Echo slots: one more every four levels up to seven, then at 50, 75 and 100 (ten at most). */
export function echoSlotsFor(level: number, storySlots: number, banner: boolean) {
  const early = Math.min(7, 1 + Math.floor((level + 1) / 4));
  const late = (level >= 50 ? 1 : 0) + (level >= 75 ? 1 : 0) + (level >= 100 ? 1 : 0);
  return Math.min(10, Math.max(storySlots, early) + late + (banner ? 1 : 0));
}
/** The next level at which another Echo slot opens, or null at the cap. */
export function nextSlotLevel(level: number) {
  for (let l = level + 1; l <= 100; l++) if (echoSlotsFor(l, 0, false) > echoSlotsFor(level, 0, false)) return l;
  return null;
}

export function derive(s: SaveData): Derived {
  const mods: Partial<Record<ModKey, number>> = {};
  const sets = { vigil: 0, rift: 0, legion: 0 };
  for (const slot of Object.keys(s.equipment) as Slot[]) {
    const it = getItem(s, s.equipment[slot]);
    if (!it || ITEMS[it.id].slot !== slot) continue;
    const set = ITEMS[it.id].set;
    if (set) sets[set]++;
    for (const [k, v] of Object.entries(itemMods(it))) mods[k as ModKey] = (mods[k as ModKey] ?? 0) + (v as number);
  }
  const m = (k: ModKey) => mods[k] ?? 0;
  const stats = { ...s.stats };
  for (const k of STAT_KEYS) stats[k] += m(k);
  const r = (id: string) => skillRank(s, id);
  const weapon = getItem(s, s.equipment.weapon);
  const wb = weapon ? ITEMS[weapon.id] : ITEMS.militia_sword;
  const family = wb.family ?? 'blade';
  const rank = masteryRank(s, family);
  const blade = family === 'blade' ? rank : 0, spear = family === 'spear' ? rank : 0, great = family === 'greatsword' ? rank : 0;
  const recharge = (spear >= 10 ? 1.25 : 1) * (1 + softGrowth(stats.wis - 5, 55, 0.35) * 0.008);
  const defense = m('def');
  const vitality = Math.max(0, stats.vit - 5), endurance = Math.max(0, stats.end - 5);
  const resolve = Math.max(0, stats.res - 5), level = Math.max(0, s.level - 1);
  const strength = softGrowth(stats.str, 60, 0.35), agility = softGrowth(stats.agi, 60, 0.35);
  const wisdom = softGrowth(stats.wis, 60, 0.35), sovereign = sovereignDamage(s.level) - 1;
  const incoming = Math.pow(0.94, r('g_skin')) / (1 + stats.end * 0.025 + defense * 0.04);
  return {
    stats,
    maxHp: Math.round((80 + stats.vit * 12 + vitality * 12 + endurance * 8 + level * 10 + m('hp')) * (1 + vitality * 0.0075)),
    maxCe: Math.round(40 + stats.wis * 12 + m('ce') + r('l_lamp') * 15),
    atk: (Math.max(1, m('atk')) * (1 + softGrowth(level, 99, 0.35) * 0.03) + Math.max(0, stats.str - 5) * 1.5) * (1 + strength * 0.05),
    dr: Math.min(0.9, 1 - incoming),
    crit: Math.min(0.75, 0.05 + agility * 0.005 + m('crit') / 100 + r('w_keen') * 0.03 + (blade >= 3 ? 0.05 : 0)),
    critDmg: 1.5 + softGrowth(m('critDmg'), 100, 0.25) / 100 + r('w_keen') * 0.1 + (agility + softGrowth(stats.res, 60, 0.35)) * 0.004,
    aspd: Math.min(3, 1 + agility * 0.012 + m('aspd') / 100 + (blade >= 6 ? 0.08 : 0)),
    speed: 1 + m('speed') / 100 + (sets.rift >= 2 ? 0.08 : 0),
    abil: 1 + wisdom * 0.035 + softGrowth(m('abil'), 100, 0.25) / 100 + trainingBonus(r('l_lamp')) + sovereign + (spear >= 3 ? 0.15 : 0) + (sets.rift >= 2 ? 0.25 : 0),
    ceRegen: (1 + m('ceRegen') / 100 + (spear >= 6 ? 0.3 : 0)) * (1 + r('l_radiance') * 0.5),
    echoDmg: (1 + softGrowth(m('echoDmg'), 100, 0.25) / 100 + trainingBonus(r('c_kin')) + softGrowth(resolve, 55, 0.35) * 0.008 + sovereign + (sets.legion >= 2 ? 0.3 : 0)) * runBlessings.echoes,
    echoHp: 1 + m('echoHp') / 100 + trainingBonus(r('c_kin')) + endurance * 0.005 + (sets.legion >= 2 ? 0.25 : 0),
    parryWin: Math.min(0.6, (0.15 + stats.res * 0.004) * (1 + m('parry') / 100) * (r('g_timing') ? 1.5 : 1) * (sets.vigil >= 2 ? 1.2 : 1)),
    poise: 20 + stats.end * 2 + m('poise'),
    xpMult: 1 + m('xp') / 100,
    rallyMult: (1 + stats.res * 0.06 + m('rally') / 100),
    lifesteal: m('lifesteal') / 100 + (blade >= 10 ? 0.03 : 0),
    family,
    weaponPlus: weapon?.plus ?? 0,
    weaponRarity: weapon?.rarity ?? 0,
    echoSlots: echoSlotsFor(s.level, s.storySlots, r('c_banner') > 0),
    defense,
    meleeMult: (1 + trainingBonus(r('w_edge'))) * runBlessings.weapon * (1 + rank * 0.03),
    hpRegen: r('g_regen') * 0.0075 + runBlessings.regen + (sets.vigil >= 2 ? 0.005 : 0),
    masteryRank: rank, sets, skillRecharge: recharge,
    pursuitRecharge: recharge * (sets.rift >= 3 ? 1.75 : 1),
    heavyMult: great >= 6 ? 1.2 : 1,
    heavyPoiseMult: great >= 3 ? 1.15 : 1,
  };
}

/** Bring older saves up to date with features added since they were written. */
export function migrateSave(s: SaveData) {
  migrateProgression(s);
  mergeDuplicateEchoes(s);
  s.trialMilestones ??= [];
  for (let wave = 10; wave <= Math.min(100, Number(s.flags.trial_best ?? 0)); wave += 10) claimTrialMilestone(s, wave);
  if (s.flags.relic_taken && !s.flags.phantom) s.flags.phantom = true;
  if (s.bestCombo === undefined) s.bestCombo = 0;
  if (!s.equippedSuper || !SUPER_MOVES[s.equippedSuper]) s.equippedSuper = 'rally';
  s.echoImprints ??= {};
  s.settlement ??= { seen: -1, quests: {}, titles: [] };
  for (const e of s.echoes) {
    e.absorptions ??= e.stage + 1;
    if (e.role && !ECHO_ROLES[e.role]) e.role = undefined;
    if (e.targetPriority && !['ranged', 'boss', 'crowd'].includes(e.targetPriority)) e.targetPriority = undefined;
  }
  unlockCombatSkills(s);
  s.equippedSkills = Array.from({ length: 3 }, (_, i) => {
    const id = s.equippedSkills[i];
    return id && ABILITIES[id] && s.abilities.includes(id) && s.equippedSkills.indexOf(id) === i ? id : null;
  });
}

/** One deterministic piece per five-wave contract, then upgrade that same piece. */
export function claimContractReward(s: SaveData, id: ContractId): ItemInst {
  const prize = contractPrize(s, id);
  let item = s.inventory.find(it => it.id === prize.id);
  if (!item) { item = makeItem(prize.id, undefined, prize.plus, false); s.inventory.push(item); }
  else item.plus = Math.max(item.plus, prize.plus);
  // At the upgrade cap, repeats still pay useful forge materials and silver.
  s.silver += 250 * (prize.plus + 1);
  addMaterial(s, 'covenant_fragment', 2 + prize.plus);
  item.isNew = true;
  (s.contracts ??= {})[id] = contractWins(s, id) + 1;
  return item;
}

/** Milestones are permanent inventory awards, independent of pickup positions. */
export function claimTrialMilestone(s: SaveData, wave: number): ItemInst | null {
  if (!Number.isSafeInteger(wave) || wave < 10 || wave % 10 !== 0) return null;
  const earned = s.trialMilestones ??= [];
  if (earned.includes(wave)) return null;
  const id = wave <= 100 ? TRIAL_REWARDS[wave / 10 - 1] : ['trial_worldbreaker', 'trial_bastion', 'trial_ascendancy'][(wave / 10 - 11) % 3];
  const item = makeItem(id, undefined, 0, false);
  item.trialWave = wave;
  item.trialTier = Math.max(0, Math.floor((wave - 100) / 10));
  item.isNew = true;
  s.inventory.push(item);
  earned.push(wave);
  return item;
}

/** Guaranteed random Legendary/Covenant gear, awarded before the wave autosave. */
export function grantWaveLoot(s: SaveData, wave: number, random = Math.random): ItemInst {
  const pool = wave % 5 === 0 ? ASCENDANT_LOOT.slice(0, 3) : ASCENDANT_LOOT;
  const pick = Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length));
  const rarity: Rarity = random() < Math.min(0.6, 0.12 + wave * 0.008) ? 5 : 4;
  const item = makeItem(pool[pick], rarity, 0, false);
  item.lootPower = waveLootPower(s.level, wave); item.lootWave = wave; item.isNew = true;
  const affixes = AFFIX_POOL.slice();
  for (let n = 0; n < (rarity === 5 ? 3 : 2); n++) {
    const index = Math.min(affixes.length - 1, Math.floor(Math.max(0, random()) * affixes.length));
    const a = affixes.splice(index, 1)[0];
    item.affixes.push({ key: a.key, v: Math.round(a.min + (a.max - a.min) * Math.min(1, Math.max(0, random()))) });
  }
  s.inventory.push(item);
  return item;
}

export function allocateStat(s: SaveData, key: StatKey, requested = 1): number {
  if (!STAT_KEYS.includes(key) || !Number.isSafeInteger(requested) || requested <= 0) return 0;
  const amount = Math.min(requested, Math.max(0, Math.floor(s.statPoints)));
  s.stats[key] += amount; s.statPoints -= amount;
  return amount;
}

export function learnRanks(s: SaveData, id: string, requested = 1): number {
  if (!Number.isSafeInteger(requested) || requested <= 0) return 0;
  let learned = 0;
  while (learned < Math.min(50, requested) && learn(s, id)) learned++;
  return learned;
}

export function gainEchoXp(e: EchoInst, amount: number) {
  const before = e.level;
  if (e.level >= ECHO_LEVEL_CAP) { e.xp = 0; return 0; }
  e.xp += Math.max(0, amount);
  while (e.level < ECHO_LEVEL_CAP && e.xp >= echoXpToNext(e.level)) {
    e.xp -= echoXpToNext(e.level);
    e.level++;
  }
  if (e.level >= ECHO_LEVEL_CAP) e.xp = 0;
  return e.level - before;
}

/** Preserve the chosen identity and remap every lineup reference before removing duplicates. */
export function mergeDuplicateEchoes(s: SaveData) {
  const groups = new Map<string, EchoInst[]>(), aliases = new Map<string, string>();
  for (const e of s.echoes) { const list = groups.get(e.species) ?? []; list.push(e); groups.set(e.species, list); }
  const merged: EchoInst[] = [];
  let removed = 0;
  for (const list of groups.values()) {
    const preferred = s.active.find((uid) => list.some((e) => e.uid === uid));
    const lead = list.find((e) => e.uid === preferred) ?? list.find((e) => e.commander) ?? list.reduce((a, b) => b.stage > a.stage || (b.stage === a.stage && b.level > a.level) ? b : a);
    for (const e of list) aliases.set(e.uid, lead.uid);
    if (list.length > 1) {
      let xp = 0, absorptions = 0, bestStage = 0, bestLevel = 1;
      for (const e of list) {
        xp += e.xp;
        for (let lv = 1; lv < Math.min(ECHO_LEVEL_CAP, e.level); lv++) xp += echoXpToNext(lv);
        absorptions += e.absorptions ?? e.stage + 1;
        bestStage = Math.max(bestStage, e.stage); bestLevel = Math.max(bestLevel, e.level);
      }
      lead.stage = Math.max(bestStage, Math.min(2, absorptions - 1));
      lead.absorptions = absorptions;
      lead.commander = list.some((e) => e.commander);
      lead.nickname ??= list.find((e) => e.nickname)?.nickname;
      lead.role ??= list.find((e) => e.role)?.role;
      lead.level = 1; lead.xp = 0;
      gainEchoXp(lead, xp + (list.length - 1) * echoXpToNext(bestLevel));
      lead.hp = Math.max(...list.map((e) => e.hp));
      lead.downFor = Math.min(...list.map((e) => e.downFor ?? 0));
      removed += list.length - 1;
    }
    merged.push(lead);
  }
  if (!removed) return 0;
  const remap = (uids: string[]) => [...new Set(uids.map((u) => aliases.get(u) ?? u))].filter((u) => merged.some((e) => e.uid === u));
  s.echoes = merged;
  s.active = remap(s.active);
  if (s.squadPick) s.squadPick = remap(s.squadPick);
  for (const f of s.formations) f.uids = remap(f.uids);
  s.flags.echo_merge_notice = Number(s.flags.echo_merge_notice ?? 0) + removed;
  return removed;
}

export const COMBAT_UNLOCKS: Partial<Record<AbilityId, number>> = { chain_snare: 1, mending_light: 1, blink_strike: 5, frost_ring: 10 };
export function unlockCombatSkills(s: SaveData) {
  if (!s.flags.relic_taken) return;
  for (const [id, level] of Object.entries(COMBAT_UNLOCKS)) {
    if (s.level >= level && !s.abilities.includes(id as AbilityId)) s.abilities.push(id as AbilityId);
  }
}

/** Swapping an equipped ability exchanges slots, so a skill appears only once. */
export function equipAbility(s: SaveData, id: AbilityId | null, slot: number) {
  if (slot < 0 || slot > 2 || (id && !s.abilities.includes(id))) return false;
  const old = s.equippedSkills[slot] ?? null;
  const other = id ? s.equippedSkills.indexOf(id) : -1;
  if (other >= 0) s.equippedSkills[other] = old;
  s.equippedSkills[slot] = id;
  return true;
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
  unlockCombatSkills(s);
  return levels;
}

export function makeEcho(species: string): EchoInst {
  const sp = ECHO_SPECIES[species];
  return { uid: uid(), species, level: 1, xp: 0, stage: 0, hp: sp.baseHp, absorptions: 1 };
}

export function absorbEcho(s: SaveData, species: string, d: Derived) {
  if (!ECHO_SPECIES[species]) return null;
  const owned = s.echoes.find((e) => e.species === species && s.active.includes(e.uid)) ?? s.echoes.find((e) => e.species === species);
  const e = owned ?? makeEcho(species);
  const evolved = !!owned && e.stage < 2;
  if (!owned) s.echoes.push(e);
  else {
    e.absorptions = (e.absorptions ?? e.stage + 1) + 1;
    if (evolved) e.stage++;
    else e.level = Math.min(ECHO_LEVEL_CAP, e.level + 1);
  }
  e.hp = echoMaxHp(s, e, d);
  e.downFor = 0;
  if (!owned && s.active.length < d.echoSlots) s.active.push(e.uid);
  return { echo: e, created: !owned, evolved };
}

export function echoMaxHp(s: SaveData, e: EchoInst, d: Derived) {
  const sp = ECHO_SPECIES[e.species];
  const level = e.level + Math.max(0, Math.floor(s.level * 0.65) - 1);
  return Math.round(sp.baseHp * (1 + (level - 1) * 0.12) * (1 + e.stage * 0.45) * d.echoHp * 1.2);
}
export function echoAtk(s: SaveData, e: EchoInst, d: Derived) {
  const sp = ECHO_SPECIES[e.species];
  const level = e.level + Math.max(0, Math.floor(s.level * 0.65) - 1);
  return (sp.baseAtk * (1 + softGrowth(level - 1, 99, 0.35) * 0.1) + d.atk * 0.12) * (1 + e.stage * 0.45) * d.echoDmg * 1.2;
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
  unlockCombatSkills(s);
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
