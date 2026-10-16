// Chapter V — The Writing on the Wall. The night of the great feast. An army
// from the east has turned the river aside, and the Remnant walks into
// Babylon along the dry riverbed while the whole city drinks. Eight rooms:
// the camp in the reeds, the dry riverbed under the walls, the streets of
// the feast, the hanging gardens (with the treasury of the temple vessels
// below them), the banquet hall where the hand writes, the palace stair, and
// the Hall of Scales. Coordinates are tiles; an entity's y is the row its
// feet stand on.

import { MapBuilder, type RoomDef, type Exit, type EntDef } from './tiles';

type Spec = Omit<RoomDef, 'rows' | 'w' | 'h' | 'exits'> & { exits: (Exit & { cond?: string })[] };

function room(b: MapBuilder, spec: Spec) {
  return { ...spec, w: b.w, h: b.h, rows: b.rows() };
}

const RIVER = 'The River Turned Aside';
const CITY = 'Babylon, the Night of the Feast';
const PALACE = 'The Palace of the King';

// ---------------------------------------------------------------- Camp in the reeds
function reedCamp() {
  const b = new MapBuilder(64, 22);
  b.rect(0, 18, 64, 4);
  b.rect(0, 0, 2, 18);
  b.clear(34, 18, 9, 2).rect(34, 19, 9, 1, 'w').rect(34, 20, 9, 1);
  b.plat(46, 14, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'dead_reeds', x: 33, y: 18 },
    { t: 'decor', k: 'dead_reeds', x: 43, y: 18, flip: true },
    { t: 'decor', k: 'dead_reeds', x: 9, y: 18 },
    { t: 'decor', k: 'stranded_boat', x: 38, y: 18, w: 10 },
    { t: 'decor', k: 'mooring_post', x: 30, y: 18 },
    { t: 'decor', k: 'tent', x: 14, y: 18 },
    { t: 'decor', k: 'tent', x: 54, y: 18, flip: true },
    { t: 'decor', k: 'bedroll', x: 18, y: 18 },
    { t: 'decor', k: 'cart', x: 49, y: 18 },
    { t: 'decor', k: 'anvil', x: 58, y: 18 },
    { t: 'decor', k: 'city_wall', x: 50, y: 18, w: 40, h: 12 },
    { t: 'light', k: 'brazier', x: 22.5, y: 18 },
    { t: 'light', k: 'forge', x: 59, y: 18 },
    { t: 'light', k: 'lantern', x: 14, y: 12 },
    { t: 'altar', x: 6, y: 18, id: 'reed_camp' },
    { t: 'npc', k: 'mara', x: 11, y: 18, face: 1 },
    { t: 'npc', k: 'azriel', x: 20, y: 18, face: 1 },
    { t: 'npc', k: 'tobiah', x: 25, y: 18, face: -1 },
    { t: 'npc', k: 'ilan', x: 51, y: 18, face: -1 },
    { t: 'npc', k: 'dov', x: 56, y: 18, face: 1 },
    { t: 'npc', k: 'ezra', x: 16, y: 18, face: 1 },
    { t: 'npc', k: 'barak', x: 28, y: 18, face: -1 },
    { t: 'npc', k: 'talia', x: 46, y: 18, face: -1 },
    { t: 'npc', k: 'hanan', x: 8.5, y: 18, face: 1, cond: 'ch5_writing' },
    { t: 'chest', x: 49, y: 14, id: 'reed_cart', loot: [{ silver: 220 }, { mat: 'radiant_core', n: 1 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 31, y: 18, id: 'jer5136' },
  ];
  return room(b, {
    id: 'reed_camp', name: 'Camp in the Reeds', region: RIVER, biome: 'riverbed', music: 'riverbed',
    dark: 0.42, weather: 'motes', map: { x: 0, y: 5 }, seed: 601, interior: false,
    spawns: { start: { x: 20, y: 18, face: 1 }, altar: { x: 6, y: 18, face: 1 }, right: { x: 61, y: 18, face: -1 } },
    exits: [{ x: 63, y: 9, w: 1, h: 9, to: 'dry_riverbed', spawn: 'left' }],
    ents,
  });
}

// ---------------------------------------------------------------- The dry riverbed, under the walls
function dryRiverbed() {
  const b = new MapBuilder(120, 26);
  b.rect(0, 21, 120, 5);
  b.clear(26, 21, 10, 2).rect(26, 22, 10, 1, 'w').rect(26, 23, 10, 1);
  b.clear(60, 21, 8, 2).rect(60, 22, 8, 1, 'w').rect(60, 23, 8, 1);
  b.plat(14, 17, 9).plat(44, 16, 10).plat(72, 15, 8);
  b.stairs(92, 21, 4, 3, 1);
  b.rect(104, 17, 16, 4);
  b.plat(86, 11, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'dead_reeds', x: 6, y: 21 },
    { t: 'decor', k: 'stranded_boat', x: 18, y: 21, w: 12 },
    { t: 'decor', k: 'stranded_boat', x: 49, y: 21, w: 14, flip: true },
    { t: 'decor', k: 'stranded_boat', x: 76, y: 21, w: 11 },
    { t: 'decor', k: 'fish_bones', x: 38, y: 21 },
    { t: 'decor', k: 'fish_bones', x: 70, y: 21, flip: true },
    { t: 'decor', k: 'mooring_post', x: 40, y: 21 },
    { t: 'decor', k: 'mooring_post', x: 84, y: 21 },
    { t: 'decor', k: 'city_wall', x: 100, y: 21, w: 44, h: 16 },
    { t: 'decor', k: 'river_gate', x: 112, y: 17, w: 10, h: 12 },
    { t: 'light', k: 'lantern', x: 18, y: 13 },
    { t: 'light', k: 'brazier', x: 106, y: 17 },
    { t: 'light', k: 'glow', x: 112, y: 10, r: 80, c: '#ffcf8a' },
    { t: 'enemy', k: 'lion', x: 24, y: 21, face: -1 },
    { t: 'enemy', k: 'vessel', x: 36, y: 13, face: -1 },
    { t: 'enemy', k: 'knight', x: 52, y: 21, face: -1 },
    { t: 'enemy', k: 'vessel', x: 64, y: 12, face: -1 },
    { t: 'enemy', k: 'scribe', x: 75, y: 15, face: -1 },
    { t: 'enemy', k: 'lion', x: 88, y: 21, face: -1 },
    { t: 'enemy', k: 'knight', x: 108, y: 17, face: -1 },
    { t: 'chest', x: 88, y: 11, id: 'boat_hold', loot: [{ silver: 180 }, { mat: 'sentinel_steel', n: 2 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 42, y: 21, id: 'jer5038' },
    { t: 'hint', x: 30, w: 8, id: 'h_vessels', text: 'Vessel Wraiths pour burning wine from above. Strike them out of the air, or wait for the dive and {parry}.' },
  ];
  return room(b, {
    id: 'dry_riverbed', name: 'The Dry Riverbed', region: RIVER, biome: 'riverbed', music: 'riverbed',
    dark: 0.45, weather: 'motes', map: { x: 4, y: 4.75 }, seed: 607, interior: false,
    spawns: { left: { x: 3, y: 21, face: 1 }, right: { x: 116, y: 17, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'reed_camp', spawn: 'right' },
      { x: 119, y: 8, w: 1, h: 9, to: 'feast_streets', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The streets, while the city drinks
function feastStreets() {
  const b = new MapBuilder(130, 28);
  b.rect(0, 23, 130, 5);
  b.plat(14, 19, 8).plat(26, 15, 8).plat(40, 11, 6);
  b.rect(54, 19, 12, 4);
  b.plat(70, 16, 8).plat(84, 12, 8).plat(98, 16, 8);
  b.plat(112, 8, 6);
  b.rect(116, 19, 14, 4);
  const ents: EntDef[] = [
    { t: 'decor', k: 'city_wall', x: 30, y: 23, w: 50, h: 13 },
    { t: 'decor', k: 'city_wall', x: 98, y: 23, w: 44, h: 15 },
    { t: 'decor', k: 'feast_lanterns', x: 30, y: 6, w: 36 },
    { t: 'decor', k: 'feast_lanterns', x: 92, y: 5, w: 40 },
    { t: 'decor', k: 'reveler_table', x: 10, y: 23 },
    { t: 'decor', k: 'reveler_table', x: 48, y: 23, flip: true },
    { t: 'decor', k: 'wine_jars', x: 60, y: 19 },
    { t: 'decor', k: 'wine_jars', x: 80, y: 23 },
    { t: 'decor', k: 'market_stall', x: 92, y: 23, flip: true },
    { t: 'decor', k: 'palm_planter', x: 68, y: 23 },
    { t: 'decor', k: 'babylon_banner', x: 36, y: 4, h: 5 },
    { t: 'decor', k: 'babylon_banner', x: 104, y: 4, h: 5 },
    { t: 'light', k: 'brazier', x: 22, y: 23 },
    { t: 'light', k: 'brazier', x: 74, y: 23 },
    { t: 'light', k: 'lantern', x: 87, y: 7 },
    { t: 'light', k: 'glow', x: 60, y: 12, r: 90, c: '#ffb35a' },
    { t: 'enemy', k: 'husk', x: 12, y: 23, face: -1 },
    { t: 'enemy', k: 'husk', x: 18, y: 23, face: -1 },
    { t: 'enemy', k: 'scribe', x: 29, y: 15, face: -1 },
    { t: 'enemy', k: 'vessel', x: 46, y: 14, face: -1 },
    { t: 'enemy', k: 'priest', x: 60, y: 19, face: -1 },
    { t: 'enemy', k: 'lion', x: 76, y: 23, face: -1 },
    { t: 'enemy', k: 'vessel', x: 88, y: 8, face: -1 },
    { t: 'enemy', k: 'scribe', x: 101, y: 16, face: -1 },
    { t: 'enemy', k: 'knight', x: 122, y: 19, face: -1 },
    { t: 'chest', x: 114, y: 8, id: 'lantern_cache', secret: true, loot: [{ silver: 260 }, { mat: 'radiant_core', n: 1 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 64, y: 19, id: 'isa219' },
    { t: 'hint', x: 22, w: 10, id: 'h_scribes', text: 'Scribes of the Veil write burning letters in the air. Close in and break the writing before it is finished.' },
  ];
  return room(b, {
    id: 'feast_streets', name: 'The Streets of the Feast', region: CITY, biome: 'babylon', music: 'feast',
    dark: 0.5, weather: 'embers', map: { x: 11.5, y: 4.6 }, seed: 613, interior: false,
    spawns: { left: { x: 3, y: 23, face: 1 }, right: { x: 126, y: 19, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 9, to: 'dry_riverbed', spawn: 'right' },
      { x: 129, y: 10, w: 1, h: 9, to: 'hanging_gardens', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The hanging gardens (a climb)
function hangingGardens() {
  const b = new MapBuilder(72, 44);
  b.rect(0, 40, 72, 4);
  b.rect(0, 0, 2, 31);
  b.rect(70, 10, 2, 21);
  b.rect(14, 34, 30, 2).plat(8, 37, 5);
  b.rect(34, 28, 28, 2).plat(38, 31, 5);
  b.rect(8, 22, 30, 2).plat(30, 25, 4);
  b.rect(30, 16, 28, 2).plat(40, 19, 5);
  b.rect(52, 10, 18, 2).plat(47, 13, 4);
  b.plat(3, 18, 4).plat(5, 14, 3);
  const ents: EntDef[] = [
    { t: 'decor', k: 'terrace_arch', x: 28, y: 40, w: 10, h: 6 },
    { t: 'decor', k: 'terrace_arch', x: 48, y: 34, w: 8, h: 6 },
    { t: 'decor', k: 'hanging_vines', x: 20, y: 36, h: 5 },
    { t: 'decor', k: 'hanging_vines', x: 40, y: 30, h: 6 },
    { t: 'decor', k: 'hanging_vines', x: 16, y: 24, h: 5 },
    { t: 'decor', k: 'hanging_vines', x: 50, y: 18, h: 6 },
    { t: 'decor', k: 'garden_tree', x: 10, y: 40 },
    { t: 'decor', k: 'garden_tree', x: 56, y: 28, flip: true },
    { t: 'decor', k: 'garden_tree', x: 22, y: 22 },
    { t: 'decor', k: 'garden_tree', x: 64, y: 10, flip: true },
    { t: 'decor', k: 'fountain', x: 26, y: 34 },
    { t: 'decor', k: 'irrigation_wheel', x: 60, y: 40, h: 8 },
    { t: 'decor', k: 'flower_bed', x: 46, y: 28 },
    { t: 'decor', k: 'flower_bed', x: 34, y: 16 },
    { t: 'light', k: 'lantern', x: 20, y: 30 },
    { t: 'light', k: 'lantern', x: 44, y: 12 },
    { t: 'light', k: 'glow', x: 36, y: 20, r: 120, c: '#b8d8ff' },
    { t: 'enemy', k: 'lion', x: 40, y: 40, face: -1 },
    { t: 'enemy', k: 'priest', x: 30, y: 34, face: -1 },
    { t: 'enemy', k: 'vessel', x: 24, y: 29, face: 1 },
    { t: 'enemy', k: 'bulwark', x: 50, y: 28, face: -1, elite: 'garden_keeper' },
    { t: 'enemy', k: 'scribe', x: 18, y: 22, face: 1 },
    { t: 'enemy', k: 'vessel', x: 58, y: 21, face: -1 },
    { t: 'enemy', k: 'knight', x: 44, y: 16, face: 1 },
    { t: 'altar', x: 60, y: 10, id: 'hanging_gardens' },
    { t: 'chest', x: 6, y: 14, id: 'terrace_cache', secret: true, loot: [{ silver: 240 }, { mat: 'radiant_core', n: 2 }, { rarity: 4 }] },
    { t: 'lore', x: 13, y: 22, id: 'ps629' },
    { t: 'hint', x: 62, w: 6, id: 'h_treasury', text: 'A low door at the foot of the gardens leads into the treasury.' },
  ];
  return room(b, {
    id: 'hanging_gardens', name: 'The Hanging Gardens', region: CITY, biome: 'gardens', music: 'gardens',
    dark: 0.42, weather: 'motes', map: { x: 19.6, y: 2.5 }, seed: 619, interior: false,
    spawns: { left: { x: 3, y: 40, face: 1 }, door: { x: 67, y: 40, face: -1 }, right: { x: 67, y: 10, face: -1 }, altar: { x: 60, y: 10, face: -1 } },
    exits: [
      { x: 0, y: 31, w: 1, h: 9, to: 'feast_streets', spawn: 'right' },
      { x: 71, y: 31, w: 1, h: 9, to: 'treasury', spawn: 'left' },
      { x: 71, y: 1, w: 1, h: 9, to: 'banquet_hall', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The treasury of the temple vessels (optional)
function treasury() {
  const b = new MapBuilder(72, 24);
  b.rect(0, 0, 72, 2);
  b.rect(0, 20, 72, 4);
  b.rect(0, 2, 2, 9).rect(70, 2, 2, 18);
  b.plat(12, 16, 8).plat(28, 12, 8).plat(46, 16, 8).plat(58, 11, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'vessel_shelf', x: 16, y: 20, w: 10 },
    { t: 'decor', k: 'vessel_shelf', x: 52, y: 20, w: 10 },
    { t: 'decor', k: 'treasure_heap', x: 34, y: 20, w: 8 },
    { t: 'decor', k: 'treasure_heap', x: 64, y: 20, w: 6 },
    { t: 'decor', k: 'palace_column', x: 24, y: 20, h: 18 },
    { t: 'decor', k: 'palace_column', x: 44, y: 20, h: 18 },
    { t: 'decor', k: 'glazed_frieze', x: 36, y: 6, w: 50 },
    { t: 'light', k: 'candles', x: 9, y: 20 },
    { t: 'light', k: 'candles', x: 40, y: 20 },
    { t: 'light', k: 'glow', x: 36, y: 12, r: 110, c: '#ffcf6b' },
    { t: 'enemy', k: 'vessel', x: 22, y: 9, face: -1 },
    { t: 'enemy', k: 'scribe', x: 30, y: 12, face: -1 },
    { t: 'enemy', k: 'knight', x: 40, y: 20, face: -1, elite: 'treasury_captain' },
    { t: 'enemy', k: 'vessel', x: 56, y: 8, face: -1 },
    { t: 'chest', x: 31, y: 12, id: 'vessel_cup', secret: true, loot: [{ silver: 120 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'chest', x: 61, y: 11, id: 'vessel_bowl', secret: true, loot: [{ silver: 120 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 8, y: 20, id: 'dan52' },
  ];
  return room(b, {
    id: 'treasury', name: 'The Treasury of Vessels', region: PALACE, biome: 'palace', music: 'palace',
    dark: 0.55, weather: 'motes', map: { x: 24.1, y: 4.4 }, seed: 631, interior: true,
    spawns: { left: { x: 4, y: 20, face: 1 } },
    exits: [{ x: 0, y: 11, w: 1, h: 9, to: 'hanging_gardens', spawn: 'door' }],
    ents,
  });
}

// ---------------------------------------------------------------- The banquet hall (the hand writes)
function banquetHall() {
  const b = new MapBuilder(96, 26);
  b.rect(0, 0, 96, 2);
  b.rect(0, 22, 96, 4);
  b.rect(0, 2, 2, 11).rect(94, 2, 2, 11);
  b.plat(8, 17, 10).plat(22, 13, 8).plat(66, 13, 8).plat(80, 10, 8);
  const ents: EntDef[] = [
    { t: 'decor', k: 'palace_column', x: 20, y: 22, h: 20 },
    { t: 'decor', k: 'palace_column', x: 40, y: 22, h: 20 },
    { t: 'decor', k: 'palace_column', x: 64, y: 22, h: 20 },
    { t: 'decor', k: 'palace_column', x: 84, y: 22, h: 20 },
    { t: 'decor', k: 'curtain', x: 30, y: 2, h: 10 },
    { t: 'decor', k: 'curtain', x: 74, y: 2, h: 10 },
    { t: 'decor', k: 'glazed_frieze', x: 48, y: 5, w: 90 },
    { t: 'decor', k: 'feast_table', x: 14, y: 22, w: 12 },
    { t: 'decor', k: 'feast_table', x: 30, y: 22, w: 14 },
    { t: 'decor', k: 'feast_table', x: 74, y: 22, w: 14 },
    { t: 'decor', k: 'wine_jars', x: 88, y: 22 },
    { t: 'decor', k: 'plaster_wall', x: 54, y: 19, w: 14, h: 10 },
    { t: 'decor', k: 'great_lampstand', x: 45, y: 22, h: 8 },
    { t: 'decor', k: 'throne_dais', x: 54, y: 22, w: 12 },
    { t: 'light', k: 'candles', x: 45, y: 14 },
    { t: 'light', k: 'brazier', x: 6, y: 22 },
    { t: 'light', k: 'brazier', x: 90, y: 22 },
    { t: 'light', k: 'glow', x: 54, y: 12, r: 140, c: '#ffd88a' },
    { t: 'enemy', k: 'husk', x: 12, y: 22, face: -1, ncond: 'ch5_writing' },
    { t: 'enemy', k: 'husk', x: 26, y: 22, face: -1, ncond: 'ch5_writing' },
    { t: 'enemy', k: 'vessel', x: 18, y: 10, face: -1, ncond: 'ch5_writing' },
    { t: 'enemy', k: 'scribe', x: 25, y: 13, face: -1, ncond: 'ch5_writing' },
    { t: 'chest', x: 84, y: 10, id: 'vessel_censer', secret: true, loot: [{ silver: 120 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'trigger', x: 36, y: 13, w: 2, h: 9, id: 'feast_writing' },
    { t: 'lore', x: 4, y: 22, id: 'dan54' },
  ];
  return room(b, {
    id: 'banquet_hall', name: 'The Banquet Hall', region: PALACE, biome: 'palace', music: 'feast',
    dark: 0.35, weather: 'motes', map: { x: 24.1, y: 2.0 }, seed: 641, interior: true,
    spawns: { left: { x: 3, y: 22, face: 1 }, right: { x: 92, y: 22, face: -1 } },
    exits: [
      { x: 0, y: 13, w: 1, h: 9, to: 'hanging_gardens', spawn: 'right' },
      { x: 95, y: 13, w: 1, h: 9, to: 'palace_stair', spawn: 'left', cond: 'ch5_writing' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The palace stair (rooftops, a climb)
function palaceStair() {
  const b = new MapBuilder(60, 46);
  b.rect(0, 42, 60, 4);
  b.rect(0, 0, 2, 33);
  b.rect(58, 10, 2, 32);
  b.rect(10, 37, 14, 2).plat(6, 39, 4);
  b.rect(30, 32, 14, 2).plat(25, 35, 4);
  b.rect(44, 26, 14, 2).plat(40, 29, 4);
  b.rect(26, 21, 14, 2).plat(41, 23, 3);
  b.rect(8, 16, 14, 2).plat(22, 18, 3);
  b.rect(20, 11, 20, 2).plat(17, 13, 3);
  b.rect(40, 8, 20, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'rooftop_parapet', x: 17, y: 37, w: 14 },
    { t: 'decor', k: 'rooftop_parapet', x: 37, y: 32, w: 14 },
    { t: 'decor', k: 'rooftop_parapet', x: 51, y: 26, w: 14 },
    { t: 'decor', k: 'rooftop_parapet', x: 50, y: 8, w: 20 },
    { t: 'decor', k: 'palace_column', x: 33, y: 21, h: 8 },
    { t: 'decor', k: 'glazed_frieze', x: 30, y: 40, w: 50 },
    { t: 'decor', k: 'babylon_banner', x: 15, y: 18, h: 5 },
    { t: 'decor', k: 'feast_lanterns', x: 30, y: 9, w: 20 },
    { t: 'light', k: 'lantern', x: 12, y: 33 },
    { t: 'light', k: 'brazier', x: 46, y: 26 },
    { t: 'light', k: 'lantern', x: 30, y: 7 },
    { t: 'enemy', k: 'lion', x: 30, y: 42, face: -1 },
    { t: 'enemy', k: 'scribe', x: 36, y: 32, face: -1 },
    { t: 'enemy', k: 'vessel', x: 50, y: 20, face: -1 },
    { t: 'enemy', k: 'knight', x: 32, y: 21, face: 1 },
    { t: 'enemy', k: 'vessel', x: 14, y: 12, face: 1 },
    { t: 'enemy', k: 'priest', x: 28, y: 11, face: 1 },
    { t: 'altar', x: 52, y: 26, id: 'palace_stair' },
    { t: 'trigger', x: 46, y: 1, w: 2, h: 7, id: 'armies_east' },
    { t: 'lore', x: 12, y: 16, id: 'isa451' },
  ];
  return room(b, {
    id: 'palace_stair', name: 'The Palace Stair', region: PALACE, biome: 'palace', music: 'palace',
    dark: 0.48, weather: 'embers', map: { x: 30.1, y: 0.7 }, seed: 653, interior: false,
    spawns: { left: { x: 3, y: 42, face: 1 }, right: { x: 56, y: 8, face: -1 }, altar: { x: 52, y: 26, face: -1 } },
    exits: [
      { x: 0, y: 33, w: 1, h: 9, to: 'banquet_hall', spawn: 'right' },
      { x: 59, y: 0, w: 1, h: 8, to: 'hall_of_scales', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The Hall of Scales (the boss)
function hallOfScales() {
  const b = new MapBuilder(72, 30);
  b.rect(0, 0, 72, 2);
  b.rect(0, 26, 72, 4);
  b.rect(0, 2, 2, 15).rect(70, 2, 2, 24);
  b.rect(3, 17, 1, 9, 'G');
  b.plat(14, 21, 7).plat(28, 17, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'balance_scales', x: 52, y: 26, w: 30, h: 20 },
    { t: 'decor', k: 'palace_column', x: 10, y: 26, h: 24 },
    { t: 'decor', k: 'palace_column', x: 36, y: 26, h: 24 },
    { t: 'decor', k: 'palace_column', x: 66, y: 26, h: 24 },
    { t: 'decor', k: 'star_window', x: 22, y: 10, w: 8, h: 7 },
    { t: 'decor', k: 'curtain', x: 44, y: 2, h: 12 },
    { t: 'decor', k: 'curtain', x: 60, y: 2, h: 12 },
    { t: 'light', k: 'brazier', x: 38, y: 26 },
    { t: 'light', k: 'brazier', x: 66, y: 26 },
    { t: 'light', k: 'glow', x: 52, y: 12, r: 140, c: '#ffd88a' },
    { t: 'boss', k: 'weigher', x: 52, y: 26 },
    { t: 'trigger', x: 20, y: 17, w: 2, h: 9, id: 'weigher_start' },
    { t: 'lore', x: 7, y: 26, id: 'prov1611' },
  ];
  return room(b, {
    id: 'hall_of_scales', name: 'The Hall of Scales', region: PALACE, biome: 'palace', music: '',
    dark: 0.4, weather: 'motes', map: { x: 33.85, y: 0.6 }, seed: 661, interior: true,
    spawns: { left: { x: 5, y: 26, face: 1 }, center: { x: 24, y: 26, face: 1 } },
    exits: [{ x: 0, y: 17, w: 1, h: 9, to: 'palace_stair', spawn: 'right' }],
    ents,
  });
}

export const ROOMS5 = [reedCamp(), dryRiverbed(), feastStreets(), hangingGardens(), treasury(), banquetHall(), palaceStair(), hallOfScales()];
export const CH5_ROOM_IDS = new Set(ROOMS5.map((r) => r.id));
