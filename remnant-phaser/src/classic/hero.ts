// High-level combat systems on the Phaser hero. Shared finishers, elements,
// sub-weapons and supers operate through PlayerView; Arcade owns the body.
import Phaser from 'phaser';
import { G } from './shim/ctx';
import { sfx } from './shim/audio';
import { settings } from './shim/settings';
import { runBlessings } from '../../../remnant/src/game/blessings';
import { senseWater } from '../../../remnant/src/game/swim';
import { Enemy } from '../../../remnant/src/game/enemies';
import type { Entity } from '../../../remnant/src/game/entity';
import type { Player as OriginalPlayer } from '../../../remnant/src/game/player';
import { beginFinisher, updateFinisher, killBlow, riseAsShadow, type FinState } from '../../../remnant/src/game/finishers';
import { powerTier, weaponElement, ELEMENTS, elementHit } from '../../../remnant/src/game/power';
import { mantleDuration, mantleTier, mantleGain } from '../../../remnant/src/game/mantle';
import { throwSub } from '../../../remnant/src/game/subweapons';
import { ChainBlade } from '../../../remnant/src/game/chain';
import { alternateSuper, selectedSuper, superTarget } from '../../../remnant/src/game/supers';
import { SUPER_MOVES } from '../../../remnant/src/game/data';
import { clipsFor } from '../../../remnant/src/game/weapons';
import { fx, PK } from '../../../remnant/src/render/fx';
import type { ClassicLayer } from './layer';
import type { Player } from '../game/player';

const ELEMENT_COLORS = Object.fromEntries(Object.entries(ELEMENTS).map(([id, e]) => [id, parseInt(e.c.slice(1), 16)]));

