// Foes answer the hero's might. Each chapter is tuned for the levels a straight-through player has in it (from its
// arrival level, game/curve.ts, to the next chapter's); a hero far past them would otherwise cut through the chapter's
// foes and bosses in a blow or two. Past the level a player leaves the chapter with (never in the Trial), a foe's health
// follows a balanced build's blow and its damage that build's toughness, a little behind both (×0.9 in log), so
// every level still helps without leaving the fights behind.
import { G } from './ctx';
import { chapterCurve } from './curve';
import { sovereignDamage, softGrowth } from './balance';
import { chapterForRoom } from './fallenChapters';
import { CH2_ROOM_IDS } from './rooms2';
import { CH3_ROOM_IDS } from './rooms3';
import { CH4_ROOM_IDS } from './rooms4';
import { CH5_ROOM_IDS } from './rooms5';
import { CH6_ROOM_IDS } from './rooms6';

/** The chapter a room belongs to (its foes' tier). */
export function roomChapter(rid: string) {
  return chapterForRoom(rid)?.n ?? (CH6_ROOM_IDS.has(rid) ? 6 : CH5_ROOM_IDS.has(rid) ? 5 : CH4_ROOM_IDS.has(rid) ? 4 : CH3_ROOM_IDS.has(rid) ? 3 : CH2_ROOM_IDS.has(rid) ? 2 : 1);
}

/**
 * A balanced build at a level (every stat point spread evenly, a weapon that keeps pace with the chapters: 10 at
 * level 1, 118 at 28, 270 at 68): its blow and its toughness, by derive's own formulas (game/state.ts).
 */
export function balancedMight(level: number) {
  const L = Math.max(1, level), lv = L - 1, per = Math.floor(lv / 2), st = 5 + per;
  const weapon = 10 + 3.8 * lv;
  const blow = (weapon * (1 + softGrowth(lv, 99, 0.35) * 0.03) + per * 1.5) * (1 + softGrowth(st, 60, 0.35) * 0.05) * sovereignDamage(L);
  const hp = (80 + st * 12 + per * 12 + per * 8 + lv * 10) * (1 + per * 0.0075);
  return { blow, toughness: hp * (1 + st * 0.025) };
}

/** The level a straight-through player leaves a chapter with: the next one's arrival (the last chapter, six more). */
export const leaveLevel = (chapter: number) => Math.max(chapterCurve(chapter + 1).level, chapterCurve(chapter).level + 6);
/** Health and damage multipliers for foes tuned for a hero of level `from`, against one of `level`; 1 up to `from`. */
export function outmatch(level: number, from: number) {
  if (level <= from) return { hp: 1, dmg: 1 };
  const a = balancedMight(from), h = balancedMight(level);
  return { hp: Math.max(1, Math.pow(h.blow / a.blow, 0.9)), dmg: Math.max(1, Math.pow(h.toughness / a.toughness, 0.9)) };
}

/** The level foes answer to: the hero in play (the Phaser build points this at Tirzah's level while she fights). */
let heroLevel = (): number => G.save?.level ?? 1;
export function setMightLevel(f: () => number) { heroLevel = f; }

/** The multipliers for the room the hero is in (or a given chapter's foes). */
export function might(chapter?: number) {
  const rid = G.world?.room?.id ?? '';
  // Survival belongs to the wave, not the level (game/balance.ts): the Trial's foes grow with its rounds, and the
  // challenger picks how deep to go.
  const rounds = (G.world as unknown as { story?: { ch3?: { rounds?: { active?: boolean } } } } | undefined)?.story?.ch3?.rounds;
  if (chapter === undefined && (rid === 'trial_arena' || rounds?.active)) return { hp: 1, dmg: 1 };
  return outmatch(heroLevel(), leaveLevel(chapter ?? roomChapter(rid)));
}
