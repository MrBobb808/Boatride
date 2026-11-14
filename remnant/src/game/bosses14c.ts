// Chapter XIV: Gog, of the land of Magog, the chief prince of Meshech and Tubal (Ezekiel 38–39). He comes like a storm
// and like a cloud to cover the land (38:9), and Elior cannot be the one to end him: the fight is four movements, and
// in the last Elior only withstands while the LORD pleads against him with hail, fire and brimstone (38:22).
//
// - THE CHIEF PRINCE (from the start): spear and shield, a spear charge the length of the floor, a low spinning sweep,
//   the word given to his bands (arrows on marked ground), and his host rides in at the edges.
// - AS A CLOUD TO COVER THE LAND (seven tenths): he goes up into the cloud and comes down across the floor in
//   swoops (nothing to strike while he is cloud), and the tempest: lightning on marked ground in a row, every other
//   place left clear.
// - EVERY MAN'S SWORD AGAINST HIS BROTHER (four tenths): his bands turn on one another at the walls and swords
//   sweep the floor from both sides; Gog stands confounded, watching, and takes a third more. Then he comes on again.
// - HAILSTONES, FIRE, AND BRIMSTONE (a tenth of his life is left, and no blow of Elior's takes it): he cannot be
//   struck. Hail and fire fall across the whole floor on marked ground, thicker and faster, until the sky answers.
//   Then fire from heaven, and the host falls with him. "Yet he shall fall upon the mountains of Israel."

import { type HitInfo } from './entity';
import { Prince14, ghostOf, type Mark } from './bosses14';
import { MP } from './bosses2';
import { glow, rgba, poly, circle, ellipse, type Ctx } from '../render/draw';
import { type HumanStyle } from '../render/actors';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose } from '../core/math';
import { Proj } from './projectiles';
import { shakeScale } from '../core/settings';
import { lighting } from '../render/lighting';
import { skyState } from '../render/env14';
import type { EnemyKind } from './tiles';

type GAtk = 'combo' | 'rush' | 'sweep' | 'command' | 'cloud' | 'tempest' | 'confusion' | 'summon';

const ASH = '#8a7ac8', GOLD = '#c8a04a', BONE = '#e8e0f0';

const GOG: HumanStyle = {
  skin: '#6a5a58', hair: '#0e0a12', hairKind: 'long', beard: '#0e0a12', coat: '#1e1a26', coatDark: '#0a0810', skirt: 20, trim: GOLD,
  pants: '#120e18', boots: '#0a080c', glove: '#14101a', belt: GOLD, plate: { c: '#3a3a48', dark: '#16161e', hi: '#c8c8e0', tier: 3 },
  helm: 'crown', helmColor: '#2a2a36', helmTrim: GOLD, eye: '#e8e0ff', eyeGlow: 1, outline: '#04030a',
  weapon: 'spear', weaponColor: '#e8e8f4', weaponGlow: ASH, weaponGlowAmt: 0.8, offhand: 'kite', offColor: '#1e1a26', offTrim: GOLD, runes: '#8a7ac8', bulk: 1.55, crest: GOLD,
};

const HOSTS: EnemyKind[][] = [['knight', 'lion'], ['gale', 'knight', 'archer'], ['brute', 'lion', 'gale'], []];

/** The host brawling at the walls while he stands confounded: two pairs of dark figures, swords against brothers. */
interface Brawl { t: number; len: number }

export class GogPrince extends Prince14 {
  pixelBox = [-210, -200, 210, 14] as const;
  readonly style = GOG;
  readonly ghostStyle = ghostOf(GOG, ASH);
  protected capeColor = '#1a1422';
  protected glow = ASH;
  /** 0 clear .. 1 gone into the cloud, how far he is lifted, the dash direction. */
  cloudy = 0;
  lift = 0;
  dashDir = 1;
  confused = false;
  brawl: Brawl | null = null;
  strayT = 0;
  hailT = 0;
  hailLen = 26;
  hailTick = 0;
  hailing = false;
  swoops = 0;
  fireT = 0;

