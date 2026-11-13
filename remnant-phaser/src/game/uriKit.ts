// Uri on the journey (NEXT_PLAN D4): the flame-caller as a fighter of the chapters, beside Elior and Tirzah. His fire
// answers prayer; he stays human. The kit, with his own art (C08–C10, V10):
//   Strike: a fireball at the way he faces (Up + Strike: fire on the ground under the nearest foe ahead; a foe in
//     reach: a burst of flame from the open hand that throws it back).
//   Heavy: a crescent wave of flame that passes through every foe in its path.
//   Down + Heavy: calls his orc shaman (a cleansed battle-imprint, like the Echoes) to chant fire beside him a while.
//   The Mantle button: the Crown of Flame (C09), the shaman stepping into him: larger fire, and every fireball
//     leaves the ground burning.
// His numbers are his own (game/horde/uri.ts: his level, measured against Elior's), in Elior's gear.
import Phaser from 'phaser';
import { TILE, isSolid, T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import { actionAtlas, actionFrame, ACTION_CELL, ACTION_FOOT } from './actionArt';

/** The rows of V10 (vfx-uri-fire, 6 frames of 128 px a row). */
const ROW = { ball: 0, burst: 6, ground: 12, wave: 18 } as const;
interface Shot { x: number; y: number; vx: number; life: number; dmg: number; wave: boolean; big: boolean; hits: Set<FoeLike>; img: Phaser.GameObjects.Sprite }
interface Ground { x: number; y: number; t: number; tick: number; dmg: number; img: Phaser.GameObjects.Sprite }
/** Casts: the clip, its length, and where in it the fire leaves his hand. */
const CAST = {
  ball: { clip: 'b1', t: 0.3, at: 0.45 },
  ground: { clip: 'b2', t: 0.36, at: 0.5 },
  palm: { clip: 'b3', t: 0.34, at: 0.4 },
  wave: { clip: 'heavy', t: 0.5, at: 0.5 },
  call: { clip: 'invoke', t: 0.6, at: 0.6 },
} as const;
type Cast = keyof typeof CAST;
/** How far past a foe's edge the open hand reaches. */
const REACH = 30;
export const SHAMAN_T = 20, SHAMAN_CD = 40;

export class UriKit {
  private shots: Shot[];
  private grounds: Ground[];
  private bursts: Phaser.GameObjects.Sprite[];
  /** The cast under way (state 'flame'), its time, and whether its fire has left his hand. */
  cast: Cast | null = null;
  t = 0;
  private fired = false;
  private queued: Cast | null = null;
  /** The orc shaman at his side: seconds left, the next chant, and its own sprite. */
  shamanT = 0;
  shamanCd = 0;
  private chantT = 0;
  private shaman: Phaser.GameObjects.Sprite;
  private shamanX = 0;
  private shamanClip = 'idle';
  private shamanClipT = 0;
  /** For tests: what his fire has done. */
  readonly tally = { balls: 0, waves: 0, grounds: 0, palms: 0, hits: 0, calls: 0, chants: 0 };

  constructor(private w: WorldApi, private p: Player) {
    const sc = w.sc, anim = (key: string, start: number, rate: number, repeat: number) => {
      if (!sc.anims.exists(key)) sc.anims.create({ key, frames: sc.anims.generateFrameNumbers('vfx-uri-fire', { start, end: start + 5 }), frameRate: rate, repeat });
    };
    anim('uri-ball', ROW.ball, 18, -1); anim('uri-burst', ROW.burst, 22, 0); anim('uri-ground', ROW.ground, 12, -1); anim('uri-wave', ROW.wave, 16, -1);
    const sprite = () => sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setDepth(12).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.shots = Array.from({ length: 12 }, () => ({ x: 0, y: 0, vx: 0, life: 0, dmg: 0, wave: false, big: false, hits: new Set<FoeLike>(), img: sprite() }));
    this.grounds = Array.from({ length: 6 }, () => ({ x: 0, y: 0, t: 0, tick: 0, dmg: 0, img: sprite().setOrigin(0.5, 0.82) }));
    this.bursts = Array.from({ length: 8 }, () => sprite());
    this.shaman = sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setDepth(9).setVisible(false);
  }

  /** Under the Crown of Flame his fire is larger and every fireball leaves the ground burning. */
  private get crowned() { return this.p.mantleT > 0; }
  private power(mult: number) {
    const d = this.w.d, crit = Math.random() < d.crit;
    return { dmg: d.atk * mult * (this.crowned ? 1.5 : 1) * (crit ? d.critDmg : 1), crit };
  }

  /** Input while he plays. True when his kit took the frame (the player's own moves wait). */
  control(dt: number) {
    const p = this.p, c = this.w.controls;
    if (p.state === 'flame' && this.cast) {
      const k = CAST[this.cast];
      p.body.setVelocityX(p.body.velocity.x * Math.exp(-14 * dt));
      this.t += dt;
      if (!this.fired && this.t >= k.t * k.at) { this.fired = true; this.release(this.cast); }
      if (c.pressed('attack')) this.queued = c.down('up') ? 'ground' : 'ball';
      if (c.pressed('heavy')) this.queued = c.down('down') ? 'call' : 'wave';
      if (this.t >= k.t) {
        this.cast = null; p.releaseState();
        if (this.queued) { const q = this.queued; this.queued = null; this.begin(q); }
      }
      return true;
    }
    if (p.state !== 'free' && p.state !== 'swim') return false;
    if (c.pressed('heavy')) { this.begin(c.down('down') ? 'call' : 'wave'); return true; }
    if (c.pressed('attack')) { this.begin(c.down('up') ? 'ground' : this.reach() ? 'palm' : 'ball'); return true; }
    return false;
  }

  private begin(kind: Cast) {
    const p = this.p;
    if (kind === 'call' && (this.shamanT > 0 || this.shamanCd > 0)) { this.w.toast(this.shamanT > 0 ? 'The shaman is already beside you.' : `The shaman answers again in ${Math.ceil(this.shamanCd)} s.`); return; }
    p.face = p.swingFacing();
    this.cast = kind; this.t = 0; this.fired = false; p.state = 'flame';
    this.w.playEffect(kind === 'call' ? 'chant' : 'elemFire', { x: p.x, vol: 0.5, pitch: 0.9 + Math.random() * 0.2 });
  }

  /** The art clip and its progress while a cast plays. */
  get clip() { return this.cast ? CAST[this.cast].clip : 'cast'; }
  get u() { return this.cast ? Math.min(0.999, this.t / CAST[this.cast].t) : 0; }

  /** The nearest foe in reach of his open hand, ahead of him. */
  private reach(): FoeLike | null {
    const p = this.p;
    for (const f of this.w.foes()) { const dx = f.x - p.x; if (f.alive && dx * p.face > -f.box.width / 2 && Math.abs(dx) - f.box.width / 2 < REACH && Math.abs(f.box.centerY - (p.feet - 24)) < f.box.height / 2 + 20) return f; }
    return null;
  }

  private release(kind: Cast) {
    const p = this.p, hx = p.x + p.face * 16, hy = p.feet - 30;
    if (kind === 'ball') { this.tally.balls++; this.shoot(hx, hy, false); this.w.playEffect('fireball', { x: p.x, vol: 0.7 }); }
    else if (kind === 'wave') { this.tally.waves++; this.shoot(hx, p.feet - 24, true); this.w.playEffect('pillarFire', { x: p.x, vol: 0.6 }); }
    else if (kind === 'ground') {
      this.tally.grounds++;
      let target: FoeLike | null = null, best = 200;
      for (const f of this.w.foes()) { const dx = (f.x - p.x) * p.face; if (f.alive && dx > -10 && dx < best && Math.abs(f.box.bottom - p.feet) < 70) { best = dx; target = f; } }
      this.ignite(target ? target.x : p.x + p.face * 70, target ? target.box.bottom : p.feet, 3);
    } else if (kind === 'palm') {
      this.tally.palms++;
      const f = this.reach(), x = f ? f.x : hx, y = f ? f.box.centerY : hy;
      this.burst(x, y, 0.6);
      this.w.playEffect('fireBurst', { x, vol: 0.8 });
      if (f) this.strike(f, 1.15, p.face, 3, true, 240);
    } else if (kind === 'call') {
      this.tally.calls++;
      this.shamanT = SHAMAN_T; this.shamanCd = SHAMAN_CD; this.chantT = 0.8;
      this.shamanX = p.x - p.face * 26;
      this.burst(this.shamanX, p.feet - 20, 0.7);
      this.w.playEffect('summon', { x: p.x, vol: 0.8 });
      this.w.toast('The shaman stands with Uri');
    }
  }

  private shoot(x: number, y: number, wave: boolean, dmgMult = 1, from = this.p.face) {
    const s = this.shots.find((o) => o.life <= 0);
    if (!s) return;
    const big = this.crowned;
    s.x = x; s.y = y; s.vx = from * (wave ? 300 : 420); s.life = wave ? 0.85 : 1.1; s.wave = wave; s.big = big; s.hits.clear();
    s.dmg = (wave ? 1.6 : 0.9) * dmgMult;
    s.img.play(wave ? 'uri-wave' : 'uri-ball').setPosition(x, y).setFlipX(from < 0).setScale(wave ? (big ? 0.62 : 0.5) : big ? 0.38 : 0.28).setVisible(true).setAlpha(1);
  }

  private ignite(x: number, y: number, secs: number) {
    const g = this.grounds.find((o) => o.t <= 0) ?? this.grounds[0];
    g.x = x; g.y = y; g.t = secs; g.tick = 0; g.dmg = 0.3;
    g.img.play('uri-ground').setPosition(x, y + 4).setScale(this.crowned ? 0.62 : 0.5).setVisible(true).setAlpha(1);
    this.w.playEffect('flame', { x, vol: 0.5 });
  }

  private burst(x: number, y: number, scale: number) {
    const b = this.bursts.find((o) => !o.visible);
    if (!b) return;
    b.setPosition(x, y).setScale(scale).setVisible(true).setAlpha(1).play('uri-burst');
    b.once('animationcomplete', () => b.setVisible(false));
  }

  /** One blow of his fire on a foe. True when it landed. */
  private strike(f: FoeLike, mult: number, dir: number, force: number, heavy: boolean, kx = 60) {
    const { dmg, crit } = this.power(mult), hp = f.hp;
    if (!f.hit(Math.max(1, Math.round(dmg)), dir, force, crit, { kind: 'proj', kx: dir * kx, ky: heavy ? -120 : 0, poise: heavy ? 30 : 10 })) return false;
    this.tally.hits++;
    this.w.heroHit(f, hp !== undefined && f.hp !== undefined ? Math.max(0, hp - f.hp) : dmg, heavy, crit);
    this.p.noteStyle(heavy ? 'flame_heavy' : 'flame');
    this.p.comboHits++;
    this.w.save.ce = Math.min(this.p.maxCe, this.w.save.ce + 1);
    this.w.spark(f.x, f.box.centerY, crit ? 0xffe08a : 0xff8a3a, crit ? 8 : 5);
    return true;
  }

  update(dt: number) {
    this.shamanCd = Math.max(0, this.shamanCd - dt);
    for (const s of this.shots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const nx = s.x + s.vx * dt;
      // A fireball bursts on the first wall or foe; a wave passes through foes and breaks on walls.
      const t = this.w.tileAt(Math.floor(nx / TILE), Math.floor(s.y / TILE));
      let end = s.life <= 0 || isSolid(t as T);
      if (!end) for (const f of this.w.foes()) {
        if (!f.alive || s.hits.has(f)) continue;
        const b = f.box, r = s.wave ? 18 : 8;
        if (nx + r < b.left || nx - r > b.right || s.y + (s.wave ? 22 : 8) < b.top || s.y - (s.wave ? 22 : 8) > b.bottom) continue;
        s.hits.add(f);
        this.strike(f, s.dmg, Math.sign(s.vx), s.wave ? 2.5 : 1, s.wave, s.wave ? 160 : 60);
        if (!s.wave) { end = true; this.burst(nx, s.y, s.big ? 0.5 : 0.38); this.w.playEffect('fireBurst', { x: nx, vol: 0.5 }); if (s.big) this.ignite(f.x, f.box.bottom, 2); break; }
      }
      s.x = nx;
      if (end) { s.life = 0; s.img.setVisible(false).stop(); if (!s.wave && !s.hits.size) this.burst(s.x, s.y, 0.32); continue; }
      s.img.setPosition(s.x, s.y + (s.wave ? 0 : Math.sin(s.life * 30) * 0.8));
      if (s.wave && s.life < 0.2) s.img.setAlpha(s.life / 0.2);
    }
    for (const g of this.grounds) {
      if (g.t <= 0) continue;
      g.t -= dt; g.tick -= dt;
      if (g.t <= 0) { g.img.setVisible(false).stop(); continue; }
      if (g.t < 0.4) g.img.setAlpha(g.t / 0.4);
      // It burns whatever stands in it, a few times a second.
      if (g.tick <= 0) { g.tick = 0.33; for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - g.x) < 30 && Math.abs(f.box.bottom - g.y) < 24) this.strike(f, g.dmg, 0, 0.2, false, 0); }
    }
    this.updateShaman(dt);
  }

  /** The shaman keeps at his back and chants fire at the nearest foe ahead every second and a half. */
  private updateShaman(dt: number) {
    const p = this.p;
    if (this.shamanT <= 0) { if (this.shaman.visible) this.shaman.setVisible(false); return; }
    this.shamanT -= dt;
    if (this.shamanT <= 0 || p.dead) { this.shamanT = 0; this.burst(this.shamanX, p.feet - 20, 0.6); this.shaman.setVisible(false); return; }
    const want = p.x - p.face * 26;
    this.shamanX += (want - this.shamanX) * Math.min(1, dt * 4);
    this.chantT -= dt; this.shamanClipT += dt;
    if (this.chantT <= 0) {
      this.chantT = 1.5;
      let target: FoeLike | null = null, best = 260;
      for (const f of this.w.foes()) { const d = Math.abs(f.x - this.shamanX); if (f.alive && d < best && Math.abs(f.box.centerY - (p.feet - 24)) < 80) { best = d; target = f; } }
      if (target) {
        const dir = Math.sign(target.x - this.shamanX) || p.face;
        this.tally.chants++;
        this.shoot(this.shamanX + dir * 14, p.feet - 34, false, 0.7, dir);
        this.shamanClip = 'cast'; this.shamanClipT = 0;
      }
    }
    if (this.shamanClip === 'cast' && this.shamanClipT > 0.4) this.shamanClip = 'idle';
    const key = actionAtlas(this.w.sc, 'shaman', 'blade');
    const u = this.shamanClip === 'cast' ? this.shamanClipT / 0.4 : (this.shamanClipT / 3) % 1;
    this.shaman.setTexture(key, actionFrame(this.w.sc, key, this.shamanClip, Math.min(0.999, u))).setScale(1.05)
      .setPosition(Math.round(this.shamanX), Math.round(p.feet)).setFlipX(p.face < 0).setVisible(true)
      .setAlpha(this.shamanT < 1.5 ? (Math.floor(this.shamanT * 8) % 2 ? 0.5 : 0.9) : 0.95);
  }

  /** Leaving him (a switch, a blow): the cast under way is dropped. */
  cancel() {
    if (this.p.state === 'flame') this.p.releaseState();
    this.cast = null; this.queued = null;
  }
  /** A new room: his fire in flight and on the ground stays behind. */
  clearRoom() {
    // The world clears a room before its new player exists, so this kit may belong to a scene run already torn down:
    // its sprites are destroyed then, and only the numbers need resetting.
    const hide = (o: Phaser.GameObjects.Sprite) => { if (o.scene) o.setVisible(false).stop(); };
    for (const s of this.shots) { s.life = 0; hide(s.img); }
    for (const g of this.grounds) { g.t = 0; hide(g.img); }
    for (const b of this.bursts) hide(b);
  }
}
