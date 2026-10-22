// Remnant's Rest: the survivors' settlement in a valley below the Ashen Road.
// One room, laid out left to right as the village grows: the altar and the
// gate, the homes, the plaza with its well and board, the smithy, then up a
// terrace to the healer and the gathering hall, and up again to the gardens
// and the watchtower. What stands where is chosen by the settlement's tier:
// decor carries `rest_t1`..`rest_t4` (set before the room spawns, see
// game/settlement.ts), and residents carry `rest_npc_<kind>`.

import { MapBuilder, type RoomDef, type EntDef, type NpcKind } from './tiles';

export const REST_ID = 'remnant_rest';
const W = 128, H = 26, F = 22;

/** Ground row at column x: the plaza, the first terrace (2 up), the high terrace (4 up). */
export function restGround(x: number) {
  const c = Math.floor(x);
  if (c < 62) return F;
  if (c < 64) return F - (c - 61);
  if (c < 98) return F - 2;
  if (c < 100) return F - 2 - (c - 97);
  return F - 4;
}

/** Where each resident stands; their presence is decided in game/settlement.ts. */
export const REST_HOMES: [NpcKind, number, number][] = [
  ['azriel', 19.5, 1], ['tobiah', 27, -1], ['mara', 31, 1], ['ilan', 45.5, -1], ['dov', 57, -1],
  ['ezra', 73.5, -1], ['talia', 92, -1], ['hanan', 80.5, 1], ['barak', 105, 1], ['arshan', 116.5, 1],
];

/** The quest board's spot on the plaza (the board itself is an entity added on entry). */
export const REST_BOARD_X = 34;

type P = [k: string, x: number, o?: { v?: number; w?: number; h?: number; flip?: boolean; fg?: boolean; cond?: string; ncond?: string; dy?: number }];
type L = [k: 'glow' | 'torch' | 'brazier' | 'forge' | 'candles', x: number, lift: number, cond?: string, r?: number, c?: string];

const T1 = 'rest_t1', T2 = 'rest_t2', T3 = 'rest_t3', T4 = 'rest_t4';
const WARM = '#ffb060', HEARTH = '#ff9a4a', DOOR = '#ffc070';

// Listed back to front: backdrops first, so things in front of them draw over them.
const PROPS: P[] = [
  // the valley floor behind everything: terrace walls, hedges and paths
  ['rest_terrace', 64, { w: 34 }], ['rest_terrace', 100, { w: 28, v: 1 }],
  // ---- the gate and the altar
  ['rest_gate', 4], ['rest_cypress', 1.5], ['rest_fence', 12, { w: 3 }],
  // ---- homes: tents first, cabins as the tier grows
  ['rest_tent', 15, { ncond: T1 }], ['rest_tent', 21.5, { v: 1, ncond: T2 }], ['rest_tent', 27.5, { flip: true, ncond: T1 }],
  ['rest_cabin', 15.5, { cond: T1 }], ['rest_cabin', 27, { v: 1, cond: T1, flip: true }], ['rest_tent', 22, { v: 2, cond: T2 }],
  ['rest_bedroll', 24.5, { ncond: T1 }], ['rest_woodpile', 11, { cond: T1 }], ['rest_washline', 19, { w: 6, cond: T2 }],
  ['rest_booth', 22, { cond: T4 }],
  // ---- the plaza: well, board, market
  ['rest_tree', 30, { v: 0 }], ['rest_well', 38.5], ['rest_crates', 41, { ncond: T1 }],
  ['rest_stall', 44, { cond: T1 }], ['rest_produce', 47.5, { cond: T1 }], ['rest_bench', 36, { cond: T2 }],
  ['rest_planter', 41.5, { cond: T3 }], ['rest_planter', 32, { cond: T3, v: 1 }],
  // ---- the smithy, a cart and timber before it
  ['rest_cart', 52, { ncond: T2 }], ['rest_timber', 57, { ncond: T2 }],
  ['rest_smithy', 54, { cond: T2 }], ['rest_cypress', 60.5, { v: 1 }],
  // ---- first terrace: the healer
  ['rest_tree', 66, { v: 1 }], ['rest_lean', 70, { ncond: T2 }], ['rest_healer', 70, { cond: T2 }], ['rest_herbs', 75.5, { cond: T2 }],
  // ---- the gathering hall: a site, then a frame, then the hall
  ['rest_stones', 87, { ncond: T2 }], ['rest_frame', 87, { cond: T2, ncond: T3 }], ['rest_hall', 87, { cond: T3 }],
  ['rest_cabin', 79, { v: 2, cond: T1, ncond: T3 }], ['rest_bench', 95, { cond: T3, flip: true }],
  // ---- high terrace: the fig, the gardens, the tower
  ['rest_fig', 102], ['rest_garden', 109, { w: 7, cond: T3 }], ['rest_sheaves', 109, { ncond: T3 }],
  ['rest_cypress', 113.5], ['rest_cairn', 121, { ncond: T4 }], ['rest_tower', 121, { cond: T4 }], ['rest_cypress', 126, { v: 1 }],
  ['rest_booth', 98.5, { cond: T4, v: 1, flip: true }],
  // ---- things that move, and the festival
  ['rest_fire', 24.5], ['rest_banner', 34, { cond: T3, h: 4 }], ['rest_banner', 50, { cond: T3, h: 4, v: 1 }], ['rest_banner', 96, { cond: T3, h: 5, v: 2 }],
  ['rest_children', 106, { cond: T3 }], ['rest_smoke', 17.1, { cond: T1, dy: -70 }], ['rest_smoke', 51.5, { cond: T2, dy: -84, v: 1 }],
  ['rest_bunting', 29, { cond: T4, w: 20 }], ['rest_bunting', 77, { cond: T4, w: 21, v: 1 }], ['rest_bunting', 101, { cond: T4, w: 14, v: 2 }],
  ['rest_flag', 121, { cond: T4, dy: -162 }],
  ['rest_lamp', 6, { h: 3 }], ['rest_lamp', 36, { h: 3 }], ['rest_lamp', 49, { h: 3, cond: T1 }], ['rest_lamp', 77, { h: 3, cond: T2 }], ['rest_lamp', 97, { h: 3, cond: T3 }],
  // near the eye
  ['grass', 0, { w: 9, fg: true }], ['rest_flowers', 60, { w: 4, fg: true }], ['rest_flowers', 100, { w: 6, fg: true, cond: T3 }], ['grass', 122, { w: 6, fg: true }],
];

