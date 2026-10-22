// Finishers: executions play one of several slow-motion set pieces, picked
// at random from those Elior's level has unlocked, and killing blows can
// cut a foe in two under a kill cam. At level 100 the fallen can rise as
// shadows of themselves.

import { G } from './ctx';
import { Entity } from './entity';
import { Enemy } from './enemies';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { clamp, rand, sign, choose } from '../core/math';
import { shakeScale } from '../core/settings';
import { ELEMENTS, weaponElement, powerTier, isSovereign, bolt, type Element } from './power';
import { EchoUnit } from './echoes';
import { makeEcho, skillRank } from './state';
import type { Player } from './player';
import { mantleOn } from './mantle';
import { input } from '../core/input';
import { haptic } from '../core/haptics';

export type FinId = 'verdict' | 'shadowstep' | 'severance' | 'thousand' | 'skyfall' | 'requiem' | 'element' | 'arise';

export interface FinisherDef { id: FinId; name: string; level: number; desc: string }

export const FINISHERS: FinisherDef[] = [
  { id: 'verdict', name: 'Judgment Leap', level: 1, desc: 'Leap high and drive the blade down.' },
  { id: 'shadowstep', name: 'Shadow Step', level: 1, desc: 'Vanish, appear behind the foe and run it through.' },
  { id: 'severance', name: 'Cross Severance', level: 8, desc: 'Dash clean through. The cut lands a heartbeat later.' },
  { id: 'thousand', name: 'Thousand Cuts', level: 15, desc: 'Six blinding passes, then every cut opens at once.' },
  { id: 'skyfall', name: 'Heaven\'s Verdict', level: 25, desc: 'Launch the foe, rise above it and bring it down in a pillar of light.' },
  { id: 'requiem', name: 'Whirlwind Requiem', level: 35, desc: 'Three whirling cuts and a blow that splits the ground.' },
  { id: 'element', name: 'Elemental Ruin', level: 50, desc: 'Unleash the weapon\'s element: fire, frost, storm, shadow, light or blood.' },
  { id: 'arise', name: 'Arise', level: 100, desc: 'A Sovereign\'s execution: the fallen rise to fight for you.' },
];

export function unlockedFinishers(level = G.save.level) {
  const el = weaponElement();
  // In the Shadow Mantle any execution may end in Arise.
  const shade = mantleOn();
  return FINISHERS.filter((f) => (level >= f.level || (f.id === 'arise' && shade)) && (f.id !== 'element' || el));
}

let recent: FinId[] = [];
function pick(): FinId {
  const pool = unlockedFinishers().map((f) => f.id);
  // Newer finishers come up a little more often; never the same one twice running.
  const weighted: FinId[] = [];
  pool.forEach((id, i) => {
    if (recent.includes(id) && pool.length > 2) return;
    for (let k = 0; k <= Math.floor(i / 2); k++) weighted.push(id);
  });
  const id = choose(weighted.length ? weighted : pool);
  recent = [id, ...recent].slice(0, 2);
  return id;
}

export interface FinState {
  id: FinId;
  t: number;
  phase: number;
  target: Entity;
  hidden: boolean;
  struck: boolean;
  sx: number;
  ex: number;
  n: number;
  ghostT: number;
}

