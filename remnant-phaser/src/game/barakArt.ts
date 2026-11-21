// Barak's sheet (art C17, src/assets/barak-actions.png): eight full-body poses in 192 px cells, feet at (96, 120) like
// the fighter atlases. The journey (game/player.ts) and the Horde (game/horde/hero.ts) both pick a pose by clip here.

/** The pose for a clip at `progress` (0–1): idle, two strides, the jump, the dash, the jab, the arc, the brace. */
export function barakFrame(clip: string, progress: number) {
  switch (clip) {
    case 'run': case 'swim': return progress < 0.5 ? 1 : 2;
    case 'jump': case 'fall': return 3;
    case 'roll': case 'airdash': case 'dash': return 4;
    case 'jab': case 'b1': case 'b2': return 5;
    case 'arc': case 'cast': case 'invoke': case 'b3': case 'storm': case 'bowRelease': return 6;
    case 'death': case 'hurt': case 'land': case 'block': case 'parry': return 7;
    default: return 0;
  }
}
