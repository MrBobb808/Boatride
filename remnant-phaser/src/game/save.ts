// The Phaser build's save is the original game's own SaveData (game/state.ts),
// kept under the Phaser build's key so trying it never touches progress in the
// live game. Elior's stats come from it through the original's derive(): his
// level, stat points, skills and equipped gear. A live save can be imported
// (copied, never moved): both builds are served from the same origin, so the
// live game's slots are in this browser's storage.

import { newGame, migrateSave, derive, gainXp as stateGainXp, absorbEcho, type SaveData, type Derived } from '../../../remnant/src/game/state';
import { ROOMS } from '../shared';

export type PhaserSave = SaveData;

const KEY = 'remnant-phaser.save.v2';
/** The Phaser build's first save format (parts 1–5), converted on first load. */
const KEY_V1 = 'remnant-phaser.save.v1';
const LIVE_SLOTS = 3;
const liveKey = (slot: number) => `remnant-save-${slot}`;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

/** The original's own fill-ins for older saves (game/save.ts `migrate`, then state.ts `migrateSave`). */
function settle(d: SaveData): SaveData {
  d.keyItems ??= [];
  d.altarsLit ??= ['sanctuary'];
  d.secrets ??= [];
  d.formations ??= [];
  d.echoMode ??= 'follow';
  d.affinity ??= { mara: 0, azriel: 0, tobiah: 0 };
  d.choices ??= {};
  d.equippedSkills ??= [null, null, null];
  migrateSave(d);
  if (!ROOMS[d.room]) { d.room = 'sanctuary'; d.spawn = 'start'; }
  return d;
}

function parse(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as SaveData;
    return d && d.version === 1 && typeof d.level === 'number' ? settle(d) : null;
  } catch {
    return null;
  }
}

export const newSave = (): SaveData => settle(newGame());

/** A save from parts 1–5 of the port: its journey carried into the original's format. */
function fromV1(raw: string): SaveData | null {
  try {
    const o = JSON.parse(raw) as { room?: string; spawn?: string; level?: number; xp?: number; hp?: number; silver?: number; flags?: Record<string, boolean | number | string>; kills?: number; ce?: number; balm?: number; balmMax?: number; defeated?: string[]; purified?: string[] };
    if (!o || typeof o.room !== 'string') return null;
    const s = newSave();
    // The original's level-ups give stat and skill points; a carried level brings its points.
    stateGainXp(s, 0);
    for (let lv = 1; lv < (o.level ?? 1); lv++) { s.level++; s.statPoints += 3; s.skillPoints += 1; }
    Object.assign(s, {
      room: o.room, spawn: o.spawn ?? 'start', xp: o.xp ?? 0, silver: o.silver ?? s.silver, kills: o.kills ?? 0,
      ce: o.ce ?? 0, balm: o.balm ?? s.balm, balmMax: o.balmMax ?? s.balmMax, hp: o.hp && o.hp > 0 ? o.hp : 9999,
      flags: { ...o.flags }, defeated: [...(o.defeated ?? [])],
    });
    const d = derive(s);
    for (const sp of o.purified ?? []) absorbEcho(s, sp, d);
    return settle(s);
  } catch {
    return null;
  }
}

export function loadSave(): SaveData | null {
  const v2 = parse(read(KEY));
  if (v2) return v2;
  const v1 = read(KEY_V1);
  return v1 ? fromV1(v1) : null;
}

export function writeSave(s: SaveData) {
  s.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: this session only */ }
}

/** The live game's slots, for the title's import (read-only). */
export function liveSlots(): { slot: number; save: SaveData }[] {
  const out: { slot: number; save: SaveData }[] = [];
  for (let i = 0; i < LIVE_SLOTS; i++) {
    const s = parse(read(liveKey(i)));
    if (s) out.push({ slot: i, save: s });
  }
  return out;
}

/** Copy a live slot into the Phaser build's save. The live slot is left as it was. */
export function importLive(slot: number): SaveData | null {
  const s = parse(read(liveKey(slot)));
  if (s) writeSave(s);
  return s;
}

/** Elior's stats from the save: the original's derive() (stats, skills, gear). */
export const stats = (s: SaveData): Derived => derive(s);

/** Add experience the original's way (stat and skill points each level); returns the levels gained. */
export const gainXp = (s: SaveData, xp: number) => stateGainXp(s, xp);
