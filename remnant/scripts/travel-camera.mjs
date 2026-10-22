// Altar fast travel (touch, keyboard and DualSense) and the follow camera's
// feel: look-ahead, vertical dead zone, eased boss zoom, bounds and snaps.
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

// Altars across five chapters, including a Fallen Crown hub and the Covenant Chamber (altar id ≠ room id).
const LIT = ['sanctuary', 'chamber', 'shinar_camp', 'valley_camp', 'river_camp', 'thaw_outpost'];
const ROOM_OF = { sanctuary: 'sanctuary', chamber: 'covenant_chamber', shinar_camp: 'shinar_camp', valley_camp: 'valley_camp', river_camp: 'river_camp', thaw_outpost: 'thaw_outpost' };

async function boot(context) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  // A fake DualSense the game's input polls like a real one.
  await page.addInitScript(() => {
    const pad = { index: 0, id: 'DualSense Wireless Controller', mapping: 'standard', connected: true, timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [window.__padOn ? pad : null];
  });
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate((lit) => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = s.flags.chamber_done = true;
    for (const n of [2, 3, 4, 7]) s.flags[`ch${n}_intro`] = true;
    s.level = 60;
    s.altarsLit = [...lit];
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  }, LIT);
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  await page.evaluate(() => { const { G } = window.__remnant; G.ui.dialogue = async () => 0; G.ui.lore = async () => {}; });
  return page;
}
const idle = (page) => page.waitForFunction(() => { const { G } = window.__remnant; return !G.inCutscene && !G.world.transitioning; }, null, { timeout: 20000 });
const kneelAt = async (page, room) => {
  await page.evaluate((room) => { const { G } = window.__remnant; G.world.load(room, 'altar'); }, room);
  await page.evaluate(() => { const { G } = window.__remnant; const a = G.world.ents.find(e => e.idKey); G.world.restAtAltar(a); });
  await page.locator('[data-k=altar_travel]').waitFor();
};
const travelIds = (page) => page.$$eval('[data-k^=travel_]', els => els.map(e => e.dataset.k.slice(7)).filter(k => k !== 'back'));
const arrived = async (page, id) => {
  await page.waitForFunction((room) => { const { G } = window.__remnant; return G.world.room.id === room && !G.world.transitioning; }, ROOM_OF[id], { timeout: 20000 });
  return page.evaluate(() => { const { G } = window.__remnant, W = G.world, sp = W.room.spawns.altar;
    return { room: W.room.id, spawn: G.save.spawn, dx: Math.abs(W.player.x - sp.x * 16), altar: G.save.altar, paused: G.paused, layers: document.querySelectorAll('.layer').length }; });
};
// Spatial navigation toward an element with arrow presses (keyboard) or the D-pad (controller).
async function navTo(page, k, press) {
  for (let i = 0; i < 24; i++) {
    const d = await page.evaluate((k) => {
      const t = document.querySelector(`[data-k="${k}"]`), a = document.activeElement;
      if (a === t) return null;
      const q = t.getBoundingClientRect(), r = a?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
      const dx = q.left + q.width / 2 - (r.left + r.width / 2), dy = q.top + q.height / 2 - (r.top + r.height / 2);
      return Math.abs(dy) > 6 ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
    }, k);
    if (!d) return;
    await press(d);
  }
  throw Error('could not reach ' + k);
}
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', confirm: 'Enter', back: 'Escape' };
const PAD = { up: 12, down: 13, left: 14, right: 15, confirm: 0, back: 1 };
const padPress = async (page, b) => {
  await page.evaluate((i) => { window.__padOn = true; Object.assign(window.__pad.buttons[i], { pressed: true, value: 1 }); }, PAD[b]);
  await page.waitForTimeout(70);
  await page.evaluate((i) => { Object.assign(window.__pad.buttons[i], { pressed: false, value: 0 }); }, PAD[b]);
  await page.waitForTimeout(70);
};

