// Environment art: parallax backgrounds per biome, baked tile chunks with
// stone/brick detail, static props, and the animated bits (water, veil pools,
// banners, torches) drawn live each frame.

import { makeCanvas, releaseCanvas, glow, rgba, shade, mix, poly, circle, ellipse, limb, type Ctx } from './draw';
import { RNG, hash2, fbm1, clamp } from '../core/math';
import { TILE, T, isSolid, type Grid, type Biome, type EntDef } from '../game/tiles';
import { buildParallaxCh2, drawDuskSky, drawPropCh2, drawPitch } from './env2';
import { buildParallaxCh3, drawValleySky, drawCaveSky, drawVoidSky, drawHiveWall, drawSolidCh3, drawOneWayCh3, drawLiquidCh3, drawPropCh3, drawLivePropCh3, isCh3, LIVE_CH3 } from './env3';
import { DEN_SEED, FEAST_SEED, drawDenWall, drawDenTile } from './env4';
import { buildParallaxCh4, drawSkyCh4, drawSolidCh4, drawOneWayCh4, drawSpikesCh4, drawLiquidCh4, drawPropCh4, drawLivePropCh4, isCh4, LIVE_CH4, BACKDROP_CH4 } from './env4';
import { buildParallaxCh6, drawSkyCh6, drawSolidCh6, drawOneWayCh6, drawSpikesCh6, drawLiquidCh6, drawPropCh6, drawLivePropCh6, isCh6, LIVE_CH6, BACKDROP_CH6 } from './env6';
import { fallenSky, fallenParallax, fallenProp, drawFallenLive, FALLEN_LIVE, isFallen, drawSolidFallen, drawOneWayFallen, drawSpikesFallen, drawLiquidFallen } from './fallenEnv';
import { buildParallaxCh5, drawSkyCh5, drawSolidCh5, drawOneWayCh5, drawSpikesCh5, drawLiquidCh5, drawPropCh5, drawLivePropCh5, isCh5, LIVE_CH5, BACKDROP_CH5 } from './env5';

export interface BiomePal {
  sky: [string, string, string];
  far: string;
  mid: string;
  near: string;
  fog: string;
  stone: string;
  stoneDark: string;
  cap: string;
  capTuft: string;
  back: string;
  backLine: string;
  moon: string | null;
  plat: string;
  ambient: string;
}

export const BIOMES: Record<Biome, BiomePal> = {
  hunt: {sky:['#101323','#31353c','#8a6755'],far:'#35363e',mid:'#252832',near:'#171d27',fog:'#b78c6e',stone:'#514751',stoneDark:'#25232d',cap:'#9c8770',capTuft:'#b09269',back:'#211f29',backLine:'#3f3540',moon:'#f1cf9c',plat:'#9a7f64',ambient:'#1a1422'},
  cinders: {sky:['#16131d','#593c3c','#bb754b'],far:'#64413b',mid:'#463139',near:'#251e25',fog:'#c28a65',stone:'#665049',stoneDark:'#33272b',cap:'#cb9665',capTuft:'#e4ad71',back:'#30242a',backLine:'#67483f',moon:'#db9b67',plat:'#d39d6d',ambient:'#2b1c21'},
  plague: {sky:['#101b22','#304e46','#7d9666'],far:'#374f46',mid:'#294637',near:'#192c29',fog:'#b6ce8d',stone:'#455947',stoneDark:'#202f2c',cap:'#9bb478',capTuft:'#bed28c',back:'#1b2e26',backLine:'#3c5941',moon:'#d4eda5',plat:'#a4b77b',ambient:'#12271f'},
  village: {
    sky: ['#0b0a16', '#2a1d3a', '#5a3550'], far: '#2a2338', mid: '#1c1727', near: '#120f19', fog: '#6b4a6a',
    stone: '#4a4250', stoneDark: '#26212c', cap: '#6d6070', capTuft: '#5a5560', back: '', backLine: '', moon: '#f1d9b0',
    plat: '#5c4433', ambient: '#140e1c',
  },
  sanctuary: {
    sky: ['#0d0a0c', '#1d1416', '#2a1c18'], far: '#1a1312', mid: '#140f0e', near: '#0d0909', fog: '#7a5030',
    stone: '#4f4238', stoneDark: '#2a221d', cap: '#6e5d4c', capTuft: '#7a6648', back: '#21191a', backLine: '#2c2220', moon: null,
    plat: '#6a4a30', ambient: '#120c0a',
  },
  temple: {
    sky: ['#07070d', '#121222', '#1c1a2e'], far: '#15142a', mid: '#100f1f', near: '#0a0914', fog: '#3a3560',
    stone: '#4b4a5a', stoneDark: '#232230', cap: '#6b6a7c', capTuft: '#4f5a50', back: '#1a1928', backLine: '#242336', moon: null,
    plat: '#4e4a5c', ambient: '#0a0912',
  },
  crypt: {
    sky: ['#050608', '#0c0f14', '#121820'], far: '#0e131a', mid: '#0a0e14', near: '#06080c', fog: '#2a3a48',
    stone: '#3d4248', stoneDark: '#1c1f24', cap: '#565c62', capTuft: '#3f5a48', back: '#14181d', backLine: '#1c2228', moon: null,
    plat: '#4a4038', ambient: '#06080a',
  },
  sanctum: {
    sky: ['#0c0806', '#22160c', '#3a2410'], far: '#2a1c10', mid: '#1e140c', near: '#120c08', fog: '#8a5a20',
    stone: '#5a4a38', stoneDark: '#2c2218', cap: '#a08050', capTuft: '#8a6a3a', back: '#22180f', backLine: '#33241a', moon: null,
    plat: '#7a5a30', ambient: '#140c06',
  },
  plain: {
    sky: ['#140c18', '#5a2428', '#d07a3e'], far: '#3a1c1e', mid: '#2a1416', near: '#1a0e10', fog: '#c8783a',
    stone: '#7a5a42', stoneDark: '#3a2a20', cap: '#a8845a', capTuft: '#8a7048', back: '', backLine: '', moon: null,
    plat: '#6a4a2a', ambient: '#1a0e0c',
  },
  tower: {
    sky: ['#0c0606', '#1e0e0c', '#2a1410'], far: '#24120e', mid: '#1a0c0a', near: '#100806', fog: '#8a3a1e',
    stone: '#6a4a38', stoneDark: '#2e1e16', cap: '#8a6a4e', capTuft: '#5a4030', back: '#2a1a14', backLine: '#3a2418', moon: null,
    plat: '#5a3a22', ambient: '#120806',
  },
  valley: {
    sky: ['#4a423a', '#94806a', '#d4b88e'], far: '#6a5a4c', mid: '#3e342c', near: '#221c18', fog: '#c8a47a',
    stone: '#9a8c74', stoneDark: '#3e352c', cap: '#cdbf9e', capTuft: '#8a7650', back: '', backLine: '', moon: null,
    plat: '#7a6448', ambient: '#1a1612',
  },
  hive: {
    sky: ['#0a0604', '#1c1008', '#2e1a0a'], far: '#2a1808', mid: '#1c1006', near: '#120a04', fog: '#a8641c',
    stone: '#4a3220', stoneDark: '#1e140c', cap: '#c07a24', capTuft: '#e0a040', back: '#2a1a0c', backLine: '#3a2410', moon: null,
    plat: '#a86a20', ambient: '#140a04',
  },
  trial: {
    sky: ['#04030a', '#0c0a1a', '#18142a'], far: '#1a1630', mid: '#141026', near: '#0c0a18', fog: '#6a5a9a',
    stone: '#a8a090', stoneDark: '#4a4640', cap: '#d8d0bc', capTuft: '#c9a04a', back: '', backLine: '', moon: null,
    plat: '#bab2a0', ambient: '#0a0814',
  },
  // Chapter IV: the plain of Dura at dusk, the blue-glazed city, and the furnace.
  dura: {
    sky: ['#100a26', '#8a2c40', '#f0a050'], far: '#5a3044', mid: '#38202a', near: '#1c1014', fog: '#e0904a',
    stone: '#b08a5a', stoneDark: '#4a3420', cap: '#dcb87c', capTuft: '#9a8448', back: '', backLine: '', moon: null,
    plat: '#8a6a40', ambient: '#1c0e0c',
  },
  babylon: {
    sky: ['#04050e', '#1c1638', '#8a4430'], far: '#2a2446', mid: '#18142c', near: '#0c0a18', fog: '#9a6a5a',
    stone: '#2a5a9a', stoneDark: '#14284a', cap: '#c9963a', capTuft: '#e2c070', back: '#1a2a4a', backLine: '#24386a', moon: '#f4e2c0',
    plat: '#8a6a3a', ambient: '#0a0a1c',
  },
  furnace: {
    sky: ['#060201', '#341006', '#5a1a06'], far: '#1e0c06', mid: '#140804', near: '#0a0402', fog: '#ff6a1a',
    stone: '#2e2420', stoneDark: '#140e0c', cap: '#3e2c22', capTuft: '#ff8a3a', back: '#1e1410', backLine: '#2e1e16', moon: null,
    plat: '#4a3424', ambient: '#1a0804',
  },
  // Chapter V: Babylon on the night of the feast.
  riverbed: {
    sky: ['#03040c', '#14214a', '#3a3452'], far: '#141c34', mid: '#0e1222', near: '#070910', fog: '#3a4a72',
    stone: '#54483a', stoneDark: '#221c14', cap: '#7a6e5a', capTuft: '#7a6a48', back: '#14120e', backLine: '#221e16', moon: '#eae6d6',
    plat: '#4a3a26', ambient: '#0a0e1c',
  },
  gardens: {
    sky: ['#02040c', '#1a2e58', '#2c4068'], far: '#121c30', mid: '#0c1620', near: '#060a10', fog: '#4a6a8a',
    stone: '#6a6458', stoneDark: '#2a2822', cap: '#3a5a2e', capTuft: '#6a9a4a', back: '#1a1e16', backLine: '#262a1e', moon: '#eae6d6',
    plat: '#6a6252', ambient: '#080c18',
  },
  palace: {
    sky: ['#04030e', '#261a48', '#6a3640'], far: '#1c1630', mid: '#120c1e', near: '#08060e', fog: '#ffb35a',
    stone: '#24386a', stoneDark: '#10182e', cap: '#d8ccb4', capTuft: '#e8c25a', back: '#221a2a', backLine: '#33263c', moon: '#eae6d6',
    plat: '#5a4430', ambient: '#120a18',
  },
  // Chapter VI: Persia, and the high places above it.
  hiddekel: {
    sky: ['#0a0c18', '#2a3a5a', '#8a7a6a'], far: '#22283a', mid: '#161a26', near: '#0a0c12', fog: '#8aa0b8',
    stone: '#6a5a44', stoneDark: '#2a2218', cap: '#5a6a3a', capTuft: '#8a9a5a', back: '#1e1a14', backLine: '#2a241a', moon: '#f0e8d0',
    plat: '#5a4a32', ambient: '#0c0e18',
  },
  shushan: {
    sky: ['#06060e', '#2a2440', '#5a4a5a'], far: '#1e1a2a', mid: '#14101c', near: '#0a080e', fog: '#c8a878',
    stone: '#8a7656', stoneDark: '#3a3024', cap: '#c8b48a', capTuft: '#3a6aa8', back: '#241e18', backLine: '#342a20', moon: null,
    plat: '#6a5438', ambient: '#100c14',
  },
  highplaces: {
    sky: ['#0a0614', '#3a2a5a', '#c89a6a'], far: '#2a2240', mid: '#1c162c', near: '#100c1a', fog: '#ffd89a',
    stone: '#c8c0b0', stoneDark: '#5a5448', cap: '#f0e8d8', capTuft: '#ffd88a', back: '#2a2434', backLine: '#3a3248', moon: null,
    plat: '#d8ccb0', ambient: '#140e1e',
  },
};

