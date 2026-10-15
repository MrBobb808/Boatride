// Static game data: items, rarities, weapons, skills, Echo species, lore.
// Scripture is quoted from the King James Version.

export type Rarity = 0 | 1 | 2 | 3 | 4 | 5;
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Covenant'];
export const RARITY_COLORS = ['#c9c3b8', '#8fc77a', '#6fa8ff', '#c48cff', '#ffae42', '#fff2c2'];

export type Slot = 'weapon' | 'helm' | 'armor' | 'gauntlets' | 'boots' | 'relic' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'helm', 'armor', 'gauntlets', 'boots', 'relic', 'ring'];
export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Weapon', helm: 'Helm', armor: 'Armor', gauntlets: 'Gauntlets', boots: 'Boots', relic: 'Relic', ring: 'Ring',
};

export type StatKey = 'vit' | 'str' | 'agi' | 'end' | 'res' | 'wis';
export const STAT_KEYS: StatKey[] = ['vit', 'str', 'agi', 'end', 'res', 'wis'];
export const STAT_INFO: Record<StatKey, { name: string; desc: string }> = {
  vit: { name: 'Vitality', desc: '+12 maximum health per point.' },
  str: { name: 'Strength', desc: '+6% weapon damage per point.' },
  agi: { name: 'Agility', desc: '+1.2% attack speed and +0.8% critical chance per point.' },
  end: { name: 'Endurance', desc: '+1.6% damage reduction and more poise per point.' },
  res: { name: 'Resolve', desc: 'Wider parry window, +4% Rally charge rate per point.' },
  wis: { name: 'Wisdom', desc: '+8 Covenant Energy, +5% ability power per point.' },
};

/** Modifiers that items and skills can add. */
export type ModKey =
  | 'hp' | 'ce' | 'atk' | 'def' | 'crit' | 'critDmg' | 'aspd' | 'speed' | 'abil' | 'ceRegen'
  | 'echoDmg' | 'echoHp' | 'parry' | 'poise' | 'xp' | 'rally' | 'lifesteal'
  | StatKey;

export const MOD_LABEL: Record<ModKey, (v: number) => string> = {
  hp: (v) => `+${v} Health`,
  ce: (v) => `+${v} Covenant Energy`,
  atk: (v) => `+${v} Attack`,
  def: (v) => `+${v} Defense`,
  crit: (v) => `+${v}% Critical chance`,
  critDmg: (v) => `+${v}% Critical damage`,
  aspd: (v) => `+${v}% Attack speed`,
  speed: (v) => `+${v}% Move speed`,
  abil: (v) => `+${v}% Ability power`,
  ceRegen: (v) => `+${v}% Energy regeneration`,
  echoDmg: (v) => `+${v}% Echo damage`,
  echoHp: (v) => `+${v}% Echo health`,
  parry: (v) => `+${v}% Parry window`,
  poise: (v) => `+${v} Poise`,
  xp: (v) => `+${v}% Experience`,
  rally: (v) => `+${v}% Rally charge`,
  lifesteal: (v) => `Heal ${v}% of damage dealt`,
  vit: (v) => `+${v} Vitality`,
  str: (v) => `+${v} Strength`,
  agi: (v) => `+${v} Agility`,
  end: (v) => `+${v} Endurance`,
  res: (v) => `+${v} Resolve`,
  wis: (v) => `+${v} Wisdom`,
};

export type WeaponFamily = 'blade' | 'spear' | 'greatsword';
export const FAMILY_NAMES: Record<WeaponFamily, string> = {
  blade: 'Covenant Blade', spear: "Watchman's Spear", greatsword: 'Judgment Greatsword',
};

export interface ItemBase {
  id: string;
  name: string;
  slot: Slot | 'material' | 'key' | 'consumable';
  rarity: Rarity;
  icon: string;
  desc: string;
  /** Flat stats at +0. */
  mods?: Partial<Record<ModKey, number>>;
  family?: WeaponFamily;
  /** Weapon element: fire, frost, storm, shadow, holy or blood. */
  element?: 'fire' | 'frost' | 'storm' | 'shadow' | 'holy' | 'blood';
  /** Visual tier on Elior (0..3). */
  look?: number;
  value: number;
  unique?: boolean;
  lore?: string;
}

