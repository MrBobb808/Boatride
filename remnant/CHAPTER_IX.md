# Chapter IX — The Crown of Cinders

Original fiction continuing Chapter VIII. Completing VIII unlocks IX in Chapters and adds a Begin Chapter IX button to its ending. Existing save slots and progress remain compatible; all new progress uses optional flags.

## Journey

Ashwatch Refuge → Slag Procession → Bellows Foundry → Ember Aqueduct → Throne of Cinders. The Last Smithy branches above the foundry. Clear guards and release both pressure wheels to open the throne boundary. Rescue Talia and recover The Testament of Free Hands; bring it to Mara for the Lantern of Free Hands. Three hidden caches contain Quencher Grips, Ashwatch Plate and materials.

## Azkar

A distinct original Fallen Angel smith-king. Fixed campaign base HP 1,020,000, then existing difficulty/NG+ multipliers; recommended level 120. Phase gates at 67% and 32% apply to ordinary damage and DOT, preserving mechanics for strong builds.

- I: parryable hammer, delayed vertical cracks, low fire waves that can be jumped.
- II: tempered armor reduces damage to 55%; parrying a hammer or breaking poise shatters it for a 3.2-second punish window. Non-parry builds can still deal damage.
- III: three sets of clearly marked eruptions, then a 3.1-second recovery. Each crack has a 1.7-second combat-clock tell, reachable by walking at maximum Merciless/gauntlet tempo. Ward blocks targeting and damage only during the bellows sequence.

Boss, waves and cracks use the same combat clock. Owned effects clear on transitions, stagger and defeat. Victory grants unique Cinderbreak and Oath of the Unburnt once; progress and rewards save before ending dialogue. Completing IX adds Azkar to the boss gauntlet, with campaign callbacks/rewards isolated. Legacy six-, seven- and eight-boss rosters remain available to earlier saves. Fallen souls are never absorbed as Echoes.

## Art and audio

Asset: `remnant/src/assets/azkar-cinder-atlas.png` (1254×1254 RGBA), consumed by `render/fallenArt.ts`. Native cached foundry skyline, furnace stacks, pipes, pressure gate and throne use the new cinders palette. New exploration and boss synth tracks preserve the existing background-audio policy.

Mode: built-in image generation, transparent background. Final prompt:

> Use case: stylized-concept. Asset type: transparent 2D side-view game boss sprite atlas for Remnant Ascension. Original Fallen Angel ruler Azkar, Crown of Cinders: towering armored blacksmith king, obsidian plate with molten amber seams, broken furnace crown, ash-white mane, ragged scorched wing-like mantle, enormous two-handed furnace hammer. Refined illustrated dark fantasy sprite rendering, bold readable silhouette for 120px game height, warm copper and charcoal palette. Square sheet with exactly FOUR separate poses in an evenly spaced 2 by 2 grid of equal square cells: top left idle standing facing right, top right lifting hammer overhead windup facing right, bottom left hammer slam/fiery casting facing right, bottom right defeated kneeling facing right. Every pose full body including weapon, centered horizontally within own cell with feet baseline at 92 percent of cell height; keep at least 8 percent empty padding on all sides, no crossing cell boundaries. Same character design and scale in all cells, orthographic side view, no perspective floor. Truly transparent background including cell gaps. No text, borders, scenery, logos or watermark. Original character, no existing franchise characters.

The generated poses use individually fitted crops to keep body and feet aligned when the hammer extends.

## Verification

Production type check/build and controller checks; pure room tests cover all 26 VI–IX rooms, reciprocal doors, safe spawns, map separation, reward references and guarded wheel configuration. The production browser campaign exercises VI→VII→VIII→IX ending buttons, pressure wheels, survivor/lore rewards, all new room renderers/enemy stats, fixed HP, DOT phase gates, armor/parry damage, jumpable waves, three eruptions, unique victory loot, gauntlet isolation and phone chapter entry.
