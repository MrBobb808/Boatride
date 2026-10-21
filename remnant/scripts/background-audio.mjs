import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
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
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    // Chromium cannot run Spotify/iOS. Observe requested session policy around real
    // Web Audio startup, settings changes, gestures and a background/foreground cycle.
    await context.addInitScript(() => {
      if (!localStorage.getItem('remnant-settings-v1')) localStorage.setItem('remnant-settings-v1', JSON.stringify({ v: 3, respectSilent: false, music: 0.35, sfx: 0.75, master: 0.8 }));
      const stats = window.__audio = { trace: [], contexts: [], kicks: 0 };
      let type = 'auto';
      const session = { get type() { return type; }, set type(v) { type = v; stats.trace.push(v); } };
      Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(opts) { stats.trace.push('construct:' + type); super(opts); stats.contexts.push(this); }
        createBufferSource() { const s = super.createBufferSource(), start = s.start.bind(s); s.start = (...args) => { if (s.buffer?.length === 1) stats.kicks++; return start(...args); }; return s; }
        resume() { stats.trace.push('resume:' + type); return super.resume(); }
      };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?debug&autostart');
    await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
    await page.evaluate(() => {
      const s = window.__remnant.G.save; s.flags.intro_done = s.flags.relic_taken = true;
      localStorage.setItem('remnant-save-2', JSON.stringify(s));
    });
    await page.goto(base + '?debug'); await page.waitForFunction(() => !!window.__remnant);
    await page.evaluate(() => window.__remnant.load(2));
    await page.waitForFunction(() => window.__remnant.G.world.player.style);
    // First real gesture must already use mixing, even with the old exclusive setting.
    if (mobile) await page.touchscreen.tap(440, 180); else await page.mouse.click(440, 180);
    await page.waitForFunction(() => window.__audio.contexts[0]?.state === 'running');
    assert.deepEqual(await page.evaluate(() => ({ constructed: window.__audio.trace.filter(t => t.startsWith('construct:')), playback: window.__audio.trace.includes('playback') })), { constructed: ['construct:ambient'], playback: false });
    assert.deepEqual(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('remnant-settings-v1')); return { mix: s.mixAudio, music: s.music, sfx: s.sfx, v: s.v }; }), { mix: true, music: 0.35, sfx: 0.75, v: 4 });
    await page.evaluate(() => { const { G } = window.__remnant; G.inCutscene = false; G.ui.openMenu('settings'); });
    const on = page.locator('[data-k=mix_audioon]'), off = page.locator('[data-k=mix_audiooff]');
    await on.scrollIntoViewIfNeeded(); assert.ok((await on.getAttribute('class')).includes('on'));
    assert.equal(await page.locator('[data-k=rson]').count(), 0, 'Do not offer a Silent Mode override while mixing');
    const kicks = await page.evaluate(() => window.__audio.kicks);
    await on.click(); await on.click();
    assert.equal(await page.evaluate(() => window.__audio.kicks), kicks, 'Normal taps should not restart the audio output');
    await off.click(); assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback');
    await page.locator('[data-k=rson]').click(); assert.equal(await page.evaluate(() => navigator.audioSession.type), 'ambient');
    await page.locator('[data-k=rsoff]').click(); assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback');
    await page.reload(); await page.waitForFunction(() => !!window.__remnant);
    await page.evaluate(() => window.__remnant.load(2));
    await page.waitForFunction(() => window.__remnant.G.world.player.style);
    if (mobile) await page.touchscreen.tap(440, 180); else await page.mouse.click(440, 180);
    await page.evaluate(() => { const { G } = window.__remnant; G.inCutscene = false; G.ui.openMenu('settings'); });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('remnant-settings-v1')).mixAudio), false);
    await on.click(); assert.equal(await page.evaluate(() => navigator.audioSession.type), 'ambient');
    const volume = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
    await page.locator('[data-k=vmu]').evaluate(volume, '0');
    await page.locator('[data-k=vs]').evaluate(volume, '0.55');
    assert.deepEqual(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('remnant-settings-v1')); return { mix: s.mixAudio, music: s.music, sfx: s.sfx }; }), { mix: true, music: 0, sfx: 0.55 });
    // Model the visibility transition; verify the real engine resumes with ambient policy.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => window.__audio.contexts[0].state === 'suspended');
    await page.evaluate(() => {
      navigator.audioSession.type = 'playback'; window.__audio.trace.length = 0;
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => window.__audio.contexts[0].state === 'running');
    assert.deepEqual(await page.evaluate(() => window.__audio.trace.slice(0, 2)), ['ambient', 'resume:ambient']);
    await on.scrollIntoViewIfNeeded(); await page.screenshot({ path: `qa/background-audio-${mobile ? 'phone' : 'desktop'}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'Phone layout' : 'Desktop'}: legacy migration, first-gesture mixing, saved toggle, silent-switch policy, independent volumes and foreground resume passed`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
