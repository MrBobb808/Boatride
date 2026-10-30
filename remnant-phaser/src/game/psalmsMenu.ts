// The pause menu's Psalms section: the slots in use, every Psalm (those not yet won show which boss holds them),
// and Wear / Take off. Added to the shared menu through addMenuSection, as Tirzah's section is.
import { addMenuSection, type MenuPageKit } from '../../../remnant/src/ui/menus';
import { h, btn } from '../../../remnant/src/ui/dom';
import { sfx } from '../classic/shim/audio';
import { PSALMS, slots, used, owns, wears, wear, takeOff, MAX_SLOTS, BASE_SLOTS } from './psalms';
import type { PhaserSave } from './save';

interface Host { save: PhaserSave; refreshStats(): void; persist(): void }
const GOLD = '#e2b85a';

export function addPsalmsMenu(host: Host) {
  function page(kit: MenuPageKit) {
    const s = host.save, have = slots(s), use = used(s);
    const pips = h('div', { style: 'display:flex;gap:6px;margin:6px 0' }, ...Array.from({ length: MAX_SLOTS }, (_, i) =>
      h('span', { style: `width:16px;height:16px;border-radius:50%;border:1.5px solid ${GOLD};${i < use ? `background:${GOLD};` : ''}${i >= have ? 'opacity:.25;' : ''}` })));
    const pages = s.keyItems.filter((k) => k.startsWith('psalter_')).length;
    const head = h('div', { class: 'box' }, h('h3', null, 'Psalms'),
      h('p', { class: 'muted' }, `Each boss leaves a Psalm. Worn Psalms change how you fight and move, and strengthen your Echoes. Slots in use: ${use} of ${have}. Psalter Pages found: ${pages} of 4 (each adds a slot, from ${BASE_SLOTS} up to ${MAX_SLOTS}).`), pips);
    const cards = PSALMS.map((p) => {
      const mine = owns(s, p.id), on = wears(s, p.id), fits = use + p.cost <= have;
      const cost = h('span', { style: `color:${GOLD}` }, '●'.repeat(p.cost));
      const action = !mine ? h('span', { class: 'muted' }, `Defeat ${p.bossName}`)
        : on ? btn('Take off', () => { takeOff(s, p.id); sfx('uiBack'); host.refreshStats(); host.persist(); kit.rerender(); }, 'btn small', { 'data-k': 'ps_' + p.id })
        : btn(fits ? 'Wear' : `Needs ${p.cost - (have - use)} more`, () => { if (wear(s, p.id)) { sfx('uiConfirm'); host.refreshStats(); host.persist(); kit.rerender(); } }, 'btn small', { 'data-k': 'ps_' + p.id, disabled: !fits });
      return h('div', { class: 'box', style: `${on ? `border-color:${GOLD};` : ''}${mine ? '' : 'opacity:.55;'}` },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' },
          h('div', null, h('div', { class: 'nm', style: on ? `color:${GOLD}` : '' }, p.name), h('div', { class: 'ds muted' }, `${p.kind} · `, cost)),
          action),
        h('p', { class: 'ds' }, p.desc));
    });
    return h('div', { class: 'col scroll', style: 'flex:1' }, head, ...cards);
  }
  addMenuSection({ id: 'psalms', label: 'Psalms', icon: 'book', tabs: [{ id: 'psalms', label: 'Psalms', icon: 'book' }] }, 'tirzah', { psalms: page });
}
