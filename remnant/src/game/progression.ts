// Persistent goals shared by combat, equipment and the Trial contract board.
// No timers or calendar locks: every goal can be pursued at your own pace.
import type { WeaponFamily } from './data';

export const WEAPON_FAMILIES: WeaponFamily[] = ['blade', 'spear', 'greatsword'];
export const MASTERY_XP = [0, 20, 60, 120, 220, 360, 540, 780, 1080, 1440, 1880] as const;
export const MASTERY_PERKS: Record<WeaponFamily, { rank: number; text: string }[]> = {
  blade: [{ rank: 3, text: '+5% critical chance' }, { rank: 6, text: '+8% attack speed' }, { rank: 10, text: 'Weapon strikes steal 3% health' }],
  spear: [{ rank: 3, text: '+15% ability power' }, { rank: 6, text: '+30% energy regeneration' }, { rank: 10, text: 'Skills and Mantle pursuit recharge 25% faster' }],
  greatsword: [{ rank: 3, text: 'Heavy attacks and finishers deal 15% more poise damage' }, { rank: 6, text: 'Heavy attacks and finishers deal 20% more damage' }, { rank: 10, text: 'Heavy attacks and finishers break guards' }],
};
export interface ProgressionData {
  weaponMastery?: Partial<Record<WeaponFamily, number>>;
  contracts?: Partial<Record<ContractId, number>>;
}
const safeCount = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
export function masteryXp(s: ProgressionData, family: WeaponFamily) { return safeCount(s.weaponMastery?.[family], MASTERY_XP[10]); }
export function masteryRank(s: ProgressionData, family: WeaponFamily) {
  const xp = masteryXp(s, family);
  let rank = 0;
  while (rank < 10 && xp >= MASTERY_XP[rank + 1]) rank++;
  return rank;
}
export function gainMastery(s: ProgressionData, family: WeaponFamily, amount: number) {
  const before = masteryRank(s, family);
  (s.weaponMastery ??= {})[family] = Math.min(MASTERY_XP[10], masteryXp(s, family) + safeCount(amount, 8));
  return masteryRank(s, family) - before;
}

/** A foe pays at most eight points, across all weapons. Whiffs and blocks pay none. */
export class WeaponPractice {
  private credit = new WeakMap<object, number>();
  hit(s: ProgressionData, family: WeaponFamily, foe: object, damage: number, finisher: boolean) {
    if (!(damage > 0)) return 0;
    const spent = this.credit.get(foe) ?? 0;
    const amount = Math.min(8 - spent, finisher ? 2 : 1);
    if (amount <= 0) return 0;
    this.credit.set(foe, spent + amount);
    return gainMastery(s, family, amount);
  }
}

export type GearSetId = 'vigil' | 'rift' | 'legion';
export const GEAR_SETS: Record<GearSetId, { name: string; color: string; pieces: string[]; two: string; three: string }> = {
  vigil: { name: 'Unbroken Vigil', color: '#f4d295', pieces: ['vigil_helm', 'vigil_plate', 'vigil_boots'], two: '+20% parry window; regenerate 0.5% health per second after 4 seconds without damage.', three: 'Perfect parries restore 5% health and 8 extra energy, once every 3 seconds.' },
  rift: { name: 'Riftstalker', color: '#b6b6ff', pieces: ['rift_helm', 'rift_mail', 'rift_boots'], two: '+25% ability power and +8% movement speed.', three: 'Mantle weapon throw and blink pursuit recharge 75% faster.' },
  legion: { name: 'Remnant Legion', color: '#92ded0', pieces: ['legion_helm', 'legion_mail', 'legion_boots'], two: '+30% Echo damage and +25% Echo health.', three: 'Every defeated foe heals each living, summoned permanent Echo by 3% of its maximum health.' },
};

export type ContractId = GearSetId;
export const CONTRACT_IDS: ContractId[] = ['vigil', 'rift', 'legion'];
export const CONTRACTS: Record<ContractId, { name: string; rule: string; hp: number; damage: number; tempo: number; noBalm?: boolean }> = {
  vigil: { name: 'Iron Oath', rule: 'Balm is sealed. Foes have 20% more health and deal 20% more damage. Other healing works.', hp: 1.2, damage: 1.2, tempo: 1, noBalm: true },
  rift: { name: 'Rift Hunt', rule: 'Foes move and attack 25% faster and have 20% more health.', hp: 1.2, damage: 1, tempo: 1.25 },
  legion: { name: 'War of the Remnant', rule: 'Foes have 60% more health and deal 20% more damage. Bring your best Echo squad.', hp: 1.6, damage: 1.2, tempo: 1 },
};
export function isContract(id: unknown): id is ContractId { return CONTRACT_IDS.includes(id as ContractId); }
export function contractWins(s: ProgressionData, id: ContractId) { return safeCount(s.contracts?.[id], 1_000_000); }
export function contractTier(s: ProgressionData, id: ContractId) { return Math.min(10, Math.floor(contractWins(s, id) / 3)); }
export function contractPrize(s: ProgressionData, id: ContractId) {
  const wins = contractWins(s, id);
  return { id: GEAR_SETS[id].pieces[wins % 3], plus: Math.min(10, Math.floor(wins / 3)) };
}
export function migrateProgression(s: ProgressionData) {
  s.weaponMastery = Object.fromEntries(WEAPON_FAMILIES.map(f => [f, masteryXp(s, f)]));
  s.contracts = Object.fromEntries(CONTRACT_IDS.map(id => [id, contractWins(s, id)]));
}
