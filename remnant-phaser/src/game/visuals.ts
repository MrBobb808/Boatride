// Phaser presentation only: no damage, movement or save-state effects.
import Phaser from 'phaser';
import { T, TILE } from '../shared';
import { G } from '../classic/shim/ctx';
import { settings } from '../classic/shim/settings';
import { ELEMENTS, weaponElement, type Element } from '../../../remnant/src/game/power';
import { FrameBudget } from '../../../remnant/src/core/frameBudget';
import { blockingUI } from '../../../remnant/src/ui/ui';
import { topLayer } from '../../../remnant/src/ui/dom';
import { BossCamera } from './bossCamera';
import type { World } from '../scenes/World';

const COLORS = Object.fromEntries(Object.entries(ELEMENTS).map(([id, e]) => [id, parseInt(e.c.slice(1), 16)])) as Record<Element, number>;
const MAP_SIZE = 64;
let nextId = 0;

export class Visuals {
  readonly bossCamera: BossCamera;
  readonly gpu: boolean;
  readonly budget = new FrameBudget();
  element: Element | null = null;
  distortion: 'none' | 'water' | 'heat' = 'none';
  tier = 2;
  private map?: Phaser.Textures.CanvasTexture;
  private pixels?: ImageData;
  private displacement?: Phaser.Filters.Displacement;
  private heroGlow?: Phaser.Filters.Glow;
  private bladeGlow?: Phaser.Filters.Glow;
  private light: Phaser.GameObjects.Image;
  private weaponLight: Phaser.GameObjects.Image;
  private weather: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private wisps: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubbles: Phaser.GameObjects.Particles.ParticleEmitter;
  private appliedTier = -1;
  private flashes = false;
  private tick = 0;
  private mapT = 0;
  private paused = false;
  private hot = false;
  private wet = false;
  private key = `vfx-distortion-${nextId++}`;

  constructor(private w: World) {
    this.gpu = w.game.renderer.type === Phaser.WEBGL;
    this.bossCamera = new BossCamera(w);
    this.textures();
    this.light = w.add.image(0, 0, 'glow').setDepth(8).setTint(0x7654ff).setDisplaySize(72, 90).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.weaponLight = w.add.image(0, 0, 'glow').setDepth(11).setDisplaySize(25, 38).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.sparks = w.add.particles(0, 0, 'vfx-spark', { emitting: false, maxParticles: 80, lifespan: { min: 180, max: 420 }, speedX: { min: -95, max: 95 }, speedY: { min: -110, max: 30 }, gravityY: 190, scale: { start: 0.65, end: 0 }, alpha: { start: 0.85, end: 0 }, blendMode: 'ADD' }).setDepth(16);
    this.wisps = w.add.particles(0, 0, 'glow', { emitting: false, maxParticles: 36, lifespan: 650, speedX: { min: -12, max: 12 }, speedY: { min: -36, max: -16 }, scale: { start: 0.09, end: 0 }, alpha: { start: 0.4, end: 0 }, tint: [0x7850ff, 0xb3a4ff], blendMode: 'ADD' }).setDepth(9);
    this.bubbles = w.add.particles(0, 0, 'vfx-bubble', { emitting: false, maxParticles: 20, lifespan: 650, speedX: { min: -7, max: 7 }, speedY: { min: -42, max: -25 }, scale: { start: 0.5, end: 0.2 }, alpha: { start: 0.45, end: 0 } }).setDepth(17);
    if (this.gpu) {
      this.map = w.textures.createCanvas(this.key, MAP_SIZE, MAP_SIZE)!;
      this.map.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.pixels = this.map.getContext().createImageData(MAP_SIZE, MAP_SIZE);
      this.displacement = w.cameras.main.filters.internal.addDisplacement(this.key, 0, 0);
      this.displacement.active = false;
    }
    w.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    w.scale.on('resize', this.resized, this);
  }

  private resized() { this.appliedTier = -1; }

  private textures() {
    if (this.w.textures.exists('vfx-spark')) return;
    const make = (key: string, width: number, height: number) => this.w.textures.createCanvas(key, width, height)!;
    const spark = make('vfx-spark', 8, 8), s = spark.getContext();
    s.fillStyle = '#fff8dc'; s.fillRect(3, 0, 2, 8); s.fillRect(0, 3, 8, 2); spark.refresh();
    const drop = make('vfx-rain', 3, 24), d = drop.getContext();
    const grad = d.createLinearGradient(0, 0, 0, 24); grad.addColorStop(0, '#c5e7ff00'); grad.addColorStop(1, '#c5e7ff'); d.fillStyle = grad; d.fillRect(1, 0, 1, 24); drop.refresh();
    const bubble = make('vfx-bubble', 8, 8), c = bubble.getContext();
    c.strokeStyle = '#bdeeff'; c.lineWidth = 1; c.beginPath(); c.arc(4, 4, 2.5, 0, Math.PI * 2); c.stroke(); bubble.refresh();
  }

