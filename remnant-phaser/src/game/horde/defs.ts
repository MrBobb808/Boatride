// The Horde (POLISH_PLAN §13): a top-down survival mode in endless stages. This file is its data: the places a
// stage can be, the foes drawn from the original's sprite sheets, and the upgrades a level-up offers.

export type HeroId = 'elior' | 'tirzah' | 'uri';
/** The order the switch brings them in. */
export const HEROES: HeroId[] = ['elior', 'tirzah', 'uri'];

/** A stage's ground: colours for the generated terrain, the foes that live there, and the monarch at its end. */
export interface Biome {
  id: string;
  name: string;
  /** Base, light speckle, dark speckle, crack/vein colour. */
  ground: [string, string, string, string];
  decor: ('rock' | 'bones' | 'shrub' | 'pillar' | 'ember' | 'crystal' | 'pool')[];
  foes: string[];
  boss: BossId;
  music: string;
  /** Ember gusts, ash, snow or spores drifting over the ground. */
  motes: number;
}
export type BossId = 'beast_monarch' | 'plague_monarch' | 'cinder_monarch';

export const BIOMES: Biome[] = [
  { id: 'ashen', name: 'The Ashen Fields', ground: ['#3a3430', '#5a5049', '#2a2522', '#ff7a2a'], decor: ['rock', 'bones', 'ember', 'shrub'], foes: ['husk', 'hound', 'sentinel', 'archer', 'knight'], boss: 'beast_monarch', music: 'village', motes: 0xffa060 },
  { id: 'shinar', name: 'The Plain of Shinar', ground: ['#6b5638', '#8a7350', '#4f3f28', '#c9a25a'], decor: ['pillar', 'rock', 'bones'], foes: ['soldier', 'brute', 'priest', 'scribe', 'bulwark'], boss: 'cinder_monarch', music: 'shinar', motes: 0xe8d2a0 },
  { id: 'valley', name: 'The Valley of Bones', ground: ['#4a4538', '#6c6552', '#332f26', '#b9b08e'], decor: ['bones', 'rock', 'pillar'], foes: ['drone', 'soldier', 'hound', 'wisp', 'knight'], boss: 'plague_monarch', music: 'valley', motes: 0xd8d0b0 },
  { id: 'hunt', name: 'The Frozen Wood', ground: ['#4c5a66', '#7d8d99', '#33404a', '#bfe2ff'], decor: ['shrub', 'rock', 'crystal'], foes: ['hound', 'lion', 'archer', 'sentinel', 'brute'], boss: 'beast_monarch', music: 'hunt', motes: 0xeaf6ff },
  { id: 'plague', name: 'The Blighted Marsh', ground: ['#34402a', '#4f5e38', '#232c1c', '#9ed15a'], decor: ['pool', 'shrub', 'bones'], foes: ['vessel', 'wisp', 'drone', 'husk', 'bulwark'], boss: 'plague_monarch', music: 'plague', motes: 0xb8ff7a },
  { id: 'cinders', name: 'The Foundry Waste', ground: ['#2e2624', '#4a3b35', '#1c1716', '#ff5a1f'], decor: ['ember', 'rock', 'pillar', 'crystal'], foes: ['lion', 'priest', 'knight', 'brute', 'soldier'], boss: 'cinder_monarch', music: 'cinders', motes: 0xff8040 },
];

export const BOSS_NAMES: Record<BossId, [string, string]> = {
  beast_monarch: ['VARKHOS', 'Crown of the Hunt'],
  plague_monarch: ['MORVANE', 'Crown of Pestilence'],
  cinder_monarch: ['AZKAR', 'Crown of Cinders'],
};

/** How a foe moves: straight at the hero, heavy and slow, keeping its distance to shoot, lunging, or drifting. */
export type FoeMode = 'chase' | 'tank' | 'ranged' | 'lunge' | 'drift';
export interface FoeKind { sheet: string; row: number; ox: number; oy: number; hp: number; speed: number; dmg: number; xp: number; scale: number; mode: FoeMode; r: number; mass: number }