  constructor(x: number, y: number) {
    super('gog_prince', x, y, 1700000);
    this.name = 'Gog';
    this.sub = 'Chief Prince of Meshech and Tubal';
    this.maxPoise = this.poise = 1500;
    this.kneelTime = 2.6;
    this.p2At = 0.7;
    this.p3At = 0.4;
    this.phaseMarks = [0.7, 0.4, 0.1];
    this.scale = this.scaleTo = 2.3;
    this.face = -1;
    skyState.torn = false;
  }

  get dmg() { return 600 * this.ngMul * this.encounterDamage * (this.phase >= 4 ? 1 : this.phase >= 3 ? 1.25 : this.phase === 2 ? 1.12 : 1); }
  get spd() { return this.phase >= 3 ? 1.4 : this.phase === 2 ? 1.2 : 1.05; }
  /** He is never executed: the end of Gog is not Elior's to give. */
  executable() { return false; }
  canBeTargeted() { return super.canBeTargeted() && this.cloudy < 0.5; }
  private get floor() { return Math.ceil(this.maxHp * 0.1); }

  // ------------------------------------------------------------ lifecycle
  updateIntro(_dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 30, y: this.y - 70 };
    if (t < 0.6) this.target = { ...MP.planted, head: 0.2 };
    else if (this.introT === 0) {
      this.introT = 1;
      this.target = { ...MP.rising };
      this.rate = 10;
      sfx('armyHorns', { vol: 0.9, pitch: 0.8 });
      sfx('bossRoar', { pitch: 0.6 });
      sfx('thunder', { vol: 0.8 });
      fx.ring(this.x, this.y - 50, 12, 300, ASH, 0.8, 5);
      fx.flash('#c8d0ff', 0.2);
      G.camera.addTrauma(0.5 * shakeScale());
      G.ui.banner('GOG', this.sub, 'boss');
      music.play('persia', 0.6);
      music.phase = 0;
    } else if (t > 2.4) {
      this.target = { ...MP.guard };
      this.beginFight();
      G.camera.viewMultTarget = 1.25;
    }
  }

  onKneel() {
    this.atk = null;
    this.cloudy = 0;
    this.lift = 0;
    this.confused = false;
    this.brawl = null;
    this.collide = true;
    this.marks.length = 0;
    G.ui.toast('Gog staggers: strike now.', 'good');
  }

  /** No blow of Elior's takes him below a tenth, and a cloud cannot be struck: the hail begins at the tenth. */
  takeHit(h: HitInfo): boolean {
    if (this.cloudy >= 0.5 || this.hailing) return false;
    const conf = this.confused ? 1.3 : 1, k = this.state === 'kneel' ? 1.5 : 1;
    const room = this.hp - this.floor;
    const dmg = Math.min(h.dmg * conf, Math.max(0, room) / k);
    const hit = super.takeHit({ ...h, dmg });
    if (this.hp <= this.floor && this.phase >= 3 && this.state !== 'transition' && !this.hailing) { this.hp = this.floor; this.startHail(); }
    else if (this.hp < this.floor) this.hp = this.floor;
    return hit;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player, dx = p.x - this.x, dist = Math.abs(dx);
    this.tickMarks(dt);
    if (this.hailing) { this.runHail(dt); return; }
    this.tickBrawl(dt);
    this.callHost(dt, HOSTS[Math.min(2, this.phase - 1)], this.phase >= 3 ? 4 : 3);
    if (this.state === 'idle') {
      this.cloudy = approach(this.cloudy, 0, dt * 2);
      this.lift = approach(this.lift, 0, dt * 300);
      this.idleWalk(dt, dx, dist, 90, 95);
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const ph = this.phase;
    const near: GAtk[] = ph >= 3 ? ['combo', 'sweep', 'combo', 'confusion'] : ph === 2 ? ['combo', 'combo', 'sweep', 'cloud'] : ['combo', 'combo', 'sweep', 'rush'];
    const far: GAtk[] = ph >= 3 ? ['rush', 'tempest', 'cloud', 'confusion'] : ph === 2 ? ['cloud', 'tempest', 'rush', 'cloud'] : ['rush', 'command', 'rush', 'sweep'];
    const pool = dist < 110 ? near : far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    // The confusion is rare: never twice running, and never until the bands have had their turn.
    if (a === 'confusion' && this.brawl) a = 'combo';
    this.start(a, a === 'combo' ? (ph >= 3 ? 4 : 3) : 3);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body;
    switch (this.atk as GAtk) {
      case 'combo': {
        // Spear thrust, spear thrust, the shield's rising sweep, and a down-stroke to finish.
        const kind = this.step % 3;
        const tel = (this.step === 0 ? 0.44 : kind === 2 ? 0.34 : 0.26) / sp, act = 0.14, rec = this.step === this.steps - 1 ? 0.6 : 0.1;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.draw : kind === 1 ? MP.draw : MP.overhead;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 2 ? MP.downcut : MP.thrust;
          if (t - dt < tel) {
            b.vx = f * (kind === 2 ? 200 : 360);
            sfx(kind === 2 ? 'swingHeavy' : 'spearThrust', { pan: W.pan(this.x), pitch: 0.55 });
            if (kind === 2) this.swingFx(-2.6, 0.9, 60, BONE, ASH);
            else fx.streak(this.x + f * 14, this.y - 46, this.x + f * 160, this.y - 46, BONE, 0.2, 4);
          }
          if (kind === 2) this.hit(-4, -112, 108, 112, 1.1, { poise: 60 });
          else this.hit(0, -64, 160, 30, 1, { poise: 55, kx: f * 360, ky: -180 });
        } else if (t < tel + act + rec) this.rate = 8;
        else {
          this.step++;
          this.st = 0;
          this.hitSet.clear();
          if (this.step >= this.steps || Math.abs(dx) > 200) this.endAttack(1.0);
        }
        this.physics(dt);
        break;
      }
      case 'rush': {
        // The spear lowered and a charge the whole way across: through Elior, and on to the wall.
        const tel = 0.58 / Math.min(sp, 1.3);
        if (t < tel) {
          this.rate = 12;
          this.target = MP.draw;
          b.vx = approach(b.vx, -f * 40, 600 * dt);
          this.physics(dt);
          if (t < dt * 1.5) { sfx('charge', { pan: W.pan(this.x), pitch: 0.7 }); this.dashDir = f; }
          break;
        }
        if (this.step === 0) { this.step = 1; this.collide = false; this.dashDir = f; }
        this.rate = 30;
        this.target = MP.thrust;
        b.vx = this.dashDir * 700 * Math.min(sp, 1.3);
        this.physics(dt);
        this.hit(-8, -80, 120, 80, 1.2, { poise: 70, kx: this.dashDir * 420, ky: -220, parryable: false });
        this.ghostT -= dt;
        if (this.ghostT <= 0) this.addGhost();
        if (Math.random() < dt * 40) fx.spawn(PK.Dust, this.x - this.dashDir * 20, this.y - 2, -this.dashDir * 80, -20, 0.4, 3, 8, '#8a7a8a', 0, 2);
        {
          const atWall = (this.dashDir > 0 && this.x >= this.width - 70) || (this.dashDir < 0 && this.x <= 70);
          if (atWall || t > tel + 1.6) {
            b.vx = 0;
            G.camera.addTrauma(0.3 * shakeScale());
            fx.dust(this.x, this.y, 16, 2);
            this.endAttack(1.0);
          }
        }
        break;
      }
      case 'sweep': {
        // Low and spinning: the spear's length along the floor. Jump it, or dodge through.
        const tel = 0.6 / Math.min(sp, 1.25);
        if (t < tel) {
          this.rate = 10;
          this.target = MP.low;
          b.vx = approach(b.vx, -f * 40, 600 * dt);
          if (t < dt * 1.5) { sfx('charge', { pan: W.pan(this.x), pitch: 0.7 }); sfx('stormGust', { vol: 0.5 }); }
          this.physics(dt);
          break;
        }
        if (this.step === 0) { this.step = 1; this.collide = false; this.dashDir = f; sfx('waveWhoosh', { pan: W.pan(this.x), pitch: 0.7 }); }
        this.rate = 30;
        this.target = MP.rising;
        this.spinA += dt * 24;
        b.vx = this.dashDir * 520 * Math.min(sp, 1.3);
        this.physics(dt);
        W.hitPlayerSide({ x: this.x - 52, y: this.y - 40, w: 104, h: 40 }, { dmg: this.dmg * 0.9, poise: 60, kx: this.dashDir * 320, ky: -260, dir: this.dashDir, kind: 'melee', src: this, unblockable: true, parryable: false }, this.hitSet);
        this.ghostT -= dt;
        if (this.ghostT <= 0) this.addGhost();
        if (t > tel + 1.5 || (this.dashDir > 0 && this.x >= this.width - 70) || (this.dashDir < 0 && this.x <= 70)) { b.vx = 0; fx.dust(this.x, this.y, 14, 2); this.endAttack(1.0); }
        break;
      }
      case 'command': {
        // He gives the word to his bands: arrows fall in a row, from where he stands toward the far wall.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        if (t < dt * 1.5) { sfx('armyHorns', { vol: 0.6, pitch: 0.9 }); G.ui.toast('Gog gives the word', 'warn'); }
        const n = this.phase >= 2 ? 8 : 6;
        if (this.step < n && t >= 0.5 + this.step * 0.11) {
          this.mark('arrow', this.x + f * (80 + this.step * 95), 0.85);
          this.step++;
        }
        if (t > 0.5 + n * 0.11 + 1.3) this.endAttack(1.3);
        break;
      }
      case 'cloud': {
        // "Thou shalt be like a cloud to cover the land" (38:9): he goes up into it, and comes down across the floor.
        const passes = this.phase >= 3 ? 3 : 2, w = this.width;
        if (this.step === 0) {
          // Rise into the cloud.
          this.rate = 10;
          this.target = { ...MP.rising };
          this.cloudy = Math.min(1, t / 0.7);
          this.lift = Math.min(150, t * 260);
          b.vx = approach(b.vx, 0, 900 * dt);
          this.physics(dt);
          if (t < dt * 1.5) { sfx('stormGust', { vol: 0.8 }); sfx('thunder', { vol: 0.4 }); }
          if (t > 0.8) { this.step = 1; this.st = 0; this.swoops = 0; this.collide = false; this.hitSet.clear(); }
          break;
        }
        this.cloudy = 1;
        // Each pass: marked a beat before, a swoop across the floor at knee height, a turn at the wall.
        const cyc = 1.4 / sp, k = Math.floor(t / cyc), u = t - k * cyc;
        if (k >= passes) {
          this.cloudy = Math.max(0, 1 - (t - passes * cyc) / 0.5);
          this.lift = Math.max(0, this.lift - dt * 300);
          b.vx = approach(b.vx, 0, 1600 * dt);
          this.physics(dt);
          if (t > passes * cyc + 0.6) { this.collide = true; this.cloudy = 0; this.lift = 0; this.endAttack(1.2); }
          break;
        }
        this.target = { ...MP.thrust };
        this.rate = 14;
        if (u < 0.62 / sp) {
          // Coming round: out at the far wall, he lines up on Elior's floor.
          if (this.swoops === k) {
            this.swoops = k + 1;
            this.hitSet.clear();
            const toRight = W.player.x < w / 2;
            this.x = toRight ? 90 : w - 90;
            this.dashDir = toRight ? 1 : -1;
            this.face = this.dashDir;
            this.lift = 120;
            sfx('thunder', { pan: W.pan(this.x), vol: 0.5 });
            fx.flash('#c8d0ff', 0.06);
          }
          this.lift = approach(this.lift, 70, dt * 80);
          b.vx = 0;
        } else {
          this.lift = approach(this.lift, 26, dt * 400);
          b.vx = this.dashDir * 780 * Math.min(sp, 1.3);
          this.physics(dt);
          W.hitPlayerSide({ x: this.x - 62, y: this.y - 110, w: 124, h: 100 }, { dmg: this.dmg * 1.0, poise: 70, kx: this.dashDir * 380, ky: -240, dir: this.dashDir, kind: 'melee', src: this, unblockable: true, parryable: false }, this.hitSet);
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
          if (Math.random() < dt * 60) fx.spawn(PK.Smoke, this.x - this.dashDir * 30, this.y - 40 - rand(0, 40), -this.dashDir * 100, rand(-20, 20), 0.6, 7, 14, '#1a1626', 0, 1);
        }
        break;
      }
      case 'tempest': {
        // "Come like a storm": lightning on marked ground in a row across the whole floor, every other place clear.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        const waves = this.phase >= 3 ? 3 : 2, w = this.width, gap = 112;
        if (t < dt * 1.5) { sfx('stormGust', { vol: 0.8 }); sfx('beamCharge', { pitch: 0.6, vol: 0.5 }); }
        if (this.step < waves && t >= 0.5 + this.step * 1.5 / sp) {
          const off = (this.step % 2) * gap / 2, dir = f;
          for (let x = off + 70, i = 0; x < w - 60; x += gap, i++) this.mark('bolt', dir > 0 ? x : w - x, 0.85 + i * 0.045);
          this.step++;
        }
        if (t > 0.5 + waves * 1.5 / sp + 1.2) this.endAttack(1.3);
        break;
      }
      case 'confusion': {
        // "Every man's sword shall be against his brother" (38:21): his bands turn on one another at the walls, swords sweep
        // the floor from both sides, and Gog stands confounded. A beat of the fight where Elior has to survive, and may strike.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        if (this.step === 0) {
          this.step = 1;
          this.confused = true;
          this.brawl = { t: 0, len: this.phase >= 3 ? 7 : 6 };
          this.strayT = 0.8;
          this.clearServants();
          sfx('armyHorns', { vol: 0.7, pitch: 0.7 });
          sfx('clash', { vol: 0.8 });
          G.ui.toast('His bands turn on one another', 'good');
          G.ui.caption('“...every man\'s sword shall be against his brother.” · Ezekiel 38:21 (KJV)');
          G.world.after(3.2, () => G.ui.caption(null));
        }
        this.target = { ...MP.stagger, lean: 0.1 };
        this.rate = 8;
        if (!this.brawl || t > this.brawl.len + 0.4) {
          this.confused = false;
          this.endAttack(0.6);
        }
        break;
      }
      case 'summon': {
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = MP.rising;
        if (t >= 0.6 && this.step === 0) {
          this.step = 1;
          this.summon(HOSTS[Math.min(2, this.phase - 1)], this.phase >= 3 ? 3 : 2, ASH, this.phase >= 3 ? 9 : 12, 'Gog calls his bands');
        }
        if (t > 1.3) this.endAttack(0.8);
        break;
      }
    }
  }

  /** The brawl at the walls: swords sweep the floor from both sides, a beat apart, while it lasts. */
  private tickBrawl(dt: number) {
    const B = this.brawl;
    if (!B) return;
    B.t += dt;
    this.strayT -= dt;
    if (this.strayT <= 0 && B.t < B.len) {
      this.strayT = 0.72;
      const left = Math.floor(B.t / 0.72) % 2 === 0, w = this.width;
      sfx('clash', { pan: G.world.pan(left ? 80 : w - 80), vol: 0.7, pitch: rand(0.8, 1.1) });
      fx.hitSparks(left ? 90 : w - 90, this.y - 30, left ? 1 : -1, '#ffe6a8', 8, 1);
      G.world.add(new Proj('wave', left ? 96 : w - 96, this.y, 'enemy', this.dmg * 0.5, { vx: left ? 340 : -340, life: 5, w: 18, h: 26, color: '#cfd2e0' }));
    }
    if (B.t >= B.len) this.brawl = null;
  }

  // ------------------------------------------------------------ the movements
  beginTransition() { this.change(2); }
  enterPhase3() { this.change(3); }

  private change(phase: number) {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.cloudy = 0;
    this.lift = 0;
    this.confused = false;
    this.brawl = null;
    this.collide = true;
    this.phase = phase;
    this.introT = 0;
    this.invuln = 999;
    this.marks.length = 0;
    this.maxPoise = this.poise = phase >= 3 ? 1800 : 1650;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.6, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  /** The fourth movement: nothing of Elior's can take the last of him. */
  private startHail() {
    this.change(4);
    this.sub = 'Hailstones, Fire, and Brimstone';
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 70 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    const hail = this.phase >= 4;
    if (t < 0.9) {
      this.target = { ...MP.kneel, lean: 0.4, head: 0.4 };
      this.rate = 6;
      if (this.introT === 0) {
        this.introT = 1;
        sfx('bossRoar', { pitch: 0.55 });
        G.camera.addTrauma(0.4 * shakeScale());
        G.ui.caption(hail
          ? '“And I will plead against him with pestilence and with blood;” · Ezekiel 38:22 (KJV)'
          : this.phase === 2
            ? '“Thou shalt ascend and come like a storm, thou shalt be like a cloud to cover the land,” · Ezekiel 38:9 (KJV)'
            : '“And I will call for a sword against him throughout all my mountains,” · Ezekiel 38:21 (KJV)');
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      this.target = { ...MP.rising, head: -0.3 };
      this.rate = 8;
      if (!hail) this.sub = this.phase === 2 ? 'As a Cloud to Cover the Land' : 'Every Man\'s Sword Against His Brother';
      fx.flash(hail ? '#ffffff' : ASH, 0.3);
      fx.ring(this.x, this.y - 40, 10, 320, hail ? '#ffffff' : ASH, 0.9, 6);
      fx.column(this.x, this.y, 60, 340, hail ? '#ffffff' : BONE, 0.6);
      sfx('armyHorns', { vol: 0.9, pitch: 0.8 });
      sfx('thunder', { vol: 1 });
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.banner('GOG', this.sub, 'boss');
      music.bossPhase(Math.min(3, this.phase - 1));
      this.callT = 3;
      if (hail) { skyState.torn = true; this.clearServants(); }
    } else if (t > (hail ? 2.6 : 2.2)) {
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.ui.caption(null);
      G.ui.bossBar(this.name, this.sub);
      G.camera.focus = null;
      this.st = 0;
      if (hail) {
        // Elior cannot strike him now: he must withstand until the sky answers.
        this.hailing = true;
        this.state = 'hail';
        this.hailT = 0;
        this.hailTick = 0.4;
        this.invuln = 999;
        G.ui.toast('Withstand it: the LORD pleads against him.', 'warn');
      } else {
        this.state = 'idle';
        this.cd = 0.8;
        this.invuln = 0;
      }
    }
  }

  /** Hail and fire across the whole floor, thicker as it goes, until the sky has done it. */
  private runHail(dt: number) {
    const W = G.world, w = this.width, p = W.player;
    this.hailT += dt;
    // He stands in the middle, arms up, and does not fight.
    const mid = w / 2;
    this.body.vx = approach(this.body.vx, clamp((mid - this.x) * 2, -120, 120), 600 * dt);
    this.physics(dt);
    this.face = sign(p.x - this.x) || this.face;
    this.target = { ...MP.rising, head: -0.4, lean: -0.3 };
    this.rate = 6;
    const u = clamp(this.hailT / this.hailLen, 0, 1);
    this.hailTick -= dt;
    if (this.hailT < this.hailLen - 1.2 && this.hailTick <= 0) {
      this.hailTick = lerp(1.15, 0.5, u);
      const n = u < 0.3 ? 2 : u < 0.65 ? 3 : 4, delay = lerp(0.95, 0.72, u);
      // One falls where Elior stands; the rest are scattered across the floor.
      const xs: number[] = [p.x + rand(-20, 20)];
      for (let tries = 0; xs.length < n && tries < 20; tries++) {
        const x = rand(100, w - 100);
        if (xs.every((o) => Math.abs(o - x) > 70)) xs.push(x);
      }
      for (const x of xs) this.mark(Math.random() < 0.3 ? 'fire' : 'hail', x, delay);
    }
    if (Math.random() < dt * 4) { G.camera.addTrauma(0.1 * shakeScale()); }
    if (Math.random() < dt * 0.9) { sfx('thunder', { vol: 0.5 }); fx.flash('#c8d0ff', 0.06); }
    if (this.hailT >= this.hailLen) {
      this.hailing = false;
      this.marks.length = 0;
      this.invuln = 0;
      this.hp = 0;
      this.die();
    }
  }

  /** How far the withstanding has come (for the HUD and the tests). */
  get hailU() { return this.hailing ? clamp(this.hailT / this.hailLen, 0, 1) : 0; }

  die() {
    super.die();
    this.atk = null;
    this.hailing = false;
    this.cloudy = 0;
    this.lift = 0;
    this.confused = false;
    this.brawl = null;
    this.collide = true;
    this.marks.length = 0;
    this.ghosts.length = 0;
    this.clearServants();
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 70 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 1.6) {
      this.target = { ...MP.kneel, lean: 0.5, head: 0.3 };
      this.rate = 5;
      if (this.introT !== 7) {
        this.introT = 7;
        sfx('bossRoar', { pitch: 0.5 });
        G.ui.caption('“Thou shalt fall upon the mountains of Israel, thou, and all thy bands, and the people that is with thee:” · Ezekiel 39:4 (KJV)');
      }
    } else if (t < 4.6) {
      // Fire out of the torn sky, on him and on all that is with him.
      if (this.introT === 7) {
        this.introT = 8;
        fx.flash('#ffffff', 0.9);
        fx.column(this.x, this.y, 140, 520, '#ffffff', 1.8);
        fx.column(this.x, this.y, 70, 520, '#ffd27a', 1.6);
        fx.holyBurst(this.x, this.y - 60, 46, 2.4);
        fx.ring(this.x, this.y - 70, 20, 440, '#fff1c4', 1.2, 6);
        sfx('thunder', { vol: 1 });
        sfx('trumpet', { vol: 1 });
        sfx('elemHoly', { vol: 0.9 });
        G.camera.addTrauma(0.9 * shakeScale());
        G.ui.caption('“Thus will I magnify myself, and sanctify myself;” · Ezekiel 38:23 (KJV)');
      }
      this.fire(dt, t);
      this.fade = Math.max(0, 1 - (t - 2.0) / 2.2);
    } else if (this.introT === 8) {
      this.introT = 9;
      this.fade = 0;
      skyState.torn = false;
      G.ui.caption(null);
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  private fire(dt: number, t: number) {
    if (Math.random() < dt * 30) fx.spawn(PK.Ember, this.x + rand(-30, 30), this.y - rand(10, 120), rand(-30, 30), rand(-120, -40), 0.9, 3, 0.6, '#ffd27a');
    if (t < 3.4 && Math.random() < dt * 2) fx.column(this.x + rand(-300, 300), this.y, 40, 480, '#ffe0a0', 0.5);
  }

  // ------------------------------------------------------------ the look
  protected ambient(dt: number) {
    this.fireT += dt;
    // A cloud clings to him from the second movement on; embers come off him once the hail is falling.
    if (this.phase >= 2 && Math.random() < dt * 18) fx.spawn(PK.Smoke, this.x + rand(-26, 26), this.y - rand(10, 90) - this.lift, rand(-10, 10), rand(-30, -8), 0.9, 6, 14, '#1a1626', 0, 1);
    if (this.hailing && Math.random() < dt * 20) fx.spawn(PK.Ember, this.x + rand(-24, 24), this.y - rand(20, 100), rand(-10, 10), rand(-80, -30), 0.7, 2.5, 0.6, '#ff8a3a');
  }

  protected drawBack(ctx: Ctx) {
    // The cloud behind and around him.
    if (this.phase >= 2 || this.cloudy > 0) {
      const a = 0.5 + this.cloudy * 0.4;
      ctx.globalAlpha = a * this.fade;
      for (let i = 0; i < 5; i++) {
        const ox = Math.sin(this.fireT * 0.8 + i * 1.7) * 26, oy = -40 - i * 22 - this.lift + Math.cos(this.fireT * 0.6 + i) * 6;
        ellipse(ctx, this.x + ox + (i - 2) * 14, this.y + oy, 60 + (i % 2) * 14, 28, 0, i % 2 ? '#14101e' : '#241c34');
      }
      ctx.globalAlpha = this.fade;
      if (this.cloudy > 0.3) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this.x, this.y - 60 - this.lift, 80, ASH, 0.25 * this.cloudy);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  draw(ctx: Ctx) {
    // Lifted into the cloud he is drawn higher and fainter: the hit boxes stay on the floor.
    if (this.lift > 0 || this.cloudy > 0) {
      ctx.save();
      ctx.translate(0, -this.lift);
      const was = this.fade;
      this.fade = was * (1 - this.cloudy * 0.82);
      super.draw(ctx);
      this.fade = was;
      ctx.restore();
      return;
    }
    super.draw(ctx);
  }

  protected drawOn(ctx: Ctx) {
    // A crown of black iron and tall spikes, with a trailing plume.
    const j = this.j;
    ctx.save();
    ctx.translate(j.headX, j.headY);
    ctx.rotate(j.headA);
    poly(ctx, [-7, -6, -6, -19, -3, -11, -1, -24, 1, -11, 4, -21, 6, -11, 8, -17, 8, -6], '#2a2a36', '#04030a', 0.6);
    for (const x of [-6, -1, 4, 8]) poly(ctx, [x - 1, -15 - (x === -1 ? 6 : 2), x + 1, -15 - (x === -1 ? 6 : 2), x, -20 - (x === -1 ? 4 : 0)], GOLD);
    poly(ctx, [-7, -6, 8, -6, 8, -8, -7, -8], GOLD);
    ctx.restore();
  }

  protected drawFront(ctx: Ctx) {
    const w = this.width;
    // The brawl at the walls: two pairs of dark figures, swords against brothers.
    if (this.brawl) {
      const B = this.brawl, a = clamp(Math.min(B.t / 0.4, (B.len - B.t) / 0.4), 0, 1);
      for (const [cx, dir] of [[96, 1], [w - 96, -1]] as const) {
        ctx.globalAlpha = 0.85 * a;
        for (const s of [0, 1]) {
          const x = cx + (s ? 18 : -18) * dir * 0.5 + (s ? 1 : -1) * 10 * dir, sw = Math.sin(G.time * 11 + s * 3 + cx) * 0.6;
          poly(ctx, [x - 6, this.y, x + 6, this.y, x + 5, this.y - 34, x - 5, this.y - 34], '#14101a');
          circle(ctx, x, this.y - 40, 5.5, '#14101a');
          ctx.strokeStyle = '#cfd2e0';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x, this.y - 28);
          ctx.lineTo(x + Math.cos(-0.9 + sw) * 24 * (s ? -dir : dir), this.y - 28 + Math.sin(-0.9 + sw) * 24);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (this.state === 'attack') {
      const hd = this.hand(), t = this.st;
      if ((this.atk === 'combo' && this.step === 0 && t < 0.44 / this.spd) || (this.atk === 'rush' && this.step === 0) || (this.atk === 'sweep' && this.step === 0)) this.glint(ctx, hd.x, hd.y - 8, ASH, 1.4);
      if (this.atk === 'cloud' && this.step === 1 && this.st % (1.4 / this.spd) < 0.62 / this.spd) {
        const dir = G.world.player.x < w / 2 ? 1 : -1, x0 = dir > 0 ? 40 : w - 40;
        this.floorMark(ctx, (x0 + (dir > 0 ? w - 40 : 40)) / 2, this.y, Math.abs(w - 80) / 2, (this.st % (1.4 / this.spd)) / (0.62 / this.spd), ASH);
      }
    }
    if (this.hailing) {
      // The cloud above him is torn: a shaft of white light on him from above.
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 200, 120, '#ffffff', 0.18 + Math.sin(G.time * 8) * 0.04);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    super.lights();
    if (this.hailing) lighting.add(this.x, this.y - 160, 320, '#ffe0a0', 0.9, 0.7);
  }

  /** The hail marks are the ones the base class draws; this lets a test read them. */
  get activeMarks(): Mark[] { return this.marks; }
}
