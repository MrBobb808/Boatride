// The pause menu's Tirzah section: her character sheet (level, stat points),
// her own equipment (bow, quiver, dagger, hood, garb, amulet, charm), her skill
// tree and her ability loadout. Added to the shared menu through
// addMenuSection; the original edition's menu has no such section.

import { addMenuSection, type MenuPageKit } from '../../../remnant/src/ui/menus';
import { h, btn } from '../../../remnant/src/ui/dom';
import { img } from '../../../remnant/src/ui/icons';
import { DERIVED_TIPS, derivedRows } from '../../../remnant/src/ui/statTips';
import { getItem, itemMods, type Derived } from '../../../remnant/src/game/state';
import { ITEMS, ARCHER_SLOTS, SLOT_NAMES, STAT_KEYS, STAT_INFO, RARITY_NAMES, xpToNext, type ArcherSlot, type StatKey } from '../../../remnant/src/game/data';
import { sfx } from '../classic/shim/audio';
import { ARCHER_NODES, ARCHER_TREES, trank, canLearnArcher, learnArcher, allocateArcher, archerStats, archerLevel } from './archer';
import { ARCHER, ARCHER_IDS, archerUnlocked, type ArcherSkillId } from './abilities';
import { abilityIconKey } from './abilityIcons';
import type { PhaserSave } from './save';

interface Host { save: PhaserSave; eliorD: Derived; refreshStats(): void; persist(): void }

const SLOT_ICON: Record<ArcherSlot, string> = { bow: 'bow', quiver: 'quiver', dagger: 'dagger', hood: 'hood', garb: 'armor', amulet: 'feather', charm: 'shard' };
const TIRZAH = '#a6efdc';