export const ITEMS: Record<string, ItemBase> = {
  // Weapons
  militia_sword: { id: 'militia_sword', name: 'Militia Sword', slot: 'weapon', rarity: 0, icon: 'sword', family: 'blade', mods: { atk: 10 }, value: 10, desc: 'Notched steel issued to the Hearthward watch. Light and quick.', look: 0 },
  covenant_blade: { id: 'covenant_blade', name: 'Covenant Blade', slot: 'weapon', rarity: 3, icon: 'sword', family: 'blade', mods: { atk: 22, crit: 5, abil: 10 }, value: 220, desc: 'Reforged around a shard of the covenant relic. Its edge hums near the Veil.', look: 2, unique: true, element: 'holy' },
  watchman_spear: { id: 'watchman_spear', name: "Watchman's Spear", slot: 'weapon', rarity: 2, icon: 'spear', family: 'spear', mods: { atk: 15, crit: 3 }, value: 120, desc: 'Long reach and piercing thrusts. Its third strike passes through every foe in line.', look: 1, lore: 'Carried by the wall-wardens of a kingdom whose walls are now dust.' },
  judgment_greatsword: { id: 'judgment_greatsword', name: 'Judgment Greatsword', slot: 'weapon', rarity: 4, icon: 'greatsword', family: 'greatsword', mods: { atk: 34, poise: 20, def: 4 }, value: 400, desc: 'Slow, crushing arcs that shatter guards and break poise.', look: 2, unique: true, element: 'fire', lore: 'Cast from the Idol\'s melted gilding, then quenched in the temple cistern.' },
  ember_brand: { id: 'ember_brand', name: 'Ember Brand', slot: 'weapon', rarity: 3, icon: 'sword', family: 'blade', element: 'fire', mods: { atk: 27, crit: 4 }, value: 260, desc: 'Fire element. A kiln-forged blade that never cools. Its cuts keep burning.', look: 2 },
  frostwake_spear: { id: 'frostwake_spear', name: 'Frostwake Spear', slot: 'weapon', rarity: 3, icon: 'spear', family: 'spear', element: 'frost', mods: { atk: 25, crit: 5 }, value: 260, desc: 'Frost element. Rime gathers along the shaft; struck foes slow to a crawl.', look: 1 },
  stormcaller: { id: 'stormcaller', name: 'Stormcaller', slot: 'weapon', rarity: 4, icon: 'greatsword', family: 'greatsword', element: 'storm', mods: { atk: 44, poise: 16, crit: 3 }, value: 420, desc: 'Storm element. Lightning leaps from every blow to the foes nearby.', look: 2 },
  umbral_fang: { id: 'umbral_fang', name: 'Umbral Fang', slot: 'weapon', rarity: 4, icon: 'sword', family: 'blade', element: 'shadow', mods: { atk: 40, crit: 8, lifesteal: 2 }, value: 440, desc: 'Shadow element. Cut from the Locust King\'s carapace; a second, darker blade follows each strike.', look: 2 },
  dawnbreaker: { id: 'dawnbreaker', name: 'Dawnbreaker', slot: 'weapon', rarity: 5, icon: 'greatsword', family: 'greatsword', element: 'holy', mods: { atk: 64, crit: 6, poise: 24, abil: 15 }, value: 999, desc: 'Light element. Forged where the dry bones stood up. It burns brightest against the greatest foes.', look: 2, unique: true, lore: '"So I prophesied as he commanded me, and the breath came into them, and they lived, and stood up upon their feet, an exceeding great army." — Ezekiel 37:10 (KJV)' },
  rusted_greatsword: { id: 'rusted_greatsword', name: 'Rusted Greatsword', slot: 'weapon', rarity: 1, icon: 'greatsword', family: 'greatsword', mods: { atk: 20, poise: 10 }, value: 60, desc: 'Heavy and blunt with age, but it still breaks shields.', look: 0 },
  // Helms
  watch_hood: { id: 'watch_hood', name: 'Watchman\'s Hood', slot: 'helm', rarity: 0, icon: 'hood', mods: { def: 1 }, value: 5, desc: 'Wool against the ash wind.', look: 0 },
  iron_cap: { id: 'iron_cap', name: 'Iron Cap', slot: 'helm', rarity: 1, icon: 'helm', mods: { def: 3, hp: 8 }, value: 40, desc: 'A dented cap that has turned more than one blow.', look: 1 },
  sentinel_helm: { id: 'sentinel_helm', name: 'Sentinel\'s Visor', slot: 'helm', rarity: 2, icon: 'helm', mods: { def: 5, poise: 10, end: 1 }, value: 110, desc: 'Purified steel taken from a Fallen Sentinel.', look: 2 },
  // Armor
  padded_tunic: { id: 'padded_tunic', name: 'Padded Tunic', slot: 'armor', rarity: 0, icon: 'armor', mods: { def: 2, hp: 5 }, value: 8, desc: 'Quilted cloth. Better than nothing, barely.', look: 0 },
  chain_hauberk: { id: 'chain_hauberk', name: 'Chain Hauberk', slot: 'armor', rarity: 1, icon: 'armor', mods: { def: 5, hp: 12 }, value: 60, desc: 'Riveted rings over a padded coat.', look: 1 },
  bulwark_plate: { id: 'bulwark_plate', name: 'Bulwark Plate', slot: 'armor', rarity: 3, icon: 'armor', mods: { def: 9, hp: 25, poise: 15 }, value: 260, desc: 'Black plate with gold seams, forged from Sentinel steel.', look: 2 },
  // Gauntlets
  leather_wraps: { id: 'leather_wraps', name: 'Leather Wraps', slot: 'gauntlets', rarity: 0, icon: 'gauntlet', mods: { aspd: 2 }, value: 5, desc: 'Grip wraps for sword hands.', look: 0 },
  bronze_gauntlets: { id: 'bronze_gauntlets', name: 'Bronze Gauntlets', slot: 'gauntlets', rarity: 1, icon: 'gauntlet', mods: { atk: 3, def: 2 }, value: 45, desc: 'Weighted knuckles; strikes land harder.', look: 1 },
  archer_bracers: { id: 'archer_bracers', name: 'Ranger\'s Bracers', slot: 'gauntlets', rarity: 2, icon: 'gauntlet', mods: { aspd: 6, crit: 4 }, value: 100, desc: 'Light bracers stitched with gold thread.', look: 2 },
  // Boots
  worn_boots: { id: 'worn_boots', name: 'Worn Boots', slot: 'boots', rarity: 0, icon: 'boot', mods: { speed: 2 }, value: 5, desc: 'Resoled twice. Still walking.', look: 0 },
  greaves: { id: 'greaves', name: 'Iron Greaves', slot: 'boots', rarity: 1, icon: 'boot', mods: { def: 2, poise: 6 }, value: 45, desc: 'Shin guards that keep you standing.', look: 1 },
  pilgrim_boots: { id: 'pilgrim_boots', name: 'Pilgrim\'s Sandals', slot: 'boots', rarity: 2, icon: 'boot', mods: { speed: 6, ceRegen: 10 }, value: 110, desc: 'Feet shod for long roads.', look: 1, lore: '"And your feet shod with the preparation of the gospel of peace;" — Ephesians 6:15 (KJV)' },
  // Relics
  ember_lamp: { id: 'ember_lamp', name: 'Ember Lamp', slot: 'relic', rarity: 1, icon: 'lamp', mods: { ce: 10, ceRegen: 10 }, value: 50, desc: 'A small lamp that never quite goes out.' },
  bell_shard: { id: 'bell_shard', name: 'Bell Shard', slot: 'relic', rarity: 2, icon: 'shard', mods: { rally: 20, res: 1 }, value: 100, desc: 'A sliver of the temple bell. It still rings when struck in anger.' },
  sentinel_sigil: { id: 'sentinel_sigil', name: 'Sigil of the Sentinel', slot: 'relic', rarity: 3, icon: 'sigil', mods: { echoHp: 20, echoDmg: 10 }, value: 200, desc: 'Echoes near you stand firmer.' },
  // Rings
  copper_ring: { id: 'copper_ring', name: 'Copper Ring', slot: 'ring', rarity: 0, icon: 'ring', mods: { hp: 5 }, value: 5, desc: 'Plain and green at the edges.' },
  ring_of_vigil: { id: 'ring_of_vigil', name: 'Ring of Vigil', slot: 'ring', rarity: 2, icon: 'ring', mods: { crit: 4, critDmg: 15 }, value: 120, desc: 'Worn by watchmen who never slept on duty.' },
  archivist_ring: { id: 'archivist_ring', name: 'Archivist\'s Signet', slot: 'ring', rarity: 4, icon: 'ring', mods: { wis: 2, abil: 15, xp: 10 }, value: 300, desc: 'Mara\'s family seal. She would want it used.', unique: true },
  covenant_signet: { id: 'covenant_signet', name: 'Signet of the Remnant', slot: 'ring', rarity: 5, icon: 'ring', mods: { res: 3, echoDmg: 20, rally: 25, ce: 15 }, value: 999, desc: 'Given to the one who laid the crown down. Echoes fight beside you with one heart.', unique: true, lore: '"But so shall it not be among you: but whosoever will be great among you, shall be your minister:" — Mark 10:43 (KJV)' },
  gilded_crown: { id: 'gilded_crown', name: 'Gilded Crown', slot: 'helm', rarity: 4, icon: 'crown', mods: { atk: 12, str: 3, crit: 6, def: -4 }, value: 0, desc: 'The Idol\'s crown. Power pours from it, and it asks only to be worn.', unique: true, look: 3 },
  // Chapter II
  brickmaker_wraps: { id: 'brickmaker_wraps', name: 'Brickmaker\'s Wraps', slot: 'gauntlets', rarity: 2, icon: 'gauntlet', mods: { atk: 5, crit: 3, aspd: 4 }, value: 120, desc: 'Pitch-stained cloth over hard calluses. A grip that does not slip.', look: 1 },
  pilgrim_band: { id: 'pilgrim_band', name: 'Pilgrim\'s Band', slot: 'ring', rarity: 2, icon: 'ring', mods: { hp: 20, ceRegen: 12 }, value: 130, desc: 'Worn smooth by a long road. Someone walked a long way to lose it here.' },
  tower_greaves: { id: 'tower_greaves', name: 'Tower Greaves', slot: 'boots', rarity: 2, icon: 'boot', mods: { def: 4, poise: 10, speed: 3 }, value: 140, desc: 'Red-lacquered plate from the Tower\'s honour guard.', look: 1 },
  crimson_mantle: { id: 'crimson_mantle', name: 'Crimson Mantle', slot: 'armor', rarity: 3, icon: 'armor', mods: { def: 8, hp: 30, atk: 6 }, value: 280, desc: 'A guardsman\'s red coat over black mail. It was made to be seen from far away.', look: 2 },
  overseer_sigil: { id: 'overseer_sigil', name: 'Overseer\'s Brand', slot: 'relic', rarity: 3, icon: 'sigil', mods: { poise: 15, str: 2, echoDmg: 8 }, value: 220, desc: 'The iron that marked every brick. Cold now, and lighter than it looks.' },
  oathblade: { id: 'oathblade', name: 'The Oathblade', slot: 'weapon', rarity: 5, icon: 'greatsword', family: 'greatsword', mods: { atk: 46, crit: 6, poise: 18, critDmg: 20 }, value: 999, desc: 'The Marshal\'s sword, given freely. It is heavy only for those who would misuse it.', look: 2, unique: true, element: 'blood', lore: '"I have fought a good fight, I have finished my course, I have kept the faith:" — 2 Timothy 4:7 (KJV)' },
  hound_fang: { id: 'hound_fang', name: 'Gatekeeper\'s Fang', slot: 'relic', rarity: 4, icon: 'shard', mods: { atk: 10, lifesteal: 3, crit: 4 }, value: 320, desc: 'A fang the length of a forearm, still warm at the root.', unique: true },
  // Materials
  iron_scrap: { id: 'iron_scrap', name: 'Iron Scrap', slot: 'material', rarity: 0, icon: 'scrap', value: 3, desc: 'Salvaged metal. The smith can use it.' },
  veil_shard: { id: 'veil_shard', name: 'Veil Shard', slot: 'material', rarity: 1, icon: 'veil', value: 6, desc: 'Crystallized corruption. Five can be purified into a Covenant Fragment.' },
  covenant_fragment: { id: 'covenant_fragment', name: 'Covenant Fragment', slot: 'material', rarity: 3, icon: 'fragment', value: 40, desc: 'A purified sliver of light. Used to evolve Echoes and temper equipment.' },
  radiant_core: { id: 'radiant_core', name: 'Radiant Core', slot: 'material', rarity: 4, icon: 'core', value: 150, desc: 'The burning heart left when the Idol fell. Lets an Echo reach its final form.' },
  sentinel_steel: { id: 'sentinel_steel', name: 'Sentinel Steel', slot: 'material', rarity: 2, icon: 'scrap', value: 25, desc: 'Dense black steel from a Fallen Sentinel.' },
  // Consumables
  balm_vial: { id: 'balm_vial', name: 'Empty Balm Vial', slot: 'consumable', rarity: 2, icon: 'vial', value: 80, desc: 'Adds one Balm charge, permanently.' },
  // Key items
  relic_shard: { id: 'relic_shard', name: 'Shattered Covenant Relic', slot: 'key', rarity: 5, icon: 'fragment', value: 0, desc: 'The broken relic that woke the covenant light in you.' },
  eagle_wings: { id: 'eagle_wings', name: 'Eagle Plume', slot: 'key', rarity: 4, icon: 'feather', value: 0, desc: 'Grants a second jump in mid-air.', lore: '"...they shall mount up with wings as eagles; they shall run, and not be weary..." — Isaiah 40:31 (KJV)' },
  ledger: { id: 'ledger', name: 'Archive Ledger', slot: 'key', rarity: 2, icon: 'book', value: 0, desc: 'A water-stained register of the temple archive. Mara asked for anything written.' },
  ram_horn: { id: 'ram_horn', name: 'Ram\'s Horn', slot: 'key', rarity: 4, icon: 'horn', value: 0, desc: 'Grants the Trumpet of Victory, which breaks cracked walls and seals.', lore: '"...when the people heard the sound of the trumpet, and the people shouted with a great shout, that the wall fell down flat..." — Joshua 6:20 (KJV)' },
};

