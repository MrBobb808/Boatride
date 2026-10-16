// Audio engine: every sound is synthesized with Web Audio, so all audio is
// original. Separate master / music / effects buses, a generated reverb, and
// iOS-specific handling (unlock on touch, silent-switch policy, resume after
// the app returns from the background).

import { settings, onSettingsChange } from '../core/settings';
import { rand } from '../core/math';

type AC = AudioContext;

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AC | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  reverb!: ConvolverNode;
  sfxVerb!: GainNode;
  musicVerb!: GainNode;
  noise!: AudioBuffer;
  private last = new Map<string, number>();
  ready = false;
  /** Global low-pass used for "muffled" moments (pause menu, near-death). */
  duck!: BiquadFilterNode;

  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.applySession();
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.duck = ctx.createBiquadFilter();
    this.duck.type = 'lowpass';
    this.duck.frequency.value = 20000;
    this.duck.Q.value = 0.4;
    this.master.connect(this.duck);
    this.duck.connect(comp);
    comp.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.8, 2.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.9;
    this.reverb.connect(verbOut);
    verbOut.connect(this.master);
    this.sfxVerb = ctx.createGain();
    this.sfxVerb.gain.value = 0.28;
    this.sfxVerb.connect(this.reverb);
    this.musicVerb = ctx.createGain();
    this.musicVerb.gain.value = 0.55;
    this.musicVerb.connect(this.reverb);
    // White noise buffer shared by all noise-based sounds.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    onSettingsChange(() => {
      this.applyVolumes();
      this.applySession();
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
    this.ready = true;
  }

  /** iOS: 'playback' plays even with the ring/silent switch on; 'ambient' respects it. */
  applySession() {
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = settings.respectSilent ? 'ambient' : 'playback';
      } catch {
        /* not supported */
      }
    }
  }

  /** Must be called from a user gesture (touchend / click / keydown). */
  unlock() {
    this.init();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // A one-sample silent buffer kicks iOS into actually starting output.
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
  }

  setMuffled(on: boolean) {
    if (!this.ctx) return;
    this.duck.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, 0.12);
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections then a smooth tail — cathedral-ish.
        const early = i < rate * 0.08 && Math.random() < 0.02 ? 0.6 : 0;
        d[i] = (Math.random() * 2 - 1 + early) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ----- building blocks -----

  env(g: GainNode, t: number, a: number, peak: number, dec: number, sustain = 0, rel = 0) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (sustain > 0) {
      p.setTargetAtTime(peak * sustain, t + a, dec / 3);
      if (rel > 0) {
        // caller schedules release
      }
    } else {
      p.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
  }

  osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, gain = 0.3, a = 0.005, f2?: number, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    this.env(g, t, a, gain, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return { o, g };
  }

  noiseHit(t: number, dur: number, dest: AudioNode, type: BiquadFilterType, f: number, q: number, gain: number, f2?: number, a = 0.003) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const off = Math.random() * 1.5;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    if (f2 !== undefined) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, a, gain, dur);
    s.connect(flt);
    flt.connect(g);
    g.connect(dest);
    s.start(t, off);
    s.stop(t + a + dur + 0.05);
    return g;
  }

  /** Output node for one sfx with pan + reverb send. */
  out(pan = 0, verb = 1): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 1;
    let node: AudioNode = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    if (verb > 0) {
      const v = ctx.createGain();
      v.gain.value = verb;
      node.connect(v);
      v.connect(this.sfxVerb);
    }
    // Disconnect later to let GC reclaim the graph.
    setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 4000);
    return g;
  }

  /** Play a named effect. pan in -1..1, vol multiplier, pitch multiplier. */
  play(name: string, o: { pan?: number; vol?: number; pitch?: number; gap?: number } = {}) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    const gap = o.gap ?? 28;
    const last = this.last.get(name) ?? 0;
    if (nowMs - last < gap) return;
    this.last.set(name, nowMs);
    const fn = SFX[name];
    if (!fn) return;
    try {
      fn(this, this.ctx.currentTime + 0.005, o.vol ?? 1, o.pitch ?? 1, o.pan ?? 0);
    } catch {
      /* never let audio break the game */
    }
  }
}

type SfxFn = (a: AudioEngine, t: number, v: number, p: number, pan: number) => void;

const bell = (a: AudioEngine, t: number, f: number, v: number, dest: AudioNode, dec = 1.6) => {
  const parts = [1, 2.01, 2.76, 4.07, 5.43];
  const amps = [1, 0.5, 0.35, 0.2, 0.12];
  parts.forEach((m, i) => a.osc('sine', f * m, t, dec / (1 + i * 0.6), dest, 0.12 * v * amps[i], 0.002));
};

const metal = (a: AudioEngine, t: number, f: number, v: number, dest: AudioNode, dec = 0.35) => {
  const parts = [1, 1.47, 2.09, 2.56, 3.71];
  parts.forEach((m, i) => a.osc(i % 2 ? 'square' : 'sine', f * m, t, dec / (1 + i * 0.3), dest, 0.05 * v, 0.001));
};

let raspCurve: Float32Array<ArrayBuffer> | null = null;
/** Soft-clipping curve that gives the Locust King's scream its rasp (built once). */
const rasp = () => {
  if (raspCurve) return raspCurve;
  const n = 1024;
  raspCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    raspCurve[i] = Math.tanh(x * 4) * 0.8 + Math.sin(x * 9) * 0.12;
  }
  return raspCurve;
};

/** A tone chopped at `rate` Hz (insect wings), returning its output gain for an envelope. */
const chopped = (a: AudioEngine, t: number, dur: number, rate: number, depth: number) => {
  const ctx = a.ctx!;
  const am = ctx.createGain();
  am.gain.value = 1 - depth;
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = rate;
  const lg = ctx.createGain();
  lg.gain.value = depth;
  lfo.connect(lg);
  lg.connect(am.gain);
  lfo.start(t);
  lfo.stop(t + dur + 0.1);
  return am;
};

