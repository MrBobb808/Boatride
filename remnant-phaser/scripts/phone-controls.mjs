// Phone controls and camera (POLISH_PLAN §12a). On a phone the buttons appear only
// when they apply: strike, jump and dodge always; parry and the skills in a fight
// (and a moment after); Balm when hurt; the Mantle and Super when ready. They fade
// in place, so nothing moves under a thumb, and Settings → Smart buttons off shows
// every one. The camera leads the way the hero faces (Camera look-ahead), and the
// normal distance sits a little closer on a phone. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(`${e.message}\n${fn}\n${errors.join('\n')}`); });
const live = (page) => E(page, () => Object.fromEntries(window.__remnant.game.scene.getScene('hud').btns.map((b) => [b.a, b.live])));
const go = async (page, id) => {
  await E(page, (r) => window.__remnant.warp(r, 'start'), id);
  await until(page, (r) => { const w = window.__remnant.world; return w.room.id === r && !w.transitioning && w.player.onGround; }, id);
};

try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  assert.equal(await E(page, () => window.__remnant.world.controls.device), 'touch', 'a phone plays by touch');
  await E(page, () => { const w = window.__remnant.world; w.save.flags.relic_taken = true; w.save.balm = 3; w.save.rally = 40; });

  // ---- at rest, out of a fight: only what applies
  await go(page, 'sanctuary');
  await E(page, () => { const w = window.__remnant.world; for (const e of w.classic.ents) if (e.isFoe) e.remove = true; w.player.hp = w.player.maxHp; });
  await until(page, () => { const b = window.__remnant.game.scene.getScene('hud').btns; return !b.find((x) => x.a === 'parry').live && b.find((x) => x.a === 'parry').fade === 0; }, null, 15000);
  const rest = await live(page);
  assert.ok(rest.attack && rest.jump && rest.dodge, `strike, jump and dodge always show (${JSON.stringify(rest)})`);
  assert.ok(!rest.parry && !rest.skill1 && !rest.skill2 && !rest.skill3 && !rest.heal && !rest.ultimate, `at rest, parry, skills, Balm and an uncharged Super stay hidden (${JSON.stringify(rest)})`);
  await page.screenshot({ path: 'qa/phone-rest.png' });
  const shown = Object.values(rest).filter(Boolean).length;
  console.log(`At rest: ${shown} buttons (${Object.keys(rest).filter((k) => rest[k]).join(', ')})`);

  // ---- hurt: Balm appears; Super charged: it appears
  await E(page, () => { const w = window.__remnant.world; w.player.hp = Math.floor(w.player.maxHp * 0.6); w.save.rally = 100; });
  await until(page, () => { const b = window.__remnant.game.scene.getScene('hud').btns; return b.find((x) => x.a === 'heal').live && b.find((x) => x.a === 'ultimate').live; });
  console.log('Hurt: Balm appears; charged: Super appears');

  // ---- a foe near: parry and the skills come up, and stay a moment after
  await go(page, 'ashen_road');
  await E(page, () => { const w = window.__remnant.world, f = w.classic.ents.find((e) => e.isFoe && !e.dying); w.player.placeAt(f.x - 90, f.y, 1); });
  await until(page, () => { const b = window.__remnant.game.scene.getScene('hud').btns; return ['parry', 'skill1', 'skill2', 'skill3'].every((a) => b.find((x) => x.a === a).live); });
  const fight = await live(page);
  const seen = await E(page, async () => {
    const h = window.__remnant.game.scene.getScene('hud'), w = window.__remnant.world, cam = w.cameras.main, b = h.btns.find((x) => x.a === 'attack');
    // A fresh foe, held still, stood right behind Strike (an entity's x and y read its body, so move the body).
    const f = w.classic.spawnEnemy('husk', cam.worldView.centerX, w.player.feet);
    f.hp = f.maxHp = 1e7; f.think = function () { this.body.vx = 0; };
    const at = () => { f.body.x = cam.worldView.x + b.x / cam.zoom; f.body.y = cam.worldView.y + b.y / cam.zoom + f.body.h / 2; };
    // Judge in the same moment: a frame later the foe's physics would have set it back on the floor.
    for (let i = 0; i < 30 && !b.behind; i++) { await new Promise((r) => requestAnimationFrame(r)); at(); h.updateInteractBtn(); }
    return { behind: b.behind, alpha: +b.g.alpha.toFixed(2), device: w.controls.device, foe: { dying: !!f.dying, remove: !!f.remove } };
  });
  assert.ok(seen.behind && seen.alpha < 0.3, `a foe behind a button turns it see-through (${JSON.stringify(seen)})`);
  await page.screenshot({ path: 'qa/phone-fight.png' });
  console.log(`In a fight: ${Object.values(fight).filter(Boolean).length} buttons`);

  // ---- Smart buttons off: every button shows
  await E(page, () => { const w = window.__remnant.world; window.__remnant.settings.smartButtons = false; w.player.hp = w.player.maxHp; w.save.rally = 0; w.player.placeAt(40, w.player.feet, 1); });
  await until(page, () => { const b = window.__remnant.game.scene.getScene('hud').btns; return ['parry', 'skill1', 'heal', 'ultimate'].every((a) => b.find((x) => x.a === a).live); });
  await E(page, () => { window.__remnant.settings.smartButtons = true; });
  console.log('Smart buttons off: every button shows');

  // ---- look-ahead: the camera leads the way the hero faces, and turns with him
  const lead = await E(page, async () => {
    const w = window.__remnant.world, cam = w.cameras.main, p = w.player, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    p.placeAt(w.room.w * 8, p.feet, 1);
    const settle = async () => { for (let i = 0; i < 60; i++) { await wait(100); if (Math.abs(cam.followOffset.x) > 40) break; } return cam.followOffset.x; };
    p.face = 1; const right = await settle();
    p.face = -1; for (let i = 0; i < 80 && cam.followOffset.x < 40; i++) { p.face = -1; await wait(100); }
    const left = cam.followOffset.x;
    window.__remnant.settings.lookAhead = false; for (let i = 0; i < 80 && Math.abs(cam.followOffset.x) > 4; i++) await wait(100);
    const off = cam.followOffset.x; window.__remnant.settings.lookAhead = true;
    return { right, left, off };
  });
  assert.ok(lead.right < -40 && lead.left > 40 && Math.abs(lead.off) <= 4, `the camera leads the facing and turns with it; off centres it (${JSON.stringify(lead)})`);
  console.log(`Look-ahead: ${lead.right.toFixed(0)} facing right, ${lead.left.toFixed(0)} facing left, ${lead.off.toFixed(0)} with it off`);

  // ---- a little closer on a phone
  const view = await E(page, () => Math.round(window.__remnant.world.cameras.main.worldView.height));
  assert.ok(view <= 275, `the phone view is a little closer (${view} world px tall)`);
  console.log(`Phone view: ${view} world px tall (desktop 300)`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser phone controls: all checks passed');
} finally {
  await browser.close();
  close();
}
