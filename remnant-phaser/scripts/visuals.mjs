// Actual GPU rendering, combat, phone preferences and camera hand-off.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const launch = { headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) };
const browser = await chromium.launch(launch);
const ctx = await browser.newContext({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage(), errors = [];
const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); }); };
watch(page);
await page.addInitScript(() => localStorage.setItem('remnant-phaser.settings.v1', JSON.stringify({ quality: 'high', fps: '60', coach: false })));
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 30000 }).catch(async e => { throw Error(e.message + '\n' + errors.join('\n') + '\n' + JSON.stringify(await page.evaluate(() => { const w = window.__remnant?.world; return { room: w?.room.id, player: w?.player.state, distortion: w?.visuals.distortion, camera: w?.visuals.bossCamera.mode, cut: window.__remnant?.G.inCutscene, active: window.__remnant?.game.scene.isActive('world'), title: window.__remnant?.game.scene.isActive('title') }; }))); });
const equip = async id => page.evaluate(id => { const w = window.__remnant.world, wp = w.save.inventory.find(i => i.uid === w.save.equipment.weapon); wp.id = id; w.refreshStats(); }, id);
await mkdir('qa', { recursive: true });
try {
  await page.goto(base + '?debug&nostory&autostart&fresh'); await until(() => window.__remnant?.world?.player);
  assert.ok(await page.evaluate(() => window.__remnant.world.visuals.gpu), 'this run exercises real WebGL filters');
  await page.evaluate(() => {
    const w = window.__remnant.world; w.loadRoom('ashen_road', 'left'); w.save.flags.relic_taken = true;
    const open = (x,y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    const foe = w.classic.ents.find(e => e.kind === 'husk' && open(e.x - 22, e.y - 2) && open(e.x - 22, e.y - 24) && !open(e.x - 22, e.y + 2));
    for (const e of w.classic.ents) if (e !== foe) e.remove = true;
    foe.hp = foe.maxHp = 1e7; foe.think = function () { this.body.vx = 0; }; foe.executable = () => false;
    w.player.placeAt(foe.x - 22, foe.y, 1); w.player.grantInvuln(100);
    window.sawElementStrike = false; window.sawImpact = false;
    w.events.on('postupdate', () => { if (w.player.slash.visible && w.visuals.bladeGlow.active) window.sawElementStrike = true; if (w.visuals.sparks.getAliveParticleCount() > 0) window.sawImpact = true; });
  });
  for (const [id, element] of [['ember_brand', 'fire'], ['frostwake_spear', 'frost'], ['stormcaller', 'storm'], ['umbral_fang', 'shadow'], ['covenant_blade', 'holy'], ['oathblade', 'blood']]) {
    await equip(id); await until(element => window.__remnant.world.visuals.element === element, element);
    await until(() => window.__remnant.world.player.state === 'free');
    await page.evaluate(() => { const w = window.__remnant.world, f = w.classic.ents.find(e => e.kind === 'husk'); w.player.placeAt(f.x - 22, f.y, 1); w.visuals.sparks.killAll(); window.sawElementStrike = window.sawImpact = false; });
    await until(() => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
    await page.keyboard.press('KeyJ'); await until(() => window.sawElementStrike && window.sawImpact);
  }
  await page.evaluate(() => { const w = window.__remnant.world; w.save.level = 25; w.save.mantle = 100; w.refreshStats(); });
  await until(() => window.__remnant.world.player.state === 'free'); await page.keyboard.press('KeyG');
  await until(() => window.__remnant.world.player.mantleT > 0 && window.__remnant.world.visuals.heroGlow.active);
  await page.screenshot({ path: 'qa/visuals-mantle.png' });
  await page.evaluate(() => { const p = window.__remnant.world.player; p.mantleT = 0; p.releaseState(); });
  await until(() => !window.__remnant.world.visuals.heroGlow.active && !window.__remnant.world.visuals.light.visible);
  console.log('Elements and Mantle: real strikes emit colored GPU glows and impact particles; transformation adds its aura and releases it cleanly');

  await page.evaluate(() => {
    const w = window.__remnant.world; w.loadRoom('drowned_library', 'start');
    for (const e of w.classic.ents) if (e.isFoe) e.remove = true;
    const water = w.room.rows.flatMap((row,y) => Array.from(row,(t,x) => ({t,x,y}))).filter(q => q.t === 'w');
    const q = water.find(q => [1,2].every(n => water.some(r => r.x === q.x && r.y === q.y - n)));
    w.player.placeAt(q.x * 16 + 8, q.y * 16 + 12, 1);
  });
  await page.keyboard.down('KeyS'); await until(() => window.__remnant.world.player.water.breath < 19.7 && window.__remnant.world.visuals.distortion === 'water');
  await page.keyboard.up('KeyS');
  const mapBefore = await page.evaluate(() => Array.from(window.__remnant.world.visuals.pixels.data));
  await page.waitForTimeout(180);
  assert.notDeepEqual(await page.evaluate(() => Array.from(window.__remnant.world.visuals.pixels.data)), mapBefore, 'underwater displacement animates');
  assert.equal(await page.evaluate(() => window.__remnant.game.scene.getScene('hud').cameras.main.filters.internal.list.length), 0, 'world distortion never filters the HUD camera');
  await page.screenshot({ path: 'qa/visuals-water.png' });
  await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
  await page.tap('[data-k="qlow"]'); await until(() => window.__remnant.world.visuals.tier === 0 && !window.__remnant.world.visuals.displacement.active);
  await page.tap('[data-k="qhigh"]'); await page.tap('[data-k="rfon"]'); await page.tap('[data-k="menu_resume"]');
  await until(() => !window.__remnant.world.visuals.displacement.active && window.__remnant.settings.reduceFlashes);
  await page.evaluate(() => window.__remnant.G.ui.openMenu('settings')); await page.tap('[data-k="rfoff"]'); await page.tap('[data-k="menu_resume"]');
  await until(() => window.__remnant.world.visuals.distortion === 'water');
  console.log('Water: animated displacement affects world pixels; HUD stays separate; Low and Reduce flashes disable distortion through visible controls');

  await page.evaluate(() => window.__remnant.world.loadRoom('bellows_foundry', 'start'));
  await until(() => window.__remnant.world.visuals.distortion === 'heat');
  await page.screenshot({ path: 'qa/visuals-heat.png' });
  await page.evaluate(() => window.__remnant.world.loadRoom('stormwall_cliffs', 'start'));
  await until(() => window.__remnant.world.visuals.weather.length === 2 && window.__remnant.world.visuals.weather.every(e => e.getAliveParticleCount() > 0));
  await page.screenshot({ path: 'qa/visuals-weather.png' });
  await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
  assert.ok(await page.evaluate(() => window.__remnant.world.visuals.weather.every(e => !e.active)), 'weather pauses with the menu');
  await page.tap('[data-k="qlow"]'); await until(() => window.__remnant.world.visuals.weather.length === 1);
  await page.tap('[data-k="qhigh"]'); await page.tap('[data-k="menu_resume"]');
  console.log('Atmosphere: lava heat shimmer and two rain depths render; weather pauses and density follows graphics quality');

  await page.evaluate(() => {
    const w = window.__remnant.world; w.loadRoom('hunt_throne', 'start'); w.player.grantInvuln(100);
    const t = w.triggers.find(t => t.id.endsWith('_start')); w.player.placeAt(t.r.centerX, t.r.bottom, 1);
  });
  await until(() => window.__remnant.world.visuals.bossCamera.mode === 'intro');
  await until(() => window.__remnant.world.boss.phase === 1 && window.__remnant.world.visuals.bossCamera.mode === 'combat');
  const x = await page.evaluate(() => window.__remnant.world.player.x); await page.keyboard.down('KeyD'); await until(x => window.__remnant.world.player.x > x + 8, x); await page.keyboard.up('KeyD');
  assert.ok(await page.evaluate(() => { const w = window.__remnant.world; return w.cameras.main.worldView.contains(w.player.x, w.player.y) && !window.__remnant.G.inCutscene; }), 'fight framing keeps the player visible and controls live');
  await page.evaluate(() => { window.__remnant.G.camera.focus = { x: 180, y: 180 }; });
  await until(() => window.__remnant.world.visuals.bossCamera.mode === 'none');
  await page.evaluate(() => { window.__remnant.G.camera.focus = null; window.__remnant.world.boss.phase = 2; });
  await until(() => window.__remnant.world.visuals.bossCamera.mode === 'phase');
  await page.screenshot({ path: 'qa/visuals-boss.png' });
  await page.evaluate(() => { window.__remnant.settings.shake = 'off'; }); await until(() => window.__remnant.world.visuals.bossCamera.mode === 'none');
  await page.evaluate(() => {
    const w = window.__remnant.world; window.__remnant.settings.shake = 'full';
    window.previousWeather = w.visuals.weather.slice();
    for (const id of ['bellows_foundry', 'drowned_library', 'stormwall_cliffs', 'sanctuary']) w.loadRoom(id, 'start');
    w.loadRoom('trial_arena', 'start'); w.configureTrial(11); w.configureTrial(21);
    if (w.player.sprite.filters.internal.list.length !== 1) throw Error('Trial sectors accumulated hero filters');
    w.loadRoom('sanctuary', 'start');
  });
  await until(() => window.__remnant.world.visuals.distortion === 'none' && window.__remnant.world.visuals.bossCamera.mode === 'none');
  assert.equal(await page.evaluate(() => window.__remnant.world.cameras.main.filters.internal.list.length), 1, 'room changes reuse one world filter');
  assert.ok(await page.evaluate(() => window.previousWeather.every(e => !e.scene) && window.__remnant.world.visuals.weather.every(e => e.texture.key === 'glow')), 'previous weather is destroyed and sanctuary uses its own authored motes');
  console.log('Boss cameras: intro, combat and phase framing; movement stays live; story focus and motion preference take priority; room changes clear the shot');
  await page.evaluate(() => { window.oldVisuals = window.__remnant.world.visuals; window.__remnant.G.ui.openMenu('system'); });
  await page.tap('[data-k="quit"]'); await page.tap('[data-k="quit"]');
  await until(() => window.__remnant.game.scene.isActive('title'));
  await page.keyboard.press('Enter');
  await until(() => window.__remnant.game.scene.isActive('world') && window.__remnant.world.visuals !== window.oldVisuals && window.__remnant.world.player.sprite.active);
  await page.keyboard.press('KeyD'); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__remnant.game.textures.exists(window.oldVisuals.key)), false, 'the previous scene releases its displacement texture');
  assert.equal(await page.evaluate(() => window.__remnant.world.cameras.main.filters.internal.list.length), 1);
  await page.setViewportSize({ width: 900, height: 410 }); await page.waitForTimeout(200); await page.keyboard.press('KeyA'); await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => window.__remnant.game.scene.isActive('world') && !window.__remnant.game.scene.isActive('title')), 'resizing after Continue cannot restart the old title scene');
  console.log('Lifecycle: Save and quit, title and Continue recreate one effects system and release the old GPU texture');
  assert.deepEqual(errors, []);
} finally { await browser.close(); close(); }

// Canvas fallback keeps light sprites and particles, without invoking GPU APIs.
const fallback = await chromium.launch({ ...launch, args: ['--disable-webgl'] });
const { base: fallbackBase, close: closeFallback } = await serve();
try {
  const p = await fallback.newPage({ viewport: { width: 956, height: 440 } }); watch(p);
  await p.goto(fallbackBase + '?debug&nostory&autostart&fresh'); await p.waitForFunction(() => window.__remnant?.world?.player);
  assert.equal(await p.evaluate(() => window.__remnant.world.visuals.gpu), false);
  await p.evaluate(() => { const w = window.__remnant.world; w.player.mantleT = 5; w.loadRoom('bellows_foundry', 'start'); w.player.mantleT = 5; });
  await p.waitForFunction(() => window.__remnant.world.visuals.light.visible);
  assert.deepEqual(errors, []); console.log('Canvas fallback: aura and particles work without WebGL; phaser visuals: all checks passed');
} finally { await fallback.close(); closeFallback(); }
