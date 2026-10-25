import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const p = await browser.newPage({ viewport: { width: 956, height: 440 } });
const errors = []; p.on('pageerror', e => errors.push(e.stack)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 20000 });
const menu = async () => { await p.evaluate(() => window.__remnant.G.ui.openMenu('chapters')); await p.waitForSelector('[data-k="tw_1"]'); };
async function leave() { await p.evaluate(() => window.__remnant.world.player.die()); await p.waitForSelector('[data-k="go_leave"]', { timeout: 20000 }); await p.click('[data-k="go_leave"]'); await until(() => window.__remnant.world.room.id !== 'trial_arena' && !window.__remnant.G.inCutscene); }
try {
  await p.goto(base + '?debug&autostart&fresh'); await until(() => window.__remnant?.world?.player);
  // Reload a progressed save, after cancelling the fresh opening through navigation.
  await p.evaluate(() => { const w = window.__remnant.world; w.save.flags.intro_done = true; w.save.flags.relic_taken = true; w.save.flags.ch10_intro = true; w.save.flags.ch1_done = true; w.save.flags.ending_done = true; w.persist(); });
  await p.goto(base + '?debug&autostart'); await until(() => window.__remnant?.world?.player && !window.__remnant.G.inCutscene);
  for (const room of ['sunken_temple','drowned_library']) {
    await p.evaluate(room => {
      const w = window.__remnant.world; w.loadRoom(room,'start'); const g = w.classic.grid;
      // T.Water is the same stable tile enum as the authored room's 'w' cells.
      const water = window.__remnant.rooms[room].rows.flatMap((row,y)=>Array.from(row,(t,x)=>({t,x,y}))).filter(q=>q.t==='w');
      const spot = water.find(q=>[1,2].every(n=>water.some(r=>r.x===q.x && r.y===q.y-n)));
      if (!spot) throw Error('No deep-water fixture in '+room);
      for (const e of w.classic.ents) if (e.isFoe) e.remove = true;
      w.player.placeAt(spot.x*16+8,spot.y*16+12,1);
    }, room);
    await until(() => window.__remnant.world.player.state === 'swim');
    await until(() => window.__remnant.world.player.water.breath < 19.7);
    const x = await p.evaluate(() => window.__remnant.world.player.x);
    await p.keyboard.down('KeyD'); await until(x => window.__remnant.world.player.x > x + 8, x); await p.keyboard.up('KeyD');
    await p.keyboard.press('KeyL'); await until(() => window.__remnant.world.player.water.dashT > 0.06 && window.__remnant.world.player.water.dashT < 0.28);
    assert.ok(await p.evaluate(() => !window.__remnant.world.player.vulnerable), 'dash stroke has invulnerability');
    await p.keyboard.press('KeyQ'); assert.equal(await p.evaluate(() => window.__remnant.world.player.cds.sword_word),0,'no Covenant cast underwater');
    console.log(room + ': submerged swim, breath, real directional input and dash stroke; skills refused');
  }
  await p.evaluate(() => window.__remnant.world.loadRoom('sanctuary','start'));
  await menu(); await p.click('[data-k="tw_1"]'); await until(() => window.__remnant.world.classic.story.ch3.rounds.active);
  await until(() => window.__remnant.world.classic.story.ch3.rounds.round === 1);
  await until(() => window.__remnant.world.classic.ents.some(e=>e.isFoe));
  await p.evaluate(() => { const w = window.__remnant.world, r = w.classic.story.ch3.rounds; r.contract = 'vigil'; r.contractComplete = false; w.player.hp = 20; window.balmBefore = w.save.balm; });
  await p.evaluate(() => window.__remnant.world.player.startHeal());
  assert.ok(await p.evaluate(() => window.__remnant.world.player.state !== 'heal' && window.__remnant.world.save.balm === window.balmBefore), 'Vigil contract seals native Balm');
  await p.evaluate(() => { window.__remnant.world.classic.story.ch3.rounds.contract = null; });
  await leave();
  assert.ok(await p.evaluate(() => Object.keys(localStorage).some(k=>k.includes('board'))));
  console.log('Trial: selected through Chapters, wave one spawned, death opened results and board, Leave returned to campaign');
  await menu(); await p.click('[data-k="extreme_start"]'); await until(() => window.__remnant.world.classic.story.ch3.rounds.extreme && window.__remnant.world.classic.story.ch3.rounds.round === 1);
  await until(() => window.__remnant.world.classic.ents.some(e=>e.isFoe)); await leave();
  console.log('Extreme Survival: its own rules, wave and results/board');
  await menu(); await p.click('[data-k="daily_practice"]'); await until(() => !!window.__remnant.world.classic.story.ch3.rounds.daily && window.__remnant.world.classic.story.ch3.rounds.round === 1); await leave();
  console.log('Daily challenge: seeded practice wave and its result flow');
  await menu(); await p.click('[data-k="bt_1"]'); await until(() => window.__remnant.world.classic.story.ch3.rounds.bossOnly && !!window.__remnant.world.classic.boss);
  await until(() => window.__remnant.world.classic.boss?.state === 'idle'); await leave();
  console.log('Boss Gauntlet: shared boss starts inside the Phaser arena and returns through its results');
  assert.deepEqual(errors, []); console.log('phaser modes/water: all checks passed');
} finally { await browser.close(); close(); }
