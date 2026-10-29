// The classic effects' geometric primitives (rings, beams, streaks and arcs,
// about 240 calls across abilities, finishers, bosses and Echoes) drawn as
// animated art in the Phaser build: a ring is the art drop's spark ring
// (V02), a column its pillar of light (V03), a slash its arc (V01), and a
// streak a tapered trail of light. Each takes the colour and size the call
// asks for, from a fixed pool, stepped with the fight's clock.
import Phaser from 'phaser';
import { fx } from '../../../remnant/src/render/fx';
import { settings } from '../classic/shim/settings';

type Kind = 'ring' | 'column' | 'streak' | 'slash';
interface Piece {
  img: Phaser.GameObjects.Image; kind: Kind; t: number; max: number;
  x: number; y: number; r0: number; r1: number; flat: number; base: number; frames: number; sx: number; sy: number;
}
const POOL = 40;
/** A foe as the status overlays read it: the classic entity's body (centre x, feet y) and its timers. */
interface Afflicted { isFoe: boolean; dying: boolean; remove: boolean; burn: number; chill: number; bleed: number; id: number; body: { x: number; y: number; w: number; h: number } }
/** Rows of V07 for the statuses foes carry: burning, frozen, bleeding. */
const STATUS = [['burn', 0], ['chill', 1], ['bleed', 3]] as const;

/** Colour from a CSS hex (#rgb, #rrggbb or #rrggbbaa); white if unreadable. */
function hex(c: string) {
  if (!c || c[0] !== '#') return 0xffffff;
  const h = c.length === 4 ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(1, 7);
  const v = parseInt(h, 16);
  return Number.isFinite(v) ? v : 0xffffff;
}
const light = (v: number) => ((v >> 16 & 255) * 0.3 + (v >> 8 & 255) * 0.59 + (v & 255) * 0.11) / 255;

export class ArtFx {
  private pieces: Piece[];
  private overlays: Phaser.GameObjects.Image[] = [];

  constructor(private sc: Phaser.Scene) {
    if (!sc.textures.exists('fx-streak')) {
      // A tapered trail of light with a few bright pixels, baked once.
      const t = sc.textures.createCanvas('fx-streak', 64, 8)!, c = t.getContext();
      for (let x = 0; x < 64; x++) {
        const k = x / 63, a = k * k;
        c.fillStyle = `rgba(255,255,255,${(a * 0.55).toFixed(3)})`; c.fillRect(x, 2, 1, 4);
        c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; c.fillRect(x, 3, 1, 2);
        if (x % 9 === 4) { c.fillStyle = `rgba(255,255,255,${(a * 0.8).toFixed(3)})`; c.fillRect(x, x % 2 ? 1 : 6, 1, 1); }
      }
      t.refresh();
    }
    this.pieces = Array.from({ length: POOL }, () => ({
      img: sc.add.image(0, 0, 'vfx-impacts', 0).setDepth(15.1).setVisible(false),
      kind: 'ring' as Kind, t: -1, max: 1, x: 0, y: 0, r0: 0, r1: 0, flat: 1, base: 0, frames: 1, sx: 1, sy: 1,
    }));
    // Route the classic primitives here; the classic canvas never draws them in this build.
    fx.ring = (x, y, r0, r1, c, life = 0.4, _w = 3, flat = 1) => this.ring(x, y, r0, r1, c, life, flat);
    fx.column = (x, y, w, h, c, life = 0.8) => this.column(x, y, w, h, c, life);
    fx.streak = (x0, y0, x1, y1, c = '#ffe6a8', life = 0.22, w = 3) => this.streak(x0, y0, x1, y1, c, life, w);
    fx.slash = (x, y, r, a0, a1, _w, face, _c = '#fff1c4', c2 = '#ffb347', life = 0.16, tilt = 0) => this.slash(x, y, r, a0, a1, face, c2, life, tilt);
  }

