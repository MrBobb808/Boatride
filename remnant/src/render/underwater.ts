// The look of water you can swim in: a tint and a waterline drawn in front of
// whatever is in the water, bubbles and current streaks (a fixed pool, no
// per-frame allocation), air bells, splashes, the cached underwater overlay
// (depth tint, light shafts, caustics) and Elior's breath ring on the HUD.
// Detail is gated on the quality tier: caustics on high, shafts from medium.

import { G } from '../game/ctx';
import { TILE, T, type Biome } from '../game/tiles';
import { waterRoom, flowAt, inAirPocket, WATER_LIP, BREATH_MAX } from '../game/water';
import { fx, PK } from './fx';
import { glow, rgba, makeCanvas, releaseCanvas, FONT_DISPLAY, type Ctx } from './draw';
import { clamp, rand } from '../core/math';

/** Per-biome water colour: [front tint, deep overlay]. Add a biome here to colour its water. */
export const WATER_TINT: Partial<Record<Biome, [string, string]>> = {
  hiddekel: ['#3a5a78', '#14304a'],
  grecia: ['#2a6a7a', '#0c3444'],
  hunt: ['#4a6a90', '#1a2a48'],
  plague: ['#3a5a24', '#16260e'],
  cinders: ['#3a2a28', '#1a1010'],
  riverbed: ['#5a6a5a', '#1c2a24'],
};
const DEFAULT_TINT: [string, string] = ['#2e5a82', '#10283e'];
const tintOf = (b: Biome) => WATER_TINT[b] ?? DEFAULT_TINT;

// ---------------------------------------------------------------- bubbles & streaks

const CAP = 180;
const bx = new Float32Array(CAP), by = new Float32Array(CAP), bvx = new Float32Array(CAP), bvy = new Float32Array(CAP);
const blife = new Float32Array(CAP), bsize = new Float32Array(CAP), bkind = new Uint8Array(CAP);
let count = 0;
const FLOW = { x: 0, y: 0 };

function push(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number) {
  if (count >= CAP) return;
  bx[count] = x; by[count] = y; bvx[count] = vx; bvy[count] = vy; blife[count] = life; bsize[count] = size; bkind[count] = kind;
  count++;
}

/** A bubble rising from (x, y); size ~1. It pops at the surface or in an air bell. */
export function emitBubble(x: number, y: number, vx: number, vy: number, size = 1) {
  push(0, x, y, vx, vy, rand(1.5, 3.5), size * rand(0.7, 1.2));
}

/** Spray and a flat ring where something breaks the surface. */
export function splash(x: number, y: number, power = 1) {
  const n = Math.round(4 + power * 8);
  const c = tintOf(G.world.room.biome)[0];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + rand(-0.9, 0.9);
    const sp = rand(60, 150) * power;
    fx.spawn(PK.Drop, x + rand(-5, 5), y - 1, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, 0.7), rand(1, 2), 0.4, i % 3 ? '#dff2ff' : c, 700, 0.5);
  }
  fx.ring(x, y, 3, 10 + power * 14, '#e8f6ff', 0.35, 1.5, 0.22);
}

/** Is a point under a water surface (cheap: no column scan unless at the top tile)? */
function wet(x: number, y: number) {
  const g = G.world.grid, col = Math.floor(x / TILE), row = Math.floor(y / TILE);
  if (g.get(col, row) !== T.Water) return false;
  if (g.get(col, row - 1) === T.Water) return true;
  const above = g.get(col, row - 1);
  return above !== T.Empty || y >= row * TILE + WATER_LIP;
}

let ambT = 0, curT = 0;

