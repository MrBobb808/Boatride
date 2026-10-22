// Remnant's Rest: a warm valley settlement at dusk, the one place in the game
// that is not at war. A rose-and-amber sky over violet mountains, terraced
// hills of olive and vine, cypress rows, then the village itself: tents, then
// cabins, a market, a smithy, a healer's house, a gathering hall, gardens and
// a watchtower as the settlement's tier grows (game/settlement.ts).
// Static props bake with the tiles; the few that move are drawn live.

import { makeCanvas, poly, circle, ellipse, rgba, mix, type Ctx } from './draw';
import { RNG, hash2 } from '../core/math';
import { flag } from '../game/ctx';
import { TILE, T, type EntDef } from '../game/tiles';
import { blob, solidify, tier, wrapNoise, fillRidge, strokeRidge } from './env4';
import type { BiomePal, Layer } from './environment';

type Decor = Extract<EntDef, { t: 'decor' }>;
type PropFn = (ctx: Ctx, e: Decor, rng: RNG) => void;

const TAU = Math.PI * 2;
const OUT = '#1c1016';
// timber, plaster, stone, thatch, tile, canvas, leaf; the sun sits low on the right, so right edges catch it
const WOOD = '#6a4630', WOOD_DK = '#3e2818', WOOD_LIT = '#a4704a';
const PLASTER = '#c9a984', PLASTER_DK = '#8e7058', PLASTER_LIT = '#ecc89a';
const STONE = '#8e7e6c', STONE_DK = '#5a4c42', STONE_LIT = '#c4a688';
const THATCH = '#a6803e', THATCH_DK = '#6a4c22', THATCH_LIT = '#d8aa58';
const TILE_R = '#a4503a', TILE_DK = '#6a3024', TILE_LIT = '#d27a52';
const CANVAS = '#d8c6a2', CANVAS_DK = '#9c8a6c', CANVAS_LIT = '#f4dcb0';
const LEAF = '#4c5a30', LEAF_DK = '#2c3620', LEAF_LIT = '#86904a', OLIVE = '#6a7454', OLIVE_LIT = '#a8ae7a';
const WIN = '#ffcf70', WIN_HI = '#fff0b8', GLOW = '#ffb050';

function box(ctx: Ctx, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function line(ctx: Ctx, c: string, lw: number, pts: number[]) {
  ctx.strokeStyle = c;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

function shape(ctx: Ctx, pts: number[], fill: string, out = OUT, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  solidify(ctx, fill, out, lw);
}

function add(ctx: Ctx, c: string, x: number, y: number, rx: number, ry: number, a: number) {
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, c, x, y, rx, ry, a);
  ctx.globalCompositeOperation = 'source-over';
}

/** A lit window: frame, warm panes, a cross bar, and the glow it throws. */
function windowLit(ctx: Ctx, x: number, y: number, w: number, h: number, lit = true) {
  box(ctx, OUT, x - 1, y - 1, w + 2, h + 2);
  box(ctx, lit ? WIN : '#3a2a30', x, y, w, h);
  if (lit) box(ctx, WIN_HI, x + 1, y + 1, Math.max(1, w / 2 - 1), Math.max(1, h / 2 - 1));
  box(ctx, WOOD_DK, x + w / 2 - 0.5, y, 1, h);
  box(ctx, WOOD_DK, x, y + h / 2 - 0.5, w, 1);
  box(ctx, WOOD, x - 2, y + h + 1, w + 4, 2);
  if (lit) add(ctx, GLOW, x + w / 2, y + h / 2, w * 2.2, h * 2, 0.45);
}

/** A gable roof over [x0, x1] with eaves at y, ridge at top: thatch or clay tile courses. */
function roof(ctx: Ctx, x0: number, x1: number, y: number, top: number, kind: 'thatch' | 'tile') {
  const [c, dk, lit] = kind === 'thatch' ? [THATCH, THATCH_DK, THATCH_LIT] : [TILE_R, TILE_DK, TILE_LIT];
  const mx = (x0 + x1) / 2;
  shape(ctx, [x0 - 6, y + 2, mx, top, x1 + 6, y + 2], c);
  // courses following the slope
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y + 2);
  ctx.lineTo(mx, top);
  ctx.lineTo(x1 + 6, y + 2);
  ctx.closePath();
  ctx.clip();
  for (let yy = top + 4; yy < y + 2; yy += kind === 'thatch' ? 4 : 3) box(ctx, dk, x0 - 6, yy, x1 - x0 + 12, 1);
  if (kind === 'tile') for (let xx = x0 - 4; xx < x1 + 6; xx += 4) box(ctx, rgba(TILE_DK, 0.5), xx, top, 1, y - top + 2);
  // the sunlit slope
  poly(ctx, [mx, top, x1 + 6, y + 2, x1 + 1, y + 2, mx, top + 3], rgba(lit, 0.55));
  ctx.restore();
  line(ctx, lit, 1, [mx, top + 1, x1 + 5, y + 1]);
  box(ctx, dk, x0 - 6, y + 1, x1 - x0 + 12, 2);
}

/** A soft round clump of leaves, lit from the upper right. */
function leaves(ctx: Ctx, x: number, y: number, r: number, c = LEAF, lit = LEAF_LIT, dk = LEAF_DK) {
  circle(ctx, x, y, r + 1, OUT);
  circle(ctx, x, y, r, c);
  circle(ctx, x - r * 0.3, y + r * 0.35, r * 0.6, dk);
  circle(ctx, x + r * 0.3, y - r * 0.3, r * 0.55, lit);
}

// ---------------------------------------------------------------- props

/** The gate: two posts and a small thatched lintel, a carved sun over the way in. */
const restGate: PropFn = (ctx) => {
  for (const sx of [-14, 14]) {
    shape(ctx, [sx - 3, 0, sx - 3, -52, sx + 3, -52, sx + 3, 0], WOOD);
    box(ctx, WOOD_LIT, sx + 1, -50, 1, 48);
    box(ctx, STONE_DK, sx - 5, -4, 10, 4);
  }
  shape(ctx, [-20, -50, 20, -50, 20, -45, -20, -45], WOOD);
  roof(ctx, -18, 18, -52, -64, 'thatch');
  circle(ctx, 0, -40, 6, OUT);
  circle(ctx, 0, -40, 5, '#c89a4a');
  circle(ctx, 0, -40, 3, '#f0c870');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    line(ctx, '#c89a4a', 1, [Math.cos(a) * 6, -40 + Math.sin(a) * 6, Math.cos(a) * 8, -40 + Math.sin(a) * 8]);
  }
  line(ctx, OUT, 1, [-5, -45, -5, -40]);
};

/** A cypress: a dark green flame. */
const restCypress: PropFn = (ctx, e) => {
  const h = e.v ? 70 : 100, w = e.v ? 9 : 11;
  box(ctx, WOOD_DK, -2, -8, 4, 8);
  shape(ctx, [0, -h, w * 0.6, -h * 0.7, w, -h * 0.35, w * 0.8, -10, -w * 0.8, -10, -w, -h * 0.4, -w * 0.6, -h * 0.72], LEAF_DK);
  poly(ctx, [0, -h + 2, w * 0.55, -h * 0.7, w * 0.85, -h * 0.35, w * 0.6, -12, w * 0.2, -14, w * 0.25, -h * 0.5], LEAF);
  line(ctx, LEAF_LIT, 1, [1, -h + 3, w * 0.5, -h * 0.68, w * 0.78, -h * 0.36]);
};

/** A wattle fence of woven withies, w tiles long from x. */
const restFence: PropFn = (ctx, e) => {
  const len = (e.w ?? 3) * TILE;
  for (let x = 0; x <= len; x += 12) {
    shape(ctx, [x - 1.5, 0, x - 1.5, -20, x + 1.5, -21, x + 1.5, 0], WOOD, OUT, 0.6);
  }
  for (let r = 0; r < 3; r++) {
    const y = -6 - r * 5;
    line(ctx, OUT, 3, [0, y, len, y]);
    line(ctx, r & 1 ? WOOD_LIT : '#8a5e3a', 1.8, [0, y, len, y]);
  }
};

/** Tents: canvas pitched on a ridge pole, the door tied back on firelight; v 1 a long family tent, v 2 a striped newcomers' tent. */
const restTent: PropFn = (ctx, e) => {
  const v = e.v ?? 0, w = v === 1 ? 40 : 30, h = v === 1 ? 34 : 30;
  line(ctx, '#7a6a52', 0.8, [-w, 0, -w * 0.45, -h * 0.82]);
  line(ctx, '#7a6a52', 0.8, [w, 0, w * 0.45, -h * 0.82]);
  shape(ctx, [-w * 0.8, 0, -w * 0.3, -h, w * 0.3, -h, w * 0.8, 0], v === 2 ? '#c8a070' : CANVAS);
  if (v === 2) for (let i = -2; i <= 2; i++) poly(ctx, [i * w * 0.24 - 3, 0, i * w * 0.08 - 2, -h, i * w * 0.08 + 2, -h, i * w * 0.24 + 3, 0], '#a84a3a');
  poly(ctx, [w * 0.3, -h, w * 0.8, 0, w * 0.55, 0, w * 0.22, -h + 2], CANVAS_DK);
  poly(ctx, [-w * 0.3, -h, -w * 0.12, -h, -w * 0.5, 0, -w * 0.8, 0], CANVAS_LIT);
  // a patch, the ridge pole and its ends
  if (v !== 2) box(ctx, '#b8946a', -w * 0.5, -h * 0.5, 7, 6);
  line(ctx, WOOD_DK, 2, [-w * 0.36, -h - 1, w * 0.36, -h - 1]);
  line(ctx, WOOD, 2, [-w * 0.3, -h - 2, -w * 0.3, -h - 6]);
  // the door, warm inside
  shape(ctx, [-7, 0, 0, -h * 0.7, 7, 0], '#5a2e1a', OUT, 0.6);
  poly(ctx, [-5, 0, 0, -h * 0.6, 5, 0], '#e09040');
  poly(ctx, [-7, 0, 0, -h * 0.7, -2, -h * 0.4, -10, 0], CANVAS_DK);
  add(ctx, GLOW, 0, -6, 18, 10, 0.4);
};

