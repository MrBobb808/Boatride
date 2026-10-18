import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/game/progression.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { WeaponPractice, gainMastery, masteryRank, masteryXp, migrateProgression, contractPrize, contractTier } = exports;
test('practice requires damage and bounds each foe across weapon swaps and multi-hit moves', () => {
  const p = new WeaponPractice(), s = {}, foe = {};
  p.hit(s, 'blade', foe, 0, true); p.hit(s, 'blade', foe, -1, true);
  assert.equal(masteryXp(s, 'blade'), 0);
  for (let n = 0; n < 100; n++) p.hit(s, 'blade', foe, 10, true);
  assert.equal(masteryXp(s, 'blade'), 8);
  p.hit(s, 'spear', foe, 10, true); assert.equal(masteryXp(s, 'spear'), 0);
  p.hit(s, 'spear', {}, 10, true); assert.equal(masteryXp(s, 'spear'), 2);
  for (let n = 0; n < 12; n++) p.hit(s, 'blade', {}, 10, false);
  assert.equal(masteryRank(s, 'blade'), 1);
});
test('mastery and contract migration preserve valid progress, clamp damaged values and reach finite caps', () => {
  const s = { weaponMastery: { blade: 120, spear: Infinity, greatsword: -4 }, contracts: { vigil: 6, rift: NaN, legion: '9' } };
  migrateProgression(s); assert.equal(masteryRank(s, 'blade'), 3); assert.equal(masteryXp(s, 'spear'), 0);
  assert.equal(s.contracts.vigil, 6); assert.equal(s.contracts.rift, 0); assert.equal(s.contracts.legion, 0);
  for (let n = 0; n < 2000; n++) gainMastery(s, 'greatsword', 8);
  assert.equal(masteryRank(s, 'greatsword'), 10); assert.equal(masteryXp(s, 'greatsword'), 1880);
  const once = JSON.stringify(s); migrateProgression(s); assert.equal(JSON.stringify(s), once);
});
test('contracts guarantee a full set before rotating through upgrades, with no calendar gate', () => {
  const s = { contracts: { rift: 0 } }, ids = [];
  for (let n = 0; n < 3; n++) { s.contracts.rift = n; const p = contractPrize(s, 'rift'); ids.push(p.id); assert.equal(p.plus, 0); }
  assert.equal(new Set(ids).size, 3);
  s.contracts.rift = 3; assert.equal(contractPrize(s, 'rift').id, ids[0]); assert.equal(contractPrize(s, 'rift').plus, 1); assert.equal(contractTier(s, 'rift'), 1);
  s.contracts.rift = 1000; assert.equal(contractPrize(s, 'rift').plus, 10); assert.equal(contractTier(s, 'rift'), 10);
});
