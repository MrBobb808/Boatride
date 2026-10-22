// Procedural orchestral score. Each region has a theme generated step by step
// (strings, choir, harp, bells, taiko, brass). An intensity value layers in
// percussion and ostinatos when combat starts, and the boss theme escalates
// with each phase.

import { audio, mtof } from './audio';
import { rand } from '../core/math';

type Gen = (m: Music, d: AudioNode, step: number, t: number, I: number) => void;

interface TrackDef {
  bpm: number;
  /** Boss tracks: tempo for each phase (index = music.phase); missing entries keep the last. */
  phaseBpm?: number[];
  gen: Gen;
  ambience?: 'wind' | 'drone' | 'none' | 'fire' | 'swarm' | 'furnace' | 'den' | 'sea';
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
  /** Boss phase (0 = first). Bosses set it through bossPhase(); older code assigns it directly. */
  phase = 0;
  /** How many phase changes have been heard (lets tests and the HUD see a change land). */
  phaseChanges = 0;

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

  /**
   * A boss entered phase n (0 = the first). Layers in the boss track key off
   * `phase`; a rise also lands a stinger and restarts the bar, so the new
   * layers enter on a downbeat. Safe to call before audio is unlocked.
   */
  bossPhase(n: number) {
    const prev = this.phase;
    this.phase = n;
    if (n <= prev) return;
    this.phaseChanges++;
    const ctx = audio.ctx, c = this.cur;
    if (!ctx || !c || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.03;
    this.stinger(c.out, t, n);
    // Re-enter at the top of the next bar, a beat after the stinger lands.
    c.step = Math.ceil(c.step / 16) * 16;
    c.next = Math.max(c.next, t + 60 / this.bpmOf(c.def) * 0.75);
  }

  private bpmOf(def: TrackDef) {
    const pb = def.phaseBpm;
    return pb && pb.length ? pb[Math.min(this.phase, pb.length - 1)] : def.bpm;
  }

  /** A phase-change hit: drum, gong and a choir chord over a rising swell. */
  private stinger(d: AudioNode, t: number, n: number) {
    this.taiko(d, t, 1, 0.5);
    this.taiko(d, t + 0.09, 0.7, 0.62);
    this.gong(d, 33 + n, t, 0.8, 4);
    for (const k of [0, 7, 12 + (n % 2 ? 1 : 0)]) this.choir(d, 57 + n + k, t, 1.6, 0.55, 'ah');
    this.brass(d, 45 + n, t, 1.2, 0.8, 0.03);
    audio.noiseHit(t - 0.02, 0.5, d, 'bandpass', 600, 1.2, 0.12, 4200, 0.4);
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
    } else if (kind === 'swarm') {
      // A hive breathing: band-limited noise trembling at wingbeat rate, swelling and receding.
      f.type = 'bandpass';
      f.frequency.value = 330;
      f.Q.value = 2.2;
      g.gain.value = 0.045;
      const am = ctx.createOscillator();
      am.type = 'triangle';
      am.frequency.value = 31;
      const ag = ctx.createGain();
      ag.gain.value = 0.018;
      am.connect(ag);
      ag.connect(g.gain);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = ctx.createGain();
      lg.gain.value = 0.022;
      lfo.connect(lg);
      lg.connect(g.gain);
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.05;
      const sg = ctx.createGain();
      sg.gain.value = 120;
      sweep.connect(sg);
      sg.connect(f.frequency);
      am.start();
      lfo.start();
      sweep.start();
      p.amb.push(am, lfo, sweep);
    } else if (kind === 'furnace') {
      // The furnace's roar: low noise that surges and falls like a bellows working.
      f.type = 'lowpass';
      f.frequency.value = 240;
      f.Q.value = 0.7;
      g.gain.value = 0.09;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.18;
      const lg = ctx.createGain();
      lg.gain.value = 0.045;
      lfo.connect(lg);
      lg.connect(g.gain);
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.11;
      const sg = ctx.createGain();
      sg.gain.value = 90;
      sweep.connect(sg);
      sg.connect(f.frequency);
      lfo.start();
      sweep.start();
      p.amb.push(lfo, sweep);
    } else if (kind === 'den') {
      // Something large breathing in the dark: a slow swell in and out.
      f.type = 'bandpass';
      f.frequency.value = 220;
      f.Q.value = 1.2;
      g.gain.value = 0.035;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.22;
      const lg = ctx.createGain();
      lg.gain.value = 0.032;
      lfo.connect(lg);
      lg.connect(g.gain);
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.22;
      const sg = ctx.createGain();
      sg.gain.value = 70;
      sweep.connect(sg);
      sg.connect(f.frequency);
      lfo.start();
      sweep.start();
      p.amb.push(lfo, sweep);
    } else if (kind === 'sea') {
      // Surf on a stony shore: low noise breathing in long swells, the filter lifting as each one breaks.
      f.type = 'lowpass';
      f.frequency.value = 520;
      f.Q.value = 0.5;
      g.gain.value = 0.06;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.085;
      const lg = ctx.createGain();
      lg.gain.value = 0.045;
      lfo.connect(lg);
      lg.connect(g.gain);
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.085;
      const sg = ctx.createGain();
      sg.gain.value = 380;
      sweep.connect(sg);
      sg.connect(f.frequency);
      lfo.start();
      sweep.start();
      p.amb.push(lfo, sweep);
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
    const stepDur = 60 / this.bpmOf(c.def) / 4;
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

  /** a > 0.06 swells the note in, the filter opening with it. */
  brass(d: AudioNode, m: number, t: number, dur: number, v = 1, a = 0.06) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(2400, t + Math.max(0.09, a));
    f.frequency.setTargetAtTime(1100, t + Math.max(0.12, a), 0.25);
    const g = ctx.createGain();
    this.sustain(g, t, a, dur, 0.05 * v, 0.25);
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

  /** A dry chitinous click (mandibles, shell on shell). */
  click(d: AudioNode, t: number, v = 1, f = 3200) {
    audio.noiseHit(t, 0.02, d, 'bandpass', f, 7, 0.5 * v, undefined, 0.0015);
    audio.osc('triangle', f * 0.5, t, 0.014, d, 0.035 * v, 0.001);
  }

  /** An insect drone: a sawtooth chopped at wingbeat rate through a nasal band. */
  buzz(d: AudioNode, m: number, t: number, dur: number, v = 1) {
    const ctx = audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = Math.min(4000, mtof(m) * 4);
    f.Q.value = 1.8;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 34;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(am.gain);
    const g = ctx.createGain();
    this.sustain(g, t, 0.02, dur, 0.07 * v, 0.12);
    o.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(d);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.3);
    lfo.stop(t + dur + 0.3);
  }

  /** A plucked oud: a bright, nasal attack that darkens fast, with a slight slide into the note. */
  oud(d: AudioNode, m: number, t: number, v = 1, dec = 0.9, slide = 0) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(3400, t);
    f.frequency.exponentialRampToValueAtTime(520, t + dec * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    f.connect(g);
    g.connect(d);
    for (const [type, det] of [['sawtooth', -4], ['triangle', 5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(mtof(m - slide), t);
      if (slide) o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.07);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
    audio.noiseHit(t, 0.03, d, 'bandpass', mtof(m) * 4, 3, 0.03 * v, undefined, 0.001);
  }

  /** Frame drum: 'dum' is the low open stroke at the centre, 'tek' the dry slap at the rim. */
  frame(d: AudioNode, t: number, v = 1, tek = false) {
    if (tek) {
      audio.noiseHit(t, 0.07, d, 'bandpass', 2400, 1.6, 0.16 * v, 1400, 0.001);
      audio.osc('triangle', 420, t, 0.04, d, 0.05 * v, 0.001, 300);
    } else {
      audio.osc('sine', 110, t, 0.38, d, 0.42 * v, 0.002, 62);
      audio.noiseHit(t, 0.09, d, 'lowpass', 700, 1, 0.14 * v, 180);
    }
  }

  /** A hammer on metal: inharmonic partials ringing over a hard thud. */
  anvil(d: AudioNode, t: number, v = 1, f = 520) {
    const parts = [1, 2.76, 5.4, 8.93];
    for (let i = 0; i < parts.length; i++) audio.osc(i ? 'sine' : 'triangle', f * parts[i], t, 0.5 / (1 + i * 0.7), d, (0.06 * v) / (1 + i * 0.5), 0.001);
    audio.noiseHit(t, 0.05, d, 'highpass', 3000, 1, 0.12 * v, undefined, 0.001);
    audio.osc('sine', 90, t, 0.12, d, 0.18 * v, 0.002, 55);
  }

  /** A great gong: a dark bloom of partials that takes a moment to open up. */
  gong(d: AudioNode, m: number, t: number, v = 1, dec = 5) {
    const f = mtof(m);
    const parts = [1, 1.48, 1.97, 2.53, 3.21, 4.1];
    for (let i = 0; i < parts.length; i++) audio.osc('sine', f * parts[i], t, dec / (1 + i * 0.4), d, (0.06 * v) / (1 + i * 0.6), 0.02 + i * 0.03);
    audio.noiseHit(t, 0.6, d, 'bandpass', f * 3, 2, 0.05 * v, f * 1.5, 0.05);
  }

  /** A slow breath of filtered noise, rising then falling (a lion's breathing in the den). */
  breath(d: AudioNode, t: number, dur: number, v = 1, out = false) {
    audio.noiseHit(t, dur, d, 'bandpass', out ? 420 : 260, 1.6, 0.09 * v, out ? 180 : 520, dur * 0.45);
    if (out) audio.osc('sawtooth', 48, t + dur * 0.2, dur * 0.6, d, 0.025 * v, dur * 0.3, 40);
  }

  /** A hunting horn: soft-edged brass that slides up into the note, with a breathy onset. */
  horn(d: AudioNode, m: number, t: number, dur: number, v = 1, dark = 1) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(380 * dark, t);
    f.frequency.linearRampToValueAtTime(1500 * dark, t + 0.09);
    f.frequency.setTargetAtTime(900 * dark, t + 0.12, 0.3);
    const g = ctx.createGain();
    this.sustain(g, t, 0.07, dur, 0.055 * v, 0.3);
    f.connect(g);
    g.connect(d);
    for (const [type, det] of [['sawtooth', -5], ['triangle', 4]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(mtof(m - 0.6), t);
      o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.07);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.45);
    }
    audio.noiseHit(t, 0.08, d, 'bandpass', mtof(m) * 3, 2, 0.012 * v, undefined, 0.01);
  }

  /** A lyre: a bright gut-string pluck whose brightness falls away quickly. */
  lyre(d: AudioNode, m: number, t: number, v = 1, dec = 1.2) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dec * 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    f.connect(g);
    g.connect(d);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(m);
    o.connect(f);
    o.start(t);
    o.stop(t + dec + 0.05);
    audio.osc('sine', mtof(m) * 2, t, dec * 0.5, d, 0.018 * v, 0.002);
  }