/** A timber cabin: stone footing, logs, thatch or tile roof, a chimney, lit windows and a flower box. */
const restCabin: PropFn = (ctx, e) => {
  const v = e.v ?? 0, w = v === 2 ? 50 : v === 1 ? 42 : 46, h = v === 1 ? 36 : 40;
  box(ctx, OUT, -w - 1, -7, w * 2 + 2, 7);
  for (let x = -w; x < w; x += 8) box(ctx, (x / 8) & 1 ? STONE : STONE_DK, x, -6, 7, 5);
  shape(ctx, [-w, -6, -w, -h, w, -h, w, -6], v === 1 ? '#7a5236' : WOOD);
  for (let y = -h + 5; y < -6; y += 5) {
    box(ctx, WOOD_DK, -w, y, w * 2, 1);
    box(ctx, rgba(WOOD_LIT, 0.35), -w, y + 1, w * 2, 1);
  }
  // log ends at the corners
  for (let y = -h + 3; y < -6; y += 5) {
    circle(ctx, -w, y, 2, '#8a6040');
    circle(ctx, w, y, 2, WOOD_LIT);
  }
  // chimney
  const cx = v === 1 ? -w * 0.55 : w * 0.55;
  shape(ctx, [cx - 5, -h - 4, cx - 5, -h - 30, cx + 5, -h - 30, cx + 5, -h - 4], STONE);
  for (let y = -h - 28; y < -h - 4; y += 5) box(ctx, STONE_DK, cx - 5, y, 10, 1);
  box(ctx, STONE_LIT, cx + 3, -h - 29, 2, 24);
  roof(ctx, -w, w, -h, -h - 26, v === 1 ? 'tile' : 'thatch');
  // door
  shape(ctx, [-6, -6, -6, -26, 6, -26, 6, -6], '#4a2a18');
  box(ctx, WOOD, -5, -25, 4, 18);
  box(ctx, '#5a3420', 1, -25, 4, 18);
  box(ctx, '#e0a050', -1, -25, 2, 18);
  circle(ctx, 3, -15, 1, '#d8b060');
  windowLit(ctx, -w + 10, -h + 10, 11, 10);
  windowLit(ctx, w - 21, -h + 10, 11, 10);
  // flower box under the right window
  box(ctx, OUT, w - 23, -h + 23, 15, 4);
  box(ctx, WOOD_LIT, w - 22, -h + 23, 13, 3);
  for (let i = 0; i < 5; i++) circle(ctx, w - 21 + i * 3, -h + 22, 1.4, i & 1 ? '#e05a4a' : '#f0c850');
};

const restBedroll: PropFn = (ctx) => {
  shape(ctx, [-12, 0, -12, -4, 10, -5, 12, 0], '#7a3a2a', OUT, 0.6);
  ellipse(ctx, -9, -5, 4, 3, 0, '#c8b490');
  line(ctx, '#d8a040', 1, [-2, -4, -2, 0]);
};

const restWoodpile: PropFn = (ctx) => {
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 4 - r; i++) {
      const x = -12 + i * 7 + r * 3.5, y = -4 - r * 6;
      circle(ctx, x, y, 3.6, OUT);
      circle(ctx, x, y, 3, '#9a6a44');
      circle(ctx, x, y, 1.4, '#c8965a');
    }
  line(ctx, WOOD_DK, 1.5, [10, 0, 18, -16]);
  poly(ctx, [16, -18, 22, -15, 19, -12], '#9a9aa0');
};

/** The booths of the festival: four poles roofed with green branches, fruit hung in them, bread on the table. */
const restBooth: PropFn = (ctx) => {
  for (const x of [-22, 22]) shape(ctx, [x - 1.5, 0, x - 1.5, -44, x + 1.5, -44, x + 1.5, 0], WOOD, OUT, 0.6);
  for (let i = 0; i < 9; i++) {
    const x = -26 + i * 6.5;
    shape(ctx, [x - 6, -42, x, -50 - (i & 1) * 3, x + 6, -42, x + 2, -39], i & 1 ? LEAF : '#5a6a34', OUT, 0.6);
    line(ctx, LEAF_LIT, 1, [x - 3, -44, x + 4, -47 - (i & 1) * 3]);
  }
  for (const [x, c] of [[-12, '#a83a4a'], [-2, '#e0a040'], [10, '#7a3a6a'], [17, '#c8c050']] as const) {
    line(ctx, '#3a2a1a', 0.6, [x, -42, x, -36]);
    circle(ctx, x, -34, 2.4, c);
  }
  shape(ctx, [-18, -14, 18, -14, 18, -11, -18, -11], WOOD_LIT, OUT, 0.6);
  box(ctx, WOOD_DK, -16, -11, 2, 11);
  box(ctx, WOOD_DK, 14, -11, 2, 11);
  for (let i = 0; i < 3; i++) ellipse(ctx, -10 + i * 9, -16, 4, 2.4, 0, '#d89a50');
  ellipse(ctx, 12, -17, 2.5, 3.5, 0, '#a85040');
};

/** An olive tree: a twisted silver-grey trunk and a loose, silvery crown. v 1 is older and wider. */
const restTree: PropFn = (ctx, e, rng) => {
  const s = e.v ? 1.2 : 1;
  shape(ctx, [-6 * s, 0, -3 * s, -18 * s, -8 * s, -34 * s, -2 * s, -30 * s, 2 * s, -40 * s, 5 * s, -24 * s, 7 * s, 0], '#6a5a4a');
  line(ctx, '#9a8a74', 1, [4 * s, -4, 5 * s, -22 * s]);
  box(ctx, '#3a2e26', -2 * s, -14 * s, 3, 4);
  const pts: [number, number, number][] = [[-16, -38, 11], [0, -46, 13], [14, -38, 11], [-6, -32, 10], [8, -30, 9], [-20, -30, 7], [20, -30, 7]];
  for (const [x, y, r] of pts) leaves(ctx, x * s, y * s, r * s + rng.range(-1, 1), OLIVE, OLIVE_LIT, '#454c36');
  ctx.fillStyle = '#c8cca0';
  for (let i = 0; i < 18; i++) ctx.fillRect((rng.range(-22, 22)) * s, rng.range(-54, -26) * s, 1, 1);
};

/** The well: a round stone curb, a little tiled roof on posts, the windlass and its bucket. */
const restWell: PropFn = (ctx) => {
  for (const x of [-14, 14]) shape(ctx, [x - 2, -14, x - 2, -46, x + 2, -46, x + 2, -14], WOOD, OUT, 0.8);
  roof(ctx, -16, 16, -46, -58, 'tile');
  line(ctx, OUT, 3, [-14, -32, 14, -32]);
  line(ctx, WOOD_LIT, 1.5, [-14, -32, 14, -32]);
  line(ctx, '#c8b08a', 0.8, [2, -32, 2, -22]);
  shape(ctx, [-1, -22, 5, -22, 4, -16, 0, -16], '#7a5a3a', OUT, 0.6);
  line(ctx, WOOD_DK, 1.5, [14, -32, 19, -28]);
  // the curb, stones in a ring
  shape(ctx, [-17, 0, -17, -15, 17, -15, 17, 0], STONE);
  ellipse(ctx, 0, -15, 17, 4, 0, OUT);
  ellipse(ctx, 0, -15, 15.5, 3, 0, '#1a1418');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
    const x = -16 + i * 7 + (r & 1) * 3.5;
    box(ctx, (i + r) & 1 ? STONE_DK : STONE_LIT, x, -13 + r * 4.5, 6, 4);
  }
  box(ctx, rgba('#ffd890', 0.35), 12, -14, 4, 13);
};

const restCrates: PropFn = (ctx) => {
  shape(ctx, [-16, 0, -16, -14, -2, -14, -2, 0], WOOD);
  line(ctx, WOOD_DK, 1, [-16, -14, -2, 0]);
  shape(ctx, [-12, -14, -12, -24, -2, -24, -2, -14], '#7a5236');
  shape(ctx, [0, 0, 1, -10, 7, -12, 12, -9, 12, 0], '#a08a64');
  line(ctx, '#7a6a4a', 1, [4, -11, 6, -6]);
};

/** The market stall: a counter of goods under a striped awning. */
const restStall: PropFn = (ctx) => {
  for (const x of [-26, 26]) shape(ctx, [x - 2, 0, x - 2, -44, x + 2, -44, x + 2, 0], WOOD, OUT, 0.8);
  // awning in red and cream, scalloped
  shape(ctx, [-32, -40, -28, -50, 28, -50, 32, -40], '#e8d8b8');
  for (let i = 0; i < 8; i++) {
    const x = -32 + i * 8;
    if (i & 1) continue;
    poly(ctx, [x, -40, x + 4, -50, x + 12, -50, x + 8, -40], '#b8443a');
  }
  for (let i = 0; i < 8; i++) {
    const x = -32 + i * 8;
    ctx.fillStyle = i & 1 ? '#e8d8b8' : '#b8443a';
    ctx.beginPath();
    ctx.arc(x + 4, -40, 4, 0, Math.PI);
    ctx.fill();
  }
  line(ctx, OUT, 1, [-32, -40, 32, -40]);
  // the counter and its goods
  shape(ctx, [-28, 0, -28, -16, 28, -16, 28, 0], WOOD);
  for (let x = -26; x < 26; x += 9) box(ctx, WOOD_DK, x, -15, 1, 15);
  box(ctx, WOOD_LIT, -28, -17, 56, 2);
  for (const [x, c] of [[-20, '#c84a3a'], [-10, '#e8a040'], [2, '#6a8a3a'], [13, '#7a3a6a']] as const) {
    ellipse(ctx, x, -18, 6, 2.5, 0, '#8a6a40');
    for (let i = 0; i < 4; i++) circle(ctx, x - 3 + i * 2, -20 - (i & 1), 1.8, c);
  }
  for (let i = 0; i < 3; i++) shape(ctx, [19 + i * 3, -17, 19 + i * 3, -24, 21 + i * 3, -25, 22 + i * 3, -17], '#c8b080', OUT, 0.4);
  line(ctx, '#3a2a1a', 0.8, [-18, -40, -18, -32]);
  ellipse(ctx, -18, -30, 3, 2, 0, '#c8964a');
};

