// On-screen touch controls for iPhone: a floating left stick and a thumb arc
// of buttons around ATTACK, kept clear of the Dynamic Island and the home
// indicator. Multi-touch via pointer events; optional haptics. Every control
// can be moved and resized (ui/touchEditor.ts); a touch that misses the drawn
// buttons still goes to the nearest one within a thumb's width.

import { input, type Action } from '../core/input';
import { settings, onSettingsChange, type TouchSpot } from '../core/settings';
import { haptic as playHaptic, initHaptics, type HapticKind } from '../core/haptics';
import { islandKeepOut } from './island';
import { G, flag } from '../game/ctx';
import { ABILITIES, SUPER_MOVES } from '../game/data';
import { selectedSuper } from '../game/supers';
import { iconUrl } from './icons';
import { safe } from './safe';
import { mantleUnlocked } from '../game/mantle';
import { SUBS, type SubId } from '../game/subweapons';

interface TBtn {
  id: string;
  act?: Action;
  icon: string;
  size: number;
  dx: number;
  dy: number;
  label: string;
  el?: HTMLDivElement;
  cd?: HTMLDivElement;
  cnt?: HTMLDivElement;
  lbl?: HTMLDivElement;
  ui?: () => void;
  corner?: 'tr';
  /** Last opacity factor applied, so styles change only when needed. */
  dim?: number;
  /** Centre and drawn radius on screen, for the forgiving hit test. */
  cx?: number;
  cy?: number;
  r?: number;
  /** Fingers holding it: its own element and the catch layer can both press it. */
  held?: number;
  shown?: boolean;
}

const BTNS: TBtn[] = [
  { id: 'attack', act: 'attack', icon: 'attack', size: 78, dx: 0, dy: 0, label: 'Attack' },
  { id: 'jump', act: 'jump', icon: 'jump', size: 64, dx: 92, dy: -26, label: 'Jump' },
  { id: 'parry', act: 'parry', icon: 'parry', size: 54, dx: 80, dy: 56, label: 'Parry' },
  { id: 'dodge', act: 'dodge', icon: 'dodge', size: 54, dx: 6, dy: 94, label: 'Dodge' },
  { id: 'skill1', act: 'skill1', icon: 'arc', size: 44, dx: 170, dy: -28, label: '' },
  { id: 'skill2', act: 'skill2', icon: 'arc', size: 44, dx: 158, dy: 26, label: '' },
  { id: 'skill3', act: 'skill3', icon: 'arc', size: 44, dx: 138, dy: 86, label: '' },
  { id: 'heal', act: 'heal', icon: 'heal', size: 40, dx: 70, dy: 146, label: 'Balm' },
  { id: 'rally', act: 'ultimate', icon: 'rally', size: 48, dx: 4, dy: 168, label: 'Rally' },
  { id: 'echo', act: 'echo', icon: 'echo', size: 42, dx: 228, dy: 30, label: 'Echoes' },
  { id: 'interact', act: 'interact', icon: 'interact', size: 54, dx: 226, dy: 104, label: '' },
  { id: 'switch', act: 'switch', icon: 'switch', size: 40, dx: 286, dy: 58, label: 'Switch' },
  { id: 'mantle', act: 'transform', icon: 'mantle', size: 48, dx: 148, dy: 148, label: 'Mantle' },
  { id: 'sub', act: 'sub', icon: 'dagger', size: 40, dx: 212, dy: 170, label: 'Sub' },
  { id: 'menu', icon: 'menu', size: 40, dx: 0, dy: 0, label: '', corner: 'tr', ui: () => G.ui.openMenu() },
  { id: 'map', icon: 'map', size: 40, dx: 0, dy: 48, label: '', corner: 'tr', ui: () => G.ui.openMenu('map') },
  { id: 'voice', icon: 'voice', size: 40, dx: 0, dy: 96, label: '', corner: 'tr', ui: () => G.ui.voiceOrders() },
];

/** Stick base radius and knob travel at size 1, in CSS px. */
export const STICK_R = 62, STICK_TRAVEL = 46;
/** Share of the travel ignored at the centre, so a resting thumb never walks. */
const DEAD = 0.1;

let root: HTMLElement;
let zone: HTMLDivElement;
let base: HTMLDivElement;
let knob: HTMLDivElement;
let catcher: HTMLDivElement;
let stickId: number | null = null;
let sx = 0, sy = 0;
/** Where the stick rests (zone coordinates) and its scale, from the layout. */
let homeX = 0, homeY = 0, stickU = 1;
let visible = false;
let bossPhase = 0;
/** Which button each finger is holding. */
const owner = new Map<number, TBtn>();

