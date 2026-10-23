// Breakable lamps, in the old castle-hunter way: oil lamps on iron brackets
// line the walls of every room. Strike one and it drops a heart (sub-weapon
// ammunition), silver, or now and then a sub-weapon. They are lit again
// whenever you come back into the room.

import { G, flag, setFlag } from './ctx';
import { Entity } from './entity';
import { TILE, T, type RoomDef } from './tiles';
import { moveBody } from './physics';
import { fx, PK } from '../render/fx';
import { glow, rgba, type Ctx } from '../render/draw';
import { lighting } from '../render/lighting';
import { sfx } from '../audio/audio';
import { input } from '../core/input';
import { RNG, rand, choose, overlaps, type Rect } from '../core/math';
import { SUBS, SUB_IDS, MAX_HEARTS, type SubId } from './subweapons';
import { chapterOf } from './rooms';
import { islandNotify } from '../ui/island';
import { icon } from '../ui/icons';
import { valorTrack } from './valor';

export class Lamp extends Entity {
  phase = rand(0, 10);
  /** Hanging lamps swing from a chain in open rooms; bracket lamps sit on walls indoors. */
  hanging: boolean;
  /** Its place in the room's row of lamps (the same every visit), for the Lamplighter trophy. */
  index: number;

  constructor(x: number, y: number, hanging: boolean, index = 0) {
    super(x, y, 10, 14);
    this.hanging = hanging;
    this.index = index;
    this.collide = false;
    this.grav = 0;
    this.layer = 3;
  }

  update(_dt: number) {}

  smash() {
    if (this.remove) return;
    this.remove = true;
    valorTrack.lamp(G.world.room.id, this.index);
    input.rumble(0, 0.3, 40);
    const x = this.x, y = this.y - 8;
    sfx('shatter', { vol: 0.35, pitch: 2.2 });
    fx.spawn(PK.Smoke, x, y, 0, -30, 0.5, 3, 8, '#3a3030', -20, 2);
    for (let i = 0; i < 6; i++) fx.spawn(PK.Ember, x + rand(-3, 3), y, rand(-60, 60), rand(-90, -20), 0.5, 1.4, 0.2, '#ffcf6b', 200, 1);
    fx.shards(x, y, 4, '#a07a3a', 0.5);
    G.world.add(new Drop(rollDrop(), x, y));
  }

  draw(ctx: Ctx) {
    const t = G.time + this.phase;
    const x = this.x, y = this.y;
    ctx.save();
    ctx.translate(x, y);
    if (this.hanging) {
      // Chain up to the hook, a gentle swing.
      const sw = Math.sin(t * 1.6) * 0.06;
      ctx.rotate(sw);
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, -34);
      ctx.stroke();
    } else {
      // Iron bracket into the wall behind.
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, 6);
      ctx.moveTo(-4, 6);
      ctx.lineTo(4, 6);
      ctx.stroke();
    }
    // Brass bowl with a lip, oil and wick.
    ctx.fillStyle = '#8a6a34';
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.quadraticCurveTo(0, 2, 6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9a04a';
    ctx.fillRect(-6.5, -7, 13, 1.6);
    ctx.fillStyle = 'rgba(255,240,200,0.35)';
    ctx.fillRect(-4, -6, 3, 1);
    // Flame.
    const fl = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -11, 14 * fl, '#ff9a3a', 0.45);
    ctx.fillStyle = rgba('#ffcf6b', 0.95);
    ctx.beginPath();
    ctx.moveTo(-2.2, -8);
    ctx.quadraticCurveTo(-2.4 + Math.sin(t * 9) * 0.6, -12 * fl, 0, -15 * fl);
    ctx.quadraticCurveTo(2.4, -12 * fl, 2.2, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,240,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, -9.6, 0.9, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  lights() {
    lighting.add(this.x, this.y - 10, 42, '#ffb35c', 0.6, 0.5);
  }
}

type DropKind = 'heart' | 'bigheart' | 'silver' | SubId;

function rollDrop(): DropKind {
  const s = G.save;
  // The first lamp you ever break gives you something to throw.
  if (!flag('first_sub')) {
    setFlag('first_sub');
    return s.sub ? 'bigheart' : 'dagger';
  }
  const r = Math.random();
  if (r < 0.055) {
    // Later chapters hold the rarer sub-weapons.
    const pool: SubId[] = chapterOf(G.world.room.id) >= 2 ? SUB_IDS : ['dagger', 'axe', 'sling', 'holy_water'];
    const others = pool.filter((k) => k !== s.sub);
    return choose(others.length ? others : pool);
  }
  if (r < 0.15) return 'bigheart';
  if (r < 0.34) return 'silver';
  return 'heart';
}

/** A heart, silver or a sub-weapon tumbling out of a broken lamp. */
export class Drop extends Entity {
  kind: DropKind;
  t = 0;
  life = 14;

  constructor(kind: DropKind, x: number, y: number) {
    super(x, y, 8, 8);
    this.kind = kind;
    this.body.vy = -140;
    this.body.vx = rand(-30, 30);
    this.layer = 7;
  }

