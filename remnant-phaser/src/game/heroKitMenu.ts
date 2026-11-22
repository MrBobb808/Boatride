// The pause menu's Uri and Barak sections, as Tirzah has hers (game/tirzahMenu.ts): each hero's character sheet
// (level, stat points), his own equipment in Elior's kinds of slot, and his skill tree. Added to the shared menu
// through addMenuSection; the original edition's menu has no such sections.
import { addMenuSection, legendLine, type MenuPageKit } from '../../../remnant/src/ui/menus';
import { h, btn } from '../../../remnant/src/ui/dom';
import { img } from '../../../remnant/src/ui/icons';
import { DERIVED_TIPS, derivedRows } from '../../../remnant/src/ui/statTips';
import { getItem, itemMods, type Derived } from '../../../remnant/src/game/state';
import { ITEMS, SLOTS, SLOT_NAMES, STAT_KEYS, STAT_INFO, RARITY_NAMES, xpToNext, type Slot, type StatKey } from '../../../remnant/src/game/data';
import { sfx } from '../classic/shim/audio';
import { KIT_NODES, KIT_TREES, KIT_NAME, KIT_COLOR, kitOf, kitStats, krank, canLearnKit, learnKit, allocateKit, equipKit, kitWearer, type KitHero } from './heroKit';
import type { PhaserSave } from './save';

interface Host { save: PhaserSave; eliorD: Derived; refreshStats(): void; persist(): void }

const SLOT_ICON: Record<string, string> = { weapon: 'sword', helm: 'helm', armor: 'armor', gauntlets: 'gauntlet', boots: 'boot', relic: 'lamp', ring: 'ring' };
/** The page ids of each hero's sections (Hud.ts opens a hero's own page when the menu opens while he fights). */
export const KIT_PAGES: Record<KitHero, { character: string; equipment: string; skills: string }> = {
  uri: { character: 'ur_character', equipment: 'ur_equipment', skills: 'ur_skills' },
  barak: { character: 'bk_character', equipment: 'bk_equipment', skills: 'bk_skills' },
};
const LINE: Record<KitHero, string> = {
  uri: 'Uri levels on his own while he fights, three times as fast while he is behind Elior. Each level brings 3 stat points and a skill point for his tree.',
  barak: 'Barak levels on his own while he fights, three times as fast while he is behind Elior. Each level brings 3 stat points and a skill point for his tree.',
};

export function addKitMenus(host: Host) { for (const hero of ['uri', 'barak'] as KitHero[]) addKitMenu(host, hero); }

