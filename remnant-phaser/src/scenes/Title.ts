import Phaser from 'phaser';
import { loadSave } from '../game/save';
import { dpr } from '../game/screen';

/** The title: continue the Phaser save, or begin again. */
export class Title extends Phaser.Scene {
  constructor() { super('title'); }

  create() {
    const { width: W, height: H } = this.scale;
    const k = dpr();
    this.cameras.main.setBackgroundColor('#07060a');
    const glow = this.add.image(W / 2, H * 0.38, 'glow').setTint(0xe2b85a).setScale(10 * k, 4 * k).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.4, yoyo: true, repeat: -1, duration: 2400, ease: 'Sine.inOut' });
    const big = Math.max(26, Math.min(56, W / k / 16)) * k;
    this.add.text(W / 2, H * 0.34, 'REMNANT', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${big}px`, color: '#f6dea0', fontStyle: 'bold' }).setOrigin(0.5).setLetterSpacing(big * 0.3);
    this.add.text(W / 2, H * 0.34 + big * 0.95, 'ASCENSION', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${big * 0.42}px`, color: '#e2b85a' }).setOrigin(0.5).setLetterSpacing(big * 0.3);
    this.add.text(W / 2, H * 0.34 + big * 1.6, 'Phaser rebuild · early port', { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${14 * k}px`, color: '#9b92a6' }).setOrigin(0.5);
    const save = loadSave();
    const opts: [string, () => void][] = [];
    if (save) opts.push([`Continue · level ${save.level}`, () => this.scene.start('world', { fresh: false })]);
    opts.push([save ? 'New journey' : 'Begin', () => this.scene.start('world', { fresh: true })]);
    opts.forEach(([label, go], i) => {
      const t = this.add.text(W / 2, H * 0.64 + i * 46 * k, label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${18 * k}px`, color: i === 0 ? '#f6dea0' : '#ddd4c6', backgroundColor: 'rgba(20,14,24,0.7)', padding: { x: 18 * k, y: 8 * k } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffffff'));
      t.on('pointerout', () => t.setColor(i === 0 ? '#f6dea0' : '#ddd4c6'));
      t.on('pointerup', go);
      t.setData('k', i === 0 ? 'title_first' : 'title_second');
    });
    this.input.keyboard?.once('keydown-ENTER', opts[0][1]);
    this.input.keyboard?.once('keydown-SPACE', opts[0][1]);
    this.scale.once('resize', () => this.scene.restart());
  }
}