const report = {};
try {
  // ---------------------------------------------------------------- touch, iPhone landscape
  const phoneCtx = await browser.newContext({ viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const phone = await boot(phoneCtx);
  await kneelAt(phone, 'sanctuary');
  await phone.locator('[data-k=altar_travel]').tap();
  await phone.locator('[data-k=travel_back]').waitFor();
  const groups = await phone.$$eval('.choice-card.altar .travel-group > .eyebrow', els => els.map(e => e.textContent));
  assert.deepEqual(groups, ['Chapter I · The Ashen Village', 'Chapter II · The Tower of Shinar', 'Chapter III · The Valley of Bones', 'Chapter IV · The Plain of Dura', 'Chapter VII · The Crown of the Hunt'], 'grouped by chapter in story order');
  assert.deepEqual((await travelIds(phone)).sort(), LIT.filter(a => a !== 'sanctuary').sort(), 'every lit altar but this one');
  // Every destination fits the phone's width and can be scrolled to.
  const fit = await phone.$$eval('[data-k^=travel_]', els => els.every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 36; }));
  assert.ok(fit, 'travel buttons fit 956×440 and are tappable');
  await phone.screenshot({ path: 'qa/travel-phone.png' });
  await phone.locator('[data-k=travel_river_camp]').tap();
  const a1 = await arrived(phone, 'river_camp');
  assert.equal(a1.spawn, 'altar'); assert.ok(a1.dx < 2, 'standing at the altar'); assert.deepEqual(a1.altar, { room: 'river_camp', spawn: 'altar' });
  assert.equal(a1.paused, false); assert.equal(a1.layers, 0, 'menu closed and game resumed');
  // A Fallen Crown altar (room-named) and an altar whose id differs from its room.
  await idle(phone);
  await kneelAt(phone, 'river_camp');
  await phone.locator('[data-k=altar_travel]').tap();
  assert.ok(!(await travelIds(phone)).includes('river_camp'), 'current altar excluded');
  await phone.locator('[data-k=travel_chamber]').tap();
  const a2 = await arrived(phone, 'chamber');
  assert.equal(a2.room, 'covenant_chamber'); assert.ok(a2.dx < 2);
  report.touch = { groups: groups.length, first: a1.room, second: a2.room };

  // Refusals: boss fight, cutscene, a story lock (gate barred), the Trial, and a fight that starts while the list is open.
  await idle(phone);
  for (const [name, set, unset] of [
    ['boss', 'G.world.bossActive=true', 'G.world.bossActive=false'],
    ['gate', 'G.world.gateClosed=true', 'G.world.gateClosed=false'],
    ['trial', 'G.world.story.ch3.rounds.active=true', 'G.world.story.ch3.rounds.active=false'],
  ]) {
    await phone.evaluate((set) => { const { G } = window.__remnant; new Function('G', set)(G); G.ui.openAltar('chamber'); }, set);
    const btn = phone.locator('[data-k=altar_travel]');
    assert.equal(await btn.isDisabled(), true, `Travel disabled: ${name}`);
    await btn.tap({ force: true });
    assert.equal(await phone.locator('[data-k=travel_back]').count(), 0, `Travel page refused: ${name}`);
    await phone.locator('[data-k=altar_continue]').tap();
    await phone.evaluate((unset) => { const { G } = window.__remnant; new Function('G', unset)(G); }, unset);
  }
  // A cutscene: the altar's Travel is disabled too.
  await phone.evaluate(() => { const { G } = window.__remnant; G.inCutscene = true; G.ui.openAltar('chamber'); });
  assert.equal(await phone.locator('[data-k=altar_travel]').isDisabled(), true, 'Travel disabled in a cutscene');
  await phone.locator('[data-k=altar_continue]').tap();
  await phone.evaluate(() => { window.__remnant.G.inCutscene = false; });
  await phone.evaluate(() => window.__remnant.G.ui.openAltar('chamber'));
  await phone.locator('[data-k=altar_travel]').tap();
  await phone.evaluate(() => { window.__remnant.G.world.bossActive = true; });
  await phone.locator('[data-k=travel_sanctuary]').tap();
  await phone.waitForTimeout(600);
  assert.equal(await phone.evaluate(() => window.__remnant.G.world.room.id), 'covenant_chamber', 'no travel once a boss fight has begun');
  await phone.evaluate(() => { window.__remnant.G.world.bossActive = false; });
  await phone.locator('[data-k=travel_back]').tap();
  await phone.locator('[data-k=altar_continue]').tap();
  report.refused = ['boss', 'gate', 'trial', 'cutscene', 'fight began mid-list'];
  await phoneCtx.close();

  // ---------------------------------------------------------------- keyboard and controller
  const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const desk = await boot(deskCtx);
  // Kneel with the interact key, as a player would.
  await desk.evaluate(() => { const { G } = window.__remnant; G.world.load('shinar_camp', 'altar'); });
  await desk.waitForTimeout(150);
  await desk.keyboard.press('KeyF');
  await desk.locator('[data-k=altar_travel]').waitFor({ timeout: 8000 });
  await desk.waitForTimeout(200);
  const kb = (d) => desk.keyboard.press(KEY[d]);
  await navTo(desk, 'altar_travel', kb); await kb('confirm');
  await desk.locator('[data-k=travel_back]').waitFor();
  await kb('back');
  await desk.locator('[data-k=altar_travel]').waitFor();
  assert.equal(await desk.locator('.choice-card.altar').count(), 1, 'Back returns to the altar page, not out of it');
  await navTo(desk, 'altar_travel', kb); await kb('confirm');
  await desk.locator('[data-k=travel_valley_camp]').waitFor();
  await navTo(desk, 'travel_valley_camp', kb); await kb('confirm');
  const k1 = await arrived(desk, 'valley_camp');
  assert.equal(k1.spawn, 'altar'); assert.ok(k1.dx < 2);
  report.keyboard = k1.room;
  await idle(desk);
  await desk.evaluate(() => { const { G } = window.__remnant; G.world.restAtAltar(G.world.ents.find(e => e.idKey)); });
  await desk.locator('[data-k=altar_travel]').waitFor();
  await desk.waitForTimeout(200);
  const pad = (d) => padPress(desk, d);
  await navTo(desk, 'altar_travel', pad); await pad('confirm');
  await desk.locator('[data-k=travel_thaw_outpost]').waitFor();
  await navTo(desk, 'travel_thaw_outpost', pad); await pad('confirm');
  const g1 = await arrived(desk, 'thaw_outpost');
  assert.equal(g1.spawn, 'altar'); assert.ok(g1.dx < 2);
  report.controller = g1.room;
  await desk.evaluate(() => { window.__padOn = false; });
  await idle(desk);

  // ---------------------------------------------------------------- camera feel (deterministic)
  const cam = await desk.evaluate(() => {
    const { G } = window.__remnant, C = G.camera;
    G.paused = true;
    const saved = C.bounds;
    function sim(dt) {
      C.bounds = { x: 0, y: 0, w: 4000, h: 1200 };
      C.focus = null; C.viewMultTarget = 1; C.zoomTarget = C.zoom = 1; C.punch = 0; C.trauma = 0;
      let x = 1500, y = 800, floor = 800, vx = 0, vy = 0, face = 1, grounded = true, t = 0;
      C.snapTo(x + 30, y - 40);
      const out = [], marks = {};
      const seg = (name, dur, fn) => {
        marks[name] = out.length;
        for (let k = 0, n = Math.round(dur / dt); k < n; k++) {
          fn?.();
          x = Math.max(20, x + vx * dt);
          if (!grounded) { vy = Math.min(560, vy + 1500 * dt); y += vy * dt; if (y >= floor && vy > 0) { y = floor; vy = 0; grounded = true; } }
          C.update(dt, x, y, face, vx, 0, vy, grounded);
          t += dt;
          const v = C.view();
          out.push({ t, x, y, cx: C.x, cy: C.y, lx: C.lookX, vx: v.x, vy: v.y, vw: v.w, vh: v.h });
        }
      };
      seg('idle', 0.5);
      seg('run', 2.0, () => { vx = 142; face = 1; });
      seg('tap', 0.12, () => { vx = -142; face = -1; });
      seg('resume', 0.6, () => { vx = 142; face = 1; });
      seg('jump', 0.9, () => { if (out.length === marks.jump) { vy = -430; grounded = false; } });
      seg('ledge', 1.6, () => { if (out.length === marks.ledge) { vy = -430; grounded = false; } if (!grounded && y < 750) floor = 750; });
      seg('drop', 2.2, () => { floor = 1150; if (out.length === marks.drop) { grounded = false; vy = 0; } });
      seg('left', 2.5, () => { vx = -142; face = -1; });
      seg('wall', 20, () => { vx = x <= 20 ? 0 : -142; });
      return { out, marks, bounds: C.bounds };
    }
    const a = sim(1 / 120), b = sim(1 / 60);
    const at = (r, name, off = 0) => r.out[r.marks[name] + off];
    const end = (r, name) => r.out[r.marks[name] - 1];
    let maxRunStep = 0, maxStep = 0, maxAt = 0, outOfView = 0, outOfBounds = 0;
    for (let i = 1; i < a.out.length; i++) {
      const p = a.out[i], q = a.out[i - 1];
      const step = Math.hypot(p.cx - q.cx, p.cy - q.cy);
      if (step > maxStep) { maxStep = step; maxAt = i; }
      if (i < a.marks.jump) maxRunStep = Math.max(maxRunStep, step);
      if (p.y > p.vy + p.vh - 4 || p.y - 46 < p.vy + 4) outOfView++;
      if (p.vx < -0.01 || p.vy < -0.01 || p.vx + p.vw > 4000.01 || p.vy + p.vh > 1200.01) outOfBounds++;
    }
    // Same moments at 60 and 120 Hz, on the stretch where both runs move the player identically.
    let fpsDiff = 0;
    for (let i = 0; i < b.marks.jump; i++) {
      const p = b.out[i], q = a.out[i * 2 + 1];
      fpsDiff = Math.max(fpsDiff, Math.abs(p.cx - q.cx), Math.abs(p.cy - q.cy));
    }
    const tapMin = Math.min(...a.out.slice(a.marks.tap, a.marks.jump).map(s => s.lx));
    const jumpCy = a.out.slice(a.marks.jump, a.marks.ledge).map(s => s.cy);
    const res = {
      leadRun: end(a, 'tap').cx - end(a, 'tap').x,
      leadBeforeTap: end(a, 'tap').lx, tapMin,
      jumpSwing: Math.max(...jumpCy) - Math.min(...jumpCy),
      ledgeSettle: end(a, 'drop').cy - (750 - 18),
      leadLeft: end(a, 'wall').cx - end(a, 'wall').x,
      wallViewX: a.out[a.out.length - 1].vx,
      maxRunStep, maxStep, maxAt: Object.entries(a.marks).filter(([, v]) => v <= maxAt).pop()?.[0], outOfView, outOfBounds, fpsDiff,
    };
    // snapTo stays instant, and clamps to bounds.
    C.snapTo(900, 500);
    res.snap = [C.x, C.y];
    C.snapTo(-500, 5000);
    const sv = C.view();
    res.snapClamped = sv.x >= 0 && sv.y + sv.h <= 1200.01;
    // Boss framing: viewMult eases in and out without overshoot.
    C.snapTo(1500, 700);
    const vm = [C.viewMult];
    C.viewMultTarget = 1.2;
    for (let i = 0; i < 180; i++) { C.update(1 / 120, 1500, 718, 1, 0, 0, 0, true); vm.push(C.viewMult); }
    const d = vm.slice(1).map((v, i) => v - vm[i]);
    res.zoomIn = { first: d[0], peak: Math.max(...d), last: vm[vm.length - 1], max: Math.max(...vm), monotonic: d.every(x => x >= -1e-9) };
    C.viewMultTarget = 1;
    for (let i = 0; i < 180; i++) C.update(1 / 120, 1500, 718, 1, 0, 0, 0, true);
    res.zoomOut = C.viewMult;
    C.bounds = saved;
    G.world.load(G.world.room.id, 'altar');
    G.paused = false;
    return res;
  });
  report.camera = cam;
  assert.ok(cam.leadRun > 40, 'look-ahead while running: ' + cam.leadRun);
  assert.ok(cam.leadBeforeTap - cam.tapMin < 8 && cam.tapMin > 30, `tap-turn does not swing the camera: ${cam.leadBeforeTap} → ${cam.tapMin}`);
  assert.ok(cam.jumpSwing < 4, 'a single jump holds the frame: ' + cam.jumpSwing);
  assert.ok(Math.abs(cam.ledgeSettle) < 3, 'landing higher eases to the new height: ' + cam.ledgeSettle);
  assert.ok(cam.leadLeft < -40 || cam.wallViewX === 0, 'sustained turn leads the other way: ' + cam.leadLeft);
  assert.ok(cam.wallViewX >= 0, 'clamped at the room edge');
  assert.ok(cam.maxRunStep < 2.5, 'running: no jumps per frame ' + cam.maxRunStep);
  assert.ok(cam.maxStep < 6, 'falling and landing: no jumps per frame ' + cam.maxStep);
  assert.equal(cam.outOfView, 0, 'the player never leaves the screen');
  assert.equal(cam.outOfBounds, 0, 'view stays inside the room bounds');
  assert.ok(cam.fpsDiff < 3, '60 Hz and 120 Hz frame alike: ' + cam.fpsDiff);
  assert.deepEqual(cam.snap, [900, 500], 'snapTo is instant');
  assert.ok(cam.snapClamped, 'snapTo still clamps');
  assert.ok(cam.zoomIn.monotonic && cam.zoomIn.first < cam.zoomIn.peak / 4, 'zoom eases in: ' + JSON.stringify(cam.zoomIn));
  assert.ok(Math.abs(cam.zoomIn.last - 1.2) < 0.01 && cam.zoomIn.max <= 1.2 + 1e-6, 'zoom settles without overshoot');
  assert.ok(Math.abs(cam.zoomOut - 1) < 0.01, 'zoom eases back out');

  // ---------------------------------------------------------------- camera in real play
  // The outpost's open ground east of its altar; lead is measured once off the west wall's clamp.
  await desk.evaluate(() => { const { G } = window.__remnant; G.world.load('thaw_outpost', 'altar'); G.inCutscene = false; });
  await desk.waitForTimeout(300);
  await desk.evaluate(() => {
    const { G } = window.__remnant;
    window.__camLog = [];
    let last = performance.now();
    const tick = (now) => {
      if (!window.__camLog) return;
      const v = G.camera.view(), b = G.camera.bounds, p = G.world.player;
      const hw = G.camera.halfW, edge = Math.abs(G.camera.x - (b.x + hw)) < 0.5 || Math.abs(G.camera.x - (b.x + b.w - hw)) < 0.5;
      window.__camLog.push({ edge, dt: (now - last) / 1000, cx: G.camera.x, cy: G.camera.y, px: p.x, py: p.y, inB: v.x >= b.x - 0.01 && v.x + v.w <= b.x + b.w + 0.01 && v.y >= b.y - 0.01 && v.y + v.h <= b.y + b.h + 0.01, room: G.world.room.id });
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await desk.keyboard.down('KeyD');
  await desk.waitForTimeout(1300);
  await desk.keyboard.press('Space');
  await desk.waitForTimeout(700);
  await desk.keyboard.up('KeyD');
  await desk.waitForTimeout(400);
  const live = await desk.evaluate(() => { const l = window.__camLog; window.__camLog = null; return l; });
  const same = live.filter((s, i) => i > 0 && s.room === live[i - 1].room);
  let worst = 0, lead = -Infinity;
  for (let i = 1; i < live.length; i++) {
    if (live[i].room !== live[i - 1].room) continue;
    const dt = Math.max(1 / 120, live[i].dt);
    worst = Math.max(worst, Math.hypot(live[i].cx - live[i - 1].cx, live[i].cy - live[i - 1].cy) / dt);
    if (!live[i].edge) lead = Math.max(lead, live[i].cx - live[i].px);
  }
  report.live = { frames: live.length, worstSpeed: Math.round(worst), lead: Math.round(lead), inBounds: live.every(s => s.inB) };
  assert.ok(same.length > 30, 'sampled real frames');
  assert.ok(worst < 700, 'live camera speed stays smooth (world units/s): ' + worst);
  assert.ok(lead > 20 && lead < 80, 'live look-ahead while running: ' + lead);
  assert.ok(live.every(s => s.inB), 'live view inside room bounds');
  await desk.screenshot({ path: 'qa/travel-camera-desktop.png' });
  await deskCtx.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pass: 'altar travel by touch, keyboard and controller; refusals; camera look-ahead, dead zone, eased zoom, bounds, snaps', ...report }));
} finally { await browser.close(); server.close(); }
