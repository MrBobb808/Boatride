// Chapters VII–IX environment art: the domains of the Fallen Crowns.
// The Hunt: a thawing pine forest under a cold moon, grey snow going to mud,
// antler totems, hide banners and stake pits; its depths are bone-strewn dens.
// Pestilence: a sick green marsh over drowned houses, willows hung with moss,
// bog water and bile, quarantine lanterns; its depths are the sporeworks and
// the wax hive of the queen. Cinders: an ash sky over the forge-mountain,
// riveted iron and soot-black brick, slag channels, crucibles and chains.

import { makeCanvas, rgba, mix, shade, circle, poly, type Ctx } from './draw';
import { RNG, hash2 } from '../core/math';
import { TILE, T, type Biome } from '../game/tiles';
import { blob, tier, wrapNoise, fillRidge, reedSil } from './env4';
import type { BiomePal, Layer, ParallaxSteps } from './environment';

export { fallenProp, drawFallenLive, FALLEN_LIVE } from './fallenProps';
export { fallenParallax } from './fallenScenery';
import { greciaSky, drawSolidGrecia, drawOneWayGrecia, drawSpikesGrecia, drawLiquidGrecia } from './envGrecia';

export type FallenBiome = 'hunt' | 'plague' | 'cinders' | 'grecia';
export const isFallen = (b: Biome): b is FallenBiome => b === 'hunt' || b === 'plague' || b === 'cinders' || b === 'grecia';

const TAU = Math.PI * 2;

function box(ctx: Ctx, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- skies

type SkyKind = 'thaw' | 'den' | 'miasma' | 'hive' | 'ash' | 'forge';
const SKY_STOPS: Record<SkyKind, readonly (readonly [number, string])[]> = {
  // a cold night going grey at the edge, the thaw's first rose low in the trees
  thaw: [[0, '#0a0e1e'], [0.3, '#18203a'], [0.55, '#2e3452'], [0.74, '#5a4a5e'], [0.86, '#a0706a'], [0.96, '#d09a7a']],
  // the dens under the forest: earth-dark, warmed by fires below
  den: [[0, '#060508'], [0.5, '#120d10'], [0.8, '#22161a'], [1, '#3a2018']],
  // the marsh under the swarm: teal gone to bile at the horizon
  miasma: [[0, '#081214'], [0.3, '#142a26'], [0.55, '#2c4a38'], [0.76, '#5e8048'], [0.9, '#a8bc72'], [1, '#c8d092']],
  // the hive and the sporeworks
  hive: [[0, '#050a07'], [0.55, '#0e1c12'], [0.85, '#1c3418'], [1, '#2e4a1c']],
  // ash falling through furnace light
  ash: [[0, '#100c14'], [0.28, '#261a22'], [0.52, '#4e2e30'], [0.74, '#9a5236'], [0.9, '#d8823e'], [1, '#f0a050']],
  // inside the foundry
  forge: [[0, '#080505'], [0.55, '#1a0d0a'], [0.85, '#3a1a0c'], [1, '#5a2a0e']],
};
const skyG: Partial<Record<SkyKind, CanvasGradient>> = {};
const skyH: Partial<Record<SkyKind, number>> = {};

function skyFill(ctx: Ctx, kind: SkyKind, w: number, h: number) {
  let g = skyG[kind];
  if (!g || skyH[kind] !== h) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of SKY_STOPS[kind]) g.addColorStop(o, c);
    skyG[kind] = g;
    skyH[kind] = h;
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function fallenSky(ctx: Ctx, biome: FallenBiome, w: number, h: number, interior: boolean, t: number) {
  if (biome === 'grecia') return greciaSky(ctx, w, h, interior, t);
  const k = h / 720;
  if (interior) {
    skyFill(ctx, biome === 'hunt' ? 'den' : biome === 'plague' ? 'hive' : 'forge', w, h);
    const glowCol = biome === 'hunt' ? '#a0502a' : biome === 'plague' ? '#5a9a3a' : '#ff6a20';
    const pulse = biome === 'cinders' ? 0.05 * Math.sin(t * 2.1) : 0;
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, glowCol, w * 0.5, h, w * 0.75, h * 0.42, 0.22 + pulse);
    // light falling through cracks in the roof
    if (tier() > 0) {
      ctx.fillStyle = rgba(biome === 'plague' ? '#b8e090' : biome === 'hunt' ? '#c8c0b0' : '#ffb070', 0.045);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.18 + i * 0.32) + Math.sin(t * 0.1 + i) * 6 * k, s = (30 + i * 10) * k;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.3, 0);
        ctx.lineTo(x + s * 0.3, 0);
        ctx.lineTo(x + s * 2.2, h);
        ctx.lineTo(x + s * 0.6, h);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (biome === 'hunt') thawSky(ctx, w, h, t, k);
  else if (biome === 'plague') miasmaSky(ctx, w, h, t, k);
  else ashSky(ctx, w, h, t, k);
}

function thawSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  skyFill(ctx, 'thaw', w, h);
  ctx.fillStyle = '#e8ecff';
  const s = Math.max(1, Math.round(1.3 * k));
  for (let i = 0; i < 40; i++) {
    const y = hash2(i, 71) * h * 0.5;
    ctx.globalAlpha = (0.2 + 0.5 * hash2(i, 73)) * (1 - y / (h * 0.5)) * (0.75 + 0.25 * Math.sin(t * 1.3 + i * 2.1));
    ctx.fillRect(hash2(i, 75) * w, y, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  // a pale aurora over the hunting grounds, slow as breath
  if (tier() > 0)
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 7; j++) {
        const x = w * (j / 6) + Math.sin(t * 0.05 + i + j) * 40 * k;
        const y = h * (0.13 + i * 0.07) + Math.sin(j * 1.3 + t * 0.08 + i * 2) * h * 0.035;
        blob(ctx, i ? '#3a8aa0' : '#4ac094', x, y, w * 0.12, h * 0.035, 0.1);
      }
  const mx = w * 0.76, my = h * 0.2, mr = h * 0.05;
  blob(ctx, '#b8c4ff', mx, my, mr * 6, mr * 6, 0.16);
  blob(ctx, '#e0805a', w * 0.3, h * 0.95, w * 0.6, h * 0.14, 0.25);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, mx, my, mr, '#ece6d8');
  circle(ctx, mx - mr * 0.32, my - mr * 0.2, mr * 0.22, '#cfc6b6');
  circle(ctx, mx + mr * 0.25, my + mr * 0.35, mr * 0.16, '#d4ccbc');
  circle(ctx, mx + mr * 0.4, my - mr * 0.38, mr * 0.1, '#d4ccbc');
  // the moon's shadowed limb
  circle(ctx, mx + mr * 0.42, my - mr * 0.06, mr * 0.9, rgba('#18203a', 0.4));
  ctx.fillStyle = rgba('#b8a8c0', 0.06);
  for (let i = 0; i < 3; i++) ctx.fillRect(0, h * (0.62 + i * 0.1) + Math.sin(t * 0.12 + i) * 9 * k, w, 17 * k);
}

function miasmaSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  skyFill(ctx, 'miasma', w, h);
  const sx = w * 0.3, sy = h * 0.3;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#c8e090', sx, sy, h * 0.3, h * 0.3, 0.22);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, h * 0.045, rgba('#e8f0c0', 0.75));
  // swarms drifting over the marsh, each a dark breath of specks
  const s = Math.max(1, Math.round(1.5 * k));
  for (let i = 0; i < 4; i++) {
    const span = w + 600 * k;
    const cx = ((t * (5 + i * 2) * k * 3 + hash2(i, 81) * span) % span) - 300 * k;
    const cy = h * (0.14 + i * 0.09);
    blob(ctx, '#0a120c', cx, cy, (120 + i * 20) * k, (24 + i * 4) * k, 0.45);
    ctx.fillStyle = '#081008';
    const n = tier() > 0 ? 18 : 8;
    for (let j = 0; j < n; j++) {
      const px = cx + (hash2(i, j) - 0.5) * 240 * k + Math.sin(t * 2 + j) * 4 * k;
      const py = cy + (hash2(j, i + 5) - 0.5) * 56 * k + Math.cos(t * 1.7 + j * 1.3) * 3 * k;
      ctx.fillRect(px, py, s, s);
    }
  }
  ctx.fillStyle = rgba('#b8d488', 0.06);
  for (let i = 0; i < 3; i++) ctx.fillRect(0, h * (0.6 + i * 0.11) + Math.sin(t * 0.12 + i) * 9 * k, w, 17 * k);
}

