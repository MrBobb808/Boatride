// Trials of Valor: a trophy book of challenges across the whole journey.
// Most trophies read what a save already keeps (bosses beaten, foes slain,
// levels, Echo stages, mastery, Trial records), so an older save is credited
// for what it can prove on load. Feats a save never recorded (fights without
// a scratch, parries, finishers, lamps) are counted from now on by a handful
// of direct calls from the places they happen. Rewards are cosmetic: titles
// and cape colours for Elior.

import { G, flag } from './ctx';
import type { SaveData } from './state';
import { masteryRank, WEAPON_FAMILIES, CONTRACT_IDS, contractWins } from './progression';
import { ROOMS } from './rooms';
import { FALLEN_CHAPTERS } from './fallenChapters';

export type Tally = 'parry' | 'finisher' | 'lamp' | 'daily';

export interface ValorData {
  /** Trophy id → when it was won (ms); 0 = recognised from an earlier journey. */
  got: Record<string, number>;
  /** Counts the save never kept before Trials of Valor. */
  n: Partial<Record<Tally, number>>;
  /** Lamps broken per room: [bit per lamp index, lamps in the room]. */
  lamps?: Record<string, [number, number]>;
  /** Chapter I start (playtime), or -1 when the save began it before trophies existed. */
  c1?: number;
  /** Chapter IX watched: 1 = seen unfinished, 2 = settled. */
  c9?: number;
  /** The worn title (a trophy id) and cape (a CAPES key). */
  title?: string;
  cape?: string;
  /** Trophies credited on load, announced once. */
  retro?: number;
}

export interface ValorSave {
  valor?: ValorData;
}

export type ValorCat = 'Bosses' | 'Flawless' | 'Combat' | 'Growth' | 'Trial' | 'Journey';
export const VALOR_CATS: ValorCat[] = ['Bosses', 'Flawless', 'Combat', 'Growth', 'Trial', 'Journey'];

export interface Trophy {
  id: string;
  name: string;
  desc: string;
  cat: ValorCat;
  icon: string;
  /** Shown as ??? until won. */
  hidden?: boolean;
  /** Reward: a title Elior may wear. */
  title?: string;
  /** Reward: a cape colour (CAPES key). */
  cape?: string;
  /** The tally it counts, so a rise is judged at once (even under a result card). */
  tally?: Tally;
  /** Progress toward the goal; won when cur ≥ max. Without it, only an event wins it. */
  prog?: (s: SaveData) => readonly [number, number];
}

export interface CapeLook { name: string; c: string; trim: string }
export const CAPES: Record<string, CapeLook> = {
  linen: { name: 'Hearthward Linen', c: '#cbbf9f', trim: '#8a6a34' },
  lamp: { name: 'Lampblack', c: '#2a2016', trim: '#ffcf6b' },
  midnight: { name: 'Midnight Watch', c: '#16203e', trim: '#9fb4ff' },
  royal: { name: 'Answerer\'s Purple', c: '#3a1a52', trim: '#e2b85a' },
  storm: { name: 'Stormgrey', c: '#2c3644', trim: '#bfe0ff' },
  verdant: { name: 'Hunter\'s Green', c: '#1c3a24', trim: '#cfe6a8' },
  ember: { name: 'Unburnt Ember', c: '#3e1406', trim: '#ff8a3a' },
  blood: { name: 'Merciless Red', c: '#5a080e', trim: '#1a0a0a' },
  gold: { name: 'Sovereign Gold', c: '#6a4a12', trim: '#fff1c4' },
};

