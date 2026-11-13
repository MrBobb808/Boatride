// The Day (NEXT_PLAN.md B1–B2): one object for the player's local day, for the whole game. Five calls drawn from what
// is open to this player (never a mode still locked), three larger ones for the week, one streak (a day counts when
// the game is opened; one missed day a week is forgiven, the Watch's rule, and the Watch's own streak runs with it),
// and the Chronicle: a free track of thirty steps, a new one every calendar month, paid in marks from the calls.
//
// Pull, never punishment: a call pays the moment it is done, wherever the player is; nothing earned is taken back; a
// month's unearned cape goes on an owed list that spare marks buy back later.
//
// Progress is read from what the modes already count (foes felled, Watch stages, Horde foes, the Daily Challenge) and
// from four small counters kept in the save's flags (bosses felled, Trial rounds, hooks, parries), measured from the
// day's or week's start. Pure numbers and the save: no scene, no DOM.
import { makeItem, addMaterial, type SaveData } from '../../../remnant/src/game/state';
import { ITEMS } from '../../../remnant/src/game/data';
import { CAPES } from '../../../remnant/src/game/valor';
import { rollLegend } from '../../../remnant/src/game/legendary';
import { dayKey, weekKey, rollDays } from './watch/daily';
import type { PhaserSave } from './save';

export type DayTally = 'foes' | 'bosses' | 'trialRounds' | 'dailyRuns' | 'hordeKills' | 'hordeRuns' | 'watchStages' | 'hooks' | 'parries' | 'dayBoss' | 'refined' | 'dayHorde';
/** Where a call is played (the home screen's button starts it). */
export type DayMode = 'journey' | 'gauntlet' | 'trial' | 'daily' | 'horde' | 'watch' | 'dayboss' | 'chapters';
export interface DayCall { id: string; tally: DayTally; goal: number; text: string; mins: number; mode: DayMode; paid?: boolean }
export interface DaySave {
  day: string; week: string;
  base: Partial<Record<DayTally, number>>; weekBase: Partial<Record<DayTally, number>>;
  calls: DayCall[]; weekly: DayCall[]; allPaid?: boolean;
  /** Days in a row the game was opened, the last day counted, and the week a miss was forgiven. */
  streak: number; lastDay: string; forgivenWeek?: string; bestStreak?: number;
  /** The Chronicle: its month, the marks earned in it, and the steps paid. */
  chron: { month: string; marks: number; step: number };
  /** Marks earned past a finished Chronicle (and a closed month's remainder): they buy back what is owed. */
  spare?: number;
  /** Capes of closed months that were not reached. */
  owed?: string[];
}
type Flags = Record<string, number | string | boolean>;

// ---------------------------------------------------------------- what the game counts

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
/** One more of something only a counter can know (a boss felled, a Trial round, a hook, a parry). */
export function dayCount(s: SaveData, id: 'boss_falls' | 'trial_rounds' | 'chain_hooks' | 'parries' | 'day_boss_falls' | 'day_boss_medals' | 'fire_clears', n = 1) {
  const f = s.flags as Flags;
  f[id] = num(f[id]) + n;
}
export function tallyNow(s: PhaserSave, id: DayTally): number {
  const f = (s.flags ?? {}) as Flags;
  switch (id) {
    // The Horde banks its foes into the same count; the journey's are the rest.
    case 'foes': return Math.max(0, num(s.kills) - num(s.horde?.kills));
    case 'bosses': return num(f.boss_falls);
    case 'trialRounds': return num(f.trial_rounds);
    case 'dailyRuns': return num(s.daily?.cleared);
    case 'hordeKills': return num(s.horde?.kills);
    case 'hordeRuns': return num(s.horde?.runs);
    case 'watchStages': return num(s.watch?.tally?.stages);
    case 'hooks': return num(f.chain_hooks);
    case 'parries': return num(f.parries);
    case 'dayBoss': return num(f.day_boss_falls);
    // Chapters finished under the Refiner's Fire, at any heat (counted by World when the last boss falls).
    case 'refined': return num(f.fire_clears);
    case 'dayHorde': return num(f.day_horde_runs);
  }
}
const ALL: DayTally[] = ['foes', 'bosses', 'trialRounds', 'dailyRuns', 'hordeKills', 'hordeRuns', 'watchStages', 'hooks', 'parries', 'dayBoss', 'refined', 'dayHorde'];
const snapshot = (s: PhaserSave) => Object.fromEntries(ALL.map((id) => [id, tallyNow(s, id)])) as Record<DayTally, number>;