/** The controls the layout editor can move. */
export interface ControlSpec { id: string; icon: string; size: number; label: string; corner: boolean }
export const CONTROL_SPECS: ControlSpec[] = BTNS.map((b) => ({ id: b.id, icon: b.icon, size: b.size, label: b.label, corner: !!b.corner }));

/** Scale shared by every control: the size setting times the screen height. */
export function touchUnit(H: number, scale = settings.touchScale) {
  return scale * Math.max(0.82, Math.min(1.25, H / 430));
}

/** Scratch result of controlSpot (no allocation per layout). */
export const spot = { cx: 0, cy: 0, r: 0 };

/**
 * Where a control sits on screen and how big it is: its default place (or the
 * player's), mirrored when left-handed, then kept on screen, inside the safe
 * area and away from the Dynamic Island.
 */
export function controlSpot(id: string, W: number, H: number, scale: number, lay: Record<string, TouchSpot>, lh: boolean) {
  const u = touchUnit(H, scale);
  const own = lay[id];
  if (id === 'stick') {
    const r = STICK_R * u * (own?.s ?? 1);
    let x = own ? own.x * W : STICK_DEF_X * u + safe.left;
    const y = own ? own.y * H : H * 0.78 - 90 * u;
    // The stick keeps to its own half, so the floating zone stays clear of the buttons.
    x = Math.min(x, W * 0.5);
    clampSpot(lh ? W - x : x, y, r, W, H);
    return spot;
  }
  const b = BTNS.find((q) => q.id === id)!;
  const s0 = b.size * u;
  let x: number, y: number;
  if (own) {
    x = own.x * W;
    y = own.y * H;
  } else if (b.corner) {
    x = W - 12 - safe.right - s0 / 2;
    y = 10 + safe.top + b.dy * u + s0 / 2;
  } else {
    const right = 24 + Math.max(safe.right, 8);
    const bottom = 38 + Math.max(safe.bottom, 6);
    x = W - (right + (78 * u) / 2 + b.dx * u);
    y = H - (bottom + (78 * u) / 2 + b.dy * u);
  }
  clampSpot(lh ? W - x : x, y, (s0 * (own?.s ?? 1)) / 2, W, H, !!b.corner);
  return spot;
}
const STICK_DEF_X = 110;

/** Keep a circle of radius r inside the safe screen and out of the island; writes spot. */
export function clampSpot(cx: number, cy: number, r: number, W: number, H: number, sideways = false) {
  const m = 6;
  cx = Math.max(safe.left + m + r, Math.min(W - safe.right - m - r, cx));
  cy = Math.max(safe.top + m + r, Math.min(H - safe.bottom - m - r, cy));
  const k = islandKeepOut(W, H);
  if (k && cx + r > k.x0 && cx - r < k.x1 && cy + r > k.y0 && cy - r < k.y1) {
    // Out by the shortest way; the corner column only sideways, so it never lands on its own neighbours.
    const side = k.x0 === 0 ? k.x1 + r - cx : cx - (k.x0 - r);
    const up = cy - (k.y0 - r), down = k.y1 + r - cy;
    if (sideways || (side <= up && side <= down)) cx = k.x0 === 0 ? k.x1 + r : k.x0 - r;
    else if (up <= down) cy = k.y0 - r;
    else cy = k.y1 + r;
  }
  spot.cx = cx;
  spot.cy = cy;
  spot.r = r;
  return spot;
}

