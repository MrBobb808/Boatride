// Uri on the journey (NEXT_PLAN D4; src/game/uriKit.ts) and in the other modes: the switch goes Elior, Tirzah, Uri;
// he is drawn from his own parts (C08); his fireball, flame wave, burning ground and open-hand burst land on foes;
// every cast finds the nearest foe; the orc shaman (C10) is always at his side and answers Down + Heavy with a Geyser;
// Dodge is the Flame Dash that leaves fire behind; Down + Strike in the air is a Meteor; his three abilities are his
// own; the Fusion of Flame (C09) is his form, the shaman in him; he calls no Echoes; he keeps his own level. The Watch shows him on the wall from Watch level 35, and the Horde draws him and the shaman
// from the same parts. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); }); };
/** Press a key for a few frames (the game reads held keys on its own clock). */
const tap = async (page, key, ms = 90) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); watch(page);
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // ---- the switch: Elior → Tirzah → Uri, drawn from his own parts
  const order = await E(page, () => { const p = window.__remnant.world.player, seen = [p.hero]; p.switchCd = 0; p.switchHero(); seen.push(p.hero); p.switchCd = 0; p.switchHero(); seen.push(p.hero); return seen; });
  assert.deepEqual(order, ['elior', 'tirzah', 'uri'], `the switch goes Elior, Tirzah, Uri (${order})`);
  await until(page, () => window.__remnant.world.player.sprite.texture.key === 'action-uri');
  console.log('Switch: Elior → Tirzah → Uri; he is drawn from action-uri');

  // ---- his fire on a foe: a fireball, a wave, the ground, the open hand
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning && window.__remnant.world.foes().some((f) => f.alive));
  // One foe stands `d` px ahead, healthy and still; the rest are put far away.
  const place = (d) => { const w = window.__remnant.world, p = w.player, foes = w.foes().filter((f) => f.alive), f = foes[0];
    for (const o of foes) if (o !== f) { const e = o.e ?? o; if (e.x !== undefined) e.x = 99999; }
    const e = f.e ?? f; e.x = p.x + d; e.hp = e.maxHp = 1e6; if (e.body) { e.body.vx = 0; } p.face = 1; window.__uriFoe = f; window.__uriHp = 1e6; };
  const fire = async (key, up, d) => {
    await E(page, place, d);
    if (up) await page.keyboard.down('KeyW');
    await tap(page, key);
    if (up) await page.keyboard.up('KeyW');
    await until(page, () => window.__remnant.world.player.state !== 'flame', null, 20000);
    await page.waitForTimeout(500);
  };
  const dealt = () => E(page, () => window.__uriHp - window.__uriFoe.hp);
  await fire('KeyJ', false, 120); const ball = await dealt();
  await fire('KeyK', false, 120); const wave = await dealt();
  await fire('KeyJ', true, 80); await page.waitForTimeout(1200); const ground = await dealt();
  await fire('KeyJ', false, 22); const palm = await dealt();
  const tally = await E(page, () => ({ ...window.__remnant.world.player.flame.tally }));
  assert.ok(ball > 0 && wave > 0 && ground > 0 && palm > 0, `each of his fires lands (${JSON.stringify({ ball, wave, ground, palm, tally })})`);
  console.log(`Fire: fireball ${ball}, wave ${wave}, ground ${ground}, open hand ${palm}`);

  // ---- the shaman: always at his side, chanting fire on his own; Down + Heavy orders his Geyser
  await E(page, place, 150);
  await until(page, () => window.__remnant.world.player.flame.shaman.visible && window.__remnant.world.player.flame.tally.chants > 0, null, 30000);
  await E(page, () => { window.__uriHp = window.__uriFoe.hp; });
  await page.keyboard.down('KeyS'); await tap(page, 'KeyK'); await page.keyboard.up('KeyS');
  await until(page, () => window.__remnant.world.player.flame.tally.geysers > 0, null, 20000);
  await page.waitForTimeout(700);
  assert.ok(await dealt() > 0, 'the Geyser burns the foe');
  console.log('The shaman is beside him unbidden, chants fire, and answers Down + Heavy with the Geyser');

  // ---- his fire finds its mark: a foe behind him and above him is struck without turning
  await until(page, () => window.__remnant.world.player.state !== 'flame', null, 20000);
  // Open ground: no wall within 200 px either side at hand height.
  await E(page, () => {
    const w = window.__remnant.world, p = w.player, T = 16, solid = (x, y) => [1, 2, 3, 6, 9, 10, 11].includes(w.tileAt(Math.floor(x / T), Math.floor(y / T)));
    for (let x = 240; x < w.roomW() - 240; x += 16) {
      const feet = p.feet;
      let clear = true;
      for (let dx = -200; dx <= 200 && clear; dx += 8) for (const dy of [12, 30, 48]) if (solid(x + dx, feet - dy)) { clear = false; break; }
      if (clear) { p.placeAt(x, feet, 1); return; }
    }
  });
  await page.waitForTimeout(200);
  await E(page, place, -140);
  await E(page, () => { const w = window.__remnant.world, f = window.__uriFoe, e = f.e ?? f; e.y = (e.y ?? 0) - 40; w.player.face = 1; window.__aimed = w.player.flame.tally.aimed; });
  await tap(page, 'KeyJ');
  await page.waitForTimeout(800);
  const aim = await E(page, () => { const w = window.__remnant.world, f = window.__uriFoe; return { hurt: window.__uriHp - f.hp, aimed: w.player.flame.tally.aimed - window.__aimed, balls: w.player.flame.tally.balls, palms: w.player.flame.tally.palms, px: w.player.x, fx: f.x, fy: f.box.centerY, feet: w.player.feet, state: w.player.state }; });
  assert.ok(aim.hurt > 0 && aim.aimed > 0, `a fireball turns to the foe behind him (${JSON.stringify(aim)})`);
  console.log('Aim: his fireball found a foe behind and above him');

  // ---- the Flame Dash: a streak through the foe that leaves fire behind
  await until(page, () => window.__remnant.world.player.state !== 'flame', null, 20000);
  await E(page, place, 60);
  const x0 = await E(page, () => window.__remnant.world.player.x);
  await page.keyboard.down('KeyD'); await tap(page, 'KeyL'); await page.keyboard.up('KeyD');
  await until(page, () => window.__remnant.world.player.flame.tally.dashes > 0, null, 10000);
  await page.waitForTimeout(500);
  const dash = await E(page, () => { const fl = window.__remnant.world.player.flame; return { trail: fl.tally.trail, burning: fl.grounds.filter((g) => g.t > 0).length, x: window.__remnant.world.player.x }; });
  assert.ok(dash.trail >= 3 && dash.burning >= 3 && dash.x - x0 > 80, `the dash carries him and leaves a trail of fire (${JSON.stringify({ ...dash, x0 })})`);
  console.log(`Flame Dash: ${Math.round(dash.x - x0)} px, ${dash.trail} flames behind him`);

  // ---- his own abilities: Pillar of Flame, Ring of Fire, Firestorm
  await E(page, () => { const w = window.__remnant.world; w.save.uri = { ...(w.save.uri ?? {}), level: Math.max(10, w.save.uri?.level ?? 1), xp: 0 }; w.refreshStats(); });
  const slots = await E(page, () => [...window.__remnant.skillSlots?.(window.__remnant.world.save) ?? []]);
  await E(page, () => window.__remnant.world.player.grantInvuln(60));
  for (const [key, n] of [['KeyQ', 'pillars'], ['KeyE', 'rings'], ['KeyR', 'storms']]) {
    await until(page, () => window.__remnant.world.player.state === 'free', null, 20000);
    await E(page, place, 100);
    await E(page, () => { window.__remnant.world.save.ce = 999; });
    await tap(page, key);
    await until(page, (n) => window.__remnant.world.player.flame.tally[n] > 0, n, 10000);
  }
  await page.waitForTimeout(1200);
  assert.ok(await dealt() > 0, 'his abilities burn');
  console.log(`Abilities: Pillar of Flame, Ring of Fire, Firestorm ${slots.length ? `(${slots.join(', ')})` : ''}`);

  // ---- Meteor: Down + Strike in the air
  await until(page, () => window.__remnant.world.player.state === 'free', null, 20000);
  await E(page, () => { const p = window.__remnant.world.player; p.body.setVelocityY(-420); });
  await page.waitForTimeout(220);
  await page.keyboard.down('KeyS'); await tap(page, 'KeyJ'); await page.keyboard.up('KeyS');
  await until(page, () => window.__remnant.world.player.flame.tally.meteors > 0 && window.__remnant.world.player.state !== 'flame', null, 10000);
  console.log('Meteor: he fell in fire and burst where he landed');

  // ---- the Fusion: the shaman steps into him
  await E(page, () => { const w = window.__remnant.world; w.save.level = Math.max(w.save.level, 25); w.save.flags.mantle_known = true; w.save.mantle = 100; w.refreshStats(); });
  await tap(page, 'KeyG');
  await until(page, () => window.__remnant.world.player.mantleT > 0 && window.__remnant.world.player.sprite.texture.key === 'action-uri-crown', null, 30000);
  await page.waitForTimeout(800);
  const fusion = await E(page, () => { const fl = window.__remnant.world.player.flame; return { fused: fl.fused, shaman: fl.shaman.visible, ghost: fl.ghost.visible, scale: window.__remnant.world.player.sprite.scaleY }; });
  assert.ok(fusion.fused && !fusion.shaman && fusion.ghost && fusion.scale > 1.05, `fused: the shaman is in him (${JSON.stringify(fusion)})`);
  console.log('Fusion of Flame: the shaman steps into him, and his shape burns inside Uri');

  // ---- no Echoes and no shadows while he fights
  const alone = await E(page, () => { const w = window.__remnant.world; w.classic.summonEchoes(); return w.classic.echoes?.length ?? 0; });
  assert.equal(alone, 0, 'no Echoes come out for Uri');
  await page.screenshot({ path: 'qa/uri-journey.png' });

  // ---- his own level: a kill earns him XP while he fights
  const lv = await E(page, () => { const w = window.__remnant.world, before = w.save.uri?.xp ?? 0, lvl = w.save.uri?.level ?? 1; w.onFoeDied(40, 0, w.player.x, w.player.y); return { before, lvl, after: w.save.uri.xp, lvl2: w.save.uri.level }; });
  assert.ok(lv.after > lv.before || lv.lvl2 > lv.lvl, `Uri earns his own XP (${JSON.stringify(lv)})`);
  await E(page, () => window.__remnant.world.persist());

  // ---- the Watch: from Watch level 35 he stands on the wall and throws fire
  const wp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage(); watch(wp);
  await wp.goto(base + '?debug');
  await until(wp, () => window.__remnant?.game?.scene?.isActive('title'));
  await wp.click('[data-k=title_watch]');
  await until(wp, () => window.__remnant?.watch?.w);
  const before = await E(wp, () => window.__remnant.watch.uri.shown);
  await E(wp, () => { window.__remnant.watch.w.level = 35; });
  await until(wp, () => window.__remnant.watch.uri.shown && window.__remnant.watch.uri.tally.landed > 0, null, 60000);
  assert.ok(!before, 'Uri is not on the wall before Watch level 35');
  console.log('Watch: Uri on the wall from level 35, and his fire lands');
  await wp.screenshot({ path: 'qa/uri-watch.png' });

  // ---- the Horde: he and his shaman come from their own parts
  const hp = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, storageState: await ctx.storageState() })).newPage(); watch(hp);
  await hp.goto(base + '?debug&horde&nocamp');
  await until(hp, () => window.__remnant?.horde?.hero?.sprite);
  const horde = await E(hp, () => { const h = window.__remnant.horde; return { hero: h.heroId, key: h.hero.sprite.texture.key, shaman: h.shaman.active }; });
  assert.ok(horde.hero === 'uri' && horde.key === 'action-uri' && horde.shaman, `the Horde opens on Uri, drawn from his parts, with his shaman (${JSON.stringify(horde)})`);
  console.log('Horde: Uri from action-uri, the shaman beside him');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser uri: all checks passed');
} finally {
  await browser.close();
  close();
}
