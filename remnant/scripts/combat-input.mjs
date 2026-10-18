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
async function boot(context) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = true; s.flags.relic_taken = true; s.flags.phantom = true;
    s.level = 50; s.skillPoints = 9; s.abilities = ['sword_word', 'trumpet'];
    s.equippedSkills = ['sword_word', 'trumpet', null];
    delete s.equippedSuper; delete s.echoImprints;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  return page;
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    const page = await boot(context);
    await page.evaluate(() => {
      const { G } = window.__remnant, W = G.world;
      G.paused = true; G.inCutscene = false;
      W.load('trial_arena', 'start'); W.story.ch3.rounds.stop(false);
      W.ents = []; W.echoes = []; W.boss = null; W.bossActive = false;
    });
    async function buffer(key, field, extraAttack = false) {
      await page.evaluate(() => {
        const { G } = window.__remnant, W = G.world, p = W.player;
        G.paused = true; G.inCutscene = false;
        p.state = 'free'; p.atk = null; p.x = 210; p.y = 288; p.face = 1;
        p.body.vx = p.body.vy = 0; p.body.onGround = true;
        p.invuln = 999; p.mantleT = p.lion = 0; p.weaponFlight = null;
        p.queued = null; p.queuedT = p.dodgeBuf = p.parryBuf = p.jumpBuf = p.heavyQ = 0;
        p.parryCd = p.counterT = p.phantomN = 0; p.lastFoe = null; p.airDash = 1;
        p.combo = 0; p.startAttack(p.moves.combo[0]);
        p.atkT = Math.max(0, p.atk.cancel - 0.12) * p.atk.dur / p.aspd();
        W.hitstopT = 2; W.slowT = 0;
        G.paused = false;
      });
      if (extraAttack) await page.keyboard.press('j');
      await page.keyboard.press(key);
      await page.waitForFunction(f => {
        const p = window.__remnant.G.world.player;
        return f === 'queued' ? p.queued === 'attack' : p[f] > 0;
      }, field);
      const result = await page.evaluate(() => {
        const { G } = window.__remnant, W = G.world, p = W.player;
        G.paused = true;
        return { state: p.state, frozen: W.hitstopT > 0, queued: p.queued, dodge: p.dodgeBuf, parry: p.parryBuf };
      });
      assert.equal(result.state, 'attack'); assert.ok(result.frozen);
      return result;
    }
    for (const [key, field, expected] of [['j', 'queued', 'attack'], ['Shift', 'dodgeBuf', 'dodge'], ['i', 'parryBuf', 'parry'], ['Space', 'jumpBuf', 'free']]) {
      await buffer(key, field, field === 'dodgeBuf' || field === 'parryBuf');
      const result = await page.evaluate(field => {
        const { G } = window.__remnant, W = G.world, p = W.player;
        W.hitstopT = 0;
        const old = p.atk.id;
        p.update(1 / 120);
        const noEarlyCancel = p.state === 'attack' && p.atk.id === old;
        for (let n = 0; n < 24 && p.state === 'attack' && p.atk?.id === old; n++) p.update(1 / 120);
        const state = p.state, next = p.atk?.id;
        const defenseConsumed = p.dodgeBuf === 0 && p.parryBuf === 0 && p.queued === null;
        const jumped = field !== 'jumpBuf' || (p.update(1 / 120), p.body.vy < 0);
        return { noEarlyCancel, state, next, old, defenseConsumed, jumped };
      }, field);
      assert.ok(result.noEarlyCancel, field + ' bypassed recovery');
      assert.equal(result.state, expected, field);
      if (field === 'queued') assert.notEqual(result.next, result.old);
      if (field === 'dodgeBuf' || field === 'parryBuf') assert.ok(result.defenseConsumed, field + ' replayed');
      assert.ok(result.jumped);
    }
    await buffer('Shift', 'dodgeBuf');
    const limits = await page.evaluate(() => {
      const { G } = window.__remnant, W = G.world, p = W.player;
      W.hitstopT = 0;
      p.body.onGround = false; p.y = 160; p.airDash = 0;
      p.atkT = p.atk.cancel * p.atk.dur / p.aspd();
      p.update(1 / 120); const noFreeDash = p.state === 'attack' && p.airDash === 0;
      p.dodgeBuf = 0.01; p.atkT = 0;
      p.update(0.02); const expired = p.dodgeBuf === 0 && p.state === 'attack';
      p.parryBuf = 0.18; p.parryCd = 0.3; p.atkT = p.atk.cancel * p.atk.dur / p.aspd();
      p.update(1 / 120); const cooldown = p.state === 'attack' && p.parryCd > 0;
      p.state = 'free'; p.parryBuf = 0; p.dodgeBuf = 0; p.atk = null;
      return { noFreeDash, expired, cooldown };
    });
    for (const [key, ok] of Object.entries(limits)) assert.ok(ok, key);
    // Keep the character and target anchors in a real rendered busy combat frame.
    await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world, p = W.player;
      p.x = 210; p.y = 288; p.body.onGround = true;
      const foe = a.spawn('brute', 250, 288); foe.hp = foe.maxHp = 1e7;
      p.lastFoe = foe; p.comboHits = 12; p.comboT = 2;
      p.startAttack(p.moves.combo[1]); p.atkT = p.atk.dur * 0.4 / p.aspd();
      for (const species of ['sentinel', 'knight', 'husk', 'archer']) a.echo(species);
      G.camera.snapTo(p.x, p.y - 30);
    });
    await page.screenshot({ path: 'qa/combat-focus-' + (mobile ? 'phone' : 'desktop') + '.png' });
    console.log((mobile ? 'Phone' : 'Desktop') + ': real key presses survive hitstop; combo, dodge, parry and jump buffers; legal cancel windows, defense priority, air-dash limit and parry cooldown passed');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
