// Shared settings behavior, scoped to the Phaser application.
import { DEFAULT_KEYS, DEFAULT_PAD, input, type Action } from '../../../../remnant/src/core/input';

export interface Settings {
  master: number;
  music: number;
  /** Songs: recorded songs (audio/songs.ts) where they exist, the generated score elsewhere. Score: never songs. */
  soundtrack: 'songs' | 'score';
  /** Vocal songs at their places; off plays only instrumentals. */
  vocals: boolean;
  sfx: number;
  /** Share audio with Spotify and other apps instead of requesting exclusive playback. */
  mixAudio: boolean;
  respectSilent: boolean;
  quality: 'auto' | 'high' | 'medium' | 'low';
  fps: 'auto' | '60';
  shake: 'full' | 'reduced' | 'off';
  reduceFlashes: boolean;
  dmgNumbers: boolean;
  zoom: 'close' | 'normal' | 'wide';
  textSize: 'normal' | 'large' | 'xl';
  touchScale: number;
  touchOpacity: number;
  leftHanded: boolean;
  /**
   * Touch controls the player has moved or resized: centre as a fraction of the
   * screen (laid out right-handed; left-handed mirrors it) and a size factor.
   * Anything absent keeps its default place.
   */
  touchLayout?: Record<string, TouchSpot>;
  haptics: boolean;
  /** Golden objective marker and edge arrow. */
  guide: boolean;
  /** Words under the touch buttons. */
  buttonLabels: boolean;
  /** Game status drawn around the Dynamic Island. */
  island: boolean;
  /** The island's length: auto, the iPhone 18 Pro's smaller island, the iPhone 14-17 Pro's, or a measured length. */
  islandSize?: 'auto' | 'compact' | 'classic' | 'custom';
  /** Measured island length in CSS px (islandSize 'custom'). */
  islandLen?: number;
  showFps: boolean;
  /** Settings format, for one-time migrations. */
  v: number;
  keys: Record<Action, string[]>;
  /** Controller buttons the player has moved; anything absent keeps its default. */
  pad: Partial<Record<Action, number[]>>;
  /** Controller rumble on big moments. */
  rumble: boolean;
  /** The name put on the Trial leaderboard. */
  name: string;
  /** How hard the bosses fight (game/difficulty.ts). */
  bossDifficulty: 'normal' | 'hard' | 'merciless';
  /** First-time coaching cards (ui/coach.ts); absent means on. */
  coach?: boolean;
  /** Pixel: the world is drawn at one pixel per world unit and scaled up crisply. */
  artStyle: 'pixel' | 'smooth';
}

export interface TouchSpot { x: number; y: number; s?: number }

export const isTouchDevice = () =>
  'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);

export const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Default touch button size and opacity (the layout editor resets to these). */
export const TOUCH_DEFAULTS = { touchScale: 1, touchOpacity: 0.55 } as const;

const DEFAULTS: Settings = {
  master: 0.85,
  music: 0.6,
  soundtrack: 'songs',
  vocals: true,
  sfx: 0.85,
  mixAudio: true,
  respectSilent: false,
  quality: 'auto',
  fps: isTouchDevice() ? '60' : 'auto',
  shake: 'full',
  reduceFlashes: false,
  dmgNumbers: true,
  zoom: 'normal',
  textSize: 'normal',
  touchScale: TOUCH_DEFAULTS.touchScale,
  touchOpacity: TOUCH_DEFAULTS.touchOpacity,
  leftHanded: false,
  touchLayout: {},
  haptics: true,
  guide: true,
  buttonLabels: false,
  island: true,
  islandSize: 'auto',
  islandLen: 96,
  showFps: false,
  v: 4,
  keys: structuredClone(DEFAULT_KEYS),
  pad: {},
  rumble: true,
  name: 'Elior',
  bossDifficulty: 'hard',
  artStyle: 'pixel',
};

const KEY = 'remnant-phaser.settings.v1';

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, val: string): boolean {
    try {
      localStorage.setItem(key, val);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

function load(): Settings {
  const raw = store.get(KEY);
  const s: Settings = structuredClone(DEFAULTS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      Object.assign(s, parsed);
      s.keys = { ...structuredClone(DEFAULT_KEYS), ...(parsed.keys ?? {}) };
      // v2 lowered the default button opacity; carry the old default down too.
      if (!parsed.v) {
        if (parsed.touchOpacity === 0.75) s.touchOpacity = DEFAULTS.touchOpacity;
        s.v = 2;
      }
      // Prefer a steady 60 on iOS; this runs once and keeps later choices.
      if ((parsed.v ?? 1) < 3) {
        if (isIOS()) s.fps = '60';
        s.v = 3;
        store.set(KEY, JSON.stringify(s));
      }
      // Older saves requested exclusive playback by default. Opt them into mixing
      // without changing their volume sliders, bindings, or silent-switch choice.
      if (typeof parsed.mixAudio !== 'boolean') s.mixAudio = true;
      s.touchLayout = cleanTouchLayout(parsed.touchLayout);
      if ((parsed.v ?? 1) < 4) {
        s.v = 4;
        store.set(KEY, JSON.stringify(s));
      }
    } catch {
      /* corrupt settings — use defaults */
    }
  }
  return s;
}

/** Keep only well-formed layout entries, so a damaged value never strands a button off-screen. */
function cleanTouchLayout(v: unknown): Record<string, TouchSpot> {
  const out: Record<string, TouchSpot> = {};
  if (!v || typeof v !== 'object') return out;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  for (const [k, e] of Object.entries(v as Record<string, Partial<TouchSpot>>)) {
    if (!e || !ok(e.x) || !ok(e.y)) continue;
    out[k] = { x: Math.min(1, Math.max(0, e.x)), y: Math.min(1, Math.max(0, e.y)) };
    if (ok(e.s)) out[k].s = Math.min(1.8, Math.max(0.6, e.s));
  }
  return out;
}

export const settings: Settings = load();
input.keys = settings.keys;
applyPad();

/** Push controller bindings and rumble into the input layer. */
export function applyPad() {
  input.padMap = { ...structuredClone(DEFAULT_PAD), ...structuredClone(settings.pad ?? {}) };
  input.rumbleOn = settings.rumble;
}

const subs: (() => void)[] = [];
export function onSettingsChange(cb: () => void) {
  subs.push(cb);
}
export function saveSettings() {
  applyPad();
  store.set(KEY, JSON.stringify(settings));
  for (const cb of subs) cb();
}
export function resetSettings() {
  const keys = structuredClone(DEFAULT_KEYS);
  Object.assign(settings, structuredClone(DEFAULTS), { keys });
  input.keys = settings.keys;
  applyPad();
  saveSettings();
}

export const shakeScale = () => (settings.shake === 'full' ? 1 : settings.shake === 'reduced' ? 0.4 : 0);