// ---------------------------------------------------------------- Parallax

export interface Layer {
  c: HTMLCanvasElement;
  /** World units covered by one tile of the strip. */
  w: number;
  h: number;
  fx: number;
  fy: number;
  /** Vertical anchor: strip bottom sits at (view bottom + oy) when camera is at room bottom. */
  oy: number;
  res: number;
}

export function buildParallax(biome: Biome, seed: number, interior: boolean, viewH: number, res: number): Layer[] {
  const pal = BIOMES[biome];
  if (isFallen(biome)) return fallenParallax(biome, pal, seed, interior, viewH, res);
  if (biome === 'plain' || biome === 'tower') return buildParallaxCh2(biome, pal, seed, viewH, res);
  if (isCh3(biome)) return buildParallaxCh3(biome, pal, seed, viewH, res);
  if (isCh4(biome)) return buildParallaxCh4(biome, pal, seed, viewH, res);
  if (isCh5(biome)) return buildParallaxCh5(biome, pal, seed, interior, viewH, res);
  if (isCh6(biome)) return buildParallaxCh6(biome, pal, seed, interior, viewH, res);
  const layers: Layer[] = [];
  const rng = new RNG(seed);
  const W = 1024;
  const H = Math.round(viewH * 1.6);
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    const m = makeCanvas(W * r, H * r);
    m.ctx.scale(r, r);
    draw(m.ctx, W, H);
    layers.push({ c: m.c, w: W, h: H, fx, fy, oy: 0, res: r });
  };
  if (!interior) {
    // Distant mountains + ruined spires of a fallen kingdom.
    mk(0.08, 0.04, (ctx, w, h) => {
      ctx.fillStyle = pal.far;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const n = fbm1(x / 180, seed, 4);
        ctx.lineTo(x, h * 0.42 + n * h * 0.22);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      // spires
      for (let i = 0; i < 7; i++) {
        const x = rng.range(20, w - 20), base = h * 0.58, sh = rng.range(60, 150);
        ctx.fillStyle = mix(pal.far, pal.mid, 0.3);
        ctx.fillRect(x - 5, base - sh, 10, sh);
        poly(ctx, [x - 7, base - sh, x, base - sh - 26, x + 7, base - sh], mix(pal.far, pal.mid, 0.3));
        if (rng.chance(0.5)) {
          ctx.fillStyle = rgba('#ff9a4a', 0.5);
          ctx.fillRect(x - 1, base - sh + 14, 2, 3);
        }
      }
    }, res * 0.6);
    mk(0.25, 0.1, (ctx, w, h) => {
      // Ruined city skyline: towers, broken domes, arches.
      const base = h * 0.7;
      ctx.fillStyle = pal.mid;
      ctx.fillRect(0, base, w, h - base);
      let x = 0;
      while (x < w) {
        const bw = rng.range(26, 70), bh = rng.range(30, 120);
        const kind = rng.int(0, 3);
        ctx.fillStyle = pal.mid;
        if (kind === 0) {
          ctx.fillRect(x, base - bh, bw, bh + 2);
          // broken top
          poly(ctx, [x, base - bh, x + bw * 0.3, base - bh - rng.range(5, 20), x + bw * 0.55, base - bh + 4, x + bw, base - bh - rng.range(0, 14), x + bw, base - bh], pal.mid);
        } else if (kind === 1) {
          ctx.fillRect(x, base - bh, bw, bh + 2);
          ctx.beginPath();
          ctx.arc(x + bw / 2, base - bh, bw / 2, Math.PI, 0);
          ctx.fill();
          ctx.fillRect(x + bw / 2 - 2, base - bh - bw / 2 - 12, 4, 14);
        } else if (kind === 2) {
          // arched bridge/aqueduct
          ctx.fillRect(x, base - bh * 0.6, bw, 8);
          for (let a = 0; a < 2; a++) ctx.fillRect(x + a * (bw - 6), base - bh * 0.6, 6, bh * 0.6);
        } else {
          poly(ctx, [x, base, x + bw / 2, base - bh - 20, x + bw, base], pal.mid);
        }
        // windows, some lit
        for (let k = 0; k < 4; k++) {
          if (rng.chance(0.3)) {
            const lit = rng.chance(0.35);
            ctx.fillStyle = lit ? rgba('#ff8a3d', 0.55) : rgba('#000000', 0.35);
            ctx.fillRect(x + rng.range(4, bw - 6), base - rng.range(10, bh - 6), 2.5, 4);
          }
        }
        x += bw + rng.range(-6, 18);
      }
    });
    mk(0.5, 0.2, (ctx, w, h) => {
      // Burnt houses & dead trees, closer and darker.
      const base = h * 0.82;
      ctx.fillStyle = pal.near;
      ctx.fillRect(0, base, w, h - base);
      let x = 0;
      while (x < w) {
        if (rng.chance(0.55)) {
          const bw = rng.range(40, 80), bh = rng.range(30, 60);
          ctx.fillStyle = pal.near;
          ctx.fillRect(x, base - bh, bw, bh + 2);
          poly(ctx, [x - 6, base - bh, x + bw * 0.4, base - bh - bh * 0.6, x + bw * 0.7, base - bh - bh * 0.3, x + bw + 6, base - bh], pal.near);
          // roof holes
          ctx.fillStyle = rgba(pal.fog, 0.15);
          ctx.fillRect(x + bw * 0.3, base - bh - 6, 8, 5);
          if (rng.chance(0.4)) {
            ctx.fillStyle = rgba('#ff7a33', 0.4);
            ctx.fillRect(x + bw * 0.6, base - bh * 0.6, 4, 6);
          }
          x += bw + rng.range(10, 40);
        } else {
          tree(ctx, x + 10, base, rng.range(40, 80), pal.near, rng);
          x += rng.range(30, 60);
        }
      }
    });
  } else {
    const isCrypt = biome === 'crypt';
    const isSanct = biome === 'sanctum' || biome === 'sanctuary';
    mk(0.15, 0.08, (ctx, w, h) => {
      // Vast arches and columns lost in darkness.
      const col = biome === 'sanctum' ? '#2a1c10' : pal.far;
      ctx.fillStyle = col;
      for (let x = 0; x < w; x += 128) {
        ctx.fillRect(x + 50, h * 0.15, 28, h * 0.85);
        ctx.beginPath();
        ctx.arc(x + 128, h * 0.32, 50, Math.PI, 0);
        ctx.lineWidth = 16;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
      if (!isCrypt) {
        for (let x = 0; x < w; x += 256) {
          // tall window glow
          const g = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.6);
          const wc = biome === 'sanctum' ? '#ffb347' : biome === 'sanctuary' ? '#ff9a4a' : '#8fa6d8';
          g.addColorStop(0, rgba(wc, 0.18));
          g.addColorStop(1, rgba(wc, 0));
          ctx.fillStyle = g;
          ctx.fillRect(x + 100, h * 0.1, 30, h * 0.5);
        }
      }
    }, res * 0.6);
    mk(0.4, 0.18, (ctx, w, h) => {
      const col = pal.mid;
      ctx.fillStyle = col;
      for (let x = 0; x < w; x += 160) {
        const cw = isCrypt ? 30 : 22;
        ctx.fillRect(x + 20, 0, cw, h);
        // capital
        ctx.fillRect(x + 14, h * 0.2, cw + 12, 8);
        ctx.fillRect(x + 14, h * 0.85, cw + 12, 10);
        if (isCrypt) {
          // burial niches
          for (let y = h * 0.3; y < h * 0.8; y += 26) {
            ctx.fillStyle = rgba('#000000', 0.5);
            ctx.fillRect(x + 70, y, 34, 14);
            ctx.fillStyle = col;
          }
        }
        if (isSanct && rng.chance(0.6)) {
          ctx.fillStyle = rgba(biome === 'sanctum' ? '#ffcf6b' : '#ff9a4a', 0.12);
          ctx.fillRect(x + 80, h * 0.4, 50, 70);
          ctx.fillStyle = col;
        }
      }
    });
  }
  return layers;
}

