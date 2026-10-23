// "Previously…": when a save is resumed after time away, a short card names the
// chapter, where Elior stands and what he was doing, from the quest journal.

import { G, flag } from './ctx';
import { ROOMS } from './rooms';
import { CHAPTERS } from './chapters';
import { QUESTS } from './story';
import { showRecap, type RecapText } from '../ui/cards';

/** Away this long, any resume (a load, or coming back to the app) earns a recap. */
export const RECAP_AWAY_MS = 60 * 60 * 1000;
/** The first resume after the app launches only needs this much time away. */
export const RECAP_LAUNCH_MS = 15 * 60 * 1000;
let launched = false;

/** Build the card's text for the current save; null when there is nothing to recall. */
export function recapText(): RecapText | null {
  const s = G.save;
  if (!s || !flag('intro_done')) return null;
  const room = ROOMS[s.room];
  const region = room?.region ?? '';
  // The chapter whose name the room carries (Shinar's two regions both start "The"), else the furthest reached.
  const ch = CHAPTERS.find((c) => region === c.title || (region && c.title.includes(region.replace(/^The /, ''))))
    ?? [...CHAPTERS].reverse().find((c) => c.reached()) ?? CHAPTERS[0];
  // The newest unfinished main quest is the thread to pick up.
  let objective = '';
  let questTitle = '';
  const ids = Object.keys(s.quests);
  for (let i = ids.length - 1; i >= 0 && !objective; i--) {
    const q = s.quests[ids[i]], def = QUESTS.find((d) => d.id === ids[i]);
    if (!q || q.done || !def || def.kind !== 'main') continue;
    objective = def.stages[Math.min(q.stage, def.stages.length - 1)];
    questTitle = def.title;
  }
  const lines: string[] = [];
  if (room) lines.push(`You rested at ${room.name}${region && region !== ch.title ? `, ${region}` : ''}.`);
  lines.push(objective ? `${questTitle}: ${objective}` : ch.done() ? 'This chapter is complete. Choose Journey on at an altar, or explore what remains.' : ch.blurb);
  return { chapter: `Chapter ${ch.roman}`, title: ch.title, lines };
}

/** Called when a save is resumed. `awayMs` is the time since it was last saved. */
export function maybeRecap(awayMs: number) {
  const first = !launched;
  launched = true;
  if (!(awayMs >= RECAP_AWAY_MS || (first && awayMs >= RECAP_LAUNCH_MS))) return false;
  const r = recapText();
  if (!r) return false;
  // After the room's own entrance (its banner and any opening) has begun.
  setTimeout(() => void showRecap(r), 700);
  return true;
}
