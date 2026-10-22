// Story cards over the scene: the cinematic title card (game/cinema.ts) and the
// "Previously…" recap shown when a save is resumed after time away.

import { h, btn, pushLayer, popLayer } from './dom';
import { holdUI } from './ui';
import { input } from '../core/input';
import { sfx } from '../audio/audio';

let titleEl: HTMLElement | null = null;

/** Show a centred title card, or clear it with null. */
export function titleCard(title: string | null, sub = '') {
  if (titleEl) {
    const el = titleEl;
    titleEl = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 700);
  }
  if (!title) return;
  titleEl = h('div', { class: 'title-card' }, h('div', { class: 't-line' }), h('div', { class: 't-title' }, title), sub ? h('div', { class: 't-sub' }, sub) : null, h('div', { class: 't-line' }));
  document.getElementById('ui')!.appendChild(titleEl);
}

export interface RecapText {
  chapter: string;
  title: string;
  lines: string[];
}

let recapOpen = false;
export const recapShowing = () => recapOpen;

/** The recap card. Holds the game still; any press, tap or the button skips it, or it leaves by itself. */
export function showRecap(r: RecapText) {
  return new Promise<void>((resolve) => {
    if (recapOpen) return resolve();
    recapOpen = true;
    holdUI(1);
    const card = h('div', { class: 'recap panel', role: 'dialog', 'aria-label': 'Previously' },
      h('div', { class: 'eyebrow' }, 'Previously…'),
      h('div', { class: 'r-chapter' }, r.chapter),
      h('h2', null, r.title),
      ...r.lines.map((l) => h('p', null, l)),
      h('div', { class: 'row' }, btn('Continue', () => close(), 'btn primary', { 'data-autofocus': '', 'data-k': 'recap_skip' })),
    );
    const layer = h('div', { class: 'layer dim recap-layer' }, card);
    document.getElementById('ui')!.appendChild(layer);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      recapOpen = false;
      clearTimeout(timer);
      off();
      popLayer(layer);
      holdUI(-1);
      sfx('uiConfirm');
      input.flush();
      resolve();
    };
    const timer = window.setTimeout(close, 14000);
    // Skippable from anywhere: a tap outside the card, or any game button.
    layer.addEventListener('pointerup', (e) => {
      if (!(e.target as HTMLElement).closest('button')) close();
    });
    const off = input.onAction((a, repeat) => {
      if (!repeat && (a === 'attack' || a === 'jump' || a === 'interact' || a === 'back' || a === 'menu')) close();
    });
    pushLayer({ el: layer, onBack: close });
  });
}
