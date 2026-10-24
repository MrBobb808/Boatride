// Foes in Phaser. Every kind with a PNG sheet row (sprite-manifest.json) is
// playable here with one of four behaviours: a melee walker that winds up and
// strikes, a fast lunging beast, an archer that keeps its distance and shoots,
// or a flier. Stats and body sizes are the original game's
// (remnant/src/game/enemies.ts); kind-specific moves come in later parts.

import Phaser from 'phaser';
import { spriteManifest, type EnemyKind } from '../shared';
import { GRAV } from './player';
import type { WorldApi } from './types';

interface Stats { hp: number; dmg: number; poise: number; xp: number; silver: [number, number]; name: string; w: number; h: number }
const S = (hp: number, dmg: number, poise: number, xp: number, silver: [number, number], name: string, w: number, h: number): Stats => ({ hp, dmg, poise, xp, silver, name, w, h });
export const FOE_STATS: Record<EnemyKind, Stats> = {
  husk: S(46, 12, 18, 12, [2, 5], 'Veil Husk', 13, 30),
  hound: S(40, 11, 14, 15, [2, 5], 'Gloom Hound', 24, 16),
  archer: S(42, 13, 16, 18, [3, 6], 'Hollow Archer', 12, 32),
  sentinel: S(170, 20, 60, 55, [8, 14], 'Fallen Sentinel', 18, 42),
  wisp: S(30, 10, 10, 16, [2, 4], 'Veil Wisp', 14, 18),
  brute: S(420, 26, 130, 85, [12, 20], 'Ironbound Brute', 26, 52),
  bulwark: S(280, 18, 110, 64, [10, 16], 'Shieldwall Bulwark', 22, 46),
  knight: S(210, 22, 70, 70, [10, 16], 'Crimson Knight', 16, 40),
  drone: S(34, 12, 8, 18, [2, 5], 'Locust Drone', 16, 12),
  soldier: S(190, 22, 60, 72, [10, 16], 'Locust Soldier', 16, 40),
  lion: S(170, 20, 42, 62, [8, 14], 'Brazen Lion', 30, 22),
  vessel: S(80, 18, 12, 58, [8, 14], 'Vessel Wraith', 18, 18),
  scribe: S(125, 19, 26, 66, [10, 18], 'Scribe of the Veil', 12, 34),
  priest: S(120, 18, 26, 60, [10, 16], 'Chaldean Fire-Priest', 12, 34),
  undying: S(150, 21, 40, 70, [12, 20], 'Undying Host', 16, 40),
  gale: S(70, 20, 10, 64, [10, 16], 'Fallen Gale', 18, 16),
  stalker: S(150, 19, 34, 66, [10, 18], 'Antlered Stalker', 14, 34),
  carrier: S(165, 17, 48, 68, [10, 18], 'Swarm Carrier', 26, 30),
  golem: S(300, 24, 120, 86, [12, 22], 'Slag Golem', 30, 46),
  eel: S(120, 18, 24, 60, [8, 16], 'Brine Eel', 26, 12),
};

type Mode = 'melee' | 'beast' | 'archer' | 'flier';
const MODE: Partial<Record<EnemyKind, Mode>> = { hound: 'beast', lion: 'beast', stalker: 'beast', archer: 'archer', priest: 'archer', scribe: 'archer', drone: 'flier', wisp: 'flier', vessel: 'flier', gale: 'flier', eel: 'flier' };

interface SheetRow { sheet: string; row: number; originX: number; originY: number; height: number }
const ROWS = new Map<string, SheetRow>();
for (const [sheet, rows] of Object.entries(spriteManifest.sheets as Record<string, { id: string; row: number; originX: number; originY: number; height: number }[]>)) {
  if (sheet.startsWith('echo-')) continue;
  for (const r of rows) if (!ROWS.has(r.id)) ROWS.set(r.id, { sheet, ...r });
}
/** The sheets the Boot scene loads, and whether a kind can be drawn yet. */
export const FOE_SHEETS = [...new Set([...ROWS.values()].map((r) => r.sheet))];
export const foeDrawable = (k: string) => ROWS.has(k);
const CELL = spriteManifest.cell;

type State = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dead';

export class Foe {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Sprite;
  bar: Phaser.GameObjects.Graphics;
  kind: EnemyKind;
  stats: Stats;
  mode: Mode;
  hp: number;
  maxHp: number;
  state: State = 'idle';
  face: number;
  box = new Phaser.Geom.Rectangle();
  private st = 0;
  private poise: number;
  private flash = 0;
  private cool = 0;
  private home: number;
  private struck = false;
  private shownBar = 0;
  removed = false;

