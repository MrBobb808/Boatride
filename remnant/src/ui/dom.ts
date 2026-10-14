// Tiny DOM helpers and spatial navigation, so every menu works with touch,
// mouse, keyboard and controller alike.

import { input, type Action } from '../core/input';
import { sfx } from '../audio/audio';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') {
        const ev = k.slice(2).toLowerCase();
        if (ev === 'click') {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            // Ghost-click guard: a tap that opened a layer must not also press
            // whatever button appears under the finger.
            if (performance.now() - lastLayerAt < 380) return;
            (v as (e: Event) => void)(e);
          });
        } else el.addEventListener(ev, v as EventListener);
      } else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  const add = (c: Child | Child[]) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c === null || c === undefined || c === false) return;
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function btn(label: Child | Child[], onClick: () => void, cls = 'btn', attrs: Attrs = {}) {
  return h('button', {
    class: cls, 'data-nav': '', type: 'button', ...attrs,
    onclick: () => {
      if ((attrs as { disabled?: boolean }).disabled) return;
      sfx('ui');
      onClick();
    },
  }, label);
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ---------------------------------------------------------------- layers & navigation

interface Layer {
  el: HTMLElement;
  onBack?: () => void;
  onAction?: (a: Action) => boolean;
}

const stack: Layer[] = [];
let lastLayerAt = 0;

export function pushLayer(l: Layer) {
  stack.push(l);
  lastLayerAt = performance.now();
  setTimeout(() => focusFirst(l.el), 30);
}
export function popLayer(el: HTMLElement) {
  const i = stack.findIndex((l) => l.el === el);
  if (i >= 0) stack.splice(i, 1);
  el.remove();
  const top = stack[stack.length - 1];
  if (top && !top.el.contains(document.activeElement)) focusFirst(top.el);
}
export function topLayer() {
  return stack[stack.length - 1] ?? null;
}
export function layerCount() {
  return stack.length;
}

export function focusFirst(root: HTMLElement) {
  if (input.lastDevice === 'touch') return;
  const el = (root.querySelector('[data-autofocus]') as HTMLElement) ?? (root.querySelector('[data-nav]:not([disabled])') as HTMLElement);
  el?.focus({ preventScroll: false });
}

function navCandidates(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-nav]:not([disabled])')).filter((e) => e.offsetParent !== null);
}

function move(dir: 'left' | 'right' | 'up' | 'down') {
  const top = topLayer();
  if (!top) return;
  const els = navCandidates(top.el);
  if (!els.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !top.el.contains(cur) || !els.includes(cur)) {
    els[0].focus();
    return;
  }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best: HTMLElement | null = null;
  let bs = Infinity;
  for (const e of els) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect();
    const ex = q.left + q.width / 2, ey = q.top + q.height / 2;
    const dx = ex - cx, dy = ey - cy;
    let main = 0, cross = 0;
    if (dir === 'right') { if (dx <= 4) continue; main = dx; cross = Math.abs(dy); }
    if (dir === 'left') { if (dx >= -4) continue; main = -dx; cross = Math.abs(dy); }
    if (dir === 'down') { if (dy <= 4) continue; main = dy; cross = Math.abs(dx); }
    if (dir === 'up') { if (dy >= -4) continue; main = -dy; cross = Math.abs(dx); }
    const score = main + cross * 2.2;
    if (score < bs) { bs = score; best = e; }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    sfx('ui', { vol: 0.5 });
  }
}

export function installNav() {
  input.onAction((a) => {
    const top = topLayer();
    if (!top) return;
    if (input.lastDevice === 'touch') return;
    if (top.onAction && top.onAction(a)) return;
    const cur = document.activeElement as HTMLInputElement | null;
    if (cur && cur.tagName === 'INPUT' && cur.type === 'range' && (a === 'left' || a === 'right')) {
      const step = parseFloat(cur.step || '0.05');
      cur.value = String(Math.min(parseFloat(cur.max), Math.max(parseFloat(cur.min), parseFloat(cur.value) + (a === 'right' ? step : -step))));
      cur.dispatchEvent(new Event('input'));
      return;
    }
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') move(a);
    else if (a === 'confirm') {
      if (cur && top.el.contains(cur) && cur.hasAttribute('data-nav')) {
        if (cur.tagName === 'INPUT') return;
        cur.click();
      }
    } else if (a === 'back') {
      top.onBack?.();
    }
  });
}
