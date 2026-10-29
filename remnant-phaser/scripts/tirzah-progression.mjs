// Tirzah's own progression: her level, points, skill tree and gear. A journey
// already under way gives her Elior's level with a skill point per level and a
// kit that keeps up with his; the hero fighting earns full experience and the
// one waiting half; her gear and tree drive her numbers (never his); her
// abilities open at her level; foes and bosses drop her gear, scaled to her
// level; and the pause menu's Tirzah section spends her points and equips her
// gear. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(`${e.message}\n${fn}\n${errors.join('\n')}`); });
const click = async (page, k) => { await page.click(`[data-k="${k}"]`); await page.waitForTimeout(60); };
const ready = (page) => until(page, () => { const w = window.__remnant?.world; return w?.player && !w.transitioning && w.room?.id === 'ashen_road'; });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // ---- a new journey: Tirzah at level 1 with her own starter kit
  const fresh = await E(page, () => {
    const s = window.__remnant.world.save, a = s.archer, item = (u) => s.inventory.find((i) => i.uid === u)?.id;
    return { level: a?.level, bow: item(a?.equipment.bow), quiver: item(a?.equipment.quiver), dagger: item(a?.equipment.dagger), hood: item(a?.equipment.hood) };
  });
  assert.deepEqual(fresh, { level: 1, bow: 'hunters_bow', quiver: 'quiver_hide', dagger: 'flint_knife', hood: 'hood_wool' }, `a new journey gives her a starter kit (${JSON.stringify(fresh)})`);
  console.log(`New journey: Tirzah level ${fresh.level} with ${fresh.bow}, ${fresh.quiver}, ${fresh.dagger}, ${fresh.hood}`);

  // ---- a journey under way, saved before she had her own progression
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    const sword = { uid: 'old_sword', id: 'ember_brand', rarity: 4, plus: 3, affixes: [] };
    s.inventory.push(sword); s.equipment.weapon = sword.uid;
    Object.assign(s, { level: 30, statPoints: 4, playableHero: 'elior', room: 'ashen_road', spawn: 'left' });
    s.stats.str = 22;
    for (const u of Object.values(s.archer.equipment)) s.inventory = s.inventory.filter((i) => i.uid !== u);
    delete s.archer;
    localStorage.setItem('remnant-phaser.save.v2', JSON.stringify(s));
  });
  await page.goto(base + '?debug&nostory&autostart');
  await ready(page);
  const moved = await E(page, () => {
    const w = window.__remnant.world, s = w.save, a = s.archer, bow = s.inventory.find((i) => i.uid === a.equipment.bow);
    return { level: a.level, sp: a.skillPoints, pts: a.statPoints, str: a.stats.str, bow: bow.id, rarity: bow.rarity, power: bow.lootPower ?? 0, eliorAtk: w.eliorD.atk };
  });
  assert.ok(moved.level === 30 && moved.sp === 29 && moved.pts === 4 && moved.str === 22, `she starts at Elior's level with his stats and a skill point a level (${JSON.stringify(moved)})`);
  assert.ok(moved.bow === 'hunters_bow' && moved.rarity === 4 && moved.power > 0, `her bow matches his sword's rarity and Power (${JSON.stringify(moved)})`);
  const parity = await E(page, () => { const w = window.__remnant.world; w.save.playableHero = 'tirzah'; w.refreshStats(); const her = w.d.atk; w.save.playableHero = 'elior'; w.refreshStats(); return { her, his: w.d.atk }; });
  assert.ok(parity.her >= parity.his * 0.9 && parity.her <= parity.his * 1.2, `her attack keeps pace with his (her quiver and dagger add a little) (${JSON.stringify(parity)})`);
  console.log(`Migration: level ${moved.level}, ${moved.sp} skill points, Elior's stats, a ${['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][moved.rarity]} bow at Power ${moved.power}; attack ${parity.her.toFixed(1)} vs his ${parity.his.toFixed(1)}`);

  // ---- experience: the fighter earns it all, the one waiting half
  const xp = await E(page, () => {
    const w = window.__remnant.world, s = w.save, a = s.archer;
    s.level = 1; s.xp = 0; a.level = 1; a.xp = 0; w.refreshStats();
    w.giveXp(20);
    const elior = { his: s.xp, hers: a.xp };
    s.playableHero = 'tirzah'; w.refreshStats();
    w.giveXp(20);
    return { elior, tirzah: { his: s.xp, hers: a.xp } };
  });
  assert.deepEqual(xp, { elior: { his: 20, hers: 10 }, tirzah: { his: 30, hers: 30 } }, `full to the fighter, half to the other (${JSON.stringify(xp)})`);
  const lv = await E(page, () => { const w = window.__remnant.world, s = w.save; w.giveXp(5000); return { his: s.level, hers: s.archer.level, sp: s.archer.skillPoints }; });
  assert.ok(lv.hers > lv.his, `she levels faster while she fights (${JSON.stringify(lv)})`);
  await until(page, (n) => window.__remnant.world.game.scene.getScene('hud').levelText.text === String(n), lv.hers);
  console.log(`Experience: Elior fighting 20 → him 20, her 10; Tirzah fighting → her 20, him 10; then she reached ${lv.hers} to his ${lv.his}`);

  // ---- her gates follow her level: Elior at 30 doesn't open her Rain of Arrows
  const gate = await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    // As if she had never been past 10: what she knows is filled in again from her level.
    s.level = 30; s.archer.level = 10; s.archer.xp = 0; s.archerKnown = []; s.archerSkills = [null, null, null]; s.quiver = ['standard']; w.refreshStats();
    return { rain: s.archer.level >= 16, quiver: [...(s.quiver ?? [])], known: [...(s.archerKnown ?? [])] };
  });
  assert.ok(!gate.known.includes('rain') && gate.known.includes('mark') && gate.quiver.includes('fire') && !gate.quiver.includes('storm'), `her abilities and arrows open at her level (${JSON.stringify(gate)})`);
  console.log(`Gates: at her level 10 (his 30) she knows ${gate.known.join(', ')} and nocks ${gate.quiver.join(', ')}`);

  // ---- her gear and tree drive her numbers, never his
  const gear = await E(page, () => {
    const R = window.__remnant, w = R.world, s = w.save, a = s.archer;
    const his0 = w.eliorD.atk, her0 = w.d.atk, crit0 = w.d.crit, mm0 = w.d.meleeMult;
    s.inventory.push({ uid: 'big_bow', id: 'stormspine', rarity: 5, plus: 2, affixes: [], lootPower: 80 });
    a.equipment.bow = 'big_bow'; w.refreshStats();
    const her1 = w.d.atk;
    a.skillPoints = 10;
    const draw = R.archer.learnArcher(s, 't_draw', 3), keen = R.archer.learnArcher(s, 't_keen', 2), bad = R.archer.learnArcher(s, 't_twin', 1);
    w.refreshStats();
    return { his0, his1: w.eliorD.atk, her0, her1, mm0, mm1: w.d.meleeMult, crit0, crit1: w.d.crit, draw, keen, bad, pts: a.skillPoints, el: w.player.bow.element() };
  });
  assert.ok(gear.her1 > gear.her0 * 2 && gear.his1 === gear.his0, `the Stormspine raised her attack and left his alone (${JSON.stringify(gear)})`);
  assert.ok(gear.draw === 3 && gear.keen === 2 && gear.bad === 0 && gear.pts === 5, `the tree spends points and keeps capstones behind their roots (${JSON.stringify(gear)})`);
  assert.ok(Math.abs(gear.mm1 / gear.mm0 - 1.24) < 0.001 && Math.abs(gear.crit1 - gear.crit0 - 0.06) < 0.001, `Steady Draw and Hawk's Eye show in her numbers (${JSON.stringify(gear)})`);
  assert.equal(gear.el, 'storm', 'the Stormspine gives her arrows its element');
  console.log(`Gear and tree: attack ${gear.her0.toFixed(1)} → ${gear.her1.toFixed(1)} (his stays ${gear.his0.toFixed(1)}); Steady Draw ×${(gear.mm1 / gear.mm0).toFixed(2)}, crit +${((gear.crit1 - gear.crit0) * 100).toFixed(0)}%; storm arrows`);

  // ---- drops: foes and bosses drop her gear, at a Power that grows with her level
  const drops = await E(page, () => {
    const R = window.__remnant, w = R.world, s = w.save;
    s.archer.level = 10; let mine = 0;
    const slots = new Set();
    for (let i = 0; i < 300; i++) { const l = w.gearDrop(false); if (l.power) { mine++; slots.add(l.item); } }
    const low = R.archer.archerDrop(s, 1, 'foe', () => 0.01), boss = R.archer.archerDrop(s, 9, 'boss', () => 0.01);
    s.archer.level = 50;
    const late = R.archer.archerDrop(s, 9, 'boss', () => 0.01);
    const n = s.inventory.length; w.bossSpoils('idol'); w.bossSpoils('idol');
    return { mine, kinds: slots.size, low, boss, late, got: s.inventory.length - n, tag: s.inventory.at(-1).lootPower };
  });
  assert.ok(drops.mine > 100 && drops.mine < 230 && drops.kinds >= 5, `about half of a foe's gear is hers while she fights (${JSON.stringify(drops)})`);
  assert.ok(drops.boss.rarity > drops.low.rarity && drops.late.power > drops.boss.power && drops.got === 1 && drops.tag > 0, `bosses and later chapters drop finer pieces, and Power climbs with her level (${JSON.stringify(drops)})`);
  console.log(`Drops: ${drops.mine}/300 foe pieces were hers (${drops.kinds} kinds); boss rarity ${drops.boss.rarity} vs foe ${drops.low.rarity}; Power ${drops.boss.power} → ${drops.late.power} from her level 10 to 50`);

  const keeps = await E(page, () => { const w = window.__remnant.world, n = (id) => w.save.inventory.filter((i) => i.id === id).length; w.bossSpoils('marshal'); w.bossSpoils('marshal'); w.bossSpoils('persia_prince'); return [n('ehuds_blade'), n('bow_of_jonathan')]; });
  assert.deepEqual(keeps, [1, 1], "the Crimson Marshal and the prince of Persia each give her keepsake once");
  console.log("Keepsakes: Ehud's Blade from the Crimson Marshal and the Bow of Jonathan from the prince of Persia, once each");

  // ---- the store keeps what she wears
  const keep = await E(page, () => { const R = window.__remnant, s = R.world.save; return R.archer.keepReason(s, s.inventory.find((i) => i.uid === s.archer.equipment.bow)); });
  assert.equal(keep, 'Equipped.', 'her bow cannot be sold while she wears it');

  // ---- the pause menu: her section, a stat point, a piece of gear, a skill
  await E(page, () => { const w = window.__remnant.world, a = w.save.archer; a.statPoints = 3; a.skillPoints = 4; w.save.inventory.push({ uid: 'new_quiver', id: 'quiver_mighty', rarity: 4, plus: 0, affixes: [], isNew: true }); });
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu'));
  await click(page, 'sec_tirzah');
  assert.ok(await E(page, () => document.querySelector('.tab.on')?.dataset.k === 'tab_tz_character'), 'the Tirzah section opens on her character');
  const vit0 = await E(page, () => window.__remnant.world.save.archer.stats.vit);
  await click(page, 'tz_st_vit');
  assert.equal(await E(page, () => window.__remnant.world.save.archer.stats.vit), vit0 + 1, 'a point raised her Vitality');
  await page.screenshot({ path: 'qa/tirzah-character.png' });
  await click(page, 'tab_tz_equipment');
  await click(page, 'tz_slot_quiver');
  await click(page, 'tz_it_new_quiver');
  assert.ok(await E(page, () => !!document.querySelector('[data-k="tz_if_equipped"]')), 'the If-equipped comparison shows');
  await click(page, 'tz_equip');
  assert.equal(await E(page, () => window.__remnant.world.save.archer.equipment.quiver), 'new_quiver', 'the Quiver of the Mighty is hers');
  assert.equal(await E(page, () => window.__remnant.world.save.equipment.gauntlets !== 'new_quiver'), true, "it never lands in Elior's slots");
  await page.screenshot({ path: 'qa/tirzah-equipment.png' });
  await click(page, 'tab_tz_skills');
  await click(page, 'tz_sk_t_hide');
  await click(page, 'tz_learn');
  assert.equal(await E(page, () => window.__remnant.world.save.archer.skills.t_hide), 1, 'Tanned Hide learned');
  await page.screenshot({ path: 'qa/tirzah-skills.png' });
  await click(page, 'tab_tz_abilities');
  await page.screenshot({ path: 'qa/tirzah-abilities.png' });
  const reason = await E(page, () => document.querySelectorAll('.ability-card').length);
  assert.equal(reason, 6, 'all six of her abilities are listed');
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu'));
  assert.ok(await E(page, () => { const s = JSON.parse(localStorage.getItem('remnant-phaser.save.v2')); return s.archer.equipment.quiver === 'new_quiver' && s.archer.skills.t_hide === 1; }), 'her choices were saved');
  console.log('Menu: her section spent a stat point, equipped the Quiver of the Mighty and learned Tanned Hide; saved');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser tirzah progression: all checks passed');
} finally {
  await browser.close();
  close();
}
