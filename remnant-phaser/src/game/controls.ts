// One input surface for keyboard, gamepad and the on-screen touch controls.
// Scenes read actions (held, pressed this frame) and never a device directly,
// so the touch layer (ui/touch.ts) and tests can drive the same moves.

import Phaser from 'phaser';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'dodge' | 'interact' | 'menu';
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dodge', 'interact', 'menu'];

const KEYS: Record<Action, string[]> = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  jump: ['SPACE', 'K'],
  attack: ['J'],
  dodge: ['L', 'SHIFT'],
  interact: ['F', 'E'],
  menu: ['ESC', 'P'],
};
// Standard gamepad mapping: A jump, X attack, B dodge, Y interact, Start menu.
const PAD: Partial<Record<Action, number[]>> = { jump: [0], attack: [2], dodge: [1, 5], interact: [3], menu: [9] };

export type Device = 'keyboard' | 'gamepad' | 'touch';

export class Controls {
  /** The device last used, so the HUD can show touch buttons or key hints. */
  // Phones start on touch; any key or pad press switches.
  device: Device = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
  private keys = new Map<Action, Phaser.Input.Keyboard.Key[]>();
  private held = new Set<Action>();
  private was = new Set<Action>();
  private touch = new Set<Action>();
  /** Analogue horizontal axis from a stick (touch or pad), -1..1. */
  axis = 0;
  private touchAxis = 0;
  private skip = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      for (const a of ACTIONS) this.keys.set(a, KEYS[a].map((k) => kb.addKey(k, true, false)));
      kb.on('keydown', () => { this.device = 'keyboard'; });
    }
  }

  /** Called by the touch layer. */
  setTouch(a: Action, down: boolean) {
    if (down) { this.touch.add(a); this.device = 'touch'; } else this.touch.delete(a);
  }
  setTouchAxis(x: number) {
    this.touchAxis = x;
    if (x) this.device = 'touch';
  }

  /** Sample every device once per frame, before the scene's update reads it. */
  poll() {
    [this.was, this.held] = [this.held, this.was];
    this.held.clear();
    for (const [a, ks] of this.keys) if (ks.some((k) => k.isDown)) this.held.add(a);
    for (const a of this.touch) this.held.add(a);
    let ax = this.touchAxis;
    const pad = this.scene.input.gamepad?.pad1;
    if (pad) {
      for (const [a, bs] of Object.entries(PAD) as [Action, number[]][]) {
        if (bs.some((b) => pad.buttons[b]?.pressed)) { this.held.add(a); this.device = 'gamepad'; }
      }
      const sx = pad.axes[0]?.getValue() ?? 0, sy = pad.axes[1]?.getValue() ?? 0;
      if (Math.abs(sx) > 0.25) { ax = sx; this.device = 'gamepad'; }
      if (pad.left) this.held.add('left');
      if (pad.right) this.held.add('right');
      if (pad.up || sy < -0.6) this.held.add('up');
      if (pad.down || sy > 0.6) this.held.add('down');
    }
    if (!ax) ax = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    this.axis = Phaser.Math.Clamp(ax, -1, 1);
    // After a flush, whatever is still held counts as old, not as a fresh press.
    if (this.skip) { this.skip = false; this.was.clear(); for (const a of this.held) this.was.add(a); }
  }

  down(a: Action) { return this.held.has(a); }
  pressed(a: Action) { return this.held.has(a) && !this.was.has(a); }
  released(a: Action) { return !this.held.has(a) && this.was.has(a); }
  /** Drop everything held (on room changes and menus), so no press leaks across. */
  flush() {
    this.touch.clear();
    this.touchAxis = 0;
    this.skip = true;
  }
}