// ---------------------------------------------------------------- the calls

/** The Trial and its kin open with the covenant relic (the home screen's rule). */
const trialOpen = (s: PhaserSave) => !!s.flags.relic_taken || num((s.flags as Flags).trial_best) > 0 || num((s.flags as Flags).boss_trial_best) > 0;
// ---------------------------------------------------------------- the day's boss

/** Each chapter's last boss (game/fire.ts FINAL_BOSS), by the name the Today card shows. */
export const DAY_BOSSES: [chapter: number, key: string, name: string][] = [
  [1, 'idol', 'the Gilded Idol'], [2, 'marshal', 'the Crimson Marshal'], [3, 'locust_king', 'the Locust King'], [4, 'golden_image', 'the Image of Gold'],
  [5, 'weigher', 'the Weigher'], [6, 'persia_prince', 'the Prince of Persia'], [7, 'beast_monarch', 'Varkhos'], [8, 'plague_monarch', 'Morvane'],
  [9, 'cinder_monarch', 'Azkar'], [10, 'grecia_prince', 'the Prince of Grecia'], [11, 'nation_gods', 'the Gods of the Nations'], [12, 'north_king', 'the King of the North'],
  [13, 'tyrus_prince', 'the Prince of Tyrus'],
];
const AFFLICTIONS = [['tough', 'Tried Metal'], ['fierce', 'Hotter Coals'], ['fasting', 'Fasting']] as const;
export interface DayBoss { chapter: number; key: string; name: string; cond: (typeof AFFLICTIONS)[number][0]; condName: string }
const chapterDone = (s: PhaserSave, n: number) => !!(n === 1 ? s.flags.ending_done : s.flags[`ch${n}_done`]);
/** Today's boss: one whose chapter is finished, chosen by the date, under one of the Fire's conditions. */
export function dayBoss(s: PhaserSave, now = Date.now()): DayBoss | null {
  const open = DAY_BOSSES.filter(([n]) => chapterDone(s, n));
  if (!open.length) return null;
  const r = seeded('boss:' + dayKey(now)), [chapter, key, name] = open[Math.floor(r() * open.length)], [cond, condName] = AFFLICTIONS[Math.floor(r() * AFFLICTIONS.length)];
  return { chapter, key, name, cond, condName };
}
/** The day's boss has fallen in its own fight: once a day. Returns whether it counted. A fall without a wound
 *  (`clean`, Valor's own judgement of the fight) also wins the day's medal (`day_boss_medals` counts them). */
export function dayBossFell(s: PhaserSave, key: string, now = Date.now(), clean = false) {
  const f = s.flags as Flags, today = dayKey(now), b = dayBoss(s, now);
  if (!b || b.key !== key || f.day_boss_run !== today || f.day_boss_done === today) return false;
  f.day_boss_done = today;
  dayCount(s, 'day_boss_falls');
  if (clean) { f.day_boss_medal = today; dayCount(s, 'day_boss_medals'); }
  return true;
}

