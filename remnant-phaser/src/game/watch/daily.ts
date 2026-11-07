// The Watch's days (POLISH_PLAN §18k and §19 phase 3; the owner's answers of 7 November 2026): three daily quests and
// two weekly goals drawn from what the wall does anyway, a login streak whose calendar pays more as it runs (one missed
// day a week is forgiven), and chests that pay Watch rewards only (coins, essence, now and then a Seal), with their odds
// shown and a pity count that guarantees a rare or better within a few opens. Pure numbers and the save; the UI is in
// ui.ts and the scene feeds the tallies.
import * as D from './defs';
import type { ShadowId } from './shadows';

/** What the wall counts, for ever (quests measure from the day's or week's start). */
export type TallyId = 'kills' | 'stages' | 'gates' | 'elites' | 'casts' | 'buys';
export interface Quest { id: string; tally: TallyId; goal: number; text: string; claimed?: boolean }
export interface DailySave {
  /** The local day and ISO week the quests were drawn for, and the tallies when they began. */
  day: string; week: string;
  base: Partial<Record<TallyId, number>>; weekBase: Partial<Record<TallyId, number>>;
  quests: Quest[]; weekly: Quest[]; allClaimed?: boolean;
  /** The streak: days in a row, the last day counted, whether today's calendar reward is taken, and the week a miss was forgiven. */
  streak: number; lastDay: string; streakClaimed: boolean; forgivenWeek?: string;
  /** Chests waiting, and opens since the last rare (or better) and the last epic (or better). */
  chests: number; sinceRare: number; sinceEpic: number;
}

// ---------------------------------------------------------------- days

