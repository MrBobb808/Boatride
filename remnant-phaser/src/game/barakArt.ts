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

/**
 * A pose from all of Barak's sheets: his eight (C17) or the Beast's (C18) for moving, and for a move the row of four
 * frames on his move sheet (C19) or the Beast's (C21): 0 Spark Jab, 1 Chain Lightning, 2 guard, 3 Flash Step,
 * 4 Piercing Current, 5 Thunderclap, 6 Forked Spear, 7 Skybreaker. `u` runs 0–1 through the move.
 */
export const BARAK_ROWS: Record<string, number> = { jab: 0, b1: 0, b2: 0, arc: 1, cast: 1, b3: 1, bowRelease: 1, guard: 2, roll: 3, dash: 3, airdash: 3, rush: 4, clap: 5, spear: 6, sky: 7, invoke: 7, storm: 7 };
export function barakPose(clip: string, u: number, beast: boolean): { key: string; frame: number } {
  // The shift into the Beast (C23): four frames, crouch to full height.
  if (clip === 'shift') return { key: 'barak-shift', frame: Math.min(3, Math.max(0, Math.floor(u * 4))) };
  const row = BARAK_ROWS[clip];
  if (row === undefined) return { key: beast ? 'barak-beast' : 'barak', frame: barakFrame(clip, u) };
  return { key: beast ? 'barak-beast-moves' : 'barak-moves', frame: row * 4 + Math.min(3, Math.max(0, Math.floor(u * 4))) };
}