  /** An aulos: two buzzing reeds a hair apart, through a nasal band, with a slow vibrato. */
  aulos(d: AudioNode, m: number, t: number, dur: number, v = 1, slide = 0) {
    const ctx = audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = Math.min(3600, mtof(m) * 2.2);
    f.Q.value = 1.3;
    const g = ctx.createGain();
    this.sustain(g, t, 0.05, dur, 0.06 * v, 0.18);
    f.connect(g);
    g.connect(d);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(14, t + Math.min(0.5, dur));
    lfo.connect(lg);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(m - slide), t);
      if (slide) o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.09);
      o.detune.value = det;
      lg.connect(o.detune);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.3);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.3);
  }

  /** A wave gathering and breaking: low noise swelling, then a hiss as it falls. */
  surf(d: AudioNode, t: number, dur: number, v = 1) {
    audio.noiseHit(t, dur * 0.7, d, 'lowpass', 220, 0.7, 0.16 * v, 1400, dur * 0.6);
    audio.noiseHit(t + dur * 0.62, dur * 0.5, d, 'highpass', 2600, 0.5, 0.05 * v, 900, 0.03);
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

const VALLEY_PROG = [[40, [64, 67, 71]], [41, [65, 69, 72]], [40, [64, 67, 71]], [38, [62, 65, 69]]] as const;
const VALLEY_MEL: Record<number, number> = { 0: 76, 4: 77, 6: 76, 8: 74, 12: 71 };
const HIVE_CLICKS = [[0, 2, 5, 7, 10, 12, 13], [0, 3, 5, 6, 9, 11, 14]];
const SWARM_OST = [0, 12, 1, 12, 0, 12, 3, 12, 0, 12, 1, 12, 6, 12, 3, 1];
const SWARM_KICK = [0, 3, 6, 8, 10, 13];
// Chapter IV. E Phrygian dominant: E F G# A B C D.
const DURA_SCALE = [52, 53, 56, 57, 59, 60, 62, 64, 65, 68, 69, 71];
const DURA_OUD: (number | null)[][] = [
  [7, null, 6, 7, 8, null, 7, 6, 4, null, 3, 4, 2, 1, 0, null],
  [0, 1, 2, null, 3, 2, 1, null, 2, 3, 4, 5, 4, null, 3, 2],
  [7, 8, 9, null, 8, 7, 6, null, 7, 6, 4, 3, 2, null, 1, 0],
  [4, null, 3, 2, 1, null, 2, 1, 0, null, null, 1, 0, null, null, null],
];
const DURA_DUM = [0, 8];
const DURA_TEK = [4, 6, 12, 14];
const BABYLON_PROG = [[38, [62, 65, 69]], [34, [62, 65, 70]], [36, [60, 64, 67]], [33, [61, 64, 69]]] as const;
const BABYLON_CALL: Record<number, number> = { 0: 69, 4: 74, 6: 72, 8: 70, 12: 69 };
const FURNACE_HITS = [0, 3, 6, 8, 11, 14];
const IMAGE_PROG = [[36, [60, 63, 67]], [32, [60, 63, 68]], [34, [62, 65, 70]], [31, [59, 62, 67]]] as const;
const IMAGE_KICK = [0, 6, 8, 11];
// Chapter V: the night of the feast.
const FEAST_PROG = [[38, [62, 66, 69]], [36, [60, 64, 67]], [38, [62, 66, 69]], [40, [64, 67, 71]]] as const;
const FEAST_LYRE = [0, 2, 4, 2, 7, 4, 2, 4, 0, 4, 7, 9, 7, 4, 2, 4];
const FEAST_MEL: Record<number, number> = { 0: 74, 2: 76, 4: 78, 6: 76, 8: 74, 10: 72, 12: 71, 14: 69 };
const GARDEN_PROG = [[41, [65, 69, 72]], [43, [67, 71, 74]], [41, [65, 69, 72]], [38, [62, 65, 69]]] as const;
const GARDEN_MEL: Record<number, number> = { 0: 81, 4: 79, 6: 77, 8: 76, 12: 72 };
const PALACE_PROG = [[38, [62, 65, 69]], [39, [63, 67, 70]], [36, [60, 63, 67]], [37, [61, 65, 68]]] as const;
const WEIGH_PROG = [[38, [62, 65, 69]], [34, [62, 65, 70]], [36, [60, 63, 67]], [37, [61, 64, 69]]] as const;
// Chapter VI: Hiddekel (a fasting prayer at dawn), Shushan (Persian, modal, imperial),
// the high places (vast and eerie), the storm and the Prince of Persia.
const HIDDEKEL_PROG = [[38, [62, 65, 69]], [36, [60, 63, 67]], [34, [62, 65, 70]], [36, [60, 64, 67]]] as const;
/** The prayer: a lament in D with a lowered second, one phrase per bar, -1 rests. */
const HIDDEKEL_MEL = [
  [74, -1, -1, 75, 74, -1, 72, -1, 70, -1, -1, -1, 69, -1, -1, -1],
  [70, -1, 72, -1, 74, -1, -1, 72, 70, -1, 69, -1, 67, -1, -1, -1],
  [69, -1, 70, 72, 74, -1, 77, -1, 75, -1, 74, -1, 72, -1, 70, -1],
  [69, -1, -1, -1, 70, 69, 67, -1, 66, -1, -1, -1, 62, -1, -1, -1],
] as const;
/** Shushan's mode (D Shur-like): D Eb F G A Bb C. */
const SHUSHAN_SCALE = [50, 51, 53, 55, 57, 58, 60, 62, 63, 65, 67, 69, 70, 72];
const SHUSHAN_OUD = [
  [7, null, 8, 7, 9, null, 8, 7, 6, null, 5, null, 7, null, null, null],
  [9, null, 10, 9, 11, 10, 9, null, 8, 7, 8, null, 7, null, null, null],
  [11, null, 10, 9, 10, null, 9, 8, 9, null, 8, 7, 8, null, 6, null],
  [5, 6, 7, null, 8, null, 7, 6, 5, null, 4, null, 7, null, null, null],
] as const;
const SHUSHAN_DUM = [0, 6, 10];
const SHUSHAN_TEK = [3, 4, 8, 12, 14];
const SHUSHAN_PROG = [[38, [62, 65, 69]], [39, [63, 67, 70]], [38, [62, 65, 69]], [36, [60, 63, 67]]] as const;
const HIGH_PROG = [[38, [62, 69, 76]], [34, [62, 70, 77]], [43, [62, 67, 74]], [37, [61, 68, 76]]] as const;
const STORM_PROG = [[38, [62, 65, 69]], [38, [63, 67, 70]], [36, [60, 63, 67]], [37, [61, 65, 68]]] as const;
const STORM_OST = [0, 12, 0, 13, 0, 12, 0, 10, 0, 12, 0, 13, 15, 13, 12, 10];
const STORM_KICK = [0, 3, 6, 8, 11, 14];
const PERSIA_PROG = [[33, [57, 60, 64]], [34, [58, 62, 65]], [31, [55, 58, 62]], [32, [56, 60, 63]]] as const;
/** The monarch's motif: a falling fourth, a lowered second, and the climb back (relative to the bar's root). */
const PERSIA_MOTIF: Record<number, number> = { 0: 12, 3: 7, 4: 8, 6: 7, 8: 5, 10: 7, 12: 12 };
const TRIAL_PROG = [[38, [62, 65, 69]], [34, [62, 65, 70]], [41, [60, 65, 69]], [36, [60, 64, 67]]] as const;
const TRIAL_OST = [0, 0, 7, 0, 12, 0, 7, 0, 0, 0, 7, 0, 12, 7, 5, 7];
const TRIAL_CALL: Record<number, number>[] = [
  { 0: 74, 6: 77, 8: 76, 12: 74 },
  { 0: 72, 4: 74, 8: 77, 12: 81 },
  { 0: 81, 6: 79, 8: 77, 12: 76 },
  { 0: 76, 8: 74 },
];

// Chapters VII–IX, the Fallen Crowns, and Chapter X.
const HUNT_PROG = [[38, [62, 65, 69]], [34, [62, 65, 70]], [36, [60, 64, 67]], [33, [61, 64, 69]]] as const;
/** The chase: 3 + 3 + 2. */
const HUNT_DRUM = [0, 6, 12];
/** The horn's call, in open fourths and fifths like a real hunting horn, then its answer. */
const HUNT_CALL: Record<number, number>[] = [
  { 0: 62, 3: 69, 4: 69, 6: 74, 12: 69 },
  { 0: 70, 4: 69, 6: 67, 8: 65, 12: 62 },
  { 0: 67, 3: 72, 4: 72, 6: 76, 12: 72 },
  { 0: 69, 4: 73, 8: 76, 12: 69 },
];
const PLAGUE_PROG = [[36, [60, 63, 67]], [37, [61, 65, 68]], [32, [60, 63, 68]], [35, [59, 62, 67]]] as const;
/** The lament: each bar sighs a step down, the last falling to the leading tone. */
const PLAGUE_SIGH: Record<number, number>[] = [
  { 0: 75, 4: 74, 8: 72, 12: 71 },
  { 0: 77, 4: 75, 8: 73, 12: 72 },
  { 0: 75, 4: 72, 8: 70, 12: 68 },
  { 0: 67, 4: 68, 8: 65, 12: 67 },
];
const CINDER_PROG = [[41, [65, 68, 72]], [42, [66, 70, 73]], [39, [63, 67, 70]], [36, [60, 64, 67]]] as const;
/** Hammer strength by step: strike, strike, rest, tap. */
const CINDER_ANVIL: Record<number, number> = { 0: 0.85, 3: 0.35, 6: 0.6, 8: 0.75, 11: 0.3, 14: 0.45 };
/** D Dorian: D E F G A B C. */
const GRECIA_SCALE = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
/** Where the lyre's figure starts on the mode in each bar, so it follows the chord. */
const GRECIA_SHIFT = [0, 3, 6, 4];
const GRECIA_LYRE = [0, 2, 4, 7, 6, 4, 3, 1];
const GRECIA_PROG = [[38, [62, 65, 69]], [43, [62, 67, 71]], [36, [60, 64, 67]], [45, [61, 64, 69]]] as const;
const GRECIA_MEL: Record<number, number>[] = [
  { 0: 74, 4: 76, 6: 77, 8: 76, 12: 74 },
  { 0: 71, 4: 72, 6: 74, 8: 72, 12: 71 },
  { 0: 69, 3: 71, 4: 72, 8: 74, 12: 76 },
  { 0: 77, 4: 76, 6: 74, 8: 73, 12: 74 },
];
/** E Phrygian for the storm: E F G A B C D. */
const GRECIA_BOSS_PROG = [[40, [64, 67, 71]], [41, [65, 69, 72]], [40, [64, 67, 71]], [38, [62, 65, 69]]] as const;
const GRECIA_BOSS_OST = [0, 7, 12, 7, 1, 7, 12, 7, 0, 7, 12, 7, 3, 1, 0, 1];
const GRECIA_BOSS_KICK = [0, 3, 6, 8, 11, 14];
const GRECIA_RIFF: Record<number, number> = { 0: 12, 2: 13, 4: 12, 6: 10, 8: 8, 10: 7, 12: 5 };

export const TRACKS: Record<string, TrackDef> = {
  // Chapter VII: the Crown of the Hunt. D minor in a winter wood: horn calls across the
  // trees and their echo, taiko beating a 3+3+2 chase, a gallop in the strings when foes close.
  hunt: {
    bpm: 84,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 84;
      const [r, ch] = HUNT_PROG[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 0.9, 520, 0.9);
        m.strings(d, r - 5, t, beat * 4, 0.4, 520, 0.9);
        if (b % 2 === 0) for (const n of ch) m.choir(d, n - 12, t, beat * 8, 0.22, 'oo');
      }
      // The chase: low drums in threes and a two, a rim on the off-beat.
      if (HUNT_DRUM.includes(p)) m.taiko(d, t, (p === 0 ? 0.42 : 0.28) + I * 0.3, p === 0 ? 0.62 : 0.78);
      if (p === 4 || p === 12) m.frame(d, t, 0.22, true);
      // The horn calls on alternate phrases; its echo answers from the far ridge.
      const call = HUNT_CALL[b % 4][p];
      if (Math.floor(b / 4) % 2 === 0 && call !== undefined) {
        const len = beat * (p === 0 || p === 12 ? 1.8 : 0.85);
        m.horn(d, call, t, len, 0.8);
        m.horn(d, call, t + beat * 1.5, len, 0.28, 0.6);
      } else if (p % 4 === 2) m.harp(d, ch[(p >> 2) % 3] + 12, t, 0.32, 1.6);
      if (p === 8 && b % 8 === 7) m.horn(d, r + 19, t, beat * 3, 0.45, 0.7);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        // the gallop: da-da-dum in the low strings
        if (p % 4 !== 3) m.strings(d, r + 12 + (p % 4 === 2 ? 7 : 0), t, 0.12, 0.55 * v, 2200, 0.004);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, beat * 2, 0.55 * v);
        if (p === 6 || p === 14) m.snare(d, t, 0.22 * v);
        if (p === 10) m.taiko(d, t, 0.5 * v, 1.1);
      }
    },
  },
  // Chapter VIII: the Crown of Pestilence. C minor, sick and close: a drone that will not
  // lift, strings sighing down the minor mode, a buzz that drifts in and out of tune.
  plague: {
    bpm: 66,
    ambience: 'drone',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 66;
      const [r, ch] = PLAGUE_PROG[b % 4];
      if (p === 0) {
        m.strings(d, 24, t, beat * 4, 0.75, 320, 1.4);
        m.strings(d, 31, t, beat * 4, 0.3, 320, 1.4);
        // the rub: the chord's root and the semitone above it, held together
        m.strings(d, r + 12, t, beat * 4, 0.28, 700, 1.2);
        m.strings(d, r + 13, t, beat * 4, 0.14, 700, 1.2);
        if (b % 4 === 1) m.choir(d, ch[1], t, beat * 6, 0.2, 'oo');
      }
      // the lament: a sighing line in the violas, slurred two by two
      const n = PLAGUE_SIGH[b % 4][p];
      if (Math.floor(b / 4) % 2 === 1 && n !== undefined) m.strings(d, n, t, beat * 1.7, 0.42, 1500, 0.25);
      else if (p % 4 === 2 && Math.random() < 0.4) m.harp(d, ch[(p >> 2) % 3] + 12, t, 0.2, 2.2);
      // the swarm: a buzz on the weak beats, a little out of tune each bar
      if (p === 6 || p === 14) m.buzz(d, r + 24 + (b % 3 === 2 ? 1 : 0), t, beat * 0.6, 0.28);
      if (p === 10 && b % 4 === 3) m.bell(d, r + 24, t, 0.3, 3.5);
      if (p === 0 || p === 9) m.frame(d, t, 0.32);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p % 2 === 0) m.strings(d, r + 24 + [0, 1, 0, 3][(p >> 1) % 4], t, 0.14, 0.45 * v, 2000, 0.004);
        if (p === 0 || p === 6) m.taiko(d, t, 0.5 * v, 0.8);
        if (p === 4 || p === 12) m.buzz(d, r + 12, t, beat * 0.5, 0.5 * v);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, beat * 2, 0.45 * v);
      }
    },
  },
  // Chapter IX: the Crown of Cinders. F Phrygian in the foundries: hammers ring on anvils in a
  // smith's rhythm, the bellows breathe, and a low brass chorale moves underneath like slag.
  cinders: {
    bpm: 76,
    ambience: 'furnace',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 76;
      const [r, ch] = CINDER_PROG[b % 4];
      if (p === 0) {
        m.bass(d, r - 12, t, beat * 4, 0.55);
        // the chorale: low brass swelling in, every bar
        for (const n of ch) m.brass(d, n - 12, t, beat * 3.7, 0.3, 0.7);
      }
      // the smith's rhythm: strike, strike, rest, and a lighter tap that rings on
      const hit = CINDER_ANVIL[p];
      if (hit !== undefined) m.anvil(d, t, hit, p === 0 ? 392 : p === 8 ? 466 : 523);
      if (p === 0 && b % 2 === 0) m.taiko(d, t, 0.45, 0.55);
      if (p === 8 && b % 2 === 1) m.breath(d, t, beat * 1.8, 0.55, true);
      if (p === 0 && b % 8 === 0) m.gong(d, r, t, 0.45, 4);
      if (p === 12 && b % 4 === 2) m.horn(d, ch[2], t, beat * 1.6, 0.35, 0.6);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 4 || p === 12) m.snare(d, t, 0.3 * v);
        if (p === 0 || p === 6 || p === 10) m.taiko(d, t, 0.55 * v, 0.75);
        if (p % 2 === 1) m.strings(d, r + 12 + [0, 1, 0, 3][(p >> 1) % 4], t, 0.12, 0.45 * v, 2200, 0.004);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, beat * 1.8, 0.65 * v);
      }
    },
  },
  // Varkhos, Crown of the Hunt. Phase 0: drums and the horn, the hunt in earnest.
  // Phase 1, the Hunt Shades: a choir and the gallop doubled. Phase 2, the Great Hunt:
  // faster, the horn an octave up, rolls into every phrase.
  beast_monarch: {
    bpm: 120,
    phaseBpm: [120, 128, 138],
    ambience: 'wind',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / (120 + ph * 9);
      const [r, ch] = HUNT_PROG[b % 4];
      if (p % 4 !== 3) m.strings(d, r + 12 + (p % 4 === 2 ? 7 : 0), t, 0.11, 0.7 + ph * 0.1, 2400, 0.003);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 0.95);
      if (HUNT_DRUM.includes(p)) m.taiko(d, t, 0.85, p === 0 ? 0.55 : 0.7);
      if (p === 4 || p === 12) m.snare(d, t, 0.32 + ph * 0.1);
      const call = HUNT_CALL[b % 4][p];
      if (call !== undefined && b % 2 === 0) m.horn(d, call + (ph >= 2 ? 12 : 0), t, beat * (p === 0 || p === 12 ? 1.6 : 0.8), 0.9);
      if (p === 0) m.brass(d, r, t, beat * 1.5, 0.75);
      if (ph >= 1) {
        if (p === 0) for (const n of ch) m.choir(d, n, t, beat * 4, 0.45 + ph * 0.1, 'ah');
        if (p % 4 !== 3) m.strings(d, r + 24 + (p % 4 === 2 ? 7 : 0), t, 0.09, 0.4, 3000, 0.003);
        if (call !== undefined && b % 2 === 1) m.horn(d, call - 12, t, beat * 0.8, 0.5, 0.7);
        if (p % 2 === 1) m.tick2(d, t, 0.45);
      }
      if (ph >= 2) {
        if (p % 2 === 0 && !HUNT_DRUM.includes(p)) m.taiko(d, t, 0.45, 1.2);
        if (p === 8) m.brass(d, r + 12 + 1, t, beat * 1.2, 0.6);
        if (b % 2 === 1 && p >= 12) m.snare(d, t, 0.22 + (p - 12) * 0.08);
        if (p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 0.9);
      }
    },
  },
  // Morvane, Crown of Pestilence. Phase 0: tremolo strings in the minor mode, a buzzing
  // pulse. Phase 1, the Brood: the swarm's riff, clicks and a choir a semitone apart.
  // Phase 2, the Great Miasma: faster, high shimmer, brass, and the drums doubled.
  plague_monarch: {
    bpm: 100,
    phaseBpm: [100, 108, 116],
    ambience: 'swarm',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / (100 + ph * 8);
      const [r, ch] = PLAGUE_PROG[b % 4];
      // tremolo strings carrying the chord
      if (p % 2 === 0) for (const n of ch) m.strings(d, n, t, 0.18, 0.28 + ph * 0.06, 2400, 0.004);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 0.85);
      if (p === 0) m.choir(d, ch[0], t, beat * 4, 0.4, 'oo');
      if (p === 0 || p === 6 || p === 10) m.taiko(d, t, 0.7, 0.8);
      if (p === 4 || p === 12) m.frame(d, t, 0.5, true);
      if (p === 2 || p === 10) m.buzz(d, r + 24, t, beat * 0.4, 0.45);
      const n = PLAGUE_SIGH[b % 4][p];
      if (n !== undefined && b % 2 === 0) m.strings(d, n + 12, t, beat * 1.4, 0.5, 2200, 0.08);
      if (ph >= 1) {
        if (p === 0 || p === 3 || p === 6) m.buzz(d, r + 12 + (p === 6 ? 1 : 0), t, beat * 1.1, 0.75);
        if (p % 4 === 2) m.click(d, t, 0.45, 3400);
        if (p === 0 && b % 2 === 0) for (const k of [0, 1, 7]) m.choir(d, ch[0] + k, t, beat * 7, 0.45, 'ah');
        if (p === 4 || p === 12) m.snare(d, t, 0.35);
      }
      if (ph >= 2) {
        m.strings(d, r + 36 + [0, 1, 0, 3][p % 4], t, 0.07, 0.3, 3600, 0.003);
        if (p === 0) {
          m.brass(d, r + 12, t, beat * 1.5, 0.8);
          m.brass(d, r + 13, t, beat * 1.5, 0.5);
        }
        if (p % 2 === 0) m.taiko(d, t, 0.4, 1.25);
        if (p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
      }
    },
  },
  // Azkar, Crown of Cinders. Phase 0: anvils on every beat, low brass, the furnace's roar.
  // Phase 1, the Tempered Crown: a second hammer on the off-beats, choir, snare. Phase 2,
  // the Last Bellows: faster, a gong each phrase, strings racing, drums doubled.
  cinder_monarch: {
    bpm: 104,
    phaseBpm: [104, 112, 122],
    ambience: 'furnace',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / (104 + ph * 9);
      const [r, ch] = CINDER_PROG[b % 4];
      if (p % 4 === 0) {
        m.anvil(d, t, p === 0 ? 0.95 : 0.65, p === 0 ? 392 : 440);
        m.bass(d, r, t, beat * 0.9, 0.95);
      }
      if (p === 0 || p === 8) m.taiko(d, t, 0.9, 0.5);
      if (p === 0) for (const n of ch) m.brass(d, n - 12, t, beat * 3.6, 0.5, 0.25);
      if (p === 10 && b % 2 === 1) m.brass(d, r + 12, t, beat * 1.2, 0.7);
      m.strings(d, r + 12 + [0, 0, 1, 0, 0, 0, 3, 1][p % 8], t, 0.1, 0.5 + ph * 0.1, 2000, 0.003);
      if (ph >= 1) {
        if (p % 4 === 2) m.anvil(d, t, 0.5, 659);
        if (p === 4 || p === 12) m.snare(d, t, 0.42);
        if (p === 0 && b % 2 === 0) for (const n of ch) m.choir(d, n, t, beat * 7, 0.5, 'ah');
        if (p === 0) m.brass(d, r + 12, t, beat * 1.4, 0.8);
      }
      if (ph >= 2) {
        if (p === 0 && b % 2 === 0) m.gong(d, r + 12, t, 0.6, 3.5);
        if (p % 2 === 0 && p % 8 !== 0) m.taiko(d, t, 0.45, 1.15);
        m.strings(d, r + 24 + [0, 7, 3, 7][p % 4], t, 0.07, 0.32, 3200, 0.003);
        if (b % 4 === 3 && p >= 12) m.snare(d, t, 0.22 + (p - 12) * 0.08);
        if (p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
      }
    },
  },
  // Chapter X: Grecia. D Dorian on an island shore: a lyre picking out the mode, an aulos
  // singing over it on alternate phrases, and the sea gathering in long swells.
  grecia: {
    bpm: 80,
    ambience: 'sea',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 80;
      const [r, ch] = GRECIA_PROG[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 0.7, 600, 1);
        m.strings(d, r - 5, t, beat * 4, 0.3, 600, 1);
        if (b % 4 === 2) for (const n of ch) m.choir(d, n - 12, t, beat * 8, 0.18, 'oo');
      }
      // the lyre: up the chord and down the mode
      if (p % 2 === 0) m.lyre(d, GRECIA_SCALE[GRECIA_LYRE[(p >> 1) % 8] + GRECIA_SHIFT[b % 4]], t, 0.55, p % 8 === 0 ? 1.6 : 1);
      // the aulos on alternate phrases, sliding into its long notes
      const n = GRECIA_MEL[b % 4][p];
      if (Math.floor(b / 4) % 2 === 1 && n !== undefined) m.aulos(d, n, t, beat * (p === 0 || p === 12 ? 1.8 : 0.9), 0.5, p === 0 ? 1 : 0);
      // the sea
      if (p === 0 && b % 2 === 0) m.surf(d, t, beat * 6, 0.6);
      if (p === 0 || p === 10) m.frame(d, t, 0.3);
      if (p === 6 || p === 14) m.frame(d, t, 0.18, true);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 6 || p === 10) m.taiko(d, t, 0.5 * v, 0.85);
        if (p % 2 === 1) m.strings(d, r + 12 + [0, 7, 3, 7][(p >> 1) % 4], t, 0.12, 0.45 * v, 2400, 0.004);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, beat * 2, 0.5 * v);
        if (p === 4 || p === 12) m.snare(d, t, 0.22 * v);
      }
    },
  },
  // Chapter X's boss: E Phrygian, a storm at sea. The aulos riff over a racing lyre;
  // phase 1 brings the choir and brass, phase 2 the thunder, the surf and the rolls.
  grecia_boss: {
    bpm: 126,
    phaseBpm: [126, 134, 144],
    ambience: 'sea',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / (126 + ph * 9);
      const [r, ch] = GRECIA_BOSS_PROG[b % 4];
      m.lyre(d, r + 24 + GRECIA_BOSS_OST[p], t, 0.5 + ph * 0.1, 0.4);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 0.9);
      if (GRECIA_BOSS_KICK.includes(p)) m.taiko(d, t, 0.8, p === 0 ? 0.6 : 0.8);
      if (p === 4 || p === 12) m.snare(d, t, 0.38);
      const riff = GRECIA_RIFF[p];
      if (riff !== undefined) m.aulos(d, r + 24 + riff, t, beat * (p === 12 ? 1.4 : 0.7), 0.65, p === 0 ? 1 : 0);
      if (p === 0) m.strings(d, r, t, beat * 4, 0.7, 600, 0.2);
      if (ph >= 1) {
        if (p === 0) {
          for (const n of ch) m.choir(d, n, t, beat * 4, 0.45, 'ah');
          m.brass(d, r + 12, t, beat * 1.5, 0.85);
          m.brass(d, r + 19, t, beat * 1.5, 0.6);
        }
        if (p === 8 && b % 2 === 1) m.brass(d, r + 13, t, beat * 1.2, 0.6);
        if (p % 2 === 1) m.tick2(d, t, 0.5);
      }
      if (ph >= 2) {
        if (p === 0 && b % 2 === 0) {
          m.gong(d, r, t, 0.6, 3);
          m.taiko(d, t + 0.03, 0.8, 0.45);
        }
        if (p === 8 && b % 2 === 0) m.surf(d, t, beat * 3, 0.8);
        if (p % 2 === 0 && !GRECIA_BOSS_KICK.includes(p)) m.taiko(d, t, 0.4, 1.25);
        if (b % 4 === 3 && p >= 12) m.snare(d, t, 0.25 + (p - 12) * 0.08);
      }
    },
  },
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
  // Chapter III: the Valley of Dry Bones. E Phrygian, wide and empty: a low drone,
  // a far bell, and a reed lament that never quite resolves.
  valley: {
    bpm: 70,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 70;
      const [r, ch] = VALLEY_PROG[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 1.2, 480, 1.4);
        m.strings(d, r - 5, t, beat * 4, 0.45, 480, 1.4);
        if (b % 2 === 0) for (const n of ch) m.choir(d, n - 12, t, beat * 8, 0.32, 'oo');
      }
      // a low bell tolling across the valley, and its flattened second answering
      if (p === 0 && b % 4 === 0) m.bell(d, 52, t, 0.9, 6);
      if (p === 8 && b % 4 === 2) m.bell(d, 53, t, 0.45, 5);
      if (Math.random() < 0.05 && p % 2 === 1) m.harp(d, [76, 77, 79, 83, 84][Math.floor(rand(0, 5))], t, 0.3, 2.6);
      // the lament: E F E D B, on alternate phrases
      const n = VALLEY_MEL[p];
      if (Math.floor(b / 4) % 2 === 1 && n !== undefined) m.flute(d, n - (b % 4 === 3 ? 2 : 0), t, beat * 1.5, 0.75);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 10) m.taiko(d, t, 0.5 * v, 0.75);
        if (p === 6) m.taiko(d, t, 0.3 * v, 1);
        if (p % 2 === 0) m.strings(d, r + 12 + [0, 1, 0, 3][(p >> 1) % 4], t, 0.16, 0.55 * v, 2000, 0.005);
        if (p === 0 && b % 2 === 1) m.brass(d, r, t, beat * 2, 0.55 * v);
      }
    },
  },
  // Chapter III: inside the hive. A drone that pulses like breath, dissonant
  // sustains rubbing a semitone apart, dry clicks in an uneven pattern.
  hive: {
    bpm: 96,
    ambience: 'swarm',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 96;
      const roots = [37, 37, 38, 36];
      const r = roots[b % 4];
      // the pulse
      if (p % 2 === 0) m.bass(d, r - 12, t, 0.2, p % 8 === 0 ? 0.6 : 0.36);
      if (p === 0 && b % 2 === 0) {
        m.strings(d, r + 12, t, beat * 8, 0.5, 700, 1.6);
        m.strings(d, r + 13, t, beat * 8, 0.32, 700, 1.6);
      }
      if (p === 0 && b % 4 === 1) m.choir(d, r + 18, t, beat * 6, 0.22, 'oo');
      // clicks: an uneven pattern that shifts each bar
      if (HIVE_CLICKS[b % 2].includes(p) && Math.random() > 0.12) m.click(d, t, rand(0.5, 0.9), rand(2400, 4200));
      // a burst of chittering at the end of every other bar
      if (p === 12 && b % 2 === 1) for (let k = 1; k <= 4; k++) m.click(d, t + k * 0.032, 0.55, rand(3000, 4600));
      // a thin high whine that comes and goes
      if (p === 0 && b % 8 === 7) m.strings(d, r + 48, t, beat * 3.5, 0.12, 5000, 1.2);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 6 || p === 8) m.taiko(d, t, 0.55 * v, 0.7);
        if (p === 4 || p === 12) m.snare(d, t, 0.25 * v);
        if (p % 2 === 1) m.strings(d, r + 24 + (p % 4 === 1 ? 0 : 1), t, 0.1, 0.5 * v, 2400, 0.004);
        if (p === 0 && b % 2 === 1) m.buzz(d, r + 12, t, beat * 1.5, 0.7 * v);
      }
    },
  },
  // The Locust King: the swarm made flesh. A Phrygian grind at full gallop;
  // phase 1 adds the buzzing riff and choir, phase 2 the semitone brass and rolls.
  swarm: {
    bpm: 160,
    ambience: 'swarm',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 160;
      const roots = [33, 34, 33, 31];
      const r = roots[b % 4];
      m.strings(d, r + 24 + SWARM_OST[p], t, 0.09, 0.8 + ph * 0.15, 2600, 0.003);
      if (ph >= 2) m.strings(d, r + 36 + SWARM_OST[p], t, 0.08, 0.4, 3400, 0.003);
      if (p % 2 === 0) m.bass(d, r, t, beat * 0.45, p % 8 === 0 ? 1 : 0.7);
      if (SWARM_KICK.includes(p)) m.taiko(d, t, 0.8, p % 8 === 0 ? 0.75 : 0.95);
      if (p === 4 || p === 12) m.snare(d, t, 0.45 + ph * 0.1);
      if (ph >= 1 && (p === 14 || p === 15)) m.taiko(d, t, 0.5, 1.35);
      if (ph >= 1 && p % 2 === 1) m.tick2(d, t, 0.7);
      if (ph >= 2 && p % 2 === 0 && p !== 4 && p !== 12) m.snare(d, t, 0.14);
      // the swarm's voice: a buzzing riff
      if (ph >= 1 && (p === 0 || p === 3 || p === 6)) m.buzz(d, r + 12 + (p === 6 ? 1 : 0), t, beat * 1.2, 0.8);
      if (p === 0) {
        m.brass(d, r + 12, t, beat * 1.5, 0.9);
        m.brass(d, r + 19, t, beat * 1.5, 0.65);
        if (ph >= 2) m.brass(d, r + 13, t, beat * 1.5, 0.55);
      }
      if (p === 8 && b % 2 === 1) m.brass(d, r + 24 + (ph >= 2 ? 1 : 0), t, beat * 1.2, 0.6);
      if (ph >= 1 && p === 0 && b % 2 === 0) for (const n of [57, 60, 64]) m.choir(d, n + (r - 33) + (ph >= 2 ? 1 : 0), t, beat * 7, 0.55 + ph * 0.15, 'ah');
      if (ph >= 2 && p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
      if (p % 4 === 2) m.click(d, t, 0.35 + ph * 0.15, 3600);
    },
  },
  // The Trial: an endless proving. D minor at a march, brass carrying the call on alternate phrases.
  trial: {
    bpm: 140,
    ambience: 'none',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 140;
      const [r, ch] = TRIAL_PROG[b % 4];
      const lift = 0.85 + Math.min(1, I) * 0.15;
      m.strings(d, r + 24 + TRIAL_OST[p], t, 0.11, 0.75 * lift, 2800, 0.003);
      if (p % 2 === 0) m.bass(d, r, t, beat * 0.45, p % 4 === 0 ? 0.95 : 0.6);
      if (p === 0 || p === 4 || p === 8 || p === 10 || p === 12) m.taiko(d, t, 0.7 * lift, p === 0 ? 0.8 : 1);
      if (p === 4 || p === 12) m.snare(d, t, 0.42);
      if (p % 2 === 1) m.tick2(d, t, 0.5);
      if (b % 4 === 3 && p >= 12) m.snare(d, t, 0.22 + (p - 12) * 0.08);
      if (p === 0) for (const n of ch) m.choir(d, n, t, beat * 4, 0.42, 'ah');
      if (p === 0 && b % 4 === 0) m.bell(d, ch[2] + 12, t, 0.6, 3);
      // the call
      const n = TRIAL_CALL[b % 4][p];
      if (Math.floor(b / 4) % 2 === 1 && n !== undefined) m.brass(d, n - 12, t, beat * (p === 0 && b % 4 === 3 ? 3.5 : 1.4), 0.75);
      else if (n !== undefined && p === 0) m.strings(d, n, t, beat * 3.5, 0.5, 2200, 0.08);
    },
  },
  // Chapter IV: dusk on the plain of Dura. E Phrygian dominant, an oud improvising
  // over a drone and a frame drum keeping a maqsum.
  dura: {
    bpm: 84,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 84;
      if (p === 0) {
        m.strings(d, 40, t, beat * 4, 0.9, 520, 1.2);
        m.strings(d, 47, t, beat * 4, 0.4, 520, 1.2);
        if (b % 4 === 0) m.choir(d, 64, t, beat * 8, 0.24, 'oo');
      }
      if (DURA_DUM.includes(p)) m.frame(d, t, 0.55 + I * 0.3);
      if (DURA_TEK.includes(p)) m.frame(d, t, p === 6 || p === 14 ? 0.35 : 0.6, true);
      // the oud line, and a grace note now and then
      const line = DURA_OUD[b % 4];
      const n = line[p];
      if (n !== null && n !== undefined) {
        const note = DURA_SCALE[n] + (Math.floor(b / 4) % 2 ? 12 : 0);
        m.oud(d, note, t, 0.9, p % 4 === 0 ? 1.1 : 0.7, Math.random() < 0.15 ? 1 : 0);
        if (Math.random() < 0.08) m.oud(d, note + 1, t + 0.06, 0.5, 0.25);
      }
      // a reed answering on the second half of every other phrase
      if (Math.floor(b / 2) % 2 === 1 && p % 4 === 2 && Math.random() < 0.6) m.flute(d, DURA_SCALE[4 + ((p >> 2) % 4)] + 12, t, beat * 0.9, 0.5);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 10) m.taiko(d, t, 0.5 * v, 0.9);
        if (p % 2 === 1) m.strings(d, 52 + [0, 1, 4, 1][(p >> 1) % 4], t, 0.12, 0.5 * v, 2400, 0.004);
        if (p === 0 && b % 2 === 1) m.brass(d, 40, t, beat * 2, 0.5 * v);
      }
    },
  },
  // Chapter IV: Babylon by night. A grand processional: brass swelling over a march.
  babylon: {
    bpm: 96,
    ambience: 'fire',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 96;
      const [r, ch] = BABYLON_PROG[b % 4];
      if (p === 0) {
        m.bass(d, r, t, beat * 4, 0.7);
        for (const n of ch) m.brass(d, n - 12, t, beat * 3.6, 0.42, 0.9);
        for (const n of ch) m.choir(d, n, t, beat * 4, 0.3, 'ah');
      }
      // the march: taiko on the beats, a snare roll into each phrase
      if (p % 4 === 0) m.taiko(d, t, p === 0 ? 0.7 : 0.45, p === 0 ? 0.8 : 1);
      if (p === 6 || p === 14) m.frame(d, t, 0.5, true);
      if (b % 4 === 3 && p >= 12) m.snare(d, t, 0.18 + (p - 12) * 0.07);
      // the herald's call on alternate phrases
      const n = BABYLON_CALL[p];
      if (Math.floor(b / 2) % 2 === 1 && n !== undefined) m.brass(d, n + (b % 4 === 3 ? -2 : 0), t, beat * (p === 12 ? 3 : 1.4), 0.6);
      if (p === 0 && b % 4 === 0) m.bell(d, ch[2] + 12, t, 0.45, 3.5);
      if (p % 4 === 2) m.harp(d, ch[(p >> 2) % 3] + 12, t, 0.35, 1.4);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 10) m.taiko(d, t, 0.5 * v, 1.2);
        if (p === 4 || p === 12) m.snare(d, t, 0.3 * v);
        if (p % 2 === 1) m.strings(d, r + 24 + [0, 7, 3, 7][(p >> 1) % 4], t, 0.12, 0.6 * v, 2600, 0.004);
      }
    },
  },
  // Chapter IV: the furnace halls. Hammers on metal, a roar underneath, and a
  // figure that climbs a semitone every bar until it breaks.
  furnace: {
    bpm: 104,
    ambience: 'furnace',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 104;
      const climb = b % 8;
      if (p % 4 === 0) m.bass(d, 33, t, beat * 0.9, p === 0 ? 0.9 : 0.55);
      if (FURNACE_HITS.includes(p)) m.anvil(d, t, p === 0 ? 0.9 : 0.6, p === 0 ? 440 : p % 3 === 0 ? 560 : 620);
      if (p === 0 || p === 8) m.taiko(d, t, 0.55, 0.7);
      if (p === 0) {
        m.strings(d, 45 + climb, t, beat * 4, 0.55, 900, 0.5);
        m.strings(d, 46 + climb, t, beat * 4, 0.3, 900, 0.5);
      }
      if (p % 2 === 0) m.strings(d, 57 + climb + (p % 4 === 2 ? 1 : 0), t, 0.1, 0.35 + climb * 0.05, 2400, 0.004);
      if (climb === 7 && p === 8) m.swell(d, t, beat * 2, 0.8);
      if (p === 0 && climb === 0) m.gong(d, 33, t, 0.6, 4);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 4 || p === 12) m.snare(d, t, 0.35 * v);
        if (p % 2 === 1) m.tick2(d, t, 0.6 * v);
        if (p === 0 && b % 2 === 1) m.brass(d, 45 + climb, t, beat * 2, 0.6 * v);
      }
    },
  },
  // Chapter IV: the lions' den. Sparse and low; something breathes in the dark.
  den: {
    bpm: 50,
    ambience: 'den',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 50;
      if (p === 0) {
        m.strings(d, 37, t, beat * 4, 0.8, 360, 1.6);
        if (b % 2 === 1) m.strings(d, 38, t, beat * 4, 0.35, 360, 1.6);
      }
      // the breath: in over a bar, out over the next, with a growl in it
      if (p === 0) m.breath(d, t, beat * 3, 0.8, b % 2 === 1);
      if (p === 8 && b % 4 === 2) m.taiko(d, t, 0.3, 0.6);
      if (Math.random() < 0.05 && p % 2 === 1) m.harp(d, [49, 52, 56, 61][Math.floor(rand(0, 4))], t, 0.3, 2.4);
      if (p === 12 && b % 4 === 3) m.flute(d, 73, t, beat * 1.5, 0.35);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 6) m.taiko(d, t, 0.55 * v, 0.7);
        if (p % 4 === 2) m.strings(d, 49 + (p === 10 ? 1 : 0), t, 0.16, 0.5 * v, 1800, 0.005);
      }
    },
  },
  // The Image of gold: colossal. A choir over heavy drums; each phase adds weight,
  // then brass and a gong, then the full march at double time.
  image: {
    bpm: 112,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 112;
      const [r, ch] = IMAGE_PROG[b % 4];
      const lift = ph >= 3 ? 1 : 0;
      if (p === 0) {
        for (const n of ch) m.choir(d, n + lift, t, beat * 4, 0.7 + ph * 0.1, 'ah');
        for (const n of ch) m.choir(d, n - 12 + lift, t, beat * 4, 0.45, 'oo');
        m.strings(d, r + lift, t, beat * 4, 1.1, 700, 0.3);
      }
      if (p % 4 === 0) m.bass(d, r + lift, t, beat * 0.95, 0.9);
      if (IMAGE_KICK.includes(p)) m.taiko(d, t, 0.85, p === 0 ? 0.6 : 0.8);
      if (p === 4 || p === 12) m.snare(d, t, 0.35 + ph * 0.08);
      if (p === 0 && b % 4 === 0) m.gong(d, r + 12, t, 0.7, 5);
      if (ph >= 1) {
        m.strings(d, r + 24 + [0, 0, 7, 0, 3, 0, 7, 0, 0, 0, 7, 0, 8, 7, 3, 2][p] + lift, t, 0.11, 0.7, 2600, 0.003);
        if (p === 0) {
          m.brass(d, r + 12 + lift, t, beat * 1.5, 0.85);
          m.brass(d, r + 19 + lift, t, beat * 1.5, 0.6);
        }
        if (p === 2 || p === 14) m.taiko(d, t, 0.45, 1.3);
      }
      if (ph >= 2) {
        if (p % 2 === 1) m.tick2(d, t, 0.7);
        if (p === 8 && b % 2 === 1) m.brass(d, r + 24 + lift, t, beat * 1.2, 0.6);
        if (p === 0) m.bell(d, ch[2] + 12 + lift, t, 0.5, 2.5);
        if (b % 4 === 3 && p >= 12) m.snare(d, t, 0.2 + (p - 12) * 0.08);
      }
      if (ph >= 3) {
        if (p % 2 === 0 && !IMAGE_KICK.includes(p)) m.taiko(d, t, 0.4, 1.1);
        if (p === 0 && b % 2 === 0) m.gong(d, r, t, 0.6, 4);
        if (p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
      }
    },
  },
  // Chapter V: the dry riverbed at night. Hushed: the water is gone, the city
  // drinks behind its walls, and far off the army's drums keep a slow count.
  riverbed: {
    bpm: 60,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 1;
      if (p === 0) {
        m.strings(d, 26, t, beat * 4, 0.8, 300, 1.6);
        m.strings(d, 38, t, beat * 4, 0.35, 420, 1.6);
        if (b % 4 === 2) m.choir(d, 57, t, beat * 6, 0.18, 'oo');
      }
      // the army, miles off: two low beats and a long rest
      if ((p === 0 || p === 3) && b % 2 === 0) m.taiko(d, t, 0.18, 0.55);
      if (p === 8 && b % 8 === 5) m.brass(d, 38, t, beat * 3, 0.22, 1.2);
      // a last drop of water on stone, here and there
      if (Math.random() < 0.06 && p % 2 === 1) m.harp(d, [74, 77, 81, 84, 86][Math.floor(rand(0, 5))], t, 0.3, 2.4);
      if (p === 12 && b % 4 === 3) m.bell(d, 62, t, 0.35, 5);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 10) m.taiko(d, t, 0.5 * v, 0.75);
        if (p % 2 === 0) m.strings(d, 50 + [0, 1, 0, 3][(p >> 1) % 4], t, 0.16, 0.5 * v, 1800, 0.005);
      }
    },
  },
  // Chapter V: the feast. Court music, lyres and frame drums and a reed, too bright,
  // while underneath a low cluster rises a semitone every four bars.
  feast: {
    bpm: 108,
    ambience: 'fire',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 108;
      const [r, ch] = FEAST_PROG[b % 4];
      const dread = Math.floor(b / 4) % 6;
      if (p === 0) {
        m.bass(d, r, t, beat * 4, 0.5);
        for (const n of ch) m.choir(d, n, t, beat * 4, 0.16, 'ah');
        // the dread: a dark cluster creeping upward under the revelry
        m.strings(d, 37 + dread, t, beat * 4, 0.45, 380, 1.2);
        m.strings(d, 38 + dread, t, beat * 4, 0.3, 380, 1.2);
      }
      m.harp(d, ch[0] + 12 + FEAST_LYRE[p] - (FEAST_LYRE[p] > 5 ? 12 : 0), t, 0.32, 0.7);
      if (p === 0 || p === 8) m.frame(d, t, 0.6);
      if (p === 4 || p === 10 || p === 12) m.frame(d, t, p === 10 ? 0.35 : 0.6, true);
      if (p % 2 === 1 && Math.random() < 0.3) m.frame(d, t, 0.2, true);
      const n = FEAST_MEL[p];
      if (Math.floor(b / 2) % 2 === 1 && n !== undefined) m.flute(d, n + (b % 4 === 3 ? -2 : 0), t, beat * 0.9, 0.55);
      else if (p % 4 === 2 && Math.random() < 0.5) m.oud(d, ch[(p >> 2) % 3] + 12, t, 0.6, 0.6);
      // a cup raised, laughter of bells, now and then
      if (p === 14 && b % 4 === 1) m.bell(d, 86, t, 0.3, 1.5);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 6) m.taiko(d, t, 0.55 * v, 0.85);
        if (p % 2 === 1) m.strings(d, r + 24 + (p % 4 === 1 ? 0 : 1), t, 0.1, 0.45 * v, 2400, 0.004);
        if (p === 0 && b % 2 === 1) m.brass(d, r + 12, t, beat * 2, 0.5 * v);
      }
    },
  },
  // Chapter V: the hanging gardens by moonlight. Gentle, F lydian, a harp and a flute.
  gardens: {
    bpm: 66,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 66;
      const [r, ch] = GARDEN_PROG[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 0.8, 900, 0.9);
        for (const n of ch) m.choir(d, n - 12, t, beat * 4, 0.26, 'oo');
      }
      if (p % 2 === 0) m.harp(d, ch[[0, 1, 2, 1, 2, 0, 1, 2][(p >> 1) % 8]] + 12, t, 0.45, 2);
      const n = GARDEN_MEL[p];
      if (Math.floor(b / 2) % 2 === 1 && n !== undefined) m.flute(d, n - (b % 4 === 3 ? 2 : 0), t, beat * 1.6, 0.6);
      if (p === 8 && b % 4 === 0) m.bell(d, ch[2] + 24, t, 0.3, 3);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 10) m.taiko(d, t, 0.45 * v, 0.85);
        if (p % 2 === 1) m.strings(d, r + 12 + [0, 4, 7, 4][(p >> 1) % 4], t, 0.14, 0.45 * v, 2200, 0.005);
      }
    },
  },
  // Chapter V: the palace. Tense and building: an ostinato that will not rest,
  // brass swelling, a figure climbing a step each bar.
  palace: {
    bpm: 92,
    ambience: 'drone',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 92;
      const [r, ch] = PALACE_PROG[b % 4];
      const climb = b % 8;
      m.strings(d, r + 12 + [0, 0, 7, 0, 3, 0, 7, 0][p % 8], t, 0.12, 0.45 + climb * 0.04, 1800, 0.004);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 0.7);
      if (p === 0) {
        for (const n of ch) m.choir(d, n - 12, t, beat * 4, 0.3, 'oo');
        m.brass(d, r + 12, t, beat * 3.6, 0.35 + climb * 0.04, 1);
      }
      if (p % 4 === 2) m.harp(d, ch[(p >> 2) % 3] + 12 + climb, t, 0.35, 1.4);
      if (p === 0 || p === 7 || p === 10) m.taiko(d, t, 0.4, 0.8);
      if (climb === 7 && p === 8) m.swell(d, t, beat * 2, 0.7);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 4 || p === 12) m.snare(d, t, 0.3 * v);
        if (p % 2 === 1) m.tick2(d, t, 0.5 * v);
      }
    },
  },
  // The Weigher. Phase 0 MENE, numbered: a bell tolls the count over a steady march.
  // Phase 1 TEKEL, weighed: the rhythm tips off balance, brass answers. Phase 2 PERES,
  // divided: everything at once, double time, the choir at full voice.
  weigher: {
    bpm: 126,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 126;
      const [r, ch] = WEIGH_PROG[b % 4];
      m.strings(d, r + 24 + [0, 0, 7, 0, 3, 0, 8, 7][p % 8], t, 0.11, 0.7 + ph * 0.12, 2600, 0.003);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 0.9);
      if (p === 0) for (const n of ch) m.choir(d, n, t, beat * 4, 0.45 + ph * 0.15, 'ah');
      if (p === 0 && b % 2 === 0) m.gong(d, r + 12, t, 0.5, 4);
      // MENE: the count
      if (p % 4 === 0) m.bell(d, 74 - (b % 4), t, 0.3, 1.6);
      if (p === 0 || p === 8) m.taiko(d, t, 0.8, 0.7);
      if (p === 4 || p === 12) m.snare(d, t, 0.35);
      if (ph >= 1) {
        // TEKEL: the beat lands late on one side, as a pan drops
        if (p === 3 || p === 6 || p === 11 || p === 14) m.taiko(d, t, 0.6, 1.1);
        if (p === 0) {
          m.brass(d, r + 12, t, beat * 1.5, 0.85);
          m.brass(d, r + 19, t, beat * 1.5, 0.6);
        }
        if (p === 10 && b % 2 === 1) m.brass(d, r + 24, t, beat * 1.2, 0.6);
        if (p % 2 === 1) m.tick2(d, t, 0.6);
      }
      if (ph >= 2) {
        // PERES: divided, doubled
        if (p % 2 === 0) m.taiko(d, t, 0.45, 1.25);
        m.strings(d, r + 36 + [0, 7, 3, 7][p % 4], t, 0.08, 0.4, 3400, 0.003);
        if (p === 8 && b % 4 === 3) m.swell(d, t, beat * 2, 1);
        if (b % 4 === 3 && p >= 12) m.snare(d, t, 0.25 + (p - 12) * 0.08);
      }
    },
  },
  // A quiet bed while the hand writes: a high, held stillness and a bell far away.
  writing: {
    bpm: 40,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 40;
      if (p === 0) {
        m.strings(d, 86, t, beat * 4, 0.22, 4200, 2);
        m.strings(d, 93, t, beat * 4, 0.12, 4200, 2);
        m.strings(d, 26, t, beat * 4, 0.6, 260, 2);
        m.choir(d, 62 + (b % 2 ? 1 : 0), t, beat * 4, 0.2, 'oo');
      }
      if (p === 8 && b % 2 === 1) m.bell(d, 50, t, 0.45, 6);
      if (p === 4) m.breath(d, t, beat * 2, 0.5, b % 2 === 1);
    },
  },
  // Chapter VI: by the great river at dawn. Hanan has fasted three weeks; a low drone,
  // a reed lament, water on the harp, and the prayer rising when he is heard.
  hiddekel: {
    bpm: 56,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 56;
      const [r, ch] = HIDDEKEL_PROG[b % 4];
      if (p === 0) {
        m.strings(d, 26, t, beat * 4, 0.7, 300, 1.8);
        m.strings(d, r, t, beat * 4, 0.3, 500, 1.8);
        if (b % 2 === 1) for (const n of ch) m.strings(d, n, t, beat * 4, 0.12, 900, 2);
      }
      // the prayer, on the reed, in alternate pairs of bars; the other pairs only the river
      const say = Math.floor(b / 2) % 2 === 0;
      const n = HIDDEKEL_MEL[b % 4][p];
      if (say && n > 0) m.flute(d, n - 12, t, beat * (HIDDEKEL_MEL[b % 4][(p + 1) % 16] < 0 ? 1.8 : 0.9), 0.5);
      if (!say && p % 4 === 2 && Math.random() < 0.5) m.harp(d, ch[(p >> 2) % 3] + 12, t, 0.22, 2.4);
      if (!say && p === 8 && b % 4 === 3) m.choir(d, 62, t, beat * 6, 0.18, 'oo');
      if (p === 0 && b % 8 === 7) m.bell(d, 50, t, 0.3, 5);
      if (p === 0 && b % 2 === 0) m.frame(d, t, 0.2);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 10) m.taiko(d, t, 0.45 * v, 0.8);
        if (p % 2 === 1) m.strings(d, r + 12 + [0, 1, 0, 3][(p >> 1) % 4], t, 0.15, 0.45 * v, 1800, 0.005);
      }
    },
  },
  // Chapter VI: Shushan the palace. Persian court music: oud and reed in a modal line,
  // a frame drum's dum and tek, imperial brass and a drone of strings.
  shushan: {
    bpm: 92,
    ambience: 'wind',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 92;
      const [r, ch] = SHUSHAN_PROG[b % 4];
      if (p === 0) {
        m.strings(d, 38, t, beat * 4, 0.8, 520, 1.1);
        m.strings(d, 45, t, beat * 4, 0.35, 520, 1.1);
        if (b % 4 === 0) m.choir(d, 62, t, beat * 8, 0.2, 'ah');
        if (b % 4 === 2) for (const n of ch) m.brass(d, n - 12, t, beat * 3.6, 0.3, 0.7);
      }
      if (SHUSHAN_DUM.includes(p)) m.frame(d, t, 0.55 + I * 0.25);
      if (SHUSHAN_TEK.includes(p)) m.frame(d, t, p === 3 || p === 14 ? 0.3 : 0.5, true);
      const n = SHUSHAN_OUD[b % 4][p];
      if (n !== null && n !== undefined) {
        const note = SHUSHAN_SCALE[n] + (Math.floor(b / 4) % 2 ? 12 : 0);
        m.oud(d, note, t, 0.85, p % 4 === 0 ? 1.1 : 0.7, Math.random() < 0.18 ? 1 : 0);
        if (Math.random() < 0.1) m.oud(d, note + 1, t + 0.05, 0.45, 0.25);
      }
      if (Math.floor(b / 2) % 2 === 1 && p % 4 === 2 && Math.random() < 0.55) m.flute(d, SHUSHAN_SCALE[7 + ((p >> 2) % 4)] + 12, t, beat * 0.9, 0.45);
      // the king's herald, once a phrase
      if (b % 4 === 3 && p === 8) {
        m.brass(d, 62, t, beat * 1.4, 0.5);
        m.brass(d, 69, t + beat * 1.5, beat * 2.2, 0.45);
      }
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 8) m.taiko(d, t, 0.55 * v, 0.85);
        if (p === 12) m.snare(d, t, 0.25 * v);
        if (p % 2 === 1) m.strings(d, 50 + [0, 1, 3, 1][(p >> 1) % 4], t, 0.12, 0.5 * v, 2400, 0.004);
      }
    },
  },
  // Chapter VI: the high places. Wide, slow and wrong: open fifths, a choir without
  // a home key, a bell far below, breath in the gaps.
  highplaces: {
    bpm: 48,
    ambience: 'drone',
    gen(m, d, s, t, I) {
      const b = bar(s), p = pos(s);
      const beat = 60 / 48;
      const [r, ch] = HIGH_PROG[b % 4];
      if (p === 0) {
        m.strings(d, r - 12, t, beat * 4, 0.6, 260, 2);
        m.strings(d, r - 5, t, beat * 4, 0.25, 400, 2);
        for (const n of ch) m.choir(d, n - 12, t, beat * 4.2, 0.2, b % 2 ? 'oo' : 'ah');
        m.strings(d, ch[2] + 12, t, beat * 4, 0.1, 4200, 2.4);
      }
      if (p === 8 && b % 2 === 1) m.choir(d, ch[1] + (b % 4 === 3 ? 1 : 0), t, beat * 3, 0.2, 'oo');
      if (p === 4 && b % 4 === 0) m.bell(d, 38, t, 0.35, 6);
      if (p === 12 && b % 4 === 2) m.bell(d, ch[2] + 12, t, 0.2, 4);
      if (p === 10 && b % 2 === 0) m.breath(d, t, beat * 2, 0.4, b % 4 === 0);
      if (p % 4 === 2 && Math.random() < 0.18) m.harp(d, ch[Math.floor(rand(0, 3))] + 24, t, 0.18, 3);
      if (I > 0.12) {
        const v = Math.min(1, I * 1.3);
        if (p === 0 || p === 6 || p === 10) m.taiko(d, t, 0.5 * v, 0.65);
        if (p % 2 === 0) m.strings(d, r + 12 + [0, 7, 1, 7][(p >> 1) % 4], t, 0.2, 0.4 * v, 1600, 0.006);
      }
    },
  },
  // The Prince of the Storm: driving low strings, thunder in the drums.
  // Phase 1 adds the brass and the howling choir; phase 2 the rolls and the high ostinato.
  storm: {
    bpm: 138,
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 138;
      const [r, ch] = STORM_PROG[b % 4];
      m.strings(d, r + 12 + STORM_OST[p], t, 0.1, 0.7 + ph * 0.1, 2400, 0.003);
      if (p % 4 === 0) m.bass(d, r, t, beat * 0.9, 0.9);
      if (STORM_KICK.includes(p)) m.taiko(d, t, p === 0 ? 0.95 : 0.6, p === 0 ? 0.6 : 0.8);
      if (p === 4 || p === 12) m.snare(d, t, 0.4);
      // thunder: a low gong and drum together at the top of every other bar
      if (p === 0 && b % 2 === 0) {
        m.gong(d, r, t, 0.55, 3);
        m.taiko(d, t + 0.03, 0.8, 0.45);
      }
      if (p === 0) for (const n of ch) m.choir(d, n, t, beat * 4, 0.3 + ph * 0.12, 'ah');
      if (ph >= 1) {
        if (p === 0) {
          m.brass(d, r + 12, t, beat * 1.6, 0.8);
          m.brass(d, r + 19, t, beat * 1.6, 0.55);
        }
        if (p === 8) m.brass(d, r + 13, t, beat * 1.2, 0.6);
        if (p % 2 === 1) m.tick2(d, t, 0.5);
        if (p === 10 && b % 2 === 1) m.swell(d, t, beat * 1.5, 0.6);
      }
      if (ph >= 2) {
        if (p % 2 === 0) m.taiko(d, t, 0.4, 1.3);
        m.strings(d, r + 36 + [0, 7, 1, 7][p % 4], t, 0.07, 0.35, 3400, 0.003);
        if (b % 2 === 1 && p >= 12) m.snare(d, t, 0.25 + (p - 12) * 0.08);
        if (p === 0 && b % 4 === 3) m.gong(d, r + 12, t, 0.6, 4);
      }
    },
  },
  // The Prince of the Kingdom of Persia: a monarch's fight. A heavy brass motif over a
  // slow, crushing march; each phase thickens it, the last doubles the time.
  persia: {
    bpm: 112,
    // Enraged (phase 3): the march finally breaks into a run.
    phaseBpm: [112, 112, 112, 122],
    ambience: 'none',
    gen(m, d, s, t) {
      const b = bar(s), p = pos(s);
      const ph = m.phase;
      const beat = 60 / 112;
      const [r, ch] = PERSIA_PROG[b % 4];
      if (p % 4 === 0) m.bass(d, r, t, beat * 1.8, 1);
      if (p === 0) {
        m.strings(d, r, t, beat * 4, 0.7, 500, 0.2);
        for (const n of ch) m.choir(d, n, t, beat * 4, 0.35 + ph * 0.12, 'ah');
        if (b % 2 === 0) m.gong(d, r + 12, t, 0.55, 4.5);
      }
      // the march: kettle-weight on one and three, the frame drum between
      if (p === 0 || p === 8) m.taiko(d, t, 1, 0.55);
      if (p === 6 || p === 14) m.taiko(d, t, 0.6, 0.75);
      if (p === 4 || p === 12) m.snare(d, t, 0.38);
      if (p % 4 === 2) m.frame(d, t, 0.4, true);
      // the motif, in low brass, every bar; doubled at the octave from phase 1
      const mo = PERSIA_MOTIF[p];
      if (mo !== undefined) {
        const len = p === 0 || p === 12 ? 2.6 : p === 8 ? 1.8 : 0.9;
        m.brass(d, r + mo, t, beat * len, 0.9, 0.04);
        m.brass(d, r + mo - 12, t, beat * len, 0.6, 0.05);
        if (ph >= 1) m.brass(d, r + mo + 12, t, beat * len, 0.45, 0.04);
      }
      m.strings(d, r + 24 + [0, 0, 7, 0, 8, 0, 7, 3][p % 8], t, 0.11, 0.45 + ph * 0.15, 2400, 0.003);
      if (ph >= 1) {
        if (p % 2 === 1) m.tick2(d, t, 0.5);
        if (p === 10 && b % 2 === 1) m.taiko(d, t, 0.7, 1.1);
        if (p === 0 && b % 4 === 0) m.bell(d, ch[2] + 12, t, 0.45, 3);
      }
      if (ph >= 2) {
        if (p % 2 === 0) m.taiko(d, t, 0.45, 1.25);
        m.strings(d, r + 36 + [0, 7, 3, 7][p % 4], t, 0.07, 0.35, 3600, 0.003);
        if (b % 4 === 3 && p >= 8) m.snare(d, t, 0.2 + (p - 8) * 0.05);
        if (p === 8 && b % 2 === 0) m.swell(d, t, beat * 2, 1);
      }
      if (ph >= 3) {
        // Enraged: the motif shouted an octave up, and a roll into every bar.
        if (mo !== undefined) m.brass(d, r + mo + 24, t, beat * 0.8, 0.4, 0.03);
        if (p >= 12) m.snare(d, t, 0.2 + (p - 12) * 0.06);
      }
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
