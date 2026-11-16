// The host of Gog's own foes (Chapter XIV): the three that march with the knights and bulwarks.
//
// - Horseman of Magog (`rider`): a lancer on a black horse. It stands off, rears (the tell), then charges the whole
//   floor at the hero and wheels to come again. Jump the lance or dodge through; a parry stops the charge.
// - Standard-Bearer of the North (`standard`): holds a long black standard and keeps behind the line. While it
//   stands the foes about it fight a quarter faster (a glow marks them); when it falls they waver.
// - Sapper of the North (`sapper`): lobs pots of fire in an arc from a distance and keeps backing off; a pot spills
//   where it dies.

import { type HitInfo } from './entity';
import { Archer, Enemy, CORRUPT, archerStyle } from './enemies';
import { Knight } from './tanks';
import { type HumanStyle } from '../render/actors';
import { glow, poly, ellipse, circle, type Ctx } from '../render/draw';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign } from '../core/math';
import { Proj } from './projectiles';
import { wallAhead } from './physics';

const COAT = '#1c1620', GOLD = '#c8a04a', CRIMSON = '#7a1e22';

function hostStyle(o: Partial<HumanStyle>): HumanStyle {
  return {
    skin: '#5a4a46', hair: null, hairKind: 'none', coat: COAT, coatDark: '#0e0a12', skirt: 12, trim: GOLD,
    pants: '#14101a', boots: '#0e0a0e', glove: '#1a141c', belt: GOLD, plate: { c: '#3a3844', dark: '#16161e', hi: '#9a98b0', tier: 2 },
    helm: 'sentinel', helmColor: '#2a2834', helmTrim: GOLD, eye: '#ffe6b0', eyeGlow: 0.7, outline: CORRUPT.outline,
    weapon: 'spear', weaponColor: '#c8c8d4', weaponGlow: '#8a7ac8', weaponGlowAmt: 0.3, offhand: 'none', bulk: 1.2, crest: CRIMSON, ...o,
  };
}

// ---------------------------------------------------------------- Horseman of Magog

export class Rider extends Knight {
  gait = rand(0, 6);
  dashDir = 1;
  rearT = 0;
  constructor(x: number, y: number, elite: string | null) {
    super(x, y, elite);
    this.retype('rider');
    this.style = hostStyle({ weapon: 'spear', helm: 'visor', crest: CRIMSON });
    this.body.w = 30;
    this.body.h = 46;
    this.superArmor = false;
    this.attackCd = rand(0.8, 1.6);
  }
  groan() { sfx('roar', { pan: G.world.pan(this.x), vol: 0.4, pitch: 1.6 }); }
  /** A rider on a charging horse is not parried like a duelist. */
  guardCheck(_h: HitInfo) { return false; }

