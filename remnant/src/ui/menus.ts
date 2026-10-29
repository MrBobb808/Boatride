import { islandCalibrate, ISLAND_LEN } from './island';
import eliorBoard from '../assets/elior-board.webp';
// The pause menu (character, equipment, skills, Echoes, map, journal,
// crafting, settings, system), plus the merchant, the forge and altar menus.

import { checkForUpdate, applyUpdate, currentBuild } from '../core/update';
import { G, flag } from '../game/ctx';
import { h, btn, pushLayer, popLayer, clear, focusFirst } from './dom';
import { img, iconUrl } from './icons';
import { input, ACTION_LABELS, DEFAULT_KEYS, type Action } from '../core/input';
import { settings, saveSettings, resetSettings, isTouchDevice } from '../core/settings';
import { sfx, audio } from '../audio/audio';
import { songs } from '../audio/songs';
import { music } from '../audio/music';
import {
  ITEMS, SLOTS, SLOT_NAMES, STAT_KEYS, STAT_INFO, MOD_LABEL, RARITY_COLORS, RARITY_NAMES, TREES, SKILLS, ABILITIES,
  ECHO_SPECIES, ECHO_CLASS_INFO, ECHO_ROLES, SUPER_MOVES, ECHO_LEVEL_CAP, echoRole, LORE, FAMILY_NAMES, echoXpToNext, xpToNext,
  type ItemInst, type Slot, type ModKey, type AbilityId, type EchoInst, type StatKey,
} from '../game/data';
import {
  derive, getItem, itemMods, upgradeCost, MAX_PLUS, hasMaterials, payMaterials, makeItem, canLearn, learn, skillRank,
  echoMaxHp, echoAtk, addMaterial, equipAbility, unlockCombatSkills, COMBAT_UNLOCKS, allocateStat, learnRanks, isWorn,
} from '../game/state';
import { QUESTS } from '../game/story';
import { ROOMS, chapterOf } from '../game/rooms';
import { CH2_ROOM_IDS } from '../game/rooms2';
import { guidePoint } from '../game/guide';
import { FINISHERS } from '../game/finishers';
import { ECHO_COMBOS } from '../game/echoCombos';
import { MANTLE_LV, mantlePerks } from '../game/mantle';
import { nextChapter, travelToChapter, trainingOpen, startTraining } from '../game/chapters';
import { altarName, travelGroups, travelBlocked, travelTo } from '../game/travel';
import { restStock, restRecipes } from '../game/settlement';
import {
  storeOffers, buyOffer, storeBlocked, OFFER_KINDS, SHARD, keepReason, isLocked, toggleLock, needsConfirm, sellPrice, salvageOf,
  sellItem, dismantleItem, junk, sellJunk, buyback, canBuyBack, buyBack, type OfferKind,
} from '../game/economy';
import { ELIXIRS, elixirOn, elixirLeft, drinkElixir, type ElixirId } from '../game/elixirs';
import { chaptersTab, gameModes } from './chapters';
import { progressionTab } from './progression';
import { valorTab } from './valor';
import { titleOf } from '../game/valor';
import { GEAR_SETS } from '../game/progression';
import { bestiaryPanes, bestiaryCount } from './bestiary';
import { controllerBox, cancelPadCapture } from './controller';
import { openTouchEditor } from './touchEditor';
import { saveSlot, listSlots, lastSlot, deleteSlot, loadSlot, exportCode, importCode, SLOT_COUNT } from '../game/save';
import { formatTime, clamp } from '../core/math';
import { solve, newJoints } from '../render/skeleton';
import { drawHumanoid } from '../render/actors';
import { kitFor } from '../game/echoes';
import { TILE } from '../game/tiles';
import { FONT_DISPLAY } from '../render/draw';
import { returnToTitle, startNewGamePlus, loadGameSlot } from '../app';
import { replayCoach } from './coach';
import { installTips, hideTip, MOD_TIPS, DERIVED_TIPS, derivedRows } from './statTips';

let menuEl: HTMLElement | null = null;
let tab = 'character';
let bodyEl: HTMLElement;
let tabsEl: HTMLElement;
let skillsPage: 'abilities' | 'supers' | 'training' = 'abilities';
let pointBatch = 1;
function pointBatchPicker() {
  return h('div', { class: 'modes', style: 'flex-wrap:wrap;margin:8px 0' },
    h('span', { class: 'muted', style: 'align-self:center' }, 'Spend at once:'),
    [1, 5, 10, 25, 50].map((n) => btn(String(n), () => { pointBatch = n; render(); }, 'btn small' + (pointBatch === n ? ' primary' : ''), { 'data-k': 'points_' + n, 'aria-pressed': String(pointBatch === n) })));
}

export const isMenuOpen = () => !!menuEl || !!shopEl;

// Five sections on a rail, each with its own sub-tabs. Sub-tab ids are what
// openMenu() takes, so callers and tests keep naming a page directly.
const SECTIONS: { id: string; label: string; icon: string; tabs: { id: string; label: string; icon: string }[] }[] = [
  { id: 'journey', label: 'Journey', icon: 'map', tabs: [
    { id: 'quests', label: 'Quests', icon: 'journal' },
    { id: 'map', label: 'Map', icon: 'map' },
    { id: 'chapters', label: 'Chapters', icon: 'chapters' },
    { id: 'valor', label: 'Valor', icon: 'crown' },
  ] },
  { id: 'elior', label: 'Elior', icon: 'stats', tabs: [
    { id: 'character', label: 'Character', icon: 'stats' },
    { id: 'equipment', label: 'Equipment', icon: 'armor' },
    { id: 'skills', label: 'Skills', icon: 'skills' },
    { id: 'progression', label: 'Mastery', icon: 'sword' },
    { id: 'moves', label: 'Move list', icon: 'sword' },
    { id: 'crafting', label: 'Crafting', icon: 'craft' },
    { id: 'store', label: 'Store', icon: 'sigil' },
  ] },
  { id: 'echoes', label: 'Echoes', icon: 'echo', tabs: [
    { id: 'echoes', label: 'Squad', icon: 'echo' },
    { id: 'imprints', label: 'Imprints', icon: 'shard' },
  ] },
  { id: 'collection', label: 'Collection', icon: 'book', tabs: [
    { id: 'lore', label: 'Inscriptions', icon: 'book' },
    { id: 'bestiary', label: 'Bestiary', icon: 'journal' },
  ] },
  { id: 'settings', label: 'Settings', icon: 'gear', tabs: [
    { id: 'settings', label: 'Options', icon: 'gear' },
    { id: 'system', label: 'Save & system', icon: 'save' },
  ] },
];
let TABS = SECTIONS.flatMap((sec) => sec.tabs);

/** What an added section's pages get: the shared helpers, and a way to redraw or change page. */
export interface MenuPageKit {
  rerender: () => void;
  setTab: (t: string) => void;
  batch: () => number;
  pointBatchPicker: () => HTMLElement;
  itemIcon: typeof itemIcon;
  itemName: typeof itemName;
  modLines: typeof modLines;
  rarityStyle: typeof rarityStyle;
  lockButton: typeof lockButton;
}
type MenuSection = (typeof SECTIONS)[number];
const EXTRA_PAGES: Record<string, (kit: MenuPageKit) => HTMLElement> = {};
/** A host build adds a section of its own (the Phaser build's Tirzah), placed after the section named. The
 * original edition adds none. */
export function addMenuSection(sec: MenuSection, after: string, pages: Record<string, (kit: MenuPageKit) => HTMLElement>) {
  if (SECTIONS.some((x) => x.id === sec.id)) return;
  const i = SECTIONS.findIndex((x) => x.id === after);
  SECTIONS.splice(i < 0 ? SECTIONS.length : i + 1, 0, sec);
  TABS = SECTIONS.flatMap((x) => x.tabs);
  Object.assign(EXTRA_PAGES, pages);
}
const pageKit = (): MenuPageKit => ({ rerender: render, setTab, batch: () => pointBatch, pointBatchPicker, itemIcon, itemName, modLines, rarityStyle, lockButton });
/** Old page names still open the right sub-tab. */
const ALIASES: Record<string, string> = { journal: 'quests' };
const sectionOf = (t: string) => SECTIONS.find((sec) => sec.tabs.some((x) => x.id === t)) ?? SECTIONS[0];
let railEl: HTMLElement;
/** The sub-tab last open in each section, so a section reopens where you left it. */
const lastIn: Record<string, string> = {};

function pause(on: boolean) {
  G.paused = on;
  if (!audio.ready) return;
  audio.setMuffled(on);
  if (!on) input.flush();
}

let only: string | null = null;

export function openMenu(t?: string, settingsOnly = false) {
  if (menuEl) {
    if (t) setTab(t);
    return;
  }
  only = settingsOnly ? 'settings' : null;
  if (!only && (!G.save || G.inCutscene)) return;
  sfx('uiOpen');
  pause(true);
  if (t) tab = ALIASES[t] ?? t;
  if (only) tab = only;
  tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  railEl = h('div', { class: 'menu-rail', role: 'tablist', 'aria-label': 'Menu sections' });
  bodyEl = h('div', { class: 'menu-body' });
  const close = btn(only ? 'Done' : 'Resume', () => closeMenu(), 'btn small menu-close', { 'data-k': 'menu_resume' });
  menuEl = h('div', { class: 'menu sectioned' + (only ? ' only' : '') }, railEl, h('div', { class: 'menu-main' }, h('div', { class: 'menu-top' }, tabsEl, close), bodyEl));
  document.getElementById('ui')!.appendChild(menuEl);
  installTips(menuEl);
  renderTabs();
  render();
  pushLayer({
    el: menuEl,
    onBack: () => closeMenu(),
    onAction: (a) => {
      if ((a === 'tabL' || a === 'tabR') && only) return true;
      if (a === 'tabL' || a === 'tabR') {
        if (document.activeElement && (document.activeElement as HTMLElement).classList.contains('key')) return false;
        const i = TABS.findIndex((x) => x.id === tab);
        setTab(TABS[(i + (a === 'tabR' ? 1 : TABS.length - 1)) % TABS.length].id);
        return true;
      }
      if (a === 'menu') { closeMenu(); return true; }
      if (a === 'map') { setTab('map'); return true; }
      return false;
    },
  });
}

export function closeMenu() {
  if (!menuEl) return;
  cancelPadCapture();
  popLayer(menuEl);
  hideTip();
  menuEl = null;
  pause(false);
  if (G.save) G.world.player.styleKey = '';
  only = null;
  sfx('uiBack');
}

function setTab(t: string) {
  cancelPadCapture();
  tab = ALIASES[t] ?? t;
  sfx('ui');
  renderTabs();
  render();
}

function renderTabs() {
  clear(tabsEl);
  clear(railEl);
  const cur = sectionOf(tab);
  if (!only) for (const sec of SECTIONS) {
    const on = sec === cur;
    railEl.appendChild(h('button', { class: 'sec' + (on ? ' on' : ''), 'data-nav': '', role: 'tab', 'aria-selected': String(on), 'data-k': 'sec_' + sec.id,
      onclick: () => { if (!on) setTab(sec.tabs.some((x) => x.id === lastIn[sec.id]) ? lastIn[sec.id] : sec.tabs[0].id); } },
      h('img', { src: iconUrl(sec.icon, on ? '#f6dea0' : '#9b92a6'), alt: '' }), h('span', null, sec.label)));
  }
  lastIn[cur.id] = tab;
  for (const t of cur.tabs) {
    if (only && t.id !== only) continue;
    const b = h('button', { class: 'tab' + (t.id === tab ? ' on' : ''), 'data-nav': '', role: 'tab', 'aria-selected': String(t.id === tab), 'data-k': 'tab_' + t.id, onclick: () => setTab(t.id) }, h('img', { src: iconUrl(t.icon, t.id === tab ? '#f6dea0' : '#9b92a6'), alt: '' }), t.label);
    tabsEl.appendChild(b);
  }
  // Too many tabs for the width: inactive ones shrink to icons; keep the open one in view.
  tabsEl.classList.remove('compact');
  if (tabsEl.scrollWidth > tabsEl.clientWidth + 1) tabsEl.classList.add('compact');
  const on = tabsEl.querySelector('.tab.on');
  if (on) {
    const a = tabsEl.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.left < a.left || r.right > a.right) tabsEl.scrollLeft += r.left - a.left - (a.width - r.width) / 2;
  }
}

