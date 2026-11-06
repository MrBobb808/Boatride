import Phaser from 'phaser';
import { loadSave, liveSlots, importLive, selectSlot } from '../game/save';
import { music } from '../classic/shim/music';
import { installedBuild, installedVersion, latestRelease } from '../game/update';
import { input } from '../../../remnant/src/core/input';
import { actionAtlas, actionFrame, ACTION_FOOT, ACTION_CELL } from '../game/actionArt';
import { Home, type HomeMode } from '../game/home';

/** The home screen: the journey (continue, begin again, or bring one over from the live game) and every game mode,
 * as DOM cards (game/home.ts) over a canvas that keeps the glow, drifting embers and Elior standing at his watch. */
export class Title extends Phaser.Scene {
  constructor() { super('title'); }
  private home: Home | null = null;
  private hero: Phaser.GameObjects.Image | null = null;
  private heroKey = '';
  private heroT = 0;

  create() {
    music.play('title');
    const { width: W, height: H } = this.scale;
    const save = loadSave(), live = liveSlots();
    this.cameras.main.setBackgroundColor('#07060a');
    const glow = this.add.image(W / 2, H * 0.3, 'glow').setTint(0xe2b85a).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.36, yoyo: true, repeat: -1, duration: 2400, ease: 'Sine.inOut' });
    // Embers rising behind everything, pooled: a dozen glows recycled by their tweens.
    for (let i = 0; i < 14; i++) {
      const e = this.add.image(0, 0, 'glow').setTint(i % 3 ? 0xffa040 : 0xfff1c4).setBlendMode(Phaser.BlendModes.ADD);
      const rise = () => {
        e.setPosition(Phaser.Math.Between(0, W), H + 10).setScale(0.06 + Math.random() * 0.08).setAlpha(0.5 + Math.random() * 0.4);
        this.tweens.add({ targets: e, y: H * (0.1 + Math.random() * 0.4), x: e.x + Phaser.Math.Between(-40, 40), alpha: 0, duration: 5000 + Math.random() * 5000, delay: Math.random() * 3000, onComplete: rise });
      };
      rise();
    }

    let newArmed = false, liveArmed = -1, starting = false;
    const go = (fn: () => void) => { if (starting) return; starting = true; fn(); };
    this.home = new Home({
      save, live,
      play: (mode?: HomeMode) => go(() => this.scene.start('world', { fresh: false, mode })),
      begin: () => {
        const empty = [0, 1, 2].find((slot) => !localStorage.getItem(slot === 0 ? 'remnant-phaser.save.v2' : `remnant-phaser.save.slot${slot}`));
        // Replacing the open journey takes a second tap when every slot is taken.
        if (save && empty === undefined && !newArmed) { newArmed = true; return false; }
        go(() => { if (empty !== undefined) selectSlot(empty); this.scene.start('world', { fresh: true }); });
        return true;
      },
      bringLive: (slot) => {
        if (save && liveArmed !== slot) { liveArmed = slot; return false; }
        go(() => { if (importLive(slot)) this.scene.start('world', { fresh: false }); else starting = false; });
        return true;
      },
      watch: () => go(() => this.scene.start('watch', { from: 'title' })),
      horde: () => go(() => this.scene.start('horde')),
    });
    // The version, and whether it is the newest the site serves.
    this.home.version(`Version ${installedVersion()} · checking for updates…`, true);
    void latestRelease().then((r) => {
      if (!this.home) return;
      const fresh = !r || r.build === installedBuild();
      this.home.version(`Version ${installedVersion()} · ${!r ? 'offline' : fresh ? 'up to date' : `version ${r.version ?? 'new'} is ready: Settings → Check for updates`}`, fresh);
    });
    // Elior at his watch behind the wordmark, baked after the first frame so the screen shows at once.
    this.time.delayedCall(60, () => {
      if (!this.home) return;
      this.heroKey = actionAtlas(this, 'elior', 'blade');
      this.hero = this.add.image(0, 0, this.heroKey, actionFrame(this, this.heroKey, 'idle', 0)).setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setAlpha(0);
      this.tweens.add({ targets: this.hero, alpha: 1, duration: 600 });
      this.placeHero();
    });
    this.home.root.addEventListener('scroll', this.placeHero);

    // The shared input service already consumes Enter/Space before Phaser's keys: confirm continues (or begins).
    const off = input.onAction((action, repeat) => {
      if (repeat || starting || action !== 'confirm' && action !== 'jump') return;
      input.releaseAll();
      (this.home?.root.querySelector('[data-k=title_first]') as HTMLButtonElement | null)?.click();
      return true;
    });
    const refit = () => this.scene.restart();
    this.scale.once('resize', refit);
    this.events.once('shutdown', () => {
      off(); this.scale.off('resize', refit);
      this.home?.root.removeEventListener('scroll', this.placeHero);
      this.home?.destroy(); this.home = null; this.hero = null;
    });
  }

  /** Stand Elior on the floor of the home's stage box, at a size that fills it. */
  private placeHero = () => {
    if (!this.hero || !this.home) return;
    const r = this.home.stage.getBoundingClientRect(), k = this.scale.width / window.innerWidth;
    const h = Math.max(40, r.height) * k;
    this.hero.setPosition((r.left + r.width / 2) * k, r.bottom * k).setScale(h / 64).setVisible(r.bottom > 0);
  };

  update(_t: number, delta: number) {
    input.poll(); input.flush();
    if (this.hero) { this.heroT += delta / 1000; this.hero.setFrame(actionFrame(this, this.heroKey, 'idle', (this.heroT / 1.6) % 1)); }
  }
}
