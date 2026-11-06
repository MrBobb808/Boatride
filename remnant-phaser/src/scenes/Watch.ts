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
import { shakeScale, settings } from '../classic/shim/settings';
import { sfx } from '../../../remnant/src/audio/audio';
import { haptic } from '../../../remnant/src/core/haptics';
import { safe, measureSafe } from '../../../remnant/src/ui/safe';
import * as D from '../game/watch/defs';
import { WatchUI } from '../game/watch/ui';
import { ShadowBand, ESSENCE_OF, BOSS_ESSENCE, UNLOCK_COST, SHADOW_MAX, levelCost, owned, shadowName, type ShadowId } from '../game/watch/shadows';
import type { EchoRole } from '../../../remnant/src/game/data';

/** The wall's world: 300 × 176 units (narrow, so the fighters read large on a phone), the ground at 146; Elior stands
 * at 82 and reaches 30 ahead. */
const SW = 300, SH = 176, GROUND = 146, HOME = 82, REACH = 30;
/** On a rush he runs this fast (world units a second) and stands this far up the road. */
const RUN = 74, RUSH_X = 108;
/** A staged combo's step, in seconds; the world runs at CINE_SLOW of its pace while one plays. */
const STEP = 0.42, CINE_SLOW = 0.25;
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
}
/** One swing: its clip and timing, what it hits (a foe, every foe within `aoe` ahead, or the one before him), and
 * what follows it (the Comet's fall). */
