// Weather and ambience (POLISH_PLAN §11c), Phaser presentation only: storms with lightning and splashes,
// fog banks, tumbling ash and ember gusts, and shafts of light with motes drifting through them. The original's
// particle weather (Visuals) stays underneath; this adds the place's mood on top of it.
import Phaser from 'phaser';
import { T, TILE, isSolid, type RoomDef } from '../shared';
import { G } from '../classic/shim/ctx';
import { settings } from '../classic/shim/settings';
import { sfx } from '../classic/shim/audio';
import { lighting } from '../classic/shim/lighting';
import type { World } from '../scenes/World';

export type Mood = 'storm' | 'ash' | 'embers' | 'fog' | 'beams';

const FOG: Partial<Record<string, number>> = { valley: 0xd9cfb2, hunt: 0xb4c4d8, plague: 0x9fc48a };
const BEAMS = ['temple', 'sanctum', 'tower', 'palace', 'shushan', 'sanctuary'];
/** The bolt's two strokes: a wide pale glow, then the bright core. */
const BOLT = [[5, 0.35, '#9fb4ff'], [1.5, 1, '#ffffff']] as const;

/** Which moods a room carries: the Ashen Village and Cinders burn, the storm coasts rain and flash, the valley,
 * the Hunt and the Pestilence lie in fog, and light falls through the temples and over the Rest. */
export function moods(r: RoomDef): Mood[] {
  const m: Mood[] = [];
  if (r.weather === 'rain') m.push('storm');
  if (r.biome === 'village' || r.biome === 'cinders') m.push('ash');
  if (r.biome === 'village' || r.biome === 'sanctuary' || r.biome === 'cinders' || r.biome === 'furnace') m.push('embers');
  if (FOG[r.biome] !== undefined) m.push('fog');
  if ((r.interior && BEAMS.includes(r.biome)) || r.biome === 'rest') m.push('beams');
  return m;
}

interface Beam { x: number; y: number; len: number; width: number; img: Phaser.GameObjects.Image; floorX: number; floorY: number }

export class Atmosphere {
  moods: Mood[] = [];
  beams: Beam[] = [];
  /** The lightning's brightness now (0–1), its bolt in sky fractions, and when the next one comes. */
  flash = 0;
  strikes = 0;
  private flashT = -1;
  private next = 0;
  private thunderIn = -1;
  private thunderPan = 0;
  private bolt = new Float32Array(32);
  private boltN = 0;
  private branch = new Float32Array(12);
  private branchN = 0;
  private wind = 1;
  private tier = 2;
  private paused = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private fog: Phaser.GameObjects.TileSprite[] = [];
  /** Emitters that ride along with the view (the ash), as Visuals' weather does. */
  private follow: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private splash?: Phaser.GameObjects.Particles.ParticleEmitter;
  private gust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private gustT = 0;
  private veil?: Phaser.GameObjects.Rectangle;
  private t = 0;

  constructor(private w: World) { this.textures(); }

