// The signature foes of the Fallen Crowns (Chapters VII–IX). Original fiction.
//
// - ANTLERED STALKER (VII): a lean hunter with an antler crown. It keeps its
//   distance, crouches while an amber mark burns where it means to land, then
//   pounces and rakes twice. A parried rake throws it open. After every attack
//   it springs back and circles again.
// - SWARM CARRIER (VIII): a host swollen with the living swarm. Its sac swells
//   and a cloud of flies drifts after its prey (damage while inside; strike the
//   cloud to scatter it). It bursts when it dies: a green ring marks the spores
//   a moment before they bloom.
// - SLAG GOLEM (IX): a basalt construct round a molten core. Blows to its
//   plated front are blunted. It raises both fists, slams, and sends a low fire
//   wave along the floor (jump or dodge it) and leaves the ground burning. After
//   a slam its chest opens and the core takes heavy damage.

import { Entity, type HitInfo } from './entity';
import { Animator, Chain, drawRibbon, BASE_POSE, type Clip, type Pose, type RigDims } from '../render/skeleton';
import { drawHumanoid, flashStyle, fineDetail, type HumanStyle } from '../render/actors';
import { glow, rgba, ellipse, circle, limbShaded, vGrad, rGrad, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign, easeOutCubic, easeInQuad, easeInOutSine, easeOutBack } from '../core/math';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { groundAhead, hazardAhead } from './physics';
import { Proj } from './projectiles';
import { TILE, T } from './tiles';
import { Enemy } from './enemies';
import { floorBelow } from './princes';

/** Varkhos' amber, Morvane's bile, Azkar's slag: each foe wears its crown's colour. */
export const HUNT = { amber: '#ffbd79', hot: '#fff0d0', eye: '#ffb347' };
export const BILE = { c: '#baed8c', hot: '#eaffc8', deep: '#5f8a34' };
export const SLAG = { c: '#ff8a3a', hot: '#ffe0a0', core: '#fff1c4' };

const k = (t: number, p: Partial<Pose>, ease?: (x: number) => number) => ({ t, p, ease });

