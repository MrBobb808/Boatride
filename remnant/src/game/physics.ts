// Axis-separated AABB vs tile-grid collision with one-way platforms.
// Bodies are positioned by bottom-centre (x = centre, y = feet).

import { TILE, T, type Grid } from './tiles';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  wallDir: number;
  hitCeil: boolean;
  /** Seconds remaining during which one-way platforms are ignored. */
  dropT: number;
  /** Tile type under the feet (for footstep sounds). */
  groundTile: T;
}

export type SolidFn = (t: T) => boolean;

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, vx: 0, vy: 0, w, h, onGround: false, wallDir: 0, hitCeil: false, dropT: 0, groundTile: T.Empty };
}

const EPS = 0.001;

export function moveBody(b: Body, dt: number, g: Grid, solid: SolidFn, collide = true) {
  b.wallDir = 0;
  b.hitCeil = false;
  if (b.dropT > 0) b.dropT -= dt;
  if (!collide) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.onGround = false;
    return;
  }
  // ---- horizontal
  const dx = b.vx * dt;
  if (dx !== 0) {
    let nx = b.x + dx;
    const top = Math.floor((b.y - b.h + EPS) / TILE);
    const bot = Math.floor((b.y - EPS) / TILE);
    if (dx > 0) {
      const col = Math.floor((nx + b.w / 2 - EPS) / TILE);
      for (let r = top; r <= bot; r++) {
        if (solid(g.get(col, r))) {
          nx = col * TILE - b.w / 2;
          b.vx = 0;
          b.wallDir = 1;
          break;
        }
      }
    } else {
      const col = Math.floor((nx - b.w / 2 + EPS) / TILE);
      for (let r = top; r <= bot; r++) {
        if (solid(g.get(col, r))) {
          nx = (col + 1) * TILE + b.w / 2;
          b.vx = 0;
          b.wallDir = -1;
          break;
        }
      }
    }
    b.x = nx;
  }
  // ---- vertical
  const dy = b.vy * dt;
  const l = Math.floor((b.x - b.w / 2 + EPS) / TILE);
  const r = Math.floor((b.x + b.w / 2 - EPS) / TILE);
  b.onGround = false;
  if (dy > 0) {
    const ny = b.y + dy;
    const fromRow = Math.floor((b.y - EPS) / TILE);
    const toRow = Math.floor((ny - EPS) / TILE);
    let landed = false;
    for (let row = fromRow + 1; row <= toRow && !landed; row++) {
      for (let c = l; c <= r; c++) {
        const t = g.get(c, row);
        const oneWay = t === T.OneWay && b.dropT <= 0 && b.y <= row * TILE + EPS;
        if (solid(t) || oneWay) {
          b.y = row * TILE;
          b.vy = 0;
          b.onGround = true;
          b.groundTile = t;
          landed = true;
          break;
        }
      }
    }
    if (!landed) b.y = ny;
  } else if (dy < 0) {
    const ny = b.y + dy;
    const headFrom = Math.floor((b.y - b.h + EPS) / TILE);
    const headTo = Math.floor((ny - b.h + EPS) / TILE);
    let bonk = false;
    for (let row = headFrom - 1; row >= headTo && !bonk; row--) {
      for (let c = l; c <= r; c++) {
        if (solid(g.get(c, row))) {
          b.y = (row + 1) * TILE + b.h;
          b.vy = 0;
          b.hitCeil = true;
          bonk = true;
          break;
        }
      }
    }
    if (!bonk) b.y = ny;
  }
  // ---- ground probe when resting
  if (!b.onGround && b.vy >= 0) {
    const row = Math.floor((b.y + 0.5) / TILE);
    if (Math.abs(b.y - row * TILE) < 0.6) {
      for (let c = l; c <= r; c++) {
        const t = g.get(c, row);
        if (solid(t) || (t === T.OneWay && b.dropT <= 0)) {
          b.onGround = true;
          b.groundTile = t;
          b.y = row * TILE;
          break;
        }
      }
    }
  }
}

/** True if the body overlaps any tile matching `pred`. */
export function touchesTile(b: Body, g: Grid, pred: (t: T) => boolean, shrink = 2) {
  const l = Math.floor((b.x - b.w / 2 + shrink) / TILE);
  const r = Math.floor((b.x + b.w / 2 - shrink) / TILE);
  const top = Math.floor((b.y - b.h + shrink) / TILE);
  const bot = Math.floor((b.y - 0.5) / TILE);
  for (let row = top; row <= bot; row++) for (let c = l; c <= r; c++) if (pred(g.get(c, row))) return true;
  return false;
}

/** Is there solid ground one step ahead (for AI edge checks)? */
export function groundAhead(b: Body, dir: number, g: Grid, solid: SolidFn, dist = 6) {
  const x = b.x + dir * (b.w / 2 + dist);
  const c = Math.floor(x / TILE);
  const row = Math.floor((b.y + 2) / TILE);
  const t = g.get(c, row);
  return solid(t) || t === T.OneWay;
}
export function wallAhead(b: Body, dir: number, g: Grid, solid: SolidFn, dist = 4) {
  const x = b.x + dir * (b.w / 2 + dist);
  const c = Math.floor(x / TILE);
  const row = Math.floor((b.y - 4) / TILE);
  return solid(g.get(c, row)) || solid(g.get(c, Math.floor((b.y - b.h + 4) / TILE)));
}
export function hazardAhead(b: Body, dir: number, g: Grid, dist = 8) {
  const x = b.x + dir * (b.w / 2 + dist);
  const c = Math.floor(x / TILE);
  const row = Math.floor((b.y + 2) / TILE);
  const t = g.get(c, row);
  const t2 = g.get(c, row - 1);
  return t === T.Spikes || t === T.Veil || t2 === T.Spikes || t2 === T.Veil;
}

/** Line of sight between two points through the tile grid. */
export function los(g: Grid, solid: SolidFn, x0: number, y0: number, x1: number, y1: number) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solid(g.get(Math.floor((x0 + (x1 - x0) * t) / TILE), Math.floor((y0 + (y1 - y0) * t) / TILE)))) return false;
  }
  return true;
}
