/** Device pixels per CSS pixel (capped: 3× is plenty and keeps the fill rate sane). */
export const dpr = () => Math.min(3, window.devicePixelRatio || 1);

/** The height of the screen the page is drawn on (CSS px). An installed iPhone app (status bar black-translucent) can
 * report a window short by the status bar while still drawing from the very top of the screen, which leaves an empty
 * band along the bottom and everything sitting high; there the screen's own height is the truth. Elsewhere (Safari,
 * a desktop, sideways) it is the window's. */
export function appHeight() {
  const h = innerHeight;
  const standalone = (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!standalone || !screen.height) return h;
  const sh = innerHeight >= innerWidth ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  // Only a shortfall the size of a status bar (and home indicator) is that bug; anything larger is a real window.
  return sh > h && sh - h <= 100 ? sh : h;
}
/** Publish it as `--app-h` for the page's fixed layers (index.html, the home screen, the Watch and Horde panels). */
export const applyAppHeight = () => document.documentElement.style.setProperty('--app-h', `${appHeight()}px`);
