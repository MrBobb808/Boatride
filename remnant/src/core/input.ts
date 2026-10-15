// Unified input: keyboard, mouse, game controllers and on-screen touch controls
// all feed the same named actions. Gameplay reads per-step edges; menus get
// immediate callbacks with auto-repeat for navigation.

export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'attack' | 'heavy' | 'dodge' | 'parry'
  | 'skill1' | 'skill2' | 'skill3'
  | 'interact' | 'heal' | 'echo' | 'ultimate' | 'switch'
  | 'menu' | 'map'
  | 'confirm' | 'back' | 'tabL' | 'tabR';

export const ACTIONS: Action[] = [
  'left', 'right', 'up', 'down', 'jump', 'attack', 'heavy', 'dodge', 'parry',
  'skill1', 'skill2', 'skill3', 'interact', 'heal', 'echo', 'ultimate', 'switch', 'menu', 'map',
  'confirm', 'back', 'tabL', 'tabR',
];

export const ACTION_LABELS: Partial<Record<Action, string>> = {
  left: 'Move left', right: 'Move right', up: 'Look up / Interact', down: 'Crouch / Drop',
  jump: 'Jump', attack: 'Attack (hold: charge)', heavy: 'Heavy attack', dodge: 'Dodge / Dash',
  parry: 'Parry (hold: block)', skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3',
  interact: 'Interact', heal: 'Balm (heal)', echo: 'Echo command wheel', ultimate: 'Rally the Remnant', switch: 'Switch support Echo',
  menu: 'Pause menu', map: 'World map',
};

export type Device = 'keyboard' | 'gamepad' | 'touch';

export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  attack: ['KeyJ'],
  heavy: ['KeyK'],
  dodge: ['ShiftLeft', 'KeyL'],
  parry: ['KeyI'],
  skill1: ['KeyQ'],
  skill2: ['KeyE'],
  skill3: ['KeyR'],
  interact: ['KeyF'],
  heal: ['KeyH'],
  echo: ['KeyC'],
  ultimate: ['KeyT'],
  switch: ['KeyX'],
  menu: ['Escape', 'Tab'],
  map: ['KeyM'],
  confirm: ['Enter', 'Space', 'KeyJ'],
  back: ['Escape', 'Backspace'],
  tabL: ['KeyQ', 'BracketLeft'],
  tabR: ['KeyE', 'BracketRight'],
};

// Standard gamepad mapping (Xbox naming).
const PAD: Partial<Record<Action, number[]>> = {
  jump: [0], dodge: [1], attack: [2], heavy: [3], parry: [4], skill1: [5], skill2: [6], skill3: [7],
  switch: [8], menu: [9], ultimate: [11], up: [12], down: [13], left: [14], right: [15],
  confirm: [0], back: [1], tabL: [4], tabR: [5], interact: [12], echo: [10], heal: [13],
};

type Listener = (a: Action, repeat: boolean) => void;

