// Legendary Powers in a fight (the table and the drops are the shared game/legendary.ts): the powers on the
// fighting hero's worn gear, and what each does. Effects are deliberately loud (pillars, lightning, meteors,
// swords of light) but every pool is fixed: nothing is made in the frame loop.
import Phaser from 'phaser';
import { fx, PK } from '../../../remnant/src/render/fx';
import { wornLegends } from '../../../remnant/src/game/legendary';
import type { FoeLike, WorldApi } from './types';

/** What the powers need from the hero. */
interface Hero { x: number; y: number; feet: number; face: number; hero: 'elior' | 'tirzah'; dead: boolean; power(): number }

/** A strike queued a moment ahead: a falling star, a pillar, a rain arrow. */
interface Strike { t: number; on: boolean; kind: 'star' | 'pillar' | 'rain' | 'brim'; x: number; y: number; mult: number }
/** A patch of the Chariot's road of fire. */
interface Fire { t: number; x: number; y: number; tick: number }
/** A seeking bolt: the Hawk's split arrows, its spirit, the Wind Volley. */
interface Bolt { on: boolean; x: number; y: number; vx: number; vy: number; t: number; target: FoeLike | null; hops: number; mult: number; css: string; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; hit: Set<FoeLike> }

const hex = (c: string) => parseInt(c.slice(1, 7), 16);

export class Legends {
  /** The powers in play: the fighting hero's worn gear. */
  readonly on = new Set<string>();
  /** How often each power has fired (for the checks). */
  readonly tally: Record<string, number> = {};
  private refreshT = 0;
  private strikes: Strike[] = Array.from({ length: 24 }, () => ({ t: 0, on: false, kind: 'star' as const, x: 0, y: 0, mult: 0 }));
  private fires: Fire[] = Array.from({ length: 18 }, () => ({ t: 0, x: 0, y: 0, tick: 0 }));
  private bolts: Bolt[] = [];
  private swords: Phaser.GameObjects.Image[] = [];
  private swordGlow: Phaser.GameObjects.Image[] = [];
  private swordsT = 0;
  private swordA = 0;
  private swordHit = new Map<FoeLike, number>();
  private roadT = 0;
  private roadDrop = 0;
  private chain = 0;
  private chainT = 0;
  private arrows = 0;
  private wind = { t: 0, x: 0, y: 0, tick: 0 };
  private clock = 0;
  private thunderCd = 0;
  private pillarCd = 0;
  /** Brimstone's chain is held to a few bursts at a time. */
  private brimBudget = 4;
  private brimT = 0;

