// The difficulty curve, in one table. Each chapter names the level a player
// reaches by playing straight through (every room's foes, the bosses and the
// main quests, no grinding), and the foe, XP and Fallen Crown boss numbers are
// tuned so that player is never walled on the default Hard boss difficulty.
// Challenge beyond that lives in Settings → Challenge (Merciless), the Trial
// and New Game+, not in a level gate. `scripts/curve-onboarding.mjs` replays a
// straight-through run against this table and fights the VII–X bosses on Hard
// at these levels.
//
// Measured before this table (straight through, Hard): arrival levels
// I 1 · II 7 · III 13 · IV 17 · V 22 · VI 28 · VII 34 · VIII 37 · IX 41, while
// VII–IX asked for 80 / 100 / 120 and their bosses held 650k–1.02M health
// (about 850–1000 blows at the arrival level, against ~200 for Chapter VI).

export interface ChapterCurve {
  /** Level on arriving, playing straight through. Chapter select shows it; catch-up XP aims for it. */
  level: number;
  /** Foe health and damage multipliers for the chapter's rooms. */
  foeHp: number;
  foeDmg: number;
  /** Kill XP multiplier for the chapter's foes. */
  xp: number;
  /** Chapter-end XP for the Fallen Crown campaigns. */
  clearXp?: number;
  /** Fallen Crown boss base health and blow, before boss difficulty and NG+. Never the player's level. */
  bossHp?: number;
  bossDmg?: number;
}

/** Index = chapter number (0 is unused). */
export const CURVE: readonly ChapterCurve[] = [
  { level: 1, foeHp: 1, foeDmg: 1, xp: 1 },
  { level: 1, foeHp: 1, foeDmg: 1, xp: 1 }, // I · the Gilded Idol
  { level: 7, foeHp: 1.8, foeDmg: 1.4, xp: 1.7 }, // II · Gatekeeper, Crimson Marshal
  { level: 12, foeHp: 3.0, foeDmg: 1.9, xp: 2.6 }, // III · Locust King
  { level: 17, foeHp: 4.4, foeDmg: 2.4, xp: 3.6 }, // IV · Image of Gold
  { level: 22, foeHp: 6.2, foeDmg: 2.9, xp: 4.8 }, // V · the Weigher
  { level: 28, foeHp: 8.4, foeDmg: 3.4, xp: 6.0 }, // VI · Storm Prince, Prince of Persia (~200 blows on Hard)
  // The Fallen Crowns: bosses sized to ~200–230 average blows of a balanced
  // build at the arrival level on Hard, and ~6 heavy blows to fell Elior.
  { level: 34, foeHp: 10.5, foeDmg: 3.9, xp: 7.4, clearXp: 22000, bossHp: 96000, bossDmg: 210 }, // VII · Varkhos
  { level: 40, foeHp: 13, foeDmg: 4.4, xp: 9.0, clearXp: 29000, bossHp: 120000, bossDmg: 230 }, // VIII · Morvane
  { level: 46, foeHp: 15.5, foeDmg: 4.9, xp: 10.8, clearXp: 32000, bossHp: 150000, bossDmg: 290 }, // IX · Azkar
  { level: 52, foeHp: 18, foeDmg: 5.4, xp: 12.6, clearXp: 34000, bossHp: 180000, bossDmg: 330 }, // X · the Prince of Grecia
];

/** A chapter's row; a chapter past the end of the table takes the last one. */
export function chapterCurve(n: number): ChapterCurve {
  return CURVE[Math.min(CURVE.length - 1, Math.max(1, Math.floor(n) || 1))];
}

/**
 * Catch-up XP: below a chapter's arrival level, experience comes faster
 * (+25% per level behind, up to ×3), so a player who skipped side rooms is
 * back on the curve within the chapter. At or above it there is no bonus.
 */
export function catchUpXp(level: number, chapter: number) {
  const behind = chapterCurve(chapter).level - level;
  return behind > 0 ? 1 + Math.min(2, behind * 0.25) : 1;
}
