// Chapter III — The Valley of Bones. East of Shinar lies the valley of
// Ezekiel's vision, where a locust swarm has stripped the land and grown a
// hive inside the bones of giants. Six rooms from the camp to the brood
// chamber, plus the Trial of the Remnant, an endless proving ground.
// Coordinates are tiles; an entity's y is the row its feet stand on.

import { MapBuilder, type RoomDef, type Exit, type EntDef } from './tiles';

type Spec = Omit<RoomDef, 'rows' | 'w' | 'h' | 'exits'> & { exits: (Exit & { cond?: string })[] };

function room(b: MapBuilder, spec: Spec) {
  return { ...spec, w: b.w, h: b.h, rows: b.rows() };
}

const VALLEY = 'The Valley of Bones';
const HIVE = 'The Hive in the Bones';

// ---------------------------------------------------------------- Camp
function camp() {
  const b = new MapBuilder(60, 22);
  b.rect(0, 18, 60, 4);
  b.rect(0, 0, 2, 18);
  b.rect(2, 17, 7, 1);
  b.plat(40, 14, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'giant_skull', x: 28, y: 18, w: 8 },
    { t: 'decor', k: 'dead_tree', x: 9, y: 18 },
    { t: 'decor', k: 'tent', x: 16, y: 18 },
    { t: 'decor', k: 'tent', x: 33, y: 18, flip: true },
    { t: 'decor', k: 'bedroll', x: 20, y: 18 },
    { t: 'decor', k: 'cart', x: 38, y: 18 },
    { t: 'decor', k: 'anvil', x: 46, y: 18 },
    { t: 'decor', k: 'bone_pile', x: 52, y: 18 },
    { t: 'decor', k: 'cairn', x: 56, y: 18 },
    { t: 'decor', k: 'trial_ring', x: 4, y: 17, w: 4 },
    { t: 'light', k: 'brazier', x: 24.5, y: 18 },
    { t: 'light', k: 'forge', x: 47, y: 18 },
    { t: 'light', k: 'lantern', x: 16, y: 12 },
    { t: 'light', k: 'lantern', x: 33, y: 12 },
    { t: 'altar', x: 6, y: 17, id: 'valley_camp' },
    { t: 'npc', k: 'mara', x: 13, y: 18, face: 1 },
    { t: 'npc', k: 'azriel', x: 22, y: 18, face: 1 },
    { t: 'npc', k: 'tobiah', x: 26, y: 18, face: -1 },
    { t: 'npc', k: 'ilan', x: 40, y: 18, face: -1 },
    { t: 'npc', k: 'dov', x: 44, y: 18, face: 1 },
    { t: 'chest', x: 43, y: 14, id: 'valley_cart', loot: [{ silver: 120 }, { mat: 'sentinel_steel', n: 2 }] },
    { t: 'lore', x: 11, y: 18, id: 'eze371' },
  ];
  return room(b, {
    id: 'valley_camp', name: 'Camp at the Valley\'s Edge', region: VALLEY, biome: 'valley', music: 'valley',
    dark: 0.3, weather: 'dust', map: { x: 0, y: 3 }, seed: 401, interior: false,
    spawns: { start: { x: 22, y: 18, face: 1 }, altar: { x: 6, y: 17, face: 1 }, right: { x: 57, y: 18, face: -1 } },
    exits: [{ x: 59, y: 9, w: 1, h: 9, to: 'bone_road', spawn: 'left' }],
    ents,
  });
}

