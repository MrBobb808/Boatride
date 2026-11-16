// Chapter XIV, the river's optional fight: the Warden of the Salt. "But the miry places thereof and the marshes thereof
// shall not be healed; they shall be given to salt." (Ezekiel 47:11, KJV) Where the waters from the threshold do not
// reach, something old keeps the dead sea's last pocket. It is a fight Elior may win: nothing here is the LORD's
// answer, only a keeper left over, and the chapter's way on never waits for it.
//
// - THE CRUST (from the start): a salt-white giant. Cleaves in threes, a slam that sends two brine waves along the
//   floor (jump them), and salt that falls on marked ground (hail marks, white shards).
// - THE BRINE (half health): faster; the slam sends a second pair of waves, the salt falls in a wider spread, and a
//   short lunge closes the distance.

import { MP } from './bosses2';
import { Prince14, ghostOf } from './bosses14';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, sign, choose } from '../core/math';
import { Proj } from './projectiles';
import { shakeScale } from '../core/settings';
import type { HumanStyle } from '../render/actors';
import type { Ctx } from '../render/draw';
import { glow } from '../render/draw';

const SALT = '#dfe8ea', BRINE = '#6fb4c0', CRUST = '#a9b9bc';

const WARDEN: HumanStyle = {
  skin: '#c4d0d2', hair: '#e8f0f0', hairKind: 'short', beard: '#e8f0f0', coat: '#8a9ea2', coatDark: '#4e6064', skirt: 20, trim: SALT,
  pants: '#52666a', boots: '#364648', glove: '#6a8084', belt: SALT, plate: { c: '#b8c8cc', dark: '#64787c', hi: '#f4fbfb', tier: 3 },
  helm: 'visor', helmColor: '#b8c8cc', helmTrim: '#f4fbfb', eye: '#9ee6ff', eyeGlow: 0.9, outline: '#060a0c',
  weapon: 'spear', weaponColor: '#e8f4f6', weaponGlow: BRINE, weaponGlowAmt: 0.5, offhand: 'none', offColor: CRUST, offTrim: SALT, bulk: 1.6, crest: BRINE,
};

type WAtk = 'cleave' | 'slam' | 'salt' | 'lunge';

export class SaltWarden extends Prince14 {
  pixelBox = [-170, -190, 170, 14] as const;
  readonly style = WARDEN;
  readonly ghostStyle = ghostOf(WARDEN, BRINE);
  protected capeColor = '#6a8084';
  protected glow = BRINE;
  landX = 0;

  constructor(x: number, y: number) {
    super('salt_warden', x, y, 1600000);
    this.name = 'The Warden of the Salt';
    this.sub = 'The Marshes Given to Salt';
    this.maxPoise = this.poise = 1000;
    this.kneelTime = 3;
    this.p2At = 0.5;
    this.phaseMarks = [0.5];
    this.callT = 1e9;
    this.face = -1;
  }

  get dmg() { return 520 * this.ngMul * this.encounterDamage * (this.phase >= 2 ? 1.15 : 1); }
  get spd() { return this.phase >= 2 ? 1.3 : 1.05; }

