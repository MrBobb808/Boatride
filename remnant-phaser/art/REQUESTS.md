# Image requests

Generate these in order and store them as `README.md` describes. Each request
gives a spec and the subject. Every prompt is the **Shared style** paragraph
below followed by the request's own lines. Record the exact prompt you used in
`manifest.json`.

**Shared style (prefix to every prompt):**
> Premium 2D pixel art for "Remnant: Ascension", a dark biblical-fantasy
> side-scrolling action RPG. Crisp square pixels, confident dark outlines, rich
> but limited coherent palette, dramatic rim light, readable when reduced to a
> 48–60 px tall character. Strict side view facing RIGHT unless stated. Exact
> equal grid cells as specified, generous transparent margins, nothing crossing
> a cell edge. No text, labels, grid lines, borders, floor shadows, scenery or
> watermark. Original designs only: no real-world logos or franchise characters.

Priority: **P1** is needed first (combat, abilities, archer), **P2** next
(bosses and foes), **P3** last (environments and UI).

---

## Characters (P1) → `incoming/characters/`

The live heroes are cut-out rigs: one painted image per body part, rotated at
the joints (see `../src/assets/FIGHTER_ANIMATION.md`). Every parts sheet uses
the **same 10-part layout as rows 1–2 of `fighter-parts-v1.png`**:

| Grid | Contents |
|---|---|
| 5 columns × 2 rows, 256 px cells | **Row 1:** (1) head and short neck, facing right; (2) torso from shoulders to belt only; (3) hip belt and coat-tail or skirt only; (4) one upper arm, shoulder to elbow, pointing straight down; (5) one forearm ending in a closed gripping hand, pointing down. |
| | **Row 2:** (1) one thigh, hip to knee, pointing down; (2) one lower leg with its boot, toe pointing right; (3) cape or cloak only, attached at top right and trailing down-left; (4) scarf, or for Tirzah her braid, attached at top right and draping down-left; (5) the weapon alone, vertical: sword tip up, or bow with its string on the left. |

Paint hidden overlaps fully, so joints rotate without holes.

| ID | Request |
|---|---|
| C01 | **Elior parts v2:** a higher-detail repaint of Elior's parts in the layout above, with the same identity and colours (see `README.md` style rule). Gold coat edging and leather texture should read at small size. |
| C02 | **Tirzah parts v2:** the same for Tirzah. Teal/charcoal tunic with gold trim, gold bracers, a dark braid as part 9 and the ivory-and-gold recurve bow as part 10. |
| C03 | **Elior, Shadow Mantle parts:** Elior transformed. A black cloak edged in blue-violet light; violet-tinted armour that keeps its gold fittings; a sword with a violet edge glow. Face and skin unchanged (he stays human). |
| C04 | **Tirzah, Wings of the Morning parts:** Tirzah's new transformation. Dawn-gold and white with pale teal; light plumage on the cloak (part 8); a radiant bow strung with light (part 10); the braid glowing at its tips. Face and skin unchanged (she stays human). |
| C05 | **Dawn wings:** 4 columns × 2 rows, 256 px. A pair of luminous feather-of-light wings attached at the shoulder, top right. Poses: folded, half-open, fully spread, downbeat; then the same four with a stronger glow. No body. |
| C06 | **Arrows:** 8 columns × 2 rows, 128 px, each arrow horizontal pointing right. **Row 1:** plain, charged piercing, fire, frost, storm, holy, shadow, dawn. **Row 2:** the same arrows embedded (shaft half-hidden, pointing down-right), for arrows that stick in foes. |
| C07 | **Reference boards (design reference only, not shipped):** one image per hero, 2048×1024, transparent. Front, side and back turnarounds, plus the transformed form beside the normal form. Elior first (`-elior`), then Tirzah (`-tirzah`). |

## Effects (P1) → `incoming/vfx/`

Effects sheets are **bright shapes on a transparent background**, built to be
added onto the scene as light: no black background and no baked character.
Each row is one effect, played left to right.

| ID | Grid | Request |
|---|---|---|
| V01 | 6×4, 256 px | **Sword slash arcs:** light cut, heavy cut, rising launcher, full 360° spin. White-gold core with a warm edge, tapering trail. |
| V02 | 6×4, 192 px | **Impacts:** normal hit spark, critical hit burst, guard-break shatter, perfect-parry flash (a white ring with sparks). |
| V03 | 8×6, 256 px | **Covenant abilities I** (one row each): Sword of the Word (a golden arc projectile in flight); Trumpet of Victory (an expanding sound ring with gold motes); Shield of Faith (a hexagonal light barrier forming, holding, breaking); Lion's Courage (an amber aura flare with a lion-mane silhouette of light); Still Waters (a pool of pale-blue light rippling); Pillar of Fire (a white-gold column erupting and roaring). |
| V04 | 8×6, 256 px | **Covenant abilities II:** Chains Broken (bright chains shattering outward); Armor of Light (plates of light assembling); Chain Snare (a pale chain lashing forward and wrapping); Rift Assault (a violet rift tear opening and closing); Mending Light (green-gold motes spiralling up); Winter Halo (a ring of frost light with ice crystals). |
| V05 | 8×6, 256 px | **Archer effects:** dawn blink-out (a light burst with feathers); dawn blink-in; backshot (a point-blank arrow burst with feathers); hunter's mark sigil over a target (looping); arrow rain falling from above; bow charge glow growing on the string. |
| V06 | 8×4, 256 px | **Transformations:** rows 1–2, Shadow Mantle forming (smoke wraps in, then a violet burst); rows 3–4, Wings of the Morning forming (light gathers, then the wings unfold in a dawn flash). |
| V07 | 8×6, 128 px | **Status overlays** (looping): burning, frozen, shocked, bleeding, holy-marked, shadow-bound. |
| V08 | 8×4, 128 px | **World effects:** dust puff, water splash, lava ember burst, wood-splinter burst. |

