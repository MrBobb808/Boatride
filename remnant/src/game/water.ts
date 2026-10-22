// Water volumes, currents and air bells: the room side of swimming.
//
// ─── For room authors ───────────────────────────────────────────────────────
// WATER   Any connected area of `w` tiles (T.Water) is water. Its drawn surface
//         sits WATER_LIP px below the top water tile's edge when there is air
//         above it. Per column, the depth from that surface to the floor
//         decides how it is crossed:
//           · depth ≤ SWIM_DEPTH (one tile of water): Elior WADES — a little
//             slower, splashing, jumps as usual.
//           · deeper (two tiles or more): he SWIMS (game/swim.ts).
//         A column of water with a solid tile directly above it is FLOODED: no
//         air at its top, so the head stays under (breath drains).
//         Empty tiles (`.`) left above water under a ceiling are natural air
//         pockets: surfacing there refills breath like any other surface.
// CURRENT { t: 'current', x, y, w, h, vx, vy, cond? }  (tiles; vx/vy in px/s)
//         Water flowing through that rectangle: swimmers, Echoes, bubbles and
//         drift are carried at (vx, vy). Swim speed is SWIM_SPEED, so a current
//         of ~90 can just be beaten, ~150 cannot. Drawn as streaks and bubbles.
// AIR     { t: 'air', x, y, r?, cond? }  (centre and radius in tiles, r ≈ 1.25)
//         A bell of trapped air under water (a sunken dome, a cracked hull):
//         breath refills while Elior's head is inside it. Drawn as a silvery
//         dome with a thin bubble stream.
// FOES    `eel` (Brine Eel, game/eel.ts): place it at its lair mouth inside
//         water, `face` toward open water. Land foes stop at the edge of deep
//         water; fliers ignore it.
// The look: render/underwater.ts (front tint, waterline, bubbles, streaks, the
// underwater overlay and the breath ring). WATER_TINT takes per-biome colours.
// ────────────────────────────────────────────────────────────────────────────

import { TILE, T, isSolid, MapBuilder, type Grid, type EntDef, type RoomDef } from './tiles';
import { flag } from './ctx';

/** Drawn surface offset inside the top water tile (matches the biome liquid painters). */
export const WATER_LIP = 5;
/** Water columns deeper than this (px, surface to floor) are swum; shallower ones are waded. */
export const SWIM_DEPTH = 22;
/** Seconds of breath with the head under water. */
export const BREATH_MAX = 20;
/** Breath regained per second at the surface or in an air bell (a full refill in about 1.3 s). */
export const BREATH_REFILL = 15;
/** Out of breath: this share of max health is lost every DROWN_TICK seconds. */
export const DROWN_DMG = 0.08;
export const DROWN_TICK = 1;
/** Swim speed, and how hard strokes turn it. */
export const SWIM_SPEED = 118;
export const SWIM_ACCEL = 560;
/** Wading speed multiplier. */
export const WADE_SLOW = 0.72;
/** How far below the surface Elior's feet rest while treading water (head and shoulders out). */
export const FLOAT_DEPTH = 28;

export interface WaterProbe {
  /** Surface y (or the flooded ceiling's underside). */
  surface: number;
  /** Floor y under the column. */
  floor: number;
  /** surface → floor. */
  depth: number;
  /** Open air above the surface (false: flooded to the ceiling). */
  air: boolean;
}

/**
 * Probe the water column at x for the point y. Returns true (and fills `out`)
 * when (x, y) is in water below the surface; false when dry.
 */
export function probeWater(g: Grid, x: number, y: number, out: WaterProbe): boolean {
  const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
  if (g.get(col, row) !== T.Water) return false;
  let top = row;
  while (top > 0 && g.get(col, top - 1) === T.Water) top--;
  let bot = row;
  while (bot < g.h - 1 && g.get(col, bot + 1) === T.Water) bot++;
  out.air = top === 0 || !isSolid(g.get(col, top - 1));
  out.surface = top * TILE + (out.air ? WATER_LIP : 0);
  out.floor = (bot + 1) * TILE;
  out.depth = out.floor - out.surface;
  return y >= out.surface;
}

interface Current { x0: number; y0: number; x1: number; y1: number; vx: number; vy: number; cond?: string }
interface Pocket { x: number; y: number; r: number; cond?: string }

/** The current room's water: rebuilt on every load. */
export const waterRoom = {
  /** Any water tiles at all (everything else here is skipped when not). */
  any: false,
  currents: [] as Current[],
  pockets: [] as Pocket[],
  /** Loads so far: lets the visuals drop cached state per room. */
  gen: 0,
};