export function beginFinisher(p: Player, e: Entity): FinState {
  const f: FinState = { id: pick(), t: 0, phase: 0, target: e, hidden: false, struck: false, sx: p.x, ex: e.x, n: 0, ghostT: 0 };
  p.face = e.x > p.x ? 1 : -1;
  G.camera.zoomTarget = 1.2;
  if (f.id !== 'verdict') {
    const name = FINISHERS.find((d) => d.id === f.id)!.name;
    fx.number(p.x, p.y - 52, name.toUpperCase(), false, color());
  }
  switch (f.id) {
    case 'verdict':
      p.anim.play('executeLeap', 0.05, true);
      p.body.vy = -260;
      G.world.slowmo(0.5, 0.35);
      sfx('whoosh', { vol: 0.7 });
      break;
    case 'shadowstep': case 'arise':
      vanish(p, f);
      G.world.slowmo(0.2, 0.5);
      break;
    case 'severance':
      p.anim.play('dash', 0.03, true, 1 / 0.3);
      sfx('dash', { pitch: 0.8 });
      f.ex = clamp(e.x + p.face * (e.body.w / 2 + 40), 20, G.world.grid.w * 16 - 20);
      break;
    case 'thousand':
      sfx('whoosh', { pitch: 1.4 });
      break;
    case 'skyfall':
      p.anim.play('launch', 0.03, true, 1 / 0.4);
      sfx('swingHeavy');
      if (!e.heavyBody) {
        e.body.vy = -430;
        (e as Enemy).airborne = true;
      }
      p.body.vy = -560;
      break;
    case 'requiem':
      p.anim.play('storm', 0.03, true, 1 / 0.5);
      sfx('swingHeavy', { pitch: 1.1 });
      break;
    case 'element':
      p.anim.play('invoke', 0.05, true, 1 / 0.6);
      G.world.slowmo(0.35, 0.4);
      sfx('beamCharge', { pitch: 1.6, vol: 0.6 });
      break;
  }
  return f;
}