/** The bosses with trophies, in story order (keys as in SaveData.defeated). */
const BOSSES: { key: string; name: string; won: string; title?: string; cape?: string }[] = [
  { key: 'idol', name: 'the Gilded Idol', won: 'The Idol Falls' },
  { key: 'gatekeeper', name: 'the Gatekeeper', won: 'The Gate Opened' },
  { key: 'marshal', name: 'the Crimson Marshal', won: 'Honour Answered' },
  { key: 'locust_king', name: 'the Locust King', won: 'The Swarm Stilled' },
  { key: 'golden_image', name: 'the Image of Gold', won: 'No Knee Bowed' },
  { key: 'weigher', name: 'the Weigher', won: 'Weighed, Not Wanting' },
  { key: 'storm_prince', name: 'the Prince of the Storm', won: 'The Storm Withstood' },
  { key: 'persia_prince', name: 'the Prince of Persia', won: 'Twenty-One Days' },
  { key: 'beast_monarch', name: 'Varkhos, Crown of the Hunt', won: 'The Hunt Ended' },
  { key: 'plague_monarch', name: 'Morvane, Crown of Pestilence', won: 'The Fever Broken' },
  { key: 'cinder_monarch', name: 'Azkar, Crown of Cinders', won: 'The Forge Cooled', title: 'Crownbreaker' },
];
const FLAWLESS_REWARD: Record<string, { title?: string; cape?: string }> = {
  idol: { title: 'Idolbreaker' },
  storm_prince: { cape: 'storm' },
  persia_prince: { title: 'the Withstander' },
  beast_monarch: { cape: 'verdant' },
  cinder_monarch: { title: 'the Unburnt', cape: 'ember' },
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const CH1_ROOMS = ['sanctuary', 'ashen_road', 'village_square', 'cistern', 'temple_steps', 'temple_hall', 'covenant_chamber', 'crypt', 'upper_gallery', 'archive_vault', 'idol_antechamber', 'idol_sanctum'];
let ch1Finds: { chests: string[]; lore: string[] } | null = null;
/** Chapter I's chests and lore stones, read from the room data once. */
function ch1Secrets() {
  if (ch1Finds) return ch1Finds;
  const chests: string[] = [], lore: string[] = [];
  for (const id of CH1_ROOMS) for (const e of ROOMS[id]?.ents ?? []) {
    if (e.t === 'chest') chests.push(e.id);
    else if (e.t === 'lore') lore.push(e.id);
  }
  return (ch1Finds = { chests, lore });
}
const CROWN_CACHES = () => FALLEN_CHAPTERS.filter((c) => c.n <= 9).flatMap((c) => c.caches);

const tally = (s: SaveData, k: Tally) => s.valor?.n[k] ?? 0;
const count = (s: SaveData, k: Tally, max: number) => [Math.min(max, tally(s, k)), max] as const;
const bitCount = (n: number) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };

