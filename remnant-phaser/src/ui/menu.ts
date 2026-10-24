// The pause menu, as the original draws it (remnant/src/ui/menus.ts): a rail of
// sections with sub-tabs over the game, built from the original's DOM helpers
// (ui/dom.ts), icons (ui/icons.ts), stat tips (ui/statTips.ts) and stylesheet
// (ui/styles.css). Ported here: Elior (character, equipment, skills), Echoes
// (the squad), Journey (where the road stands) and System (save and quit).
// The rest of the original's pages arrive with their systems (quests and lore
// with the story, the map, crafting and the shops, settings).

import {
  ITEMS, SLOTS, SLOT_NAMES, STAT_KEYS, STAT_INFO, MOD_LABEL, RARITY_COLORS, RARITY_NAMES, TREES, SKILLS, ABILITIES,
  ECHO_SPECIES, ECHO_ROLES, ECHO_LEVEL_CAP, echoRole, FAMILY_NAMES, echoXpToNext, xpToNext,
  type ItemInst, type Slot, type ModKey, type EchoInst, type StatKey,
} from '../../../remnant/src/game/data';
import { derive, getItem, itemMods, canLearn, skillRank, echoMaxHp, echoAtk, unlockCombatSkills, allocateStat, learnRanks, learn, absorbEcho, equipAbility, COMBAT_UNLOCKS } from '../../../remnant/src/game/state';
import { h, btn, pushLayer, popLayer, clear, navigate } from '../../../remnant/src/ui/dom';
import { img, iconUrl } from '../../../remnant/src/ui/icons';
import { installTips, hideTip, MOD_TIPS, DERIVED_TIPS, derivedRows } from '../../../remnant/src/ui/statTips';
import { titleOf } from '../../../remnant/src/game/valor';
import { GEAR_SETS } from '../../../remnant/src/game/progression';
import { ECHO_COMBOS } from '../../../remnant/src/game/echoCombos';
import { kitFor } from '../../../remnant/src/game/echoes';
import { solve, newJoints } from '../../../remnant/src/render/skeleton';
import { drawHumanoid } from '../../../remnant/src/render/actors';
import { ROOMS } from '../shared';
import type { World } from '../scenes/World';
import { settings, saveSettings } from '../classic/shim/settings';
import { songs } from '../../../remnant/src/audio/songs';
import { installedBuild, checkForUpdates } from '../game/update';
import '../../../remnant/src/ui/styles.css';

const formatTime = (sec: number) => { const m = Math.floor(sec / 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };

const SECTIONS: { id: string; label: string; icon: string; tabs: { id: string; label: string; icon: string }[] }[] = [
  { id: 'journey', label: 'Journey', icon: 'map', tabs: [{ id: 'journey', label: 'The road', icon: 'journal' }] },
  { id: 'elior', label: 'Elior', icon: 'stats', tabs: [
    { id: 'character', label: 'Character', icon: 'stats' },
    { id: 'equipment', label: 'Equipment', icon: 'armor' },
    { id: 'skills', label: 'Skills', icon: 'skills' },
    { id: 'abilities', label: 'Abilities', icon: 'lamp' },
    { id: 'moves', label: 'Moves', icon: 'sword' },
  ] },
  { id: 'echoes', label: 'Echoes', icon: 'echo', tabs: [{ id: 'echoes', label: 'Squad', icon: 'echo' }] },
  { id: 'settings', label: 'System', icon: 'gear', tabs: [{ id: 'system', label: 'Save & system', icon: 'save' }] },
];
const TABS = SECTIONS.flatMap((sec) => sec.tabs);
const sectionOf = (t: string) => SECTIONS.find((sec) => sec.tabs.some((x) => x.id === t)) ?? SECTIONS[0];
const lastIn: Record<string, string> = {};

let W: World | null = null;
let menuEl: HTMLElement | null = null;
let railEl: HTMLElement;
let tabsEl: HTMLElement;
let bodyEl: HTMLElement;
let tab = 'character';
let pointBatch = 1;
let onClose: (() => void) | null = null;

const world = () => W!;
const save = () => W!.save;
const uiRoot = () => document.getElementById('ui') ?? document.body.appendChild(h('div', { id: 'ui' }));

export const isMenuOpen = () => !!menuEl;

/** Open the menu over the game (the world is paused by the caller). */
export function openMenu(w: World, t?: string, closed?: () => void) {
  W = w;
  onClose = closed ?? null;
  if (menuEl) { if (t) setTab(t); return; }
  if (t) tab = t;
  tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  railEl = h('div', { class: 'menu-rail', role: 'tablist', 'aria-label': 'Menu sections' });
  bodyEl = h('div', { class: 'menu-body' });
  const close = btn('Resume', () => closeMenu(), 'btn small menu-close', { 'data-k': 'menu_resume' });
  menuEl = h('div', { class: 'menu sectioned' }, railEl, h('div', { class: 'menu-main' }, h('div', { class: 'menu-top' }, tabsEl, close), bodyEl));
  uiRoot().appendChild(menuEl);
  installTips(menuEl);
  tapsOnButtons(menuEl);
  renderTabs();
  render();
  pushLayer({
    el: menuEl,
    onBack: () => closeMenu(),
    onAction: (a) => {
      if (a === 'tabL' || a === 'tabR') {
        const i = TABS.findIndex((x) => x.id === tab);
        setTab(TABS[(i + (a === 'tabR' ? 1 : TABS.length - 1)) % TABS.length].id);
        return true;
      }
      if (a === 'menu') { closeMenu(); return true; }
      return false;
    },
  });
}

/**
 * A tap presses the button under the finger. Left to the browser, touch
 * adjustment can hand the click to the game canvas beneath (it listens for the
 * mouse), as it does for Resume beside the HUD's pause button. A drag (a scroll)
 * presses nothing, and a long press stays a stat tip (installTips eats its click).
 */
function tapsOnButtons(root: HTMLElement) {
  let from: { x: number; y: number } | null = null;
  root.addEventListener('touchstart', (e) => { const t = e.touches[0]; from = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0], b = (e.target as HTMLElement).closest('button');
    if (!from || !b || !root.contains(b) || Math.hypot(t.clientX - from.x, t.clientY - from.y) > 10) return;
    e.preventDefault();
    b.focus({ preventScroll: true });
    b.click();
  }, { passive: false });
}

