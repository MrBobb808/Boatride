// The authored room paintings are baked once and uploaded as Phaser textures.
// Tilemap collision and every camera/scene remain owned by Phaser.
import Phaser from 'phaser';
import { TileCache, buildParallax, useRoomLook, drawSky, drawLiquids, drawLiveProps, drawGate, BIOMES, type Layer } from '../../../remnant/src/render/environment';
import { lighting } from './shim/lighting';
import { drawUnderwater, drawWaterFront } from '../../../remnant/src/render/underwater';
import { releaseCanvas } from '../../../remnant/src/render/draw';
import { guidePoint } from '../../../remnant/src/game/guide';
import { G, flag } from './shim/ctx';
import { settings } from './shim/settings';
import type { World } from '../scenes/World';
export class RoomArt {
  cache: TileCache | null = null;
  private layers: Layer[] = [];
  private back: Phaser.Textures.CanvasTexture;
  private front: Phaser.Textures.CanvasTexture;
  private images: Phaser.GameObjects.Image[];
  private static n = 0;
  constructor(private w: World) {
    const id = RoomArt.n++;
    this.back = w.textures.createCanvas(`room-art-${id}`, 64, 64)!;
    this.front = w.textures.createCanvas(`room-front-${id}`, 64, 64)!;
    this.images = [w.add.image(0, 0, this.back.key).setOrigin(0).setDepth(0), w.add.image(0, 0, this.front.key).setOrigin(0).setDepth(18)];
  }
  load() {
    this.cache?.dispose(); for (const l of this.layers) releaseCanvas(l.c);
    const w = this.w, r = w.room;
    useRoomLook(r.biome, r.seed, r.interior);
    this.layers = buildParallax(r.biome, r.seed, r.interior, 405, 1);
    this.cache = new TileCache(w.classic.grid, r.biome, r.interior, r.seed, r.ents, w.classic.solid, (c, n) => flag(c ?? '') && !(n && flag(n)));
  }
  render() {
    const w = this.w, r = w.room, v = w.cameras.main.worldView, W = Math.ceil(v.width) + 2, H = Math.ceil(v.height) + 2, ox = Math.floor(v.x), oy = Math.floor(v.y);
    const view = { x: v.x, y: v.y, w: v.width, h: v.height }, pal = BIOMES[r.biome];
    for (const t of [this.back, this.front]) if (t.width !== W || t.height !== H) t.setSize(W, H);
    const c = this.back.getContext(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    drawSky(c, pal, W, H, r.interior, G.time);
    w.visuals.atmosphere.sky(c, W, H);
    for (const l of this.layers) { const y = v.height - l.h + (r.h * 16 - (v.y + v.height)) * l.fy; let x = -((v.x * l.fx) % l.w); if (x > 0) x -= l.w; for (; x < W; x += l.w - 1) c.drawImage(l.c, x, y, l.w, l.h); }
    c.setTransform(1, 0, 0, 1, -ox, -oy);
    this.cache?.draw(c, view); drawLiquids(c, w.classic.grid, G.time, view, r.biome);
    drawLiveProps(c, r.ents, G.time, view, (a, b) => flag(a ?? '') && !(b && flag(b)), false);
    drawGate(c, w.classic.grid, w.gateClosed ? 1 : 0);
    const f = this.front.getContext(); f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, W, H); f.globalAlpha = 1; f.globalCompositeOperation = 'source-over'; f.setTransform(1, 0, 0, 1, -ox, -oy);
    drawLiveProps(f, r.ents, G.time, view, (a, b) => flag(a ?? '') && !(b && flag(b)), true);
    drawWaterFront(f, view, G.time);
    G.renderer.bw = W; G.renderer.bh = H;
    lighting.render(f, G.camera, G.renderer, Math.min(0.95, r.dark), pal.ambient);
    drawUnderwater(f, G.time);
    if (settings.guide && !G.inCutscene && !w.classic.bossActive) {
      const g = guidePoint(); if (g) { const { x, y } = g.point, my = y - 38 + Math.sin(G.time * 3) * 3;
        f.strokeStyle = '#ffe6a8'; f.fillStyle = '#ffe6a8'; f.lineWidth = 1.2;
        f.beginPath(); f.moveTo(x, my - 7); f.lineTo(x + 5, my); f.lineTo(x, my + 7); f.lineTo(x - 5, my); f.closePath(); f.fill();
        f.globalAlpha = 0.4; f.fillRect(x - 1, my + 8, 2, Math.max(0, y - my - 8)); f.globalAlpha = 1;
      }
    }
    this.back.refresh(); this.front.refresh(); for (const i of this.images) i.setPosition(ox, oy);
  }
  destroy() { this.cache?.dispose(); for (const l of this.layers) releaseCanvas(l.c); for (const i of this.images) i.destroy(); this.w.textures.remove(this.back.key); this.w.textures.remove(this.front.key); }
}