function ashSky(ctx: Ctx, w: number, h: number, t: number, k: number) {
  skyFill(ctx, 'ash', w, h);
  const sx = w * 0.72, sy = h * 0.23;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff9a50', sx, sy, h * 0.22, h * 0.22, 0.2);
  blob(ctx, '#ff6a20', w * 0.5, h, w * 0.8, h * 0.25, 0.28 + 0.04 * Math.sin(t * 1.3));
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, h * 0.03, '#f0b070');
  // smoke drawn across the sun in bars
  box(ctx, rgba('#5a3a3a', 0.8), sx - h * 0.05, sy - h * 0.008, h * 0.1, h * 0.01);
  box(ctx, rgba('#5a3a3a', 0.6), sx - h * 0.035, sy + h * 0.012, h * 0.08, h * 0.006);
  // columns of smoke from the stacks, leaning with the wind
  const n = tier() > 0 ? 5 : 3;
  for (let i = 0; i < 3; i++) {
    const x = w * (0.12 + i * 0.34);
    for (let j = 0; j < n; j++) {
      const f = j / n;
      blob(ctx, '#24161a', x + Math.sin(t * 0.2 + j + i) * 10 * k + f * 80 * k, h * (0.78 - f * 0.6), (40 + f * 90) * k, (22 + f * 30) * k, 0.4 * (1 - f * 0.5));
    }
  }
  ctx.fillStyle = rgba('#ffb66b', 0.045);
  for (let i = 0; i < 3; i++) ctx.fillRect(0, h * (0.65 + i * 0.1) + Math.sin(t * 0.14 + i) * 5 * k, w, 12 * k);
}

// ---------------------------------------------------------------- tiles

const SNOW = '#c8ccd8', SNOW_LIT = '#eef0f8', SNOW_DK = '#8a90a8';
const MOSS = '#5a7a3c', MOSS_LIT = '#8aac58', MOSS_DK = '#2e4422';
const IRON = '#4a3e3c', IRON_LIT = '#8a7464', IRON_DK = '#221a1a', HOT = '#ff8a3a';

/** Solid ground: thawing loam under grey snow, peat under moss, soot-black brick under iron. */
export function drawSolidFallen(ctx: Ctx, biome: FallenBiome, pal: BiomePal, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean, interior: boolean) {
  if (biome === 'grecia') return drawSolidGrecia(ctx, pal, tx, ty, t, depth, v, solid, interior);
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
  let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
  if (t === T.Seal) base = '#7a5a28';
  if (t === T.Wood) base = pal.plat;
  const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
  box(ctx, mix(dark, '#000000', v * 0.12), x, y, TILE, TILE);
  if (biome === 'hunt') huntTile(ctx, x, y, tx, ty, depth, up, dn, lf, rt, interior);
  else if (biome === 'plague') plagueTile(ctx, x, y, tx, ty, depth, up, dn, lf, rt, interior);
  else cinderTile(ctx, x, y, tx, ty, depth, up, dn, interior);
  if (!lf) box(ctx, 'rgba(255,230,200,0.08)', x, y, 1, TILE);
  if (!rt) box(ctx, 'rgba(0,0,0,0.3)', x + TILE - 2, y, 2, TILE);
}

function huntTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, interior: boolean) {
  if (depth <= 1) {
    // earth in bands, a stone or a root through it
    const b0 = 5 + Math.floor(hash2(tx, ty, 701) * 4);
    box(ctx, 'rgba(10,6,8,0.32)', x, y + b0, TILE, 1);
    box(ctx, 'rgba(200,180,170,0.06)', x, y + b0 + 1, TILE, 1);
    const k = hash2(tx, ty, 702);
    if (k < 0.14) {
      const sx = x + 2 + Math.floor(hash2(tx, ty, 703) * 10);
      box(ctx, '#5a5058', sx, y + b0 + 3, 4, 3);
      box(ctx, '#7a7078', sx, y + b0 + 3, 3, 1);
    } else if (interior && k < 0.24) {
      // a bone in the den wall
      const bx = x + 3 + Math.floor(hash2(tx, ty, 704) * 6);
      box(ctx, '#b8ac98', bx, y + 9, 6, 2);
      box(ctx, '#d8ccb8', bx - 1, y + 8, 2, 2);
      box(ctx, '#d8ccb8', bx + 5, y + 10, 2, 2);
    }
    // claw marks on exposed faces: three strokes raking down
    if ((!lf || !rt) && hash2(tx, ty, 705) < 0.18) {
      ctx.fillStyle = 'rgba(8,4,6,0.6)';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 8; j++) ctx.fillRect(x + 4 + i * 3 + (j >> 2), y + 3 + j, 1, 1);
      ctx.fillStyle = 'rgba(220,200,190,0.18)';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 5 + i * 3, y + 3, 1, 6);
    }
  }
  if (!up) {
    if (interior) {
      // trampled den floor: packed earth, straw and bone chips
      box(ctx, '#3a2c2a', x, y, TILE, 4);
      box(ctx, '#5a4640', x, y, TILE, 1);
      ctx.fillStyle = '#8a7458';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + Math.floor(hash2(tx, i, 706) * 14), y + 1 + i, 3, 1);
      if (hash2(tx, ty, 707) < 0.15) box(ctx, '#c8bca8', x + 4 + Math.floor(hash2(tx, ty, 708) * 8), y - 1, 3, 1);
      return;
    }
    // the thaw: a grey crust of old snow, broken where dead grass shows through
    const melt = hash2(tx, ty, 709) < 0.35;
    box(ctx, '#2a2024', x, y + 3, TILE, 2);
    if (melt) {
      box(ctx, '#4a4038', x, y, TILE, 4);
      ctx.fillStyle = '#8a7a58';
      for (let i = 0; i < 5; i++) {
        const gx = x + Math.floor(hash2(tx, i, 710) * 15), gh = 2 + Math.floor(hash2(tx, i, 711) * 3);
        ctx.fillRect(gx, y - gh + 1, 1, gh);
      }
      box(ctx, SNOW_DK, x + Math.floor(hash2(tx, ty, 712) * 8), y, 5, 2);
      box(ctx, 'rgba(160,190,230,0.35)', x + 2, y + 2, 6, 1);
    } else {
      box(ctx, SNOW_DK, x, y, TILE, 4);
      box(ctx, SNOW, x, y, TILE, 3);
      box(ctx, SNOW_LIT, x, y, TILE, 1);
      // a ragged lower edge to the crust, and its drifts
      ctx.fillStyle = SNOW_DK;
      for (let i = 0; i < 4; i++) if (hash2(tx, i, 713) < 0.5) ctx.fillRect(x + i * 4, y + 4, 3, 1);
      if (hash2(tx, ty, 714) < 0.3) {
        box(ctx, SNOW, x + 4, y - 1, 7, 1);
        box(ctx, SNOW_LIT, x + 5, y - 1, 4, 1);
      }
      if (hash2(tx, ty, 715) < 0.15) box(ctx, '#3a2a2e', x + 3 + Math.floor(hash2(tx, ty, 716) * 9), y + 1, 2, 1);
    }
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.38)', x, y + TILE - 2, TILE, 2);
    // roots, or icicles where the meltwater refroze
    const k = hash2(tx, ty, 717);
    if (k < 0.3) {
      const rx = x + 3 + Math.floor(hash2(tx, ty, 718) * 9), len = 3 + Math.floor(k * 20);
      box(ctx, '#2a1e1a', rx, y + TILE, 1, len);
      box(ctx, '#2a1e1a', rx + 1, y + TILE + len - 2, 1, 2);
    } else if (!interior && k < 0.45) {
      const ix = x + 4 + Math.floor(hash2(tx, ty, 719) * 7);
      poly(ctx, [ix, y + TILE, ix + 3, y + TILE, ix + 1.5, y + TILE + 6], 'rgba(200,220,240,0.7)');
    }
  }
}

function plagueTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, interior: boolean) {
  if (depth <= 1) {
    if (interior) {
      // the sporeworks' brick, green-glazed in courses, rust weeping from the joints
      const off = ty & 1 ? 8 : 0;
      box(ctx, 'rgba(6,12,8,0.4)', x, y, TILE, 1);
      box(ctx, 'rgba(6,12,8,0.4)', x + off, y, 1, TILE);
      box(ctx, 'rgba(6,12,8,0.3)', x, y + 8, TILE, 1);
      if (ty % 4 === 1) {
        box(ctx, '#3a6a44', x, y + 2, TILE, 4);
        box(ctx, '#5a9a5a', x, y + 2, TILE, 1);
      }
      if (hash2(tx, ty, 721) < 0.12) box(ctx, 'rgba(140,70,30,0.45)', x + off + 1, y + 1, 1, 6 + Math.floor(hash2(tx, ty, 722) * 6));
    } else {
      // peat laid in mats, a glowing spore in it now and then
      const b0 = 4 + Math.floor(hash2(tx, ty, 723) * 4), b1 = 10 + Math.floor(hash2(tx, ty, 724) * 3);
      box(ctx, 'rgba(6,10,6,0.3)', x, y + b0, TILE, 1);
      box(ctx, 'rgba(6,10,6,0.3)', x, y + b1, TILE, 1);
      if (hash2(tx, ty, 725) < 0.12) {
        const sx = x + 2 + Math.floor(hash2(tx, ty, 726) * 11);
        box(ctx, '#8ad050', sx, y + b0 + 2, 1, 1);
        box(ctx, 'rgba(140,220,90,0.35)', sx - 1, y + b0 + 1, 3, 3);
      }
    }
  }
  if (!up) {
    // a thick moss pelt, hanging over the edges, a fungus or two on it
    box(ctx, MOSS_DK, x, y, TILE, 5);
    box(ctx, MOSS, x, y, TILE, 3);
    box(ctx, MOSS_LIT, x, y, TILE, 1);
    ctx.fillStyle = MOSS_DK;
    for (let i = 0; i < 4; i++) if (hash2(tx, i, 727) < 0.6) ctx.fillRect(x + i * 4 + 1, y + 5, 2, 1 + Math.floor(hash2(tx, i, 728) * 3));
    if (!lf) box(ctx, MOSS, x - 1, y + 1, 2, 5);
    if (!rt) box(ctx, MOSS, x + TILE - 1, y + 1, 2, 5);
    const k = hash2(tx, ty, 729);
    if (k < 0.12) {
      // a small toadstool, its cap pale and spotted
      const fx = x + 3 + Math.floor(hash2(tx, ty, 730) * 9);
      box(ctx, '#c8c8a0', fx + 1, y - 3, 1, 3);
      box(ctx, '#a8d070', fx - 1, y - 5, 5, 2);
      box(ctx, '#e8f0b0', fx, y - 5, 1, 1);
    } else if (k < 0.3) {
      ctx.fillStyle = '#6a8a40';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + Math.floor(hash2(tx, i, 731) * 15), y - 2, 1, 2);
    }
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.38)', x, y + TILE - 2, TILE, 2);
    // slime gathering into drips
    const k = hash2(tx, ty, 732);
    if (k < 0.35) {
      const dx = x + 2 + Math.floor(hash2(tx, ty, 733) * 11), len = 2 + Math.floor(k * 18);
      box(ctx, 'rgba(120,180,70,0.6)', dx, y + TILE, 1, len);
      box(ctx, 'rgba(150,220,90,0.8)', dx, y + TILE + len, 1, 1);
    }
  }
}

