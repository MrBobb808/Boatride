// The world: builds a room from the shared room data (tiles, spawns, exits,
// entities), runs Elior and the foes, and moves between rooms through their
// doorways. The camera shows 300 world pixels of height, as the original does.

import Phaser from 'phaser';
import { ROOMS, CHAR_TILE, T, TILE, isSolid, type RoomDef, type EntDef } from '../shared';
import { Controls } from '../game/controls';
import { Player } from '../game/player';
import { Foe, foeDrawable } from '../game/foes';
import { biomeTileset, tileIndex, backdropTextures, TI } from '../game/tileset';
import { newSave, loadSave, writeSave, gainXp, type PhaserSave } from '../game/save';
import type { WorldApi } from '../game/types';
import type { Hud } from './Hud';

const VIEW_H = 300;

interface Interactable { x: number; y: number; label: string; use: () => void }

export class World extends Phaser.Scene implements WorldApi {
  controls!: Controls;
  save!: PhaserSave;
  room!: RoomDef;
  player!: Player;
  private grid = new Uint8Array(0);
  private gw = 0;
  private gh = 0;
  private foeList: Foe[] = [];
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
  private fresh = false;
  private ready = false;

  constructor() { super('world'); }

  get sc(): Phaser.Scene { return this; }

  init(data: { fresh?: boolean }) {
    this.fresh = !!data?.fresh;
  }

  get hud() { return this.scene.get('hud') as Hud; }

