// On-screen touch controls for iPhone: a floating left stick and a thumb arc
// of buttons around ATTACK, kept clear of the Dynamic Island and the home
// indicator. Multi-touch via pointer events; optional haptics.

import { input, type Action } from '../core/input';
import { settings, onSettingsChange, isIOS } from '../core/settings';
import { G, flag } from '../game/ctx';
import { ABILITIES } from '../game/data';
import { iconUrl } from './icons';
import { safe } from './safe';

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
  ui?: () => void;
  corner?: 'tr';
}

const BTNS: TBtn[] = [
  { id: 'attack', act: 'attack', icon: 'attack', size: 78, dx: 0, dy: 0, label: 'Attack' },
  { id: 'jump', act: 'jump', icon: 'jump', size: 64, dx: 92, dy: -26, label: 'Jump' },
  { id: 'parry', act: 'parry', icon: 'parry', size: 54, dx: 80, dy: 56, label: 'Parry' },
  { id: 'dodge', act: 'dodge', icon: 'dodge', size: 54, dx: 6, dy: 94, label: 'Dodge' },
  { id: 'skill1', act: 'skill1', icon: 'arc', size: 48, dx: 172, dy: -28, label: '' },
  { id: 'skill2', act: 'skill2', icon: 'arc', size: 48, dx: 160, dy: 26, label: '' },
  { id: 'skill3', act: 'skill3', icon: 'arc', size: 48, dx: 138, dy: 88, label: '' },
  { id: 'heal', act: 'heal', icon: 'heal', size: 42, dx: 70, dy: 146, label: 'Balm' },
  { id: 'rally', act: 'ultimate', icon: 'rally', size: 54, dx: 2, dy: 170, label: 'Rally' },
  { id: 'echo', act: 'echo', icon: 'echo', size: 46, dx: 232, dy: 30, label: 'Echoes' },
  { id: 'interact', act: 'interact', icon: 'interact', size: 54, dx: 226, dy: 104, label: '' },
  { id: 'switch', act: 'switch', icon: 'switch', size: 44, dx: 292, dy: 58, label: 'Switch' },
  { id: 'menu', icon: 'menu', size: 40, dx: 0, dy: 0, label: '', corner: 'tr', ui: () => G.ui.openMenu() },
  { id: 'map', icon: 'map', size: 40, dx: 0, dy: 48, label: '', corner: 'tr', ui: () => G.ui.openMenu('map') },
];

let root: HTMLElement;
let zone: HTMLDivElement;
let base: HTMLDivElement;
let knob: HTMLDivElement;
let stickId: number | null = null;
let sx = 0, sy = 0;
let visible = false;
let hapticLabel: HTMLLabelElement | null = null;

export function initTouch(el: HTMLElement) {
  root = el;
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
    const d = document.createElement('div');
    d.className = 'tc' + (b.id === 'attack' ? ' big' : '') + (b.corner ? ' sq' : '');
    const im = document.createElement('img');
    im.src = iconUrl(b.icon, '#f6dea0');
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
    }
    if (b.id === 'heal') {
      const c = document.createElement('div');
      c.className = 'cnt';
      d.appendChild(c);
      b.cnt = c;
    }
    b.el = d;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      d.classList.add('down');
      if (b.act) input.setTouch(b.act, true);
      else input.setDevice('touch');
      haptic(b.id === 'attack' ? 'light' : 'select');
    };
    const up = (e: PointerEvent) => {
      if (!d.classList.contains('down')) return;
      d.classList.remove('down');
      if (b.act) input.setTouch(b.act, false);
      if (b.ui && e.type === 'pointerup') b.ui();
    };
    d.addEventListener('pointerdown', down);
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('lostpointercapture', up);
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    // Swallow the compatibility click so it can't land on a menu that just opened.
    d.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    d.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    root.appendChild(d);
  }
  layout();
  onSettingsChange(layout);
  window.addEventListener('resize', () => setTimeout(layout, 50));
  // iOS 18+ haptic feedback via a native switch control.
  if (isIOS()) {
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.setAttribute('switch', '');
    inp.id = 'haptic-switch';
    inp.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none;';
    const lab = document.createElement('label');
    lab.htmlFor = 'haptic-switch';
    lab.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none;';
    document.body.appendChild(inp);
    document.body.appendChild(lab);
    hapticLabel = lab;
  }
}

export function haptic(kind: 'light' | 'select' | 'heavy' = 'light') {
  if (!settings.haptics) return;
  try {
    if (hapticLabel) hapticLabel.click();
    else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 24 : kind === 'light' ? 10 : 6);
  } catch {
    /* unsupported */
  }
}

