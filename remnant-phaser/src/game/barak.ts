import { fx } from '../../../remnant/src/render/fx';
import { bolt } from '../../../remnant/src/game/power';
import { settings } from '../classic/shim/settings';
import type { Player } from './player';
import type { FoeLike, WorldApi } from './types';
export { barakFrame } from './barakArt';

/**
 * Barak's moveset on the journey: every move is a row of four frames on his C19/C21 sheets (`row`), struck at `impact`
 * seconds and over at `end`. `kind` says how it lands: a `jab` finds the nearest foe ahead and may leap on (`leaps`), a
 * `chain` is Chain Lightning leaping from foe to foe, an `area` strikes every foe within `range` (ahead only when
 * `forward`). The Tempest Beast (his form) strikes a third harder, reaches further and leaps once more.
 */
export type BarakMoveId = 'jab1' | 'jab2' | 'burst' | 'volt' | 'palm' | 'drop' | 'chain' | 'thunderhead' | 'flashjab';
export interface BarakMove {
  row: number; impact: number; end: number; lunge: number;
  /** For a chain, how many foes it strikes in all. */
  kind: 'jab' | 'chain' | 'area'; range: number; power: number; leaps: number; poise: number;
  forward?: boolean; launch?: number; style: string;
}
export const BARAK_MOVES: Record<BarakMoveId, BarakMove> = {
  // The Spark String: jab, jab, then the Arc Burst that throws back all in front of him.
  jab1: { row: 0, impact: 0.045, end: 0.2, lunge: 70, kind: 'jab', range: 44, power: 0.85, leaps: 0, poise: 9, style: 'spark-jab' },
  jab2: { row: 0, impact: 0.05, end: 0.22, lunge: 100, kind: 'jab', range: 48, power: 0.95, leaps: 0, poise: 12, style: 'spark-jab-2' },
  burst: { row: 1, impact: 0.1, end: 0.36, lunge: 50, kind: 'area', range: 64, power: 1.35, leaps: 0, poise: 34, forward: true, style: 'arc-burst' },
  // Up + Strike: the Rising Volt, a crackling uppercut that throws a foe into the air (and Barak a little after it).
  volt: { row: 7, impact: 0.09, end: 0.34, lunge: 30, kind: 'area', range: 50, power: 1.1, leaps: 0, poise: 30, forward: true, launch: 440, style: 'rising-volt' },
  // In the air: the Static Palm, which holds him aloft a moment; Down + Strike or Heavy: the Thunder Drop.
  palm: { row: 0, impact: 0.05, end: 0.24, lunge: 40, kind: 'jab', range: 52, power: 0.9, leaps: 0, poise: 10, style: 'static-palm' },
  drop: { row: 3, impact: 0, end: 0.24, lunge: 0, kind: 'area', range: 74, power: 1.5, leaps: 0, poise: 44, launch: 260, style: 'thunder-drop' },
  // Heavy: Chain Lightning; held, it gathers into the Thunderhead, which leaps twice as far and five times.
  chain: { row: 1, impact: 0.13, end: 0.52, lunge: 0, kind: 'chain', range: 104, power: 1.35, leaps: 3, poise: 17, style: 'chain-lightning' },
  thunderhead: { row: 1, impact: 0.02, end: 0.5, lunge: 0, kind: 'chain', range: 150, power: 1.9, leaps: 5, poise: 30, style: 'thunderhead' },
  // Strike out of the dash: the Flash Jab, a lightning-hand lunge through the foe ahead.
  flashjab: { row: 4, impact: 0.05, end: 0.26, lunge: 300, kind: 'jab', range: 58, power: 1.15, leaps: 0, poise: 16, style: 'flash-jab' },
};
/** Heavy held this long gathers the Thunderhead. */
export const THUNDERHEAD_T = 0.45;

const BEAST = { power: 1.3, range: 1.15 };

/** Strike with one of Barak's moves; returns how many foes it touched. */
export function barakStrike(w: WorldApi, p: Player, id: BarakMoveId, beast: boolean) {
  const m = BARAK_MOVES[id], k = beast ? BEAST : { power: 1, range: 1 };
  const range = m.range * k.range, power = p.power() * m.power * k.power;
  w.strikeLamps({ x: p.face > 0 ? p.x : p.x - range, y: p.feet - 40, w: range, h: 32 });
  if (m.kind === 'area') return zapArea(w, p, m, range, power);
  // `leaps` is how many foes in all: a jab finds one (two in the Beast, whose claws arc on); the chains one more.
  const leaps = (m.kind === 'jab' ? 1 : m.leaps) + (beast ? 1 : 0);
  w.playEffect(m.kind === 'chain' ? 'thunder' : 'swing', { vol: m.kind === 'chain' ? (id === 'thunderhead' ? 0.6 : 0.45) : 0.65 });
  return discharge(w, p, { range, power, leaps, poise: m.poise, hop: id === 'thunderhead' ? 120 : 84 });
}

