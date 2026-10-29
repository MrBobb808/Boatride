// The shared catalog is the source of truth for Elior's names, costs and cooldowns.
// Effects run through the classic layer on the Phaser world's simulation clock.
// Tirzah's six abilities exist only in this build: their catalog is below, and
// their effects are in archerKit.ts.
import { ABILITIES, type AbilityId } from '../../../remnant/src/game/data';
import { ARROW_LEVELS, type PhaserSave, type ArrowType } from './save';
import type { WorldApi } from './types';

export type SkillId = AbilityId;
export type ArcherSkillId = 'deliverance' | 'jonathan' | 'mark' | 'rain' | 'watchman' | 'quiver';
export type AnySkillId = SkillId | ArcherSkillId;
export interface SkillDef { id: AnySkillId; name: string; short: string; cost: number; cd: number; color: number; desc: string; icon: string; verse?: string }
const STYLE: Record<SkillId, [string, number]> = {
  sword_word: ['WORD', 0xffd27a], trumpet: ['HORN', 0xfff1c4], shield_faith: ['SHIELD', 0x9fd8ff],
  lion: ['LION', 0xffb347], still_waters: ['WATERS', 0x9fd8ff], pillar_fire: ['FIRE', 0xffcf6b],
  chains: ['BREAK', 0xddcfb0], armor_light: ['ARMOR', 0xffe6a8], chain_snare: ['SNARE', 0xddcfb0],
  blink_strike: ['RIFT', 0xad9aff], mending_light: ['MEND', 0x9de6bb], frost_ring: ['WINTER', 0xa0deff],
};
/** Tirzah's abilities, each unlocked at a level of the shared journey. */
export const ARCHER: Record<ArcherSkillId, SkillDef & { level: number }> = {
  deliverance: { id: 'deliverance', name: 'Arrow of Deliverance', short: 'DELIVER', cost: 30, cd: 6, color: 0xffb35c, icon: 'arc', level: 1,
    desc: 'One blazing arrow that pierces the whole line, knocks foes down and breaks guards.',
    verse: '"...The arrow of the LORD\'S deliverance, and the arrow of deliverance from Syria..." — 2 Kings 13:17 (KJV)' },
  jonathan: { id: 'jonathan', name: "Jonathan's Volley", short: 'VOLLEY', cost: 28, cd: 8, color: 0xa6efdc, icon: 'dagger', level: 6,
    desc: 'Three arrows plant in the ground past the foes, then burst back toward her, striking them from behind.',
    verse: '"And I will shoot three arrows on the side thereof, as though I shot at a mark." — 1 Samuel 20:20 (KJV)' },
  mark: { id: 'mark', name: "Hunter's Mark", short: 'MARK', cost: 20, cd: 12, color: 0xff8a6a, icon: 'horn', level: 10,
    desc: 'Mark a foe for 8 s: her arrows curve toward it, it takes a quarter more from her, and the Echoes turn on it.' },
  rain: { id: 'rain', name: 'Rain of Arrows', short: 'RAIN', cost: 35, cd: 10, color: 0x9fd8ff, icon: 'pillar', level: 16,
    desc: 'A rain of arrows falls over the ground ahead for 2.5 s.' },
  watchman: { id: 'watchman', name: "Watchman's Eye", short: 'EYE', cost: 30, cd: 20, color: 0xfff1c4, icon: 'shield', level: 22,
    desc: 'Time slows around her for 2 s, weak points glow, and her next three shots are precision hits.',
    verse: '"So thou, O son of man, I have set thee a watchman unto the house of Israel..." — Ezekiel 33:7 (KJV)' },
  quiver: { id: 'quiver', name: 'Quiver of the Mighty', short: 'QUIVER', cost: 40, cd: 24, color: 0xffd27a, icon: 'lion', level: 30,
    desc: 'For 10 s every shot splits into three.',
    verse: '"As arrows are in the hand of a mighty man; so are children of the youth." — Psalm 127:4 (KJV)' },
};
export const ARCHER_IDS = Object.keys(ARCHER) as ArcherSkillId[];
export const SKILLS = {
  ...(Object.keys(ABILITIES) as SkillId[]).reduce((out, id) => {
    out[id] = { ...ABILITIES[id], short: STYLE[id][0], color: STYLE[id][1] };
    return out;
  }, {} as Record<SkillId, SkillDef>),
  ...ARCHER,
} as Record<AnySkillId, SkillDef>;
export const isArcherSkill = (id: AnySkillId | null | undefined): id is ArcherSkillId => !!id && id in ARCHER;
export const archerUnlocked = (s: PhaserSave, id: ArcherSkillId) => s.level >= ARCHER[id].level;
/** Button positions are stable; the journey owns the ability in each position. While Tirzah fights, they are hers. */
export const SLOTS = [0, 1, 2] as const;
export const skillSlots = (s: PhaserSave): readonly (AnySkillId | null)[] => s.playableHero === 'tirzah' ? (s.archerSkills ?? NONE) : s.equippedSkills;
const NONE = [null, null, null] as const;
/** Fill her empty slots with abilities she has just reached, in order, and add the arrow types her level has
 * opened to the quiver. Returns the arrow types just added, for a notice. */
export function syncArcher(s: PhaserSave) {
  const quiver = (s.quiver ??= ['standard']), fresh: ArrowType[] = [];
  for (const t of Object.keys(ARROW_LEVELS) as ArrowType[]) if (s.level >= ARROW_LEVELS[t] && !quiver.includes(t)) { quiver.push(t); fresh.push(t); }
  const slots = (s.archerSkills ??= [null, null, null]);
  const known = new Set(s.archerKnown ?? []);
  for (const id of ARCHER_IDS) {
    if (!archerUnlocked(s, id) || known.has(id)) continue;
    known.add(id);
    const free = slots.indexOf(null);
    if (free >= 0 && !slots.includes(id)) slots[free] = id;
  }
  s.archerKnown = [...known];
  return fresh;
}
export function castSkill(w: WorldApi, id: SkillId) { w.castCovenant(id); }