function render() {
  if (!bodyEl) return;
  const keepScroll = (bodyEl.querySelector('.scroll') as HTMLElement | null)?.scrollTop ?? 0;
  const focusId = (document.activeElement as HTMLElement | null)?.dataset?.k;
  clear(bodyEl);
  hideTip();
  if (G.save) G.d = derive(G.save);
  switch (tab) {
    case 'character': bodyEl.appendChild(characterTab()); break;
    case 'equipment': bodyEl.appendChild(equipmentTab()); break;
    case 'progression': bodyEl.appendChild(progressionTab()); break;
    case 'skills': bodyEl.appendChild(skillsTab()); break;
    case 'echoes': bodyEl.appendChild(echoesTab()); break;
    case 'map': bodyEl.appendChild(mapTab()); break;
    case 'chapters': bodyEl.appendChild(chaptersTab(closeMenu)); break;
    case 'valor': bodyEl.appendChild(valorTab(render)); break;
    case 'quests': bodyEl.appendChild(journalTab('quests')); break;
    case 'lore': bodyEl.appendChild(journalTab('lore')); break;
    case 'bestiary': bodyEl.appendChild(journalTab('beasts')); break;
    case 'moves': bodyEl.appendChild(h('div', { class: 'col scroll', style: 'flex:1' }, techniques())); break;
    case 'imprints': bodyEl.appendChild(h('div', { class: 'col scroll', style: 'flex:1' }, echoImprintPanel())); break;
    case 'crafting': bodyEl.appendChild(craftingTab()); break;
    case 'store': bodyEl.appendChild(storeTab()); break;
    case 'settings': bodyEl.appendChild(settingsTab()); break;
    case 'system': bodyEl.appendChild(systemTab()); break;
    default: if (EXTRA_PAGES[tab]) bodyEl.appendChild(EXTRA_PAGES[tab](pageKit()));
  }
  const sc = bodyEl.querySelector('.scroll') as HTMLElement | null;
  if (sc) sc.scrollTop = keepScroll;
  if (focusId && input.lastDevice !== 'touch') (bodyEl.querySelector(`[data-k="${focusId}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- character

function characterTab() {
  const s = G.save;
  const d = G.d;
  const amount = Math.min(pointBatch, s.statPoints);
  const preview = (k: StatKey, by = amount) => {
    if (!by) return '';
    const next = derive({ ...s, stats: { ...s.stats, [k]: s.stats[k] + by } });
    const pair = (label: string, a: number, b: number, unit = '') => `${label} ${a.toFixed(1)}${unit} → ${b.toFixed(1)}${unit}`;
    return k === 'vit' ? pair('HP', d.maxHp, next.maxHp) : k === 'str' ? pair('Attack', d.atk, next.atk) :
      k === 'agi' ? pair('Attack speed', d.aspd, next.aspd, '×') + ' · ' + pair('Crit', d.crit * 100, next.crit * 100, '%') :
      k === 'end' ? pair('HP', d.maxHp, next.maxHp) + ' · ' + pair('Reduction', d.dr * 100, next.dr * 100, '%') :
      k === 'res' ? pair('Echo damage', d.echoDmg, next.echoDmg, '×') + ' · ' + pair('Super charge', d.rallyMult, next.rallyMult, '×') :
      pair('Ability power', d.abil, next.abil, '×') + ' · ' + pair('Energy', d.maxCe, next.maxCe);
  };
  const rows = STAT_KEYS.map((k) => h('div', { class: 'stat-row' },
    h('div', { 'data-tip': `${STAT_INFO[k].desc} Next ${amount || 1} point${(amount || 1) > 1 ? 's' : ''}: ${preview(k, amount || 1)}.`, 'data-k': 'tip_' + k }, h('div', { class: 'nm' }, STAT_INFO[k].name), h('div', { class: 'ds' }, STAT_INFO[k].desc), amount ? h('div', { class: 'ds up', 'data-k': 'preview_' + k }, preview(k)) : null),
    h('div', { class: 'val' }, String(d.stats[k]), d.stats[k] !== s.stats[k] ? h('span', { class: 'up', style: 'font-size:0.7em;margin-left:4px' }, `(${s.stats[k]}+${d.stats[k] - s.stats[k]})`) : null),
    btn('+' + (amount || 1), () => { spendStat(k); }, 'btn plus', { disabled: s.statPoints <= 0, 'data-k': 'st_' + k, 'aria-label': 'Raise ' + STAT_INFO[k].name + ' by ' + amount, 'data-tip': `${STAT_INFO[k].name}: ${preview(k, amount || 1)}.` }),
  ));
  rows.push(h('div', { class: 'stat-row' }, h('div', null, h('div', { class: 'nm' }, 'Covenant Energy'), h('div', { class: 'ds' }, flag('relic_taken') ? 'Fuels abilities. Grows with Wisdom.' : 'Dormant. Something in the temple may wake it.')), h('div', { class: 'val' }, flag('relic_taken') ? String(d.maxCe) : '—'), h('span')));
  rows.push(h('div', { class: 'stat-row' }, h('div', null, h('div', { class: 'nm' }, 'Summon Capacity'), h('div', { class: 'ds' }, 'Echoes that can fight beside you at once. Grows with the story and the Commander tree.')), h('div', { class: 'val' }, String(d.echoSlots)), h('span')));
  const pct = (v: number) => (v * 100).toFixed(1) + '%';
  const derived = h('div', { class: 'kv' },
    'Health', `${Math.ceil(s.hp)} / ${d.maxHp}`,
    'Health regeneration', `${(d.hpRegen * 100).toFixed(1)}% / sec · after 4s unharmed`,
    'Attack power', d.atk.toFixed(1),
    'Damage reduction', pct(d.dr),
    'Critical chance', pct(d.crit),
    'Critical damage', '×' + d.critDmg.toFixed(2),
    'Attack speed', '×' + d.aspd.toFixed(2),
    'Move speed', '×' + d.speed.toFixed(2),
    'Ability power', '×' + d.abil.toFixed(2),
    'Skill recharge', '×' + d.skillRecharge.toFixed(2),
    'Melee skill bonus', '×' + d.meleeMult.toFixed(2),
    'Parry window', (d.parryWin * 1000).toFixed(0) + ' ms',
    'Super charge rate', '×' + d.rallyMult.toFixed(2),
    'Echo damage', '×' + d.echoDmg.toFixed(2),
    'Echo health', '×' + d.echoHp.toFixed(2),
    'Weapon', FAMILY_NAMES[d.family],
  );
  for (const [i, el] of Array.from(derived.childNodes).entries()) {
    const label = (el as Text).textContent ?? '';
    const sp = h('span', i % 2 === 0 && DERIVED_TIPS[label] ? { 'data-tip': DERIVED_TIPS[label], 'data-k': 'dtip_' + i, class: 'tipped' } : null, label);
    derived.replaceChild(sp, el);
    void i;
  }
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' },
      h('div', { class: 'box', style: 'flex:1.3;min-width:280px' },
        h('h3', null, `Elior — Level ${s.level}`, titleOf(s) ? h('span', { class: 'worn-title', 'data-k': 'worn_title' }, titleOf(s)) : null),
        btn('Character board', () => openCharacterBoard(), 'btn small', { 'data-k': 'elior_board' }),
        h('div', { class: 'muted', style: 'font-size:0.9em;margin-bottom:6px' }, `Experience ${Math.floor(s.xp)} / ${xpToNext(s.level)} · Points to spend: `, h('b', { style: 'color:var(--gold-hi)' }, String(s.statPoints))),
        h('div', { class: 'bar', style: 'margin-bottom:8px' }, h('i', { style: `width:${(s.xp / xpToNext(s.level)) * 100}%` })),
        h('p', { class: 'muted', style: 'font-size:0.85em' }, 'Controlled power growth: levels add health and equipment attack, with smaller attack gains after level 100. Offensive attributes soften above 60; every point still helps. Ability and Echo bonuses add together. Life steal restores at most 4% maximum health per second.'),
        pointBatchPicker(), rows,
      ),
      h('div', { class: 'col', style: 'flex:1;min-width:220px' },
        h('div', { class: 'box' }, h('h3', null, 'Derived'), derived),
        h('div', { class: 'box' }, h('h3', null, 'Progress'), h('div', { class: 'kv' },
          h('span', null, 'Silver'), h('span', null, String(s.silver)),
          h('span', null, 'Balm charges'), h('span', null, `${s.balm} / ${s.balmMax}`),
          h('span', null, 'Echoes purified'), h('span', null, String(s.echoes.length)),
          h('span', null, 'Inscriptions'), h('span', null, String(s.lore.length)),
          h('span', null, 'Time played'), h('span', null, formatTime(s.playtime)),
          h('span', null, 'Cycle'), h('span', null, s.ng ? `New Game+${s.ng > 1 ? ' ' + s.ng : ''}` : 'First journey'),
        )),
      ),
    ),
  );
}

function openCharacterBoard() {
  const card = h('div', { class: 'panel scroll', style: 'width:min(1100px,96vw);max-height:92dvh;padding:12px' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin-bottom:10px' },
      h('h3', null, 'Elior · Character board'),
      btn('Close', () => popLayer(layer), 'btn small', { 'data-autofocus': '', 'data-k': 'board_close' }),
    ),
    h('img', { src: eliorBoard, alt: 'Elior, a Black swordsman with white hair and beard, navy and gold armor, chain attacks, and his Shadow Mantle transformation.', style: 'display:block;width:100%;height:auto;border-radius:4px' }),
  );
  const layer = h('div', { class: 'layer dim' }, card);
  document.getElementById('ui')!.appendChild(layer);
  pushLayer({ el: layer, onBack: () => popLayer(layer) });
}

function spendStat(k: StatKey) {
  const s = G.save;
  const before = G.d.maxHp;
  if (!allocateStat(s, k, pointBatch)) return;
  G.d = derive(s);
  s.hp = Math.min(G.d.maxHp, s.hp + Math.max(0, G.d.maxHp - before));
  for (const echo of G.world.echoes) echo.refreshStats();
  G.world.autosave(true);
  sfx('uiConfirm');
  render();
}

// ---------------------------------------------------------------- equipment

let eqSlot: Slot = 'weapon';
let eqSel: string | null = null;

function rarityStyle(r: number) {
  return `color:${RARITY_COLORS[r]}`;
}

function itemName(it: ItemInst) {
  return ITEMS[it.id].name + (it.lootPower ? ` · Power ${it.lootPower}` : '') + (it.trialTier ? ` · Ascension ${it.trialTier}` : '') + (it.plus ? ` +${it.plus}` : '');
}

function modLines(m: Partial<Record<ModKey, number>>, cmp?: Partial<Record<ModKey, number>>) {
  const keys = new Set<ModKey>([...Object.keys(m), ...(cmp ? Object.keys(cmp) : [])] as ModKey[]);
  const out: HTMLElement[] = [];
  for (const k of keys) {
    const v = m[k] ?? 0;
    if (!v && !cmp) continue;
    const c = cmp ? (cmp[k] ?? 0) : null;
    const diff = c !== null ? v - c : 0;
    out.push(h('div', { 'data-tip': MOD_TIPS[k], 'data-k': 'mtip_' + k, class: 'tipped' }, v ? MOD_LABEL[k](Math.round(v * 10) / 10) : h('span', { class: 'muted' }, MOD_LABEL[k](0).replace('+0', '—')),
      cmp && Math.abs(diff) > 0.05 ? h('span', { class: diff > 0 ? 'up' : 'down', style: 'margin-left:8px;font-size:0.85em' }, (diff > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(diff * 10) / 10)) : null));
  }
  return out;
}

function itemIcon(it: ItemInst | { id: string; rarity: number }) {
  return img(ITEMS[it.id].icon, RARITY_COLORS[it.rarity]);
}

function equipmentTab() {
  const s = G.save;
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
  }, itemIcon(it), h('div', null, h('div', { class: 'nm', style: rarityStyle(it.rarity) }, itemName(it)), h('div', { class: 'sub' }, RARITY_NAMES[it.rarity] + ' ' + SLOT_NAMES[eqSlot])), it.uid === equippedUid ? h('span', { class: 'tag' }, 'EQUIPPED') : h('span'))) : h('div', { class: 'muted', style: 'padding:8px' }, 'Nothing for this slot yet. Chests, foes and Ilan\'s stall may have something.'));
  const sel = items.find((i) => i.uid === eqSel);
  let detail: HTMLElement;
  if (sel) {
    const base = ITEMS[sel.id];
    const eq = getItem(s, equippedUid);
    const isEq = sel.uid === equippedUid;
    const mods = itemMods(sel);
    detail = h('div', { class: 'box' },
      h('div', { style: 'display:flex;gap:10px;align-items:center' }, itemIcon(sel), h('div', null, h('div', { class: 'title-text', style: rarityStyle(sel.rarity) + ';font-size:1.05em' }, itemName(sel)), h('div', { class: 'eyebrow' }, `${RARITY_NAMES[sel.rarity]} · ${SLOT_NAMES[eqSlot]}${base.family ? ' · ' + FAMILY_NAMES[base.family] : ''}`))),
      h('hr', { class: 'rule' }),
      h('div', null, modLines(mods, !isEq && eq ? itemMods(eq) : undefined)),
      isEq ? null : ifEquipped(sel.uid),
      h('p', { class: 'muted', style: 'margin:8px 0 0' }, base.desc),
      base.set ? h('div', { class: 'set-detail' },
        h('b', { style: `color:${GEAR_SETS[base.set].color}` }, `${GEAR_SETS[base.set].name} · ${G.d.sets[base.set]}/3 equipped`),
        h('p', { class: G.d.sets[base.set] >= 2 ? 'up' : 'muted' }, `2 pieces: ${GEAR_SETS[base.set].two}`),
        h('p', { class: G.d.sets[base.set] >= 3 ? 'up' : 'muted' }, `3 pieces: ${GEAR_SETS[base.set].three}`),
      ) : null,
      sel.trialWave ? h('p', { class: 'muted' }, `Earned at Trial wave ${sel.trialWave}${sel.trialTier ? ` · +${Math.min(100, sel.trialTier) * 15}% base gear power` : ''}.`) : null,
      sel.lootWave ? h('p', { class: 'up' }, `Wave ${sel.lootWave} reward · Power ${sel.lootPower}. Greater Power increases this item's stats. Equip it to gain the bonus.`) : null,
      base.lore ? h('p', { style: 'font-style:italic;margin:6px 0 0;font-size:0.92em' }, base.lore) : null,
      !isEq && eq ? h('div', { class: 'muted', style: 'font-size:0.82em;margin-top:6px' }, `Compared with ${itemName(eq)} (equipped).`) : null,
      h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
        isEq
          ? btn('Unequip', () => { if (eqSlot !== 'weapon') { delete s.equipment[eqSlot]; refreshEquip(); } }, 'btn', { disabled: eqSlot === 'weapon', 'data-k': 'unequip' })
          : btn('Equip', () => { s.equipment[eqSlot] = sel.uid; sfx('uiConfirm'); refreshEquip(); }, 'btn primary', { 'data-k': 'equip' }),
        base.unique ? null : lockButton(sel),
      ),
    );
  } else detail = h('div', { class: 'box muted' }, 'Select an item.');
  const mats = Object.entries(s.materials).filter(([, n]) => n > 0);
  return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
    h('div', { class: 'col', style: 'flex:1.1;min-height:0' }, slotChips, h('div', { class: 'scroll', style: 'flex:1' }, list)),
    h('div', { class: 'col scroll', style: 'flex:1;min-height:0' }, btn('Weapon mastery & armor sets', () => setTab('progression'), 'btn small', { 'data-k': 'view_progression' }), detail,
      h('div', { class: 'box' }, h('h3', null, 'Materials & relics'),
        h('div', { class: 'mats' }, mats.length ? mats.map(([k, n]) => h('span', null, h('b', null, `${n}× `), ITEMS[k].name)) : h('span', null, 'None yet.')),
        s.keyItems.length ? h('div', { class: 'mats', style: 'margin-top:6px' }, s.keyItems.map((k) => h('span', { style: 'color:var(--gold-hi)' }, ITEMS[k]?.name ?? k))) : null,
      ),
    ),
  );
}

