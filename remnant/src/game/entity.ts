import { makeBody, type Body } from './physics';
import type { Rect } from '../core/math';
import type { Ctx } from '../render/draw';

export type Team = 'player' | 'enemy' | 'neutral';

export interface HitInfo {
  dmg: number;
  poise: number;
  kx: number;
  ky: number;
  dir: number;
  kind: 'melee' | 'proj' | 'ability' | 'echo' | 'hazard';
  crit?: boolean;
  src?: Entity | null;
  launch?: boolean;
  heavy?: boolean;
  parryable?: boolean;
  unblockable?: boolean;
  guardBreak?: boolean;
  stun?: number;
  color?: string;
  /** Hitstop seconds requested by the attacker. */
  stop?: number;
  /** Attacker-provided impact point. */
  px?: number;
  py?: number;
  noKnock?: boolean;
  /** Burn or bleed damage over time: no flinch, no poise, no sparks. */
  dot?: boolean;
}

let nextId = 1;

export abstract class Entity {
  id = nextId++;
  body: Body;
  face = 1;
  team: Team = 'neutral';
  hp = 1;
  maxHp = 1;
  dead = false;
  remove = false;
  /** Seconds of flashing white after taking damage. */
  flash = 0;
  /** Gravity multiplier. */
  grav = 1;
  collide = true;
  /** Draw layer: lower first. */
  layer = 5;
  invuln = 0;
  /** Big things (bosses) are not knocked around. */
  heavyBody = false;
  /** Stagger state for executions. */
  staggered = 0;
  name = '';
  /** Hostile to Elior (enemies and bosses). */
  isFoe = false;
  isBoss = false;
  dying = false;
  /** Elemental status (seconds left, and damage per second). */
  burn = 0;
  burnDps = 0;
  bleed = 0;
  bleedDps = 0;
  chill = 0;
  dotT = 0;
  /** Killing blow cut this foe in two (angle of the cut), drawn by the world. */
  slice: { a: number; t: number } | null = null;
  executable(): boolean {
    return false;
  }
  /** Can Elior's homing moves (Phantom Step, Echo targeting) pick this? */
  canBeTargeted(): boolean {
    return this.isFoe && !this.dying && !this.remove;
  }

  constructor(x: number, y: number, w: number, h: number) {
    this.body = makeBody(x, y, w, h);
  }

  get x() { return this.body.x; }
  set x(v: number) { this.body.x = v; }
  get y() { return this.body.y; }
  set y(v: number) { this.body.y = v; }
  get cx() { return this.body.x; }
  get cy() { return this.body.y - this.body.h / 2; }

  hurtbox(): Rect {
    const b = this.body;
    return { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h };
  }

  abstract update(dt: number): void;
  abstract draw(ctx: Ctx): void;
  /** Return true if the hit connected. */
  takeHit(_h: HitInfo): boolean {
    return false;
  }
  /** Called when the player perfectly parries this entity's attack. */
  parried(_by: Entity): void {}
  /** Light sources this entity emits this frame. */
  lights?(): void;
  drawOverlay?(ctx: Ctx): void;
}
