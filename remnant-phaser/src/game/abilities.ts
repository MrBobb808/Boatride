// The shared catalog is the source of truth for names, costs and cooldowns.
// Effects run through the classic layer on the Phaser world's simulation clock.
import { ABILITIES, type AbilityId } from '../../../remnant/src/game/data';
import type { PhaserSave } from './save';
import type { WorldApi } from './types';

export type SkillId = AbilityId;
export interface SkillDef { id: SkillId; name: string; short: string; cost: number; cd: number; color: number; desc: string }
const STYLE: Record<SkillId, [string, number]> = {
  sword_word: ['WORD', 0xffd27a], trumpet: ['HORN', 0xfff1c4], shield_faith: ['SHIELD', 0x9fd8ff],
  lion: ['LION', 0xffb347], still_waters: ['WATERS', 0x9fd8ff], pillar_fire: ['FIRE', 0xffcf6b],
  chains: ['BREAK', 0xddcfb0], armor_light: ['ARMOR', 0xffe6a8], chain_snare: ['SNARE', 0xddcfb0],
  blink_strike: ['RIFT', 0xad9aff], mending_light: ['MEND', 0x9de6bb], frost_ring: ['WINTER', 0xa0deff],
};
export const SKILLS = (Object.keys(ABILITIES) as SkillId[]).reduce((out, id) => {
  out[id] = { ...ABILITIES[id], short: STYLE[id][0], color: STYLE[id][1] };
  return out;
}, {} as Record<SkillId, SkillDef>);
/** Button positions are stable; the journey owns the ability in each position. */
export const SLOTS = [0, 1, 2] as const;
export const skillSlots = (s: PhaserSave) => s.equippedSkills;
export function castSkill(w: WorldApi, id: SkillId) { w.castCovenant(id); }
