// The World: loads rooms, runs every entity, resolves combat, handles exits,
// triggers, loot, altars, the Echo army, Rally the Remnant, and draws the
// whole layered scene.

import { ROOMS, type RoomData } from './rooms';
import { Grid, T, TILE, isSolid, type EntDef, type Loot } from './tiles';
import { Player } from './player';
import { Entity, type HitInfo } from './entity';
import { Enemy } from './enemies';
import { makeEnemy } from './foes';
import { EchoUnit } from './echoes';
import { Idol } from './boss';
import { BossBase, Gatekeeper, Marshal } from './bosses2';
import { LocustKing } from './bosses3';
import { Npc, Chest, Altar, LoreStone, Shrine, Pickup, Drop, RelicVisual, type Interactable } from './props';
import { Proj } from './projectiles';
import { Story } from './story';
import { G, flag, setFlag } from './ctx';
import { TileCache, buildParallax, drawSky, drawLiveProps, drawLiquids, drawGate, BIOMES, LIVE_DECOR, type Layer } from '../render/environment';
import { lighting } from '../render/lighting';
import { fx, PK } from '../render/fx';
import { glow, rgba, makeCanvas, releaseCanvas, FONT_DISPLAY, type Ctx } from '../render/draw';
import { overlaps, rand, clamp, sign, choose, randInt, type Rect } from '../core/math';
import { input } from '../core/input';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { shakeScale, settings } from '../core/settings';
import { guidePoint } from './guide';
import { tickStatus, powerTier, SOVEREIGN_LV } from './power';
import { updatePending, applyUpdate } from '../core/update';
import { FINISHERS } from './finishers';
import { ITEMS, ECHO_SPECIES, type Rarity } from './data';
import { gainXp, makeItem, addMaterial, derive, makeEcho, echoMaxHp, skillRank, type SaveData } from './state';
import { saveSlot } from './save';
import { noteSaved } from '../ui/hud';
import { solve, newJoints, BASE_POSE } from '../render/skeleton';
import { drawHumanoid } from '../render/actors';
import { SENT_DIMS, SENT_BASE, sentinelStyle, ARCH_DIMS, ARCH_BASE, archerStyle } from './enemies';

interface Weather { x: number; y: number; vx: number; vy: number; s: number; a: number; life: number }
interface Timer { at: number; fn: () => void }

export class World {
  room!: RoomData;
  grid!: Grid;
  player: Player;
  ents: Entity[] = [];
  echoes: EchoUnit[] = [];
  story: Story;
  cache: TileCache | null = null;
  layers: Layer[] = [];
  layerGen = -1;
  gateClosed = false;
  gateAmt = 0;
  hitstopT = 0;
  slowT = 0;
  slowScale = 1;
  boss: Idol | BossBase | null = null;
  bossActive = false;
  priorityTarget: Entity | null = null;
  syncCd = 0;
  transitioning = false;
  triggers: Extract<EntDef, { t: 'trigger' }>[] = [];
  hints: Extract<EntDef, { t: 'hint' }>[] = [];
  lights: Extract<EntDef, { t: 'light' }>[] = [];
  activeHint: string | null = null;
  near: (Entity & Interactable) | null = null;
  purifyTarget: Enemy | null = null;
  purifyHold = 0;
  weather: Weather[] = [];
  timers: Timer[] = [];
  rallyT = -1;
  rallyX = 0;
  rallyY = 0;
  rallyWarriors: { x: number; y: number; kind: 'sentinel' | 'archer'; face: number }[] = [];
  vignette: HTMLCanvasElement | null = null;
  vigGen = -1;
  deathHandled = false;
  saveT = 0;
  lostT = 0;
  firedTriggers = new Set<string>();
  echoSummonT = 0;

  constructor() {
    this.player = new Player(0, 0);
    this.story = new Story();
  }

  solid = (t: T) => (t === T.Gate ? this.gateClosed : isSolid(t));
  solidAt(x: number, y: number) {
    return this.solid(this.grid.get(Math.floor(x / TILE), Math.floor(y / TILE)));
  }
  cond = (c?: string, n?: string) => (c ? flag(c) : true) && (n ? !flag(n) : true);

  // ---------------------------------------------------------------- loading
  load(id: string, spawnName: string) {
    const r = ROOMS[id] ?? ROOMS.sanctuary;
    this.cache?.dispose();
    for (const l of this.layers) releaseCanvas(l.c);
    this.layers = [];
    this.layerGen = -1;
    this.room = r;
    this.grid = new Grid(r.rows);
    this.applyRoomMods();
    this.ents = [];
    this.echoes = [];
    this.triggers = [];
    this.hints = [];
    this.lights = [];
    this.boss = null;
    this.bossActive = false;
    this.gateClosed = false;
    this.gateAmt = 0;
    this.priorityTarget = null;
    this.purifyTarget = null;
    this.timers = [];
    this.weather = [];
    this.rallyT = -1;
    this.lostT = 0;
    this.firedTriggers.clear();
    fx.clear();
    const s = G.save;
    for (const e of r.ents) this.spawnDef(e);
    if (r.id === 'covenant_chamber' && !flag('relic_taken')) this.add(new RelicVisual(34.5 * TILE, 20 * TILE));
    const sp = r.spawns[spawnName] ?? Object.values(r.spawns)[0];
    const p = this.player;
    p.x = sp.x * TILE;
    p.y = sp.y * TILE;
    p.body.vx = 0;
    p.body.vy = 0;
    p.face = sp.face ?? 1;
    p.scarf.reset(p.x, p.y - 28);
    p.cape.reset(p.x, p.y - 26);
    p.ghosts.length = 0;
    p.trail.length = 0;
    p.lastSafe = { x: p.x, y: p.y };
    G.camera.bounds = { x: 0, y: 0, w: this.grid.w * TILE, h: this.grid.h * TILE };
    G.camera.focus = null;
    G.camera.zoomTarget = 1;
    G.camera.viewMultTarget = 1;
    G.camera.snapTo(p.x + p.face * 30, p.y - 40);
    this.cache = new TileCache(this.grid, r.biome, r.interior, r.seed, r.ents, this.solid, this.cond);
    this.ensureCaches();
    s.room = id;
    s.spawn = spawnName;
    const first = !s.visited.includes(id);
    if (first) s.visited.push(id);
    if (G.save.flags.army_out !== false) this.summonEchoes(true);
    if (r.music) music.play(r.music);
    this.story.onEnter(id, first);
  }