/** Current vs new: what equipping this item changes on the character sheet. */
function ifEquipped(uid: string) {
  const s = G.save, now = derivedRows(G.d), next = derivedRows(derive({ ...s, equipment: { ...s.equipment, [eqSlot]: uid } }));
  const rows = now.flatMap(([label, a, f], i) => {
    const b = next[i][1];
    if (Math.abs(b - a) < Math.max(1e-6, Math.abs(a) * 0.0005)) return [];
    return [h('span', { 'data-tip': DERIVED_TIPS[label] ?? '', class: 'tipped' }, label), h('span', { class: b > a ? 'up' : 'down' }, `${f(a)} → ${f(b)}`)];
  });
  return h('div', { class: 'if-equipped', 'data-k': 'if_equipped' }, h('div', { class: 'eyebrow' }, 'If equipped'),
    rows.length ? h('div', { class: 'kv' }, rows) : h('div', { class: 'muted' }, 'No change to your numbers.'),
    h('small', { class: 'muted' }, 'Hold or hover any line for what it does.'));
}

function refreshEquip() {
  G.d = derive(G.save);
  G.save.hp = Math.min(G.save.hp, G.d.maxHp);
  G.world.player.styleKey = '';
  G.world.player.refreshLook();
  for (const e of G.world.echoes) e.refreshStats();
  render();
}

// ---------------------------------------------------------------- skills

let skSel: string = SKILLS[0].id;
let loadoutSlot = 0;

function skillsTab() {
  const s = G.save;
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
      if (learnRanks(s, node.id, pointBatch)) {
        sfx('levelup', { vol: 0.5 });
        G.d = derive(s);
        G.world.player.styleKey = '';
        for (const echo of G.world.echoes) echo.refreshStats();
        G.world.autosave(true);
        render();
      }
    }, 'btn primary', { disabled: !canLearn(s, node.id), 'data-k': 'learn' })),
  );
  const nav = h('div', { class: 'modes', style: 'flex-wrap:wrap' },
    (['abilities', 'supers', 'training'] as const).map((v) => btn(v === 'abilities' ? 'Equip abilities' : v === 'supers' ? 'Super moves' : 'Passive skills', () => { skillsPage = v; render(); }, 'btn small' + (skillsPage === v ? ' primary' : ''), { 'data-k': 'skills_' + v, 'aria-pressed': String(skillsPage === v) })));
  const loadout = h('div', { class: 'slots ability-slots' }, [0, 1, 2].map((i) => {
    const id = s.equippedSkills[i];
    return btn([id ? img(ABILITIES[id].icon, '#f6dea0') : img('shard', '#6e6385'), h('span', null, `Slot ${i + 1}`, h('small', null, id ? ABILITIES[id].name : 'Empty'))], () => { loadoutSlot = i; render(); }, 'slot' + (i === loadoutSlot ? ' sel' : ''), { 'data-k': 'ls_' + i, 'aria-label': `Select ability slot ${i + 1}`, 'aria-pressed': String(i === loadoutSlot) });
  }));
  const catalog = h('div', { class: 'ability-catalog' }, Object.values(ABILITIES).map((def) => {
    const owned = s.abilities.includes(def.id), where = s.equippedSkills.indexOf(def.id);
    const node = SKILLS.find((n) => n.grants === def.id), level = COMBAT_UNLOCKS[def.id];
    const lock = level ? `Relic required · Level ${level}` : node ? `Learn ${node.name} in Passive skills` : 'Unlocked during the temple story';
    return h('div', { class: 'ability-card' + (where >= 0 ? ' equipped' : '') },
      h('div', { class: 'row', style: 'align-items:center;gap:10px' }, img(def.icon, owned ? '#f6dea0' : '#746684'), h('div', null, h('h3', null, def.name), h('div', { class: 'eyebrow' }, `${def.cost} Energy · ${def.cd}s cooldown`))),
      h('p', null, def.desc),
      !owned ? h('div', { class: 'muted', style: 'font-size:0.85em;margin-bottom:8px' }, lock) : null,
      btn(!owned ? 'Locked' : where === loadoutSlot ? `Equipped · Slot ${where + 1}` : `Equip in Slot ${loadoutSlot + 1}`, () => {
        if (equipAbility(s, def.id, loadoutSlot)) { sfx('uiConfirm'); G.world.autosave(true); render(); }
      }, 'btn small' + (where === loadoutSlot ? ' primary' : ''), { disabled: !owned, 'data-k': 'ab_' + def.id }),
      where >= 0 && where !== loadoutSlot ? h('span', { class: 'tag', style: 'margin-left:8px' }, `SLOT ${where + 1}`) : null);
  }));
  const regenRank = skillRank(s, 'g_regen');
  const regeneration = h('div', { class: 'box' }, h('h3', null, `Health regeneration · ${regenRank}/10`),
    h('p', { class: 'muted' }, 'Recover 0.75% maximum health per second per rank after 4 seconds without taking damage. Mending Light and Covenant Renewal add healing during combat.'),
    btn(regenRank === 10 ? 'Regeneration mastered' : 'Train Regeneration · 1 point', () => {
      if (learn(s, 'g_regen')) { G.d = derive(s); G.world.autosave(true); sfx('levelup', { vol: 0.5 }); render(); }
    }, 'btn small', { disabled: !canLearn(s, 'g_regen'), 'data-k': 'learn_regen' }));
  const supers = h('div', { class: 'ability-catalog' }, Object.entries(SUPER_MOVES).map(([id, def]) => h('div', { class: 'ability-card' + ((s.equippedSuper ?? 'rally') === id ? ' equipped' : '') },
    h('div', { class: 'row', style: 'align-items:center;gap:10px' }, img(def.icon, def.color), h('h3', null, def.name)),
    h('p', null, def.desc),
    btn((s.equippedSuper ?? 'rally') === id ? 'Equipped super' : 'Equip super', () => {
      s.equippedSuper = id as keyof typeof SUPER_MOVES; G.world.autosave(true); sfx('uiConfirm'); render();
    }, 'btn small', { disabled: !s.flags.relic_taken, 'data-k': 'super_' + id, 'aria-pressed': String((s.equippedSuper ?? 'rally') === id) }))));
  return h('div', { class: 'col scroll', style: 'flex:1' }, nav,
    skillsPage === 'abilities' ? h('div', { class: 'col' },
      h('div', { class: 'box' }, h('h3', null, 'Ability loadout'), h('p', { class: 'muted' }, 'Select a slot, then equip a skill from the catalog. Each ability can occupy one slot.'), loadout,
        btn('Clear selected slot', () => { equipAbility(s, null, loadoutSlot); G.world.autosave(true); render(); }, 'btn small', { 'data-k': 'ability_clear', style: 'margin-top:8px' })), catalog, regeneration) :
    skillsPage === 'supers' ? h('div', { class: 'col' }, h('div', { class: 'box' }, h('h3', null, 'Choose your super move'), h('p', { class: 'muted' }, 'All four options use the same full Super gauge, charged through battle. The Shadow Mantle remains your separate transformation.'), !s.flags.relic_taken ? h('p', { class: 'muted' }, 'Recover the relic in the temple to unlock supers.') : null), supers) :
    h('div', { class: 'col' }, h('div', { class: 'eyebrow' }, `${s.skillPoints} skill points available`), regeneration, detail, trees));
}

