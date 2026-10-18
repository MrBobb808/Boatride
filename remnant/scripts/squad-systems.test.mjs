import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function source(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/' + path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports });
  return exports;
}
const { RunBlessings, BLESSINGS } = source('game/blessings.ts');
const { parseSquadOrders: parse } = source('game/squadLanguage.ts');
const { heroFrameAt, sampleAttackVisual } = source('render/heroMotion.ts');
test('each wave offers three distinct eligible paths, even after every rank is capped', () => {
  const run = new RunBlessings(); run.reset(true);
  for (let i = 0; i < 200; i++) {
    const choices = run.offer(); assert.equal(choices.length, 3); assert.equal(new Set(choices).size, 3);
    for (const id of choices) assert.ok(!BLESSINGS[id].cap || run.rank(id) < BLESSINGS[id].cap);
    run.take(choices[0]);
  }
  for (const id of Object.keys(BLESSINGS)) for (let rank = 0; rank < 5; rank++) run.take(id);
  assert.deepEqual([...run.offer()].sort(), ['balm', 'energy', 'health']);
  assert.equal(run.take('steel'), false);
  assert.equal(run.take('__proto__'), false);
});
test('run bonuses stack with an explicit risk and reset completely', () => {
  const run = new RunBlessings(); run.reset(true);
  run.take('steel'); run.take('steel'); run.take('bond'); run.take('mending'); run.take('rhythm');
  assert.equal(run.weapon, 1.24); assert.equal(run.echoes, 1.15); assert.equal(run.regen, 0.005); assert.equal(run.recharge, 1.18);
  run.take('bloodprice'); assert.ok(run.weapon > 1.4); assert.equal(run.incoming, 1.1);
  run.take('ward'); assert.ok(run.incoming < 1.1);
  run.reset(); assert.equal(run.weapon, 1); assert.equal(run.echoes, 1); assert.equal(run.incoming, 1); assert.equal(run.recharge, 1); assert.equal(run.regen, 0);
  assert.equal(run.take('steel'), false);
});
test('natural squad clauses resolve roles, priorities and four separate orders', () => {
  const result = parse('Keep the guardian near me and have the ninja attack archers, let the mage control groups; healer, protect me.');
  assert.ok(result.ok);
  assert.deepEqual(JSON.parse(JSON.stringify(result.intents)), [
    { role: 'guardian', action: 'guard' }, { role: 'ninja', action: 'hunt', priority: 'ranged' },
    { role: 'mage', action: 'hunt', priority: 'crowd' }, { role: 'herald', action: 'guard' },
  ]);
  for (const [text, action] of [['Everyone, hold here', 'hold'], ['Ninja, get behind them', 'flank'], ['Summon two', 'summon'], ['Sync strike', 'sync'], ['Recall everyone', 'recall']]) assert.equal(parse(text).intents[0].action, action);
});
test('uncertain, negative and partial orders are rejected together', () => {
  for (const text of ['', 'ninja do not attack', 'guardian protect me and bananas', 'something attack', 'guardian and ninja protect me', 'do not summon all', 'attack '.repeat(100)]) assert.equal(parse(text).ok, false, text);
});
test('strike artwork follows actual weapon contact times and stays local to the move', () => {
  for (const start of [0.25, 0.46, 0.72]) for (const clock of [0, 50, 999]) {
    assert.equal(heroFrameAt('attack', clock, 0, true, 0, start - 0.01, 0, 0, start), 10);
    assert.equal(heroFrameAt('attack', clock, 0, true, 0, start, 0, 0, start), 11);
  }
  const out = {};
  for (const heavy of [false, true]) for (const airborne of [false, true]) for (let u = 0; u <= 1.001; u += 0.01) {
    sampleAttackVisual(out, u, 0.4, 0.65, heavy, airborne);
    assert.ok(Math.abs(out.x) < 5 && Math.abs(out.y) < 2);
    if (!airborne) assert.equal(out.y, 0);
    assert.ok(out.sx >= 1 && out.sx <= 1.06 && out.sy > 0.96);
  }
  sampleAttackVisual(out, 1, 0.4, 0.65, true, false);
  assert.deepEqual(out, { x: 0, y: 0, sx: 1, sy: 1 });
});