const LAMPS: L[] = [
  ['glow', 6.5, 2.3, undefined, 60, WARM], ['glow', 36.5, 2.3, undefined, 60, WARM], ['glow', 49.5, 2.3, T1, 60, WARM],
  ['glow', 77.5, 2.3, T2, 60, WARM], ['glow', 97.5, 2.3, T3, 60, WARM], ['glow', 24.5, 1, undefined, 90, HEARTH],
  ['glow', 15, 1, undefined, 40, HEARTH], ['glow', 27.5, 1, undefined, 40, HEARTH],
  ['glow', 15.5, 2, T1, 50, WARM], ['glow', 27, 2, T1, 50, WARM], ['glow', 22, 1, T2, 40, HEARTH],
  ['glow', 38.5, 3, undefined, 46, '#ffd890'], ['glow', 44, 3, T1, 70, WARM],
  ['forge', 51, 0, T2], ['glow', 54, 2, T2, 90, '#ff8a3a'],
  ['glow', 70, 2, T2, 70, WARM],
  ['glow', 87, 3, T3, 120, DOOR], ['glow', 87, 1, T2, 50, WARM], ['candles', 92.5, 0, T3],
  ['glow', 109, 2, T3, 60, '#ffd890'],
  ['glow', 121, 9, T4, 70, WARM], ['glow', 121, 1, undefined, 40, HEARTH],
  // the festival's strings of lamps
  ['glow', 33, 6, T4, 60, '#ffcf80'], ['glow', 41, 6, T4, 60, '#ffcf80'], ['glow', 82, 7, T4, 60, '#ffcf80'], ['glow', 92, 7, T4, 60, '#ffcf80'], ['glow', 106, 8, T4, 60, '#ffcf80'],
];

function build(): RoomDef {
  const b = new MapBuilder(W, H);
  b.rect(0, F, W, H - F);
  // the two terraces, each two rows up, with steps
  b.rect(62, F - 1, 66, 1).rect(63, F - 2, 65, 1);
  b.rect(98, F - 3, 30, 1).rect(99, F - 4, 29, 1);
  const ents: EntDef[] = [];
  for (const [k, x, o] of PROPS)
    ents.push({ t: 'decor', k, x, y: restGround(x) + (o?.dy ?? 0) / 16, v: o?.v, w: o?.w, h: o?.h, flip: o?.flip, fg: o?.fg, cond: o?.cond, ncond: o?.ncond });
  for (const [k, x, lift, cond, r, c] of LAMPS) ents.push({ t: 'light', k, x, y: restGround(x) - lift, cond, r, c });
  for (const [k, x, face] of REST_HOMES) ents.push({ t: 'npc', k, x, y: restGround(x), face, cond: `rest_npc_${k}` });
  ents.push(
    { t: 'altar', x: 9, y: F, id: REST_ID },
    { t: 'lore', x: 40.5, y: F, id: 'jer295' },
    { t: 'hint', x: 28, w: 12, id: 'rest_board_hint', text: 'Residents post their requests on the board. Use {interact} to read it.' },
  );
  return {
    id: REST_ID, name: 'Remnant\'s Rest', region: 'The Valley of the Rest', biome: 'rest', music: 'rest',
    dark: 0.3, weather: 'motes', map: { x: -4.5, y: 4.3 }, seed: 1207, interior: false,
    w: W, h: H, rows: b.rows(),
    spawns: { left: { x: 3, y: F, face: 1 }, altar: { x: 9, y: F, face: 1 }, start: { x: 9, y: F, face: 1 } },
    exits: [{ x: 0, y: F - 7, w: 1, h: 7, to: 'ashen_road', spawn: 'left' }],
    ents,
  };
}

export const REST_ROOM = build();