export const TROPHIES: Trophy[] = [
  ...BOSSES.map((b): Trophy => ({
    id: 'defeat_' + b.key, name: b.won, desc: `Defeat ${b.name} in the story.`, cat: 'Bosses', icon: 'crown', title: b.title,
    prog: (s) => [s.defeated.includes(b.key) ? 1 : 0, 1],
  })),
  ...BOSSES.map((b): Trophy => ({
    id: 'flawless_' + b.key, name: `Unscathed: ${cap(b.name.split(',')[0])}`, cat: 'Flawless', icon: 'shield',
    desc: `Defeat ${b.name} without taking a blow.`,
    ...FLAWLESS_REWARD[b.key],
  })),
  { id: 'parry_25', name: 'Turned Aside', desc: 'Land 25 perfect parries.', cat: 'Combat', icon: 'parry', tally: 'parry', prog: (s) => count(s, 'parry', 25) },
  { id: 'parry_100', name: 'Steady Hand', desc: 'Land 100 perfect parries.', cat: 'Combat', icon: 'parry', title: 'the Unmoved', tally: 'parry', prog: (s) => count(s, 'parry', 100) },
  { id: 'fin_10', name: 'The Final Word', desc: 'Perform 10 finishers.', cat: 'Combat', icon: 'sword', tally: 'finisher', prog: (s) => count(s, 'finisher', 10) },
  { id: 'fin_50', name: 'Executioner', desc: 'Perform 50 finishers.', cat: 'Combat', icon: 'sword', title: 'the Executioner', tally: 'finisher', prog: (s) => count(s, 'finisher', 50) },
  { id: 'riposte', name: 'Answer in Kind', desc: 'Strike a boss\'s killing blow within a moment of a perfect parry.', cat: 'Combat', icon: 'parry', hidden: true, title: 'the Answerer', cape: 'royal' },
  { id: 'combo_30', name: 'Unbroken Chain', desc: 'Land a combo of 30 hits.', cat: 'Combat', icon: 'attack', prog: (s) => [Math.min(30, s.bestCombo ?? 0), 30] },
  { id: 'kills_1000', name: 'Legion\'s Bane', desc: 'Defeat 1,000 foes.', cat: 'Combat', icon: 'sword', title: 'Hostbreaker', prog: (s) => [Math.min(1000, s.kills), 1000] },
  { id: 'bestiary_20', name: 'Field Notes', desc: 'Record 20 kinds of foe in the Bestiary.', cat: 'Combat', icon: 'journal', prog: (s) => [Math.min(20, Object.keys(s.bestiary ?? {}).length), 20] },
  { id: 'level_50', name: 'Seasoned', desc: 'Reach level 50.', cat: 'Growth', icon: 'stats', prog: (s) => [Math.min(50, s.level), 50] },
  { id: 'level_100', name: 'Sovereign', desc: 'Reach level 100.', cat: 'Growth', icon: 'crown', title: 'Sovereign', cape: 'gold', prog: (s) => [Math.min(100, s.level), 100] },
  { id: 'stage3', name: 'Fully Kindled', desc: 'Evolve an Echo to Stage III.', cat: 'Growth', icon: 'echo', prog: (s) => [Math.min(3, 1 + s.echoes.reduce((m, e) => Math.max(m, e.stage), -1)), 3] },
  { id: 'echoes_8', name: 'A Gathered Remnant', desc: 'Purify 8 kinds of Echo.', cat: 'Growth', icon: 'echo', prog: (s) => [Math.min(8, s.echoes.length), 8] },
  { id: 'mastery_one', name: 'Weapon-Wise', desc: 'Raise a weapon family to mastery rank 10.', cat: 'Growth', icon: 'greatsword', prog: (s) => [WEAPON_FAMILIES.reduce((m, f) => Math.max(m, masteryRank(s, f)), 0), 10] },
  { id: 'mastery_all', name: 'Master of Arms', desc: 'Raise blade, spear and greatsword to mastery rank 10.', cat: 'Growth', icon: 'greatsword', title: 'Master of Arms', prog: (s) => [WEAPON_FAMILIES.filter((f) => masteryRank(s, f) >= 10).length, 3] },
  { id: 'trial_10', name: 'Held the Line', desc: 'Reach round 10 in the Trial of the Remnant.', cat: 'Trial', icon: 'rally', prog: (s) => [Math.min(10, Number(s.flags.trial_best ?? 0)), 10] },
  { id: 'trial_30', name: 'The Long Night', desc: 'Reach round 30 in the Trial of the Remnant.', cat: 'Trial', icon: 'rally', cape: 'midnight', prog: (s) => [Math.min(30, Number(s.flags.trial_best ?? 0)), 30] },
  { id: 'trial_50', name: 'Unwearied', desc: 'Reach round 50 in the Trial of the Remnant.', cat: 'Trial', icon: 'rally', title: 'the Unwearied', prog: (s) => [Math.min(50, Number(s.flags.trial_best ?? 0)), 50] },
  { id: 'contract_1', name: 'Contract Kept', desc: 'Complete a five-wave contract.', cat: 'Trial', icon: 'armor', prog: (s) => [Math.min(1, CONTRACT_IDS.reduce((n, id) => n + contractWins(s, id), 0)), 1] },
  { id: 'rush_done', name: 'The Rush Is Run', desc: 'Finish the Boss Rush.', cat: 'Trial', icon: 'crown', title: 'the Tireless' },
  { id: 'rush_merciless', name: 'Without Mercy', desc: 'Finish the Boss Rush on Merciless.', cat: 'Trial', icon: 'crown', hidden: true, title: 'the Unrelenting', cape: 'blood' },
  { id: 'daily_1', name: 'Today\'s Trial', desc: 'Clear all ten waves of a daily challenge.', cat: 'Trial', icon: 'sigil', tally: 'daily', prog: (s) => count(s, 'daily', 1) },
  { id: 'daily_7', name: 'Faithful', desc: 'Clear seven daily challenges.', cat: 'Trial', icon: 'sigil', title: 'the Faithful', tally: 'daily', prog: (s) => count(s, 'daily', 7) },
  { id: 'lamps_ch1', name: 'Lamplighter', desc: 'Break every lamp in Chapter I (they need not fall on the same visit).', cat: 'Journey', icon: 'lamp', title: 'Lamplighter', cape: 'lamp', prog: (s) => lampProgress(s) },
  { id: 'lamps_200', name: 'Oil and Ember', desc: 'Break 200 lamps.', cat: 'Journey', icon: 'lamp', tally: 'lamp', prog: (s) => count(s, 'lamp', 200) },
  { id: 'ch1_secrets', name: 'Hearthward\'s Secrets', desc: 'Open every chest and read every lore stone in Chapter I.', cat: 'Journey', icon: 'book', title: 'the Seeker', cape: 'linen',
    prog: (s) => { const f = ch1Secrets(); return [f.chests.filter((id) => s.opened.includes(id)).length + f.lore.filter((id) => s.lore.includes(id)).length, f.chests.length + f.lore.length]; } },
  { id: 'crown_caches', name: 'Crown Hoards', desc: 'Find all nine hidden caches of Chapters VII, VIII and IX.', cat: 'Journey', icon: 'fragment', title: 'Treasure-Finder',
    prog: (s) => { const c = CROWN_CACHES(); return [c.filter((id) => s.secrets.includes(id)).length, c.length]; } },
  { id: 'swift_ch1', name: 'Pilgrim\'s Pace', desc: 'Finish Chapter I within 25 minutes of a new journey.', cat: 'Journey', icon: 'dodge', hidden: true },
  { id: 'low_ch9', name: 'The Few', desc: 'Finish Chapter IX below level 120.', cat: 'Journey', icon: 'heart', hidden: true },
  { id: 'ng_plus', name: 'Called Again', desc: 'Begin New Game+.', cat: 'Journey', icon: 'chapters', title: 'Twice-Called', prog: (s) => [Math.min(1, s.ng), 1] },
];
export const TROPHY: Record<string, Trophy> = Object.fromEntries(TROPHIES.map((t) => [t.id, t]));

