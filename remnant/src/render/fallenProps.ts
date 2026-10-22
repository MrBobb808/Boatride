// Props for Chapters VII–IX. Static pieces are baked into the tile chunks;
// the few that move (banners, lanterns, crucibles, chains, the brood, the
// boundary seals on the gates) are drawn live each frame.

import { poly, circle, ellipse, rgba, type Ctx } from './draw';
import { RNG, hash2 } from '../core/math';
import { flag } from '../game/ctx';
import { TILE, type EntDef } from '../game/tiles';
import { blob, solidify } from './env4';
import { greciaProp, drawGreciaLive, GRECIA_LIVE } from './envGrecia';

type Decor = Extract<EntDef, { t: 'decor' }>;
type PropFn = (ctx: Ctx, e: Decor, rng: RNG) => void;

const TAU = Math.PI * 2;
const OUT = '#0a0608';

function box(ctx: Ctx, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** A round-ended stroke: poles, limbs, ropes. */
function line(ctx: Ctx, c: string, lw: number, pts: number[]) {
  ctx.strokeStyle = c;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
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

/** A small fire: tongues over a white-hot heart. */
function fire(ctx: Ctx, x: number, y: number, s: number, t: number) {
  const w = Math.sin(t * 17) * s * 0.15;
  add(ctx, '#ff8a2a', x, y - s * 0.5, s * 2.4, s * 2, 0.45);
  ctx.globalCompositeOperation = 'lighter';
  poly(ctx, [x - s * 0.5, y, x - s * 0.2 + w, y - s * 0.9, x + w * 1.5, y - s * 1.6, x + s * 0.25 + w, y - s * 0.8, x + s * 0.5, y], 'rgba(255,140,50,0.85)');
  poly(ctx, [x - s * 0.22, y, x + w * 0.8, y - s * 0.9, x + s * 0.22, y], 'rgba(255,240,190,0.95)');
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- the hunt

const BARK = '#2a1e1e', BARK_LIT = '#4a3630', NEEDLE = '#1a2826', NEEDLE_LIT = '#2c403a';
const SNOW = '#c8ccd8', SNOW_LIT = '#eef0f8', BONE = '#cfc3ac', BONE_DK = '#8a7e68';
const HIDE = '#7a5a40', HIDE_LIT = '#a07a58', HIDE_DK = '#4a3424', BLOOD = '#7a1a16';

/** A great pine scored by claws higher than a man; v 2 is a snapped dead snag. */
const huntTree: PropFn = (ctx, e, rng) => {
  const v = e.v ?? 0;
  if (v === 2) {
    shape(ctx, [-12, 0, -9, -90, -14, -118, -4, -104, 2, -130, 6, -96, 10, 0], BARK);
    box(ctx, BARK_LIT, -8, -88, 3, 86);
    line(ctx, BARK, 4, [4, -70, 30, -96, 40, -94]);
    line(ctx, BARK, 3, [-6, -50, -30, -66]);
    box(ctx, SNOW, 26, -98, 12, 2);
    box(ctx, SNOW, -32, -68, 8, 2);
  } else {
    const h = v ? 210 : 180, tw = v ? 14 : 12;
    // roots gripping the thawed ground
    shape(ctx, [-tw - 8, 0, -tw / 2, -10, -tw / 2, -h * 0.4, tw / 2, -h * 0.4, tw / 2, -10, tw + 8, 0], BARK);
    box(ctx, BARK_LIT, -tw / 2 + 1, -h * 0.4, 3, h * 0.4 - 6);
    for (let i = 0; i < 6; i++) box(ctx, '#1a1214', -tw / 2 + 4 + (i % 3) * 3, -10 - i * 12 - rng.int(0, 6), 1, 6);
    const tiers = 7;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers, y = -h * 0.25 - f * h * 0.72, ww = h * (0.3 * (1 - f) + 0.05), top = y - h * (0.17 - f * 0.06);
      shape(ctx, [-ww, y, -ww * 0.5, y - h * 0.04, 0, top, ww * 0.5, y - h * 0.04, ww, y, ww * 0.3, y - h * 0.02, 0, y - h * 0.005, -ww * 0.3, y - h * 0.02], NEEDLE);
      poly(ctx, [-ww * 0.5, y - h * 0.04, 0, top, -ww * 0.1, y - h * 0.02], NEEDLE_LIT);
      if (rng.chance(0.75)) poly(ctx, [-ww * 0.6, y - h * 0.03, 0, top + 1, ww * 0.55, y - h * 0.03, ww * 0.25, y - h * 0.045, 0, top + h * 0.045, -ww * 0.3, y - h * 0.05], SNOW);
    }
    box(ctx, SNOW_LIT, -2, -h * 0.97 - 2, 3, 2);
  }
  // the claw marks: three rakes slanting down, pale wood in their depths
  const cy = v === 2 ? -64 : -62;
  for (let i = 0; i < 3; i++) {
    line(ctx, '#0e0808', 1.6, [-7 + i * 3, cy + i, 1 + i * 3, cy + 16 + i]);
    line(ctx, rgba('#a08a70', 0.6), 0.8, [-6 + i * 3, cy + 2 + i, 0 + i * 3, cy + 13 + i]);
  }
};

/** An antler: a beam sweeping up and out, tines rising off it. dir is -1 or 1. */
function antler(ctx: Ctx, x: number, y: number, s: number, dir: number, col = BONE, out = OUT) {
  const pts = [x, y, x + dir * s * 0.35, y - s * 0.3, x + dir * s * 0.55, y - s * 0.62, x + dir * s * 0.5, y - s];
  const tines = [[0.3, 0.32, 0.12, 0.42], [0.5, 0.56, 0.32, 0.72], [0.53, 0.8, 0.75, 0.98]];
  for (const [lw, c] of [[Math.max(2.5, s * 0.09), out], [Math.max(1.4, s * 0.055), col]] as const) {
    ctx.lineJoin = 'round';
    line(ctx, c, lw, pts);
    for (const [ax, ay, bx, by] of tines) line(ctx, c, lw * 0.8, [x + dir * s * ax, y - s * ay, x + dir * s * bx, y - s * by]);
  }
  line(ctx, rgba('#ffffff', 0.25), 0.8, [x + dir * s * 0.36, y - s * 0.32, x + dir * s * 0.54, y - s * 0.6]);
}

/** A pole crowned with an antlered skull, hide strips and bone beads hanging. */
const huntTotem: PropFn = (ctx, e) => {
  shape(ctx, [-3, 0, -2, -74, 2, -74, 3, 0], BARK);
  box(ctx, BARK_LIT, -2, -72, 1, 70);
  // the skull, long-snouted, its eyes dark
  shape(ctx, [-8, -74, -9, -86, -4, -92, 4, -92, 9, -86, 8, -74, 3, -66, -3, -66], BONE);
  box(ctx, OUT, -6, -84, 4, 3);
  box(ctx, OUT, 2, -84, 4, 3);
  box(ctx, BONE_DK, -2, -72, 4, 2);
  for (const s of [-1, 1]) antler(ctx, s * 5, -89, 34, s);
  // strips of hide and a string of teeth
  for (let i = 0; i < 3; i++) {
    const x = -6 + i * 5;
    shape(ctx, [x, -64, x + 3, -64, x + 2 + (i - 1), -42 + i * 4, x + (i - 1), -44 + i * 4], i === 1 ? BLOOD : HIDE, OUT, 0.6);
  }
  line(ctx, '#3a2c24', 0.8, [-8, -62, -4, -56, 4, -56, 8, -62]);
  for (let i = 0; i < 4; i++) box(ctx, BONE, -5 + i * 3, -57, 1, 2);
  if (e.v === 1) box(ctx, SNOW, -9, -93, 18, 2);
};

/** What the packs leave: a beast's skull, ribs, scattered long bones. */
const huntBones: PropFn = (ctx, e, rng) => {
  shape(ctx, [-30, 0, -20, -8, -6, -10, 10, -9, 24, -5, 32, 0], '#2a2022');
  for (let i = 0; i < 4; i++) {
    const x = -18 + i * 7;
    line(ctx, OUT, 3.2, [x, -6, x + 4, -24 + i * 2, x + 10, -26 + i * 3]);
    line(ctx, BONE, 1.8, [x, -6, x + 4, -24 + i * 2, x + 10, -26 + i * 3]);
  }
  line(ctx, OUT, 3, [-14, -6, 18, -6]);
  line(ctx, BONE_DK, 1.6, [-14, -6, 18, -6]);
  // the skull of something large
  shape(ctx, [10, -2, 12, -12, 20, -16, 30, -14, 34, -6, 30, -2], BONE);
  box(ctx, OUT, 22, -12, 4, 3);
  box(ctx, BONE_DK, 28, -6, 4, 1);
  line(ctx, OUT, 2.6, [-26, -2, -12, -4]);
  line(ctx, BONE, 1.4, [-26, -2, -12, -4]);
  if (rng.chance(0.5)) box(ctx, BLOOD, -4, -8, 5, 1);
  if (e.v === 1) box(ctx, SNOW, -20, -10, 14, 2);
};

/** A drying rack of poles, hides stretched on it. */
const huntRack: PropFn = (ctx) => {
  for (const x of [-24, 24]) {
    line(ctx, OUT, 4, [x - 6, 0, x, -48, x + 6, 0]);
    line(ctx, BARK_LIT, 2, [x - 6, 0, x, -48, x + 6, 0]);
  }
  line(ctx, OUT, 4, [-28, -44, 28, -44]);
  line(ctx, BARK_LIT, 2, [-28, -44, 28, -44]);
  const hides: [number, string][] = [[-14, HIDE], [2, '#5a4a3c'], [16, HIDE_LIT]];
  for (const [x, c] of hides) {
    shape(ctx, [x - 7, -44, x + 7, -44, x + 9, -30, x + 6, -18, x, -14, x - 6, -18, x - 9, -30], c);
    box(ctx, HIDE_DK, x - 5, -40, 1, 20);
    box(ctx, 'rgba(255,230,200,0.15)', x - 6, -43, 12, 1);
  }
  box(ctx, SNOW, -28, -46, 10, 2);
};

/** A hide tent on crossed poles, firelight in its door. */
const huntTent: PropFn = (ctx) => {
  line(ctx, OUT, 3, [-12, -66, 4, -46]);
  line(ctx, OUT, 3, [12, -66, -4, -46]);
  shape(ctx, [-34, 0, -4, -54, 4, -54, 34, 0], HIDE);
  poly(ctx, [-34, 0, -4, -54, -2, -54, -18, 0], HIDE_LIT);
  for (let i = 0; i < 3; i++) line(ctx, HIDE_DK, 1, [-22 + i * 14, -2, -2 + i * 2, -50]);
  // the door flap, and the light inside
  poly(ctx, [-9, 0, 0, -30, 9, 0], '#120a08');
  add(ctx, '#ff8a3a', 0, -6, 12, 9, 0.6);
  poly(ctx, [0, -30, 9, 0, 15, 0], HIDE_DK);
  line(ctx, BARK_LIT, 1.5, [-12, -66, 4, -46]);
  line(ctx, BARK_LIT, 1.5, [12, -66, -4, -46]);
  box(ctx, SNOW, -20, -30, 10, 2);
  box(ctx, SNOW, -6, -54, 12, 2);
};

/** A snow-capped boulder, a stake driven in beside it. */
const huntRock: PropFn = (ctx, e) => {
  shape(ctx, [-22, 0, -20, -14, -10, -24, 6, -26, 18, -16, 24, 0], '#3a3640');
  poly(ctx, [-20, -14, -10, -24, 6, -26, -4, -18, -14, -10], '#5a5462');
  poly(ctx, [-12, -23, 6, -26, 16, -18, 8, -20, -2, -19], SNOW);
  box(ctx, SNOW_LIT, -4, -25, 8, 1);
  if (e.v === 1) {
    line(ctx, OUT, 3, [26, 0, 30, -22]);
    line(ctx, BARK_LIT, 1.4, [26, 0, 30, -22]);
  }
};

/** A cage of lashed poles, its door hanging open: the hunt's captives went home. */
const huntCage: PropFn = (ctx) => {
  shape(ctx, [-22, 0, -22, -4, 22, -4, 22, 0], BARK);
  shape(ctx, [-22, -42, -20, -46, 20, -46, 22, -42], BARK);
  for (let i = 0; i < 6; i++) {
    const x = -20 + i * 8;
    line(ctx, OUT, 3, [x, -4, x, -42]);
    line(ctx, BARK_LIT, 1.4, [x, -4, x, -42]);
  }
  line(ctx, OUT, 3, [22, -6, 34, -2, 34, -40, 22, -40]);
  line(ctx, BARK_LIT, 1.4, [22, -6, 34, -2, 34, -40, 22, -40]);
  line(ctx, '#6a5a48', 1, [-21, -24, 21, -24]);
  box(ctx, SNOW, -20, -48, 22, 2);
};

/** The great horn of the hunt on its stand. */
const huntHorn: PropFn = (ctx) => {
  line(ctx, OUT, 4, [-10, 0, 0, -30, 10, 0]);
  line(ctx, BARK_LIT, 2, [-10, 0, 0, -30, 10, 0]);
  ctx.beginPath();
  ctx.moveTo(-26, -36);
  ctx.quadraticCurveTo(-4, -26, 14, -40);
  ctx.lineTo(22, -52);
  ctx.lineTo(16, -32);
  ctx.quadraticCurveTo(-4, -18, -26, -32);
  ctx.closePath();
  solidify(ctx, BONE, OUT, 1);
  for (let i = 0; i < 3; i++) box(ctx, '#7a5a34', -18 + i * 9, -34 + i, 2, 5);
  box(ctx, '#d8a040', -28, -36, 3, 5);
};

/** A palisade of sharpened logs with a walk behind it; spans e.w tiles. */
const huntPalisade: PropFn = (ctx, e, rng) => {
  const w = (e.w ?? 10) * TILE, h = (e.h ?? 6) * TILE;
  for (let x = -w / 2; x < w / 2; x += 9) {
    const th = h - rng.range(0, 10);
    shape(ctx, [x, 0, x, -th + 8, x + 4, -th, x + 8, -th + 8, x + 8, 0], x % 2 ? BARK : '#241a1a', OUT, 0.8);
    box(ctx, BARK_LIT, x + 1, -th + 9, 1, th - 12);
    if (rng.chance(0.6)) box(ctx, SNOW, x + 2, -th + 3, 4, 2);
  }
  box(ctx, '#1a1212', -w / 2, -h * 0.55, w, 3);
  box(ctx, '#1a1212', -w / 2, -h * 0.25, w, 3);
};

/** A palisade gate under an arch of antlers. The boundary seal is drawn live. */
const huntGate: PropFn = (ctx) => {
  for (const s of [-1, 1]) {
    shape(ctx, [s * 24, 0, s * 24, -110, s * 30, -118, s * 36, -110, s * 36, 0], BARK);
    box(ctx, BARK_LIT, s * 30 - 5, -108, 2, 106);
    antler(ctx, s * 30, -112, 40, -s);
    box(ctx, SNOW, s * 30 - 6, -120, 12, 2);
  }
  shape(ctx, [-8, -134, 8, -134, 6, -124, 0, -120, -6, -124], BONE);
  box(ctx, OUT, -5, -131, 3, 2);
  box(ctx, OUT, 2, -131, 3, 2);
  box(ctx, '#1a1212', -24, -96, 48, 4);
};

/** Varkhos's seat: a throne of antler and bone under a vast antler crown. */
const huntThrone: PropFn = (ctx) => {
  // the crown of antlers behind, taken from every beast he ran down
  for (const s of [-1, 1]) {
    antler(ctx, s * 30, -90, 110, s, BONE_DK);
    antler(ctx, s * 24, -110, 80, s, BONE);
    antler(ctx, s * 44, -40, 70, s, BONE_DK);
  }
  shape(ctx, [-50, 0, -46, -24, -30, -30, -28, -100, -16, -120, 0, -146, 16, -120, 28, -100, 30, -30, 46, -24, 50, 0], '#2e2226');
  poly(ctx, [-28, -100, -16, -120, 0, -146, -4, -110, -18, -96], '#3e3034');
  // a fur drape over the seat
  shape(ctx, [-24, -86, 24, -86, 28, -40, 20, -30, 8, -36, -6, -28, -20, -34, -28, -42], '#4a3628');
  for (let i = 0; i < 6; i++) box(ctx, '#6a5038', -20 + i * 7, -84, 2, 40 - (i % 2) * 6);
  box(ctx, BONE, -32, -28, 64, 5);
  box(ctx, BONE_DK, -32, -24, 64, 2);
  for (const s of [-1, 1]) {
    shape(ctx, [s * 36, -26, s * 36, -40, s * 44, -46, s * 52, -40, s * 52, -26], BONE);
    box(ctx, OUT, s * 44 - 3, -40, 2, 2);
  }
  add(ctx, '#ff9a5a', 0, -60, 30, 40, 0.15);
};

// ---------------------------------------------------------------- pestilence

const WOOD = '#3a3426', WOOD_LIT = '#5a5038', WOOD_DK = '#1e1a12', MOSS = '#5a7a3c', MOSS_LIT = '#8aac58';
const GREEN = '#8ad050', GREEN_HOT = '#c8f080', PLASTER = '#6a6a52', PLASTER_DK = '#44442e';
const SICK = '#c8b048';

/** A willow over the bog, moss hanging in sheets; v 2 is a dead snag shelved with fungus. */
const plagueTree: PropFn = (ctx, e, rng) => {
  if (e.v === 2) {
    shape(ctx, [-12, 0, -8, -60, -14, -96, -4, -84, 0, -112, 6, -80, 10, 0], '#2a2a1e');
    for (let i = 0; i < 3; i++) {
      const y = -20 - i * 22, s = i & 1 ? 1 : -1;
      shape(ctx, [s * 6, y, s * 20, y - 2, s * 22, y + 2, s * 6, y + 4], '#a8a070', OUT, 0.8);
      box(ctx, '#d8d0a0', s > 0 ? 8 : -20, y - 1, 12, 1);
    }
    return;
  }
  const h = 150 + (e.v ?? 0) * 20;
  shape(ctx, [-16, 0, -8, -10, -10, -h * 0.45, -4, -h * 0.7, 4, -h * 0.7, 10, -h * 0.4, 8, -10, 18, 0], '#2a2a1e');
  box(ctx, '#3e3e2c', -8, -h * 0.6, 2, h * 0.55);
  for (const s of [-1, 1]) line(ctx, '#2a2a1e', 5, [s * 4, -h * 0.65, s * 30, -h * 0.82, s * 54, -h * 0.76]);
  // the crown: clumps along an arch, then curtains of moss hanging to the water
  const top = -h * 0.84;
  for (let i = 0; i < 9; i++) {
    const f = i / 8 - 0.5, cx = f * 120, cy = top + f * f * 60 + rng.range(-4, 4);
    ellipse(ctx, cx, cy, 20, 12, 0, OUT);
    ellipse(ctx, cx, cy, 18.5, 10.5, 0, '#1c2c1a');
    ellipse(ctx, cx - 4, cy - 4, 11, 5, 0, '#2c4226');
    box(ctx, MOSS, cx - 9, cy - 9, 7, 1);
  }
  for (let i = 0; i < 10; i++) {
    const f = i / 9 - 0.5, x0 = f * 116, y0 = top + f * f * 60 + 6, len = rng.range(h * 0.25, h * 0.55);
    poly(ctx, [x0 - 6, y0, x0 + 6, y0, x0 + 5, y0 + len * 0.8, x0 + 2, y0 + len, x0 - 1, y0 + len * 0.86, x0 - 4, y0 + len * 0.95], '#1a2818');
    for (let j = 0; j < 3; j++) line(ctx, j === 1 ? MOSS : '#2c4226', 1, [x0 - 4 + j * 4, y0, x0 - 4 + j * 4 + rng.range(-1, 1), y0 + len * rng.range(0.6, 0.95)]);
  }
};

/** A quarantine lantern post. The flame and its green-gold light are live. */
const plagueLanternBase: PropFn = (ctx) => {
  shape(ctx, [-3, 0, -2, -60, 2, -60, 3, 0], WOOD);
  box(ctx, WOOD_LIT, -2, -58, 1, 56);
  shape(ctx, [-2, -60, 18, -60, 18, -56, -2, -56], WOOD);
  // the yellow cloth of quarantine, tied to the post
  shape(ctx, [2, -48, 12, -46, 10, -34, 4, -38], SICK, OUT, 0.6);
  box(ctx, '#8a7a2a', 5, -44, 1, 6);
};

/** A sealed house front: timber and plaster, its door boarded, the mark of quarantine on it. */
const plagueDoor: PropFn = (ctx, e) => {
  const w = 70;
  shape(ctx, [-w / 2, 0, -w / 2, -54, -w / 2 - 6, -54, 0, -84, w / 2 + 6, -54, w / 2, -54, w / 2, 0], PLASTER);
  poly(ctx, [-w / 2 - 6, -54, 0, -84, w / 2 + 6, -54, w / 2 + 2, -50, 0, -78, -w / 2 - 2, -50], '#3a2e24');
  for (const x of [-w / 2, -12, 12, w / 2 - 4]) box(ctx, WOOD_DK, x, -54, 4, 54);
  box(ctx, WOOD_DK, -w / 2, -30, w, 3);
  box(ctx, PLASTER_DK, -w / 2 + 4, -52, 6, 20);
  // the door, and the planks nailed across it
  box(ctx, '#2a2218', -9, -40, 18, 40);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(0, -32 + i * 12);
    ctx.rotate(i & 1 ? 0.18 : -0.15);
    box(ctx, OUT, -14, -3, 28, 6);
    box(ctx, '#6a5a3e', -13, -2, 26, 4);
    box(ctx, '#8a7a56', -13, -2, 26, 1);
    ctx.restore();
  }
  // a ring painted on the door in sickly yellow
  ctx.strokeStyle = SICK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -22, 5, 0, TAU);
  ctx.stroke();
  // a shuttered window, and moss where the damp climbs
  box(ctx, '#1a1610', 18, -48, 10, 12);
  box(ctx, WOOD_LIT, 18, -48, 4, 12);
  box(ctx, MOSS, -w / 2, -6, w, 6);
  box(ctx, MOSS_LIT, -w / 2, -6, w, 1);
  if (e.v === 1) add(ctx, '#ffc060', 23, -42, 8, 8, 0.4);
};

