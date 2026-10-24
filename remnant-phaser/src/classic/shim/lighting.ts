// Stand-in for remnant/src/render/lighting.ts: lights the original modules add
// each frame are kept here and drawn as additive glows by the classic layer
// (the Phaser rooms have no darkness pass yet).

export interface Light { x: number; y: number; r: number; c: string; a: number; bloom: number }

export class Lighting {
  lights: Light[] = [];
  private pool: Light[] = [];
  begin() {
    for (const l of this.lights) this.pool.push(l);
    this.lights.length = 0;
  }
  add(x: number, y: number, r: number, c: string, a = 1, bloom = 0.5) {
    const l = this.pool.pop() ?? ({} as Light);
    l.x = x; l.y = y; l.r = r; l.c = c; l.a = a; l.bloom = bloom;
    this.lights.push(l);
  }
}
export const lighting = new Lighting();