function lampProgress(s: SaveData): readonly [number, number] {
  const L = s.valor?.lamps ?? {};
  let done = 0;
  for (const id of CH1_ROOMS) {
    const r = L[id];
    if (r && bitCount(r[0] & (2 ** Math.min(31, r[1]) - 1)) >= r[1]) done++;
  }
  return [done, CH1_ROOMS.length];
}

export function valorOf(s: SaveData): ValorData {
  const v = s.valor ??= { got: {}, n: {} };
  return v;
}

/** Bring a save's trophy book up to date, crediting what it already proves. */
export function migrateValor(s: SaveData) {
  const v = valorOf(s);
  if (!v.got || typeof v.got !== 'object') v.got = {};
  if (!v.n || typeof v.n !== 'object') v.n = {};
  if (v.cape && !CAPES[v.cape]) v.cape = undefined;
  if (v.title && !TROPHY[v.title]?.title) v.title = undefined;
  let found = 0;
  for (const t of TROPHIES) {
    if (v.got[t.id] !== undefined || !t.prog) continue;
    const [cur, max] = t.prog(s);
    if (cur >= max) { v.got[t.id] = 0; found++; }
  }
  if (found) v.retro = (v.retro ?? 0) + found;
}

export const hasTrophy = (s: SaveData, id: string) => s.valor?.got[id] !== undefined;
export const trophyCount = (s: SaveData) => TROPHIES.filter((t) => hasTrophy(s, t.id)).length;

/** The worn title, if the save has one. */
export function titleOf(s: SaveData | null | undefined): string | null {
  const id = s?.valor?.title;
  return id && hasTrophy(s!, id) ? TROPHY[id]?.title ?? null : null;
}
/** The worn cape colours, if any (read every frame: a table lookup, no allocation). */
export function capeOf(s: SaveData): CapeLook | null {
  const k = s.valor?.cape;
  return k ? CAPES[k] ?? null : null;
}
/** Cape colours the save has earned. */
export const capesEarned = (s: SaveData) => TROPHIES.filter((t) => t.cape && hasTrophy(s, t.id)).map((t) => t.cape!);
export const titlesEarned = (s: SaveData) => TROPHIES.filter((t) => t.title && hasTrophy(s, t.id));

// ---------------------------------------------------------------- unlocking

type Listener = (t: Trophy) => void;
let onWon: Listener = () => {};
/** The UI announces trophies (a toast and a sound); set once at start-up. */
export function onTrophy(fn: Listener) { onWon = fn; }

export function unlock(id: string): boolean {
  const s = G.save, t = TROPHY[id];
  if (!s || !t) return false;
  const v = valorOf(s);
  if (v.got[id] !== undefined) return false;
  v.got[id] = Date.now();
  onWon(t);
  return true;
}

