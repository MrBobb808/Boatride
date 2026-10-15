// The swarm of the Valley of Bones: locust drones that swoop in packs, and
// locust soldiers, ant-like warriors with scythe claws. The shared drawing
// here (wings, antennae, mandibles) also dresses the Locust King and his
// Echo.

import { type HitInfo } from './entity';
import { Enemy, SENT_CLIPS, SENT_BASE } from './enemies';
import { Animator, BASE_POSE, type Joints, type Pose, type RigDims } from '../render/skeleton';
import { type HumanStyle } from '../render/actors';
import { glow, rgba, poly, ellipse, limbShaded, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign } from '../core/math';

export type LocustPal = 'foe' | 'king' | 'echo';

const PALS = {
  foe: { chitin: '#1c1e12', dark: '#0e0f08', hi: '#7a8a2a', eye: '#ff2a1a', wing: '#d8e0a8', vein: '#6a7030', outline: '#060704' },
  king: { chitin: '#15111c', dark: '#0a080e', hi: '#7a3ab0', eye: '#ff2a3a', wing: '#c8b8e8', vein: '#7a5aa0', outline: '#050308' },
  echo: { chitin: '#16141a', dark: '#0c0b0e', hi: '#e2b85a', eye: '#ffffff', wing: '#fff0c8', vein: '#c9a04a', outline: '#0a0806' },
};

export const LOCUST_DIMS: RigDims = { torso: 15, head: 4.4, neck: 2, upperArm: 9, foreArm: 9.6, thigh: 10, shin: 10.6, shoulderSpread: 1.7, hipSpread: 1.5 };

export function locustStyle(pal: LocustPal, stage = 0): HumanStyle {
  const P = PALS[pal];
  return {
    skin: P.chitin, hair: null, hairKind: 'none', coat: P.chitin, coatDark: P.dark, skirt: 6, trim: pal === 'foe' ? null : P.hi,
    pants: P.dark, boots: P.chitin, glove: P.chitin, belt: null,
    plate: { c: P.chitin, dark: P.dark, hi: P.hi, tier: 2 }, helm: 'none', helmColor: P.chitin, helmTrim: P.hi,
    eye: P.eye, eyeGlow: 1, outline: P.outline, weapon: 'claws', offhand: 'none',
    crack: pal === 'king' ? '#ff3a4a' : null, runes: pal === 'echo' && stage >= 1 ? '#ffe6a8' : null,
    bulk: pal === 'foe' ? 0.92 : 1.05, crest: pal === 'echo' && stage >= 2 ? '#fff3c4' : null,
  };
}

/**
 * Wings, drawn behind the body in rig space (x forward, feet at 0).
 * `spread` 0 = folded along the back, 1 = fully open; `beat` animates.
 */
export function drawLocustWings(ctx: Ctx, j: Joints, pal: LocustPal, spread: number, beat: number) {
  const P = PALS[pal];
  const rx = (j.shBX + j.neckX) / 2 - 1, ry = (j.shBY + j.neckY) / 2 + 2;
  const flap = Math.sin(beat) * (0.25 + spread * 0.55);
  for (const [i, len, off] of [[0, 30, 0], [1, 24, 0.35]] as const) {
    const a = -2.3 + spread * 1.05 + off - flap * (i ? 0.7 : 1);
    const dx = Math.cos(a), dy = Math.sin(a);
    const L = len * (0.75 + spread * 0.35);
    const tx = rx + dx * L, ty = ry + dy * L;
    const nx = -dy, ny = dx;
    const w = 6 + spread * 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.quadraticCurveTo(rx + dx * L * 0.5 + nx * w, ry + dy * L * 0.5 + ny * w, tx, ty);
    ctx.quadraticCurveTo(rx + dx * L * 0.55 - nx * w * 0.5, ry + dy * L * 0.55 - ny * w * 0.5, rx, ry);
    ctx.closePath();
    ctx.fillStyle = rgba(P.wing, 0.18 + (i ? 0 : 0.06));
    ctx.fill();
    ctx.strokeStyle = rgba(P.vein, 0.75);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // Veins.
    ctx.beginPath();
    for (let v = 1; v <= 3; v++) {
      const u = v / 4;
      ctx.moveTo(rx + dx * L * u * 0.4, ry + dy * L * u * 0.4);
      ctx.lineTo(rx + dx * L * (0.4 + u * 0.55) + nx * w * (0.6 - u * 0.4), ry + dy * L * (0.4 + u * 0.55) + ny * w * (0.6 - u * 0.4));
    }
    ctx.stroke();
  }
}

