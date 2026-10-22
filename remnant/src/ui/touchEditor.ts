// Customize controls: every touch control over the dimmed, paused game. Drag
// one to move it, pinch or use the slider to resize it, fade them all, reset,
// done. Positions are kept as fractions of the screen so a layout carries over
// to other screen sizes; the same clamp as play keeps controls inside the safe
// area and off the Dynamic Island while they are dragged.

import { h, btn, pushLayer, popLayer } from './dom';
import { iconUrl } from './icons';
import { settings, saveSettings, TOUCH_DEFAULTS, type TouchSpot } from '../core/settings';
import { CONTROL_SPECS, controlSpot, STICK_R } from './touch';
import { islandKeepOut } from './island';

const NAMES: Record<string, string> = {
  stick: 'Move stick', attack: 'Attack', jump: 'Jump', parry: 'Parry', dodge: 'Dodge', skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3',
  heal: 'Balm', rally: 'Super', echo: 'Echoes', interact: 'Use', switch: 'Switch', mantle: 'Mantle', sub: 'Sub-weapon', menu: 'Menu', map: 'Map', voice: 'Voice',
};
const S_MIN = 0.6, S_MAX = 1.8;

let rootEl: HTMLElement | null = null;

export const touchEditorOpen = () => !!rootEl;

