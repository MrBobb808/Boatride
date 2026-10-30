# Remnant: Ascension on Phaser

The main game is built on **Phaser 4.2.1**. GitHub Pages serves the Phaser
build at https://mrbobb808.github.io/Boatride/ and `/Boatride/phaser/`.
The previous engine remains available at `/Boatride/classic/` as a fallback.
The repository root's Gangway app is unrelated and is not changed.

## Release checkpoint — 25 October 2026

| Part | Implemented behavior |
|---|---|
| 9 · Combat and loadout | Blade, spear and greatsword routes; fourth combo strike, delayed flurry, Storm, Comet, air routes, Phantom Step/Cross; all twelve Covenant abilities and persisted skill selection. |
| 10 · Powers | Shared executions, six weapon elements, power tiers, all five sub-weapons and four supers, Shadow Mantle transformation, pursuit and chain-impact teleport. Trumpet casts open authored cracked walls and seals in both terrain grids and preserve the opening. Native strikes earn mastery and equipment-set effects apply. |
| 11 · Story I | Original Chapters I–V scripts, illustrated dialogue, choices, NPCs, quests, relic and Echo tutorials, objective guide and persistent room changes. |
| 12 · Story II | Chapters VI–X, original cutscenes and boss callbacks, all ten chapter-end screens and the resume recap. |
| 13 · Audio | Shared generated score, effects, phase layers and recorded Suno songs; gesture unlock, settings, pause ducking and underwater muffle. |
| 14 · Menus and coaching | Complete original sixteen-page menu, including crafting, shops, map, quests, lore, bestiary, mastery, settings and remapping; controller navigation and coaching cards. |
| 15 · Swimming | Both flooded Chapter X rooms: directional swimming, currents, breath/drowning, air pockets, stroke, dash, thrust/parry and underwater presentation. |
| 16 · Modes | Shared Trial, Extreme Survival, seeded daily challenge, Gauntlet/Rush, contracts, blessings, rewards and results. Boards are local to the browser/device, as in the original. |
| 17 · Progression | Remnant's Rest, Trials of Valor, New Game+, boss difficulty; native Crowns use the same chapter curve, NG+ scaling and chapter XP catch-up. |
| 18 · Phone | Dynamic Island presentation, movable/resizable touch controls, handedness/opacity settings, live Auto/60 FPS pacing and shared haptics. DOM dialogue touches stay outside Phaser's pointer state. Physical iPhone performance and iOS audio-session behavior still need device validation. |
| 19 · Installed app | Existing main-app identity retained, hashed offline shell, on-demand song cache, build display, update checks on foreground/interval and save/resume at safe transitions. System reports offline readiness only after the controlling worker confirms the current build and scope. |
| 20 · Switch-over | Main Phaser artifact plus preview and isolated original fallback. Three-slot save migration, exact-stat comparison, original-worker upgrade, offline reload and cache-scope isolation are browser tested. |

These are implemented systems, not a claim that every possible campaign branch
or physical phone has been tested. The release checks exercise all authored room
loads, ten chapter openings/end cards, representative scripted sequences,
boss phases, menus, modes, swimming and the installed-app upgrade. An uninterrupted
human playthrough and sustained 120 Hz on a real iPhone remain acceptance work.

## Visual polish

Exploration, swimming, foes and projectiles retain the calmer 80% simulation clock.
Player attack, charge, cast and Phantom choreography advances 1.25 times faster,
restoring brisk combat while walking stays controlled. Attack lunges compensate
for the faster choreography; jump arcs and teleport destinations are retained.
Hit-stop is shorter on light blows and uses real time. Menus, audio, update checks
and active playtime use real time.

Combat feedback (`game/feedback.ts`) uses fixed pools: 28 damage numbers, impact
sparks and gold purification motes, so a hit adds no new objects. Numbers stack
instead of overlapping, crits pop larger with a "!", and heals, hits taken and
notes have their own look. A fallen foe lifts away as gold motes; an elite's fall
adds a light and a short slow-motion beat. Hit-stop goes by weight (light, combo
ender, heavy, crit, parry), and a lighter freeze never shortens a heavier one.
Ordinary hits leave the camera steady. Verified by `scripts/combat-feel.mjs`.

The first art drop's effects ship. Elior's swing plays the generated slash arcs (`assets/vfx-slashes.png`, V01): a light cut, a heavy cut, a rising launcher, or a spin for storm, flurry and cross. Hits, crits and perfect parries play the impact bursts (`assets/vfx-impacts.png`, V02), pooled in `game/visuals.ts`. The Covenant abilities play the drop's ability art (V03/V04, `ABILITY_ART` in `game/visuals.ts`): projectiles carry theirs, Shield of Faith holds while it lasts, and long effects stay dimmer so stacked casts don't blow out. Chain Snare keeps its drawn chain until its row is redone. Raw drops stay in `art/incoming/`. `art/tools/sheet.py` normalises an effect sheet, and `art/tools/parts.py` packs a character-parts sheet for `fighterRig.ts`.