function tree(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  const branch = (x0: number, y0: number, len: number, a: number, w: number, d: number) => {
    const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (d > 0) {
      branch(x1, y1, len * 0.7, a - rng.range(0.3, 0.7), w * 0.65, d - 1);
      branch(x1, y1, len * 0.7, a + rng.range(0.3, 0.7), w * 0.65, d - 1);
    }
  };
  branch(x, base, h * 0.4, rng.range(-0.1, 0.1), 5, 3);
}

export function drawSky(ctx: Ctx, pal: BiomePal, w: number, h: number, interior: boolean, t: number) {
  if (pal === BIOMES.hunt || pal === BIOMES.plague || pal === BIOMES.cinders) return fallenSky(ctx, pal === BIOMES.hunt ? 'hunt' : pal === BIOMES.plague ? 'plague' : 'cinders', w, h, interior, t);
  if (pal === BIOMES.plain && !interior) {
    drawDuskSky(ctx, pal, w, h, t);
    return;
  }
  if (pal === BIOMES.valley) return drawValleySky(ctx, pal, w, h, t);
  if (pal === BIOMES.trial) return drawVoidSky(ctx, pal, w, h, t);
  if (pal === BIOMES.hive) return drawCaveSky(ctx, pal, w, h);
  if (pal === BIOMES.dura) return drawSkyCh4(ctx, 'dura', pal, w, h, t);
  if (pal === BIOMES.babylon) return drawSkyCh4(ctx, 'babylon', pal, w, h, t);
  if (pal === BIOMES.furnace) return drawSkyCh4(ctx, 'furnace', pal, w, h, t);
  if (pal === BIOMES.riverbed) return drawSkyCh5(ctx, 'riverbed', pal, w, h, interior, t);
  if (pal === BIOMES.gardens) return drawSkyCh5(ctx, 'gardens', pal, w, h, interior, t);
  if (pal === BIOMES.palace) return drawSkyCh5(ctx, 'palace', pal, w, h, interior, t);
  if (pal === BIOMES.hiddekel) return drawSkyCh6(ctx, 'hiddekel', pal, w, h, interior, t);
  if (pal === BIOMES.shushan) return drawSkyCh6(ctx, 'shushan', pal, w, h, interior, t);
  if (pal === BIOMES.highplaces) return drawSkyCh6(ctx, 'highplaces', pal, w, h, interior, t);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(0.6, pal.sky[1]);
  g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (!interior && pal.moon) {
    const mx = w * 0.72, my = h * 0.2, mr = h * 0.07;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, mx, my, mr * 7, '#a36a8a', 0.35);
    glow(ctx, mx, my, mr * 2.5, pal.moon, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    circle(ctx, mx, my, mr, pal.moon);
    circle(ctx, mx - mr * 0.3, my - mr * 0.15, mr * 0.85, rgba('#c9a88a', 0.35));
    // drifting cloud bands
    for (let i = 0; i < 4; i++) {
      const y = h * (0.12 + i * 0.09);
      const x = ((t * (4 + i * 2)) % (w + 400)) - 200;
      ctx.fillStyle = rgba('#2a1a30', 0.55);
      ctx.beginPath();
      ctx.ellipse(x, y, 220, 10 + i * 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse((x + w * 0.6) % (w + 400) - 100, y + 20, 160, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- Tiles & props

export class TileCache {
  chunks = new Map<string, HTMLCanvasElement>();
  static CH = 256;
  scale = 1;
  constructor(public grid: Grid, public biome: Biome, public interior: boolean, public seed: number, public ents: EntDef[], public solidFn: (t: T) => boolean, public cond: (c?: string, n?: string) => boolean) {}

  dispose() {
    for (const c of this.chunks.values()) releaseCanvas(c);
    this.chunks.clear();
  }

  invalidate() {
    this.dispose();
  }

  get(cx: number, cy: number): HTMLCanvasElement {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (!c) {
      c = this.bake(cx, cy);
      this.chunks.set(key, c);
    }
    return c;
  }

  draw(ctx: Ctx, view: { x: number; y: number; w: number; h: number }) {
    const CH = TileCache.CH;
    const x0 = Math.max(0, Math.floor(view.x / CH)), x1 = Math.floor((view.x + view.w) / CH);
    const y0 = Math.max(0, Math.floor(view.y / CH)), y1 = Math.floor((view.y + view.h) / CH);
    const maxX = Math.ceil((this.grid.w * TILE) / CH) - 1, maxY = Math.ceil((this.grid.h * TILE) / CH) - 1;
    for (let cy = y0; cy <= Math.min(y1, maxY); cy++)
      for (let cx = x0; cx <= Math.min(x1, maxX); cx++) {
        const c = this.get(cx, cy);
        ctx.drawImage(c, cx * CH, cy * CH, CH + 0.5, CH + 0.5);
      }
  }

  bakeAll() {
    const CH = TileCache.CH;
    const nx = Math.ceil((this.grid.w * TILE) / CH), ny = Math.ceil((this.grid.h * TILE) / CH);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) this.get(x, y);
  }

  private bake(cx: number, cy: number) {
    const CH = TileCache.CH;
    const s = this.scale;
    const m = makeCanvas(CH * s, CH * s);
    const ctx = m.ctx;
    ctx.scale(s, s);
    ctx.translate(-cx * CH, -cy * CH);
    const pal = BIOMES[this.biome];
    const g = this.grid;
    const tx0 = Math.floor((cx * CH) / TILE) - 1, ty0 = Math.floor((cy * CH) / TILE) - 1;
    const tx1 = tx0 + CH / TILE + 2, ty1 = ty0 + CH / TILE + 2;
    // Back wall for interiors.
    if (this.interior && this.biome === 'crypt' && this.seed === DEN_SEED) {
      // the lions' den dresses the crypt's walls as rough, clawed stone
      drawDenWall(ctx, Math.max(0, tx0) * TILE, Math.max(0, ty0) * TILE, Math.min(g.w, tx1 + 1) * TILE, Math.min(g.h, ty1 + 1) * TILE);
    } else if (this.interior && pal.back && (this.biome === 'sanctuary' || this.biome === 'crypt' || this.biome === 'tower')) {
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) continue;
          const x = tx * TILE, y = ty * TILE;
          const depthShade = clamp(ty / g.h, 0, 1);
          ctx.fillStyle = mix(pal.back, '#000000', 0.25 - depthShade * 0.2);
          ctx.fillRect(x, y, TILE, TILE);
          // bricks
          ctx.strokeStyle = pal.backLine;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x, y + 0.4);
          ctx.lineTo(x + TILE, y + 0.4);
          ctx.moveTo(x, y + 8.4);
          ctx.lineTo(x + TILE, y + 8.4);
          const off = ty % 2 ? 8 : 0;
          ctx.moveTo(x + off + 0.4, y);
          ctx.lineTo(x + off + 0.4, y + 8);
          ctx.moveTo(x + ((off + 8) % 16) + 0.4, y + 8);
          ctx.lineTo(x + ((off + 8) % 16) + 0.4, y + 16);
          ctx.stroke();
          if (hash2(tx, ty, 7) < 0.06) {
            ctx.fillStyle = rgba('#000000', 0.25);
            ctx.fillRect(x + 2, y + 2, 10, 5);
          }
        }
      }
    }
    if (this.interior && this.biome === 'hive') {
      drawHiveWall(ctx, Math.max(0, tx0) * TILE, Math.max(0, ty0) * TILE, Math.min(g.w, tx1 + 1) * TILE, Math.min(g.h, ty1 + 1) * TILE, this.seed);
    }
    // Static props (behind tiles). Backdrops (great walls, the ziggurat) go down
    // first so the props listed before them still stand in front.
    for (let pass = 0; pass < 2; pass++)
      for (const e of this.ents) {
        if (e.t !== 'decor' || e.fg) continue;
        const backdrop = BACKDROP_CH4.has(e.k) || BACKDROP_CH5.has(e.k) || BACKDROP_CH6.has(e.k);
        if (backdrop !== (pass === 0)) continue;
        if (!this.cond((e as { cond?: string }).cond, (e as { ncond?: string }).ncond)) continue;
        const px = e.x * TILE, py = e.y * TILE;
        const reach = backdrop ? ((e.w ?? 0) * TILE) / 2 : 0;
        if (px - reach > (cx + 1) * CH + 400 || px + reach < cx * CH - 800 || py < cy * CH - 400 || py > (cy + 1) * CH + 800) continue;
        drawProp(ctx, e, pal, this.biome, this.seed);
      }
    // Tiles.
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) continue;
        const t = g.get(tx, ty);
        if (t === T.Empty || t === T.Water || t === T.Veil || t === T.Gate) continue;
        this.drawTile(ctx, tx, ty, t, pal);
      }
    return m.c;
  }

  private drawTile(ctx: Ctx, tx: number, ty: number, t: T, pal: BiomePal) {
    const g = this.grid;
    const x = tx * TILE, y = ty * TILE;
    const solid = (a: number, b: number) => {
      if (a < 0 || a >= g.w || b >= g.h) return true;
      if (b < 0) return false;
      const tt = g.get(a, b);
      return isSolid(tt) && tt !== T.Gate;
    };
    if (t === T.OneWay) {
      if (isCh3(this.biome)) {
        drawOneWayCh3(ctx, this.biome, pal, tx, ty, g.get(tx - 1, ty) !== T.OneWay, g.get(tx + 1, ty) !== T.OneWay);
        return;
      }
      if (isCh4(this.biome)) {
        drawOneWayCh4(ctx, this.biome, pal, tx, ty, g.get(tx - 1, ty) !== T.OneWay, g.get(tx + 1, ty) !== T.OneWay);
        return;
      }
      if (isCh5(this.biome)) {
        drawOneWayCh5(ctx, this.biome, pal, tx, ty, g.get(tx - 1, ty) !== T.OneWay, g.get(tx + 1, ty) !== T.OneWay);
        return;
      }
      if (isCh6(this.biome)) {
        drawOneWayCh6(ctx, this.biome, pal, tx, ty, g.get(tx - 1, ty) !== T.OneWay, g.get(tx + 1, ty) !== T.OneWay);
        return;
      }
      if (isFallen(this.biome)) {
        drawOneWayFallen(ctx, this.biome, tx, ty, g.get(tx - 1, ty) !== T.OneWay, g.get(tx + 1, ty) !== T.OneWay);
        return;
      }
      // Plank or stone ledge with supports.
      const wood = this.biome === 'village' || this.biome === 'sanctuary' || this.biome === 'plain' || this.biome === 'tower';
      const c = wood ? pal.plat : pal.cap;
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(x, y, TILE, 5);
      ctx.fillStyle = c;
      ctx.fillRect(x, y, TILE, 3);
      ctx.fillStyle = rgba('#ffffff', 0.12);
      ctx.fillRect(x, y, TILE, 0.8);
      if (wood) {
        ctx.fillStyle = rgba('#000000', 0.35);
        ctx.fillRect(x + (hash2(tx, ty) * 10) | 0, y + 1, 0.8, 3);
      }
      const l = g.get(tx - 1, ty) !== T.OneWay, r = g.get(tx + 1, ty) !== T.OneWay;
      if (l || r) {
        // bracket
        ctx.fillStyle = shade(c, -0.4);
        const bx = l ? x + 1 : x + TILE - 4;
        poly(ctx, [bx, y + 5, bx + 3, y + 5, bx + 1.5, y + 11], shade(c, -0.4));
      }
      return;
    }
    if (t === T.Spikes) {
      if (isCh4(this.biome) && drawSpikesCh4(ctx, this.biome, tx, ty)) return;
      if (isCh5(this.biome) && drawSpikesCh5(ctx, this.biome, tx, ty)) return;
      if (isCh6(this.biome) && drawSpikesCh6(ctx, this.biome, tx, ty, g.get(tx, ty - 1) !== T.Spikes)) return;
      if (isFallen(this.biome) && drawSpikesFallen(ctx, this.biome, tx, ty)) return;
      const metal = this.biome === 'crypt' || this.biome === 'valley' ? '#c9c1b0' : this.biome === 'hive' ? '#4a2c14' : '#5a5560';
      for (let i = 0; i < 4; i++) {
        const sx = x + i * 4 + 2;
        poly(ctx, [sx - 2, y + TILE, sx, y + 4 + hash2(tx, i) * 3, sx + 2, y + TILE], metal, '#0a0a0e', 0.5);
        ctx.fillStyle = rgba('#ffffff', 0.25);
        ctx.fillRect(sx - 0.3, y + 6, 0.6, 6);
      }
      return;
    }
    const v = hash2(tx, ty, this.seed);
    // depth from exposed surface → darker inside the mass
    let depth = 4;
    for (let d = 1; d <= 3; d++) {
      if (!solid(tx, ty - d) || !solid(tx - d, ty) || !solid(tx + d, ty) || !solid(tx, ty + d)) {
        depth = d - 1;
        break;
      }
    }
    if (isCh3(this.biome)) {
      drawSolidCh3(ctx, this.biome, pal, tx, ty, t, depth, v, solid);
      this.drawMarks(ctx, x, y, t);
      return;
    }
    if (isCh4(this.biome)) {
      drawSolidCh4(ctx, this.biome, pal, tx, ty, t, depth, v, solid);
      this.drawMarks(ctx, x, y, t);
      return;
    }
    if (isCh5(this.biome)) {
      drawSolidCh5(ctx, this.biome, pal, tx, ty, t, depth, v, solid);
      this.drawMarks(ctx, x, y, t);
      return;
    }
    if (isCh6(this.biome)) {
      drawSolidCh6(ctx, this.biome, pal, tx, ty, t, depth, v, solid);
      this.drawMarks(ctx, x, y, t);
      return;
    }
    if (isFallen(this.biome)) {
      drawSolidFallen(ctx, this.biome, pal, tx, ty, t, depth, v, solid, this.interior);
      this.drawMarks(ctx, x, y, t);
      return;
    }
    let base = t === T.Brick ? shade(pal.stone, -0.08) : pal.stone;
    if (t === T.Seal) base = '#7a5a28';
    if (t === T.Wood) base = pal.plat;
    const dark = mix(base, pal.stoneDark, Math.min(1, depth / 3 + 0.1));
    ctx.fillStyle = mix(dark, '#000000', v * 0.12);
    ctx.fillRect(x, y, TILE, TILE);
    if (depth <= 1) {
      // Block masonry on visible faces.
      ctx.strokeStyle = rgba('#000000', 0.32);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const off = ty % 2 ? 0 : 8;
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x + TILE, y + 8);
      ctx.moveTo(x + off, y);
      ctx.lineTo(x + off, y + 8);
      ctx.moveTo(x + ((off + 8) % 16), y + 8);
      ctx.lineTo(x + ((off + 8) % 16), y + 16);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.04 + v * 0.04);
      ctx.fillRect(x + 1, y + 1, 6, 2);
    }
    const up = solid(tx, ty - 1), dn = solid(tx, ty + 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty);
    if (!up) {
      // Lit cap with ash / moss tufts.
      ctx.fillStyle = pal.cap;
      ctx.fillRect(x, y, TILE, 3);
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.fillRect(x, y, TILE, 0.9);
      ctx.fillStyle = pal.capTuft;
      for (let i = 0; i < 3; i++) {
        const fx = x + hash2(tx, i, 3) * 14;
        ctx.fillRect(fx, y - 1.5 - hash2(tx, i, 9) * 2, 1.2, 2.5);
      }
    }
    if (!dn) {
      ctx.fillStyle = rgba('#000000', 0.35);
      ctx.fillRect(x, y + TILE - 2.5, TILE, 2.5);
      if (hash2(tx, ty, 41) < 0.3 && this.interior) {
        // dripping roots / stalactite
        poly(ctx, [x + 4, y + TILE, x + 6, y + TILE + 5 + v * 5, x + 8, y + TILE], mix(dark, '#000000', 0.2));
      }
    }
    if (!lf) {
      ctx.fillStyle = rgba('#ffffff', 0.07);
      ctx.fillRect(x, y, 1.6, TILE);
    }
    if (!rt) {
      ctx.fillStyle = rgba('#000000', 0.3);
      ctx.fillRect(x + TILE - 1.8, y, 1.8, TILE);
    }
    if (this.seed === DEN_SEED && this.biome === 'crypt') drawDenTile(ctx, tx, ty, up);
    this.drawMarks(ctx, x, y, t);
  }

  /** Breakable, sealed and collapsing tiles carry the same marks in every biome. */
  private drawMarks(ctx: Ctx, x: number, y: number, t: T) {
    if (t === T.Cracked) {
      ctx.strokeStyle = '#e8b85a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 7, y + 6);
      ctx.lineTo(x + 5, y + 10);
      ctx.lineTo(x + 11, y + 16);
      ctx.moveTo(x + 7, y + 6);
      ctx.lineTo(x + 13, y + 5);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + 7, y + 8, 12, '#ffc35a', 0.25);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (t === T.Seal) {
      ctx.strokeStyle = '#e6c06a';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#a24bd6';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3);
      ctx.lineTo(x + 13, y + 13);
      ctx.stroke();
    }
    if (t === T.Collapse) {
      ctx.strokeStyle = rgba('#000000', 0.5);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + 8, y + 9);
      ctx.lineTo(x + 14, y + 6);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- Props

export function drawProp(ctx: Ctx, e: Extract<EntDef, { t: 'decor' }>, pal: BiomePal, biome: Biome, seed: number) {
  const x = e.x * TILE, y = e.y * TILE;
  const flip = e.flip ? -1 : 1;
  const rng = new RNG(seed + Math.floor(e.x * 31 + e.y * 7));
  const o = '#08060a';
  ctx.save();
  if (fallenProp(ctx,e) || drawPropCh2(ctx, e, pal, seed) || drawPropCh3(ctx, e, pal, seed) || drawPropCh4(ctx, e, pal, seed, isCh5(biome) || seed === FEAST_SEED) || drawPropCh5(ctx, e, pal, seed) || drawPropCh6(ctx, e, pal, seed)) {
    ctx.restore();
    return;
  }
  switch (e.k) {
    case 'house': {
      const w = (e.w ?? 8) * TILE, h = 5.5 * TILE;
      const c = mix(pal.stoneDark, '#1a1418', 0.5);
      ctx.fillStyle = c;
      ctx.fillRect(x - w / 2, y - h, w, h);
      // timber frame
      ctx.strokeStyle = '#140d0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - w / 2 + 2, y - h + 2, w - 4, h - 2);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h * 0.5);
      ctx.lineTo(x + w / 2, y - h * 0.5);
      ctx.moveTo(x - w / 4, y - h);
      ctx.lineTo(x - w / 4, y);
      ctx.moveTo(x + w / 4, y - h);
      ctx.lineTo(x + w / 4, y);
      ctx.stroke();
      // broken roof
      const v = e.v ?? 0;
      poly(ctx, [x - w / 2 - 8, y - h, x - w * 0.1, y - h - h * 0.6, x + (v % 2 ? w * 0.1 : w * 0.25), y - h - h * 0.35, x + w * 0.3, y - h - h * 0.45, x + w / 2 + 8, y - h], '#1a1012', o, 1);
      // roof ribs exposed
      ctx.strokeStyle = '#2a1a14';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x - w * 0.1 + i * 7, y - h - h * 0.5 + i * 4);
        ctx.lineTo(x - w * 0.1 + i * 7 + 6, y - h + 2);
        ctx.stroke();
      }
      // windows (charred)
      for (let i = 0; i < 2; i++) {
        const wx = x - w / 2 + w * (0.25 + i * 0.5) - 6;
        ctx.fillStyle = '#060406';
        ctx.fillRect(wx, y - h * 0.82, 12, 14);
        ctx.fillStyle = rgba('#ff6a2a', 0.25 + v * 0.05);
        ctx.fillRect(wx + 2, y - h * 0.82 + 8, 8, 5);
      }
      // door
      ctx.fillStyle = '#0a0607';
      ctx.fillRect(x - 7, y - 26, 14, 26);
      ctx.beginPath();
      ctx.arc(x, y - 26, 7, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'tree': {
      ctx.strokeStyle = '#0d0a0f';
      ctx.lineCap = 'round';
      const branch = (x0: number, y0: number, len: number, a: number, w: number, d: number) => {
        const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + rng.range(-4, 4), (y0 + y1) / 2, x1, y1);
        ctx.stroke();
        if (d > 0) {
          const n = rng.int(2, 3);
          for (let i = 0; i < n; i++) branch(x1, y1, len * rng.range(0.55, 0.75), a + rng.range(-0.8, 0.8), w * 0.62, d - 1);
        }
      };
      branch(x, y, 34 + (e.v ?? 0) * 6, rng.range(-0.15, 0.15), 6, 4);
      break;
    }
    case 'fence': {
      const w = (e.w ?? 4) * TILE;
      ctx.fillStyle = '#1a1210';
      for (let i = 0; i <= w; i += 7) {
        const hh = 14 + rng.range(-5, 4);
        ctx.fillRect(x + i, y - hh, 3, hh);
        poly(ctx, [x + i, y - hh, x + i + 1.5, y - hh - 3, x + i + 3, y - hh], '#1a1210');
      }
      ctx.fillRect(x, y - 10, w, 2);
      break;
    }
    case 'cart': {
      ctx.scale(flip, 1);
      const X = x * flip;
      poly(ctx, [X - 16, y - 18, X + 14, y - 18, X + 12, y - 8, X - 14, y - 8], '#3a2a1c', o, 1);
      ctx.strokeStyle = '#1a120c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X - 8, y - 6, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X + 14, y - 12);
      ctx.lineTo(X + 30, y - 4);
      ctx.stroke();
      // broken wheel on ground
      ctx.beginPath();
      ctx.ellipse(X + 8, y - 1, 6, 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'grave': {
      poly(ctx, [x - 5, y, x - 5, y - 12, x - 3, y - 15, x + 3, y - 15, x + 5, y - 12, x + 5, y], '#3a3440', o, 1);
      ctx.fillStyle = '#2a2430';
      ctx.fillRect(x - 0.8, y - 13, 1.6, 8);
      ctx.fillRect(x - 3, y - 11, 6, 1.6);
      break;
    }
    case 'lamppost': {
      ctx.fillStyle = '#16121a';
      ctx.fillRect(x - 1.2, y - 42, 2.4, 42);
      ctx.fillRect(x - 6, y - 42, 12, 2);
      poly(ctx, [x + 3, y - 40, x + 7, y - 40, x + 8, y - 33, x + 2, y - 33], '#1e1a20', o, 0.8);
      break;
    }
    case 'statue': case 'statue_broken': {
      ctx.scale(flip, 1);
      const X = x * flip;
      const c = shade(pal.stone, 0.05);
      poly(ctx, [X - 9, y, X - 9, y - 8, X + 9, y - 8, X + 9, y], shade(c, -0.2), o, 1);
      if (e.k === 'statue') {
        // robed praying figure
        poly(ctx, [X - 6, y - 8, X - 5, y - 30, X - 2, y - 38, X + 3, y - 38, X + 5, y - 30, X + 6, y - 8], c, o, 1);
        circle(ctx, X + 0.5, y - 41, 4, c);
        poly(ctx, [X + 1, y - 30, X + 6, y - 27, X + 2, y - 24], shade(c, 0.1), o, 0.8);
        ctx.fillStyle = rgba('#ffffff', 0.08);
        ctx.fillRect(X - 4, y - 36, 2, 26);
      } else {
        poly(ctx, [X - 6, y - 8, X - 5, y - 22, X + 2, y - 26, X + 6, y - 18, X + 6, y - 8], c, o, 1);
        poly(ctx, [X + 10, y, X + 12, y - 6, X + 18, y - 5, X + 17, y], c, o, 0.8);
      }
      break;
    }
    case 'rubble': {
      for (let i = 0; i < 7; i++) {
        const rx = x + rng.range(-14, 14), ry = y - rng.range(0, 6), s = rng.range(3, 7);
        poly(ctx, [rx - s, ry, rx - s * 0.6, ry - s * 0.8, rx + s * 0.5, ry - s, rx + s, ry], mix(pal.stone, pal.stoneDark, rng.range(0, 0.6)), o, 0.7);
      }
      break;
    }
    case 'grass': break;
    case 'tent': {
      ctx.scale(flip, 1);
      const X = x * flip;
      poly(ctx, [X - 22, y, X - 2, y - 34, X + 22, y], '#5a3a2a', o, 1);
      poly(ctx, [X - 2, y - 34, X + 22, y, X + 6, y], '#3e271c', null);
      poly(ctx, [X - 6, y, X - 1, y - 18, X + 3, y], '#140c08', null);
      ctx.strokeStyle = '#2a1a12';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X - 2, y - 34);
      ctx.lineTo(X - 2, y - 40);
      ctx.stroke();
      break;
    }
    case 'bedroll': {
      ctx.scale(flip, 1);
      ellipse(ctx, x * flip, y - 2, 12, 2.5, 0, '#6a3a30');
      ellipse(ctx, x * flip - 9, y - 3, 4, 2.5, 0, '#c8b89a');
      break;
    }
    case 'banner': {
      // static pole; cloth animates in drawLiveProps
      ctx.fillStyle = '#2a1e16';
      ctx.fillRect(x - 10, y, 20, 2);
      break;
    }
    case 'desk': {
      poly(ctx, [x - 14, y - 12, x + 14, y - 12, x + 14, y - 10, x - 14, y - 10], '#4a321f', o, 0.8);
      ctx.fillStyle = '#2e1f14';
      ctx.fillRect(x - 12, y - 10, 2, 10);
      ctx.fillRect(x + 10, y - 10, 2, 10);
      // books & scrolls
      ctx.fillStyle = '#7a2a2a';
      ctx.fillRect(x - 10, y - 16, 5, 4);
      ctx.fillStyle = '#2a4a6a';
      ctx.fillRect(x - 5, y - 15, 4, 3);
      ellipse(ctx, x + 6, y - 13.5, 5, 1.6, 0, '#e2d3b0');
      break;
    }
    case 'shelf': {
      const h = 34;
      poly(ctx, [x - 12, y, x - 12, y - h, x + 12, y - h, x + 12, y], '#3a2616', o, 1);
      for (let s = 0; s < 3; s++) {
        const sy = y - 4 - s * 11;
        ctx.fillStyle = '#24170d';
        ctx.fillRect(x - 11, sy, 22, 1.5);
        let bx = x - 10;
        while (bx < x + 9) {
          const bw = rng.range(1.5, 3.2), bh = rng.range(6, 9);
          ctx.fillStyle = rng.pick(['#6a2a24', '#2a4058', '#5a4a24', '#3a5a3a', '#4a2a4a', '#8a7a5a']);
          ctx.fillRect(bx, sy - bh, bw, bh);
          bx += bw + 0.4;
        }
      }
      break;
    }
    case 'crates': {
      for (let i = 0; i < 3; i++) {
        const cx = x - 8 + (i % 2) * 12, cy = y - 12 - (i === 2 ? 12 : 0) ;
        const bx = i === 2 ? x - 2 : cx;
        poly(ctx, [bx - 6, cy + 12, bx - 6, cy, bx + 6, cy, bx + 6, cy + 12], '#5a3e26', o, 0.8);
        ctx.strokeStyle = '#3a2616';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx - 6, cy);
        ctx.lineTo(bx + 6, cy + 12);
        ctx.stroke();
      }
      break;
    }
    case 'barrel': {
      ellipse(ctx, x, y - 8, 6, 8, 0, '#5a3a22');
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 12); ctx.lineTo(x + 6, y - 12);
      ctx.moveTo(x - 6, y - 4); ctx.lineTo(x + 6, y - 4);
      ctx.stroke();
      break;
    }
    case 'anvil': {
      poly(ctx, [x - 8, y - 10, x + 9, y - 10, x + 6, y - 6, x + 3, y - 6, x + 4, y, x - 4, y, x - 3, y - 6, x - 6, y - 6], '#3a3a40', o, 0.8);
      ctx.fillStyle = rgba('#ffffff', 0.15);
      ctx.fillRect(x - 7, y - 10, 15, 1);
      break;
    }
    case 'palisade': {
      for (let i = 0; i < 5; i++) {
        const px = x + i * 6 - 12;
        const hh = 60 + rng.range(-6, 6);
        poly(ctx, [px - 2.5, y, px - 2.5, y - hh, px, y - hh - 6, px + 2.5, y - hh, px + 2.5, y], '#3a2818', o, 0.8);
      }
      ctx.fillStyle = '#2a1c10';
      ctx.fillRect(x - 16, y - 40, 32, 3);
      ctx.fillRect(x - 16, y - 18, 32, 3);
      break;
    }
    case 'cave_back': {
      // Warm stone with lantern-lit wooden supports.
      const w = (e.w ?? 50) * TILE;
      for (let i = 0; i < w; i += 96) {
        ctx.fillStyle = '#2a1e18';
        ctx.fillRect(x + i + 40, y - 150, 6, 150);
        ctx.fillRect(x + i + 20, y - 150, 46, 5);
      }
      break;
    }
    case 'well': {
      poly(ctx, [x - 18, y, x - 18, y - 10, x - 14, y - 12, x + 14, y - 12, x + 18, y - 10, x + 18, y], shade(pal.stone, -0.1), o, 1);
      ctx.fillStyle = '#060406';
      ctx.fillRect(x - 15, y - 2, 30, 2);
      ctx.fillStyle = '#2a1c12';
      ctx.fillRect(x - 15, y - 36, 2.5, 24);
      ctx.fillRect(x + 12.5, y - 36, 2.5, 24);
      ctx.fillRect(x - 17, y - 38, 34, 3);
      break;
    }
    case 'stall': {
      ctx.scale(flip, 1);
      const X = x * flip;
      ctx.fillStyle = '#2a1c12';
      ctx.fillRect(X - 18, y - 30, 2, 30);
      ctx.fillRect(X + 16, y - 30, 2, 30);
      poly(ctx, [X - 22, y - 30, X + 22, y - 30, X + 18, y - 24, X - 18, y - 24], '#5a2626', o, 0.8);
      for (let i = 0; i < 5; i++) poly(ctx, [X - 18 + i * 8, y - 24, X - 14 + i * 8, y - 20, X - 10 + i * 8, y - 24], i % 2 ? '#5a2626' : '#8a7a5a');
      ctx.fillStyle = '#3a2616';
      ctx.fillRect(X - 16, y - 12, 32, 3);
      break;
    }
    case 'arch': {
      const c = mix(pal.stone, pal.stoneDark, 0.5);
      ctx.strokeStyle = c;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x - 40, y);
      ctx.lineTo(x - 40, y - 70);
      ctx.arc(x, y - 70, 40, Math.PI, 0);
      ctx.lineTo(x + 40, y);
      ctx.stroke();
      ctx.strokeStyle = rgba('#000000', 0.3);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'pillar': {
      const h = (e.h ?? 16) * TILE;
      const c = mix(pal.stone, pal.stoneDark, 0.35);
      ctx.fillStyle = c;
      ctx.fillRect(x - 10, y - h, 20, h);
      ctx.fillStyle = rgba('#ffffff', 0.06);
      ctx.fillRect(x - 8, y - h, 4, h);
      ctx.fillStyle = rgba('#000000', 0.25);
      ctx.fillRect(x + 4, y - h, 6, h);
      ctx.fillStyle = shade(c, 0.05);
      ctx.fillRect(x - 14, y - h, 28, 8);
      ctx.fillRect(x - 14, y - 10, 28, 10);
      // fluting
      ctx.strokeStyle = rgba('#000000', 0.2);
      ctx.lineWidth = 0.8;
      for (let i = -6; i <= 6; i += 4) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - h + 8);
        ctx.lineTo(x + i, y - 10);
        ctx.stroke();
      }
      break;
    }
    case 'gold_pillar': {
      const h = 21 * TILE;
      const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
      g.addColorStop(0, '#4a3418');
      g.addColorStop(0.35, '#b08a40');
      g.addColorStop(0.55, '#e8c66e');
      g.addColorStop(1, '#3a2810');
      ctx.fillStyle = g;
      ctx.fillRect(x - 12, y - h, 24, h);
      ctx.fillStyle = '#5a3e18';
      ctx.fillRect(x - 16, y - h, 32, 10);
      ctx.fillRect(x - 16, y - 12, 32, 12);
      ctx.strokeStyle = rgba('#000000', 0.25);
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 12, y - h + 40 + i * 50);
        ctx.lineTo(x + 12, y - h + 40 + i * 50);
        ctx.stroke();
      }
      break;
    }
    case 'chains': {
      const h = (e.h ?? 5) * TILE;
      ctx.strokeStyle = '#2a2830';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < h; i += 4) {
        ctx.beginPath();
        ctx.ellipse(x, y + i, 1.4, 2.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'roots': {
      const h = (e.h ?? 6) * TILE;
      ctx.strokeStyle = '#1c1612';
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.lineWidth = 3 - i * 0.5;
        ctx.beginPath();
        ctx.moveTo(x + i * 6, y);
        ctx.bezierCurveTo(x + i * 6 + 10, y + h * 0.3, x + i * 6 - 12, y + h * 0.6, x + i * 6 + rng.range(-6, 6), y + h * (0.6 + i * 0.1));
        ctx.stroke();
      }
      break;
    }
    case 'coffin': {
      ctx.scale(flip, 1);
      const X = x * flip;
      poly(ctx, [X - 14, y, X - 16, y - 6, X - 10, y - 9, X + 14, y - 8, X + 16, y - 3, X + 14, y], '#2a221c', o, 1);
      ctx.strokeStyle = '#5a4a30';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(X - 6, y - 8.5); ctx.lineTo(X - 6, y - 2);
      ctx.moveTo(X - 9, y - 6); ctx.lineTo(X - 3, y - 6);
      ctx.stroke();
      break;
    }
    case 'catacomb_back': case 'nave_back': case 'colonnade': case 'archive_back': case 'gold_hall': case 'sanctum_back': case 'rotunda': {
      drawHallBack(ctx, e, pal, biome, rng);
      break;
    }
    case 'temple_facade': {
      const w = (e.w ?? 30) * TILE;
      const c = mix(pal.stone, '#1a1420', 0.35);
      ctx.fillStyle = c;
      ctx.fillRect(x, y - 190, w, 190);
      // pediment
      poly(ctx, [x - 10, y - 190, x + w / 2, y - 260, x + w + 10, y - 190], shade(c, 0.05), o, 1.5);
      poly(ctx, [x + w * 0.2, y - 196, x + w / 2, y - 244, x + w * 0.8, y - 196], shade(c, -0.15));
      // columns
      for (let i = 0; i < 7; i++) {
        const cx = x + 30 + i * ((w - 60) / 6);
        ctx.fillStyle = shade(c, 0.1);
        ctx.fillRect(cx - 9, y - 180, 18, 180);
        ctx.fillStyle = rgba('#000000', 0.25);
        ctx.fillRect(cx + 3, y - 180, 6, 180);
        ctx.fillStyle = shade(c, 0.15);
        ctx.fillRect(cx - 12, y - 186, 24, 8);
      }
      // the great lamp emblem
      ctx.strokeStyle = '#b08a40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y - 215, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y - 232); ctx.lineTo(x + w / 2, y - 198);
      ctx.stroke();
      // crack across facade
      ctx.strokeStyle = rgba('#000000', 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, y - 250);
      ctx.lineTo(x + w * 0.42, y - 160);
      ctx.lineTo(x + w * 0.38, y - 90);
      ctx.lineTo(x + w * 0.45, y - 20);
      ctx.stroke();
      break;
    }
    case 'temple_door': case 'temple_door_open': {
      const open = e.k === 'temple_door_open';
      poly(ctx, [x - 22, y, x - 22, y - 70, x, y - 92, x + 22, y - 70, x + 22, y], '#140e10', '#5a4630', 2);
      if (!open) {
        ctx.fillStyle = '#3a2618';
        ctx.fillRect(x - 20, y - 70, 19, 70);
        ctx.fillRect(x + 1, y - 70, 19, 70);
        ctx.fillStyle = '#b08a40';
        circle(ctx, x - 4, y - 36, 2, '#b08a40');
        circle(ctx, x + 4, y - 36, 2, '#b08a40');
      } else {
        const g = ctx.createLinearGradient(0, y - 90, 0, y);
        g.addColorStop(0, rgba('#ffcf8a', 0.0));
        g.addColorStop(1, rgba('#ffcf8a', 0.25));
        ctx.fillStyle = g;
        ctx.fillRect(x - 20, y - 70, 40, 70);
      }
      break;
    }
    case 'inscription': {
      ctx.fillStyle = '#16141f';
      ctx.fillRect(x - 70, y - 22, 140, 44);
      ctx.strokeStyle = '#4a4058';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 70, y - 22, 140, 44);
      ctx.fillStyle = '#5a5068';
      for (let r = 0; r < 4; r++) {
        let gx = x - 62;
        while (gx < x + 60) {
          const gw = rng.range(2, 7);
          ctx.fillRect(gx, y - 15 + r * 9, gw, 2.2);
          gx += gw + rng.range(1.5, 4);
        }
      }
      break;
    }
    case 'pedestal': {
      poly(ctx, [x - 12, y, x - 9, y - 6, x - 6, y - 8, x - 6, y - 20, x - 9, y - 22, x + 9, y - 22, x + 6, y - 20, x + 6, y - 8, x + 9, y - 6, x + 12, y], '#3a3646', o, 1);
      ctx.fillStyle = rgba('#ffffff', 0.08);
      ctx.fillRect(x - 5, y - 20, 3, 12);
      break;
    }
    case 'shrine_alcove': {
      ctx.fillStyle = '#0c0a10';
      ctx.beginPath();
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x - 18, y - 40);
      ctx.arc(x, y - 40, 18, Math.PI, 0);
      ctx.lineTo(x + 18, y);
      ctx.fill();
      ctx.strokeStyle = '#6a5a3a';
      ctx.lineWidth = 2;
      ctx.stroke();
      poly(ctx, [x - 8, y, x - 6, y - 12, x + 6, y - 12, x + 8, y], '#3a3440', o, 0.8);
      break;
    }
    case 'pews': {
      const w = (e.w ?? 5) * TILE;
      for (let i = 0; i < w; i += 22) {
        ctx.fillStyle = '#2a1e18';
        ctx.fillRect(x + i - w / 2, y - 12, 18, 3);
        ctx.fillRect(x + i - w / 2, y - 20, 2, 20);
        ctx.fillRect(x + i - w / 2 + 16, y - 9, 2, 9);
      }
      break;
    }
    case 'bell_fallen': {
      ctx.save();
      ctx.translate(x, y - 14);
      ctx.rotate(0.5);
      poly(ctx, [-14, 14, -11, -8, -6, -14, 6, -14, 11, -8, 14, 14], '#5a4a2a', o, 1.2);
      ctx.fillStyle = rgba('#ffcf6b', 0.12);
      ctx.fillRect(-9, -10, 4, 22);
      ctx.restore();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 24);
      ctx.lineTo(x + 3, y - 10);
      ctx.stroke();
      break;
    }
    case 'mirror': {
      poly(ctx, [x - 16, y, x - 16, y - 64, x - 10, y - 76, x + 10, y - 76, x + 16, y - 64, x + 16, y], '#6a4a20', o, 1.5);
      const g = ctx.createLinearGradient(x - 12, y - 70, x + 12, y);
      g.addColorStop(0, '#2a2038');
      g.addColorStop(0.5, '#4a3a5a');
      g.addColorStop(1, '#1a1428');
      poly(ctx, [x - 12, y - 4, x - 12, y - 62, x - 8, y - 70, x + 8, y - 70, x + 12, y - 62, x + 12, y - 4], g);
      ctx.strokeStyle = rgba('#ffffff', 0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 60);
      ctx.lineTo(x + 2, y - 20);
      ctx.stroke();
      break;
    }
    case 'throne': {
      const c = '#7a5a28';
      poly(ctx, [x - 46, y, x - 46, y - 20, x + 46, y - 20, x + 46, y], '#3a2810', o, 1.5);
      poly(ctx, [x - 40, y - 20, x - 40, y - 120, x - 24, y - 150, x, y - 170, x + 24, y - 150, x + 40, y - 120, x + 40, y - 20], c, o, 1.5);
      poly(ctx, [x - 30, y - 30, x - 30, y - 115, x, y - 150, x + 30, y - 115, x + 30, y - 30], '#2a1c0c');
      ctx.strokeStyle = '#d6a640';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 120, 14, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawHallBack(ctx: Ctx, e: Extract<EntDef, { t: 'decor' }>, pal: BiomePal, biome: Biome, rng: RNG) {
  const x = e.x * TILE, y = e.y * TILE, w = (e.w ?? 40) * TILE;
  if (e.k === 'catacomb_back') {
    for (let i = 0; i < w; i += 64) {
      ctx.fillStyle = rgba('#000000', 0.35);
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.ellipse(x + i + 32, y - 40 - r * 34, 14, 8, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x + i + 18, y - 40 - r * 34, 28, 10);
        // bones in niche
        ctx.fillStyle = rgba('#c9c0a8', 0.25);
        ctx.fillRect(x + i + 22, y - 34 - r * 34, 18, 2);
        circle(ctx, x + i + 26, y - 37 - r * 34, 2.5, rgba('#c9c0a8', 0.25));
        ctx.fillStyle = rgba('#000000', 0.35);
      }
    }
  } else if (e.k === 'nave_back' || e.k === 'colonnade') {
    for (let i = 0; i < w; i += 112) {
      ctx.strokeStyle = rgba('#000000', 0.28);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y - 110);
      ctx.arc(x + i + 56, y - 110, 56, Math.PI, 0);
      ctx.stroke();
      // lancet window
      ctx.fillStyle = rgba('#000000', 0.4);
      ctx.beginPath();
      ctx.moveTo(x + i + 46, y - 60);
      ctx.lineTo(x + i + 46, y - 130);
      ctx.arc(x + i + 56, y - 130, 10, Math.PI, 0);
      ctx.lineTo(x + i + 66, y - 60);
      ctx.fill();
      ctx.fillStyle = rgba('#7a8ac8', 0.10);
      ctx.fillRect(x + i + 48, y - 128, 16, 66);
    }
  } else if (e.k === 'archive_back') {
    for (let i = 0; i < w; i += 40) {
      ctx.fillStyle = rgba('#2a1a10', 0.6);
      ctx.fillRect(x + i + 4, y - 110, 32, 110);
      for (let s = 0; s < 8; s++) {
        ctx.fillStyle = rgba(rng.pick(['#6a2a24', '#2a4058', '#5a4a24', '#3a5a3a']), 0.4);
        ctx.fillRect(x + i + 6, y - 106 + s * 13, 28, 9);
      }
    }
  } else if (e.k === 'gold_hall' || e.k === 'sanctum_back') {
    for (let i = 0; i < w; i += 90) {
      const g = ctx.createLinearGradient(0, y - 300, 0, y);
      g.addColorStop(0, rgba('#ffbe4d', 0));
      g.addColorStop(1, rgba('#ffbe4d', 0.08));
      ctx.fillStyle = g;
      ctx.fillRect(x + i + 20, y - 300, 50, 300);
      ctx.fillStyle = rgba('#000000', 0.25);
      ctx.fillRect(x + i + 40, y - 300, 8, 300);
      // hanging gold cloth
      ctx.fillStyle = rgba('#8a5a1a', 0.35);
      poly(ctx, [x + i + 60, y - 290, x + i + 84, y - 290, x + i + 80, y - 180, x + i + 72, y - 170, x + i + 64, y - 180], rgba('#8a5a1a', 0.35));
    }
  } else if (e.k === 'rotunda') {
    const cx = x, cy = y - 150;
    ctx.strokeStyle = rgba('#000000', 0.3);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy + 40, 230, Math.PI, 0);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgba('#4a4060', 0.4);
    ctx.beginPath();
    ctx.arc(cx, cy + 40, 200, Math.PI, 0);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 200, cy + 40 + Math.sin(a) * 200);
      ctx.lineTo(cx + Math.cos(a) * 230, cy + 40 + Math.sin(a) * 230);
      ctx.stroke();
    }
  }
}

