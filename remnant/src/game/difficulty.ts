// Boss difficulty. Hard is the default: bosses have more health, hit harder
// and move a little faster. Normal is the original balance; Merciless is for
// players who have outgrown Hard. Read when a boss is built (HP, damage) and
// every step (tempo), so a change applies from the next boss room.

import { settings } from '../core/settings';

export type BossDifficulty = 'normal' | 'hard' | 'merciless';

const SCALE: Record<BossDifficulty, { hp: number; dmg: number; tempo: number }> = {
  normal: { hp: 1, dmg: 1, tempo: 1 },
  hard: { hp: 1.3, dmg: 1.25, tempo: 1.1 },
  merciless: { hp: 1.7, dmg: 1.5, tempo: 1.2 },
};

export function bossScale() {
  return SCALE[settings.bossDifficulty] ?? SCALE.hard;
}
