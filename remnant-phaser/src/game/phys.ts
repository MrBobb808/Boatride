// The game's own physics, in WebAssembly (physics/remnant_phys.c, built by scripts/build-phys.mjs into physWasm.ts).
//
// It holds two tile grids in its memory, and the game's grid arrays become views into them, so a broken wall or a
// closed gate is seen at once with nothing copied:
// - grid 0, the classic world's: every shared foe, Echo, prop and classic boss moves through it, as the backend of
//   remnant/src/game/physics.ts (moveBody, bodyFits, los), reproducing the JS exactly;
// - grid 1, the Phaser World's: the hero and the Arcade-bodied bosses step through it after Arcade has moved them
//   (`stepBody`, from World's WORLD_STEP), in place of Arcade's tilemap collider.
// Until it has loaded, or if WebAssembly is missing, the JS rules and Arcade's collider run as before.
import type Phaser from 'phaser';
import { PHYS_WASM, PHYS_SOURCE } from './physWasm';
import { setPhysicsBackend, moveBodyJS, bodyFitsJS, losJS, type Body, type SolidFn, type PhysicsBackend } from '../../../remnant/src/game/physics';
import { isSolid, type Grid } from '../../../remnant/src/game/tiles';

interface Core {
  memory: WebAssembly.Memory;
  grid(k: number): number;
  io(): number;
  max_cells(): number;
  set_dims(k: number, w: number, h: number): number;
  move_body(k: number, mask: number, dt: number, collide: number): void;
  body_fits(k: number, mask: number, w: number, h: number, x: number, y: number): number;
  los(k: number, mask: number, x0: number, y0: number, x1: number, y1: number, n: number): number;
  step_body(k: number, mask: number): number;
}

/** Tile kinds the masks cover (T.Empty … T.Gate). */
const KINDS = 12;
const IO = { x: 0, y: 1, vx: 2, vy: 3, w: 4, h: 5, drop: 6, ground: 7, wall: 8, ceil: 9, tile: 10 } as const;

/** A tile predicate as a bitmask over the tile kinds, worked out each call: the classic world's `solid` reads the
 * gate's state, so a mask kept from before could be stale. */
function maskOf(fn: SolidFn) {
  let m = 0;
  for (let t = 0; t < KINDS; t++) if (fn(t)) m |= 1 << t;
  return m;
}

