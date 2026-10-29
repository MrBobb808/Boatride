# Polish plan: combat, sound, abilities, the archer and the economy

The owner's brief (29 October 2026): go back over the parts of the game that
aren't detailed enough. The scope is:
- combat, sound and gameplay mechanics, all more polished;
- better effects and animations for every ability;
- for the archer, her own transformation and abilities, and more ways to make
  her combat unique. In her transformation she shoots an arrow, teleports
  behind the enemy it hits, and strikes its back with a separate arrow;
- selling unlocked items for money **and** crafting materials;
- a store with items worth buying.

**Claude Code does this work.** ChatGPT supplies art into `art/` (see
`art/README.md` and `art/REQUESTS.md`), and this plan uses it as it arrives.

> **Prompt for Claude:** Read `../AGENTS.md`, `PORTING.md`, this plan and
> `art/README.md`. Take the first unchecked item in §9, implement it to its
> "done when", and keep every rule in §1. Use delivered art from
> `art/manifest.json` where the item names it. Where art hasn't arrived yet,
> build the effect procedurally in Phaser, so the art can replace it later
> without code changes. Open one draft PR per item.

---

## 1. Rules for every item

- **Saves:**
  - New save fields are optional and are filled in `migrateSave`.
  - Never change the meaning of an existing field.
  - The original edition must keep loading the same save.
- **Shared code:** anything under `remnant/src` also ships in `/classic/`.
  Build and test both editions.
- **Performance:**
  - Target 120 Hz on iPhone.
  - Pool objects and do no per-frame allocation.
  - No `shadowBlur`.
  - Every new effect respects the quality tier and Reduce flashes.
