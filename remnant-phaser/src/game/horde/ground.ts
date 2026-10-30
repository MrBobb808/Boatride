// The Horde's endless ground: a seamless tile per place, generated once, and scattered rocks, bones and ruins that
// wrap around the camera so the field never runs out. Also the small shared textures (gems, coins, shadows).
import Phaser from 'phaser';
import type { Biome } from './defs';

const TILE = 512;
/** Decor repeats over this span; wide enough that the repeat is never on screen twice. */
const SPAN = 1024;

/** A small seeded random, so a place always lays out the same way. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function canvas(sc: Phaser.Scene, key: string, w: number, h: number) {
  if (sc.textures.exists(key)) sc.textures.remove(key);
  const t = sc.textures.createCanvas(key, w, h)!;
  return { t, g: t.getContext() };
}

/** Pixels that wrap at the tile's edges, so the tile repeats without a seam. */
function dot(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  for (const ox of [0, -TILE, TILE]) for (const oy of [0, -TILE, TILE]) {
    const px = Math.round(x + ox), py = Math.round(y + oy);
    if (px + w < 0 || py + h < 0 || px > TILE || py > TILE) continue;
    g.fillRect(px, py, w, h);
  }
}

function groundTexture(sc: Phaser.Scene, b: Biome) {
  const key = `hz-ground-${b.id}`;
  if (sc.textures.exists(key)) return key;
  const { t, g } = canvas(sc, key, TILE, TILE), r = rng(b.id.length * 7919 + b.id.charCodeAt(0));
  const [base, light, dark, vein] = b.ground;
  g.fillStyle = base; g.fillRect(0, 0, TILE, TILE);
  // Broad patches of lighter and darker earth, then the fine grain.
  for (let i = 0; i < 70; i++) {
    const cx = r() * TILE, cy = r() * TILE, rad = 10 + r() * 26, c = r() < 0.5 ? light : dark;
    g.globalAlpha = 0.18;
    for (let k = 0; k < rad * 3; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad; dot(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 3, 2, c); }
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 3600; i++) dot(g, r() * TILE, r() * TILE, 1, 1, r() < 0.55 ? dark : light);
  for (let i = 0; i < 280; i++) dot(g, r() * TILE, r() * TILE, 2, 1, r() < 0.5 ? dark : light);
  // Cracks (or veins of ember, frost, bile) wandering across the tile.
  for (let i = 0; i < 16; i++) {
    let x = r() * TILE, y = r() * TILE, a = r() * Math.PI * 2;
    // Most are dark cracks; a rare one carries the place's glow (ember, frost, bile), faintly.
    const glow = i < 2, len = 14 + r() * 30;
    for (let s = 0; s < len; s++) {
      a += (r() - 0.5) * 1.1; x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5;
      g.globalAlpha = glow ? 0.55 : 0.8;
      dot(g, x, y, 1, 1, glow ? vein : dark);
    }
    g.globalAlpha = 1;
  }
  t.refresh();
  return key;
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

function decorTexture(sc: Phaser.Scene, b: Biome, kind: Biome['decor'][number], v: number) {
  const key = `hz-decor-${b.id}-${kind}-${v}`;
  if (sc.textures.exists(key)) return key;
  const W = kind === 'pillar' ? 26 : kind === 'pool' ? 40 : 24, H = kind === 'pillar' ? 40 : 24;
  const { t, g } = canvas(sc, key, W, H), r = rng(v * 131 + kind.length * 17 + b.id.length);
  const [base, light, dark, vein] = b.ground, px = (x: number, y: number, c: string, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  if (kind === 'rock' || kind === 'crystal') {
    const rw = 8 + r() * 8, rh = 6 + r() * 5, cx = W / 2, cy = H - rh - 2;
    const body = kind === 'crystal' ? vein : shade(base, 1.35), hi = kind === 'crystal' ? '#ffffff' : shade(light, 1.3), lo = kind === 'crystal' ? shade(vein, 0.55) : shade(dark, 0.8);
    for (let y = 0; y <= rh; y++) for (let x = -rw; x <= rw; x++) {
      const e = (x * x) / (rw * rw) + ((y - rh / 2) ** 2) / ((rh / 2) ** 2);
      if (e > 1 + (r() - 0.5) * 0.25) continue;
      px(cx + x, cy + y, y < rh * 0.35 && x < rw * 0.3 ? hi : y > rh * 0.7 || x > rw * 0.55 ? lo : body);
    }
    if (kind === 'crystal') for (let i = 0; i < 3; i++) { const x = cx - 5 + i * 5, hgt = 6 + r() * 8; for (let y = 0; y < hgt; y++) px(x, cy - y, y < 2 ? '#ffffff' : vein, 2, 1); }
    px(cx - rw, cy + rh, 'rgba(0,0,0,0.35)', rw * 2, 2);
  } else if (kind === 'bones') {
    const bone = '#d9d2bd', boneLo = '#9c9581';
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI, l = 6 + r() * 6, x0 = 4 + r() * (W - 12), y0 = 8 + r() * (H - 14);
      for (let s = 0; s < l; s++) px(x0 + Math.cos(a) * s, y0 + Math.sin(a) * s * 0.6, s === 0 || s === Math.floor(l) - 1 ? bone : boneLo, 2, 1);
    }
    // A skull, now and then.
    if (r() < 0.6) { const x = W / 2 - 3, y = H - 10; px(x, y, bone, 6, 5); px(x + 1, y + 2, '#2a2420', 1, 1); px(x + 4, y + 2, '#2a2420', 1, 1); px(x + 1, y + 5, boneLo, 4, 1); }
  } else if (kind === 'shrub') {
    const leaf = b.id === 'hunt' ? '#cfe3ee' : b.id === 'plague' ? '#6d8a3a' : '#5b4a34', twig = shade(dark, 0.7);
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.4, l = 5 + r() * 8; for (let s = 0; s < l; s++) px(W / 2 + Math.cos(a) * s, H - 3 + Math.sin(a) * s, s > l - 3 ? leaf : twig); }
  } else if (kind === 'pillar') {
    const stone = shade(light, 1.15), lo = shade(base, 0.9), hgt = 18 + r() * 18;
    for (let y = 0; y < hgt; y++) { px(8, H - 3 - y, stone, 8, 1); px(8, H - 3 - y, shade(light, 1.4), 2, 1); px(14, H - 3 - y, lo, 2, 1); }
    px(5, H - 4, lo, 14, 3); px(6, H - 3 - hgt, stone, 12, 2);
    for (let i = 0; i < 4; i++) px(3 + r() * 18, H - 2 - r() * 3, stone, 2, 2);
  } else if (kind === 'ember') {
    for (let i = 0; i < 6; i++) { const x = 4 + r() * (W - 8), y = 6 + r() * (H - 10); px(x, y, vein, 2, 2); px(x + 1, y, '#ffe2a0', 1, 1); }
    for (let i = 0; i < 8; i++) px(2 + r() * (W - 4), 2 + r() * (H - 4), shade(dark, 0.6), 3, 2);
  } else if (kind === 'pool') {
    const water = b.id === 'plague' ? '#3f5a22' : '#2a3a48';
    for (let y = 0; y < 14; y++) for (let x = -18; x <= 18; x++) {
      const e = (x * x) / 324 + ((y - 7) ** 2) / 49;
      if (e > 1) continue;
      px(W / 2 + x, 6 + y, e > 0.75 ? shade(dark, 0.8) : e < 0.2 && x < 0 ? shade(water, 1.6) : water);
    }
  }
  t.refresh();
  return key;
}