/** Spawn ambient bubbles and current streaks in view, and move everything. Runs every step. */
export function updateWater(dt: number) {
  if (!waterRoom.any) { count = 0; return; }
  const r = G.renderer, v = G.camera.view(), tier = r.tier;
  // Ambient: a few bubbles from random water in view.
  ambT += dt * [2, 4, 7][tier];
  while (ambT >= 1) {
    ambT -= 1;
    const x = v.x + Math.random() * v.w, y = v.y + Math.random() * v.h;
    if (wet(x, y) && wet(x, y - 8)) emitBubble(x, y, 0, -rand(12, 26), rand(0.5, 1));
  }
  // Currents: streaks running with the flow, and bubbles caught in it.
  curT += dt * [5, 10, 16][tier];
  for (const c of waterRoom.currents) {
    if (c.x1 < v.x || c.x0 > v.x + v.w || c.y1 < v.y || c.y0 > v.y + v.h || (c.cond && !G.save.flags[c.cond])) continue;
    const area = ((c.x1 - c.x0) * (c.y1 - c.y0)) / (TILE * TILE * 40);
    let n = curT * Math.min(3, Math.max(0.4, area));
    while (n >= 1) {
      n -= 1;
      const x = rand(c.x0, c.x1), y = rand(c.y0, c.y1);
      if (wet(x, y)) push(1, x, y, 0, 0, rand(0.5, 1), rand(6, 12));
    }
  }
  curT %= 1;
  // Air bells are fed by a thin stream rising into them.
  for (const p of waterRoom.pockets) {
    if (Math.random() < dt * 3 && Math.abs(p.x - v.x - v.w / 2) < v.w) emitBubble(p.x + rand(-3, 3), p.y + p.r + rand(8, 30), 0, -rand(18, 30), 0.7);
  }
  // Move: bubbles rise and wobble, streaks run with the flow; both are carried.
  for (let i = count - 1; i >= 0; i--) {
    blife[i] -= dt;
    flowAt(bx[i], by[i], FLOW);
    if (bkind[i] === 0) {
      bvx[i] += (Math.sin(blife[i] * 9 + i) * 14 - bvx[i] * 1.5) * dt;
      bx[i] += (bvx[i] + FLOW.x * 0.9) * dt;
      by[i] += (bvy[i] + FLOW.y * 0.9) * dt;
    } else {
      bx[i] += FLOW.x * 1.1 * dt;
      by[i] += FLOW.y * 1.1 * dt;
    }
    const gone = blife[i] <= 0 || !wet(bx[i], by[i]) || (bkind[i] === 0 && inAirPocket(bx[i], by[i]));
    if (gone) {
      count--;
      bx[i] = bx[count]; by[i] = by[count]; bvx[i] = bvx[count]; bvy[i] = bvy[count];
      blife[i] = blife[count]; bsize[i] = bsize[count]; bkind[i] = bkind[count];
    }
  }
}

export const bubbleCount = () => count;

// ---------------------------------------------------------------- in front of the swimmers

/**
 * Drawn after the actors: a light tint over every water tile in view (so what
 * swims is seen through the water), the waterline across it, air bells,
 * bubbles and current streaks. World space, camera applied.
 */
