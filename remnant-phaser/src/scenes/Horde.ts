// The Horde (POLISH_PLAN §13): a top-down survival mode in endless stages. The horde comes from every side; the
// hero's weapons strike on their own while the player moves, dashes, calls a skill, transforms and switches heroes.
// Each level-up offers one of three upgrades; each stage ends with a monarch; each stage after is harder. What a
// run earns (silver, XP, the monarchs' gear) goes back to the journey's save.
import Phaser from 'phaser';
import { loadSave, newSave, writeSave, gainXp, stats, type PhaserSave } from '../game/save';
import { archerStats, archerGainXp, archerDrop, newArcher } from '../game/archer';
import { makeItem, type Derived } from '../../../remnant/src/game/state';
import { ITEMS, type Rarity } from '../../../remnant/src/game/data';
import { rollGear } from '../../../remnant/src/game/loot';
import type { Loot } from '../../../remnant/src/game/tiles';
import { dpr } from '../game/screen';
import { music } from '../classic/shim/music';
import { sfx } from '../../../remnant/src/audio/audio';
import { haptic } from '../../../remnant/src/core/haptics';
import { input } from '../../../remnant/src/core/input';
import { shakeScale } from '../classic/shim/settings';
import { BIOMES, HEROES, WEAPONS, EVOLUTIONS, PASSIVES, RELICS, RELIC_SLOTS, stageTime, stageHp, stageDmg, type Biome, type HeroId, type PassiveId, type WeaponId } from '../game/horde/defs';
import { Terrain, hordeTextures } from '../game/horde/ground';
import { Swarm, MAX_FOES, type Foe } from '../game/horde/foes';
import { HordeHero } from '../game/horde/hero';
import { Arsenal } from '../game/horde/weapons';
import { Shaman } from '../game/horde/shaman';
import { uriOf, uriStats, uriGainXp } from '../game/horde/uri';
import { HordeBoss } from '../game/horde/boss';
import { Pickups, type DropKind } from '../game/horde/pickups';
import { HordeUI, overlay, el, type Act } from '../game/horde/ui';

/** How much of the world the shorter side of the screen shows. */
const VIEW = 440;
/** Each hero's part: their own weapon, their skill, and what their transformation gives (damage, cooldowns, speed). */
const KIT: Record<HeroId, { name: string; weapon: WeaponId; skillCd: number; skillSfx: string; form: [number, number, number]; formName: string; formSub: string; formSfx: string; arrive: string }> = {
  elior: { name: 'Elior', weapon: 'blade', skillCd: 11, skillSfx: 'swordWord', form: [1.7, 0.7, 1.15], formName: 'SHADOW MANTLE', formSub: 'Heavier, faster blows · the fallen burst in shadow', formSfx: 'transform', arrive: 'Elior · the Covenant Blade' },
  tirzah: { name: 'Tirzah', weapon: 'bow', skillCd: 9, skillSfx: 'quiverMight', form: [1.4, 1, 1.2], formName: 'WINGS OF DAWN', formSub: 'Two more arrows · they pierce deeper', formSfx: 'wingsForm', arrive: 'Tirzah · the Dawn Bow' },
  uri: { name: 'Uri', weapon: 'flame', skillCd: 12, skillSfx: 'pillarFire', form: [1.5, 0.85, 1.1], formName: 'CROWN OF FLAME', formSub: 'Uri and the shaman are one · meteors and a ring of fire', formSfx: 'transform', arrive: 'Uri · the Hand of Flame, and his shaman' },
};
const FORM_TIME = 14;

type Choice = { kind: 'weapon'; id: WeaponId } | { kind: 'passive'; id: PassiveId } | { kind: 'boon'; id: 'heal' | 'silver' };
/** A choice's name for banishing. */
const key = (c: Choice) => `${c.kind}:${c.id}`;

export class Horde extends Phaser.Scene {
  save!: PhaserSave;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  terrain!: Terrain;
  swarm!: Swarm;
  arsenal!: Arsenal;
  /** Uri's orc shaman, at his side while he fights. */
  shaman!: Shaman;
  private prayed = false;
  /** Levels Uri gained when the run was banked, for the last card. */
  private uriLevels = 0;
  hero!: HordeHero;
  pickups!: Pickups;
  ui!: HordeUI;
  boss: HordeBoss | null = null;
  /** A card is open: the field holds still. */
  overlay: (() => void) | null = null;
  /** The device last used (the stick's resting ring shows only for touch). */
  touch = false;

  stage = 1;
  stageT = 0;
  biome: Biome = BIOMES[0];
  hp = 100;
  maxHp = 100;
  level = 1;
  xp = 0;
  kills = 0;
  /** What the run has earned so far, banked when it ends. */
  silver = 0;
  gemXp = 0;
  loot: Loot[] = [];
  passives: Record<PassiveId, number> = { might: 0, swift: 0, haste: 0, reach: 0, vigor: 0, renewal: 0, magnet: 0, fortune: 0, precision: 0, plenty: 0, armor: 0 };
  /** Each hero's transformation gauge (their own kills fill it); all three full opens the Trinity. */
  gauges: Record<HeroId, number> = { elior: 0, tirzah: 0, uri: 0 };
  get gauge() { return this.gauges[this.heroId]; }
  set gauge(v: number) { this.gauges[this.heroId] = v; }
  /** Run aids for the level-up cards: redraws, and choices struck from the run. */
  rerolls = 3;
  banishes = 3;
  banned = new Set<string>();
  /** Until when (scene seconds) a switch lands as a tag combo; and the counts, for the checks. */
  private tagUntil = 0;
  tags = 0;
  trinities = 0;
  evolutions = 0;
  formT = 0;
  private formUses = 0;
  private cds: Record<Act, number> = { dash: 0, skill: 0, form: 0, switch: 0 };
  /** The arrival pose of a blink, and the seconds a Phantom chain holds the stick. */
  private dashT = 0;
  private lockT = 0;
  private impactCd = 0;
  private baseZoom = 1;
  private invuln = 0;
  private spawnT = 0;
  private surgeT = 22;
  private eliteT = 30;
  private pendingLevels = 0;
  /** The stage's monarch has fallen: the field is quiet until the next stage begins. */
  private cleared = false;
  private dead = false;
  private banked = false;
  private slow = 1;
  private slowT = 0;
  /** Foe speed scale (a frost relic or a monarch's death can hold them). */
  foeSpeed = 1;
  private heroD!: Record<HeroId, Derived>;
  /** Run-start strength, which the stages' foes are measured against. */
  private runPower = 1;
  private nums: { t: Phaser.GameObjects.Text; life: number; vy: number }[] = [];
  private numT = 0;
  private hpBar!: Phaser.GameObjects.Graphics;