/** The first foe ahead within `range`, then on to the nearest unstruck within `hop`, each leap two thirds as strong. */
export function discharge(w: WorldApi, p: Player, o: { range: number; power: number; leaps: number; poise: number; hop?: number }) {
  const targets = w.foes().slice();
  const hit = new Set<FoeLike>();
  let x = p.x, y = p.feet - 25, power = o.power;
  for (let n = 0; n < o.leaps; n++) {
    let next: FoeLike | undefined, distance = n ? o.hop ?? 84 : o.range;
    for (const f of targets) {
      const phase = f as FoeLike & { fighting?: boolean; ward?: boolean };
      if (!f.alive || f.removed || phase.ward || phase.fighting === false || hit.has(f)) continue;
      const box = f.box;
      const bx = Math.max(box.left, Math.min(x, box.right));
      const by = Math.max(box.top, Math.min(y, box.bottom));
      if (!n && (bx - x) * p.face < -6) continue;
      const d = Math.hypot(bx - x, by - y);
      if (d <= distance && p.lineOfSight(bx, by, x, y)) { next = f; distance = d; }
    }
    if (!next) break;
    const bx = next.box.centerX, by = next.box.centerY;
    const damage = Math.max(1, Math.round(power)), dir = Math.sign(bx - x) || p.face;
    const before = next.hp;
    if (!next.hit(damage, dir, 0.35, false, { poise: o.poise })) break;
    if (!settings.reduceFlashes) bolt(x, y, bx, by, '#88dfff');
    else w.spark(bx, by, 0x88dfff, 3);
    hit.add(next);
    const dealt = before !== undefined && next.hp !== undefined ? Math.max(0, before - next.hp) : damage;
    w.heroHit(next, dealt, o.leaps > 2);
    w.legends?.onHit(next, { heavy: o.leaps > 2, crit: false, ender: false });
    x = bx; y = by; power *= 0.65;
  }
  return hit.size;
}

/** Every foe within `range` of him (ahead only, for a forward move), struck once; a launch throws them upward. */
function zapArea(w: WorldApi, p: Player, m: BarakMove, range: number, power: number) {
  const x = p.x, y = p.feet - 25;
  w.playEffect(m.launch && m.forward ? 'swingHeavy' : 'thunder', { vol: 0.5 });
  w.spark(x + (m.forward ? p.face * range * 0.5 : 0), y, 0x81deff, settings.reduceFlashes ? 3 : 10);
  if (!m.forward) fx.ring(x, p.feet - 6, 6, range, '#96ddff', 0.3, settings.reduceFlashes ? 1 : 3);
  let n = 0;
  for (const f of w.foes().slice()) {
    if (!f.alive || f.removed) continue;
    const b = f.box, bx = Math.max(b.left, Math.min(x, b.right)), by = Math.max(b.top, Math.min(y, b.bottom));
    if (Math.hypot(bx - x, by - y) > range || !p.lineOfSight(bx, by, x, y)) continue;
    if (m.forward && ((bx - x) * p.face < -6 || Math.abs(by - y) > 34)) continue;
    const dir = Math.sign(b.centerX - x) || p.face, damage = Math.max(1, Math.round(power)), before = f.hp;
    const lift = m.launch ? { ky: -m.launch, launch: true } : {};
    if (!f.hit(damage, dir, 1.2, false, { poise: m.poise, ...lift })) continue;
    n++;
    if (!settings.reduceFlashes) bolt(x, y, b.centerX, b.centerY, '#a8e6ff');
    w.heroHit(f, before !== undefined && f.hp !== undefined ? Math.max(0, before - f.hp) : damage, true);
    w.legends?.onHit(f, { heavy: true, crit: false, ender: m.style === 'arc-burst' });
  }
  return n;
}

export type StormMove = import('./abilities').StormSkill | 'skybreaker';
type Impact = StormMove | 'dash' | 'guard';
const STORM = {
  piercing_current: { range: 42, power: 2.8, forward: true },
  forked_spear: { range: 230, power: 2.1, forward: true },
  thunderclap: { range: 92, power: 1.9, forward: false },
  skybreaker: { range: 240, power: 2.5, forward: false },
  dash: { range: 29, power: 0.55, forward: false },
  guard: { range: 65, power: 1.4, forward: false },
} as const;

/** A rush may overlap a foe for several frames. Each pulse owns its hit set. */
export function stormHit(w: WorldApi, p: Player, move: Impact, hit: Set<FoeLike>) {
  const spec = STORM[move], x = p.x, y = p.y;
  const sustained = move === 'dash' || move === 'piercing_current';
  if (!sustained) {
    w.playEffect('thunder', { vol: move === 'skybreaker' ? 0.7 : 0.45 });
    w.spark(x, y, 0x81deff, settings.reduceFlashes ? 3 : 10);
    if (move === 'thunderclap' || move === 'guard') fx.ring(x, y, 6, spec.range, '#96ddff', 0.25, settings.reduceFlashes ? 1 : 3);
    if (move === 'forked_spear' && !settings.reduceFlashes) {
      let reach = 0;
      while (reach + 6 <= spec.range && p.lineOfSight(x + p.face * (reach + 6), y)) reach += 6;
      bolt(x, y, x + p.face * reach, y, '#99dcff');
    }
  }
  for (const f of w.foes().slice()) {
    if (!f.alive || f.removed || hit.has(f)) continue;
    const b = f.box, bx = Math.max(b.left, Math.min(x, b.right)), by = Math.max(b.top, Math.min(y, b.bottom));
    if (Math.hypot(bx-x, by-y) > spec.range || !p.lineOfSight(bx, by)) continue;
    if (spec.forward && ((bx-x)*p.face < -3 || Math.abs(by-y) > 25)) continue;
    const dir = Math.sign(b.centerX-x) || p.face, damage = Math.max(1, Math.round(p.power()*spec.power));
    const before = f.hp;
    if (!f.hit(damage, dir, move === 'thunderclap' ? 2 : 0.6, false, { guardBreak: move === 'thunderclap', poise: sustained ? 14 : 38 })) continue;
    hit.add(f);
    if (!settings.reduceFlashes) bolt(move === 'skybreaker' ? b.centerX : x, move === 'skybreaker' ? by-110 : y, b.centerX, b.centerY, '#8acfff');
    w.heroHit(f, before !== undefined && f.hp !== undefined ? Math.max(0, before-f.hp) : damage, !sustained);
  }
}
