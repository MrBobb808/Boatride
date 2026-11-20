// Dynamic lighting (Phaser 4's lights, WebGL only, Medium and High quality). The game already gathers every light of
// the frame into the shared light list (the room's lamps, flashes, arrows, the forms, Uri's fire...), which carves the
// darkness of a dim room. Each frame the strongest of them near the view are copied into a small pool of Phaser lights:
// - the heroes and Uri's shaman are lit per pixel through normal maps worked out from their own art (normalMaps.ts),
//   so a fireball passing on the left lights the side of the figure that faces it;
// - the room's art and the classic layer (foes, bosses, people) are lit with flat normals: pools of coloured light
//   that move with what makes them.
// The ambient is full white, so with no light near, every pixel looks exactly as it did; lights only add.
import Phaser from 'phaser';
import { lighting } from '../classic/shim/lighting';
import { settings } from '../classic/shim/settings';
import { lightTexture } from './normalMaps';
import { softwareGl } from './screenFx';
import type { World } from '../scenes/World';

/** Lights in the pool (Phaser's own limit is 10 a camera). */
const N = 8;
/** The faint glow every foe carries in the dark: it marks them, it does not light the room. */
const FOE_GLOW = '#c86a5a';

export class DynLights {
  readonly on: boolean;
  private pool: Phaser.GameObjects.Light[] = [];
  private colors = new Map<string, number>();
  private best = new Int32Array(N);
  private score = new Float32Array(N);
  private ready = new Set<string>();
  /** For tests: lights in use this frame, and figures lit. */
  readonly stats = { lights: 0, figures: 0 };

  constructor(private w: World, gpu: boolean) {
    this.on = gpu && !softwareGl(w) && settings.quality !== 'low';
    if (!this.on) return;
    w.lights.enable().setAmbientColor(0xffffff);
    for (let i = 0; i < N; i++) this.pool.push(w.lights.addLight(0, 0, 1, 0xffffff, 0));
  }

  /** A surface lit with flat normals: the room's art, the classic layer. */
  surface(o: Phaser.GameObjects.Image | undefined) { if (this.on && o) o.setLighting(true); }

  /** A figure lit through its own normals. Called each frame after it has been posed: a figure drawn flipped wears the
   * twin of its texture whose normals are mirrored. The first time a texture is lit its normals are worked out. */
  figure(s: Phaser.GameObjects.Sprite | undefined) {
    if (!this.on || !s || !s.visible || !s.texture) return;
    const key = s.texture.key, base = key.endsWith('~L') ? key.slice(0, -2) : key;
    if (!this.ready.has(base)) {
      if (base === '__MISSING' || !lightTexture(this.w, base)) return;
      this.ready.add(base);
    }
    if (!s.lighting) s.setLighting(true);
    const want = s.flipX ? base + '~L' : base;
    if (key !== want) s.setTexture(want, s.frame.name);
    this.stats.figures++;
  }

  private color(c: string) {
    let v = this.colors.get(c);
    if (v === undefined) { v = Phaser.Display.Color.HexStringToColor(c).color; this.colors.set(c, v); }
    return v;
  }

  /** Copy the strongest lights near the view into the pool. Run once the frame's light list is complete. */
  step() {
    this.stats.figures = 0;
    if (!this.on) return;
    const v = this.w.cameras.main.worldView, cx = v.centerX, cy = v.centerY, reach = Math.max(v.width, v.height);
    const p = this.w.player, L = lighting.lights;
    this.score.fill(-1);
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (l.c === FOE_GLOW || l.a <= 0.02) continue;
      // The hero's own lamp lights the dark around him, not his own figure.
      if (Math.abs(l.x - p.x) < 3 && Math.abs(l.y - (p.feet - 21)) < 4 && l.bloom < 0.3) continue;
      if (l.x < v.x - l.r || l.x > v.right + l.r || l.y < v.y - l.r || l.y > v.bottom + l.r) continue;
      const s = l.a * (0.4 + l.bloom) * l.r / (1 + Math.hypot(l.x - cx, l.y - cy) / reach);
      let j = N - 1;
      if (s <= this.score[j]) continue;
      while (j > 0 && this.score[j - 1] < s) { this.score[j] = this.score[j - 1]; this.best[j] = this.best[j - 1]; j--; }
      this.score[j] = s; this.best[j] = i;
    }
    let used = 0;
    for (let j = 0; j < N; j++) {
      const lt = this.pool[j];
      if (this.score[j] < 0) { lt.intensity = 0; lt.radius = 1; continue; }
      const l = L[this.best[j]];
      lt.x = l.x; lt.y = l.y; lt.radius = l.r * 1.5; lt.z = lt.radius * 0.22;
      lt.setColor(this.color(l.c));
      lt.intensity = l.a * (0.2 + 0.4 * l.bloom) * (settings.reduceFlashes ? 0.7 : 1);
      used++;
    }
    this.stats.lights = used;
  }

  destroy() {
    if (!this.on) return;
    for (const l of this.pool) this.w.lights.removeLight(l);
    this.pool.length = 0;
  }
}
