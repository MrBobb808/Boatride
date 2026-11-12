// The first screen's script stays small (NEXT_PLAN A3): the home screen loads Phaser, Boot and Title; the journey,
// the Horde and the Watch come in their own chunks. Run after `npm run build`.
// `node scripts/first-screen.mjs --measure` also times the home screen on a throttled 4G profile (not run in CI).
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Phaser alone is about 1.37 MB minified; the game's own share of the first chunk is held under about 1 MB.
const BUDGET = 2_450_000;
const dist = resolve('dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<(?:script[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="([^"]+\.js)"/g)].map((m) => m[1].replace(/^.*?assets\//, 'assets/'));
let bytes = 0;
for (const s of new Set(scripts)) bytes += (await stat(resolve(dist, s))).size;
const lazy = (await readdir(resolve(dist, 'assets'))).filter((f) => /^(World|Horde|Watch|Hud)-.*\.js$/.test(f));
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
console.log(`first screen script: ${(bytes / 1e6).toFixed(2)} MB in ${new Set(scripts).size} file(s); lazy scene chunks: ${lazy.length}`);
if (!scripts.length) fail('no entry script found in index.html');
if (bytes > BUDGET) fail(`the first screen's script is ${bytes} bytes, over the ${BUDGET} budget: load the new code on demand (src/game/scenes.ts)`);
if (lazy.length < 4) fail(`World, Hud, Horde and Watch must each be their own chunk, found ${lazy.join(', ') || 'none'}`);

if (process.argv.includes('--measure')) {
  const { chromium } = await import('playwright');
  const { serve } = await import('./serve.mjs');
  const { base, close } = await serve();
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // Chrome DevTools' "Fast 4G": 9 Mbit/s down, 1.5 up, 60 ms.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
  const t0 = Date.now();
  await page.goto(base + '?fresh', { waitUntil: 'commit' });
  const paint = await page.evaluate(() => new Promise((r) => { const e = performance.getEntriesByName('first-contentful-paint')[0]; if (e) r(e.startTime); else new PerformanceObserver((l) => r(l.getEntries()[0].startTime)).observe({ type: 'paint', buffered: true }); }));
  await page.waitForSelector('[data-k^="title_"]', { timeout: 120000 });
  console.log(`throttled 4G: first paint ${Math.round(paint)} ms, home screen ${Date.now() - t0} ms`);
  await browser.close(); close();
}
console.log('first-screen OK');
