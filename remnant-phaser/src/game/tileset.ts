// Tilesets and backdrops are generated in code, one per biome, as the original
// game's art is: no tile images ship. Each tile is extruded by a pixel (margin 1,
// spacing 2) so scaling the camera never shows seams between tiles.

import Phaser from 'phaser';
import { T, type Biome } from '../shared';

export const TS = 16;
/** Tile indices in a generated tileset. The "top" variants are used where open air is above. */
export const TI = {
  stone: 1, brick: 2, wood: 3, oneway: 4, spikes: 5, cracked: 6, veil: 7, water: 8, collapse: 9, seal: 10, gate: 11,
  stoneTop: 12, brickTop: 13, woodTop: 14,
} as const;
const COUNT = 15;

export interface Palette {
  /** Main block colour, its shadow and its light edge. */
  base: string; dark: string; light: string;
  /** Grass, moss, sand or gilding along the walkable top. */
  top: string;
  /** Sky (or back wall) from top to bottom, and the two parallax ranges. */
  sky: [string, string]; far: string; near: string;
  accent: string;
}

const P = (base: string, dark: string, light: string, top: string, sky: [string, string], far: string, near: string, accent: string): Palette => ({ base, dark, light, top, sky, far, near, accent });
const STONE = P('#4b4450', '#2a2530', '#6d6474', '#5c6b48', ['#1b1724', '#3a2e3a'], '#2a2232', '#1c1722', '#e2b85a');
export const PALETTES: Record<Biome, Palette> = {
  sanctuary: P('#544a52', '#2e272e', '#7a6c72', '#8a6a3a', ['#140f14', '#2a1f22'], '#231b20', '#18121a', '#e2b85a'),
  village: P('#4d4446', '#2a2326', '#6e6264', '#4e5a3a', ['#1d1a26', '#4a3238'], '#2b2430', '#1b1620', '#ff9a5a'),
  temple: P('#5a5048', '#302a24', '#80746a', '#9a8250', ['#17131a', '#2c2420'], '#231d1e', '#171316', '#f6dea0'),
  crypt: P('#3e3a44', '#221f28', '#5a5462', '#3e3a44', ['#0c0a10', '#1a1620'], '#16121a', '#0e0c12', '#9fc4ff'),
  sanctum: P('#5e4a3a', '#33281f', '#8a6e52', '#c8a050', ['#1a120c', '#3a2414'], '#2a1a12', '#1a100a', '#ffd27a'),
  plain: P('#6a5a44', '#3a3022', '#8e7a5c', '#7a7040', ['#2a2430', '#8a5a40'], '#3a2c30', '#261c20', '#ffb35a'),
  tower: P('#6a4e3a', '#3a2a1e', '#8e6a50', '#9a6a40', ['#22161a', '#6a3a2a'], '#3a2420', '#24161a', '#ff8a4a'),
  valley: P('#6a6458', '#3a362e', '#948c7c', '#a89c80', ['#1e1a1a', '#5a4a3a'], '#2e2824', '#1e1a18', '#e8e0c8'),
  hive: P('#4a3a24', '#281e12', '#6e5634', '#7a6a2a', ['#120e08', '#2a1e10'], '#1e160c', '#140e08', '#e8c040'),
  trial: P('#5a5660', '#302e36', '#7e7a86', '#c8b070', ['#0a0a18', '#1a1a34'], '#16162a', '#0e0e1e', '#ffe6a8'),
  dura: P('#7a6440', '#443620', '#a08458', '#c8a050', ['#2a1e18', '#9a6a3a'], '#4a3424', '#2e2016', '#ffd27a'),
  babylon: P('#3a4a6a', '#1e283a', '#5a6a8e', '#c8a050', ['#141a2a', '#3a3050'], '#202a40', '#141a2a', '#ffd27a'),
  furnace: P('#5a3a2a', '#321e14', '#7e5238', '#ff7a2a', ['#1a0a06', '#5a1a0a'], '#2a120a', '#1a0a06', '#ffa040'),
  riverbed: P('#4a5048', '#282c26', '#6a7266', '#5a6a4a', ['#121a1e', '#2a3a40'], '#1e282c', '#121a1e', '#9fd8ff'),
  gardens: P('#4a5a3e', '#283222', '#6a7e58', '#5a8a3a', ['#141e1a', '#2a4a3a'], '#1e2e24', '#121e16', '#ffd0a0'),
  palace: P('#5a4a6a', '#30283a', '#7e6a8e', '#c8a050', ['#140f1e', '#2e2240'], '#221a30', '#16101e', '#ffd27a'),
  hiddekel: P('#5a5446', '#322e26', '#7e7664', '#6a7a4a', ['#16181e', '#3a4048'], '#24282e', '#16181e', '#bfe0ff'),
  shushan: P('#6a5a4a', '#3a3028', '#8e7c68', '#9a8a5a', ['#1a1620', '#4a3a40'], '#2a2228', '#1a161a', '#e8c86a'),
  highplaces: P('#4a4a5a', '#282834', '#6a6a7e', '#8a8aa0', ['#0e1020', '#2a2a50'], '#1a1a30', '#10101e', '#c8ccff'),
  hunt: P('#4e4a40', '#2a2822', '#706a5c', '#4a5a3a', ['#141418', '#3a3430'], '#24221e', '#161512', '#d8a060'),
  plague: P('#46503a', '#262c1e', '#647054', '#6a8a3a', ['#121a10', '#2e3a1e'], '#1e2818', '#121a0e', '#badc8b'),
  cinders: P('#4a3a34', '#281e1a', '#6a544a', '#ff7a3a', ['#140a08', '#4a1a10'], '#24120e', '#160a08', '#ffad62'),
  grecia: P('#5a6066', '#30343a', '#7e868e', '#8a9a9a', ['#0e141a', '#2a3a48'], '#1a242c', '#0e161c', '#ffb060'),
  rest: STONE,
};

