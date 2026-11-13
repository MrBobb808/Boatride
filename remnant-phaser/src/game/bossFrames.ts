// Cuts the Fallen Crown atlases into frames at boot, apart from the boss code so the first screen need not load it
// (NEXT_PLAN A3).
import type Phaser from 'phaser';

export function cutBossFrames(scene: Phaser.Scene) {
  // Each frame carries its own pivot (the feet), so a sprite stays planted as its crop width changes.
  const add = (tex: string, name: string, c: number[]) => {
    const t = scene.textures.get(tex);
    if (!t || t.key === '__MISSING' || t.has(name)) return;
    const f = t.add(name, 0, c[0], c[1], c[2], c[3]);
    if (!f) return;
    f.customPivot = true;
    f.pivotX = c[4] / c[2];
    f.pivotY = c[5] / c[3];
  };
  const BEAST = [[0, 0, 355, 512, 211, 500], [355, 0, 380, 512, 192, 500], [735, 0, 480, 512, 226, 500], [1215, 0, 321, 512, 177, 500], [0, 512, 425, 512, 228, 472], [425, 512, 380, 512, 190, 472], [805, 512, 365, 512, 185, 472], [1170, 512, 366, 512, 193, 472]];
  BEAST.forEach((c, i) => add('varkhos', `beast_monarch-${i}`, c));
  const size = scene.textures.get('morvane').getSourceImage().width / 2;
  for (let i = 0; i < 8; i++) {
    const idx = i === 0 ? 0 : i === 7 || i === 6 ? 3 : i === 1 ? 1 : 2;
    add('morvane', `plague_monarch-${i}`, [(idx % 2) * size, Math.floor(idx / 2) * size, size, size, size * 0.6, size * 0.96]);
  }
  const unit = scene.textures.get('azkar').getSourceImage().width / 1254;
  const CINDER = [[0, 0, 660, 640, 395, 604], [660, 0, 594, 640, 420, 612], [0, 640, 760, 614, 395, 548], [760, 640, 494, 614, 295, 546]];
  CINDER.forEach((c, i) => add('azkar', `cinder_monarch-${i}`, c.map((v) => v * unit)));
}