## Retries after drop P1 (do these before P2)

Claude reviewed drop P1 in game (see each entry's `review` in
`manifest.json`). V01 and V02 now ship. Redo these five, saving each as
`<id>-retry.png` beside the original. Exact canvas size no longer matters:
the generator rarely honours it, and Claude cuts any **equal** grid. What
still matters is the grid count, equal cells, nothing crossing a cell edge,
and no lines drawn.

| ID | What went wrong | Add to the original prompt |
|---|---|---|
| C01 | At 56 px tall, the charcoal coat and fine gold trim turned to noise and the face lost definition. Part 9 came out as a cape flap, not a scarf. | "Design for a 56 px tall sprite: big, flat colour blocks with two or three tones each, thick gold edging (not filigree), a high-contrast face with a clear white beard and a bright eye highlight. Keep Elior's current gold-and-navy armour plates from `fighter-parts-v1.png` and only refine them. Part 9 is a short burgundy scarf knot that wraps the neck, about as wide as the neck, not a trailing cloth." |
| C03 | The cloak and scarf stayed burgundy. | "Every cloth part (cape, scarf, coat-tail) is black with a thin blue-violet light edge; no burgundy or red anywhere. Armour plates are violet-tinted steel and keep their gold fittings. The skin, hair and beard are unchanged." |
| C05 | The wings faced the viewer, and frames crossed cell edges. | "Strict side view, as seen from the character's right side: one near wing in front, the far wing a darker silhouette behind it. The wing root is at the top-right of each cell, where the shoulder would be. Each pose fits inside its cell with 16 px clear on every side." |
| V04 | Only the Chain Snare row is unusable (the other five ship): its tip launches left while the chain wraps on the right. Redo that one row. | "Every effect travels or points to the RIGHT. Chain Snare starts at the left of its cells and lashes rightward, wrapping on the right." |
| V08 | Grid lines are baked into the image. | "Absolutely no lines, borders or frames between cells; the space between effects is fully transparent." |

## Bosses (P2) → `incoming/bosses/`

Each boss is a 4×4 sheet, 384 px cells, feet baseline at y=360, facing right:
- **Row 1:** idle A, idle B, move A, move B.
- **Row 2:** attack-1 wind-up, attack-1 strike, attack-2 wind-up, attack-2 strike.
- **Row 3:** special wind-up, special release, enraged idle, enraged roar.
- **Row 4:** hurt, stagger or kneel, death 1, death 2.

Keep the silhouette identical across cells.

| ID | Boss |
|---|---|
| B01 | **The Gilded Idol:** a towering hollow golden idol on a plinth, cracked gold over dark rot, burning eyes; it slams and sweeps. |
| B02 | **The Gatekeeper:** a draconic beast chained to the tower gate. Attacks: bite, fire breath, tail sweep, pounce. |
| B03 | **The Crimson Marshal:** a towering human general in crimson-lacquered armour with a long blade. Attacks: overhead, lunge, blink, edge wave. |
| B04 | **The Locust King:** a crowned insectile king with a scorpion tail. Attacks: claws, acid, screech, dive, swarm call. |
| B05 | **The Image of Gold** (Daniel 3): a colossal golden statue with a stern face; it smites and scatters fire. |
| B06 | **The Weigher** (Daniel 5): a robed judge with great bronze scales and a disembodied writing hand of light. |
| B07 | **The Prince of the Power of the Air:** a storm-wreathed fallen angel, torn wings, lightning. |
| B08 | **The Prince of the Kingdom of Persia:** a regal fallen angel prince in Persian armour, dark gold and onyx. |
| B09 | **The Prince of Grecia** (Daniel 8): a he-goat colossus with one great horn. **Row 3** shows the horn broken into four horns. |
| B10 | **Varkhos, Morvane, Azkar extra frames:** one 4×2 sheet each (`-varkhos`, `-morvane`, `-azkar`), matching their existing atlases in `remnant/src/assets/`. **Row 1:** two new attack wind-ups and their strikes. **Row 2:** stagger, kneel, death 1, death 2. |

## Foes (P2) → `incoming/foes/`

Each foe sheet is 8 columns, 128 px cells, baseline y=116, facing right. The
columns are: idle A, idle B, walk A, walk B, wind-up, attack, hurt, death.
There is one row per foe.