function cinderTile(ctx: Ctx, x: number, y: number, tx: number, ty: number, depth: number, up: boolean, dn: boolean, interior: boolean) {
  if (depth <= 1) {
    // soot-black brick, every few courses bound with a riveted iron plate
    const off = ty & 1 ? 8 : 0;
    box(ctx, 'rgba(0,0,0,0.4)', x, y, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.4)', x + off, y, 1, 8);
    box(ctx, 'rgba(0,0,0,0.35)', x, y + 8, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.4)', x + ((off + 8) % 16), y + 8, 1, 8);
    box(ctx, 'rgba(255,200,160,0.06)', x, y + 1, TILE, 1);
    if (hash2(tx >> 1, ty, 741) < 0.22 && up) {
      box(ctx, IRON_DK, x, y + 2, TILE, 10);
      box(ctx, IRON, x, y + 3, TILE, 8);
      box(ctx, IRON_LIT, x, y + 3, TILE, 1);
      box(ctx, '#c8a080', x + 3, y + 5, 1, 1);
      box(ctx, '#c8a080', x + 12, y + 5, 1, 1);
      box(ctx, '#c8a080', x + 3, y + 9, 1, 1);
      box(ctx, '#c8a080', x + 12, y + 9, 1, 1);
    }
    // cracks still holding heat
    if (hash2(tx, ty, 742) < 0.08) {
      box(ctx, HOT, x + 5, y + 4, 1, 3);
      box(ctx, HOT, x + 6, y + 7, 2, 1);
      box(ctx, '#ffd090', x + 5, y + 5, 1, 1);
    }
  }
  if (!up) {
    // the iron walkway: a plate on a lip, a seam glowing where it was welded
    box(ctx, IRON_DK, x, y, TILE, 5);
    box(ctx, interior ? '#5a4842' : '#6a564a', x, y, TILE, 4);
    box(ctx, IRON_LIT, x, y, TILE, 1);
    box(ctx, 'rgba(0,0,0,0.5)', x + (tx & 1 ? 0 : 15), y, 1, 4);
    if ((tx & 1) === 0) box(ctx, '#c8a080', x + 3, y + 2, 1, 1);
    if (hash2(tx, ty, 743) < 0.16) {
      box(ctx, HOT, x + 2, y + 4, 12, 1);
      box(ctx, '#ffd090', x + 5, y + 4, 4, 1);
    }
    if (hash2(tx, ty, 744) < 0.2) box(ctx, '#2a1e1c', x + 2 + Math.floor(hash2(tx, ty, 745) * 10), y - 1, 3, 1);
  }
  if (!dn) {
    box(ctx, 'rgba(0,0,0,0.45)', x, y + TILE - 3, TILE, 3);
    // a slag drip, still warm
    if (hash2(tx, ty, 746) < 0.15) {
      const dx = x + 3 + Math.floor(hash2(tx, ty, 747) * 9);
      box(ctx, '#5a2a1a', dx, y + TILE, 2, 3);
      box(ctx, HOT, dx, y + TILE + 3, 2, 1);
    }
  }
}