export const RARITY_AFFIX_COUNT = [0, 1, 2, 2, 3, 3];
export const AFFIX_POOL: { key: ModKey; min: number; max: number }[] = [
  { key: 'hp', min: 6, max: 18 }, { key: 'atk', min: 2, max: 6 }, { key: 'def', min: 1, max: 4 },
  { key: 'crit', min: 2, max: 5 }, { key: 'aspd', min: 2, max: 6 }, { key: 'speed', min: 2, max: 5 },
  { key: 'ce', min: 5, max: 12 }, { key: 'abil', min: 4, max: 10 }, { key: 'echoDmg', min: 5, max: 12 },
  { key: 'vit', min: 1, max: 2 }, { key: 'str', min: 1, max: 2 }, { key: 'wis', min: 1, max: 2 },
];

export interface ItemInst {
  uid: string;
  id: string;
  rarity: Rarity;
  plus: number;
  affixes: { key: ModKey; v: number }[];
  qty?: number;
  isNew?: boolean;
}

// ---------- Abilities ----------

export type AbilityId = 'sword_word' | 'trumpet' | 'shield_faith' | 'lion' | 'still_waters' | 'pillar_fire' | 'chains' | 'armor_light';
export interface AbilityDef {
  id: AbilityId;
  name: string;
  cost: number;
  cd: number;
  icon: string;
  desc: string;
  verse: string;
}
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  sword_word: { id: 'sword_word', name: 'Sword of the Word', cost: 22, cd: 1.2, icon: 'arc', desc: 'Loose a brilliant golden arc that pierces every foe in its path.', verse: '"For the word of God is quick, and powerful, and sharper than any twoedged sword..." — Hebrews 4:12 (KJV)' },
  trumpet: { id: 'trumpet', name: 'Trumpet of Victory', cost: 30, cd: 4, icon: 'horn', desc: 'A shockwave that damages and staggers nearby foes, breaks guards, and shatters cracked walls.', verse: '"So the people shouted when the priests blew with the trumpets..." — Joshua 6:20 (KJV)' },
  shield_faith: { id: 'shield_faith', name: 'Shield of Faith', cost: 25, cd: 6, icon: 'shield', desc: 'Raise a barrier for 1.4s. Blocks all harm, reflects projectiles, and counters melee attackers.', verse: '"Above all, taking the shield of faith, wherewith ye shall be able to quench all the fiery darts of the wicked." — Ephesians 6:16 (KJV)' },
  lion: { id: 'lion', name: 'Lion\'s Courage', cost: 35, cd: 18, icon: 'lion', desc: 'For 10s: +35% damage, attacks cannot be interrupted, and fear has no hold on you.', verse: '"The wicked flee when no man pursueth: but the righteous are bold as a lion." — Proverbs 28:1 (KJV)' },
  still_waters: { id: 'still_waters', name: 'Still Waters', cost: 40, cd: 14, icon: 'water', desc: 'Form a pool of light for 6s that restores health to you and your Echoes.', verse: '"He maketh me to lie down in green pastures: he leadeth me beside the still waters." — Psalm 23:2 (KJV)' },
  pillar_fire: { id: 'pillar_fire', name: 'Pillar of Fire', cost: 45, cd: 8, icon: 'pillar', desc: 'Call a towering column of white fire onto the nearest foe ahead, striking many times.', verse: '"...and by night in a pillar of fire, to give them light..." — Exodus 13:21 (KJV)' },
  chains: { id: 'chains', name: 'Chains Broken', cost: 20, cd: 10, icon: 'chains', desc: 'Burst free: cleanse every hindrance, become briefly untouchable, and hurl nearby foes back.', verse: '"...he brought them out of darkness and the shadow of death, and brake their bands in sunder." — Psalm 107:14 (KJV)' },
  armor_light: { id: 'armor_light', name: 'Armor of Light', cost: 60, cd: 40, icon: 'armor', desc: 'Transform for 12s: take 40% less damage, and every swing releases a wave of light.', verse: '"...let us therefore cast off the works of darkness, and let us put on the armour of light." — Romans 13:12 (KJV)' },
};

