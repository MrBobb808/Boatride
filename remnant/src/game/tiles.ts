// Tile grid, room definitions and collision queries.

export const TILE = 16;

export const enum T {
  Empty = 0, Stone = 1, Brick = 2, Wood = 3, OneWay = 4, Spikes = 5, Cracked = 6,
  Veil = 7, Water = 8, Collapse = 9, Seal = 10, Gate = 11,
}

export const CHAR_TILE: Record<string, T> = {
  '.': T.Empty, '#': T.Stone, 'B': T.Brick, 'W': T.Wood, '=': T.OneWay, '^': T.Spikes, 'C': T.Cracked,
  '~': T.Veil, 'w': T.Water, 'X': T.Collapse, 'S': T.Seal, 'G': T.Gate,
};

export type Biome = 'sanctuary' | 'village' | 'temple' | 'crypt' | 'sanctum' | 'plain' | 'tower' | 'valley' | 'hive' | 'trial' | 'dura' | 'babylon' | 'furnace' | 'riverbed' | 'gardens' | 'palace' | 'hiddekel' | 'shushan' | 'highplaces' | 'hunt' | 'plague';

export type EntDef =
  | { t: 'enemy'; k: EnemyKind; x: number; y: number; face?: number; elite?: string; cond?: string; ncond?: string }
  | { t: 'npc'; k: NpcKind; x: number; y: number; face?: number; cond?: string; ncond?: string }
  | { t: 'altar'; x: number; y: number; id: string; cond?: string }
  | { t: 'chest'; x: number; y: number; id: string; loot: Loot[]; secret?: boolean }
  | { t: 'lore'; x: number; y: number; id: string }
  | { t: 'shrine'; x: number; y: number; id: string; grants: string }
  | { t: 'pickup'; x: number; y: number; id: string; loot: Loot[] }
  | { t: 'trigger'; x: number; y: number; w: number; h: number; id: string }
  | { t: 'hint'; x: number; w: number; text: string; id: string; cond?: string }
  | { t: 'light'; x: number; y: number; k: 'torch' | 'brazier' | 'lantern' | 'candles' | 'forge' | 'window' | 'glow'; r?: number; c?: string; cond?: string }
  | { t: 'decor'; k: string; x: number; y: number; w?: number; h?: number; v?: number; flip?: boolean; fg?: boolean; cond?: string; ncond?: string }
  | { t: 'boss'; k: 'idol' | 'gatekeeper' | 'marshal' | 'locust_king' | 'golden_image' | 'weigher' | 'storm_prince' | 'persia_prince' | 'beast_monarch' | 'plague_monarch'; x: number; y: number };

export type EnemyKind = 'husk' | 'hound' | 'archer' | 'sentinel' | 'wisp' | 'brute' | 'bulwark' | 'knight' | 'drone' | 'soldier' | 'lion' | 'priest' | 'vessel' | 'scribe' | 'undying' | 'gale';
export type NpcKind = 'azriel' | 'mara' | 'tobiah' | 'ilan' | 'dov' | 'regent' | 'marshal' | 'satrap' | 'ezra' | 'talia' | 'barak' | 'hanan' | 'feastlord' | 'arshan' | 'storm_prince' | 'persia_prince';

export interface Loot {
  item?: string;
  rarity?: number;
  mat?: string;
  n?: number;
  silver?: number;
}

export interface Exit {
  x: number; y: number; w: number; h: number;
  to: string;
  spawn: string;
  cond?: string;
}

export interface RoomDef {
  id: string;
  name: string;
  region: string;
  biome: Biome;
  w: number;
  h: number;
  rows: string[];
  music: string;
  dark: number;
  weather?: 'ash' | 'embers' | 'dust' | 'motes' | 'drips' | 'rain';
  map: { x: number; y: number };
  spawns: Record<string, { x: number; y: number; face?: number }>;
  exits: Exit[];
  ents: EntDef[];
  seed: number;
  /** Interior rooms get a back wall instead of sky. */
  interior: boolean;
}

/** Builds tile maps from rectangles so room layouts stay readable. */
export class MapBuilder {
  g: string[][];
  constructor(public w: number, public h: number, fill = '.') {
    this.g = Array.from({ length: h }, () => Array(w).fill(fill));
  }
  rect(x: number, y: number, w: number, h: number, c = '#') {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (j >= 0 && j < this.h && i >= 0 && i < this.w) this.g[j][i] = c;
    return this;
  }
  plat(x: number, y: number, w: number) {
    return this.rect(x, y, w, 1, '=');
  }
  clear(x: number, y: number, w: number, h: number) {
    return this.rect(x, y, w, h, '.');
  }
  /** Staircase of 1-tile steps going up to the right (dir 1) or left (dir -1). */
  stairs(x: number, yBottom: number, steps: number, stepW: number, dir: 1 | -1, c = '#', depth = 3) {
    for (let s = 0; s < steps; s++) {
      const sx = dir > 0 ? x + s * stepW : x - (s + 1) * stepW;
      this.rect(sx, yBottom - s, stepW, s + depth, c);
    }
    return this;
  }
  rows() {
    return this.g.map((r) => r.join(''));
  }
}

export class Grid {
  w: number;
  h: number;
  t: Uint8Array;
  constructor(rows: string[]) {
    this.h = rows.length;
    this.w = rows[0].length;
    this.t = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) this.t[y * this.w + x] = CHAR_TILE[rows[y][x]] ?? T.Empty;
  }
  get(x: number, y: number): T {
    if (x < 0 || x >= this.w) return T.Stone;
    if (y < 0) return T.Empty;
    if (y >= this.h) return T.Stone;
    return this.t[y * this.w + x] as T;
  }
  set(x: number, y: number, v: T) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.t[y * this.w + x] = v;
  }
}

export const isSolid = (t: T) =>
  t === T.Stone || t === T.Brick || t === T.Wood || t === T.Cracked || t === T.Collapse || t === T.Seal || t === T.Gate;
export const isHazard = (t: T) => t === T.Spikes || t === T.Veil;