/** One-way platforms: lashed logs, a rotten boardwalk on stilts, an iron grating on a truss. */
export function drawOneWayFallen(ctx: Ctx, biome: FallenBiome, tx: number, ty: number, l: boolean, r: boolean) {
  if (biome === 'grecia') return drawOneWayGrecia(ctx, tx, ty, l, r);
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'hunt') {
    box(ctx, '#1c1214', x, y, TILE, 7);
    box(ctx, '#5a4034', x, y, TILE, 5);
    box(ctx, '#8a6a52', x, y, TILE, 1);
    box(ctx, 'rgba(20,10,8,0.5)', x, y + 3, TILE, 1);
    box(ctx, SNOW, x + Math.floor(hash2(tx, ty, 751) * 6), y - 1, 6, 1);
    if (tx % 3 === 0) {
      // a hide strap around the logs
      box(ctx, '#a08060', x + 7, y - 1, 2, 8);
      box(ctx, '#6a5040', x + 7, y + 4, 2, 1);
    }
    if (l || r) {
      const px = l ? x + 1 : x + TILE - 4;
      box(ctx, '#2a1c18', px, y - 6, 3, 18);
      box(ctx, '#4a3428', px, y - 6, 1, 18);
      box(ctx, SNOW_LIT, px, y - 7, 3, 1);
      box(ctx, '#7a5a44', l ? x : x + TILE - 2, y, 2, 5);
    }
    return;
  }
  if (biome === 'plague') {
    box(ctx, '#121c12', x, y, TILE, 6);
    // warped planks with gaps between
    for (let i = 0; i < 2; i++) {
      const px = x + i * 8, sag = hash2(tx, i, 752) < 0.3 ? 1 : 0;
      box(ctx, '#4a4a32', px, y + sag, 7, 4);
      box(ctx, '#6a6a46', px, y + sag, 7, 1);
    }
    box(ctx, MOSS, x + Math.floor(hash2(tx, ty, 753) * 10), y - 1, 4, 1);
    if (hash2(tx, ty, 754) < 0.4) box(ctx, MOSS_DK, x + 3 + Math.floor(hash2(tx, ty, 755) * 9), y + 5, 1, 3 + Math.floor(hash2(tx, ty, 756) * 4));
    if (l || r) {
      const px = l ? x + 2 : x + TILE - 5;
      box(ctx, '#2a2a1c', px, y, 3, 14);
      box(ctx, '#3a3a26', px, y, 1, 14);
      box(ctx, '#8a7a50', px - 1, y + 2, 5, 1);
    }
    return;
  }
  // iron grating on a riveted truss
  box(ctx, IRON_DK, x, y, TILE, 5);
  box(ctx, '#6a564a', x, y, TILE, 3);
  box(ctx, IRON_LIT, x, y, TILE, 1);
  ctx.fillStyle = IRON_DK;
  for (let i = 1; i < TILE; i += 3) ctx.fillRect(x + i, y + 1, 1, 2);
  ctx.strokeStyle = '#3a2e2c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 5);
  ctx.lineTo(x + 8, y + 9);
  ctx.lineTo(x + 16, y + 5);
  ctx.stroke();
  box(ctx, '#3a2e2c', x, y + 9, TILE, 1);
  if ((tx & 1) === 0) box(ctx, '#c8a080', x + 8, y + 1, 1, 1);
  if (l || r) {
    const bx = l ? x : x + TILE - 4;
    box(ctx, IRON_DK, bx, y - 1, 4, 11);
    box(ctx, IRON, bx + 1, y, 2, 9);
  }
}

/** Hunters' stakes, a bramble of thorns, hot iron teeth. */
export function drawSpikesFallen(ctx: Ctx, biome: FallenBiome, tx: number, ty: number): boolean {
  if (biome === 'grecia') return drawSpikesGrecia(ctx, tx, ty);
  const x = tx * TILE, y = ty * TILE;
  if (biome === 'hunt') {
    for (let i = 0; i < 3; i++) {
      const sx = x + 3 + i * 5, top = y + 3 + Math.floor(hash2(tx, i, 761) * 4), lean = hash2(tx, i, 762) < 0.5 ? -1 : 1;
      poly(ctx, [sx - 2, y + TILE, sx + lean, top, sx + 2, y + TILE], '#5a4030', '#0a0606', 0.6);
      box(ctx, '#c8b090', sx + lean, top + 1, 1, 3);
      box(ctx, '#7a2018', sx + lean, top + 4, 1, 2);
    }
    return true;
  }
  if (biome === 'plague') {
    ctx.strokeStyle = '#1e2a16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const sx = x + 2 + i * 6;
      ctx.moveTo(sx, y + TILE);
      ctx.quadraticCurveTo(sx + 5, y + 8, sx + 1, y + 3 + hash2(tx, i, 763) * 4);
    }
    ctx.stroke();
    ctx.fillStyle = '#b8c890';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 1 + Math.floor(hash2(tx, i, 764) * 14), y + 4 + Math.floor(hash2(tx, i, 765) * 10), 1, 1);
    box(ctx, '#8ad050', x + 4 + Math.floor(hash2(tx, ty, 766) * 8), y + 9, 2, 2);
    return true;
  }
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4 + 2;
    poly(ctx, [sx - 2, y + TILE, sx, y + 4 + hash2(tx, i, 767) * 3, sx + 2, y + TILE], '#4a3a36', '#0a0606', 0.5);
    box(ctx, HOT, sx - 1, y + TILE - 4, 2, 3);
  }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff6a20', x + 8, y + TILE - 2, 12, 5, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}

