// The classic layer: the original game's bosses and foes (../remnant/src) run
// unchanged on top of the Phaser scene. Their engine services come from here:
// `G.world`, `G.camera` and `G.ui` are adapters over the World scene, Elior and
// the HUD, and the vite config hands them stand-ins for sound, music, settings
// and lighting (src/classic/shim). They draw with the original Canvas 2D art
// into one canvas the size of the camera's view at one pixel per world unit,
// the original's pixel-art resolution, which Phaser shows hard-edged.

import Phaser from 'phaser';
import { GAME_PACE } from '../game/pace';
import { activeSlot, selectSlot } from '../game/save';
import { offlineStatusText } from '../game/update';
import { G, flag } from './shim/ctx';
import { settings, shakeScale } from './shim/settings';
import { lighting } from './shim/lighting';
import { input } from './shim/input';
import { Squad } from './squad';
import { bodyFits } from '../../../remnant/src/game/physics';
import { fx } from '../../../remnant/src/render/fx';
import { ArtFx } from '../game/artFx';
import { glow } from '../../../remnant/src/render/draw';
import { drawPixelBody, bossPixelFrame } from '../../../remnant/src/render/bossPixel';
import { Grid, T, TILE, isSolid } from '../../../remnant/src/game/tiles';
import { Entity, type HitInfo } from '../../../remnant/src/game/entity';
import { Enemy } from '../../../remnant/src/game/enemies';
import { makeEnemy } from '../../../remnant/src/game/foes';

// Tirzah's arrows interrupt a wind-up: note when a drawn foe last flashed its telegraph glint.
const glint = Enemy.prototype.glint;
Enemy.prototype.glint = function (this: Enemy & { glintAt?: number }, ...args: Parameters<typeof glint>) { this.glintAt = G.time; return glint.apply(this, args); };
import { drawFoeSprite } from '../../../remnant/src/render/creatureSprites';
import { chapterCurve } from '../../../remnant/src/game/curve';
import type { Blow, FoeLike, WorldApi } from '../game/types';
import type { EnemyKind } from '../shared';
import type { Player } from '../game/player';
import { HeroPowers } from './hero';
import { tickStatus } from '../../../remnant/src/game/power';
import { Proj } from '../../../remnant/src/game/projectiles';
import { Story } from '../../../remnant/src/game/story';
import { initUI, hooks } from '../../../remnant/src/ui/ui';
import { closeMenu } from '../../../remnant/src/ui/menus';
import { h as el, btn } from '../../../remnant/src/ui/dom';
import { installNav } from '../../../remnant/src/ui/dom';
import { mantleStyle } from '../../../remnant/src/game/mantle';
import { ELEMENTS } from '../../../remnant/src/game/power';
import { ITEMS, RARITY_COLORS } from '../../../remnant/src/game/data';
import type { HumanStyle } from '../../../remnant/src/render/actors';
import { rollGear } from '../../../remnant/src/game/loot';
import { WeaponPractice } from '../../../remnant/src/game/progression';
import { sfx } from './shim/audio';
import { migrateSave, getItem, makeItem, absorbEcho } from '../../../remnant/src/game/state';
import { Chest, LoreStone, Shrine, Altar, Drop, Pickup, Npc, RelicVisual } from '../../../remnant/src/game/props';
import { syncRest } from '../../../remnant/src/game/settlement';
import { runBlessings } from '../../../remnant/src/game/blessings';
import { valorTrack } from '../../../remnant/src/game/valor';
import { muffleWater } from '../../../remnant/src/game/swim';
import { updateWater, drawWaterFront } from '../../../remnant/src/render/underwater';
import { prepareWater } from '../../../remnant/src/game/water';
import type { Loot, EntDef } from '../../../remnant/src/game/tiles';
import { BASE_POSE } from '../../../remnant/src/render/skeleton';
import type { Visuals } from '../game/visuals';

/** Phaser blow force to the original's poise (a light strike is ~10, a full heavy ~34). */
const POISE_PER_FORCE = 14;
const DEPTH = 7;

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What the classic layer needs from the World scene beyond `WorldApi`. */
export interface ClassicHost extends WorldApi {
  visuals: Visuals;
  feedback: import('../game/feedback').Feedback;
  player: Player & {
    face: number;
    state: string;
    shieldT: number;
    vulnerable: boolean;
    body: Phaser.Physics.Arcade.Body;
    rect: Phaser.GameObjects.Rectangle;
    swapStrikeT: number;
    grantInvuln(t: number): void;
    placeAt(x: number, feet: number, face?: number): void;
  };
  controls: WorldApi['controls'];
  persist(): void;
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
  loadRoom(id: string, spawn: string): void;
  goTo(id: string, spawn: string): void;
  setTile(x: number, y: number, tile: T): void;
  collect(l: Loot): void;
  giveXp(xp: number, x?: number, y?: number): void;
  refreshStats(): void;
  rest(id?: string): void;
}

