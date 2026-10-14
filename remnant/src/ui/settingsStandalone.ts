import { openMenu } from './menus';

/** Settings opened from the title screen, before any save is loaded. */
export function openSettingsStandalone() {
  openMenu('settings', true);
}
