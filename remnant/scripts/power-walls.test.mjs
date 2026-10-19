import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Date, Math, performance, crypto: globalThis.crypto, require: p => load(resolve(dirname(file), p + '.ts')) }, { filename: file });
  return exports;
}
const root = fileURLToPath(new URL('../', import.meta.url));
const S = load(resolve(root, 'src/game/state.ts')), B = load(resolve(root, 'src/game/balance.ts'));
const D = load(resolve(root, 'src/game/data.ts'));
const P = load(resolve(root, 'src/game/physics.ts')), { Grid, T } = load(resolve(root, 'src/game/tiles.ts'));
test('level 150 grows stronger without increasing wave strength; invested stats have large effects', () => {
  const s = S.newGame(), base = S.derive(s);
  s.level = 150; const high = S.derive(s);
  assert.ok(high.maxHp > base.maxHp * 10);
  assert.ok(high.atk > base.atk * 3 && high.atk < base.atk * 6);
  assert.ok(high.abil > base.abil * 1.2 && high.abil < base.abil * 1.6);
  for (const key of ['vit', 'str', 'agi', 'end', 'res', 'wis']) {
    const before = S.derive(s); s.statPoints = 10; assert.equal(S.allocateStat(s, key, 25), 10);
    const after = S.derive(s); assert.equal(s.statPoints, 0);
    assert.ok(key === 'vit' ? after.maxHp > before.maxHp * 1.1 : key === 'str' ? after.atk > before.atk * 1.4 : key === 'agi' ? after.crit > before.crit && after.aspd > before.aspd : key === 'end' ? after.dr > before.dr && after.maxHp > before.maxHp : key === 'res' ? after.echoDmg > before.echoDmg && after.rallyMult > before.rallyMult : after.abil > before.abil * 1.2 && after.skillRecharge > before.skillRecharge);
  }
  assert.equal(S.allocateStat(s, 'str', -1), 0); assert.equal(S.allocateStat(s, 'str', NaN), 0);
  assert.ok(B.sovereignDamage(300) > B.sovereignDamage(250));
  assert.ok(B.trialStrength(40).hp > B.trialStrength(30).hp);
});
test('bulk passive learning respects prerequisites, budgets and rank limits', () => {
  const s = S.newGame(); s.skillPoints = 150;
  assert.equal(S.learnRanks(s, 'w_keen', 10), 0);
  const before = S.derive(s);
  assert.equal(S.learnRanks(s, 'w_edge', 50), 50);
  assert.equal(S.derive(s).meleeMult, before.meleeMult * 3.375);
  assert.equal(S.learnRanks(s, 'w_edge', 1), 0);
  assert.equal(S.learnRanks(s, 'c_kin', 25), 25);
  assert.equal(S.derive(s).echoDmg - before.echoDmg, 1.75);
  assert.equal(S.learnRanks(s, 'l_lamp', 25), 25);
  assert.ok(Math.abs(S.derive(s).abil - before.abil - 1.75) < 1e-9);
  s.skillPoints = 1; assert.equal(S.learnRanks(s, 'w_keen', 10), 1);
  assert.equal(s.skillPoints, 0); assert.equal(S.learnRanks(s, 'w_keen', 10), 0);
});
test('late ranks, attributes and levels have smaller positive gains; bonuses cannot multiply one another', () => {
  for (let r = 1; r <= 50; r++) assert.ok(B.trainingBonus(r) > B.trainingBonus(r - 1));
  assert.ok(B.trainingBonus(50) - B.trainingBonus(40) < B.trainingBonus(10));
  assert.ok(B.softGrowth(70, 60, .35) - B.softGrowth(60, 60, .35) < B.softGrowth(60, 60, .35) - B.softGrowth(50, 60, .35));
  const s = S.newGame(); s.level = 150; s.stats.wis = 97; s.stats.res = 60;
  const base = S.derive(s); s.skills.l_lamp = s.skills.c_kin = 25;
  const trained = S.derive(s);
  assert.ok(trained.abil < base.abil * 2); assert.ok(trained.echoDmg < base.echoDmg * 2);
  assert.ok(B.sovereignDamage(150) <= 1.5); assert.ok(B.sovereignDamage(300) < 1.7);
  const old = JSON.stringify({ stats: s.stats, skills: s.skills, level: s.level, equipment: s.equipment, inventory: s.inventory });
  S.migrateSave(s);
  assert.equal(JSON.stringify({ stats: s.stats, skills: s.skills, level: s.level, equipment: s.equipment, inventory: s.inventory }), old);
});
test('deep waves grow in threat and award a bounded full-wave experience budget', () => {
  assert.ok(Math.abs(B.trialStrength(30).damage - 3.03) < 1e-9);
  assert.ok(B.trialStrength(100).damage > B.trialStrength(30).damage * 6);
  for (const wave of [1, 10, 30, 60, 100, 200]) {
    assert.ok(B.trialXpLevels(wave) >= .35 && B.trialXpLevels(wave) <= 1.35);
  }
});
test('full wave-30 gear with late ranks stays powerful without deleting wave-100 foes', () => {
  for (const plus of [0, 10]) {
    const s = S.newGame(); s.level = 150;
    s.stats = { vit: 75, str: 120, agi: 55, end: 70, res: 60, wis: 97 };
    s.skills = { w_edge: 50, w_keen: 10, c_kin: 25, l_lamp: 25, g_skin: 20, g_regen: 10 };
    assert.equal(Object.values(s.stats).reduce((a, n) => a + n - 5, 0), 447);
    assert.ok(Object.values(s.skills).reduce((a, n) => a + n, 0) <= 149);
    for (const id of [B.ASCENDANT_LOOT[0], ...B.ASCENDANT_LOOT.slice(3)]) {
      const it = S.makeItem(id, 5, plus, false); it.lootPower = B.waveLootPower(150, 30); it.lootWave = 30;
      it.affixes = D.AFFIX_POOL.filter(a => ['crit', 'abil', 'echoDmg'].includes(a.key)).map(a => ({ key: a.key, v: a.max }));
      s.inventory.push(it); s.equipment[D.ITEMS[id].slot] = it.uid;
    }
    const d = S.derive(s), hit = d.atk * d.meleeMult * B.sovereignDamage(150);
    // Production priest has 120 base HP, multiplied by Chapter III's tier in the arena.
    const shallow = 360 * B.trialStrength(30).hp, deep = 360 * B.trialStrength(100).hp;
    assert.ok(hit > shallow, 'earned strong gear should still dominate earlier waves');
    assert.ok(hit * d.critDmg < deep * .5, 'even a critical cannot erase a deep-wave foe');
    assert.ok(d.atk * d.abil * 3.2 < deep * .7, 'skill ranks and gear must not multiply into a one-cast wave clear');
    const echo = S.makeEcho('sentinel'); echo.stage = 2; echo.level = 100;
    assert.ok(S.echoAtk(s, echo, d) < deep * .06, 'one evolved Echo must not inherit the full nuclear stack');
  }
});
test('equipment upgrades retain their damage advantage at high hero levels', () => {
  const s = S.newGame(), weapon = S.makeItem('trial_reaver', 3, 0, false);
  s.inventory.push(weapon);
  for (const level of [50, 150, 500]) {
    s.level = level; const oldUid = s.equipment.weapon, starter = S.derive(s).atk;
    s.equipment.weapon = weapon.uid; assert.ok(S.derive(s).atk > starter * 3);
    s.equipment.weapon = oldUid;
  }
});
test('random wave gear covers every slot, has unique affixes, scales and survives migration', () => {
  const s = S.newGame(); s.level = 150;
  const ids = new Set();
  for (let i = 0; i < 9; i++) {
    let call = 0; const it = S.grantWaveLoot(s, 31, () => call++ === 0 ? (i + .1) / 9 : .5);
    ids.add(it.id); assert.ok(it.rarity >= 4); assert.equal(it.lootWave, 31);
    assert.equal(new Set(it.affixes.map(a => a.key)).size, it.affixes.length);
  }
  assert.equal(ids.size, 9);
  const first = S.grantWaveLoot(s, 5, () => .5), later = S.grantWaveLoot(s, 30, () => .5);
  assert.equal(first.id, 'ascendant_spear'); assert.equal(later.id, first.id);
  assert.ok(later.lootPower > first.lootPower); assert.ok(S.itemMods(later).atk > S.itemMods(first).atk * 2);
  const legacy = S.makeItem('trial_reaver', 3, 0, false); s.inventory.unshift(legacy);
  const before = JSON.stringify(S.itemMods(legacy));
  const points = [s.statPoints, s.skillPoints], saved = JSON.parse(JSON.stringify(s)); S.migrateSave(saved);
  assert.equal(JSON.stringify(S.itemMods(saved.inventory[0])), before);
  assert.deepEqual([saved.statPoints, saved.skillPoints], points);
  assert.ok(Number.isFinite(B.lootScale(Infinity, true)));
});
test('swept movement stops fast lunges at thin walls in both directions and under low frame rates', () => {
  const g = new Grid(Array.from({ length: 12 }, () => '..........#.........'));
  const solid = t => t === T.Stone;
  for (const dt of [1 / 120, 1 / 60, .1]) for (const dir of [-1, 1]) {
    const b = P.makeBody(dir > 0 ? 145 : 190, 128, 14, 35);
    b.vx = dir * 12000; P.moveBody(b, dt, g, solid);
    assert.equal(b.x, dir > 0 ? 153 : 183); assert.equal(b.vx, 0); assert.equal(b.wallDir, dir);
    assert.ok(P.bodyFits(b, g, solid, b.x, b.y));
  }
  const b = P.makeBody(50, 128, 14, 35); b.vx = 80; P.moveBody(b, .1, g, solid); assert.equal(b.x, 58);
});
test('full-body placement detects narrow edge overlaps while allowing flush walls and one-way platforms', () => {
  const g = new Grid(Array.from({ length: 12 }, () => '..........#.........'));
  const b = P.makeBody(153, 128, 14, 35), solid = t => t === T.Stone;
  assert.ok(P.bodyFits(b, g, solid, 153, 128));
  assert.equal(P.bodyFits(b, g, solid, 153.1, 128), false);
  assert.equal(P.bodyFits(b, g, solid, 182.9, 128), false);
  assert.ok(P.bodyFits(b, g, solid, 183, 128));
  assert.equal(P.bodyFits(b, g, solid, NaN, 128), false);
  g.set(3, 6, T.OneWay); assert.ok(P.bodyFits(b, g, solid, 50, 128));
});
