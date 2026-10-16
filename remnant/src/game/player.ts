// Elior: movement, combos, charge attacks, dodge, parry/block/counter,
// executions, healing, ability casting, and his evolving appearance.

import { Entity, type HitInfo } from './entity';
import { moveBody, touchesTile } from './physics';
import { T } from './tiles';
import { Animator, solve, Chain, drawRibbon, newJoints, type Joints, type Pose, BASE_POSE } from '../render/skeleton';
import { drawHumanoid, drawTrail, type HumanStyle } from '../render/actors';
import { glow, rgba, circle, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { input } from '../core/input';
import { clamp, approach, rand, sign, type Rect } from '../core/math';
import { G, flag } from './ctx';
import { sfx } from '../audio/audio';
import { MOVESETS, clipsFor, extraFor, type AttackDef, type Moveset } from './weapons';
import { ITEMS, RARITY_COLORS, ABILITIES, type AbilityId, type WeaponFamily } from './data';
import { getItem, skillRank } from './state';
import { castAbility } from './abilities';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { Proj } from './projectiles';
import { beginFinisher, updateFinisher, killBlow, riseAsShadow, type FinState } from './finishers';
import { throwSub } from './subweapons';
import { strikeLamps } from './lamps';
import { weaponElement, elementHit, powerTier, powerDamage, isSovereign, slashColors, drawAura, auraLight, ELEMENTS } from './power';
import {
  SHADE, SHADE_GHOST, mantleUnlocked, mantleGain, beginTransform, updateTransform, skipTransform, tickMantle, endMantle,
  mantleStyle, drawMantleBack, drawMantleOverlay, mantleLights,
} from './mantle';

const GRAV = 1500;
const MAX_FALL = 560;
const RUN = 142;
const JUMP_V = 430;
const DJUMP_V = 400;

export const DIMS = { torso: 12.5, head: 4.6, neck: 1.5, upperArm: 7, foreArm: 6.6, thigh: 8.2, shin: 8.2, shoulderSpread: 1.4, hipSpread: 1.5 };

/** How long the pause branch after the second strike stays open. */
const LINGER_LONG = 0.62;

type PState = 'free' | 'attack' | 'charge' | 'dodge' | 'airdash' | 'parry' | 'block' | 'hurt' | 'heal' | 'cast' | 'execute' | 'plunge' | 'dead' | 'scripted' | 'phantom' | 'transform';

/** Covenant Energy spent per Phantom Step blink, and for Judgment Cross. */
const PHANTOM_COST = 5;
const CROSS_COST = 10;
const COMBO_RANKS: [number, string][] = [[50, 'REMNANT'], [35, 'UNBROKEN'], [20, 'RELENTLESS'], [10, 'FIERCE']];

interface Ghost { x: number; y: number; face: number; pose: Pose; a: number; rot: number; shade?: boolean }

export class Player extends Entity {
  anim: Animator;
  family: WeaponFamily = 'blade';
  moves: Moveset = MOVESETS.blade;
  j: Joints = newJoints();
  pose: Pose = { ...BASE_POSE };
  state: PState = 'free';
  st = 0;
  coyote = 0;
  jumpBuf = 0;
  airJumps = 0;
  airDash = 1;
  airAttacks = 0;
  atk: AttackDef | null = null;
  atkT = 0;
  atkHit = new Set<number>();
  combo = 0;
  queued: 'attack' | null = null;
  queuedT = 0;
  chargeT = 0;
  chargeLvl = 0;
  chargeFromTap = false;
  parryT = 0;
  parryCd = 0;
  counterT = 0;
  sinceDodge = 9;
  healDone = false;
  castId: AbilityId | null = null;
  castFired = false;
  hurtT = 0;
  lion = 0;
  armorLight = 0;
  shieldT = 0;
  veiled = 0;
  untouchable = 0;
  cds: Partial<Record<AbilityId, number>> = {};
  trail: number[] = [];
  trailFade = 0;
  scarf: Chain;
  cape: Chain;
  ghosts: Ghost[] = [];
  ghostT = 0;
  execTarget: Entity | null = null;
  execPhase = 0;
  fin: FinState | null = null;
  /** Sword-wave rhythm for the higher power tiers. */
  waveN = 0;
  scriptX: number | null = null;
  scriptSpeed = 60;
  landT = 0;
  wasGround = true;
  fallSpeed = 0;
  lastSafe = { x: 0, y: 0 };
  hazardT = 0;
  lastWpn = { bx: 0, by: 0, tx: 0, ty: 0 };
  style!: HumanStyle;
  styleKey = '';
  deadT = 0;
  private drawnFace = 1;
  private turnAt = -1;
  attackHeldFrom = 0;
  /** Combo counter: hits landed in a row, reset after a short lull. */
  comboHits = 0;
  comboT = 0;
  bestCombo = 0;
  lastHitAt = -9;
  /** Phantom Step chain state. */
  phantomN = 0;
  phantomUntil = 0;
  phantomLast: Entity | null = null;
  phantomStruck = new Set<number>();
  phantomTarget: Entity | null = null;
  phantomFrom = { x: 0, y: 0 };
  phantomTo = { x: 0, y: 0 };
  /** Index of the current hit inside a multi-hit attack. */
  atkSeg = -1;
  atkStartAt = 0;
  /** The attack that just finished stays "open" briefly for branch inputs. */
  linger: string | null = null;
  lingerT = 0;
  /** Buffered Heavy press, so branch inputs made a beat early still count. */
  heavyQ = 0;
  ceRegenDelay = 0;
  aura = 0;
  stepCount = 0;
  /** Shadow Mantle: seconds left in the form, its full length, and the transformation sequence. */
  mantleT = 0;
  mantleMax = 0;
  transformT = 0;
  burstDone = false;
  shadeT = 0;
  cloak: Chain;
  /** Recent eye positions (x, y pairs) for the trail of light while transformed. */
  eyeTrail = new Float32Array(20);
  eyeN = 0;
  /** Seconds before another sub-weapon can be thrown. */
  subCd = 0;

  constructor(x: number, y: number) {
    super(x, y, 12, 34);
    this.team = 'player';
    this.anim = new Animator(clipsFor('blade'));
    this.anim.play('idle', 0);
    this.anim.onStep = () => this.footstep();
    this.scarf = new Chain(7, 3.2, x, y - 28);
    this.cape = new Chain(8, 3.8, x, y - 26);
    this.cloak = new Chain(8, 3.7, x, y - 26);
    this.layer = 8;
    this.lastSafe = { x, y };
  }

  // ---------------------------------------------------------------- equipment & look
  refreshLook() {
    const s = G.save;
    const d = G.d;
    if (d.family !== this.family) {
      this.family = d.family;
      this.moves = MOVESETS[this.family];
      this.anim.clips = clipsFor(this.family);
      this.anim.play('idle', 0.1, true);
    }
    const helm = getItem(s, s.equipment.helm);
    const armor = getItem(s, s.equipment.armor);
    const gl = getItem(s, s.equipment.gauntlets);
    const bt = getItem(s, s.equipment.boots);
    const wp = getItem(s, s.equipment.weapon);
    const key = [helm?.id, armor?.id, gl?.id, bt?.id, wp?.id, wp?.plus, wp?.rarity, s.level, flag('relic_taken'), this.armorLight > 0, this.mantleT > 0].join('|');
    if (key === this.styleKey && this.style) return;
    this.styleKey = key;
    const hl = helm ? ITEMS[helm.id].look ?? 0 : -1;
    const al = armor ? ITEMS[armor.id].look ?? 0 : 0;
    const gLook = gl ? ITEMS[gl.id].look ?? 0 : 0;
    const bLook = bt ? ITEMS[bt.id].look ?? 0 : 0;
    const helmKind: HumanStyle['helm'] = hl === 3 ? 'crown' : hl === 2 ? 'visor' : hl === 1 ? 'cap' : 'none';
    const plate = al >= 2 ? { c: '#1e1c22', dark: '#121016', hi: '#e2b85a', tier: 2 } : al === 1 ? { c: '#6c6a70', dark: '#46444a', hi: '#b8b8c0', tier: 1 } : null;
    const lv = s.level;
    const relic = flag('relic_taken');
    const wb = wp ? ITEMS[wp.id] : ITEMS.militia_sword;
    const plus = wp?.plus ?? 0;
    const rar = wp?.rarity ?? 0;
    let wGlow: string | null = null;
    let wAmt = 0;
    if (plus >= 3 || rar >= 3 || wb.id === 'covenant_blade') {
      wGlow = rar >= 4 ? RARITY_COLORS[rar] : '#ffd27a';
      wAmt = Math.min(1, 0.4 + plus * 0.12 + Math.max(0, rar - 2) * 0.15);
    }
    // Elemental weapons glow their element's colour.
    const el = wb.element;
    if (el) {
      wGlow = ELEMENTS[el].c;
      wAmt = Math.max(wAmt, 0.65);
    }
    // The Sovereign: black and gold, eyes burning violet.
    const sov = lv >= 100;
    this.style = {
      skin: '#e0b28c',
      hair: '#1a1316',
      hairKind: 'spiky',
      coat: sov ? '#16131e' : lv >= 7 ? '#1f2a48' : '#26304e',
      coatDark: sov ? '#0c0a12' : '#19203a',
      skirt: 9,
      trim: lv >= 3 ? (lv >= 6 ? '#e2b85a' : '#9a7a4a') : null,
      pants: '#38302e',
      boots: bLook === 1 ? '#6a6a72' : bLook === 2 ? '#7a5a3a' : '#3d2c22',
      glove: gLook === 1 ? '#a07038' : gLook === 2 ? '#2c2a32' : '#4a3426',
      belt: '#3a2a1a',
      plate,
      helm: helmKind,
      helmColor: hl === 2 ? '#2a2830' : '#6d6a66',
      helmTrim: hl === 2 ? '#e2b85a' : undefined,
      eye: sov ? '#c9a8ff' : '#ffe08a',
      eyeGlow: sov ? 1 : lv >= 50 ? 0.5 : 0,
      outline: '#0a070c',
      weapon: wb.family === 'spear' ? 'spear' : wb.family === 'greatsword' ? 'greatsword' : 'blade',
      weaponColor: wb.id === 'judgment_greatsword' ? '#e8d8a8' : wb.id === 'covenant_blade' ? '#e8e4dc' : '#c9ced6',
      weaponGlow: wGlow,
      weaponGlowAmt: wAmt,
      weaponFlame: plus >= 5 || el === 'fire' || sov,
      offhand: 'none',
      runes: relic && lv >= 4 ? '#ffd27a' : null,
      crack: null,
      bulk: 1,
      scarf: '#8f2a2a',
    };
    if (this.mantleT > 0) this.style = mantleStyle(this.style);
  }

  // ---------------------------------------------------------------- helpers
  get grounded() {
    return this.body.onGround;
  }
  hasDouble() {
    return G.save.keyItems.includes('eagle_wings');
  }
  isInvuln() {
    return this.invuln > 0 || this.untouchable > 0 || this.state === 'execute' || this.state === 'dead' || this.state === 'phantom' || this.state === 'transform' ||
      (this.state === 'attack' && (this.atk?.id === 'cross' || this.atk?.id === 'pstrike') && this.atkT < 0.12) ||
      (this.state === 'dodge' && this.st > 0.02 && this.st < 0.28) || (this.state === 'airdash' && this.st < 0.15) || this.shieldT > 0 || G.inCutscene;
  }

  private setState(s: PState) {
    this.state = s;
    this.st = 0;
  }

  footstep() {
    if (!this.grounded) return;
    const t = this.body.groundTile;
    const name = t === T.Wood || t === T.OneWay ? 'stepWood' : G.world.room.biome === 'village' ? 'stepAsh' : 'step';
    sfx(name, { vol: 0.55, pitch: rand(0.9, 1.1), gap: 60 });
    // A puff of ash or stone dust kicked back from each stride.
    const biome = G.world.room.biome;
    const dust = biome === 'village' ? '#6a6070' : biome === 'crypt' ? '#4a4858' : biome === 'sanctum' ? '#7a6440' : '#6a5e54';
    if (Math.random() < (biome === 'village' ? 0.7 : 0.45)) fx.dust(this.x - this.face * 4, this.y, 1, 0.4, dust);
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    const d = G.d;
    const b = this.body;
    this.refreshLook();
    // timers
    this.st += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.untouchable = Math.max(0, this.untouchable - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.queuedT = Math.max(0, this.queuedT - dt);
    if (this.queuedT <= 0) this.queued = null;
    this.sinceDodge += dt;
    this.lion = Math.max(0, this.lion - dt);
    if (this.armorLight > 0) {
      this.armorLight = Math.max(0, this.armorLight - dt);
      if (this.armorLight === 0) this.styleKey = '';
    }
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.veiled = Math.max(0, this.veiled - dt);
    this.subCd = Math.max(0, this.subCd - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.lingerT = Math.max(0, this.lingerT - dt);
    if (this.lingerT <= 0) this.linger = null;
    if (this.phantomN > 0 && G.time > this.phantomUntil && this.state !== 'phantom') {
      this.phantomN = 0;
      this.phantomStruck.clear();
      this.phantomLast = null;
    }
    if (this.comboHits > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.endCombo();
    }
    for (const k of Object.keys(this.cds) as AbilityId[]) this.cds[k] = Math.max(0, (this.cds[k] ?? 0) - dt);
    // Covenant Energy regeneration
    if (flag('relic_taken')) {
      this.ceRegenDelay = Math.max(0, this.ceRegenDelay - dt);
      if (this.ceRegenDelay <= 0 && this.veiled <= 0) G.save.ce = Math.min(d.maxCe, G.save.ce + 2.6 * d.ceRegen * dt);
    }
    G.save.hp = Math.min(G.save.hp, d.maxHp);

    if (this.state === 'dead') {
      this.deadT += dt;
      b.vx = approach(b.vx, 0, 600 * dt);
      b.vy = Math.min(MAX_FALL, b.vy + GRAV * dt);
      moveBody(b, dt, G.world.grid, G.world.solid);
      this.animate(dt);
      return;
    }

    const ctrl = !G.inCutscene && this.state !== 'scripted';
    if (ctrl) this.handleInput(dt);
    else this.scripted(dt);

    // physics
    let g = GRAV;
    if (this.state === 'airdash' || this.state === 'execute' || this.state === 'phantom' || this.state === 'transform') g = 0;
    else if (this.state === 'attack' && (this.atk?.id === 'pstrike' || this.atk?.id === 'cross') && !b.onGround) g = GRAV * 0.22;
    else if (this.state === 'attack' && this.atk?.air) g = GRAV * (this.atk.id === 'air3' ? 0.9 : 0.32);
    else if (this.state === 'charge' && !b.onGround) g = GRAV * 0.5;
    if (b.vy < 0 && !input.down('jump') && this.state === 'free' && !this.launchCarry) b.vy += GRAV * 0.9 * dt;
    b.vy = Math.min(this.state === 'plunge' ? 620 : MAX_FALL, b.vy + g * dt);
    const preVy = b.vy;
    moveBody(b, dt, G.world.grid, G.world.solid);
    if (b.onGround) {
      if (!this.wasGround) this.onLand(preVy);
      this.coyote = 0.1;
      this.airJumps = this.hasDouble() ? 1 : 0;
      this.airDash = 1;
      this.airAttacks = 0;
      this.launchCarry = false;
      if (!touchesTile(b, G.world.grid, (t) => t === T.Spikes || t === T.Veil, 0) && b.groundTile !== T.Collapse) {
        this.lastSafe.x = b.x;
        this.lastSafe.y = b.y;
      }
    }
    this.wasGround = b.onGround;
    this.fallSpeed = preVy;

    // hazards
    this.hazardT = Math.max(0, this.hazardT - dt);
    if (touchesTile(b, G.world.grid, (t) => t === T.Spikes, 3) && this.hazardT <= 0) {
      this.hazard(14, true);
    } else if (touchesTile(b, G.world.grid, (t) => t === T.Veil, 3) && this.hazardT <= 0) {
      this.hazard(8, false);
    }

    this.animate(dt);
    this.updateCloth(dt);
    this.updateTrail(dt);
    // afterimages
    if (this.state === 'airdash' || this.state === 'dodge' || (this.state === 'attack' && this.atk?.id === 'dash')) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.035;
        this.ghosts.push({ x: this.x, y: this.y, face: this.face, pose: { ...this.pose }, a: 0.5, rot: this.pose.rot });
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].a -= dt * (this.ghosts[i].shade ? 2.2 : 2.6);
      if (this.ghosts[i].a <= 0) this.ghosts.splice(i, 1);
    }
    tickMantle(this, dt);
    this.aura = approach(this.aura, this.armorLight > 0 || this.lion > 0 ? 1 : 0, dt * 3);
  }
  launchCarry = false;

  hazard(dmg: number, respawn: boolean) {
    this.hazardT = 0.6;
    if (this.isInvuln() && !respawn) return;
    const before = G.save.hp;
    this.takeHit({ dmg, poise: 99, kx: 0, ky: -280, dir: 0, kind: 'hazard', unblockable: true });
    if (respawn && G.save.hp > 0 && G.save.hp < before) {
      // Back to the last safe footing after spikes.
      G.ui.fade(1, 0.15).then(() => {
        this.x = this.lastSafe.x;
        this.y = this.lastSafe.y - 1;
        this.body.vx = this.body.vy = 0;
        this.scarf.reset(this.x, this.y - 28);
        this.cape.reset(this.x, this.y - 26);
        this.cloak.reset(this.x, this.y - 26);
        this.eyeN = 0;
        G.camera.snapTo(this.x, this.y - 30);
        G.ui.fade(0, 0.25);
      });
    }
  }

  onLand(vy: number) {
    if (this.state === 'plunge' || (this.state === 'attack' && this.atk?.dive)) {
      this.plungeImpact();
      return;
    }
    if (vy > 180) {
      this.landT = 0.12;
      sfx('land', { vol: Math.min(1, vy / 500) });
      fx.dust(this.x, this.y, vy > 400 ? 8 : 4, vy / 400);
      if (vy > 480) G.camera.addTrauma(0.15);
    }
  }

  // ---------------------------------------------------------------- input-driven states
  private handleInput(dt: number) {
    const b = this.body;
    const d = G.d;
    const ax = input.axisX;
    const speedMul = d.speed * (this.veiled > 0 ? 0.6 : 1) * (this.lion > 0 ? 1.08 : 1) * (this.mantleT > 0 ? 1.22 : 1);
    // The Mantle can be called from almost anything, even a stagger.
    if (input.pressed('transform') && this.state !== 'transform' && this.state !== 'execute' && this.state !== 'phantom' && this.state !== 'heal' && this.state !== 'plunge') {
      if (this.tryTransform()) return;
    }
    if (input.pressed('jump')) this.jumpBuf = 0.13;
    if (input.pressed('attack')) {
      this.queued = 'attack';
      this.queuedT = 0.28;
      this.attackHeldFrom = G.time;
    }
    this.heavyQ = input.pressed('heavy') ? 0.26 : Math.max(0, this.heavyQ - dt);

    switch (this.state) {
      case 'free': {
        const target = ax * RUN * speedMul;
        const accel = b.onGround ? 1500 : 1050;
        b.vx = approach(b.vx, target, accel * dt);
        if (Math.abs(ax) > 0.2) this.face = sign(ax);
        // jump / drop / double jump
        if (this.jumpBuf > 0) {
          if (input.aimDown && b.onGround && this.onOneWay()) {
            b.dropT = 0.25;
            b.onGround = false;
            this.jumpBuf = 0;
          } else if (b.onGround || this.coyote > 0) {
            b.vy = -JUMP_V;
            b.onGround = false;
            this.coyote = 0;
            this.jumpBuf = 0;
            this.anim.play('jump', 0.05, true);
            sfx('jump', { vol: 0.6 });
            fx.dust(this.x, this.y, 3, 0.6);
          } else if (this.airJumps > 0) {
            this.airJumps--;
            b.vy = -DJUMP_V;
            this.jumpBuf = 0;
            this.anim.play('flip', 0.03, true);
            sfx('dash', { vol: 0.5, pitch: 1.4 });
            fx.ring(this.x, this.y - 4, 4, 22, '#ffe6a8', 0.3, 2, 0.35);
            for (let i = 0; i < 6; i++) fx.spawn(PK.Petal, this.x + rand(-6, 6), this.y - 6, rand(-40, 40), rand(10, 60), rand(0.6, 1), 1.6, 1, '#fff3d6', 60, 1.5);
          }
        }
        this.tryActions(dt);
        break;
      }
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'charge':
        this.updateCharge(dt);
        break;
      case 'dodge': {
        const t = this.st / 0.34;
        b.vx = this.face * 300 * (1 - t * 0.55) * speedMul;
        if (this.st > 0.16 && input.pressed('attack')) {
          this.startAttack(this.moves.dash);
          break;
        }
        if (this.st >= 0.34) {
          this.setState('free');
          this.sinceDodge = 0;
        }
        if (!b.onGround && this.st > 0.1) {
          this.setState('free');
          this.sinceDodge = 0;
        }
        break;
      }
      case 'airdash': {
        b.vx = this.face * 360;
        b.vy = 0;
        if (this.st >= 0.18) {
          this.setState('free');
          b.vx = this.face * RUN;
          this.sinceDodge = 0;
        }
        break;
      }
      case 'parry': {
        b.vx = approach(b.vx, 0, 1400 * dt);
        if (this.st > 0.12 && this.counterT > 0 && input.pressed('attack')) {
          this.startCounter();
          break;
        }
        if (this.st >= 0.24) {
          if (input.down('parry')) this.setState('block');
          else this.setState('free');
        }
        break;
      }
      case 'block': {
        b.vx = approach(b.vx, ax * 40, 900 * dt);
        if (this.counterT > 0 && input.pressed('attack')) {
          this.startCounter();
          break;
        }
        if (!input.down('parry')) this.setState('free');
        if (input.pressed('dodge')) this.startDodge();
        if (input.pressed('jump') && b.onGround) {
          this.setState('free');
          this.jumpBuf = 0.13;
        }
        break;
      }
      case 'hurt': {
        b.vx = approach(b.vx, 0, 500 * dt);
        if (this.st >= this.hurtT) this.setState('free');
        break;
      }
      case 'heal': {
        b.vx = approach(b.vx, ax * 30, 800 * dt);
        if (!this.healDone && this.st >= 0.5) {
          this.healDone = true;
          const amt = G.d.maxHp * (0.42 + (skillRank(G.save, 'g_balm') ? 0.15 : 0));
          G.save.hp = Math.min(G.d.maxHp, G.save.hp + amt);
          fx.holyBurst(this.x, this.y - 20, 10, 0.6);
          fx.number(this.x, this.y - 44, '+' + Math.round(amt), false, '#9fe39a');
          sfx('heal');
          G.ui.refreshHud();
        }
        if (this.st >= 0.9) this.setState('free');
        if (this.healDone && input.pressed('dodge')) this.startDodge();
        break;
      }
      case 'cast': {
        b.vx = approach(b.vx, 0, 1200 * dt);
        if (!this.castFired && this.st >= 0.12 && this.castId) {
          this.castFired = true;
          castAbility(this, this.castId);
        }
        // No castId: a sub-weapon throw, which only borrows the pose.
        if (this.st >= (this.castId === 'armor_light' || this.castId === 'lion' ? 0.6 : this.castId ? 0.36 : 0.2)) this.setState('free');
        if (this.castFired && this.st > 0.2 && input.pressed('dodge')) this.startDodge();
        break;
      }
      case 'execute':
        this.updateExecute(dt);
        break;
      case 'phantom':
        this.updatePhantom();
        break;
      case 'transform':
        if (updateTransform(this, dt)) this.setState('free');
        break;
      case 'plunge': {
        b.vx = approach(b.vx, 0, 600 * dt);
        b.vy = Math.max(b.vy, 520);
        this.activeHits(this.moves.plunge, 1);
        if (this.st > 1.8) this.setState('free');
        break;
      }
    }
  }

  private onOneWay() {
    const b = this.body;
    return b.groundTile === T.OneWay;
  }

  private tryActions(dt: number) {
    const b = this.body;
    const s = G.save;
    if (this.queued === 'attack' && this.phantomN >= 3 && G.time < this.phantomUntil && G.save.ce >= CROSS_COST) {
      this.queued = null;
      this.startCross();
      return;
    }
    // Execution has priority on attack.
    if (input.pressed('attack') || (this.queued === 'attack' && this.queuedT > 0.2)) {
      const ex = G.world.executionTarget(this);
      if (ex && b.onGround) {
        this.queued = null;
        this.startExecute(ex);
        return;
      }
    }
    if (this.counterT > 0 && this.queued === 'attack') {
      this.startCounter();
      return;
    }
    // Phantom Step: Dodge right after landing a hit blinks behind the foe.
    if (input.pressed('dodge') && this.canPhantom()) {
      this.startPhantom();
      return;
    }
    // Branches that open for a moment after an attack ends.
    if (this.linger) {
      const m = this.moves;
      // A beat late after the first strike still carries the combo on, so an
      // easy rhythm on a controller isn't punished with a restart.
      if (this.queued === 'attack' && b.onGround && this.linger === m.combo[0].id) {
        this.queued = null;
        this.combo = 1;
        this.startAttack(m.combo[1]);
        return;
      }
      if (this.queued === 'attack' && b.onGround && this.linger === m.combo[1].id) {
        this.queued = null;
        // Right on the beat it is the third strike; a real pause is the Flurry.
        if (LINGER_LONG - this.lingerT < 0.12) {
          this.combo = 2;
          this.startAttack(m.combo[2]);
        } else this.startAttack(m.flurry);
        return;
      }
      if (this.queued === 'attack' && this.linger === m.dash.id) {
        this.queued = null;
        this.startAttack(m.comet);
        return;
      }
      if (this.heavyQ > 0 && b.onGround && (this.linger === m.combo[2].id || this.linger === m.extra.id)) {
        this.heavyQ = 0;
        this.startAttack(m.storm);
        return;
      }
      if ((this.heavyQ > 0 || this.queued === 'attack') && !b.onGround && this.linger === m.air[2].id) {
        this.heavyQ = 0;
        this.queued = null;
        this.startAttack(m.rend);
        return;
      }
    }
    if (input.pressed('dodge')) {
      if (b.onGround) this.startDodge();
      else if (this.airDash > 0) this.startAirDash();
      return;
    }
    // Sub-weapon: its own button, or the old way, up + Heavy.
    if (input.pressed('sub') || ((input.pressed('heavy') || this.heavyQ > 0) && input.aimUp)) {
      this.heavyQ = 0;
      throwSub(this);
      return;
    }
    if (input.pressed('heavy') || this.heavyQ > 0) {
      this.heavyQ = 0;
      if (b.onGround) this.startCharge(false);
      else this.startPlunge();
      return;
    }
    if (this.queued === 'attack') {
      this.queued = null;
      if (!b.onGround) {
        if (input.aimDown) this.startPlunge();
        else if (this.airAttacks < 3) {
          this.startAttack(this.moves.air[Math.min(this.airAttacks, 2)]);
          this.airAttacks++;
        }
      } else if (input.aimUp && !G.world.nearInteractable()) {
        this.startAttack(this.moves.launch);
      } else if (this.sinceDodge < 0.18) {
        this.startAttack(this.moves.dash);
      } else {
        this.combo = 0;
        this.startAttack(this.moves.combo[0]);
      }
      return;
    }
    if (input.pressed('parry') && this.parryCd <= 0) {
      this.startParry();
      return;
    }
    if (input.pressed('heal')) {
      if (s.balm > 0 && b.onGround && s.hp < G.d.maxHp) {
        s.balm--;
        this.healDone = false;
        this.setState('heal');
        this.anim.play('heal', 0.08, true);
        G.ui.refreshHud();
      } else if (s.balm <= 0) {
        G.ui.toast('No Balm left. Rest at an altar to refill.', 'warn');
        sfx('denied');
      }
      return;
    }
    for (let i = 0; i < 3; i++) {
      const a = (['skill1', 'skill2', 'skill3'] as const)[i];
      if (input.pressed(a)) {
        this.tryCast(s.equippedSkills[i]);
        return;
      }
    }
    if (input.pressed('interact') || (input.pressed('up') && G.world.nearInteractable())) {
      G.world.tryInteract();
      return;
    }
    if (input.pressed('ultimate')) {
      G.world.tryRally();
      return;
    }
    if (input.pressed('echo')) {
      G.ui.echoWheel(true);
      return;
    }
    if (input.pressed('switch')) G.world.switchSupport();
  }

  /** Spend a full gauge to put on the Shadow Mantle. */
  tryTransform(): boolean {
    if (!mantleUnlocked() || this.mantleT > 0) return false;
    const g = G.save.mantle ?? 0;
    if (g < 100) {
      G.ui.toast(`The shadows are still gathering (${Math.floor(g)}%). Keep fighting.`, 'warn');
      sfx('denied');
      return false;
    }
    this.setState('transform');
    this.atk = null;
    this.queued = null;
    this.ghosts.length = 0;
    beginTransform(this);
    return true;
  }

  tryCast(id: AbilityId | null) {
    if (!id) {
      G.ui.toast('No ability in that slot. Equip one in the Skills menu.', 'warn');
      sfx('denied');
      return false;
    }
    const def = ABILITIES[id].cost;
    if ((this.cds[id] ?? 0) > 0) {
      sfx('denied');
      return false;
    }
    if (G.save.ce < def) {
      G.ui.toast('Not enough Covenant Energy.', 'warn');
      sfx('denied');
      return false;
    }
    G.save.ce -= def;
    this.ceRegenDelay = 0.8;
    this.castId = id;
    this.castFired = false;
    this.setState('cast');
    this.anim.play(id === 'armor_light' || id === 'lion' || id === 'trumpet' ? 'invoke' : 'cast', 0.05, true);
    G.ui.refreshHud();
    return true;
  }

  /** A quick throw for sub-weapons: on the ground Elior plants and throws; in the air the jump carries on. */
  throwPose() {
    if (this.state !== 'free' || !this.grounded) return;
    this.castId = null;
    this.setState('cast');
    this.anim.play('cast', 0.03, true, 1.6);
  }

  startDodge() {
    this.setState('dodge');
    this.atk = null;
    if (Math.abs(input.axisX) > 0.2) this.face = sign(input.axisX);
    this.anim.play('roll', 0.03, true);
    sfx('dash', { vol: 0.7 });
    fx.dust(this.x, this.y, 4, 0.8);
  }
  startAirDash() {
    this.airDash--;
    this.setState('airdash');
    this.atk = null;
    if (Math.abs(input.axisX) > 0.2) this.face = sign(input.axisX);
    this.anim.play('airdash', 0.03, true);
    sfx('dash', { vol: 0.8, pitch: 1.15 });
    fx.ring(this.x - this.face * 6, this.y - 18, 4, 18, '#ffe6a8', 0.25, 2, 0.6);
  }
  startParry() {
    this.setState('parry');
    this.parryT = G.d.parryWin;
    this.parryCd = 0.32;
    this.anim.play('parry', 0.03, true);
    sfx('swing', { vol: 0.35, pitch: 1.5 });
  }
  startCharge(fromTap: boolean) {
    this.setState('charge');
    this.chargeT = 0;
    this.chargeLvl = 0;
    this.chargeFromTap = fromTap;
    this.anim.play('charge', 0.1, true);
    sfx('charge', { vol: 0.6 });
  }
  startPlunge() {
    this.setState('plunge');
    this.atk = this.moves.plunge;
    this.atkHit.clear();
    this.body.vy = 260;
    this.anim.play('plunge', 0.05, true);
    sfx('swingHeavy', { pitch: 0.8 });
  }
  startCounter() {
    const c = { ...this.moves.counter };
    c.dmg *= skillRank(G.save, 'g_counter') ? 1.7 : 1;
    this.counterT = 0;
    this.startAttack(c);
    G.world.slowmo(0.12, 0.3);
  }

  startAttack(a: AttackDef) {
    this.atk = a;
    this.atkT = 0;
    this.atkSeg = -1;
    this.atkStartAt = G.time;
    this.atkHit.clear();
    this.linger = null;
    this.setState('attack');
    this.anim.play(a.clip, 0.04, true, 1 / (a.dur / this.aspd()));
    if (a.rise && (input.aimUp || a.forceRise)) {
      this.body.vy = a.rise;
      this.body.onGround = false;
      this.launchCarry = true;
    }
    if (a.air && this.body.vy > 0) this.body.vy *= 0.2;
  }

  aspd() {
    return G.d.aspd * this.moves.speed * (this.lion > 0 ? 1.1 : 1) * (this.mantleT > 0 ? 1.2 : 1);
  }

  private updateAttack(dt: number) {
    const a = this.atk!;
    const b = this.body;
    const dur = a.dur / this.aspd();
    this.atkT += dt;
    const u = this.atkT / dur;
    // lunge
    if (a.dive) {
      if (u >= a.hit[0]) {
        b.vx = this.face * 230;
        b.vy = Math.max(b.vy, 470);
      } else {
        b.vx = approach(b.vx, 0, 900 * dt);
        b.vy = Math.min(b.vy, -40);
      }
    } else if (a.lunge && a.lungeT && u >= a.lungeT[0] && u <= a.lungeT[1] && (b.onGround || a.id === 'dash' || a.id === 'flurry')) {
      const ahead = G.world.enemyAhead(this, 14);
      b.vx = this.face * a.lunge * (ahead ? 0.25 : 1);
    } else {
      b.vx = approach(b.vx, a.air ? input.axisX * 70 : 0, (a.air ? 500 : 1100) * dt);
    }
    if (a.air && Math.abs(input.axisX) > 0.3 && u < 0.2) this.face = sign(input.axisX);
    // hits
    if (u >= a.hit[0] && u <= a.hit[1]) {
      if (this.atkT - dt < a.hit[0] * dur) this.onSwing(a);
      if (a.multi && a.multi > 1) {
        const seg = Math.min(a.multi - 1, Math.floor(((u - a.hit[0]) / (a.hit[1] - a.hit[0])) * a.multi));
        if (seg !== this.atkSeg) {
          this.atkSeg = seg;
          this.atkHit.clear();
          this.onSubHit(a, seg);
        }
      }
      if (a.pull) G.world.pullFoes(this.x, this.y - 20, a.pull, dt);
      this.activeHits(a, 1);
    }
    // Phantom Step out of any swing that has connected.
    if (u >= a.hit[0] && input.pressed('dodge') && this.canPhantom()) {
      this.startPhantom();
      return;
    }
    // Holding attack through the third strike whirls into Storm of Edges (touch-friendly).
    if (b.onGround && a.id === this.moves.combo[2].id && input.down('attack') && G.time - this.attackHeldFrom > 0.24 && u > 0.5) {
      return this.startAttack(this.moves.storm);
    }
    // charge on hold (touch-friendly): still holding attack after the first swing
    if (!a.air && input.down('attack') && G.time - this.attackHeldFrom > 0.26 && u > 0.45 && this.combo === 0 && a.id === this.moves.combo[0].id) {
      this.startCharge(true);
      return;
    }
    // cancels
    if (u >= a.cancel) {
      const m = this.moves;
      // Branch combos.
      if (this.heavyQ > 0 && b.onGround && (a.id === m.combo[2].id || a.id === m.extra.id)) {
        this.heavyQ = 0;
        return this.startAttack(m.storm);
      }
      if (!b.onGround && a.id === m.air[2].id && (this.heavyQ > 0 || (this.queued === 'attack' && this.airAttacks >= 3))) {
        this.heavyQ = 0;
        this.queued = null;
        return this.startAttack(m.rend);
      }
      if (this.queued === 'attack' && a.id === m.dash.id) {
        this.queued = null;
        return this.startAttack(m.comet);
      }
      if (this.queued === 'attack' && (a.id === 'pstrike' || a.id === 'cross')) {
        this.queued = null;
        if (a.id === 'pstrike' && this.phantomN >= 3 && G.save.ce >= CROSS_COST) return this.startCross();
        if (!b.onGround) {
          if (this.airAttacks < 3) {
            this.startAttack(m.air[Math.min(this.airAttacks, 2)]);
            this.airAttacks++;
          }
          return;
        }
        this.combo = 1;
        return this.startAttack(m.combo[1]);
      }
      if (input.pressed('dodge')) {
        if (b.onGround) this.startDodge();
        else if (this.airDash > 0) this.startAirDash();
        return;
      }
      if (this.queued === 'attack') {
        const ex = G.world.executionTarget(this);
        if (ex && b.onGround) {
          this.queued = null;
          this.startExecute(ex);
          return;
        }
        this.queued = null;
        if (a.air) {
          if (input.aimDown) return this.startPlunge();
          if (this.airAttacks < 3) {
            this.startAttack(this.moves.air[Math.min(this.airAttacks, 2)]);
            this.airAttacks++;
          }
          return;
        }
        if (!b.onGround) return;
        const isCombo = this.moves.combo.findIndex((c) => c.id === a.id);
        if (isCombo >= 0) {
          const next = isCombo + 1;
          if (next < this.moves.combo.length) {
            this.combo = next;
            return this.startAttack(this.moves.combo[next]);
          }
          if (next === this.moves.combo.length && skillRank(G.save, 'w_relentless')) {
            this.combo = next;
            return this.startAttack(extraFor(this.family));
          }
        }
        this.combo = 0;
        return this.startAttack(this.moves.combo[0]);
      }
      if (input.pressed('jump') && b.onGround) {
        this.setState('free');
        this.jumpBuf = 0.13;
        return;
      }
      if (input.pressed('parry')) return this.startParry();
      if (Math.abs(input.axisX) > 0.5 && u > a.cancel + 0.1 && b.onGround) {
        this.setState('free');
        return;
      }
    }
    if (u >= 1) {
      if (a.auto) {
        const next = (this.moves as unknown as Record<string, AttackDef>)[a.auto];
        if (next) return this.startAttack(next);
      }
      this.setState('free');
      this.atk = null;
      if (!a.air) this.combo = 0;
      this.linger = a.id;
      // The second strike waits longer, so a deliberate pause has room to land.
      this.lingerT = a.id === this.moves.combo[1].id ? LINGER_LONG : 0.34;
    }
  }

  /** Effects for each hit inside a multi-hit attack. */
  private onSubHit(a: AttackDef, seg: number) {
    const f = this.face;
    if (seg > 0) sfx(a.id === 'flurry' ? 'swing' : 'swingHeavy', { vol: 0.55, pitch: rand(1.05, 1.3), gap: 30 });
    if (a.id === 'flurry') {
      const y = this.y - 30 + rand(-6, 6);
      fx.streak(this.x + f * 6, y, this.x + f * rand(34, 44), y + rand(-3, 3), '#fff1c4', 0.12, 2);
    } else if (a.id === 'storm') {
      const dir = seg % 2 ? -1 : 1;
      fx.slash(this.x, this.y - 22, 30, -2.6, 0.5, 9, dir, '#fffaf0', '#e8c27a', 0.16, rand(-0.3, 0.3));
      fx.dust(this.x, this.y, 3, 1);
    } else if (a.id === 'cross') {
      const dir = seg === 0 ? 1 : -1;
      fx.slash(this.x + f * 14, this.y - 30, 40, dir > 0 ? -2.4 : 2.4, dir > 0 ? 0.8 : -0.8, 13, f, '#ffffff', '#ffcf6b', 0.3, dir * 0.4);
      fx.flash('#fff6dc', 0.25);
      G.camera.punch = 0.05;
    } else if (a.id === 'comet') {
      fx.slash(this.x + f * 4, this.y - 30, 30, 1.2, -1.9, 9, f, '#fffaf0', '#e8c27a', 0.18);
    } else if (a.id === 'rend') {
      fx.streak(this.x - f * 18, this.y - 40, this.x + f * 8, this.y - 6, '#ffe6a8', 0.18, 3);
    }
  }

  // ---------------------------------------------------------------- combo counter
  private registerHit() {
    this.comboHits++;
    this.comboT = 1.7;
    this.lastHitAt = G.time;
    if (this.comboHits > this.bestCombo) this.bestCombo = this.comboHits;
    if (this.comboHits > (G.save.bestCombo ?? 0)) G.save.bestCombo = this.comboHits;
  }

  comboRank(): string {
    for (const [n, name] of COMBO_RANKS) if (this.comboHits >= n) return name;
    return '';
  }

  private endCombo() {
    const n = this.comboHits;
    this.comboHits = 0;
    this.comboT = 0;
    if (n >= 10 && this.state !== 'dead') {
      const bonus = Math.round(n * (n >= 35 ? 1.6 : n >= 20 ? 1.2 : 0.8));
      G.world.giveXp(bonus);
      G.world.addRally(n * 0.4);
    }
  }

  // ---------------------------------------------------------------- Phantom Step
  /** A foe worth blinking to, or null. Prefers ones this chain has not struck yet. */
  private findPhantomTarget(): Entity | null {
    const foes = G.world.foes().filter((e) => e.canBeTargeted() && Math.abs(e.x - this.x) < 150 && Math.abs(e.y - this.y) < 100);
    if (!foes.length) return null;
    const dist = (e: Entity) => Math.hypot(e.x - this.x, (e.y - this.y) * 0.7);
    foes.sort((a, b) => dist(a) - dist(b));
    if (this.phantomN > 0) {
      const fresh = foes.find((e) => e !== this.phantomLast && !this.phantomStruck.has(e.id));
      if (fresh) return fresh;
      const other = foes.find((e) => e !== this.phantomLast);
      if (other && foes.length > 1) return other;
    }
    return foes[0];
  }

  canPhantom(): boolean {
    if (!flag('phantom')) return false;
    if (this.state === 'phantom') return false;
    const recent = G.time - this.lastHitAt < 0.65 || (this.phantomN > 0 && G.time < this.phantomUntil);
    if (!recent || (G.save.ce < PHANTOM_COST && !isSovereign() && this.mantleT <= 0)) return false;
    return !!this.findPhantomTarget();
  }

  startPhantom() {
    const t = this.findPhantomTarget();
    if (!t) return;
    if (!isSovereign() && this.mantleT <= 0) G.save.ce -= PHANTOM_COST;
    this.ceRegenDelay = 0.6;
    // Arrive on the far side of the foe; if a wall is there, take the near side.
    const side = this.phantomN > 0 && t === this.phantomLast ? -sign(this.x - t.x) || this.face : sign(t.x - this.x) || this.face;
    const off = t.body.w / 2 + 11;
    let tx = t.x + side * off;
    const ty = t.y;
    const blocked = (x: number) => G.world.solidAt(x, ty - 6) || G.world.solidAt(x, ty - 26) || x < 8 || x > G.world.grid.w * 16 - 8;
    if (blocked(tx)) tx = t.x - side * off;
    if (blocked(tx)) tx = this.x;
    this.phantomFrom = { x: this.x, y: this.y };
    this.phantomTo = { x: tx, y: ty };
    this.phantomTarget = t;
    this.phantomLast = t;
    this.phantomStruck.add(t.id);
    this.phantomN++;
    this.phantomUntil = G.time + 1.0;
    this.atk = null;
    this.queued = null;
    this.setState('phantom');
    this.body.vx = this.body.vy = 0;
    this.ghosts.push({ x: this.x, y: this.y, face: this.face, pose: { ...this.pose }, a: 0.9, rot: this.pose.rot });
    fx.spawn(PK.Smoke, this.x, this.y - 18, 0, -20, 0.5, 6, 16, '#1a1220', -20, 2);
    for (let i = 0; i < 8; i++) fx.spawn(PK.Spark, this.x + rand(-6, 6), this.y - rand(6, 34), rand(-60, 60), rand(-60, 20), 0.25, 1.4, 0.3, this.mantleT > 0 ? SHADE.hi : '#ffe6a8', 0, 4);
    sfx('dash', { vol: 0.8, pitch: 1.6 + Math.min(0.6, this.phantomN * 0.1) });
    G.world.hitstop(0.02);
  }

  private updatePhantom() {
    if (this.st < 0.075) return;
    const t = this.phantomTarget;
    this.x = this.phantomTo.x;
    this.y = this.phantomTo.y;
    this.body.vx = this.body.vy = 0;
    this.body.onGround = false;
    const pc = this.mantleT > 0 ? SHADE.hi : '#ffe6a8';
    fx.streak(this.phantomFrom.x, this.phantomFrom.y - 20, this.x, this.y - 22, pc, 0.22, 3);
    fx.ring(this.x, this.y - 20, 4, 26, pc, 0.25, 2);
    if (t) this.face = sign(t.x - this.x) || this.face;
    const n = this.phantomN;
    const strike = { ...this.moves.pstrike, dmg: this.moves.pstrike.dmg * (1 + Math.min(5, n - 1) * 0.15) };
    this.startAttack(strike);
    this.ghosts.push({ x: this.x - this.face * 8, y: this.y, face: this.face, pose: { ...this.pose }, a: 0.6, rot: 0 });
    if (n === 3) G.ui.hint(`Judgment Cross ready: ${G.world.keyLabel('attack')}`);
  }

  startCross() {
    const t = this.phantomLast && !this.phantomLast.dying ? this.phantomLast : this.findPhantomTarget();
    G.save.ce -= CROSS_COST;
    this.phantomN = 0;
    this.phantomStruck.clear();
    if (t) {
      const side = sign(this.x - t.x) || -this.face;
      const tx = t.x + side * (t.body.w / 2 + 14);
      if (!G.world.solidAt(tx, t.y - 10) && !G.world.solidAt(tx, t.y - 30)) {
        fx.streak(this.x, this.y - 20, tx, t.y - 24, '#fff6dc', 0.25, 4);
        this.x = tx;
        this.y = t.y;
      }
      this.face = sign(t.x - this.x) || this.face;
    }
    this.body.vx = 0;
    this.body.vy = -120;
    this.startAttack(this.moves.cross);
    G.world.slowmo(0.35, 0.35);
    sfx('chargeFull', { pitch: 1.3 });
    fx.ring(this.x, this.y - 24, 6, 60, '#fff1c4', 0.35, 3);
    G.ui.hint(null);
  }

  onSwing(a: AttackDef) {
    sfx(a.sfx, { pitch: rand(0.92, 1.08) * (this.family === 'greatsword' ? 0.8 : 1) });
    const tier = powerTier();
    const el = weaponElement();
    const shade = this.mantleT > 0;
    if (a.arc) {
      const color = this.style.weaponGlow ?? '#fff1c4';
      const [core, edge] = shade ? [SHADE.core, SHADE.edge] : slashColors(this.lion > 0 ? '#ffb347' : color === '#fff1c4' ? '#e8c27a' : color);
      const grow = 1 + tier * 0.07;
      const r = a.arc.r * this.moves.reach ** 0.5 * grow;
      fx.slash(this.x + this.face * a.arc.cx, this.y + a.arc.cy, r, a.arc.a0, a.arc.a1, a.arc.w + tier * 0.6, this.face, core, edge, 0.17 + tier * 0.01);
      // From level 20 a second, wider echo of the cut trails the first.
      if (tier >= 2 || shade) fx.slash(this.x + this.face * a.arc.cx, this.y + a.arc.cy, r * 1.25, a.arc.a0 - 0.15, a.arc.a1 + 0.15, a.arc.w * 0.5, this.face, edge, shade ? SHADE.violet : edge, 0.24);
    }
    // Sword waves: finishers from level 35, every third swing from 75, every swing as a Sovereign.
    this.waveN++;
    // In the Shadow Mantle, every grounded swing looses one.
    const wave = (tier >= 3 && a.finisher) || (tier >= 5 && this.waveN % 3 === 0) || tier >= 6 || shade;
    if (wave && !a.air) {
      const big = tier >= 6 || shade;
      const c = shade ? SHADE.edge : el ? ELEMENTS[el].c : isSovereign() ? '#ffb347' : '#ffd27a';
      G.world.add(new Proj('lightwave', this.x + this.face * 16, this.y - 22, 'player', G.d.atk * (big ? 0.9 : 0.6) * powerDamage(), {
        vx: this.face * (big ? 460 : 380), life: big ? 0.6 : 0.42, w: 18, h: big ? 40 : 30, poise: 10, color: c,
      }));
    }
    if (this.armorLight > 0 && !a.air) {
      G.world.spawnLightWave(this.x + this.face * 14, this.y - 14, this.face, 0.8);
    }
  }

  /** Damage everything the current attack's box overlaps (once per swing). */
  activeHits(a: AttackDef, mult: number) {
    const box = this.attackBox(a);
    strikeLamps(box);
    const d = G.d;
    const crit = Math.random() < d.crit;
    let dmg = d.atk * a.dmg * d.meleeMult * mult * (this.lion > 0 ? 1.35 : 1) * G.world.commanderAura(this.x, this.y) * powerDamage();
    const el = weaponElement();
    const tier = powerTier();
    if (crit) dmg *= d.critDmg;
    const hit: HitInfo = {
      dmg, poise: a.poise * (this.family === 'greatsword' ? 1.3 : 1) * (crit ? 1.3 : 1), kx: a.kx * this.face, ky: a.ky, dir: this.face, kind: 'melee', crit,
      src: this, launch: a.launch, heavy: (a.finisher ?? false) || a.id === 'heavy', guardBreak: a.guardBreak, stop: a.stop,
    };
    const n = G.world.hitEnemies(box, hit, this.atkHit, (e) => {
      this.registerHit();
      // per-hit feedback
      G.save.ce = Math.min(d.maxCe, G.save.ce + (flag('relic_taken') ? 2.4 * (skillRank(G.save, 'l_radiance') ? 1.3 : 1) : 0));
      G.world.addRally(1.4);
      if (a.hang && !this.body.onGround) this.body.vy = Math.min(this.body.vy, a.hang);
      if (a.finisher) G.world.echoAssist(e);
      if (d.lifesteal > 0) G.save.hp = Math.min(d.maxHp, G.save.hp + dmg * d.lifesteal);
      if (el) elementHit(e, el, dmg, this.face, !!a.finisher);
      // The Mantle drinks from every cut and answers it with a shadow blade.
      if (this.mantleT > 0 && el !== 'shadow') elementHit(e, 'shadow', dmg * 0.6, this.face, !!a.finisher);
      if (tier >= 3 || this.mantleT > 0) fx.ring(e.cx, e.cy, 4, 18 + tier * 4, this.mantleT > 0 ? SHADE.edge : el ? ELEMENTS[el].c : '#ffe6a8', 0.18, 2);
      mantleGain(crit ? 1.7 : 1.1);
      if (e.dying) {
        killBlow(this, e, a.arc?.a0 ?? -1.2, a.arc?.a1 ?? 0.8);
        mantleGain(5);
        if (this.mantleT > 0 && !isSovereign() && Math.random() < 0.4) G.world.after(0.6, () => riseAsShadow(e));
      }
    });
    if (n > 0) {
      G.camera.addTrauma(a.shake * shakeScale() * (1 + tier * 0.08));
      if (tier >= 1) G.world.hitstop((a.stop ?? 0.04) * tier * 0.08);
      if (a.finisher || crit) G.camera.punch = 0.035 + tier * 0.006;
    }
  }

  attackBox(a: AttackDef): Rect {
    const reach = this.moves.reach;
    const w = a.box.w * (this.family === 'spear' ? 1 : reach);
    const x = this.face > 0 ? this.x + a.box.x : this.x - a.box.x - w;
    return { x, y: this.y + a.box.y, w, h: a.box.h };
  }

  private updateCharge(dt: number) {
    const b = this.body;
    const mastery = skillRank(G.save, 'w_mastery') > 0;
    this.chargeT += dt * (mastery ? 1.35 : 1);
    b.vx = approach(b.vx, 0, 1200 * dt);
    if (Math.abs(input.axisX) > 0.3) this.face = sign(input.axisX);
    const lvl = this.chargeT >= 1.4 && mastery ? 3 : this.chargeT >= 0.85 ? 2 : this.chargeT >= 0.35 ? 1 : 0;
    if (lvl > this.chargeLvl) {
      this.chargeLvl = lvl;
      sfx(lvl >= 2 ? 'chargeFull' : 'charge', { pitch: 1 + lvl * 0.2 });
      fx.ring(this.x, this.y - 22, 6, 26 + lvl * 6, lvl >= 2 ? '#fff1c4' : '#e8c27a', 0.35, 2.5);
      fx.holyBurst(this.x + this.face * 4, this.y - 34, 4 + lvl * 3, 0.4);
    }
    if (Math.random() < dt * 30) fx.spawn(PK.Ember, this.x + rand(-10, 10), this.y - rand(0, 30), 0, -40, 0.5, 1.2, 0.2, '#ffd27a');
    if (input.pressed('dodge')) return this.startDodge();
    const held = input.down('attack') || input.down('heavy');
    if (!held) {
      const mults = [1, 1.35, 1.8, 2.5];
      const h = { ...this.moves.heavy };
      h.dmg *= mults[this.chargeLvl];
      h.poise *= mults[this.chargeLvl];
      h.guardBreak = h.guardBreak || this.chargeLvl >= 2;
      h.stop += this.chargeLvl * 0.02;
      h.shake += this.chargeLvl * 0.1;
      this.startAttack(h);
      if (this.chargeLvl >= 3) G.world.spawnShockwave(this.x + this.face * 20, this.y, this.face, G.d.atk * 1.2, 'player');
      if (this.chargeLvl >= 2) G.camera.punch = 0.06;
    }
  }

  // ---------------------------------------------------------------- executions
  /** Executions play a finisher picked at random from those unlocked. */
  startExecute(e: Entity) {
    this.execTarget = e;
    this.setState('execute');
    this.execPhase = 0;
    this.fin = beginFinisher(this, e);
  }
  private updateExecute(dt: number) {
    const f = this.fin;
    if (!f || !this.execTarget) {
      this.fin = null;
      return this.setState('free');
    }
    if (updateFinisher(this, f, dt)) {
      this.fin = null;
      G.camera.zoomTarget = 1;
      G.camera.focus = null;
      this.setState('free');
      this.invuln = 0.4;
      this.execTarget = null;
    }
  }

  private plungeImpact() {
    this.setState('attack');
    const slam: AttackDef = { ...this.moves.plunge, id: 'slam', clip: 'slam', dur: 0.3, hit: [0, 0.35], box: { x: -40, y: -28, w: 80, h: 32 }, dmg: 1.6, cancel: 0.6, finisher: true };
    this.atk = slam;
    this.atkT = 0;
    this.atkHit.clear();
    this.anim.play('slam', 0.02, true, 1 / slam.dur);
    sfx('hitHeavy', { pitch: 0.8 });
    sfx('land');
    fx.dust(this.x, this.y, 12, 1.6);
    fx.ring(this.x, this.y - 2, 6, 48, '#ffe6a8', 0.35, 3, 0.3);
    G.camera.addTrauma(0.35 * shakeScale());
    this.activeHits(slam, 1);
    G.world.breakWalls(this.x, this.y + 8, 10, false);
  }

  // ---------------------------------------------------------------- damage
  takeHit(h: HitInfo): boolean {
    if (this.state === 'dead') return false;
    if (h.kind !== 'hazard' && this.isInvuln()) {
      if (this.shieldT > 0) this.shieldCounter(h);
      return false;
    }
    const s = G.save;
    const d = G.d;
    const facingAttack = h.dir === 0 || sign(h.dir) !== this.face;
    // Perfect parry.
    if (this.parryT > 0 && facingAttack && !h.unblockable && h.parryable !== false && h.kind !== 'hazard') {
      this.parryT = 0;
      this.counterT = 0.75;
      sfx('parry');
      fx.flash('#fff6dc', 0.35);
      fx.hitSparks(this.x + this.face * 10, this.y - 24, this.face, '#fff6dc', 16, 1.2);
      fx.ring(this.x + this.face * 10, this.y - 24, 4, 34, '#fff1c4', 0.3, 3);
      G.world.slowmo(0.28, 0.25);
      G.world.hitstop(0.06);
      G.camera.addTrauma(0.2 * shakeScale());
      G.save.ce = Math.min(d.maxCe, G.save.ce + (skillRank(s, 'g_timing') ? 12 : 5));
      G.world.addRally(10);
      mantleGain(8);
      input.rumble(0.25, 0.8, 110);
      if (h.src) h.src.parried(this);
      if (G.ui) G.ui.hint(null);
      return false;
    }
    // Block.
    if ((this.state === 'block' || this.state === 'parry') && facingAttack && !h.unblockable && h.kind !== 'hazard') {
      const dmg = Math.max(1, h.dmg * 0.25 * (1 - d.dr));
      s.hp -= dmg;
      sfx('block');
      fx.hitSparks(this.x + this.face * 8, this.y - 22, this.face, '#ffe6a8', 8);
      this.body.vx = -this.face * 140;
      this.anim.play('blockHit', 0.02, true);
      this.state = 'block';
      this.st = 0.05;
      G.camera.addTrauma(0.12 * shakeScale());
      if (s.hp <= 0) this.die();
      G.ui.refreshHud();
      return true;
    }
    let dmg = h.dmg * (1 - d.dr) * (this.armorLight > 0 ? 0.6 : 1) * (this.mantleT > 0 ? 0.5 : 1) * G.world.guardianAura(this.x, this.y);
    if (h.kind === 'hazard') dmg = h.dmg * (1 - d.dr * 0.5);
    dmg = Math.max(1, Math.round(dmg));
    s.hp -= dmg;
    this.flash = 0.15;
    this.invuln = h.kind === 'hazard' ? 0.5 : 0.8;
    this.ceRegenDelay = 1;
    fx.number(this.x, this.y - 40, dmg, false, '#ff8a8a');
    fx.hitSparks(this.x, this.y - 20, -this.face, '#ff9a9a', 8, 0.8);
    sfx('hurt');
    input.rumble(0.7, 0.4, 180);
    G.camera.addTrauma(0.3 * shakeScale());
    fx.flash('#8a1020', 0.12);
    if (s.hp <= 0) {
      s.hp = 0;
      this.die();
      return true;
    }
    mantleGain(3);
    const unshaken = h.kind !== 'hazard' && ((isSovereign() && h.poise < 70) || this.mantleT > 0);
    if ((this.lion <= 0 || h.kind === 'hazard') && !unshaken) {
      if (this.state === 'charge' || this.state === 'heal' || this.state === 'cast' || this.state === 'attack' || this.state === 'free' || this.state === 'block' || this.state === 'parry') {
        this.setState('hurt');
        // A paralysing blow (the Locust King's screech) pins Elior longer.
        this.hurtT = Math.max(0.26, h.stun ?? 0);
        if (h.stun) fx.ring(this.x, this.y - 24, 4, 26, '#c9a8ff', h.stun, 2);
        this.atk = null;
        this.anim.play('hurt', 0.02, true);
        if (!h.noKnock) {
          this.body.vx = (h.kx || h.dir * 160) * 0.9;
          this.body.vy = Math.min(this.body.vy, h.ky ? h.ky * 0.6 : -120);
        }
      }
    }
    G.ui.refreshHud();
    if (s.hp < G.d.maxHp * 0.25) sfx('heartbeat', { gap: 900 });
    return true;
  }

  private shieldCounter(h: HitInfo) {
    if (h.kind === 'melee' && h.src && h.src !== this) {
      const src = h.src;
      sfx('parry', { pitch: 1.2 });
      fx.hitSparks(this.x + this.face * 12, this.y - 22, this.face, '#bfe0ff', 10);
      src.takeHit({ dmg: G.d.atk * 1.5 * G.d.abil, poise: 50, kx: sign(src.x - this.x) * 200, ky: -100, dir: sign(src.x - this.x), kind: 'ability', src: this, stop: 0.06 });
    }
  }

  die() {
    if (this.state === 'dead') return;
    if (this.mantleT > 0) endMantle(this, true);
    this.setState('dead');
    this.deadT = 0;
    this.anim.play('death', 0.05, true);
    sfx('death');
    G.world.slowmo(0.8, 0.3);
    G.world.onPlayerDeath();
  }

  revive() {
    this.setState('free');
    this.anim.play('idle', 0, true);
    this.invuln = 1.2;
    this.ghosts.length = 0;
  }

  // ---------------------------------------------------------------- scripted movement (cutscenes)
  private scripted(dt: number) {
    const b = this.body;
    if (this.scriptX !== null) {
      const dx = this.scriptX - this.x;
      if (Math.abs(dx) < 2) {
        b.vx = 0;
        this.scriptX = null;
      } else {
        this.face = sign(dx);
        b.vx = this.face * this.scriptSpeed;
      }
    } else {
      b.vx = approach(b.vx, 0, 800 * dt);
    }
    if (this.state === 'transform') skipTransform(this);
    if (this.state !== 'free' && this.state !== 'scripted' && this.state !== 'hurt') this.setState('free');
  }

  // ---------------------------------------------------------------- animation & cloth
  private animate(dt: number) {
    const b = this.body;
    const a = this.anim;
    if (this.state === 'free' || this.state === 'scripted') {
      if (!b.onGround) {
        if (a.name === 'flip' && !a.done) {
          // keep flipping
        } else if (b.vy < -30) a.play('jump', 0.12);
        else a.play('fall', 0.18);
      } else if (this.landT > 0) {
        a.play('land', 0.03);
      } else if (Math.abs(b.vx) > 20) {
        a.play('run', 0.12, false, Math.max(0.6, Math.abs(b.vx) / RUN));
      } else {
        a.play('idle', 0.18);
      }
    } else if (this.state === 'block' && a.name !== 'blockHit') {
      a.play('block', 0.06);
    } else if (this.state === 'block' && a.done) {
      a.play('block', 0.06);
    }
    a.update(dt);
    this.pose = a.sample();
    solve(this.pose, DIMS, b.onGround || this.state === 'dodge', this.j);
  }

  private updateCloth(dt: number) {
    const f = this.face;
    const j = this.j;
    const ax = this.x + f * (j.neckX - 1.6), ay = this.y + j.neckY + 1;
    const wind = Math.sin(G.time * 1.7) * 30 - 20 * f;
    this.scarf.update(ax, ay, dt, -this.body.vx * 3.2 + wind - f * 120, 260, 0.9);
    const cx = this.x + f * (j.shBX - 1), cy = this.y + j.shBY;
    this.cape.update(cx, cy, dt, -this.body.vx * 2.6 + wind - f * 60, 420, 0.88);
    // The Mantle's cloak: longer, and blown back harder.
    if (this.mantleT > 0) this.cloak.update(cx, cy + 1, dt, -this.body.vx * 3.2 + wind * 1.3 - f * 70, 380, 0.9);
  }

  private updateTrail(dt: number) {
    const w = this.lastWpn;
    const f = this.face;
    const active = this.state === 'attack' || this.state === 'execute' || this.state === 'plunge' || (this.state === 'charge' && this.chargeLvl >= 2);
    if (active) {
      this.trail.unshift(this.x + f * w.bx, this.y + w.by, this.x + f * w.tx, this.y + w.ty);
      if (this.trail.length > 4 * 7) this.trail.length = 4 * 7;
      this.trailFade = 1;
    } else {
      this.trailFade = Math.max(0, this.trailFade - dt * 8);
      if (this.trail.length > 4) this.trail.length -= 4;
      if (this.trailFade <= 0) this.trail.length = 0;
    }
  }

  // ---------------------------------------------------------------- drawing
  draw(ctx: Ctx) {
    const s = this.style;
    if (!s) return;
    const t = G.time;
    // afterimages
    for (const g of this.ghosts) {
      const gj = solve(g.pose, DIMS, true, newJoints());
      ctx.save();
      ctx.globalAlpha = g.a * (g.shade ? 0.75 : 0.6);
      ctx.translate(g.x, g.y);
      ctx.scale(g.face, 1);
      drawHumanoid(ctx, gj, g.shade ? SHADE_GHOST : GHOST, t, g.rot);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // Mid-blink: nothing but a wisp where Elior will appear.
    if (this.fin?.hidden) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.fin.target.cx, this.fin.target.cy, 22, '#8a4aff', 0.5);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    if (this.state !== 'dead') drawAura(ctx, this.x, this.y, this.face);
    if (this.state === 'phantom') {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.phantomTo.x, this.phantomTo.y - 20, 18, '#ffe6a8', 0.6);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    // cape & scarf (world space, behind body)
    const lv = G.save.level;
    if (this.mantleT > 0) {
      drawMantleBack(ctx, this);
    } else if (lv >= 7 || (s.plate && s.plate.tier >= 2)) {
      drawRibbon(ctx, this.cape, 9, 13, '#3a1418', '#0a070c');
      if (lv >= 7) drawRibbon(ctx, this.cape, 1.5, 2, '#e2b85a');
    }
    drawRibbon(ctx, this.scarf, 3.4, 1.4, s.scarf ?? '#8f2a2a', '#0a070c');
    // aura
    if (this.aura > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 20, 34, this.armorLight > 0 ? '#fff1c4' : '#ffb347', 0.45 * this.aura);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Turning around squashes the silhouette for a few frames instead of snapping.
    if (this.face !== this.drawnFace) {
      this.drawnFace = this.face;
      this.turnAt = t;
    }
    const tu = Math.max(0, Math.min(1, (t - this.turnAt) / 0.1));
    let turnS = this.state === 'free' ? 0.6 + 0.4 * (1 - (1 - tu) * (1 - tu)) : 1;
    if (this.state === 'attack' && this.atk?.spin) {
      // Whirl: the sprite narrows and flips as it turns about its own axis.
      const su = clamp(this.atkT / (this.atk.dur / this.aspd()), 0, 1);
      const c = Math.cos(su * Math.PI * 2 * this.atk.spin);
      turnS = Math.sign(c || 1) * Math.max(0.12, Math.abs(c));
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * turnS, 1);
    const blink = this.invuln > 0 && this.state !== 'execute' && Math.floor(t * 20) % 2 === 0 && this.flash <= 0;
    if (blink) ctx.globalAlpha = 0.55;
    const eye = this.mantleT > 0 || this.state === 'transform' ? 1 : this.state === 'cast' || this.lion > 0 || this.armorLight > 0 || this.state === 'execute' ? 0.9 : 0;
    s.eyeGlow = eye;
    const w = drawHumanoid(ctx, this.j, s, t, this.pose.rot, this.body.vx * this.face, this.body.onGround ? 0 : this.body.vy);
    this.lastWpn.bx = w.bx; this.lastWpn.by = w.by; this.lastWpn.tx = w.tx; this.lastWpn.ty = w.ty;
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -20, 26, '#ffffff', this.flash * 4);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // weapon trail
    if (this.trail.length >= 8) {
      const c = this.style.weaponGlow ?? '#e8c27a';
      drawTrail(ctx, this.trail, this.mantleT > 0 ? SHADE.edge : this.lion > 0 ? '#ffb347' : c, this.mantleT > 0 ? SHADE.core : '#fffaf0', 0.8 * this.trailFade);
    }
    // charge glow on blade
    if (this.state === 'charge') {
      ctx.globalCompositeOperation = 'lighter';
      const tx = this.x + this.face * w.tx, ty = this.y + w.ty;
      glow(ctx, tx, ty, 8 + this.chargeLvl * 6, '#ffe6a8', 0.5 + this.chargeLvl * 0.15);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Shield of Faith bubble
    if (this.shieldT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, this.shieldT * 4);
      ctx.strokeStyle = rgba('#bfe0ff', 0.7 * a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 18, 22, 26, 0, 0, Math.PI * 2);
      ctx.stroke();
      glow(ctx, this.x, this.y - 18, 34, '#8fc4ff', 0.35 * a);
      for (let i = 0; i < 6; i++) {
        const ang = t * 2 + (i / 6) * Math.PI * 2;
        circle(ctx, this.x + Math.cos(ang) * 22, this.y - 18 + Math.sin(ang) * 26, 1.2, rgba('#ffffff', a));
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.veiled > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 16, 20, '#8a2ad6', 0.35);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay(ctx: Ctx) {
    drawMantleOverlay(ctx, this);
  }

  lights() {
    mantleLights(this);
    const relic = flag('relic_taken');
    lighting.add(this.x, this.y - 20, relic ? 120 : 90, '#ffd9a0', relic ? 0.85 : 0.7, 0.15);
    if (this.state === 'charge') lighting.add(this.x, this.y - 30, 60 + this.chargeLvl * 20, '#ffe6a8', 0.8, 0.6);
    if (this.armorLight > 0 || this.lion > 0) lighting.add(this.x, this.y - 20, 110, '#ffcf6b', 0.9, 0.4);
    auraLight(this.x, this.y);
  }
}

const GHOST: HumanStyle = {
  skin: 'rgba(255,214,140,0.5)', hair: 'rgba(255,214,140,0.5)', hairKind: 'spiky', coat: 'rgba(255,214,140,0.45)', coatDark: 'rgba(255,214,140,0.3)',
  skirt: 9, trim: null, pants: 'rgba(255,214,140,0.45)', boots: 'rgba(255,214,140,0.45)', glove: 'rgba(255,214,140,0.45)', belt: null,
  plate: null, helm: 'none', eye: '#fff', eyeGlow: 0, outline: 'rgba(0,0,0,0)', weapon: 'none', offhand: 'none', bulk: 1, flat: true,
};

export function clampHp() {
  G.save.hp = clamp(G.save.hp, 0, G.d.maxHp);
}