/** Advance the finisher. Returns true when it is over. */
export function updateFinisher(p: Player, f: FinState, dt: number): boolean {
  const e = f.target;
  const b = p.body;
  const t0 = f.t;
  f.t += dt;
  const t = f.t;
  const at = (x: number) => t0 < x && t >= x;
  f.ghostT -= dt;
  switch (f.id) {
    case 'verdict': {
      if (t < 0.28) {
        const tx = e.x - p.face * 10;
        b.vx = (tx - p.x) * 8;
        b.vy += 900 * dt;
      } else {
        b.vx = 0;
        b.vy = Math.max(0, b.vy);
      }
      if (at(0.28)) p.anim.play('executeStrike', 0.03, true);
      if (at(0.38)) climax(p, f, 1, { slow: 0.4 });
      return t > 0.85;
    }
    case 'shadowstep': case 'arise': {
      b.vx = 0;
      b.vy = 0;
      if (at(0.14)) {
        // Behind the foe, blade already moving.
        const side = -(e.face || sign(e.x - p.x) || 1);
        const bx = clamp(e.x + side * (e.body.w / 2 + 12), 16, G.world.grid.w * 16 - 16);
        appear(p, f, bx, e.y, sign(e.x - bx) || -side);
        p.anim.play('dash', 0.02, true, 1 / 0.24);
      }
      if (t > 0.14 && t < 0.22) b.vx = p.face * 60;
      if (at(0.22)) {
        // Through the back and out the front.
        const ox = e.x + p.face * (e.body.w / 2 + 34);
        fx.streak(p.x, e.cy, ox, e.cy - 2, '#ffffff', 0.5, 4);
        fx.streak(p.x, e.cy, ox, e.cy - 2, color(), 0.6, 7);
        fx.hitSparks(ox - p.face * 8, e.cy, p.face, '#ff4a5a', 14, 1.3);
        fx.hitSparks(ox - p.face * 8, e.cy, p.face, color(), 10, 1.1);
        sfx('slice', { pitch: 0.9 });
        climax(p, f, 1.15, { slow: 0.65, scale: 0.14, zoom: 1.45 });
      }
      if (at(0.6)) {
        p.anim.play('b2', 0.03, true, 1 / 0.3);
        fx.slash(p.x + p.face * 10, p.y - 24, 28, -2.4, 0.8, 8, p.face, '#ffffff', color(), 0.2);
        sfx('swing', { pitch: 0.8 });
      }
      if (f.id === 'arise' && at(0.95)) riseAsShadow(e);
      return t > 0.95;
    }
    case 'severance': {
      if (t < 0.16) {
        const u = t / 0.16;
        const nx = f.sx + (f.ex - f.sx) * u;
        if (p.canPlace(nx, p.y)) p.x = nx;
        b.vx = 0;
        b.vy = 0;
        if (f.ghostT <= 0) {
          f.ghostT = 0.025;
          p.ghosts.push({ x: p.x, y: p.y, face: p.face, pose: { ...p.pose }, a: 0.8, rot: 0 });
        }
      }
      if (at(0.16)) {
        fx.streak(f.sx, p.y - 24, f.ex, p.y - 24, '#ffffff', 0.4, 3);
        fx.streak(f.sx, p.y - 24, f.ex, p.y - 24, color(), 0.5, 6);
        p.anim.play('b4', 0.04, true, 1 / 0.4);
        G.world.slowmo(0.45, 0.25);
        sfx('slice', { pitch: 1.2, vol: 0.6 });
      }
      if (at(0.52)) {
        for (const s of [1, -1]) fx.slash(e.cx, e.cy, 34, s * -2.4, s * 0.9, 12, s, '#ffffff', color(), 0.35, s * 0.6);
        climax(p, f, 1.2, { slow: 0.4 });
      }
      return t > 0.9;
    }
    case 'thousand': {
      b.vx = 0;
      b.vy = 0;
      const step = 0.075;
      while (f.n < 6 && t >= f.n * step) {
        const k = f.n;
        f.n++;
        const side = k % 2 ? 1 : -1;
        const nx = clamp(e.x + side * (e.body.w / 2 + 26), 16, G.world.grid.w * 16 - 16);
        p.ghosts.push({ x: p.x, y: p.y, face: p.face, pose: { ...p.pose }, a: 0.9, rot: 0 });
        const a = rand(-0.6, 0.6);
        fx.streak(p.x, e.cy + Math.sin(a) * 20, nx, e.cy - Math.sin(a) * 20, '#ffffff', 0.25, 3);
        fx.streak(p.x, e.cy + Math.sin(a) * 20, nx, e.cy - Math.sin(a) * 20, color(), 0.3, 5);
        fx.hitSparks(e.cx, e.cy + rand(-10, 10), side, color(), 5, 0.8);
        if (p.canPlace(nx, p.y)) p.x = nx;
        p.face = -side;
        p.anim.play(k % 2 ? 'b1' : 'b2', 0.02, true, 1 / 0.12);
        sfx('swing', { pitch: 1.2 + k * 0.08, vol: 0.6 });
        G.camera.addTrauma(0.08 * shakeScale());
      }
      if (at(0.5)) {
        p.anim.play('b4', 0.05, true, 1 / 0.4);
        G.world.slowmo(0.5, 0.25);
      }
      if (at(0.74)) {
        for (let i = 0; i < 6; i++) {
          const a = rand(-3, 3);
          fx.slash(e.cx + rand(-6, 6), e.cy + rand(-8, 8), rand(22, 34), a, a + rand(1.6, 2.6), 8, choose([1, -1]), '#ffffff', color(), 0.3);
        }
        climax(p, f, 1.3, { slow: 0.35 });
      }
      return t > 1.0;
    }
    case 'skyfall': {
      if (f.phase === 0) {
        b.vy += 1500 * dt;
        b.vx = (e.x - p.face * 8 - p.x) * 3;
        if (f.ghostT <= 0) {
          f.ghostT = 0.04;
          fx.streak(p.x, p.y - 10, p.x, p.y + 20, color(), 0.2, 2);
        }
        if (t > 0.34) {
          f.phase = 1;
          p.anim.play('plunge', 0.03, true);
          G.world.slowmo(0.3, 0.3);
          if (!e.heavyBody) e.body.vy = Math.min(e.body.vy, 0);
          sfx('whoosh', { pitch: 0.7 });
        }
      } else if (f.phase === 1) {
        b.vx = 0;
        b.vy = 0;
        if (t > 0.46) {
          f.phase = 2;
          b.vy = 900;
        }
      } else if (f.phase === 2) {
        b.vx = (e.x - p.face * 6 - p.x) * 6;
        b.vy = 900;
        if (!e.heavyBody) e.body.vy = 600;
        if (p.grounded || t > 1.1) {
          f.phase = 3;
          f.n = 0;
          const gy = p.y;
          fx.column(e.x, gy, 70, 420, color(), 1.4);
          fx.ring(e.x, gy - 2, 10, 140, color(), 0.6, 5, 0.3);
          fx.dust(e.x, gy, 26, 2.6);
          G.world.spawnShockwave(e.x + 20, gy, 1, G.d.atk * 1.2, 'player');
          G.world.spawnShockwave(e.x - 20, gy, -1, G.d.atk * 1.2, 'player');
          sfx('bossSlam', { pitch: 1.2 });
          climax(p, f, 1.4, { slow: 0.35 });
          f.sx = t;
        }
      } else {
        b.vx = 0;
        return t > f.sx + 0.4;
      }
      return t > 2;
    }
    case 'requiem': {
      b.vx = 0;
      for (const [k, tt] of [[0, 0.08], [1, 0.22], [2, 0.36]] as const) {
        if (at(tt)) {
          fx.ring(p.x, p.y - 22, 8, 54 + k * 8, color(), 0.3, 3, 0.4);
          fx.slash(p.x, p.y - 22, 40, -3.1, 3.1, 7, 1, '#ffffff', color(), 0.18);
          fx.hitSparks(e.cx, e.cy, p.face, color(), 6, 0.9);
          sfx('swing', { pitch: 1 + k * 0.15 });
          if (!e.heavyBody) e.body.vx = (p.x - e.x) * 2;
        }
      }
      if (at(0.46)) {
        p.anim.play('heavy', 0.03, true, 1 / 0.45);
        G.world.slowmo(0.4, 0.3);
      }
      if (at(0.6)) {
        fx.slash(e.cx, e.cy - 6, 46, -2.8, 0.9, 16, p.face, '#ffffff', color(), 0.4);
        G.world.spawnShockwave(p.x + p.face * 20, p.y, p.face, G.d.atk * 1.4, 'player');
        G.world.spawnShockwave(p.x - p.face * 20, p.y, -p.face, G.d.atk * 1.4, 'player');
        climax(p, f, 1.35, { slow: 0.35 });
      }
      return t > 0.95;
    }
    case 'element': {
      b.vx = 0;
      b.vy = 0;
      const el = weaponElement() ?? 'holy';
      if (t < 0.35 && Math.random() < dt * 40) fx.spawn(PK.Ember, p.x + p.face * 4 + rand(-6, 6), p.y - 44 + rand(-6, 6), 0, -30, 0.4, 2, 0.4, ELEMENTS[el].c);
      if (at(0.35)) p.anim.play('executeStrike', 0.03, true);
      if (at(0.45)) {
        elementalRuin(e, el);
        climax(p, f, 1.5, { slow: 0.45 });
      }
      return t > 1.0;
    }
  }
  return true;
}