/** Baskets of the harvest and sacks of grain. */
const restProduce: PropFn = (ctx) => {
  for (const [x, c] of [[-8, '#c84a3a'], [6, '#8a3a6a']] as const) {
    shape(ctx, [x - 7, 0, x - 8, -9, x + 8, -9, x + 7, 0], '#9a7040', OUT, 0.7);
    line(ctx, '#6a4a24', 0.8, [x - 7, -5, x + 7, -5]);
    for (let i = 0; i < 5; i++) circle(ctx, x - 5 + i * 2.5, -10 - (i & 1), 2, c);
  }
  shape(ctx, [14, 0, 13, -14, 17, -18, 22, -15, 22, 0], '#c8b08a', OUT, 0.7);
  line(ctx, '#8a7050', 1, [14, -13, 21, -13]);
};

const restBench: PropFn = (ctx) => {
  shape(ctx, [-12, -8, 12, -8, 12, -6, -12, -6], WOOD_LIT, OUT, 0.6);
  box(ctx, WOOD_DK, -10, -6, 2, 6);
  box(ctx, WOOD_DK, 8, -6, 2, 6);
  shape(ctx, [-12, -16, 12, -16, 12, -14, -12, -14], WOOD, OUT, 0.6);
  box(ctx, WOOD_DK, -11, -14, 1.5, 6);
  box(ctx, WOOD_DK, 9.5, -14, 1.5, 6);
};

const restPlanter: PropFn = (ctx, e) => {
  shape(ctx, [-9, 0, -10, -8, 10, -8, 9, 0], STONE);
  box(ctx, STONE_LIT, 6, -7, 2, 6);
  const c = e.v ? ['#e05a6a', '#f0a0b0'] : ['#f0c850', '#fff0a0'];
  for (let i = 0; i < 6; i++) {
    const x = -7 + i * 2.8, y = -10 - (i % 3) * 2;
    line(ctx, LEAF, 1, [x, -8, x, y]);
    circle(ctx, x, y, 1.8, c[i & 1]);
  }
};

const restCart: PropFn = (ctx) => {
  shape(ctx, [-22, -10, 18, -10, 22, -22, -22, -22], WOOD);
  for (let x = -20; x < 18; x += 6) box(ctx, WOOD_DK, x, -21, 1, 11);
  shape(ctx, [-20, -22, -14, -30, 4, -32, 16, -26, 18, -22], '#c8a85a', OUT, 0.8);
  line(ctx, '#e8c870', 1, [-12, -29, 12, -27]);
  line(ctx, WOOD_DK, 2, [18, -14, 34, -6]);
  circle(ctx, -6, -8, 9, OUT);
  circle(ctx, -6, -8, 7.5, WOOD);
  circle(ctx, -6, -8, 2, WOOD_DK);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    line(ctx, WOOD_DK, 1, [-6, -8, -6 + Math.cos(a) * 7, -8 + Math.sin(a) * 7]);
  }
};

const restTimber: PropFn = (ctx) => {
  for (let r = 0; r < 2; r++) {
    shape(ctx, [-24 + r * 4, -r * 6, -24 + r * 4, -6 - r * 6, 22 - r * 4, -6 - r * 6, 22 - r * 4, -r * 6], '#8a6040', OUT, 0.8);
    circle(ctx, 22 - r * 4, -3 - r * 6, 3, '#c89a64');
  }
  line(ctx, WOOD_DK, 1.5, [-26, 0, -18, -24]);
};

/** The smithy: an open shed on stout posts, a stone forge and its chimney, the anvil, tools on the back wall, a quench barrel. */
const restSmithy: PropFn = (ctx) => {
  // back wall of stone
  shape(ctx, [-60, 0, -60, -46, 44, -46, 44, 0], STONE_DK);
  for (let r = 0; r < 6; r++) for (let x = -60 + (r & 1) * 6; x < 44; x += 12) box(ctx, rgba(STONE, 0.6), x + 1, -44 + r * 7.5, 10, 6);
  // tools hung on the wall
  line(ctx, WOOD, 1.5, [-10, -38, 30, -38]);
  for (let i = 0; i < 5; i++) {
    const x = -6 + i * 8;
    line(ctx, '#3a3438', 1.5, [x, -38, x, -26 + (i & 1) * 3]);
    if (i % 2 === 0) box(ctx, '#7a7a82', x - 2, -28, 4, 3);
    else circle(ctx, x, -24, 2, '#6a6a72');
  }
  // chimney over the hearth
  shape(ctx, [-50, -40, -48, -84, -32, -84, -30, -40], STONE);
  for (let y = -82; y < -40; y += 5) box(ctx, STONE_DK, -49, y, 18, 1);
  box(ctx, STONE_LIT, -34, -83, 2, 42);
  // posts and shingle roof sloping to the front
  for (const x of [-58, -6, 42]) shape(ctx, [x - 2.5, 0, x - 2.5, -52, x + 2.5, -52, x + 2.5, 0], WOOD);
  shape(ctx, [-66, -50, 50, -50, 50, -58, -66, -62], TILE_R);
  for (let x = -64; x < 50; x += 5) box(ctx, TILE_DK, x, -60 + ((x + 64) / 116) * 4, 1, 8);
  line(ctx, TILE_LIT, 1, [-66, -50, 50, -50]);
  // anvil on its stump
  shape(ctx, [10, 0, 11, -10, 17, -10, 18, 0], '#6a4a30', OUT, 0.8);
  shape(ctx, [4, -10, 24, -10, 26, -15, 14, -16, 8, -15], '#4a4a52');
  box(ctx, '#9a9aa2', 9, -16, 14, 1);
  // quench barrel
  shape(ctx, [30, 0, 29, -14, 39, -14, 38, 0], WOOD);
  box(ctx, '#3a3438', 29, -11, 10, 1);
  box(ctx, '#3a3438', 29, -4, 10, 1);
  ellipse(ctx, 34, -14, 5, 1.5, 0, '#3a5a7a');
  add(ctx, '#ff8a3a', -40, -14, 40, 24, 0.35);
};

/** Before the healer came: a lean-to of poles and hides. */
const restLean: PropFn = (ctx) => {
  shape(ctx, [-24, 0, -24, -30, 20, -10, 20, 0], '#7a5a3e');
  line(ctx, WOOD_DK, 2.5, [-26, -32, 24, -8]);
  line(ctx, WOOD_DK, 2, [-24, 0, -24, -32]);
  poly(ctx, [-10, 0, -10, -16, 6, -10, 6, 0], '#3a2418');
};

