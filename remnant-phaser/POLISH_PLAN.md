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

The archer is **Tirzah** (the owner confirmed the name).

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
  - [x] The bow and the archer (§3.3, §3.4 for her abilities, §3.5 for the Wings): creak, chime, twang, crack, whistle, pierce, thunk, recall, jab and six ability signatures, panned and pitch-varied; `scripts/sound-pass.mjs`
- [ ] 3. Ability effects and animation, procedural first (§4)
  - [x] Eleven Covenant abilities play the generated V03/V04 art (Chain Snare waits on its retry row)
  - [x] The classic effects' rings, pillars, arcs and streaks, Elior's glows and the Fallen Crown telegraphs draw from the art; burning, frozen and bleeding foes wear V07 (#73)
- [x] 4. The archer's mechanics (§5c): True Aim, embedded arrows and Recall, precision head shots, shooting projectiles down and interrupting wind-ups, the backflip and diving shots, a slowed fall while drawing, the bow-bash, pinning; `scripts/archer-craft.mjs`
- [x] 5. The archer's six abilities and her separate loadout (§5a), with arrow types (§5c.7) and the `archerSkills`, `archerKnown`, `quiver` and `arrowType` save fields; `scripts/archer-kit.mjs`
- [x] 6. Wings of the Morning and Dawnstep (§5b): shared gauge (the owner's choice), dawn form and wings, Dawnstep with safe-ground refusal, Morning Star, glide, free charged shots, the closing volley; `scripts/archer.mjs`
- [x] 7. Selling, salvage, dismantling, locks, buyback (§6.1–6.3), moved ahead of the archer items at the owner's request
- [x] 5b. Tirzah's own progression, asked for by the owner: her level and experience (the fighter full, the partner half), stat and skill points, a 19-node skill tree, seven gear slots of her own with bow, quiver and dagger drops scaled to her level, and a Tirzah section in the pause menu; `scripts/tirzah-progression.mjs`
- [x] 5c. Asked for by the owner: Tirzah's dagger up close (two cuts and a kick back into bow range), the Wings' crit as a dagger in the back and an arrow on through, squash, stretch and lean for both heroes, and a pixel picture on every action button; `scripts/tirzah-dagger.mjs`
- [x] 8. The store and crafting (§6.4–6.5): owner's choices were Ilan's stall plus a pause-menu Store, a daily rotation, three featured rare curios for silver plus Relic Shards, keepsakes unsellable, a balanced economy, and every category plus a surprise (the Sealed Satchel)
  - [ ] Still to come: quiver upgrades and special arrows (with §5), recipe scrolls, Echo imprint tokens, "new item" dots (`stockSeen`)
- [ ] 9. Gameplay polish (§7)
- [ ] 10+. Art integrations as drops arrive (§8): characters C01–C06, effects V01–V08, bosses B01–B10, foes F01–F05, environments E01–E12, icons and UI I01–I05
  - Drop P1: the V01 slash arcs and V02 impacts ship. C01 was tried in game and rejected, because it reads worse than v1 at 56 px. C02, C04, C06, V03, V05, V06 and V07 are held for their plan items. Retries are requested for C01, C03, C05, V04 and V08.

Tick each item with its PR number when it merges.

## 11. The partner hero, lighting and atmosphere (owner's answers, 30 October 2026)

The owner plays on an iPhone with touch. They chose **looks first** over a guaranteed 120 Hz: full effects even if that sometimes means 60 fps.

**Order:** the partner first, then lighting, then weather and screen effects.

### 11a. The AI partner hero (core shipped: `scripts/partner.mjs`)
- The hero you are not controlling can fight beside you as an AI partner.
  - It is **optional and off by default**: called from the command wheel, with a toggle in Settings.
  - You can swap control at any time (the switch button changes who you play).
- **Aggressive:** it goes for kills, uses its abilities and combos freely, and joins your finishers. Tirzah shoots from range and draws the dagger up close; Elior closes in with his blade.
- **Partner or Echoes:** calling the partner dismisses the Echoes, and calling Echoes sends the partner back.
- **Beyond fighting:**
  - **joint finishers:** both strike together, with a camera moment;
  - **revive:** the partner pulls you back up once per room;
  - **banter** in a **playful rivalry** (kills, style ranks);
  - **own XP and gear:** the partner keeps its own level and gear, and earns the waiting hero's half XP as now.

### 11b. Lighting, dramatic (shipped: `scripts/lighting.mjs`; normal maps wait on L01)
- Caves, temples and night rooms go properly dark.
- Light comes from torches, lamps, the heroes' weapons, arrows in flight, spells, the Wings and the Mantle.
- Code-made normal maps stand in until art arrives (requests L01–L03).

### 11c. Weather and ambience (shipped: `src/game/atmosphere.ts`, `scripts/atmosphere.mjs`)
- Ash and embers: the Ashen Village and Cinders.
- Rain and storm, with lightning flashes: the Storm Prince and the Chittim coast.
- Fog layers: the Valley of Bones, the Hunt and the Pestilence marsh.
- Motes falling through light beams: temples and the Rest.

### 11d. Screen effects (Phaser 4 filters; shipped: `src/game/screenFx.ts`, `scripts/screen-fx.mjs`)
- Bloom and glow on light, fire, the Wings and the Mantle.
- Place effects: foundry heat shimmer, an underwater ripple, a cold tint in the snow.
- Cinematic boss intros: film grain, letterbox and a per-chapter colour grade.

### 11e. Richer animation
- New frames come from ChatGPT art drops (requests A01–A04). Code-made placeholders ship until they arrive.

## 12. Design review: the next upgrades (owner's answers, 30 October 2026)

A review in the spirit of Hollow Knight and Castlevania found:
- **The world is a corridor.** 68 of 77 rooms have one or two doors, and the 9 locked doors open by story flags, never by an ability.
- **Exploring opens paths only in Chapter I** (the temple's seals and cracked walls).
- **Rooms are flat.** Only 6 are tall.
- **Death costs nothing.**
- **Progression is a deep action-RPG.**
- **On a phone, nine buttons cover about 40% of the right side.**

The owner chose this order: phone, death, the pilot, then Psalms.

### 12a. Phone controls and camera (shipped: `scripts/phone-controls.mjs`)
- **Smart buttons** (Settings → Touch controls, on by default):
  - strike, jump and dodge always show;
  - parry, the skills, Switch and Sub show in a fight and for 3 s after;
  - Balm shows when hurt;
  - the Mantle and Super show when ready.

  Buttons fade in place, so nothing moves under a thumb, and turn see-through while a foe or the hero stands behind them.
- **Camera look-ahead** (Settings → Display, on by default): the camera leads the way the hero faces, by up to 72 world px, once he has kept to it for 0.22 s. A boss's framing and story shots take over.
- **Zoom:** the normal camera distance is 10% closer on a phone.

### 12b. Death with stakes (shipped: `scripts/shade.mjs`)
- **The shade:** falling drops your silver as a shade where you fell. Strike it to win the silver back. Shades stack: a second death leaves a second shade.
- **Respawn:** at the last shrine you rested at, not the doorway.

### 12c. The metroidvania pilot: Chapter I (shipped: `scripts/ch1-pilot.mjs`)
- **An interconnected map:** the village and the temple loop back on themselves, with shortcuts that open from one side.
- **Locks:** high ledges need the Eagle Plume's double jump, and wide gaps need the air dash. The plume should come early enough to send the player back.

### 12d. Psalms (shipped: `scripts/psalms.mjs`)
- **What they are:** equippable, charm-like Psalms that change how you play. Each costs slots from a limited number.
- **How they fit:** they sit beside levels and gear, and are found as rewards for exploring.

### 12e. A guided story (shipped: `scripts/story-flow.mjs`)
The owner asked for the story to lead the way to each boss: an arrow, or a trail to follow as in Monster Hunter,
and a hint to tap that says what to do next.
- **The trail of light** (`src/game/guideTrail.ts`): motes rise off the hero and stream toward the objective, or the
  doorway on the way to it, then circle over it once the hero is close. Pooled, and off in fights and scenes.
- **The edge arrow:** when the goal is out of view, a gold arrow at the screen's edge points to it (the original's
  HUD arrow, ported).
- **The objective chip** under the column names the goal with its direction; tapping it, or O on a keyboard, opens
  the **"what now?" card** (`src/game/guideHint.ts`): the chapter, the main quest, what to do now, the rooms from here
  to the goal, and every step still ahead to the boss (for VII–X the objectives left and the throne, by name).
- All of it follows Settings → Objective marker.

## 13. The Horde: a top-down mode in endless stages (owner's answers, 30 October 2026)

The owner asked for a horde mode in the survivors genre: seen from above, the horde coming from every side, the
heroes' weapons striking on their own, an occasional boss, rewards, and stages without end that grow harder. It
should play held upright, with buttons for the abilities, the transformation and the switch. A third hero, a mage,
follows it.

- **Run shape:** endless stages. Each is a few minutes of horde, then a monarch; clear it, choose onward or leave,
  and the next stage is harder. The best stage is kept.
- **Growth in a run:** each level-up offers one of three upgrades (a new relic weapon, a stronger weapon or a
  passive); the build resets each run.
- **Rewards:** what a run earns (silver, XP, the monarchs' gear) goes into the journey's save.
- **Holding the phone:** built for upright, and sideways works too.
- **The third hero:** Uri, a human flame-caller whose fire answers prayer (1 Kings 18:38). His summoned ally is a
  great orc shaman, a cleansed battle-imprint; his transformation merges the two. He comes to the Horde first and
  joins the story after.

### 13a. The Horde (shipped: `scripts/horde.mjs`)
The mode is `src/scenes/Horde.ts` with `src/game/horde/`. PORTING.md has the details.

### 13b. Uri in the Horde (shipped: `scripts/horde.mjs`)
- **Uri:** a calm human flame-caller in a charcoal long coat. His own weapon, the Hand of Flame, hurls fireballs at the
  nearest foes, which burst where they land. His skill, Fire from Heaven, brings fire down on the five thickest knots
  of the horde. The first time each run, it shows "Then the fire of the LORD fell", 1 Kings 18:38 (KJV).
- **The orc shaman:** a cleansed battle-imprint at his shoulder whenever he fights. On its own clocks it calls a hail
  of fire, a war-cry that slows the horde, and a burning ward around Uri.
- **The Crown of Flame:** his transformation. The shaman steps into him: crowned in fire, he throws meteors (two more,
  wider) and walks in a ring of fire. The shaman returns when the Crown fades.
- **Art:** he is painted for now by the original's pixel painter; parts sheets are requested (art/REQUESTS.md
  C08–C10).
- **Strength:** his own level and XP (`PhaserSave.uri`), earned in the Horde. His numbers are Elior's scaled by their
  levels (0.6× far behind to 1.3× ahead), and he earns triple XP while behind Elior. Joining the story is the next
  step.

### 13c. Teleport combos and impact frames (shipped: `scripts/horde.mjs`)
The owner asked for more teleporting in the combos, the slow-motion impact frames, and better-looking strikes
(the falling columns showed as hard-edged squares that popped in and out).
- **Elior's Phantom chain:** every fourth cut (third from the blade's fifth upgrade, every other in the Mantle) he
  blinks from foe to foe, cutting each, leaving afterimages. The monarch, if near, takes the last cut, and the last
  cut is an impact frame.
- **The dash is a blink for every hero:** Elior's Phantom Step cuts what it passes; Tirzah's Dawnstep leaves
  feathers and looses a fan of arrows (stepping away from the horde when the stick is still); Uri's Ember Step bursts
  into fire at both ends.
- **Impact frames:** a near-freeze, a camera punch, a ring of light and a shake, at most one a half second, for the
  chain's last cut, an elite felled and the first strike of Fire from Heaven.
- **Strikes from above** (the Pillar of Fire relic, the shaman's hail, Fire from Heaven) are drawn bolts that fade
  in from the dark, flicker and dim, with a soft bloom, a ring of light and sparks or flames where they land. Every
  sheet effect now fades through its last quarter.

### 13d. Evolutions, tag combos and the Trinity, rerolls and banishes (shipped: `scripts/horde.mjs`)
The three gameplay recommendations the owner chose to build.
- **Weapon evolutions:** a weapon at its last level, carried with its partner passive, evolves at the next elite's
  chest or fallen monarch (`EVOLUTIONS` in `defs.ts`): the Covenant Blade with Might becomes the Sword of the Spirit
  ("the sword of the Spirit, which is the word of God" · Ephesians 6:17 (KJV)): a wave of light every cut and a
  Phantom chain every other. The Dawn Bow (Precision) becomes the Bow of the Dawn, the Hand of Flame (Reach) the Fire
  of the Altar, and each relic has its own. The last-level card says what it evolves with, and a passive card says
  which carried weapon it would evolve.
- **Tag combos:** switching in the moment after a skill, a transformation or a Phantom chain's last cut lands as a
  tag combo for the hero arriving: Tirzah's Dawn Volley (a rain of arrows and a ring of them), Uri's Ember Crash (a
  pillar of fire where he lands and three around), Elior's Phantom Entry (a Phantom chain). The switch button glows
  and reads TAG! while the window is open; a tag feeds the arriving hero's gauge and the switch returns sooner.
- **The Trinity:** each hero now fills their own gauge (three pips over the form button). With all three full the
  button turns gold and reads TRINITY: every gauge is spent at once, the other two heroes stand at the hero's
  shoulders, Elior's echo cuts through the nearest foes, Tirzah's volley falls and Uri's fire comes down from heaven.
- **Rerolls and banishes:** three of each per run, one more of each per monarch broken. A reroll draws the three
  cards again; a banish strikes a card's upgrade from the run.

## 14. Legendary Powers: build-changing loot (owner's answers, 5 November 2026)
The owner asked what would make the game more compelling to keep playing. After a look at what the most replayed
action RPGs do (build-changing legendaries, a codex of learned powers, a big drop moment), they chose: build-changing
loot; the loop in every mode, lightly; 20–30 minute sessions; generous rewards and no penalties; drops plus a Codex
(break a legendary down to learn its power, then Dov imprints it on other gear); over-the-top effects; Elior and
Tirzah first; a big drop moment (a pillar of light, a chime, slow motion, a name card); one power per piece, up to
seven worn; bosses always drop one, elites often, chests sometimes, foes rarely; the Horde and the Trial too.

### 14a. Legendary Powers (shipped: `scripts/legends.mjs`)
- **The table** (shared, `remnant/src/game/legendary.ts`): thirteen powers. Elior's are the Chariot of Fire (a road
  of fire behind a dodge), Voice of Thunder (crits chain lightning to four foes), Trumpet of Jericho (a perfect parry's
  shockwave), Swords of Gideon (a combo finisher calls three orbiting swords for six seconds), Samson's Fall (a plunge
  brings down six falling stars), Pillar of Fire (heavy blows) and Whirlwind (every eighth blow in a chain).
  Tirzah's are the Quiver of the Hawk (a killing arrow splits into three seeking bolts), Falling Star (charged and
  perfect arrows burst), Rain of Arrows (every sixth arrow that lands), Spirit of the Hawk (crits loose a hawk that
  strikes three foes) and Wind Volley (a dodge looses five arrows behind her). Brimstone (slain foes burst into
  spreading fire) goes on either hero's gear. A piece carries one (`ItemInst.legend`); only the fighting hero's
  worn gear counts.