/** A floor ring that closes to the moment of impact (the bosses' landing marks, foe-sized). */
function floorMark(ctx: Ctx, x: number, y: number, r: number, u: number, c: string) {
  const a = 0.55 + Math.sin(G.time * 18) * 0.3;
  ctx.globalCompositeOperation = 'lighter';
  ellipse(ctx, x, y - 1, r, 3, 0, rgba(c, a * 0.45));
  glow(ctx, x, y - 2, r * 1.1, c, a * 0.4);
  ctx.strokeStyle = rgba(c, a);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, y - 1, Math.max(1, r * (1 - clamp(u, 0, 1))), 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(c, 0.9);
  ctx.beginPath();
  ctx.ellipse(x, y - 1, r, 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/** Is there floor (solid or a ledge) at x just under y? */
function floorAt(x: number, y: number) {
  const W = G.world;
  const t = W.grid.get(Math.floor(x / TILE), Math.floor((y + 2) / TILE));
  return W.solid(t) || t === T.OneWay;
}

// =====================================================================
// ANTLERED STALKER
// =====================================================================

const STALK_DIMS: RigDims = { torso: 12, head: 4.2, neck: 1.6, upperArm: 8, foreArm: 8.4, thigh: 9, shin: 9.6, shoulderSpread: 1.4, hipSpread: 1.4 };
// Hunched and forward, weight on the balls of its feet.
const SB: Pose = { ...BASE_POSE, lean: 0.46, head: -0.34, bUA: 0.55, bFA: 0.55, fUA: 0.85, fFA: 0.7, wpn: 0.2, bTh: 0.0, bSh: -0.85, fTh: 0.6, fSh: -1.0 };
const S_CROUCH: Partial<Pose> = { lean: 0.95, head: -0.95, fTh: 1.25, fSh: -2.1, bTh: -0.35, bSh: -1.5, bUA: -0.9, bFA: 0.5, fUA: 0.15, fFA: 0.35, sq: 0.9 };
const S_DOWN: Partial<Pose> = { lean: 0.6, head: 0.5, fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, bUA: 0.3, fUA: 0.2 };
const STALK_CLIPS: Record<string, Clip> = {
  idle: { dur: 1.8, loop: true, base: SB, fn: (u) => ({ lean: SB.lean + Math.sin(u * Math.PI * 2) * 0.04, head: SB.head + Math.sin(u * Math.PI * 4) * 0.06, y: Math.sin(u * Math.PI * 2) * 0.5 }) },
  walk: {
    dur: 0.62, loop: true, base: SB, steps: [0.25, 0.75],
    fn: (u) => {
      const p = u * Math.PI * 2, s = Math.sin(p);
      return {
        lean: SB.lean + 0.08 + Math.sin(p * 2) * 0.04, head: SB.head + Math.sin(p * 2) * 0.05,
        fTh: 0.35 + 0.55 * s, fSh: -0.7 - 0.9 * Math.max(0, Math.cos(p - 0.5)), bTh: -0.1 - 0.55 * s, bSh: -0.7 - 0.9 * Math.max(0, Math.cos(p + Math.PI - 0.5)),
        fUA: SB.fUA - 0.35 * s, bUA: SB.bUA + 0.35 * s,
      };
    },
  },
  back: {
    dur: 0.4, loop: true, base: SB,
    fn: (u) => ({ lean: 0.15, head: -0.2, fTh: 0.9, fSh: -1.4, bTh: 0.2 + Math.sin(u * Math.PI * 2) * 0.3, bSh: -1.2, fUA: -0.4, bUA: -0.5 }),
  },
  crouch: { dur: 1, base: SB, keys: [k(0, {}), k(1, S_CROUCH, easeOutCubic)] },
  leap: { dur: 0.3, base: SB, keys: [k(0, S_CROUCH), k(1, { lean: 0.7, head: -0.5, fUA: 1.9, fFA: 0.15, bUA: 1.6, bFA: 0.2, fTh: 0.2, fSh: -0.6, bTh: -0.9, bSh: -1.0 }, easeOutBack)] },
  land: { dur: 0.3, base: SB, keys: [k(0, { lean: 0.85, fTh: 1.3, fSh: -2.1, bTh: 0.3, bSh: -1.8, fUA: 1.2, bUA: 0.9, sq: 0.9 }), k(1, {}, easeInOutSine)] },
  rake: { dur: 1, base: SB, keys: [
    k(0, {}),
    k(0.36, { lean: 0.32, head: -0.7, fUA: 2.9, fFA: 0.8, bUA: -0.6, bFA: 0.6, fTh: 0.5, fSh: -0.9, bTh: -0.4 }, easeOutCubic),
    k(0.5, { lean: 0.85, head: -0.2, fUA: 0.45, fFA: 0.05, bUA: 1.6, bFA: 0.9, fTh: 0.95, fSh: -0.9, bTh: -0.6, bSh: -0.4 }, easeInQuad),
    k(0.58, { lean: 0.55, fUA: 0.7, bUA: 2.9, bFA: 0.6 }),
    k(0.72, { lean: 0.95, fUA: 0.9, bUA: 0.35, bFA: 0.1, fTh: 1.0, fSh: -0.9, bTh: -0.7 }, easeInQuad),
    k(1, {}, easeInOutSine),
  ] },
  hurt: { dur: 0.25, base: SB, keys: [k(0, { lean: 0.05, head: 0.4, fUA: 1.4, bUA: 1.0 }), k(1, {}, easeOutCubic)] },
  stagger: { dur: 0.5, base: SB, keys: [k(0, { lean: 0.1, head: 0.5 }), k(1, S_DOWN, easeOutCubic)] },
  death: { dur: 0.9, base: SB, keys: [k(0, { lean: 0.1, head: 0.5 }), k(1, { ...S_DOWN, lean: 1.35, head: 0.8, y: 4 }, easeInQuad)] },
  kneel: { dur: 0.6, base: SB, keys: [k(0, {}), k(1, S_DOWN, easeOutCubic)] },
};

function stalkerStyle(elite: boolean): HumanStyle {
  return {
    skin: '#7a6250', hair: elite ? '#3a2418' : '#4a3424', hairKind: 'long', coat: elite ? '#8a5a38' : '#7a5c3e', coatDark: '#4a3422', skirt: 6, trim: elite ? '#e0b860' : '#c8b896',
    pants: '#5a4634', boots: '#2e241a', glove: '#5e4a3a', belt: '#2a1c12', plate: null, helm: 'none',
    eye: HUNT.eye, eyeGlow: 1, outline: '#0a0705', weapon: 'claws', weaponColor: '#d8ccb0', weaponGlow: null, offhand: 'none', crack: elite ? HUNT.amber : null, bulk: 0.95,
  };
}

/** The bone mask and antler crown, in the head's own frame (forward +x, up -y). */
function drawCrown(ctx: Ctx, elite: boolean, flash: boolean) {
  const bone = flash ? '#fff8ec' : '#d9ccb0', boneDark = flash ? '#fff8ec' : '#9a8a6c', o = flash ? '#fff8ec' : '#0a0705';
  // Muzzle of the mask.
  ctx.beginPath();
  ctx.moveTo(-1, -3.6); ctx.lineTo(4.5, -2.6); ctx.lineTo(7.2, -0.6); ctx.lineTo(7, 1.2); ctx.lineTo(4, 2.6); ctx.lineTo(0, 2.4);
  ctx.closePath();
  ctx.fillStyle = flash ? bone : rGrad(ctx, bone, 3, -2, 7, 0.1, -0.3);
  ctx.fill();
  ctx.strokeStyle = o;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  if (!flash) {
    ctx.fillStyle = '#120a06';
    ctx.fillRect(2.2, -1.9, 2.2, 1.3);
    ctx.fillStyle = HUNT.eye;
    ctx.fillRect(3.2, -1.7, 1, 0.9);
    if (fineDetail()) {
      ctx.strokeStyle = boneDark;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(4.8, 0.6); ctx.lineTo(6.6, 0.8);
      ctx.stroke();
    }
  }
  // Two antlers: the far one first, a shade darker, splayed back from the near one.
  const s = elite ? 1.25 : 1;
  for (let side = 0; side < 2; side++) {
    const c = side ? bone : boneDark;
    ctx.save();
    ctx.translate(side ? 0.8 : -1.6, -3.5);
    ctx.rotate(side ? 0.12 : -0.45);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-3 * s, -4.5 * s, -4.2 * s, -9.5 * s);
      ctx.quadraticCurveTo(-4.8 * s, -13.5 * s, -2.4 * s, -16.5 * s);
      ctx.moveTo(-2.4 * s, -5 * s); ctx.lineTo(1.8 * s, -8 * s);
      ctx.moveTo(-4.2 * s, -10 * s); ctx.lineTo(-8.4 * s, -12.5 * s);
      ctx.moveTo(-4.4 * s, -11 * s); ctx.lineTo(-0.6 * s, -14.1 * s);
      ctx.lineCap = 'round';
      ctx.strokeStyle = pass ? c : o;
      ctx.lineWidth = pass ? 1.4 : 2.6;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (elite && !flash) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0.8 - 2.4 * s, -3.5 - 16.5 * s, 3, HUNT.amber, 0.8);
    glow(ctx, 0.8 - 8.4 * s, -3.5 - 12.5 * s, 3, HUNT.amber, 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }
}

const CROUCH_T = 0.62;
const RAKE_T = 0.95;

export class Stalker extends Enemy {
  pixelShade = true;
  pixelBox = [-34, -66, 34, 8] as const;
  markX = 0;
  markY = 0;
  /** Seconds left on the landing mark after it lands (it fades). */
  markFade = 0;
  circleT = rand(0, 6);
  mantle: Chain;

  constructor(x: number, y: number, elite: string | null) {
    super('stalker', x, y, 14, 34, elite);
    this.dims = STALK_DIMS;
    this.style = stalkerStyle(!!elite);
    this.anim = new Animator(STALK_CLIPS, SB);
    this.anim.play('idle', 0);
    this.anim.time = rand(0, 1.5);
    this.attackCd = rand(0.8, 1.6);
    this.mantle = new Chain(5, 4, x, y - 28);
    if (elite) this.scale = 1.12;
  }

  groan() {
    sfx('houndGrowl', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.72 });
  }

  /** A parried rake throws it wide open. */
  parried(_by: Entity) {
    this.poise = 0;
    this.stagger();
    this.body.vx = -this.face * 120;
  }

  private startRetreat() {
    const b = this.body;
    const back = -this.face;
    this.attackCd = rand(1.1, 1.7) / (this.elite ? 1.2 : 1);
    // Springs back unless a drop or stakes lie behind it.
    if (b.onGround && groundAhead(b, back, G.world.grid, G.world.solid, 18) && !hazardAhead(b, back, G.world.grid, 18)) {
      b.vx = back * 190;
      b.vy = -170;
      this.airborne = true;
      this.setState('retreat', 'back', 0.06);
    } else this.setState('stalk', 'walk', 0.15);
  }

  think(dt: number) {
    const b = this.body;
    this.markFade = Math.max(0, this.markFade - dt);
    if (!this.aggro) {
      const t = this.pickTarget(230);
      if (t && this.canSee(t)) {
        this.aggro = true;
        sfx('howl', { pan: G.world.pan(this.x), vol: 0.35, pitch: 1.5 });
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
    const s = this.scale;
    switch (this.state) {
      case 'crouch': {
        // The tell: it sinks low, eyes flare, and an amber mark burns where it will land.
        b.vx = approach(b.vx, 0, 1100 * dt);
        this.faceTarget();
        const tel = this.elite ? CROUCH_T * 0.85 : CROUCH_T;
        if (this.st < tel * 0.7) {
          this.markX = approach(this.markX, t.x, 240 * dt);
          this.markY = floorBelow(this.markX, t.y - 30);
        }
        if (this.st >= tel) {
          const vy = -300, T0 = (2 * -vy) / 1500;
          b.vy = vy;
          b.vx = clamp((this.markX - this.x) / T0, -330, 330);
          this.face = sign(b.vx) || this.face;
          this.airborne = true;
          this.hitSet.clear();
          this.setState('pounce', 'leap', 0.05);
          sfx('pounce', { pan: G.world.pan(this.x), pitch: 1.15 });
          sfx('whoosh', { pan: G.world.pan(this.x), vol: 0.4, pitch: 1.1 });
        }
        break;
      }
      case 'pounce': {
        this.strike(-4, -30 * s, 30 * s, 30 * s, 1.1, { poise: 34, kx: this.face * 220, ky: -200, parryable: false });
        if ((b.onGround && this.st > 0.1) || this.st > 1.2) {
          this.markFade = 0.25;
          fx.dust(this.x, this.y, 8, 1.1);
          fx.ring(this.x, this.y - 1, 4, 30, HUNT.amber, 0.3, 2, 0.25);
          sfx('land', { pan: G.world.pan(this.x), pitch: 0.75 });
          G.camera.addTrauma(0.06 * shakeScale());
          this.setState('land', 'land', 0.04);
        }
        break;
      }
      case 'land': {
        b.vx = approach(b.vx, 0, 1000 * dt);
        if (this.st >= 0.28) {
          // Close enough to keep the kill going: rake. Otherwise fall back and circle.
          if (dist < 46 && Math.abs(t.y - this.y) < 36) this.startRake();
          else this.startRetreat();
        }
        break;
      }
      case 'rake': {
        const T0 = RAKE_T / (this.elite ? 1.12 : 1), u = this.st / T0;
        b.vx = approach(b.vx, 0, 900 * dt);
        this.rakeSwing(0.4 * T0, dt);
        this.rakeSwing(0.6 * T0, dt);
        if ((u > 0.4 && u < 0.52) || (u > 0.6 && u < 0.72)) this.strike(-2, -32 * s, 30 * s, 30 * s, 0.75, { poise: 16 });
        if (u >= 1) this.startRetreat();
        break;
      }
      case 'retreat': {
        this.faceTarget();
        if (this.st > 0.12 && b.onGround) {
          b.vx = approach(b.vx, 0, 1400 * dt);
          if (this.st > 0.3) this.setState('stalk', 'walk', 0.15);
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround && Math.abs(t.y - this.y) < 40) {
          if (dist < 40) {
            this.startRake();
            break;
          }
          if (dist > 66 && dist < 190 && this.canSee(t)) {
            this.markX = t.x;
            this.markY = floorBelow(t.x, t.y - 30);
            this.setState('crouch', 'crouch', 0.08, 1 / (this.elite ? CROUCH_T * 0.85 : CROUCH_T));
            sfx('houndGrowl', { pan: G.world.pan(this.x), pitch: 0.55 });
            break;
          }
        }
        // It circles at the edge of reach while it gathers itself: closing, then drifting back.
        this.circleT += dt;
        const keep = this.attackCd > 0 ? 118 + Math.sin(this.circleT * 1.6 + this.id) * 30 : 90;
        let moving = false;
        if (dist < keep - 18) {
          moving = this.walkToward(this.x - sign(dx) * 40, 95, dt);
          this.face = sign(dx) || this.face;
        } else if (dist > keep + 18) moving = this.walkToward(t.x, dist > 220 ? 150 : 90, dt, keep);
        else b.vx = approach(b.vx, 0, 500 * dt);
        const want = moving && Math.abs(b.vx) > 8 ? 'walk' : 'idle';
        if (this.anim!.name !== want) this.anim!.play(want, 0.15);
        this.state = 'stalk';
      }
    }
  }

  /** Each of the two blows: a lunge, a whoosh and a fresh hit window. */
  private rakeSwing(at: number, dt: number) {
    if (this.st - dt >= at || this.st < at) return;
    const s = this.scale, first = at < 0.5 * RAKE_T;
    this.hitSet.clear();
    this.body.vx = this.face * 120;
    sfx('swing', { pan: G.world.pan(this.x), pitch: first ? 1.15 : 1.35 });
    fx.slash(this.x + this.face * 12 * s, this.y - 20 * s, 15 * s, first ? -2.0 : -1.2, first ? 0.9 : 1.6, 5, this.face, '#fff1d8', HUNT.amber, 0.14);
  }

  private startRake() {
    this.faceTarget();
    this.hitSet.clear();
    this.setState('rake', 'rake', 0.06, 1 / (RAKE_T / (this.elite ? 1.12 : 1)));
    sfx('houndBark', { pan: G.world.pan(this.x), vol: 0.5, pitch: 0.8 });
  }

  update(dt: number) {
    super.update(dt);
    const f = this.face, s = this.scale;
    this.mantle.update(this.x + f * (this.j.shBX - 1) * s, this.y + this.j.shBY * s, dt, -this.body.vx * 2 - f * 40, 360, 0.86);
  }

  draw(ctx: Ctx) {
    if (!this.style || !this.dims) return;
    const fade = this.dying && !this.awaitingPurify ? clamp(1 - (this.deathT - 0.4) / 0.6, 0, 1) : 1;
    if (fade <= 0.01) return;
    ctx.globalAlpha = fade;
    // A hide mantle trailing from the shoulders.
    drawRibbon(ctx, this.mantle, 6 * this.scale, 9 * this.scale, this.elite ? '#6a3e26' : '#5e4630', '#0a0705');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * this.scale, this.scale);
    const vx = this.body.vx * this.face, vy = this.body.vy, time = G.time + this.id;
    drawHumanoid(ctx, this.j, this.style, time, this.pose.rot, vx, vy);
    ctx.save();
    ctx.translate(this.j.headX, this.j.headY);
    ctx.rotate(this.j.headA);
    drawCrown(ctx, !!this.elite, false);
    ctx.restore();
    if (this.flash > 0) {
      ctx.globalAlpha = fade * Math.min(0.9, this.flash * 9);
      drawHumanoid(ctx, this.j, flashStyle(this.style), time, this.pose.rot, vx, vy);
      ctx.translate(this.j.headX, this.j.headY);
      ctx.rotate(this.j.headA);
      drawCrown(ctx, !!this.elite, true);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx: Ctx) {
    if (!this.dying) {
      const s = this.scale;
      if (this.state === 'crouch') {
        floorMark(ctx, this.markX, this.markY, 20, this.st / (this.elite ? CROUCH_T * 0.85 : CROUCH_T), HUNT.amber);
        if (this.st > 0.15) this.glint(ctx, this.x + this.face * 9 * s, this.y - 26 * s, HUNT.eye);
      } else if (this.state === 'pounce') floorMark(ctx, this.markX, this.markY, 20, 1, HUNT.amber);
      else if (this.markFade > 0) {
        ctx.globalAlpha = this.markFade * 4;
        floorMark(ctx, this.markX, this.markY, 20, 1, HUNT.amber);
        ctx.globalAlpha = 1;
      }
      if (this.state === 'rake' && this.st < 0.38 * RAKE_T && this.st > 0.08) this.glint(ctx, this.x + this.face * 10 * s, this.y - 40 * s, HUNT.amber);
    }
    super.drawOverlay(ctx);
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x + this.face * 6, this.y - 30, this.awaitingPurify ? 70 : 30, this.awaitingPurify ? '#b04cff' : HUNT.eye, this.awaitingPurify ? 0.8 : 0.35, 0.4);
    if (this.state === 'crouch') lighting.add(this.markX, this.markY - 6, 50, HUNT.amber, 0.6, 0.5);
  }
}

// =====================================================================
// SWARM CARRIER
// =====================================================================

/** A drifting cloud of the swarm: it stings while you stand in it, and scatters when struck. */
export class SwarmCloud extends Entity {
  t = 0;
  life = 6.5;
  tick = 0.2;
  dmg: number;
  owner: Enemy | null;
  hitSet = new Set<number>();
  seed = rand(0, 100);

  constructor(owner: Enemy | null, x: number, y: number, dmg: number) {
    super(x, y, 30, 26);
    this.owner = owner;
    this.dmg = dmg;
    this.team = 'enemy';
    // A foe for the purpose of being struck (blades and Echoes scatter it), never knocked about.
    this.isFoe = true;
    this.heavyBody = true;
    this.grav = 0;
    this.collide = false;
    this.layer = 9;
    this.hp = this.maxHp = 3;
    this.name = 'Swarm';
  }

  update(dt: number) {
    this.t += dt;
    this.life -= dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.life <= 0) {
      this.scatter(false);
      return;
    }
    // Slow enough to walk away from; it follows where you stand, not where you will be.
    const p = G.world.player;
    const dx = p.x - this.x, dy = p.y - 6 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = this.t < 0.5 ? 70 : 36;
    this.x += ((dx / d) * sp + Math.sin(this.t * 2.3 + this.seed) * 14) * dt;
    this.y += ((dy / d) * sp * 0.6 + Math.cos(this.t * 1.7 + this.seed) * 10) * dt;
    this.tick -= dt;
    if (this.tick <= 0 && this.t > 0.35) {
      this.tick = 0.45;
      this.hitSet.clear();
      G.world.hitPlayerSide({ x: this.x - 13, y: this.y - 26, w: 26, h: 26 }, {
        dmg: this.dmg, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'hazard', src: this, unblockable: true, parryable: false, noKnock: true,
      }, this.hitSet);
    }
    if (Math.random() < dt * 6) sfx('buzz', { pan: G.world.pan(this.x), vol: 0.18, pitch: rand(1.3, 1.6), gap: 400 });
  }

  takeHit(h: HitInfo): boolean {
    if (this.remove || h.dot) return false;
    this.hp--;
    this.flash = 0.12;
    fx.hitSparks(this.x, this.y - 13, h.dir || 1, BILE.c, 5, 0.7);
    if (this.hp <= 0) this.scatter(true);
    return true;
  }

  canBeTargeted() {
    return !this.remove && this.t > 0.3;
  }

  private scatter(struck: boolean) {
    if (this.remove) return;
    this.remove = true;
    if (struck) sfx('skitter', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.4 });
    for (let i = 0; i < (struck ? 14 : 6); i++) fx.spawn(PK.Spark, this.x + rand(-10, 10), this.y - rand(4, 22), rand(-110, 110), rand(-90, 40), rand(0.3, 0.6), 1.2, 0.4, i % 3 ? '#1a1c10' : BILE.c, 60, 2);
  }

  draw(ctx: Ctx) {
    const a = Math.min(1, this.t * 4, this.life * 2);
    const cx = this.x, cy = this.y - 13;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, cy, 22, BILE.deep, 0.45 * a);
    glow(ctx, cx, cy, 10, BILE.c, (0.18 + this.flash * 4) * a);
    ctx.globalCompositeOperation = 'source-over';
    // The flies: each on its own looping orbit, computed (not stored) per frame.
    const n = fineDetail() ? 22 : 12;
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const ph = this.t * (5 + (i % 5)) + i * 2.39 + this.seed;
      const rx = 6 + (i * 7) % 9, ry = 4 + (i * 5) % 8;
      const fx0 = cx + Math.cos(ph) * rx + Math.sin(ph * 0.37 + i) * 3;
      const fy0 = cy + Math.sin(ph * 1.3) * ry;
      ctx.fillStyle = i % 4 === 0 ? BILE.c : '#14160c';
      ctx.fillRect(fx0, fy0, i % 4 === 0 ? 1 : 1.4, 1);
    }
    ctx.globalAlpha = 1;
  }

  lights() {
    lighting.add(this.x, this.y - 13, 40, BILE.c, 0.35, 0.4);
  }
}