### Playable fighters and action styles

Elior has three selectable styles: Vanguard permits a jump-cancel after a confirmed
hit (including renewed air routes); Wraith accelerates the dodge and its velocity
together, preserving travel and cooldown; Sentinel improves guarding and extends
the perfect-parry counter window. D–SSS style ranks reward varied landed moves and
parries, decay after idling and drop on damage. The meter grants no damage bonus.

Tirzah is a second playable bow wielder with an image-generated teal-and-gold
ranger sprite, dark braid, large ivory/gold recurve bow and dedicated idle, run,
jump, dodge, hurt, draw and release poses. Both fighters now use an ImageGen
parts sheet bound to the same 2D rig for movement and combat, with sixteen
distinct samples per clip. Sources, pivots and the exact prompt are documented
in `src/assets/FIGHTER_ANIMATION.md`.
Tap Strike for a quick arrow, hold Strike or Heavy for a
charged piercing shot (6 CE), or Up + Strike for a three-arrow spread (10 CE,
2.5 game-second cooldown). Aim assists toward visible foes ahead. Arrows use a
bounded pool and swept collisions against terrain and foes; they work underwater
at a reduced flight speed. Firing recovery accepts a buffered follow-up.

Use the bottom character button (or N) to tag between them, and KIT (or B to
cycle) for styles. Controller users can select Heroes & styles through the Echo
wheel; the wheel opens directly to the kit when there are no Echoes yet. Tags are
blocked during moves, hurt, death and story cinematics. Both fighters share health,
Energy, equipment, progression and story: changing character never heals or resets
cooldowns. Optional `playableHero`, `combatStyle` and `bestStyle` save fields keep
older journeys compatible and persist per slot.

Movement and combat bake the existing skeleton choreography into illustrated
Phaser atlases: breathing, alternating strides, jump/landing, guards, rolls,
swimming, wind-ups, cuts, launchers, spins and air moves. Footsteps follow actual
distance travelled; one-shot poses use local action clocks and repeatable
finisher timing. Bow drawing reaches full extension at the actual charged-shot
threshold; release relaxes the string and arrows start at its grip. Four pooled silhouettes
accent aerial/heavy moves and Wraith dodges; Low quality and Reduce flashes remove
them. Atlas frames and resource pools survive room transitions without growing;
individual fighter/projectile/trail objects dispose on room exit.
The same illustrated body and hand-aligned blade, spear or greatsword stay
visible across locomotion and combat. Logical 192-pixel frames leave room for
rotating polearms; tight packing with transparent gutters and Phaser trim
metadata avoids uploading empty space. Parts, atlases and form variants are
cached once, with no skeleton solving or canvas uploads in the game loop.
Routine damage and parries do not shake the camera. Major impacts use a small,
160 ms maximum shake with at least 900 ms between starts; Reduced/Off still apply.

Phaser's world camera has a small animated displacement map that distorts only
water cells or air just above volcanic hazards. The HUD has its own camera and
stays sharp. Elemental weapons tint their blade arcs, add a soft weapon light
and emit matching impact sparks. Shadow Mantle changes clothing and weapons to
violet while preserving facial features. Bounded smoke pools behind/in front of
the body, rising wisps, a violet crown and a soft backlight form an ethereal
silhouette. Smoke pauses with menus and clears on form end, death and room exit.
Low/Reduce flashes retain the core look while dropping foreground haze and motion
silhouettes. Authored rain, embers, ash and motes use depth layers.