- **Camera:** keep the steady camera. Ordinary hits never shake it (the
  owner's earlier request, PR #57).
- **Scripture:**
  - Any verse shown is KJV, word for word, with its reference.
  - Check the exact text before shipping; the references below are where to
    look, not finished quotations.
- **Tests:**
  - Every item adds or extends a browser script.
  - Before/after screenshots go in the PR.
  - Never loosen an existing check.

## 2. Combat feel

What it should feel like: every blow lands with weight, every enemy reads
clearly, and nothing feels floaty or samey.

1. **Foe hit reactions:**
   - Directional flinch in the direction of the blow.
   - Real knockback arcs, and launch/juggle poses for launchers and air
     combos.
   - A distinct guard-break stagger and a knockdown with a getting-up recovery.
   - Shared foes keep their logic; only what is shown changes.
2. **Deaths:** purification dissolves (gold light from the cuts outward)
   instead of fades. Elites get a brief slow-motion beat; a Crown or boss gets
   its own death sequence.
3. **Telegraphs:** every enemy attack has a readable wind-up flash plus a sound
   cue. Unblockable attacks get a distinct red-gold tell, matching how the
   Crowns already mark them.
4. **Hit-stop by weight:**
   - Light blows freeze shortest, then heavy, crit, finisher and parry, in
     that order.
   - Finishers get a small camera push, not a shake.
5. **Damage numbers and the style meter:**
   - Crits, element procs and back-hits each get their own style.
   - Numbers stack instead of overlapping.
   - The style rank animates up.
6. **Defence feel:**
   - Show the dodge's invulnerability (a short afterimage) and the parry
     window (a quick glint).
   - Make input buffering identical across combo, cast and dodge.
   - Check at both 60 and 120 Hz.
7. **Enemy behaviour:** foes keep spacing, flank when there are several, and
   don't attack at once, giving a fair, readable rhythm.

**Done when:**
- `combat`, `combat-moves`, `powers`, `foes`, `pacing` and `bosses` pass;
- a new `combat-feel.mjs` checks reaction poses, hit-stop per weight,
  dissolves, and that ordinary hits leave the camera steady.

## 3. Sound

Sound is generated in code (`remnant/src/audio`), which both editions share.

1. **Hits by weapon and target:**
   - Blade, spear, greatsword and bow each sound different.
   - Targets sound like what they are: flesh, armour, stone, chitin, spirit.
   - Crits and finishers add a layer.
   - Each sound draws from a small pool of variations with slight pitch
     changes, so repeats don't sound copied.
2. **Swings:** each move's whoosh matches its speed and weight. Storm and
   Flurry layer quick cuts.
3. **Bow:**
   - The string creaks more as it draws.
   - Release twang, then an arrow whistle that fades with distance.
   - Impacts differ: thunk into wood or stone, pierce through a foe.
   - A charged shot cracks.
4. **Abilities:** every Covenant ability and every archer ability gets a
   signature sound of its own (§5, §6).
5. **Transformations:** a stinger for the Shadow Mantle and one for Wings of
   the Morning. Each form gets a quiet ambient bed while it lasts.
6. **World:** footsteps per surface (stone, wood, ash, sand, water, metal);
   lamps, braziers and wind; UI sounds for menus and the shop.
7. **Mix:**
   - Separate music, effects and voice volumes.
   - Ducking during dialogue and big moments, and a limiter.
   - A cap on how many copies of one sound play at once.
   - Pan by position on screen.

**Done when:**
- a new `sound-pass.mjs` checks that each event triggers the right sound;
- the variation pools don't repeat back to back;
- the instance cap and ducking work;
- `audio-cinema`, `soundtrack` and `install-audio` still pass.

## 4. Abilities: effects and animation

The twelve Covenant abilities currently show the original's Canvas effects.
Give each one:

1. **Its own animation:**
   - a cast or invocation pose baked into the action atlas;
   - anticipation, then release, then recovery;
   - hand and bow positions that match the effect.
2. **Native Phaser effects** (from art V03/V04 when delivered, procedural
   until then):
   - pooled sprites and particles;
   - a light pulse where it fits;
   - a short screen accent only for the big ones (Armor of Light, Pillar of
     Fire).
3. **Impact:** what an ability's hit looks like on a foe, matched to the
   ability.
4. **Growth:** stronger skill ranks look visibly stronger (brighter, larger,
   more motes) without clutter.
5. **HUD:** cooldowns sweep as a ring, an ability flashes when it becomes
   ready, and the icons come from art I04.

**Done when:**
- `combat-moves` (all twelve casts) passes with a new per-ability visual
  check;
- screenshots of all twelve, mid-effect, are in the PR;
- frame time stays steady with three abilities overlapping (perf probe).

## 5. The archer: her own kit and her own transformation

The archer is **Tirzah** in the game today. The owner wrote "Camile": confirm
whether to rename her before shipping. Renaming is a text and data change; the
save keeps `playableHero: 'tirzah'` as its internal id.

She shares the journey, health, energy, gear and level with Elior, as now.
Her moves already include: a quick shot, a charged piercing shot (6 CE), and
Up + Strike for a three-arrow spread (10 CE).

### 5a. Her abilities (her own three skill slots)

When she's the active fighter, the three skill buttons use **her** loadout.
That's a new optional save field, `archerSkills`. The six abilities:

| Ability | Effect |
|---|---|
| **Arrow of Deliverance** (2 Kings 13:17) | One blazing arrow that pierces the whole line, knocks foes down and breaks guards. |
| **Jonathan's Volley** (1 Samuel 20:20) | Three arrows plant in the ground past the foes, then burst back toward her, hitting from behind. |
| **Hunter's Mark** | Marks a foe: her arrows curve toward it, it takes extra damage from her, and the Echoes focus it. |
| **Rain of Arrows** | A rain of arrows over an area ahead, ticking for 2.5 s. |
| **Watchman's Eye** (Ezekiel 33:7) | 2 s of slowed time. Weak points glow, and her next three shots are guaranteed precision hits. |
| **Quiver of the Mighty** (Psalm 127:4) | For 10 s every shot splits into three. |

They unlock with her level and story progress, the way Elior's skills do, and
are equipped in Menu → Skills under a "Tirzah" toggle.

### 5b. Wings of the Morning (her transformation, Psalm 139:9)

- **Activation:** it uses the same transformation gauge and button as the
  Shadow Mantle. Whichever hero is active transforms. The gauge is shared, so
  tagging out doesn't refill it.
- **Look:** dawn-gold and white, wings of light, a glowing braid and bow (art
  C04, C05, V06). It's a hopeful counterpart to Elior's shadow.
- **Dawnstep** (the owner's request):
  1. Any arrow she shoots that hits a foe arms a Dawnstep on that foe for
     0.6 s.
  2. Pressing Dodge (or, optionally, Strike) blinks her **behind** that foe,
     facing its back.
  3. She fires a **separate point-blank back arrow**. It hits harder, ignores
     guard, and counts as a back-hit for style.
  4. That back arrow can arm the next Dawnstep on another foe. A chain of
     three ends in **Morning Star**, a radial burst of light arrows.
  5. It costs no energy while transformed, has a short internal cooldown
     against spamming, and blinks only to safe ground in line of sight (the
     same checks Phantom Step uses).
- **Also while transformed:**
  - she can hover: hold Jump in the air to glide and draw;
  - every charged shot is free and pierces;
  - her arrows leave dawn trails.
- **End:** when the form ends, a final volley rains on every foe that is
  marked.

### 5c. What makes her combat unique (beyond the abilities)

1. **True Aim range:** shots land harder at mid range. A subtle tick on the
   aim line shows the sweet spot, which rewards spacing instead of standing
   in melee.
2. **Embedded arrows and Recall:**
   - Arrows stick in foes, shown with art C06.
   - A Recall input (hold Heavy) pulls them all back through the foe; more
     arrows means a bigger rip.
   - At most eight arrows are embedded at once, pooled.
3. **Precision zones:** hits on a foe's head or weak-point zone are precision
   hits (crit plus a small stagger). Bosses show their weak points during
   openings.
4. **Shooting projectiles down:** a well-timed shot destroys an enemy
   projectile. A shot on an enemy's wind-up flash interrupts the attack (her
   version of a parry).
5. **Evasive shots:**
   - Dodge then Strike is a backflip shot: she leaps away and fires.
   - Down + Strike in the air is a diving arrow that spikes foes downward.
   - Holding a draw in the air slows her fall.
6. **A close-range answer:** a bow-bash and kick that knock a foe back,
   chaining straight into a point-blank shot. It keeps her safe without
   turning her into a melee fighter.
7. **Arrow types:**
   - A quick-cycle input selects standard, fire, frost, storm or holy arrows.
   - They use the existing element system and status effects.
   - Unlocked types are saved in a new optional field, `quiver`.
8. **Pinning:** a charged shot that hits a foe near a wall pins it briefly.

**Done when:**
- a new `archer.mjs` covers all six abilities, Dawnstep (blink behind, back
  arrow, chain, Morning Star, safe-ground refusal), Recall, precision hits,
  shooting projectiles down, the evasive shots and arrow-type switching;
- `action-kit` and `equipment-visuals` still pass;
- Elior's kit is untouched.

## 6. Selling, salvage, the store and crafting

Today Ilan's stall can buy and sell (silver only, half value), and Dov's forge
can temper and forge. `ui/menus.ts` (`renderShop`, `sellValue`, `STOCK`) holds
it all.

1. **Selling gives silver and salvage.**
   - Each sale also yields crafting materials set by the item's slot, rarity
     and element. For example: a weapon gives iron scrap or a steel ingot; an
     element adds its core (ember core, frost crystal and so on); rare and
     above add a relic shard.
   - Show the full return before confirming.
2. **Dismantle at Dov's forge:** no silver, about double the materials.
3. **Quality of life:**
   - Lock or favourite an item to protect it.
   - "Sell all junk" covers common items that aren't equipped and are weaker
     than what's equipped.
   - Rare and above need a confirmation.
   - Buy back any of the last ten sales; the list isn't saved between
     sessions.
4. **A store worth visiting (Ilan):**
   - Stock rotates per chapter and grows with the Rest's tier.
   - **Upgrade stones and tempering materials.**
   - **Elixirs:** short timed buffs (might, warding, swiftness, focus).
   - **Balm vials,** up to their cap.
   - **Quiver upgrades and special arrows** for the archer.
   - **Accessories with unique effects,** e.g. a Feather of Dawn ring that
     fills the transformation gauge faster.
   - **Recipe scrolls** that unlock forge recipes.
   - **Echo imprint tokens.**
   - **A rare Tome of Insight:** one skill point, once per chapter, expensive.
   - **Cosmetic cape colours.**
   - Prices follow the chapter curve, so nothing is trivial or out of reach.
   - Each item says plainly why it's worth buying.
5. **Crafting uses salvage:**
   - Dov's recipes turn materials into gear, arrows, upgrade stones and
     elixirs.
   - Recipe scrolls add more recipes.
   - Show what you have against what a recipe needs.
6. **Save fields** (all optional, all migrated):
   - `locked: string[]` holds item uids;
   - `recipes: string[]`;
   - `quiver` (§5c);
   - `stockSeen` drives the "new item" dots;
   - materials keep using the existing `materials` map.

**Done when:**
- a new `economy.mjs` checks sell returns (silver and materials), dismantle,
  locks, sell-all-junk, rare confirmation, buyback, stock by chapter and Rest
  tier, buying each item kind, crafting with salvage, and save round-trips;
- `menu` and `saves` pass;
- the original edition's shop still works.

## 7. Gameplay polish across the board

- **Movement:** ledge forgiveness, landing recovery that never eats an input,
  a consistent air dash and double jump.
- **Echoes:** clearer orders feedback, smarter positioning, and their own hit
  sounds and effects.
- **Bosses:**
  - every phase change gets a stinger, a framing beat and a clear new
    pattern;
  - with the boss art, B01–B10 move from vector shading to painted atlases.
- **Pacing:** keep the calmer exploration clock and brisk combat cadence the
  owner asked for (PRs #57 and #58).

## 8. Using the art

When an entry in `art/manifest.json` is `delivered`, follow
`art/README.md`:
1. Validate it.
2. Normalise it into shipping assets.
3. Integrate it behind the existing pipeline: the parts rig, the action
   atlases, sprite-manifest sheets, Phaser particle frames and parallax.
4. Mark it `integrated` with the PR number.

Effects built procedurally beforehand get their textures swapped in; the code
around them stays the same.

## 9. Order of work (one draft PR each)

- [ ] 1. Combat feel (§2), in parts:
  - [ ] 1a. Numbers, sparks, purification dissolve, elite slow motion, hit-stop by weight (§2.2, §2.4, §2.5)
  - [ ] 1b. Foe hit reactions: flinch, knockback arcs, launch poses, guard-break, knockdown (§2.1)
  - [ ] 1c. Telegraphs, defence feel and enemy spacing (§2.3, §2.6, §2.7); boss death sequences; style meter
- [ ] 2. Sound pass (§3)
- [ ] 3. Ability effects and animation, procedural first (§4)
- [ ] 4. The archer's mechanics: True Aim, Recall, precision zones, shooting projectiles down, evasive shots, close-range answer, arrow types, pinning (§5c)
- [ ] 5. The archer's six abilities and her separate loadout (§5a)
- [ ] 6. Wings of the Morning and Dawnstep (§5b)
- [x] 7. Selling, salvage, dismantling, locks, buyback (§6.1–6.3), moved ahead of the archer items at the owner's request
- [x] 8. The store and crafting (§6.4–6.5): owner's choices were Ilan's stall plus a pause-menu Store, a daily rotation, three featured rare curios for silver plus Relic Shards, keepsakes unsellable, a balanced economy, and every category plus a surprise (the Sealed Satchel)
  - [ ] Still to come: quiver upgrades and special arrows (with §5), recipe scrolls, Echo imprint tokens, "new item" dots (`stockSeen`)
- [ ] 9. Gameplay polish (§7)
- [ ] 10+. Art integrations as drops arrive (§8): characters C01–C06, effects V01–V08, bosses B01–B10, foes F01–F05, environments E01–E12, icons and UI I01–I05

Tick each item with its PR number when it merges.

## 10. Questions for the owner

1. The archer: keep the name **Tirzah**, or rename her **Camile** (or another
   spelling)?
2. Should Wings of the Morning share the Shadow Mantle's gauge (the proposal
   here), or should each hero have their own?