/** Where a carrier bursts: a ring marks it, then spores bloom for a few seconds. */
export class SporePatch extends Entity {
  t = 0;
  tick = 0;
  dmg: number;
  hitSet = new Set<number>();
  static TELE = 0.75;
  static LIFE = 3.2;
  r = 34;

  constructor(x: number, y: number, dmg: number) {
    super(x, y, 68, 40);
    this.name = 'Spores';
    this.dmg = dmg;
    this.team = 'enemy';
    this.grav = 0;
    this.collide = false;
    this.layer = 4;
  }

  get active() {
    return this.t >= SporePatch.TELE;
  }

  update(dt: number) {
    const was = this.active;
    this.t += dt;
    if (this.t >= SporePatch.TELE + SporePatch.LIFE) {
      this.remove = true;
      return;
    }
    if (!this.active) return;
    if (!was) {
      sfx('acid', { pan: G.world.pan(this.x), vol: 0.6, pitch: 0.8 });
      fx.ring(this.x, this.y - 2, 6, this.r * 1.2, BILE.c, 0.4, 3, 0.25);
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      this.hitSet.clear();
      G.world.hitPlayerSide({ x: this.x - this.r, y: this.y - 40, w: this.r * 2, h: 40 }, {
        dmg: this.dmg, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'hazard', src: this, unblockable: true, parryable: false, noKnock: true,
      }, this.hitSet);
    }
    if (Math.random() < dt * (fineDetail() ? 26 : 12)) fx.spawn(PK.Mote, this.x + rand(-this.r, this.r), this.y - rand(0, 6), rand(-6, 6), rand(-40, -18), rand(0.8, 1.4), 3, 1, BILE.c, -10, 1);
  }