export function initTouch(el: HTMLElement) {
  root = el;
  // Under everything else: catches touches that miss a button and gives them to the nearest one.
  catcher = document.createElement('div');
  catcher.className = 'tc-catch';
  root.appendChild(catcher);
  catcher.addEventListener('pointerdown', onCatchDown);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) catcher.addEventListener(ev, onFingerUp);
  catcher.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  catcher.addEventListener('contextmenu', (e) => e.preventDefault());
  zone = document.createElement('div');
  zone.className = 'stick-zone';
  base = document.createElement('div');
  base.className = 'stick-base';
  knob = document.createElement('div');
  knob.className = 'stick-knob';
  base.appendChild(knob);
  zone.appendChild(base);
  root.appendChild(zone);
  zone.addEventListener('pointerdown', onStickDown);
  zone.addEventListener('pointermove', onStickMove);
  zone.addEventListener('pointerup', onStickUp);
  zone.addEventListener('pointercancel', onStickUp);
  zone.addEventListener('lostpointercapture', onStickUp);
  zone.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  for (const b of BTNS) {
    b.held = 0;
    const d = document.createElement('div');
    d.className = 'tc' + (b.id === 'attack' ? ' big' : '') + (b.corner ? ' sq' : '');
    d.dataset.ctl = b.id;
    d.setAttribute('aria-label', b.id === 'voice' ? 'Voice squad orders' : b.label || b.id);
    const im = document.createElement('img');
    im.src = iconUrl(b.icon, b.id === 'mantle' ? '#d4d0ff' : '#f6dea0');
    im.alt = '';
    im.draggable = false;
    d.appendChild(im);
    const cd = document.createElement('div');
    cd.className = 'cd';
    d.appendChild(cd);
    b.cd = cd;
    if (b.label) {
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = b.label;
      d.appendChild(l);
      b.lbl = l;
    }
    if (b.id === 'heal' || b.id === 'sub') {
      const c = document.createElement('div');
      c.className = 'cnt';
      d.appendChild(c);
      b.cnt = c;
    }
    b.el = d;
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      grab(e.pointerId, b);
    });
    d.addEventListener('pointerup', onFingerUp);
    d.addEventListener('pointercancel', onFingerUp);
    d.addEventListener('lostpointercapture', onFingerUp);
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    // Swallow the compatibility click so it can't land on a menu that just opened.
    d.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    d.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    root.appendChild(d);
  }
  layout();
  onSettingsChange(layout);
  window.addEventListener('resize', () => setTimeout(layout, 50));
  // A finger lifted while the app lost focus never reports; let go of everything.
  window.addEventListener('blur', releaseAll);
  initHaptics();
}

export function haptic(kind: HapticKind = 'light') {
  playHaptic(kind);
}

function grab(pid: number, b: TBtn) {
  if (owner.has(pid)) return;
  owner.set(pid, b);
  if (b.held!++ > 0) return;
  b.el!.classList.add('down');
  if (b.act) input.setTouch(b.act, true);
  else input.setDevice('touch');
  haptic(b.id === 'attack' ? 'light' : 'select');
}

function onFingerUp(e: PointerEvent) {
  const b = owner.get(e.pointerId);
  if (!b) return;
  owner.delete(e.pointerId);
  if (--b.held! > 0) return;
  b.held = 0;
  b.el!.classList.remove('down');
  if (b.act) input.setTouch(b.act, false);
  if (b.ui && e.type === 'pointerup') b.ui();
}

/** A touch that missed every drawn button goes to the closest one it was meant for. */
function onCatchDown(e: PointerEvent) {
  // A mouse click hands play back to the keyboard, as it would on the bare canvas.
  if (e.pointerType === 'mouse') {
    input.setDevice('keyboard');
    return;
  }
  e.preventDefault();
  const rc = root.getBoundingClientRect();
  const x = e.clientX - rc.left, y = e.clientY - rc.top;
  let best: TBtn | null = null, bd = Infinity;
  for (const b of BTNS) {
    if (!b.shown || !b.r) continue;
    // Distance from the drawn edge; the reach grows with the button but stays a thumb's width.
    const d = Math.hypot(x - b.cx!, y - b.cy!) - b.r;
    const reach = Math.max(12, Math.min(26, b.r * 0.6));
    if (d <= reach && d < bd) {
      bd = d;
      best = b;
    }
  }
  if (!best) return;
  catcher.setPointerCapture(e.pointerId);
  grab(e.pointerId, best);
}

function releaseAll() {
  onStickUp();
  owner.clear();
  for (const b of BTNS) {
    if (b.held && b.act) input.setTouch(b.act, false);
    b.held = 0;
    b.el?.classList.remove('down');
  }
}

export function layout() {
  if (!root) return;
  const W = window.innerWidth, H = window.innerHeight;
  const lay = settings.touchLayout ?? {};
  const lh = settings.leftHanded;
  for (const b of BTNS) {
    const el = b.el!;
    const p = controlSpot(b.id, W, H, settings.touchScale, lay, lh);
    const s = p.r * 2;
    el.style.width = el.style.height = s + 'px';
    el.style.left = p.cx - p.r + 'px';
    el.style.top = p.cy - p.r + 'px';
    el.style.right = el.style.bottom = '';
    b.cx = p.cx;
    b.cy = p.cy;
    b.r = p.r;
    b.dim = undefined;
    if (b.lbl) b.lbl.style.display = settings.buttonLabels ? '' : 'none';
  }
  // The floating zone: the stick's half of the screen, from just above where it rests.
  const p = controlSpot('stick', W, H, settings.touchScale, lay, lh);
  stickU = p.r / STICK_R;
  const zw = Math.min(W * 0.6, Math.max(W * 0.44, (lh ? W - p.cx : p.cx) + p.r + 20));
  const zt = Math.max(safe.top, Math.min(H * 0.22, p.cy - p.r - 20));
  zone.style.left = lh ? W - zw + 'px' : '0';
  zone.style.right = '';
  zone.style.width = zw + 'px';
  zone.style.top = zt + 'px';
  zone.style.height = H - zt + 'px';
  homeX = p.cx - (lh ? W - zw : 0);
  homeY = p.cy - zt;
  base.style.opacity = '0.35';
  if (stickId === null) {
    base.style.left = homeX + 'px';
    base.style.top = homeY + 'px';
  }
  base.style.transform = `scale(${stickU})`;
}