// ---------- Skill trees ----------

export type TreeId = 'warrior' | 'guardian' | 'commander' | 'lightbearer';
export interface SkillNode {
  id: string;
  tree: TreeId;
  name: string;
  desc: string;
  ranks: number;
  cost: number;
  req: string[];
  row: number;
  col: number;
  grants?: AbilityId;
}
export const TREES: { id: TreeId; name: string; blurb: string; color: string }[] = [
  { id: 'warrior', name: 'Warrior', blurb: 'Blade, combination and critical mastery.', color: '#e6a15a' },
  { id: 'guardian', name: 'Guardian', blurb: 'Parries, defense, healing and endurance.', color: '#7fb3e8' },
  { id: 'commander', name: 'Commander', blurb: 'The strength of the Remnant you lead.', color: '#e8cf7f' },
  { id: 'lightbearer', name: 'Lightbearer', blurb: 'Covenant light shaped into power.', color: '#f4f0e0' },
];
export const SKILLS: SkillNode[] = [
  { id: 'w_edge', tree: 'warrior', name: 'Honed Edge', desc: '+8% melee damage per rank.', ranks: 3, cost: 1, req: [], row: 0, col: 1 },
  { id: 'w_relentless', tree: 'warrior', name: 'Relentless', desc: 'Your ground combo gains a fourth strike, Rising Verdict, which launches foes.', ranks: 1, cost: 1, req: ['w_edge'], row: 1, col: 0 },
  { id: 'w_keen', tree: 'warrior', name: 'Keen Eye', desc: '+8% critical chance and +25% critical damage.', ranks: 1, cost: 1, req: ['w_edge'], row: 1, col: 2 },
  { id: 'w_lion', tree: 'warrior', name: 'Lion\'s Courage', desc: 'Learn the Lion\'s Courage ability.', ranks: 1, cost: 2, req: ['w_relentless'], row: 2, col: 0, grants: 'lion' },
  { id: 'w_mastery', tree: 'warrior', name: 'Weapon Mastery', desc: 'Charged attacks charge 35% faster and gain a third, devastating level.', ranks: 1, cost: 2, req: ['w_keen'], row: 2, col: 2 },
  { id: 'w_exec', tree: 'warrior', name: 'Executioner', desc: 'Executions deal +60% damage and restore 25 Covenant Energy.', ranks: 1, cost: 2, req: ['w_lion', 'w_mastery'], row: 3, col: 1 },

  { id: 'g_skin', tree: 'guardian', name: 'Iron Skin', desc: '+5% damage reduction per rank.', ranks: 3, cost: 1, req: [], row: 0, col: 1 },
  { id: 'g_timing', tree: 'guardian', name: 'Perfect Timing', desc: 'Parry window +50%. Perfect parries restore 12 Covenant Energy.', ranks: 1, cost: 1, req: ['g_skin'], row: 1, col: 0 },
  { id: 'g_balm', tree: 'guardian', name: 'Steadfast', desc: '+1 Balm charge, and Balm heals 15% more.', ranks: 1, cost: 1, req: ['g_skin'], row: 1, col: 2 },
  { id: 'g_shield', tree: 'guardian', name: 'Shield of Faith', desc: 'Learn the Shield of Faith ability.', ranks: 1, cost: 2, req: ['g_timing'], row: 2, col: 0, grants: 'shield_faith' },
  { id: 'g_counter', tree: 'guardian', name: 'Shield Counter', desc: 'Counters after a parry deal +70% damage and always stagger.', ranks: 1, cost: 2, req: ['g_timing', 'g_balm'], row: 2, col: 2 },
  { id: 'g_chains', tree: 'guardian', name: 'Chains Broken', desc: 'Learn the Chains Broken ability.', ranks: 1, cost: 2, req: ['g_shield'], row: 3, col: 1, grants: 'chains' },

  { id: 'c_kin', tree: 'commander', name: 'Kinship', desc: 'Echoes gain +10% damage and health per rank.', ranks: 3, cost: 1, req: [], row: 0, col: 1 },
  { id: 'c_glory', tree: 'commander', name: 'Shared Glory', desc: 'Echoes gain 60% more experience.', ranks: 1, cost: 1, req: ['c_kin'], row: 1, col: 0 },
  { id: 'c_recall', tree: 'commander', name: 'Swift Recall', desc: 'Recalled Echoes are untouchable for 2s and recover 25% health.', ranks: 1, cost: 1, req: ['c_kin'], row: 1, col: 2 },
  { id: 'c_banner', tree: 'commander', name: 'Second Banner', desc: '+1 active Echo slot.', ranks: 1, cost: 2, req: ['c_glory'], row: 2, col: 0 },
  { id: 'c_sync', tree: 'commander', name: 'Coordinated Strike', desc: 'Sync Strike cooldown −40% and damage +50%.', ranks: 1, cost: 2, req: ['c_recall'], row: 2, col: 2 },
  { id: 'c_warden', tree: 'commander', name: 'Warden\'s Mantle', desc: 'You may promote one Echo to Commander: it inspires your army and you (+15% damage nearby).', ranks: 1, cost: 2, req: ['c_banner', 'c_sync'], row: 3, col: 1 },

  { id: 'l_lamp', tree: 'lightbearer', name: 'Lamp of the Word', desc: '+10% ability power and +8 Covenant Energy per rank.', ranks: 3, cost: 1, req: [], row: 0, col: 1 },
  { id: 'l_waters', tree: 'lightbearer', name: 'Still Waters', desc: 'Learn the Still Waters ability.', ranks: 1, cost: 1, req: ['l_lamp'], row: 1, col: 0, grants: 'still_waters' },
  { id: 'l_radiance', tree: 'lightbearer', name: 'Radiance', desc: 'Covenant Energy regenerates 50% faster, and hits generate 30% more.', ranks: 1, cost: 1, req: ['l_lamp'], row: 1, col: 2 },
  { id: 'l_pillar', tree: 'lightbearer', name: 'Pillar of Fire', desc: 'Learn the Pillar of Fire ability.', ranks: 1, cost: 2, req: ['l_radiance'], row: 2, col: 2, grants: 'pillar_fire' },
  { id: 'l_well', tree: 'lightbearer', name: 'Wellspring', desc: 'Still Waters lasts 50% longer and also restores Covenant Energy.', ranks: 1, cost: 1, req: ['l_waters'], row: 2, col: 0 },
  { id: 'l_armor', tree: 'lightbearer', name: 'Armor of Light', desc: 'Learn the Armor of Light transformation.', ranks: 1, cost: 3, req: ['l_pillar', 'l_well'], row: 3, col: 1, grants: 'armor_light' },
];