export function layout() {
  if (!root) return;
  const W = window.innerWidth, H = window.innerHeight;
  const u = settings.touchScale * Math.max(0.82, Math.min(1.25, H / 430));
  const right = 24 + Math.max(safe.right, 8);
  const bottom = 38 + Math.max(safe.bottom, 6);
  const lh = settings.leftHanded;
  for (const b of BTNS) {
    const el = b.el!;
    const s = b.size * u;
    el.style.width = el.style.height = s + 'px';
    el.style.opacity = String(settings.touchOpacity);
    if (b.corner === 'tr') {
      const top = 10 + safe.top + b.dy * u;
      el.style.top = top + 'px';
      el.style.bottom = '';
      if (lh) {
        el.style.left = 12 + safe.left + 'px';
        el.style.right = '';
      } else {
        el.style.right = 12 + safe.right + 'px';
        el.style.left = '';
      }
      continue;
    }
    const attack = 78 * u;
    const cx = right + attack / 2 + b.dx * u;
    const cy = bottom + attack / 2 + b.dy * u;
    el.style.bottom = cy - s / 2 + 'px';
    el.style.top = '';
    if (lh) {
      el.style.left = cx - s / 2 + 'px';
      el.style.right = '';
    } else {
      el.style.right = cx - s / 2 + 'px';
      el.style.left = '';
    }
  }
  zone.style.left = lh ? '' : '0';
  zone.style.right = lh ? '0' : '';
  zone.style.width = (lh ? 44 : 44) + '%';
  base.style.opacity = '0.35';
  if (stickId === null) {
    const bx = lh ? W * 0.44 - 110 * u : 110 * u + safe.left;
    base.style.left = (lh ? zone.clientWidth - 110 * u - safe.right : bx) + 'px';
    base.style.top = H * 0.78 - 90 * u + 'px';
  }
  base.style.transform = `scale(${u})`;
}

export function setTouchVisible(v: boolean) {
  visible = v;
  root.style.display = v ? '' : 'none';
  if (!v) {
    onStickUp();
    for (const b of BTNS) {
      if (b.el?.classList.contains('down') && b.act) input.setTouch(b.act, false);
      b.el?.classList.remove('down');
    }
  }
}

/** Refresh contextual buttons (called each frame while visible). */
export function updateTouch() {
  if (!visible) return;
  const s = G.save;
  const p = G.world?.player;
  if (!s || !p) return;
  for (const b of BTNS) {
    const el = b.el!;
    let show = true;
    if (b.id.startsWith('skill')) {
      const i = +b.id.slice(5) - 1;
      const id = s.equippedSkills[i];
      show = !!id;
      if (id) {
        const def = ABILITIES[id];
        const img = el.firstChild as HTMLImageElement;
        const want = iconUrl(def.icon, '#f6dea0');
        if (img.src !== want) img.src = want;
        const cd = (p.cds[id] ?? 0) / def.cd;
        b.cd!.style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,0.65) ${cd * 360}deg, transparent 0)` : 'none';
        el.style.filter = s.ce < def.cost ? 'grayscale(0.8) brightness(0.6)' : '';
      }
    } else if (b.id === 'heal') {
      b.cnt!.textContent = String(s.balm);
      el.style.filter = s.balm > 0 ? '' : 'grayscale(1) brightness(0.5)';
    } else if (b.id === 'rally') {
      show = flag('relic_taken');
      const ready = s.rally >= 100;
      el.classList.toggle('glow', ready);
      b.cd!.style.background = ready ? 'none' : `conic-gradient(transparent ${(s.rally / 100) * 360}deg, rgba(0,0,0,0.6) 0)`;
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
  }
}

function onStickDown(e: PointerEvent) {
  if (stickId !== null) return;
  e.preventDefault();
  stickId = e.pointerId;
  zone.setPointerCapture(e.pointerId);
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
  const u = settings.touchScale * Math.max(0.82, Math.min(1.25, window.innerHeight / 430));
  const max = 46 * u;
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
  knob.style.transform = `translate(${dx / u}px,${dy / u}px)`;
  let nx = dx / max, ny = dy / max;
  if (Math.abs(nx) < 0.18) nx = 0;
  input.setTouchAxis(nx, ny);
}

function onStickUp(e?: PointerEvent) {
  if (e && e.pointerId !== stickId) return;
  stickId = null;
  knob.style.transform = 'translate(0px,0px)';
  base.style.opacity = '0.35';
  input.setTouchAxis(0, 0);
}
