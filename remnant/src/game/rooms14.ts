// Chapter XIV — The Day of Gog (Ezekiel 38–39, then 47). Twenty-four rooms in five acts:
//   I   The land of unwalled villages: the Remnant at rest in the hills, the cloud out of the north, the alarm, the
//       flight to the cave of refuge.
//   II  The north parts: up the pass into the camps of the host, the field of bucklers, the ford, the tents of the
//       princes of Meshech and Tubal, the siege lines and the engine of the north.
//   III The great shaking: walls fallen, the steep places thrown down, the rent valley, the field where every man's
//       sword is against his brother, the climb under the cloud, and the mountain of Gog.
//   IV  The valley of Hamongog: seven months of burying, and weapons that burn seven years.
//   V   The river: the threshold of the house, the waters measured to the ankles, knees, loins and a river to swim
//       in, trees on both banks, and the sea made whole.
// Coordinates are tiles; an entity's y is the row its feet stand on. The art is render/env14.ts.

import { MapBuilder, type RoomDef, type Exit, type EntDef, type Biome } from './tiles';

const UNWALLED = 'The Land of Unwalled Villages';
const NORTH = 'The North Parts';
const SHAKING = 'The Great Shaking';
const HAMONGOG = 'The Valley of Hamongog';
const RIVER = 'The Waters from the Threshold';

interface Spec {
  id: string; name: string; region: string; biome: Biome; music: string; seed: number;
  dark?: number; weather?: RoomDef['weather']; interior?: boolean;
  /** Floor rows at the left and right doors. */
  fl: number; fr: number;
  prev?: string; next?: string;
  /** The right-hand door opens only once this flag is set (an arena's fight is won). */
  nextCond?: string;
  map: [number, number];
  spawns?: RoomDef['spawns'];
  ents: EntDef[];
}

function room(b: MapBuilder, s: Spec): RoomDef {
  const exits: Exit[] = [];
  if (s.prev) exits.push({ x: 0, y: s.fl - 9, w: 1, h: 9, to: s.prev, spawn: 'right' });
  if (s.next) exits.push({ x: b.w - 1, y: s.fr - 9, w: 1, h: 9, to: s.next, spawn: 'left', ...(s.nextCond ? { cond: s.nextCond } : {}) });
  return {
    id: s.id, name: s.name, region: s.region, biome: s.biome, music: s.music, seed: s.seed,
    dark: s.dark ?? 0.15, weather: s.weather, interior: !!s.interior, map: { x: s.map[0], y: s.map[1] },
    spawns: { left: { x: 3, y: s.fl, face: 1 }, right: { x: b.w - 4, y: s.fr, face: -1 }, ...s.spawns },
    exits, ents: s.ents, w: b.w, h: b.h, rows: b.rows(),
  };
}

/** A strip of water `deep` tiles deep cut into the floor at row f. */
function pool(b: MapBuilder, x: number, f: number, w: number, deep: number) {
  b.clear(x, f, w, deep).rect(x, f, w, deep, 'w');
}

const SHEPHERD_LOOT = [{ silver: 900 }, { mat: 'radiant_core', n: 3 }, { mat: 'covenant_fragment', n: 3 }];
const HOST_LOOT = [{ silver: 1400 }, { mat: 'radiant_core', n: 4 }, { mat: 'covenant_fragment', n: 4 }];

// ================================================================ Act I · the land of unwalled villages