  private take(kind: Kind, key: string, base: number, frames: number, color: string, life: number) {
    const p = this.pieces.find((o) => o.t < 0) ?? this.pieces.reduce((a, o) => (o.t / o.max > a.t / a.max ? o : a));
    const tint = hex(color), dark = light(tint) < 0.32;
    p.kind = kind; p.t = 0; p.max = Math.max(0.05, life); p.base = base; p.frames = frames;
    // Dark colours (shadow and blood) darken the scene; bright ones add light.
    p.img.setTexture(key, base).setTint(dark ? tint : tint | 0x101010).setBlendMode(dark ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setAlpha(settings.reduceFlashes ? 0.6 : 1).setRotation(0).setFlip(false, false).setVisible(true);
    return p;
  }

  ring(x: number, y: number, r0: number, r1: number, c: string, life: number, flat: number) {
    const p = this.take('ring', 'vfx-impacts', 18, 6, c, life);
    p.x = x; p.y = y; p.r0 = r0; p.r1 = r1; p.flat = flat;
    p.img.setOrigin(0.5).setPosition(x, y);
    this.stepPiece(p, 0);
  }

  column(x: number, y: number, w: number, h: number, c: string, life: number) {
    const p = this.take('column', 'vfx-abilities-1', 40, 8, c, life);
    // The pillar art stands about 110 px tall and 50 wide in its cell.
    p.sx = Math.max(0.35, w / 50); p.sy = Math.max(0.3, h / 110);
    p.img.setOrigin(0.5, 0.92).setPosition(x, y).setScale(p.sx, p.sy);
    this.stepPiece(p, 0);
  }

  streak(x0: number, y0: number, x1: number, y1: number, c: string, life: number, w: number) {
    const p = this.take('streak', 'fx-streak', 0, 1, c, life);
    const len = Math.hypot(x1 - x0, y1 - y0);
    p.sx = Math.max(0.2, len / 64); p.sy = Math.max(0.6, w / 2.5);
    p.img.setOrigin(1, 0.5).setPosition(x1, y1).setRotation(Math.atan2(y1 - y0, x1 - x0)).setScale(p.sx, p.sy);
    this.stepPiece(p, 0);
  }

  slash(x: number, y: number, r: number, a0: number, a1: number, face: number, c: string, life: number, tilt: number) {
    const p = this.take('slash', 'vfx-slashes', 1, 5, c, Math.max(life, 0.2));
    const m = (a0 + a1) / 2 + tilt, dx = Math.cos(m) * face, dy = Math.sin(m);
    // The arc's bulge faces the cut's middle angle; the art's crescent bulges to the right at rotation 0.
    const scale = Math.max(0.25, r / 48);
    p.img.setOrigin(0.5).setPosition(x + dx * r * 0.35, y + dy * r * 0.35).setRotation(Math.atan2(dy, dx)).setScale(scale);
    this.stepPiece(p, 0);
  }

  private stepPiece(p: Piece, dt: number) {
    p.t += dt;
    const u = Math.min(0.999, p.t / p.max);
    if (p.frames > 1) p.img.setFrame(p.base + Math.floor(u * p.frames));
    if (p.kind === 'ring') {
      // The spark ring is about 96 px across at its widest frame.
      const r = p.r0 + (p.r1 - p.r0) * Math.min(1, u * 1.4), s = Math.max(0.08, r / 48);
      p.img.setScale(s, s * p.flat);
    } else if (p.kind === 'streak') {
      p.img.setScale(p.sx, p.sy * (1 - u * 0.7)).setAlpha((settings.reduceFlashes ? 0.6 : 1) * (1 - u));
    }
  }

  update(dt: number) {
    for (const p of this.pieces) {
      if (p.t < 0) continue;
      if (p.t + dt >= p.max) { p.t = -1; p.img.setVisible(false); continue; }
      this.stepPiece(p, dt);
    }
  }

  /** Burning, chilled and bleeding foes wear V07's looping overlays (one each, the strongest first). */
  statuses(ents: readonly unknown[], time: number) {
    let n = 0;
    if (settings.quality !== 'low') for (const o of ents as Afflicted[]) {
      if (!o.isFoe || o.dying || o.remove || n >= 12) continue;
      const st = STATUS.find(([k]) => o[k] > 0);
      if (!st) continue;
      let img = this.overlays[n];
      if (!img) { img = this.sc.add.image(0, 0, 'vfx-status', 0).setOrigin(0.5, 0.9).setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD); this.overlays.push(img); }
      n++;
      const b = o.body, size = Math.max(b.w * 1.6, b.h * 0.9) / 100, left = o[st[0]];
      img.setFrame(st[1] * 8 + (Math.floor(time * 12 + o.id) % 8)).setPosition(b.x, b.y + 2).setScale(size)
        .setAlpha(Math.min(1, left * 2) * (settings.reduceFlashes ? 0.5 : 0.8)).setVisible(true);
    }
    for (let i = n; i < this.overlays.length; i++) if (this.overlays[i].visible) this.overlays[i].setVisible(false);
  }

  clear() { for (const p of this.pieces) { p.t = -1; p.img.setVisible(false); } for (const o of this.overlays) o.setVisible(false); }
  destroy() { for (const p of this.pieces) p.img.destroy(); for (const o of this.overlays) o.destroy(); }
}
