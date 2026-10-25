// Shared high-level combat must operate on the one native Phaser hero.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 15000 });
const setup = async (level = 1) => {
  await page.evaluate(level => {
    const w = window.__remnant.world; w.loadRoom('ashen_road', 'left');
    const open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    const f = w.classic.ents.find(e => e.kind === 'husk' && open(e.x - 22, e.y - 2) && open(e.x - 22, e.y - 24) && !open(e.x - 22, e.y + 2));
    for (const e of w.classic.ents) if (e !== f) e.remove = true;
    f.hp = f.maxHp = 1e7; f.think = function () { this.body.vx = 0; }; f.setState('idle', 'idle');
    w.save.level = level; w.save.flags.relic_taken = true; w.refreshStats();
    w.player.maxHp = w.d.maxHp; w.player.hp = w.d.maxHp; w.player.placeAt(f.x - 22, f.y, 1);
  }, level);
  await until(() => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
};
try {
  await page.goto(base + '?debug&nostory&autostart&fresh'); await until(() => window.__remnant?.world?.player);
  await setup();
  await page.evaluate(() => { const f = window.__remnant.world.classic.ents.find(e => e.kind === 'husk'); f.staggered = 10; f.hp = 100; });
  await page.keyboard.press('KeyJ'); await until(() => window.__remnant.world.player.state === 'execute');
  await until(() => window.__remnant.world.player.state === 'free');
  assert.ok(await page.evaluate(() => !window.__remnant.world.classic.ents.some(e => e.kind === 'husk' && !e.dying)), 'execution finishes a staggered foe');
  console.log('Execution: a real strike on a staggered husk starts a shared finisher, lands and releases control');
  for (const [weapon, field] of [['ember_brand', 'burn'], ['frostwake_spear', 'chill'], ['oathblade', 'bleed']]) {
    await setup(); await page.evaluate(id => { const w = window.__remnant.world, wp = w.save.inventory.find(i => i.uid === w.save.equipment.weapon); wp.id = id; w.refreshStats(); w.classic.ents.find(e => e.kind === 'husk').executable = () => false; }, weapon);
    await page.keyboard.press('KeyJ'); await until(field => window.__remnant.world.classic.ents.find(e => e.kind === 'husk')[field] > 0, field);
  }
  console.log('Weapon elements: real strikes apply burning, slowing frost and bleeding');
  assert.ok(await page.evaluate(() => Object.values(window.__remnant.world.save.weaponMastery ?? {}).some(x => x > 0)), 'landed native strikes earn persistent weapon mastery');
  for (const id of ['dagger', 'axe', 'holy_water', 'cross', 'sling']) {
    await setup(); await page.evaluate(id => { const w = window.__remnant.world; w.save.sub = id; w.save.hearts = 99; window.spawned = []; const add = w.classic.add.bind(w.classic); w.classic.add = e => { window.spawned.push(e.kind); return add(e); }; }, id);
    await page.keyboard.press('KeyU'); await until(() => window.__remnant.world.save.hearts < 99);
    assert.ok(await page.evaluate(id => window.spawned.includes(id), id), `${id} launches`);
  }
  console.log('Sub-weapons: all five launch through U and spend their heart costs');
  for (const id of ['rally', 'tempest', 'dawnfall', 'renewal']) {
    await setup(); await page.evaluate(id => { const w = window.__remnant.world; w.save.equippedSuper = id; w.save.rally = 100; w.player.hp = 20; w.save.ce = 0; }, id);
    await page.keyboard.press('KeyT'); await until(() => window.__remnant.world.save.rally < 100);
    await until(() => !window.__remnant.G.inCutscene && window.__remnant.world.player.state === 'free');
    if (id === 'renewal') assert.ok(await page.evaluate(() => window.__remnant.world.player.hp > 20 && window.__remnant.world.save.ce > 90), 'Renewal heals the native hero and restores Energy');
    else assert.ok(await page.evaluate(() => window.__remnant.world.classic.ents.find(e => e.kind === 'husk').hp < 1e7), `${id} strikes a real foe`);
  }
  console.log('Supers: all four spend the gauge, complete, and either hit foes or heal the one native hero');
  await setup(25); await page.evaluate(() => { window.__remnant.world.save.mantle = 100; });
  await page.keyboard.press('KeyG'); await until(() => window.__remnant.world.player.state === 'transform');
  await until(() => window.__remnant.world.player.mantleT > 0 && window.__remnant.world.player.state === 'free');
  assert.equal(await page.evaluate(() => window.__remnant.world.save.mantle), 0);
  await page.evaluate(() => { const w = window.__remnant.world, f = w.classic.ents.find(e => e.kind === 'husk'); f.executable = () => false; for (let y = 4; y < w.room.h; y++) for (let x = 4; x < w.room.w - 9; x++) { if (Array.from({ length: 8 }, (_, i) => i).every(i => w.tileAt(x + i, y) !== 0 && [1, 2, 3].every(j => w.tileAt(x + i, y - j) === 0))) { f.x = (x + 6) * 16 + 8; f.y = y * 16; w.player.placeAt(x * 16 + 8, f.y, 1); return; } } });
  const x0 = await page.evaluate(() => window.__remnant.world.player.x);
  await page.keyboard.press('KeyU'); await until(x => window.__remnant.world.player.x > x + 40, x0);
  assert.ok(await page.evaluate(() => window.__remnant.world.player.mantleT > 0), 'chain throw hits, blinks and retains the form');
  console.log('Shadow Mantle: level 25 awakening, gauge spent, transformation, live chain throw → impact → teleport attack');
  await setup(25);
  const terrain = await page.evaluate(() => {
    const w = window.__remnant.world, p = w.player;
    const hit = (hazard, protectedForm) => { p.releaseState(); p.hp = p.maxHp; p.invuln = 0; p.parryT = 0; p.shieldT = 0; p.armorLight = protectedForm ? 10 : 0; p.mantleT = protectedForm ? 10 : 0; const before = p.hp; p.hurt({ dmg: 40, dir: 0, hazard }); return before - p.hp; };
    return { bareHazard: hit(true, false), protectedHazard: hit(true, true), bareBlow: hit(false, false), protectedBlow: hit(false, true) };
  });
  assert.equal(terrain.protectedHazard, terrain.bareHazard, 'temporary combat protection never weakens terrain hazards');
  assert.ok(terrain.protectedBlow < terrain.bareBlow, 'the same protections still reduce ordinary blows');
  console.log('Hazard parity: terrain bypasses combat protections while ordinary blows still respect them');
  assert.deepEqual(errors, []); console.log('phaser powers: all checks passed');
} finally { await browser.close(); close(); }
