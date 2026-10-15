// Procedural orchestral score. Each region has a theme generated step by step
// (strings, choir, harp, bells, taiko, brass). An intensity value layers in
// percussion and ostinatos when combat starts, and the boss theme escalates
// with each phase.

import { audio, mtof } from './audio';
import { rand } from '../core/math';

type Gen = (m: Music, d: AudioNode, step: number, t: number, I: number) => void;

interface TrackDef {
  bpm: number;
  gen: Gen;
  ambience?: 'wind' | 'drone' | 'none' | 'fire';
}

interface Playing {
  name: string;
  def: TrackDef;
  out: GainNode;
  step: number;
  next: number;
  stopAt: number;
  amb: AudioScheduledSourceNode[];
}

export class Music {
  private cur: Playing | null = null;
  private old: Playing[] = [];
  intensity = 0;
  private target = 0;
  private timer = 0;
  phase = 0;

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), 30);
  }

  get name() {
    return this.cur?.name ?? '';
  }

  play(name: string, fade = 2.2) {
    const ctx = audio.ctx;
    if (!ctx) {
      this.pending = name;
      return;
    }
    if (this.cur?.name === name) return;
    const def = TRACKS[name];
    const t = ctx.currentTime;
    if (this.cur) {
      const c = this.cur;
      c.out.gain.cancelScheduledValues(t);
      c.out.gain.setValueAtTime(c.out.gain.value, t);
      c.out.gain.linearRampToValueAtTime(0.0001, t + fade);
      c.stopAt = t + fade;
      this.old.push(c);
      this.cur = null;
    }
    if (!def) return;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(1, t + Math.max(0.05, fade * 0.8));
    out.connect(audio.musicBus);
    const verb = ctx.createGain();
    verb.gain.value = 0.8;
    out.connect(verb);
    verb.connect(audio.musicVerb);
    const p: Playing = { name, def, out, step: 0, next: t + 0.1, stopAt: Infinity, amb: [] };
    this.startAmbience(p);
    this.cur = p;
    this.phase = 0;
  }
  pending = '';

  stop(fade = 1.5) {
    this.play('', fade);
  }

  setIntensity(v: number) {
    this.target = v;
  }

  private startAmbience(p: Playing) {
    const ctx = audio.ctx!;
    const kind = p.def.ambience ?? 'none';
    if (kind === 'none') return;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (kind === 'wind') {
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 0.9;
      g.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lg = ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg);
      lg.connect(f.frequency);
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.13;
      const lg2 = ctx.createGain();
      lg2.gain.value = 0.03;
      lfo2.connect(lg2);
      lg2.connect(g.gain);
      lfo.start();
      lfo2.start();
      p.amb.push(lfo, lfo2);
    } else if (kind === 'fire') {
      f.type = 'lowpass';
      f.frequency.value = 900;
      g.gain.value = 0.035;
    } else {
      f.type = 'lowpass';
      f.frequency.value = 180;
      g.gain.value = 0.08;
    }
    src.connect(f);
    f.connect(g);
    g.connect(p.out);
    src.start();
    p.amb.push(src);
  }

  private tick() {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.pending) {
      const n = this.pending;
      this.pending = '';
      this.play(n);
    }
    const now = ctx.currentTime;
    this.intensity += (this.target - this.intensity) * 0.04;
    for (let i = this.old.length - 1; i >= 0; i--) {
      const o = this.old[i];
      if (now > o.stopAt + 0.2) {
        for (const s of o.amb) try { s.stop(); } catch { /* */ }
        try { o.out.disconnect(); } catch { /* */ }
        this.old.splice(i, 1);
      }
    }
    const c = this.cur;
    if (!c) return;
    const stepDur = 60 / c.def.bpm / 4;
    if (c.next < now - 0.5) c.next = now + 0.05; // recovered from suspension
    while (c.next < now + 0.18) {
      try {
        c.def.gen(this, c.out, c.step, c.next, this.intensity);
      } catch {
        /* keep the score alive */
      }
      c.step++;
      c.next += stepDur;
    }
  }

  // ---------- instruments ----------

  sustain(g: GainNode, t: number, a: number, dur: number, peak: number, rel: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
  }

  strings(d: AudioNode, m: number, t: number, dur: number, v = 1, bright = 1600, a = 0.35) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = bright;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    this.sustain(g, t, a, dur, 0.035 * v, 0.6);
    f.connect(g);
    g.connect(d);
    for (const det of [-9, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det + rand(-2, 2);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.7);
    }
  }

  choir(d: AudioNode, m: number, t: number, dur: number, v = 1, vowel: 'ah' | 'oo' = 'ah') {
    const ctx = audio.ctx!;
    const g = ctx.createGain();
    this.sustain(g, t, 0.6, dur, 0.05 * v, 0.9);
    g.connect(d);
    const forms = vowel === 'ah' ? [[750, 6, 1], [1150, 7, 0.5], [2600, 9, 0.18]] : [[330, 6, 1], [800, 7, 0.4], [2300, 9, 0.1]];
    const mixG = ctx.createGain();
    mixG.gain.value = 1;
    for (const [fr, q, amp] of forms) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = q;
      const ag = ctx.createGain();
      ag.gain.value = amp * 2.2;
      mixG.connect(bp);
      bp.connect(ag);
      ag.connect(g);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.8 + rand(-0.4, 0.4);
    const lg = ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      lg.connect(o.detune);
      o.connect(mixG);
      o.start(t);
      o.stop(t + dur + 1);
    }
    lfo.start(t);
    lfo.stop(t + dur + 1);
  }

  bass(d: AudioNode, m: number, t: number, dur: number, v = 1) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = ctx.createGain();
    this.sustain(g, t, 0.05, dur, 0.09 * v, 0.3);
    f.connect(g);
    g.connect(d);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const s = ctx.createOscillator();
    s.type = 'sine';
    s.frequency.value = mtof(m);
    o.connect(f);
    s.connect(g);
    o.start(t); s.start(t);
    o.stop(t + dur + 0.4); s.stop(t + dur + 0.4);
  }

  harp(d: AudioNode, m: number, t: number, v = 1, dec = 1.4) {
    const f = mtof(m);
    audio.osc('triangle', f, t, dec, d, 0.07 * v, 0.003);
    audio.osc('sine', f * 2, t, dec * 0.5, d, 0.025 * v, 0.002);
    audio.osc('sine', f * 3, t, dec * 0.25, d, 0.012 * v, 0.002);
  }

  bell(d: AudioNode, m: number, t: number, v = 1, dec = 3) {
    const f = mtof(m);
    const parts = [1, 2.01, 2.76, 4.07, 5.43];
    const amps = [1, 0.5, 0.33, 0.2, 0.12];
    parts.forEach((p, i) => audio.osc('sine', f * p, t, dec / (1 + i * 0.5), d, 0.05 * v * amps[i], 0.002));
  }

  flute(d: AudioNode, m: number, t: number, dur: number, v = 1) {
    const ctx = audio.ctx!;
    const g = ctx.createGain();
    this.sustain(g, t, 0.12, dur, 0.045 * v, 0.35);
    g.connect(d);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(m);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = 6;
    lfo.connect(lg);
    lg.connect(o.detune);
    o.connect(g);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.5); lfo.stop(t + dur + 0.5);
    audio.noiseHit(t, dur * 0.6, d, 'bandpass', mtof(m) * 2, 8, 0.008 * v, undefined, 0.08);
  }

  brass(d: AudioNode, m: number, t: number, dur: number, v = 1) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(2400, t + 0.09);
    f.frequency.setTargetAtTime(1100, t + 0.12, 0.25);
    const g = ctx.createGain();
    this.sustain(g, t, 0.06, dur, 0.05 * v, 0.25);
    f.connect(g);
    g.connect(d);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
  }

  taiko(d: AudioNode, t: number, v = 1, p = 1) {
    audio.osc('sine', 150 * p, t, 0.45, d, 0.55 * v, 0.002, 45 * p);
    audio.noiseHit(t, 0.12, d, 'lowpass', 900, 0.8, 0.25 * v, 200);
  }

  snare(d: AudioNode, t: number, v = 1) {
    audio.noiseHit(t, 0.14, d, 'bandpass', 1800, 0.8, 0.18 * v, 900);
    audio.osc('triangle', 220, t, 0.06, d, 0.08 * v, 0.001, 150);
  }

  tick2(d: AudioNode, t: number, v = 1) {
    audio.noiseHit(t, 0.04, d, 'highpass', 7000, 0.7, 0.05 * v);
  }

  swell(d: AudioNode, t: number, dur: number, v = 1) {
    const ctx = audio.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    s.connect(f); f.connect(g); g.connect(d);
    s.start(t, rand(0, 1));
    s.stop(t + dur + 0.3);
  }
}

