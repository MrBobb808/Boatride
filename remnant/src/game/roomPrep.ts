// Idle-time preparation of the rooms behind the current room's doors. Their parallax
// strips and the tile chunks around where the player will arrive are baked in small
// slices between frames, so stepping through a door shows a finished room at once.
// Everything is keyed by the renderer's bake settings and released when they change.

import { ROOMS, type RoomData } from './rooms';
import { Grid, T, TILE, isSolid } from './tiles';
import { G, flag } from './ctx';
import { TileCache, parallaxSteps, type Layer, type ParallaxSteps } from '../render/environment';
import { releaseCanvas } from '../render/draw';

/** Rooms rebuilt on the fly (the Trial reshapes its arena by wave), so never prepared. */
const SKIP = new Set(['trial_arena']);
/** A slice chains steps for this long (ms)... */
const SLICE_MS = 3;
/** ...and a single step may take up to this much of a frame's gap (one parallax strip). */
const STEP_MAX_MS = 8;
/** Extra world units around the arrival view (look-ahead, shake, the first steps). */
const MARGIN = 64;

/** The room's tiles as the World plays them: the authored rows plus what the story has changed. */
export function roomGrid(r: RoomData): Grid {
  const g = new Grid(r.rows);
  if (r.id === 'temple_steps' && flag('collapsed')) {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) === T.Collapse) g.set(x, y, T.Empty);
  }
  const broken = String(G.save.flags['broken:' + r.id] ?? '');
  if (broken) for (const pair of broken.split(';')) {
    const [x, y] = pair.split(',').map(Number);
    if (Number.isFinite(x)) g.set(x, y, T.Empty);
  }
  return g;
}

/** Tile chunk resolution for the renderer's current settings. */
export function chunkScale() {
  const r = G.renderer;
  return r.scale * (r.pixel || r.tier === 2 ? 1 : r.tier === 1 ? 0.85 : 0.7);
}

/** Parallax strip resolution; pixel art draws the backdrop at full art resolution, it is small enough to be cheap. */
export function parallaxRes() {
  const r = G.renderer;
  return r.pixel ? r.scale : r.tier === 2 ? r.scale * 0.5 : r.scale * 0.4;
}

const cond = (c?: string, n?: string) => (c ? flag(c) : true) && (n ? !flag(n) : true);

/** The flags a room's baked props hang on, so a prop that appeared or vanished since baking is caught. */
function marksOf(r: RoomData) {
  let m = '';
  for (const e of r.ents) {
    if (e.t !== 'decor') continue;
    const c = (e as { cond?: string }).cond, n = (e as { ncond?: string }).ncond;
    if (c || n) m += cond(c, n) ? '1' : '0';
  }
  return m;
}

