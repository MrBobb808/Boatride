// The Watch (POLISH_PLAN §18): the idle mode's numbers, in one place and free of the scene, so the tests and the
// offline pay read the same curves the fight does. Costs grow exponentially and effects linearly with doublings at
// milestones (Pecorella, "The Math of Idle Games"); foes and their pay grow ×1.10 a stage, which a greedy player
// outruns for about a hundred stages before the Ascension is the way on.

import type { EchoRole } from '../../../../remnant/src/game/data';
import type { ShadowId } from './shadows';
import type { DailySave, TallyId } from './daily';
import { featBonus, FEAT } from './feats';

/** What the Watch keeps in the journey's save (`PhaserSave.watch`, optional, so saves stay compatible). */
export interface WatchSave {
  v: 1;
  /** The stage on the wall now, and the best ever reached this Ascension. */
  stage: number;
  best: number;
  /** The best stage over every Ascension (main-game rewards are paid once against it). */
  bestEver: number;
  coins: number;
  /** Elior's Watch level and experience (kept through an Ascension). */
  level: number;
  xp: number;
  /** Upgrade levels by track (reset by an Ascension). */
  up: Partial<Record<TrackId, number>>;
  /** Seals from Ascensions: each one strengthens every blow and every coin. */
  seals: number;
  ascensions: number;
  /** Push on to the next stage by itself (off after a failed boss, until the player tries again). */
  auto: boolean;
  /** When the Watch was last seen (ms since the epoch), and the coins a second it was earning then. */
  last: number;
  rate: number;
  /** The Shadow Mantle's gauge (0–100). */
  gauge: number;
  /** Main-game rewards already paid: gate numbers. */
  paid: number[];
  /** The blade in his hand (an index into BLADES; none for his own sword). Blades are won by gates (paid). */
  blade?: number;
  /** Abilities bought (their levels), the ones he takes into the fight, and whether he uses them by himself. */
  skills?: Partial<Record<AbilityId, number>>;
  loadout?: AbilityId[];
  autoSkills?: boolean;
  /** How fast the wall runs: ×1, ×2, or ×3 once he reaches SPEEDS' level. */
  speed?: 1 | 2 | 3;
  /** Essence of each shadow from major foes; the shadows raised (level, and a role if changed); who fights beside him. */
  essence?: Partial<Record<ShadowId, number>>;
  shadows?: Partial<Record<ShadowId, { lv: number; role?: EchoRole }>>;
  team?: ShadowId[];
  /** What the wall has done, for ever (the quests count from their day's or week's start), and the days' quests, streak
   * and chests (game/watch/daily.ts). */
  tally?: Partial<Record<TallyId, number>>;
  daily?: DailySave;
  /** Feats earned (ids in game/watch/feats.ts, kept through every Ascension), and the one whose title he wears. */
  feats?: string[];
  title?: string;
}

