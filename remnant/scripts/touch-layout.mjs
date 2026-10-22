// Touch controls on phone-sized screens: forgiving hit areas, multi-touch,
// the Customize controls editor (drag, resize, persist, reset, clamping to the
// screen and away from the Dynamic Island) and distinct haptic patterns on
// both the vibrate path and the iOS switch path.
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
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PATTERNS = { hit: [9], parry: [12, 50, 12], hurt: [30, 50, 30, 50, 30], kill: [18, 110, 45], phase: [50, 80, 50, 80, 50, 80, 120] };

// Spies on both haptic paths before the game loads.
const spy = () => {
  window.__vib = [];
  window.__ticks = [];
  navigator.vibrate = (p) => { window.__vib.push(Array.isArray(p) ? [...p] : [p]); return true; };
  document.addEventListener('click', (e) => { if (e.target instanceof HTMLLabelElement && e.target.htmlFor === 'haptic-switch') window.__ticks.push(performance.now()); }, true);
};

async function boot(context, query = '') {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart' + query);
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = true; s.flags.relic_taken = true;
    s.level = 50; s.abilities = ['sword_word', 'trumpet']; s.equippedSkills = ['sword_word', 'trumpet', null];
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  return reload(page, query);
}
async function reload(page, query = '') {
  await page.goto(base + '?debug' + query);
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  await arena(page);
  return page;
}
/** A quiet arena with the touch controls up. */
async function arena(page) {
  await page.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world;
    a.god();
    W.load('trial_arena', 'start'); W.story.ch3.rounds.stop(false);
    W.ents = []; W.echoes = []; W.boss = null; W.bossActive = false;
    G.inCutscene = false; G.paused = false;
    const p = W.player; p.x = 300; p.y = 288; p.invuln = 999; p.state = 'free'; p.body.onGround = true;
  });
  await page.touchscreen.tap(480, 60);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('touch')).display !== 'none' && !document.querySelector('#touch [data-ctl=jump]').classList.contains('hidden'));
}
const rects = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#touch .tc')].map(e => {
  const r = e.getBoundingClientRect();
  return [e.dataset.ctl, { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2, shown: !e.classList.contains('hidden') }];
})));
const isDown = (page, id) => page.evaluate(id => document.querySelector(`#touch [data-ctl=${id}]`).classList.contains('down'), id);
/** A point outside the drawn button, within its reach, that no other button is nearer to. */
function offCentre(all, id) {
  const b = all[id];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, d = b.r + Math.max(8, Math.min(18, b.r * 0.4));
    const x = b.cx + Math.cos(a) * d, y = b.cy + Math.sin(a) * d;
    let best = null, bd = Infinity;
    for (const [oid, o] of Object.entries(all)) {
      if (!o.shown) continue;
      const e = Math.hypot(x - o.cx, y - o.cy) - o.r;
      if (e < bd) { bd = e; best = oid; }
    }
    if (best === id && bd > 4 && bd < Math.max(12, Math.min(26, b.r * 0.6)) - 2) return { x, y };
  }
  throw Error('No free off-centre point for ' + id);
}

