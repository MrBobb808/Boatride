// Facing: both heroes turn with the stick while running, between combo hits
// and during a bow's follow-through, and a swing or shot with no direction
// held turns to face a foe behind when there is none ahead.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const face = (page) => E(page, () => { const p = window.__remnant.world.player; return { face: p.face, flip: p.sprite.flipX, state: p.state }; });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.player.onGround && !w.transitioning; });
  // One foe that stands still on flat ground, kept away until a check needs it.
  await E(page, () => {
    const w = window.__remnant.world, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.flying);
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    const feet = w.player.feet, flat = (x) => { for (let dx = -140; dx <= 140; dx += 8) if (open(x + dx, feet + 2) || !open(x + dx, feet - 2) || !open(x + dx, feet - 30)) return false; return true; };
    let x = 0; for (let tx = 160; tx < w.roomW() - 160; tx += 8) if (flat(tx)) { x = tx; break; }
    f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; }; f.executable = () => false; f.aggro = false;
    window.target = f; window.flatX = x; window.feet = feet;
    f.x = x + 400; f.y = feet;
    w.player.placeAt(x, feet, 1);
  });

  for (const hero of ['elior', 'tirzah']) {
    await E(page, (h) => { const w = window.__remnant.world; w.save.playableHero = h; w.player.placeAt(window.flatX, window.feet, 1); window.target.x = window.flatX + 400; }, hero);
    await until(page, () => window.__remnant.world.player.state === 'free');
    // ---- running left turns her or him left
    await page.keyboard.down('KeyA'); await page.waitForTimeout(250);
    assert.deepEqual(await face(page), { face: -1, flip: true, state: 'free' }, `${hero} faces left while running left`);
    await page.keyboard.up('KeyA');
    // ---- a swing, then holding right turns straight away
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(80);
    await page.keyboard.down('KeyD');
    await until(page, () => window.__remnant.world.player.face === 1 && window.__remnant.world.player.sprite.flipX === false, undefined, 1500);
    await page.keyboard.up('KeyD');
    await until(page, () => window.__remnant.world.player.state === 'free');
    // ---- with a foe behind and none ahead, a plain swing or shot turns to it
    await E(page, () => { const w = window.__remnant.world; w.player.placeAt(window.flatX, window.feet, 1); window.target.x = window.flatX - 40; window.target.y = window.feet; });
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyJ');
    await until(page, () => window.__remnant.world.player.state !== 'free');
    const turned = await face(page);
    assert.ok(turned.face === -1 && turned.flip, `${hero} turns to the foe behind on a plain attack (${JSON.stringify(turned)})`);
    if (hero === 'tirzah') {
      // At this range the arrow lands within a frame or two: the foe behind takes it.
      await until(page, () => window.target.hp < 1e8, undefined, 3000);
    }
    await until(page, () => window.__remnant.world.player.state === 'free');
    await E(page, () => { window.target.x = window.flatX + 400; });
    console.log(`${hero}: faces left when running left, turns at once after a swing, and turns to a foe behind`);
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser facing: all checks passed');
} finally {
  await browser.close();
  close();
}
