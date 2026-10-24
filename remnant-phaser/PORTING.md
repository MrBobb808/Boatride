# Remnant: Ascension on Phaser: the port

The game is being rebuilt on **Phaser 4** (`phaser@4.2.1`) in this folder,
one system at a time. The original engine-free build in `../remnant` stays the
live game at https://mrbobb808.github.io/Boatride/ until this one reaches parity.
Every push publishes the Phaser build beside it at
**https://mrbobb808.github.io/Boatride/phaser/**, so each part can be played on
the iPhone as it lands.

## How it is built

- `npm install`, then `npm run dev` (port 5174) or `npm run build` (writes `dist/`).
- `node scripts/smoke.mjs`, `node scripts/combat.mjs`, `node scripts/bosses.mjs`
  and `node scripts/classic-bosses.mjs` play the build in headless Chromium
  (after a build). CI runs them on every push
  (`.github/workflows/remnant-pages.yml`).
- `?debug` exposes `window.__remnant` (`world`, `controls`, `warp(room, spawn)`,
  `give(xp)`, `rooms`). Add `&autostart` to skip the title and `&fresh` for a new
  journey. `?boxes` draws the physics bodies.
- **Shared data.** Engine-free modules are imported from `../remnant/src`
  through `src/shared.ts`: room layouts (`game/rooms*.ts`, `fallenChapters.ts`,
  `restRoom.ts`), the tile legend (`game/tiles.ts`), `game/data.ts` and the PNG
  sprite sheets in `src/assets`. A room or item fixed there is fixed in both
  builds. When the old engine is retired, these move into this folder.
- **Saves.** This build keeps its own save under `remnant-phaser.save.v1`, so it
  never touches progress in the live game. Importing a live save comes with the
  inventory and story ports.
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
  to one of those modules is a fix in both builds. When a system is ported for
  real (sound, story), its shim gives way to it.

## Scenes and modules

| File | What it is |
|---|---|
| `src/main.ts` | Game config: device-pixel canvas, Arcade physics at 120 Hz, the scenes. |
| `src/scenes/Boot.ts` | Loads Elior's and the foes' sheets; makes the generated textures. |
| `src/scenes/Title.ts` | Continue or begin a new journey. |
| `src/scenes/World.ts` | Builds a room (tiles, backdrop, lights, entities), runs the actors, doorways, death and respawn, saves. |
| `src/scenes/Hud.ts` | Health, level, experience, silver, room name, hints, toasts, banners, pause, touch controls. |
| `src/game/controls.ts` | One action layer for keyboard, gamepad and touch. |
| `src/game/player.ts` | Elior: movement, three-hit combo, air strike, charged heavy blow, parry, block, counters, crits, dodge, Balm, skills, hazards. |
| `src/game/abilities.ts` | Covenant skills: Sword of the Word, Trumpet of Victory, Shield of Faith. |
| `src/game/foes.ts` | Every foe with a PNG sheet, with melee, beast, archer or flier behaviour. |
| `src/game/bosses.ts` | The boss framework (intro, phases, phase gates, poise and kneeling, wards) and the Fallen Crowns: Varkhos, Morvane and Azkar. |
| `src/game/types.ts` | What actors may ask of the world (`WorldApi`), and the shape of a blow. |
| `src/classic/layer.ts` | The classic layer: the original modules' world, camera, HUD and Elior, and the canvas they draw into. |
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
- 🟡 Foes: every kind with a sheet, using four shared behaviours, with stats
  from the original (the bosses' summoned foes already run the original's code
  through the classic layer). Still to come: each kind's own moves (`game/enemies.ts`,
  `tanks.ts`, `locusts.ts`, `babylon.ts`, `feast.ts`, `princes.ts`,
  `fallenFoes.ts`), purification into Echoes, and finishers.
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
- Note: until stats and gear are ported, a Crown's health is sized to Elior's
  blows at the level a straight-through player reaches its chapter (110 of them
  on Hard) and its blow to 9% of his health there (×1.25 on Hard). When gear
  lands, the original's tables in `game/curve.ts` take over.

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
- Note: like the Crowns, a classic boss's health is sized to the Phaser Elior's
  blows at its chapter's arrival level, and every original blow is scaled to
  his health (`ClassicLayer.dmgScale`) until stats and gear are ported. The
  dialogue before and after each fight comes with the story port.
- In the original: Elior's body proportions moved to `game/playerDims.ts` and
  the torch flame to `render/flame.ts`, so the NPC module no longer loads the
  player or the environment.

### Still to port
- ⬜ Combat, the rest: the fourth combo strike and other moves from the skill
  trees, Phantom Step and the other combos (`game/weapons.ts`), the other nine
  skills and choosing them (`game/abilities.ts`, `data.ts` `ABILITIES`),
  finishers (`game/finishers.ts`), power tiers and weapon elements
  (`game/power.ts`), the Shadow Mantle (`game/mantle.ts`), stats from gear.
- ⬜ Echoes, the squad and command wheel (`game/echoes.ts`, `ui/ui.ts`).
- ⬜ The boss difficulty setting (`game/difficulty.ts`, Hard for now), boss
  trophies, Tobiah's walk-on in the Idol fight.
- ⬜ Story, dialogue, portraits, quests, the guide marker, cutscenes
  (`game/story*.ts`, `fallenStory.ts`, `game/cinema.ts`, `game/guide.ts`,
  `render/portraits.ts`).
- ⬜ Items, gear, inventory, stats, the pause menu's five sections and coaching
  (`game/state.ts`, `ui/menus.ts`, `ui/coach.ts`, `ui/statTips.ts`), and
  importing a live save.
- ⬜ Audio: the generated score and effects, and the Suno song layer
  (`audio/*.ts`).
- ⬜ Swimming (`game/water.ts`, `game/swim.ts`).
- ⬜ The Trial of the Remnant, Extreme Survival, the Boss Gauntlet and Rush, the
  daily challenge, leaderboards (`game/rounds.ts`, `board.ts`, `daily.ts`).
- ⬜ Remnant's Rest, Trials of Valor, New Game+.
- ⬜ The Dynamic Island HUD, the touch layout editor, haptics, the map.
- ⬜ Installable app: manifest, icons, offline service worker, self-update.
