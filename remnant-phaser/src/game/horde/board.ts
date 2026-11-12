// The Horde between runs (NEXT_PLAN.md D1). Every run leaves embers; embers buy a permanent board of small upgrades,
// sized so a full board is about 40% stronger than none, never several times. From a best stage of 3 a run can be
// made harder for more embers (mutators), and a run can have an end: the Long Night is held when its fifth monarch
// falls. Pure numbers and the save; the scene applies them and draws the camp (scenes/Horde.ts).
import type { PhaserSave } from '../save';

export type BoardId = 'might' | 'vigor' | 'haste' | 'reach' | 'redraw' | 'banish' | 'headstart';
export interface BoardDef { id: BoardId; name: string; per: string; max: number; base: number; step: number }
export const BOARD: BoardDef[] = [
  { id: 'might', name: 'Whetted Edge', per: '+4% damage', max: 5, base: 30, step: 30 },
  { id: 'vigor', name: 'Watchman\'s Bread', per: '+6% health', max: 5, base: 30, step: 30 },
  { id: 'haste', name: 'Ready Hands', per: 'weapons 2% quicker', max: 3, base: 40, step: 40 },
  { id: 'reach', name: 'Gleaner\'s Reach', per: '+10% pickup reach', max: 3, base: 30, step: 30 },
  { id: 'redraw', name: 'Second Thought', per: '+1 redraw each run', max: 2, base: 60, step: 60 },
  { id: 'banish', name: 'Set Aside', per: '+1 banish each run', max: 2, base: 60, step: 60 },
  { id: 'headstart', name: 'Early Watch', per: 'begin a level higher', max: 3, base: 50, step: 40 },
];
const DEF = Object.fromEntries(BOARD.map((b) => [b.id, b])) as Record<BoardId, BoardDef>;

export type MutId = 'iron' | 'legion' | 'frail';
export interface MutDef { id: MutId; name: string; says: string; embers: number }
/** Harder runs, by choice, for more embers. Open from a best stage of 3. */
export const MUTATORS: MutDef[] = [
  { id: 'iron', name: 'Iron Host', says: 'Foes have 35% more health', embers: 0.3 },
  { id: 'legion', name: 'Legion', says: 'They come 40% faster', embers: 0.4 },
  { id: 'frail', name: 'Thin Mail', says: 'You have 30% less health', embers: 0.3 },
];
export const MUT_OPEN = 3;
/** The Long Night: a run with an end. Held when this stage's monarch falls. */
export const NIGHT_STAGES = 5, NIGHT_BONUS = 1.5;
export type HordeMode = 'endless' | 'night';

export interface HordeSave { best: number; runs: number; kills: number; bestKills: number; embers?: number; board?: Partial<Record<BoardId, number>>; muts?: MutId[]; mode?: HordeMode; nights?: number }
export const hordeOf = (s: PhaserSave): HordeSave => (s.horde ??= { best: 0, runs: 0, kills: 0, bestKills: 0 });

export const rank = (h: HordeSave | undefined, id: BoardId) => Math.max(0, Math.min(DEF[id].max, Math.floor(h?.board?.[id] ?? 0)));
export const costOf = (id: BoardId, r: number) => DEF[id].base + DEF[id].step * r;
export function buy(h: HordeSave, id: BoardId) {
  const r = rank(h, id), c = costOf(id, r);
  if (r >= DEF[id].max || (h.embers ?? 0) < c) return false;
  h.embers = (h.embers ?? 0) - c;
  (h.board ??= {})[id] = r + 1;
  return true;
}
/** What the board gives a run. */
export function boardBonus(h: HordeSave | undefined) {
  return {
    dmg: 1 + 0.04 * rank(h, 'might'), hp: 1 + 0.06 * rank(h, 'vigor'), cd: 1 - 0.02 * rank(h, 'haste'), reach: 1 + 0.1 * rank(h, 'reach'),
    redraws: rank(h, 'redraw'), banishes: rank(h, 'banish'), levels: rank(h, 'headstart'),
  };
}
export const mutsOpen = (h: HordeSave | undefined) => (h?.best ?? 0) >= MUT_OPEN;
export const activeMuts = (h: HordeSave | undefined): MutId[] => (mutsOpen(h) ? (h?.muts ?? []).filter((m) => MUTATORS.some((d) => d.id === m)) : []);
export function toggleMut(h: HordeSave, id: MutId) {
  if (!mutsOpen(h)) return;
  const on = new Set(h.muts ?? []);
  if (on.has(id)) on.delete(id); else on.add(id);
  h.muts = MUTATORS.map((m) => m.id).filter((m) => on.has(m));
}
export const mutBonus = (muts: MutId[]) => 1 + muts.reduce((a, m) => a + (MUTATORS.find((d) => d.id === m)?.embers ?? 0), 0);

/** The embers a run leaves: for the foes felled and the stages reached, more under mutators and for a Night held. */
export function embersFor(kills: number, stage: number, muts: MutId[], held: boolean) {
  return Math.round((kills / 20 + (stage - 1) * 12 + stage * 4) * mutBonus(muts) * (held ? NIGHT_BONUS : 1));
}
/** The whole board's price (for pacing checks). */
export const boardTotal = () => BOARD.reduce((a, b) => { for (let r = 0; r < b.max; r++) a += costOf(b.id, r); return a; }, 0);

/** Repair, never refuse: odd amounts become sane. */
export function settleHorde(s: PhaserSave) {
  const h = s.horde as HordeSave | undefined;
  if (!h) return;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  h.embers = n(h.embers); h.nights = n(h.nights);
  const b: Partial<Record<BoardId, number>> = {};
  for (const d of BOARD) { const r = Math.min(d.max, n(h.board?.[d.id])); if (r) b[d.id] = r; }
  h.board = b;
  h.muts = Array.isArray(h.muts) ? MUTATORS.map((m) => m.id).filter((m) => h.muts!.includes(m)) : [];
  h.mode = h.mode === 'night' ? 'night' : 'endless';
}
