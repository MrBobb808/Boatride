// The world: builds a room from the shared room data (tiles, spawns, exits,
// entities), runs Elior and the foes, and moves between rooms through their
// doorways. The camera shows 300 world pixels of height, as the original does.

import Phaser from 'phaser';
import { ROOMS, CHAR_TILE, T, TILE, isSolid, FALLEN_CHAPTERS, fallenObjective, chapterCurve, type RoomDef, type EntDef } from '../shared';
import { Controls } from '../game/controls';
import { Player } from '../game/player';
import { makeBoss, bossPorted, BOSS_CHAPTER, type Boss } from '../game/bosses';
import { biomeTileset, tileIndex, backdropTextures, TI } from '../game/tileset';
import { newSave, loadSave, writeSave, gainXp, stats, type PhaserSave } from '../game/save';
import { absorbEcho, makeItem, addMaterial, echoMaxHp, type Derived } from '../../../remnant/src/game/state';
import { ITEMS } from '../../../remnant/src/game/data';
import type { Rarity } from '../../../remnant/src/game/data';
import type { WorldApi, FoeLike, BossView } from '../game/types';
import { chapterOf } from '../../../remnant/src/game/rooms';
import { catchUpXp } from '../../../remnant/src/game/curve';
import { FINISHERS } from '../../../remnant/src/game/finishers';
import { powerTier, SOVEREIGN_LV } from '../../../remnant/src/game/power';
import { MANTLE_LV, announceMantle, mantleTier, mantlePerks } from '../../../remnant/src/game/mantle';
import { islandNotify, islandRipple } from '../../../remnant/src/ui/island';
import { RoomArt } from '../classic/art';
import { ClassicLayer } from '../classic/layer';
import { makeEnemy } from '../../../remnant/src/game/foes';
import { Enemy } from '../../../remnant/src/game/enemies';
import { fx, PK } from '../../../remnant/src/render/fx';
import { CLASSIC_BOSSES, isClassicBoss, type ClassicBoss, type ClassicBossKey } from '../classic/bosses';
import { G } from '../classic/shim/ctx';
import { xpToNext, ECHO_SPECIES } from '../shared';
import { hudBoxes, type Hud } from './Hud';
import { hooks, blockingUI } from '../../../remnant/src/ui/ui';
import { topLayer } from '../../../remnant/src/ui/dom';
import { maybeRecap } from '../../../remnant/src/game/recap';
import { tickCoach } from '../../../remnant/src/ui/coach';
import { valorTick } from '../../../remnant/src/game/valor';
import { runBlessings } from '../../../remnant/src/game/blessings';
import { Grid } from '../../../remnant/src/game/tiles';
import { trialArena, trialSector } from '../../../remnant/src/game/trialArena';
import { castAbility } from '../../../remnant/src/game/abilities';
import { Proj } from '../../../remnant/src/game/projectiles';
import type { Player as OriginalPlayer } from '../../../remnant/src/game/player';
import type { SkillId } from '../game/abilities';
import { audio, sfx } from '../classic/shim/audio';
import { music } from '../classic/shim/music';
import { songs } from '../../../remnant/src/audio/songs';
import { settings, shakeScale } from '../classic/shim/settings';
import { offlineReady, updatePending, checkForUpdates } from '../game/update';
import { placeLamps, strikeLamps } from '../../../remnant/src/game/lamps';
import { Visuals } from '../game/visuals';

const VIEW_H = 300;

interface Interactable { x: number; y: number; label: string; use: () => void }

export class World extends Phaser.Scene implements WorldApi {
  controls!: Controls;
  save!: PhaserSave;
  /** Elior's stats from the save (refreshed on load, level-up and gear change). */
  d!: Derived;
  room!: RoomDef;
  player!: Player;
  private grid = new Uint8Array(0);
  private gw = 0;
  private gh = 0;
  private foeList: FoeLike[] = [];
  /** The room's boss, while it stands. */
  boss: Boss | null = null;
  private triggers: { id: string; r: Phaser.Geom.Rectangle }[] = [];
  /** Arena gate cells (grid indices): open until a fight closes them. */
  private gates: number[] = [];
  gateClosed = false;
  /** The original game's bosses and foes, run on Phaser (src/classic). */
  classic!: ClassicLayer;
  art!: RoomArt;
  visuals!: Visuals;
  /** The room's classic boss, while it stands. */
  cboss: ClassicBoss | null = null;
  private cbossKey: ClassicBossKey | null = null;
  /** The brood's waves before the Locust King hatches: which wave, and its foes. */
  private brood: { i: number; foes: { remove: boolean; dying: boolean }[] } | null = null;
  private allFoes: FoeLike[] = [];
  /** Seconds the interact button has been held beside a kneeling elite. */
  private purifyHold = 0;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private map?: Phaser.Tilemaps.Tilemap;
  private roomObjs: Phaser.GameObjects.GameObject[] = [];
  private bg: { far?: Phaser.GameObjects.TileSprite; near?: Phaser.GameObjects.TileSprite; sky?: Phaser.GameObjects.Image } = {};
  private colliders: Phaser.Physics.Arcade.Collider[] = [];
  private interactables: Interactable[] = [];
  private hints: { x0: number; x1: number; text: string; id: string }[] = [];
  private entrySpawn = 'start';
  private transitioning = false;
  private hitstopT = 0;
  private saveT = 0;
  private deadT = 0;
  private deathCounted = false;
  private fresh = false;
  private ready = false;

  constructor() { super('world'); }

  get sc(): Phaser.Scene { return this; }

  init(data: { fresh?: boolean }) {
    this.fresh = !!data?.fresh;
  }

  get hud() { return this.scene.get('hud') as Hud; }
  get canUseKit() { return this.ready && !this.transitioning && !this.hud.paused && !this.hud.wheelOpen && !G.paused && !G.inCutscene && !blockingUI() && !topLayer(); }