  /** Baked once: a soft fog band that tiles sideways, a shaft of light, an ash flake. */
  private textures() {
    const tx = this.w.textures;
    if (tx.exists('atmo-fog')) return;
    const fog = tx.createCanvas('atmo-fog', 256, 64)!, f = fog.getContext();
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * 256, y = 18 + rnd() * 52, r = 10 + rnd() * 22, a = 0.1 + rnd() * 0.14;
      for (const dx of [-256, 0, 256]) {
        const g = f.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        f.fillStyle = g; f.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    fog.refresh();
    const beam = tx.createCanvas('atmo-beam', 32, 128)!, b = beam.getContext(), img = b.createImageData(32, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
      const edge = Math.max(0, 1 - Math.abs(x - 15.5) / 16) ** 0.75, fade = Math.min(1, y / 10) * (1 - y / 128) ** 1.4;
      const i = (y * 32 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * edge * edge * fade);
    }
    b.putImageData(img, 0, 0); beam.refresh();
    const flake = tx.createCanvas('atmo-flake', 4, 3)!, k = flake.getContext();
    k.fillStyle = '#ffffff'; k.fillRect(1, 0, 2, 1); k.fillRect(0, 1, 4, 1); k.fillRect(1, 2, 2, 1); flake.refresh();
  }

  /** Build the room's moods for the quality tier (rebuilt when the tier changes). */
  build(tier: number) {
    this.clear();
    const w = this.w, r = w.room;
    this.tier = tier;
    this.moods = moods(r);
    this.wind = r.seed % 2 ? 1 : -1;
    const width = Math.max(400, w.scale.width / w.baseZoom);
    const add = <E extends Phaser.GameObjects.GameObject>(o: E) => { this.objs.push(o); return o; };
    const emit = (e: Phaser.GameObjects.Particles.ParticleEmitter) => { this.emitters.push(add(e)); if (this.paused) e.pause(); return e; };
    const few = tier === 0 ? 0.4 : tier === 1 ? 0.7 : 1;

    if (this.moods.includes('fog')) {
      const tint = FOG[r.biome]!;
      this.fog.push(add(w.add.tileSprite(0, 0, width, 210, 'atmo-fog').setOrigin(0, 1).setDepth(0.5).setTint(tint).setAlpha(0.7)));
      if (tier > 0) this.fog.push(add(w.add.tileSprite(0, 0, width, 110, 'atmo-fog').setOrigin(0, 1).setDepth(16.6).setTint(tint).setAlpha(0.38).setFlipX(true)));
    }
    if (this.moods.includes('ash')) {
      const flakes = (near: boolean) => emit(w.add.particles(0, 0, 'atmo-flake', {
        x: { min: -width * 0.65, max: width * 0.65 }, y: { min: -20, max: 40 }, lifespan: 7000,
        frequency: (near ? 260 : 150) / few, maxParticles: Math.round((near ? 26 : 50) * few),
        speedY: { min: 10, max: 26 }, speedX: { min: 4 * this.wind, max: 22 * this.wind }, accelerationX: { min: -6, max: 6 },
        rotate: { start: 0, end: 360 * this.wind }, scale: near ? { min: 1, max: 1.6 } : { min: 0.5, max: 0.9 },
        alpha: { start: near ? 0.55 : 0.4, end: 0 }, tint: [0xb9b4ac, 0x8d8a90, 0x6e6b72],
      }).setDepth(near ? 17 : 0.6));
      this.follow.push(flakes(false));
      if (tier > 0) this.follow.push(flakes(true));
    }
    if (this.moods.includes('embers')) {
      this.gust = emit(w.add.particles(0, 0, 'glow', {
        emitting: false, lifespan: { min: 1600, max: 2600 }, maxParticles: Math.round(40 * few),
        speedX: { min: 110 * this.wind, max: 210 * this.wind }, speedY: { min: -55, max: -8 }, accelerationY: { min: -20, max: 10 },
        scale: { start: 0.05, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0xff7a37, 0xffc178, 0xff9a4a, 0xdd5f39], blendMode: 'ADD',
      }).setDepth(16.8));
      this.gustT = 1.5;
    }
    if (this.moods.includes('storm')) {
      this.splash = emit(w.add.particles(0, 0, 'vfx-spark', {
        emitting: false, maxParticles: Math.round(60 * few), lifespan: { min: 150, max: 300 },
        speedX: { min: -40, max: 40 }, speedY: { min: -75, max: -25 }, gravityY: 320,
        scale: { start: 0.3, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0xd2e8ff,
      }).setDepth(13.5));
      this.veil = add(w.add.rectangle(0, 0, 8, 8, 0xdfe9ff).setOrigin(0).setDepth(19).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD));
      this.next = 2 + Math.random() * 3;
    }
    if (this.moods.includes('beams')) this.buildBeams(r, tier, few, emit);
  }

  /** Two to five shafts falling from the ceiling (or the sky over the Rest) to the floor below, with motes in them. */
  private buildBeams(r: RoomDef, tier: number, few: number, emit: (e: Phaser.GameObjects.Particles.ParticleEmitter) => Phaser.GameObjects.Particles.ParticleEmitter) {
    const w = this.w, n = Math.max(2, Math.min(5, Math.round(r.w / 28))), slant = 0.24 * this.wind;
    const tint = r.biome === 'rest' ? 0xfff1c8 : r.biome === 'tower' ? 0xe8ecff : 0xffe2a6;
    for (let i = 0; i < n; i++) {
      const tx = Math.floor(((i + 0.5) / n) * r.w + (((r.seed * (i + 3)) % 7) - 3));
      let y0 = 0;
      if (r.interior) { while (y0 < r.h && !isSolid(w.tileAt(tx, y0) as T)) y0++; while (y0 < r.h && isSolid(w.tileAt(tx, y0) as T)) y0++; }
      let y1 = y0;
      while (y1 < r.h && !isSolid(w.tileAt(Math.floor(tx + (y1 - y0) * slant), y1) as T)) y1++;
      if (y0 >= r.h || y1 - y0 < 4) continue;
      const x = tx * TILE + 8, y = y0 * TILE, rise = (y1 - y0) * TILE, len = rise / Math.cos(Math.atan(slant)), width = 48 + ((r.seed + i * 13) % 30);
      const img = w.add.image(x, y, 'atmo-beam').setOrigin(0.5, 0).setDisplaySize(width, len).setRotation(-Math.atan(slant)).setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(18.4).setAlpha(0);
      this.objs.push(img);
      this.beams.push({ x, y, len, width, img, floorX: x + rise * slant, floorY: y1 * TILE - 4 });
    }
    if (!this.beams.length || tier === 0) return;
    // Motes anywhere inside a shaft, drifting down through the light.
    const beams = this.beams, source = {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        const b = beams[Math.floor(Math.random() * beams.length)], t = Math.random(), side = (Math.random() - 0.5) * b.width * 0.5;
        p.x = b.x + (b.floorX - b.x) * t + side; p.y = b.y + (b.floorY - b.y) * t; return p;
      },
    };
    emit(w.add.particles(0, 0, 'glow', {
      emitZone: { type: 'random', source } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      lifespan: { min: 3000, max: 5500 }, frequency: 110 / few, maxParticles: Math.round(16 * beams.length * few),
      speedY: { min: 2, max: 9 }, speedX: { min: -4, max: 4 }, scale: { min: 0.015, max: 0.04 },
      alpha: { onEmit: () => 0, onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.8 },
      tint: tint, blendMode: 'ADD',
    }).setDepth(18.5));
  }

