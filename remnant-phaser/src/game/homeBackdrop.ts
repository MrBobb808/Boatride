// The home screen's night, behind its cards: a sky going down to black, stars that breathe, a moon in its halo with
// shafts of its light, a castle on a far ridge with a few windows lit, the near ridge Elior stands on, fog drifting
// across in two banks, embers rising and ash falling, and now and then lightning far off (none with Reduce flashes).
// Everything is painted once into textures as the scene starts and only moved after; the layers lean a little with
// the pointer, so the night has depth.
import Phaser from 'phaser';
import { settings } from '../classic/shim/settings';

/** A texture painted once on a canvas (replaced if the screen's size changed since). */
function paint(sc: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (sc.textures.exists(key)) {
    const src = sc.textures.get(key).getSourceImage() as HTMLCanvasElement;
    if (src.width === w && src.height === h) return key;
    sc.textures.remove(key);
  }
  const t = sc.textures.createCanvas(key, w, h)!;
  draw(t.getContext());
  t.refresh();
  return key;
}

/** A small seeded random, so the castle and the stars stand the same on every visit. */
const seeded = (n: number) => () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);

export class HomeBackdrop {
  private layers: { o: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite; k: number; x: number; y: number }[] = [];
  private fog: Phaser.GameObjects.TileSprite[] = [];
  private flash: Phaser.GameObjects.Rectangle;
  private bolt: Phaser.GameObjects.Graphics;
  private castle: Phaser.GameObjects.Image;
  private windows: Phaser.GameObjects.Image[] = [];
  private px = 0;
  private py = 0;
  private nextStrike = 4;
  private t = 0;
  /** How far the page has scrolled (canvas px): the night scrolls with it, the far layers less. */
  scroll = 0;

