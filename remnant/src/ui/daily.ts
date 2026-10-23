// The daily challenge's entry in the Chapters tab, its board, and its result card.

import { G } from '../game/ctx';
import { h, btn, pushLayer, popLayer } from './dom';
import { holdUI } from './ui';
import { input } from '../core/input';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { settings, saveSettings } from '../core/settings';
import { formatTime } from '../core/math';
import { ITEMS } from '../game/data';
import { iconUrl } from './icons';
import { dailyFor, loadDaily, rankedUsed, renameDaily, dailyRewardClaimed, DAILY_MODS, DAILY_WAVES, DAILY_REWARD, type DailyEntry, type DailyDef } from '../game/daily';
import { startDaily, trainingOpen } from '../game/chapters';

const root = () => document.getElementById('ui')!;
const rewardText = `${DAILY_REWARD.silver} silver, ${DAILY_REWARD.covenant_fragment} ${ITEMS.covenant_fragment.name}s and a ${ITEMS.radiant_core.name}`;

function rules(def: DailyDef) {
  return h('div', { class: 'daily-rules' }, def.mods.map((m) => h('div', { class: 'daily-rule', 'data-mod': m },
    h('img', { src: iconUrl(DAILY_MODS[m].icon, '#f6dea0'), alt: '' }),
    h('div', null, h('b', null, DAILY_MODS[m].name), h('span', { class: 'muted' }, DAILY_MODS[m].desc)))));
}

function rows(list: (DailyEntry & { mine?: boolean })[], empty: string) {
  if (!list.length) return h('div', { class: 'muted', style: 'padding:8px 0' }, empty);
  return h('div', { class: 'board daily-board' },
    h('div', { class: 'b-row b-head' }, h('span', null, '#'), h('span', null, 'Name'), h('span', null, 'Score'), h('span', null, 'Waves'), h('span', null, 'Time')),
    list.map((e, i) => h('div', { class: 'b-row' + (e.mine ? ' mine' : '') },
      h('span', null, `${i + 1}`), h('span', { class: 'b-name' }, e.name || 'Elior'),
      h('b', null, `${e.score}`), h('span', null, `${e.waves}/${DAILY_WAVES}`), h('span', null, formatTime(e.time)))));
}

/** The Chapters tab's daily box. */
export function dailyBox(close: () => void, busy: boolean): HTMLElement | null {
  if (!trainingOpen()) return null;
  const def = dailyFor(), used = rankedUsed(def.key), top = loadDaily(def.key)[0];
  const R = G.world.story.ch3.rounds, running = R.active && !!R.daily;
  return h('div', { class: 'box daily', 'data-daily': def.key },
    h('div', { class: 'eyebrow' }, `Daily challenge · ${def.key}`),
    h('h3', null, 'Today\'s Trial'),
    h('p', { class: 'muted' }, `${DAILY_WAVES} seeded waves in the arena, the same for everyone today, under ${def.mods.length === 1 ? 'one rule' : 'two rules'}. Score is waves held × 100, doubled at best by a fast full clear (a bonus that shrinks to nothing at ten minutes). One ranked attempt a day; practise as often as you like. Nothing else is earned or lost: experience, loot and your campaign stay as they are.`),
    rules(def),
    h('div', { class: 'ch-waves' },
      btn(used ? 'Ranked attempt used' : 'Ranked attempt', () => { close(); startDaily(true); }, 'btn small primary', { disabled: busy || used || running, 'data-k': 'daily_ranked' }),
      btn('Practice (unranked)', () => { close(); startDaily(false); }, 'btn small', { disabled: busy || running, 'data-k': 'daily_practice' }),
      btn('Today\'s board', () => openDailyBoard(), 'btn small', { 'data-k': 'daily_board' }),
    ),
    h('small', { class: 'muted', 'data-k': 'daily_status' },
      `${top ? `Best today: ${top.score} (${top.waves}/${DAILY_WAVES} waves). ` : ''}${dailyRewardClaimed(def.key) ? 'Today\'s reward claimed. A new trial comes at midnight.' : `First full clear today: ${rewardText}.`}`),
  );
}

