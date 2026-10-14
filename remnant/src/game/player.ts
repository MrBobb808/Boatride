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

const GRAV = 1500;
const MAX_FALL = 560;
const RUN = 142;
const JUMP_V = 430;
const DJUMP_V = 400;

export const DIMS = { torso: 12.5, head: 4.6, neck: 1.5, upperArm: 7, foreArm: 6.6, thigh: 8.2, shin: 8.2, shoulderSpread: 1.4, hipSpread: 1.5 };

type PState = 'free' | 'attack' | 'charge' | 'dodge' | 'airdash' | 'parry' | 'block' | 'hurt' | 'heal' | 'cast' | 'execute' | 'plunge' | 'dead' | 'scripted';

interface Ghost { x: number; y: number; face: number; pose: Pose; a: number; rot: number }

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
  ceRegenDelay = 0;
  aura = 0;
  stepCount = 0;

  constructor(x: number, y: number) {
    super(x, y, 12, 34);
    this.team = 'player';
    this.anim = new Animator(clipsFor('blade'));
    this.anim.play('idle', 0);
    this.anim.onStep = () => this.footstep();
    this.scarf = new Chain(7, 3.2, x, y - 28);
    this.cape = new Chain(8, 3.8, x, y - 26);
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
    const key = [helm?.id, armor?.id, gl?.id, bt?.id, wp?.id, wp?.plus, wp?.rarity, s.level, flag('relic_taken'), this.armorLight > 0].join('|');
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
    this.style = {
      skin: '#e0b28c',
      hair: '#1a1316',
      hairKind: 'spiky',
      coat: lv >= 7 ? '#1f2a48' : '#26304e',
      coatDark: '#19203a',
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
      eye: '#ffe08a',
      eyeGlow: 0,
      outline: '#0a070c',
      weapon: wb.family === 'spear' ? 'spear' : wb.family === 'greatsword' ? 'greatsword' : 'blade',
      weaponColor: wb.id === 'judgment_greatsword' ? '#e8d8a8' : wb.id === 'covenant_blade' ? '#e8e4dc' : '#c9ced6',
      weaponGlow: wGlow,
      weaponGlowAmt: wAmt,
      weaponFlame: plus >= 5 || wb.id === 'judgment_greatsword',
      offhand: 'none',
      runes: relic && lv >= 4 ? '#ffd27a' : null,
      crack: null,
      bulk: 1,
      scarf: '#8f2a2a',
    };
  }

  // ---------------------------------------------------------------- helpers
  get grounded() {
    return this.body.onGround;
  }
  hasDouble() {
    return G.save.keyItems.includes('eagle_wings');
  }
  isInvuln() {
    return this.invuln > 0 || this.untouchable > 0 || this.state === 'execute' || this.state === 'dead' ||
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
    this.landT = Math.max(0, this.landT - dt);
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
    if (this.state === 'airdash' || this.state === 'execute') g = 0;
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
      this.ghosts[i].a -= dt * 2.6;
      if (this.ghosts[i].a <= 0) this.ghosts.splice(i, 1);
    }
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
        G.camera.snapTo(this.x, this.y - 30);
        G.ui.fade(0, 0.25);
      });
    }
  }

  onLand(vy: number) {
    if (this.state === 'plunge') {
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
    const speedMul = d.speed * (this.veiled > 0 ? 0.6 : 1) * (this.lion > 0 ? 1.08 : 1);
    if (input.pressed('jump')) this.jumpBuf = 0.13;
    if (input.pressed('attack')) {
      this.queued = 'attack';
      this.queuedT = 0.28;
      this.attackHeldFrom = G.time;
    }

    switch (this.state) {
      case 'free': {
        const target = ax * RUN * speedMul;
        const accel = b.onGround ? 1500 : 1050;
        b.vx = approach(b.vx, target, accel * dt);
        if (Math.abs(ax) > 0.2) this.face = sign(ax);
        // jump / drop / double jump
        if (this.jumpBuf > 0) {
          if (input.down('down') && b.onGround && this.onOneWay()) {
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
        if (this.st >= (this.castId === 'armor_light' || this.castId === 'lion' ? 0.6 : 0.36)) this.setState('free');
        if (this.castFired && this.st > 0.2 && input.pressed('dodge')) this.startDodge();
        break;
      }
      case 'execute':
        this.updateExecute(dt);
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
    if (input.pressed('dodge')) {
      if (b.onGround) this.startDodge();
      else if (this.airDash > 0) this.startAirDash();
      return;
    }
    if (input.pressed('heavy')) {
      if (b.onGround) this.startCharge(false);
      else this.startPlunge();
      return;
    }
    if (this.queued === 'attack') {
      this.queued = null;
      if (!b.onGround) {
        if (input.down('down')) this.startPlunge();
        else if (this.airAttacks < 3) {
          this.startAttack(this.moves.air[Math.min(this.airAttacks, 2)]);
          this.airAttacks++;
        }
      } else if (input.down('up') && !G.world.nearInteractable()) {
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
    }
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
    this.atkHit.clear();
    this.setState('attack');
    this.anim.play(a.clip, 0.04, true, 1 / (a.dur / this.aspd()));
    if (a.rise && input.down('up')) {
      this.body.vy = a.rise;
      this.body.onGround = false;
      this.launchCarry = true;
    }
    if (a.air && this.body.vy > 0) this.body.vy *= 0.2;
  }

  aspd() {
    return G.d.aspd * this.moves.speed * (this.lion > 0 ? 1.1 : 1);
  }

  private updateAttack(dt: number) {
    const a = this.atk!;
    const b = this.body;
    const dur = a.dur / this.aspd();
    this.atkT += dt;
    const u = this.atkT / dur;
    // lunge
    if (a.lunge && a.lungeT && u >= a.lungeT[0] && u <= a.lungeT[1] && (b.onGround || a.id === 'dash')) {
      const ahead = G.world.enemyAhead(this, 14);
      b.vx = this.face * a.lunge * (ahead ? 0.25 : 1);
    } else {
      b.vx = approach(b.vx, a.air ? input.axisX * 70 : 0, (a.air ? 500 : 1100) * dt);
    }
    if (a.air && Math.abs(input.axisX) > 0.3 && u < 0.2) this.face = sign(input.axisX);
    // hits
    if (u >= a.hit[0] && u <= a.hit[1]) {
      if (this.atkT - dt < a.hit[0] * dur) this.onSwing(a);
      this.activeHits(a, 1);
    }
    // charge on hold (touch-friendly): still holding attack after the first swing
    if (!a.air && input.down('attack') && G.time - this.attackHeldFrom > 0.26 && u > 0.45 && this.combo === 0 && a.id === this.moves.combo[0].id) {
      this.startCharge(true);
      return;
    }
    // cancels
    if (u >= a.cancel) {
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
          if (input.down('down')) return this.startPlunge();
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
      this.setState('free');
      this.atk = null;
      if (!a.air) this.combo = 0;
    }
  }

  onSwing(a: AttackDef) {
    sfx(a.sfx, { pitch: rand(0.92, 1.08) * (this.family === 'greatsword' ? 0.8 : 1) });
    if (a.arc) {
      const color = this.style.weaponGlow ?? '#fff1c4';
      fx.slash(this.x + this.face * a.arc.cx, this.y + a.arc.cy, a.arc.r * this.moves.reach ** 0.5, a.arc.a0, a.arc.a1, a.arc.w, this.face, '#fffaf0', this.lion > 0 ? '#ffb347' : color === '#fff1c4' ? '#e8c27a' : color, 0.17);
    }
    if (this.armorLight > 0 && !a.air) {
      G.world.spawnLightWave(this.x + this.face * 14, this.y - 14, this.face, 0.8);
    }
  }

  /** Damage everything the current attack's box overlaps (once per swing). */
  activeHits(a: AttackDef, mult: number) {
    const box = this.attackBox(a);
    const d = G.d;
    const crit = Math.random() < d.crit;
    let dmg = d.atk * a.dmg * d.meleeMult * mult * (this.lion > 0 ? 1.35 : 1) * G.world.commanderAura(this.x, this.y);
    if (crit) dmg *= d.critDmg;
    const hit: HitInfo = {
      dmg, poise: a.poise * (this.family === 'greatsword' ? 1.3 : 1) * (crit ? 1.3 : 1), kx: a.kx * this.face, ky: a.ky, dir: this.face, kind: 'melee', crit,
      src: this, launch: a.launch, heavy: (a.finisher ?? false) || a.id === 'heavy', guardBreak: a.guardBreak, stop: a.stop,
    };
    const n = G.world.hitEnemies(box, hit, this.atkHit, (e) => {
      // per-hit feedback
      G.save.ce = Math.min(d.maxCe, G.save.ce + (flag('relic_taken') ? 2.4 * (skillRank(G.save, 'l_radiance') ? 1.3 : 1) : 0));
      G.world.addRally(1.4);
      if (a.hang && !this.body.onGround) this.body.vy = Math.min(this.body.vy, a.hang);
      if (a.finisher) G.world.echoAssist(e);
      if (d.lifesteal > 0) G.save.hp = Math.min(d.maxHp, G.save.hp + dmg * d.lifesteal);
    });
    if (n > 0) {
      G.camera.addTrauma(a.shake * shakeScale());
      if (a.finisher || crit) G.camera.punch = 0.035;
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
  startExecute(e: Entity) {
    this.execTarget = e;
    this.setState('execute');
    this.execPhase = 0;
    this.face = e.x > this.x ? 1 : -1;
    this.anim.play('executeLeap', 0.05, true);
    this.body.vy = -260;
    G.world.slowmo(0.5, 0.35);
    G.camera.zoomTarget = 1.18;
    sfx('whoosh', { vol: 0.7 });
  }
  private updateExecute(dt: number) {
    const e = this.execTarget;
    const b = this.body;
    if (!e) return this.setState('free');
    if (this.execPhase === 0) {
      const tx = e.x - this.face * 10;
      b.vx = (tx - this.x) * 8;
      b.vy += 900 * dt;
      if (this.st > 0.28) {
        this.execPhase = 1;
        this.st = 0;
        this.anim.play('executeStrike', 0.03, true);
      }
    } else if (this.execPhase === 1) {
      b.vx = approach(b.vx, 0, 2000 * dt);
      if (this.st > 0.1 && this.st - dt <= 0.1) {
        const mult = skillRank(G.save, 'w_exec') ? 1.6 : 1;
        G.world.execute(this, e, mult);
        if (skillRank(G.save, 'w_exec')) G.save.ce = Math.min(G.d.maxCe, G.save.ce + 25);
      }
      if (this.st > 0.55) {
        this.execPhase = 2;
        G.camera.zoomTarget = 1;
        this.setState('free');
        this.invuln = 0.4;
        this.execTarget = null;
      }
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
    let dmg = h.dmg * (1 - d.dr) * (this.armorLight > 0 ? 0.6 : 1) * G.world.guardianAura(this.x, this.y);
    if (h.kind === 'hazard') dmg = h.dmg * (1 - d.dr * 0.5);
    dmg = Math.max(1, Math.round(dmg));
    s.hp -= dmg;
    this.flash = 0.15;
    this.invuln = h.kind === 'hazard' ? 0.5 : 0.8;
    this.ceRegenDelay = 1;
    fx.number(this.x, this.y - 40, dmg, false, '#ff8a8a');
    fx.hitSparks(this.x, this.y - 20, -this.face, '#ff9a9a', 8, 0.8);
    sfx('hurt');
    G.camera.addTrauma(0.3 * shakeScale());
    fx.flash('#8a1020', 0.12);
    if (s.hp <= 0) {
      s.hp = 0;
      this.die();
      return true;
    }
    if (this.lion <= 0 || h.kind === 'hazard') {
      if (this.state === 'charge' || this.state === 'heal' || this.state === 'cast' || this.state === 'attack' || this.state === 'free' || this.state === 'block' || this.state === 'parry') {
        this.setState('hurt');
        this.hurtT = 0.26;
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
      ctx.globalAlpha = g.a * 0.6;
      ctx.translate(g.x, g.y);
      ctx.scale(g.face, 1);
      drawHumanoid(ctx, gj, GHOST, t, g.rot);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // cape & scarf (world space, behind body)
    const lv = G.save.level;
    if (lv >= 7 || (s.plate && s.plate.tier >= 2)) {
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
    const turnS = this.state === 'free' ? 0.6 + 0.4 * (1 - (1 - tu) * (1 - tu)) : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * turnS, 1);
    const blink = this.invuln > 0 && this.state !== 'execute' && Math.floor(t * 20) % 2 === 0 && this.flash <= 0;
    if (blink) ctx.globalAlpha = 0.55;
    const eye = this.state === 'cast' || this.lion > 0 || this.armorLight > 0 || this.state === 'execute' ? 0.9 : 0;
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
      drawTrail(ctx, this.trail, this.lion > 0 ? '#ffb347' : c, '#fffaf0', 0.8 * this.trailFade);
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

  lights() {
    const relic = flag('relic_taken');
    lighting.add(this.x, this.y - 20, relic ? 120 : 90, '#ffd9a0', relic ? 0.85 : 0.7, 0.15);
    if (this.state === 'charge') lighting.add(this.x, this.y - 30, 60 + this.chargeLvl * 20, '#ffe6a8', 0.8, 0.6);
    if (this.armorLight > 0 || this.lion > 0) lighting.add(this.x, this.y - 20, 110, '#ffcf6b', 0.9, 0.4);
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
