import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL('../src/' + path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const settingsSource = compile('core/settings.ts'), audioSource = compile('audio/audio.ts');
function settingsEnv(saved) {
  const key = 'remnant-settings-v1', storage = new Map(saved ? [[key, JSON.stringify(saved)]] : []), exports = {};
  vm.runInNewContext(settingsSource, { exports, structuredClone,
    window: { matchMedia: () => ({ matches: false }) }, navigator: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    require: () => ({ DEFAULT_KEYS: { attack: ['KeyJ'], confirm: ['Enter'] }, DEFAULT_PAD: { attack: [2] }, input: {} }),
  });
  return { ...exports, saved: () => JSON.parse(storage.get(key) ?? 'null') };
}
function engineEnv({ session = true, failSession = false } = {}) {
  const trace = [], document = Object.assign(new EventTarget(), { hidden: false }), exports = {};
  const settings = { mixAudio: true, respectSilent: false, master: 0.85, music: 0.6, sfx: 0.85 }, subs = [];
  const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; } });
  class Node {
    constructor() { for (const key of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = param(); }
    connect() {} start() { trace.push('source'); }
  }
  class AudioContext {
    constructor() { trace.push('construct'); this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 32; this.destination = new Node(); }
    createDynamicsCompressor() { return new Node(); } createGain() { return new Node(); }
    createBiquadFilter() { return new Node(); } createConvolver() { return new Node(); }
    createBufferSource() { return new Node(); }
    createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: n => data[n] }; }
    resume() { trace.push('resume'); this.state = 'running'; return Promise.resolve(); }
    suspend() { trace.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  }
  let type = 'auto'; const navigator = {};
  if (session) Object.defineProperty(navigator, 'audioSession', { get() {
    if (failSession) throw Error('Unavailable');
    return { get type() { return type; }, set type(v) { type = v; trace.push(v); } };
  } });
  vm.runInNewContext(audioSource, { exports, document, navigator, window: { AudioContext },
    performance: { now: () => 10000 }, setTimeout,
    require: path => path.includes('settings') ? { settings, onSettingsChange: cb => subs.push(cb) } : { rand: () => 0 },
  });
  return { engine: new exports.AudioEngine(), settings, document, trace, get type() { return type; }, set type(v) { type = v; }, changed: () => subs.forEach(cb => cb()) };
}
test('old settings opt into mixing before the first gesture while preserving volumes, controls and Silent Mode choice', () => {
  const t = settingsEnv({ v: 3, respectSilent: false, master: 0.45, music: 0, sfx: 0.7, keys: { attack: ['KeyF'] } });
  assert.equal(t.settings.mixAudio, true); assert.equal(t.settings.respectSilent, false);
  assert.equal(t.saved().mixAudio, true); assert.equal(t.saved().v, 4);
  assert.equal(t.settings.master, 0.45); assert.equal(t.settings.music, 0); assert.equal(t.settings.sfx, 0.7);
  assert.deepEqual([...t.settings.keys.attack], ['KeyF']);
});
test('mixing is the fresh/reset default, and explicit opt-outs survive settings reload', () => {
  const t = settingsEnv(); assert.equal(t.settings.mixAudio, true);
  t.settings.mixAudio = false; t.saveSettings();
  assert.equal(settingsEnv(t.saved()).settings.mixAudio, false);
  t.resetSettings(); assert.equal(t.saved().mixAudio, true);
});
test('ambient is selected before constructing or resuming audio; ordinary taps do not restart output', () => {
  const t = engineEnv(); t.engine.unlock();
  assert.ok(t.trace.indexOf('ambient') < t.trace.indexOf('construct'));
  assert.ok(t.trace.indexOf('ambient') < t.trace.indexOf('resume'));
  assert.equal(t.type, 'ambient');
  const before = [...t.trace]; for (let n = 0; n < 20; n++) t.engine.unlock();
  assert.deepEqual(t.trace, before);
  t.settings.sfx = 0.4; t.changed(); assert.ok(!t.trace.includes('playback'));
});
test('only an explicit opt-out can request exclusive playback, and Silent Mode still takes priority', () => {
  const t = engineEnv(); t.engine.unlock();
  t.settings.mixAudio = false; t.changed(); assert.equal(t.type, 'playback');
  t.settings.respectSilent = true; t.changed(); assert.equal(t.type, 'ambient');
  t.settings.respectSilent = false; t.settings.mixAudio = true; t.changed(); assert.equal(t.type, 'ambient');
});
test('returning from Spotify restores mixing before resume; hidden gestures cannot wake game sound', () => {
  const t = engineEnv(); t.engine.unlock(); t.document.hidden = true;
  t.document.dispatchEvent(new Event('visibilitychange')); const before = [...t.trace];
  t.engine.unlock(); assert.deepEqual(t.trace, before);
  t.type = 'playback'; t.document.hidden = false; const n = t.trace.length;
  t.document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(t.trace.slice(n), ['ambient', 'resume']);
});
test('muting the game score also mutes its reverb while preserving independent effects volume', () => {
  const t = engineEnv(); t.engine.unlock();
  t.settings.music = 0; t.changed();
  assert.equal(t.engine.musicBus.gain.value, 0); assert.equal(t.engine.musicVerb.gain.value, 0);
  assert.equal(t.engine.sfxBus.gain.value, 0.85); assert.ok(t.engine.sfxVerb.gain.value > 0);
  t.settings.music = 0.5; t.settings.sfx = 0; t.changed();
  assert.ok(t.engine.musicBus.gain.value > 0 && t.engine.musicVerb.gain.value > 0);
  assert.equal(t.engine.sfxBus.gain.value, 0); assert.equal(t.engine.sfxVerb.gain.value, 0);
});
test('browsers without a usable audio-session API continue playing without throwing', () => {
  for (const opts of [{ session: false }, { failSession: true }]) {
    const t = engineEnv(opts); assert.doesNotThrow(() => t.engine.unlock());
    assert.equal(t.engine.ready, true); assert.equal(t.engine.ctx.state, 'running');
  }
});