  constructor() { super('horde'); }

  // ---------------------------------------------------------------- the derived numbers

  get heroId(): HeroId { return this.hero.hero; }
  private get d() { return this.heroD[this.heroId]; }
  /** A hero's strength from the journey: its attack, compressed so a strong save is strong but never untouchable. */
  private power(id: HeroId) { return Math.pow(Math.max(1, this.heroD[id].atk / 10), 0.8); }
  get dmgMult() { return this.power(this.heroId) * (1 + 0.12 * this.passives.might) * (this.formT > 0 ? KIT[this.heroId].form[0] : 1); }
  get cdMult() { return (1 - 0.08 * this.passives.haste) * (this.formT > 0 ? KIT[this.heroId].form[1] : 1); }
  get areaMult() { return 1 + 0.12 * this.passives.reach; }
  get plenty() { return this.passives.plenty; }
  private get speed() { return 96 * (1 + 0.08 * this.passives.swift) * (this.formT > 0 ? KIT[this.heroId].form[2] : 1); }
  private get crit() { return Math.min(0.6, this.d.crit + 0.06 * this.passives.precision); }
  private get armor() { return Math.min(0.65, 0.08 * this.passives.armor + Math.min(0.3, this.d.dr * 0.5)); }
  private get reach() { return 42 * (1 + 0.4 * this.passives.magnet); }
  private get fortune() { return 1 + 0.15 * this.passives.fortune; }
  private get xpNext() { return 5 + this.level * 6 + Math.floor(Math.pow(this.level, 1.6)); }
  private baseMaxHp() { return Math.round((60 + Math.max(this.heroD.elior.maxHp, this.heroD.tirzah.maxHp) * 0.4) * (1 + 0.2 * this.passives.vigor)); }

  /** Adds a game object to the world (seen by the zoomed camera) or the UI (seen by the screen camera). */
  wl<T extends Phaser.GameObjects.GameObject>(o: T): T { this.worldLayer.add(o); return o; }
  ul<T extends Phaser.GameObjects.GameObject>(o: T): T { this.uiLayer.add(o); return o; }

  // ---------------------------------------------------------------- setting up