// ---------------------------------------------------------------- helpers

function color() {
  const el = weaponElement();
  if (el) return ELEMENTS[el].c;
  return isSovereign() ? '#ffb347' : '#ffcf6b';
}

function vanish(p: Player, f: FinState) {
  f.hidden = true;
  p.ghosts.push({ x: p.x, y: p.y, face: p.face, pose: { ...p.pose }, a: 0.9, rot: 0 });
  fx.veilBurst(p.x, p.y - 20, 14, 1);
  for (let i = 0; i < 8; i++) fx.spawn(PK.Smoke, p.x + rand(-8, 8), p.y - rand(0, 36), rand(-30, 30), rand(-50, -10), 0.5, 3, 9, '#1a1030', -10, 1);
  sfx('teleport');
}

function appear(p: Player, f: FinState, x: number, y: number, face: number) {
  f.hidden = false;
  if (p.canPlace(x, y)) { p.x = x; p.y = y; }
  p.face = face;
  p.body.vx = p.body.vy = 0;
  fx.veilBurst(x, y - 20, 12, 1);
  fx.ring(x, y - 20, 4, 30, color(), 0.25, 2);
  sfx('dash', { pitch: 1.5, vol: 0.7 });
}

/** The moment of the kill: damage, slow time, flash, speed lines. */
function climax(p: Player, f: FinState, mult: number, o: { slow?: number; scale?: number; zoom?: number } = {}) {
  if (f.struck) return;
  f.struck = true;
  input.rumble(0.9, 0.6, 260);
  haptic('kill');
  const e = f.target;
  const exec = skillRank(G.save, 'w_exec') > 0;
  G.world.execute(p, e, mult * (exec ? 1.6 : 1) * (1 + powerTier() * 0.08));
  if (exec) G.save.ce = Math.min(G.d.maxCe, G.save.ce + 25);
  G.world.slowmo(o.slow ?? 0.4, o.scale ?? 0.2);
  G.camera.zoomTarget = o.zoom ?? 1.3;
  G.camera.addTrauma(0.5 * shakeScale());
  speedLines(e.cx, e.cy, color());
  sfx('finisher', { vol: 0.9 });
  const el = weaponElement();
  if (el) fx.ring(e.cx, e.cy, 6, 70, ELEMENTS[el].c, 0.4, 4);
  // A finished foe falls in two.
  if (e.dying && !e.isBoss && !e.slice) e.slice = { a: rand(-0.7, 0.7) + (Math.random() < 0.5 ? 0 : Math.PI / 2), t: 0 };
}

