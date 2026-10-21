// Survival belongs to the wave, not the level or equipment of its challenger.
export function sovereignDamage(level: number) {
  return level < 100 ? 1 : 1.2 + softGrowth(level - 100, 50, 0.25) * 0.004;
}
/** Every investment still helps, with a gentler slope after the knee. */
export function softGrowth(value: number, knee: number, tail: number) {
  const n = Math.max(0, value);
  return Math.min(n, knee) + Math.max(0, n - knee) * tail;
}
export function trainingBonus(rank: number) {
  const n = Math.max(0, rank);
  return Math.min(n, 10) * 0.1 + Math.min(Math.max(0, n - 10), 15) * 0.05 + Math.max(0, n - 25) * 0.025;
}
/** A complete wave pays a level fraction, not that fraction for every enemy. */
export const trialXpLevels = (wave: number) => 0.35 + Math.min(1, Math.max(1, wave) * 0.015);
export function trialStrength(wave: number) {
  return {
    hp: wave < 10 ? 1 + 0.18 * (wave - 1) : 2.62 * Math.pow(1.09, wave - 10),
    damage: Math.min(5, 1 + (wave - 1) * 0.07) * (1 + Math.max(0, wave - 30) * 0.04),
    tempo: Math.min(1.4, 1 + (wave - 1) * 0.012),
  };
}
export const ASCENDANT_LOOT = ['ascendant_blade', 'ascendant_spear', 'ascendant_greatsword', 'ascendant_helm', 'ascendant_armor', 'ascendant_gauntlets', 'ascendant_boots', 'ascendant_relic', 'ascendant_ring'];
export function waveLootPower(level: number, wave: number) {
  return Math.min(1_000_000, Math.floor(20 + Math.max(1, level) * 0.75 + wave * 10 + Math.pow(wave, 1.35) * 1.2));
}
/** Primary stats keep growing; secondary percentages grow more gently. */
export function lootScale(power: number, primary: boolean) {
  const p = Number.isFinite(power) ? Math.min(1_000_000, Math.max(0, power)) : 0;
  return primary ? 1 + p * 0.02 : 1 + Math.min(5, Math.sqrt(p / 100));
}
