// Elior in Phaser: an Arcade body (12×34, feet at its bottom) with his PNG
// sheet drawn over it. Movement numbers come from the original game
// (remnant/src/game/player.ts): run 142, jump 430, gravity 1500, max fall 560,
// coyote 0.1 s, jump buffer 0.16 s, shorter hops when jump is let go.
// Combat follows the shared weapon definitions: ground and air routes,
// Phantom Step, charged blows, parries, buffs, Balm and the selected skills.

import { trank, heroLevel } from './archer';
import Phaser from 'phaser';
import { Bow } from './bow';
import { StyleMeter, STYLE_NAMES, RANKS, type CombatStyle, type PlayableHero } from './style';
import { actionAtlas, actionFrame, ACTION_CELL, ACTION_FOOT } from './actionArt';
import { ACTION_RATE } from './pace';
import { settings } from '../classic/shim/settings';
import { T, TILE, isSolid } from '../shared';
import { sovereignDamage } from '../../../remnant/src/game/balance';
import { MOVESETS, FISTS, extraFor, type AttackDef } from '../../../remnant/src/game/weapons';
import { dayCount } from './day';
import { CHAINS, ChainFx, hasChains, isChainMove, HOOK_RANGE, HOOK_MIN, HOOK_CD, HOOK_SPEED, PULL_SPEED, HOOK_DMG, chainBurn, hookRange } from './chains';
import { fx } from '../../../remnant/src/render/fx';
import { skillRank } from '../../../remnant/src/game/state';
import { SKILLS, skillSlots, castSkill, isArcherSkill, archerUnlocked, ARCHER, type AnySkillId } from './abilities';
import type { WorldApi, Blow, FoeLike } from './types';
import { makeSwim, DASH_T, DASH_V } from '../../../remnant/src/game/swim';
import { SWIM_SPEED, SWIM_ACCEL, FLOAT_DEPTH } from '../../../remnant/src/game/water';
import { input } from '../../../remnant/src/core/input';
import { G } from '../classic/shim/ctx';
import { haptic } from '../../../remnant/src/core/haptics';
import { valorTrack } from '../../../remnant/src/game/valor';
import { runBlessings } from '../../../remnant/src/game/blessings';
import type { HeroPowers } from '../classic/hero';
import { Dawn, STAB_T } from './dawn';
import { wears } from './psalms';

export const GRAV = 1500;
const MAX_FALL = 560;
const RUN = 142;
/**
 * Caps on how fast levels, gear and the forms can make him (the owner's call: past level 400 the fights blurred).
 * The weapon's own tempo (a greatsword's weight, a blade's quickness) still applies on top of the attack cap.
 */
const MAX_RUN = 1.35, MAX_ASPD = 1.5;
const JUMP_V = 430;
const COYOTE = 0.1;
const BUFFER = 0.16;
const DODGE_V = 300;
const DODGE_T = 0.32;
/** Covenant Energy: the original's regeneration, gain per landed blow and per perfect parry. */
const CE_REGEN = 2.6, CE_HIT = 2.4, CE_PARRY = 5;

type Swing = AttackDef & { t: number; force: number; reach: number; heavy: boolean };
const swing = (a: AttackDef, speed = 1): Swing => ({ ...a, t: a.dur / speed, force: a.poise / 14, reach: a.box.w, heavy: !!a.finisher || a.id === 'heavy' });
/** Charge levels: the hold needed, and the original's damage and poise scales. */
// Hit-stop by weight, shortest first: light, combo ender, heavy, crit, parry.
// Hit-stop by weight. A light blow holds about one 60 Hz frame (12 ms was under one, so it never showed); the
// heavier tiers climb from there to the parry's tenth of a second.
const STOP = { light: 0.022, ender: 0.04, heavy: 0.06, crit: 0.075, parry: 0.1 };
const CHARGE_AT = [0, 0.35, 0.85, 1.4];
const CHARGE_MULT = [1, 1.35, 1.8, 2.5];

/** Sheet frames (4×4, 128 px): idle 0–3, run 4–7, rise 8, fall 9, wind-up 10, strike 11, dodge 12–13, hurt 14, cast 15. */
const FRAME = 128, FOOT = 120, DRAW = 56;

type State = 'free' | 'attack' | 'hook' | 'charge' | 'parry' | 'block' | 'heal' | 'cast' | 'dodge' | 'airdash' | 'phantom' | 'plunge' | 'execute' | 'transform' | 'scripted' | 'swim' | 'bow' | 'hurt' | 'dead';

export class Player {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Sprite;
  slash: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Graphics;
  /** The charge, guard, buff and mote glows, drawn from the impact art (V02) instead of circles. */
  private glow: Record<'charge' | 'guard' | 'buff' | 'mote', Phaser.GameObjects.Image>;
  readonly styleMeter = new StyleMeter();
  readonly bow: Bow;
  readonly dawn: Dawn;
  private switchCd = 0;
  private trail: { sprite:Phaser.GameObjects.Sprite; life:number }[] = [];
  private trailT = 0;
  state: State = 'free';
  face = 1;
  powers?: HeroPowers;
  mantleT = 0;
  /** The Unshorn, the third transformation (classic/hero.ts ascend): seconds left, and its length. */
  formT = 0;
  formMax = 0;
  /** Set by a scripted beat-down: blows still land, but cannot take the last of his health. */
  deathless = false;
  /** A cutscene draws him itself (the Unshorn's awakening): the sprite steps aside. */
  staged = false;
  scriptX: number | null = null;
  scriptSpeed = 70;
  water = makeSwim();
  get hp() { return this.w.save.hp; }
  set hp(v: number) { this.w.save.hp = v; }
  maxHp: number;
  maxCe: number;
  /** Shield of Faith: while positive, every blow is blocked. */
  shieldT = 0;
  /** After a perfect parry, the next blow is a counter: certain to be critical, and harder. */
  counterT = 0;
  /** Skill cooldowns, seconds left. */
  cds: Record<AnySkillId, number> = Object.fromEntries(Object.keys(SKILLS).map((id) => [id, 0])) as Record<AnySkillId, number>;
  lion = 0;
  armorLight = 0;
  mendT = 0;
  veiled = 0;
  untouchable = 0;
  /** Blows the Psalm of the Refiner has made certain to crit. */
  psalmCrits = 0;
  /** Seconds this hero has lived, for timed marks. */
  private clock = 0;
  /** Air dashes and air jumps a landing restores: the Psalms of the Open Gate and the Four Winds add one each. */
  private airDashes() { return wears(this.w.save, 'open_gate') ? 2 : 1; }
  private airJumpCount() { return this.w.save.keyItems.includes('eagle_wings') ? (wears(this.w.save, 'four_winds') ? 2 : 1) : 0; }
  sinceHurt = 0;
  private vigilParryCd = 0;
  private airAttacks = 0;
  private airDash = 1;
  private airJumps = 0;
  sinceDodge = 99;
  private recentHit = 0;
  private linger = '';
  private lingerT = 0;
  private heavyQueued = false;
  /** The Sundered Chains (game/chains.ts): a chain press waiting on the swing in progress, the hook's cooldown, the
   * one wheel of fire a leap allows, and the hook in flight. */
  private chainQueued = false;
  hookCd = 0;
  private airChain = false;
  private chainFx: ChainFx;
  private hook: { f: FoeLike | null; phase: 'throw' | 'yank' | 'fly'; cx: number; cy: number; T: number } = { f: null, phase: 'throw', cx: 0, cy: 0, T: 0.1 };
  private hitSeg = -1;
  private swung = false;
  phantomN = 0;
  private phantomT = 0;
  private phantomLast: FoeLike | null = null;
  private phantomStruck = new Set<FoeLike>();
  private phantomTarget: FoeLike | null = null;
  private phantomTo: { x: number; y: number } | null = null;
  comboHits = 0;
  private comboT = 0;
  chargeLvl = 0;
  private st = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private combo = 0;
  private queued = false;
  private hitDone = new Set<object>();
  private invuln = 0;
  private dodgeCd = 0;
  /** The Unshorn's Cloud Step: its cooldown and the two clones it leaves striking. */
  private cloudCd = 0;
  /** When the last impact frame flashed (the playtime clock). */
  private impactFrameAt = -1;
  private clones: { sprite: Phaser.GameObjects.Sprite; t: number; foe: FoeLike | null; struck: boolean }[] = [];
  private parryT = 0;
  private parryCd = 0;
  private healDone = false;
  private castId: AnySkillId | null = null;
  /** Arriving from a swap with an Echo: the next blow within this time lands half again harder. */
  swapStrikeT = 0;
  /** While positive, one-way platforms let Elior drop through. */
  dropT = 0;
  private stride = 0;
  private visualClip = '';
  private visualTime = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private landT = 0;
  private visualX = NaN;
  /** Squash and stretch on a spring (`sq` > 0 stretches tall), and a lean into speed, in degrees. */
  private sq = 0;
  private sqV = 0;
  private leanA = 0;
  private atk: Swing = swing(MOVESETS.blade.combo[0]);
  private atkMult = 1;
  /** Which button the charge is held on (released to swing). */
  private chargeKey: 'attack' | 'heavy' = 'attack';

  constructor(private w: WorldApi, x: number, feet: number, face = 1) {
    const sc = w.sc;
    this.rect = sc.add.rectangle(x, feet - 17, 12, 34, 0xffffff, 0);
    sc.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setGravityY(GRAV).setMaxVelocityY(MAX_FALL);
    this.body.setCollideWorldBounds(true);
    this.sprite = sc.add.sprite(x, feet, 'elior', 0).setOrigin(0.5, FOOT / FRAME).setScale(DRAW / FRAME).setDepth(10);
    this.slash = sc.add.image(x, feet, 'vfx-slashes', 0).setDepth(11).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.aura = sc.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    const glow = () => sc.add.image(x, feet, 'vfx-impacts', 0).setDepth(12).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.glow = { charge: glow(), guard: glow(), buff: glow(), mote: glow() };
    this.maxHp = w.d.maxHp;
    this.maxCe = w.d.maxCe;
    this.hp = w.save.hp > 0 ? Math.min(w.save.hp, this.maxHp) : this.maxHp;
    this.face = face;
    this.chainFx = new ChainFx(sc);
    this.bow = new Bow(w, this);
    this.dawn = new Dawn(w, this, this.bow);
    this.bow.dawn = this.dawn;
    this.trail = Array.from({length:4},()=>({sprite:sc.add.sprite(x,feet,'elior',0).setDepth(9).setVisible(false).setTint(0xa99ad7),life:0}));
  }