/** A tally rose; trophies that read it are checked at once. */
export function addTally(k: Tally, n = 1) {
  const s = G.save;
  if (!s) return;
  const v = valorOf(s);
  v.n[k] = (v.n[k] ?? 0) + n;
  for (const t of TROPHIES) if (t.tally === k && v.got[t.id] === undefined && t.prog) { const [cur, max] = t.prog(s); if (cur >= max) unlock(t.id); }
}

// ---------------------------------------------------------------- live tracking

/** The boss of the fight in progress, and whether Elior has been struck since it began. */
let bossRef: { hp: number; remove: boolean } | null = null;
let clean = true;
let zeroSeen = false, zeroParry = false;
let lastParry = -99;
const CHECK = 1;
let checkT = 0;

export const valorTrack = {
  /** A perfect parry. */
  parry() {
    lastParry = G.time;
    addTally('parry');
  },
  /** Elior took a full blow (blocked and parried ones do not count). */
  hurt() {
    if (bossRef) clean = false;
  },
  finisher() {
    addTally('finisher');
  },
  /** A room's lamps were lit: remember how many it has. */
  lampsLit(room: string, total: number) {
    const s = G.save;
    if (!s) return;
    const L = valorOf(s).lamps ??= {};
    const r = L[room];
    if (!r) L[room] = [0, total];
    else if (r[1] !== total) r[1] = total;
  },
  lamp(room: string, index: number) {
    const s = G.save;
    if (!s) return;
    const L = valorOf(s).lamps ??= {};
    const r = L[room] ??= [0, index + 1];
    if (index < 31) r[0] |= 1 << index;
    addTally('lamp');
  },
  /** A boss fell (story, Gauntlet or Rush); called before any chapter logic. */
  bossDown(b: { hp: number; remove: boolean; key?: string }) {
    const key = b.key ?? 'idol';
    if (b === bossRef && clean) unlock('flawless_' + key);
    if (b === bossRef && zeroParry) unlock('riposte');
    checkT = 0;
  },
  rushDone(merciless: boolean) {
    unlock('rush_done');
    if (merciless) unlock('rush_merciless');
  },
  /** For tests and the debug API. */
  get state() { return { clean, bossRef, zeroParry, lastParry }; },
};

/** Every step: a pointer compare for the boss fight, and a full check once a second. */
export function valorTick(dt: number) {
  const s = G.save, W = G.world;
  if (!s) return;
  const b = W.bossActive ? W.boss as unknown as { hp: number; remove: boolean } | null : null;
  if (b && b !== bossRef) {
    bossRef = b;
    clean = true;
    zeroSeen = zeroParry = false;
  }
  if (bossRef) {
    // The blow that empties a boss's health: was a parry just before it?
    if (bossRef.hp <= 0 && !zeroSeen) {
      zeroSeen = true;
      zeroParry = G.time - lastParry < 1.25 || W.player.counterT > 0;
    } else if (bossRef.hp > 0 && zeroSeen) zeroSeen = zeroParry = false;
  }
  checkT -= dt;
  if (checkT > 0) return;
  checkT = CHECK;
  check(s);
}

function check(s: SaveData) {
  const v = valorOf(s);
  if (v.retro) {
    const n = v.retro;
    v.retro = 0;
    G.ui.toast(`Trials of Valor: ${n} trophies recognised from your journey so far. See the Valor tab.`, 'good');
  }
  // Chapter I against the clock, from a new journey only.
  if (v.c1 === undefined) v.c1 = !flag('ending_done') && s.playtime < 300 && !s.ng ? 0 : -1;
  else if (v.c1 >= 0 && flag('ending_done')) {
    if (s.playtime - v.c1 <= 25 * 60) unlock('swift_ch1');
    v.c1 = -1;
  }
  // Chapter IX's finish is judged only if this save was seen before it.
  if (v.c9 === undefined) v.c9 = flag('ch9_done') ? 2 : 1;
  else if (v.c9 === 1 && flag('ch9_done')) {
    if (s.level < 120) unlock('low_ch9');
    v.c9 = 2;
  }
  for (const t of TROPHIES) {
    if (!t.prog || v.got[t.id] !== undefined) continue;
    const [cur, max] = t.prog(s);
    if (cur >= max) unlock(t.id);
  }
}
