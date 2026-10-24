// The Phaser build keeps its own save (one slot for now) under its own key, so
// trying it can never touch progress in the original game.

import { xpToNext } from '../shared';

export interface PhaserSave {
  v: 1;
  room: string;
  spawn: string;
  level: number;
  xp: number;
  hp: number;
  silver: number;
  flags: Record<string, boolean | number | string>;
  kills: number;
  /** Covenant Energy, and the Balm flasks left of the most Elior can carry. */
  ce: number;
  balm: number;
  balmMax: number;
  /** Bosses beaten, by the original's keys (the classic bosses read it). */
  defeated?: string[];
}

const KEY = 'remnant-phaser.save.v1';

export const newSave = (): PhaserSave => ({ v: 1, room: 'sanctuary', spawn: 'start', level: 1, xp: 0, hp: -1, silver: 0, flags: {}, kills: 0, ce: 0, balm: 3, balmMax: 3 });

export function loadSave(): PhaserSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<PhaserSave>;
    if (!s || typeof s.room !== 'string') return null;
    return { ...newSave(), ...s, v: 1 };
  } catch {
    return null;
  }
}

export function writeSave(s: PhaserSave) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: this session only */ }
}

/** Elior's health and blow at a level (the original's early curve, simplified until stats are ported). */
export const maxHpAt = (lv: number) => 100 + (lv - 1) * 12;
export const powerAt = (lv: number) => 14 * (1 + (lv - 1) * 0.09);
/** Covenant Energy capacity: the original's 40 + 12 per Wisdom, with Wisdom 5 until stats are ported. */
export const maxCeAt = (_lv: number) => 100;
/** The original's parry window at base Resolve (0.15 s + 0.004 per point). */
export const PARRY_WIN = 0.17;

/** Add experience; returns the number of levels gained. */
export function gainXp(s: PhaserSave, xp: number) {
  s.xp += xp;
  let ups = 0;
  while (s.xp >= xpToNext(s.level)) { s.xp -= xpToNext(s.level); s.level++; ups++; }
  return ups;
}