- **Drops:** every boss leaves one (`World.bossSpoils`: once a boss on the journey, every time in the Trial), elites 35% of the time, a foe's gear drop 1.2%, a chest 20%
  (`LEGEND_CHANCE`). A legendary piece is at least Legendary rarity and its power suits whose gear it is, leaning
  toward powers not yet learned. A Horde monarch's spoil always carries one; so does every fifth Trial wave's prize,
  and now and then another.
- **The drop moment** (`World.legendDropped`): a pillar of light in the power's colour, a chime, a slow beat, a ripple
  round the island and a name card with what it does.
- **The Codex:** selling or dismantling a legendary piece writes its power into `SaveData.codex`; Dov's Imprint tab
  puts a learned power on any piece of the right hero's gear for silver and Relic Shards (`imprint`).
- **The effects** (`src/game/legends.ts`): hooked from Elior's blows, parry, dodge and plunge (`player.ts`) and her
  arrows and dagger (`bow.ts`); pooled strikes, fire patches, seeking bolts and the swords; all damage goes through
  `FoeLike.hit` so it lands on every kind of foe and boss.

## 15. Design pass: pacing, threat and impact (5 November 2026)
The owner asked for a world-class designer's look at the gameplay, the pacing and the speed, and for whatever it
needs tuned. Everything below was measured in the Phaser build first (a balanced build: every stat point spread
evenly, the weapon the previous chapter hands out, at each chapter's arrival level, on Hard), then changed.

**What the measurements showed**
- **The weapon curve breaks after Chapter VII.** Weapon attack climbs smoothly from Chapter I to VI (10 → 118). The
  Crown chapters' reward weapons then jumped to 360, 420, 470, 520, 640 and 720: three to six times the curve every
  other number in the game was sized against.
- **So late-game rooms carried no threat.** From VIII on, an ordinary foe fell to less than one opening blow, and
  even a knight or a shield-bearer to one or two. Chapter I's foes take three to four.
- **And boss fights were all over the place.** The curve sizes a Crown at about 200–230 blows. Varkhos took 235,
  but Morvane 55 and Azkar 81 (the new weapons), while the Prince of Grecia took 331, the Gods 710 and the King 369
  (their health had been inflated to keep up with the weapons).
- **Late foes barely hurt.** A mid-rank foe in I–VI fells Elior in 14–17 of its blows; in VII–XII it took 23–48.
- **Chapter XI broke the level curve.** Every chapter is worth about six levels; XI, with two and a half times the
  foes at full XP each, was worth sixteen, so Chapter XII would have been met at level 75.
- **Light blows had no impact frame.** Hit-stop for a light blow was 12 ms, under one frame at 60 Hz.
- What is already right and was left alone: run speed (about 9 tiles a second), the jump (3.9 tiles high, coyote
  time and a jump buffer, short hops), dodge and parry windows, buffered combo inputs and the cancel into dodge or
  parry, the armour curve (late armour adds about a fifth to Elior's health), and the boss blows (6–9 to fell him).

**What changed**
- **Weapons back on the curve:** the six Crown reward weapons now run 150, 175, 205, 235, 270 and 310 attack
  (`data.ts`), continuing the I–VI climb. Owned copies change with them.
- **Late foes hurt like early ones:** VII–XII foe damage ×1.5–1.6 (`curve.ts`), so a mid-rank foe fells a balanced
  Elior in about 15 blows again.
- **Late foes take real hits again:** VIII–XII foe health re-sized to the reworked weapons, so a knight or a
  shield-bearer takes three to five opening blows and fodder one or two.
- **Bosses back in the band:** the Prince of Grecia 1,250,000 → 410,000 health (240 blows), the Gods 2,100,000 →
  580,000 (about 420 quick spear blows, the long three-god climax), the King of the North 2,600,000 → 925,000 (300).
  Varkhos, Morvane and Azkar are unchanged (235, 125 and 187 greatsword blows, which land slower and heavier).

**Measured after** (`scripts/balance-report.mjs`, a designer's tool kept for the next pass): mid-rank foes 2.4–5
hits and 15–21 of their blows to fell Elior from VII to XII; every boss fells him in 6.5–9 blows.
- **XI pays like a chapter:** its per-foe XP and clear reward come down, so it is worth about nine levels; XII's
  arrival level is 68.
- **Hit-stop with weight:** light 22 ms, finisher 40, heavy 60, crit 75, parry 100 (`player.ts`).

## 16. The Unshorn: Elior's third transformation (owner's request, 5 November 2026)
The owner asked for a third transformation for Elior, introduced in Chapter XII, for a fight hard enough to need it:
long hair, bare-handed punches in a centre-line, Wing Chun-like style (no blasts, no slashes) where every punch lands
with weight, a tail, and a cinematic unlock in the boss fight. The project's rule that Elior stays human holds: the
mane is his own hair grown again, and the tail is living fire from his sash, the power showing, not a beast's limb.
Its root is Samson, whose strength was in his unshorn hair and who fought with his bare hands (Judges 14:6, 16:17,
16:22, 16:28).

- **The awakening** (`src/game/awakening.ts`): the first time Elior fights the King of the North, when the fight
  turns (the king's second movement, or half of Elior's health gone) the Shadow Mantle is offered (its gauge filled,
  and it rises on its own if he waits). He takes it up; the king presses without rest and holds his last movement
  back, and Elior cannot fall (`Player.deathless`). On the edge of falling everything stops: the camera comes to him,
  he prays ("O Lord GOD, remember me, I pray thee, and strengthen me, I pray thee, only this once." Judges 16:28,
  KJV), "the hair of his head began to grow again" (16:22), and he rises as the Unshorn for 32 seconds at
  three-quarters health. Journeys that beat the king before the form existed receive it on load.
- **Ascending afterwards** (`classic/hero.ts` `ascend`): in the Shadow Mantle, Transform again. The Mantle burns
  off, a pillar of fire throws back everything near, and the form lasts 14 seconds plus half the Mantle's time
  that was left.
- **The fists** (`FISTS` and `fistClips` in `remnant/src/game/weapons.ts`): a centre-line guard, straight punches
  hand over hand and a third that drives the body behind it, a double-palm launcher, a ten-punch chain, a short
  guard-breaking strike, an uppercut, hammer fist and diving fist. No blade arcs are drawn.
- **Every punch lands** (`Player.punchImpact`): a hold of 55–110 ms, a punch spark or a heavy burst from the
  V09 sheet (`vfx-unshorn`), a shock ring where the fist meets, the air driven out behind the foe, dust kicked up
  off its feet, a low thud; the heavy blows shake the frame and boom, and the uppercuts throw up rising flame.
- **The form:** a third harder than the Mantle's tier (×2.2 at level 68 against ×1.7), faster on foot and in hand,
  blows taken at 45%, no stagger. The look (`fighterRig.ts`) is the owner's ChatGPT art (5 November 2026): his own
  parts (C11, crimson and gold, bare fists) on the skeleton, so every punch clip stays in step with its hitbox, a
  long braided mane with fire at the tips and a tail of fire over the cape (C12, four frames each). In the
  awakening, the drawn sequence (C15) plays over him: kneeling in the Mantle, praying, the hair growing, rising
  to guard.
- Verified by `scripts/unshorn.mjs`.

## 17. Power that matches the hero (owner's request, 5 November 2026)

The owner's Elior passed level 400: foes fell in a blow, levels came too fast, and a wave rode every strike.

- **Foes answer the hero** (`remnant/src/game/might.ts`): past the level a straight-through player leaves a chapter
  with (the next chapter's arrival), a foe's health follows a balanced build's blow and its damage
  that build's toughness, a little behind both (×0.9 in log), so levels still help. Applied to every foe (`Enemy`),
  every classic boss (`BossBase`, the Idol) and the Fallen Crowns (`bosses.ts`), against the hero in play (Tirzah's
  level while she fights). Chapter XII at level 400: ×28 health, ×22 damage. Straight-through play is unchanged. The
  Trial stays as it was ("survival belongs to the wave, not the level"): its rounds grow on their own, and only its
  pay slows.
- **Levels cost more as he rises** (`xpToNext`): the same curve through 70, then `XP70 × (lv / 70)^2.2`: 18k at 100,
  83k at 200, 382k at 400. The Trial's waves pay in `trialXpUnit` (the square root of that growth), so a wave at 400
  is worth a fifth of a level, not one and a third.
- **No wave on any strike:** the sword and the fists hit what they touch. The Sovereign tier's light wave on each
  swing is gone (`HeroPowers.onSwing`); the Armor of Light now sears each blow that lands (+40%) and the Psalm of the
  Swarm makes a combo's third blow strike the same foe twice, neither sending anything down the room.
- **No crescents at all** (the owner, 6 November 2026): the shadow element's second bite (gear, and always in the
  Mantle) is a burst on the foe instead of a crescent (`elementHit` in `remnant/src/game/power.ts`); the whirlwind
  legend spins dust, not crescents; in the Horde the Covenant Blade's last upgrade is a third, heavier cut, the Sword
  of the Spirit a heavy cut behind him, and the Crescent of Light relic is no longer offered.
- **A speed cap** (`MAX_RUN`, `MAX_ASPD` in `player.ts`): levels, gear and the forms together move him at most ×1.35
  and swing at most ×1.5 (the weapon's own tempo still applies), so a level-400 fight stays readable.
- **Impact frames** (`Visuals.impactFrame`): when the Unshorn's fist lands, for the blow's hit-stop the room drops to
  near-black behind radial speed lines, the foe goes to silhouette, Elior stays lit, and a hard white star marks the
  point of contact; then it snaps back. Heavy blows, crits and combo enders always; quick jabs at most one in 0.18 s,
  so the ten-punch chain never strobes. Reduce flashes keeps only a faint version.
- **Punches sound deep** (`punch` in `remnant/src/audio/audio.ts`): a knuckle crack over a body thump and a sub-drop,
  doubled on heavy blows. The shock ring and the air streak are gone from punches.
- **The Unshorn moves like the monkey king's art, not his look:** Dodge is the Cloud Step (`Player.cloudStep`): gone
  in a puff of golden cloud, he lands behind the nearest foe within 280 px while two fire-gold clones strike it, and
  his next punch is already thrown. A swing at a foe out of reach blinks him to it, as the Mantle does. Transform
  pressed twice goes straight into the Unshorn (once awakened). He wears no cape, so the tail of fire leads.
- **Replay any finished chapter** (Pause → Chapters → Replay; `chapterReplay` in `ui/chapters.ts`, `World.replaying`):
  the chapter's bosses and commanders stand again, matched to his strength, and the boss wakes when he steps in even
  though the story has told that fight. Rewards already won (legendaries, keepsakes, chapter gear) are not paid
  twice. Leaving the chapter ends the replay. Verified by `scripts/replay.mjs`.
- **The title** is one measured column (`scenes/Title.ts`): on a short screen (a phone in landscape with Safari's
  bars) the whole column shrinks to fit, so the buttons never ride over the subtitle or the version line.

## 18. The Watch: an idle game inside the game (owner's request, 6 November 2026) · Phase 1 BUILT

The owner wants a whole second game in the menu: an idle auto-battler, the genre of the screenshot they sent (a hero
on a strip of road fighting what walks in, coins from every kill, coins spent on Attack, Health, Attack Speed and
more, stages with a boss at the end). It is built from the genre's mechanics only, with our own characters, names, art
and world; nothing is copied from any one game. Elior starts it at level 1 and grows, in this mode, into everything he
is in the full game: the Covenant abilities, the Shadow Mantle, the Unshorn, the Sovereign.

**Name:** *The Watch*, after "I have set watchmen upon thy walls, O Jerusalem, which shall never hold their peace day
nor night" (Isaiah 62:6 (KJV)). Elior keeps the wall of a ruined city while the player is away; the foes never stop
coming and neither does he.

### 18a. What the research says (and how it shapes the plan)

- **Costs grow exponentially, power grows polynomially; multipliers bridge the gap.** Pecorella's *The Math of Idle
  Games* (Kongregate; parts I–III) is the reference model: each upgrade's price multiplies by a growth rate (1.07–1.15
  in shipped games) while its effect is linear, so every track slows down on its own; milestone multipliers (×2 at
  levels 25, 50, 100…) and a prestige loop let the player push further each time. We use exactly that shape.
- **Prestige is the long game.** Resetting for a permanent currency whose amount grows with the log or square root of
  the run's best is what lets an idle game last months (Pecorella part III). Our version is the Ascension (18e).
- **Upgrades must change how you play, not only a number.** Practitioner notes on idle design agree that "+10%" alone
  goes unnoticed; the upgrades that keep players are the ones that unlock a behaviour. So every milestone in the Watch
  unlocks something: a skill, a form, an ally, a new kind of stage.
- **Coming back must feel good, but active play must still matter.** Offline earnings are the main return hook (the
  "welcome back" card), but they are capped and paid at a fraction of active income; being there adds taps, skills and
  boss pushes that idling cannot.
- **Walls made only of timers drive players away.** When the boss is too strong the player always has something to do:
  farm the last stage, spend on the cheapest track, run a dungeon, or Ascend.

### 18b. The screen (portrait, the phone held upright)

- **Top third, the wall:** a side-on strip of road at the city's broken gate, drawn with the existing Phaser art. Elior
  (his real action atlas: sword clips, the Mantle's violet, the Unshorn's mane and tail) stands left of centre; foes
  walk in from the right in waves; damage numbers, coin bursts and the impact frames fly as in the main game. A stage
  bar ("Gate 1 · 3/10") with the boss skull at its end; a boss timer when one is up.
- **Middle strip:** coins and gems, the skill bar (auto-cast, or tap to cast), the Transform button once earned.
- **Bottom half, the upgrades:** a 2-column grid of upgrade cards (name, icon, level, effect, cost; hold to buy in a
  run; ×1 / ×10 / ×max). Locked cards show what opens them ("Health level 40 opens Critical Chance").
- **Bottom bar, the tabs:** Hero · Skills · Allies · Trials · Ascend · Shop (the Shop sells for coins and gems earned
  in play; there is no real money anywhere).

### 18c. The core loop and its numbers

- **Foes** walk in, Elior strikes the nearest automatically at his attack speed; each kill pays **coins**. Ten kills
  advance the stage; every tenth stage is a **boss** with a 30 s timer. Fail the timer and the stage before it loops
  as a farm until the player chooses to push again (an auto-push toggle opens later).
- **Foe health** at stage *s*: `12 · 1.10^(s−1)`; **foe blow** `3 · 1.095^(s−1)`; **coins per kill**
  `2 · 1.10^(s−1)`; bosses have ×9 health, a ×2.5 blow and pay ×12. (Built: a simulated greedy player outruns these
  for about a hundred stages and then plateaus whatever the curve, so the Ascension opens at stage 60 and is the way
  on. The numbers live in `src/game/watch/defs.ts`.)
- **Upgrade tracks** (cost `base · rate^level`; effect linear; ×2 at levels 25, 50, 100, 200, 400…):
  | Track | Base cost | Rate | Effect per level | Opens at |
  |---|---|---|---|---|
  | Attack | 10 | 1.07 | +4 damage | start |
  | Health | 10 | 1.07 | +20 health | start |
  | Attack Speed | 25 | 1.12 | +1% swings (cap ×2) | start |
  | Critical Chance | 200 | 1.15 | +0.5% (cap 60%) | Health 40 |
  | Health Regen | 300 | 1.10 | +0.2%/s | Critical Chance 20 |
  | Critical Damage | 500 | 1.10 | +5% | Critical Chance 100 |
  | Defense | 800 | 1.10 | softens blows toward 75% | stage 20 |
  | Coin Find | 1,000 | 1.11 | +2% coins | stage 30 |
- **Damage numbers** use short forms past a million (K, M, B, T, then aa, ab…), formatted once per change, not per
  frame.
- **Offline:** the welcome-back card pays what the last 10 minutes of active play earned per second × the time away ×
  50%, capped at 8 hours (both raised by Ascension perks). Computed from the save's timestamp, never simulated.

### 18d. Elior grows into who he is (the main game's milestones, in this mode)

Elior has his own level here (`watchXpNext = 20 · L^1.6`), from **XP** for kills and bosses; each level adds 3% to
his blows and health. The owner's answers set the arc: shadows join him one by one from level 1 to 150, the Mantle and
later the Unshorn come as he grows, **Tirzah fights beside him from level 150** and **Uri the flame-caller from level
300**.

| Watch level | Opens | Status |
|---|---|---|
| 5 | Covenant Strike: a heavy blow with all his weight every 9 s (×6) | built |
| 8, 20, 40, 70, 110, 150 | A shadow joins him each time (cleansed foes in violet; each strikes for 25% of his blow) | built |
| 10 | Pillar of Fire on the furthest foe every 14 s (×4) | built |
| 25 | **The Shadow Mantle**: kills fill the gauge; transform (auto, or the Transform button) for ×1.7 blows, ×1.2 swings, 15 s | built |
| 40+ | Phantom Step; the Skills tab | Phase 2 |
| 80 | **The Unshorn**: in the Mantle, Transform again: fists, impact frames, the Cloud Step | Phase 2 |
| 100 | **The Sovereign** | Phase 2 |
| 150 | **Tirzah** on the wall, her own track and arrows | Phase 4 |
| 300 | **Uri** the flame-caller and his orc shaman | Phase 4 |

### 18e. Ascension (the prestige loop)

- Built: from **stage 60** on, Elior can **Ascend** (two taps): the stage, coins and upgrade levels reset; his Watch
  level stays. He receives **Seals** = `floor(sqrt(best stage − 59) × 3)` (the square root keeps each Ascension worth
  roughly the same effort); each Seal adds 5% to every blow and every coin.
- Later, Seals also buy permanent **perks** in a small tree: +10% coins, +10% damage, offline cap +1 h, offline rate +10%,
  auto-push, start at Gate N, boss timer +3 s, Mantle gauge +20%.
- The first Ascension is designed for about day two to three of casual play; each later one is faster.

### 18f. The other tabs (later phases)

- **Allies (Echoes):** foes Elior purifies here join as allies who strike on their own, levelled with coins; three can
  stand on the wall. Their kits and art are the main game's Echoes.
- **Trials (dungeons):** three daily keys each for a Coin Trial (a 60 s rush of coin carriers), a Gem Trial (a boss
  ladder) and a Relic Trial (gear). Fixed, short, and replayable, so a wall always has something beside it.
- **Gear:** six slots (blade, helm, armour, gauntlets, boots, relic) with rarities; pieces drop from bosses and Relic
  Trials, merge three-of-a-kind into the next rarity, and add % bonuses. No paid summons.
- **Expeditions (late):** send an ally away for 1–8 hours for gems and materials (an idle timer that runs beside the
  wall, never instead of it).
- **Daily tasks and a login calendar:** small gem rewards for things the player does anyway.

### 18g. How it touches the main game

The Watch is its own journey: its own Elior level, coins and stages, stored in an optional `PhaserSave.watch` (saves
stay compatible). Crossing over is one-way and small, so neither game breaks the other's balance: Watch milestones
pay main-game **silver** and **cosmetics**, never main-game levels or stats (the owner's choice). Built: a gate's boss
falling the first time pays 25 silver × the gate, once ever (`WatchSave.paid`), and Gates 10 and 25 give capes
(Midnight, Lamp) to the main game's wardrobe.

### 18h. Feel

The main game's impact work carries over: hit-stop on bosses and crits, the impact frames in the Unshorn, the deep
punch sound, coin fountains that arc into the counter, a shake when a boss falls. Big numbers stay readable (outlined,
stacked, faded). Portrait at 120 Hz: pooled sprites and text, no per-frame allocation, no `shadowBlur`, fine detail
gated on the quality tier, and the strip simulated at a fixed step so offline and online agree.

### 18i. Build order

1. **Phase 1, the wall** (BUILT): the `Watch` scene (`remnant-phaser/src/scenes/Watch.ts`; `src/game/watch/defs.ts`
   the numbers, `ui.ts` the DOM panel, `entry.ts` the Game modes row), the eight upgrade tracks with gating (×1, ×10,
   Max), stages and gate bosses (the Horde's lands and monarchs) on a 30 s timer with Challenge, coins, taps, the
   Watch level with Covenant Strike and the Pillar, the shadows, the Shadow Mantle, the Ascension and Seals, offline
   earnings and the welcome-back card, silver and capes for the journey, `PhaserSave.watch`, a title-screen and
   Settings → Game modes entry, and `scripts/watch.mjs`.
1b. **Places and the armoury** (BUILT, the owner's ask of 6 November 2026): free CC0 art (art/incoming/cc0/CREDITS.md) gives
   each gate a new place with its own foes and holder, eight blades won by gates 1–8, and fourteen new foes the Horde
   uses too (its lands 7–9).
1c. **Movement, speed and abilities** (BUILT, the owner's ask of 6 November 2026): rush and holding stages, ×2/×3 speed,
   the Skills tab (seven abilities bought, levelled and equipped), and staged slow-motion combos (Phantom Step, Last Watch).
1d. **Shadows earned** (BUILT, the owner's ask of 6 November 2026): essence from elite foes and gate bosses raises and levels
   the main game's nine Echoes; the Shadows tab sets the team and each one's role, and each role fights its own way.
2. **Phase 2, the forms:** Phantom Step, the Unshorn and the Sovereign in the Watch; the Skills tab.
3. **Phase 3, the long game:** the Seals' perk tree; Allies; gear.
4. **Phase 4, the side roads:** Trials, Expeditions, daily tasks; Tirzah at level 150, Uri at 300.

### 18j. The owner's answers

A fresh Elior at level 1; portrait; the name stays *The Watch*; silver and cosmetics only back to the journey; his
transformations come as he levels; Tirzah joins at level 150 and Uri at 300; shadows join him from level 1 to 150.

### 18k. The next round (the owner's answers of 6 November 2026)

Asked what to add next, modelled on popular idle RPGs (Tap Titans, AFK Arena, Idle Heroes, Clicker Heroes), the owner
chose:

- **Offline progress, in full** (BUILT): away, the wall goes on at half speed for up to twelve hours. He clears stages,
  levels, earns coins and elites' and holders' essence, and wins gates (paying the journey's silver, capes and blades as
  if live). He stops where the live wall would stop him: a holder he cannot fell in its time, or stages whose foes
  outlast his health. Holding back, he never drops lower, and tries again every three levels he gains. A welcome-back
  card lists it all. `src/game/watch/offline.ts` (`simulateAway`, `applyAway`), calibrated against the live wall in
  `scripts/watch.mjs`. Perks may lengthen the cap (`awayCap`).
- **Daily quests and a login streak:** three to five daily tasks (foes felled, abilities used, a gate won), weekly goals,
  and a streak calendar; rewards come in chests.
- **Achievements and titles:** many milestones, each a small permanent bonus and a title or badge.
- **Relics and an Ascension tree:** Seals buy relics and talents that outlast an Ascension (the long chase).
- **A boss tower and daily dungeons:** a tower of holders, one floor per try with milestone rewards; daily dungeons
  (coins, essence, gear) with a few free entries a day.
- **Chests with pity:** earned, never bought; random rolls with a guaranteed rare or better within a set number of opens.

Build order: offline progress (done), then daily quests with the streak and chests, then achievements, then relics and
the Ascension tree, then the tower and dungeons.

Sources: Anthony Pecorella, *The Math of Idle Games*, parts I–III (Kongregate, on Game Developer); practitioner notes
on idle retention, offline earnings and upgrade design (Pocket Gamer.biz on Gold & Goblins; DEV Community posts).

## 19. Agent skills: checking the game against awesome-gamedev-agent-skills (owner's request, 7 November 2026)

The owner asked how the [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
repository could improve the game. It is a library of 77 *Agent Skills* (Apache-2.0): short playbooks an AI coding
assistant loads before it works on a topic. It holds no code or art for the game itself. Its value here is twofold:
the assistants that work on this repo (Claude Code, Codex) follow tested practice, and each skill is a checklist the
game can be measured against. This section is that measurement and the plan that follows from it.

### 19a. What we take, and what we leave

Most skills are for other engines (Godot, Unity, Unreal, Roblox, Bevy). Ten fit this game; its Phaser skill is
pinned to Phaser 4.2, the version we run (4.2.1).

| Skill | Why it fits |
|---|---|
| `phaser-core` | Our engine and version: scene lifecycle, loader, cameras, the Phaser 3 → 4 renames. |
| `game-feel` | Screen shake by decaying trauma, hit-stop, easing, feedback tiers. |
| `camera-systems` | Frame-rate-independent follow, deadzone, look-ahead, bounds. |
| `save-systems` | Versioned saves, migration, validation, a last-good backup. |
| `game-ui-ux` | Safe areas, scaling, controller focus, text size, menu stacks. |
| `audio-design` | Buses, slider curves, ducking, SFX variation, beat sync. |
| `performance-optimization` | Frame budget, profile first, pooling, no per-frame allocation. |
| `ai-behavior-trees-utility-ai` | Utility scoring with hysteresis for Echoes, shadows and the AI partner. |
| `create-game-assets` | Art direction brief, asset manifest, families, deterministic QA (scripts included). |
| `roblox-simulator-economy` | Written for Roblox, but its idle-economy formulas, pacing targets, offline rules and big-number display apply to the Watch as they stand. |

Left out: the router (it only picks among engines we do not use), every other engine's skills, and the genres and
workflows that do not match (FPS, card game, Steam). `rpg`, `procedural-gen` and `level-design` are kept in mind for
the Watch's tower and dungeons (§18k) but not installed until that phase.

**Installing them:** the ten folders go into `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex and the
others that read the shared path), copied from a pinned commit with the licence and `NOTICE` beside them, and named in
AGENTS.md so every assistant knows they are there. Updating them is a deliberate copy, never automatic.

### 19b. What the check found

Measured against the code as it stands on 7 November 2026.

**Already in line** (keep as is):
- Hit-stop holds the longest pending stop and resumes on real time (`World.hitstop`), which avoids the skill's
  overlapping-freeze bug; the Watch's `stopT` does the same.
- Offline progress earns about half the live rate with a 12-hour cap (§18k), inside the skill's 0.25–0.5 and
  8–12 h targets; a clock set back pays nothing.
- Effects, numbers and foes are pooled in the Watch and the Horde; `shadowBlur` is banned; quality steps down on load
  (`core/frameBudget.ts`).
- Safe areas: the Watch and the Horde now follow the inset and the true screen height (PR #112).
- Phaser 4 renames: tint fill, filters and `pixelArt` are already used the Phaser 4 way.

**Gaps**, each with the skill that names it:

| # | Gap | Skill | Where |
|---|---|---|---|
| G1 | **Big numbers roll over wrongly:** 999,950 shows "1000K" (should be "1.00M"), 999.9M shows "1000M", and 9,999 shows "10.00K". | simulator-economy | `src/game/watch/defs.ts` `fmt` |
| G2 | **Saves have no last-good copy.** `writeSave` overwrites the only copy; a failed write or a damaged save has nothing to fall back to, and nothing repairs NaN, Infinity or negative amounts on load. | save-systems, simulator-economy | `src/game/save.ts`, `migrateWatch` |
| G3 | **The camera's follow is frame-rate dependent.** `startFollow(…, 0.14, 0.12)` blends a fixed fraction each frame, so at 120 Hz it catches up about twice as fast as at 60 Hz: the feel changes with the phone's frame rate. | camera-systems | `src/scenes/World.ts` |
| G4 | **Volume sliders are linear amplitude.** Most of a slider's travel barely changes loudness; the drop is all at the bottom. | audio-design | `remnant/src/audio/audio.ts` `applyVolumes` |
| G5 | **Screen shake is random per frame** (Phaser's built-in shake, 32 calls), which buzzes rather than rolls, and each call site picks its own strength. | game-feel | World, Horde, Watch, bosses, classic layer |
| G6 | **No shared feedback tiers.** Hits, crits, kills, boss blows and abilities each choose their own shake, flash, pause and sparks, so the three modes feel different for the same weight of blow. | game-feel | same |
| G7 | **DOM menus cannot be driven by the controller.** The home screen and the Watch's and Horde's panels need a touch; the PS5 pad works only in the canvas game. | game-ui-ux | `src/game/home.ts`, `src/game/watch/ui.ts`, Horde cards |
| G8 | **No text-size option** for the small panel text (10–12 px in places). | game-ui-ux | Settings |
| G9 | **Per-tick allocation in the Watch:** `foes.filter(...)` and `sort` three times a tick and `watchStats` objects each tick, times three at ×3 speed. | performance-optimization | `src/scenes/Watch.ts` `tick` |
| G10 | **Echo, shadow and partner targeting is a chain of rules.** It works, but near-ties flip targets, and adding a consideration means another branch. | ai-behavior-trees-utility-ai | `remnant/src/game/echoes.ts` `chooseTarget`, `src/game/watch/shadows.ts`, `src/game/partner.ts` |
| G11 | **The art pipeline has no written art-direction brief or automatic QA.** `art/REQUESTS.md` and `manifest.json` exist, but nothing checks sizes, transparency, pivots and palette before art leaves `art/incoming/`. | create-game-assets | `remnant-phaser/art/` |
| G12 | **The Watch's pacing is unmeasured** against the skill's targets: early upgrades in seconds, and each Ascension only ×1.2–1.5 longer than the last. | simulator-economy | `src/game/watch/defs.ts` |

### 19c. The build order

One pull request per phase, each verified as the repo verifies everything (headless Chromium through `?debug`, a
production build, `tsc` clean). Phases 1–2 change how the game feels everywhere, so they come first.

1. **Phase 1: install the skills and fix what is plainly wrong** (small, safe). **BUILT** (G1, G2, G4; the skills in
   `.claude/skills/` and `.agents/skills/`).
   - Copy the ten skills into `.claude/skills/` and `.agents/skills/` with the licence and `NOTICE`; name them in
     AGENTS.md.
   - G1: `fmt` rounds first and steps up a suffix when the rounded value reaches 1000; a table of cases in
     `scripts/watch.mjs`.
   - G2: keep the previous save under a `.bak` key before each write; on load, fall back to it when the save does not
     parse; clean NaN, Infinity and negative amounts in `migrate` and `migrateWatch`. A test damages a save and
     checks the backup returns.
   - G4: square each volume slider before it becomes gain (the saved slider values stay as they are).
2. **Phase 2: one feel for every mode.**
   - G5: a trauma shake (0–1, shake = trauma², sampled noise, decays on its own) on a camera offset, respecting
     Settings → Screen shake; every `.shake()` call becomes `addTrauma(n)`.
   - G6: `feedback(tier, x, y)` with small, medium, large and huge tiers (shake, hit-stop, flash, sparks, haptics,
     sound) used by the main game, the Horde and the Watch alike; the per-site numbers move into one table.
   - G3: the camera follows with `1 − exp(−rate·dt)` smoothing, so 60 Hz and 120 Hz feel the same (a test measures
     the catch-up at both rates with `?fixedstep`).
3. **Phase 3: the Watch's economy, measured** (before §18k's daily quests build on it).
   - G12: a balance script after the skill's calculator prints the time to each upgrade level, gate and Ascension at
     the live rates; tune toward early upgrades in 3–10 s and Ascensions ×1.2–1.5 apart, and record the numbers here.
   - Then §18k's daily quests, streak and pity chests, built on the skill's rules (rewards from the save's own clock,
     odds shown for any random roll, nothing paid).
4. **Phase 4: allies that choose well.**
   - G10: utility scoring for Echoes, Watch shadows and the AI partner. Each consideration is 0–1 (distance, threat,
     the foe's health, the order given, the role), the current target gets a small bonus so it does not flip on a
     near-tie, and cooldowns survive a change of mind. Orders (Guard, Hunt, Flank, Hold, Focus) become weights, not
     branches.
5. **Phase 5: menus for every hand.**
   - G7: controller focus in the DOM menus (one focused control on open, the d-pad moves between neighbours, ✕ to press,
     ○ to go back), with a visible focus ring.
   - G8: Settings → Text size (100–150%) for the panels and cards.
6. **Phase 6: performance, measured first.**
   - Profile a production build at 120 Hz on the busiest scenes (a full Horde stage, the Watch at ×3, a Chapter XII
     boss), record the frame split, then fix what the profile shows. G9 is the first known case: reuse the Watch's
     lists instead of filtering and sorting each tick.
7. **Phase 7: art that holds together.**
   - G11: `art/ART_DIRECTION.md`, a brief written from the art the game already has (palette roles, outline, light
     direction, pixel density per asset type, pivots). Extend `manifest.json` entries with the skill's fields (state,
     size, pivot, licence, approval), and add its `asset_report.py` and `build_preview_sheet.py` to `art/tools/`, so
     every piece from `art/incoming/` is checked and seen on a contact sheet before it is used.
   - `art/REQUESTS.md` asks ChatGPT for families (one approved hero piece, then its siblings) rather than one-offs.

### 19d. What stays the same

Saves stay compatible: new fields are optional, and the backup key is new rather than a change to the old one. No
new runtime dependencies: the skills are documentation, and their two Python QA scripts run only in `art/tools/`.
Scripture, the story and the art style are untouched.

## 10. Questions for the owner

Answered: the archer stays **Tirzah**, and Wings of the Morning **shares** the Mantle's gauge.
