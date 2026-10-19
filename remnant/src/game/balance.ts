// Survival belongs to the wave, not the level or equipment of its challenger.
export function sovereignDamage(level: number) {
  return level < 100 ? 1 : 1.5 + Math.max(0, level - 100) * 0.025;
}
export function trialStrength(wave: number) {
  return {
    hp: wave < 10 ? 1 + 0.18 * (wave - 1) : 2.62 * Math.pow(1.09, wave - 10),
    damage: Math.min(5, 1 + (wave - 1) * 0.07),
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