/** The tileset index for a tile char's type, given whether open air is above it. */
export function tileIndex(t: T, openAbove: boolean): number {
  switch (t) {
    case T.Stone: return openAbove ? TI.stoneTop : TI.stone;
    case T.Brick: return openAbove ? TI.brickTop : TI.brick;
    case T.Wood: return openAbove ? TI.woodTop : TI.wood;
    case T.OneWay: return TI.oneway;
    case T.Spikes: return TI.spikes;
    case T.Cracked: return TI.cracked;
    case T.Veil: return TI.veil;
    case T.Water: return TI.water;
    case T.Collapse: return TI.collapse;
    case T.Seal: return TI.seal;
    case T.Gate: return TI.gate;
    default: return -1;
  }
}

/** A seeded hash for repeatable texture noise. */
const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Build (once) the tileset texture for a biome and return its key. */
export function biomeTileset(scene: Phaser.Scene, biome: Biome): string {
  const key = `tiles-${biome}`;
  if (scene.textures.exists(key)) return key;
  const pal = PALETTES[biome] ?? STONE;
  const cell = TS + 2;
  const tex = scene.textures.createCanvas(key, 1 + COUNT * cell, cell + 1)!;
  const c = tex.getContext();
  const tile = document.createElement('canvas');
  tile.width = tile.height = TS;
  const t = tile.getContext('2d')!;
  for (let i = 1; i < COUNT; i++) {
    t.clearRect(0, 0, TS, TS);
    paintTile(t, i, pal, i);
    const x = 1 + i * cell, y = 1;
    // Extrude the edges so neighbouring samples match.
    c.drawImage(tile, 0, 0, TS, 1, x, y - 1, TS, 1);
    c.drawImage(tile, 0, TS - 1, TS, 1, x, y + TS, TS, 1);
    c.drawImage(tile, 0, 0, 1, TS, x - 1, y, 1, TS);
    c.drawImage(tile, TS - 1, 0, 1, TS, x + TS, y, 1, TS);
    c.drawImage(tile, x, y);
  }
  tex.refresh();
  return key;
}

