// The Watch (POLISH_PLAN §18): the idle game inside the game. Elior keeps the broken gate of a ruined city; foes walk
// in from the right and he strikes on his own; every kill pays coins, and coins buy his upgrades below. Ten foes to a
// stage, a gate's boss every tenth stage on a timer; levels open his skills, his shadows and the Shadow Mantle; the
// Ascension trades a run for Seals. Away, the wall keeps paying (half rate, eight hours at most). Its numbers are in
// game/watch/defs.ts, its panel in game/watch/ui.ts; its progress is the save's optional `watch`.
import Phaser from 'phaser';
import { loadSave, newSave, writeSave, type PhaserSave } from '../game/save';
import { actionAtlas, actionFrame, ACTION_FOOT, ACTION_CELL } from '../game/actionArt';
import { FOES, BIOMES, BOSS_NAMES, type BossId, type FoeKind } from '../game/horde/defs';
import { bossScale } from '../game/bosses';
import { music } from '../classic/shim/music';
import { shakeScale, settings } from '../classic/shim/settings';
import { sfx } from '../../../remnant/src/audio/audio';
import { haptic } from '../../../remnant/src/core/haptics';
import { safe, measureSafe } from '../../../remnant/src/ui/safe';
import * as D from '../game/watch/defs';
import { WatchUI } from '../game/watch/ui';

/** The wall's world: 300 × 176 units (narrow, so the fighters read large on a phone), the ground at 146; Elior stands
 * at 82 and reaches 30 ahead. */
const SW = 300, SH = 176, GROUND = 146, HERO_X = 82, REACH = 30;
/** The bosses' atlases (game/bosses.ts cuts their frames) and how many frames each has. */
const BOSS_TEX: Record<BossId, [string, number]> = { beast_monarch: ['varkhos', 8], plague_monarch: ['morvane', 8], cinder_monarch: ['azkar', 4] };
/** The kinds a shadow takes, one per slot, in the order they join. */
const SHADOW_KINDS = ['husk', 'hound', 'sentinel', 'soldier', 'knight', 'lion'];