  get hero(): PlayableHero { return this.w.save.playableHero === 'tirzah' ? 'tirzah' : 'elior'; }
  get combatStyle(): CombatStyle { const s = this.w.save.combatStyle; return s === 'wraith' || s === 'sentinel' ? s : 'vanguard'; }
  switchHero() {
    if (this.switchCd > 0 || G.paused || G.inCutscene || this.dead || !['free', 'swim'].includes(this.state)) { this.w.toast('Switch after the current move.'); return false; }
    // Each hero has her own maximum; the health left carries over (capped), so a switch never heals.
    this.w.save.playableHero = this.hero === 'elior' ? 'tirzah' : 'elior';
    this.w.refreshStats();
    this.switchCd = 0.8; this.bow.cancel(); this.w.controls.flush();
    this.w.spark(this.x,this.y,this.hero === 'tirzah' ? 0xa6efdc : 0xffd27a,12);
    this.w.toast(this.hero === 'tirzah' ? 'Tirzah · bow and arrow · hold Strike to charge; Up + Strike for spread' : 'Elior · ' + STYLE_NAMES[this.combatStyle]);
    return true;
  }
  noteStyle(move:string,air=!this.onGround) {
    const rank=this.styleMeter.rank;this.styleMeter.hit(move,air);this.comboT=1.7;
    this.w.save.bestStyle=Math.max(this.w.save.bestStyle??0,this.styleMeter.rank);
    if(this.styleMeter.rank>rank)this.w.floatText(this.x,this.body.top-14,RANKS[this.styleMeter.rank]+' STYLE','#f6dea0');
  }
  cycleStyle() {
    if (G.paused || G.inCutscene || this.dead || !['free', 'swim'].includes(this.state)) return false;
    const styles: CombatStyle[] = ['vanguard','wraith','sentinel'];
    this.w.save.combatStyle = styles[(styles.indexOf(this.combatStyle)+1)%3];
    this.w.toast(STYLE_NAMES[this.combatStyle]); return true;
  }

  die() { if (this.dead) return; if (this.w.partnerRevive?.()) return; this.hp = 0; this.state = 'dead'; this.st = 0; this.body.setVelocity(0, -120); }

  get x() { return this.body.center.x; }
  get feet() { return this.body.bottom; }
  get y() { return this.body.center.y; }
  get dead() { return this.state === 'dead'; }
  get onGround() { return this.body.blocked.down || this.body.touching.down; }
  get vulnerable() { return !(this.water.swimming && this.water.dashT > 0.06 && this.water.dashT < 0.28) && this.invuln <= 0 && this.untouchable <= 0 && !['dead', 'phantom', 'execute', 'transform'].includes(this.state) && !(this.state === 'attack' && ['pstrike', 'cross'].includes(this.atk.id) && this.st < 0.12) && !(this.state === 'dodge' && this.st < DODGE_T - 0.04) && !(this.state === 'airdash' && this.st < 0.15); }
  get ce() { return this.w.save.ce; }
  get moves() { return this.formT > 0 ? FISTS : MOVESETS[this.w.d.family]; }
  /** A blow's base: the original's attack from stats and gear, its melee multiplier and the level's power tier. */
  power() { const d = this.w.d; return d.atk * d.meleeMult * sovereignDamage(heroLevel(this.w.save)) * (this.lion > 0 ? 1.35 : 1) * (this.powers?.multiplier ?? 1); }
  /** A Covenant skill's base: attack times the original's ability power. */
  skillPower() { const d = this.w.d; return d.atk * d.abil * sovereignDamage(heroLevel(this.w.save)); }

  /** A moment untouchable (an Echo exchange). */
  grantInvuln(t: number) { this.invuln = Math.max(this.invuln, t); }

  placeAt(x: number, feet: number, face = this.face) {
    this.body.reset(x, feet - 17);
    this.face = face;
    this.state = this.water.swimming ? 'swim' : 'free';
    this.st = 0;
    this.body.setVelocity(0, 0);
    this.queued = this.heavyQueued = false;
    this.linger = '';
    this.visualClip = ''; this.visualTime = this.stride = this.landT = 0;
    this.wasGrounded = true; this.lastVy = 0; this.sq = this.sqV = this.leanA = 0;
    this.visualX=x;
    this.slash.setVisible(false);
  }

  destroy() {
    this.chainFx.destroy();
    this.bow.destroy();
    this.dawn.destroy();
    for(const g of this.trail)g.sprite.destroy();
    this.sprite.destroy();
    this.slash.destroy();
    this.aura.destroy();
    for (const g of Object.values(this.glow)) g.destroy();
    this.rect.destroy();
  }

  /** Spikes and the Veil: a tile hazard under or inside the body. */
  private hazard() {
    const b = this.body;
    const tx0 = Math.floor((b.left + 2) / TILE), tx1 = Math.floor((b.right - 2) / TILE);
    for (let ty = Math.floor(b.top / TILE); ty <= Math.floor((b.bottom - 1) / TILE); ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.w.tileAt(tx, ty);
        if (t === T.Spikes || t === T.Veil) return t;
      }
    return 0;
  }