/** Antennae, mandibles and compound-eye glow, over the head. */
export function drawLocustHead(ctx: Ctx, j: Joints, pal: LocustPal, t: number, bite: number) {
  const P = PALS[pal];
  const hx = j.headX, hy = j.headY, ha = j.headA;
  const ca = Math.cos(ha), sa = Math.sin(ha);
  const at = (fx2: number, fy: number) => [hx + fx2 * ca - fy * sa, hy + fx2 * sa + fy * ca] as const;
  // Antennae sweep back from the brow.
  ctx.strokeStyle = P.chitin;
  ctx.lineWidth = 0.7;
  for (const s of [0, 1]) {
    const [bx, by] = at(1.5 + s, -4.2);
    const sw = Math.sin(t * 3 + s * 2) * 1.5;
    const [mx, my] = at(-3 + s * 2, -10 + sw);
    const [ex, ey] = at(-10 + s * 3, -12 + sw * 1.5);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
  // Mandibles at the mouth.
  const open = 0.25 + bite * 0.6;
  for (const s of [-1, 1]) {
    const [bx, by] = at(3.6, 1.6);
    const [tx, ty] = at(6.2, 1.6 + s * (1.4 + open * 1.6));
    const [kx, ky] = at(5.4, 1.6 + s * 0.4);
    poly(ctx, [bx, by, tx, ty, kx, ky], P.dark, P.outline, 0.35);
  }
  // A carapace crest sweeping back over the skull; three horns on the King.
  {
    const horns = pal === 'foe' ? 1 : 3;
    for (let i = 0; i < horns; i++) {
      const [ax, ay] = at(1 - i * 1.6, -4.4 + i * 0.6);
      const [bx, by] = at(-6 - i * 2.2, -7.5 - i * 0.4 + (pal === 'foe' ? 2 : 0));
      const [cx, cy] = at(-2 - i * 1.6, -3.4 + i * 0.6);
      poly(ctx, [ax, ay, bx, by, cx, cy], i === 0 ? P.chitin : P.dark, P.outline, 0.35);
    }
    // The faceplate: a long chitin snout.
    const [s1x, s1y] = at(-1, -3.8);
    const [s2x, s2y] = at(4.8, -1.4);
    const [s3x, s3y] = at(4.6, 1.2);
    const [s4x, s4y] = at(-1, 2.6);
    poly(ctx, [s1x, s1y, s2x, s2y, s3x, s3y, s4x, s4y], P.chitin, P.outline, 0.4);
    ctx.strokeStyle = rgba(P.hi, 0.7);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(s1x, s1y);
    ctx.lineTo(s2x, s2y);
    ctx.stroke();
  }
  // Compound eye glow.
  const [ex, ey] = at(2.2, -1.2);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, ex, ey, 4.5, P.eye, 0.85);
  ctx.globalCompositeOperation = 'source-over';
}