export function setTouchVisible(v: boolean) {
  visible = v;
  root.style.display = v ? '' : 'none';
  if (!v) releaseAll();
}

/** Refresh contextual buttons (called each frame while visible). */
export function updateTouch() {
  if (!visible) return;
  const s = G.save;
  const p = G.world?.player;
  if (!s || !p) return;
  // A boss's new phase is felt as well as seen.
  const boss = G.world.boss;
  const ph = boss && G.world.bossActive && !boss.dying ? boss.phase : 0;
  if (ph > bossPhase && bossPhase > 0) haptic('phase');
  bossPhase = ph;
  for (const b of BTNS) {
    const el = b.el!;
    let show = true;
    if (b.id.startsWith('skill')) {
      const i = +b.id.slice(5) - 1;
      const id = s.equippedSkills[i];
      show = !!id;
      if (id) {
        const def = ABILITIES[id];
        el.setAttribute('aria-label', def.name);
        const img = el.firstChild as HTMLImageElement;
        const want = iconUrl(def.icon, '#f6dea0');
        if (img.src !== want) img.src = want;
        const cd = (p.cds[id] ?? 0) / def.cd;
        b.cd!.style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,0.65) ${cd * 360}deg, transparent 0)` : 'none';
        el.style.filter = s.ce < def.cost ? 'grayscale(0.8) brightness(0.6)' : '';
      }
    } else if (b.id === 'voice') {
      show = !G.inCutscene && p.state !== 'dead';
    } else if (b.id === 'heal') {
      b.cnt!.textContent = String(s.balm);
      el.style.filter = s.balm > 0 ? '' : 'grayscale(1) brightness(0.5)';
    } else if (b.id === 'rally') {
      show = flag('relic_taken');
      const def = SUPER_MOVES[selectedSuper()];
      el.setAttribute('aria-label', def.name);
      if (b.lbl) b.lbl.textContent = 'Super';
      const im = el.firstChild as HTMLImageElement, want = iconUrl(def.icon, def.color);
      if (im.src !== want) im.src = want;
      const ready = s.rally >= 100;
      el.classList.toggle('glow', ready);
      b.cd!.style.background = ready ? 'none' : `conic-gradient(transparent ${(s.rally / 100) * 360}deg, rgba(0,0,0,0.6) 0)`;
    } else if (b.id === 'sub') {
      show = p.mantleT > 0 || !!s.sub;
      if (b.lbl) b.lbl.textContent = p.mantleT > 0 ? 'Throw' : 'Sub';
      if (p.mantleT > 0) {
        const img = el.firstChild as HTMLImageElement;
        const want = iconUrl('sword', '#b8bdff');
        if (img.src !== want) img.src = want;
        b.cnt!.textContent = p.weaponCd > 0 ? p.weaponCd.toFixed(1) : 'BLINK';
        el.setAttribute('aria-label', 'Throw weapon and blink');
      } else if (s.sub) {
        const def = SUBS[s.sub as SubId];
        const img = el.firstChild as HTMLImageElement;
        const want = iconUrl(def.icon, '#f6dea0');
        if (img.src !== want) img.src = want;
        b.cnt!.textContent = String(s.hearts ?? 0);
        el.setAttribute('aria-label', 'Sub-weapon');
      }
    } else if (b.id === 'mantle') {
      // Fills like a clock face; while transformed it shows the time left.
      show = mantleUnlocked();
      const on = p.mantleT > 0;
      const g = s.mantle ?? 0;
      el.classList.toggle('shade', on || g >= 100);
      el.classList.toggle('glow', !on && g >= 100);
      b.cd!.style.background = on
        ? `conic-gradient(rgba(111,123,255,0.5) ${(p.mantleT / Math.max(1, p.mantleMax)) * 360}deg, rgba(0,0,0,0.45) 0)`
        : g >= 100 ? 'none' : `conic-gradient(transparent ${g * 3.6}deg, rgba(0,0,0,0.6) 0)`;
    } else if (b.id === 'echo') {
      show = s.echoes.length > 0;
    } else if (b.id === 'switch') {
      show = s.echoes.length > 0 && G.world.echoes.length > 0;
      const cd = G.world.switchCd;
      b.cd!.style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,0.6) ${(cd / 4.5) * 360}deg, transparent 0)` : 'none';
    } else if (b.id === 'interact') {
      show = !!G.world.near || !!G.world.purifyTarget;
    } else if (b.id === 'parry' || b.id === 'dodge') {
      show = true;
    }
    if (G.inCutscene && !b.corner) show = b.id === 'attack' || b.id === 'jump' ? true : false;
    el.classList.toggle('hidden', !show);
    b.shown = show;
    if (show) {
      // Buttons that can't do anything right now step back.
      const f = dimFor(b);
      if (f !== b.dim) {
        b.dim = f;
        el.style.opacity = String(settings.touchOpacity * f);
      }
    }
  }
}