  draw(ctx: Ctx) {
    if (!this.active) {
      floorMark(ctx, this.x, this.y, this.r, this.t / SporePatch.TELE, BILE.c);
      return;
    }
    const left = SporePatch.TELE + SporePatch.LIFE - this.t;
    const a = Math.min(1, left * 2, (this.t - SporePatch.TELE) * 6);
    const pulse = 0.8 + Math.sin(G.time * 6 + this.x) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    ellipse(ctx, this.x, this.y - 1, this.r, 3.5, 0, rgba(BILE.c, 0.5 * a));
    glow(ctx, this.x, this.y - 12, this.r * 1.2, BILE.deep, 0.55 * a * pulse);
    glow(ctx, this.x, this.y - 22, this.r * 0.8, BILE.c, 0.2 * a);
    ctx.globalCompositeOperation = 'source-over';
  }

  lights() {
    lighting.add(this.x, this.y - 10, this.active ? 80 : 46, BILE.c, this.active ? 0.6 : 0.4, 0.5);
  }
}

const SWELL_T = 0.95;
const BASH_T = 0.8;

export class Carrier extends Enemy {
  pixelShade = true;
  pixelBox = [-30, -50, 30, 6] as const;
  gait = rand(0, 6);
  swell = 0;
  bashCd = 0;
  burst = false;

  constructor(x: number, y: number, elite: string | null) {
    super('carrier', x, y, 26, 30, elite);
    this.attackCd = rand(1.2, 2.2);
    if (elite) this.scale = 1.15;
  }

  groan() {
    sfx('buzz', { pan: G.world.pan(this.x), vol: 0.35, pitch: 0.7 });
  }

  private cloudsOut() {
    let n = 0;
    for (const e of G.world.ents) if (e instanceof SwarmCloud && e.owner === this && !e.remove) n++;
    return n;
  }

  think(dt: number) {
    const b = this.body;
    this.bashCd = Math.max(0, this.bashCd - dt);
    if (!this.aggro) {
      const t = this.pickTarget(200);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
      b.vx = approach(b.vx, 0, 400 * dt);
      return;
    }
    this.target = this.pickTarget(480);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dx = t.x - this.x, dist = Math.abs(dx);
    const s = this.scale;
    switch (this.state) {
      case 'swell': {
        // The tell: the sac swells and the buzzing rises.
        b.vx = approach(b.vx, 0, 600 * dt);
        this.faceTarget();
        if (this.st >= SWELL_T) {
          const dmg = this.dmg * 0.2;
          G.world.add(new SwarmCloud(this, this.x - this.face * 4 * s, this.y - 18 * s, dmg));
          sfx('swarmBuzz', { pan: G.world.pan(this.x), vol: 0.7, gap: 250 });
          if (this.elite) G.world.add(new SwarmCloud(this, this.x + this.face * 10, this.y - 30 * s, dmg));
          sfx('chitter', { pan: G.world.pan(this.x), vol: 0.7, pitch: 0.9 });
          fx.ring(this.x - this.face * 4 * s, this.y - 24 * s, 4, 26, BILE.c, 0.3, 2);
          for (let i = 0; i < 8; i++) fx.spawn(PK.Spark, this.x - this.face * 4, this.y - 26 * s, rand(-60, 60), rand(-80, 0), 0.4, 1.2, 0.3, '#14160c', 40, 2);
          this.attackCd = rand(3.4, 4.4);
          this.setState('shuffle');
        }
        break;
      }
      case 'bash': {
        // A heave of the sac at whoever crowds it.
        const u = this.st / BASH_T;
        if (u < 0.45) b.vx = approach(b.vx, 0, 800 * dt);
        else if (u < 0.6) {
          if (this.st - dt < 0.45 * BASH_T) {
            b.vx = this.face * 110;
            sfx('shieldBash', { pan: G.world.pan(this.x), pitch: 0.6 });
          }
          this.strike(-4, -30 * s, 28 * s, 30 * s, 0.9, { poise: 26, kx: this.face * 240, ky: -160 });
        } else b.vx = approach(b.vx, 0, 900 * dt);
        if (u >= 1) {
          this.bashCd = 1.8;
          this.setState('shuffle');
        }
        break;
      }
      default: {
        this.faceTarget();
        if (b.onGround && Math.abs(t.y - this.y) < 36 && this.bashCd <= 0 && dist < 34) {
          this.hitSet.clear();
          this.setState('bash');
          break;
        }
        if (this.attackCd <= 0 && dist < 230 && this.cloudsOut() < 2 && this.canSee(t)) {
          this.setState('swell');
          sfx('buzz', { pan: G.world.pan(this.x), vol: 0.75, pitch: 0.85 });
          break;
        }
        // It shuffles to keep the swarm's reach on you, never in a hurry.
        const keep = 84;
        if (dist > keep + 16) this.walkToward(t.x, this.elite ? 30 : 24, dt, keep);
        else if (dist < keep - 34) {
          this.walkToward(this.x - sign(dx) * 30, 18, dt);
          this.face = sign(dx) || this.face;
        } else b.vx = approach(b.vx, 0, 300 * dt);
        this.state = 'shuffle';
      }
    }
  }

