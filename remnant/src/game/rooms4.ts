// Chapter IV — The Plain of Dura. South of the valley, by the rivers of
// Babylon, a satrap has raised an image of gold and commands every captive
// to bow. Three who would not are bound for the furnace. Eight rooms: the
// river camp, the blue gate and the processional way, the lions' den below
// the street, the furnace halls and the furnace mouth, the plain, and the
// foot of the Image. Coordinates are tiles; an entity's y is the row its
// feet stand on.

import { MapBuilder, type RoomDef, type Exit, type EntDef } from './tiles';

type Spec = Omit<RoomDef, 'rows' | 'w' | 'h' | 'exits'> & { exits: (Exit & { cond?: string })[] };

function room(b: MapBuilder, spec: Spec) {
  return { ...spec, w: b.w, h: b.h, rows: b.rows() };
}

const RIVERS = 'By the Rivers of Babylon';
const CITY = 'Babylon';
const FURNACE = 'The Burning Fiery Furnace';
const DURA = 'The Plain of Dura';

// ---------------------------------------------------------------- Camp by the river
function riverCamp() {
  const b = new MapBuilder(64, 22);
  b.rect(0, 18, 64, 4);
  b.rect(0, 0, 2, 18);
  b.clear(30, 18, 12, 2).rect(30, 19, 12, 1, 'w').rect(30, 20, 12, 1);
  b.plat(46, 14, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'willow', x: 29, y: 18, v: 1 },
    { t: 'decor', k: 'willow', x: 43, y: 18, flip: true },
    { t: 'decor', k: 'reeds', x: 31, y: 18 },
    { t: 'decor', k: 'reeds', x: 40, y: 18, flip: true },
    { t: 'decor', k: 'date_palm', x: 9, y: 18 },
    { t: 'decor', k: 'date_palm', x: 60, y: 18, flip: true },
    { t: 'decor', k: 'tent', x: 14, y: 18 },
    { t: 'decor', k: 'tent', x: 52, y: 18, flip: true },
    { t: 'decor', k: 'bedroll', x: 18, y: 18 },
    { t: 'decor', k: 'cart', x: 48, y: 18 },
    { t: 'decor', k: 'anvil', x: 57, y: 18 },
    { t: 'decor', k: 'ziggurat', x: 36, y: 18, w: 18 },
    { t: 'light', k: 'brazier', x: 22.5, y: 18 },
    { t: 'light', k: 'forge', x: 58, y: 18 },
    { t: 'light', k: 'lantern', x: 14, y: 12 },
    { t: 'altar', x: 6, y: 18, id: 'river_camp' },
    { t: 'npc', k: 'mara', x: 11, y: 18, face: 1 },
    { t: 'npc', k: 'azriel', x: 20, y: 18, face: 1 },
    { t: 'npc', k: 'tobiah', x: 25, y: 18, face: -1 },
    { t: 'npc', k: 'ilan', x: 50, y: 18, face: -1 },
    { t: 'npc', k: 'dov', x: 55, y: 18, face: 1 },
    { t: 'npc', k: 'ezra', x: 16, y: 18, face: 1, cond: 'ch4_image_done' },
    { t: 'npc', k: 'talia', x: 27, y: 18, face: -1, cond: 'ch4_image_done' },
    { t: 'npc', k: 'barak', x: 45, y: 18, face: -1, cond: 'ch4_image_done' },
    { t: 'chest', x: 49, y: 14, id: 'river_cart', loot: [{ silver: 160 }, { mat: 'sentinel_steel', n: 2 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 27, y: 18, id: 'ps1371' },
  ];
  return room(b, {
    id: 'river_camp', name: 'Camp by the Rivers of Babylon', region: RIVERS, biome: 'dura', music: 'dura',
    dark: 0.3, weather: 'dust', map: { x: 0, y: 3 }, seed: 503, interior: false,
    spawns: { start: { x: 20, y: 18, face: 1 }, altar: { x: 6, y: 18, face: 1 }, right: { x: 61, y: 18, face: -1 } },
    exits: [{ x: 63, y: 9, w: 1, h: 9, to: 'babylon_gate', spawn: 'left' }],
    ents,
  });
}

// ---------------------------------------------------------------- The Gate of Babylon
function babylonGate() {
  const b = new MapBuilder(110, 26);
  b.rect(0, 21, 110, 5);
  b.rect(14, 19, 6, 2);
  b.plat(24, 16, 8);
  b.plat(50, 12, 6).plat(66, 12, 6);
  b.rect(94, 18, 16, 3);
  const ents: EntDef[] = [
    { t: 'decor', k: 'date_palm', x: 6, y: 21 },
    { t: 'decor', k: 'date_palm', x: 36, y: 21, flip: true },
    { t: 'decor', k: 'city_wall', x: 60, y: 21, w: 40, h: 15 },
    { t: 'decor', k: 'gate_arch', x: 60, y: 21, w: 14, h: 13 },
    { t: 'decor', k: 'babylon_banner', x: 52, y: 7, h: 5 },
    { t: 'decor', k: 'babylon_banner', x: 68, y: 7, h: 5 },
    { t: 'decor', k: 'pot_stack', x: 40, y: 21 },
    { t: 'decor', k: 'pot_stack', x: 98, y: 18 },
    { t: 'decor', k: 'palm_planter', x: 84, y: 21 },
    { t: 'light', k: 'brazier', x: 46, y: 21 },
    { t: 'light', k: 'brazier', x: 74, y: 21 },
    { t: 'light', k: 'glow', x: 60, y: 14, r: 70, c: '#ffcf8a' },
    { t: 'enemy', k: 'lion', x: 30, y: 21, face: -1 },
    { t: 'enemy', k: 'priest', x: 53, y: 12, face: -1 },
    { t: 'enemy', k: 'knight', x: 62, y: 21, face: -1 },
    { t: 'enemy', k: 'priest', x: 69, y: 12, face: -1 },
    { t: 'enemy', k: 'lion', x: 82, y: 21, face: -1 },
    { t: 'enemy', k: 'lion', x: 88, y: 21, face: -1 },
    { t: 'enemy', k: 'priest', x: 102, y: 18, face: -1 },
    { t: 'chest', x: 27, y: 16, id: 'gate_niche', loot: [{ silver: 140 }, { mat: 'covenant_fragment', n: 1 }, { mat: 'iron_scrap', n: 3 }] },
    { t: 'lore', x: 42, y: 21, id: 'dan31' },
    { t: 'hint', x: 24, w: 8, id: 'h_lions', text: 'Brazen Lions crouch before they pounce. {parry} the leap, or {dodge} under it.' },
  ];
  return room(b, {
    id: 'babylon_gate', name: 'The Gate of Babylon', region: CITY, biome: 'babylon', music: 'babylon',
    dark: 0.35, weather: 'embers', map: { x: 4, y: 2.75 }, seed: 509, interior: false,
    spawns: { left: { x: 3, y: 21, face: 1 }, right: { x: 106, y: 18, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'river_camp', spawn: 'right' },
      { x: 109, y: 9, w: 1, h: 9, to: 'processional_way', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The Processional Way (the den is below)
function processionalWay() {
  const b = new MapBuilder(130, 28);
  b.rect(0, 23, 130, 5);
  b.clear(60, 23, 4, 5);
  b.plat(18, 18, 10).plat(32, 14, 10).plat(46, 18, 8);
  b.rect(72, 19, 10, 4);
  b.plat(86, 16, 10).plat(100, 12, 8);
  b.plat(121, 9, 5);
  b.rect(112, 20, 18, 3);
  const ents: EntDef[] = [
    { t: 'decor', k: 'city_wall', x: 28, y: 23, w: 50, h: 12 },
    { t: 'decor', k: 'city_wall', x: 96, y: 23, w: 40, h: 14 },
    { t: 'decor', k: 'market_stall', x: 10, y: 23 },
    { t: 'decor', k: 'market_stall', x: 52, y: 23, flip: true },
    { t: 'decor', k: 'den_grate', x: 62, y: 23, w: 4 },
    { t: 'decor', k: 'pot_stack', x: 68, y: 23 },
    { t: 'decor', k: 'palm_planter', x: 108, y: 23 },
    { t: 'decor', k: 'babylon_banner', x: 36, y: 4, h: 5 },
    { t: 'decor', k: 'babylon_banner', x: 90, y: 4, h: 5 },
    { t: 'light', k: 'brazier', x: 26, y: 23 },
    { t: 'light', k: 'brazier', x: 84, y: 23 },
    { t: 'light', k: 'lantern', x: 104, y: 7 },
    { t: 'enemy', k: 'lion', x: 24, y: 23, face: -1 },
    { t: 'enemy', k: 'priest', x: 37, y: 14, face: -1 },
    { t: 'enemy', k: 'lion', x: 50, y: 23, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 77, y: 19, face: -1 },
    { t: 'enemy', k: 'lion', x: 92, y: 23, face: -1 },
    { t: 'enemy', k: 'priest', x: 104, y: 12, face: -1 },
    { t: 'enemy', k: 'knight', x: 118, y: 20, face: -1 },
    { t: 'chest', x: 123, y: 9, id: 'rooftop_cache', secret: true, loot: [{ silver: 200 }, { mat: 'radiant_core', n: 1 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 70, y: 23, id: 'dan35' },
    { t: 'hint', x: 56, w: 10, id: 'h_den', text: 'A broken grate over a pit. Something growls far below.' },
  ];
  return room(b, {
    id: 'processional_way', name: 'The Processional Way', region: CITY, biome: 'babylon', music: 'babylon',
    dark: 0.38, weather: 'embers', map: { x: 10.9, y: 2.6 }, seed: 521, interior: false,
    spawns: { left: { x: 3, y: 23, face: 1 }, right: { x: 126, y: 20, face: -1 }, den: { x: 57, y: 23, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 9, to: 'babylon_gate', spawn: 'right' },
      { x: 129, y: 11, w: 1, h: 9, to: 'furnace_halls', spawn: 'left' },
      { x: 60, y: 27, w: 4, h: 1, to: 'lions_den', spawn: 'top' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The Lions' Den (optional)
function lionsDen() {
  const b = new MapBuilder(56, 30);
  b.rect(0, 0, 56, 2).clear(26, 0, 4, 2);
  b.rect(0, 26, 56, 4);
  b.rect(0, 2, 2, 24).rect(54, 2, 2, 24);
  b.plat(6, 22, 6).plat(14, 18, 6).plat(22, 14, 6).plat(30, 10, 6).plat(24, 6, 6);
  b.plat(3, 12, 4);
  const ents: EntDef[] = [
    { t: 'decor', k: 'straw', x: 12, y: 26 },
    { t: 'decor', k: 'straw', x: 38, y: 26, flip: true },
    { t: 'decor', k: 'bone_pile', x: 20, y: 26 },
    { t: 'decor', k: 'bone_pile', x: 48, y: 26 },
    { t: 'decor', k: 'light_shaft', x: 28, y: 26, w: 4, h: 24 },
    { t: 'light', k: 'glow', x: 28, y: 4, r: 90, c: '#ffe6a8' },
    { t: 'light', k: 'glow', x: 28, y: 22, r: 70, c: '#ffe6a8' },
    { t: 'enemy', k: 'lion', x: 14, y: 26, face: 1 },
    { t: 'enemy', k: 'lion', x: 42, y: 26, face: -1, elite: 'den_lion' },
    { t: 'chest', x: 4, y: 12, id: 'den_cache', secret: true, loot: [{ silver: 220 }, { mat: 'radiant_core', n: 1 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 47, y: 26, id: 'dan622' },
  ];
  return room(b, {
    id: 'lions_den', name: 'The Lions\' Den', region: CITY, biome: 'crypt', music: 'den',
    dark: 0.6, weather: 'motes', map: { x: 13.6, y: 4.6 }, seed: 541, interior: true,
    spawns: { top: { x: 28, y: 26, face: 1 } },
    exits: [{ x: 26, y: 0, w: 4, h: 3, to: 'processional_way', spawn: 'den' }],
    ents,
  });
}

// ---------------------------------------------------------------- The Furnace Halls (elite warden)
function furnaceHalls() {
  const b = new MapBuilder(100, 30);
  b.rect(0, 0, 100, 2);
  b.rect(0, 25, 100, 5);
  b.rect(0, 2, 2, 14).rect(98, 2, 2, 14);
  b.rect(22, 25, 6, 1, '~').rect(48, 25, 8, 1, '~');
  b.rect(80, 24, 4, 1, '^');
  b.plat(20, 21, 10).plat(34, 17, 8).plat(46, 20, 12).plat(62, 16, 8).plat(76, 20, 10);
  const ents: EntDef[] = [
    { t: 'decor', k: 'furnace_wall', x: 50, y: 25, w: 96, h: 23 },
    { t: 'decor', k: 'chain_hang', x: 16, y: 2, h: 9 },
    { t: 'decor', k: 'chain_hang', x: 58, y: 2, h: 7 },
    { t: 'decor', k: 'chain_hang', x: 88, y: 2, h: 10 },
    { t: 'decor', k: 'bellows', x: 10, y: 25 },
    { t: 'decor', k: 'coal_cart', x: 40, y: 25 },
    { t: 'decor', k: 'slag_heap', x: 70, y: 25 },
    { t: 'decor', k: 'crucible', x: 92, y: 25 },
    { t: 'light', k: 'glow', x: 25, y: 23, r: 70, c: '#ff6a1a' },
    { t: 'light', k: 'glow', x: 52, y: 23, r: 80, c: '#ff6a1a' },
    { t: 'light', k: 'forge', x: 92, y: 25 },
    { t: 'light', k: 'brazier', x: 34, y: 25 },
    { t: 'enemy', k: 'priest', x: 38, y: 17, face: -1 },
    { t: 'enemy', k: 'lion', x: 44, y: 25, face: -1 },
    { t: 'enemy', k: 'knight', x: 66, y: 25, face: -1, elite: 'furnace_warden' },
    { t: 'enemy', k: 'priest', x: 66, y: 16, face: -1 },
    { t: 'enemy', k: 'brute', x: 88, y: 25, face: -1 },
    { t: 'chest', x: 79, y: 20, id: 'halls_ledge', loot: [{ silver: 180 }, { mat: 'sentinel_steel', n: 2 }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'lore', x: 30, y: 25, id: 'dan317' },
    { t: 'hint', x: 14, w: 8, id: 'h_slag', text: 'Glowing slag burns. Jump the pools.' },
  ];
  return room(b, {
    id: 'furnace_halls', name: 'The Furnace Halls', region: FURNACE, biome: 'furnace', music: 'furnace',
    dark: 0.5, weather: 'embers', map: { x: 19, y: 2.5 }, seed: 557, interior: true,
    spawns: { left: { x: 3, y: 25, face: 1 }, right: { x: 96, y: 25, face: -1 } },
    exits: [
      { x: 0, y: 16, w: 1, h: 9, to: 'processional_way', spawn: 'right' },
      { x: 99, y: 16, w: 1, h: 9, to: 'furnace_mouth', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The Furnace Mouth (the rescue)
function furnaceMouth() {
  const b = new MapBuilder(64, 26);
  b.rect(0, 0, 64, 2);
  b.rect(0, 22, 64, 4);
  b.rect(0, 2, 2, 11).rect(62, 2, 2, 11);
  b.plat(10, 17, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'furnace_wall', x: 32, y: 22, w: 60, h: 20 },
    { t: 'decor', k: 'furnace_mouth', x: 46, y: 22, w: 18, h: 15 },
    { t: 'decor', k: 'chain_hang', x: 20, y: 2, h: 8 },
    { t: 'decor', k: 'bellows', x: 30, y: 22 },
    { t: 'decor', k: 'coal_cart', x: 6, y: 22 },
    { t: 'light', k: 'glow', x: 46, y: 15, r: 140, c: '#ff7a2a' },
    { t: 'light', k: 'forge', x: 38, y: 22 },
    { t: 'trigger', x: 18, y: 14, w: 2, h: 8, id: 'furnace_rescue' },
    { t: 'chest', x: 13, y: 17, id: 'mouth_ledge', loot: [{ silver: 160 }, { mat: 'radiant_core', n: 1 }] },
    { t: 'lore', x: 8, y: 22, id: 'dan318' },
  ];
  return room(b, {
    id: 'furnace_mouth', name: 'The Burning Fiery Furnace', region: FURNACE, biome: 'furnace', music: 'furnace',
    dark: 0.45, weather: 'embers', map: { x: 25.25, y: 2.75 }, seed: 563, interior: true,
    spawns: { left: { x: 3, y: 22, face: 1 }, right: { x: 60, y: 22, face: -1 } },
    exits: [
      { x: 0, y: 13, w: 1, h: 9, to: 'furnace_halls', spawn: 'right' },
      { x: 63, y: 13, w: 1, h: 9, to: 'dura_plain', spawn: 'left', cond: 'captives_freed' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- The Plain of Dura
function duraPlain() {
  const b = new MapBuilder(120, 26);
  b.rect(0, 21, 120, 5);
  b.stairs(18, 21, 3, 3, 1);
  b.rect(27, 18, 10, 3);
  b.plat(42, 15, 8).plat(58, 17, 10);
  b.rect(72, 19, 8, 2);
  b.plat(86, 15, 8);
  b.rect(100, 19, 20, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'brick_ruin', x: 12, y: 21 },
    { t: 'decor', k: 'brick_ruin', x: 76, y: 19, flip: true },
    { t: 'decor', k: 'obelisk', x: 52, y: 21 },
    { t: 'decor', k: 'obelisk', x: 96, y: 21 },
    { t: 'decor', k: 'date_palm', x: 40, y: 21 },
    { t: 'decor', k: 'date_palm', x: 110, y: 19, flip: true },
    { t: 'decor', k: 'kneeling_crowd', x: 64, y: 21, w: 12 },
    { t: 'light', k: 'brazier', x: 30, y: 18 },
    { t: 'light', k: 'brazier', x: 104, y: 19 },
    { t: 'altar', x: 6, y: 21, id: 'dura_plain' },
    { t: 'enemy', k: 'priest', x: 46, y: 15, face: -1 },
    { t: 'enemy', k: 'lion', x: 56, y: 21, face: -1 },
    { t: 'enemy', k: 'knight', x: 70, y: 21, face: -1 },
    { t: 'enemy', k: 'priest', x: 89, y: 15, face: -1 },
    { t: 'enemy', k: 'lion', x: 94, y: 21, face: -1 },
    { t: 'enemy', k: 'brute', x: 108, y: 19, face: -1 },
    { t: 'trigger', x: 64, y: 12, w: 2, h: 9, id: 'herald_horn' },
    { t: 'chest', x: 45, y: 15, id: 'plain_ledge', loot: [{ silver: 200 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 33, y: 18, id: 'dan232' },
  ];
  return room(b, {
    id: 'dura_plain', name: 'The Plain of Dura', region: DURA, biome: 'dura', music: 'dura',
    dark: 0.4, weather: 'dust', map: { x: 29.25, y: 3 }, seed: 571, interior: false,
    spawns: { left: { x: 3, y: 21, face: 1 }, altar: { x: 6, y: 21, face: 1 }, right: { x: 116, y: 19, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'furnace_mouth', spawn: 'right' },
      { x: 119, y: 10, w: 1, h: 9, to: 'image_base', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Before the Image (the boss)
function imageBase() {
  const b = new MapBuilder(72, 30);
  b.rect(0, 26, 72, 4);
  b.rect(0, 0, 2, 17).rect(70, 0, 2, 26);
  b.rect(3, 17, 1, 9, 'G');
  b.plat(14, 21, 7).plat(26, 17, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'image_dais', x: 52, y: 26, w: 26 },
    { t: 'decor', k: 'obelisk', x: 10, y: 26 },
    { t: 'decor', k: 'brick_ruin', x: 36, y: 26 },
    { t: 'light', k: 'brazier', x: 38, y: 26 },
    { t: 'light', k: 'brazier', x: 66, y: 26 },
    { t: 'light', k: 'glow', x: 52, y: 12, r: 140, c: '#ffcf6b' },
    { t: 'boss', k: 'golden_image', x: 52, y: 26 },
    { t: 'trigger', x: 20, y: 17, w: 2, h: 9, id: 'image_start' },
    { t: 'lore', x: 8, y: 26, id: 'dan234' },
  ];
  return room(b, {
    id: 'image_base', name: 'Before the Image of Gold', region: DURA, biome: 'dura', music: '',
    dark: 0.42, weather: 'dust', map: { x: 36.75, y: 2.5 }, seed: 587, interior: false,
    spawns: { left: { x: 5, y: 26, face: 1 }, center: { x: 24, y: 26, face: 1 } },
    exits: [{ x: 0, y: 17, w: 1, h: 9, to: 'dura_plain', spawn: 'right' }],
    ents,
  });
}

export const ROOMS4 = [riverCamp(), babylonGate(), processionalWay(), lionsDen(), furnaceHalls(), furnaceMouth(), duraPlain(), imageBase()];
export const CH4_ROOM_IDS = new Set(ROOMS4.map((r) => r.id));
