// The Trial's Game Over card and its leaderboards: this device's board, and
// in the claude.ai preview a shared one for everyone who plays there.

import { h, btn, pushLayer, popLayer } from './dom';
import { holdUI } from './ui';
import { input } from '../core/input';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { settings, saveSettings } from '../core/settings';
import { formatTime } from '../core/math';
import { loadBoard, renameRun, type RunEntry } from '../game/board';
import { pullBoard, cloudActive } from '../game/cloud';

export interface RunStats { rounds: number; kills: number; time: number; level: number; levels: number; from: number; bossOnly?: boolean; rematch?: boolean }

const root = () => document.getElementById('ui')!;

function rows(list: { name: string; rounds: number; kills: number; time: number; level: number; mine?: boolean }[], empty: string) {
  if (!list.length) return h('div', { class: 'muted', style: 'padding:8px 0' }, empty);
  return h('div', { class: 'board' },
    h('div', { class: 'b-row b-head' }, h('span', null, '#'), h('span', null, 'Name'), h('span', null, 'Round'), h('span', null, 'Kills'), h('span', null, 'Time')),
    list.map((e, i) => h('div', { class: 'b-row' + (e.mine ? ' mine' : '') },
      h('span', null, `${i + 1}`), h('span', { class: 'b-name' }, e.name || 'Elior'), h('b', null, `${e.rounds}`), h('span', null, `${e.kills}`), h('span', null, formatTime(e.time)))),
  );
}

/** The board tabs: this device, and everyone (only where a shared board exists). */
function boardBox(highlight: number | null, top = 10, bossOnly = false) {
  const box = h('div', { class: 'col' });
  let view: 'device' | 'all' = 'device';
  const render = () => {
    box.replaceChildren();
    const tabs = h('div', { class: 'modes' },
      btn('This device', () => { view = 'device'; render(); }, 'btn small' + (view === 'device' ? ' primary' : ''), { 'data-k': 'lb_dev' }),
      cloudActive() && !bossOnly ? btn('Everyone', () => { view = 'all'; render(); }, 'btn small' + (view === 'all' ? ' primary' : ''), { 'data-k': 'lb_all' }) : null,
    );
    box.appendChild(tabs);
    if (view === 'device') {
      box.appendChild(rows(loadBoard(bossOnly).slice(0, top).map((e) => ({ ...e, mine: e.id === highlight })), 'No ranked runs yet. Start from round 1 to get on this board.'));
    } else {
      const wait = h('div', { class: 'muted', style: 'padding:8px 0' }, 'Loading…');
      box.appendChild(wait);
      void pullBoard(20).then((list) => {
        if (view !== 'all') return;
        wait.replaceWith(rows((list ?? []).map((d) => ({
          name: String(d.name ?? 'Elior'), rounds: Number(d.rounds) || 0, kills: Number(d.kills) || 0, time: Number(d.time) || 0, level: Number(d.level) || 0, mine: !!d.me,
        })), list ? 'No one is on the shared board yet.' : 'The shared board could not be reached.'));
      });
    }
  };
  render();
  return box;
}

/** Open the leaderboard on its own (from the Chapters tab). */
export function openLeaderboard(bossOnly = false) {
  const card = h('div', { class: 'chapter panel scroll' },
    h('div', { class: 'eyebrow' }, bossOnly ? 'The Boss Gauntlet' : 'The Trial of the Remnant'),
    h('h2', null, 'LEADERBOARD'),
    h('p', { class: 'muted' }, bossOnly ? 'Ranked by bosses defeated. Only runs starting at round 1 are ranked. This board is separate from survival.' : 'Ranked by the round each run reached. Only runs that start at round 1 are ranked.'),
    boardBox(null, 10, bossOnly),
    h('div', { class: 'row', style: 'justify-content:center;margin-top:10px' }, btn('Close', () => close(), 'btn primary', { 'data-autofocus': '', 'data-k': 'lb_close' })),
  );
  const layer = h('div', { class: 'layer dim' }, card);
  root().appendChild(layer);
  const close = () => popLayer(layer);
  pushLayer({ el: layer, onBack: close });
}