  clear() {
    const p = this.w.player;
    if (this.heroGlow && p?.sprite.active) p.sprite.filters?.internal.remove(this.heroGlow);
    if (this.bladeGlow && p?.slash.active) p.slash.filters?.internal.remove(this.bladeGlow);
    for (const e of this.weather) e.destroy(); this.weather.length = 0;
    for (const e of [this.sparks, this.wisps, this.bubbles]) { e.killAll(); e.resume(); }
    this.paused = false;
    this.light.setVisible(false); this.weaponLight.setVisible(false);
    if (this.displacement) this.displacement.active = false;
    this.heroGlow = this.bladeGlow = undefined;
    this.element = null; this.distortion = 'none';
    this.bossCamera.reset(); this.budget.reset(); this.appliedTier = -1; this.mapT = this.tick = 0;
  }

  load() {
    const p = this.w.player;
    this.hot = ['cinders', 'furnace'].includes(this.w.room.biome);
    this.wet = this.w.classic.grid.t.includes(T.Water);
    if (this.gpu) {
      p.sprite.enableFilters(); p.slash.enableFilters();
      this.heroGlow = p.sprite.filters!.internal.addGlow(0x8050ff, 2, 0, 1, false, 0.08, 6);
      this.bladeGlow = p.slash.filters!.internal.addGlow(0xffffff, 2, 0, 1, false, 0.08, 5);
      this.heroGlow.setPaddingOverride(null); this.bladeGlow.setPaddingOverride(null);
      this.heroGlow.active = this.bladeGlow.active = false;
    }
    this.applyQuality();
  }

  private applyQuality() {
    const quality = settings.quality;
    this.tier = quality === 'low' ? 0 : quality === 'medium' ? 1 : quality === 'auto' ? Math.max(0, 2 - FrameBudget.effects(this.budget.level)) : 2;
    if (this.appliedTier === this.tier && this.flashes === settings.reduceFlashes) return;
    this.appliedTier = this.tier; this.flashes = settings.reduceFlashes;
    if (this.tier === 0 || settings.reduceFlashes) { if (this.displacement) this.displacement.active = false; this.distortion = 'none'; }
    for (const e of this.weather) e.destroy(); this.weather.length = 0;
    const weather = this.w.room.weather;
    if (!weather) return;
    const rain = weather === 'rain' || weather === 'drips', ember = weather === 'embers';
    const width = Math.max(400, this.w.scale.width / this.w.baseZoom);
    const layers = this.tier === 0 || weather === 'drips' ? 1 : 2;
    for (let i = 0; i < layers; i++) {
      const near = i === 1, factor = this.tier === 0 ? 3 : this.tier === 1 ? 1.6 : 1;
      const e = this.w.add.particles(0, 0, rain ? 'vfx-rain' : 'glow', {
        x: { min: -width * 0.65, max: width * 0.65 }, y: rain ? -30 : { min: -10, max: 260 },
        lifespan: rain ? 1400 : 3200, frequency: (rain ? near ? 45 : 28 : near ? 180 : 140) * factor,
        maxParticles: this.tier === 0 ? 24 : near ? 48 : 80,
        speedY: rain ? near ? 400 : 270 : ember ? { min: -30, max: -10 } : { min: -5, max: 15 },
        speedX: rain ? -45 : { min: -15, max: 8 }, angle: rain ? 8 : 0,
        scale: rain ? near ? 0.65 : 0.4 : { start: near ? 0.045 : 0.025, end: 0 },
        alpha: { start: rain ? near ? 0.34 : 0.19 : ember ? 0.55 : 0.25, end: 0 },
        tint: rain ? 0xa9d5ff : ember ? [0xff7a37, 0xffc178, 0xdd5f39] : weather === 'ash' ? [0xbec4d0, 0x8c94a5] : 0xb8c59f,
        blendMode: ember ? 'ADD' : 'NORMAL',
      }).setDepth(near ? 17 : 4);
      if (this.paused) e.pause();
      this.weather.push(e);
    }
  }

  impact(x: number, y: number, heavy: boolean, crit: boolean) {
    if (this.paused) return;
    this.sparks.setParticleTint(this.element ? COLORS[this.element] : 0xffd27a);
    this.sparks.emitParticleAt(x, y, this.tier === 0 ? 2 : heavy || crit ? 12 : 5);
  }