function addKitMenu(host: Host, hero: KitHero) {
  const P = hero === 'uri' ? 'ur' : 'bk', color = KIT_COLOR[hero], name = KIT_NAME[hero];
  let slot: Slot = 'weapon', sel: string | null = null, node = KIT_NODES.find((n) => n.hero === hero)!.id;
  const changed = (kit: MenuPageKit) => { host.refreshStats(); host.persist(); kit.rerender(); };
  const his = () => kitStats(host.save, hero, host.eliorD);

  function character(kit: MenuPageKit) {
    const s = host.save, k = kitOf(s, hero), d = his(), n = Math.min(kit.batch(), k.statPoints);
    const rows = STAT_KEYS.map((key: StatKey) => h('div', { class: 'stat-row' },
      h('div', { 'data-tip': STAT_INFO[key].desc }, h('div', { class: 'nm' }, STAT_INFO[key].name), h('div', { class: 'ds' }, STAT_INFO[key].desc)),
      h('div', { class: 'val' }, String(d.stats[key])),
      btn('+' + (n || 1), () => { if (allocateKit(s, hero, key, kit.batch())) { sfx('uiConfirm'); changed(kit); } }, 'btn plus', { disabled: k.statPoints <= 0, 'data-k': `${P}_st_${key}`, 'aria-label': `Raise ${name}'s ${STAT_INFO[key].name}` })));
    const pct = (v: number) => (v * 100).toFixed(1) + '%';
    const kv = h('div', { class: 'kv' }, ...([
      ['Health', String(d.maxHp)], ['Attack power', d.atk.toFixed(1)], ['Damage reduction', pct(d.dr)], ['Critical chance', pct(d.crit)],
      ['Critical damage', '×' + d.critDmg.toFixed(2)], ['Attack speed', '×' + d.aspd.toFixed(2)], ['Move speed', '×' + d.speed.toFixed(2)],
      ['Ability power', '×' + d.abil.toFixed(2)], ['Covenant Energy', String(d.maxCe)], ['Skill recharge', '×' + d.skillRecharge.toFixed(2)],
    ] as [string, string][]).flatMap(([l, v]) => [h('span', DERIVED_TIPS[l] ? { 'data-tip': DERIVED_TIPS[l], class: 'tipped' } : null, l), h('span', null, v)]));
    return h('div', { class: 'col scroll', style: 'flex:1' },
      h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' },
        h('div', { class: 'box', style: 'flex:1.3;min-width:280px' },
          h('h3', { style: `color:${color}` }, `${name} — Level ${k.level}`),
          h('div', { class: 'muted', style: 'font-size:0.9em;margin-bottom:6px' }, `Experience ${Math.floor(k.xp)} / ${xpToNext(k.level)} · Points to spend: `, h('b', { style: 'color:var(--gold-hi)', 'data-k': `${P}_points` }, String(k.statPoints))),
          h('div', { class: 'bar', style: 'margin-bottom:8px' }, h('i', { style: `width:${(k.xp / xpToNext(k.level)) * 100}%;background:${color}` })),
          h('p', { class: 'muted', style: 'font-size:0.85em' }, LINE[hero]),
          kit.pointBatchPicker(), rows),
        h('div', { class: 'col', style: 'flex:1;min-width:220px' },
          h('div', { class: 'box' }, h('h3', null, 'Derived'), kv),
          h('div', { class: 'box' }, h('h3', null, 'Shared with Elior'), h('p', { class: 'muted', style: 'font-size:0.85em;margin:0' }, 'The Echoes, the Super gauge, Balm, silver and materials belong to the whole covenant. The inventory is shared too, but a piece is worn by one hero at a time.')))));
  }

  function equipment(kit: MenuPageKit) {
    const s = host.save, k = kitOf(s, hero);
    const chips = h('div', { class: 'slots' }, SLOTS.map((sl) => {
      const it = getItem(s, k.equipment[sl]);
      return h('button', { class: 'slot' + (sl === slot ? ' sel' : ''), 'data-nav': '', 'data-k': `${P}_slot_${sl}`, onclick: () => { slot = sl; sel = it?.uid ?? null; kit.rerender(); } },
        it ? kit.itemIcon(it) : img(SLOT_ICON[sl] ?? 'shard', '#4a4458'), SLOT_NAMES[sl]);
    }));
    const worn = k.equipment[slot], elior = new Set(Object.values(s.equipment));
    // Elior's own pieces stay his; another kit hero's can be taken.
    const items = s.inventory.filter((it) => ITEMS[it.id]?.slot === slot && !elior.has(it.uid));
    if (!sel || !items.some((i) => i.uid === sel)) sel = worn ?? items[0]?.uid ?? null;
    const whose = (uid: string) => { const w = kitWearer(s, uid); return w && w !== hero ? `WORN BY ${KIT_NAME[w].toUpperCase()}` : null; };
    const list = h('div', { class: 'list' }, items.length ? items.map((it) => h('button', {
      class: 'row-item' + (it.uid === sel ? ' sel' : '') + (it.isNew ? ' new' : ''), 'data-nav': '', 'data-k': `${P}_it_${it.uid}`,
      onclick: () => { sel = it.uid; it.isNew = false; kit.rerender(); },
    }, kit.itemIcon(it), h('div', null, h('div', { class: 'nm', style: kit.rarityStyle(it.rarity) }, kit.itemName(it)), h('div', { class: 'sub' }, RARITY_NAMES[it.rarity] + ' ' + SLOT_NAMES[slot])),
      it.uid === worn ? h('span', { class: 'tag' }, 'EQUIPPED') : whose(it.uid) ? h('span', { class: 'tag' }, whose(it.uid)!) : h('span'))) :
      h('div', { class: 'muted', style: 'padding:8px' }, 'Nothing spare for this slot. Elior\'s own pieces stay on him; what you find goes into the shared inventory.'));
    const it = items.find((i) => i.uid === sel);
    let detail: HTMLElement;
    if (it) {
      const base = ITEMS[it.id], eq = getItem(s, worn), isEq = it.uid === worn;
      detail = h('div', { class: 'box' },
        h('div', { style: 'display:flex;gap:10px;align-items:center' }, kit.itemIcon(it), h('div', null, h('div', { class: 'title-text', style: kit.rarityStyle(it.rarity) + ';font-size:1.05em' }, kit.itemName(it)), h('div', { class: 'eyebrow' }, `${RARITY_NAMES[it.rarity]} · ${SLOT_NAMES[slot]}${base.element ? ' · ' + base.element : ''}`))),
        h('hr', { class: 'rule' }),
        h('div', null, kit.modLines(itemMods(it), !isEq && eq ? itemMods(eq) : undefined)),
        isEq ? null : ifEquipped(it.uid),
        legendLine(it),
        h('p', { class: 'muted', style: 'margin:8px 0 0' }, base.desc),
        h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
          isEq ? btn('Unequip', () => { equipKit(s, hero, slot, null); changed(kit); }, 'btn', { 'data-k': `${P}_unequip` })
            : btn(whose(it.uid) ? `Take from ${KIT_NAME[kitWearer(s, it.uid)!]}` : 'Equip', () => { if (equipKit(s, hero, slot, it.uid)) { it.isNew = false; sfx('uiConfirm'); changed(kit); } }, 'btn primary', { 'data-k': `${P}_equip` }),
          base.unique ? null : kit.lockButton(it)));
    } else detail = h('div', { class: 'box muted' }, 'Select an item.');
    return h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0;width:100%' },
      h('div', { class: 'col', style: 'flex:1.1;min-height:0' }, chips, h('div', { class: 'scroll', style: 'flex:1' }, list)),
      h('div', { class: 'col scroll', style: 'flex:1;min-height:0' }, detail));
  }

  /** What equipping it changes on his sheet. */
  function ifEquipped(uid: string) {
    const s = host.save, k = kitOf(s, hero), now = derivedRows(his());
    const next = derivedRows(kitStats({ ...s, kits: { ...s.kits, [hero]: { ...k, equipment: { ...k.equipment, [slot]: uid } } } }, hero, host.eliorD));
    const rows = now.flatMap(([label, x, f], i) => {
      const y = next[i][1];
      return Math.abs(y - x) < Math.max(1e-6, Math.abs(x) * 0.0005) ? [] : [h('span', { 'data-tip': DERIVED_TIPS[label] ?? '', class: 'tipped' }, label), h('span', { class: y > x ? 'up' : 'down' }, `${f(x)} → ${f(y)}`)];
    });
    return h('div', { class: 'if-equipped', 'data-k': `${P}_if_equipped` }, h('div', { class: 'eyebrow' }, 'If equipped'),
      rows.length ? h('div', { class: 'kv' }, rows) : h('div', { class: 'muted' }, 'No change to his numbers.'));
  }

  function skills(kit: MenuPageKit) {
    const s = host.save, k = kitOf(s, hero), n = KIT_NODES.find((x) => x.id === node)!;
    const trees = h('div', { class: 'trees' }, KIT_TREES[hero].map((t) => {
      const grid = h('div', { class: 'tree-grid' });
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        const x = KIT_NODES.find((m) => m.hero === hero && m.tree === t.id && m.row === row && m.col === col);
        if (!x) { grid.appendChild(h('div')); continue; }
        const rk = krank(s, hero, x.id);
        grid.appendChild(h('button', { class: 'node' + (rk > 0 ? ' learned' : canLearnKit(s, hero, x.id) ? ' avail' : '') + (x.id === node ? ' sel' : ''), 'data-nav': '', 'data-k': `${P}_sk_${x.id}`, 'aria-label': x.name, onclick: () => { node = x.id; kit.rerender(); } },
          h('span', null, img(x.icon, t.color)), x.ranks > 1 ? h('span', { class: 'rk' }, `${rk}/${x.ranks}`) : null));
      }
      return h('div', { class: 'tree' }, h('h3', { style: `color:${t.color}` }, t.name), h('p', null, t.blurb), grid);
    }));
    const rk = krank(s, hero, n.id), can = Math.max(0, Math.min(kit.batch(), n.ranks - rk, Math.floor(k.skillPoints / n.cost)));
    const req = n.req.length ? 'Requires ' + n.req.map((r) => KIT_NODES.find((x) => x.id === r)!.name).join(n.row === 3 ? ' and ' : ' or ') : 'No prerequisite';
    const detail = h('div', { class: 'box' },
      h('div', { class: 'title-text' }, n.name), h('div', { class: 'eyebrow' }, `${KIT_TREES[hero].find((t) => t.id === n.tree)!.name} · Rank ${rk}/${n.ranks} · Cost ${n.cost}`),
      h('p', { style: 'margin:6px 0' }, n.desc), h('div', { class: 'muted', style: 'font-size:0.85em' }, req), kit.pointBatchPicker(),
      h('div', { style: 'margin-top:8px' }, btn(rk >= n.ranks ? 'Mastered' : can > 1 ? `Learn ${can} ranks · ${can * n.cost} points` : 'Learn', () => {
        if (learnKit(s, hero, n.id, kit.batch())) { sfx('levelup', { vol: 0.5 }); changed(kit); }
      }, 'btn primary', { disabled: !canLearnKit(s, hero, n.id), 'data-k': `${P}_learn` })));
    return h('div', { class: 'col scroll', style: 'flex:1' }, h('div', { class: 'eyebrow', 'data-k': `${P}_skill_points` }, `${k.skillPoints} skill points for ${name}`), detail, trees);
  }

  const pages = KIT_PAGES[hero];
  addMenuSection({ id: hero, label: name, icon: hero === 'uri' ? 'flask' : 'arc', tabs: [
    { id: pages.character, label: 'Character', icon: 'stats' },
    { id: pages.equipment, label: 'Equipment', icon: 'sword' },
    { id: pages.skills, label: 'Skill tree', icon: 'skills' },
  ] }, hero === 'uri' ? 'tirzah' : 'uri', { [pages.character]: character, [pages.equipment]: equipment, [pages.skills]: skills });
}
