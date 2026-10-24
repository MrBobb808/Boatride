// Stand-in for remnant/src/core/settings.ts: the original modules read a few
// settings; the Phaser build's settings come with the menus port.

export const settings = {
  dmgNumbers: true,
  reduceFlashes: false,
  shake: 'full' as 'full' | 'reduced' | 'off',
  bossDifficulty: 'hard' as 'normal' | 'hard' | 'merciless',
  artStyle: 'pixel' as 'pixel' | 'smooth',
  guide: true,
  quality: 'auto',
};
export const shakeScale = () => (settings.shake === 'full' ? 1 : settings.shake === 'reduced' ? 0.4 : 0);
export const isTouchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent);
export const isStandalone = () => false;
export function onSettingsChange(_cb: () => void) {}
export function saveSettings() {}
