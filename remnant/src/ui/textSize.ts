// Settings → Text size, apart from the menus so the first screen can apply it without loading them (NEXT_PLAN A3).
import { settings } from '../core/settings';

export function applyTextSize() {
  document.documentElement.classList.toggle('text-large', settings.textSize === 'large');
  document.documentElement.classList.toggle('text-xl', settings.textSize === 'xl');
  document.documentElement.classList.toggle('text-xxl', settings.textSize === 'xxl');
}
