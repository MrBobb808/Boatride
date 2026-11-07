// The Watch's pacing, measured (POLISH_PLAN §19 phase 3, G12; the idle-economy skill's pacing targets). A plain
// player is played through on the live wall's stage model (offline.ts runStage, at full speed): no shadows, no
// abilities, buying the cheapest open upgrade whenever the coins allow, pushing on while it can, holding (and buying)
// where it cannot, and ascending once the run has stalled past the Ascension's stage. It reports how long the first
// upgrades take, when each gate falls, and how long each Ascension takes against the one before.
import * as D from './defs';
import { runStage } from './offline';

export interface Pace {
  /** Seconds between each of the first upgrades bought. */
  firstBuys: number[];
  /** Seconds (from the start) each gate's holder fell in the first run, by gate. */
  gates: number[];
  /** Each Ascension: seconds it took, the best stage, the Seals it paid, and its length against the one before. */
  runs: { secs: number; best: number; seals: number; vsPrev: number }[];
}

const stuckFor = 20 * 60; // a run is over once it has gained no stage for twenty minutes past the Ascension's stage

/** Play `ascensions` runs (and a cap on the whole time, in seconds). Pure numbers: the same every time. */
export function pace(ascensions = 5, cap = 90 * 86400): Pace {
  const w = D.migrateWatch(D.newWatch());
  w.last = 0;
  const out: Pace = { firstBuys: [], gates: [], runs: [] };
  let t = 0, lastBuy = 0, runStart = 0, lastGain = 0;
  const buy = () => {
    for (;;) {
      let best: D.TrackId | null = null, price = Infinity;
      for (const tr of D.TRACKS) {
        const lv = D.lvlOf(w, tr.id);
        if (!D.isOpen(w, tr) || (tr.max !== undefined && lv >= tr.max)) continue;
        const p = D.costN(tr.id, lv, 1);
        if (p < price) { price = p; best = tr.id; }
      }
      if (!best || price > w.coins) return;
      w.coins -= price; w.up[best] = D.lvlOf(w, best) + 1;
      if (out.firstBuys.length < 10 && w.ascensions === 0) { out.firstBuys.push(t - lastBuy); lastBuy = t; }
    }
  };
  for (let guard = 0; guard < 2e6 && t < cap && out.runs.length < ascensions; guard++) {
    const run = runStage(w, w.stage);
    t += run.time / (run.ok ? 1 : 2);
    if (run.ok) {
      w.coins += run.coins; w.xp += run.xp;
      while (w.xp >= D.watchXpNext(w.level)) { w.xp -= D.watchXpNext(w.level); w.level++; }
      if (D.isBoss(w.stage) && w.ascensions === 0) out.gates[D.gateOf(w.stage)] = Math.round(t);
      w.stage++;
      if (w.stage > w.best) { w.best = w.stage; lastGain = t; }
    } else {
      // Stopped: hold the stage before (its pay) until stronger.
      w.stage = Math.max(1, w.stage - 1);
      const back = runStage(w, w.stage);
      if (back.ok) { w.coins += back.coins; w.xp += back.xp; t += back.time; }
      while (w.xp >= D.watchXpNext(w.level)) { w.xp -= D.watchXpNext(w.level); w.level++; }
    }
    buy();
    // Ascend once the run is past the Ascension's stage and has stalled.
    if (w.best >= D.ASCEND_AT && t - lastGain > stuckFor) {
      const seals = D.sealsFor(w.best), secs = t - runStart, prev = out.runs[out.runs.length - 1];
      out.runs.push({ secs: Math.round(secs), best: w.best, seals, vsPrev: prev ? +(secs / prev.secs).toFixed(2) : 1 });
      w.seals += seals; w.ascensions++;
      w.stage = 1; w.best = 1; w.coins = 0; w.up = {};
      runStart = t; lastGain = t;
    }
  }
  return out;
}
