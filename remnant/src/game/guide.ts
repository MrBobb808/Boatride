// The guide: where the current objective is, and which way to walk to get
// there. Each main-quest stage names a target (a room, and a spot in it);
// a breadth-first search over room exits picks the doorway to head for.
// The world draws a golden marker on it, the HUD an arrow at the screen
// edge when it is out of view, and the map a star on the target room.

import { G, flag } from './ctx';
import { ROOMS } from './rooms';
import { TILE } from './tiles';

export interface GuideTarget {
  room: string;
  /** World position in pixels (feet level). */
  x: number;
  y: number;
  /** What the marker leads to, for hints. */
  label: string;
}

interface Spec {
  room: string;
  /** An entity in the room: 'trigger:id', 'altar:id', 'shrine:grants', 'boss:k', 'npc:k', or 'tile:S' (first such tile). */
  at?: string;
  label: string;
}

/** The objective for the current main-quest stage, in story order. */
function currentSpec(): Spec | null {
  const s = G.save;
  const q = (id: string) => s.quests[id];
  const open = (id: string) => q(id) && !q(id).done;
  // Chapter III and later register their own stages.
  for (const f of extraSpecs) {
    const r = f();
    if (r) return r;
  }
  if (open('m_tower')) {
    const st = q('m_tower').stage;
    if (st <= 1 && !s.defeated.includes('kiln_overseer')) return { room: 'kiln_yard', at: 'trigger:overseer', label: 'the Overseer\'s yard beyond the brickworks' };
    if (st <= 2 && !s.defeated.includes('gatekeeper')) return { room: 'tower_gate', at: 'trigger:gatekeeper_start', label: 'the Tower Gate' };
    if (!flag('guard_cleared')) return { room: 'tower_upper', at: 'trigger:guard_wave', label: 'the upper floor of the tower' };
    if (!s.defeated.includes('marshal')) return { room: 'marshal_throne', at: 'trigger:marshal_start', label: 'the Marshal\'s hall at the top of the tower' };
    return null;
  }
  if (open('m_expedition')) return { room: 'temple_steps', at: 'trigger:steps_cutscene', label: 'the Temple of the First Lamp, east along the road' };
  if (open('m_dark')) {
    const st = q('m_dark').stage;
    if (st === 0) return { room: 'covenant_chamber', at: 'trigger:relic', label: 'the golden light east of the nave' };
    if (st === 1) return { room: 'crypt', at: 'shrine:plume', label: 'the ossuary below the nave, to the west' };
    if (st === 2) return { room: 'upper_gallery', at: 'shrine:horn', label: 'the high gallery above the nave' };
    if (st === 3) return { room: 'temple_hall', at: 'tile:S', label: 'the golden seal on the nave\'s western wall' };
    return { room: 'idol_sanctum', at: 'trigger:boss_start', label: 'the sanctum beyond the broken seal' };
  }
  if (open('m_return')) return { room: 'sanctuary', at: 'altar:sanctuary', label: 'Hearthward' };
  if (flag('ending_done') && !flag('ch2_intro')) {
    const here = G.world.room;
    const alt = here.ents.find((e) => e.t === 'altar');
    if (alt && alt.t === 'altar') return { room: here.id, at: 'altar:' + alt.id, label: 'an altar: rest and choose Journey east' };
    return { room: 'sanctuary', at: 'altar:sanctuary', label: 'an altar: rest and choose Journey east' };
  }
  return null;
}

const extraSpecs: (() => Spec | null)[] = [];
/** Later chapters add their objectives here (checked first). */
export function registerGuide(f: () => Spec | null) {
  extraSpecs.push(f);
}

function resolve(spec: Spec): GuideTarget | null {
  const r = ROOMS[spec.room];
  if (!r) return null;
  let x = r.w * TILE * 0.5, y = (r.h - 4) * TILE;
  if (spec.at) {
    const [t, id] = spec.at.split(':');
    if (t === 'tile') {
      outer: for (let ty = 0; ty < r.h; ty++) for (let tx = 0; tx < r.w; tx++) if (r.rows[ty][tx] === id) {
        x = (tx + 0.5) * TILE;
        y = (ty + 1) * TILE;
        // Stand on the floor in front of it.
        while (ty < r.h - 1 && r.rows[ty + 1]?.[tx] === id) ty++;
        y = (ty + 1) * TILE;
        break outer;
      }
    } else {
      const e = r.ents.find((en) => en.t === t && ((en as { id?: string }).id === id || (en as { k?: string }).k === id || (en as { grants?: string }).grants === id || (en as { elite?: string }).elite === id));
      if (e && 'x' in e) {
        if (e.t === 'trigger') {
          x = (e.x + e.w / 2) * TILE;
          y = (e.y + e.h) * TILE;
        } else {
          x = e.x * TILE;
          y = (e as { y: number }).y * TILE;
        }
      }
    }
  }
  return { room: spec.room, x, y, label: spec.label };
}

/** The doorway to take from `from` toward `to` (BFS over open exits). */
function nextExit(from: string, to: string) {
  if (from === to) return null;
  const prev = new Map<string, { room: string; exit: (typeof ROOMS)[string]['exits'][number] }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const ex of ROOMS[cur]?.exits ?? []) {
      if (ex.cond && !flag(ex.cond)) continue;
      if (seen.has(ex.to) || !ROOMS[ex.to]) continue;
      seen.add(ex.to);
      prev.set(ex.to, { room: cur, exit: ex });
      if (ex.to === to) {
        // Walk back to the first step.
        let step = to;
        while (prev.get(step)!.room !== from) step = prev.get(step)!.room;
        return prev.get(step)!.exit;
      }
      queue.push(ex.to);
    }
  }
  return null;
}

let cacheKey = '';
let cache: { target: GuideTarget; point: { x: number; y: number }; viaExit: boolean; dir: { x: number; y: number } } | null = null;

/**
 * Where the marker should be in the current room: the objective itself,
 * or the doorway that leads toward it. Null when there is no objective.
 */
export function guidePoint() {
  if (!G.save || !G.world?.room) return null;
  const spec = currentSpec();
  if (!spec) {
    cache = null;
    cacheKey = '';
    return null;
  }
  const here = G.world.room.id;
  const key = `${here}|${spec.room}|${spec.at}|${G.save.flags.gate_open ? 1 : 0}${G.save.flags.shortcut ? 1 : 0}`;
  if (key === cacheKey && cache) return cache;
  cacheKey = key;
  const target = resolve(spec);
  if (!target) return (cache = null);
  if (here === spec.room) {
    cache = { target, point: { x: target.x, y: target.y }, viaExit: false, dir: { x: 0, y: 1 } };
  } else {
    const ex = nextExit(here, spec.room);
    if (!ex) return (cache = null);
    // Aim at the bottom of the doorway, where the player walks through it.
    const r = G.world.room;
    const dir = ex.x <= 1 ? { x: -1, y: 0 } : ex.x + ex.w >= r.w - 1 ? { x: 1, y: 0 } : ex.y <= 1 ? { x: 0, y: -1 } : { x: 0, y: 1 };
    cache = { target, point: { x: (ex.x + ex.w / 2) * TILE, y: (ex.y + ex.h) * TILE }, viaExit: true, dir };
  }
  return cache;
}

/** The room the objective is in (for the map's star). */
export function guideRoom() {
  return currentSpec()?.room ?? null;
}