// ---------- Echoes ----------

export type EchoClass = 'Sentinel' | 'Vanguard' | 'Ranger' | 'Herald' | 'Colossus' | 'Warden' | 'Sovereign';
export const ECHO_CLASS_INFO: Record<EchoClass, string> = {
  Sentinel: 'Heavy armored frontline defenders with shields.',
  Vanguard: 'Aggressive sword-wielding melee fighters.',
  Ranger: 'Long-range archers and projectile specialists.',
  Herald: 'Support units providing healing, blessings and buffs.',
  Colossus: 'Massive legendary creatures with devastating attacks.',
  Warden: 'Elite commanders that improve nearby units.',
  Sovereign: 'A raised king: blinding speed, aerial strikes, and command of everything beside it.',
};

export interface EchoSpecies {
  id: string;
  cls: EchoClass;
  stages: { name: string; title: string; desc: string; ability: string }[];
  baseHp: number;
  baseAtk: number;
  /** Level needed to evolve to stage index 1 and 2. */
  evolveLv: [number, number];
  evolveCost: [Record<string, number>, Record<string, number>];
}

export const ECHO_SPECIES: Record<string, EchoSpecies> = {
  locust: {
    id: 'locust',
    cls: 'Sovereign',
    baseHp: 300,
    baseAtk: 38,
    evolveLv: [8, 14],
    evolveCost: [{ covenant_fragment: 3, radiant_core: 1 }, { covenant_fragment: 6, radiant_core: 2 }],
    stages: [
      { name: 'The Locust King', title: 'Stage I', desc: 'The swarm\'s sovereign, his hunger turned to loyalty. Black chitin, scythe claws, wings that blur.', ability: 'King\'s Rend: blinding claw strings and diving strikes. Nearby Echoes fight harder.' },
      { name: 'The Restored', title: 'Stage II', desc: 'Gold seams run through his carapace where the Veil was burned away.', ability: 'Devouring Blur: he is behind his target before the string begins.' },
      { name: 'Wing of the Covenant', title: 'Stage III', desc: 'White-gold wings and a crown of light.', ability: 'Years Restored: his finishers loose crescents of light.' },
    ],
  },
  sentinel: {
    id: 'sentinel',
    cls: 'Sentinel',
    baseHp: 140,
    baseAtk: 14,
    evolveLv: [4, 7],
    evolveCost: [{ covenant_fragment: 2 }, { covenant_fragment: 3, radiant_core: 1 }],
    stages: [
      { name: 'Fallen Sentinel', title: 'Stage I', desc: 'Cracked armor bound with gold, a plain sword and a broken buckler.', ability: 'Guard: raises its shield to draw enemy attacks and block arrows aimed at you.' },
      { name: 'Covenant Guardian', title: 'Stage II', desc: 'Restored black-and-gold plate and a kite shield bearing the covenant sigil.', ability: 'Shield Bash: stuns foes. Nearby allies take 15% less damage.' },
      { name: 'Radiant Warden', title: 'Stage III', desc: 'Resplendent armor crowned with white flame, carrying a blazing tower shield.', ability: 'Wave of Light: its slam releases a rolling wave of light.' },
    ],
  },
  archer: {
    id: 'archer',
    cls: 'Ranger',
    baseHp: 90,
    baseAtk: 12,
    evolveLv: [4, 7],
    evolveCost: [{ covenant_fragment: 2 }, { covenant_fragment: 3, radiant_core: 1 }],
    stages: [
      { name: 'Hollow Archer', title: 'Stage I', desc: 'A hooded marksman whose bow is strung with white fire.', ability: 'Volley: fires arrows of light from range and keeps its distance.' },
      { name: 'Covenant Ranger', title: 'Stage II', desc: 'A gold-trimmed mantle and a glowing quiver.', ability: 'Piercing Shot: every third arrow pierces through all foes.' },
      { name: 'Dawnpiercer', title: 'Stage III', desc: 'A winged crest of light and a bow strung with sunrise.', ability: 'Rain of Dawn: calls a rain of light arrows on its target.' },
    ],
  },
  brute: {
    id: 'brute',
    cls: 'Colossus',
    baseHp: 260,
    baseAtk: 20,
    evolveLv: [5, 9],
    evolveCost: [{ covenant_fragment: 2, iron_scrap: 4 }, { covenant_fragment: 4, radiant_core: 1 }],
    stages: [
      { name: 'Ironbound Brute', title: 'Stage I', desc: 'A hulking frame in riveted iron, its maul bound with gold.', ability: 'Smash: an overhead blow that shakes the ground and breaks guards.' },
      { name: 'Covenant Breaker', title: 'Stage II', desc: 'Black-and-gold plate and a maul that hums with light.', ability: 'Earthbreaker: every smash sends a shockwave rolling along the ground.' },
      { name: 'Mountain of the Remnant', title: 'Stage III', desc: 'Crowned in white flame, slow as a hillside and as hard to move.', ability: 'Unmoved: draws every foe\'s eye and shrugs off half of every blow.' },
    ],
  },
  bulwark: {
    id: 'bulwark',
    cls: 'Sentinel',
    baseHp: 210,
    baseAtk: 12,
    evolveLv: [4, 8],
    evolveCost: [{ covenant_fragment: 2, sentinel_steel: 2 }, { covenant_fragment: 3, radiant_core: 1 }],
    stages: [
      { name: 'Shieldwall Bulwark', title: 'Stage I', desc: 'A tower shield bigger than a door, and the patience to hold it.', ability: 'Shieldwall: stands before you and stops arrows and bolts aimed your way.' },
      { name: 'Covenant Bulwark', title: 'Stage II', desc: 'The shield now bears the covenant sigil in gold.', ability: 'Shove: its shield bash staggers and stuns.' },
      { name: 'Wall of the Remnant', title: 'Stage III', desc: 'A blazing shield that turns back the dark.', ability: 'Bastion: allies near it take 20% less damage.' },
    ],
  },
  knight: {
    id: 'knight',
    cls: 'Vanguard',
    baseHp: 150,
    baseAtk: 17,
    evolveLv: [4, 8],
    evolveCost: [{ covenant_fragment: 2 }, { covenant_fragment: 3, radiant_core: 1 }],
    stages: [
      { name: 'Crimson Knight', title: 'Stage I', desc: 'A duelist of the tower guard, red cloak and quick blade.', ability: 'Riposte: strikes twice in quick succession.' },
      { name: 'Covenant Knight', title: 'Stage II', desc: 'Its crimson is trimmed with gold now.', ability: 'Lunge: closes distance with a driving thrust.' },
      { name: 'Knight of the Morning', title: 'Stage III', desc: 'A blade wreathed in dawn-fire.', ability: 'Three-step: its combos run three strikes deep.' },
    ],
  },
  marshal: {
    id: 'marshal',
    cls: 'Warden',
    baseHp: 300,
    baseAtk: 30,
    evolveLv: [6, 10],
    evolveCost: [{ covenant_fragment: 3, radiant_core: 1 }, { covenant_fragment: 5, radiant_core: 2 }],
    stages: [
      { name: 'The Crimson Marshal', title: 'Stage I', desc: 'The tower\'s greatest knight, his oath given anew. Red cloak, black steel, a sword that never wavers.', ability: 'Marshal\'s Edge: three-strike combos and a blinding lunge. Nearby Echoes fight harder.' },
      { name: 'Marshal of the Covenant', title: 'Stage II', desc: 'Black-and-gold plate under a crimson mantle.', ability: 'Shadowless Step: blinks behind his target before striking.' },
      { name: 'Oathkeeper', title: 'Stage III', desc: 'A crest of white flame and a blade that cuts the dark itself.', ability: 'Edge of Dawn: his finishers loose a crescent of light.' },
    ],
  },
};