/** Giant fungi in a cluster, their gills glowing. */
const plagueShroom: PropFn = (ctx, e, rng) => {
  const n = 3 + (e.v ?? 0);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 12 + rng.range(-3, 3), h = 18 + rng.range(0, 34) * (i === 1 ? 1.4 : 1), r = h * 0.45;
    line(ctx, OUT, 6, [x, 0, x + rng.range(-4, 4), -h]);
    line(ctx, '#b8b090', 4, [x, 0, x, -h]);
    ctx.beginPath();
    ctx.ellipse(x, -h, r, r * 0.55, 0, Math.PI, TAU);
    ctx.closePath();
    solidify(ctx, '#6a7a3a', OUT, 1);
    ctx.fillStyle = '#9ab060';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, -h - r * 0.25, r * 0.5, r * 0.18, 0, 0, TAU);
    ctx.fill();
    box(ctx, GREEN, x - r + 1, -h, r * 2 - 2, 2);
    add(ctx, GREEN, x, -h + 2, r * 1.2, r * 0.5, 0.45);
    for (let j = 0; j < 3; j++) box(ctx, '#e8f0b0', x - r * 0.6 + j * r * 0.5, -h - r * 0.35 + (j & 1), 2, 1);
  }
};

/** A cart of sacks and barrels under a tarpaulin. */
const plagueCart: PropFn = (ctx) => {
  shape(ctx, [-30, -12, 30, -12, 30, -18, -30, -18], WOOD);
  for (const x of [-18, 18]) {
    circle(ctx, x, -8, 9, OUT);
    circle(ctx, x, -8, 7, WOOD_LIT);
    circle(ctx, x, -8, 2, OUT);
    line(ctx, WOOD_DK, 1, [x - 6, -8, x + 6, -8]);
    line(ctx, WOOD_DK, 1, [x, -14, x, -2]);
  }
  shape(ctx, [-28, -18, -24, -40, 4, -46, 26, -38, 28, -18], '#6a6448');
  for (let i = 0; i < 3; i++) line(ctx, '#4a4430', 1, [-20 + i * 14, -20, -16 + i * 14, -40]);
  line(ctx, OUT, 3, [30, -16, 48, -10]);
  line(ctx, WOOD_LIT, 1.4, [30, -16, 48, -10]);
};

