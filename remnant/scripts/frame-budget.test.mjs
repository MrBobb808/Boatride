import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/core/frameBudget.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { FrameBudget } = exports;
test('steady 60 FPS stays sharp and quality can recover at a 60 FPS cap', () => {
  const b = new FrameBudget(); let p = 2;
  for (let i = 0; i < 1200; i++) p = b.sample(1 / 60, 5, p);
  assert.equal(p, 0);
  for (let i = 0; i < 900; i++) p = b.sample(1 / 60, 11, p);
  assert.equal(p, 0);
});
test('sustained missed frames or CPU overload lower quality with bounded hysteresis', () => {
  for (const [dt, work] of [[1 / 45, 10], [1 / 60, 15]]) {
    const b = new FrameBudget(); let p = 0;
    for (let i = 0; i < 89; i++) p = b.sample(dt, work, p);
    assert.equal(p, 0);
    p = b.sample(dt, work, p); assert.equal(p, 1);
    for (let i = 0; i < 300; i++) p = b.sample(dt, work, p);
    assert.equal(p, 2);
  }
});
test('isolated frame spikes do not resize and resetting discards paused samples', () => {
  const b = new FrameBudget(); let p = 0;
  for (let i = 0; i < 300; i++) p = b.sample(i % 30 === 0 ? 0.1 : 1 / 60, 6, p);
  assert.equal(p, 0);
  for (let i = 0; i < 80; i++) p = b.sample(0.05, 20, p);
  b.reset();
  for (let i = 0; i < 20; i++) p = b.sample(0.05, 20, p);
  assert.equal(p, 0);
});