// ---------------------------------------------------------------- Bethshalom, the hub
function bethshalom() {
  const b = new MapBuilder(96, 24);
  const f = 19;
  b.rect(0, f, 96, 5);
  b.rect(0, 0, 2, f);
  // flat roofs to stand on, and a ladder of terraces up to the threshing floor
  b.plat(14, f - 4, 5).plat(36, f - 4, 5).plat(60, f - 4, 5);
  b.rect(76, f - 2, 20, 2).rect(84, f - 4, 12, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'olive_tree', x: 6, y: f, h: 5 },
    { t: 'decor', k: 'stone_house', x: 14, y: f, w: 5, h: 4 },
    { t: 'decor', k: 'well', x: 27, y: f },
    { t: 'decor', k: 'stone_house', x: 36, y: f, w: 5, h: 4 },
    { t: 'decor', k: 'vine_row', x: 44, y: f, w: 6 },
    { t: 'decor', k: 'stone_house', x: 60, y: f, w: 5, h: 4 },
    { t: 'decor', k: 'sheepfold', x: 66, y: f, w: 8, v: 6 },
    { t: 'decor', k: 'olive_tree', x: 80, y: f - 2, h: 6, flip: true },
    { t: 'decor', k: 'olive_tree', x: 92, y: f - 4, h: 4 },
    { t: 'light', k: 'lantern', x: 25, y: f - 6 },
    { t: 'light', k: 'brazier', x: 52, y: f },
    { t: 'altar', x: 9, y: f, id: 'gog_hub' },
    { t: 'npc', k: 'azriel', x: 30, y: f, face: 1 },
    { t: 'npc', k: 'mara', x: 22, y: f, face: 1 },
    { t: 'npc', k: 'tobiah', x: 47, y: f, face: -1 },
    { t: 'npc', k: 'ilan', x: 33, y: f, face: 1 },
    { t: 'npc', k: 'dov', x: 54, y: f, face: -1 },
    { t: 'npc', k: 'hanan', x: 24, y: f, face: -1 },
    { t: 'npc', k: 'keziah', x: 42, y: f, face: 1 },
    { t: 'npc', k: 'shira', x: 58, y: f, face: -1 },
    { t: 'npc', k: 'tirzah', x: 72, y: f, face: -1 },
    { t: 'npc', k: 'uri', x: 79, y: f - 2, face: -1 },
    { t: 'chest', x: 90, y: f - 4, id: 'threshing_floor', loot: SHEPHERD_LOOT },
    { t: 'lore', x: 86, y: f - 4, id: 'ezk3811' },
  ];
  return room(b, {
    id: 'gog_hub', name: 'Bethshalom', region: UNWALLED, biome: 'unwalled', music: 'sanctuary', seed: 1401,
    dark: 0.05, weather: 'motes', fl: f, fr: f - 4, next: 'olive_terraces', map: [0, 6],
    spawns: { start: { x: 28, y: f, face: 1 }, altar: { x: 9, y: f, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The olive terraces
function oliveTerraces() {
  const b = new MapBuilder(124, 30);
  b.rect(0, 25, 124, 5);
  b.rect(0, 15, 6, 10);
  // terraces stepping down then up the hillside, held by dry-stone walls
  b.rect(6, 21, 22, 4).rect(28, 23, 20, 2);
  b.rect(48, 21, 18, 4).rect(66, 18, 20, 7).rect(86, 15, 20, 10).rect(106, 12, 18, 13);
  b.plat(30, 18, 6).plat(40, 14, 5).plat(56, 13, 6).plat(74, 11, 5).plat(94, 8, 5);
  const ents: EntDef[] = [
    { t: 'decor', k: 'olive_tree', x: 12, y: 21, h: 5 },
    { t: 'decor', k: 'olive_tree', x: 22, y: 21, h: 6, flip: true },
    { t: 'decor', k: 'olive_tree', x: 36, y: 23, h: 5 },
    { t: 'decor', k: 'olive_tree', x: 54, y: 21, h: 7 },
    { t: 'decor', k: 'vine_row', x: 68, y: 18, w: 8 },
    { t: 'decor', k: 'olive_tree', x: 82, y: 18, h: 5, flip: true },
    { t: 'decor', k: 'sheepfold', x: 88, y: 15, w: 10, v: 7 },
    { t: 'decor', k: 'olive_tree', x: 112, y: 12, h: 6 },
    { t: 'light', k: 'glow', x: 96, y: 5, r: 80, c: '#fff0c8' },
    { t: 'enemy', k: 'hound', x: 34, y: 23, face: -1 },
    { t: 'enemy', k: 'hound', x: 58, y: 21, face: -1 },
    { t: 'enemy', k: 'archer', x: 76, y: 18, face: -1 },
    { t: 'enemy', k: 'hound', x: 92, y: 15, face: -1 },
    { t: 'enemy', k: 'archer', x: 110, y: 12, face: -1 },
    { t: 'chest', x: 96, y: 8, id: 'terrace_press', secret: true, loot: SHEPHERD_LOOT },
    { t: 'lore', x: 42, y: 14, id: 'ezk389' },
    { t: 'hint', x: 8, w: 8, id: 'h_outriders', text: 'Outriders in the groves: the host sends its hounds ahead. Strike them before they bring the archers.' },
  ];
  return room(b, {
    id: 'olive_terraces', name: 'The Olive Terraces', region: UNWALLED, biome: 'unwalled', music: 'village', seed: 1402,
    dark: 0.05, weather: 'motes', fl: 15, fr: 12, prev: 'gog_hub', next: 'watch_hill', map: [10, 6],
    spawns: { left: { x: 3, y: 15, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The watchtower hill
function watchHill() {
  const b = new MapBuilder(104, 36);
  b.rect(0, 31, 104, 5);
  b.rect(0, 12, 4, 19);
  // the shoulder of the hill, climbed on ledges, with the tower on its crown
  b.rect(4, 28, 20, 3).rect(24, 25, 14, 6).rect(38, 22, 12, 9).rect(50, 18, 14, 13).rect(64, 14, 40, 17);
  b.plat(28, 19, 6).plat(42, 15, 5).plat(54, 11, 5);
  b.rect(80, 4, 6, 1, 'W');
  const ents: EntDef[] = [
    { t: 'decor', k: 'olive_tree', x: 14, y: 28, h: 5 },
    { t: 'decor', k: 'boundary_stone', x: 34, y: 25 },
    { t: 'decor', k: 'olive_tree', x: 46, y: 22, h: 6, flip: true },
    { t: 'decor', k: 'watch_tower', x: 83, y: 14, h: 10 },
    { t: 'decor', k: 'olive_tree', x: 96, y: 14, h: 5 },
    { t: 'light', k: 'brazier', x: 83, y: 4 },
    { t: 'enemy', k: 'archer', x: 30, y: 25, face: -1 },
    { t: 'enemy', k: 'hound', x: 44, y: 22, face: -1 },
    { t: 'enemy', k: 'knight', x: 58, y: 18, face: -1 },
    { t: 'enemy', k: 'archer', x: 70, y: 14, face: -1 },
    { t: 'enemy', k: 'hound', x: 16, y: 28, face: -1 },
    { t: 'trigger', x: 76, y: 5, w: 3, h: 9, id: 'gog_cloud' },
    { t: 'chest', x: 82, y: 4, id: 'watchman_beacon', secret: true, loot: SHEPHERD_LOOT },
    { t: 'lore', x: 60, y: 18, id: 'ezk3815' },
  ];
  return room(b, {
    id: 'watch_hill', name: 'The Watchtower Hill', region: UNWALLED, biome: 'unwalled', music: 'village', seed: 1403,
    dark: 0.08, weather: 'dust', fl: 12, fr: 14, prev: 'olive_terraces', next: 'alarm_village', map: [20, 5],
    spawns: { left: { x: 2, y: 12, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- Ein Shalom, as the cloud comes
function alarmVillage() {
  const b = new MapBuilder(134, 28);
  const f = 23;
  b.rect(0, f, 134, 5);
  b.rect(0, 14, 3, 9);
  b.rect(3, 14, 6, 9);
  b.plat(18, f - 4, 6).plat(40, f - 4, 6).plat(62, f - 4, 6).plat(92, f - 4, 6).plat(112, f - 4, 6);
  b.plat(28, 13, 5).plat(76, 12, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'stone_house', x: 18, y: f, w: 6, h: 4 },
    { t: 'decor', k: 'well', x: 32, y: f },
    { t: 'decor', k: 'stone_house', x: 40, y: f, w: 6, h: 4 },
    { t: 'decor', k: 'vine_row', x: 50, y: f, w: 8 },
    { t: 'decor', k: 'stone_house', x: 62, y: f, w: 6, h: 4 },
    { t: 'decor', k: 'host_banner', x: 84, y: f },
    { t: 'decor', k: 'stone_house', x: 92, y: f, w: 6, h: 4 },
    { t: 'decor', k: 'sheepfold', x: 100, y: f, w: 8, v: 2 },
    { t: 'decor', k: 'stone_house', x: 112, y: f, w: 6, h: 4 },
    { t: 'decor', k: 'host_banner', x: 126, y: f },
    { t: 'light', k: 'forge', x: 44, y: f - 4 },
    { t: 'light', k: 'forge', x: 96, y: f - 4 },
    { t: 'light', k: 'torch', x: 70, y: f },
    { t: 'enemy', k: 'hound', x: 26, y: f, face: -1 },
    { t: 'enemy', k: 'knight', x: 36, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 43, y: f - 4, face: -1 },
    { t: 'enemy', k: 'brute', x: 56, y: f, face: -1 },
    { t: 'enemy', k: 'knight', x: 72, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 78, y: 12, face: -1 },
    { t: 'enemy', k: 'hound', x: 88, y: f, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 106, y: f, face: -1 },
    { t: 'npc', k: 'gogherald', x: 122, y: f, face: -1, ncond: 'ch14_herald' },
    { t: 'trigger', x: 112, y: f - 9, w: 2, h: 9, id: 'gog_herald' },
    { t: 'chest', x: 30, y: 13, id: 'village_rafters', secret: true, loot: SHEPHERD_LOOT },
    { t: 'lore', x: 66, y: f, id: 'ezk3816' },
    { t: 'hint', x: 6, w: 8, id: 'h_alarm', text: 'The host is in the village. Fight through to the far side; the herald of Gog waits there.' },
  ];
  return room(b, {
    id: 'alarm_village', name: 'Ein Shalom', region: UNWALLED, biome: 'unwalled', music: 'tower', seed: 1404,
    dark: 0.12, weather: 'ash', fl: 14, fr: f, prev: 'watch_hill', next: 'vineyard_road', map: [30, 5],
    spawns: { left: { x: 5, y: 14, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The vineyard road
function vineyardRoad() {
  const b = new MapBuilder(140, 28);
  const f = 23;
  b.rect(0, f, 140, 5);
  // the road dips through two dry wadis lined with stakes the host drove in
  b.clear(30, f, 10, 3).rect(30, f + 2, 10, 1, '^');
  b.clear(84, f, 12, 3).rect(84, f + 2, 12, 1, '^');
  b.plat(31, f - 4, 3).plat(36, f - 6, 3).plat(86, f - 4, 3).plat(91, f - 6, 3);
  b.rect(52, f - 3, 16, 3).rect(56, f - 6, 8, 3);
  b.rect(110, f - 4, 30, 4);
  b.plat(104, 12, 6).plat(118, 9, 5);
  const ents: EntDef[] = [
    { t: 'decor', k: 'vine_row', x: 6, y: f, w: 12 },
    { t: 'decor', k: 'vine_row', x: 42, y: f, w: 8 },
    { t: 'decor', k: 'olive_tree', x: 60, y: f - 6, h: 6 },
    { t: 'decor', k: 'vine_row', x: 70, y: f, w: 12 },
    { t: 'decor', k: 'host_banner', x: 100, y: f },
    { t: 'decor', k: 'spear_cairn', x: 114, y: f - 4 },
    { t: 'decor', k: 'olive_tree', x: 130, y: f - 4, h: 5, flip: true },
    { t: 'enemy', k: 'knight', x: 20, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 38, y: f - 6, face: -1 },
    { t: 'enemy', k: 'hound', x: 46, y: f, face: -1 },
    { t: 'enemy', k: 'brute', x: 60, y: f - 6, face: -1 },
    { t: 'enemy', k: 'knight', x: 76, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 93, y: f - 6, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 102, y: f, face: -1 },
    { t: 'enemy', k: 'knight', x: 120, y: f - 4, face: -1 },
    { t: 'enemy', k: 'hound', x: 126, y: f - 4, face: -1 },
    { t: 'chest', x: 120, y: 9, id: 'vintner_store', secret: true, loot: SHEPHERD_LOOT },
    { t: 'lore', x: 64, y: f - 6, id: 'ezk3819' },
  ];
  return room(b, {
    id: 'vineyard_road', name: 'The Vineyard Road', region: UNWALLED, biome: 'unwalled', music: 'tower', seed: 1405,
    dark: 0.12, weather: 'ash', fl: f, fr: f - 4, prev: 'alarm_village', next: 'refuge_cave', map: [42, 5],
    ents,
  });
}

// ---------------------------------------------------------------- The cave of refuge
function refugeCave() {
  const b = new MapBuilder(78, 22);
  const f = 18;
  b.rect(0, f, 78, 4);
  b.rect(0, 0, 78, 3);
  b.rect(0, 3, 2, 6).rect(76, 3, 2, 6);
  b.plat(20, 13, 6).plat(48, 12, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'sheepfold', x: 3, y: f, w: 6, v: 4 },
    { t: 'decor', k: 'well', x: 19, y: f },
    { t: 'decor', k: 'vine_row', x: 26, y: f, w: 3 },
    { t: 'decor', k: 'sheepfold', x: 64, y: f, w: 10, v: 6 },
    { t: 'decor', k: 'boundary_stone', x: 47, y: f },
    { t: 'light', k: 'brazier', x: 16, y: f },
    { t: 'light', k: 'candles', x: 30, y: f },
    { t: 'light', k: 'lantern', x: 50, y: 8 },
    { t: 'light', k: 'brazier', x: 62, y: f },
    { t: 'altar', x: 10, y: f, id: 'refuge_cave' },
    { t: 'npc', k: 'mara', x: 24, y: f, face: 1 },
    { t: 'npc', k: 'azriel', x: 40, y: f, face: -1 },
    { t: 'npc', k: 'tobiah', x: 34, y: f, face: 1 },
    { t: 'npc', k: 'ilan', x: 52, y: f, face: -1 },
    { t: 'npc', k: 'dov', x: 58, y: f, face: -1 },
    { t: 'npc', k: 'micaiah', x: 44, y: f, face: 1 },
    { t: 'chest', x: 51, y: 12, id: 'refuge_cache', secret: true, loot: SHEPHERD_LOOT },
  ];
  return room(b, {
    id: 'refuge_cave', name: 'The Cave of Refuge', region: UNWALLED, biome: 'unwalled', music: 'rest', seed: 1406,
    dark: 0.4, weather: 'drips', interior: true, fl: f, fr: f, prev: 'vineyard_road', next: 'north_pass', map: [56, 5],
    spawns: { altar: { x: 10, y: f, face: 1 } },
    ents,
  });
}

// ================================================================ Act II · the north parts

// ---------------------------------------------------------------- The pass of the north
function northPass() {
  const b = new MapBuilder(132, 34);
  b.rect(0, 29, 132, 5);
  b.rect(0, 0, 132, 2);
  // a gorge climbing north, its sides cut into ledges the host's archers hold
  b.rect(16, 26, 14, 3).rect(30, 23, 12, 6).rect(42, 20, 16, 9).rect(58, 17, 10, 12);
  b.rect(68, 22, 14, 7).rect(82, 19, 16, 10).rect(98, 15, 34, 14);
  b.plat(34, 15, 6).plat(48, 12, 6).plat(62, 10, 5).plat(84, 11, 6).plat(102, 8, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'boundary_stone', x: 10, y: 29 },
    { t: 'decor', k: 'host_banner', x: 46, y: 20 },
    { t: 'decor', k: 'spear_cairn', x: 74, y: 22 },
    { t: 'decor', k: 'host_banner', x: 104, y: 15 },
    { t: 'decor', k: 'siege_tower', x: 122, y: 15, h: 9, v: 0 },
    { t: 'light', k: 'brazier', x: 90, y: 19 },
    { t: 'enemy', k: 'knight', x: 22, y: 26, face: -1 },
    { t: 'enemy', k: 'archer', x: 36, y: 15, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 50, y: 20, face: -1 },
    { t: 'enemy', k: 'archer', x: 64, y: 10, face: -1 },
    { t: 'enemy', k: 'brute', x: 76, y: 22, face: -1 },
    { t: 'enemy', k: 'knight', x: 90, y: 19, face: -1 },
    { t: 'enemy', k: 'archer', x: 104, y: 8, face: -1 },
    { t: 'enemy', k: 'lion', x: 114, y: 15, face: -1 },
    { t: 'chest', x: 64, y: 10, id: 'pass_eyrie', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 86, y: 11, id: 'ezk3820' },
  ];
  return room(b, {
    id: 'north_pass', name: 'The Pass of the North', region: NORTH, biome: 'host', music: 'dura', seed: 1407,
    dark: 0.2, weather: 'dust', fl: 29, fr: 15, prev: 'refuge_cave', next: 'host_camp', map: [66, 4],
    ents,
  });
}

// ---------------------------------------------------------------- The camps of the host
function hostCamp() {
  const b = new MapBuilder(156, 28);
  const f = 23;
  b.rect(0, f, 156, 5);
  b.rect(24, f - 3, 10, 3).rect(60, f - 4, 14, 4).rect(104, f - 3, 12, 3);
  b.plat(36, 15, 6).plat(50, 12, 6).plat(78, 14, 6).plat(92, 10, 6).plat(120, 13, 6).plat(136, 9, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'host_banner', x: 8, y: f },
    { t: 'decor', k: 'shield_wall', x: 14, y: f, w: 6 },
    { t: 'decor', k: 'siege_tower', x: 44, y: f, h: 10 },
    { t: 'decor', k: 'host_banner', x: 66, y: f - 4 },
    { t: 'decor', k: 'spear_cairn', x: 84, y: f },
    { t: 'decor', k: 'siege_tower', x: 98, y: f, h: 8, v: 1 },
    { t: 'decor', k: 'host_banner', x: 110, y: f - 3 },
    { t: 'decor', k: 'shield_wall', x: 128, y: f, w: 8 },
    { t: 'decor', k: 'host_banner', x: 150, y: f },
    { t: 'light', k: 'brazier', x: 30, y: f - 3 },
    { t: 'light', k: 'brazier', x: 72, y: f - 4 },
    { t: 'light', k: 'brazier', x: 112, y: f - 3 },
    { t: 'light', k: 'forge', x: 140, y: f },
    { t: 'enemy', k: 'knight', x: 18, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 28, y: f - 3, face: -1 },
    { t: 'enemy', k: 'hound', x: 40, y: f, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 54, y: f, face: -1 },
    { t: 'enemy', k: 'knight', x: 64, y: f - 4, face: -1 },
    { t: 'enemy', k: 'archer', x: 94, y: 10, face: -1 },
    { t: 'enemy', k: 'brute', x: 88, y: f, face: -1 },
    { t: 'enemy', k: 'lion', x: 108, y: f - 3, face: -1 },
    { t: 'enemy', k: 'knight', x: 124, y: f, face: -1 },
    { t: 'enemy', k: 'priest', x: 138, y: 9, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 144, y: f, face: -1 },
    { t: 'chest', x: 52, y: 12, id: 'paymaster_chest', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 116, y: f, id: 'ezk3821' },
    { t: 'hint', x: 4, w: 8, id: 'h_host', text: 'The host of Gog: horsemen of Persia, Cush and Put, Gomer and Togarmah. Break their line one rank at a time.' },
  ];
  return room(b, {
    id: 'host_camp', name: 'The Camps of the Host', region: NORTH, biome: 'host', music: 'dura', seed: 1408,
    dark: 0.22, weather: 'dust', fl: f, fr: f, prev: 'north_pass', next: 'shield_field', map: [80, 4],
    ents,
  });
}

// ---------------------------------------------------------------- The field of bucklers
function shieldField() {
  const b = new MapBuilder(124, 28);
  const f = 23;
  b.rect(0, f, 124, 5);
  // rows of shield walls: low ridges to climb over while their bearers hold them
  for (const x of [18, 42, 66, 90]) b.rect(x, f - 2, 6, 2);
  b.plat(28, 16, 6).plat(52, 14, 6).plat(76, 16, 6).plat(100, 13, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'shield_wall', x: 18, y: f - 2, w: 6 },
    { t: 'decor', k: 'shield_wall', x: 42, y: f - 2, w: 6 },
    { t: 'decor', k: 'shield_wall', x: 66, y: f - 2, w: 6 },
    { t: 'decor', k: 'shield_wall', x: 90, y: f - 2, w: 6 },
    { t: 'decor', k: 'host_banner', x: 34, y: f },
    { t: 'decor', k: 'host_banner', x: 82, y: f },
    { t: 'decor', k: 'spear_cairn', x: 112, y: f },
    { t: 'enemy', k: 'bulwark', x: 26, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 30, y: 16, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 50, y: f, face: -1 },
    { t: 'enemy', k: 'knight', x: 58, y: f, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 74, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 78, y: 16, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 98, y: f, face: -1, elite: 'buckler_captain' },
    { t: 'enemy', k: 'knight', x: 106, y: f, face: -1 },
    { t: 'chest', x: 102, y: 13, id: 'buckler_hoard', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 54, y: 14, id: 'ezk399' },
  ];
  return room(b, {
    id: 'shield_field', name: 'The Field of Bucklers', region: NORTH, biome: 'host', music: 'duel', seed: 1409,
    dark: 0.22, weather: 'dust', fl: f, fr: f, prev: 'host_camp', next: 'ford_of_host', map: [92, 4],
    ents,
  });
}

// ---------------------------------------------------------------- The ford of the host
function fordOfHost() {
  const b = new MapBuilder(134, 30);
  const f = 24;
  b.rect(0, f, 134, 6);
  // a wide ford, shallow at the edges and deep enough to swim in mid-stream
  pool(b, 30, f, 14, 1);
  pool(b, 44, f, 30, 4);
  pool(b, 74, f, 14, 1);
  b.rect(52, f - 3, 6, 1, 'W').rect(64, f - 5, 6, 1, 'W');
  b.plat(96, 16, 6).plat(110, 13, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'host_banner', x: 10, y: f },
    { t: 'decor', k: 'olive_tree', x: 22, y: f, h: 5 },
    { t: 'decor', k: 'siege_tower', x: 94, y: f, h: 8, v: 1 },
    { t: 'decor', k: 'host_banner', x: 124, y: f },
    { t: 'decor', k: 'spear_cairn', x: 112, y: f },
    { t: 'decor', k: 'shield_wall', x: 26, y: f, w: 3 },
    { t: 'light', k: 'brazier', x: 16, y: f },
    { t: 'altar', x: 6, y: f, id: 'ford_of_host' },
    { t: 'current', x: 44, y: f, w: 30, h: 4, vx: 30, vy: 0 },
    { t: 'air', x: 59, y: f + 2, r: 2 },
    { t: 'enemy', k: 'archer', x: 54, y: f - 3, face: -1 },
    { t: 'enemy', k: 'eel', x: 52, y: f + 2, face: -1 },
    { t: 'enemy', k: 'eel', x: 66, y: f + 3, face: 1 },
    { t: 'enemy', k: 'knight', x: 84, y: f, face: -1 },
    { t: 'enemy', k: 'lion', x: 100, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 112, y: 13, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 120, y: f, face: -1 },
    { t: 'chest', x: 60, y: f + 3, id: 'ford_wreck', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 98, y: 16, id: 'ezk3911' },
  ];
  return room(b, {
    id: 'ford_of_host', name: 'The Ford of the Host', region: NORTH, biome: 'host', music: 'riverbed', seed: 1410,
    dark: 0.25, weather: 'dust', fl: f, fr: f, prev: 'shield_field', next: 'princes_tents', map: [104, 4],
    spawns: { altar: { x: 6, y: f, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The tents of Meshech and Tubal (arena)
function princesTents() {
  const b = new MapBuilder(84, 30);
  const f = 26;
  b.rect(0, f, 84, 4);
  b.rect(0, 0, 2, f - 9).rect(82, 0, 2, f - 9);
  b.rect(4, f - 9, 1, 9, 'G');
  b.plat(16, f - 5, 7).plat(36, f - 9, 10).plat(60, f - 5, 7);
  const ents: EntDef[] = [
    { t: 'decor', k: 'host_banner', x: 12, y: f },
    { t: 'decor', k: 'host_banner', x: 30, y: f },
    { t: 'decor', k: 'host_banner', x: 54, y: f },
    { t: 'decor', k: 'host_banner', x: 72, y: f },
    { t: 'decor', k: 'shield_wall', x: 76, y: f, w: 5 },
    { t: 'light', k: 'brazier', x: 22, y: f },
    { t: 'light', k: 'brazier', x: 62, y: f },
    { t: 'boss', k: 'meshech_tubal', x: 60, y: f },
    { t: 'trigger', x: 9, y: f - 9, w: 2, h: 9, id: 'princes_start' },
  ];
  return room(b, {
    id: 'princes_tents', name: 'The Tents of Meshech and Tubal', region: NORTH, biome: 'host', music: '', seed: 1411,
    dark: 0.3, weather: 'embers', fl: f, fr: f, prev: 'ford_of_host', next: 'siege_lines', nextCond: 'ch14_princes_done', map: [114, 3],
    spawns: { center: { x: 42, y: f, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The siege lines
function siegeLines() {
  const b = new MapBuilder(144, 30);
  const f = 25;
  b.rect(0, f, 144, 5);
  // trenches dug by the host, earthworks between, and towers to climb
  b.clear(24, f, 10, 3).rect(24, f + 2, 10, 1, '^');
  b.clear(70, f, 12, 3).rect(70, f + 2, 12, 1, '^');
  b.plat(25, f - 4, 3).plat(30, f - 5, 3).plat(72, f - 4, 3).plat(77, f - 5, 3);
  b.rect(40, f - 4, 20, 4).rect(90, f - 6, 22, 6);
  b.rect(46, f - 12, 1, 8, 'W').rect(46, f - 12, 8, 1, 'W');
  b.plat(98, 12, 6).plat(116, 15, 6).plat(128, 11, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'siege_tower', x: 14, y: f, h: 10 },
    { t: 'decor', k: 'host_banner', x: 44, y: f - 4 },
    { t: 'decor', k: 'siege_tower', x: 58, y: f - 4, h: 11, v: 1 },
    { t: 'decor', k: 'spear_cairn', x: 86, y: f },
    { t: 'decor', k: 'siege_tower', x: 104, y: f - 6, h: 9 },
    { t: 'decor', k: 'host_banner', x: 120, y: f },
    { t: 'decor', k: 'broken_wall', x: 130, y: f, w: 10 },
    { t: 'light', k: 'forge', x: 50, y: f - 4 },
    { t: 'light', k: 'brazier', x: 96, y: f - 6 },
    { t: 'enemy', k: 'knight', x: 16, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 48, y: f - 12, face: -1 },
    { t: 'enemy', k: 'brute', x: 52, y: f - 4, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 64, y: f, face: -1 },
    { t: 'enemy', k: 'golem', x: 88, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 100, y: 12, face: -1 },
    { t: 'enemy', k: 'knight', x: 108, y: f - 6, face: -1 },
    { t: 'enemy', k: 'priest', x: 118, y: 15, face: -1 },
    { t: 'enemy', k: 'lion', x: 132, y: f, face: -1 },
    { t: 'chest', x: 130, y: 11, id: 'sapper_cache', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 92, y: f - 6, id: 'ezk3912' },
  ];
  return room(b, {
    id: 'siege_lines', name: 'The Siege Lines', region: NORTH, biome: 'host', music: 'tower', seed: 1412,
    dark: 0.25, weather: 'embers', fl: f, fr: f, prev: 'princes_tents', next: 'engine_hill', map: [124, 3],
    ents,
  });
}

// ---------------------------------------------------------------- The engine of the north (arena)
function engineHill() {
  const b = new MapBuilder(96, 32);
  const f = 27;
  b.rect(0, f, 96, 5);
  b.rect(0, 0, 2, f - 9).rect(94, 0, 2, f - 9);
  b.rect(4, f - 9, 1, 9, 'G');
  b.plat(18, f - 6, 8).plat(40, f - 10, 8).plat(62, f - 6, 8).plat(80, f - 12, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'siege_tower', x: 30, y: f, h: 12, v: 1 },
    { t: 'decor', k: 'siege_tower', x: 72, y: f, h: 14 },
    { t: 'decor', k: 'host_banner', x: 52, y: f },
    { t: 'decor', k: 'spear_cairn', x: 88, y: f },
    { t: 'light', k: 'forge', x: 50, y: f },
    { t: 'boss', k: 'siege_colossus', x: 70, y: f },
    { t: 'trigger', x: 9, y: f - 9, w: 2, h: 9, id: 'engine_start' },
  ];
  return room(b, {
    id: 'engine_hill', name: 'The Engine of the North', region: NORTH, biome: 'host', music: '', seed: 1413,
    dark: 0.3, weather: 'embers', fl: f, fr: f, prev: 'siege_lines', next: 'fallen_walls', nextCond: 'ch14_engine_done', map: [134, 3],
    spawns: { center: { x: 48, y: f, face: 1 } },
    ents,
  });
}

// ================================================================ Act III · the great shaking

// ---------------------------------------------------------------- The fallen walls
function fallenWalls() {
  const b = new MapBuilder(132, 30);
  const f = 25;
  b.rect(0, f, 132, 5);
  // the ground heaved: broken shelves of stone, and paving that gives way under a heavy step
  b.rect(14, f - 3, 12, 3).rect(26, f - 6, 8, 6).rect(48, f - 2, 10, 2);
  b.rect(58, f, 16, 1, 'X');
  b.rect(80, f - 5, 12, 5).rect(92, f - 9, 8, 9).rect(110, f - 4, 22, 4);
  b.plat(38, 14, 6).plat(64, 16, 5).plat(102, 10, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'broken_wall', x: 4, y: f, w: 8 },
    { t: 'decor', k: 'boundary_stone', x: 36, y: f },
    { t: 'decor', k: 'broken_wall', x: 40, y: f, w: 6 },
    { t: 'decor', k: 'siege_tower', x: 76, y: f, h: 8, v: 1 },
    { t: 'decor', k: 'broken_wall', x: 112, y: f - 4, w: 12 },
    { t: 'light', k: 'glow', x: 66, y: f, r: 90, c: '#ff7a3a' },
    { t: 'enemy', k: 'knight', x: 20, y: f - 3, face: -1 },
    { t: 'enemy', k: 'golem', x: 44, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 66, y: 16, face: -1 },
    { t: 'enemy', k: 'brute', x: 84, y: f - 5, face: -1 },
    { t: 'enemy', k: 'gale', x: 100, y: 6, face: -1 },
    { t: 'enemy', k: 'knight', x: 118, y: f - 4, face: -1 },
    { t: 'chest', x: 104, y: 10, id: 'shaken_vault', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 30, y: f - 6, id: 'ezk3929' },
    { t: 'hint', x: 52, w: 8, id: 'h_collapse', text: 'The shaking has broken the paving here. It gives way under you: keep moving.' },
  ];
  return room(b, {
    id: 'fallen_walls', name: 'The Fallen Walls', region: SHAKING, biome: 'shaking', music: 'cinders', seed: 1414,
    dark: 0.3, weather: 'ash', fl: f, fr: f - 4, prev: 'engine_hill', next: 'steep_places', map: [144, 4],
    ents,
  });
}

// ---------------------------------------------------------------- The steep places
function steepPlaces() {
  const b = new MapBuilder(100, 44);
  b.rect(0, 40, 100, 4);
  // a slope fallen away into a gulf: up broken ledges from the scree to the lip of what is left
  b.rect(0, 30, 10, 10);
  b.rect(16, 36, 10, 4).rect(30, 32, 8, 8).rect(44, 28, 6, 12);
  b.plat(54, 24, 6).plat(40, 20, 6).plat(26, 17, 6).plat(42, 12, 6).plat(58, 9, 6);
  b.rect(70, 12, 30, 28);
  b.rect(60, 36, 8, 1, 'X').rect(64, 30, 6, 1, 'X');
  const ents: EntDef[] = [
    { t: 'decor', k: 'broken_wall', x: 16, y: 36, w: 8 },
    { t: 'decor', k: 'boundary_stone', x: 34, y: 32 },
    { t: 'decor', k: 'broken_wall', x: 78, y: 12, w: 14 },
    { t: 'decor', k: 'spear_cairn', x: 46, y: 28 },
    { t: 'decor', k: 'broken_wall', x: 2, y: 30, w: 6 },
    { t: 'decor', k: 'host_banner', x: 94, y: 12 },
    { t: 'light', k: 'glow', x: 30, y: 38, r: 110, c: '#ff6a2a' },
    { t: 'enemy', k: 'golem', x: 22, y: 36, face: 1 },
    { t: 'enemy', k: 'gale', x: 36, y: 14, face: 1 },
    { t: 'enemy', k: 'archer', x: 46, y: 28, face: -1 },
    { t: 'enemy', k: 'gale', x: 60, y: 6, face: -1 },
    { t: 'enemy', k: 'knight', x: 86, y: 12, face: -1 },
    { t: 'chest', x: 28, y: 17, id: 'scree_cache', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 60, y: 9, id: 'ezk473' },
  ];
  return room(b, {
    id: 'steep_places', name: 'The Steep Places', region: SHAKING, biome: 'shaking', music: 'cinders', seed: 1415,
    dark: 0.32, weather: 'ash', fl: 30, fr: 12, prev: 'fallen_walls', next: 'rent_valley', map: [154, 3],
    ents,
  });
}

// ---------------------------------------------------------------- The rent valley
function rentValley() {
  const b = new MapBuilder(144, 30);
  const f = 25;
  b.rect(0, f, 144, 5);
  b.rect(0, 16, 6, 9);
  // fissures still opening, glowing at the bottom
  for (const [x, w] of [[22, 6], [48, 8], [80, 6], [108, 8]] as const) b.clear(x, f, w, 3).rect(x, f + 2, w, 1, '^');
  b.plat(24, 19, 3).plat(50, 19, 4).plat(82, 19, 3).plat(110, 19, 4);
  b.rect(60, f - 5, 12, 5).rect(92, f - 3, 10, 3);
  b.plat(64, 13, 6).plat(124, 14, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'boundary_stone', x: 12, y: f },
    { t: 'decor', k: 'broken_wall', x: 34, y: f, w: 8 },
    { t: 'decor', k: 'broken_wall', x: 118, y: f, w: 10 },
    { t: 'decor', k: 'boundary_stone', x: 62, y: f - 5 },
    { t: 'decor', k: 'spear_cairn', x: 96, y: f - 3 },
    { t: 'decor', k: 'host_banner', x: 70, y: f - 5 },
    { t: 'light', k: 'glow', x: 25, y: f + 2, r: 60, c: '#ff6a2a' },
    { t: 'light', k: 'glow', x: 52, y: f + 2, r: 60, c: '#ff6a2a' },
    { t: 'light', k: 'glow', x: 83, y: f + 2, r: 60, c: '#ff6a2a' },
    { t: 'light', k: 'glow', x: 112, y: f + 2, r: 60, c: '#ff6a2a' },
    { t: 'enemy', k: 'golem', x: 16, y: f, face: -1 },
    { t: 'enemy', k: 'knight', x: 40, y: f, face: -1 },
    { t: 'enemy', k: 'gale', x: 56, y: 12, face: -1 },
    { t: 'enemy', k: 'brute', x: 66, y: f - 5, face: -1 },
    { t: 'enemy', k: 'golem', x: 74, y: f, face: -1 },
    { t: 'enemy', k: 'archer', x: 96, y: f - 3, face: -1 },
    { t: 'enemy', k: 'golem', x: 104, y: f, face: -1, elite: 'rent_golem' },
    { t: 'enemy', k: 'gale', x: 126, y: 10, face: -1 },
    { t: 'chest', x: 66, y: 13, id: 'fissure_hoard', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 126, y: 14, id: 'ezk474' },
  ];
  return room(b, {
    id: 'rent_valley', name: 'The Rent Valley', region: SHAKING, biome: 'shaking', music: 'storm', seed: 1416,
    dark: 0.35, weather: 'ash', fl: 16, fr: f, prev: 'steep_places', next: 'brothers_field', map: [164, 4],
    ents,
  });
}

// ---------------------------------------------------------------- Every man's sword against his brother
function brothersField() {
  const b = new MapBuilder(128, 28);
  const f = 23;
  b.rect(0, f, 128, 5);
  b.rect(30, f - 3, 14, 3).rect(80, f - 3, 14, 3);
  b.plat(52, 15, 8).plat(104, 14, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'broken_wall', x: 8, y: f, w: 6 },
    { t: 'decor', k: 'host_banner', x: 24, y: f },
    { t: 'decor', k: 'spear_cairn', x: 48, y: f },
    { t: 'decor', k: 'host_banner', x: 70, y: f },
    { t: 'decor', k: 'shield_wall', x: 96, y: f, w: 6 },
    { t: 'decor', k: 'host_banner', x: 118, y: f },
    { t: 'light', k: 'brazier', x: 14, y: f },
    { t: 'altar', x: 6, y: f, id: 'brothers_field' },
    { t: 'enemy', k: 'knight', x: 36, y: f - 3, face: -1 },
    { t: 'enemy', k: 'knight', x: 42, y: f - 3, face: 1 },
    { t: 'enemy', k: 'bulwark', x: 58, y: f, face: -1 },
    { t: 'enemy', k: 'lion', x: 64, y: f, face: 1 },
    { t: 'enemy', k: 'archer', x: 56, y: 15, face: -1 },
    { t: 'enemy', k: 'brute', x: 86, y: f - 3, face: -1 },
    { t: 'enemy', k: 'knight', x: 90, y: f - 3, face: 1 },
    { t: 'enemy', k: 'priest', x: 106, y: 14, face: -1 },
    { t: 'enemy', k: 'knight', x: 112, y: f, face: -1 },
    { t: 'chest', x: 106, y: 14, id: 'brothers_cache', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 54, y: 15, id: 'ezk475' },
  ];
  return room(b, {
    id: 'brothers_field', name: 'The Field of Brothers', region: SHAKING, biome: 'shaking', music: 'storm', seed: 1417,
    dark: 0.35, weather: 'ash', fl: f, fr: f, prev: 'rent_valley', next: 'gog_ascent', map: [176, 4],
    spawns: { altar: { x: 6, y: f, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The ascent under the cloud
function gogAscent() {
  const b = new MapBuilder(116, 40);
  b.rect(0, 35, 116, 5);
  // switchbacks up the mountain of Gog, the cloud closing over them
  b.rect(14, 32, 16, 3).rect(30, 28, 14, 7).rect(44, 24, 12, 11);
  b.plat(58, 21, 6).plat(46, 17, 6).plat(32, 14, 6).plat(48, 10, 6);
  b.rect(62, 10, 54, 25);
  b.rect(70, 9, 1, 1, '^').rect(84, 9, 2, 1, '^');
  b.plat(90, 5, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'host_banner', x: 20, y: 32 },
    { t: 'decor', k: 'broken_wall', x: 34, y: 28, w: 6 },
    { t: 'decor', k: 'host_banner', x: 76, y: 10 },
    { t: 'decor', k: 'spear_cairn', x: 104, y: 10 },
    { t: 'decor', k: 'broken_wall', x: 4, y: 35, w: 8 },
    { t: 'decor', k: 'host_banner', x: 98, y: 10 },
    { t: 'light', k: 'brazier', x: 66, y: 10 },
    { t: 'enemy', k: 'knight', x: 22, y: 32, face: -1 },
    { t: 'enemy', k: 'gale', x: 40, y: 12, face: -1 },
    { t: 'enemy', k: 'golem', x: 50, y: 24, face: -1 },
    { t: 'enemy', k: 'archer', x: 34, y: 14, face: 1 },
    { t: 'enemy', k: 'gale', x: 60, y: 6, face: -1 },
    { t: 'enemy', k: 'knight', x: 80, y: 10, face: -1 },
    { t: 'enemy', k: 'bulwark', x: 96, y: 10, face: -1 },
    { t: 'enemy', k: 'lion', x: 106, y: 10, face: -1 },
    { t: 'chest', x: 92, y: 5, id: 'summit_cache', secret: true, loot: HOST_LOOT },
  ];
  return room(b, {
    id: 'gog_ascent', name: 'Under the Cloud', region: SHAKING, biome: 'shaking', music: 'storm', seed: 1418,
    dark: 0.5, weather: 'ash', fl: 35, fr: 10, prev: 'brothers_field', next: 'gog_mountain', map: [186, 3],
    ents,
  });
}

// ---------------------------------------------------------------- The mountain of Gog (arena)
function gogMountain() {
  const b = new MapBuilder(104, 32);
  const f = 27;
  b.rect(0, f, 104, 5);
  b.rect(0, 0, 2, f - 9).rect(102, 0, 2, f - 9);
  b.rect(4, f - 9, 1, 9, 'G');
  b.plat(18, f - 6, 8).plat(36, f - 11, 8).plat(58, f - 11, 8).plat(78, f - 6, 8);
  const ents: EntDef[] = [
    { t: 'decor', k: 'host_banner', x: 14, y: f },
    { t: 'decor', k: 'broken_wall', x: 26, y: f, w: 6 },
    { t: 'decor', k: 'host_banner', x: 50, y: f },
    { t: 'decor', k: 'broken_wall', x: 70, y: f, w: 6 },
    { t: 'decor', k: 'host_banner', x: 92, y: f },
    { t: 'decor', k: 'hail_fall', x: 6, y: f, w: 94, h: 26 },
    { t: 'boss', k: 'gog_prince', x: 76, y: f },
    { t: 'light', k: 'brazier', x: 20, y: f },
    { t: 'light', k: 'brazier', x: 84, y: f },
    { t: 'trigger', x: 9, y: f - 9, w: 2, h: 9, id: 'gog_start' },
  ];
  return room(b, {
    id: 'gog_mountain', name: 'The Mountain of Gog', region: SHAKING, biome: 'shaking', music: '', seed: 1419,
    dark: 0.4, weather: 'embers', fl: f, fr: f, prev: 'gog_ascent', next: 'hamongog', nextCond: 'ch14_gog_done', map: [198, 2],
    spawns: { center: { x: 52, y: f, face: 1 } },
    ents,
  });
}

// ================================================================ Act IV · the valley of Hamongog

function hamongog() {
  const b = new MapBuilder(128, 28);
  const f = 23;
  b.rect(0, f, 128, 5);
  b.rect(40, f - 3, 16, 3).rect(86, f - 2, 12, 2);
  b.plat(60, 15, 8).plat(104, 14, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'spear_cairn', x: 12, y: f },
    { t: 'decor', k: 'grave_marker', x: 22, y: f },
    { t: 'decor', k: 'grave_marker', x: 26, y: f, v: 1 },
    { t: 'decor', k: 'grave_marker', x: 30, y: f },
    { t: 'decor', k: 'olive_tree', x: 36, y: f, h: 5 },
    { t: 'decor', k: 'spear_cairn', x: 48, y: f - 3 },
    { t: 'decor', k: 'grave_marker', x: 64, y: f, v: 1 },
    { t: 'decor', k: 'grave_marker', x: 68, y: f },
    { t: 'decor', k: 'grave_marker', x: 72, y: f },
    { t: 'decor', k: 'spear_cairn', x: 92, y: f - 2 },
    { t: 'decor', k: 'olive_tree', x: 112, y: f, h: 6, flip: true },
    { t: 'light', k: 'forge', x: 14, y: f },
    { t: 'light', k: 'forge', x: 50, y: f - 3 },
    { t: 'light', k: 'forge', x: 94, y: f - 2 },
    { t: 'altar', x: 6, y: f, id: 'hamongog' },
    { t: 'npc', k: 'azriel', x: 20, y: f, face: 1 },
    { t: 'npc', k: 'tobiah', x: 46, y: f - 3, face: -1 },
    { t: 'npc', k: 'barak', x: 76, y: f, face: -1 },
    { t: 'npc', k: 'ilan', x: 34, y: f, face: 1 },
    { t: 'npc', k: 'dov', x: 54, y: f - 3, face: -1 },
    { t: 'chest', x: 62, y: 15, id: 'hamongog_spoil', secret: true, loot: HOST_LOOT },
  ];
  return room(b, {
    id: 'hamongog', name: 'The Valley of Hamongog', region: HAMONGOG, biome: 'unwalled', music: 'revelation', seed: 1420,
    dark: 0.1, weather: 'motes', fl: f, fr: f, prev: 'gog_mountain', next: 'temple_threshold', map: [210, 3],
    spawns: { altar: { x: 6, y: f, face: 1 } },
    ents,
  });
}

// ================================================================ Act V · the river

// ---------------------------------------------------------------- The threshold of the house
function templeThreshold() {
  const b = new MapBuilder(96, 28);
  const f = 23;
  b.rect(0, f, 96, 5);
  // the house on its mount: steps up to the door, the waters issuing out eastward under the threshold
  b.stairs(20, f, 4, 3, 1);
  b.rect(32, f - 4, 26, 4);
  pool(b, 58, f, 38, 1);
  b.plat(40, 11, 8);
  const ents: EntDef[] = [
    { t: 'decor', k: 'olive_tree', x: 8, y: f, h: 5 },
    { t: 'decor', k: 'temple_door', x: 45, y: f - 4 },
    { t: 'decor', k: 'healing_tree', x: 70, y: f, h: 6 },
    { t: 'decor', k: 'healing_tree', x: 88, y: f, h: 7, flip: true },
    { t: 'decor', k: 'olive_tree', x: 26, y: f - 3, h: 5, flip: true },
    { t: 'decor', k: 'river_fish', x: 80, y: f, v: 4 },
    { t: 'light', k: 'glow', x: 45, y: f - 8, r: 140, c: '#fff4d0' },
    { t: 'altar', x: 12, y: f, id: 'temple_threshold' },
    { t: 'current', x: 58, y: f, w: 38, h: 1, vx: 20, vy: 0 },
    { t: 'trigger', x: 50, y: f - 13, w: 2, h: 9, id: 'threshold' },
    { t: 'chest', x: 44, y: 11, id: 'threshold_lintel', secret: true, loot: HOST_LOOT },
  ];
  return room(b, {
    id: 'temple_threshold', name: 'The Threshold of the House', region: RIVER, biome: 'river', music: 'sanctuary', seed: 1421,
    dark: 0.05, weather: 'motes', fl: f, fr: f, prev: 'hamongog', next: 'river_measure', map: [222, 3],
    spawns: { altar: { x: 12, y: f, face: 1 } },
    ents,
  });
}

// ---------------------------------------------------------------- The waters measured (ankles, knees, loins, to swim in)
function riverMeasure() {
  const b = new MapBuilder(150, 34);
  const f = 24;
  b.rect(0, f, 150, 10);
  // each thousand cubits the water rises: a strip to wade, then one to swim (47:3–5)
  pool(b, 6, f, 26, 1);
  pool(b, 34, f, 26, 2);
  pool(b, 62, f, 30, 4);
  pool(b, 94, f, 46, 8);
  b.rect(32, f - 1, 2, 1).rect(60, f - 1, 2, 1).rect(92, f - 1, 2, 1).rect(140, f - 2, 10, 2);
  b.rect(110, f + 6, 6, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'cubit_marker', x: 6, y: f, v: 1 },
    { t: 'decor', k: 'cubit_marker', x: 33, y: f - 1, v: 2 },
    { t: 'decor', k: 'cubit_marker', x: 61, y: f - 1, v: 3 },
    { t: 'decor', k: 'cubit_marker', x: 93, y: f - 1, v: 4 },
    { t: 'decor', k: 'healing_tree', x: 20, y: f, h: 6, fg: true },
    { t: 'decor', k: 'healing_tree', x: 144, y: f - 2, h: 7 },
    { t: 'decor', k: 'river_fish', x: 76, y: f + 2, v: 5 },
    { t: 'decor', k: 'river_fish', x: 118, y: f + 4, v: 8 },
    { t: 'current', x: 62, y: f, w: 30, h: 4, vx: 25, vy: 0 },
    { t: 'current', x: 94, y: f, w: 46, h: 8, vx: 35, vy: 0 },
    { t: 'air', x: 113, y: f + 4, r: 2 },
    { t: 'chest', x: 112, y: f + 6, id: 'riverbed_cache', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 34, y: f - 1, id: 'ezk479' },
  ];
  return room(b, {
    id: 'river_measure', name: 'Waters to Swim In', region: RIVER, biome: 'river', music: 'riverbed', seed: 1422,
    dark: 0.05, weather: 'motes', fl: f, fr: f - 2, prev: 'temple_threshold', next: 'river_trees', map: [232, 3],
    ents,
  });
}

// ---------------------------------------------------------------- Trees on both banks
function riverTrees() {
  const b = new MapBuilder(120, 28);
  const f = 22;
  b.rect(0, f, 120, 6);
  b.rect(0, f - 2, 10, 2);
  pool(b, 40, f, 40, 3);
  b.rect(54, f - 3, 4, 1, 'W').rect(66, f - 3, 4, 1, 'W');
  b.plat(16, 14, 6).plat(96, 13, 6);
  const ents: EntDef[] = [
    { t: 'decor', k: 'healing_tree', x: 14, y: f, h: 7 },
    { t: 'decor', k: 'healing_tree', x: 28, y: f, h: 8, flip: true },
    { t: 'decor', k: 'healing_tree', x: 36, y: f, h: 6 },
    { t: 'decor', k: 'healing_tree', x: 84, y: f, h: 7 },
    { t: 'decor', k: 'healing_tree', x: 94, y: f, h: 8, flip: true },
    { t: 'decor', k: 'healing_tree', x: 108, y: f, h: 6 },
    { t: 'decor', k: 'river_fish', x: 58, y: f + 1, v: 7 },
    { t: 'current', x: 40, y: f, w: 40, h: 3, vx: 25, vy: 0 },
    { t: 'npc', k: 'tobiah', x: 38, y: f, face: 1 },
    { t: 'npc', k: 'keziah', x: 88, y: f, face: -1 },
    { t: 'chest', x: 98, y: 13, id: 'orchard_cache', secret: true, loot: HOST_LOOT },
    { t: 'lore', x: 18, y: 14, id: 'ezk3823' },
  ];
  return room(b, {
    id: 'river_trees', name: 'Trees on Both Banks', region: RIVER, biome: 'river', music: 'gardens', seed: 1423,
    dark: 0.05, weather: 'motes', fl: f - 2, fr: f, prev: 'river_measure', next: 'healed_sea', map: [244, 3],
    ents,
  });
}

// ---------------------------------------------------------------- The sea made whole
function healedSea() {
  const b = new MapBuilder(96, 28);
  const f = 22;
  b.rect(0, f, 96, 6);
  b.rect(94, 0, 2, f);
  pool(b, 54, f, 40, 4);
  b.rect(46, f - 2, 8, 2);
  const ents: EntDef[] = [
    { t: 'decor', k: 'healing_tree', x: 10, y: f, h: 7 },
    { t: 'decor', k: 'olive_tree', x: 24, y: f, h: 5 },
    { t: 'decor', k: 'river_fish', x: 66, y: f + 2, v: 9 },
    { t: 'decor', k: 'river_fish', x: 82, y: f + 1, v: 6 },
    { t: 'decor', k: 'healing_tree', x: 48, y: f - 2, h: 6, flip: true },
    { t: 'decor', k: 'olive_tree', x: 4, y: f, h: 4, flip: true },
    { t: 'light', k: 'glow', x: 70, y: f - 4, r: 160, c: '#ffe0a8' },
    { t: 'npc', k: 'mara', x: 36, y: f, face: 1 },
    { t: 'npc', k: 'hanan', x: 30, y: f, face: 1 },
    { t: 'npc', k: 'shira', x: 42, y: f, face: 1 },
    { t: 'trigger', x: 48, y: f - 11, w: 2, h: 9, id: 'river_end' },
  ];
  return room(b, {
    id: 'healed_sea', name: 'The Sea Made Whole', region: RIVER, biome: 'river', music: 'rest', seed: 1424,
    dark: 0.05, weather: 'motes', fl: f, fr: f, prev: 'river_trees', map: [254, 3],
    ents,
  });
}

export const ROOMS14 = [
  bethshalom(), oliveTerraces(), watchHill(), alarmVillage(), vineyardRoad(), refugeCave(),
  northPass(), hostCamp(), shieldField(), fordOfHost(), princesTents(), siegeLines(), engineHill(),
  fallenWalls(), steepPlaces(), rentValley(), brothersField(), gogAscent(), gogMountain(),
  hamongog(),
  templeThreshold(), riverMeasure(), riverTrees(), healedSea(),
];
export const CH14_ROOM_IDS = new Set(ROOMS14.map((r) => r.id));
