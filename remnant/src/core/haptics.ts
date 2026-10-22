// Phone haptics: a short tap on button presses and a distinct pattern for each
// kind of fight moment, so a hit, a parry, a wound, a kill and a boss's new
// phase can be told apart by feel alone.
// Android and other browsers play the pattern through navigator.vibrate. iOS
// Safari has no vibrate; from iOS 18 toggling a native switch control gives a
// system tick, so there each "on" segment of the pattern becomes one tick and
// the patterns differ by count and rhythm instead of strength.

import { settings, isIOS } from './settings';
import { input } from './input';

export type HapticKind = 'select' | 'light' | 'heavy' | 'hit' | 'parry' | 'hurt' | 'kill' | 'phase';

/** Vibration patterns in ms, on/off alternating. Gaps stay >= 50 ms so iOS ticks do not merge. */
export const HAPTIC_PATTERNS: Record<HapticKind, readonly number[]> = {
  select: [6],
  light: [10],
  heavy: [24],
  hit: [9],
  parry: [12, 50, 12],
  hurt: [30, 50, 30, 50, 30],
  kill: [18, 110, 45],
  phase: [50, 80, 50, 80, 50, 80, 120],
};

/** A stronger moment may cut a weaker pattern short, never the other way round. */
const PRIO: Record<HapticKind, number> = { select: 0, light: 0, hit: 1, heavy: 2, hurt: 3, parry: 3, kill: 4, phase: 5 };
/** Fight moments only buzz the phone while it is being played by touch (a pad gets rumble). */
const COMBAT: Record<HapticKind, boolean> = { select: false, light: false, heavy: false, hit: true, parry: true, hurt: true, kill: true, phase: true };

let iosLabel: HTMLLabelElement | null = null;
let busyUntil = 0;
let busyPrio = -1;
// iOS ticks: the wait before each one, in fixed slots so a pattern allocates nothing.
const wait = new Float64Array(8);
let dueN = 0, dueI = 0, timer = 0;

/** Create the hidden iOS switch once; a click on its label makes the tick. */
export function initHaptics() {
  if (iosLabel || !isIOS()) return;
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.setAttribute('switch', '');
  inp.id = 'haptic-switch';
  inp.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none;';
  const lab = document.createElement('label');
  lab.htmlFor = 'haptic-switch';
  lab.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none;';
  document.body.appendChild(inp);
  document.body.appendChild(lab);
  iosLabel = lab;
}

function tick() {
  try {
    iosLabel?.click();
  } catch {
    /* unsupported */
  }
}

// Each tick waits from the one before, so a late timer never squeezes two ticks into one.
function pump() {
  timer = 0;
  tick();
  if (++dueI < dueN) timer = window.setTimeout(pump, wait[dueI]);
}

export function haptic(kind: HapticKind = 'light') {
  if (!settings.haptics) return;
  if (COMBAT[kind] && input.lastDevice !== 'touch') return;
  const now = performance.now();
  const pr = PRIO[kind];
  // Rapid cuts do not stack into one long buzz, and taps never break a pattern.
  if (now < busyUntil && (pr < busyPrio || (pr === busyPrio && pr <= 1))) return;
  const pat = HAPTIC_PATTERNS[kind];
  let total = 0;
  for (const ms of pat) total += ms;
  busyUntil = now + total + (kind === 'hit' ? 60 : 30);
  busyPrio = pr;
  try {
    if (iosLabel) {
      if (timer) clearTimeout(timer);
      dueN = dueI = 0;
      for (let i = 0; i < pat.length && dueN < wait.length; i += 2) wait[dueN++] = i ? pat[i - 2] + pat[i - 1] : 0;
      pump();
    } else if (navigator.vibrate) navigator.vibrate(pat as number[]);
  } catch {
    /* unsupported */
  }
}