Power tiers (from level 20) and the Mantle read as a soft additive light behind
the hero, never as an outline drawn over him; the Mantle keeps its violet rig,
cape, smoke and crown without the old solid wedge. Elior carries the original's
own light (90 units, 120 once the relic wakes, brighter while charging or in
Armor of Light / Lion's Courage), so dark rooms and arenas no longer swallow
him. Atlas frames are picked the way they were baked: loops wrap at sixteen
steps, one-shot moves land on their last pose. Coasting out of a lunge no longer
flashes a running frame.

The HUD keeps the fight clear: on keyboard and pad the skills sit in the
bottom-right corner (hidden in story scenes and until one is equipped); the
hero tag and action style are small chips under Elior's column, labelled with
their keys (N, B) on a keyboard; toasts stack below them; and the boss bar takes
the top lane on every device.

Boss introductions and phase changes receive gentle framing; combat framing
keeps Elior visible and responsive. Shared story pans, finishers and supers take
priority. Screen shake Off disables the extra framing; Reduced softens it.

Low quality removes GPU distortion and sprite filters and reduces particles.
Auto sheds these effects on sustained missed frames. Reduce flashes disables
distortion and softens glows. Canvas fallback retains light sprites and particles
without using GPU filters. Room changes, Trial sectors and returning to the title
dispose their effects and reset boss framing.

## Facing and finishers

- **Facing:**
  - Both heroes turn with the stick on every swing and shot, and during a bow's follow-through.
  - A held direction past an attack's cancel point leaves the swing, so turning and running never wait on a recovery.
  - With no direction held, a swing or shot turns to the nearest foe behind when there is none ahead (`Player.swingFacing`).
  - Verified by `scripts/facing.mjs`.
- **Finishers:** `World.finale` is for big moments only: a real shake, a slow-motion beat and a push in on the blow. Ordinary hits still never shake. It plays for:
  - Judgment Cross and the third Phantom strike;
  - a combo finisher that fells its foe;
  - an execution;
  - Tirzah's finishing back arrow.
- **Tirzah's crits:**
  - Her arrows crit like Elior's blows.
  - Under the Wings, a critical arrow carries her behind the foe on her own (a 1.2 s cooldown). Her finishing arrow there fells any non-boss foe below 40% health.
  - Verified by `scripts/combat-feel.mjs` and `scripts/archer.mjs`.

## Effects as art

The classic effects' shapes are drawn from the art drop instead of lines and circles:
- **Classic primitives** (`src/game/artFx.ts`, installed by the classic layer): every `fx.ring` is V02's ring of light, `fx.column` V03's pillar, `fx.slash` V01's arc, and `fx.streak` a baked trail of light. Each is tinted to the colour asked for (dark colours draw normally, bright ones add light), from a pool of 40.
- **Status overlays:** burning, frozen and bleeding foes wear V07's looping overlays (`ArtFx.statuses`; off on Low quality).
- **Arrows:** Tirzah's arrows are C06 sprites, by kind and weapon element, and stay a moment where they strike a wall.
- **Elior's glows:** charge, guard, parry, armour, Lion and mending glows use V02 frames (`Player.glow`). The Shield of Faith's own art holds while it lasts.
- **Fallen Crown telegraphs:** glints, closing floor rings, eruption and spore pillars and Azkar's sweep and armour are art (`Boss.telegraph`, `Boss.pillar`). His fire waves are V07's flames.

## Tirzah's Wings of the Morning

When Tirzah is the active hero, the transformation gauge and button give her **Wings of the Morning** (Psalm 139:9) instead of the Shadow Mantle. It's the same gauge, button and timer (`Player.mantleT`).
- **Look:** she takes a dawn palette (`fighterRig.ts`) and wears wings of light (V06), and her transformation plays its own forming art.
- **Dawnstep** (`game/dawn.ts`):
  - Any arrow that lands arms its foe for 0.6 s.
  - Dodge then blinks her behind the foe, but only onto floor she can stand on, with a line of sight; otherwise she stays put. She looses a guard-breaking back arrow.
  - Three in a chain (within 2.4 s each) end in Morning Star, a ring of twelve light arrows.
- **While transformed:** holding Jump glides, charged shots are free, and her arrows leave dawn trails. Her blows add the light element instead of shadow.
- **When the form ends,** light falls on every foe she struck during it.
- **Elior's Shadow Mantle is unchanged.**
- **Verified by** `scripts/archer.mjs`.

## Tirzah's craft

Her own way to fight (POLISH_PLAN §5c), all in `src/game/bow.ts`:
- **True Aim:** shots that land 110–230 px out deal ×1.25. A tick marks the sweet spot while she draws.
- **Embedded arrows and Recall:** an arrow that stops in a foe stays there (up to eight, C06 art). Down + Heavy tears them all back out through their foes and home, hitting what's in the way; more arrows rip harder.
- **Precision:** holding Up while drawing aims at the head. A head shot from range always crits and staggers a little more.
- **Shooting things down:** her arrows destroy enemy arrows, orbs, drops, flames, bolts and debris (`World.enemyShots`). An arrow into a foe's wind-up (its telegraph glint, or a sprite foe's anticipation frame) interrupts the attack: her version of a parry.
- **Evasive shots:**
  - Dodge then Strike: a backflip shot.
  - Down + Strike in the air: a diving arrow that spikes foes down and hops her up.
  - Drawing in the air slows her fall to 110 px/s.
- **Bow-bash:** Strike with a foe at arm's length bashes it back, and the next shot lands point-blank (×1.4).
- **Pinning:** a charged arrow that drives a foe into a wall pins it for about a second.
- Verified by `scripts/archer-craft.mjs`.

## Tirzah's abilities and arrows

- **Her own loadout:** while she fights, the three skill buttons are hers (`skillSlots` reads `archerSkills`). She equips them from the Echo wheel → Heroes → "Tirzah's abilities"; when all three are full, a new one takes the third slot.
- **Unlocks:** each ability opens at a level of the shared journey. `syncArcher` (run from `World.refreshStats`) puts newly reached ones into empty slots and records them in `archerKnown`.
- **The six** (catalog in `abilities.ts`, effects in `archerKit.ts`):

  | Ability | Level | What it does |
  |---|---|---|
  | Arrow of Deliverance (2 Kings 13:17) | 1 | Pierces the whole line, knocks foes down, breaks guards. |
  | Jonathan's Volley (1 Samuel 20:20) | 6 | Three arrows plant past the foes and burst back from behind. |
  | Hunter's Mark | 10 | 8 s: her arrows curve to the foe, it takes ×1.25 from her, and the Echoes turn on it. |
  | Rain of Arrows | 16 | Arrows fall over the ground ahead for 2.5 s. |
  | Watchman's Eye (Ezekiel 33:7) | 22 | 2 s of slowed time, glowing weak points, and three precision shots. |
  | Quiver of the Mighty (Psalm 127:4) | 30 | 10 s of every shot splitting in three. |