/** Scythe blades along both forearms (the King and his Echo). */
export function drawLocustScythes(ctx: Ctx, j: Joints, pal: LocustPal, len = 13) {
  const P = PALS[pal];
  for (const [ex, ey, hx, hy] of [[j.elBX, j.elBY, j.haBX, j.haBY], [j.elFX, j.elFY, j.haFX, j.haFY]]) {
    const dx = hx - ex, dy = hy - ey;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const nx = -uy, ny = ux;
    // The blade leaves the wrist and curves back along the arm.
    const tx = hx + ux * len * 0.55 + nx * len * 0.5, ty = hy + uy * len * 0.55 + ny * len * 0.5;
    poly(ctx, [hx, hy, tx, ty, hx + ux * 2 + nx * 2.2, hy + uy * 2 + ny * 2.2, ex + ux * d * 0.4 + nx * 1.6, ey + uy * d * 0.4 + ny * 1.6], P.dark, P.outline, 0.4);
    ctx.strokeStyle = rgba(pal === 'king' ? '#d0a8ff' : pal === 'echo' ? '#ffe6a8' : '#c8d890', 0.6);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(hx + nx * 0.6, hy + ny * 0.6);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
}

// =====================================================================
// Locust Drone: a swooping flyer, weak alone, deadly in a swarm.
// =====================================================================

export class Drone extends Enemy {
  beat = rand(0, 6);
  hoverT = rand(0, 6);
  swoopX = 0;
  swoopY = 0;
  constructor(x: number, y: number, elite: string | null) {
    super('drone', x, y, 16, 12, elite);
    this.grav = 0;
    this.collide = false;
    this.attackCd = rand(0.8, 2.2);
  }
  groan() {
    sfx('buzz', { pan: G.world.pan(this.x), vol: 0.35, pitch: rand(0.9, 1.2) });
  }
  physics(dt: number) {
    const b = this.body;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.onGround = false;
    if (this.dying && !this.awaitingPurify) b.vy += 420 * dt;
    const maxX = G.world.grid.w * 16 - 4;
    b.x = clamp(b.x, 4, maxX);
  }
  flinch(h: HitInfo) {
    this.hurtT = 0.18;
    this.body.vx = h.kx * 0.7;
    this.body.vy = h.ky * 0.3;
    this.state = 'drift';
  }
  stagger() {
    super.stagger();
    this.body.vy = 40;
  }
  think(dt: number) {
    const b = this.body;
    this.hoverT += dt;
    if (!this.aggro) {
      const t = this.pickTarget(240);
      if (t) this.aggro = true;
      b.vx = approach(b.vx, Math.sin(this.hoverT * 0.9 + this.id) * 16, 80 * dt);
      b.vy = approach(b.vy, Math.sin(this.hoverT * 2.1 + this.id) * 14, 80 * dt);
      return;
    }
    this.target = this.pickTarget(520);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    switch (this.state) {
      case 'windup': {
        // Rear back, buzzing: the tell.
        this.faceTarget();
        b.vx = approach(b.vx, -this.face * 40, 400 * dt);
        b.vy = approach(b.vy, -30, 300 * dt);
        if (this.st > 0.45) {
          this.setState('swoop');
          this.hitSet.clear();
          const dx = t.x - this.x, dy = t.y - 14 - this.y;
          const d = Math.hypot(dx, dy) || 1;
          b.vx = (dx / d) * 380;
          b.vy = (dy / d) * 380;
          sfx('wingbeat', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.3 });
        }
        break;
      }
      case 'swoop': {
        this.strike(-8, -10, 18, 14, 1, { kx: sign(b.vx) * 140, ky: -100, poise: 12 });
        if (this.st > 0.5 || G.world.solidAt(this.x, this.y + 4)) {
          this.setState('rise');
          this.attackCd = rand(1.4, 2.6);
        }
        break;
      }
      case 'rise': {
        b.vx = approach(b.vx, 0, 500 * dt);
        b.vy = approach(b.vy, -120, 600 * dt);
        if (this.st > 0.5) this.setState('hover');
        break;
      }
      default: {
        // Hover above and beside the target, weaving.
        const side = this.id % 2 ? 1 : -1;
        const hx = t.x + side * 70 + Math.sin(this.hoverT * 1.3) * 30;
        const hy = t.y - 70 + Math.sin(this.hoverT * 2.4) * 12;
        b.vx = approach(b.vx, clamp((hx - this.x) * 2.5, -150, 150), 400 * dt);
        b.vy = approach(b.vy, clamp((hy - this.y) * 2.5, -150, 150), 400 * dt);
        this.faceTarget();
        this.state = 'hover';
        if (this.attackCd <= 0 && Math.abs(t.x - this.x) < 180) {
          this.setState('windup');
          sfx('buzz', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.4 });
        }
      }
    }
  }
  update(dt: number) {
    super.update(dt);
    this.beat += dt * (this.dying ? 4 : 46);
  }
  draw(ctx: Ctx) {
    const f = this.face;
    const P = PALS.foe;
    const dyingA = this.dying ? clamp(1 - (this.deathT - 0.4) / 0.6, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = dyingA;
    ctx.translate(this.x, this.y - 6);
    ctx.scale(f, 1);
    const tilt = this.state === 'swoop' ? 0.5 : this.state === 'windup' ? -0.35 : 0;
    ctx.rotate(tilt);
    // Back wings.
    const flap = Math.sin(this.beat);
    const wing = (len: number, a: number, alpha: number) => {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(-len * 0.45, 0, len * 0.55, 2.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(P.wing, alpha);
      ctx.fill();
      ctx.strokeStyle = rgba(P.vein, 0.6);
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.restore();
    };
    wing(13, -0.5 - flap * 0.6, 0.22);
    // Abdomen, thorax, head.
    ellipse(ctx, -6, 0.5, 6, 3, 0.15, P.dark);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(P.hi, 0.5);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-9 + i * 2.6, -2);
      ctx.lineTo(-8.5 + i * 2.6, 3);
      ctx.stroke();
    }
    ellipse(ctx, 0.5, -0.5, 4, 3.2, 0, P.chitin);
    ellipse(ctx, 5, -1.2, 2.8, 2.4, 0, P.chitin);
    // Legs dangling.
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-1 + i * 2, 2);
      ctx.lineTo(-2 + i * 2.5, 6);
      ctx.lineTo(-3 + i * 2.6, 8.5);
      ctx.stroke();
    }
    // Mandibles and eye.
    poly(ctx, [7, 0, 9.5, 1.6, 7.4, 1.6], P.dark);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 6, -1.8, 4, P.eye, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    wing(15, -0.2 + flap * 0.6, 0.3);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.state === 'windup') this.glint(ctx, this.x + f * 6, this.y - 8, '#ff5a2a');
    this.drawFlash(ctx);
  }
}

