// The pause menu (character, equipment, skills, Echoes, map, journal,
// crafting, settings, system), plus the merchant, the forge and altar menus.

import { G, flag } from '../game/ctx';
import { h, btn, pushLayer, popLayer, clear } from './dom';
import { img, iconUrl } from './icons';
import { input, ACTION_LABELS, DEFAULT_KEYS, type Action } from '../core/input';
import { settings, saveSettings, resetSettings, isTouchDevice } from '../core/settings';
import { sfx, audio } from '../audio/audio';
import { music } from '../audio/music';
import {
  ITEMS, SLOTS, SLOT_NAMES, STAT_KEYS, STAT_INFO, MOD_LABEL, RARITY_COLORS, RARITY_NAMES, TREES, SKILLS, ABILITIES,
  ECHO_SPECIES, ECHO_CLASS_INFO, LORE, FAMILY_NAMES, echoXpToNext, xpToNext,
  type ItemInst, type Slot, type ModKey, type AbilityId, type EchoInst, type StatKey,
} from '../game/data';
import {
  derive, getItem, itemMods, upgradeCost, MAX_PLUS, hasMaterials, payMaterials, makeItem, canLearn, learn, skillRank,
  echoMaxHp, echoAtk, addMaterial,
} from '../game/state';
import { QUESTS } from '../game/story';
import { ROOMS, chapterOf } from '../game/rooms';
import { CH2_ROOM_IDS } from '../game/rooms2';
import { guidePoint } from '../game/guide';
import { FINISHERS } from '../game/finishers';
import { MANTLE_LV, mantlePerks } from '../game/mantle';
import { nextChapter, travelToChapter, trainingOpen, startTraining } from '../game/chapters';
import { chaptersTab } from './chapters';
import { saveSlot, listSlots, deleteSlot, loadSlot, exportCode, importCode, SLOT_COUNT } from '../game/save';
import { formatTime, clamp } from '../core/math';
import { solve, newJoints } from '../render/skeleton';
import { drawHumanoid } from '../render/actors';
import { kitFor } from '../game/echoes';
import { TILE } from '../game/tiles';
import { FONT_DISPLAY } from '../render/draw';
import { returnToTitle, startNewGamePlus, loadGameSlot } from '../app';

let menuEl: HTMLElement | null = null;
let tab = 'character';
let bodyEl: HTMLElement;
let tabsEl: HTMLElement;

export const isMenuOpen = () => !!menuEl || !!shopEl;

const TABS: { id: string; label: string; icon: string }[] = [
  { id: 'character', label: 'Character', icon: 'stats' },
  { id: 'equipment', label: 'Equipment', icon: 'armor' },
  { id: 'skills', label: 'Skills', icon: 'skills' },
  { id: 'echoes', label: 'Echoes', icon: 'echo' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'chapters', label: 'Chapters', icon: 'chapters' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'crafting', label: 'Crafting', icon: 'craft' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
  { id: 'system', label: 'System', icon: 'save' },
];

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
  if (t) tab = t;
  if (only) tab = only;
  tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  bodyEl = h('div', { class: 'menu-body' });
  const close = btn(only ? 'Done' : 'Resume', () => closeMenu(), 'btn small menu-close');
  menuEl = h('div', { class: 'menu' }, h('div', { class: 'menu-top' }, tabsEl, close), bodyEl);
  document.getElementById('ui')!.appendChild(menuEl);
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
  popLayer(menuEl);
  menuEl = null;
  pause(false);
  if (G.save) G.world.player.styleKey = '';
  only = null;
  sfx('uiBack');
}

function setTab(t: string) {
  tab = t;
  sfx('ui');
  renderTabs();
  render();
}