  die(h?: HitInfo) {
    if (this.dying) return;
    super.die(h);
    if (this.awaitingPurify) return;
    // It bursts: the ring is the warning; the spores bloom a moment later.
    this.burst = true;
    G.world.add(new SporePatch(this.x, floorBelow(this.x, this.y - 8), this.dmg * 0.3));
    sfx('acid', { pan: G.world.pan(this.x), vol: 0.8, pitch: 0.6 });
    fx.veilBurst(this.x, this.y - 18, 10, 1);
    for (let i = 0; i < 18; i++) fx.spawn(PK.Drop, this.x + rand(-8, 8), this.y - rand(10, 26), rand(-120, 120), rand(-220, -60), rand(0.4, 0.8), 2, 1, i % 2 ? BILE.c : BILE.deep, 600, 0);
  }

  update(dt: number) {
    super.update(dt);
    const b = this.body;
    if (Math.abs(b.vx) > 4 && b.onGround) this.gait += dt * (3 + Math.abs(b.vx) * 0.08);
    const want = this.state === 'swell' && !this.dying ? 1 : 0;
    this.swell = approach(this.swell, want, dt * (want ? 1.3 : 6));
    if (!this.dying && Math.random() < dt * (fineDetail() ? 10 : 4)) fx.spawn(PK.Mote, this.x - this.face * 5 + rand(-10, 10), this.y - rand(18, 34), rand(-8, 8), rand(-24, -8), 0.9, 2, 0.5, BILE.c, -6, 1);
  }

  draw(ctx: Ctx) {
    const dying = this.dying && !this.awaitingPurify;
    // It bursts outward, then is gone.
    if (dying && this.deathT > 0.35) return;
    const pop = dying ? 1 + this.deathT * 1.4 : 1;
    ctx.save();
    ctx.globalAlpha = dying ? clamp(1 - this.deathT / 0.35, 0, 1) : 1;
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * this.scale, this.scale);
    this.drawBody(ctx, false, pop);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.9, this.flash * 9);
      this.drawBody(ctx, true, pop);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The host, in local space: feet at 0, facing +x. */
  private drawBody(ctx: Ctx, flash: boolean, pop: number) {
    const time = G.time + this.id;
    const o = flash ? '#fff8ec' : '#080a06';
    const W = '#fff8ec';
    const g = this.gait, step = Math.sin(g), lift = Math.max(0, Math.cos(g));
    const bash = this.state === 'bash' ? clamp(this.st / BASH_T, 0, 1) : 0;
    const heave = bash < 0.45 ? -bash / 0.45 * 0.25 : bash < 0.6 ? 0.45 : 0.45 * (1 - (bash - 0.6) / 0.4);
    const hurt = this.state === 'hurt' || this.staggered > 0 ? 1 : 0;
    const breathe = Math.sin(time * 2.2) * 0.04;
    const sw = (1 + this.swell * 0.25 + breathe + (this.swell > 0.5 ? Math.sin(time * 40) * 0.03 : 0)) * pop;
    const bob = -Math.abs(step) * 1.2;
    const leg = flash ? W : '#5e5a40', legBack = flash ? W : '#46442e', rag = flash ? W : '#7a7052';
    // A crooked staff it leans on (behind the front leg, ahead of the body).
    const sx0 = 15 + step * 1.5;
    ctx.strokeStyle = o;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx0 - 3, -22 + bob); ctx.lineTo(sx0 + 1, -11); ctx.lineTo(sx0, 0);
    ctx.stroke();
    ctx.strokeStyle = flash ? W : '#6a5236';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // Legs: short, bowed, dragging.
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1, fx0 = sgn * 4 + (i ? step : -step) * 4, up = (i ? lift : Math.max(0, -Math.cos(g))) * 1.5;
      const c = i ? leg : legBack;
      limbShaded(ctx, sgn * 3, -11 + bob, fx0 + 2, -5 - up, 2.8, 2.4, c, o, 0.6);
      limbShaded(ctx, fx0 + 2, -5 - up, fx0 + 2.5, -1.2 - up * 0.5, 2.4, 2, c, o, 0.6);
      ctx.fillStyle = i ? (flash ? W : '#3a3426') : (flash ? W : '#2a261c');
      ctx.fillRect(fx0 - 0.5, -2 - up * 0.5, 6, 2);
    }
    ctx.save();
    ctx.translate(0, -10 + bob);
    ctx.rotate(0.12 + heave - hurt * 0.2);
    // The brood sac: lumpy, swollen over the back, blistered and lit from within.
    const cx = -5 * sw, cy = -12;
    for (let lobe = 0; lobe < 3; lobe++) {
      const lx = lobe === 0 ? cx : lobe === 1 ? cx - 7 * sw : cx + 4 * sw;
      const ly = lobe === 0 ? cy : lobe === 1 ? cy + 6 * sw : cy - 9 * sw;
      const lr = lobe === 0 ? 11.5 : lobe === 1 ? 7 : 6.5;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr * sw, lr * 0.92 * sw, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = flash ? W : rGrad(ctx, '#949c5e', -10, -22, 18, 0.16, -0.42);
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    if (!flash) {
      // Veins.
      ctx.strokeStyle = '#4c5428';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + 6 * sw, cy + 7 * sw); ctx.quadraticCurveTo(cx - 1 * sw, cy, cx - 4 * sw, cy - 8 * sw);
      ctx.moveTo(cx - 2 * sw, cy + 2 * sw); ctx.quadraticCurveTo(cx - 8 * sw, cy + 3 * sw, cx - 11 * sw, cy + 8 * sw);
      ctx.stroke();
      // Blisters that pulse brighter as it swells.
      const glowA = clamp(0.5 + this.swell * 0.5 + Math.sin(time * 5) * 0.12, 0, 1);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.7 + 0.4, rr = (i % 2 ? 0.45 : 0.62) * 11 * sw;
        const bx = cx + Math.cos(a) * rr, by = cy + Math.sin(a) * rr * 0.9;
        circle(ctx, bx, by, 1.9 + (i % 2) * 0.6, '#3e4a1e');
        circle(ctx, bx - 0.3, by - 0.3, 1.2 + (i % 2) * 0.5, rgba(BILE.c, glowA));
      }
      // The vent the swarm leaves by.
      ellipse(ctx, cx + 4 * sw, cy - 13 * sw, 2.6, 1.2, -0.3, '#10140a');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, 11 * sw, BILE.c, 0.1 + this.swell * 0.35);
      glow(ctx, cx + 4 * sw, cy - 13 * sw, 4 + this.swell * 4, BILE.c, 0.35 + this.swell * 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Torso in rags, bent under the weight.
    ctx.beginPath();
    ctx.moveTo(1, -1); ctx.lineTo(0, -12); ctx.lineTo(6, -18); ctx.lineTo(11, -15); ctx.lineTo(10, -4); ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fillStyle = flash ? W : vGrad(ctx, '#7a7052', -18, 0, 0.14, -0.35);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (!flash) {
      ctx.strokeStyle = '#3a301e';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(1, -6); ctx.lineTo(10, -7);
      ctx.stroke();
    }
    // A hooded head, bowed low and forward.
    ctx.beginPath();
    ctx.ellipse(13, -15, 4.6, 4.2, 0.35, 0, Math.PI * 2);
    ctx.fillStyle = flash ? W : rGrad(ctx, '#5a5438', 12, -18, 6, 0.14, -0.35);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (!flash) {
      ctx.fillStyle = '#0c0e06';
      ctx.beginPath();
      ctx.ellipse(15.2, -13.8, 2.4, 2.6, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BILE.hot;
      ctx.fillRect(15.4, -15, 1.1, 1);
      ctx.fillRect(16.6, -13.6, 0.9, 0.9);
    }
    // Front arm on the staff (it shoves with it when it heaves).
    limbShaded(ctx, 8, -14, 12 + heave * 10, -9 + heave * 3, 1.7, 1.5, rag, o, 0.5);
    ctx.restore();
    // The swarm that rides it, streaming from the vent.
    if (!flash) {
      const n = fineDetail() ? 14 : 7;
      for (let i = 0; i < n; i++) {
        const ph = time * (3.5 + (i % 4)) + i * 2.1;
        const k0 = (time * 0.6 + i * 0.13) % 1;
        ctx.fillStyle = i % 5 === 0 ? BILE.c : '#121408';
        ctx.fillRect(-2 + Math.cos(ph) * (8 + k0 * 12) * sw, -36 - k0 * 10 + Math.sin(ph * 1.4) * 6, 1.5, 1.5);
      }
    }
  }

  drawOverlay(ctx: Ctx) {
    if (!this.dying) {
      const s = this.scale;
      if (this.state === 'swell' && this.st > 0.2) this.glint(ctx, this.x - this.face * 5 * s, this.y - 28 * s, BILE.c);
      else if (this.state === 'bash' && this.st < 0.45 * BASH_T && this.st > 0.08) this.glint(ctx, this.x + this.face * 10 * s, this.y - 24 * s, '#ff5a6a');
    }
    super.drawOverlay(ctx);
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x - this.face * 5, this.y - 22, this.awaitingPurify ? 70 : 40 + this.swell * 30, this.awaitingPurify ? '#b04cff' : BILE.c, this.awaitingPurify ? 0.8 : 0.45 + this.swell * 0.3, 0.4);
  }
}