interface WFoe {
  img: Phaser.GameObjects.Image; kind: FoeKind; id: string;
  x: number; hp: number; max: number; dmg: number; speed: number;
  alive: boolean; dying: number; atkT: number; animT: number; flash: number; strikeT: number;
  boss: BossId | null;
}
interface Shadow { img: Phaser.GameObjects.Image; kind: FoeKind; cd: number; strikeT: number }

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
  private fallen = 0;
  private swingCd = 0;
  private shot: { clip: string; t: number; dur: number; hitAt: number; hit: boolean; mult: number } | null = null;
  private loopT = 0;
  private flip = false;
  private foes: WFoe[] = [];
  private shadows: Shadow[] = [];
  private skillT = { strike: 4, pillar: 6 };
  private tapCd = 0;
  private nums: { t: Phaser.GameObjects.Text; life: number; vy: number }[] = [];
  private bursts: { img: Phaser.GameObjects.Image; t: number; base: number; n: number; dur: number }[] = [];
  private pillar!: Phaser.GameObjects.Image;
  private pillarT = -1;
  private aura!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.Graphics;
  private hpBar!: Phaser.GameObjects.Graphics;
  private gate = 0;
  private earned = 0;
  private rateT = 0;
  private saveT = 0;
  private uiT = 0;
  private bossName: [string, string] | null = null;

  constructor() { super('watch'); }

  init(data: { from?: 'title' | 'world' }) { this.from = data?.from ?? 'title'; }

  create() {
    this.save = (loadSave() as PhaserSave | null) ?? (newSave(false) as PhaserSave);
    this.w = this.save.watch ??= D.newWatch();
    this.cameras.main.setBackgroundColor('#07060a');
    this.bg = this.add.graphics().setDepth(-10);
    this.keys.base = actionAtlas(this, 'elior', 'blade');
    this.keys.mantle = actionAtlas(this, 'elior', 'blade', true);
    this.hero = this.add.sprite(HERO_X, GROUND, this.keys.base, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.78).setDepth(5);
    this.aura = this.add.image(HERO_X, GROUND - 22, 'glow').setTint(0xb48cff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0).setDepth(4);
    this.hpBar = this.add.graphics().setDepth(8);
    this.foes = [];
    for (let i = 0; i < 6; i++) this.foes.push({ img: this.add.image(0, GROUND, 'foes-ashen', 0).setVisible(false).setDepth(4), kind: FOES.husk, id: 'husk', x: 0, hp: 0, max: 1, dmg: 0, speed: 0, alive: false, dying: 0, atkT: 0, animT: 0, flash: 0, strikeT: 0, boss: null });
    this.shadows = [];
    for (let i = 0; i < D.SHADOW_LEVELS.length; i++) {
      const k = FOES[SHADOW_KINDS[i]];
      this.shadows.push({ img: this.add.image(HERO_X - 26 - i * 17, GROUND, k.sheet, k.row * 4).setOrigin(k.ox / 96, k.oy / 96).setScale(k.scale * 0.92).setTint(0x7a5aa8).setAlpha(0.88).setVisible(false).setDepth(3 - i * 0.01), kind: k, cd: 0.6 + i * 0.25, strikeT: 0 });
    }
    this.nums = [];
    for (let i = 0; i < 20; i++) this.nums.push({ t: this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#ffffff', stroke: '#07060a', strokeThickness: 4 }).setOrigin(0.5).setScale(0.4).setDepth(20).setVisible(false), life: 0, vy: 0 });
    this.bursts = [];
    for (let i = 0; i < 8; i++) this.bursts.push({ img: this.add.image(0, 0, 'vfx-impacts', 0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(9), t: -1, base: 0, n: 6, dur: 0.27 });
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
    music.play(BIOMES[(D.gateOf(this.w.stage) - 1) % BIOMES.length].music);
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
    // Upright, the bar of coins and the stage sits just above the wall (about 64 CSS px).
    const y = landscape ? Math.max(0, Math.round((H - vh) / 2)) : Math.round((top + 64) * cssScale);
    this.cameras.main.setViewport(0, y, vw, vh).setZoom(vw / SW).centerOn(SW / 2, SH / 2);
    this.ui.layout(landscape ? y / cssScale : top, (y + vh) / cssScale, landscape, vw / cssScale);
  }

  // ---------------------------------------------------------------- stages

  private startStage(n: number) {
    this.w.stage = n;
    this.kills = 0;
    for (const f of this.foes) { f.alive = false; f.dying = 0; f.img.setVisible(false); }
    const gate = D.gateOf(n);
    if (gate !== this.gate) { this.gate = gate; this.drawWall(); }
    this.bossName = null;
    if (D.isBoss(n)) {
      const biome = BIOMES[(gate - 1) % BIOMES.length], id = biome.boss as BossId;
      this.bossName = BOSS_NAMES[id];
      this.bossTimeLeft = D.BOSS_TIME;
      this.spawn(SW + 30, id);
      this.ui.toast(`${this.bossName[0]} · ${this.bossName[1]} holds Gate ${gate}`);
      sfx('horn', { vol: 0.5 });
    }
  }

  /** A gate's place: the sky, the broken wall behind, the road, in the colours of one of the Horde's lands. */
  private drawWall() {
    const b = BIOMES[(this.gate - 1) % BIOMES.length], c = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;
    const g = this.bg.clear();
    // A night sky in bands, deepening upward, with the moon over the wall and the land's haze along it.
    const sky = Phaser.Display.Color.ValueToColor(c(b.ground[2]));
    for (let i = 0; i < 8; i++) {
      const k = 0.18 + i * 0.07;
      g.fillStyle(Phaser.Display.Color.GetColor(Math.round(sky.red * k), Math.round(sky.green * k), Math.round(sky.blue * k + 10)), 1).fillRect(0, i * (GROUND / 8), SW, GROUND / 8 + 1);
    }
    g.fillStyle(0xfff1c4, 0.12).fillCircle(SW * 0.78, 34, 16);
    g.fillStyle(0xfff1c4, 0.85).fillCircle(SW * 0.78, 34, 9);
    g.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < 22; i++) g.fillRect((i * 97) % SW, (i * 41) % 70, 1, 1);
    g.fillStyle(c(b.ground[3]), 0.1).fillRect(0, GROUND - 40, SW, 40);
    // The ruined city wall: towers and broken crenels.
    g.fillStyle(0x15111c, 1);
    for (let x = -10, i = 0; x < SW + 20; x += 46, i++) {
      const h = 54 + ((i * 37) % 26);
      g.fillRect(x, GROUND - h, 34, h);
      for (let k = 0; k < 3; k++) if ((i + k) % 3) g.fillRect(x + k * 12, GROUND - h - 7, 8, 7);
    }
    g.fillStyle(c(b.ground[0]), 1).fillRect(0, GROUND, SW, SH - GROUND);
    g.fillStyle(c(b.ground[1]), 1).fillRect(0, GROUND, SW, 3);
    g.fillStyle(c(b.ground[3]), 0.5);
    for (let i = 0; i < 26; i++) g.fillRect((i * 53) % SW, GROUND + 6 + ((i * 17) % 24), 2, 2);
  }

  private spawn(x: number, boss: BossId | null = null) {
    const f = this.foes.find((o) => !o.alive && o.dying <= 0);
    if (!f) return;
    const biome = BIOMES[(this.gate - 1) % BIOMES.length], s = this.w.stage;
    if (boss) {
      const [tex] = BOSS_TEX[boss];
      f.img.setTexture(tex, `${boss}-0`).setOrigin(0.5, 1).setScale(bossScale(this, boss) * 0.62);
      f.speed = 30;
    } else {
      // The land's common foes first, its heavies rarely.
      const r = Math.random(), id = biome.foes[r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : r < 0.93 ? 3 : 4];
      f.id = id; f.kind = FOES[id];
      f.img.setTexture(f.kind.sheet, f.kind.row * 4).setOrigin(f.kind.ox / 96, f.kind.oy / 96).setScale(f.kind.scale * 0.95);
      f.speed = 26 + f.kind.speed * 0.5;
    }
    f.boss = boss;
    f.x = x; f.max = f.hp = D.foeHp(s); f.dmg = D.foeDmg(s);
    f.alive = true; f.dying = 0; f.atkT = D.FOE_RATE * 0.6; f.animT = Math.random(); f.flash = 0; f.strikeT = 0;
    f.img.setPosition(x, GROUND).setVisible(true).setAlpha(1).clearTint().setFlipX(true);
  }

  private front(): WFoe | null {
    let best: WFoe | null = null;
    for (const f of this.foes) if (f.alive && (!best || f.x < best.x)) best = f;
    return best;
  }

  // ---------------------------------------------------------------- the fight

  update(_t: number, delta: number) { this.tick(Math.min(delta / 1000, 0.05)); }

  /** One step of the wall (tests call it directly to fast-forward). */
  tick(dt: number) {
    const w = this.w, st = D.watchStats(w);
    const mantle = this.mantleT > 0;
    // Foes to fight: three on the road at most, ten to a stage; a boss stage holds only the boss.
    if (!D.isBoss(w.stage)) {
      const alive = this.foes.filter((f) => f.alive).length;
      if (alive < 3 && this.kills + alive < D.KILLS_PER_STAGE) this.spawn(SW + 20 + alive * 26);
    } else if (!this.foes.some((f) => f.alive) && this.bossTimeLeft > 0 && !this.foes.some((f) => f.dying > 0)) this.spawn(SW + 30, BIOMES[(this.gate - 1) % BIOMES.length].boss as BossId);
    // Walking in: each stops a body's length behind the one ahead, the first at Elior's reach.
    const order = this.foes.filter((f) => f.alive).sort((a, b) => a.x - b.x);
    let limit = HERO_X + REACH - 4;
    for (const f of order) {
      const stop = limit + (f.boss ? 18 : 0);
      if (f.x > stop) f.x = Math.max(stop, f.x - f.speed * dt);
      limit = f.x + (f.boss ? 40 : 22);
      f.animT += dt;
      // At his reach, they strike on their own clock.
      if (this.fallen <= 0 && f === order[0] && f.x <= HERO_X + REACH + (f.boss ? 18 : 0)) {
        f.atkT -= dt;
        if (f.atkT <= 0) {
          f.atkT = D.FOE_RATE * (f.boss ? 0.8 : 1);
          f.strikeT = 0.25;
          this.hurt(f.dmg * (1 - st.dr));
        }
      }
    }
    for (const f of this.foes) this.drawFoe(f, dt);
    // The boss's timer.
    if (D.isBoss(w.stage) && this.fallen <= 0) {
      this.bossTimeLeft -= dt;
      if (this.bossTimeLeft <= 0) this.bossFled();
    }
    // Elior: fallen, or striking.
    if (this.fallen > 0) {
      this.fallen -= dt;
      if (this.fallen <= 0) { this.hp = st.maxHp; this.startStage(Math.max(1, w.stage - 1)); }
    } else {
      this.hp = Math.min(st.maxHp, this.hp + st.maxHp * st.regen * dt);
      const f = this.front(), inReach = !!f && f.x <= HERO_X + REACH + (f.boss ? 22 : 4);
      this.swingCd -= dt;
      if (inReach && this.swingCd <= 0 && !this.shot) {
        const interval = 1 / (st.aspd * (mantle ? D.MANTLE.speed : 1));
        this.swingCd = interval;
        this.flip = !this.flip;
        this.shot = { clip: this.flip ? 'b1' : 'b2', t: 0, dur: Math.min(0.42, interval * 0.9), hitAt: 0.4, hit: false, mult: 1 };
      }
      // Covenant Strike and the Pillar of Fire, on their own clocks.
      if (w.level >= D.SKILLS.strike.level) {
        this.skillT.strike -= dt;
        if (this.skillT.strike <= 0 && inReach && !this.shot) { this.skillT.strike = D.SKILLS.strike.cd; this.shot = { clip: 'heavy', t: 0, dur: 0.5, hitAt: 0.55, hit: false, mult: D.SKILLS.strike.mult }; }
      }
      if (w.level >= D.SKILLS.pillar.level) {
        this.skillT.pillar -= dt;
        if (this.skillT.pillar <= 0 && f) { this.skillT.pillar = D.SKILLS.pillar.cd; this.castPillar(); }
      }
    }
    if (this.shot) {
      this.shot.t += dt;
      if (!this.shot.hit && this.shot.t >= this.shot.dur * this.shot.hitAt) { this.shot.hit = true; const f = this.front(); if (f) this.strike(f, this.shot.mult); }
      if (this.shot.t >= this.shot.dur) this.shot = null;
    }
    this.tapCd -= dt;
    // The shadows strike beside him.
    const n = D.shadowsAt(w.level);
    for (let i = 0; i < this.shadows.length; i++) {
      const s = this.shadows[i];
      s.img.setVisible(i < n);
      if (i >= n) continue;
      s.cd -= dt; s.strikeT = Math.max(0, s.strikeT - dt);
      const f = this.front();
      if (s.cd <= 0 && f && this.fallen <= 0 && f.x <= HERO_X + REACH + 20) {
        s.cd = 1.6 + i * 0.12; s.strikeT = 0.25;
        this.damage(f, st.atk * 0.25 * (mantle ? D.MANTLE.dmg : 1), false, true);
      }
      s.img.setFrame(s.kind.row * 4 + (s.strikeT > 0 ? 3 : Math.floor((this.loopT * 3 + i) % 2))).setPosition(HERO_X - 26 - i * 17 + (s.strikeT > 0 ? 6 : 0), GROUND);
    }
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
    if (!f || f.x > HERO_X + REACH + 30) return;
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
    const coins = D.foeCoins(w.stage) * st.coinMult;
    w.coins += coins; this.earned += coins;
    this.coinText(f.x, GROUND - 30, coins);
    this.gainXp(D.foeXp(w.stage));
    if (w.level >= D.MANTLE.level && this.mantleT <= 0) w.gauge = Math.min(100, w.gauge + D.MANTLE.perKill);
    if (f.boss) { this.bossDown(); return; }
    this.kills++;
    if (this.kills >= D.KILLS_PER_STAGE) {
      // Cleared: on to the next stage, or (holding back after a lost fight) once more here, to grow.
      if (w.auto) this.next(); else this.startStage(w.stage);
    }
  }

  private next() {
    const w = this.w;
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
      this.ui.toast(`Gate ${gate} holds · +${silver} silver for the journey${cape ? ' · and a cape' : ''}`, 3.2);
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
    this.hp -= dmg;
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

  private castPillar() {
    let far: WFoe | null = null;
    for (const f of this.foes) if (f.alive && (!far || f.x > far.x)) far = f;
    if (!far) return;
    this.pillar.setPosition(far.x, GROUND + 4).setScale(0.55).setVisible(true).setFrame(40);
    this.pillarT = 0;
    const st = D.watchStats(this.w);
    this.damage(far, st.atk * D.SKILLS.pillar.mult * (this.mantleT > 0 ? D.MANTLE.dmg : 1), true, false);
    sfx('pillarFire', { vol: 0.5 });
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
    if (this.fallen > 0) { clip = 'hurt'; u = 0.6; }
    else if (this.shot) { clip = this.shot.clip; u = this.shot.t / this.shot.dur; }
    this.hero.setTexture(key, actionFrame(this, key, clip, u)).setAlpha(this.fallen > 0 ? 0.5 : 1);
    this.aura.setAlpha(this.mantleT > 0 ? 0.35 + Math.sin(this.loopT * 6) * 0.1 : 0);
    // His health over his head, and a boss's along the top of the wall.
    const st = D.watchStats(this.w), g = this.hpBar.clear();
    g.fillStyle(0x000000, 0.6).fillRect(HERO_X - 16, GROUND - 58, 32, 3);
    g.fillStyle(0x6ad16a, 1).fillRect(HERO_X - 16, GROUND - 58, 32 * Math.max(0, this.hp / st.maxHp), 3);
    if (this.w.level >= D.MANTLE.level) { g.fillStyle(0x000000, 0.6).fillRect(HERO_X - 16, GROUND - 54, 32, 2); g.fillStyle(0xb48cff, 1).fillRect(HERO_X - 16, GROUND - 54, 32 * (this.mantleT > 0 ? this.mantleT / D.MANTLE.time : this.w.gauge / 100), 2); }
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
    if (f.boss) {
      const [tex, n] = BOSS_TEX[f.boss];
      f.img.setTexture(tex, `${f.boss}-${f.strikeT > 0 ? Math.min(n - 1, 3) : Math.floor(f.animT * 4) % 2}`);
    } else f.img.setFrame(f.kind.row * 4 + (f.strikeT > 0 ? 3 : f.x > HERO_X + REACH + 2 ? 1 + (Math.floor(f.animT * 6) % 2) : 0));
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
  }
  private shakeIt(i: number, ms: number) { const k = shakeScale(); if (k > 0) this.cameras.main.shake(ms, i * k); }
}
