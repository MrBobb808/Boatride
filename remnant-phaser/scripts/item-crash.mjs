// The Item Crash (game/itemCrash.ts): Up + Sub with ten hearts spends them on the carried sub-weapon made great. Each of
// the five puts its own volley into the room (counted as the shared sub-weapon's projectiles), the hearts are spent,
// a Crash without the hearts falls back to the ordinary throw, and Up + Heavy still throws one.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const E = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });
  await page.goto(base + '?debug&nostory&autostart&fresh&fixedstep');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning && window.__remnant.world.canUseKit);
  await until(() => window.__remnant.world.player.onGround);
  // The shared sub-weapons in flight (SubProj: the only entities with both `pool` and `back`).
  const flying = () => E(() => window.__remnant.world.classic.ents.filter((e) => 'pool' in e && 'back' in e && !e.remove).length);
  const crash = async (sub) => {
    await E((id) => { const w = window.__remnant.world; w.save.sub = id; w.save.hearts = 25; w.player.state = 'free'; w.player.grantInvuln(5); w.classic.ents.forEach((e) => { if ('pool' in e && 'back' in e) e.remove = true; }); }, sub);
    await page.waitForTimeout(100);
    await page.keyboard.down('KeyW'); await page.keyboard.press('KeyU'); await page.keyboard.up('KeyW');
    let most = 0;
    for (let i = 0; i < 25; i++) { most = Math.max(most, await flying()); await page.waitForTimeout(80); }
    const hearts = await E(() => window.__remnant.world.save.hearts);
    await until(() => !window.__remnant.world.classic.ents.some((e) => 'pool' in e && 'back' in e && !e.remove), null, 20000).catch(() => {});
    return { most, hearts };
  };
  const want = { dagger: 8, axe: 6, holy_water: 4, cross: 4, sling: 3 };
  const seen = {};
  for (const [sub, n] of Object.entries(want)) {
    const r = await crash(sub);
    seen[sub] = r.most;
    assert.equal(r.hearts, 15, `${sub}: the Crash spends ten hearts (${r.hearts} left)`);
    assert.ok(r.most >= n, `${sub}: the Crash fills the room (${r.most} in flight at once, wanted ${n})`);
  }
  await page.screenshot({ path: 'qa/item-crash.png' });
  // Without the hearts it is the ordinary throw (one, for its own cost); Up + Heavy throws one too.
  await E(() => { const w = window.__remnant.world; w.save.sub = 'dagger'; w.save.hearts = 5; });
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyU'); await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);
  assert.equal(await E(() => window.__remnant.world.save.hearts), 4, 'with too few hearts Up + Sub throws one dagger');
  await page.waitForTimeout(900);
  await E(() => { window.__remnant.world.save.hearts = 25; });
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);
  assert.equal(await E(() => window.__remnant.world.save.hearts), 24, 'Up + Heavy still throws one');
  assert.deepEqual(errors, []);
  console.log(`Item Crash: ${Object.entries(seen).map(([k, v]) => `${k} ×${v}`).join(', ')} in flight at once; ten hearts each; too few hearts throws one; Up + Heavy throws one`);
} finally {
  await browser.close();
  close();
}
