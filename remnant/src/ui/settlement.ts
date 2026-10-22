// The notice board at Remnant's Rest: how the settlement stands, and the
// residents' requests to accept and turn in. Same card as the altar menu.

import { G } from '../game/ctx';
import { h, btn, pushLayer, popLayer, clear, focusFirst } from './dom';
import { sfx, audio } from '../audio/audio';
import { input } from '../core/input';
import { NPC_DEFS } from '../game/props';
import { REST_QUESTS, REST_TIERS, questPosted, questState, questReady, restTier, restNext, restResidents, restSave } from '../game/settlement';

let open = false;

function pause(on: boolean) {
  G.paused = on;
  if (audio.ready) audio.setMuffled(on);
  if (!on) input.flush();
}

export function openBoard() {
  if (open || G.world.room.id !== 'remnant_rest') return;
  open = true;
  pause(true);
  sfx('uiOpen');
  const card = h('div', { class: 'choice-card panel scroll altar', 'data-k': 'rest_board' });
  const layer = h('div', { class: 'layer dim' }, card);
  const close = () => {
    if (!open) return;
    open = false;
    popLayer(layer);
    pause(false);
  };
  const render = () => {
    clear(card);
    const tier = restTier(), titles = restSave().titles, next = restNext(), people = restResidents().length;
    const list = REST_QUESTS.filter((q) => questPosted(q) || questState(q));
    card.append(
      h('div', { class: 'eyebrow' }, 'Remnant\'s Rest · the board'),
      h('h2', { class: 'title-text', 'data-k': 'rest_tier' }, REST_TIERS[tier].name),
      h('p', { class: 'muted' }, `${REST_TIERS[tier].sub} ${people} familiar faces live here.${next ? ` The Rest will grow with ${next}.` : ' The Rest is all it hoped to be.'}`),
      h('p', { class: 'muted', 'data-k': 'rest_titles' }, titles.length ? 'Titles: ' + titles.join(' · ') : 'Help the residents to earn titles.'),
      h('div', { class: 'opts' },
        list.length ? list.map((q) => {
          const st = questState(q), [have, want] = st ? q.progress(st) : [0, 0];
          const giver = NPC_DEFS[q.giver]?.name ?? q.giver;
          const status = !st ? 'Posted' : st.done ? 'Done' : questReady(q) ? 'Ready to turn in' : `${Math.min(have, want)} / ${want}`;
          const reward = [q.reward.silver ? `${q.reward.silver} silver` : '', ...Object.entries(q.reward.mats ?? {}).map(([m, n]) => `${n} ${m.replace(/_/g, ' ')}`), q.reward.title ? `title "${q.reward.title}"` : ''].filter(Boolean).join(', ');
          const label = [h('b', null, q.title), h('span', null, `${giver}: ${q.ask}`), h('span', { style: 'display:block;margin-top:4px' }, `${status} · Reward: ${reward}`)];
          if (st?.done) return btn(label, () => {}, 'btn opt', { disabled: true, 'data-k': 'rq_' + q.id });
          if (!st) return btn(label, () => { if (G.world.story.rest.accept(q.id)) render(); }, 'btn opt', { 'data-k': 'rq_' + q.id });
          return btn(label, () => { if (G.world.story.rest.turnIn(q.id)) render(); }, 'btn opt', { disabled: !questReady(q), 'data-k': 'rq_' + q.id });
        }) : h('p', { class: 'muted' }, 'No requests yet. Come back as the Rest grows.'),
        btn([h('b', null, 'Leave the board')], close, 'btn opt', { 'data-k': 'rest_close' }),
      ),
    );
    focusFirst(card);
  };
  document.getElementById('ui')!.appendChild(layer);
  render();
  pushLayer({ el: layer, onBack: close });
}

export const boardOpen = () => open;
