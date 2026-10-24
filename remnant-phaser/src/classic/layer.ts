// The classic layer: the original game's bosses and foes (../remnant/src) run
// unchanged on top of the Phaser scene. Their engine services come from here:
// `G.world`, `G.camera` and `G.ui` are adapters over the World scene, Elior and
// the HUD, and the vite config hands them stand-ins for sound, music, settings
// and lighting (src/classic/shim). They draw with the original Canvas 2D art
// into one canvas the size of the camera's view at one pixel per world unit,
// the original's pixel-art resolution, which Phaser shows hard-edged.

import Phaser from 'phaser';
import { G } from './shim/ctx';
import { lighting } from './shim/lighting';
import { fx } from '../../../remnant/src/render/fx';
import { glow } from '../../../remnant/src/render/draw';
import { drawPixelBody, bossPixelFrame } from '../../../remnant/src/render/bossPixel';
import { Grid, T, TILE, isSolid } from '../../../remnant/src/game/tiles';
import type { Entity, HitInfo } from '../../../remnant/src/game/entity';
import type { Enemy } from '../../../remnant/src/game/enemies';
import { makeEnemy } from '../../../remnant/src/game/foes';
import type { Blow, FoeLike, WorldApi } from '../game/types';
import type { EnemyKind } from '../shared';

/** Phaser blow force to the original's poise (a light strike is ~10, a full heavy ~34). */
const POISE_PER_FORCE = 14;
const DEPTH = 7;

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What the classic layer needs from the World scene beyond `WorldApi`. */
export interface ClassicHost extends WorldApi {
  player: WorldApi['player'] & {
    face: number;
    state: string;
    shieldT: number;
    vulnerable: boolean;
    body: Phaser.Physics.Arcade.Body;
    rect: Phaser.GameObjects.Rectangle;
  };
  gateClosed: boolean;
  room: { id: string; w: number; h: number; rows: string[] };
  hud: {
    toast(t: string): void;
    banner(t: string, s: string): void;
    bossBar(n: string | null, s?: string): void;
    caption(t: string | null): void;
    cinematicBars(on: boolean): void;
  };
  onClassicBossDefeated(key: string): void;
}

