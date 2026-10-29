// Wings of the Morning: Tirzah's transformation. It shares the Shadow Mantle's
// gauge, button and timer (`Player.mantleT`); only its look and powers differ.
// Dawnstep: an arrow that lands on a foe arms it for 0.6 s, and Dodge blinks her
// to safe ground behind it for a guard-breaking back arrow. Three in a chain end
// in Morning Star, a ring of light arrows. When the form ends, light arrows fall
// on every foe she struck during it. Art: V05 (blink, back shot, arrow rain) and
// V06 (the wings) from the art drop.
import Phaser from 'phaser';
import { settings } from '../classic/shim/settings';
import { TILE, isSolid, type T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import type { Bow } from './bow';
import { trank } from './archer';

const ARM_T = 0.6, CHAIN_T = 2.4, ICD = 0.3, MARKS = 8;
/** The stab into a foe's back: its length, and when the blade lands. */
export const STAB_T = 0.26;
const STAB_AT = 0.07;
/** Rows of the V05 sheet. */
const FX = { out: 0, in: 1, back: 2, rain: 4 } as const;

export class Dawn {
  armed: FoeLike | null = null;
  armT = 0;
  chain = 0;
  private chainT = 0;
  private icd = 0;
  private was = false;
  /** A critical arrow under the Wings: she follows it behind the foe on her own (with its own cooldown). */
  private pending: FoeLike | null = null;
  private autoCd = 0;
  /** Foes struck during the form, for the closing volley. */
  readonly marked = new Set<FoeLike>();
  /** The Wings' stab: after a critical arrow she blinks behind the foe and drives her dagger into its back, then
   * looses an arrow through it and on. `cut` is the blade's arc. */
  private cut: Phaser.GameObjects.Image;
  private jabFoe: FoeLike | null = null;
  private jabT = -1;
  jabs = 0;
  private wings: Phaser.GameObjects.Image;
  private fx: { img: Phaser.GameObjects.Image; t: number; row: number; dur: number; follow: FoeLike | null }[];

  constructor(private w: WorldApi, private p: Player, private bow: Bow) {
    this.wings = w.sc.add.image(0, 0, 'vfx-transform', 27).setBlendMode(Phaser.BlendModes.ADD).setDepth(9.6).setVisible(false);
    this.cut = w.sc.add.image(0, 0, 'vfx-slashes', 6).setBlendMode(Phaser.BlendModes.ADD).setDepth(11.5).setVisible(false);
    this.fx = Array.from({ length: 6 }, () => ({ img: w.sc.add.image(0, 0, 'vfx-archer', 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(15.3).setVisible(false), t: -1, row: 0, dur: 0.4, follow: null }));
  }

  get active() { return this.p.hero === 'tirzah' && this.p.mantleT > 0 && this.p.state !== 'transform'; }

  /** Every arrow that lands while the wings are out marks its foe and arms a Dawnstep on it. */
  onArrowHit(f: FoeLike) {
    if (!this.active || !f.alive) return;
    if (this.marked.size < MARKS) this.marked.add(f);
    this.armed = f; this.armT = ARM_T;
  }

  critStep(f: FoeLike) { if (this.active && this.autoCd <= 0) this.pending = f; }

  ready() { return this.active && !!this.armed && this.armed.alive && this.armT > 0 && this.icd <= 0; }

  /** Blink behind the armed foe and loose the back arrow. Refuses unsafe or unseen ground behind it. */
  step(finisher = false, jab = false) {
    const p = this.p, f = this.armed!;
    this.armed = null; this.armT = 0;
    const side = Math.sign(f.x - p.x) || p.face;
    const spot = p.blinkSpotAt(f.x, f.box.bottom, f.box.width / 2, side);
    // Only to ground she can stand on behind it: never into a wall, a pit or the air.
    if (!spot || Math.sign(spot.x - f.x) !== side || !this.floorUnder(spot.x, spot.y)) { this.w.spark(p.x, p.feet - 30, 0xffe6a8, 4); return false; }
    this.play(FX.out, p.x, p.feet - 28, 0.3, 0.5);
    p.placeAt(spot.x, spot.y, -side);
    p.grantInvuln(0.3);
    this.play(FX.in, p.x, p.feet - 28, 0.3, 0.5);
    this.chain = this.chainT > 0 ? this.chain + 1 : 1;
    this.chainT = CHAIN_T; this.icd = ICD;
    if (jab) { this.jabFoe = f; this.jabT = 0; this.bow.stabT = STAB_T; } else this.bow.backShot(this.chain, finisher);
    this.play(FX.back, p.x + p.face * 22, p.feet - 31, 0.28, 0.42, p.face < 0);
    this.w.playEffect('dash');
    if (this.chain >= 3) this.morningStar();
    return true;
  }

  private floorUnder(x: number, feet: number) {
    for (const dx of [-5, 5]) if (isSolid(this.w.tileAt(Math.floor((x + dx) / TILE), Math.floor((feet + 4) / TILE)) as T)) return true;
    return false;
  }

  /** The third Dawnstep: a ring of light arrows from where she stands. */
  private morningStar() {
    this.chain = 0; this.chainT = 0;
    this.bow.radial(12);
    this.play(FX.in, this.p.x, this.p.feet - 28, 0.45, 0.9);
    this.w.floatText(this.p.x, this.p.feet - 64, 'MORNING STAR', '#fff1c4');
    this.w.playEffect('rally');
  }

  /** The form ends: light falls on every foe she marked. */
  private finale() {
    let n = 0;
    for (const f of this.marked) {
      if (!f.alive || f.removed) continue;
      const hp = f.hp;
      if (f.hit(Math.round(this.p.power() * 1.8), 0, 1.2, false, { kind: 'proj', poise: 30, kx: 0, ky: -80, guardBreak: true })) {
        this.w.heroHit(f, hp !== undefined && f.hp !== undefined ? Math.max(0, hp - f.hp) : 0, true);
        this.play(FX.rain, f.x, f.box.top - 6, 0.6, 0.55, false, f);
        n++;
      }
    }
    this.marked.clear();
    if (n) this.w.playEffect('bowRelease');
  }

  private play(row: number, x: number, y: number, dur: number, scale: number, flip = false, follow: FoeLike | null = null) {
    if (settings.quality === 'low' && row !== FX.rain) return;
    const o = this.fx.find((e) => e.t < 0) ?? this.fx.reduce((a, e) => (e.t > a.t ? e : a));
    o.t = 0; o.row = row; o.dur = dur; o.follow = follow;
    o.img.setFrame(row * 8).setPosition(x, y).setScale(scale).setFlipX(flip).setAlpha(settings.reduceFlashes ? 0.6 : 1).setVisible(true);
  }

  update(dt: number) {
    this.armT = Math.max(0, this.armT - dt);
    this.icd = Math.max(0, this.icd - dt);
    this.autoCd = Math.max(0, this.autoCd - dt);
    const f = this.pending;
    this.pending = null;
    if (f && f.alive && this.active && this.icd <= 0 && (this.p.state === 'free' || this.p.state === 'bow')) {
      this.bow.cancel(); if (this.p.state === 'bow') this.p.releaseState();
      this.armed = f; this.armT = ARM_T;
      if (this.step(true, true)) this.autoCd = 1.2;
    }
    this.chainT = Math.max(0, this.chainT - dt);
    if (!this.chainT) this.chain = 0;
    const on = this.active;
    if (this.was && !on && this.p.hero === 'tirzah' && !this.p.dead) this.finale();
    if (!on) { this.armed = null; if (!this.was) this.marked.clear(); }
    this.was = on;
    // Wings of light at her shoulders, breathing slowly.
    const p = this.p, show = on && p.sprite.visible && !p.dead;
    this.wings.setVisible(show);
    if (show) {
      const pulse = Math.sin(this.w.sc.time.now / 380);
      this.wings.setFrame(pulse > 0.3 ? 28 : 27).setPosition(p.x - p.face * 3, p.feet - 36 + pulse).setScale(0.42 + pulse * 0.015)
        .setAlpha((settings.reduceFlashes ? 0.3 : 0.55) + pulse * 0.05).setFlipX(p.face < 0);
    }
    this.stepJab(dt);
    for (const o of this.fx) {
      if (o.t < 0) continue;
      o.t += dt;
      if (o.t >= o.dur) { o.t = -1; o.follow = null; o.img.setVisible(false); continue; }
      if (o.follow) o.img.setPosition(o.follow.x, o.follow.box.top - 6);
      o.img.setFrame(o.row * 8 + Math.min(7, Math.floor((o.t / o.dur) * 8)));
    }
  }

  /** The stab: her dagger goes into the foe's back at 0.07 s, its arc fades, and then she looses on. */
  private stepJab(dt: number) {
    if (this.jabT < 0) return;
    const p = this.p, f = this.jabFoe, before = this.jabT;
    this.jabT += dt;
    const k = Math.min(1, Math.max(0, (this.jabT - STAB_AT + 0.04) / 0.18));
    this.cut.setVisible(this.jabT >= STAB_AT - 0.04 && k < 1).setFrame(6 + Math.min(5, Math.floor(k * 6))).setFlipX(p.face < 0)
      .setPosition(p.x + p.face * 18, p.feet - 30).setScale(0.36).setAlpha(settings.reduceFlashes ? 0.5 : 1);
    if (before < STAB_AT && this.jabT >= STAB_AT && f && f.alive) {
      const hp = f.hp, e = (f as FoeLike & { e?: { isBoss?: boolean; maxHp?: number } }).e;
      // Dawn Jab (her tree) strikes harder and fells foes from higher up.
      const s = this.w.save, keen = trank(s, 't_jab') > 0;
      let dmg = this.p.power() * 3.2 * this.w.d.critDmg * (keen ? 1.4 : 1);
      // A foe already low falls to it outright (bosses only take the damage).
      if (hp !== undefined && e && !e.isBoss && e.maxHp && hp < e.maxHp * (keen ? 0.55 : 0.4)) dmg = Math.max(dmg, hp + 1);
      if (f.hit(Math.round(dmg), p.face, 3, true, { kind: 'melee', kx: p.face * 160, ky: -90, poise: 70, guardBreak: true })) {
        this.w.heroHit(f, hp !== undefined && f.hp !== undefined ? Math.max(0, hp - f.hp) : 0, true, true);
        this.w.burst(f.x - p.face * 4, f.box.centerY, 1);
        this.w.spark(f.x, f.box.centerY, 0xfff1c4, 14);
        this.w.finale(f.x, f.box.centerY, 1.2);
        this.w.playEffect('dawnJab', { x: f.x });
        this.p.noteStyle('dawn_jab');
        this.jabs++;
        // Night Huntress: a kill gives back some of the gauge.
        if (!f.alive && trank(s, 't_huntress')) s.mantle = Math.min(100, (s.mantle ?? 0) + 15);
      }
    }
    if (this.jabT >= STAB_T) {
      // She doesn't stop: an arrow through where the foe stood, and on into whatever is behind it.
      this.jabT = -1; this.jabFoe = null; this.cut.setVisible(false);
      if (this.active && !p.dead) this.bow.backShot(this.chain, false);
    }
  }

  clear() {
    this.armed = null; this.armT = this.chain = this.chainT = 0; this.marked.clear(); this.was = false;
    this.wings.setVisible(false);
    this.jabT = -1; this.jabFoe = null; this.cut.setVisible(false);
    for (const o of this.fx) { o.t = -1; o.follow = null; o.img.setVisible(false); }
  }

  destroy() { this.cut.destroy(); this.wings.destroy(); for (const o of this.fx) o.img.destroy(); }
}