/** The original's sheets (render/creatureSprites.ts): four keyframes a row (ready, stride, wind-up, strike). */
const K = (sheet: string, row: number, ox: number, hp: number, speed: number, dmg: number, xp: number, mode: FoeMode, scale = 0.72, r = 9, mass = 1): FoeKind =>
  ({ sheet, row, ox, oy: 88, hp, speed, dmg, xp, scale, mode, r, mass });
export const FOES: Record<string, FoeKind> = {
  husk: K('foes-ashen', 0, 38, 9, 33, 6, 1, 'chase'),
  sentinel: K('foes-ashen', 1, 32, 26, 26, 9, 2, 'tank', 0.8, 10, 2),
  archer: K('foes-ashen', 2, 35, 11, 30, 7, 2, 'ranged'),
  knight: K('foes-ashen', 3, 37, 40, 24, 11, 3, 'tank', 0.84, 11, 3),
  brute: K('foes-shinar', 0, 31, 60, 22, 14, 4, 'tank', 0.92, 13, 4),
  bulwark: K('foes-shinar', 1, 42, 80, 18, 12, 4, 'tank', 0.9, 13, 6),
  priest: K('foes-shinar', 2, 28, 14, 28, 9, 2, 'ranged'),
  scribe: K('foes-shinar', 3, 30, 12, 30, 8, 2, 'ranged'),
  hound: K('foes-beasts', 0, 47, 10, 46, 7, 1, 'lunge', 0.8),
  lion: K('foes-beasts', 1, 36, 30, 40, 12, 3, 'lunge', 0.86, 11, 2),
  drone: K('foes-beasts', 2, 41, 6, 52, 5, 1, 'drift', 0.66, 8),
  soldier: K('foes-beasts', 3, 29, 16, 36, 8, 2, 'chase', 0.74),
  wisp: K('foes-veil', 0, 36, 8, 38, 6, 1, 'drift', 0.68, 8),
  vessel: K('foes-veil', 1, 33, 22, 30, 10, 2, 'chase', 0.76, 10, 2),
};
export const FOE_SHEETS = ['foes-ashen', 'foes-shinar', 'foes-beasts', 'foes-veil'];

/** The auto-weapons a level-up can add: one each hero starts with, and the shared relics. */
export type WeaponId = 'blade' | 'bow' | 'flame' | 'seraphs' | 'pillar' | 'lion' | 'chains' | 'hallowed' | 'crescent' | 'frost';
export interface WeaponDef { id: WeaponId; name: string; desc: string; hero?: HeroId; levels: string[] }
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  blade: { id: 'blade', name: 'Covenant Blade', hero: 'elior', desc: 'Elior cuts a wide arc toward the nearest foe.', levels: ['+25% damage', 'Wider arc', '+25% damage', 'A second, backhand cut', 'Every cut sends a crescent'] },
  bow: { id: 'bow', name: 'Dawn Bow', hero: 'tirzah', desc: 'Tirzah looses arrows at the nearest foes.', levels: ['+1 arrow', 'Arrows pierce one more', '+25% damage', '+1 arrow', 'Arrows split on a kill'] },
  flame: { id: 'flame', name: 'Hand of Flame', hero: 'uri', desc: 'Uri hurls fire at the nearest foes; it bursts where it lands.', levels: ['+1 fireball', '+25% damage', 'Wider burst', '+1 fireball', 'Leaves the ground burning'] },
  seraphs: { id: 'seraphs', name: 'Ring of Light', desc: 'Orbs of light circle you and burn what they touch.', levels: ['+1 orb', '+25% damage', '+1 orb', 'Faster orbit', '+1 orb'] },
  pillar: { id: 'pillar', name: 'Pillar of Fire', desc: 'Fire falls on a foe nearby.', levels: ['+1 pillar', 'Wider flame', '+30% damage', '+1 pillar', 'Falls twice as often'] },
  lion: { id: 'lion', name: 'Roar of the Lion', desc: 'A lion of fire bursts from you and throws the horde back.', levels: ['Wider roar', '+30% damage', 'Roars more often', 'Burns the ground', '+40% damage'] },
  chains: { id: 'chains', name: 'Chains of Judgment', desc: 'A golden chain leaps from foe to foe.', levels: ['+2 links', '+25% damage', '+2 links', 'Binds (slows) the struck', 'Two chains at once'] },
  hallowed: { id: 'hallowed', name: 'Hallowed Ground', desc: 'The ground around you sears the horde.', levels: ['Wider ground', '+30% damage', 'Slows the horde', 'Wider ground', '+40% damage'] },
  crescent: { id: 'crescent', name: 'Crescent of Light', desc: 'A crescent flies out and back through the horde.', levels: ['+1 crescent', '+25% damage', 'Larger', '+1 crescent', 'Faster, and 30% stronger'] },
  frost: { id: 'frost', name: 'Crown of Frost', desc: 'Ice bursts around you, slowing all it touches.', levels: ['Wider burst', '+30% damage', 'Holds foes still', 'Bursts more often', '+40% damage'] },
};
export const RELICS: WeaponId[] = ['seraphs', 'pillar', 'lion', 'chains', 'hallowed', 'crescent', 'frost'];
/** Relic slots beside each hero's own weapon. */
export const RELIC_SLOTS = 4;