function dimFor(b: TBtn): number {
  const s = G.save;
  const p = G.world.player;
  switch (b.id) {
    case 'attack': case 'jump': case 'dodge': case 'parry': case 'interact': return 1;
    case 'skill1': case 'skill2': case 'skill3': {
      const id = s.equippedSkills[+b.id.slice(5) - 1];
      if (!id) return 0.5;
      return (p.cds[id] ?? 0) > 0 || s.ce < ABILITIES[id].cost ? 0.5 : 0.85;
    }
    case 'heal': return s.balm > 0 && s.hp < G.d.maxHp * 0.7 ? 0.9 : 0.5;
    case 'rally': return s.rally >= 100 ? 1 : 0.5;
    case 'mantle': return p.mantleT > 0 || (s.mantle ?? 0) >= 100 ? 1 : 0.5;
    case 'switch': return G.world.switchCd > 0 ? 0.45 : 0.6;
    case 'echo': return 0.6;
    case 'sub': return p.mantleT > 0 ? p.weaponCd > 0 ? 0.45 : 0.95 : s.sub && (s.hearts ?? 0) >= SUBS[s.sub as SubId].cost ? 0.85 : 0.45;
    default: return 0.75;
  }
}

function onStickDown(e: PointerEvent) {
  // A finger whose lift was never reported must not lock the stick.
  if (stickId !== null && zone.hasPointerCapture(stickId)) return;
  e.preventDefault();
  stickId = e.pointerId;
  zone.setPointerCapture(e.pointerId);
  // Floating origin: the stick centres wherever the thumb lands.
  const r = zone.getBoundingClientRect();
  sx = e.clientX - r.left;
  sy = e.clientY - r.top;
  base.style.left = sx + 'px';
  base.style.top = sy + 'px';
  base.style.opacity = '1';
  knob.style.transform = 'translate(0px,0px)';
  input.setTouchAxis(0, 0);
}

function onStickMove(e: PointerEvent) {
  if (e.pointerId !== stickId) return;
  const r = zone.getBoundingClientRect();
  const max = STICK_TRAVEL * stickU;
  let dx = e.clientX - r.left - sx, dy = e.clientY - r.top - sy;
  const d = Math.hypot(dx, dy);
  if (d > max) {
    // Drag the base along so the stick never "runs out".
    const over = d - max;
    sx += (dx / d) * over;
    sy += (dy / d) * over;
    base.style.left = sx + 'px';
    base.style.top = sy + 'px';
    dx = (dx / d) * max;
    dy = (dy / d) * max;
  }
  knob.style.transform = `translate(${dx / stickU}px,${dy / stickU}px)`;
  // Radial dead zone, then rescaled so a push starts gently from zero.
  const m = Math.min(1, d / max);
  if (m < DEAD) {
    input.setTouchAxis(0, 0);
    return;
  }
  const k = (m - DEAD) / (1 - DEAD) / Math.max(1e-6, Math.hypot(dx, dy) / max);
  let nx = (dx / max) * k, ny = (dy / max) * k;
  // A push mostly up or down never creeps sideways.
  if (Math.abs(nx) < 0.18) nx = 0;
  input.setTouchAxis(nx, ny);
}

function onStickUp(e?: PointerEvent) {
  if (e && e.pointerId !== stickId) return;
  stickId = null;
  knob.style.transform = 'translate(0px,0px)';
  base.style.opacity = '0.35';
  base.style.left = homeX + 'px';
  base.style.top = homeY + 'px';
  input.setTouchAxis(0, 0);
}