  update(dt: number) {
    const c = this.w.controls, b = this.body, s = this.w.save;
    const actionDt = dt * ((this.state==='attack'||this.state==='charge'||this.state==='cast'||this.state==='phantom'||this.state==='bow') ? ACTION_RATE : this.state === 'dodge' && this.combatStyle === 'wraith' ? 1.2 : 1);
    this.st += actionDt;
    // The original's heals fill to Elior's limits; each hero keeps her own.
    if (s.hp > this.maxHp) s.hp = this.maxHp;
    this.switchCd = Math.max(0,this.switchCd-dt);
    this.styleMeter.update(dt);
    this.bow.update(dt);
    this.dawn.update(dt);
    this.vigilParryCd = Math.max(0, this.vigilParryCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.hookCd = Math.max(0, this.hookCd - dt);
    this.cloudCd = Math.max(0, this.cloudCd - dt);
    this.stepClones(dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.swapStrikeT = Math.max(0, this.swapStrikeT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    for (const k of Object.keys(SKILLS) as AnySkillId[]) this.cds[k] = Math.max(0, this.cds[k] - dt * this.w.d.skillRecharge * runBlessings.recharge);
    this.lion = Math.max(0, this.lion - dt);
    this.armorLight = Math.max(0, this.armorLight - dt);
    this.veiled = Math.max(0, this.veiled - dt);
    this.untouchable = Math.max(0, this.untouchable - dt);
    this.clock += dt;
    this.sinceHurt += dt;
    if (!this.dead) {
      const mend = Math.min(dt, this.mendT);
      this.mendT = Math.max(0, this.mendT - dt);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * (mend * 0.03 + (this.sinceHurt >= 4 ? this.w.d.hpRegen * dt : 0)));
    }
    this.sinceDodge += dt;
    this.recentHit = Math.max(0, this.recentHit - dt);
    this.lingerT = Math.max(0, this.lingerT - dt);
    if (!this.lingerT) this.linger = '';
    this.phantomT = Math.max(0, this.phantomT - dt);
    if (!this.phantomT && this.state !== 'phantom') { this.phantomN = 0; this.phantomStruck.clear(); }
    this.comboT = Math.max(0, this.comboT - dt);
    if (!this.comboT) this.comboHits = 0;
    if (this.onGround) { this.airAttacks = 0; this.airChain = false; this.airDash = this.airDashes(); this.airJumps = this.airJumpCount(); }
    if (this.state !== 'dead' && (s.flags.relic_taken || !this.powers?.L.storyEnabled)) s.ce = Math.min(this.maxCe, s.ce + CE_REGEN * this.w.d.ceRegen * dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuf = c.pressed('jump') ? BUFFER : Math.max(0, this.jumpBuf - dt);

    if (this.state === 'dead') { b.setVelocityX(b.velocity.x * 0.9); this.draw(dt); return; }
    this.powers?.senseWater(dt);
    if (this.powers?.update(dt)) { this.draw(dt); return; }

    if (this.scriptX !== null) { const dx = this.scriptX - this.x; if (Math.abs(dx) < 3) { this.scriptX = null; b.setVelocityX(0); } else { this.face = Math.sign(dx); b.setVelocityX(this.face * this.scriptSpeed); } this.draw(dt); return; }
    if (G.inCutscene && this.state === 'free') { b.setVelocityX(0); this.draw(dt); return; }
    if (!G.inCutscene && this.powers) this.powers.clip = '';
    // Dawnstep: Dodge while an arrow's mark is fresh blinks her behind that foe.
    if (this.hero === 'tirzah' && !G.inCutscene && (this.state === 'free' || this.state === 'bow') && c.pressed('dodge') && this.dawn.ready()) {
      this.bow.cancel(); if (this.state === 'bow') this.releaseState();
      this.dawn.step(); this.w.legends?.onDodge(); this.draw(dt); return;
    }
    if (this.hero === 'tirzah' && !G.inCutscene && this.bow.control(dt * ACTION_RATE)) {
      if (c.pressed('dodge') || c.pressed('parry')) { this.bow.cancel(); this.releaseState(); this.defence(); }
      // Holding a draw in the air slows her fall.
      const aloftDraw = this.state === 'bow' && this.bow.drawing && !this.onGround;
      if (aloftDraw && b.velocity.y > 110) b.setVelocityY(110);
      b.setGravityY(this.water.swimming ? 0 : this.glide() ? GRAV * 0.12 : aloftDraw ? GRAV * 0.3 : GRAV);
      const hz=this.hazard();if(hz&&this.vulnerable)this.hurt({dmg:hz===T.Spikes?18:10,dir:0,hazard:true});
      this.draw(dt); return;
    }
    if (this.state === 'swim') { this.swim(dt); this.draw(dt); return; }
    // Short hops: letting go of jump on the way up pulls Elior down sooner.
    const airSwing = (this.state === 'attack' || this.state === 'charge') && !this.onGround;
    b.setGravityY(this.water.swimming ? 0 : this.glide() ? GRAV * 0.12 : this.state === 'phantom' || this.state === 'airdash' || this.state === 'hook' ? 0 : airSwing && this.atk.id !== 'rend' ? GRAV * 0.35 : b.velocity.y < 0 && !c.down('jump') ? GRAV * 1.9 : GRAV);

    switch (this.state) {
      case 'free': {
        const ax = c.axis;
        const accel = this.onGround ? 1400 : 900;
        b.setVelocityX(Phaser.Math.Linear(b.velocity.x, ax * RUN * Math.min(MAX_RUN, this.w.d.speed * (this.formT > 0 ? 1.3 : this.mantleT > 0 ? 1.25 : 1)), Math.min(1, (accel * dt) / RUN)));
        if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
        if (this.jumpBuf > 0 && c.down('down') && this.onGround && this.standingOnOneWay()) {
          this.dropT = 0.25;
          this.jumpBuf = 0;
        } else if (this.jumpBuf > 0 && this.coyote > 0) {
          b.setVelocityY(-JUMP_V);
          this.jumpBuf = 0;
          this.coyote = 0;
        } else if (this.jumpBuf > 0 && this.airJumps > 0) {
          this.airJumps--; this.jumpBuf = 0; b.setVelocityY(-JUMP_V * 0.9);
        }
        if (this.defence()) break;
        if (this.chainPressed()) this.chooseChain(this.linger);
        else if (c.pressed('heavy') && !c.down('up')) {
          if (this.onGround && [this.moves.combo[2].id, this.moves.extra.id].includes(this.linger)) this.startMove(this.moves.storm);
          else if (!this.onGround) this.startPlunge();
          else this.startCharge('heavy');
        }
        else if (c.pressed('attack')) this.chooseAttack();
        else if (c.pressed('heal')) this.startHeal();
        else this.trySkill();
        break;
      }
      case 'attack': this.updateAttack(actionDt); break;
      case 'hook': this.updateHook(); break;
      case 'charge': {
        b.setVelocityX(b.velocity.x * 0.8);
        if (Math.abs(c.axis) > 0.3) this.face = Math.sign(c.axis);
        const charge = this.st * (skillRank(s, 'w_mastery') ? 1.35 : 1);
        const lvl = charge >= CHARGE_AT[3] && skillRank(s, 'w_mastery') ? 3 : charge >= CHARGE_AT[2] ? 2 : charge >= CHARGE_AT[1] ? 1 : 0;
        if (lvl > this.chargeLvl) {
          this.chargeLvl = lvl;
          this.w.spark(this.x + this.face * 4, this.body.top - 4, lvl >= 2 ? 0xfff1c4 : 0xe8c27a, 6 + lvl * 4);
        }
        if (this.defence()) break;
        if (!c.down(this.chargeKey)) this.release();
        break;
      }
      case 'parry':
        b.setVelocityX(b.velocity.x * 0.7);
        // A perfect parry opens straight into the riposte.
        if (this.counterT > 0 && c.pressed('attack')) { this.chooseAttack(); break; }
        if (this.counterT > 0 && c.pressed('heavy')) { this.startCharge('heavy'); break; }
        // Held past the window, the guard stays up as a block.
        if (this.st >= 0.3) this.state = c.down('parry') ? 'block' : 'free';
        break;
      case 'block':
        b.setVelocityX(b.velocity.x * 0.7);
        if (!c.down('parry')) this.toFree();
        break;
      case 'heal':
        b.setVelocityX(Phaser.Math.Linear(b.velocity.x, c.axis * 30, 0.2));
        if (!this.healDone && this.st >= 0.5) {
          this.healDone = true;
          const amt = Math.round(this.maxHp * 0.42 * (skillRank(s, 'g_balm') ? 1.15 : 1));
          this.hp = Math.min(this.maxHp, this.hp + amt);
          this.w.floatText(this.x, this.body.top - 10, `+${amt}`, '#9fe39a');
          this.w.spark(this.x, this.y, 0x9fe39a, 12);
        }
        if (this.st >= 0.9) this.toFree();
        else if (this.healDone && c.pressed('dodge')) this.startDodge();
        break;
      case 'cast':
        b.setVelocityX(b.velocity.x * 0.7);
        if (this.castId && this.st >= 0.12) {
          if (isArcherSkill(this.castId)) this.bow.kit.cast(this.castId); else castSkill(this.w, this.castId);
          this.castId = null;
        }
        // Once the skill is loosed, another can follow straight on.
        if (!this.castId && this.st >= 0.2 && this.trySkill()) break;
        if (this.st >= 0.3) this.toFree();
        break;
      case 'dodge':
        b.setVelocityX(this.face * DODGE_V * (this.combatStyle === 'wraith' ? 1.2 : 1) * (1 - (this.st / DODGE_T) * 0.5));
        if (c.pressed('attack') && this.st > 0.08) this.startMove(this.moves.dash);
        else if (this.st >= DODGE_T) { this.sinceDodge = 0; this.toFree(); }
        break;
      case 'airdash':
        b.setVelocity(this.face * 360, 0);
        if (c.pressed('attack')) this.chooseAttack();
        // The Psalm of the Wind carries the dash 40% further.
        else if (this.st >= (wears(this.w.save, 'wind') ? 0.28 : 0.2)) this.toFree();
        break;
      case 'phantom':
        b.setVelocity(0, 0);
        if (this.st >= 0.075) this.finishPhantom();
        break;
      case 'plunge':
        b.setVelocityX(b.velocity.x * 0.9);
        b.setVelocityY(Math.max(520, b.velocity.y));
        if (this.strike() || this.spikesBelow()) this.pogo();
        else if (this.onGround && this.st > 0.05) this.landPlunge();
        else if (this.st > 1.8) this.toFree();
        break;
      case 'hurt':
        b.setVelocityX(b.velocity.x * 0.88);
        if (this.st >= 0.3) this.toFree();
        break;
    }

    const hz = this.hazard();
    if (hz && this.vulnerable) {
      this.hurt({ dmg: hz === T.Spikes ? 18 : 10, dir: 0, hazard: true });
      if (hz === T.Spikes) b.setVelocityY(-260);
    }
    this.draw(dt);
  }

  /** Dodge or parry, from free or from the tail of a swing. */
  private defence() {
    const c = this.w.controls;
    if (c.pressed('dodge')) {
      if (this.formT > 0 && this.cloudStep()) return true;
      if (this.canPhantom()) { this.startPhantom(); return true; }
      if (!this.onGround && this.airDash > 0) { this.airDash--; this.state = 'airdash'; this.st = 0; return true; }
      if (this.onGround && this.dodgeCd <= 0) { this.startDodge(); return true; }
    }
    if (c.pressed('parry') && this.parryCd <= 0 && this.onGround) { this.startParry(); return true; }
    return false;
  }

  private trySkill() {
    const c = this.w.controls, s = this.w.save;
    if (this.powers?.L.storyEnabled && !s.flags.relic_taken) return false;
    const n = c.pressed('skill1') ? 0 : c.pressed('skill2') ? 1 : c.pressed('skill3') ? 2 : -1;
    if (n < 0) return false;
    const id = skillSlots(s)[n];
    if (isArcherSkill(id)) { if (!archerUnlocked(s, id)) { this.w.toast(`${ARCHER[id].name} comes at level ${ARCHER[id].level}.`); return false; } }
    else if (!id || !s.abilities.includes(id)) { this.w.toast(this.hero === 'tirzah' ? "Choose Tirzah's abilities in the Echo wheel → Heroes." : 'Choose an ability in Menu → Elior → Abilities.'); return false; }
    const def = SKILLS[id];
    if (this.cds[id] > 0) return false;
    if (isArcherSkill(id) && !this.bow.kit.canCast(id)) return false;
    if (id === 'blink_strike' || id === 'chain_snare') {
      const t = this.target(260, true);
      if (!t || !this.blinkSpot(t)) { this.w.toast('No reachable enemy ahead.'); return false; }
    }
    // Covenant Archer: her abilities cost a quarter less.
    const cost = isArcherSkill(id) && trank(s, 't_covenant') ? Math.round(def.cost * 0.75) : def.cost;
    if (s.ce < cost) { this.w.floatText(this.x, this.body.top - 8, 'Not enough Covenant Energy', '#9fc4ff'); return false; }
    s.ce -= cost;
    this.cds[id] = def.cd;
    this.castId = id;
    this.w.flashLight?.(this.x, this.feet - 30, 160, '#' + SKILLS[id].color.toString(16).padStart(6, '0'), 0.45);
    this.state = 'cast';
    this.st = 0;
    this.slash.setVisible(false);
    return true;
  }

  private standingOnOneWay() {
    const ty = Math.floor((this.body.bottom + 1) / TILE);
    return this.w.tileAt(Math.floor(this.x / TILE), ty) === T.OneWay;
  }

  private toFree() {
    this.state = this.water.swimming ? 'swim' : 'free';
    this.st = 0;
    this.slash.setVisible(false);
  }

  private startAttack(n: number) {
    this.startMove(this.onGround ? this.moves.combo[n] : this.moves.air[Math.min(n, 2)]);
  }

  private startMove(a: AttackDef) {
    const speed = Math.min(MAX_ASPD, this.w.d.aspd * (this.lion > 0 ? 1.1 : 1) * (this.formT > 0 ? 1.25 : this.mantleT > 0 ? 1.2 : 1)) * (isChainMove(a.id) ? 1 : this.moves.speed);
    this.atk = swing(a, speed);
    this.atkMult = 1;
    this.combo = this.moves.combo.findIndex((v) => v.id === a.id);
    this.hitSeg = -1;
    this.swung = false;
    this.linger = '';
    // Each swing turns with the stick, or toward a foe behind when none is ahead (Phantom strikes keep the side they chose).
    if (a.id !== 'pstrike' && a.id !== 'cross') this.face = this.swingFacing();
    this.powers?.onSwing(!!a.finisher, !!a.air);
    this.begin();
    this.w.playEffect(a.sfx);
    if (a.rise && (this.w.controls.down('up') || a.forceRise)) this.body.setVelocityY(a.rise);
    if (a.air && this.body.velocity.y > 0) this.body.setVelocityY(this.body.velocity.y * 0.2);
  }

  /** Where the next swing or shot points: the held direction, else the nearest foe behind if nothing is ahead. */
  swingFacing() {
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) return Math.sign(ax);
    let ahead = false, behind = 0, best = 90;
    for (const f of this.w.foes()) {
      if (!f.alive || Math.abs(f.box.centerY - this.y) > 50) continue;
      const dx = f.x - this.x;
      if (Math.sign(dx) === this.face || Math.abs(dx) < 6) { if (Math.abs(dx) < 110) ahead = true; }
      else if (Math.abs(dx) < best) { best = Math.abs(dx); behind = Math.sign(dx); }
    }
    return !ahead && behind ? behind : this.face;
  }

  /** The same routes for every weapon family, including deliberate pauses. */
  private chooseAttack() {
    const m = this.moves, c = this.w.controls;
    if (this.phantomN >= 3 && this.phantomT > 0 && this.ce >= 10) { this.startCross(); return; }
    if (this.counterT > 0) { this.startMove({ ...m.counter, dmg: m.counter.dmg * (skillRank(this.w.save, 'g_counter') ? 1.7 : 1) }); return; }
    if (this.state === 'free' && this.powers?.tryExecution()) return;
    if (!this.onGround) {
      if (c.down('down')) this.startPlunge();
      else if (this.linger === m.air[2].id || this.airAttacks >= 3) this.startMove(m.rend);
      else { this.startMove(m.air[this.airAttacks]); this.airAttacks++; }
    } else if (this.linger === m.combo[0].id) this.startMove(m.combo[1]);
    else if (this.linger === m.combo[1].id) this.startMove(0.62 - this.lingerT < 0.12 ? m.combo[2] : m.flurry);
    else if (this.linger === m.combo[2].id && skillRank(this.w.save, 'w_relentless')) this.startMove(extraFor(this.w.d.family));
    else if (this.linger === m.dash.id) this.startMove(m.comet);
    else if (c.down('up')) this.startMove(m.launch);
    else if (this.sinceDodge < 0.18) this.startMove(m.dash);
    else this.startAttack(0);
  }

  private updateAttack(dt: number) {
    const a = this.atk, c = this.w.controls, b = this.body, m = this.moves, u = this.st / a.t;
    if (this.water.swimming) {
      b.setVelocityX(b.velocity.x * Math.exp(-3 * dt));
      if (u >= a.hit[0] && (this.st - dt) / a.t <= a.hit[1]) this.strike();
      if (c.pressed('dodge')) { this.swimDash(); return; }
      if (u >= 1) this.toFree();
      return;
    }
    if (c.pressed('attack')) this.queued = true;
    if (this.chainPressed()) this.chainQueued = true;
    else if (c.pressed('heavy')) this.heavyQueued = true;
    if (a.dive && u >= a.hit[0]) b.setVelocity(this.face * 230, Math.max(470, b.velocity.y));
    else if (a.lunge && a.lungeT && u >= a.lungeT[0] && u <= a.lungeT[1] && (this.onGround || a.id === 'dash' || a.id === 'flurry')) {
      const near = this.w.foes().some((f) => f.alive && Math.abs(f.x - this.x) < 24 && Math.abs(f.box.centerY - this.y) < 40);
      b.setVelocityX(this.face * a.lunge * ACTION_RATE * (near ? 0.25 : 1));
    } else b.setVelocityX(Phaser.Math.Linear(b.velocity.x, a.air ? c.axis * 70 : 0, Math.min(1, dt * 14)));
    // Intersect the window, rather than requiring a frame inside it at high attack speed.
    if (u >= a.hit[0] && (this.st - dt) / a.t <= a.hit[1]) {
      const last = Math.min((a.multi ?? 1) - 1, Math.floor(Math.max(0, Math.min(0.9999, (u - a.hit[0]) / (a.hit[1] - a.hit[0]))) * (a.multi ?? 1)));
      if (last !== this.hitSeg) {
        for (let seg = this.hitSeg + 1; seg <= last; seg++) {
          this.hitDone.clear();
          this.strike();
        }
        this.hitSeg = last;
      } else this.strike();
      this.swung = true;
      if (a.pull) for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - this.x) < a.pull) {
        const e = (f as FoeLike & { e?: { isBoss: boolean; body: { vx: number } } }).e;
        if (e && !e.isBoss) e.body.vx = Math.sign(this.x - f.x) * 90;
      }
    }
    if (a.dive && this.onGround && this.st > 0.08) { this.landPlunge(); return; }
    if (this.combatStyle === 'vanguard' && this.recentHit > 0 && this.jumpBuf > 0 && !this.water.swimming) {
      this.jumpBuf = 0; this.recentHit = 0; this.airAttacks = 0; this.airDash = this.airDashes();
      this.toFree(); this.body.setVelocityY(-JUMP_V * 0.78); this.noteStyle('jump_cancel',true); return;
    }
    if (c.pressed('dodge') && this.formT > 0 && this.cloudStep()) return;
    if (c.pressed('dodge') && this.recentHit > 0 && this.canPhantom()) { this.startPhantom(); return; }
    if (u >= a.cancel && this.defence()) return;
    if (u >= a.cancel) {
      // The chains answer out of any swing: sword into chains, and chains into each other.
      if (this.chainQueued) { this.chainQueued = false; if (this.chooseChain(a.id)) return; }
      if (this.heavyQueued && this.onGround && [m.combo[2].id, m.extra.id].includes(a.id)) { this.startMove(m.storm); return; }
      if (this.heavyQueued && a.air && a.id === m.air[2].id) { this.startMove(m.rend); return; }
      if (a.id === m.combo[2].id && c.down('attack') && !this.queued && this.onGround) { this.startMove(m.storm); return; }
      if (this.queued) {
        if (a.id === 'pstrike' && this.phantomN >= 3 && this.ce >= 10) { this.startCross(); return; }
        if (a.id === m.dash.id) { this.startMove(m.comet); return; }
        if (a.air) {
          if (this.airAttacks < 3) { this.startMove(m.air[this.airAttacks++]); return; }
          if (a.id === m.air[2].id) { this.startMove(m.rend); return; }
        } else if (this.onGround) {
          const n = m.combo.findIndex((v) => v.id === a.id) + 1;
          if (n > 0 && n < m.combo.length) { this.startMove(m.combo[n]); return; }
          if (n === m.combo.length && skillRank(this.w.save, 'w_relentless')) { this.startMove(extraFor(this.w.d.family)); return; }
          this.startMove(m.combo[0]); return;
        }
        this.queued = false;
      }
      if (!this.heavyQueued && this.onGround && !a.air && Math.abs(c.axis) > 0.5) { this.toFree(); return; }
    }
    if (u >= 1) {
      if (a.auto) { const next = m[a.auto as keyof typeof m]; if (typeof next === 'object' && !Array.isArray(next)) { this.startMove(next); return; } }
      if (a.id === m.combo[0].id && c.down('attack') && this.onGround) { this.startCharge('attack'); return; }
      this.linger = a.id;
      this.lingerT = a.id === m.combo[1].id ? 0.62 : 0.34;
      this.toFree();
    }
  }

