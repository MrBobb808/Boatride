// What each number on the character sheet and on gear actually does. Rows
// carry a data-tip; hovering, focusing or long-pressing one (a plain tap on
// rows that are not buttons) shows a small bubble beside it. One delegated set
// of listeners per menu, one bubble element.

import type { ModKey } from '../game/data';
import type { Derived } from '../game/state';

export const MOD_TIPS: Record<ModKey, string> = {
  hp: 'Added straight to maximum health.',
  ce: 'More Covenant Energy to spend on abilities, Phantom Step and Judgment Cross.',
  atk: 'Base power of every weapon strike, multiplied by your level and Strength. Abilities and Echoes scale from it too.',
  def: 'Reduces the damage of every blow you take, together with Endurance.',
  crit: 'Chance that a blow lands as a critical hit.',
  critDmg: 'How much harder a critical hit lands (×1.5 to start).',
  aspd: 'Swings, combos and recoveries play faster.',
  speed: 'Run and dash faster.',
  abil: 'Damage and healing of abilities and supers.',
  ceRegen: 'Covenant Energy refills faster.',
  echoDmg: 'Every Echo fighting beside you hits harder.',
  echoHp: 'Every Echo has more health.',
  parry: 'Widens the perfect-parry window, so timing is easier.',
  poise: 'Absorbs more blows before you are staggered.',
  xp: 'More experience from foes and deeds.',
  rally: 'Your super gauge charges faster.',
  lifesteal: 'Heals you for part of the damage your weapon deals (at most 4% of maximum health a second).',
  barter: 'Selling pays more and the store charges less.',
  salvage: 'More materials when you sell or dismantle gear.',
  mantleGain: 'Your transformation gauge fills faster from hits, kills and parries.',
  parryHeal: 'A perfect parry heals part of your maximum health.',
  vit: 'Vitality: more maximum health.',
  str: 'Strength: more attack power.',
  agi: 'Agility: critical chance, critical damage and attack speed.',
  end: 'Endurance: health, damage reduction and Echo health.',
  res: 'Resolve: Echo damage, super charge and critical damage.',
  wis: 'Wisdom: Covenant Energy, ability power and skill recharge.',
};

/** The character sheet's derived rows, by label. */
export const DERIVED_TIPS: Record<string, string> = {
  'Health': 'Current and maximum health. Vitality, Endurance, level and armor raise the maximum.',
  'Health regeneration': 'Health recovered each second once you have gone 4 seconds unharmed.',
  'Attack power': 'Base power of each weapon strike: weapon attack × level, plus Strength.',
  'Damage reduction': 'Share of every blow you shrug off, from Endurance, Defense and Guardian skills (90% at most).',
  'Critical chance': 'Chance each blow is a critical hit.',
  'Critical damage': 'Multiplier on critical hits.',
  'Attack speed': 'How fast swings and recoveries play.',
  'Move speed': 'Running and dash speed.',
  'Ability power': 'Multiplier on abilities and supers.',
  'Skill recharge': 'How fast ability cooldowns and the Mantle pursuit recover.',
  'Melee skill bonus': 'Extra weapon damage from Warrior training and weapon mastery.',
  'Parry window': 'How long a perfect parry stays open after you press Parry.',
  'Super charge rate': 'How fast battle fills your super gauge.',
  'Echo damage': 'Multiplier on every Echo\'s blows.',
  'Echo health': 'Multiplier on every Echo\'s health.',
  'Weapon': 'Your weapon family decides your combos and mastery perks.',
};

/** Derived numbers worth comparing when gear changes: [label, value, format]. */
export function derivedRows(d: Derived): [string, number, (v: number) => string][] {
  const pct = (v: number) => (v * 100).toFixed(1) + '%', x = (v: number) => '×' + v.toFixed(2), n = (v: number) => v.toFixed(0);
  return [
    ['Health', d.maxHp, n], ['Attack power', d.atk, (v) => v.toFixed(1)], ['Damage reduction', d.dr, pct],
    ['Critical chance', d.crit, pct], ['Critical damage', d.critDmg, x], ['Attack speed', d.aspd, x],
    ['Move speed', d.speed, x], ['Ability power', d.abil, x], ['Parry window', d.parryWin * 1000, (v) => v.toFixed(0) + ' ms'],
    ['Echo damage', d.echoDmg, x], ['Echo health', d.echoHp, x], ['Covenant Energy', d.maxCe, n],
  ];
}

let bubble: HTMLElement | null = null;
let shownFor: Element | null = null;
let holdT = 0;
let held = false;

function show(el: HTMLElement) {
  const text = el.dataset.tip;
  if (!text) return;
  bubble ??= Object.assign(document.createElement('div'), { className: 'stat-tip', role: 'tooltip' });
  bubble.setAttribute('data-k', 'stat_tip');
  bubble.textContent = text;
  document.getElementById('ui')!.appendChild(bubble);
  const r = el.getBoundingClientRect(), b = bubble.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
  const top = r.top - b.height - 6 >= 4 ? r.top - b.height - 6 : r.bottom + 6;
  bubble.style.left = left + 'px';
  bubble.style.top = top + 'px';
  shownFor = el;
}
export function hideTip() {
  bubble?.remove();
  shownFor = null;
}

/** Hover, focus or long-press any [data-tip] inside root. */
export function installTips(root: HTMLElement) {
  const tipOf = (e: Event) => (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
  root.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') { const t = tipOf(e); if (t) show(t); else hideTip(); } });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', (e) => { const t = tipOf(e); if (t) show(t); });
  root.addEventListener('pointerdown', (e) => {
    clearTimeout(holdT); held = false;
    const t = tipOf(e);
    if (!t) { hideTip(); return; }
    if (e.pointerType === 'mouse') return;
    holdT = window.setTimeout(() => { held = true; show(t); }, 420);
  });
  const cancel = () => clearTimeout(holdT);
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('scroll', () => { cancel(); hideTip(); }, true);
  // A long-press explains, it does not also press the button.
  root.addEventListener('click', (e) => {
    if (held) { held = false; e.stopPropagation(); e.preventDefault(); return; }
    const t = tipOf(e);
    if (t && !(e.target as Element).closest('button, input, a')) { if (shownFor === t) hideTip(); else show(t); }
  }, true);
}