  create() {
    this.save = (loadSave() as PhaserSave | null) ?? (newSave(false) as PhaserSave);
    if (!this.save.archer) this.save.archer = newArcher(this.save);
    const eliorD = stats(this.save);
    this.heroD = { elior: eliorD, tirzah: archerStats(this.save, eliorD), uri: uriStats(this.save, eliorD) };
    this.runPower = Math.max(this.power('elior'), this.power('tirzah'));
    this.reset();
    hordeTextures(this);
    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer().setDepth(10);
    this.cameras.main.setBackgroundColor('#07060a');
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.cameras.main.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);
    this.terrain = new Terrain(this, this.worldLayer);
    this.swarm = new Swarm(this);
    this.pickups = new Pickups(this);
    this.hero = new HordeHero(this, (o) => this.wl(o), eliorD.family);
    this.hero.hero = this.save.playableHero === 'tirzah' ? 'tirzah' : 'elior';
    this.arsenal = new Arsenal(this);
    this.shaman = new Shaman(this);
    this.hpBar = this.wl(this.add.graphics());
    // The scene object outlives a run: the last visit's numbers were destroyed with it.
    this.nums = [];
    for (let i = 0; i < 28; i++) this.nums.push({ t: this.wl(this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#ffffff', stroke: '#07060a', strokeThickness: 4 }).setOrigin(0.5).setScale(0.36).setVisible(false)), life: 0, vy: 0 });
    this.ui = new HordeUI(this);
    this.cameras.main.startFollow(this.hero.sprite, true, 0.18, 0.18, 0, 12);
    this.fit();
    this.scale.on('resize', this.fit, this);
    this.input.on('pointerdown', () => { this.touch = true; });
    this.input.keyboard?.on('keydown', () => { this.touch = false; });
    const onHide = () => { if (document.hidden && !this.overlay && !this.dead) this.openPause(); };
    document.addEventListener('visibilitychange', onHide);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.fit, this);
      document.removeEventListener('visibilitychange', onHide);
      this.ui.destroy();
      this.overlay?.();
      this.overlay = null;
    });
    this.arsenal.raise('blade'); this.arsenal.raise('bow'); this.arsenal.raise('flame');
    this.startStage(1);
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __remnant: Record<string, unknown> }).__remnant = { ...((window as unknown as { __remnant?: Record<string, unknown> }).__remnant ?? {}), game: this.game, horde: this };
  }

  private reset() {
    this.stage = 1; this.stageT = 0; this.level = 1; this.xp = 0; this.kills = 0; this.silver = 0; this.gemXp = 0; this.loot = [];
    for (const k of Object.keys(this.passives) as PassiveId[]) this.passives[k] = 0;
    this.gauges = { elior: 0, tirzah: 0, uri: 0 }; this.rerolls = 3; this.banishes = 3; this.banned = new Set(); this.tagUntil = 0; this.tags = this.trinities = this.evolutions = 0; this.formT = 0; this.formUses = 0; this.prayed = false; this.uriLevels = 0; this.dead = false; this.banked = false; this.pendingLevels = 0;
    this.maxHp = this.hp = this.baseMaxHp();
    this.cds = { dash: 0, skill: 0, form: 0, switch: 0 };
  }

  private fit() {
    const W = this.scale.width, H = this.scale.height;
    this.baseZoom = Math.min(W, H) / VIEW;
    this.cameras.main.setSize(W, H).setZoom(this.baseZoom);
    this.uiCam.setSize(W, H);
    this.ui?.layout();
  }

  // ---------------------------------------------------------------- stages

  private startStage(n: number) {
    this.stage = n; this.stageT = 0; this.spawnT = 0; this.surgeT = 22; this.eliteT = 28; this.cleared = false;
    this.biome = BIOMES[(n - 1) % BIOMES.length];
    this.terrain.set(this.biome);
    music.play(this.biome.music);
    this.ui.banners(`STAGE ${n}`, this.biome.name);
    sfx('horn', { vol: 0.5 });
  }

  /** Foes for this stage: health and harm by stage, measured against the run's starting strength. */
  private get foeHp() { return stageHp(this.stage) * Math.pow(this.runPower, 0.6); }
  private get foeDmg() { return stageDmg(this.stage); }

  /** Where the horde enters: just past the edge of the view, all round. */
  private ring(extra = 24) {
    const v = this.cameras.main.worldView, a = Math.random() * Math.PI * 2, r = Math.hypot(v.width, v.height) / 2 + extra;
    return { x: this.hero.x + Math.cos(a) * r, y: this.hero.y + Math.sin(a) * r };
  }
  private pickFoe() {
    // The place's first foes are its common ones; the last, its rare heavies.
    const list = this.biome.foes, w = [5, 4, 3, 2, 1].slice(0, list.length), total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[0];
  }
  spawnFoe(x?: number, y?: number, id = this.pickFoe(), elite = false) {
    const p = x === undefined || y === undefined ? this.ring() : { x, y };
    return this.swarm.spawn(id, p.x, p.y, this.foeHp, this.foeDmg, elite);
  }

  private spawning(dt: number) {
    if (this.cleared) return;
    const n = this.stage, t = this.stageT;
    const cap = Math.min(MAX_FOES - 30, 34 + n * 16 + t * 1.1) * (this.boss ? 0.45 : 1);
    this.spawnT -= dt * (1.4 + n * 0.45 + t / 28) * (this.boss ? 0.5 : 1);
    while (this.spawnT <= 0) { this.spawnT += 1; if (this.swarm.count < cap) this.spawnFoe(); }
    // A surge: a ring of the place's commonest foe closing in from every side.
    this.surgeT -= dt;
    if (this.surgeT <= 0 && !this.boss) {
      this.surgeT = 30;
      const m = Math.min(28, 14 + n * 2), v = this.cameras.main.worldView, r = Math.hypot(v.width, v.height) / 2 + 10;
      for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2; this.spawnFoe(this.hero.x + Math.cos(a) * r, this.hero.y + Math.sin(a) * r, this.biome.foes[0]); }
      this.ui.toast('The horde surges!');
    }
    this.eliteT -= dt;
    if (this.eliteT <= 0 && !this.boss) {
      this.eliteT = 34;
      const id = this.biome.foes[2 + Math.floor(Math.random() * (this.biome.foes.length - 2))];
      if (this.spawnFoe(undefined, undefined, id, true)) this.ui.toast('An elite approaches · it carries a chest');
    }
    if (!this.boss && t >= stageTime(n)) this.raiseBoss();
  }

  private raiseBoss() {
    const p = this.ring(-30), id = this.biome.boss;
    this.boss = new HordeBoss(this, id, p.x, p.y, 170 * this.foeHp * (1 + this.stage * 0.08), 13 * this.foeDmg);
    this.ui.banners(this.boss.name, `${this.boss.title} · stage ${this.stage}`, 3);
    music.play(id);
    sfx('monarchRoar'); this.shake(0.01, 400); haptic('phase');
  }

  private bossFell() {
    const b = this.boss!;
    this.cleared = true;
    this.arsenal.boom('vfx-transform', 8, 8, b.x, b.y - 30, 0.9, 1.4);
    this.shake(0.014, 500); sfx('finisher'); haptic('heavy');
    this.slowMo(0.25, 1.2);
    // Every foe on the field falls with it, and every gem flies home.
    for (const f of this.swarm.list) if (f.alive) this.kill(f, false);
    this.swarm.clearShots(b.x, b.y, 1e5);
    this.pickups.gather();
    const tier = Math.min(4, 1 + Math.floor(this.stage / 2));
    const spoil = Math.random() < (this.heroId === 'tirzah' ? 0.6 : 0.35) ? archerDrop(this.save, Math.min(10, this.stage + 1), 'boss') : rollGear(tier);
    this.loot.push(spoil);
    this.silver += Math.round(40 * this.stage * this.fortune);
    // A broken crown evolves a ready weapon too, and grants a redraw and a banish.
    this.evolve();
    this.rerolls++; this.banishes++;
    this.ui.banners(`${b.name} FALLS`, 'Its crown is broken', 2.2);
    b.destroy();
    this.boss = null;
    music.play('victory');
    this.time.delayedCall(2400, () => this.openCleared(spoil));
  }

  // ---------------------------------------------------------------- the step

  update(_t: number, delta: number) {
    const raw = Math.min(delta / 1000, 1 / 20);
    if (this.overlay) { input.poll(); this.terrain.update(0, this.cameras.main.worldView); this.ui.update(0, this.readout(), true); return; }
    if (this.slowT > 0) { this.slowT -= raw; if (this.slowT <= 0) this.slow = 1; }
    const dt = raw * this.slow;
    this.stageT += dt;
    if (this.ui.pressed.size) this.acts();
    for (const k of Object.keys(this.cds) as Act[]) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.formT > 0) { this.formT -= dt; if (this.formT <= 0) this.endForm(); }
    if (!this.dead) {
      // Moving, except for a moment after a blink and while a Phantom chain carries the hero.
      let mx = this.ui.mx, my = this.ui.my;
      this.dashT = Math.max(0, this.dashT - dt); this.lockT = Math.max(0, this.lockT - dt); this.impactCd = Math.max(0, this.impactCd - raw);
      if (this.dashT > 0 || this.lockT > 0) mx = my = 0;
      this.hero.vx = mx * this.speed; this.hero.vy = my * this.speed;
      this.hero.x += this.hero.vx * dt; this.hero.y += this.hero.vy * dt;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.005 * this.passives.renewal * dt);
      this.spawning(dt);
      this.arsenal.update(dt);
    }
    this.hero.update(dt, this.dead ? 0 : this.ui.mx, this.dead ? 0 : this.ui.my, this.dashT > 0, this.invuln > 0);
    const view = this.cameras.main.worldView;
    this.swarm.update(dt, this.hero.x, this.hero.y, view);
    if (!this.dead) this.touchDamage();
    this.shaman.update(dt);
    this.boss?.update(dt);
    if (this.boss && !this.boss.alive) this.bossFell();
    this.pickups.update(dt, this.hero.x, this.hero.y, this.reach);
    this.terrain.update(dt, view);
    this.numbers(raw);
    this.hpBar.clear();
    if (this.hp < this.maxHp && !this.dead) {
      const w = 26, x = this.hero.x - w / 2, y = this.hero.y + 5;
      this.hpBar.fillStyle(0x07060a, 0.7).fillRect(x, y, w, 3).fillStyle(0xd8384a, 1).fillRect(x, y, w * (this.hp / this.maxHp), 3).setDepth(this.hero.y + 1);
    }
    this.ui.update(raw, this.readout());
    if (this.pendingLevels > 0 && !this.overlay && !this.dead) this.openLevelUp();
  }

  private readout() {
    const other = this.nextHero;
    return {
      hp: this.hp, maxHp: this.maxHp, xp: this.xp, xpNext: this.xpNext, level: this.level,
      stage: this.stage, time: Math.max(0, stageTime(this.stage) - this.stageT), stageTime: stageTime(this.stage), kills: this.kills, silver: this.silver,
      hero: KIT[this.heroId].name, heroId: this.heroId, other: KIT[other].name,
      cd: { dash: this.cds.dash / (1.8 * this.cdMult), skill: this.cds.skill / this.skillCd(), form: 0, switch: this.cds.switch / 5 },
      gauge: this.gauge, form: this.formT / FORM_TIME, gauges: HEROES.map((id) => this.gauges[id]), trinity: this.trinityReady && this.formT <= 0, tag: this.tagOpen,
      boss: this.boss ? { name: this.boss.name, title: this.boss.title, hp: this.boss.hp, max: this.boss.maxHp } : null,
    };
  }

  // ---------------------------------------------------------------- the player's acts

  private skillCd() { return KIT[this.heroId].skillCd * this.cdMult; }
  private get nextHero() { return HEROES[(HEROES.indexOf(this.heroId) + 1) % HEROES.length]; }

  private acts() {
    for (const a of this.ui.pressed) {
      if (a === 'pause') { if (!this.dead) this.openPause(); continue; }
      if (this.dead) continue;
      if (a === 'dash' && this.cds.dash <= 0) {
        this.blink();
      } else if (a === 'skill' && this.cds.skill <= 0) {
        this.cds.skill = this.skillCd();
        if (this.heroId === 'elior') this.arsenal.storm(2.4);
        else if (this.heroId === 'tirzah') this.arsenal.rain();
        else {
          this.arsenal.heaven();
          // The prayer's verse, the first time each run.
          if (!this.prayed) { this.prayed = true; this.ui.banners('FIRE FROM HEAVEN', '“Then the fire of the LORD fell” · 1 Kings 18:38 (KJV)', 2.6); }
        }
        sfx(KIT[this.heroId].skillSfx, { vol: 0.6 }); haptic('heavy');
        this.tagWindow();
      } else if (a === 'form') {
        if (this.formT <= 0 && this.trinityReady) this.trinity();
        else if (this.formT <= 0 && this.gauge >= 1) this.beginForm();
      } else if (a === 'switch' && this.cds.switch <= 0) this.switchHero();
    }
    this.ui.pressed.clear();
  }

  /**
   * The dash is a blink for every hero: Elior's Phantom Step cuts through what it passes, Tirzah's Dawnstep looses a
   * fan of arrows where she lands (stepping away from the horde when the stick is still), and Uri's Ember Step bursts
   * into fire at both ends.
   */
  private blink() {
    let dx = this.ui.mx, dy = this.ui.my;
    if (Math.hypot(dx, dy) < 0.2) {
      const f = this.heroId === 'tirzah' ? this.swarm.nearest(this.hero.x, this.hero.y, 200) : null;
      if (f) { dx = this.hero.x - f.x; dy = this.hero.y - f.y; } else { dx = this.hero.face; dy = 0; }
    }
    const n = Math.hypot(dx, dy) || 1, dist = this.heroId === 'elior' ? 84 : 72, x0 = this.hero.x, y0 = this.hero.y;
    const x1 = x0 + (dx / n) * dist, y1 = y0 + (dy / n) * dist;
    // Afterimages along the way, then the hero is simply there.
    for (let i = 0; i < 3; i++) this.hero.ghost(x0 + (x1 - x0) * (i / 3), y0 + (y1 - y0) * (i / 3), 0.18 + i * 0.06);
    this.hero.x = x1; this.hero.y = y1;
    if (Math.abs(dx) > 0.1) this.hero.face = dx > 0 ? 1 : -1;
    this.dashT = 0.1; this.invuln = Math.max(this.invuln, 0.35); this.cds.dash = 1.8 * this.cdMult;
    this.swarm.clearShots(x0, y0 - 10, 30); this.swarm.clearShots(x1, y1 - 10, 30);
    if (this.heroId === 'elior') this.arsenal.phantomStep(x0, y0, x1, y1);
    else if (this.heroId === 'tirzah') this.arsenal.dawnstep(x0, y0, x1, y1);
    else this.arsenal.emberStep(x0, y0, x1, y1);
    sfx('teleport', { vol: 0.5 }); sfx('dash', { vol: 0.4 }); haptic('light');
  }

  /** A Phantom chain carries the hero: the stick waits, and no blow lands, until it ends. */
  lockHero(sec: number) { this.lockT = Math.max(this.lockT, sec); this.invuln = Math.max(this.invuln, sec + 0.1); }

  /**
   * An impact frame for the big blows (a chain's last cut, an elite felled, fire from heaven): the world almost
   * stops for a breath, the camera punches in, light rings out, and the screen shakes. At most one a half second.
   */
  impact(x: number, y: number, power = 1) {
    if (this.impactCd > 0) return;
    this.impactCd = 0.5;
    this.slowMo(0.06, 0.06 + 0.05 * power);
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.setZoom(this.baseZoom * (1 + 0.07 * power));
    this.tweens.add({ targets: cam, zoom: this.baseZoom, duration: 280, ease: 'Cubic.easeOut' });
    this.arsenal.boom('vfx-impacts', 18, 6, x, y + 10, 0.3, 0.5 * power);
    this.shake(0.006 * power, 160);
    sfx('hitHeavy', { vol: 0.6 }); haptic('heavy');
  }

  private beginForm() {
    this.gauge = 0; this.formT = FORM_TIME; this.formUses++;
    this.hero.form = true;
    this.arsenal.forming(this.heroId);
    this.invuln = Math.max(this.invuln, 0.8);
    const kit = KIT[this.heroId];
    this.ui.banners(kit.formName, kit.formSub, 1.8);
    // The shaman steps into Uri: the two are one for the Crown's length.
    if (this.heroId === 'uri') this.shaman.show(false);
    sfx(kit.formSfx); this.shake(0.008, 300); haptic('phase');
    this.slowMo(0.4, 0.5);
    this.tagWindow(2);
  }
  private endForm() { this.formT = 0; this.hero.form = false; sfx('mantleEnd', { vol: 0.5 }); if (this.heroId === 'uri') this.shaman.show(true); }

  private switchHero() {
    if (this.formT > 0) this.endForm();
    const next = this.nextHero;
    this.hero.hero = next;
    // The story knows two heroes; Uri's turn leaves the journey's choice as it was.
    if (next !== 'uri') this.save.playableHero = next;
    this.shaman.show(next === 'uri');
    this.cds.switch = 5; this.cds.skill = Math.min(this.cds.skill, 2);
    this.invuln = Math.max(this.invuln, 0.5);
    this.arsenal.landing();
    sfx('teleport', { vol: 0.6 }); haptic('select');
    // Switched while the last hero's big move still rings out: the one arriving finishes it.
    if (this.time.now / 1000 < this.tagUntil) { this.tagCombo(next); return; }
    this.ui.toast(next === 'uri' ? `${KIT.uri.arrive} · level ${uriOf(this.save).level}` : KIT[next].arrive);
  }

  /** A switch lands as a tag combo for the next moment or two after a skill, a transformation or a Phantom chain. */
  tagWindow(sec = 1.6) { this.tagUntil = this.time.now / 1000 + sec; }
  get tagOpen() { return this.time.now / 1000 < this.tagUntil; }

  /**
   * The tag combos: Tirzah arrives with a volley on the thickest of the horde and a ring of arrows; Uri arrives in a
   * pillar of fire with three more around him; Elior arrives in a Phantom chain (or, with no chain to make, a storm).
   */
  private tagCombo(next: HeroId) {
    this.tagUntil = 0; this.tags++;
    const x = this.hero.x, y = this.hero.y;
    let name: string;
    if (next === 'tirzah') {
      name = 'DAWN VOLLEY';
      this.arsenal.rain();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.arsenal.launch('arrow', x, y - 14, Math.cos(a), Math.sin(a), 440, 12, 3, 0.6); }
    } else if (next === 'uri') {
      name = 'EMBER CRASH';
      this.arsenal.strike(x, y, 64 * this.areaMult, 34, 'fire', true);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; this.arsenal.strike(x + Math.cos(a) * 70, y + Math.sin(a) * 56, 36, 20, 'fire'); }
    } else {
      name = 'PHANTOM ENTRY';
      if (!this.arsenal.phantomNow()) this.arsenal.storm(1.2);
    }
    // A good tag feeds the one arriving, and the switch comes back sooner.
    this.gauges[next] = Math.min(1, this.gauges[next] + 0.15);
    this.cds.switch = 3;
    this.ui.banners('TAG COMBO', name, 1.2);
    this.impact(x, y - 16, 1);
  }

  get trinityReady() { return HEROES.every((id) => this.gauges[id] >= 1); }

  /**
   * The Trinity: every gauge spent at once. The two heroes not in play stand at either shoulder; Elior's echo cuts
   * through the nearest foes, Tirzah's volley falls on the thickest knot, and Uri's fire comes down from heaven.
   */
  private trinity() {
    for (const id of HEROES) this.gauges[id] = 0;
    this.trinities++;
    this.invuln = Math.max(this.invuln, 2);
    this.hero.trinity(HEROES.filter((id) => id !== this.heroId), 3);
    this.arsenal.echoCuts(8, 26);
    this.time.delayedCall(250, () => this.arsenal.rain());
    this.time.delayedCall(500, () => this.arsenal.heaven());
    this.ui.banners('TRINITY', 'Elior, Tirzah and Uri as one', 2.2);
    sfx('transform'); sfx('wingsForm', { vol: 0.6 }); haptic('phase');
    this.impact(this.hero.x, this.hero.y - 16, 1.5);
    this.slowMo(0.35, 0.6);
  }

  /** Healing by a fraction of the hero's health (the evolved Lion and Holy Ground). */
  heal(frac: number) { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * frac); }

  // ---------------------------------------------------------------- blows

  /** A weapon's blow on a foe: the hero's strength, the run's Might, a chance to strike true. True if it fell. */
  damage(f: Foe, base: number, dx: number, dy: number, knock: number) {
    if (!f.alive) return false;
    const crit = Math.random() < this.crit, dmg = base * this.dmgMult * (crit ? 1.6 + this.d.critDmg * 0.5 : 1);
    f.hp -= dmg; f.flashT = 0.06;
    const k = knock / Math.max(1, f.mass * 0.6);
    f.kx += dx * k; f.ky += dy * k;
    if (crit || dmg > f.maxHp * 0.5 || this.numT <= 0) this.number(f.x, f.y - 20 * f.kind.scale, dmg, crit);
    if (crit) this.arsenal.impact(f.x, f.y - 12, true);
    if (f.hp <= 0) { this.kill(f, true); return true; }
    return false;
  }

  /** A blow on the monarch, if it reaches; true if it did. */
  bossHit(x: number, y: number, r: number, base: number, single = false) {
    const b = this.boss;
    if (!b || !b.alive || (b.x - x) ** 2 + (b.y - 30 - y) ** 2 > (r + b.r) ** 2) return false;
    const crit = Math.random() < this.crit, dmg = base * this.dmgMult * (crit ? 1.6 : 1);
    b.hit(dmg);
    this.gauge = Math.min(1, this.gauge + dmg / (b.maxHp * 4));
    if (single || this.numT <= 0) this.number(b.x + (Math.random() - 0.5) * 30, b.y - 60, dmg, crit);
    return true;
  }

  private kill(f: Foe, reward: boolean) {
    const x = f.x, y = f.y;
    this.swarm.kill(f);
    this.arsenal.death(x, y);
    if (!reward) { this.pickups.drop('gem', x, y, f.xp); return; }
    this.kills++;
    sfx('enemyDie', { vol: 0.25, gap: 60 });
    if (this.formT <= 0) this.gauge = Math.min(1, this.gauge + 1 / (60 + this.formUses * 15));
    if (this.formT > 0 && this.heroId === 'elior') this.arsenal.formBurst(x, y);
    this.pickups.drop('gem', x, y, f.xp);
    if (f.elite) { this.pickups.drop('chest', x, y, 1); haptic('kill'); this.impact(x, y - 16, 1); }
    else if (Math.random() < 0.1) this.pickups.drop('coin', x + 6, y, Math.ceil((1 + this.stage * 0.5) * this.fortune));
    else if (Math.random() < 0.012) this.pickups.drop('heart', x - 6, y, 1);
  }

  /** The horde's touch hurts. */
  private touchDamage() {
    if (this.invuln > 0) return;
    this.swarm.near(this.hero.x, this.hero.y - 6, 12, (f) => { this.hurtHero(f.dmg); return true; });
  }

  hurtHero(dmg: number) {
    if (this.invuln > 0 || this.dead || this.overlay) return;
    this.hp -= dmg * (1 - this.armor);
    this.invuln = 0.55; this.hero.hurtT = 0.2;
    sfx('hurt', { vol: 0.5 }); haptic('hurt'); this.shake(0.005, 120);
    if (this.hp <= 0) this.fall();
  }

  private fall() {
    this.hp = 0; this.dead = true;
    this.hero.play('death', 1.2);
    sfx('death'); this.slowMo(0.3, 1.5); haptic('heavy');
    this.time.delayedCall(1700, () => this.openResults(false));
  }

  collect(kind: DropKind, v: number) {
    if (kind === 'gem') {
      const xp = v * this.fortune;
      this.xp += xp; this.gemXp += xp;
      sfx('pickup', { vol: 0.15, gap: 40, pitch: 1 + Math.min(0.5, v * 0.05) });
      while (this.xp >= this.xpNext) { this.xp -= this.xpNext; this.level++; this.pendingLevels++; }
    } else if (kind === 'coin') { this.silver += v; sfx('loot', { vol: 0.25, gap: 50 }); }
    else if (kind === 'heart') { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2); sfx('heal', { vol: 0.5 }); }
    else if (kind === 'chest') {
      // An elite's chest: silver, healing, and an evolution if one is ready (else an upgrade).
      this.silver += Math.round(25 * this.stage * this.fortune);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
      if (!this.evolve()) { this.pendingLevels++; sfx('chest'); this.ui.toast('A chest · silver, healing and a gift'); }
    }
  }

  /** A weapon ready to evolve (its last level, with its partner passive), the hero in play's own first. */
  private evolvable(): WeaponId | null {
    const order = [KIT[this.heroId].weapon, ...(Object.keys(EVOLUTIONS) as WeaponId[])];
    return order.find((id) => this.arsenal.level(id) >= 6 && !this.arsenal.evolved.has(id) && this.passives[EVOLUTIONS[id].with] > 0) ?? null;
  }

  /** Evolve the first ready weapon: its banner, its verse (if it has one), an impact frame. False if none was ready. */
  evolve() {
    const id = this.evolvable();
    if (!id) return false;
    this.arsenal.evolved.add(id); this.evolutions++;
    const e = EVOLUTIONS[id];
    this.ui.banners(e.name.toUpperCase(), e.verse ?? e.desc, 2.6);
    this.ui.toast(`${WEAPONS[id].name} evolved · ${e.desc}`);
    sfx('levelup'); sfx('transform', { vol: 0.5 }); haptic('phase');
    this.impact(this.hero.x, this.hero.y - 16, 1);
    return true;
  }

  // ---------------------------------------------------------------- level-ups

  private choices(): Choice[] {
    const a = this.arsenal, own = KIT[this.heroId].weapon, all: { c: Choice; w: number }[] = [];
    const pool = { push: (o: { c: Choice; w: number }) => { if (!this.banned.has(key(o.c))) all.push(o); } };
    if (a.level(own) < 6) pool.push({ c: { kind: 'weapon', id: own }, w: 4 });
    const relics = a.relics();
    for (const id of RELICS) {
      const lv = a.level(id);
      if (lv > 0 && lv < 6) pool.push({ c: { kind: 'weapon', id }, w: 3 });
      else if (!lv && relics.length < RELIC_SLOTS) pool.push({ c: { kind: 'weapon', id }, w: 2 });
    }
    for (const id of Object.keys(PASSIVES) as PassiveId[]) if (this.passives[id] < PASSIVES[id].max) pool.push({ c: { kind: 'passive', id }, w: 2 });
    const out: Choice[] = [];
    while (out.length < 3 && all.length) {
      let r = Math.random() * all.reduce((s, p) => s + p.w, 0), i = 0;
      for (; i < all.length - 1; i++) { r -= all[i].w; if (r <= 0) break; }
      out.push(all.splice(i, 1)[0].c);
    }
    if (out.length < 3) out.push({ kind: 'boon', id: 'heal' });
    if (out.length < 3) out.push({ kind: 'boon', id: 'silver' });
    return out;
  }

  private describe(c: Choice): [string, string, string] {
    if (c.kind === 'weapon') {
      const def = WEAPONS[c.id], lv = this.arsenal.level(c.id), e = EVOLUTIONS[c.id];
      // The last level says what it evolves with.
      const tag = lv ? `Level ${lv + 1}${lv + 1 === 6 ? ` · evolves with ${PASSIVES[e.with].name}` : ''}` : 'New';
      return [def.name, tag, lv ? def.levels[lv - 1] : def.desc];
    }
    if (c.kind === 'passive') {
      const p = PASSIVES[c.id], lv = this.passives[c.id];
      // A passive that will evolve a weapon already carried says so.
      const pair = (Object.keys(EVOLUTIONS) as WeaponId[]).find((w) => EVOLUTIONS[w].with === c.id && this.arsenal.level(w) > 0 && !this.arsenal.evolved.has(w));
      return [p.name, (lv ? `Level ${lv + 1}` : 'New') + (pair && !lv ? ` · evolves ${WEAPONS[pair].name}` : ''), p.desc];
    }
    return c.id === 'heal' ? ['Rest', 'Boon', 'Recover half your health'] : ['Silver', 'Boon', `+${30 * this.stage} silver`];
  }

  take(c: Choice) {
    if (c.kind === 'weapon') this.arsenal.raise(c.id);
    else if (c.kind === 'passive') {
      this.passives[c.id]++;
      if (c.id === 'vigor') { const before = this.maxHp; this.maxHp = this.baseMaxHp(); this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - before) + this.maxHp * 0.2); }
    } else if (c.id === 'heal') this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5);
    else this.silver += 30 * this.stage;
  }

  private openLevelUp() {
    this.pendingLevels--;
    let opts = this.choices(), banishing = false, panel: HTMLElement | null = null;
    sfx('levelup', { vol: 0.6 }); haptic('select');
    this.pauseField(true);
    const pick = (c: Choice) => {
      if (!banishing) { this.chose(c); return; }
      // A banished choice never comes again this run; the offer is drawn afresh.
      this.banned.add(key(c)); this.banishes--; banishing = false;
      opts = this.choices(); sfx('uiBack'); draw();
    };
    const reroll = () => { if (this.rerolls <= 0) return; this.rerolls--; banishing = false; opts = this.choices(); sfx('uiConfirm'); draw(); };
    const banish = () => { if (this.banishes <= 0 && !banishing) return; banishing = !banishing; draw(); };
    const draw = () => {
      if (!panel) return;
      panel.replaceChildren(el('div', 'hz-title', `LEVEL ${this.level - this.pendingLevels}`), el('p', 'hz-sub', banishing ? 'Choose one to banish from this run' : 'Choose one'));
      const cards = el('div', 'hz-cards');
      opts.forEach((c, i) => {
        const [name, tag, desc] = this.describe(c);
        const card = el('button', banishing ? 'hz-card hz-banish' : 'hz-card', '', () => pick(c));
        card.dataset.k = `hz_card_${i}`;
        card.append(el('b', '', name), el('small', '', tag), el('span', '', desc));
        cards.append(card);
      });
      const row = el('div', 'hz-row');
      const r = el('button', 'hz-btn small', `Reroll · ${this.rerolls}`, reroll), b = el('button', 'hz-btn small' + (banishing ? ' on' : ''), banishing ? 'Cancel banish' : `Banish · ${this.banishes}`, banish);
      r.dataset.k = 'hz_reroll'; b.dataset.k = 'hz_banish';
      if (this.rerolls <= 0) r.setAttribute('disabled', '');
      if (this.banishes <= 0 && !banishing) b.setAttribute('disabled', '');
      row.append(r, b);
      panel.append(cards, row);
    };
    this.overlay = overlay((p) => { panel = p; draw(); });
    const keys = (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0 && opts[i]) { e.preventDefault(); pick(opts[i]); }
      else if (e.code === 'KeyR') reroll();
      else if (e.code === 'KeyB') banish();
    };
    window.addEventListener('keydown', keys);
    this.closeKeys = () => window.removeEventListener('keydown', keys);
  }
  private closeKeys: (() => void) | null = null;
  /** For the tests: the offer on the open card. */
  get offer() { return Array.from(document.querySelectorAll('.hz-card b')).map((b) => b.textContent); }

  private chose(c: Choice) {
    this.take(c);
    this.closeCard();
  }

  private closeCard() {
    this.overlay?.(); this.overlay = null;
    this.closeKeys?.(); this.closeKeys = null;
    // The press that closed the card is not also a dash or a cast.
    input.flush();
    this.pauseField(false);
  }

  private pauseField(on: boolean) {
    this.ui.release();
    if (on) this.tweens.pauseAll(); else this.tweens.resumeAll();
    if (on) this.time.paused = true; else this.time.paused = false;
  }

  // ---------------------------------------------------------------- cards: pause, a cleared stage, the end

  private openPause() {
    if (this.overlay) return;
    this.pauseField(true);
    this.overlay = overlay((p) => {
      p.append(el('div', 'hz-title', 'PAUSED'), el('p', 'hz-sub', `Stage ${this.stage} · ${this.biome.name}`), this.statGrid());
      const b = el('div', 'hz-btns');
      b.append(el('button', 'hz-btn primary', 'Resume', () => this.closeCard()), el('button', 'hz-btn', 'Leave with the spoils', () => { this.closeCard(); this.openResults(true); }));
      (b.firstChild as HTMLElement).dataset.k = 'hz_resume';
      (b.lastChild as HTMLElement).dataset.k = 'hz_leave';
      p.append(b);
    });
  }

  private openCleared(spoil: Loot) {
    if (this.dead) return;
    if (this.overlay) { this.time.delayedCall(300, () => this.openCleared(spoil)); return; }
    this.pauseField(true);
    this.overlay = overlay((p) => {
      p.append(el('div', 'hz-title', `STAGE ${this.stage} CLEARED`), el('p', 'hz-sub', `Spoils: ${this.lootName(spoil)}`), this.statGrid());
      const b = el('div', 'hz-btns');
      const on = el('button', 'hz-btn primary', `Onward to stage ${this.stage + 1}`, () => { this.closeCard(); this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3); this.startStage(this.stage + 1); });
      on.dataset.k = 'hz_next';
      const off = el('button', 'hz-btn', 'Leave with the spoils', () => { this.closeCard(); this.openResults(true); });
      off.dataset.k = 'hz_leave';
      b.append(on, off);
      p.append(b);
    });
  }

  private openResults(left: boolean) {
    if (this.overlay) return;
    const reached = this.stage, best = this.bank();
    this.pauseField(true);
    this.overlay = overlay((p) => {
      p.append(el('div', 'hz-title', left ? 'THE REMNANT WITHDRAWS' : 'THE HORDE PREVAILS'), el('p', 'hz-sub', `Stage ${reached} · ${best ? 'a new best' : `best: stage ${this.save.horde?.best ?? reached}`}`), this.statGrid(true));
      const b = el('div', 'hz-btns');
      const again = el('button', 'hz-btn primary', 'Fight again', () => { this.closeCard(); this.scene.restart(); });
      again.dataset.k = 'hz_again';
      const back = el('button', 'hz-btn', 'Return to the journey', () => { this.closeCard(); this.scene.start('world', { fresh: false }); });
      back.dataset.k = 'hz_return';
      b.append(again, back);
      p.append(b);
    });
  }

  private statGrid(spoils = false) {
    const g = el('div', 'hz-stats'), row = (k: string, v: string) => { const a = el('span', '', k), b = el('b', '', v); g.append(a, b); };
    row('Foes felled', String(this.kills));
    row('Level', String(this.level));
    row('Silver', String(this.silver));
    row('Journey XP', String(this.bankXp()));
    if (this.banked) row('Uri', `level ${uriOf(this.save).level}${this.uriLevels ? ` (+${this.uriLevels})` : ''}`);
    if (spoils || this.loot.length) row('Gear', this.loot.length ? this.loot.map((l) => this.lootName(l)).join(', ') : 'none yet');
    const weapons = [...this.arsenal.lv.entries()].filter(([id]) => !WEAPONS[id].hero || this.arsenal.evolved.has(id)).map(([id, lv]) => this.arsenal.evolved.has(id) ? EVOLUTIONS[id].name : `${WEAPONS[id].name} ${lv}`);
    if (weapons.length) row('Relics', weapons.join(', '));
    return g;
  }

  private lootName(l: Loot) { return l.item && ITEMS[l.item] ? ITEMS[l.item].name : l.silver ? `${l.silver} silver` : 'a keepsake'; }
  /** The run's gems are worth more to the journey the deeper it went. */
  private bankXp() { return Math.round(this.gemXp * (2 + this.stage * 0.25)); }

  /** The run's earnings into the save, once. True when this stage is a new best. */
  private bank() {
    if (this.banked) return false;
    this.banked = true;
    const s = this.save, xp = this.bankXp();
    s.silver += this.silver;
    gainXp(s, xp);
    archerGainXp(s, xp);
    this.uriLevels = uriGainXp(s, xp);
    for (const l of this.loot) {
      if (!l.item || !ITEMS[l.item]) { if (l.silver) s.silver += l.silver; continue; }
      const it = makeItem(l.item, (l.rarity ?? ITEMS[l.item].rarity) as Rarity);
      it.isNew = true;
      if (l.power) it.lootPower = l.power;
      s.inventory.push(it);
    }
    const rec = (s.horde ??= { best: 0, runs: 0, kills: 0, bestKills: 0 }), fresh = this.stage > rec.best;
    rec.runs++; rec.kills += this.kills; rec.best = Math.max(rec.best, this.stage); rec.bestKills = Math.max(rec.bestKills, this.kills);
    s.kills += this.kills;
    writeSave(s);
    return fresh;
  }

  // ---------------------------------------------------------------- feel

  private number(x: number, y: number, v: number, crit: boolean) {
    const n = this.nums.find((o) => o.life <= 0);
    if (!n) return;
    this.numT = 0.06;
    n.life = 0.6; n.vy = -40;
    n.t.setText(String(Math.round(v))).setPosition(x, y).setColor(crit ? '#ffd27a' : '#ffffff').setScale(crit ? 0.5 : 0.36).setVisible(true).setAlpha(1).setDepth(95000);
  }
  private numbers(dt: number) {
    this.numT -= dt;
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt; n.t.y += n.vy * dt; n.vy *= 0.92;
      n.t.setAlpha(Math.min(1, n.life * 3));
      if (n.life <= 0) n.t.setVisible(false);
    }
  }

  shake(intensity: number, ms: number) { const k = shakeScale(); if (k > 0) this.cameras.main.shake(ms, intensity * k); }
  slowMo(scale: number, sec: number) { this.slow = scale; this.slowT = sec; }
  sfx(name: string, vol = 1) { sfx(name, { vol }); }
}