/** The healer's house: stone below, plaster above, a clay-tiled roof, herbs drying under the eaves, a round window and the mortar sign. */
const restHealer: PropFn = (ctx) => {
  const w = 50, h = 46;
  shape(ctx, [-w, 0, -w, -h, w, -h, w, 0], PLASTER);
  box(ctx, PLASTER_LIT, w - 6, -h, 5, h - 14);
  box(ctx, PLASTER_DK, -w, -h, 4, h);
  shape(ctx, [-w, 0, -w, -14, w, -14, w, 0], STONE);
  for (let r = 0; r < 2; r++) for (let x = -w + (r & 1) * 5; x < w; x += 10) box(ctx, STONE_DK, x, -13 + r * 6.5, 1, 6);
  box(ctx, STONE_DK, -w, -7, w * 2, 1);
  // timber framing
  for (const x of [-w, -18, 18, w - 3]) box(ctx, WOOD, x, -h, 3, h - 14);
  box(ctx, WOOD, -w, -h, w * 2, 3);
  roof(ctx, -w, w, -h, -h - 26, 'tile');
  // herbs drying under the eaves
  for (let i = 0; i < 7; i++) {
    const x = -w + 6 + i * 14;
    line(ctx, '#5a4a2a', 0.8, [x, -h + 2, x, -h + 8]);
    shape(ctx, [x - 3, -h + 8, x + 3, -h + 8, x + 1, -h + 16, x - 1, -h + 16], i % 3 === 0 ? '#7a8a4a' : i % 3 === 1 ? '#9a7aa8' : '#a8a050', OUT, 0.4);
  }
  // door with a lit fan over it
  shape(ctx, [-8, 0, -8, -26, 8, -26, 8, 0], '#4a2a1a');
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.arc(0, -26, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = WIN;
  ctx.beginPath();
  ctx.arc(0, -26, 6.5, Math.PI, 0);
  ctx.fill();
  box(ctx, '#e8a050', -6, -25, 3, 24);
  box(ctx, '#6a3a22', -3, -25, 9, 24);
  add(ctx, GLOW, 0, -20, 18, 18, 0.4);
  windowLit(ctx, -38, -36, 12, 12);
  circle(ctx, 32, -32, 7, OUT);
  circle(ctx, 32, -32, 6, WIN);
  line(ctx, WOOD_DK, 1, [26, -32, 38, -32]);
  line(ctx, WOOD_DK, 1, [32, -38, 32, -26]);
  add(ctx, GLOW, 32, -32, 16, 16, 0.45);
  // the sign: a mortar and pestle
  line(ctx, WOOD_DK, 2, [w, -40, w + 12, -40]);
  line(ctx, '#3a2a1a', 0.6, [w + 10, -40, w + 10, -36]);
  shape(ctx, [w + 4, -36, w + 16, -36, w + 16, -26, w + 4, -26], WOOD_LIT, OUT, 0.6);
  shape(ctx, [w + 7, -33, w + 13, -33, w + 12, -29, w + 8, -29], '#e8e0d0', OUT, 0.4);
  line(ctx, '#e8e0d0', 1.2, [w + 11, -34, w + 14, -38]);
};

/** The herb garden: low beds of sage and lavender, and a rack of drying bundles. */
const restHerbs: PropFn = (ctx, e, rng) => {
  shape(ctx, [-16, 0, -16, -4, 16, -4, 16, 0], '#5a3a26', OUT, 0.6);
  for (let i = 0; i < 12; i++) {
    const x = -14 + i * 2.6, hh = rng.range(4, 9);
    line(ctx, i & 1 ? '#7a8a5a' : '#6a7a4a', 1.4, [x, -4, x + rng.range(-1, 1), -4 - hh]);
    if (i % 3 === 0) circle(ctx, x, -4 - hh, 1.3, '#a88ad0');
  }
  line(ctx, WOOD_DK, 1.5, [18, 0, 18, -22]);
  line(ctx, WOOD_DK, 1.5, [30, 0, 30, -22]);
  line(ctx, WOOD, 1.5, [16, -20, 32, -20]);
  for (let i = 0; i < 3; i++) shape(ctx, [20 + i * 4, -20, 23 + i * 4, -20, 22 + i * 4, -13, 21 + i * 4, -13], '#8a9a5a', OUT, 0.3);
};

/** The hall's site, staked out: cut stones and a line of string. */
const restStones: PropFn = (ctx) => {
  for (const [x, w, h] of [[-40, 14, 8], [-24, 10, 6], [10, 16, 10], [30, 12, 7], [26, 10, 5]] as const) {
    shape(ctx, [x, 0, x, -h, x + w, -h, x + w, 0], STONE, OUT, 0.7);
    box(ctx, STONE_LIT, x + w - 2, -h, 2, h);
  }
  for (const x of [-60, 60]) line(ctx, WOOD, 1.5, [x, 0, x, -10]);
  line(ctx, '#d8c8a0', 0.6, [-60, -9, 60, -9]);
};

/** The hall going up: posts, beams, rafters, scaffold and a ladder. */
const restFrame: PropFn = (ctx) => {
  shape(ctx, [-120, 0, -120, -10, 120, -10, 120, 0], STONE);
  for (let x = -120; x < 120; x += 12) box(ctx, STONE_DK, x, -9, 1, 9);
  for (let x = -116; x <= 116; x += 29) shape(ctx, [x - 2, -10, x - 2, -70, x + 2, -70, x + 2, -10], WOOD);
  line(ctx, OUT, 4, [-120, -70, 120, -70]);
  line(ctx, WOOD_LIT, 2, [-120, -70, 120, -70]);
  for (let x = -116; x <= 116; x += 29) {
    line(ctx, OUT, 3, [x, -70, 0, -112]);
    line(ctx, '#8a6040', 1.4, [x, -70, 0, -112]);
  }
  line(ctx, WOOD, 2, [-87, -40, -29, -40]);
  // scaffold and a ladder
  for (const x of [60, 80]) line(ctx, '#9a7a54', 1.5, [x, 0, x, -60]);
  for (const y of [-20, -40, -58]) line(ctx, '#9a7a54', 1.5, [56, y, 84, y]);
  line(ctx, '#b08a5a', 1.2, [-70, 0, -60, -64]);
  line(ctx, '#b08a5a', 1.2, [-64, 0, -54, -64]);
  for (let i = 1; i < 8; i++) line(ctx, '#b08a5a', 1, [-70 + i * 1.25, -i * 8, -64 + i * 1.25, -i * 8]);
};

/**
 * The gathering hall: a long house of stone and plaster under a steep thatch,
 * tall lit windows down its side, open doors spilling light onto the steps,
 * a round window over them and a little bell-cote on the ridge.
 */
const restHall: PropFn = (ctx) => {
  const w = 120, h = 76;
  shape(ctx, [-w, 0, -w, -h, w, -h, w, 0], PLASTER);
  box(ctx, PLASTER_DK, -w, -h, 6, h);
  box(ctx, PLASTER_LIT, w - 8, -h, 6, h - 12);
  shape(ctx, [-w - 2, 0, -w - 2, -14, w + 2, -14, w + 2, 0], STONE);
  for (let r = 0; r < 2; r++) for (let x = -w + (r & 1) * 6; x < w; x += 12) box(ctx, STONE_DK, x, -13 + r * 6.5, 1, 6);
  box(ctx, STONE_DK, -w, -7, w * 2, 1);
  for (let x = -w; x <= w; x += 40) box(ctx, WOOD, x - 2, -h, 4, h - 14);
  box(ctx, WOOD, -w, -h, w * 2, 3);
  roof(ctx, -w, w, -h, -h - 54, 'thatch');
  // bell-cote on the ridge
  shape(ctx, [-7, -h - 50, -7, -h - 70, 7, -h - 70, 7, -h - 50], WOOD);
  poly(ctx, [-10, -h - 70, 0, -h - 80, 10, -h - 70], THATCH_DK, OUT, 0.8);
  box(ctx, '#2a1a14', -4, -h - 66, 8, 12);
  shape(ctx, [-3, -h - 56, -3, -h - 62, 0, -h - 65, 3, -h - 62, 3, -h - 56], '#c8a040', OUT, 0.5);
  // tall arched windows
  for (const x of [-96, -64, 56, 88]) {
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.arc(x + 6, -54, 7, Math.PI, 0);
    ctx.rect(x - 1, -54, 14, 30);
    ctx.fill();
    ctx.fillStyle = WIN;
    ctx.beginPath();
    ctx.arc(x + 6, -54, 5.5, Math.PI, 0);
    ctx.rect(x + 0.5, -54, 11, 28.5);
    ctx.fill();
    box(ctx, WOOD_DK, x + 5.5, -59, 1, 33);
    box(ctx, WOOD_DK, x, -42, 12, 1);
    box(ctx, WIN_HI, x + 2, -56, 2, 12);
    add(ctx, GLOW, x + 6, -40, 22, 26, 0.5);
  }
  // the doors and the light spilling out of them
  shape(ctx, [-20, 0, -20, -40, 20, -40, 20, 0], '#3a2214');
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.arc(0, -40, 20, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#ffd890';
  ctx.beginPath();
  ctx.arc(0, -40, 17, Math.PI, 0);
  ctx.rect(-17, -40, 34, 40);
  ctx.fill();
  box(ctx, '#ffefc0', -8, -50, 16, 50);
  poly(ctx, [-17, 0, -17, -40, -26, -36, -26, 2], '#5a3420', OUT, 0.8);
  poly(ctx, [17, 0, 17, -40, 26, -36, 26, 2], '#6a3e24', OUT, 0.8);
  // figures inside, at the long table
  for (const x of [-10, -3, 5, 11]) {
    circle(ctx, x, -20, 2.4, '#5a3a2a');
    box(ctx, '#6a4a3a', x - 2.5, -18, 5, 9);
  }
  box(ctx, '#7a4a2a', -16, -10, 32, 3);
  add(ctx, '#ffc070', 0, -18, 40, 32, 0.55);
  // round window over the doors
  circle(ctx, 0, -h + 4, 9, OUT);
  circle(ctx, 0, -h + 4, 7.5, WIN);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    line(ctx, WOOD_DK, 1, [Math.cos(a) * -7, -h + 4 + Math.sin(a) * -7, Math.cos(a) * 7, -h + 4 + Math.sin(a) * 7]);
  }
  // steps
  shape(ctx, [-28, 0, -28, -3, 28, -3, 28, 0], STONE_LIT, OUT, 0.6);
  shape(ctx, [-24, -3, -24, -5, 24, -5, 24, -3], STONE, OUT, 0.5);
};

/** The fig tree: broad lobed leaves on a pale, many-limbed trunk. */
const restFig: PropFn = (ctx, e, rng) => {
  shape(ctx, [-8, 0, -4, -24, -16, -46, -10, -48, 0, -32, 6, -52, 12, -50, 6, -24, 9, 0], '#8a7a6a');
  line(ctx, '#b8a894', 1, [5, -4, 7, -26]);
  const clumps: [number, number, number][] = [[-30, -50, 14], [-12, -64, 17], [10, -66, 17], [28, -52, 14], [-20, -44, 11], [18, -44, 11], [0, -50, 13]];
  for (const [x, y, r] of clumps) leaves(ctx, x, y, r + rng.range(-1, 1), '#4e6a30', '#8aa04a', '#2e4220');
  // a few figs, and the lobes of near leaves
  for (let i = 0; i < 9; i++) circle(ctx, rng.range(-34, 34), rng.range(-70, -40), 1.6, '#6a3a5a');
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-36, 36), y = rng.range(-74, -40);
    poly(ctx, [x, y, x - 4, y - 3, x - 1, y - 6, x + 2, y - 4, x + 4, y - 7, x + 5, y - 2], '#9ab450');
  }
};

