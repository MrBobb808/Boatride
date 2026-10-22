import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const OUT = process.env.OUT, dist = resolve('dist'), errors = [];
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try { const file = resolve(dist, path); res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png' })[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const art = process.env.ART || 'pixel', phone = !!process.env.PHONE;
const ctx = await browser.newContext(phone ? { viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(a => localStorage.setItem('remnant-settings-v1', JSON.stringify({ artStyle: a })), art);
await page.goto(base + '?debug&autostart');
await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
await page.evaluate(() => {
  const { G } = window.__remnant, W = G.world, s = G.save;
  s.flags.ch10_done = s.flags.ch9_done = true; s.level = 120;
  W.load('trial_arena', 'start'); const R = W.story.ch3.rounds; R.start(10, true); R.beginRound();
  G.paused = true; W.player.invuln = 1e9;
  for (let i = 0; i < 600 && W.boss.state === 'intro'; i++) W.update(1 / 120);
  window.B = W.boss;
});
const shots = (process.env.SHOTS || 'idle').split(',');
for (const name of shots) {
  await page.evaluate((name) => {
    const { G } = window.__remnant, W = G.world, b = window.B, p = W.player;
    const step = (n) => { for (let i = 0; i < n; i++) { W.update(1 / 120); p.invuln = 1e9; } };
    b.state = 'idle'; b.atk = null; b.cd = 99; b.air = 0; b.x = 560; p.x = 470; p.y = b.floorY; p.face = 1;
    const [atk, t] = name.split(':');
    if (atk === 'p3') { b.horn = 2; b.four = 1; b.phase = 3; }
    else if (atk !== 'idle') { b.start(atk); step(Math.round(+t * 120)); }
    step(atk === 'idle' || atk === 'p3' ? 60 : 1);
    G.camera.snapTo(b.x - 40, b.floorY - 80);
  }, name);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${art}${phone ? '-phone' : ''}-${name.replace(/[:.]/g, '_')}.png` });
}
console.log(JSON.stringify(errors));
await browser.close(); server.close();
