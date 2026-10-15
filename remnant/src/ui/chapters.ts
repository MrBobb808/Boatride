// Pause-menu Chapters tab: travel to any chapter you have reached, begin the
// next one, or step into the training grounds (the Trial of the Remnant).

import { G } from '../game/ctx';
import { h, btn } from './dom';
import { chapterOf } from '../game/rooms';
import { CHAPTERS, chapterOpen, travelToChapter, trainingOpen, trainingStarts, startTraining } from '../game/chapters';

export function chaptersTab(close: () => void): HTMLElement {
  const W = G.world;
  const s = G.save;
  const busy = W.bossActive || W.transitioning;
  const here = chapterOf(W.room.id);
  const rows = CHAPTERS.map((c) => {
    const open = chapterOpen(c);
    const status = c.done() ? 'Complete' : c.reached() ? (here === c.n ? 'You are here' : 'In progress') : open ? 'Ready to begin' : `Locked: finish Chapter ${CHAPTERS[c.n - 2].roman} first`;
    const action = open && !busy
      ? btn(c.reached() ? 'Travel' : 'Begin', () => { close(); travelToChapter(c); }, 'btn small', { 'data-k': 'ch_' + c.n })
      : null;
    return h('div', { class: 'row-item ch-row', style: open ? '' : 'opacity:0.5' },
      h('div', { class: 'ch-num' }, c.roman),
      h('div', { class: 'ch-text' },
        h('b', null, c.title),
        h('span', { class: 'muted' }, c.blurb),
        h('small', null, `${status} · level ${c.level}+`),
      ),
      action,
    );
  });
  const best = Number(s.flags.trial_best ?? 0);
  const training = trainingOpen()
    ? h('div', { class: 'box' },
      h('h3', null, 'Training Grounds'),
      h('p', { class: 'muted' }, 'Endless waves of stronger and stronger foes in the Trial of the Remnant. Every foe pays experience scaled to your level, with rewards every five waves. Leave by the west door to come back here.'),
      h('div', { class: 'ch-waves' },
        busy ? h('span', { class: 'muted' }, 'Not during a boss fight.') : trainingStarts().map((w) => btn(w === 1 ? 'Start at wave 1' : `Wave ${w}`, () => { close(); startTraining(w); }, 'btn small', { 'data-k': 'tw_' + w })),
      ),
      best ? h('small', { class: 'muted' }, `Best: wave ${best}. Reach waves 10, 20, 30… to start from them.`) : null,
    )
    : null;
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Chapters'), h('div', { class: 'list' }, rows)),
    training,
  );
}