  private applyRoomMods() {
    const g = this.grid;
    if (this.room.id === 'temple_steps' && flag('collapsed')) {
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) === T.Collapse) g.set(x, y, T.Empty);
    }
    const broken = String(G.save.flags['broken:' + this.room.id] ?? '');
    if (broken) for (const pair of broken.split(';')) {
      const [x, y] = pair.split(',').map(Number);
      if (Number.isFinite(x)) g.set(x, y, T.Empty);
    }
  }

  private spawnDef(e: EntDef) {
    const s = G.save;
    const x = e.x * TILE, y = 'y' in e ? e.y * TILE : 0;
    switch (e.t) {
      case 'enemy':
        if (e.elite && s.defeated.includes(e.elite)) return;
        if (!this.cond(e.cond, e.ncond)) return;
        {
          const en = makeEnemy(e.k, x, y, e.elite ?? null);
          if (e.face) en.face = e.face;
          this.add(en);
        }
        return;
      case 'npc':
        if (!this.cond(e.cond, e.ncond)) return;
        if (this.ents.some((o) => o instanceof Npc && o.kind === e.k)) return;
        this.add(new Npc(e.k, x, y, e.face ?? 1));
        return;
      case 'altar':
        if (!this.cond(e.cond)) return;
        this.add(new Altar(x, y, e.id));
        return;
      case 'chest':
        this.add(new Chest(x, y, e.id, e.loot, e.secret));
        return;
      case 'lore':
        if (e.id === 'ps11545' && !s.defeated.includes('idol')) return;
        this.add(new LoreStone(x, y, e.id));
        return;
      case 'shrine':
        this.add(new Shrine(x, y, e.id, e.grants));
        return;
      case 'pickup':
        if (s.opened.includes(e.id)) return;
        this.add(new Pickup(x, y, e.id, e.loot));
        return;
      case 'trigger':
        this.triggers.push(e);
        return;
      case 'hint':
        this.hints.push(e);
        return;
      case 'light':
        this.lights.push(e);
        return;
      case 'boss':
        if (s.defeated.includes(e.k)) return;
        this.boss = e.k === 'gatekeeper' ? new Gatekeeper(x, y) : e.k === 'marshal' ? new Marshal(x, y) : e.k === 'locust_king' ? new LocustKing(x, y) : new Idol(x, y);
        this.add(this.boss);
        return;
    }
  }

  ensureCaches() {
    const r = G.renderer;
    if (!this.cache) return;
    if (this.layerGen !== r.generation) {
      this.layerGen = r.generation;
      for (const l of this.layers) releaseCanvas(l.c);
      const res = r.tier === 2 ? r.scale * 0.5 : r.scale * 0.4;
      this.layers = buildParallax(this.room.biome, this.room.seed, this.room.interior, r.viewH * 1.35, res);
      this.cache.dispose();
      this.cache.scale = r.scale * (r.tier === 2 ? 1 : r.tier === 1 ? 0.85 : 0.7);
    }
  }

  add(e: Entity) {
    this.ents.push(e);
    return e;
  }

  spawnEnemy(kind: Parameters<typeof makeEnemy>[0], x: number, y: number, elite: string | null = null) {
    const e = makeEnemy(kind, x, y, elite);
    e.aggro = true;
    this.add(e);
    return e;
  }

  after(sec: number, fn: () => void) {
    this.timers.push({ at: G.time + sec, fn });
  }

  // ---------------------------------------------------------------- time control
  hitstop(t: number) {
    this.hitstopT = Math.max(this.hitstopT, Math.min(0.14, t));
  }
  slowmo(t: number, scale: number) {
    this.slowT = Math.max(this.slowT, t);
    this.slowScale = Math.min(this.slowScale < 1 && this.slowT > 0 ? this.slowScale : 1, scale);
  }

  // ---------------------------------------------------------------- update
  update(dtRaw: number) {
    const s = G.save;
    if (this.transitioning) return;
    G.camera.update(dtRaw, this.player.x, this.player.y, this.player.face, this.player.body.vx, shakeScale());
    if (this.hitstopT > 0) {
      this.hitstopT -= dtRaw;
      fx.update(dtRaw * 0.15);
      return;
    }
    let dt = dtRaw;
    if (this.slowT > 0) {
      this.slowT -= dtRaw;
      dt *= this.slowScale;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    G.time += dt;
    s.playtime += dtRaw;
    // Lost for a while? Point at the marker.
    if (!G.inCutscene && !this.bossActive) this.lostT += dtRaw;
    if (this.lostT > 100 && settings.guide) {
      this.lostT = -90;
      const g = guidePoint();
      if (g && !this.foes().some((e) => e.canBeTargeted() && Math.abs(e.x - this.player.x) < 260)) {
        G.ui.hint(`Not sure where to go? Follow the golden marker toward ${g.target.label}.`);
        this.after(7, () => G.ui.hint(null));
      }
    }
    // Quiet autosave every half minute of free play.
    this.saveT += dtRaw;
    if (this.saveT > 30 && !G.inCutscene && !this.transitioning && this.player.state !== 'dead' && this.rallyT < 0) {
      this.saveT = 0;
      this.autosave(true);
    }
    G.d = G.d ?? derive(s);
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (G.time >= this.timers[i].at) {
        const t = this.timers[i];
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    this.syncCd = Math.max(0, this.syncCd - dt);
    this.switchCd = Math.max(0, this.switchCd - dt);
    const rallying = this.rallyT >= 0;
    this.player.update(dt);
    for (const e of this.echoes) if (!rallying) e.update(dt);
    for (const e of this.ents) {
      if (rallying && e.isFoe) continue;
      e.update(dt);
      if (e.isFoe && (e.burn > 0 || e.bleed > 0 || e.chill > 0)) tickStatus(e, dt);
      if (e.slice) e.slice.t += dt;
    }
    if (rallying) this.updateRally(dt);
    // cleanup
    for (let i = this.ents.length - 1; i >= 0; i--) if (this.ents[i].remove) this.ents.splice(i, 1);
    for (let i = this.echoes.length - 1; i >= 0; i--) if (this.echoes[i].remove) this.echoes.splice(i, 1);
    if (this.priorityTarget && (this.priorityTarget.dying || this.priorityTarget.remove)) this.priorityTarget = null;
    this.gateAmt = clamp(this.gateAmt + (this.gateClosed ? 3 : -2) * dt, 0, 1);
    this.recoverEchoes(dt);
    if (!G.inCutscene) {
      this.checkExits();
      this.checkTriggers();
    }
    this.updateHints();
    this.updateInteract(dt);
    this.updateMusic();
    this.updateWeather(dt);
    fx.update(dt);
  }

  private checkExits() {
    const p = this.player;
    if (p.state === 'dead') return;
    const hb = p.hurtbox();
    for (const ex of this.room.exits) {
      if (ex.cond && !flag(ex.cond)) continue;
      const r = { x: ex.x * TILE, y: ex.y * TILE, w: ex.w * TILE, h: ex.h * TILE };
      if (overlaps(hb, r)) {
        if (this.gateClosed) return;
        this.transition(ex.to, ex.spawn);
        return;
      }
    }
  }

  async transition(to: string, spawn: string) {
    if (this.transitioning) return;
    this.transitioning = true;
    input.flush();
    await G.ui.fade(1, 0.2);
    const keepVx = this.player.body.vx;
    if (updatePending()) {
      // A newer build is waiting: step through the door, save, and reload into it.
      this.load(to, spawn);
      this.autosave(true);
      applyUpdate(G.slot);
      return;
    }
    this.load(to, spawn);
    if (Math.abs(keepVx) > 40) this.player.body.vx = keepVx * 0.5;
    this.autosave(true);
    await G.ui.fade(0, 0.3);
    this.transitioning = false;
  }

  private checkTriggers() {
    const hb = this.player.hurtbox();
    for (const t of this.triggers) {
      if (this.firedTriggers.has(t.id)) continue;
      const r = { x: t.x * TILE, y: t.y * TILE, w: t.w * TILE, h: t.h * TILE };
      if (overlaps(hb, r)) {
        this.firedTriggers.add(t.id);
        this.story.onTrigger(t.id);
      }
    }
  }

  private updateHints() {
    const px = this.player.x / TILE;
    let found: Extract<EntDef, { t: 'hint' }> | null = null;
    for (const h of this.hints) {
      if (G.save.flags['hint_' + h.id]) continue;
      if (h.cond && !flag(h.cond)) continue;
      if (px >= h.x && px <= h.x + h.w) {
        found = h;
        break;
      }
    }
    const id = found?.id ?? null;
    if (id !== this.activeHint) {
      if (this.activeHint) G.save.flags['hint_' + this.activeHint] = true;
      this.activeHint = id;
      G.ui.hint(found ? this.story.fmt(found.text) : null);
    }
  }

  private updateInteract(dt: number) {
    const p = this.player;
    let best: (Entity & Interactable) | null = null;
    let bd = 1e9;
    if (!G.inCutscene && p.state !== 'dead') {
      for (const e of this.ents) {
        const it = e as unknown as Interactable & Entity;
        if (typeof it.interact !== 'function' || typeof it.prompt !== 'function') continue;
        const label = it.prompt();
        if (!label) continue;
        const dx = Math.abs(e.x - p.x), dy = Math.abs(e.y - p.y);
        if (dx < it.range && dy < 34 && dx < bd) {
          bd = dx;
          best = it;
        }
      }
    }
    this.near = best;
    // Purify an Echo: hold interact beside a kneeling elite.
    let purify: Enemy | null = null;
    for (const e of this.ents) {
      if (e instanceof Enemy && e.awaitingPurify && Math.abs(e.x - p.x) < 70 && Math.abs(e.y - p.y) < 50) purify = e;
    }
    this.purifyTarget = purify;
    if (purify && !G.inCutscene) {
      if (input.down('interact') || input.down('up')) {
        this.purifyHold += dt;
        if (Math.random() < dt * 40) fx.spawn(PK.Mote, purify.cx + rand(-14, 14), purify.cy + rand(-14, 14), (p.x - purify.x) * 0.8, -20, 0.5, 6, 1, '#ffe6a8');
        if (this.purifyHold >= 1.1) {
          this.purifyHold = 0;
          this.story.purify(purify);
        }
      } else this.purifyHold = Math.max(0, this.purifyHold - dt * 2);
      G.ui.prompt(`${this.keyLabel('interact')} Hold to PURIFY ECHO`);
    } else {
      this.purifyHold = 0;
      if (best) G.ui.prompt(`${this.keyLabel('interact')} ${best.prompt()}`);
      else G.ui.prompt(null);
    }
  }

  keyLabel(a: Parameters<typeof input.label>[0]) {
    const l = input.label(a);
    return l ? `[${l}]` : '';
  }

  nearInteractable() {
    return !!this.near || !!this.purifyTarget;
  }

  tryInteract() {
    if (this.near) this.near.interact();
  }

  private updateMusic() {
    if (this.bossActive) return;
    let threat = 0;
    for (const e of this.ents) if (e instanceof Enemy && e.aggro && !e.dying && Math.abs(e.x - this.player.x) < 340) threat++;
    music.setIntensity(threat > 0 ? Math.min(1, 0.5 + threat * 0.2) : 0);
  }

  // ---------------------------------------------------------------- combat API
  foes(): Entity[] {
    return this.ents.filter((e) => e.isFoe && !e.dying && !e.remove);
  }

  hitEnemies(box: Rect, h: HitInfo, set: Set<number>, onHit?: (e: Entity) => void): number {
    let n = 0;
    for (const e of this.ents) {
      if (!e.isFoe || e.dying || e.remove || set.has(e.id)) continue;
      const hb = e.hurtbox();
      if (!overlaps(box, hb)) continue;
      set.add(e.id);
      const ix = (Math.max(box.x, hb.x) + Math.min(box.x + box.w, hb.x + hb.w)) / 2;
      const iy = (Math.max(box.y, hb.y) + Math.min(box.y + box.h, hb.y + hb.h)) / 2;
      if (e.takeHit({ ...h, px: ix, py: iy })) {
        n++;
        onHit?.(e);
      }
    }
    return n;
  }

  hitPlayerSide(box: Rect, h: HitInfo, set: Set<number>): boolean {
    let any = false;
    const p = this.player;
    if (!set.has(p.id) && p.state !== 'dead' && overlaps(box, p.hurtbox())) {
      set.add(p.id);
      if (p.takeHit(h)) any = true;
      else if (p.isInvuln()) any = false;
    }
    for (const e of this.echoes) {
      if (set.has(e.id) || e.remove) continue;
      if (overlaps(box, e.hurtbox())) {
        set.add(e.id);
        if (e.takeHit(h)) any = true;
      }
    }
    return any;
  }

  targetFor(en: Entity, range: number): Entity | null {
    let best: Entity | null = null;
    let bd = range;
    const p = this.player;
    if (p.state !== 'dead' && !G.inCutscene) {
      const d = Math.abs(p.x - en.x) + Math.abs(p.y - en.y) * 0.5;
      if (d < bd) { bd = d; best = p; }
    }
    for (const e of this.echoes) {
      if (e.recallT > 0 || e.summonT > 0.3 || e.despawn > 0) continue;
      const taunt = e.sentinel && G.save.echoMode === 'defensive' ? 0.6 : 1.25;
      const d = (Math.abs(e.x - en.x) + Math.abs(e.y - en.y) * 0.5) * taunt;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  nearestEnemy(x: number, y: number, range: number, dir: number): Entity | null {
    let best: Entity | null = null;
    let bd = range;
    for (const e of this.ents) {
      if (!e.isFoe || e.dying || e.remove) continue;
      if (e.isBoss && !e.canBeTargeted()) continue;
      if (dir && sign(e.x - x) !== dir && Math.abs(e.x - x) > 20) continue;
      const d = Math.hypot(e.x - x, (e.y - y) * 0.7);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  enemyAhead(p: Player, dist: number) {
    for (const e of this.ents) {
      if (!e.isFoe || e.dying || e.heavyBody) continue;
      const dx = (e.x - p.x) * p.face;
      if (dx > 0 && dx < dist + e.body.w / 2 + 6 && Math.abs(e.y - p.y) < 24) return true;
    }
    return false;
  }

  executionTarget(p: Player): Entity | null {
    for (const e of this.ents) {
      if (!e.executable()) continue;
      if (e.isBoss) {
        if (Math.abs(e.x - p.x) < (e instanceof Gatekeeper ? 120 : e instanceof Marshal || e instanceof LocustKing ? 56 : 80) && Math.abs(e.y - p.y) < 60) return e;
      } else if (Math.abs(e.x - p.x) < 36 && Math.abs(e.y - p.y) < 30) return e;
    }
    return null;
  }

  execute(p: Player, e: Entity, mult: number) {
    const d = G.d;
    let dmg: number;
    if (e.isBoss) dmg = Math.max(d.atk * 9, e.maxHp * 0.07) * mult;
    else if (e instanceof Enemy && e.tank) dmg = Math.max(d.atk * 8, e.maxHp * (e.elite ? 0.22 : 0.35)) * mult;
    else if (e instanceof Enemy && e.elite) dmg = d.atk * 8 * mult;
    else dmg = e.hp + 5;
    if (e instanceof Enemy && e.tank) {
      // Tanks stay down a moment longer, but only one execution per break.
      e.execUsed = true;
      e.staggered = Math.min(e.staggered, 1.4);
    } else e.staggered = 0;
    if (e.isBoss) e.staggered = 0.6;
    e.takeHit({ dmg, poise: 0, kx: p.face * 300, ky: -260, dir: p.face, kind: 'melee', src: p, heavy: true, crit: true, stop: 0.12 });
    sfx('execute');
    fx.flash('#fff6dc', 0.5);
    fx.holyBurst(e.cx, e.cy, 26, 1.4);
    fx.slash(e.cx, e.cy, 34, -2.5, 1.0, 12, p.face, '#ffffff', '#ffcf6b', 0.3);
    fx.ring(e.cx, e.cy, 8, 70, '#fff1c4', 0.5, 4);
    G.camera.addTrauma(0.6 * shakeScale());
    G.camera.punch = 0.08;
    G.save.ce = Math.min(d.maxCe, G.save.ce + 10);
    this.addRally(12);
    G.ui.refreshHud();
  }

  echoBlocks(pr: Proj): boolean {
    if (G.save.echoMode !== 'defensive') return false;
    for (const e of this.echoes) {
      if (!e.sentinel || e.recallT > 0 || e.despawn > 0) continue;
      if (overlaps(pr.rect(), e.hurtbox())) {
        pr.remove = true;
        sfx('block', { pan: this.pan(e.x), vol: 0.6 });
        fx.hitSparks(pr.x, pr.y, -sign(pr.vx), '#fff1c4', 6);
        e.gainXp(1);
        return true;
      }
    }
    return false;
  }

  healAlliesIn(x0: number, x1: number, y: number, frac: number, ce: boolean) {
    const p = this.player;
    const d = G.d;
    if (p.x >= x0 && p.x <= x1 && Math.abs(p.y - y) < 40 && p.state !== 'dead') {
      const amt = d.maxHp * frac;
      G.save.hp = Math.min(d.maxHp, G.save.hp + amt);
      if (ce) G.save.ce = Math.min(d.maxCe, G.save.ce + 4);
      fx.number(p.x, p.y - 44, '+' + Math.round(amt), false, '#9fe39a');
      G.ui.refreshHud();
    }
    for (const e of this.echoes) {
      if (e.x >= x0 && e.x <= x1 && Math.abs(e.y - y) < 40) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * frac);
        e.inst.hp = e.hp;
      }
    }
  }

  /** Draw nearby foes toward a point (whirlwind attacks). Heavy bodies resist. */
  pullFoes(x: number, y: number, r: number, dt: number) {
    for (const e of this.ents) {
      if (!e.isFoe || e.dying || e.heavyBody) continue;
      const dx = x - e.x;
      if (Math.abs(dx) > r || Math.abs(y - e.y) > 50 || Math.abs(dx) < 14) continue;
      e.body.vx += Math.sign(dx) * 900 * dt;
      e.body.vx = Math.max(-160, Math.min(160, e.body.vx));
    }
  }

  spawnShockwave(x: number, y: number, dir: number, dmg: number, team: 'player' | 'enemy') {
    this.add(new Proj('wave', x, y, team, dmg, { vx: dir * 260, life: 1.2, w: 14, h: 24, color: team === 'player' ? '#fff1c4' : '#b04cff' }));
  }

  spawnLightWave(x: number, y: number, dir: number, mult: number) {
    this.add(new Proj('lightwave', x, y, 'player', G.d.atk * 0.55 * mult * G.d.abil, { vx: dir * 360, life: 0.4, w: 16, h: 30, poise: 8 }));
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
    this.cache?.invalidate();
    this.story.onWallBroken(this.room.id, tiles);
    return true;
  }

  pan(x: number) {
    return clamp((x - G.camera.x) / (G.renderer.viewW * 0.6), -1, 1) * 0.7;
  }

  commanderAura(x: number, y: number, self?: Entity) {
    for (const e of this.echoes) {
      if (e === self || (!e.inst.commander && !e.kit.warden) || e.despawn > 0) continue;
      if (Math.abs(e.x - x) < 120 && Math.abs(e.y - y) < 60) return 1.15;
    }
    return 1;
  }

  guardianAura(x: number, y: number) {
    for (const e of this.echoes) {
      if (!e.sentinel || e.inst.stage < 1 || e.despawn > 0) continue;
      if (Math.abs(e.x - x) < 70 && Math.abs(e.y - y) < 50) return 0.85;
    }
    return 1;
  }

  // ---------------------------------------------------------------- rewards
  addRally(n: number) {
    if (!flag('relic_taken')) return;
    const s = G.save;
    const before = s.rally;
    s.rally = Math.min(100, s.rally + n * G.d.rallyMult);
    if (before < 100 && s.rally >= 100) {
      G.ui.toast(`RALLY THE REMNANT is ready — ${this.keyLabel('ultimate')}`, 'good');
      sfx('chargeFull', { pitch: 0.8 });
    }
  }

  onEnemyKilled(e: Enemy) {
    const s = G.save;
    const st = e.stats;
    s.kills++;
    const tier = e.tier === 3 ? 2.6 : e.tier === 2 ? 1.7 : 1;
    const xp = e.xpOverride ?? Math.round(st.xp * (e.elite ? 4 : 1) * G.d.xpMult * (1 + s.ng * 0.5) * tier);
    this.giveXp(xp);
    const loot: Loot[] = [{ silver: Math.round(randInt(st.silver[0], st.silver[1]) * (e.elite ? 4 : 1) * tier) }];
    if (Math.random() < 0.28) loot.push({ mat: 'veil_shard', n: 1 });
    if (Math.random() < 0.22) loot.push({ mat: 'iron_scrap', n: 1 });
    if (e.kind === 'sentinel') loot.push({ mat: 'sentinel_steel', n: e.elite ? 3 : 1 });
    if (e.elite) loot.push({ mat: 'covenant_fragment', n: 1 });
    if (Math.random() < (e.elite ? 1 : 0.06)) loot.push(rollGear(e.elite ? 2 : 0));
    this.spawnLoot(e.cx, e.cy, loot, true);
    G.save.ce = Math.min(G.d.maxCe, G.save.ce + (flag('relic_taken') ? 5 : 0));
    this.addRally(6);
    for (const ec of this.echoes) ec.gainXp(3);
    G.ui.refreshHud();
    if (this.priorityTarget === e) this.priorityTarget = null;
    this.story.onKill(e);
  }

  giveXp(xp: number) {
    const s = G.save;
    const lvBefore = s.level;
    const levels = gainXp(s, xp);
    fx.number(this.player.x, this.player.y - 56, `+${xp} XP`, false, '#cfe6ff');
    if (levels > 0) {
      const slotsBefore = G.d.echoSlots;
      G.d = derive(s);
      s.hp = G.d.maxHp;
      this.player.styleKey = '';
      G.ui.levelUp(levels);
      for (const ec of this.echoes) ec.refreshStats();
      // New finishers and power tiers announce themselves.
      const fins = FINISHERS.filter((f) => f.level > lvBefore && f.level <= s.level && f.level > 1);
      fins.forEach((f, i) => this.after(2.2 + i * 1.2, () => G.ui.toast(`New finisher: ${f.name} — ${f.desc}`, 'good')));
      if (lvBefore < SOVEREIGN_LV && s.level >= SOVEREIGN_LV) {
        this.after(3.4, () => {
          G.ui.banner('SOVEREIGN OF THE REMNANT', 'Every swing looses a crescent · Phantom Step costs nothing · ordinary blows cannot stagger you · the fallen rise to serve', 'ability');
          sfx('arise');
          fx.column(this.player.x, this.player.y, 60, 420, '#9a6aff', 2);
          fx.flash('#c9a8ff', 0.5);
        });
      } else if (powerTier(s.level) > powerTier(lvBefore)) {
        this.after(2.6, () => G.ui.toast('Your strikes grow heavier and brighter.', 'good'));
      }
      if (G.d.echoSlots > slotsBefore) {
        // A wider covenant: bring benched Echoes into the line automatically.
        for (const e of s.echoes) {
          if (s.active.length >= G.d.echoSlots) break;
          if (!s.active.includes(e.uid)) s.active.push(e.uid);
        }
        this.after(1.4, () => {
          G.ui.toast(`Your covenant widens: ${G.d.echoSlots} Echoes may now fight beside you.`, 'good');
          if (s.flags.army_out !== false) this.summonEchoes();
        });
      }
    }
  }

  spawnLoot(x: number, y: number, loot: Loot[], burst: boolean) {
    for (const l of loot) {
      if (l.silver) {
        const n = Math.min(6, Math.max(1, Math.ceil(l.silver / 6)));
        const per = Math.ceil(l.silver / n);
        for (let i = 0; i < n; i++) this.add(new Drop(x, y, { silver: per }));
      } else this.add(new Drop(x, y, l));
    }
    if (burst) fx.holyBurst(x, y, 6, 0.4);
  }

  collect(l: Loot) {
    const s = G.save;
    if (l.silver) {
      s.silver += l.silver;
      sfx('pickup', { pitch: rand(1.1, 1.4), vol: 0.5, gap: 40 });
      fx.number(this.player.x + 10, this.player.y - 40, '+' + l.silver, false, '#e8e2d0');
    } else if (l.mat) {
      addMaterial(s, l.mat, l.n ?? 1);
      sfx('pickup');
      G.ui.toast(`${ITEMS[l.mat].name}${(l.n ?? 1) > 1 ? ' ×' + l.n : ''}`, 'loot', undefined);
    } else if (l.item) {
      const base = ITEMS[l.item];
      if (base.slot === 'key') {
        if (!s.keyItems.includes(l.item)) s.keyItems.push(l.item);
        G.ui.toast(base.name, 'loot');
        sfx('loot');
        return;
      }
      const it = makeItem(l.item, (l.rarity ?? base.rarity) as Rarity);
      it.isNew = true;
      s.inventory.push(it);
      sfx(it.rarity >= 3 ? 'lootRare' : 'loot');
      G.ui.itemGet(it);
    }
    G.ui.refreshHud();
  }

  // ---------------------------------------------------------------- altars, death
  async restAtAltar(a: Altar) {
    const s = G.save;
    const firstLight = !a.lit;
    if (firstLight) {
      s.altarsLit.push(a.idKey);
      sfx('altar');
      fx.column(a.x, a.y, 40, 140, '#ffe6a8', 1.2);
      fx.holyBurst(a.x, a.y - 24, 20, 1);
      G.ui.toast('Altar kindled — a place of rest and return', 'good');
    } else sfx('altar', { vol: 0.6 });
    s.altar = { room: this.room.id, spawn: this.room.spawns.altar ? 'altar' : s.spawn };
    G.inCutscene = true;
    this.player.anim.play('kneel', 0.2, true);
    await new Promise((r) => setTimeout(r, firstLight ? 900 : 500));
    await G.ui.fade(1, 0.4);
    this.rest();
    this.load(this.room.id, this.room.spawns.altar ? 'altar' : s.spawn);
    G.inCutscene = false;
    this.autosave();
    await G.ui.fade(0, 0.4);
    G.ui.openAltar(a.idKey);
  }

  rest() {
    const s = G.save;
    G.d = derive(s);
    s.hp = G.d.maxHp;
    s.ce = flag('relic_taken') ? G.d.maxCe : 0;
    s.balm = s.balmMax;
    for (const e of s.echoes) {
      e.hp = echoMaxHp(s, e, G.d);
      e.downFor = 0;
    }
    this.player.veiled = 0;
  }

  onPlayerDeath() {
    const s = G.save;
    s.deaths++;
    G.ui.bossBar(null);
    this.after(1.6, async () => {
      await G.ui.death();
      await G.ui.fade(1, 0.3);
      this.rest();
      this.player.revive();
      // Rise again at the doorway of the room where you fell, not back at
      // the last altar: no progress is ever thrown away.
      const room = ROOMS[s.room] ? s.room : s.altar.room;
      const spawn = ROOMS[s.room]?.spawns[s.spawn] ? s.spawn : s.altar.spawn;
      this.load(room, spawn);
      this.autosave(true);
      if (this.room.id === 'idol_sanctum') {
        // returning to the arena resets the fight
      }
      await G.ui.fade(0, 0.5);
    });
  }

  // ---------------------------------------------------------------- Echo army
  summonEchoes(silent = false) {
    if (this.duel) return;
    const s = G.save;
    const slots = G.d.echoSlots;
    s.active = s.active.filter((u) => s.echoes.some((e) => e.uid === u)).slice(0, slots);
    let i = 0;
    for (const u of s.active) {
      if (this.echoes.some((e) => e.inst.uid === u)) { i++; continue; }
      const inst = s.echoes.find((e) => e.uid === u)!;
      if ((inst.downFor ?? 0) > 0) continue;
      if (inst.hp <= 0) inst.hp = echoMaxHp(s, inst, G.d);
      const p = this.player;
      const x = clamp(p.x - p.face * (24 + i * 18), 20, this.grid.w * TILE - 20);
      const e = new EchoUnit(inst, x, p.y, i);
      if (silent) e.summonT = 0.5;
      this.echoes.push(e);
      if (!silent) {
        fx.column(x, p.y, 34, 160, '#fff3c4', 0.9);
        fx.ring(x, p.y - 2, 6, 40, '#ffe6a8', 0.4, 2, 0.3);
      }
      i++;
    }
    if (!silent && this.echoes.length) sfx('summon');
    G.save.flags.army_out = true;
    G.ui.refreshHud();
  }

  dismissEchoes() {
    for (const e of this.echoes) e.dismiss();
    G.save.flags.army_out = false;
    sfx('whoosh', { vol: 0.5 });
    G.ui.refreshHud();
  }

  onEchoFallen(e: EchoUnit) {
    this.echoes = this.echoes.filter((x) => x !== e);
  }

  private recoverEchoes(dt: number) {
    const s = G.save;
    for (const inst of s.echoes) {
      if ((inst.downFor ?? 0) > 0) {
        inst.downFor! -= dt;
        if (inst.downFor! <= 0) {
          inst.downFor = 0;
          inst.hp = echoMaxHp(s, inst, G.d);
          if (s.active.includes(inst.uid) && s.flags.army_out !== false && !G.inCutscene) {
            this.summonEchoes();
            G.ui.toast(`${ECHO_SPECIES[inst.species].stages[inst.stage].name} returns to your side`, 'good');
          }
        }
      }
    }
  }

  echoAssist(target: Entity) {
    const e = this.echoes.find((x) => x.assistCd <= 0 && x.despawn <= 0);
    e?.assist(target);
  }

  switchCd = 0;

  /**
   * Switch support. With Echoes on the bench, the lead fighter steps back and
   * the next one steps in already swinging at the nearest foe. With no bench,
   * Elior trades places with the Echo farthest from him (an exchange).
   */
  switchSupport() {
    const s = G.save;
    if (this.duel) return this.duelRefuse();
    if (!s.echoes.length) {
      G.ui.toast('You have no Echoes yet.', 'warn');
      return;
    }
    if (this.switchCd > 0) {
      G.ui.toast(`Switch ready in ${Math.ceil(this.switchCd)}s`, 'warn');
      sfx('denied');
      return;
    }
    if (!this.echoes.length && s.flags.army_out === false) {
      this.echoCommand('toggle');
      return;
    }
    const p = this.player;
    const target = (this.priorityTarget && !this.priorityTarget.dying ? this.priorityTarget : null) ?? this.nearestEnemy(p.x, p.y - 20, 260, 0);
    const bench = s.echoes.filter((e) => !s.active.includes(e.uid) && (e.downFor ?? 0) <= 0);
    if (bench.length) {
      const outUid = s.active[0];
      const incoming = bench[0];
      s.active = [...s.active.filter((u) => u !== outUid), incoming.uid];
      if (outUid) {
        // The bench joins the back of the rotation.
        const outInst = s.echoes.find((e) => e.uid === outUid);
        if (outInst) {
          s.echoes = [...s.echoes.filter((e) => e !== outInst), outInst];
        }
        const leaving = this.echoes.find((e) => e.inst.uid === outUid);
        if (leaving) leaving.dismiss();
      }
      this.summonEchoes(true);
      const unit = this.echoes.find((e) => e.inst.uid === incoming.uid);
      if (unit) unit.tagIn(target);
      this.switchCd = 4.5;
      sfx('summon', { pitch: 1.2 });
      G.ui.toast(`Switch: ${ECHO_SPECIES[incoming.species].stages[incoming.stage].name} steps in`, 'info');
    } else if (this.echoes.length) {
      let far = this.echoes[0];
      for (const e of this.echoes) if (Math.abs(e.x - p.x) > Math.abs(far.x - p.x)) far = e;
      if (Math.abs(far.x - p.x) < 24) {
        G.ui.toast('Your Echoes are already at your side.', 'info');
        return;
      }
      const px = p.x, py = p.y;
      fx.streak(px, py - 20, far.x, far.y - 20, '#ffe6a8', 0.25, 3);
      fx.streak(far.x, far.y - 20, px, py - 20, '#fff3c4', 0.25, 2);
      p.x = far.x;
      p.y = far.y;
      p.body.vx = p.body.vy = 0;
      far.x = px;
      far.y = py;
      far.body.vx = far.body.vy = 0;
      p.invuln = Math.max(p.invuln, 0.35);
      fx.ring(p.x, p.y - 20, 4, 30, '#ffe6a8', 0.3, 2);
      fx.ring(far.x, far.y - 20, 4, 30, '#fff3c4', 0.3, 2);
      this.switchCd = 3;
      sfx('dash', { pitch: 1.5, vol: 0.8 });
    }
    G.ui.refreshHud();
  }

  echoCommand(cmd: 'toggle' | 'aggressive' | 'defensive' | 'follow' | 'target' | 'recall' | 'sync' | 'switch') {
    const s = G.save;
    if (!s.echoes.length) {
      G.ui.toast('You have no Echoes yet.', 'warn');
      return;
    }
    if (this.duel && cmd !== 'aggressive' && cmd !== 'defensive' && cmd !== 'follow') return this.duelRefuse();
    switch (cmd) {
      case 'switch':
        this.switchSupport();
        return;
      case 'toggle':
        if (this.echoes.length) this.dismissEchoes();
        else {
          if (!s.active.length) s.active = s.echoes.slice(0, G.d.echoSlots).map((e) => e.uid);
          this.summonEchoes();
        }
        break;
      case 'aggressive': case 'defensive': case 'follow':
        s.echoMode = cmd;
        G.ui.toast(`Echoes: ${cmd === 'aggressive' ? 'Aggressive — seek and strike' : cmd === 'defensive' ? 'Defensive — guard Elior' : 'Follow — stay close'}`, 'info');
        sfx('uiConfirm');
        break;
      case 'target': {
        const t = this.nearestEnemy(this.player.x + this.player.face * 40, this.player.y - 20, 300, this.player.face) ?? this.nearestEnemy(this.player.x, this.player.y, 300, 0);
        if (t) {
          this.priorityTarget = t;
          G.ui.toast(`Priority target: ${t.name || 'enemy'}`, 'info');
          sfx('uiConfirm');
        } else G.ui.toast('No enemy in sight.', 'warn');
        break;
      }
      case 'recall':
        for (const e of this.echoes) e.recall();
        sfx('whoosh', { vol: 0.6, pitch: 1.4 });
        fx.ring(this.player.x, this.player.y - 18, 6, 50, '#ffe6a8', 0.3, 2);
        break;
      case 'sync': {
        if (this.syncCd > 0) {
          G.ui.toast(`Sync Strike ready in ${Math.ceil(this.syncCd)}s`, 'warn');
          return;
        }
        const t = (this.priorityTarget && !this.priorityTarget.dying ? this.priorityTarget : null) ?? this.nearestEnemy(this.player.x, this.player.y, 320, 0);
        if (!t || !this.echoes.length) {
          G.ui.toast(this.echoes.length ? 'No enemy in sight.' : 'Summon your Echoes first.', 'warn');
          return;
        }
        const coord = skillRank(s, 'c_sync') > 0;
        this.syncCd = coord ? 7.2 : 12;
        const mult = coord ? 1.5 : 1;
        sfx('summon', { pitch: 1.3 });
        G.world.slowmo(0.35, 0.4);
        this.echoes.forEach((e, i) => this.after(0.08 * i, () => { if (!t.dying) e.syncStrike(t, mult); }));
        break;
      }
    }
    G.ui.refreshHud();
  }

  // ---------------------------------------------------------------- Rally the Remnant
  tryRally() {
    const s = G.save;
    if (!flag('relic_taken')) return;
    if (this.duel) return this.duelRefuse();
    if (s.rally < 100) {
      G.ui.toast(`Rally the Remnant charges as you fight (${Math.floor(s.rally)}%)`, 'warn');
      sfx('denied');
      return;
    }
    if (this.rallyT >= 0) return;
    s.rally = 0;
    this.rallyT = 0;
    this.rallyX = this.player.x;
    this.rallyY = this.player.y;
    this.rallyWarriors = [];
    const v = G.camera.view();
    const kinds: ('sentinel' | 'archer')[] = ['sentinel', 'archer'];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = v.x + v.w * (0.08 + (i / (n - 1)) * 0.84);
      const gy = this.groundY(x, this.player.y);
      this.rallyWarriors.push({ x, y: gy, kind: kinds[i % 2], face: x < this.player.x ? 1 : -1 });
    }
    this.player.untouchable = 3;
    this.player.anim.play('invoke', 0.05, true);
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    sfx('rally');
    G.camera.zoomTarget = 0.92;
  }

  groundY(x: number, fromY: number) {
    const tx = Math.floor(x / TILE);
    let ty = Math.floor((fromY - 40) / TILE);
    for (let i = 0; i < 16; i++) {
      if (this.solid(this.grid.get(tx, ty + i)) || this.grid.get(tx, ty + i) === T.OneWay) return (ty + i) * TILE;
    }
    return fromY;
  }

  private updateRally(dt: number) {
    const t0 = this.rallyT;
    this.rallyT += dt;
    const t = this.rallyT;
    const crossed = (x: number) => t0 < x && t >= x;
    if (crossed(0.5)) for (const w of this.rallyWarriors) fx.column(w.x, w.y, 30, 260, '#fff3c4', 1.6);
    if (crossed(1.3) || crossed(2.1)) {
      const final = t >= 2.1;
      const d = G.d;
      const dmg = d.atk * (final ? 5 : 3) * d.abil * d.echoDmg;
      for (const e of this.foes()) {
        const v = G.camera.view();
        if (e.x < v.x - 20 || e.x > v.x + v.w + 20) continue;
        if (e.isBoss && !e.canBeTargeted()) continue;
        e.takeHit({ dmg, poise: final ? 120 : 40, kx: sign(e.x - this.rallyX) * 200, ky: -260, dir: sign(e.x - this.rallyX) || 1, kind: 'ability', src: this.player, launch: !final, crit: final });
        fx.slash(e.cx, e.cy, 30, rand(-3, -1.5), rand(0.5, 1.2), 10, choose([1, -1]), '#ffffff', '#ffe6a8', 0.25);
        fx.holyBurst(e.cx, e.cy, 10, 1);
      }
      sfx(final ? 'execute' : 'hitHeavy');
      G.camera.addTrauma((final ? 0.9 : 0.4) * shakeScale());
      fx.flash(final ? '#ffffff' : '#fff1c4', final ? 0.6 : 0.3);
      if (final) fx.ring(this.rallyX, this.rallyY - 20, 20, 400, '#ffe6a8', 0.8, 6);
    }
    if (t >= 2.7) {
      this.rallyT = -1;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.camera.zoomTarget = 1;
      for (const ec of this.echoes) ec.gainXp(6);
    }
  }

  private drawRally(ctx: Ctx) {
    const t = this.rallyT;
    if (t < 0) return;
    const x = this.rallyX, y = this.rallyY;
    // darken the world
    const dark = Math.min(0.55, t * 2) * (t > 2.4 ? Math.max(0, (2.7 - t) / 0.3) : 1);
    const v = G.camera.view();
    ctx.fillStyle = `rgba(5,3,10,${dark.toFixed(3)})`;
    ctx.fillRect(v.x - 10, v.y - 10, v.w + 20, v.h + 20);
    // covenant sigil on the ground
    ctx.globalCompositeOperation = 'lighter';
    const grow = Math.min(1, t / 0.6);
    const R = 90 * grow;
    const a = Math.min(1, t * 3) * (t > 2.4 ? Math.max(0, (2.7 - t) / 0.3) : 1);
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.scale(1, 0.28);
    ctx.strokeStyle = rgba('#ffe6a8', a);
    ctx.lineWidth = 3;
    for (const rr of [R, R * 0.78, R * 0.42]) {
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(t * 0.8);
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(an) * R * 0.42, Math.sin(an) * R * 0.42);
      ctx.lineTo(Math.cos(an) * R, Math.sin(an) * R);
      ctx.stroke();
    }
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const an = (i / 3) * Math.PI * 2 + k * Math.PI / 3;
        const px = Math.cos(an) * R * 0.78, py = Math.sin(an) * R * 0.78;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, x, y - 10, R * 1.4, '#ffcf6b', 0.5 * a);
    ctx.globalCompositeOperation = 'source-over';
    // spectral warriors rising in the columns
    if (t > 0.5) {
      const rise = Math.min(1, (t - 0.5) / 0.5);
      for (const w of this.rallyWarriors) {
        const strike = t > 1.1 && t < 1.5 ? 1 : t > 1.9 && t < 2.3 ? 1 : 0;
        const pose = w.kind === 'sentinel'
          ? { ...SENT_BASE, fUA: strike ? 0.8 : 3.0, fFA: 0.2, wpn: 0.1, lean: strike ? 0.5 : -0.1 }
          : { ...ARCH_BASE, bUA: 1.5, bFA: 0.05, off: 0.02, fUA: 1.15, fFA: strike ? 0.6 : 1.9 };
        const j = solve(pose, w.kind === 'sentinel' ? SENT_DIMS : ARCH_DIMS, true, newJoints());
        const st = w.kind === 'sentinel' ? sentinelStyle('echo', 2) : archerStyle('echo', 2);
        ctx.save();
        ctx.globalAlpha = 0.75 * rise * a;
        ctx.translate(w.x, w.y + (1 - rise) * 30);
        ctx.scale(w.face, 1);
        drawHumanoid(ctx, j, st, G.time);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    if (t < 0.9) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const r = G.renderer;
      ctx.globalAlpha = Math.min(1, t * 3) * Math.max(0, (0.9 - t) / 0.3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(r.bh * 0.07)}px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#ffe6a8';
      ctx.fillText('RALLY THE REMNANT', r.bw / 2, r.bh * 0.3);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- story helpers
  closeGate(on: boolean) {
    this.gateClosed = on;
    sfx('door');
    if (on) G.camera.addTrauma(0.3);
  }

  tobiahAssist(idol: Idol) {
    const p = this.player;
    const side = p.x < idol.x ? -1 : 1;
    const startX = clamp(idol.x + side * 240, 30, this.grid.w * TILE - 60);
    const t = new Npc('tobiah', startX, idol.y, -side);
    t.walkTo = idol.x + side * 150;
    this.add(t);
    G.ui.caption('Tobiah: "ELIOR! Duck!"');
    sfx('houndBark', { pitch: 2, vol: 0.4 });
    this.after(1.0, () => {
      sfx('swing', { pitch: 0.7 });
      const hx = idol.x, hy = idol.y - 150;
      fx.embers(hx, hy, 30, '#ffb347', 20);
      fx.ring(hx, hy, 6, 60, '#ffb347', 0.5, 4);
      sfx('pillarFire', { vol: 0.6 });
      idol.kneel();
      G.ui.caption('Tobiah: "Lamp oil! The good stuff! NOW, Elior!"');
    });
    this.after(4.0, () => {
      G.ui.caption(null);
      t.walkTo = startX + side * 60;
    });
    this.after(6.5, () => (t.remove = true));
  }

  onBossDefeated(b: Idol | BossBase) {
    this.bossActive = false;
    const key = b instanceof BossBase ? b.key : 'idol';
    if (!G.save.defeated.includes(key)) G.save.defeated.push(key);
    if (b instanceof Gatekeeper) {
      this.closeGate(false);
      this.story.gatekeeperDefeated(b);
    } else if (b instanceof Marshal) this.story.marshalDefeated(b);
    else if (b instanceof LocustKing) this.story.kingDefeated(b);
    else if (b instanceof Idol) {
      this.closeGate(false);
      this.story.bossDefeated(b);
    }
  }

  /** The Marshal's honour duel: Elior fights alone. */
  get duel() {
    return this.bossActive && this.boss instanceof Marshal && !this.boss.dying;
  }
  duelRefuse() {
    G.ui.toast('An honour duel. Your Echoes kneel and watch.', 'warn');
    sfx('denied');
  }

  /** A foe cut clean in two: each half slides apart along the cut. */
  private drawSliced(ctx: Ctx, e: Entity) {
    const sl = e.slice!;
    const t = sl.t;
    const nx = -Math.sin(sl.a), ny = Math.cos(sl.a);
    const cx = e.cx, cy = e.cy;
    const sep = Math.min(10, t * 28);
    const R = 120;
    for (const side of [1, -1]) {
      ctx.save();
      ctx.beginPath();
      // Half-plane on this side of the cut line through (cx, cy).
      const dx = Math.cos(sl.a), dy = Math.sin(sl.a);
      ctx.moveTo(cx - dx * R, cy - dy * R);
      ctx.lineTo(cx + dx * R, cy + dy * R);
      ctx.lineTo(cx + dx * R + nx * side * R, cy + dy * R + ny * side * R);
      ctx.lineTo(cx - dx * R + nx * side * R, cy - dy * R + ny * side * R);
      ctx.closePath();
      ctx.clip();
      ctx.translate(nx * side * sep + (side > 0 ? 0 : 0), ny * side * sep + (side < 0 ? t * t * 30 : 0));
      e.draw(ctx);
      ctx.restore();
    }
    if (t < 0.35) {
      // The cut itself, a line of light that fades.
      const dx = Math.cos(sl.a), dy = Math.sin(sl.a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#fff6dc', 1 - t / 0.35);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - dx * 30, cy - dy * 30);
      ctx.lineTo(cx + dx * 30, cy + dy * 30);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** The golden objective marker (and doorway chevrons when the way leads out). */
  private drawGuide(ctx: Ctx) {
    const g = guidePoint();
    if (!g) return;
    const p = this.player;
    const { x, y } = g.point;
    if (!g.viaExit && Math.hypot(x - p.x, y - p.y) < 36) return;
    const t = G.time;
    const my = y - 38 + Math.sin(t * 3) * 3;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, my, 24, '#ffcf6b', 0.5 + Math.sin(t * 4) * 0.12);
    const gr = ctx.createLinearGradient(0, my, 0, y);
    gr.addColorStop(0, rgba('#ffe6a8', 0.35));
    gr.addColorStop(1, rgba('#ffe6a8', 0));
    ctx.fillStyle = gr;
    ctx.fillRect(x - 1.2, my, 2.4, y - my);
    glow(ctx, x, y - 2, 18, '#ffcf6b', 0.3);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(x, my - 8); ctx.lineTo(x + 5.5, my); ctx.lineTo(x, my + 8); ctx.lineTo(x - 5.5, my); ctx.closePath();
    ctx.fillStyle = '#ffe6a8';
    ctx.fill();
    ctx.strokeStyle = '#5a3c08';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (g.viaExit) {
      // Chevrons flowing out through the doorway.
      const d = g.dir;
      ctx.strokeStyle = rgba('#ffe6a8', 0.9);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const k = ((t * 1.5 + i / 3) % 1);
        const cx = x + d.x * (k * 26 - 6) - (d.x ? 0 : 0), cy = my + 18 + d.y * (k * 22);
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.beginPath();
        if (d.x) {
          ctx.moveTo(cx - d.x * 4, cy - 5); ctx.lineTo(cx + d.x * 2, cy); ctx.lineTo(cx - d.x * 4, cy + 5);
        } else {
          ctx.moveTo(cx - 5, cy - d.y * 4); ctx.lineTo(cx, cy + d.y * 2); ctx.lineTo(cx + 5, cy - d.y * 4);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  autosave(quiet = false) {
    if (!G.save || G.save.hp <= 0 || this.player.state === 'dead') return;
    this.saveT = 0;
    const ok = saveSlot(G.slot, G.save);
    if (ok) noteSaved();
    if (!quiet || !ok) G.ui.toast(ok ? 'Progress saved' : 'Could not save — storage is unavailable', ok ? 'info' : 'warn');
  }

  // ---------------------------------------------------------------- weather
  private updateWeather(dt: number) {
    const kind = this.room.weather;
    if (!kind) return;
    const v = G.camera.view();
    const tier = G.renderer.tier;
    const max = tier === 2 ? 90 : tier === 1 ? 55 : 25;
    const rate = kind === 'drips' ? 6 : kind === 'motes' ? 10 : 30;
    if (this.weather.length < max && Math.random() < dt * rate) {
      const w: Weather = { x: v.x + rand(0, v.w), y: v.y - 10, vx: 0, vy: 0, s: 1, a: 1, life: 6 };
      switch (kind) {
        case 'ash': w.vx = rand(-20, 6); w.vy = rand(14, 30); w.s = rand(0.8, 1.8); w.a = rand(0.3, 0.7); break;
        case 'embers': w.y = v.y + v.h + 10; w.vx = rand(-10, 10); w.vy = rand(-40, -20); w.s = rand(0.6, 1.4); w.a = rand(0.5, 1); break;
        case 'dust': w.y = v.y + rand(0, v.h); w.vx = rand(-4, 4); w.vy = rand(-3, 3); w.s = rand(0.5, 1.2); w.a = rand(0.15, 0.4); break;
        case 'motes': w.y = v.y + rand(0, v.h); w.vx = rand(-3, 3); w.vy = rand(-8, -2); w.s = rand(0.6, 1.3); w.a = rand(0.3, 0.7); break;
        case 'drips': w.vx = 0; w.vy = 60; w.s = 0.8; w.a = 0.6; break;
        case 'rain': w.vx = -40; w.vy = 400; w.s = 1; w.a = 0.4; break;
      }
      this.weather.push(w);
    }
    for (let i = this.weather.length - 1; i >= 0; i--) {
      const w = this.weather[i];
      w.life -= dt;
      if (kind === 'drips') w.vy += 400 * dt;
      w.x += (w.vx + Math.sin(G.time + i) * (kind === 'ash' ? 6 : 2)) * dt;
      w.y += w.vy * dt;
      if (w.life <= 0 || w.y > v.y + v.h + 20 || w.y < v.y - 30 || this.solidAt(w.x, w.y)) {
        if (kind === 'drips' && this.solidAt(w.x, w.y) && w.life > 0) fx.spawn(PK.Spark, w.x, w.y - 1, rand(-30, 30), rand(-60, -30), 0.2, 0.8, 0.2, '#9fc0e8', 300, 0);
        this.weather.splice(i, 1);
      }
    }
  }

  private drawWeather(ctx: Ctx) {
    const kind = this.room.weather;
    if (!kind || !this.weather.length) return;
    if (kind === 'embers' || kind === 'motes' || kind === 'dust') ctx.globalCompositeOperation = 'lighter';
    for (const w of this.weather) {
      ctx.globalAlpha = w.a * Math.min(1, w.life);
      switch (kind) {
        case 'ash': ctx.fillStyle = '#9a8f98'; ctx.fillRect(w.x, w.y, w.s, w.s * 0.8); break;
        case 'embers': glow(ctx, w.x, w.y, w.s * 4, '#ff9a3a', w.a); break;
        case 'dust': glow(ctx, w.x, w.y, w.s * 3, '#c8c0d8', w.a); break;
        case 'motes': glow(ctx, w.x, w.y, w.s * 4, '#ffe6a8', w.a); break;
        case 'drips': ctx.fillStyle = '#9fc0e8'; ctx.fillRect(w.x, w.y, 0.8, 3); break;
        case 'rain': ctx.strokeStyle = '#8fa0c0'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - 2, w.y + 8); ctx.stroke(); break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- rendering
  draw(ctx: Ctx) {
    const r = G.renderer;
    const cam = G.camera;
    this.ensureCaches();
    const pal = BIOMES[this.room.biome];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawSky(ctx, pal, r.bw, r.bh, this.room.interior, G.time);
    // parallax
    const v = cam.view();
    const s = cam.s;
    const roomH = this.grid.h * TILE;
    for (const l of this.layers) {
      const W = l.w * s, H = l.h * s;
      let ox = -((v.x * l.fx) % l.w) * s;
      if (ox > 0) ox -= W;
      const sy = (v.h - l.h + (roomH - (v.y + v.h)) * l.fy) * s;
      for (let x = ox; x < r.bw; x += W - 1) ctx.drawImage(l.c, x, sy, W, H);
      // fog band between layers
    }
    // atmospheric fog gradient
    const fog = ctx.createLinearGradient(0, r.bh * 0.35, 0, r.bh);
    fog.addColorStop(0, rgba(pal.fog, 0));
    fog.addColorStop(1, rgba(pal.fog, this.room.interior ? 0.12 : 0.22));
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, r.bw, r.bh);

    cam.apply(ctx);
    this.cache?.draw(ctx, v);
    drawLiquids(ctx, this.grid, G.time, v, this.room.biome);
    drawLiveProps(ctx, this.lights, G.time, v, this.cond, false);
    drawLiveProps(ctx, this.room.ents.filter((e) => e.t === 'decor' && LIVE_DECOR.has(e.k)), G.time, v, this.cond, false);
    drawGate(ctx, this.grid, this.gateAmt);
    // entities by layer
    const list: Entity[] = [...this.ents, ...this.echoes, this.player];
    list.sort((a, b) => a.layer - b.layer);
    for (const e of list) {
      if (e.x < v.x - 260 || e.x > v.x + v.w + 260) continue;
      if (e.slice) this.drawSliced(ctx, e);
      else e.draw(ctx);
    }
    fx.drawBack(ctx);
    drawLiveProps(ctx, this.room.ents, G.time, v, this.cond, true);
    // lighting
    lighting.begin();
    for (const l of this.lights) {
      if (l.cond && !flag(l.cond)) continue;
      const lx = l.x * TILE, ly = l.y * TILE;
      if (lx < v.x - 300 || lx > v.x + v.w + 300) continue;
      const fl = 0.9 + Math.sin(G.time * 11 + l.x) * 0.06;
      switch (l.k) {
        case 'torch': lighting.add(lx, ly - 4, 110 * fl, '#ff9a4a', 0.95, 0.6); break;
        case 'brazier': lighting.add(lx, ly - 16, 140 * fl, '#ffa84a', 1, 0.6); break;
        case 'lantern': lighting.add(lx, ly + 4, 100 * fl, '#ffcf6b', 0.9, 0.5); break;
        case 'candles': lighting.add(lx, ly - 6, 70 * fl, '#ffd27a', 0.8, 0.5); break;
        case 'forge': lighting.add(lx, ly - 10, 140 * fl, '#ff7a2a', 1, 0.8); break;
        case 'window': lighting.add(lx, ly, (l.r ?? 80) * 1.6, '#9fb4e8', 0.75, 0.35); break;
        case 'glow': lighting.add(lx, ly, (l.r ?? 60) * 1.5, l.c ?? '#ffcf6b', 0.85, 0.6); break;
      }
    }
    for (const e of list) e.lights?.();
    for (const p of fx.ps) if (p.k === PK.Flame && Math.random() < 0.3) lighting.add(p.x, p.y, 30, '#ffe6a8', 0.5, 0);
    const dark = this.room.dark * (this.rallyT >= 0 ? 1.2 : 1);
    lighting.render(ctx, cam, r, Math.min(0.95, dark), pal.ambient);
    cam.apply(ctx);
    lighting.bloom(ctx);
    // god rays for windows
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      if (l.k !== 'window') continue;
      const lx = l.x * TILE, ly = l.y * TILE;
      const g = ctx.createLinearGradient(lx, ly, lx + 60, ly + 260);
      g.addColorStop(0, rgba('#a8bcf0', 0.16));
      g.addColorStop(1, rgba('#a8bcf0', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx - 14, ly - 10);
      ctx.lineTo(lx + 14, ly - 10);
      ctx.lineTo(lx + 120, ly + 280);
      ctx.lineTo(lx + 30, ly + 280);
      ctx.closePath();
      ctx.fill();
    }
    fx.drawAdd(ctx);
    ctx.globalCompositeOperation = 'source-over';
    for (const e of list) e.drawOverlay?.(ctx);
    if (settings.guide && !G.inCutscene && !this.bossActive) this.drawGuide(ctx);
    // priority target reticle
    if (this.priorityTarget && !this.priorityTarget.dying) {
      const t = this.priorityTarget;
      ctx.strokeStyle = rgba('#ffe6a8', 0.8);
      ctx.lineWidth = 1.2;
      const rr = 14 + Math.sin(G.time * 6) * 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + G.time;
        ctx.moveTo(t.cx + Math.cos(a) * rr, t.cy + Math.sin(a) * rr);
        ctx.lineTo(t.cx + Math.cos(a) * (rr + 5), t.cy + Math.sin(a) * (rr + 5));
      }
      ctx.stroke();
    }
    // purify ring
    if (this.purifyTarget && this.purifyHold > 0) {
      const t = this.purifyTarget;
      ctx.strokeStyle = '#ffe6a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.cx, t.cy - 30, 10, -Math.PI / 2, -Math.PI / 2 + (this.purifyHold / 1.1) * Math.PI * 2);
      ctx.stroke();
    }
    this.drawRally(ctx);
    this.drawWeather(ctx);
    fx.drawNumbers(ctx);
    // screen-space finishing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette(ctx);
    if (fx.flashA > 0.01) {
      ctx.globalAlpha = fx.flashA;
      ctx.fillStyle = fx.flashC;
      ctx.fillRect(0, 0, r.bw, r.bh);
      ctx.globalAlpha = 1;
    }
    const hpFrac = G.save.hp / G.d.maxHp;
    if (hpFrac < 0.3 && this.player.state !== 'dead') {
      const a = (0.3 - hpFrac) / 0.3 * (0.35 + Math.sin(G.time * 5) * 0.12);
      const g = ctx.createRadialGradient(r.bw / 2, r.bh / 2, r.bh * 0.35, r.bw / 2, r.bh / 2, r.bw * 0.7);
      g.addColorStop(0, 'rgba(120,10,20,0)');
      g.addColorStop(1, `rgba(120,10,20,${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.bw, r.bh);
    }
  }

  private drawVignette(ctx: Ctx) {
    const r = G.renderer;
    if (!this.vignette || this.vigGen !== r.generation) {
      releaseCanvas(this.vignette);
      const m = makeCanvas(r.bw / 2, r.bh / 2);
      const g = m.ctx.createRadialGradient(r.bw / 4, r.bh / 4, r.bh * 0.2, r.bw / 4, r.bh / 4, r.bw * 0.36);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      m.ctx.fillStyle = g;
      m.ctx.fillRect(0, 0, r.bw / 2, r.bh / 2);
      this.vignette = m.c;
      this.vigGen = r.generation;
    }
    ctx.drawImage(this.vignette, 0, 0, r.bw, r.bh);
  }
}

// ---------------------------------------------------------------- random gear

const GEAR_POOL: { id: string; w: number }[] = [
  { id: 'iron_cap', w: 3 }, { id: 'chain_hauberk', w: 3 }, { id: 'bronze_gauntlets', w: 3 }, { id: 'greaves', w: 3 },
  { id: 'copper_ring', w: 3 }, { id: 'ember_lamp', w: 2 }, { id: 'ring_of_vigil', w: 1 }, { id: 'bell_shard', w: 1 },
  { id: 'rusted_greatsword', w: 2 }, { id: 'archer_bracers', w: 1 }, { id: 'watchman_spear', w: 1 }, { id: 'pilgrim_boots', w: 1 },
];

export function rollGear(minBoost = 0): Loot {
  const total = GEAR_POOL.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  let id = GEAR_POOL[0].id;
  for (const g of GEAR_POOL) {
    r -= g.w;
    if (r <= 0) { id = g.id; break; }
  }
  const base = ITEMS[id].rarity;
  const roll = Math.random();
  let boost = roll < 0.6 ? 0 : roll < 0.9 ? 1 : roll < 0.985 ? 2 : 3;
  boost = Math.max(boost, minBoost);
  return { item: id, rarity: Math.min(4, base + boost) };
}

export type { SaveData };
export { makeEcho };
