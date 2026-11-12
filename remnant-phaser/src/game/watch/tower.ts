// The Watch's tower and its daily dungeons (POLISH_PLAN §18k; NEXT_PLAN D2). The tower is a climb of holders, one
// floor a try: each is harder than the gate holders of the wall, and every fifth floor pays a Seal and chests. The
// dungeons are three keys a day each for coins, essence and a relic's rank. Both are settled by the same numbers the
// wall keeps while he is away (offline.ts), so a floor falls when his strength can fell it in the holder's time, not
// by chance. Watch rewards only. Pure numbers and the save; the scene calls these and the Daily tab draws them.
import * as D from './defs';
import { fightDps } from './offline';
import { dayKey } from './daily';
import { rollRelic, relicRank, relicOfGate, RELIC_MAX, type RelicDrop } from './ascension';
import type { ShadowId } from './shadows';

/** Both open at this best stage. */
export const TOWER_OPEN = 20;
export const KEYS = 3;
export type DungeonId = 'coin' | 'essence' | 'relic';
export const DUNGEONS: { id: DungeonId; name: string; says: string }[] = [
  { id: 'coin', name: 'The Counting House', says: 'Coins worth twenty stages at your best' },
  { id: 'essence', name: 'The Hollow', says: 'Essence ×4 for a shadow you keep' },
  { id: 'relic', name: 'The Reliquary Vault', says: 'A rank for one of your gates\' relics' },
];
export interface KeysSave { day: string; coin: number; essence: number; relic: number }

export const towerOpen = (w: D.WatchSave) => Math.max(w.best, w.bestEver ?? 0) >= TOWER_OPEN;
export const floorOf = (w: D.WatchSave) => Math.max(0, Math.floor(w.tower ?? 0));
/** A floor's holder: the gate holder of ten stages a floor, half again as tough. */
export const floorHp = (floor: number) => D.foeHp(floor * 10) * 1.5;
export const floorCoins = (w: D.WatchSave, floor: number) => Math.floor(D.foeCoins(floor * 10) * D.watchStats(w).coinMult * 3);

export interface Climb { ok: boolean; floor: number; need: number; have: number; coins: number; seals: number; chests: number }
/** Try the next floor. It falls if he can fell its holder within a holder's time; a miss costs nothing. */
export function climb(w: D.WatchSave): Climb | null {
  if (!towerOpen(w)) return null;
  const floor = floorOf(w) + 1, st = D.watchStats(w);
  const need = floorHp(floor), have = fightDps(w) * st.holder * st.bossTime;
  if (have < need) return { ok: false, floor, need, have, coins: 0, seals: 0, chests: 0 };
  const coins = floorCoins(w, floor), mile = floor % 5 === 0;
  w.tower = floor;
  w.coins += coins;
  if (mile) { w.seals += 1; if (w.daily) w.daily.chests += 2; }
  return { ok: true, floor, need, have, coins, seals: mile ? 1 : 0, chests: mile && w.daily ? 2 : 0 };
}

/** Today's keys (three of each; a new day brings them back). */
export function keysOf(w: D.WatchSave, now = Date.now()): KeysSave {
  const today = dayKey(now);
  if (!w.keys || w.keys.day !== today) w.keys = { day: today, coin: KEYS, essence: KEYS, relic: KEYS };
  return w.keys;
}
export interface DungeonRun { id: DungeonId; coins: number; essence: [ShadowId, number] | null; relic: RelicDrop | null; note: string }
/** Spend a key. `pick` chooses the shadow for essence; `rnd` (0–1) the gate whose relic is raised. */
export function runDungeon(w: D.WatchSave, id: DungeonId, pick: () => ShadowId, rnd = Math.random(), now = Date.now()): DungeonRun | null {
  if (!towerOpen(w)) return null;
  const k = keysOf(w, now);
  if (k[id] <= 0) return null;
  const out: DungeonRun = { id, coins: 0, essence: null, relic: null, note: '' };
  if (id === 'coin') {
    out.coins = Math.floor(D.foeCoins(Math.max(1, w.best)) * D.KILLS_PER_STAGE * 20 * D.watchStats(w).coinMult);
    w.coins += out.coins;
  } else if (id === 'essence') {
    const s = pick();
    (w.essence ??= {})[s] = (w.essence[s] ?? 0) + 4;
    out.essence = [s, 4];
  } else {
    // A relic of a gate he has reached that is not yet at its last rank; if every one is, coins instead.
    const gates = Array.from({ length: Math.max(1, D.gateOf(Math.max(w.best, w.bestEver ?? 0)) - 1) }, (_, i) => i + 1).filter((g) => relicRank(w, relicOfGate(g).id) < RELIC_MAX);
    if (!gates.length) { out.coins = Math.floor(D.foeCoins(Math.max(1, w.best)) * D.KILLS_PER_STAGE * 10 * D.watchStats(w).coinMult); w.coins += out.coins; out.note = 'Every relic you can reach is at its last rank: coins instead.'; }
    else { const pity = w.relicPity; out.relic = rollRelic(w, gates[Math.min(gates.length - 1, Math.floor(rnd * gates.length))], 0); w.relicPity = pity; }
  }
  k[id]--;
  return out;
}

/** Repair, never refuse. */
export function migrateTower(w: D.WatchSave) {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  if (w.tower !== undefined) w.tower = n(w.tower);
  const k = w.keys as KeysSave | undefined;
  if (k !== undefined && (!k || typeof k !== 'object' || typeof k.day !== 'string')) delete w.keys;
  else if (k) for (const d of DUNGEONS) k[d.id] = Math.min(KEYS, n(k[d.id]));
}
