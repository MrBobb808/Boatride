// The Trial leaderboard. Every run that starts at round 1 is ranked on this
// device's board (shared by all save slots), best first. Inside the claude.ai
// preview the best run also goes to a board every player there can see.

import { settings } from '../core/settings';
import { pushBest } from './cloud';

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
}

const KEY = 'remnant.board.v1';
const KEEP = 20;

export function loadBoard(): RunEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RunEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.rounds === 'number') : [];
  } catch {
    return [];
  }
}

function saveBoard(list: RunEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* private mode: the board lasts this session */ }
}

const better = (a: RunEntry, b: RunEntry) => b.rounds - a.rounds || b.kills - a.kills || a.time - b.time;

/** Add a ranked run. Returns its place (1 = top), or 0 if it fell off the board. */
export function recordRun(r: Omit<RunEntry, 'id' | 'name' | 'date'>): { entry: RunEntry; place: number } {
  const entry: RunEntry = { ...r, id: Date.now(), name: settings.name || 'Elior', date: new Date().toISOString().slice(0, 10) };
  const list = [...loadBoard(), entry].sort(better).slice(0, KEEP);
  saveBoard(list);
  void pushBest({ name: entry.name, rounds: entry.rounds, kills: entry.kills, time: Math.round(entry.time), level: entry.level, date: entry.date });
  const i = list.findIndex((e) => e.id === entry.id);
  return { entry, place: i + 1 };
}

/** Rename a run already on the board (the name box on the Game Over card). */
export function renameRun(id: number, name: string) {
  const list = loadBoard();
  const e = list.find((x) => x.id === id);
  if (!e) return;
  e.name = name;
  saveBoard(list);
  void pushBest({ name: e.name, rounds: e.rounds, kills: e.kills, time: Math.round(e.time), level: e.level, date: e.date });
}

export function bestRounds() {
  return loadBoard().reduce((m, e) => Math.max(m, e.rounds), 0);
}
