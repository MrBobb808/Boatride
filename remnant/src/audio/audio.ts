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
    const d = a.out(pan, 0.7);
    for (const det of [-25, 0, 25]) a.osc('sawtooth', 90 * p, t, 0.9, d, 0.07 * v, 0.08, 62 * p, det);
    a.noiseHit(t, 0.9, d, 'bandpass', 520 * p, 1.4, 0.45 * v, 220, 0.1);
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
};

export const audio = new AudioEngine();
export const sfx = (name: string, o?: { pan?: number; vol?: number; pitch?: number; gap?: number }) => audio.play(name, o);