const probe: WaterProbe = { surface: 0, floor: 0, depth: 0, air: true };

export function prepareWater(ents: EntDef[], g: Grid) {
  waterRoom.gen++;
  waterRoom.currents.length = 0;
  waterRoom.pockets.length = 0;
  waterRoom.any = false;
  for (let i = 0; i < g.t.length; i++) if (g.t[i] === T.Water) { waterRoom.any = true; break; }
  for (const e of ents) {
    if (e.t === 'current') {
      waterRoom.currents.push({ x0: e.x * TILE, y0: e.y * TILE, x1: (e.x + e.w) * TILE, y1: (e.y + e.h) * TILE, vx: e.vx, vy: e.vy, cond: e.cond });
    } else if (e.t === 'air') waterRoom.pockets.push({ x: e.x * TILE, y: e.y * TILE, r: (e.r ?? 1.25) * TILE, cond: e.cond });
  }
}

/** The flow at a point (sum of the currents over it), written into out. */
export function flowAt(x: number, y: number, out: { x: number; y: number }) {
  out.x = out.y = 0;
  for (const c of waterRoom.currents) {
    if (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1 || (c.cond && !flag(c.cond))) continue;
    out.x += c.vx;
    out.y += c.vy;
  }
  return out;
}

/** Is this point inside an air bell? */
export function inAirPocket(x: number, y: number) {
  for (const p of waterRoom.pockets) {
    if (p.cond && !flag(p.cond)) continue;
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy < p.r * p.r) return true;
  }
  return false;
}

/** Is (x, y) in water at all (below a surface)? */
export function inWater(g: Grid, x: number, y: number) {
  return probeWater(g, x, y, probe);
}

/** Is there swimmable water just ahead of or under feet at (x, y)? */
export function deepWaterAt(g: Grid, x: number, y: number) {
  return (probeWater(g, x, y + 2, probe) || probeWater(g, x, y - 2, probe)) && probe.depth > SWIM_DEPTH;
}

interface FoeBody { x: number; y: number; vx: number; vy: number; w: number; onGround: boolean }

/**
 * Land foes stop at the edge of deep water, and one that is knocked in sinks
 * slowly and plods along the bottom. Called from Enemy.physics before moving.
 */
export function landFoeWater(b: FoeBody, g: Grid, dt: number) {
  if (probeWater(g, b.x, b.y - 2, probe) && probe.depth > SWIM_DEPTH) {
    b.vy = Math.min(b.vy, 70);
    b.vx *= Math.exp(-3 * dt);
    return;
  }
  if (!b.onGround || b.vx === 0) return;
  const ax = b.x + Math.sign(b.vx) * (b.w / 2 + 2) + b.vx * dt;
  if (deepWaterAt(g, ax, b.y)) b.vx = 0;
}

// ---------------------------------------------------------------- test room

/**
 * A water proving room for verification and for trying the feel: land, a
 * one-tile wading pool, a deep basin with a current, a flooded tunnel with an
 * air bell, and an eel lair. Registered by the `?debug` API (`swimRoom()`).
 */
export function swimTestRoom(): RoomDef {
  const W = 84, H = 32;
  const b = new MapBuilder(W, H);
  b.rect(0, 0, W, 2).rect(0, 0, 2, H).rect(W - 2, 0, 2, H).rect(0, 29, W, 3);
  // Left shore with a one-tile wading pool.
  b.rect(2, 18, 24, 11);
  b.rect(14, 18, 6, 1, 'w');
  // The basin: ten tiles of water, a reef step, then a flooded tunnel.
  b.rect(26, 18, 50, 11, 'w');
  b.rect(38, 25, 4, 4);
  // A roofed stretch floods the water beneath it (rows 18–21 solid, water below).
  b.rect(56, 16, 12, 6);
  // Right shore.
  b.rect(76, 18, 6, 11);
  return {
    id: 'swim_test', name: 'The Drowned Proving', region: 'Debug', biome: 'hiddekel', w: W, h: H, rows: b.rows(),
    music: '', dark: 0.2, map: { x: 0, y: 0 }, seed: 1010, interior: false,
    spawns: { left: { x: 6, y: 18, face: 1 }, basin: { x: 32, y: 19, face: 1 } },
    exits: [],
    ents: [
      { t: 'current', x: 44, y: 22, w: 10, h: 5, vx: 90, vy: 0 },
      { t: 'air', x: 62, y: 23, r: 1.4 },
      { t: 'light', k: 'glow', x: 62, y: 23, r: 50, c: '#bfe6ff' },
    ],
  };
}