function px(t: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  t.fillStyle = col;
  t.fillRect(x, y, w, h);
}

function paintTile(t: CanvasRenderingContext2D, i: number, p: Palette, seed: number) {
  const block = (base: string, mortar: boolean, plank: boolean) => {
    px(t, 0, 0, TS, TS, base);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const n = hash(x, y, seed);
      if (n < 0.08) px(t, x, y, 1, 1, p.dark);
      else if (n > 0.95) px(t, x, y, 1, 1, p.light);
    }
    if (mortar) {
      px(t, 0, 7, TS, 1, p.dark); px(t, 0, 15, TS, 1, p.dark);
      px(t, 5, 0, 1, 7, p.dark); px(t, 12, 8, 1, 7, p.dark);
      px(t, 0, 0, TS, 1, p.light);
    } else if (plank) {
      for (const y of [3, 8, 13]) px(t, 0, y, TS, 1, p.dark);
      px(t, 9, 0, 1, 3, p.dark); px(t, 3, 4, 1, 4, p.dark); px(t, 11, 9, 1, 4, p.dark);
    } else {
      // Rough stone: an irregular course and a lit upper edge.
      px(t, 0, 8, 7, 1, p.dark); px(t, 7, 9, 9, 1, p.dark); px(t, 7, 0, 1, 9, p.dark); px(t, 3, 9, 1, 7, p.dark); px(t, 12, 10, 1, 6, p.dark);
      px(t, 0, 0, 7, 1, p.light); px(t, 8, 0, 8, 1, p.light);
    }
  };
  const top = () => {
    px(t, 0, 0, TS, 2, p.top);
    for (let x = 0; x < TS; x++) if (hash(x, 3, seed) > 0.55) px(t, x, 2, 1, 1 + Math.floor(hash(x, 4, seed) * 2), p.top);
    px(t, 0, 0, TS, 1, p.light);
  };
  switch (i) {
    case TI.stone: block(p.base, false, false); break;
    case TI.stoneTop: block(p.base, false, false); top(); break;
    case TI.brick: block(p.base, true, false); break;
    case TI.brickTop: block(p.base, true, false); top(); break;
    case TI.wood: block('#5a4030', false, true); break;
    case TI.woodTop: block('#5a4030', false, true); px(t, 0, 0, TS, 1, '#8a6a4a'); break;
    case TI.oneway:
      px(t, 0, 0, TS, 4, '#6a4e36'); px(t, 0, 0, TS, 1, '#9a7a56'); px(t, 0, 3, TS, 1, '#3a2a1e');
      px(t, 2, 4, 1, 3, '#3a2a1e'); px(t, 13, 4, 1, 3, '#3a2a1e');
      break;
    case TI.spikes:
      for (let k = 0; k < 4; k++) {
        const x = k * 4;
        t.fillStyle = '#8a8088';
        t.beginPath(); t.moveTo(x, 15); t.lineTo(x + 2, 6); t.lineTo(x + 4, 15); t.fill();
        px(t, x + 2, 6, 1, 3, '#e8e0d8');
      }
      px(t, 0, 14, TS, 2, p.dark);
      break;
    case TI.cracked: block(p.base, false, false); px(t, 4, 2, 1, 5, p.dark); px(t, 5, 6, 3, 1, p.dark); px(t, 8, 7, 1, 6, p.dark); px(t, 9, 12, 4, 1, p.dark); break;
    case TI.veil:
      px(t, 0, 0, TS, TS, 'rgba(120,60,170,0.42)');
      for (let x = 0; x < TS; x += 2) px(t, x, Math.floor(hash(x, 0, seed) * 3), 1, 2, 'rgba(210,150,255,0.7)');
      break;
    case TI.water:
      px(t, 0, 0, TS, TS, 'rgba(40,90,140,0.5)');
      px(t, 0, 0, TS, 1, 'rgba(170,220,255,0.75)');
      break;
    case TI.collapse: block(p.base, false, false); px(t, 0, 5, TS, 1, '#1a1418'); px(t, 0, 11, TS, 1, '#1a1418'); px(t, 2, 0, TS - 4, 1, '#c8a050'); break;
    case TI.seal:
      block(p.base, true, false);
      t.strokeStyle = p.accent; t.lineWidth = 1;
      t.strokeRect(3.5, 3.5, 9, 9); px(t, 7, 2, 2, 12, p.accent); px(t, 2, 7, 12, 2, p.accent);
      break;
    case TI.gate:
      px(t, 0, 0, TS, TS, 'rgba(0,0,0,0)');
      for (const x of [1, 6, 11]) { px(t, x, 0, 3, TS, '#3a3438'); px(t, x, 0, 1, TS, '#6a6068'); }
      px(t, 0, 2, TS, 2, '#2a2428'); px(t, 0, 12, TS, 2, '#2a2428');
      break;
  }
}

