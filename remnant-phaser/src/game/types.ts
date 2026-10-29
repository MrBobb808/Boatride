import type Phaser from 'phaser';
import type { Controls } from './controls';
import type { PhaserSave } from './save';
import type { Derived } from '../../../remnant/src/game/state';
import type { HitInfo } from '../../../remnant/src/game/entity';
import type { SkillId } from './abilities';

/** A blow aimed at Elior. `dir` is the way it travels (0: no side, e.g. a hazard). */
export interface Blow {
  dmg: number;
  dir: number;
  /** A melee attacker, staggered when the blow is parried or meets the Shield of Faith. */
  src?: { parried(): void };
  ranged?: boolean;
  /** Ground hazards (spikes, eruptions, fire waves): no dodge, parry or guard turns them; jump or leave. */
  hazard?: boolean;
  /** A blow too heavy to parry or block: dodge it. */
  unblockable?: boolean;
}

/** Anything Elior can strike: foes, bosses and their adds. */
export interface FoeLike {
  alive: boolean;
  hp?: number;
  removed: boolean;
  box: Phaser.Geom.Rectangle;
  x: number;
  hit(dmg: number, dir: number, force: number, crit?: boolean, details?: Partial<HitInfo>): boolean;
  update(dt: number): void;
  remove(): void;
  /** Its physics body, so the world can collide it with the room (classic foes collide themselves). */
  rect?: Phaser.GameObjects.Rectangle;
}

/** What the boss bar reads, from a Crown or a classic boss. */
export interface BossView {
  alive: boolean;
  state: string;
  hp: number;
  maxHp: number;
  ward: boolean;
  phaseMarks: number[];
  poise: number;
  maxPoise: number;
}

/** What actors need from the world scene (kept as an interface to avoid import cycles). */
export interface WorldApi {
  sc: Phaser.Scene;
  controls: Controls;
  save: PhaserSave;
  /** Elior's stats, derived from the save as the original does (game/state.ts derive). */
  d: Derived;
  /** Tile type at a tile coordinate (solid outside the room's sides). */
  tileAt(tx: number, ty: number): number;
  player: { x: number; y: number; feet: number; dead: boolean; hp: number; maxHp: number; hurt(h: Blow): boolean };
  foes(): FoeLike[];
  castCovenant(id: SkillId): void;
  lightWave(): void;
  playEffect(name: string): void;
  heroHit(f: FoeLike, damage: number, heavy: boolean, crit?: boolean): void;
  strikeLamps(box: { x: number; y: number; w: number; h: number }): void;
  /** Bring a new foe into the room (a boss's adds). */
  addFoe(f: FoeLike): void;
  /** Room width in pixels. */
  roomW(): number;
  banner(title: string, sub: string): void;
  toast(text: string): void;
  bossBar(name: string | null, sub?: string): void;
  onBossDefeated(key: string): void;
  /** A short freeze on a heavy impact. */
  hitstop(sec: number): void;
  shake(intensity: number, ms: number): void;
  floatText(x: number, y: number, text: string, color: string, crit?: boolean): void;
  spark(x: number, y: number, color: number, n?: number): void;
  onFoeDied(xp: number, silver: number, x: number, y: number, eliteId?: string): void;
}
