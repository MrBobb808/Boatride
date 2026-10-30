// The way into the Horde from a journey: a row in the pause menu's Game modes (the shared list's host hook).
import { extraModes } from '../../../../remnant/src/ui/chapters';
import { h, btn } from '../../../../remnant/src/ui/dom';
import type { PhaserSave } from '../save';

let added = false;

/** Adds the Horde's row once; `enter` leaves the journey (saved) for the Horde. */
export function addHordeMode(save: () => PhaserSave, enter: () => void) {
  if (added) return;
  added = true;
  extraModes.push((close, busy) => {
    const best = save().horde?.best;
    return h('div', null,
      h('b', null, 'The Horde'),
      h('p', { class: 'muted' }, `Top-down, endless stages: the horde from every side, weapons that strike on their own, a monarch at each stage's end.${best ? ` Best: stage ${best}.` : ''} Hold the phone upright or sideways.`),
      h('div', { class: 'ch-waves' }, btn('Enter the Horde', () => { close(); enter(); }, 'btn small primary', { disabled: busy, 'data-k': 'settings_horde' })),
      h('hr', { class: 'rule' }),
    );
  });
}