export function drawWaterFront(ctx: Ctx, view: { x: number; y: number; w: number; h: number }, t: number) {
  if (!waterRoom.any) return;
  const g = G.world.grid;
  const [tint] = tintOf(G.world.room.biome);
  const tx0 = Math.max(0, Math.floor(view.x / TILE)), tx1 = Math.min(g.w - 1, Math.floor((view.x + view.w) / TILE));
  const ty0 = Math.max(0, Math.floor(view.y / TILE)), ty1 = Math.min(g.h - 1, Math.floor((view.y + view.h) / TILE));
  ctx.fillStyle = rgba(tint, 0.2);
  for (let ty = ty0; ty <= ty1; ty++) {
    let run = -1;
    for (let tx = tx0; tx <= tx1 + 1; tx++) {
      const isW = tx <= tx1 && g.get(tx, ty) === T.Water && g.get(tx, ty - 1) === T.Water;
      if (isW && run < 0) run = tx;
      if (!isW && run >= 0) { ctx.fillRect(run * TILE, ty * TILE, (tx - run) * TILE, TILE); run = -1; }
    }
  }
  // Top tiles: the body below the lip, and the waterline in front.
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      if (g.get(tx, ty) !== T.Water || g.get(tx, ty - 1) === T.Water) continue;
      const open = g.get(tx, ty - 1) === T.Empty;
      const y = ty * TILE + (open ? WATER_LIP : 0);
      ctx.fillStyle = rgba(tint, 0.2);
      ctx.fillRect(tx * TILE, y, TILE, ty * TILE + TILE - y);
      if (!open) continue;
      const wv = Math.sin(t * 2.2 + tx * 0.9) > 0.55 ? 1 : 0;
      ctx.fillStyle = 'rgba(214,240,255,0.55)';
      ctx.fillRect(tx * TILE, y + wv, TILE, 1);
      ctx.fillStyle = 'rgba(214,240,255,0.18)';
      ctx.fillRect(tx * TILE, y + 2 + wv, TILE, 1);
    }
  // Air bells: a silvery dome of trapped air.
  for (const p of waterRoom.pockets) {
    if (p.cond && !G.save.flags[p.cond]) continue;
    if (p.x + p.r < view.x || p.x - p.r > view.x + view.w) continue;
    const sh = Math.sin(t * 3 + p.x) * 0.6;
    ctx.fillStyle = 'rgba(200,236,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r, p.r * 0.85 + sh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,248,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r, p.r * 0.85 + sh, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,252,255,0.5)';
    ctx.fillRect(Math.round(p.x - p.r * 0.5), Math.round(p.y - p.r * 0.55), 3, 1);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, p.x, p.y, p.r * 1.4, '#bfe8ff', 0.18);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Bubbles and streaks.
  for (let i = 0; i < count; i++) {
    if (bkind[i] === 0) {
      const s = Math.max(1, Math.round(bsize[i] * 1.6));
      ctx.fillStyle = 'rgba(220,244,255,0.7)';
      ctx.fillRect(Math.round(bx[i]), Math.round(by[i]), s, s);
      if (s > 1) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.round(bx[i]), Math.round(by[i]), 1, 1); }
    } else {
      flowAt(bx[i], by[i], FLOW);
      const m = Math.hypot(FLOW.x, FLOW.y) || 1, len = bsize[i];
      const a = clamp(blife[i] * 2, 0, 1) * 0.35;
      ctx.strokeStyle = rgba('#dff2ff', a);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx[i], by[i]);
      ctx.lineTo(bx[i] - (FLOW.x / m) * len, by[i] - (FLOW.y / m) * len);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- the view from under the surface

let shafts: HTMLCanvasElement | null = null;
let shade: HTMLCanvasElement | null = null;
let shadeKey = '';
let caustic: CanvasPattern | null = null;
let causticGen = -1;

function buildShafts() {
  const m = makeCanvas(256, 128);
  const c = m.ctx;
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 52 + (i % 2) * 14, w = 10 + (i % 3) * 8;
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(200,240,255,0.55)');
    g.addColorStop(1, 'rgba(200,240,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w + 34, 128); c.lineTo(x + 22, 128);
    c.closePath();
    c.fill();
  }
  return m.c;
}

function buildShade(deep: string) {
  const m = makeCanvas(1, 64);
  const g = m.ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, rgba(deep, 0.12));
  g.addColorStop(1, rgba(deep, 0.5));
  m.ctx.fillStyle = g;
  m.ctx.fillRect(0, 0, 1, 64);
  return m.c;
}

function buildCaustic(ctx: Ctx) {
  const m = makeCanvas(48, 48);
  const c = m.ctx;
  c.strokeStyle = 'rgba(210,245,255,1)';
  c.lineWidth = 1;
  // A loose net of light, tiled.
  const pts = [[4, 6], [20, 2], [38, 10], [44, 30], [30, 40], [12, 36], [2, 22], [22, 20]];
  c.beginPath();
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [7, 0], [7, 2], [7, 4], [7, 5]]) {
    c.moveTo(pts[a][0], pts[a][1]);
    c.quadraticCurveTo((pts[a][0] + pts[b][0]) / 2 + 3, (pts[a][1] + pts[b][1]) / 2 - 3, pts[b][0], pts[b][1]);
  }
  c.stroke();
  return ctx.createPattern(m.c, 'repeat');
}

