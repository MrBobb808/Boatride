// The Watch (POLISH_PLAN §18): the idle mode's numbers, in one place and free of the scene, so the tests and the
// offline pay read the same curves the fight does. Costs grow exponentially and effects linearly with doublings at
// milestones (Pecorella, "The Math of Idle Games"); foes and their pay grow ×1.10 a stage, which a greedy player
// outruns for about a hundred stages before the Ascension is the way on.

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
  { id: 'attack', name: 'Attack', base: 10, rate: 1.07, per: '+4 damage, doubled at 25, 50, 100…' },
  { id: 'health', name: 'Health', base: 10, rate: 1.07, per: '+20 health, doubled at 25, 50, 100…' },
  { id: 'speed', name: 'Attack Speed', base: 25, rate: 1.12, per: '+1% swings (up to ×2)', max: 100 },
  { id: 'crit', name: 'Critical Chance', base: 200, rate: 1.15, per: '+0.5% (up to 60%)', opens: { track: 'health', level: 40 }, max: 120 },
  { id: 'regen', name: 'Health Regen', base: 300, rate: 1.1, per: '+0.2% health a second (up to 5%)', opens: { track: 'crit', level: 20 }, max: 25 },
  { id: 'critDmg', name: 'Critical Damage', base: 500, rate: 1.1, per: '+5% critical damage', opens: { track: 'crit', level: 100 } },
  { id: 'defense', name: 'Defense', base: 800, rate: 1.1, per: '−1% from every blow (softening)', opens: { stage: 20 } },
  { id: 'coins', name: 'Coin Find', base: 1000, rate: 1.11, per: '+2% coins', opens: { stage: 30 } },
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

// ---------------------------------------------------------------- Elior here

/** Experience to the next Watch level. */
export const watchXpNext = (level: number) => Math.ceil(20 * Math.pow(level, 1.6));
/** What each Watch level adds to his blows and health, and what the Seals add to blows and coins. */
export const levelBonus = (level: number) => 1 + 0.03 * (level - 1);
export const sealBonus = (seals: number) => 1 + 0.05 * seals;

export interface WatchStats { atk: number; maxHp: number; aspd: number; crit: number; critDmg: number; regen: number; dr: number; coinMult: number }
export function watchStats(w: WatchSave): WatchStats {
  const L = (id: TrackId) => lvlOf(w, id), lb = levelBonus(w.level), sb = sealBonus(w.seals);
  return {
    atk: (10 + 4 * L('attack')) * milestones(L('attack')) * lb * sb,
    maxHp: (100 + 20 * L('health')) * milestones(L('health')) * lb,
    aspd: Math.min(2, 1 + 0.01 * L('speed')),
    crit: Math.min(0.6, 0.005 * L('crit')),
    critDmg: 1.5 + 0.05 * L('critDmg'),
    regen: Math.min(0.05, 0.002 * L('regen')),
    // Softens toward three quarters of every blow, never all of it.
    dr: 0.75 * (1 - Math.pow(0.99, L('defense'))),
    coinMult: (1 + 0.02 * L('coins')) * sb,
  };
}

/** The Watch level's milestones (POLISH_PLAN §18d): what each opens, for the Hero card and the level-up toast. */
export const UNLOCKS: [number, string][] = [
  [5, 'Covenant Strike: every few seconds, a heavy blow with all his weight'],
  [8, 'The first shadow joins him on the wall'],
  [10, 'Pillar of Fire: a column of white fire on the furthest foe'],
  [20, 'A second shadow'],
  [25, 'The Shadow Mantle: kills fill the gauge; transform for heavier, faster blows'],
  [40, 'A third shadow'],
  [70, 'A fourth shadow'],
  [110, 'A fifth shadow'],
  [150, 'A sixth shadow · Tirzah comes to the wall (a later update)'],
  [300, 'Uri the flame-caller (a later update)'],
];
/** Shadow allies (foes he has cleansed, fighting beside him) open at these levels. */
export const SHADOW_LEVELS = [8, 20, 40, 70, 110, 150];
export const shadowsAt = (level: number) => SHADOW_LEVELS.filter((l) => level >= l).length;
export const SKILLS = {
  strike: { level: 5, cd: 9, mult: 6, name: 'Covenant Strike' },
  pillar: { level: 10, cd: 14, mult: 4, name: 'Pillar of Fire' },
} as const;
export const MANTLE = { level: 25, time: 15, dmg: 1.7, speed: 1.2, perKill: 4 };

// ---------------------------------------------------------------- away, and the Ascension

/** Offline: half the recent rate, for at most eight hours. */
export const OFFLINE_RATE = 0.5, OFFLINE_CAP = 8 * 3600;
export function offlinePay(w: WatchSave, now = Date.now()) {
  const secs = Math.max(0, Math.min(OFFLINE_CAP, (now - w.last) / 1000));
  return { secs, coins: Math.floor(w.rate * secs * OFFLINE_RATE) };
}
/** The Ascension opens at stage 60; Seals grow with the square root of how far past it the run went. */
export const ASCEND_AT = 60;
export const sealsFor = (best: number) => (best < ASCEND_AT ? 0 : Math.floor(Math.sqrt(best - ASCEND_AT + 1) * 3));

/** Main-game rewards, once each, the first time a gate's boss falls: silver, and two capes. */
export const silverFor = (gate: number) => 25 * gate;
export const CAPE_AT: Record<number, string> = { 10: 'midnight', 25: 'lamp' };

// ---------------------------------------------------------------- numbers

const SUFFIX = ['', 'K', 'M', 'B', 'T'];
/** 999, 1.2K, 34M, 5.6T, then aa, ab… for the idle game's big numbers. */
export function fmt(n: number) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return String(Math.floor(n));
  let e = Math.floor(Math.log10(n) / 3);
  const v = n / Math.pow(1000, e);
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  if (e < SUFFIX.length) return s + SUFFIX[e];
  e -= SUFFIX.length;
  return s + String.fromCharCode(97 + Math.floor(e / 26)) + String.fromCharCode(97 + (e % 26));
}
