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
import { Atmosphere } from './atmosphere';
import { ScreenFx } from './screenFx';
import type { World } from '../scenes/World';
import type { SkillId } from './abilities';

/** A projectile an ability spawned, as far as its art needs to know. */
interface Carrier { x: number; y: number; life: number; maxLife: number; remove: boolean }
/**
 * Each Covenant ability's row in the art drop (V03 → sheet 1, V04 → sheet 2), where it
 * plays and how long. `on` follows a projectile; `hold` loops the middle frames while a
 * state lasts. Chain Snare keeps its drawn chain: its generated row lashes the wrong way.
 */
const ABILITY_ART: Partial<Record<SkillId, { sheet: 1 | 2; row: number; dur: number; scale: number; at: 'body' | 'feet' | 'carrier'; hold?: 'shieldT'; alpha?: number }>> = {
  sword_word: { sheet: 1, row: 0, dur: 0.75, scale: 0.55, at: 'carrier' },
  trumpet: { sheet: 1, row: 1, dur: 0.5, scale: 1, at: 'body', alpha: 0.85 },
  shield_faith: { sheet: 1, row: 2, dur: 0.5, scale: 0.6, at: 'feet', hold: 'shieldT' },
  lion: { sheet: 1, row: 3, dur: 0.8, scale: 0.62, at: 'feet' },
  // Long or bright effects stay below full strength, so stacked casts don't blow out to white.
  still_waters: { sheet: 1, row: 4, dur: 6, scale: 0.85, at: 'carrier', alpha: 0.6 },
  pillar_fire: { sheet: 1, row: 5, dur: 1.6, scale: 1.2, at: 'carrier' },
  chains: { sheet: 2, row: 0, dur: 0.6, scale: 0.75, at: 'body' },
  armor_light: { sheet: 2, row: 1, dur: 0.85, scale: 0.6, at: 'feet', alpha: 0.75 },
  blink_strike: { sheet: 2, row: 3, dur: 0.45, scale: 0.6, at: 'body' },
  mending_light: { sheet: 2, row: 4, dur: 1.1, scale: 0.55, at: 'feet' },
  frost_ring: { sheet: 2, row: 5, dur: 0.7, scale: 1.25, at: 'feet', alpha: 0.85 },
};

const COLORS = Object.fromEntries(Object.entries(ELEMENTS).map(([id, e]) => [id, parseInt(e.c.slice(1), 16)])) as Record<Element, number>;
const MAP_SIZE = 64;
let nextId = 0;

