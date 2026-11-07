// Game feel shared by every mode (POLISH_PLAN §19, phase 2; the game-feel and camera-systems skills).
//
// - smoothShake: a camera's shake becomes a decaying "trauma" (0–1). What is drawn is trauma² times a smooth, sampled
//   wave, so it rolls and settles instead of jumping to a fresh random offset every frame (which buzzes, and buzzes
//   twice as fast at 120 Hz). Callers keep Phaser's own `camera.shake(ms, intensity)`: the strength at the start is
//   the same as before, so the main game's steady camera (ordinary hits never shake it, PR #57) is untouched.
// - frameFreeFollow: Phaser blends a following camera by a fixed fraction per frame, so it caught up twice as fast at
//   120 Hz as at 60. The fraction now follows the frame's real time, as the given values did at 60 frames a second.
// - TIERS / impact: one table of how hard each weight of blow lands (shake, a pause on the blow, vibration), so the
//   Watch and the Horde answer the same blow alike.
import Phaser from 'phaser';
import { haptic, type HapticKind } from '../../../remnant/src/core/haptics';
import { shakeScale } from '../classic/shim/settings';

/** The strongest shake, as a share of the view (Phaser's intensity); stronger calls are held to it. */
const MAX = 0.02;

export interface ShakeState { trauma: number; ox: number; oy: number }

/** The shake's path at full strength, `t` seconds in (x and y in −1…1): two waves at unrelated rates (about 6 and 9 a
 * second, slow enough to read as a roll at 60 frames a second), smooth and never repeating in a way the eye catches;
 * both start at their crest so a blow's first frame lands at full strength. */
export const shakeWave = (t: number): [number, number] => [
  (Math.cos(t * 37) + 0.6 * Math.cos(t * 58)) / 1.6,
  (Math.cos(t * 43) + 0.6 * Math.cos(t * 67)) / 1.6,
];

/** Give a scene's camera the trauma shake. Install in `create`; it removes itself when the scene shuts down. */
export function smoothShake(scene: Phaser.Scene, cam: Phaser.Cameras.Scene2D.Camera = scene.cameras.main): ShakeState {
  const st: ShakeState = { trauma: 0, ox: 0, oy: 0 };
  let decay = 0, t = 0;
  // Phaser's shake effect draws its offset in the camera's preRender: ours takes its place there.
  // Its `isRunning` still says whether the view is shaking (the tests and the classic layer read it); its own update,
  // which would draw a fresh random offset each frame, no longer runs.
  const fx = cam.shakeEffect as unknown as { preRender: () => void; update: () => void; isRunning: boolean };
  const view = cam as unknown as { matrix: Phaser.GameObjects.Components.TransformMatrix };
  fx.preRender = () => { if (st.trauma > 0) view.matrix.translate(st.ox, st.oy); };
  fx.update = () => {};
  cam.shake = ((duration = 100, intensity: number | Phaser.Math.Vector2 = 0.05) => {
    const i = Math.min(MAX, typeof intensity === 'number' ? intensity : Math.max(intensity.x, intensity.y));
    if (!(i > 0) || !(duration > 0)) return cam;
    // The start matches the old shake's strength (trauma² × MAX = intensity). A second blow builds on the first a
    // little, never doubling it, so a flurry cannot run away with the view.
    const want = Math.sqrt(i / MAX), was = st.trauma;
    // A fresh shake starts at the top of its wave, so the blow's first frame lands at full strength.
    if (was <= 0) t = 0;
    st.trauma = Math.min(1, Math.max(was, want) + 0.3 * Math.min(was, want));
    // It settles by the latest call's end (or the one already running, if that lasts longer).
    const left = Math.max(duration / 1000, was > 0 && decay > 0 ? was / decay : 0);
    decay = st.trauma / left;
    fx.isRunning = true;
    return cam;
  }) as typeof cam.shake;
  let last = 0;
  const step = () => {
    // Real time between frames (the shake keeps its pace through hit-stops and slow motion, as Phaser's did).
    const now = performance.now(), dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (st.trauma <= 0) return;
    st.trauma = Math.max(0, st.trauma - decay * dt);
    if (st.trauma <= 0) { st.ox = st.oy = 0; fx.isRunning = false; return; }
    const s = st.trauma * st.trauma, w = cam.width * cam.zoom * MAX * s, h = cam.height * cam.zoom * MAX * s;
    const [nx, ny] = shakeWave(t);
    st.ox = Math.round(w * nx);
    st.oy = Math.round(h * ny);
    t += dt;
  };
  scene.events.on('postupdate', step);
  scene.events.once('shutdown', () => scene.events.off('postupdate', step));
  // For the tests (scripts/feel.mjs): the state, and the path it follows.
  Object.assign(cam, { trauma: st, shakeWave });
  return st;
}

/** The share of the way a follower closes in one frame of `dt` seconds, given the share it closed in a 60th. */
export const followLerp = (perFrameAt60: number, dt: number) => 1 - Math.pow(1 - perFrameAt60, dt * 60);

/** Keep a following camera's smoothing the same at any frame rate (the values are what it used at 60 a second). */
export function frameFreeFollow(scene: Phaser.Scene, lerpX: number, lerpY: number, cam: Phaser.Cameras.Scene2D.Camera = scene.cameras.main) {
  let last = 0;
  const step = () => {
    // Real time between frames, as Phaser's per-frame blend had: the camera keeps up through slow motion.
    const now = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    (cam as unknown as { followDt: number }).followDt = dt;
    cam.setLerp(followLerp(lerpX, dt), followLerp(lerpY, dt));
  };
  scene.events.on('postupdate', step);
  scene.events.once('shutdown', () => scene.events.off('postupdate', step));
}

/** How hard each weight of blow lands. `none` keeps the view still (ordinary blows); the pause is the hit-stop. */
export type Tier = 'none' | 'small' | 'medium' | 'large' | 'huge';
export const TIERS: Record<Tier, { shake: number; ms: number; stop: number; haptic: HapticKind | null }> = {
  none: { shake: 0, ms: 0, stop: 0, haptic: null },
  small: { shake: 0.005, ms: 120, stop: 0, haptic: 'hit' },
  medium: { shake: 0.009, ms: 180, stop: 0.05, haptic: 'heavy' },
  large: { shake: 0.014, ms: 240, stop: 0.08, haptic: 'heavy' },
  huge: { shake: 0.02, ms: 300, stop: 0.11, haptic: 'heavy' },
};

/** Land a blow of this weight: the shake (Settings → Screen shake scales it), the pause through `stop`, the vibration. */
export function impact(cam: Phaser.Cameras.Scene2D.Camera, tier: Tier, stop?: (sec: number) => void) {
  const f = TIERS[tier], k = shakeScale();
  if (f.shake && k > 0) cam.shake(f.ms, f.shake * k);
  if (f.stop && stop) stop(f.stop);
  if (f.haptic) haptic(f.haptic);
}
