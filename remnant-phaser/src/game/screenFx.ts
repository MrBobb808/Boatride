// Screen effects (POLISH_PLAN §11d), Phaser 4 camera filters, presentation only: bloom on light, fire and the
// forms; a colour grade for each place (the cold of the snow, the heat of the foundry, the teal of the storm
// coast); an underwater cast; and, while the letterbox is in (a boss's entrance, a Super), a harder grade, a
// deeper vignette and film grain. WebGL only, apart from the grain. The grade, the water and the cinema are one
// colour-matrix pass; bloom (a full-screen blur) runs only in the moments that call for it, at the top tier.
import Phaser from 'phaser';
import { settings } from '../classic/shim/settings';
import type { World } from '../scenes/World';

/** Saturation and contrast offsets (0 = unchanged) and a red/green/blue tint for each biome. */
interface Grade { sat: number; con: number; tint: readonly [number, number, number] }
const GRADES: Record<string, Grade> = {
  village: { sat: -0.12, con: 0.04, tint: [1.04, 0.98, 0.92] },
  sanctuary: { sat: 0.04, con: 0.04, tint: [1.05, 1, 0.9] },
  temple: { sat: 0.04, con: 0.05, tint: [1.05, 1, 0.9] },
  sanctum: { sat: 0.06, con: 0.06, tint: [1.06, 0.99, 0.88] },
  crypt: { sat: -0.16, con: 0.04, tint: [0.93, 0.98, 1.06] },
  hive: { sat: -0.1, con: 0.05, tint: [1.02, 1, 0.9] },
  plain: { sat: 0, con: 0.03, tint: [1.05, 1, 0.9] },
  tower: { sat: 0, con: 0.04, tint: [1.03, 1, 0.94] },
  valley: { sat: -0.22, con: 0.04, tint: [1.03, 1, 0.93] },
  trial: { sat: 0, con: 0.03, tint: [1, 1, 1] },
  dura: { sat: 0.02, con: 0.04, tint: [1.06, 1, 0.88] },
  babylon: { sat: 0.04, con: 0.05, tint: [1.05, 0.99, 0.9] },
  furnace: { sat: 0.08, con: 0.08, tint: [1.1, 0.96, 0.85] },
  riverbed: { sat: -0.04, con: 0.04, tint: [0.98, 0.99, 1.05] },
  gardens: { sat: 0.06, con: 0.04, tint: [0.98, 1.02, 1.04] },
  palace: { sat: 0.04, con: 0.05, tint: [1.04, 0.99, 0.94] },
  hiddekel: { sat: 0, con: 0.03, tint: [0.99, 1, 1.03] },
  shushan: { sat: 0.02, con: 0.04, tint: [1.03, 1, 0.95] },
  highplaces: { sat: -0.06, con: 0.06, tint: [0.97, 0.98, 1.05] },
  hunt: { sat: -0.18, con: 0.05, tint: [0.9, 0.98, 1.1] },
  plague: { sat: -0.1, con: 0.05, tint: [0.97, 1.05, 0.9] },
  cinders: { sat: 0.08, con: 0.08, tint: [1.1, 0.96, 0.85] },
  grecia: { sat: -0.12, con: 0.08, tint: [0.92, 1, 1.06] },
  rest: { sat: 0.04, con: 0.03, tint: [1.04, 1, 0.95] },
};
const NONE: Grade = { sat: 0, con: 0, tint: [1, 1, 1] };

/** A 4×5 colour matrix, rows red, green, blue, alpha; offsets in 0–255, as Phaser's ColorMatrix keeps them. */
type Mat = Float32Array;
const mat = (r = 1, g = 1, b = 1, o: readonly number[] = [0, 0, 0]): Mat => Float32Array.from([r, 0, 0, 0, o[0], 0, g, 0, 0, o[1], 0, 0, b, 0, o[2], 0, 0, 0, 1, 0]);
const sat = (v: number): Mat => { const x = 1 + v * 2 / 3, y = (x - 1) * -0.5; return Float32Array.from([x, y, y, 0, 0, y, x, y, 0, 0, y, y, x, 0, 0, 0, 0, 0, 1, 0]); };
/** Contrast about the middle grey. */
const con = (c: number): Mat => mat(1 + c, 1 + c, 1 + c, [-128 * c, -128 * c, -128 * c]);
/** `first`, then `then`. */
function then(first: Mat, next: Mat): Mat {
  const m = new Float32Array(20);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += next[i * 5 + k] * first[k * 5 + j]; m[i * 5 + j] = v; }
    let o = next[i * 5 + 4]; for (let k = 0; k < 4; k++) o += next[i * 5 + k] * first[k * 5 + 4]; m[i * 5 + 4] = o;
  }
  return m;
}
const chain = (...ms: Mat[]) => ms.reduce(then);