/** The gardens: raised beds of greens and leeks, bean poles in vines, sunflowers at the end. */
const restGarden: PropFn = (ctx, e, rng) => {
  const half = ((e.w ?? 7) * TILE) / 2;
  for (const [x0, x1] of [[-half, -10], [-6, half - 20]] as const) {
    shape(ctx, [x0, 0, x0, -5, x1, -5, x1, 0], '#6a4a30', OUT, 0.6);
    box(ctx, '#3a2618', x0 + 1, -5, x1 - x0 - 2, 1);
    for (let x = x0 + 4; x < x1 - 2; x += 6) {
      if ((x >> 2) & 1) {
        circle(ctx, x, -8, 3.4, OUT);
        circle(ctx, x, -8, 2.8, '#7a9a48');
        circle(ctx, x + 0.8, -8.8, 1.2, '#a8c060');
      } else for (let k = -1; k <= 1; k++) line(ctx, '#8aaa5a', 1, [x + k, -5, x + k * 2, -12 - rng.range(0, 3)]);
    }
  }
  // bean poles tied at the top, wound with vines
  for (const x of [-30, -18]) {
    line(ctx, '#8a6a44', 1.2, [x - 5, 0, x, -30]);
    line(ctx, '#8a6a44', 1.2, [x + 5, 0, x, -30]);
    for (let i = 0; i < 6; i++) {
      leaves(ctx, x + Math.sin(i * 1.7) * 3, -6 - i * 4, 2.2, LEAF, LEAF_LIT, LEAF_DK);
    }
  }
  // sunflowers turned to the last of the sun
  for (let i = 0; i < 3; i++) {
    const x = half - 16 + i * 6, h = 30 + i * 4;
    line(ctx, '#5a7a30', 1.4, [x, 0, x + 1, -h]);
    leaves(ctx, x - 3, -h * 0.5, 2.5, LEAF, LEAF_LIT, LEAF_DK);
    circle(ctx, x + 1, -h, 5, OUT);
    circle(ctx, x + 1, -h, 4.3, '#f0b830');
    circle(ctx, x + 1.6, -h, 2, '#5a3a1a');
  }
  // a watering can
  shape(ctx, [-2, 0, -3, -7, 5, -7, 4, 0], '#7a8a92', OUT, 0.5);
  line(ctx, '#7a8a92', 1, [4, -5, 9, -9]);
};

const restSheaves: PropFn = (ctx) => {
  for (const x of [-30, -12, 8, 26]) {
    shape(ctx, [x - 5, 0, x - 2, -14, x - 6, -22, x + 6, -22, x + 2, -14, x + 5, 0], THATCH_LIT, OUT, 0.6);
    line(ctx, '#8a6a2a', 1.2, [x - 3, -12, x + 3, -12]);
  }
};

const restCairn: PropFn = (ctx) => {
  for (const [x, y, rx, ry] of [[-6, -4, 8, 4], [4, -4, 7, 4], [-1, -10, 7, 3.5], [0, -15, 5, 3]] as const) {
    ellipse(ctx, x, y, rx + 1, ry + 1, 0, OUT);
    ellipse(ctx, x, y, rx, ry, 0, STONE);
    ellipse(ctx, x + rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.4, 0, STONE_LIT);
  }
  line(ctx, OUT, 3, [0, -16, 0, -50]);
  line(ctx, WOOD, 1.5, [0, -16, 0, -50]);
};

/** The watchtower: four braced legs, a railed platform with a lamp, a peaked roof. */
const restTower: PropFn = (ctx) => {
  const top = -110;
  for (const x of [-16, 16]) shape(ctx, [x - 2.5, 0, x * 0.75 - 2, top, x * 0.75 + 2, top, x + 2.5, 0], WOOD);
  for (let i = 0; i < 3; i++) {
    const y0 = -i * 36, y1 = y0 - 36, a = 16 - i * 1.3, b = 16 - (i + 1) * 1.3;
    line(ctx, OUT, 2.6, [-a, y0, b, y1]);
    line(ctx, OUT, 2.6, [a, y0, -b, y1]);
    line(ctx, '#8a6040', 1.4, [-a, y0, b, y1]);
    line(ctx, '#8a6040', 1.4, [a, y0, -b, y1]);
    line(ctx, WOOD_DK, 2, [-b, y1, b, y1]);
  }
  // ladder up the middle
  for (const x of [-3, 3]) line(ctx, '#b08a5a', 1, [x, 0, x, top]);
  for (let y = -6; y > top; y -= 7) line(ctx, '#b08a5a', 1, [-3, y, 3, y]);
  // platform, railing, posts and roof
  shape(ctx, [-20, top, 20, top, 20, top + 4, -20, top + 4], WOOD_LIT);
  for (const x of [-18, -6, 6, 18]) box(ctx, WOOD, x - 1, top - 14, 2, 14);
  line(ctx, OUT, 3, [-19, top - 12, 19, top - 12]);
  line(ctx, WOOD_LIT, 1.5, [-19, top - 12, 19, top - 12]);
  for (const x of [-18, 18]) shape(ctx, [x - 1.5, top - 12, x - 1.5, top - 34, x + 1.5, top - 34, x + 1.5, top - 12], WOOD, OUT, 0.6);
  shape(ctx, [-26, top - 32, 0, top - 52, 26, top - 32], THATCH);
  for (let y = top - 48; y < top - 32; y += 4) box(ctx, THATCH_DK, -20 + (top - 32 - y), y, 2 * (20 - (top - 32 - y)), 1);
  line(ctx, THATCH_LIT, 1, [0, top - 51, 25, top - 33]);
  // the lamp
  line(ctx, '#3a2a1a', 0.6, [8, top - 32, 8, top - 26]);
  shape(ctx, [5, top - 26, 11, top - 26, 12, top - 18, 4, top - 18], '#6a4a2a', OUT, 0.5);
  box(ctx, WIN, 6, top - 25, 4, 6);
  add(ctx, GLOW, 8, top - 22, 22, 22, 0.6);
};

/** A low hedge along the back of a terrace, w tiles long from x. */
const restTerrace: PropFn = (ctx, e, rng) => {
  const len = (e.w ?? 20) * TILE;
  for (let x = 4; x < len; x += rng.range(8, 14)) {
    const r = rng.range(4, 7);
    leaves(ctx, x, -r + 1, r, e.v ? '#4a5a2e' : LEAF, LEAF_LIT, LEAF_DK);
  }
  for (let x = 0; x < len; x += rng.range(5, 9)) circle(ctx, x, -rng.range(4, 10), 1, rng.chance(0.5) ? '#f0d0e0' : '#f0e0a0');
};

const PROPS: Record<string, PropFn> = {
  rest_gate: restGate, rest_cypress: restCypress, rest_fence: restFence, rest_tent: restTent, rest_cabin: restCabin,
  rest_bedroll: restBedroll, rest_woodpile: restWoodpile, rest_booth: restBooth, rest_tree: restTree, rest_well: restWell,
  rest_crates: restCrates, rest_stall: restStall, rest_produce: restProduce, rest_bench: restBench, rest_planter: restPlanter,
  rest_cart: restCart, rest_timber: restTimber, rest_smithy: restSmithy, rest_lean: restLean, rest_healer: restHealer,
  rest_herbs: restHerbs, rest_stones: restStones, rest_frame: restFrame, rest_hall: restHall, rest_fig: restFig,
  rest_garden: restGarden, rest_sheaves: restSheaves, rest_cairn: restCairn, rest_tower: restTower, rest_terrace: restTerrace,
};
/** Props measured from their left end rather than their centre. */
const FROM_LEFT = new Set(['rest_fence', 'rest_terrace', 'rest_bunting', 'rest_washline', 'rest_flowers']);

/** Kinds drawn every frame. */
export const REST_LIVE: ReadonlySet<string> = new Set(['rest_fire', 'rest_banner', 'rest_children', 'rest_smoke', 'rest_bunting', 'rest_flag', 'rest_washline', 'rest_flowers', 'rest_lamp']);

