import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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
const S = load('src/game/state.ts'), B = load('src/game/balance.ts');
const P = load('src/game/physics.ts'), { Grid, T } = load('src/game/tiles.ts');
test('level 150 grows stronger without increasing wave strength; invested stats have large effects', () => {
  const s = S.newGame(), base = S.derive(s);
  s.level = 150; const high = S.derive(s);
  assert.ok(high.maxHp > base.maxHp * 10); assert.ok(high.atk > base.atk * 15);
  assert.ok(high.abil > base.abil * 2.7);
  for (const key of ['vit', 'str', 'agi', 'end', 'res', 'wis']) {
    const before = S.derive(s); s.statPoints = 10; assert.equal(S.allocateStat(s, key, 25), 10);
    const after = S.derive(s); assert.equal(s.statPoints, 0);
    assert.ok(key === 'vit' ? after.maxHp > before.maxHp * 1.1 : key === 'str' ? after.atk > before.atk * 1.4 : key === 'agi' ? after.crit > before.crit && after.aspd > before.aspd : key === 'end' ? after.dr > before.dr && after.maxHp > before.maxHp : key === 'res' ? after.echoDmg > before.echoDmg && after.rallyMult > before.rallyMult : after.abil > before.abil * 1.3 && after.skillRecharge > before.skillRecharge);
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
  assert.equal(S.derive(s).meleeMult, before.meleeMult * 11);
  assert.equal(S.learnRanks(s, 'w_edge', 1), 0);
  assert.equal(S.learnRanks(s, 'c_kin', 25), 25);
  assert.ok(S.derive(s).echoDmg >= before.echoDmg * 7);
  assert.equal(S.learnRanks(s, 'l_lamp', 25), 25);
  assert.ok(S.derive(s).abil >= before.abil * 7);
  s.skillPoints = 1; assert.equal(S.learnRanks(s, 'w_keen', 10), 1);
  assert.equal(s.skillPoints, 0); assert.equal(S.learnRanks(s, 'w_keen', 10), 0);
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
  const legacy = s.inventory[0], before = JSON.stringify(S.itemMods(legacy));
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
