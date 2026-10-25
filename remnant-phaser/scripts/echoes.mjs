// The Echoes in the Phaser build: the original's own Echo units, run through
// the classic layer. They come along through the doors, fight the room's foes
// on their own, answer the command wheel (the world waits while it is up), the
// summon presets narrow the lineup, Switch trades places with one, and a
// fallen Echo returns after its time down. On a phone the ECHOES button opens
// the wheel. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout });

/** A journey with two Echoes (a Sentinel and an Archer), entering the Ashen Road. */
const start = async (ctx) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    s.level = 8;
    for (const sp of ['sentinel', 'archer']) {
      const inst = { uid: 'e_' + sp, species: sp, level: 1, xp: 0, stage: 0, hp: 9999, absorptions: 1 };
      s.echoes.push(inst);
      s.active.push(inst.uid);
    }
    setInterval(() => { const p = window.__remnant.world.player; if (p && !p.dead) p.hp = p.maxHp; }, 40);
    window.__remnant.warp('ashen_road', 'left');
  });
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  return page;
};
const out = (page) => E(page, () => window.__remnant.world.classic.squad.echoes.map((e) => e.inst.species));

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await start(ctx);

  // ---- they come along through the door, and fight on their own
  assert.deepEqual((await out(page)).sort(), ['archer', 'sentinel'], 'both Echoes came through the door');
  const fight = await E(page, async () => {
    const w = window.__remnant.world;
    // Elior stands on open floor near a husk and does nothing.
    const open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && open(e.x - 60, e.y - 2) && !open(e.x - 60, e.y + 2));
    w.player.placeAt(f.x - 60, f.y, 1);
    const before = w.classic.ents.filter((e) => e.isFoe).reduce((n, e) => n + e.hp, 0);
    const kills = w.save.kills;
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const now = w.classic.ents.filter((e) => e.isFoe).reduce((n, e) => n + e.hp, 0);
      if (now < before || w.save.kills > kills) return { hurt: before - now, kills: w.save.kills - kills };
    }
    return null;
  });
  assert.ok(fight, 'the Echoes fought the room\'s foes while Elior stood still');
  await page.screenshot({ path: 'qa/echoes-fight.png' });
  console.log(`Fight: the Echoes struck the husks (${JSON.stringify(fight)}) while Elior stood still`);

  // ---- the command wheel: the world waits; a command closes it
  await page.keyboard.press('KeyC');
  await until(page, () => window.__remnant.game.scene.getScene('hud').wheelOpen);
  const t0 = await E(page, () => window.__remnant.G.time);
  await page.waitForTimeout(400);
  assert.equal(await E(page, () => window.__remnant.G.time), t0, 'the world waits while the wheel is up');
  await page.screenshot({ path: 'qa/echoes-wheel.png' });
  const click = async (name) => {
    const at = await E(page, (name) => { const t = window.__remnant.game.scene.getScene('hud').children.list.flatMap((o) => o.list ?? [o]).find((o) => o.name === name); return t && { x: t.x / devicePixelRatio, y: t.y / devicePixelRatio }; }, name);
    assert.ok(at, `the wheel shows ${name}`);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
  };
  await click('wheel_Defensive');
  const mode = await E(page, () => ({ mode: window.__remnant.world.save.echoMode, open: window.__remnant.game.scene.getScene('hud').wheelOpen }));
  assert.deepEqual(mode, { mode: 'defensive', open: false }, 'Defensive was chosen and the wheel closed');

  // ---- the summon page: only the lead
  await page.keyboard.press('KeyC');
  await until(page, () => window.__remnant.game.scene.getScene('hud').wheelOpen);
  await click('wheel_Summon…');
  await click('wheel_One');
  await until(page, () => window.__remnant.world.classic.squad.echoes.filter((e) => e.despawn <= 0).length === 1);
  assert.equal(await E(page, () => window.__remnant.world.save.summonPreset), 'one', 'Summon: the lead Echo only');
  await page.keyboard.press('KeyC');
  await until(page, () => window.__remnant.game.scene.getScene('hud').wheelOpen);
  await click('wheel_Summon…');
  await click('wheel_All');
  await until(page, () => window.__remnant.world.classic.squad.echoes.filter((e) => e.despawn <= 0).length === 2);
  console.log('Wheel: the world waited; Defensive, then Summon One and Summon All, took effect');

  // ---- Switch: Elior trades places with an Echo
  const swap = await E(page, async () => {
    const w = window.__remnant.world, sq = w.classic.squad, e = sq.echoes[0];
    for (const f of w.classic.ents) f.remove = true;
    w.player.placeAt(e.x + 120, e.y, -1);
    await new Promise((r) => setTimeout(r, 300));
    const pick = sq.pickSwap();
    return { pick: pick && { x: Math.round(pick.x), id: pick.inst.uid }, px: Math.round(w.player.x) };
  });
  assert.ok(swap.pick, 'an Echo is marked for the swap');
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(150);
  const after = await E(page, (id) => { const w = window.__remnant.world, e = w.classic.squad.echoes.find((x) => x.inst.uid === id); return { px: Math.round(w.player.x), ex: Math.round(e.x), cd: w.classic.squad.switchCd, strike: w.player.swapStrikeT }; }, swap.pick.id);
  assert.ok(Math.abs(after.px - swap.pick.x) < 24 && Math.abs(after.ex - swap.px) < 24 && after.cd > 0 && after.strike > 0, `Elior and the Echo traded places (${JSON.stringify({ swap, after })})`);
  console.log(`Switch: Elior ${swap.px} → ${after.px}, the Echo ${swap.pick.x} → ${after.ex}; his next blow is primed`);

  // ---- a fallen Echo returns
  // A killing blow (retried while it is still arriving or being recalled, when blows pass it by).
  await until(page, () => {
    const w = window.__remnant.world, e = w.classic.squad.echoes.find((x) => x.inst.species === 'archer');
    if (!e) return true;
    e.invuln = 0;
    e.takeHit({ dmg: 1e6, poise: 999, kx: 0, ky: 0, dir: 0, kind: 'melee' });
    return e.remove;
  });
  const fell = await E(page, () => ({ down: window.__remnant.world.save.echoes.find((e) => e.species === 'archer').downFor }));
  await until(page, () => !window.__remnant.world.classic.squad.echoes.some((e) => e.inst.species === 'archer' && !e.dying && e.despawn <= 0));
  assert.ok(await E(page, () => window.__remnant.world.save.echoes.find((e) => e.species === 'archer').downFor > 0), `the Archer fell and is down (${JSON.stringify(fell)})`);
  await E(page, () => { window.__remnant.world.save.echoes.find((e) => e.species === 'archer').downFor = 0.2; });
  await until(page, () => window.__remnant.world.classic.squad.echoes.some((e) => e.inst.species === 'archer' && e.despawn <= 0 && !e.dying));
  console.log('Fall: the Archer fell, stayed down, and returned to Elior\'s side');

  // ---- they follow through the next door
  await E(page, () => window.__remnant.warp('sanctuary', 'start'));
  await until(page, () => window.__remnant.world.room.id === 'sanctuary' && !window.__remnant.world.transitioning);
  assert.equal((await out(page)).length, 2, 'both Echoes followed into the next room');

  // ---- on a phone: the ECHOES button opens the wheel
  const phone = await start(await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await phone.waitForTimeout(300);
  const btn = await E(phone, () => { const b = window.__remnant.game.scene.getScene('hud').btns.find((b) => b.a === 'echo'); return { x: b.x / 2, y: b.y / 2, on: b.g.visible }; });
  assert.ok(btn.on, 'the ECHOES button shows once there are Echoes');
  await phone.touchscreen.tap(btn.x, btn.y);
  await until(phone, () => window.__remnant.game.scene.getScene('hud').wheelOpen);
  await phone.screenshot({ path: 'qa/echoes-phone-wheel.png' });
  console.log('Touch: the ECHOES button opened the wheel');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser echoes: all checks passed');
} finally {
  await browser.close();
  close();
}