type Def = Omit<DayCall, 'id' | 'paid'> & { group: string; open?: (s: PhaserSave) => boolean };
const DAILY: Def[] = [
  { group: 'journey', tally: 'foes', goal: 60, text: 'Fell 60 foes on the journey', mins: 12, mode: 'journey' },
  { group: 'journey', tally: 'parries', goal: 10, text: 'Parry 10 blows', mins: 8, mode: 'journey' },
  { group: 'journey', tally: 'hooks', goal: 15, text: 'Hook 15 foes with the Sundered Chains', mins: 8, mode: 'journey', open: (s) => !!s.flags.sundered_chains },
  { group: 'boss', tally: 'bosses', goal: 1, text: 'Fell a boss (the Gauntlet, a replay or the story)', mins: 10, mode: 'gauntlet', open: (s) => trialOpen(s) && (s.defeated?.length ?? 0) > 0 },
  { group: 'dayboss', tally: 'dayBoss', goal: 1, text: 'Fell the day\'s boss', mins: 10, mode: 'dayboss', open: (s) => !!dayBoss(s) },
  { group: 'trial', tally: 'trialRounds', goal: 8, text: 'Clear 8 rounds of the Trial', mins: 12, mode: 'trial', open: trialOpen },
  { group: 'daily', tally: 'dailyRuns', goal: 1, text: 'Clear today\'s Daily Challenge', mins: 10, mode: 'daily', open: trialOpen },
  { group: 'horde', tally: 'hordeKills', goal: 400, text: 'Fell 400 foes in the Horde', mins: 15, mode: 'horde' },
  { group: 'horde', tally: 'hordeRuns', goal: 1, text: 'Finish a run of the Horde', mins: 15, mode: 'horde' },
  { group: 'horde', tally: 'dayHorde', goal: 1, text: 'Run today\'s Horde (the camp\'s third choice)', mins: 15, mode: 'horde', open: (s) => (s.horde?.runs ?? 0) > 0 },
  { group: 'watch', tally: 'watchStages', goal: 20, text: 'Clear 20 stages on the Watch', mins: 10, mode: 'watch' },
];
const WEEKLY: Def[] = [
  { group: 'journey', tally: 'foes', goal: 500, text: 'Fell 500 foes on the journey this week', mins: 0, mode: 'journey' },
  { group: 'boss', tally: 'bosses', goal: 7, text: 'Fell 7 bosses this week', mins: 0, mode: 'gauntlet', open: (s) => trialOpen(s) && (s.defeated?.length ?? 0) > 0 },
  { group: 'trial', tally: 'trialRounds', goal: 40, text: 'Clear 40 rounds of the Trial this week', mins: 0, mode: 'trial', open: trialOpen },
  { group: 'daily', tally: 'dailyRuns', goal: 4, text: 'Clear the Daily Challenge on 4 days this week', mins: 0, mode: 'daily', open: trialOpen },
  { group: 'fire', tally: 'refined', goal: 1, text: 'Finish a chapter under the Refiner\'s Fire this week', mins: 0, mode: 'chapters', open: (s) => !!dayBoss(s) },
  { group: 'horde', tally: 'hordeKills', goal: 3000, text: 'Fell 3,000 foes in the Horde this week', mins: 0, mode: 'horde' },
  { group: 'watch', tally: 'watchStages', goal: 150, text: 'Clear 150 stages on the Watch this week', mins: 0, mode: 'watch' },
];
export const CALLS = 5, WEEKLIES = 3;

const seeded = (key: string) => { let h = 2166136261; for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };
/** Draw up to `n` calls, one per kind of play, from the ones open to this player. The same day gives the same calls. */
function draw(pool: Def[], n: number, key: string, s: PhaserSave): DayCall[] {
  const r = seeded(key), groups = new Map<string, Def[]>();
  for (const d of pool) if (!d.open || d.open(s)) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  const left = [...groups.values()], out: DayCall[] = [];
  while (out.length < n && left.length) {
    const g = left.splice(Math.floor(r() * left.length), 1)[0], d = g[Math.floor(r() * g.length)];
    out.push({ id: `${key}:${d.tally}`, tally: d.tally, goal: d.goal, text: d.text, mins: d.mins, mode: d.mode });
  }
  return out;
}

