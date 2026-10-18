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
async function mockSpeech(context, supported = true) {
  await context.addInitScript(supported => {
    window.__speechStarts = 0; window.__speechAborts = 0; window.__sessions = [];
    class Speech {
      start() { window.__speechStarts++; window.__sessions.push(this); }
      abort() { window.__speechAborts++; this.aborted = true; }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: supported ? Speech : undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    window.__say = (text, final = true) => {
      const current = window.__sessions.at(-1);
      window.__lateSpeech = current.onresult;
      current.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: final }] });
    };
  }, supported);
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    await mockSpeech(context);
    const page = await boot(context);
    await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world, s = G.save;
      G.paused = true; G.inCutscene = false;
      W.load('trial_arena', 'start'); W.story.ch3.rounds.stop(false);
      W.ents = []; W.echoes = []; W.boss = null; W.bossActive = false; W.hitstopT = W.slowT = 0;
      s.echoes = []; s.active = [];
      for (const [species, role] of [['sentinel', 'guardian'], ['archer', 'mage'], ['knight', 'ninja'], ['brute', 'fighter'], ['bulwark', 'herald']]) {
        a.echo(species); W.echoes.find(u => u.inst.species === species).setRole(role);
      }
    });
    const combinations = await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world, p = W.player;
      const unit = role => W.echoes.find(u => u.inst.role === role);
      function setup() {
        W.ents = []; W.echoCombinations.reset(); W.hitstopT = 0;
        p.x = 210; p.y = 288; p.state = 'free'; p.shieldT = 0; p.invuln = 999;
        for (const u of W.echoes) {
          u.x = 250; u.y = 288; u.body.vx = u.body.vy = 0; u.body.onGround = true;
          u.move = null; u.state = 'follow'; u.specialCd = u.attackCd = u.summonT = u.recallT = u.despawn = 0;
          u.setOrder('hunt'); u.target = null; u.hp = u.maxHp;
        }
        const f = a.spawn('brute', 310, 288); f.hp = f.maxHp = 1e8; f.poise = f.maxPoise = 1e8; f.heavyBody = false; f.invuln = 0;
        return f;
      }
      let f = setup(); unit('mage').update(1 / 120);
      const chilled = f.chill > 0; const before = f.hp;
      W.echoCombinations.update(0.2);
      const frost = chilled && W.echoCombinations.last === 'frostbreak' && f.hp < before;
      const count = W.echoCombinations.count;
      W.echoCombinations.prime('frostbreak', unit('mage'), f); W.echoCombinations.update(0.2);
      const bounded = W.echoCombinations.count === count;
      f = setup(); unit('fighter').update(1 / 120); const launched = f.body.vy < -100, x = unit('ninja').x, hp = f.hp;
      W.echoCombinations.update(0.2);
      const skyfall = launched && W.echoCombinations.last === 'skyfall' && f.hp < hp && unit('ninja').x !== x;
      f = setup(); f.heavyBody = f.isBoss = true; f.body.vy = 0; unit('fighter').update(1 / 120); W.echoCombinations.update(0.2);
      const bossSafe = W.echoCombinations.last === 'skyfall' && f.body.vy === 0;
      f = setup(); G.save.hp = G.d.maxHp * 0.4; p.burn = p.bleed = 2;
      unit('guardian').update(1 / 120); const self = G.save.hp; W.echoCombinations.update(0.2);
      const sanctuary = W.echoCombinations.last === 'sanctuary' && G.save.hp > self && p.shieldT > 0 && p.burn === 0 && p.bleed === 0;
      f = setup(); unit('mage').update(1 / 120); unit('fighter').setOrder('hold'); W.echoCombinations.update(0.2);
      const obeysHold = W.echoCombinations.count === 0;
      f = setup(); unit('mage').update(1 / 120); unit('fighter').remove = true; W.echoCombinations.update(0.2);
      const noRemovedPartner = W.echoCombinations.count === 0;
      unit('fighter').remove = false;
      f = setup(); unit('mage').update(1 / 120); f.dying = true; W.echoCombinations.update(0.2);
      const noDeadTarget = W.echoCombinations.count === 0;
      f = setup(); unit('mage').update(1 / 120); G.inCutscene = true; W.echoCombinations.update(0.2); G.inCutscene = false;
      const noCinematic = W.echoCombinations.count === 0;
      f = setup();
      const wall = [];
      for (let y = 2; y < 18; y++) { wall.push(W.grid.get(18, y)); W.grid.set(18, y, 1); }
      unit('mage').update(1 / 120); W.echoCombinations.update(0.2);
      const wallSafe = W.echoCombinations.count === 0;
      for (let y = 2; y < 18; y++) W.grid.set(18, y, wall[y - 2]);
      setup();
      return { frost, bounded, skyfall, bossSafe, sanctuary, obeysHold, noRemovedPartner, noDeadTarget, noCinematic, wallSafe };
    });
    for (const [key, ok] of Object.entries(combinations)) assert.ok(ok, key + ' ' + JSON.stringify(combinations));
    console.log((mobile ? 'Phone' : 'Desktop') + ': all three real role combinations, cooldown, boss launch protection, hold orders, removed partners, dead targets and cutscene cancellation passed');

    const wave = await page.evaluate(() => {
      const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
      W.ents = []; W.echoes = []; R.start(1, false); R.breakT = 0.001; R.update(1 / 120);
      for (let n = 0; n < 500 && R.completed < 1; n++) {
        R.spawnT = 0;
        for (const f of R.foes) { if (!f.dying) { f.hp = 0; f.die(); } f.remove = true; }
        R.update(1 / 120);
      }
      G.save.hp = G.d.maxHp * 0.4; G.save.ce = 0; G.save.balm = 0;
      const options = [...R.pendingBlessings];
      const chosen = ['steel', 'bond', 'mending'].find(id => options.includes(id)) ?? options[0];
      const stats = { melee: G.d.meleeMult, echo: G.d.echoDmg, regen: G.d.hpRegen };
      const time = G.time, round = R.round;
      G.paused = false;
      return { options, chosen, index: options.indexOf(chosen), stats, time, round, completed: R.completed };
    });
    assert.equal(wave.completed, 1); assert.equal(wave.options.length, 3); assert.equal(new Set(wave.options).size, 3);
    assert.equal(await page.locator('.blessing-choice .opt').count(), 3);
    assert.ok(await page.locator('.blessing-choice').evaluate(el => Number(getComputedStyle(el.parentElement).zIndex) > 6));
    await page.screenshot({ path: 'qa/blessing-choice-' + (mobile ? 'phone' : 'desktop') + '.png' });
    const held = await page.evaluate(() => ({ time: window.__remnant.G.time, round: window.__remnant.G.world.story.ch3.rounds.round }));
    assert.equal(held.time, wave.time); assert.equal(held.round, wave.round);
    if (mobile) await page.locator('[data-k=choice_' + wave.index + ']').tap(); else await page.locator('[data-k=choice_' + wave.index + ']').click();
    await page.waitForFunction(() => !window.__remnant.G.world.story.ch3.rounds.awaitingBlessing);
    const bonuses = await page.evaluate(({ chosen, stats }) => {
      const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds, p = W.player;
      G.paused = true;
      const chosenEffect = chosen === 'steel' || chosen === 'bloodprice' ? G.d.meleeMult > stats.melee : chosen === 'bond' ? G.d.echoDmg > stats.echo : chosen === 'mending' ? G.d.hpRegen > stats.regen : chosen === 'health' ? G.save.hp > G.d.maxHp * 0.6 : chosen === 'energy' ? G.save.ce === G.d.maxCe : chosen === 'balm' ? G.save.balm === 1 : true;
      const noDouble = !R.chooseBlessing(chosen);
      const grant = id => { R.pendingBlessings = [id]; if (!R.chooseBlessing(id)) throw Error(id); };
      grant('rhythm'); p.cds = { frost_ring: 10 }; p.weaponCd = 10; p.mantleBlinkCd = 10;
      p.update(0.1);
      const recharge = p.cds.frost_ring < 9.89 && p.weaponCd < 9.89 && p.mantleBlinkCd < 9.89;
      grant('mending'); G.save.hp = G.d.maxHp * 0.4; p.sinceHurt = 5; const hp = G.save.hp; p.update(0.1);
      const regeneration = G.save.hp > hp;
      R.breakT = 0.001; R.update(1 / 120); const nextWave = R.round === 2;
      const items = G.save.inventory.length, echoBefore = G.d.echoDmg;
      grant('bond'); const linked = G.d.echoDmg > echoBefore;
      R.stop(false);
      const reset = G.d.meleeMult === stats.melee && G.d.echoDmg === stats.echo && G.d.hpRegen === stats.regen;
      const permanentSafe = G.save.inventory.length === items;
      R.start(1, false); R.round = 1; R.breakT = 0; R.total = R.spawned = 1; R.foes = []; R.update(1 / 120);
      const waiting = R.awaitingBlessing;
      W.load('trial_arena', 'start');
      const noStaleChoice = waiting && !R.awaitingBlessing && !G.ui.isBlocking();
      R.stop(false);
      return { chosenEffect, noDouble, recharge, regeneration, nextWave, linked, reset, permanentSafe, noStaleChoice };
    }, wave);
    for (const [key, ok] of Object.entries(bonuses)) assert.ok(ok, key + ' ' + JSON.stringify(bonuses));
    console.log('Actual wave clear, three selectable blessings, paused transition, one claim, next wave, real recharge/regen/Echo bonuses and clean run reset passed');

    await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world;
      W.ents = []; W.echoes = []; G.save.flags.army_out = true; W.summonEchoes(true);
      for (const u of W.echoes) { u.summonT = 0; u.setOrder('hunt'); u.x = 230; u.y = 288; }
      G.inCutscene = false; W.player.state = 'free'; W.player.invuln = 999; G.paused = false;
    });
    if (mobile) {
      await page.touchscreen.tap(440, 180);
      await page.locator('#touch .tc[aria-label="Voice squad orders"]').tap();
    } else await page.keyboard.press('v');
    await page.locator('[data-k=voice_mic]').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__speechStarts), 0);
    await page.locator('[data-k=voice_mic]').click();
    assert.equal(await page.evaluate(() => window.__speechStarts), 1);
    await page.evaluate(() => window.__say('Guardian, protect me', false));
    assert.equal(await page.evaluate(() => window.__remnant.G.world.echoes.find(u => u.inst.role === 'guardian').order), 'hunt');
    await page.evaluate(() => window.__say('Guardian, protect me and ninja, attack archers and mage, control groups'));
    assert.match(await page.locator('[data-k=voice_status]').innerText(), /Guardian: guard/);
    const orders = await page.evaluate(() => window.__remnant.G.world.echoes.map(u => [u.inst.role, u.order, u.inst.targetPriority]));
    assert.ok(orders.some(([role, order]) => role === 'guardian' && order === 'guard'));
    assert.ok(orders.some(([role, order, priority]) => role === 'ninja' && order === 'hunt' && priority === 'ranged'));
    assert.ok(orders.some(([role, order, priority]) => role === 'mage' && order === 'hunt' && priority === 'crowd'));
    const priorities = await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world;
      W.ents = [];
      const lone = a.spawn('brute', 245, 288), archer = a.spawn('archer', 380, 288), group = [archer, a.spawn('husk', 400, 288), a.spawn('husk', 425, 288)];
      for (const f of [lone, ...group]) { f.hp = f.maxHp = 1e8; }
      const ninja = W.echoes.find(u => u.inst.role === 'ninja'), mage = W.echoes.find(u => u.inst.role === 'mage');
      ninja.update(1 / 120); mage.update(1 / 120);
      const stored = JSON.parse(localStorage.getItem('remnant-save-2'));
      const result = { ranged: ninja.target === archer, groups: group.includes(mage.target), saved: stored.echoes.some(e => e.role === 'ninja' && e.targetPriority === 'ranged') };
      W.ents = [];
      return result;
    });
    for (const [key, ok] of Object.entries(priorities)) assert.ok(ok, 'target priority ' + key);
    const field = page.locator('[data-k=voice_text]');
    await field.fill('Guardian, hunt and ranger, protect me'); await page.locator('[data-k=voice_apply]').click();
    assert.match(await page.locator('[data-k=voice_status]').innerText(), /Summon a ranger/);
    assert.equal(await page.evaluate(() => window.__remnant.G.world.echoes.find(u => u.inst.role === 'guardian').order), 'guard');
    await page.locator('[data-k=voice_mic]').click();
    await page.evaluate(() => window.__sessions.at(-1).onerror({ error: 'not-allowed' }));
    assert.match(await page.locator('[data-k=voice_status]').innerText(), /denied/);
    await page.locator('[data-k=voice_mic]').click();
    const background = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      const aborted = window.__sessions.at(-1).aborted;
      delete document.hidden;
      return aborted;
    });
    assert.ok(background, 'microphone stayed active in background');
    await field.fill('Everyone, hold here'); await field.press('Enter');
    await page.waitForFunction(() => window.__remnant.G.world.echoes.every(u => u.order === 'hold'));
    await page.screenshot({ path: 'qa/voice-orders-' + (mobile ? 'phone' : 'desktop') + '.png' });
    assert.ok(await page.locator('[data-k=voice_dismiss]').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    const fits = await page.locator('.voice-orders').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    assert.ok(fits);
    await page.locator('[data-k=voice_mic]').click();
    await page.locator('[data-k=voice_dismiss]').click();
    const lifecycle = await page.evaluate(() => {
      const before = window.__remnant.G.world.echoes.map(u => u.order).join();
      window.__lateSpeech?.({ resultIndex: 0, results: [{ 0: { transcript: 'Everyone hunt' }, isFinal: true }] });
      const stored = JSON.parse(localStorage.getItem('remnant-save-2'));
      return { stopped: window.__sessions.at(-1).aborted, same: before === window.__remnant.G.world.echoes.map(u => u.order).join(), blocking: window.__remnant.G.ui.isBlocking(), persisted: stored.echoes.every(e => e.order === 'hold') };
    });
    assert.ok(lifecycle.stopped && lifecycle.same && lifecycle.persisted); assert.equal(lifecycle.blocking, false);
    console.log((mobile ? 'Phone' : 'Desktop') + ': opt-in microphone, interim/final results, multi-role voice orders, typed submit, denied permission, atomic validation, saved orders, panel fit and abort on close passed');
    await context.close();
  }
  const fallback = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await mockSpeech(fallback, false);
  const page = await boot(fallback);
  await page.evaluate(() => { window.__remnant.G.paused = true; window.__remnant.G.inCutscene = false; window.__remnant.G.ui.voiceOrders(); });
  assert.ok(await page.locator('[data-k=voice_mic]').isDisabled());
  assert.match(await page.locator('[data-k=voice_status]').innerText(), /unavailable/);
  assert.ok(await page.locator('[data-k=voice_text]').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.voice-orders').count(), 0);
  await fallback.close();
  assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
