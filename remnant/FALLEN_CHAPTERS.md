# Fallen Crown campaign release

Chapter VI uses the existing authored **Prince of Persia** campaign from the repository’s `claude/remnant-chapter6` branch, integrated with the latest released combat, progression, audio and mobile systems. This replaces the earlier unpublished Winter concept. Its eight connected areas, Storm Prince and Prince of Persia encounters, quests, scripture cards, gear and ending are now wired into chapter selection and the Chapter V ending.

**VII — The Crown of the Hunt**, recommended level 80+, continues from VI’s ending or Chapters. Six areas connect Thawgate, Riftwood, the Fang Pits, the optional Unhunted Grove, Clawscar Ridge and Varkhos’s throne. Defeat the Fang Warden and Redmaw Alpha to open the boundary. Rescue Barak and recover the grove record for Mara. Varkhos uses parryable claws, charges, marked pounces and two Hunt Shades that strengthen his attacks. His final Great Hunt has three marked pounces followed by a long recovery. The final rewards are Fangbreak and Oath of the Free Pack.

**VIII — The Crown of Pestilence**, recommended level 100+, continues from VII’s ending. Six areas connect Lantern Quarantine, Greenfall Marsh, the Sporeworks, the optional Silent Infirmary, the Pestilent Causeway and Morvane’s throne. Clear the guards and cleanse two Spore Hearts. Rescue Ezra and bring the infirmary warning to Mara. Morvane uses venom needles, delayed spore zones and destructible Brood Cocoons that heal her. Her final Great Miasma has a clearly marked gold beacon protecting the player from three pulses; the veil then opens for a counterattack. The final rewards are Thorn of Dawn and Covenant of Breath.

Both new rulers are original fictional Fallen Angels inspired by broad monarch archetypes, not scripture or copies of franchise characters. Elior remains human. Echoes remain cleansed battle-imprints; Fallen Angel souls are not absorbed. Cinders is a future story tease, not a playable ninth chapter.

Progress uses optional flags, existing quest records, opened chests and ordinary inventory entries. Objective changes and final rewards save immediately. Chapter VI also recovers interrupted boss endings and grants its boss trophies directly once, so leaving before pickup cannot lose them. Final rewards are granted once before awaiting ending dialogue. VII and VIII add Varkhos and Morvane to the Boss Gauntlet after their campaign victories; earlier saves retain the six-boss rotation. Gauntlet victories bypass campaign callbacks. The Survival mode, wave scaling, random loot and Spotify audio mixing are preserved.

**XI — The Gods of the Nations**, recommended level 58+, continues from X's ending or Chapters. Its theme is Psalm 96:5 (KJV): "For all the gods of the nations are idols: but the LORD made the heavens." The gods are old powers that took the names men gave them, not gods; Elior withstands them and the victory is not his to take. Six places: the Camp below Carmel, the Groves of Baal, the House of Dagon, the Valley of Hinnom (optional; Micaiah the prophet is rescued there), the Heights of Baal and the Seat of the Gods. It is meant to overmatch the player:

- **More and stronger foes:** each route room holds a second rank (Undying, bulwark, fire-priest, knight) and two elites (`horde()` in `fallenChapters.ts`), ten foes against Chapter X's three or four, and the chapter's curve row is a third harder and half again as deadly as X's.
- **Two altars** (the Altar of Baal in the Groves, the Altar of Dagon in its House) seal the throne; their guards must fall before each is cast down.
- **The boss** (`game/bosses11.ts`, `NationGods`) is one encounter in three gods, each larger and stronger than Elior, and each calling servants (two at a time, three under Baal): Dagon (trident combos and lunges; the tide, a wave from each wall along the floor, twice in the later phases), Molech (a burning blade; leaping slams that send flame both ways; the furnace, fire marks under Elior that erupt), then Baal (storm-spear combos; a step behind Elior; crescents; chained lightning that follows him). Each god falls on its face before the next comes down (1 Samuel 5:3). When Baal cries out "there was no voice, nor any that answered" (1 Kings 18:26), and the fire of the LORD falls (1 Kings 18:38).
- **Rewards:** Idolbreaker (a holy greatsword) and the Oath of Carmel; Micaiah's Scroll from Mara; Gauntlets of the High Places and Ashlar Mail in the caches; the Psalm of the High Places in the Phaser build.

The art reuses Chapter X's temple set with ember weather; dedicated sprites and backgrounds for the gods are a follow-up.

## Art

Built-in image-generation mode, transparent background, no references. Assets are copied into the repository and consumed by `src/render/fallenArt.ts`, using authored crops and pivots.

- `src/assets/varkhos-hunt-atlas.png`: original antler-crowned beast king, dark brown leonine humanoid, rust-red mane, charcoal fur and torn feather wings, bronze armor and clawed gauntlets. Eight separate side-view poses: idle, windup, lunge, recovery, transformed roar, pack call, stagger, kneel. Four columns × two rows, consistent scale, full bodies, transparent alpha, pixel art, no text or scenery.
- `src/assets/morvane-plague-atlas.png`: original female Fallen Angel insect queen, dark umber skin, obsidian chitin, emerald hair, thorned jade crown, translucent green wings and hooked mantis forearms. Four separate side-view poses: idle, venom windup, swarm cast, defeated kneel. Two columns × two rows, consistent scale, full bodies, transparent alpha, pixel art, no text or scenery.

Parallax and terrain are cached. Adds are capped at two and do not generate farmable rewards. Spore zones have bounded lifetimes. New effects use the existing rendering helpers without shadowBlur. Both bosses have fixed chapter/difficulty/NG+ health and enforce phase transitions even for extremely large hits or damage-over-time.

## Verification

`npm run build`; the full existing unit/controller and browser checks; `node --test scripts/fallen-chapters.test.mjs`; `node scripts/fallen-campaign.mjs`.

The campaign browser check covers the actual VI → VII → VIII ending buttons, locked chapter entries, objective progression, guarded hearts and rescues, unique optional/final rewards, phase gates, parries, pack buffs, cocoon healing, spore tells, miasma shelter and recovery, gauntlet isolation, and touch entry. Screenshots are saved under `qa/` and included in CI artifacts.
