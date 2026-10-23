// Music and sound, portraits, the cinematic toolkit and the "Previously…" recap,
// driven in headless Chromium through the ?debug API.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
const dist = resolve('dist'), errors = [];
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try {
    const file = resolve(dist, path); if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });

// Every speaker in the shipped dialogue: literal who: '…' lines, the NPC kinds that talk
// through fallenStory, and the Fallen Crowns, who speak under their own names.
const speakers = new Set(['barak', 'ezra', 'talia', 'hanan', 'dov', 'ilan']);
for (const dir of ['src/game', 'src/ui']) for (const f of await readdir(dir)) {
  if (!f.endsWith('.ts')) continue;
  const src = await readFile(join(dir, f), 'utf8');
  for (const m of src.matchAll(/who: ?'([a-z_]+)'/g)) speakers.add(m[1]);
  if (f === 'fallenChapters.ts') for (const m of src.matchAll(/ name:'([^']+)', boss:/g)) speakers.add(m[1]);
}
speakers.delete('narrator');

async function boot(context, { updatedAgo = 0 } = {}) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = true;
    s.level = 60;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  // Leaving the first page saves (and stamps the slot fresh), so age it afterwards.
  await page.evaluate((ago) => { const s = JSON.parse(localStorage.getItem('remnant-save-2')); s.updated = Date.now() - ago; localStorage.setItem('remnant-save-2', JSON.stringify(s)); }, updatedAgo);
  return page;
}
/** Load slot 2, optionally aged first in the same tick so nothing can re-save it in between. */
const load = async (page, ago = 0) => {
  await page.evaluate((ago) => {
    if (ago) { const s = JSON.parse(localStorage.getItem('remnant-save-2')); s.updated = Date.now() - ago; localStorage.setItem('remnant-save-2', JSON.stringify(s)); }
    window.__remnant.load(2);
  }, ago);
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
};

