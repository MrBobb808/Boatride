import { settings, isTouchDevice } from '../core/settings';
import { clamp, damp, lerp } from '../core/math';
import { setPixelArt } from './pixelHero';

/**
 * Owns the canvas and the mapping from world units to backing pixels.
 * The world is authored in units where one tile = 16. The view shows a fixed
 * number of world units vertically; width follows the screen's aspect, so an
 * iPhone in landscape (≈2.17:1) simply sees more of the room sideways.
 */
export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  /** Backing pixels per CSS pixel. */
  px = 1;
  /** The canvas's backing size. */
  cw = 0;
  ch = 0;
  /** The world target's size: the canvas, or in pixel-art mode a small canvas scaled up by k. */
  bw = 0;
  bh = 0;
  pixel = false;
  k = 1;
  world: HTMLCanvasElement;
  wctx: CanvasRenderingContext2D;
  /** Backing pixels per world unit. */
  scale = 1;
  viewW = 0;
  viewH = 300;
  baseViewH = 300;
  /** 0 = low, 1 = medium, 2 = high. */
  tier = 2;
  autoPenalty = 0;
  generation = 0;
  private resizeCbs: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.world = canvas;
    this.wctx = ctx;
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();
  }

  onResize(cb: () => void) {
    this.resizeCbs.push(cb);
  }

  qualityTier() {
    if (settings.quality === 'high') return 2;
    if (settings.quality === 'medium') return 1;
    if (settings.quality === 'low') return 0;
    return clamp(2 - this.autoPenalty, 0, 2);
  }

  resize() {
    const w = Math.max(1, Math.round(window.innerWidth));
    const h = Math.max(1, Math.round(window.innerHeight));
    this.cssW = w;
    this.cssH = h;
    this.dpr = window.devicePixelRatio || 1;
    this.tier = this.qualityTier();
    // Keep crisp world pixels; reduce high-density HUD fill when the frame budget tightens.
    const cap = settings.artStyle !== 'smooth' ? [1.5, 2, 3][this.tier] : this.tier === 2 ? 2 : this.tier === 1 ? 1.5 : 1;
    this.px = Math.min(this.dpr, cap);
    // Very large desktop windows don't need more than ~1440 backing rows.
    if (h * this.px > 1440) this.px = 1440 / h;
    this.cw = Math.round(w * this.px);
    this.ch = Math.round(h * this.px);
    if (this.canvas.width !== this.cw || this.canvas.height !== this.ch) {
      this.canvas.width = this.cw;
      this.canvas.height = this.ch;
    }
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // If the canvas ends up smaller than the screen (very dense or very tall displays),
    // let the browser enlarge it hard-edged in pixel art rather than blur it.
    this.canvas.style.imageRendering = settings.artStyle !== 'smooth' ? 'pixelated' : 'auto';
    const phone = isTouchDevice() && Math.min(w, h) < 600;
    let vh = phone ? 268 : 300;
    if (settings.zoom === 'close') vh *= 0.88;
    if (settings.zoom === 'wide') vh *= 1.14;
    this.pixel = settings.artStyle !== 'smooth';
    setPixelArt(this.pixel);
    if (this.pixel) {
      // One world unit is one art pixel. A whole number of screen pixels per art pixel
      // keeps them all the same size; take it when it moves the view by little.
      const kn = Math.max(1, Math.round(this.ch / vh));
      this.k = Math.abs(this.ch / kn - vh) / vh <= 0.05 ? kn : this.ch / Math.round(vh);
      this.bh = Math.round(this.ch / this.k);
      this.bw = Math.ceil(this.cw / this.k);
      vh = this.bh;
      if (this.world === this.canvas) {
        this.world = document.createElement('canvas');
        this.wctx = this.world.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
      }
      if (this.world.width !== this.bw || this.world.height !== this.bh) {
        this.world.width = this.bw;
        this.world.height = this.bh;
      }
    } else {
      this.k = 1;
      this.bw = this.cw;
      this.bh = this.ch;
      if (this.world !== this.canvas) {
        this.world.width = this.world.height = 1;
        this.world = this.canvas;
        this.wctx = this.ctx;
      }
    }
    this.baseViewH = vh;
    this.applyView(vh);
    this.generation++;
    for (const cb of this.resizeCbs) cb();
  }

  /** Scale the pixel-art world up onto the screen, hard-edged. */
  present() {
    if (!this.pixel) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'copy';
    c.imageSmoothingEnabled = false;
    c.drawImage(this.world, 0, 0, this.bw * this.k, this.bh * this.k);
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = 'source-over';
  }

  applyView(vh: number) {
    this.viewH = vh;
    this.scale = this.bh / vh;
    this.viewW = this.bw / this.scale;
  }
}

