# Remnant: Ascension on Phaser: the port

The game is being rebuilt on **Phaser 4** (`phaser@4.2.1`) in this folder,
one system at a time. The original engine-free build in `../remnant` stays the
live game at https://mrbobb808.github.io/Boatride/ until this one reaches parity.
Every push publishes the Phaser build beside it at
**https://mrbobb808.github.io/Boatride/phaser/**, so each part can be played on
the iPhone as it lands.

## How it is built

- `npm install`, then `npm run dev` (port 5174) or `npm run build` (writes `dist/`).
- `node scripts/smoke.mjs` plays the build in headless Chromium (after a build).
  CI runs it on every push (`.github/workflows/remnant-pages.yml`).
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

## Scenes and modules

| File | What it is |
|---|---|
| `src/main.ts` | Game config: device-pixel canvas, Arcade physics at 120 Hz, the scenes. |
| `src/scenes/Boot.ts` | Loads Elior's and the foes' sheets; makes the generated textures. |
| `src/scenes/Title.ts` | Continue or begin a new journey. |
| `src/scenes/World.ts` | Builds a room (tiles, backdrop, lights, entities), runs the actors, doorways, death and respawn, saves. |
| `src/scenes/Hud.ts` | Health, level, experience, silver, room name, hints, toasts, banners, pause, touch controls. |
| `src/game/controls.ts` | One action layer for keyboard, gamepad and touch. |
| `src/game/player.ts` | Elior: movement, three-hit combo, air strike, dodge, hazards. |
| `src/game/foes.ts` | Every foe with a PNG sheet, with melee, beast, archer or flier behaviour. |
| `src/game/tileset.ts` | Per-biome tilesets and backdrops, generated in code. |
| `src/game/save.ts` | The Phaser build's save, and the level curve. |

## Checklist

Status: ✅ ported · 🟡 partly · ⬜ not yet. The original's file is named so the
port can follow it.

### Part 1 (this PR)
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
  from the original. Still to come: each kind's own moves (`game/enemies.ts`,
  `tanks.ts`, `locusts.ts`, `babylon.ts`, `feast.ts`, `princes.ts`,
  `fallenFoes.ts`), purification into Echoes, and finishers.
- ✅ HUD basics, toasts, banners, room names, hints with device-correct button
  names, pause.
- ✅ Touch: a floating stick, STRIKE, JUMP, DODGE and a context button, with
  multi-touch, inside the safe areas. Keyboard and gamepad.
- 🟡 Altars (rest, heal, save), chests (silver for now) and NPC stand-ins.

### Still to port
- ⬜ Combat depth: heavy and charged blows, parry, abilities and skills, the
  Covenant Energy bar, Phantom Step and other combos (`game/weapons.ts`,
  `game/player.ts`), finishers (`game/finishers.ts`), power tiers
  (`game/power.ts`), the Shadow Mantle (`game/mantle.ts`).
- ⬜ Echoes, the squad and command wheel (`game/echoes.ts`, `ui/ui.ts`).
- ⬜ Bosses: Gilded Idol through the Prince of Grecia (`game/boss.ts`,
  `bosses2–6.ts`, `bosses10.ts`, `fallenBosses.ts`, `cinderBoss.ts`), with the
  boss-bar lane on phones (from `ui/hud.ts`).
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