/** Older Watch saves knew Covenant Strike and the Pillar by level alone: they keep them, bought and equipped. */
export function migrateWatch(w: WatchSave) {
  // Repair, never refuse (the save-systems and idle-economy skills): an amount that is not a finite number, or is
  // negative, becomes 0 (a level or a stage 1), so one bad value never stops the Watch from opening or reaches a price.
  const n = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : min);
  w.coins = n(w.coins); w.xp = n(w.xp); w.rate = n(w.rate); w.gauge = Math.min(100, n(w.gauge));
  w.seals = Math.floor(n(w.seals)); w.ascensions = Math.floor(n(w.ascensions));
  w.level = Math.floor(n(w.level, 1)); w.stage = Math.floor(n(w.stage, 1));
  w.best = Math.max(w.stage, Math.floor(n(w.best, 1))); w.bestEver = Math.max(w.best, Math.floor(n(w.bestEver, 1)));
  if (typeof w.last !== 'number' || !Number.isFinite(w.last)) w.last = Date.now();
  w.up = w.up && typeof w.up === 'object' ? w.up : {};
  for (const k of Object.keys(w.up) as TrackId[]) w.up[k] = Math.floor(n(w.up[k]));
  w.paid = Array.isArray(w.paid) ? w.paid.filter((g) => Number.isFinite(g)) : [];
  if (w.essence) for (const k of Object.keys(w.essence) as ShadowId[]) w.essence[k] = Math.floor(n(w.essence[k]));
  if (w.tally) for (const k of Object.keys(w.tally) as TallyId[]) w.tally[k] = Math.floor(n(w.tally[k]));
  if (w.daily) { w.daily.chests = Math.floor(n(w.daily.chests)); w.daily.streak = Math.max(1, Math.floor(n(w.daily.streak))); }
  // Feats: only ones that exist, once each; a title only from a feat earned.
  if (w.feats !== undefined) w.feats = Array.isArray(w.feats) ? [...new Set(w.feats.filter((id) => typeof id === 'string' && FEAT[id]))] : [];
  if (w.title !== undefined && !w.feats?.includes(w.title)) delete w.title;
  // Shadows used to join by level alone: an older watch keeps as many as it had, raised and in the team.
  if (!w.shadows) {
    w.shadows = {};
    const had = (['sentinel', 'knight', 'archer', 'lion', 'brute', 'bulwark'] as ShadowId[]).slice(0, shadowsAt(w.level));
    for (const id of had) w.shadows[id] = { lv: 1 };
    w.team = had;
  }
  w.essence ??= {};
  w.team = (w.team ?? []).filter((id) => (w.shadows![id]?.lv ?? 0) > 0).slice(0, shadowsAt(w.level));
  if (!w.skills) {
    w.skills = {};
    for (const a of ABILITIES) if (a.id === 'strike' || a.id === 'pillar') { if (w.level >= a.level) w.skills[a.id] = 1; }
  }
  w.loadout = (w.loadout ?? (Object.keys(w.skills) as AbilityId[])).filter((id) => (w.skills![id] ?? 0) > 0).slice(0, slotsAt(w.level));
  w.autoSkills ??= true;
  if (w.speed !== 1 && w.speed !== 2 && w.speed !== 3) w.speed = 1;
  if (w.speed > 1 && w.level < SPEEDS[w.speed]) w.speed = 1;
  return w;
}

export const newWatch = (): WatchSave => ({ v: 1, stage: 1, best: 1, bestEver: 1, coins: 0, level: 1, xp: 0, up: {}, seals: 0, ascensions: 0, auto: true, last: Date.now(), rate: 0, gauge: 0, paid: [] });

// ---------------------------------------------------------------- the wall

/** Ten foes to a stage; every tenth stage is a gate's boss. */
export const KILLS_PER_STAGE = 10;
export const BOSS_TIME = 30;
export const isBoss = (stage: number) => stage % 10 === 0;
export const gateOf = (stage: number) => Math.ceil(stage / 10);
export const foeHp = (stage: number) => 12 * Math.pow(1.1, stage - 1) * (isBoss(stage) ? 9 : 1);
export const foeDmg = (stage: number) => 3 * Math.pow(1.095, stage - 1) * (isBoss(stage) ? 2.5 : 1);
export const foeCoins = (stage: number) => 2 * Math.pow(1.1, stage - 1) * (isBoss(stage) ? 12 : 1);
export const foeXp = (stage: number) => Math.ceil(stage * (isBoss(stage) ? 6 : 1));
/** Seconds between a foe's blows. */
export const FOE_RATE = 1.5;

// ---------------------------------------------------------------- the upgrades

export type TrackId = 'attack' | 'health' | 'speed' | 'crit' | 'regen' | 'critDmg' | 'defense' | 'coins';
export interface Track {
  id: TrackId; name: string; base: number; rate: number;
  /** What one level gives, for the card. */
  per: string;
  /** What opens it: another track's level, or a stage reached. */
  opens?: { track: TrackId; level: number } | { stage: number };
  /** The highest level that still does anything (a cap), if any. */
  max?: number;
}
export const TRACKS: Track[] = [
  { id: 'attack', name: 'Attack', base: 6, rate: 1.07, per: '+4 damage a level' },
  { id: 'health', name: 'Health', base: 6, rate: 1.07, per: '+20 health a level' },
  { id: 'speed', name: 'Attack Speed', base: 25, rate: 1.12, per: '+1% swings a level, to ×2', max: 100 },
  { id: 'crit', name: 'Critical Chance', base: 200, rate: 1.15, per: '+0.5% a level, to 60%', opens: { track: 'health', level: 40 }, max: 120 },
  { id: 'regen', name: 'Health Regen', base: 300, rate: 1.1, per: '+0.2%/s a level, to 5%', opens: { track: 'crit', level: 20 }, max: 25 },
  { id: 'critDmg', name: 'Critical Damage', base: 500, rate: 1.1, per: '+5% a level', opens: { track: 'crit', level: 100 } },
  { id: 'defense', name: 'Defense', base: 800, rate: 1.1, per: 'softens every blow more', opens: { stage: 20 } },
  { id: 'coins', name: 'Coin Find', base: 1000, rate: 1.11, per: '+2% coins a level', opens: { stage: 30 } },
];
export const TRACK: Record<TrackId, Track> = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<TrackId, Track>;

