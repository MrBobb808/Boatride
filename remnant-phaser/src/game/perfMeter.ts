// Settings → Show frame rate, in this build (POLISH_PLAN §19 phase 6; the performance-optimization skill: measure on the
// device). Headless Chromium draws with a software GPU, so only the iPhone itself can say where its frame goes. The
// readout sets the frame (start to start) beside the script's share of it (Phaser's step: every scene's update and its
// draw calls): a frame much longer than its script is waiting on the GPU, a script near the frame is the CPU's.
// Fixed buffers and two timestamps a frame; the text changes twice a second.
import type Phaser from 'phaser';
import { settings } from '../classic/shim/settings';

const N = 240;

export function perfMeter(game: Phaser.Game, tier: () => number | null) {
  const gaps = new Float32Array(N), cpu = new Float32Array(N), scratch = new Float32Array(N);
  let i = 0, n = 0, start = 0, last = 0, shown = 0, el: HTMLDivElement | null = null;
  const median = (a: Float32Array) => { scratch.set(a); const s = scratch.subarray(0, n).sort(); return s[n >> 1]; };
  const worst = (a: Float32Array) => { let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, a[k]); return m; };
  const show = () => {
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 4px);z-index:60;'
        + 'pointer-events:none;font:600 10px/1.2 ui-monospace,Menlo,monospace;color:#cfc6da;background:rgba(7,6,10,.55);padding:2px 6px;border-radius:4px;white-space:nowrap';
      document.body.appendChild(el);
    }
    const f = median(gaps), q = tier();
    el.textContent = `${Math.round(1000 / f)} fps · frame ${f.toFixed(1)} ms (worst ${worst(gaps).toFixed(1)}) · script ${median(cpu).toFixed(1)} ms${q === null ? '' : ` · q${q}`}`;
  };
  game.events.on('prestep', () => {
    if (!settings.showFps) { if (el) { el.remove(); el = null; n = 0; last = 0; } return; }
    start = performance.now();
    if (last) { gaps[i] = start - last; i = (i + 1) % N; n = Math.min(N, n + 1); }
    last = start;
  });
  game.events.on('postrender', () => {
    if (!settings.showFps || !start) return;
    const now = performance.now();
    cpu[(i + N - 1) % N] = now - start;
    if (n > 8 && now - shown > 500) { shown = now; show(); }
  });
  // Coming back from the background is not a slow frame.
  document.addEventListener('visibilitychange', () => { last = 0; });
}
