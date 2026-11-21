// Check the normal chapter tag, its saved choice, arc targeting, and arena boundary.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.__remnant?.world?.ready);
  // Prepare an existing slot past the intro, then enter it through story mode.
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await ready();
  await page.evaluate(() => {
    const w = window.__remnant.world;
    w.save.flags.ending_done = true;
    w.save.flags.intro_done = true;
    w.save.playableHero = 'uri';
    w.persist();
  });
  await page.goto(base + '?debug&autostart&fixedstep');
  await ready();
  await page.waitForFunction(() => window.__remnant.world.canUseKit);
  await page.keyboard.press('KeyN');
  await page.waitForFunction(() => window.__remnant.world.player.sprite.texture.key === 'barak');
  await page.reload();
  await ready();
  assert.equal(await page.evaluate(() => window.__remnant.world.player.hero), 'barak');

  await page.waitForFunction(() => window.__remnant.world.canUseKit && window.__remnant.world.player.onGround);

  await mkdir('qa', { recursive: true });
  await page.screenshot({ path: 'qa/barak-chapter.png' });

  // Stationary targets keep the hop order deterministic. A fourth target is
  // within hop range, and another target stands behind the caster.
  await page.evaluate(() => {
    const w = window.__remnant.world, p = w.player;
    p.face = 1;
    window.barakHits = [];
    const foes = [-72, 28, 96, 164, 232].map(dx => ({
      x: p.x + dx, box: { centerX: p.x + dx, centerY: p.feet - 25, left: p.x + dx - 2, right: p.x + dx + 2, top: p.feet - 28, bottom: p.feet - 22 },
      alive: true, removed: false,
      hit(dmg) { window.barakHits.push([dx, dmg]); return true; },
    }));
    w.foes = () => foes;
    w.heroHit = () => {};
  });
  const hit = async key => {
    await page.keyboard.down(key);
    try { await page.waitForFunction(() => window.barakHits.length > 0); }
    finally { await page.keyboard.up(key); }
    await page.waitForFunction(() => window.__remnant.world.player.state === 'free');
    return page.evaluate(() => window.barakHits.splice(0));
  };
  const arc = await hit('KeyK');
  assert.deepEqual(arc.map(a => a[0]), [28, 96, 164]);
  assert.ok(arc[0][1] > arc[1][1] && arc[1][1] > arc[2][1]);
  const jab = await hit('KeyJ');
  assert.deepEqual(jab.map(a => a[0]), [28]);
  // Put a solid tile column between the first and second impact.
  await page.evaluate(() => {
    const w = window.__remnant.world;
    const wall = Math.floor((w.player.x + 65) / 16);
    const tileAt = w.tileAt.bind(w);
    w.tileAt = (tx, ty) => tx === wall ? tileAt(-1, ty) : tileAt(tx, ty);
  });
  assert.deepEqual((await hit('KeyK')).map(a => a[0]), [28]);

  // Every journey mode runs on the same World: Barak stays himself in the Trial's arena (the Trial, Extreme, the
  // Gauntlet, the Rush, the Daily Challenge) and in Remnant's Rest, and the switch reaches him there.
  for (const room of ['trial_arena', 'remnant_rest']) {
    await page.evaluate((id) => { const w = window.__remnant.world; delete w.foes; delete w.heroHit; delete w.tileAt; w.loadRoom(id, 'start'); }, room);
    await page.waitForFunction(() => window.__remnant.world.player.state === 'free' && !window.__remnant.world.transitioning);
    assert.deepEqual(await page.evaluate(() => {
      const p = window.__remnant.world.player, was = p.hero;
      p.switchCd = 0; p.switchHero('elior'); p.switchCd = 0;
      return [was, p.hero, p.nextHero === 'tirzah', p.switchHero('barak'), p.hero, p.sprite.texture.key.replace('~L', '')];
    }), ['barak', 'elior', true, true, 'barak', 'barak'], `Barak plays in ${room}`);
  }
  // The full cycle: Elior, Tirzah, Uri, Barak, and round again.
  assert.deepEqual(await page.evaluate(() => {
    const p = window.__remnant.world.player, seen = [];
    p.switchCd = 0; p.switchHero('elior');
    for (let i = 0; i < 4; i++) { seen.push(p.hero); p.switchCd = 0; p.switchHero(); }
    seen.push(p.hero);
    return seen;
  }), ['elior', 'tirzah', 'uri', 'barak', 'elior']);
  assert.deepEqual(errors, []);
  console.log('Chapter tag and save, three diminishing hits, single jab, blocked hop, Barak in the Trial arena and the Rest, the four-hero cycle passed.');
} finally {
  await browser.close();
  close();
}
