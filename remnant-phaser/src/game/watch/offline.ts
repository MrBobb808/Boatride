// The Watch while the player is away (POLISH_PLAN §18k, the owner's ask of 6 November 2026): the wall goes on at half
// speed for up to twelve hours. Elior clears stages, levels, earns coins and the essence of elites and gate holders,
// and stops where the live wall would stop him: a holder he cannot fell in its time, or a stage whose foes outlast his
// health. Pure numbers (the scene applies the report), so the test can set it beside the live wall.
import * as D from './defs';
import { sceneOf } from './scenes';
import { ESSENCE_OF, BOSS_ESSENCE, type ShadowId } from './shadows';

/** Away, the wall runs at half speed, for twelve hours at most. */
export const AWAY_RATE = 0.5, AWAY_CAP = 12 * 3600;
/** The longest absence that counts (perks may lengthen it later). */
export const awayCap = (_w: D.WatchSave) => AWAY_CAP;

export interface AwayReport {
  /** The time away that counted (seconds), and the stages he stood on before and after. */
  secs: number; from: number; to: number;
  coins: number; kills: number;
  /** Levels gained, the level he reached and the experience toward the next. */
  levels: number; level: number; xp: number;
  /** Whether he is pushing on, or holding back for the player to Challenge. */
  auto: boolean;
  /** Gates whose holder fell while he was away. */
  gates: number[];
  essence: Partial<Record<ShadowId, number>>;
  /** The stage that stopped him (a gate's holder or a stage too strong), if one did. */
  held: number | null;
}

/** What a stage costs besides the cutting: walking on, the foes coming up, the swing's wind-up (seconds, measured on
 * the live wall). */
const STAGE_WALK = 3, PER_FOE = 1.1;
/** His shadows and abilities add to his own swings on the live wall: about this much each. */
const PER_SHADOW = 0.12, PER_ABILITY = 0.08;
/** Holding back, he tries the stage that stopped him again once he has grown this many levels. */
const RETRY_LEVELS = 3;

/** The sixth foe of a stage (the elite), drawn with the live wall's odds but fixed by the stage, so an absence always
 * reads the same. */
function eliteOf(stage: number) {
  const r = Math.abs(Math.sin(stage * 12.9898) * 43758.5453) % 1, foes = sceneOf(D.gateOf(stage)).foes;
  return foes[r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : r < 0.93 ? 3 : 4];
}

export interface StageRun { ok: boolean; time: number; loss: number; heal: number; max: number; coins: number; xp: number; kills: number; essence: [ShadowId, number][] }

/** One stage on the wall at his strength now: whether he clears it, how long it takes, and what it pays. */
export function runStage(w: D.WatchSave, stage: number): StageRun {
  const st = D.watchStats(w), boss = D.isBoss(stage);
  const dps = D.dpsOf(st) * (1 + PER_SHADOW * (w.team?.length ?? 0) + PER_ABILITY * (w.loadout?.length ?? 0));
  const kills = boss ? 1 : D.KILLS_PER_STAGE, kill = D.foeHp(stage) / dps;
  // The foe before him strikes on its clock while he cuts; his regeneration answers some of it.
  const drain = Math.max(0, (D.foeDmg(stage) * (1 - st.dr)) / D.FOE_RATE - st.maxHp * st.regen);
  // A holder must fall within its time; the health he loses carries from stage to stage (see simulateAway).
  const ok = !boss || kill <= D.BOSS_TIME;
  const walk = PER_FOE * kills + STAGE_WALK, time = kill * kills + walk;
  const essence: [ShadowId, number][] = [];
  let coins = D.foeCoins(stage) * st.coinMult * kills;
  if (boss) {
    const holder = sceneOf(D.gateOf(stage)).boss;
    essence.push([BOSS_ESSENCE[holder] ?? 'knight', 3], ['marshal', 1]);
  } else if (stage >= 3) {
    // The elite pays five foes' coins and leaves essence of its kind.
    coins += D.foeCoins(stage) * st.coinMult * 4;
    essence.push([ESSENCE_OF[eliteOf(stage)] ?? 'sentinel', 1]);
  }
  return { ok, time, loss: drain * kill * kills, heal: st.maxHp * st.regen * walk, max: st.maxHp, coins, xp: D.foeXp(stage) * kills, kills, essence };
}

/** The wall while he was away `secs` seconds. The Watch itself is untouched (see applyAway). */
export function simulateAway(w0: D.WatchSave, secs: number): AwayReport {
  const counted = Math.max(0, Math.min(awayCap(w0), secs));
  // A working copy: only what the run changes.
  const w: D.WatchSave = { ...w0, up: { ...w0.up } };
  const r: AwayReport = { secs: counted, from: w0.stage, to: w0.stage, coins: 0, kills: 0, levels: 0, level: w0.level, xp: w0.xp, auto: w0.auto, gates: [], essence: {}, held: null };
  let t = counted * AWAY_RATE, stage = w0.stage, auto = w0.auto;
  // Holding back after a lost fight: the stage that stopped him is the next one (a gate's holder, or the one after).
  let held: number | null = auto ? null : stage + 1, heldAt = w0.level, hp = Infinity;
  for (let guard = 0; t > 0 && guard < 20000; guard++) {
    // Strong enough now to try the stage that stopped him again?
    if (held !== null && w.level - heldAt >= RETRY_LEVELS && runStage(w, held).ok) { stage = held; held = null; auto = true; hp = Infinity; }
    const run = runStage(w, stage);
    hp = Math.min(hp, run.max);
    if (!run.ok || run.loss >= hp) {
      if (!auto) {
        // Already holding: a fall here costs the time and the stage's pay, never another stage (he rises where he
        // holds), so a night away never leaves him lower than it found him.
        hp = run.max; t -= run.time / 2;
        continue;
      }
      // Stopped: he falls back a stage and holds there, growing, until he is strong enough to try again.
      held = stage; heldAt = w.level; auto = false; hp = run.max;
      stage = Math.max(1, stage - 1);
      continue;
    }
    if (run.time > t) break;
    t -= run.time;
    hp = Math.min(run.max, hp - run.loss + run.heal);
    r.coins += run.coins; r.kills += run.kills;
    for (const [id, n] of run.essence) r.essence[id] = (r.essence[id] ?? 0) + n;
    w.xp += run.xp;
    while (w.xp >= D.watchXpNext(w.level)) { w.xp -= D.watchXpNext(w.level); w.level++; }
    if (D.isBoss(stage)) r.gates.push(D.gateOf(stage));
    // Cleared: on to the next, or (holding back) the same stage again.
    if (auto) stage++;
  }
  r.to = stage; r.level = w.level; r.levels = w.level - w0.level; r.coins = Math.floor(r.coins);
  r.held = held; r.xp = w.xp; r.auto = auto;
  return r;
}

/** Bring the Watch up to where the absence left it. */
export function applyAway(w: D.WatchSave, r: AwayReport) {
  w.stage = r.to; w.best = Math.max(w.best, r.to); w.bestEver = Math.max(w.bestEver, r.to);
  w.coins += r.coins; w.level = r.level; w.xp = r.xp; w.auto = r.auto;
  for (const [id, n] of Object.entries(r.essence) as [ShadowId, number][]) (w.essence ??= {})[id] = (w.essence[id] ?? 0) + n;
}
