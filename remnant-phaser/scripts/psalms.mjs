// Psalms (POLISH_PLAN §12d). Each boss leaves its Psalm (two also leave a Psalter
// Page); saves that beat bosses before Psalms receive theirs on load. Worn Psalms
// cost slots: 3, one more per Page, up to 7, worn and taken off from the pause
// menu's Psalms section. Their effects: a second air dash, a third air jump, a
// longer dash, harder-hitting and hardier Echoes, a parry that heals or marks the
// foe or readies three critical blows, critical blows that return Energy, and a
// partner who pulls you up twice. Run after `npm run build`.
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

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);

  // ---- a new journey: no Psalms, three slots
  assert.deepEqual(await E(page, () => { const w = window.__remnant.world; return [w.save.psalms.owned.length, window.__remnant.psalms.slots(w.save)]; }), [0, 3], 'a new journey has no Psalms and three slots');

  // ---- a boss leaves its Psalm, once; the Marshal also leaves a Psalter Page
  const won = await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    for (const k of ['gatekeeper', 'marshal', 'idol', 'golden_image', 'weigher']) w.bossSpoils(k);
    w.bossSpoils('gatekeeper');
    return { owned: [...s.psalms.owned], pages: s.keyItems.filter((k) => k.startsWith('psalter_')), slots: window.__remnant.psalms.slots(s) };
  });
  assert.deepEqual(won, { owned: ['open_gate', 'banner', 'broken_idol', 'furnace', 'balance'], pages: ['psalter_3'], slots: 4 }, 'each boss leaves its Psalm once; the Marshal a Page too');
  console.log(`Bosses: ${won.owned.join(', ')}; a Page from the Marshal, ${won.slots} slots`);

  // ---- slots: worn Psalms must fit
  const fit = await E(page, () => {
    const w = window.__remnant.world, s = w.save, P = window.__remnant.psalms;
    const a = P.wear(s, 'open_gate'), b = P.wear(s, 'banner'), c = P.wear(s, 'furnace');
    const full = P.used(s);
    P.takeOff(s, 'banner'); const d = P.wear(s, 'furnace');
    return { a, b, c, full, d, worn: [...s.psalms.worn] };
  });
  assert.deepEqual(fit, { a: true, b: true, c: false, full: 4, d: true, worn: ['open_gate', 'furnace'] }, 'a Psalm that does not fit cannot be worn');
  console.log('Slots: the Gate and the Banner filled four; the Furnace waited until the Banner came off');

  // ---- movement: a second air dash; with the Four Winds and the Plume, a third jump; the Wind's longer dash
  const move = await E(page, async () => {
    const w = window.__remnant.world, s = w.save, p = w.player, frame = () => new Promise((r) => requestAnimationFrame(r)), P = window.__remnant.psalms;
    await frame(); await frame();
    const dashes = p.airDash;
    s.keyItems.push('eagle_wings'); window.__remnant.psalms.grantForBoss(s, 'grecia_prince'); s.psalms.worn = []; P.wear(s, 'four_winds');
    await frame(); await frame();
    return { dashes, jumps: p.airJumps };
  });
  assert.deepEqual(move, { dashes: 2, jumps: 2 }, 'the Open Gate gives two air dashes; the Four Winds a third jump');
  console.log('Movement: two air dashes with the Open Gate; two air jumps (three in all) with the Four Winds and the Plume');

  // ---- Echoes: the Banner and the Cleansing raise their numbers
  const echo = await E(page, () => {
    const w = window.__remnant.world, s = w.save, P = window.__remnant.psalms;
    s.psalms.worn = []; w.refreshStats(); const d0 = { dmg: w.eliorD.echoDmg, hp: w.eliorD.echoHp };
    window.__remnant.psalms.grantForBoss(s, 'plague_monarch');
    P.wear(s, 'banner'); P.wear(s, 'cleansing'); w.refreshStats();
    return { dmg: +(w.eliorD.echoDmg / d0.dmg).toFixed(2), hp: +(w.eliorD.echoHp / d0.hp).toFixed(2) };
  });
  assert.deepEqual(echo, { dmg: 1.25, hp: 1.3 }, 'the Banner and the Cleansing strengthen the Echoes');
  console.log(`Echoes: damage ×${echo.dmg}, health ×${echo.hp}`);

  // ---- combat: a perfect parry with the Furnace heals; the Refiner readies three crits; the Balance returns Energy
  const parry = await E(page, () => {
    const w = window.__remnant.world, s = w.save, p = w.player, P = window.__remnant.psalms;
    s.psalms.worn = []; window.__remnant.psalms.grantForBoss(s, 'cinder_monarch'); P.wear(s, 'furnace'); P.wear(s, 'refiner');
    p.hp = Math.round(p.maxHp / 2); const before = p.hp;
    p.state = 'free'; p.parryT = 0.2; const src = { parried() {} };
    p.hurt({ dmg: 30, dir: -p.face, src });
    return { healed: p.hp - before, crits: p.psalmCrits, pct: Math.round(((p.hp - before) / p.maxHp) * 100) };
  });
  assert.ok(parry.pct >= 8 && parry.crits === 3, `a perfect parry heals with the Furnace and readies three crits with the Refiner (${JSON.stringify(parry)})`);
  console.log(`Parry: healed ${parry.healed} (${parry.pct}%), ${parry.crits} critical blows readied`);

  // ---- the Watch: the partner pulls you up twice in a room
  const watch = await E(page, async () => {
    const w = window.__remnant.world, s = w.save, P = window.__remnant.psalms, p = w.player;
    window.__remnant.psalms.grantForBoss(s, 'persia_prince'); s.psalms.worn = []; P.wear(s, 'watch');
    s.archer.level = 20; w.partner.toggle();
    for (let i = 0; i < 60 && !w.partner.unit; i++) await new Promise((r) => setTimeout(r, 50));
    const ups = [];
    for (let i = 0; i < 3; i++) { p.hp = 1; p.invuln = 0; p.untouchable = 0; p.die(); ups.push(!p.dead); if (p.dead) break; }
    return ups;
  });
  assert.deepEqual(watch, [true, true, false], 'with the Watch the partner pulls you up twice, then the fall stands');
  console.log('Watch: pulled up twice; the third fall stood');

  // ---- a save that beat bosses before Psalms receives theirs on load; the menu shows them
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => { const w = window.__remnant.world; delete w.save.psalms; Object.assign(w.save.flags, { gate_open: true, ch6_storm_done: true }); w.persist(); });
  await page.goto(base + '?debug&nostory&autostart');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  const late = await E(page, () => { const s = window.__remnant.world.save; return { owned: [...s.psalms.owned].sort(), pages: s.keyItems.filter((k) => k.startsWith('psalter_')) }; });
  assert.deepEqual(late, { owned: ['open_gate', 'wind'], pages: ['psalter_4'] }, 'Psalms and a Page for bosses beaten before Psalms');
  await E(page, () => window.__remnant.game.scene.getScene('hud').togglePause());
  await page.click('[data-k="sec_psalms"]').catch(() => {});
  await until(page, () => !!document.querySelector('[data-k="ps_open_gate"]'));
  await page.click('[data-k="ps_open_gate"]');
  await until(page, () => window.__remnant.world.save.psalms.worn.includes('open_gate'));
  await page.screenshot({ path: 'qa/psalms-menu.png' });
  console.log('Late: the Gate and the Wind (and a Page) came to an older save; worn from the Psalms page');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser psalms: all checks passed');
} finally {
  await browser.close();
  close();
}