  private begin() {
    this.state = 'attack';
    this.st = 0;
    this.queued = false;
    this.heavyQueued = false;
    this.chainQueued = false;
    this.hitDone.clear();
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
  }
  /** Shared cinematic systems return to ordinary Arcade movement here. */
  releaseState() { this.toFree(); this.body.setGravityY(GRAV); }
  startTechnique(a: AttackDef) { this.startMove(a); }
  castPose() { this.state = 'cast'; this.st = 0; this.castId = null; }

  private startCharge(key: 'attack' | 'heavy') {
    this.state = 'charge';
    this.st = 0;
    this.chargeLvl = 0;
    this.chargeKey = key;
    this.slash.setVisible(false);
  }

  /** Let go of a charge: the heavy blow, stronger for every level reached. */
  private release() {
    this.startMove({ ...this.moves.heavy, guardBreak: this.chargeLvl >= 2 || this.moves.heavy.guardBreak });
    this.atkMult = CHARGE_MULT[this.chargeLvl];
    if (this.chargeLvl >= 2) this.w.shake(0.006, 120);
  }

  private startParry() {
    this.state = 'parry';
    this.st = 0;
    this.parryT = this.w.d.parryWin;
    this.parryCd = 0.32;
    this.slash.setVisible(false);
  }

  private startHeal() {
    const s = this.w.save;
    if (!this.onGround) return;
    if (this.powers?.L.story.ch3.rounds.balmSealed) { this.w.toast('Balm is sealed by this run’s rules.'); return; }
    if (s.balm <= 0) { this.w.floatText(this.x, this.body.top - 8, 'No Balm left: rest at an altar', '#ff9a9a'); return; }
    if (this.hp >= this.maxHp) return;
    s.balm--;
    this.state = 'heal';
    this.st = 0;
    this.healDone = false;
  }

  private startDodge() {
    this.w.playEffect('dash');
    this.w.legends?.onDodge();
    this.state = 'dodge';
    this.st = 0;
    this.dodgeCd = 0.45;
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
    this.slash.setVisible(false);
  }

  private startPlunge() { this.startMove(this.moves.plunge); this.state = 'plunge'; this.body.setVelocityY(260); }
  /** Spikes just under a falling plunge: struck, not landed on. */
  private spikesBelow() {
    const b = this.body, ty = Math.floor((b.bottom + 10) / TILE);
    for (let tx = Math.floor((b.left + 2) / TILE); tx <= Math.floor((b.right - 2) / TILE); tx++) if (this.w.tileAt(tx, ty) === T.Spikes) return true;
    return false;
  }
  /** After Hollow Knight: a plunge that strikes a foe or spikes springs back up with the air attacks and air dash restored. */
  private pogo() {
    this.toFree();
    this.body.setVelocityY(-JUMP_V * 0.8);
    this.airAttacks = 0; this.airDash = this.airDashes();
    this.grantInvuln(0.12);
    this.w.burst(this.x, this.feet + 6, 0);
    this.noteStyle('pogo', true);
    haptic('hit');
  }
  private landPlunge() {
    this.w.shake(0.008, 170);
    this.w.spark(this.x, this.feet - 2, 0xffd27a, 20);
    this.startMove({ ...this.moves.plunge, id: 'slam', dur: 0.3, hit: [0, 0.35], box: { x: -40, y: -28, w: 80, h: 32 }, dmg: 1.6, finisher: true });
    this.strike();
    this.w.legends?.onSlam(this.x, this.feet);
  }

