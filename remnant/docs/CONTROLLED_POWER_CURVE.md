# Controlled power curve

The previous release multiplied equipment attack by level, Strength, passive ranks, Sovereign growth, critical damage and ability/Echo bonuses. A level-150 wave-30 blade could deliver millions of damage before temporary buffs. Waves also paid each enemy a large fraction of a level, granting around five levels at wave 30 and over ten later. Progression outpaced the encounters.

This adjustment keeps every owned level, stat allocation, passive rank, item instance, item Power, affix, upgrade, milestone and Echo. It changes the combat formulas and future wave XP. No migration rewrites or refunds are needed.

- Equipment attack gains 3% per level through level 100, then 1.05% per level. Strength adds 1.5 base attack above 5 and a 5% bonus per effective point; effective points above 60 count at 35% for the multiplier.
- Honed Edge, Kinship and Lamp of the Word gain 10% per rank through rank 10, 5% through 25 and 2.5% thereafter. Every rank remains useful. Lamp/Kinship add to other ability/Echo bonuses rather than multiplying them.
- Sovereign damage is ×1.2 at 100, ×1.4 at 150 and ×1.55 at 300. Critical chance caps at 75%; critical damage and large equipment ability/Echo bonuses have gentler growth. Echoes inherit 12% of hero attack; their own levels and evolution still matter.
- Gear and shadow life steal share a 4%-maximum-health budget per second. Blocked hits and overkill do not grant free healing. Healing spells, regeneration and support-role abilities remain separate.
- Enemy health still follows the wave, independent of hero level and equipment. Wave 30 damage is unchanged; after 30 its damage multiplier gains 4% per extra wave. Enemy strength does not react to equipping an upgrade.
- Normal wave XP budgets rise from 0.365 levels at wave 1 to 0.8 at wave 30 and 1.35 at wave 67+. The budget is captured at wave start and shared across the full roster; Champions get four shares. XP gear and Double blessings still work.
- Random Legendary/Covenant rewards still arrive after every Survival wave, weapons every fifth wave, plus the existing milestone rewards. Item Power and upgrade comparisons are unchanged.

Reference model: level 150; 447 earned attribute points allocated across the six stats; Honed Edge 25, Keen Eye 5, Kinship 25, Lamp 25, Iron Skin 10 and Regeneration 5. No mastery, run blessings, Mantle or Commander aura. Values below are raw noncritical first-strike power, before enemy guards and stagger bonuses. These are calibration examples, not promises for every build.

| Weapon | Basic strike | Ability base before individual move multiplier | Level-1 Sentinel attack |
| --- | ---: | ---: | ---: |
| Common Militia Sword | 4,228 | 6,263 | 1,207 |
| Legendary Veilreaver | 10,573 | 15,662 | 2,059 |
| Legendary wave-30 Veilblade, Power 550 | 43,206 | 64,003 | 6,441 |

At a fixed build, ordinary wave-30 foes should fall quickly, while a Champion gets more time to act. Strong gear can still crush earlier waves. The same wave-30 loadout must not erase wave-100 enemies; the production-browser test compares actual hit damage and incoming threat at waves 30, 60 and 100. Unit checks also cover full seven-slot wave-30 equipment at +0/+10, diminishing gains, migration preservation and the XP budget. Existing wall safety, combo, Echo, save, audio and mobile checks remain release gates.