export const progress = (s: PhaserSave, c: DayCall, weekly = false) => {
  const d = s.day!, base = (weekly ? d.weekBase : d.base)[c.tally] ?? 0;
  return Math.max(0, Math.min(c.goal, tallyNow(s, c.tally) - base));
};
export const isDone = (s: PhaserSave, c: DayCall, weekly = false) => !!c.paid || progress(s, c, weekly) >= c.goal;

// ---------------------------------------------------------------- the Chronicle

export const STEPS = 30, STEP_MARKS = 50, OWED_COST = 150;
export const MARKS = { call: 10, all: 20, weekly: 40 };
export const monthKey = (t: number) => dayKey(t).slice(0, 7);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;
/** The month's cape (valor.ts CAPES), in turn. */
export const CHRONICLE_CAPES = ['tyrian', 'seafoam', 'ashen', 'dawn', 'harvest', 'frostfall'];
export const capeOf = (month: string) => CHRONICLE_CAPES[(Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1) % CHRONICLE_CAPES.length];

export type StepKind = 'silver' | 'material' | 'chests' | 'legend' | 'cape';
export interface Step { n: number; kind: StepKind; text: string }
/** What each step pays (the same for every month but the cape). */
export function stepOf(n: number, month: string): Step {
  if (n === 15) return { n, kind: 'cape', text: `${CAPES[capeOf(month)]?.name ?? 'A cape'} (this month's cape)` };
  if (n % 10 === 0) return { n, kind: 'legend', text: n === 30 ? 'A legendary piece with a power, and 8 Covenant Fragments' : 'A legendary piece with a power' };
  if (n % 7 === 0) return { n, kind: 'chests', text: '2 Watch chests (silver if the Watch is not begun)' };
  if (n % 5 === 0) return { n, kind: 'material', text: n === 25 ? '6 Relic Shards' : '3 Radiant Cores' };
  return { n, kind: 'silver', text: 'Silver' };
}
export const hasCape = (s: PhaserSave, id: string) => !!s.store?.capes?.includes(id);
const giveCape = (s: PhaserSave, id: string) => { const st = (s.store ??= {}); (st.capes ??= []).includes(id) || st.capes.push(id); };
const silverFor = (s: PhaserSave, k = 1) => Math.round((150 + (s.level ?? 1) * 25) * k);
/** A piece of Elior's gear a notch above ordinary, carrying a power (leaning toward ones not yet learned). */
const LEGEND_BASES = ['idolbreaker', 'ashlar_mail', 'highplace_gauntlets', 'tidewalker_greaves', 'firmament_blade', 'linen_mantle', 'seas_gauntlets'];
export function giveLegend(s: PhaserSave, rnd: () => number) {
  const pool = LEGEND_BASES.filter((id) => ITEMS[id]);
  const it = makeItem(pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))], 5);
  it.legend = rollLegend(s, 'elior', rnd);
  it.isNew = true;
  s.inventory.push(it);
  return ITEMS[it.id]?.name ?? 'A legendary piece';
}

function payStep(s: PhaserSave, st: Step, month: string, rnd: () => number): string {
  switch (st.kind) {
    case 'cape': {
      const id = capeOf(month);
      if (hasCape(s, id)) { addMaterial(s, 'relic_dust', 10); return '10 Relic Shards (the cape is already yours)'; }
      giveCape(s, id); return `${CAPES[id]?.name ?? 'A cape'} (Pack → Capes)`;
    }
    case 'legend': { const name = giveLegend(s, rnd); if (st.n === 30) addMaterial(s, 'covenant_fragment', 8); return `${name}, with a power`; }
    case 'chests': {
      if (s.watch?.daily) { s.watch.daily.chests += 2; return '2 Watch chests'; }
      const v = silverFor(s, 2); s.silver += v; return `${v} silver`;
    }
    case 'material': { if (st.n === 25) { addMaterial(s, 'relic_dust', 6); return '6 Relic Shards'; } addMaterial(s, 'radiant_core', 3); return '3 Radiant Cores'; }
    default: { const v = silverFor(s); s.silver += v; return `${v} silver`; }
  }
}