  /** Safe destinations and a clear line prevent every blink from crossing walls. */
  canPlace(x: number, feet: number) {
    if (x < 7 || x > this.w.roomW() - 7 || feet < 34) return false;
    for (let ty = Math.floor((feet - 33) / TILE); ty <= Math.floor((feet - 1) / TILE); ty++)
      for (let tx = Math.floor((x - 5) / TILE); tx <= Math.floor((x + 5) / TILE); tx++) {
        const t = this.w.tileAt(tx, ty);
        if (isSolid(t) || t === T.Spikes || t === T.Veil) return false;
      }
    const floor = this.w.tileAt(Math.floor(x / TILE), Math.floor(feet / TILE));
    return floor !== T.Spikes && floor !== T.Veil;
  }
  /** Under the Wings, holding Jump while falling glides (and she can draw while she does). */
  private glide() {
    const on = this.dawn.active && !this.onGround && this.w.controls.down('jump') && this.body.velocity.y > 0;
    if (on) this.body.setVelocityY(Math.min(this.body.velocity.y, 70));
    return on;
  }
  lineOfSight(x: number, y: number) {
    const dx = x - this.x, dy = y - this.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    for (let i = 1; i <= n; i++) if (isSolid(this.w.tileAt(Math.floor((this.x + dx * i / n) / TILE), Math.floor((this.y + dy * i / n) / TILE)))) return false;
    return true;
  }
  /**
   * The Unshorn's Cloud Step: he is gone in a puff of golden cloud and lands behind the nearest foe (within 280 px,
   * the way he faces first), turned to strike, while two fire-gold clones of him, left where he passed, throw a
   * punch of their own. Then the next blow is already on its way.
   */
  cloudStep() {
    if (this.cloudCd > 0) return false;
    const f = this.target(280, true) ?? this.target(280);
    const spot = f ? this.blinkSpotAt(f.x, f.box.bottom, f.box.width / 2) : null;
    if (!f || !spot) return false;
    const x0 = this.x, y0 = this.feet;
    this.cloud(x0, y0);
    this.placeAt(spot.x, spot.y, Math.sign(f.x - spot.x) || this.face);
    this.cloud(this.x, this.feet);
    fx.streak(x0, y0 - 24, this.x, this.feet - 24, '#ffd27a', 0.22, 3);
    this.grantInvuln(0.35);
    this.cloudCd = 0.45;
    this.w.playEffect('dash', { x: this.x, pitch: 1.35 }); this.w.playEffect('whoosh', { x: this.x, pitch: 0.8, vol: 0.7 });
    // Two clones: one where he stood, one on the foe's near side.
    for (const [cx, face] of [[x0, Math.sign(f.x - x0) || 1], [f.x - (this.x - f.x), Math.sign(this.x - f.x) || -1]] as const) this.clone(cx, this.feet, face, f);
    this.releaseState();
    this.startMove(this.moves.combo[1]);
    return true;
  }
  /** A puff of the cloud he rides: gold-white smoke and sparks at his feet. */
  private cloud(x: number, feet: number) {
    fx.dust(x, feet, 12, 2);
    fx.embers(x, feet - 12, 10, '#ffe6a8', 30);
    this.w.burst(x, feet, 2, true, 'vfx-unshorn');
  }
  private clone(x: number, feet: number, face: number, foe: FoeLike) {
    let c = this.clones.find((o) => o.t < 0);
    if (!c) { c = { sprite: this.sprite.scene.add.sprite(0, 0, this.sprite.texture.key).setBlendMode(Phaser.BlendModes.ADD).setDepth(9.5), t: -1, foe: null, struck: false }; this.clones.push(c); }
    c.t = 0; c.foe = foe; c.struck = false;
    c.sprite.setTexture(this.sprite.texture.key, this.sprite.frame.name).setOrigin(this.sprite.originX, this.sprite.originY)
      .setPosition(x, feet).setFlipX(face < 0).setTint(0xffa040).setAlpha(0.8).setVisible(true);
  }
  /** The clones lunge, strike once (a third of a blow each) and burn away. */
  private stepClones(dt: number) {
    for (const c of this.clones) {
      if (c.t < 0) continue;
      c.t += dt;
      const f = c.foe;
      if (f && !c.struck && c.t >= 0.12) {
        c.struck = true;
        const dir = c.sprite.flipX ? -1 : 1;
        if (f.alive && !f.removed) {
          f.hit(Math.round(this.power() * 0.35), dir, 90, false, { poise: 12, kx: dir * 60, ky: -40 });
          this.w.burst(f.x - dir * 6, f.box.centerY, 0, false, 'vfx-unshorn');
          this.w.playEffect('punch', { x: f.x, pitch: 1.15, vol: 0.55 });
        }
        c.sprite.x += dir * 10;
      }
      c.sprite.setAlpha(Math.max(0, 0.8 - c.t * 2));
      if (c.t >= 0.4) { c.t = -1; c.foe = null; c.sprite.setVisible(false); }
    }
  }
  blinkSpotAt(x: number, feet: number, halfWidth: number, side = Math.sign(x - this.x) || this.face) {
    if (!this.lineOfSight(x, feet - 20)) return null;
    for (const sign of [side, -side]) for (const lift of [0, -16, -32]) {
      const tx = x + sign * (halfWidth + 20), ty = feet + lift;
      if (this.canPlace(tx, ty) && this.lineOfSight(tx, ty - 20)) return { x: tx, y: ty };
    }
    return null;
  }
  private blinkSpot(f: FoeLike) { return f.alive ? this.blinkSpotAt(f.x, f.box.bottom, f.box.width / 2) : null; }
  private target(range: number, ahead = false) {
    let best: FoeLike | null = null, dist = range;
    for (const f of this.w.foes()) {
      const phase = f as FoeLike & { fighting?: boolean; ward?: boolean };
      if (!f.alive || f.removed || phase.fighting === false || phase.ward || !this.lineOfSight(f.x, f.box.centerY)) continue;
      if (ahead && Math.sign(f.x - this.x) !== this.face && Math.abs(f.x - this.x) > 20) continue;
      const d = Math.hypot(f.x - this.x, (f.box.centerY - this.y) * 0.7);
      if (d < dist) { dist = d; best = f; }
    }
    return best;
  }
  canPhantom() {
    if ((!this.w.save.flags.phantom && this.mantleT <= 0) || (this.recentHit <= 0 && this.phantomT <= 0 && this.mantleT <= 0) || (this.ce < 5 && this.w.save.level < 100 && this.mantleT <= 0)) return false;
    const f = this.phantomTargetForStep();
    return !!f && !!this.blinkSpot(f);
  }
  private phantomTargetForStep() {
    let best: FoeLike | null = null, score = Infinity;
    for (const f of this.w.foes()) {
      const phase = f as FoeLike & { fighting?: boolean; ward?: boolean };
      if (!f.alive || f.removed || phase.fighting === false || phase.ward || Math.abs(f.x - this.x) > 150 || Math.abs(f.box.bottom - this.feet) > 100 || !this.blinkSpot(f)) continue;
      const d = Math.abs(f.x - this.x) + (this.phantomStruck.has(f) ? 250 : 0) + (f === this.phantomLast ? 100 : 0);
      if (d < score) { score = d; best = f; }
    }
    return best;
  }
  startPhantom() {
    const f = this.phantomTargetForStep();
    const spot = f && this.blinkSpot(f);
    if (!f || !spot) return;
    if (this.w.save.level < 100 && this.mantleT <= 0) this.w.save.ce -= 5;
    this.phantomTarget = f; this.phantomTo = spot; this.phantomLast = f;
    this.phantomN++; this.phantomT = 1; this.phantomStruck.add(f);
    this.state = 'phantom'; this.st = 0; this.body.setVelocity(0, 0);
    this.slash.setVisible(false);
    this.w.spark(this.x, this.y, 0xad9aff, 14);
  }
  private finishPhantom() {
    const f = this.phantomTarget, spot = this.phantomTo;
    if (!f || !f.alive || !spot || !this.canPlace(spot.x, spot.y)) { this.toFree(); return; }
    this.placeAt(spot.x, spot.y, Math.sign(f.x - spot.x) || this.face);
    this.w.spark(this.x, this.y, 0xffe6a8, 16);
    this.startMove({ ...this.moves.pstrike, dmg: this.moves.pstrike.dmg * (1 + Math.min(5, this.phantomN - 1) * 0.15) });
    if (this.phantomN === 3) this.w.toast('Judgment Cross ready · STRIKE');
  }
  private startCross() {
    this.w.save.ce -= 10;
    this.phantomN = 0; this.phantomT = 0; this.phantomStruck.clear();
    this.startMove(this.moves.cross);
    this.body.setVelocityY(-120);
    this.w.shake(0.01, 200);
  }

  /** The blade's reach this frame, in front of Elior. */
  private swimDash() {
    const w = this.water, dx = input.axisX, dy = input.axisY, len = Math.hypot(dx, dy);
    if (w.dashCd > 0) return;
    w.dirX = len < 0.2 ? this.face : dx / len; w.dirY = len < 0.2 ? 0 : dy / len;
    w.dashT = DASH_T; w.dashCd = 0.5; this.state = 'swim'; this.w.playEffect('dash');
  }
  private swim(dt: number) {
    const w = this.water, b = this.body, c = this.w.controls;
    b.setGravityY(0); let mx = input.axisX, my = input.axisY, len = Math.hypot(mx, my);
    if (len < 0.2) mx = my = 0; else if (len > 1) { mx /= len; my /= len; }
    if (mx) this.face = Math.sign(mx);
    if (w.dashT > 0) { w.dashT = Math.max(0, w.dashT - dt); const k = 0.45 + 0.55 * w.dashT / DASH_T; b.setVelocity(w.dirX * DASH_V * k + w.flowX, w.dirY * DASH_V * k + w.flowY); }
    else { const speed = SWIM_SPEED * Math.min(MAX_RUN, this.w.d.speed), rest = w.surface + FLOAT_DEPTH;
      const vy = (Math.abs(my) > 0.25 ? my * speed : w.air ? Phaser.Math.Clamp((rest - this.feet) * 3, -26, 80) : -26) + w.flowY;
      const approach = (n: number, target: number) => n + Phaser.Math.Clamp(target - n, -SWIM_ACCEL * dt, SWIM_ACCEL * dt);
      b.setVelocity(approach(b.velocity.x, mx * speed + w.flowX), approach(b.velocity.y, w.air && vy < 0 ? Math.max(vy, (rest - this.feet) * 4) : vy)); }
    if (my > 0.5) this.dropT = 0.1;
    if (c.pressed('jump')) { if (w.air && this.feet - (w.surface + FLOAT_DEPTH) < 12) { w.breachT = 0.4; w.swimming = false; this.state = 'free'; b.setVelocityY(-440); b.setGravityY(GRAV); this.airJumps = this.airJumpCount(); this.airDash = this.airDashes(); this.w.playEffect('splash'); }
      else if (w.strokeCd <= 0) { b.setVelocityY(-210); w.strokeCd = 0.28; this.w.playEffect('swimStroke'); } }
    if (c.pressed('dodge')) this.swimDash();
    else if (c.pressed('parry')) this.startParry();
    else if (c.pressed('attack')) this.startMove({ ...this.moves.combo[0], dur: this.moves.combo[0].dur / 0.72, lunge: 0, ky: 0, launch: false });
    else if (['heavy', 'sub', 'heal', 'ultimate', 'transform', 'skill1', 'skill2', 'skill3'].some(a => c.pressed(a as import('./controls').Action)) && w.deniedT <= 0) { w.deniedT = 1.2; this.w.toast('Not under water. Swim, thrust, parry or dash-stroke.'); }
  }

