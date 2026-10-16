// Unified input: keyboard, mouse, game controllers and on-screen touch controls
// all feed the same named actions. Gameplay reads per-step edges; menus get
// immediate callbacks with auto-repeat for navigation.

export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'attack' | 'heavy' | 'dodge' | 'parry'
  | 'skill1' | 'skill2' | 'skill3'
  | 'interact' | 'heal' | 'echo' | 'ultimate' | 'switch' | 'transform' | 'sub'
  | 'menu' | 'map'
  | 'confirm' | 'back' | 'tabL' | 'tabR';

export const ACTIONS: Action[] = [
  'left', 'right', 'up', 'down', 'jump', 'attack', 'heavy', 'dodge', 'parry',
  'skill1', 'skill2', 'skill3', 'interact', 'heal', 'echo', 'ultimate', 'switch', 'transform', 'sub', 'menu', 'map',
  'confirm', 'back', 'tabL', 'tabR',
];

export const ACTION_LABELS: Partial<Record<Action, string>> = {
  left: 'Move left', right: 'Move right', up: 'Look up / Interact', down: 'Crouch / Drop',
  jump: 'Jump', attack: 'Attack (hold: charge)', heavy: 'Heavy attack', dodge: 'Dodge / Dash',
  parry: 'Parry (hold: block)', skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3',
  interact: 'Interact', heal: 'Balm (heal)', echo: 'Echo command wheel', ultimate: 'Rally the Remnant', switch: 'Switch support Echo', transform: 'Shadow Mantle (transform)', sub: 'Sub-weapon (or hold up + Heavy)',
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
  transform: ['KeyG'],
  sub: ['KeyU'],
  menu: ['Escape', 'Tab'],
  map: ['KeyM'],
  confirm: ['Enter', 'Space', 'KeyJ'],
  back: ['Escape', 'Backspace'],
  tabL: ['KeyQ', 'BracketLeft'],
  tabR: ['KeyE', 'BracketRight'],
};

// Standard gamepad mapping. Button indices are the same on Xbox and
// PlayStation pads: 0 A/✕, 1 B/○, 2 X/□, 3 Y/△, 4 LB/L1, 5 RB/R1, 6 LT/L2,
// 7 RT/R2, 8 View/Create, 9 Menu/Options, 10 L3, 11 R3, 12–15 D-pad, 16 home.
// The Shadow Mantle has no button of its own by default: L3 + R3 together.
// In play the D-pad holds quick actions, as in Souls games (↑ interact,
// ↓ Balm, ← Switch, → sub-weapon); movement and combo directions come from
// the left stick only, so a quick action never also moves or launches.
export const DEFAULT_PAD: Partial<Record<Action, number[]>> = {
  jump: [0], dodge: [1], attack: [2], heavy: [3], parry: [4], skill1: [5], skill2: [6], skill3: [7],
  map: [17, 8], menu: [9], echo: [10], ultimate: [11], transform: [],
  interact: [12], heal: [13], switch: [14], sub: [15],
};
// Menus always navigate the same way: ✕/A confirm, ○/B back, L1/R1 tabs.
const PAD_FIXED: Partial<Record<Action, number[]>> = { confirm: [0], back: [1], tabL: [4], tabR: [5] };
/** Actions a player may move to other controller buttons. */
export const PAD_REMAPPABLE: Action[] = ['jump', 'attack', 'heavy', 'dodge', 'parry', 'skill1', 'skill2', 'skill3', 'interact', 'heal', 'echo', 'ultimate', 'switch', 'transform', 'sub', 'map', 'menu'];

export type PadKind = 'playstation' | 'xbox' | 'generic';
const PS_NAMES = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'PS', 'Touchpad'];
const XB_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home', 'Share'];

