// The Horde's foes: pooled sprites from the original's sheets, moved by hand (no physics bodies, so hundreds stay
// cheap), kept apart by a spatial hash, and their shots. Weapons find their targets through the same hash.
import Phaser from 'phaser';
import { FOES, type FoeKind } from './defs';
import type { Horde } from '../../scenes/Horde';

export interface Foe {
  i: number;
  kind: FoeKind;
  id: string;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  x: number; y: number;
  /** Knockback, decaying. */
  kx: number; ky: number;
  hp: number; maxHp: number;
  dmg: number; speed: number; xp: number;
  r: number; mass: number;
  alive: boolean;
  elite: boolean;
  slowT: number; slowK: number;
  flashT: number;
  /** Attack timer and state: lunges and shots wind up first. */
  atkT: number; state: 0 | 1 | 2; st: number; dx: number; dy: number;
  face: number;
  animT: number;
  /** Per-weapon re-hit timers (orbs, ground, frost), keyed by weapon slot. */
  hitBy: Float32Array;
}

export const MAX_FOES = 260;
const CELL = 32, BUCKETS = 4096;
const SHOTS = 64;

export class Swarm {
  readonly list: Foe[] = [];
  /** Live count (the pool keeps the dead). */
  count = 0;
  private head = new Int32Array(BUCKETS);
  private next = new Int32Array(MAX_FOES);
  private shots: { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; t: number; dmg: number }[] = [];

  constructor(private h: Horde) {
    for (let i = 0; i < MAX_FOES; i++) {
      const shadow = h.wl(h.add.image(0, 0, 'hz-shadow').setVisible(false).setAlpha(0.8));
      const img = h.wl(h.add.image(0, 0, 'foes-ashen', 0).setVisible(false));
      this.list.push({ i, kind: FOES.husk, id: 'husk', img, shadow, x: 0, y: 0, kx: 0, ky: 0, hp: 0, maxHp: 0, dmg: 0, speed: 0, xp: 0, r: 8, mass: 1, alive: false, elite: false, slowT: 0, slowK: 1, flashT: 0, atkT: 0, state: 0, st: 0, dx: 0, dy: 0, face: 1, animT: 0, hitBy: new Float32Array(12) });
    }
    for (let i = 0; i < SHOTS; i++) this.shots.push({ img: h.wl(h.add.image(0, 0, 'hz-shot').setVisible(false).setBlendMode(Phaser.BlendModes.ADD)), x: 0, y: 0, vx: 0, vy: 0, t: -1, dmg: 0 });
  }

  /** A foe of `id` at (x, y), with health and damage for the stage; null when the pool is full. */
  spawn(id: string, x: number, y: number, hpMult: number, dmgMult: number, elite = false): Foe | null {
    const f = this.list.find((e) => !e.alive);
    if (!f) return null;
    const k = FOES[id] ?? FOES.husk;
    f.kind = k; f.id = id; f.x = x; f.y = y; f.kx = f.ky = 0;
    f.maxHp = f.hp = k.hp * hpMult * (elite ? 14 : 1);
    f.dmg = k.dmg * dmgMult * (elite ? 1.6 : 1);
    f.speed = k.speed * (0.9 + Math.random() * 0.2) * (elite ? 0.9 : 1);
    f.xp = k.xp * (elite ? 20 : 1);
    f.r = k.r * (elite ? 1.6 : 1); f.mass = k.mass * (elite ? 6 : 1);
    f.alive = true; f.elite = elite; f.slowT = 0; f.slowK = 1; f.flashT = 0;
    f.atkT = 1 + Math.random() * 2; f.state = 0; f.st = 0; f.face = 1; f.animT = Math.random();
    f.hitBy.fill(0);
    const scale = k.scale * (elite ? 1.6 : 1);
    f.img.setTexture(k.sheet, k.row * 4).setOrigin(k.ox / 96, k.oy / 96).setScale(scale).setVisible(true).setAlpha(1).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    if (elite) f.img.setTint(0xffe2a0).setTintMode(Phaser.TintModes.MULTIPLY);
    f.shadow.setVisible(true).setScale(scale * 1.2 * (k.r / 9), scale * 1.1);
    this.count++;
    return f;
  }