try {
  const context = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await boot(context);
  await load(page);
  await page.touchscreen.tap(480, 200);
  await page.waitForFunction(() => window.__remnant.audio.ctx?.state === 'running');

  // ---- music: keys, per-room themes, every arrangement runs in every phase.
  const music = await page.evaluate(() => {
    const { G, music, tracks, audio } = window.__remnant, W = G.world;
    // Skip the chapter openings: this checks the score, not the cutscenes.
    for (const n of [7, 8, 9, 10]) G.save.flags[`ch${n}_intro`] = true;
    const keys = ['hunt', 'plague', 'cinders', 'grecia', 'grecia_boss', 'beast_monarch', 'plague_monarch', 'cinder_monarch'];
    const missing = keys.filter(k => !tracks[k]);
    const rooms = {};
    for (const [room, key] of [['thaw_outpost', 'hunt'], ['lantern_quarantine', 'plague'], ['ashwatch_refuge', 'cinders'], ['chittim_harbor', 'grecia']]) {
      W.load(room, 'left'); G.inCutscene = false; rooms[room] = music.name === key;
    }
    // Run each arrangement through four bars in each phase on a silent bus.
    const sink = audio.ctx.createGain(); sink.gain.value = 0;
    const thrown = [], saved = music.phase;
    for (const [name, def] of Object.entries(tracks)) for (let ph = 0; ph < 4; ph++) {
      music.phase = ph;
      try { for (let s = 0; s < 64; s++) def.gen(music, sink, s, audio.ctx.currentTime + 5, 0.8); } catch (e) { thrown.push(name + ':' + e.message); }
    }
    music.phase = saved;
    const tempo = ['beast_monarch', 'plague_monarch', 'cinder_monarch', 'grecia_boss'].every(k => tracks[k].phaseBpm?.length === 3 && tracks[k].phaseBpm[2] > tracks[k].phaseBpm[0]);
    return { missing, rooms, thrown, tempo };
  });
  assert.deepEqual(music.missing, []);
  assert.ok(Object.values(music.rooms).every(Boolean), JSON.stringify(music.rooms));
  assert.deepEqual(music.thrown, []);
  assert.ok(music.tempo, 'boss tracks quicken by phase');

  // ---- boss phases drive the score through music.bossPhase (spied).
  const phases = await page.evaluate(() => {
    const { G, music } = window.__remnant, W = G.world, out = {};
    const calls = [], real = music.bossPhase.bind(music);
    music.bossPhase = (n) => { calls.push(n); real(n); };
    const h = (p) => ({ dmg: 1e9, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'ability', src: p, dot: true });
    for (const [room, track] of [['hunt_throne', 'beast_monarch'], ['plague_throne', 'plague_monarch'], ['cinder_throne', 'cinder_monarch']]) {
      calls.length = 0;
      W.load(room, 'left'); G.inCutscene = false;
      const b = W.boss, p = W.player, before = music.phaseChanges;
      b.awaken(); b.update(1.8);
      const playing = music.name === track && music.phase === 0;
      p.state = 'free'; p.invuln = 999;
      b.takeHit(h(p)); b.update(1.7);
      const mid = music.phase;
      b.takeHit(h(p)); b.update(1.7);
      out[room] = { playing, mid, end: music.phase, calls: [...calls], heard: music.phaseChanges - before };
    }
    music.bossPhase = real;
    return out;
  });
  for (const [room, r] of Object.entries(phases)) {
    assert.ok(r.playing, room + ' boss track starts at phase 0');
    assert.deepEqual([r.mid, r.end], [1, 2], room + ' ' + JSON.stringify(r));
    assert.deepEqual(r.calls, [1, 2], room + ' bossPhase calls');
    assert.equal(r.heard, 2, room + ' stingers');
  }

  // ---- sound effects: the new impacts play; a mass hit is capped, the player's cues are not.
  const sounds = await page.evaluate(async () => {
    const { audio, sfxDefs } = window.__remnant;
    const fresh = ['parry', 'parryPerfect', 'finisherThud', 'shieldBreak', 'armorClank', 'swarmBuzz', 'waveWhoosh'];
    const thrown = [];
    for (const n of fresh) try { sfxDefs[n](audio, audio.ctx.currentTime + 0.01, 0.5, 1, 0); } catch (e) { thrown.push(n + ':' + e.message); }
    await new Promise(r => setTimeout(r, 200));
    const p0 = audio.stats.played, d0 = audio.stats.dropped;
    const names = Object.keys(sfxDefs).filter(n => !['parry', 'parryPerfect', 'finisherThud', 'shieldBreak', 'execute', 'finisher', 'hurt', 'death', 'levelup'].includes(n) && !n.startsWith('ui'));
    const t0 = performance.now();
    for (let i = 0; i < 80; i++) audio.play(names[i % names.length], { vol: 0.2 });
    // The budget is per 90 ms window; a slow machine may spread the burst over a few.
    const windows = Math.ceil((performance.now() - t0 + 1) / 90);
    const burstPlayed = audio.stats.played - p0, dropped = audio.stats.dropped - d0;
    const p1 = audio.stats.played;
    audio.play('parryPerfect', { vol: 0.2 });
    const priority = audio.stats.played - p1;
    await new Promise(r => setTimeout(r, 150));
    const p2 = audio.stats.played;
    audio.play('hit', { vol: 0.2 });
    return { thrown, burstPlayed, dropped, priority, recovered: audio.stats.played - p2, cap: 14 * windows };
  });
  assert.deepEqual(sounds.thrown, []);
  assert.ok(sounds.burstPlayed <= sounds.cap && sounds.dropped >= 80 - sounds.cap, JSON.stringify(sounds));
  assert.equal(sounds.priority, 1, 'perfect parry is never dropped');
  assert.equal(sounds.recovered, 1, 'the budget refills');

  // ---- portraits for every speaker, in both art styles.
  const portraits = await page.evaluate(async (list) => {
    const { portraits, settings } = window.__remnant, out = { missing: [], blank: [] };
    const c = document.createElement('canvas'); c.width = c.height = 152;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    for (const style of ['pixel', 'smooth']) {
      settings.artStyle = style;
      for (const who of list) {
        if (!portraits.has(who)) { out.missing.push(who); continue; }
        for (const mood of ['neutral', 'surprised', 'menace']) portraits.draw(c, who, 1.3, mood, true);
        const d = ctx.getImageData(0, 0, 152, 152).data;
        let lo = 765, hi = 0;
        for (let i = 0; i < d.length; i += 4 * 37) { const v = d[i] + d[i + 1] + d[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        if (hi - lo < 120) out.blank.push(style + ':' + who);
      }
    }
    settings.artStyle = 'pixel';
    return out;
  }, [...speakers]);
  assert.deepEqual(portraits, { missing: [], blank: [] }, JSON.stringify(portraits));
  assert.ok(speakers.size >= 20, 'speaker list found: ' + speakers.size);

  // A real dialogue at phone size, in each style, for the eyes.
  for (const style of ['pixel', 'smooth']) {
    await page.evaluate((style) => {
      const { G, settings } = window.__remnant; settings.artStyle = style; G.world.load('thaw_outpost', 'altar'); G.inCutscene = false;
      void G.ui.dialogue([{ who: 'mara', text: 'Varkhos drives the northern villages into his hunting grounds. Bring them home, Elior.' }, { who: 'Varkhos', text: 'Prey that stands its ground makes a better chase.' }]);
    }, style);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `qa/dialogue-portrait-${style}-phone.png` });
    assert.ok(await page.locator('.dialogue canvas').isVisible());
    await page.touchscreen.tap(480, 200); await page.waitForTimeout(1900);
    await page.screenshot({ path: `qa/dialogue-boss-${style}-phone.png` });
    // Finish the line, then close the box (a tap first completes any typing).
    for (let i = 0; i < 12 && await page.locator('.dialogue').count(); i++) { await page.touchscreen.tap(480, 200); await page.waitForTimeout(350); }
    assert.equal(await page.locator('.dialogue').count(), 0);
  }

  // ---- the cinematic toolkit: a full sequence, then an abandoned one; both restore everything.
  const cine = await page.evaluate(async () => {
    const { G, cinema } = window.__remnant, W = G.world, p = W.player, cam = G.camera;
    W.load('thaw_outpost', 'altar'); G.inCutscene = false; G.ui.cinematicBars(false);
    const before = cinema.completed;
    const seen = {};
    const ok = await cinema.run(async (k) => {
      k.bars(true);
      await k.pan(p.x + 150, p.y - 60, 0.6);
      seen.focus = !!cam.focus && Math.abs(cam.x - (p.x + 150)) < 40;
      seen.cut = G.inCutscene;
      await k.zoom(0.8, 0.3);
      seen.zoom = cam.viewMultTarget === 0.8;
      const slow = k.slowmo(0.4, 0.3); seen.slow = W.slowScale === 0.4; await slow;
      const card = k.title('TEST TITLE', 'A subtitle', 0.4); seen.title = document.querySelector('.title-card .t-title')?.textContent; await card;
      await k.fade(1, 0.2);
    });
    await new Promise(r => setTimeout(r, 1000));
    const after = { ok, focus: cam.focus, view: cam.viewMultTarget, cut: G.inCutscene, bars: document.getElementById('app').classList.contains('on'), slow: W.slowScale, card: !!document.querySelector('.title-card:not(.out)'), fade: getComputedStyle(document.getElementById('fade')).opacity, done: cinema.completed - before };
    let live = true;
    setTimeout(() => { live = false; }, 300);
    const t0 = performance.now();
    const abandoned = await cinema.run(async (k) => { k.bars(true); await k.pan(p.x - 200, p.y, 3); await k.title('NEVER', '', 3); }, () => live);
    return { seen, after, abandoned, abandonMs: performance.now() - t0, restored: { focus: cam.focus, cut: G.inCutscene, card: !!document.querySelector('.title-card:not(.out)') } };
  });
  assert.deepEqual(cine.seen, { focus: true, cut: true, zoom: true, slow: true, title: 'TEST TITLE' });
  assert.deepEqual(cine.after, { ok: true, focus: null, view: 1, cut: false, bars: false, slow: 1, card: false, fade: '0', done: 1 });
  assert.equal(cine.abandoned, false);
  assert.ok(cine.abandonMs < 1000, 'an abandoned scene stops at once');
  assert.deepEqual(cine.restored, { focus: null, cut: false, card: false });

  // ---- a staged boss entrance through the real trigger (Varkhos).
  await page.evaluate(() => {
    const { G } = window.__remnant, s = G.save;
    Object.assign(s.flags, { ch6_done: true, ch7_intro: true, hunt_fang_warden: true, hunt_redmaw_alpha: true });
    G.ui.dialogue = async () => 0;
    G.world.load('hunt_throne', 'left'); G.inCutscene = false;
    window.__titles = [];
    new MutationObserver(() => document.querySelectorAll('.title-card .t-title').forEach(t => window.__titles.includes(t.textContent) || window.__titles.push(t.textContent))).observe(document.getElementById('ui'), { childList: true, subtree: true });
    G.world.story.onTrigger('beast_monarch_start');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'qa/boss-entrance-pan-phone.png' });
  await page.waitForFunction(() => window.__remnant.G.world.boss.state === 'intro', null, { timeout: 20000 });
  const entrance = await page.evaluate(() => {
    const { G } = window.__remnant, b = G.world.boss; b.update(1.8);
    return { titles: window.__titles, fighting: b.fighting, focus: G.camera.focus, cut: G.inCutscene, music: window.__remnant.music.name };
  });
  assert.ok(entrance.titles.includes('VARKHOS'), JSON.stringify(entrance.titles));
  assert.deepEqual({ ...entrance, titles: 0 }, { titles: 0, fighting: true, focus: null, cut: false, music: 'beast_monarch' });
  await context.close();

  // ---- the recap: once after time away, skippable, never on a quick reload.
  const recap = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const rp = await boot(recap);
  await load(rp, 2 * 3600 * 1000);
  await rp.waitForSelector('.recap', { timeout: 5000 });
  const card = await rp.evaluate(() => ({ text: document.querySelector('.recap').innerText, held: window.__remnant.G.ui.isBlocking() }));
  assert.match(card.text, /Previously/i);
  assert.match(card.text, /Chapter I\b/i);
  assert.match(card.text, /The Ashen Village/);
  assert.ok(card.held, 'the recap holds the game still');
  await rp.screenshot({ path: 'qa/recap-phone.png' });
  await rp.locator('[data-k=recap_skip]').tap();
  await rp.waitForFunction(() => !document.querySelector('.recap') && !window.__remnant.G.ui.isBlocking());
  await load(rp); await rp.waitForTimeout(1200);
  assert.equal(await rp.locator('.recap').count(), 0, 'no second recap without another absence');
  // Twenty minutes away: shown on a fresh launch only, and dismissed by any game button.
  await load(rp, 20 * 60 * 1000); await rp.waitForTimeout(1200);
  assert.equal(await rp.locator('.recap').count(), 0, 'a short absence mid-session is not recapped');
  await rp.reload(); await rp.waitForFunction(() => !!window.__remnant);
  await load(rp, 20 * 60 * 1000);
  await rp.waitForSelector('.recap', { timeout: 5000 });
  await rp.keyboard.press('KeyJ');
  await rp.waitForFunction(() => !document.querySelector('.recap'));
  await recap.close();

  assert.deepEqual(errors, []);
  console.log(`Audio and cinema OK: ${Object.keys(phases).length} bosses x 2 phase changes, ${speakers.size} speakers with portraits, burst capped at ${sounds.burstPlayed}/80, cinema restored, recap once.`);
} finally {
  await browser.close();
  server.close();
}
