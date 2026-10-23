// The difficulty curve (game/curve.ts) and first-time flow: a straight-through
// run reaches each chapter's table level, the table drives foe and boss
// numbers, catch-up XP only helps players below the curve, a balanced
// character at the arrival level beats the VII–IX bosses on Hard, and the
// sectioned pause menu, coaching cards and stat tips work at phone size.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { build } from 'esbuild';

// ---------------------------------------------------------------- straight-through levels (no browser)
const bundle = async (entry) => {
  const r = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
};
const { ROOMS, chapterOf } = await bundle('src/game/rooms.ts');
const C = await bundle('src/game/curve.ts');
const src = (f) => readFileSync('src/game/' + f + '.ts', 'utf8');
const FOE_XP = Object.fromEntries([...src('enemies').matchAll(/^\s+(\w+): \{ hp: \d+, dmg: \d+, poise: \d+, xp: (\d+)/gm)].map(m => [m[1], +m[2]]));
// Quest and boss rewards written as literals in each chapter's story.
const storyXp = (f) => [...src(f).matchAll(/giveXp\((\d+)\)|bossReward\([^,]+,[^,]+, (\d+)/g)].reduce((a, m) => a + +(m[1] ?? m[2]), 0);
const STORY = [0, storyXp('story'), storyXp('story2'), storyXp('story3'), storyXp('story4'), storyXp('story5'), storyXp('story6')];
const xpToNext = lv => (lv <= 30 ? Math.round(30 * Math.pow(lv, 1.55) + 6) : Math.round(30 * Math.pow(30, 1.55) + 6) + (lv - 30) * 60);
const chapters = C.CURVE.length - 1;
function straightThrough() {
  let level = 1, xp = 0;
  const arrive = [];
  const give = (n, ch) => { xp += Math.round(n * C.catchUpXp(level, ch)); while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; } };
  for (let ch = 1; ch <= chapters; ch++) {
    arrive[ch] = level + xp / xpToNext(level);
    // Every room's foes once, plus ~30% for ambush waves and doubling back.
    for (const [id, r] of Object.entries(ROOMS)) if (id !== 'trial_arena' && chapterOf(id) === ch)
      for (const e of r.ents ?? []) if (e.t === 'enemy') give(1.3 * FOE_XP[e.k] * (e.elite ? 4 : 1) * C.chapterCurve(ch).xp, ch);
    if (ch <= 6) give(STORY[ch], ch); else { give(2500, ch); give(C.chapterCurve(ch).clearXp, ch); }
  }
  return arrive;
}
const arrive = straightThrough();
for (let ch = 1; ch <= chapters; ch++) {
  const want = C.chapterCurve(ch).level;
  assert.ok(Math.abs(arrive[ch] - want) <= 1.5, `Chapter ${ch}: straight-through arrival ${arrive[ch].toFixed(1)} vs table ${want}`);
}
assert.equal(C.catchUpXp(C.chapterCurve(7).level, 7), 1, 'no bonus at the arrival level');
assert.equal(C.catchUpXp(60, 7), 1, 'no bonus above it');
assert.ok(C.catchUpXp(30, 7) > 1 && C.catchUpXp(1, 9) <= 3, 'bonus below, capped at ×3');
console.log('Straight-through arrival levels match the curve table:', arrive.slice(1).map((l, i) => `${i + 1}:${l.toFixed(1)}/${C.chapterCurve(i + 1).level}`).join(' '));

// ---------------------------------------------------------------- browser
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
const PHONE = { viewport: { width: 956, height: 440 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** A saved journey past the opening, loaded from slot 2 (so no opening dialogue). */
async function boot(context, query = '?debug', seed = 0) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  // Fights are replayed with a fixed random seed so the result does not wobble between runs.
  if (seed) await page.addInitScript((s) => { let a = s; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }, seed);
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = true;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + query);
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  return page;
}

try {
  // ---------------------------------------------------------------- the table drives the numbers
  {
    const page = await boot(await browser.newContext(PHONE));
    const out = await page.evaluate(() => {
      const { G } = window.__remnant, W = G.world, s = G.save;
      G.ui.dialogue = async () => 0;
      const rooms = { 7: ['riftwood_trail', 'hunt_throne'], 8: ['greenfall_marsh', 'plague_throne'], 9: ['slag_procession', 'cinder_throne'], 10: ['shattered_colonnade', 'grecia_throne'] };
      const res = {};
      for (const [n, [trail, arena]] of Object.entries(rooms)) {
        W.load(trail, 'left');
        const foe = W.ents.find(e => e.isFoe && e.stats && !e.elite);
        W.load(arena, 'left');
        res[n] = { foeHp: foe ? foe.maxHp / foe.stats.hp : null, foeDmg: foe ? foe.dmg / foe.stats.dmg : null, boss: W.boss ? W.boss.maxHp : null };
      }
      // Boss health never follows the player's level.
      W.load('plague_throne', 'left'); const hp = W.boss.maxHp; s.level = 150; W.load('plague_throne', 'left');
      res.fixed = W.boss.maxHp === hp;
      s.level = 1; W.load('thaw_outpost', 'altar');
      return res;
    });
    for (const n of [7, 8, 9, 10]) {
      const c = C.chapterCurve(n), r = out[n];
      if (r.foeHp !== null) { assert.ok(Math.abs(r.foeHp - c.foeHp) < 0.01, `Ch ${n} foe health ×${r.foeHp}`); assert.ok(Math.abs(r.foeDmg - c.foeDmg) < 0.01, `Ch ${n} foe damage ×${r.foeDmg}`); }
      if (r.boss !== null && c.bossHp && n <= 9) assert.equal(r.boss, Math.round(c.bossHp * 1.3), `Ch ${n} boss health on Hard`);
    }
    assert.ok(out.fixed, 'boss health independent of level');
    // Chapter select shows the table's arrival levels.
    await page.evaluate(() => { const { G } = window.__remnant; G.save.flags.ch6_done = G.save.flags.ch7_intro = true; G.ui.openMenu('chapters'); });
    assert.match(await page.locator('[data-k=ch_7]').locator('xpath=..').innerText(), new RegExp(`level ${C.chapterCurve(7).level}\\+`));
    await page.keyboard.press('Escape');
    // Catch-up XP: only below the chapter's arrival level, never in the Trial.
    const xp = await page.evaluate((intended) => {
      const { G } = window.__remnant, W = G.world, s = G.save;
      const gain = (level, room) => { W.load(room, room === 'trial_arena' ? 'start' : 'left'); s.level = level; s.xp = 0; W.giveXp(1000); return s.level > level ? -1 : s.xp; };
      return { below: gain(intended - 8, 'riftwood_trail'), at: gain(intended, 'riftwood_trail'), above: gain(intended + 20, 'riftwood_trail'), trial: gain(intended - 8, 'trial_arena') };
    }, C.chapterCurve(7).level);
    assert.equal(xp.below, 3000, 'eight levels behind: ×3');
    assert.equal(xp.at, 1000); assert.equal(xp.above, 1000); assert.equal(xp.trial, 1000, 'the Trial pays by its own rules');
    console.log('Curve drives foes, bosses and chapter select; catch-up XP', xp);
    await page.context().close();
  }

  // ---------------------------------------------------------------- the VII–IX bosses on Hard at the arrival level
  {
    const page = await boot(await browser.newContext({ viewport: { width: 956, height: 440 } }), '?debug', 7);
    await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
    await page.locator('[data-k=bdhard]').click();
    await page.keyboard.press('Escape');
    const FIGHT = async ({ n, lv, room, trig }) => {
      const a = window.__remnant, { G, input } = a, W = G.world, s = G.save;
      G.ui.dialogue = async () => 0; G.ui.lore = async () => {}; G.ui.itemGet = () => {};
      // A balanced build: every point spread evenly, the Chapter VI blade, no Echoes, skills or Mantle.
      Object.assign(s, { level: lv, statPoints: 0, skillPoints: 0, stats: { vit: 5, str: 5, agi: 5, end: 5, res: 5, wis: 5 }, ng: 0, balm: 3, balmMax: 3, active: [], mantle: 0 });
      const per = Math.floor((lv - 1) * 3 / 6); for (const k in s.stats) s.stats[k] += per;
      a.give('twentyfirst_day'); s.equipment.weapon = s.inventory.at(-1).uid;
      s.flags['ch' + n + '_intro'] = s.flags['ch' + n + '_boundary_open'] = true;
      W.load(room, 'left'); G.save.hp = G.d.maxHp;
      W.story.onTrigger(trig);
      for (let i = 0; i < 50 && W.boss.state === 'dormant'; i++) await new Promise(r => setTimeout(r, 20));
      G.paused = true;
      const STEP = 1 / 120, step = () => { input.poll(); input.beginStep(); W.update(STEP); input.endStep(); };
      const b = W.boss, p = W.player;
      for (let i = 0; i < 1200 && (b.state === 'dormant' || b.state === 'intro' || G.inCutscene); i++) step();
      s.hp = G.d.maxHp;
      let t = 0, lastAtk = -1, avoid = false, dead = false, minHp = 1, atkT = 0, healCd = 0;
      input.releaseAll();
      while (!b.dying && t < 300) {
        // A fair player: dodges or parries every other attack and learns the marked hazards.
        if (b.state === 'attack' && b.attackCount !== lastAtk) { lastAtk = b.attackCount; avoid = lastAtk % 2 === 0; }
        if (b.state !== 'attack') avoid = false;
        if (avoid) p.invuln = Math.max(p.invuln, STEP * 2);
        let goal = b.x;
        if (b.adds) for (const ad of b.adds) if (!ad.remove && !ad.dying) { goal = ad.x; break; }
        if (b.attack === 'purge' && b.ward) goal = b.beaconX;
        const away = (x, r) => { if (Math.abs(p.x - x) < r) goal = x + (p.x < x ? -r - 30 : r + 30); };
        if (b.spores) for (const z of b.spores) if (z.t < 3.9) away(z.x, 52);
        if (b.attack === 'hunt' && b.ward) away(b.targetX, 75);
        if (b.faults) for (const f of b.faults) away(f.x, 62);
        let jump = false;
        if (b.waves) for (const w of b.waves) if (!w.remove && Math.abs(w.x - p.x) < 46 && Math.sign(w.face) === Math.sign(p.x - w.x)) jump = true;
        const dx = goal - p.x, far = Math.abs(dx) > (b.attack === 'purge' && b.ward ? 20 : 36);
        input.setTouchAxis(far ? Math.sign(dx) : 0, 0);
        if (!far && Math.abs(dx) > 2) p.face = Math.sign(dx);
        atkT -= STEP; healCd -= STEP;
        const swing = !far && atkT <= 0 && !(b.attack === 'purge' && b.ward);
        if (swing) atkT = 0.13;
        const heal = s.hp < G.d.maxHp * 0.35 && s.balm > 0 && healCd <= 0;
        if (heal) healCd = 2;
        input.setTouch('attack', swing); input.setTouch('heal', heal); input.setTouch('jump', jump && p.body.onGround);
        step(); t += STEP;
        minHp = Math.min(minHp, s.hp / G.d.maxHp);
        if (p.state === 'dead' || s.hp <= 0) { dead = true; break; }
        input.setTouch('attack', false); input.setTouch('heal', false); input.setTouch('jump', false);
      }
      input.releaseAll(); G.paused = false;
      return { boss: b.name, hp: b.maxHp, killed: !!b.dying, dead, time: +t.toFixed(1), minHp: +minHp.toFixed(2), level: s.level };
    };
    for (const [n, room, trig] of [[7, 'hunt_throne', 'beast_monarch_start'], [8, 'plague_throne', 'plague_monarch_start'], [9, 'cinder_throne', 'cinder_monarch_start']]) {
      const r = await page.evaluate(FIGHT, { n, lv: C.chapterCurve(n).level, room, trig });
      assert.ok(r.killed && !r.dead, `${r.boss} must fall on Hard at level ${r.level}: ${JSON.stringify(r)}`);
      assert.ok(r.time < 240, `${r.boss} took ${r.time}s`);
      console.log(`Hard · level ${r.level} · ${r.boss}: ${r.hp} health, won in ${r.time}s of play, lowest health ${Math.round(r.minHp * 100)}%`);
      await page.evaluate(() => { const { G } = window.__remnant; G.inCutscene = false; for (const l of document.querySelectorAll('.layer')) l.remove(); });
    }
    await page.context().close();
  }

  // ---------------------------------------------------------------- the sectioned pause menu at phone size
  {
    const page = await boot(await browser.newContext(PHONE));
    await page.evaluate(() => window.__remnant.G.ui.openMenu('character'));
    const sections = { journey: ['quests', 'map', 'chapters'], elior: ['character', 'equipment', 'skills', 'progression', 'moves', 'crafting'], echoes: ['echoes', 'imprints'], collection: ['lore', 'bestiary'], settings: ['settings', 'system'] };
    assert.equal(await page.locator('.menu-rail .sec').count(), 5);
    for (const [sec, tabs] of Object.entries(sections)) {
      await page.locator(`[data-k=sec_${sec}]`).tap();
      const box = await page.locator(`[data-k=sec_${sec}]`).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 60, `section ${sec} is a large touch target (${box.width}×${box.height})`);
      assert.deepEqual(await page.locator('.menu-top .tab').evaluateAll(els => els.map(e => e.dataset.k.slice(4))), tabs);
      for (const t of tabs) {
        await page.locator(`[data-k=tab_${t}]`).tap();
        assert.equal(await page.locator(`[data-k=tab_${t}]`).getAttribute('aria-selected'), 'true');
        const b = await page.locator(`[data-k=tab_${t}]`).boundingBox();
        assert.ok(b.height >= 38 && b.x + b.width <= 956, `sub-tab ${t} fits and is tappable`);
        assert.ok(await page.locator('.menu-body > *').count() > 0, `${t} renders`);
      }
    }
    // A section remembers its sub-tab; old page names still work.
    await page.locator('[data-k=sec_elior]').tap();
    assert.equal(await page.locator('[data-k=tab_crafting]').getAttribute('aria-selected'), 'true');
    await page.evaluate(() => window.__remnant.G.ui.openMenu('journal'));
    assert.equal(await page.locator('[data-k=tab_quests]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    await page.evaluate(() => window.__remnant.G.ui.openMenu('character'));
    await page.screenshot({ path: 'qa/menu-sections-phone.png' });
    await page.evaluate(() => window.__remnant.G.ui.openMenu('moves'));
    assert.match(await page.locator('.menu-body').innerText(), /techniques/i);
    console.log('Five sections with sub-tabs at 956×440, large targets, remembered sub-tabs and old page names');

    // ---------------------------------------------------------------- stat tips: hover, tap, long-press, current vs new
    await page.evaluate(() => { const a = window.__remnant; a.give('twentyfirst_day'); a.G.ui.openMenu('equipment'); });
    await page.locator('[data-k=slot_weapon]').tap();
    await page.locator('[data-k^=it_]').last().tap();
    assert.match(await page.locator('[data-k=if_equipped]').innerText(), /Attack power[\s\S]*→/);
    await page.locator('[data-k=mtip_atk]').first().tap();
    assert.match(await page.locator('[data-k=stat_tip]').innerText(), /Base power of every weapon strike/);
    await page.screenshot({ path: 'qa/stat-tip-equipment-phone.png' });
    await page.evaluate(() => { const { G } = window.__remnant; G.save.statPoints = 3; G.ui.openMenu('character'); });
    await page.locator('[data-k=dtip_4]').tap();
    assert.match(await page.locator('[data-k=stat_tip]').innerText(), /Base power of each weapon strike/);
    // A long-press on a stat explains it (current → next) without spending the point.
    const plus = await page.locator('[data-k=tip_str]').boundingBox();
    await page.touchscreen.tap(plus.x + 8, plus.y + 8);
    assert.match(await page.locator('[data-k=stat_tip]').innerText(), /Attack .*→/);
    const sp = page.locator('[data-k=st_str]'), r = await sp.boundingBox();
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y), o = { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, pointerId: 9 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      return new Promise(res => setTimeout(() => { el.dispatchEvent(new PointerEvent('pointerup', o)); el.click(); res(); }, 600));
    }, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
    assert.equal(await page.evaluate(() => window.__remnant.G.save.statPoints), 3, 'long-press does not spend');
    assert.match(await page.locator('[data-k=stat_tip]').innerText(), /Strength/);
    await sp.tap();
    assert.equal(await page.evaluate(() => window.__remnant.G.save.statPoints), 2, 'a plain tap still spends');
    console.log('Stat tips on gear and the character sheet, If-equipped comparison, long-press explains without spending');
    await page.context().close();
  }

  // ---------------------------------------------------------------- coaching cards
  {
    const context = await browser.newContext(PHONE);
    const page = await boot(context, '?debug&coach');
    const spawn = () => page.evaluate(() => { const a = window.__remnant; a.G.inCutscene = false; return !!a.spawn('husk', a.G.world.player.x + 70); });
    await spawn();
    await page.locator('[data-k=coach_combo]').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('#touch .tc.coach-hl').getAttribute('aria-label'), 'Attack', 'the real Attack button is lit');
    await page.screenshot({ path: 'qa/coach-card-phone.png' });
    // Try it: real presses of the touch Attack button until three blows land.
    await page.evaluate(async () => {
      const { G, input } = window.__remnant, p = G.world.player;
      for (let i = 0; i < 80 && !(G.save.coached.combo === 2); i++) {
        // A sturdy practice foe that stays in reach, so three blows can land in a row.
        const foe = G.world.ents.find(e => e.isFoe && !e.dying) ?? window.__remnant.spawn('husk', p.x + 40);
        foe.maxHp = foe.hp = 99999; p.face = Math.sign(foe.x - p.x) || 1; if (Math.abs(foe.x - p.x) > 30) p.x = foe.x - p.face * 26;
        input.setTouch('attack', true); await new Promise(r => setTimeout(r, 60)); input.setTouch('attack', false); await new Promise(r => setTimeout(r, 90));
      }
    });
    await page.waitForFunction(() => window.__remnant.G.save.coached.combo === 2 && !document.querySelector('[data-k=coach_combo]'), null, { timeout: 8000 });
    // The next lesson comes when it matters; Skip ends it for good.
    await page.locator('[data-k=coach_dodge]').waitFor({ timeout: 10000 });
    await page.locator('[data-k=coach_skip]').tap();
    assert.equal(await page.evaluate(() => window.__remnant.G.save.coached.dodge), 1);
    assert.equal(await page.locator('.coach').count(), 0);
    // Never twice: after a reload (saved journey), neither card returns.
    await page.evaluate(() => { const { G } = window.__remnant; G.world.autosave(true); });
    await page.goto(base + '?debug&coach'); await page.waitForFunction(() => !!window.__remnant);
    await page.evaluate(() => window.__remnant.load(2)); await page.waitForFunction(() => window.__remnant.G.world.player.style);
    await spawn();
    await page.waitForTimeout(6500);
    const seen = await page.evaluate(() => document.querySelector('.coach')?.dataset.k ?? null);
    assert.ok(seen !== 'coach_combo' && seen !== 'coach_dodge', `no repeat (${seen})`);
    assert.deepEqual(await page.evaluate(() => ({ combo: window.__remnant.G.save.coached.combo, dodge: window.__remnant.G.save.coached.dodge })), { combo: 2, dodge: 1 });
    // Settings → Replay tutorials arms them again; the toggle silences them.
    await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
    await page.locator('[data-k=coach_replay]').scrollIntoViewIfNeeded();
    await page.locator('[data-k=coach_replay]').tap();
    assert.deepEqual(await page.evaluate(() => window.__remnant.G.save.coached), {});
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__remnant.G.ui.closeMenu?.());
    await spawn();
    await page.locator('[data-k=coach_combo]').waitFor({ timeout: 10000 });
    await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
    await page.locator('[data-k=coachoff]').scrollIntoViewIfNeeded();
    await page.locator('[data-k=coachoff]').tap();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.coach').count(), 0, 'tips off');
    // The Echo lesson: summon, then an order from the wheel.
    await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
    await page.locator('[data-k=coachon]').tap();
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const { G } = window.__remnant; G.ui.closeMenu?.(); G.save.coached = { combo: 2, dodge: 1, parry: 1 }; for (const e of G.world.ents) if (e.isFoe) e.remove = true; window.__remnant.echo('sentinel'); });
    await page.locator('[data-k=coach_echo]').waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('.coach-steps .ok').length === 1);
    await page.evaluate(() => { const s = window.__remnant.G.save; s.echoes[0].order = 'hold'; });
    await page.waitForFunction(() => window.__remnant.G.save.coached.echo === 2, null, { timeout: 5000 });
    console.log('Coaching: shows with a lit button, completes when tried, Skip and reload never repeat, Replay re-arms, toggle silences, Echo steps');
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('curve-onboarding: all checks passed');
} finally {
  await browser.close();
  server.close();
}