function sameGrid(a: Grid, b: Grid) {
  if (a.w !== b.w || a.h !== b.h) return false;
  const x = a.t, y = b.t;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function layerPx(l: Layer) {
  return l.c.width * l.c.height;
}

interface Prep {
  room: RoomData;
  key: string;
  marks: string;
  grid: Grid;
  cache: TileCache;
  steps: ParallaxSteps | null;
  /** Strips baked so far (released if the bake is abandoned half way). */
  made: Layer[];
  layers: Layer[] | null;
  /** Chunks to bake, nearest the arrival view first. */
  queue: number[];
}

interface Target { id: string; spawn: string; x: number; y: number; cond?: string }

export class RoomPrep {
  private entries = new Map<string, Prep>();
  private targets: Target[] = [];
  private room: RoomData | null = null;
  private key = '';
  private scheduled = false;
  private gapMs = SLICE_MS;
  private idle = 0;
  private lastStep = 0;
  /** Running cost estimate per kind of step (ms): start a room, bake a strip, a chunk, a live chunk. */
  private cost = [1, 4, 2, 2];
  private hasIdle = typeof (window as { requestIdleCallback?: unknown }).requestIdleCallback === 'function';
  /** Counters for the debug API and the browser checks. */
  stats = { slices: 0, steps: 0, worstSliceMs: 0, adopted: 0, built: 0, dropped: 0 };

  /** Point preparation at the rooms this room's doors lead to; release anything else. */
  enter(room: RoomData) {
    this.room = room;
    this.key = G.renderer.bakeKey;
    this.targets = [];
    if (!SKIP.has(room.id)) {
      for (const ex of room.exits) {
        const to = ROOMS[ex.to];
        if (!to || SKIP.has(ex.to) || ex.to === room.id) continue;
        this.targets.push({ id: ex.to, spawn: ex.spawn, x: (ex.x + ex.w / 2) * TILE, y: (ex.y + ex.h / 2) * TILE, cond: (ex as { cond?: string }).cond });
      }
    }
    for (const [id, p] of this.entries) {
      if (p.key !== this.key || !this.targets.some((t) => t.id === id)) this.release(id);
      else this.plan(p);
    }
  }

  /** The room being left keeps its finished art when its door is right behind the player. */
  keep(room: RoomData, layers: Layer[], cache: TileCache, grid: Grid, key: string) {
    if (SKIP.has(room.id) || key !== G.renderer.bakeKey || !layers.length) return false;
    this.release(room.id);
    this.entries.set(room.id, { room, key, marks: marksOf(room), grid, cache, steps: null, made: [], layers, queue: [] });
    return true;
  }

  /** Hand over a prepared room's art (the caller owns it from now on); a half-baked backdrop is finished here. */
  take(id: string): Prep | null {
    const p = this.entries.get(id);
    if (!p) return null;
    this.entries.delete(id);
    if (p.key !== G.renderer.bakeKey) {
      this.free(p);
      return null;
    }
    while (p.steps) {
      const s = p.steps.next();
      if (s.done) {
        p.layers = s.value;
        p.steps = null;
      }
    }
    p.made = [];
    return p.layers ? p : null;
  }

  /**
   * Move prepared chunks into the live cache once the room has finished loading, but
   * only if they were baked from the same tiles, props and resolution.
   */
  adoptChunks(p: Prep, cache: TileCache, grid: Grid) {
    const ok = p.cache.scale === cache.scale && sameGrid(p.grid, grid) && p.marks === marksOf(p.room);
    let n = 0;
    for (const [k, c] of p.cache.chunks) {
      if (ok && !cache.chunks.has(k)) {
        cache.chunks.set(k, c);
        n++;
      } else releaseCanvas(c);
    }
    p.cache.chunks.clear();
    this.stats.adopted += n;
    return n;
  }

  /** Drop every prepared room (resolution, quality or art style changed). */
  dropAll() {
    for (const id of [...this.entries.keys()]) this.release(id);
  }

  /**
   * Called once per drawn frame with the time left before the next one. Work runs right
   * after the frame when it leaves a gap (Safari has no idle callbacks), else when the
   * browser reports idle time; a device that never leaves a gap still gets one step a
   * second while nothing is fighting, so the door is ready by the time it is reached.
   */
  pump(heavy: boolean, spareMs: number) {
    const r = G.renderer;
    if (!this.room) return;
    if (r.bakeKey !== this.key) {
      this.dropAll();
      this.enter(this.room);
    }
    if (heavy || this.scheduled || G.world.transitioning || !this.hasWork()) return;
    const w = window as unknown as { requestIdleCallback: (cb: (d: IdleDeadline) => void, o: { timeout: number }) => number; cancelIdleCallback: (h: number) => void };
    if (spareMs >= 2) {
      // A gap after this frame beats waiting for the browser's idle report.
      if (this.idle) w.cancelIdleCallback(this.idle);
      this.idle = 0;
      this.scheduled = true;
      this.gapMs = Math.min(STEP_MAX_MS, spareMs - 1);
      setTimeout(this.slice, 0);
    } else if (this.hasIdle) {
      if (!this.idle) this.idle = w.requestIdleCallback(this.slice, { timeout: 1000 });
    } else if (performance.now() - this.lastStep > 1000) {
      this.scheduled = true;
      this.gapMs = SLICE_MS;
      setTimeout(this.slice, 0);
    }
  }

  /** What each prepared room holds (debug API and browser checks). */
  status() {
    const out: { id: string; key: string; layers: boolean; chunks: number; queue: number; px: number }[] = [];
    for (const [id, p] of this.entries) out.push({ id, key: p.key, layers: !!p.layers, chunks: p.cache.chunks.size, queue: p.queue.length, px: this.px(p) });
    return out;
  }

  private slice = (d?: IdleDeadline) => {
    if (d) this.idle = 0;
    else this.scheduled = false;
    if (G.world.transitioning || G.renderer.bakeKey !== this.key) return;
    const t0 = performance.now();
    const gap = d ? (d.didTimeout ? 0 : Math.min(STEP_MAX_MS, d.timeRemaining())) : this.gapMs;
    // Starved for a second: allow one step even if it overruns the gap.
    const force = t0 - this.lastStep > 1000;
    let n = 0;
    for (;;) {
      const left = n === 0 ? (force ? Infinity : gap) : Math.min(gap, SLICE_MS) - (performance.now() - t0);
      if (!this.step(left)) break;
      n++;
    }
    if (!n) return;
    const ms = performance.now() - t0;
    this.lastStep = performance.now();
    this.stats.slices++;
    this.stats.steps += n;
    if (ms > this.stats.worstSliceMs) this.stats.worstSliceMs = ms;
  };

  private budget() {
    // Canvas memory is capped on iOS: prepared rooms share a pixel budget beyond the live room.
    return G.renderer.tier === 2 ? 24e6 : 16e6;
  }

  private px(p: Prep) {
    let n = p.cache.chunks.size * p.cache.chunkPx();
    for (const l of p.layers ?? p.made) n += layerPx(l);
    return n;
  }

  private hasWork() {
    for (const t of this.targets) {
      if (t.cond && !flag(t.cond)) continue;
      const p = this.entries.get(t.id);
      if (!p || p.steps || !p.layers || p.queue.length) return true;
    }
    return this.nextLiveChunk() >= 0;
  }

  /**
   * One unit of work (start a room, bake one parallax strip, or one chunk) if its
   * estimated cost fits in maxMs; false when nothing fits or nothing is left.
   */
  private step(maxMs: number): boolean {
    const pl = G.world.player;
    let best: Target | null = null, bestD = Infinity;
    let used = 0;
    for (const p of this.entries.values()) used += this.px(p);
    for (const t of this.targets) {
      if (t.cond && !flag(t.cond)) continue;
      const p = this.entries.get(t.id);
      if (p && p.layers && !p.queue.length) continue;
      const dx = t.x - pl.x, dy = t.y - pl.y, dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = t; }
    }
    if (best && used < this.budget()) {
      const p = this.entries.get(best.id);
      const kind = !p ? 0 : p.steps ? 1 : 2;
      if (this.cost[kind] > maxMs) return false;
      const t0 = performance.now();
      if (!p) this.start(ROOMS[best.id]);
      else if (p.steps) {
        const s = p.steps.next();
        if (s.done) {
          p.layers = s.value;
          p.steps = null;
          p.made = [];
          this.stats.built++;
        } else p.made.push(s.value);
      } else {
        if (p.marks !== marksOf(p.room)) {
          // A prop's flag flipped while baking: start the chunks over.
          p.cache.dispose();
          p.marks = marksOf(p.room);
          this.plan(p);
        }
        const k = p.queue.shift();
        if (k !== undefined) p.cache.get(k % 4096, Math.floor(k / 4096));
      }
      this.learn(kind, performance.now() - t0);
      return true;
    }
    // Neighbours done: bake the live room's chunks just outside the view before the camera needs them.
    const k = this.nextLiveChunk();
    if (k < 0 || this.cost[3] > maxMs) return false;
    const t0 = performance.now();
    G.world.cache?.get(k % 4096, Math.floor(k / 4096));
    this.learn(3, performance.now() - t0);
    return true;
  }

  /** Estimates lean towards the slow side, so a slice rarely overruns its gap. */
  private learn(kind: number, ms: number) {
    const c = this.cost[kind];
    this.cost[kind] = ms > c ? c * 0.5 + ms * 0.5 : c * 0.9 + ms * 0.1;
  }

  private nextLiveChunk() {
    const c = G.world.cache;
    if (!c) return -1;
    const cam = G.camera, hw = cam.halfW, hh = cam.halfH, CH = TileCache.CH;
    const x0 = Math.max(0, Math.floor((cam.x - hw) / CH) - 1), x1 = Math.min(c.cols - 1, Math.floor((cam.x + hw) / CH) + 1);
    const y0 = Math.max(0, Math.floor((cam.y - hh) / CH) - 1), y1 = Math.min(c.rows - 1, Math.floor((cam.y + hh) / CH) + 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (!c.has(cx, cy)) return TileCache.key(cx, cy);
    return -1;
  }

  private start(room: RoomData) {
    const grid = roomGrid(room);
    const cache = new TileCache(grid, room.biome, room.interior, room.seed, room.ents, (t) => t !== T.Gate && isSolid(t), cond);
    cache.scale = chunkScale();
    const p: Prep = {
      room, key: this.key, marks: marksOf(room), grid, cache,
      steps: parallaxSteps(room.biome, room.seed, room.interior, G.renderer.viewH * 1.35, parallaxRes()),
      made: [], layers: null, queue: [],
    };
    this.entries.set(room.id, p);
    this.plan(p);
    return p;
  }

  /** Which chunks each arrival into this room will show first; release the rest. */
  private plan(p: Prep) {
    const r = G.renderer, room = p.room, CH = TileCache.CH;
    const rw = p.grid.w * TILE, rh = p.grid.h * TILE;
    const fit = Math.max(1, r.viewW / rw, r.viewH / rh);
    const hw = r.viewW / (2 * fit), hh = r.viewH / (2 * fit);
    const want = new Map<number, number>();
    for (const t of this.targets) {
      if (t.id !== room.id) continue;
      const sp = room.spawns[t.spawn] ?? Object.values(room.spawns)[0];
      if (!sp) continue;
      // Where load() snaps the camera, clamped like Camera.clampToBounds.
      let cx = sp.x * TILE + (sp.face ?? 1) * 30, cy = sp.y * TILE - 40;
      cx = rw <= hw * 2 ? rw / 2 : Math.min(Math.max(cx, hw), rw - hw);
      cy = rh <= hh * 2 ? rh - hh : Math.min(Math.max(cy, hh), rh - hh);
      const x0 = Math.max(0, Math.floor((cx - hw - MARGIN) / CH)), x1 = Math.min(p.cache.cols - 1, Math.floor((cx + hw + MARGIN) / CH));
      const y0 = Math.max(0, Math.floor((cy - hh - MARGIN) / CH)), y1 = Math.min(p.cache.rows - 1, Math.floor((cy + hh + MARGIN) / CH));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5) * CH - cx, dy = (y + 0.5) * CH - cy, d = dx * dx + dy * dy;
          const k = TileCache.key(x, y);
          want.set(k, Math.min(want.get(k) ?? Infinity, d));
        }
    }
    for (const [k, c] of p.cache.chunks) if (!want.has(k)) {
      releaseCanvas(c);
      p.cache.chunks.delete(k);
    }
    p.queue = [...want.keys()].filter((k) => !p.cache.chunks.has(k)).sort((a, b) => want.get(a)! - want.get(b)!);
  }

  private free(p: Prep) {
    p.cache.dispose();
    for (const l of p.layers ?? []) releaseCanvas(l.c);
    for (const l of p.made) releaseCanvas(l.c);
    p.made = [];
    p.layers = null;
    p.steps = null;
  }

  private release(id: string) {
    const p = this.entries.get(id);
    if (!p) return;
    this.entries.delete(id);
    this.free(p);
    this.stats.dropped++;
  }
}
