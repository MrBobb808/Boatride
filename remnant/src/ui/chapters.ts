// Pause-menu Chapters tab: travel to any chapter you have reached, begin the
// next one, or step into the training grounds (the Trial of the Remnant).

import { G } from '../game/ctx';
import { h, btn } from './dom';
import { ITEMS, TRIAL_REWARDS, RARITY_NAMES, RARITY_COLORS, SLOT_NAMES } from '../game/data';
import { chapterOf } from '../game/rooms';
import { openLeaderboard } from './leaderboard';
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
      h('h3', null, 'The Trial: endless rounds'),
      h('p', { class: 'muted' }, 'Survive round after round of foes that grow stronger, faster and more numerous. Every fifth round the Pack runs; every tenth a Champion comes. Fallen foes sometimes drop a blessing. The run ends when you fall, and runs from round 1 go on the leaderboard. Every foe pays experience scaled to your level.'),
      h('p', { class: 'muted' }, 'Every ten cleared waves guarantees a powerful weapon or armor piece directly in Equipment, and the next sector changes the environment and platforms. Leave through Chapters when you are ready.'),
      h('div', { class: 'list trial-rewards' }, TRIAL_REWARDS.map((id, i) => {
        const wave = (i + 1) * 10, item = ITEMS[id], earned = (s.trialMilestones ?? []).includes(wave);
        return h('div', { class: 'row-item', 'data-wave': String(wave) },
          h('span', { class: 'tag' }, `WAVE ${wave}`),
          h('div', null, h('b', { style: `color:${RARITY_COLORS[item.rarity ?? 0]}` }, item.name),
            h('div', { class: 'sub' }, `${RARITY_NAMES[item.rarity ?? 0]} · ${SLOT_NAMES[item.slot as keyof typeof SLOT_NAMES]} · ${earned ? 'Claimed' : 'Guaranteed reward'}`)));
      })),
      h('small', { class: 'muted' }, 'Beyond wave 100: Worldbreaker, Eternal Bastion and Heart of Ascendancy repeat with higher Ascension ranks. Each rank adds 15% base gear power, up to +1500%.'),
      h('div', { class: 'ch-waves' },
        busy ? h('span', { class: 'muted' }, 'Not during a boss fight.') : trainingStarts().map((w) => btn(w === 1 ? 'Start at round 1' : `Round ${w} (unranked)`, () => { close(); startTraining(w); }, 'btn small' + (w === 1 ? ' primary' : ''), { 'data-k': 'tw_' + w })),
        btn('Leaderboard', () => openLeaderboard(), 'btn small', { 'data-k': 'tw_board' }),
      ),
      best ? h('small', { class: 'muted' }, `Best: round ${best}. Reach rounds 10, 20, 30… to practise from them.`) : null,
    )
    : null;
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Chapters'), h('div', { class: 'list' }, rows)),
    training,
    trainingOpen() ? h('div', { class: 'box boss-trial' },
      h('div', { class: 'eyebrow' }, 'Endless challenge'),
      h('h3', null, 'The Boss Gauntlet'),
      h('p', { class: 'muted' }, 'One chapter boss at a time. The Gilded Idol, Gatekeeper, Crimson Marshal, Locust King, Image of Gold and Weigher repeat forever. Each round adds 22% health and 10% damage; attacks gradually accelerate. No ordinary enemies. Recover 20% health between fights; earn a Balm and loot each full cycle. Campaign progress stays intact.'),
      h('div', { class: 'ch-waves' },
        busy ? h('span', { class: 'muted' }, 'Not during a boss fight.') : trainingStarts(true).map((w) => btn(w === 1 ? 'Start boss round 1' : `Boss round ${w} (unranked)`, () => { close(); startTraining(w, true); }, 'btn small' + (w === 1 ? ' primary' : ''), { 'data-k': 'bt_' + w })),
        btn('Boss leaderboard', () => openLeaderboard(true), 'btn small', { 'data-k': 'bt_board' }),
      ),
      h('small', { class: 'muted' }, `Best: ${Number(s.flags.boss_trial_best ?? 0)} bosses defeated. Records are separate from survival.`),
    ) : null,
  );
}