- **Arrow types:** standard, then fire (level 8), frost (12), storm (18) and holy (24) join the quiver (`quiver`). Down + Sub, or the wheel's "Arrows" item, nocks the next one (`arrowType`). A nocked type replaces the weapon's element on her hits and picks its C06 art.
- **Save fields:** `archerSkills`, `archerKnown`, `quiver` and `arrowType` are all optional and are checked on load.
- Verified by `scripts/archer-kit.mjs`.

## Arrows, icons, the Wings jab and the Perfect Draw

- **Arrows in flight** (`Bow.drawArrow`):
  - each flexes as it leaves the string;
  - charged, perfect and ability arrows pulse;
  - a streak of the arrow's colour trails it, and sparks shed from the fletching (embers rise from fire, frost drifts);
  - releases flash in the arrow's colour, and impacts spark in it too.
- **Struck arrows:** arrows stuck in foes or walls quiver a moment before they settle.
- **Ability icons:** every ability, Elior's twelve and Tirzah's six, has its own 16x16 pixel icon (`src/game/abilityIcons.ts`), shown on the touch buttons and on the keyboard and pad skill bar.
- **The Wings jab:** under the Wings, her arrows crit 20% more often (`Bow.wingsCrit`). A critical arrow carries her behind the foe, where she drives her dagger into its back (`Dawn.stepJab`). The stab:
  - is a guard-breaking critical hit;
  - fells non-boss foes below 40% health;
  - comes with the finisher's shake, slow motion and push in.
- **Perfect Draw:** releasing a held draw between 0.62 and 0.8 s (a gold glint marks the window) looses a perfect shot. It is free, 25% faster and always a crit, so under the Wings it also brings the jab.

## Tirzah's own progression

Tirzah levels, spends points and wears gear of her own (`src/game/archer.ts`, saved in the shared optional `SaveData.archer`, an `ArcherSave`).

- **Level and experience:** the hero fighting earns full experience and the one waiting half (`World.giveXp`). Each of her levels brings 3 stat points and a skill point, as Elior's do. Her abilities (1/6/10/16/22/30), arrow types and the Wings (25) open at her level; the HUD's level badge (edged green) and experience bar show the fighter's.
- **Her numbers:** `archerStats` runs the original's `derive()` over her level, stats and gear, with no weapon mastery and none of Elior's tree, then applies her own tree. Echo slots and strength, Super charge and prices stay Elior's. `World.eliorD` holds his stats (the original's modules read and replace them as `G.d`); `World.d` is the fighting hero's, worked out again whenever his change. A switch keeps the share of health left.
- **Her gear:** seven slots of her own (`ARCHER_SLOTS` in the shared `data.ts`): bow, quiver, dagger, hood, garb, amulet, charm. Her items share the inventory but only her slots take them; the store treats what she wears as equipped (`isWorn`). Her bow's element is her arrows' unless she has nocked another type. There are 27 items. Two are keepsakes, won once and never dropped: Ehud's Blade (Judges 3:16) from the Crimson Marshal and the Bow of Jonathan (1 Samuel 18:4) from the prince of Persia (`ARCHER_KEEPSAKES`). The Quiver of the Mighty carries Psalm 127:4-5.
- **Drops:** 30% of a foe's or elite's gear is hers while Elior fights, and 55% while she does (`World.gearDrop`). Every boss leaves her a piece two rarities above the chapter (`bossSpoils`). Her drops carry a Power that grows with her level (`archerLootPower`), so a bow found late keeps up.
- **Under way:** a journey saved before this gets Tirzah at Elior's level, with his stats as allocated, his unspent points, a skill point for every level and a kit whose main stats match what he wears (the Power found for each piece). A new journey starts her at level 1 with a plain kit.
- **Her skill tree** (19 nodes, three branches, capstones need both roots):

| Branch | Nodes |
|---|---|
| Marksman | Steady Draw (+8% damage a rank), Long Sight (True Aim 90–270 px, ×1.45), Hawk's Eye (crit), Patient String (wider Perfect window, +1 pierce), Headhunter (head shots +35%), Twin String (a full draw looses a second arrow) |
| Huntress | Keen Dagger (dagger and bash +10% a rank), Fleet-Footed (speed), Dawn Wings (+1.5 s a rank), Shadowstep (a shot just after a dodge crits), Dawn Jab (×1.4, fells below 55%), Night Huntress (Wings crit +15%, a jab kill returns 15% of the gauge) |
| Warden | Vigor (health), Tanned Hide (damage taken), Swift Recall (+60%, mends 1% an arrow), Quiet Focus (ability power and energy), Deep Quiver (abilities recharge 15% faster), Elemental Fletching (+25%), Covenant Archer (abilities cost 25% less, their arrows +30%) |

