# Remnant: Ascension on Phaser

The main game is built on **Phaser 4.2.1**. GitHub Pages serves the Phaser
build at https://mrbobb808.github.io/Boatride/ and `/Boatride/phaser/`.
The previous engine remains available at `/Boatride/classic/` as a fallback.
The repository root's Gangway app is unrelated and is not changed.

## Release checkpoint — 25 October 2026

| Part | Implemented behavior |
|---|---|
| 9 · Combat and loadout | Blade, spear and greatsword routes; fourth combo strike, delayed flurry, Storm, Comet, air routes, Phantom Step/Cross; all twelve Covenant abilities and persisted skill selection. |
| 10 · Powers | Shared executions, six weapon elements, power tiers, all five sub-weapons and four supers, Shadow Mantle transformation, pursuit and chain-impact teleport. Native strikes earn mastery and equipment-set effects apply. |
| 11 · Story I | Original Chapters I–V scripts, illustrated dialogue, choices, NPCs, quests, relic and Echo tutorials, objective guide and persistent room changes. |
| 12 · Story II | Chapters VI–X, original cutscenes and boss callbacks, all ten chapter-end screens and the resume recap. |
| 13 · Audio | Shared generated score, effects, phase layers and recorded Suno songs; gesture unlock, settings, pause ducking and underwater muffle. |
| 14 · Menus and coaching | Complete original sixteen-page menu, including crafting, shops, map, quests, lore, bestiary, mastery, settings and remapping; controller navigation and coaching cards. |
| 15 · Swimming | Both flooded Chapter X rooms: directional swimming, currents, breath/drowning, air pockets, stroke, dash, thrust/parry and underwater presentation. |
| 16 · Modes | Shared Trial, Extreme Survival, seeded daily challenge, Gauntlet/Rush, contracts, blessings, rewards and results. Boards are local to the browser/device, as in the original. |
| 17 · Progression | Remnant's Rest, Trials of Valor, New Game+, boss difficulty; native Crowns use the same chapter curve, NG+ scaling and chapter XP catch-up. |
| 18 · Phone | Dynamic Island presentation, movable/resizable touch controls, handedness/opacity settings and shared haptics. Physical iPhone performance and iOS audio-session behavior still need device validation. |
| 19 · Installed app | Existing main-app identity retained, hashed offline shell, on-demand song cache, build display, update checks on foreground/interval and save/resume at safe transitions. |
| 20 · Switch-over | Main Phaser artifact plus preview and isolated original fallback. Three-slot save migration, exact-stat comparison, original-worker upgrade, offline reload and cache-scope isolation are browser tested. |

These are implemented systems, not a claim that every possible campaign branch
or physical phone has been tested. The release checks exercise all authored room
loads, ten chapter openings/end cards, representative scripted sequences,
boss phases, menus, modes, swimming and the installed-app upgrade. An uninterrupted
human playthrough and sustained 120 Hz on a real iPhone remain acceptance work.

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
- Recorded songs cache as heard; an unheard song needs network access and falls
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
| `install-audio` | Audio decks, settings, offline shell and update recovery; run alone because it temporarily changes the served version probe. |
| `cutover` | Original installed worker upgrade, three slots and exact derived stats, cache isolation, offline persistence and preview recovery. Requires assembled Pages artifact. |

Each name above is `node scripts/NAME.mjs`; install Playwright Chromium first.
After both builds, run `node remnant-phaser/scripts/assemble-pages.mjs` from the
repository root. It creates `remnant/dist-pages` without mutating either source
build; then run `cutover` from `remnant-phaser`. CI runs both editions' checks
and deploys that assembled artifact from the default branch only.

Keep the original SaveData shape, KJV quotations, authored story and performance
rules in `../AGENTS.md`. Avoid per-frame allocations and `shadowBlur`. Shared
module edits affect both builds, so verify both. CI failure blocks deployment;
check Pages' actual version after a successful run before calling a release live.
