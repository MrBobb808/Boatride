// The writing on the banquet-hall wall. The story moves it during the
// cutscene; the plaster_wall decor (render/env5.ts) draws it. p runs 0..1
// across the four words; once flag ch5_writing is set it stays fully written.

export const WRITING = {
  /** How much of MENE, MENE, TEKEL, UPHARSIN is written (0..1). */
  p: 0,
  /** Whether the hand of light is at the wall right now. */
  hand: false,
};
