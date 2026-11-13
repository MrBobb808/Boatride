// The Bestiary's hunter's mark (NEXT_PLAN C4; remnant/src/game/progression.ts, huntBonus): a kind slain 25, 100 and
// 300 times takes 3%, 6% and 10% more from Elior's side; a hazard's damage is not marked. The Bestiary page says so.
// Weapon mastery itself is older (progression.ts) and shown on Elior → Mastery. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning && window.__remnant.world.classic.ents.some((e) => e.isFoe && !e.dying));

  // One foe, struck the same blow at each count, read in one step (nothing moves in between).
  const taken = await E(page, () => {
    const w = window.__remnant.world, L = w.classic, s = w.save;
    const f = L.ents.find((e) => e.isFoe && !e.dying && !e.isBoss);
    const blow = (kind) => { f.hp = f.maxHp = 1e6; f.invuln = 0; f.staggered = 0; f.guard = 0; f.takeHit({ dmg: 1000, poise: 0, kx: 0, ky: 0, dir: 1, kind, noKnock: true }); return 1e6 - f.hp; };
    const out = { kind: f.kind };
    for (const n of [0, 25, 100, 300]) { (s.bestiary ??= {})[f.kind] = n; out[n] = blow('melee'); }
    out.hazard = blow('hazard');
    s.bestiary[f.kind] = 120;
    return out;
  });
  assert.deepEqual([taken[0], taken[25], taken[100], taken[300], taken.hazard], [1000, 1030, 1060, 1100, 1000], `the hunter's mark grows with the count, hazards unmarked (${JSON.stringify(taken)})`);

  // The Bestiary page names the mark and the next step.
  await E(page, () => window.__remnant.G.ui.openMenu('bestiary'));
  await until(page, (kind) => document.querySelector(`[data-k="b_${kind}"]`), taken.kind);
  await E(page, (kind) => document.querySelector(`[data-k="b_${kind}"]`).click(), taken.kind);
  await until(page, () => document.querySelector('[data-k=hunt_mark]'));
  const line = await E(page, () => document.querySelector('[data-k=hunt_mark]').textContent);
  assert.ok(line && /\+6%/.test(line) && /\+10% at 300/.test(line), `the Bestiary shows the mark (${line})`);
  console.log(`Hunter's mark on ${taken.kind}: 0 → ${taken[0]}, 25 → ${taken[25]}, 100 → ${taken[100]}, 300 → ${taken[300]}; "${line}"`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser mastery: all checks passed');
} finally {
  await browser.close();
  close();
}