// Camera feel. Distances are world units (one tile = 16); times are seconds.
// Every rate goes through dt, so 60 Hz and 120 Hz frame the same.
/** Run speed the look-ahead is measured against (the player's RUN). */
const LOOK_RUN = 142;
/** Lead kept toward the last committed running direction while standing. */
const LOOK_IDLE = 14;
/** Full lead after running one way for LOOK_RAMP seconds. */
const LOOK_MAX = 66;
const LOOK_RAMP = 0.7;
/** How long the lead takes to relax back to LOOK_IDLE once you stop. */
const LOOK_RELAX = 1.1;
/** A turn must last this long before the lead swings; tap-turns and lunges don't. */
const LOOK_COMMIT = 0.3;
/** Spring time for the lead itself, so it eases in and out. */
const LOOK_SMOOTH = 0.45;
/** Horizontal chase of the player plus lead. */
const FOLLOW_X_RATE = 7;
/** The camera sits this far above the player's feet. */
const FRAME_Y = 18;
/** Airborne dead zone around the last footing: a single jump (≈62) stays inside. */
const DZ_UP = 70;
const DZ_DOWN = 22;
/** Vertical spring times: settling on a new height, and catching a fast fall. */
const Y_SMOOTH = 0.3;
const Y_SMOOTH_FALL = 0.09;
const FALL_FAST = 330;
/** The player's feet and head never come closer than this to the frame's edge. */
const Y_MARGIN = 34;
const HERO_H = 46;
/** Spring time for viewMult (boss and cutscene framing): eases both ways. */
const VIEW_SMOOTH = 0.38;

let sdV = 0;
/**
 * Critically damped spring toward target (Game Programming Gems 4): starts and
 * stops gently and is stable at any dt. The new velocity is left in sdV so
 * per-frame calls allocate nothing.
 */
function smoothDamp(cur: number, target: number, vel: number, time: number, dt: number) {
  const w = 2 / time, x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel + w * ch) * dt;
  sdV = (vel - w * tmp) * e;
  return target + (ch + tmp) * e;
}

/** Smooth-follow camera with look-ahead, trauma shake and zoom punches. */
export class Camera {
  x = 0;
  y = 0;
  /** Extra zoom (1 = none). >1 zooms in. */
  zoom = 1;
  zoomTarget = 1;
  punch = 0;
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  lookX = 0;
  bounds = { x: 0, y: 0, w: 1000, h: 1000 };
  focus: { x: number; y: number } | null = null;
  focusRate = 3;
  private t = 0;
  viewMult = 1;
  viewMultTarget = 1;
  private viewVel = 0;
  private lookVel = 0;
  /** Committed running direction, how long a turn has lasted, and the lead's 0..1 ramp. */
  private runDir = 1;
  private turnT = 0;
  private lookAmt = 0;
  /** The footing height the camera frames; NaN until the first update after a snap. */
  private baseY = NaN;
  private yVel = 0;

  constructor(private r: Renderer) {}

  /** Extra zoom so the view never extends past a small room's edges. */
  get fit() {
    const vw = this.r.viewW * this.viewMult, vh = this.r.viewH * this.viewMult;
    return Math.max(1, vw / Math.max(1, this.bounds.w), vh / Math.max(1, this.bounds.h));
  }
  get halfW() {
    return (this.r.viewW * this.viewMult) / (2 * this.zoom * (1 + this.punch) * this.fit);
  }
  get halfH() {
    return (this.r.viewH * this.viewMult) / (2 * this.zoom * (1 + this.punch) * this.fit);
  }

  /** Instant: room loads and respawns. Framing state restarts from here. */
  snapTo(x: number, y: number) {
    this.viewMult = this.viewMultTarget;
    this.viewVel = this.lookVel = this.yVel = 0;
    this.turnT = this.lookAmt = 0;
    this.baseY = NaN;
    this.x = x;
    this.y = y;
    this.clampToBounds();
  }

  addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  update(dt: number, tx: number, ty: number, face: number, vx: number, shake: number, vy = 0, grounded = true) {
    this.t += dt;
    if (dt <= 0) return;
    this.viewMult = smoothDamp(this.viewMult, this.viewMultTarget, this.viewVel, VIEW_SMOOTH, dt);
    this.viewVel = sdV;
    this.zoom = lerp(this.zoom, this.zoomTarget, damp(4, dt));
    this.punch = lerp(this.punch, 0, damp(9, dt));
    if (this.baseY !== this.baseY) {
      // First frame after a snap: keep the snapped framing and lead from here.
      this.baseY = ty;
      this.runDir = face || 1;
      this.lookX = clamp(this.x - tx, -LOOK_MAX, LOOK_MAX);
    }
    // Footing: follow on the ground; in the air hold it until the dead zone is left.
    if (grounded) this.baseY = ty;
    else if (ty < this.baseY - DZ_UP) this.baseY = ty + DZ_UP;
    else if (ty > this.baseY + DZ_DOWN) this.baseY = ty - DZ_DOWN;
    if (this.focus) {
      tx = this.focus.x;
      ty = this.focus.y;
      this.x = lerp(this.x, tx, damp(this.focusRate, dt));
      this.y = lerp(this.y, ty, damp(this.focusRate, dt));
      this.yVel = 0;
    } else {
      // Look-ahead grows with sustained running, not with facing or a brief tap.
      const dir = Math.abs(vx) > LOOK_RUN * 0.4 ? (vx > 0 ? 1 : -1) : 0;
      if (dir !== 0 && dir !== this.runDir) {
        this.turnT += dt;
        if (this.turnT >= LOOK_COMMIT) {
          this.runDir = dir;
          this.turnT = 0;
          this.lookAmt = 0;
        }
      } else this.turnT = Math.max(0, this.turnT - dt);
      if (dir === this.runDir) this.lookAmt = Math.min(1, this.lookAmt + (dt / LOOK_RAMP) * Math.min(1, Math.abs(vx) / LOOK_RUN));
      else if (dir === 0) this.lookAmt = Math.max(0, this.lookAmt - dt / LOOK_RELAX);
      const a = this.lookAmt * this.lookAmt * (3 - 2 * this.lookAmt);
      const lookTarget = this.runDir * (LOOK_IDLE + (LOOK_MAX - LOOK_IDLE) * a);
      this.lookX = smoothDamp(this.lookX, lookTarget, this.lookVel, LOOK_SMOOTH, dt);
      this.lookVel = sdV;
      this.x = lerp(this.x, tx + this.lookX, damp(FOLLOW_X_RATE, dt));
      this.y = smoothDamp(this.y, this.baseY - FRAME_Y, this.yVel, vy > FALL_FAST ? Y_SMOOTH_FALL : Y_SMOOTH, dt);
      this.yVel = sdV;
      // Hard limit so a long fall or launch never leaves the frame.
      const hh = this.halfH;
      const lo = ty - hh + Y_MARGIN, hi = ty - HERO_H + hh - Y_MARGIN;
      if (lo <= hi) {
        if (this.y < lo) { this.y = lo; if (this.yVel < 0) this.yVel = 0; }
        else if (this.y > hi) { this.y = hi; if (this.yVel > 0) this.yVel = 0; }
      }
    }
    const py = this.y;
    this.clampToBounds();
    // Pressed against a room edge: don't bank speed that would overshoot on the way back.
    if (py !== this.y) this.yVel = 0;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * shake;
    this.shakeX = s * 9 * (Math.sin(this.t * 61.3) * 0.6 + Math.sin(this.t * 27.1) * 0.4);
    this.shakeY = s * 7 * (Math.sin(this.t * 53.7 + 1.3) * 0.6 + Math.sin(this.t * 31.9) * 0.4);
  }

  clampToBounds() {
    const b = this.bounds, hw = this.halfW, hh = this.halfH;
    if (b.w <= hw * 2) this.x = b.x + b.w / 2;
    else this.x = clamp(this.x, b.x + hw, b.x + b.w - hw);
    if (b.h <= hh * 2) this.y = b.y + b.h - hh;
    else this.y = clamp(this.y, b.y + hh, b.y + b.h - hh);
  }

  /** World-space rectangle currently visible. */
  view() {
    const hw = this.halfW, hh = this.halfH;
    return { x: this.x - hw + this.shakeX, y: this.y - hh + this.shakeY, w: hw * 2, h: hh * 2 };
  }

  /** Pixel scale (backing px per world unit) including zoom. */
  get s() {
    return (this.r.scale * this.zoom * (1 + this.punch) * this.fit) / this.viewMult;
  }

  apply(ctx: CanvasRenderingContext2D) {
    const s = this.s;
    const v = this.view();
    const ox = Math.round(-v.x * s);
    const oy = Math.round(-v.y * s);
    ctx.setTransform(s, 0, 0, s, ox, oy);
  }

  worldToScreen(wx: number, wy: number) {
    const v = this.view();
    const s = this.s;
    return { x: (wx - v.x) * s, y: (wy - v.y) * s };
  }
}