export function closeMenu() {
  if (!menuEl) return;
  popLayer(menuEl);
  hideTip();
  menuEl = null;
  const cb = onClose;
  onClose = null;
  cb?.();
}

/** Keyboard and pad, from the Phaser controls: move focus, choose, go back, change tabs. */
export function menuInput(c: { pressed(a: string): boolean; device: string }) {
  if (!menuEl) return;
  const pad = c.device === 'gamepad';
  const act = (a: Parameters<typeof navigate>[0]) => { navigate(a); };
  if (c.pressed('menu')) act('menu');
  else if (c.pressed('dodge')) act('back');
  else if (c.pressed('attack') || c.pressed('jump') || c.pressed('interact')) act('confirm');
  else if (c.pressed('up')) act('up');
  else if (c.pressed('down')) act('down');
  else if (c.pressed('left')) act('left');
  else if (c.pressed('right')) act('right');
  else if (pad ? c.pressed('parry') : c.pressed('skill1')) act('tabL');
  else if (pad ? c.pressed('skill1') : c.pressed('skill2')) act('tabR');
}

function setTab(t: string) {
  tab = t;
  renderTabs();
  render();
}

function renderTabs() {
  clear(tabsEl);
  clear(railEl);
  const cur = sectionOf(tab);
  for (const sec of SECTIONS) {
    const on = sec === cur;
    railEl.appendChild(h('button', { class: 'sec' + (on ? ' on' : ''), 'data-nav': '', role: 'tab', 'aria-selected': String(on), 'data-k': 'sec_' + sec.id,
      onclick: () => { if (!on) setTab(sec.tabs.some((x) => x.id === lastIn[sec.id]) ? lastIn[sec.id] : sec.tabs[0].id); } },
    h('img', { src: iconUrl(sec.icon, on ? '#f6dea0' : '#9b92a6'), alt: '' }), h('span', null, sec.label)));
  }
  lastIn[cur.id] = tab;
  for (const t of cur.tabs) {
    tabsEl.appendChild(h('button', { class: 'tab' + (t.id === tab ? ' on' : ''), 'data-nav': '', role: 'tab', 'aria-selected': String(t.id === tab), 'data-k': 'tab_' + t.id, onclick: () => setTab(t.id) },
      h('img', { src: iconUrl(t.icon, t.id === tab ? '#f6dea0' : '#9b92a6'), alt: '' }), t.label));
  }
}

