import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/render/heroMotion.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const frame = exports.heroFrameAt;
test('charging holds its windup while attacks move into the strike', () => {
  for (const time of [0, 0.2, 3, 27]) for (const progress of [0, 0.5, 0.99]) assert.equal(frame('charge', time, 0, true, 0, progress), 10);
  assert.equal(frame('attack', 80, 0, true, 0, 0.2), 10);
  assert.equal(frame('attack', 80, 0, true, 0, 0.7), 11);
});
test('dodge and air dash poses cannot flicker with the global clock', () => {
  for (const time of [0, 0.125, 5, 8.7, 99]) {
    assert.equal(frame('dodge', time, 300, true, 0, 0, 0.05), 12);
    assert.equal(frame('dodge', time, 300, true, 0, 0, 0.2), 13);
    assert.equal(frame('airdash', time, 300, false, 0, 0, 0.05), 13);
  }
});
test('run frames follow travelled stride and jump/fall follow vertical motion', () => {
  for (const time of [0, 100]) for (let stride = 0; stride < 8; stride++) assert.equal(frame('free', time, 140, true, 0, 0, 0, stride), 4 + stride % 4);
  assert.equal(frame('free', 0, 140, false, -120, 0), 8);
  assert.equal(frame('free', 0, 140, false, 120, 0), 9);
});