/** Elior as the original modules see him: feet at `y`, a hurtbox, `takeHit`. */
class PlayerView {
  id = -1;
  team = 'player';
  remove = false;
  dying = false;
  /** The foe Elior last struck (Echo orders and the swap read it). */
  lastFoe: Entity | null = null;
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
  set face(v: number) { this.p.face = v; }
  get state() { return this.p.dead ? 'dead' : this.p.state; }
  get scriptX() { return this.p.scriptX; }
  set scriptX(v: number | null) { this.p.scriptX = v; }
  get scriptSpeed() { return this.p.scriptSpeed; }
  set scriptSpeed(v: number) { this.p.scriptSpeed = v; }
  setState(v: string) { this.p.state = v as Player['state']; if (v === 'free') this.p.releaseState(); }
  revive() { this.p.releaseState(); this.p.hp = this.p.maxHp; }
  get water() { return this.p.water; }
  get counterT() { return this.p.counterT; }
  get comboHits() { return this.p.comboHits; }
  get hasDouble() { return () => G.save.keyItems.includes('eagle_wings'); }
  die() { this.p.die(); }
  get hp() { return this.p.hp; }
  set hp(v: number) { this.p.hp = v; }
  get maxHp() { return this.p.maxHp; }
  get shieldT() { return this.p.shieldT; }
  set shieldT(v: number) { this.p.shieldT = v; }
  get veiled() { return this.p.veiled; }
  set veiled(v: number) { this.p.veiled = v; }
  get cds() { return this.p.cds; }
  get lion() { return this.p.lion; }
  set lion(v: number) { this.p.lion = v; }
  get armorLight() { return this.p.armorLight; }
  set armorLight(v: number) { this.p.armorLight = v; }
  get mendT() { return this.p.mendT; }
  set mendT(v: number) { this.p.mendT = v; }
  get untouchable() { return this.p.untouchable; }
  set untouchable(v: number) { this.p.untouchable = v; }
  styleKey = '';
  pose = { ...BASE_POSE };
  j = { haFX: 8, haFY: -24 };
  private heroStyle: HumanStyle | null = null;
  get style(): HumanStyle { this.refreshLook(); return this.heroStyle!; }
  refreshLook() {
    const s = G.save;
    const helm = getItem(s, s.equipment.helm);
    const armor = getItem(s, s.equipment.armor);
    const gl = getItem(s, s.equipment.gauntlets);
    const bt = getItem(s, s.equipment.boots);
    const wp = getItem(s, s.equipment.weapon);
    const key = [helm?.id, armor?.id, gl?.id, bt?.id, wp?.id, wp?.plus, wp?.rarity, s.level, flag('relic_taken'), this.armorLight > 0, this.mantleT > 0].join('|');
    if (key === this.styleKey && this.heroStyle) return;
    this.styleKey = key;
    const hl = helm ? ITEMS[helm.id].look ?? 0 : -1;
    const al = armor ? ITEMS[armor.id].look ?? 0 : 0;
    const gLook = gl ? ITEMS[gl.id].look ?? 0 : 0;
    const bLook = bt ? ITEMS[bt.id].look ?? 0 : 0;
    const helmKind: HumanStyle['helm'] = hl === 3 ? 'crown' : hl === 2 ? 'visor' : hl === 1 ? 'cap' : 'none';
    const plate = al >= 2 ? { c: '#1e1c22', dark: '#121016', hi: '#e2b85a', tier: 2 } : al === 1 ? { c: '#6c6a70', dark: '#46444a', hi: '#b8b8c0', tier: 1 } : null;
    const lv = s.level;
    const relic = flag('relic_taken');
    const wb = wp ? ITEMS[wp.id] : ITEMS.militia_sword;
    const plus = wp?.plus ?? 0;
    const rar = wp?.rarity ?? 0;
    let wGlow: string | null = null;
    let wAmt = 0;
    if (plus >= 3 || rar >= 3 || wb.id === 'covenant_blade') {
      wGlow = rar >= 4 ? RARITY_COLORS[rar] : '#ffd27a';
      wAmt = Math.min(1, 0.4 + plus * 0.12 + Math.max(0, rar - 2) * 0.15);
    }
    // Elemental weapons glow their element's colour.
    const el = wb.element;
    if (el) {
      wGlow = ELEMENTS[el].c;
      wAmt = Math.max(wAmt, 0.65);
    }
    // The Sovereign: black and gold, eyes burning violet.
    const sov = lv >= 100;
    this.heroStyle = {
      skin: '#70452f',
      hair: '#f1f3ed',
      beard: '#e9ede7',
      hairKind: 'spiky',
      coat: sov ? '#16131e' : lv >= 7 ? '#1f2a48' : '#26304e',
      coatDark: sov ? '#0c0a12' : '#19203a',
      skirt: 9,
      trim: lv >= 3 ? (lv >= 6 ? '#e2b85a' : '#9a7a4a') : null,
      pants: '#38302e',
      boots: bLook === 1 ? '#6a6a72' : bLook === 2 ? '#7a5a3a' : '#3d2c22',
      glove: gLook === 1 ? '#a07038' : gLook === 2 ? '#2c2a32' : '#4a3426',
      belt: '#3a2a1a',
      plate,
      helm: helmKind,
      helmColor: hl === 2 ? '#2a2830' : '#6d6a66',
      helmTrim: hl === 2 ? '#e2b85a' : undefined,
      eye: sov ? '#c9a8ff' : '#ffe08a',
      eyeGlow: sov ? 1 : lv >= 50 ? 0.5 : 0,
      outline: '#0a070c',
      weapon: wb.family === 'spear' ? 'spear' : wb.family === 'greatsword' ? 'greatsword' : 'blade',
      weaponColor: wb.id === 'judgment_greatsword' ? '#e8d8a8' : wb.id === 'covenant_blade' ? '#e8e4dc' : '#c9ced6',
      weaponGlow: wGlow,
      weaponGlowAmt: wAmt,
      weaponFlame: plus >= 5 || el === 'fire' || sov,
      offhand: 'none',
      runes: relic && lv >= 4 ? '#ffd27a' : null,
      crack: null,
      bulk: 1,
      scarf: '#8f2a2a',
    };
    if (this.mantleT > 0) this.heroStyle = mantleStyle(this.heroStyle);
  }
  get family() { return this.L.host.d.family; }
  get grounded() { return this.p.onGround; }
  get mantleMax() { return this.p.powers?.mantleMax ?? 1; }
  get mantleT() { return this.p.mantleT; }
  set mantleT(v: number) { this.p.mantleT = v; }
  get ghosts() { return this.p.powers!.ghosts; }
  get fin() { return this.p.powers?.fin; }
  get subCd() { return this.p.powers?.subCd ?? 0; }
  set subCd(v: number) { if (this.p.powers) this.p.powers.subCd = v; }
  get weaponFlight() { return this.p.powers?.weaponFlight ?? null; }
  set weaponFlight(v: import('../../../remnant/src/game/chain').ChainBlade | null) { if (this.p.powers) this.p.powers.weaponFlight = v; }
  anim = { play: (id: string, _blend=0.08, _restart=false, speed=1) => { this.p.powers?.playClip(id,speed); } };
  throwPose() { this.p.castPose(); }
  weaponImpact(t: Entity) { this.p.powers?.weaponImpact(t); }
  private practice = new WeaponPractice();
  practiceHit(e: Entity, damage: number, finisher = false) { if (this.practice.hit(G.save, this.family, e, damage, finisher)) { this.L.host.refreshStats(); G.ui.toast(`${this.family} mastery ${G.d.masteryRank} · see Mastery`); sfx('chargeFull', { vol: 0.45 }); } }
  get sinceHurt() { return this.p.sinceHurt; }
  set sinceHurt(v: number) { this.p.sinceHurt = v; }
  leechHeal(damage: number, rate: number) { this.p.hp = Math.min(this.p.maxHp, this.p.hp + damage * rate); }
  blinkSpot(t: Entity) { return t.canBeTargeted() ? this.p.blinkSpotAt(t.x, t.y, t.body.w / 2) : null; }
  blinkToFoe(t: Entity) {
    const spot = this.blinkSpot(t);
    if (!spot) return false;
    const x = this.x, y = this.cy;
    this.p.placeAt(spot.x, spot.y, Math.sign(t.x - spot.x) || this.face);
    fx.streak(x, y, this.x, this.cy, '#ad9aff', 0.3, 3);
    return true;
  }
  hurtbox(): Rect {
    const b = this.p.body;
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  isInvuln() { return !this.p.vulnerable; }
  /** Room for Elior's body at (x, feet y), on safe ground, in sight (the original's Player.canPlace). */
  canPlace(x: number, y: number) {
    const W = this.L, b = this.p.body;
    if (x < b.width / 2 || x > W.grid.w * TILE - b.width / 2 || y < b.height || y > W.grid.h * TILE) return false;
    if (!bodyFits({ w: b.width, h: b.height }, W.grid, W.solid, x, y)) return false;
    const floor = W.grid.get(Math.floor(x / TILE), Math.floor(y / TILE));
    return floor !== T.Spikes && floor !== T.Veil;
  }
  moveTo(x: number, y: number) { this.p.placeAt(x, y, this.p.face); }
  faceTo(f: number) { this.p.face = f; }
  grantInvuln(t: number) { this.p.grantInvuln(t); }
  /** Arriving from a swap: Elior's next blow lands half again harder. */
  swapStrike() { this.p.swapStrikeT = 0.9; }
  canBeTargeted() { return !this.p.dead && !G.inCutscene; }
  /** An original blow, as the Phaser Elior takes it. */
  takeHit(h: HitInfo) {
    if (h.kind !== 'hazard' && this.isInvuln() && this.p.shieldT <= 0) return false;
    const src = h.src as (Entity & { parried?(by: unknown): void }) | null | undefined;
    const blow: Blow = {
      dmg: Math.max(1, Math.round(h.dmg)),
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
  get kind() { return (this.e as Enemy).kind; }
  get hp() { return this.e.hp; }
  get alive() {
    const e = this.e;
    if (e.remove || e.dying || !e.canBeTargeted()) return false;
    const r = e.hurtbox();
    this.box.setTo(r.x, r.y, r.w, r.h);
    return true;
  }
  get x() { return this.e.x; }
  hit(dmg: number, dir: number, force: number, crit = false, details: Partial<HitInfo> = {}) {
    const landed = this.e.takeHit({
      dmg, dir, crit, kind: 'melee',
      poise: force * POISE_PER_FORCE,
      kx: dir * 90 * force, ky: -50 * force,
      stop: 0.04 + force * 0.02,
      src: this.L.playerView as unknown as Entity,
      ...details,
    });
    if (landed) this.L.playerView.lastFoe = this.e;
    return landed;
  }
  /** Its blow was turned aside (a parry, the Shield of Faith). */
  parried() { this.e.parried(this.L.playerView as unknown as Entity); }
  update() {}
  remove() { this.e.remove = true; }
}

/** A Phaser actor exposed to shared spells and Echo targeting. Phaser still
 * owns its rendering and physics; this supplies no second simulation. */
class NativeTarget extends Entity {
  constructor(readonly native: FoeLike) {
    super(native.x, native.box.bottom, native.box.width, native.box.height);
    this.isFoe = true; this.team = 'enemy';
    this.isBoss = 'phaseMarks' in native;
    this.sync();
  }
  get key() { return (this.native as any).key; }
  get state() { return (this.native as any).state; }
  get phase() { return (this.native as any).phase; }
  awaken() { (this.native as any).awaken(); }
  executable() { return this.native.alive && ((this.native as any).staggered ?? 0) > 0; }
  sync() {
    const n = this.native, b = n.rect?.body as Phaser.Physics.Arcade.Body | undefined;
    const box = b ? { x: b.left, y: b.top, w: b.width, h: b.height } : { x: n.box.x, y: n.box.y, w: n.box.width, h: n.box.height };
    this.name = (n as any).name ?? '';
    this.x = n.x; this.y = box.y + box.h; this.body.w = box.w; this.body.h = box.h;
    this.hp = (n as FoeLike & { hp?: number }).hp ?? (n.alive ? 1 : 0);
    this.maxHp = (n as FoeLike & { maxHp?: number }).maxHp ?? this.hp;
    this.dying = !n.alive; this.remove = n.removed;
    this.staggered = (n as FoeLike & { staggered?: number }).staggered ?? 0;
  }
  canBeTargeted() {
    this.sync();
    const n = this.native as FoeLike & { fighting?: boolean; ward?: boolean };
    return n.alive && !n.removed && n.fighting !== false && !n.ward;
  }
  takeHit(h: HitInfo) {
    if (!this.canBeTargeted()) return false;
    const landed = this.native.hit(h.dmg, h.dir, h.poise / POISE_PER_FORCE, h.crit, h);
    this.sync();
    return landed;
  }
  update(dt: number) { tickStatus(this, dt); this.sync(); }
  draw() {}
}

let uiStarted = false;

export class ClassicLayer {
  readonly story = new Story();
  readonly storyEnabled = !new URLSearchParams(location.search).has("nostory");
  private near: (Entity & { prompt(): string; interact(): void; range: number }) | null = null;
  private fired = new Set<string>();
  deathHandled = false;
  get rallyT() { return (this.hero as any)?.superT ?? -1; }
  offlineMenu() { return el('div', { class: 'box' }, el('h3', null, 'Offline play'), el('p', { class: 'muted', 'data-phaser-offline': '' }, offlineStatusText())); }
  recoveryMenu(): HTMLElement | null {
    const rows: HTMLElement[] = [];
    for (let slot = 0; slot < 3; slot++) {
      try {
        const raw = localStorage.getItem(`remnant-phaser.before-cutover.slot${slot}`); if (!raw) continue;
        const save = JSON.parse(raw); if (save.version !== 1) continue;
        rows.push(btn(`Restore preview slot ${slot + 1} · level ${save.level}`, () => {
          void G.ui.choice('Restore the earlier Phaser journey?', `Slot ${slot + 1} will load its preview progress. Its current Phaser progress is backed up first. Original-edition saves stay separate.`, [{ label: 'Keep current journey' }, { label: 'Restore preview journey' }]).then((choice: number) => {
            if (choice !== 1) return;
            this.host.persist(); const key = slot === 0 ? 'remnant-phaser.save.v2' : `remnant-phaser.save.slot${slot}`;
            try { const old = localStorage.getItem(key); if (old) localStorage.setItem(`remnant-phaser.before-preview-restore.slot${slot}`, old); localStorage.setItem(key, raw); } catch { G.ui.toast('Storage is unavailable. Your current journey is kept.'); return; }
            closeMenu(); selectSlot(slot); G.slot = slot; migrateSave(save); this.host.save = save; G.save = save; this.host.refreshStats(); this.host.loadRoom(save.room, save.spawn);
          });
        }, 'btn small', { 'data-k': `recover_preview_${slot}` }));
      } catch {}
    }
    return rows.length ? el('div', { class: 'box' }, el('h3', null, 'Earlier Phaser journeys'), el('p', { class: 'muted' }, 'Backups made when the main app switched over.'), rows) : null;
  }
  configureTrial(wave: number) { return (this.host as any).configureTrial(wave); }
  async afterRun(choice: "again" | "leave") {
    await G.ui.fade(1, 0.3); this.story.ch3.rounds.clearArena(); this.rest();
    if (choice === "again") this.load("trial_arena", "start");
    else { const back = String(G.save.flags.trial_return ?? "sanctuary|start").split("|"); delete G.save.flags.trial_return; this.load(back[0], back[1]); }
    this.autosave(); await G.ui.fade(0, 0.5);
  }
  hero: HeroPowers | null = null;
  ents: Entity[] = [];
  grid!: Grid;
  boss: (Entity & { key?: string; state: string; awaken(): void }) | null = null;
  bossActive = false;
  readonly playerView: PlayerView;
  /** Elior's Echoes (src/classic/squad.ts). */
  readonly squad: Squad;
  private views = new WeakMap<Entity, FoeView>();
  private foeViews: FoeView[] = [];
  private targets: Entity[] = [];
  private nativeViews = new WeakMap<FoeLike, NativeTarget>();
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
  /** Rings, pillars, streaks and arcs as animated art instead of canvas shapes. */
  readonly art: ArtFx;

  constructor(readonly host: ClassicHost) {
    const sc = host.sc;
    this.playerView = new PlayerView(this);
    this.squad = new Squad(this);
    const key = `classic-${ClassicLayer.n++}`;
    this.tex = sc.textures.createCanvas(key, 64, 64)!;
    this.canvas = this.tex.getSourceImage() as HTMLCanvasElement;
    this.ctx = this.tex.getContext();
    this.img = sc.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH).setVisible(false);
    // Damage numbers read best in the Phaser build's own float text.
    fx.number = (x: number, y: number, v: number | string, crit = false, color?: string) =>
      host.floatText(x, y, typeof v === 'number' ? String(Math.round(v)) : v, color ?? (crit ? '#ffd23a' : '#ffe6a8'), crit);
    this.art = new ArtFx(sc);
    this.bind();
  }

  /** Point `G` at this scene: the world, camera, HUD and save the original modules use. */
  bind() {
    const h = this.host, L = this;
    G.world = this;
    G.save = h.save; G.slot = activeSlot();
    Object.defineProperty(G, 'd', { configurable: true, enumerable: true, get: () => h.d, set: (d) => { h.d = d; if (h.player) { h.player.maxHp = d.maxHp; h.player.maxCe = d.maxCe; } } });
    G.debug = new URLSearchParams(location.search).has("debug");
    h.save.defeated ??= [];
    G.renderer = { tier: settings.quality === 'low' ? 0 : settings.quality === 'medium' ? 1 : 2, pixel: settings.artStyle === 'pixel', effects: 0, bw: 0, bh: 0, generation: 0, scale: 1,
      resize() { this.generation++; this.pixel = settings.artStyle === 'pixel'; this.tier = settings.quality === 'low' ? 0 : settings.quality === 'medium' ? 1 : 2; (h as any).fitCamera(); (h as any).art?.load(); },
    };
    G.camera = {
      get x() { return h.sc.cameras.main.worldView.centerX; },
      get y() { return h.sc.cameras.main.worldView.centerY; },
      s: 1, focusRate: 8,
      apply(ctx: CanvasRenderingContext2D) { const v = h.sc.cameras.main.worldView; ctx.setTransform(1, 0, 0, 1, -Math.floor(v.x), -Math.floor(v.y)); },
      focus: null as { x: number; y: number } | null,
      punch: 0, zoomTarget: 1, viewMultTarget: 1,
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      addTrauma(n: number) { if (n > 0) h.shake(Math.min(0.02, n * 0.012), 120 + n * 380); },
      view() { const v = h.sc.cameras.main.worldView; return { x: v.x, y: v.y, w: v.width, h: v.height }; },
      snapTo(x: number, y: number) { h.sc.cameras.main.centerOn(x, y); },
    };
    if (!uiStarted) { initUI(); installNav(); uiStarted = true; }
    G.ui = { ...hooks,
      bossBar: (n: string | null, s = '') => h.hud.bossBar(n, s),
      cinematicBars: (on: boolean) => { hooks.cinematicBars(on); h.hud.cinematicBars(on); },
      refreshHud: () => h.refreshStats(),
      echoWheel: (on: boolean) => { if (on) (h.hud as any).openWheel(); else (h.hud as any).closeWheel(); },
    };
    void L;
  }

  /** A new room: the grid the original physics walks on (gate cells kept as gates). */
  load(id?: string, spawn = 'start') {
    if (id) { this.host.loadRoom(id, spawn); return; }
    this.story.ch3.rounds.cancelBlessing();
    runBlessings.reset();
    this.clear();
    const r = this.host.room;
    this.grid = new Grid(r.rows);
    if (r.id === 'temple_steps' && G.save.flags.collapsed) for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (this.grid.get(x, y) === T.Collapse) this.grid.set(x, y, T.Empty);
    for (const pair of String(G.save.flags['broken:' + r.id] ?? '').split(';')) { const [x, y] = pair.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(y)) this.grid.set(x, y, T.Empty); }
    const set = this.grid.set.bind(this.grid);
    this.grid.set = (x, y, t) => { set(x, y, t); this.host.setTile(x, y, t); };
    prepareWater((r as any).ents, this.grid);
    syncRest(r.id);
    this.fired.clear();
    this.deathHandled = false;
    G.camera.bounds = { x: 0, y: 0, w: r.w * TILE, h: r.h * TILE };
    G.camera.focus = null;
  }

  clear() {
    muffleWater(false);
    this.hero?.destroy(); this.hero = null;
    this.ents = [];
    this.foeViews = [];
    this.timers = [];
    this.boss = null;
    this.bossActive = false;
    this.slowT = 0;
    this.slowScale = 1;
    this.squad.clear();
    G.inCutscene = false;
    fx.clear();
    this.art.clear();
    this.img.setVisible(false);
  }

  get player() { return this.playerView; }
  attachPlayer() { this.hero = this.host.player.powers = new HeroPowers(this, this.host.player); }
  get room() { return this.host.room; }
  // The squad's side of the original world, which the Echo modules call on G.world.
  get echoes() { return this.squad.echoes; }
  set echoes(v) { this.squad.echoes = v; }
  get echoCombinations() { return this.squad.combos; }
  get priorityTarget() { return this.squad.priorityTarget; }
  set priorityTarget(v) { this.squad.priorityTarget = v; }
  get swapPick() { return this.squad.swapPick; }
  get switchCd() { return this.squad.switchCd; }
  get syncCd() { return this.squad.syncCd; }
  get duel() { return this.squad.duel; }
  get rushing() { return this.room.id === 'trial_arena' && this.story.ch3.rounds.isolated; }
  get transitioning() { return (this.host as any).transitioning; }
  transition(id: string, spawn: string) { this.host.goTo(id, spawn); }
  enter(first: boolean) { if (this.storyEnabled) this.story.onEnter(this.room.id, first); }
  trigger(id: string) { if (this.fired.has(id)) return; this.fired.add(id); this.story.onTrigger(id); }
  giveXp(xp: number) { if (!this.rushing) this.host.giveXp(xp); }
  collect(l: Loot) { if (!this.rushing) this.host.collect(l); }
  spawnLoot(x: number, y: number, loot: Loot[], _burst = true) { if (!this.rushing) for (const l of loot) this.add(new Drop(x, y, l)); }
  absorb(id: string, _manual = false) { const e = absorbEcho(G.save, id, G.d); this.host.refreshStats(); return e; }
  rest() { this.host.rest(); }
  restAtAltar(a: Altar) { if (!G.save.altarsLit.includes(a.idKey)) G.save.altarsLit.push(a.idKey); G.save.altar = { room: this.room.id, spawn: 'altar' }; this.rest(); G.ui.openAltar(a.idKey); }
  get cache() { return { invalidate: () => { this.syncTiles(); (this.host as any).art?.cache?.invalidate(); } }; }
  private syncTiles() { for (let y = 0; y < this.grid.h; y++) for (let x = 0; x < this.grid.w; x++) this.host.setTile(x, y, this.grid.get(x, y)); }
  summonEchoes(silent = false) { this.squad.summonEchoes(silent); }
  dismissEchoes() { this.squad.dismissEchoes(); }
  summonList() { return this.squad.summonList(); }
  setSummon(pre: 'one' | 'two' | 'squad' | 'all') { this.squad.setSummon(pre); }
  orderEchoes(...a: Parameters<Squad['orderEchoes']>) { this.squad.orderEchoes(...a); }
  benchReady() { return this.squad.benchReady(); }
  pickSwap() { return this.squad.pickSwap(); }
  onEchoFallen(e: Parameters<Squad['onEchoFallen']>[0]) { this.squad.onEchoFallen(e); }
  echoAssist(t: Entity) { this.squad.echoAssist(t); }
  switchSupport() { this.squad.switchSupport(); }
  echoCommand(c: Parameters<Squad['echoCommand']>[0]) { this.squad.echoCommand(c); }
  nearestEnemy(x: number, y: number, r: number, dir: number) { return this.squad.nearestEnemy(x, y, r, dir); }
  commanderAura(x: number, y: number, self?: Entity) { return this.squad.commanderAura(x, y, self); }
  guardianAura(x: number, y: number) { return this.squad.guardianAura(x, y); }
  groundY(x: number, fromY: number) { return this.squad.groundY(x, fromY); }
  autosave(_silent = false) { this.host.refreshStats(); this.host.persist(); }
  nearInteractable() { return !!this.near; }
  tryInteract() { this.near?.interact(); }
  updateInteract() {
    this.near = null; let best = Infinity;
    for (const e of this.ents) { const it = e as Entity & { prompt?(): string; interact?(): void; range?: number }; if (it.remove || !it.interact || !it.prompt) continue;
      const d = Math.abs(it.x - this.player.x); if (d < (it.range ?? 30) && d < best && Math.abs(it.y - this.player.y) < 36) { best = d; this.near = it as Entity & { prompt(): string; interact(): void; range: number }; } }
    return (this.near as (Entity & { prompt(): string }) | null)?.prompt() ?? null;
  }
  addRelic() { this.add(new RelicVisual(34.5 * TILE, 20 * TILE)); }
  spawnProp(e: EntDef): boolean {
    const x = ('x' in e ? e.x : 0) * TILE, y = ('y' in e ? e.y : 0) * TILE;
    switch (e.t) {
      case 'npc': this.add(new Npc(e.k, x, y, e.face)); return true;
      case 'altar': this.add(new Altar(x, y, e.id)); return true;
      case 'chest': this.add(new Chest(x, y, e.id, e.loot, e.secret)); return true;
      case 'lore': this.add(new LoreStone(x, y, e.id)); return true;
      case 'shrine': this.add(new Shrine(x, y, e.id, e.grants)); return true;
      case 'pickup': if (!G.save.opened.includes(e.id)) this.add(new Pickup(x, y, e.id, e.loot)); return true;
    } return false;
  }
  get gateClosed() { return this.host.gateClosed; }
  solid = (t: T) => (t === T.Gate ? this.host.gateClosed : isSolid(t));
  solidAt(x: number, y: number) { return this.solid(this.grid.get(Math.floor(x / TILE), Math.floor(y / TILE))); }
  keyLabel(a: string) { return ({ attack: 'J / STRIKE', sub: 'U / SUB', transform: 'G / MANTLE', ultimate: 'T / SUPER' } as Record<string, string>)[a] ?? a; }

  add<E extends Entity>(e: E) {
    this.ents.push(e);
    return e;
  }
  addNative(f: FoeLike) {
    const e = new NativeTarget(f);
    this.nativeViews.set(f, e);
    if (e.isBoss) this.boss = e;
    this.add(e);
  }
  nativeScale(f: FoeLike) { return (this.nativeViews.get(f)?.chill ?? 0) > 0 ? 0.55 : 1; }
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
  addRally(n = 1) { this.hero?.gain(n); }
  echoBlocks(pr: Proj) {
    if (G.save.echoMode !== 'defensive') return false;
    for (const e of this.echoes) if (e.sentinel && e.recallT <= 0 && e.despawn <= 0 && overlaps(pr.rect(), e.hurtbox())) { pr.remove = true; sfx('block', { pan: this.pan(e.x), vol: 0.6 }); fx.hitSparks(pr.x, pr.y, -Math.sign(pr.vx), '#fff1c4', 6); e.gainXp(1); return true; }
    return false;
  }
  healAlliesIn(x0: number, x1: number, y: number, frac: number, energy = false) {
    const p = this.host.player;
    if (!p.dead && p.x >= x0 && p.x <= x1 && Math.abs(p.feet - y) < 40) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * frac);
      if (energy) this.host.save.ce = Math.min(this.host.d.maxCe, this.host.save.ce + 5);
    }
    for (const e of this.squad.echoes) if (!e.remove && e.x >= x0 && e.x <= x1 && Math.abs(e.y - y) < 40) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * frac); e.inst.hp = e.hp;
    }
  }
  breakWalls(x: number, y: number, r: number, trumpet: boolean): boolean {
    if (!trumpet) return false;
    const g = this.grid;
    const tiles: [number, number][] = [];
    const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
    const ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = g.get(tx, ty);
        if (t !== T.Cracked && t !== T.Seal) continue;
        // flood-fill the whole wall
        const stack: [number, number][] = [[tx, ty]];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          const ct = g.get(cx, cy);
          if (ct !== T.Cracked && ct !== T.Seal) continue;
          g.set(cx, cy, T.Empty);
          tiles.push([cx, cy]);
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
      }
    if (!tiles.length) return false;
    const key = 'broken:' + this.room.id;
    const prev = String(G.save.flags[key] ?? '');
    G.save.flags[key] = (prev ? prev + ';' : '') + tiles.map(([a, b]) => a + ',' + b).join(';');
    sfx('wallBreak');
    G.camera.addTrauma(0.6 * shakeScale());
    for (const [a, b] of tiles) {
      fx.shards(a * TILE + 8, b * TILE + 8, 4, '#6a6070', 1.2);
      fx.dust(a * TILE + 8, b * TILE + 14, 3, 1.2);
    }
    fx.flash('#ffe6a8', 0.2);
    this.story.onWallBroken(this.room.id, tiles);
    this.autosave();
    return true;
  }

  spawnShockwave(x: number, y: number, dir: number, damage: number, team: 'player' | 'enemy') {
    this.add(new Proj('wave', x, y, team, damage, { vx: dir * 260, life: 1.2, w: 14, h: 24 }));
  }
  spawnLightWave(x: number, y: number, dir: number, mult: number) {
    this.add(new Proj('lightwave', x, y, 'player', this.host.d.atk * this.host.d.abil * 0.55 * mult, { vx: dir * 380, life: 0.5, w: 18, h: 36, poise: 10 }));
  }
  execute(p: PlayerView, e: Entity, mult: number) {
    valorTrack.finisher();
    const d = this.host.d;
    const tank = e instanceof Enemy && e.tank;
    const damage = e.isBoss ? Math.max(d.atk * 9, e.maxHp * 0.07) * mult : tank ? Math.max(d.atk * 8, e.maxHp * ((e as Enemy).elite ? 0.22 : 0.35)) * mult : e instanceof Enemy && e.elite ? d.atk * 8 * mult : e.hp + 5;
    if (tank) { (e as Enemy).execUsed = true; e.staggered = Math.min(e.staggered, 1.4); } else { e.staggered = e.isBoss ? 0.6 : 0; if (e instanceof NativeTarget && e.isBoss) (e.native as any).staggered = Math.min((e.native as any).staggered, 0.6); }
    e.takeHit({ dmg: damage, poise: 0, kx: p.face * 300, ky: -260, dir: p.face, kind: 'melee', src: p as unknown as Entity, heavy: true, crit: true, stop: 0.12 });
    this.host.save.ce = Math.min(d.maxCe, this.host.save.ce + 10);
    this.addRally(12); this.host.shake(0.01, 220); fx.holyBurst(e.cx, e.cy, 26, 1.4);
  }
  entityFor(f: FoeLike) { return (f as FoeView).e ?? this.nativeViews.get(f); }
  /** A foe's target: Elior or the nearest Echo (a defensive sentinel draws it), as in the original. */
  targetFor(en: Entity, range: number): Entity | null {
    let best: Entity | null = null, bd = range;
    const p = this.playerView;
    if (p.canBeTargeted()) {
      const d = Math.abs(p.x - en.x) + Math.abs(p.y - en.y) * 0.5;
      if (d < bd) { bd = d; best = p as unknown as Entity; }
    }
    for (const e of this.squad.echoes) {
      if (e.recallT > 0 || e.summonT > 0.3 || e.despawn > 0) continue;
      const taunt = e.sentinel && G.save.echoMode === 'defensive' ? 0.6 : 1.25;
      const d = (Math.abs(e.x - en.x) + Math.abs(e.y - en.y) * 0.5) * taunt;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** A foe's blow lands on Elior and any Echo in its box. */
  hitPlayerSide(box: Rect, h: HitInfo, set: Set<number>) {
    let any = false;
    const p = this.playerView;
    if (!set.has(p.id) && p.state !== 'dead' && overlaps(box, p.hurtbox())) {
      set.add(p.id);
      if (p.takeHit(h)) any = true;
    }
    for (const e of this.squad.echoes) {
      if (set.has(e.id) || e.remove || !overlaps(box, e.hurtbox())) continue;
      set.add(e.id);
      if (e.takeHit(h)) any = true;
    }
    return any;
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
    if (this.rushing) return;
    (G.save.bestiary ??= {})[e.kind] = (G.save.bestiary[e.kind] ?? 0) + 1;
    if (this.storyEnabled) this.story.onKill(e);
    const st = e.stats, tier = chapterCurve(e.tier).xp, elite = e.elite ? 4 : 1;
    const xp = e.xpOverride ?? Math.round(st.xp * elite * tier * this.host.d.xpMult * (1 + G.save.ng * 0.5));
    // Purification: the body lifts away as gold light; an elite's fall gets a beat of slow motion.
    const hb = e.hurtbox();
    this.host.feedback.dissolve(e.x, e.y, hb.w, hb.h, !!e.elite);
    if (e.elite) this.slowmo(0.32, 0.35);
    this.addRally(6); G.save.ce = Math.min(G.d.maxCe, G.save.ce + (G.save.flags.relic_taken ? 5 : 0));
    this.host.onFoeDied(xp, Math.round(Phaser.Math.Between(st.silver[0], st.silver[1]) * elite * tier), e.x, e.y - 20, e.elite ?? undefined);
    if (this.storyEnabled) { const loot: Loot[] = []; if (Math.random() < 0.28) loot.push({ mat: 'veil_shard', n: 1 }); if (Math.random() < 0.22) loot.push({ mat: 'iron_scrap', n: 1 }); if (e.kind === 'sentinel') loot.push({ mat: 'sentinel_steel', n: e.elite ? 3 : 1 }); if (e.elite) loot.push({ mat: 'covenant_fragment', n: 1 }); if (Math.random() < (e.elite ? 1 : 0.06)) loot.push(rollGear(e.elite ? 2 : 0)); this.spawnLoot(e.x, e.cy, loot); }
    // The Echoes out share in it, as in the original.
    const echoXp = Math.min(160, Math.max(4, Math.round(Math.sqrt(Math.max(1, xp)) * 1.5)));
    for (const ec of this.squad.echoes) if (!ec.remove && ec.hp > 0 && ec.despawn <= 0 && ec.tempT <= 0) { ec.gainXp(echoXp); if (G.d.sets.legion >= 3) ec.hp = ec.inst.hp = Math.min(ec.maxHp, ec.hp + ec.maxHp * 0.03); }
    if (this.squad.priorityTarget === e) this.squad.priorityTarget = null;
  }
  onBossDefeated(b: Entity & { key?: string }) {
    this.bossActive = false;
    if (!this.storyEnabled) { this.host.onClassicBossDefeated(b.key ?? 'idol'); return; }
    valorTrack.bossDown(b);
    const R = this.story.ch3.rounds;
    if (this.room.id === 'trial_arena' && R.bossOnly) { R.bossDefeated(b as any); return; }
    const key = b.key ?? 'idol'; if (!G.save.defeated.includes(key)) G.save.defeated.push(key);
    const k = b as any;
    if (key === 'gatekeeper') { this.closeGate(false); void this.story.gatekeeperDefeated(k); }
    else if (key === 'marshal') void this.story.marshalDefeated(k);
    else if (key === 'locust_king') void this.story.kingDefeated(k);
    else if (key === 'golden_image') void this.story.ch4.imageDefeated(k);
    else if (key === 'weigher') void this.story.ch5.weigherDefeated(k);
    else if (key === 'storm_prince') void this.story.ch6.stormDefeated(k);
    else if (key === 'persia_prince') void this.story.ch6.princeDefeated(k);
    else if (key === 'idol') { this.closeGate(false); void this.story.bossDefeated(k); }
    else void this.story.fallen.bossDefeated(k);
  }
  /** Tobiah's lamp oil in the Idol fight: the Idol kneels (his walk-on comes with the NPC port). */
  tobiahAssist(idol: Entity & { kneel(): void }) {
    G.ui.caption('Tobiah: "ELIOR! Duck!"');
    this.after(1, () => { idol.kneel(); G.ui.caption('Tobiah: "Lamp oil! The good stuff! NOW, Elior!"'); });
    this.after(4, () => G.ui.caption(null));
  }
  closeGate(on: boolean) { (this.host as unknown as { closeGate(on: boolean): void }).closeGate(on); }

  /** Classic foes, as targets for Elior's blows and skills. */
  playerFoes(): FoeLike[] {
    this.foeViews.length = 0;
    for (const e of this.ents) {
      if (!e.isFoe || e.remove || e instanceof NativeTarget) continue;
      let v = this.views.get(e);
      if (!v) this.views.set(e, (v = new FoeView(this, e)));
      this.foeViews.push(v);
    }
    return this.foeViews;
  }

  /** Shared modules need Entities; Elior uses playerFoes' Phaser hit boxes. */
  foes(): Entity[] {
    this.targets.length = 0;
    for (const e of this.ents) if (e.isFoe && !e.remove) {
      if (e instanceof NativeTarget) e.sync();
      this.targets.push(e);
    }
    return this.targets;
  }

  /** Anything to run or draw: actors, or effects still fading after them. */
  get active() { return this.ents.length > 0 || this.squad.echoes.length > 0 || fx.ps.length > 0 || fx.rings.length > 0 || fx.arcs.length > 0 || fx.streaks.length > 0 || fx.cols.length > 0 || fx.flashA > 0; }

  get simulationScale() { return GAME_PACE * (this.slowT > 0 ? this.slowScale : 1); }
  update(dtRaw: number) {
    let dt = dtRaw * GAME_PACE;
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
    if (this.storyEnabled && this.room.id === "trial_arena") this.story.ch3.rounds.update(dt);
    lighting.begin();
    for (const e of (this.room as any).ents) if (e.t === 'light' && (!e.cond || flag(e.cond))) lighting.add(e.x * TILE, e.y * TILE - 10, e.r ?? (e.k === 'window' ? 130 : 100), e.c ?? (e.k === 'window' ? '#9fb4e8' : '#ffcf6b'), 0.9, 0.5);
    // Elior's own light, as the original Player.lights(): wider once the relic wakes, brighter while charging or empowered.
    const p = this.host.player, relic = !!G.save.flags.relic_taken;
    lighting.add(p.x, p.feet - 20, relic ? 120 : 90, '#ffd9a0', relic ? 0.85 : 0.7, 0.15);
    if (p.state === 'charge') lighting.add(p.x, p.feet - 30, 60 + p.chargeLvl * 20, '#ffe6a8', 0.8, 0.6);
    if (p.armorLight > 0 || p.lion > 0) lighting.add(p.x, p.feet - 20, 110, '#ffcf6b', 0.9, 0.4);
    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i];
      try { e.update(dt); } catch (err) { this.fault(e, err); }
    }
    for (let i = this.ents.length - 1; i >= 0; i--) if (this.ents[i].remove) this.ents.splice(i, 1);
    if (this.boss?.remove) this.boss = null;
    this.squad.update(dt);
    fx.update(dt);
    this.art.update(dt);
    this.art.statuses(this.ents, G.time);
    updateWater(dt);
    this.followFocus(dtRaw);
  }

  /** A boss's intro points the camera at it; Elior's follow resumes after. */
  private followFocus(dt: number) {
    const shot = this.host.visuals.bossCamera.frame(dt);
    const cam = this.host.sc.cameras.main, f = (G.camera.focus as { x: number; y: number } | null) ?? shot;
    const base = (this.host as any).baseZoom ?? cam.zoom;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, base * G.camera.zoomTarget / G.camera.viewMultTarget * (shot?.zoom ?? 1), 1 - Math.exp(-5 * dt)));
    if (f) {
      if (!this.focusing) { cam.stopFollow(); this.focusing = true; }
      const v = cam.worldView;
      const a = 1 - Math.exp(-Math.min(40, G.camera.focusRate || 8) * dt);
      cam.scrollX += (f.x - v.centerX) * a;
      cam.scrollY += (f.y - v.centerY) * a;
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
    for (const e of this.squad.echoes) sorted.push(e);
    sorted.sort((a, b) => a.layer - b.layer);
    for (const e of sorted) {
      try {
        e.lights?.();
        // Foes with a sheet draw from it, as in the original's pixel style.
        if (e instanceof Enemy && drawFoeSprite(c, e)) continue;
        if ((e as { pixelShade?: boolean }).pixelShade && drawPixelBody(c, e as Parameters<typeof drawPixelBody>[1])) continue;
        e.draw(c);
      } catch (err) { this.fault(e, err); }
    }
    for (const e of sorted) try { e.drawOverlay?.(c); } catch (err) { this.fault(e, err); }
    this.squad.drawSwapMark(c);
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
  fault(e: Entity, err: unknown) {
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
