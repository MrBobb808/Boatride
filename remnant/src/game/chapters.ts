import { FALLEN_CHAPTERS } from './fallenChapters';
import { chapterCurve } from './curve';
// The chapters, for chapter select, and the training grounds (the Trial of
// the Remnant entered from the menu). Travelling to a chapter you have
// reached puts you at its hub altar; a chapter you have unlocked but not yet
// begun starts with its opening.

import { G, flag } from './ctx';
import { ROOMS } from './rooms';
import { bestRounds } from './board';
import { ECHO_SPECIES } from './data';
import { isContract, type ContractId } from './progression';
import { rushRoster } from './gauntlet';

export interface ChapterDef {
  n: number;
  roman: string;
  title: string;
  blurb: string;
  /** The chapter's camp, and the spawn used once the chapter has begun. */
  hub: string;
  /** Recommended level. */
  level: number;
  reached: () => boolean;
  done: () => boolean;
}

export const CHAPTERS: ChapterDef[] = [
  {
    n: 1, roman: 'I', title: 'The Ashen Village', hub: 'sanctuary', level: chapterCurve(1).level,
    blurb: 'Hearthward, the ash road and the Temple of the First Lamp, where the Gilded Idol waits.',
    reached: () => true, done: () => flag('ending_done'),
  },
  {
    n: 2, roman: 'II', title: 'The Tower of Shinar', hub: 'shinar_camp', level: chapterCurve(2).level,
    blurb: 'Down to the plain of Shinar and up the tower, past the Gatekeeper to the Crimson Marshal.',
    reached: () => flag('ch2_intro'), done: () => flag('ch2_done'),
  },
  {
    n: 3, roman: 'III', title: 'The Valley of Bones', hub: 'valley_camp', level: chapterCurve(3).level,
    blurb: 'Ezekiel\'s valley, stripped bare by a swarm. Its king waits to be born in the hive.',
    reached: () => flag('ch3_intro'), done: () => flag('ch3_done'),
  },
  {
    n: 4, roman: 'IV', title: 'The Plain of Dura', hub: 'river_camp', level: chapterCurve(4).level,
    blurb: 'By the rivers of Babylon an image of gold demands every knee, and three captives are bound for the furnace.',
    reached: () => flag('ch4_intro'), done: () => flag('ch4_done'),
  },
  {
    n: 5, roman: 'V', title: 'The Writing on the Wall', hub: 'reed_camp', level: chapterCurve(5).level,
    blurb: 'The river is turned aside and Babylon feasts on holy vessels. A hand writes on the palace wall.',
    reached: () => flag('ch5_intro'), done: () => flag('ch5_done'),
  },
  {
    n: 6, roman: 'VI', title: 'The Prince of Persia', hub: 'hiddekel_camp', level: chapterCurve(6).level,
    blurb: 'By the great river an old man fasts for an answer that is held back. Above Shushan, fallen princes rule the air.',
    reached: () => flag('ch6_intro'), done: () => flag('ch6_done'),
  },
  ...FALLEN_CHAPTERS.map(c => ({n:c.n,roman:c.roman,title:c.title,hub:c.hub,level:chapterCurve(c.n).level,blurb:c.intro[1],reached:()=>flag(`ch${c.n}_intro`),done:()=>flag(`ch${c.n}_done`)})),
];

/** A chapter can be played once you have reached it or finished the one before. */
export function chapterOpen(c: ChapterDef) {
  if (c.reached()) return true;
  const prev = CHAPTERS[c.n - 2];
  return !!prev && prev.done();
}

/** Go to a chapter: its hub altar if begun, otherwise its opening. */
export function travelToChapter(c: ChapterDef) {
  if (!chapterOpen(c)) return;
  const s = G.save;
  if (c.reached()) {
    const altar = ROOMS[c.hub]?.spawns.altar ? 'altar' : 'start';
    s.altar = { room: c.hub, spawn: altar };
    G.world.transition(c.hub, altar);
  } else {
    G.world.transition(c.hub, 'start');
  }
}

/** The next chapter waiting to be begun, if any (for "Journey on" at altars). */
export function nextChapter(): ChapterDef | null {
  for (const c of CHAPTERS) if (!c.reached() && chapterOpen(c)) return c;
  return null;
}

// ---------------------------------------------------------------- training

/** Practice can be recovered from a journey's trophies or this device's ranked runs. */
export function trainingBest(bossOnly = false) {
  const values = [Number(G.save.flags[bossOnly ? 'boss_trial_best' : 'trial_best'] ?? 0), bestRounds(bossOnly)];
  if (!bossOnly) values.push(...(G.save.trialMilestones ?? []));
  return Math.floor(Math.max(0, ...values.filter((n) => Number.isFinite(n) && n >= 0)));
}
export const trainingOpen = () => flag('relic_taken') || trainingBest() > 0 || trainingBest(true) > 0;

/** Earlier milestones plus the exact highest available round; all skips are unranked. */
export function trainingStarts(bossOnly = false): number[] {
  const best = trainingBest(bossOnly);
  return [...new Set([1, ...[10, 20, 30, 40, 50, 75, 100].filter((w) => best >= w), ...(best > 1 ? [best] : [])])].sort((a, b) => a - b);
}

/** Enter the Trial from anywhere; leaving it returns you to this spot. */
export function startTraining(fromWave = 1, bossOnly = false, original?: string, contract?: ContractId) {
  const W = G.world;
  const s = G.save;
  s.flags.echo_trial_species = original && ECHO_SPECIES[original] && s.echoes.some((e) => e.species === original) ? original : '';
  s.flags.trial_contract = !bossOnly && isContract(contract) ? contract : '';
  markReturn();
  s.flags.trial_from = fromWave;
  s.flags.trial_mode = bossOnly ? 'boss' : 'survival';
  W.transition('trial_arena', 'start');
}

/** Leave a run in progress, and remember where to come back to from the arena. */
function markReturn() {
  const W = G.world;
  if (W.room.id === 'trial_arena' && W.story.ch3.rounds.active) W.story.ch3.rounds.stop();
  if (W.room.id === 'trial_arena') return;
  // Come back through the nearest named spawn of the room you left.
  const p = W.player;
  let best = 'start', bd = Infinity;
  for (const [name, sp] of Object.entries(W.room.spawns)) {
    const d = Math.abs(sp.x * 16 - p.x) + Math.abs(sp.y * 16 - p.y);
    if (d < bd) { bd = d; best = name; }
  }
  G.save.flags.trial_return = `${W.room.id}|${best}`;
}

// ---------------------------------------------------------------- the Boss Rush

/** Bosses needed before the rush opens: one boss is just a rematch. */
export const RUSH_MIN = 2;
export const rushCount = () => rushRoster(G.save.defeated).length;
export const rushOpen = () => rushCount() >= RUSH_MIN;

/** Every beaten boss back to back in the arena; leaving returns you to this spot. */
export function startBossRush() {
  if (!rushOpen()) return;
  markReturn();
  G.save.flags.trial_from = 1;
  G.save.flags.trial_mode = 'rush';
  G.world.transition('trial_arena', 'start');
}