  constructor(private w: WorldApi, kind: EnemyKind, x: number, feet: number, face = -1, private elite = false) {
    this.kind = kind;
    const st = (this.stats = FOE_STATS[kind]);
    this.mode = MODE[kind] ?? 'melee';
    const sc = w.sc;
    const fly = this.mode === 'flier';
    this.rect = sc.add.rectangle(x, fly ? feet - 40 : feet - st.h / 2, st.w, st.h, 0xffffff, 0);
    sc.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setGravityY(fly ? 0 : GRAV).setMaxVelocityY(560);
    this.body.setCollideWorldBounds(true);
    this.home = x;
    this.face = face;
    this.hp = this.maxHp = Math.round(st.hp * (elite ? 2.4 : 1));
    this.poise = st.poise;
    const r = ROWS.get(kind)!;
    // Drawn as tall as the body (a little taller), feet on the body's bottom.
    const scale = (st.h * (kind === 'drone' ? 1.7 : kind === 'vessel' ? 1.5 : 1.08)) / r.height;
    this.sprite = sc.add.sprite(x, feet, r.sheet, r.row * 4).setOrigin(r.originX / CELL, r.originY / CELL).setScale(scale).setDepth(8);
    if (elite) this.sprite.setTint(0xffb0b0);
    this.bar = sc.add.graphics().setDepth(12);
  }

  get alive() { return this.state !== 'dead'; }
  get x() { return this.body.center.x; }

