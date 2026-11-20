// Dynamic lighting and refraction (src/game/dynLights.ts, normalMaps.ts, the distortion map in visuals.ts): the
// strongest lights near the view are pooled into Phaser's lights; the hero is lit through a normal map worked out from
// his art, with a mirrored twin when he faces left; the room's art and the classic layer take light too; the air
// wavers over open flames and Uri's fire, and a shockwave spreads from the Supernova. `?fx` keeps the GPU effects on
// under headless Chromium's software renderer. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on('pageerror', (e) => errors.push(e.stack ?? e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const E = (fn, a) => p.evaluate(fn, a);
const until = (fn, a, timeout = 30000) => p.waitForFunction(fn, a, { timeout });

try {
  await p.goto(base + '?debug&nostory&autostart&fresh&fx');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  assert.ok(await E(() => window.__remnant.world.visuals.lights.on), 'the dynamic lights are on (WebGL, Medium or High)');
  assert.ok(await E(() => window.__remnant.world.art.backImage.lighting && window.__remnant.world.classic.image.lighting), 'the room and the classic layer take light');
  await E(() => { const pl = window.__remnant.world.player; pl.switchCd = 0; pl.switchHero('uri'); });
  await until(() => window.__remnant.world.player.sprite.texture.key.startsWith('action-uri'));
  await E(() => window.__remnant.warp('sanctuary', 'altar'));
  await until((r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, 'sanctuary');
  await E(() => { const pl = window.__remnant.world.player; pl.placeAt(24 * 16, 17 * 16, 1); pl.face = 1; });
  await until(() => window.__remnant.world.visuals.lights.stats.lights > 0 && window.__remnant.world.player.sprite.lighting, null, 20000);

  // The hero: a normal map from his own art, and its mirrored twin when he faces left.
  const right = await E(() => { const s = window.__remnant.world.player.sprite; return { key: s.texture.key, normals: s.texture.dataSource.length, lights: window.__remnant.world.visuals.lights.stats.lights }; });
  assert.ok(right.normals > 0 && !right.key.endsWith('~L'), `facing right he wears his own texture with its normals (${JSON.stringify(right)})`);
  await p.keyboard.down('KeyA'); await p.waitForTimeout(120); await p.keyboard.up('KeyA');
  await until(() => window.__remnant.world.player.sprite.texture.key.endsWith('~L'), null, 10000);
  const left = await E(() => { const t = window.__remnant.world.player.sprite.texture, c = document.createElement('canvas'), src = t.dataSource[0].source, base = window.__remnant.game.textures.get(t.key.slice(0, -2)).dataSource[0].source;
    // The twin's normals point the other way across: their red channels mirror each other where the art is.
    c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(base, 0, 0); const b = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, mirrored = 0; for (let i = 0; i < a.length; i += 4) if (b[i] !== 128 || b[i + 1] !== 128) { n++; if (Math.abs(a[i] - (255 - b[i])) <= 1 && a[i + 1] === b[i + 1]) mirrored++; }
    return { key: t.key, n, mirrored }; });
  assert.ok(left.n > 1000 && left.mirrored / left.n > 0.99, `facing left he wears the twin with mirrored normals (${JSON.stringify(left)})`);
  console.log(`Lights: ${right.lights} in the pool; Uri lit through his normals, the twin (${left.key}) when he faces left`);

  // How long working out a hero sheet's normals takes (once per sheet, the first time it is lit).
  const ms = await E(() => { const w = window.__remnant.world, k = w.player.sprite.texture.key.replace('~L', ''), src = w.textures.get(k).getSourceImage(), t0 = performance.now(); window.__remnant.normalsFrom(src); return { w: src.width, h: src.height, t: Math.round(performance.now() - t0) }; });
  console.log(`Normals for a ${ms.w}x${ms.h} hero sheet: ${ms.t} ms (once per sheet)`);

  // The air wavers over the brazier.
  await until(() => window.__remnant.world.visuals.distortion === 'haze', null, 20000);
  await p.screenshot({ path: 'qa/lighting-brazier.png' });
  // Uri's fire lights what it passes: more lights while a Great Fireball gathers and flies.
  await until(() => window.__remnant.world.player.state === 'free', null, 20000);
  await p.keyboard.down('KeyK');
  await until(() => window.__remnant.world.player.flame.charge > 0.5, null, 20000);
  const charging = await E(() => window.__remnant.world.visuals.lights.stats.lights);
  await p.screenshot({ path: 'qa/lighting-charge.png' });
  await p.keyboard.up('KeyK');
  // The Supernova: a shockwave through the air.
  await until(() => window.__remnant.world.player.state === 'free', null, 20000);
  await E(() => { const k = window.__remnant.world.player.flame; k.heat = 100; k.heatRest = 0; });
  await p.keyboard.down('KeyK'); await p.waitForTimeout(90); await p.keyboard.up('KeyK');
  await until(() => window.__remnant.world.player.flame.tally.novas > 0, null, 20000);
  await until(() => window.__remnant.world.visuals.distortion === 'shock', null, 10000);
  await p.screenshot({ path: 'qa/lighting-nova.png' });
  console.log(`Refraction: haze over the brazier, a shockwave from the Supernova; ${charging} lights in the pool while the Great Fireball gathered`);

  assert.deepEqual(errors, []);
  console.log('Dynamic lighting: passed');
} finally {
  await browser.close();
  await close();
}