export class Visuals {
  readonly bossCamera: BossCamera;
  readonly atmosphere: Atmosphere;
  readonly screen: ScreenFx;
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
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeFront: Phaser.GameObjects.Particles.ParticleEmitter;
  private crown: Phaser.GameObjects.Graphics;
  /** Impact bursts (V02 sheet), pooled and stepped here so they freeze with the fight. */
  private bursts: { img: Phaser.GameObjects.Image; t: number; row: number }[];
  /** Ability effects in flight (V03/V04 sheets). */
  /** The transformation forming (V06): the Mantle's shadow, or the Wings' dawn. */
  private forming: Phaser.GameObjects.Image;
  private formT = -1;
  private casts: { img: Phaser.GameObjects.Image; t: number; id: SkillId; carrier: Carrier | null; face: number; end: number }[];
  private mantled = false;
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
    this.atmosphere = new Atmosphere(w);
    this.light = w.add.image(0, 0, 'glow').setDepth(8).setTint(0xa04bf5).setDisplaySize(96, 116).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.weaponLight = w.add.image(0, 0, 'glow').setDepth(11).setDisplaySize(25, 38).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.sparks = w.add.particles(0, 0, 'vfx-spark', { emitting: false, maxParticles: 80, lifespan: { min: 180, max: 420 }, speedX: { min: -95, max: 95 }, speedY: { min: -110, max: 30 }, gravityY: 190, scale: { start: 0.65, end: 0 }, alpha: { start: 0.85, end: 0 }, blendMode: 'ADD' }).setDepth(16);
    this.wisps = w.add.particles(0, 0, 'glow', { emitting: false, maxParticles: 36, lifespan: 800, speedX: { min: -14, max: 14 }, speedY: { min: -42, max: -18 }, scale: { start: 0.1, end: 0 }, alpha: { start: 0.42, end: 0 }, tint: [0xa64dff, 0xe2b5ff], blendMode: 'ADD' }).setDepth(9);
    this.smoke = w.add.particles(0,0,'vfx-smoke',{emitting:false,maxParticles:48,lifespan:1100,speedX:{min:-18,max:18},speedY:{min:-38,max:-16},scale:{start:0.2,end:0.7},alpha:{start:0.65,end:0},rotate:{min:-80,max:80},tint:[0x281035,0x4d156d,0x8134a8]}).setDepth(9);
    this.smokeFront = w.add.particles(0,0,'vfx-smoke',{emitting:false,maxParticles:24,lifespan:850,speedX:{min:-12,max:12},speedY:{min:-32,max:-14},scale:{start:0.14,end:0.48},alpha:{start:0.27,end:0},tint:[0x9346c5,0xbf6ee8]}).setDepth(10.5);
    this.crown = w.add.graphics().setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD);
    this.forming = w.add.image(0, 0, 'vfx-transform', 0).setDepth(15.2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.casts = Array.from({ length: 4 }, () => ({ img: w.add.image(0, 0, 'vfx-abilities-1', 0).setDepth(15.4).setBlendMode(Phaser.BlendModes.ADD).setVisible(false), t: -1, id: 'trumpet' as SkillId, carrier: null, face: 1, end: -1 }));
    this.bursts = Array.from({ length: 8 }, () => ({ img: w.add.image(0, 0, 'vfx-impacts', 0).setDepth(15.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false), t: -1, row: 0 }));
    this.bubbles = w.add.particles(0, 0, 'vfx-bubble', { emitting: false, maxParticles: 20, lifespan: 650, speedX: { min: -7, max: 7 }, speedY: { min: -42, max: -25 }, scale: { start: 0.5, end: 0.2 }, alpha: { start: 0.45, end: 0 } }).setDepth(17);
    if (this.gpu) {
      this.map = w.textures.createCanvas(this.key, MAP_SIZE, MAP_SIZE)!;
      this.map.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.pixels = this.map.getContext().createImageData(MAP_SIZE, MAP_SIZE);
      this.displacement = w.cameras.main.filters.internal.addDisplacement(this.key, 0, 0);
      this.displacement.active = false;
    }
    this.screen = new ScreenFx(w, this.gpu);
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
    // Bake a soft uneven puff once; no blur or per-frame canvas uploads.
    const smoke=make('vfx-smoke',64,64),p=smoke.getContext();
    for(let i=0;i<5;i++) {
      const x=32+Math.sin(i*2.4)*11,y=32+Math.cos(i*2.4)*9,r=16+i%3*3;
      const g=p.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#ffffffbb');g.addColorStop(0.45,'#ffffff66');g.addColorStop(1,'#ffffff00');p.fillStyle=g;p.fillRect(x-r,y-r,r*2,r*2);
    }
    smoke.refresh();
  }

  clear() {
    const p = this.w.player;
    if (this.heroGlow && p?.sprite.active) p.sprite.filters?.internal.remove(this.heroGlow);
    if (this.bladeGlow && p?.slash.active) p.slash.filters?.internal.remove(this.bladeGlow);
    for (const e of this.weather) e.destroy(); this.weather.length = 0;
    this.atmosphere.clear();
    for (const e of [this.sparks, this.wisps, this.smoke, this.smokeFront, this.bubbles]) { e.killAll(); e.resume(); }
    this.crown.clear();this.mantled=false;
    for (const b of this.bursts) { b.t = -1; b.img.setVisible(false); }
    for (const c of this.casts) { c.t = -1; c.carrier = null; c.img.setVisible(false); }
    this.formT = -1; this.forming.setVisible(false);
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
      this.heroGlow = p.sprite.filters!.internal.addGlow(0xa34bdf, 2, 0, 1, false, 0.08, 6);
      this.bladeGlow = p.slash.filters!.internal.addGlow(0xffffff, 2, 0, 1, false, 0.08, 5);
      this.heroGlow.setPaddingOverride(null); this.bladeGlow.setPaddingOverride(null);
      this.heroGlow.active = this.bladeGlow.active = false;
    }
    this.applyQuality();
    this.screen.room(this.w.room.biome);
  }

  private applyQuality() {
    const quality = settings.quality;
    this.tier = quality === 'low' ? 0 : quality === 'medium' ? 1 : quality === 'auto' ? Math.max(0, 2 - FrameBudget.effects(this.budget.level)) : 2;
    if (this.appliedTier === this.tier && this.flashes === settings.reduceFlashes) return;
    this.appliedTier = this.tier; this.flashes = settings.reduceFlashes;
    if (this.tier === 0 || settings.reduceFlashes) { if (this.displacement) this.displacement.active = false; this.distortion = 'none'; }
    for (const e of this.weather) e.destroy(); this.weather.length = 0;
    this.atmosphere.build(this.tier);
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
    this.burst(x, y, crit ? 1 : 0, heavy);
    this.sparks.setParticleTint(this.element ? COLORS[this.element] : 0xffd27a);
    this.sparks.emitParticleAt(x, y, this.tier === 0 ? 2 : heavy || crit ? 12 : 5);
  }

  /** One burst: 0 hit, 1 crit, 2 guard break, 3 parry. Light hits are smaller; low quality keeps only the big ones. */
  burst(x: number, y: number, row: number, heavy = false) {
    if (this.tier === 0 && row === 0 && !heavy) return;
    const b = this.bursts.find((o) => o.t < 0) ?? this.bursts.reduce((a, o) => (o.t > a.t ? o : a));
    const size = row === 0 ? (heavy ? 0.48 : 0.34) : row === 3 ? 0.5 : 0.46;
    b.t = 0; b.row = row;
    b.img.setFrame(row * 6).setPosition(x, y).setScale(size).setAngle(row === 3 ? 0 : Math.random() * 360).setAlpha(settings.reduceFlashes ? 0.55 : 1)
      .setTint(this.element && row === 0 ? COLORS[this.element] : 0xffffff).setVisible(true);
  }

  /** Play an ability's art: at Elior, at his feet, or riding the projectile it made. */
  ability(id: SkillId, carrier: Carrier | null) {
    const a = ABILITY_ART[id];
    if (!a || (a.at === 'carrier' && !carrier)) return;
    const c = this.casts.find((o) => o.t < 0) ?? this.casts.reduce((x, o) => (o.t > x.t ? o : x));
    c.t = 0; c.id = id; c.end = -1; c.face = this.w.player.face;
    c.carrier = a.at === 'carrier' ? carrier : null;
    c.img.setTexture('vfx-abilities-' + a.sheet, a.row * 8).setScale(a.scale).setAlpha((a.alpha ?? 1) * (settings.reduceFlashes ? 0.6 : 1))
      .setOrigin(0.5, a.at === 'body' ? 0.5 : 0.82).setFlipX(c.face < 0).setVisible(true);
    this.placeCast(c);
  }

  private placeCast(c: Visuals['casts'][number]) {
    const p = this.w.player, a = ABILITY_ART[c.id]!;
    if (c.carrier) c.img.setPosition(c.carrier.x, a.row === 0 ? c.carrier.y : c.carrier.y + 4);
    else c.img.setPosition(p.x, a.at === 'body' ? p.feet - 26 : p.feet + 4);
  }

  /** Frames follow the carrier's life, or the effect's own length; Shield of Faith shimmers while it holds, then breaks. */
  private stepCasts(dt: number) {
    const shield = this.w.player.shieldT > 0;
    for (const c of this.casts) {
      if (c.t < 0) continue;
      const a = ABILITY_ART[c.id]!;
      c.t += dt;
      let u = c.carrier ? 1 - c.carrier.life / Math.max(0.01, c.carrier.maxLife) : c.t / a.dur;
      if (a.hold) {
        if (c.t < 0.18) u = (c.t / 0.18) * 0.375;
        else if (shield && c.end < 0) u = 0.375 + (Math.floor(c.t * 10) % 2) * 0.125;
        else { if (c.end < 0) c.end = c.t; u = 0.625 + ((c.t - c.end) / 0.22) * 0.375; }
      }
      if (u >= 1 || c.carrier?.remove) { c.t = -1; c.carrier = null; c.img.setVisible(false); continue; }
      c.img.setFrame(a.row * 8 + Math.min(7, Math.floor(u * 8)));
      this.placeCast(c);
    }
  }

  /** Sixteen frames of the form gathering across the transformation (1.15 s), Mantle or Wings. */
  private stepForming(dt: number, dawn: boolean) {
    const p = this.w.player;
    if (p.state !== 'transform' || p.dead) { if (this.formT >= 0) { this.formT = -1; this.forming.setVisible(false); } return; }
    this.formT = Math.max(0, this.formT) + dt;
    const f = Math.min(15, Math.floor((this.formT / 1.15) * 16));
    this.forming.setFrame((dawn ? 16 : 0) + f).setPosition(p.x, p.feet - 30).setScale(0.62).setAlpha(settings.reduceFlashes ? 0.55 : 1).setVisible(true);
  }

  private stepBursts(dt: number) {
    for (const b of this.bursts) {
      if (b.t < 0) continue;
      b.t += dt;
      const f = Math.floor(b.t / 0.045);
      if (f >= 6) { b.t = -1; b.img.setVisible(false); } else b.img.setFrame(b.row * 6 + f);
    }
  }

  private update(_time: number, delta: number) {
    const w = this.w, p = w.player;
    if (!p?.sprite.active || !w.room) return;
    this.applyQuality();
    const held = w.hud.paused || G.paused || w.hud.wheelOpen || blockingUI() || !!topLayer();
    if (held !== this.paused) {
      this.paused = held;
      for (const e of [this.sparks, this.wisps, this.smoke, this.smokeFront, this.bubbles, ...this.weather]) held ? e.pause() : e.resume();
      this.atmosphere.pause(held);
    }
    if (held) { this.budget.reset(); return; }
    const dt = Math.min(delta / 1000, 0.05);
    this.stepBursts(dt);
    this.stepCasts(dt);
    if (delta > 200) this.budget.reset();
    else if (settings.quality === 'auto' && !G.inCutscene) this.budget.sample(delta / 1000, 0, settings.fps === '60');
    this.applyQuality();
    const v = w.cameras.main.worldView;
    for (const e of this.weather) e.setPosition(v.centerX, v.y);
    this.atmosphere.step(dt, v);
    this.screen.step(dt, v, this.tier, { letterbox: w.hud.letterbox ?? 0, intro: this.bossCamera.mode === 'intro', submerged: !!p.water?.submerged, form: !p.dead && (p.mantleT > 0 || p.state === 'transform') });
    this.element = weaponElement();
    const mantle = !p.dead && (p.mantleT > 0 || p.state === 'transform');
    // Tirzah's Wings of the Morning share the Mantle's timer but are dawn light: no smoke, no crown.
    const dawn = p.hero === 'tirzah';
    const visible=mantle&&p.sprite.visible&&!dawn;
    this.smoke.setVisible(visible);this.smokeFront.setVisible(visible);
    this.stepForming(dt, dawn);
    if(mantle&&!this.mantled&&!dawn) {this.smoke.emitParticleAt(p.x,p.feet-12,this.tier===0||settings.reduceFlashes?3:12);this.tick=0;}
    else if(!mantle&&this.mantled) {this.smoke.killAll();this.smokeFront.killAll();this.wisps.killAll();}
    this.mantled=mantle;
    const crown=this.crown.clear();
    if(visible) {
      const y=p.feet-54;crown.lineStyle(1,0xcd8bff,settings.reduceFlashes?0.35:0.6).strokeEllipse(p.x,y,23,7);
      for(let i=-1;i<=1;i++)crown.lineBetween(p.x+i*7,y-3,p.x+i*8,y-7-(i===0?3:0));
    }
    const color = this.element ? COLORS[this.element] : 0xffffff;
    const pulse = settings.reduceFlashes ? 0.2 : 0.26 + Math.sin(G.time * 3) * 0.035;
    this.light.setVisible(mantle && p.sprite.visible).setPosition(p.x, p.y).setAlpha(pulse).setTint(dawn ? 0xffc96a : 0xa04bf5);
    this.weaponLight.setVisible(!!this.element && !p.dead && p.sprite.visible).setTint(color).setPosition(p.x + p.face * 12, p.feet - 24).setAlpha(settings.reduceFlashes ? 0.12 : 0.2);
    if (this.element && p.slash.visible) p.slash.setTint(color);
    if (this.heroGlow) { this.heroGlow.active = mantle && this.tier > 0; this.heroGlow.color = dawn ? 0xffd27a : 0xa34bdf; this.heroGlow.outerStrength = settings.reduceFlashes ? 1 : 1.8 + Math.sin(G.time * 3) * 0.25; }
    if (this.bladeGlow) { this.bladeGlow.active = !!this.element && p.slash.visible && this.tier > 0; this.bladeGlow.color = color; }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = this.tier === 0 ? 0.25 : 0.09;
      if(visible) {
        const x=p.x+Math.sin(G.time*4)*10;this.smoke.emitParticleAt(x,p.feet-8,this.tier===0?1:2);
        if(this.tier>0&&!settings.reduceFlashes)this.smokeFront.emitParticleAt(2*p.x-x,p.feet-12,1);
        this.wisps.emitParticleAt(x,p.feet-18,this.tier===0?1:2);
      }
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
    this.atmosphere.destroy();
    this.screen.destroy();
    // Phaser may already have disposed the camera before this shutdown hook.
    const cam = this.w.cameras.main;
    if (this.displacement && cam) cam.filters.internal.remove(this.displacement);
    for (const o of [this.light, this.weaponLight, this.sparks, this.wisps, this.smoke, this.smokeFront, this.crown, this.bubbles]) o.destroy();
    for (const b of this.bursts) b.img.destroy();
    for (const c of this.casts) c.img.destroy();
    this.forming.destroy();
    if (this.map) this.w.textures.remove(this.key);
  }
}