class Phys implements PhysicsBackend {
  private core: Core | null = null;
  private io = new Float64Array(16);
  /** The classic grid in grid 0, and how to find the one in play (set by World). */
  private classic: Grid | null = null;
  activeGrid: () => Grid | null = () => null;
  /** The World's grid array held in grid 1. */
  private heroView: Uint8Array | null = null;
  private heroMask = maskOf(isSolid);
  readonly source = PHYS_SOURCE;
  /** 'wasm' once loaded; 'js' before, or for good if it would not load (`error` says why). */
  backend: 'wasm' | 'js' = 'js';
  error = '';
  /** Calls taken since the last reset, for the checks and the frame meter. */
  readonly stats = { moves: 0, steps: 0, eased: 0, fits: 0, los: 0, passed: 0 };
  readonly ready: Promise<boolean>;

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    try {
      if (typeof WebAssembly === 'undefined') throw Error('no WebAssembly');
      const bin = Uint8Array.from(atob(PHYS_WASM), (c) => c.charCodeAt(0));
      const { instance } = await WebAssembly.instantiate(bin);
      const core = instance.exports as unknown as Core;
      this.core = core;
      this.io = new Float64Array(core.memory.buffer, core.io(), 16);
      this.backend = 'wasm';
      setPhysicsBackend(this);
      return true;
    } catch (e) {
      this.error = String((e as Error)?.message ?? e);
      return false;
    }
  }

  /** Hand grid 0 to `g`, the classic world's grid in play; the grid it held before gets its own copy back. */
  private bindClassic(g: Grid) {
    const c = this.core!;
    if (g.w * g.h > c.max_cells() || !c.set_dims(0, g.w, g.h)) return false;
    if (this.classic && this.classic !== g && this.classic.t.buffer === c.memory.buffer) this.classic.t = this.classic.t.slice();
    const view = new Uint8Array(c.memory.buffer, c.grid(0), g.w * g.h);
    view.set(g.t);
    g.t = view;
    this.classic = g;
    return true;
  }

  /** Grid 0 for a call on `g`: the grid already held, or the classic world's in play (bound now); else none. */
  private holds(g: Grid) {
    if (!this.core) return false;
    if (g === this.classic) return true;
    return g === this.activeGrid() && this.bindClassic(g);
  }

  /**
   * The World's grid for the hero's steps: returns the view into grid 1 that the World keeps as its grid, or the
   * array as it was when WebAssembly is not in use (or the room is too large for it).
   */
  bindHero(arr: Uint8Array<ArrayBuffer>, w: number, h: number): Uint8Array<ArrayBuffer> {
    const c = this.core;
    if (!c || w * h > c.max_cells() || !c.set_dims(1, w, h)) { this.heroView = null; return arr; }
    const view = new Uint8Array(c.memory.buffer as ArrayBuffer, c.grid(1), w * h);
    view.set(arr.subarray(0, w * h));
    return (this.heroView = view);
  }

  /** True while the World's grid is held, so Arcade bodies step here rather than through Arcade's collider. */
  get stepping() { return !!this.heroView; }

  // ---------------------------------------------------------------- the shared rules (physics.ts's backend)

  moveBody(b: Body, dt: number, g: Grid, solid: SolidFn, collide: boolean) {
    if (!this.holds(g) || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy)) { this.stats.passed++; return false; }
    const io = this.io;
    io[IO.x] = b.x; io[IO.y] = b.y; io[IO.vx] = b.vx; io[IO.vy] = b.vy; io[IO.w] = b.w; io[IO.h] = b.h; io[IO.drop] = b.dropT; io[IO.tile] = b.groundTile;
    this.core!.move_body(0, maskOf(solid), dt, collide ? 1 : 0);
    b.x = io[IO.x]; b.y = io[IO.y]; b.vx = io[IO.vx]; b.vy = io[IO.vy]; b.dropT = io[IO.drop];
    b.onGround = io[IO.ground] !== 0; b.wallDir = io[IO.wall]; b.hitCeil = io[IO.ceil] !== 0; b.groundTile = io[IO.tile];
    this.stats.moves++;
    return true;
  }

  bodyFits(b: Pick<Body, 'w' | 'h'>, g: Grid, blocked: SolidFn, x: number, y: number) {
    if (!this.holds(g)) return undefined;
    this.stats.fits++;
    return this.core!.body_fits(0, maskOf(blocked), b.w, b.h, x, y) !== 0;
  }

  los(g: Grid, solid: SolidFn, x0: number, y0: number, x1: number, y1: number) {
    if (!this.holds(g) || ![x0, y0, x1, y1].every(Number.isFinite)) return undefined;
    this.stats.los++;
    return this.core!.los(0, maskOf(solid), x0, y0, x1, y1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8)) !== 0;
  }

  // ---------------------------------------------------------------- Arcade bodies

  /**
   * After Arcade has moved a body this step, take the same step again through the grid: from where it stood
   * (`prev`) by what Arcade moved it, across then up or down, stopping at walls, floors and ceilings and on one-way
   * platforms from above (not while `dropping`). Sets `blocked` and stops the velocity into what it met, as Arcade's
   * own tile collision did.
   */
  stepBody(b: Phaser.Physics.Arcade.Body, dropping: boolean) {
    const c = this.core, io = this.io;
    if (!c || !this.heroView || !b.enable) return;
    const w = b.width, h = b.height;
    io[IO.x] = b.prev.x + w / 2; io[IO.y] = b.prev.y + h;
    io[IO.vx] = b.position.x - b.prev.x; io[IO.vy] = b.position.y - b.prev.y;
    io[IO.w] = w; io[IO.h] = h; io[IO.drop] = dropping ? 1 : 0;
    if (!Number.isFinite(io[IO.x]) || !Number.isFinite(io[IO.y]) || !Number.isFinite(io[IO.vx]) || !Number.isFinite(io[IO.vy])) return;
    if (c.step_body(1, this.heroMask)) this.stats.eased++;
    this.stats.steps++;
    b.position.x = io[IO.x] - w / 2; b.position.y = io[IO.y] - h;
    const bl = b.blocked, v = b.velocity;
    if (io[IO.wall] > 0) { bl.right = true; bl.none = false; if (v.x > 0) v.x = 0; }
    else if (io[IO.wall] < 0) { bl.left = true; bl.none = false; if (v.x < 0) v.x = 0; }
    if (io[IO.ground]) { bl.down = true; bl.none = false; if (v.y > 0) v.y = 0; }
    if (io[IO.ceil]) { bl.up = true; bl.none = false; if (v.y < 0) v.y = 0; }
    b.updateCenter();
  }

  // ---------------------------------------------------------------- the checks

  /**
   * Run `n` random moves, fits and sightlines on random rooms through both the WebAssembly and the JS rules and
   * count where they differ (they never should). Uses grid 0 and leaves the classic grid it held its own copy.
   */
  parity(n = 20000, seed = 7) {
    const c = this.core;
    if (!c) return { ok: false, error: this.error || 'not loaded' };
    if (this.classic && this.classic.t.buffer === c.memory.buffer) this.classic.t = this.classic.t.slice();
    this.classic = null;
    const active = this.activeGrid;
    let s = seed >>> 0;
    const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const solidOf = (gate: boolean): SolidFn => (t) => (t === 11 ? gate : isSolid(t));
    let moves = 0, fits = 0, sights = 0, bad = 0;
    const first: string[] = [];
    while (moves < n) {
      const w = 8 + Math.floor(R() * 70), h = 6 + Math.floor(R() * 36);
      const t = new Uint8Array(w * h);
      const g = { w, h, t, get(x: number, y: number) { if (x < 0 || x >= w) return 1; if (y < 0) return 0; if (y >= h) return 1; return g.t[y * w + x]; }, set() {} } as unknown as Grid;
      for (let i = 0; i < w * h; i++) { const r = R(); t[i] = r < 0.6 ? 0 : r < 0.74 ? 1 : r < 0.82 ? 4 : r < 0.86 ? 11 : r < 0.9 ? 5 : r < 0.95 ? 2 : 8; }
      this.activeGrid = () => g;
      const solid = solidOf(R() < 0.5);
      for (let i = 0; i < 400; i++, moves++) {
        const b: Body = { x: R() * w * 16, y: R() * h * 16, vx: (R() - 0.5) * (R() < 0.1 ? 4000 : 600), vy: (R() - 0.5) * (R() < 0.1 ? 4000 : 900), w: 6 + R() * 30, h: 8 + R() * 50, onGround: false, wallDir: 0, hitCeil: false, dropT: R() < 0.3 ? R() * 0.3 : 0, groundTile: 0 };
        if (R() < 0.3) b.y = Math.round(b.y / 16) * 16 + (R() < 0.5 ? 0 : R() - 0.5);
        if (R() < 0.2) b.vy = 0;
        if (R() < 0.2) b.vx = 0;
        const dt = R() < 0.5 ? 1 / 120 : R() * 0.05, collide = R() > 0.05;
        const a = { ...b };
        this.moveBody(b, dt, g, solid, collide);
        moveBodyJS(a, dt, g, solid, collide);
        const keys = ['x', 'y', 'vx', 'vy', 'dropT', 'onGround', 'wallDir', 'hitCeil', 'groundTile'] as const;
        if (keys.some((k) => a[k] !== b[k])) { bad++; if (first.length < 3) first.push(JSON.stringify({ wasm: b, js: a })); }
        const fx = R() * w * 16, fy = R() * h * 16;
        if (this.bodyFits(b, g, solid, fx, fy) !== bodyFitsJS(b, g, solid, fx, fy)) { bad++; if (first.length < 3) first.push(`fits ${fx},${fy}`); }
        fits++;
        const x1 = R() * w * 16, y1 = R() * h * 16;
        if (this.los(g, solid, fx, fy, x1, y1) !== losJS(g, solid, fx, fy, x1, y1)) { bad++; if (first.length < 3) first.push(`los ${fx},${fy} ${x1},${y1}`); }
        sights++;
      }
    }
    this.activeGrid = active;
    this.classic = null;
    return { ok: bad === 0, moves, fits, sights, bad, first };
  }

  resetStats() { for (const k of Object.keys(this.stats) as (keyof Phys['stats'])[]) this.stats[k] = 0; }
}

export const phys = new Phys();
