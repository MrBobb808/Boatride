// Scratch: screenshots of Remnant's Rest at each tier (not part of CI).
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const dist = resolve('dist'), out = process.env.OUT ?? 'qa';
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try { const file = resolve(dist, path); res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript' })[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const tiers = (process.env.TIERS ?? '0,4').split(',').map(Number), xs = (process.env.XS ?? '12,40,70,92,112').split(',').map(Number);
const vw = Number(process.env.VW ?? 956), vh = Number(process.env.VH ?? 440), art = process.env.ART ?? 'pixel';
const page = await (await browser.newContext({ viewport: { width: vw, height: vh } })).newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.addInitScript((art) => { try { const k = 'remnant-settings-v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.artStyle = art; localStorage.setItem(k, JSON.stringify(s)); } catch {} }, art);
await page.goto(base + '?debug&autostart');
await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
const F = [['ending_done','ch1_done','tobiah_saved'], ['ch2_done'], ['ch3_done','ch4_done','captives_freed','ch4_image_done'], ['ch5_done','ch6_done','ch5_writing','ch6_storm_done'], ['ch7_done','ch8_done','ch9_done','ch7_rescued','ch8_rescued','ch9_rescued']];
for (const t of tiers) {
  await page.evaluate(({ t, F }) => { const { G } = window.__remnant; G.ui.dialogue = async () => 0; G.save.flags.intro_done = G.save.flags.relic_taken = true; for (let i = 0; i <= t; i++) for (const f of F[i]) G.save.flags[f] = true; G.save.settlement = { seen: t, quests: {}, titles: [], told: true }; G.world.load('remnant_rest', 'altar'); }, { t, F });
  for (const x of xs) {
    await page.evaluate((x) => { const { G } = window.__remnant, p = G.world.player; p.x = x * 16; p.y = 16 * (x < 62 ? 22 : x < 98 ? 20 : 18); p.body.vx = 0; G.camera.snapTo(p.x, p.y - 40); }, x);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/rest-t${t}-x${x}-${art}-${vw}.png` });
  }
}
console.log('tier', await page.evaluate(() => window.__remnant.G.world.story.rest.tier()));
await browser.close(); server.close();
