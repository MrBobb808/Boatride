// First-time coaching: when a system first matters (a foe in reach, the first
// Echo, a full Mantle gauge, a sub-weapon), a small card names the control,
// pulses its button and waits for the player to try it. Optional and
// skippable; each lesson is shown once per journey (SaveData.coached) and
// Settings → Replay tutorials arms them again. Checks are flag reads each
// frame and a throttled scan for nearby foes: nothing allocates per frame.

import { G } from '../game/ctx';
import { input, type Action } from '../core/input';
import { settings } from '../core/settings';
import { sfx } from '../audio/audio';
import { MANTLE_LV } from '../game/mantle';
import { SUBS, type SubId } from '../game/subweapons';
import { h, btn, layerCount } from './dom';
import { iconUrl } from './icons';
import { isMenuOpen } from './menus';

interface Lesson {
  id: string;
  title: string;
  text: string;
  act: Action;
  /** The touch button's label (its aria-label), to light it up, and its icon. */
  touch: string;
  icon: string;
  steps: string[];
  /** Whether the lesson's moment has come (checked a few times a second). */
  ready: () => boolean;
  /** Steps completed so far (checked every frame while the card is up). */
  progress: () => number;
}

const near = { t: 0, foe: false };
/** A foe Elior could fight is close: the moment to teach fighting. */
function foeNear() { return near.foe; }
const s = () => G.save;
const p = () => G.world.player;
let heartsAt = 0;
let orders: (string | undefined)[] = [];

function ordersChanged() {
  const list = s().echoes;
  for (let i = 0; i < list.length && i < orders.length; i++) if (list[i].order !== orders[i]) return true;
  return false;
}
function squadOut() {
  for (const e of G.world.echoes) if (!e.remove && e.despawn <= 0 && e.hp > 0) return true;
  return false;
}
const done = (id: string) => !!s().coached?.[id];

export const LESSONS: Lesson[] = [
  { id: 'combo', title: 'Combos', text: 'Press Attack again as each strike lands: three in a row make a full combo.', act: 'attack', touch: 'Attack', icon: 'attack',
    steps: ['Land a 3-hit combo'], ready: foeNear, progress: () => (p().comboHits >= 3 ? 1 : 0) },
  { id: 'dodge', title: 'Dodge', text: 'Dodge to slip through a blow. You cannot be hurt mid-dodge.', act: 'dodge', touch: 'Dodge', icon: 'dodge',
    steps: ['Dodge once'], ready: () => done('combo') && foeNear(), progress: () => (p().state === 'dodge' || p().state === 'airdash' ? 1 : 0) },
  { id: 'parry', title: 'Parry', text: 'Press Parry the instant a blow lands to turn it aside, then strike back while they reel.', act: 'parry', touch: 'Parry', icon: 'parry',
    steps: ['Parry a blow'], ready: () => done('dodge') && foeNear(), progress: () => (p().counterT > 0 ? 1 : 0) },
  { id: 'echo', title: 'Echoes', text: 'Open the command wheel with Echoes. Summon your squad, then choose Orders… and give one.', act: 'echo', touch: 'Echoes', icon: 'echo',
    steps: ['Summon an Echo', 'Give an order'], ready: () => s().echoes.length > 0,
    progress: () => (squadOut() ? (ordersChanged() ? 2 : 1) : 0) },
  { id: 'mantle', title: 'Shadow Mantle', text: 'Your Mantle gauge is full. Transform: you strike harder, take less harm and blink to your foes.', act: 'transform', touch: 'Mantle', icon: 'mantle',
    steps: ['Put on the Mantle'], ready: () => s().level >= MANTLE_LV && (s().mantle ?? 0) >= 100, progress: () => (p().mantleT > 0 ? 1 : 0) },
  { id: 'sub', title: 'Sub-weapon', text: 'Throw your sub-weapon. Each throw costs hearts; break lamps along the walls for more.', act: 'sub', touch: 'Sub', icon: 'dagger',
    steps: ['Throw it once'], ready: () => !!s().sub && (s().hearts ?? 0) >= (SUBS[s().sub as SubId]?.cost ?? 1), progress: () => ((s().hearts ?? 0) < heartsAt ? 1 : 0) },
];

