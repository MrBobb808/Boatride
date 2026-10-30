// Screen effects (POLISH_PLAN §11d), Phaser 4 camera filters, presentation only: bloom on light, fire and the
// forms; a colour grade for each place (the cold of the snow, the heat of the foundry, the teal of the storm
// coast); an underwater cast; and, while the letterbox is in (a boss's entrance, a Super), a harder grade, a
// deeper vignette and film grain. WebGL only, apart from the grain; bloom only at the top quality tier.
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

export class ScreenFx {
  /** The current amounts, for the debug API and tests. */
  cine = 0;
  under = 0;
  biome = '';
  private grade?: Phaser.Filters.ColorMatrix;
  private cinema?: Phaser.Filters.ColorMatrix;
  private water?: Phaser.Filters.ColorMatrix;
  private vignette?: Phaser.Filters.Vignette;
  private bloom?: { parallelFilters: Phaser.Filters.ParallelFilters; threshold: Phaser.Filters.Threshold; blur: Phaser.Filters.Blur };
  private grain: Phaser.GameObjects.TileSprite;
  private glowT = 0;

  constructor(private w: World, gpu: boolean) {
    if (!w.textures.exists('fx-grain')) {
      const t = w.textures.createCanvas('fx-grain', 128, 128)!, c = t.getContext(), img = c.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.round(Math.random() * 110); }
      c.putImageData(img, 0, 0); t.refresh();
    }
    this.grain = w.add.tileSprite(0, 0, 8, 8, 'fx-grain').setOrigin(0).setDepth(19.6).setVisible(false);
    if (!gpu) return;
    const f = w.cameras.main.filters.external;
    this.grade = f.addColorMatrix();
    this.water = f.addColorMatrix();
    this.water.colorMatrix.saturate(-0.15).multiply([0.78, 0, 0, 0, 0, 0, 0.98, 0, 0, 0.02, 0, 0, 1.12, 0, 0.05, 0, 0, 0, 1, 0], true);
    this.water.colorMatrix.alpha = 0;
    this.cinema = f.addColorMatrix();
    this.cinema.colorMatrix.saturate(-0.22).contrast(0.16, true).brightness(0.96, true);
    this.cinema.colorMatrix.alpha = 0;
    this.vignette = f.addVignette(0.5, 0.5, 0.82, 0.25);
    this.bloom = Phaser.Actions.AddEffectBloom(w.cameras.main, { threshold: 0.62, blurRadius: 2, blurSteps: 4, blurQuality: 0, blendAmount: 0.4 })[0];
  }

  /** The place's grade, set once as the room loads. */
  room(biome: string) {
    this.biome = biome;
    if (!this.grade) return;
    const g = GRADES[biome] ?? NONE, m = this.grade.colorMatrix;
    m.saturate(g.sat).contrast(g.con, true).multiply([g.tint[0], 0, 0, 0, 0, 0, g.tint[1], 0, 0, 0, 0, 0, g.tint[2], 0, 0, 0, 0, 0, 1, 0], true);
  }

  /** Bloom swells briefly on big light (a strike of lightning, a finisher). */
  swell(t = 0.5) { this.glowT = Math.max(this.glowT, t); }

  step(dt: number, v: Phaser.Geom.Rectangle, tier: number, o: { letterbox: number; intro: boolean; submerged: boolean; form: boolean }) {
    const ease = 1 - Math.exp(-dt * 5);
    this.cine += ((o.intro ? Math.max(1, o.letterbox) : o.letterbox) - this.cine) * ease;
    this.under += ((o.submerged ? 1 : 0) - this.under) * ease;
    this.glowT = Math.max(0, this.glowT - dt);
    const calm = settings.reduceFlashes;
    if (this.grade) {
      this.grade.active = tier > 0;
      this.cinema!.colorMatrix.alpha = this.cine; this.cinema!.active = this.cine > 0.01;
      this.water!.colorMatrix.alpha = this.under * 0.85; this.water!.active = this.under > 0.01;
      const vg = this.vignette!;
      vg.radius = 0.82 - this.cine * 0.16 - this.under * 0.12; vg.strength = 0.25 + this.cine * 0.3 + this.under * 0.2;
    }
    if (this.bloom) {
      const on = tier === 2;
      this.bloom.parallelFilters.active = on;
      if (on) this.bloom.parallelFilters.blend.amount = (calm ? 0.25 : 0.4) + (o.form ? 0.2 : 0) + (calm ? 0 : this.glowT * 0.6);
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
    for (const x of [this.grade, this.water, this.cinema, this.vignette, this.bloom?.parallelFilters]) if (x) f.remove(x);
  }
}