function renderTabs() {
  clear(tabsEl);
  for (const t of TABS) {
    if (only && t.id !== only) continue;
    const b = h('button', { class: 'tab' + (t.id === tab ? ' on' : ''), 'data-nav': '', role: 'tab', onclick: () => setTab(t.id) }, h('img', { src: iconUrl(t.icon, t.id === tab ? '#f6dea0' : '#9b92a6'), alt: '' }), t.label);
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
  if (G.save) G.d = derive(G.save);
  switch (tab) {
    case 'character': bodyEl.appendChild(characterTab()); break;
    case 'equipment': bodyEl.appendChild(equipmentTab()); break;
    case 'skills': bodyEl.appendChild(skillsTab()); break;
    case 'echoes': bodyEl.appendChild(echoesTab()); break;
    case 'map': bodyEl.appendChild(mapTab()); break;
    case 'chapters': bodyEl.appendChild(chaptersTab(closeMenu)); break;
    case 'journal': bodyEl.appendChild(journalTab()); break;
    case 'crafting': bodyEl.appendChild(craftingTab()); break;
    case 'settings': bodyEl.appendChild(settingsTab()); break;
    case 'system': bodyEl.appendChild(systemTab()); break;
  }
  const sc = bodyEl.querySelector('.scroll') as HTMLElement | null;
  if (sc) sc.scrollTop = keepScroll;
  if (focusId && input.lastDevice !== 'touch') (bodyEl.querySelector(`[data-k="${focusId}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- character

function characterTab() {
  const s = G.save;
  const d = G.d;
  const rows = STAT_KEYS.map((k) => h('div', { class: 'stat-row' },
    h('div', null, h('div', { class: 'nm' }, STAT_INFO[k].name), h('div', { class: 'ds' }, STAT_INFO[k].desc)),
    h('div', { class: 'val' }, String(d.stats[k]), d.stats[k] !== s.stats[k] ? h('span', { class: 'up', style: 'font-size:0.7em;margin-left:4px' }, `(${s.stats[k]}+${d.stats[k] - s.stats[k]})`) : null),
    btn('+', () => { spendStat(k); }, 'btn plus', { disabled: s.statPoints <= 0, 'data-k': 'st_' + k, 'aria-label': 'Raise ' + STAT_INFO[k].name }),
  ));
  rows.push(h('div', { class: 'stat-row' }, h('div', null, h('div', { class: 'nm' }, 'Covenant Energy'), h('div', { class: 'ds' }, flag('relic_taken') ? 'Fuels abilities. Grows with Wisdom.' : 'Dormant. Something in the temple may wake it.')), h('div', { class: 'val' }, flag('relic_taken') ? String(d.maxCe) : '—'), h('span')));
  rows.push(h('div', { class: 'stat-row' }, h('div', null, h('div', { class: 'nm' }, 'Summon Capacity'), h('div', { class: 'ds' }, 'Echoes that can fight beside you at once. Grows with the story and the Commander tree.')), h('div', { class: 'val' }, String(d.echoSlots)), h('span')));
  const pct = (v: number) => (v * 100).toFixed(1) + '%';
  const derived = h('div', { class: 'kv' },
    'Health', `${Math.ceil(s.hp)} / ${d.maxHp}`,
    'Attack power', d.atk.toFixed(1),
    'Damage reduction', pct(d.dr),
    'Critical chance', pct(d.crit),
    'Critical damage', '×' + d.critDmg.toFixed(2),
    'Attack speed', '×' + d.aspd.toFixed(2),
    'Move speed', '×' + d.speed.toFixed(2),
    'Ability power', '×' + d.abil.toFixed(2),
    'Parry window', (d.parryWin * 1000).toFixed(0) + ' ms',
    'Rally charge rate', '×' + d.rallyMult.toFixed(2),
    'Echo damage', '×' + d.echoDmg.toFixed(2),
    'Echo health', '×' + d.echoHp.toFixed(2),
    'Weapon', FAMILY_NAMES[d.family],
  );
  for (const [i, el] of Array.from(derived.childNodes).entries()) {
    const sp = h('span', null, (el as Text).textContent ?? '');
    derived.replaceChild(sp, el);
    void i;
  }
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' },
      h('div', { class: 'box', style: 'flex:1.3;min-width:280px' },
        h('h3', null, `Elior — Level ${s.level}`),
        h('div', { class: 'muted', style: 'font-size:0.9em;margin-bottom:6px' }, `Experience ${Math.floor(s.xp)} / ${xpToNext(s.level)} · Points to spend: `, h('b', { style: 'color:var(--gold-hi)' }, String(s.statPoints))),
        h('div', { class: 'bar', style: 'margin-bottom:8px' }, h('i', { style: `width:${(s.xp / xpToNext(s.level)) * 100}%` })),
        rows,
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

function spendStat(k: StatKey) {
  const s = G.save;
  if (s.statPoints <= 0) return;
  s.statPoints--;
  s.stats[k]++;
  const before = G.d.maxHp;
  G.d = derive(s);
  if (k === 'vit') s.hp += G.d.maxHp - before;
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
  return ITEMS[it.id].name + (it.plus ? ` +${it.plus}` : '');
}

function modLines(m: Partial<Record<ModKey, number>>, cmp?: Partial<Record<ModKey, number>>) {
  const keys = new Set<ModKey>([...Object.keys(m), ...(cmp ? Object.keys(cmp) : [])] as ModKey[]);
  const out: HTMLElement[] = [];
  for (const k of keys) {
    const v = m[k] ?? 0;
    if (!v && !cmp) continue;
    const c = cmp ? (cmp[k] ?? 0) : null;
    const diff = c !== null ? v - c : 0;
    out.push(h('div', null, v ? MOD_LABEL[k](Math.round(v * 10) / 10) : h('span', { class: 'muted' }, MOD_LABEL[k](0).replace('+0', '—')),
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
      h('p', { class: 'muted', style: 'margin:8px 0 0' }, base.desc),
      base.lore ? h('p', { style: 'font-style:italic;margin:6px 0 0;font-size:0.92em' }, base.lore) : null,
      !isEq && eq ? h('div', { class: 'muted', style: 'font-size:0.82em;margin-top:6px' }, `Compared with ${itemName(eq)} (equipped).`) : null,
      h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
        isEq
          ? btn('Unequip', () => { if (eqSlot !== 'weapon') { delete s.equipment[eqSlot]; refreshEquip(); } }, 'btn', { disabled: eqSlot === 'weapon', 'data-k': 'unequip' })
          : btn('Equip', () => { s.equipment[eqSlot] = sel.uid; sfx('uiConfirm'); refreshEquip(); }, 'btn primary', { 'data-k': 'equip' }),
      ),
    );
  } else detail = h('div', { class: 'box muted' }, 'Select an item.');
  const mats = Object.entries(s.materials).filter(([, n]) => n > 0);
  return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
    h('div', { class: 'col', style: 'flex:1.1;min-height:0' }, slotChips, h('div', { class: 'scroll', style: 'flex:1' }, list)),
    h('div', { class: 'col scroll', style: 'flex:1;min-height:0' }, detail,
      h('div', { class: 'box' }, h('h3', null, 'Materials & relics'),
        h('div', { class: 'mats' }, mats.length ? mats.map(([k, n]) => h('span', null, h('b', null, `${n}× `), ITEMS[k].name)) : h('span', null, 'None yet.')),
        s.keyItems.length ? h('div', { class: 'mats', style: 'margin-top:6px' }, s.keyItems.map((k) => h('span', { style: 'color:var(--gold-hi)' }, ITEMS[k]?.name ?? k))) : null,
      ),
    ),
  );
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
  const reqText = node.req.length ? 'Requires ' + node.req.map((r) => SKILLS.find((x) => x.id === r)!.name).join(node.row === 3 ? ' and ' : ' or ') : 'No prerequisite';
  const detail = h('div', { class: 'box' },
    h('div', { class: 'title-text' }, node.name), h('div', { class: 'eyebrow' }, `${TREES.find((t) => t.id === node.tree)!.name} · Rank ${rk}/${node.ranks} · Cost ${node.cost}`),
    h('p', { style: 'margin:6px 0' }, node.desc),
    node.grants ? h('p', { style: 'font-style:italic;font-size:0.9em;margin:4px 0' }, ABILITIES[node.grants].verse) : null,
    h('div', { class: 'muted', style: 'font-size:0.85em' }, reqText),
    h('div', { style: 'margin-top:8px' }, btn(rk >= node.ranks ? 'Mastered' : 'Learn', () => {
      if (learn(s, node.id)) {
        sfx('levelup', { vol: 0.5 });
        G.d = derive(s);
        G.world.player.styleKey = '';
        render();
      }
    }, 'btn primary', { disabled: !canLearn(s, node.id), 'data-k': 'learn' })),
  );
  // ability loadout
  const loadout = h('div', { class: 'slots' }, [0, 1, 2].map((i) => {
    const id = s.equippedSkills[i];
    return h('button', { class: 'slot' + (i === loadoutSlot ? ' sel' : ''), 'data-nav': '', 'data-k': 'ls_' + i, onclick: () => { loadoutSlot = i; render(); } },
      id ? img(ABILITIES[id].icon, '#f6dea0') : img('shard', '#3a3448'), `Slot ${i + 1} · ${input.lastDevice === 'touch' ? '' : input.label((['skill1', 'skill2', 'skill3'] as const)[i])}`);
  }));
  const owned = h('div', { class: 'list' }, s.abilities.length ? s.abilities.map((a: AbilityId) => {
    const def = ABILITIES[a];
    const where = s.equippedSkills.indexOf(a);
    return h('button', { class: 'row-item', 'data-nav': '', 'data-k': 'ab_' + a, onclick: () => {
      const prev = s.equippedSkills[loadoutSlot];
      if (where >= 0) s.equippedSkills[where] = prev ?? null;
      s.equippedSkills[loadoutSlot] = a;
      sfx('uiConfirm');
      render();
    } }, img(def.icon, '#f6dea0'), h('div', null, h('div', { class: 'nm' }, def.name), h('div', { class: 'sub' }, `${def.cost} energy · ${def.cd}s · ${def.desc}`)), where >= 0 ? h('span', { class: 'tag' }, 'SLOT ' + (where + 1)) : h('span'));
  }) : h('div', { class: 'muted', style: 'padding:6px' }, 'No abilities yet. The temple holds something that may change that.'));
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start' },
      h('div', { class: 'box', style: 'flex:1;min-width:260px' }, h('h3', null, `Ability loadout · ${s.skillPoints} skill point${s.skillPoints === 1 ? '' : 's'}`), h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' }, 'Pick a slot, then an ability.'), loadout, h('div', { style: 'margin-top:8px' }, owned)),
      h('div', { style: 'flex:1;min-width:260px' }, detail),
    ),
    techniques(),
    trees,
  );
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
    ['Air Combo', `${K('attack')} ×3 in the air`, 'Keeps you and your foe aloft.', true],
    ["Heaven's Rend", `after an air combo, ${touch ? 'Attack again' : K('heavy')}`, 'Drill down through everything beneath you.', true],
    ['Plunge', `${K('down')} + ${K('attack')} in the air`, 'Crash down with a shockwave.', true],
    ['Charged Strike', `hold ${touch ? 'Attack' : K('heavy')}`, 'Three charge levels; the last breaks guards.', true],
    ['Parry & Counter', `${K('parry')} as a blow lands, then ${K('attack')}`, 'Turn their strength against them.', true],
    ['Execution', `${K('attack')} a staggered foe`, 'Plays a finisher, picked at random from those you have learned.', true],
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
  const kit = kitFor(e.species);
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
  if (!s.echoes.length) {
    return h('div', { class: 'col', style: 'flex:1;align-items:center;justify-content:center;text-align:center' },
      h('div', { class: 'title-text', style: 'font-size:1.2em' }, 'No Echoes yet'),
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
      h('div', null, h('div', { class: 'nm' }, esp.stages[e.stage].name + (e.commander ? ' ★' : '')), h('div', { class: 'sub' }, `${esp.cls} · Level ${e.level} · ${esp.stages[e.stage].title}`)),
      h('span', { class: 'tag' }, active ? 'ACTIVE' : 'RESERVE'));
  }));
  const active = s.active.includes(sel.uid);
  const canActivate = active || s.active.length < d.echoSlots;
  const maxHp = echoMaxHp(s, sel, d);
  const next = sel.stage < 2 ? { lv: sp.evolveLv[sel.stage], cost: sp.evolveCost[sel.stage] } : null;
  const canEvolve = !!next && sel.level >= next.lv && hasMaterials(s, next.cost);
  const costText = next ? Object.entries(next.cost).map(([k, v]) => `${v}× ${ITEMS[k].name} (have ${s.materials[k] ?? 0})`).join(', ') : '';
  const detail = h('div', { class: 'box' },
    h('div', { class: 'echo-card' }, echoPortrait(sel),
      h('div', null,
        h('div', { class: 'title-text', style: 'font-size:1.05em' }, sp.stages[sel.stage].name + (sel.commander ? ' — Commander' : '')),
        h('div', { class: 'eyebrow' }, `${sp.cls} · ${sp.stages[sel.stage].title}`),
        h('div', { class: 'muted', style: 'font-size:0.85em;margin:4px 0' }, ECHO_CLASS_INFO[sp.cls]),
        h('div', { class: 'kv', style: 'margin-top:4px' },
          h('span', null, 'Level'), h('span', null, String(sel.level)),
          h('span', null, 'Health'), h('span', null, `${Math.ceil(sel.hp > 0 ? Math.min(sel.hp, maxHp) : 0)} / ${maxHp}`),
          h('span', null, 'Attack'), h('span', null, echoAtk(s, sel, d).toFixed(1)),
        ),
        h('div', { class: 'bar', style: 'margin-top:6px' }, h('i', { style: `width:${(sel.xp / echoXpToNext(sel.level)) * 100}%` })),
      )),
    h('p', { style: 'margin:8px 0 4px' }, sp.stages[sel.stage].desc),
    h('p', { style: 'margin:0 0 6px;color:var(--gold-hi)' }, sp.stages[sel.stage].ability),
    next ? h('div', { class: 'muted', style: 'font-size:0.85em' }, `Evolves into ${sp.stages[sel.stage + 1].name} at level ${next.lv} with ${costText}.`) : h('div', { class: 'muted', style: 'font-size:0.85em' }, 'Final form reached.'),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
      btn(active ? 'Move to reserve' : 'Make active', () => {
        if (active) s.active = s.active.filter((u) => u !== sel.uid);
        else if (s.active.length < d.echoSlots) s.active.push(sel.uid);
        syncArmy();
      }, 'btn', { disabled: !canActivate, 'data-k': 'ec_act' }),
      btn('Evolve', () => evolve(sel), 'btn primary', { disabled: !canEvolve, 'data-k': 'ec_evo' }),
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

function evolve(e: EchoInst) {
  const s = G.save;
  const sp = ECHO_SPECIES[e.species];
  if (e.stage >= 2) return;
  const req = sp.evolveCost[e.stage];
  if (e.level < sp.evolveLv[e.stage] || !payMaterials(s, req)) return;
  e.stage++;
  e.hp = echoMaxHp(s, e, G.d);
  sfx('purify');
  const unit = G.world.echoes.find((u) => u.inst.uid === e.uid);
  if (unit) {
    unit.refreshStats();
    unit.name = sp.stages[e.stage].name;
  }
  G.ui.banner('ECHO EVOLVED', `${sp.stages[e.stage].name} · ${sp.stages[e.stage].title}`, 'echo');
  render();
}

// ---------------------------------------------------------------- map

function mapTab() {
  const s = G.save;
  const wrap = h('div', { class: 'map-wrap' });
  const c = h('canvas');
  wrap.appendChild(c);
  requestAnimationFrame(() => drawMap(c));
  const lit = s.altarsLit.map((a) => ALTAR_NAMES[a] ?? a);
  return h('div', { class: 'col', style: 'flex:1;min-height:0' },
    wrap,
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: 'background:#e2b85a' }), 'You are here: ' + G.world.room.name),
      h('span', null, h('i', { style: 'background:#ffcf6b;border-radius:50%' }), 'Altar'),
      h('span', null, h('i', { style: 'background:#6a5a8a' }), 'Explored'),
      h('span', null, h('i', { style: 'background:#ffcf6b;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' }), 'Objective'),
      h('span', null, `Altars kindled: ${lit.join(', ')}`),
    ),
  );
}

const ALTAR_NAMES: Record<string, string> = {
  sanctuary: 'Hearthward', temple_hall: 'Nave of the First Lamp', chamber: 'Covenant Chamber', antechamber: 'Hall of Offerings',
  shinar_camp: 'Camp at the Pass', tower_lower: 'The First Course', tower_upper: 'The Crimson Guard',
  valley_camp: 'Camp at the Valley\'s Edge', hive_mouth: 'Mouth of the Hive',
  river_camp: 'Camp by the Rivers', dura_plain: 'The Plain of Dura',
};
const ALTAR_ROOMS: Record<string, string> = {
  sanctuary: 'sanctuary', temple_hall: 'temple_hall', chamber: 'covenant_chamber', antechamber: 'idol_antechamber',
  shinar_camp: 'shinar_camp', tower_lower: 'tower_lower', tower_upper: 'tower_upper',
  valley_camp: 'valley_camp', hive_mouth: 'hive_mouth',
  river_camp: 'river_camp', dura_plain: 'dura_plain',
};

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

let jView: 'quests' | 'lore' = 'quests';
let jSel: string | null = null;

function journalTab() {
  const s = G.save;
  const sub = h('div', { class: 'modes' },
    btn('Quests', () => { jView = 'quests'; jSel = null; render(); }, 'btn small' + (jView === 'quests' ? ' primary' : ''), { 'data-k': 'jq' }),
    btn(`Inscriptions (${s.lore.length})`, () => { jView = 'lore'; jSel = null; render(); }, 'btn small' + (jView === 'lore' ? ' primary' : ''), { 'data-k': 'jl' }),
  );
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
        blocked ? h('div', { class: 'muted', style: 'font-size:0.8em' }, r.id === 'vial' ? 'Maximum Balm charges reached.' : 'The covenant has not yet woken.') : null),
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
  const binds = (['left', 'right', 'up', 'down', 'jump', 'attack', 'heavy', 'dodge', 'parry', 'skill1', 'skill2', 'skill3', 'interact', 'heal', 'echo', 'ultimate', 'menu', 'map'] as Action[]).map((a) =>
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
    h('div', { class: 'box' }, h('h3', null, 'Audio'),
      row('Master volume', '', slider(st.master, 0, 1, 0.05, (v) => (st.master = v), 'vm')),
      row('Music', '', slider(st.music, 0, 1, 0.05, (v) => (st.music = v), 'vmu')),
      row('Sound effects', '', slider(st.sfx, 0, 1, 0.05, (v) => (st.sfx = v), 'vs')),
      row('Respect the silent switch', 'On: iPhone\'s ring/silent switch mutes the game and lets your own music keep playing.', toggle(st.respectSilent, (v) => (st.respectSilent = v), 'rs')),
    ),
    h('div', { class: 'box' }, h('h3', null, 'Display'),
      row('Graphics quality', 'Auto lowers resolution if frames drop.', seg(st.quality, [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], (v) => { st.quality = v; G.renderer.autoPenalty = 0; setTimeout(() => G.renderer.resize(), 0); }, 'q')),
      row('Frame rate', 'Auto runs at your display\'s rate (120 Hz ProMotion). 60 saves battery.', seg(st.fps, [['auto', 'Auto'], ['60', '60 FPS']], (v) => (st.fps = v), 'fps')),
      row('Camera distance', '', seg(st.zoom, [['close', 'Close'], ['normal', 'Normal'], ['wide', 'Wide']], (v) => { st.zoom = v; setTimeout(() => G.renderer.resize(), 0); }, 'z')),
      row('Show frame rate', '', toggle(st.showFps, (v) => (st.showFps = v), 'sf')),
    ),
    h('div', { class: 'box' }, h('h3', null, 'Accessibility'),
      row('Text size', '', seg(st.textSize, [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']], (v) => { st.textSize = v; applyTextSize(); }, 'ts')),
      row('Screen shake', '', seg(st.shake, [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']], (v) => (st.shake = v), 'sh')),
      row('Reduce flashes', 'Softens bright full-screen flashes.', toggle(st.reduceFlashes, (v) => (st.reduceFlashes = v), 'rf')),
      row('Damage numbers', '', toggle(st.dmgNumbers, (v) => (st.dmgNumbers = v), 'dn')),
      row('Haptics', 'Light taps on button presses and big moments (iPhone, iOS 18+).', toggle(st.haptics, (v) => (st.haptics = v), 'hp')),
      row('Objective marker', 'A golden marker and screen-edge arrow that point toward your next objective.', toggle(st.guide, (v) => (st.guide = v), 'gd')),
    ),
    isTouchDevice() ? h('div', { class: 'box' }, h('h3', null, 'Touch controls'),
      row('Button size', '', slider(st.touchScale, 0.8, 1.3, 0.05, (v) => (st.touchScale = v), 'tsz')),
      row('Button opacity', '', slider(st.touchOpacity, 0.3, 1, 0.05, (v) => (st.touchOpacity = v), 'top')),
      row('Left-handed layout', 'Moves the buttons to the left and the stick to the right.', toggle(st.leftHanded, (v) => (st.leftHanded = v), 'lh')),
      row('Button labels', 'Show the name under each touch button.', toggle(st.buttonLabels, (v) => (st.buttonLabels = v), 'bl')),
      row('Dynamic Island indicator', 'On iPhones with a Dynamic Island, a living status ring around it: low health, the Shadow Mantle, Rally and news.', toggle(st.island, (v) => (st.island = v), 'di')),
    ) : null,
    h('div', { class: 'box' }, h('h3', null, 'Keyboard'), h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' }, 'Select a binding, then press the new key. Controllers use a fixed layout: A jump, X attack, Y heavy, B dodge, LB parry, RB/LT/RT skills, D-pad ↑ interact, D-pad ↓ Balm, L3 Echoes, R3 Rally, View switch Echo, Start menu.'),
      binds, h('div', { style: 'margin-top:8px' }, btn('Reset all settings', () => { resetSettings(); applyTextSize(); renderAny(); }, 'btn small', { 'data-k': 'reset' }))),
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

export function applyTextSize() {
  document.documentElement.classList.toggle('text-large', settings.textSize === 'large');
  document.documentElement.classList.toggle('text-xl', settings.textSize === 'xl');
}

// ---------------------------------------------------------------- system

let confirmQuit = false;

function systemTab() {
  const s = G.save;
  const slots = listSlots();
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
let shopTab: 'buy' | 'sell' | 'temper' | 'forge' = 'buy';

const STOCK: { id: string; price: number; mat?: boolean; once?: boolean; cond?: string }[] = [
  { id: 'iron_scrap', price: 14, mat: true },
  { id: 'veil_shard', price: 24, mat: true },
  { id: 'balm_vial', price: 140, once: true },
  { id: 'iron_cap', price: 45 },
  { id: 'chain_hauberk', price: 95 },
  { id: 'bronze_gauntlets', price: 60 },
  { id: 'greaves', price: 60 },
  { id: 'ember_lamp', price: 90 },
  { id: 'rusted_greatsword', price: 120 },
  { id: 'bell_shard', price: 160 },
  // Elemental arms, as the road goes on.
  { id: 'ember_brand', price: 420, once: true, cond: 'ch1_done' },
  { id: 'frostwake_spear', price: 420, once: true, cond: 'ch1_done' },
  { id: 'stormcaller', price: 780, once: true, cond: 'ch2_done' },
];

export function openShop(kind: 'merchant' | 'smith') {
  if (shopEl) return;
  shopKind = kind;
  shopTab = kind === 'merchant' ? 'buy' : 'temper';
  pause(true);
  sfx('uiOpen');
  shopBody = h('div', { class: 'menu-body' });
  shopEl = h('div', { class: 'menu' });
  document.getElementById('ui')!.appendChild(shopEl);
  renderShop();
  pushLayer({ el: shopEl, onBack: closeShop, onAction: (a) => {
    if (a === 'tabL' || a === 'tabR') {
      const tabs = shopKind === 'merchant' ? ['buy', 'sell'] : ['temper', 'forge'];
      const i = tabs.indexOf(shopTab);
      shopTab = tabs[(i + 1) % 2] as typeof shopTab;
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

function sellValue(it: ItemInst) {
  return Math.round((ITEMS[it.id].value * (1 + it.plus * 0.3) * (1 + it.rarity * 0.4)) / 2);
}

function renderShop() {
  if (!shopEl) return;
  const s = G.save;
  clear(shopEl);
  const tabs = shopKind === 'merchant' ? [['buy', 'Buy'], ['sell', 'Sell']] : [['temper', 'Temper'], ['forge', 'Forge']];
  const top = h('div', { class: 'menu-top' },
    h('div', { class: 'tabs' }, h('div', { class: 'tab on', style: 'cursor:default' }, shopKind === 'merchant' ? 'Ilan\'s stall' : 'Dov\'s forge'),
      tabs.map(([id, l]) => h('button', { class: 'tab' + (shopTab === id ? ' on' : ''), 'data-nav': '', onclick: () => { shopTab = id as typeof shopTab; renderShop(); } }, l))),
    h('span', { class: 'silver' }, `${s.silver} silver`),
    btn('Leave', closeShop, 'btn small'),
  );
  shopBody = h('div', { class: 'menu-body' });
  shopEl.append(top, shopBody);
  let content: HTMLElement;
  if (shopTab === 'buy') {
    content = h('div', { class: 'list' }, STOCK.filter((x) => !(x.once && G.save.flags['bought_' + x.id]) && (!x.cond || flag(x.cond))).map((x) => {
      const base = ITEMS[x.id];
      return h('div', { class: 'row-item', style: 'cursor:default' }, img(base.icon, RARITY_COLORS[base.rarity]),
        h('div', null, h('div', { class: 'nm', style: rarityStyle(base.rarity) }, base.name), h('div', { class: 'sub' }, base.desc)),
        h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'price' }, `${x.price}`),
          btn('Buy', () => {
            if (s.silver < x.price) return;
            s.silver -= x.price;
            if (x.mat) addMaterial(s, x.id, 1);
            else if (x.id === 'balm_vial') { s.balmMax++; s.balm++; G.save.flags['bought_' + x.id] = true; G.ui.toast('Balm charges: ' + s.balmMax, 'good'); }
            else { const it = makeItem(x.id); s.inventory.push(it); G.ui.itemGet(it); if (x.once) G.save.flags['bought_' + x.id] = true; }
            sfx('loot');
            renderShop();
          }, 'btn small primary', { disabled: s.silver < x.price, 'data-k': 'buy_' + x.id })));
    }));
  } else if (shopTab === 'sell') {
    const equipped = new Set(Object.values(s.equipment));
    const sellable = s.inventory.filter((i) => !equipped.has(i.uid) && !ITEMS[i.id].unique);
    content = h('div', { class: 'list' }, sellable.length ? sellable.map((it) => h('div', { class: 'row-item', style: 'cursor:default' }, itemIcon(it),
      h('div', null, h('div', { class: 'nm', style: rarityStyle(it.rarity) }, itemName(it)), h('div', { class: 'sub' }, RARITY_NAMES[it.rarity] + ' ' + SLOT_NAMES[ITEMS[it.id].slot as Slot])),
      h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'price' }, `${sellValue(it)}`),
        btn('Sell', () => { s.silver += sellValue(it); s.inventory = s.inventory.filter((x) => x !== it); sfx('pickup'); renderShop(); }, 'btn small', { 'data-k': 'sell_' + it.uid })))) : h('div', { class: 'muted' }, 'Nothing to sell. Equipped and unique items stay with you.'));
  } else if (shopTab === 'temper') {
    const gear = s.inventory.filter((i) => ITEMS[i.id].slot !== 'material' && ITEMS[i.id].slot !== 'key');
    const eqSet = new Set(Object.values(s.equipment));
    gear.sort((a, b) => Number(eqSet.has(b.uid)) - Number(eqSet.has(a.uid)));
    content = h('div', { class: 'list' }, gear.map((it) => {
      const cost = upgradeCost(it);
      const maxed = it.plus >= MAX_PLUS;
      const ok = !maxed && hasMaterials(s, cost);
      const next = { ...it, plus: it.plus + 1 };
      return h('div', { class: 'box', style: 'display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center' }, itemIcon(it),
        h('div', null, h('div', { class: 'nm', style: rarityStyle(it.rarity) + ';font-weight:600' }, itemName(it) + (eqSet.has(it.uid) ? ' · equipped' : '')),
          maxed ? h('div', { class: 'muted' }, 'Fully tempered.') : h('div', { style: 'font-size:0.85em' }, modLines(itemMods(next), itemMods(it))),
          maxed ? null : costView(cost), it.id.includes('sword') || it.id.includes('spear') || it.id.includes('blade') ? h('div', { class: 'muted', style: 'font-size:0.78em' }, 'Weapons begin to glow at +3 and burn with white fire at +5.') : null),
        btn('Temper', () => { if (payMaterials(s, cost)) { it.plus++; sfx('hitMetal'); sfx('loot'); G.d = derive(s); renderShop(); } }, 'btn small primary', { disabled: !ok, 'data-k': 'tmp_' + it.uid }));
    }));
  } else {
    content = craftingTab(true);
  }
  shopBody.appendChild(h('div', { class: 'col scroll', style: 'flex:1' }, content));
}

// ---------------------------------------------------------------- altar menu

export function openAltar(id: string) {
  const s = G.save;
  pause(true);
  const lit = s.altarsLit.filter((a) => a !== id && ALTAR_ROOMS[a]);
  const card = h('div', { class: 'choice-card panel scroll altar' },
    h('div', { class: 'eyebrow' }, 'Altar'),
    h('h2', { class: 'title-text' }, ALTAR_NAMES[id] ?? 'Altar'),
    h('p', { class: 'muted' }, 'Health, Balm and Covenant Energy restored. Your Echoes are made whole. Foes of the Veil stir again. Progress saved.'),
    h('div', { class: 'opts' },
      btn([h('b', null, 'Continue')], () => done(), 'btn opt', { 'data-autofocus': '' }),
      s.statPoints || s.skillPoints ? btn([h('b', null, 'Spend points'), h('span', null, `${s.statPoints} stat · ${s.skillPoints} skill`)], () => { done(); openMenu(s.statPoints ? 'character' : 'skills'); }, 'btn opt') : null,
      lit.length ? h('div', { class: 'eyebrow', style: 'margin-top:6px' }, 'Travel to another altar') : null,
      lit.map((a) => btn([h('b', null, ALTAR_NAMES[a])], () => {
        done();
        G.world.transition(ALTAR_ROOMS[a], 'altar');
        s.altar = { room: ALTAR_ROOMS[a], spawn: 'altar' };
      }, 'btn opt')),
      ...(() => {
        // The next chapter, once the one before it is finished.
        const nx = nextChapter();
        return nx ? [btn([h('b', null, 'Journey on'), h('span', null, `Chapter ${nx.roman} · ${nx.title}`)], () => { done(); travelToChapter(nx); }, 'btn opt')] : [];
      })(),
      trainingOpen() ? btn([h('b', null, 'Enter the Trial of the Remnant'), h('span', null, `Training: endless waves that grow with you${s.flags.trial_best ? ` · best: wave ${s.flags.trial_best}` : ''}`)], () => {
        done();
        startTraining(1);
      }, 'btn opt') : null,
      flag('ch1_done') ? btn([h('b', null, 'Begin New Game+'), h('span', null, 'Start Chapter I again with everything you have earned. Foes grow stronger.')], () => { done(); startNewGamePlus(); }, 'btn opt') : null,
    ),
  );
  const layer = h('div', { class: 'layer dim' }, card);
  document.getElementById('ui')!.appendChild(layer);
  const done = () => {
    popLayer(layer);
    pause(false);
  };
  pushLayer({ el: layer, onBack: done });
}

export { loadSlot, SLOT_COUNT, DEFAULT_KEYS };
