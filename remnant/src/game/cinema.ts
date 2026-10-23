// A small cinematic toolkit for story scripts. Every step can be awaited:
//
//   await cinema.run(async (c) => {
//     await c.pan(boss.x, boss.y - 60, 1.4);
//     await c.zoom(0.8, 0.6);
//     await c.title('VARKHOS', 'Crown of the Hunt');
//   }, () => token === this.epoch);
//
// run() always puts the camera focus, framing, time scale, letterbox and the
// cutscene flag back the way it found them, even when a step throws or the
// scene is abandoned (a room change). Steps return early once `alive` fails.
// Timing is real time, so a sequence also completes while the game is paused.

import { G } from './ctx';
import { input } from '../core/input';
import { titleCard } from '../ui/cards';

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const barsShown = () => !!document.getElementById('app')?.classList.contains('on');

interface Saved {
  focus: { x: number; y: number } | null;
  focusRate: number;
  view: number;
  cutscene: boolean;
  bars: boolean;
}

class Cinema {
  /** True while a sequence runs. */
  active = false;
  /** Sequences that ran to the end and restored everything (for tests). */
  completed = 0;
  private saved: Saved | null = null;
  private alive: () => boolean = () => true;
  /** The camera follows this point during pans; reused so a pan allocates nothing per frame. */
  private pt = { x: 0, y: 0 };
  /** A fade to black left down when the scene ends is lifted again. */
  private faded = false;
  private slowed = false;

  /** Run a sequence; resolves true if it finished without being abandoned. */
  async run(seq: (c: Cinema) => Promise<void>, alive: () => boolean = () => true): Promise<boolean> {
    // A sequence inside a sequence shares the outer one's restore.
    if (this.active) {
      await seq(this);
      return this.ok();
    }
    this.begin(alive);
    let done = false;
    try {
      await seq(this);
      done = this.ok();
    } catch {
      done = false;
    } finally {
      this.end();
    }
    if (done) this.completed++;
    return done;
  }

  /** Still worth playing: the sequence is live and its scene has not moved on. */
  ok() {
    return this.active && this.alive();
  }

  private begin(alive: () => boolean) {
    const cam = G.camera;
    this.saved = { focus: cam.focus, focusRate: cam.focusRate, view: cam.viewMultTarget, cutscene: G.inCutscene, bars: barsShown() };
    this.alive = alive;
    this.active = true;
    G.inCutscene = true;
  }

  private end() {
    const s = this.saved;
    this.active = false;
    this.saved = null;
    if (!s) return;
    const cam = G.camera;
    cam.focus = s.focus;
    cam.focusRate = s.focusRate;
    cam.viewMultTarget = s.view;
    G.inCutscene = s.cutscene;
    if (barsShown() !== s.bars) G.ui.cinematicBars(s.bars);
    // Slow motion started here must not outlive the scene.
    const W = G.world;
    if (this.slowed && W && W.slowScale < 1) {
      W.slowT = 0;
      W.slowScale = 1;
    }
    this.slowed = false;
    titleCard(null);
    if (this.faded) {
      this.faded = false;
      void G.ui.fade(0, 0.4);
    }
    if (!s.cutscene) input.flush();
  }

  /** Real-time wait that gives up early when the scene is abandoned. */
  hold(sec: number) {
    return new Promise<void>((resolve) => {
      const until = performance.now() + sec * 1000;
      const tick = () => {
        if (!this.ok() || performance.now() >= until) resolve();
        else setTimeout(tick, Math.min(100, until - performance.now()));
      };
      tick();
    });
  }

  /** Ease the camera from where it is to (x, y) over `dur` seconds, and hold it there. */
  pan(x: number, y: number, dur = 1.2) {
    const cam = G.camera;
    const x0 = cam.x, y0 = cam.y;
    this.pt.x = x0;
    this.pt.y = y0;
    cam.focus = this.pt;
    cam.focusRate = 40;
    const start = performance.now();
    return new Promise<void>((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - start) / (dur * 1000));
        const e = easeInOut(k);
        this.pt.x = x0 + (x - x0) * e;
        this.pt.y = y0 + (y - y0) * e;
        if (k >= 1 || !this.ok()) resolve();
        else requestAnimationFrame(step);
      };
      step();
    });
  }

  /** Cut the camera straight to (x, y). */
  cut(x: number, y: number) {
    this.pt.x = x;
    this.pt.y = y;
    G.camera.focus = this.pt;
    G.camera.focusRate = 40;
    G.camera.snapTo(x, y);
  }

  /** Frame tighter (< 1) or wider (> 1); the camera's own spring eases it. */
  zoom(mult: number, dur = 0.7) {
    G.camera.viewMultTarget = mult;
    return this.hold(dur);
  }

  bars(on: boolean) {
    G.ui.cinematicBars(on);
  }

  /** Slow the world to `scale` for `sec` real seconds. */
  slowmo(scale: number, sec: number) {
    G.world.slowmo(sec, scale);
    this.slowed = true;
    return this.hold(sec);
  }

  fade(to: number, dur = 0.6) {
    if (!this.ok()) return Promise.resolve();
    this.faded = to > 0;
    return G.ui.fade(to, dur);
  }

  /** A centred title card over the scene for `sec` seconds. */
  async title(title: string, sub = '', sec = 2.4) {
    titleCard(title, sub);
    await this.hold(sec);
    titleCard(null);
    await this.hold(0.35);
  }
}

export const cinema = new Cinema();