/** Static part of a Remnant's Rest prop, baked with the tiles. False for other kinds. */
export function restProp(ctx: Ctx, e: Decor): boolean {
  if (!e.k.startsWith('rest_')) return false;
  const f = PROPS[e.k];
  if (!f) return REST_LIVE.has(e.k);
  ctx.save();
  ctx.translate(e.x * TILE, e.y * TILE);
  if (e.flip && !FROM_LEFT.has(e.k)) ctx.scale(-1, 1);
  f(ctx, e, new RNG(Math.floor(e.x * 31 + e.y * 7)));
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------- live props

const FIRE_A = 'rgba(255,140,50,0.85)', FIRE_B = 'rgba(255,240,190,0.95)';
const BANNERS: [string, string][] = [['#2a3a6a', '#e8c060'], ['#3a5a2e', '#e8d890'], ['#7a2228', '#f0c870']];
const PENNANTS = ['#c8443a', '#e8c050', '#4a7ab0', '#e8e0c8', '#6a9a48'];
const TUNICS = ['#c86a3a', '#4a7aa8', '#a84a6a'];

function fire(ctx: Ctx, x: number, y: number, s: number, t: number) {
  const w = Math.sin(t * 17) * s * 0.15;
  add(ctx, '#ff8a2a', x, y - s * 0.5, s * 2.6, s * 2, 0.5);
  ctx.globalCompositeOperation = 'lighter';
  poly(ctx, [x - s * 0.5, y, x - s * 0.2 + w, y - s * 0.9, x + w * 1.5, y - s * 1.6, x + s * 0.25 + w, y - s * 0.8, x + s * 0.5, y], FIRE_A);
  poly(ctx, [x - s * 0.22, y, x + w * 0.8, y - s * 0.9, x + s * 0.22, y], FIRE_B);
  ctx.globalCompositeOperation = 'source-over';
}

/** A child at play: small, quick, in a bright tunic. */
function child(ctx: Ctx, x: number, y: number, dir: number, run: number, tunic: string, arms: number) {
  const step = Math.sin(run) * 3;
  line(ctx, '#3a2a22', 1.6, [x - 1, y - 6, x - 1 + step, y]);
  line(ctx, '#3a2a22', 1.6, [x + 1, y - 6, x + 1 - step, y]);
  shape(ctx, [x - 3, y - 6, x - 2.5, y - 13, x + 2.5, y - 13, x + 3, y - 6], tunic, OUT, 0.5);
  line(ctx, '#d8a07a', 1.2, [x - 2, y - 12, x - 2 - dir * 2, y - 12 - arms * 4]);
  line(ctx, '#d8a07a', 1.2, [x + 2, y - 12, x + 2 + dir * 2, y - 12 - arms * 4]);
  circle(ctx, x, y - 16, 3, OUT);
  circle(ctx, x, y - 16, 2.4, '#d8a07a');
  ctx.fillStyle = '#4a2a1a';
  ctx.fillRect(x - 2.5, y - 19, 5, 2);
}

/** Moving parts: the campfire, banners and bunting, chimney smoke, the washing, the children. */
export function drawRestLive(ctx: Ctx, e: Decor, t: number) {
  const x = e.x * TILE, y = e.y * TILE, ph = hash2(e.x | 0, e.y | 0, 911) * TAU;
  ctx.save();
  ctx.translate(x, y);
  switch (e.k) {
    case 'rest_fire': {
      for (let i = 0; i < 5; i++) ellipse(ctx, -12 + i * 6, -2, 4, 3, 0, i & 1 ? '#6a5a50' : '#5a4a44');
      line(ctx, OUT, 4, [-8, 0, 8, -6]);
      line(ctx, '#6a4028', 2, [-8, 0, 8, -6]);
      line(ctx, OUT, 4, [8, 0, -8, -6]);
      line(ctx, '#7a4a30', 2, [8, 0, -8, -6]);
      fire(ctx, 0, -4, 7 * (0.9 + 0.1 * Math.sin(t * 9 + ph)), t + ph);
      if (tier() > 0) {
        ctx.fillStyle = '#ffd080';
        for (let i = 0; i < 4; i++) {
          const u = (t * 0.6 + i * 0.25) % 1;
          ctx.globalAlpha = 1 - u;
          ctx.fillRect(Math.sin(t * 2 + i * 2) * 6 * u, -10 - u * 40, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'rest_lamp': {
      // a post with an arm, and a lantern swinging from it
      const h = (e.h ?? 3) * TILE, sw = Math.sin(t * 1.3 + ph) * 1.5;
      line(ctx, OUT, 3.5, [0, 0, 0, -h]);
      line(ctx, WOOD, 2, [0, 0, 0, -h]);
      line(ctx, OUT, 3, [0, -h + 2, 9, -h + 2]);
      line(ctx, WOOD_LIT, 1.5, [0, -h + 2, 9, -h + 2]);
      line(ctx, '#2a1a12', 0.6, [8, -h + 3, 8 + sw, -h + 8]);
      poly(ctx, [5 + sw, -h + 8, 11 + sw, -h + 8, 12 + sw, -h + 16, 4 + sw, -h + 16], '#6a4a2a', OUT, 0.6);
      box(ctx, WIN, 6 + sw, -h + 9, 4, 6);
      add(ctx, GLOW, 8 + sw, -h + 12, 20, 20, 0.55 + 0.05 * Math.sin(t * 7 + ph));
      break;
    }
    case 'rest_banner': {
      const h = (e.h ?? 4) * TILE, sw = Math.sin(t * 1.2 + ph) * 3, [cloth, sign] = BANNERS[(e.v ?? 0) % 3];
      line(ctx, OUT, 3, [0, 0, 0, -h - 18]);
      line(ctx, WOOD_LIT, 1.4, [0, 0, 0, -h - 18]);
      circle(ctx, 0, -h - 19, 2, '#e8c060');
      line(ctx, OUT, 2, [-1, -h - 14, 20, -h - 14]);
      poly(ctx, [1, -h - 13, 19, -h - 13, 19 + sw * 0.5, -h * 0.4, 10 + sw, -h * 0.25, 1 + sw * 0.4, -h * 0.4], cloth, OUT, 1);
      circle(ctx, 10 + sw * 0.3, -h * 0.7, 4, sign);
      circle(ctx, 10 + sw * 0.3, -h * 0.7, 2, cloth);
      break;
    }
    case 'rest_bunting': {
      // a string of pennants and little lamps from pole to pole, festival-bright
      const len = (e.w ?? 16) * TILE, hy = -62, sag = 14 + Math.sin(t * 0.8 + ph) * 1.5;
      for (const px of [0, len]) {
        line(ctx, OUT, 3, [px, 0, px, hy - 6]);
        line(ctx, WOOD_LIT, 1.5, [px, 0, px, hy - 6]);
      }
      ctx.strokeStyle = '#3a2a22';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.quadraticCurveTo(len / 2, hy + sag * 2, len, hy);
      ctx.stroke();
      const n = Math.floor(len / 9);
      for (let i = 1; i < n; i++) {
        const u = i / n, px = u * len, py = hy + sag * 4 * u * (1 - u), flut = Math.sin(t * 3 + i + ph) * 1.2;
        if (i % 4 === 2) {
          box(ctx, OUT, px - 2.5, py, 5, 7);
          box(ctx, WIN, px - 1.5, py + 1, 3, 5);
          add(ctx, GLOW, px, py + 4, 12, 12, 0.6);
        } else poly(ctx, [px - 3, py, px + 3, py, px + flut, py + 8], PENNANTS[(i + (e.v ?? 0)) % PENNANTS.length]);
      }
      break;
    }
    case 'rest_smoke': {
      // chimney smoke, rising and leaning with the evening air
      const n = tier() > 0 ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const u = (t * 0.12 + i / n + ph) % 1;
        blob(ctx, '#8a7a8a', u * 22 + Math.sin(t * 0.5 + i) * 3, -u * 70, 5 + u * 14, 4 + u * 10, 0.35 * (1 - u));
      }
      break;
    }
    case 'rest_flag': {
      const sw = Math.sin(t * 2 + ph);
      line(ctx, OUT, 2, [0, 0, 0, -26]);
      line(ctx, '#c8a060', 1, [0, 0, 0, -26]);
      poly(ctx, [1, -26, 20 + sw * 2, -22 + sw, 1, -16], '#c8443a', OUT, 0.6);
      break;
    }
    case 'rest_washline': {
      const len = (e.w ?? 6) * TILE;
      for (const px of [0, len]) {
        line(ctx, OUT, 3, [px, 0, px, -30]);
        line(ctx, WOOD, 1.5, [px, 0, px, -30]);
      }
      line(ctx, '#d8c8a8', 0.6, [0, -28, len / 2, -24, len, -28]);
      const cols = ['#e8dcc0', '#7a9ac8', '#c86a5a', '#e8dcc0', '#a8b870'];
      for (let i = 0; i < 5; i++) {
        const px = 12 + i * (len - 24) / 4, py = -28 + 4 * Math.sin((px / len) * Math.PI), sw = Math.sin(t * 1.6 + i + ph) * 1.5;
        poly(ctx, [px - 4, py, px + 4, py, px + 4 + sw, py + 10 - (i & 1) * 2, px - 4 + sw, py + 10], cols[i], OUT, 0.5);
      }
      break;
    }
    case 'rest_flowers': {
      const len = (e.w ?? 4) * TILE;
      for (let i = 0; i < len; i += 4) {
        const sw = Math.sin(t * 1.5 + i * 0.4) * 1, hh = 4 + hash2(i, e.x | 0, 5) * 5;
        line(ctx, '#2e3a20', 1, [i, 1, i + sw, -hh]);
        ctx.fillStyle = PENNANTS[(i >> 2) % PENNANTS.length];
        ctx.fillRect(i + sw - 1, -hh - 1, 2, 2);
      }
      break;
    }
    case 'rest_children': {
      // one chases, one throws a ball up and catches it
      const run = Math.sin(t * 0.9 + ph) * 26, dir = Math.cos(t * 0.9 + ph) >= 0 ? 1 : -1;
      child(ctx, run, 0, dir, t * 12, TUNICS[0], 0.2);
      child(ctx, run - dir * 14 - 4, 0, dir, t * 12 + 1.4, TUNICS[1], 0.5);
      const u = (t * 0.7 + ph) % 1, bh = 4 * u * (1 - u) * 34;
      child(ctx, 34, 0, -1, 0, TUNICS[2], u < 0.15 || u > 0.85 ? 1 : 0.3);
      circle(ctx, 33, -22 - bh, 2.4, OUT);
      circle(ctx, 33, -22 - bh, 1.8, '#e8c050');
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- entities

/** The plaza's notice board: notes pinned for each open request, a gold mark when one is done. */
export function drawBoard(ctx: Ctx, x: number, y: number, notes: number, ready: boolean, t: number) {
  ctx.save();
  ctx.translate(x, y);
  for (const px of [-12, 12]) shape(ctx, [px - 2, 0, px - 2, -34, px + 2, -34, px + 2, 0], WOOD);
  shape(ctx, [-15, -32, 15, -32, 15, -14, -15, -14], '#7a5236');
  box(ctx, WOOD_LIT, -15, -33, 30, 2);
  poly(ctx, [-18, -33, 0, -42, 18, -33], THATCH, OUT, 0.8);
  for (let i = 0; i < Math.min(5, notes); i++) {
    const nx = -12 + i * 5.5, ny = -29 + (i & 1) * 3;
    box(ctx, '#ece0c4', nx, ny, 5, 7);
    box(ctx, '#a8986c', nx + 1, ny + 2, 3, 0.8);
    box(ctx, '#a8986c', nx + 1, ny + 4, 3, 0.8);
    box(ctx, '#c84a3a', nx + 2, ny, 1, 1);
  }
  if (ready) {
    const b = Math.sin(t * 3) * 1.5;
    add(ctx, '#ffd870', 0, -50 + b, 12, 12, 0.7);
    shape(ctx, [-1.5, -56 + b, 1.5, -56 + b, 1, -48 + b, -1, -48 + b], '#ffe080', OUT, 0.5);
    circle(ctx, 0, -45 + b, 1.4, '#ffe080');
  }
  ctx.restore();
}

/** The signpost on the Ashen Road: an arm pointing west and down, a lantern hung from it. */
export function drawWaypost(ctx: Ctx, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  shape(ctx, [-2, 0, -2, -46, 2, -46, 2, 0], '#5a3e2a');
  shape(ctx, [-20, -40, 4, -40, 4, -33, -20, -33, -24, -36.5], '#8a6a44', '#0a0608', 0.8);
  box(ctx, '#e8c870', -16, -37.5, 14, 1);
  line(ctx, '#0a0608', 2, [2, -44, 12, -44]);
  line(ctx, '#2a1a12', 0.6, [10, -44, 10 + Math.sin(t * 1.3) * 1.2, -40]);
  const sw = Math.sin(t * 1.3) * 1.2;
  poly(ctx, [7 + sw, -40, 13 + sw, -40, 14 + sw, -32, 6 + sw, -32], '#6a4a2a', '#0a0608', 0.6);
  box(ctx, WIN, 8 + sw, -39, 4, 6);
  add(ctx, GLOW, 10 + sw, -36, 24, 24, 0.7);
  ctx.restore();
}

// ---------------------------------------------------------------- sky

const SKY_STOPS: [number, string][] = [[0, '#121636'], [0.22, '#262858'], [0.42, '#4c3468'], [0.58, '#8a4a6c'], [0.7, '#c86a62'], [0.82, '#ee9a5a'], [0.92, '#fcc678'], [1, '#ffe0a0']];
let skyG: CanvasGradient | null = null, skyH = 0, skyCtx: Ctx | null = null;

/** Dusk over the valley: stars coming out above, the sun going down in gold behind the hills, lit clouds and swifts. */
export function restSky(ctx: Ctx, w: number, h: number, t: number) {
  if (!skyG || skyH !== h || skyCtx !== ctx) {
    skyG = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of SKY_STOPS) skyG.addColorStop(o, c);
    skyH = h;
    skyCtx = ctx;
  }
  ctx.fillStyle = skyG;
  ctx.fillRect(0, 0, w, h);
  const k = h / 720, s = Math.max(1, Math.round(1.3 * k));
  ctx.fillStyle = '#fff4e0';
  for (let i = 0; i < 46; i++) {
    const yy = hash2(i, 31) * h * 0.4;
    ctx.globalAlpha = (0.25 + 0.6 * hash2(i, 33)) * (1 - yy / (h * 0.4)) * (0.7 + 0.3 * Math.sin(t * 1.1 + i * 2.3));
    ctx.fillRect(hash2(i, 35) * w, yy, s, s);
  }
  ctx.globalAlpha = 1;
  // the sun, low and large, with its halo
  const sx = w * 0.7, sy = h * 0.76, sr = h * 0.07;
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, '#ff9a50', sx, sy, w * 0.55, h * 0.3, 0.35);
  blob(ctx, '#ffc070', sx, sy, sr * 4, sr * 3.4, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, sr, '#ffe6a8');
  circle(ctx, sx, sy, sr * 0.8, '#fff2c8');
  // long clouds, dark above and gilded beneath, drifting
  for (let i = 0; i < 6; i++) {
    const cy = h * (0.3 + i * 0.075), span = w + 600 * k;
    const cx = ((t * (2 + i * 0.6) * k + hash2(i, 41) * span) % span) - 300 * k, cw = (180 + hash2(i, 43) * 160) * k;
    blob(ctx, '#5a3456', cx, cy, cw, (9 + i * 1.6) * k, 0.6);
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, i > 2 ? '#ffb070' : '#e88a8a', cx + 10 * k, cy + (5 + i) * k, cw * 0.8, 3.5 * k, 0.45);
    ctx.globalCompositeOperation = 'source-over';
  }
  // swifts wheeling home
  ctx.strokeStyle = '#2a1a2a';
  ctx.lineWidth = Math.max(1, k);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const bx = ((t * 18 * k + i * 140 * k + Math.sin(t * 0.7 + i) * 30 * k) % (w + 100)) - 50, by = h * (0.4 + 0.05 * Math.sin(t * 0.5 + i * 1.7)), f = Math.sin(t * 9 + i) * 2 * k;
    ctx.moveTo(bx - 4 * k, by - f);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + 4 * k, by - f);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- parallax

/** A cypress silhouette for the far layers. */
function cypressSil(ctx: Ctx, x: number, base: number, h: number, col: string) {
  poly(ctx, [x, base - h, x + h * 0.1, base - h * 0.6, x + h * 0.12, base, x - h * 0.12, base, x - h * 0.1, base - h * 0.6], col);
}

/** An olive or orchard tree silhouette: a short trunk and a round crown. */
function treeSil(ctx: Ctx, x: number, base: number, s: number, col: string, rim: string | null) {
  ctx.fillStyle = col;
  ctx.fillRect(x - s * 0.06, base - s * 0.5, s * 0.12, s * 0.5);
  ctx.beginPath();
  ctx.ellipse(x, base - s * 0.7, s * 0.5, s * 0.36, 0, 0, TAU);
  ctx.ellipse(x - s * 0.3, base - s * 0.55, s * 0.3, s * 0.24, 0, 0, TAU);
  ctx.ellipse(x + s * 0.32, base - s * 0.58, s * 0.3, s * 0.24, 0, 0, TAU);
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, base - s * 0.7, s * 0.48, -1.2, 0.2);
    ctx.stroke();
  }
}

/** A farmhouse far off: a block, a roof, perhaps a lit window. */
function farm(ctx: Ctx, x: number, base: number, s: number, col: string, lit: boolean) {
  ctx.fillStyle = col;
  ctx.fillRect(x - s * 0.5, base - s * 0.5, s, s * 0.5);
  poly(ctx, [x - s * 0.6, base - s * 0.48, x, base - s * 0.85, x + s * 0.6, base - s * 0.48], col);
  if (lit) {
    ctx.fillStyle = WIN;
    ctx.fillRect(x - s * 0.2, base - s * 0.34, Math.max(1, s * 0.12), Math.max(1, s * 0.12));
    ctx.fillRect(x + s * 0.12, base - s * 0.34, Math.max(1, s * 0.12), Math.max(1, s * 0.12));
    add(ctx, GLOW, x, base - s * 0.3, s * 0.8, s * 0.4, 0.35);
  }
}

/** A sheep, grazing. */
function sheep(ctx: Ctx, x: number, base: number, s: number, col: string, dir: number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, base - s * 0.55, s * 0.5, s * 0.3, 0, 0, TAU);
  ctx.ellipse(x + dir * s * 0.5, base - s * 0.4, s * 0.16, s * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - s * 0.3, base - s * 0.3, Math.max(1, s * 0.08), s * 0.3);
  ctx.fillRect(x + s * 0.24, base - s * 0.3, Math.max(1, s * 0.08), s * 0.3);
}

function mist(ctx: Ctx, w: number, y: number, col: string, a: number, thick = 14) {
  ctx.globalCompositeOperation = 'lighter';
  for (let x = 0; x < w; x += 90) blob(ctx, col, x + 45, y, 110, thick, a);
  ctx.globalCompositeOperation = 'source-over';
}

/** Five baked strips: mountains, the far hills and river, orchards and farms, cypress and sheep, and the near frame of leaves. */
export function restParallax(pal: BiomePal, seed: number, viewH: number, res: number): Layer[] {
  const layers: Layer[] = [];
  const W = 1024, H = Math.round(viewH * 1.6);
  // The valley fills up with the settlement: more lit farms on the hills as it grows.
  const grown = (flag('rest_t1') ? 1 : 0) + (flag('rest_t2') ? 1 : 0) + (flag('rest_t3') ? 1 : 0) + (flag('rest_t4') ? 1 : 0);
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    const m = makeCanvas(W * r, H * r);
    m.ctx.scale(r, r);
    draw(m.ctx, W, H);
    layers.push({ c: m.c, w: W, h: H, fx, fy, oy: 0, res: r });
  };
  const wrap = (x: number, reach: number, w: number, f: (x: number) => void) => {
    f(x);
    if (x + reach > w) f(x - w);
    if (x - reach < 0) f(x + w);
  };
  const scatter = (w: number, rng: RNG, lo: number, hi: number, reach: number, f: (x: number, r: RNG) => void) => {
    for (let x = rng.range(0, lo); x < w; x += rng.range(lo, hi)) {
      const sd = rng.int(0, 99999);
      wrap(x, reach, w, (xx) => f(xx, new RNG(sd)));
    }
  };
  // L0: the far mountains, violet, their western faces catching the sun.
  mk(0.02, 0.02, (ctx, w, h) => {
    const hz = h * 0.74, n0 = wrapNoise(w, 160, seed, 4), n1 = wrapNoise(w, 60, seed + 1, 3);
    const peak = (x: number) => hz - 8 - n0(x) * h * 0.2 - n1(x) * 12;
    fillRidge(ctx, w, h, peak, '#7a5e88');
    fillRidge(ctx, w, h, (x) => peak(x) + 10 + n1(x) * 20 + n0(x) * 14, '#644c7a');
    strokeRidge(ctx, w, peak, rgba('#ffc8a0', 0.7), 1, 0.5);
    mist(ctx, w, hz + 2, '#e8907a', 0.3, 20);
  }, res * 0.7);
  // L1: the far hills, terraced, a river shining in the valley floor, a hamlet's lights.
  mk(0.05, 0.03, (ctx, w, h) => {
    const hz = h * 0.8, n = wrapNoise(w, 110, seed + 2, 3), col = '#523e66';
    const hy = (x: number) => hz - n(x) * h * 0.1;
    fillRidge(ctx, w, h, hy, col);
    ctx.strokeStyle = rgba('#8a6a8a', 0.5);
    ctx.lineWidth = 1;
    for (let j = 1; j < 5; j++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = hy(x) + j * 6 + Math.sin(x * 0.02 + j) * 2;
        if (!x) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    const fr = new RNG(seed + 3);
    scatter(w, fr, 30, 80, 10, (x, r) => cypressSil(ctx, x, hy(x) + 3, r.range(8, 14), '#3e2e50'));
    // the river: a ribbon of gold across the far floor
    ctx.strokeStyle = '#ffc890';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = h * 0.86 + Math.sin(x * 0.012 + seed) * 6 + Math.sin(x * 0.031) * 2;
      if (!x) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    const lr = new RNG(seed + 4);
    for (let i = 0; i < 4 + grown * 3; i++) {
      const x = lr.range(0, w), yy = hy(x) + lr.range(4, 18);
      ctx.fillStyle = WIN;
      ctx.fillRect(x, yy, 1.5, 1.5);
      add(ctx, GLOW, x, yy, 6, 5, 0.5);
    }
    mist(ctx, w, hz + 10, '#b07888', 0.28, 16);
  }, res * 0.7);
  // L2: orchards and vineyards, stone walls, farmhouses with lit windows and smoke.
  mk(0.1, 0.06, (ctx, w, h) => {
    const base = h * 0.86, n = wrapNoise(w, 140, seed + 11, 3), col = '#3e2c4a', fr = new RNG(seed + 12);
    const ground = (x: number) => base - n(x) * 26;
    fillRidge(ctx, w, h, ground, col);
    // vine rows down the slope
    ctx.strokeStyle = '#4e3a58';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 7) {
      ctx.moveTo(x, ground(x) + 4);
      ctx.lineTo(x + 3, h);
    }
    ctx.stroke();
    scatter(w, fr, 26, 60, 20, (x, r) => treeSil(ctx, x, ground(x) + 2, r.range(14, 22), '#33243e', rgba('#e8907a', 0.45)));
    scatter(w, fr, 180, 320, 30, (x, r) => {
      farm(ctx, x, ground(x) + 2, r.range(18, 26), '#2e2038', r.chance(0.35 + grown * 0.15));
      for (let j = 0; j < 4; j++) blob(ctx, '#6a5068', x + 6 + j * 7, ground(x) - 26 - j * 10, 5 + j * 3, 3 + j * 2, 0.3 - j * 0.05);
    });
    // a dry-stone wall following the hill
    ctx.strokeStyle = '#54405e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const yy = ground(x) + 14;
      if (!x) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    mist(ctx, w, base + 4, '#a06a7a', 0.22);
  });
  // L3: the near slope: cypress rows, olives, a sheepfold and its flock, rim-lit by the sun.
  mk(0.2, 0.1, (ctx, w, h) => {
    const base = h * 0.92, col = '#2a1c30', fr = new RNG(seed + 17), rim = rgba('#f0a070', 0.55);
    const ground = (x: number) => base - 6 + Math.sin(x * 0.008 + seed) * 8;
    scatter(w, fr, 60, 140, 30, (x, r) => {
      const hh = r.range(60, 110);
      cypressSil(ctx, x, ground(x) + 2, hh, col);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, ground(x) - hh + 2);
      ctx.lineTo(x + hh * 0.1, ground(x) - hh * 0.6);
      ctx.stroke();
    });
    scatter(w, fr, 90, 180, 40, (x, r) => treeSil(ctx, x, ground(x) + 2, r.range(34, 48), col, rim));
    scatter(w, fr, 260, 420, 60, (x, r) => {
      // a sheepfold: a ring of low wall, and sheep beside it
      ctx.fillStyle = col;
      ctx.fillRect(x - 30, ground(x) - 8, 60, 8);
      for (let i = 0; i < 5; i++) sheep(ctx, x + 40 + i * r.range(9, 14), ground(x) + 1, r.range(9, 12), col, r.chance(0.5) ? 1 : -1);
    });
    fillRidge(ctx, w, h, ground, col);
    ctx.fillStyle = rgba('#e89a6a', 0.3);
    for (let x = 0; x < w; x += fr.range(20, 50)) ctx.fillRect(x, ground(x) - 1, fr.range(8, 24), 1);
  });
  // L4: the near frame: boughs of olive and fig leaning in at the top, tall grass below.
  mk(0.38, 0.15, (ctx, w, h) => {
    const col = '#160e18', fr = new RNG(seed + 22);
    scatter(w, fr, 280, 460, 90, (x, r) => {
      const dir = r.chance(0.5) ? 1 : -1, by = h * r.range(0.04, 0.16);
      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - dir * 40, -4);
      ctx.quadraticCurveTo(x, by + 20, x + dir * 70, by);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const u = i / 8, lx = x - dir * 30 + dir * u * 110, ly = by + Math.sin(u * Math.PI) * 26 + r.range(-6, 6);
        ctx.moveTo(lx + 12, ly);
        ctx.ellipse(lx, ly, r.range(9, 14), r.range(6, 9), r.range(-0.6, 0.6), 0, TAU);
      }
      ctx.fill();
    });
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let x = 0; x < w; x += 3) {
      const hh = 10 + fr.range(0, 16) * (0.5 + 0.5 * Math.sin(x * 0.01));
      ctx.moveTo(x - 1.5, h);
      ctx.lineTo(x + fr.range(-3, 3), h - hh);
      ctx.lineTo(x + 1.5, h);
    }
    ctx.fill();
  });
  return layers;
}