export function openTouchEditor(onClose?: () => void) {
  if (rootEl) return;
  const work: Record<string, TouchSpot> = structuredClone(settings.touchLayout ?? {});
  let scale = settings.touchScale, opacity = settings.touchOpacity;
  const lh = settings.leftHanded;
  let sel = 'attack';
  const ids = ['stick', ...CONTROL_SPECS.map((c) => c.id)];
  const els: Record<string, HTMLDivElement> = {};
  const stage = h('div', { class: 'tce-stage' });
  const island = h('div', { class: 'tce-island' });
  stage.appendChild(island);
  for (const id of ids) {
    const spec = CONTROL_SPECS.find((c) => c.id === id);
    const el = h('div', { class: id === 'stick' ? 'tce-ctl tce-stick' : 'tc tce-ctl' + (spec?.corner ? ' sq' : ''), 'data-ctl': id, 'aria-label': NAMES[id] ?? id },
      id === 'stick' ? h('div', { class: 'stick-knob' }) : h('img', { src: iconUrl(spec!.icon, id === 'mantle' ? '#d4d0ff' : '#f6dea0'), alt: '', draggable: 'false' }),
      h('div', { class: 'lbl' }, NAMES[id] ?? id));
    els[id] = el;
    stage.appendChild(el);
  }
  const selName = h('b', { class: 'tce-name' });
  const size = h('input', { type: 'range', min: String(S_MIN), max: String(S_MAX), step: '0.05', 'data-nav': '', 'data-k': 'ed_size', 'aria-label': 'Size of the selected control' }) as HTMLInputElement;
  const all = h('input', { type: 'range', min: '0.8', max: '1.3', step: '0.05', 'data-nav': '', 'data-k': 'ed_all', 'aria-label': 'Size of every control' }) as HTMLInputElement;
  const fade = h('input', { type: 'range', min: '0.3', max: '1', step: '0.05', 'data-nav': '', 'data-k': 'ed_op', 'aria-label': 'Opacity' }) as HTMLInputElement;
  const panel = h('div', { class: 'tce-panel' },
    h('div', { class: 'tce-head' }, h('span', null, 'Drag to move · pinch to resize'), selName),
    h('label', { class: 'tce-row' }, h('span', null, 'Size'), size),
    h('label', { class: 'tce-row' }, h('span', null, 'All'), all),
    h('label', { class: 'tce-row' }, h('span', null, 'Opacity'), fade),
    h('div', { class: 'tce-acts' },
      btn('Reset to default', () => {
        for (const k of Object.keys(work)) delete work[k];
        scale = TOUCH_DEFAULTS.touchScale;
        opacity = TOUCH_DEFAULTS.touchOpacity;
        place();
      }, 'btn small', { 'data-k': 'ed_reset' }),
      btn('Move panel', () => panel.classList.toggle('low'), 'btn small', { 'data-k': 'ed_panel' }),
      btn('Done', () => done(), 'btn small primary', { 'data-k': 'ed_done' }),
    ),
  );
  const el = h('div', { class: 'tc-editor' }, stage, panel);
  rootEl = el;

  const W = () => window.innerWidth, H = () => window.innerHeight;
  const sizeOf = (id: string) => work[id]?.s ?? 1;
  /** Write a control's place from its on-screen centre, kept to where play would keep it. */
  const setCentre = (id: string, cx: number, cy: number, s: number) => {
    const w = W(), hh = H();
    work[id] = { x: (lh ? w - cx : cx) / w, y: cy / hh, s };
    const p = controlSpot(id, w, hh, scale, work, lh);
    work[id].x = (lh ? w - p.cx : p.cx) / w;
    work[id].y = p.cy / hh;
  };
  const centre = { x: 0, y: 0 };
  const centreOf = (id: string) => {
    const p = controlSpot(id, W(), H(), scale, work, lh);
    centre.x = p.cx;
    centre.y = p.cy;
    return centre;
  };
  function place() {
    const w = W(), hh = H();
    for (const id of ids) {
      const p = controlSpot(id, w, hh, scale, work, lh);
      const e = els[id];
      e.style.left = p.cx - p.r + 'px';
      e.style.top = p.cy - p.r + 'px';
      e.style.width = e.style.height = p.r * 2 + 'px';
      if (id === 'stick') (e.firstChild as HTMLElement).style.transform = `scale(${p.r / STICK_R})`;
      e.style.opacity = String(opacity);
      e.classList.toggle('sel', id === sel);
    }
    const k = islandKeepOut(w, hh);
    island.style.display = k ? '' : 'none';
    if (k) {
      island.style.left = k.x0 + 'px';
      island.style.top = k.y0 + 'px';
      island.style.width = k.x1 - k.x0 + 'px';
      island.style.height = k.y1 - k.y0 + 'px';
    }
    selName.textContent = `${NAMES[sel] ?? sel} · ${Math.round(sizeOf(sel) * 100)}%`;
    size.value = String(sizeOf(sel));
    all.value = String(scale);
    fade.value = String(opacity);
  }
  size.addEventListener('input', () => {
    const c = centreOf(sel);
    setCentre(sel, c.x, c.y, parseFloat(size.value));
    place();
  });
  all.addEventListener('input', () => { scale = parseFloat(all.value); place(); });
  fade.addEventListener('input', () => { opacity = parseFloat(fade.value); place(); });

  // Fingers on the stage: one drags the control it landed on, a second pinches it.
  const pts = new Map<number, { x: number; y: number }>();
  let dragId: number | null = null, offX = 0, offY = 0, pinch0 = 0, pinchS = 1;
  const spread = () => {
    let a: { x: number; y: number } | null = null, d = 0;
    for (const q of pts.values()) {
      if (a) d = Math.hypot(q.x - a.x, q.y - a.y);
      else a = q;
    }
    return d;
  };
  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    const hit = (e.target as HTMLElement).closest('[data-ctl]') as HTMLElement | null;
    if (pts.size === 1 && hit) {
      sel = hit.dataset.ctl!;
      const c = centreOf(sel);
      dragId = e.pointerId;
      offX = e.clientX - c.x;
      offY = e.clientY - c.y;
      place();
    } else if (pts.size === 2) {
      dragId = null;
      pinch0 = Math.max(10, spread());
      pinchS = sizeOf(sel);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const q = pts.get(e.pointerId);
    if (!q) return;
    q.x = e.clientX;
    q.y = e.clientY;
    if (pts.size >= 2 && pinch0 > 0) {
      const c = centreOf(sel);
      setCentre(sel, c.x, c.y, Math.max(S_MIN, Math.min(S_MAX, pinchS * (spread() / pinch0))));
      place();
    } else if (e.pointerId === dragId) {
      setCentre(sel, e.clientX - offX, e.clientY - offY, sizeOf(sel));
      place();
    }
  });
  const lift = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (e.pointerId === dragId) dragId = null;
    if (pts.size < 2) pinch0 = 0;
  };
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  stage.addEventListener('lostpointercapture', lift);
  stage.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const onResize = () => setTimeout(place, 50);
  window.addEventListener('resize', onResize);

  function done() {
    if (!rootEl) return;
    settings.touchLayout = work;
    settings.touchScale = scale;
    settings.touchOpacity = opacity;
    saveSettings();
    window.removeEventListener('resize', onResize);
    popLayer(el);
    rootEl = null;
    onClose?.();
  }

  document.getElementById('ui')!.appendChild(el);
  place();
  pushLayer({ el, onBack: done });
}