export interface EchoInst {
  uid: string;
  species: string;
  level: number;
  xp: number;
  stage: number;
  hp: number;
  commander?: boolean;
  /** Seconds until it can be summoned again after falling. */
  downFor?: number;
  nickname?: string;
}

export const echoXpToNext = (lv: number) => Math.round(30 + lv * lv * 14);
/** XP for the next level. Past level 30 the climb is linear, so level 100 and beyond is within reach. */
export const xpToNext = (lv: number) => (lv <= 30 ? Math.round(30 * Math.pow(lv, 1.55) + 6) : Math.round(30 * Math.pow(30, 1.55) + 6) + (lv - 30) * 60);

// ---------- Lore: inscriptions found in the world ----------

export interface LoreEntry {
  id: string;
  title: string;
  ref: string;
  text: string;
  note: string;
}
export const LORE: Record<string, LoreEntry> = {
  eze371: {
    id: 'eze371', title: 'The Valley Stone', ref: 'Ezekiel 37:1–2 (KJV)',
    text: 'The hand of the LORD was upon me, and carried me out in the spirit of the LORD, and set me down in the midst of the valley which was full of bones, And caused me to pass by them round about: and, behold, there were very many in the open valley; and, lo, they were very dry.',
    note: 'A marker stone at the valley\'s edge, older than any kingdom on Mara\'s maps.',
  },
  eze373: {
    id: 'eze373', title: 'The Question', ref: 'Ezekiel 37:3 (KJV)',
    text: 'And he said unto me, Son of man, can these bones live? And I answered, O Lord GOD, thou knowest.',
    note: 'Cut into a giant\'s rib beside the road, at the height of a man\'s eyes.',
  },
  joel14: {
    id: 'joel14', title: 'The Gleaners\' Lament', ref: 'Joel 1:4 (KJV)',
    text: 'That which the palmerworm hath left hath the locust eaten; and that which the locust hath left hath the cankerworm eaten; and that which the cankerworm hath left hath the caterpillar eaten.',
    note: 'Scratched on a field marker where nothing grows any more.',
  },
  prov3027: {
    id: 'prov3027', title: 'The Wise Man\'s Mistake', ref: 'Proverbs 30:27 (KJV)',
    text: 'The locusts have no king, yet go they forth all of them by bands;',
    note: 'Daubed on the hive wall by a traveller. This swarm has a king.',
  },
  exo1014: {
    id: 'exo1014', title: 'The Plague Record', ref: 'Exodus 10:14 (KJV)',
    text: 'And the locusts went up over all the land of Egypt, and rested in all the coasts of Egypt: very grievous were they; before them there were no such locusts as they, neither after them shall be such.',
    note: 'Carved deep in the brood halls, as if someone wanted the swarm to read it.',
  },
  joel225: {
    id: 'joel225', title: 'The Promise in the Hive', ref: 'Joel 2:25 (KJV)',
    text: 'And I will restore to you the years that the locust hath eaten, the cankerworm, and the caterpillar, and the palmerworm, my great army which I sent among you.',
    note: 'Found at the threshold of the brood chamber. The words the Locust King heard as he rose a second time.',
  },
  eze3710: {
    id: 'eze3710', title: 'An Exceeding Great Army', ref: 'Ezekiel 37:10 (KJV)',
    text: 'So I prophesied as he commanded me, and the breath came into them, and they lived, and stood up upon their feet, an exceeding great army.',
    note: 'Mara read it aloud the night the valley was quiet again.',
  },
  gen111: {
    id: 'gen111', title: 'The Waystone at the Pass', ref: 'Genesis 11:1–2 (KJV)',
    text: 'And the whole earth was of one language, and of one speech. And it came to pass, as they journeyed from the east, that they found a plain in the land of Shinar; and they dwelt there.',
    note: 'An old boundary stone where the mountain road comes down onto the plain.',
  },
  gen113: {
    id: 'gen113', title: 'The Brickmakers\' Tally', ref: 'Genesis 11:3 (KJV)',
    text: 'And they said one to another, Go to, let us make brick, and burn them throughly. And they had brick for stone, and slime had they for morter.',
    note: 'Pressed into a fired brick, beside thousands of tally marks.',
  },
  gen114: {
    id: 'gen114', title: 'The Builders\' Oath', ref: 'Genesis 11:4 (KJV)',
    text: 'And they said, Go to, let us build us a city and a tower, whose top may reach unto heaven; and let us make us a name, lest we be scattered abroad upon the face of the whole earth.',
    note: 'Painted in pitch across the side of the great kiln. Someone has scratched out the word "name" and written it again, larger.',
  },
  gen116: {
    id: 'gen116', title: 'The Gate Lintel', ref: 'Genesis 11:6 (KJV)',
    text: 'And the LORD said, Behold, the people is one, and they have all one language; and this they begin to do: and now nothing will be restrained from them, which they have imagined to do.',
    note: 'Cut into a fallen lintel stone, half buried before the Tower Gate.',
  },
  gen117: {
    id: 'gen117', title: 'The Hall of Tongues', ref: 'Genesis 11:7 (KJV)',
    text: 'Go to, let us go down, and there confound their language, that they may not understand one another\'s speech.',
    note: 'The only words in the hall still written in a script you can read. Every other wall is covered in letters that slide away from the eye.',
  },
  gen119: {
    id: 'gen119', title: 'The Guard\'s Prayer', ref: 'Genesis 11:9 (KJV)',
    text: 'Therefore is the name of it called Babel; because the LORD did there confound the language of all the earth: and from thence did the LORD scatter them abroad upon the face of all the earth.',
    note: 'Scratched inside a guardsman\'s shield, where only its bearer would see it.',
  },
  prov1618: {
    id: 'prov1618', title: 'The Overseer\'s Ledger', ref: 'Proverbs 16:18 (KJV)',
    text: 'Pride goeth before destruction, and an haughty spirit before a fall.',
    note: 'The last line in a ledger of bricks and quotas, in a different hand from the rest.',
  },
  prov1810: {
    id: 'prov1810', title: 'The Stair Inscription', ref: 'Proverbs 18:10 (KJV)',
    text: 'The name of the LORD is a strong tower: the righteous runneth into it, and is safe.',
    note: 'Carved low on the first stair, where the builders would not see it.',
  },
  tim47: {
    id: 'tim47', title: 'The Marshal\'s Oath', ref: '2 Timothy 4:7 (KJV)',
    text: 'I have fought a good fight, I have finished my course, I have kept the faith:',
    note: 'Engraved on the arm of the empty throne. The Marshal never sat in it.',
  },
  ruth116: {
    id: 'ruth116', title: 'An Oath Renewed', ref: 'Ruth 1:16 (KJV)',
    text: 'And Ruth said, Intreat me not to leave thee, or to return from following after thee: for whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God:',
    note: 'The words the Crimson Marshal spoke, kneeling, when he took up his sword again.',
  },
  isa211: {
    id: 'isa211', title: 'The Fallen Tower', ref: 'Isaiah 2:11 (KJV)',
    text: 'The lofty looks of man shall be humbled, and the haughtiness of men shall be bowed down, and the LORD alone shall be exalted in that day.',
    note: 'Mara found it in her father\'s notes on Shinar, under a drawing of a tower that has fallen before.',
  },
  eph612: {
    id: 'eph612', title: 'The Chamber Inscription', ref: 'Ephesians 6:12 (KJV)',
    text: 'For we wrestle not against flesh and blood, but against principalities, against powers, against the rulers of the darkness of this world, against spiritual wickedness in high places.',
    note: 'Carved above the broken relic. The husks were once people; the true enemy was never them.',
  },
  eph610: {
    id: 'eph610', title: 'The Cistern Stone', ref: 'Ephesians 6:10–11 (KJV)',
    text: 'Finally, my brethren, be strong in the Lord, and in the power of his might. Put on the whole armour of God, that ye may be able to stand against the wiles of the devil.',
    note: 'Scratched into a cistern pillar by someone who hid here during the fall of Hearthward.',
  },
  cor104: {
    id: 'cor104', title: 'The Archive Seal', ref: '2 Corinthians 10:4 (KJV)',
    text: '(For the weapons of our warfare are not carnal, but mighty through God to the pulling down of strong holds;)',
    note: 'Pressed into the wax of an archive door. Mara says her teachers copied this verse before every lesson.',
  },
  isa4031: {
    id: 'isa4031', title: 'The Plume Shrine', ref: 'Isaiah 40:31 (KJV)',
    text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
    note: 'Above a niche holding a single white plume, untouched by the ash.',
  },
  josh620: {
    id: 'josh620', title: 'The Horn Shrine', ref: 'Joshua 6:20 (KJV)',
    text: 'So the people shouted when the priests blew with the trumpets: and it came to pass, when the people heard the sound of the trumpet, and the people shouted with a great shout, that the wall fell down flat, so that the people went up into the city, every man straight before him, and they took the city.',
    note: 'Walls are not always stone. Mara believes the old wardens told this story before every siege.',
  },
  rom1221: {
    id: 'rom1221', title: 'The Gate Lintel', ref: 'Romans 12:21 (KJV)',
    text: 'Be not overcome of evil, but overcome evil with good.',
    note: 'Cut into the lintel of Hearthward\'s gate, worn smooth by hands touching it on the way out.',
  },
  ps11545: {
    id: 'ps11545', title: 'The Idol\'s Plinth', ref: 'Psalm 115:4–5 (KJV)',
    text: 'Their idols are silver and gold, the work of men\'s hands. They have mouths, but they speak not: eyes have they, but they see not:',
    note: 'Half-buried at the foot of the Gilded Idol, as if the old kingdom tried to hide its own warning.',
  },
  judg615: {
    id: 'judg615', title: 'The Watchman\'s Psalter', ref: 'Judges 6:15 (KJV)',
    text: 'And he said unto him, Oh my Lord, wherewith shall I save Israel? behold, my family is poor in Manasseh, and I am the least in my father\'s house.',
    note: 'A page Tobiah keeps folded in his boot. "If the least could be sent," he says, "so can we."',
  },
  rev1211: {
    id: 'rev1211', title: 'The Martyrs\' Wall', ref: 'Revelation 12:11 (KJV)',
    text: 'And they overcame him by the blood of the Lamb, and by the word of their testimony; and they loved not their lives unto the death.',
    note: 'Names surround it — the wardens of Hearthward who held the gate during the first night of the Veil.',
  },
  mark1043: {
    id: 'mark1043', title: 'The Servant\'s Word', ref: 'Mark 10:43–44 (KJV)',
    text: 'But so shall it not be among you: but whosoever will be great among you, shall be your minister: And whosoever of you will be the chiefest, shall be servant of all.',
    note: 'Azriel recited this when he gave you the Signet. "Remember who the strength is for."',
  },
  eze374: {
    id: 'eze374', title: 'The Valley Fragment', ref: 'Ezekiel 37:4 (KJV)',
    text: 'Again he said unto me, Prophesy upon these bones, and say unto them, O ye dry bones, hear the word of the LORD.',
    note: 'Mara deciphered it from the relic\'s edge. It points east, to the Valley of Bones.',
  },
};