// =====================================================================
// SLAG GOLEM
// =====================================================================

/** A low wave of fire running along the floor. Clear it with a jump (or a dodge). */
export class SlagWave extends Entity {
  life = 1.5;
  dmg: number;
  hitSet = new Set<number>();
  t = 0;

  constructor(x: number, y: number, dir: number, dmg: number) {
    super(x, y, 22, 18);
    this.name = 'Slag Wave';
    this.face = dir;
    this.dmg = dmg;
    this.team = 'enemy';
    this.grav = 0;
    this.collide = false;
    this.layer = 8;
  }

  update(dt: number) {
    this.t += dt;
    this.life -= dt;
    const W = G.world;
    const nx = this.x + this.face * 175 * dt;
    // It runs out where the floor ends or a wall stands.
    if (this.life <= 0 || !floorAt(nx + this.face * 6, this.y) || W.solidAt(nx + this.face * 8, this.y - 6)) {
      this.remove = true;
      fx.embers(this.x, this.y - 4, 5, SLAG.c, 6);
      return;
    }
    this.x = nx;
    W.hitPlayerSide({ x: this.x - 11, y: this.y - 18, w: 22, h: 18 }, {
      dmg: this.dmg, poise: 22, kx: this.face * 120, ky: -160, dir: this.face, kind: 'proj', src: this, unblockable: true, parryable: false,
    }, this.hitSet);
    if (Math.random() < dt * 30) fx.spawn(PK.Flame, this.x + rand(-8, 8), this.y - rand(0, 8), rand(-20, 20), rand(-90, -40), rand(0.2, 0.4), rand(3, 5), 1, Math.random() < 0.5 ? SLAG.c : SLAG.hot, 0, 1);
  }

  draw(ctx: Ctx) {
    const a = Math.min(1, this.life * 4, this.t * 10);
    const f = this.face, x = this.x, y = this.y, fl = Math.sin(this.t * 40) * 1.5;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x - f * 13, y); ctx.lineTo(x - f * 9, y - 8); ctx.lineTo(x - f * 3, y - 17 - fl); ctx.lineTo(x + f * 2, y - 9);
    ctx.lineTo(x + f * 7, y - 14 + fl); ctx.lineTo(x + f * 12, y);
    ctx.closePath();
    ctx.fillStyle = '#e8622a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - f * 8, y); ctx.lineTo(x - f * 3, y - 10 - fl * 0.5); ctx.lineTo(x + f * 1, y - 5); ctx.lineTo(x + f * 5, y - 8); ctx.lineTo(x + f * 8, y);
    ctx.closePath();
    ctx.fillStyle = SLAG.hot;
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - 6, 18, SLAG.c, 0.5 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  lights() {
    lighting.add(this.x, this.y - 8, 60, SLAG.c, 0.7, 0.6);
  }
}

const SLAM_T = 1.0;
const SLAM_END = 1.35;
const CORE_T = 1.5;
const SWAT_T = 0.75;

export class Golem extends Enemy {
  pixelShade = true;
  pixelBox = [-40, -80, 44, 8] as const;
  gait = rand(0, 6);
  raise = 0;
  slamK = 0;
  /** Seconds the core stays open after a slam. */
  coreT = 0;
  openK = 0;
  heat = 0;

  constructor(x: number, y: number, elite: string | null) {
    super('golem', x, y, 30, 46, elite);
    this.tank = true;
    this.superArmor = true;
    this.attackCd = rand(1.0, 2.0);
    if (elite) this.scale = 1.15;
  }

  groan() {
    sfx('colossusStep', { pan: G.world.pan(this.x), vol: 0.5, pitch: 1.2 });
  }

  /** The plated front blunts blows; the open core (from either side) takes them hard. */
  takeHit(h: HitInfo): boolean {
    if (this.dying || this.invuln > 0) return false;
    const frontal = h.dir !== 0 && sign(h.dir) !== this.face;
    let mul = 1;
    if (this.coreT > 0) mul = 1.75;
    else if (frontal && this.staggered <= 0 && !h.dot) mul = h.guardBreak ? 0.7 : 0.4;
    if (mul === 1) return super.takeHit(h);
    if (mul < 1) {
      sfx('armorClank', { pan: G.world.pan(this.x), vol: 0.8, pitch: 0.75, gap: 60 });
      fx.hitSparks(this.x + this.face * 12, this.y - 28, -this.face, '#d8b898', 6, 0.8);
    } else fx.hitSparks(this.x + this.face * 4, this.y - 30, h.dir || 1, SLAG.core, 10, 1.2);
    return super.takeHit({ ...h, dmg: h.dmg * mul, crit: h.crit || mul > 1 });
  }

  /** It does not flinch out of a raised slam; only a stagger stops it. */
  flinch(h: HitInfo) {
    if (this.state === 'slam') return;
    this.hurtT = h.heavy ? 0.3 : 0.2;
    this.setState('hurt');
  }

