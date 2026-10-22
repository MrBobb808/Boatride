// The Trials of Valor page in the pause menu (a grid of trophies, the title
// and cape Elior wears), and the card and chime when a trophy is won.

import { G } from '../game/ctx';
import { h, btn } from './dom';
import { iconUrl } from './icons';
import { islandNotify } from './island';
import { SFX, sfx, mtof } from '../audio/audio';
import {
  TROPHIES, VALOR_CATS, CAPES, valorOf, hasTrophy, trophyCount, titleOf, capesEarned, titlesEarned, onTrophy,
  type Trophy, type ValorCat,
} from '../game/valor';

// A rising bell figure over a low fifth: brighter than loot, shorter than a level-up.
SFX.trophy = (a, t, v) => {
  const d = a.out(0, 1.2);
  [67, 71, 74, 79, 86].forEach((m, i) => a.osc('sine', mtof(m), t + i * 0.075, 1.3 - i * 0.12, d, 0.11 * v, 0.003));
  a.osc('triangle', mtof(43), t, 1.5, d, 0.09 * v, 0.03);
  a.osc('triangle', mtof(50), t + 0.05, 1.4, d, 0.06 * v, 0.03);
};

const reward = (t: Trophy) => [t.title ? `Title: ${t.title}` : '', t.cape ? `Cape: ${CAPES[t.cape].name}` : ''].filter(Boolean).join(' · ');

// ---------------------------------------------------------------- the card when one is won

const queue: Trophy[] = [];
let showing = false;

function next() {
  const t = queue.shift();
  if (!t) { showing = false; return; }
  showing = true;
  const prize = reward(t);
  const card = h('div', { class: 'valor-toast', 'data-trophy': t.id },
    h('img', { src: iconUrl(t.icon, '#f6dea0'), alt: '' }),
    h('div', null, h('div', { class: 'eyebrow' }, 'Trial of Valor won'), h('b', null, t.name), prize ? h('small', null, prize) : null),
  );
  document.getElementById('ui')?.appendChild(card);
  sfx('trophy', { vol: 0.8 });
  islandNotify(t.name.toUpperCase(), '#f6dea0', 'crown', 2.4);
  setTimeout(() => card.classList.add('out'), 3400);
  setTimeout(() => { card.remove(); next(); }, 3900);
}

onTrophy((t) => {
  queue.push(t);
  if (!showing) next();
});

// ---------------------------------------------------------------- the page

let filter: ValorCat | 'All' = 'All';

export function valorTab(rerender: () => void): HTMLElement {
  const s = G.save, v = valorOf(s);
  const won = trophyCount(s), all = TROPHIES.length;
  const titles = titlesEarned(s), capes = capesEarned(s);
  const card = (t: Trophy) => {
    const got = hasTrophy(s, t.id), secret = t.hidden && !got;
    const p = t.prog?.(s);
    const at = v.got[t.id];
    return h('div', { class: 'trophy' + (got ? ' won' : '') + (secret ? ' secret' : ''), 'data-trophy': t.id, 'data-won': String(got) },
      h('img', { src: iconUrl(secret ? 'sigil' : t.icon, got ? '#f6dea0' : '#6e6678'), alt: '' }),
      h('div', { class: 'trophy-text' },
        h('b', null, secret ? '???' : t.name),
        h('span', { class: 'muted' }, secret ? 'A hidden trial. Its name is revealed when it is won.' : t.desc),
        !got && p && !secret ? h('div', { class: 'trophy-bar' }, h('i', { style: `width:${Math.round(Math.min(1, p[0] / p[1]) * 100)}%` }), h('small', null, `${Math.floor(p[0])}/${p[1]}`)) : null,
        !secret && reward(t) ? h('small', { class: 'trophy-prize' }, reward(t)) : null,
        got ? h('small', { class: 'up' }, at ? `Won ${new Date(at).toLocaleDateString()}` : 'Recognised from your journey') : null,
      ));
  };
  const cats = VALOR_CATS.filter((c) => filter === 'All' || c === filter);
  return h('div', { class: 'col scroll valor', style: 'flex:1' },
    h('div', { class: 'box valor-head' },
      h('div', null,
        h('div', { class: 'eyebrow' }, 'Trophies of the journey'),
        h('h3', null, `Trials of Valor · ${won}/${all}`),
        h('div', { class: 'bar' }, h('i', { style: `width:${(won / all) * 100}%` })),
        h('p', { class: 'muted' }, 'Feats of the whole journey. What your save already shows is credited; feats it never recorded (a fight without a scratch, parries, finishers, lamps) count from now on. Rewards are titles and cape colours.'),
      ),
      h('div', { class: 'valor-wear' },
        h('b', null, 'Title'),
        h('div', { class: 'modes' },
          btn('None', () => { v.title = undefined; rerender(); }, 'btn small' + (!titleOf(s) ? ' primary' : ''), { 'data-k': 'title_none' }),
          titles.map((t) => btn(t.title!, () => { v.title = t.id; rerender(); }, 'btn small' + (v.title === t.id ? ' primary' : ''), { 'data-k': 'title_' + t.id }))),
        titles.length ? null : h('small', { class: 'muted' }, 'Win trophies marked with a title to wear one.'),
        h('b', null, 'Cape'),
        h('div', { class: 'modes' },
          btn('Default', () => { v.cape = undefined; rerender(); }, 'btn small' + (!v.cape ? ' primary' : ''), { 'data-k': 'cape_none' }),
          capes.map((c) => btn([h('i', { class: 'swatch', style: `background:${CAPES[c].c};border-color:${CAPES[c].trim}` }), CAPES[c].name], () => { v.cape = c; G.world.player.styleKey = ''; rerender(); }, 'btn small' + (v.cape === c ? ' primary' : ''), { 'data-k': 'cape_' + c }))),
        h('small', { class: 'muted' }, capes.length ? 'A worn cape shows at any level, in both art styles; the Shadow Mantle covers it while active.' : 'Win trophies marked with a cape to wear one.'),
      ),
    ),
    h('div', { class: 'modes valor-filter' }, (['All', ...VALOR_CATS] as const).map((c) => {
      const n = c === 'All' ? won : TROPHIES.filter((t) => t.cat === c && hasTrophy(s, t.id)).length;
      const of = c === 'All' ? all : TROPHIES.filter((t) => t.cat === c).length;
      return btn(`${c} ${n}/${of}`, () => { filter = c; rerender(); }, 'btn small' + (filter === c ? ' primary' : ''), { 'data-k': 'vf_' + c });
    })),
    cats.map((c) => h('div', { class: 'box' }, h('h3', null, c), h('div', { class: 'trophy-grid' }, TROPHIES.filter((t) => t.cat === c).map(card)))),
  );
}