/** An infirmary cot, a blanket over it, a bowl and a cup beside. */
const plagueCot: PropFn = (ctx) => {
  for (const x of [-22, 20]) line(ctx, WOOD_DK, 2.5, [x, 0, x, -12]);
  shape(ctx, [-26, -12, 26, -12, 26, -16, -26, -16], WOOD);
  shape(ctx, [-24, -16, 22, -16, 24, -20, 10, -22, -14, -21, -24, -19], '#8a8468');
  box(ctx, '#a8a280', -24, -21, 10, 4);
  for (let i = 0; i < 4; i++) box(ctx, '#6a6448', -10 + i * 8, -20, 1, 4);
  box(ctx, '#4a3e2e', 30, -4, 6, 4);
  box(ctx, '#7a6a4a', 30, -4, 6, 1);
};

/** A spore vat: a riveted tank, bands, a pipe, its port glowing. */
const plagueVat: PropFn = (ctx) => {
  shape(ctx, [-24, 0, -26, -64, -20, -72, 20, -72, 26, -64, 24, 0], '#2e3a2a');
  box(ctx, '#3e4e38', -22, -66, 6, 64);
  for (const y of [-58, -32, -8]) {
    box(ctx, OUT, -26, y, 52, 4);
    box(ctx, '#5a5a40', -25, y + 1, 50, 2);
    for (let i = 0; i < 5; i++) box(ctx, '#a8a070', -20 + i * 10, y + 1, 1, 1);
  }
  circle(ctx, 0, -44, 9, OUT);
  circle(ctx, 0, -44, 7, '#5ab030');
  circle(ctx, -2, -46, 3, GREEN_HOT);
  add(ctx, GREEN, 0, -44, 26, 22, 0.55);
  line(ctx, OUT, 7, [20, -66, 34, -66, 34, -100]);
  line(ctx, '#4a5a40', 4, [20, -66, 34, -66, 34, -100]);
  box(ctx, '#7a7a56', 30, -80, 9, 3);
};

