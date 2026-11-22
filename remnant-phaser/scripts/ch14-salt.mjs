// Chapter XIV's optional fight (remnant/src/game/bosses14d.ts, story14.ts): once the sea is made whole the door east
// opens on the marshes given to salt (Ezekiel 47:11); the Warden of the Salt wakes on its trigger, changes in its
// second movement, and falls for its reward without touching the chapter's quest.
// Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on('pageerror', (e) => errors.push(e.stack ?? e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const until = (fn, arg, timeout = 30000) => p.waitForFunction(fn, arg, { timeout });
const E = (fn, arg) => p.evaluate(fn, arg);
const SHOTS = process.env.CH14_SHOTS === '1';

/** Click through dialogue, choices and scripture cards until `done` holds. */
async function drain(done, arg, max = 90000) {
  const end = Date.now() + max;
  while (Date.now() < end) {
    if (errors.length) throw Error(errors.join('\n'));
    if (await p.evaluate(done, arg)) return;
    const choice = p.locator('.dialogue .choices button:visible');
    if (await choice.count()) await choice.first().click();
    else if (await p.locator('.dialogue:visible').count()) await p.keyboard.press('Enter');
    else if (await p.locator('.lore-card:visible button').count()) await p.locator('.lore-card button').last().click();
    await p.waitForTimeout(150);
  }
  throw Error('Chapter XIV stalled: ' + await p.evaluate(() => JSON.stringify({ room: window.__remnant.world.room.id, cutscene: window.__remnant.G.inCutscene, boss: [window.__remnant.world.cboss?.key, window.__remnant.world.cboss?.state, window.__remnant.world.classic.bossActive], flags: Object.keys(window.__remnant.world.save.flags).filter((k) => k.startsWith('ch14')), ui: document.getElementById('ui').innerText.slice(-400) })));
}

/** Stand Elior in a trigger of the current room. */
const enter = (id) => E((id) => { const w = window.__remnant.world, t = w.triggers.find((t) => t.id === id); if (!t) throw Error('no trigger ' + id); w.player.placeAt(t.r.centerX, t.r.bottom, 1); }, id);
const warp = async (room, spawn = 'left') => {
  await E(([r, s]) => window.__remnant.warp(r, s), [room, spawn]);
  await until((r) => window.__remnant.world.room.id === r && !window.__remnant.world.transitioning, room);
};

try {
  await p.goto(base + '?debug&nostory&autostart&fresh');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  await E(() => {
    const w = window.__remnant.world, s = w.save;
    Object.assign(s.flags, { intro_done: true, ending_done: true, ch13_done: true, ch13_intro: true, ch14_intro: true, ch14_cloud: true, ch14_herald: true, ch14_refuge: true, ch14_gog_done: true, ch14_hamongog: true, ch14_threshold: true });
    s.level = 90;
    w.persist();
  });
  await p.goto(base + '?debug&autostart');
  await until(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  await E(() => { const w = window.__remnant.world; window.__god = setInterval(() => { const pl = w.player; if (pl && !pl.dead) pl.hp = pl.maxHp; }, 30); });

  // The door east of the sea stays shut until the chapter is done.
  await warp('healed_sea');
  assert.ok(await E(() => { const w = window.__remnant.world, x = w.room.exits.find((x) => x.to === 'salt_marshes'); return !!x && x.cond === 'ch14_done'; }), 'the marshes open only after the chapter is done');
  await E(() => { window.__remnant.world.save.flags.ch14_done = true; });

  await warp('salt_marshes');
  assert.equal(await E(() => window.__remnant.world.cboss?.key), 'salt_warden', 'the marshes hold the Warden');
  const stage0 = await E(() => window.__remnant.world.save.quests.m_gog?.stage ?? null);
  await enter('salt_start');
  await drain(() => ['idle', 'attack'].includes(window.__remnant.world.cboss?.state));
  assert.ok(await E(() => window.__remnant.world.classic.bossActive), 'the gate shuts behind Elior');
  // It fights: let it swing a while. Its attack is read every frame in the page, so a short one between two of this
  // script's reads is not missed, and the wait follows the game, not the wall clock (a loaded runner runs it slow).
  await E(() => { window.__wardenSeen = new Set(); const look = () => { const seen = window.__wardenSeen; if (!seen) return; const b = window.__remnant.world.cboss; if (b?.atk) seen.add(b.atk); requestAnimationFrame(look); }; look(); });
  await until(() => window.__wardenSeen.size >= 3, null, 90000).catch(() => {});
  const seen = new Set(await E(() => { const s = [...window.__wardenSeen]; window.__wardenSeen = null; return s; }));
  assert.ok(seen.size >= 2, `the Warden uses its attacks (${[...seen].join(', ')})`);
  // Half health: the brine rises.
  await E(() => { const b = window.__remnant.world.cboss; b.hp = Math.round(b.maxHp * 0.49); b.takeHit({ dmg: 1, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: window.__remnant.world.player }); });
  await until(() => window.__remnant.world.cboss.phase === 2 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state), null, 30000).catch(() => drain(() => window.__remnant.world.cboss.phase === 2 && ['idle', 'attack'].includes(window.__remnant.world.cboss.state)));
  console.log('The Warden: attacks seen ' + [...seen].join(', ') + '; the brine rises at half health');
  await E(() => { const w = window.__remnant.world, b = w.cboss; b.hp = 1; b.state = 'idle'; b.takeHit({ dmg: 999, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'melee', src: w.player }); });
  await drain(() => window.__remnant.world.save.flags.ch14_salt_done && !window.__remnant.G.inCutscene);
  assert.ok(await E(() => window.__remnant.world.save.inventory.some((i) => i.id === 'salt_of_the_covenant')), 'the Warden leaves the Salt of the Covenant');
  assert.equal(await E(() => window.__remnant.world.save.quests.m_gog?.stage ?? null), stage0, 'the optional fight leaves the chapter\'s quest alone');
  assert.ok(await E(() => !window.__remnant.world.classic.gateClosed && !window.__remnant.world.classic.bossActive), 'the gate opens again');
  console.log('Salt marshes: the Warden falls, pays the Salt of the Covenant, and the quest is untouched');
  assert.deepEqual(errors, []);
  console.log('Chapter XIV salt marshes: passed');
} finally {
  await browser.close();
  await close();
}
