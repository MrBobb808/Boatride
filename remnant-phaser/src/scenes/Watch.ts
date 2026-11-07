// The Watch (POLISH_PLAN §18): the idle game inside the game. Elior keeps the broken gate of a ruined city; foes walk
// in from the right and he strikes on his own; every kill pays coins, and coins buy his upgrades below. Ten foes to a
// stage, a gate's boss every tenth stage on a timer; levels open his skills, his shadows and the Shadow Mantle; the
// Ascension trades a run for Seals. Away, the wall keeps paying (half rate, eight hours at most). Its numbers are in
// game/watch/defs.ts, its panel in game/watch/ui.ts; its progress is the save's optional `watch`.
import Phaser from 'phaser';
import { loadSave, newSave, writeSave, type PhaserSave } from '../game/save';
import { actionAtlas, actionFrame, ACTION_FOOT, ACTION_CELL } from '../game/actionArt';
import { FOES, type BossId, type FoeKind } from '../game/horde/defs';
import { sceneOf, LAYER_KEYS, WATCH_BOSSES, type Layer } from '../game/watch/scenes';
import propsUrl from '../assets/cc0/props.png';
import propsJson from '../assets/cc0/props.json?url';
import demonUrl from '../assets/cc0/watch-demon.png';
import bladesUrl from '../assets/cc0/blades.png';
import { bossScale } from '../game/bosses';
import { music } from '../classic/shim/music';
import { settings } from '../classic/shim/settings';
import { sfx } from '../../../remnant/src/audio/audio';
import { input } from '../../../remnant/src/core/input';
import { safe, measureSafe } from '../../../remnant/src/ui/safe';
import * as D from '../game/watch/defs';
import { WatchUI } from '../game/watch/ui';
import { simulateAway, applyAway } from '../game/watch/offline';
import { pace } from '../game/watch/balance';
import { tally, rollDays, openChest, claim, type ChestPrize } from '../game/watch/daily';
import { smoothShake, impact, type Tier } from '../game/feel';
import { ShadowBand, pickFoe, SHADOW_ORDER, ESSENCE_OF, BOSS_ESSENCE, UNLOCK_COST, SHADOW_MAX, levelCost, owned, shadowName, type ShadowId } from '../game/watch/shadows';
import type { EchoRole } from '../../../remnant/src/game/data';

/** The wall's world: 300 × 176 units (narrow, so the fighters read large on a phone), the ground at 146; Elior stands
 * at 82 and reaches 30 ahead. */