// ---------------------------------------------------------------- tiles

/** Ground: rich dark earth under grass and wildflowers, the plaza trodden bare, terrace faces of dry stone. */
export function drawSolidRest(ctx: Ctx, tx: number, ty: number, t: T, depth: number, v: number, solid: (a: number, b: number) => boolean) {
  const x = tx * TILE, y = ty * TILE;
  const up = solid(tx, ty - 1), lf = solid(tx - 1, ty), rt = solid(tx + 1, ty), dn = solid(tx, ty + 1);
  box(ctx, mix(mix('#5a3c2c', '#24160f', Math.min(1, depth / 3 + 0.1)), '#000000', v * 0.12), x, y, TILE, TILE);
  const face = !lf || !rt;
  if (face && depth <= 1) {
    // a terrace wall: dry stones laid in courses
    for (let r = 0; r < 3; r++) {
      const off = (r + ty) & 1 ? 0 : 5;
      for (let c = -1; c < 3; c++) {
        const sx = x + off + c * 8, sy = y + r * 5 + 1;
        const k = hash2(tx * 3 + c, ty * 3 + r, 951);
        box(ctx, OUT, sx, sy, 8, 5);
        box(ctx, k < 0.33 ? STONE_DK : k < 0.66 ? STONE : '#7a6a5c', sx + 0.5, sy + 0.5, 7, 4);
        box(ctx, rgba(STONE_LIT, 0.5), sx + 0.5, sy + 0.5, 7, 1);
      }
    }
  } else if (depth <= 1) {
    const b0 = 5 + Math.floor(hash2(tx, ty, 952) * 5);
    box(ctx, 'rgba(20,10,6,0.3)', x, y + b0, TILE, 1);
    if (hash2(tx, ty, 953) < 0.16) {
      const sx = x + 2 + Math.floor(hash2(tx, ty, 954) * 10);
      box(ctx, STONE_DK, sx, y + b0 + 2, 4, 3);
      box(ctx, STONE, sx, y + b0 + 2, 3, 1);
    }
  }
  if (!up) {
    const plaza = tx >= 29 && tx <= 49;
    if (plaza) {
      // the plaza: packed earth with flat stones set in it
      box(ctx, '#7a5a42', x, y, TILE, 4);
      box(ctx, '#9a7656', x, y, TILE, 1);
      for (let i = 0; i < 2; i++) {
        const sx = x + 1 + i * 8 + Math.floor(hash2(tx, i, 955) * 2);
        box(ctx, '#3a2a20', sx, y + 1, 6, 3);
        box(ctx, hash2(tx, i, 956) < 0.5 ? '#b09478' : '#a08468', sx, y + 1, 6, 2);
      }
    } else {
      box(ctx, '#2e3a1c', x, y + 2, TILE, 3);
      box(ctx, '#5a6a2e', x, y, TILE, 3);
      box(ctx, '#8a9a44', x, y, TILE, 1);
      ctx.fillStyle = '#6a7a34';
      for (let i = 0; i < 6; i++) {
        const gx = x + Math.floor(hash2(tx, i, 957) * 15), gh = 1 + Math.floor(hash2(tx, i, 958) * 3);
        ctx.fillRect(gx, y - gh, 1, gh);
      }
      ctx.fillStyle = '#a8b858';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + Math.floor(hash2(tx, i, 959) * 15), y - 1, 1, 1);
      // wildflowers
      if (hash2(tx, ty, 960) < 0.45) {
        const k = hash2(tx, ty, 961);
        ctx.fillStyle = k < 0.33 ? '#f0e8d0' : k < 0.66 ? '#f0c050' : '#d8606a';
        ctx.fillRect(x + 2 + Math.floor(hash2(tx, ty, 962) * 12), y - 2, 1, 1);
      }
    }
  }
  if (!dn) box(ctx, 'rgba(0,0,0,0.38)', x, y + TILE - 2, TILE, 2);
  if (!lf) box(ctx, 'rgba(255,220,180,0.08)', x, y, 1, TILE);
  if (!rt) box(ctx, 'rgba(255,170,110,0.14)', x + TILE - 2, y, 2, TILE);
  void t;
}

/** A plank walk on posts. */
export function drawOneWayRest(ctx: Ctx, tx: number, ty: number, l: boolean, r: boolean) {
  const x = tx * TILE, y = ty * TILE;
  box(ctx, OUT, x, y, TILE, 5);
  box(ctx, WOOD, x, y, TILE, 4);
  box(ctx, WOOD_LIT, x, y, TILE, 1);
  box(ctx, WOOD_DK, x + 7, y + 1, 1, 3);
  if (l || r) {
    const px = l ? x + 1 : x + TILE - 4;
    box(ctx, WOOD_DK, px, y + 4, 3, 10);
  }
}
