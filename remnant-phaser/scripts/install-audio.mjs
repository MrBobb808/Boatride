// Check the real audio graph, the recorded song layer and fallback, saved
// settings, boss difficulty, an offline reload and a save-preserving update.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const version = await readFile('dist/version.json', 'utf8');
const errors = [];
const E = (p, f, a) => p.evaluate(f, a);
const until = (p, f, a) => p.waitForFunction(f, a, { timeout: 15000 });
await mkdir('qa', { recursive: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('ERR_INTERNET_DISCONNECTED')) errors.push(m.text()); });
  await p.goto(base + '?debug&autostart&fresh');
  await until(p, () => window.__remnant?.world?.player);
  // The first real gesture unlocks audio and primes both song decks.
  await p.touchscreen.tap(350, 360);
  await until(p, () => window.__remnant.audio.ready && window.__remnant.audio.ctx.state === 'running');
  await E(p, () => window.__remnant.warp('ashen_road', 'left'));
  await until(p, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  await until(p, () => window.__remnant.music.name === window.__remnant.world.room.music && window.__remnant.songs.playing === 'ch1_ashen' && window.__remnant.songs.position > 0.1);
  assert.ok(await E(p, () => window.__remnant.music.holding), 'the generated score hands its notes to the recorded song');
  console.log('Audio: a real phone tap unlocked the graph; the chapter song played over its held score');

  // Settings are controlled through the visible menu.
  await p.keyboard.press('Escape');
  await until(p, () => !!document.querySelector('#ui .menu'));
  await p.tap('[data-k="sec_settings"]');
  await p.locator('[data-k="audio_master"]').evaluate((el) => { el.value = '35'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.tap('[data-k="audio_soundtrack"]');
  await p.tap('[data-k="difficulty_normal"]');
  await until(p, () => !window.__remnant.music.holding);
  assert.equal(await E(p, () => window.__remnant.settings.master), 0.35);
  await p.screenshot({ path: 'qa/audio-phone-settings.png' });
  await p.tap('[data-k="menu_resume"]');
  await E(p, () => window.__remnant.world.persist());
  await p.goto(base + '?debug&autostart');
  await until(p, () => window.__remnant?.world?.player);
  const prefs = await E(p, () => ({ master: window.__remnant.settings.master, soundtrack: window.__remnant.settings.soundtrack, difficulty: window.__remnant.settings.bossDifficulty }));
  assert.deepEqual(prefs, { master: 0.35, soundtrack: 'score', difficulty: 'normal' });
  console.log('Settings: Master 35%, score-only audio and Normal difficulty survived a reload');

  // Every boss family reads the difficulty; reload builds a new boss.
  const hp = await E(p, () => {
    const w = window.__remnant.world;
    const arena = Object.values(window.__remnant.rooms).find((r) => r.ents.some((e) => e.t === 'boss' && e.k === 'beast_monarch'));
    const out = [];
    for (const d of ['normal', 'hard', 'merciless']) {
      window.__remnant.settings.bossDifficulty = d;
      w.loadRoom(arena.id, 'start');
      out.push(w.boss.maxHp);
    }
    window.__remnant.settings.bossDifficulty = 'normal';
    w.loadRoom('sanctuary', 'start');
    w.save.kills = 37; w.persist();
    return out;
  });
  assert.ok(hp[0] < hp[1] && hp[1] < hp[2], `boss difficulty changes health: ${hp}`);
  console.log(`Challenge: the same Crown's health follows Normal, Hard, Merciless (${hp.join(', ')})`);

  // Installed assets are cached atomically, while the original app's cache survives.
  await E(p, async () => { await navigator.serviceWorker.ready; const c = await caches.open('remnant-original-test'); await c.put('/original-marker', new Response('keep')); });
  await until(p, () => !!navigator.serviceWorker.controller);
  const installation = await E(p, async () => {
    const manifest = await fetch('./manifest.webmanifest').then((r) => r.json());
    const keys = await caches.keys(), key = keys.find((k) => k.startsWith('remnant-phaser-shell-'));
    const files = await (await caches.open(key)).keys();
    return { name: manifest.short_name, scope: manifest.scope, files: files.length, original: !!await caches.match('/original-marker') };
  });
  assert.equal(installation.name, 'Remnant Phaser');
  assert.equal(installation.scope, './');
  assert.ok(installation.files >= 15 && installation.original);
  await ctx.setOffline(true);
  await p.reload();
  await until(p, () => window.__remnant?.world?.player);
  assert.equal(await E(p, () => window.__remnant.world.save.kills), 37, 'the offline game loads the same journey');
  console.log(`Install: ${installation.files} shell files cached, original cache preserved; the same save loaded offline`);
  await ctx.setOffline(false);

  // A concrete new-version probe, through the menu, saves and resumes the run.
  await writeFile('dist/version.json', JSON.stringify({ build: 'phaser-test-update' }));
  await p.keyboard.press('Escape');
  await until(p, () => !!document.querySelector('#ui .menu'));
  await p.tap('[data-k="sec_settings"]');
  await p.locator('[data-k="sys_update"]').scrollIntoViewIfNeeded();
  await p.tap('[data-k="sys_update"]');
  await p.waitForURL((url) => url.searchParams.get('v') === 'phaser-test-update', { timeout: 15000 });
  await until(p, () => window.__remnant?.world?.player);
  assert.equal(await E(p, () => window.__remnant.world.save.kills), 37);
  assert.equal(new URL(p.url()).searchParams.has('fresh'), false, 'an update does not start a new journey');
  console.log('Update: the visible button fetched a fresh version, saved, reloaded and continued the journey');
  assert.deepEqual(errors, []);
  console.log('phaser install and audio: all checks passed');
} finally { await writeFile('dist/version.json', version); await browser.close(); close(); }