- **The pause menu** gains a Tirzah section (Character, Equipment, Skill tree, Abilities), added through the shared menu's `addMenuSection` hook (`src/game/tirzahMenu.ts`); the original edition adds none.

Verified by `scripts/tirzah-progression.mjs`.

## Tirzah's dagger, the back-stab, motion and the button art

- **The dagger** (`Bow.stepDagger`): Strike with a foe at arm's length draws her dagger instead of the bow. Strike again before each blow ends for the next:
  - two quick cuts (`dagger1`, `dagger2`), each stepping in without passing through the foe;
  - a kick (`dagger3`) that knocks it back into bow range and makes the next shot point-blank (×1.4).
  - Strike during the kick goes straight into a draw. From range, Strike still shoots.
  - Her tree's Keen Dagger strengthens all three. The bow rides on her back while the dagger works (`FighterRig.draw`).
- **The Wings' back-stab** (`Dawn.stepJab`): a critical arrow under the Wings carries her behind the foe. Her dagger goes into its back (the guard-breaking, finishing blow described above, now with her dagger pose and a V01 cut), then she looses an arrow on through it (`Bow.backShot`) and carries on.
- **Motion, both heroes** (`Player.draw`): a spring of squash and stretch (stretch on take-off, squash on landing scaled by the fall, a stretch into a dodge or dash), a lean into ground speed, and a slight tip with the rise and fall. All of it is per-frame arithmetic, with no allocation.
- **Button art** (`src/game/actionIcons.ts`): every touch action button wears a 16x16 pixel picture, painted like the ability icons:
  - Strike is his sword or her drawn bow, by who fights;
  - Jump is a winged boot, Dodge a dash, Parry a shield turning a blade, Balm the flask;
  - Echoes is a cleansed imprint, Switch two heroes turning about;
  - the transformation is the Mantle's hood or the Wings of the Morning;
  - Super is a burst of light, and the sub-weapon a thrown axe.

Verified by `scripts/tirzah-dagger.mjs`.

## Dramatic lighting

POLISH_PLAN §11b; the owner chose dramatic.

- **Settings → Lighting** (shared `settings.lighting`: dramatic by default, balanced, subtle) changes how dark a dim room goes, through `lightingLevel` in the shared `render/lighting.ts`. Dramatic deepens rooms that are already dim (×1.45 + 0.06, at most 0.92). Daylight (darkness under 0.15) is left alone.
- **More lights, gathered each frame** (`World.gatherLights`, called by the classic layer after the room's lights and Elior's own):
  - Tirzah's own light;
  - the Mantle (violet) and the Wings (gold), wide;
  - every arrow in flight, in its element's colour;
  - the partner and the Echoes;
  - a faint dull glow on every foe, so threats stay readable in the dark;
  - short flashes (`World.flashLight`) on crits and heavy blows, ability casts and finishers.

Verified by `scripts/lighting.mjs`, which reads the darkness layer's pixels.

## Weather and ambience

POLISH_PLAN §11c. `src/game/atmosphere.ts` adds each place's mood on top of the original's particle weather (`Visuals.applyQuality`). It is presentation only: `Visuals` owns it, rebuilds it with the quality tier, steps it and holds it still while a menu is open. `moods(room)` picks the layers from the room's biome and weather:

- **Storm** (rooms with `weather: 'rain'`: the storm ziggurat and the Chittim coast): rain splashes on whatever floor is in view, and lightning every 4–11 s. A bolt is drawn into the room's back canvas between the sky and the far silhouettes (`Atmosphere.sky`, called from `RoomArt.render`), the sky flashes, the room's darkness lifts (`Atmosphere.lights`, gathered with the others) and the thunder follows after a delay. Reduce flashes dims all of it.
- **Ash** (the Ashen Village and Cinders): tumbling flakes behind and in front of the fight.
- **Embers** (the village, the sanctuary, the furnace and Cinders): gusts blown across the view from the windward side, and strays between them.
- **Fog** (the Valley of Bones, the Hunt and the Pestilence, tinted for each): two banks of a baked fog band, one behind the fight and one low in front, drifting with the wind and sinking away as the view climbs.
- **Light shafts** (temple, sanctum, tower, palace, Shushan and sanctuary interiors, and the Rest): two to five slanted shafts from the ceiling (or the sky) to the floor, with motes drifting through them and a pool of light where each lands.

The textures (`atmo-fog`, `atmo-beam`, `atmo-flake`) are baked once. Low quality keeps fewer particles and no front fog or motes. Verified by `scripts/atmosphere.mjs`.

## Screen effects

POLISH_PLAN §11d. `src/game/screenFx.ts` puts Phaser 4 filters on the main camera (external list, after the heat and water displacement); `Visuals` owns and steps it.

