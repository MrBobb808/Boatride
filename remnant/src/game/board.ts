// The Trial leaderboard. Every run that starts at round 1 is ranked on this
// device's board (shared by all save slots), best first. Inside the claude.ai
// preview the best run also goes to a board every player there can see.

import { settings } from '../core/settings';
import { pushBest } from './cloud';
import { formatTime } from '../core/math';

export interface RunEntry {
  id: number;
  name: string;
  /** The round the run reached (as in "you survived 12 rounds"). */
  rounds: number;
  kills: number;
  /** Seconds. */
  time: number;
  level: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Boss Rush only: bosses in the run, and whether it was finished. */
  total?: number;
  done?: boolean;
}

/** Which board: survival (false), the Boss Gauntlet (true), the Boss Rush or Extreme Survival. */
export type BoardId = boolean | 'rush' | 'extreme';

const KEY = 'remnant.board.v1';
const KEEP = 20;

const keyOf = (b: BoardId) => b === 'rush' ? 'remnant.rush-board.v1' : b === 'extreme' ? 'remnant.extreme-board.v1' : b ? 'remnant.boss-board.v1' : KEY;

export function loadBoard(bossOnly: BoardId = false): RunEntry[] {
  try {
    const raw = localStorage.getItem(keyOf(bossOnly));
    const list = raw ? (JSON.parse(raw) as RunEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.rounds === 'number') : [];
  } catch {
    return [];
  }
}

function saveBoard(list: RunEntry[], bossOnly: BoardId = false) {
  try {
    localStorage.setItem(keyOf(bossOnly), JSON.stringify(list));
  } catch { /* private mode: the board lasts this session */ }
}

const better = (a: RunEntry, b: RunEntry) => b.rounds - a.rounds || b.kills - a.kills || a.time - b.time;
// Finished rushes first (more bosses, then faster); unfinished ones by bosses beaten, then time.
const rushBetter = (a: RunEntry, b: RunEntry) => Number(!!b.done) - Number(!!a.done) || b.rounds - a.rounds || a.time - b.time;

/** Add a ranked run. Returns its place (1 = top), or 0 if it fell off the board. */
export function recordRun(r: Omit<RunEntry, 'id' | 'name' | 'date'>, bossOnly: BoardId = false): { entry: RunEntry; place: number } {
  const entry: RunEntry = { ...r, id: Date.now(), name: settings.name || 'Elior', date: new Date().toISOString().slice(0, 10) };
  const list = [...loadBoard(bossOnly), entry].sort(bossOnly === 'rush' ? rushBetter : better).slice(0, KEEP);
  saveBoard(list, bossOnly);
  if (!bossOnly) void pushBest({ name: entry.name, rounds: entry.rounds, kills: entry.kills, time: Math.round(entry.time), level: entry.level, date: entry.date });
  const i = list.findIndex((e) => e.id === entry.id);
  return { entry, place: i + 1 };
}

/** Rename a run already on the board (the name box on the Game Over card). */
export function renameRun(id: number, name: string, bossOnly: BoardId = false) {
  const list = loadBoard(bossOnly);
  const e = list.find((x) => x.id === id);
  if (!e) return;
  e.name = name;
  saveBoard(list, bossOnly);
  if (!bossOnly) void pushBest({ name: e.name, rounds: e.rounds, kills: e.kills, time: Math.round(e.time), level: e.level, date: e.date });
}

export function bestRounds(bossOnly: BoardId = false) {
  return loadBoard(bossOnly).reduce((m, e) => Math.max(m, e.rounds), 0);
}

/** A rush time to the tenth of a second ("4:07.3"). */
export const rushClock = (sec: number) => `${formatTime(sec)}.${Math.floor(sec * 10) % 10}`;