  create() {
    this.save = (!this.fresh && loadSave()) || newSave(!new URLSearchParams(location.search).has("nostory"));
    const away = Date.now() - this.save.updated;
    this.refreshStats();
    this.controls = new Controls(this);
    this.classic = new ClassicLayer(this);
    this.art = new RoomArt(this);
    this.visuals = new Visuals(this);
    this.events.once('shutdown', () => { this.visuals.destroy(); this.art.destroy(); this.classic.destroy(); });
    // The HUD scene starts on the next step; the first room waits for it.
    this.ready = false;
    this.scene.launch('hud');
    this.scene.get('hud').events.once('create', () => {
      this.loadRoom(ROOMS[this.save.room] ? this.save.room : 'sanctuary', this.save.spawn);
      this.cameras.main.fadeIn(400, 7, 6, 10);
      this.ready = true;
      if (!this.fresh && this.classic.storyEnabled) maybeRecap(away);
    });
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitCamera, this));
    const kitKey = (e:KeyboardEvent) => {
      if(e.repeat||!this.canUseKit)return;
      if(e.code==='KeyN'){e.preventDefault();if(this.player.switchHero())this.persist();}
      if(e.code==='KeyB'){e.preventDefault();if(this.player.cycleStyle())this.persist();}
    };
    window.addEventListener('keydown',kitKey);
    this.events.once('shutdown',()=>window.removeEventListener('keydown',kitKey));
    let hiddenAt = 0;
    const onHide = () => { if (document.hidden) { hiddenAt = Date.now(); this.persist(); } else if (hiddenAt) { if (this.classic.storyEnabled) maybeRecap(Date.now() - hiddenAt); hiddenAt = 0; } };
    document.addEventListener('visibilitychange', onHide);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onHide));
    if (new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { __remnant: unknown }).__remnant = {
        game: this.game, world: this, controls: this.controls, rooms: ROOMS, G,
        warp: (id: string, spawn = 'start') => this.goTo(id, spawn),
        give: (xp: number) => this.onFoeDied(xp, 0, this.player.x, this.player.y),
        hud: hudBoxes, audio, music, songs, settings, offlineReady,
      };
    }
  }

  // ---------------------------------------------------------------- the room

  tileAt(tx: number, ty: number) {
    if (tx < 0 || tx >= this.gw) return T.Stone;
    if (ty < 0) return T.Empty;
    if (ty >= this.gh) return T.Stone;
    return this.grid[ty * this.gw + tx];
  }

  setTile(x: number, y: number, t: T) {
    if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return;
    this.grid[y * this.gw + x] = t === T.Gate && !this.gateClosed ? T.Empty : t;
    if (!this.layer?.active) return;
    const idx = tileIndex(t, !isSolid(this.tileAt(x, y - 1) as T));
    if (idx < 0 || t === T.Empty) this.layer.removeTileAt(x, y);
    else { const tile = this.layer.putTileAt(idx, x, y); if (t === T.OneWay) tile.setCollision(false, false, true, false); else if (isSolid(t)) tile.setCollision(true, true, true, true); }
    this.layer.calculateFacesWithin(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3);
  }

  private sector = -1;
  configureTrial(wave: number) {
    if (this.room.id !== 'trial_arena' || this.sector === trialSector(wave)) return false;
    this.sector = trialSector(wave); this.room = trialArena(ROOMS.trial_arena, wave);
    const next = new Grid(this.room.rows);
    for (let y = 0; y < next.h; y++) for (let x = 0; x < next.w; x++) this.classic.grid.set(x, y, next.get(x, y));
    this.art.load(); this.visuals.clear(); this.visuals.load(); this.hud.roomEntered(this.room); return true;
  }

  private flag(c?: string) { return !c || (c.startsWith('!') ? !this.save.flags[c.slice(1)] : !!this.save.flags[c]); }

  private clearRoom() {
    this.visuals.clear();
    for (const c of this.colliders) c.destroy();
    this.colliders = [];
    for (const f of this.foeList) if (!f.removed) f.remove();
    this.foeList = [];
    for (const o of this.roomObjs) o.destroy();
    this.roomObjs = [];
    this.map?.destroy();
    this.map = undefined;
    this.layer = undefined as unknown as Phaser.Tilemaps.TilemapLayer;
    this.interactables = [];
    this.hints = [];
    this.triggers = [];
    this.gates = [];
    this.gateClosed = false;
    this.boss = null;
    this.cboss = null;
    this.cbossKey = null;
    this.brood = null;
    this.classic?.clear();
    this.hud?.bossBar?.(null);
    this.hud?.cinematicBars?.(false);
    this.hud?.closeWheel?.();
    this.hud?.caption?.(null);
    this.player?.destroy();
    this.deadT = 0;
    this.deathCounted = false;
    this.sector = -1;
  }

  loadRoom(id: string, spawnName: string) {
    this.clearRoom();
    this.refreshStats();
    const r = (this.room = ROOMS[id]);
    if (r.music) music.play(r.music);
    this.entrySpawn = r.spawns[spawnName] ? spawnName : r.spawns.start ? 'start' : Object.keys(r.spawns)[0];
    this.save.room = id;
    this.save.spawn = this.entrySpawn;
    this.gw = r.w;
    this.gh = r.h;
    this.grid = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) this.grid[y * r.w + x] = CHAR_TILE[r.rows[y][x]] ?? T.Empty;
    // The arena gate stands open until a fight closes it.
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === T.Gate) { this.grid[i] = T.Empty; this.gates.push(i); }

    this.classic.load();
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) this.grid[y * r.w + x] = this.classic.grid.get(x, y) === T.Gate ? T.Empty : this.classic.grid.get(x, y);
    this.buildBackdrop(r);
    this.buildTiles(r);
    this.layer.setVisible(false);
    this.art.load();
    this.physics.world.setBounds(0, 0, r.w * TILE, r.h * TILE + 64);
    const sp = r.spawns[this.entrySpawn];
    this.player = new Player(this, sp.x * TILE + 8, sp.y * TILE, sp.face ?? 1);
    this.classic.attachPlayer();
    this.colliders.push(this.physics.add.collider(this.player.rect, this.layer, undefined, (_o, t) => this.passable(t as Phaser.Tilemaps.Tile, this.player.dropT > 0), this));
    for (const e of r.ents) this.spawnEnt(e);
    if (this.classic.storyEnabled && id === 'covenant_chamber' && !this.save.flags.relic_taken) this.classic.addRelic();
    placeLamps(r);
    // The Echoes come along through every door, unless they were dismissed.
    if (this.save.echoes.length && this.save.flags.army_out !== false) this.classic.summonEchoes(true);
    this.fitCamera();
    this.visuals.load();
    this.cameras.main.startFollow(this.player.rect, true, 0.14, 0.12, 0, 24);
    this.cameras.main.setDeadzone(24, 40);
    this.hud.roomEntered?.(r);
    const first = !this.save.visited.includes(id); if (first) this.save.visited.push(id);
    this.classic.enter(first);
    this.persist();
  }

  /** One-way platforms only catch from above, and let go while dropping through. */
  private passable(tile: Phaser.Tilemaps.Tile, dropping: boolean) {
    return !(tile.index === TI.oneway && dropping);
  }

  private buildBackdrop(r: RoomDef) {
    const { sky, far, near, pal } = backdropTextures(this, r.biome, r.interior);
    const cam = this.cameras.main;
    cam.setBackgroundColor(pal.sky[1]);
    const s = this.add.image(0, 0, sky).setOrigin(0).setScrollFactor(0).setDepth(-30);
    const f = this.add.tileSprite(0, 0, 10, 10, far).setOrigin(0, 1).setScrollFactor(0).setDepth(-20);
    const n = this.add.tileSprite(0, 0, 10, 10, near).setOrigin(0, 1).setScrollFactor(0).setDepth(-10);
    this.bg = { sky: s, far: f, near: n };
    this.roomObjs.push(s, f, n);
  }

  private buildTiles(r: RoomDef) {
    const key = biomeTileset(this, r.biome);
    const map = (this.map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: r.w, height: r.h }));
    const ts = map.addTilesetImage(key, key, TILE, TILE, 1, 2)!;
    this.layer = map.createBlankLayer('ground', ts)!.setDepth(0);
    const fluid = map.createBlankLayer('fluid', ts)!.setDepth(14).setAlpha(0.9);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const t = this.tileAt(x, y) as T;
      if (t === T.Empty) continue;
      const idx = tileIndex(t, !isSolid(this.tileAt(x, y - 1) as T));
      if (idx < 0) continue;
      if (t === T.Water || t === T.Veil) { fluid.putTileAt(idx, x, y); continue; }
      const tile = this.layer.putTileAt(idx, x, y);
      if (t === T.OneWay) tile.setCollision(false, false, true, false);
      else if (isSolid(t)) tile.setCollision(true, true, true, true);
    }
    // Only exposed faces collide, so bodies slide along floors without snagging on seams.
    this.layer.calculateFacesWithin(0, 0, r.w, r.h);
    fluid.setVisible(false);
    this.roomObjs.push(this.layer, fluid);
  }

  private spawnEnt(e: EntDef) {
    if ('cond' in e && !this.flag(e.cond)) return;
    if ('ncond' in e && e.ncond && this.flag(e.ncond)) return;
    if (this.classic.storyEnabled && this.classic.spawnProp(e)) return;
    const x = ('x' in e ? e.x : 0) * TILE, y = ('y' in e ? (e as { y: number }).y : 0) * TILE;
    switch (e.t) {
      case 'enemy': {
        // The original's foe, with its own moves and art. An elite once purified, or an
        // objective commander once fallen, stays gone.
        const obj = e.elite ? fallenObjective(e.elite) : undefined;
        if (e.elite && (this.save.defeated?.includes(e.elite) || (obj && this.save.flags[obj.flag]))) return;
        const en = makeEnemy(e.k, x, y, e.elite ?? null);
        if (e.face) en.face = e.face;
        this.classic.add(en);
        return;
      }
      case 'boss': {
        if (isClassicBoss(e.k)) { this.spawnClassicBoss(e.k, e.x * TILE, e.y * TILE); return; }
        if (!bossPorted(e.k) || this.save.flags[`defeated_${e.k}`]) return;
        this.boss = makeBoss(this, e.k, x + 8, y);
        this.addFoe(this.boss);
        return;
      }
      case 'trigger':
        this.triggers.push({ id: e.id, r: new Phaser.Geom.Rectangle(e.x * TILE, e.y * TILE, e.w * TILE, e.h * TILE) });
        return;
      case 'shrine': {
        const o = fallenObjective(e.grants);
        if (!o || this.save.flags[o.flag]) return;
        const col = e.grants.startsWith('cinder_') ? 0xffd090 : e.grants.startsWith('grecia_') ? 0xffb060 : 0xbadc8b;
        const glow = this.add.image(x, y - 24, 'glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2).setDepth(-2);
        const mark = this.add.graphics().setDepth(2);
        mark.lineStyle(2, col, 1).strokeCircle(x, y - 24, 9).lineBetween(x - 9, y - 24, x + 9, y - 24).lineBetween(x, y - 33, x, y - 15);
        this.tweens.add({ targets: [glow], alpha: 0.5, yoyo: true, repeat: -1, duration: 700 });
        this.roomObjs.push(glow, mark);
        const label = e.grants.startsWith('cinder_') ? 'Release' : e.grants.startsWith('grecia_') ? 'Relight' : 'Cleanse';
        const it: Interactable = {
          x, y, label, use: () => {
            // The original's rule: clear the guards near it first.
            if (this.foes().some((f) => f.alive && Math.abs(f.x - x) < 190 && f !== this.boss)) { this.hud.toast('Clear the nearby guards first.'); return; }
            this.objective(o.id);
            this.spark(x, y - 24, col, 16);
            glow.destroy(); mark.destroy();
            this.interactables = this.interactables.filter((i) => i !== it);
          },
        };
        this.interactables.push(it);
        return;
      }
      case 'light': {
        const col = Phaser.Display.Color.HexStringToColor(e.c ?? (e.k === 'window' ? '#9fc4ff' : '#ffb35a')).color;
        const g = this.add.image(x + 8, y - (e.k === 'brazier' || e.k === 'forge' ? 10 : 14), 'glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(-5);
        const rr = (e.r ?? (e.k === 'window' ? 90 : 60)) / 32;
        g.setScale(rr).setAlpha(0.55);
        this.tweens.add({ targets: g, alpha: 0.38, scale: rr * 0.92, yoyo: true, repeat: -1, duration: 160 + Math.random() * 240, ease: 'Sine.inOut' });
        if (e.k === 'torch' || e.k === 'brazier' || e.k === 'candles') {
          const flame = this.add.image(x + 8, y - 14, 'glow').setTint(0xffd27a).setScale(0.18, 0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(-4);
          this.tweens.add({ targets: flame, scaleY: 0.22, yoyo: true, repeat: -1, duration: 90 + Math.random() * 80 });
          this.roomObjs.push(flame);
        }
        this.roomObjs.push(g);
        return;
      }
      case 'altar': {
        const g = this.add.graphics().setDepth(1);
        g.fillStyle(0x3a3238, 1).fillRect(x - 2, y - 14, 20, 14).fillStyle(0x5a4e56, 1).fillRect(x - 4, y - 16, 24, 3);
        g.fillStyle(0xe2b85a, 1).fillRect(x + 6, y - 12, 4, 8);
        const glow = this.add.image(x + 8, y - 20, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.5).setDepth(-3);
        this.roomObjs.push(g, glow);
        this.interactables.push({ x: x + 8, y, label: 'Rest', use: () => this.rest(e.id) });
        return;
      }
      case 'chest': {
        if (this.save.opened.includes(e.id) || this.save.flags[`chest_${e.id}`]) return;
        const g = this.add.graphics().setDepth(1);
        g.fillStyle(0x5a3a22, 1).fillRect(x, y - 10, 16, 10).fillStyle(0x7a5232, 1).fillRect(x, y - 12, 16, 4).fillStyle(0xe2b85a, 1).fillRect(x + 7, y - 8, 2, 3);
        this.roomObjs.push(g);
        const it: Interactable = {
          x: x + 8, y, label: 'Open', use: () => {
            this.save.opened.push(e.id);
            for (const l of e.loot) this.collect(l);
            g.destroy();
            this.interactables = this.interactables.filter((i) => i !== it);
            this.persist();
          },
        };
        this.interactables.push(it);
        return;
      }
      case 'npc': {
        // A cloaked stand-in until the NPC art and dialogue are ported.
        const g = this.add.graphics().setDepth(5);
        g.fillStyle(0x2a2230, 1).fillTriangle(x + 8, y - 34, x - 1, y, x + 17, y).fillStyle(0xd8b890, 1).fillCircle(x + 8, y - 30, 4);
        const name = e.k.charAt(0).toUpperCase() + e.k.slice(1).replace(/_/g, ' ');
        const t = this.add.text(x + 8, y - 44, name, { fontFamily: 'Georgia, serif', fontSize: '8px', color: '#e2b85a' }).setOrigin(0.5).setResolution(4).setDepth(5);
        this.roomObjs.push(g, t);
        this.interactables.push({ x: x + 8, y, label: 'Talk', use: () => this.hud.toast(`${name} · dialogue arrives with the story port`) });
        return;
      }
      case 'hint':
        this.hints.push({ x0: e.x * TILE, x1: (e.x + e.w) * TILE, text: e.text, id: e.id });
        return;
      default:
        // Lore, pickups, decor, water currents and the older bosses come in later parts.
        return;
    }
  }

  // ---------------------------------------------------------------- camera

  baseZoom = 1;
  fitCamera() {
    if (!this.room) return;
    const cam = this.cameras.main;
    const { width: W, height: H } = this.scale;
    cam.setSize(W, H);
    const r = this.room;
    // 300 world px tall, but never wider than the room (small rooms fill the screen).
    const height = VIEW_H * (settings.zoom === 'close' ? 0.82 : settings.zoom === 'wide' ? 1.2 : 1);
    let zoom = H / height;
    zoom = Math.max(zoom, W / (r.w * TILE), H / (r.h * TILE));
    this.baseZoom = zoom;
    cam.setZoom(zoom);
    cam.setBounds(0, 0, r.w * TILE, r.h * TILE);
    const { sky, far, near } = this.bg;
    sky?.setDisplaySize(W / zoom, H / zoom).setPosition(0, 0);
    // Scroll-factor-0 objects are still zoomed about the camera's centre; place them in view space.
    const vw = W / zoom, vh = H / zoom, ox = (W - vw) / 2, oy = (H - vh) / 2;
    sky?.setPosition(ox, oy);
    far?.setPosition(ox, oy + vh).setSize(vw, 140);
    near?.setPosition(ox, oy + vh).setSize(vw, 110);
  }

  /** The far and near bands slide slower than the room and stand on its floor line. */
  private parallax() {
    const cam = this.cameras.main, { far, near } = this.bg;
    if (!far || !near) return;
    const zoom = cam.zoom, vh = this.scale.height / zoom, oy = (this.scale.height - vh) / 2;
    const floor = (this.room.h - 3) * TILE - cam.worldView.y;
    far.tilePositionX = cam.scrollX * 0.2;
    near.tilePositionX = cam.scrollX * 0.45;
    // Further away rides higher, as a horizon does.
    far.y = oy + Math.min(vh, floor - 20 + (cam.worldView.y - (this.room.h * TILE - vh)) * 0.2);
    near.y = oy + Math.min(vh, floor + (cam.worldView.y - (this.room.h * TILE - vh)) * 0.45);
  }

  // ---------------------------------------------------------------- the loop

  update(_t: number, delta: number) {
    if (!this.ready) return;
    const rawDt = Math.min(delta / 1000, 1 / 30);
    const dt = rawDt * this.classic.simulationScale;
    this.physics.world.timeScale = 1 / this.classic.simulationScale;
    this.parallax();
    this.art.render();
    // Hit-stop freezes the moment; input waits (latched) so a press made in it still lands after.
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      if (this.hitstopT <= 0) this.physics.resume();
      return;
    }
    this.controls.locked = false;
    this.controls.poll();
    if (this.transitioning) return;
    if (this.classic.storyEnabled) tickCoach(rawDt);
    // The Echo wheel holds the world while it is up.
    if (this.hud.wheelOpen) { this.hud.wheelInput(dt); return; }
    // The pause menu holds the world and takes the keys and pad.
    if (this.hud.paused || G.paused || blockingUI() || topLayer()) { this.physics.pause(); this.hud.sync(this); return; }
    if (this.physics.world.isPaused) this.physics.resume();
    if (this.controls.pressed('map') && !G.inCutscene) { G.ui.openMenu('map'); return; }
    if (this.controls.pressed('menu') && !G.inCutscene) { this.hud.togglePause(); return; }
    if (this.controls.pressed('echo') && !G.inCutscene && !this.player.dead) { this.hud.openWheel(); return; }
    if (this.controls.pressed('switch') && !G.inCutscene && !this.player.dead) this.classic.squad.switchSupport();
    this.controls.locked = G.inCutscene;
    this.player.update(dt);
    for (const f of this.foeList) if (!f.removed) f.update(dt * this.classic.nativeScale(f));
    this.foeList = this.foeList.filter((f) => !f.removed);
    this.classic.update(rawDt);
    this.classic.render();
    if (this.boss?.fighting) {
      if (music.name !== this.boss.key) music.play(this.boss.key, 0.6);
      music.bossPhase(Math.max(0, this.boss.phase - 1));
    }
    music.setIntensity(this.boss?.fighting || this.classic.bossActive ? 1 : this.foes().some((f) => f.alive && Math.abs(f.x - this.player.x) < 200) ? 0.7 : 0);
    if (this.cboss?.remove) this.cboss = null;
    this.updateBrood();

    // Interact with the nearest thing in reach; beside a kneeling elite, hold to purify it.
    const kneeling = this.updatePurify(dt);
    const near = kneeling ? null : this.nearest();
    const original = this.classic.storyEnabled ? this.classic.updateInteract() : null;
    this.hud.setInteract(kneeling ? 'Hold to purify' : original ?? near?.label ?? null);
    if (!this.player.dead && !G.inCutscene && this.controls.pressed('interact')) { if (original) this.classic.tryInteract(); else near?.use(); }
    // Hints show while Elior walks through their stretch of the room.
    const hint = this.hints.find((h) => this.player.x >= h.x0 && this.player.x <= h.x1);
    this.hud.setHint(hint?.text ?? null);

    if (this.classic.storyEnabled) valorTick(dt);
    if (this.player.dead) {
      this.deadT += dt;
      if (!this.deathCounted) { this.deathCounted = true; this.save.deaths++; }
      const R = this.classic.story.ch3.rounds;
      if (this.room.id === 'trial_arena' && R.active && !this.classic.deathHandled) { this.classic.deathHandled = true; this.classic.after(1.8, async () => this.classic.afterRun(await R.onDeath())); }
      if (this.deadT > 1.4 && !this.classic.deathHandled) {
        if (this.classic.storyEnabled) { this.classic.deathHandled = true; void G.ui.death().then(() => this.respawn()); }
        else this.respawn();
      }
    } else {
      this.checkTriggers();
      this.checkExits();
    }
    // Below the room: back to the doorway.
    if (this.player.feet > this.gh * TILE + 40 && !this.player.dead) { this.player.hurt({ dmg: 15, dir: 0, hazard: true }); this.respawn(true); }

    // Autosave and time played measure real active time, independent of pacing.
    this.saveT += rawDt;
    this.save.playtime += rawDt;
    if (this.saveT > 30) this.persist();
    this.hud.sync(this);
  }

  private nearest() {
    let best: Interactable | null = null, bd = 30;
    for (const i of this.interactables) {
      const d = Math.abs(i.x - this.player.x);
      if (d < bd && Math.abs(i.y - this.player.feet) < 28) { bd = d; best = i; }
    }
    return best;
  }

  /** Step into a boss's trigger: it wakes and the gate shuts behind Elior. A sealed boundary says what is left. */
  private checkTriggers() {
    const p = this.player;
    for (const t of this.triggers) {
      if (!t.r.contains(p.x, p.feet - 4)) continue;
      if (this.classic.storyEnabled) { if (!G.inCutscene) this.classic.trigger(t.id); continue; }
      if (this.boss && t.id === `${this.boss.key}_start` && this.boss.state === 'dormant') { this.boss.awaken(); this.closeGate(true); }
      if (this.cboss && this.cbossKey && t.id === CLASSIC_BOSSES[this.cbossKey].trigger && this.cboss.state === 'dormant' && !this.brood) this.wakeClassic();
      const gate = /^ch(\d+)_gate$/.exec(t.id);
      if (gate && !this.save.flags[`ch${gate[1]}_boundary_open`] && !this.save.flags[`toast_${t.id}`]) {
        const c = FALLEN_CHAPTERS.find((c) => c.n === Number(gate[1]));
        const left = c?.objectives.filter((o) => !this.save.flags[o.flag]).map((o) => `the ${o.name} in ${ROOMS[o.room]?.name ?? o.room}`) ?? [];
        this.toast(`The boundary is still sealed. Still to do: ${left.join(' and ')}.`);
        this.save.flags[`toast_${t.id}`] = true;
        this.time.delayedCall(6000, () => { delete this.save.flags[`toast_${t.id}`]; });
      }
    }
  }

  /** The arena gate: solid while a boss fight is on. */
  closeGate(on: boolean) {
    if (this.gateClosed === on || !this.gates.length) return;
    this.gateClosed = on;
    for (const i of this.gates) {
      const x = i % this.gw, y = Math.floor(i / this.gw);
      this.grid[i] = on ? T.Gate : T.Empty;
      if (on) this.layer.putTileAt(TI.gate, x, y).setCollision(true, true, true, true);
      else this.layer.removeTileAt(x, y);
    }
    this.layer.calculateFacesWithin(0, 0, this.gw, this.gh);
  }

  /** A Fallen Crown objective done (a commander felled, a wheel released, a heart cleansed). */
  private objective(id: string) {
    const o = fallenObjective(id);
    if (!o || this.save.flags[o.flag]) return;
    this.save.flags[o.flag] = true;
    const c = FALLEN_CHAPTERS.find((c) => c.objectives.some((x) => x.id === id));
    if (!c) return;
    const done = c.objectives.filter((x) => this.save.flags[x.flag]).length;
    const open = done === c.objectives.length;
    if (open) this.save.flags[`ch${c.n}_boundary_open`] = true;
    this.banner(o.name.toUpperCase(), open ? 'The boundary is broken · the throne road is open' : `${done}/${c.objectives.length} objectives complete`);
    this.persist();
  }

  private checkExits() {
    const b = this.player.body;
    for (const ex of this.room.exits) {
      if (!this.flag(ex.cond)) continue;
      const r = new Phaser.Geom.Rectangle(ex.x * TILE, ex.y * TILE, ex.w * TILE, ex.h * TILE);
      if (Phaser.Geom.Rectangle.Overlaps(r, new Phaser.Geom.Rectangle(b.left, b.top, b.width, b.height))) {
        if (!ROOMS[ex.to]) continue;
        this.goTo(ex.to, ex.spawn);
        return;
      }
    }
  }

  goTo(id: string, spawn: string) {
    if (this.transitioning || !ROOMS[id]) return;
    this.transitioning = true;
    this.save.hp = this.player.hp;
    this.controls.flush();
    const cam = this.cameras.main;
    cam.fadeOut(170, 7, 6, 10);
    cam.once('camerafadeoutcomplete', () => {
      this.loadRoom(id, spawn);
      cam.fadeIn(220, 7, 6, 10);
      this.transitioning = false;
      if (updatePending() && !G.inCutscene && !this.classic.story.ch3.rounds.active) void checkForUpdates(() => this.persist());
    });
  }

  /** Fallen: rise again at the doorway of this room, whole. */
  private respawn(keepHp = false) {
    this.deadT = 0;
    // Rising after a fall is a rest, as in the original: the Balm comes back too.
    if (!keepHp) this.save.balm = this.save.balmMax;
    const hp = this.player.hp;
    this.save.hp = keepHp ? Math.max(1, hp) : -1;
    this.transitioning = true;
    const cam = this.cameras.main;
    cam.fadeOut(260, 7, 6, 10);
    cam.once('camerafadeoutcomplete', () => {
      this.loadRoom(this.room.id, this.entrySpawn);
      cam.fadeIn(300, 7, 6, 10);
      this.transitioning = false;
    });
  }

  rest(id = 'sanctuary') {
    this.player.heal();
    this.player.hp = this.d.maxHp; this.save.ce = this.save.flags.relic_taken ? this.d.maxCe : 0;
    for (const e of this.save.echoes) { e.hp = echoMaxHp(this.save, e, this.d); e.downFor = 0; }
    for (const e of this.classic.echoes) { e.hp = e.maxHp; e.inst.hp = e.hp; }
    this.save.balm = this.save.balmMax;
    this.save.hp = this.player.hp;
    this.save.flags[`altar_${id}`] = true;
    this.persist();
    this.spark(this.player.x, this.player.feet - 20, 0xffd27a, 14);
    this.hud.toast('Rested · health and Balm restored · saved');
  }

  persist() {
    if (!this.player) return;
    this.save.hp = this.player.dead ? -1 : this.player.hp;
    writeSave(this.save);
    this.saveT = 0;
  }

  // ---------------------------------------------------------------- WorldApi

  /** Everything Elior can strike: the Phaser foes and bosses, and the classic ones. */
  foes() {
    if (!this.classic.ents.length) return this.foeList;
    const all = this.allFoes;
    all.length = 0;
    for (const f of this.foeList) all.push(f);
    for (const f of this.classic.playerFoes()) all.push(f);
    return all;
  }

  addFoe(f: FoeLike) {
    this.foeList.push(f);
    this.classic.addNative(f);
    if (f.rect) this.colliders.push(this.physics.add.collider(f.rect, this.layer));
  }

  roomW() { return this.gw * TILE; }
  castCovenant(id: SkillId) { castAbility(this.classic.playerView as unknown as OriginalPlayer, id); }

  lightWave() {
    const p = this.player;
    this.classic.add(new Proj('lightwave', p.x + p.face * 14, p.feet - 14, 'player', p.skillPower() * 0.8, { vx: p.face * 380, life: 0.55, w: 18, h: 30, poise: 10 }));
  }
  playEffect(name: string) { sfx(name); }
  heroHit(f: FoeLike, damage: number, heavy: boolean, crit = false) { const e = this.classic.entityFor(f); if (e) this.classic.hero?.onHit(e, damage, heavy, crit); this.visuals.impact(f.x, f.box.centerY, heavy, crit); }
  strikeLamps(box: { x: number; y: number; w: number; h: number }) { strikeLamps(box); }
  banner(title: string, sub: string) { this.hud.banner(title, sub); }
  toast(text: string) { this.hud.toast(text); }

  /** Save and go back to the title. */
  quitToTitle() {
    this.persist();
    this.scene.stop('hud');
    this.scene.start('title');
  }
  bossBar(name: string | null, sub = '') { this.hud.bossBar(name, sub); }

  // ---------------------------------------------------------------- stats and loot

  /** Elior's stats from the save, as the original derives them (level, stat points, skills, gear). */
  refreshStats() {
    this.d = stats(this.save);
    G.d = this.d;
    if (this.player) { this.player.maxHp = this.d.maxHp; this.player.maxCe = this.d.maxCe; }
  }

  /** A chest's loot, as the original's world.collect gives it. */
  collect(l: { silver?: number; mat?: string; n?: number; item?: string; rarity?: number }) {
    const s = this.save;
    if (l.silver) {
      s.silver += l.silver;
      this.floatText(this.player.x + 10, this.player.feet - 40, `+${l.silver}`, '#e8e2d0');
    } else if (l.mat) {
      addMaterial(s, l.mat, l.n ?? 1);
      this.toast(`${ITEMS[l.mat]?.name ?? l.mat}${(l.n ?? 1) > 1 ? ' ×' + l.n : ''}`);
    } else if (l.item && ITEMS[l.item]) {
      const base = ITEMS[l.item];
      if (base.slot === 'key') { if (!s.keyItems.includes(l.item)) s.keyItems.push(l.item); this.toast(base.name); return; }
      const it = makeItem(l.item, (l.rarity ?? base.rarity) as Rarity);
      it.isNew = true;
      s.inventory.push(it);
      this.toast(`${base.name} · in your pack (Menu → Elior → Equipment)`);
    }
  }

  // ---------------------------------------------------------------- purification

  /** A beaten elite kneels in the Veil's grip; holding interact beside it cleanses it (the original's world.ts). */
  private updatePurify(dt: number): Enemy | null {
    const p = this.player;
    let target: Enemy | null = null;
    if (!p.dead && !G.inCutscene) {
      for (const e of this.classic.ents) {
        if (e instanceof Enemy && e.awaitingPurify && !e.remove && Math.abs(e.x - p.x) < 70 && Math.abs(e.y - p.feet) < 50) target = e;
      }
    }
    if (!target) { this.purifyHold = 0; return null; }
    if (this.controls.down('interact') || this.controls.down('up')) {
      this.purifyHold += dt;
      if (Math.random() < dt * 40) fx.spawn(PK.Mote, target.cx + Phaser.Math.FloatBetween(-14, 14), target.cy + Phaser.Math.FloatBetween(-14, 14), (p.x - target.x) * 0.8, -20, 0.5, 6, 1, '#ffe6a8');
      if (this.purifyHold >= 1.1) { this.purifyHold = 0; this.purify(target); }
    } else this.purifyHold = Math.max(0, this.purifyHold - dt * 2);
    return target;
  }

  /** The Veil burns away: the elite's battle-imprint is cleansed into an Echo (raised when the Echo port lands). */
  private purify(e: Enemy) {
    if (this.classic.storyEnabled) { void this.classic.story.purify(e); return; }
    const s = this.save;
    const species = ({ archer: 'archer', brute: 'brute', bulwark: 'bulwark', knight: 'knight', lion: 'lion' } as Record<string, string>)[e.kind] ?? 'sentinel';
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 160, () => { fx.veilBurst(e.cx, e.cy, 10, 1.2); fx.holyBurst(e.cx, e.cy, 8, 0.8); });
    this.time.delayedCall(1000, () => {
      fx.column(e.x, e.y, 70, 320, '#fff3c4', 2.0);
      fx.flash('#ffffff', 0.7);
      fx.ring(e.x, e.y - 2, 8, 120, '#ffe6a8', 0.8, 4, 0.3);
      this.shake(0.008, 300);
      e.remove = true;
    });
    if (e.elite) (s.defeated ??= []).includes(e.elite) || s.defeated.push(e.elite);
    const echo = absorbEcho(s, species, this.d);
    // The first purification, in the Covenant Chamber, is what opens the way on.
    if (e.elite === 'chamber_sentinel') { s.flags.chamber_done = true; s.flags.has_echo = true; }
    const sp = ECHO_SPECIES[species];
    this.time.delayedCall(1100, () => {
      const title = echo?.evolved ? 'ECHO EVOLVED' : echo?.created ? 'ECHO PURIFIED' : 'ECHO REINFORCED';
      this.banner(title, sp && echo ? `${sp.stages[echo.echo.stage].name} · ${sp.cls}` : 'An Echo stands with you');
      this.toast('Not a soul: a memory of its courage, cleansed of the Veil. Lead it from Menu → Echoes.');
      this.giveXp(60, e.x, e.y - 30);
    });
    this.persist();
  }

  // ---------------------------------------------------------------- classic bosses

  /** A classic boss on its mark, with the original's own health on Hard. */
  private spawnClassicBoss(k: ClassicBossKey, x: number, y: number) {
    const finishing = this.classic.storyEnabled && ({ golden_image: 'ch4_image_done', weigher: 'ch5_weigher_done', storm_prince: 'ch6_storm_done', persia_prince: 'ch6_prince_done' } as Record<string, string>)[k];
    if (this.save.defeated?.includes(k) && (!finishing || this.save.flags[finishing])) return;
    const def = CLASSIC_BOSSES[k], b = def.make(x, y);
    this.classic.add(b);
    this.classic.boss = b;
    this.cboss = b;
    this.cbossKey = k;
  }

  /** Into the arena: the gate shuts and the boss rises (the Locust King's brood first). */
  private wakeClassic() {
    const k = this.cbossKey!, def = CLASSIC_BOSSES[k];
    if (def.boundary && !this.save.flags[`ch${def.chapter}_boundary_open`]) return;
    this.classic.bossActive = true;
    this.closeGate(true);
    this.player.body.setVelocityX(0);
    if (def.waves && !this.save.flags.brood_cleared) {
      this.brood = { i: -1, foes: [] };
      this.banner('THE BROOD AWAKENS', 'Hold until the cocoon opens');
      return;
    }
    this.raiseClassic();
  }

  private raiseClassic() {
    const b = this.cboss;
    if (!b || b.state !== 'dormant') return;
    if (this.cbossKey === 'locust_king') this.save.flags.king_hatched = true;
    // The boss's own intro runs as a short cutscene; its first blow ends it.
    G.inCutscene = true;
    this.hud.cinematicBars(true);
    b.awaken();
  }

  /** The brood's waves, one after another, then the cocoon opens. */
  private updateBrood() {
    const br = this.brood, k = this.cbossKey;
    if (!br || !k) return;
    if (br.foes.some((f) => !f.remove && !f.dying)) return;
    const waves = CLASSIC_BOSSES[k].waves!;
    if (++br.i < waves.length) {
      const y = this.cboss!.y;
      br.foes = waves[br.i].map(([kind, tx]) => this.classic.spawnEnemy(kind, tx * TILE, y));
      return;
    }
    this.brood = null;
    this.save.flags.brood_cleared = true;
    this.shake(0.012, 600);
    // A fast doorway/respawn must not let this room’s hatch awaken a new boss.
    const boss = this.cboss;
    this.time.delayedCall(600, () => { if (this.cboss === boss) this.raiseClassic(); });
  }

  /** What the boss bar shows: the Crown, or the classic boss. */
  get bossView(): BossView | null {
    if (this.boss) return this.boss;
    const b = this.cboss ?? this.classic.boss as ClassicBoss | null;
    if (!b) return null;
    const v = this.cbView;
    v.alive = !b.dying && !b.remove;
    v.state = b.state;
    v.hp = b.hp;
    v.maxHp = b.maxHp;
    v.ward = b.invuln > 0;
    v.phaseMarks = b.phaseMarks ?? [];
    v.poise = b.poise;
    v.maxPoise = b.maxPoise;
    return v;
  }
  private cbView: BossView = { alive: false, state: '', hp: 0, maxHp: 1, ward: false, phaseMarks: [], poise: 0, maxPoise: 1 };

  /** A classic boss down: the flags its story scene would set, the gate, and its experience. */
  onClassicBossDefeated(key: string) {
    const k = key as ClassicBossKey, def = CLASSIC_BOSSES[k];
    (this.save.defeated ??= []).includes(k) || this.save.defeated.push(k);
    this.save.flags[`defeated_${k}`] = true;
    for (const f of def?.flags ?? []) this.save.flags[f] = true;
    G.inCutscene = false;
    this.hud.cinematicBars(false);
    this.hud.bossBar(null);
    this.closeGate(false);
    this.banner('VICTORY', 'The way ahead is open');
    const lv = chapterCurve(def?.chapter ?? 1).level;
    this.time.delayedCall(1800, () => this.onFoeDied(Math.round(xpToNext(lv) * 0.6), (def?.chapter ?? 1) * 150, this.player.x, this.player.y));
    this.persist();
  }

  /** A Crown broken: the chapter is done, the gate opens, and its experience is Elior's. */
  onBossDefeated(key: string) {
    if (this.classic.storyEnabled && this.boss) { const e = this.classic.entityFor(this.boss); if (e) this.classic.onBossDefeated(e as any); this.boss = null; return; }
    music.play('victory');
    const n = BOSS_CHAPTER[key as keyof typeof BOSS_CHAPTER];
    this.save.flags[`defeated_${key}`] = true;
    if (n) this.save.flags[`ch${n}_done`] = true;
    this.closeGate(false);
    this.boss = null;
    const name = key === 'beast_monarch' ? 'Varkhos' : key === 'plague_monarch' ? 'Morvane' : 'Azkar';
    this.banner('THE CROWN IS BROKEN', `${name} has fallen · the road belongs to the living again`);
    const xp = n ? chapterCurve(n).clearXp ?? 10000 : 10000;
    this.time.delayedCall(2200, () => this.onFoeDied(xp, (n ?? 7) * 300, this.player.x, this.player.y));
    this.persist();
  }

  hitstop(sec: number) {
    if (this.hitstopT > 0) return;
    this.hitstopT = sec;
    this.physics.pause();
  }

  private nextShakeAt = 0;
  shake(intensity: number, ms: number) {
    // Ordinary impacts stay steady. Even major impacts cannot chain into
    // continuous shaking or move the camera by a large fraction of the phone.
    if (intensity < 0.007 || this.time.now < this.nextShakeAt) return;
    const amount = Math.min(0.002, intensity * 0.2) * shakeScale();
    if (!amount) return;
    this.nextShakeAt = this.time.now + 900;
    this.cameras.main.shake(Math.min(ms, 160), amount);
  }

  floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: 'Cinzel, Georgia, serif', fontSize: '9px', color, stroke: '#07050a', strokeThickness: 2, fontStyle: 'bold' })
      .setOrigin(0.5).setResolution(4).setDepth(20);
    this.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  spark(x: number, y: number, color: number, n = 6) {
    for (let i = 0; i < n; i++) {
      const p = this.add.rectangle(x, y, 2, 2, color).setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
      const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 18;
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 260 + Math.random() * 200, ease: 'Quad.out', onComplete: () => p.destroy() });
    }
  }

  onFoeDied(xp: number, silver: number, x: number, y: number, eliteId?: string) {
    if (eliteId) this.objective(eliteId);
    this.save.kills++;
    this.save.silver += silver;
    this.giveXp(xp, x, y);
  }

  giveXp(xp: number, x = this.player.x, y = this.player.y) {
    const s = this.save;
    const lvBefore = s.level;
    // Story XP catches a player up to the chapter's arrival level; the Trial pays by its own rules.
    if (this.room.id !== 'trial_arena') xp = Math.round(xp * catchUpXp(s.level, chapterOf(this.room.id)));
    const levels = gainXp(s, xp);
    fx.number(this.player.x, this.player.y - 56, `+${xp} XP`, false, '#cfe6ff');
    if (levels > 0) {
      const slotsBefore = G.d.echoSlots;
      this.refreshStats();
      s.hp = G.d.maxHp;
      this.classic.playerView.styleKey = '';
      G.ui.levelUp(levels);
      islandNotify(`LEVEL ${s.level}`, '#f6dea0', 'stats', 2.8);
      islandRipple('#ffd27a');
      for (const ec of this.classic.echoes) ec.refreshStats();
      // New finishers and power tiers announce themselves.
      const fins = FINISHERS.filter((f) => f.level > lvBefore && f.level <= s.level && f.level > 1);
      fins.forEach((f, i) => this.classic.after(2.2 + i * 1.2, () => G.ui.toast(`New finisher: ${f.name} — ${f.desc}`, 'good')));
      if (lvBefore < SOVEREIGN_LV && s.level >= SOVEREIGN_LV) {
        this.classic.after(3.4, () => {
          G.ui.banner('SOVEREIGN OF THE REMNANT', 'Every swing looses a crescent · Phantom Step costs nothing · ordinary blows cannot stagger you · the fallen rise to serve', 'ability');
          sfx('arise');
          fx.column(this.player.x, this.player.y, 60, 420, '#9a6aff', 2);
          fx.flash('#c9a8ff', 0.5);
        });
      } else if (powerTier(s.level) > powerTier(lvBefore)) {
        this.classic.after(2.6, () => G.ui.toast('Your strikes grow heavier and brighter.', 'good'));
      }
      // The Shadow Mantle wakes at 25 and deepens at 50, 75 and 100.
      if (lvBefore < MANTLE_LV && s.level >= MANTLE_LV) announceMantle(3.6);
      else if (lvBefore >= MANTLE_LV && mantleTier(s.level) > mantleTier(lvBefore)) {
        this.classic.after(3, () => G.ui.toast(`Your Shadow Mantle deepens: ${mantlePerks()}.`, 'good'));
      }
      if (G.d.echoSlots > slotsBefore) {
        // A wider covenant: bring benched Echoes into the line automatically.
        for (const e of s.echoes) {
          if (s.active.length >= G.d.echoSlots) break;
          if (!s.active.includes(e.uid)) s.active.push(e.uid);
        }
        this.classic.after(1.4, () => {
          G.ui.toast(`Your covenant widens: ${G.d.echoSlots} Echoes may now fight beside you.`, 'good');
          if (s.flags.army_out !== false) this.classic.summonEchoes();
        });
      }
    }
  }
}
