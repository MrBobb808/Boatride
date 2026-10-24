// Engine-free data shared with the original build (../remnant) until it is retired:
// room layouts, the tile legend, items and the experience curve, and the PNG sheets.
export { ROOMS } from '../../remnant/src/game/rooms';
export { TILE, CHAR_TILE, T, isSolid, isHazard, type RoomDef, type EntDef, type Exit, type EnemyKind, type Biome } from '../../remnant/src/game/tiles';
export { xpToNext } from '../../remnant/src/game/data';
export { default as spriteManifest } from '../../remnant/src/assets/sprite-manifest.json';
export { default as eliorUrl } from '../../remnant/src/assets/elior-v3.png';
export { default as ashenUrl } from '../../remnant/src/assets/foes-ashen.png';
export { default as beastsUrl } from '../../remnant/src/assets/foes-beasts.png';
export { default as shinarUrl } from '../../remnant/src/assets/foes-shinar.png';
export { default as veilUrl } from '../../remnant/src/assets/foes-veil.png';