/** A soft round glow (for lamps, impacts and the objective light), made once. */
export function glowTexture(scene: Phaser.Scene): string {
  const key = 'glow';
  if (scene.textures.exists(key)) return key;
  const s = 64;
  const tex = scene.textures.createCanvas(key, s, s)!;
  const c = tex.getContext();
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  tex.refresh();
  return key;
}

/** The sky (or back wall) and two parallax silhouette bands for a biome, made once. */
export function backdropTextures(scene: Phaser.Scene, biome: Biome, interior: boolean) {
  const pal = PALETTES[biome] ?? STONE;
  const key = `bg-${biome}-${interior ? 'in' : 'out'}`;
  if (!scene.textures.exists(key + '-sky')) {
    const sky = scene.textures.createCanvas(key + '-sky', 8, 256)!;
    const c = sky.getContext();
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, pal.sky[0]);
    g.addColorStop(1, pal.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 256);
    sky.refresh();
    for (const [band, col, h, rough] of [['far', pal.far, 140, 0.6], ['near', pal.near, 110, 1]] as const) {
      const w = 512;
      const tex = scene.textures.createCanvas(`${key}-${band}`, w, h)!;
      const b = tex.getContext();
      b.fillStyle = col;
      if (interior) {
        // Columns and arches of a hall.
        for (let x = 0; x < w; x += band === 'far' ? 64 : 96) {
          const cw = band === 'far' ? 14 : 22;
          b.fillRect(x, 10, cw, h);
          b.fillRect(x - 4, 10, cw + 8, 6);
          b.beginPath();
          b.arc(x + (band === 'far' ? 32 : 48) + cw / 2, 40, band === 'far' ? 18 : 26, Math.PI, 0);
          b.lineTo(x + (band === 'far' ? 50 : 74) + cw, 40);
          b.fill();
        }
      } else {
        // A ridge line of hills, ruins and dead trees.
        b.beginPath();
        b.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = h * 0.45 + Math.sin(x / 70 + (band === 'far' ? 1 : 3)) * h * 0.18 * rough + Math.sin(x / 23) * 6 * rough;
          b.lineTo(x, y);
        }
        b.lineTo(w, h);
        b.fill();
        for (let x = 30; x < w; x += band === 'far' ? 120 : 90) {
          const y = h * 0.45 + Math.sin(x / 70 + (band === 'far' ? 1 : 3)) * h * 0.18 * rough;
          if (hash(x, 1, h) > 0.5) { b.fillRect(x, y - 30, 8, 32); b.fillRect(x - 6, y - 30, 20, 4); }
          else { b.fillRect(x, y - 24, 2, 26); b.fillRect(x - 6, y - 18, 8, 1); b.fillRect(x + 1, y - 13, 7, 1); }
        }
      }
      tex.refresh();
    }
  }
  return { sky: key + '-sky', far: key + '-far', near: key + '-near', pal };
}
