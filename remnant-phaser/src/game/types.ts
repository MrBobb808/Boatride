import type Phaser from 'phaser';
import type { Controls } from './controls';
import type { PhaserSave } from './save';

/** A blow aimed at Elior. `dir` is the way it travels (0: no side, e.g. a hazard). */
export interface Blow {
  dmg: number;
  dir: number;
  /** A melee attacker, staggered when the blow is parried or meets the Shield of Faith. */
  src?: { parried(): void };
  ranged?: boolean;
  hazard?: boolean;
}

/** What actors need from the world scene (kept as an interface to avoid import cycles). */
export interface WorldApi {
  sc: Phaser.Scene;
  controls: Controls;
  save: PhaserSave;
  /** Tile type at a tile coordinate (solid outside the room's sides). */
  tileAt(tx: number, ty: number): number;
  player: { x: number; y: number; feet: number; dead: boolean; hurt(h: Blow): boolean };
  foes(): { alive: boolean; hit(dmg: number, dir: number, force: number, crit?: boolean): boolean; box: Phaser.Geom.Rectangle }[];
  /** A short freeze on a heavy impact. */
  hitstop(sec: number): void;
  shake(intensity: number, ms: number): void;
  floatText(x: number, y: number, text: string, color: string): void;
  spark(x: number, y: number, color: number, n?: number): void;
  onFoeDied(xp: number, silver: number, x: number, y: number): void;
}