  pause(held: boolean) {
    this.paused = held;
    for (const e of this.emitters) held ? e.pause() : e.resume();
  }

  step(dt: number, v: Phaser.Geom.Rectangle) {
    if (this.paused || !this.moods.length) return;
    const w = this.w, r = w.room;
    this.t += dt;
    for (const e of this.follow) e.setPosition(v.centerX, v.y);
    // Fog hangs low: it sinks away below as the view climbs, and drifts with the wind.
    const floor = r.h * TILE, bottom = v.bottom + 24 + (floor - v.bottom) * 0.2;
    for (let i = 0; i < this.fog.length; i++) {
      const f = this.fog[i], near = i === 1;
      if (f.width !== Math.ceil(v.width) + 2) f.setSize(Math.ceil(v.width) + 2, f.height);
      f.setPosition(v.x - 1, bottom + (near ? 6 : 0));
      f.tilePositionX = v.x * (near ? 1.25 : 0.6) - this.t * (near ? 9 : 4) * this.wind;
      f.tileScaleX = near ? 1.6 : 1.2; f.tileScaleY = f.height / 64;
    }
    if (this.gust) {
      this.gustT -= dt;
      if (this.gustT <= 0) {
        this.gustT = 3 + Math.random() * 4;
        const x = this.wind > 0 ? v.x - 10 : v.right + 10, n = this.tier === 0 ? 6 : this.tier === 1 ? 12 : 20;
        for (let i = 0; i < n; i++) this.gust.emitParticleAt(x, v.y + v.height * (0.3 + Math.random() * 0.65), 1);
      } else if (Math.random() < dt * 3) this.gust.emitParticleAt(this.wind > 0 ? v.x : v.right, v.y + v.height * (0.4 + Math.random() * 0.55), 1);
    }
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i], base = settings.reduceFlashes ? 0.2 : 0.32;
      b.img.setAlpha(base * (0.82 + 0.18 * Math.sin(this.t * 0.6 + i * 1.7)));
    }
    if (this.splash) this.stepStorm(dt, v);
  }

  private stepStorm(dt: number, v: Phaser.Geom.Rectangle) {
    const w = this.w;
    // Rain lands on whatever floor is in view.
    const n = Math.min(4, Math.round((this.tier === 0 ? 1 : this.tier === 1 ? 2 : 3) * dt * 60));
    for (let i = 0; i < n; i++) {
      const x = v.x + Math.random() * v.width, tx = Math.floor(x / TILE);
      for (let ty = Math.max(0, Math.floor(v.y / TILE)), end = Math.floor(v.bottom / TILE) + 1; ty <= end; ty++) {
        const t = w.tileAt(tx, ty) as T;
        if (isSolid(t) || t === T.Water) { if (!isSolid(w.tileAt(tx, ty - 1) as T)) this.splash!.emitParticleAt(x, ty * TILE, 1); break; }
      }
    }
    this.next -= dt;
    if (this.next <= 0) this.strike();
    if (this.flashT >= 0) {
      const t = (this.flashT += dt);
      // A crack, a flicker, a second crack, then the light fading out.
      this.flash = t < 0.06 ? 1 : t < 0.12 ? 0.25 : t < 0.2 ? 0.8 : Math.max(0, 0.8 * Math.exp(-(t - 0.2) * 6));
      if (this.flash < 0.01 && t > 0.3) { this.flash = 0; this.flashT = -1; }
    }
    this.veil!.setPosition(v.x - 1, v.y - 1).setSize(v.width + 2, v.height + 2).setAlpha(this.flash * (settings.reduceFlashes ? 0.06 : 0.22));
    if (this.thunderIn >= 0 && (this.thunderIn -= dt) < 0) sfx('thunder', { vol: 0.55 + Math.random() * 0.3, pan: this.thunderPan, pitch: 0.85 + Math.random() * 0.3 });
  }

  /** A bolt somewhere over the view: the sky flashes, the room lights up, and the thunder follows. */
  strike() {
    if (!this.splash) return;
    this.next = this.tier === 0 ? 8 + Math.random() * 8 : 4 + Math.random() * 7;
    this.flashT = 0; this.flash = 1; this.strikes++;
    let x = 0.15 + Math.random() * 0.7, y = 0;
    const end = 0.35 + Math.random() * 0.25, segs = 10;
    this.boltN = 0;
    for (let i = 0; i <= segs; i++) {
      this.bolt[this.boltN++] = x; this.bolt[this.boltN++] = y;
      x += (Math.random() - 0.5) * 0.07; y += end / segs;
    }
    const from = 4 + Math.floor(Math.random() * 3);
    this.branchN = 0;
    let bx = this.bolt[from * 2], by = this.bolt[from * 2 + 1];
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 5; i++) { this.branch[this.branchN++] = bx; this.branch[this.branchN++] = by; bx += dir * (0.02 + Math.random() * 0.03); by += 0.03; }
    this.thunderIn = 0.15 + Math.random() * 0.8;
    this.w.visuals.screen.swell(0.45);
    this.thunderPan = (this.bolt[0] - 0.5) * 1.2;
  }

  /** Drawn into the room's back canvas between the sky and its far silhouettes: the sky's flash and the bolt. */
  sky(c: CanvasRenderingContext2D, W: number, H: number) {
    if (this.flash <= 0.01) return;
    const a = this.flash * (settings.reduceFlashes ? 0.3 : 1);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a * 0.45; c.fillStyle = '#b8c8ff'; c.fillRect(0, 0, W, H);
    if (this.flashT < 0.22) {
      for (const [width, alpha, col] of BOLT) {
        c.globalAlpha = a * alpha; c.strokeStyle = col; c.lineWidth = width; c.lineJoin = 'round';
        c.beginPath();
        for (let i = 0; i < this.boltN; i += 2) (i ? c.lineTo : c.moveTo).call(c, this.bolt[i] * W, this.bolt[i + 1] * H);
        for (let i = 0; i < this.branchN; i += 2) (i ? c.lineTo : c.moveTo).call(c, this.branch[i] * W, this.branch[i + 1] * H);
        c.stroke();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  /** Lights the shafts lay on the floor, and the lightning lifting the whole room's darkness. */
  lights() {
    for (const b of this.beams) lighting.add(b.floorX, b.floorY, Math.min(90, b.width * 1.6), '#ffe6b0', settings.reduceFlashes ? 0.4 : 0.55, 0.2);
    if (this.flash > 0.05 && !G.inCutscene) {
      const v = this.w.cameras.main.worldView;
      lighting.add(v.centerX, v.y + v.height * 0.4, v.width, '#dfe9ff', this.flash * (settings.reduceFlashes ? 0.4 : 0.85), 0);
    }
  }

  clear() {
    for (const o of this.objs) o.destroy();
    this.objs.length = 0; this.emitters.length = 0; this.follow.length = 0; this.fog.length = 0; this.beams.length = 0;
    this.splash = this.gust = this.veil = undefined;
    this.moods = []; this.flash = 0; this.flashT = -1; this.thunderIn = -1;
  }

  destroy() { this.clear(); }
}