export class ScreenFx {
  /** The current amounts, for the debug API and tests. */
  cine = 0;
  under = 0;
  glow = 0;
  biome = '';
  private color?: Phaser.Filters.ColorMatrix;
  private vignette?: Phaser.Filters.Vignette;
  private bloom?: { parallelFilters: Phaser.Filters.ParallelFilters; threshold: Phaser.Filters.Threshold; blur: Phaser.Filters.Blur };
  private grain: Phaser.GameObjects.TileSprite;
  private glowT = 0;
  /** The place's grade alone, under the cinema, and under water; blended into `out` without allocating. */
  private base: Mat = mat();
  private cineM: Mat = mat();
  private waterM: Mat = mat();
  private out = new Float32Array(20);
  private shown = [-1, -1];

  constructor(private w: World, gpu: boolean) {
    if (!w.textures.exists('fx-grain')) {
      const t = w.textures.createCanvas('fx-grain', 128, 128)!, c = t.getContext(), img = c.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.round(Math.random() * 110); }
      c.putImageData(img, 0, 0); t.refresh();
    }
    this.grain = w.add.tileSprite(0, 0, 8, 8, 'fx-grain').setOrigin(0).setDepth(19.6).setVisible(false);
    if (!gpu) return;
    const f = w.cameras.main.filters.external;
    this.color = f.addColorMatrix();
    this.vignette = f.addVignette(0.5, 0.5, 0.82, 0);
    this.vignette.active = false;
    this.bloom = Phaser.Actions.AddEffectBloom(w.cameras.main, { threshold: 0.62, blurRadius: 2, blurSteps: 3, blurQuality: 0, blendAmount: 0 })[0];
    this.bloom.parallelFilters.active = false;
  }

  /** The place's grade, worked out once as the room loads. */
  room(biome: string) {
    this.biome = biome;
    const g = GRADES[biome] ?? NONE;
    this.base = chain(sat(g.sat), con(g.con), mat(g.tint[0], g.tint[1], g.tint[2]));
    this.cineM = chain(this.base, sat(-0.22), con(0.14), mat(0.97, 0.97, 0.97));
    this.waterM = chain(this.base, sat(-0.15), mat(0.78, 0.98, 1.12, [0, 6, 14]));
    this.shown[0] = this.shown[1] = -1;
  }

  /** Bloom swells briefly on big light (a strike of lightning, a finisher). */
  swell(t = 0.5) { this.glowT = Math.max(this.glowT, t); }

  step(dt: number, v: Phaser.Geom.Rectangle, tier: number, o: { letterbox: number; intro: boolean; submerged: boolean; form: boolean }) {
    const ease = 1 - Math.exp(-dt * 5);
    this.cine += ((o.intro ? Math.max(1, o.letterbox) : o.letterbox) - this.cine) * ease;
    this.under += ((o.submerged ? 1 : 0) - this.under) * ease;
    this.glowT = Math.max(0, this.glowT - dt);
    const calm = settings.reduceFlashes;
    // Bloom only while something bright is happening: a form, a flash, a boss's entrance.
    const glow = tier === 2 ? (o.form ? 0.5 : 0) + (calm ? 0 : this.glowT * 0.9) + this.cine * 0.25 : 0;
    this.glow += (glow * (calm ? 0.6 : 1) - this.glow) * (1 - Math.exp(-dt * 8));
    if (this.color) {
      const c = this.cine, u = this.under * 0.85;
      this.color.active = tier > 0 || c > 0.01 || u > 0.01;
      if (Math.abs(c - this.shown[0]) > 0.003 || Math.abs(u - this.shown[1]) > 0.003) {
        this.shown[0] = c; this.shown[1] = u;
        const b = this.base, cm = this.cineM, wm = this.waterM, out = this.out;
        for (let i = 0; i < 20; i++) out[i] = b[i] + (cm[i] - b[i]) * c + (wm[i] - b[i]) * u;
        this.color.colorMatrix.set(out);
      }
      // The vignette closes in for the cinema and the water only; at rest the frame keeps one pass.
      const vg = this.vignette!, close = Math.max(c, this.under);
      vg.active = close > 0.01;
      vg.radius = 0.82 - c * 0.16 - this.under * 0.12; vg.strength = close * 0.3 + c * 0.25 + this.under * 0.2;
    }
    if (this.bloom) {
      const on = this.glow > 0.02;
      this.bloom.parallelFilters.active = on;
      if (on) this.bloom.parallelFilters.blend.amount = this.glow;
    }
    const grain = this.cine > 0.02 && tier > 0;
    this.grain.setVisible(grain);
    if (grain) {
      if (this.grain.width !== Math.ceil(v.width) + 2 || this.grain.height !== Math.ceil(v.height) + 2) this.grain.setSize(Math.ceil(v.width) + 2, Math.ceil(v.height) + 2);
      this.grain.setPosition(v.x - 1, v.y - 1).setAlpha(this.cine * (calm ? 0.05 : 0.11));
      this.grain.tilePositionX = (Math.random() * 128) | 0; this.grain.tilePositionY = (Math.random() * 128) | 0;
    }
  }

  destroy() {
    this.grain.destroy();
    const cam = this.w.cameras.main;
    if (!cam) return;
    const f = cam.filters.external;
    for (const x of [this.color, this.vignette, this.bloom?.parallelFilters]) if (x) f.remove(x);
  }
}