| ID | Rows |
|---|---|
| F01 | **Ashen:** husk (a cindered corpse-thing), sentinel (a shielded cultist), archer, knight. |
| F02 | **Shinar:** brute, bulwark (a tower shield), fire-priest, scribe of the Veil. |
| F03 | **Beasts:** hound, Brazen Lion, locust drone, locust soldier. |
| F04 | **Veil and princes:** Vessel Wraith, Undying Host, Fallen Gale (a lightning flier), wisp. |
| F05 | **Fallen Crowns:** Antlered Stalker, Swarm Carrier, Slag Golem, eel (swimming; frames read left to right as a swim cycle). |

## Environments (P3) → `incoming/environments/`

Parallax sets: three layers per place, each 2048×640 and seamless left to
right:
- `-far`: opaque sky and horizon;
- `-mid`: transparent silhouettes of buildings or terrain;
- `-near`: transparent foreground foliage or rubble, sparse so play stays
  readable.

Dark-fantasy mood, with atmosphere carried by light and colour.

| ID | Place |
|---|---|
| E01 | The Ashen Village (Chapter I): burnt timber houses, ash fall, dusk. |
| E02 | The Tower of Shinar (II): a vast brick ziggurat tower, storm sky. |
| E03 | The Valley of Bones (III): a bleached valley, bone fields, pale moon. |
| E04 | The Plain of Dura (IV): a desert plain with the colossal golden image far off. |
| E05 | Babylon, the banquet and palace (V): lapis walls, lamps, the hanging gardens. |
| E06 | Shushan and the Ulai marsh (VI): a Persian citadel, reeds, storm ziggurat. |
| E07 | The Crown of the Hunt (VII): an antler-strewn forest, moonlit grove. |
| E08 | The Crown of Pestilence (VIII): a sick marsh, lantern quarantine, spores. |
| E09 | The Crown of Cinders (IX): foundries, slag rivers, chains, bellows. |
| E10 | The Chittim coast (X): storm cliffs, a shattered colonnade, a ruined harbour. |
| E11 | The Sunken Temple and Drowned Library (X): underwater, light shafts, shelves. |
| E12 | Remnant's Rest: a hopeful tent camp at dusk, a cypress, a campfire glow. |

## Animation and lighting (P1, the owner's 30 October choices) → `incoming/characters/`, `incoming/lighting/`

Placeholders made in code ship until these arrive.

| ID | Request |
|---|---|
| A01 | **Elior, extra in-betweens.** Same parts style as `fighter-parts-v1.png`. Cape and hair as separate soft parts in three sway poses each (rest, swept back, lifted), so they can trail his motion. |
| A02 | **Tirzah, extra in-betweens.** Her hood tail and quiver strap as separate parts in three sway poses; the bowstring hand in three draw positions; her dagger (a short leaf blade) as its own part, held point forward. |
| A03 | **Hit reactions, both heroes.** 4×2 sheet, 192 px cells: light flinch, heavy stagger, knockback, landing from knockback, for Elior (row 1) and Tirzah (row 2), whole-body poses facing right. |
| A04 | **Partner moments.** 4×1 sheet, 256 px cells: Elior and Tirzah striking a foe together (joint finisher), Tirzah pulling Elior up, Elior pulling Tirzah up, and the two back to back. |
| L01 | **Normal maps, heroes.** Normal maps (tangent space, blue-purple) matching `fighter-parts-v1.png` part for part, so the heroes catch real light. |
| L02 | **Light cookies.** 4×1, 256 px cells, white on black, soft: torch flicker, lamp glow, window light shafts, a ring of light for spells. |
| L03 | **Weather sprites.** 8×4, 64 px cells, transparent: ash flakes, embers, raindrops and splashes, fog wisps (wide), dust motes, falling leaves. |

## Icons and UI (P3) → `incoming/icons/`, `incoming/ui/`

Icon sheets are 64 px cells on a transparent background, with a centred
subject and a soft rim light.

| ID | Request |
|---|---|
| I01 | **Weapons,** 8×4. Rows: blade, spear, greatsword, bow. Columns: common to legendary (cleaner metal, then gold, then glowing runes). |
| I02 | **Armour and relics,** 8×4: helm, armour, gauntlets, boots, ring, relic, amulet, quiver; four rarity rows. |
| I03 | **Materials and salvage,** 8×4: iron scrap, steel ingot, bronze, leather strap, linen, gold thread, cedar wood, relic shard, ember core, frost crystal, storm glass, holy oil, shadow silk, lion's mane, locust chitin, slag iron, eel scale, feather of dawn, and similar crafting goods. |
| I04 | **Ability icons,** 6×3, 96 px: the twelve Covenant abilities, then the six archer abilities from `../POLISH_PLAN.md` §4. |
| I05 | **Shop backdrops** (`incoming/ui/`), two opaque illustrations at 1280×720: Ilan's market stall (lamps, crates, cloth awning) and Dov's forge (anvil, bellows, glowing hearth). |