/** Move list: every combo route, with inputs shown for the device in use. */
function techniques() {
  const s = G.save;
  const touch = input.lastDevice === 'touch';
  const K = (a: Action) => (touch ? ({ attack: 'Attack', heavy: 'hold Attack', dodge: 'Dodge', parry: 'Parry', up: 'stick up', down: 'stick down', jump: 'Jump' } as Record<string, string>)[a] ?? a : input.label(a));
  const phantom = !!flag('phantom');
  const rows: [string, string, string, boolean][] = [
    ['Combo', `${K('attack')} ×3`, 'Strike, strike, finisher.', true],
    ['Seventy Times Seven', `${K('attack')}, ${K('attack')}, pause, ${K('attack')}`, 'A storm of thrusts that ends in a driving lunge.', true],
    ['Storm of Edges', touch ? 'hold Attack on the third strike' : `${K('heavy')} during the third strike`, 'Whirl with the blade out, dragging foes into the cut.', true],
    ['Phantom Step', `land a hit, then ${K('dodge')}`, 'Blink behind your foe and strike. Tap again to blink around every enemy nearby. 5 energy each.', phantom],
    ['Judgment Cross', `after 3 Phantom Steps, ${K('attack')}`, 'A crossing cut that breaks guards and launches. 10 energy.', phantom],
    ['Rising Comet', `${K('dodge')} ${K('attack')} (dash strike), then ${K('attack')}`, 'Carry your foe skyward with you.', true],
    ['Launcher', `${K('up')} + ${K('attack')}`, 'Lift a foe; jump to follow it up.', true],
    ['Air Dash', `${K('dodge')} in the air`, 'A dash through the air; it also keeps an air combo going.', true],
    ['Air Combo', `${K('attack')} ×3 in the air`, 'Keeps you and your foe aloft.', true],
    ["Heaven's Rend", `after an air combo, ${touch ? 'Attack again' : K('heavy')}`, 'Drill down through everything beneath you.', true],
    ['Plunge', `${K('down')} + ${K('attack')} in the air`, 'Crash down with a shockwave.', true],
    ['Charged Strike', `hold ${touch ? 'Attack' : K('heavy')}`, 'Three charge levels; the last breaks guards.', true],
    ['Parry & Counter', `${K('parry')} as a blow lands, then ${K('attack')}`, 'Turn their strength against them.', true],
    ['Execution', `${K('attack')} a staggered foe`, 'Plays a finisher, picked at random from those you have learned.', true],
    ['Sub-weapon', touch ? 'the Sub button' : `${K('sub')}, or ${K('up')} + ${K('heavy')}`, 'Throw the sub-weapon you carry. Costs hearts; lamps drop more.', !!s.sub],
    ['Chain Reach', 'heavy strikes and combo finishers', 'A linked chain extends selected attacks by 30 units. The blade retracts after the strike.', true],
    ['Mantle Pursuit', 'Attack while transformed', 'Blink into melee range of a visible foe ahead. Dodge can blink before your first hit, with no energy cost.', s.level >= MANTLE_LV],
    ['Throw + Blink', touch ? 'the Throw button while transformed' : `${K('sub')} while transformed`, 'Throw your weapon; a confirmed hit teleports you to the foe and starts the next combo strike. No hearts. 2.4 second cooldown. A miss returns the weapon.', s.level >= MANTLE_LV],
    ['Shadow Mantle', `${touch ? 'the Mantle button' : K('transform')} with a full gauge${s.level >= MANTLE_LV ? '' : ` · level ${MANTLE_LV}`}`,
      `Transform: a black cloak edged in blue-violet light and trailing shadow. ${mantlePerks(Math.max(MANTLE_LV, s.level))}. Fill the gauge by fighting.`, s.level >= MANTLE_LV],
    ...FINISHERS.map((f): [string, string, string, boolean] => [
      `Finisher: ${f.name}`, f.level > 1 ? `level ${f.level}${f.id === 'element' ? ', elemental weapon' : ''}` : 'from the start', f.desc, s.level >= f.level,
    ]),
  ];
  return h('div', { class: 'box' },
    h('h3', null, `Techniques · best combo ${s.bestCombo ?? 0} hits`),
    h('div', { class: 'list' }, rows.map(([name, inputs, desc, ok]) => h('div', { class: 'row-item', style: ok ? '' : 'opacity:0.45' },
      h('div', null, h('div', { class: 'nm' }, name + (ok ? '' : ' (not yet learned)')), h('div', { class: 'sub' }, `${inputs} · ${desc}`)),
    ))),
  );
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

function echoesTab() {
  const s = G.save;
  const d = G.d;
  const imprints = echoImprintPanel();
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
    const active = s.active.includes(e.uid);
    return h('button', { class: 'row-item' + (e.uid === ecSel ? ' sel' : ''), 'data-nav': '', 'data-k': 'ec_' + e.uid, onclick: () => { ecSel = e.uid; render(); } },
      img(e.species === 'archer' ? 'archer_echo' : 'sentinel_echo', '#fff3c4'),
      h('div', null, h('div', { class: 'nm' }, esp.stages[e.stage].name + (e.commander ? ' ★' : '')), h('div', { class: 'sub' }, `${ECHO_ROLES[echoRole(e)].name} · Level ${e.level} · ${esp.stages[e.stage].title}`)),
      h('span', { class: 'tag' }, active ? 'ACTIVE' : 'RESERVE'));
  }));
  const active = s.active.includes(sel.uid);
  const canActivate = active || s.active.length < d.echoSlots;
  const maxHp = echoMaxHp(s, sel, d);
  const detail = h('div', { class: 'box' },
    h('div', { class: 'echo-card' }, echoPortrait(sel),
      h('div', null,
        h('div', { class: 'title-text', style: 'font-size:1.05em' }, sp.stages[sel.stage].name + (sel.commander ? ' — Commander' : '')),
        h('div', { class: 'eyebrow' }, `${ECHO_ROLES[echoRole(sel)].name} · ${sp.stages[sel.stage].title}`),
        h('div', { class: 'muted', style: 'font-size:0.85em;margin:4px 0' }, `Original form: ${sp.stages[0].name}`),
        h('div', { class: 'kv', style: 'margin-top:4px' },
          h('span', null, 'Level'), h('span', null, `${sel.level} / ${ECHO_LEVEL_CAP}`),
          h('span', null, 'Health'), h('span', null, `${Math.ceil(sel.hp > 0 ? Math.min(sel.hp, maxHp) : 0)} / ${maxHp}`),
          h('span', null, 'Attack'), h('span', null, echoAtk(s, sel, d).toFixed(1)),
        ),
        h('div', { class: 'bar', style: 'margin-top:6px' }, h('i', { style: `width:${sel.level >= ECHO_LEVEL_CAP ? 100 : (sel.xp / echoXpToNext(sel.level)) * 100}%` })),
      )),
    h('p', { style: 'margin:8px 0 4px' }, sp.stages[sel.stage].desc),
    h('p', { style: 'margin:0 0 6px;color:var(--gold-hi)' }, ECHO_ROLES[echoRole(sel)].signature[sel.stage]),
    h('p', { class: 'muted' }, sel.stage < 2 ? `Defeat its original form and absorb another imprint to evolve into ${sp.stages[sel.stage + 1].name}. No level or material cost. Start its rematch below.` : `Final form reached. Further absorptions restore health and raise its level, up to ${ECHO_LEVEL_CAP}.`),
    h('p', { class: 'muted' }, 'One Echo per original form. Duplicate imprints evolve and reinforce it. Fighting, defeating foes and protecting Elior earn experience; each level increases health and attack.'),
    h('h3', null, 'Combat role'),
    h('div', { class: 'echo-roles' }, Object.entries(ECHO_ROLES).map(([id, role]) => btn([img(role.icon, role.color), h('span', null, role.name)], () => {
      sel.role = id as keyof typeof ECHO_ROLES;
      G.world.echoes.find((e) => e.inst.uid === sel.uid && !e.remove)?.setRole(sel.role);
      G.world.autosave(true); sfx('uiConfirm'); render();
    }, 'btn small' + (echoRole(sel) === id ? ' primary' : ''), { 'data-k': 'role_' + id, 'aria-pressed': String(echoRole(sel) === id) }))),
    h('p', { class: 'muted', style: 'font-size:0.85em' }, ECHO_ROLES[echoRole(sel)].desc),
    h('details', { class: 'combo-guide', 'data-k': 'echo_combinations' },
      h('summary', null, 'Squad combination attacks'),
      h('p', { class: 'muted' }, 'Summon the two roles together. Their special moves open a short window for an automatic link. Each pair rests for 7 seconds after a link.'),
      ECHO_COMBOS.map(c => h('p', null, h('strong', { style: `color:${c.color}` }, c.name + ' · '), c.desc))),
    btn('Voice squad orders', () => { closeMenu(); G.ui.voiceOrders(); }, 'btn', { 'data-k': 'echo_voice' }),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
      btn('Rematch original form', () => { closeMenu(); startTraining(1, true, sel.species); }, 'btn primary', { disabled: G.world.bossActive || G.inCutscene || G.world.story.ch3.rounds.active, 'data-k': 'echo_rematch' }),
      btn(active ? 'Move to reserve' : 'Make active', () => {
        if (active) s.active = s.active.filter((u) => u !== sel.uid);
        else if (s.active.length < d.echoSlots) s.active.push(sel.uid);
        syncArmy();
      }, 'btn', { disabled: !canActivate, 'data-k': 'ec_act' }),
      btn((s.squadPick ?? []).includes(sel.uid) ? 'Remove from squad pick' : 'Add to squad pick', () => { const pick = s.squadPick ?? []; s.squadPick = pick.includes(sel.uid) ? pick.filter(u => u !== sel.uid) : [...pick, sel.uid]; G.world.autosave(true); render(); }, 'btn', { 'data-k': 'ec_squad' }),
      skillRank(s, 'c_warden') ? btn(sel.commander ? 'Relieve command' : 'Promote to Commander', () => {
        const was = sel.commander;
        for (const e of s.echoes) e.commander = false;
        sel.commander = !was;
        sfx('uiConfirm');
        render();
      }, 'btn', { 'data-k': 'ec_cmd' }) : h('span', { class: 'muted', style: 'font-size:0.8em;align-self:center' }, 'Learn Warden\'s Mantle to promote a Commander.'),
    ),
  );
  const modes = h('div', { class: 'modes' }, (['aggressive', 'defensive', 'follow'] as const).map((m) => btn([img(m, '#f6dea0'), m], () => { s.echoMode = m; render(); }, 'btn small' + (s.echoMode === m ? ' primary' : ''), { 'data-k': 'mode_' + m })));
  const forms = h('div', { class: 'list' },
    [0, 1, 2].map((i) => {
      const f = s.formations[i];
      return h('div', { class: 'save-slot' },
        h('div', null, h('b', null, `Formation ${i + 1}`), h('div', { class: 'meta' }, f ? f.uids.map((u) => { const e = s.echoes.find((x) => x.uid === u); return e ? ECHO_SPECIES[e.species].stages[e.stage].name : '—'; }).join(', ') || 'Empty' : 'Not saved')),
        h('div', { class: 'acts' },
          btn('Save', () => { s.formations[i] = { name: `Formation ${i + 1}`, uids: [...s.active] }; sfx('uiConfirm'); render(); }, 'btn small', { 'data-k': 'fs_' + i }),
          btn('Use', () => { if (f) { s.active = f.uids.filter((u) => s.echoes.some((e) => e.uid === u)).slice(0, d.echoSlots); syncArmy(); } }, 'btn small', { disabled: !f, 'data-k': 'fu_' + i }),
        ));
    }));
  return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
    h('div', { class: 'col scroll', style: 'flex:0.9;min-height:0' },
      pendingImprints() ? btn(`Imprints ready to absorb · ${pendingImprints()}`, () => setTab('imprints'), 'btn small primary', { 'data-k': 'view_imprints' }) : null,
      h('div', { class: 'box' }, h('h3', null, `Your Remnant · ${s.active.length}/${d.echoSlots} active`), roster),
      h('div', { class: 'box' }, h('h3', null, 'Stance'), modes, h('p', { class: 'muted', style: 'font-size:0.82em;margin:6px 0 0' }, 'Aggressive: hunt the nearest foe. Defensive: hold a line before you and shield you from arrows. Follow: stay close and strike what comes near.')),
    ),
    h('div', { class: 'col scroll', style: 'flex:1.1;min-height:0' }, detail, h('div', { class: 'box' }, h('h3', null, 'Formations'), forms)),
  );
}

function syncArmy() {
  const W = G.world;
  for (const e of W.echoes) if (!G.save.active.includes(e.inst.uid)) e.dismiss();
  if (G.save.flags.army_out !== false) W.summonEchoes(true);
  sfx('uiConfirm');
  render();
}

const pendingImprints = () => Object.entries(G.save.echoImprints ?? {}).reduce((a, [id, n]) => a + (n > 0 && ECHO_SPECIES[id] ? n : 0), 0);

function echoImprintPanel() {
  const pending = Object.entries(G.save.echoImprints ?? {}).filter(([id, n]) => n > 0 && ECHO_SPECIES[id]);
  return h('div', { class: 'box' }, h('h3', null, 'Original-form imprints'),
    h('p', { class: 'muted', style: 'font-size:0.85em' }, 'Rematch an Echo’s original form to earn its imprint. The Marshal and Locust King also leave imprints in the Boss Gauntlet. Absorb here to evolve, up to Stage III.'),
    pending.length ? pending.map(([id, n]) => btn(`Absorb ${ECHO_SPECIES[id].stages[0].name} · ${n} available`, () => { G.world.absorb(id, true); render(); }, 'btn small', { 'data-k': 'absorb_' + id, style: 'margin:4px 4px 0 0' })) : h('p', { class: 'muted', style: 'font-size:0.85em' }, 'No unabsorbed imprints.'));
}

// ---------------------------------------------------------------- map

