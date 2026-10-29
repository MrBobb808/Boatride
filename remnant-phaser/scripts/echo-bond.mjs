// Choosing the Echo who fights beside you, and the bond that makes it strong.
// From the command wheel (Summon → Choose one…) or the Echoes page (Fight
// beside me), the chosen Echo heads the lineup and is called out alone. Alone
// it has the covenant's whole bond (+80% attack, +50% health); as one of two,
// half; in a larger line, none. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(`${e.message}\n${fn}\n${errors.join('\n')}`); });
const click = async (page, k) => { await page.click(`[data-k="${k}"]`); await page.waitForTimeout(60); };

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  // Three Echoes in the lineup, the whole line out.
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    s.level = 12; s.flags.relic_taken = true;
    for (const sp of ['sentinel', 'archer', 'brute']) {
      const inst = { uid: 'e_' + sp, species: sp, level: 3, xp: 0, stage: 0, hp: 9999, absorptions: 1 };
      s.echoes.push(inst); s.active.push(inst.uid);
    }
    w.refreshStats();
    setInterval(() => { const p = window.__remnant.world.player; if (p && !p.dead) p.hp = p.maxHp; }, 40);
    window.__remnant.warp('ashen_road', 'left');
  });
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  await E(page, () => window.__remnant.world.classic.squad.setSummon('all'));
  await until(page, () => window.__remnant.world.classic.squad.echoes.length === 3);
  const crowd = await E(page, () => window.__remnant.world.classic.squad.echoes.find((e) => e.inst.uid === 'e_archer').maxHp);

  // ---- the wheel: Summon → Choose one… → the Archer
  const picked = await E(page, () => {
    const h = window.__remnant.game.scene.getScene('hud');
    h.openWheel('squad');
    h.pickWheel(h.wheelItems.findIndex((i) => i.label === 'Choose one…'));
    const labels = h.wheelItems.map((i) => i.label);
    h.pickWheel(h.wheelItems.findIndex((i) => i.label.includes('Archer') || i.label.includes('Bow')));
    return labels;
  });
  assert.ok(picked.length >= 4 && picked.includes('Back'), `the Choose page lists every Echo (${picked})`);
  await until(page, () => { const sq = window.__remnant.world.classic.squad; return sq.echoes.filter((e) => e.despawn <= 0).length === 1; });
  const one = await E(page, () => { const w = window.__remnant.world, s = w.save, e = w.classic.squad.echoes.find((x) => x.despawn <= 0); return { lead: s.active[0], preset: s.summonPreset, out: e.inst.uid, hp: e.maxHp }; });
  assert.ok(one.lead === 'e_archer' && one.preset === 'one' && one.out === 'e_archer', `the chosen Echo fights alone (${JSON.stringify(one)})`);
  assert.ok(Math.abs(one.hp / crowd - 1.5) < 0.02, `alone, with the whole bond: +50% health (${crowd} → ${one.hp})`);
  console.log(`Wheel: chose the Archer from ${picked.length - 1} entries; alone it has ${one.hp} health against ${crowd} in a crowd`);

  // ---- the Echoes page: Fight beside me
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu'));
  await click(page, 'sec_echoes');
  await click(page, 'ec_e_brute');
  assert.ok(await E(page, () => document.querySelector('[data-k="ec_bond"]').textContent.includes('+80% attack')), 'the bond shows on the Echo page');
  await click(page, 'ec_lead');
  assert.deepEqual(await E(page, () => [window.__remnant.world.save.active[0], window.__remnant.world.save.summonPreset]), ['e_brute', 'one'], 'the Brute heads the lineup, called alone');
  await page.screenshot({ path: 'qa/echo-bond.png' });
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu'));
  await until(page, () => { const sq = window.__remnant.world.classic.squad; const live = sq.echoes.filter((e) => e.despawn <= 0); return live.length === 1 && live[0].inst.uid === 'e_brute'; });
  console.log('Menu: Fight beside me called the Brute out alone, and the page shows its bond');

  // ---- two share half the bond; the whole line, none
  const halves = await E(page, () => {
    const w = window.__remnant.world, sq = w.classic.squad, hp = () => sq.echoes.find((e) => e.inst.uid === 'e_brute' && e.despawn <= 0)?.maxHp;
    sq.setSummon('two'); const two = hp();
    sq.setSummon('all'); const all = hp();
    return { two, all };
  });
  assert.ok(Math.abs(halves.two / halves.all - 1.25) < 0.02, `as one of two, half the bond (${JSON.stringify(halves)})`);
  console.log(`Bond: the Brute's health ${halves.all} in the line, ${halves.two} as one of two`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser echo bond: all checks passed');
} finally {
  await browser.close();
  close();
}
