// Measures the safe-area insets (Dynamic Island, home indicator) in CSS px.
// iPhone in landscape reports left/right insets for the island side.

let probe: HTMLDivElement | null = null;
export const safe = { top: 0, right: 0, bottom: 0, left: 0 };

export function measureSafe() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  safe.top = parseFloat(cs.paddingTop) || 0;
  safe.right = parseFloat(cs.paddingRight) || 0;
  safe.bottom = parseFloat(cs.paddingBottom) || 0;
  safe.left = parseFloat(cs.paddingLeft) || 0;
}
