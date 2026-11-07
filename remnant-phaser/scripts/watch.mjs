// The Watch, the idle game inside the game (POLISH_PLAN §18): the title offers it; each gate a new CC0 place; rush stages, ×2/×3 speed and abilities; costs grow by their curves; Elior
// fights on his own and every kill pays; coins buy upgrades that open the next ones; ten foes to a stage and a gate's
// boss on a timer (lose it and he holds back until Challenged); levels open his skills, shadow slots and the Mantle; major foes leave essence that raises shadows;
// away, the wall climbs on at half speed (twelve hours at most) and a welcome card reports it; a gate's first fall pays the
// journey silver (and a cape at Gate 10); the Ascension trades a run for Seals; and all of it survives a reload.
// Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);

try {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  const enter = async () => {
    await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
    await page.click('[data-k=title_watch]');
    await page.waitForFunction(() => window.__remnant?.watch?.w, null, { timeout: 30000 });
  };
  await page.goto(base + '?debug');
  await enter();

  // ---- a fresh Elior, and the curves
  const fresh = await E(page, () => { const w = window.__remnant.watch.w; return { level: w.level, stage: w.stage, coins: w.coins }; });
  assert.deepEqual(fresh, { level: 1, stage: 1, coins: 0 }, 'a fresh Elior starts the Watch at level 1');
  const curve = await E(page, () => { const sc = window.__remnant.watch; sc.w.coins = 1000; const a = sc.buy('attack', 10); const crit = sc.buy('crit', 1); return { a, lvl: sc.w.up.attack, left: sc.w.coins, crit }; });
  assert.ok(curve.a && curve.lvl === 10 && curve.left === 1000 - 139 && !curve.crit, `ten Attack levels cost their geometric sum, and Critical Chance waits for Health 40 (${JSON.stringify(curve)})`);
  // The cards show the stat itself, now and after the purchase; his numbers sit under the stage bar.
  await page.waitForTimeout(300);
  const shown = await E(page, () => ({ atk: document.querySelector('[data-k=wt_val_attack]')?.textContent, hp: document.querySelector('[data-k=wt_val_health]')?.textContent, line: document.querySelector('[data-k=wt_stats]')?.textContent }));
  assert.ok(/^\S+ → \S+$/.test(shown.atk) && /^100 → 120$/.test(shown.hp) && /ATK.+HEALTH.+SPEED.+DPS.+COINS/.test(shown.line), `upgrade cards show the value now and after; the stat line shows his numbers (${JSON.stringify(shown)})`);

  // The wall starts below the bar over it (however that bar wraps on this phone), and the panel below the wall.
  const fit = await E(page, () => { const sc = window.__remnant.watch, cam = sc.cameras.main, k = sc.scale.width / innerWidth;
    return { hud: document.querySelector('.wt-hud').getBoundingClientRect().bottom, top: cam.y / k, bottom: (cam.y + cam.height) / k, panel: document.querySelector('.wt-panel').getBoundingClientRect().top }; });
  assert.ok(fit.hud <= fit.top + 0.5 && Math.abs(fit.panel - fit.bottom) < 1.5, `nothing over the wall is cut off: the bar ends above it and the panel starts below it (${JSON.stringify(fit)})`);
  // The status bar and the Dynamic Island, reported after the Watch opened: the bar steps below them and the wall follows.
  const cdp = await ctx.newCDPSession(page);
  const inset = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34 } }).then(() => true, () => false);
  if (inset) {
    await page.waitForTimeout(700);
    const late = await E(page, () => { const sc = window.__remnant.watch, k = sc.scale.width / innerWidth, h = document.querySelector('.wt-hud').getBoundingClientRect();
      return { hudTop: h.top, hud: h.bottom, top: sc.cameras.main.y / k }; });
    assert.ok(late.hudTop >= 59 && late.hud <= late.top + 0.5, `the bar sits below the status bar and the island, and the wall below the bar (${JSON.stringify(late)})`);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} }).catch(() => {});
  }

  // ---- he fights on his own, kills pay, stages pass, levels come
  const fight = await E(page, () => {
    const sc = window.__remnant.watch;
    for (let i = 0; i < 30 * 150; i++) { sc.tick(1 / 30); if (i % 30 === 0) for (const id of ['attack', 'health', 'speed']) sc.buy(id, 0); }
    return { stage: sc.w.stage, level: sc.w.level, best: sc.w.best };
  });
  assert.ok(fight.stage >= 4 && fight.level >= 3, `two and a half minutes on the wall: stages and levels (${JSON.stringify(fight)})`);

  // ---- a gate's boss: lose to the timer and he holds back until Challenged; win and the journey is paid once
  const boss = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.up = {}; w.auto = true; w.paid = []; sc.startStage(10);
    for (let i = 0; i < 30 * 32; i++) sc.tick(1 / 30);
    const lost = { stage: w.stage, auto: w.auto };
    sc.challenge();
    w.up = { attack: 400, health: 300 }; sc.startStage(10);
    const silver0 = sc.save.silver;
    for (let i = 0; i < 30 * 20 && w.stage === 10; i++) sc.tick(1 / 30);
    const won = { stage: w.stage, silver: sc.save.silver - silver0, cape: (sc.save.store?.capes ?? []).includes('midnight') };
    sc.startStage(10); for (let i = 0; i < 30 * 20 && w.stage === 10; i++) sc.tick(1 / 30);
    return { lost, won, again: sc.save.silver - silver0 };
  });
  assert.ok(boss.lost.stage === 9 && !boss.lost.auto, `the boss holds the gate when time runs out: back a stage, holding (${JSON.stringify(boss.lost)})`);
  assert.ok(boss.won.stage === 11 && boss.won.silver === 25 && boss.again === 25, `Gate 1's first fall pays the journey 25 silver, once (${JSON.stringify(boss)})`);

  // ---- each gate is a new place (the CC0 scenes): its layers, its foes and its holder; Gate 1's fall won a blade
  const places = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w, seen = [];
    for (const g of [1, 2, 3, 5]) {
      sc.startStage(g * 10 - 9);
      for (let i = 0; i < 30 * 3; i++) sc.tick(1 / 30);
      seen.push({ layers: sc.layers.map((l) => l.ts.texture.key), foes: [...new Set(sc.foes.filter((f) => f.alive).map((f) => f.id))], tex: [...new Set(sc.foes.filter((f) => f.alive).map((f) => f.img.texture.key))] });
    }
    sc.startStage(10);
    const shade = sc.foes.find((f) => f.alive && f.boss)?.img.texture.key;
    return { seen, shade, won: w.paid.includes(1) };
  });
  assert.deepEqual(places.seen.map((p) => p.layers[0]), ['cc0-cemetery-sky', 'cc0-wood-back', 'cc0-swamp-sky', 'cc0-church-wall'], `every ten stages the scenery changes (${JSON.stringify(places.seen.map((p) => p.layers))})`);
  assert.ok(places.seen[0].tex.includes('foes-gothic') && places.seen.every((p) => p.foes.length > 0), `the new foes walk in (${JSON.stringify(places.seen)})`);
  assert.equal(places.shade, 'watch-demon', 'the winged demon holds the graves\' gate');
  const arm = await E(page, () => {
    const sc = window.__remnant.watch, before = sc.keys.base;
    sc.wield(0);
    return { key: sc.keys.base, before, blade: sc.w.blade, locked: (sc.wield(5), sc.w.blade) };
  });
  assert.ok(arm.key.endsWith('-blade0') && arm.before !== arm.key && arm.blade === 0 && arm.locked === 0, `Gate 1's blade is won, wielded and drawn in his hand; a locked one is not (${JSON.stringify(arm)})`);
  await E(page, () => { const sc = window.__remnant.watch; sc.wield(-1); });

  // ---- his levels open the skills, the shadows and the Mantle
  const powers = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.level = 26; w.gauge = 100; w.up = { attack: 200, health: 200 }; sc.startStage(12);
    sc.transformNow();
    const mantle = sc.mantleT > 0;
    for (let i = 0; i < 30 * 5; i++) sc.tick(1 / 30);
    return { mantle, shadows: sc.band.members.length };
  });
  assert.ok(powers.mantle && powers.shadows === 0, `at level 26 the Mantle can be taken up, and no shadow stands with him unearned (${JSON.stringify(powers)})`);

  // ---- shadows: major foes leave essence; essence raises and levels the main game's Echoes; a team in their roles
  const sh = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w, out = {};
    w.up = { attack: 400, health: 300 }; w.essence = {};
    sc.startStage(25);
    for (let i = 0; i < 30 * 20 && !sc.foes.some((f) => f.alive && f.elite); i++) sc.tick(1 / 30);
    const elite = sc.foes.find((f) => f.alive && f.elite);
    out.elite = !!elite && elite.max > sc.foes.find((f) => f.alive && !f.elite)?.max * 3;
    const before = { ...w.essence };
    if (elite) { sc.damage(elite, 1e12, true, false); }
    out.eliteEssence = Object.values(w.essence).reduce((a, b) => a + b, 0) - Object.values(before).reduce((a, b) => a + b, 0);
    out.early = sc.raiseShadow('sentinel');
    sc.gainEssence('sentinel', 9); sc.gainEssence('archer', 5); sc.gainEssence('knight', 5);
    out.raised = [sc.raiseShadow('sentinel'), sc.raiseShadow('archer'), sc.raiseShadow('knight')];
    out.team = [...w.team];
    out.levelled = sc.raiseShadow('sentinel') && w.shadows.sentinel.lv === 2;
    sc.toggleTeam('knight');
    out.full = [...w.team];
    sc.setShadowRole('archer', 'mage');
    out.roles = sc.band.members.map((m) => `${m.id}:${m.role}`);
    out.aegis = sc.band.aegis();
    // A gate's holder leaves three of its own essence and one of the Marshal's.
    const m0 = w.essence.marshal ?? 0; sc.startStage(30);
    for (let i = 0; i < 30 * 20 && sc.w.stage === 30; i++) sc.tick(1 / 30);
    out.marshal = (w.essence.marshal ?? 0) - m0;
    return out;
  });
  assert.ok(sh.elite && sh.eliteEssence === 1, `a gold elite is tougher and leaves one essence (${JSON.stringify(sh)})`);
  assert.ok(!sh.early && sh.raised.every(Boolean) && sh.levelled, `essence raises a shadow and levels it (${JSON.stringify(sh)})`);
  assert.ok(sh.team.join() === 'sentinel,archer' && sh.full.join() === 'sentinel,archer', `the team holds as many as his slots (two at 26) (${JSON.stringify(sh)})`);
  assert.ok(sh.roles.join() === 'sentinel:guardian,archer:mage' && sh.aegis > 0, `roles from the main game; a guardian takes a share of his blows (${JSON.stringify(sh)})`);
  assert.equal(sh.marshal, 1, 'a gate\'s holder leaves a measure of the Marshal\'s essence');
  await page.click('[data-k=wt_tab_shadows]');
  await page.waitForSelector('[data-k=wt_raise_locust]');
  await page.screenshot({ path: 'qa/watch-shadows.png' });

  // ---- movement: on a rush stage he runs and cuts through; on a holding stage he stands and they come to him
  const tempo = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.up = { attack: 200, health: 200 };
    sc.startStage(12);
    for (let i = 0; i < 30 * 2; i++) sc.tick(1 / 30);
    const rush = { running: sc.running, hx: Math.round(sc.hx), clip: sc.hero.frame.name.split(':')[0], kills: sc.kills };
    sc.startStage(13);
    for (let i = 0; i < 30 * 2; i++) sc.tick(1 / 30);
    return { rush, hold: { running: sc.running } };
  });
  assert.ok(tempo.rush.running && tempo.rush.hx > 100 && !tempo.hold.running, `rush stages run, holding stages stand (${JSON.stringify(tempo)})`);

  // ---- the speed: ×2 from the start, ×3 at Watch level 40
  const speed = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w, out = {};
    sc.setSpeed(2); out.two = w.speed;
    sc.setSpeed(3); out.threeEarly = w.speed;
    w.level = 40; sc.setSpeed(3); out.three = w.speed;
    sc.setSpeed(1);
    return out;
  });
  assert.deepEqual(speed, { two: 2, threeEarly: 2, three: 3 }, 'the wall runs at ×2, and at ×3 from level 40');

  // ---- abilities: learned and levelled with coins, taken into the fight, used by themselves or tapped
  const skills = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.level = 26; w.coins = 1e7; w.skills = {}; w.loadout = []; sc.abilT = {};
    const early = sc.buySkill('comet');
    const learned = ['strike', 'phantom', 'storm'].map((id) => sc.buySkill(id));
    const up = sc.buySkill('phantom');
    sc.toggleSkill('storm'); sc.toggleSkill('pillar');
    return { early, learned, phantom: w.skills.phantom, loadout: [...w.loadout] };
  });
  assert.ok(!skills.early && skills.learned.every(Boolean) && skills.phantom === 2 && skills.loadout.join() === 'strike,phantom', `abilities open by level, cost coins, level up and fill the slots (${JSON.stringify(skills)})`);
  await page.click('[data-k=wt_tab_skills]');
  await page.waitForSelector('[data-k=wt_buy_storm]');
  // Phantom Step, tapped: a slowed, staged cut through every foe on the road.
  const cine = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.up = { attack: 60, health: 300 }; w.autoSkills = false; sc.startStage(15);
    for (let i = 0; i < 30 * 3; i++) sc.tick(1 / 30);
    sc.abilT = {};
    const before = sc.foes.filter((f) => f.alive).map((f) => f.hp);
    // The furthest foe (cut last) shows the world's pace while the combo plays.
    const far = sc.foes.filter((f) => f.alive).sort((a, b) => b.x - a.x)[0], x0 = far.x;
    const ok = sc.cast('phantom', true), during = !!sc.cine;
    for (let i = 0; i < 12; i++) sc.tick(1 / 30);
    const moved = far.alive ? Math.abs(far.x - x0) : 0;
    for (let i = 0; i < 30 * 4; i++) sc.tick(1 / 30);
    const call = document.querySelector('.wt-call');
    return { ok, during, moved, after: !!sc.cine, hit: before.length, hx: Math.round(sc.hx), call: call?.textContent, lit: call?.classList.contains('on') };
  });
  assert.ok(cine.ok && cine.during && !cine.after && cine.moved < 8, `Phantom Step plays slowed and ends back at his post (${JSON.stringify(cine)})`);
  assert.ok(cine.call === 'PHANTOM STEP' && cine.lit, `an ability's name is called over the wall (${JSON.stringify(cine)})`);
  await page.click('[data-k=wt_cast_strike]');
  await E(page, () => { window.__remnant.watch.w.autoSkills = true; });

  // ---- the Ascension: Seals for a run past stage 60, the level kept
  const asc = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w;
    w.best = 70; const level = w.level;
    sc.ascend();
    return { stage: w.stage, seals: w.seals, up: Object.keys(w.up).length, level: w.level === level };
  });
  assert.ok(asc.stage === 1 && asc.seals === 9 && asc.up === 0 && asc.level, `Ascending from stage 70 gives 9 Seals, resets the run and keeps his level (${JSON.stringify(asc)})`);

  // ---- away, the wall goes on at half speed: set beside the live wall over the same time, it climbs about as far
  const pace = await E(page, () => {
    const sc = window.__remnant.watch, w = sc.w, snap = JSON.parse(JSON.stringify(w));
    Object.assign(w, { level: 12, xp: 0, up: { attack: 40, health: 40, speed: 20 }, coins: 0, auto: true });
    sc.startStage(15);
    const sim = sc.awayReport(240 / 0.5);
    for (let i = 0; i < 30 * 240; i++) sc.tick(1 / 30);
    const live = { to: w.stage, coins: w.coins };
    const day = sc.awayReport(30 * 3600);
    Object.assign(w, snap); sc.startStage(w.stage);
    return { live, sim: { to: sim.to, coins: sim.coins, level: sim.level }, capped: day.secs };
  });
  const climbed = (pace.sim.to - 15) / Math.max(1, pace.live.to - 15);
  assert.ok(climbed > 0.6 && climbed < 1.3 && pace.sim.coins > pace.live.coins * 0.4 && pace.sim.coins < pace.live.coins * 1.3,
    `four minutes away at half pace match about two live minutes' climb and pay (${JSON.stringify(pace)})`);
  assert.equal(pace.capped, 12 * 3600, 'the Watch counts twelve hours away at most');

  // ---- away for three hours: he climbed, levelled and earned while gone; everything survived the reload
  // (Leaving the page saves the Watch as seen now, so the three hours are set as the next page starts.)
  await E(page, () => { const sc = window.__remnant.watch; sc.w.coins = 0; sc.w.auto = true; sc.w.up = { attack: 60, health: 60, speed: 30 }; sc.startStage(1); sc.persist(); });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('watch-away')) return;
    sessionStorage.setItem('watch-away', '1');
    const raw = JSON.parse(localStorage.getItem('remnant-phaser.save.v2'));
    raw.watch.last = Date.now() - 3 * 3600 * 1000;
    // An older watch, from before shadows were earned: it keeps as many as its level gave it.
    delete raw.watch.shadows; delete raw.watch.team;
    localStorage.setItem('remnant-phaser.save.v2', JSON.stringify(raw));
  });
  await page.goto(base + '?debug');
  await enter();
  await page.waitForSelector('[data-k=wt_collect]', { timeout: 10000 });
  await page.screenshot({ path: 'qa/watch-welcome.png' });
  const card = await E(page, () => document.querySelector('.wt-away')?.textContent ?? '');
  await page.click('[data-k=wt_collect]');
  const back = await E(page, () => { const w = window.__remnant.watch.w; return { coins: w.coins, stage: w.stage, seals: w.seals, level: w.level, essence: Object.values(w.essence ?? {}).reduce((a, b) => a + b, 0), team: (w.team ?? []).join() }; });
  assert.ok(back.stage > 20 && back.coins > 1000 && back.level >= 26 && back.seals === 9 && /Stages.*1 →.*Foes felled/.test(card),
    `three hours away: he climbed from stage 1, earned and levelled, and the card says so; the Watch was kept (${JSON.stringify({ ...back, card })})`);
  assert.equal(back.team, 'sentinel,knight', 'an older watch keeps the shadows its level gave it, raised and beside him');
  await page.screenshot({ path: 'qa/watch.png' });
  // Big numbers round before they pick their suffix: 999,950 reads 1.00M, never "1000K" (the idle-economy skill's rollover).
  const shownAs = await E(page, () => {
    const sc = window.__remnant.watch, out = {};
    for (const n of [9999, 99950, 999950, 999.9e6, 1234]) { sc.w.coins = n; sc.ui.refresh(); out[n] = document.querySelector('.wt-coins').textContent; }
    return out;
  });
  assert.deepEqual(shownAs, { 1234: '1.23K', 9999: '10.0K', 99950: '100K', 999950: '1.00M', 999900000: '1.00B' }, `big numbers round before they take a suffix (${JSON.stringify(shownAs)})`);

  // A save cut short gives way to the one before it; damaged numbers are repaired, never refused (the save-systems skill).
  {
    const KEY = 'remnant-phaser.save.v2';
    const before = await E(page, (KEY) => {
      const sc = window.__remnant.watch;
      sc.w.coins = 4321; sc.persist(); sc.w.coins = 4322; sc.persist();
      return { level: sc.w.level, bak: !!localStorage.getItem(KEY + '.bak') };
    }, KEY);
    assert.ok(before.bak, 'each write keeps the save it replaces as the backup');
    await page.evaluate((KEY) => { window.__remnant.watch.persist = () => {}; localStorage.setItem(KEY, localStorage.getItem(KEY).slice(0, 200)); }, KEY);
    await page.goto(base + '?debug');
    await enter();
    const back = await E(page, (KEY) => { const w = window.__remnant.watch.w; let ok = false; try { ok = JSON.parse(localStorage.getItem(KEY)).version === 1; } catch {} return { coins: w.coins, level: w.level, healed: ok }; }, KEY);
    assert.ok(back.coins === 4321 && back.level === before.level && back.healed, `a save cut short loads its backup and is written back whole (${JSON.stringify(back)})`);
    await page.evaluate((KEY) => { window.__remnant.watch.persist = () => {}; const d = JSON.parse(localStorage.getItem(KEY)); Object.assign(d.watch, { coins: null, level: -4, xp: 'x' }); d.silver = null; localStorage.setItem(KEY, JSON.stringify(d)); }, KEY);
    await page.goto(base + '?debug');
    await enter();
    const fixed = await E(page, () => { const sc = window.__remnant.watch; return { coins: sc.w.coins, level: sc.w.level, xp: sc.w.xp, silver: sc.save.silver }; });
    assert.deepEqual(fixed, { coins: 0, level: 1, xp: 0, silver: 0 }, `damaged numbers are repaired on load (${JSON.stringify(fixed)})`);
  }

  // An installed iPhone app whose window comes up 59 px short of its screen (the status bar) yet draws from the top:
  // the game and the Watch's panel reach the true foot of the screen, not the short window's.
  {
    const short = await browser.newContext({ viewport: { width: 393, height: 793 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await short.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    const p2 = await short.newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(base + '?debug');
    await p2.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title'), null, { timeout: 60000 });
    await p2.click('[data-k=title_watch]');
    await p2.waitForFunction(() => window.__remnant?.watch?.w, null, { timeout: 30000 });
    await p2.waitForTimeout(500);
    const foot = await p2.evaluate(() => ({ canvas: document.querySelector('canvas').getBoundingClientRect().height, tabs: document.querySelector('.wt-tabs').getBoundingClientRect().bottom }));
    assert.ok(Math.abs(foot.canvas - 852) < 1 && Math.abs(foot.tabs - 852) < 1, `a short installed-app window: the game and the tabs reach the screen's foot (${JSON.stringify(foot)})`);
    await short.close();
  }
  console.log(`Watch: a fresh Elior; ${fight.stage - 1} stages in 2½ minutes; the boss's timer; Gate 1 paid once; the Mantle at 26; shadows raised with essence; Ascension for 9 Seals; stage ${back.stage} and ${back.coins} coins after 3 h away; new scenery each gate; the demon at Gate 1; its blade wielded; rush and holding stages; ×2 and ×3; abilities learned, levelled, staged and called; the wall under the bar, the bar under the island, the tabs at the screen's foot; numbers that round before their suffix; a save cut short restored from its backup`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser watch: all checks passed');
} finally {
  await browser.close();
  close();
}
