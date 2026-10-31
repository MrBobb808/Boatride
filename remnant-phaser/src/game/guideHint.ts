// The guide's "what now?" card (the HUD's objective chip, or O on a keyboard): the chapter's main quest, what to do
// next and where it is, the rooms between here and there, and every step still ahead to the chapter's boss.
import { QUESTS } from '../../../remnant/src/game/story';
import { CHAPTERS } from '../../../remnant/src/game/chapters';
import { ROOMS, chapterOf } from '../../../remnant/src/game/rooms';
import { FALLEN_CHAPTERS } from '../../../remnant/src/game/fallenChapters';
import { guidePoint, guideRoute, guideRoom } from '../../../remnant/src/game/guide';
import { h, btn, pushLayer, popLayer } from '../../../remnant/src/ui/dom';
import { holdUI } from '../../../remnant/src/ui/ui';
import { openMenu } from '../../../remnant/src/ui/menus';
import { input } from '../classic/shim/input';
import { sfx } from '../classic/shim/audio';
import { G } from '../classic/shim/ctx';

/** Each chapter's main quests, in story order. */
const MAIN: Record<number, string[]> = {
  1: ['m_expedition', 'm_dark', 'm_return'], 2: ['m_tower'], 3: ['m_valley'], 4: ['m_dura'], 5: ['m_feast'], 6: ['m_persia'],
  7: ['m_crown7'], 8: ['m_crown8'], 9: ['m_crown9'], 10: ['m_crown10'],
};

export interface Brief {
  chapter: string;
  quest: string | null;
  now: string;
  where: string | null;
  route: string[];
  ahead: string[];
}

/** What the card says: worked out fresh each time it opens. */
export function brief(): Brief {
  const s = G.save, here = G.world.room.id;
  const goal = guideRoom() ?? here, n = chapterOf(goal), ch = CHAPTERS.find((c) => c.n === n);
  const open = (id: string) => !!s.quests[id] && !s.quests[id].done;
  // The chapter the marker leads into decides the quest; failing that, the last main quest still open.
  const id = (MAIN[n] ?? []).find(open) ?? Object.values(MAIN).flat().reverse().find(open) ?? null;
  const q = id ? QUESTS.find((x) => x.id === id) : undefined, stage = id ? s.quests[id].stage : 0;
  const g = guidePoint(), route = guideRoute().map((r) => ROOMS[r]?.name ?? r);
  return {
    chapter: ch ? `Chapter ${ch.roman} · ${ch.title}` : 'The journey',
    quest: q?.title ?? null,
    now: q?.stages[Math.min(stage, q.stages.length - 1)] ?? (g ? 'Follow the trail of light.' : 'Nothing presses right now: explore, rest at an altar, or open Chapters to journey on.'),
    where: g ? g.target.label : null,
    route,
    ahead: id?.startsWith('m_crown') ? crownSteps(Number(id.slice(7))) : q ? q.stages.slice(stage + 1) : [],
  };
}

/** A Crown chapter's road to its boss, spelled out: each objective still to do after the next, then the throne. */
function crownSteps(n: number) {
  const c = FALLEN_CHAPTERS.find((x) => x.n === n);
  if (!c) return [];
  const verb = n === 7 ? 'Defeat' : n === 8 ? 'Cleanse' : n === 9 ? 'Release' : 'Relight';
  const left = c.objectives.filter((o) => !G.save.flags[o.flag]);
  return [
    ...left.slice(1).map((o) => `${verb} the ${o.name} in ${ROOMS[o.room]?.name ?? o.room}${n === 7 ? '' : ' (clear its guards first)'}.`),
    `With both done the throne is unsealed: rest at the altar on ${ROOMS[c.ridge]?.name ?? c.ridge}, then face ${c.name} in ${ROOMS[c.arena]?.name ?? c.arena}.`,
  ];
}

let open = false;
export const hintOpen = () => open;

/** Show the card. It holds the game still; Close, Back or a tap outside dismisses it. */
export function showHint() {
  if (open || !G.save || !G.world?.room) return;
  open = true;
  holdUI(1);
  const b = brief();
  const route = b.route.length > 1
    ? h('p', { class: 'hint-route' }, b.route.map((r, i) => (i ? ` → ${r}` : `${r} (you)`)).join(''))
    : b.where ? h('p', { class: 'hint-route' }, 'It is in this room. Follow the trail of light to it.') : null;
  const card = h('div', { class: 'choice-card hint-card panel scroll', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'What now', 'data-k': 'guide_card' },
    h('div', { class: 'eyebrow' }, b.chapter),
    h('h2', { class: 'title-text' }, b.quest ?? 'What now?'),
    h('p', { 'data-k': 'guide_now' }, b.now),
    b.where ? h('p', null, h('b', null, 'Head for: '), b.where) : null,
    route,
    b.ahead.length ? h('div', { class: 'eyebrow' }, 'Still ahead') : null,
    b.ahead.length ? h('ol', { class: 'hint-ahead' }, b.ahead.map((t) => h('li', null, t))) : null,
    h('p', { class: 'hint-tip' }, 'The trail of light streams toward where you need to go; when the goal is off screen, the arrow at the edge points to it.'),
    h('div', { class: 'row' },
      btn('Journal', () => { close(); openMenu('quests'); }, 'btn small', { 'data-k': 'guide_journal' }),
      btn('Close', () => close(), 'btn primary', { 'data-autofocus': '', 'data-k': 'guide_close' })),
  );
  const layer = h('div', { class: 'layer dim' }, card);
  document.getElementById('ui')!.appendChild(layer);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true; open = false;
    popLayer(layer); holdUI(-1); sfx('uiBack'); input.flush();
  };
  layer.addEventListener('pointerup', (e) => { if (e.target === layer) close(); });
  pushLayer({ el: layer, onBack: close });
  sfx('uiConfirm');
}