/** "You survived N rounds": the end of a run. */
export function gameOver(st: RunStats, entry: RunEntry | null, place: number, best: boolean): Promise<'again' | 'leave'> {
  return new Promise((resolve) => {
    holdUI(1);
    music.stop(1.2);
    root().querySelectorAll('.banner').forEach((b) => b.remove());
    sfx('death', { vol: 0.5, pitch: 0.7 });
    const stat = (label: string, v: string) => h('div', { class: 'go-stat' }, h('b', null, v), h('span', null, label));
    let nameBox: HTMLInputElement | null = null;
    if (entry) {
      nameBox = h('input', { type: 'text', maxlength: '16', value: entry.name, 'data-nav': '', 'data-k': 'go_name', 'aria-label': 'Name on the board' }) as HTMLInputElement;
    }
    // Landscape phones get two columns: the result on the left, the board on the right.
    const card = h('div', { class: 'chapter panel scroll gameover' },
      h('div', { class: 'go-cols' },
        h('div', { class: 'go-left' },
          h('div', { class: 'eyebrow' }, st.rematch ? 'Original-form rematch' : st.bossOnly ? 'The Boss Gauntlet' : 'The Trial of the Remnant'),
          h('h2', null, st.rematch ? 'FORMS DEFEATED' : st.bossOnly ? 'BOSSES DEFEATED' : 'YOU SURVIVED'),
          h('div', { class: 'go-round' }, `${st.rounds}`),
          h('div', { class: 'go-sub' }, st.bossOnly ? `REACHED ROUND ${st.rounds + 1}` : st.rounds === 1 ? 'ROUND' : 'ROUNDS'),
          best ? h('div', { class: 'go-best' }, 'NEW BEST') : null,
          h('div', { class: 'go-stats' }, stat('Kills', `${st.kills}`), stat('Time', formatTime(st.time)), stat('Level', `${st.level}${st.levels > 0 ? ` (+${st.levels})` : ''}`)),
        ),
        h('div', { class: 'go-right' },
          entry
            ? h('div', { class: 'go-name' }, h('span', null, place > 0 ? `Place ${place} on this device as` : 'Ranked as'), nameBox)
            : h('p', { class: 'muted' }, st.rematch ? 'Original-form rematches are unranked. Your earned imprints are saved; absorb them in Echoes.' : `This run began at round ${st.from}, so it is not ranked. Start from round 1 to get on the board.`),
          st.rematch ? null : boardBox(entry?.id ?? null, 5, st.bossOnly),
        ),
      ),
      h('p', { class: 'muted go-verse' }, '“Be thou faithful unto death, and I will give thee a crown of life.” Revelation 2:10 (KJV)'),
      h('div', { class: 'row', style: 'justify-content:center;gap:10px;margin-top:8px' },
        btn('Again from round 1', () => done('again'), 'btn primary', { 'data-autofocus': '', 'data-k': 'go_again' }),
        btn(st.rematch ? 'Leave rematch' : st.bossOnly ? 'Leave the Gauntlet' : 'Leave the Trial', () => done('leave'), 'btn', { 'data-k': 'go_leave' })),
    );
    const layer = h('div', { class: 'layer death' }, card);
    root().appendChild(layer);
    // Focusing the button below must not leave the card scrolled past its top.
    setTimeout(() => { card.scrollTop = 0; }, 60);
    const done = (c: 'again' | 'leave') => {
      if (entry && nameBox) {
        const name = nameBox.value.trim().slice(0, 16) || 'Elior';
        if (name !== entry.name) renameRun(entry.id, name, st.bossOnly);
        if (name !== settings.name) {
          settings.name = name;
          saveSettings();
        }
      }
      popLayer(layer);
      holdUI(-1);
      input.flush();
      resolve(c);
    };
    pushLayer({ el: layer, onBack: () => done('leave') });
  });
}
