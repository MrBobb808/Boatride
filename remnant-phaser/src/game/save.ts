// The Phaser build's save is the original game's own SaveData (game/state.ts),
// kept under the Phaser build's key so trying it never touches progress in the
// live game. Elior's stats come from it through the original's derive(): his
// level, stat points, skills and equipped gear. A live save can be imported
// (copied, never moved): both builds are served from the same origin, so the
// live game's slots are in this browser's storage.

import { newGame, migrateSave, derive, gainXp as stateGainXp, absorbEcho, type SaveData, type Derived } from '../../../remnant/src/game/state';
import { ROOMS } from '../shared';

export type ArrowType = 'standard' | 'fire' | 'frost' | 'storm' | 'holy';
/** Phaser-only fields, all optional: the fighter in play, Elior's style, and Tirzah's loadout (her three ability slots,
 * the abilities she has been offered, the arrow types she has unlocked and the one nocked). */
export type PhaserSave = SaveData & {
  playableHero?: import('./style').PlayableHero; combatStyle?: import('./style').CombatStyle; bestStyle?: number;
  archerSkills?: (import('./abilities').ArcherSkillId | null)[]; archerKnown?: import('./abilities').ArcherSkillId[];
  quiver?: ArrowType[]; arrowType?: ArrowType;
};
/** The levels at which her arrow types join the quiver. */
export const ARROW_LEVELS: Record<ArrowType, number> = { standard: 1, fire: 8, frost: 12, storm: 18, holy: 24 };

const KEY = 'remnant-phaser.save.v2';
export const activeSlot = () => { const n = Number(read('remnant-phaser.active-slot') ?? 0); return [0, 1, 2].includes(n) ? n : 0; };
export const selectSlot = (slot: number) => { try { localStorage.setItem('remnant-phaser.active-slot', String(slot)); } catch {} };
const activeKey = () => activeSlot() === 0 ? KEY : `remnant-phaser.save.slot${activeSlot()}`;
const EARLY_SKILLS = ['sword_word', 'trumpet', 'shield_faith'] as const;
/** Parts 1–8 always provided these three buttons, without recording a loadout. */
function earlyLoadout(s: SaveData) {
  if (!s.flags.phaser_loadout_v1) {
    for (const id of EARLY_SKILLS) if (!s.abilities.includes(id)) s.abilities.push(id);
    if (!s.equippedSkills.some(Boolean)) s.equippedSkills = [...EARLY_SKILLS];
    s.flags.phaser_loadout_v1 = true;
  }
  return s;
}
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
  const kit=d as PhaserSave;
  if(kit.playableHero!==undefined&&kit.playableHero!=='tirzah'&&kit.playableHero!=='elior')delete kit.playableHero;
  if(kit.combatStyle!==undefined&&!['vanguard','wraith','sentinel'].includes(kit.combatStyle))delete kit.combatStyle;
  if(kit.bestStyle!==undefined)kit.bestStyle=Number.isFinite(kit.bestStyle)?Math.max(0,Math.min(6,Math.floor(kit.bestStyle))):0;
  // Tirzah's loadout: drop anything unknown, keep three slots, and nock only an unlocked arrow.
  const archer=['deliverance','jonathan','mark','rain','watchman','quiver'];
  if(kit.archerSkills!==undefined)kit.archerSkills=Array.isArray(kit.archerSkills)?[0,1,2].map(i=>archer.includes(kit.archerSkills![i] as string)?kit.archerSkills![i]:null):undefined;
  if(kit.archerKnown!==undefined)kit.archerKnown=Array.isArray(kit.archerKnown)?kit.archerKnown.filter(id=>archer.includes(id)):undefined;
  if(kit.quiver!==undefined)kit.quiver=Array.isArray(kit.quiver)?kit.quiver.filter(t=>t in ARROW_LEVELS):undefined;
  if(kit.arrowType!==undefined&&!(kit.quiver??['standard']).includes(kit.arrowType))delete kit.arrowType;
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

export function newSave(story = false): SaveData {
  const s = settle(newGame());
  if (story) { s.flags.phaser_loadout_v1 = true; return s; }
  return earlyLoadout(s);
}

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
  const v2 = parse(read(activeKey()));
  if (v2) return earlyLoadout(v2);
  const v1 = read(KEY_V1);
  return v1 ? fromV1(v1) : null;
}

export function writeSave(s: SaveData) {
  s.updated = Date.now();
  try { localStorage.setItem(activeKey(), JSON.stringify(s)); } catch { /* private mode: this session only */ }
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
  // A live journey keeps its earned abilities and intentional empty slots.
  if (s) { s.flags.phaser_loadout_v1 = true; writeSave(s); }
  return s;
}

/** Elior's stats from the save: the original's derive() (stats, skills, gear). */
export const stats = (s: SaveData): Derived => derive(s);

/** Add experience the original's way (stat and skill points each level); returns the levels gained. */
export const gainXp = (s: SaveData, xp: number) => stateGainXp(s, xp);
