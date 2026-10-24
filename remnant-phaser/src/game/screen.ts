/** Device pixels per CSS pixel (capped: 3× is plenty and keeps the fill rate sane). */
export const dpr = () => Math.min(3, window.devicePixelRatio || 1);