try {
  for (const vp of [{ width: 956, height: 440 }, { width: 844, height: 390 }]) {
    const tag = vp.width + 'x' + vp.height;
    const context = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await context.addInitScript(spy);
    const page = await boot(context, '&island=right');
    const cdp = await context.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 6, radiusY: 6 })) });

    // 1. Off-centre taps still press the intended button; a tap far from any does nothing.
    const def = await rects(page);
    for (const id of ['attack', 'jump', 'parry', 'dodge']) {
      const pt = offCentre(def, id);
      const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, pt);
      assert.equal(under, 'tc-catch', `${tag}: ${id} test point is off the drawn button`);
      await touch('touchStart', [[pt.x, pt.y]]);
      assert.ok(await isDown(page, id), `${tag}: off-centre ${id} press`);
      await touch('touchEnd', []);
      assert.ok(!(await isDown(page, id)), `${tag}: ${id} released`);
    }
    await touch('touchStart', [[vp.width * 0.62, vp.height * 0.4]]);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#touch .tc.down').length), 0, 'Far tap presses nothing');
    await touch('touchEnd', []);
    const jumpPt = offCentre(def, 'jump');
    await page.evaluate(() => { const p = window.__remnant.G.world.player; p.body.vy = 0; p.body.onGround = true; });
    await page.touchscreen.tap(jumpPt.x, jumpPt.y);
    await page.waitForFunction(() => window.__remnant.G.world.player.body.vy < 0);

    // 2. Multi-touch: walk right with the stick while attacking and jumping.
    await page.waitForFunction(() => window.__remnant.G.world.player.body.onGround);
    const x0 = await page.evaluate(() => window.__remnant.G.world.player.x);
    const sx = 150, sy = vp.height - 110;
    await touch('touchStart', [[sx, sy]]);
    await touch('touchMove', [[sx + 6, sy]]);
    await page.waitForTimeout(120);
    const still = await page.evaluate(() => window.__remnant.G.world.player.body.vx);
    assert.equal(still, 0, `${tag}: a small wobble stays in the dead zone`);
    await touch('touchMove', [[sx + 60, sy]]);
    const atk = offCentre(def, 'attack');
    await touch('touchStart', [[sx + 60, sy], [atk.x, atk.y]]);
    await page.waitForFunction(() => window.__remnant.G.world.player.state === 'attack');
    assert.ok(await isDown(page, 'attack'));
    await page.waitForTimeout(400);
    await touch('touchStart', [[sx + 60, sy], [atk.x, atk.y], [def.jump.cx, def.jump.cy]]);
    assert.ok(await isDown(page, 'jump') && await isDown(page, 'attack'), `${tag}: three fingers at once`);
    await page.waitForTimeout(300);
    const x1 = await page.evaluate(() => window.__remnant.G.world.player.x);
    assert.ok(x1 > x0 + 20, `${tag}: stick held through attack and jump moves the player (${x0} → ${x1})`);
    await touch('touchEnd', []);
    assert.ok(!(await isDown(page, 'jump')) && !(await isDown(page, 'attack')), 'Lifted fingers release their buttons');
    // No drift: once the jump and swing have played out, Elior stands still.
    await page.waitForFunction(() => { const p = window.__remnant.G.world.player; return p.body.onGround && p.state === 'free' && Math.abs(p.body.vx) < 1; }, null, { timeout: 4000 });
    const rest = await page.evaluate(() => window.__remnant.G.world.player.x);
    await page.waitForTimeout(300);
    assert.ok(Math.abs(await page.evaluate(() => window.__remnant.G.world.player.x) - rest) < 1, `${tag}: no drift after release`);
    await page.screenshot({ path: `qa/touch-controls-${tag}.png` });

    // 3. The editor: from the pause menu's Settings.
    await page.locator('#touch [data-ctl=menu]').tap();
    await page.locator('.menu .tab', { hasText: 'Settings' }).tap();
    await page.locator('[data-k=tc_edit]').tap();
    await page.locator('.tc-editor').waitFor();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `qa/touch-editor-default-${tag}.png` });
    const ed = id => page.evaluate(id => { const r = document.querySelector(`.tc-editor [data-ctl=${id}]`).getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 }; }, id);
    const drag = async (id, x, y) => {
      const a = await ed(id);
      await touch('touchStart', [[a.cx, a.cy]]);
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[a.cx + (x - a.cx) * i / 6, a.cy + (y - a.cy) * i / 6]]);
      await touch('touchEnd', []);
      return ed(id);
    };
    const target = { x: Math.round(vp.width * 0.58), y: Math.round(vp.height * 0.45) };
    const moved = await drag('jump', target.x, target.y);
    assert.ok(Math.abs(moved.cx - target.x) < 2 && Math.abs(moved.cy - target.y) < 2, `${tag}: jump dragged to ${JSON.stringify(moved)}`);
    // Resize: the per-control slider on Jump, then a pinch on Attack.
    await page.evaluate(() => { const i = document.querySelector('[data-k=ed_size]'); i.value = '1.4'; i.dispatchEvent(new Event('input')); });
    const big = await ed('jump');
    assert.ok(Math.abs(big.r / moved.r - 1.4) < 0.03, `${tag}: jump resized`);
    const a0 = await ed('attack');
    await touch('touchStart', [[a0.cx, a0.cy]]);
    await touch('touchStart', [[a0.cx, a0.cy], [a0.cx - 40, a0.cy]]);
    for (let i = 1; i <= 5; i++) await touch('touchMove', [[a0.cx, a0.cy], [a0.cx - 40 - i * 8, a0.cy]]);
    await touch('touchEnd', []);
    const a1 = await ed('attack');
    assert.ok(a1.r > a0.r * 1.15, `${tag}: pinch grows attack (${a0.r} → ${a1.r})`);
    // Clamping: off every edge, and into the island on the right.
    const island = await page.evaluate(() => { const r = document.querySelector('.tce-island').getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; });
    assert.ok(island.x1 >= vp.width - 1 && island.x1 - island.x0 > 40, 'Island keep-out shown on the right');
    for (const [id, x, y] of [['parry', vp.width + 80, vp.height / 2], ['dodge', -60, -60], ['heal', vp.width / 2, vp.height + 90], ['stick', vp.width + 50, vp.height / 2], ['switch', vp.width - 20, vp.height / 2]]) {
      const c = await drag(id, x, y);
      assert.ok(c.cx - c.r >= 0 && c.cy - c.r >= 0 && c.cx + c.r <= vp.width && c.cy + c.r <= vp.height, `${tag}: ${id} stays on screen ${JSON.stringify(c)}`);
      const hitsIsland = c.cx + c.r > island.x0 + 0.5 && c.cx - c.r < island.x1 && c.cy + c.r > island.y0 + 0.5 && c.cy - c.r < island.y1 - 0.5;
      assert.ok(!hitsIsland, `${tag}: ${id} kept off the island ${JSON.stringify(c)} ${JSON.stringify(island)}`);
    }
    assert.ok((await ed('stick')).cx <= vp.width * 0.5 + 0.5, 'Stick keeps to its half');
    await page.screenshot({ path: `qa/touch-editor-${tag}.png` });
    await page.locator('[data-k=ed_done]').tap();
    await page.locator('.tc-editor').waitFor({ state: 'detached' });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('remnant-settings-v1')).touchLayout);
    assert.ok(saved.jump && Math.abs(saved.jump.s - 1.4) < 1e-9 && saved.attack.s > 1.15, `${tag}: layout saved ${JSON.stringify(saved.jump)}`);
    await page.locator('.menu-close').tap();

    // 4. It persists across a reload and still plays.
    await reload(page, '&island=right');
    const after = await rects(page);
    assert.ok(Math.abs(after.jump.cx - target.x) < 2 && Math.abs(after.jump.cy - target.y) < 2 && Math.abs(after.jump.r - big.r) < 1, `${tag}: jump kept its place after reload`);
    const jp = offCentre(after, 'jump');
    await touch('touchStart', [[jp.x, jp.y]]);
    assert.ok(await isDown(page, 'jump'), `${tag}: moved jump answers an off-centre touch`);
    await touch('touchEnd', []);
    await page.evaluate(() => { const p = window.__remnant.G.world.player; p.body.vy = 0; p.body.onGround = true; });
    await page.locator('#touch [data-ctl=jump]').tap();
    await page.waitForFunction(() => window.__remnant.G.world.player.body.vy < 0);
    // The moved stick still walks, from where it now rests.
    await page.waitForFunction(() => window.__remnant.G.world.player.body.onGround);
    const home = await page.evaluate(() => { const r = document.querySelector('#touch .stick-base').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    assert.ok(home.x > vp.width * 0.4, `${tag}: stick rests where it was dragged (${home.x})`);
    const px0 = await page.evaluate(() => window.__remnant.G.world.player.x);
    await touch('touchStart', [[home.x, home.y]]);
    await touch('touchMove', [[home.x - 50, home.y]]);
    await page.waitForTimeout(300);
    await touch('touchEnd', []);
    assert.ok(await page.evaluate(() => window.__remnant.G.world.player.x) < px0 - 15, `${tag}: moved stick walks left`);
    await page.screenshot({ path: `qa/touch-custom-${tag}.png` });

    // 5. Reset restores the default layout.
    await page.locator('#touch [data-ctl=menu]').tap();
    await page.locator('.menu .tab', { hasText: 'Settings' }).tap();
    await page.locator('[data-k=tc_edit]').tap();
    await page.locator('[data-k=ed_reset]').tap();
    await page.locator('[data-k=ed_done]').tap();
    await page.locator('.menu-close').tap();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('touch')).display !== 'none');
    const reset = await rects(page);
    for (const id of Object.keys(def)) assert.ok(Math.abs(reset[id].cx - def[id].cx) < 1 && Math.abs(reset[id].cy - def[id].cy) < 1 && Math.abs(reset[id].r - def[id].r) < 1, `${tag}: ${id} back to default`);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('remnant-settings-v1')).touchLayout), {});
    // Left-handed mirrors the default layout and stays just as forgiving.
    await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('remnant-settings-v1')); st.leftHanded = true; localStorage.setItem('remnant-settings-v1', JSON.stringify(st)); });
    await reload(page, '&island=right');
    const lhR = await rects(page);
    const lhStick = await page.evaluate(() => { const r = document.querySelector('#touch .stick-base').getBoundingClientRect(); return r.left + r.width / 2; });
    assert.ok(lhR.attack.cx < vp.width / 2 && lhR.jump.cx < vp.width / 2 && lhStick > vp.width / 2, `${tag}: left-handed layout mirrored`);
    const la = offCentre(lhR, 'attack');
    await touch('touchStart', [[la.x, la.y]]);
    assert.ok(await isDown(page, 'attack'), `${tag}: left-handed off-centre attack`);
    await touch('touchEnd', []);
    await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('remnant-settings-v1')); st.leftHanded = false; localStorage.setItem('remnant-settings-v1', JSON.stringify(st)); });
    console.log(`${tag}: off-centre taps, dead zone, move+attack+jump multi-touch, editor drag/slider/pinch, clamping off-screen and off the island, persistence, reset and left-handed passed`);
    await context.close();
  }

  // 6. Haptics: a distinct pattern per moment, on the vibrate path and the iOS switch path.
  for (const ios of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, ...(ios ? { userAgent: IPHONE_UA } : {}) });
    await context.addInitScript(spy);
    const page = await boot(context);
    assert.equal(await page.evaluate(() => window.__remnant.ios), ios);
    const fire = async (kind) => {
      await page.waitForTimeout(450);
      await page.evaluate(() => { window.__vib.length = 0; window.__ticks.length = 0; });
      await page.evaluate(kind => {
        const a = window.__remnant, { G } = a, W = G.world, p = W.player;
        const hit = { dmg: 1, poise: 0, kx: 0, ky: 0, dir: -p.face, kind: 'melee' };
        if (kind === 'hit' || kind === 'kill') {
          W.ents = W.ents.filter(e => e === p);
          const foe = a.spawn('brute', p.x + p.face * 30, p.y);
          foe.hp = kind === 'kill' ? 1 : (foe.maxHp = 1e7);
          p.atkHit.clear(); p.activeHits(p.moves.combo[0], 1);
        } else if (kind === 'parry') { p.state = 'free'; p.invuln = 0; p.parryT = 0.2; p.takeHit(hit); p.invuln = 999; }
        else if (kind === 'hurt') { p.state = 'free'; p.invuln = 0; p.parryT = 0; p.takeHit(hit); p.invuln = 999; }
        else if (kind === 'phase') W.boss.phase++;
      }, kind);
      // Long enough for the whole pattern even when timers run late on a busy machine.
      await page.waitForTimeout(kind === 'phase' ? 1000 : 600);
      return page.evaluate(() => ({ vib: window.__vib.slice(), ticks: window.__ticks.slice() }));
    };
    const got = {};
    for (const kind of ['hit', 'kill', 'parry', 'hurt']) got[kind] = await fire(kind);
    // A real boss for the phase change.
    await page.evaluate(() => {
      const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
      W.story.ch3.rounds.start(1, true);
      for (let i = 0; i < 4000 && !(R.round === 1 && W.boss?.phase === 1 && W.boss.invuln === 0); i++) W.update(1 / 120);
      W.player.invuln = 999; G.inCutscene = false;
    });
    assert.equal(await page.evaluate(() => window.__remnant.G.world.boss?.phase), 1, 'Boss ready');
    await page.waitForTimeout(150);
    got.phase = await fire('phase');
    if (!ios) {
      for (const [k, v] of Object.entries(got)) assert.deepEqual(v.vib, [PATTERNS[k]], `vibrate pattern for ${k}: ${JSON.stringify(v.vib)}`);
      assert.equal(new Set(Object.values(PATTERNS).map(p => p.join())).size, 5);
    } else {
      const counts = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.ticks.length]));
      assert.deepEqual(counts, { hit: 1, kill: 2, parry: 2, hurt: 3, phase: 4 }, 'iOS tick counts ' + JSON.stringify(counts));
      // Timers can run late on a busy machine but never early, so each rhythm has a floor.
      const minGap = t => Math.min(...t.slice(1).map((x, i) => x - t[i]));
      for (const [k, floor] of [['parry', 55], ['kill', 120], ['hurt', 75], ['phase', 125]]) assert.ok(minGap(got[k].ticks) >= floor, `${k} rhythm ${JSON.stringify(got[k].ticks)}`);
      for (const v of Object.values(got)) assert.equal(v.vib.length, 0, 'iOS never calls vibrate');
    }
    // The Haptics setting still silences everything.
    await page.evaluate(() => { const { G } = window.__remnant; G.world.boss = null; G.world.bossActive = false; G.world.story.ch3.rounds.stop(false); });
    await page.evaluate(() => { localStorage.setItem('remnant-settings-v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('remnant-settings-v1') ?? '{}'), haptics: false })); });
    await reload(page);
    const off = await fire('hurt');
    assert.ok(off.vib.length === 0 && off.ticks.length === 0, 'Haptics off is silent');
    console.log((ios ? 'iOS switch' : 'Vibrate') + ' haptics: hit, kill, parry, hurt and boss phase each have their own pattern; the setting turns them off');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
