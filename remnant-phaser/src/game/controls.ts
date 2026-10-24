// One input surface for keyboard, gamepad and the on-screen touch controls.
// Scenes read actions (held, pressed this frame) and never a device directly,
// so the touch layer (ui/touch.ts) and tests can drive the same moves.

import Phaser from 'phaser';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'heavy' | 'dodge' | 'parry' | 'heal' | 'skill1' | 'skill2' | 'skill3' | 'interact' | 'menu';
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'jump', 'attack', 'heavy', 'dodge', 'parry', 'heal', 'skill1', 'skill2', 'skill3', 'interact', 'menu'];

const KEYS: Record<Action, string[]> = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  // The original game's keys (remnant/src/core/input.ts).
  jump: ['SPACE'],
  attack: ['J'],
  heavy: ['K'],
  dodge: ['L', 'SHIFT'],
  parry: ['I'],
  heal: ['H'],
  skill1: ['Q'],
  skill2: ['E'],
  skill3: ['R'],
  interact: ['F'],
  menu: ['ESC', 'P'],
};
// The original's pad: ✕ jump, ○ dodge, □ attack, △ heavy, L1 parry, R1/L2/R2 skills,
// D-pad ↑ interact and ↓ Balm, Options menu.
const PAD: Partial<Record<Action, number[]>> = { jump: [0], dodge: [1], attack: [2], heavy: [3], parry: [4], skill1: [5], skill2: [6], skill3: [7], menu: [9], interact: [12], heal: [13] };

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
  /** While true (a boss's entrance), nothing reaches Elior. */
  locked = false;
  /** Presses seen since the last poll: a tap shorter than a frame still counts. */
  private latch = new Set<Action>();

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      for (const a of ACTIONS) {
        const ks = KEYS[a].map((k) => kb.addKey(k, true, false));
        for (const k of ks) k.on('down', () => this.latch.add(a));
        this.keys.set(a, ks);
      }
      kb.on('keydown', () => { this.device = 'keyboard'; });
    }
  }

  /** Called by the touch layer. */
  setTouch(a: Action, down: boolean) {
    if (down) { this.touch.add(a); this.latch.add(a); this.device = 'touch'; } else this.touch.delete(a);
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
    for (const a of this.latch) this.held.add(a);
    this.latch.clear();
    let ax = this.touchAxis;
    const pad = this.scene.input.gamepad?.pad1;
    if (pad) {
      for (const [a, bs] of Object.entries(PAD) as [Action, number[]][]) {
        if (bs.some((b) => pad.buttons[b]?.pressed)) { this.held.add(a); this.device = 'gamepad'; }
      }
      const sx = pad.axes[0]?.getValue() ?? 0, sy = pad.axes[1]?.getValue() ?? 0;
      if (Math.abs(sx) > 0.25) { ax = sx; this.device = 'gamepad'; }
      // Movement is the left stick only: the D-pad holds quick actions, as in the original.
      if (sy < -0.6) this.held.add('up');
      if (sy > 0.6) this.held.add('down');
    }
    if (this.locked) { this.held.clear(); ax = 0; }
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
    this.latch.clear();
    this.touchAxis = 0;
    this.skip = true;
  }
}