/**
 * While Elior's head is under: the deep tint below the surface line, light
 * shafts swaying down from it, and caustics. World space, camera applied.
 */
export function drawUnderwater(ctx: Ctx, t: number) {
  const p = G.world.player, w = p.water;
  if (!w.submerged || p.state === 'dead') return;
  const r = G.renderer, v = G.camera.view();
  const [, deep] = tintOf(G.world.room.biome);
  if (shadeKey !== deep) { releaseCanvas(shade); shade = buildShade(deep); shadeKey = deep; }
  const top = w.air ? Math.max(v.y, w.surface) : v.y;
  const h = v.y + v.h - top;
  if (h <= 0) return;
  // Deeper is darker.
  const depth = clamp((p.y - w.surface) / 260, 0, 1);
  ctx.globalAlpha = 0.55 + depth * 0.45;
  ctx.drawImage(shade!, v.x - 2, top, v.w + 4, h + 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  if (r.tier >= 1 && w.air) {
    if (!shafts) shafts = buildShafts();
    const sway = Math.sin(t * 0.4) * 14;
    const sw = Math.max(v.w, 256) * 1.2, sh = Math.min(h, 220);
    const ox = v.x - ((v.x * 0.3) % (sw / 3)) + sway - sw * 0.1;
    ctx.globalAlpha = 0.22 * (1 - depth * 0.7);
    ctx.drawImage(shafts, ox, w.surface, sw, sh);
    ctx.globalAlpha = 1;
  }
  if (r.tier >= 2) {
    if (!caustic || causticGen !== r.generation) { caustic = buildCaustic(ctx); causticGen = r.generation; }
    if (caustic) {
      ctx.save();
      ctx.translate(Math.sin(t * 0.5) * 8 + t * 4, Math.cos(t * 0.4) * 6);
      ctx.globalAlpha = 0.07 * (1 - depth * 0.6);
      ctx.fillStyle = caustic;
      ctx.fillRect(v.x - 60, top - 20, v.w + 120, h + 40);
      ctx.restore();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- breath ring (HUD)

/**
 * A small ring beside Elior's head while he is under or getting his breath
 * back: it never crowds the corner HUD or the Dynamic Island. CSS pixels.
 */
export function drawBreath(ctx: Ctx, u: number) {
  const p = G.world?.player;
  if (!p || p.water.showT <= 0.01 || p.state === 'dead') return;
  const w = p.water, r = G.renderer;
  const sc = G.camera.worldToScreen(p.x + p.face * 15, p.y - p.body.h - 6);
  const k = r.k / r.px;
  const x = clamp(sc.x * k, 16, r.cssW - 16), y = clamp(sc.y * k, 16, r.cssH - 16);
  const f = clamp(w.breath / BREATH_MAX, 0, 1);
  const R = 7.5 * u;
  const low = f < 0.3, empty = f <= 0;
  ctx.globalAlpha = w.showT * (G.inCutscene ? 0.35 : 1);
  ctx.fillStyle = 'rgba(8,14,22,0.72)';
  ctx.beginPath();
  ctx.arc(x, y, R + 2.5 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.6 * u;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.stroke();
  const c = empty ? '#ff5a6a' : low ? '#ffb05a' : '#8fdcff';
  if (f > 0) {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
    ctx.stroke();
  }
  if (low) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, R * 2.2, c, (0.25 + Math.sin(G.time * (empty ? 12 : 7)) * 0.15) * w.showT);
    ctx.globalCompositeOperation = 'source-over';
  }
  // A bubble glyph in the middle (the "pocket" is shown filled).
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  ctx.arc(x - 1.2 * u, y + 1 * u, 2.4 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 2.2 * u, y - 2.4 * u, 1.3 * u, 0, Math.PI * 2);
  ctx.stroke();
  if (empty) {
    ctx.font = `700 ${7 * u}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd0d4';
    ctx.fillText('AIR', x, y + R + 8 * u);
  }
  ctx.globalAlpha = 1;
}