let card: HTMLElement | null = null;
let stepsEl: HTMLElement;
let keyEl: HTMLElement;
let cur: Lesson | null = null;
let shown = 0;
let doneT = 0;
let rest = 4;
let lit: Element | null = null;

const quiet = () => G.inCutscene || G.paused || isMenuOpen() || layerCount() > 0 || G.world.transitioning || G.world.bossActive;

/** On touch, the button's own icon; with keys or a pad, the binding's name. */
function keyFace(l: Lesson) {
  const key = input.lastDevice === 'touch' ? '' : input.label(l.act);
  return key ? h('span', null, key) : h('img', { src: iconUrl(l.icon, '#f6dea0'), alt: l.touch });
}

function light(on: boolean) {
  lit?.classList.remove('coach-hl');
  lit = on && cur && input.lastDevice === 'touch' ? document.querySelector(`#touch .tc[aria-label="${cur.touch}"]`) : null;
  lit?.classList.add('coach-hl');
}

function renderSteps() {
  if (!cur) return;
  stepsEl.replaceChildren(...cur.steps.map((t, i) => h('li', { class: i < shown ? 'ok' : '' }, (i < shown ? '✓ ' : '◇ ') + t)));
}

function open(l: Lesson) {
  cur = l; shown = 0; doneT = 0;
  (s().coached ??= {})[l.id] = 1;
  heartsAt = s().hearts ?? 0;
  orders = s().echoes.map((e) => e.order);
  keyEl = h('div', { class: 'coach-key', 'aria-hidden': 'true' }, keyFace(l));
  stepsEl = h('ul', { class: 'coach-steps' });
  card = h('div', { class: 'coach', role: 'status', 'data-k': 'coach_' + l.id },
    keyEl,
    h('div', { class: 'coach-body' },
      h('div', { class: 'eyebrow' }, 'Try it · ' + l.title),
      h('p', null, l.text),
      stepsEl),
    btn('Skip', () => close(false), 'btn small coach-skip', { 'data-k': 'coach_skip', 'aria-label': 'Skip this tip' }));
  renderSteps();
  document.getElementById('ui')!.appendChild(card);
  light(true);
  sfx('ui', { vol: 0.5 });
}

function close(finished: boolean) {
  if (!cur || !card) return;
  if (finished) s().coached![cur.id] = 2;
  light(false);
  card.remove();
  card = null; cur = null; rest = finished ? 3 : 6;
}

// Scripted ?debug runs stay free of cards unless they ask for them with &coach.
const debugCoach = typeof location !== 'undefined' && new URLSearchParams(location.search).has('coach');

/** Called once a frame by the HUD. */
export function tickCoach(dt: number) {
  if (!G.save || !G.world?.player || (G.debug && !debugCoach)) return;
  if (settings.coach === false) { if (card) close(false); return; }
  const hush = quiet();
  if (card) {
    card.classList.toggle('hush', hush);
    if (hush) return;
    if (doneT > 0) { doneT -= dt; if (doneT <= 0) close(true); return; }
    const n = cur!.progress();
    if (n > shown) {
      shown = n; renderSteps();
      if (shown >= cur!.steps.length) { doneT = 1.4; card.classList.add('done'); light(false); sfx('uiConfirm'); }
    }
    return;
  }
  if (hush) return;
  if (rest > 0) { rest -= dt; return; }
  near.t -= dt;
  if (near.t <= 0) {
    near.t = 0.3;
    near.foe = false;
    const px = G.world.player.x, py = G.world.player.y;
    for (const e of G.world.ents) if (e.isFoe && !e.dying && !e.remove && !e.isBoss && Math.abs(e.x - px) < 220 && Math.abs(e.y - py) < 90) { near.foe = true; break; }
    for (const l of LESSONS) if (!done(l.id) && l.ready()) { open(l); break; }
  }
}

/** Settings → Replay tutorials: every lesson may play again on this journey. */
export function replayCoach() {
  if (card) close(false);
  if (G.save) G.save.coached = {};
  rest = 1;
}
