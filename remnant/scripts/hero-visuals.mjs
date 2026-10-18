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
    const file = resolve(dist, path);
    if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });
try {
 const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
 const page = await desktop.newPage();
 page.on('pageerror', e => errors.push(e.message));
 await page.goto(base + '?debug');
 await page.locator('.art-release').waitFor();
 await page.locator('#boot').waitFor({ state: 'detached' });
 assert.equal(await page.locator('.art-release').textContent(), 'THE REMNANT AWAKENS');
 await page.screenshot({ path: 'qa/title-hero-desktop.png' });
 await page.goto(base + '?debug&autostart');
 await page.waitForFunction(() => window.__remnant?.G.world?.player?.style && window.__remnant.hero().ready);
 const result = await page.evaluate(() => {
   const { G } = window.__remnant, p = G.world.player;
   G.paused = true; G.inCutscene = false; G.time = 0;
   G.save.level = 1; p.styleKey = ''; p.refreshLook();
   p.x = 48; p.y = 76; p.state = 'free'; p.face = p.drawnFace = 1; p.turnAt = -10;
   p.body.onGround = true; p.body.vx = p.body.vy = 0; p.invuln = p.flash = p.aura = p.armorLight = p.lion = 0;
   p.ghosts = []; p.trail = []; p.atk = null; p.weaponFlight = null;
   p.anim.play('idle', 0, true); p.animate(0); p.pose.rot = 0;
   const render = (helm, mantle = 0) => {
     const c = document.createElement('canvas'); c.width = c.height = 96;
     p.style.helm = helm; p.mantleT = mantle; p.draw(c.getContext('2d'));
     return c;
   };
   const sameFace = [];
   for (const mantle of [0, 20]) {
     const expected = render('none', mantle).getContext('2d').getImageData(54, 33, 10, 10).data;
     for (const helm of ['cap', 'visor', 'crown']) {
       const got = render(helm, mantle).getContext('2d').getImageData(54, 33, 10, 10).data;
       sameFace.push({ helm, mantle, intact: expected.every((v, i) => v === got[i]) });
     }
   }
   const stableEvades = [];
   for (const state of ['dodge', 'airdash']) {
     p.state = state; p.st = 0.2; p.pose.rot = 0;
     const expected = render('none', 0).getContext('2d').getImageData(0, 0, 96, 96).data;
     p.pose.rot = Math.PI;
     const got = render('none', 0).getContext('2d').getImageData(0, 0, 96, 96).data;
     stableEvades.push(expected.every((v, i) => v === got[i]));
   }
   // Scripted walking uses the same stride progression as player-controlled movement.
   G.world.grid.set(2, 5, 1); G.world.grid.set(3, 5, 1);
   p.x = 48; p.y = 80; p.state = 'scripted'; p.spriteStride = 0;
   p.scriptX = 108; p.scriptSpeed = 60;
   for (let i = 0; i < 10; i++) p.update(1 / 120);
   const scriptedStride = p.spriteStride > 0;
   p.scriptX = null; p.x = 48; p.y = 76;
   const cases = [
     ['Uncovered', 'free', 'idle', 'none', 0], ['Open cap', 'free', 'idle', 'cap', 0], ['Open visor', 'free', 'idle', 'visor', 0], ['Crown', 'free', 'idle', 'crown', 0],
     ...[0,1,2,3].map(n => ['Run '+(n+1), 'free', 'run', 'visor', 0, n]),
     ['Charge', 'charge', 'charge', 'visor', 0], ['Strike', 'attack', p.moves.combo[0].clip, 'visor', 0], ['Dodge', 'dodge', 'roll', 'visor', 0], ['Air dash', 'airdash', 'airdash', 'visor', 0],
     ['Jump', 'free', 'jump', 'none', 0], ['Fall', 'free', 'fall', 'none', 0], ['Hurt', 'hurt', 'hurt', 'none', 0], ['Cast', 'cast', 'cast', 'none', 0],
     ['Mantle', 'free', 'idle', 'none', 20], ['Mantle cap', 'free', 'idle', 'cap', 20], ['Mantle visor', 'free', 'idle', 'visor', 20], ['Mantle crown', 'free', 'idle', 'crown', 20],
   ];
   const board = document.createElement('canvas'); board.width = 880; board.height = 950;
   const c = board.getContext('2d'); c.fillStyle = '#17131e'; c.fillRect(0,0,880,950);
   for (let i = 0; i < cases.length; i++) {
     const [label, state, clip, helm, mantle, stride = 0] = cases[i];
     p.state = state; p.st = 0.2; p.body.vx = i >= 4 && i < 8 ? 140 : 0;
     p.spriteStride = stride; p.body.onGround = i !== 12 && i !== 13; p.body.vy = i === 12 ? -100 : i === 13 ? 100 : 0;
     p.anim.play(clip,0,true); p.anim.update(0.2); p.animate(0);
     p.atk = state === 'attack' ? p.moves.combo[0] : null;
     p.atkT = p.atk ? p.atk.dur / p.aspd() * 0.7 : 0;
     p.mantleT = mantle; p.style.helm = helm;
     p.style.plate = i >= 4 && i < 8 ? { c: '#6c6a70', dark: '#46444a', hi: '#b8b8c0', tier: 1 } : null;
     c.save(); c.translate(i%4*220+110,Math.floor(i/4)*190+160); c.scale(3,3); c.translate(-p.x,-p.y); p.draw(c); c.restore();
     c.fillStyle = '#edd79b'; c.font = '14px sans-serif'; c.fillText(label,i%4*220+12,Math.floor(i/4)*190+183);
   }
   board.id = 'hero-visual-board'; board.style.cssText = 'position:fixed;inset:0;z-index:99999;width:880px;height:950px'; document.body.append(board);
   return { sameFace, stableEvades, scriptedStride, identity: { skin: p.style.skin, hair: p.style.hair, beard: p.style.beard } };
 });
 assert.ok(result.scriptedStride, 'Scripted walking must advance the illustrated stride');
 assert.ok(result.stableEvades.every(Boolean), 'Tucked dodge/dash artwork must not receive a second rotation');
 for (const row of result.sameFace) assert.ok(row.intact, `Face changed under ${row.helm}, mantle ${row.mantle}`);
 assert.deepEqual(result.identity, { skin: '#70452f', hair: '#f1f3ed', beard: '#e9ede7' });
 await page.locator('#hero-visual-board').screenshot({ path: 'qa/hero-pose-contact-sheet.png' });
 await desktop.close();
 const phone = await browser.newContext({ viewport: { width: 874, height: 402 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
 const mobile = await phone.newPage(); mobile.on('pageerror', e => errors.push(e.message));
 await mobile.goto(base);
 await mobile.locator('.art-release').waitFor();
 await mobile.locator('#boot').waitFor({ state: 'detached' });
 const layout = await mobile.evaluate(() => ({ viewport: innerWidth, logo: document.querySelector('.logo').getBoundingClientRect().right, menu: document.querySelector('.title-menu').getBoundingClientRect().left, overflow: document.documentElement.scrollWidth > innerWidth }));
 assert.ok(layout.logo < layout.menu && !layout.overflow);
 await mobile.screenshot({ path: 'qa/title-hero-phone.png' });
 await phone.close(); assert.deepEqual(errors, []);
 console.log('New desktop/phone title art, uncovered eyes under all helmets and Mantle, identity colors, and 20 action/equipment previews passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
