// Tirzah's six abilities (POLISH_PLAN §5a). Each is loosed through her bow's
// arrow pool; the catalog (names, costs, cooldowns, verses) is in abilities.ts.
import Phaser from 'phaser';
import { settings } from '../classic/shim/settings';
import { TILE, isSolid, type T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import type { Bow } from './bow';
import type { ArcherSkillId } from './abilities';

const MARK_T = 8, RAIN_T = 2.5, EYE_T = 2, QUIVER_T = 10, EYE_SHOTS = 3;

export class ArcherKit {
  /** Hunter's Mark: the marked foe and how long it stays marked. */
  mark: FoeLike | null = null;
  markT = 0;
  /** Rain of Arrows: where it falls, how long, and the next arrow. */
  private rainX = 0;
  rainT = 0;
  /** The rain's patter, renewed while it falls. */
  private patterT = 0;
  private rainNext = 0;
  /** Watchman's Eye: slowed time and the precision shots left. */
  eyeT = 0;
  eyeShots = 0;
  /** Quiver of the Mighty: every shot splits while it lasts. */
  quiverT = 0;
  /** Jonathan's Volley: three planted arrows that burst back. */
  /** `t` starts below zero so the three land one after another. */
  private plants: { img: Phaser.GameObjects.Image; x: number; y: number; t: number }[];
  private markImg: Phaser.GameObjects.Image;
  private weak: Phaser.GameObjects.Image[];

  constructor(private w: WorldApi, private p: Player, private bow: Bow) {
    const sc = w.sc;
    this.plants = Array.from({ length: 3 }, () => ({ img: sc.add.image(0, 0, 'arrows', 9).setOrigin(0.86, 0.6).setScale(0.26).setDepth(12.9).setVisible(false), x: 0, y: 0, t: 0 }));
    this.markImg = sc.add.image(0, 0, 'vfx-impacts', 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a6a).setDepth(13).setVisible(false);
    this.weak = Array.from({ length: 6 }, () => sc.add.image(0, 0, 'vfx-impacts', 0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.14).setDepth(13).setVisible(false));
  }

  /** Whether a cast can find what it needs (Jonathan's Volley needs ground ahead). */
  canCast(id: ArcherSkillId) {
    if (id === 'jonathan' && this.groundAhead() === null) { this.w.toast('No ground ahead to plant the arrows.'); return false; }
    return true;
  }

  cast(id: ArcherSkillId) {
    const p = this.p, w = this.w;
    switch (id) {
      case 'deliverance': {
        // One blazing arrow down the whole line: it knocks foes down and breaks guards.
        this.bow.spawn({ x: p.x + p.face * 15, y: p.feet - 31, vx: p.face * 720, vy: 0, life: 1, damage: p.power() * 3.2, pierce: 30, move: 'deliverance', guard: true, knock: true, scale: 0.5, frame: 2 });
        w.burst(p.x + p.face * 20, p.feet - 31, 2);
        w.floatText(p.x, p.feet - 64, 'DELIVERANCE', '#ffd27a');
        w.playEffect('deliverance');
        break;
      }
      case 'jonathan': {
        const x = this.groundAhead()!;
        this.plants.forEach((o, i) => {
          o.x = x + p.face * i * 22; o.y = this.floorAt(o.x) ?? p.feet; o.t = -0.15 * i;
          o.img.setPosition(o.x, o.y + 2).setFlipX(p.face < 0).setAlpha(0).setVisible(true);
        });
        w.playEffect('volleyPlant', { x });
        break;
      }
      case 'mark': {
        const f = this.target();
        if (!f) { w.toast('No foe in sight to mark.'); return; }
        this.mark = f; this.markT = MARK_T;
        w.echoesFocus(f);
        w.floatText(f.x, f.box.top - 12, 'MARKED', '#ff8a6a');
        w.playEffect('markLock');
        break;
      }
      case 'rain': {
        const f = this.mark?.alive ? this.mark : this.target();
        this.rainX = f ? f.x : p.x + p.face * 130;
        this.rainT = RAIN_T; this.rainNext = 0; this.patterT = 0;
        break;
      }
      case 'watchman': {
        this.eyeT = EYE_T; this.eyeShots = EYE_SHOTS;
        w.slowTime(EYE_T, 0.35);
        w.floatText(p.x, p.feet - 64, "WATCHMAN'S EYE", '#fff1c4');
        w.playEffect('watchEye');
        break;
      }
      case 'quiver': {
        this.quiverT = QUIVER_T;
        w.floatText(p.x, p.feet - 64, 'QUIVER OF THE MIGHTY', '#ffd27a');
        w.playEffect('quiverMight');
        break;
      }
    }
  }

  /** The nearest foe ahead in sight, else the nearest in sight at all. */
  private target() {
    const p = this.p;
    let best: FoeLike | null = null, bd = 340;
    for (const f of this.w.foes()) {
      if (!f.alive || !p.lineOfSight(f.x, f.box.centerY)) continue;
      const d = Math.abs(f.x - p.x) + (Math.sign(f.x - p.x) === p.face ? 0 : 120);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  /** Where Jonathan's arrows plant: just past the nearest foe ahead, or 160 px ahead, on open floor. */
  private groundAhead() {
    const p = this.p, f = this.target();
    const x0 = f && Math.sign(f.x - p.x) === p.face ? f.x + p.face * (f.box.width / 2 + 24) : p.x + p.face * 160;
    for (let x = x0; Math.abs(x - p.x) > 30; x -= p.face * 8) { const y = this.floorAt(x); if (y !== null && Math.abs(y - p.feet) < 48) return x; }
    return null;
  }
  private floorAt(x: number): number | null {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.floor((this.p.feet - 40) / TILE); ty < Math.floor((this.p.feet + 60) / TILE); ty++)
      if (!isSolid(this.w.tileAt(tx, ty) as T) && isSolid(this.w.tileAt(tx, ty + 1) as T)) return (ty + 1) * TILE;
    return null;
  }

  /** The marked foe takes a quarter more from her. */
  damageFor(f: FoeLike) { return this.mark === f && this.markT > 0 ? 1.25 : 1; }

  update(dt: number) {
    const p = this.p, w = this.w;
    this.quiverT = Math.max(0, this.quiverT - dt);
    // Hunter's Mark: a turning star over the foe.
    this.markT = Math.max(0, this.markT - dt);
    if (this.mark && (!this.markT || !this.mark.alive)) { this.mark = null; this.markT = 0; }
    this.markImg.setVisible(!!this.mark);
    if (this.mark) this.markImg.setPosition(this.mark.x, this.mark.box.top - 10).setRotation(w.sc.time.now / 300).setScale(0.18 + Math.sin(w.sc.time.now / 120) * 0.02).setAlpha(settings.reduceFlashes ? 0.5 : 0.85);
    // Jonathan's Volley: the planted arrows rise into view, then burst back toward her from behind the foes.
    for (const o of this.plants) {
      if (!o.img.visible) continue;
      o.t += dt;
      o.img.setAlpha(Math.min(1, Math.max(0, o.t) * 6));
      if (o.t >= 0.75) {
        o.img.setVisible(false);
        const dir = Math.sign(p.x - o.x) || -p.face, y = o.y - 20, d = Math.abs(p.x - o.x);
        this.bow.spawn({ x: o.x, y, vx: dir * 640, vy: 0, life: d / 640 + 0.1, damage: p.power() * 1.3, pierce: 4, move: 'jonathan', back: true, frame: -1 });
        w.spark(o.x, y, 0xa6efdc, 6);
      }
    }
    // Rain of Arrows.
    if (this.rainT > 0) {
      this.rainT -= dt; this.rainNext -= dt; this.patterT -= dt;
      if (this.patterT <= 0) { this.patterT = 0.55; w.playEffect('arrowRain', { x: this.rainX }); }
      while (this.rainNext <= 0 && this.rainT > 0) {
        this.rainNext += 0.09;
        const x = this.rainX + Phaser.Math.Between(-55, 55);
        this.bow.spawn({ x: x - 30, y: p.feet - 230, vx: 90, vy: 620, life: 0.6, damage: p.power() * 0.45, pierce: 1, move: 'rain', frame: -1 });
      }
    }
    // Watchman's Eye: weak points glow on the foes in view.
    this.eyeT = Math.max(0, this.eyeT - dt);
    let n = 0;
    if (this.eyeT > 0 || this.eyeShots > 0) for (const f of w.foes()) {
      if (n >= this.weak.length) break;
      if (!f.alive || Math.abs(f.x - p.x) > 320) continue;
      this.weak[n++].setPosition(f.x, f.box.top + f.box.height * 0.12).setRotation(w.sc.time.now / 200).setAlpha(0.8).setVisible(true);
    }
    for (let i = n; i < this.weak.length; i++) if (this.weak[i].visible) this.weak[i].setVisible(false);
  }

  destroy() { for (const o of this.plants) o.img.destroy(); this.markImg.destroy(); for (const i of this.weak) i.destroy(); }
}