function render() {
  if (!bodyEl || !W) return;
  const keepScroll = (bodyEl.querySelector('.scroll') as HTMLElement | null)?.scrollTop ?? 0;
  const focusId = (document.activeElement as HTMLElement | null)?.dataset?.k;
  clear(bodyEl);
  hideTip();
  world().refreshStats();
  switch (tab) {
    case 'character': bodyEl.appendChild(characterTab()); break;
    case 'equipment': bodyEl.appendChild(equipmentTab()); break;
    case 'skills': bodyEl.appendChild(skillsTab()); break;
    case 'abilities': bodyEl.appendChild(abilitiesTab()); break;
    case 'moves': bodyEl.appendChild(movesTab()); break;
    case 'echoes': bodyEl.appendChild(echoesTab()); break;
    case 'journey': bodyEl.appendChild(journeyTab()); break;
    case 'system': bodyEl.appendChild(systemTab()); break;
  }
  const sc = bodyEl.querySelector('.scroll') as HTMLElement | null;
  if (sc) sc.scrollTop = keepScroll;
  if (focusId) (bodyEl.querySelector(`[data-k="${focusId}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}

/** After a change to stats, gear or skills: Elior's numbers, his Echoes', and the save. */
function refresh() {
  const w = world();
  w.refreshStats();
  w.player.maxHp = w.d.maxHp;
  w.player.maxCe = w.d.maxCe;
  w.player.hp = Math.min(w.player.hp, w.d.maxHp);
  for (const e of w.classic.squad.echoes) e.refreshStats();
  w.persist();
  render();
}

function pointBatchPicker() {
  return h('div', { class: 'modes', style: 'flex-wrap:wrap;margin:8px 0' },
    h('span', { class: 'muted', style: 'align-self:center' }, 'Spend at once:'),
    [1, 5, 10, 25, 50].map((n) => btn(String(n), () => { pointBatch = n; render(); }, 'btn small' + (pointBatch === n ? ' primary' : ''), { 'data-k': 'points_' + n, 'aria-pressed': String(pointBatch === n) })));
}

// ---------------------------------------------------------------- character

function characterTab() {
  const s = save(), d = world().d;
  const amount = Math.min(pointBatch, s.statPoints);
  const preview = (k: StatKey, by = amount) => {
    if (!by) return '';
    const next = derive({ ...s, stats: { ...s.stats, [k]: s.stats[k] + by } });
    const pair = (label: string, a: number, b: number, unit = '') => `${label} ${a.toFixed(1)}${unit} → ${b.toFixed(1)}${unit}`;
    return k === 'vit' ? pair('HP', d.maxHp, next.maxHp) : k === 'str' ? pair('Attack', d.atk, next.atk) :
      k === 'agi' ? pair('Attack speed', d.aspd, next.aspd, '×') + ' · ' + pair('Crit', d.crit * 100, next.crit * 100, '%') :
      k === 'end' ? pair('HP', d.maxHp, next.maxHp) + ' · ' + pair('Reduction', d.dr * 100, next.dr * 100, '%') :
      k === 'res' ? pair('Echo damage', d.echoDmg, next.echoDmg, '×') + ' · ' + pair('Parry window', d.parryWin * 1000, next.parryWin * 1000, ' ms') :
      pair('Ability power', d.abil, next.abil, '×') + ' · ' + pair('Energy', d.maxCe, next.maxCe);
  };
  const rows = STAT_KEYS.map((k) => h('div', { class: 'stat-row' },
    h('div', { 'data-tip': `${STAT_INFO[k].desc} Next ${amount || 1} point${(amount || 1) > 1 ? 's' : ''}: ${preview(k, amount || 1)}.`, 'data-k': 'tip_' + k }, h('div', { class: 'nm' }, STAT_INFO[k].name), h('div', { class: 'ds' }, STAT_INFO[k].desc), amount ? h('div', { class: 'ds up', 'data-k': 'preview_' + k }, preview(k)) : null),
    h('div', { class: 'val' }, String(d.stats[k]), d.stats[k] !== s.stats[k] ? h('span', { class: 'up', style: 'font-size:0.7em;margin-left:4px' }, `(${s.stats[k]}+${d.stats[k] - s.stats[k]})`) : null),
    btn('+' + (amount || 1), () => {
      const before = world().d.maxHp;
      if (!allocateStat(s, k, pointBatch)) return;
      world().refreshStats();
      // Health rises with the new maximum.
      world().player.hp = Math.min(world().d.maxHp, world().player.hp + Math.max(0, world().d.maxHp - before));
      refresh();
    }, 'btn plus', { disabled: s.statPoints <= 0, 'data-k': 'st_' + k, 'aria-label': 'Raise ' + STAT_INFO[k].name + ' by ' + amount }),
  ));
  rows.push(h('div', { class: 'stat-row' }, h('div', null, h('div', { class: 'nm' }, 'Summon Capacity'), h('div', { class: 'ds' }, 'Echoes that can fight beside you at once.')), h('div', { class: 'val' }, String(d.echoSlots)), h('span')));
  const pct = (v: number) => (v * 100).toFixed(1) + '%';
  const derived = h('div', { class: 'kv' },
    'Health', `${Math.ceil(world().player.hp)} / ${d.maxHp}`,
    'Covenant Energy', String(d.maxCe),
    'Attack power', d.atk.toFixed(1),
    'Damage reduction', pct(d.dr),
    'Critical chance', pct(d.crit),
    'Critical damage', '×' + d.critDmg.toFixed(2),
    'Ability power', '×' + d.abil.toFixed(2),
    'Melee skill bonus', '×' + d.meleeMult.toFixed(2),
    'Parry window', (d.parryWin * 1000).toFixed(0) + ' ms',
    'Echo damage', '×' + d.echoDmg.toFixed(2),
    'Echo health', '×' + d.echoHp.toFixed(2),
    'Weapon', FAMILY_NAMES[d.family],
  );
  for (const [i, el] of Array.from(derived.childNodes).entries()) {
    const label = (el as Text).textContent ?? '';
    derived.replaceChild(h('span', i % 2 === 0 && DERIVED_TIPS[label] ? { 'data-tip': DERIVED_TIPS[label], 'data-k': 'dtip_' + i, class: 'tipped' } : null, label), el);
  }
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' },
      h('div', { class: 'box', style: 'flex:1.3;min-width:280px' },
        h('h3', null, `Elior — Level ${s.level}`, titleOf(s) ? h('span', { class: 'worn-title' }, titleOf(s)) : null),
        h('div', { class: 'muted', style: 'font-size:0.9em;margin-bottom:6px' }, `Experience ${Math.floor(s.xp)} / ${xpToNext(s.level)} · Points to spend: `, h('b', { style: 'color:var(--gold-hi)', 'data-k': 'stat_points' }, String(s.statPoints))),
        h('div', { class: 'bar', style: 'margin-bottom:8px' }, h('i', { style: `width:${(s.xp / xpToNext(s.level)) * 100}%` })),
        pointBatchPicker(), rows,
      ),
      h('div', { class: 'col', style: 'flex:1;min-width:220px' },
        h('div', { class: 'box' }, h('h3', null, 'Derived'), derived),
        h('div', { class: 'box' }, h('h3', null, 'Progress'), h('div', { class: 'kv' },
          h('span', null, 'Silver'), h('span', null, String(s.silver)),
          h('span', null, 'Balm charges'), h('span', null, `${s.balm} / ${s.balmMax}`),
          h('span', null, 'Echoes purified'), h('span', null, String(s.echoes.length)),
          h('span', null, 'Foes fallen'), h('span', null, String(s.kills)),
          h('span', null, 'Time played'), h('span', null, formatTime(s.playtime)),
        )),
      ),
    ),
  );
}

// ---------------------------------------------------------------- equipment

let eqSlot: Slot = 'weapon';
let eqSel: string | null = null;

const rarityStyle = (r: number) => `color:${RARITY_COLORS[r]}`;
const itemName = (it: ItemInst) => ITEMS[it.id].name + (it.lootPower ? ` · Power ${it.lootPower}` : '') + (it.plus ? ` +${it.plus}` : '');
const itemIcon = (it: ItemInst) => img(ITEMS[it.id].icon, RARITY_COLORS[it.rarity]);

function modLines(m: Partial<Record<ModKey, number>>, cmp?: Partial<Record<ModKey, number>>) {
  const keys = new Set<ModKey>([...Object.keys(m), ...(cmp ? Object.keys(cmp) : [])] as ModKey[]);
  const out: HTMLElement[] = [];
  for (const k of keys) {
    const v = m[k] ?? 0;
    if (!v && !cmp) continue;
    const c = cmp ? (cmp[k] ?? 0) : null;
    const diff = c !== null ? v - c : 0;
    out.push(h('div', { 'data-tip': MOD_TIPS[k], class: 'tipped' }, v ? MOD_LABEL[k](Math.round(v * 10) / 10) : h('span', { class: 'muted' }, MOD_LABEL[k](0).replace('+0', '—')),
      cmp && Math.abs(diff) > 0.05 ? h('span', { class: diff > 0 ? 'up' : 'down', style: 'margin-left:8px;font-size:0.85em' }, (diff > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(diff * 10) / 10)) : null));
  }
  return out;
}

/** Current vs new: what equipping this item changes on the character sheet. */
function ifEquipped(uid: string) {
  const s = save(), now = derivedRows(world().d), next = derivedRows(derive({ ...s, equipment: { ...s.equipment, [eqSlot]: uid } }));
  const rows = now.flatMap(([label, a, f], i) => {
    const b = next[i][1];
    if (Math.abs(b - a) < Math.max(1e-6, Math.abs(a) * 0.0005)) return [];
    return [h('span', { 'data-tip': DERIVED_TIPS[label] ?? '', class: 'tipped' }, label), h('span', { class: b > a ? 'up' : 'down' }, `${f(a)} → ${f(b)}`)];
  });
  return h('div', { class: 'if-equipped', 'data-k': 'if_equipped' }, h('div', { class: 'eyebrow' }, 'If equipped'),
    rows.length ? h('div', { class: 'kv' }, rows) : h('div', { class: 'muted' }, 'No change to your numbers.'));
}

function equipmentTab() {
  const s = save();
  const slotChips = h('div', { class: 'slots' }, SLOTS.map((sl) => {
    const it = getItem(s, s.equipment[sl]);
    return h('button', { class: 'slot' + (sl === eqSlot ? ' sel' : ''), 'data-nav': '', 'data-k': 'slot_' + sl, onclick: () => { eqSlot = sl; eqSel = it?.uid ?? null; render(); } },
      it ? itemIcon(it) : img(sl === 'weapon' ? 'sword' : sl === 'helm' ? 'helm' : sl === 'armor' ? 'armor' : sl === 'gauntlets' ? 'gauntlet' : sl === 'boots' ? 'boot' : sl === 'relic' ? 'lamp' : 'ring', '#4a4458'),
      SLOT_NAMES[sl]);
  }));
  const items = s.inventory.filter((it) => ITEMS[it.id].slot === eqSlot);
  const equippedUid = s.equipment[eqSlot];
  if (!eqSel || !items.some((i) => i.uid === eqSel)) eqSel = equippedUid ?? items[0]?.uid ?? null;
  const list = h('div', { class: 'list' }, items.length ? items.map((it) => h('button', {
    class: 'row-item' + (it.uid === eqSel ? ' sel' : '') + (it.isNew ? ' new' : ''), 'data-nav': '', 'data-k': 'it_' + it.uid,
    onclick: () => { eqSel = it.uid; it.isNew = false; render(); },
  }, itemIcon(it), h('div', null, h('div', { class: 'nm', style: rarityStyle(it.rarity) }, itemName(it)), h('div', { class: 'sub' }, RARITY_NAMES[it.rarity] + ' ' + SLOT_NAMES[eqSlot])), it.uid === equippedUid ? h('span', { class: 'tag' }, 'EQUIPPED') : h('span'))) : h('div', { class: 'muted', style: 'padding:8px' }, 'Nothing for this slot yet. Chests and foes may have something.'));
  const sel = items.find((i) => i.uid === eqSel);
  let detail: HTMLElement;
  if (sel) {
    const base = ITEMS[sel.id], eq = getItem(s, equippedUid), isEq = sel.uid === equippedUid;
    detail = h('div', { class: 'box' },
      h('div', { style: 'display:flex;gap:10px;align-items:center' }, itemIcon(sel), h('div', null, h('div', { class: 'title-text', style: rarityStyle(sel.rarity) + ';font-size:1.05em' }, itemName(sel)), h('div', { class: 'eyebrow' }, `${RARITY_NAMES[sel.rarity]} · ${SLOT_NAMES[eqSlot]}${base.family ? ' · ' + FAMILY_NAMES[base.family] : ''}`))),
      h('hr', { class: 'rule' }),
      h('div', null, modLines(itemMods(sel), !isEq && eq ? itemMods(eq) : undefined)),
      isEq ? null : ifEquipped(sel.uid),
      h('p', { class: 'muted', style: 'margin:8px 0 0' }, base.desc),
      base.set ? h('div', { class: 'set-detail' },
        h('b', { style: `color:${GEAR_SETS[base.set].color}` }, `${GEAR_SETS[base.set].name} · ${world().d.sets[base.set]}/3 equipped`),
        h('p', { class: world().d.sets[base.set] >= 2 ? 'up' : 'muted' }, `2 pieces: ${GEAR_SETS[base.set].two}`),
        h('p', { class: world().d.sets[base.set] >= 3 ? 'up' : 'muted' }, `3 pieces: ${GEAR_SETS[base.set].three}`),
      ) : null,
      base.lore ? h('p', { style: 'font-style:italic;margin:6px 0 0;font-size:0.92em' }, base.lore) : null,
      h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
        isEq
          ? btn('Unequip', () => { if (eqSlot !== 'weapon') { delete s.equipment[eqSlot]; refresh(); } }, 'btn', { disabled: eqSlot === 'weapon', 'data-k': 'unequip' })
          : btn('Equip', () => { s.equipment[eqSlot] = sel.uid; refresh(); }, 'btn primary', { 'data-k': 'equip' }),
      ),
    );
  } else detail = h('div', { class: 'box muted' }, 'Select an item.');
  const mats = Object.entries(s.materials).filter(([, n]) => n > 0);
  return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
    h('div', { class: 'col', style: 'flex:1.1;min-height:0' }, slotChips, h('div', { class: 'scroll', style: 'flex:1' }, list)),
    h('div', { class: 'col scroll', style: 'flex:1;min-height:0' }, detail,
      h('div', { class: 'box' }, h('h3', null, 'Materials & relics'),
        h('div', { class: 'mats' }, mats.length ? mats.map(([k, n]) => h('span', null, h('b', null, `${n}× `), ITEMS[k]?.name ?? k)) : h('span', null, 'None yet.')),
        s.keyItems.length ? h('div', { class: 'mats', style: 'margin-top:6px' }, s.keyItems.map((k) => h('span', { style: 'color:var(--gold-hi)' }, ITEMS[k]?.name ?? k))) : null,
      ),
    ),
  );
}

// ---------------------------------------------------------------- skills

let skSel: string = SKILLS[0].id;

function skillsTab() {
  const s = save();
  unlockCombatSkills(s);
  const node = SKILLS.find((n) => n.id === skSel)!;
  const trees = h('div', { class: 'trees' }, TREES.map((t) => {
    const grid = h('div', { class: 'tree-grid' });
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const n = SKILLS.find((x) => x.tree === t.id && x.row === row && x.col === col);
      if (!n) { grid.appendChild(h('div')); continue; }
      const rk = skillRank(s, n.id);
      const cls = 'node' + (rk > 0 ? ' learned' : canLearn(s, n.id) ? ' avail' : '') + (n.id === skSel ? ' sel' : '');
      grid.appendChild(h('button', { class: cls, 'data-nav': '', 'data-k': 'sk_' + n.id, 'aria-label': n.name, onclick: () => { skSel = n.id; render(); } },
        h('span', null, img(n.grants ? ABILITIES[n.grants].icon : t.id === 'warrior' ? 'sword' : t.id === 'guardian' ? 'shield' : t.id === 'commander' ? 'echo' : 'lamp', t.color)),
        n.ranks > 1 ? h('span', { class: 'rk' }, `${rk}/${n.ranks}`) : null));
    }
    return h('div', { class: 'tree' }, h('h3', { style: `color:${t.color}` }, t.name), h('p', null, t.blurb), grid);
  }));
  const rk = skillRank(s, node.id);
  const ranksToLearn = Math.max(0, Math.min(pointBatch, node.ranks - rk, Math.floor(s.skillPoints / node.cost)));
  const reqText = node.req.length ? 'Requires ' + node.req.map((r) => SKILLS.find((x) => x.id === r)!.name).join(node.row === 3 ? ' and ' : ' or ') : 'No prerequisite';
  const detail = h('div', { class: 'box' },
    h('div', { class: 'title-text' }, node.name), h('div', { class: 'eyebrow' }, `${TREES.find((t) => t.id === node.tree)!.name} · Rank ${rk}/${node.ranks} · Cost ${node.cost}`),
    h('p', { style: 'margin:6px 0' }, node.desc),
    node.grants ? h('p', { style: 'font-style:italic;font-size:0.9em;margin:4px 0' }, ABILITIES[node.grants].verse) : null,
    h('div', { class: 'muted', style: 'font-size:0.85em' }, reqText),
    pointBatchPicker(),
    h('div', { style: 'margin-top:8px' }, btn(rk >= node.ranks ? 'Mastered' : ranksToLearn > 1 ? `Learn ${ranksToLearn} ranks · ${ranksToLearn * node.cost} points` : 'Learn', () => {
      if (learnRanks(s, node.id, pointBatch)) refresh();
    }, 'btn primary', { disabled: !canLearn(s, node.id), 'data-k': 'learn' })),
  );
  const regenRank = skillRank(s, 'g_regen');
  const regeneration = h('div', { class: 'box' }, h('h3', null, `Health regeneration · ${regenRank}/10`),
    h('p', { class: 'muted' }, 'Recover 0.75% maximum health per second per rank after 4 seconds without taking damage.'),
    btn(regenRank === 10 ? 'Regeneration mastered' : 'Train Regeneration · 1 point', () => { if (learn(s, 'g_regen')) refresh(); }, 'btn small', { disabled: !canLearn(s, 'g_regen'), 'data-k': 'learn_regen' }));
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'eyebrow', 'data-k': 'skill_points' }, `${s.skillPoints} skill points available`),
    h('p', { class: 'muted', style: 'font-size:0.85em;margin:2px 0 6px' }, 'Learn passives here. Choose your three Covenant skills in Abilities; Moves shows the combat routes.'),
    regeneration, detail, trees);
}

let abilitySlot = 0;
function abilitiesTab() {
  const s = save();
  unlockCombatSkills(s);
  const loadout = h('div', { class: 'slots ability-slots' }, [0, 1, 2].map((i) => {
    const id = s.equippedSkills[i];
    return btn([img(id ? ABILITIES[id].icon : 'shard', '#f6dea0'), h('span', null, `Slot ${i + 1}`, h('small', null, id ? ABILITIES[id].name : 'Empty'))], () => { abilitySlot = i; render(); }, 'slot' + (i === abilitySlot ? ' sel' : ''), { 'data-k': 'ls_' + i, 'aria-pressed': String(i === abilitySlot) });
  }));
  const catalog = h('div', { class: 'ability-catalog' }, Object.values(ABILITIES).map((def) => {
    const owned = s.abilities.includes(def.id), where = s.equippedSkills.indexOf(def.id);
    const node = SKILLS.find((n) => n.grants === def.id), lv = COMBAT_UNLOCKS[def.id];
    const lock = lv ? `Relic required · level ${lv}` : node ? `Learn ${node.name} in Skills` : 'Unlocked in the temple story';
    return h('div', { class: 'ability-card' + (where >= 0 ? ' equipped' : '') },
      h('div', { class: 'row', style: 'align-items:center;gap:10px' }, img(def.icon, owned ? '#f6dea0' : '#746684'), h('div', null, h('h3', null, def.name), h('div', { class: 'eyebrow' }, `${def.cost} Energy · ${def.cd}s cooldown`))),
      h('p', null, def.desc),
      !owned ? h('p', { class: 'muted' }, lock) : null,
      btn(!owned ? 'Locked' : where === abilitySlot ? `Equipped · Slot ${where + 1}` : `Equip in Slot ${abilitySlot + 1}`, () => {
        if (equipAbility(s, def.id, abilitySlot)) refresh();
      }, 'btn small' + (where === abilitySlot ? ' primary' : ''), { disabled: !owned, 'data-k': 'ab_' + def.id }));
  }));
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Ability loadout'), h('p', { class: 'muted' }, 'Select a slot, then an ability. Equipping one already carried swaps its two slots. Cooldowns stay with the ability.'), loadout,
      btn('Clear selected slot', () => { equipAbility(s, null, abilitySlot); refresh(); }, 'btn small', { 'data-k': 'ability_clear' })), catalog);
}

function movesTab() {
  const s = save(), touch = world().controls.device === 'touch', pad = world().controls.device === 'gamepad';
  const hit = touch ? 'STRIKE' : pad ? '□ / X' : 'J';
  const heavy = touch ? 'hold STRIKE' : pad ? '△ / Y' : 'K';
  const dodge = touch ? 'DODGE' : pad ? '○ / B' : 'L / Shift';
  const rows: [string, string, string, boolean][] = [
    ['Ground combo', `${hit} ×3`, 'A weapon-specific three-strike chain.', true],
    ['Rising Verdict', `${hit} ×4`, 'The Relentless skill adds a launching fourth strike.', !!skillRank(s, 'w_relentless')],
    ['Seventy Times Seven', `${hit}, ${hit}, pause, ${hit}`, 'Rapid thrusts followed by a driving lunge.', true],
    ['Storm of Edges', touch ? 'Hold STRIKE through the third strike' : `${heavy} during the third strike`, 'A multi-hit spin that draws nearby foes in.', true],
    ['Rising Comet', `${dodge}, ${hit}, ${hit}`, 'Dash strike, then carry your foe skyward.', true],
    ['Launcher', `Up + ${hit}`, 'Launch the foe; hold Up to rise with it.', true],
    ['Air combo', `${hit} ×3 in the air`, 'Three airborne strikes keep a juggle alive.', true],
    ["Heaven's Rend", `After the air combo, ${touch ? hit : heavy}`, 'Drill downward, then strike the ground.', true],
    ['Plunge', `Down + ${hit} in the air`, 'Fall into an impact that hits on both sides.', true],
    ['Air dash', `${dodge} in the air`, 'One invulnerable dash before landing.', true],
    ['Phantom Step', `Land a hit, then ${dodge}`, 'Blink to a reachable foe and strike. Costs 5 Energy; free from level 100.', !!s.flags.phantom],
    ['Judgment Cross', `After three Phantom Steps, ${hit}`, 'Two guard-breaking cuts. Costs 10 Energy.', !!s.flags.phantom],
    ['Charged strike', heavy, 'Release at a charge level. Weapon Mastery adds the final level.', true],
    ['Parry and counter', `${touch ? 'PARRY' : pad ? 'L1' : 'I'}, then ${hit}`, 'A perfect parry opens a critical counter.', true],
  ];
  return h('div', { class: 'col scroll', style: 'flex:1' }, rows.map(([name, input, desc, unlocked]) => h('div', { class: 'box' },
    h('h3', null, name + (unlocked ? '' : ' · locked')), h('div', { class: 'eyebrow' }, input), h('p', { class: 'muted' }, desc))));
}

// ---------------------------------------------------------------- echoes

let ecSel: string | null = null;

function echoPortrait(e: EchoInst) {
  const c = h('canvas', { width: '140', height: '168' });
  const ctx = c.getContext('2d')!;
  const kit = kitFor(e.species, echoRole(e));
  const j = solve(kit.base, kit.dims, true, newJoints());
  ctx.translate(70, 160);
  const sc = 2.6 * Math.min(1, 42 / kit.h);
  ctx.scale(sc, sc);
  drawHumanoid(ctx, j, kit.style(e.stage), 0);
  return c;
}

/** Bring the field in line with the lineup: the dismissed step back, the active come out. */
function syncArmy() {
  const sq = world().classic.squad, s = save();
  for (const e of sq.echoes) if (!s.active.includes(e.inst.uid)) e.dismiss();
  if (s.flags.army_out !== false) sq.summonEchoes(true);
  world().persist();
  render();
}

function echoesTab() {
  const s = save(), d = world().d;
  const pending = Object.entries(s.echoImprints ?? {}).filter(([id, n]) => n > 0 && ECHO_SPECIES[id]);
  const imprints = pending.length ? h('div', { class: 'box' }, h('h3', null, 'Original-form imprints'),
    pending.map(([id, n]) => btn(`Absorb ${ECHO_SPECIES[id].stages[0].name} · ${n} available`, () => {
      absorbEcho(s, id, d);
      s.echoImprints![id] = n - 1;
      syncArmy();
    }, 'btn small', { 'data-k': 'absorb_' + id, style: 'margin:4px 4px 0 0' }))) : null;
  if (!s.echoes.length) {
    return h('div', { class: 'col', style: 'flex:1;align-items:center;justify-content:center;text-align:center' },
      h('div', { class: 'title-text', style: 'font-size:1.2em' }, 'Your Remnant'), imprints,
      h('p', { class: 'muted', style: 'max-width:30em' }, 'When an elite foe falls, the shape of how it fought lingers. With the covenant\'s light you may purify that imprint into an Echo — a construct of black-gold and white fire that fights beside you. It is not a soul, and it is no one\'s prisoner.'));
  }
  if (!ecSel || !s.echoes.some((e) => e.uid === ecSel)) ecSel = s.echoes[0].uid;
  const sel = s.echoes.find((e) => e.uid === ecSel)!;
  const sp = ECHO_SPECIES[sel.species];
  const roster = h('div', { class: 'list' }, s.echoes.map((e) => {
    const esp = ECHO_SPECIES[e.species];
    const active = s.active.includes(e.uid), squad = (s.squadPick ?? []).includes(e.uid);
    return h('button', { class: 'row-item' + (e.uid === ecSel ? ' sel' : ''), 'data-nav': '', 'data-k': 'ec_' + e.uid, onclick: () => { ecSel = e.uid; render(); } },
      img(e.species === 'archer' ? 'archer_echo' : 'sentinel_echo', '#fff3c4'),
      h('div', null, h('div', { class: 'nm' }, esp.stages[e.stage].name + (e.commander ? ' ★' : '')), h('div', { class: 'sub' }, `${ECHO_ROLES[echoRole(e)].name} · Level ${e.level} · ${esp.stages[e.stage].title}`)),
      h('span', { class: 'tag' }, (active ? 'ACTIVE' : 'RESERVE') + (squad ? ' · SQUAD' : '')));
  }));
  const active = s.active.includes(sel.uid), inSquad = (s.squadPick ?? []).includes(sel.uid);
  const canActivate = active || s.active.length < d.echoSlots;
  const maxHp = echoMaxHp(s, sel, d);
  const detail = h('div', { class: 'box' },
    h('div', { class: 'echo-card' }, echoPortrait(sel),
      h('div', null,
        h('div', { class: 'title-text', style: 'font-size:1.05em' }, sp.stages[sel.stage].name + (sel.commander ? ' — Commander' : '')),
        h('div', { class: 'eyebrow' }, `${ECHO_ROLES[echoRole(sel)].name} · ${sp.stages[sel.stage].title}`),
        h('div', { class: 'kv', style: 'margin-top:4px' },
          h('span', null, 'Level'), h('span', null, `${sel.level} / ${ECHO_LEVEL_CAP}`),
          h('span', null, 'Health'), h('span', null, `${Math.ceil(sel.hp > 0 ? Math.min(sel.hp, maxHp) : 0)} / ${maxHp}`),
          h('span', null, 'Attack'), h('span', null, echoAtk(s, sel, d).toFixed(1)),
        ),
        h('div', { class: 'bar', style: 'margin-top:6px' }, h('i', { style: `width:${sel.level >= ECHO_LEVEL_CAP ? 100 : (sel.xp / echoXpToNext(sel.level)) * 100}%` })),
      )),
    h('p', { style: 'margin:8px 0 4px' }, sp.stages[sel.stage].desc),
    h('p', { style: 'margin:0 0 6px;color:var(--gold-hi)' }, ECHO_ROLES[echoRole(sel)].signature[sel.stage]),
    h('h3', null, 'Combat role'),
    h('div', { class: 'echo-roles' }, Object.entries(ECHO_ROLES).map(([id, role]) => btn([img(role.icon, role.color), h('span', null, role.name)], () => {
      sel.role = id as keyof typeof ECHO_ROLES;
      world().classic.squad.echoes.find((e) => e.inst.uid === sel.uid && !e.remove)?.setRole(sel.role);
      world().persist(); render();
    }, 'btn small' + (echoRole(sel) === id ? ' primary' : ''), { 'data-k': 'role_' + id, 'aria-pressed': String(echoRole(sel) === id) }))),
    h('p', { class: 'muted', style: 'font-size:0.85em' }, ECHO_ROLES[echoRole(sel)].desc),
    h('details', { class: 'combo-guide' },
      h('summary', null, 'Squad combination attacks'),
      h('p', { class: 'muted' }, 'Summon the two roles together. Their special moves open a short window for an automatic link.'),
      ECHO_COMBOS.map((c) => h('p', null, h('strong', { style: `color:${c.color}` }, c.name + ' · '), c.desc))),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
      btn(active ? 'Move to reserve' : 'Make active', () => {
        if (active) s.active = s.active.filter((u) => u !== sel.uid);
        else if (s.active.length < d.echoSlots) s.active.push(sel.uid);
        syncArmy();
      }, 'btn', { disabled: !canActivate, 'data-k': 'ec_act' }),
      btn(inSquad ? 'Out of the squad' : 'In the squad', () => {
        const pick = (s.squadPick ?? []).filter((u) => u !== sel.uid);
        s.squadPick = inSquad ? pick : [...pick, sel.uid];
        if ((s.summonPreset ?? 'all') === 'squad') syncArmy(); else { world().persist(); render(); }
      }, 'btn', { 'data-k': 'ec_squad' }),
      skillRank(s, 'c_warden') ? btn(sel.commander ? 'Relieve command' : 'Promote to Commander', () => {
        const was = sel.commander;
        for (const e of s.echoes) e.commander = false;
        sel.commander = !was;
        world().persist(); render();
      }, 'btn', { 'data-k': 'ec_cmd' }) : null,
    ),
  );
  const modes = h('div', { class: 'modes' }, (['aggressive', 'defensive', 'follow'] as const).map((m) => btn([img(m, '#f6dea0'), m], () => { s.echoMode = m; render(); }, 'btn small' + (s.echoMode === m ? ' primary' : ''), { 'data-k': 'mode_' + m })));
  const forms = h('div', { class: 'list' }, [0, 1, 2].map((i) => {
    const f = s.formations[i];
    return h('div', { class: 'save-slot' },
      h('div', null, h('b', null, `Formation ${i + 1}`), h('div', { class: 'meta' }, f ? f.uids.map((u) => { const e = s.echoes.find((x) => x.uid === u); return e ? ECHO_SPECIES[e.species].stages[e.stage].name : '—'; }).join(', ') || 'Empty' : 'Not saved')),
      h('div', { class: 'acts' },
        btn('Save', () => { s.formations[i] = { name: `Formation ${i + 1}`, uids: [...s.active] }; render(); }, 'btn small', { 'data-k': 'fs_' + i }),
        btn('Use', () => { if (f) { s.active = f.uids.filter((u) => s.echoes.some((e) => e.uid === u)).slice(0, d.echoSlots); syncArmy(); } }, 'btn small', { disabled: !f, 'data-k': 'fu_' + i }),
      ));
  }));
  return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
    h('div', { class: 'col scroll', style: 'flex:0.9;min-height:0' }, imprints,
      h('div', { class: 'box' }, h('h3', null, `Your Remnant · ${s.active.length}/${d.echoSlots} active`), roster),
      h('div', { class: 'box' }, h('h3', null, 'Stance'), modes, h('p', { class: 'muted', style: 'font-size:0.82em;margin:6px 0 0' }, 'Aggressive: hunt the nearest foe. Defensive: hold a line before you and shield you from arrows. Follow: stay close and strike what comes near.')),
    ),
    h('div', { class: 'col scroll', style: 'flex:1.1;min-height:0' }, detail, h('div', { class: 'box' }, h('h3', null, 'Formations'), forms)),
  );
}

// ---------------------------------------------------------------- journey and system

function journeyTab() {
  const s = save(), r = ROOMS[s.room];
  const beaten = s.defeated.filter((k) => !k.includes('_') || k.endsWith('_prince') || k.endsWith('_monarch') || ['locust_king', 'golden_image'].includes(k));
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, r?.name ?? s.room),
      h('div', { class: 'kv' },
        h('span', null, 'Level'), h('span', null, String(s.level)),
        h('span', null, 'Foes fallen'), h('span', null, String(s.kills)),
        h('span', null, 'Echoes'), h('span', null, String(s.echoes.length)),
        h('span', null, 'Places walked'), h('span', null, String(s.visited.length)),
        h('span', null, 'Time played'), h('span', null, formatTime(s.playtime)),
      )),
    h('div', { class: 'box' }, h('h3', null, 'Bosses overcome'),
      beaten.length ? h('div', { class: 'mats' }, beaten.map((k) => h('span', null, k.replace(/_/g, ' ')))) : h('p', { class: 'muted' }, 'None yet.')),
    h('p', { class: 'muted', style: 'font-size:0.85em' }, 'Quests, inscriptions, the bestiary and the map return with the story port.'));
}

function systemTab() {
  const volume = (key: 'master' | 'music' | 'sfx', label: string) => {
    const value = h('span', null, `${Math.round(settings[key] * 100)}%`);
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(settings[key] * 100)), 'aria-label': label, 'data-k': 'audio_' + key });
    input.addEventListener('input', () => { settings[key] = Number(input.value) / 100; value.textContent = `${input.value}%`; saveSettings(); });
    return h('label', { class: 'row', style: 'display:flex;gap:12px;align-items:center;margin:10px 0' }, h('span', { style: 'min-width:5em' }, label), input, value);
  };
  const toggle = (key: 'vocals' | 'mixAudio' | 'respectSilent' | 'reduceFlashes', label: string) => btn(`${label}: ${settings[key] ? 'On' : 'Off'}`, () => { settings[key] = !settings[key]; saveSettings(); songs.refresh(); render(); }, 'btn small', { 'data-k': 'setting_' + key, 'aria-pressed': String(settings[key]), style: 'margin:4px' });
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Save'),
      h('p', { class: 'muted' }, 'This build saves on every door, at altars and every half minute, under its own key: your live game is never touched.'),
      btn('Save now', () => { world().persist(); world().toast('Saved'); }, 'btn', { 'data-k': 'sys_save' }),
      btn('Save and quit to title', () => { closeMenu(); world().quitToTitle(); }, 'btn', { 'data-k': 'sys_title', style: 'margin-left:8px' })),
    h('div', { class: 'box' }, h('h3', null, 'Audio'), volume('master', 'Master'), volume('music', 'Music'), volume('sfx', 'Effects'),
      btn(settings.soundtrack === 'songs' ? 'Soundtrack: Songs' : 'Soundtrack: Score only', () => { settings.soundtrack = settings.soundtrack === 'songs' ? 'score' : 'songs'; saveSettings(); songs.refresh(); render(); }, 'btn small', { 'data-k': 'audio_soundtrack' }),
      toggle('vocals', 'Sung songs'), toggle('mixAudio', 'Mix with other apps'), toggle('respectSilent', 'Respect silent switch'),
      h('p', { class: 'muted' }, 'The generated score plays whenever a recorded song is unavailable.')),
    h('div', { class: 'box' }, h('h3', null, 'Challenge'),
      h('div', { class: 'modes' }, (['normal', 'hard', 'merciless'] as const).map((id) => btn(id.charAt(0).toUpperCase() + id.slice(1), () => { settings.bossDifficulty = id; saveSettings(); render(); }, 'btn small' + (settings.bossDifficulty === id ? ' primary' : ''), { 'data-k': 'difficulty_' + id, 'aria-pressed': String(settings.bossDifficulty === id) }))),
      h('p', { class: 'muted' }, 'Boss health and damage change on entering the next boss room.')),
    h('div', { class: 'box' }, h('h3', null, 'Display'), toggle('reduceFlashes', 'Reduce flashes'),
      h('div', { class: 'modes' }, (['full', 'reduced', 'off'] as const).map((id) => btn(`Shake: ${id}`, () => { settings.shake = id; saveSettings(); render(); }, 'btn small' + (settings.shake === id ? ' primary' : ''), { 'data-k': 'shake_' + id })))),
    h('div', { class: 'box' }, h('h3', null, 'App & updates'),
      h('p', { class: 'muted', 'data-k': 'installed_build' }, installedBuild()),
      h('p', { class: 'muted' }, 'On iPhone: Safari → Share → Add to Home Screen. After the first full online load, the game works offline. Songs are available offline after they have played.'),
      btn('Check for updates', async () => { const message = await checkForUpdates(() => world().persist()); if (W) world().toast(message); }, 'btn', { 'data-k': 'sys_update' })),
    h('p', { class: 'muted', style: 'font-size:0.85em' }, 'Phaser rebuild · additional display, controls and touch layout options are still being ported.'));
}
