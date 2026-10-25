// Real input through the new combat routes, every Covenant skill, the loadout
// and its persistence. Targets keep their normal hit handling but stand still.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (p, fn, arg) => p.evaluate(fn, arg);
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 10000 });
const start = async (options = {}) => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options })).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await p.goto(base + '?debug&nostory&autostart&fresh');
  await until(p, () => window.__remnant?.world?.player);
  return p;
};
const setup = async (p, opts = {}) => {
  await E(p, (o) => {
    const w = window.__remnant.world;
    w.loadRoom('ashen_road', 'left');
    const open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    const f = w.classic.ents.find((e) => e.kind === 'husk' && open(e.x - 22, e.y - 2) && open(e.x - 22, e.y - 24) && !open(e.x - 22, e.y + 2));
    for (const e of w.classic.ents) if (e !== f) e.remove = true;
    f.hp = f.maxHp = 1e7;
    f.executable = () => false; // Combo routes are tested apart from executions.
    f.think = function () { this.body.vx = 0; };
    f.setState('idle', 'idle');
    const s = w.save;
    s.skills.w_relentless = o.relentless ? 1 : 0;
    s.flags.phantom = !!o.phantom;
    s.abilities = ['sword_word', 'trumpet', 'shield_faith', 'lion', 'still_waters', 'pillar_fire', 'chains', 'armor_light', 'chain_snare', 'blink_strike', 'mending_light', 'frost_ring'];
    s.equippedSkills = [o.skill ?? 'sword_word', 'trumpet', 'shield_faith'];
    w.refreshStats();
    const p = w.player;
    p.placeAt(f.x - 22, f.y, 1);
    p.hp = o.hurt ? p.maxHp * 0.35 : p.maxHp;
    s.ce = p.maxCe;
  }, opts);
  await until(p, () => window.__remnant.world.player.onGround && window.__remnant.world.player.state === 'free');
};
const attack = async (p) => { await p.keyboard.press('KeyJ'); };
const move = (p) => E(p, () => { const a = window.__remnant.world.player; return { state: a.state, id: a.atk.id, combo: a.comboHits, x: a.x, y: a.feet, n: a.phantomN }; });

