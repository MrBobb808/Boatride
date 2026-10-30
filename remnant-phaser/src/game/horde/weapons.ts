// The Horde's auto-weapons: each hero's own (Elior's blade, Tirzah's bow) and the relics a level-up adds, every
// effect drawn from the shared VFX sheets. All of it is pooled; nothing is created during a stage.
import Phaser from 'phaser';
import { WEAPONS, type WeaponId } from './defs';
import type { Foe } from './foes';
import type { Horde } from '../../scenes/Horde';

/** Re-hit slots on Foe.hitBy for the weapons that touch the same foe over and over. */
const SLOT = { seraphs: 0, hallowed: 1, crescent: 2, fire: 3, storm: 4, blade: 5 };

interface Anim { img: Phaser.GameObjects.Image; t: number; dur: number; f0: number; n: number; follow: boolean; ox: number; oy: number }
interface Missile { img: Phaser.GameObjects.Image; kind: 'arrow' | 'crescent'; x: number; y: number; vx: number; vy: number; t: number; life: number; pierce: number; dmg: number; hits: Foe[]; ox: number; oy: number; back: boolean; split: boolean }
interface Fire { x: number; y: number; t: number; r: number; dmg: number; img: Phaser.GameObjects.Image }

export class Arsenal {
  /** Weapon levels: 1 when gained, up to 6 (five upgrades). */
  readonly lv = new Map<WeaponId, number>();
  private t = new Map<WeaponId, number>();
  private anims: Anim[] = [];
  private missiles: Missile[] = [];
  private orbs: Phaser.GameObjects.Image[] = [];
  private orbA = 0;
  private ground: Phaser.GameObjects.Image;
  private chainG: Phaser.GameObjects.Graphics;
  private chainT = 0;
  private fires: Fire[] = [];
  private pending: { t: number; fn: () => void }[] = [];
  private bladeFlip = 1;

