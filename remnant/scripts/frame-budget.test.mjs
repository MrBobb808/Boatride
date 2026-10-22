import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/core/frameBudget.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Float32Array, Infinity, Math });
const { FrameBudget } = exports;
/** Feed frames for a number of seconds; returns every level change as [seconds, level]. */
function run(b, secs, dt, work, changes = [], t0 = 0) {
  let last = b.level;
  for (let t = 0; t < secs; t += dt) {
    const l = b.sample(dt, typeof work === 'function' ? work(b.level) : work);
    if (l !== last) { changes.push([+(t0 + t).toFixed(2), l]); last = l; }
  }
  return changes;
}

test('steady 60 FPS stays sharp, and recovery climbs back one rung at a time, even at a 60 FPS cap', () => {
  const b = new FrameBudget();
  assert.deepEqual(run(b, 30, 1 / 60, 5), []);
  b.level = 4;
  const up = run(b, 30, 1 / 60, 5);
  assert.deepEqual(up.map(c => c[1]), [3, 2, 1, 0]);
  for (let i = 1; i < up.length; i++) assert.ok(up[i][0] - up[i - 1][0] >= 4, 'each rung waits for steady headroom');
  // Moderate work at a 60 FPS cap neither drops nor climbs.
  b.level = 1;
  assert.deepEqual(run(b, 20, 1 / 60, 11), []);
});

test('sustained missed frames or CPU overload shed effects before resolution', () => {
  for (const [dt, work] of [[1 / 45, 10], [1 / 60, 15], [1 / 120, 15]]) {
    const b = new FrameBudget();
    const down = run(b, 0.7, dt, work);
    assert.deepEqual(down, [], 'under a second of load changes nothing');
    run(b, 12, dt, work, down, 0.7);
    assert.deepEqual(down.map(c => c[1]), [1, 2, 3, 4]);
    assert.equal(FrameBudget.penalty(2), 0, 'effects rungs keep the resolution');
    assert.deepEqual([1, 2].map(FrameBudget.effects), [1, 2]);
    assert.deepEqual([3, 4].map(FrameBudget.penalty), [1, 2]);
    assert.ok(down[0][0] < 1.6 && down[2][0] < 4.5, 'reacts within a couple of seconds');
  }
});

test('isolated frame spikes are ignored and resetting discards paused samples', () => {
  const b = new FrameBudget();
  assert.deepEqual(run(b, 10, 1 / 60, (l) => 6), []);
  let i = 0;
  for (let t = 0; t < 10; t += 1 / 60) b.sample(i++ % 30 === 0 ? 0.1 : 1 / 60, 6);
  assert.equal(b.level, 0);
  run(b, 0.6, 0.05, 20);
  b.reset();
  run(b, 0.6, 0.05, 20);
  assert.equal(b.level, 0);
});

test('a load that only one rung can carry settles there instead of oscillating', () => {
  const b = new FrameBudget();
  // Full effects overload the frame; one rung down leaves just enough headroom.
  const changes = run(b, 240, 1 / 60, (l) => (l === 0 ? 16 : 7));
  assert.equal(b.level >= 1 && b.level <= 2, true);
  assert.ok(changes.length <= 14, `few retries over four minutes (${changes.length})`);
  const tries = changes.filter(c => c[1] === 0).map(c => c[0]);
  for (let i = 2; i < tries.length; i++) assert.ok(tries[i] - tries[i - 1] >= tries[i - 1] - tries[i - 2] - 0.5, 'each retry waits at least as long');
  assert.ok(tries.at(-1) - tries.at(-2) > 60, 'retries end up a minute apart');
});
