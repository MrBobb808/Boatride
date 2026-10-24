import Phaser from 'phaser';
import { eliorUrl, ashenUrl, beastsUrl, shinarUrl, veilUrl, varkhosUrl, morvaneUrl, azkarUrl, spriteManifest } from '../shared';
import { cutBossFrames } from '../game/bosses';
import { FOE_SHEETS } from '../game/foes';
import { glowTexture } from '../game/tileset';

const SHEET_URLS: Record<string, string> = { 'foes-ashen': ashenUrl, 'foes-beasts': beastsUrl, 'foes-shinar': shinarUrl, 'foes-veil': veilUrl };

/** Loads the sprite sheets and makes the generated textures every scene shares. */
export class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.spritesheet('elior', eliorUrl, { frameWidth: 128, frameHeight: 128 });
    this.load.image('varkhos', varkhosUrl);
    this.load.image('morvane', morvaneUrl);
    this.load.image('azkar', azkarUrl);
    for (const s of FOE_SHEETS) if (SHEET_URLS[s]) this.load.spritesheet(s, SHEET_URLS[s], { frameWidth: spriteManifest.cell, frameHeight: spriteManifest.cell });
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      const { width, height } = this.scale;
      bar.clear().fillStyle(0xe2b85a, 1).fillRect(width * 0.3, height / 2, width * 0.4 * v, 2);
    });
  }

  create() {
    glowTexture(this);
    cutBossFrames(this);
    this.makeSlash();
    const p = new URLSearchParams(location.search);
    this.scene.start(p.has('autostart') ? 'world' : 'title', { fresh: p.has('fresh') });
  }

  /** A crescent of light for Elior's blade. */
  private makeSlash() {
    const w = 44, h = 44;
    const tex = this.textures.createCanvas('slash', w, h)!;
    const c = tex.getContext();
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,240,200,0)');
    g.addColorStop(0.6, 'rgba(255,240,200,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.95)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(4, h / 2, 38, -1.1, 1.1);
    c.arc(-4, h / 2, 34, 1.0, -1.0, true);
    c.closePath();
    c.fill();
    tex.refresh();
  }
}
