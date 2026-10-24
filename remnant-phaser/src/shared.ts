// Engine-free data shared with the original build (../remnant) until it is retired:
// room layouts, the tile legend, items and the experience curve, and the PNG sheets.
export { ROOMS } from '../../remnant/src/game/rooms';
export { TILE, CHAR_TILE, T, isSolid, isHazard, type RoomDef, type EntDef, type Exit, type EnemyKind, type Biome } from '../../remnant/src/game/tiles';
export { xpToNext, ECHO_SPECIES } from '../../remnant/src/game/data';
export { chapterCurve } from '../../remnant/src/game/curve';
export { FALLEN_CHAPTERS, chapterForRoom, fallenObjective, cleansingBeacon } from '../../remnant/src/game/fallenChapters';
export { default as eliorUrl } from '../../remnant/src/assets/elior-v3.png';
export { default as varkhosUrl } from '../../remnant/src/assets/varkhos-hunt-atlas.png';
export { default as morvaneUrl } from '../../remnant/src/assets/morvane-plague-atlas.png';
export { default as azkarUrl } from '../../remnant/src/assets/azkar-cinder-atlas.png';
