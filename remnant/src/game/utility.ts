// Utility scoring for the allies' choices (POLISH_PLAN §19 phase 4, G10; the ai-behavior-trees-utility-ai skill).
// Each consideration maps one fact to 0–1 through a response curve. An option's score is the product of its
// considerations, each raised to a weight (0 ignores it; a consideration at 0 vetoes the option), compensated so that
// adding considerations does not drag every score down. The option already chosen gets a small bonus (hysteresis), so
// a near-tie does not flip it back and forth. Pure numbers: nothing here allocates.

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 1 at no distance, falling evenly to 0 at `range`; beyond it, 0 (out of reach is a veto). */
export const within = (d: number, range: number) => (d >= range ? 0 : 1 - d / range);

/** Never below `floor`: a consideration that shades an option without ruling it out. */
export const soft = (v: number, floor: number) => floor + (1 - floor) * clamp01(v);

/** Gives back part of what extra considerations take away (the skill's compensation); a 0 stays a 0. */
export function compensate(product: number, count: number) {
  if (count <= 1) return clamp01(product);
  const make = (1 - product) * (1 - 1 / count);
  return clamp01(product + make * product);
}

/** The bonus for keeping the current choice: a rival has to be this much better to take its place. */
export const STICK = 1.25;

/** A weighted consideration: `v` (0–1) raised to `w` (0 leaves it out, 1 as is, above 1 counts it more). */
export const weigh = (v: number, w: number) => (w === 0 ? 1 : Math.pow(clamp01(v), w));
