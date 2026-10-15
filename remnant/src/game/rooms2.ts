// Chapter II — The Tower of Shinar. The road east crosses the Plain of
// Shinar, where a red tower has risen in a month. Nine rooms: the camp, the
// plain, the brickworks, the Overseer's kiln yard, the Tower Gate, and four
// floors of the tower up to the Marshal's throne.
// Coordinates are tiles; an entity's y is the row its feet stand on.

import { MapBuilder, type RoomDef, type Exit, type EntDef } from './tiles';

type Spec = Omit<RoomDef, 'rows' | 'w' | 'h' | 'exits'> & { exits: (Exit & { cond?: string })[] };

function room(b: MapBuilder, spec: Spec) {
  return { ...spec, w: b.w, h: b.h, rows: b.rows() };
}

const REGION_PLAIN = 'The Plain of Shinar';
const REGION_TOWER = 'The Tower of Shinar';

// ---------------------------------------------------------------- Camp
function camp() {
  const b = new MapBuilder(60, 22);
  b.rect(0, 18, 60, 4);
  b.rect(0, 0, 2, 18);
  b.rect(2, 17, 6, 1);
  b.plat(40, 14, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'palisade', x: 3, y: 17 },
    { t: 'decor', k: 'palm', x: 8, y: 18 },
    { t: 'decor', k: 'tent', x: 14, y: 18 },
    { t: 'decor', k: 'tent', x: 30, y: 18, flip: true },
    { t: 'decor', k: 'bedroll', x: 18, y: 18 },
    { t: 'decor', k: 'bedroll', x: 27, y: 18, flip: true },
    { t: 'decor', k: 'cart', x: 36, y: 18 },
    { t: 'decor', k: 'crates', x: 39, y: 18 },
    { t: 'decor', k: 'anvil', x: 47, y: 18 },
    { t: 'decor', k: 'barrel', x: 50, y: 18 },
    { t: 'decor', k: 'palm', x: 55, y: 18, flip: true },
    { t: 'decor', k: 'brick_stack', x: 43, y: 14 },
    { t: 'decor', k: 'grass', x: 2, y: 18, w: 10, fg: true },
    { t: 'decor', k: 'grass', x: 52, y: 18, w: 8, fg: true },
    { t: 'light', k: 'brazier', x: 22.5, y: 18 },
    { t: 'light', k: 'forge', x: 48, y: 18 },
    { t: 'light', k: 'lantern', x: 14, y: 12 },
    { t: 'light', k: 'lantern', x: 31, y: 12 },
    { t: 'altar', x: 6, y: 17, id: 'shinar_camp' },
    { t: 'npc', k: 'azriel', x: 21, y: 18, face: 1 },
    { t: 'npc', k: 'tobiah', x: 25, y: 18, face: -1 },
    { t: 'npc', k: 'ilan', x: 38, y: 18, face: -1 },
    { t: 'npc', k: 'dov', x: 45, y: 18, face: 1 },
    { t: 'chest', x: 43, y: 14, id: 'camp_crate', loot: [{ silver: 60 }, { mat: 'iron_scrap', n: 2 }] },
    { t: 'lore', x: 11, y: 18, id: 'gen111' },
  ];
  return room(b, {
    id: 'shinar_camp', name: 'Camp at the Pass', region: REGION_PLAIN, biome: 'plain', music: 'shinar',
    dark: 0.32, weather: 'dust', map: { x: 0, y: 3 }, seed: 211, interior: false,
    spawns: { start: { x: 20, y: 18, face: 1 }, altar: { x: 6, y: 17, face: 1 }, right: { x: 57, y: 18, face: -1 } },
    exits: [{ x: 59, y: 9, w: 1, h: 9, to: 'shinar_plain', spawn: 'left' }],
    ents,
  });
}

