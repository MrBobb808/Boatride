// THE WEIGHER — the Lord of the Feast, who drank from the vessels of the
// temple and gave himself to the Veil when the writing appeared. He is
// swollen into a judge eight tiles tall, hovering on a skirt of smoke, his
// face hidden behind hanging gold chains, a great bronze balance across his
// shoulders. He writes counterfeit letters in violet ink. (The hand that
// wrote on the wall is holy; it is never his, and never a foe.)
//
// Three phases, named for the words:
// - MENE, numbered: he counts you (numerals across the floor that burst in
//   order), writes lines of letters that fly, and swings a pan in a wide arc.
// - TEKEL, weighed: the chains go rigid and the pans become hammers. They
//   slam on marked spots, alternating, then both at once with shockwaves.
//   Strike a pan while it rests on the floor: enough blows tip the beam and
//   bring him down.
// - PERES, divided: he tears in two. The halves act apart (one writes, one
//   swings) and share one life, rejoining when his poise breaks.
// Beaten, he kneels; the story calls fall().

import { Entity, type HitInfo } from './entity';
import { BossBase } from './bosses2';
import { glow, rgba, poly, ellipse, vGrad, shade, shadeable, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { G } from './ctx';
import { approach, clamp, rand, sign, lerp, choose, easeOutCubic, easeInQuad, easeInOutSine } from '../core/math';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';
import { shakeScale } from '../core/settings';
import { Glyph, InkMark, drawGlyph, INK } from './feast';

/** Hover height of the smoke skirt's foot above the floor. */
const HOVER = 10;
/** Half the beam's span, and the rest length of the pan chains. */
const BEAM = 58;
const CHAIN = 46;
/** Blows on a resting pan needed (in poise) to tip the beam. */
const TIP_MAX = 150;

const ROBE = '#4a1a5c', ROBE_DK = '#2a0c36', GOLD = '#d8a840', GOLD_HI = '#fff0b8', BRONZE = '#b07a34', OUT = '#0c0610';

type WAtk = 'count' | 'letters' | 'swing' | 'hammer' | 'both';

/** One body: the whole judge, or one half of him in PERES. */
interface Actor {
  x: number;
  vx: number;
  state: 'idle' | 'attack';
  atk: WAtk | null;
  last: WAtk | null;
  st: number;
  cd: number;
  step: number;
  struck: boolean;
  /** Which pan this body swings (the whole judge picks the nearer). */
  pan: number;
  tilt: number;
  /** Raised hand that writes (0..1). */
  write: number;
  /** Beam lifted from the shoulders to over the head (0..1). */
  lift: number;
  tx: number;
  bob: number;
}

interface Pan {
  x: number; y: number; px: number; py: number;
  /** 0 hangs on its chain, 1 driven by an attack. */
  drive: number;
  tx: number; ty: number; rate: number;
  /** Seconds left resting on the floor after a slam (open to blows). */
  rest: number;
  tip: number;
  flash: number;
}

interface Letter { x: number; y: number; idx: number; t: number; owner: number }

const newActor = (x: number, pan: number): Actor => ({ x, vx: 0, state: 'idle', atk: null, last: null, st: 0, cd: 1.2, step: 0, struck: false, pan, tilt: 0, write: 0, lift: 0, tx: x, bob: rand(0, 6) });

const gradCache = new Map<string, CanvasGradient>();
function grad(ctx: Ctx, key: string, make: (ctx: Ctx) => CanvasGradient) {
  let g = gradCache.get(key);
  if (!g) gradCache.set(key, (g = make(ctx)));
  return g;
}

/** A pan or the second half: hit boxes that answer for the Weigher. */
export class WeigherPart extends Entity {
  constructor(public boss: Weigher, public kind: 'pan' | 'half', public i: number) {
    super(boss.x, boss.y, 10, 10);
    this.team = 'enemy';
    this.isFoe = true;
    // Marked as the boss so the defeat sweep and executions leave it be.
    this.isBoss = true;
    this.heavyBody = true;
    this.layer = 3;
    this.name = boss.name;
  }
  canBeTargeted() {
    return this.kind === 'half' && this.boss.split > 0.5 && this.boss.canBeTargeted();
  }
  get cx() {
    return this.boss.partCx(this);
  }
  get cy() {
    return this.boss.partCy(this);
  }
  hurtbox() {
    return this.boss.partBox(this);
  }
  takeHit(h: HitInfo) {
    return this.boss.partHit(this, h);
  }
  update() {
    if (this.boss.remove) this.remove = true;
    this.x = this.cx;
    this.y = this.boss.y;
  }
  draw() {}
}

export class Weigher extends BossBase {
  acts: Actor[];
  pans: Pan[];
  parts: WeigherPart[] = [];
  homeX: number;
  /** 0 whole, 1 torn in two. */
  split = 0;
  splitting = false;
  sink = 0;
  eyes = 0;
  rigid = 0;
  letters: Letter[] = [];
  camF = { x: 0, y: 0 };
  yielded = false;
  // The fall.
  fallT = -1;
  fallDone: (() => void) | null = null;
  fade = 1;
  beamDrop = 0;
  dropX = 0;
  dropY = 0;
  dropR = 0;
  crownDrop = 0;
  crownX = 0;
  crownY = 0;

  constructor(x: number, y: number) {
    super('weigher', x, y, 52, 124, 80000);
    this.name = 'The Weigher';
    this.sub = 'Lord of the Feast, Given to the Veil';
    this.maxPoise = this.poise = 900;
    this.kneelTime = 4;
    this.face = -1;
    this.homeX = x;
    this.hitColor = '#e8c8ff';
    this.hitSound = 'hitHeavy';
    this.phaseMarks = [0.62, 0.3];
    this.p2At = 0.62;
    this.p3At = 0.3;
    this.acts = [newActor(x, 0), newActor(x, 1)];
    const mk = (s: number): Pan => ({ x: x + s * BEAM, y: y - 50, px: x + s * BEAM, py: y - 50, drive: 0, tx: 0, ty: 0, rate: 8, rest: 0, tip: 0, flash: 0 });
    this.pans = [mk(-1), mk(1)];
  }

  get dmg() {
    return 66 * this.ngMul * (this.phase >= 3 ? 1.12 : 1);
  }
  get spd() {
    return this.phase >= 3 ? 1.2 : this.phase === 2 ? 1.12 : 1;
  }
  get floorY() {
    return this.y;
  }

  // ------------------------------------------------------------ geometry
  /** Foot of the smoke skirt for a body (world y). */
  baseOf(a: Actor) {
    return this.y - HOVER - this.sink + Math.sin(G.time * 1.6 + a.bob) * 2 * (1 - this.sink / 30);
  }
  beamY(a: Actor) {
    return this.baseOf(a) - lerp(90, 128, a.lift) + this.sink * 0.2;
  }
  /** Beam end (pan anchor) in world space for pan i. */
  anchor(i: number) {
    const a = this.split > 0.02 ? this.acts[i] : this.acts[0];
    const s = i ? 1 : -1;
    return { x: a.x + Math.cos(a.tilt) * BEAM * s, y: this.beamY(a) + Math.sin(a.tilt) * BEAM * s };
  }
  hurtbox() {
    const a = this.acts[0];
    const base = this.baseOf(a);
    const top = base - 124 + this.sink * 0.6;
    const w = this.split > 0.5 ? 28 : 52;
    const x0 = this.split > 0.5 ? a.x - w : a.x - w / 2;
    return { x: x0, y: top, w, h: base - top + HOVER };
  }
  get cy() {
    return this.baseOf(this.acts[0]) - 62;
  }
  partCx(p: WeigherPart) {
    return p.kind === 'pan' ? this.pans[p.i].x : this.acts[1].x + 14;
  }
  partCy(p: WeigherPart) {
    return p.kind === 'pan' ? this.pans[p.i].y : this.baseOf(this.acts[1]) - 62;
  }
  partBox(p: WeigherPart) {
    if (p.kind === 'pan') {
      const n = this.pans[p.i];
      return { x: n.x - 17, y: n.y - 7, w: 34, h: 14 };
    }
    if (this.split < 0.5) return { x: -999, y: -999, w: 0, h: 0 };
    const a = this.acts[1];
    const base = this.baseOf(a);
    return { x: a.x, y: base - 124, w: 28, h: 124 + HOVER };
  }

  /** Blows on a pan: little harm to him, but enough on a resting pan tips the beam. */
  partHit(p: WeigherPart, h: HitInfo): boolean {
    if (p.kind === 'half') return this.takeHit(h);
    if (!this.fighting || this.invuln > 0 || this.dying || h.dot) return false;
    const n = this.pans[p.i];
    const resting = n.rest > 0 && this.phase >= 2;
    const ok = this.takeHit({ ...h, dmg: h.dmg * (resting ? 0.75 : 0.45), poise: 0, px: n.x, py: n.y });
    if (!ok) return false;
    n.flash = 0.15;
    sfx('scaleClang', { pan: G.world.pan(n.x), vol: 0.45, pitch: rand(1.3, 1.6), gap: 70 });
    if (resting && this.state !== 'kneel' && !this.dying) {
      n.tip += Math.max(10, h.poise) + (h.heavy ? 14 : 0);
      if (n.tip >= TIP_MAX) {
        this.pans[0].tip = this.pans[1].tip = 0;
        G.ui.toast('The balance tips! The Weigher falls to his knees.', 'good');
        fx.flash('#ffe6a8', 0.25);
        this.kneel();
      }
    }
    return true;
  }

  // ------------------------------------------------------------ lifecycle
  private ensureParts() {
    if (this.parts.length) return;
    this.parts = [new WeigherPart(this, 'pan', 0), new WeigherPart(this, 'pan', 1), new WeigherPart(this, 'half', 1)];
    for (const p of this.parts) G.world.add(p);
  }

  updateDormant(dt: number) {
    this.ensureParts();
    this.eyes = approach(this.eyes, 0, dt);
    const a = this.acts[0];
    a.lift = approach(a.lift, 0, dt);
  }

  updateIntro(dt: number) {
    this.ensureParts();
    const t = this.st;
    const a = this.acts[0];
    this.camF.x = this.x - 40;
    this.camF.y = this.y - 92;
    G.camera.focus = this.camF;
    if (t < 0.7) {
      G.camera.addTrauma(dt * 0.3);
    } else if (this.introT === 0) {
      this.introT = 1;
      // Eyes ignite behind the chains.
      sfx('chainRattle', { vol: 0.8 });
      sfx('veilTear', { vol: 0.5, pitch: 0.7 });
      fx.flash('#b04cff', 0.2);
    } else if (t < 1.9) {
      this.eyes = clamp((t - 0.7) / 0.6, 0, 1);
    } else if (this.introT === 1) {
      this.introT = 2;
      // The beam lifts.
      sfx('scaleClang', { vol: 1, pitch: 0.7 });
      sfx('chainRattle', { vol: 0.9, pitch: 0.8 });
      G.camera.addTrauma(0.5 * shakeScale());
    } else if (t < 3.4) {
      a.lift = approach(a.lift, 1, dt * 1.6);
    } else if (this.introT === 2) {
      this.introT = 3;
      sfx('scaleClang', { vol: 1, pitch: 0.5 });
      sfx('bossRoar', { pitch: 0.45, vol: 0.6 });
      fx.ring(this.x, this.y - 110, 12, 300, INK.c, 0.9, 6);
      fx.ring(this.x, this.y - 2, 10, 200, '#ffe6a8', 0.5, 4, 0.25);
      G.camera.addTrauma(0.7 * shakeScale());
      G.ui.banner('THE WEIGHER', this.sub, 'boss');
    } else if (t > 4.2 && this.introT === 3) {
      this.introT = 4;
    } else if (t > 4.6) {
      a.lift = 0.35;
      this.beginFight();
      music.phase = 0;
      this.acts[0].cd = 1.2;
      G.world.after(1.6, () => {
        if (this.fighting) G.ui.banner('MENE', 'Numbered', 'boss');
      });
    }
    if (t >= 3.4) a.lift = approach(a.lift, 0.35, dt);
  }

  updateKneel(dt: number) {
    this.sink = approach(this.sink, 26, dt * 60);
    for (const a of this.acts) {
      a.x = approach(a.x, this.acts[0].x, 400 * dt);
      a.lift = approach(a.lift, 0, dt * 2);
      a.write = approach(a.write, 0, dt * 3);
      a.tilt = approach(a.tilt, 0.45, dt * 1.5);
    }
    this.split = approach(this.split, 0, dt * 4);
    for (const n of this.pans) n.drive = approach(n.drive, 0, dt * 2);
    if (Math.random() < dt * 14) fx.spawn(PK.Smoke, this.x + rand(-26, 26), this.y - rand(10, 90), rand(-10, 10), -30, 1, 3, 10, INK.smoke, -10, 1);
  }

  onKneel() {
    for (const a of this.acts) {
      a.state = 'idle';
      a.atk = null;
    }
    this.spoil();
    // The halves crash back together before he falls.
    if (this.split > 0.1) {
      const mid = (this.acts[0].x + this.acts[1].x) / 2;
      this.acts[0].x = this.acts[1].x = mid;
      sfx('veilTear', { vol: 0.8, pitch: 1.2 });
    }
    this.split = 0;
    sfx('scaleClang', { vol: 1, pitch: 0.6 });
    G.ui.toast('The Weigher kneels. Execute him!', 'good');
  }

  recover() {
    super.recover();
    sfx('chainRattle', { vol: 0.7 });
    for (const a of this.acts) a.cd = 0.9;
    if (this.phase >= 3) this.splitting = true;
  }

  // ------------------------------------------------------------ AI
  think(dt: number) {
    this.ensureParts();
    this.sink = approach(this.sink, 0, dt * 40);
    const p = G.world.player;
    const W = G.world;
    const left = 70, right = W.grid.w * 16 - 70;
    if (this.splitting) this.updateSplit(dt);
    const n = this.split > 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = this.acts[i];
      a.st += dt;
      if (a.state === 'idle') {
        // Hover at a judge's distance; in PERES the halves take their own ground.
        let want: number;
        if (n === 1) want = clamp(p.x + sign(this.homeX - p.x || 1) * 130, left + 60, right - 60);
        else if (i === 0) want = clamp(p.x + (p.x < this.homeX - 120 ? 170 : -170), left, right);
        else want = clamp(p.x + (p.x < this.acts[0].x ? -80 : 80), left, right);
        // The halves keep their sides: the left half stays left of the right one.
        if (n === 2) want = i === 0 ? Math.min(want, this.acts[1].x - 70) : Math.max(want, this.acts[0].x + 70);
        a.vx = approach(a.vx, clamp((want - a.x) * 1.2, -70, 70) * this.spd, 160 * dt);
        a.x += a.vx * dt;
        a.lift = approach(a.lift, this.phase >= 2 ? 0.8 : 0.35, dt);
        a.tilt = approach(a.tilt, (this.pans[1].tip - this.pans[0].tip) / TIP_MAX * 0.5, dt * 2);
        a.write = approach(a.write, 0, dt * 3);
        a.cd -= dt * this.spd;
        if (a.cd <= 0) this.choose(a, i, n, Math.abs(p.x - a.x));
      } else this.runAttack(a, i, dt, n);
    }
    if (n === 1) this.acts[1].x = this.acts[0].x;
    else if (this.acts[0].x > this.acts[1].x - 40) {
      const mid = (this.acts[0].x + this.acts[1].x) / 2;
      this.acts[0].x = Math.max(left, mid - 20);
      this.acts[1].x = Math.min(right, mid + 20);
    }
    this.x = this.acts[0].x;
  }

  private choose(a: Actor, i: number, n: number, dist: number) {
    let pool: WAtk[];
    if (n === 2) pool = i === 0 ? ['letters', 'count', 'letters'] : ['swing', 'hammer', 'hammer'];
    else if (this.phase === 1) pool = dist < 150 ? ['swing', 'swing', 'count', 'letters'] : ['letters', 'count', 'swing'];
    else pool = dist < 150 ? ['hammer', 'both', 'swing', 'count'] : ['hammer', 'both', 'letters', 'count', 'hammer'];
    let k = choose(pool);
    if (k === a.last && Math.random() < 0.6) k = choose(pool);
    this.start(a, i, k);
  }

  private start(a: Actor, i: number, k: WAtk) {
    const p = G.world.player;
    a.atk = k;
    a.last = k;
    a.state = 'attack';
    a.st = 0;
    a.step = 0;
    a.struck = false;
    this.hitSet.clear();
    // A new order: any line this body left unfinished fades.
    for (let j = this.letters.length - 1; j >= 0; j--) if (this.letters[j].owner === i) this.letters.splice(j, 1);
    // The whole judge swings the pan on the player's side.
    if (this.split < 0.5) a.pan = p.x < a.x ? 0 : 1;
    else a.pan = i;
    if (k === 'letters') sfx('glyphBurn', { pan: G.world.pan(a.x), vol: 0.7, pitch: 0.6 });
    if (k === 'swing' || k === 'hammer' || k === 'both') sfx('chainRattle', { pan: G.world.pan(a.x), vol: 0.7 });
  }

  private end(a: Actor, cd: number) {
    a.state = 'idle';
    a.atk = null;
    a.st = 0;
    a.cd = (cd + rand(0, 0.3)) / this.spd;
    for (const n of this.pans) if (n.rest <= 0) n.drive = 0;
  }

  private hit(x: number, y: number, w: number, h: number, mul: number, extra: Partial<HitInfo> = {}) {
    const p = G.world.player;
    const dir = sign(p.x - x - w / 2) || 1;
    return G.world.hitPlayerSide({ x, y, w, h }, { dmg: this.dmg * mul, poise: 40, kx: dir * 240, ky: -220, dir, kind: 'melee', src: this, parryable: false, ...extra }, this.hitSet);
  }

  private runAttack(a: Actor, i: number, dt: number, n: number) {
    const t = a.st;
    const sp = this.spd;
    const W = G.world;
    const p = W.player;
    const fy = this.floorY;
    a.vx = approach(a.vx, 0, 200 * dt);
    a.x += a.vx * dt;
    switch (a.atk) {
      case 'count': {
        // He counts you: numerals across the floor that burst in order.
        a.write = approach(a.write, 1, dt * 4);
        const k = this.phase >= 3 ? 7 : this.phase === 2 ? 6 : 5;
        if (a.step === 0) {
          a.step = 1;
          // The count runs from the player away from him.
          const dir = sign(p.x - a.x) || 1;
          a.tx = clamp(p.x - dir * 30, 40, W.grid.w * 16 - 40 - (k - 1) * 46 * Math.max(0, dir));
        }
        const want = Math.min(k, Math.floor(t / 0.2) + 1);
        while (a.step <= want && a.step <= k) {
          const j = a.step - 1;
          const dir = sign(p.x - a.x) || 1;
          const x = clamp(a.tx + dir * j * 46, 30, W.grid.w * 16 - 30);
          const m = new InkMark(x, fy, this.dmg * 0.85, this, 0.9, 20);
          m.numeral = j + 1;
          W.add(m);
          sfx('glyphBurn', { pan: W.pan(x), vol: 0.5, pitch: 0.8 + j * 0.08 });
          a.step++;
        }
        if (t > k * 0.2 + 0.9) this.end(a, 1.0);
        break;
      }
      case 'letters': {
        // Counterfeit letters in violet ink, written in a line, then loosed one by one.
        a.write = approach(a.write, 1, dt * 4);
        const k = this.phase >= 3 ? 6 : this.phase === 2 ? 6 : 5;
        const hold = 0.45 / Math.min(sp, 1.1);
        const want = Math.min(k, Math.floor(t / 0.12) + 1);
        let mine = 0;
        for (const l of this.letters) if (l.owner === i) mine++;
        if (a.step === 0) {
          while (mine < want) {
            const dir = sign(p.x - a.x) || 1;
            const x = a.x + dir * (34 + mine * 15);
            this.letters.push({ x, y: this.baseOf(a) - 112 + Math.sin(mine * 1.4) * 6, idx: Math.floor(rand(0, 6)), t: 0, owner: i });
            mine++;
            sfx('glyphBurn', { pan: W.pan(x), vol: 0.4, pitch: 1 + mine * 0.05 });
          }
          if (t > k * 0.12 + hold) {
            a.step = 1;
            a.st = 0;
          }
        } else {
          const fire = Math.floor(t / 0.13) + 1;
          while (a.step <= fire) {
            const idx = this.letterOf(i);
            if (idx < 0) break;
            const l = this.letters[idx];
            this.letters.splice(idx, 1);
            const tx = p.x + (p.body.vx || 0) * 0.15, ty = p.y - 16;
            const d = Math.hypot(tx - l.x, ty - l.y) || 1;
            W.add(new Glyph(l.x, l.y, ((tx - l.x) / d) * 250, ((ty - l.y) / d) * 250, this.dmg * 0.42, l.idx, 5.5));
            sfx('glyphBurn', { pan: W.pan(l.x), vol: 0.5, pitch: 1.5 });
            a.step++;
          }
          if (this.letterOf(i) < 0) this.end(a, 1.1);
        }
        break;
      }
      case 'swing': {
        // A pan drawn up and in, then whipped out along the floor in a wide arc.
        const pi = a.pan;
        const pn = this.pans[pi];
        const out = pi ? 1 : -1;
        const tel = 0.8 / sp, act = 0.5;
        const an = this.anchor(pi);
        const R = 108;
        let ang: number;
        if (t < tel) ang = lerp(0.2, 1.0, easeOutCubic(t / tel));
        else if (t < tel + act) {
          ang = lerp(1.0, -1.9, easeInOutSine((t - tel) / act));
          if (!a.struck) {
            a.struck = true;
            this.hitSet.clear();
            sfx('bossSweep', { pan: W.pan(an.x), pitch: 0.6 });
            sfx('chainRattle', { pan: W.pan(an.x), vol: 0.6, pitch: 1.3 });
          }
        } else ang = -1.9;
        // ang is measured from straight down; + swings in toward the body.
        const r = t < tel ? lerp(CHAIN, R, t / tel) : R;
        pn.drive = 1;
        pn.rate = t < tel ? 8 : 30;
        pn.tx = an.x - out * Math.sin(ang) * r;
        pn.ty = Math.min(fy - 8, an.y + Math.cos(ang) * r);
        if (t >= tel && t < tel + act) {
          this.hit(pn.x - 22, pn.y - 12, 44, 24, 1.1, { kx: out * 300, ky: -260, poise: 50 });
          if (pn.y > fy - 20 && Math.random() < dt * 60) fx.spawn(PK.Dust, pn.x, fy - 2, out * 80, -30, 0.5, 3, 8, '#8a7a6a', -10, 2);
        }
        a.tilt = approach(a.tilt, -out * 0.25, dt * 3);
        if (t > tel + act + 0.55 / sp) this.end(a, 1.0);
        break;
      }
      case 'hammer': case 'both': {
        // Rigid chains: a pan rises over a marked spot, then slams; both at once makes waves.
        const both = a.atk === 'both';
        const reps = both ? 1 : n === 2 ? 2 : this.phase >= 2 ? 3 : 2;
        const tel = (a.step === 0 ? 0.9 : 0.62) / sp;
        const slam = 0.12, rest = both ? 0.95 : 0.6;
        const cyc = tel + slam + rest;
        const k = Math.floor(t / cyc);
        const u = t - k * cyc;
        if (k >= reps) {
          this.end(a, both ? 1.2 : 0.9);
          break;
        }
        const pis = both ? [0, 1] : [n === 2 ? i : (a.pan + k) % 2];
        if (k !== a.step) {
          a.step = k;
          a.struck = false;
        }
        for (let q = 0; q < pis.length; q++) {
          const pi = pis[q];
          const pn = this.pans[pi];
          if (u < dt * 1.5 || pn.drive === 0) {
            pn.tx = clamp(both ? p.x + (q ? 52 : -52) : p.x, 40, W.grid.w * 16 - 40);
            pn.ty = fy - 130;
            pn.drive = 1;
          }
          if (u < tel) {
            pn.rate = 6;
            pn.ty = fy - 130;
            if (u < tel * 0.6) pn.tx = approach(pn.tx, clamp(both ? p.x + (q ? 52 : -52) : p.x, 40, W.grid.w * 16 - 40), 160 * dt);
          } else {
            pn.rate = 40;
            pn.ty = fy - 7;
          }
        }
        this.rigid = approach(this.rigid, 1, dt * 3);
        a.lift = approach(a.lift, 1, dt * 3);
        if (u >= tel + slam * 0.6 && !a.struck) {
          a.struck = true;
          this.hitSet.clear();
          for (const pi of pis) {
            const pn = this.pans[pi];
            pn.rest = rest;
            const x = pn.tx;
            this.hit(x - 26, fy - 34, 52, 34, both ? 1.15 : 1.0, { unblockable: true, ky: -300, poise: 60 });
            fx.dust(x, fy, 18, 2.2, '#8a7a6a');
            fx.ring(x, fy - 2, 6, 80, '#ffe6a8', 0.4, 3, 0.25);
            if (both) {
              W.add(new Proj('wave', x + 18, fy, 'enemy', this.dmg * 0.5, { vx: 250, life: 1.7, w: 16, h: 26, color: '#d8a8ff', big: true }));
              W.add(new Proj('wave', x - 18, fy, 'enemy', this.dmg * 0.5, { vx: -250, life: 1.7, w: 16, h: 26, color: '#d8a8ff', big: true }));
            }
          }
          sfx('scaleClang', { pan: W.pan(this.pans[pis[0]].tx), vol: 1, pitch: both ? 0.55 : 0.75 });
          sfx('bossSlam', { pan: W.pan(this.pans[pis[0]].tx), vol: 0.7, pitch: 0.8 });
          G.camera.addTrauma((both ? 0.7 : 0.45) * shakeScale());
        }
        break;
      }
    }
  }

  private letterOf(owner: number) {
    for (let j = 0; j < this.letters.length; j++) if (this.letters[j].owner === owner) return j;
    return -1;
  }

  /** Spoil the letters still hanging (struck down or torn apart). */
  private spoil() {
    for (const l of this.letters) fx.spawn(PK.Smoke, l.x, l.y, rand(-10, 10), -20, 0.5, 3, 9, INK.smoke, -10, 1);
    this.letters.length = 0;
  }

  /** PERES: the halves tear apart (or come back together after a kneel). */
  private updateSplit(dt: number) {
    const a0 = this.acts[0], a1 = this.acts[1];
    if (this.split < 1) {
      this.split = approach(this.split, 1, dt * 1.2);
      const mid = (a0.x + a1.x) / 2;
      a0.x = approach(a0.x, mid - 50 * this.split, 120 * dt);
      a1.x = approach(a1.x, mid + 50 * this.split, 120 * dt);
      if (Math.random() < dt * 40) fx.spawn(PK.Spark, mid + rand(-4, 4), this.y - rand(20, 120), rand(-60, 60), rand(-40, 40), 0.4, 1.6, 0.3, INK.hot, 0, 1);
    } else this.splitting = false;
  }

  // ------------------------------------------------------------ phases
  beginTransition() {
    this.state = 'transition';
    this.st = 0;
    this.phase = 2;
    this.introT = 0;
    this.maxPoise = this.poise = 960;
    for (const a of this.acts) {
      a.state = 'idle';
      a.atk = null;
    }
    this.spoil();
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.5, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  updateTransition(dt: number) {
    const t = this.st;
    const a = this.acts[0];
    this.camF.x = this.x;
    this.camF.y = this.y - 90;
    G.camera.focus = this.camF;
    for (const n of this.pans) n.drive = approach(n.drive, 0, dt * 3);
    if (this.phase === 2) {
      // TEKEL: the beam rises and the chains go rigid.
      a.lift = approach(a.lift, 1, dt * 1.2);
      a.tilt = Math.sin(t * 5) * 0.2 * Math.max(0, 1 - t / 1.6);
      if (t > 1.2 && this.introT === 0) {
        this.introT = 1;
        sfx('chainRattle', { vol: 1, pitch: 0.7 });
        sfx('scaleClang', { vol: 1, pitch: 0.6 });
        fx.flash('#ffe6a8', 0.25);
        G.camera.addTrauma(0.6 * shakeScale());
        music.phase = 1;
        G.ui.banner('TEKEL', 'Weighed', 'boss');
      }
      if (t > 1.2) this.rigid = approach(this.rigid, 1, dt * 2);
      if (t > 3.0) this.endTransition();
    } else {
      // PERES: he tears down the middle.
      if (this.introT === 0) {
        this.introT = 1;
        sfx('veilTear', { vol: 1 });
        fx.flash('#b04cff', 0.35);
        G.camera.addTrauma(0.8 * shakeScale());
        music.phase = 2;
        G.ui.banner('PERES', 'Divided', 'boss');
        this.acts[1].x = this.acts[0].x;
        this.acts[1].lift = this.acts[0].lift;
        this.splitting = true;
      }
      this.updateSplit(dt);
      if (t > 2.4) this.endTransition();
    }
  }

  private endTransition() {
    this.state = 'idle';
    this.st = 0;
    for (const a of this.acts) a.cd = 0.6;
    G.inCutscene = false;
    G.ui.cinematicBars(false);
    G.camera.focus = null;
  }

  enterPhase3() {
    // A short cinematic of its own: the tearing.
    this.phase = 3;
    this.state = 'transition';
    this.st = 0;
    this.introT = 0;
    this.maxPoise = this.poise = 1000;
    for (const a of this.acts) {
      a.state = 'idle';
      a.atk = null;
    }
    this.spoil();
    G.inCutscene = true;
    G.ui.cinematicBars(true);
    G.world.slowmo(0.4, 0.4);
    for (const e of G.world.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
  }

  die() {
    super.die();
    for (const a of this.acts) {
      a.state = 'idle';
      a.atk = null;
    }
    this.spoil();
    this.introT = 0;
  }

  /** Straight to the beaten, kneeling state (a reload after the fight). */
  yieldNow() {
    this.ensureParts();
    this.state = 'dead';
    this.dying = true;
    this.yielded = true;
    this.phase = 3;
    this.introT = 9;
    this.st = 9;
    this.invuln = 999;
    this.split = 0;
    this.sink = 26;
    this.eyes = 0.4;
    for (const a of this.acts) {
      a.x = this.x;
      a.lift = 0;
      a.tilt = 0.45;
    }
  }

  updateDeath(dt: number) {
    const t = this.st;
    this.defeatT = t;
    if (this.fallT >= 0) {
      this.updateFall(dt);
      return;
    }
    const a0 = this.acts[0], a1 = this.acts[1];
    // The halves come back together; he sinks to his knees.
    const mid = (a0.x + a1.x) / 2;
    a0.x = approach(a0.x, mid, 160 * dt);
    a1.x = approach(a1.x, mid, 160 * dt);
    this.x = a0.x;
    this.split = approach(this.split, 0, dt * 2);
    for (const n of this.pans) n.drive = approach(n.drive, 0, dt * 3);
    this.rigid = approach(this.rigid, 0, dt);
    if (!this.yielded) {
      this.camF.x = this.x;
      this.camF.y = this.y - 80;
      G.camera.focus = this.camF;
    }
    for (const a of this.acts) {
      a.lift = approach(a.lift, 0, dt);
      a.tilt = approach(a.tilt, 0.45, dt * 0.6);
      a.write = 0;
    }
    if (t < 1.2) {
      if (this.introT === 0 && t > 0.1) {
        this.introT = 1;
        sfx('veilTear', { vol: 0.8, pitch: 0.6 });
      }
      if (Math.random() < dt * 30) fx.spawn(PK.Smoke, this.x + rand(-28, 28), this.y - rand(20, 120), rand(-30, 30), -40, 1, 3, 12, INK.smoke, -20, 1);
    } else {
      this.sink = approach(this.sink, 26, dt * 30);
      if (this.introT === 1) {
        this.introT = 2;
        sfx('scaleClang', { vol: 1, pitch: 0.5 });
        G.camera.addTrauma(0.5 * shakeScale());
        fx.dust(this.x, this.y, 24, 2.4, '#8a7a6a');
      }
      this.eyes = approach(this.eyes, 0.4, dt * 0.5);
      if (t > 2.8 && !this.yielded) {
        this.yielded = true;
        this.introT = 9;
        G.camera.focus = null;
        G.world.onBossDefeated(this);
      }
    }
  }

  /**
   * The end of the Weigher: the beam tips and falls, the pans crash down, the
   * Veil pours out of him, and he comes apart into smoke and settling gold.
   * Resolves after about 4.6 s (8 s at most).
   */
  fall(): Promise<void> {
    if (this.fallT >= 0) return Promise.resolve();
    if (!this.dying) this.yieldNow();
    this.fallT = 0;
    this.introT = 20;
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.fallDone = finish;
      setTimeout(finish, 8000);
    });
  }

  private updateFall(dt: number) {
    const t = (this.fallT += dt);
    const a = this.acts[0];
    const fy = this.floorY;
    this.camF.x = this.x;
    this.camF.y = this.y - 70;
    G.camera.focus = this.camF;
    if (t < 0.9) {
      // The beam tips hard; the chains give way.
      a.tilt = approach(a.tilt, 0.95, dt * 2);
      if (this.introT === 20 && t > 0.5) {
        this.introT = 21;
        sfx('chainRattle', { vol: 1, pitch: 1.2 });
        for (let i = 0; i < 2; i++) {
          const n = this.pans[i];
          n.drive = 1;
          n.rate = 14;
          n.tx = n.x + (i ? 24 : -24);
          n.ty = fy - 6;
        }
      }
    } else if (this.introT === 21) {
      this.introT = 22;
      // The pans crash; the beam falls from his hands.
      sfx('scaleClang', { vol: 1, pitch: 0.5 });
      sfx('scaleClang', { vol: 0.8, pitch: 0.7 });
      G.camera.addTrauma(0.6 * shakeScale());
      for (const n of this.pans) {
        fx.dust(n.tx, fy, 14, 2, '#8a7a6a');
        fx.shards(n.tx, fy - 4, 6, BRONZE, 1);
      }
      this.beamDrop = 0.001;
      this.dropX = a.x;
      this.dropY = this.beamY(a);
      this.dropR = a.tilt;
      this.crownDrop = 0.001;
      this.crownX = a.x;
      this.crownY = this.baseOf(a) - 116;
    } else if (t < 4.4) {
      if (this.beamDrop > 0 && this.beamDrop < 1) {
        this.beamDrop = Math.min(1, this.beamDrop + dt * 1.8);
        const u = easeInQuad(this.beamDrop);
        this.dropY = lerp(this.dropY, fy - 3, u);
        this.dropR = lerp(this.dropR, 0.04, u);
        if (this.beamDrop >= 1) {
          sfx('scaleClang', { vol: 1, pitch: 0.4 });
          G.camera.addTrauma(0.4 * shakeScale());
          fx.dust(this.dropX, fy, 26, 2.6, '#8a7a6a');
        }
      }
      if (this.crownDrop > 0 && this.crownDrop < 1) {
        this.crownDrop = Math.min(1, this.crownDrop + dt * 1.1);
        this.crownY = lerp(this.crownY, fy - 6, easeInQuad(this.crownDrop));
        this.crownX += dt * 30;
        if (this.crownDrop >= 1) sfx('scaleClang', { vol: 0.5, pitch: 1.4 });
      }
      // The Veil pours out of him; gold settles like dust.
      this.fade = approach(this.fade, 0, dt * 0.45);
      if (this.introT === 22 && t > 1.3) {
        this.introT = 23;
        sfx('veilTear', { vol: 1, pitch: 0.5 });
      }
      const tier = G.renderer.tier;
      if (Math.random() < dt * (tier >= 2 ? 60 : 25)) fx.spawn(PK.Smoke, a.x + rand(-26, 26), this.y - rand(10, 120) * this.fade, rand(-30, 30), rand(-120, -50), rand(1, 1.8), 4, 16, Math.random() < 0.5 ? INK.smoke : '#4a1a70', -30, 1);
      if (Math.random() < dt * (tier >= 2 ? 40 : 16)) fx.spawn(PK.Petal, a.x + rand(-30, 30), this.y - rand(30, 130), rand(-20, 20), rand(0, 30), rand(1.2, 2), rand(0.8, 1.6), 0.6, Math.random() < 0.6 ? GOLD : GOLD_HI, 160, 1.5);
    }
    if (t > 4.6 && this.fallDone) {
      const d = this.fallDone;
      this.fallDone = null;
      d();
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt: number) {
    for (const a of this.acts) a.write = approach(a.write, a.atk === 'letters' || a.atk === 'count' ? 1 : 0, dt * 3);
    if (this.fighting || this.state === 'transition') this.eyes = approach(this.eyes, 1, dt);
    if (this.phase < 2 && this.state !== 'transition') this.rigid = approach(this.rigid, 0, dt);
    // Pans: pendulums on their chains, unless an attack drives them.
    for (let i = 0; i < 2; i++) {
      const n = this.pans[i];
      n.rest = Math.max(0, n.rest - dt);
      n.flash = Math.max(0, n.flash - dt);
      n.tip = Math.max(0, n.tip - dt * 10);
      const an = this.anchor(i);
      const ox = n.x, oy = n.y;
      if (n.drive > 0.5 || this.beamDrop > 0) {
        const k = Math.min(1, dt * n.rate);
        n.x += (n.tx - n.x) * k;
        n.y += (n.ty - n.y) * k;
      } else {
        // Verlet swing, then hold the chain's length.
        const vx = (n.x - n.px) * 0.985, vy = (n.y - n.py) * 0.985;
        n.x += vx;
        n.y += vy + 900 * dt * dt;
        const dx = n.x - an.x, dy = n.y - an.y;
        const d = Math.hypot(dx, dy) || 1;
        const L = lerp(n.drive > 0 ? d : CHAIN, CHAIN, 0.2);
        n.x = an.x + (dx / d) * L;
        n.y = an.y + (dy / d) * L;
        n.y = Math.min(n.y, this.floorY - 6);
      }
      n.px = ox;
      n.py = oy;
    }
    for (const l of this.letters) {
      l.t += dt;
      l.y += Math.sin(l.t * 5 + l.idx) * 3 * dt;
    }
  }

  // ------------------------------------------------------------ rendering
  draw(ctx: Ctx) {
    // Pan slam marks on the floor.
    for (const a of this.acts) {
      if (a.state !== 'attack' || (a.atk !== 'hammer' && a.atk !== 'both')) continue;
      for (const n of this.pans) {
        if (n.drive < 0.5 || n.rest > 0 || n.ty > this.floorY - 20) continue;
        this.floorMark(ctx, n.tx, this.floorY, 30, 1 - (n.y - (this.floorY - 140)) / 140, '#d8a8ff');
      }
    }
    if (this.fade > 0.01) {
      if (this.split > 0.02) {
        this.drawFigure(ctx, this.acts[0], -1);
        this.drawFigure(ctx, this.acts[1], 1);
      } else this.drawFigure(ctx, this.acts[0], 0);
    }
    // Beam (fallen) and crown (fallen).
    if (this.beamDrop > 0) this.drawBeam(ctx, this.dropX, this.dropY, this.dropR, 0, 1);
    if (this.crownDrop > 0) this.drawCrown(ctx, this.crownX, this.crownY, this.crownDrop * 1.4, 1);
    // Chains and pans.
    for (let i = 0; i < 2; i++) this.drawPan(ctx, i);
    // The line of letters, hanging.
    for (let i = 0; i < this.letters.length; i++) {
      const l = this.letters[i];
      const owner = this.acts[l.owner];
      const hold = owner.atk === 'letters' && owner.step === 0 && owner.st > 0.4;
      drawGlyph(ctx, l.x, l.y, 5.5, l.idx, Math.min(1, l.t * 5), hold ? 0.6 + Math.sin(G.time * 24 + i) * 0.4 : 0.3);
    }
    // Tells.
    for (const a of this.acts) {
      if (a.state !== 'attack') continue;
      if (a.atk === 'swing' && a.st < 0.8 / this.spd) {
        const n = this.pans[a.pan];
        this.glint(ctx, n.x, n.y, '#ffcf6b', 1.1);
      }
    }
    if (this.flash > 0 && this.fade > 0.5) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.cy, 80, '#ffffff', this.flash * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.staggerFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.cy, 100, '#ffffff', this.staggerFlash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** The judge (or one half of him: side -1 left, 1 right) in local space, feet of the smoke at 0. */
  private drawFigure(ctx: Ctx, a: Actor, side: number) {
    const base = this.baseOf(a);
    const shaded = shadeable(ROBE);
    const fine = G.renderer.tier >= 2;
    const t = G.time + a.bob;
    ctx.save();
    ctx.translate(a.x, base);
    if (side !== 0) {
      // Each half keeps its own side of the body; the torn edge glows.
      ctx.beginPath();
      ctx.rect(side < 0 ? -200 : 0, -300, 200, 340);
      ctx.clip();
    }
    if (this.fade < 1) ctx.globalAlpha = this.fade;
    // Smoke skirt.
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -6, 34, INK.c, 0.28);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 7; i++) {
      const ox = -15 + i * 5;
      const w = Math.sin(t * 2.2 + i * 1.3) * 4;
      glow(ctx, ox + w, -4 + Math.sin(t * 3 + i) * 2, 9, INK.smoke, 0.85);
    }
    ctx.strokeStyle = '#3a1450';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ox = -12 + i * 6;
      ctx.moveTo(ox, -20);
      ctx.quadraticCurveTo(ox + Math.sin(t * 2.6 + i) * 6, -8, ox + Math.sin(t * 1.9 + i * 1.7) * 9, 4 + (i % 2) * 3);
    }
    ctx.stroke();
    // Robe: a bell of purple banded in gold.
    poly(ctx, [-31, -22, 31, -22, 26, -40, 16, -62, -16, -62, -26, -40], shaded ? grad(ctx, 'robe', (c) => { const g = c.createLinearGradient(-30, 0, 30, 0); g.addColorStop(0, ROBE_DK); g.addColorStop(0.35, ROBE); g.addColorStop(0.62, shade(ROBE, 0.18)); g.addColorStop(1, ROBE_DK); return g; }) : ROBE, OUT, 1.3);
    poly(ctx, [-7, -62, 7, -62, 9, -22, -9, -22], shaded ? grad(ctx, 'panel', (c) => { const g = c.createLinearGradient(-9, 0, 9, 0); g.addColorStop(0, '#8a6420'); g.addColorStop(0.4, GOLD_HI); g.addColorStop(0.6, GOLD); g.addColorStop(1, '#7a5418'); return g; }) : GOLD, OUT, 0.9);
    if (fine) {
      ctx.strokeStyle = ROBE_DK;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let y = -56; y < -26; y += 8) {
        ctx.moveTo(0, y - 3);
        ctx.lineTo(4, y);
        ctx.lineTo(0, y + 3);
        ctx.lineTo(-4, y);
        ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.fillStyle = GOLD;
    ctx.fillRect(-31, -25, 62, 3);
    // Fringe of the hem.
    if (fine) {
      ctx.strokeStyle = '#e8c070';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let x = -30; x <= 30; x += 3) {
        ctx.moveTo(x, -22);
        ctx.lineTo(x + Math.sin(t * 3 + x) * 0.6, -18);
      }
      ctx.stroke();
    }
    // Torso and the broad gold collar.
    poly(ctx, [-16, -62, 16, -62, 24, -84, 14, -90, -14, -90, -24, -84], shaded ? grad(ctx, 'torso', (c) => vGrad(c, ROBE, -90, -62, 0.2, -0.3)) : ROBE, OUT, 1.2);
    ctx.beginPath();
    ctx.ellipse(0, -88, 18, 13, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = shaded ? grad(ctx, 'collar', (c) => vGrad(c, GOLD, -88, -75, 0.4, -0.3)) : GOLD;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#8a5a18';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(0, -88, 13, 8.5, 0, 0.15, Math.PI - 0.15);
    ctx.moveTo(-8, -82);
    ctx.ellipse(0, -88, 8.5, 5, 0, 0.3, Math.PI - 0.3);
    ctx.stroke();
    // The beam across the shoulders (or held aloft), behind the hands and head.
    const by = this.beamY(a) - base;
    if (this.beamDrop <= 0) this.drawBeam(ctx, 0, by, a.tilt, side, a.lift > 0.6 ? 0 : 1);
    // Arms up to the beam; the writing hand leaves it.
    const ct = Math.cos(a.tilt), stt = Math.sin(a.tilt);
    for (const s of [-1, 1]) {
      const sx = s * 22, sy = -84;
      const writing = s === 1 && a.write > 0.05;
      let hx = s * 30 * ct, hy = by + s * 30 * stt;
      if (writing) {
        const p = G.world.player;
        const dir = sign(p.x - a.x) || 1;
        hx = lerp(hx, dir * 44, a.write);
        hy = lerp(hy, -104 + Math.sin(G.time * 14) * 3, a.write);
      }
      const ex = (sx + hx) / 2 + s * (10 - a.lift * 4), ey = (sy + hy) / 2 + 8 - a.lift * 6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(ex, ey, hx, hy);
      ctx.stroke();
      ctx.strokeStyle = ROBE;
      ctx.lineWidth = 8.6;
      ctx.stroke();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(lerp(ex, hx, 0.7), lerp(ey, hy, 0.7) - 0.5);
      ctx.lineTo(lerp(ex, hx, 0.82), lerp(ey, hy, 0.82) - 0.5);
      ctx.stroke();
      ellipse(ctx, hx, hy, 4.4, 4.4, 0, '#6a4a5a');
      if (writing) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, hx, hy, 9, INK.c, a.write);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // Head: a crown, and a curtain of gold chains over a face of violet light.
    {
      const hy = -104 + a.lift * 2;
      const turn = clamp((G.world.player.x - a.x) / 200, -1, 1) * 2;
      ellipse(ctx, turn * 0.4, hy, 12, 13.5, 0, '#14081c');
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(turn * 0.4, hy, 12, 13.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, turn, hy + 1, 16, INK.c, 0.55 + this.eyes * 0.3);
      if (this.eyes > 0.02) {
        const ec = this.phase >= 3 && !this.dying ? '#ff5adc' : '#f0c8ff';
        glow(ctx, -4.4 + turn, hy - 1.5, 4 + this.eyes * 2.4, ec, this.eyes);
        glow(ctx, 4.4 + turn, hy - 1.5, 4 + this.eyes * 2.4, ec, this.eyes);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = this.eyes;
        ctx.fillRect(-5.6 + turn, hy - 2, 2.4, 1);
        ctx.fillRect(3.2 + turn, hy - 2, 2.4, 1);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      // A curtain of gold chains hangs from the crown's brim over the whole face.
      ctx.strokeStyle = '#c99a3a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const x = -10.8 + i * 2.4 + turn * 0.5;
        const sw = Math.sin(t * 1.6 + i) * 0.7;
        ctx.moveTo(x, hy - 10);
        ctx.lineTo(x + sw, hy + 11 + (i % 2) * 2.5 - Math.abs(i - 4.5) * 0.6);
      }
      ctx.stroke();
      if (fine) {
        ctx.fillStyle = GOLD_HI;
        for (let i = 0; i < 10; i++) {
          const x = -10.8 + i * 2.4 + turn * 0.5;
          for (let k = 0; k < 4; k++) ctx.fillRect(x - 0.6, hy - 7 + k * 5 + (i % 2) * 1.5, 1.2, 1.2);
        }
      }
      ctx.save();
      ctx.translate(turn * 0.4, hy - 10);
      ctx.scale(1.25, 1.25);
      if (this.crownDrop <= 0) this.drawCrown(ctx, 0, 0, 0, 0);
      ctx.restore();
    }
    if (side !== 0) {
      // The torn edge: violet light down the cut.
      ctx.globalCompositeOperation = 'lighter';
      for (let y = -120; y < 0; y += 16) glow(ctx, 0, y + Math.sin(t * 4 + y) * 2, 10, INK.c, 0.7);
      ctx.strokeStyle = INK.hot;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -128);
      for (let y = -120; y <= 0; y += 8) ctx.lineTo(Math.sin(y * 0.7 + t * 8) * 1.6, y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A tall crown of gold with stepped points. x, y at the brim. */
  private drawCrown(ctx: Ctx, x: number, y: number, rot: number, fallen: number) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    const shaded = shadeable(GOLD);
    poly(ctx, [-11, 0, 11, 0, 12, -10, 8, -10, 7, -16, 3.5, -12, 0, -19, -3.5, -12, -7, -16, -8, -10, -12, -10], shaded ? grad(ctx, 'crown', (c) => { const g = c.createLinearGradient(-12, -19, 12, 0); g.addColorStop(0, '#8a6420'); g.addColorStop(0.3, GOLD_HI); g.addColorStop(0.55, GOLD); g.addColorStop(1, '#6a4410'); return g; }) : GOLD, OUT, 1);
    ctx.fillStyle = '#8a5a18';
    ctx.fillRect(-11, -3.2, 22, 1.2);
    ellipse(ctx, 0, -6.5, 1.8, 1.8, 0, fallen ? '#6a3a8a' : '#c45cff');
    if (!fallen) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -6.5, 5, INK.c, 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /** The bronze beam: side -1 or 1 draws only that half (torn in PERES). */
  private drawBeam(ctx: Ctx, x: number, y: number, tilt: number, side: number, fallen: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const x0 = side > 0 ? 0 : -BEAM - 4, x1 = side < 0 ? 0 : BEAM + 4;
    const shaded = shadeable(BRONZE);
    ctx.fillStyle = shaded ? grad(ctx, 'beam', (c) => vGrad(c, BRONZE, -4, 4, 0.45, -0.4)) : BRONZE;
    ctx.beginPath();
    ctx.rect(x0, -3.4, x1 - x0, 6.8);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,180,0.5)';
    ctx.fillRect(x0 + 2, -2.4, x1 - x0 - 4, 1);
    // Knobs at the ends, and the pointer over the pivot.
    for (const s of [-1, 1]) {
      if (side && s !== side) continue;
      ellipse(ctx, s * (BEAM + 2), 0, 5, 5, 0, shaded ? grad(ctx, 'knob', (c) => vGrad(c, BRONZE, -5, 5, 0.45, -0.4)) : BRONZE);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s * (BEAM + 2), 0, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!side && !fallen) {
      poly(ctx, [-3, -3, 3, -3, 0, -16], GOLD, OUT, 0.8);
      ellipse(ctx, 0, 0, 4, 4, 0, GOLD);
    }
    ctx.restore();
  }

  private drawPan(ctx: Ctx, i: number) {
    const n = this.pans[i];
    const attached = this.beamDrop <= 0;
    const an = this.anchor(i);
    if (attached && this.fade > 0.05) {
      // Chains: slack links, or bars of gold when rigid.
      const rig = this.rigid;
      ctx.lineWidth = 1 + rig * 1.2;
      ctx.strokeStyle = rig > 0.5 ? '#ffd88a' : '#a8803a';
      ctx.beginPath();
      for (const s of [-1, 0, 1]) {
        ctx.moveTo(an.x, an.y + 4);
        ctx.lineTo(n.x + s * 13, n.y - 2);
      }
      ctx.stroke();
      if (rig > 0.3) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = rig * 0.5;
        ctx.strokeStyle = '#ffe6a8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(an.x, an.y + 4);
        ctx.lineTo(n.x, n.y - 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // The pan: a broad, shallow bowl of bronze.
    ctx.save();
    ctx.translate(n.x, n.y);
    const lean = attached ? clamp((n.x - an.x) / 120, -0.4, 0.4) : 0;
    ctx.rotate(-lean * 0.4);
    const shaded = shadeable(BRONZE);
    poly(ctx, [-17, -2, 17, -2, 12, 4, 5, 6.5, -5, 6.5, -12, 4], shaded ? grad(ctx, 'pan', (c) => vGrad(c, BRONZE, -3, 7, 0.45, -0.45)) : BRONZE, OUT, 1.1);
    ellipse(ctx, 0, -2, 17, 2.4, 0, shaded ? grad(ctx, 'panrim', (c) => vGrad(c, '#e0b060', -3, 1, 0.3, -0.3)) : '#e0b060');
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, -2, 17, 2.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Tipping shows as a violet charge in the bowl.
    if (n.tip > 0 || n.flash > 0 || n.rest > 0) {
      ctx.globalCompositeOperation = 'lighter';
      if (n.tip > 0) glow(ctx, 0, 0, 10 + (n.tip / TIP_MAX) * 18, '#ffe6a8', 0.25 + (n.tip / TIP_MAX) * 0.6);
      if (n.flash > 0) glow(ctx, 0, 0, 24, '#ffffff', n.flash * 4);
      if (n.rest > 0 && this.phase >= 2 && this.fighting) glow(ctx, 0, 1, 18, '#ffcf6b', 0.25 + Math.sin(G.time * 12) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  drawOverlay(ctx: Ctx) {
    if (this.state === 'kneel') {
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.7 + Math.sin(G.time * 10) * 0.3;
      const y = this.y - 130;
      glow(ctx, this.x, y, 16, '#ffe6a8', 0.7 * p);
      ctx.strokeStyle = rgba('#fff6dc', p);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.x, y - 8); ctx.lineTo(this.x + 6, y); ctx.lineTo(this.x, y + 8); ctx.lineTo(this.x - 6, y); ctx.closePath();
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.fade > 0.05) {
      lighting.add(this.x, this.y - 70, 150, '#c890ff', 0.35 * this.fade, 0.25);
      if (this.eyes > 0.05) lighting.add(this.x, this.y - 112, 50, INK.c, 0.6 * this.eyes * this.fade, 0.6);
      if (this.split > 0.5) lighting.add(this.acts[1].x, this.y - 70, 110, '#c890ff', 0.35, 0.25);
    }
    for (const l of this.letters) lighting.add(l.x, l.y, 36, INK.c, 0.5, 0.5);
  }
}

