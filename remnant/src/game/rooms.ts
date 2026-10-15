// Chapter I — The Ashen Village. Twelve connected rooms built from rectangles.
// Coordinates are tiles; an entity's y is the row its feet stand on.

import { MapBuilder, type RoomDef, type Exit, type EntDef } from './tiles';
import { ROOMS2, CH2_ROOM_IDS } from './rooms2';
import { ROOMS3, CH3_ROOM_IDS } from './rooms3';

export interface RoomSpec extends Omit<RoomDef, 'rows' | 'w' | 'h' | 'exits'> {
  exits: (Exit & { cond?: string })[];
}

function room(b: MapBuilder, spec: RoomSpec): RoomDef & { exits: (Exit & { cond?: string })[] } {
  return { ...spec, w: b.w, h: b.h, rows: b.rows() };
}

// ---------------------------------------------------------------- Hearthward
function sanctuary() {
  const b = new MapBuilder(56, 20);
  b.rect(0, 0, 56, 2);
  b.rect(0, 2, 4, 1).rect(0, 3, 2, 2).rect(0, 5, 1, 12);
  b.rect(44, 2, 12, 1).rect(48, 3, 8, 1).rect(51, 4, 5, 1);
  b.rect(0, 17, 56, 3);
  b.rect(10, 16, 7, 1);
  b.plat(2, 13, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'cave_back', x: 0, y: 17, w: 56 },
    { t: 'decor', k: 'tent', x: 19, y: 17 },
    { t: 'decor', k: 'tent', x: 33, y: 17, flip: true },
    { t: 'decor', k: 'banner', x: 8, y: 2, h: 5 },
    { t: 'decor', k: 'banner', x: 27, y: 2, h: 6 },
    { t: 'decor', k: 'banner', x: 41, y: 2, h: 5 },
    { t: 'decor', k: 'desk', x: 6, y: 17 },
    { t: 'decor', k: 'shelf', x: 3, y: 13 },
    { t: 'decor', k: 'crates', x: 39, y: 17 },
    { t: 'decor', k: 'barrel', x: 42, y: 17 },
    { t: 'decor', k: 'anvil', x: 47, y: 17 },
    { t: 'decor', k: 'palisade', x: 53, y: 17 },
    { t: 'decor', k: 'bedroll', x: 23, y: 17 },
    { t: 'decor', k: 'bedroll', x: 31, y: 17, flip: true },
    { t: 'light', k: 'lantern', x: 15, y: 6 },
    { t: 'light', k: 'lantern', x: 27.5, y: 8 },
    { t: 'light', k: 'lantern', x: 38, y: 6 },
    { t: 'light', k: 'forge', x: 49, y: 17 },
    { t: 'light', k: 'brazier', x: 26, y: 17 },
    { t: 'light', k: 'torch', x: 2, y: 9 },
    { t: 'light', k: 'candles', x: 7, y: 17 },
    { t: 'altar', x: 13, y: 16, id: 'sanctuary' },
    { t: 'npc', k: 'mara', x: 5, y: 17, face: 1 },
    { t: 'npc', k: 'azriel', x: 22, y: 17, face: 1, ncond: 'ch1_done' },
    { t: 'npc', k: 'azriel', x: 22, y: 17, face: 1, cond: 'ch1_done' },
    { t: 'npc', k: 'tobiah', x: 29, y: 17, face: -1, ncond: 'expedition' },
    { t: 'npc', k: 'tobiah', x: 29, y: 17, face: -1, cond: 'ch1_done' },
    { t: 'npc', k: 'ilan', x: 37, y: 17, face: -1 },
    { t: 'npc', k: 'dov', x: 45, y: 17, face: 1 },
    { t: 'chest', x: 4, y: 13, id: 'sanct_loft', loot: [{ silver: 30 }, { item: 'copper_ring' }] },
    { t: 'lore', x: 51, y: 17, id: 'rom1221' },
    { t: 'lore', x: 34, y: 17, id: 'rev1211' },
  ];
  return room(b, {
    id: 'sanctuary', name: 'Hearthward Sanctuary', region: 'The Ashen Village', biome: 'sanctuary', music: 'sanctuary',
    dark: 0.42, weather: 'embers', map: { x: 0, y: 2.75 }, seed: 11, interior: true,
    spawns: { start: { x: 20, y: 17, face: 1 }, altar: { x: 13, y: 16, face: 1 }, right: { x: 52, y: 17, face: -1 } },
    exits: [{ x: 55, y: 5, w: 1, h: 12, to: 'ashen_road', spawn: 'left' }],
    ents,
  });
}

