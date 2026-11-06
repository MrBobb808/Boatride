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
import unshornPartsUrl from '../assets/fighter-parts-unshorn.png';
import unshornManeUrl from '../assets/unshorn-mane.png';
import unshornImpactsUrl from '../assets/vfx-unshorn.png';
import unshornAwakeningUrl from '../assets/unshorn-awakening.png';
import abilities1Url from '../assets/vfx-abilities-1.png';
import abilities2Url from '../assets/vfx-abilities-2.png';
import transformUrl from '../assets/vfx-transform.png';
import archerUrl from '../assets/vfx-archer.png';
import arrowsUrl from '../assets/arrows.png';
import statusUrl from '../assets/vfx-status.png';
import foesAshen from '../../../remnant/src/assets/foes-ashen.png';
import foesShinar from '../../../remnant/src/assets/foes-shinar.png';
import foesBeasts from '../../../remnant/src/assets/foes-beasts.png';
import foesVeil from '../../../remnant/src/assets/foes-veil.png';
import foesGothic from '../assets/cc0/foes-gothic.png';
import foesGothicBig from '../assets/cc0/foes-gothic-big.png';

/** Loads the sprite sheets and makes the generated textures every scene shares. */
export class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.spritesheet('elior', eliorUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.image('fighter-parts',fighterPartsUrl);
    // C11/C12/V09: the Unshorn's parts, his mane and tail (four frames each) and his punches' bursts.
    this.load.image('fighter-parts-unshorn',unshornPartsUrl);
    this.load.image('unshorn-mane',unshornManeUrl);
    this.load.spritesheet('vfx-unshorn', unshornImpactsUrl, { frameWidth: 128, frameHeight: 128 });
    // C15: the awakening, eight frames from the Mantle's last stand to the Unshorn's guard (feet at 94.8% of a cell).
    this.load.spritesheet('unshorn-awakening', unshornAwakeningUrl, { frameWidth: 64, frameHeight: 64 });
    // Art drop V01/V02: rows of six frames (art/manifest.json).
    this.load.spritesheet('vfx-slashes', slashesUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('vfx-impacts', impactsUrl, { frameWidth: 128, frameHeight: 128 });
    // Art drop V03/V04: the Covenant abilities, eight frames per row.
    this.load.spritesheet('vfx-abilities-1', abilities1Url, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('vfx-abilities-2', abilities2Url, { frameWidth: 128, frameHeight: 128 });
    // V06 (Mantle and Wings forming) and V05 (Tirzah's dawn effects).
    this.load.spritesheet('vfx-transform', transformUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('vfx-archer', archerUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('arrows', arrowsUrl, { frameWidth: 96, frameHeight: 128 });
    this.load.spritesheet('vfx-status', statusUrl, { frameWidth: 128, frameHeight: 128 });
    // The original's foe sheets as Phaser frames, for the Horde (four keyframes a row, 96 px cells).
    for (const [key, url] of [['foes-ashen', foesAshen], ['foes-shinar', foesShinar], ['foes-beasts', foesBeasts], ['foes-veil', foesVeil]]) this.load.spritesheet(key, url, { frameWidth: 96, frameHeight: 96 });
    // The CC0 foes (art/incoming/cc0/CREDITS.md), cut to the same four keyframes a row by art/tools/cc0.py.
    this.load.spritesheet('foes-gothic', foesGothic, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet('foes-gothic-big', foesGothicBig, { frameWidth: 160, frameHeight: 160 });
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
    void loadCreatureSprites().then(() => this.scene.start(p.has('horde') ? 'horde' : p.has('autostart') || resume ? 'world' : 'title', { fresh: !resume && p.has('fresh') }));
  }
}