  think(dt: number) {
    const b = this.body;
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (!this.aggro) {
      const t = this.pickTarget(320);
      if (t && this.canSee(t)) { this.aggro = true; this.groan(); }
      b.vx = approach(b.vx, 0, 600 * dt);
      this.anim!.play('guard', 0.2);
      return;
    }
    this.target = this.pickTarget(680);
    if (!this.target) { this.aggro = false; return; }
    const t = this.target, dx = t.x - this.x, dist = Math.abs(dx);
    switch (this.state) {
      case 'rear': {
        // The tell: the horse rears, the lance comes down.
        b.vx = approach(b.vx, 0, 1400 * dt);
        this.rearT = Math.min(1, this.st / 0.4);
        if (this.st >= 0.62) { this.hitSet.clear(); this.setState('charge', 'bash', 0.05); sfx('charge', { pan: G.world.pan(this.x), pitch: 1.1 }); }
        break;
      }
      case 'charge': {
        this.rearT = 0;
        this.gait += dt * 16;
        b.vx = this.dashDir * 500;
        this.face = this.dashDir;
        this.strike(-6, -48, 62, 44, 1.2, { poise: 50, kx: this.dashDir * 320, ky: -170 });
        const past = (this.dashDir > 0 && this.x > t.x + 150) || (this.dashDir < 0 && this.x < t.x - 150);
        if (past || this.st > 1.25 || wallAhead(b, this.dashDir, G.world.grid, G.world.solid, 20)) {
          fx.dust(this.x, this.y, 8, 1.6);
          this.setState('wheel');
        }
        break;
      }
      case 'wheel': {
        b.vx = approach(b.vx, 0, 1100 * dt);
        if (this.st >= 0.5) { this.attackCd = rand(0.9, 1.7); this.faceTarget(); this.setState('move', 'guard', 0.2); }
        break;
      }
      default: {
        this.faceTarget();
        this.rearT = 0;
        if (this.attackCd <= 0 && b.onGround && Math.abs(t.y - this.y) < 70 && dist > 150 && dist < 560) {
          this.dashDir = sign(dx) || this.face;
          this.face = this.dashDir;
          this.hitSet.clear();
          this.setState('rear', 'guard', 0.1);
          sfx('roar', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.5 });
          break;
        }
        // Between charges it paces at a lance's length, backing off when pressed.
        const want = dist < 120 ? -sign(dx) * 90 : dist > 340 ? sign(dx) * 110 : 0;
        b.vx = approach(b.vx, want, 700 * dt);
        this.gait += dt * Math.abs(b.vx) * 0.05;
        this.state = 'move';
      }
    }
  }

  draw(ctx: Ctx) {
    if (this.dying && !this.awaitingPurify) { this.drawRider(ctx, 0); return; }
    this.drawRider(ctx, this.rearT);
  }

  /** The rider is drawn first and the horse over his legs, so he sits; the horse rears about its hind hooves. */
  private drawRider(ctx: Ctx, rear: number) {
    const x0 = this.x, y0 = this.y, f = this.face, g = this.gait;
    // The rider: the base class draws him in world space, so he is lifted onto the horse's back for the call, and
    // tipped with the horse about its hind hooves when it rears.
    const yy = this.body.y;
    this.body.y = yy - 17;
    ctx.save();
    if (rear) { ctx.translate(x0 - f * 14, y0); ctx.rotate(-0.5 * rear * f); ctx.translate(-(x0 - f * 14), -y0); }
    this.drawHumanoidBody(ctx);
    ctx.restore();
    this.body.y = yy;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.scale(f, 1);
    ctx.translate(-14, 0);
    ctx.rotate(-0.5 * rear);
    ctx.translate(14, 0);
    const coat = '#241c1a', hi = '#3a2c28', swing = Math.abs(this.body.vx) > 200 ? 9 : 5;
    // Hooves and legs.
    for (const [lx, ph] of [[-16, 0], [-9, 1.6], [10, 3.2], [17, 4.8]] as const) {
      const s = Math.sin(g + ph) * swing * (1 - rear * 0.7), lift = Math.max(0, Math.cos(g + ph)) * 3;
      poly(ctx, [lx - 2, -18, lx + 2, -18, lx + 2 + s, -2 - lift, lx - 2 + s, -2 - lift], coat, '#060408', 0.5);
      poly(ctx, [lx - 3 + s, -2 - lift, lx + 3 + s, -2 - lift, lx + 3 + s, 0 - lift, lx - 3 + s, 0 - lift], '#0e0a0a');
    }
    // Body, hindquarters and chest.
    ellipse(ctx, 0, -24, 22, 9, 0, coat);
    ellipse(ctx, -13, -25, 10, 10, 0, coat);
    ellipse(ctx, 13, -27, 9, 10, 0, hi);
    // The caparison: a black cloth edged in gold over the horse's back.
    poly(ctx, [-18, -30, 16, -30, 14, -16, -17, -16], COAT, GOLD, 0.8);
    poly(ctx, [-18, -16, 14, -16, 13, -13, -17, -13], CRIMSON);
    // Neck, head and mane.
    poly(ctx, [14, -30, 24, -44, 31, -42, 22, -26], coat, '#060408', 0.5);
    ellipse(ctx, 31, -42, 8, 4, -0.5, coat);
    poly(ctx, [14, -32, 22, -48, 25, -46, 18, -30], CRIMSON);
    circle(ctx, 33, -43, 1, '#ffe6b0');
    // The tail streams behind.
    const w = Math.sin(g * 0.8) * 3;
    poly(ctx, [-22, -27, -34, -20 + w, -32, -10 + w, -21, -22], '#14100e');
    // The lance, level in the charge.
    if (this.state === 'charge') {
      ctx.strokeStyle = '#6a5038';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -46); ctx.lineTo(54, -40);
      ctx.stroke();
      poly(ctx, [54, -43, 66, -40, 54, -37], '#c8c8d4');
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Standard-Bearer of the North

export class StandardBearer extends Knight {
  private rallied = new Set<Enemy>();
  private auraT = 0;
  constructor(x: number, y: number, elite: string | null) {
    super(x, y, elite);
    this.retype('standard');
    this.style = hostStyle({ weapon: 'staff', helm: 'visor', crest: GOLD, coat: '#2a1418', trim: GOLD });
    this.superArmor = false;
  }
  groan() { sfx('armyHorns', { pan: G.world.pan(this.x), vol: 0.35, pitch: 1.1 }); }
  guardCheck(_h: HitInfo) { return false; }

  think(dt: number) {
    const b = this.body;
    // Close in, it fights as a knight; otherwise it keeps its distance and holds the standard high.
    if (this.state === 'slash' || this.state === 'lunge') { super.think(dt); return; }
    if (!this.aggro) {
      const t = this.pickTarget(300);
      if (t && this.canSee(t)) { this.aggro = true; this.groan(); }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(560);
    if (!this.target) { this.aggro = false; return; }
    const dx = this.target.x - this.x, dist = Math.abs(dx);
    if (dist < 60) { super.think(dt); return; }
    this.faceTarget();
    const want = dist < 190 ? -sign(dx) * 80 : dist > 320 ? sign(dx) * 70 : 0;
    b.vx = approach(b.vx, want, 600 * dt);
    const stuck = want !== 0 && wallAhead(b, sign(want), G.world.grid, G.world.solid, 14);
    if (stuck) b.vx = 0;
    const anim = Math.abs(b.vx) > 5 ? 'walk' : 'guard';
    if (this.anim!.name !== anim) this.anim!.play(anim, 0.2);
    this.state = 'move';
  }

  update(dt: number) {
    super.update(dt);
    if (this.dying) return;
    this.auraT -= dt;
    if (this.auraT > 0) return;
    this.auraT = 0.4;
    // The foes about it fight a quarter faster while it stands.
    for (const e of G.world.ents) {
      if (!(e instanceof Enemy) || e === this || e.dying || e.remove || e.isBoss) continue;
      const near = Math.abs(e.x - this.x) < 340 && Math.abs(e.y - this.y) < 160;
      if (near && !this.rallied.has(e)) { this.rallied.add(e); e.tempo *= 1.25; }
      else if (!near && this.rallied.has(e)) { this.rallied.delete(e); e.tempo /= 1.25; }
    }
    for (const e of [...this.rallied]) if (e.dying || e.remove) this.rallied.delete(e);
  }

  /** Down, the standard falls: the foes it rallied slow again and waver. */
  die(h?: HitInfo) {
    if (this.dying) return;
    for (const e of this.rallied) {
      if (e.dying || e.remove) continue;
      e.tempo /= 1.25;
      e.poise = Math.max(0, e.poise - 35);
      fx.hitSparks(e.x, e.y - 24, 1, '#ff8a6a', 6, 0.8);
    }
    if (this.rallied.size) { G.ui.toast('The standard falls: the host wavers', 'good'); sfx('shieldBreak', { pan: G.world.pan(this.x), vol: 0.6 }); }
    this.rallied.clear();
    super.die(h);
  }

  draw(ctx: Ctx) {
    super.draw(ctx);
    if (this.dying) return;
    const f = this.face, hx = this.x + f * this.j.haFX, hy = this.y + this.j.haFY;
    // The standard: a long pole and a black cloth bearing a gold sign, moving in the wind.
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 6); ctx.lineTo(hx, hy - 62);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const wave = Math.sin(G.time * 4 + i * 0.7) * (i / 10) * 3.5, x = hx + f * (2 + i * 2.1);
      poly(ctx, [x, hy - 60 + i * 0.6 + wave, x + f * 2.2, hy - 60 + i * 0.6 + wave, x + f * 2.2, hy - 34 + i * 0.4 + wave, x, hy - 34 + i * 0.4 + wave], i % 4 === 0 ? '#0e0810' : '#241420');
    }
    poly(ctx, [hx + f * 7, hy - 52, hx + f * 13, hy - 48, hx + f * 7, hy - 44, hx + f * 4, hy - 48], GOLD);
    // A faint red mark over each foe it is rallying.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.rallied) glow(ctx, e.x, e.y - 52, 9, '#ff3a3a', 0.35 + Math.sin(G.time * 6) * 0.1);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- Sapper of the North

export class Sapper extends Archer {
  constructor(x: number, y: number, elite: string | null) {
    super(x, y, elite);
    this.retype('sapper');
    this.style = {
      ...archerStyle('corrupt', 0, false), coat: '#4a2a18', coatDark: '#2a160c', trim: '#ff8a3a', helm: 'hood_up', helmColor: '#3a2014',
      offhand: 'lantern', offColor: '#ff8a3a', offTrim: '#ffd27a', crack: '#ff7a2a', weaponGlow: '#ff7a2a', eye: '#ffd27a',
    };
  }

  /** A pot of fire lobbed in an arc to where the hero stands. */
  fire(t: { x: number; y: number }) {
    const sx = this.x + this.face * 8, sy = this.y - 26, g = 260;
    const dx = t.x - sx, T = clamp(Math.abs(dx) / 240, 0.6, 1.3);
    const vx = dx / T, vy = (t.y - 8 - sy) / T - 0.5 * g * T;
    G.world.add(new Proj('flame', sx, sy, 'enemy', this.dmg * 1.05, { vx, vy, life: 3, w: 14, h: 14, color: '#ff7a2a', big: true }));
    sfx('flame', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.9 });
    fx.embers(sx, sy, 5, '#ffb35c', 6);
  }

  /** What it carries spills where it falls. */
  die(h?: HitInfo) {
    if (this.dying) return;
    super.die(h);
    G.world.add(new Proj('puddle', this.x, this.y, 'enemy', this.dmg * 0.3, { life: 2.6, w: 36, h: 9, color: '#ff7a2a' }));
    fx.embers(this.x, this.y - 10, 12, '#ffb35c', 10);
    sfx('fireBurst', { pan: G.world.pan(this.x), vol: 0.5 });
  }
}