export function openDailyBoard() {
  const def = dailyFor();
  const card = h('div', { class: 'chapter panel scroll' },
    h('div', { class: 'eyebrow' }, `The daily challenge · ${def.key}`),
    h('h2', null, 'TODAY\'S BOARD'),
    h('p', { class: 'muted' }, 'One ranked attempt per day on this device. Highest score first.'),
    rules(def),
    rows(loadDaily(def.key).slice(0, 10), 'No ranked runs today yet.'),
    h('div', { class: 'row', style: 'justify-content:center;margin-top:10px' }, btn('Close', () => close(), 'btn primary', { 'data-autofocus': '', 'data-k': 'daily_close' })),
  );
  const layer = h('div', { class: 'layer dim' }, card);
  root().appendChild(layer);
  const close = () => popLayer(layer);
  pushLayer({ el: layer, onBack: close });
}

export interface DailyStats { waves: number; time: number; kills: number; level: number; score: number; done: boolean; ranked: boolean; reward: boolean; def: DailyDef }

/** The end of a daily run: its score, today's board, and the reward on a first clear. */
export function dailyOver(st: DailyStats, entry: DailyEntry | null, place: number, best: boolean): Promise<'again' | 'leave'> {
  return new Promise((resolve) => {
    holdUI(1);
    music.stop(1.2);
    root().querySelectorAll('.banner').forEach((b) => b.remove());
    sfx(st.done ? 'lootRare' : 'death', st.done ? { vol: 0.6 } : { vol: 0.5, pitch: 0.7 });
    const stat = (label: string, v: string) => h('div', { class: 'go-stat' }, h('b', null, v), h('span', null, label));
    const nameBox = entry ? h('input', { type: 'text', maxlength: '16', value: entry.name, 'data-nav': '', 'data-k': 'go_name', 'aria-label': 'Name on the board' }) as HTMLInputElement : null;
    const card = h('div', { class: 'chapter panel scroll gameover daily-over' },
      h('div', { class: 'go-cols' },
        h('div', { class: 'go-left' },
          h('div', { class: 'eyebrow' }, `Daily challenge · ${st.def.key}${st.ranked ? '' : ' · practice'}`),
          h('h2', null, st.done ? 'TRIAL WON' : 'THE TRIAL ENDS'),
          h('div', { class: 'go-round' }, `${st.score}`),
          h('div', { class: 'go-sub' }, 'SCORE'),
          best ? h('div', { class: 'go-best' }, 'BEST TODAY') : null,
          h('div', { class: 'go-stats' }, stat('Waves', `${st.waves}/${DAILY_WAVES}`), stat('Time', formatTime(st.time)), stat('Kills', `${st.kills}`)),
          st.reward ? h('p', { class: 'up', 'data-k': 'daily_reward' }, `Today's reward: ${rewardText}.`) : null,
        ),
        h('div', { class: 'go-right' },
          entry
            ? h('div', { class: 'go-name' }, h('span', null, `Place ${place} today as`), nameBox)
            : h('p', { class: 'muted', 'data-k': 'daily_unranked' }, st.ranked ? 'Clear at least one wave to get on today\'s board.' : 'Practice runs are unranked.'),
          rows(loadDaily(st.def.key).slice(0, 5).map((e) => ({ ...e, mine: e.id === entry?.id })), 'No ranked runs today yet.'),
        ),
      ),
      h('p', { class: 'muted go-verse' }, '“This is the day which the LORD hath made; we will rejoice and be glad in it.” Psalm 118:24 (KJV)'),
      h('div', { class: 'row', style: 'justify-content:center;gap:10px;margin-top:8px' },
        btn('Practise again', () => done('again'), 'btn primary', { 'data-autofocus': '', 'data-k': 'go_again' }),
        btn('Leave the arena', () => done('leave'), 'btn', { 'data-k': 'go_leave' })),
    );
    const layer = h('div', { class: 'layer death' }, card);
    root().appendChild(layer);
    setTimeout(() => { card.scrollTop = 0; }, 60);
    const done = (c: 'again' | 'leave') => {
      if (entry && nameBox) {
        const name = nameBox.value.trim().slice(0, 16) || 'Elior';
        if (name !== entry.name) renameDaily(entry.date, entry.id, name);
        if (name !== settings.name) { settings.name = name; saveSettings(); }
      }
      popLayer(layer);
      holdUI(-1);
      input.flush();
      resolve(c);
    };
    pushLayer({ el: layer, onBack: () => done('leave') });
  });
}
