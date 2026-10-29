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