export class HeroPowers {
  fin: FinState | null = null;
  mantleMax = 1;
  subCd = 0;
  weaponFlight: ChainBlade | null = null;
  private throwCd = 0;
  private pursuitCd = 0;
  private transformT = 0;
  private transformed = false;
  private superT = -1;
  private superId = 'rally' as keyof typeof SUPER_MOVES;
  private superFoe: Entity | null = null;
  private waveN = 0;
  private shadeT = 0;
  clip = '';
  private clipTime = 0;
  private clipDuration = 1;
  private clipSpeed = 1;
  get clipProgress() { return this.clipTime / this.clipDuration; }
  playClip(id:string,speed=1) {
    this.clip=id;this.clipTime=0;this.clipSpeed=speed;
    this.clipDuration=clipsFor(this.L.host.d.family)[id]?.dur??.5;
  }
  ghosts: { x: number; y: number; face: number; a: number; pose?: unknown; rot?: number }[] = [];
  private ghostSprites: Phaser.GameObjects.Sprite[];
  private g: Phaser.GameObjects.Graphics;
  /** Power and the Mantle read as soft light behind the hero, never as an outline over him. */
  private aura: Phaser.GameObjects.Image;
  constructor(readonly L: ClassicLayer, readonly p: Player) {
    this.g = L.host.sc.add.graphics().setDepth(9);
    this.aura = L.host.sc.add.image(0, 0, 'glow').setDepth(9).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.ghostSprites = Array.from({ length: 16 }, () => L.host.sc.add.sprite(0, 0, 'elior', 0).setOrigin(0.5, 120 / 128).setScale(56 / 128).setDepth(8).setVisible(false));
  }
  private get actor() { return this.L.playerView as unknown as OriginalPlayer; }
  get multiplier() { return this.p.mantleT > 0 ? [1, 1.5, 1.7, 1.9, 2.2][mantleTier()] : 1; }
  get frame() {
    if (!this.clip) return null;
    return /Leap|launch/.test(this.clip) ? 8 : /invoke|cast|charge/.test(this.clip) ? 15 : /dash/.test(this.clip) ? 12 : 11;
  }
  senseWater(dt: number) { senseWater(this.actor, dt); }
  gain(n: number) {
    if (this.L.storyEnabled && !this.L.host.save.flags.relic_taken) return;
    const s = this.L.host.save;
    s.rally = Math.min(100, s.rally + n * this.L.host.d.rallyMult);

  }
  /** Called once before the hero's ordinary state machine. */
  update(dt: number) {
    const p = this.p, w = this.L.host, c = w.controls, s = w.save;
    this.clipTime+=dt*this.clipSpeed;
    this.subCd = Math.max(0, this.subCd - dt); const recharge = dt * runBlessings.recharge * w.d.pursuitRecharge; this.throwCd = Math.max(0, this.throwCd - recharge); this.pursuitCd = Math.max(0, this.pursuitCd - recharge);
    if (s.level >= 25 && !s.flags.mantle_known) { s.flags.mantle_known = true; s.mantle = 100; w.toast('Shadow Mantle awakened · G / the MANTLE button'); }
    if (p.mantleT > 0 && p.state !== 'transform' && !G.inCutscene) {
      p.mantleT = Math.max(0, p.mantleT - dt);
      this.shadeT -= dt;
      if (this.shadeT <= 0 && settings.quality !== 'low' && !settings.reduceFlashes && (Math.abs(p.body.velocity.x) > 20 || p.state === 'attack')) {
        this.shadeT = 0.06; this.ghosts.push({ x: p.x, y: p.feet, face: p.face, a: 0.5 });
      }
      if (!p.mantleT) { sfx('mantleEnd'); fx.veilBurst(p.x, p.y, 18, 1); }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { this.ghosts[i].a -= dt * 1.8; if (this.ghosts[i].a <= 0 || settings.quality === 'low' || settings.reduceFlashes || p.dead) this.ghosts.splice(i, 1); }
    if (this.ghosts.length > 16) this.ghosts.splice(0, this.ghosts.length - 16);
    if (p.dead) { this.fin = null; this.superT = -1; this.render(); return false; }
    if (p.state === 'execute' && this.fin) {
      p.body.setGravityY(0);
      if (updateFinisher(this.actor, this.fin, dt)) { this.fin = null; this.clip = ''; G.camera.zoomTarget = 1; p.releaseState(); }
      this.render(); return true;
    }
    if (p.state === 'transform') {
      this.transformT += dt; p.body.setGravityY(0).setVelocity(0, this.transformT < 0.72 ? -12 : 0);
      if (this.transformT >= 0.72 && !this.transformed) {
        this.transformed = true; p.mantleT = this.mantleMax = mantleDuration();
        fx.veilBurst(p.x, p.y, 35, 1.8); fx.column(p.x, p.feet, 44, 440, '#a34bdf', 1); fx.ring(p.x, p.y, 6, 150, '#d5a1ff', 0.7, 5);
        this.L.hitEnemies({ x: p.x - 140, y: p.feet - 100, w: 280, h: 120 }, { dmg: w.d.atk * 2.2 * this.multiplier, poise: 90, kx: p.face * 340, ky: -240, dir: p.face, kind: 'ability', src: this.actor, guardBreak: true }, new Set());
        w.shake(0.012, 400); this.L.slowmo(0.4, 0.4); w.banner('SHADOW MANTLE', `${Math.round(p.mantleT)} seconds · pursuit, throw and free Phantom Steps`);
      }
      if (this.transformT >= 1.15) { this.clip = ''; p.releaseState(); }
      this.render(); return true;
    }
    if (this.superT >= 0) {
      const before = this.superT; this.superT += dt; p.body.setVelocityX(0);
      if (this.superId !== 'rally') alternateSuper(this.superId, before, this.superT, this.superFoe);
      else for (const at of [1.3, 2.1]) if (before < at && this.superT >= at) {
        const final = at > 2, d = w.d;
        for (const e of this.L.foes()) if (e.canBeTargeted() && p.lineOfSight(e.x, e.cy)) {
          e.takeHit({ dmg: d.atk * d.abil * d.echoDmg * (final ? 5 : 3), poise: final ? 150 : 40, kx: Math.sign(e.x - p.x) * 200, ky: -220, dir: p.face, kind: 'ability', src: this.actor, guardBreak: true });
          fx.column(e.x, e.y, 40, 260, '#ffe6a8', 0.8);
        }
        sfx(final ? 'execute' : 'hitHeavy'); w.shake(0.008, 200);
      }
      if (this.superT >= 2.7) { this.superT = -1; this.superFoe = null; this.clip = ''; G.inCutscene = false; w.hud.cinematicBars(false); p.releaseState(); }
      this.render(); return true;
    }
    if (!p.water.swimming && !G.inCutscene && !['hurt', 'heal', 'plunge', 'phantom', 'swim'].includes(p.state)) {
      if (c.pressed('transform') && this.tryTransform()) { this.render(); return true; }
      if (c.pressed('ultimate') && this.trySuper()) { this.render(); return true; }
      if (c.pressed('sub') || c.pressed('heavy') && c.down('up')) {
        if (p.mantleT > 0) this.throwWeapon(); else throwSub(this.actor);
      }
    }
    this.render(); return false;
  }
  tryTransform() {
    const s = this.L.host.save;
    if (s.level < 25) { this.L.host.toast('Shadow Mantle awakens at level 25.'); return false; }
    if (this.p.mantleT > 0 || (s.mantle ?? 0) < 100) { this.L.host.toast('Fill the Mantle gauge through battle.'); return false; }
    s.mantle = 0; this.transformT = 0; this.transformed = false; this.clip = 'charge'; this.p.state = 'transform'; sfx('transform'); return true;
  }
  trySuper() {
    const s = this.L.host.save;
    if (!s.flags.relic_taken || s.rally < 100 || this.L.duel) { this.L.host.toast('Your super charges through battle after the relic awakens.'); return false; }
    this.superId = selectedSuper(); this.superFoe = this.superId === 'tempest' ? superTarget() : null;
    if (this.superId === 'tempest' && !this.superFoe) { this.L.host.toast('Umbral Tempest needs a reachable foe.'); return false; }
    s.rally = 0; this.superT = 0; this.p.untouchable = 3; this.p.state = 'scripted'; this.playClip('invoke');
    G.inCutscene = true; this.L.host.hud.cinematicBars(true); this.L.host.banner(SUPER_MOVES[this.superId].name.toUpperCase(), ''); sfx('rally'); return true;
  }
  tryExecution() {
    if (!this.p.onGround) return false;
    const p = this.p, e = this.L.foes().find((e) => e.executable() && Math.abs(e.x - p.x) < (e.isBoss ? e.body.w / 2 + 60 : 36) && Math.abs(e.y - p.feet) < 60 && p.lineOfSight(e.x, e.cy));
    if (!e) return false;
    p.state = 'execute'; this.fin = beginFinisher(this.actor, e); return true;
  }
  get guardAura() { return this.L.guardianAura(this.p.x, this.p.feet); }
  onParry() { this.gain(10); mantleGain(8); }
  onHit(e: Entity, damage: number, heavy: boolean, crit = false) {
    this.L.playerView.practiceHit(e, damage, heavy);
    mantleGain(crit ? 1.7 : 1.1);
    const el = weaponElement();
    if (el) elementHit(e, el, damage, this.p.face, heavy, damage);
    if (this.p.mantleT > 0 && el !== 'shadow') elementHit(e, 'shadow', damage * 0.6, this.p.face, heavy, damage);
    this.gain(1.4);
    if (heavy) this.L.echoAssist(e);
    if (e.dying) { killBlow(this.actor, e, -1.2, 0.8); mantleGain(4); if (this.p.mantleT > 0 && Math.random() < 0.4) this.L.after(0.6, () => riseAsShadow(e)); }
  }
  onSwing(heavy: boolean, air: boolean) {
    if (this.p.water.swimming) return;
    this.waveN++;
    const tier = powerTier(), p = this.p;
    if (p.mantleT > 0 && this.pursuitCd <= 0) {
      const t = this.L.nearestEnemy(p.x, p.y, 245, p.face);
      if (t && Math.abs(t.x - p.x) > t.body.w / 2 + 28 && this.L.playerView.blinkToFoe(t)) this.pursuitCd = 0.55;
    }
    if (!air && p.mantleT <= 0 && (tier >= 6 || tier >= 5 && this.waveN % 3 === 0 || tier >= 3 && heavy)) this.L.spawnLightWave(p.x + p.face * 16, p.feet - 22, p.face, tier >= 6 ? 1.6 : 1);
  }
  throwWeapon() {
    if (this.throwCd > 0 || this.weaponFlight) return false;
    const t = this.L.nearestEnemy(this.p.x, this.p.y, 350, this.p.face);
    this.throwCd = 2.4; this.weaponFlight = this.L.add(new ChainBlade(this.actor, t)); sfx('swing'); return true;
  }
  weaponImpact(t: Entity) {
    this.weaponFlight = null;
    if (!t.dying && this.p.mantleT > 0 && this.L.playerView.blinkToFoe(t)) { this.p.grantInvuln(0.3); this.p.startTechnique(this.p.moves.combo[1]); }
  }
  private render() {
    const p = this.p, g = this.g.clear(), tier = powerTier(), el = weaponElement();
    const color = p.mantleT > 0 ? 0xb45cff : el ? ELEMENT_COLORS[el] : 0xffd27a;
    void g;
    const shown = (tier >= 2 || p.mantleT > 0 || p.state === 'transform') && !p.dead && p.sprite.visible;
    this.aura.setVisible(shown);
    if (shown) {
      // Stronger tiers glow a little wider and brighter; the Mantle's own light comes from Visuals.
      const a = (p.mantleT > 0 ? 0.1 : 0.05 + tier * 0.012) * (settings.reduceFlashes ? 0.6 : 1 + Math.sin(G.time * 2.2) * 0.12);
      this.aura.setTint(color).setPosition(p.x, p.feet - 20).setDisplaySize(40 + tier * 5, 58 + tier * 4).setAlpha(a);
    }
    for (let i = 0; i < this.ghostSprites.length; i++) {
      const s = this.ghostSprites[i], v = this.ghosts[i]; s.setVisible(!!v);
      if (v) s.setPosition(v.x, v.y).setTexture(p.sprite.texture.key,p.sprite.frame.name).setOrigin(p.sprite.originX,p.sprite.originY).setScale(p.sprite.scaleX,p.sprite.scaleY).setFlipX(v.face < 0).setAlpha(v.a * 0.55).setTint(color);
    }
    p.sprite.setVisible(!this.fin?.hidden);
  }
  destroy() { this.g.destroy(); this.aura.destroy(); for (const s of this.ghostSprites) s.destroy(); }
}
