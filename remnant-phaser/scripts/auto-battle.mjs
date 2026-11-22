// AUTO in the survival modes (game/autoBattle.ts): the chip shows only in the Trial's arena, P (or the chip) turns it
// on, and each hero then fights alone through the same buttons a player presses: foes fall with no key held. It stands
// down outside the arena.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const p = await browser.newPage({ viewport: { width: 956, height: 440 } });
const errors = []; p.on('pageerror', e => errors.push(e.stack)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const until = (fn, arg, timeout = 20000) => p.waitForFunction(fn, arg, { timeout });
const E = (fn, arg) => p.evaluate(fn, arg);
try {
  await p.goto(base + '?debug&autostart&fresh'); await until(() => window.__remnant?.world?.player);
  await E(() => { const w = window.__remnant.world; Object.assign(w.save.flags, { intro_done: true, relic_taken: true, ch10_intro: true, ch1_done: true, ending_done: true }); w.persist(); });
  await p.goto(base + '?debug&autostart'); await until(() => window.__remnant?.world?.player && !window.__remnant.G.inCutscene);
  // Not outside the arena.
  assert.equal(await E(() => window.__remnant.world.autoAllowed), false, 'no AUTO on the journey');
  assert.equal(await E(() => window.__remnant.world.toggleAuto()), false);
  await E(() => window.__remnant.G.ui.openMenu('chapters')); await p.waitForSelector('[data-k="tw_1"]');
  await p.click('[data-k="tw_1"]');
  await until(() => window.__remnant.world.classic.story.ch3.rounds.active && window.__remnant.world.classic.story.ch3.rounds.round === 1, null, 30000);
  await until(() => window.__remnant.world.canUseKit);
  assert.ok(await E(() => window.__remnant.world.hud.autoBtn.visible), 'the AUTO chip shows in the Trial');
  // Kept standing for the test: each hero is measured by what falls, not by how long he lasts.
  await E(() => { const w = window.__remnant.world; window.__keep = setInterval(() => { w.player.hp = w.player.maxHp; }, 200); });
  await p.keyboard.press('KeyP');
  await until(() => window.__remnant.world.auto.on);
  await mkdir('qa', { recursive: true });
  const fallen = () => E(() => window.__remnant.world.classic.story.ch3.rounds.kills);
  const report = [];
  for (const hero of ['elior', 'barak', 'uri', 'tirzah']) {
    // The switch waits for the move under way: AUTO is held a moment for it.
    await E(() => { window.__remnant.world.auto.on = false; });
    await until((h) => { const w = window.__remnant.world, pl = w.player, r = w.classic.story.ch3.rounds; if (pl.hero === h) return true; if (r.awaitingBlessing) r.chooseBlessing(r.pendingBlessings[0]); if (pl.state !== 'free' || window.__remnant.G.inCutscene) return false; pl.switchCd = 0; pl.switchHero(h); return pl.hero === h; }, hero, 60000).catch(async (e) => { throw Error(e.message + ' ' + await E(() => { const w = window.__remnant.world, pl = w.player; return JSON.stringify({ cast: pl.flame.cast, t: pl.flame.t, q: pl.flame.queued, hero: pl.hero, st: pl.state, cd: pl.switchCd, cut: window.__remnant.G.inCutscene, paused: window.__remnant.G.paused, dead: pl.dead, layers: document.querySelectorAll('.layer').length }); })); });
    await E(() => { window.__remnant.world.auto.on = true; });
    const x0 = await E(() => window.__remnant.world.player.x);
    const before = await fallen();
    // Wait for foes to fall by his hand alone (no key is held), or for the next round to begin.
    await until((b) => window.__remnant.world.classic.story.ch3.rounds.kills >= b + 2, before, 90000)
      .catch(async (e) => { throw Error(`${hero} fought nothing: ${e.message} ${await E(() => { const w = window.__remnant.world, pl = w.player, r = w.classic.story.ch3.rounds; return JSON.stringify({ x: Math.round(pl.x), st: pl.state, face: pl.face, round: r.round, left: r.left, foes: w.foes().filter(f => f.alive).map(f => Math.round(f.x)), axis: w.auto.axis, presses: [...w.auto.presses] }); })}`); });
    const moved = Math.abs(await E(() => window.__remnant.world.player.x) - x0);
    report.push(`${hero} ${(await fallen()) - before} foes (moved ${Math.round(moved)})`);
    if (hero === 'barak') await p.screenshot({ path: 'qa/auto-battle.png' });
  }
  console.log('AUTO: ' + report.join(', '));
  // P again hands the fight back (once no blessing or cutscene holds the keys).
  const keysFree = () => until(() => { const w = window.__remnant.world, r = w.classic.story.ch3.rounds; if (r.awaitingBlessing) r.chooseBlessing(r.pendingBlessings[0]); return w.canUseKit; }, null, 60000);
  await keysFree(); await p.keyboard.press('KeyP');
  await until(() => !window.__remnant.world.auto.on);
  await keysFree(); await p.keyboard.press('KeyP');
  await until(() => window.__remnant.world.auto.on);
  // Leaving the arena stands it down.
  await E(() => { clearInterval(window.__keep); window.__remnant.world.loadRoom('sanctuary', 'start'); });
  await until(() => window.__remnant.world.room.id === 'sanctuary' && !window.__remnant.world.transitioning);
  await until(() => !window.__remnant.world.auto.on);
  assert.equal(await E(() => window.__remnant.world.hud.autoBtn.visible), false, 'no chip outside the arena');
  // The Horde: P turns AUTO on; the hero walks alone (away from the crowd, to the gems) and takes the level-up card.
  const hp = await browser.newPage({ viewport: { width: 390, height: 844 } });
  hp.on('pageerror', e => errors.push(e.stack));
  await hp.goto(base + '?debug&horde&nocamp');
  await hp.waitForFunction(() => window.__remnant?.horde?.hero?.sprite, null, { timeout: 60000 });
  await hp.waitForTimeout(600);
  await hp.keyboard.press('KeyP');
  await hp.waitForFunction(() => window.__remnant.horde.auto);
  const h0 = await hp.evaluate(() => { const h = window.__remnant.horde; window.__hz = { x: h.hero.x, y: h.hero.y, walked: 0 }; let lx = h.hero.x, ly = h.hero.y; setInterval(() => { window.__hz.walked += Math.hypot(h.hero.x - lx, h.hero.y - ly); lx = h.hero.x; ly = h.hero.y; h.hp = h.maxHp; }, 100); return h.kills; });
  await hp.waitForFunction(() => window.__hz.walked > 120, null, { timeout: 45000 });
  await hp.waitForFunction((k) => window.__remnant.horde.kills >= k + 3, h0, { timeout: 60000 });
  // A level comes: the card opens, and AUTO chooses from it.
  await hp.evaluate(() => { window.__remnant.horde.pendingLevels++; });
  await hp.waitForFunction(() => !!window.__remnant.horde.overlay, null, { timeout: 20000 });
  await hp.waitForFunction(() => !window.__remnant.horde.overlay, null, { timeout: 20000 });
  await hp.screenshot({ path: 'qa/auto-horde.png' });
  const hz = await hp.evaluate(() => [Math.round(window.__hz.walked), window.__remnant.horde.kills]);
  await hp.keyboard.press('KeyP');
  await hp.waitForFunction(() => !window.__remnant.horde.auto);
  console.log(`Horde AUTO: walked ${hz[0]} px alone, ${hz[1]} kills, the level-up card chosen by itself`);
  assert.deepEqual(errors, []);
  console.log('auto battle: chip and P in the Trial only, all four heroes fight alone, stands down outside the arena; the Horde walks, fights and levels alone');
} finally { await browser.close(); await close(); }
