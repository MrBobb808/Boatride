// Chapter VI — The Prince of Persia. Babylon has fallen and Persia rules.
// By the great river Hiddekel, Hanan has fasted three full weeks and no answer
// has come. Something in the high places is standing in the way. Eight rooms:
// the camp by the river, the marshes of Ulai, the royal road, the gate of
// Shushan, the hall of a hundred columns, the high place of the winds (the
// Prince of the Storm), the high places themselves, and the throne of the
// Prince of the Kingdom of Persia. Coordinates are tiles; an entity's y is the
// row its feet stand on.

import { MapBuilder, type RoomDef, type Exit, type EntDef } from './tiles';

type Spec = Omit<RoomDef, 'rows' | 'w' | 'h' | 'exits'> & { exits: (Exit & { cond?: string })[] };

function room(b: MapBuilder, spec: Spec) {
  return { ...spec, w: b.w, h: b.h, rows: b.rows() };
}

const RIVER = 'By the Great River Hiddekel';
const ELAM = 'The Province of Elam';
const SHUSHAN = 'Shushan the Palace';
const HIGH = 'The High Places';

// ---------------------------------------------------------------- Camp by the great river
function hiddekelCamp() {
  const b = new MapBuilder(64, 22);
  b.rect(0, 18, 64, 4);
  b.rect(0, 0, 2, 18);
  b.clear(40, 18, 24, 2).rect(40, 19, 24, 1, 'w').rect(40, 20, 24, 1);
  b.plat(46, 14, 6).plat(55, 12, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'river_bank', x: 52, y: 18, w: 24 },
    { t: 'decor', k: 'date_palm', x: 9, y: 18 },
    { t: 'decor', k: 'date_palm', x: 37, y: 18, flip: true },
    { t: 'decor', k: 'reeds', x: 41, y: 18 },
    { t: 'decor', k: 'tent', x: 14, y: 18 },
    { t: 'decor', k: 'tent', x: 30, y: 18, flip: true },
    { t: 'decor', k: 'bedroll', x: 18, y: 18 },
    { t: 'decor', k: 'cart', x: 24, y: 18 },
    { t: 'decor', k: 'anvil', x: 33, y: 18 },
    { t: 'decor', k: 'prayer_mat', x: 38.5, y: 18 },
    { t: 'light', k: 'brazier', x: 21.5, y: 18 },
    { t: 'light', k: 'forge', x: 34, y: 18 },
    { t: 'light', k: 'lantern', x: 14, y: 12 },
    { t: 'altar', x: 6, y: 18, id: 'hiddekel_camp' },
    { t: 'npc', k: 'hanan', x: 38.5, y: 18, face: 1 },
    { t: 'npc', k: 'mara', x: 11, y: 18, face: 1 },
    { t: 'npc', k: 'azriel', x: 20, y: 18, face: 1 },
    { t: 'npc', k: 'tobiah', x: 26, y: 18, face: -1 },
    { t: 'npc', k: 'ilan', x: 16, y: 18, face: 1 },
    { t: 'npc', k: 'dov', x: 32, y: 18, face: -1 },
    { t: 'npc', k: 'ezra', x: 28, y: 18, face: -1 },
    { t: 'npc', k: 'talia', x: 23, y: 18, face: 1 },
    { t: 'npc', k: 'barak', x: 35, y: 18, face: -1 },
    { t: 'npc', k: 'arshan', x: 30, y: 18, face: -1, cond: 'ch6_storm_done' },
    { t: 'chest', x: 57, y: 12, id: 'river_skiff', loot: [{ silver: 300 }, { mat: 'radiant_core', n: 2 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 44, y: 18, id: 'dan104' },
  ];
  return room(b, {
    id: 'hiddekel_camp', name: 'Camp by the Great River', region: RIVER, biome: 'hiddekel', music: 'hiddekel',
    dark: 0.25, weather: 'motes', map: { x: 0, y: 5 }, seed: 701, interior: false,
    spawns: { start: { x: 20, y: 18, face: 1 }, altar: { x: 6, y: 18, face: 1 }, right: { x: 61, y: 18, face: -1 } },
    exits: [{ x: 63, y: 9, w: 1, h: 9, to: 'ulai_marsh', spawn: 'left' }],
    ents,
  });
}

// ---------------------------------------------------------------- The marshes of Ulai
function ulaiMarsh() {
  const b = new MapBuilder(110, 26);
  b.rect(0, 21, 110, 5);
  b.clear(18, 21, 12, 2).rect(18, 22, 12, 1, 'w').rect(18, 23, 12, 1);
  b.clear(46, 21, 14, 2).rect(46, 22, 14, 1, 'w').rect(46, 23, 14, 1);
  b.clear(76, 21, 10, 2).rect(76, 22, 10, 1, 'w').rect(76, 23, 10, 1);
  b.plat(20, 17, 6).plat(48, 17, 4).plat(55, 14, 5).plat(78, 17, 6);
  b.rect(96, 18, 14, 3);
  b.plat(66, 11, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'reeds', x: 8, y: 21 },
    { t: 'decor', k: 'reeds', x: 32, y: 21, flip: true },
    { t: 'decor', k: 'reeds', x: 62, y: 21 },
    { t: 'decor', k: 'reeds', x: 90, y: 21, flip: true },
    { t: 'decor', k: 'marsh_heron', x: 40, y: 21 },
    { t: 'decor', k: 'dead_tree', x: 70, y: 21 },
    { t: 'decor', k: 'dead_tree', x: 14, y: 21, flip: true },
    { t: 'decor', k: 'stone_marker', x: 100, y: 18 },
    { t: 'light', k: 'glow', x: 52, y: 12, r: 90, c: '#cfe6ff' },
    { t: 'enemy', k: 'undying', x: 12, y: 21, face: -1 },
    { t: 'enemy', k: 'gale', x: 26, y: 12, face: -1 },
    { t: 'enemy', k: 'undying', x: 40, y: 21, face: -1 },
    { t: 'enemy', k: 'gale', x: 58, y: 9, face: -1 },
    { t: 'enemy', k: 'lion', x: 68, y: 21, face: -1 },
    { t: 'enemy', k: 'undying', x: 92, y: 21, face: -1 },
    { t: 'enemy', k: 'gale', x: 102, y: 12, face: -1 },
    { t: 'chest', x: 68, y: 11, id: 'heron_nest', loot: [{ silver: 220 }, { mat: 'sentinel_steel', n: 3 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 36, y: 21, id: 'dan82' },
    { t: 'hint', x: 6, w: 8, id: 'h_undying', text: 'The Undying rise again unless they are finished. Strike them while they kneel, or {attack} a staggered one to execute it.' },
  ];
  return room(b, {
    id: 'ulai_marsh', name: 'The Marshes of Ulai', region: ELAM, biome: 'hiddekel', music: 'hiddekel',
    dark: 0.3, weather: 'motes', map: { x: 4, y: 4.75 }, seed: 709, interior: false,
    spawns: { left: { x: 3, y: 21, face: 1 }, right: { x: 106, y: 18, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'hiddekel_camp', spawn: 'right' },
      { x: 109, y: 9, w: 1, h: 9, to: 'shushan_road', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The royal road
function shushanRoad() {
  const b = new MapBuilder(120, 26);
  b.rect(0, 21, 120, 5);
  b.plat(14, 17, 8).plat(28, 13, 8);
  b.rect(44, 18, 14, 3);
  b.plat(62, 15, 6).plat(74, 11, 6).plat(88, 15, 8);
  b.plat(100, 8, 6);
  b.rect(106, 18, 14, 3);
  const ents: EntDef[] = [
    { t: 'decor', k: 'royal_milestone', x: 8, y: 21 },
    { t: 'decor', k: 'royal_milestone', x: 66, y: 21 },
    { t: 'decor', k: 'waystation', x: 50, y: 18, w: 14 },
    { t: 'decor', k: 'caravan', x: 34, y: 21, w: 10 },
    { t: 'decor', k: 'date_palm', x: 24, y: 21 },
    { t: 'decor', k: 'date_palm', x: 84, y: 21, flip: true },
    { t: 'decor', k: 'foreign_shrine', x: 94, y: 21 },
    { t: 'light', k: 'brazier', x: 56, y: 18 },
    { t: 'light', k: 'lantern', x: 102, y: 4 },
    { t: 'enemy', k: 'undying', x: 18, y: 21, face: -1 },
    { t: 'enemy', k: 'gale', x: 30, y: 9, face: -1 },
    { t: 'enemy', k: 'undying', x: 48, y: 18, face: -1 },
    { t: 'enemy', k: 'knight', x: 60, y: 21, face: -1 },
    { t: 'enemy', k: 'gale', x: 76, y: 7, face: -1 },
    { t: 'enemy', k: 'undying', x: 90, y: 21, face: -1 },
    { t: 'enemy', k: 'undying', x: 112, y: 18, face: -1 },
    { t: 'chest', x: 102, y: 8, id: 'waystation_cache', secret: true, loot: [{ silver: 320 }, { mat: 'radiant_core', n: 2 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 96, y: 21, id: 'deu3217' },
    { t: 'hint', x: 70, w: 8, id: 'h_gale', text: 'Fallen Gales strike from the storm. Watch for the flash before the bolt, then {dodge} through it.' },
  ];
  return room(b, {
    id: 'shushan_road', name: 'The Royal Road', region: ELAM, biome: 'shushan', music: 'shushan',
    dark: 0.2, weather: 'dust', map: { x: 10.9, y: 4.75 }, seed: 719, interior: false,
    spawns: { left: { x: 3, y: 21, face: 1 }, right: { x: 116, y: 18, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'ulai_marsh', spawn: 'right' },
      { x: 119, y: 9, w: 1, h: 9, to: 'shushan_gate', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The gate of Shushan
function shushanGate() {
  const b = new MapBuilder(100, 28);
  b.rect(0, 23, 100, 5);
  b.rect(30, 19, 6, 4);
  b.plat(40, 15, 8).plat(56, 11, 8);
  b.rect(70, 19, 30, 4);
  b.plat(78, 14, 8).plat(90, 10, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'shushan_wall', x: 60, y: 23, w: 60, h: 16 },
    { t: 'decor', k: 'winged_bull', x: 52, y: 23, flip: true },
    { t: 'decor', k: 'winged_bull', x: 68, y: 23 },
    { t: 'decor', k: 'persian_banner', x: 48, y: 6, h: 5 },
    { t: 'decor', k: 'persian_banner', x: 72, y: 6, h: 5 },
    { t: 'decor', k: 'date_palm', x: 10, y: 23 },
    { t: 'decor', k: 'palm_planter', x: 26, y: 23 },
    { t: 'light', k: 'brazier', x: 46, y: 23 },
    { t: 'light', k: 'brazier', x: 74, y: 19 },
    { t: 'npc', k: 'arshan', x: 22, y: 23, face: 1, ncond: 'ch6_storm_done' },
    { t: 'enemy', k: 'gale', x: 44, y: 10, face: -1 },
    { t: 'enemy', k: 'undying', x: 62, y: 23, face: -1 },
    { t: 'enemy', k: 'undying', x: 66, y: 23, face: -1 },
    { t: 'enemy', k: 'gale', x: 60, y: 6, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 84, y: 19, face: -1 },
    { t: 'enemy', k: 'undying', x: 94, y: 19, face: -1 },
    { t: 'chest', x: 92, y: 10, id: 'gate_tower', loot: [{ silver: 260 }, { mat: 'sentinel_steel', n: 3 }, { rarity: 4 }] },
    { t: 'lore', x: 34, y: 19, id: 'ps827' },
  ];
  return room(b, {
    id: 'shushan_gate', name: 'The Gate of Shushan', region: SHUSHAN, biome: 'shushan', music: 'shushan',
    dark: 0.22, weather: 'dust', map: { x: 18.4, y: 4.6 }, seed: 727, interior: false,
    spawns: { left: { x: 3, y: 23, face: 1 }, right: { x: 96, y: 19, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 9, to: 'shushan_road', spawn: 'right' },
      { x: 99, y: 10, w: 1, h: 9, to: 'apadana', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The hall of a hundred columns
function apadana() {
  const b = new MapBuilder(100, 30);
  b.rect(0, 0, 100, 2);
  b.rect(0, 26, 100, 4);
  b.rect(0, 2, 2, 15).rect(98, 2, 2, 15);
  b.plat(10, 21, 8).plat(24, 17, 8).plat(40, 13, 8).plat(56, 17, 8).plat(72, 21, 8).plat(84, 14, 6);
  b.plat(88, 8, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'bull_column', x: 8, y: 26, h: 24 },
    { t: 'decor', k: 'bull_column', x: 22, y: 26, h: 24 },
    { t: 'decor', k: 'bull_column', x: 36, y: 26, h: 24 },
    { t: 'decor', k: 'bull_column', x: 50, y: 26, h: 24 },
    { t: 'decor', k: 'bull_column', x: 64, y: 26, h: 24 },
    { t: 'decor', k: 'bull_column', x: 78, y: 26, h: 24 },
    { t: 'decor', k: 'bull_column', x: 92, y: 26, h: 24 },
    { t: 'decor', k: 'tribute_relief', x: 50, y: 24, w: 80, h: 6 },
    { t: 'decor', k: 'persian_banner', x: 30, y: 2, h: 7 },
    { t: 'decor', k: 'persian_banner', x: 70, y: 2, h: 7 },
    { t: 'light', k: 'brazier', x: 15, y: 26 },
    { t: 'light', k: 'brazier', x: 85, y: 26 },
    { t: 'light', k: 'glow', x: 50, y: 10, r: 150, c: '#ffd88a' },
    { t: 'enemy', k: 'undying', x: 20, y: 26, face: -1 },
    { t: 'enemy', k: 'gale', x: 30, y: 9, face: -1 },
    { t: 'enemy', k: 'undying', x: 46, y: 26, face: -1, elite: 'undying_captain' },
    { t: 'enemy', k: 'undying', x: 54, y: 26, face: -1 },
    { t: 'enemy', k: 'gale', x: 60, y: 8, face: -1 },
    { t: 'enemy', k: 'knight', x: 74, y: 26, face: -1 },
    { t: 'enemy', k: 'undying', x: 88, y: 26, face: -1 },
    { t: 'chest', x: 90, y: 8, id: 'apadana_cache', secret: true, loot: [{ silver: 340 }, { mat: 'radiant_core', n: 2 }, { rarity: 4 }] },
    { t: 'lore', x: 6, y: 26, id: 'isa1412' },
  ];
  return room(b, {
    id: 'apadana', name: 'The Hall of a Hundred Columns', region: SHUSHAN, biome: 'shushan', music: 'shushan',
    dark: 0.4, weather: 'motes', map: { x: 24.65, y: 4.4 }, seed: 733, interior: true,
    spawns: { left: { x: 3, y: 26, face: 1 }, right: { x: 96, y: 26, face: -1 } },
    exits: [
      { x: 0, y: 17, w: 1, h: 9, to: 'shushan_gate', spawn: 'right' },
      { x: 99, y: 17, w: 1, h: 9, to: 'storm_ziggurat', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The high place of the winds (the Prince of the Storm)
function stormZiggurat() {
  const b = new MapBuilder(72, 32);
  b.rect(0, 28, 72, 4);
  b.rect(0, 0, 2, 19).rect(70, 0, 2, 19);
  b.rect(3, 19, 1, 9, 'G');
  b.plat(14, 23, 7).plat(30, 19, 6).plat(46, 23, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'ziggurat_summit', x: 36, y: 28, w: 70, h: 10 },
    { t: 'decor', k: 'storm_altar', x: 52, y: 28, w: 10 },
    { t: 'decor', k: 'persian_banner', x: 12, y: 8, h: 6 },
    { t: 'decor', k: 'persian_banner', x: 62, y: 8, h: 6 },
    { t: 'light', k: 'brazier', x: 8, y: 28 },
    { t: 'light', k: 'brazier', x: 64, y: 28 },
    { t: 'light', k: 'glow', x: 52, y: 12, r: 150, c: '#bcd4ff' },
    { t: 'boss', k: 'storm_prince', x: 52, y: 28 },
    { t: 'trigger', x: 20, y: 19, w: 2, h: 9, id: 'storm_start' },
    { t: 'lore', x: 7, y: 28, id: 'eph22' },
  ];
  return room(b, {
    id: 'storm_ziggurat', name: 'The High Place of the Winds', region: SHUSHAN, biome: 'shushan', music: '',
    dark: 0.45, weather: 'rain', map: { x: 30.9, y: 3.6 }, seed: 739, interior: false,
    spawns: { left: { x: 5, y: 28, face: 1 }, right: { x: 67, y: 28, face: -1 } },
    exits: [
      { x: 0, y: 19, w: 1, h: 9, to: 'apadana', spawn: 'right' },
      { x: 71, y: 19, w: 1, h: 9, to: 'high_places', spawn: 'left', cond: 'ch6_storm_done' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The high places (above the world)
function highPlaces() {
  const b = new MapBuilder(96, 40);
  b.rect(0, 30, 10, 10);
  b.rect(86, 22, 10, 18);
  b.rect(10, 38, 76, 2, '^');
  b.plat(13, 27, 6).plat(22, 23, 6).plat(31, 27, 5).plat(39, 22, 6).plat(47, 18, 7);
  b.rect(46, 26, 10, 2);
  b.plat(58, 22, 6).plat(66, 26, 5).plat(72, 21, 6).plat(80, 24, 5);
  b.plat(55, 12, 6).plat(64, 8, 5);
  const ents: EntDef[] = [
    { t: 'decor', k: 'heaven_rift', x: 48, y: 30, w: 96, h: 30 },
    { t: 'decor', k: 'broken_chain', x: 20, y: 12, h: 10 },
    { t: 'decor', k: 'broken_chain', x: 76, y: 8, h: 12 },
    { t: 'decor', k: 'cloud_bank', x: 30, y: 38, w: 40 },
    { t: 'decor', k: 'cloud_bank', x: 70, y: 38, w: 36 },
    { t: 'light', k: 'glow', x: 48, y: 14, r: 160, c: '#fff1c4' },
    { t: 'light', k: 'glow', x: 90, y: 16, r: 90, c: '#ffcf6b' },
    { t: 'enemy', k: 'gale', x: 24, y: 16, face: -1 },
    { t: 'enemy', k: 'undying', x: 48, y: 26, face: -1 },
    { t: 'enemy', k: 'gale', x: 52, y: 10, face: -1 },
    { t: 'enemy', k: 'undying', x: 74, y: 21, face: -1 },
    { t: 'enemy', k: 'gale', x: 80, y: 14, face: -1 },
    { t: 'enemy', k: 'undying', x: 90, y: 22, face: -1 },
    { t: 'altar', x: 50, y: 26, id: 'high_places' },
    { t: 'chest', x: 66, y: 8, id: 'chain_cache', secret: true, loot: [{ silver: 360 }, { mat: 'radiant_core', n: 3 }, { rarity: 4 }] },
    { t: 'lore', x: 5, y: 30, id: 'jude16' },
    { t: 'hint', x: 4, w: 6, id: 'h_abyss', text: 'Nothing holds you up here but what is under your feet. Falling costs health.' },
  ];
  return room(b, {
    id: 'high_places', name: 'The High Places', region: HIGH, biome: 'highplaces', music: 'highplaces',
    dark: 0.3, weather: 'motes', map: { x: 35.4, y: 1.4 }, seed: 743, interior: false,
    spawns: { left: { x: 4, y: 30, face: 1 }, right: { x: 92, y: 22, face: -1 }, altar: { x: 50, y: 26, face: 1 } },
    exits: [
      { x: 0, y: 21, w: 1, h: 9, to: 'storm_ziggurat', spawn: 'right' },
      { x: 95, y: 13, w: 1, h: 9, to: 'prince_throne', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The throne of the Prince of Persia (the boss)
function princeThrone() {
  const b = new MapBuilder(80, 32);
  b.rect(0, 28, 80, 4);
  b.rect(0, 0, 2, 19).rect(78, 0, 2, 28);
  b.rect(3, 19, 1, 9, 'G');
  b.plat(14, 23, 7).plat(30, 19, 6).plat(48, 15, 6).plat(62, 21, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'heaven_rift', x: 40, y: 28, w: 80, h: 28 },
    { t: 'decor', k: 'prince_throne', x: 60, y: 28, w: 16, h: 14 },
    { t: 'decor', k: 'winged_disc', x: 60, y: 6, w: 22 },
    { t: 'decor', k: 'cloud_bank', x: 40, y: 32, w: 80 },
    { t: 'light', k: 'glow', x: 60, y: 14, r: 170, c: '#ffcf6b' },
    { t: 'light', k: 'brazier', x: 10, y: 28 },
    { t: 'boss', k: 'persia_prince', x: 58, y: 28 },
    { t: 'trigger', x: 22, y: 19, w: 2, h: 9, id: 'persia_start' },
    { t: 'lore', x: 7, y: 28, id: 'ezek2817' },
  ];
  return room(b, {
    id: 'prince_throne', name: 'The Throne of the Prince', region: HIGH, biome: 'highplaces', music: '',
    dark: 0.35, weather: 'motes', map: { x: 41.4, y: 1.2 }, seed: 751, interior: false,
    spawns: { left: { x: 5, y: 28, face: 1 }, center: { x: 26, y: 28, face: 1 } },
    exits: [{ x: 0, y: 19, w: 1, h: 9, to: 'high_places', spawn: 'right' }],
    ents,
  });
}

export const ROOMS6 = [hiddekelCamp(), ulaiMarsh(), shushanRoad(), shushanGate(), apadana(), stormZiggurat(), highPlaces(), princeThrone()];
export const CH6_ROOM_IDS = new Set(ROOMS6.map((r) => r.id));
