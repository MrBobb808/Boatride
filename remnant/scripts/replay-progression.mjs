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
    const file = resolve(dist, path); if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });
async function boot(context) {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate(() => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = true;
    s.level = 50; s.flags.trial_best = 30;
    delete s.weaponMastery; delete s.contracts;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  });
  await page.goto(base + '?debug'); await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  return page;
}
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? { viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    const page = await boot(context);
    const migrated = await page.evaluate(() => {
      const { G } = window.__remnant; G.paused = true; G.inCutscene = false;
      return { mastery: G.save.weaponMastery, contracts: G.save.contracts };
    });
    assert.deepEqual(migrated, { mastery: { blade: 0, spear: 0, greatsword: 0 }, contracts: { vigil: 0, rift: 0, legion: 0 } });

    const mastery = await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world, p = W.player, s = G.save;
      W.load('trial_arena', 'start'); W.story.ch3.rounds.stop(false);
      W.ents = []; W.echoes = []; W.hitstopT = W.slowT = 0;
      G.paused = true; G.inCutscene = false;
      p.x = 210; p.y = 288; p.face = 1; p.mantleT = p.lion = 0; p.weaponFlight = null;
      G.ui.openMenu('progression');
      const reset = () => { W.ents = []; p.atkHit.clear(); };
      const swing = () => p.activeHits(p.moves.combo[0], 1);
      reset(); swing(); const whiff = s.weaponMastery.blade;
      let f = a.spawn('husk', 230, 288); f.hp = f.maxHp = 1e8; f.invuln = 999; swing(); const invulnerable = s.weaponMastery.blade;
      f.invuln = 0; f.guardCheck = () => true; p.atkHit.clear(); swing(); const blocked = s.weaponMastery.blade;
      f.guardCheck = () => false;
      for (let n = 0; n < 40; n++) { p.atkHit.clear(); swing(); }
      const capped = s.weaponMastery.blade;
      for (let n = 0; n < 12; n++) { reset(); f = a.spawn('husk', 230, 288); f.hp = f.maxHp = 1e8; swing(); }
      const rank = G.d.masteryRank, mult = G.d.meleeMult;
      s.weaponMastery = { blade: 1880, spear: 1880, greatsword: 1880 };
      const perks = {};
      for (const [family, item] of [['blade', 'militia_sword'], ['spear', 'trial_tempest'], ['greatsword', 'trial_worldbreaker']]) {
        a.give(item); s.equipment.weapon = s.inventory.at(-1).uid; G.ui.openMenu('progression'); p.styleKey = ''; p.refreshLook();
        const d = G.d; perks[family] = { rank: d.masteryRank, steal: d.lifesteal, recharge: d.skillRecharge, heavy: d.heavyMult, poise: d.heavyPoiseMult };
      }
      reset(); f = a.spawn('husk', 230, 288); f.hp = f.maxHp = 1e8;
      let guardBreak = false; const take = f.takeHit.bind(f); f.takeHit = h => { guardBreak = !!h.guardBreak; return take(h); };
      p.activeHits({ ...p.moves.heavy, guardBreak: false }, 1);
      return { whiff, invulnerable, blocked, capped, rank, mult, perks, guardBreak };
    });
    assert.equal(mastery.whiff, 0); assert.equal(mastery.invulnerable, 0); assert.equal(mastery.blocked, 0); assert.equal(mastery.capped, 8);
    assert.equal(mastery.rank, 1); assert.ok(mastery.mult >= 1.03);
    assert.equal(mastery.perks.blade.rank, 10); assert.ok(mastery.perks.blade.steal >= 0.03);
    assert.equal(mastery.perks.spear.recharge, 1.25); assert.equal(mastery.perks.greatsword.heavy, 1.2); assert.equal(mastery.perks.greatsword.poise, 1.15); assert.ok(mastery.guardBreak);
    console.log('Mastery: actual damage, capped practice and all three family perks passed');

    const sets = await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world, s = G.save, p = W.player;
      const put = ids => { for (const id of ids) { a.give(id); const it = s.inventory.at(-1); s.equipment[id.endsWith('helm') ? 'helm' : id.endsWith('boots') ? 'boots' : 'armor'] = it.uid; } G.ui.openMenu('progression'); };
      // Ownership alone must not activate bonuses; malformed duplicate slot refs cannot double-count.
      a.give('vigil_helm'); a.give('vigil_plate'); a.give('vigil_boots'); G.ui.openMenu('progression'); const owned = G.d.sets.vigil;
      put(['vigil_helm', 'vigil_plate']); const two = { count: G.d.sets.vigil, regen: G.d.hpRegen, window: G.d.parryWin };
      put(['vigil_boots']);
      p.state = 'parry'; p.parryT = 1; p.invuln = 0; p.vigilParryCd = 0; s.hp = G.d.maxHp * 0.5; s.ce = 0;
      const hp0 = s.hp; const hit = { dmg: 20, poise: 0, kx: 0, ky: 0, dir: -p.face, kind: 'melee' };
      p.takeHit(hit); const healed = s.hp - hp0, energy = s.ce;
      p.parryT = 1; p.takeHit(hit); const second = s.hp;
      put(['rift_helm', 'rift_mail', 'rift_boots']);
      p.state = 'free'; p.invuln = 999; p.weaponCd = p.mantleBlinkCd = 5; p.cds.sword_word = 5;
      const rate = G.d.pursuitRecharge; p.update(0.1);
      const pursuit = { rate, weapon: p.weaponCd, blink: p.mantleBlinkCd, skill: p.cds.sword_word };
      put(['legion_helm', 'legion_mail', 'legion_boots']);
      s.echoes = []; s.active = []; W.echoes = []; a.echo('sentinel'); a.echo('archer');
      const live = W.echoes[0], down = W.echoes[1]; live.inst.level = down.inst.level = 100; live.refreshStats(); down.refreshStats();
      live.hp = live.maxHp * 0.5; down.hp = 0; const before = live.hp;
      const foe = a.spawn('husk', 260, 288); foe.hp = 0; foe.die();
      const legion = { heal: live.hp - before, expected: live.maxHp * 0.03, down: down.hp, count: G.d.sets.legion };
      delete s.equipment.helm; G.ui.openMenu('progression'); const unequipped = G.d.sets.legion;
      return { owned, two, healed, expected: hp0 * 0.1, energy, second, hpAfterFirst: hp0 + healed, pursuit, legion, unequipped };
    });
    assert.equal(sets.owned, 0); assert.equal(sets.two.count, 2); assert.ok(sets.two.regen >= 0.005);
    assert.ok(Math.abs(sets.healed - sets.expected) < 0.001); assert.equal(sets.energy, 13); assert.equal(sets.second, sets.hpAfterFirst);
    assert.equal(sets.pursuit.rate, 1.75); assert.ok(Math.abs(sets.pursuit.weapon - 4.825) < 0.001); assert.equal(sets.pursuit.blink, sets.pursuit.weapon); assert.ok(Math.abs(sets.pursuit.skill - 4.9) < 0.001);
    assert.equal(sets.legion.count, 3); assert.ok(Math.abs(sets.legion.heal - sets.legion.expected) < 0.001); assert.equal(sets.legion.down, 0); assert.equal(sets.unequipped, 2);
    console.log('Sets: real parry healing, recovery cooldown, pursuit recharge and living Echo healing passed');
    await page.screenshot({ path: `qa/replay-progression-${mobile ? 'phone' : 'desktop'}.png` });
    await page.keyboard.press('Escape');

    await page.evaluate(() => { const { G } = window.__remnant; G.world.story.ch3.rounds.stop(false); G.ui.openMenu('settings'); });
    assert.equal(await page.locator('[data-contract]').count(), 3);
    await page.locator('[data-k=contract_from_10]').click();
    assert.equal(await page.locator('[data-k=contract_from_10]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-k=contract_vigil]').click();
    await page.waitForFunction(() => { const { G } = window.__remnant; return !G.world.transitioning && G.world.story.ch3.rounds.from === 10 && G.world.story.ch3.rounds.contract === 'vigil'; });
    await page.evaluate(() => {
      const { G } = window.__remnant, p = G.world.player;
      G.inCutscene = false; G.world.ents = []; G.world.echoes = [];
      G.world.hitstopT = G.world.slowT = 0;
      p.state = 'free'; p.body.onGround = true; p.x = 210; p.y = 288; p.mantleT = 0; p.invuln = 999;
      G.save.hp = G.d.maxHp * 0.5; G.save.balm = 3; G.paused = false;
    });
    await page.keyboard.down('h');
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('Balm is sealed')), null, { timeout: 10000 });
    } catch (e) {
      console.log(await page.evaluate(() => { const { G } = window.__remnant; return { paused: G.paused, cutscene: G.inCutscene, state: G.world.player.state, active: G.world.story.ch3.rounds.active, contract: G.world.story.ch3.rounds.contract, sealed: G.world.story.ch3.rounds.balmSealed, menus: document.querySelectorAll('.menu').length, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) }; })); throw e;
    } finally { await page.keyboard.up('h'); }
    assert.equal(await page.evaluate(() => { const { G } = window.__remnant; G.paused = true; return G.save.balm; }), 3);

    const contract = await page.evaluate(() => {
      const a = window.__remnant, { G } = a, W = G.world, s = G.save, R = W.story.ch3.rounds;
      G.paused = true; const originalChoice = G.ui.choice;
      // Accelerate only enemy deaths and between-wave selection; real spawns, damage hooks,
      // round completion, milestone grants and claim guards execute unchanged.
      G.ui.choice = () => new Promise(() => {});
      const clear = () => {
        if (R.awaitingBlessing) R.chooseBlessing(R.pendingBlessings[0]);
        R.breakT = 0; R.beginRound();
        for (let n = 0; n < R.total; n++) { R.spawnOne(); const f = R.foes.at(-1); f.hp = 0; f.die(); f.remove = true; }
        R.update(1 / 120);
      };
      s.contracts.vigil = 0;
      // Remove earlier QA gear, so a real contract must supply the collection.
      s.inventory = s.inventory.filter(it => !it.id.startsWith('vigil_'));
      for (let n = 0; n < 4; n++) clear();
      const early = s.contracts.vigil, before = s.inventory.length;
      clear(); const first = { wins: s.contracts.vigil, complete: R.contractComplete, sealed: R.balmSealed, count: s.inventory.filter(it => it.id === 'vigil_helm').length, inventory: s.inventory.length - before };
      clear(); const noDouble = s.contracts.vigil;
      const board0 = localStorage.getItem('remnant.board.v1'); R.stop(); const unranked = localStorage.getItem('remnant.board.v1') === board0;
      const pool = R.pool; R.pool = () => ['husk'];
      const sample = id => {
        R.stop(false); W.ents = []; s.flags.trial_contract = id;
        R.start(1); R.breakT = 0; R.beginRound(); R.spawnOne(); const f = R.foes[0];
        return { hp: f.maxHp, dmg: f.dmg, tempo: f.tempo };
      };
      const base = sample(''), iron = sample('vigil'), rift = sample('rift'), legion = sample('legion');
      R.stop(false); s.flags.trial_contract = 'vigil';
      // Three more complete attempts give the two missing pieces and upgrade the first.
      for (let attempt = 0; attempt < 3; attempt++) {
        W.ents = []; R.start(1); for (let n = 0; n < 5; n++) clear(); R.stop(false);
      }
      const gear = s.inventory.filter(it => it.id.startsWith('vigil_')).map(it => ({ id: it.id, plus: it.plus }));
      // Re-entering or abandoning before five clears must not claim anything.
      W.ents = []; R.start(1); clear(); const wins = s.contracts.vigil; R.stop(false); R.start(1); R.stop(false);
      const stable = s.contracts.vigil === wins;
      R.pool = pool; G.ui.choice = originalChoice;
      W.load('sanctuary', 'start'); const cleanExit = !s.flags.trial_contract && !R.balmSealed;
      s.room = 'sanctuary'; s.spawn = 'start';
      localStorage.setItem('remnant-save-2', JSON.stringify(s));
      return { early, first, noDouble, unranked, base, iron, rift, legion, gear, wins, stable, cleanExit };
    });
    assert.equal(contract.early, 0); assert.equal(contract.first.wins, 1); assert.ok(contract.first.complete); assert.equal(contract.first.sealed, false); assert.equal(contract.first.count, 1);
    assert.equal(contract.noDouble, 1); assert.ok(contract.unranked); assert.equal(contract.gear.length, 3); assert.equal(contract.gear.find(it => it.id === 'vigil_helm').plus, 1);
    assert.equal(contract.wins, 4); assert.ok(contract.stable); assert.ok(contract.cleanExit);
    assert.ok(contract.iron.hp >= contract.base.hp * 1.19); assert.ok(contract.iron.dmg >= contract.base.dmg * 1.19);
    assert.ok(contract.rift.tempo >= contract.base.tempo * 1.24); assert.ok(contract.legion.hp >= contract.base.hp * 1.59);

    // Real blessing modal still appears after a real wave; choosing pauses then resumes.
    await page.evaluate(() => {
      const { G } = window.__remnant, W = G.world, R = W.story.ch3.rounds;
      W.load('trial_arena', 'start'); W.ents = []; W.echoes = []; G.paused = true;
      G.save.flags.trial_contract = 'rift'; R.start(1); R.breakT = 0; R.beginRound();
      for (let n = 0; n < R.total; n++) { R.spawnOne(); const f = R.foes.at(-1); f.hp = 0; f.die(); f.remove = true; }
      R.update(1 / 120);
    });
    await page.locator('.blessing-choice .opt').first().waitFor();
    assert.equal(await page.locator('.blessing-choice .opt').count(), 3);
    await page.locator('.blessing-choice .opt').first().click();
    assert.equal(await page.evaluate(() => window.__remnant.G.world.story.ch3.rounds.awaitingBlessing), false);
    await page.evaluate(() => { const { G } = window.__remnant; G.world.story.ch3.rounds.stop(false); G.world.load('sanctuary', 'start'); });
    await page.reload(); await page.waitForFunction(() => !!window.__remnant); await page.evaluate(() => window.__remnant.load(2));
    const saved = await page.evaluate(() => ({ mastery: window.__remnant.G.save.weaponMastery, wins: window.__remnant.G.save.contracts.vigil, gear: window.__remnant.G.save.inventory.filter(it => it.id === 'vigil_helm').length }));
    assert.equal(saved.mastery.greatsword, 1880); assert.equal(saved.wins, 4); assert.equal(saved.gear, 1);
    await page.evaluate(() => window.__remnant.G.ui.openMenu('settings'));
    await page.locator('[data-k=contract_rift]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `qa/replay-contracts-${mobile ? 'phone' : 'desktop'}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'Phone' : 'Desktop'}: mastery damage/perks, live set powers, contract rules/claims, collection upgrades, blessing UI and save reload passed`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