export const lvlOf = (w: WatchSave, id: TrackId) => w.up[id] ?? 0;
export const cost = (id: TrackId, level: number) => Math.ceil(TRACK[id].base * Math.pow(TRACK[id].rate, level));
/** The cost of `n` more levels from `level` (a geometric sum). */
export function costN(id: TrackId, level: number, n: number) {
  const r = TRACK[id].rate;
  return Math.ceil(TRACK[id].base * Math.pow(r, level) * (Math.pow(r, n) - 1) / (r - 1));
}
/** How many levels the coins buy now (at most `cap`). */
export function affordable(id: TrackId, level: number, coins: number, cap = 1e6) {
  const r = TRACK[id].rate, c0 = TRACK[id].base * Math.pow(r, level);
  const n = Math.floor(Math.log(1 + (coins * (r - 1)) / c0) / Math.log(r));
  const max = TRACK[id].max !== undefined ? Math.max(0, TRACK[id].max! - level) : cap;
  return Math.max(0, Math.min(n, cap, max));
}
export function isOpen(w: WatchSave, t: Track) {
  if (!t.opens) return true;
  return 'track' in t.opens ? lvlOf(w, t.opens.track) >= t.opens.level : w.best >= t.opens.stage;
}
export function opensText(t: Track) {
  if (!t.opens) return '';
  return 'track' in t.opens ? `${TRACK[t.opens.track].name} level ${t.opens.level} opens it` : `Reaching stage ${t.opens.stage} opens it`;
}
/** ×2 at levels 25, 50, 100, 200, 400… */
export const milestones = (level: number) => { let m = 1; for (let at = 25; at <= level; at = at === 25 ? 50 : at * 2) m *= 2; return m; };
/** The next level that doubles a track. */
export const nextMilestone = (level: number) => { let at = 25; while (at <= level) at = at === 25 ? 50 : at * 2; return at; };

// ---------------------------------------------------------------- Elior here

/** Experience to the next Watch level. */
export const watchXpNext = (level: number) => Math.ceil(20 * Math.pow(level, 1.6));
/** What each Watch level adds to his blows and health, and what the Seals add to blows and coins. */
export const levelBonus = (level: number) => 1 + 0.03 * (level - 1);
// Seals grow on each other (×1.02 each over the 5% each adds), so every Ascension carries the wall further than the last
// (POLISH_PLAN §19 G12: with 5% alone the best stage stalled near 130 from the fourth on). Never weaker than before.
export const sealBonus = (seals: number) => (1 + 0.05 * seals) * Math.pow(1.02, seals);

/** The armoury: a blade for each of the first eight gates' first fall (CC0 swords, art/incoming/cc0), each heavier. */
export const BLADES: { name: string; atk: number }[] = [
  { name: "Pilgrim's Blade", atk: 1.1 },
  { name: 'Cedar Sword', atk: 1.2 },
  { name: 'Nightsteel', atk: 1.32 },
  { name: 'Gilded Edge', atk: 1.46 },
  { name: 'Ember Rune', atk: 1.62 },
  { name: 'Frostwake', atk: 1.8 },
  { name: 'Sunbrand', atk: 2 },
  { name: 'Covenant Cross', atk: 2.25 },
];
/** The blades won: the first eight gates whose boss has fallen. */
export const bladesWon = (w: WatchSave) => BLADES.map((_, i) => w.paid.includes(i + 1));
export const bladeOf = (w: WatchSave) => (w.blade !== undefined && w.blade >= 0 && bladesWon(w)[w.blade] ? w.blade : -1);