/** Radial streaks: the anime impact frame. */
export function speedLines(x: number, y: number, c: string) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand(-0.1, 0.1);
    const r0 = rand(46, 70), r1 = r0 + rand(70, 140);
    fx.streak(x + Math.cos(a) * r1, y + Math.sin(a) * r1, x + Math.cos(a) * r0, y + Math.sin(a) * r0, i % 3 ? '#ffffff' : c, 0.22, rand(1.2, 2.4));
  }
}

function elementalRuin(e: Entity, el: Element) {
  const E = ELEMENTS[el];
  const x = e.x, y = e.y;
  switch (el) {
    case 'fire':
      fx.column(x, y, 80, 460, E.c, 1.6);
      fx.embers(x, y - 40, 50, E.c, 40);
      for (let i = 0; i < 24; i++) fx.spawn(PK.Flame, x + rand(-30, 30), y - rand(0, 80), rand(-40, 40), rand(-220, -80), 0.8, 10, 2, E.c, -120, 1);
      e.burn = 6;
      e.burnDps = G.d.atk * 0.5;
      break;
    case 'frost':
      for (let i = 0; i < 9; i++) {
        const ox = (i - 4) * 9;
        fx.streak(x + ox, y, x + ox * 1.3, y - rand(30, 70), i % 2 ? E.core : E.c, 1.0, 5);
      }
      fx.shards(e.cx, e.cy, 30, E.c, 1.8);
      fx.ring(x, y - 2, 6, 110, E.core, 0.6, 4, 0.3);
      e.chill = 6;
      break;
    case 'storm': {
      const v = G.camera.view();
      for (let i = 0; i < 3; i++) G.world.after(i * 0.06, () => bolt(x + rand(-30, 30), v.y, e.cx, e.cy, E.c));
      fx.flash(E.c, 0.35);
      fx.ring(e.cx, e.cy, 6, 120, E.core, 0.4, 3);
      break;
    }
    case 'shadow':
      fx.ring(e.cx, e.cy, 120, 4, E.c, 0.45, 5);
      G.world.after(0.2, () => {
        fx.veilBurst(e.cx, e.cy, 40, 2);
        fx.ring(e.cx, e.cy, 6, 140, E.c, 0.5, 6);
      });
      break;
    case 'holy': {
      const v = G.camera.view();
      for (let i = 0; i < 6; i++) {
        const sx = x + (i - 2.5) * 16;
        G.world.after(i * 0.05, () => {
          fx.streak(sx, v.y, sx + rand(-6, 6), y - 6, E.core, 0.4, 4);
          fx.holyBurst(sx, y - 6, 8, 0.6);
        });
      }
      fx.column(x, y, 60, 400, E.core, 1.4);
      break;
    }
    case 'blood':
      for (const s of [1, -1]) fx.slash(e.cx, e.cy, 52, s * -2.5, s * 1.0, 16, s, E.core, E.c, 0.45, s * 0.7);
      fx.hitSparks(e.cx, e.cy, 1, E.c, 30, 1.6);
      fx.hitSparks(e.cx, e.cy, -1, E.c, 30, 1.6);
      e.bleed = 4;
      e.bleedDps = G.d.atk * 0.4;
      break;
  }
}