  /** `ground`: the screen y (canvas px) of the near ridge's crest, where Elior stands. */
  constructor(private sc: Phaser.Scene, private W: number, private H: number, ground: number) {
    const rnd = seeded(7);
    ground = Phaser.Math.Clamp(ground, H * 0.28, H * 0.92);
    // The sky: indigo above the ridge going down to near black; a warm breath at the horizon.
    sc.add.image(0, 0, paint(sc, 'hb-sky', W, H, (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0b0a1a'); g.addColorStop(ground / H * 0.7, '#171331'); g.addColorStop(ground / H, '#241a2c'); g.addColorStop(Math.min(1, ground / H + 0.2), '#09070d'); g.addColorStop(1, '#050408');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    })).setOrigin(0).setDepth(-100);
    // The stars, painted once; a dozen more breathe on top.
    this.layer(sc.add.image(0, 0, paint(sc, 'hb-stars', W, ground, (c) => {
      for (let i = 0; i < W * ground / 2600; i++) {
        const x = rnd() * W, y = rnd() * ground * 0.9, a = 0.25 + rnd() * 0.6;
        c.fillStyle = `rgba(230,225,255,${a * (1 - y / ground)})`; c.fillRect(x, y, rnd() < 0.1 ? 2 : 1, 1);
      }
    })).setOrigin(0).setDepth(-99), 0.15);
    for (let i = 0; i < 12; i++) {
      const s = sc.add.image(rnd() * W, rnd() * ground * 0.7, 'glow').setScale(0.03 + rnd() * 0.03).setTint(0xdcd8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(-98);
      sc.tweens.add({ targets: s, alpha: { from: 0.15, to: 0.9 }, duration: 1400 + rnd() * 2600, yoyo: true, repeat: -1, delay: rnd() * 3000, ease: 'Sine.inOut' });
      this.layer(s, 0.15);
    }
    // The moon, its halo, and three shafts of its light leaning down across the scene.
    // In a corner clear of the wordmark: top right upright, top left (beside the wordmark's column) sideways.
    const wide = W > H, mr = Math.max(14, Math.min(W, H) * (wide ? 0.05 : 0.045));
    const mx = wide ? W * 0.045 + mr : W - mr * 1.6, my = wide ? H * 0.1 + mr : ground * 0.5;
    const halo = sc.add.image(mx, my, 'glow').setTint(0x8f8ad8).setScale(mr / 9).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(-97);
    sc.tweens.add({ targets: halo, alpha: 0.5, duration: 5000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const moon = sc.add.image(mx, my, paint(sc, 'hb-moon', mr * 2, mr * 2, (c) => {
      const g = c.createRadialGradient(mr * 0.8, mr * 0.75, mr * 0.1, mr, mr, mr);
      g.addColorStop(0, '#fffbea'); g.addColorStop(0.7, '#e9e1c8'); g.addColorStop(1, '#c9bfa6');
      c.fillStyle = g; c.beginPath(); c.arc(mr, mr, mr, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(150,140,120,.25)';
      for (const [x, y, r] of [[0.6, 0.45, 0.16], [1.25, 0.8, 0.12], [0.9, 1.3, 0.2], [1.35, 1.35, 0.08]]) { c.beginPath(); c.arc(mr * x, mr * y, mr * r, 0, Math.PI * 2); c.fill(); }
    })).setDepth(-96);
    this.layer(halo, 0.25); this.layer(moon, 0.25);
    const ray = paint(sc, 'hb-ray', 64, 512, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(200,195,255,.5)'); g.addColorStop(1, 'rgba(200,195,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(26, 0); c.lineTo(38, 0); c.lineTo(64, 512); c.lineTo(0, 512); c.fill();
    });
    for (let i = 0; i < 3; i++) {
      const r = sc.add.image(mx - mr * (0.4 - i * 0.4), my, ray).setOrigin(0.5, 0).setAngle(18 + i * 9).setScale(1 + i * 0.4, (H * 1.1) / 512).setAlpha(0.06).setBlendMode(Phaser.BlendModes.ADD).setDepth(-95);
      sc.tweens.add({ targets: r, alpha: 0.13, duration: 4000 + i * 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 900 });
      this.layer(r, 0.3);
    }
    // The far ridge, and on it the castle: walls, towers with spires, a keep, and a few lit windows.
    const farTop = ground - Math.min(H * 0.14, 110);
    this.layer(sc.add.image(0, farTop, paint(sc, 'hb-far', W * 1.1, ground - farTop + 40, (c) => {
      const h = ground - farTop + 40; c.fillStyle = '#1a1530';
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= W * 1.1; x += 8) c.lineTo(x, h * 0.45 + Math.sin(x * 0.012) * h * 0.12 + Math.sin(x * 0.041) * h * 0.05);
      c.lineTo(W * 1.1, h); c.fill();
    })).setOrigin(0.05, 0).setDepth(-90), 0.5);
    const cw = Math.min(W * 0.42, 420), ch = cw * 0.62, cx = W * 0.68, cy = farTop + (ground - farTop) * 0.55;
    const windows: [number, number][] = [];
    // Repainted each visit: the windows are found as it is drawn.
    if (sc.textures.exists('hb-castle')) sc.textures.remove('hb-castle');
    this.castle = sc.add.image(cx, cy, paint(sc, 'hb-castle', cw, ch, (c) => {
      const R = seeded(11), base = ch;
      c.fillStyle = '#120e22';
      // The curtain wall, crenellated.
      c.fillRect(cw * 0.08, base * 0.62, cw * 0.84, base * 0.38);
      for (let x = cw * 0.08; x < cw * 0.92; x += cw * 0.035) c.fillRect(x, base * 0.58, cw * 0.02, base * 0.05);
      // Towers, each with a spire; the keep tallest at the middle.
      const tower = (x: number, w: number, top: number) => {
        c.fillRect(x - w / 2, base * top, w, base * (1 - top));
        c.beginPath(); c.moveTo(x - w * 0.62, base * top); c.lineTo(x, base * (top - 0.2 - R() * 0.1)); c.lineTo(x + w * 0.62, base * top); c.fill();
        for (let n = 0; n < 3; n++) if (R() < 0.55) windows.push([x + (R() - 0.5) * w * 0.4, base * (top + 0.08 + n * 0.12)]);
      };
      tower(cw * 0.12, cw * 0.07, 0.42); tower(cw * 0.3, cw * 0.06, 0.48); tower(cw * 0.5, cw * 0.11, 0.2); tower(cw * 0.66, cw * 0.06, 0.4); tower(cw * 0.86, cw * 0.08, 0.3);
      c.fillRect(cw * 0.42, base * 0.36, cw * 0.16, base * 0.64);
    })).setDepth(-89);
    this.layer(this.castle, 0.55);
    for (const [wx, wy] of windows) {
      const w = sc.add.image(cx - cw / 2 + wx, cy - ch / 2 + wy, 'glow').setScale(0.035).setTint(0xffb35a).setBlendMode(Phaser.BlendModes.ADD).setDepth(-88).setAlpha(0.8);
      sc.tweens.add({ targets: w, alpha: { from: 0.45, to: 0.95 }, duration: 600 + rnd() * 1800, yoyo: true, repeat: -1, delay: rnd() * 2000 });
      this.windows.push(w); this.layer(w, 0.55);
    }
    // Fog: two banks drifting across the foot of the ridges at different speeds.
    const fogKey = paint(sc, 'hb-fog', 512, 160, (c) => {
      const R = seeded(23);
      for (let i = 0; i < 44; i++) {
        const x = R() * 512, y = 70 + (R() - 0.5) * 30, r = 26 + R() * 40;
        // Drawn three times, so the bank tiles without a seam.
        for (const dx of [-512, 0, 512]) {
          const g = c.createRadialGradient(x + dx, y, 0, x + dx, y, r);
          g.addColorStop(0, 'rgba(170,160,200,.16)'); g.addColorStop(1, 'rgba(170,160,200,0)');
          c.fillStyle = g; c.beginPath(); c.arc(x + dx, y, r, 0, Math.PI * 2); c.fill();
        }
      }
      // Fade it out above and below, so no bank has an edge.
      c.globalCompositeOperation = 'destination-in';
      const v = c.createLinearGradient(0, 0, 0, 160);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.35, 'rgba(0,0,0,1)'); v.addColorStop(0.65, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = v; c.fillRect(0, 0, 512, 160);
      c.globalCompositeOperation = 'source-over';
    });
    for (let i = 0; i < 2; i++) {
      const f = sc.add.tileSprite(0, ground - 60 + i * 34, W, 160, fogKey).setOrigin(0, 0.5).setAlpha(i ? 0.55 : 0.8).setDepth(i ? -70 : -85).setTileScale(1.4 + i * 0.6, 1 + i * 0.3);
      this.fog.push(f); this.layer(f, i ? 0.9 : 0.6);
    }
    // The near ridge Elior stands on: a dark crest with a rim of moonlight.
    this.layer(sc.add.image(0, ground - 14, paint(sc, 'hb-near', W * 1.1, H - ground + 30, (c) => {
      const h = H - ground + 30, w = W * 1.1, top = (x: number) => 14 + Math.sin(x * 0.006) * 6 + Math.sin(x * 0.023) * 3;
      c.fillStyle = '#07060b'; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) c.lineTo(x, top(x));
      c.lineTo(w, h); c.fill();
      c.strokeStyle = 'rgba(170,160,230,.25)'; c.lineWidth = 1.5; c.beginPath();
      for (let x = 0; x <= w; x += 6) (x ? c.lineTo(x, top(x)) : c.moveTo(x, top(x)));
      c.stroke();
    })).setOrigin(0.05, 0).setDepth(-60), 0.8);
    // Ash falling, slow and grey, through the whole night.
    for (let i = 0; i < 18; i++) {
      const a = sc.add.image(0, 0, 'glow').setTint(0xb8b0c8).setDepth(-50);
      const fall = () => {
        a.setPosition(rnd() * W, -10).setScale(0.02 + rnd() * 0.025).setAlpha(0.25 + rnd() * 0.35);
        sc.tweens.add({ targets: a, y: H + 10, x: a.x + (rnd() - 0.3) * 120, duration: 9000 + rnd() * 9000, delay: rnd() * 6000, onComplete: fall });
      };
      fall();
    }
    // Lightning far off: a jagged bolt on the sky behind the castle, and the night lit for a breath.
    this.bolt = sc.add.graphics().setDepth(-91).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = sc.add.rectangle(0, 0, W, H, 0xc8c4ff, 0).setOrigin(0).setDepth(-40).setBlendMode(Phaser.BlendModes.ADD);
    // A vignette pulls the eye in to the middle.
    sc.add.image(W / 2, H / 2, paint(sc, 'hb-vig', W, H, (c) => {
      const g = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.65)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    })).setDepth(-30);
    sc.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.px = (p.x / W - 0.5) * 2; this.py = (p.y / H - 0.5) * 2; });
  }

  /** Add a layer that leans with the pointer by `k` (0 still, 1 the most). */
  private layer(o: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite, k: number) { this.layers.push({ o, k, x: o.x, y: o.y }); }

  update(dt: number) {
    this.t += dt;
    // The layers lean toward the pointer and sway a little on their own, the near ones more.
    const sx = this.px + Math.sin(this.t * 0.13) * 0.3, sy = this.py * 0.5 + Math.sin(this.t * 0.09) * 0.15;
    for (const l of this.layers) l.o.setPosition(l.x - sx * l.k * 10, l.y - sy * l.k * 5 - this.scroll * l.k);
    this.fog[0].tilePositionX += dt * 6; this.fog[1].tilePositionX -= dt * 11;
    this.nextStrike -= dt;
    if (this.nextStrike <= 0) { this.nextStrike = 7 + Math.random() * 9; if (!settings.reduceFlashes) this.strike(); }
  }

  private strike() {
    const sc = this.sc, g = this.bolt.clear(), x0 = this.W * (0.15 + Math.random() * 0.7);
    let x = x0, y = 0;
    const end = this.castle.y - this.castle.height * 0.3;
    g.lineStyle(2, 0xd8d4ff, 1).beginPath().moveTo(x, y);
    while (y < end) { x += (Math.random() - 0.5) * 30; y += 14 + Math.random() * 18; g.lineTo(x, Math.min(y, end)); }
    g.strokePath().setAlpha(1);
    sc.tweens.add({ targets: g, alpha: 0, duration: 380, ease: 'Quad.out' });
    // Two pulses of light, the second fainter, as distant lightning comes.
    sc.tweens.chain({ targets: this.flash, tweens: [
      { fillAlpha: 0.1, duration: 50 }, { fillAlpha: 0, duration: 120 }, { fillAlpha: 0.06, duration: 60 }, { fillAlpha: 0, duration: 420 },
    ] });
  }
}
