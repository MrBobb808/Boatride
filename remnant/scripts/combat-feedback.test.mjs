import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {}, settings = { dmgNumbers: true, reduceFlashes: false };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/render/fx.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, require: id => {
  if (id.endsWith('/settings')) return { settings };
  if (id.endsWith('/math')) return { rand: (a, b) => (a + b) / 2, TAU: Math.PI * 2 };
  if (id.endsWith('/draw')) return {};
  throw Error(id);
} });
test('squad damage feedback stays bounded at every quality tier', () => {
  for (const [tier, cap] of [[0, 16], [1, 24], [2, 32]]) {
    const fx = new exports.FX(); fx.setTier(tier);
    for (let i = 0; i < 2000; i++) fx.number(i, 0, i);
    assert.equal(fx.nums.length, cap);
    fx.update(2); assert.equal(fx.nums.length, 0);
  }
});
test('damage floods and adaptive tier changes preserve incoming damage and healing', () => {
  const fx = new exports.FX(); fx.setTier(2);
  fx.number(0, 0, 42, false, '#ff8a8a'); fx.number(0, 0, '+80', false, '#9fe39a');
  for (let i = 0; i < 100; i++) fx.number(100, 0, i);
  fx.setTier(0);
  assert.equal(fx.nums.length, 16);
  assert.ok(fx.nums.some(n => n.text === '42' && n.c === '#ff8a8a'));
  assert.ok(fx.nums.some(n => n.text === '+80'));
  for (let i = 0; i < 100; i++) fx.number(0, 0, 'BLOCK');
  assert.equal(fx.nums.length, 16);
  fx.number(0, 0, 999);
  assert.ok(!fx.nums.some(n => n.text === '999'));
});
test('disabled damage numbers and reduced flashes remain respected', () => {
  const fx = new exports.FX();
  settings.dmgNumbers = false; fx.number(0, 0, 10); fx.number(0, 0, 'PARRY');
  assert.equal(fx.nums.length, 1);
  settings.reduceFlashes = true; fx.flash('#ffffff', 1);
  assert.equal(fx.flashA, 0.18);
  settings.dmgNumbers = true; settings.reduceFlashes = false;
});
