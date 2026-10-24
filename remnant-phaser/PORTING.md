# Remnant: Ascension on Phaser: the port

The game is being rebuilt on **Phaser 4** (`phaser@4.2.1`) in this folder,
one system at a time. The original engine-free build in `../remnant` stays the
live game at https://mrbobb808.github.io/Boatride/ until this one reaches parity.
Merging into the default branch publishes the Phaser build beside it at
**https://mrbobb808.github.io/Boatride/phaser/**, so each part can be played on
the iPhone as it lands.

## Release checkpoint — 24 October 2026

Parts 3–8 (PRs #39–#44) have been merged. This release adds **Part 9**
(weapon combo routes, Phantom Step, all twelve Covenant abilities and the
saved loadout), **Part 13** (the generated score, effects and recorded songs),
the **boss difficulty setting** from Part 17, and **Part 19** (installation,
offline shell, cached songs and a save-preserving update button).

The original game remains at `/Boatride/`; the playable migration stays at
`/Boatride/phaser/` until parity is verified. An existing Home Screen icon for
the original still opens the original. Open the Phaser URL in Safari and add
that page to the Home Screen to install the current Phaser edition. The title
and System menu show its build identifier. The title's live-slot import
copies progress; it does not overwrite the original save.

### Remaining release batches

| Part | Status | Work / completion check |
|---|---|---|
| 9 · Combat moves and Covenant loadout | Done for the listed routes | Shared blade/spear/greatsword definitions; Relentless fourth strike; delayed flurry, Storm, dash/Comet, launcher, air combo/Rend/plunge, Phantom Step/Cross; all 12 abilities, unlock rules and saved slot swaps. |
| 10 · Finishers, elements, power visuals, Shadow Mantle | Implemented | Shared stagger executions and kill cams, all six element procs, tier waves/auras, level-25 transformation, pursuit, chain throw/impact teleport, sub-weapons and all four selectable supers. Native hero art uses sheet poses with pooled afterimages. |
| 11 · Story I (I–V) | Pending | Real NPCs and portraits, dialogue, quest stages, pickups, story triggers, objective guide; walk each campaign without debug warps. |
| 12 · Story II (VI–X) | Pending | Later story/cutscenes, chapter-end screens and resume recap; verify all transitions and persistent flags. |
| 13 · Audio | Done | Shared Web Audio engine, score/phase layers, recorded-song decks, missing-song fallback, menu ducking, audio settings and gesture unlock. Actual iOS audio-session behaviour still needs a device check. |
| 14 · Remaining menus and coaching | Partial | Ability picker, move list, audio and challenge settings are in. Quests, lore, bestiary, map, crafting, shops, remaining controls/settings and coaching remain. |
| 15 · Swimming | Pending | Water preparation, currents, breath, dash-stroke and underwater rendering/audio; flooded Chapter X route must be completable. |
| 16 · Modes and boards | Pending | Trial of the Remnant, Extreme Survival, daily seed, Gauntlet/Rush, rewards, death/results and leaderboard storage. |
| 17 · Rest, Valor, NG+, difficulty | Partial | Normal/Hard/Merciless apply to both boss implementations. Settlement growth, trophies/Valor and NG+ remain. |
| 18 · Phone polish | Pending | Island HUD, draggable/resizable layout, haptics and a device-performance pass. Existing touch controls are not this full polish pass. |
| 19 · Install / offline / updates | Done | Distinct scoped manifest/icon, complete hashed shell precache, songs cached as heard, fresh version probe, save and resume on update. |
| 20 · Switch-over | Pending | Side-by-side acceptance on real saves; complete campaigns and every mode; phone/controller checks; then make Phaser the default while preserving a rollback route. |
| Visual parity | Pending | Original biome art, props, weather, lighting and NPC presentation. Shared actors still render through the documented Canvas texture adapter on Phaser. |

Every later batch must update this table, pass the relevant browser checks,
merge and verify the deployed build at `/phaser/`. Do not switch the main URL
merely because the Phaser application boots.

## How it is built

- `npm install`, then `npm run dev` (port 5174) or `npm run build` (writes `dist/`).
- `node scripts/smoke.mjs`, `node scripts/combat.mjs`, `node scripts/foes.mjs`,
  `node scripts/echoes.mjs`,
  `node scripts/saves.mjs`, `node scripts/bosses.mjs` and
  `node scripts/classic-bosses.mjs`, `node scripts/menu.mjs` play the build in headless Chromium (after a build). CI runs them on every push
  (`.github/workflows/remnant-pages.yml`).
- `node scripts/combat-moves.mjs` checks the added combo routes, all twelve
  abilities, loadout persistence, paused spell simulation and phone casting.
- `node scripts/powers.mjs` checks real executions, elemental statuses, five sub-weapons, four supers and Mantle throw/teleport on the native hero.
- `node scripts/install-audio.mjs` checks the audio graph/song layer, settings,
  difficulty, a complete offline reload and a save-preserving update.
- `?debug` exposes `window.__remnant` (`world`, `controls`, `warp(room, spawn)`,
  `give(xp)`, `rooms`). Add `&autostart` to skip the title and `&fresh` for a new
  journey. `?boxes` draws the physics bodies.
- **Shared data.** Engine-free modules are imported from `../remnant/src`
  through `src/shared.ts`: room layouts (`game/rooms*.ts`, `fallenChapters.ts`,
  `restRoom.ts`), the tile legend (`game/tiles.ts`), `game/data.ts` and the PNG
  sprite sheets in `src/assets`. A room or item fixed there is fixed in both
  builds. When the old engine is retired, these move into this folder.
- **Saves.** This build's save is the original's own `SaveData`
  (`game/state.ts`), kept under `remnant-phaser.save.v2` so it never touches
  progress in the live game. The title can bring a live slot over: both builds
  are served from the same origin, so the live slots (`remnant-save-0..2`) are
  in this browser's storage; they are copied, never changed. A save from parts
  1–5 (`remnant-phaser.save.v1`) is carried over on first load.
- **Screen.** The canvas is sized in device pixels and shown at CSS size, so it
  stays sharp on Retina screens. The world camera shows 300 world pixels of
  height, as the original does. The HUD scales like the original's `u`.
- The live game's service worker ignores `/phaser/`, so the two never share a
  cache.
- **The classic layer** (`src/classic`). The original's bosses and foes run on
  Phaser unchanged: their modules are imported from `../remnant/src`, and when
  one of them imports an engine service (`game/ctx.ts`, `audio/audio.ts`,
  `audio/music.ts`, `core/settings.ts`, `render/lighting.ts`), the
  `classic-shims` plugin in `vite.config.ts` hands it the stand-in from
  `src/classic/shim`. `G.world`, `G.camera` and `G.ui` are adapters over the
  World scene, Elior and the HUD (`src/classic/layer.ts`). They draw with their
  own Canvas 2D art into one canvas the size of the camera's view at one pixel
  per world unit (the original's pixel-art resolution), shaded by
  `render/bossPixel.ts` as in the original, which Phaser shows hard-edged. A fix
  to one of those modules is a fix in both builds. The audio shims now re-export
  the real Web Audio engine and score; settings remain scoped to this build.

## Scenes and modules

| File | What it is |
|---|---|
| `src/main.ts` | Game config: device-pixel canvas, Arcade physics at 120 Hz, the scenes. |
| `src/scenes/Boot.ts` | Loads Elior's and the foes' sheets; makes the generated textures. |
| `src/scenes/Title.ts` | Continue or begin a new journey. |
| `src/scenes/World.ts` | Builds a room (tiles, backdrop, lights, entities), runs the actors, doorways, death and respawn, saves. |
| `src/scenes/Hud.ts` | Health, level, experience, silver, room name, hints, toasts, banners, pause, touch controls. |
| `src/ui/menu.ts` | The pause menu: the original's sectioned DOM menu (`ui/dom.ts`, `icons.ts`, `statTips.ts`, `styles.css`) in `#ui` over the held world. |
| `src/game/controls.ts` | One action layer for keyboard, gamepad and touch. |
| `src/game/player.ts` | Elior: shared weapon combo routes, Phantom Step, ground/air movement, charged blows, parry/counter, Balm, ability buffs and hazards. |
| `src/game/abilities.ts` | All twelve Covenant skills: shared definitions and saved three-slot loadout. |
| `src/game/bosses.ts` | The boss framework (intro, phases, phase gates, poise and kneeling, wards) and the Fallen Crowns: Varkhos, Morvane and Azkar. |
| `src/game/types.ts` | What actors may ask of the world (`WorldApi`), and the shape of a blow. |
| `src/classic/layer.ts` | The classic layer: the original modules' world, camera, HUD and Elior, and the canvas they draw into. |
| `src/classic/squad.ts` | The Echoes' side of the original world: summoning, presets, orders, Switch, recall, mark target, sync strike, an Echo's return. |
| `src/classic/bosses.ts` | The original bosses from the Gilded Idol to the Prince of Grecia: the trigger that wakes each, its chapter, and what its defeat opens. |
| `src/classic/shim/*` | Stand-ins for the original's engine services (sound and music calls are kept for the audio port). |
| `src/game/tileset.ts` | Per-biome tilesets and backdrops, generated in code. |
| `src/game/save.ts` | The Phaser build's save, and the level curve. |

## Checklist

Status: ✅ ported · 🟡 partly · ⬜ not yet. The original's file is named so the
port can follow it.

### Part 1: the world
- ✅ Project, build, CI test and publishing at `/phaser/`.
- ✅ Every room (all 77) builds from the shared room data: tiles, one-way
  platforms (drop through with down + jump), spikes and the Veil hurt, doorways
  with their conditions, spawns.
- 🟡 Art: generated tilesets and parallax per biome, lamps with flicker. Still to
  come: the original's hand-drawn biome art (`render/env*.ts`,
  `render/fallenEnv.ts`, props), weather and lighting passes.
- ✅ Elior: run, jump (coyote time, buffer, short hops), a three-hit ground
  combo, an air strike, a dodge with invulnerability, getting hurt, death and
  rising at the room's doorway, with his PNG sheet.
- ✅ Foes: since Part 5, the original's own (see Part 5).
- ✅ HUD basics, toasts, banners, room names, hints with device-correct button
  names, pause.
- ✅ Touch: a floating stick, STRIKE, JUMP, DODGE and a context button, with
  multi-touch, inside the safe areas. Keyboard and gamepad.
- 🟡 Altars (rest, heal, save), chests (silver for now) and NPC stand-ins.

### Part 2: combat depth
- ✅ Controls as in the original: J attack, K heavy, L or Shift dodge, I parry,
  H Balm, Q / E / R skills, F interact; the pad's □ ✕ ○ △, L1 parry, R1 / L2 / R2
  skills, D-pad ↑ interact and ↓ Balm. Presses are latched, so a tap shorter
  than a frame or made during hit-stop still counts.
- ✅ A heavy blow charged on K, or by holding STRIKE after its first swing,
  through the original's three levels (0.35 s and 0.85 s; ×1, ×1.35, ×1.8).
- ✅ Parry (a 0.17 s window): the blow is turned aside, the attacker reels,
  +5 Covenant Energy, and a 0.75 s counter that is always critical and hits
  half again harder; a perfect parry opens straight into the riposte. Held
  past the window it is a block that takes a quarter.
- ✅ Critical hits (5%, ×1.6). Reeling foes, from a parry or broken poise, take
  half again; they show a ring of sparks.
- ✅ Covenant Energy (regenerates 2.6 a second, +2.4 a blow, up to 100), Balm
  (three flasks, 42% each, refilled at altars and on rising), and three skills
  with the original's costs and cooldowns: Sword of the Word (a piercing arc),
  Trumpet of Victory (a staggering shockwave), Shield of Faith (1.4 s of
  immunity that staggers attackers). Skills chain once the last is loosed.
- ✅ HUD: the energy bar, Balm flasks, a skill bar with keys, costs and
  cooldowns on keyboard and pad; on touch, PARRY, BALM and three skill buttons
  that darken while recharging.

### Part 3: bosses
- ✅ The boss framework (`src/game/bosses.ts`): the arena trigger wakes the boss
  with its title, the gate shuts behind Elior and opens at the defeat; three
  phases with gates, so no blow skips one; poise that breaks into a kneel
  (blows take half again); parries that cost poise; warded final attacks.
- ✅ Varkhos, Crown of the Hunt (`game/fallenBosses.ts`): claws, charge, leap
  and call; Hunt Shades in phase II, each sharpening his blows; the Great Hunt
  of three marked pounces.
- ✅ Morvane, Crown of Pestilence: needles, spore clouds, claws; Brood Cocoons
  that heal her in phase II; the Great Miasma with the gold beacon to shelter in.
- ✅ Azkar, Crown of Cinders (`game/cinderBoss.ts`): the hammer, the marked
  fault, the low fire waves to jump; tempered armor in phase II (blows do 55%)
  that a parry shatters; the Last Bellows of three marked eruptions.
- ✅ Their PNG atlases with the original's crops and feet.
- ✅ The boss bar (`ui/hud.ts`): on a phone it keeps to its own lane between
  Elior's column and the pause button and hides the room name; on keyboard and
  pad it sits above the skill bar. Phase marks, a ghost of lost health, the
  poise line and the phase's instruction.
- ✅ Chapters VII–IX objectives: the two commanders of VII, the Spore Hearts of
  VIII and the Pressure Wheels of IX (guards first) open the boundary; a sealed
  boundary says what is left. A defeat sets `defeated_*` and `ch*_done` and pays
  the chapter's experience.
- Health and blows: the original's (`game/curve.ts`, on Hard) since Part 6.

### Part 4: the older bosses
- ✅ The classic layer (above), with the original Canvas art and its pixel
  shading, particles, rings, flashes and lights.
- ✅ The Gilded Idol, the Gatekeeper, the Crimson Marshal, the Locust King (after
  his brood's two waves), the Image of Gold, the Weigher, the Prince of the Storm,
  the Prince of the Kingdom of Persia and the Prince of Grecia (behind the
  Chapter X boundary): each with all its moves, phases, telegraphs, intros,
  adds and defeat, from the original code. Their blows reach the Phaser Elior
  (parry, block, dodge and the Shield of Faith work on them) and his blows and
  skills reach them.
- ✅ The arena trigger shuts the gate and wakes the boss; Elior waits while its
  intro plays (letterbox bars, captions, its name card). The boss bar shows it
  (with the phone lane). Its defeat sets the flags its story scene would set to
  open the way (`idol_defeated`, `gate_open`, `marshal_raised`, `ch3_king_done`,
  `ch4_image_done`, `ch5_weigher_done`, `ch6_storm_done`, `ch6_prince_done`,
  `ch10_done`), records it in `defeated`, opens the gate and pays experience.
- Their health and blows are the original's (since Part 6). The dialogue before
  and after each fight comes with the story port.
- In the original: Elior's body proportions moved to `game/playerDims.ts` and
  the torch flame to `render/flame.ts`, so the NPC module no longer loads the
  player or the environment.

### Part 5: the foes
- ✅ Every room's foes are the original's classes (`game/enemies.ts`,
  `tanks.ts`, `locusts.ts`, `babylon.ts`, `feast.ts`, `princes.ts`,
  `fallenFoes.ts`, `eel.ts`, made by `game/foes.ts`), run through the classic
  layer: each kind's own moves, telegraphs, guards, staggers and deaths, its PNG
  sheet (`render/creatureSprites.ts`) or its vector art, and the health bars and
  elite names over them. The Phaser build's stand-in foes are gone.
- ✅ Elior's parry, block, dodge and Shield of Faith work on their blows; his
  blows, heavy blows and skills reach them (a light strike is about 10 of the
  original's poise, a full heavy about 34).
- ✅ Kills pay the original's experience and silver for the chapter.
- ✅ A beaten elite kneels in the Veil's grip; holding interact (or up) beside
  it for 1.1 s purifies it, as in the original: the Veil burns away, it is
  recorded in `defeated` and its species in `purified`, and it does not return.
  Since Part 6 it becomes a real Echo in the save; it takes the field with the Echo port. The Chapter VII
  commanders still break the boundary when they fall.
- Their health, blows and experience are the original's for the chapter (since Part 6).
- ⬜ Finishers on staggered foes (`game/finishers.ts`) come with the rest of
  combat.

### Part 6: the save, stats and gear
- ✅ The save is the original's `SaveData`, settled by its own `migrateSave`;
  level-ups give stat and skill points as in the original (`state.gainXp`).
- ✅ Elior's stats are the original's `derive()`: health, Covenant Energy, attack
  (from his equipped weapon and Strength), melee and heavy multipliers, critical
  chance and damage, the parry window (Resolve), energy regeneration and damage
  reduction (Endurance and armour, half against hazards), times the level's
  power tier (`balance.sovereignDamage`). A new journey starts with the
  original's starting gear.
- ✅ The temporary balance is gone: foes, the older bosses and the Crowns use the
  original's own health and blows (`game/curve.ts`, `game/difficulty.ts` on Hard).
- ✅ Chests give the original's loot (silver, materials, items into the pack,
  key items) and stay open (`opened`).
- ✅ Purification raises a real Echo into the save (`absorbEcho`): created,
  reinforced or evolved, into the lineup if a slot is free.
- ✅ The title brings a live slot over (a second tap when it would replace this
  build's journey).
- ✅ Spending stat and skill points and equipping gear arrived with Part 8.

### Part 7: the Echoes
- ✅ The original's Echo units (`game/echoes.ts`, `echoRoles.ts`,
  `squadOrders.ts`, `echoCombos.ts`) run through the classic layer: every
  species' kit, roles, combos, levels and evolution, drawn from their sheets.
  They come along through every door (unless dismissed), fight the room's
  foes, draw foes onto themselves (a defensive Sentinel taunts), share in the
  experience of a kill, and a fallen Echo returns after its time down.
- ✅ The squad (`src/classic/squad.ts`, from the original's world.ts): summon
  presets (one, two, squad, all), orders (Guard, Hunt, Flank, Hold, Focus,
  Free), modes (Aggressive, Defensive, Follow), Mark target, Recall, Sync
  strike, and Switch (a benched Echo steps in, or Elior trades places with the
  one marked by the gold chevron, and his next blow lands half again harder).
  The Marshal's duel keeps them out.
- ✅ The command wheel: C, L3 or the ECHOES button opens it (the world waits);
  the stick or arrows turn it, strike, jump or interact choose, the Echo button
  or menu closes it; tap or click works too. Its Summon and Orders pages as in
  the original. X, D-pad ← or SWITCH switches. The HUD shows the Echoes out and
  the Switch's cooldown.
- `core/input.ts` joins the shims: the Echo and swim modules read the Phaser
  controls through it.
- 🟡 The per-Echo orders panel remains. The lineup, squad pick and formations
  arrived in Part 8; native Crowns now expose Entity targets to shared spells
  and Echoes without running a second physics or draw loop.

### Part 8: the pause menu
- ✅ Escape, P, Options or the ❚❚ button opens the original's sectioned menu,
  built from its own DOM helpers, icons, stat tips and stylesheet; the world
  waits until it closes. Sections: Journey (where the road stands, bosses
  overcome), Elior (Character, Equipment, Skills), Echoes (Squad) and System
  (save, save and quit to title).
- ✅ Character: spend stat points one or many at a time with the preview of
  what each changes; the derived numbers with their tips. Equipment: slots, the
  pack, the If-equipped comparison, equip and unequip, sets, materials.
  Skills: the four trees, learn ranks, Regeneration. Echoes: the roster,
  active and reserve within the summon capacity, the squad pick, combat role,
  Commander, stance, formations and absorbing imprints; the field follows
  the lineup at once. Every change refreshes Elior's and the Echoes' numbers
  and saves.
- ✅ Keys and pad drive it through the Phaser controls (`menuInput` calls the
  original's `navigate` from `ui/dom.ts`): arrows or stick move focus, attack,
  jump or interact choose, dodge goes back, Q/E or L1/R1 change tabs. A tap
  presses the button under the finger even beside the canvas (touch
  adjustment would otherwise hand it to the game below).
- 🟡 Abilities, Moves, audio and difficulty settings are in this release.
  Quests, lore, bestiary, map, crafting, shops, remaining controls/settings
  and coaching cards still need their systems.

### Part 9: combat routes and ability loadout
- ✅ Shared attack timings, hitboxes, launch/guard-break/poise and multi-hit
  definitions for blade, spear and greatsword. Relentless adds Rising Verdict.
- ✅ Delayed Seventy Times Seven and its final lunge; Storm of Edges; dash
  strike into Rising Comet; launcher; air combo into Heaven's Rend; plunge
  and landing impact; air dash and the Eagle Plume's extra jump.
- ✅ Phantom Step after a confirmed hit, reachable targets and safe landing
  spots, three-step Judgment Cross and the original Energy costs.
- ✅ All twelve Covenant skills, their unlock rules, costs/cooldowns, buffs,
  damage/heal zones, shared projectiles and on-hit statuses. Effects advance
  with the simulation and wait while the menu is open.
- ✅ Abilities and Moves tabs. Swapping occupied slots exchanges the two;
  clearing a slot persists. Cooldowns belong to skills, not buttons. HUD and
  phone buttons show the selected skills.
- ✅ Existing Phaser saves retain the three formerly implicit starter skills
  once. Imported live saves keep earned abilities and intentional empty slots.
- ✅ Shared Pillar of Fire targeting fix: measure ahead from Elior, so a foe
  closer than 70px is not skipped.

### Part 13: audio
- ✅ Original Web Audio engine, generated score and effect library; room and
  boss tracks with phase layers and combat intensity.
- ✅ Original recorded-song layer with its two gesture-primed decks,
  crossfades, vocal/instrumental choice and generated-score fallback.
- ✅ Pause muffle/duck, independent Master/Music/Effects, mix-with-other-apps,
  silent-switch policy and persisted settings under this build's own key.

### Part 19: installation and updates
- ✅ Scoped manifest, reused game icons, landscape Home Screen app.
- ✅ Build-stamped service worker precaches all hashed code, CSS and sprite
  assets atomically. Recorded songs cache on demand, not all at install time.
- ✅ Separate cache names. Both workers preserve the other app's caches.
- ✅ Build shown at title and in System; fresh version check saves and resumes
  on update and removes a stale `fresh` flag. Normal document loading checks
  the network, falling back to the fully cached game offline.

### Still to port
- ⬜ Finishers, weapon elements/procs, power visuals and Shadow Mantle;
  sub-weapons, selectable supers and their gauges.
- ⬜ Boss trophies, Tobiah's walk-on and all Story I/II flows: dialogue,
  portraits, quests, the objective guide, cutscenes, chapter ends and recap.
- ⬜ Quests/lore/bestiary/map/crafting/shops/coaching and remaining settings.
- ⬜ Swimming, currents, breath and underwater presentation in Chapter X.
- ⬜ Trial, Extreme Survival, Gauntlet/Rush, daily challenges and boards.
- ⬜ Remnant's Rest, Trials of Valor and New Game+.
- ⬜ Dynamic Island HUD, touch layout editor, haptics and phone performance QA.
- ⬜ Original environment art, weather, props, lighting and NPC presentation.
- ⬜ Full parity acceptance and final main-game switch-over (Part 20).