function mapTab() {
  const s = G.save;
  const wrap = h('div', { class: 'map-wrap' });
  const c = h('canvas');
  wrap.appendChild(c);
  requestAnimationFrame(() => drawMap(c));
  const lit = s.altarsLit.map(altarName);
  const ex = explored();
  return h('div', { class: 'col', style: 'flex:1;min-height:0' },
    wrap,
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: 'background:#e2b85a' }), 'You are here: ' + G.world.room.name),
      h('span', null, h('i', { style: 'background:#ffcf6b;border-radius:50%' }), 'Altar'),
      h('span', null, h('i', { style: 'background:#6a5a8a' }), 'Explored'),
      h('span', null, h('i', { style: 'background:#ffcf6b;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' }), 'Objective'),
      h('span', null, `Altars kindled: ${lit.join(', ')}`),
      h('span', { 'data-k': 'explored' }, `Explored: ${ex.ch}% of Chapter ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][ex.n] ?? ex.n} · ${ex.all}% in all`),
    ),
  );
}

/** Rooms visited out of rooms that exist, for this chapter and the whole game (the Trial arena doesn't count). */
function explored() {
  const s = G.save, n = chapterOf(G.world.room.id === 'trial_arena' ? s.flags.trial_return?.toString().split('|')[0] ?? 'valley_camp' : G.world.room.id);
  const ids = Object.keys(ROOMS).filter((id) => id !== 'trial_arena');
  const seen = new Set(s.visited);
  const pct = (list: string[]) => list.length ? Math.floor((100 * list.filter((id) => seen.has(id)).length) / list.length) : 0;
  return { n, ch: pct(ids.filter((id) => chapterOf(id) === n)), all: pct(ids) };
}