export interface WatchStats { atk: number; maxHp: number; aspd: number; crit: number; critDmg: number; regen: number; dr: number; coinMult: number }
export function watchStats(w: WatchSave): WatchStats {
  const L = (id: TrackId) => lvlOf(w, id), lb = levelBonus(w.level), sb = sealBonus(w.seals), fb = featBonus(w);
  return {
    atk: (10 + 4 * L('attack')) * milestones(L('attack')) * lb * sb * fb.atk * (bladeOf(w) >= 0 ? BLADES[bladeOf(w)].atk : 1),
    maxHp: (100 + 20 * L('health')) * milestones(L('health')) * lb * fb.hp,
    aspd: Math.min(2, 1 + 0.01 * L('speed')),
    crit: Math.min(0.6, 0.005 * L('crit')),
    critDmg: 1.5 + 0.05 * L('critDmg'),
    regen: Math.min(0.05, 0.002 * L('regen')),
    // Softens toward three quarters of every blow, never all of it.
    dr: 0.75 * (1 - Math.pow(0.99, L('defense'))),
    coinMult: (1 + 0.02 * L('coins')) * sb * fb.coins,
  };
}

/** A track's stat as its card shows it: what he has now, or with `more` levels bought. */
export function trackStat(w: WatchSave, id: TrackId, more = 0): string {
  const st = watchStats(more ? { ...w, up: { ...w.up, [id]: lvlOf(w, id) + more } } : w);
  switch (id) {
    case 'attack': return fmt(st.atk);
    case 'health': return fmt(st.maxHp);
    case 'speed': return `${st.aspd.toFixed(2)}/s`;
    case 'crit': return `${(st.crit * 100).toFixed(1)}%`;
    case 'regen': return `${fmt(st.maxHp * st.regen)}/s`;
    case 'critDmg': return `×${st.critDmg.toFixed(2)}`;
    case 'defense': return `${(st.dr * 100).toFixed(1)}%`;
    case 'coins': return `×${st.coinMult.toFixed(2)}`;
  }
}
/** His damage a second, on average, from his swings alone (crits counted). */
export const dpsOf = (st: WatchStats) => st.atk * st.aspd * (1 + st.crit * (st.critDmg - 1));

/** The Watch level's milestones (POLISH_PLAN §18d): what each opens, for the Hero card and the level-up toast. */
export const UNLOCKS: [number, string][] = [
  [5, 'Covenant Strike (Skills): a heavy blow with all his weight'],
  [8, 'A shadow slot: raise a shadow with essence and set it beside him (Shadows)'],
  [10, 'Pillar of Fire (Skills): white fire on the furthest foes'],
  [15, 'Phantom Step (Skills): a slowed, cinematic cut through every foe'],
  [20, 'A second shadow slot'],
  [22, 'Whirlwind (Skills): a sweep through every foe near him'],
  [25, 'The Shadow Mantle: kills fill the gauge; transform for heavier, faster blows · a third ability slot'],
  [30, 'Rising Comet (Skills): up, and down like a falling star'],
  [40, 'A third shadow slot · Balm (Skills) · the wall at ×3 speed'],
  [60, 'Last Watch (Skills): a slowed flurry and a closing blow · a fourth ability slot'],
  [70, 'A fourth shadow slot'],
  [100, 'A fifth ability slot'],
  [110, 'A fifth shadow slot'],
  [150, 'A sixth shadow slot · Tirzah comes to the wall (a later update)'],
  [300, 'Uri the flame-caller (a later update)'],
];
/** The shadows' team slots open at these levels (the shadows themselves are raised with essence: game/watch/shadows.ts). */
export const SHADOW_LEVELS = [8, 20, 40, 70, 110, 150];
export const shadowsAt = (level: number) => SHADOW_LEVELS.filter((l) => level >= l).length;
// ---------------------------------------------------------------- abilities (the Skills tab)

