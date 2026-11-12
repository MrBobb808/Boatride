import Phaser from 'phaser';
import { actionAtlas } from '../game/actionArt';
import { selectSlot } from '../game/save';
import { startScene } from '../game/scenes';
import eliorUrl from '../../../remnant/src/assets/elior-v3.png';
import { glowTexture } from '../game/tileset';
import { loadCreatureSprites } from '../../../remnant/src/render/creatureSprites';
import fighterPartsUrl from '../assets/fighter-parts-v1.png';

/** Loads the sprite sheets and makes the generated textures every scene shares. */
export class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.spritesheet('elior', eliorUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.image('fighter-parts',fighterPartsUrl);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      const { width, height } = this.scale;
      bar.clear().fillStyle(0xe2b85a, 1).fillRect(width * 0.3, height / 2, width * 0.4 * v, 2);
    });
  }

  create() {
    glowTexture(this);
    actionAtlas(this,'elior','blade');
    actionAtlas(this,'tirzah','blade');
    // A start straight into a mode (?autostart, ?horde, a resumed update) loads the rest in that scene's preload.
    const p = new URLSearchParams(location.search);
    let resume = false;
    if (!/\/(phaser|classic)\/?$/.test(location.pathname.replace(/index\.html$/, ''))) {
      try { const slot = sessionStorage.getItem('remnant-resume-slot'); if (slot !== null && [0, 1, 2].includes(Number(slot))) { selectSlot(Number(slot)); sessionStorage.removeItem('remnant-resume-slot'); resume = true; } } catch {}
    }
    if (resume) { const url = new URL(location.href); url.searchParams.delete('fresh'); url.searchParams.set('autostart', ''); history.replaceState(null, '', url); }
    // The foes' sheets (drawn by the original's render/creatureSprites.ts) are in before the first room.
    void loadCreatureSprites().then(() => startScene(this, p.has('horde') ? 'horde' : p.has('autostart') || resume ? 'world' : 'title', { fresh: !resume && p.has('fresh') }));
  }
}