export class Input {
  keys: Record<Action, string[]> = structuredClone(DEFAULT_KEYS);
  lastDevice: Device = 'keyboard';
  axisX = 0;
  axisY = 0;
  /** Pointer position in CSS pixels (for menus / aim if ever needed). */
  private kb = new Set<Action>();
  private mouse = new Set<Action>();
  private pad = new Set<Action>();
  private touch = new Set<Action>();
  private touchAxisX = 0;
  private touchAxisY = 0;
  private padAxisX = 0;
  private padAxisY = 0;
  private downNow = new Set<Action>();
  private pend = new Set<Action>();
  private pendRel = new Set<Action>();
  private pressedStep = new Set<Action>();
  private releasedStep = new Set<Action>();
  private pressAt = new Map<Action, number>();
  private listeners: Listener[] = [];
  private repeatTimers = new Map<Action, number>();
  private rebindCb: ((code: string) => void) | null = null;
  private deviceCbs: ((d: Device) => void)[] = [];
  gamepadConnected = false;
  enabled = true;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKey(e, true), { passive: false });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { passive: false });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    window.addEventListener('gamepadconnected', () => {
      this.gamepadConnected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadConnected = navigator.getGamepads?.().some((g) => g) ?? false;
    });
  }

  bindMouse(el: HTMLElement) {
    // Pointer events with a real mouse only: iOS turns taps into synthetic
    // mouse events, which must not hide the touch controls or swing the sword.
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) this.setSource(this.mouse, 'attack', true);
      if (e.button === 2) this.setSource(this.mouse, 'heavy', true);
      this.setDevice('keyboard');
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) this.setSource(this.mouse, 'attack', false);
      if (e.button === 2) this.setSource(this.mouse, 'heavy', false);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onAction(l: Listener) {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }
  onDevice(cb: (d: Device) => void) {
    this.deviceCbs.push(cb);
  }

  captureNextKey(cb: (code: string) => void) {
    this.rebindCb = cb;
  }

  setDevice(d: Device) {
    if (this.lastDevice !== d) {
      this.lastDevice = d;
      for (const cb of this.deviceCbs) cb(d);
    }
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') return;
    if (this.rebindCb && down) {
      e.preventDefault();
      const cb = this.rebindCb;
      this.rebindCb = null;
      cb(e.code);
      return;
    }
    let handled = false;
    for (const a of ACTIONS) {
      if (this.keys[a].includes(e.code)) {
        handled = true;
        if (down && e.repeat) continue;
        this.setSource(this.kb, a, down);
      }
    }
    if (handled) {
      e.preventDefault();
      this.setDevice('keyboard');
    }
  }

  private setSource(src: Set<Action>, a: Action, down: boolean) {
    const was = this.isDownRaw(a);
    if (down) src.add(a);
    else src.delete(a);
    const now = this.isDownRaw(a);
    if (!was && now) {
      this.pend.add(a);
      this.pressAt.set(a, performance.now());
      this.emit(a, false);
      if (a === 'left' || a === 'right' || a === 'up' || a === 'down') this.repeatTimers.set(a, performance.now() + 380);
    } else if (was && !now) {
      this.pendRel.add(a);
      this.repeatTimers.delete(a);
    }
  }

  private emit(a: Action, repeat: boolean) {
    for (const l of this.listeners.slice()) l(a, repeat);
  }

  private isDownRaw(a: Action) {
    return this.kb.has(a) || this.mouse.has(a) || this.pad.has(a) || this.touch.has(a);
  }

  setTouch(a: Action, down: boolean) {
    this.setDevice('touch');
    this.setSource(this.touch, a, down);
  }
  /** Analog stick from on-screen joystick, -1..1. */
  setTouchAxis(x: number, y: number) {
    this.touchAxisX = x;
    this.touchAxisY = y;
    const th = 0.35;
    this.setSource(this.touch, 'left', x < -th);
    this.setSource(this.touch, 'right', x > th);
    this.setSource(this.touch, 'up', y < -0.55);
    this.setSource(this.touch, 'down', y > 0.6);
  }

  releaseAll() {
    for (const s of [this.kb, this.mouse, this.pad, this.touch]) {
      for (const a of Array.from(s)) this.setSource(s, a, false);
    }
    this.touchAxisX = this.touchAxisY = 0;
  }

  /** Called once per rendered frame. */
  poll() {
    const now = performance.now();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (gp) {
      this.gamepadConnected = true;
      let any = false;
      for (const a of ACTIONS) {
        const idx = PAD[a];
        if (!idx) continue;
        const pressed = idx.some((i) => gp!.buttons[i] && (gp!.buttons[i].pressed || gp!.buttons[i].value > 0.5));
        if (pressed) any = true;
        if (pressed !== this.pad.has(a)) this.setSource(this.pad, a, pressed);
      }
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      const dz = 0.28;
      this.padAxisX = Math.abs(ax) > dz ? ax : 0;
      this.padAxisY = Math.abs(ay) > dz ? ay : 0;
      if (this.padAxisX || this.padAxisY) any = true;
      // Stick also drives the digital directions (for menus and drop-through).
      const stickL = ax < -0.5, stickR = ax > 0.5, stickU = ay < -0.6, stickD = ay > 0.6;
      const dpad = (i: number) => !!gp!.buttons[i]?.pressed;
      const want: [Action, boolean][] = [
        ['left', stickL || dpad(14)], ['right', stickR || dpad(15)],
        ['up', stickU || dpad(12)], ['down', stickD || dpad(13)],
      ];
      for (const [a, v] of want) if (v !== this.pad.has(a)) this.setSource(this.pad, a, v);
      if (any) this.setDevice('gamepad');
    } else {
      this.padAxisX = this.padAxisY = 0;
    }
    // Navigation auto-repeat for menus.
    for (const [a, t] of this.repeatTimers) {
      if (!this.isDownRaw(a)) { this.repeatTimers.delete(a); continue; }
      if (now >= t) {
        this.emit(a, true);
        this.repeatTimers.set(a, now + 110);
      }
    }
    // Combine analog axes.
    let x = 0, y = 0;
    if (this.kb.has('left') || this.pad.has('left') && !this.padAxisX) x -= 1;
    if (this.kb.has('right') || this.pad.has('right') && !this.padAxisX) x += 1;
    if (this.kb.has('up')) y -= 1;
    if (this.kb.has('down')) y += 1;
    if (this.padAxisX) x = this.padAxisX;
    if (this.padAxisY) y = this.padAxisY;
    if (this.touchAxisX || this.touchAxisY) { x = this.touchAxisX; y = this.touchAxisY; }
    this.axisX = Math.max(-1, Math.min(1, x));
    this.axisY = Math.max(-1, Math.min(1, y));
  }

  /** Called at the start of each fixed logic step. */
  beginStep() {
    this.pressedStep = this.pend;
    this.releasedStep = this.pendRel;
    this.pend = new Set();
    this.pendRel = new Set();
    this.downNow.clear();
    for (const a of ACTIONS) if (this.isDownRaw(a)) this.downNow.add(a);
  }
  /** Drop edges so they never fire twice when several steps run per frame. */
  endStep() {
    this.pressedStep.clear();
    this.releasedStep.clear();
  }
  /** Forget queued presses (e.g. after closing a menu with the attack button). */
  flush() {
    this.pend.clear();
    this.pendRel.clear();
    this.pressedStep.clear();
    this.releasedStep.clear();
  }

  down(a: Action) {
    return this.enabled && this.downNow.has(a);
  }
  pressed(a: Action) {
    return this.enabled && this.pressedStep.has(a);
  }
  released(a: Action) {
    return this.releasedStep.has(a);
  }
  held(a: Action) {
    if (!this.isDownRaw(a)) return 0;
    return (performance.now() - (this.pressAt.get(a) ?? performance.now())) / 1000;
  }
  /** Re-arm a press so the next step sees it (used for input buffering across states). */
  rawDown(a: Action) {
    return this.isDownRaw(a);
  }

  keyName(code: string) {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const map: Record<string, string> = {
      Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ArrowLeft: '←', ArrowRight: '→',
      ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Bksp',
      ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', BracketLeft: '[', BracketRight: ']',
    };
    return map[code] ?? code;
  }

  /** Human label for the first binding of an action on the current device. */
  label(a: Action): string {
    if (this.lastDevice === 'gamepad') {
      const names: Partial<Record<Action, string>> = {
        jump: 'A', dodge: 'B', attack: 'X', heavy: 'Y', parry: 'LB', skill1: 'RB', skill2: 'LT', skill3: 'RT',
        interact: 'D-pad ↑', ultimate: 'R3', echo: 'L3', menu: 'Start', map: 'Select', heal: 'D-pad ↓', confirm: 'A', back: 'B',
      };
      return names[a] ?? a;
    }
    if (this.lastDevice === 'touch') {
      const names: Partial<Record<Action, string>> = {
        interact: '⬆', attack: '⚔', jump: '⤒', heal: '✚',
      };
      return names[a] ?? '';
    }
    const k = this.keys[a]?.[0];
    return k ? this.keyName(k) : '';
  }
}

export const input = new Input();