/** A pipe run up into the dark with a valve wheel. */
const plaguePipe: PropFn = (ctx, e) => {
  const h = (e.h ?? 8) * TILE;
  box(ctx, OUT, -7, -h, 14, h);
  box(ctx, '#3a4a36', -6, -h, 12, h);
  box(ctx, '#5a6a50', -5, -h, 3, h);
  for (let y = -16; y > -h; y -= 40) {
    box(ctx, OUT, -9, y - 3, 18, 6);
    box(ctx, '#6a6a4a', -8, y - 2, 16, 4);
  }
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(14, -40, 7, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#8a3a2a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  line(ctx, '#8a3a2a', 1.2, [7, -40, 21, -40]);
  line(ctx, '#8a3a2a', 1.2, [14, -47, 14, -33]);
  // a weep of spores from a joint
  box(ctx, 'rgba(140,210,80,0.6)', 6, -58, 1, 10);
};

/** A reed bed with cattails. */
const plagueReeds: PropFn = (ctx, e, rng) => {
  const w = (e.w ?? 3) * TILE;
  for (let i = 0; i < w / 2.5; i++) {
    const x = -w / 2 + rng.range(0, w), h = rng.range(14, 36), b = rng.range(-6, 6);
    line(ctx, i % 2 ? '#2a3a20' : '#3a4e2a', 1.2, [x, 2, x + b * 0.4, -h * 0.6, x + b, -h]);
    if (rng.chance(0.3)) {
      box(ctx, OUT, x + b - 1.5, -h - 1, 3, 8);
      box(ctx, '#5a3a22', x + b - 1, -h, 2, 6);
    }
  }
};

/** Morvane's boundary: two wax-and-bone pylons. The veil between them is drawn live. */
const plagueGate: PropFn = (ctx) => {
  for (const s of [-1, 1]) {
    shape(ctx, [s * 22, 0, s * 24, -96, s * 34, -124, s * 44, -96, s * 40, 0], '#3a4a2e');
    for (let i = 0; i < 5; i++) {
      const y = -16 - i * 18;
      ctx.strokeStyle = '#5a6a40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let a = 0; a <= 6; a++) {
        const px = s * 32 + Math.cos((a / 6) * TAU) * 5, py = y + Math.sin((a / 6) * TAU) * 5;
        if (a) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    circle(ctx, s * 34, -110, 4, GREEN);
    add(ctx, GREEN, s * 34, -110, 14, 14, 0.5);
    box(ctx, MOSS, s * 31 - 10, -4, 20, 4);
  }
};

/** The queen's seat: a hive throne, comb behind, wings of wax and glass. */
const plagueThrone: PropFn = (ctx) => {
  for (const s of [-1, 1]) {
    shape(ctx, [s * 20, -60, s * 80, -140, s * 96, -110, s * 70, -60, s * 40, -40], 'rgba(150,190,120,0.35)', '#3a4a2e', 1);
    line(ctx, '#5a6a40', 1.2, [s * 22, -58, s * 82, -132]);
    line(ctx, '#5a6a40', 1, [s * 40, -56, s * 76, -86]);
  }
  shape(ctx, [-48, 0, -44, -30, -30, -36, -32, -96, -14, -128, 0, -150, 14, -128, 32, -96, 30, -36, 44, -30, 48, 0], '#2a3a24');
  ctx.strokeStyle = '#4a5e38';
  ctx.lineWidth = 1;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      const hx = -16 + c * 16 + (r & 1) * 8, hy = -110 + r * 14;
      ctx.beginPath();
      for (let a = 0; a <= 6; a++) {
        const px = hx + Math.cos((a / 6) * TAU + Math.PI / 6) * 7, py = hy + Math.sin((a / 6) * TAU + Math.PI / 6) * 7;
        if (a) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  box(ctx, '#6c8b51', -22, -68, 44, 40);
  box(ctx, '#8aac68', -22, -68, 44, 2);
  box(ctx, '#b7dc8d', -30, -26, 60, 5);
  add(ctx, GREEN, 0, -100, 26, 30, 0.3);
};

// ---------------------------------------------------------------- cinders

const IRON = '#4a3e3c', IRON_LIT = '#8a7464', IRON_DK = '#221a1a', BRICK = '#3e2a28', BRICK_LIT = '#5a3c34';
const HOT = '#ff8a3a', HOT_HI = '#ffd090', SOOT = '#1a1214', LEATHER = '#5a3a26';

/** A furnace stack: brick chimney, banded, its mouth glowing through the bars. */
const cinderStack: PropFn = (ctx, e) => {
  const h = 130 + (e.v ?? 0) * 18;
  shape(ctx, [-30, 0, -30, -70, -22, -84, -20, -h, 20, -h, 22, -84, 30, -70, 30, 0], BRICK);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = -6; y > -h; y -= 7) ctx.fillRect(-29, y, 58, 1);
  box(ctx, BRICK_LIT, -28, -68, 4, 66);
  box(ctx, BRICK_LIT, -19, -h + 6, 3, h - 92);
  for (const y of [-84, -h + 8]) {
    box(ctx, OUT, -24, y - 3, 48, 6);
    box(ctx, IRON_LIT, -23, y - 2, 46, 2);
  }
  // the mouth
  box(ctx, '#1a0806', -16, -54, 32, 44);
  ctx.fillStyle = '#ff7a2a';
  ctx.fillRect(-14, -26, 28, 14);
  box(ctx, HOT_HI, -10, -20, 20, 5);
  add(ctx, '#ff6a1a', 0, -24, 34, 30, 0.6);
  for (let i = 0; i < 5; i++) box(ctx, SOOT, -15 + i * 7, -54, 3, 44);
  box(ctx, SOOT, -24, -h - 4, 48, 5);
};

/** A pipe run: flanged joints, a valve wheel, a gauge. */
const cinderPipe: PropFn = (ctx) => {
  ctx.lineCap = 'butt';
  line(ctx, OUT, 22, [-21, 0, -21, -80, -10, -96, 27, -96, 27, -150]);
  line(ctx, IRON, 18, [-21, 0, -21, -80, -10, -96, 27, -96, 27, -150]);
  line(ctx, IRON_LIT, 4, [-27, 0, -27, -80]);
  line(ctx, IRON_LIT, 3, [-12, -103, 22, -103]);
  for (const [x, y, w, h] of [[-33, -36, 24, 6], [-33, -70, 24, 6], [15, -128, 24, 6], [4, -102, 6, 14]] as const) {
    box(ctx, OUT, x - 1, y - 1, w + 2, h + 2);
    box(ctx, '#8a6a52', x, y, w, h);
  }
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-4, -52, 8, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#a03a24';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  line(ctx, '#a03a24', 1.2, [-12, -52, 4, -52]);
  line(ctx, '#a03a24', 1.2, [-4, -60, -4, -44]);
  circle(ctx, 40, -112, 6, OUT);
  circle(ctx, 40, -112, 5, '#d8c8a8');
  line(ctx, '#7a1a10', 1, [40, -112, 43, -115]);
};

/** An anvil on its block, a hammer and tongs leaning against it. */
const cinderAnvil: PropFn = (ctx) => {
  shape(ctx, [-12, 0, -10, -16, 10, -16, 12, 0], '#3a2a24');
  shape(ctx, [-8, -16, -6, -22, 6, -22, 8, -16], IRON);
  shape(ctx, [-22, -22, -14, -30, 16, -30, 16, -22, 4, -22, -4, -22], IRON);
  poly(ctx, [-30, -28, -14, -30, -14, -26], IRON_LIT);
  box(ctx, IRON_LIT, -14, -30, 30, 1);
  box(ctx, HOT, -6, -31, 8, 1);
  line(ctx, OUT, 3, [16, 0, 26, -24]);
  line(ctx, '#6a4a34', 1.6, [16, 0, 26, -24]);
  shape(ctx, [22, -24, 32, -28, 34, -22, 24, -18], IRON);
  line(ctx, IRON_LIT, 1.2, [-18, 0, -22, -20, -20, -24]);
  line(ctx, IRON_LIT, 1.2, [-16, 0, -18, -20, -14, -24]);
};

/** A crucible on its tripod. The melt in it is drawn live. */
const cinderCrucibleBase: PropFn = (ctx) => {
  for (const s of [-1, 1]) line(ctx, IRON_DK, 3, [s * 16, 0, s * 8, -20]);
  line(ctx, IRON_DK, 3, [0, 0, 0, -18]);
  shape(ctx, [-16, -36, -14, -22, -6, -16, 6, -16, 14, -22, 16, -36], '#3a2e2c');
  box(ctx, IRON_LIT, -14, -34, 3, 14);
  box(ctx, OUT, -18, -38, 36, 3);
};

/** Big leather bellows in a frame, the nozzle into the forge. */
const cinderBellows: PropFn = (ctx) => {
  // a trestle, the lower board on it, the pleated leather, the upper board hinged at the nozzle
  for (const x of [-22, 12]) shape(ctx, [x - 3, 0, x - 1, -12, x + 1, -12, x + 3, 0], '#3a2a24');
  shape(ctx, [-30, -12, 22, -14, 22, -18, -30, -18], '#6a4a34');
  shape(ctx, [-28, -18, 20, -19, 20, -24, -28, -40], LEATHER);
  ctx.strokeStyle = '#2a180e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = -24 + i * 9, top = -38 + i * 3.4;
    ctx.moveTo(x, -19);
    ctx.lineTo(x + 3, (top - 19) / 2);
    ctx.lineTo(x, top);
  }
  ctx.stroke();
  shape(ctx, [-32, -40, 22, -24, 22, -20, -32, -36], '#7a5838');
  box(ctx, '#9a7650', -30, -39, 40, 1);
  shape(ctx, [20, -24, 34, -20, 34, -18, 20, -18], IRON_LIT);
  box(ctx, HOT, 33, -21, 2, 2);
  // the long handle, worn pale where hands have pulled it
  line(ctx, OUT, 3.4, [-30, -38, -46, -58]);
  line(ctx, '#8a6a48', 1.8, [-30, -38, -46, -58]);
  box(ctx, IRON_LIT, -34, -40, 4, 4);
};

/** A rack of new blades, cooling. */
const cinderRack: PropFn = (ctx) => {
  shape(ctx, [-26, 0, -26, -40, -22, -40, -22, 0], '#3a2a24');
  shape(ctx, [22, 0, 22, -40, 26, -40, 26, 0], '#3a2a24');
  box(ctx, OUT, -28, -36, 56, 4);
  box(ctx, '#6a4a34', -27, -35, 54, 2);
  for (let i = 0; i < 5; i++) {
    const x = -18 + i * 9;
    shape(ctx, [x - 1.5, -34, x + 1.5, -34, x + 1.5, -4, x, 0, x - 1.5, -4], IRON_LIT, OUT, 0.6);
    box(ctx, '#3a2a24', x - 3, -36, 6, 2);
    if (i === 2) box(ctx, HOT, x - 1, -12, 2, 8);
  }
};

/** A smith turned to ash where he knelt: a grey figure, hands still raised. */
const cinderStatue: PropFn = (ctx) => {
  shape(ctx, [-16, 0, -14, -6, 12, -6, 16, 0], '#3a3234');
  shape(ctx, [-10, -6, -12, -14, -6, -20, -8, -32, -4, -40, 4, -40, 8, -32, 6, -22, 12, -14, 10, -6], '#5a5254');
  circle(ctx, 0, -45, 6, '#5a5254');
  line(ctx, OUT, 4.6, [-6, -34, -14, -44, -12, -56]);
  line(ctx, OUT, 4.6, [6, -34, 14, -46, 12, -58]);
  line(ctx, '#6a6264', 3, [-6, -34, -14, -44, -12, -56]);
  line(ctx, '#6a6264', 3, [6, -34, 14, -46, 12, -58]);
  box(ctx, '#7a7274', -4, -50, 4, 2);
  // cracks with the last of the heat in them
  box(ctx, HOT, -2, -30, 1, 6);
  box(ctx, HOT, -1, -24, 2, 1);
  box(ctx, '#8a8284', -8, -32, 2, 10);
};

/** Ingots stacked by a quench barrel. */
const cinderIngots: PropFn = (ctx) => {
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 3 - r; i++) {
      const x = -24 + i * 11 + r * 5.5, y = -5 - r * 5;
      shape(ctx, [x, y + 5, x + 1, y, x + 9, y, x + 10, y + 5], r === 2 ? '#c8783a' : '#8a6a52', OUT, 0.6);
      box(ctx, r === 2 ? HOT_HI : '#b8987a', x + 1, y, 8, 1);
    }
  shape(ctx, [10, 0, 9, -24, 27, -24, 26, 0], '#3a2a24');
  for (const y of [-20, -6]) box(ctx, IRON_LIT, 9, y, 18, 2);
  box(ctx, '#1a2028', 11, -24, 14, 2);
};

