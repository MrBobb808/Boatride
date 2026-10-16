// The chapters, for chapter select, and the training grounds (the Trial of
// the Remnant entered from the menu). Travelling to a chapter you have
// reached puts you at its hub altar; a chapter you have unlocked but not yet
// begun starts with its opening.

import { G, flag } from './ctx';
import { ROOMS } from './rooms';

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
    n: 1, roman: 'I', title: 'The Ashen Village', hub: 'sanctuary', level: 1,
    blurb: 'Hearthward, the ash road and the Temple of the First Lamp, where the Gilded Idol waits.',
    reached: () => true, done: () => flag('ending_done'),
  },
  {
    n: 2, roman: 'II', title: 'The Tower of Shinar', hub: 'shinar_camp', level: 12,
    blurb: 'Down to the plain of Shinar and up the tower, past the Gatekeeper to the Crimson Marshal.',
    reached: () => flag('ch2_intro'), done: () => flag('ch2_done'),
  },
  {
    n: 3, roman: 'III', title: 'The Valley of Bones', hub: 'valley_camp', level: 22,
    blurb: 'Ezekiel\'s valley, stripped bare by a swarm. Its king waits to be born in the hive.',
    reached: () => flag('ch3_intro'), done: () => flag('ch3_done'),
  },
  {
    n: 4, roman: 'IV', title: 'The Plain of Dura', hub: 'river_camp', level: 32,
    blurb: 'By the rivers of Babylon an image of gold demands every knee, and three captives are bound for the furnace.',
    reached: () => flag('ch4_intro'), done: () => flag('ch4_done'),
  },
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

export const trainingOpen = () => flag('relic_taken');

/** Wave choices: from the start, or skip ahead to within reach of your best. */
export function trainingStarts(): number[] {
  const best = Number(G.save.flags.trial_best ?? 0);
  const out = [1];
  for (const w of [10, 20, 30, 40, 50, 75, 100]) if (best >= w) out.push(w);
  return out;
}

/** Enter the Trial from anywhere; leaving it returns you to this spot. */
export function startTraining(fromWave = 1) {
  const W = G.world;
  const s = G.save;
  if (W.room.id !== 'trial_arena') {
    // Come back through the nearest named spawn of the room you left.
    const p = W.player;
    let best = 'start', bd = Infinity;
    for (const [name, sp] of Object.entries(W.room.spawns)) {
      const d = Math.abs(sp.x * 16 - p.x) + Math.abs(sp.y * 16 - p.y);
      if (d < bd) { bd = d; best = name; }
    }
    s.flags.trial_return = `${W.room.id}|${best}`;
  }
  s.flags.trial_from = fromWave;
  W.transition('trial_arena', 'start');
}