export function addTirzahMenu(host: Host) {
  let slot: ArcherSlot = 'bow', sel: string | null = null, node = ARCHER_NODES[0].id, loadout = 0;
  const changed = (kit: MenuPageKit) => { host.refreshStats(); host.persist(); kit.rerender(); };
  const her = () => archerStats(host.save, host.eliorD);

  function character(kit: MenuPageKit) {
    const s = host.save, a = s.archer!, d = her(), n = Math.min(kit.batch(), a.statPoints);
    const rows = STAT_KEYS.map((k: StatKey) => h('div', { class: 'stat-row' },
      h('div', { 'data-tip': STAT_INFO[k].desc }, h('div', { class: 'nm' }, STAT_INFO[k].name), h('div', { class: 'ds' }, STAT_INFO[k].desc)),
      h('div', { class: 'val' }, String(d.stats[k])),
      btn('+' + (n || 1), () => { if (allocateArcher(s, k, kit.batch())) { sfx('uiConfirm'); changed(kit); } }, 'btn plus', { disabled: a.statPoints <= 0, 'data-k': 'tz_st_' + k, 'aria-label': `Raise Tirzah's ${STAT_INFO[k].name}` })));
    const pct = (v: number) => (v * 100).toFixed(1) + '%';
    const kv = h('div', { class: 'kv' }, ...([
      ['Health', String(d.maxHp)], ['Attack power', d.atk.toFixed(1)], ['Damage reduction', pct(d.dr)], ['Critical chance', pct(d.crit)],
      ['Critical damage', '×' + d.critDmg.toFixed(2)], ['Attack speed', '×' + d.aspd.toFixed(2)], ['Move speed', '×' + d.speed.toFixed(2)],
      ['Ability power', '×' + d.abil.toFixed(2)], ['Covenant Energy', String(d.maxCe)], ['Skill recharge', '×' + d.skillRecharge.toFixed(2)],
    ] as [string, string][]).flatMap(([l, v]) => [h('span', DERIVED_TIPS[l] ? { 'data-tip': DERIVED_TIPS[l], class: 'tipped' } : null, l), h('span', null, v)]));
    return h('div', { class: 'col scroll', style: 'flex:1' },
      h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' },
        h('div', { class: 'box', style: 'flex:1.3;min-width:280px' },
          h('h3', { style: `color:${TIRZAH}` }, `Tirzah — Level ${a.level}`),
          h('div', { class: 'muted', style: 'font-size:0.9em;margin-bottom:6px' }, `Experience ${Math.floor(a.xp)} / ${xpToNext(a.level)} · Points to spend: `, h('b', { style: 'color:var(--gold-hi)', 'data-k': 'tz_points' }, String(a.statPoints))),
          h('div', { class: 'bar', style: 'margin-bottom:8px' }, h('i', { style: `width:${(a.xp / xpToNext(a.level)) * 100}%;background:${TIRZAH}` })),
          h('p', { class: 'muted', style: 'font-size:0.85em' }, 'Tirzah levels on her own. Whoever fights earns full experience; the hero waiting earns half. Each level brings 3 stat points and a skill point for her tree.'),
          kit.pointBatchPicker(), rows),
        h('div', { class: 'col', style: 'flex:1;min-width:220px' },
          h('div', { class: 'box' }, h('h3', null, 'Derived'), kv),
          h('div', { class: 'box' }, h('h3', null, 'Shared with Elior'), h('p', { class: 'muted', style: 'font-size:0.85em;margin:0' }, 'The Echoes, the Super gauge, Balm, silver and materials belong to the whole covenant. Echo slots and strength follow Elior.')))));
  }

  function equipment(kit: MenuPageKit) {
    const s = host.save, a = s.archer!;
    const chips = h('div', { class: 'slots' }, ARCHER_SLOTS.map((sl) => {
      const it = getItem(s, a.equipment[sl]);
      return h('button', { class: 'slot' + (sl === slot ? ' sel' : ''), 'data-nav': '', 'data-k': 'tz_slot_' + sl, onclick: () => { slot = sl; sel = it?.uid ?? null; kit.rerender(); } },
        it ? kit.itemIcon(it) : img(SLOT_ICON[sl], '#4a4458'), SLOT_NAMES[sl]);
    }));
    const items = s.inventory.filter((it) => ITEMS[it.id]?.slot === slot), worn = a.equipment[slot];
    if (!sel || !items.some((i) => i.uid === sel)) sel = worn ?? items[0]?.uid ?? null;
    const list = h('div', { class: 'list' }, items.length ? items.map((it) => h('button', {
      class: 'row-item' + (it.uid === sel ? ' sel' : '') + (it.isNew ? ' new' : ''), 'data-nav': '', 'data-k': 'tz_it_' + it.uid,
      onclick: () => { sel = it.uid; it.isNew = false; kit.rerender(); },
    }, kit.itemIcon(it), h('div', null, h('div', { class: 'nm', style: kit.rarityStyle(it.rarity) }, kit.itemName(it)), h('div', { class: 'sub' }, RARITY_NAMES[it.rarity] + ' ' + SLOT_NAMES[slot])), it.uid === worn ? h('span', { class: 'tag' }, 'EQUIPPED') : h('span'))) :
      h('div', { class: 'muted', style: 'padding:8px' }, 'Nothing for this slot yet. Foes, elites and bosses drop her gear, more often while she fights.'));
    const it = items.find((i) => i.uid === sel);
    let detail: HTMLElement;
    if (it) {
      const base = ITEMS[it.id], eq = getItem(s, worn), isEq = it.uid === worn;
      detail = h('div', { class: 'box' },
        h('div', { style: 'display:flex;gap:10px;align-items:center' }, kit.itemIcon(it), h('div', null, h('div', { class: 'title-text', style: kit.rarityStyle(it.rarity) + ';font-size:1.05em' }, kit.itemName(it)), h('div', { class: 'eyebrow' }, `${RARITY_NAMES[it.rarity]} · ${SLOT_NAMES[slot]}${base.element ? ' · ' + base.element : ''}`))),
        h('hr', { class: 'rule' }),
        h('div', null, kit.modLines(itemMods(it), !isEq && eq ? itemMods(eq) : undefined)),
        isEq ? null : ifEquipped(it.uid),
        h('p', { class: 'muted', style: 'margin:8px 0 0' }, base.desc),
        it.lootPower ? h('p', { class: 'up' }, `Power ${it.lootPower}: her drops grow with her level. Greater Power, greater stats.`) : null,
        base.lore ? h('p', { style: 'font-style:italic;margin:6px 0 0;font-size:0.92em' }, base.lore) : null,
        h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
          isEq ? btn('Unequip', () => { if (slot !== 'bow') { delete a.equipment[slot]; changed(kit); } }, 'btn', { disabled: slot === 'bow', 'data-k': 'tz_unequip' })
            : btn('Equip', () => { a.equipment[slot] = it.uid; it.isNew = false; sfx('uiConfirm'); changed(kit); }, 'btn primary', { 'data-k': 'tz_equip' }),
          base.unique ? null : kit.lockButton(it)));
    } else detail = h('div', { class: 'box muted' }, 'Select an item.');
    return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
      h('div', { class: 'col', style: 'flex:1.1;min-height:0' }, chips, h('div', { class: 'scroll', style: 'flex:1' }, list)),
      h('div', { class: 'col scroll', style: 'flex:1;min-height:0' }, detail));
  }

  /** What equipping it changes on her sheet. */
  function ifEquipped(uid: string) {
    const s = host.save, a = s.archer!, now = derivedRows(her());
    const next = derivedRows(archerStats({ ...s, archer: { ...a, equipment: { ...a.equipment, [slot]: uid } } }, host.eliorD));
    const rows = now.flatMap(([label, x, f], i) => {
      const y = next[i][1];
      return Math.abs(y - x) < Math.max(1e-6, Math.abs(x) * 0.0005) ? [] : [h('span', { 'data-tip': DERIVED_TIPS[label] ?? '', class: 'tipped' }, label), h('span', { class: y > x ? 'up' : 'down' }, `${f(x)} → ${f(y)}`)];
    });
    return h('div', { class: 'if-equipped', 'data-k': 'tz_if_equipped' }, h('div', { class: 'eyebrow' }, 'If equipped'),
      rows.length ? h('div', { class: 'kv' }, rows) : h('div', { class: 'muted' }, 'No change to her numbers.'));
  }

  function skills(kit: MenuPageKit) {
    const s = host.save, a = s.archer!, n = ARCHER_NODES.find((x) => x.id === node)!;
    const trees = h('div', { class: 'trees' }, ARCHER_TREES.map((t) => {
      const grid = h('div', { class: 'tree-grid' });
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        const x = ARCHER_NODES.find((m) => m.tree === t.id && m.row === row && m.col === col);
        if (!x) { grid.appendChild(h('div')); continue; }
        const rk = trank(s, x.id);
        grid.appendChild(h('button', { class: 'node' + (rk > 0 ? ' learned' : canLearnArcher(s, x.id) ? ' avail' : '') + (x.id === node ? ' sel' : ''), 'data-nav': '', 'data-k': 'tz_sk_' + x.id, 'aria-label': x.name, onclick: () => { node = x.id; kit.rerender(); } },
          h('span', null, img(x.icon, t.color)), x.ranks > 1 ? h('span', { class: 'rk' }, `${rk}/${x.ranks}`) : null));
      }
      return h('div', { class: 'tree' }, h('h3', { style: `color:${t.color}` }, t.name), h('p', null, t.blurb), grid);
    }));
    const rk = trank(s, n.id), can = Math.max(0, Math.min(kit.batch(), n.ranks - rk, Math.floor(a.skillPoints / n.cost)));
    const req = n.req.length ? 'Requires ' + n.req.map((r) => ARCHER_NODES.find((x) => x.id === r)!.name).join(n.row === 3 ? ' and ' : ' or ') : 'No prerequisite';
    const detail = h('div', { class: 'box' },
      h('div', { class: 'title-text' }, n.name), h('div', { class: 'eyebrow' }, `${ARCHER_TREES.find((t) => t.id === n.tree)!.name} · Rank ${rk}/${n.ranks} · Cost ${n.cost}`),
      h('p', { style: 'margin:6px 0' }, n.desc), h('div', { class: 'muted', style: 'font-size:0.85em' }, req), kit.pointBatchPicker(),
      h('div', { style: 'margin-top:8px' }, btn(rk >= n.ranks ? 'Mastered' : can > 1 ? `Learn ${can} ranks · ${can * n.cost} points` : 'Learn', () => {
        if (learnArcher(s, n.id, kit.batch())) { sfx('levelup', { vol: 0.5 }); changed(kit); }
      }, 'btn primary', { disabled: !canLearnArcher(s, n.id), 'data-k': 'tz_learn' })));
    return h('div', { class: 'col scroll', style: 'flex:1' }, h('div', { class: 'eyebrow', 'data-k': 'tz_skill_points' }, `${a.skillPoints} skill points for Tirzah`), detail, trees);
  }

  function abilities(kit: MenuPageKit) {
    const s = host.save, slots = (s.archerSkills ??= [null, null, null]);
    const icon = (id: ArcherSkillId) => { const u = iconData(id); return u ? h('img', { src: u, alt: '', style: 'width:32px;height:32px;image-rendering:pixelated' }) : img(ARCHER[id].icon, '#f6dea0'); };
    const row = h('div', { class: 'slots ability-slots' }, [0, 1, 2].map((i) => {
      const id = slots[i];
      return btn([id ? icon(id) : img('shard', '#6e6385'), h('span', null, `Slot ${i + 1}`, h('small', null, id ? ARCHER[id].name : 'Empty'))], () => { loadout = i; kit.rerender(); }, 'slot' + (i === loadout ? ' sel' : ''), { 'data-k': 'tz_ls_' + i });
    }));
    const cards = h('div', { class: 'ability-catalog' }, ARCHER_IDS.map((id) => {
      const def = ARCHER[id], open = archerUnlocked(s, id), at = slots.indexOf(id);
      return h('div', { class: 'ability-card' + (at >= 0 ? ' equipped' : '') },
        h('div', { class: 'row', style: 'align-items:center;gap:10px' }, icon(id), h('div', null, h('h3', null, def.name), h('div', { class: 'eyebrow' }, `${def.cost} Energy · ${def.cd}s cooldown`))),
        h('p', null, def.desc), def.verse ? h('p', { style: 'font-style:italic;font-size:0.88em' }, def.verse) : null,
        !open ? h('div', { class: 'muted', style: 'font-size:0.85em;margin-bottom:8px' }, `Tirzah learns it at level ${def.level}`) : null,
        btn(!open ? 'Locked' : at === loadout ? `Equipped · Slot ${at + 1}` : `Equip in Slot ${loadout + 1}`, () => {
          // Swapping exchanges slots, so each ability appears once.
          const old = slots[loadout] ?? null;
          if (at >= 0) slots[at] = old;
          slots[loadout] = id; sfx('uiConfirm'); host.persist(); kit.rerender();
        }, 'btn small' + (at === loadout ? ' primary' : ''), { disabled: !open, 'data-k': 'tz_ab_' + id }));
    }));
    return h('div', { class: 'col scroll', style: 'flex:1' }, h('div', { class: 'box' }, h('h3', null, "Tirzah's abilities"), h('p', { class: 'muted' }, `Level ${archerLevel(s)}. Select a slot, then equip an ability. They take the ability buttons while she fights.`), row), cards);
  }

  addMenuSection({ id: 'tirzah', label: 'Tirzah', icon: 'bow', tabs: [
    { id: 'tz_character', label: 'Character', icon: 'stats' },
    { id: 'tz_equipment', label: 'Equipment', icon: 'bow' },
    { id: 'tz_skills', label: 'Skill tree', icon: 'skills' },
    { id: 'tz_abilities', label: 'Abilities', icon: 'quiver' },
  ] }, 'elior', { tz_character: character, tz_equipment: equipment, tz_skills: skills, tz_abilities: abilities });
}

/** Her ability icons are Phaser textures; the menu shows them as data URLs. */
const iconUrls = new Map<string, string>();
let textures: { getBase64(key: string): string | undefined } | null = null;
export function useAbilityTextures(t: { getBase64(key: string): string | undefined }) { textures = t; }
function iconData(id: ArcherSkillId) {
  let u = iconUrls.get(id);
  if (!u) { u = textures?.getBase64(abilityIconKey(id)) ?? ''; if (u) iconUrls.set(id, u); }
  return u;
}