/** Azkar's boundary: iron pylons, the furnace seal between them drawn live. */
const cinderGate: PropFn = (ctx) => {
  for (const s of [-1, 1]) {
    shape(ctx, [s * 22, 0, s * 22, -114, s * 40, -114, s * 40, 0], '#4a3330');
    box(ctx, IRON_LIT, s * 31 - 8, -112, 3, 110);
    for (const y of [-100, -60, -20]) {
      box(ctx, OUT, s * 31 - 12, y - 3, 24, 6);
      box(ctx, '#d3915b', s * 31 - 11, y - 2, 22, 3);
    }
    box(ctx, '#d3915b', s * 31 - 12, -120, 24, 7);
    add(ctx, '#ff8a3a', s * 31, -124, 10, 10, 0.5);
  }
};

/** Azkar's seat: an anvil-throne between two banked furnaces. */
const cinderThrone: PropFn = (ctx) => {
  shape(ctx, [-62, 0, -62, -25, -38, -38, -38, -96, -50, -140, -25, -119, 0, -161, 25, -119, 50, -140, 38, -96, 38, -38, 62, -25, 62, 0], '#33272b');
  box(ctx, '#4a383a', -34, -94, 6, 56);
  poly(ctx, [-50, -140, -25, -119, -28, -112], '#c88d58');
  poly(ctx, [50, -140, 25, -119, 28, -112], '#c88d58');
  poly(ctx, [0, -161, -6, -128, 6, -128], '#f4b569');
  // the anvil set in the seat's back, a hammer across it
  shape(ctx, [-26, -78, -18, -86, 18, -86, 26, -78, 10, -72, -10, -72], IRON);
  box(ctx, IRON_LIT, -18, -86, 36, 1);
  box(ctx, '#b9673b', -26, -70, 52, 40);
  box(ctx, '#d8884a', -26, -70, 52, 2);
  box(ctx, '#f4b569', -34, -29, 68, 7);
  for (const s of [-1, 1]) {
    shape(ctx, [s * 72 - 14, 0, s * 72 - 14, -66, s * 72, -76, s * 72 + 14, -66, s * 72 + 14, 0], '#463131');
    box(ctx, '#1a0806', s * 72 - 9, -54, 18, 40);
    box(ctx, '#ef9c51', s * 72 - 8, -30, 16, 14);
    add(ctx, '#ff7a2a', s * 72, -30, 22, 22, 0.5);
  }
};