// ---------------------------------------------------------------- Bone Road
function boneRoad() {
  const b = new MapBuilder(120, 26);
  b.rect(0, 21, 120, 5);
  b.rect(18, 19, 8, 2);
  b.plat(30, 16, 10).plat(44, 13, 8);
  b.rect(58, 18, 10, 3);
  b.clear(74, 21, 6, 2).rect(74, 22, 6, 1, 'w').rect(74, 23, 6, 1);
  b.plat(84, 16, 8).plat(96, 14, 6);
  b.rect(104, 19, 16, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'giant_ribs', x: 34, y: 21, w: 12 },
    { t: 'decor', k: 'giant_ribs', x: 88, y: 21, w: 10 },
    { t: 'decor', k: 'bone_arch', x: 60, y: 18, w: 6 },
    { t: 'decor', k: 'dead_tree', x: 8, y: 21 },
    { t: 'decor', k: 'dead_tree', x: 70, y: 21, flip: true },
    { t: 'decor', k: 'bone_pile', x: 22, y: 19 },
    { t: 'decor', k: 'bone_pile', x: 110, y: 19 },
    { t: 'decor', k: 'cairn', x: 52, y: 21 },
    { t: 'light', k: 'glow', x: 60, y: 14, r: 50, c: '#ffcf8a' },
    { t: 'enemy', k: 'husk', x: 26, y: 21, face: -1 },
    { t: 'enemy', k: 'drone', x: 38, y: 12 },
    { t: 'enemy', k: 'drone', x: 42, y: 11 },
    { t: 'enemy', k: 'soldier', x: 62, y: 18, face: -1 },
    { t: 'enemy', k: 'hound', x: 80, y: 21, face: -1 },
    { t: 'enemy', k: 'drone', x: 90, y: 11 },
    { t: 'enemy', k: 'drone', x: 94, y: 10 },
    { t: 'enemy', k: 'soldier', x: 108, y: 19, face: -1 },
    { t: 'chest', x: 47, y: 13, id: 'rib_cache', loot: [{ silver: 110 }, { mat: 'covenant_fragment', n: 1 }, { mat: 'iron_scrap', n: 3 }] },
    { t: 'lore', x: 54, y: 21, id: 'eze373' },
    { t: 'hint', x: 30, w: 8, id: 'h_drones', text: 'Drones rear back before they swoop. {dodge} through the dive, then cut them down as they climb.' },
  ];
  return room(b, {
    id: 'bone_road', name: 'The Bone Road', region: VALLEY, biome: 'valley', music: 'valley',
    dark: 0.28, weather: 'dust', map: { x: 3.75, y: 2.8 }, seed: 409, interior: false,
    spawns: { left: { x: 2, y: 21, face: 1 }, right: { x: 117, y: 19, face: -1 } },
    exits: [
      { x: 0, y: 12, w: 1, h: 9, to: 'valley_camp', spawn: 'right' },
      { x: 119, y: 10, w: 1, h: 9, to: 'bone_fields', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Bone Fields (elite Brute)
function boneFields() {
  const b = new MapBuilder(110, 30);
  b.rect(0, 26, 110, 4);
  b.rect(0, 18, 8, 8);
  b.plat(12, 22, 8).plat(22, 18, 8).plat(14, 13, 7);
  b.rect(36, 23, 14, 3);
  b.plat(54, 20, 10).plat(66, 16, 8).plat(80, 12, 10);
  b.rect(92, 22, 18, 4);
  const ents: EntDef[] = [
    { t: 'decor', k: 'giant_skull', x: 43, y: 23, w: 9 },
    { t: 'decor', k: 'giant_ribs', x: 70, y: 26, w: 14 },
    { t: 'decor', k: 'bone_arch', x: 96, y: 22, w: 7 },
    { t: 'decor', k: 'dead_tree', x: 30, y: 26 },
    { t: 'decor', k: 'bone_pile', x: 60, y: 26 },
    { t: 'decor', k: 'bone_pile', x: 104, y: 22 },
    { t: 'decor', k: 'cairn', x: 4, y: 18 },
    { t: 'light', k: 'glow', x: 43, y: 19, r: 60, c: '#ffcf8a' },
    { t: 'enemy', k: 'soldier', x: 28, y: 26, face: -1 },
    { t: 'enemy', k: 'drone', x: 34, y: 14 },
    { t: 'enemy', k: 'drone', x: 58, y: 14 },
    { t: 'enemy', k: 'brute', x: 72, y: 26, face: -1, elite: 'bone_colossus' },
    { t: 'enemy', k: 'soldier', x: 86, y: 26, face: -1 },
    { t: 'enemy', k: 'drone', x: 88, y: 8 },
    { t: 'enemy', k: 'soldier', x: 100, y: 22, face: -1 },
    { t: 'chest', x: 16, y: 13, id: 'skull_cache', secret: true, loot: [{ silver: 160 }, { mat: 'radiant_core', n: 1 }] },
    { t: 'chest', x: 84, y: 12, id: 'field_ledge', loot: [{ silver: 120 }, { mat: 'covenant_fragment', n: 2 }] },
    { t: 'lore', x: 33, y: 26, id: 'joel14' },
  ];
  return room(b, {
    id: 'bone_fields', name: 'The Field of Giants', region: VALLEY, biome: 'valley', music: 'valley',
    dark: 0.32, weather: 'dust', map: { x: 11.25, y: 2.4 }, seed: 419, interior: false,
    spawns: { left: { x: 9, y: 18, face: 1 }, right: { x: 107, y: 22, face: -1 } },
    exits: [
      { x: 0, y: 9, w: 1, h: 9, to: 'bone_road', spawn: 'right' },
      { x: 109, y: 13, w: 1, h: 9, to: 'hive_mouth', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Hive Mouth
function hiveMouth() {
  const b = new MapBuilder(72, 26);
  b.rect(0, 0, 72, 2);
  b.rect(0, 22, 72, 4);
  b.rect(0, 2, 2, 12).rect(70, 2, 2, 12);
  b.plat(16, 17, 8).plat(30, 14, 10).plat(48, 17, 8);
  b.clear(38, 22, 6, 2).rect(38, 23, 6, 1, 'w').rect(38, 24, 6, 1);
  const ents: EntDef[] = [
    { t: 'decor', k: 'hive_wall', x: 16, y: 22, w: 20, h: 14 },
    { t: 'decor', k: 'hive_wall', x: 57, y: 22, w: 22, h: 14 },
    { t: 'decor', k: 'resin_pillar', x: 28, y: 22, h: 20 },
    { t: 'decor', k: 'resin_pillar', x: 58, y: 22, h: 20 },
    { t: 'decor', k: 'egg_cluster', x: 22, y: 22 },
    { t: 'decor', k: 'egg_cluster', x: 63, y: 22 },
    { t: 'decor', k: 'glow_pod', x: 20, y: 2 },
    { t: 'decor', k: 'glow_pod', x: 42, y: 2 },
    { t: 'decor', k: 'glow_pod', x: 55, y: 2 },
    { t: 'decor', k: 'chitin_shells', x: 12, y: 22 },
    { t: 'light', k: 'glow', x: 20, y: 5, r: 60, c: '#c8f060' },
    { t: 'light', k: 'glow', x: 42, y: 5, r: 60, c: '#c8f060' },
    { t: 'light', k: 'glow', x: 55, y: 5, r: 60, c: '#c8f060' },
    { t: 'altar', x: 6, y: 22, id: 'hive_mouth' },
    { t: 'enemy', k: 'soldier', x: 24, y: 22, face: -1 },
    { t: 'enemy', k: 'drone', x: 34, y: 9 },
    { t: 'enemy', k: 'drone', x: 37, y: 10 },
    { t: 'enemy', k: 'soldier', x: 52, y: 17, face: -1 },
    { t: 'enemy', k: 'soldier', x: 62, y: 22, face: -1 },
    { t: 'lore', x: 66, y: 22, id: 'prov3027' },
  ];
  return room(b, {
    id: 'hive_mouth', name: 'Mouth of the Hive', region: HIVE, biome: 'hive', music: 'hive',
    dark: 0.5, weather: 'drips', map: { x: 18.25, y: 3.2 }, seed: 431, interior: true,
    spawns: { left: { x: 3, y: 22, face: 1 }, altar: { x: 6, y: 22, face: 1 }, right: { x: 68, y: 22, face: -1 } },
    exits: [
      { x: 0, y: 14, w: 1, h: 8, to: 'bone_fields', spawn: 'right' },
      { x: 71, y: 14, w: 1, h: 8, to: 'hive_depths', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Hive Depths (a descent)
function hiveDepths() {
  const b = new MapBuilder(52, 42);
  b.rect(0, 0, 52, 2);
  b.rect(0, 38, 52, 4);
  b.rect(0, 2, 2, 6).rect(0, 14, 2, 24);
  b.rect(50, 2, 2, 28);
  b.rect(2, 13, 10, 1);
  b.plat(16, 17, 8).plat(28, 21, 8).plat(38, 25, 8);
  b.plat(24, 29, 8).plat(10, 32, 9);
  b.rect(2, 26, 5, 1);
  const ents: EntDef[] = [
    { t: 'decor', k: 'hive_wall', x: 26, y: 38, w: 44, h: 34 },
    { t: 'decor', k: 'resin_pillar', x: 20, y: 38, h: 18 },
    { t: 'decor', k: 'resin_pillar', x: 44, y: 38, h: 12 },
    { t: 'decor', k: 'egg_cluster', x: 30, y: 38 },
    { t: 'decor', k: 'egg_cluster', x: 8, y: 32 },
    { t: 'decor', k: 'glow_pod', x: 14, y: 2 },
    { t: 'decor', k: 'glow_pod', x: 34, y: 2 },
    { t: 'decor', k: 'chitin_shells', x: 40, y: 38 },
    { t: 'light', k: 'glow', x: 14, y: 6, r: 60, c: '#c8f060' },
    { t: 'light', k: 'glow', x: 34, y: 6, r: 60, c: '#c8f060' },
    { t: 'light', k: 'glow', x: 30, y: 34, r: 70, c: '#ff9a3a' },
    { t: 'enemy', k: 'soldier', x: 20, y: 17, face: -1 },
    { t: 'enemy', k: 'drone', x: 34, y: 16 },
    { t: 'enemy', k: 'soldier', x: 42, y: 25, face: -1 },
    { t: 'enemy', k: 'drone', x: 18, y: 26 },
    { t: 'enemy', k: 'soldier', x: 30, y: 38, face: -1 },
    { t: 'chest', x: 4, y: 26, id: 'hive_cache', secret: true, loot: [{ silver: 180 }, { mat: 'covenant_fragment', n: 2 }, { mat: 'radiant_core', n: 1 }] },
    { t: 'lore', x: 14, y: 38, id: 'exo1014' },
  ];
  return room(b, {
    id: 'hive_depths', name: 'The Brood Halls', region: HIVE, biome: 'hive', music: 'hive',
    dark: 0.55, weather: 'drips', map: { x: 22.75, y: 3.2 }, seed: 443, interior: true,
    spawns: { left: { x: 4, y: 13, face: 1 }, right: { x: 47, y: 38, face: -1 } },
    exits: [
      { x: 0, y: 8, w: 1, h: 5, to: 'hive_mouth', spawn: 'right' },
      { x: 51, y: 30, w: 1, h: 8, to: 'brood_chamber', spawn: 'left' },
    ],
    ents,
  });
}

// ---------------------------------------------------------------- Brood Chamber (the Locust King)
function broodChamber() {
  const b = new MapBuilder(66, 26);
  b.rect(0, 0, 66, 2);
  b.rect(0, 22, 66, 4);
  b.rect(0, 2, 2, 12).rect(64, 2, 2, 20);
  b.rect(3, 14, 1, 8, 'G');
  b.plat(14, 16, 7).plat(46, 16, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'hive_wall', x: 33, y: 22, w: 58, h: 20 },
    { t: 'decor', k: 'cocoon', x: 44, y: 22, v: 0, ncond: 'king_hatched' },
    { t: 'decor', k: 'cocoon', x: 44, y: 22, v: 1, cond: 'king_hatched' },
    { t: 'decor', k: 'resin_pillar', x: 10, y: 22, h: 20 },
    { t: 'decor', k: 'resin_pillar', x: 58, y: 22, h: 20 },
    { t: 'decor', k: 'egg_cluster', x: 24, y: 22 },
    { t: 'decor', k: 'egg_cluster', x: 34, y: 22 },
    { t: 'decor', k: 'glow_pod', x: 18, y: 2 },
    { t: 'decor', k: 'glow_pod', x: 50, y: 2 },
    { t: 'light', k: 'glow', x: 44, y: 16, r: 110, c: '#ff4a2a' },
    { t: 'light', k: 'glow', x: 18, y: 6, r: 60, c: '#c8f060' },
    { t: 'light', k: 'glow', x: 50, y: 6, r: 60, c: '#c8f060' },
    { t: 'boss', k: 'locust_king', x: 44, y: 22 },
    { t: 'trigger', x: 18, y: 14, w: 2, h: 8, id: 'brood_start' },
    { t: 'lore', x: 8, y: 22, id: 'joel225' },
  ];
  return room(b, {
    id: 'brood_chamber', name: 'The Brood Chamber', region: HIVE, biome: 'hive', music: '',
    dark: 0.5, weather: 'drips', map: { x: 26, y: 4.6 }, seed: 457, interior: true,
    spawns: { left: { x: 5, y: 22, face: 1 }, center: { x: 26, y: 22, face: 1 } },
    exits: [{ x: 0, y: 6, w: 1, h: 8, to: 'hive_depths', spawn: 'right' }],
    ents,
  });
}

// ---------------------------------------------------------------- Trial of the Remnant (endless waves)
function trialArena() {
  const b = new MapBuilder(56, 22);
  b.rect(0, 0, 56, 2);
  b.rect(0, 18, 56, 4);
  b.rect(0, 2, 2, 10).rect(54, 2, 2, 16);
  b.plat(12, 13, 8).plat(36, 13, 8).plat(24, 9, 8);
  const ents: EntDef[] = [
    { t: 'decor', k: 'trial_ring', x: 28, y: 18, w: 14 },
    { t: 'decor', k: 'trial_pillar', x: 6, y: 18, h: 10 },
    { t: 'decor', k: 'trial_pillar', x: 50, y: 18, h: 10 },
    { t: 'decor', k: 'trial_banner', x: 18, y: 2, h: 6 },
    { t: 'decor', k: 'trial_banner', x: 38, y: 2, h: 6 },
    { t: 'light', k: 'glow', x: 28, y: 14, r: 120, c: '#ffe6a8' },
    { t: 'light', k: 'brazier', x: 6, y: 8 },
    { t: 'light', k: 'brazier', x: 50, y: 8 },
  ];
  return room(b, {
    id: 'trial_arena', name: 'The Trial of the Remnant', region: 'A Proving Ground', biome: 'trial', music: 'trial',
    dark: 0.35, weather: 'motes', map: { x: 0, y: 6.5 }, seed: 467, interior: true,
    spawns: { start: { x: 4, y: 18, face: 1 } },
    exits: [{ x: 0, y: 12, w: 1, h: 6, to: 'valley_camp', spawn: 'altar' }],
    ents,
  });
}

export const ROOMS3 = [camp(), boneRoad(), boneFields(), hiveMouth(), hiveDepths(), broodChamber(), trialArena()];
export const CH3_ROOM_IDS = new Set(ROOMS3.map((r) => r.id));
