// Phaser gameplay reads the same remappable keyboard, pad and touch device
// service as the story UI. Arcade remains the only player physics simulation.
import type Phaser from 'phaser';
import { input, ACTIONS, type Action, type Device } from '../../../remnant/src/core/input';
export { ACTIONS, type Action, type Device };
export class Controls {
  locked = false;
  constructor(_scene: Phaser.Scene) { if (matchMedia('(pointer: coarse)').matches) input.setDevice('touch'); }
  get device() { return input.lastDevice; }
  get axis() { return this.locked ? 0 : input.axisX; }
  setTouch(a: Action, down: boolean) { input.setTouch(a, down); }
  setTouchAxis(x: number, y = 0) { input.setDevice('touch'); input.setTouchAxis(x, y); }
  poll() { input.enabled = true; input.poll(); input.beginStep(); }
  down(a: Action) { return !this.locked && input.down(a); }
  pressed(a: Action) { return !this.locked && input.pressed(a); }
  released(a: Action) { return !this.locked && input.released(a); }
  flush() { input.releaseAll(); }
}