/**
 * Bolts from above, drawn once in white (tinted where they fall): a jagged stroke in four widths for the glow and
 * the core, a fork or two, and the top fading out so no edge ever shows (the bloom where it lands is its own image).
 */
function boltTextures(sc: Phaser.Scene) {
  // Wide enough that the outer glow never meets the sides.
  const W = 80, H = 260;
  for (let v = 0; v < 3; v++) {
    const key = `hz-bolt-${v}`;
    if (sc.textures.exists(key)) continue;
    const { t, g } = canvas(sc, key, W, H), r = rng(91 + v * 37);
    const path: [number, number][] = [];
    let x = W / 2 + (r() - 0.5) * 8;
    for (let y = 0; y <= H - 8; y += 10 + r() * 8) { path.push([x, y]); x = Math.max(26, Math.min(W - 26, x + (r() - 0.5) * 18)); }
    path.push([W / 2, H - 8]);
    const forks: [number, number][][] = [];
    for (let f = 0; f < 2; f++) {
      const from = path[3 + Math.floor(r() * (path.length - 6))], dir = r() < 0.5 ? -1 : 1, fork: [number, number][] = [from];
      let fx = from[0], fy = from[1];
      for (let k = 0; k < 4; k++) { fx += dir * (3 + r() * 5); fy += 8 + r() * 6; fork.push([fx, fy]); }
      forks.push(fork);
    }
    g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#ffffff';
    for (const [w, a] of [[16, 0.08], [9, 0.18], [4.5, 0.55], [1.8, 1]] as const) {
      g.globalAlpha = a; g.lineWidth = w;
      for (const line of [path, ...forks]) { g.beginPath(); line.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); }
    }
    // From nothing at the top to full strength a third of the way down: the bolt comes out of the dark, not a frame's edge.
    const fade = g.createLinearGradient(0, 0, 0, H * 0.4);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    t.refresh();
  }
}