export type PassiveId = 'might' | 'swift' | 'haste' | 'reach' | 'vigor' | 'renewal' | 'magnet' | 'fortune' | 'precision' | 'plenty' | 'armor';
export const PASSIVES: Record<PassiveId, { name: string; desc: string; max: number }> = {
  might: { name: 'Might', desc: '+12% damage', max: 5 },
  swift: { name: 'Swift Feet', desc: '+8% movement', max: 5 },
  haste: { name: 'Haste', desc: 'Weapons and skills 8% faster', max: 5 },
  reach: { name: 'Reach', desc: '+12% area', max: 5 },
  vigor: { name: 'Vigor', desc: '+20% health, and healed', max: 5 },
  renewal: { name: 'Renewal', desc: 'Recover 0.5% health a second', max: 5 },
  magnet: { name: 'Gathering', desc: 'Gather gems from 40% farther', max: 5 },
  fortune: { name: 'Fortune', desc: '+15% XP and silver', max: 5 },
  precision: { name: 'Precision', desc: '+6% critical chance', max: 5 },
  plenty: { name: 'Plenty', desc: '+1 arrow, orb, crescent and fireball', max: 2 },
  armor: { name: 'Bulwark', desc: '8% less damage taken', max: 5 },
};

/**
 * Evolutions: a weapon at its last level, carried with its partner passive, evolves at the next chest or fallen
 * monarch into a stronger form of itself.
 */
export const EVOLUTIONS: Record<WeaponId, { with: PassiveId; name: string; desc: string; verse?: string }> = {
  blade: { with: 'might', name: 'Sword of the Spirit', desc: 'Every cut looses a wave of light; the Phantom chain comes every other cut', verse: '“the sword of the Spirit, which is the word of God” · Ephesians 6:17 (KJV)' },
  bow: { with: 'precision', name: 'Bow of the Dawn', desc: 'Two more arrows; every arrow pierces all and splits on a kill' },
  flame: { with: 'reach', name: 'Fire of the Altar', desc: 'One more fireball; every burst is wider and leaves the ground burning' },
  seraphs: { with: 'vigor', name: 'Halo of Seraphs', desc: 'Eight orbs in two rings turning both ways, at double strength' },
  pillar: { with: 'haste', name: 'Storm of Pillars', desc: 'Four strikes every second' },
  lion: { with: 'armor', name: 'Pride of the Lion', desc: 'Roars twice as often, and each roar heals' },
  chains: { with: 'magnet', name: 'Judgment Unbound', desc: 'Two chains twice as often, nine links each, binding all they strike' },
  hallowed: { with: 'renewal', name: 'Holy Ground', desc: 'Half again as wide, double the burn, and it heals while foes stand in it' },
  crescent: { with: 'swift', name: 'Crescent Moon', desc: 'Two more crescents, larger and faster' },
  frost: { with: 'plenty', name: 'Crown of Winter', desc: 'Every few seconds the whole field freezes' },
};

/** Seconds of horde before the stage's monarch arrives. */
export const stageTime = (stage: number) => Math.min(120, 70 + stage * 6);
/** Foe health and damage rise by stage: steady at first, then steeper, with no ceiling. */
export const stageHp = (stage: number) => Math.pow(1.32, stage - 1) * (1 + Math.max(0, stage - 6) * 0.15);
export const stageDmg = (stage: number) => Math.pow(1.14, stage - 1);