// ---------------------------------------------------------------- Ashen Road
function ashenRoad() {
  const b = new MapBuilder(104, 24);
  b.rect(0, 19, 104, 5);
  b.rect(20, 17, 6, 2);
  b.rect(31, 17, 3, 2);
  b.plat(34, 15, 10);
  b.clear(55, 19, 4, 3).rect(55, 21, 4, 1, '^');
  b.rect(64, 18, 2, 1).rect(66, 17, 16, 2);
  b.plat(86, 15, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'house', x: 11, y: 19, w: 9, v: 0 },
    { t: 'decor', k: 'house', x: 39, y: 19, w: 10, v: 1 },
    { t: 'decor', k: 'house', x: 89, y: 19, w: 8, v: 2 },
    { t: 'decor', k: 'tree', x: 6, y: 19, v: 0 },
    { t: 'decor', k: 'tree', x: 61, y: 19, v: 1 },
    { t: 'decor', k: 'tree', x: 100, y: 19, v: 2 },
    { t: 'decor', k: 'fence', x: 26, y: 19, w: 4 },
    { t: 'decor', k: 'cart', x: 72, y: 17 },
    { t: 'decor', k: 'grave', x: 78, y: 17 },
    { t: 'decor', k: 'grave', x: 80, y: 17 },
    { t: 'decor', k: 'lamppost', x: 49, y: 19 },
    { t: 'decor', k: 'statue_broken', x: 97, y: 19 },
    { t: 'decor', k: 'rubble', x: 52, y: 19 },
    { t: 'decor', k: 'grass', x: 2, y: 19, w: 18, fg: true },
    { t: 'decor', k: 'grass', x: 60, y: 19, w: 6, fg: true },
    { t: 'light', k: 'glow', x: 12, y: 14, r: 60, c: '#ff7a33' },
    { t: 'light', k: 'glow', x: 90, y: 14, r: 50, c: '#ff7a33' },
    { t: 'light', k: 'glow', x: 41, y: 12, r: 40, c: '#ff8a3d' },
    { t: 'enemy', k: 'husk', x: 29, y: 19, face: -1 },
    { t: 'enemy', k: 'husk', x: 47, y: 19, face: -1 },
    { t: 'enemy', k: 'husk', x: 51, y: 19, face: -1 },
    { t: 'enemy', k: 'hound', x: 76, y: 17, face: -1 },
    { t: 'enemy', k: 'husk', x: 95, y: 19, face: -1 },
    { t: 'chest', x: 41, y: 15, id: 'road_roof', loot: [{ silver: 20 }, { mat: 'iron_scrap', n: 2 }, { item: 'bronze_gauntlets' }] },
    { t: 'hint', x: 3, w: 12, id: 'h_move', text: 'Move with {move}. Jump with {jump}.' },
    { t: 'hint', x: 24, w: 8, id: 'h_attack', text: 'Strike with {attack}. Hold it to charge a heavy blow.' },
    { t: 'hint', x: 52, w: 6, id: 'h_dodge', text: '{dodge} to dodge — you cannot be hurt mid-roll.' },
    { t: 'hint', x: 66, w: 6, id: 'h_parry', text: 'Tap {parry} the instant a blow lands to parry it. Then {attack} to counter.' },
    { t: 'hint', x: 84, w: 6, id: 'h_heal', text: 'Low on health? {heal} drinks Balm. Altars refill it.' },
  ];
  return room(b, {
    id: 'ashen_road', name: 'The Ashen Road', region: 'The Ashen Village', biome: 'village', music: 'village',
    dark: 0.3, weather: 'ash', map: { x: 3.5, y: 2.5 }, seed: 23, interior: false,
    spawns: { left: { x: 2, y: 19, face: 1 }, right: { x: 101, y: 19, face: -1 } },
    exits: [
      { x: 0, y: 10, w: 1, h: 9, to: 'sanctuary', spawn: 'right' },
      { x: 103, y: 10, w: 1, h: 9, to: 'village_square', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Village Square
function villageSquare() {
  const b = new MapBuilder(96, 34);
  b.rect(0, 29, 96, 5);
  b.rect(16, 27, 2, 2);
  b.plat(4, 26, 8).plat(10, 23, 6).plat(3, 20, 7);
  b.clear(45, 29, 2, 5).plat(45, 29, 2);
  b.rect(50, 27, 2, 2);
  b.plat(52, 24, 12).plat(66, 21, 9).plat(76, 25, 5);
  b.rect(82, 28, 2, 1).rect(84, 27, 12, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'house', x: 8, y: 29, w: 13, v: 3 },
    { t: 'decor', k: 'stall', x: 26, y: 29 },
    { t: 'decor', k: 'stall', x: 35, y: 29, flip: true },
    { t: 'decor', k: 'well', x: 46, y: 29 },
    { t: 'decor', k: 'house', x: 58, y: 29, w: 12, v: 1 },
    { t: 'decor', k: 'house', x: 71, y: 29, w: 10, v: 0 },
    { t: 'decor', k: 'tree', x: 41, y: 29, v: 2 },
    { t: 'decor', k: 'statue_broken', x: 30, y: 29 },
    { t: 'decor', k: 'cart', x: 88, y: 27, flip: true },
    { t: 'decor', k: 'lamppost', x: 20, y: 29 },
    { t: 'decor', k: 'lamppost', x: 80, y: 29 },
    { t: 'decor', k: 'grass', x: 0, y: 29, w: 12, fg: true },
    { t: 'decor', k: 'grass', x: 36, y: 29, w: 8, fg: true },
    { t: 'light', k: 'glow', x: 62, y: 20, r: 70, c: '#ff7a33' },
    { t: 'light', k: 'brazier', x: 22, y: 29 },
    { t: 'light', k: 'glow', x: 8, y: 22, r: 40, c: '#ff8a3d' },
    { t: 'enemy', k: 'husk', x: 24, y: 29, face: -1 },
    { t: 'enemy', k: 'husk', x: 33, y: 29, face: -1 },
    { t: 'enemy', k: 'hound', x: 58, y: 29, face: -1 },
    { t: 'enemy', k: 'wisp', x: 40, y: 21 },
    { t: 'enemy', k: 'archer', x: 70, y: 21, face: -1 },
    { t: 'enemy', k: 'husk', x: 78, y: 29, face: -1 },
    { t: 'enemy', k: 'husk', x: 90, y: 27, face: -1 },
    { t: 'chest', x: 6, y: 20, id: 'square_tower', loot: [{ item: 'iron_cap' }, { silver: 15 }] },
    { t: 'pickup', x: 60, y: 24, id: 'square_roof_shard', loot: [{ mat: 'veil_shard', n: 2 }] },
    { t: 'hint', x: 43, w: 6, id: 'h_well', text: 'A cold draft rises from the well. Hold {down} and press {jump} to drop through.' },
  ];
  return room(b, {
    id: 'village_square', name: 'The Market of Hearthward', region: 'The Ashen Village', biome: 'village', music: 'village',
    dark: 0.3, weather: 'ash', map: { x: 10, y: 1.875 }, seed: 37, interior: false,
    spawns: { left: { x: 2, y: 29, face: 1 }, right: { x: 93, y: 27, face: -1 }, well: { x: 43, y: 29, face: -1 } },
    exits: [
      { x: 0, y: 18, w: 1, h: 11, to: 'ashen_road', spawn: 'right' },
      { x: 95, y: 14, w: 1, h: 13, to: 'temple_steps', spawn: 'left' },
      { x: 45, y: 33, w: 2, h: 1, to: 'cistern', spawn: 'top' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Cistern
function cistern() {
  const b = new MapBuilder(52, 22);
  b.rect(0, 0, 52, 2).clear(44, 0, 4, 2).clear(2, 0, 6, 2);
  b.rect(0, 0, 2, 22).rect(50, 0, 2, 22);
  b.rect(42, 2, 2, 8).rect(48, 2, 2, 8);
  b.rect(0, 19, 52, 3);
  b.rect(2, 14, 10, 5);
  b.plat(13, 16, 4);
  b.plat(2, 11, 5).plat(7, 8, 4).plat(2, 5, 5);
  b.rect(14, 18, 22, 1, 'w');
  const ents: EntDef[] = [
    { t: 'decor', k: 'arch', x: 20, y: 19 },
    { t: 'decor', k: 'arch', x: 32, y: 19 },
    { t: 'decor', k: 'pillar', x: 26, y: 19 },
    { t: 'decor', k: 'pillar', x: 38, y: 19 },
    { t: 'decor', k: 'chains', x: 30, y: 2, h: 5 },
    { t: 'light', k: 'glow', x: 25, y: 17, r: 80, c: '#4a7fbf' },
    { t: 'light', k: 'glow', x: 45.5, y: 4, r: 50, c: '#9fb4d8' },
    { t: 'light', k: 'candles', x: 8, y: 14 },
    { t: 'enemy', k: 'husk', x: 22, y: 19, face: 1 },
    { t: 'enemy', k: 'husk', x: 33, y: 19, face: -1 },
    { t: 'enemy', k: 'wisp', x: 27, y: 10 },
    { t: 'chest', x: 4, y: 14, id: 'cistern_chest', secret: true, loot: [{ item: 'ember_lamp' }, { mat: 'veil_shard', n: 2 }, { silver: 25 }] },
    { t: 'lore', x: 9.5, y: 14, id: 'eph610' },
  ];
  return room(b, {
    id: 'cistern', name: 'The Drowned Cistern', region: 'The Ashen Village', biome: 'crypt', music: 'crypt',
    dark: 0.7, weather: 'drips', map: { x: 9.8, y: 4 }, seed: 41, interior: true,
    spawns: { top: { x: 46, y: 2, face: -1 }, stairs: { x: 4, y: 5, face: 1 } },
    exits: [{ x: 2, y: 0, w: 6, h: 1, to: 'village_square', spawn: 'well' }],
    ents,
  });
}

// ---------------------------------------------------------------- Temple Steps
function templeSteps() {
  const b = new MapBuilder(72, 28);
  b.rect(0, 24, 72, 4);
  b.stairs(18, 23, 7, 3, 1);
  b.rect(39, 17, 33, 11);
  b.rect(47, 17, 4, 3, 'X');
  b.clear(47, 20, 4, 8);
  const ents: EntDef[] = [
    { t: 'decor', k: 'temple_facade', x: 39, y: 17, w: 33 },
    { t: 'decor', k: 'statue', x: 16, y: 24 },
    { t: 'decor', k: 'statue', x: 41, y: 17, flip: true },
    { t: 'decor', k: 'temple_door', x: 64, y: 17, ncond: 'shortcut' },
    { t: 'decor', k: 'temple_door_open', x: 64, y: 17, cond: 'shortcut' },
    { t: 'decor', k: 'rubble', x: 64, y: 17, ncond: 'shortcut' },
    { t: 'decor', k: 'tree', x: 5, y: 24, v: 1 },
    { t: 'decor', k: 'grass', x: 0, y: 24, w: 14, fg: true },
    { t: 'light', k: 'brazier', x: 44, y: 17 },
    { t: 'light', k: 'brazier', x: 70, y: 17 },
    { t: 'enemy', k: 'husk', x: 8, y: 24, face: 1 },
    { t: 'enemy', k: 'husk', x: 13, y: 24, face: -1 },
    { t: 'npc', k: 'azriel', x: 57, y: 17, face: -1, ncond: 'collapsed' },
    { t: 'npc', k: 'tobiah', x: 60, y: 17, face: -1, ncond: 'collapsed' },
    { t: 'trigger', x: 42, y: 10, w: 2, h: 8, id: 'steps_cutscene' },
  ];
  return room(b, {
    id: 'temple_steps', name: 'Steps of the First Lamp', region: 'The Ashen Village', biome: 'village', music: 'village',
    dark: 0.32, weather: 'ash', map: { x: 16, y: 2.25 }, seed: 53, interior: false,
    spawns: { left: { x: 2, y: 24, face: 1 }, door: { x: 61, y: 17, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 10, to: 'village_square', spawn: 'right' },
      { x: 47, y: 27, w: 4, h: 1, to: 'temple_hall', spawn: 'fall' },
      { x: 63, y: 11, w: 3, h: 6, to: 'temple_hall', spawn: 'shortcut', cond: 'shortcut' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Temple Hall
function templeHall() {
  const b = new MapBuilder(84, 44);
  b.rect(0, 0, 84, 2).clear(48, 0, 6, 2);
  b.rect(0, 0, 2, 44).rect(82, 0, 2, 44);
  b.rect(0, 41, 84, 3);
  b.clear(0, 36, 2, 5).clear(82, 34, 2, 7).clear(82, 2, 2, 6);
  b.clear(0, 18, 2, 6).rect(2, 18, 2, 6, 'S');
  b.rect(38, 14, 24, 2);
  b.rect(70, 8, 12, 2);
  b.plat(64, 13, 3);
  b.rect(2, 2, 18, 4);
  b.rect(2, 10, 23, 3);
  b.rect(18, 6, 2, 4, 'C');
  b.clear(0, 6, 2, 4);
  b.plat(25, 13, 6).plat(31, 16, 6);
  // right climb main floor → nave
  b.plat(66, 38, 5).plat(72, 35, 5).plat(66, 32, 5).plat(72, 29, 5).plat(66, 26, 5).plat(72, 23, 5).plat(66, 20, 5).plat(61, 17, 5);
  // left climb main floor → seal landing
  b.plat(10, 38, 6).plat(4, 35, 6).plat(10, 32, 6).plat(4, 29, 6).plat(10, 27, 5);
  b.rect(4, 24, 12, 1);
  const ents: EntDef[] = [
    { t: 'decor', k: 'nave_back', x: 0, y: 41, w: 84 },
    { t: 'decor', k: 'pillar', x: 30, y: 41, h: 39 },
    { t: 'decor', k: 'pillar', x: 58, y: 41, h: 39 },
    { t: 'decor', k: 'arch', x: 44, y: 41 },
    { t: 'decor', k: 'pews', x: 36, y: 41, w: 6 },
    { t: 'decor', k: 'pews', x: 50, y: 41, w: 6 },
    { t: 'decor', k: 'rubble', x: 20, y: 41 },
    { t: 'decor', k: 'rubble', x: 51, y: 14 },
    { t: 'decor', k: 'statue_broken', x: 76, y: 8 },
    { t: 'decor', k: 'banner', x: 40, y: 16, h: 6 },
    { t: 'decor', k: 'banner', x: 56, y: 16, h: 6 },
    { t: 'decor', k: 'chains', x: 20, y: 13, h: 6 },
    { t: 'decor', k: 'bell_fallen', x: 70, y: 41 },
    { t: 'light', k: 'window', x: 51, y: 6, r: 90 },
    { t: 'light', k: 'window', x: 14, y: 30, r: 70 },
    { t: 'light', k: 'torch', x: 38, y: 36 },
    { t: 'light', k: 'torch', x: 62, y: 36 },
    { t: 'light', k: 'candles', x: 9, y: 24 },
    { t: 'light', k: 'glow', x: 3, y: 21, r: 50, c: '#ffcf6b', cond: '!seal_broken' },
    { t: 'light', k: 'glow', x: 19, y: 8, r: 30, c: '#ffd27a', cond: '!shortcut' },
    { t: 'altar', x: 46, y: 41, id: 'temple_hall' },
    { t: 'enemy', k: 'husk', x: 24, y: 41, face: 1 },
    { t: 'enemy', k: 'husk', x: 60, y: 41, face: -1 },
    { t: 'enemy', k: 'hound', x: 34, y: 41, face: -1 },
    { t: 'enemy', k: 'wisp', x: 52, y: 30 },
    { t: 'enemy', k: 'archer', x: 74, y: 23, face: -1 },
    { t: 'enemy', k: 'husk', x: 44, y: 14, face: 1, cond: 'has_echo' },
    { t: 'enemy', k: 'wisp', x: 12, y: 18, cond: 'has_echo' },
    { t: 'pickup', x: 78, y: 8, id: 'hall_ledge', loot: [{ mat: 'covenant_fragment', n: 1 }, { silver: 30 }] },
    { t: 'hint', x: 61, w: 6, id: 'h_ledge', text: 'That ledge is beyond a single leap.', cond: '!plume' },
  ];
  return room(b, {
    id: 'temple_hall', name: 'Nave of the First Lamp', region: 'The Ruined Temple', biome: 'temple', music: 'temple',
    dark: 0.62, weather: 'dust', map: { x: 20.5, y: 3.4 }, seed: 61, interior: true,
    spawns: {
      fall: { x: 51, y: 3, face: -1 }, left_low: { x: 3, y: 41, face: 1 }, right_low: { x: 80, y: 41, face: -1 },
      top_right: { x: 79, y: 8, face: -1 }, seal: { x: 5, y: 24, face: 1 }, shortcut: { x: 4, y: 10, face: 1 },
      altar: { x: 46, y: 41, face: 1 },
    },
    exits: [
      { x: 0, y: 36, w: 1, h: 5, to: 'crypt', spawn: 'right' },
      { x: 83, y: 34, w: 1, h: 7, to: 'covenant_chamber', spawn: 'left' },
      { x: 83, y: 2, w: 1, h: 6, to: 'upper_gallery', spawn: 'left' },
      { x: 0, y: 18, w: 1, h: 6, to: 'idol_antechamber', spawn: 'right' },
      { x: 0, y: 6, w: 1, h: 4, to: 'temple_steps', spawn: 'door' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Covenant Chamber
function chamber() {
  const b = new MapBuilder(48, 24);
  b.rect(0, 0, 48, 3);
  b.rect(0, 0, 2, 24).rect(46, 0, 2, 24);
  b.rect(0, 21, 48, 3);
  b.clear(0, 15, 2, 6);
  b.rect(2, 15, 2, 6, 'G');
  b.rect(30, 20, 9, 1);
  const ents: EntDef[] = [
    { t: 'decor', k: 'rotunda', x: 24, y: 21, w: 44 },
    { t: 'decor', k: 'inscription', x: 34.5, y: 9 },
    { t: 'decor', k: 'pedestal', x: 34.5, y: 20 },
    { t: 'decor', k: 'pillar', x: 14, y: 21, h: 18 },
    { t: 'decor', k: 'pillar', x: 42, y: 21, h: 18 },
    { t: 'light', k: 'candles', x: 28, y: 21 },
    { t: 'light', k: 'candles', x: 41, y: 21 },
    { t: 'light', k: 'torch', x: 8, y: 14 },
    { t: 'light', k: 'glow', x: 34.5, y: 12, r: 90, c: '#ffd27a', cond: 'relic_taken' },
    { t: 'altar', x: 12, y: 21, id: 'chamber', cond: 'chamber_done' },
    { t: 'trigger', x: 24, y: 12, w: 2, h: 9, id: 'relic' },
  ];
  return room(b, {
    id: 'covenant_chamber', name: 'The Covenant Chamber', region: 'The Ruined Temple', biome: 'temple', music: 'temple',
    dark: 0.66, weather: 'motes', map: { x: 25.75, y: 4.9 }, seed: 71, interior: true,
    spawns: { left: { x: 5, y: 21, face: 1 }, altar: { x: 12, y: 21, face: 1 } },
    exits: [{ x: 0, y: 15, w: 1, h: 6, to: 'temple_hall', spawn: 'right_low' }],
    ents,
  });
}

// ---------------------------------------------------------------- Crypt
function crypt() {
  const b = new MapBuilder(128, 26);
  b.rect(0, 0, 128, 2);
  b.rect(0, 0, 2, 26);
  b.rect(0, 22, 128, 4);
  b.rect(126, 0, 2, 16);
  b.rect(100, 2, 26, 6);
  b.clear(92, 22, 12, 3).rect(92, 24, 12, 1, '^');
  b.plat(94, 20, 3).plat(99, 19, 3);
  b.rect(84, 21, 4, 1).rect(76, 20, 8, 2);
  b.clear(43, 22, 8, 1).rect(43, 22, 8, 1, '~');
  b.plat(47, 19, 3).plat(42, 20, 3);
  b.rect(6, 21, 8, 1);
  b.plat(16, 16, 5);
  b.rect(54, 2, 14, 4);
  const ents: EntDef[] = [
    { t: 'decor', k: 'catacomb_back', x: 0, y: 22, w: 128 },
    { t: 'decor', k: 'coffin', x: 110, y: 22 },
    { t: 'decor', k: 'coffin', x: 70, y: 22, flip: true },
    { t: 'decor', k: 'roots', x: 60, y: 6, h: 8 },
    { t: 'decor', k: 'roots', x: 30, y: 2, h: 7 },
    { t: 'decor', k: 'chains', x: 88, y: 2, h: 8 },
    { t: 'decor', k: 'rubble', x: 65, y: 22 },
    { t: 'decor', k: 'pillar', x: 36, y: 22, h: 20 },
    { t: 'decor', k: 'pillar', x: 24, y: 22, h: 20 },
    { t: 'decor', k: 'shrine_alcove', x: 10, y: 21 },
    { t: 'light', k: 'candles', x: 116, y: 22 },
    { t: 'light', k: 'candles', x: 73, y: 20 },
    { t: 'light', k: 'torch', x: 104, y: 14 },
    { t: 'light', k: 'torch', x: 58, y: 14 },
    { t: 'light', k: 'glow', x: 47, y: 21, r: 70, c: '#a24bd6' },
    { t: 'light', k: 'glow', x: 10, y: 15, r: 80, c: '#fff1c0', cond: '!plume' },
    { t: 'enemy', k: 'wisp', x: 98, y: 13 },
    { t: 'enemy', k: 'husk', x: 110, y: 22, face: -1 },
    { t: 'enemy', k: 'wisp', x: 86, y: 12 },
    { t: 'enemy', k: 'hound', x: 80, y: 20, face: 1 },
    { t: 'enemy', k: 'wisp', x: 47, y: 13 },
    { t: 'enemy', k: 'husk', x: 38, y: 22, face: 1 },
    { t: 'enemy', k: 'hound', x: 30, y: 22, face: 1 },
    { t: 'npc', k: 'tobiah', x: 64, y: 22, face: 1, ncond: 'tobiah_resolved' },
    { t: 'trigger', x: 74, y: 12, w: 2, h: 10, id: 'tobiah' },
    { t: 'shrine', x: 10, y: 21, id: 'plume', grants: 'eagle_wings' },
    { t: 'chest', x: 18, y: 16, id: 'crypt_high', loot: [{ item: 'ring_of_vigil' }, { mat: 'veil_shard', n: 3 }] },
    { t: 'pickup', x: 100, y: 19, id: 'crypt_shard', loot: [{ mat: 'veil_shard', n: 2 }] },
  ];
  return room(b, {
    id: 'crypt', name: 'Ossuary of the Watch', region: 'The Ruined Temple', biome: 'crypt', music: 'crypt',
    dark: 0.72, weather: 'drips', map: { x: 12.5, y: 5.9 }, seed: 79, interior: true,
    spawns: { right: { x: 124, y: 22, face: -1 }, shrine: { x: 10, y: 21, face: 1 } },
    exits: [{ x: 127, y: 16, w: 1, h: 6, to: 'temple_hall', spawn: 'left_low' }],
    ents,
  });
}

// ---------------------------------------------------------------- Upper Gallery
function gallery() {
  const b = new MapBuilder(100, 24);
  b.rect(0, 0, 100, 2);
  b.rect(0, 19, 100, 5);
  b.rect(0, 2, 2, 10).clear(0, 12, 2, 7);
  b.rect(98, 2, 2, 17).clear(98, 13, 2, 6);
  b.clear(22, 19, 4, 3).rect(22, 22, 4, 1, '^');
  b.clear(44, 19, 5, 3).rect(44, 22, 5, 1, '^');
  b.plat(45, 16, 3);
  b.rect(28, 15, 6, 1);
  b.plat(34, 17, 3);
  b.rect(76, 16, 8, 3);
  b.rect(88, 18, 8, 1);
  b.rect(96, 13, 2, 6, 'C');
  const ents: EntDef[] = [
    { t: 'decor', k: 'colonnade', x: 0, y: 19, w: 100 },
    { t: 'decor', k: 'banner', x: 14, y: 2, h: 6 },
    { t: 'decor', k: 'banner', x: 52, y: 2, h: 6 },
    { t: 'decor', k: 'banner', x: 70, y: 2, h: 6 },
    { t: 'decor', k: 'statue', x: 40, y: 19 },
    { t: 'decor', k: 'statue', x: 66, y: 19, flip: true },
    { t: 'decor', k: 'shrine_alcove', x: 91, y: 18 },
    { t: 'light', k: 'window', x: 10, y: 8, r: 70 },
    { t: 'light', k: 'window', x: 36, y: 8, r: 70 },
    { t: 'light', k: 'window', x: 62, y: 8, r: 70 },
    { t: 'light', k: 'window', x: 86, y: 8, r: 70 },
    { t: 'light', k: 'torch', x: 26, y: 13 },
    { t: 'light', k: 'glow', x: 97, y: 16, r: 40, c: '#ffd27a', cond: '!vault_open' },
    { t: 'light', k: 'glow', x: 91, y: 14, r: 80, c: '#fff1c0', cond: '!horn' },
    { t: 'enemy', k: 'hound', x: 16, y: 19, face: -1 },
    { t: 'enemy', k: 'archer', x: 31, y: 15, face: -1 },
    { t: 'enemy', k: 'husk', x: 38, y: 19, face: -1 },
    { t: 'enemy', k: 'sentinel', x: 60, y: 19, face: -1 },
    { t: 'enemy', k: 'wisp', x: 70, y: 11 },
    { t: 'enemy', k: 'archer', x: 80, y: 16, face: -1 },
    { t: 'shrine', x: 91, y: 18, id: 'horn', grants: 'ram_horn' },
    { t: 'pickup', x: 46, y: 16, id: 'gallery_gap', loot: [{ silver: 40 }] },
  ];
  return room(b, {
    id: 'upper_gallery', name: 'The Watchers\' Gallery', region: 'The Ruined Temple', biome: 'temple', music: 'temple',
    dark: 0.55, weather: 'dust', map: { x: 25.75, y: 3 }, seed: 83, interior: true,
    spawns: { left: { x: 2, y: 19, face: 1 }, vault: { x: 94, y: 18, face: -1 }, shrine: { x: 91, y: 18, face: 1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 7, to: 'temple_hall', spawn: 'top_right' },
      { x: 99, y: 13, w: 1, h: 6, to: 'archive_vault', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Archive Vault
function vault() {
  const b = new MapBuilder(48, 22);
  b.rect(0, 0, 48, 2).rect(46, 0, 2, 22);
  b.rect(0, 18, 48, 4);
  b.rect(0, 2, 2, 10).clear(0, 12, 2, 6);
  b.plat(8, 15, 6).plat(16, 12, 6).plat(26, 13, 6);
  b.rect(37, 15, 9, 3);
  const ents: EntDef[] = [
    { t: 'decor', k: 'archive_back', x: 0, y: 18, w: 48 },
    { t: 'decor', k: 'shelf', x: 10, y: 18 },
    { t: 'decor', k: 'shelf', x: 22, y: 18 },
    { t: 'decor', k: 'shelf', x: 31, y: 18 },
    { t: 'decor', k: 'desk', x: 16, y: 18 },
    { t: 'light', k: 'candles', x: 17, y: 18 },
    { t: 'light', k: 'candles', x: 40, y: 15 },
    { t: 'light', k: 'glow', x: 24, y: 6, r: 60, c: '#ffcf8a' },
    { t: 'enemy', k: 'archer', x: 41, y: 15, face: -1, elite: 'vault_archer' },
    { t: 'enemy', k: 'wisp', x: 20, y: 7 },
    { t: 'enemy', k: 'wisp', x: 30, y: 8 },
    { t: 'chest', x: 44, y: 15, id: 'vault_chest', secret: true, loot: [{ item: 'watchman_spear' }, { mat: 'covenant_fragment', n: 1 }, { item: 'pilgrim_boots' }] },
    { t: 'pickup', x: 18.5, y: 12, id: 'archive_ledger', loot: [{ item: 'ledger' }] },
    { t: 'lore', x: 5, y: 18, id: 'cor104' },
  ];
  return room(b, {
    id: 'archive_vault', name: 'The Sealed Archive', region: 'The Ruined Temple', biome: 'temple', music: 'temple',
    dark: 0.6, weather: 'motes', map: { x: 32, y: 3.1 }, seed: 89, interior: true,
    spawns: { left: { x: 2, y: 18, face: 1 } },
    exits: [{ x: 0, y: 12, w: 1, h: 6, to: 'upper_gallery', spawn: 'vault' }],
    ents,
  });
}

// ---------------------------------------------------------------- Idol Antechamber
function antechamber() {
  const b = new MapBuilder(52, 22);
  b.rect(0, 0, 52, 2);
  b.rect(0, 18, 52, 4);
  b.rect(50, 2, 2, 10).clear(50, 12, 2, 6);
  b.rect(0, 2, 2, 10).clear(0, 12, 2, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'gold_hall', x: 0, y: 18, w: 52 },
    { t: 'decor', k: 'mirror', x: 20, y: 18 },
    { t: 'decor', k: 'statue', x: 10, y: 18 },
    { t: 'decor', k: 'statue', x: 30, y: 18, flip: true },
    { t: 'light', k: 'brazier', x: 6, y: 18 },
    { t: 'light', k: 'brazier', x: 26, y: 18 },
    { t: 'light', k: 'glow', x: 1, y: 15, r: 90, c: '#ffbe4d' },
    { t: 'altar', x: 40, y: 18, id: 'antechamber' },
    { t: 'npc', k: 'tobiah', x: 45, y: 18, face: -1, cond: 'tobiah_saved', ncond: 'idol_defeated' },
    { t: 'trigger', x: 28, y: 10, w: 2, h: 8, id: 'regent' },
  ];
  return room(b, {
    id: 'idol_antechamber', name: 'Hall of Offerings', region: 'The Ruined Temple', biome: 'sanctum', music: 'temple',
    dark: 0.5, weather: 'motes', map: { x: 17.25, y: 4.4 }, seed: 97, interior: true,
    spawns: { right: { x: 48, y: 18, face: -1 }, left: { x: 3, y: 18, face: 1 }, altar: { x: 40, y: 18, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 6, to: 'idol_sanctum', spawn: 'right' },
      { x: 51, y: 12, w: 1, h: 6, to: 'temple_hall', spawn: 'seal' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Idol Sanctum
function sanctum() {
  const b = new MapBuilder(66, 28);
  b.rect(0, 0, 66, 2);
  b.rect(0, 0, 2, 28);
  b.rect(0, 23, 66, 5);
  b.rect(64, 2, 2, 14).clear(64, 16, 2, 7);
  b.rect(61, 16, 2, 7, 'G');
  const ents: EntDef[] = [
    { t: 'decor', k: 'sanctum_back', x: 0, y: 23, w: 66 },
    { t: 'decor', k: 'throne', x: 22, y: 23 },
    { t: 'decor', k: 'gold_pillar', x: 6, y: 23 },
    { t: 'decor', k: 'gold_pillar', x: 40, y: 23 },
    { t: 'decor', k: 'gold_pillar', x: 54, y: 23 },
    { t: 'light', k: 'brazier', x: 10, y: 23 },
    { t: 'light', k: 'brazier', x: 34, y: 23 },
    { t: 'light', k: 'brazier', x: 47, y: 23 },
    { t: 'light', k: 'brazier', x: 58, y: 23 },
    { t: 'boss', k: 'idol', x: 22, y: 23 },
    { t: 'trigger', x: 52, y: 14, w: 2, h: 9, id: 'boss_start' },
    { t: 'lore', x: 14, y: 23, id: 'ps11545' },
  ];
  return room(b, {
    id: 'idol_sanctum', name: 'Sanctum of the Gilded Idol', region: 'The Ruined Temple', biome: 'sanctum', music: '',
    dark: 0.45, weather: 'embers', map: { x: 13.1, y: 4.15 }, seed: 101, interior: true,
    spawns: { right: { x: 59, y: 23, face: -1 }, center: { x: 40, y: 23, face: -1 } },
    exits: [{ x: 65, y: 16, w: 1, h: 7, to: 'idol_antechamber', spawn: 'left' }],
    ents,
  });
}

export type RoomData = ReturnType<typeof sanctuary>;

export const ROOMS: Record<string, RoomData> = Object.fromEntries(
  [sanctuary(), ashenRoad(), villageSquare(), cistern(), templeSteps(), templeHall(), chamber(), crypt(), gallery(), vault(), antechamber(), sanctum(), ...ROOMS2, ...ROOMS3]
    .map((r) => [r.id, r]),
);

/** Which chapter a room belongs to (maps show one chapter at a time). */
export function chapterOf(id: string) {
  return CH3_ROOM_IDS.has(id) ? 3 : CH2_ROOM_IDS.has(id) ? 2 : 1;
}
