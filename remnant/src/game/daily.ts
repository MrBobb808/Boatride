// The daily challenge: one seeded run of ten waves in the Trial arena each
// local day, under one or two special rules drawn from the date. Everyone on
// a given day meets the same rules and the same foes in the same order. One
// ranked attempt per day goes on this device's daily board; practice runs are
// unranked. Like the Boss Rush it leaves the campaign alone: no experience,
// loot or kill counts, and health, energy and Balm are handed back on leaving.
// The first full clear each day pays a small bundle of materials.

import { G } from './ctx';
import { RNG } from '../core/math';
import { settings } from '../core/settings';
import { addMaterial, type SaveData } from './state';
import { addTally } from './valor';

export interface DailySave {
  /** Daily challenge: the local date of the last reward claimed, and how many days were cleared. */
  daily?: { reward?: string; cleared?: number };
}

export type DailyMod = 'double' | 'glass' | 'commander' | 'swift' | 'fasting' | 'mighty' | 'champions';
export const DAILY_MODS: Record<DailyMod, { name: string; desc: string; icon: string }> = {
  double: { name: 'Double Host', desc: 'Twice as many foes in every wave.', icon: 'echo' },
  glass: { name: 'Glass Cannon', desc: 'Elior and his Echoes deal double damage and take double damage.', icon: 'sword' },
  commander: { name: 'Commander\'s Vow', desc: 'Elior\'s own blows deal a fifth of their damage; Echoes deal double. Lead the squad.', icon: 'rally' },
  swift: { name: 'Swift Host', desc: 'Foes move and attack 25% faster.', icon: 'dodge' },
  fasting: { name: 'Fasting', desc: 'No healing of any kind: Balm is sealed and nothing restores health.', icon: 'heal' },
  mighty: { name: 'Mighty Host', desc: 'Foes have 75% more health and hit 20% harder.', icon: 'armor' },
  champions: { name: 'Day of Champions', desc: 'A Champion of the Trial ends every wave.', icon: 'crown' },
};
const MOD_IDS = Object.keys(DAILY_MODS) as DailyMod[];
export const DAILY_WAVES = 10;
/** A full clear inside ten minutes can earn up to double; slower clears earn the waves alone. */
const PAR = 600;

export interface DailyDef { key: string; seed: number; mods: DailyMod[] }

/** The local calendar date (YYYY-MM-DD): a day turns over at the player's own midnight. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** FNV-1a over the date string. */
export function daySeed(key: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function dailyFor(d = new Date()): DailyDef {
  const key = dayKey(d), seed = daySeed(key);
  const rng = new RNG(seed);
  const pool = MOD_IDS.slice();
  const n = rng.next() < 0.45 ? 1 : 2;
  const mods: DailyMod[] = [];
  for (let i = 0; i < n; i++) mods.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return { key, seed, mods };
}

/** The rules a run is under, read by the arena while it plays. */
export interface DailyRun extends DailyDef {
  ranked: boolean;
  rng: RNG;
  /** Health may not rise above this (Fasting). */
  hpCap: number;
  label: string;
  /** Which rules are on, as plain booleans (read every step). */
  on: Record<DailyMod, boolean>;
}

export function beginDaily(ranked: boolean, d = new Date()): DailyRun {
  const def = dailyFor(d);
  // Spawns draw from their own stream so the waves are the same for every player that day.
  return { ...def, ranked, rng: new RNG(def.seed ^ 0x5bd1e995), hpCap: Infinity,
    label: `DAILY ${def.key.slice(5)} · ${def.mods.map((m) => DAILY_MODS[m].name).join(' · ')}${ranked ? '' : ' · PRACTICE'}`,
    on: Object.fromEntries(MOD_IDS.map((m) => [m, def.mods.includes(m)])) as Record<DailyMod, boolean> };
}

export function dailyScore(waves: number, time: number) {
  const done = waves >= DAILY_WAVES;
  return Math.round(waves * 100 * (done ? 1 + Math.max(0, (PAR - time) / PAR) : 1));
}

// ---------------------------------------------------------------- the board (this device)

export interface DailyEntry { id: number; name: string; score: number; waves: number; time: number; level: number; date: string }
const BOARD = 'remnant.daily-board.v1';
const RANKED = 'remnant.daily-ranked.v1';
const KEEP_DAYS = 14, KEEP = 20;

function readAll(): Record<string, DailyEntry[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARD) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

export function loadDaily(key = dayKey()): DailyEntry[] {
  const list = readAll()[key];
  return Array.isArray(list) ? list.filter((e) => e && typeof e.score === 'number') : [];
}

const better = (a: DailyEntry, b: DailyEntry) => b.score - a.score || b.waves - a.waves || a.time - b.time;

/** Add a ranked run to its day's board; returns its place (1 = top). */
export function recordDaily(r: Omit<DailyEntry, 'id' | 'name'>): { entry: DailyEntry; place: number } {
  const all = readAll();
  const entry: DailyEntry = { ...r, id: Date.now(), name: settings.name || 'Elior' };
  const list = [...(all[r.date] ?? []), entry].sort(better).slice(0, KEEP);
  all[r.date] = list;
  // Only the last fortnight is kept.
  for (const k of Object.keys(all).sort().slice(0, -KEEP_DAYS)) delete all[k];
  try { localStorage.setItem(BOARD, JSON.stringify(all)); } catch { /* private mode */ }
  return { entry, place: list.findIndex((e) => e.id === entry.id) + 1 };
}

export function renameDaily(date: string, id: number, name: string) {
  const all = readAll(), e = all[date]?.find((x) => x.id === id);
  if (!e) return;
  e.name = name;
  try { localStorage.setItem(BOARD, JSON.stringify(all)); } catch { /* private mode */ }
}

/** One ranked attempt per day on this device, used up when the run begins. */
export function rankedUsed(key = dayKey()) {
  try { return localStorage.getItem(RANKED) === key; } catch { return false; }
}
export function useRanked(key = dayKey()) {
  try { localStorage.setItem(RANKED, key); } catch { /* private mode: the lock lasts this session */ }
}

// ---------------------------------------------------------------- the reward

export const DAILY_REWARD = { silver: 500, covenant_fragment: 3, radiant_core: 1 };

/** The first full clear of a day pays once per save. Returns false if already claimed. */
export function claimDailyReward(s: SaveData, key: string) {
  const d = s.daily ??= {};
  if (d.reward === key) return false;
  d.reward = key;
  d.cleared = (d.cleared ?? 0) + 1;
  s.silver += DAILY_REWARD.silver;
  addMaterial(s, 'covenant_fragment', DAILY_REWARD.covenant_fragment);
  addMaterial(s, 'radiant_core', DAILY_REWARD.radiant_core);
  addTally('daily');
  return true;
}

export const dailyRewardClaimed = (key = dayKey()) => G.save?.daily?.reward === key;
