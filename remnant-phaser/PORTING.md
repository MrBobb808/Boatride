# Remnant: Ascension on Phaser: the port

The game is being rebuilt on **Phaser 4** (`phaser@4.2.1`) in this folder,
one system at a time. The original engine-free build in `../remnant` stays the
live game at https://mrbobb808.github.io/Boatride/ until this one reaches parity.
Every push publishes the Phaser build beside it at
**https://mrbobb808.github.io/Boatride/phaser/**, so each part can be played on
the iPhone as it lands.

## How it is built

- `npm install`, then `npm run dev` (port 5174) or `npm run build` (writes `dist/`).
- `node scripts/smoke.mjs` and `node scripts/combat.mjs` play the build in
  headless Chromium (after a build). CI runs them on every push
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

### Still to port
- ⬜ Combat, the rest: the fourth combo strike and other moves from the skill
  trees, Phantom Step and the other combos (`game/weapons.ts`), the other nine
  skills and choosing them (`game/abilities.ts`, `data.ts` `ABILITIES`),
  finishers (`game/finishers.ts`), power tiers and weapon elements
  (`game/power.ts`), the Shadow Mantle (`game/mantle.ts`), stats from gear.
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