// ---------------------------------------------------------------- tables

const PROPS: Record<string, PropFn> = {
  hunt_tree: huntTree,
  hunt_totem: huntTotem,
  hunt_bones: huntBones,
  hunt_rack: huntRack,
  hunt_tent: huntTent,
  hunt_rock: huntRock,
  hunt_cage: huntCage,
  hunt_horn: huntHorn,
  hunt_palisade: huntPalisade,
  hunt_gate: huntGate,
  hunt_throne: huntThrone,
  plague_tree: plagueTree,
  plague_lantern: plagueLanternBase,
  plague_door: plagueDoor,
  plague_shroom: plagueShroom,
  plague_cart: plagueCart,
  plague_cot: plagueCot,
  plague_vat: plagueVat,
  plague_pipe: plaguePipe,
  plague_reeds: plagueReeds,
  plague_gate: plagueGate,
  plague_throne: plagueThrone,
  cinders_tree: cinderStack,
  cinders_pipe: cinderPipe,
  cinders_anvil: cinderAnvil,
  cinders_crucible: cinderCrucibleBase,
  cinders_bellows: cinderBellows,
  cinders_rack: cinderRack,
  cinders_statue: cinderStatue,
  cinders_ingots: cinderIngots,
  cinders_gate: cinderGate,
  cinders_throne: cinderThrone,
};

