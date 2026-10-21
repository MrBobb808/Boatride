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

  snapTo(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.clampToBounds();
  }

  addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  update(dt: number, tx: number, ty: number, face: number, vx: number, shake: number) {
    this.t += dt;
    this.viewMult = lerp(this.viewMult, this.viewMultTarget, damp(2.5, dt));
    this.zoom = lerp(this.zoom, this.zoomTarget, damp(4, dt));
    this.punch = lerp(this.punch, 0, damp(9, dt));
    if (this.focus) {
      tx = this.focus.x;
      ty = this.focus.y;
      this.x = lerp(this.x, tx, damp(this.focusRate, dt));
      this.y = lerp(this.y, ty, damp(this.focusRate, dt));
    } else {
      const lookTarget = face * 34 + vx * 0.12;
      this.lookX = lerp(this.lookX, lookTarget, damp(2.2, dt));
      const gx = tx + this.lookX;
      const gy = ty - 18;
      this.x = lerp(this.x, gx, damp(7, dt));
      // Vertical follow is gentler so jumps don't yank the frame.
      const dy = gy - this.y;
      const rate = Math.abs(dy) > 60 ? 9 : 4.5;
      this.y = lerp(this.y, gy, damp(rate, dt));
    }
    this.clampToBounds();
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