/** Textures every stage shares: shadows, gems, coins, hearts, the chest, the foes' shots and the bolts. */
export function hordeTextures(sc: Phaser.Scene) {
  boltTextures(sc);
  if (sc.textures.exists('hz-gem-0')) return;
  const make = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => { const { t, g } = canvas(sc, key, w, h); draw(g); t.refresh(); };
  make('hz-shadow', 32, 12, (g) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) {
      const e = ((x - 15.5) / 16) ** 2 + ((y - 5.5) / 6) ** 2;
      if (e < 1) { g.fillStyle = `rgba(0,0,0,${(0.55 * (1 - e)).toFixed(2)})`; g.fillRect(x, y, 1, 1); }
    }
  });
  const gems: [string, string, string][] = [['#4fb3ff', '#c9ecff', '#1d5b9c'], ['#5fe08a', '#d6ffe4', '#1f7a43'], ['#ff5a6a', '#ffd3d8', '#8a1d2a']];
  gems.forEach(([c, hi, lo], i) => make(`hz-gem-${i}`, 7, 9, (g) => {
    const rows = [[3, 1], [2, 3], [1, 5], [0, 7], [1, 5], [2, 3], [3, 1]];
    rows.forEach(([x, w], y) => { g.fillStyle = y < 3 ? hi : y > 4 ? lo : c; g.fillRect(x, y + 1, w, 1); });
    g.fillStyle = '#ffffff'; g.fillRect(2, 2, 1, 1);
  }));
  make('hz-coin', 6, 6, (g) => { g.fillStyle = '#8a6420'; g.fillRect(1, 0, 4, 6); g.fillRect(0, 1, 6, 4); g.fillStyle = '#f2c35a'; g.fillRect(1, 1, 4, 4); g.fillStyle = '#fff1b8'; g.fillRect(1, 1, 2, 1); });
  make('hz-heart', 9, 8, (g) => {
    const m = ['.XX.XX...', 'XOOXOOX..', 'XOOOOOX..', '.XOOOX...', '..XOX....', '...X.....'];
    m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; g.fillStyle = ch === 'X' ? '#6a1020' : '#ff4a5e'; g.fillRect(x + 1, y + 1, 1, 1); }));
    g.fillStyle = '#ffd0d6'; g.fillRect(3, 3, 1, 1);
  });
  make('hz-chest', 16, 13, (g) => {
    g.fillStyle = '#2b1a10'; g.fillRect(0, 3, 16, 10);
    g.fillStyle = '#7a4a22'; g.fillRect(1, 4, 14, 8);
    g.fillStyle = '#a5672e'; g.fillRect(1, 1, 14, 4);
    g.fillStyle = '#e2b85a'; g.fillRect(0, 5, 16, 1); g.fillRect(7, 4, 2, 4); g.fillRect(0, 0, 16, 1);
    g.fillStyle = '#fff1b8'; g.fillRect(7, 5, 1, 1);
  });
  make('hz-shot', 10, 10, (g) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d < 5) { g.fillStyle = d < 2 ? '#fff0e0' : d < 3.5 ? '#ff7050' : 'rgba(180,30,40,0.7)'; g.fillRect(x, y, 1, 1); }
    }
  });
  make('hz-ring', 64, 64, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fill();
  });
}