function drawMap(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, r.width * dpr);
  c.height = Math.max(1, r.height * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const s = G.save;
  // One chapter's map at a time.
  const ch = chapterOf(G.world.room.id);
  const rooms = Object.values(ROOMS).filter((rm) => chapterOf(rm.id) === ch);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const rm of rooms) {
    minX = Math.min(minX, rm.map.x); minY = Math.min(minY, rm.map.y);
    maxX = Math.max(maxX, rm.map.x + rm.w / 16); maxY = Math.max(maxY, rm.map.y + rm.h / 16);
  }
  const pad = 20;
  const sc = Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY));
  const ox = pad + (r.width - pad * 2 - (maxX - minX) * sc) / 2, oy = pad + (r.height - pad * 2 - (maxY - minY) * sc) / 2;
  const X = (v: number) => ox + (v - minX) * sc, Y = (v: number) => oy + (v - minY) * sc;
  for (const rm of rooms) {
    const visited = s.visited.includes(rm.id);
    const x = X(rm.map.x), y = Y(rm.map.y), w = (rm.w / 16) * sc, hh = (rm.h / 16) * sc;
    if (!visited) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(155,146,166,0.18)';
      ctx.strokeRect(x, y, w, hh);
      ctx.setLineDash([]);
      continue;
    }
    const cur = rm.id === G.world.room.id;
    ctx.fillStyle = cur ? 'rgba(226,184,90,0.35)' : 'rgba(106,90,138,0.4)';
    ctx.fillRect(x, y, w, hh);
    ctx.strokeStyle = cur ? '#f6dea0' : 'rgba(200,180,230,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, hh);
    // tile silhouette
    ctx.fillStyle = cur ? 'rgba(255,240,200,0.25)' : 'rgba(255,255,255,0.12)';
    const tw = w / rm.w, th = hh / rm.h;
    for (let ty = 0; ty < rm.h; ty += 2) for (let tx = 0; tx < rm.w; tx += 2) {
      const ch = rm.rows[ty][tx];
      if (ch === '#' || ch === 'B') ctx.fillRect(x + tx * tw, y + ty * th, tw * 2, th * 2);
    }
    for (const e of rm.ents) {
      if (e.t === 'altar') {
        ctx.fillStyle = s.altarsLit.includes(e.id) ? '#ffcf6b' : 'rgba(255,207,107,0.35)';
        ctx.beginPath();
        ctx.arc(x + (e.x / rm.w) * w, y + (e.y / rm.h) * hh - 3, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (sc > 26) {
      ctx.fillStyle = cur ? '#f6dea0' : 'rgba(236,228,212,0.75)';
      ctx.font = `600 ${clamp(sc * 0.18, 8, 11)}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(rm.name, x + w / 2, y + hh + 11);
    }
  }
  // The objective: a golden star where the guide leads.
  const gp = guidePoint();
  const gRoom = gp ? ROOMS[gp.target.room] : null;
  if (gp && gRoom && rooms.includes(gRoom)) {
    const sx = X(gRoom.map.x + gp.target.x / TILE / 16), sy = Y(gRoom.map.y + gp.target.y / TILE / 16) - 3;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = '#ffcf6b';
    ctx.strokeStyle = '#3a2806';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 ? 3 : 7;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  const cur = ROOMS[G.world.room.id];
  const p = G.world.player;
  const px = X(cur.map.x + p.x / TILE / 16), py = Y(cur.map.y + p.y / TILE / 16);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py - 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e2b85a';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---------------------------------------------------------------- journal

let jView: 'quests' | 'lore' | 'beasts' = 'quests';
let jSel: string | null = null;

/** Quests, Inscriptions and the Bestiary share one two-pane layout; the sub-tabs pick the page. */
function journalTab(view: typeof jView) {
  const s = G.save;
  if (view !== jView) { jView = view; jSel = null; }
  const sub = h('div', { class: 'eyebrow' }, view === 'quests' ? `${QUESTS.filter((q) => s.quests[q.id] && !s.quests[q.id].done).length} open` : view === 'lore' ? `${s.lore.length} inscriptions found` : `${bestiaryCount()} kinds of foe recorded`);
  let left: HTMLElement, right: HTMLElement;
  if (jView === 'quests') {
    const qs = QUESTS.filter((q) => s.quests[q.id]);
    qs.sort((a, b) => Number(!!s.quests[a.id].done) - Number(!!s.quests[b.id].done) || (a.kind === 'main' ? -1 : 1));
    if (!jSel && qs[0]) jSel = qs[0].id;
    left = h('div', { class: 'list' }, qs.length ? qs.map((q) => {
      const st = s.quests[q.id];
      return h('button', { class: 'row-item' + (q.id === jSel ? ' sel' : ''), 'data-nav': '', 'data-k': 'q_' + q.id, onclick: () => { jSel = q.id; render(); } },
        img(q.kind === 'main' ? 'skills' : 'journal', st.done ? '#6a6070' : '#f6dea0'),
        h('div', null, h('div', { class: 'nm', style: st.done ? 'color:var(--muted)' : '' }, q.title), h('div', { class: 'sub' }, q.kind === 'main' ? 'Main story' : 'Side quest')),
        h('span', { class: 'tag' }, st.done ? 'DONE' : ''));
    }) : h('div', { class: 'muted' }, 'No quests yet.'));
    const q = QUESTS.find((x) => x.id === jSel);
    const st = q ? s.quests[q.id] : null;
    right = q && st ? h('div', { class: 'box' }, h('div', { class: 'title-text' }, q.title), h('div', { class: 'eyebrow' }, q.kind === 'main' ? 'Main story' : 'Side quest'),
      h('p', null, st.done ? q.done : q.stages[Math.min(st.stage, q.stages.length - 1)]),
      q.id === 's_secrets' ? h('p', { class: 'muted' }, `${s.secrets.length} of 5 found.`) : null,
      q.id === 's_mara' ? h('p', { class: 'muted' }, `Temple inscriptions remembered: ${['eph610', 'eph612', 'cor104', 'isa4031', 'josh620'].filter((l) => s.lore.includes(l)).length}`) : null,
      h('div', { class: 'list', style: 'margin-top:8px' }, q.stages.slice(0, st.done ? q.stages.length : st.stage).map((t) => h('div', { class: 'muted', style: 'text-decoration:line-through;font-size:0.9em' }, t)))) : h('div', { class: 'box muted' }, 'Select a quest.');
  } else if (jView === 'beasts') {
    [left, right] = bestiaryPanes(jSel, (id) => { jSel = id; render(); });
  } else {
    if (!jSel && s.lore[0]) jSel = s.lore[0];
    left = h('div', { class: 'list' }, s.lore.length ? s.lore.map((id) => h('button', { class: 'row-item' + (id === jSel ? ' sel' : ''), 'data-nav': '', 'data-k': 'l_' + id, onclick: () => { jSel = id; render(); } },
      img('book', '#f6dea0'), h('div', null, h('div', { class: 'nm' }, LORE[id].title), h('div', { class: 'sub' }, LORE[id].ref)), h('span'))) : h('div', { class: 'muted' }, 'Inscriptions you read are kept here.'));
    const L = jSel ? LORE[jSel] : null;
    right = L ? h('div', { class: 'box' }, h('div', { class: 'title-text' }, L.title), h('p', { style: 'font-style:italic;font-size:1.08em;line-height:1.5' }, '“' + L.text + '”'), h('div', { class: 'eyebrow' }, L.ref), h('p', { class: 'muted' }, L.note)) : h('div', { class: 'box muted' }, 'Select an inscription.');
  }
  return h('div', { class: 'col', style: 'flex:1;min-height:0' }, sub,
    h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0' },
      h('div', { class: 'col scroll', style: 'flex:1;min-height:0' }, left),
      h('div', { class: 'col scroll', style: 'flex:1.2;min-height:0' }, right),
      ),
    h('div', { class: 'muted', style: 'font-size:0.78em' }, 'Scripture is quoted from the King James Version. The kingdoms and people of this story are fictional.'),
  );
}

// ---------------------------------------------------------------- crafting

interface Recipe { id: string; name: string; desc: string; cost: Record<string, number>; forge: boolean; make: () => void; icon: string; max?: () => boolean }

/** Elixirs brewed from salvage, for those who would rather not pay Ilan. */
const BREWS: { id: ElixirId; cost: Record<string, number> }[] = [
  { id: 'might', cost: { sentinel_steel: 1, veil_shard: 3 } },
  { id: 'warding', cost: { iron_scrap: 4, veil_shard: 2 } },
  { id: 'swiftness', cost: { veil_shard: 4, iron_scrap: 1 } },
  { id: 'focus', cost: { covenant_fragment: 1, veil_shard: 1 } },
  { id: 'insight', cost: { veil_shard: 3, iron_scrap: 2 } },
];

function recipes(): Recipe[] {
  const s = G.save;
  const give = (id: string) => () => { const it = makeItem(id); s.inventory.push(it); G.ui.itemGet(it); };
  return [
    { id: 'frag', name: 'Purify Veil Shards', desc: 'Five Veil Shards burn clean into one Covenant Fragment.', cost: { veil_shard: 5 }, forge: false, icon: 'fragment', make: () => { addMaterial(s, 'covenant_fragment', 1); G.ui.toast('Covenant Fragment', 'loot'); } },
    { id: 'vial', name: 'Balm Vial', desc: 'Permanently adds one Balm charge (up to 6).', cost: { covenant_fragment: 2, silver: 40 }, forge: false, icon: 'vial', max: () => s.balmMax >= 6, make: () => { s.balmMax++; s.balm++; G.ui.toast('Balm charges: ' + s.balmMax, 'good'); } },
    { id: 'visor', name: 'Sentinel\'s Visor', desc: 'A helm of purified Sentinel steel. Defense, poise and Endurance.', cost: { sentinel_steel: 3, iron_scrap: 2, silver: 60 }, forge: true, icon: 'helm', make: give('sentinel_helm') },
    { id: 'plate', name: 'Bulwark Plate', desc: 'Black plate with gold seams. Heavy protection and health.', cost: { sentinel_steel: 5, iron_scrap: 4, covenant_fragment: 1, silver: 150 }, forge: true, icon: 'armor', make: give('bulwark_plate') },
    { id: 'sigil', name: 'Sigil of the Sentinel', desc: 'A relic that strengthens every Echo near you.', cost: { sentinel_steel: 2, covenant_fragment: 2 }, forge: true, icon: 'sigil', make: give('sentinel_sigil') },
    { id: 'blade', name: 'Covenant Blade', desc: 'Reforge a blade around light from the relic. Epic sword with crit and ability power.', cost: { covenant_fragment: 4, iron_scrap: 4, silver: 120 }, forge: true, icon: 'sword', max: () => !flag('relic_taken'), make: give('covenant_blade') },
    // Salvage put to work: Relic Shards for Ilan's curios, and elixirs brewed in the field.
    { id: 'shard', name: 'Fuse a Relic Shard', desc: 'Three Covenant Fragments and Sentinel steel, fused into the shard Ilan asks for his featured curios.', cost: { covenant_fragment: 3, sentinel_steel: 2 }, forge: true, icon: 'fragment', make: () => { addMaterial(s, SHARD, 1); G.ui.toast('Relic Shard', 'loot'); } },
    ...BREWS.map((b) => ({ id: 'brew_' + b.id, name: 'Brew: ' + ELIXIRS[b.id].name, desc: ELIXIRS[b.id].desc + ' Drunk at once; five minutes.', cost: b.cost, forge: false, icon: 'flask', max: () => !!storeBlocked(),
      make: () => { drinkElixir(s, b.id); G.d = derive(s); G.ui.toast(ELIXIRS[b.id].name + ' · 5:00', 'good'); } })),
    // The settlement's forge adds its own work (empty anywhere else).
    ...restRecipes(),
  ];
}

function costView(cost: Record<string, number>) {
  const s = G.save;
  return h('div', { class: 'mats' }, Object.entries(cost).map(([k, v]) => {
    const have = k === 'silver' ? s.silver : s.materials[k] ?? 0;
    return h('span', { class: have >= v ? '' : 'down' }, h('b', null, `${v}`), ` ${k === 'silver' ? 'silver' : ITEMS[k].name} (${have})`);
  }));
}

function craftingTab(forceForge = false) {
  const atForge = forceForge || G.world.room.id === 'sanctuary';
  const list = recipes().map((r) => {
    const blocked = r.max?.() ?? false;
    const ok = hasMaterials(G.save, r.cost) && (!r.forge || atForge) && !blocked;
    return h('div', { class: 'box', style: 'display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center' },
      img(r.icon, '#f6dea0'),
      h('div', null, h('div', { class: 'nm', style: 'color:var(--bone);font-weight:600' }, r.name), h('div', { class: 'muted', style: 'font-size:0.85em' }, r.desc), costView(r.cost),
        r.forge && !atForge ? h('div', { class: 'down', style: 'font-size:0.8em' }, 'Requires Dov\'s forge in Hearthward.') : null,
        blocked ? h('div', { class: 'muted', style: 'font-size:0.8em' }, r.id === 'vial' ? 'Maximum Balm charges reached.' : r.id.startsWith('brew_') ? 'Brew once you are clear of danger.' : 'The covenant has not yet woken.') : null),
      btn('Craft', () => {
        if (payMaterials(G.save, r.cost)) {
          r.make();
          sfx('loot');
          renderAny();
        }
      }, 'btn small primary', { disabled: !ok, 'data-k': 'cr_' + r.id }));
  });
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'muted', style: 'font-size:0.9em' }, atForge ? 'You are at Dov\'s forge: every recipe is available.' : 'Field crafting. Forged items need Dov\'s forge in Hearthward.'),
    list);
}

// ---------------------------------------------------------------- settings

let listening: Action | null = null;

function seg<T extends string>(cur: T, opts: [T, string][], set: (v: T) => void, k: string) {
  return h('div', { class: 'seg' }, opts.map(([v, l]) => btn(l, () => { set(v); saveSettings(); renderAny(); }, 'btn' + (cur === v ? ' on' : ''), { 'data-k': k + v })));
}
function slider(val: number, min: number, max: number, step: number, set: (v: number) => void, k: string) {
  const i = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), 'data-nav': '', 'data-k': k }) as HTMLInputElement;
  i.addEventListener('input', () => { set(parseFloat(i.value)); saveSettings(); });
  return i;
}
function toggle(val: boolean, set: (v: boolean) => void, k: string) {
  return seg(val ? 'on' : 'off', [['on', 'On'], ['off', 'Off']], (v) => set(v === 'on'), k);
}
const row = (label: string, sub: string, ctl: HTMLElement) => h('div', { class: 'set-row' }, h('label', null, label, sub ? h('small', null, sub) : null), ctl);

function settingsTab() {
  const st = settings;
  const binds = (['left', 'right', 'up', 'down', 'jump', 'attack', 'heavy', 'dodge', 'parry', 'skill1', 'skill2', 'skill3', 'interact', 'heal', 'echo', 'ultimate', 'switch', 'transform', 'menu', 'map'] as Action[]).map((a) =>
    row(ACTION_LABELS[a] ?? a, '', h('div', { class: 'bind' }, h('button', {
      class: 'key' + (listening === a ? ' listen' : ''), 'data-nav': '', 'data-k': 'kb_' + a,
      onclick: () => {
        listening = a;
        renderAny();
        input.captureNextKey((code) => {
          if (code !== 'Escape') {
            for (const other of Object.keys(st.keys) as Action[]) if (other !== a && !['confirm', 'back', 'tabL', 'tabR'].includes(other)) st.keys[other] = st.keys[other].filter((c) => c !== code);
            st.keys[a] = [code, ...st.keys[a].filter((c) => c !== code)].slice(0, 2);
            saveSettings();
          }
          listening = null;
          renderAny();
        });
      },
    }, listening === a ? 'Press a key…' : st.keys[a].map((c) => input.keyName(c)).join(' / ')))));
  const codeArea = h('textarea', { class: 'code', 'data-nav': '', placeholder: 'Paste a save code here to import it into the current slot.' }) as HTMLTextAreaElement;
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Game updates'),
      h('p', { class: 'muted', 'data-k': 'current_build' }, 'Installed build: ' + (currentBuild() || 'development')),
      btn('Check for updates', async () => {
        if (G.inCutscene || G.world?.bossActive || G.world?.transitioning || G.world?.story.ch3.rounds.active) { G.ui.toast('Finish the encounter before installing an update.', 'info'); return; }
        const ready = await checkForUpdate(true);
        if (!ready) { G.ui.toast('No newer build found. Connect to the internet to check.', 'info'); return; }
        // Recheck after the request: the player may have left Settings while it was in flight.
        if (G.inCutscene || G.world?.bossActive || G.world?.transitioning || G.world?.story.ch3.rounds.active) { G.ui.toast('Update ready. It will install at the next doorway.', 'info'); return; }
        if (G.save) G.world.autosave(true);
        applyUpdate(G.save ? G.slot : null);
      }, 'btn small', { 'data-k': 'check_updates' })),
    only ? h('div', { class: 'box game-modes' }, h('h3', null, 'Game modes'),
      h('p', { class: 'muted' }, 'Continue your journey to choose endless monster waves, unlocked round checkpoints, or the Boss Gauntlet.'),
      lastSlot() !== null ? btn('Continue to game modes', () => {
        const slot = lastSlot(); closeMenu();
        if (slot !== null && loadGameSlot(slot)) openMenu('settings');
      }, 'btn primary', { 'data-k': 'load_game_modes' }) : h('small', { class: 'muted' }, 'Start a journey first.'),
    ) : gameModes(closeMenu),
    h('div', { class: 'box' }, h('h3', null, 'Audio'),
      row('Keep other music playing', 'On: mixes game sounds with Spotify and other audio apps. On iPhone, Silent Mode also mutes game sounds.', toggle(st.mixAudio, (v) => (st.mixAudio = v), 'mix_audio')),
      row('Master volume', '', slider(st.master, 0, 1, 0.05, (v) => (st.master = v), 'vm')),
      row('Music', 'Set to zero to hear your own soundtrack with the game sound effects.', slider(st.music, 0, 1, 0.05, (v) => (st.music = v), 'vmu')),
      row('Sound effects', '', slider(st.sfx, 0, 1, 0.05, (v) => (st.sfx = v), 'vs')),
      row('Soundtrack', 'Songs: the chapter songs wherever they have been added, the game’s own score everywhere else (bosses always keep the score).', seg(st.soundtrack, [['songs', 'Songs'], ['score', 'Score only']], (v) => { st.soundtrack = v; setTimeout(() => songs.refresh(), 0); }, 'soundtrack')),
      st.soundtrack === 'songs' ? row('Sung songs', 'On: a chapter’s song with lyrics plays once when you arrive, then its instrumental. Off: instrumentals only.', toggle(st.vocals, (v) => { st.vocals = v; setTimeout(() => songs.refresh(), 0); }, 'vocals')) : null,
      !st.mixAudio ? row('Respect the silent switch', 'On: iPhone Silent Mode mutes the game and allows other music to keep playing.', toggle(st.respectSilent, (v) => (st.respectSilent = v), 'rs')) : null,
    ),
    h('div', { class: 'box' }, h('h3', null, 'Display'),
      row('Art style', 'Pixel draws the world as crisp pixel art.', seg(st.artStyle ?? 'pixel', [['pixel', 'Pixel'], ['smooth', 'Smooth']], (v) => { st.artStyle = v; setTimeout(() => G.renderer.resize(), 0); }, 'art')),
      row('Graphics quality', 'Auto trims effects, then resolution, if frames drop.', seg(st.quality, [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], (v) => { st.quality = v; G.renderer.autoPenalty = 0; setTimeout(() => G.renderer.resize(), 0); }, 'q')),
      row('Frame rate', '60 FPS targets steady frame pacing. Auto follows your display’s refresh rate.', seg(st.fps, [['auto', 'Auto'], ['60', '60 FPS']], (v) => (st.fps = v), 'fps')),
      row('Camera distance', '', seg(st.zoom, [['close', 'Close'], ['normal', 'Normal'], ['wide', 'Wide']], (v) => { st.zoom = v; setTimeout(() => G.renderer.resize(), 0); }, 'z')),
      row('Show frame rate', '', toggle(st.showFps, (v) => (st.showFps = v), 'sf')),
    ),
    h('div', { class: 'box' }, h('h3', null, 'Challenge'),
      row('Boss difficulty', 'Hard (default) is tuned to be won at the level you reach by playing straight through. Normal is gentler. Merciless gives bosses far more health, harder blows and a faster tempo: the harder path. Applies from the next boss room.',
        seg(st.bossDifficulty, [['normal', 'Normal'], ['hard', 'Hard'], ['merciless', 'Merciless']], (v) => (st.bossDifficulty = v), 'bd')),
    ),
    h('div', { class: 'box' }, h('h3', null, 'Tutorials'),
      row('Coaching tips', 'The first time combos, dodging, parrying, Echoes, the Mantle and sub-weapons matter, a small card shows the button and waits for you to try it.', toggle(st.coach !== false, (v) => (st.coach = v), 'coach')),
      G.save ? row('Replay tutorials', 'Show every tip again on this journey.', btn('Replay', () => { replayCoach(); st.coach = true; saveSettings(); G.ui.toast('Tutorial tips will play again as you go.', 'good'); renderAny(); }, 'btn small', { 'data-k': 'coach_replay' })) : null,
    ),
    h('div', { class: 'box' }, h('h3', null, 'Accessibility'),
      row('Text size', '', seg(st.textSize, [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']], (v) => { st.textSize = v; applyTextSize(); }, 'ts')),
      row('Screen shake', '', seg(st.shake, [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']], (v) => (st.shake = v), 'sh')),
      row('Reduce flashes', 'Softens bright full-screen flashes.', toggle(st.reduceFlashes, (v) => (st.reduceFlashes = v), 'rf')),
      row('Damage numbers', '', toggle(st.dmgNumbers, (v) => (st.dmgNumbers = v), 'dn')),
      row('Haptics', 'Taps on button presses, and a different pattern for a hit, a parry, a wound, a kill and a boss\'s new phase (iPhone with iOS 18 or later, and Android).', toggle(st.haptics, (v) => (st.haptics = v), 'hp')),
      row('Objective marker', 'A golden marker and screen-edge arrow that point toward your next objective.', toggle(st.guide, (v) => (st.guide = v), 'gd')),
    ),
    isTouchDevice() ? h('div', { class: 'box' }, h('h3', null, 'Touch controls'),
      row('Button size', '', slider(st.touchScale, 0.8, 1.3, 0.05, (v) => (st.touchScale = v), 'tsz')),
      row('Button opacity', '', slider(st.touchOpacity, 0.3, 1, 0.05, (v) => (st.touchOpacity = v), 'top')),
      row('Customize controls', 'Drag the stick and buttons where your thumbs want them, resize them one by one and set how see-through they are.', btn('Customize', () => editControls(), 'btn small', { 'data-k': 'tc_edit' })),
      row('Left-handed layout', 'Moves the buttons to the left and the stick to the right.', toggle(st.leftHanded, (v) => (st.leftHanded = v), 'lh')),
      row('Button labels', 'Show the name under each touch button.', toggle(st.buttonLabels, (v) => (st.buttonLabels = v), 'bl')),
      row('Dynamic Island indicator', 'On iPhones with a Dynamic Island, a living status ring around it: low health, boss life, Rally and news. On the iPhone 18 Pro\'s smaller island, your Echoes and the Shadow Mantle bud off it too.', toggle(st.island, (v) => (st.island = v), 'di')),
      row('Island size', 'Which iPhone the ring should hug. Auto suits the iPhone 18 Pro and Pro Max; choose 14–17 Pro for the older, longer island.', seg(st.islandSize ?? 'auto', [['auto', 'Auto'], ['compact', '18 Pro'], ['classic', '14–17 Pro'], ['custom', 'Measured']], (v) => { st.islandSize = v; islandCalibrate(); }, 'dis')),
      row('Island length', 'Turn the phone sideways and slide until the bright outline just hugs the island. Sets the size to Measured.', slider(st.islandLen ?? ISLAND_LEN.compact, 70, 140, 1, (v) => { st.islandLen = v; st.islandSize = 'custom'; islandCalibrate(); }, 'dil')),
    ) : null,
    h('div', { class: 'box' }, h('h3', null, 'Keyboard'), h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' }, 'Select a binding, then press the new key.'),
      binds, h('div', { style: 'margin-top:8px' }, btn('Reset all settings', () => { resetSettings(); applyTextSize(); renderAny(); }, 'btn small', { 'data-k': 'reset' }))),
    controllerBox(renderAny),
    h('div', { class: 'box' }, h('h3', null, 'Save backup'),
      h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' }, 'On iPhone, the Home Screen app and Safari keep separate saves. Copy a code from one and import it in the other.'),
      h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px' },
        btn('Copy save code', () => {
          if (!G.save) { G.ui.toast('Start or load a game first.', 'warn'); return; }
          const code = exportCode(G.save);
          codeArea.value = code;
          navigator.clipboard?.writeText(code).then(() => G.ui.toast('Save code copied', 'good')).catch(() => { codeArea.select(); G.ui.toast('Select the code and copy it', 'info'); });
        }, 'btn small', { 'data-k': 'exp' }),
        btn('Import into this slot', () => {
          const d = importCode(codeArea.value);
          if (!d) { G.ui.toast('That code could not be read.', 'warn'); return; }
          saveSlot(G.save ? G.slot : 0, d);
          closeMenu();
          loadGameSlot(G.save ? G.slot : 0);
        }, 'btn small', { 'data-k': 'imp' }),
      ),
      codeArea),
  );
}

/** The layout editor covers the menu until Done, then the menu shows the new values. */
function editControls() {
  const m = menuEl;
  if (m) m.style.visibility = 'hidden';
  openTouchEditor(() => {
    if (m) m.style.visibility = '';
    renderAny();
  });
}

export function applyTextSize() {
  document.documentElement.classList.toggle('text-large', settings.textSize === 'large');
  document.documentElement.classList.toggle('text-xl', settings.textSize === 'xl');
}

// ---------------------------------------------------------------- system

let confirmQuit = false;

function systemTab() {
  const s = G.save;
  const slots = listSlots();
  const recovery = (G.world as unknown as { recoveryMenu?(): HTMLElement | null }).recoveryMenu?.();
  const offline = (G.world as unknown as { offlineMenu?(): HTMLElement | null }).offlineMenu?.();
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Game'),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        btn('Save now', () => { G.world.autosave(); renderAny(); }, 'btn primary', { 'data-k': 'save' }),
        btn(confirmQuit ? 'Confirm: quit to title' : 'Quit to title', () => {
          if (!confirmQuit) { confirmQuit = true; renderAny(); return; }
          confirmQuit = false;
          G.world.autosave(true);
          closeMenu();
          returnToTitle();
        }, 'btn', { 'data-k': 'quit' }),
        btn('Credits', () => G.ui.showCredits(), 'btn', { 'data-k': 'cred' }),
      ),
      h('p', { class: 'muted', style: 'font-size:0.85em;margin:8px 0 0' }, 'The game also saves itself at altars, at story moments and when you move between areas. You return to your last altar after a fall.'),
    ),
    h('div', { class: 'box' }, h('h3', null, 'Save slots'),
      h('div', { class: 'saves' }, slots.map((sl) => h('div', { class: 'save-slot' },
        h('div', null, h('b', null, `Slot ${sl.slot + 1}${sl.slot === G.slot ? ' · current' : ''}`),
          h('div', { class: 'meta' }, sl.data ? `Level ${sl.data.level} · ${ROOMS[sl.data.room]?.name ?? sl.data.room} · ${formatTime(sl.data.playtime)} · ${new Date(sl.data.updated).toLocaleString()}` : 'Empty')),
        h('div', { class: 'acts' },
          sl.data && sl.slot !== G.slot ? btn('Load', () => { G.world.autosave(true); closeMenu(); loadGameSlot(sl.slot); }, 'btn small', { 'data-k': 'ld' + sl.slot }) : null,
          sl.slot !== G.slot ? btn(sl.data ? 'Overwrite' : 'Save here', () => { saveSlot(sl.slot, s); G.ui.toast(`Saved to slot ${sl.slot + 1}`, 'good'); renderAny(); }, 'btn small', { 'data-k': 'sv' + sl.slot }) : null,
          sl.data && sl.slot !== G.slot ? btn('Delete', () => { deleteSlot(sl.slot); renderAny(); }, 'btn small', { 'data-k': 'dl' + sl.slot }) : null,
        )))),
    ),
    recovery,
    offline,
    currentBuild().startsWith('phaser-') ? h('div', { class: 'box' }, h('h3', null, 'Original edition'), h('p', { class: 'muted' }, 'Your original saves remain separate and available.'), h('a', { class: 'btn small', href: new URL(location.pathname.includes('/phaser/') ? '../classic/' : './classic/', document.baseURI).href }, 'Open original edition')) : null,
    flag('ch1_done') ? h('div', { class: 'box' }, h('h3', null, 'New Game+'),
      h('p', { class: 'muted', style: 'margin:0 0 6px' }, 'Begin Chapter I again with your level, gear, skills and Echoes. Foes grow stronger and give more experience.'),
      btn('Begin New Game+', () => { closeMenu(); startNewGamePlus(); }, 'btn primary', { 'data-k': 'ngp' })) : null,
  );
}

function renderAny() {
  if (menuEl) render();
  if (shopEl) renderShop();
}

// ---------------------------------------------------------------- shop & forge

let shopEl: HTMLElement | null = null;
let shopBody: HTMLElement;
let shopKind: 'merchant' | 'smith' = 'merchant';
let shopTab: 'store' | 'sell' | 'temper' | 'dismantle' | 'forge' = 'store';

export function openShop(kind: 'merchant' | 'smith') {
  if (shopEl) return;
  shopKind = kind;
  shopTab = kind === 'merchant' ? 'store' : 'temper';
  storeKind = restStock().length ? 'rest' : 'featured';
  confirmKey = null;
  pause(true);
  sfx('uiOpen');
  shopBody = h('div', { class: 'menu-body' });
  shopEl = h('div', { class: 'menu' });
  document.getElementById('ui')!.appendChild(shopEl);
  renderShop();
  pushLayer({ el: shopEl, onBack: closeShop, onAction: (a) => {
    if (a === 'tabL' || a === 'tabR') {
      const tabs = shopTabs().map(([id]) => id);
      const i = tabs.indexOf(shopTab);
      shopTab = tabs[(i + (a === 'tabR' ? 1 : tabs.length - 1)) % tabs.length] as typeof shopTab;
      renderShop();
      return true;
    }
    return false;
  } });
}

function closeShop() {
  if (!shopEl) return;
  popLayer(shopEl);
  shopEl = null;
  pause(false);
  G.world.player.styleKey = '';
  G.d = derive(G.save);
}

function shopTabs(): [typeof shopTab, string][] {
  return shopKind === 'merchant' ? [['store', 'Store'], ['sell', 'Sell']] : [['temper', 'Temper'], ['dismantle', 'Dismantle'], ['forge', 'Forge']];
}

function renderShop() {
  if (!shopEl) return;
  const s = G.save;
  const keepScroll = (shopEl.querySelector('.scroll') as HTMLElement | null)?.scrollTop ?? 0;
  const focusId = (document.activeElement as HTMLElement | null)?.dataset?.k;
  clear(shopEl);
  const top = h('div', { class: 'menu-top' },
    h('div', { class: 'tabs' }, h('div', { class: 'tab on', style: 'cursor:default' }, shopKind === 'merchant' ? 'Ilan\'s stall' : 'Dov\'s forge'),
      shopTabs().map(([id, l]) => h('button', { class: 'tab' + (shopTab === id ? ' on' : ''), 'data-nav': '', 'data-k': 'shop_' + id, onclick: () => { shopTab = id; confirmKey = null; renderShop(); } }, l))),
    purse(),
    btn('Leave', closeShop, 'btn small'),
  );
  shopBody = h('div', { class: 'menu-body' });
  shopEl.append(top, shopBody);
  let content: HTMLElement;
  if (shopTab === 'store') content = storePane(true);
  else if (shopTab === 'sell') content = sellPane(false);
  else if (shopTab === 'dismantle') content = sellPane(true);
  else if (shopTab === 'temper') {
    const gear = s.inventory.filter((i) => ITEMS[i.id].slot !== 'material' && ITEMS[i.id].slot !== 'key');
    gear.sort((a, b) => Number(isWorn(s, b.uid)) - Number(isWorn(s, a.uid)));
    content = h('div', { class: 'list' }, gear.map((it) => {
      const cost = upgradeCost(it);
      const maxed = it.plus >= MAX_PLUS;
      const ok = !maxed && hasMaterials(s, cost);
      const next = { ...it, plus: it.plus + 1 };
      return h('div', { class: 'box', style: 'display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center' }, itemIcon(it),
        h('div', null, h('div', { class: 'nm', style: rarityStyle(it.rarity) + ';font-weight:600' }, itemName(it) + (isWorn(s, it.uid) ? ' · equipped' : '')),
          maxed ? h('div', { class: 'muted' }, 'Fully tempered.') : h('div', { style: 'font-size:0.85em' }, modLines(itemMods(next), itemMods(it))),
          maxed ? null : costView(cost), it.id.includes('sword') || it.id.includes('spear') || it.id.includes('blade') ? h('div', { class: 'muted', style: 'font-size:0.78em' }, 'Weapons begin to glow at +3 and burn with white fire at +5.') : null),
        btn('Temper', () => { if (payMaterials(s, cost)) { it.plus++; sfx('hitMetal'); sfx('loot'); G.d = derive(s); renderShop(); } }, 'btn small primary', { disabled: !ok, 'data-k': 'tmp_' + it.uid }));
    }));
  } else {
    content = craftingTab(true);
  }
  shopBody.appendChild(h('div', { class: 'col scroll', style: 'flex:1' }, content));
  const sc = shopBody.querySelector('.scroll') as HTMLElement | null;
  if (sc) sc.scrollTop = keepScroll;
  if (focusId && input.lastDevice !== 'touch') (shopEl.querySelector(`[data-k="${focusId}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- Ilan's store and selling (game/economy.ts)

let storeKind: OfferKind = 'featured';
let storePage: 'buy' | 'sell' = 'buy';
/** A rare sale or a dismantle waits for a second press. */
let confirmKey: string | null = null;

/** Silver and Relic Shards, beside the tabs. */
function purse() {
  const shards = G.save.materials[SHARD] ?? 0;
  return h('span', { class: 'silver', 'data-k': 'purse' }, `${G.save.silver} silver` + (shards ? ` · ${shards} relic ${shards === 1 ? 'shard' : 'shards'}` : ''));
}

function matsView(m: Record<string, number>) {
  return h('div', { class: 'mats' }, Object.entries(m).map(([k, n]) => h('span', null, h('b', null, `${n}× `), ITEMS[k].name)));
}

function lockButton(it: ItemInst) {
  const on = isLocked(G.save, it);
  return btn(on ? 'Unlock' : 'Lock', () => { toggleLock(G.save, it); sfx('ui'); renderAny(); }, 'btn small' + (on ? ' primary' : ''), { 'data-k': 'lock_' + it.uid, 'aria-pressed': String(on), title: on ? 'Locked: it can\'t be sold or dismantled.' : 'Protect it from selling and dismantling.' });
}

/** The time until the stock turns over, at the player's own midnight. */
function untilTomorrow() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(1, Math.round((next.getTime() - now.getTime()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function storePane(atStall: boolean) {
  const s = G.save;
  const offers = storeOffers(s, atStall ? restStock() : []);
  const kinds = OFFER_KINDS.filter((k) => offers.some((o) => o.kind === k.id));
  if (!kinds.some((k) => k.id === storeKind)) storeKind = kinds[0].id;
  const ex = elixirOn(s);
  const head = h('div', { class: 'box', style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between' },
    h('div', null, h('div', { class: 'eyebrow' }, 'Ilan\'s store'), h('div', { class: 'muted', style: 'font-size:0.85em' }, `New wares in ${untilTomorrow()}. Featured curios cost Relic Shards too: sell or dismantle Epic gear and up for them.`)),
    ex ? h('div', { class: 'tag', 'data-k': 'elixir_on', style: `color:${ELIXIRS[ex].color}` }, `${ELIXIRS[ex].name} · ${formatTime(elixirLeft(s))}`) : null);
  const chips = h('div', { class: 'modes', style: 'flex-wrap:wrap;margin:6px 0' }, kinds.map((k) =>
    btn(k.label, () => { storeKind = k.id; renderAny(); }, 'btn small' + (storeKind === k.id ? ' primary' : ''), { 'data-k': 'kind_' + k.id, 'aria-pressed': String(storeKind === k.id) })));
  const shards = s.materials[SHARD] ?? 0;
  const list = h('div', { class: 'list' }, offers.filter((o) => o.kind === storeKind).map((o) => {
    const afford = s.silver >= o.silver && shards >= (o.shards ?? 0);
    const eq = o.item ? getItem(s, s.equipment[ITEMS[o.item.id].slot as Slot]) : undefined;
    return h('div', { class: 'row-item' + (o.closed ? ' dim' : ''), style: 'cursor:default', 'data-offer': o.key },
      o.item ? itemIcon(o.item) : img(o.icon, o.color ?? RARITY_COLORS[o.rarity]),
      h('div', null,
        h('div', { class: 'nm', style: rarityStyle(o.item?.rarity ?? o.rarity) }, o.name + (o.item ? ` · ${RARITY_NAMES[o.item.rarity]}` : '')),
        h('div', { class: 'sub' }, o.why),
        o.item ? h('div', { style: 'font-size:0.85em' }, modLines(itemMods(o.item), eq ? itemMods(eq) : undefined)) : null,
        o.item && eq ? h('div', { class: 'muted', style: 'font-size:0.78em' }, `Compared with ${itemName(eq)} (equipped).`) : null,
        o.closed ? h('div', { class: 'muted', style: 'font-size:0.85em' }, o.closed) : null),
      h('div', { style: 'display:flex;gap:8px;align-items:center' },
        h('span', { class: 'price' }, `${o.silver}` + (o.shards ? ` + ${o.shards} ◆` : '')),
        btn('Buy', () => {
          const msg = buyOffer(s, o);
          if (!msg) return;
          sfx('loot');
          if (!o.item && o.kind !== 'gear') G.ui.toast(msg, 'good');
          G.d = derive(s);
          renderAny();
        }, 'btn small primary', { disabled: !!o.closed || !afford, 'data-k': 'buy_' + o.key })));
  }));
  return h('div', { class: 'col', style: 'flex:1' }, head, chips, list,
    h('div', { class: 'muted', style: 'font-size:0.8em;margin-top:6px' }, '◆ Relic Shards. Prices follow the chapter you have reached.'));
}

/** Selling (Ilan: silver and salvage, with buyback) or dismantling (Dov: double salvage, no silver). */
function sellPane(dismantle: boolean) {
  const s = G.save;
  const gear = s.inventory.filter((it) => { const sl = ITEMS[it.id].slot; return sl !== 'material' && sl !== 'key' && sl !== 'consumable'; });
  const why = new Map(gear.map((it) => [it, keepReason(s, it)]));
  gear.sort((a, b) => Number(!!why.get(a)) - Number(!!why.get(b)) || b.rarity - a.rarity);
  const trash = dismantle ? [] : junk(s);
  const junkSilver = trash.reduce((n, it) => n + sellPrice(it), 0);
  const act = (it: ItemInst) => {
    const key = (dismantle ? 'dis_' : 'sell_') + it.uid;
    if ((dismantle || needsConfirm(it)) && confirmKey !== key) { confirmKey = key; sfx('ui'); renderAny(); return; }
    confirmKey = null;
    const got = dismantle ? dismantleItem(s, it) : sellItem(s, it)?.mats;
    if (!got) return;
    sfx(dismantle ? 'hitMetal' : 'pickup');
    G.ui.toast(Object.entries(got).map(([k, n]) => `${ITEMS[k].name} ×${n}`).join(' · '), 'loot');
    renderAny();
  };
  const rows = gear.map((it) => {
    const reason = why.get(it), key = (dismantle ? 'dis_' : 'sell_') + it.uid, arm = confirmKey === key;
    return h('div', { class: 'row-item' + (reason ? ' dim' : ''), style: 'cursor:default' }, itemIcon(it),
      h('div', null,
        h('div', { class: 'nm', style: rarityStyle(it.rarity) }, itemName(it)),
        h('div', { class: 'sub' }, `${RARITY_NAMES[it.rarity]} ${SLOT_NAMES[ITEMS[it.id].slot as Slot]}` + (reason ? ` · ${reason}` : '')),
        reason ? null : h('div', { style: 'font-size:0.85em' }, dismantle ? null : h('span', { class: 'price' }, `${sellPrice(it)} silver`), matsView(salvageOf(it, dismantle)))),
      h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end' },
        ITEMS[it.id].unique || isWorn(s, it.uid) ? null : lockButton(it),
        reason ? null : btn(arm ? (dismantle ? 'Break it down' : 'Confirm sale') : dismantle ? 'Dismantle' : 'Sell', () => act(it), 'btn small' + (arm ? ' primary' : ''), { 'data-k': key })));
  });
  const backs = !dismantle && buyback.length ? [h('h3', { style: 'margin:12px 0 4px' }, 'Buy back'), h('div', { class: 'muted', style: 'font-size:0.85em' }, 'Your last ten sales, until you close the game. The salvage goes back with the silver.'),
    h('div', { class: 'list' }, buyback.map((sale, i) => h('div', { class: 'row-item', style: 'cursor:default' }, itemIcon(sale.it),
      h('div', null, h('div', { class: 'nm', style: rarityStyle(sale.it.rarity) }, itemName(sale.it)), matsView(sale.mats)),
      h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'price' }, `${sale.silver}`),
        btn('Buy back', () => { if (buyBack(s, sale)) { sfx('loot'); renderAny(); } }, 'btn small', { disabled: !canBuyBack(s, sale), 'data-k': 'back_' + i })))))] : [];
  return h('div', { class: 'col', style: 'flex:1' },
    h('div', { class: 'muted', style: 'font-size:0.88em' }, dismantle
      ? 'Dov breaks gear down for twice the salvage of a sale, and no silver. Press twice to confirm.'
      : 'Selling pays silver and salvage. Rare gear and up asks you to confirm. Epic and up also yields Relic Shards.'),
    trash.length ? btn(`Sell all junk · ${trash.length} ${trash.length === 1 ? 'item' : 'items'} · ${junkSilver} silver`, () => {
      const r = sellJunk(s);
      if (r.n) { sfx('pickup'); G.ui.toast(`Sold ${r.n} for ${r.silver} silver`, 'loot'); renderAny(); }
    }, 'btn small', { 'data-k': 'sell_junk', style: 'margin:6px 0', title: 'Common and Uncommon gear, untempered and unlocked, where you already wear something at least as rare.' }) : null,
    rows.length ? h('div', { class: 'list' }, rows) : h('div', { class: 'muted' }, 'Nothing to part with. Equipped gear and keepsakes stay with you.'),
    ...backs);
}

/** The pause menu's Store: buy and sell anywhere outside a fight. */
function storeTab() {
  const blocked = storeBlocked();
  const pages = h('div', { class: 'modes', style: 'margin-bottom:6px' },
    ([['buy', 'Buy'], ['sell', 'Sell']] as const).map(([id, l]) => btn(l, () => { storePage = id; confirmKey = null; render(); }, 'btn small' + (storePage === id ? ' primary' : ''), { 'data-k': 'store_' + id })),
    purse());
  return h('div', { class: 'col scroll', style: 'flex:1' }, pages,
    blocked ? h('div', { class: 'box' }, h('p', { class: 'muted', style: 'margin:0' }, `${blocked} The store opens here once you are clear of danger, or visit Ilan's stall.`))
      : storePage === 'buy' ? storePane(false) : sellPane(false));
}

// ---------------------------------------------------------------- altar menu

export function openAltar(id: string) {
  const s = G.save;
  pause(true);
  let travel = false;
  const card = h('div', { class: 'choice-card panel scroll altar' });
  const layer = h('div', { class: 'layer dim' }, card);
  const done = () => {
    popLayer(layer);
    pause(false);
  };
  // Travel is a second page of the same card, so Back steps out of it first.
  const show = (t: boolean) => {
    travel = t;
    clear(card);
    for (const el of t ? travelPage() : mainPage()) if (el) card.append(el);
    card.scrollTop = 0;
    focusFirst(card);
  };
  const mainPage = () => {
    const groups = travelGroups(id), blocked = travelBlocked();
    const count = groups.reduce((n, g) => n + g.stops.length, 0);
    return [
      h('div', { class: 'eyebrow' }, 'Altar'),
      h('h2', { class: 'title-text' }, altarName(id)),
      h('p', { class: 'muted' }, 'Health, Balm and Covenant Energy restored. Your Echoes are made whole. Foes of the Veil stir again. Progress saved.'),
      h('div', { class: 'opts' },
        btn([h('b', null, 'Continue')], () => done(), 'btn opt', { 'data-autofocus': '', 'data-k': 'altar_continue' }),
        count ? btn([h('b', null, 'Travel'), h('span', null, blocked ?? `${count} kindled ${count === 1 ? 'altar' : 'altars'} to walk out at`)], () => show(true), 'btn opt', { disabled: !!blocked, 'data-k': 'altar_travel' }) : null,
        s.statPoints || s.skillPoints ? btn([h('b', null, 'Spend points'), h('span', null, `${s.statPoints} stat · ${s.skillPoints} skill`)], () => { done(); openMenu(s.statPoints ? 'character' : 'skills'); }, 'btn opt') : null,
        ...(() => {
          // The next chapter, once the one before it is finished.
          const nx = nextChapter();
          return nx ? [btn([h('b', null, 'Journey on'), h('span', null, `Chapter ${nx.roman} · ${nx.title}`)], () => { done(); travelToChapter(nx); }, 'btn opt')] : [];
        })(),
        trainingOpen() ? btn([h('b', null, 'Enter the Trial of the Remnant'), h('span', null, `Endless rounds that grow with you${s.flags.trial_best ? ` · best: round ${s.flags.trial_best}` : ''}`)], () => {
          done();
          startTraining(1);
        }, 'btn opt') : null,
        trainingOpen() ? btn([h('b', null, 'Enter the Boss Gauntlet'), h('span', null, `Bosses only · stronger every round · best: ${s.flags.boss_trial_best ?? 0}`)], () => {
          done();
          startTraining(1, true);
        }, 'btn opt') : null,
        flag('ch1_done') ? btn([h('b', null, 'Begin New Game+'), h('span', null, 'Start Chapter I again with everything you have earned. Foes grow stronger.')], () => { done(); startNewGamePlus(); }, 'btn opt') : null,
      ),
    ];
  };
  const travelPage = () => {
    const blocked = travelBlocked();
    return [
      h('div', { class: 'eyebrow' }, 'Travel'),
      h('h2', { class: 'title-text' }, 'Walk out at another altar'),
      blocked ? h('p', { class: 'muted' }, blocked) : null,
      btn([h('b', null, 'Back'), h('span', null, altarName(id))], () => show(false), 'btn opt', { 'data-autofocus': '', 'data-k': 'travel_back', style: 'margin-top:10px' }),
      h('div', { class: 'opts' },
        // One column per chapter, so a phone in landscape shows several side by side.
        travelGroups(id).map((g) => h('div', { class: 'travel-group', style: 'display:grid;gap:8px;align-content:start' },
          h('div', { class: 'eyebrow', style: 'margin-top:6px' }, g.n ? `Chapter ${g.roman} · ${g.title}` : g.title),
          g.stops.map((st) => btn([h('b', null, st.name), ROOMS[st.room].name.replace(/^The /, '') === st.name.replace(/^The /, '') ? null : h('span', null, ROOMS[st.room].name)], () => {
            if (travelBlocked()) return;
            done();
            travelTo(st.id);
          }, 'btn opt', { disabled: !!blocked, 'data-k': 'travel_' + st.id })))),
      ),
    ];
  };
  document.getElementById('ui')!.appendChild(layer);
  show(false);
  pushLayer({ el: layer, onBack: () => (travel ? show(false) : done()) });
}

export { loadSlot, SLOT_COUNT, DEFAULT_KEYS };
