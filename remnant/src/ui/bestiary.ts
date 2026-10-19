// Journal → Bestiary: every kind of foe the player has slain, with a field
// note and its base numbers, and the great foes they have beaten. Foes not
// yet met stay hidden as "???", so the list is a collection to fill in.

import { G } from '../game/ctx';
import { ENEMY_STATS } from '../game/enemies';
import type { EnemyKind } from '../game/tiles';
import { h } from './dom';
import { img } from './icons';

interface Entry { ch: number; icon: string; note: string }

const NOTES: Record<EnemyKind, Entry> = {
  husk: { ch: 1, icon: 'hood', note: 'Villagers the Veil emptied and wore. Slow to start, quick to lunge once struck.' },
  hound: { ch: 1, icon: 'lion', note: 'Packs of ash and shadow. They circle, then pounce low; jump or dodge through.' },
  archer: { ch: 1, icon: 'arc', note: 'Watchmen who still keep the walls. Close the distance; they loose slowly at close range.' },
  sentinel: { ch: 1, icon: 'shield', note: 'Temple guards bound to a covenant they forgot. Heavy blows that can be parried.' },
  wisp: { ch: 1, icon: 'veil', note: 'Loose threads of the Veil that drift and burn. Strike them out of the air.' },
  brute: { ch: 2, icon: 'gauntlet', note: 'Chained giants of the brickworks. Break their poise and they stagger long.' },
  bulwark: { ch: 2, icon: 'shield', note: 'A tower shield on legs. Its guard breaks under heavy blows, or go over the top.' },
  knight: { ch: 2, icon: 'helm', note: 'The Marshal\'s sworn swords. Fast lunges that punish a greedy combo.' },
  drone: { ch: 3, icon: 'feather', note: 'The swarm\'s small mouths. Weak alone, dangerous in clouds.' },
  soldier: { ch: 3, icon: 'spear', note: 'Plated in hive chitin. Its spear reaches far; parry the thrust.' },
  lion: { ch: 4, icon: 'lion', note: 'A bronze beast cast after the lions on the city gate. It crouches before it pounces, and its roar quickens every foe nearby.' },
  vessel: { ch: 5, icon: 'flask', note: 'A cup from the temple, stolen for the feast and filled with the Veil. It pours burning wine on whoever stands beneath it.' },
  scribe: { ch: 5, icon: 'book', note: 'A palace scribe who wrote what the Veil told him to. Its letters hang in the air and strike; break its tablet to stop the writing.' },
  undying: { ch: 6, icon: 'helm', note: 'A soldier of the fallen host. Struck down, it kneels and rises again. Finish it while it kneels, or execute it, and it stays down.' },
  gale: { ch: 6, icon: 'feather', note: 'A spark of the storm prince\'s wind with wings. A flash and a mark on the ground come before every bolt.' },
  priest: { ch: 4, icon: 'lamp', note: 'Keeper of the furnace. It lobs fire, calls flame under a ring on the ground, and vanishes when cornered.' },
};