/** Elior as the original modules see him: feet at `y`, a hurtbox, `takeHit`. */
class PlayerView {
  id = -1;
  team = 'player';
  remove = false;
  dying = false;
  veiled = 0;
  readonly bodyView: { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean };
  constructor(private L: ClassicLayer) {
    const p = () => L.host.player;
    this.bodyView = {
      get x() { return p().x; },
      set x(v: number) { const b = p().body; b.x = v - b.width / 2; },
      get y() { return p().feet; },
      set y(v: number) { const b = p().body; b.y = v - b.height; },
      get w() { return p().body.width; },
      get h() { return p().body.height; },
      get vx() { return p().body.velocity.x; },
      set vx(v: number) { p().body.setVelocityX(v); },
      get vy() { return p().body.velocity.y; },
      set vy(v: number) { p().body.setVelocityY(v); },
      get onGround() { return p().body.blocked.down || p().body.touching.down; },
    };
  }
  private get p() { return this.L.host.player; }
  get body() { return this.bodyView; }
  get x() { return this.p.x; }
  set x(v: number) { this.p.body.x = v - this.p.body.width / 2; }
  get y() { return this.p.feet; }
  set y(v: number) { this.p.body.y = v - this.p.body.height; }
  get cx() { return this.p.x; }
  get cy() { return this.p.feet - this.p.body.height / 2; }
  get face() { return this.p.face; }
  get state() { return this.p.dead ? 'dead' : this.p.state; }
  get hp() { return this.p.hp; }
  get maxHp() { return this.p.maxHp; }
  get shieldT() { return this.p.shieldT; }
  hurtbox(): Rect {
    const b = this.p.body;
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  isInvuln() { return !this.p.vulnerable; }
  canBeTargeted() { return !this.p.dead && !G.inCutscene; }
  /** An original blow, as the Phaser Elior takes it. */
  takeHit(h: HitInfo) {
    if (h.kind !== 'hazard' && this.isInvuln() && this.p.shieldT <= 0) return false;
    const src = h.src as (Entity & { parried?(by: unknown): void }) | null | undefined;
    const blow: Blow = {
      dmg: Math.max(1, Math.round(h.dmg * this.L.dmgScale)),
      dir: h.dir,
      ranged: h.kind === 'proj',
      hazard: h.kind === 'hazard',
      unblockable: !!h.unblockable,
      src: src && h.parryable !== false && h.kind !== 'hazard' ? { parried: () => src.parried?.(this) } : undefined,
    };
    const hurt = this.p.hurt(blow);
    if (hurt && !h.noKnock) this.p.body.setVelocity(Math.sign(h.kx || h.dir) * Math.min(220, Math.abs(h.kx)) * 0.6, Math.min(0, h.ky) * 0.5);
    return hurt;
  }
  parried() {}
}

/** A classic foe as Elior's blows see it. */
class FoeView implements FoeLike {
  box = new Phaser.Geom.Rectangle();
  rect = undefined as unknown as Phaser.GameObjects.Rectangle;
  constructor(private L: ClassicLayer, readonly e: Entity) {}
  get removed() { return this.e.remove; }
  get alive() {
    const e = this.e;
    if (e.remove || e.dying || !e.canBeTargeted()) return false;
    const r = e.hurtbox();
    this.box.setTo(r.x, r.y, r.w, r.h);
    return true;
  }
  get x() { return this.e.x; }
  hit(dmg: number, dir: number, force: number, crit = false) {
    return this.e.takeHit({
      dmg, dir, crit, kind: 'melee',
      poise: force * POISE_PER_FORCE,
      kx: dir * 90 * force, ky: -50 * force,
      stop: 0.04 + force * 0.02,
      src: this.L.playerView as unknown as Entity,
    });
  }
  update() {}
  remove() { this.e.remove = true; }
}

export class ClassicLayer {
  ents: Entity[] = [];
  grid!: Grid;
  boss: (Entity & { key?: string; state: string; awaken(): void }) | null = null;
  bossActive = false;
  /** Scales original blows to the Phaser Elior's health (until stats and gear are ported). */
  dmgScale = 1;
  readonly playerView: PlayerView;
  private views = new WeakMap<Entity, FoeView>();
  private foeViews: FoeView[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private slowT = 0;
  private slowScale = 1;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private focusing = false;
  private sorted: Entity[] = [];
  private static n = 0;

  constructor(readonly host: ClassicHost) {
    const sc = host.sc;
    this.playerView = new PlayerView(this);
    const key = `classic-${ClassicLayer.n++}`;
    this.tex = sc.textures.createCanvas(key, 64, 64)!;
    this.canvas = this.tex.getSourceImage() as HTMLCanvasElement;
    this.ctx = this.tex.getContext();
    this.img = sc.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH).setVisible(false);
    // Damage numbers read best in the Phaser build's own float text.
    fx.number = (x: number, y: number, v: number | string, crit = false, color?: string) =>
      host.floatText(x, y, typeof v === 'number' ? String(Math.round(v)) : v, color ?? (crit ? '#ffd23a' : '#ffe6a8'));
    this.bind();
  }

  /** Point `G` at this scene: the world, camera, HUD and save the original modules use. */
  bind() {
    const h = this.host, L = this;
    G.world = this;
    G.save = h.save;
    h.save.defeated ??= [];
    G.renderer = { tier: 2, pixel: true, effects: 0, bw: 0, bh: 0 };
    G.camera = {
      focus: null as { x: number; y: number } | null,
      punch: 0, zoomTarget: 1, viewMultTarget: 1,
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      addTrauma(n: number) { if (n > 0) h.shake(Math.min(0.02, n * 0.012), 120 + n * 380); },
      view() { const v = h.sc.cameras.main.worldView; return { x: v.x, y: v.y, w: v.width, h: v.height }; },
      snapTo() {},
    };
    G.ui = {
      toast: (t: string) => h.hud.toast(t),
      banner: (t: string, s = '') => h.hud.banner(t, s),
      bossBar: (n: string | null, s = '') => h.hud.bossBar(n, s),
      caption: (t: string | null) => h.hud.caption(t),
      cinematicBars: (on: boolean) => h.hud.cinematicBars(on),
      hint: (t: string | null) => { if (t) h.hud.toast(t); },
      prompt() {}, refreshHud() {}, clearAreaBanner() {},
      isBlocking: () => false,
      fade: () => Promise.resolve(),
      dialogue: () => Promise.resolve(0),
      itemGet() {}, levelUp() {},
    };
    void L;
  }