  update(dt: number) {
    const W = G.world;
    const b = this.body;
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.remove = true; return; }
    // Small hearts drift down like a leaf, as they always have; the rest drop.
    if (this.kind === 'heart' && b.vy > 0) {
      b.vy = Math.min(b.vy + 300 * dt, 40);
      b.vx = Math.sin(this.t * 4) * 30;
    } else {
      b.vy = Math.min(b.vy + 900 * dt, 400);
      b.vx *= Math.max(0, 1 - dt * 3);
    }
    moveBody(b, dt, W.grid, W.solid);
    if (b.onGround) b.vx = 0;
    if (this.t > 0.25 && overlaps(this.hurtbox(), W.player.hurtbox())) this.collect();
  }

  private collect() {
    const s = G.save;
    this.remove = true;
    if (this.kind === 'heart' || this.kind === 'bigheart') {
      const n = this.kind === 'heart' ? 1 : 5;
      s.hearts = Math.min(MAX_HEARTS, (s.hearts ?? 0) + n);
      sfx('pickup', { vol: 0.5, pitch: this.kind === 'heart' ? 1.5 : 1.1 });
      fx.number(this.x, this.y - 14, `+${n} ♥`, false, '#ff7a8a');
      return;
    }
    if (this.kind === 'silver') {
      const n = Math.round(rand(3, 9) * (1 + chapterOf(G.world.room.id) * 0.5));
      s.silver += n;
      sfx('pickup', { vol: 0.5, pitch: 1.8 });
      fx.number(this.x, this.y - 14, `+${n} silver`, false, '#ece4d4');
      return;
    }
    const def = SUBS[this.kind];
    const first = !s.sub;
    if (s.sub === this.kind) {
      s.hearts = Math.min(MAX_HEARTS, (s.hearts ?? 0) + 5);
      fx.number(this.x, this.y - 14, '+5 ♥', false, '#ff7a8a');
    } else {
      s.sub = this.kind;
      if (first) s.hearts = Math.max(s.hearts ?? 0, 10);
      G.ui.toast(`Sub-weapon: ${def.name}. ${def.desc}${first ? ` Throw it with ${G.world.keyLabel('sub') || 'the Sub button'} (or hold up and press Heavy). It costs hearts.` : ''}`, 'good');
      islandNotify(def.name.toUpperCase(), def.color, def.icon, 2.4);
    }
    sfx('lootRare', { vol: 0.5 });
    fx.ring(this.x, this.y - 6, 4, 26, def.color, 0.35, 2);
  }

  draw(ctx: Ctx) {
    const blink = this.life < 3 && Math.floor(this.life * 8) % 2 === 0;
    if (blink) return;
    const x = this.x, y = this.y - 5 + (this.body.onGround ? Math.sin(this.t * 4) * 1.2 : 0);
    ctx.save();
    ctx.translate(x, y);
    if (this.kind === 'heart' || this.kind === 'bigheart') {
      const s = this.kind === 'heart' ? 0.7 : 1.15;
      ctx.scale(s, s);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, 10, '#ff4a6a', 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e0304a';
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.bezierCurveTo(-7, 0, -6, -6, -2.5, -5);
      ctx.quadraticCurveTo(-0.5, -4.6, 0, -2.5);
      ctx.quadraticCurveTo(0.5, -4.6, 2.5, -5);
      ctx.bezierCurveTo(6, -6, 7, 0, 0, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,230,0.7)';
      ctx.beginPath();
      ctx.ellipse(-2.6, -2.8, 1.2, 0.8, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === 'silver') {
      ctx.fillStyle = '#d8d4cc';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a867e';
      ctx.fillRect(-1, -1.6, 2, 3.2);
    } else {
      // A sub-weapon on a little pedestal of light.
      const def = SUBS[this.kind];
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, 14, def.color, 0.5 + Math.sin(this.t * 6) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(icon(def.icon, def.color, 32), -7, -7, 14, 14);
    }
    ctx.restore();
  }
}

/** Break every lamp the given box touches (sword swings, sub-weapons). */
export function strikeLamps(box: Rect) {
  for (const e of G.world.ents) if (e instanceof Lamp && !e.remove && overlaps(box, e.hurtbox())) e.smash();
}

/**
 * Light the room's lamps. They go along the main floor at intervals, a few
 * tiles up where the air is clear, away from doors, spawns and people. The
 * room's seed keeps them in the same places every visit.
 */
export function placeLamps(r: RoomDef) {
  const W = G.world;
  const g = W.grid;
  if (r.id === 'trial_arena') return;
  const rng = new RNG(r.seed * 7 + 13);
  const busy: number[] = [];
  for (const ex of r.exits) for (let x = ex.x - 3; x <= ex.x + ex.w + 3; x++) busy.push(x);
  for (const sp of Object.values(r.spawns)) busy.push(sp.x);
  for (const e of r.ents) if (e.t === 'npc' || e.t === 'altar' || e.t === 'chest' || e.t === 'lore' || e.t === 'shrine' || e.t === 'boss') busy.push(e.x);
  const clear = (x: number) => !busy.some((b) => Math.abs(b - x) < 3);
  const open = (x: number, y: number) => {
    const t = g.get(x, y);
    return t === T.Empty;
  };
  const step = r.interior ? 11 : 15;
  let x = 6 + Math.floor(rng.next() * 5), lit = 0;
  while (x < r.w - 5) {
    if (clear(x)) {
      // Lowest standing surface in this column: the main floor.
      let floor = -1;
      for (let y = r.h - 1; y > 2; y--) {
        if (W.solid(g.get(x, y)) && open(x, y - 1)) { floor = y; break; }
      }
      const ly = floor - 3;
      if (floor > 0 && open(x, ly) && open(x, ly - 1) && open(x, ly + 1)) {
        W.add(new Lamp((x + 0.5) * TILE, ly * TILE + 10, !r.interior, lit++));
      }
    }
    x += step + Math.floor(rng.next() * 5) - 2;
  }
  valorTrack.lampsLit(r.id, lit);
}
