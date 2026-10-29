import Phaser from 'phaser';
import { actionAtlas } from '../game/actionArt';
import { selectSlot } from '../game/save';
import { eliorUrl, varkhosUrl, morvaneUrl, azkarUrl } from '../shared';
import { cutBossFrames } from '../game/bosses';
import { glowTexture } from '../game/tileset';
import { loadCreatureSprites } from '../../../remnant/src/render/creatureSprites';
import fighterPartsUrl from '../assets/fighter-parts-v1.png';
import slashesUrl from '../assets/vfx-slashes.png';
import impactsUrl from '../assets/vfx-impacts.png';
import abilities1Url from '../assets/vfx-abilities-1.png';
import abilities2Url from '../assets/vfx-abilities-2.png';

/** Loads the sprite sheets and makes the generated textures every scene shares. */
export class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.spritesheet('elior', eliorUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.image('fighter-parts',fighterPartsUrl);
    // Art drop V01/V02: rows of six frames (art/manifest.json).
    this.load.spritesheet('vfx-slashes', slashesUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('vfx-impacts', impactsUrl, { frameWidth: 128, frameHeight: 128 });
    // Art drop V03/V04: the Covenant abilities, eight frames per row.
    this.load.spritesheet('vfx-abilities-1', abilities1Url, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('vfx-abilities-2', abilities2Url, { frameWidth: 128, frameHeight: 128 });
    this.load.image('varkhos', varkhosUrl);
    this.load.image('morvane', morvaneUrl);
    this.load.image('azkar', azkarUrl);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      const { width, height } = this.scale;
      bar.clear().fillStyle(0xe2b85a, 1).fillRect(width * 0.3, height / 2, width * 0.4 * v, 2);
    });
  }

  create() {
    glowTexture(this);
    cutBossFrames(this);
    actionAtlas(this,'elior','blade');
    actionAtlas(this,'tirzah','blade');
    const p = new URLSearchParams(location.search);
    let resume = false;
    if (!/\/(phaser|classic)\/?$/.test(location.pathname.replace(/index\.html$/, ''))) {
      try { const slot = sessionStorage.getItem('remnant-resume-slot'); if (slot !== null && [0, 1, 2].includes(Number(slot))) { selectSlot(Number(slot)); sessionStorage.removeItem('remnant-resume-slot'); resume = true; } } catch {}
    }
    if (resume) { const url = new URL(location.href); url.searchParams.delete('fresh'); url.searchParams.set('autostart', ''); history.replaceState(null, '', url); }
    // The foes' sheets (drawn by the original's render/creatureSprites.ts) are in before the first room.
    void loadCreatureSprites().then(() => this.scene.start(p.has('autostart') || resume ? 'world' : 'title', { fresh: !resume && p.has('fresh') }));
  }
}
