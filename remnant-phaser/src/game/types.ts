import type Phaser from 'phaser';
import type { Controls } from './controls';
import type { PhaserSave } from './save';

/** What actors need from the world scene (kept as an interface to avoid import cycles). */
export interface WorldApi {
  sc: Phaser.Scene;
  controls: Controls;
  save: PhaserSave;
  /** Tile type at a tile coordinate (solid outside the room's sides). */
  tileAt(tx: number, ty: number): number;
  player: { x: number; y: number; feet: number; dead: boolean; hurt(dmg: number, dir: number): boolean };
  foes(): { alive: boolean; hit(dmg: number, dir: number, force: number): boolean; box: Phaser.Geom.Rectangle }[];
  /** A short freeze on a heavy impact. */
  hitstop(sec: number): void;
  shake(intensity: number, ms: number): void;
  floatText(x: number, y: number, text: string, color: string): void;
  spark(x: number, y: number, color: number, n?: number): void;
  onFoeDied(xp: number, silver: number, x: number, y: number): void;
}