/** Decor kinds animated by drawLiveProps behind the actors (pass these in the background pass). */
export const LIVE_DECOR: ReadonlySet<string> = new Set(['banner', ...LIVE_CH3, ...LIVE_CH4, ...LIVE_CH5, ...LIVE_CH6, ...FALLEN_LIVE]);
let liveCh3Frame = -1;

/** Animated props drawn every frame (banners, flames, water, veil pools, grass). */
export function drawLiveProps(ctx: Ctx, ents: EntDef[], t: number, view: { x: number; y: number; w: number; h: number }, cond: (c?: string, n?: string) => boolean, fg: boolean) {
  for (const e of ents) {
    if (e.t !== 'decor' && e.t !== 'light') continue;
    const x = e.x * TILE, y = e.y * TILE;
    if (x < view.x - 200 || x > view.x + view.w + 200 || y < view.y - 200 || y > view.y + view.h + 300) continue;
    if (e.t === 'decor') {
      if (LIVE_CH3.has(e.k) || LIVE_CH4.has(e.k) || LIVE_CH5.has(e.k) || LIVE_CH6.has(e.k) || FALLEN_LIVE.has(e.k)) {
        // Chapter III and IV overlays belong to the background pass; if this frame's
        // background pass did not include them, the foreground pass draws them.
        if (!fg) liveCh3Frame = t;
        if (!e.fg && (!fg || liveCh3Frame !== t) && cond(e.cond, e.ncond)) {
          if (FALLEN_LIVE.has(e.k)) drawFallenLive(ctx, e, t);
          else if (LIVE_CH3.has(e.k)) drawLivePropCh3(ctx, e, t);
          else if (LIVE_CH4.has(e.k)) drawLivePropCh4(ctx, e, t);
          else if (LIVE_CH5.has(e.k)) drawLivePropCh5(ctx, e, t);
          else drawLivePropCh6(ctx, e, t);
        }
        continue;
      }
      if (!!e.fg !== fg) continue;
      if (!cond(e.cond, e.ncond)) continue;
      if (e.k === 'banner') {
        const h = (e.h ?? 5) * TILE;
        const sway = Math.sin(t * 1.3 + e.x) * 3;
        const pts = [x - 9, y + 2, x + 9, y + 2, x + 9 + sway * 0.6, y + h * 0.85, x + sway, y + h, x - 9 + sway * 0.6, y + h * 0.85];
        poly(ctx, pts, e.v === 1 ? '#7a1218' : '#5a1e22', '#0a0608', 1);
        ctx.strokeStyle = e.v === 1 ? '#e2b85a' : '#c99a4a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + sway * 0.3, y + h * 0.4, 4, 0, Math.PI * 2);
        ctx.moveTo(x + sway * 0.3, y + h * 0.4 - 7);
        ctx.lineTo(x + sway * 0.3, y + h * 0.4 + 7);
        ctx.stroke();
      } else if (e.k === 'grass') {
        const w = (e.w ?? 4) * TILE;
        ctx.strokeStyle = '#0a080c';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < w; i += 3) {
          const hh = 5 + hash2(i, e.x | 0) * 7;
          const sw = Math.sin(t * 2 + i * 0.3) * 1.5;
          ctx.moveTo(x + i, y + 1);
          ctx.lineTo(x + i + sw, y - hh);
        }
        ctx.stroke();
      }
    } else if (!fg) {
      if (e.cond && !cond(e.cond)) continue;
      const fl = 0.85 + Math.sin(t * 13 + e.x) * 0.08 + Math.sin(t * 7.3 + e.y) * 0.07;
      if (e.k === 'torch') {
        ctx.fillStyle = '#2a1c12';
        ctx.fillRect(x - 1.2, y, 2.4, 10);
        poly(ctx, [x - 3, y, x + 3, y, x + 2, y + 3, x - 2, y + 3], '#3a2a1a');
        flame(ctx, x, y - 1, 5 * fl, t + e.x);
      } else if (e.k === 'brazier') {
        poly(ctx, [x - 7, y - 12, x + 7, y - 12, x + 4, y - 6, x + 1.5, y - 6, x + 3, y, x - 3, y, x - 1.5, y - 6, x - 4, y - 6], '#3a2a20', '#0a0608', 0.8);
        flame(ctx, x, y - 13, 8 * fl, t + e.x);
      } else if (e.k === 'lantern') {
        ctx.strokeStyle = '#1a120c';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y - 40);
        ctx.lineTo(x, y);
        ctx.stroke();
        const sw = Math.sin(t * 1.4 + e.x) * 1.5;
        poly(ctx, [x - 3 + sw, y, x + 3 + sw, y, x + 4 + sw, y + 7, x - 4 + sw, y + 7], '#c58d3a', '#1a120c', 0.8);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x + sw, y + 4, 8 * fl, '#ffcf6b', 0.9);
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.k === 'candles') {
        for (let i = 0; i < 3; i++) {
          const cx = x - 4 + i * 4, ch = 4 + i % 2 * 2;
          ctx.fillStyle = '#e8dcc0';
          ctx.fillRect(cx - 0.8, y - ch, 1.6, ch);
          flame(ctx, cx, y - ch, 2.2 * fl, t * 1.3 + i);
        }
      } else if (e.k === 'forge') {
        poly(ctx, [x - 12, y, x - 12, y - 16, x - 8, y - 22, x + 8, y - 22, x + 12, y - 16, x + 12, y], '#3a2c26', '#0a0608', 1);
        ctx.fillStyle = '#1a0c06';
        ctx.fillRect(x - 7, y - 14, 14, 9);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y - 9, 12 * fl, '#ff7a2a', 0.9);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
}

