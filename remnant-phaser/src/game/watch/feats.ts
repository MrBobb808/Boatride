// The Watch's feats (POLISH_PLAN §18k, the owner's answer of 7 November 2026: Watch bonuses and cosmetic titles). Each
// is a milestone of what the wall does anyway (the tallies, the best stage, Ascensions, levels, shadows, the streak).
// Earned once and kept through every Ascension, each adds a small, permanent share to his blows, his health or his
// coins (all of them together about a third more of each), and gives a title he may wear. Nothing here reaches the
// journey. Pure numbers and the save; the Feats tab is in ui.ts and the stats fold the bonus in (defs.ts).
import type { WatchSave } from './defs';
import type { TallyId } from './daily';

export type FeatKind = 'atk' | 'hp' | 'coins';
export type FeatMeasure = TallyId | 'best' | 'ascensions' | 'level' | 'shadows' | 'streak';
export interface Feat { id: string; name: string; title: string; measure: FeatMeasure; goal: number; kind: FeatKind; bonus: number }

/** What each measure counts, for the Feats tab. */
export const MEASURE: Record<FeatMeasure, string> = {
  kills: 'Foes felled', stages: 'Stages cleared', gates: 'Gate holders felled', elites: 'Gold elites felled',
  casts: 'Abilities used', buys: 'Upgrades bought', best: 'Best stage', ascensions: 'Ascensions', level: 'Watch level',
  shadows: 'Shadows raised', streak: 'Days in a row',
};

const F = (id: string, name: string, title: string, measure: FeatMeasure, goal: number, kind: FeatKind, bonus: number): Feat => ({ id, name, title, measure, goal, kind, bonus });
export const FEATS: Feat[] = [
  F('k1', 'The First Thousand', 'Watchman', 'kills', 1e3, 'atk', 0.02),
  F('k2', 'Ten Thousand Fallen', 'Wallwarden', 'kills', 1e4, 'atk', 0.03),
  F('k3', 'A Great Host', 'Hostbreaker', 'kills', 1e5, 'atk', 0.04),
  F('k4', 'Beyond Counting', 'the Unwearied', 'kills', 1e6, 'atk', 0.05),
  F('s1', 'A Long Night', 'Night Watchman', 'stages', 100, 'coins', 0.02),
  F('s2', 'A Thousand Nights', 'Keeper of the Wall', 'stages', 1e3, 'coins', 0.03),
  F('s3', 'Watch Without End', 'the Sleepless', 'stages', 1e4, 'coins', 0.05),
  F('g1', 'Gatebreaker', 'Gatebreaker', 'gates', 10, 'atk', 0.02),
  F('g2', 'Fifty Gates', 'Bane of Holders', 'gates', 50, 'atk', 0.03),
  F('g3', 'No Gate Stands', 'the Unbarred', 'gates', 250, 'atk', 0.04),
  F('e1', 'Gold Hunter', 'Gold-hunter', 'elites', 25, 'hp', 0.02),
  F('e2', 'Essence Gatherer', 'the Gatherer', 'elites', 250, 'hp', 0.03),
  F('e3', 'Bane of the Gilded', 'Elite-bane', 'elites', 2500, 'hp', 0.04),
  F('c1', 'Practised', 'the Practised', 'casts', 100, 'hp', 0.02),
  F('c2', 'Covenant Arts', 'Master of Arts', 'casts', 1e3, 'hp', 0.03),
  F('c3', 'The Unceasing', 'the Unceasing', 'casts', 1e4, 'hp', 0.04),
  F('b1', 'Steady Hands', 'the Provider', 'buys', 100, 'coins', 0.02),
  F('b2', 'Well Provided', 'Quartermaster', 'buys', 1e3, 'coins', 0.03),
  F('b3', 'Treasury of the Wall', 'Treasurer', 'buys', 1e4, 'coins', 0.04),
  F('d1', 'Halfway Up', 'the Climber', 'best', 50, 'hp', 0.02),
  F('d2', 'Stage One Hundred', 'Centurion', 'best', 100, 'hp', 0.03),
  F('d3', 'Two Hundred Strong', 'the Steadfast', 'best', 200, 'hp', 0.04),
  F('d4', 'Three Hundred', 'the Immovable', 'best', 300, 'hp', 0.05),
  F('a1', 'First Ascension', 'the Ascended', 'ascensions', 1, 'coins', 0.03),
  F('a2', 'Five Ascensions', 'Seal-bearer', 'ascensions', 5, 'coins', 0.04),
  F('a3', 'Fifteen Ascensions', 'Keeper of Seals', 'ascensions', 15, 'coins', 0.05),
  F('l1', 'Mantled', 'the Mantled', 'level', 25, 'hp', 0.02),
  F('l2', 'Seasoned', 'the Seasoned', 'level', 100, 'hp', 0.03),
  F('l3', 'Elder of the Watch', 'Elder of the Watch', 'level', 150, 'hp', 0.04),
  F('h1', 'Shadow-caller', 'Shadow-caller', 'shadows', 3, 'atk', 0.02),
  F('h2', 'Captain of Shadows', 'Captain of Shadows', 'shadows', 6, 'atk', 0.03),
  F('h3', 'The Ninefold', 'the Ninefold', 'shadows', 9, 'atk', 0.04),
  F('t1', 'A Faithful Week', 'the Faithful', 'streak', 7, 'coins', 0.03),
  F('t2', 'A Constant Month', 'the Constant', 'streak', 30, 'coins', 0.05),
];
export const FEAT: Record<string, Feat> = Object.fromEntries(FEATS.map((f) => [f.id, f]));

/** How far a measure has come. */
export function measure(w: WatchSave, m: FeatMeasure): number {
  switch (m) {
    case 'best': return w.bestEver;
    case 'ascensions': return w.ascensions;
    case 'level': return w.level;
    case 'shadows': return Object.values(w.shadows ?? {}).filter((s) => (s?.lv ?? 0) > 0).length;
    case 'streak': return w.daily?.streak ?? 0;
    default: return w.tally?.[m] ?? 0;
  }
}

/** Earn every feat now reached; returns the newly earned (for a toast). Cheap: a few dozen comparisons. */
export function checkFeats(w: WatchSave): Feat[] {
  const have = (w.feats ??= []), got: Feat[] = [];
  for (const f of FEATS) if (!have.includes(f.id) && measure(w, f.measure) >= f.goal) { have.push(f.id); got.push(f); }
  return got;
}

/** The feats' share of his blows, health and coins (each 1 + the sum of its feats earned). */
export function featBonus(w: WatchSave): Record<FeatKind, number> {
  const b = { atk: 1, hp: 1, coins: 1 };
  for (const id of w.feats ?? []) { const f = FEAT[id]; if (f) b[f.kind] += f.bonus; }
  return b;
}

/** The title he wears (one of his feats'), or none. */
export const titleOf = (w: WatchSave) => (w.title && w.feats?.includes(w.title) ? FEAT[w.title]?.title : undefined);