/** Sony pads report names like "DualSense Wireless Controller" or vendor 054c. */
export function padKindOf(id: string): PadKind {
  const s = id.toLowerCase();
  if (/dualsense|dualshock|playstation|054c|ps5|ps4|wireless controller/.test(s)) return 'playstation';
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  return 'generic';
}

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
  /** Controller bindings in use: defaults overlaid with the player's own. */
  padMap: Partial<Record<Action, number[]>> = { ...DEFAULT_PAD };
  padKind: PadKind = 'generic';
  padName = '';
  private padCapture: ((button: number) => void) | null = null;
  private padPrev: boolean[] = [];
  /** A button just used for a rebind is ignored until it is let go. */
  private padHold = -1;
  /** When each stick was clicked in (0 = up), and whether both were clicked together. */
  private l3At = 0;
  private r3At = 0;
  private stickCombo = false;

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
      if (gp.id !== this.padName) {
        this.padName = gp.id;
        this.padKind = padKindOf(gp.id);
      }
      const btn = (i: number) => i !== this.padHold && !!gp!.buttons[i] && (gp!.buttons[i].pressed || gp!.buttons[i].value > 0.5);
      if (this.padHold >= 0 && !gp.buttons[this.padHold]?.pressed) this.padHold = -1;
      // Rebinding: the next button pressed goes to the waiting callback.
      if (this.padCapture) {
        for (let i = 0; i < gp.buttons.length; i++) {
          const down = !!gp.buttons[i]?.pressed;
          if (down && !this.padPrev[i]) {
            const cb = this.padCapture;
            this.padCapture = null;
            this.padHold = i;
            cb(i);
            break;
          }
        }
        this.padPrev = gp.buttons.map((b) => !!b?.pressed);
        return;
      }
      this.padPrev = gp.buttons.map((b) => !!b?.pressed);
      let any = false;
      // Stick clicks: while the Mantle has no button of its own, L3 + R3
      // together call it. A lone click waits a few frames for its partner so
      // the chord never also fires what L3 or R3 do alone.
      const chord = !(this.padMap.transform?.length);
      const l3 = btn(10), r3 = btn(11);
      this.l3At = l3 ? this.l3At || now : 0;
      this.r3At = r3 ? this.r3At || now : 0;
      if (chord && l3 && r3) this.stickCombo = true;
      else if (!l3 && !r3) this.stickCombo = false;
      const l3Solo = !this.stickCombo && l3 && (!chord || now - this.l3At > 70);
      const r3Solo = !this.stickCombo && r3 && (!chord || now - this.r3At > 70);
      for (const a of ACTIONS) {
        // Directions come from the stick and D-pad below.
        if (a === 'left' || a === 'right' || a === 'up' || a === 'down') continue;
        const idx = PAD_FIXED[a] ?? this.padMap[a];
        let pressed = false;
        if (idx) for (const i of idx) if (i === 10 ? l3Solo : i === 11 ? r3Solo : btn(i)) pressed = true;
        if (a === 'transform' && chord && this.stickCombo) pressed = true;
        if (pressed) any = true;
        if (pressed !== this.pad.has(a)) this.setSource(this.pad, a, pressed);
      }
      if (l3 || r3) any = true;
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
    if (this.kb.has('left')) x -= 1;
    if (this.kb.has('right')) x += 1;
    if (this.kb.has('up')) y -= 1;
    if (this.kb.has('down')) y += 1;
    if (this.padAxisX) x = this.padAxisX;
    if (this.padAxisY) y = this.padAxisY;
    if (this.touchAxisX || this.touchAxisY) { x = this.touchAxisX; y = this.touchAxisY; }
    this.axisX = Math.max(-1, Math.min(1, x));
    this.axisY = Math.max(-1, Math.min(1, y));
  }

  /**
   * Up / down for moves (launcher, plunge, drop-through, rising strikes).
   * The stick must point mostly that way, so running diagonally and
   * attacking stays a plain combo. Keys count as fully up or down.
   */
  get aimUp() {
    return this.enabled && this.axisY < -0.5 && -this.axisY >= Math.abs(this.axisX) * 0.9;
  }
  get aimDown() {
    return this.enabled && this.axisY > 0.5 && this.axisY >= Math.abs(this.axisX) * 0.9;
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

  /** A controller button's name in the style of the connected pad. */
  buttonName(i: number) {
    const names = this.padKind === 'playstation' ? PS_NAMES : XB_NAMES;
    return names[i] ?? `Button ${i}`;
  }

  /** The controller button(s) for an action, as the player would read them. */
  padLabel(a: Action): string {
    if (a === 'transform' && !(this.padMap.transform?.length)) return `${this.buttonName(10)}+${this.buttonName(11)}`;
    if (a === 'sub' && !(this.padMap.sub?.length)) return `L-stick ↑+${this.buttonName(3)}`;
    const idx = PAD_FIXED[a] ?? this.padMap[a];
    if (a === 'up') return 'L-stick ↑';
    if (a === 'down') return 'L-stick ↓';
    return idx && idx.length ? idx.map((i) => this.buttonName(i)).join(' / ') : '—';
  }

  /** Wait for the next controller button (for rebinding). */
  capturePadButton(cb: ((button: number) => void) | null) {
    this.padCapture = cb;
  }
  get capturingPad() {
    return !!this.padCapture;
  }

  /** Rumble the controller, where the browser allows it (DualSense and Xbox pads in Safari 16.4+ and Chrome). */
  rumble(strong: number, weak: number, ms: number, force = false) {
    if (!this.rumbleOn && !force) return false;
    if (!force && (this.lastDevice !== 'gamepad' || !this.gamepadConnected)) return false;
    const now = performance.now();
    const level = Math.max(strong, weak);
    // A light buzz never cuts short a heavier one that is still playing.
    if (!force && now < this.rumbleUntil && level < this.rumbleLevel) return true;
    const pad = this.livePad();
    if (!pad) return false;
    const p = pad as Gamepad & {
      vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown>; effects?: string[]; type?: string };
      hapticActuators?: { pulse?: (v: number, ms: number) => Promise<unknown> }[];
    };
    const act = p.vibrationActuator;
    let ok = false;
    if (act?.playEffect && (!act.effects || act.effects.includes('dual-rumble'))) {
      act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => { /* unsupported */ });
      ok = true;
    } else if (p.hapticActuators?.[0]?.pulse) {
      // Older Firefox: one motor, one strength.
      p.hapticActuators[0].pulse(Math.min(1, level), ms).catch(() => { /* unsupported */ });
      ok = true;
    }
    if (ok) {
      this.rumbleUntil = now + ms;
      this.rumbleLevel = level;
    }
    return ok;
  }
  /** Whether the browser can make the connected controller vibrate. */
  canRumble() {
    const p = this.livePad() as (Gamepad & { vibrationActuator?: { playEffect?: unknown }; hapticActuators?: { pulse?: unknown }[] }) | null;
    if (!p) return null;
    return !!(p.vibrationActuator?.playEffect || p.hapticActuators?.[0]?.pulse);
  }
  /** The connected pad as the browser reports it right now (snapshots go stale). */
  private livePad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  private rumbleUntil = 0;
  private rumbleLevel = 0;
  rumbleOn = true;

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
    if (this.lastDevice === 'gamepad') return this.padLabel(a);
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