  /** A new room: the grid the original physics walks on (gate cells kept as gates). */
  load() {
    this.clear();
    const r = this.host.room;
    this.grid = new Grid(r.rows);
    G.camera.bounds = { x: 0, y: 0, w: r.w * TILE, h: r.h * TILE };
    G.camera.focus = null;
  }

  clear() {
    this.ents = [];
    this.foeViews = [];
    this.timers = [];
    this.boss = null;
    this.bossActive = false;
    this.slowT = 0;
    this.slowScale = 1;
    G.inCutscene = false;
    fx.clear();
    this.img.setVisible(false);
  }

  get player() { return this.playerView; }
  get room() { return this.host.room; }
  get echoes() { return []; }
  get gateClosed() { return this.host.gateClosed; }
  solid = (t: T) => (t === T.Gate ? this.host.gateClosed : isSolid(t));
  solidAt(x: number, y: number) { return this.solid(this.grid.get(Math.floor(x / TILE), Math.floor(y / TILE))); }

  add<E extends Entity>(e: E) {
    this.ents.push(e);
    return e;
  }
  spawnEnemy(kind: EnemyKind, x: number, y: number, elite: string | null = null) {
    const e = makeEnemy(kind, x, y, elite);
    e.aggro = true;
    return this.add(e);
  }
  after(sec: number, fn: () => void) { this.timers.push({ at: G.time + sec, fn }); }
  hitstop(t: number) { this.host.hitstop(Math.min(0.14, t)); }
  slowmo(t: number, scale: number) {
    this.slowT = Math.max(this.slowT, t);
    this.slowScale = Math.min(this.slowScale < 1 && this.slowT > 0 ? this.slowScale : 1, scale);
  }
  pan(x: number) {
    const v = this.host.sc.cameras.main.worldView;
    return Phaser.Math.Clamp((x - v.centerX) / (v.width * 0.6), -1, 1);
  }
  addRally() {}
  echoBlocks() { return false; }
  healAlliesIn() {}
  breakWalls() { return false; }
  targetFor(en: Entity, range: number) {
    const p = this.playerView;
    if (!p.canBeTargeted()) return null;
    return Math.abs(p.x - en.x) + Math.abs(p.y - en.y) * 0.5 < range ? p : null;
  }
  hitPlayerSide(box: Rect, h: HitInfo, set: Set<number>) {
    const p = this.playerView;
    if (set.has(p.id) || p.state === 'dead' || !overlaps(box, p.hurtbox())) return false;
    set.add(p.id);
    return p.takeHit(h);
  }
  /** Blows from Elior's side (rare in a boss room): any classic foe in the box. */
  hitEnemies(box: Rect, h: HitInfo, set: Set<number>, onHit?: (e: Entity, d: number) => void) {
    let n = 0;
    for (const e of this.ents) {
      if (!e.isFoe || e.dying || e.remove || set.has(e.id) || !overlaps(box, e.hurtbox())) continue;
      set.add(e.id);
      const before = e.hp;
      if (e.takeHit(h)) { n++; onHit?.(e, Math.max(0, before - e.hp)); }
    }
    return n;
  }
  onEnemyKilled(e: Enemy) {
    const st = e.stats;
    this.host.onFoeDied(Math.round(st.xp * (e.elite ? 4 : 1)), Phaser.Math.Between(st.silver[0], st.silver[1]), e.x, e.y - 20);
  }
  onBossDefeated(b: Entity & { key?: string }) {
    this.bossActive = false;
    this.host.onClassicBossDefeated(b.key ?? 'idol');
  }
  /** Tobiah's lamp oil in the Idol fight: the Idol kneels (his walk-on comes with the NPC port). */
  tobiahAssist(idol: Entity & { kneel(): void }) {
    G.ui.caption('Tobiah: "ELIOR! Duck!"');
    this.after(1, () => { idol.kneel(); G.ui.caption('Tobiah: "Lamp oil! The good stuff! NOW, Elior!"'); });
    this.after(4, () => G.ui.caption(null));
  }
  closeGate(on: boolean) { (this.host as unknown as { closeGate(on: boolean): void }).closeGate(on); }