export type AbilityId = 'strike' | 'pillar' | 'phantom' | 'storm' | 'comet' | 'balm' | 'judgment';
export interface Ability {
  id: AbilityId; name: string;
  /** The Watch level that opens it, and the coins the first level costs (each level after costs ×2.1). */
  level: number; cost: number;
  /** Seconds between uses, and how many of his blows each hit is worth, at level 1. */
  cd: number; mult: number;
  desc: string;
}
export const ABILITIES: Ability[] = [
  { id: 'strike', name: 'Covenant Strike', level: 5, cost: 60, cd: 9, mult: 6, desc: 'A heavy blow with all his weight on the foe before him.' },
  { id: 'pillar', name: 'Pillar of Fire', level: 10, cost: 300, cd: 14, mult: 4, desc: 'A column of white fire on the furthest foe, and those beside it.' },
  { id: 'phantom', name: 'Phantom Step', level: 15, cost: 1500, cd: 20, mult: 3, desc: 'He steps through the dark from foe to foe, a cut on each, slowed so every blow is seen.' },
  { id: 'storm', name: 'Whirlwind', level: 22, cost: 6000, cd: 16, mult: 2.5, desc: 'A spinning sweep that cuts every foe near him.' },
  { id: 'comet', name: 'Rising Comet', level: 30, cost: 30000, cd: 18, mult: 10, desc: 'He throws the foe up and comes down on it like a falling star.' },
  { id: 'balm', name: 'Balm', level: 40, cost: 150000, cd: 30, mult: 0.35, desc: 'Heals a part of his health and softens blows for six seconds.' },
  { id: 'judgment', name: 'Last Watch', level: 60, cost: 2e6, cd: 36, mult: 2.4, desc: 'A slowed flurry of seven cuts and a closing blow on the foe before him.' },
];
export const ABILITY: Record<AbilityId, Ability> = Object.fromEntries(ABILITIES.map((a) => [a.id, a])) as Record<AbilityId, Ability>;
export const ABILITY_MAX = 25;
export const skillLvl = (w: WatchSave, id: AbilityId) => w.skills?.[id] ?? 0;
/** The coins for the next level (from `lv`; 0 buys it). */
export const abilityCost = (id: AbilityId, lv: number) => Math.ceil(ABILITY[id].cost * Math.pow(2.1, lv));
/** Each level adds a fifth of its blows (Balm: a twentieth more healing) and takes 2% off its wait (to 60%). */
export const abilityMult = (id: AbilityId, lv: number) => ABILITY[id].mult * (1 + (id === 'balm' ? 0.05 : 0.2) * Math.max(0, lv - 1));
export const abilityCd = (id: AbilityId, lv: number) => ABILITY[id].cd * Math.max(0.6, 1 - 0.02 * Math.max(0, lv - 1));
/** How many abilities he takes into the fight. */
export const slotsAt = (level: number) => 2 + (level >= 25 ? 1 : 0) + (level >= 60 ? 1 : 0) + (level >= 100 ? 1 : 0);
/** The wall's speeds and the Watch level each opens at. */
export const SPEEDS: Record<1 | 2 | 3, number> = { 1: 1, 2: 1, 3: 40 };

/** Rush stages: on every even stage (not a gate's boss) he runs at them, cutting through as he goes. */
export const isRush = (stage: number) => !isBoss(stage) && stage % 2 === 0;
export const MANTLE = { level: 25, time: 15, dmg: 1.7, speed: 1.2, perKill: 4 };

// ---------------------------------------------------------------- away, and the Ascension

// Away, the wall goes on at half speed: game/watch/offline.ts.
/** The Ascension opens at stage 60; Seals grow with the square root of how far past it the run went. */
export const ASCEND_AT = 60;
export const sealsFor = (best: number) => (best < ASCEND_AT ? 0 : Math.floor(Math.sqrt(best - ASCEND_AT + 1) * 3));

/** Main-game rewards, once each, the first time a gate's boss falls: silver, and two capes. */
export const silverFor = (gate: number) => 25 * gate;
export const CAPE_AT: Record<number, string> = { 10: 'midnight', 25: 'lamp' };

// ---------------------------------------------------------------- numbers

const SUFFIX = ['', 'K', 'M', 'B', 'T'];
/** 999, 1.20K, 34.5M, 567T, then aa, ab… for the idle game's big numbers: three significant figures. It rounds
 * first and only then picks the digits and the suffix, so 999,950 reads 1.00M (not "1000K") and 9,999 reads 10.0K (not
 * "10.00K"): the rollover the idle-economy skill warns of (.claude/skills/roblox-simulator-economy). */
export function fmt(n: number) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return String(Math.floor(n));
  let e = Math.floor(Math.log10(n) / 3);
  for (;;) {
    const v = n / Math.pow(1000, e), r = Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2));
    // Rounded up to the next thousand: the next suffix says it.
    if (r >= 1000) { e++; continue; }
    const s = r.toFixed(r >= 100 ? 0 : r >= 10 ? 1 : 2);
    if (e < SUFFIX.length) return s + SUFFIX[e];
    const k = e - SUFFIX.length;
    return s + String.fromCharCode(97 + Math.floor(k / 26)) + String.fromCharCode(97 + (k % 26));
  }
}