export function flame(ctx: Ctx, x: number, y: number, s: number, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y - s * 0.4, s * 2.2, '#ff8a2a', 0.55);
  const w = Math.sin(t * 17) * s * 0.15;
  poly(ctx, [x - s * 0.45, y, x - s * 0.2 + w, y - s * 0.9, x + w * 1.5, y - s * 1.5, x + s * 0.25 + w, y - s * 0.8, x + s * 0.45, y], 'rgba(255,140,50,0.85)');
  poly(ctx, [x - s * 0.22, y, x + w * 0.8, y - s * 0.9, x + s * 0.22, y], 'rgba(255,240,190,0.95)');
  ctx.globalCompositeOperation = 'source-over';
}

/** Water and veil pools, animated. */
export function drawLiquids(ctx: Ctx, g: Grid, t: number, view: { x: number; y: number; w: number; h: number }, biome: Biome = 'village') {
  const pitch = biome === 'plain' || biome === 'tower';
  const ch3 = isCh3(biome), ch4 = isCh4(biome), ch5 = isCh5(biome), ch6 = isCh6(biome), fallen = isFallen(biome);
  const tx0 = Math.max(0, Math.floor(view.x / TILE)), tx1 = Math.min(g.w - 1, Math.floor((view.x + view.w) / TILE));
  const ty0 = Math.max(0, Math.floor(view.y / TILE)), ty1 = Math.min(g.h - 1, Math.floor((view.y + view.h) / TILE));
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const tt = g.get(tx, ty);
      if (tt !== T.Water && tt !== T.Veil) continue;
      const x = tx * TILE, y = ty * TILE;
      const top = g.get(tx, ty - 1) !== tt;
      if (ch4 && drawLiquidCh4(ctx, biome, tt, x, y, top, tx, t)) continue;
      if (ch5 && drawLiquidCh5(ctx, biome, tt, x, y, top, tx, t)) continue;
      if (ch6 && drawLiquidCh6(ctx, biome, tt, x, y, top, tx, t)) continue;
      if (fallen && drawLiquidFallen(ctx, biome, tt, x, y, top, tx, t)) continue;
      if (tt === T.Water) {
        if (ch3 && drawLiquidCh3(ctx, biome, x, y, top, tx, t)) continue;
        ctx.fillStyle = 'rgba(40,70,110,0.45)';
        const wy = top ? Math.sin(t * 2 + tx * 0.8) * 0.8 + 6 : 0;
        ctx.fillRect(x, y + wy, TILE, TILE - wy);
        if (top) {
          ctx.fillStyle = 'rgba(160,200,255,0.35)';
          ctx.fillRect(x, y + wy, TILE, 0.8);
        }
      } else if (pitch) {
        drawPitch(ctx, x, y, top, tx, t);
      } else {
        const wy = top ? Math.sin(t * 3 + tx) * 1.2 + 3 : 0;
        ctx.fillStyle = '#2a0f3a';
        ctx.fillRect(x, y + wy, TILE, TILE - wy);
        ctx.globalCompositeOperation = 'lighter';
        if (top) {
          ctx.fillStyle = 'rgba(200,90,255,0.6)';
          ctx.fillRect(x, y + wy, TILE, 1);
          if (hash2(tx, Math.floor(t * 2), 5) < 0.25) glow(ctx, x + 8, y + wy, 6, '#c45cff', 0.6);
        }
        glow(ctx, x + 8, y + 8, 14, '#8a2ad6', 0.25);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
}

export function drawGate(ctx: Ctx, g: Grid, closedAmt: number) {
  if (closedAmt <= 0) return;
  for (let ty = 0; ty < g.h; ty++)
    for (let tx = 0; tx < g.w; tx++) {
      if (g.get(tx, ty) !== T.Gate) continue;
      if (g.get(tx, ty - 1) === T.Gate) continue;
      // column top: draw the whole portcullis down from here
      let h = 0;
      while (g.get(tx, ty + h) === T.Gate) h++;
      const x = tx * TILE, y = ty * TILE, ph = h * TILE * closedAmt;
      ctx.fillStyle = '#1a1620';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + i * 4, y, 1.8, ph);
      for (let j = 0; j < ph; j += 10) ctx.fillRect(x, y + j, TILE, 1.6);
      ctx.fillStyle = '#2a2430';
      for (let i = 0; i < 4; i++) poly(ctx, [x + 1.5 + i * 4, y + ph, x + 2.9 + i * 4, y + ph + 4, x + 4.3 + i * 4, y + ph], '#2a2430');
    }
}

export { limb };
