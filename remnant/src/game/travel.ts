// Altar fast travel: from any lit altar, walk out at another one you have
// kindled. The list is read from the rooms themselves, so altars added by
// later chapters join it without another table to keep in step.

import { G } from './ctx';
import { ROOMS, chapterOf } from './rooms';
import { CHAPTERS } from './chapters';

export interface AltarStop { id: string; room: string; spawn: string; name: string; chapter: number }
export interface AltarGroup { n: number; roman: string; title: string; stops: AltarStop[] }

/** Names older altars were given; newer ones use their room's name. */
const ALTAR_NAMES: Record<string, string> = {
  sanctuary: 'Hearthward', temple_hall: 'Nave of the First Lamp', chamber: 'Covenant Chamber', antechamber: 'Hall of Offerings',
  shinar_camp: 'Camp at the Pass', tower_lower: 'The First Course', tower_upper: 'The Crimson Guard',
  valley_camp: 'Camp at the Valley\'s Edge', hive_mouth: 'Mouth of the Hive',
  river_camp: 'Camp by the Rivers', dura_plain: 'The Plain of Dura',
  reed_camp: 'Camp in the Reeds', hanging_gardens: 'The Hanging Gardens', palace_stair: 'The Palace Stair',
  hiddekel_camp: 'Camp by the Great River', high_places: 'The High Places',
};

/** Practice rooms are entered from the Chapters tab, never by altar. */
const NO_TRAVEL = /trial|arena|gauntlet/;

let stops: Record<string, AltarStop> | null = null;
/** Every altar in the game, by altar id (built once; rooms never change at runtime). */
export function altarStops() {
  if (stops) return stops;
  stops = {};
  for (const r of Object.values(ROOMS)) {
    if (NO_TRAVEL.test(r.id)) continue;
    for (const e of r.ents) {
      if (e.t !== 'altar') continue;
      // Rooms put their altar spawn on the altar; otherwise use the nearest spawn.
      let spawn = 'altar';
      if (!r.spawns.altar) {
        let bd = Infinity;
        for (const [k, sp] of Object.entries(r.spawns)) {
          const d = Math.abs(sp.x - e.x) + Math.abs(sp.y - e.y);
          if (d < bd) { bd = d; spawn = k; }
        }
      }
      stops[e.id] = { id: e.id, room: r.id, spawn, name: ALTAR_NAMES[e.id] ?? r.name, chapter: chapterOf(r.id) };
    }
  }
  return stops;
}

export const altarName = (id: string) => altarStops()[id]?.name ?? ALTAR_NAMES[id] ?? id;

/** Why travel is not possible right now, or null. Same moments the Chapters tab refuses, plus story locks. */
export function travelBlocked(): string | null {
  const W = G.world;
  if (G.inCutscene || W.transitioning) return 'Not now.';
  if (W.bossActive) return 'Not during a boss fight.';
  if (W.room.id === 'trial_arena' || W.story.ch3.rounds.active) return 'Leave the Trial first.';
  if (W.gateClosed) return 'The way is barred until this fight is done.';
  if (W.rallyT >= 0 || W.player.state === 'dead') return 'Not now.';
  return null;
}

/** Lit altars you can travel to from `here`, grouped by chapter in story order. */
export function travelGroups(here: string): AltarGroup[] {
  const all = altarStops(), s = G.save;
  const groups: AltarGroup[] = [];
  for (const c of CHAPTERS) {
    const list = s.altarsLit.filter((id) => id !== here && all[id]?.chapter === c.n && all[id].room !== G.world.room.id).map((id) => all[id]);
    if (list.length) groups.push({ n: c.n, roman: c.roman, title: c.title, stops: list });
  }
  return groups;
}

/** Walk out at another altar, fading like any doorway. Returns false if refused. */
export function travelTo(id: string) {
  const st = altarStops()[id];
  if (!st || !G.save.altarsLit.includes(id) || travelBlocked()) return false;
  G.save.altar = { room: st.room, spawn: st.spawn };
  void G.world.transition(st.room, st.spawn);
  return true;
}