  kill(f: Foe) {
    if (!f.alive) return;
    f.alive = false;
    f.img.setVisible(false); f.shadow.setVisible(false);
    this.count--;
  }

  clear() {
    for (const f of this.list) if (f.alive) this.kill(f);
    for (const s of this.shots) { s.t = -1; s.img.setVisible(false); }
  }

  // ---------------------------------------------------------------- the spatial hash

  private bucket(x: number, y: number) { return (((Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663)) >>> 0) % BUCKETS; }

  private rebuild() {
    this.head.fill(-1);
    for (const f of this.list) {
      if (!f.alive) continue;
      const b = this.bucket(f.x, f.y);
      this.next[f.i] = this.head[b]; this.head[b] = f.i;
    }
  }

  /** Every live foe within `r` of (x, y), handed to `fn` (no allocation); `fn` returning true stops the search. */
  near(x: number, y: number, r: number, fn: (f: Foe, d2: number) => boolean | void) {
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL), c0y = Math.floor((y - r) / CELL), c1y = Math.floor((y + r) / CELL), r2 = r * r;
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      let i = this.head[(((cx * 73856093) ^ (cy * 19349663)) >>> 0) % BUCKETS];
      while (i >= 0) {
        const f = this.list[i];
        // Buckets are shared by distant cells; the distance check settles it.
        if (f.alive && Math.floor(f.x / CELL) === cx && Math.floor(f.y / CELL) === cy) {
          const d2 = (f.x - x) ** 2 + (f.y - y) ** 2;
          if (d2 <= r2 + f.r * f.r && fn(f, d2)) return;
        }
        i = this.next[i];
      }
    }
  }

  /** The live foe nearest (x, y) within `r`, or null. */
  nearest(x: number, y: number, r: number, skip?: (f: Foe) => boolean): Foe | null {
    let best: Foe | null = null, bd = Infinity;
    this.near(x, y, r, (f, d2) => { if (d2 < bd && !(skip && skip(f))) { bd = d2; best = f; } });
    return best;
  }

  // ---------------------------------------------------------------- the step

  update(dt: number, hx: number, hy: number, view: Phaser.Geom.Rectangle) {
    const h = this.h, far = Math.max(view.width, view.height) * 0.95;
    for (const f of this.list) {
      if (!f.alive) continue;
      const k = f.kind;
      let dx = hx - f.x, dy = hy - f.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      // A foe left far behind comes back on the far side, ahead of the hero: the field never empties.
      if (d > far && !f.elite) {
        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2, rr = Math.max(view.width, view.height) * 0.62;
        f.x = hx + Math.cos(a) * rr; f.y = hy + Math.sin(a) * rr;
        continue;
      }
      f.slowT = Math.max(0, f.slowT - dt);
      const spd = f.speed * (f.slowT > 0 ? f.slowK : 1) * h.foeSpeed;
      let mx = dx * spd, my = dy * spd;
      f.atkT -= dt;
      if (k.mode === 'ranged') {
        // Keep a bow-shot away, circling, and loose a shot now and then.
        const want = 120;
        if (d < want) { mx = -dx * spd * 0.7; my = -dy * spd * 0.7; }
        else if (d < want + 40) { mx = -dy * spd * 0.5; my = dx * spd * 0.5; }
        if (f.state === 0 && f.atkT <= 0 && d < 260) { f.state = 1; f.st = 0; }
        if (f.state === 1) {
          mx = my = 0; f.st += dt;
          if (f.st > 0.45) { this.shoot(f.x, f.y - 14 * k.scale, dx, dy, f.dmg); f.state = 0; f.atkT = 2.2 + Math.random() * 1.5; }
        }
      } else if (k.mode === 'lunge') {
        // Close in, crouch, then spring along a fixed line.
        if (f.state === 0 && f.atkT <= 0 && d < 110) { f.state = 1; f.st = 0; f.dx = dx; f.dy = dy; }
        if (f.state === 1) { mx = my = 0; f.st += dt; if (f.st > 0.4) { f.state = 2; f.st = 0; } }
        else if (f.state === 2) { f.st += dt; mx = f.dx * spd * 4.2; my = f.dy * spd * 4.2; if (f.st > 0.32) { f.state = 0; f.atkT = 1.8 + Math.random(); } }
      } else if (k.mode === 'drift') {
        // Fliers weave as they come.
        const w = Math.sin(h.time.now * 0.004 + f.i) * 0.8;
        mx += -dy * spd * w; my += dx * spd * w;
      }
      f.x += (mx + f.kx) * dt; f.y += (my + f.ky) * dt;
      const decay = Math.exp(-dt * 7);
      f.kx *= decay; f.ky *= decay;
      if (Math.abs(mx) > 2) f.face = mx > 0 ? 1 : -1;
      f.animT += dt;
      f.flashT = Math.max(0, f.flashT - dt);
    }
    this.rebuild();
    this.separate();
    for (const f of this.list) {
      if (!f.alive) continue;
      const k = f.kind;
      const frame = f.state === 1 ? 2 : f.state === 2 ? 3 : Math.floor(f.animT * (k.mode === 'drift' ? 6 : 8)) % 2;
      f.img.setFrame(k.row * 4 + frame).setPosition(Math.round(f.x), Math.round(f.y)).setFlipX(f.face < 0).setDepth(f.y);
      if (f.flashT > 0) f.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (f.slowT > 0) f.img.setTint(0x9fd8ff).setTintMode(Phaser.TintModes.MULTIPLY);
      else if (f.elite) f.img.setTint(0xffe2a0).setTintMode(Phaser.TintModes.MULTIPLY);
      else f.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      f.shadow.setPosition(Math.round(f.x), Math.round(f.y) + 1).setDepth(-40000 + f.y * 0.001);
    }
    this.updateShots(dt, hx, hy, view);
  }

  /** Neighbours push apart a little each frame, heavier ones less. */
  private separate() {
    for (const f of this.list) {
      if (!f.alive) continue;
      this.near(f.x, f.y, f.r * 2, (o) => {
        if (o === f || o.i < f.i) return;
        let dx = o.x - f.x, dy = o.y - f.y;
        const d2 = dx * dx + dy * dy, min = f.r + o.r;
        if (d2 >= min * min) return;
        const d = Math.sqrt(d2) || 0.01;
        if (d2 === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        const push = (min - d) * 0.5, w = f.mass / (f.mass + o.mass);
        f.x -= (dx / d) * push * (1 - w); f.y -= (dy / d) * push * (1 - w);
        o.x += (dx / d) * push * w; o.y += (dy / d) * push * w;
      });
    }
  }

  // ---------------------------------------------------------------- shots

  shoot(x: number, y: number, dx: number, dy: number, dmg: number, speed = 115) {
    const s = this.shots.find((o) => o.t < 0);
    if (!s) return;
    s.x = x; s.y = y; s.vx = dx * speed; s.vy = dy * speed; s.t = 0; s.dmg = dmg;
    s.img.setVisible(true).setPosition(x, y).setScale(1.2);
  }

  /** Shots in flight: they hurt the hero on touch and fade after a few seconds. */
  private updateShots(dt: number, hx: number, hy: number, view: Phaser.Geom.Rectangle) {
    for (const s of this.shots) {
      if (s.t < 0) continue;
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      s.img.setPosition(s.x, s.y).setDepth(s.y + 20).setRotation(s.t * 8);
      if ((s.x - hx) ** 2 + (s.y - (hy - 12)) ** 2 < 100) { this.h.hurtHero(s.dmg); s.t = -1; }
      else if (s.t > 4 || !Phaser.Geom.Rectangle.Contains(view, s.x, s.y) && s.t > 1) s.t = -1;
      if (s.t < 0) s.img.setVisible(false);
    }
  }

  /** Shots the hero's dash or a burst wipes away. */
  clearShots(x: number, y: number, r: number) {
    for (const s of this.shots) if (s.t >= 0 && (s.x - x) ** 2 + (s.y - y) ** 2 < r * r) { s.t = -1; s.img.setVisible(false); }
  }
}
