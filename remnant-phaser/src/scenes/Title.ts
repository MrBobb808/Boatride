import Phaser from 'phaser';
import { loadSave, liveSlots, importLive } from '../game/save';
import { ROOMS } from '../shared';
import { dpr } from '../game/screen';
import { music } from '../classic/shim/music';
import { installedBuild } from '../game/update';

/** The title: continue the Phaser save, begin again, or bring a journey over from the live game. */
export class Title extends Phaser.Scene {
  constructor() { super('title'); }

  create() {
    music.play('title');
    const { width: W, height: H } = this.scale;
    const k = dpr();
    this.cameras.main.setBackgroundColor('#07060a');
    const glow = this.add.image(W / 2, H * 0.38, 'glow').setTint(0xe2b85a).setScale(10 * k, 4 * k).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.4, yoyo: true, repeat: -1, duration: 2400, ease: 'Sine.inOut' });
    const big = Math.max(26, Math.min(56, W / k / 16)) * k;
    this.add.text(W / 2, H * 0.34, 'REMNANT', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${big}px`, color: '#f6dea0', fontStyle: 'bold' }).setOrigin(0.5).setLetterSpacing(big * 0.3);
    this.add.text(W / 2, H * 0.34 + big * 0.95, 'ASCENSION', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${big * 0.42}px`, color: '#e2b85a' }).setOrigin(0.5).setLetterSpacing(big * 0.3);
    this.add.text(W / 2, H * 0.34 + big * 1.6, 'Phaser · combat, Echoes & audio', { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${14 * k}px`, color: '#9b92a6' }).setOrigin(0.5);
    this.add.text(W / 2, H - 8 * k, installedBuild(), { fontFamily: 'Georgia, serif', fontSize: `${9 * k}px`, color: '#776c83' }).setOrigin(0.5, 1);
    const save = loadSave();
    const opts: [string, () => void][] = [];
    if (save) opts.push([`Continue · level ${save.level}`, () => this.scene.start('world', { fresh: false })]);
    opts.push([save ? 'New journey' : 'Begin', () => this.scene.start('world', { fresh: true })]);
    // The live game's slots share this origin's storage: copy one in (the live slot is untouched).
    let armed = -1;
    for (const { slot, save: live } of liveSlots()) {
      const where = ROOMS[live.room]?.name ?? live.room;
      const label = `Bring live slot ${slot + 1} · level ${live.level} · ${where}`;
      const i = opts.length;
      opts.push([label, () => {
        // Replacing a Phaser journey takes a second tap.
        if (save && armed !== slot) { armed = slot; texts[i].setText('Tap again: replaces this build\'s journey'); return; }
        if (importLive(slot)) this.scene.start('world', { fresh: false });
      }]);
    }
    const step = 44 * k, y0 = Math.min(H * 0.62, H - opts.length * step - 12 * k);
    const texts: Phaser.GameObjects.Text[] = [];
    opts.forEach(([label, go], i) => {
      const t = this.add.text(W / 2, y0 + i * step, label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${(i < 2 ? 18 : 13) * k}px`, color: i === 0 ? '#f6dea0' : '#ddd4c6', backgroundColor: 'rgba(20,14,24,0.7)', padding: { x: 18 * k, y: 8 * k } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffffff'));
      t.on('pointerout', () => t.setColor(i === 0 ? '#f6dea0' : '#ddd4c6'));
      t.on('pointerup', go);
      t.setData('k', i === 0 ? 'title_first' : i === 1 ? 'title_second' : `title_live_${i - 2}`);
      texts.push(t);
    });
    this.input.keyboard?.once('keydown-ENTER', opts[0][1]);
    this.input.keyboard?.once('keydown-SPACE', opts[0][1]);
    this.scale.once('resize', () => this.scene.restart());
  }
}