interface Shot { clip: string; t: number; dur: number; hitAt: number; hit: boolean; mult: number; target?: WFoe | null; aoe?: number; then?: Shot; heal?: number }
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
    this.bg = this.add.graphics().setDepth(-10);
    this.arm();
    this.hx = HOME; this.cine = null; this.engaged = null; this.running = false; this.abilT = {};
    this.hero = this.add.sprite(HOME, GROUND, this.keys.base, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.78).setDepth(5);
    this.aura = this.add.image(HOME, GROUND - 22, 'glow').setTint(0xb48cff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0).setDepth(4);
    this.hpBar = this.add.graphics().setDepth(8);
    this.foes = [];
    for (let i = 0; i < 6; i++) this.foes.push({ img: this.add.image(0, GROUND, 'foes-ashen', 0).setVisible(false).setDepth(4), kind: FOES.husk, id: 'husk', x: 0, hp: 0, max: 1, dmg: 0, speed: 0, alive: false, dying: 0, atkT: 0, animT: 0, flash: 0, strikeT: 0, boss: null, elite: false, chill: 0 });
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
    for (let i = 0; i < 20; i++) this.nums.push({ t: this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#ffffff', stroke: '#07060a', strokeThickness: 4 }).setOrigin(0.5).setScale(0.4).setDepth(20).setVisible(false), life: 0, vy: 0 });
    this.bursts = [];
    for (let i = 0; i < 8; i++) this.bursts.push({ img: this.add.image(0, 0, 'vfx-impacts', 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9), t: -1, base: 0, n: 6, dur: 0.27 });
    // Afterimages left where he stepped from, and the cuts on the foes.
    this.ghosts = [];
    for (let i = 0; i < 10; i++) this.ghosts.push({ img: this.add.image(0, GROUND, this.keys.base, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.78).setTint(0xb48cff).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(4.5), life: 0 });
    this.cuts = [];
    for (let i = 0; i < 6; i++) this.cuts.push({ img: this.add.image(0, 0, 'vfx-slashes', 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9), t: -1, base: 0 });
    this.dim = this.add.rectangle(SW / 2, SH / 2, SW * 2, SH * 2, 0x05040a, 1).setAlpha(0).setDepth(3.5);
    this.pillar = this.add.image(0, GROUND, 'vfx-abilities-1', 40).setOrigin(0.5, 0.82).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9);
    this.ui = new WatchUI(this);
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
    // Away: the wall paid half its recent rate while the player was gone (eight hours at most).
    const away = D.offlinePay(this.w);
    this.w.last = Date.now();
    if (away.secs >= 60 && away.coins > 0) this.ui.welcome(away.secs, away.coins, () => { this.w.coins += away.coins; this.ui.refresh(); this.persist(); });
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __remnant: Record<string, unknown> }).__remnant = { ...((window as unknown as { __remnant?: Record<string, unknown> }).__remnant ?? {}), game: this.game, watch: this };
  }

  /** The wall fills the top of an upright phone (the panel below); sideways, the left half. */
  private fit() {
    measureSafe();
    const W = this.scale.width, H = this.scale.height, landscape = W > H * 1.1;
    const top = Math.max(safe.top, 6);
    const vw = landscape ? Math.round(W * 0.52) : W, vh = Math.round((vw * SH) / SW);
    const cssScale = W / window.innerWidth;
    // Upright, the bar of coins, the stage and his numbers sits just above the wall (about 84 CSS px).
    const y = landscape ? Math.max(0, Math.round((H - vh) / 2)) : Math.round((top + 84) * cssScale);
    this.baseZoom = vw / SW;
    this.cameras.main.setViewport(0, y, vw, vh).setZoom(this.baseZoom * (this.cine ? 1.14 : 1)).centerOn(SW / 2, SH / 2);
    this.ui.layout(landscape ? y / cssScale : top, (y + vh) / cssScale, landscape, vw / cssScale);
  }

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
    f.alive = true; f.dying = 0; f.atkT = D.FOE_RATE * 0.6; f.animT = Math.random(); f.flash = 0; f.strikeT = 0; f.chill = 0;
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
    const dt = Math.min(delta / 1000, 0.05), n = this.cine ? 1 : this.w.speed ?? 1;
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
    this.damage(f, dmg, crit || mult > 1, false);
    sfx(mult > 1 || crit ? 'hitHeavy' : 'hit', { vol: 0.5, pitch: 0.95 + Math.random() * 0.1 });
    if (mult > 1) { this.shakeIt(0.006, 120); haptic('heavy'); }
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

  private damage(f: WFoe, dmg: number, big: boolean, shadow: boolean) {
    if (!f.alive) return;
    f.hp -= dmg; f.flash = 0.08;
    this.number(f.x - 4, GROUND - (f.boss ? 70 : 40), dmg, big);
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
    if (f.boss) { this.gainEssence(BOSS_ESSENCE[f.boss] ?? 'knight', 3, f.x); this.gainEssence('marshal', 1, f.x); this.bossDown(); return; }
    this.kills++;
    if (this.kills >= D.KILLS_PER_STAGE) {
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
    this.shakeIt(0.012, 260); haptic('heavy');
    sfx('bossSlam', { vol: 0.5 }); sfx('lootRare', { vol: 0.6 });
    // The main game's share, once a gate: silver, and two capes.
    if (!w.paid.includes(gate)) {
      w.paid.push(gate);
      const silver = D.silverFor(gate);
      this.save.silver += silver;
      const cape = D.CAPE_AT[gate];
      if (cape) { const st = (this.save.store ??= {}); (st.capes ??= []).includes(cape) || st.capes.push(cape); }
      const blade = D.BLADES[gate - 1];
      this.ui.toast(`Gate ${gate} holds · +${silver} silver for the journey${cape ? ' · and a cape' : ''}${blade ? ` · a new blade: ${blade.name} (Hero → armoury)` : ''}`, 3.6);
    } else this.ui.toast(`Gate ${gate} holds`);
    this.bossName = null;
    this.next();
  }

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
    sfx('transform', { vol: 0.6 }); this.shakeIt(0.008, 200);
    this.cameras.main.flash(180, 120, 70, 200);
    this.ui.toast('THE SHADOW MANTLE · heavier, faster blows');
  }

  private castPillar(mult: number) {
    let far: WFoe | null = null;
    for (const f of this.foes) if (f.alive && (!far || f.x > far.x)) far = f;
    if (!far) return;
    this.pillar.setPosition(far.x, GROUND + 4).setScale(0.55).setVisible(true).setFrame(40);
    this.pillarT = 0;
    const st = D.watchStats(this.w), x = far.x;
    // The fire takes the furthest foe, and any standing within a stride of it.
    for (const f of this.foes) if (f.alive && Math.abs(f.x - x) <= 26) this.damage(f, st.atk * mult * (f === far ? 1 : 0.5) * (this.mantleT > 0 ? D.MANTLE.dmg : 1), true, false);
    sfx('pillarFire', { vol: 0.5 });
  }

  // ---------------------------------------------------------------- swings, abilities and the staged combos

  /** A swing plays out; at its moment it lands on its foe, on every foe in its reach, or on the one before him. */
  private stepShot(dt: number) {
    const sh = this.shot!;
    sh.t += dt;
    if (!sh.hit && sh.t >= sh.dur * sh.hitAt) {
      sh.hit = true;
      if (sh.heal) { const st = D.watchStats(this.w); this.hp = Math.min(st.maxHp, this.hp + st.maxHp * sh.heal); this.balmT = 6; this.burst(this.hx, GROUND - 26, 0, 0.6, 0x9effc0); sfx('heal', { vol: 0.5 }); }
      else if (sh.aoe) { for (const f of this.foes) if (f.alive && f.x <= this.hx + sh.aoe) { this.strike(f, sh.mult); this.cut(f); } }
      else {
        const f = sh.target && sh.target.alive ? sh.target : sh.target === undefined ? this.front() : null;
        if (f) {
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
      case 'strike': if (!inReach) return false; this.shot = { clip: 'heavy', t: 0, dur: 0.5, hitAt: 0.55, hit: false, mult: m, target: f }; sfx('swingHeavy', { vol: 0.5 }); break;
      case 'pillar': if (!f) return false; this.castPillar(m); break;
      case 'phantom': if (!alive.length || (!manual && alive.length < 2 && !f?.boss)) return false; this.startCine('PHANTOM STEP', alive.slice(0, 6), m, false); break;
      case 'storm': if (!near || (!manual && near < 2 && !f?.boss)) return false; this.shot = { clip: 'storm', t: 0, dur: 0.6, hitAt: 0.5, hit: false, mult: m, aoe: REACH + 44 }; sfx('stormGust', { vol: 0.45 }); break;
      case 'comet':
        if (!inReach) return false;
        this.shot = { clip: 'launch', t: 0, dur: 0.32, hitAt: 0.5, hit: false, mult: m * 0.25, target: f, then: { clip: 'plunge', t: 0, dur: 0.4, hitAt: 0.6, hit: false, mult: m, target: f } };
        sfx('whoosh', { vol: 0.5 });
        break;
      case 'balm': if (!manual && this.hp > st.maxHp * 0.55) return false; this.shot = { clip: 'heal', t: 0, dur: 0.5, hitAt: 0.5, hit: false, mult: 0, heal: m }; break;
      case 'judgment': if (!f || (!manual && !f.boss && alive.length < 3)) return false; this.startCine('LAST WATCH', [f], m, true); break;
    }
    this.abilT[id] = D.abilityCd(id, lv);
    if (!manual) this.ui.flashSkill(id);
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
      sorted.forEach((t, i) => steps.push({ foe: t, x: Math.min(SW - 20, t.x + REACH - 8), face: -1, clip: ['b1', 'b2', 'b4', 'dash'][i % 4], mult }));
      // The last cut is the heaviest, from behind the line.
      const last = sorted[sorted.length - 1];
      steps.push({ foe: last, x: Math.min(SW - 20, last.x + REACH - 8), face: -1, clip: 'heavy', mult: mult * 1.6 });
    }
    this.cine = { name, steps, i: -1, t: STEP, home: this.hx };
    this.shot = null;
    this.dim.setPosition(SW / 2, SH / 2);
    this.tweens.add({ targets: this.dim, alpha: 0.5, duration: 180 });
    this.cameras.main.zoomTo(this.baseZoom * 1.14, 220, 'Sine.easeOut');
    this.ui.toast(name, 1.2);
    sfx('teleport', { vol: 0.5 });
  }

  private stepCine(dt: number) {
    const c = this.cine!;
    c.t += dt;
    if (c.t < STEP) return;
    c.t -= STEP;
    c.i++;
    this.ghost();
    const s = c.steps[c.i];
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
    // The drawn-in view follows him from mark to mark (kept inside the place).
    const half = SW / 2 / 1.14;
    this.cameras.main.pan(Phaser.Math.Clamp(s.x, half, SW - half), SH / 2, 140, 'Sine.easeOut', true);
    this.shot = { clip: s.clip, t: 0, dur: STEP * 0.95, hitAt: 0.42, hit: false, mult: s.mult, target: s.foe.alive ? s.foe : null };
    sfx(s.clip === 'heavy' ? 'execute' : 'slice', { vol: 0.45, pitch: 0.9 + c.i * 0.04 });
    if (s.clip === 'heavy') { this.shakeIt(0.01, 200); haptic('heavy'); }
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
    c.img.setFrame(c.base).setPosition(f.x - 2, GROUND - (f.boss ? 36 : 20)).setScale(f.boss ? 0.6 : 0.42).setFlipX(Math.random() < 0.5).setAngle((Math.random() - 0.5) * 40).setVisible(true).setTint(this.mantleT > 0 ? 0xc59bff : 0xffffff);
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
    f.img.setPosition(Math.round(f.x), GROUND).setFlipX(true);
    if (f.flash > 0) f.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else f.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  private number(x: number, y: number, v: number, big: boolean) {
    const n = this.nums.find((o) => o.life <= 0);
    if (!n) return;
    n.life = 0.7; n.vy = -34;
    n.t.setText(D.fmt(v)).setPosition(x + (Math.random() - 0.5) * 10, y).setColor(big ? '#ffd27a' : '#ffffff').setScale(big ? 0.55 : 0.4).setVisible(true).setAlpha(1);
  }
  private coinText(x: number, y: number, v: number) {
    const n = this.nums.find((o) => o.life <= 0);
    if (!n) return;
    n.life = 0.9; n.vy = -22;
    n.t.setText('+' + D.fmt(v)).setPosition(x, y).setColor('#f6dea0').setScale(0.36).setVisible(true).setAlpha(1);
  }
  private burst(x: number, y: number, base: number, scale: number, tint: number) {
    if (settings.reduceFlashes && base === 0) return;
    const b = this.bursts.find((o) => o.t < 0) ?? this.bursts[0];
    b.t = 0; b.base = base;
    b.img.setFrame(base).setPosition(x, y).setScale(scale).setAngle(Math.random() * 360).setTint(tint).setVisible(true);
  }
  private stepFx(dt: number) {
    for (const n of this.nums) { if (n.life <= 0) continue; n.life -= dt; n.t.y += n.vy * dt; n.vy *= 0.92; n.t.setAlpha(Math.min(1, n.life * 3)); if (n.life <= 0) n.t.setVisible(false); }
    for (const b of this.bursts) { if (b.t < 0) continue; b.t += dt; const f = Math.floor(b.t / 0.045); if (f >= b.n) { b.t = -1; b.img.setVisible(false); } else b.img.setFrame(b.base + f); }
    if (this.pillarT >= 0) { this.pillarT += dt; const f = Math.floor(this.pillarT / 0.08); if (f >= 8) { this.pillarT = -1; this.pillar.setVisible(false); } else this.pillar.setFrame(40 + f); }
    for (const g of this.ghosts) { if (g.life <= 0) continue; g.life -= dt; g.img.setAlpha(Math.max(0, g.life * 1.5)); if (g.life <= 0) g.img.setVisible(false); }
    for (const c of this.cuts) { if (c.t < 0) continue; c.t += dt; const f = Math.floor(c.t / 0.04); if (f >= 6) { c.t = -1; c.img.setVisible(false); } else c.img.setFrame(c.base + f); }
  }
  private shakeIt(i: number, ms: number) { const k = shakeScale(); if (k > 0) this.cameras.main.shake(ms, i * k); }
}