  create() {
    this.save = (!this.fresh && loadSave()) || newSave();
    this.controls = new Controls(this);
    // The HUD scene starts on the next step; the first room waits for it.
    this.ready = false;
    this.scene.launch('hud');
    this.scene.get('hud').events.once('create', () => {
      this.loadRoom(ROOMS[this.save.room] ? this.save.room : 'sanctuary', this.save.spawn);
      this.cameras.main.fadeIn(400, 7, 6, 10);
      this.ready = true;
    });
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitCamera, this));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });
    if (new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { __remnant: unknown }).__remnant = {
        game: this.game, world: this, controls: this.controls, rooms: ROOMS,
        warp: (id: string, spawn = 'start') => this.goTo(id, spawn),
        give: (xp: number) => this.onFoeDied(xp, 0, this.player.x, this.player.y),
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

  private flag(c?: string) { return !c || !!this.save.flags[c]; }

  private clearRoom() {
    for (const c of this.colliders) c.destroy();
    this.colliders = [];
    for (const f of this.foeList) if (!f.removed) f.remove();
    this.foeList = [];
    for (const o of this.roomObjs) o.destroy();
    this.roomObjs = [];
    this.map?.destroy();
    this.map = undefined;
    this.interactables = [];
    this.hints = [];
    this.player?.sprite.destroy();
    this.player?.slash.destroy();
    this.player?.rect.destroy();
  }

  loadRoom(id: string, spawnName: string) {
    this.clearRoom();
    const r = (this.room = ROOMS[id]);
    this.entrySpawn = r.spawns[spawnName] ? spawnName : r.spawns.start ? 'start' : Object.keys(r.spawns)[0];
    this.save.room = id;
    this.save.spawn = this.entrySpawn;
    this.gw = r.w;
    this.gh = r.h;
    this.grid = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) this.grid[y * r.w + x] = CHAR_TILE[r.rows[y][x]] ?? T.Empty;
    // The arena gate stands open until a fight closes it.
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === T.Gate) this.grid[i] = T.Empty;

    this.buildBackdrop(r);
    this.buildTiles(r);
    this.physics.world.setBounds(0, 0, r.w * TILE, r.h * TILE + 64);
    const sp = r.spawns[this.entrySpawn];
    this.player = new Player(this, sp.x * TILE + 8, sp.y * TILE, sp.face ?? 1);
    this.colliders.push(this.physics.add.collider(this.player.rect, this.layer, undefined, (_o, t) => this.passable(t as Phaser.Tilemaps.Tile, this.player.dropT > 0), this));
    for (const e of r.ents) this.spawnEnt(e);
    this.fitCamera();
    this.cameras.main.startFollow(this.player.rect, true, 0.14, 0.12, 0, 24);
    this.cameras.main.setDeadzone(24, 40);
    this.hud.roomEntered?.(r);
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
    this.roomObjs.push(this.layer, fluid);
  }

  private spawnEnt(e: EntDef) {
    if ('cond' in e && !this.flag(e.cond)) return;
    if ('ncond' in e && e.ncond && this.flag(e.ncond)) return;
    const x = ('x' in e ? e.x : 0) * TILE, y = ('y' in e ? (e as { y: number }).y : 0) * TILE;
    switch (e.t) {
      case 'enemy': {
        if (!foeDrawable(e.k)) return;
        if (e.elite && this.save.flags[`elite_${e.elite}`]) return;
        const f = new Foe(this, e.k, x + 8, y, e.face ?? -1, !!e.elite);
        this.foeList.push(f);
        this.colliders.push(this.physics.add.collider(f.rect, this.layer));
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
        if (this.save.flags[`chest_${e.id}`]) return;
        const g = this.add.graphics().setDepth(1);
        g.fillStyle(0x5a3a22, 1).fillRect(x, y - 10, 16, 10).fillStyle(0x7a5232, 1).fillRect(x, y - 12, 16, 4).fillStyle(0xe2b85a, 1).fillRect(x + 7, y - 8, 2, 3);
        this.roomObjs.push(g);
        const it: Interactable = {
          x: x + 8, y, label: 'Open', use: () => {
            this.save.flags[`chest_${e.id}`] = true;
            const silver = e.loot.reduce((s, l) => s + (l.silver ?? 0), 0) || 50;
            this.save.silver += silver;
            this.hud.toast(`Chest · +${silver} silver (items arrive with the inventory port)`);
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
        // Lore, shrines, pickups, triggers, decor, water currents and bosses come in later parts.
        return;
    }
  }

  // ---------------------------------------------------------------- camera

  fitCamera() {
    if (!this.room) return;
    const cam = this.cameras.main;
    const { width: W, height: H } = this.scale;
    cam.setSize(W, H);
    const r = this.room;
    // 300 world px tall, but never wider than the room (small rooms fill the screen).
    let zoom = H / VIEW_H;
    zoom = Math.max(zoom, W / (r.w * TILE), H / (r.h * TILE));
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
    const dt = Math.min(delta / 1000, 1 / 30);
    this.controls.poll();
    this.parallax();
    if (this.transitioning) return;
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      if (this.hitstopT <= 0) this.physics.resume();
      return;
    }
    if (this.controls.pressed('menu')) { this.hud.togglePause(); return; }
    if (this.hud.paused) return;
    this.player.update(dt);
    for (const f of this.foeList) if (!f.removed) f.update(dt);
    this.foeList = this.foeList.filter((f) => !f.removed);

    // Interact with the nearest thing in reach.
    const near = this.nearest();
    this.hud.setInteract(near?.label ?? null);
    if (near && this.controls.pressed('interact') && !this.player.dead) near.use();
    // Hints show while Elior walks through their stretch of the room.
    const hint = this.hints.find((h) => this.player.x >= h.x0 && this.player.x <= h.x1);
    this.hud.setHint(hint?.text ?? null);

    if (this.player.dead) {
      this.deadT += dt;
      if (this.deadT > 1.4) this.respawn();
    } else this.checkExits();
    // Below the room: back to the doorway.
    if (this.player.feet > this.gh * TILE + 40 && !this.player.dead) { this.player.hurt(15, 0); this.respawn(true); }

    this.saveT += dt;
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
    });
  }

  /** Fallen: rise again at the doorway of this room, whole. */
  private respawn(keepHp = false) {
    this.deadT = 0;
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

  private rest(id: string) {
    this.player.heal();
    this.save.hp = this.player.hp;
    this.save.flags[`altar_${id}`] = true;
    this.persist();
    this.spark(this.player.x, this.player.feet - 20, 0xffd27a, 14);
    this.hud.toast('Rested · health restored · saved');
  }

  persist() {
    if (!this.player) return;
    this.save.hp = this.player.dead ? -1 : this.player.hp;
    writeSave(this.save);
    this.saveT = 0;
  }

  // ---------------------------------------------------------------- WorldApi

  foes() { return this.foeList; }

  hitstop(sec: number) {
    if (this.hitstopT > 0) return;
    this.hitstopT = sec;
    this.physics.pause();
  }

  shake(intensity: number, ms: number) { this.cameras.main.shake(ms, intensity); }

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

  onFoeDied(xp: number, silver: number, x: number, y: number) {
    this.save.kills++;
    this.save.silver += silver;
    this.floatText(x, y - 10, `+${xp} XP`, '#9fc4ff');
    const ups = gainXp(this.save, xp);
    if (ups) {
      this.player.heal();
      this.hud.banner(`LEVEL ${this.save.level}`, 'Health restored · your blows grow stronger');
    }
  }
}