try {
  const p = await start();
  await setup(p, { relentless: true });
  const chain = [];
  await attack(p);
  for (const id of ['b1', 'b2', 'b3', 'b4']) {
    await until(p, (id) => window.__remnant.world.player.atk.id === id && window.__remnant.world.player.state === 'attack', id);
    chain.push((await move(p)).id);
    if (id !== 'b4') await attack(p);
  }
  assert.deepEqual(chain, ['b1', 'b2', 'b3', 'b4']);
  console.log('Relentless: four real J presses reached Rising Verdict');

  // A real pause after the second strike takes the flurry branch.
  await setup(p);
  await attack(p); await attack(p);
  await until(p, () => window.__remnant.world.player.state === 'free' && window.__remnant.world.player.linger === 'b2');
  await until(p, () => window.__remnant.world.player.lingerT < 0.43);
  await attack(p);
  await until(p, () => window.__remnant.world.player.atk.id === 'flurry');
  await until(p, () => window.__remnant.world.player.atk.id === 'flurryEnd');
  assert.ok((await move(p)).combo >= 3, 'the flurry hits repeatedly');
  console.log('Seventy Times Seven: the delayed input opened the multi-hit flurry and its final lunge');

  await setup(p);
  await attack(p); await attack(p);
  await until(p, () => window.__remnant.world.player.atk.id === 'b2');
  await attack(p);
  await until(p, () => window.__remnant.world.player.atk.id === 'b3');
  await p.keyboard.press('KeyK');
  await until(p, () => window.__remnant.world.player.atk.id === 'storm');
  console.log('Storm of Edges: Heavy during strike three opened the spin');

  await setup(p);
  await p.keyboard.down('KeyL');
  await until(p, () => window.__remnant.world.player.state === 'dodge' && window.__remnant.world.player.st > 0.08);
  await p.keyboard.up('KeyL');
  await attack(p);
  await until(p, () => window.__remnant.world.player.atk.id === 'dash' && window.__remnant.world.player.state === 'attack');
  await attack(p);
  await until(p, () => window.__remnant.world.player.atk.id === 'comet');
  assert.ok(await E(p, () => window.__remnant.world.player.body.velocity.y < 0), 'Rising Comet carries Elior up');

  await setup(p);
  await p.keyboard.down('Space');
  await until(p, () => !window.__remnant.world.player.onGround && window.__remnant.world.player.body.velocity.y < 0);
  await attack(p);
  await p.keyboard.up('Space');
  for (const id of ['air1', 'air2', 'air3']) {
    await until(p, (id) => window.__remnant.world.player.atk.id === id, id);
    if (id !== 'air3') await attack(p);
  }
  await p.keyboard.press('KeyK');
  await until(p, () => window.__remnant.world.player.atk.id === 'rend');
  await until(p, () => window.__remnant.world.player.atk.id === 'slam');

  await setup(p);
  await p.keyboard.down('Space');
  await until(p, () => !window.__remnant.world.player.onGround);
  await p.keyboard.press('KeyL');
  await until(p, () => window.__remnant.world.player.state === 'airdash');
  assert.equal(await E(p, () => window.__remnant.world.player.hurt({ dmg: 50, dir: 1 })), false, 'the air dash turns a blow aside');
  await p.keyboard.up('Space');
  console.log('Aerial routes: dash → Rising Comet, three air strikes → Rend → landing impact, and an invulnerable air dash');

  // Phantom Steps alternate safe sides, retain their chain, and spend Energy.
  await setup(p, { phantom: true });
  await attack(p);
  await until(p, () => window.__remnant.world.player.recentHit > 0);
  for (let n = 1; n <= 3; n++) {
    await p.keyboard.press('KeyL');
    await until(p, (n) => window.__remnant.world.player.phantomN === n && window.__remnant.world.player.atk.id === 'pstrike' && window.__remnant.world.player.state === 'attack', n);
    await until(p, () => window.__remnant.world.player.recentHit > 0);
  }
  await attack(p);
  await until(p, () => window.__remnant.world.player.atk.id === 'cross');
  assert.equal((await move(p)).n, 0, 'Judgment Cross consumes the three-step chain');
  console.log('Phantom Step: three Dodge presses blinked into strikes; J completed Judgment Cross');

  // All twelve effects are fired by the selected slot, with their normal costs.
  const ids = ['sword_word', 'trumpet', 'shield_faith', 'lion', 'still_waters', 'pillar_fire', 'chains', 'armor_light', 'chain_snare', 'blink_strike', 'mending_light', 'frost_ring'];
  for (const id of ids) {
    console.log(`Casting ${id}`);
    await setup(p, { skill: id, hurt: ['mending_light', 'still_waters'].includes(id) });
    const before = await E(p, () => { const w = window.__remnant.world; w.player.veiled = 3; return { ce: w.save.ce, hp: w.player.hp, enemy: w.classic.ents.find((e) => e.kind === 'husk').hp, x: w.player.x }; });
    await p.keyboard.press('KeyQ');
    await until(p, (id) => window.__remnant.world.player.cds[id] > 0, id);
    if (['shield_faith', 'lion', 'armor_light', 'chains', 'mending_light'].includes(id)) {
      const field = { shield_faith: 'shieldT', lion: 'lion', armor_light: 'armorLight', chains: 'untouchable', mending_light: 'mendT' }[id];
      await until(p, (f) => window.__remnant.world.player[f] > 0, field);
    } else if (id === 'still_waters') await until(p, (hp) => window.__remnant.world.player.hp > hp, before.hp);
    else await until(p, (hp) => window.__remnant.world.classic.ents.find((e) => e.kind === 'husk').hp < hp, before.enemy);
    const after = await E(p, () => { const w = window.__remnant.world; return { ce: w.save.ce, hp: w.player.hp, x: w.player.x, chill: w.classic.ents.find((e) => e.kind === 'husk').chill, veil: w.player.veiled }; });
    assert.ok(after.ce < before.ce - 10, `${id} paid its Energy cost`);
    if (id === 'blink_strike') assert.ok(Math.abs(after.x - before.x) > 20, 'Rift Assault moved Elior');
    if (id === 'frost_ring') assert.ok(after.chill > 0, 'Winter Halo chilled its target');
    if (id === 'chains') assert.equal(after.veil, 0, 'Chains Broken cleared the Veil');
  }
  console.log('Covenant skills: all twelve cast from Q, paid Energy, and produced their expected effects');

  await setup(p, { skill: 'blink_strike' });
  await E(p, () => { const w = window.__remnant.world, f = w.classic.ents.find((e) => e.kind === 'husk'); w.player.placeAt(f.x + 24, f.y, 1); });
  await until(p, () => window.__remnant.world.player.onGround);
  const energy = await E(p, () => window.__remnant.world.save.ce);
  await p.keyboard.press('KeyQ');
  await p.waitForTimeout(180);
  assert.equal(await E(p, () => window.__remnant.world.player.cds.blink_strike), 0, 'a foe behind Elior does not consume a targeted cast');
  assert.ok(await E(p, () => window.__remnant.world.save.ce) >= energy);

  // Flying effects wait with the world, rather than running through the menu.
  await setup(p, { skill: 'pillar_fire' });
  await p.keyboard.press('KeyQ');
  await until(p, () => window.__remnant.world.classic.ents.some((e) => e.kind === 'pillar'));
  await p.keyboard.press('Escape');
  await until(p, () => window.__remnant.game.scene.getScene('hud').paused);
  const time = await E(p, () => window.__remnant.world.classic.ents.find((e) => e.kind === 'pillar').life);
  await p.waitForTimeout(350);
  assert.equal(await E(p, () => window.__remnant.world.classic.ents.find((e) => e.kind === 'pillar').life), time, 'a paused spell keeps its time');

  // The menu swaps an occupied skill, clears a slot, and persists both.
  await p.click('[data-k="sec_elior"]');
  await p.click('[data-k="tab_skills"]');
  await p.click('[data-k="ls_1"]');
  await p.click('[data-k="ab_pillar_fire"]');
  assert.deepEqual(await E(p, () => window.__remnant.world.save.equippedSkills), ['trumpet', 'pillar_fire', 'shield_faith']);
  await p.click('[data-k="ls_2"]');
  await p.click('[data-k="ability_clear"]');
  await p.click('[data-k="menu_resume"]');
  await p.goto(base + '?debug&nostory&autostart');
  await until(p, () => window.__remnant?.world?.player);
  assert.deepEqual(await E(p, () => window.__remnant.world.save.equippedSkills), ['trumpet', 'pillar_fire', null]);
  console.log('Loadout: an occupied ability swapped, clearing persisted through reload, and spells waited during pause');

  // The phone changes and casts the equipped skill with a real tap.
  const phone = await start({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await setup(phone, { skill: 'mending_light', hurt: true });
  await phone.waitForTimeout(100);
  const pos = await E(phone, () => { const b = window.__remnant.game.scene.getScene('hud').btns.find((b) => b.a === 'skill1'); return { x: b.x / 2, y: b.y / 2, text: b.t.text }; });
  assert.equal(pos.text, 'MEND');
  await phone.touchscreen.tap(pos.x, pos.y);
  await until(phone, () => window.__remnant.world.player.mendT > 0);
  await phone.screenshot({ path: 'qa/combat-moves-phone.png' });
  assert.deepEqual(errors, [], 'no runtime errors, including shared spells and Echo effects');
  console.log('Phone: the first skill showed MEND and a thumb tap cast it');

  for (const [weapon, first] of [['watchman_spear', 's1'], ['judgment_greatsword', 'g1']]) {
    await setup(p);
    await E(p, (id) => { const w = window.__remnant.world; const old = w.save.equipment.weapon; w.save.inventory.push({ uid: 'test_' + id, id, rarity: 2, plus: 0, affixes: [] }); w.save.equipment.weapon = 'test_' + id; w.refreshStats(); w.save.flags.test_weapon_old = old; }, weapon);
    await attack(p);
    await until(p, (id) => window.__remnant.world.player.atk.id === id, first);
    await E(p, () => { const w = window.__remnant.world; w.save.equipment.weapon = w.save.flags.test_weapon_old; w.refreshStats(); });
  }
  console.log('Weapons: equipping a spear or greatsword changes the real attack route');
  console.log('phaser combat moves: all checks passed');
} finally { await browser.close(); close(); }