  constructor(private h: Horde) {
    for (let i = 0; i < 40; i++) this.anims.push({ img: h.wl(h.add.image(0, 0, 'vfx-impacts', 0).setVisible(false).setBlendMode(Phaser.BlendModes.ADD)), t: -1, dur: 0, f0: 0, n: 0, follow: false, ox: 0, oy: 0 });
    for (let i = 0; i < 70; i++) this.missiles.push({ img: h.wl(h.add.image(0, 0, 'arrows', 0).setVisible(false)), kind: 'arrow', x: 0, y: 0, vx: 0, vy: 0, t: -1, life: 0, pierce: 0, dmg: 0, hits: [], ox: 0, oy: 0, back: false, split: false });
    for (let i = 0; i < 8; i++) this.orbs.push(h.wl(h.add.image(0, 0, 'vfx-impacts', 19).setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setScale(0.16)));
    this.ground = h.wl(h.add.image(0, 0, 'hz-ring').setVisible(false).setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD));
    this.chainG = h.wl(h.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(90000));
    for (let i = 0; i < 6; i++) this.fires.push({ x: 0, y: 0, t: -1, r: 0, dmg: 0, img: h.wl(h.add.image(0, 0, 'vfx-status', 0).setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.5, 0.75)) });
  }

  level(id: WeaponId) { return this.lv.get(id) ?? 0; }
  /** Gained or raised by a level-up. */
  raise(id: WeaponId) { this.lv.set(id, Math.min(6, this.level(id) + 1)); if (!this.t.has(id)) this.t.set(id, 0.3); }
  relics() { return [...this.lv.keys()].filter((id) => !WEAPONS[id].hero); }

  /** A sheet animation: frames f0..f0+n over `dur` seconds, here or following the hero. */
  private anim(tex: string, f0: number, n: number, x: number, y: number, dur: number, scale: number, o: { rot?: number; tint?: number; follow?: boolean; originY?: number; alpha?: number; depth?: number; flipY?: boolean } = {}) {
    const a = this.anims.find((e) => e.t < 0);
    if (!a) return;
    a.t = 0; a.dur = dur; a.f0 = f0; a.n = n; a.follow = !!o.follow; a.ox = x - this.h.hero.x; a.oy = y - this.h.hero.y;
    a.img.setTexture(tex, f0).setPosition(x, y).setScale(scale).setRotation(o.rot ?? 0).setOrigin(0.5, o.originY ?? 0.5).setFlipY(!!o.flipY).setAlpha(o.alpha ?? 1).setVisible(true).setDepth(o.depth ?? y + 30);
    if (o.tint) a.img.setTint(o.tint); else a.img.clearTint();
  }
  private later(t: number, fn: () => void) { this.pending.push({ t, fn }); }

  /** Seconds between uses, shortened by Haste and the forms. */
  private cd(base: number) { return base * this.h.cdMult; }

  update(dt: number) {
    const h = this.h, hero = h.hero;
    for (let i = this.pending.length - 1; i >= 0; i--) { const p = this.pending[i]; p.t -= dt; if (p.t <= 0) { this.pending.splice(i, 1); p.fn(); } }
    for (const [id, lv] of this.lv) {
      if (lv <= 0) continue;
      const def = WEAPONS[id];
      // Each hero's own weapon fights only while that hero does.
      if (def.hero && def.hero !== hero.hero) continue;
      const t = (this.t.get(id) ?? 0) - dt;
      this.t.set(id, t);
      if (t > 0 && id !== 'seraphs' && id !== 'hallowed') continue;
      this.fire(id, lv, dt);
    }
    this.orbsStep(dt);
    this.groundStep(dt);
    this.missileStep(dt);
    this.fireStep(dt);
    for (const a of this.anims) {
      if (a.t < 0) continue;
      a.t += dt;
      if (a.t >= a.dur) { a.t = -1; a.img.setVisible(false); continue; }
      a.img.setFrame(a.f0 + Math.min(a.n - 1, Math.floor((a.t / a.dur) * a.n)));
      if (a.follow) a.img.setPosition(hero.x + a.ox, hero.y + a.oy).setDepth(hero.y + 30);
    }
    this.chainT -= dt;
    if (this.chainT <= 0) this.chainG.clear();
    else this.chainG.setAlpha(Math.min(1, this.chainT / 0.15));
  }

  private fire(id: WeaponId, lv: number, dt: number) {
    const h = this.h, x = h.hero.x, y = h.hero.y - 12, area = h.areaMult;
    const set = (s: number) => this.t.set(id, this.cd(s));
    if (id === 'blade') {
      const R = 48 * area * (lv >= 3 ? 1.25 : 1);
      const f = h.swarm.nearest(x, y, R + 34);
      if (!f) { this.t.set(id, 0.05); return; }
      set(0.9);
      const a = Math.atan2(f.y - 10 - y, f.x - x);
      this.bladeFlip = -this.bladeFlip;
      h.hero.look(f.x - x);
      h.hero.play(this.bladeFlip > 0 ? 'b1' : 'b2', 0.3);
      const dmg = 12 * (lv >= 2 ? 1.25 : 1) * (lv >= 4 ? 1.25 : 1);
      const cut = (ang: number, delay: number) => this.later(delay, () => {
        this.arc(h.hero.x, h.hero.y - 12, ang, R, lv >= 3 ? 1.9 : 1.5, dmg);
        this.anim('vfx-slashes', h.hero.form ? 6 : 0, 6, h.hero.x + Math.cos(ang) * R * 0.45, h.hero.y - 12 + Math.sin(ang) * R * 0.45, 0.2, R / 46, { rot: ang, tint: h.hero.form ? 0xc59bff : undefined, follow: true, flipY: this.bladeFlip < 0 });
        h.sfx('swing', 0.5);
      });
      cut(a, 0.06);
      if (lv >= 5) cut(a + Math.PI, 0.2);
      if (lv >= 6) this.later(0.1, () => this.launch('crescent', h.hero.x, h.hero.y - 12, Math.cos(a), Math.sin(a), 260, dmg * 0.8, 99, 0.7));
    } else if (id === 'bow') {
      const n = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + h.plenty + (h.hero.form ? 2 : 0);
      const targets: Foe[] = [];
      h.swarm.near(x, y, 320, (f) => { targets.push(f); return targets.length >= 24; });
      if (!targets.length) { this.t.set(id, 0.05); return; }
      set(0.78);
      targets.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
      h.hero.look(targets[0].x - x);
      h.hero.play('bowRelease', 0.26);
      const dmg = 9 * (lv >= 4 ? 1.25 : 1), pierce = 1 + (lv >= 3 ? 1 : 0) + (h.hero.form ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const f = targets[i % targets.length];
        let a = Math.atan2(f.y - 12 - y, f.x - x);
        if (i >= targets.length) a += ((i - targets.length + 1) % 2 ? 1 : -1) * 0.18 * Math.ceil((i - targets.length + 1) / 2);
        this.later(i * 0.035, () => this.launch('arrow', h.hero.x, h.hero.y - 14, Math.cos(a), Math.sin(a), 440, dmg, pierce, 0.75, lv >= 6));
      }
      h.sfx('bowRelease', 0.4);
    } else if (id === 'pillar') {
      set(lv >= 6 ? 1.3 : 2.6);
      const n = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0), r = 30 * area * (lv >= 3 ? 1.3 : 1), dmg = 24 * (lv >= 4 ? 1.3 : 1);
      for (let i = 0; i < n; i++) {
        const p = this.target(230);
        if (!p) break;
        const fx = p.x, fy = p.y;
        this.anim('vfx-abilities-1', 40, 8, fx, fy + 4, 0.55, r / 30, { originY: 0.85 });
        this.later(0.12, () => { this.burst(fx, fy, r, dmg, 60); h.sfx('pillarFire', 0.4); });
      }
    } else if (id === 'lion') {
      set(lv >= 4 ? 3.8 : 5);
      const r = 72 * area * (lv >= 2 ? 1.2 : 1), dmg = 18 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.4 : 1);
      this.anim('vfx-abilities-1', 24, 8, x, y + 8, 0.6, r / 44, { originY: 0.75, follow: true });
      this.burst(x, y, r, dmg, 300);
      if (lv >= 5) { const fire = this.fires.find((f) => f.t < 0); if (fire) { fire.x = x; fire.y = h.hero.y; fire.t = 0; fire.r = r * 0.7; fire.dmg = dmg * 0.25; } }
      h.sfx('lion', 0.6); h.shake(0.004, 120);
    } else if (id === 'chains') {
      set(2.2);
      const links = 3 + (lv >= 2 ? 2 : 0) + (lv >= 4 ? 2 : 0), dmg = 11 * (lv >= 3 ? 1.25 : 1);
      this.chainG.clear().lineStyle(2, 0xffd27a, 1);
      for (let c = 0; c < (lv >= 6 ? 2 : 1); c++) {
        let px = x, py = y, f = h.swarm.nearest(x, y, 180, (o) => c > 0 && o.hitBy[SLOT.storm] > h.time.now / 1000);
        let left = links;
        while (f && left-- > 0) {
          const hit: Foe = f;
          hit.hitBy[SLOT.storm] = h.time.now / 1000 + 0.2;
          this.chainG.lineBetween(px, py, hit.x, hit.y - 12);
          this.anim('vfx-abilities-2', 0, 8, hit.x, hit.y - 12, 0.3, 0.2);
          h.damage(hit, dmg, 0, 0, 40);
          if (lv >= 5 && hit.alive) { hit.slowT = 1.5; hit.slowK = 0.6; }
          px = hit.x; py = hit.y - 12;
          f = h.swarm.nearest(px, py, 95, (o) => o.hitBy[SLOT.storm] > h.time.now / 1000);
        }
      }
      // With no foe in reach the chain finds the monarch.
      if (h.boss && h.bossHit(x, y, 170, dmg * 1.5, true)) this.chainG.lineBetween(x, y, h.boss.x, h.boss.y - 30);
      this.chainT = 0.25;
      h.sfx('chains', 0.4);
    } else if (id === 'crescent') {
      set(2.4);
      const n = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + h.plenty, dmg = 12 * (lv >= 3 ? 1.25 : 1) * (lv >= 6 ? 1.3 : 1);
      const f = h.swarm.nearest(x, y, 300);
      const a0 = f ? Math.atan2(f.y - y, f.x - x) : (h.hero.face > 0 ? 0 : Math.PI);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.5;
        this.launch('crescent', x, y, Math.cos(a), Math.sin(a), 230 * (lv >= 6 ? 1.3 : 1), dmg, 999, 1.5, false, (lv >= 4 ? 1.4 : 1) * area);
      }
      h.sfx('waveWhoosh', 0.35);
    } else if (id === 'frost') {
      set(lv >= 5 ? 2.6 : 3.5);
      const r = 62 * area * (lv >= 2 ? 1.25 : 1), dmg = 8 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.4 : 1);
      this.anim('vfx-abilities-2', 40, 8, x, y + 6, 0.55, r / 40, { originY: 0.7, follow: true });
      h.swarm.near(x, y, r, (f) => { h.damage(f, dmg, 0, 0, 0); if (f.alive) { f.slowT = lv >= 4 ? 1 : 2; f.slowK = lv >= 4 ? 0.05 : 0.5; } });
      h.sfx('shatter', 0.35);
    }
  }

  /** A cut: every foe within R and within `half` radians of `ang`. */
  arc(x: number, y: number, ang: number, R: number, half: number, dmg: number) {
    const h = this.h, ca = Math.cos(ang), sa = Math.sin(ang);
    h.swarm.near(x, y, R, (f) => {
      const dx = f.x - x, dy = f.y - 10 - y, d = Math.hypot(dx, dy) || 1;
      if ((dx * ca + dy * sa) / d < Math.cos(half) && d > f.r) return;
      h.damage(f, dmg, ca, sa, 140);
    });
    h.bossHit(x + ca * R * 0.6, y + sa * R * 0.6, R * 0.7, dmg);
  }

  /** Damage around a point, throwing foes outward by `knock`. */
  burst(x: number, y: number, r: number, dmg: number, knock: number) {
    const h = this.h;
    h.swarm.near(x, y, r, (f) => { const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1; h.damage(f, dmg, dx / d, dy / d, knock); });
    h.bossHit(x, y, r, dmg);
  }

  /** Where a falling strike lands: a foe near the hero, or the monarch now and then. */
  private target(r: number): { x: number; y: number } | null {
    const h = this.h, b = h.boss, pick: Foe[] = [];
    if (b && (b.x - h.hero.x) ** 2 + (b.y - h.hero.y) ** 2 < r * r && Math.random() < 0.45) return b;
    h.swarm.near(h.hero.x, h.hero.y, r, (f) => { pick.push(f); return pick.length >= 30; });
    return pick.length ? pick[Math.floor(Math.random() * pick.length)] : b;
  }

  launch(kind: 'arrow' | 'crescent', x: number, y: number, dx: number, dy: number, speed: number, dmg: number, pierce: number, life: number, split = false, size = 1) {
    const m = this.missiles.find((o) => o.t < 0);
    if (!m) return;
    m.kind = kind; m.x = x; m.y = y; m.ox = x; m.oy = y; m.vx = dx * speed; m.vy = dy * speed; m.t = 0; m.life = life; m.pierce = pierce; m.dmg = dmg; m.hits.length = 0; m.back = false; m.split = split;
    if (kind === 'arrow') m.img.setTexture('arrows', this.h.hero.form ? 7 : 0).setOrigin(0.93, 61 / 128).setScale(0.24).setBlendMode(Phaser.BlendModes.NORMAL);
    else m.img.setTexture('vfx-abilities-1', 3).setOrigin(0.5).setScale(0.32 * size).setBlendMode(Phaser.BlendModes.ADD);
    m.img.setVisible(true).setPosition(x, y).setRotation(Math.atan2(dy, dx));
  }

  private missileStep(dt: number) {
    const h = this.h;
    for (const m of this.missiles) {
      if (m.t < 0) continue;
      m.t += dt;
      if (m.kind === 'crescent' && !m.back && m.t > m.life * 0.45) {
        // Out, then home back to the hero.
        m.back = true; m.hits.length = 0;
      }
      if (m.back) {
        const dx = h.hero.x - m.x, dy = h.hero.y - 12 - m.y, d = Math.hypot(dx, dy) || 1, sp = Math.hypot(m.vx, m.vy);
        m.vx = (dx / d) * sp; m.vy = (dy / d) * sp;
        if (d < 14) m.t = m.life;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.img.setPosition(m.x, m.y).setDepth(m.y + 40);
      if (m.kind === 'crescent') m.img.setRotation(m.img.rotation + dt * 14);
      if (m.t >= m.life) { m.t = -1; m.img.setVisible(false); continue; }
      const r = m.kind === 'arrow' ? 8 : 16 * (m.img.scaleX / 0.32);
      h.swarm.near(m.x, m.y + 10, r, (f) => {
        if (m.t < 0) return true;
        if (m.kind === 'crescent') { if (f.hitBy[SLOT.crescent] > h.time.now / 1000) return; f.hitBy[SLOT.crescent] = h.time.now / 1000 + 0.35; }
        else if (m.hits.includes(f)) return;
        else m.hits.push(f);
        const n = Math.hypot(m.vx, m.vy) || 1;
        const killed = h.damage(f, m.dmg, m.vx / n, m.vy / n, m.kind === 'arrow' ? 80 : 60);
        if (m.kind === 'arrow' && killed && m.split) {
          const a = Math.atan2(m.vy, m.vx);
          for (const s of [-0.5, 0.5]) this.launch('arrow', f.x, f.y - 12, Math.cos(a + s), Math.sin(a + s), 400, m.dmg * 0.6, 0, 0.4);
        }
        if (m.kind === 'arrow' && --m.pierce < 0) { m.t = -1; m.img.setVisible(false); return true; }
      });
      if (m.t >= 0 && h.bossHit(m.x, m.y, r, m.dmg, true) && m.kind === 'arrow') { m.t = -1; m.img.setVisible(false); }
    }
  }

  private orbsStep(dt: number) {
    const h = this.h, lv = this.level('seraphs');
    const n = lv ? 2 + (lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0) + (lv >= 6 ? 1 : 0) + h.plenty : 0;
    this.orbA += dt * (lv >= 5 ? 3.8 : 2.7);
    const R = 46 * h.areaMult, dmg = 7 * (lv >= 3 ? 1.25 : 1), now = h.time.now / 1000;
    this.orbs.forEach((o, i) => {
      if (i >= n) { o.setVisible(false); return; }
      const a = this.orbA + (i / n) * Math.PI * 2, x = h.hero.x + Math.cos(a) * R, y = h.hero.y - 12 + Math.sin(a) * R * 0.8;
      o.setVisible(true).setPosition(x, y).setDepth(y + 20).setRotation(a * 2);
      h.swarm.near(x, y + 8, 12, (f) => {
        if (f.hitBy[SLOT.seraphs] > now) return;
        f.hitBy[SLOT.seraphs] = now + 0.45;
        h.damage(f, dmg, Math.cos(a), Math.sin(a), 90);
      });
      h.bossHit(x, y, 12, dmg * dt * 4);
    });
  }

  private groundStep(dt: number) {
    const h = this.h, lv = this.level('hallowed');
    this.ground.setVisible(lv > 0);
    if (!lv) return;
    const r = 42 * h.areaMult * (lv >= 2 ? 1.25 : 1) * (lv >= 5 ? 1.25 : 1), dmg = 4 * (lv >= 3 ? 1.3 : 1) * (lv >= 6 ? 1.4 : 1), now = h.time.now / 1000;
    this.ground.setPosition(h.hero.x, h.hero.y).setScale(r / 32, (r / 32) * 0.8).setDepth(-30000).setAlpha(0.25 + Math.sin(now * 4) * 0.08);
    h.swarm.near(h.hero.x, h.hero.y, r, (f) => {
      if (lv >= 4) { f.slowT = Math.max(f.slowT, 0.2); f.slowK = Math.min(f.slowK, 0.7); }
      if (f.hitBy[SLOT.hallowed] > now) return;
      f.hitBy[SLOT.hallowed] = now + 0.5;
      h.damage(f, dmg, 0, 0, 0);
    });
    h.bossHit(h.hero.x, h.hero.y, r, dmg * dt * 2);
  }

  private fireStep(dt: number) {
    const h = this.h, now = h.time.now / 1000;
    for (const f of this.fires) {
      if (f.t < 0) continue;
      f.t += dt;
      if (f.t > 2.5) { f.t = -1; f.img.setVisible(false); continue; }
      f.img.setVisible(true).setPosition(f.x, f.y).setFrame(Math.floor(f.t * 12) % 8).setScale(f.r / 40).setAlpha(Math.min(1, (2.5 - f.t) * 2) * 0.8).setDepth(f.y);
      h.swarm.near(f.x, f.y, f.r, (e) => { if (e.hitBy[SLOT.fire] > now) return; e.hitBy[SLOT.fire] = now + 0.4; h.damage(e, f.dmg, 0, 0, 0); });
    }
  }

  // ---------------------------------------------------------------- the heroes' skills

  /** Elior's Covenant Storm: blades whirl around him for a few seconds. */
  storm(dur: number) {
    const h = this.h, ticks = Math.round(dur / 0.15);
    for (let i = 0; i < ticks; i++) this.later(i * 0.15, () => {
      const r = 64 * h.areaMult;
      this.anim('vfx-slashes', 18, 6, h.hero.x, h.hero.y - 10, 0.16, r / 34, { follow: true, tint: h.hero.form ? 0xc59bff : undefined });
      this.burst(h.hero.x, h.hero.y - 8, r, 9, 120);
      if (i % 3 === 0) h.sfx('swing', 0.4);
    });
    h.hero.play('storm', dur);
  }

  /** Tirzah's Rain of Dawn: volleys falling on the thickest knot of foes. */
  rain() {
    const h = this.h, cands: Foe[] = [];
    h.swarm.near(h.hero.x, h.hero.y, 280, (f) => { cands.push(f); return cands.length >= 20; });
    let best = cands[0], most = -1;
    for (const c of cands) { let n = 0; h.swarm.near(c.x, c.y, 50, () => { n++; }); if (n > most) { most = n; best = c; } }
    const cx = best ? best.x : h.hero.x + h.hero.face * 90, cy = best ? best.y : h.hero.y;
    h.hero.play('bowDraw', 0.3);
    for (let i = 0; i < 8; i++) this.later(0.1 + i * 0.14, () => {
      const x = cx + (Math.random() - 0.5) * 60, y = cy + (Math.random() - 0.5) * 50;
      this.anim('vfx-archer', 32, 8, x, y, 0.45, 0.5, { originY: 0.8 });
      this.later(0.16, () => { this.burst(x, y - 6, 46 * h.areaMult, 11, 40); });
      if (i % 2 === 0) h.sfx('arrowRain', 0.4);
    });
  }

  /** The switch: the hero arriving lands with a ring of light. */
  landing() {
    const h = this.h;
    this.anim('vfx-impacts', 18, 6, h.hero.x, h.hero.y - 12, 0.4, 1.1);
    this.burst(h.hero.x, h.hero.y - 8, 74 * h.areaMult, 16, 260);
  }

  /** The Mantle's kills burst in violet; the forms' arrival flares. */
  formBurst(x: number, y: number) {
    this.anim('vfx-abilities-2', 24, 8, x, y - 10, 0.4, 0.4);
    this.burst(x, y, 36, 6, 60);
  }
  forming(hero: 'elior' | 'tirzah') { const h = this.h; this.anim('vfx-transform', hero === 'tirzah' ? 24 : 8, 8, h.hero.x, h.hero.y - 24, 0.7, 0.8, { follow: true }); }

  /** Dust and sparks where a blow lands, or a foe falls. */
  impact(x: number, y: number, crit: boolean) { this.anim('vfx-impacts', crit ? 6 : 0, 6, x, y, 0.22, crit ? 0.34 : 0.22); }
  death(x: number, y: number) { this.anim('vfx-impacts', 12, 6, x, y - 8, 0.3, 0.26, { alpha: 0.8 }); }
  /** A telegraph or a strike drawn for the boss. */
  boom(tex: string, f0: number, n: number, x: number, y: number, dur: number, scale: number, tint?: number) { this.anim(tex, f0, n, x, y, dur, scale, { tint, originY: 0.8 }); }

  clear() {
    for (const a of this.anims) { a.t = -1; a.img.setVisible(false); }
    for (const m of this.missiles) { m.t = -1; m.img.setVisible(false); }
    for (const f of this.fires) { f.t = -1; f.img.setVisible(false); }
    this.pending.length = 0;
    this.chainG.clear();
  }
}