// ---------------------------------------------------------------- the day turning, and paying

export interface DayNews { kind: 'day' | 'call' | 'all' | 'weekly' | 'step' | 'month'; text: string }

function freshChron(month: string) { return { month, marks: 0, step: 0 }; }
function addMarks(s: PhaserSave, n: number, news: DayNews[], rnd: () => number) {
  const d = s.day!, c = d.chron;
  c.marks += n;
  while (c.step < STEPS && c.marks >= (c.step + 1) * STEP_MARKS) {
    c.step++;
    news.push({ kind: 'step', text: `Chronicle step ${c.step}: ${payStep(s, stepOf(c.step, c.month), c.month, rnd)}` });
  }
  // Past the last step the marks are spare: they buy back what an earlier month still owes.
  if (c.step >= STEPS && c.marks > STEPS * STEP_MARKS) { d.spare = (d.spare ?? 0) + c.marks - STEPS * STEP_MARKS; c.marks = STEPS * STEP_MARKS; }
}

/** What a finished call pays besides marks: silver, and something for the mode it belongs to. */
function payCall(s: PhaserSave, c: DayCall, weekly: boolean) {
  const k = weekly ? 4 : 1;
  s.silver += silverFor(s, k * (c.mode === 'journey' ? 1.5 : 1));
  if (c.mode === 'dayboss' || c.mode === 'chapters') giveLegend(s, Math.random);
  else if (c.mode === 'watch' && s.watch?.daily) s.watch.daily.chests += weekly ? 3 : 1;
  else if (c.mode === 'trial' || c.mode === 'daily') addMaterial(s, 'radiant_core', k);
  else if (c.mode === 'gauntlet') addMaterial(s, 'covenant_fragment', k);
  else if (c.mode === 'horde') addMaterial(s, 'relic_dust', 2 * k);
}

/**
 * Bring the Day up to `now` and pay whatever has been done. Safe to call often (every few seconds in play, and
 * whenever a mode banks). Returns what happened, for toasts. `rnd` is Math.random in play and fixed in tests.
 */
export function settleDay(s: PhaserSave, now = Date.now(), rnd: () => number = Math.random): DayNews[] {
  const news: DayNews[] = [], today = dayKey(now), week = weekKey(now), month = monthKey(now);
  // The Watch's days turn with the game's, so one streak serves both.
  const w = s.watch, wr = w ? rollDays(w, now) : null;
  if (!s.day) {
    const t = snapshot(s), streak = Math.max(1, w?.daily?.streak ?? 1);
    s.day = { day: today, week, base: t, weekBase: t, calls: draw(DAILY, CALLS, today, s), weekly: draw(WEEKLY, WEEKLIES, week, s), streak, lastDay: today, bestStreak: streak, chron: freshChron(month) };
    news.push({ kind: 'day', text: `Today's calls are set: ${s.day.calls.length} of them.` });
  }
  const d = s.day;
  if (d.chron.month !== month) {
    // A month closes: an unreached cape is owed (spare marks buy it back), and what was left over is kept as spare.
    const cape = capeOf(d.chron.month);
    if (d.chron.step < 15 && !hasCape(s, cape) && !(d.owed ??= []).includes(cape)) d.owed!.push(cape);
    d.spare = (d.spare ?? 0) + Math.max(0, d.chron.marks - d.chron.step * STEP_MARKS);
    d.chron = freshChron(month);
    news.push({ kind: 'month', text: `A new Chronicle opens: ${monthName(month)}.` });
  }
  if (d.week !== week) { d.week = week; d.weekBase = snapshot(s); d.weekly = draw(WEEKLY, WEEKLIES, week, s); }
  if (d.day !== today) {
    const gap = Math.round((Date.parse(today + 'T12:00:00') - Date.parse(d.lastDay + 'T12:00:00')) / 86400000);
    if (gap === 1) d.streak++;
    else if (gap === 2 && d.forgivenWeek !== week) { d.streak++; d.forgivenWeek = week; }
    else if (gap > 1 || gap < 0) d.streak = 1;
    d.bestStreak = Math.max(d.bestStreak ?? 0, d.streak);
    d.lastDay = today; d.day = today; d.base = snapshot(s); d.calls = draw(DAILY, CALLS, today, s); d.allPaid = false;
    news.push({ kind: 'day', text: `A new day · ${d.streak} in a row.` });
  }
  // One streak: the longer of the two is the game's, and the Watch's calendar follows it.
  if (w?.daily && wr) { const both = Math.max(d.streak, w.daily.streak); d.streak = both; w.daily.streak = both; d.bestStreak = Math.max(d.bestStreak ?? 0, both); }
  for (const c of d.calls) {
    if (c.paid || progress(s, c) < c.goal) continue;
    c.paid = true; payCall(s, c, false);
    news.push({ kind: 'call', text: `Call answered: ${c.text} · +${MARKS.call} marks` });
    addMarks(s, MARKS.call, news, rnd);
  }
  if (!d.allPaid && d.calls.length && d.calls.every((c) => c.paid)) {
    d.allPaid = true; s.silver += silverFor(s, 2);
    news.push({ kind: 'all', text: `Every call answered today · +${MARKS.all} marks` });
    addMarks(s, MARKS.all, news, rnd);
  }
  for (const c of d.weekly) {
    if (c.paid || progress(s, c, true) < c.goal) continue;
    c.paid = true; payCall(s, c, true);
    news.push({ kind: 'weekly', text: `Weekly call answered: ${c.text} · +${MARKS.weekly} marks` });
    addMarks(s, MARKS.weekly, news, rnd);
  }
  return news;
}