  private update(_time: number, delta: number) {
    const w = this.w, p = w.player;
    if (!p?.sprite.active || !w.room) return;
    this.applyQuality();
    const held = w.hud.paused || G.paused || w.hud.wheelOpen || blockingUI() || !!topLayer();
    if (held !== this.paused) {
      this.paused = held;
      for (const e of [this.sparks, this.wisps, this.bubbles, ...this.weather]) held ? e.pause() : e.resume();
    }
    if (held) { this.budget.reset(); return; }
    const dt = Math.min(delta / 1000, 0.05);
    if (delta > 200) this.budget.reset();
    else if (settings.quality === 'auto' && !G.inCutscene) this.budget.sample(delta / 1000, 0, settings.fps === '60');
    this.applyQuality();
    const v = w.cameras.main.worldView;
    for (const e of this.weather) e.setPosition(v.centerX, v.y);
    this.element = weaponElement();
    const mantle = !p.dead && (p.mantleT > 0 || p.state === 'transform');
    const color = this.element ? COLORS[this.element] : 0xffffff;
    const pulse = settings.reduceFlashes ? 0.18 : 0.21 + Math.sin(G.time * 3) * 0.04;
    this.light.setVisible(mantle && p.sprite.visible).setPosition(p.x, p.y).setAlpha(pulse);
    this.weaponLight.setVisible(!!this.element && !p.dead && p.sprite.visible).setTint(color).setPosition(p.x + p.face * 12, p.feet - 24).setAlpha(settings.reduceFlashes ? 0.12 : 0.2);
    if (this.element && p.slash.visible) p.slash.setTint(color);
    if (this.heroGlow) { this.heroGlow.active = mantle && this.tier > 0; this.heroGlow.outerStrength = settings.reduceFlashes ? 1 : 1.8 + Math.sin(G.time * 3) * 0.25; }
    if (this.bladeGlow) { this.bladeGlow.active = !!this.element && p.slash.visible && this.tier > 0; this.bladeGlow.color = color; }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = this.tier === 0 ? 0.25 : 0.09;
      if (mantle && p.sprite.visible) this.wisps.emitParticleAt(p.x + Math.sin(G.time * 7) * 11, p.feet - 12, this.tier === 0 ? 1 : 2);
      if (p.water.submerged) this.bubbles.emitParticleAt(p.x + p.face * 4, p.feet - 32, 1);
    }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = this.tier === 2 ? 1 / 20 : 1 / 12; this.updateDistortion(); }
  }

  private updateDistortion() {
    const f = this.displacement, map = this.map, image = this.pixels;
    this.distortion = 'none';
    if (!f || !map || !image) return;
    f.active = false;
    if (this.tier === 0 || settings.reduceFlashes || !this.hot && !this.wet) return;
    const w = this.w, v = w.cameras.main.worldView, data = image.data;
    let water = false, heat = false;
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
      const wx = v.x + x / (MAP_SIZE - 1) * v.width, wy = v.y + y / (MAP_SIZE - 1) * v.height;
      const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE), tile = w.tileAt(tx, ty);
      const wet = this.wet && tile === T.Water;
      let hot = false;
      if (this.hot && tile === T.Empty) for (let n = 1; n <= 5; n++) if (w.tileAt(tx, ty + n) === T.Veil) { hot = true; break; }
      const at = (y * MAP_SIZE + x) * 4;
      const wave = wet ? Math.sin(wy * 0.1 + G.time * 2.6) * 0.65 + Math.sin(wx * 0.065 - G.time * 1.7) * 0.3 : hot ? Math.sin(wy * 0.16 - G.time * 5 + Math.sin(wx * 0.04)) * 0.72 : 0;
      data[at] = 128 + Math.round(wave * 95); data[at + 1] = 128 + (wet ? Math.round(Math.cos(wx * 0.08 + G.time * 2) * 34) : 0); data[at + 2] = 128; data[at + 3] = 255;
      water ||= wet; heat ||= hot;
    }
    if (!water && !heat) return;
    map.getContext().putImageData(image, 0, 0); map.refresh(); f.setTexture(this.key);
    f.x = (this.tier === 2 ? 0.005 : 0.003); f.y = water ? 0.003 : 0;
    f.active = true; this.distortion = water ? 'water' : 'heat';
  }

  destroy() {
    this.w.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    this.w.scale.off('resize', this.resized, this);
    for (const e of this.weather) e.destroy(); this.weather.length = 0;
    // Phaser may already have disposed the camera before this shutdown hook.
    const cam = this.w.cameras.main;
    if (this.displacement && cam) cam.filters.internal.remove(this.displacement);
    for (const o of [this.light, this.weaponLight, this.sparks, this.wisps, this.bubbles]) o.destroy();
    if (this.map) this.w.textures.remove(this.key);
  }
}