export const SFX: Record<string, SfxFn> = {
  swing(a, t, v, p, pan) {
    const d = a.out(pan, 0.2);
    a.noiseHit(t, 0.16, d, 'bandpass', 3200 * p, 1.4, 0.32 * v, 700 * p, 0.02);
    a.noiseHit(t, 0.1, d, 'highpass', 6000, 0.7, 0.06 * v, undefined, 0.01);
  },
  swingHeavy(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    a.noiseHit(t, 0.32, d, 'bandpass', 1800 * p, 1.1, 0.5 * v, 300 * p, 0.06);
    a.osc('sine', 110 * p, t, 0.25, d, 0.12 * v, 0.04, 60);
  },
  swingSpear(a, t, v, p, pan) {
    const d = a.out(pan, 0.2);
    a.noiseHit(t, 0.13, d, 'bandpass', 4200 * p, 2.2, 0.28 * v, 1800 * p, 0.015);
  },
  hit(a, t, v, p, pan) {
    const d = a.out(pan, 0.25);
    a.osc('sine', 170 * p, t, 0.14, d, 0.5 * v, 0.002, 55);
    a.noiseHit(t, 0.09, d, 'lowpass', 2600 * p, 0.8, 0.45 * v, 500);
    a.noiseHit(t, 0.05, d, 'highpass', 5000, 1, 0.12 * v);
  },
  hitHeavy(a, t, v, p, pan) {
    const d = a.out(pan, 0.45);
    a.osc('sine', 120 * p, t, 0.32, d, 0.75 * v, 0.002, 38);
    a.osc('triangle', 240 * p, t, 0.12, d, 0.25 * v, 0.002, 80);
    a.noiseHit(t, 0.22, d, 'lowpass', 1800 * p, 0.7, 0.6 * v, 200);
  },
  crit(a, t, v, p, pan) {
    const d = a.out(pan, 0.6);
    bell(a, t, 1320 * p, 0.7 * v, d, 0.6);
    a.noiseHit(t, 0.1, d, 'highpass', 4000, 1, 0.2 * v);
  },
  hitMetal(a, t, v, p, pan) {
    const d = a.out(pan, 0.5);
    metal(a, t, 520 * p, v, d, 0.4);
    a.noiseHit(t, 0.06, d, 'highpass', 3000, 0.8, 0.3 * v);
  },
  block(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    metal(a, t, 380 * p, 0.8 * v, d, 0.25);
    a.osc('sine', 140, t, 0.1, d, 0.3 * v, 0.002, 70);
  },
  parry(a, t, v, p, pan) {
    const d = a.out(pan, 1);
    metal(a, t, 880 * p, 1.3 * v, d, 0.9);
    bell(a, t, 1760 * p, 0.6 * v, d, 1.2);
    a.noiseHit(t, 0.08, d, 'highpass', 5000, 1, 0.35 * v);
  },
  step(a, t, v, p, pan) {
    const d = a.out(pan, 0.05);
    a.noiseHit(t, 0.05, d, 'bandpass', 900 * p, 1.6, 0.14 * v, 300);
    a.osc('sine', 90 * p, t, 0.05, d, 0.08 * v, 0.002, 50);
  },
  stepWood(a, t, v, p, pan) {
    const d = a.out(pan, 0.05);
    a.osc('triangle', 210 * p, t, 0.07, d, 0.14 * v, 0.002, 120);
    a.noiseHit(t, 0.04, d, 'bandpass', 1400 * p, 2, 0.1 * v);
  },
  stepAsh(a, t, v, p, pan) {
    const d = a.out(pan, 0.03);
    a.noiseHit(t, 0.09, d, 'highpass', 1800 * p, 0.6, 0.08 * v, undefined, 0.01);
  },
  jump(a, t, v, p, pan) {
    const d = a.out(pan, 0.1);
    a.noiseHit(t, 0.12, d, 'bandpass', 1200 * p, 1, 0.12 * v, 2400, 0.01);
  },
  land(a, t, v, p, pan) {
    const d = a.out(pan, 0.1);
    a.osc('sine', 100 * p, t, 0.1, d, 0.3 * v, 0.002, 45);
    a.noiseHit(t, 0.1, d, 'lowpass', 900, 0.8, 0.2 * v);
  },
  dash(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    a.noiseHit(t, 0.22, d, 'bandpass', 900 * p, 0.9, 0.32 * v, 3800, 0.02);
    a.osc('sine', 600 * p, t, 0.15, d, 0.05 * v, 0.01, 1400);
  },
  hurt(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    a.osc('sawtooth', 220 * p, t, 0.18, d, 0.18 * v, 0.005, 110);
    a.noiseHit(t, 0.15, d, 'lowpass', 1500, 1, 0.35 * v, 300);
    a.osc('sine', 80, t, 0.2, d, 0.4 * v, 0.002, 40);
  },
  heartbeat(a, t, v, p, pan) {
    const d = a.out(pan, 0.1);
    a.osc('sine', 60, t, 0.12, d, 0.5 * v, 0.005, 40);
    a.osc('sine', 55, t + 0.18, 0.14, d, 0.35 * v, 0.005, 38);
  },
  death(a, t, v, p, pan) {
    const d = a.out(pan, 1);
    a.osc('sine', 110, t, 1.6, d, 0.4 * v, 0.01, 40);
    bell(a, t + 0.1, 220, 0.6 * v, d, 3);
  },
  heal(a, t, v, p, pan) {
    const d = a.out(pan, 1);
    [0, 4, 7, 12].forEach((s, i) => a.osc('sine', mtof(72 + s), t + i * 0.06, 0.6, d, 0.1 * v, 0.02));
    a.noiseHit(t, 0.5, d, 'bandpass', 4000, 3, 0.05 * v, 8000, 0.1);
  },
  pickup(a, t, v, p, pan) {
    const d = a.out(pan, 0.6);
    a.osc('sine', 1046 * p, t, 0.12, d, 0.12 * v, 0.002);
    a.osc('sine', 1568 * p, t + 0.05, 0.2, d, 0.1 * v, 0.002);
  },
  loot(a, t, v, p, pan) {
    const d = a.out(pan, 0.8);
    [0, 7, 12, 16].forEach((s, i) => bell(a, t + i * 0.05, mtof(79 + s) * p, 0.35 * v, d, 0.8));
  },
  lootRare(a, t, v, p, pan) {
    const d = a.out(pan, 1);
    [0, 4, 7, 11, 14, 19].forEach((s, i) => bell(a, t + i * 0.06, mtof(74 + s), 0.45 * v, d, 1.4));
    a.noiseHit(t, 0.9, d, 'bandpass', 6000, 4, 0.06 * v, 9000, 0.3);
  },
  levelup(a, t, v, p, pan) {
    const d = a.out(0, 1.2);
    const notes = [62, 66, 69, 74, 78, 81, 86];
    notes.forEach((m, i) => bell(a, t + i * 0.07, mtof(m), 0.5 * v, d, 1.6));
    [50, 57, 62, 66].forEach((m) => {
      a.osc('sawtooth', mtof(m), t + 0.3, 1.8, d, 0.04 * v, 0.4, undefined, rand(-8, 8));
      a.osc('sawtooth', mtof(m), t + 0.3, 1.8, d, 0.04 * v, 0.4, undefined, rand(-8, 8));
    });
    a.osc('sine', 73, t, 0.8, d, 0.5 * v, 0.01, 40);
  },
  ui(a, t, v) {
    const d = a.out(0, 0.1);
    a.osc('sine', 1400, t, 0.04, d, 0.06 * v, 0.001);
  },
  uiConfirm(a, t, v) {
    const d = a.out(0, 0.3);
    a.osc('sine', 880, t, 0.08, d, 0.1 * v, 0.002);
    a.osc('sine', 1320, t + 0.05, 0.14, d, 0.09 * v, 0.002);
  },
  uiBack(a, t, v) {
    const d = a.out(0, 0.2);
    a.osc('sine', 660, t, 0.08, d, 0.08 * v, 0.002, 440);
  },
  uiOpen(a, t, v) {
    const d = a.out(0, 0.5);
    a.noiseHit(t, 0.25, d, 'bandpass', 800, 1.2, 0.08 * v, 2400, 0.05);
    bell(a, t + 0.05, 1174, 0.25 * v, d, 0.8);
  },
  huskGroan(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    const ctx = a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * p, t);
    o.frequency.linearRampToValueAtTime(70 * p, t + 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(320, t + 0.6);
    f.Q.value = 4;
    const g = ctx.createGain();
    a.env(g, t, 0.08, 0.32 * v, 0.6);
    o.connect(f); f.connect(g); g.connect(d);
    o.start(t); o.stop(t + 0.8);
    a.noiseHit(t, 0.5, d, 'bandpass', 700, 3, 0.06 * v);
  },
  huskAttack(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    a.osc('sawtooth', 160 * p, t, 0.2, d, 0.12 * v, 0.01, 90);
    a.noiseHit(t, 0.18, d, 'bandpass', 1500, 1.4, 0.2 * v, 500);
  },
  houndGrowl(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    const ctx = a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 62 * p;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lg = ctx.createGain();
    lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = ctx.createGain();
    a.env(g, t, 0.05, 0.3 * v, 0.55);
    o.connect(f); f.connect(g); g.connect(d);
    o.start(t); lfo.start(t);
    o.stop(t + 0.7); lfo.stop(t + 0.7);
  },
  houndBark(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    a.osc('sawtooth', 300 * p, t, 0.12, d, 0.2 * v, 0.004, 140);
    a.noiseHit(t, 0.1, d, 'bandpass', 1100, 2, 0.3 * v);
  },
  bowDraw(a, t, v, p, pan) {
    const d = a.out(pan, 0.2);
    a.noiseHit(t, 0.5, d, 'bandpass', 600, 6, 0.12 * v, 1600, 0.3);
  },
  bowRelease(a, t, v, p, pan) {
    const d = a.out(pan, 0.2);
    a.osc('triangle', 180 * p, t, 0.25, d, 0.25 * v, 0.001, 150);
    a.noiseHit(t, 0.12, d, 'highpass', 2500, 1, 0.15 * v);
  },
  arrowHit(a, t, v, p, pan) {
    const d = a.out(pan, 0.2);
    a.osc('triangle', 600 * p, t, 0.06, d, 0.12 * v, 0.001, 200);
    a.noiseHit(t, 0.05, d, 'bandpass', 2000, 2, 0.15 * v);
  },
  wispHum(a, t, v, p, pan) {
    const d = a.out(pan, 0.8);
    a.noiseHit(t, 0.8, d, 'bandpass', 900 * p, 12, 0.18 * v, 400, 0.2);
    a.osc('sine', 330 * p, t, 0.6, d, 0.05 * v, 0.2, 310);
  },
  wispShot(a, t, v, p, pan) {
    const d = a.out(pan, 0.6);
    a.osc('sine', 700 * p, t, 0.3, d, 0.12 * v, 0.01, 200);
    a.noiseHit(t, 0.25, d, 'bandpass', 1500, 5, 0.1 * v, 500);
  },
  sentinelClank(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    metal(a, t, 210 * p, 0.6 * v, d, 0.18);
  },
  sentinelSlam(a, t, v, p, pan) {
    const d = a.out(pan, 0.6);
    a.osc('sine', 90, t, 0.5, d, 0.8 * v, 0.002, 30);
    a.noiseHit(t, 0.4, d, 'lowpass', 1200, 0.7, 0.6 * v, 100);
    metal(a, t, 160, 0.5 * v, d, 0.4);
  },
  shieldBash(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    metal(a, t, 260 * p, v, d, 0.3);
    a.osc('sine', 110, t, 0.2, d, 0.5 * v, 0.002, 50);
  },
  enemyDie(a, t, v, p, pan) {
    const d = a.out(pan, 0.7);
    a.noiseHit(t, 0.7, d, 'bandpass', 1400 * p, 1.5, 0.2 * v, 200, 0.02);
    a.osc('sine', 300 * p, t, 0.6, d, 0.1 * v, 0.01, 60);
  },
  summon(a, t, v) {
    const d = a.out(0, 1.4);
    [0, 7, 12, 16, 19, 24].forEach((s, i) => a.osc('triangle', mtof(62 + s), t + i * 0.05, 1.2, d, 0.06 * v, 0.08));
    a.noiseHit(t, 1.0, d, 'bandpass', 2000, 2, 0.08 * v, 9000, 0.4);
    a.osc('sine', 55, t, 0.9, d, 0.5 * v, 0.02, 40);
    bell(a, t + 0.2, mtof(86), 0.5 * v, d, 2);
  },
  purify(a, t, v) {
    const d = a.out(0, 1.5);
    [50, 57, 62, 66, 69, 74].forEach((m, i) => {
      a.osc('sawtooth', mtof(m), t + i * 0.12, 2.6, d, 0.035 * v, 0.6, undefined, -6);
      a.osc('sawtooth', mtof(m), t + i * 0.12, 2.6, d, 0.035 * v, 0.6, undefined, 6);
    });
    bell(a, t + 0.8, mtof(86), 0.7 * v, d, 3);
    bell(a, t + 1.0, mtof(81), 0.5 * v, d, 3);
    a.osc('sine', 45, t, 1.6, d, 0.6 * v, 0.1, 35);
  },
  echoAttack(a, t, v, p, pan) {
    const d = a.out(pan, 0.5);
    a.noiseHit(t, 0.14, d, 'bandpass', 2600 * p, 2, 0.16 * v, 900, 0.02);
    a.osc('sine', 880 * p, t, 0.15, d, 0.04 * v, 0.005);
  },
  swordWord(a, t, v) {
    const d = a.out(0, 1);
    a.noiseHit(t, 0.4, d, 'bandpass', 1500, 1.5, 0.35 * v, 6000, 0.02);
    [74, 81, 86].forEach((m, i) => bell(a, t + i * 0.03, mtof(m), 0.4 * v, d, 0.9));
  },
  trumpet(a, t, v) {
    const d = a.out(0, 1.4);
    const ctx = a.ctx!;
    const notes = [[62, 0, 0.22], [69, 0.24, 0.22], [74, 0.48, 1.1]] as const;
    for (const [m, dt, dur] of notes) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(400, t + dt);
        f.frequency.linearRampToValueAtTime(3200, t + dt + 0.06);
        f.frequency.setTargetAtTime(1800, t + dt + 0.08, 0.2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.linearRampToValueAtTime(0.13 * v, t + dt + 0.04);
        g.gain.setTargetAtTime(0.0001, t + dt + dur, 0.12);
        o.connect(f); f.connect(g); g.connect(d);
        o.start(t + dt); o.stop(t + dt + dur + 0.6);
      }
    }
    a.osc('sine', 60, t + 0.48, 0.8, d, 0.7 * v, 0.005, 30);
    a.noiseHit(t + 0.48, 0.6, d, 'lowpass', 900, 0.7, 0.5 * v, 100);
  },
  shieldFaith(a, t, v) {
    const d = a.out(0, 1);
    [79, 83, 86, 91].forEach((m, i) => a.osc('sine', mtof(m), t + i * 0.02, 0.8, d, 0.07 * v, 0.03));
    metal(a, t, 1200, 0.4 * v, d, 0.6);
  },
  lion(a, t, v) {
    const d = a.out(0, 1);
    a.noiseHit(t, 0.9, d, 'bandpass', 500, 2, 0.6 * v, 220, 0.08);
    a.osc('sawtooth', 110, t, 0.9, d, 0.15 * v, 0.08, 70);
    a.osc('sine', 55, t, 1, d, 0.5 * v, 0.05, 40);
  },
  stillWaters(a, t, v) {
    const d = a.out(0, 1.2);
    for (let i = 0; i < 8; i++) a.osc('sine', rand(500, 1200), t + i * 0.08, 0.15, d, 0.06 * v, 0.005, rand(800, 1800));
    [65, 69, 72, 77].forEach((m) => a.osc('sine', mtof(m), t, 1.6, d, 0.05 * v, 0.3));
  },
  pillarFire(a, t, v) {
    const d = a.out(0, 1);
    a.noiseHit(t, 1.2, d, 'lowpass', 600, 0.8, 0.8 * v, 3000, 0.1);
    a.osc('sine', 70, t, 1.1, d, 0.6 * v, 0.05, 35);
    for (let i = 0; i < 10; i++) a.noiseHit(t + rand(0.1, 1), 0.03, d, 'highpass', 4000, 1, 0.15 * v);
  },
  chains(a, t, v) {
    const d = a.out(0, 1);
    for (let i = 0; i < 6; i++) metal(a, t + i * 0.035, rand(700, 1400), 0.5 * v, d, 0.25);
    a.osc('sine', 80, t, 0.4, d, 0.5 * v, 0.005, 40);
  },
  armorLight(a, t, v) {
    const d = a.out(0, 1.4);
    [62, 69, 74, 78, 81, 86].forEach((m, i) => bell(a, t + i * 0.08, mtof(m), 0.5 * v, d, 2));
    a.noiseHit(t, 1.2, d, 'bandpass', 3000, 2, 0.1 * v, 9000, 0.6);
  },
  rally(a, t, v) {
    const d = a.out(0, 1.6);
    a.osc('sine', 40, t, 2.6, d, 0.9 * v, 0.8, 30);
    a.noiseHit(t, 1.4, d, 'highpass', 3000, 0.7, 0.15 * v, 9000, 1.3);
    [38, 45, 50, 57, 62, 66, 69, 74].forEach((m, i) => {
      a.osc('sawtooth', mtof(m), t + 0.9 + i * 0.04, 2.4, d, 0.04 * v, 0.5, undefined, -7);
      a.osc('sawtooth', mtof(m), t + 0.9 + i * 0.04, 2.4, d, 0.04 * v, 0.5, undefined, 7);
    });
    bell(a, t + 1.4, mtof(86), v, d, 3);
    bell(a, t + 1.4, mtof(74), v, d, 3);
  },
  execute(a, t, v) {
    const d = a.out(0, 1);
    a.osc('sine', 100, t, 0.6, d, v, 0.002, 30);
    a.noiseHit(t, 0.5, d, 'lowpass', 2500, 0.7, 0.8 * v, 150);
    metal(a, t, 700, 0.8 * v, d, 0.8);
    bell(a, t + 0.05, mtof(81), 0.6 * v, d, 1.5);
  },
  stagger(a, t, v, p, pan) {
    const d = a.out(pan, 0.8);
    metal(a, t, 300, v, d, 0.6);
    a.osc('sine', 200, t, 0.5, d, 0.3 * v, 0.005, 60);
  },
  charge(a, t, v) {
    const d = a.out(0, 0.3);
    a.osc('sine', 300, t, 0.4, d, 0.05 * v, 0.2, 700);
  },
  chargeFull(a, t, v) {
    const d = a.out(0, 0.6);
    bell(a, t, 1568, 0.5 * v, d, 0.6);
  },
  bossStomp(a, t, v, p, pan) {
    const d = a.out(pan, 0.5);
    a.osc('sine', 55 * p, t, 0.6, d, 0.9 * v, 0.002, 28);
    a.noiseHit(t, 0.35, d, 'lowpass', 500, 0.7, 0.6 * v, 80);
  },
  bossRoar(a, t, v) {
    const d = a.out(0, 1.2);
    for (const det of [-30, -10, 10, 30]) a.osc('sawtooth', 65, t, 1.8, d, 0.09 * v, 0.2, 48, det);
    a.noiseHit(t, 1.8, d, 'bandpass', 400, 1.2, 0.6 * v, 160, 0.2);
    metal(a, t + 0.1, 140, 0.6 * v, d, 1.4);
  },
  roar(a, t, v, p, pan) {
    // A great cat's roar: a throat that opens and closes, a rattle in it, the chest under it.
    const d = a.out(pan, 0.7);
    const ctx = a.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(380 * p, t);
    f.frequency.linearRampToValueAtTime(820 * p, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(260 * p, t + 0.95);
    const am = chopped(a, t, 1, 26, 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32 * v, t + 0.12);
    g.gain.setValueAtTime(0.3 * v, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    for (const det of [-25, 0, 25]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(80 * p, t);
      o.frequency.linearRampToValueAtTime(104 * p, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(58 * p, t + 0.95);
      o.connect(f);
      o.start(t);
      o.stop(t + 1.05);
    }
    f.connect(am);
    am.connect(g);
    g.connect(d);
    a.noiseHit(t, 0.9, d, 'bandpass', 600 * p, 1.4, 0.36 * v, 220, 0.08);
    a.osc('sine', 52 * p, t, 0.9, d, 0.3 * v, 0.1, 38 * p);
  },
  pounce(a, t, v, p, pan) {
    // The leap (a rush of air), then the landing: weight, claws on stone, a snarl.
    const d = a.out(pan, 0.5);
    a.noiseHit(t, 0.28, d, 'bandpass', 500 * p, 1, 0.4 * v, 2400 * p, 0.12);
    a.osc('sawtooth', 140 * p, t + 0.02, 0.22, d, 0.06 * v, 0.03, 220 * p);
    a.osc('sine', 85 * p, t + 0.3, 0.3, d, 0.6 * v, 0.003, 36);
    a.noiseHit(t + 0.3, 0.2, d, 'lowpass', 1000, 0.8, 0.45 * v, 140);
    for (let i = 0; i < 4; i++) a.noiseHit(t + 0.31 + i * 0.03, 0.03, d, 'highpass', rand(3500, 6000), 2, 0.18 * v, undefined, 0.001);
  },
  bite(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    a.noiseHit(t, 0.12, d, 'bandpass', 1400 * p, 1.8, 0.5 * v, 400, 0.005);
    a.osc('square', 140 * p, t, 0.08, d, 0.12 * v, 0.002, 70);
    metal(a, t + 0.02, 300 * p, 0.3 * v, d, 0.12);
  },
  flame(a, t, v, p, pan) {
    const d = a.out(pan, 0.6);
    a.noiseHit(t, 1.1, d, 'lowpass', 1100 * p, 0.6, 0.55 * v, 600, 0.12);
    a.noiseHit(t, 1.0, d, 'bandpass', 2400 * p, 0.8, 0.18 * v, 1200, 0.2);
  },
  howl(a, t, v, p, pan) {
    const d = a.out(pan, 1.2);
    for (const det of [-12, 0, 12]) a.osc('triangle', 260 * p, t, 1.5, d, 0.08 * v, 0.3, 380 * p, det);
    a.osc('sawtooth', 130 * p, t, 1.4, d, 0.05 * v, 0.3, 190 * p);
  },
  clash(a, t, v, p, pan) {
    const d = a.out(pan, 0.9);
    metal(a, t, 640 * p, 1.1 * v, d, 0.7);
    metal(a, t + 0.012, 980 * p, 0.6 * v, d, 0.5);
    a.noiseHit(t, 0.06, d, 'highpass', 4500, 1, 0.3 * v);
  },
  bossSlam(a, t, v, p, pan) {
    const d = a.out(pan, 0.9);
    a.osc('sine', 70, t, 0.9, d, v, 0.002, 25);
    a.noiseHit(t, 0.7, d, 'lowpass', 1600, 0.7, 0.9 * v, 90);
    metal(a, t, 120, 0.7 * v, d, 0.9);
  },
  bossSweep(a, t, v, p, pan) {
    const d = a.out(pan, 0.5);
    a.noiseHit(t, 0.6, d, 'bandpass', 500, 1, 0.6 * v, 2200, 0.15);
  },
  shatter(a, t, v) {
    const d = a.out(0, 1.4);
    for (let i = 0; i < 14; i++) metal(a, t + rand(0, 0.6), rand(800, 3000), 0.35 * v, d, rand(0.2, 0.8));
    a.noiseHit(t, 1.5, d, 'highpass', 2000, 0.5, 0.5 * v, 600, 0.01);
    a.osc('sine', 50, t, 1.4, d, 0.8 * v, 0.01, 25);
  },
  rumble(a, t, v) {
    const d = a.out(0, 0.6);
    a.noiseHit(t, 1.6, d, 'lowpass', 160, 0.8, 0.9 * v, 60, 0.3);
  },
  beamCharge(a, t, v, p, pan) {
    const d = a.out(pan, 0.8);
    a.osc('sawtooth', 120, t, 0.9, d, 0.08 * v, 0.6, 520);
    a.osc('sine', 240, t, 0.9, d, 0.06 * v, 0.6, 1040);
  },
  beam(a, t, v, p, pan) {
    const d = a.out(pan, 0.8);
    a.noiseHit(t, 1.1, d, 'bandpass', 900, 1.5, 0.5 * v, 400, 0.02);
    a.osc('sawtooth', 90, t, 1.1, d, 0.12 * v, 0.02, 70);
  },
  molten(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    a.noiseHit(t, 0.3, d, 'lowpass', 1200, 1, 0.35 * v, 200);
    a.osc('sine', 300 * p, t, 0.2, d, 0.1 * v, 0.002, 120);
  },
  door(a, t, v) {
    const d = a.out(0, 0.8);
    a.noiseHit(t, 0.9, d, 'lowpass', 400, 1, 0.5 * v, 120, 0.05);
    a.osc('sine', 60, t + 0.7, 0.4, d, 0.6 * v, 0.002, 35);
  },
  altar(a, t, v) {
    const d = a.out(0, 1.5);
    [62, 69, 74, 78].forEach((m, i) => bell(a, t + i * 0.12, mtof(m), 0.45 * v, d, 2.5));
  },
  chest(a, t, v) {
    const d = a.out(0, 0.5);
    a.noiseHit(t, 0.3, d, 'bandpass', 500, 3, 0.25 * v, 900, 0.05);
    a.osc('triangle', 180, t + 0.25, 0.1, d, 0.2 * v, 0.002, 120);
  },
  wallBreak(a, t, v) {
    const d = a.out(0, 1);
    a.osc('sine', 60, t, 0.8, d, v, 0.002, 30);
    a.noiseHit(t, 0.9, d, 'lowpass', 2500, 0.7, 0.9 * v, 120);
    for (let i = 0; i < 8; i++) a.noiseHit(t + rand(0.05, 0.6), 0.06, d, 'bandpass', rand(800, 2000), 2, 0.3 * v);
  },
  whoosh(a, t, v) {
    const d = a.out(0, 0.8);
    a.noiseHit(t, 0.8, d, 'bandpass', 300, 1, 0.3 * v, 3000, 0.4);
  },
  bell(a, t, v, p) {
    const d = a.out(0, 1.5);
    bell(a, t, 196 * p, v, d, 4);
  },
  inscription(a, t, v) {
    const d = a.out(0, 1.6);
    [74, 78, 81, 86].forEach((m, i) => a.osc('sine', mtof(m), t + i * 0.18, 2.2, d, 0.06 * v, 0.4));
    bell(a, t, mtof(62), 0.6 * v, d, 3.5);
  },
  denied(a, t, v) {
    const d = a.out(0, 0.2);
    a.osc('square', 140, t, 0.12, d, 0.05 * v, 0.002);
    a.osc('square', 110, t + 0.1, 0.14, d, 0.05 * v, 0.002);
  },

  // ----- Chapter III: the swarm
  buzz(a, t, v, p, pan) {
    // Insect wings: a sawtooth chopped at wingbeat rate through a nasal band, a little doppler.
    const d = a.out(pan, 0.3);
    const ctx = a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(165 * p, t);
    o.frequency.linearRampToValueAtTime(205 * p, t + 0.18);
    o.frequency.linearRampToValueAtTime(175 * p, t + 0.42);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100 * p;
    f.Q.value = 1.6;
    const am = chopped(a, t, 0.45, 52 * p, 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * v, t + 0.06);
    g.gain.setValueAtTime(0.3 * v, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
    o.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(d);
    o.start(t);
    o.stop(t + 0.5);
    a.noiseHit(t, 0.38, d, 'bandpass', 2400 * p, 3, 0.06 * v, 1800 * p, 0.05);
  },
  chitter(a, t, v, p, pan) {
    // Mandibles: a ragged run of dry clicks.
    const d = a.out(pan, 0.2);
    const n = 6 + Math.floor(rand(0, 4));
    let tt = t;
    for (let i = 0; i < n; i++) {
      a.noiseHit(tt, 0.014, d, 'bandpass', rand(2600, 4200) * p, 7, 0.8 * v * rand(0.6, 1), undefined, 0.001);
      a.osc('square', rand(1500, 2100) * p, tt, 0.01, d, 0.03 * v, 0.001);
      tt += rand(0.022, 0.05);
    }
  },
  skitter(a, t, v, p, pan) {
    // Many legs on stone: tiny taps scattered over a third of a second.
    const d = a.out(pan, 0.1);
    for (let i = 0; i < 16; i++) a.noiseHit(t + rand(0, 0.32), 0.008, d, 'highpass', rand(3500, 6500) * p, 1.2, 0.2 * v * rand(0.4, 1), undefined, 0.0008);
    a.noiseHit(t, 0.3, d, 'bandpass', 5200 * p, 2, 0.02 * v, undefined, 0.1);
  },
  acid(a, t, v, p, pan) {
    // A wet spit, then the sizzle where it lands.
    const d = a.out(pan, 0.35);
    a.noiseHit(t, 0.12, d, 'lowpass', 2400 * p, 2.5, 0.35 * v, 400, 0.004);
    a.osc('sine', 620 * p, t, 0.07, d, 0.14 * v, 0.003, 180 * p);
    a.noiseHit(t + 0.05, 0.6, d, 'highpass', 5200, 0.8, 0.12 * v, 7000, 0.04);
    for (let i = 0; i < 9; i++) a.noiseHit(t + 0.06 + rand(0, 0.5), 0.01, d, 'highpass', rand(3000, 7000), 1, 0.14 * v, undefined, 0.001);
  },
  screech(a, t, v, p, pan) {
    // The Locust King's roar: a harsh rising insect scream with grinding wings in its throat.
    const d = a.out(pan, 1.1);
    const ctx = a.ctx!;
    const shaper = ctx.createWaveShaper();
    shaper.curve = rasp();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900 * p, t);
    f.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.75);
    f.Q.value = 1.4;
    const am = chopped(a, t, 1.05, 46, 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.26 * v, t + 0.12);
    g.gain.linearRampToValueAtTime(0.36 * v, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    for (const [det, type] of [[-18, 'sawtooth'], [0, 'square'], [21, 'sawtooth']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      o.frequency.setValueAtTime(260 * p, t);
      o.frequency.exponentialRampToValueAtTime(820 * p, t + 0.8);
      o.frequency.linearRampToValueAtTime(760 * p, t + 1);
      o.connect(shaper);
      o.start(t);
      o.stop(t + 1.1);
    }
    shaper.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(d);
    a.noiseHit(t, 1, d, 'bandpass', 1800 * p, 2, 0.28 * v, 4200 * p, 0.15);
    a.osc('sawtooth', 70 * p, t, 0.7, d, 0.14 * v, 0.05, 50 * p);
  },
  wingbeat(a, t, v, p, pan) {
    // One heavy downstroke: a pressure thump with a chitin rattle.
    const d = a.out(pan, 0.4);
    a.noiseHit(t, 0.28, d, 'bandpass', 260 * p, 1.1, 0.7 * v, 900 * p, 0.05);
    a.noiseHit(t + 0.05, 0.2, d, 'lowpass', 500 * p, 0.8, 0.4 * v, 120, 0.03);
    a.osc('sine', 85 * p, t + 0.04, 0.22, d, 0.35 * v, 0.03, 45 * p);
    a.noiseHit(t + 0.02, 0.09, d, 'bandpass', 3200 * p, 3, 0.08 * v);
  },
  arise(a, t, v) {
    // A fallen foe rises to serve: the ground swells for a second, then the summons lands.
    const d = a.out(0, 1.6);
    const ctx = a.ctx!;
    a.osc('sine', 36, t, 1.5, d, 0.32 * v, 1, 48);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(140, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 1.1);
    f.frequency.exponentialRampToValueAtTime(500, t + 1.6);
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035 * v, t + 1.05);
    g.gain.setTargetAtTime(0.0001, t + 1.15, 0.25);
    f.connect(g);
    g.connect(d);
    for (const m of [26, 33, 38, 41, 45]) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + 2.3);
      }
    }
    a.noiseHit(t, 1.05, d, 'bandpass', 300, 1.2, 0.22 * v, 2400, 0.95);
    a.osc('sine', 90, t + 1.1, 0.7, d, 0.55 * v, 0.004, 30);
    a.noiseHit(t + 1.1, 0.5, d, 'lowpass', 1600, 0.7, 0.4 * v, 90);
    bell(a, t + 1.1, mtof(38), 0.7 * v, d, 2.2);
    bell(a, t + 1.12, mtof(45), 0.45 * v, d, 2);
  },
  transform(a, t, v) {
    // The Shadow Mantle: darkness drawn in for 0.7 s, then a burst that shakes the room.
    const d = a.out(0, 1.5);
    const ctx = a.ctx!;
    a.osc('sine', 38, t, 0.75, d, 0.32 * v, 0.62, 72);
    a.noiseHit(t, 0.75, d, 'bandpass', 180, 2, 0.26 * v, 3200, 0.68);
    a.noiseHit(t, 0.75, d, 'highpass', 900, 0.8, 0.08 * v, 5200, 0.7);
    // A dark, detuned minor cluster opening up as the shadows gather.
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(120, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.72);
    f.frequency.exponentialRampToValueAtTime(380, t + 1.9);
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03 * v, t + 0.7);
    g.gain.setTargetAtTime(0.0001, t + 0.9, 0.35);
    f.connect(g);
    g.connect(d);
    for (const m of [29, 36, 39, 43, 46]) {
      for (const det of [-11, 11]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + 2.4);
      }
    }
    // The burst.
    const b = t + 0.72;
    a.osc('sine', 74, b, 1.5, d, 0.85 * v, 0.003, 22);
    a.osc('triangle', 160, b, 0.4, d, 0.2 * v, 0.003, 45);
    a.noiseHit(b, 1.1, d, 'lowpass', 2400, 0.7, 0.6 * v, 70, 0.003);
    a.noiseHit(b, 0.5, d, 'highpass', 5200, 0.6, 0.14 * v, 9000, 0.002);
    metal(a, b, 82, 0.4 * v, d, 1.3);
    bell(a, b + 0.02, mtof(50), 0.4 * v, d, 2.4);
    bell(a, b + 0.04, mtof(57), 0.3 * v, d, 2.2);
    bell(a, b + 0.06, mtof(62), 0.22 * v, d, 2);
  },
  mantleReady(a, t, v) {
    const d = a.out(0, 1);
    bell(a, t, mtof(62), 0.3 * v, d, 1.4);
    bell(a, t + 0.09, mtof(69), 0.26 * v, d, 1.6);
    a.osc('sine', 55, t, 0.5, d, 0.18 * v, 0.02, 40);
    a.noiseHit(t, 0.4, d, 'bandpass', 5200, 4, 0.06 * v, 7000, 0.02);
  },
  mantleEnd(a, t, v) {
    // The Mantle unravels: a falling breath of dark air.
    const d = a.out(0, 0.8);
    a.noiseHit(t, 0.6, d, 'bandpass', 2600, 1.2, 0.26 * v, 180, 0.04);
    a.osc('sine', 230, t, 0.5, d, 0.1 * v, 0.02, 80);
    a.osc('sine', 46, t, 0.6, d, 0.2 * v, 0.01, 30);
  },
  teleport(a, t, v, p, pan) {
    // Dark air drawn inward, then a pop.
    const d = a.out(pan, 0.6);
    a.noiseHit(t, 0.22, d, 'bandpass', 3800 * p, 1.4, 0.4 * v, 260 * p, 0.12);
    a.osc('sine', 140 * p, t, 0.2, d, 0.18 * v, 0.1, 55);
    a.osc('sine', 1100 * p, t + 0.2, 0.06, d, 0.22 * v, 0.001, 180 * p);
    a.noiseHit(t + 0.2, 0.03, d, 'highpass', 3000, 1, 0.25 * v);
  },
  slice(a, t, v, p, pan) {
    // A clean, sharp metallic cut.
    const d = a.out(pan, 0.4);
    a.noiseHit(t, 0.07, d, 'highpass', 6500 * p, 1.2, 0.3 * v, 3200 * p, 0.004);
    metal(a, t + 0.01, 1850 * p, 0.55 * v, d, 0.28);
    a.osc('sine', 3400 * p, t + 0.008, 0.22, d, 0.04 * v, 0.001);
  },
  finisher(a, t, v, p, pan) {
    // The slow-motion killing blow: a huge boom, a crash, and the ground still shaking after.
    const d = a.out(pan, 1.4);
    a.osc('sine', 78 * p, t, 1.6, d, 0.75 * v, 0.003, 24);
    a.osc('triangle', 150 * p, t, 0.5, d, 0.22 * v, 0.003, 40);
    a.noiseHit(t, 0.9, d, 'lowpass', 2200, 0.7, 0.6 * v, 70, 0.003);
    a.noiseHit(t, 1.4, d, 'highpass', 2600, 0.6, 0.12 * v, 900, 0.004);
    metal(a, t, 95 * p, 0.55 * v, d, 1.2);
    a.noiseHit(t + 0.25, 1.6, d, 'lowpass', 140, 0.8, 0.45 * v, 50, 0.3);
  },
  // ----- Chapter IV: Babylon, the furnace, the Image
  fireball(a, t, v, p, pan) {
    // Flung fire: a roaring whoosh with crackle riding on it.
    const d = a.out(pan, 0.5);
    a.noiseHit(t, 0.55, d, 'bandpass', 380 * p, 0.8, 0.5 * v, 1600 * p, 0.05);
    a.noiseHit(t, 0.5, d, 'lowpass', 700 * p, 0.7, 0.3 * v, 260, 0.04);
    a.osc('sine', 120 * p, t, 0.4, d, 0.16 * v, 0.03, 70);
    for (let i = 0; i < 8; i++) a.noiseHit(t + rand(0, 0.45), 0.012, d, 'highpass', rand(2500, 6000), 1, 0.15 * v, undefined, 0.001);
  },
  fireBurst(a, t, v, p, pan) {
    // Fire bursting outward: a thump, a bloom of flame, embers spitting after.
    const d = a.out(pan, 0.9);
    a.osc('sine', 70 * p, t, 0.6, d, 0.75 * v, 0.003, 30);
    a.noiseHit(t, 0.9, d, 'lowpass', 2200 * p, 0.7, 0.7 * v, 220, 0.01);
    a.noiseHit(t + 0.05, 1.1, d, 'bandpass', 900 * p, 0.8, 0.3 * v, 400, 0.1);
    for (let i = 0; i < 14; i++) a.noiseHit(t + rand(0.05, 1), 0.012, d, 'highpass', rand(3000, 7000), 1, 0.16 * v, undefined, 0.001);
  },
  chant(a, t, v, p, pan) {
    // Priests intoning: three voices on an open fifth and a minor third, the vowel closing.
    const d = a.out(pan, 1.2);
    const ctx = a.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14 * v, t + 0.25);
    g.gain.setValueAtTime(0.14 * v, t + 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    g.connect(d);
    const mixG = ctx.createGain();
    for (const [f0, f1, q, amp] of [[700, 360, 6, 1], [1100, 760, 7, 0.45], [2500, 2300, 9, 0.15]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.linearRampToValueAtTime(f1, t + 1.2);
      bp.Q.value = q;
      const ag = ctx.createGain();
      ag.gain.value = amp * 2;
      mixG.connect(bp);
      bp.connect(ag);
      ag.connect(g);
    }
    for (const m of [45, 52, 48]) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m) * p;
        o.detune.value = det + rand(-4, 4);
        o.connect(mixG);
        o.start(t);
        o.stop(t + 1.6);
      }
    }
  },
  horn(a, t, v) {
    // The herald's cornet: a short pickup, a lip slide up, a long blast with a fifth beneath.
    const d = a.out(0, 1.5);
    const ctx = a.ctx!;
    const notes = [[64, 0, 0.14, 0], [69, 0.16, 0.14, 0], [76, 0.34, 1.5, 2]] as const;
    for (const [m, dt, dur, slide] of notes) {
      for (const [det, k] of [[-6, 1], [6, 1], [0, 0.5]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(mtof(m - slide), t + dt);
        if (slide) o.frequency.exponentialRampToValueAtTime(mtof(m), t + dt + 0.12);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(500, t + dt);
        f.frequency.linearRampToValueAtTime(3600, t + dt + 0.07);
        f.frequency.setTargetAtTime(2000, t + dt + 0.1, 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.linearRampToValueAtTime(0.12 * v * k, t + dt + 0.04);
        g.gain.setTargetAtTime(0.0001, t + dt + dur, 0.15);
        o.connect(f);
        f.connect(g);
        g.connect(d);
        o.start(t + dt);
        o.stop(t + dt + dur + 0.8);
      }
    }
    a.osc('sawtooth', mtof(69), t + 0.34, 1.5, d, 0.05 * v, 0.1);
    a.noiseHit(t + 0.34, 1.4, d, 'bandpass', 1800, 2, 0.05 * v, undefined, 0.2);
  },
  goldGong(a, t, v, p) {
    // A great gong of gold: a dark bloom, a beating shimmer, a long tail.
    const d = a.out(0, 1.6);
    const f = 82 * p;
    const parts = [1, 1.48, 1.97, 2.53, 3.21, 4.1, 5.2];
    parts.forEach((m, i) => a.osc('sine', f * m, t, 6 / (1 + i * 0.35), d, (0.22 * v) / (1 + i * 0.5), 0.02 + i * 0.04, undefined, i % 2 ? 4 : -3));
    a.osc('sine', f * 2.02, t, 5, d, 0.06 * v, 0.6);
    a.noiseHit(t, 0.12, d, 'lowpass', 900, 0.8, 0.5 * v, 200, 0.002);
    a.noiseHit(t, 2.5, d, 'bandpass', 3400, 3, 0.04 * v, 2000, 0.6);
    bell(a, t + 0.02, f * 8, 0.3 * v, d, 3);
  },
  colossusStep(a, t, v, p, pan) {
    // A footfall that shakes the plain: a sub boom, the thud, the metal body groaning after.
    const d = a.out(pan, 0.8);
    a.osc('sine', 46 * p, t, 1.4, d, 1.1 * v, 0.004, 18);
    a.osc('triangle', 90 * p, t, 0.3, d, 0.3 * v, 0.003, 40);
    a.noiseHit(t, 0.6, d, 'lowpass', 600, 0.7, 0.8 * v, 60, 0.004);
    metal(a, t + 0.04, 70 * p, 0.6 * v, d, 1.2);
    for (let i = 0; i < 7; i++) a.noiseHit(t + rand(0.1, 0.7), 0.04, d, 'bandpass', rand(600, 1800), 2, 0.12 * v);
  },
  stoneCrack(a, t, v, p, pan) {
    // Stone splitting: a sharp report, then grinding as the crack runs.
    const d = a.out(pan, 0.8);
    a.noiseHit(t, 0.06, d, 'highpass', 1800 * p, 0.8, 0.8 * v, undefined, 0.001);
    a.osc('square', 180 * p, t, 0.05, d, 0.12 * v, 0.001, 90);
    a.osc('sine', 60 * p, t, 0.6, d, 0.5 * v, 0.003, 30);
    let tt = t + 0.05;
    for (let i = 0; i < 10; i++) {
      a.noiseHit(tt, 0.05, d, 'bandpass', rand(500, 1600) * p, 3, 0.25 * v * (1 - i * 0.07), undefined, 0.002);
      tt += rand(0.03, 0.08);
    }
    a.noiseHit(t + 0.1, 0.9, d, 'lowpass', 300, 0.8, 0.3 * v, 80, 0.1);
  },
  furnaceBlast(a, t, v, p) {
    // The furnace door's breath: a roar of fire swelling out of the dark and booming.
    const d = a.out(0, 1.2);
    a.noiseHit(t, 1.6, d, 'lowpass', 260 * p, 0.8, 0.9 * v, 1800 * p, 0.35);
    a.noiseHit(t + 0.2, 1.4, d, 'bandpass', 700 * p, 0.7, 0.4 * v, 300, 0.3);
    a.osc('sine', 40 * p, t + 0.25, 1.4, d, 0.8 * v, 0.2, 28);
    a.osc('sawtooth', 55 * p, t + 0.2, 1.2, d, 0.06 * v, 0.3, 40);
    for (let i = 0; i < 16; i++) a.noiseHit(t + rand(0.3, 1.6), 0.012, d, 'highpass', rand(2500, 6500), 1, 0.14 * v, undefined, 0.001);
  },
  shatterGold(a, t, v) {
    // The Image breaking apart: a colossal boom; gold and silver ring out, brass and iron
    // clatter down, clay crumbles, and the ground rumbles under it all.
    const d = a.out(0, 1.6);
    a.osc('sine', 52, t, 2.4, d, 1.1 * v, 0.003, 18);
    a.noiseHit(t, 1.2, d, 'lowpass', 3000, 0.7, 0.9 * v, 90, 0.002);
    for (let i = 0; i < 6; i++) bell(a, t + rand(0, 0.5), rand(900, 2400), 0.35 * v, d, rand(1.4, 2.6));
    for (let i = 0; i < 18; i++) metal(a, t + rand(0.05, 1.6), rand(220, 1400), 0.45 * v, d, rand(0.2, 0.9));
    for (let i = 0; i < 12; i++) a.noiseHit(t + rand(0.4, 2.2), 0.08, d, 'lowpass', rand(400, 1200), 1, 0.3 * v, 120, 0.002);
    a.noiseHit(t + 0.3, 2.6, d, 'lowpass', 160, 0.8, 0.7 * v, 50, 0.4);
    a.noiseHit(t, 1.6, d, 'highpass', 3500, 0.6, 0.2 * v, 1500, 0.002);
  },
  stoneFall(a, t, v) {
    // The stone cut without hands: a falling shriek of air, then the strike.
    const d = a.out(0, 1.4);
    a.noiseHit(t, 1.1, d, 'bandpass', 3200, 4, 0.22 * v, 500, 0.9);
    a.osc('sine', 1400, t, 1.1, d, 0.05 * v, 0.8, 300);
    const s = t + 1.1;
    a.osc('sine', 44, s, 2.2, d, 1.2 * v, 0.003, 16);
    a.osc('triangle', 120, s, 0.4, d, 0.3 * v, 0.002, 40);
    a.noiseHit(s, 1, d, 'lowpass', 2600, 0.7, 0.95 * v, 70, 0.002);
    for (let i = 0; i < 12; i++) a.noiseHit(s + rand(0.05, 1.2), 0.05, d, 'bandpass', rand(500, 2200), 2, 0.25 * v);
    a.noiseHit(s + 0.2, 2.4, d, 'lowpass', 140, 0.8, 0.6 * v, 45, 0.3);
  },
  // Elemental accents, layered on an ordinary hit.
  elemFire(a, t, v, p, pan) {
    const d = a.out(pan, 0.3);
    a.noiseHit(t, 0.22, d, 'bandpass', 700 * p, 0.9, 0.35 * v, 2200 * p, 0.02);
    for (let i = 0; i < 6; i++) a.noiseHit(t + rand(0, 0.18), 0.012, d, 'highpass', rand(2500, 5000), 1, 0.16 * v, undefined, 0.001);
  },
  elemFrost(a, t, v, p, pan) {
    const d = a.out(pan, 0.6);
    a.noiseHit(t, 0.035, d, 'highpass', 4200, 1.2, 0.35 * v, undefined, 0.001);
    [2, 2.73, 3.61, 4.9].forEach((m, i) => a.osc(i % 2 ? 'triangle' : 'sine', 1180 * m * p, t + i * 0.012, 0.32 / (1 + i * 0.4), d, 0.045 * v, 0.001));
    a.noiseHit(t + 0.03, 0.3, d, 'bandpass', 7500, 6, 0.08 * v, undefined, 0.05);
  },
  elemStorm(a, t, v, p, pan) {
    const d = a.out(pan, 0.4);
    a.osc('sawtooth', 2200 * p, t, 0.1, d, 0.07 * v, 0.001, 220);
    a.osc('square', 95 * p, t, 0.14, d, 0.06 * v, 0.002);
    a.noiseHit(t, 0.05, d, 'highpass', 3500, 0.8, 0.35 * v, undefined, 0.001);
    for (let i = 1; i <= 4; i++) a.noiseHit(t + i * rand(0.02, 0.035), 0.012, d, 'bandpass', rand(3000, 6000), 2, 0.22 * v, undefined, 0.001);
  },
  elemShadow(a, t, v, p, pan) {
    // A dark thrum: a low tone shuddering at 14 Hz.
    const d = a.out(pan, 0.7);
    const ctx = a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 * p, t);
    o.frequency.exponentialRampToValueAtTime(48 * p, t + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const am = chopped(a, t, 0.4, 14, 0.5);
    const g = ctx.createGain();
    a.env(g, t, 0.02, 0.4 * v, 0.36);
    o.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(d);
    o.start(t);
    o.stop(t + 0.45);
    a.noiseHit(t, 0.3, d, 'lowpass', 300, 1, 0.22 * v, 120, 0.05);
  },
  elemHoly(a, t, v, p, pan) {
    const d = a.out(pan, 0.9);
    bell(a, t, mtof(88) * p, 0.45 * v, d, 0.7);
    bell(a, t + 0.03, mtof(95) * p, 0.3 * v, d, 0.6);
    a.noiseHit(t, 0.25, d, 'bandpass', 8000, 3, 0.05 * v, undefined, 0.02);
  },
  elemBlood(a, t, v, p, pan) {
    const d = a.out(pan, 0.25);
    a.noiseHit(t, 0.11, d, 'bandpass', 2600 * p, 1.6, 0.32 * v, 700 * p, 0.003);
    a.noiseHit(t + 0.02, 0.14, d, 'lowpass', 900 * p, 6, 0.3 * v, 260, 0.004);
    a.osc('sine', 120 * p, t + 0.02, 0.1, d, 0.2 * v, 0.003, 60);
  },
};

export const audio = new AudioEngine();
export const sfx = (name: string, o?: { pan?: number; vol?: number; pitch?: number; gap?: number }) => audio.play(name, o);