  think(dt: number) {
    const b = this.body;
    this.coreT = Math.max(0, this.coreT - dt);
    if (!this.aggro) {
      const t = this.pickTarget(210);
      if (t && this.canSee(t)) {
        this.aggro = true;
        this.groan();
      }
      b.vx = approach(b.vx, 0, 600 * dt);
      return;
    }
    this.target = this.pickTarget(480);
    if (!this.target) {
      this.aggro = false;
      return;
    }
    const t = this.target;
    const dist = Math.abs(t.x - this.x);
    const s = this.scale;
    switch (this.state) {
      case 'slam': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st >= SLAM_T && this.st - dt < SLAM_T) this.impact();
        if (this.st >= SLAM_END) {
          // The chest stays open while it heaves itself up.
          this.coreT = CORE_T;
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        b.vx = approach(b.vx, 0, 900 * dt);
        if (this.st >= CORE_T) {
          this.attackCd = rand(2.0, 2.8);
          this.setState('walk');
        }
        break;
      }
      case 'swat': {
        const u = this.st / SWAT_T;
        b.vx = approach(b.vx, 0, 900 * dt);
        if (u > 0.55 && u < 0.7) {
          if (this.st - dt < 0.55 * SWAT_T) {
            sfx('swingHeavy', { pan: G.world.pan(this.x), pitch: 0.7 });
            fx.slash(this.x + this.face * 14 * s, this.y - 26 * s, 20 * s, -1.4, 1.2, 7, this.face, '#ffe0b0', SLAG.c, 0.16);
          }
          this.strike(-2, -40 * s, 40 * s, 40 * s, 1.0, { poise: 40, kx: this.face * 260, ky: -180 });
        }
        if (u >= 1) {
          this.attackCd = Math.max(this.attackCd, 0.8);
          this.setState('walk');
        }
        break;
      }
      default: {
        this.faceTarget();
        if (this.attackCd <= 0 && b.onGround && Math.abs(t.y - this.y) < 44) {
          if (dist < 40 && Math.random() < 0.5) {
            this.hitSet.clear();
            this.setState('swat');
            sfx('stoneCrack', { pan: G.world.pan(this.x), vol: 0.4, pitch: 1.4 });
            break;
          }
          if (dist < 150) {
            this.hitSet.clear();
            this.setState('slam');
            sfx('stoneCrack', { pan: G.world.pan(this.x), vol: 0.7, pitch: 0.8 });
            sfx('molten', { pan: G.world.pan(this.x), vol: 0.5 });
            break;
          }
        }
        this.walkToward(t.x, this.elite ? 38 : 32, dt, 34);
        this.state = 'walk';
      }
    }
  }

  private impact() {
    const s = this.scale, f = this.face;
    const W = G.world;
    const hx = this.x + f * 26 * s, floor = floorBelow(hx, this.y - 8);
    this.strike(4, -30 * s, 40 * s, 32 * s, 1.25, { poise: 60, kx: f * 200, ky: -260, parryable: false });
    W.add(new SlagWave(hx + f * 8, floor, f, this.dmg * 0.6));
    sfx('waveWhoosh', { pan: W.pan(hx), vol: 0.8, pitch: 1.1 });
    W.add(new Proj('puddle', hx, floor, 'enemy', this.dmg * 0.18, { life: 2.4, w: 40, h: 8 }));
    sfx('bossSlam', { pan: W.pan(this.x), vol: 0.75, pitch: 1.3 });
    sfx('fireBurst', { pan: W.pan(hx), vol: 0.5 });
    G.camera.addTrauma(0.22 * shakeScale());
    fx.dust(hx, floor, 10, 1.4);
    fx.ring(hx, floor - 1, 4, 44, SLAG.c, 0.35, 3, 0.25);
    fx.embers(hx, floor - 4, 12, SLAG.c, 14);
  }

  die(h?: HitInfo) {
    if (this.dying) return;
    super.die(h);
    if (this.awaitingPurify) return;
    sfx('stoneCrack', { pan: G.world.pan(this.x), pitch: 0.7 });
    fx.shards(this.x, this.y - 24, 16, '#3a302c', 1.5);
    fx.embers(this.x, this.y - 26, 18, SLAG.c, 16);
  }

  update(dt: number) {
    super.update(dt);
    const b = this.body;
    if (Math.abs(b.vx) > 4 && b.onGround) {
      const before = Math.sin(this.gait);
      this.gait += dt * (2.2 + Math.abs(b.vx) * 0.06);
      // Each footfall lands with weight.
      if (before < 0 && Math.sin(this.gait) >= 0 && !this.dying) {
        sfx('colossusStep', { pan: G.world.pan(this.x), vol: 0.25, pitch: 1.5, gap: 150 });
        fx.dust(this.x + this.face * 6, this.y, 2, 0.5);
      }
    }
    const slam = this.state === 'slam' && !this.dying;
    const u = slam ? this.st / SLAM_T : 0;
    this.raise = approach(this.raise, slam && u < 1 ? 1 : 0, dt * (slam && u < 1 ? 1.6 : 10));
    this.slamK = approach(this.slamK, slam && u >= 1 ? 1 : this.state === 'recover' ? 0.7 : 0, dt * (slam ? 14 : 2));
    this.openK = approach(this.openK, this.coreT > 0 && !this.dying ? 1 : 0, dt * 6);
    this.heat = approach(this.heat, slam ? 1 : this.coreT > 0 ? 0.7 : 0.25, dt * 2);
  }

  draw(ctx: Ctx) {
    const dying = this.dying && !this.awaitingPurify;
    const fade = dying ? clamp(1 - (this.deathT - 0.35) / 0.65, 0, 1) : 1;
    if (fade <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(this.x, this.y + (dying ? this.deathT * 10 : 0));
    ctx.scale(this.face * this.scale, this.scale);
    this.drawBody(ctx, false);
    if (this.flash > 0) {
      ctx.globalAlpha = fade * Math.min(0.9, this.flash * 9);
      this.drawBody(ctx, true);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The construct in local space: feet at 0, facing +x. */
  private drawBody(ctx: Ctx, flash: boolean) {
    const time = G.time + this.id;
    const o = flash ? '#fff8ec' : '#0a0606';
    const W = '#fff8ec';
    const rock = flash ? W : '#5a4c44', rockDark = flash ? W : '#3a302c';
    const g = this.gait, step = Math.sin(g);
    const r = easeInOutSine(this.raise), sl = this.slamK, op = this.openK;
    const hurt = this.state === 'hurt' || this.staggered > 0 ? 1 : 0;
    const down = this.dying ? clamp(this.deathT / 0.5, 0, 1) : 0;
    const bob = -Math.abs(step) * 1.2 + sl * 3 + down * 6;
    const lean = 0.1 - r * 0.22 + sl * 0.3 - hurt * 0.15 + down * 0.4;
    const hot = flash ? W : SLAG.c;
    // Legs: short pillars of stone on slab feet.
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1, foot = sgn * 6 + (i ? step : -step) * 5, up = Math.max(0, (i ? 1 : -1) * Math.cos(g)) * 2;
      const c = i ? rock : rockDark;
      limbShaded(ctx, sgn * 5, -17 + bob, foot - sgn, -9 - up, 5.4, 4.6, c, o, 0.8);
      limbShaded(ctx, foot - sgn, -9 - up, foot, -3 - up, 4.6, 4.2, c, o, 0.8);
      ctx.beginPath();
      ctx.moveTo(foot - 6, -up); ctx.lineTo(foot - 5, -4 - up); ctx.lineTo(foot + 5, -4 - up); ctx.lineTo(foot + 8, -up);
      ctx.closePath();
      ctx.fillStyle = i ? (flash ? W : '#4a3e38') : (flash ? W : '#2e2622');
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(0, -16 + bob);
    ctx.rotate(lean);
    // Back arm.
    fistAt(0, step, r, sl);
    this.arm(ctx, -6, -24, FIST.x, FIST.y, rockDark, o, flash, false);
    // Torso: a hunched boulder.
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(-16, -10); ctx.lineTo(-13, -24); ctx.lineTo(-4, -31); ctx.lineTo(8, -30); ctx.lineTo(15, -21); ctx.lineTo(13, -6); ctx.lineTo(6, 1);
    ctx.closePath();
    ctx.fillStyle = flash ? W : vGrad(ctx, '#5a4c44', -31, 1, 0.22, -0.4);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (!flash) {
      // Molten seams, brighter as it gathers heat.
      ctx.strokeStyle = rgba(hot, 0.6 + this.heat * 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-13, -12); ctx.lineTo(-8, -10); ctx.lineTo(-9, -4);
      ctx.moveTo(-9, -26); ctx.lineTo(-4, -22); ctx.lineTo(-7, -17);
      if (fineDetail()) { ctx.moveTo(-2, -29); ctx.lineTo(1, -25); }
      ctx.stroke();
    }
    // The core, behind two chest plates that part after a slam.
    const cx = -1, cy = -15;
    if (!flash) {
      circle(ctx, cx, cy, 5.5, '#2a0e06');
      circle(ctx, cx, cy, 4.2, op > 0.1 ? SLAG.hot : SLAG.c);
      circle(ctx, cx, cy, 2.2, SLAG.core);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, 8 + op * 10, SLAG.c, 0.35 + op * 0.6 + Math.sin(time * 12) * 0.08 * op);
      ctx.globalCompositeOperation = 'source-over';
    }
    const gap = op * 5.5;
    for (let i = 0; i < 2; i++) {
      const top = i === 0, oy = top ? -gap : gap;
      ctx.beginPath();
      if (top) { ctx.moveTo(cx - 7, cy - 8 + oy); ctx.lineTo(cx + 8, cy - 9 + oy); ctx.lineTo(cx + 9, cy + oy); ctx.lineTo(cx - 6, cy + oy); }
      else { ctx.moveTo(cx - 6, cy + oy); ctx.lineTo(cx + 9, cy + oy); ctx.lineTo(cx + 8, cy + 8 + oy); ctx.lineTo(cx - 6, cy + 7 + oy); }
      ctx.closePath();
      ctx.fillStyle = flash ? W : vGrad(ctx, '#6a5c52', -24, -6, 0.22, -0.3);
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    // Front arm, and the slag pauldron that blunts blows to its front.
    fistAt(1, step, r, sl);
    this.arm(ctx, 7, -24, FIST.x, FIST.y, rock, o, flash, true);
    // A head thrust out between the shoulders, one ember of an eye.
    ctx.beginPath();
    ctx.moveTo(12, -31); ctx.lineTo(21, -30); ctx.lineTo(23, -23); ctx.lineTo(14, -21);
    ctx.closePath();
    ctx.fillStyle = flash ? W : rGrad(ctx, '#6a5a50', 17, -31, 9, 0.18, -0.3);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    if (!flash) {
      ctx.fillStyle = '#140806';
      ctx.fillRect(16, -28, 6.5, 2.2);
      ctx.fillStyle = this.state === 'slam' ? SLAG.core : SLAG.hot;
      ctx.fillRect(18.5, -27.5, 3, 1.3);
    }
    ctx.restore();
  }

  /** A boulder shoulder, a thick arm and a block of a fist (torso space). */
  private arm(ctx: Ctx, sx: number, sy: number, fx0: number, fy0: number, c: string, o: string, flash: boolean, front: boolean) {
    // The elbow bows outward and back.
    const mx = (sx + fx0) / 2 - 5, my = (sy + fy0) / 2 + 1;
    limbShaded(ctx, sx, sy, mx, my, 5.4, 4.6, c, o, 0.8);
    limbShaded(ctx, mx, my, fx0, fy0, 5, 6, c, o, 0.8);
    const fc = flash ? '#fff8ec' : front ? '#4a3e38' : '#2e2622';
    ctx.beginPath();
    ctx.moveTo(fx0 - 6, fy0 - 5); ctx.lineTo(fx0 + 6, fy0 - 6); ctx.lineTo(fx0 + 7, fy0 + 5); ctx.lineTo(fx0 - 5, fy0 + 6);
    ctx.closePath();
    ctx.fillStyle = fc;
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (!flash) {
      ctx.strokeStyle = this.heat > 0.3 ? rgba(SLAG.c, this.heat) : '#1a1412';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(fx0 + 1, fy0 - 5); ctx.lineTo(fx0 + 1.5, fy0 + 5);
      ctx.stroke();
    }
    // Shoulder boulder (the front one plated in slag iron).
    ctx.beginPath();
    if (front) { ctx.moveTo(sx - 6, sy - 5); ctx.lineTo(sx + 4, sy - 9); ctx.lineTo(sx + 12, sy - 3); ctx.lineTo(sx + 11, sy + 9); ctx.lineTo(sx + 2, sy + 7); }
    else { ctx.moveTo(sx - 7, sy - 3); ctx.lineTo(sx, sy - 8); ctx.lineTo(sx + 7, sy - 4); ctx.lineTo(sx + 6, sy + 5); ctx.lineTo(sx - 4, sy + 6); }
    ctx.closePath();
    ctx.fillStyle = flash ? '#fff8ec' : front ? vGrad(ctx, '#7a6a5c', -34, -14, 0.24, -0.34) : vGrad(ctx, '#3e3430', -32, -18, 0.16, -0.3);
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (front && !flash && fineDetail()) {
      ctx.fillStyle = '#a8968a';
      ctx.fillRect(sx + 6, sy - 3, 1.3, 1.3);
      ctx.fillRect(sx + 6, sy + 4, 1.3, 1.3);
    }
  }

  drawOverlay(ctx: Ctx) {
    if (!this.dying) {
      const s = this.scale, f = this.face;
      if (this.state === 'slam' && this.st < SLAM_T) {
        // The tell: fists overhead, eye white-hot, and a line of heat along the floor it will burn.
        const u = this.st / SLAM_T, hx = this.x + f * 26 * s, floor = floorBelow(hx, this.y - 8);
        if (this.st > 0.2) this.glint(ctx, this.x + f * 4 * s, this.y - 66 * s, SLAG.hot);
        floorMark(ctx, hx, floor, 18, u, SLAG.c);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(SLAG.c, 0.25 + u * 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, floor - 1);
        ctx.lineTo(hx + f * (40 + u * 140), floor - 1);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (this.state === 'swat' && this.st < 0.55 * SWAT_T && this.st > 0.1) this.glint(ctx, this.x + f * 18 * s, this.y - 30 * s, '#ff5a6a');
      if (this.coreT > 0) {
        // The opening: a pulsing ring round the bare core.
        const p = 0.6 + Math.sin(G.time * 14) * 0.3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(SLAG.core, p);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x - f * 1 * s, this.y - 32 * s, 9 + Math.sin(G.time * 14) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    super.drawOverlay(ctx);
  }

  lights() {
    if (this.dying && !this.awaitingPurify) return;
    lighting.add(this.x + this.face * 4, this.y - 34, this.awaitingPurify ? 70 : 40 + this.openK * 40, this.awaitingPurify ? '#b04cff' : SLAG.c, this.awaitingPurify ? 0.8 : 0.5 + this.heat * 0.4, 0.5);
  }
}

/** Scratch point for fist placement (no per-frame allocation). */
const FIST = { x: 0, y: 0 };
function fistAt(front: number, step: number, r: number, sl: number) {
  // Knuckles rest on the floor ahead of it, rise overhead (r), then are driven into the floor (sl).
  let x = front ? 18 : -2, y = 12;
  x += (front ? step : -step) * 3;
  x += (3 - x) * r; y += (-46 - y) * r;
  x += ((front ? 27 : 19) - x) * sl; y += (14 - y) * sl;
  FIST.x = x; FIST.y = y;
}