/** Meltwater, bog and quench water; bile and molten slag where the veil would be. */
export function drawLiquidFallen(ctx: Ctx, biome: FallenBiome, tt: T, x: number, y: number, top: boolean, tx: number, t: number): boolean {
  if (biome === 'grecia') return drawLiquidGrecia(ctx, tt, x, y, top, tx, t);
  if (tt === T.Water) {
    const wy = top ? 5 : 0;
    ctx.fillStyle = biome === 'hunt' ? 'rgba(40,56,84,0.88)' : biome === 'plague' ? 'rgba(34,46,26,0.92)' : 'rgba(30,24,28,0.9)';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    if (!top) return true;
    ctx.fillStyle = biome === 'hunt' ? 'rgba(190,210,240,0.8)' : biome === 'plague' ? 'rgba(150,180,90,0.7)' : 'rgba(230,140,90,0.7)';
    ctx.fillRect(x, y + wy, TILE, 1);
    const g = (t * 4 + hash2(tx, 0, 771) * 16) % 16;
    if (biome === 'hunt') {
      // floes of ice turning in the meltwater
      if (hash2(tx, 1, 771) < 0.4) {
        ctx.fillStyle = 'rgba(220,232,248,0.85)';
        ctx.fillRect(x + Math.floor(g * 0.4) + 2, y + wy - 1, 6, 2);
      }
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      ctx.fillRect(x + Math.floor(g), y + wy + 3, 3, 1);
    } else if (biome === 'plague') {
      // scum, and a bubble rising now and then
      ctx.fillStyle = 'rgba(110,140,60,0.7)';
      ctx.fillRect(x + Math.floor(hash2(tx, 2, 771) * 10), y + wy + 1, 5, 1);
      const b = (t * 0.7 + hash2(tx, 3, 771)) % 1;
      if (b < 0.2) {
        ctx.fillStyle = 'rgba(160,200,100,0.8)';
        ctx.fillRect(x + 7, y + wy - 1, 2, 1);
      }
    } else {
      // steam off the quench
      if (tier() > 0) blob(ctx, '#a89890', x + 8 + Math.sin(t + tx) * 4, y + wy - 6 - ((t * 8 + tx * 5) % 10), 10, 6, 0.12);
    }
    return true;
  }
  if (tt !== T.Veil) return false;
  const wy = top ? 3 + Math.sin(t * 2.4 + tx) * 0.8 : 0;
  if (biome === 'cinders' || biome === 'hunt') {
    // molten slag: a dark crust over a bright melt that shows in the cracks
    ctx.fillStyle = '#c8461a';
    ctx.fillRect(x, y + wy, TILE, TILE - wy);
    if (top) {
      ctx.fillStyle = '#ffb050';
      ctx.fillRect(x, y + wy, TILE, 1);
      ctx.fillStyle = '#4a1e14';
      const o = Math.floor((t * 3 + hash2(tx, 0, 772) * 16) % 16);
      ctx.fillRect(x + ((o + 2) % 12), y + wy + 2, 5, 2);
      ctx.fillRect(x + ((o + 9) % 12), y + wy + 5, 4, 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, '#ff7a2a', x + 8, y + 8, 14, 10, 0.35 + 0.1 * Math.sin(t * 3 + tx));
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  // bile: a poison-bright pool that boils
  ctx.fillStyle = '#2a4a14';
  ctx.fillRect(x, y + wy, TILE, TILE - wy);
  if (top) {
    ctx.fillStyle = '#b8f060';
    ctx.fillRect(x, y + wy, TILE, 1);
    const b = (t * 0.9 + hash2(tx, 4, 772)) % 1;
    ctx.fillStyle = 'rgba(190,250,110,0.85)';
    if (b < 0.5) {
      const r = Math.round(1 + b * 4);
      ctx.fillRect(x + 4 + Math.floor(hash2(tx, 5, 772) * 6), y + wy - r + 1, r, r);
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#7ad030', x + 8, y + 8, 14, 10, 0.3);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}