  // ------------------------------------------------------------ lifecycle
  updateIntro(_dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x - 30, y: this.y - 60 };
    if (t < 0.6) this.target = { ...MP.planted, head: 0.2 };
    else if (this.introT === 0) {
      this.introT = 1;
      this.target = { ...MP.rising };
      this.rate = 10;
      sfx('bossRoar', { pitch: 0.7 });
      fx.ring(this.x, this.y - 50, 12, 260, BRINE, 0.8, 5);
      fx.shards(this.x, this.y - 40, 16, SALT, 1.2);
      G.camera.addTrauma(0.35 * shakeScale());
      G.ui.banner('THE WARDEN OF THE SALT', this.sub, 'boss');
      music.play('duel', 0.6);
      music.phase = 0;
    } else if (t > 2.0) {
      this.target = { ...MP.guard };
      this.beginFight();
      G.camera.viewMultTarget = 1.15;
    }
  }

  onKneel() {
    this.atk = null;
    this.collide = true;
    this.marks.length = 0;
    G.ui.toast('The crust cracks: strike now.', 'good');
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    const p = G.world.player, dx = p.x - this.x, dist = Math.abs(dx);
    this.tickMarks(dt);
    if (this.state === 'idle') {
      this.idleWalk(dt, dx, dist, 80, 85);
      if (this.cd <= 0) this.choose(dist);
      return;
    }
    if (this.state === 'attack') this.runAttack(dt, dx);
  }

  private choose(dist: number) {
    const ph = this.phase;
    const near: WAtk[] = ph >= 2 ? ['cleave', 'slam', 'cleave', 'salt'] : ['cleave', 'cleave', 'slam', 'salt'];
    const far: WAtk[] = ph >= 2 ? ['lunge', 'salt', 'slam'] : ['salt', 'slam', 'salt'];
    const pool = dist < 120 ? near : far;
    let a = choose(pool);
    if (a === this.lastAtk && Math.random() < 0.7) a = choose(pool);
    this.start(a, a === 'cleave' ? (ph >= 2 ? 4 : 3) : 1);
  }

  private runAttack(dt: number, dx: number) {
    const t = this.st, f = this.face, W = G.world, sp = this.spd, b = this.body;
    switch (this.atk as WAtk) {
      case 'cleave': {
        // Thrust, thrust, and a low sweep; the fourth (second movement) is a thrust again.
        const kind = this.step % 3 === 2 ? 1 : 0;
        const tel = (this.step === 0 ? 0.5 : 0.32) / sp, act = 0.14, rec = this.step === this.steps - 1 ? 0.6 : 0.1;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (t < tel) {
          this.rate = 12;
          this.target = kind === 0 ? MP.draw : MP.low;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = kind === 0 ? MP.thrust : MP.rising;
          if (t - dt < tel) {
            b.vx = f * (kind === 0 ? 320 : 190);
            sfx('spearThrust', { pan: W.pan(this.x), pitch: 0.55 });
            if (kind === 0) fx.streak(this.x + f * 14, this.y - 44, this.x + f * 160, this.y - 44, SALT, 0.2, 4);
            else this.swingFx(1.0, -2.4, 56, SALT, BRINE);
          }
          if (kind === 0) this.hit(0, -62, 160, 28, 1, { poise: 60, kx: f * 340, ky: -170 });
          else this.hit(-4, -50, 130, 56, 1.05, { poise: 50, ky: -300, kx: f * 140 });
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
      case 'slam': {
        // The fist driven into the floor: the shock runs both ways as brine (jump it).
        const tel = 0.62 / sp, act = 0.18;
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        if (t < tel) {
          this.rate = 12;
          this.target = MP.overhead;
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = MP.downcut;
          if (this.step === 0) {
            this.step = 1;
            sfx('bossSlam', { pan: W.pan(this.x), pitch: 0.8, vol: 0.9 });
            G.camera.addTrauma(0.5 * shakeScale());
            fx.dust(this.x, this.y, 22, 2.4);
            fx.ring(this.x, this.y - 2, 8, 150, BRINE, 0.45, 4, 0.25);
            const waves = this.phase >= 2 ? 2 : 1;
            for (let i = 0; i < waves; i++) for (const s of [-1, 1]) W.add(new Proj('wave', this.x + s * (28 + i * 70), this.y, 'enemy', this.dmg * 0.6, { vx: s * (300 + i * 40), life: 2.4, w: 16, h: 26, color: BRINE, big: true }));
            this.hit(-30, -50, 90, 50, 1.1, { poise: 60, kx: f * 300, ky: -300, unblockable: true, parryable: false });
          }
        } else if (t < tel + act + 0.7) this.rate = 6;
        else this.endAttack(1.1);
        break;
      }
      case 'salt': {
        // He stands and calls: salt falls on marked ground around Elior.
        b.vx = approach(b.vx, 0, 900 * dt);
        this.physics(dt);
        this.target = { ...MP.overhead, head: -0.2 };
        this.rate = 10;
        if (this.step === 0) {
          this.step = 1;
          sfx('bossRoar', { pitch: 1.1, vol: 0.5 });
          const n = this.phase >= 2 ? 5 : 3, px = W.player.x;
          for (let i = 0; i < n; i++) this.mark('hail', px + (i - (n - 1) / 2) * (this.phase >= 2 ? 90 : 120) + (i % 2 ? 20 : -20), 0.9 + i * 0.12);
        }
        if (t > 1.9 / sp) this.endAttack(1.0);
        break;
      }
      case 'lunge': {
        // A short rush with the spear lowered, to close a gap.
        const tel = 0.45 / sp, act = 0.35;
        if (t < tel) {
          this.rate = 12;
          this.target = MP.crouch;
          b.vx = approach(b.vx, -f * 30, 600 * dt);
        } else if (t < tel + act) {
          this.rate = 30;
          this.target = MP.thrust;
          if (t - dt < tel) { b.vx = f * 520; sfx('swingHeavy', { pan: W.pan(this.x), pitch: 0.5 }); }
          this.hit(-6, -70, 110, 70, 1.15, { poise: 70, kx: f * 420, ky: -240 });
          this.ghostT -= dt;
          if (this.ghostT <= 0) this.addGhost();
        } else if (t < tel + act + 0.6) { b.vx = approach(b.vx, 0, 1600 * dt); this.rate = 8; }
        else this.endAttack(1.1);
        this.physics(dt);
        break;
      }
    }
    this.x = clamp(this.x, 60, this.width - 60);
  }

  beginTransition() { this.change(2); }
  enterPhase3() { /* two movements only */ }

  private change(phase: number) {
    this.state = 'transition';
    this.st = 0;
    this.atk = null;
    this.collide = true;
    this.phase = phase;
    this.introT = 0;
    this.invuln = 999;
    this.marks.length = 0;
    this.maxPoise = this.poise = 1100;
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.6, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    G.camera.focus = { x: this.x, y: this.y - 60 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 0.9) {
      this.target = { ...MP.kneel, lean: 0.3, head: 0.4 };
      this.rate = 6;
      if (this.introT === 0) {
        this.introT = 1;
        sfx('bossRoar', { pitch: 0.65 });
        G.camera.addTrauma(0.3 * shakeScale());
        G.ui.caption('“...they shall be given to salt.” · Ezekiel 47:11 (KJV)');
        fx.shards(this.x, this.y - 40, 22, SALT, 1.4);
      }
    } else if (this.introT === 1) {
      this.introT = 2;
      this.target = { ...MP.rising, head: -0.3 };
      this.rate = 8;
      this.sub = 'The Brine Rises';
      fx.flash(BRINE, 0.25);
      fx.ring(this.x, this.y - 40, 10, 300, BRINE, 0.9, 6);
      G.ui.banner('THE WARDEN OF THE SALT', this.sub, 'boss');
      music.bossPhase(1);
    } else if (t > 2.0) {
      this.state = 'idle';
      this.st = 0;
      this.cd = 0.8;
      this.invuln = 0;
      G.inCutscene = false;
      G.ui.cinematicBars(false);
      G.ui.caption(null);
      G.ui.bossBar(this.name, this.sub);
      G.camera.focus = null;
    }
  }

  die() {
    super.die();
    this.atk = null;
    this.collide = true;
    this.marks.length = 0;
    this.ghosts.length = 0;
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    G.camera.focus = { x: this.x, y: this.y - 50 };
    this.body.vx = approach(this.body.vx, 0, 600 * dt);
    this.physics(dt);
    if (t < 2.0) {
      this.target = { ...MP.kneel, lean: 0.5, head: 0.3 };
      this.rate = 5;
      if (this.introT !== 7) { this.introT = 7; sfx('bossRoar', { pitch: 0.5 }); }
    } else if (t < 3.8) {
      this.fade = Math.max(0, 1 - (t - 2.0) / 1.6);
      if (this.introT === 7) { this.introT = 8; fx.flash(SALT, 0.4); sfx('bell', { vol: 0.6 }); fx.shards(this.x, this.y - 40, 30, SALT, 1.6); }
    } else if (this.introT === 8) {
      this.introT = 9;
      this.fade = 0;
      G.camera.focus = null;
      G.world.onBossDefeated(this);
    }
  }

  protected drawFront(ctx: Ctx) {
    if (this.atk === 'slam' && this.step === 0 && this.st < 0.62 / this.spd) this.floorMark(ctx, this.x, this.y, 90, this.st / (0.62 / this.spd), BRINE);
    // A crust of salt glitters on the shoulders.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 70, 46, SALT, 0.12 + Math.sin(G.time * 3) * 0.03);
    ctx.globalCompositeOperation = 'source-over';
  }
}