  constructor(private w: WorldApi, private hero: () => Hero) {
    const sc = w.sc, blade = sc.textures.exists('fx-streak') ? 'fx-streak' : 'glow';
    for (let i = 0; i < 3; i++) {
      this.swordGlow.push(sc.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe6a8).setDepth(12.7).setVisible(false));
      this.swords.push(sc.add.image(0, 0, blade).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1c4).setDepth(12.8).setVisible(false));
    }
    for (let i = 0; i < 14; i++) {
      const glow = sc.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(12.7).setVisible(false);
      const img = sc.add.image(0, 0, blade).setBlendMode(Phaser.BlendModes.ADD).setDepth(12.8).setVisible(false);
      this.bolts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, target: null, hops: 0, mult: 0, css: '#ffffff', img, glow, hit: new Set() });
    }
    this.refresh();
  }

  /** The powers worn now (after gear changes, a switch, a pickup). */
  refresh() { const p = this.hero(); if (p && this.w.save) wornLegends(this.w.save, p.hero, this.on); }
  has(id: string) { return this.on.has(id); }
  private count(id: string) { this.tally[id] = (this.tally[id] ?? 0) + 1; }

  // ---------------------------------------------------------------- damage

  private dmg(mult: number) { return Math.max(1, Math.round(this.hero().power() * mult)); }
  /** Wound every foe within `r` of (x, y). Returns how many it struck. */
  private blast(x: number, y: number, r: number, mult: number, o: { kx?: number; ky?: number; poise?: number; skip?: FoeLike | null; pull?: boolean } = {}) {
    let n = 0;
    const dmg = this.dmg(mult);
    for (const f of this.w.foes()) {
      if (!f.alive || f === o.skip) continue;
      const b = f.box, dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
      if (dx * dx + dy * dy > r * r) continue;
      const dir = Math.sign(f.x - x) || 1, push = o.pull ? -dir : dir;
      if (f.hit(dmg, push, 1.2, false, { kind: 'ability', kx: push * (o.kx ?? 60), ky: o.ky ?? -40, poise: o.poise ?? 12 })) { n++; this.slain(f); }
    }
    return n;
  }
  /** Strike one foe. */
  private smite(f: FoeLike, mult: number, dir: number, crit = false) {
    if (!f.alive) return false;
    const ok = f.hit(this.dmg(mult), dir, 1, crit, { kind: 'ability', kx: dir * 50, ky: -30, poise: 10 });
    if (ok) this.slain(f);
    return ok;
  }
  private slain(f: FoeLike) { if (!f.alive) this.kill(f); }

  // ---------------------------------------------------------------- hooks

  /** A melee blow landed (his blade, her dagger). */
  onHit(f: FoeLike, o: { crit: boolean; heavy: boolean; ender: boolean }) {
    if (!this.on.size) return;
    const p = this.hero(), x = f.x, y = f.box.centerY;
    if (o.crit && this.has('thunder') && this.thunderCd <= 0) this.thunder(f);
    if (o.heavy && this.has('pillar') && this.pillarCd <= 0) { this.pillarCd = 0.45; this.queue('pillar', x, f.box.bottom, 0.12, 1.5); }
    if (o.ender && this.has('gideon')) {
      if (this.swordsT <= 0) { this.w.playEffect('swordWord', { x: p.x }); fx.holyBurst(p.x, p.feet - 24, 14, 1.2); this.count('gideon'); }
      this.swordsT = 6;
    }
    if (this.has('whirlwind')) {
      this.chain = this.chainT > 0 ? this.chain + 1 : 1; this.chainT = 1.7;
      if (this.chain % 8 === 0) this.whirlwind(x, y);
    }
    if (!f.alive) this.kill(f);
  }

  /** One of her arrows struck. */
  onArrow(f: FoeLike, o: { crit: boolean; charged: boolean; x: number; y: number; dir: number }) {
    if (!this.on.size) return;
    if (o.charged && this.has('falling_star')) this.star(o.x, o.y);
    if (o.crit && this.has('hawk_spirit')) this.loose(o.x, o.y, -o.dir * 40, -160, f, 3, 1.0, '#c8f0e4', 'hawk_spirit');
    if (this.has('arrow_rain') && ++this.arrows % 6 === 0) this.rain(f);
    if (!f.alive) {
      if (this.has('hawk_split')) { this.count('hawk_split'); for (let i = 0; i < 3; i++) this.loose(o.x, o.y, o.dir * 120 * Math.cos((i - 1) * 0.7), -120 + (i - 1) * 90, f, 1, 0.6, '#a6efdc', ''); this.w.playEffect('wingbeat', { x: o.x }); }
      this.kill(f);
    }
  }

  /** A perfect parry. */
  onParry() {
    if (!this.has('jericho')) return;
    const p = this.hero(), y = p.feet - 22;
    this.count('jericho');
    for (let i = 0; i < 3; i++) fx.ring(p.x, y, 10, 70 + i * 50, i ? '#ffe6a8' : '#ffffff', 0.35 + i * 0.12, 4, i === 2 ? 0.35 : 1);
    fx.holyBurst(p.x, y, 22, 1.4);
    this.w.flashLight?.(p.x, y, 220, '#ffe6a8', 0.5);
    this.w.playEffect('trumpet', { x: p.x });
    this.w.shake(0.012, 220);
    this.blast(p.x, y, 130, 2, { kx: 280, ky: -170, poise: 60 });
  }

  /** A dodge (or her Dawnstep). */
  onDodge() {
    if (this.has('chariot')) { this.roadT = 0.4; this.roadDrop = 0; this.w.playEffect('fireBurst', { vol: 0.6 }); this.count('chariot'); }
    if (this.has('wind_volley')) {
      const p = this.hero(), back = -p.face;
      this.count('wind_volley');
      this.w.playEffect('arrowRain', { x: p.x, vol: 0.8 });
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.22; this.loose(p.x, p.feet - 24, back * 340 * Math.cos(a), 340 * Math.sin(a) - 30, null, 1, 0.5, '#dff4ff', ''); }
    }
  }

  /** A plunge struck the floor. */
  onSlam(x: number, feet: number) {
    if (!this.has('samson')) return;
    this.count('samson');
    this.w.playEffect('bossSlam', { x, vol: 0.7 });
    for (let i = 0; i < 6; i++) { const side = i % 2 ? 1 : -1, d = 34 + Math.floor(i / 2) * 42; this.queue('star', x + side * d, feet, 0.1 + i * 0.07, 1.2); }
  }

  /** A foe fell to the hero or a power: Brimstone. The burst comes a beat later (so a chain cascades, and no blast
   * runs inside another's loop over the foes). */
  kill(f: FoeLike) {
    if (!this.has('brimstone') || this.brimBudget <= 0) return;
    this.brimBudget--;
    this.count('brimstone');
    this.queue('brim', f.x, f.box.centerY, 0.06, 1);
  }
  private brim(x: number, y: number) {
    fx.ring(x, y, 6, 70, '#ff6a3a', 0.4, 4);
    fx.embers(x, y, 22, '#ff9a3a', 18);
    fx.column(x, y + 20, 34, 90, '#ff7a3a', 0.5);
    this.w.flashLight?.(x, y, 140, '#ff9a3a', 0.35);
    this.w.playEffect('fireBurst', { x, vol: 0.7 });
    this.blast(x, y, 70, 1, { ky: -120 });
  }

  // ---------------------------------------------------------------- the powers

  private thunder(first: FoeLike) {
    this.thunderCd = 0.3;
    this.count('thunder');
    this.w.playEffect('thunder', { x: first.x, vol: 0.8 });
    // The first bolt falls from above; then it leaps foe to foe.
    this.bolt(first.x + 30, first.box.top - 200, first.x, first.box.centerY);
    fx.column(first.x, first.box.bottom, 20, 220, '#c9b8ff', 0.35);
    this.w.flashLight?.(first.x, first.box.centerY, 180, '#c9b8ff', 0.3);
    let from = first, leaps = 0;
    const struck = new Set<FoeLike>([first]);
    while (leaps < 4) {
      let next: FoeLike | null = null, best = 150 * 150;
      for (const f of this.w.foes()) {
        if (!f.alive || struck.has(f)) continue;
        const d = (f.x - from.x) ** 2 + (f.box.centerY - from.box.centerY) ** 2;
        if (d < best) { best = d; next = f; }
      }
      if (!next) break;
      struck.add(next);
      this.bolt(from.x, from.box.centerY, next.x, next.box.centerY);
      this.smite(next, 0.8, Math.sign(next.x - from.x) || 1, true);
      fx.hitSparks(next.x, next.box.centerY, 1, '#e6dcff', 8);
      from = next; leaps++;
    }
  }
  /** A jagged bolt of lightning in short streaks. */
  private bolt(x0: number, y0: number, x1: number, y1: number) {
    const n = 4;
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) {
      const u = i / n, j = i === n ? 0 : (Math.random() - 0.5) * 26;
      const x = x0 + (x1 - x0) * u + j, y = y0 + (y1 - y0) * u + j * 0.5;
      fx.streak(px, py, x, y, i % 2 ? '#e6dcff' : '#ffffff', 0.22, 3);
      px = x; py = y;
    }
  }

  private whirlwind(x: number, y: number) {
    this.count('whirlwind');
    this.wind.t = 1.4; this.wind.x = x; this.wind.y = y; this.wind.tick = 0;
    this.w.playEffect('stormGust', { x });
  }

  private star(x: number, y: number) {
    this.count('falling_star');
    fx.holyBurst(x, y, 20, 1.3);
    fx.ring(x, y, 6, 64, '#fff6dc', 0.4, 4);
    fx.ring(x, y, 4, 40, '#ffd27a', 0.3, 3);
    this.w.flashLight?.(x, y, 170, '#fff6dc', 0.35);
    this.w.playEffect('elemHoly', { x });
    this.blast(x, y, 60, 1.6, { ky: -150, poise: 30 });
  }

  private rain(f: FoeLike) {
    this.count('arrow_rain');
    this.w.playEffect('arrowRain', { x: f.x });
    for (let i = 0; i < 10; i++) this.queue('rain', f.x + (Math.random() - 0.5) * 90, f.box.bottom, 0.15 + i * 0.07, 0.4);
  }

  private queue(kind: Strike['kind'], x: number, y: number, delay: number, mult: number) {
    const s = this.strikes.find((o) => !o.on);
    if (!s) return;
    s.on = true; s.kind = kind; s.x = x; s.y = y; s.t = delay; s.mult = mult;
    if (kind === 'pillar') { this.count('pillar'); fx.embers(x, y - 4, 10, '#ff9a3a', 14); }
  }
  private land(s: Strike) {
    const { x, y } = s;
    if (s.kind === 'brim') this.brim(x, y);
    else if (s.kind === 'star') {
      // Samson's falling stars.
      fx.streak(x - 70, y - 260, x, y, '#ffb347', 0.3, 6);
      fx.ring(x, y, 4, 46, '#ffb347', 0.35, 4, 0.4);
      fx.embers(x, y - 4, 14, '#ffcf6b', 14);
      fx.dust(x, y, 6, 1.4);
      this.w.flashLight?.(x, y - 10, 120, '#ffb347', 0.3);
      this.w.playEffect('fireball', { x, vol: 0.6 });
      this.w.shake(0.008, 120);
      this.blast(x, y - 16, 40, s.mult, { ky: -200, poise: 24 });
    } else if (s.kind === 'pillar') {
      fx.column(x, y, 46, 190, '#ff7a3a', 0.8);
      fx.column(x, y, 18, 210, '#ffe6a8', 0.6);
      fx.embers(x, y - 40, 24, '#ff9a3a', 16);
      this.w.flashLight?.(x, y - 60, 180, '#ff9a3a', 0.5);
      this.w.playEffect('pillarFire', { x, vol: 0.8 });
      for (const f of this.w.foes()) {
        if (!f.alive || Math.abs(f.x - x) > 26 + f.box.width / 2 || f.box.bottom < y - 200 || f.box.top > y + 4) continue;
        if (f.hit(this.dmg(s.mult), 1, 1.5, false, { kind: 'ability', kx: 0, ky: -280, poise: 40, launch: true })) this.slain(f);
      }
    } else {
      fx.streak(x + 24, y - 170, x, y, '#ffd27a', 0.18, 2);
      fx.hitSparks(x, y - 2, -1, '#ffd27a', 4);
      this.blast(x, y - 14, 18, s.mult, { ky: -40, poise: 6 });
    }
  }

  /** A seeking bolt from (x, y). `target` null: it flies on and picks up the nearest foe ahead. */
  private loose(x: number, y: number, vx: number, vy: number, from: FoeLike | null, hops: number, mult: number, css: string, tally: string) {
    const b = this.bolts.find((o) => !o.on);
    if (!b) return;
    if (tally) this.count(tally);
    b.on = true; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.t = 0; b.hops = hops; b.mult = mult; b.css = css; b.target = null;
    b.hit.clear(); if (from) b.hit.add(from);
    b.img.setTint(hex(css)).setVisible(true); b.glow.setTint(hex(css)).setVisible(true);
  }
  private seek(b: Bolt) {
    let best: FoeLike | null = null, bd = 260 * 260;
    for (const f of this.w.foes()) {
      if (!f.alive || b.hit.has(f)) continue;
      const d = (f.x - b.x) ** 2 + (f.box.centerY - b.y) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // ---------------------------------------------------------------- each frame

  update(dt: number) {
    this.clock += dt;
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 0.5; this.refresh(); }
    this.thunderCd -= dt; this.pillarCd -= dt; this.chainT -= dt;
    this.brimT -= dt; if (this.brimT <= 0) { this.brimT = 0.4; this.brimBudget = 4; }
    const p = this.hero();
    if (!p) return;

    // The Chariot's road: patches of fire left along the dodge.
    if (this.roadT > 0) {
      this.roadT -= dt; this.roadDrop -= dt;
      if (this.roadDrop <= 0) {
        this.roadDrop = 0.05;
        const f = this.fires.find((o) => o.t <= 0) ?? this.fires[0];
        f.t = 1.8; f.x = p.x; f.y = p.feet; f.tick = 0;
        fx.column(p.x, p.feet, 22, 46, '#ff9a3a', 0.4);
      }
    }
    for (const f of this.fires) {
      if (f.t <= 0) continue;
      f.t -= dt; f.tick -= dt;
      if (Math.random() < dt * 22) fx.spawn(PK.Flame, f.x + (Math.random() - 0.5) * 14, f.y - 2, (Math.random() - 0.5) * 10, -40 - Math.random() * 40, 0.5, 4, 1, Math.random() < 0.5 ? '#ff9a3a' : '#ffcf6b', -30);
      if (f.tick <= 0) { f.tick = 0.25; this.blast(f.x, f.y - 12, 16, 0.3, { kx: 10, ky: -20, poise: 4 }); }
    }

    // The swords of Gideon circle the hero.
    const swords = this.swordsT > 0 && !p.dead;
    if (swords) {
      this.swordsT -= dt; this.swordA += dt * 5.5;
      const cx = p.x, cy = p.feet - 26, fade = Math.min(1, this.swordsT * 2);
      for (let i = 0; i < 3; i++) {
        const a = this.swordA + i * (Math.PI * 2 / 3), x = cx + Math.cos(a) * 38, y = cy + Math.sin(a) * 26;
        this.swords[i].setVisible(true).setPosition(x, y).setRotation(a + Math.PI / 2).setScale(0.5, 1.6).setAlpha(fade);
        this.swordGlow[i].setVisible(true).setPosition(x, y).setScale(0.35).setAlpha(0.7 * fade);
        if (Math.random() < dt * 20) fx.spawn(PK.Mote, x, y, 0, 0, 0.3, 2, 0, '#fff1c4');
        for (const f of this.w.foes()) {
          if (!f.alive || x < f.box.left - 6 || x > f.box.right + 6 || y < f.box.top || y > f.box.bottom) continue;
          if ((this.swordHit.get(f) ?? 0) > this.clock) continue;
          this.swordHit.set(f, this.clock + 0.35);
          fx.hitSparks(x, y, Math.sign(f.x - cx) || 1, '#fff1c4', 5);
          this.smite(f, 0.45, Math.sign(f.x - cx) || 1);
        }
      }
    } else if (this.swords[0].visible) { for (const s of this.swords) s.setVisible(false); for (const g of this.swordGlow) g.setVisible(false); this.swordHit.clear(); }

    // The whirlwind drags foes in and shreds them.
    const wd = this.wind;
    if (wd.t > 0) {
      wd.t -= dt; wd.tick -= dt;
      if (Math.random() < dt * 30) { const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 60; fx.spawn(PK.Dust, wd.x + Math.cos(a) * r, wd.y + Math.sin(a) * r * 0.5, -Math.sin(a) * 180, Math.cos(a) * 60 - 40, 0.4, 3, 1, '#cfe8ff'); }
      if (wd.tick <= 0) {
        wd.tick = 0.2;
        fx.ring(wd.x, wd.y + 10, 10, 90, '#9fd8ff', 0.3, 3, 0.35);
        this.blast(wd.x, wd.y, 110, 0.3, { kx: 140, ky: -60, poise: 8, pull: true });
      }
    }

    // Strikes queued a beat ahead.
    for (const s of this.strikes) { if (!s.on) continue; s.t -= dt; if (s.t <= 0) { s.on = false; this.land(s); } }

    // Seeking bolts.
    for (const b of this.bolts) {
      if (!b.on) continue;
      b.t += dt;
      if (b.t > 2.2) { b.on = false; b.img.setVisible(false); b.glow.setVisible(false); continue; }
      if (!b.target || !b.target.alive) b.target = b.t > 0.08 ? this.seek(b) : null;
      if (b.target) {
        const dx = b.target.x - b.x, dy = b.target.box.centerY - b.y, d = Math.max(1, Math.hypot(dx, dy)), sp = 420, k = Math.min(1, dt * 9);
        b.vx += (dx / d * sp - b.vx) * k; b.vy += (dy / d * sp - b.vy) * k;
        if (d < 12) {
          b.hit.add(b.target);
          fx.hitSparks(b.x, b.y, Math.sign(b.vx) || 1, '#ffffff', 7);
          this.w.flashLight?.(b.x, b.y, 80, '#c8f0e4', 0.2);
          this.smite(b.target, b.mult, Math.sign(b.vx) || 1, true);
          b.target = null;
          if (--b.hops <= 0) { b.on = false; b.img.setVisible(false); b.glow.setVisible(false); continue; }
        }
      } else b.vy += 200 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.img.setPosition(b.x, b.y).setRotation(Math.atan2(b.vy, b.vx)).setScale(0.45, 1.3);
      b.glow.setPosition(b.x, b.y).setScale(0.3);
      if (Math.random() < dt * 30) fx.spawn(PK.Mote, b.x, b.y, 0, 0, 0.25, 2, 0, b.css);
    }
  }

  /** Leaving a room: everything in flight goes. */
  clear() {
    for (const s of this.strikes) s.on = false;
    for (const f of this.fires) f.t = 0;
    for (const b of this.bolts) { b.on = false; b.img.setVisible(false); b.glow.setVisible(false); }
    this.swordsT = 0; this.wind.t = 0; this.roadT = 0;
    for (const s of this.swords) s.setVisible(false); for (const g of this.swordGlow) g.setVisible(false);
    this.swordHit.clear();
  }

  destroy() { for (const o of [...this.swords, ...this.swordGlow, ...this.bolts.flatMap((b) => [b.img, b.glow])]) o.destroy(); }
}
