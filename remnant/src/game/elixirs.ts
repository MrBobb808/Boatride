// Elixirs from Ilan's store: one at a time, for five minutes of play. They
// live in the save (`SaveData.elixir`, an end time on the playtime clock), so
// a reload keeps what is left, and `derive` folds the active one into the
// numbers. `tickElixir` (game/economy.ts) runs once a frame in both builds to
// end it on time.

export type ElixirId = 'might' | 'warding' | 'swiftness' | 'focus' | 'insight';
export interface Elixir { id: ElixirId; name: string; desc: string; icon: string; color: string; price: number }

export const ELIXIR_SECONDS = 300;
/** Prices at Chapter I; the store scales them with the chapter (game/economy.ts). */
export const ELIXIRS: Record<ElixirId, Elixir> = {
  might: { id: 'might', name: 'Elixir of Might', desc: 'Weapon blows deal 20% more damage.', icon: 'vial', color: '#ff8a5a', price: 45 },
  warding: { id: 'warding', name: 'Draught of Warding', desc: 'Take 20% less damage.', icon: 'vial', color: '#9fd8ff', price: 45 },
  swiftness: { id: 'swiftness', name: 'Tonic of Swiftness', desc: '12% faster on your feet and 10% faster swings.', icon: 'vial', color: '#b8f07a', price: 40 },
  focus: { id: 'focus', name: 'Elixir of Focus', desc: 'Energy refills 40% faster and abilities hit 15% harder.', icon: 'vial', color: '#c48cff', price: 40 },
  insight: { id: 'insight', name: 'Scholar\'s Draught', desc: '30% more experience.', icon: 'vial', color: '#ffe08a', price: 35 },
};

export interface ElixirSave { elixir?: { id: string; until: number } }

/** The elixir in effect, if any (read by derive; no allocation). */
export function elixirOn(s: ElixirSave & { playtime: number }): ElixirId | null {
  const e = s.elixir;
  return e && e.until > s.playtime && e.id in ELIXIRS ? e.id as ElixirId : null;
}

export function drinkElixir(s: ElixirSave & { playtime: number }, id: ElixirId) {
  s.elixir = { id, until: s.playtime + ELIXIR_SECONDS };
}

/** Seconds of the active elixir left, or 0. */
export const elixirLeft = (s: ElixirSave & { playtime: number }) => (elixirOn(s) ? Math.max(0, s.elixir!.until - s.playtime) : 0);