// ---------------------------------------------------------------- Plain
function plain() {
  const b = new MapBuilder(112, 26);
  b.rect(0, 21, 112, 5);
  b.rect(14, 19, 8, 2).rect(16, 18, 4, 1);
  // Broken aqueduct.
  b.rect(30, 14, 2, 7).rect(42, 14, 2, 7).plat(30, 13, 14).rect(54, 15, 2, 6).plat(44, 13, 10);
  // Pitch pool.
  b.clear(60, 21, 8, 2).rect(60, 22, 8, 1, 'w');
  b.rect(60, 23, 8, 1);
  b.rect(74, 19, 12, 2).rect(78, 17, 5, 2);
  b.plat(88, 15, 6);
  b.rect(98, 19, 14, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'palm', x: 6, y: 21 },
    { t: 'decor', k: 'palm', x: 25, y: 21, flip: true },
    { t: 'decor', k: 'rubble', x: 36, y: 21 },
    { t: 'decor', k: 'statue_broken', x: 49, y: 21 },
    { t: 'decor', k: 'brick_stack', x: 70, y: 21 },
    { t: 'decor', k: 'pitch_pot', x: 58, y: 21 },
    { t: 'decor', k: 'cart', x: 94, y: 21, flip: true },
    { t: 'decor', k: 'palm', x: 104, y: 19 },
    { t: 'decor', k: 'grass', x: 0, y: 21, w: 14, fg: true },
    { t: 'decor', k: 'grass', x: 86, y: 21, w: 10, fg: true },
    { t: 'light', k: 'glow', x: 64, y: 21, r: 50, c: '#ff8a3d' },
    { t: 'light', k: 'brazier', x: 80, y: 17 },
    { t: 'enemy', k: 'husk', x: 24, y: 21, face: -1 },
    { t: 'enemy', k: 'hound', x: 37, y: 21, face: -1 },
    { t: 'enemy', k: 'archer', x: 38, y: 13, face: -1 },
    { t: 'enemy', k: 'husk', x: 48, y: 21, face: -1 },
    { t: 'enemy', k: 'brute', x: 72, y: 21, face: -1 },
    { t: 'enemy', k: 'hound', x: 90, y: 21, face: -1 },
    { t: 'enemy', k: 'husk', x: 101, y: 19, face: -1 },
    { t: 'chest', x: 49, y: 13, id: 'aqueduct_top', loot: [{ silver: 50 }, { mat: 'iron_scrap', n: 2 }, { item: 'brickmaker_wraps' }] },
    { t: 'chest', x: 90, y: 15, id: 'plain_ledge', secret: true, loot: [{ silver: 80 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 80, y: 17, id: 'gen113' },
    { t: 'hint', x: 64, w: 8, id: 'h_tank', text: 'Heavy foes shrug off light blows. Break their poise and they fall Broken: juggle them, and strike harder while they reel.' },
  ];
  return room(b, {
    id: 'shinar_plain', name: 'The Plain of Shinar', region: REGION_PLAIN, biome: 'plain', music: 'shinar',
    dark: 0.3, weather: 'dust', map: { x: 3.75, y: 2.8 }, seed: 223, interior: false,
    spawns: { left: { x: 2, y: 21, face: 1 }, right: { x: 109, y: 19, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'shinar_camp', spawn: 'right' },
      { x: 111, y: 10, w: 1, h: 9, to: 'brickworks', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Brickworks
function brickworks() {
  const b = new MapBuilder(96, 32);
  b.rect(0, 27, 96, 5);
  b.rect(0, 0, 96, 1);
  // Scaffolds around the kilns.
  b.plat(8, 22, 10).plat(14, 17, 8).plat(6, 12, 9);
  b.rect(30, 24, 10, 3);
  b.plat(42, 21, 8).plat(52, 17, 10).plat(64, 21, 8);
  b.plat(66, 13, 8).plat(80, 10, 9);
  b.rect(78, 23, 18, 4);
  b.clear(46, 27, 4, 2).rect(46, 28, 4, 1, 'w');
  const ents: EntDef[] = [
    { t: 'decor', k: 'kiln', x: 22, y: 27, w: 5 },
    { t: 'decor', k: 'kiln', x: 58, y: 27, w: 6 },
    { t: 'decor', k: 'scaffold', x: 8, y: 22, w: 10, h: 5 },
    { t: 'decor', k: 'scaffold', x: 14, y: 17, w: 8, h: 5 },
    { t: 'decor', k: 'scaffold', x: 52, y: 17, w: 10, h: 10 },
    { t: 'decor', k: 'scaffold', x: 80, y: 10, w: 9, h: 13 },
    { t: 'decor', k: 'brick_stack', x: 34, y: 24 },
    { t: 'decor', k: 'brick_stack', x: 72, y: 27 },
    { t: 'decor', k: 'brick_stack', x: 86, y: 23 },
    { t: 'decor', k: 'pitch_pot', x: 44, y: 27 },
    { t: 'decor', k: 'pitch_pot', x: 76, y: 27 },
    { t: 'decor', k: 'crates', x: 4, y: 27 },
    { t: 'light', k: 'forge', x: 22, y: 27 },
    { t: 'light', k: 'forge', x: 58, y: 27 },
    { t: 'light', k: 'brazier', x: 38, y: 24 },
    { t: 'light', k: 'brazier', x: 90, y: 23 },
    { t: 'enemy', k: 'husk', x: 12, y: 27, face: 1 },
    { t: 'enemy', k: 'archer', x: 18, y: 17, face: 1 },
    { t: 'enemy', k: 'bulwark', x: 36, y: 24, face: -1 },
    { t: 'enemy', k: 'husk', x: 52, y: 27, face: -1 },
    { t: 'enemy', k: 'archer', x: 57, y: 17, face: -1 },
    { t: 'enemy', k: 'husk', x: 66, y: 27, face: -1 },
    { t: 'enemy', k: 'hound', x: 70, y: 27, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 86, y: 23, face: -1 },
    { t: 'chest', x: 9, y: 12, id: 'kiln_loft', secret: true, loot: [{ silver: 90 }, { item: 'pilgrim_band' }] },
    { t: 'chest', x: 84, y: 10, id: 'scaffold_top', loot: [{ silver: 60 }, { mat: 'iron_scrap', n: 3 }, { mat: 'veil_shard', n: 2 }] },
    { t: 'lore', x: 70, y: 13, id: 'gen114' },
    { t: 'hint', x: 30, w: 8, id: 'h_bulwark', text: 'Shields stop blows from the front. Land a hit, then {dodge} to Phantom Step behind.' },
  ];
  return room(b, {
    id: 'brickworks', name: 'The Brickworks', region: REGION_PLAIN, biome: 'plain', music: 'shinar',
    dark: 0.36, weather: 'embers', map: { x: 10.75, y: 2.4 }, seed: 239, interior: false,
    spawns: { left: { x: 2, y: 27, face: 1 }, right: { x: 93, y: 23, face: -1 } },
    exits: [
      { x: 0, y: 18, w: 1, h: 9, to: 'shinar_plain', spawn: 'right' },
      { x: 95, y: 14, w: 1, h: 9, to: 'kiln_yard', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Kiln Yard (elite Brute)
function kilnYard() {
  const b = new MapBuilder(58, 22);
  b.rect(0, 18, 58, 4);
  b.rect(0, 0, 58, 1);
  b.rect(0, 1, 2, 8).rect(56, 1, 2, 8);
  b.rect(2, 9, 1, 9, 'G').rect(55, 9, 1, 9, 'G');
  b.plat(10, 13, 6).plat(42, 13, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'kiln', x: 29, y: 18, w: 9 },
    { t: 'decor', k: 'brick_stack', x: 8, y: 18 },
    { t: 'decor', k: 'brick_stack', x: 50, y: 18 },
    { t: 'decor', k: 'chains', x: 18, y: 1, h: 6 },
    { t: 'decor', k: 'chains', x: 40, y: 1, h: 5 },
    { t: 'light', k: 'forge', x: 29, y: 18, r: 140 },
    { t: 'light', k: 'brazier', x: 6, y: 18 },
    { t: 'light', k: 'brazier', x: 52, y: 18 },
    { t: 'enemy', k: 'brute', x: 36, y: 18, face: -1, elite: 'kiln_overseer' },
    { t: 'trigger', x: 12, y: 10, w: 2, h: 8, id: 'overseer' },
    { t: 'lore', x: 46, y: 18, id: 'prov1618' },
  ];
  return room(b, {
    id: 'kiln_yard', name: 'The Overseer\'s Yard', region: REGION_PLAIN, biome: 'plain', music: 'shinar',
    dark: 0.4, weather: 'embers', map: { x: 16.75, y: 3.2 }, seed: 251, interior: false,
    spawns: { left: { x: 4, y: 18, face: 1 }, right: { x: 53, y: 18, face: -1 } },
    exits: [
      { x: 0, y: 9, w: 1, h: 9, to: 'brickworks', spawn: 'right' },
      { x: 57, y: 9, w: 1, h: 9, to: 'tower_gate', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Tower Gate (the Gatekeeper)
function towerGate() {
  const b = new MapBuilder(70, 28);
  b.rect(0, 23, 70, 5);
  b.rect(0, 0, 2, 14);
  b.rect(3, 14, 1, 9, 'G');
  b.rect(64, 0, 6, 23);
  b.clear(64, 14, 6, 9);
  b.rect(66, 14, 4, 1);
  const ents: EntDef[] = [
    { t: 'decor', k: 'tower_door', x: 66, y: 23, w: 8 },
    { t: 'decor', k: 'relief', x: 50, y: 18, w: 6 },
    { t: 'decor', k: 'rubble', x: 12, y: 23 },
    { t: 'decor', k: 'statue_broken', x: 22, y: 23 },
    { t: 'decor', k: 'brick_stack', x: 30, y: 23 },
    { t: 'decor', k: 'palm', x: 6, y: 23 },
    { t: 'light', k: 'brazier', x: 58, y: 23 },
    { t: 'decor', k: 'brazier_tall', x: 58, y: 23 },
    { t: 'decor', k: 'brazier_tall', x: 36, y: 23 },
    { t: 'light', k: 'brazier', x: 36, y: 23 },
    { t: 'light', k: 'glow', x: 66, y: 18, r: 120, c: '#ff4a2a' },
    { t: 'boss', k: 'gatekeeper', x: 50, y: 23 },
    { t: 'trigger', x: 18, y: 14, w: 2, h: 9, id: 'gatekeeper_start' },
    { t: 'lore', x: 10, y: 23, id: 'gen116' },
  ];
  return room(b, {
    id: 'tower_gate', name: 'The Tower Gate', region: REGION_PLAIN, biome: 'plain', music: '',
    dark: 0.42, weather: 'embers', map: { x: 20.5, y: 2.6 }, seed: 263, interior: false,
    spawns: { left: { x: 5, y: 23, face: 1 }, center: { x: 24, y: 23, face: 1 }, door: { x: 62, y: 23, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 9, to: 'kiln_yard', spawn: 'right' },
      { x: 69, y: 15, w: 1, h: 8, to: 'tower_lower', spawn: 'left', cond: 'gate_open' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Tower, lower floor (a climb)
function towerLower() {
  const b = new MapBuilder(50, 36);
  b.rect(0, 0, 50, 2);
  b.rect(0, 32, 50, 4);
  b.rect(0, 2, 2, 22).rect(48, 2, 2, 4).rect(48, 11, 2, 21);
  b.plat(8, 28, 8).plat(20, 25, 8).plat(32, 22, 8);
  b.rect(40, 19, 8, 1, 'B');
  b.plat(26, 16, 9).plat(12, 13, 8);
  b.rect(2, 10, 6, 1, 'B');
  b.plat(22, 8, 10).plat(36, 11, 12);
  const ents: EntDef[] = [
    { t: 'decor', k: 'relief', x: 14, y: 32, w: 7 },
    { t: 'decor', k: 'relief', x: 36, y: 32, w: 7, flip: true },
    { t: 'decor', k: 'banner', x: 24, y: 2, h: 5, v: 1 },
    { t: 'decor', k: 'banner', x: 40, y: 2, h: 4, v: 1 },
    { t: 'decor', k: 'chains', x: 18, y: 2, h: 8 },
    { t: 'light', k: 'torch', x: 4, y: 26 },
    { t: 'light', k: 'torch', x: 46, y: 26 },
    { t: 'light', k: 'torch', x: 30, y: 13 },
    { t: 'light', k: 'brazier', x: 44, y: 19 },
    { t: 'light', k: 'window', x: 26, y: 4, r: 70 },
    { t: 'altar', x: 6, y: 32, id: 'tower_lower' },
    { t: 'enemy', k: 'husk', x: 24, y: 32, face: -1 },
    { t: 'enemy', k: 'husk', x: 34, y: 32, face: -1 },
    { t: 'enemy', k: 'archer', x: 36, y: 22, face: -1 },
    { t: 'enemy', k: 'knight', x: 44, y: 19, face: -1 },
    { t: 'enemy', k: 'archer', x: 16, y: 13, face: 1 },
    { t: 'enemy', k: 'wisp', x: 30, y: 6 },
    { t: 'chest', x: 4, y: 10, id: 'tower_alcove', secret: true, loot: [{ silver: 100 }, { mat: 'covenant_fragment', n: 1 }, { item: 'tower_greaves' }] },
    { t: 'lore', x: 42, y: 32, id: 'prov1810' },
  ];
  return room(b, {
    id: 'tower_lower', name: 'The First Course', region: REGION_TOWER, biome: 'tower', music: 'tower',
    dark: 0.5, weather: 'motes', map: { x: 25, y: 1.4 }, seed: 277, interior: true,
    spawns: { left: { x: 3, y: 32, face: 1 }, altar: { x: 6, y: 32, face: 1 }, right: { x: 45, y: 11, face: -1 } },
    exits: [
      { x: 0, y: 24, w: 1, h: 8, to: 'tower_gate', spawn: 'door' },
      { x: 49, y: 6, w: 1, h: 5, to: 'hall_of_tongues', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Hall of Tongues (elite Bulwark)
function hallOfTongues() {
  const b = new MapBuilder(84, 24);
  b.rect(0, 0, 84, 2);
  b.rect(0, 20, 84, 4);
  b.rect(0, 2, 2, 10).rect(82, 2, 2, 10);
  b.plat(14, 15, 8).plat(62, 15, 8);
  b.rect(36, 17, 12, 3, 'B');
  b.plat(38, 12, 8);
  const ents: EntDef[] = [
    { t: 'decor', k: 'relief', x: 10, y: 20, w: 8 },
    { t: 'decor', k: 'relief', x: 26, y: 20, w: 8, v: 1 },
    { t: 'decor', k: 'relief', x: 56, y: 20, w: 8, v: 2 },
    { t: 'decor', k: 'relief', x: 72, y: 20, w: 8, v: 1 },
    { t: 'decor', k: 'banner', x: 20, y: 2, h: 6, v: 1 },
    { t: 'decor', k: 'banner', x: 42, y: 2, h: 7, v: 1 },
    { t: 'decor', k: 'banner', x: 64, y: 2, h: 6, v: 1 },
    { t: 'decor', k: 'brazier_tall', x: 34, y: 20 },
    { t: 'decor', k: 'brazier_tall', x: 50, y: 20 },
    { t: 'light', k: 'brazier', x: 34, y: 20 },
    { t: 'light', k: 'brazier', x: 50, y: 20 },
    { t: 'light', k: 'torch', x: 4, y: 16 },
    { t: 'light', k: 'torch', x: 80, y: 16 },
    { t: 'enemy', k: 'knight', x: 24, y: 20, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 58, y: 20, face: -1, elite: 'hall_bulwark' },
    { t: 'enemy', k: 'archer', x: 66, y: 15, face: -1 },
    { t: 'enemy', k: 'archer', x: 18, y: 15, face: 1 },
    { t: 'chest', x: 42, y: 12, id: 'tongues_dais', loot: [{ silver: 80 }, { mat: 'veil_shard', n: 3 }, { item: 'crimson_mantle' }] },
    { t: 'lore', x: 42, y: 17, id: 'gen117' },
    { t: 'hint', x: 4, w: 8, id: 'h_switch', text: 'Press {switch} to switch support: your next Echo steps in mid-strike, or you trade places with one.' },
  ];
  return room(b, {
    id: 'hall_of_tongues', name: 'Hall of Tongues', region: REGION_TOWER, biome: 'tower', music: 'tower',
    dark: 0.48, weather: 'motes', map: { x: 28.2, y: 0.4 }, seed: 281, interior: true,
    spawns: { left: { x: 3, y: 20, face: 1 }, right: { x: 80, y: 20, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 8, to: 'tower_lower', spawn: 'right' },
      { x: 83, y: 12, w: 1, h: 8, to: 'tower_upper', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Upper floor (the Crimson Guard)
function towerUpper() {
  const b = new MapBuilder(74, 26);
  b.rect(0, 0, 74, 2);
  b.rect(0, 22, 74, 4);
  b.rect(0, 2, 2, 12).rect(72, 2, 2, 12);
  b.rect(3, 14, 1, 8, 'G').rect(70, 14, 1, 8, 'G');
  b.plat(12, 17, 7).plat(55, 17, 7).plat(30, 14, 14);
  const ents: EntDef[] = [
    { t: 'decor', k: 'banner', x: 14, y: 2, h: 7, v: 1 },
    { t: 'decor', k: 'banner', x: 37, y: 2, h: 8, v: 1 },
    { t: 'decor', k: 'banner', x: 60, y: 2, h: 7, v: 1 },
    { t: 'decor', k: 'statue', x: 24, y: 22 },
    { t: 'decor', k: 'statue', x: 50, y: 22, flip: true },
    { t: 'decor', k: 'relief', x: 37, y: 22, w: 10, v: 2 },
    { t: 'light', k: 'brazier', x: 8, y: 22 },
    { t: 'light', k: 'brazier', x: 66, y: 22 },
    { t: 'light', k: 'window', x: 37, y: 6, r: 90, c: '#ff6a4a' },
    { t: 'trigger', x: 22, y: 14, w: 2, h: 8, id: 'guard_wave' },
    { t: 'altar', x: 64, y: 22, id: 'tower_upper', cond: 'guard_cleared' },
    { t: 'chest', x: 37, y: 14, id: 'guard_spoils', loot: [{ silver: 120 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 30, y: 22, id: 'gen119' },
  ];
  return room(b, {
    id: 'tower_upper', name: 'The Crimson Guard', region: REGION_TOWER, biome: 'tower', music: 'tower',
    dark: 0.5, weather: 'embers', map: { x: 33.5, y: 0.1 }, seed: 293, interior: true,
    spawns: { left: { x: 5, y: 22, face: 1 }, altar: { x: 64, y: 22, face: -1 }, right: { x: 68, y: 22, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 8, to: 'hall_of_tongues', spawn: 'right' },
      { x: 73, y: 14, w: 1, h: 8, to: 'marshal_throne', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Marshal's Throne
function marshalThrone() {
  const b = new MapBuilder(64, 24);
  b.rect(0, 0, 64, 2);
  b.rect(0, 20, 64, 4);
  b.rect(0, 2, 2, 10).rect(62, 2, 2, 18);
  b.rect(3, 12, 1, 8, 'G');
  b.rect(52, 18, 10, 2, 'B');
  const ents: EntDef[] = [
    { t: 'decor', k: 'throne', x: 56, y: 18 },
    { t: 'decor', k: 'banner', x: 14, y: 2, h: 8, v: 1 },
    { t: 'decor', k: 'banner', x: 30, y: 2, h: 9, v: 1 },
    { t: 'decor', k: 'banner', x: 46, y: 2, h: 8, v: 1 },
    { t: 'decor', k: 'pillar', x: 8, y: 20 },
    { t: 'decor', k: 'pillar', x: 22, y: 20 },
    { t: 'decor', k: 'pillar', x: 38, y: 20 },
    { t: 'decor', k: 'pillar', x: 50, y: 20 },
    { t: 'decor', k: 'brazier_tall', x: 15, y: 20 },
    { t: 'decor', k: 'brazier_tall', x: 44, y: 20 },
    { t: 'light', k: 'brazier', x: 15, y: 20 },
    { t: 'light', k: 'brazier', x: 44, y: 20 },
    { t: 'light', k: 'window', x: 30, y: 5, r: 100, c: '#ff4a3a' },
    { t: 'light', k: 'glow', x: 56, y: 14, r: 80, c: '#ff3a3a' },
    { t: 'boss', k: 'marshal', x: 44, y: 20 },
    { t: 'trigger', x: 16, y: 12, w: 2, h: 8, id: 'marshal_start' },
    { t: 'lore', x: 58, y: 18, id: 'tim47' },
  ];
  return room(b, {
    id: 'marshal_throne', name: 'The Marshal\'s Hall', region: REGION_TOWER, biome: 'tower', music: '',
    dark: 0.46, weather: 'embers', map: { x: 38.2, y: 0.2 }, seed: 307, interior: true,
    spawns: { left: { x: 5, y: 20, face: 1 }, center: { x: 26, y: 20, face: 1 } },
    exits: [{ x: 0, y: 12, w: 1, h: 8, to: 'tower_upper', spawn: 'right' }],
    ents,
  });
}

export const ROOMS2 = [camp(), plain(), brickworks(), kilnYard(), towerGate(), towerLower(), hallOfTongues(), towerUpper(), marshalThrone()];
export const CH2_ROOM_IDS = new Set(ROOMS2.map((r) => r.id));
