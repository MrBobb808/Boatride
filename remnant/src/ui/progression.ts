import { G } from '../game/ctx';
import { ITEMS, FAMILY_NAMES, SLOT_NAMES, type Slot } from '../game/data';
import { CONTRACT_IDS, CONTRACTS, GEAR_SETS, WEAPON_FAMILIES, MASTERY_PERKS, MASTERY_XP, masteryRank, masteryXp, contractPrize, contractTier, contractWins } from '../game/progression';
import { startTraining, trainingOpen, trainingStarts } from '../game/chapters';
import { h, btn } from './dom';

export function progressionTab() {
  const s = G.save, d = G.d;
  return h('div', { class: 'col scroll progression', style: 'flex:1' },
    h('div', { class: 'box' },
      h('div', { class: 'eyebrow' }, 'Power that stays with you'),
      h('h3', null, 'Weapon mastery'),
      h('p', { class: 'muted' }, 'Land weapon hits to master each family. Finishers grant double practice; each foe grants up to 8 points. Progress stays when you change weapons, leave a run, fall, or begin New Game+. Each rank adds 3% weapon damage while that family is equipped.'),
      h('div', { class: 'progression-grid' }, WEAPON_FAMILIES.map(family => {
        const rank = masteryRank(s, family), xp = masteryXp(s, family);
        const next = MASTERY_XP[Math.min(10, rank + 1)], floor = MASTERY_XP[rank];
        return h('div', { class: 'progression-card', 'data-mastery': family },
          h('div', { class: 'eyebrow' }, d.family === family ? 'Equipped family' : 'Try a different weapon'),
          h('h4', null, FAMILY_NAMES[family]),
          h('b', null, `Rank ${rank}/10 · +${rank * 3}% weapon damage`),
          h('progress', { max: String(Math.max(1, next - floor)), value: String(rank === 10 ? 1 : xp - floor), 'aria-label': `${FAMILY_NAMES[family]} mastery`, 'data-xp': String(xp) }),
          h('small', { class: 'muted' }, rank === 10 ? 'Mastered' : `${xp - floor}/${next - floor} practice to rank ${rank + 1}`),
          MASTERY_PERKS[family].map(perk => h('p', { class: rank >= perk.rank ? 'up' : 'muted' }, `${rank >= perk.rank ? '✓' : '◇'} Rank ${perk.rank}: ${perk.text}`)),
        );
      })),
    ),
    h('div', { class: 'box' }, h('h3', null, 'Armor set collection'),
      h('p', { class: 'muted' }, 'Complete five-wave contracts in Settings → Game modes or Chapters. The first three victories in each contract guarantee all three pieces. Equip two pieces for a bonus, or all three for a signature power. Inventory ownership alone does not activate a set.'),
      h('div', { class: 'progression-grid' }, CONTRACT_IDS.map(id => {
        const set = GEAR_SETS[id], count = d.sets[id];
        return h('div', { class: 'progression-card', 'data-set': id },
          h('div', { class: 'eyebrow', style: `color:${set.color}` }, `${count}/3 equipped · ${set.pieces.filter(piece => s.inventory.some(it => it.id === piece)).length}/3 collected`),
          h('h4', null, set.name),
          set.pieces.map(piece => {
            const item = s.inventory.find(it => it.id === piece), base = ITEMS[piece];
            return h('div', { class: 'sub' }, `${item ? '✓' : '◇'} ${base.name}${item?.plus ? ` +${item.plus}` : ''} · ${SLOT_NAMES[base.slot as Slot]}`);
          }),
          h('p', { class: count >= 2 ? 'up' : 'muted' }, `2 pieces: ${set.two}`),
          h('p', { class: count >= 3 ? 'up' : 'muted' }, `3 pieces: ${set.three}`),
          h('small', { class: 'muted' }, `Earned in ${CONTRACTS[id].name}. Repeats improve each piece up to +10 without creating duplicates.`),
        );
      })),
    ),
  );
}

export function contractBoard(close: () => void) {
  if (!trainingOpen()) return null;
  const R = G.world.story.ch3.rounds;
  const busy = G.world.bossActive || G.world.transitioning;
  const starts = trainingStarts();
  const from = h('select', { 'data-nav': '', 'data-k': 'contract_from', 'aria-label': 'Contract starting wave' }, starts.map(w => h('option', { value: String(w) }, w === 1 ? 'Wave 1 — fresh start' : `Wave ${w} — unlocked start`))) as HTMLSelectElement;
  return h('div', { class: 'contract-board' },
    h('div', { class: 'eyebrow' }, 'Choose your next hunt'),
    h('h3', null, 'Five-wave contracts'),
    h('p', { class: 'muted' }, 'Clear five consecutive waves for guaranteed legendary set gear, silver and forge fragments. Keep fighting afterward with the restrictions lifted. Falling or leaving early ends the attempt. Contracts are optional and unranked; blessings and normal wave rewards still apply.'),
    R.active && R.contract ? h('p', { class: 'up', 'data-k': 'contract_status' }, `${CONTRACTS[R.contract].name} · ${R.contractCleared}/5 cleared${R.contractComplete ? ' · reward saved; restrictions lifted' : ' · contract active'}`) : null,
    h('label', { class: 'contract-start' }, 'Starting wave ', from),
    h('div', { class: 'progression-grid' }, CONTRACT_IDS.map(id => {
      const c = CONTRACTS[id], prize = contractPrize(G.save, id), tier = contractTier(G.save, id), set = GEAR_SETS[id];
      const existing = G.save.inventory.find(it => it.id === prize.id);
      const hasGain = !existing || existing.plus < prize.plus;
      return h('div', { class: 'progression-card', 'data-contract': id },
        h('div', { class: 'eyebrow', style: `color:${set.color}` }, `Tier ${tier + 1} · ${contractWins(G.save, id)} completed`),
        h('h4', null, c.name),
        h('p', { class: 'muted' }, c.rule),
        tier ? h('small', { class: 'muted' }, `Tier adds ${tier * 10}% enemy health and ${tier * 5}% enemy damage, multiplied with this contract's rules.`) : null,
        h('p', { class: 'contract-prize' }, `${existing ? 'Improve' : 'Collect'} ${ITEMS[prize.id].name}${prize.plus ? ` to at least +${prize.plus}` : ''}`),
        h('small', { class: 'muted' }, `${set.name} · ${250 * (prize.plus + 1)} silver · ${2 + prize.plus} covenant fragments${!hasGain ? ' · piece already at this rank' : ''}`),
        btn(`Take ${c.name}`, () => { const wave = Number(from.value); close(); startTraining(wave, false, undefined, id); }, 'btn small', { disabled: busy || R.active, 'data-k': 'contract_' + id }),
      );
    })),
    h('small', { class: 'muted' }, R.active ? 'Finish or leave the current run before taking a new contract.' : 'Every three completions raises the tier and next gear rank, up to tier 11 and +10 gear. No time limits or daily resets.'),
  );
}
