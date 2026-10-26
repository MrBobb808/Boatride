// Elior in Phaser: an Arcade body (12×34, feet at its bottom) with his PNG
// sheet drawn over it. Movement numbers come from the original game
// (remnant/src/game/player.ts): run 142, jump 430, gravity 1500, max fall 560,
// coyote 0.1 s, jump buffer 0.16 s, shorter hops when jump is let go.
// Combat follows the shared weapon definitions: ground and air routes,
// Phantom Step, charged blows, parries, buffs, Balm and the selected skills.

import Phaser from 'phaser';
import { Bow } from './bow';
import { StyleMeter, STYLE_NAMES, RANKS, type CombatStyle, type PlayableHero } from './style';
import { actionAtlas, actionFrame } from './actionArt';
import { ACTION_RATE } from './pace';
import { settings } from '../classic/shim/settings';
import { T, TILE, isSolid } from '../shared';
import { sovereignDamage } from '../../../remnant/src/game/balance';
import { MOVESETS, extraFor, type AttackDef } from '../../../remnant/src/game/weapons';
import { skillRank } from '../../../remnant/src/game/state';
import { SKILLS, skillSlots, castSkill, type SkillId } from './abilities';
import type { WorldApi, Blow, FoeLike } from './types';
import { makeSwim, DASH_T, DASH_V } from '../../../remnant/src/game/swim';
import { SWIM_SPEED, SWIM_ACCEL, FLOAT_DEPTH } from '../../../remnant/src/game/water';
import { input } from '../../../remnant/src/core/input';
import { G } from '../classic/shim/ctx';
import { haptic } from '../../../remnant/src/core/haptics';
import { valorTrack } from '../../../remnant/src/game/valor';
import { runBlessings } from '../../../remnant/src/game/blessings';
import type { HeroPowers } from '../classic/hero';

export const GRAV = 1500;
const MAX_FALL = 560;
const RUN = 142;
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
const CHARGE_AT = [0, 0.35, 0.85, 1.4];
const CHARGE_MULT = [1, 1.35, 1.8, 2.5];

/** Sheet frames (4×4, 128 px): idle 0–3, run 4–7, rise 8, fall 9, wind-up 10, strike 11, dodge 12–13, hurt 14, cast 15. */
const FRAME = 128, FOOT = 120, DRAW = 56;

type State = 'free' | 'attack' | 'charge' | 'parry' | 'block' | 'heal' | 'cast' | 'dodge' | 'airdash' | 'phantom' | 'plunge' | 'execute' | 'transform' | 'scripted' | 'swim' | 'bow' | 'hurt' | 'dead';