/** The ground under the camera, and the decor wrapped around it. */
export class Terrain {
  private tile: Phaser.GameObjects.TileSprite;
  private decor: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private motes: Phaser.GameObjects.Image[] = [];
  private moteT = 0;

  constructor(private sc: Phaser.Scene, private layer: Phaser.GameObjects.Layer) {
    this.tile = sc.add.tileSprite(0, 0, 16, 16, '__WHITE').setOrigin(0).setDepth(-100000);
    layer.add(this.tile);
  }

  /** Lay out a place: its ground, and its rocks, bones and ruins. */
  set(b: Biome) {
    this.tile.setTexture(groundTexture(this.sc, b));
    for (const d of this.decor) d.img.destroy();
    for (const m of this.motes) m.destroy();
    this.decor = []; this.motes = [];
    const r = rng(b.id.charCodeAt(1) * 977 + 3);
    for (let i = 0; i < 46; i++) {
      const kind = b.decor[Math.floor(r() * b.decor.length)], v = Math.floor(r() * 4);
      const img = this.sc.add.image(0, 0, decorTexture(this.sc, b, kind, v)).setOrigin(0.5, 1);
      if (kind === 'ember') img.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
      // Flat things lie under every foot; standing ruins sort with the figures.
      img.setData('flat', kind === 'ember' || kind === 'pool' || kind === 'bones');
      this.layer.add(img);
      this.decor.push({ img, x: r() * SPAN, y: r() * SPAN });
    }
    for (let i = 0; i < 24; i++) {
      const m = this.sc.add.image(0, 0, 'glow').setTint(b.motes).setBlendMode(Phaser.BlendModes.ADD).setScale(0.05 + r() * 0.05).setAlpha(0).setDepth(100000);
      m.setData('v', { x: (r() - 0.5) * 30, y: -8 - r() * 22, life: r() * 4, max: 3 + r() * 3 });
      this.layer.add(m);
      this.motes.push(m);
    }
  }

  update(dt: number, view: Phaser.Geom.Rectangle) {
    // The tile covers the view and scrolls with the world, so it reads as endless ground.
    this.tile.setPosition(view.x - 2, view.y - 2).setSize(Math.ceil(view.width) + 4, Math.ceil(view.height) + 4);
    this.tile.tilePositionX = view.x - 2; this.tile.tilePositionY = view.y - 2;
    const cx = view.centerX, cy = view.centerY;
    for (const d of this.decor) {
      // Each piece sits at the copy of its spot nearest the camera.
      const x = d.x + Math.round((cx - d.x) / SPAN) * SPAN, y = d.y + Math.round((cy - d.y) / SPAN) * SPAN;
      d.img.setPosition(Math.round(x), Math.round(y));
      d.img.setDepth(d.img.getData('flat') ? -50000 + y * 0.001 : y);
    }
    this.moteT += dt;
    for (const m of this.motes) {
      const v = m.getData('v') as { x: number; y: number; life: number; max: number };
      v.life += dt;
      if (v.life > v.max) { v.life = 0; m.setPosition(view.x + Math.random() * view.width, view.y + Math.random() * view.height); }
      m.x += v.x * dt; m.y += v.y * dt;
      const u = v.life / v.max;
      m.setAlpha(Math.sin(u * Math.PI) * 0.7);
    }
  }
}