// ---------------------------------------------------------------- kill blows

let killCamCd = 0;
/**
 * A killing blow from Elior's melee. The last foe standing near him, or an
 * elite, earns a slow-motion kill cam; other kills sometimes cut the foe in
 * two. At level 100 the fallen may rise as temporary shadows.
 */
export function killBlow(p: Player, e: Entity, arcA0: number, arcA1: number) {
  if (e.isBoss || e.slice) return;
  const tier = powerTier();
  const elite = e instanceof Enemy && !!e.elite;
  const others = G.world.foes().some((o) => o !== e && o.canBeTargeted() && Math.abs(o.x - p.x) < 300 && Math.abs(o.y - p.y) < 160);
  const cut = (arcA0 + arcA1) / 2 + Math.PI / 2;
  if ((!others || elite) && G.time > killCamCd) {
    killCamCd = G.time + 2.5;
    e.slice = { a: cut, t: 0 };
    G.world.slowmo(0.55, 0.18);
    G.camera.zoomTarget = 1.3;
    G.world.after(0.25, () => (G.camera.zoomTarget = 1));
    fx.flash('#ffffff', 0.35);
    speedLines(e.cx, e.cy, color());
    sfx('finisher', { vol: 0.7 });
    sfx('slice');
  } else if (Math.random() < 0.15 + tier * 0.06) {
    e.slice = { a: cut, t: 0 };
    sfx('slice', { vol: 0.6, pitch: rand(1, 1.2) });
  }
  if (isSovereign() && !elite && Math.random() < 0.25) G.world.after(0.7, () => riseAsShadow(e));
}

const SHADOW_OF: Record<string, string> = { archer: 'archer', wisp: 'archer', brute: 'brute', bulwark: 'bulwark', knight: 'knight', soldier: 'locust', drone: 'locust', lion: 'lion', priest: 'archer', vessel: 'archer', scribe: 'archer', undying: 'undying', gale: 'archer' };

/** The fallen rise as a shadow Echo for half a minute. */
export function riseAsShadow(e: Entity) {
  if (!(e instanceof Enemy) || e.elite) return;
  const W = G.world;
  if (W.echoes.filter((u) => u.tempT > 0).length >= 4) return;
  const species = SHADOW_OF[e.kind] ?? 'sentinel';
  let inst;
  try {
    inst = makeEcho(species);
  } catch {
    inst = makeEcho('sentinel');
  }
  const u = new EchoUnit(inst, e.x, e.y, W.echoes.length);
  u.tempT = 30;
  u.summonT = 0.9;
  W.echoes.push(u);
  fx.column(e.x, e.y, 30, 200, '#8a4aff', 1.0);
  fx.veilBurst(e.cx, e.cy, 20, 1.2);
  fx.number(e.x, e.y - 50, 'ARISE', true, '#c9a8ff');
  sfx('arise', { vol: 0.6 });
}
