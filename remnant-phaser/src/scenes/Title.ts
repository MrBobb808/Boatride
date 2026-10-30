import Phaser from 'phaser';
import { loadSave, liveSlots, importLive, activeSlot, selectSlot, type PhaserSave } from '../game/save';
import { ROOMS } from '../shared';
import { dpr } from '../game/screen';
import { music } from '../classic/shim/music';
import { installedBuild, installedVersion, latestRelease } from '../game/update';
import { input } from '../../../remnant/src/core/input';

/** The title: continue the Phaser save, begin again, or bring a journey over from the live game. */
export class Title extends Phaser.Scene {
  constructor() { super('title'); }

  create() {
    music.play('title');
    const { width: W, height: H } = this.scale;
    const k = dpr();
    const save = loadSave(), liveList = liveSlots(), count = (save ? 3 : 2) + liveList.length, ty = count > 3 ? H * 0.15 : H * 0.27;
    this.cameras.main.setBackgroundColor('#07060a');
    const glow = this.add.image(W / 2, H * 0.38, 'glow').setTint(0xe2b85a).setScale(10 * k, 4 * k).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.4, yoyo: true, repeat: -1, duration: 2400, ease: 'Sine.inOut' });
    const big = Math.max(26, Math.min(56, W / k / 16)) * k;
    this.add.text(W / 2, ty, 'REMNANT', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${big}px`, color: '#f6dea0', fontStyle: 'bold' }).setOrigin(0.5).setLetterSpacing(big * 0.3);
    this.add.text(W / 2, ty + big * 0.95, 'ASCENSION', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${big * 0.42}px`, color: '#e2b85a' }).setOrigin(0.5).setLetterSpacing(big * 0.3);
    this.add.text(W / 2, ty + big * 1.6, 'Ten chapters · One covenant', { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${14 * k}px`, color: '#9b92a6' }).setOrigin(0.5);
    // The version, and whether it is the newest the site serves.
    const ver = this.add.text(W / 2, H - 8 * k, `Version ${installedVersion()} · checking for updates…`, { fontFamily: 'Georgia, serif', fontSize: `${11 * k}px`, color: '#9b92a6' }).setOrigin(0.5, 1).setName('title_version');
    void latestRelease().then((r) => {
      if (!ver.active) return;
      const fresh = !r || r.build === installedBuild();
      ver.setText(`Version ${installedVersion()} · ${!r ? 'offline' : fresh ? 'up to date' : `version ${r.version ?? 'new'} is ready: Settings → Check for updates`}`).setColor(fresh ? '#9b92a6' : '#f6dea0');
    });
    const opts: [string, () => void][] = [];
    if (save) opts.push([`Continue · level ${save.level}`, () => this.scene.start('world', { fresh: false })]);
    let newArmed = false;
    opts.push([save ? 'New journey' : 'Begin', () => {
      const empty = [0, 1, 2].find(slot => !localStorage.getItem(slot === 0 ? 'remnant-phaser.save.v2' : `remnant-phaser.save.slot${slot}`));
      if (save && empty === undefined && !newArmed) { newArmed = true; texts[save ? 1 : 0].setText(`Tap again: replace slot ${activeSlot() + 1}`); return; }
      if (empty !== undefined) selectSlot(empty); this.scene.start('world', { fresh: true });
    }]);
    // The live game's slots share this origin's storage: copy one in (the live slot is untouched).
    let armed = -1;
    for (const { slot, save: live } of liveList) {
      const where = ROOMS[live.room]?.name ?? live.room;
      const label = `Bring live slot ${slot + 1} · level ${live.level} · ${where}`;
      const i = opts.length;
      opts.push([label, () => {
        // Replacing a Phaser journey takes a second tap.
        if (save && armed !== slot) { armed = slot; texts[i].setText('Tap again: replaces this build\'s journey'); return; }
        if (importLive(slot)) this.scene.start('world', { fresh: false });
      }]);
    }
    // The Horde: the top-down endless stages (scenes/Horde.ts), on whatever journey is open.
    const best = (save as PhaserSave | null)?.horde?.best;
    const hordeAt = opts.length;
    opts.push([best ? `The Horde · best stage ${best}` : 'The Horde · endless stages', () => this.scene.start('horde')]);
    const step = (count > 4 ? 38 : 44) * k, y0 = Math.min(H * (count > 3 ? 0.48 : 0.62), H - opts.length * step - 12 * k);
    const texts: Phaser.GameObjects.Text[] = [];
    opts.forEach(([label, go], i) => {
      const t = this.add.text(W / 2, y0 + i * step, label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${(i < 2 ? 18 : 13) * k}px`, color: i === 0 ? '#f6dea0' : '#ddd4c6', backgroundColor: 'rgba(20,14,24,0.7)', padding: { x: 18 * k, y: 8 * k } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffffff'));
      t.on('pointerout', () => t.setColor(i === 0 ? '#f6dea0' : '#ddd4c6'));
      t.on('pointerup', go);
      t.setData('k', i === hordeAt ? 'title_horde' : i === 0 ? 'title_first' : i === 1 ? 'title_second' : `title_live_${i - 2}`);
      texts.push(t);
    });
    // The shared input service already consumes Enter/Space before Phaser's keys.
    let starting = false;
    const off = input.onAction((action, repeat) => {
      if (repeat || starting || action !== 'confirm' && action !== 'jump') return;
      starting = true; input.releaseAll(); opts[0][1](); return true;
    });
    const refit = () => this.scene.restart();
    this.scale.once('resize', refit);
    this.events.once('shutdown', () => { off(); this.scale.off('resize', refit); });
  }

  update() { input.poll(); input.flush(); }
}