/** Kinds with a moving part drawn every frame (their static part, if any, is baked). */
export const FALLEN_LIVE: ReadonlySet<string> = new Set(['hunt_gate', 'plague_gate', 'cinders_gate', 'hunt_banner', 'hunt_fire', 'plague_lantern', 'plague_brood', 'cinders_crucible', 'cinders_chain', ...GRECIA_LIVE]);

/** Static part of a Chapter VII–IX prop, baked with the tiles. False for other kinds. */
export function fallenProp(ctx: Ctx, e: Decor): boolean {
  if (e.k.startsWith('grecia_')) return greciaProp(ctx, e);
  if (!e.k.startsWith('hunt_') && !e.k.startsWith('plague_') && !e.k.startsWith('cinders_')) return false;
  const f = PROPS[e.k];
  if (!f) return FALLEN_LIVE.has(e.k);
  ctx.save();
  ctx.translate(e.x * TILE, e.y * TILE);
  if (e.flip) ctx.scale(-1, 1);
  f(ctx, e, new RNG(Math.floor(e.x * 31 + e.y * 7)));
  ctx.restore();
  return true;
}

/** Moving parts: banners, flames, lantern light, the brood's pulse, chains, and the boundary seals. */
export function drawFallenLive(ctx: Ctx, e: Decor, t: number) {
  if (e.k.startsWith('grecia_')) return drawGreciaLive(ctx, e, t);
  const x = e.x * TILE, y = e.y * TILE, ph = hash2(e.x | 0, e.y | 0, 791) * TAU;
  ctx.save();
  ctx.translate(x, y);
  switch (e.k) {
    case 'hunt_gate':
    case 'plague_gate':
    case 'cinders_gate': {
      const n = e.k === 'hunt_gate' ? 7 : e.k === 'plague_gate' ? 8 : 9;
      if (flag(`ch${n}_boundary_open`)) break;
      const col = n === 7 ? '#d8a070' : n === 8 ? '#a8e070' : '#ff9a50';
      const a = 0.25 + 0.08 * Math.sin(t * 2.2);
      ctx.fillStyle = rgba(col, a);
      ctx.fillRect(-22, -104, 44, 104);
      ctx.strokeStyle = rgba(col, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const yy = -96 + i * 22 + ((t * 10) % 22);
        ctx.moveTo(-20, yy);
        ctx.lineTo(20, yy + (n === 9 ? 10 : 0));
      }
      ctx.stroke();
      add(ctx, col, 0, -52, 30, 56, 0.25);
      break;
    }
    case 'hunt_banner': {
      // a hide banner on a spear, the claw sigil daubed on it
      const h = (e.h ?? 4) * TILE, sw = Math.sin(t * 1.3 + ph) * 3;
      line(ctx, OUT, 3, [0, 0, 0, -h - 20]);
      line(ctx, BARK_LIT, 1.4, [0, 0, 0, -h - 20]);
      poly(ctx, [-2, -h - 20, 2, -h - 20, 0, -h - 28], BONE);
      const pts = [1, -h - 16, 22, -h - 16, 22 + sw * 0.5, -h * 0.45, 12 + sw, -h * 0.3, 1 + sw * 0.4, -h * 0.45];
      poly(ctx, pts, HIDE, OUT, 1);
      for (let i = 0; i < 3; i++) line(ctx, BLOOD, 1.6, [6 + i * 4 + sw * 0.2, -h + 4, 4 + i * 4 + sw * 0.4, -h * 0.6]);
      break;
    }
    case 'hunt_fire': {
      // a ring of stones around a hunters' fire
      for (let i = 0; i < 5; i++) ellipse(ctx, -12 + i * 6, -2, 4, 3, 0, i & 1 ? '#4a4450' : '#3a3440');
      line(ctx, OUT, 4, [-8, 0, 8, -6]);
      line(ctx, '#5a3a28', 2, [-8, 0, 8, -6]);
      line(ctx, OUT, 4, [8, 0, -8, -6]);
      line(ctx, '#6a4a34', 2, [8, 0, -8, -6]);
      fire(ctx, 0, -4, 7 * (0.9 + 0.1 * Math.sin(t * 9 + ph)), t + ph);
      break;
    }
    case 'plague_lantern': {
      const sw = Math.sin(t * 1.2 + ph) * 1.5, fl = 0.85 + 0.15 * Math.sin(t * 7 + ph);
      line(ctx, OUT, 1, [16, -56, 16 + sw, -46]);
      poly(ctx, [12 + sw, -46, 20 + sw, -46, 21 + sw, -34, 11 + sw, -34], '#2a2a1c', OUT, 1);
      box(ctx, '#e8d870', 13 + sw, -44, 6, 8);
      add(ctx, '#d8f080', 16 + sw, -40, 26 * fl, 26 * fl, 0.55);
      break;
    }
    case 'plague_brood': {
      // cocoons in a clutch on the ground, breathing
      for (let i = 0; i < 3; i++) {
        const p = 1 + 0.06 * Math.sin(t * 2 + i * 2 + ph);
        const cx = -10 + i * 10, h = (i === 1 ? 16 : 12) * p;
        ellipse(ctx, cx, -h, 7 * p, h, 0, OUT);
        ellipse(ctx, cx, -h, 5.6 * p, h - 1.4, 0, '#8a9468');
        line(ctx, '#5a6448', 0.8, [cx - 4, -h * 1.4, cx + 4, -h * 0.6]);
        add(ctx, GREEN, cx, -h, 8, h, 0.25 + 0.15 * Math.sin(t * 2 + i * 2 + ph));
      }
      break;
    }
    case 'cinders_crucible': {
      // the melt in the crucible, crusting and breaking
      const fl = 0.8 + 0.2 * Math.sin(t * 4 + ph);
      box(ctx, '#ff7a2a', -13, -38, 26, 3);
      box(ctx, HOT_HI, -6 + Math.sin(t * 2 + ph) * 4, -38, 6, 1);
      add(ctx, '#ff7a2a', 0, -40, 28 * fl, 16 * fl, 0.55);
      break;
    }
    case 'cinders_chain': {
      // a chain from the beams, a hook swinging on it
      const len = (e.h ?? 6) * TILE, sw = Math.sin(t * 0.9 + ph) * 4;
      ctx.strokeStyle = IRON_DK;
      ctx.lineWidth = 3;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.quadraticCurveTo(sw * 0.3, -len * 0.5, sw, 0);
      ctx.stroke();
      ctx.strokeStyle = IRON_LIT;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      line(ctx, OUT, 3, [sw, 0, sw, 6]);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sw + 4, 8, 4, Math.PI, Math.PI * 0.2, true);
      ctx.stroke();
      ctx.strokeStyle = IRON_LIT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