export class Player {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  sprite: Phaser.GameObjects.Sprite;
  slash: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Graphics;
  readonly styleMeter = new StyleMeter();
  readonly bow: Bow;
  private switchCd = 0;
  private trail: { sprite:Phaser.GameObjects.Sprite; life:number }[] = [];
  private trailT = 0;
  state: State = 'free';
  face = 1;
  powers?: HeroPowers;
  mantleT = 0;
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
  cds: Record<SkillId, number> = Object.fromEntries(Object.keys(SKILLS).map((id) => [id, 0])) as Record<SkillId, number>;
  lion = 0;
  armorLight = 0;
  mendT = 0;
  veiled = 0;
  untouchable = 0;
  sinceHurt = 0;
  private vigilParryCd = 0;
  private airAttacks = 0;
  private airDash = 1;
  private airJumps = 0;
  private sinceDodge = 99;
  private recentHit = 0;
  private linger = '';
  private lingerT = 0;
  private heavyQueued = false;
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
  private parryT = 0;
  private parryCd = 0;
  private healDone = false;
  private castId: SkillId | null = null;
  /** Arriving from a swap with an Echo: the next blow within this time lands half again harder. */
  swapStrikeT = 0;
  /** While positive, one-way platforms let Elior drop through. */
  dropT = 0;
  private stride = 0;
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
    this.slash = sc.add.image(x, feet, 'slash').setDepth(11).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.aura = sc.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    this.maxHp = w.d.maxHp;
    this.maxCe = w.d.maxCe;
    this.hp = w.save.hp > 0 ? Math.min(w.save.hp, this.maxHp) : this.maxHp;
    this.face = face;
    this.bow = new Bow(w, this);
    this.trail = Array.from({length:4},()=>({sprite:sc.add.sprite(x,feet,'elior',0).setDepth(9).setVisible(false).setTint(0xa99ad7),life:0}));
  }

  get hero(): PlayableHero { return this.w.save.playableHero === 'tirzah' ? 'tirzah' : 'elior'; }
  get combatStyle(): CombatStyle { const s = this.w.save.combatStyle; return s === 'wraith' || s === 'sentinel' ? s : 'vanguard'; }
  switchHero() {
    if (this.switchCd > 0 || G.paused || G.inCutscene || this.dead || !['free', 'swim'].includes(this.state)) { this.w.toast('Switch after the current move.'); return false; }
    this.w.save.playableHero = this.hero === 'elior' ? 'tirzah' : 'elior';
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

  die() { if (this.dead) return; this.hp = 0; this.state = 'dead'; this.st = 0; this.body.setVelocity(0, -120); }

  get x() { return this.body.center.x; }
  get feet() { return this.body.bottom; }
  get y() { return this.body.center.y; }
  get dead() { return this.state === 'dead'; }
  get onGround() { return this.body.blocked.down || this.body.touching.down; }
  get vulnerable() { return !(this.water.swimming && this.water.dashT > 0.06 && this.water.dashT < 0.28) && this.invuln <= 0 && this.untouchable <= 0 && !['dead', 'phantom', 'execute', 'transform'].includes(this.state) && !(this.state === 'attack' && ['pstrike', 'cross'].includes(this.atk.id) && this.st < 0.12) && !(this.state === 'dodge' && this.st < DODGE_T - 0.04) && !(this.state === 'airdash' && this.st < 0.15); }
  get ce() { return this.w.save.ce; }
  get moves() { return MOVESETS[this.w.d.family]; }
  /** A blow's base: the original's attack from stats and gear, its melee multiplier and the level's power tier. */
  power() { const d = this.w.d; return d.atk * d.meleeMult * sovereignDamage(this.w.save.level) * (this.lion > 0 ? 1.35 : 1) * (this.powers?.multiplier ?? 1); }
  /** A Covenant skill's base: attack times the original's ability power. */
  skillPower() { const d = this.w.d; return d.atk * d.abil * sovereignDamage(this.w.save.level); }

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
    this.slash.setVisible(false);
  }

  destroy() {
    this.bow.destroy();
    for(const g of this.trail)g.sprite.destroy();
    this.sprite.destroy();
    this.slash.destroy();
    this.aura.destroy();
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
    this.switchCd = Math.max(0,this.switchCd-dt);
    this.styleMeter.update(dt);
    this.bow.update(dt);
    this.vigilParryCd = Math.max(0, this.vigilParryCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.swapStrikeT = Math.max(0, this.swapStrikeT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    for (const k of Object.keys(SKILLS) as SkillId[]) this.cds[k] = Math.max(0, this.cds[k] - dt * this.w.d.skillRecharge * runBlessings.recharge);
    this.lion = Math.max(0, this.lion - dt);
    this.armorLight = Math.max(0, this.armorLight - dt);
    this.veiled = Math.max(0, this.veiled - dt);
    this.untouchable = Math.max(0, this.untouchable - dt);
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
    if (this.onGround) { this.airAttacks = 0; this.airDash = 1; this.airJumps = s.keyItems.includes('eagle_wings') ? 1 : 0; }
    if (this.state !== 'dead' && (s.flags.relic_taken || !this.powers?.L.storyEnabled)) s.ce = Math.min(this.maxCe, s.ce + CE_REGEN * this.w.d.ceRegen * dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuf = c.pressed('jump') ? BUFFER : Math.max(0, this.jumpBuf - dt);

    if (this.state === 'dead') { b.setVelocityX(b.velocity.x * 0.9); this.draw(dt); return; }
    this.powers?.senseWater(dt);
    if (this.powers?.update(dt)) { this.draw(dt); return; }

    if (this.scriptX !== null) { const dx = this.scriptX - this.x; if (Math.abs(dx) < 3) { this.scriptX = null; b.setVelocityX(0); } else { this.face = Math.sign(dx); b.setVelocityX(this.face * this.scriptSpeed); } this.draw(dt); return; }
    if (G.inCutscene && this.state === 'free') { b.setVelocityX(0); this.draw(dt); return; }
    if (!G.inCutscene && this.powers) this.powers.clip = '';
    if (this.hero === 'tirzah' && !G.inCutscene && this.bow.control(dt * ACTION_RATE)) {
      if (c.pressed('dodge') || c.pressed('parry')) { this.bow.cancel(); this.releaseState(); this.defence(); }
      b.setGravityY(this.water.swimming ? 0 : GRAV);
      const hz=this.hazard();if(hz&&this.vulnerable)this.hurt({dmg:hz===T.Spikes?18:10,dir:0,hazard:true});
      this.draw(dt); return;
    }
    if (this.state === 'swim') { this.swim(dt); this.draw(dt); return; }
    // Short hops: letting go of jump on the way up pulls Elior down sooner.
    const airSwing = (this.state === 'attack' || this.state === 'charge') && !this.onGround;
    b.setGravityY(this.water.swimming ? 0 : this.state === 'phantom' || this.state === 'airdash' ? 0 : airSwing && this.atk.id !== 'rend' ? GRAV * 0.35 : b.velocity.y < 0 && !c.down('jump') ? GRAV * 1.9 : GRAV);

    switch (this.state) {
      case 'free': {
        const ax = c.axis;
        const accel = this.onGround ? 1400 : 900;
        b.setVelocityX(Phaser.Math.Linear(b.velocity.x, ax * RUN * this.w.d.speed * (this.mantleT > 0 ? 1.25 : 1), Math.min(1, (accel * dt) / RUN)));
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
        if (c.pressed('heavy') && !c.down('up')) {
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
          castSkill(this.w, this.castId);
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
        else if (this.st >= 0.2) this.toFree();
        break;
      case 'phantom':
        b.setVelocity(0, 0);
        if (this.st >= 0.075) this.finishPhantom();
        break;
      case 'plunge':
        b.setVelocityX(b.velocity.x * 0.9);
        b.setVelocityY(Math.max(520, b.velocity.y));
        this.strike();
        if (this.onGround && this.st > 0.05) this.landPlunge();
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
    if (!id || !s.abilities.includes(id)) { this.w.toast('Choose an ability in Menu → Elior → Abilities.'); return false; }
    const def = SKILLS[id];
    if (this.cds[id] > 0) return false;
    if (id === 'blink_strike' || id === 'chain_snare') {
      const t = this.target(260, true);
      if (!t || !this.blinkSpot(t)) { this.w.toast('No reachable enemy ahead.'); return false; }
    }
    if (s.ce < def.cost) { this.w.floatText(this.x, this.body.top - 8, 'Not enough Covenant Energy', '#9fc4ff'); return false; }
    s.ce -= def.cost;
    this.cds[id] = def.cd;
    this.castId = id;
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
    const speed = this.w.d.aspd * this.moves.speed * (this.lion > 0 ? 1.1 : 1) * (this.mantleT > 0 ? 1.2 : 1);
    this.atk = swing(a, speed);
    this.atkMult = 1;
    this.combo = this.moves.combo.findIndex((v) => v.id === a.id);
    this.hitSeg = -1;
    this.swung = false;
    this.linger = '';
    this.powers?.onSwing(!!a.finisher, !!a.air);
    this.begin();
    this.w.playEffect(a.sfx);
    if (a.rise && (this.w.controls.down('up') || a.forceRise)) this.body.setVelocityY(a.rise);
    if (a.air && this.body.velocity.y > 0) this.body.setVelocityY(this.body.velocity.y * 0.2);
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
    if (c.pressed('heavy')) this.heavyQueued = true;
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
      if (!this.swung && this.armorLight > 0 && !a.air) this.w.lightWave();
      this.swung = true;
      if (a.pull) for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - this.x) < a.pull) {
        const e = (f as FoeLike & { e?: { isBoss: boolean; body: { vx: number } } }).e;
        if (e && !e.isBoss) e.body.vx = Math.sign(this.x - f.x) * 90;
      }
    }
    if (a.dive && this.onGround && this.st > 0.08) { this.landPlunge(); return; }
    if (this.combatStyle === 'vanguard' && this.recentHit > 0 && this.jumpBuf > 0 && !this.water.swimming) {
      this.jumpBuf = 0; this.recentHit = 0; this.airAttacks = 0; this.airDash = 1;
      this.toFree(); this.body.setVelocityY(-JUMP_V * 0.78); this.noteStyle('jump_cancel',true); return;
    }
    if (c.pressed('dodge') && this.recentHit > 0 && this.canPhantom()) { this.startPhantom(); return; }
    if (u >= a.cancel && this.defence()) return;
    if (u >= a.cancel) {
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
    this.state = 'dodge';
    this.st = 0;
    this.dodgeCd = 0.45;
    const ax = this.w.controls.axis;
    if (Math.abs(ax) > 0.2) this.face = Math.sign(ax);
    this.slash.setVisible(false);
  }

  private startPlunge() { this.startMove(this.moves.plunge); this.state = 'plunge'; this.body.setVelocityY(260); }
  private landPlunge() {
    this.w.shake(0.008, 170);
    this.w.spark(this.x, this.feet - 2, 0xffd27a, 20);
    this.startMove({ ...this.moves.plunge, id: 'slam', dur: 0.3, hit: [0, 0.35], box: { x: -40, y: -28, w: 80, h: 32 }, dmg: 1.6, finisher: true });
    this.strike();
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
  lineOfSight(x: number, y: number) {
    const dx = x - this.x, dy = y - this.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    for (let i = 1; i <= n; i++) if (isSolid(this.w.tileAt(Math.floor((this.x + dx * i / n) / TILE), Math.floor((this.y + dy * i / n) / TILE)))) return false;
    return true;
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
    else { const speed = SWIM_SPEED * this.w.d.speed, rest = w.surface + FLOAT_DEPTH;
      const vy = (Math.abs(my) > 0.25 ? my * speed : w.air ? Phaser.Math.Clamp((rest - this.feet) * 3, -26, 80) : -26) + w.flowY;
      const approach = (n: number, target: number) => n + Phaser.Math.Clamp(target - n, -SWIM_ACCEL * dt, SWIM_ACCEL * dt);
      b.setVelocity(approach(b.velocity.x, mx * speed + w.flowX), approach(b.velocity.y, w.air && vy < 0 ? Math.max(vy, (rest - this.feet) * 4) : vy)); }
    if (my > 0.5) this.dropT = 0.1;
    if (c.pressed('jump')) { if (w.air && this.feet - (w.surface + FLOAT_DEPTH) < 12) { w.breachT = 0.4; w.swimming = false; this.state = 'free'; b.setVelocityY(-440); b.setGravityY(GRAV); this.airJumps = this.w.save.keyItems.includes('eagle_wings') ? 1 : 0; this.airDash = 1; this.w.playEffect('splash'); }
      else if (w.strokeCd <= 0) { b.setVelocityY(-210); w.strokeCd = 0.28; this.w.playEffect('swimStroke'); } }
    if (c.pressed('dodge')) this.swimDash();
    else if (c.pressed('parry')) this.startParry();
    else if (c.pressed('attack')) this.startMove({ ...this.moves.combo[0], dur: this.moves.combo[0].dur / 0.72, lunge: 0, ky: 0, launch: false });
    else if (['heavy', 'sub', 'heal', 'ultimate', 'transform', 'skill1', 'skill2', 'skill3'].some(a => c.pressed(a as import('./controls').Action)) && w.deniedT <= 0) { w.deniedT = 1.2; this.w.toast('Not under water. Swim, thrust, parry or dash-stroke.'); }
  }

  private blade() {
    const a = this.atk, reach = a.box.w * (this.w.d.family === 'spear' ? 1 : this.moves.reach) + (a.heavy ? 30 : 0);
    const x = this.face > 0 ? this.x + a.box.x : this.x - a.box.x - reach;
    return new Phaser.Geom.Rectangle(x, this.feet + a.box.y, reach, a.box.h);
  }

  private strike() {
    const box = this.blade();
    this.w.strikeLamps({ x: box.x, y: box.y, w: box.width, h: box.height });
    for (const f of this.w.foes()) {
      if (!f.alive || this.hitDone.has(f) || !Phaser.Geom.Rectangle.Overlaps(box, f.box)) continue;
      this.hitDone.add(f);
      const counter = this.counterT > 0;
      const d = this.w.d, crit = counter || Math.random() < d.crit;
      let dmg = this.power() * this.atk.dmg * this.atkMult * (this.atk.heavy ? d.heavyMult : 1) * Phaser.Math.FloatBetween(0.92, 1.08);
      if (crit) dmg *= d.critDmg;
      // Arriving from a swap: the first blow carries the momentum.
      const swap = this.swapStrikeT > 0 ? 1.5 : 1;
      const force = this.atk.force * this.atkMult * (counter ? 1.5 : 1) * swap;
      const beforeHp = f.hp;
      if (f.hit(Math.round(dmg * swap), this.face, force, crit, { poise: this.atk.poise * this.atkMult * this.w.d.heavyPoiseMult, kx: this.atk.kx * this.face, ky: this.atk.ky, launch: this.atk.launch, heavy: this.atk.heavy, guardBreak: this.atk.guardBreak })) {
        haptic('hit');
        const dealt = beforeHp !== undefined && f.hp !== undefined ? Math.max(0, beforeHp - f.hp) : Math.round(dmg * swap);
        this.w.heroHit(f, dealt, this.atk.heavy, crit);
        this.counterT = 0;
        this.swapStrikeT = 0;
        this.recentHit = 0.65;
        this.noteStyle(this.atk.id);
        this.comboHits++; this.comboT = 1.7;
        this.w.save.bestCombo = Math.max(this.w.save.bestCombo ?? 0, this.comboHits);
        if (this.w.save.flags.relic_taken || !this.powers?.L.storyEnabled) this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + CE_HIT * (1 + skillRank(this.w.save, 'l_radiance') * 0.3));
        if (this.atk.hang && !this.onGround) this.body.setVelocityY(Math.min(this.body.velocity.y, this.atk.hang));
        if (this.w.d.lifesteal) this.hp = Math.min(this.maxHp, this.hp + dmg * swap * this.w.d.lifesteal);
        this.w.hitstop(this.atk.heavy ? 0.05 : this.combo === 2 || crit ? 0.028 : 0.012);
      }
    }
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
      this.w.floatText(this.x, this.body.top - 10, 'PARRY', '#fff1c4');
      this.powers?.onParry();
      if (this.w.d.sets.vigil >= 3 && this.vigilParryCd <= 0) { this.vigilParryCd = 3; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05); this.w.save.ce = Math.min(this.maxCe, this.w.save.ce + 8); }
      valorTrack.parry(); haptic('parry'); input.rumble(0.7, 0.5, 150);
      this.w.playEffect('parryPerfect');
      this.w.hitstop(0.08);
      return false;
    }
    // The original's armour: damage reduction from Endurance and gear (half of it against hazards).
    const dr = this.w.d.dr * (h.hazard ? 0.5 : 1);
    const protection = h.hazard ? 1 : (this.armorLight > 0 ? 0.6 : 1) * (this.mantleT > 0 ? 0.5 : 1) * (this.powers?.guardAura ?? 1);
    const dmgBeforeGuard = h.dmg * runBlessings.incoming * (1 - dr) * protection;
    let dmg = dmgBeforeGuard;
    if (!h.hazard && !h.unblockable && (this.state === 'block' || this.state === 'parry') && facing) {
      dmg = Math.max(1, Math.round(dmg * (this.combatStyle === 'sentinel' ? 0.2 : 0.25)));
      this.hp = Math.max(0, this.hp - dmg); this.sinceHurt = 0; if (this.hp <= 0) this.die();
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
    this.hp = Math.max(0, this.hp - dmg);
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
    if (this.lion > 0 || this.mantleT > 0) return true;
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
    let f = 0;
    const vx = Math.abs(b.velocity.x);
    if (this.state === 'dead' || this.state === 'hurt') f = 14;
    else if (this.state === 'dodge' || this.state === 'airdash') f = this.st < 0.13 ? 12 : 13;
    else if (this.state === 'phantom') f = 15;
    else if (this.state === 'plunge') f = 11;
    else if (this.state === 'attack') f = this.st / this.atk.t < this.atk.hit[0] ? 10 : 11;
    else if (this.state === 'charge' || this.state === 'parry' || this.state === 'block') f = 10;
    else if (this.state === 'heal' || this.state === 'cast') f = 15;
    else if (!this.onGround) f = b.velocity.y < 0 ? 8 : 9;
    else if (vx > 24) { this.stride += dt * (vx / RUN) * 11; f = 4 + (Math.floor(this.stride) % 4); }
    else f = Math.floor(this.w.sc.time.now / 1000 * 3.8) % 4;
    if (['execute', 'transform', 'scripted'].includes(this.state)) f = this.powers?.frame ?? f;
    const clip = this.hero === 'tirzah' ? this.state === 'bow' ? 'bowDraw' : this.state === 'dodge' ? 'dodge' : !this.onGround ? b.velocity.y < 0 ? 'jump' : 'fall' : vx > 24 ? 'run' : 'idle' : this.state === 'attack' || this.state === 'plunge' ? this.atk.clip : '';
    const uArt = this.state === 'bow' ? this.bow.drawing ? this.bow.charge / 1.2 : Math.max(0, this.bow.recovery / 0.28) : this.state === 'attack' || this.state === 'plunge' ? this.st / this.atk.t : this.state === 'dodge' ? this.st / DODGE_T : clip === 'run' ? (this.stride / 4) % 1 : (G.time * 0.6) % 1;
    const key = clip ? actionAtlas(this.w.sc,this.hero,this.w.d.family) : 'elior';
    const frame = clip ? actionFrame(this.w.sc,key,clip,Phaser.Math.Clamp(uArt,0,0.999)) : null;
    if (frame) { this.sprite.setTexture(key,frame).setOrigin(0.5,80/96).setScale(1); }
    else this.sprite.setTexture('elior',f).setOrigin(0.5,FOOT/FRAME).setScale(DRAW/FRAME);
    this.sprite.setFlipX(this.face < 0);
    this.sprite.setPosition(Math.round(b.center.x), Math.round(b.bottom));
    // Blink while invulnerable after a blow.
    this.sprite.setAlpha(this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 20) % 2 === 0 ? 0.35 : 1);
    if (this.state === 'dead') this.sprite.setAngle(this.face * -Math.min(80, this.st * 300));
    else this.sprite.setAngle(this.water.swimming && vx > 25 ? this.face * Math.min(65, vx * 0.45) : 0);
    this.trailT-=dt;
    const streak=!settings.reduceFlashes&&settings.quality!=='low'&&this.hero==='elior'&&((this.state==='attack'&&(this.atk.air||this.atk.heavy))||(this.state==='dodge'&&this.combatStyle==='wraith'));
    for(const ghost of this.trail){ghost.life=this.dead||settings.reduceFlashes?0:Math.max(0,ghost.life-dt);ghost.sprite.setVisible(ghost.life>0).setAlpha(ghost.life*1.6);}
    if(streak&&this.trailT<=0){const ghost=this.trail.find(g=>g.life<=0);if(ghost){ghost.life=0.18;ghost.sprite.setTexture(this.sprite.texture.key,this.sprite.frame.name).setPosition(this.sprite.x,this.sprite.y).setOrigin(this.sprite.originX,this.sprite.originY).setScale(this.sprite.scaleX,this.sprite.scaleY).setFlipX(this.sprite.flipX).setAngle(this.sprite.angle);}this.trailT=0.055;}
    // The blade's arc shows from the moment it lands until the swing ends.
    const u = this.state === 'attack' ? this.st / this.atk.t : 0;
    const show = this.state === 'attack' && u >= this.atk.hit[0] && u <= this.atk.hit[1] + 0.15;
    this.slash.setVisible(show);
    if (show) {
      const k = (u - this.atk.hit[0]) / (this.atk.hit[1] + 0.15 - this.atk.hit[0]);
      const big = this.atk.heavy ? 1.2 + this.atkMult * 0.25 : this.combo === 2 ? 1.25 : 1;
      this.slash.setPosition(b.center.x + this.face * 20, b.center.y - 2)
        .setFlipX(this.face < 0)
        .setScale(big, this.atk.heavy ? 1.3 : 1)
        .setAngle(this.face * (this.combo === 1 ? 20 : -10))
        .setTint(this.atk.heavy ? 0xffd27a : 0xffffff)
        .setAlpha(1 - k);
    }
    // Charge glow, the parry flash, the shield bubble.
    const g = this.aura.clear();
    if (this.water.showT > 0) { const f = this.water.breath / 20; g.lineStyle(1.8, f < 0.3 ? 0xff6a6a : 0x8fdcff, this.water.showT).beginPath().arc(this.x + this.face * 16, this.feet - 43, 6, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, f) * Math.PI * 2).strokePath(); }
    if (this.state === 'charge') {
      const r = 10 + this.chargeLvl * 6 + Math.sin(this.st * 30) * 1.5;
      g.lineStyle(1.5, this.chargeLvl >= 2 ? 0xfff1c4 : 0xe8c27a, 0.8).strokeCircle(b.center.x, b.center.y, r);
    }
    if (this.parryT > 0) g.lineStyle(2, 0xfff6dc, 0.9).strokeCircle(b.center.x + this.face * 8, b.center.y - 2, 9);
    else if (this.state === 'block') g.lineStyle(1.5, 0xffe6a8, 0.5).strokeCircle(b.center.x + this.face * 8, b.center.y - 2, 9);
    if (this.shieldT > 0) g.lineStyle(2, 0x9fd8ff, 0.4 + 0.3 * Math.sin(this.st * 20)).strokeCircle(b.center.x, b.center.y, 22);
    if (this.lion > 0) g.lineStyle(1.5, 0xffb347, 0.6).strokeCircle(b.center.x, b.center.y, 20);
    if (this.armorLight > 0) g.lineStyle(2, 0xffe6a8, 0.7).strokeRoundedRect(b.left - 5, b.top - 4, b.width + 10, b.height + 8, 6);
    if (this.mendT > 0) g.fillStyle(0x9de6bb, 0.7).fillCircle(b.center.x + Math.sin(this.st * 5) * 13, b.center.y + Math.cos(this.st * 5) * 20, 2);
    if (this.counterT > 0) g.fillStyle(0xfff1c4, 0.7).fillCircle(b.center.x + this.face * 10, b.top - 2, 1.5);
  }
}