  // ---------------------------------------------------------------- the Sundered Chains (game/chains.ts)

  /** The Chain button, or Down + Heavy on any device. Elior's alone, and not in the Unshorn's bare hands. */
  private chainPressed() {
    const c = this.w.controls;
    return (c.pressed('chain') || (c.pressed('heavy') && c.down('down'))) && this.hero === 'elior' && this.formT <= 0 && !this.water.swimming && hasChains(this.w.save);
  }
  /** Whether the lash already reaches a foe ahead (then there is nothing to hook). */
  private foeInLash() {
    for (const f of this.w.foes()) {
      if (!f.alive) continue;
      const dx = (f.x - this.x) * this.face;
      if (dx > -14 && dx < 122 && Math.abs(f.box.centerY - this.y) < 62) return true;
    }
    return false;
  }
  /** The foe a thrown blade would take: ahead, in the hook's reach, in a clear line. Holding Up prefers one above. */
  private hookTarget(min = HOOK_MIN) {
    const far = hookRange(this.w.save);
    let best: FoeLike | null = null, score = far + 1;
    const up = this.w.controls.down('up');
    for (const f of this.w.foes()) {
      const phase = f as FoeLike & { fighting?: boolean; ward?: boolean };
      if (!f.alive || f.removed || phase.fighting === false || phase.ward) continue;
      const dx = f.x - this.x, dy = f.box.centerY - this.y, d = Math.hypot(dx, dy);
      if (dx * this.face < 8 || d < min || d > far || !this.lineOfSight(f.x, f.box.centerY)) continue;
      const sc = d - (up && dy < -30 ? 140 : 0);
      if (sc < score) { score = sc; best = f; }
    }
    return best;
  }
  /** What a chain press does now (`from`: the swing or the lingering blow it follows). False if nothing started. */
  private chooseChain(from: string) {
    const L = CHAINS.lash, m = this.moves;
    if (Math.abs(this.w.controls.axis) <= 0.2) this.face = this.swingFacing();
    else this.face = Math.sign(this.w.controls.axis);
    if (!this.onGround) {
      // Aloft: the hook if a foe is in its reach, else one wheel of fire a leap.
      const t = this.hookCd <= 0 ? this.hookTarget(60) : null;
      if (t) { this.startHook(t); return true; }
      if (this.airChain) return false;
      this.airChain = true; this.startMove(CHAINS.air);
      return true;
    }
    // A foe past the lash and inside the hook's reach: throw.
    if (this.hookCd <= 0 && !this.foeInLash()) { const t = this.hookTarget(); if (t) { this.startHook(t); return true; } }
    if (from === L[0].id) this.startMove(L[1]);
    else if (from === L[1].id) this.startMove(L[2]);
    else if (from === L[2].id || from === m.combo[2].id || from === m.extra.id) this.startMove(CHAINS.cyclone);
    else this.startMove(L[0]);
    return true;
  }
  /** A chain's blow sets its foe burning. */
  private kindle(f: FoeLike) {
    const e = (f as FoeLike & { e?: { burn: number; burnDps: number } }).e;
    const k = chainBurn(this.w.save);
    if (e) { e.burn = Math.max(e.burn, k.secs); e.burnDps = Math.max(e.burnDps, this.power() * k.share); }
    this.w.spark(f.x, f.box.centerY, 0xff8a3a, 4);
  }
  private startHook(f: FoeLike) {
    const h = this.hook, b = this.body;
    this.state = 'hook'; this.st = 0; this.hookCd = HOOK_CD;
    this.face = Math.sign(f.x - this.x) || this.face;
    h.f = f; h.phase = 'throw'; h.cx = this.x + this.face * 9; h.cy = this.feet - 31;
    h.T = Phaser.Math.Clamp(Math.hypot(f.x - this.x, f.box.centerY - this.y) / HOOK_SPEED, 0.07, 0.28);
    this.queued = this.heavyQueued = this.chainQueued = false;
    this.linger = '';
    this.slash.setVisible(false);
    b.setVelocity(b.velocity.x * 0.3, Math.min(0, b.velocity.y * 0.3));
    this.w.playEffect('chainThrow');
    this.noteStyle('hook');
  }
  /** The blade flies, bites, and then a light foe comes to him or the chain carries him to a heavy one. */
  private updateHook() {
    const h = this.hook, f = h.f, b = this.body;
    if (!f || !f.alive || f.removed) { this.endHook(false); return; }
    const tx = f.x, ty = f.box.centerY;
    if (h.phase === 'throw') {
      b.setVelocity(b.velocity.x * 0.8, 0);
      const u = Math.min(1, this.st / h.T), hx = this.x + this.face * 9, hy = this.feet - 31;
      h.cx = hx + (tx - hx) * u; h.cy = hy + (ty - hy) * u;
      if (u >= 1) this.hookBite(f);
      return;
    }
    h.cx = tx; h.cy = ty;
    if (h.phase === 'yank') {
      b.setVelocity(b.velocity.x * 0.8, 0);
      const e = (f as FoeLike & { e?: { x: number; body: { vx: number } } }).e, want = this.x + this.face * 34;
      if (!e || this.st >= 0.3 || Math.abs(f.x - want) < 12) { if (e) e.body.vx *= 0.15; this.endHook(true); return; }
      e.body.vx = Math.sign(want - e.x) * 640;
      return;
    }
    // Carried in: straight along the chain to just short of the foe, then the strike.
    const gx = tx - this.face * 30, dx = gx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 30 || this.st > 0.6 || (this.st > 0.08 && (b.blocked.left || b.blocked.right || b.blocked.up))) {
      b.setVelocity(this.face * 110, -130);
      h.f = null;
      this.airDash = this.airDashes();
      this.startMove(this.onGround ? CHAINS.arrive : CHAINS.arriveAir);
      return;
    }
    b.setVelocity((dx / d) * PULL_SPEED, (dy / d) * PULL_SPEED);
  }
  private hookBite(f: FoeLike) {
    const h = this.hook, dmg = Math.round(this.power() * HOOK_DMG * Phaser.Math.FloatBetween(0.95, 1.05)), before = f.hp;
    if (!f.hit(dmg, this.face, 0.3, false, { poise: 40, stun: 0.6, noKnock: true, tag: 'chain' })) { this.endHook(false); return; }
    this.kindle(f);
    dayCount(this.w.save, 'chain_hooks');
    haptic('hit');
    this.w.heroHit(f, before !== undefined && f.hp !== undefined ? Math.max(0, before - f.hp) : dmg, true, false);
    this.w.hitstop(STOP.heavy);
    this.w.burst(h.cx, h.cy, 2);
    this.w.flashLight?.(h.cx, h.cy, 120, '#ff9a3c', 0.35);
    this.w.playEffect('chainBite', { x: h.cx });
    this.recentHit = 0.65; this.comboHits++; this.comboT = 1.7;
    if (!f.alive) { this.endHook(false); return; }
    // Light foes come to him. Bosses, elites and the heavy carry him to them; so does holding Up.
    const e = (f as FoeLike & { e?: { isBoss: boolean; heavyBody: boolean; elite?: string | null; body: { vy: number } } }).e;
    const carry = !e || e.isBoss || e.heavyBody || !!e.elite || this.w.controls.down('up');
    this.st = 0;
    if (carry) { h.phase = 'fly'; this.untouchable = Math.max(this.untouchable, 0.3); }
    else { h.phase = 'yank'; e.body.vy = Math.min(e.body.vy, -110); }
  }
  /** `won`: the foe is at his feet, and the next blow lands half again harder (the swap's own reward). */
  private endHook(won: boolean) {
    this.hook.f = null;
    if (won) this.swapStrikeT = Math.max(this.swapStrikeT, 0.9);
    this.toFree();
  }

  private blade() {
    // A chain's reach is its own: the sword's family does not stretch it.
    const a = this.atk, reach = isChainMove(a.id) ? a.box.w : a.box.w * (this.w.d.family === 'spear' ? 1 : this.moves.reach) + (a.heavy ? 30 : 0);
    const x = this.face > 0 ? this.x + a.box.x : this.x - a.box.x - reach;
    return new Phaser.Geom.Rectangle(x, this.feet + a.box.y, reach, a.box.h);
  }

  /** Returns whether any blow landed. */
  private strike() {
    let landed = false, waved = false;
    const box = this.blade();
    this.w.strikeLamps({ x: box.x, y: box.y, w: box.width, h: box.height });
    for (const f of this.w.foes()) {
      if (!f.alive || this.hitDone.has(f) || !Phaser.Geom.Rectangle.Overlaps(box, f.box)) continue;
      this.hitDone.add(f);
      const counter = this.counterT > 0;
      const ps = this.w.save, d = this.w.d, crit = counter || this.psalmCrits > 0 || Math.random() < d.crit;
      let dmg = this.power() * this.atk.dmg * this.atkMult * (this.atk.heavy ? d.heavyMult : 1) * Phaser.Math.FloatBetween(0.92, 1.08);
      if (crit) dmg *= d.critDmg;
      // The Psalm of the Hunt: a parried foe takes half again as much for a while.
      const marked = (f as { e?: { psalmMarkT?: number } }).e ?? (f as { psalmMarkT?: number });
      if ((marked.psalmMarkT ?? 0) > this.clock) dmg *= 1.5;
      // The Armor of Light sears into what the blade touches, rather than sending a wave down the room.
      if (this.armorLight > 0) dmg *= 1.4;
      // Arriving from a swap: the first blow carries the momentum.
      const swap = this.swapStrikeT > 0 ? 1.5 : 1;
      const force = this.atk.force * this.atkMult * (counter ? 1.5 : 1) * swap;
      const beforeHp = f.hp;
      if (f.hit(Math.round(dmg * swap), this.face, force, crit, { poise: this.atk.poise * this.atkMult * this.w.d.heavyPoiseMult * (this.atk.heavy && wears(ps, 'broken_idol') ? 1.4 : 1), kx: this.atk.kx * this.face, ky: this.atk.ky, launch: this.atk.launch, heavy: this.atk.heavy, guardBreak: this.atk.guardBreak, tag: isChainMove(this.atk.id) ? 'chain' : undefined })) {
        haptic('hit');
        landed = true;
        const dealt = beforeHp !== undefined && f.hp !== undefined ? Math.max(0, beforeHp - f.hp) : Math.round(dmg * swap);
        this.w.heroHit(f, dealt, this.atk.heavy, crit);
        if (this.armorLight > 0) this.w.spark(f.x, f.box.centerY, 0xffe6a8, 6);
        this.counterT = 0;
        this.swapStrikeT = 0;
        if (crit && this.psalmCrits > 0) this.psalmCrits--;
        if (crit && wears(ps, 'balance')) this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + 6);
        // The Psalm of the Swarm: a combo's third blow strikes the same foe twice, the light following the blade in.
        if (this.combo === 2 && !waved && wears(ps, 'swarm')) {
          waved = true;
          if (f.alive && !f.removed) { f.hit(Math.round(dmg * 0.8), this.face, 0, false, { poise: 10 }); this.w.burst(f.x, f.box.centerY, 1); }
        }
        this.recentHit = 0.65;
        this.noteStyle(this.atk.id);
        this.comboHits++; this.comboT = 1.7;
        this.w.save.bestCombo = Math.max(this.w.save.bestCombo ?? 0, this.comboHits);
        if (this.w.save.flags.relic_taken || !this.powers?.L.storyEnabled) this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + CE_HIT * (1 + skillRank(this.w.save, 'l_radiance') * 0.3));
        if (this.atk.hang && !this.onGround) this.body.setVelocityY(Math.min(this.body.velocity.y, this.atk.hang));
        if (this.w.d.lifesteal) this.hp = Math.min(this.maxHp, this.hp + dmg * swap * this.w.d.lifesteal);
        this.w.hitstop(crit ? STOP.crit : this.atk.heavy ? STOP.heavy : this.combo === 2 ? STOP.ender : STOP.light);
        // The chain's last blow lands with weight: Judgment Cross and the third Phantom strike always,
        // a combo finisher when it fells its foe. Ordinary hits stay steady.
        const id = this.atk.id, ender = this.atk.finisher || this.combo === 2 || id === 'storm' || id === 'comet';
        if (id === 'cross' || (id === 'pstrike' && this.phantomN >= 3) || (ender && !f.alive)) this.w.finale(f.x, f.box.centerY, id === 'cross' ? 1.4 : id === 'pstrike' ? 0.8 : 1);
        this.w.legends?.onHit(f, { crit, heavy: !!this.atk.heavy, ender });
        if (this.formT > 0) this.punchImpact(f, crit, ender || !!this.atk.heavy);
        if (isChainMove(id)) this.kindle(f);
      }
    }
    return landed;
  }

  /**
   * Every one of the Unshorn's blows lands with its weight: a longer hold, the burst where the fist meets, dust off the
   * foe's feet and a deep thump; the heavier blows shake the frame and boom. No ring or wave rides a punch.
   */
  private punchImpact(f: FoeLike, crit: boolean, big: boolean) {
    const x = this.face > 0 ? f.box.left + 2 : f.box.right - 2, y = f.box.centerY - 4;
    this.w.hitstop(big ? 0.11 : crit ? 0.08 : 0.055);
    // The impact frame: every heavy blow, crit and combo ender; quick jabs at most one in 0.18 s, so a chain never strobes.
    if (big || crit || this.clock - this.impactFrameAt >= 0.18) { this.impactFrameAt = this.clock; this.w.impactFrame(x, y, big || crit); }
    this.w.burst(x, y, big || crit ? 1 : 0, big, 'vfx-unshorn');
    if (big) this.w.burst(f.x, f.box.bottom, 2, true, 'vfx-unshorn');
    if (this.atk.id === 'urise' || this.atk.id === 'ucomet') this.w.burst(x, f.box.bottom, 3, true, 'vfx-unshorn');
    fx.dust(f.x, f.box.bottom, big ? 10 : 4, big ? 2 : 1);
    this.w.flashLight?.(x, y, big ? 130 : 70, '#ffb347', big ? 0.25 : 0.12);
    // The weight is in the sound: a deep thump on every fist, lower and doubled for the heavy blows.
    this.w.playEffect('punch', { x, pitch: big ? 0.72 : 0.9 + Math.random() * 0.12, vol: big ? 1 : 0.9 });
    if (big) { this.w.playEffect('punch', { x, pitch: 0.55, vol: 0.8 }); this.w.playEffect('bossSlam', { x, vol: 0.35, pitch: 1.2 }); this.w.shake(0.01, 140); input.rumble(0.9, 0.7, 120); }
    else input.rumble(0.45, 0.3, 50);
  }

  /**
   * Take a blow. A perfect parry turns it aside and staggers a melee attacker;
   * a raised guard (or the Shield of Faith) blocks most of it. Returns whether
   * any of it landed.
   */
  hurt(h: Blow) {
    if (this.state === 'dead') return false;
    if (!h.hazard && !this.vulnerable && this.shieldT <= 0) return false;
    const facing = h.dir === 0 || Math.sign(h.dir) !== this.face;
    if (!h.hazard && this.shieldT > 0) {
      h.src?.parried();
      this.w.spark(this.x + this.face * 10, this.y, 0x9fd8ff, 8);
      return false;
    }
    if (!h.hazard && !h.unblockable && this.parryT > 0 && facing) {
      this.parryT = 0;
      this.counterT = this.combatStyle === 'sentinel' ? 1.05 : 0.75;
      this.noteStyle('perfect_parry');
      this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + (skillRank(this.w.save, 'g_timing') ? 12 : CE_PARRY));
      h.src?.parried();
      this.w.spark(this.x + this.face * 10, this.y - 6, 0xfff6dc, 16);
      this.w.burst(this.x + this.face * 10, this.y - 6, 3);
      this.w.floatText(this.x, this.body.top - 10, 'PARRY', '#fff1c4');
      this.powers?.onParry();
      this.w.legends?.onParry();
      if (this.w.d.parryHeal) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.w.d.parryHeal);
      // Psalms: the Furnace heals, the Hunt marks the attacker, the Refiner readies three critical blows.
      const ps = this.w.save;
      if (wears(ps, 'furnace')) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.08);
      if (wears(ps, 'hunt') && h.src) ((h.src.ent ?? h.src) as { psalmMarkT?: number }).psalmMarkT = this.clock + 4;
      if (wears(ps, 'refiner')) this.psalmCrits = 3;
      if (this.w.d.sets.vigil >= 3 && this.vigilParryCd <= 0) { this.vigilParryCd = 3; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05); this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + 8); }
      valorTrack.parry(); dayCount(this.w.save, 'parries'); haptic('parry'); input.rumble(0.7, 0.5, 150);
      this.w.playEffect('parryPerfect');
      this.w.hitstop(STOP.parry);
      return false;
    }
    // The original's armour: damage reduction from Endurance and gear (half of it against hazards).
    const dr = this.w.d.dr * (h.hazard ? 0.5 : 1);
    const protection = h.hazard ? 1 : (this.armorLight > 0 ? 0.6 : 1) * (this.formT > 0 ? 0.45 : this.mantleT > 0 ? 0.5 : 1) * (this.powers?.guardAura ?? 1);
    const dmgBeforeGuard = h.dmg * runBlessings.incoming * (1 - dr) * protection;
    let dmg = dmgBeforeGuard;
    if (!h.hazard && !h.unblockable && (this.state === 'block' || this.state === 'parry') && facing) {
      dmg = Math.max(1, Math.round(dmg * (this.combatStyle === 'sentinel' ? 0.2 : 0.25)));
      this.hp = Math.max(this.deathless ? 1 : 0, this.hp - dmg); this.sinceHurt = 0; if (this.hp <= 0) this.die();
      this.w.floatText(this.x, this.body.top - 6, String(dmg), '#e8c8a0');
      this.w.spark(this.x + this.face * 8, this.y - 4, 0xffe6a8, 6);
      this.body.setVelocityX(-this.face * 80);
      return true;
    }
    dmg = Math.max(1, Math.round(dmg));
    valorTrack.hurt(); haptic('hurt'); input.rumble(0.5, 0.2, 120);
    this.styleMeter.hurt();
    this.bow.cancel();
    this.w.playEffect('hurt');
    this.hp = Math.max(this.deathless ? 1 : 0, this.hp - dmg);
    this.sinceHurt = 0;
    this.w.floatText(this.x, this.body.top - 6, String(dmg), '#ff6a6a');
    this.invuln = 0.9;
    this.slash.setVisible(false);
    const dir = h.dir || -this.face;
    if (this.hp <= 0) {
      this.w.playEffect('death');
      this.state = 'dead';
      this.st = 0;
      this.body.setVelocity(dir * 120, -200);
      return true;
    }
    if (this.lion > 0 || this.mantleT > 0 || this.formT > 0) return true;
    this.state = 'hurt';
    this.st = 0;
    this.body.setVelocity(dir * 170, -170);
    return true;
  }

  heal() {
    this.maxHp = this.w.d.maxHp;
    this.maxCe = this.w.d.maxCe;
    this.hp = this.maxHp;
  }

  /** Pick the sheet frame and place the sprite, blade arc and auras on the body. */
  private draw(dt = 0) {
    const b = this.body;
    const vx = Math.abs(b.velocity.x);
    const ground=this.onGround;
    // Coasting out of a lunge is not a stride: run only on real speed or a held direction.
    const travel=Math.abs(this.x-this.visualX),moving=travel>.02&&travel<24&&(vx>18||Math.abs(this.w.controls.axis)>.2);
    this.visualX=this.x;
    if(ground&&!this.wasGrounded&&this.lastVy>80&&!this.water.swimming){this.landT=.14;this.sqV-=Math.min(5,this.lastVy/110);}
    else this.landT=Math.max(0,this.landT-dt);
    // Leaving the ground stretches; a dodge or dash stretches long and low.
    if(!ground&&this.wasGrounded&&b.velocity.y<-120)this.sqV+=3.2;
    if((this.state==='dodge'||this.state==='airdash')&&this.st<dt*1.5)this.sqV-=2.4;
    this.wasGrounded=ground;this.lastVy=b.velocity.y;
    if(ground&&moving&&this.state==='free')this.stride=(this.stride+travel/64)%1;
    const form = !this.dead && this.formT > 0;
    const mantle = !this.dead && !form && (this.mantleT > 0 || this.state === 'transform');
    let clip='idle',uArt=0;
    if(this.dead){clip='death';uArt=this.st/1.2;}
    else if(this.state==='hurt'){clip='hurt';uArt=this.st/.3;}
    else if(this.hero==='tirzah'&&this.bow.stabT>0){clip='dagger2';uArt=.3+(1-this.bow.stabT/STAB_T)*.7;}
    else if(this.state==='bow'&&this.bow.dagger){clip=`dagger${this.bow.dagger}`;uArt=this.bow.daggerU;}
    else if(this.state==='bow'){clip=this.bow.drawing?'bowDraw':'bowRelease';uArt=this.bow.drawing?this.bow.charge/.55:1-this.bow.recovery/.28;}
    else if(this.state==='hook'){const ph=this.hook.phase;clip=ph==='throw'?'chhook':ph==='yank'?'chhaul':'chfly';uArt=ph==='throw'?this.st/this.hook.T:this.st/.3;}
    else if(this.state==='attack'||this.state==='plunge'){clip=this.hero==='tirzah'?'cast':this.atk.clip;uArt=this.st/this.atk.t;}
    else if(this.state==='dodge'){clip='roll';uArt=this.st/DODGE_T;}
    else if(this.state==='airdash'||this.state==='phantom'){clip='airdash';uArt=this.st/.2;}
    else if(this.state==='charge'){clip='charge';uArt=Math.min(1,this.st/.22);}
    else if(this.state==='parry'||this.state==='block'){clip=this.state;uArt=this.state==='block'?1:this.st/.3;}
    else if(this.state==='heal'||this.state==='cast'){clip=this.state;uArt=this.st/(clip==='heal'?.9:.3);}
    else if(this.state==='transform'||this.state==='execute'||this.state==='scripted')clip=this.state==='transform'?'invoke':this.powers?.clip||'invoke';
    else if(this.water.swimming)clip=vx>20||Math.abs(b.velocity.y)>20?'swim':'idle';
    else if(!ground||b.velocity.y<0)clip=b.velocity.y<0?'jump':'fall';
    else if(this.landT>0){clip='land';uArt=1-this.landT/.14;}
    else if(moving){clip='run';uArt=this.stride;}
    if(clip!==this.visualClip){this.visualClip=clip;this.visualTime=0;}
    else this.visualTime+=dt;
    if(clip==='idle')uArt=(this.visualTime/3)%1;
    else if(clip==='swim')uArt=(this.visualTime/1.1)%1;
    else if(clip==='jump'||clip==='fall')uArt=this.visualTime/(clip==='jump'?.25:.35);
    else if(this.state==='transform'||this.state==='execute'||this.state==='scripted')uArt=this.state==='transform'?this.visualTime/1.15:this.powers?.clipProgress??0;
    const key=actionAtlas(this.w.sc,this.hero,form?'fists':this.w.d.family,mantle,this.hero==='tirzah'||!this.powers?.weaponFlight,this.hero==='elior'?this.w.save.valor?.cape??null:null);
    const frame=actionFrame(this.w.sc,key,clip,Phaser.Math.Clamp(uArt,0,.999));
    // The spring settles the squash; the lean follows ground speed, and a rise or fall tips her a little.
    if(dt>0){this.sqV+=(-420*this.sq-20*this.sqV)*dt;this.sq=Phaser.Math.Clamp(this.sq+this.sqV*dt,-.16,.16);}
    const run=ground&&(clip==='run'||clip==='land')?Phaser.Math.Clamp(b.velocity.x/200,-1,1)*4.5:0,air=!ground&&!this.water.swimming?Phaser.Math.Clamp(b.velocity.y/600,-1,1)*-2*this.face:0;
    this.leanA+=(run+air-this.leanA)*Math.min(1,dt*12);
    this.sprite.setTexture(key,frame).setOrigin(.5,ACTION_FOOT/ACTION_CELL).setScale(1-this.sq*.55,1+this.sq);
    this.sprite.setFlipX(this.face < 0);
    this.sprite.setPosition(Math.round(b.center.x), Math.round(b.bottom));
    // Blink while invulnerable after a blow.
    this.sprite.setAlpha(this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 20) % 2 === 0 ? 0.35 : 1);
    this.sprite.setAngle(!this.dead&&this.water.swimming&&vx>25?this.face*Math.min(65,vx*.45):this.dead?0:this.leanA);
    this.trailT-=dt;
    const streak=!settings.reduceFlashes&&settings.quality!=='low'&&this.hero==='elior'&&((this.state==='attack'&&(this.atk.air||this.atk.heavy))||(this.state==='dodge'&&this.combatStyle==='wraith'));
    for(const ghost of this.trail){ghost.life=this.dead||settings.reduceFlashes?0:Math.max(0,ghost.life-dt);ghost.sprite.setVisible(ghost.life>0).setAlpha(ghost.life*1.6);}
    if(streak&&this.trailT<=0){const ghost=this.trail.find(g=>g.life<=0);if(ghost){ghost.life=0.18;ghost.sprite.setTexture(this.sprite.texture.key,this.sprite.frame.name).setPosition(this.sprite.x,this.sprite.y).setOrigin(this.sprite.originX,this.sprite.originY).setScale(this.sprite.scaleX,this.sprite.scaleY).setFlipX(this.sprite.flipX).setAngle(this.sprite.angle);}this.trailT=0.055;}
    // The blade's arc shows from the moment it lands until the swing ends.
    const u = this.state === 'attack' ? this.st / this.atk.t : 0;
    // Bare fists draw no blade arcs: the impact is the effect.
    const chain = this.state === 'attack' && isChainMove(this.atk.id);
    const show = !form && !chain && this.state === 'attack' && u >= this.atk.hit[0] && u <= this.atk.hit[1] + 0.15;
    // The chains themselves, drawn live from his hand (the arriving strike is a blade in the fist: no chain out).
    if (chain && this.atk.id !== CHAINS.arrive.id) this.chainFx.sweep(this.atk.id, u, b.center.x, b.bottom, this.face, dt);
    else if (this.state === 'hook' && this.hook.f) this.chainFx.line(b.center.x, b.bottom, this.face, this.hook.cx, this.hook.cy, dt);
    else this.chainFx.hide();
    this.slash.setVisible(show);
    if (show) {
      const k = (u - this.atk.hit[0]) / (this.atk.hit[1] + 0.15 - this.atk.hit[0]);
      // Art drop V01: rows are a light cut, a heavy cut, a rising launcher and a full spin, six frames each.
      const id = this.atk.id, spin = id === 'storm' || id === 'flurry' || id === 'cross';
      const row = spin ? 3 : this.atk.launch || id === 'launch' || id === 'comet' || id === 'rend' ? 2 : this.atk.heavy ? 1 : 0;
      const big = (this.atk.heavy ? 1.15 + this.atkMult * 0.2 : this.combo === 2 ? 1.15 : 1) * (spin ? 0.55 : 0.46);
      this.slash.setFrame(row * 6 + Math.min(5, Math.floor(k * 6)))
        .setPosition(b.center.x + (spin ? 0 : this.face * 18), b.center.y - 2)
        .setFlipX(this.face < 0)
        .setScale(big)
        .setAngle(row === 0 ? this.face * (this.combo === 1 ? 14 : -8) : 0)
        .setTint(0xffffff)
        .setAlpha(1);
    }
    // Charge glow, the parry flash, the shield bubble.
    const g = this.aura.clear();
    if (this.water.showT > 0) { const f = this.water.breath / 20; g.lineStyle(1.8, f < 0.3 ? 0xff6a6a : 0x8fdcff, this.water.showT).beginPath().arc(this.x + this.face * 16, this.feet - 43, 6, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, f) * Math.PI * 2).strokePath(); }
    // Rows of the impact sheet: 0 a gold star burst, 3 a ring of light. The Shield of Faith's own art holds while it lasts.
    const { charge, guard, buff, mote } = this.glow, shown = this.sprite.visible, pulse = Math.sin(this.st * 30);
    charge.setVisible(shown && this.state === 'charge');
    if (charge.visible) {
      const r = 10 + this.chargeLvl * 6 + pulse * 1.5;
      charge.setFrame(19 + Math.min(1, this.chargeLvl)).setPosition(b.center.x, b.center.y).setScale(r / 40).setRotation(this.st * 2)
        .setTint(this.chargeLvl >= 2 ? 0xfff1c4 : 0xe8c27a).setAlpha(0.75);
    }
    guard.setVisible(shown && (this.parryT > 0 || this.state === 'block'));
    if (guard.visible) {
      const parry = this.parryT > 0;
      guard.setFrame(parry ? 2 : 19).setPosition(b.center.x + this.face * 8, b.center.y - 2).setScale(parry ? 0.24 : 0.2).setRotation(parry ? this.st * 6 : 0)
        .setTint(parry ? 0xffffff : 0xffe6a8).setAlpha(parry ? 0.95 : 0.5);
    }
    buff.setVisible(shown && (this.armorLight > 0 || this.lion > 0));
    if (buff.visible) {
      const armor = this.armorLight > 0;
      buff.setFrame(armor ? 21 : 3 + (Math.floor(this.st * 10) % 3)).setPosition(b.center.x, b.center.y).setScale(armor ? 0.5 : 0.42)
        .setTint(armor ? 0xffe6a8 : 0xffb347).setAlpha(armor ? 0.45 : 0.4);
    }
    mote.setVisible(shown && (this.mendT > 0 || this.counterT > 0));
    if (mote.visible) {
      if (this.mendT > 0) mote.setFrame(23).setPosition(b.center.x + Math.sin(this.st * 5) * 13, b.center.y + Math.cos(this.st * 5) * 20).setScale(0.2).setTint(0x9de6bb).setAlpha(0.8);
      else mote.setFrame(0).setPosition(b.center.x + this.face * 10, b.top - 2).setScale(0.12).setTint(0xfff1c4).setAlpha(0.8);
    }
  }
}
