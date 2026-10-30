// Weather and ambience (POLISH_PLAN §11c): each place carries its mood. The storm
// coasts rain, splash and flash with lightning (the sky lights up behind the
// hills and the room's darkness lifts), the valley, the Hunt and the Pestilence
// lie in fog, the Ashen Village and Cinders drop ash and blow embers, and light
// falls through the temples and over the Rest with motes in it. Everything holds
// still while the menu is open. Run after `npm run build`.
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
const go = async (page, id) => {
  await E(page, (r) => window.__remnant.warp(r, 'start'), id);
  await until(page, (r) => { const w = window.__remnant.world; return w.room.id === r && !w.transitioning; }, id);
  await page.waitForTimeout(700);
};
const look = (page) => E(page, () => {
  const a = window.__remnant.world.visuals.atmosphere;
  return { moods: a.moods.join(','), beams: a.beams.length, particles: a.emitters.reduce((n, e) => n + e.getAliveParticleCount(), 0), fog: a.fog.length };
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => { window.__remnant.settings.quality = 'high'; window.__remnant.god?.(true); });

  // ---- the storm: rain lands, the bolt lights the sky and lifts the dark, then fades
  await go(page, 'chittim_harbor');
  const storm = await E(page, async () => {
    const w = window.__remnant.world, a = w.visuals.atmosphere, frame = () => new Promise((r) => requestAnimationFrame(r));
    const corner = () => w.art.front.getContext().getImageData(6, 6, 1, 1).data[3], sky = () => { const d = w.art.back.getContext().getImageData(Math.round(w.art.back.width / 2), 4, 1, 1).data; return d[0] + d[1] + d[2]; };
    await frame(); await frame();
    const before = { dark: corner(), sky: sky() };
    a.strike(); await frame(); await frame();
    const lit = { dark: corner(), sky: sky(), flash: a.flash, veil: a.veil.alpha };
    for (let i = 0; i < 60; i++) await frame();
    return { before, lit, after: a.flash, splashes: a.splash.getAliveParticleCount() + a.splash.getDeadParticleCount(), strikes: a.strikes };
  });
  assert.ok(storm.lit.flash > 0.2 && storm.lit.veil > 0, `the bolt flashes (${JSON.stringify(storm)})`);
  assert.ok(storm.lit.sky > storm.before.sky + 30, `the sky lights up behind the hills (${JSON.stringify(storm)})`);
  assert.ok(storm.lit.dark <= storm.before.dark, `the room's darkness lifts in the flash (${JSON.stringify(storm)})`);
  assert.ok(storm.after < 0.05, `the flash fades (${storm.after})`);
  assert.ok(storm.splashes > 0, 'the rain splashes on the floor');
  await page.screenshot({ path: 'qa/atmosphere-storm.png' });
  console.log(`Storm: sky ${storm.before.sky} → ${storm.lit.sky}, dark corner ${storm.before.dark} → ${storm.lit.dark}, splashes ${storm.splashes}`);
  // Lightning comes on its own, too.
  const more = await E(page, async () => { const a = window.__remnant.world.visuals.atmosphere, n = a.strikes; for (let i = 0; i < 120 && a.strikes === n; i++) await new Promise((r) => setTimeout(r, 100)); return a.strikes - n; });
  assert.ok(more > 0, 'lightning strikes on its own');

  // ---- fog in the valley, the Hunt and the Pestilence
  for (const id of ['bone_fields', 'riftwood_trail', 'greenfall_marsh']) {
    await go(page, id);
    const f = await look(page);
    assert.ok(f.moods.includes('fog') && f.fog === 2, `${id} lies in fog (${JSON.stringify(f)})`);
    if (id === 'bone_fields') await page.screenshot({ path: 'qa/atmosphere-fog.png' });
  }
  console.log('Fog: the valley, the Hunt and the Pestilence');

  // ---- ash and embers in the Ashen Village and Cinders
  for (const id of ['village_square', 'slag_procession']) {
    await go(page, id);
    await page.waitForTimeout(2500);
    const f = await look(page);
    assert.ok(f.moods.includes('ash') && f.moods.includes('embers') && f.particles > 5, `${id} drops ash and blows embers (${JSON.stringify(f)})`);
    if (id === 'village_square') await page.screenshot({ path: 'qa/atmosphere-ash.png' });
  }
  console.log('Ash and embers: the Ashen Village and Cinders');

  // ---- light shafts with motes in the temple and over the Rest; they light the floor where they land
  for (const id of ['covenant_chamber', 'remnant_rest']) {
    await go(page, id);
    await page.waitForTimeout(1500);
    const f = await look(page);
    assert.ok(f.moods.includes('beams') && f.beams >= 2 && f.particles > 3, `${id} has shafts of light with motes (${JSON.stringify(f)})`);
    if (id === 'covenant_chamber') {
      const lit = await E(page, () => { const w = window.__remnant.world, b = w.visuals.atmosphere.beams[0]; return { alpha: b.img.alpha, onFloor: b.floorY > b.y + 48 }; });
      assert.ok(lit.alpha > 0.1 && lit.onFloor, `the shaft shows and reaches the floor (${JSON.stringify(lit)})`);
      await page.screenshot({ path: 'qa/atmosphere-beams.png' });
    }
  }
  console.log('Light: shafts and motes in the temple and over the Rest');

  // ---- a plain room keeps only the original weather; the menu holds everything still
  await go(page, 'shinar_plain');
  assert.equal((await look(page)).moods, '', 'the plain carries no extra mood');
  await go(page, 'stormwall_cliffs');
  const held = await E(page, async () => {
    const w = window.__remnant.world, a = w.visuals.atmosphere;
    w.hud.togglePause();
    await new Promise((r) => setTimeout(r, 400));
    const t = a.t, n = a.strikes; a.next = 0.01;
    await new Promise((r) => setTimeout(r, 600));
    const still = a.t === t && a.strikes === n;
    w.hud.togglePause();
    return still;
  });
  assert.ok(held, 'the weather holds still while the menu is open');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser atmosphere: all checks passed');
} finally {
  await browser.close();
  close();
}