const pad = (n: number) => String(n).padStart(2, '0');
/** The local day, YYYY-MM-DD (days turn at the player's own midnight). */
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** Whole days between two day keys. */
const dayGap = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
/** The ISO week a day falls in (weeks start on Monday), YYYY-Www. */
export function weekKey(t: number) {
  const d = new Date(t); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const y = d.getFullYear(), jan4 = new Date(y, 0, 4, 12);
  const wk = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${y}-W${pad(wk)}`;
}
/** A small seeded random (the day's quests are the same however often the Watch opens). */
const seeded = (key: string) => { let h = 2166136261; for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- quests

const DAILY: Omit<Quest, 'id'>[] = [
  { tally: 'kills', goal: 400, text: 'Fell 400 foes' },
  { tally: 'stages', goal: 25, text: 'Clear 25 stages' },
  { tally: 'casts', goal: 30, text: 'Use 30 abilities' },
  { tally: 'gates', goal: 1, text: "Fell a gate's holder" },
  { tally: 'elites', goal: 8, text: 'Fell 8 gold elites' },
  { tally: 'buys', goal: 40, text: 'Buy 40 upgrade levels' },
];
const WEEKLY: Omit<Quest, 'id'>[] = [
  { tally: 'kills', goal: 5000, text: 'Fell 5,000 foes this week' },
  { tally: 'gates', goal: 8, text: 'Fell 8 gate holders this week' },
  { tally: 'elites', goal: 60, text: 'Fell 60 gold elites this week' },
  { tally: 'stages', goal: 200, text: 'Clear 200 stages this week' },
];
/** Chests for each daily quest, all three, each weekly goal; and the streak calendar's chests by day of the run. */
export const PAY = { quest: 1, all: 1, weekly: 3 };
export const CALENDAR = [1, 1, 2, 1, 2, 2, 4];

const draw = (pool: Omit<Quest, 'id'>[], n: number, key: string): Quest[] => {
  const r = seeded(key), left = [...pool], out: Quest[] = [];
  while (out.length < n && left.length) { const q = left.splice(Math.floor(r() * left.length), 1)[0]; out.push({ ...q, id: `${key}:${q.tally}` }); }
  return out;
};

export const tallyOf = (w: D.WatchSave, id: TallyId) => w.tally?.[id] ?? 0;
/** How far a quest has come (to its goal). */
export const progress = (w: D.WatchSave, q: Quest, weekly = false) => {
  const d = w.daily!, base = (weekly ? d.weekBase : d.base)[q.tally] ?? 0;
  return Math.min(q.goal, tallyOf(w, q.tally) - base);
};
export const done = (w: D.WatchSave, q: Quest, weekly = false) => progress(w, q, weekly) >= q.goal;

/** Count one more of something the wall did. */
export function tally(w: D.WatchSave, id: TallyId, n = 1) { (w.tally ??= {})[id] = (w.tally[id] ?? 0) + n; }

/** Bring the days up to `now`: a new day draws new quests and moves the streak (one miss a week forgiven); a new week
 * draws new goals. Safe to call often. Returns what changed, for a toast. */
export function rollDays(w: D.WatchSave, now = Date.now()): { newDay: boolean; streak: number; forgiven: boolean; reset: boolean } {
  const today = dayKey(now), week = weekKey(now), t = { ...(w.tally ?? {}) };
  const out = { newDay: false, streak: w.daily?.streak ?? 0, forgiven: false, reset: false };
  if (!w.daily) {
    w.daily = { day: today, week, base: t, weekBase: t, quests: draw(DAILY, 3, today), weekly: draw(WEEKLY, 2, week),
      streak: 1, lastDay: today, streakClaimed: false, chests: 0, sinceRare: 0, sinceEpic: 0 };
    return { ...out, newDay: true, streak: 1 };
  }
  const d = w.daily;
  if (d.week !== week) { d.week = week; d.weekBase = t; d.weekly = draw(WEEKLY, 2, week); }
  if (d.day === today) return out;
  // A new day: the streak goes on from yesterday; a single missed day is forgiven once a week; more starts it again.
  const gap = dayGap(d.lastDay, today);
  if (gap === 1) d.streak++;
  else if (gap === 2 && d.forgivenWeek !== week) { d.streak++; d.forgivenWeek = week; out.forgiven = true; }
  else if (gap > 1) { d.streak = 1; out.reset = true; }
  d.lastDay = today; d.day = today; d.base = t; d.quests = draw(DAILY, 3, today); d.allClaimed = false; d.streakClaimed = false;
  return { ...out, newDay: true, streak: d.streak };
}

/** The streak calendar's reward today (the seven-day run repeats). */
export const calendarChests = (streak: number) => CALENDAR[(Math.max(1, streak) - 1) % CALENDAR.length];

/** Take a finished quest's chests (or the streak's, or the all-three bonus). Returns the chests given. */
export function claim(w: D.WatchSave, what: 'streak' | 'all' | { id: string }): number {
  const d = w.daily!;
  if (what === 'streak') { if (d.streakClaimed) return 0; d.streakClaimed = true; const n = calendarChests(d.streak); d.chests += n; return n; }
  if (what === 'all') {
    if (d.allClaimed || !d.quests.every((q) => q.claimed)) return 0;
    d.allClaimed = true; d.chests += PAY.all; return PAY.all;
  }
  const weekly = d.weekly.find((q) => q.id === what.id), q = weekly ?? d.quests.find((x) => x.id === what.id);
  if (!q || q.claimed || !done(w, q, !!weekly)) return 0;
  q.claimed = true;
  const n = weekly ? PAY.weekly : PAY.quest;
  d.chests += n;
  return n;
}

// ---------------------------------------------------------------- chests

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
/** Odds (shown in full on the Daily tab), and the pity: a rare or better within PITY_RARE opens, an epic within PITY_EPIC. */
export const ODDS: [Rarity, number][] = [['common', 0.62], ['rare', 0.28], ['epic', 0.09], ['legendary', 0.01]];
export const PITY_RARE = 5, PITY_EPIC = 20;
/** What each rarity pays: stages' worth of coins at the best stage reached, essence, and Seals. */
export const CHEST: Record<Rarity, { stages: number; essence: number; seals: number }> = {
  common: { stages: 6, essence: 0, seals: 0 },
  rare: { stages: 15, essence: 3, seals: 0 },
  epic: { stages: 40, essence: 8, seals: 0 },
  legendary: { stages: 100, essence: 20, seals: 1 },
};
export interface ChestPrize { rarity: Rarity; coins: number; essence: [ShadowId, number] | null; seals: number }

/** Open one chest. `rnd` is 0–1 (Math.random in play; fixed in tests). The species of essence comes from `pickShadow`. */
export function openChest(w: D.WatchSave, rnd: number, pickShadow: (r: number) => ShadowId): ChestPrize | null {
  const d = w.daily;
  if (!d || d.chests <= 0) return null;
  d.chests--;
  let acc = 0, rarity: Rarity = 'common';
  for (const [r, p] of ODDS) { acc += p; if (rnd < acc) { rarity = r; break; } }
  // The pity: the opens since the last rare (epic) or better guarantee one when they reach the count.
  if (d.sinceEpic + 1 >= PITY_EPIC && (rarity === 'common' || rarity === 'rare')) rarity = 'epic';
  else if (d.sinceRare + 1 >= PITY_RARE && rarity === 'common') rarity = 'rare';
  d.sinceRare = rarity === 'common' ? d.sinceRare + 1 : 0;
  d.sinceEpic = rarity === 'common' || rarity === 'rare' ? d.sinceEpic + 1 : 0;
  const pay = CHEST[rarity], st = D.watchStats(w);
  const coins = Math.floor(D.foeCoins(Math.max(1, w.best)) * D.KILLS_PER_STAGE * pay.stages * st.coinMult);
  const essence: [ShadowId, number] | null = pay.essence ? [pickShadow((rnd * 7.31) % 1), pay.essence] : null;
  w.coins += coins;
  if (essence) (w.essence ??= {})[essence[0]] = (w.essence[essence[0]] ?? 0) + essence[1];
  w.seals += pay.seals;
  return { rarity, coins, essence, seals: pay.seals };
}

/** Things to claim on the Daily tab (for the dot on its tab). */
export function claimable(w: D.WatchSave) {
  const d = w.daily;
  if (!d) return 0;
  return (d.streakClaimed ? 0 : 1) + d.quests.filter((q) => !q.claimed && done(w, q)).length + d.weekly.filter((q) => !q.claimed && done(w, q, true)).length
    + (!d.allClaimed && d.quests.every((q) => q.claimed) ? 1 : 0) + (d.chests > 0 ? 1 : 0);
}
