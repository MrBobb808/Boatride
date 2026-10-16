# Notes for AI coding assistants

This repository is the single source of truth for **Remnant: Ascension**.
The owner works on it with more than one assistant (Claude Code, ChatGPT and
Codex). Every change is committed here, so whichever assistant picks the work
up next starts from the latest version.

## Before you change anything

1. Pull the latest **default branch** (`claude/boat-ride-checkin-list-7hwd19`).
   It holds everything that has been merged.
2. Work on a new branch and open a pull request into the default branch. The
   owner merges it.
3. Merging deploys automatically. GitHub Actions builds `remnant/` and
   publishes it to GitHub Pages: https://mrbobb808.github.io/Boatride/.
   Installed copies on the owner's iPhone pick up the new build by themselves
   (see `remnant/src/core/update.ts`).

## What is in the repository

| Path | What it is |
|---|---|
| `remnant/` | The game: a 2D side-scrolling biblical dark-fantasy action RPG for iPhone (installable web app). |
| `index.html`, `README.md` (root) | **Gangway**, a separate single-file boat-ride check-in app. Leave these alone unless asked. |
| `.github/workflows/remnant-pages.yml` | Builds the game on every push. It deploys to Pages from the default branch only. |

## The game at a glance (`remnant/`)

- **Stack:** TypeScript (strict) and Vite. It uses no game engine and has no
  image or audio assets: every character, room, effect, sound and piece of
  music is generated in code (Canvas 2D and Web Audio).
- **Commands:**
  - `cd remnant && npm install`
  - `npm run dev`: a dev server on port 5173. Add `?debug` to the URL for
    `window.__remnant`, which provides `warp`, `give`, `god`, `flag`, `echo`
    and `level`. Add `?debug&autostart` to skip the title screen.
  - `npm run build`: type-checks, then writes `dist/` (the Pages site) and
    `dist-artifact/remnant.html` (a wrapper-free copy for claude.ai previews).
- **Chapters:**
  - I, *The Ashen Village*: `game/rooms.ts` and `game/story.ts`.
  - II, *The Tower of Shinar*: `game/rooms2.ts` and `game/story2.ts`.
  - III, *The Valley of Bones*: `game/rooms3.ts` and `game/story3.ts`.
  - IV, *The Plain of Dura*: `game/rooms4.ts` and `game/story4.ts`. Its art
    is in `render/env4.ts`.
  - `game/chapters.ts` lists the chapters for chapter select (`ui/chapters.ts`)
    and starts training (the Trial of the Remnant from the menu).
- **Bosses:**
  - `game/boss.ts`: the Gilded Idol.
  - `game/bosses2.ts`: the Gatekeeper and the Crimson Marshal.
  - `game/bosses3.ts`: the Locust King.
  - `game/bosses4.ts`: the Image of Gold.
- **Combat:**
  - `game/player.ts`: the player.
  - `game/weapons.ts`: movesets and animation clips.
  - `game/finishers.ts`: randomized slow-motion executions and kill cams.
  - `game/power.ts`: power tiers by level, weapon elements, and the
    Sovereign form at level 100.
  - `game/mantle.ts`: the Shadow Mantle transformation (from level 25):
    its gauge, the transformation sequence, the form's effects and look.
- **Enemies:**
  - `game/enemies.ts`: the base enemy class and Chapter I foes.
  - `game/tanks.ts`: brute, bulwark and knight.
  - `game/locusts.ts`: drone and soldier.
  - `game/babylon.ts`: Brazen Lion and Chaldean Fire-Priest.
- **Echoes** (purified allies): `game/echoes.ts` holds the kits, `game/data.ts`
  the species.
- **Saves:**
  - `game/save.ts` keeps three local slots.
  - `game/cloud.ts` mirrors saves to a private cloud copy when the game runs
    inside a claude.ai preview.
  - There is autosave every 30 seconds and whenever the app is hidden.
  - Death respawns the player at the doorway of the current room.
- **Guidance:** `game/guide.ts` maps quest stages to targets and draws the
  golden objective marker.
- **UI:** `ui/` holds the HUD, menus, touch controls, dialogue and title
  screen.
  - `ui/island.ts` draws game status around the Dynamic Island in landscape
    (add `?island=left` to the URL to preview it on a desktop).

## Rules to keep

- **Scripture:** quote the King James Version word for word, and always cite
  the reference (for example "Ezekiel 37:10 (KJV)"). Everything else is
  original fiction. Elior stays human, and Echoes are cleansed battle-imprints,
  not souls.
- **Saves:** players have real progress.
  - Never break `SaveData` compatibility.
  - Add new fields as optional and fill them in `migrateSave` (`game/state.ts`)
    or `migrate` (`game/save.ts`).
- **iPhone performance:** the game targets 120 Hz.
  - Do not use `shadowBlur`.
  - Cache gradients and avoid allocating in per-frame paths.
  - Gate fine detail on the quality tier (`setDetail`).
- **Style:** match the surrounding code. That means short comments that say
  why, no new dependencies without a good reason, and `npx tsc --noEmit -p .`
  clean before committing.
- **Testing:** there is no unit-test suite. Changes are verified by playing
  them in headless Chromium (Playwright) through the `?debug` API, and by a
  production build.

## Where the story stands

Chapters I–IV are complete, each with a chapter-end screen. The Chapter IV
end screen says Chapter V is in development. The Trial of the Remnant
(`trial_arena`) is an endless Zombies-style rounds mode (`game/rounds.ts`) with
a Game Over card and leaderboard (`game/board.ts`, `ui/leaderboard.ts`); it is
also the endless way to level 100 and beyond.
