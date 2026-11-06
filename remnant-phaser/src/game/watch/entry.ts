// The way into the Watch from a journey: a row in the pause menu's Game modes (the shared list's host hook).
import { extraModes } from '../../../../remnant/src/ui/chapters';
import { h, btn } from '../../../../remnant/src/ui/dom';
import type { PhaserSave } from '../save';

let added = false;

/** Adds the Watch's row once; `enter` leaves the journey (saved) for the wall. */
export function addWatchMode(save: () => PhaserSave, enter: () => void) {
  if (added) return;
  added = true;
  extraModes.push((close, busy) => {
    const w = save().watch;
    return h('div', null,
      h('b', null, 'The Watch'),
      h('p', { class: 'muted' }, `An idle game on the wall of a ruined city: Elior strikes on his own, every foe pays coins, coins buy his strength.${w ? ` Watch level ${w.level}, stage ${w.stage}.` : ' A fresh Elior starts at level 1.'} Best held upright.`),
      h('div', { class: 'ch-waves' }, btn('Keep the Watch', () => { close(); enter(); }, 'btn small primary', { disabled: busy, 'data-k': 'settings_watch' })),
      h('hr', { class: 'rule' }),
    );
  });
}
