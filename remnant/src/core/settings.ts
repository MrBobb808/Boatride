import { DEFAULT_KEYS, DEFAULT_PAD, input, type Action } from './input';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
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
  haptics: boolean;
  /** Golden objective marker and edge arrow. */
  guide: boolean;
  /** Words under the touch buttons. */
  buttonLabels: boolean;
  /** Game status drawn around the Dynamic Island. */
  island: boolean;
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
}

export const isTouchDevice = () =>
  'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);

export const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const DEFAULTS: Settings = {
  master: 0.85,
  music: 0.6,
  sfx: 0.85,
  respectSilent: false,
  quality: 'auto',
  fps: 'auto',
  shake: 'full',
  reduceFlashes: false,
  dmgNumbers: true,
  zoom: 'normal',
  textSize: 'normal',
  touchScale: 1,
  touchOpacity: 0.55,
  leftHanded: false,
  haptics: true,
  guide: true,
  buttonLabels: false,
  island: true,
  showFps: false,
  v: 2,
  keys: structuredClone(DEFAULT_KEYS),
  pad: {},
  rumble: true,
  name: 'Elior',
};

const KEY = 'remnant-settings-v1';

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
    } catch {
      /* corrupt settings — use defaults */
    }
  }
  return s;
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
