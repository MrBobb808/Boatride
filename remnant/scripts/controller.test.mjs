import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real input module with browser-shaped snapshots, including
// missing events and failures that are hard to reproduce with one device.
const source = ts.transpileModule(readFileSync(new URL('../src/core/input.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

function setup() {
  let pads = [], failure = null, now = 1000;
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const exports = {};
  vm.runInNewContext(source, {
    exports, window, document, structuredClone,
    performance: { now: () => now },
    navigator: { maxTouchPoints: 5, getGamepads: () => { if (failure) throw failure; return pads; } },
  });
  const input = exports.input;
  return {
    input, window, document,
    setPads: (value) => { pads = value; },
    fail: (value) => { failure = value; },
    step: (ms = 16) => { now += ms; input.poll(); input.beginStep(); },
    key: (code, down) => {
      const event = new Event(down ? 'keydown' : 'keyup', { cancelable: true });
      Object.defineProperties(event, { code: { value: code }, repeat: { value: false } });
      window.dispatchEvent(event);
    },
  };
}

function pad(index = 0, id = 'DualSense Wireless Controller') {
  return { index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })) };
}
function press(pad, index, down = true) {
  pad.buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 };
}

test('the first controller action after touch is delivered in controller mode', () => {
  const t = setup(), p = pad();
  t.input.setDevice('touch');
  let device;
  t.input.onAction(a => { if (a === 'confirm') device = t.input.lastDevice; });
  press(p, 0); t.setPads([p]); t.step();
  assert.equal(device, 'gamepad');
  assert.equal(t.input.pressed('jump'), true);
  t.step();
  assert.equal(t.input.pressed('jump'), false, 'holding a button must not repeat its press');
});

test('an active controller in a later slot takes over from an idle pad', () => {
  const t = setup(), idle = pad(0, 'Idle Xbox'), active = pad(3);
  t.setPads([idle, null, null, active]); t.step();
  active.axes[0] = 0.85; press(active, 2); t.step();
  assert.equal(t.input.axisX, 0.85);
  assert.equal(t.input.padName, active.id);
  assert.equal(t.input.pressed('attack'), true);
});

test('disconnect without an event clears held buttons and restores touch controls', () => {
  const t = setup(), p = pad(2);
  press(p, 2); p.axes[0] = 1; t.setPads([null, null, p]); t.step();
  t.setPads([]); t.step();
  assert.equal(t.input.down('attack'), false);
  assert.equal(t.input.axisX, 0);
  assert.equal(t.input.gamepadConnected, false);
  assert.equal(t.input.padName, '');
  assert.equal(t.input.lastDevice, 'touch');
  t.setPads([null, null, p]); t.step();
  assert.equal(t.input.pressed('attack'), true, 'reconnect must re-arm buttons');
});

test('controller loss preserves keyboard input for the same action', () => {
  const t = setup(), p = pad();
  press(p, 2); t.setPads([p]); t.step();
  t.key('KeyJ', true); t.key('KeyD', true); t.setPads([]); t.step();
  assert.equal(t.input.down('attack'), true);
  assert.equal(t.input.axisX, 1);
  t.key('KeyJ', false); t.key('KeyD', false); t.step();
  assert.equal(t.input.down('attack'), false);
});

test('blocked controller access leaves keyboard play running and can recover', () => {
  const t = setup();
  t.key('KeyD', true);
  t.fail(new DOMException('Blocked by Permissions Policy', 'SecurityError'));
  assert.doesNotThrow(() => t.step());
  assert.equal(t.input.axisX, 1);
  assert.equal(t.input.gamepadStatus, 'blocked');
  t.fail(null); t.key('KeyD', false);
  const p = pad(); p.axes[0] = -0.75; t.setPads([p]); t.step();
  assert.equal(t.input.axisX, -0.75);
  assert.equal(t.input.gamepadConnected, true);
});

test('blur clears movement immediately and polling waits for focus', () => {
  const t = setup(), p = pad();
  p.axes[0] = 1; press(p, 2); t.setPads([p]); t.step();
  t.window.dispatchEvent(new Event('blur'));
  assert.equal(t.input.axisX, 0);
  t.step();
  assert.equal(t.input.down('attack'), false);
  assert.equal(t.input.axisX, 0);
  t.window.dispatchEvent(new Event('focus')); t.step();
  assert.equal(t.input.axisX, 1);
});

test('rebinding clears held input, accepts analog triggers, and waits for release', () => {
  const t = setup(), p = pad();
  press(p, 0); t.setPads([p]); t.step();
  let captured = null;
  t.input.capturePadButton(i => { captured = i; t.input.padMap.attack = [i]; });
  press(p, 0, false); t.step();
  assert.equal(t.input.down('jump'), false);
  p.buttons[7] = { pressed: false, touched: true, value: 0.9 }; t.step();
  assert.equal(captured, 7);
  t.step(); assert.equal(t.input.down('attack'), false);
  press(p, 7, false); t.step(); press(p, 7); t.step();
  assert.equal(t.input.pressed('attack'), true);
});

test('a menu action consumed by the current layer never reaches gameplay', () => {
  const t = setup(), p = pad();
  let handled = 0, leaked = 0;
  t.input.onAction(a => { if (a === 'menu') { handled++; return true; } });
  t.input.onAction(a => { if (a === 'menu') leaked++; });
  press(p, 9); t.setPads([p]); t.step();
  assert.equal(handled, 1);
  assert.equal(leaked, 0);
});

test('DualSense directions, quick actions, remaps and stick chord stay intact', () => {
  const t = setup(), p = pad();
  t.setPads([p]); t.step();
  p.axes[1] = -1; press(p, 2); t.step();
  assert.equal(t.input.aimUp, true);
  assert.equal(t.input.pressed('attack'), true);
  p.axes[0] = 1; p.axes[1] = -0.6; t.step();
  assert.equal(t.input.aimUp, false);
  p.axes[0] = p.axes[1] = 0; press(p, 2, false); press(p, 15); t.step();
  assert.equal(t.input.pressed('sub'), true);
  assert.equal(t.input.axisX, 0, 'D-pad quick actions do not move the player');
  press(p, 15, false); press(p, 10); t.step(); press(p, 11); t.step();
  assert.equal(t.input.pressed('transform'), true);
  assert.equal(t.input.down('echo'), false);
  assert.equal(t.input.down('ultimate'), false);
  t.input.padMap.jump = [5]; press(p, 10, false); press(p, 11, false); press(p, 5); t.step();
  assert.equal(t.input.pressed('jump'), true);
});

test('unsupported rumble never interrupts combat', async () => {
  const t = setup(), p = pad();
  p.vibrationActuator = { playEffect: () => { throw new Error('Unsupported effect'); } };
  press(p, 2); t.setPads([p]); t.step();
  assert.doesNotThrow(() => t.input.rumble(0.5, 0.3, 60));
  p.vibrationActuator.playEffect = () => Promise.reject(new Error('Unavailable'));
  assert.doesNotThrow(() => t.input.rumble(0.5, 0.3, 60));
  await new Promise(resolve => setImmediate(resolve));
});
