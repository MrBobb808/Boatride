// Measure actual Arcade travel and shared-actor time at two display rates.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
try {
  for (const fps of [60, 120]) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?debug&nostory&autostart&fresh');
    await page.waitForFunction(() => window.__remnant?.world?.player?.onGround);
    await page.evaluate(() => window.__remnant.game.loop.stop());
    await page.keyboard.down('ArrowRight');
    const measured = await page.evaluate(fps => {
      const { world: w, game, G } = window.__remnant, p = w.player;
      p.placeAt(90, 80, 1); p.body.setAllowGravity(false);
      let now = game.loop.time;
      const step = () => game.step(now += 1000 / fps, 1000 / fps);
      // Reach steady walking speed before measuring travel.
      for (let i = 0; i < fps; i++) step();
      const probe = { layer: 0, x: 0, update(dt) { this.x += 100 * dt; }, draw() {} };
      w.classic.ents.push(probe);
      const x = p.x, time = G.time, played = w.save.playtime;
      for (let i = 0; i < fps; i++) step();
      return { distance: p.x - x, sharedDistance: probe.x, gameTime: G.time - time, played: w.save.playtime - played };
    }, fps);
    assert.ok(Math.abs(measured.distance - 113.6) < 3, `${fps} Hz walk: ${JSON.stringify(measured)}`);
    assert.ok(Math.abs(measured.sharedDistance - 80) < 0.01, 'shared actors use the same pace');
    assert.ok(Math.abs(measured.gameTime - 0.8) < 0.01, 'combat clock follows movement');
    assert.ok(Math.abs(measured.played - 1) < 0.01, 'playtime still counts real seconds');
    console.log(`${fps} Hz: ${JSON.stringify(measured)}`);
    await page.keyboard.up('ArrowRight');
    const shake = await page.evaluate(() => {
      const { world: w, G } = window.__remnant, p = w.player;
      const calls = [];
      w.cameras.main.shake = (ms, amount) => { calls.push({ ms, amount }); return w.cameras.main; };
      p.hp = p.maxHp; p.invuln = 0; p.state = 'free'; p.hurt({ dmg: 1, dir: -1 });
      G.camera.addTrauma(0.3); w.shake(0.006, 140);
      const routine = calls.length;
      w.shake(0.012, 600); w.shake(0.012, 600);
      return { routine, calls };
    });
    assert.equal(shake.routine, 0, 'damage and ordinary shared impacts keep the camera steady');
    assert.equal(shake.calls.length, 1, 'major effects cannot repeatedly restart shake');
    assert.ok(shake.calls[0].ms <= 160 && shake.calls[0].amount <= 0.002, 'major shake is brief and gentle');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Pacing and steady-camera checks passed');
} finally { await browser.close(); close(); }
