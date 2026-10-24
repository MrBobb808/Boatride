// Phaser settings have their own key; audio and the shared actors read these
// through the classic-shims resolver without changing the original game's settings.

export const settings = {
  master: 0.85, music: 0.6, sfx: 0.85,
  soundtrack: 'songs' as 'songs' | 'score', vocals: true,
  mixAudio: true, respectSilent: false,
  dmgNumbers: true,
  reduceFlashes: false,
  shake: 'full' as 'full' | 'reduced' | 'off',
  bossDifficulty: 'hard' as 'normal' | 'hard' | 'merciless',
  artStyle: 'pixel' as 'pixel' | 'smooth',
  guide: true,
  quality: 'auto',
};
const KEY = 'remnant-phaser.settings.v1';
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  for (const key of ['master', 'music', 'sfx'] as const) if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) settings[key] = Math.max(0, Math.min(1, saved[key]));
  for (const key of ['vocals', 'mixAudio', 'respectSilent', 'reduceFlashes', 'dmgNumbers'] as const) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
  if (saved.soundtrack === 'songs' || saved.soundtrack === 'score') settings.soundtrack = saved.soundtrack;
  if (['normal', 'hard', 'merciless'].includes(saved.bossDifficulty)) settings.bossDifficulty = saved.bossDifficulty;
  if (['full', 'reduced', 'off'].includes(saved.shake)) settings.shake = saved.shake;
} catch { /* Storage may be unavailable. */ }
export const shakeScale = () => (settings.shake === 'full' ? 1 : settings.shake === 'reduced' ? 0.4 : 0);
export const isTouchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const listeners: (() => void)[] = [];
export function onSettingsChange(cb: () => void) { listeners.push(cb); }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Session settings still work. */ }
  for (const cb of listeners) cb();
}