  /** Classic foes, as targets for Elior's blows and skills. */
  foes(): FoeLike[] {
    this.foeViews.length = 0;
    for (const e of this.ents) {
      if (!e.isFoe || e.remove) continue;
      let v = this.views.get(e);
      if (!v) this.views.set(e, (v = new FoeView(this, e)));
      this.foeViews.push(v);
    }
    return this.foeViews;
  }

  /** Anything to run or draw: actors, or effects still fading after them. */
  get active() { return this.ents.length > 0 || fx.ps.length > 0 || fx.rings.length > 0 || fx.arcs.length > 0 || fx.streaks.length > 0 || fx.cols.length > 0 || fx.flashA > 0; }

  update(dtRaw: number) {
    if (!this.active && !this.timers.length) return;
    let dt = dtRaw;
    if (this.slowT > 0) {
      this.slowT -= dtRaw;
      dt *= this.slowScale;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    G.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (G.time >= this.timers[i].at) {
        const t = this.timers[i];
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    lighting.begin();
    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i];
      try { e.update(dt); } catch (err) { this.fault(e, err); }
    }
    for (let i = this.ents.length - 1; i >= 0; i--) if (this.ents[i].remove) this.ents.splice(i, 1);
    if (this.boss?.remove) this.boss = null;
    fx.update(dt);
    this.followFocus();
  }

  /** A boss's intro points the camera at it; Elior's follow resumes after. */
  private followFocus() {
    const cam = this.host.sc.cameras.main, f = G.camera.focus as { x: number; y: number } | null;
    if (f) {
      if (!this.focusing) { cam.stopFollow(); this.focusing = true; }
      const v = cam.worldView;
      cam.scrollX += (f.x - v.centerX) * 0.06;
      cam.scrollY += (f.y - v.centerY) * 0.06;
    } else if (this.focusing) {
      this.focusing = false;
      cam.startFollow(this.host.player.rect, true, 0.14, 0.12, 0, 24);
    }
  }

  /** Draw the classic actors and effects into the view-sized canvas. */
  render() {
    if (!this.active) { this.img.setVisible(false); return; }
    const cam = this.host.sc.cameras.main, v = cam.worldView;
    const w = Math.ceil(v.width) + 2, h = Math.ceil(v.height) + 2;
    if (this.canvas.width !== w || this.canvas.height !== h) this.tex.setSize(w, h);
    const ox = Math.floor(v.x), oy = Math.floor(v.y), c = this.ctx;
    G.renderer.bw = w;
    G.renderer.bh = h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.setTransform(1, 0, 0, 1, -ox, -oy);
    bossPixelFrame();
    fx.drawBack(c);
    const sorted = this.sorted;
    sorted.length = 0;
    for (const e of this.ents) sorted.push(e);
    sorted.sort((a, b) => a.layer - b.layer);
    for (const e of sorted) {
      try {
        e.lights?.();
        if ((e as { pixelShade?: boolean }).pixelShade && drawPixelBody(c, e as Parameters<typeof drawPixelBody>[1])) continue;
        e.draw(c);
      } catch (err) { this.fault(e, err); }
    }
    for (const e of sorted) try { e.drawOverlay?.(c); } catch (err) { this.fault(e, err); }
    c.globalCompositeOperation = 'lighter';
    for (const l of lighting.lights) if (l.bloom > 0) glow(c, l.x, l.y, l.r * 0.8, l.c, Math.min(1, l.a * l.bloom * 0.5));
    c.globalCompositeOperation = 'source-over';
    fx.drawAdd(c);
    // The screen flash the original lays over everything (parries, big impacts).
    if (fx.flashA > 0.01) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = Math.min(0.6, fx.flashA);
      c.fillStyle = fx.flashC;
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
    }
    this.tex.refresh();
    this.img.setPosition(ox, oy).setVisible(true);
  }

  /** One actor's fault is reported once and never stops the frame (or the rest of the room). */
  private faults = new Set<string>();
  private fault(e: Entity, err: unknown) {
    const msg = `${e.constructor.name}: ${(err as Error)?.message ?? err}`;
    if (this.faults.has(msg)) return;
    this.faults.add(msg);
    console.error('classic actor fault', msg, (err as Error)?.stack);
  }

  destroy() {
    this.clear();
    this.img.destroy();
    this.tex.destroy();
  }
}