// =====================================================================
// Locust Soldier: an ant-like warrior with scythe claws.
// =====================================================================

const SOLDIER_BASE: Pose = { ...SENT_BASE, lean: 0.24, bUA: 0.9, bFA: 1.1, fUA: 0.7, fFA: 1.25, wpn: 0.4, bTh: -0.36, bSh: -0.3, fTh: 0.46, fSh: -0.5 };

export class Soldier extends Enemy {
  combo = 0;
  beat = 0;
  constructor(x: number, y: number, elite: string | null) {
    super('soldier', x, y, 16, 40, elite);
    this.dims = LOCUST_DIMS;
    this.style = locustStyle('foe');
    this.anim = new Animator(SENT_CLIPS, SOLDIER_BASE);
    this.anim.play('idle', 0);
    if (elite) this.name = 'Locust Captain';
  }
  groan() {
    sfx('chitter', { pan: G.world.pan(this.x), vol: 0.5 });
  }
  think(dt: number) {
    const b = this.body;
    if (!this.aggro) {
      const t = this.pickTarget(230);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(520);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    switch (this.state) {
      case 'claw': {
        const T = 0.46, u = this.st / T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.5 && u < 0.66) {
          if (this.st - dt < 0.5 * T) {
            b.vx = this.face * 160;
            sfx('swing', { pan: G.world.pan(this.x), pitch: 1.3 });
            fx.slash(this.x + this.face * 6, this.y - 26, 20, -2.2, 0.7, 6, this.face, '#f0ffd0', '#9aff3a', 0.12);
          }
          this.strike(-4, -42, 34, 42, 1, { poise: 22 });
        }
        if (u >= 1) {
          if (this.combo < (this.elite ? 3 : 1) && dist < 54) {
            this.combo++;
            this.hitSet.clear();
            this.setState('claw', 'slash', 0.04, 1 / 0.42);
          } else {
            this.combo = 0;
            this.attackCd = rand(0.5, 1.0);
            this.setState('move', 'walk', 0.2);
          }
        }
        break;
      }
      case 'leap': {
        // A high pounce that lands claws-first.
        if (this.st < 0.32) {
          b.vx = approach(b.vx, 0, 900 * dt);
        } else if (!this.airborne && this.st < 0.4) {
          b.vy = -380;
          b.vx = this.face * clamp(dist * 1.6, 120, 300);
          this.airborne = true;
          this.hitSet.clear();
          sfx('wingbeat', { pan: G.world.pan(this.x), pitch: 0.9 });
        } else if (this.airborne) {
          this.strike(-6, -40, 34, 42, 1.2, { poise: 30, kx: this.face * 200 });
        }
        if (this.st > 0.4 && b.onGround) {
          fx.dust(this.x, this.y, 6, 1);
          this.attackCd = rand(0.9, 1.5);
          this.setState('move', 'walk', 0.2);
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround && Math.abs(t.y - this.y) < 50) {
          if (dist < 48) {
            this.hitSet.clear();
            this.setState('claw', 'slash', 0.06, 1 / 0.46);
            break;
          }
          if (dist > 90 && dist < 210 && Math.random() < dt * 1.4) {
            this.setState('leap', 'bash', 0.06, 1 / 0.6);
            sfx('chitter', { pan: G.world.pan(this.x), pitch: 1.3 });
            break;
          }
        }
        const moving = this.walkToward(t.x, this.elite ? 92 : 80, dt, 36);
        const want = moving && Math.abs(b.vx) > 5 ? 'walk' : 'guard';
        if (this.anim!.name !== want) this.anim!.play(want, 0.2);
        this.state = 'move';
      }
    }
  }
  update(dt: number) {
    super.update(dt);
    this.beat += dt * (this.airborne ? 40 : 3);
  }
  draw(ctx: Ctx) {
    const f = this.face;
    // Wings behind, body, then head parts.
    if (!this.dying || this.awaitingPurify) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(f, 1);
      drawLocustWings(ctx, this.j, 'foe', this.airborne ? 0.8 : 0.05, this.beat);
      ctx.restore();
    }
    this.drawHumanoidBody(ctx);
    if (!this.dying) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(f, 1);
      drawLocustHead(ctx, this.j, 'foe', G.time + this.id, this.state === 'claw' ? 1 : 0);
      ctx.restore();
    }
    if ((this.state === 'claw' && this.st < 0.5 * 0.46) || (this.state === 'leap' && this.st < 0.32)) this.glint(ctx, this.x + this.face * 6, this.y - 36, '#9aff3a');
  }
}

export { BASE_POSE, limbShaded, PK };