// ---------- the score ----------

const bar = (step: number) => Math.floor(step / 16);
const pos = (step: number) => step % 16;

const TITLE_CH = [
  { root: 38, tones: [62, 65, 69] },
  { root: 34, tones: [62, 65, 70] },
  { root: 31, tones: [62, 67, 70] },
  { root: 33, tones: [61, 64, 69] },
];

const SANCT_CH = [
  { root: 41, arp: [65, 69, 72, 77], pad: [60, 65, 69] },
  { root: 45, arp: [64, 69, 72, 76], pad: [60, 64, 69] },
  { root: 46, arp: [62, 65, 70, 74], pad: [62, 65, 70] },
  { root: 48, arp: [64, 67, 72, 76], pad: [64, 67, 72] },
];
const SANCT_MEL = [77, -1, 76, 72, 74, -1, 72, 69, 70, -1, 69, 65, 67, -1, -1, -1];

const BOSS_CH = [36, 32, 34, 31];

export const TRACKS: Record<string, TrackDef> = {
  title: {
    bpm: 54,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const ch = TITLE_CH[b % 4];
      const beat = 60 / 54;
      if (p === 0) {
        m.strings(d, ch.root, t, beat * 4, 1.3, 900, 0.8);
        m.strings(d, ch.root + 12, t, beat * 4, 0.8, 900, 0.8);
        for (const n of ch.tones) m.choir(d, n, t, beat * 4, 0.9, 'ah');
        if (b % 2 === 0) m.taiko(d, t, 0.5, 0.7);
      }
      if (b % 4 === 0) {
        const mel: Record<number, number> = { 0: 74, 6: 69, 8: 77, 12: 76 };
        if (mel[p]) m.bell(d, mel[p], t, 0.8, 4);
      }
      if (b % 4 === 2 && (p === 0 || p === 8)) m.bell(d, p ? 72 : 74, t, 0.5, 3);
      if (p % 4 === 2 && b > 1) m.harp(d, ch.tones[((p / 4) | 0) % 3] + 12, t, 0.5);
    },
  },
  sanctuary: {
    bpm: 66,
    ambience: 'fire',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const ch = SANCT_CH[b % 4];
      const beat = 60 / 66;
      if (p === 0) {
        m.bass(d, ch.root - 12, t, beat * 4, 0.6);
        for (const n of ch.pad) m.strings(d, n - 12, t, beat * 4, 0.55, 1100, 0.9);
      }
      if (p % 2 === 0) {
        const seq = [0, 1, 2, 3, 2, 1, 2, 3];
        m.harp(d, ch.arp[seq[(p / 2) % 8]], t, 0.7, 1.8);
      }
      if (Math.floor(b / 4) % 2 === 1) {
        const n = SANCT_MEL[(b % 4) * 4 + Math.floor(p / 4)];
        if (p % 4 === 0 && n > 0) m.flute(d, n, t, beat * 1.6, 0.9);
      }
    },
  },
  village: {
    bpm: 72,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 72;
      const roots = [33, 33, 29, 31];
      const r = roots[b % 4];
      if (p === 0) {
        m.strings(d, r, t, beat * 4, 1.1, 700, 0.6);
        m.strings(d, r + 7, t, beat * 4, 0.6, 700, 0.6);
        if (b % 2 === 0) m.choir(d, 69, t, beat * 8, 0.35, 'oo');
      }
      const motif: Record<number, number> = { 0: 69, 3: 72, 6: 76, 8: 74, 11: 72, 14: 71 };
      if (b % 2 === 1 && motif[p] !== undefined) m.harp(d, motif[p] - (b % 4 === 3 ? 2 : 0), t, 0.6, 2);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 6 || p === 8 || p === 12) m.taiko(d, t, 0.55 * v, p === 0 ? 0.9 : 1.1);
        if (p % 2 === 0) {
          const ost = [0, 0, 3, 0, 7, 0, 3, 0];
          m.strings(d, r + 24 + ost[(p / 2) % 8], t, 0.18, 0.9 * v, 2400, 0.01);
        }
        if (p === 0 && b % 4 === 0) m.brass(d, r + 12, t, beat * 2, 0.7 * v);
        if (p === 4 || p === 12) m.snare(d, t, 0.25 * v);
      }
    },
  },
  temple: {
    bpm: 60,
    ambience: 'drone',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 1;
      const prog = [[38, [62, 65, 69]], [39, [63, 67, 70]], [38, [62, 65, 69]], [36, [60, 64, 67]]] as const;
      const [r, ch] = prog[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 1.2, 500, 1);
        for (const n of ch) m.choir(d, n - 12, t, beat * 4, 0.5, 'oo');
        if (b % 2 === 0) m.bell(d, 50, t, 0.9, 5);
      }
      if (Math.random() < 0.07 && p % 2 === 1) m.harp(d, [74, 77, 81, 86, 84][Math.floor(rand(0, 5))], t, 0.35, 2.4);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 3 || p === 8 || p === 11) m.taiko(d, t, 0.5 * v, 0.8);
        m.strings(d, r + 12 + (p % 8 < 4 ? 0 : 1), t, 0.1, 0.45 * v, 2000, 0.005);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, 2, 0.6 * v);
      }
    },
  },
  crypt: {
    bpm: 56,
    ambience: 'drone',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const prog = [[37, [61, 64, 68]], [36, [60, 64, 67]], [34, [58, 62, 65]], [36, [60, 63, 67]]] as const;
      const [r, ch] = prog[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, 4.2, 1.2, 420, 1.2);
        for (const n of ch) m.choir(d, n - 12, t, 4.2, 0.38, 'oo');
      }
      if (p === 8 && b % 4 === 3) m.bell(d, 49, t, 0.7, 5);
      if (Math.random() < 0.09) m.harp(d, [73, 76, 80, 85, 88][Math.floor(rand(0, 5))], t, 0.28, 2.6);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 10) m.taiko(d, t, 0.55 * v, 0.75);
        if (p % 2 === 0) m.strings(d, r + 12 + [0, 3, 0, 1][(p / 2) % 4], t, 0.16, 0.6 * v, 2200, 0.005);
      }
    },
  },
  revelation: {
    bpm: 58,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const prog = [[43, [67, 71, 74]], [42, [66, 69, 74]], [40, [64, 67, 71]], [36, [64, 67, 72]], [43, [67, 71, 74]], [38, [66, 69, 74]], [40, [67, 71, 76]], [38, [66, 69, 74]]] as const;
      const [r, ch] = prog[b % 8];
      const beat = 60 / 58;
      if (p === 0) {
        m.strings(d, r, t, beat * 4, 1, 1400, 0.8);
        m.strings(d, r + 12, t, beat * 4, 0.6, 1400, 0.8);
        for (const n of ch) m.choir(d, n, t, beat * 4, 0.85, 'ah');
      }
      if (p === 0 && b % 2 === 0) m.bell(d, ch[2] + 12, t, 0.7, 4);
      if (p % 4 === 2) m.harp(d, ch[(p >> 2) % 3] + 12, t, 0.45, 2);
    },
  },
  boss: {
    bpm: 148,
    ambience: 'none',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const r = BOSS_CH[b % 4];
      const ph = m.phase;
      const lift = ph >= 2 ? 1 : 0;
      const beat = 60 / 148;
      // Ostinato strings.
      const ost = [0, 0, 7, 0, 3, 0, 7, 0, 0, 0, 7, 0, 3, 0, 8, 7];
      m.strings(d, r + 24 + ost[p] + lift, t, 0.12, 0.9 + ph * 0.15, 2600, 0.004);
      if (ph >= 1) m.strings(d, r + 36 + ost[p] + lift, t, 0.1, 0.45, 3200, 0.004);
      // Low bass on beats.
      if (p % 4 === 0) m.bass(d, r + lift, t, beat * 0.9, 0.9);
      // Drums.
      const kick = [0, 3, 6, 8, 11, 14];
      if (kick.includes(p)) m.taiko(d, t, 0.75, p === 0 ? 0.85 : 1);
      if (ph >= 1 && (p === 2 || p === 10 || p === 13)) m.taiko(d, t, 0.5, 1.4);
      if (p === 4 || p === 12) m.snare(d, t, 0.45);
      if (ph >= 2 && p % 2 === 1) m.tick2(d, t, 0.8);
      // Brass stabs on the chord change.
      if (p === 0) {
        m.brass(d, r + 12 + lift, t, beat * 1.5, 0.9);
        m.brass(d, r + 19 + lift, t, beat * 1.5, 0.7);
      }
      if (p === 10 && b % 2 === 1) m.brass(d, r + 24 + lift, t, beat * 1.2, 0.6);
      // Choir chant.
      if (p === 0 && b % 2 === 0) {
        const top = ph >= 1 ? [60, 63, 67, 72] : [60, 63, 67];
        for (const n of top) m.choir(d, n + (r - 36) + lift, t, beat * 7.5, 0.7 + ph * 0.15, 'ah');
      }
      if (ph >= 2 && p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
    },
  },
  // Chapter II: the plain of Shinar. D Phrygian-dominant, a reed-like flute over a frame-drum pulse.
  shinar: {
    bpm: 76,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 76;
      const roots = [38, 38, 39, 36];
      const r = roots[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 1, 650, 0.7);
        m.strings(d, r - 5, t, beat * 4, 0.45, 650, 0.7);
        if (b % 2 === 0) m.choir(d, 62, t, beat * 8, 0.3, 'oo');
      }
      // Harp ostinato on the mode: D Eb F# G A Bb C.
      const scale = [62, 63, 66, 67, 69, 70, 72, 74];
      const ost = [0, 2, 1, 2, 4, 3, 2, 1];
      if (p % 2 === 0) m.harp(d, scale[ost[(p / 2) % 8]] + (b % 4 === 2 ? 1 : 0), t, 0.5, 1.6);
      // The reed melody on alternate phrases.
      const mel: Record<number, number> = { 0: 74, 3: 75, 4: 74, 6: 72, 8: 70, 10: 69, 12: 70, 14: 66 };
      if (Math.floor(b / 2) % 2 === 1 && mel[p] !== undefined) m.flute(d, mel[p], t, beat * 0.9, 0.8);
      // Frame drum pulse, always faintly present.
      if (p === 0 || p === 6 || p === 10) m.taiko(d, t, 0.18 + I * 0.4, 1.3);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 3 || p === 12) m.taiko(d, t, 0.45 * v, 1.0);
        if (p % 2 === 1) m.strings(d, r + 24 + [0, 1, 4, 1][(p >> 1) % 4], t, 0.14, 0.7 * v, 2600, 0.005);
        if (p === 0 && b % 2 === 0) m.brass(d, r + 12, t, beat * 2, 0.6 * v);
        if (p === 4 || p === 12) m.snare(d, t, 0.22 * v);
      }
    },
  },
  // Chapter II: inside the Tower. A rising figure that never resolves.
  tower: {
    bpm: 62,
    ambience: 'drone',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 62;
      const prog = [[38, [62, 65, 69]], [40, [64, 67, 71]], [41, [65, 69, 72]], [43, [67, 70, 74]]] as const;
      const [r, ch] = prog[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 1.1, 520, 1);
        for (const n of ch) m.choir(d, n - 12, t, beat * 4, 0.42, b % 2 ? 'ah' : 'oo');
      }
      // Each bar climbs a step higher: the tower that keeps reaching.
      if (p % 4 === 0) m.harp(d, ch[(p / 4) % 3] + 12 + (b % 4), t, 0.45, 2.2);
      if (p === 8 && b % 4 === 3) m.bell(d, 50, t, 0.8, 5);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 7 || p === 10) m.taiko(d, t, 0.55 * v, 0.8);
        if (p % 2 === 0) m.strings(d, r + 12 + [0, 2, 3, 2][(p >> 1) % 4], t, 0.16, 0.55 * v, 2200, 0.005);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, beat * 2, 0.6 * v);
      }
    },
  },
  // The Gatekeeper: a beast's war-drum. Phases add weight and fire.
  gatekeeper: {
    bpm: 156,
    ambience: 'fire',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 156;
      const roots = [33, 33, 34, 32];
      const r = roots[b % 4];
      const ost = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 1, 0, 13, 12, 0];
      m.strings(d, r + 24 + ost[p], t, 0.11, 0.85 + ph * 0.15, 2400, 0.003);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 1);
      const kick = [0, 2, 6, 8, 10, 14];
      if (kick.includes(p)) m.taiko(d, t, 0.8, p % 8 === 0 ? 0.7 : 0.95);
      if (ph >= 1 && (p === 4 || p === 12)) m.snare(d, t, 0.5);
      if (ph >= 1 && p % 2 === 1) m.tick2(d, t, 0.6);
      if (p === 0) {
        m.brass(d, r + 12, t, beat * 2, 0.9);
        m.brass(d, r + 18, t, beat * 2, 0.6);
      }
      if (ph >= 2 && p === 8) m.brass(d, r + 25, t, beat * 1.5, 0.7);
      if (p === 0 && b % 2 === 0) for (const n of [57, 60, 63]) m.choir(d, n + (r - 33), t, beat * 7, 0.6 + ph * 0.15, 'ah');
      if (ph >= 2 && p === 12 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
    },
  },
  // The Crimson Marshal: an honour duel. Strings, then brass, then everything.
  duel: {
    bpm: 132,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 132;
      const prog = [[38, [62, 65, 69]], [34, [58, 62, 65]], [36, [60, 64, 67]], [33, [57, 61, 64]]] as const;
      const [r, ch] = prog[b % 4];
      // Tremolo strings carrying the chord.
      if (p % 2 === 0) for (const n of ch) m.strings(d, n, t, 0.2, 0.32 + ph * 0.08, 2800, 0.004);
      if (p % 4 === 0) m.bass(d, r, t, beat * 1.8, 0.85);
      // A duelist's rhythm: two strikes, a pause, a strike.
      if (p === 0 || p === 3 || p === 8 || (ph >= 1 && p === 11)) m.taiko(d, t, 0.7, 1.05);
      if (p === 6 || p === 14) m.snare(d, t, 0.35 + ph * 0.15);
      if (ph >= 1 && p % 2 === 1) m.tick2(d, t, 0.5);
      // The Marshal's call: a fanfare that grows each phase.
      const call: Record<number, number> = { 0: 0, 2: 7, 4: 12, 7: 10, 8: 7 };
      if (b % 2 === 0 && call[p] !== undefined) m.brass(d, r + 24 + call[p], t, beat * 1.2, 0.55 + ph * 0.2);
      if (p === 0 && b % 4 === 0) for (const n of ch) m.choir(d, n, t, beat * 15, 0.5 + ph * 0.2, 'ah');
      if (ph >= 2 && p === 8 && b % 2 === 1) m.swell(d, t, beat * 2, 1);
    },
  },
  victory: {
    bpm: 64,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const prog = [[36, [64, 67, 72]], [41, [65, 69, 72]], [43, [67, 71, 74]], [36, [64, 67, 72]]] as const;
      const [r, ch] = prog[b % 4];
      const beat = 60 / 64;
      if (p === 0) {
        m.strings(d, r, t, beat * 4, 1, 1600, 0.6);
        for (const n of ch) m.choir(d, n, t, beat * 4, 0.8, 'ah');
        if (b % 4 === 0) for (const n of ch) m.brass(d, n - 12, t, beat * 2, 0.6);
      }
      if (p % 2 === 0) m.harp(d, ch[(p >> 1) % 3] + 12, t, 0.5, 1.6);
      if (p === 0 && b % 2 === 0) m.bell(d, ch[2] + 12, t, 0.7, 4);
    },
  },
};

export const music = new Music();