const GREAT: { id: string; name: string; ch: number; boss: boolean }[] = [
  { id: 'vault_archer', name: 'Archer of the Vault', ch: 1, boss: false },
  { id: 'idol', name: 'The Gilded Idol', ch: 1, boss: true },
  { id: 'kiln_overseer', name: 'The Kiln Overseer', ch: 2, boss: false },
  { id: 'gatekeeper', name: 'The Gatekeeper', ch: 2, boss: true },
  { id: 'hall_bulwark', name: 'Bulwark of the Hall', ch: 2, boss: false },
  { id: 'marshal', name: 'The Crimson Marshal', ch: 2, boss: true },
  { id: 'bone_colossus', name: 'Colossus of the Valley', ch: 3, boss: false },
  { id: 'locust_king', name: 'The Locust King', ch: 3, boss: true },
  { id: 'den_lion', name: 'Lion of the Den', ch: 4, boss: false },
  { id: 'furnace_warden', name: 'The Furnace Warden', ch: 4, boss: false },
  { id: 'golden_image', name: 'The Image of Gold', ch: 4, boss: true },
  { id: 'garden_keeper', name: 'Keeper of the Gardens', ch: 5, boss: false },
  { id: 'treasury_captain', name: 'Captain of the Treasury', ch: 5, boss: false },
  { id: 'weigher', name: 'The Weigher', ch: 5, boss: true },
  { id: 'undying_captain', name: 'Captain of the Undying', ch: 6, boss: false },
  { id: 'storm_prince', name: 'The Prince of the Power of the Air', ch: 6, boss: true },
  { id: 'persia_prince', name: 'The Prince of the Kingdom of Persia', ch: 6, boss: true },
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const KINDS = Object.keys(NOTES) as EnemyKind[];

export function bestiaryCount() {
  const b = G.save.bestiary ?? {};
  return KINDS.filter((k) => (b[k] ?? 0) > 0).length;
}

/** Left: the list. Right: the selected entry. `sel` is a kind or a great-foe id. */
export function bestiaryPanes(sel: string | null, pick: (id: string) => void): [HTMLElement, HTMLElement] {
  const b = G.save.bestiary ?? {};
  const beaten = G.save.defeated;
  const known = (k: EnemyKind) => (b[k] ?? 0) > 0;
  const row = (id: string, on: boolean, icon: string, name: string, sub: string, tag: string) =>
    h('button', { class: 'row-item' + (id === sel ? ' sel' : ''), 'data-nav': '', 'data-k': 'b_' + id, onclick: () => pick(id) },
      img(on ? icon : 'veil', on ? '#f6dea0' : '#4a4252'),
      h('div', null, h('div', { class: 'nm', style: on ? '' : 'color:var(--muted)' }, on ? name : '???'), h('div', { class: 'sub' }, sub)),
      h('span', { class: 'tag' }, tag));
  const great = GREAT.filter((g) => beaten.includes(g.id));
  const left = h('div', { class: 'list' },
    h('div', { class: 'eyebrow' }, `Foes recorded: ${bestiaryCount()} of ${KINDS.length}`),
    KINDS.map((k) => row(k, known(k), NOTES[k].icon, ENEMY_STATS[k].name, `Chapter ${ROMAN[NOTES[k].ch]}`, known(k) ? `×${b[k]}` : '')),
    h('div', { class: 'eyebrow', style: 'margin-top:8px' }, `Great foes overcome: ${great.length} of ${GREAT.length}`),
    great.length ? great.map((g) => row(g.id, true, g.boss ? 'crown' : 'sigil', g.name, `Chapter ${ROMAN[g.ch]} · ${g.boss ? 'Guardian' : 'Elite'}`, '✓'))
      : h('div', { class: 'muted', style: 'font-size:0.9em' }, 'None yet.'),
  );
  let right: HTMLElement;
  const k = sel as EnemyKind;
  const g = GREAT.find((x) => x.id === sel);
  if (sel && NOTES[k] && known(k)) {
    const st = ENEMY_STATS[k];
    const stat = (l: string, v: string | number) => h('div', null, h('div', { class: 'sub' }, l), h('b', null, `${v}`));
    right = h('div', { class: 'box' },
      h('div', { class: 'title-text' }, st.name),
      h('div', { class: 'eyebrow' }, `Chapter ${ROMAN[NOTES[k].ch]} · slain ${b[k]}`),
      h('p', null, NOTES[k].note),
      h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px 10px;margin-top:6px' },
        stat('Health', st.hp), stat('Strength', st.dmg), stat('Poise', st.poise),
        stat('Experience', st.xp), stat('Silver', `${st.silver[0]}–${st.silver[1]}`)),
      h('p', { class: 'muted', style: 'font-size:0.82em;margin-top:8px' }, 'Base numbers. Foes grow stronger in later chapters and in the Trial.'),
    );
  } else if (g && beaten.includes(g.id)) {
    right = h('div', { class: 'box' },
      h('div', { class: 'title-text' }, g.name),
      h('div', { class: 'eyebrow' }, `Chapter ${ROMAN[g.ch]} · ${g.boss ? 'Guardian' : 'Elite'}`),
      h('p', null, g.boss ? 'Overcome. Its chamber is quiet now.' : 'Overcome.'),
    );
  } else {
    right = h('div', { class: 'box muted' }, sel ? 'Not yet met. Slay one to record it.' : 'Select a foe.');
  }
  return [left, right];
}