- **Bloom** (`Phaser.Actions.AddEffectBloom`) is a full-screen blur, so it runs only in bright moments, and only at the top quality tier: while the Mantle or the Wings are on, and briefly on lightning and big flashes (`World.flashLight` with a radius of 160 or more). At rest and in scripted scenes it is off.
- **A colour grade per place** (`GRADES`, by biome, worked out once as the room loads). The place's grade, the cinema and the water are one colour-matrix pass: three matrices built as the room loads (with a true contrast about middle grey; Phaser's own `contrast` divides its offset away) and blended without allocating. The grades are gentle: the cold of the Hunt's snow, the heat of the furnace and Cinders, the teal of the storm coast, the pale bone of the valley, and so on.
- **Underwater**, a blue-green cast and a closing vignette ease in while the hero is submerged. The vignette runs only then and under the letterbox, so the resting frame costs one extra pass. The existing water and heat displacement still ripple and shimmer.
- **Cinematic moments:** while the letterbox is in (`Hud.letterbox`: a boss's entrance, a Super) or a boss intro holds the camera, the effects add a harder grade, a deeper vignette and film grain (a baked noise tile at depth 19.6), easing back out after.

Reduce flashes softens the bloom and the grain. Without WebGL only the grain remains. A software renderer (SwiftShader, llvmpipe: no GPU) keeps none of it, because full-screen passes are what such a renderer cannot afford; `?fx` in the URL keeps them on, which `scripts/screen-fx.mjs` uses. Verified by `scripts/screen-fx.mjs`.

## The AI partner hero

The hero you are not playing can fight beside you (`src/game/partner.ts`, POLISH_PLAN §11a).

- **Calling it:** the command wheel's "Call Tirzah" / "Call Elior", or Heroes → Partner. It is off by default, and `save.partnerOut` remembers it across doors and reloads.
- **What it is:** a `PartnerUnit` is an Echo underneath, so footing, chasing, being struck and falling come from `EchoUnit`.
  - It uses the partner hero's own numbers through the shared `power()` and `maxHealth()` hooks: Elior's derived stats, or Tirzah's from her level, gear and tree.
  - It fights aggressively whatever stance the Echoes keep.
  - It is drawn as that hero from the player's own action atlases: Tirzah draws and looses, Elior swings, both run and jump. A slim health bar in its colour sits above it.
- **The partner or the Echoes:** calling one sends the other back.
- **Switching heroes** swaps who the partner is, where it stood.
- **Falling:** it returns after 20 s. Once a room it pulls you up at 35% health instead of letting you fall (`WorldApi.partnerRevive`, `Player.die`).
- **Joint finisher:** your finisher on a foe within reach brings it beside you to strike the same foe ("TOGETHER").
- **Banter:** playful rivalry over kills now and then.
- **XP:** the partner keeps its own level and gear and earns the waiting hero's half of the experience.

Verified by `scripts/partner.mjs`.

## Fixes after the owner's play

- **No uncalled shadow Echoes:** kills in the Shadow Mantle or the Sovereign form, and the Arise finisher, raised slain foes as 30-second shadow Echoes. `riseAsShadow` now does that only with Settings → Shadow allies on (`settings.shadowAllies`, off by default).
- **The dagger, reliably:** a Strike pressed during a shot's follow-through used to queue another arrow even with a foe at arm's length. Now it draws the dagger. The dagger reaches 40 px past a foe's edge (`REACH`), with a quicker step in, and its blows land over the same reach.
- **Version:** `postbuild.mjs` stamps a readable version (UTC build time, YYYY.MM.DD.HHMM) beside the build id, in the page and in `version.json`. The title screen shows it and checks the site: up to date, offline, or the newer version ready under Settings → Check for updates. Settings → Save & system shows it above the build id.

Verified by `scripts/tirzah-dagger.mjs` (the queued and longer-reach dagger).

## The pack

Whatever Ilan's store sells to be used later now waits in the pack (`SaveData.pack`, the shared `game/economy.ts` `PACK`, `stow` and `usePack`). That covers elixirs, Balm vials, tomes and the Sealed Satchel. Brewed elixirs go there too.

- **Pack → Items** drinks, uses, reads or opens them. A tome can be read as Elior or as Tirzah. Materials and keepsakes are listed below.
- **Pack → Gear** lists every piece for Elior or Tirzah, with Equip; it opens on the hero in play.
- **Opening the menu while Tirzah fights** turns Elior's Character, Equipment and Skills into hers (`Hud.togglePause`, `menuTab`).
- **The Balm cap** counts vials waiting in the pack, and so does the next vial's price.

Verified by `scripts/economy.mjs` and `scripts/tirzah-progression.mjs`.

## Choosing an Echo, and the bond

- **Called, never automatic:** Echoes appear only when called. Once out (`flags.army_out === true`) they follow through doors until dismissed. A new purification, a story banner or a level-up never summons them.
- **Choosing:** the command wheel's Summon page has Choose one… (`Hud.openWheel('choose')`): every Echo, strongest first, eight to a page. The Echoes page has Fight beside me. Either one calls `leadEcho` (shared `game/state.ts`): the chosen Echo heads the lineup and the "One" summon calls it out alone (`Squad.choose`).
- **The bond** (`echoBond`): one Echo alone fights with the covenant's whole bond, +80% attack and +50% health. As one of two it has half that; in a larger line, none. The Echo page shows it.
- **Stronger Echoes overall** (`echoAtk`, `echoMaxHp`, shared): more of the hero's attack carries over, they grow more per level and per stage, and their base health and damage are higher. `scripts/power-walls.test.mjs` still holds.

Verified by `scripts/echo-bond.mjs`.

## The archer's sounds

All generated in code, in the shared `remnant/src/audio/audio.ts` (new effects only; existing ones are unchanged). `WorldApi.playEffect(name, { x, vol, pitch })` pans each by where it happens on screen.

| Moment | Sound |
|---|---|
| Drawing | `bowCreak`: the string creaks every 0.17 s, its pitch and volume rising with the pull. |
| Perfect Draw window | `perfectChime`: a bright chime. |
| Release | `bowRelease`, its pitch varied so repeats differ. A charged or perfect shot adds `bowCrack` and an `arrowWhistle`. |
| Impacts | `arrowPierce` through a foe (louder on a crit); `arrowThunk` into a wall. |
| Recall | `arrowRecall`: a reversed rush. |
| The Wings jab | `dawnJab`: a rushing blink and a bell of light. |
| The Wings forming | `wingsForm`: a rising chord. Elior's Mantle keeps `transform`. |

Her six abilities each have a signature sound:

| Ability | Sound |
|---|---|
| Arrow of Deliverance | `deliverance` |
| Jonathan's Volley | `volleyPlant` |
| Hunter's Mark | `markLock` |
| Rain of Arrows | `arrowRain`, renewed while it falls |
| Watchman's Eye | `watchEye` |
| Quiver of the Mighty | `quiverMight` |

Verified by `scripts/sound-pass.mjs`, which records every effect asked of the engine.

## Store and economy

The store is the original's own shop, rebuilt in shared code (`remnant/src/game/economy.ts`, `game/elixirs.ts` and the shop screens in `ui/menus.ts`), so both editions have it.

- **Where:** Ilan's stall, plus a Store tab under Elior in the pause menu. The tab works anywhere except mid-fight, during a boss, a cutscene or the Trial.
- **What's for sale:** the stock turns over at local midnight.
  - Three featured curios, bought with silver plus Relic Shards and scaled to the chapter.
  - Supplies and Balm vials (up to six).
  - Five elixirs, each lasting five minutes of play.
  - The classic gear, and the Rest's caravans when you're at the Rest.
  - The Tome of Insight and the Codex of Discipline, once per chapter each.
  - Five dyed capes.
  - The Sealed Satchel.
- **Selling:**
  - Every sale pays silver and salvage. Rare gear and up needs a second press, and Epic gear and up also yields Relic Shards.
  - Locked items, equipped gear and keepsakes are never offered for sale.
  - Sell all junk and buyback of the last ten sales are on the Sell page.
- **Dov:** dismantles gear for double salvage and no silver. He also fuses Relic Shards and brews elixirs from salvage.
- **Capes:** the cape colour worn from Valor is dyed into Elior's sprite sheet when it is baked, once per colour (`fighterRig.ts`, `dyeCape`).
- **Saves:** the new fields `locked`, `store` and `elixir` are optional.
- **Verified by** `scripts/economy.mjs`.

## Architecture

Phaser owns application scenes, timing, input integration, camera, native player,
Arcade terrain collision, Crown bosses, HUD and texture presentation. The original
story, quests, foes, Echoes, older bosses and many effects remain shared modules,
with `src/classic` adapting their engine services to the Phaser world. They do not
run a second application loop. Authored biome art, props, lighting and shared
actors render into Phaser CanvasTextures; the native player and Crowns use
Phaser sprites. This is a Phaser application with reused gameplay/rendering
modules, not a claim that every actor has been rewritten as an Arcade body.

Vite aliases redirect the shared modules' context, input, settings, save, app,
audio, music, update and boss-HUD services. `RoomArt` renders cached original room
layers; edits invalidate those layers and update the native collision grid.
Shared `G.d` assignments update the native hero's stat limits immediately.

## Saves and fallback

- Original keys `remnant-save-0` through `remnant-save-2` are never modified by
  Phaser. On the main URL only, the one-time `remnant-phaser.main-cutover.v1`
  migration copies valid original slots, last-slot selection and preferences.
- Phaser slot zero retains `remnant-phaser.save.v2`; slots one/two use
  `remnant-phaser.save.slot1` / `slot2`. All contain compatible V1 SaveData.
- A displaced preview journey is saved under
  `remnant-phaser.before-cutover.slotN`. System → Earlier Phaser journeys can
  restore it, backing up the displaced current slot under
  `remnant-phaser.before-preview-restore.slotN` first.
- The preview and main share Phaser progress on the same origin. The original
  fallback keeps its separate original progress; new Phaser progress does not
  automatically synchronize back. Portable save codes remain available.
- Main, preview and fallback workers have separate shell scopes/cache prefixes.
  Offline navigation reads only its own shell. Visiting one edition cannot
  evict or substitute another edition's cached document.
- Phaser shell installation and navigation caching reject a document without
  the Phaser build marker. Cached-file presence alone does not establish
  offline readiness; System waits for the controlling worker's acknowledgment.
  Startup explicitly checks the worker for updates, including immediately
  after the original edition's worker was registered.
- Previously cached main-app recordings are reused on upgrade. Recorded songs
  cache as heard; an unheard song needs network access and falls
  back to the generated score when unavailable. This is not an all-song download.

## Build and verification

Run `npm ci && npm run build` in both `remnant` and `remnant-phaser`. Builds
include TypeScript checks. Run Phaser browser scripts from `remnant-phaser`:

| Scripts | Checks |
|---|---|
| `smoke`, `combat`, `combat-moves`, `powers` | All room loads/exits, native movement, strikes, defense, weapon routes, twelve skills, powers and mastery. |
| `foes`, `echoes`, `bosses`, `classic-bosses` | Foe types, squad actions, native Crown phases and the original boss encounters. |
| `saves`, `menu` | Compatible saves, gear/stats, imports, complete menu actions and phone input. |
| `journey`, `story-flow` | Ten chapter openings, menu pages, collapse, relic, purification, end cards, Crown rewards, Rest and recap. |
| `modes-water`, `phone-progress` | Flooded rooms, mode entry/results/boards, contract restrictions, Island/editor/haptics, slots, NG+ and scaling. |
| `pacing`, `action-kit` | 60/120 Hz movement and shared timing, steady ordinary-hit camera, animated melee/jump-cancel, real ranged damage, shot costs, wall blocking, saved fighter/styles, phone tag and rotation. |
| `visuals` | Six elemental weapons, Mantle glow, animated water/heat distortion, quality/accessibility controls, weather layers, camera hand-off, Trial/room cleanup, title/Continue and Canvas fallback. |
| `animation-motion` | Actual 60/120 Hz playback for both heroes, distinct stride poses, stable foot origins, idle, jump/landing, full dodge, guard, bow charge/release, local clocks, repeated finishers and paused animation. |
| `equipment-visuals` | Actual weapon pixels across 112 poses per family; movement/facing, combat margin, real purple transformation, smoke/crown, tagged archer, pause/quality/reduced flashes, death/room cleanup and Canvas fallback. |
| `install-audio` | Audio decks, settings, offline shell and update recovery; run alone because it temporarily changes the served version probe. |
| `cutover` | Original installed worker upgrade, three slots and exact derived stats, cache isolation, offline persistence and preview recovery. Requires assembled Pages artifact. |

Each name above is `node scripts/NAME.mjs`; install Playwright Chromium first.
After both builds, run `node remnant-phaser/scripts/assemble-pages.mjs` from the
repository root. It creates `remnant/dist-pages` without mutating either source
build; then run `cutover` from `remnant-phaser`. CI runs both editions' checks
in parallel, then verifies the assembled upgrade and deploys that artifact from the default branch only.

Keep the original SaveData shape, KJV quotations, authored story and performance
rules in `../AGENTS.md`. Avoid per-frame allocations and `shadowBlur`. Shared
module edits affect both builds, so verify both. CI failure blocks deployment;
check Pages' actual version after a successful run before calling a release live.

## The Chapter I metroidvania pilot

POLISH_PLAN §12c. `src/game/pilot.ts` patches the shared Chapter I rooms once at startup (`patchChapterOne`, from `main.ts`) for this build only; the original edition keeps its own Chapter I.

- **The loop:** the crypt's west end now opens into the cistern's east end. The passage is barred (`BARS`, flag `crypt_bar`):
  - `barTiles` fills it with stone as the room loads;
  - `barProps` draws the iron bars and, on the crypt side only, a "Lift the bar" lever.
  - From the cistern a hint says it is barred from the far side. Once it is lifted, the Eagle Plume's dead end at the crypt's west end is a way back up through the cistern and its well to the village square.
- **Ledges for the Eagle Plume** (a single jump climbs about 62 px, the second jump adds about 50):
  - a loft over the village square, 5 tiles above its highest ledge;
  - a rooftop over the Ashen Road, 5 tiles above the long ledge.

  Each has a secret chest, and a hint shows until the Plume is found.
- **A far rooftop for the second jump and an air dash together:** a running double jump returns to its height about 1.5 tiles short. With an air dash at the top it carries about 2 tiles onto it (at 60 fps). It has the best reward.
- **`?fixedstep`** (with `?debug`, for tests): every frame advances the game and the physics by exactly 1/60 s, so jump and dash distances measure as on a 60 fps phone however slow the headless frames are. Without it, a slow frame stretches timed moves like the air dash, because the game's timers run on capped time and the physics on real time.

Verified by `scripts/ch1-pilot.mjs`.