/** Buy back an owed cape with spare marks. */
export function buyOwed(s: PhaserSave, id: string) {
  const d = s.day;
  if (!d || !d.owed?.includes(id) || (d.spare ?? 0) < OWED_COST) return false;
  d.spare = (d.spare ?? 0) - OWED_COST;
  d.owed = d.owed.filter((x) => x !== id);
  giveCape(s, id);
  return true;
}

/** The first call not yet answered (the home screen's button starts its mode). */
export const nextCall = (s: PhaserSave) => s.day?.calls.find((c) => !c.paid) ?? null;
/** Marks toward the next step, and what it takes. */
export const stepProgress = (d: DaySave) => ({ have: Math.min(STEP_MARKS, d.chron.marks - d.chron.step * STEP_MARKS), need: STEP_MARKS, done: d.chron.step >= STEPS });

/** Repair, never refuse: a Day that does not read as one is dropped and drawn again; odd amounts become sane. */
export function migrateDay(s: PhaserSave) {
  const d = s.day as DaySave | undefined;
  if (d === undefined) return;
  if (!d || typeof d !== 'object' || typeof d.day !== 'string' || !Array.isArray(d.calls) || !Array.isArray(d.weekly) || !d.chron || typeof d.chron.month !== 'string') { delete s.day; return; }
  d.base ??= {}; d.weekBase ??= {};
  d.streak = Math.max(1, Math.floor(num(d.streak)) || 1);
  d.lastDay = typeof d.lastDay === 'string' ? d.lastDay : d.day;
  d.chron.marks = Math.floor(num(d.chron.marks));
  d.chron.step = Math.min(STEPS, Math.floor(num(d.chron.step)), Math.floor(d.chron.marks / STEP_MARKS));
  d.spare = Math.floor(num(d.spare));
  d.owed = Array.isArray(d.owed) ? d.owed.filter((x) => typeof x === 'string' && CAPES[x]) : [];
  d.calls = d.calls.filter((c) => c && typeof c.text === 'string' && ALL.includes(c.tally) && num(c.goal) > 0);
  d.weekly = d.weekly.filter((c) => c && typeof c.text === 'string' && ALL.includes(c.tally) && num(c.goal) > 0);
}