const SW = 300, SH = 176, GROUND = 146, HOME = 82, REACH = 30;
/** On a rush he runs this fast (world units a second) and stands this far up the road. */
const RUN = 74, RUSH_X = 108;
/** A staged combo's step, in seconds; the world runs at CINE_SLOW of its pace while one plays. */
const STEP = 0.42, CINE_SLOW = 0.25;
/** How long a foe the Comet throws hangs before it comes down (the launch's hit to the fall's). */
const LIFT = 0.42;
/** The glow of each ability's name as it is called. */
const CALL_GLOW: Record<D.AbilityId, string> = { strike: '#e2b85a', pillar: '#ff8a3a', phantom: '#b48cff', storm: '#9fd8ff', comet: '#fff1c4', balm: '#7ae0a0', judgment: '#ffd27a' };
/** The scenes' painted floor sits a little below the fighters' feet; under it, the ground band. */
const FLOOR = GROUND + 4;
/** The CC0 scene layers (src/assets/cc0/scenes), by key. */
const LAYER_URLS = Object.fromEntries(Object.entries(import.meta.glob('../assets/cc0/scenes/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
  .map(([path, url]) => [path.replace(/^.*\/(.*)\.png$/, '$1'), url]));
/** The bosses' atlases (game/bosses.ts cuts their frames) and how many frames each has. */
const BOSS_TEX: Record<BossId, [string, number]> = { beast_monarch: ['varkhos', 8], plague_monarch: ['morvane', 8], cinder_monarch: ['azkar', 4] };

interface WFoe {
  img: Phaser.GameObjects.Image; kind: FoeKind; id: string;
  x: number; hp: number; max: number; dmg: number; speed: number;
  alive: boolean; dying: number; atkT: number; animT: number; flash: number; strikeT: number;
  /** The gate's holder (a key of WATCH_BOSSES), or none. */
  boss: string | null;
  /** A major foe (gold, tougher, leaves essence), and a mage's chill on its blows. */
  elite: boolean;
  chill: number;
  /** Thrown up by the Comet: how long until it comes down. */
  liftT: number;
}
/** One swing: its clip and timing, what it hits (a foe, every foe within `aoe` ahead, or the one before him), and
 * what follows it (the Comet's fall). */
interface Shot { clip: string; t: number; dur: number; hitAt: number; hit: boolean; mult: number; target?: WFoe | null; aoe?: number; then?: Shot; heal?: number;
  /** The ability's light where it lands. */
  fx?: 'strike' | 'launch' | 'comet' | 'storm' }
/** A staged combo: he steps through the dark from mark to mark, a cut on each, while the world all but stops. */
interface Cine { name: string; steps: { foe: WFoe; x: number; face: 1 | -1; clip: string; mult: number }[]; i: number; t: number; home: number }

export class Watch extends Phaser.Scene {
  save!: PhaserSave;
  w!: D.WatchSave;
  ui!: WatchUI;
  kills = 0;
  bossTimeLeft = 0;
  mantleT = 0;
  private from: 'title' | 'world' = 'title';
  private hero!: Phaser.GameObjects.Sprite;
  private keys = { base: '', mantle: '' };
  private hp = 100;
  /** His health now (the panel shows it). */
  get heroHp() { return this.hp; }
  private fallen = 0;
  private swingCd = 0;
  private shot: Shot | null = null;
  private loopT = 0;
  private flip = false;
  private foes: WFoe[] = [];
  /** The shadows fighting beside him (game/watch/shadows.ts), and this stage's spawn count (the sixth is a major foe). */
  band!: ShadowBand;
  private spawned = 0;
  /** Each ability's wait, in seconds. */
  abilT: Partial<Record<D.AbilityId, number>> = {};
  /** Where he stands (he steps up to meet a foe, and runs on rush stages), which way he faces, and whether he runs. */
  hx = HOME;
  private face: 1 | -1 = 1;
  running = false;
  /** On a rush, a foe that took his running cut and stood: he stops to finish it. */
  private engaged: WFoe | null = null;
  /** A staged combo (Phantom Step, Last Watch) under way. */
  cine: Cine | null = null;
  private combo = 0;
  private ghosts: { img: Phaser.GameObjects.Image; life: number }[] = [];
  private cuts: { img: Phaser.GameObjects.Image; t: number; base: number }[] = [];
  private dim!: Phaser.GameObjects.Rectangle;
  private baseZoom = 1;
  /** Balm's softening, in seconds left. */
  private balmT = 0;
  private tapCd = 0;
  private nums: { t: Phaser.GameObjects.Text; life: number; vy: number }[] = [];
  private bursts: { img: Phaser.GameObjects.Image; t: number; base: number; n: number; dur: number }[] = [];
  private pillar!: Phaser.GameObjects.Image;
  /** The abilities' effects: rows of the effects sheets played once as light, some moving or spinning. */
  private fxs: { img: Phaser.GameObjects.Image; t: number; wait: number; base: number; n: number; fd: number; a0: number; spin: number; grow: number; sx: number; sy: number; vx: number; vy: number }[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** A blow's pause: the world holds for a few hundredths of a second as a heavy ability lands. */
  private stopT = 0;
  private pillarT = -1;
  private aura!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.Graphics;
  private hpBar!: Phaser.GameObjects.Graphics;
  private gate = 0;
  /** The scene's painted layers and set pieces (rebuilt at each gate), and the walk on to the next stage. */
  private layers: { ts: Phaser.GameObjects.TileSprite; l: Layer }[] = [];
  private props: Phaser.GameObjects.Image[] = [];
  private walkT = 0;
  private earned = 0;
  private rateT = 0;
  private saveT = 0;
  private uiT = 0;
  private bossName: [string, string] | null = null;

  constructor() { super('watch'); }

  init(data: { from?: 'title' | 'world' }) { this.from = data?.from ?? 'title'; }

  /** The places' art (CC0, art/incoming/cc0/CREDITS.md), loaded the first time the Watch opens. */
  preload() {
    for (const key of LAYER_KEYS) if (!this.textures.exists('cc0-' + key)) this.load.image('cc0-' + key, LAYER_URLS[key]);
    if (!this.textures.exists('cc0-church-column')) this.load.image('cc0-church-column', LAYER_URLS['church-column']);
    if (!this.textures.exists('watch-props')) this.load.atlas('watch-props', propsUrl, propsJson);
    if (!this.textures.exists('watch-demon')) this.load.spritesheet('watch-demon', demonUrl, { frameWidth: 192, frameHeight: 176 });
    if (!this.textures.exists('watch-blades')) this.load.image('watch-blades', bladesUrl);
  }

  create() {
    this.save = (loadSave() as PhaserSave | null) ?? (newSave(false) as PhaserSave);
    this.w = D.migrateWatch(this.save.watch ??= D.newWatch());
    this.cameras.main.setBackgroundColor('#07060a');
    smoothShake(this);
    this.bg = this.add.graphics().setDepth(-10);
    this.arm();
    this.hx = HOME; this.cine = null; this.engaged = null; this.running = false; this.abilT = {};
    this.hero = this.add.sprite(HOME, GROUND, this.keys.base, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.78).setDepth(5);
    this.aura = this.add.image(HOME, GROUND - 22, 'glow').setTint(0xb48cff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0).setDepth(4);
    this.hpBar = this.add.graphics().setDepth(8);
    this.foes = [];
    for (let i = 0; i < 6; i++) this.foes.push({ img: this.add.image(0, GROUND, 'foes-ashen', 0).setVisible(false).setDepth(4), kind: FOES.husk, id: 'husk', x: 0, hp: 0, max: 1, dmg: 0, speed: 0, alive: false, dying: 0, atkT: 0, animT: 0, flash: 0, strikeT: 0, boss: null, elite: false, chill: 0, liftT: 0 });
    const host = this;
    this.band = new ShadowBand(this, {
      get hx() { return host.hx; },
      foesAlive: () => this.foes.filter((f) => f.alive),
      hit: (f, dmg, big) => this.damage(f as WFoe, dmg, big, true),
      heal: (frac) => { const max = D.watchStats(this.w).maxHp; this.hp = Math.min(max, this.hp + max * frac); },
      flare: (x, y, tint, scale) => this.burst(x, y, 0, scale, tint),
    }, GROUND);
    this.band.rebuild(this.w);
    this.events.once('shutdown', () => this.band.destroy());
    this.nums = [];
    for (let i = 0; i < 20; i++) this.nums.push({ t: this.add.text(0, 0, '', { fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif', fontStyle: '900', fontSize: '22px', color: '#ffffff', stroke: '#0e0d27', strokeThickness: 5 }).setOrigin(0.5).setScale(0.4).setDepth(20).setVisible(false), life: 0, vy: 0 });
    this.bursts = [];
    for (let i = 0; i < 8; i++) this.bursts.push({ img: this.add.image(0, 0, 'vfx-impacts', 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9), t: -1, base: 0, n: 6, dur: 0.27 });
    // Afterimages left where he stepped from, and the cuts on the foes.
    this.ghosts = [];
    for (let i = 0; i < 10; i++) this.ghosts.push({ img: this.add.image(0, GROUND, this.keys.base, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.78).setTint(0xb48cff).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(4.5), life: 0 });
    this.cuts = [];
    for (let i = 0; i < 6; i++) this.cuts.push({ img: this.add.image(0, 0, 'vfx-slashes', 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9), t: -1, base: 0 });
    this.dim = this.add.rectangle(SW / 2, SH / 2, SW * 2, SH * 2, 0x05040a, 1).setAlpha(0).setDepth(3.5);
    this.fxs = [];
    for (let i = 0; i < 18; i++) this.fxs.push({ img: this.add.image(0, 0, 'vfx-impacts', 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9), t: -1, wait: 0, base: 0, n: 1, fd: 0.05, a0: 1, spin: 0, grow: 0, sx: 1, sy: 1, vx: 0, vy: 0 });
    if (!this.textures.exists('wt-spark')) { const g = this.make.graphics({}, false); g.fillStyle(0xffffff, 1).fillRect(1, 0, 1, 3).fillRect(0, 1, 3, 1); g.generateTexture('wt-spark', 3, 3); g.destroy(); }
    this.sparks = this.add.particles(0, 0, 'wt-spark', { emitting: false, lifespan: { min: 280, max: 620 }, speed: { min: 40, max: 150 }, angle: { min: 200, max: 340 },
      gravityY: 220, scale: { start: 1.3, end: 0.3 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD' }).setDepth(9.5);
    this.stopT = 0;
    this.pillar = this.add.image(0, GROUND, 'vfx-abilities-1', 40).setOrigin(0.5, 0.82).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9);
    this.ui = new WatchUI(this);
    // Away: the wall went on at half speed (game/watch/offline.ts). It is applied now, before the stage is set, and
    // saved at once, so the card only reports what is already his.
    const awaySecs = (Date.now() - this.w.last) / 1000;
    const away = awaySecs >= 60 ? simulateAway(this.w, awaySecs) : null;
    if (away) {
      applyAway(this.w, away); for (const g of away.gates) this.payGate(g, true);
      // What the wall did away counts toward the days' quests too.
      tally(this.w, 'kills', away.kills); tally(this.w, 'stages', Math.floor(away.kills / D.KILLS_PER_STAGE)); tally(this.w, 'gates', away.gates.length);
    }
    this.dayTurned(rollDays(this.w), true);
    this.w.last = Date.now();
    if (away) this.persist();
    this.hp = D.watchStats(this.w).maxHp;
    this.kills = 0;
    this.startStage(this.w.stage);
    this.fit();
    this.scale.on('resize', this.fit, this);
    // Tapping the wall strikes once more: being there is worth something idling is not.
    this.input.on('pointerdown', () => this.tap());
    const onHide = () => { if (document.hidden) this.persist(); };
    document.addEventListener('visibilitychange', onHide);
    this.events.once('shutdown', () => {
      this.persist();
      this.scale.off('resize', this.fit, this);
      document.removeEventListener('visibilitychange', onHide);
      this.ui.destroy();
    });
    music.play(sceneOf(D.gateOf(this.w.stage)).music);
    if (away && (away.coins > 0 || away.to !== away.from)) this.ui.welcome(away, awaySecs);
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __remnant: Record<string, unknown> }).__remnant = { ...((window as unknown as { __remnant?: Record<string, unknown> }).__remnant ?? {}), game: this.game, watch: this, watchPace: pace, watchPick: pickFoe };
  }

  /** The wall fills the top of an upright phone (the panel below); sideways, the left half. */
  private fit() {
    measureSafe();
    const W = this.scale.width, H = this.scale.height, landscape = W > H * 1.1;
    const top = Math.max(safe.top, 6);
    let vw = landscape ? Math.round(W * 0.52) : W, vh = Math.round((vw * SH) / SW);
    const cssScale = W / window.innerWidth;
    // The bar of coins, the stage and his numbers sits over the wall: the wall starts where it ends, however tall it
    // is on this phone, so nothing of either is hidden behind the other. Sideways, a wall too tall for what is left
    // narrows to fit.
    const hudBottom = this.ui.placeHud(top, landscape, vw / cssScale), under = Math.round((hudBottom + 4) * cssScale);
    const y = landscape ? Math.max(under, Math.round((H - vh) / 2)) : under;
    if (landscape && y + vh > H) { vh = H - y; vw = Math.round((vh * SW) / SH); }
    this.baseZoom = vw / SW;
    this.cameras.main.setViewport(0, y, vw, vh).setZoom(this.baseZoom * (this.cine ? 1.14 : 1)).centerOn(SW / 2, SH / 2);
    this.ui.layout(y / cssScale, (y + vh) / cssScale, landscape, vw / cssScale);
  }
  /** Fit again (the bar over the wall changed height). */
  refit() { this.fit(); }

  // ---------------------------------------------------------------- stages

  private startStage(n: number) {
    this.w.stage = n;
    this.kills = 0; this.spawned = 0;
    for (const f of this.foes) { f.alive = false; f.dying = 0; f.img.setVisible(false); }
    const gate = D.gateOf(n);
    if (gate !== this.gate) {
      const first = this.gate === 0;
      this.gate = gate; this.buildScene();
      if (!first) { this.ui.toast(`Gate ${gate} · ${sceneOf(gate).name}`, 2.6); music.play(sceneOf(gate).music); }
    }
    this.bossName = null;
    if (D.isBoss(n)) {
      const id = sceneOf(gate).boss;
      this.bossName = WATCH_BOSSES[id].name;
      this.bossTimeLeft = D.BOSS_TIME;
      this.spawn(SW + 30, id);
      this.ui.toast(`${this.bossName[0]} · ${this.bossName[1]} holds Gate ${gate}`);
      sfx('horn', { vol: 0.5 });
    }
  }

  /** A gate's place (game/watch/scenes.ts): its painted layers scaled to stand on the floor, its set pieces, and the
   * ground band below them. Built once a gate; the layers then only scroll. */
  private buildScene() {
    const sc = sceneOf(this.gate), k = FLOOR / sc.h;
    for (const { ts } of this.layers) ts.destroy();
    for (const p of this.props) p.destroy();
    this.layers = []; this.props = [];
    sc.layers.forEach((l, i) => {
      const tex = this.textures.get('cc0-' + l.key).getSourceImage() as HTMLImageElement;
      const ts = this.add.tileSprite(0, FLOOR, SW, Math.ceil(tex.height * k), 'cc0-' + l.key).setOrigin(0, 1).setTileScale(k, k).setDepth(-9 + i * 0.1);
      this.layers.push({ ts, l });
    });
    const atlas = this.textures.get('watch-props');
    for (const p of sc.props) {
      const img = atlas.has(p.frame) ? this.add.image(p.x, FLOOR, 'watch-props', p.frame) : this.add.image(p.x, FLOOR, 'cc0-' + p.frame);
      this.props.push(img.setOrigin(0.5, 1).setScale(p.s).setDepth(p.front ? 6 : 2));
    }
    const g = this.bg.clear();
    g.fillStyle(sc.ground[0], 1).fillRect(0, FLOOR, SW, SH - FLOOR);
    g.fillStyle(sc.ground[1], 1).fillRect(0, FLOOR, SW, 1);
    g.fillStyle(sc.ground[1], 0.35);
    for (let i = 0; i < 24; i++) g.fillRect((i * 53) % SW, FLOOR + 5 + ((i * 17) % 20), 2, 1);
  }

  /** His sword: the blade he wields from the armoury, baked into his atlas (and the Mantle's). */
  arm() {
    const b = D.bladeOf(this.w);
    this.keys.base = actionAtlas(this, 'elior', 'blade', false, true, null, b);
    this.keys.mantle = actionAtlas(this, 'elior', 'blade', true, true, null, b);
  }

  /** Wield a blade won at a gate (or -1, his own sword). */
  wield(i: number) {
    if (i >= 0 && !D.bladesWon(this.w)[i]) return;
    this.w.blade = i;
    this.arm();
    this.ui.toast(i >= 0 ? `${D.BLADES[i].name} in hand · blows ×${D.BLADES[i].atk}` : 'His own sword in hand');
    this.persist();
  }

  private spawn(x: number, boss: string | null = null) {
    const f = this.foes.find((o) => !o.alive && o.dying <= 0);
    if (!f) return;
    const sc = sceneOf(this.gate), s = this.w.stage;
    if (boss) {
      const b = WATCH_BOSSES[boss];
      if (b.kind === 'crown') f.img.setTexture(BOSS_TEX[b.id][0], `${b.id}-0`).setOrigin(0.5, 1).setScale(bossScale(this, b.id) * 0.62);
      else if (b.kind === 'demon') f.img.setTexture('watch-demon', 0).setOrigin(0.5, 1).setScale(0.82);
      else { f.kind = FOES[b.foe]; f.id = b.foe; f.img.setTexture(f.kind.sheet, f.kind.row * 4).setOrigin(f.kind.ox / (f.kind.cell ?? 96), f.kind.oy / (f.kind.cell ?? 96)).setScale(f.kind.scale * b.scale); }
      f.speed = 30;
    } else {
      // The place's common foes first, its heavies rarely.
      const r = Math.random(), id = sc.foes[r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : r < 0.93 ? 3 : 4];
      f.id = id; f.kind = FOES[id];
      f.speed = 26 + f.kind.speed * 0.5;
    }
    // From stage 3, the sixth foe of every stage is a major one: gold, larger, tougher, and it leaves essence.
    f.elite = !boss && s >= 3 && this.spawned === 5;
    this.spawned++;
    if (!boss) f.img.setTexture(f.kind.sheet, f.kind.row * 4).setOrigin(f.kind.ox / (f.kind.cell ?? 96), f.kind.oy / (f.kind.cell ?? 96)).setScale(f.kind.scale * (f.elite ? 1.3 : 0.95));
    f.boss = boss;
    f.x = x; f.max = f.hp = D.foeHp(s) * (f.elite ? 5 : 1); f.dmg = D.foeDmg(s) * (f.elite ? 1.6 : 1);
    f.alive = true; f.dying = 0; f.atkT = D.FOE_RATE * 0.6; f.animT = Math.random(); f.flash = 0; f.strikeT = 0; f.chill = 0; f.liftT = 0;
    f.img.setPosition(x, GROUND).setVisible(true).setAlpha(1).clearTint().setFlipX(true);
    if (f.elite) f.img.setTint(0xffd27a);
  }

  private front(): WFoe | null {
    let best: WFoe | null = null;
    for (const f of this.foes) if (f.alive && (!best || f.x < best.x)) best = f;
    return best;
  }

  // ---------------------------------------------------------------- the fight

  /** ×2 and ×3 run the wall two or three steps a frame; a staged combo always plays at its own, slowed pace. */
  update(_t: number, delta: number) {
    // A controller's buttons drive the panel (the shared menu navigation; game/watch/ui.ts).
    input.poll(); input.flush();
    const dt = Math.min(delta / 1000, 0.05), n = this.cine ? 1 : this.w.speed ?? 1;
    // A heavy ability's blow holds the world a moment (its light plays on).
    if (this.stopT > 0) { this.stopT -= dt; this.stepFx(dt); return; }
    for (let i = 0; i < n; i++) this.tick(dt);
  }

  /** One step of the wall (tests call it directly to fast-forward). */
  tick(dt: number) {
    const w = this.w, st = D.watchStats(w);
    const mantle = this.mantleT > 0;
    // Foes to fight: three on the road at most, ten to a stage; a boss stage holds only the boss.
    if (!D.isBoss(w.stage)) {
      const alive = this.foes.filter((f) => f.alive).length;
      if (alive < 3 && this.kills + alive < D.KILLS_PER_STAGE) this.spawn(SW + 20 + alive * 26);
    } else if (!this.foes.some((f) => f.alive) && this.bossTimeLeft > 0 && !this.foes.some((f) => f.dying > 0)) this.spawn(SW + 30, sceneOf(this.gate).boss);
    // A staged combo slows the world to a crawl; he moves at full pace through it.
    const wdt = this.cine ? dt * CINE_SLOW : dt;
    if (this.engaged && !this.engaged.alive) this.engaged = null;
    const order = this.foes.filter((f) => f.alive).sort((a, b) => a.x - b.x), first = order[0] ?? null;
    // On a rush stage he runs at them and cuts through; elsewhere he holds and steps up to meet the first.
    this.running = D.isRush(w.stage) && !this.cine && this.fallen <= 0 && !this.engaged;
    this.walkT = Math.max(0, this.walkT - dt);
    const scroll = this.running ? RUN : this.walkT > 0 ? 50 * Math.sin((this.walkT / 0.8) * Math.PI) : 0;
    if (!this.cine) {
      const want = this.running ? RUSH_X : first && this.fallen <= 0 ? Phaser.Math.Clamp(first.x - REACH + 2, HOME, HOME + 34) : HOME;
      this.hx += Phaser.Math.Clamp(want - this.hx, -70 * dt, 70 * dt);
      this.face = 1;
    }
    // The foes come on: each stops a body's length behind the one ahead, the first at his reach.
    let limit = this.hx + REACH - 4;
    for (const f of order) {
      const stop = limit + (f.boss ? 18 : 0);
      if (f.x > stop) f.x = Math.max(stop, f.x - (f.speed + scroll) * wdt);
      limit = f.x + (f.boss ? 40 : 22);
      f.animT += wdt;
      // At his reach, they strike on their own clock (a runner is past them before they can).
      if (this.fallen <= 0 && !this.running && !this.cine && f === first && f.x <= this.hx + REACH + (f.boss ? 18 : 0)) {
        f.chill = Math.max(0, f.chill - wdt);
        f.atkT -= wdt * (f.chill > 0 ? 0.6 : 1);
        if (f.atkT <= 0) {
          f.atkT = D.FOE_RATE * (f.boss ? 0.8 : 1);
          f.strikeT = 0.25;
          this.hurt(f.dmg * (1 - st.dr) * (this.balmT > 0 ? 0.7 : 1));
        }
      }
    }
    for (const f of this.foes) this.drawFoe(f, wdt);
    // The place passes by as he runs (or walks on between stages): the near layers and the set pieces faster.
    for (const { ts, l } of this.layers) ts.tilePositionX += (((l.drift ?? 0) + scroll * l.par) * wdt) / ts.tileScaleX;
    for (const p of this.props) { p.x -= scroll * 0.6 * wdt; if (p.x < -60) p.x += SW + 120; }
    // The boss's timer (it waits while a combo plays).
    if (D.isBoss(w.stage) && this.fallen <= 0 && !this.cine) {
      this.bossTimeLeft -= dt;
      if (this.bossTimeLeft <= 0) this.bossFled();
    }
    // Elior: fallen, in a combo, or fighting.
    this.balmT = Math.max(0, this.balmT - wdt);
    if (this.fallen > 0) {
      this.fallen -= dt;
      if (this.fallen <= 0) { this.hp = st.maxHp; this.startStage(Math.max(1, w.stage - 1)); }
    } else if (this.cine) this.stepCine(dt);
    else {
      this.hp = Math.min(st.maxHp, this.hp + st.maxHp * st.regen * dt);
      const f = this.front(), inReach = !!f && f.x <= this.hx + REACH + (f.boss ? 22 : 4);
      this.swingCd -= dt;
      if (this.running && f && f.x <= this.hx + REACH + 10 && !this.shot) {
        // A cut on the run: if it does not fell the foe he stops and finishes it.
        this.flip = !this.flip;
        this.shot = { clip: this.flip ? 'dash' : 'b4', t: 0, dur: 0.26, hitAt: 0.35, hit: false, mult: 1.5, target: f };
        sfx('dash', { vol: 0.35 });
      } else if (!this.running && inReach && this.swingCd <= 0 && !this.shot) {
        // A three-cut chain, the last heavier.
        const interval = 1 / (st.aspd * (mantle ? D.MANTLE.speed : 1));
        this.swingCd = interval;
        this.combo = (this.combo + 1) % 3;
        this.shot = { clip: ['b1', 'b2', 'b4'][this.combo], t: 0, dur: Math.min(0.42, interval * 0.9), hitAt: 0.4, hit: false, mult: this.combo === 2 ? 1.3 : 1 };
      }
      // His abilities, on their own clocks: by themselves, or when tapped.
      for (const id of w.loadout ?? []) {
        this.abilT[id] = Math.max(0, (this.abilT[id] ?? 2) - dt);
        if (w.autoSkills && this.abilT[id] === 0 && !this.shot && !this.cine) this.cast(id, false);
      }
    }
    if (this.shot) this.stepShot(dt);
    this.tapCd -= dt;
    // The shadows fight beside him, each in its role (and run with him).
    this.band.tick(wdt, st.atk * (mantle ? D.MANTLE.dmg : 1), scroll > 0, this.fallen <= 0 && !this.cine, REACH);
    // The Shadow Mantle.
    if (this.mantleT > 0) { this.mantleT -= dt; if (this.mantleT <= 0) this.ui.toast('The Mantle falls away'); }
    else if (w.level >= D.MANTLE.level && w.gauge >= 100 && w.auto) this.transformNow();
    this.drawHero(dt);
    this.stepFx(dt);
    // Coins a second (for the welcome-back pay), the save, the panel.
    this.rateT += dt;
    if (this.rateT >= 10) { w.rate = w.rate * 0.6 + (this.earned / this.rateT) * 0.4; this.earned = 0; this.rateT = 0; }
    this.saveT += dt;
    if (this.saveT >= 10) { this.saveT = 0; this.persist(); }
    this.uiT -= dt;
    if (this.uiT <= 0) { this.uiT = 0.2; this.ui.refresh(); }
    this.ui.tick(dt);
  }

  private strike(f: WFoe, mult: number) {
    const st = D.watchStats(this.w), crit = Math.random() < st.crit;
    const dmg = st.atk * mult * (crit ? st.critDmg : 1) * (this.mantleT > 0 ? D.MANTLE.dmg : 1);
    this.damage(f, dmg, crit || mult > 1, false, mult >= 2);
    sfx(mult > 1 || crit ? 'hitHeavy' : 'hit', { vol: 0.5, pitch: 0.95 + Math.random() * 0.1 });
    if (mult > 1) this.land('small');
  }

  /** A tap on the wall: one more quick blow. */
  private tap() {
    if (this.tapCd > 0 || this.fallen > 0) return;
    const f = this.front();
    if (!f || f.x > this.hx + REACH + 30) return;
    this.tapCd = 0.15;
    const st = D.watchStats(this.w);
    this.damage(f, st.atk * 0.5 * (this.mantleT > 0 ? D.MANTLE.dmg : 1), false, false);
    sfx('hit', { vol: 0.35, pitch: 1.2 });
  }

  private damage(f: WFoe, dmg: number, big: boolean, shadow: boolean, huge = false) {
    if (!f.alive) return;
    f.hp -= dmg; f.flash = 0.08;
    this.number(f.x - 4, GROUND - (f.boss ? 70 : 40) - f.liftT * 50, dmg, big, undefined, '', huge);
    this.burst(f.x - 6, GROUND - (f.boss ? 40 : 22), big ? 6 : 0, big ? 0.42 : 0.28, shadow ? 0xb48cff : 0xffffff);
    if (f.hp <= 0) this.kill(f);
  }

  private kill(f: WFoe) {
    const w = this.w, st = D.watchStats(w);
    f.alive = false; f.dying = 0.35;
    const coins = D.foeCoins(w.stage) * st.coinMult * (f.elite ? 5 : 1);
    w.coins += coins; this.earned += coins;
    this.coinText(f.x, GROUND - 30, coins);
    this.gainXp(D.foeXp(w.stage));
    if (w.level >= D.MANTLE.level && this.mantleT <= 0) w.gauge = Math.min(100, w.gauge + D.MANTLE.perKill);
    // Major foes leave essence of a shadow: an elite one of its own kind, a gate's holder three and one of the Marshal's.
    if (f.elite) this.gainEssence(ESSENCE_OF[f.id] ?? 'sentinel', 1, f.x);
    // The days' quests count what the wall does (game/watch/daily.ts).
    tally(w, 'kills'); if (f.elite) tally(w, 'elites');
    if (f.boss) { this.gainEssence(BOSS_ESSENCE[f.boss] ?? 'knight', 3, f.x); this.gainEssence('marshal', 1, f.x); this.bossDown(); return; }
    this.kills++;
    if (this.kills >= D.KILLS_PER_STAGE) {
      tally(w, 'stages');
      // Cleared: on to the next stage, or (holding back after a lost fight) once more here, to grow.
      if (w.auto) this.next(); else this.startStage(w.stage);
    }
  }

  private next() {
    const w = this.w;
    this.walkT = 0.8;
    const n = w.stage + 1;
    w.best = Math.max(w.best, n); w.bestEver = Math.max(w.bestEver, n);
    this.startStage(n);
  }

  private bossDown() {
    const w = this.w, gate = D.gateOf(w.stage);
    this.land('large');
    tally(w, 'gates'); tally(w, 'stages');
    sfx('bossSlam', { vol: 0.5 }); sfx('lootRare', { vol: 0.6 });
    this.payGate(gate, false);
    this.bossName = null;
    this.next();
  }

  /** The main game's share, once a gate: silver, two capes, and the first eight gates' blades. `quiet` while away. */
  private payGate(gate: number, quiet: boolean) {
    const w = this.w;
    if (w.paid.includes(gate)) { if (!quiet) this.ui.toast(`Gate ${gate} holds`); return; }
    w.paid.push(gate);
    const silver = D.silverFor(gate);
    this.save.silver += silver;
    const cape = D.CAPE_AT[gate];
    if (cape) { const st = (this.save.store ??= {}); (st.capes ??= []).includes(cape) || st.capes.push(cape); }
    const blade = D.BLADES[gate - 1];
    if (!quiet) this.ui.toast(`Gate ${gate} holds · +${silver} silver for the journey${cape ? ' · and a cape' : ''}${blade ? ` · a new blade: ${blade.name} (Hero → armoury)` : ''}`, 3.6);
  }

  /** A new day (or the first): the streak's news, as a toast. `quiet` on opening (the welcome card speaks first). */
  private dayTurned(r: ReturnType<typeof rollDays>, quiet = false) {
    if (!r.newDay) return;
    const msg = r.forgiven ? `Day ${r.streak} of your streak · a missed day forgiven (once a week)` : r.reset ? 'A new streak begins · Daily' : `Day ${r.streak} of your streak · Daily`;
    if (!quiet) this.ui.toast(msg, 3); else this.time.delayedCall(1200, () => this.ui.toast(msg, 3));
    this.ui.refresh();
  }

  /** Midnight passed while the wall ran: draw the new day. */
  checkDay() { if (this.ui) this.dayTurned(rollDays(this.w)); }

  /** Take a quest's, the streak's or the all-three chests (the Daily tab). */
  claimDaily(what: Parameters<typeof claim>[1]) {
    const n = claim(this.w, what);
    if (n) { sfx('lootRare', { vol: 0.5 }); this.ui.toast(`+${n} chest${n > 1 ? 's' : ''}`, 1.6); this.persist(); }
    return n;
  }

  /** Open a chest: Watch rewards only (game/watch/daily.ts ODDS, with its pity). */
  openChest(rnd = Math.random()): ChestPrize | null {
    const owned = SHADOW_ORDER.filter((id) => (this.w.shadows?.[id]?.lv ?? 0) > 0), pool = owned.length ? owned : SHADOW_ORDER;
    const prize = openChest(this.w, rnd, (r) => pool[Math.floor(r * pool.length) % pool.length]);
    if (!prize) return null;
    sfx(prize.rarity === 'common' ? 'pickup' : 'lootRare', { vol: 0.6 });
    if (prize.seals) this.land('medium');
    this.persist();
    return prize;
  }

  /** What `secs` away would bring now (tests set it beside the live wall). */
  awayReport(secs: number) { return simulateAway(this.w, secs); }

  private bossFled() {
    const w = this.w;
    for (const f of this.foes) if (f.boss) { f.alive = false; f.dying = 0.35; }
    w.auto = false;
    this.ui.toast('The boss holds the gate. Grow stronger, then Challenge it.', 3.2);
    this.startStage(Math.max(1, w.stage - 1));
  }

  challenge() { this.w.auto = true; this.ui.refresh(); }

  private hurt(dmg: number) {
    // The guardians take their share (Aegis).
    this.hp -= dmg * (1 - this.band.aegis());
    this.hero.setTint(0xff7a7a);
    this.time.delayedCall(90, () => this.hero.clearTint());
    if (this.hp <= 0) {
      this.hp = 0; this.fallen = 2; this.shot = null; this.mantleT = 0;
      this.w.auto = false;
      this.ui.toast('Elior falls back to the stage before. Grow stronger, then Challenge again.', 3.2);
      sfx('hurt', { vol: 0.6 });
    }
  }

  private gainXp(n: number) {
    const w = this.w;
    w.xp += n;
    while (w.xp >= D.watchXpNext(w.level)) {
      w.xp -= D.watchXpNext(w.level); w.level++;
      this.hp = D.watchStats(w).maxHp;
      const opens = D.UNLOCKS.find(([lv]) => lv === w.level);
      this.ui.toast(opens ? `Level ${w.level} · ${opens[1]}` : `Elior reaches Watch level ${w.level}`, opens ? 3.6 : 1.8);
      sfx('levelup', { vol: 0.5 });
    }
  }

  transformNow() {
    const w = this.w;
    if (w.level < D.MANTLE.level || w.gauge < 100 || this.mantleT > 0 || this.fallen > 0) return;
    w.gauge = 0; this.mantleT = D.MANTLE.time;
    sfx('transform', { vol: 0.6 }); this.land('medium');
    this.flash(180, 120, 70, 200);
    this.play('vfx-abilities-1', 24, 8, this.hx, GROUND - 24, { s: 0.75, fd: 0.06, tint: 0xc59bff });
    this.ui.callout('THE SHADOW MANTLE', '#b48cff');
    this.ui.toast('THE SHADOW MANTLE · heavier, faster blows');
  }

  private castPillar(mult: number) {
    let far: WFoe | null = null;
    // The furthest foe in sight (one still coming on beyond the edge would burn unseen).
    for (const f of this.foes) if (f.alive && f.x < SW - 30 && (!far || f.x > far.x)) far = f;
    far ??= this.front();
    if (!far) return;
    this.pillar.setPosition(far.x, GROUND + 4).setScale(0.62, 0.85).setVisible(true).setFrame(40);
    this.pillarT = 0;
    // The ground breaks under it, embers fly, and the wall lights orange.
    this.play('vfx-impacts', 12, 6, far.x, GROUND - 6, { s: 0.7, fd: 0.05, tint: 0xffb070 });
    this.play('vfx-impacts', 18, 6, far.x, GROUND - 1, { sx: 1.1, sy: 0.3, fd: 0.06, grow: 1.4, tint: 0xffb070 });
    this.sparks.setParticleTint(0xffa040).explode(22, far.x, GROUND - 20);
    this.flash(120, 255, 150, 60); this.land('medium');
    const st = D.watchStats(this.w), x = far.x;
    // The fire takes the furthest foe, and any standing within a stride of it.
    for (const f of this.foes) if (f.alive && Math.abs(f.x - x) <= 26) this.damage(f, st.atk * mult * (f === far ? 1 : 0.5) * (this.mantleT > 0 ? D.MANTLE.dmg : 1), true, false, f === far);
    sfx('pillarFire', { vol: 0.5 });
  }

  // ---------------------------------------------------------------- swings, abilities and the staged combos

  /** A swing plays out; at its moment it lands on its foe, on every foe in its reach, or on the one before him. */
  private stepShot(dt: number) {
    const sh = this.shot!;
    sh.t += dt;
    if (!sh.hit && sh.t >= sh.dur * sh.hitAt) {
      sh.hit = true;
      if (sh.heal) {
        const st = D.watchStats(this.w); this.hp = Math.min(st.maxHp, this.hp + st.maxHp * sh.heal); this.balmT = 6; sfx('heal', { vol: 0.5 });
        this.play('vfx-abilities-2', 32, 8, this.hx, GROUND - 26, { s: 0.62, fd: 0.07 });
        this.play('vfx-abilities-1', 32, 8, this.hx, GROUND - 6, { sx: 0.8, sy: 0.55, fd: 0.07, tint: 0xb8ffd0 });
        this.number(this.hx, GROUND - 62, st.maxHp * sh.heal, true, '#9effc0', '+');
      }
      else if (sh.aoe) {
        if (sh.fx) this.landFx(sh.fx, null);
        for (const f of this.foes) if (f.alive && f.x <= this.hx + sh.aoe) { this.strike(f, sh.mult); this.cut(f); this.sparks.setParticleTint(0xfff1c4).explode(5, f.x - 4, GROUND - 20); }
      }
      else {
        const f = sh.target && sh.target.alive ? sh.target : sh.target === undefined ? this.front() : null;
        if (f) {
          if (sh.fx) this.landFx(sh.fx, f);
          this.strike(f, sh.mult);
          if (sh.mult > 1.2) this.cut(f);
          // A running cut that leaves the foe standing: he stops and finishes it.
          if (this.running && f.alive) this.engaged = f;
        }
      }
    }
    if (sh.t >= sh.dur) this.shot = sh.then ?? null;
  }

  /** Use an ability now if it is ready and has something to strike; `manual` from the skill bar asks less. */
  cast(id: D.AbilityId, manual: boolean): boolean {
    const w = this.w, lv = D.skillLvl(w, id);
    if (lv <= 0 || (this.abilT[id] ?? 0) > 0 || this.cine || this.fallen > 0) return false;
    const m = D.abilityMult(id, lv), st = D.watchStats(w);
    const f = this.front(), alive = this.foes.filter((o) => o.alive);
    const near = alive.filter((o) => o.x <= this.hx + REACH + 44).length, inReach = !!f && f.x <= this.hx + REACH + (f.boss ? 22 : 8);
    switch (id) {
      case 'strike':
        if (!inReach) return false;
        this.shot = { clip: 'heavy', t: 0, dur: 0.5, hitAt: 0.55, hit: false, mult: m, target: f, fx: 'strike' }; sfx('swingHeavy', { vol: 0.5 });
        this.play('vfx-abilities-1', 24, 8, this.hx, GROUND - 22, { s: 0.5, fd: 0.045 });
        break;
      case 'pillar': if (!f) return false; this.castPillar(m); break;
      case 'phantom': {
        // Only the foes already on the wall: he never steps out of sight.
        const seen = alive.filter((o) => o.x < SW - 50);
        if (!seen.length || (!manual && seen.length < 2 && !f?.boss)) return false;
        this.startCine('PHANTOM STEP', seen.slice(0, 6), m, false); break;
      }
      case 'storm':
        if (!near || (!manual && near < 2 && !f?.boss)) return false;
        this.shot = { clip: 'storm', t: 0, dur: 0.6, hitAt: 0.5, hit: false, mult: m, aoe: REACH + 44, fx: 'storm' }; sfx('stormGust', { vol: 0.45 });
        // The wind gathers round him before the sweep.
        this.play('vfx-abilities-1', 8, 8, this.hx + 8, GROUND - 20, { sx: 1.2, sy: 0.5, fd: 0.06, spin: 240, tint: 0xd8f0ff });
        break;
      case 'comet':
        if (!inReach) return false;
        this.shot = { clip: 'launch', t: 0, dur: 0.32, hitAt: 0.5, hit: false, mult: m * 0.25, target: f, fx: 'launch', then: { clip: 'plunge', t: 0, dur: 0.4, hitAt: 0.6, hit: false, mult: m, target: f, fx: 'comet' } };
        sfx('whoosh', { vol: 0.5 });
        break;
      case 'balm': if (!manual && this.hp > st.maxHp * 0.55) return false; this.shot = { clip: 'heal', t: 0, dur: 0.5, hitAt: 0.5, hit: false, mult: 0, heal: m }; break;
      case 'judgment': if (!f || (!manual && !f.boss && alive.length < 3)) return false; this.startCine('LAST WATCH', [f], m, true); break;
    }
    this.abilT[id] = D.abilityCd(id, lv);
    tally(w, 'casts');
    if (!manual) this.ui.flashSkill(id);
    this.ui.callout(D.ABILITY[id].name.toUpperCase(), CALL_GLOW[id]);
    return true;
  }

  /** Stage a combo: Phantom Step cuts through every foe in turn; the Last Watch circles one with seven cuts and a
   * closing blow. The world slows and darkens and the view draws in, so each blow can be seen. */
  private startCine(name: string, targets: WFoe[], mult: number, flurry: boolean) {
    const steps: Cine['steps'] = [];
    if (flurry) {
      const t = targets[0];
      for (let i = 0; i < 7; i++) { const side = i % 2 ? -1 : 1; steps.push({ foe: t, x: t.x - side * (REACH - 6), face: side as 1 | -1, clip: ['b1', 'b2', 'b4', 'dash'][i % 4], mult }); }
      steps.push({ foe: t, x: t.x - REACH + 6, face: 1, clip: 'heavy', mult: mult * 3 });
    } else {
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      sorted.forEach((t, i) => steps.push({ foe: t, x: Math.min(SW - 28, t.x + REACH - 8), face: -1, clip: ['b1', 'b2', 'b4', 'dash'][i % 4], mult }));
      // The last cut is the heaviest, from behind the line.
      const last = sorted[sorted.length - 1];
      steps.push({ foe: last, x: Math.min(SW - 28, last.x + REACH - 8), face: -1, clip: 'heavy', mult: mult * 1.6 });
    }
    this.cine = { name, steps, i: -1, t: STEP, home: this.hx };
    this.shot = null;
    this.dim.setPosition(SW / 2, SH / 2);
    this.tweens.add({ targets: this.dim, alpha: 0.5, duration: 180 });
    this.cameras.main.zoomTo(this.baseZoom * 1.14, 220, 'Sine.easeOut');
    sfx('teleport', { vol: 0.5 });
  }

  private stepCine(dt: number) {
    const c = this.cine!;
    c.t += dt;
    if (c.t < STEP) return;
    c.t -= STEP;
    c.i++;
    this.ghost();
    const s = c.steps[c.i], phantom = c.name === 'PHANTOM STEP';
    if (phantom) this.play('vfx-abilities-2', 24, 8, this.hx, GROUND - 22, { s: 0.4, fd: 0.04 });
    if (!s) {
      // Back to his place, and the world resumes.
      this.hx = c.home; this.face = 1; this.cine = null; this.shot = null;
      this.tweens.add({ targets: this.dim, alpha: 0, duration: 260 });
      this.cameras.main.zoomTo(this.baseZoom, 260, 'Sine.easeInOut');
      this.cameras.main.pan(SW / 2, SH / 2, 260, 'Sine.easeInOut', true);
      sfx('finisher', { vol: 0.5 });
      return;
    }
    this.hx = s.x; this.face = s.face;
    if (phantom) { this.play('vfx-abilities-2', 24, 8, s.x, GROUND - 22, { s: 0.48, fd: 0.035, flip: true }); this.sparks.setParticleTint(0xc59bff).explode(6, s.x, GROUND - 24); }
    else if (s.foe.alive) this.play('vfx-impacts', 0, 6, s.foe.x - 4, GROUND - 22, { s: 0.36, fd: 0.04, tint: 0xfff1c4, angle: c.i * 47 });
    if (s.clip === 'heavy') this.closingFx(s.foe, phantom);
    // The drawn-in view follows him from mark to mark (kept inside the place).
    const half = SW / 2 / 1.14;
    this.cameras.main.pan(Phaser.Math.Clamp(s.x, half, SW - half), SH / 2, 140, 'Sine.easeOut', true);
    this.shot = { clip: s.clip, t: 0, dur: STEP * 0.95, hitAt: 0.42, hit: false, mult: s.mult, target: s.foe.alive ? s.foe : null };
    sfx(s.clip === 'heavy' ? 'execute' : 'slice', { vol: 0.45, pitch: 0.9 + c.i * 0.04 });
    if (s.clip === 'heavy') this.land('medium');
  }

  /** An afterimage where he stood. */
  private ghost() {
    const g = this.ghosts.find((o) => o.life <= 0) ?? this.ghosts[0];
    g.life = 0.4;
    g.img.setTexture(this.hero.texture.key, this.hero.frame.name).setPosition(this.hx, GROUND).setFlipX(this.hero.flipX).setAlpha(0.6).setVisible(true);
  }

  /** A slash's arc across a foe. */
  private cut(f: WFoe) {
    const c = this.cuts.find((o) => o.t < 0) ?? this.cuts[0];
    c.t = 0; c.base = (Math.floor(Math.random() * 4)) * 6;
    c.img.setFrame(c.base).setPosition(f.x - 2, GROUND - (f.boss ? 36 : 20)).setScale((f.boss ? 0.6 : 0.42) * (this.cine ? 1.35 : 1)).setFlipX(Math.random() < 0.5).setAngle((Math.random() - 0.5) * 40).setVisible(true).setTint(this.mantleT > 0 ? 0xc59bff : 0xffffff);
  }

  /** Play a row of an effects sheet once at (x, y), as light: scaled, tinted, spinning, growing or moving. */
  private play(key: string, base: number, n: number, x: number, y: number,
    o: { s?: number; sx?: number; sy?: number; tint?: number; fd?: number; angle?: number; spin?: number; grow?: number; alpha?: number; flip?: boolean; vx?: number; vy?: number; wait?: number } = {}) {
    const e = this.fxs.find((f) => f.t < 0) ?? this.fxs[0];
    e.t = 0; e.wait = o.wait ?? 0; e.base = base; e.n = n; e.fd = o.fd ?? 0.05; e.spin = o.spin ?? 0; e.grow = o.grow ?? 0;
    e.sx = o.sx ?? o.s ?? 0.5; e.sy = o.sy ?? o.s ?? 0.5; e.a0 = o.alpha ?? 1; e.vx = o.vx ?? 0; e.vy = o.vy ?? 0;
    e.img.setTexture(key, base).setPosition(x, y).setScale(e.sx, e.sy).setAngle(o.angle ?? 0).setFlipX(!!o.flip).setAlpha(e.a0).setVisible(e.wait <= 0);
    if (o.tint !== undefined) e.img.setTint(o.tint); else e.img.clearTint();
  }

  /** A flash of the wall, unless flashes are turned down in Settings. */
  private flash(ms: number, r: number, g: number, b: number) { if (!settings.reduceFlashes) this.cameras.main.flash(ms, r, g, b); }

  /** Where an ability's blow lands: its own light, sparks, a flash, the shake and a moment's pause. */
  private landFx(kind: NonNullable<Shot['fx']>, f: WFoe | null) {
    const x = f ? f.x - 4 : this.hx + 20, y = GROUND - (f?.boss ? 34 : 20);
    switch (kind) {
      case 'strike':
        this.play('vfx-impacts', 12, 6, x, y, { s: f?.boss ? 0.95 : 0.75, fd: 0.05 });
        this.play('vfx-impacts', 18, 6, x, GROUND - 1, { sx: 1.2, sy: 0.32, fd: 0.05, grow: 1.6, tint: 0xffe2a0 });
        this.sparks.setParticleTint(0xffd27a).explode(18, x, y);
        this.flash(90, 255, 225, 160); this.land('large');
        break;
      case 'launch':
        // Up it goes; the comet falls on it as it comes down.
        if (f) { f.liftT = LIFT; this.play('vfx-abilities-1', 0, 8, f.x, GROUND - 150, { s: 0.75, angle: 90, fd: 0.04, vy: 360, wait: 0.12, tint: 0xfff1c4 }); }
        this.play('vfx-slashes', 6, 6, x, y - 6, { s: 0.55, angle: -70, fd: 0.04 });
        break;
      case 'comet':
        this.play('vfx-impacts', 12, 6, x, GROUND - 10, { s: f?.boss ? 1.1 : 0.9, fd: 0.055 });
        this.play('vfx-impacts', 18, 6, x, GROUND - 1, { sx: 1.5, sy: 0.38, fd: 0.06, grow: 1.8 });
        this.play('vfx-impacts', 0, 6, x, GROUND - 20, { s: 0.8, fd: 0.05, tint: 0xfff1c4 });
        this.sparks.setParticleTint(0xfff1c4).explode(26, x, GROUND - 8);
        this.flash(140, 255, 245, 210); this.land('huge');
        break;
      case 'storm':
        // Three arcs round him as the sweep goes out.
        for (let i = 0; i < 3; i++) this.play('vfx-slashes', (i % 4) * 6, 6, this.hx + 16 + i * 12, GROUND - 20, { s: 0.6, angle: i * 120, fd: 0.04, spin: 360, tint: 0xd8f0ff });
        this.play('vfx-impacts', 18, 6, this.hx + 24, GROUND - 2, { sx: 1.6, sy: 0.3, fd: 0.05, grow: 1.2, tint: 0xd8f0ff });
        this.land('medium');
        break;
    }
  }

  /** The closing blow of a staged combo: a rift tearing open (Phantom Step) or the chains of light breaking (the Last Watch). */
  private closingFx(f: WFoe, phantom: boolean) {
    const x = Math.min(f.x - 4, SW - 50), y = GROUND - (f.boss ? 34 : 22);
    if (phantom) this.play('vfx-abilities-2', 24, 8, x, y, { s: 0.85, fd: 0.05 });
    else this.play('vfx-abilities-2', 0, 8, x, y, { s: 0.8, fd: 0.055 });
    this.play('vfx-impacts', 18, 6, x, y, { s: 0.9, fd: 0.05, grow: 1, tint: phantom ? 0xc59bff : 0xfff1c4 });
    this.sparks.setParticleTint(phantom ? 0xc59bff : 0xffd27a).explode(24, x, y);
    if (phantom) this.flash(150, 150, 90, 230); else this.flash(150, 255, 235, 180);
    this.stopT = 0.12;
  }

  /** Buy an ability, or its next level; a newly bought one goes into a free slot. */
  buySkill(id: D.AbilityId) {
    const w = this.w, lv = D.skillLvl(w, id), cost = D.abilityCost(id, lv);
    if (w.level < D.ABILITY[id].level || lv >= D.ABILITY_MAX || w.coins < cost) return false;
    w.coins -= cost;
    (w.skills ??= {})[id] = lv + 1;
    const lo = (w.loadout ??= []);
    if (lv === 0 && !lo.includes(id) && lo.length < D.slotsAt(w.level)) lo.push(id);
    this.persist();
    return true;
  }

  /** Take an ability into the fight, or leave it out. */
  toggleSkill(id: D.AbilityId) {
    const w = this.w, lo = (w.loadout ??= []);
    if (lo.includes(id)) lo.splice(lo.indexOf(id), 1);
    else if (D.skillLvl(w, id) > 0) {
      if (lo.length >= D.slotsAt(w.level)) { this.ui.toast(`All ${D.slotsAt(w.level)} slots are taken: leave one out first`); return; }
      lo.push(id);
    }
    this.persist();
  }

  // ---------------------------------------------------------------- shadows (the Shadows tab)

  /** Essence of a shadow, with a mark where it fell. */
  gainEssence(id: ShadowId, n: number, x = this.hx + 40) {
    const w = this.w;
    (w.essence ??= {})[id] = (w.essence[id] ?? 0) + n;
    const t = this.nums.find((o) => o.life <= 0);
    if (t) { t.life = 1.1; t.vy = -18; t.t.setText(`+${n} essence`).setPosition(x, GROUND - 52).setColor('#c9a8ff').setScale(0.34).setVisible(true).setAlpha(1); }
    this.burst(x, GROUND - 30, 0, 0.4, 0xb48cff);
    // Enough to raise one he has not: say so once.
    const now = w.essence[id] ?? 0;
    if (!owned(w, id) && now >= UNLOCK_COST[id] && now - n < UNLOCK_COST[id]) this.ui.toast(`Enough essence to raise ${shadowName(id, 1)} · Shadows`, 3);
  }

  /** Raise a shadow with its essence, or take it a level further. */
  raiseShadow(id: ShadowId) {
    const w = this.w, have = w.essence?.[id] ?? 0, cur = w.shadows?.[id]?.lv ?? 0;
    const cost = cur ? levelCost(cur) : UNLOCK_COST[id];
    if (cur >= SHADOW_MAX || have < cost) return false;
    (w.essence ??= {})[id] = have - cost;
    (w.shadows ??= {})[id] = { ...(w.shadows[id] ?? {}), lv: cur + 1 };
    // A new shadow takes a free slot.
    const team = (w.team ??= []);
    if (!cur && team.length < D.shadowsAt(w.level)) team.push(id);
    this.band.rebuild(w);
    this.persist();
    return true;
  }

  /** Set a raised shadow beside him, or stand it down. */
  toggleTeam(id: ShadowId) {
    const w = this.w, team = (w.team ??= []);
    if (team.includes(id)) team.splice(team.indexOf(id), 1);
    else if (owned(w, id)) {
      const slots = D.shadowsAt(w.level);
      if (team.length >= slots) { this.ui.toast(slots ? `All ${slots} shadow slots are taken: stand one down first` : `The first shadow slot opens at Watch level ${D.SHADOW_LEVELS[0]}`); return; }
      team.push(id);
    }
    this.band.rebuild(w);
    this.persist();
  }

  /** Give a shadow another of the main game's roles. */
  setShadowRole(id: ShadowId, role: EchoRole) {
    const s = this.w.shadows?.[id];
    if (!s) return;
    s.role = role;
    this.band.rebuild(this.w);
    this.persist();
  }

  /** ×1, ×2, or ×3 once he reaches its level. */
  setSpeed(x: 1 | 2 | 3) {
    if (this.w.level < D.SPEEDS[x]) { this.ui.toast(`×${x} opens at Watch level ${D.SPEEDS[x]}`); return; }
    this.w.speed = x;
    this.persist();
  }

  buy(id: D.TrackId, amount: 1 | 10 | 0) {
    const w = this.w, t = D.TRACK[id], lv = D.lvlOf(w, id);
    if (!D.isOpen(w, t) || (t.max !== undefined && lv >= t.max)) return false;
    let n = amount === 0 ? D.affordable(id, lv, w.coins) : amount;
    if (t.max !== undefined) n = Math.min(n, t.max - lv);
    if (n <= 0) return false;
    const price = D.costN(id, lv, n);
    if (price > w.coins) return false;
    w.coins -= price;
    w.up[id] = lv + n;
    tally(w, 'buys', n);
    if (id === 'health') this.hp = Math.min(D.watchStats(w).maxHp, this.hp + 20 * n);
    return true;
  }

  ascend() {
    const w = this.w, seals = D.sealsFor(w.best);
    if (seals <= 0) return;
    w.seals += seals; w.ascensions++;
    w.stage = 1; w.best = 1; w.coins = 0; w.up = {}; w.auto = true;
    this.hp = D.watchStats(w).maxHp; this.mantleT = 0; this.fallen = 0;
    this.gate = 0;
    this.startStage(1);
    this.cameras.main.flash(260, 255, 230, 170);
    sfx('levelup'); this.ui.toast(`Ascended · ${w.seals} Seals strengthen every blow and coin`, 3.2);
    this.persist();
  }

  leave() {
    this.persist();
    this.scene.start(this.from === 'world' ? 'world' : 'title', this.from === 'world' ? { fresh: false } : undefined);
  }

  persist() {
    this.w.last = Date.now();
    writeSave(this.save);
  }

  // ---------------------------------------------------------------- drawing

  private drawHero(dt: number) {
    this.loopT += dt;
    const key = this.mantleT > 0 ? this.keys.mantle : this.keys.base;
    let clip = 'idle', u = (this.loopT % 1.6) / 1.6;
    // Running on a rush, walking on between stages, or stepping up to meet a foe: the run cycle.
    const stepping = !this.cine && Math.abs(this.hero.x - this.hx) > 0.05;
    if (this.fallen > 0) { clip = 'hurt'; u = 0.6; }
    else if (this.shot) { clip = this.shot.clip; u = this.shot.t / this.shot.dur; }
    else if (this.running || this.walkT > 0 || stepping) { clip = 'run'; u = (this.loopT * 1.7) % 1; }
    this.hero.setTexture(key, actionFrame(this, key, clip, u)).setAlpha(this.fallen > 0 ? 0.5 : 1).setPosition(this.hx, GROUND).setFlipX(this.face < 0);
    this.aura.setAlpha(this.mantleT > 0 ? 0.35 + Math.sin(this.loopT * 6) * 0.1 : 0).setX(this.hx);
    // His health over his head, and a boss's along the top of the wall.
    const st = D.watchStats(this.w), g = this.hpBar.clear();
    g.fillStyle(0x000000, 0.6).fillRect(this.hx - 16, GROUND - 58, 32, 3);
    g.fillStyle(0x6ad16a, 1).fillRect(this.hx - 16, GROUND - 58, 32 * Math.max(0, this.hp / st.maxHp), 3);
    if (this.w.level >= D.MANTLE.level) { g.fillStyle(0x000000, 0.6).fillRect(this.hx - 16, GROUND - 54, 32, 2); g.fillStyle(0xb48cff, 1).fillRect(this.hx - 16, GROUND - 54, 32 * (this.mantleT > 0 ? this.mantleT / D.MANTLE.time : this.w.gauge / 100), 2); }
    for (const f of this.foes) {
      if (!f.alive) continue;
      if (f.boss) { g.fillStyle(0x000000, 0.6).fillRect(60, 12, SW - 120, 5); g.fillStyle(0xff5a3a, 1).fillRect(60, 12, (SW - 120) * Math.max(0, f.hp / f.max), 5); }
      else if (f.hp < f.max) { g.fillStyle(0x000000, 0.6).fillRect(f.x - 10, GROUND - 40, 20, 2); g.fillStyle(0xff6a5a, 1).fillRect(f.x - 10, GROUND - 40, 20 * Math.max(0, f.hp / f.max), 2); }
    }
  }

  private drawFoe(f: WFoe, dt: number) {
    if (!f.alive && f.dying <= 0) return;
    if (f.dying > 0) {
      f.dying -= dt;
      f.img.setAlpha(Math.max(0, f.dying / 0.35)).setTint(0xfff1c4).setPosition(f.x + (0.35 - f.dying) * 30, GROUND);
      if (f.dying <= 0) f.img.setVisible(false);
      return;
    }
    f.strikeT = Math.max(0, f.strikeT - dt); f.flash = Math.max(0, f.flash - dt);
    const b = f.boss ? WATCH_BOSSES[f.boss] : null;
    if (b?.kind === 'crown') {
      const [tex, n] = BOSS_TEX[b.id];
      f.img.setTexture(tex, `${b.id}-${f.strikeT > 0 ? Math.min(n - 1, 3) : Math.floor(f.animT * 4) % 2}`);
    } else if (b?.kind === 'demon') f.img.setFrame(f.strikeT > 0 ? 6 + Math.min(7, Math.floor((0.25 - f.strikeT) * 32)) : Math.floor(f.animT * 8) % 6);
    else f.img.setFrame(f.kind.row * 4 + (f.strikeT > 0 ? 3 : f.x > this.hx + REACH + 2 ? 1 + (Math.floor(f.animT * 6) % 2) : 0));
    // Thrown up by the Comet, it hangs and then comes down with the blow.
    f.liftT = Math.max(0, f.liftT - dt);
    f.img.setPosition(Math.round(f.x), GROUND - Math.round(Math.sin(Math.min(1, f.liftT / LIFT) * Math.PI) * 26)).setFlipX(true);
    if (f.flash > 0) f.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else f.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  private number(x: number, y: number, v: number, big: boolean, color?: string, prefix = '', huge = false) {
    const n = this.nums.find((o) => o.life <= 0);
    if (!n) return;
    n.life = huge ? 0.9 : 0.7; n.vy = huge ? -26 : -34;
    // Kept inside the wall, and lifted over any number still fresh where it would land.
    x = Phaser.Math.Clamp(x + (Math.random() - 0.5) * 10, 22, SW - 22);
    for (const o of this.nums) if (o !== n && o.life > 0.35 && Math.abs(o.t.x - x) < 26 && Math.abs(o.t.y - y) < 9) y = o.t.y - 9;
    n.t.setText(prefix + D.fmt(v)).setPosition(x, Math.max(12, y)).setColor(color ?? (huge ? '#ffb347' : big ? '#ffd27a' : '#ffffff')).setScale(huge ? 0.72 : big ? 0.55 : 0.4).setVisible(true).setAlpha(1);
  }
  private coinText(x: number, y: number, v: number) {
    const n = this.nums.find((o) => o.life <= 0);
    if (!n) return;
    n.life = 0.9; n.vy = -22;
    n.t.setText('+' + D.fmt(v)).setPosition(Phaser.Math.Clamp(x, 22, SW - 22), y).setColor('#f6dea0').setScale(0.36).setVisible(true).setAlpha(1);
  }
  private burst(x: number, y: number, base: number, scale: number, tint: number) {
    if (settings.reduceFlashes && base === 0) return;
    const b = this.bursts.find((o) => o.t < 0) ?? this.bursts[0];
    b.t = 0; b.base = base;
    b.img.setFrame(base).setPosition(x, y).setScale(scale).setAngle(Math.random() * 360).setTint(tint).setVisible(true);
  }
  private stepFx(dt: number) {
    for (const e of this.fxs) {
      if (e.t < 0) continue;
      if (e.wait > 0) { e.wait -= dt; if (e.wait <= 0) e.img.setVisible(true); continue; }
      e.t += dt;
      const fr = Math.floor(e.t / e.fd);
      if (fr >= e.n) { e.t = -1; e.img.setVisible(false); continue; }
      const k = 1 + e.grow * e.t, left = e.n - e.t / e.fd;
      e.img.setFrame(e.base + fr).setScale(e.sx * k, e.sy * k).setAlpha(e.a0 * Math.min(1, left / (e.n * 0.35)));
      if (e.spin) e.img.angle += e.spin * dt;
      if (e.vx || e.vy) e.img.setPosition(e.img.x + e.vx * dt, e.img.y + e.vy * dt);
    }
    for (const n of this.nums) { if (n.life <= 0) continue; n.life -= dt; n.t.y += n.vy * dt; n.vy *= 0.92; n.t.setAlpha(Math.min(1, n.life * 3)); if (n.life <= 0) n.t.setVisible(false); }
    for (const b of this.bursts) { if (b.t < 0) continue; b.t += dt; const f = Math.floor(b.t / 0.045); if (f >= b.n) { b.t = -1; b.img.setVisible(false); } else b.img.setFrame(b.base + f); }
    if (this.pillarT >= 0) { this.pillarT += dt; const f = Math.floor(this.pillarT / 0.08); if (f >= 8) { this.pillarT = -1; this.pillar.setVisible(false); } else this.pillar.setFrame(40 + f); }
    for (const g of this.ghosts) { if (g.life <= 0) continue; g.life -= dt; g.img.setAlpha(Math.max(0, g.life * 1.5)); if (g.life <= 0) g.img.setVisible(false); }
    for (const c of this.cuts) { if (c.t < 0) continue; c.t += dt; const f = Math.floor(c.t / 0.04); if (f >= 6) { c.t = -1; c.img.setVisible(false); } else c.img.setFrame(c.base + f); }
  }
  /** A blow of this weight (game/feel.ts TIERS): the shake, the pause on the blow, the vibration. */
  private land(tier: Tier) { impact(this.cameras.main, tier, (s) => { this.stopT = Math.max(this.stopT, s); }); }
}