  /** Take a blow from Elior; returns true when it landed. */
  hit(dmg: number, dir: number, force: number) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.12;
    this.shownBar = 2.5;
    this.w.floatText(this.x, this.body.top - 4, String(dmg), '#ffe6a8');
    this.w.spark(this.x - dir * 4, this.body.center.y, 0xffe0a0, 6);
    this.poise -= dmg * force;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.st = 0;
      this.body.setVelocity(dir * 140, -160);
      this.body.setGravityY(GRAV);
      this.body.checkCollision.none = false;
      this.w.onFoeDied(this.stats.xp * (this.elite ? 3 : 1), Phaser.Math.Between(...this.stats.silver), this.x, this.body.top);
      return true;
    }
    // Poise breaks: the blow staggers it out of whatever it was doing.
    if (this.poise <= 0 || this.state !== 'windup') {
      if (this.poise <= 0) this.poise = this.stats.poise;
      this.state = 'hurt';
      this.st = 0;
      this.body.setVelocityX(dir * 90 * force * (this.stats.poise > 80 ? 0.4 : 1));
    }
    return true;
  }

  private playerDist() {
    const p = this.w.player;
    return { dx: p.x - this.x, dy: p.feet - this.body.bottom };
  }

  update(dt: number) {
    const b = this.body;
    this.st += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.shownBar = Math.max(0, this.shownBar - dt);
    const st = this.stats;
    const { dx, dy } = this.playerDist();
    const dist = Math.abs(dx);
    const sees = !this.w.player.dead && dist < 190 && Math.abs(dy) < 70;
    const fly = this.mode === 'flier';
    const reach = this.mode === 'beast' ? 46 : this.mode === 'flier' ? 22 : Math.max(26, st.w + 12);
    const speed = this.mode === 'beast' ? 110 : fly ? 70 : st.hp > 250 ? 38 : 52;

    switch (this.state) {
      case 'dead':
        if (this.st > 0.9 && !this.removed) this.remove();
        break;
      case 'idle':
        // Wander near home until Elior is in sight.
        b.setVelocityX(Math.sin(this.st * 0.8 + this.home) * 18);
        if (b.velocity.x) this.face = Math.sign(b.velocity.x);
        if (fly) b.setVelocityY(Math.sin(this.st * 2) * 12);
        if (sees) { this.state = 'chase'; this.st = 0; }
        break;
      case 'chase': {
        if (!sees && this.st > 2) { this.state = 'idle'; this.st = 0; break; }
        this.face = Math.sign(dx) || this.face;
        let want = Math.sign(dx) * speed;
        if (this.mode === 'archer') want = dist < 90 ? -Math.sign(dx) * speed : dist > 150 ? Math.sign(dx) * speed : 0;
        b.setVelocityX(want);
        if (fly) b.setVelocityY(Phaser.Math.Clamp((this.w.player.y - 18 - b.center.y) * 2, -80, 80));
        const inRange = this.mode === 'archer' ? dist < 170 : dist < reach;
        if (inRange && this.cool <= 0) { this.state = 'windup'; this.st = 0; }
        break;
      }
      case 'windup':
        b.setVelocityX(0);
        if (fly) b.setVelocityY(0);
        if (this.st >= (this.mode === 'beast' ? 0.38 : st.hp > 250 ? 0.6 : 0.45)) {
          this.state = 'strike';
          this.st = 0;
          this.struck = false;
          if (this.mode === 'beast') b.setVelocity(this.face * 260, -140);
          if (fly) b.setVelocity(this.face * 180, Phaser.Math.Clamp((this.w.player.y - b.center.y) * 3, -160, 160));
          if (this.mode === 'archer') this.shoot();
        }
        break;
      case 'strike': {
        if (this.mode === 'melee') b.setVelocityX(this.face * 30);
        const box = new Phaser.Geom.Rectangle(this.face > 0 ? this.x : this.x - reach, b.top, reach, b.height);
        const p = this.w.player;
        if (!this.struck && this.mode !== 'archer' && Phaser.Geom.Rectangle.Contains(box, p.x, p.feet - 12)) {
          this.struck = true;
          p.hurt(Math.round(st.dmg * (this.elite ? 1.4 : 1)), this.face);
        }
        if (this.st >= 0.25) { this.state = 'recover'; this.st = 0; this.cool = this.mode === 'archer' ? 1.6 : 0.9; }
        break;
      }
      case 'recover':
        b.setVelocityX(b.velocity.x * 0.85);
        if (fly) b.setVelocityY(b.velocity.y * 0.9);
        if (this.st >= 0.4) { this.state = 'chase'; this.st = 0; }
        break;
      case 'hurt':
        b.setVelocityX(b.velocity.x * 0.85);
        if (this.st >= 0.28) { this.state = 'chase'; this.st = 0; }
        break;
    }
    this.draw();
  }

  private shoot() {
    const sc = this.w.sc;
    const p = this.w.player;
    const arrow = sc.add.rectangle(this.x + this.face * 8, this.body.top + 10, 10, 2, this.kind === 'priest' ? 0xff8a3a : 0xd8d0c0);
    sc.physics.add.existing(arrow);
    const ab = arrow.body as Phaser.Physics.Arcade.Body;
    ab.setAllowGravity(false);
    const ang = Math.atan2(p.y - arrow.y, p.x - arrow.x);
    ab.setVelocity(Math.cos(ang) * 240, Math.sin(ang) * 240);
    arrow.setRotation(ang).setDepth(9);
    const dmg = Math.round(this.stats.dmg * (this.elite ? 1.4 : 1));
    const born = sc.time.now;
    const tick = () => {
      if (!arrow.active) return;
      const tx = Math.floor(arrow.x / 16), ty = Math.floor(arrow.y / 16);
      const t = this.w.tileAt(tx, ty);
      if ((t >= 1 && t <= 3) || t === 6 || sc.time.now - born > 2500) { arrow.destroy(); return; }
      if (Math.abs(arrow.x - p.x) < 8 && arrow.y > p.feet - 34 && arrow.y < p.feet) {
        p.hurt(dmg, Math.sign(ab.velocity.x) || 1);
        arrow.destroy();
        return;
      }
      sc.time.delayedCall(16, tick);
    };
    tick();
  }

  private draw() {
    const b = this.body;
    const r = ROWS.get(this.kind)!;
    let f = 0;
    if (this.state === 'windup') f = 2;
    else if (this.state === 'strike') f = 3;
    else if (Math.abs(b.velocity.x) > 12 || this.mode === 'flier') f = Math.floor(this.w.sc.time.now / 1000 * 9) % 2;
    this.sprite.setFrame(r.row * 4 + f);
    // The sheets face right; the sprite turns with the foe.
    this.sprite.setFlipX(this.face < 0);
    this.sprite.setPosition(Math.round(b.center.x), Math.round(b.bottom));
    if (this.state === 'dead') {
      const k = Math.min(1, this.st / 0.45);
      this.sprite.setAngle(-this.face * k * 80).setAlpha(Math.max(0, 1 - (this.st - 0.4) / 0.5));
    } else {
      this.sprite.setAngle(this.state === 'hurt' ? -this.face * 7 : 0);
      // A white flash on impact, then back to its own colours.
      if (this.flash > 0) this.sprite.setTint(0xfff6e5).setTintMode(Phaser.TintModes.FILL);
      else if (this.elite) this.sprite.setTint(0xffb0b0).setTintMode(Phaser.TintModes.MULTIPLY);
      else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    // A wind-up glint, then the bar when hurt.
    this.box.setTo(b.left, b.top, b.width, b.height);
    const g = this.bar;
    g.clear();
    if (this.state === 'windup') {
      g.fillStyle(0xffbf77, 1);
      g.fillRect(b.center.x + this.face * 6, b.top - 9, 1, 7);
      g.fillRect(b.center.x + this.face * 6 - 3, b.top - 6, 7, 1);
    }
    if (this.alive && (this.shownBar > 0 || this.elite)) {
      const wpx = Math.max(18, b.width + 6);
      g.fillStyle(0x000000, 0.7).fillRect(b.center.x - wpx / 2, b.top - 6, wpx, 3);
      g.fillStyle(this.elite ? 0xff6a8a : 0xd04a4a, 1).fillRect(b.center.x - wpx / 2, b.top - 6, wpx * Math.max(0, this.hp / this.maxHp), 3);
    }
  }

  remove() {
    this.removed = true;
    this.sprite.destroy();
    this.bar.destroy();
    this.rect.destroy();
  }
}
