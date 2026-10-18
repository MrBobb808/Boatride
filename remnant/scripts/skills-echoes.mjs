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
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await boot(desktop);
  const migrated = await page.evaluate(() => ({ abilities: window.__remnant.G.save.abilities, slots: window.__remnant.G.save.equippedSkills, super: window.__remnant.G.save.equippedSuper, imprints: window.__remnant.G.save.echoImprints }));
  assert.equal(migrated.super, 'rally'); assert.deepEqual(migrated.slots, ['sword_word', 'trumpet', null]);
  for (const id of ['chain_snare', 'mending_light', 'blink_strike', 'frost_ring']) assert.ok(migrated.abilities.includes(id));
  assert.deepEqual(migrated.imprints, {});
  await page.evaluate(() => window.__remnant.G.ui.openMenu('skills'));
  assert.equal(await page.locator('.ability-card').count(), 12);
  await page.locator('[data-k=ab_blink_strike]').click();
  await page.locator('[data-k=ls_1]').click(); await page.locator('[data-k=ab_blink_strike]').click();
  assert.deepEqual(await page.evaluate(() => window.__remnant.G.save.equippedSkills), ['trumpet', 'blink_strike', null]);
  await page.locator('[data-k=ls_2]').click(); await page.locator('[data-k=ab_mending_light]').click();
  await page.locator('[data-k=learn_regen]').click(); await page.locator('[data-k=learn_regen]').click(); await page.locator('[data-k=learn_regen]').click();
  assert.ok(await page.locator('[data-k=learn_regen]').isDisabled());
  await page.screenshot({ path: 'qa/skills-catalog-desktop.png' });
  await page.locator('[data-k=skills_supers]').click();
  assert.equal(await page.locator('.ability-card').count(), 4);
  await page.locator('[data-k=super_tempest]').click();
  assert.equal(await page.evaluate(() => window.__remnant.G.save.equippedSuper), 'tempest');
  await page.screenshot({ path: 'qa/super-loadout-desktop.png' });
  await page.keyboard.press('Escape');
  console.log('Legacy save migration, 12-skill catalog, unique slot swapping, regeneration training and four-super selection passed');

  const combat = await page.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world, p = W.player, s = G.save;
    G.paused = true; G.inCutscene = false;
    s.flags.trial_mode = 'survival'; W.load('trial_arena', 'start'); W.story.ch3.rounds.stop(false);
    W.ents = []; W.echoes = []; W.boss = null; W.bossActive = false; W.hitstopT = W.slowT = 0;
    const reset = () => { p.state = 'free'; p.atk = null; p.x = 210; p.y = 288; p.face = 1; p.body.vx = p.body.vy = 0; p.body.onGround = true; p.invuln = p.shieldT = p.mantleT = p.lion = p.armorLight = p.mendT = 0; p.sinceHurt = 0; s.hp = G.d.maxHp * 0.4; s.ce = G.d.maxCe; p.cds = {}; };
    reset();
    const hp0 = s.hp;
    for (let i = 0; i < 468; i++) p.update(1 / 120);
    const noEarly = Math.abs(s.hp - hp0) < 0.01;
    for (let i = 0; i < 132; i++) p.update(1 / 120);
    const regenerated = s.hp > hp0 + G.d.maxHp * 0.01;
    p.takeHit({ dmg: 5, poise: 0, kx: 0, ky: 0, dir: 0, kind: 'hazard' });
    const resetByDamage = p.sinceHurt === 0;
    const damaged = s.hp;
    for (let i = 0; i < 240; i++) p.update(1 / 120);
    const pausedAfterHit = s.hp <= damaged + 0.01;
    p.state = 'dead'; s.hp = 0; p.update(1 / 120); const noResurrection = s.hp === 0;
    reset();
    const foe = a.spawn('brute', 370, 288); foe.hp = foe.maxHp = 1e7;
    const casts = {};
    for (const id of ['chain_snare', 'blink_strike', 'mending_light', 'frost_ring']) {
      reset(); foe.x = id === 'frost_ring' ? 300 : 370; foe.y = 288; foe.dying = false; foe.invuln = 0; foe.staggered = 0;
      const hp = foe.hp, energy = s.ce, ok = p.tryCast(id);
      for (let i = 0; i < 80; i++) p.update(1 / 120);
      const charged = energy - s.ce > 15, cooldown = p.cds[id] > 0, denied = !p.tryCast(id);
      casts[id] = { ok, charged, cooldown, denied, effect: id === 'mending_light' ? p.mendT > 0 : id === 'frost_ring' ? foe.chill > 0 : foe.hp < hp, blink: id !== 'blink_strike' || p.x > foe.x };
    }
    reset(); p.tryCast('mending_light');
    const beforeMend = s.hp;
    for (let i = 0; i < 780; i++) p.update(1 / 120);
    const activeHealing = s.hp > beforeMend + G.d.maxHp * 0.17;
    reset(); W.ents = [];
    const noTargetFree = !p.tryCast('blink_strike') && s.ce === G.d.maxCe;
    const supers = {};
    for (const id of ['rally', 'tempest', 'dawnfall', 'renewal']) {
      reset(); W.ents = []; W.hitstopT = W.slowT = 0; G.inCutscene = false;
      const f = a.spawn('brute', 350, 288); f.hp = f.maxHp = 1e7; f.aggro = false;
      s.equippedSuper = id; s.rally = 100;
      const hp = f.hp, self = s.hp, start = p.x;
      W.tryRally(); const consumed = s.rally === 0;
      for (let i = 0; i < 360 && W.rallyT >= 0; i++) W.update(1 / 120);
      supers[id] = { consumed, finished: W.rallyT === -1 && !G.inCutscene, damage: f.hp < hp, healing: s.hp > self + G.d.maxHp * 0.4, blink: p.x !== start };
    }
    reset(); W.ents = []; s.equippedSuper = 'tempest'; s.rally = 100; W.tryRally();
    const emptySuperFree = s.rally === 100 && W.rallyT < 0;
    return { noEarly, regenerated, resetByDamage, pausedAfterHit, noResurrection, casts, activeHealing, noTargetFree, supers, emptySuperFree };
  });
  for (const key of ['noEarly', 'regenerated', 'resetByDamage', 'pausedAfterHit', 'noResurrection', 'activeHealing', 'noTargetFree', 'emptySuperFree']) assert.ok(combat[key], key);
  for (const [id, cast] of Object.entries(combat.casts)) for (const [key, ok] of Object.entries(cast)) assert.ok(ok, id + ' ' + key);
  for (const [id, s] of Object.entries(combat.supers)) { assert.ok(s.consumed && s.finished, id + ' lifecycle'); assert.ok(id === 'renewal' ? s.healing : s.damage, id + ' effect'); if (id === 'tempest') assert.ok(s.blink); }
  console.log('Four real casts, Energy/cooldown checks, delayed regeneration, healing, no resurrection, and all four super lifecycles passed');

  const roles = await page.evaluate(() => {
    const a = window.__remnant, { G } = a, W = G.world, p = W.player, s = G.save;
    G.paused = true; G.inCutscene = false; W.boss = null; W.bossActive = false; W.story.ch3.rounds.stop(false);
    const result = {};
    for (const role of ['mage', 'ninja', 'fighter', 'guardian', 'herald', 'ranger']) {
      W.ents = []; W.echoes = []; s.echoes = []; s.active = []; s.echoMode = 'aggressive';
      a.echo('sentinel'); const u = W.echoes[0];
      u.inst.stage = 2; u.setRole(role); u.specialCd = u.attackCd = u.summonT = 0;
      u.x = 270; u.y = 288; u.body.onGround = true; u.hp = u.maxHp * 0.5;
      p.x = 210; p.y = 288; p.state = 'free'; p.shieldT = 0; s.hp = G.d.maxHp * 0.4; s.ce = 0;
      const f = a.spawn('husk', 330, 288); f.hp = f.maxHp = 1e7; f.aggro = false;
      const hp = s.hp; u.shots = 4;
      u.update(1 / 120);
      if (role === 'ranger') for (let i = 0; i < 70; i++) u.update(1 / 120);
      result[role] = { kinds: W.ents.map(e => e.kind ?? (e.owner === u && e.target === f ? 'mirage' : 'other')), damage: f.hp < f.maxHp, blink: u.x > f.x, shield: p.shieldT > 0, heal: s.hp > hp, energy: s.ce > 0, launched: f.body.vy < -200, cooldown: u.specialCd > 0 };
      if (role === 'mage' || role === 'ninja') {
        for (let i = 0; i < 120; i++) for (const e of W.ents) if (!e.isFoe && !e.remove) e.update(1 / 120);
        result[role].damage = f.hp < f.maxHp;
      }
    }
    W.ents = []; W.echoes = []; s.echoes = []; s.active = [];
    a.echo('knight'); const u = W.echoes[0]; u.inst.stage = 2; u.setRole('ninja'); u.specialCd = u.summonT = u.attackCd = 0; u.x = 270; u.y = 288; u.body.onGround = true;
    const wallFoe = a.spawn('brute', 370, 288); wallFoe.hp = wallFoe.maxHp = 1e7;
    for (let y = 10; y < 18; y++) W.grid.set(19, y, 1);
    u.update(1 / 120); const noWallBlink = u.x < 19 * 16 && wallFoe.hp === wallFoe.maxHp;
    for (let y = 10; y < 18; y++) W.grid.set(19, y, 0);
    s.echoImprints = {}; const denied = W.absorb('knight', true) === null;
    const uid = u.inst.uid; s.echoImprints.knight = 2; u.inst.stage = 0;
    const second = W.absorb('knight', true), third = W.absorb('knight', true);
    const evolved = second.evolved && third.evolved && u.inst.stage === 2 && s.echoes.length === 1 && s.echoes[0].uid === uid && s.echoes[0].role === 'ninja' && s.echoImprints.knight === 0;
    const cannotDoubleSpend = W.absorb('knight', true) === null;
    return { result, noWallBlink, denied, evolved, cannotDoubleSpend };
  });
  assert.ok(roles.result.mage.kinds.includes('arcbolt') && roles.result.mage.kinds.includes('pillar') && roles.result.mage.damage);
  assert.ok(roles.result.ninja.kinds.includes('mirage') && roles.result.ninja.kinds.includes('star') && roles.result.ninja.blink && roles.result.ninja.damage, JSON.stringify(roles.result.ninja));
  assert.ok(roles.result.fighter.damage && roles.result.fighter.launched && roles.result.fighter.kinds.includes('wave'), JSON.stringify(roles.result.fighter));
  assert.ok(roles.result.guardian.shield); assert.ok(roles.result.herald.heal && roles.result.herald.energy); assert.ok(roles.result.ranger.kinds.includes('rain'));
  assert.ok(roles.noWallBlink && roles.denied && roles.evolved && roles.cannotDoubleSpend);
  console.log('Distinct mage, ninja doubles/stars, fighter launcher, guardian barrier, healer and ranger kits; wall safety and repeat absorption passed');

  await page.evaluate(() => { const a = window.__remnant, { G } = a; G.paused = false; G.world.ents = []; G.world.bossActive = false; G.world.story.ch3.rounds.stop(false); G.ui.openMenu('echoes'); });
  await page.locator('[data-k=role_mage]').click();
  assert.equal(await page.evaluate(() => window.__remnant.G.save.echoes[0].role), 'mage');
  await page.screenshot({ path: 'qa/echo-specializations-desktop.png' });
  await page.locator('[data-k=echo_rematch]').click();
  await page.waitForFunction(() => window.__remnant.G.world.story.ch3.rounds.rematchSpecies === 'knight' && !window.__remnant.G.world.transitioning);
  const rematch = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
    G.paused = true; pSafe();
    function pSafe() { W.player.invuln = 999; }
    const until = fn => { for (let i = 0; i < 2500 && !fn(); i++) W.update(1 / 120); if (!fn()) throw Error('Rematch lifecycle'); };
    const campaign = JSON.stringify({ defeated: G.save.defeated, quests: G.save.quests }), board = localStorage.getItem('remnant.boss-board.v1');
    until(() => R.boss && R.breakT === 0);
    const original = R.boss.kind === 'knight'; R.boss.takeHit({ dmg: R.boss.maxHp + 1, poise: 0, kx: 0, ky: 0, dir: 1, kind: 'ability', dot: true });
    until(() => R.completed === 1);
    const imprint = G.save.echoImprints.knight === 1;
    R.stop();
    return { original, imprint, campaignSafe: campaign === JSON.stringify({ defeated: G.save.defeated, quests: G.save.quests }), boardSafe: board === localStorage.getItem('remnant.boss-board.v1') };
  });
  for (const [key, value] of Object.entries(rematch)) assert.ok(value, key);
  console.log('Original-form rematch entry, actual enemy defeat, earned imprint, campaign isolation and unranked records passed');
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await boot(phone);
  await mobile.evaluate(() => window.__remnant.G.ui.openMenu('skills'));
  await mobile.locator('[data-k=ls_0]').tap(); await mobile.locator('[data-k=ab_chain_snare]').tap();
  await mobile.screenshot({ path: 'qa/skills-catalog-phone.png' });
  await mobile.locator('[data-k=skills_supers]').tap(); await mobile.locator('[data-k=super_renewal]').tap();
  await mobile.screenshot({ path: 'qa/super-loadout-phone.png' });
  const fits = await mobile.evaluate(() => [...document.querySelectorAll('.ability-card')].every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  assert.ok(fits);
  await mobile.keyboard.press('Escape');
  await mobile.touchscreen.tap(440, 180);
  await mobile.waitForFunction(() => !!document.querySelector('#touch .tc[aria-label="Covenant Renewal"]'));
  assert.ok(await mobile.locator('#touch .tc[aria-label="Chain Snare"]').isVisible());
  await mobile.evaluate(() => { const { G } = window.__remnant; G.save.rally = 100; G.save.hp = G.d.maxHp * 0.3; });
  await mobile.locator('#touch .tc[aria-label="Covenant Renewal"]').tap();
  await mobile.waitForFunction(() => window.__remnant.G.save.rally === 0);
  await mobile.waitForFunction(() => window.__remnant.G.save.hp > window.__remnant.G.d.maxHp * 0.7);
  assert.deepEqual(errors, []);
  await phone.close();
  console.log('Phone catalog layout, touch skill equip, selected-super icon/label and real touch super activation passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
