// The song layer (audio/songs.ts) with stand-in songs: short tones served as the
// files Suno songs would be. A chapter's vocal song plays once where it is mapped
// and hands over to the instrumental; rooms that share a song keep it going; the
// score is silent under a song and back where there is none; dialogue ducks the
// song; Score only and Sung songs off are obeyed; songs survive in their own
// offline cache. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const dist = resolve('dist'), errors = [];
/** A mono 16-bit WAV tone of `sec` seconds: a stand-in song. */
function tone(sec, hz) {
  const rate = 8000, n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return b;
}
// Chapter I has both songs, Chapter VII both, Chapter II none (its files 404).
const FILES = { ch1_ashen: tone(1.6, 330), ch1_hearthward: tone(6, 220), ch7_hunt: tone(30, 294), ch7_hunt_inst: tone(6, 196) };
const served = {};
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  const song = path.match(/^music\/([a-z0-9_]+)\.mp3$/);
  if (song) {
    served[song[1]] = (served[song[1]] ?? 0) + 1;
    const f = FILES[song[1]];
    if (!f) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', 'audio/wav');
    res.end(f);
    return;
  }
  if (!path || path.endsWith('/')) path += 'index.html';
  try {
    const file = resolve(dist, path);
    if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
try {
  const page = await (await browser.newContext({ viewport: { width: 956, height: 440 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  // A real click: the gesture that unlocks Web Audio also primes the song elements.
  await page.mouse.click(480, 200);
  await page.waitForFunction(() => window.__remnant.audio.ctx?.state === 'running');
  const state = () => page.evaluate(() => { const { songs, music } = window.__remnant; return { song: songs.player.playing, held: music.holding, track: music.name, level: songs.player.level, pos: songs.player.position }; });
  await page.evaluate(() => { window.__talk = window.__remnant.G.ui.dialogue; });
  const go = (room) => page.evaluate((room) => { const { G } = window.__remnant; G.ui.dialogue = async () => 0; G.inCutscene = false; window.__remnant.warp(room, 'left'); }, room);
  const until = (fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms });

  // Chapter I: the vocal song first, the score silent beneath it.
  await go('ashen_road');
  await until(() => window.__remnant.songs.player.playing === 'ch1_ashen' && window.__remnant.music.holding);
  let s = await state();
  assert.equal(s.track, 'village', 'the score still names the place');
  // The vocal ends by itself and its place moves on to the instrumental.
  await until(() => window.__remnant.songs.player.playing === 'ch1_hearthward');
  assert.ok((await state()).held, 'the instrumental keeps the score quiet');
  // Another room of the chapter with a different score track shares the instrumental: it keeps playing, no restart.
  await page.waitForTimeout(700);
  const before = (await state()).pos;
  await go('temple_hall');
  await until(() => window.__remnant.music.name === 'temple');
  await page.waitForTimeout(400);
  s = await state();
  assert.equal(s.song, 'ch1_hearthward');
  assert.ok(s.held, 'the temple score is held under the shared song');
  assert.ok(s.pos > before, `the song carried on (${before.toFixed(2)} → ${s.pos.toFixed(2)})`);
  // Back in the village this session: the vocal is not repeated.
  await go('ashen_road');
  await page.waitForTimeout(600);
  assert.equal((await state()).song, 'ch1_hearthward', 'a vocal song plays once per session');

  // Dialogue ducks the song, and it comes back after.
  await page.evaluate(() => { window.__remnant.G.ui.dialogue = window.__talk; });
  await page.evaluate(() => { window.__done = window.__remnant.G.ui.dialogue([{ who: 'tobiah', text: 'The songs carry on under us.' }]); });
  await page.waitForTimeout(900);
  assert.ok((await state()).level < 0.5, 'ducked under dialogue ');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__remnant.songs.player.level > 0.8, null, { timeout: 8000 });

  // Chapter II has no songs yet: its 404s hand the music back to the score.
  await go('shinar_camp');
  await until(() => window.__remnant.music.name === 'shinar' && !window.__remnant.songs.player.playing && !window.__remnant.music.holding);
  for (let i = 0; i < 50 && !(served.ch2_shinar && served.ch2_tower); i++) await page.waitForTimeout(100);
  assert.ok(served.ch2_shinar >= 1 && served.ch2_tower >= 1, 'both of Chapter II\'s songs were looked for');
  assert.ok(!(await state()).song && !(await state()).held, 'the score plays where no song exists');
  // A missing song is asked for once per session, not on every visit.
  const asked = served.ch2_tower;
  await go('ashen_road'); await page.waitForTimeout(300); await go('shinar_camp'); await page.waitForTimeout(600);
  assert.equal(served.ch2_tower, asked, 'missing songs are remembered');

  // Sung songs off: Chapter VII starts on its instrumental.
  await page.evaluate(() => { const { settings } = window.__remnant; settings.vocals = false; });
  await go('thaw_outpost');
  await until(() => window.__remnant.songs.player.playing === 'ch7_hunt_inst');
  // Back on: the place's vocal plays (it has not been heard yet).
  await page.evaluate(() => { const { settings, songs } = window.__remnant; settings.vocals = true; songs.player.refresh(); });
  await until(() => window.__remnant.songs.player.playing === 'ch7_hunt');
  // Score only: no song anywhere, the score plays.
  await page.evaluate(() => { const { settings, songs } = window.__remnant; settings.soundtrack = 'score'; songs.player.refresh(); });
  await until(() => !window.__remnant.songs.player.playing && !window.__remnant.music.holding);
  await page.evaluate(() => { window.__remnant.settings.soundtrack = 'songs'; });

  // The settings rows.
  await page.evaluate(() => { const { G } = window.__remnant; G.inCutscene = false; for (const l of document.querySelectorAll('.layer')) l.remove(); G.ui.openMenu('settings'); });
  await page.locator('[data-k=soundtrackscore]').click();
  assert.equal(await page.evaluate(() => window.__remnant.settings.soundtrack), 'score');
  assert.equal(await page.locator('[data-k=vocalson]').count(), 0, 'Sung songs hides with Score only');
  await page.locator('[data-k=soundtracksongs]').click();
  await page.locator('[data-k=vocalsoff]').click();
  assert.equal(await page.evaluate(() => window.__remnant.settings.vocals), false);
  await page.locator('[data-k=vocalson]').click();
  await page.keyboard.press('Escape');
  console.log('Vocal once then instrumental, shared songs carry on, score held and handed back, ducking, missing songs, Sung songs and Score only passed');

  // Offline: songs go in their own cache, which a game update leaves alone.
  await page.evaluate(() => navigator.serviceWorker.ready);
  let controlled = false;
  for (let i = 0; i < 3 && !controlled; i++) {
    await page.reload();
    await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
    controlled = await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).then(() => true, () => false);
  }
  assert.ok(controlled, 'the service worker controls the page');
  const cached = await page.evaluate(async () => {
    await fetch('music/ch1_hearthward.mp3').then(r => r.blob());
    await fetch('music/ch2_tower.mp3');
    const c = await caches.open('remnant-music');
    return (await c.keys()).map(r => new URL(r.url).pathname.split('/').pop());
  });
  assert.ok(cached.includes('ch1_hearthward.mp3'), `song cached: ${cached}`);
  assert.ok(!cached.includes('ch2_tower.mp3'), 'a missing song is not cached');
  assert.deepEqual(errors, []);
  console.log('Songs are kept offline in their own cache; soundtrack: all checks passed');
} finally {
  await browser.close(); server.close();
}
