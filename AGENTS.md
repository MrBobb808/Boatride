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
3. Merging deploys automatically. GitHub Actions verifies both builds, assembles `remnant/dist-pages`, and
   publishes the Phaser main game to GitHub Pages: https://mrbobb808.github.io/Boatride/.
   Installed copies on the owner's iPhone pick up the new build by themselves
   (see `remnant-phaser/src/game/update.ts`). Each build carries a readable version,
   its UTC build time as YYYY.MM.DD.HHMM (`installedVersion`, in `version.json`); the
   title screen shows it and whether the site serves a newer one. Settings shows the version and build and
   provides Check for updates, which saves and resumes the current slot.
   Explicit update navigations wait for the fresh document on slow connections;
   failed refreshes retry after a cooldown.

## Current polish work and art

Claude Code does the game changes, following `remnant-phaser/POLISH_PLAN.md`.
That plan covers combat, sound, abilities, the archer's kit and
transformation, and selling, salvage, the store and crafting. ChatGPT
generates art into `remnant-phaser/art/`. `art/REQUESTS.md` says what to make,
and `art/README.md` how to store it and record it in `art/manifest.json`.
Never ship files from `art/incoming/` directly.

## What is in the repository

| Path | What it is |
|---|---|
| `remnant/` | Shared gameplay, story, art and original engine; the original edition is preserved at `/Boatride/classic/`. |
| `index.html`, `README.md` (root) | **Gangway**, a separate single-file boat-ride check-in app. Leave these alone unless asked. |
| `remnant-phaser/` | The Phaser 4 main game at https://mrbobb808.github.io/Boatride/ (also `/phaser/`). Read `remnant-phaser/PORTING.md` (status checklist and conventions) before working on it. It runs the original's boss and foe modules from `remnant/src` through its classic layer, so a change to those modules (or to the engine services they import) changes both builds: run `npm run build` and the scripts in `remnant-phaser/scripts` too. |
| `.github/workflows/remnant-pages.yml` | Builds both on every push. It deploys to Pages from the default branch only. |

## The game at a glance (`remnant/`)

- **Stack:** TypeScript (strict) and Vite. It uses no game engine and has no
  image or audio assets: every character, room, effect, sound and piece of
  music is generated in code (Canvas 2D and Web Audio). The one exception is
  the optional song layer below: recorded songs in `public/music/`.
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
  - V, *The Writing on the Wall* (Daniel 5): `game/rooms5.ts` and
    `game/story5.ts`. Its art is in `render/env5.ts`; the writing on the
    banquet-hall wall is driven through `game/writing.ts`.
  - VI, *The Prince of Persia* (Daniel 10): `game/rooms6.ts` and
    `game/story6.ts`. Its art is in `render/env6.ts`. Fallen angels appear
    as "princes" over kingdoms and domains (the game's monarchs): the
    Prince of the Storm and the prince of the kingdom of Persia. Elior
    withstands them; he does not cast the great prince down (Michael's
    light does, Daniel 10:13).
  - VII–IX, the Fallen Crowns, and X, *The Prince of Grecia* (Daniel 8 and
    10:20): `game/fallenChapters.ts` (`FALLEN_CHAPTERS`, room builder and the
    `DRESS` table) and `game/fallenStory.ts`. Chapter X's coast, Sunken Temple
    and Drowned Library are drawn by `render/envGrecia.ts`; its rescued
    survivor is Hanan from Chapter VI.
  - `game/chapters.ts` lists the chapters for chapter select (`ui/chapters.ts`)
    and starts training (the Trial of the Remnant from the menu).
- **Bosses:**
  - `game/boss.ts`: the Gilded Idol.
  - `game/bosses2.ts`: the Gatekeeper and the Crimson Marshal.
  - `game/bosses3.ts`: the Locust King.
  - `game/bosses4.ts`: the Image of Gold.
  - `game/bosses5.ts`: the Weigher.
  - `game/bosses6.ts`: the Prince of the Power of the Air (storm) and the
    Prince of the Kingdom of Persia (with the Twenty-First Day phase).
  - `game/bosses10.ts`: the Prince of Grecia (the he-goat of Daniel 8: a
    charging great horn, then four horns toward the four winds).
  - `game/difficulty.ts`: Settings → Challenge → Boss difficulty (Normal,
    Hard by default, Merciless) scales every boss's health, damage and tempo.
  - `game/curve.ts`: one table per chapter of the level a straight-through
    player arrives at, foe health/damage/XP and the Fallen Crown bosses'
    health and blow. Below the arrival level XP comes faster (catch-up).
    `scripts/curve-onboarding.mjs` fights VII–IX on Hard at those levels.
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
  - `game/feast.ts`: Vessel Wraith and Scribe of the Veil.
  - `game/princes.ts`: Undying Host (rises again unless finished) and Fallen
    Gale (a lightning flier).
  - `game/fallenFoes.ts`: the VII–IX signature foes: Antlered Stalker
    (marked pounce, parryable two-hit rake), Swarm Carrier (drifting swarm
    clouds, spore burst on death) and Slag Golem (armoured front, slam with a
    jumpable fire wave, exposed core). Verified by `scripts/fallen-foes.mjs`.
- **Echoes** (purified allies): `game/echoes.ts` holds the kits, `game/data.ts`
  the species.
  - **Squad control:** the command wheel (`ui/ui.ts`, `openWheel`) has a
    Summon page (One / Two / Squad / All, `World.setSummon` and
    `summonList`; save fields `summonPreset`, `squadPick`) and an Orders page
    (Guard / Hunt / Flank / Hold / Focus for every Echo out, or "Each Echo…"
    for one at a time and the squad picks). Orders live on `EchoInst.order`
    and drive targeting and movement in `EchoUnit.chooseTarget` / `standX`.
    Flank blows to a foe's back hit harder; guards earn XP from blows taken.
  - **Called, never automatic:** Echoes appear only when called (the wheel,
    the ECHOES button, a summon preset); `flags.army_out === true` then keeps
    them along through doors until dismissed. Story beats, purifications and
    level-ups never call them out on their own. Foes slain in the Shadow Mantle
    or the Sovereign form rise as shadow allies only with Settings → Shadow
    allies on (`settings.shadowAllies`, off by default; `riseAsShadow`).
  - **The AI partner** (Phaser build, `remnant-phaser/src/game/partner.ts`):
    the hero you are not playing, called from the wheel, fights beside you as
    an Echo underneath (`EchoUnit.power` / `maxHealth` hooks carry its own
    numbers). The partner or the Echoes, never both.
  - **Choosing and the bond:** `leadEcho` (game/state.ts) puts one Echo at
    the head of the lineup and calls it out alone: the Echoes page's "Fight
    beside me", and in the Phaser build the wheel's Summon → Choose one….
    `echoBond` gives one Echo alone +80% attack and +50% health; as one of
    two, half that; in a larger line, none. `setSummon` refreshes the Echoes'
    stats so the bond follows the preset.
  - **Swap:** `World.switchSupport` trades places with `World.swapPick`
    (nearest Echo in the aimed direction, marked by a gold chevron). The Echo
    takes over Elior's foe (`EchoUnit.takeOver`) and Elior's next blow within
    0.9 s lands harder (`Player.swapStrikeT`).
- **Saves:**
  - `game/save.ts` keeps three local slots.
  - `game/cloud.ts` mirrors saves to a private cloud copy when the game runs
    inside a claude.ai preview.
  - There is autosave every 30 seconds and whenever the app is hidden.
  - Death respawns the player at the doorway of the current room.
- **Swimming:** `game/water.ts` marks deep water, currents and air bells
  (`prepareWater` on room load), `game/swim.ts` is the swim state (breath
  ring, dives, muffled sound) and `render/underwater.ts` draws it. Chapter X's
  Sunken Temple and Drowned Library are flooded; eels live there.
- **Remnant's Rest** (`remnant_rest`): the survivor settlement grows by tier
  from people rescued and chapters finished (`game/settlement.ts`,
  `game/restRoom.ts`, `render/envRest.ts`, `ui/settlement.ts`).
- **Store and economy:** `game/economy.ts` is Ilan's store and salvage.
  - Selling pays silver and materials, and Epic gear and up also pays Relic Shards (`relic_dust`). Dov dismantles for double materials. Locks are `SaveData.locked`. Sell all junk and session-only buyback are there too.
  - The stock turns over each local day: three featured `curio_*` items scaled to the chapter, supplies, Balm vials, elixirs, the classic gear, tomes once per chapter, dyed capes and the Sealed Satchel. Purchases are recorded in `SaveData.store`.
  - Elixirs are timed buffs on the playtime clock (`game/elixirs.ts`, `SaveData.elixir`, folded in by `derive`).
  - Elixirs, Balm vials, tomes and the Sealed Satchel go into the pack when bought or brewed (`SaveData.pack`, `PACK`, `stow` and `usePack` in `game/economy.ts`). They are used from the pause menu's Pack → Items; a tome can be read by either hero. Pack → Gear lists each hero's gear with Equip, opening on the hero in play.
  - The curios add four mods: `barter`, `salvage`, `mantleGain` and `parryHeal`.
  - The screens are in `ui/menus.ts`: Ilan's stall, Dov's Dismantle tab, and the pause menu's Elior → Store, which is closed during fights.
  - Capes show on Elior in the Phaser build: `fighterRig.ts` dyes the cape when it bakes the sprite sheet.
  - Tirzah's gear (bows, quivers, daggers, hoods, garbs, amulets, charms) lives in the same `ITEMS` table with her own `ArcherSlot`s; Elior's `SLOTS` never take it. Her level, points, tree and gear are the optional `SaveData.archer`, used only by the Phaser build (`remnant-phaser/src/game/archer.ts`); `isWorn` covers both heroes.
  - Verified by `remnant-phaser/scripts/economy.mjs`.
- **Trials of Valor and the daily challenge:** `game/valor.ts` holds the
  trophies (a boss trophy and a flawless title/cape per boss) and
  `game/daily.ts` one seeded ten-wave Trial run per day with its own board.
  Valor is in the pause menu's Journey section; the daily challenge is on
  the Chapters page (`ui/daily.ts`).
- **Smoothness:** `game/roomPrep.ts` bakes the rooms behind the doors in idle
  time so doors are instant; `core/frameBudget.ts` steps quality down only on
  sustained load. Touch controls can be moved and resized
  (`ui/touchEditor.ts`); `core/haptics.ts` handles vibration.
- **Music and staging:** `audio/music.ts` scores every chapter; bosses call
  `music.bossPhase(n)` to layer their tracks. `game/cinema.ts` is the
  awaitable cutscene toolkit (camera pans, letterbox bars, title cards),
  `render/portraits.ts` draws dialogue busts and `game/recap.ts` shows a
  "Previously…" card on resume. Verified by `scripts/audio-cinema.mjs`.
- **Songs:** chapter songs made in Suno play over the generated score
  (`audio/songs.ts`). The plan, with every song's Suno style, lyrics and the
  music keys it covers, is `soundtrack/songs.json`; `SOUNDTRACK.md` is
  generated from it (`node scripts/soundtrack-doc.mjs`). Files go in
  `public/music/<id>.mp3` through `node scripts/add-songs.mjs <downloads>`,
  which matches Suno's file names and levels the loudness (needs ffmpeg), or
  `node scripts/suno-links.mjs <notes>` for Suno share links (needs network
  access to suno.com and *.suno.ai). Every song has a code (R01–R24) that its
  Suno title ends in, so a link or a file names its song. A
  chapter's vocal song plays once per session where it is mapped, then its
  instrumental loops; bosses keep the adaptive score; a missing file falls back
  to the score. The service worker keeps songs in a `remnant-music` cache that
  updates leave alone. Settings → Audio → Soundtrack (Songs / Score only) and
  Sung songs. Verified by `scripts/soundtrack.mjs` and
  `scripts/soundtrack.test.mjs`.
- **Menus and first-time flow:** the pause menu has six sections with
  sub-tabs (`ui/menus.ts`, `SECTIONS`; old page names still open). A host
  build can add its own through `addMenuSection` (the Phaser build adds
  Tirzah's, and opens it while she fights).
  `ui/coach.ts` shows optional one-time coaching cards (`SaveData.coached`)
  and `ui/statTips.ts` explains every stat on hover or long-press.
- **Guidance:** `game/guide.ts` maps quest stages to targets and draws the
  golden objective marker.
- **Pixel art:** Settings → Art style (default Pixel) draws the world at one
  pixel per world unit and scales it up hard-edged (`Renderer.world`,
  `Renderer.present`). Characters come from two sources:
  - Elior and the foes and Echoes that have sheets use the PNG sprite atlases
    (`render/heroSprites.ts`, `render/creatureSprites.ts`; see
    `SPRITE_ART.md` and `ELIOR_UPGRADE.md`).
  - Every other humanoid that reaches `drawHumanoid` (NPCs, Echoes and foes
    without a sheet, human-sized bosses, Elior when his atlas cannot show his
    gear) is painted pixel by pixel from its skeleton by
    `render/pixelHero.ts`. See `PIXEL_ART.md`.
  World drawing must use `r.bw`/`r.bh` (the world target); the HUD uses
  `r.px` and CSS pixels; `r.cw`/`r.ch` is the screen canvas.
- **UI:** `ui/` holds the HUD, menus, touch controls, dialogue and title
  screen.
  - In a boss (or elite) fight on a phone, `ui/hud.ts` puts the boss bar in
    its own lane between Elior's column and the minimap and hides the room
    name and objective; `hudBoxes` records the boxes for
    `scripts/hud-layout.mjs`.
  - `ui/island.ts` draws game status around the Dynamic Island in landscape
    (add `?island=left`, or `?island=compact` / `?island=classic`, to the URL
    to preview it on a desktop). Settings → Island size fits it to the iPhone
    18 Pro's smaller island (default) or the 14–17 Pro's, with a length
    slider; on the small island the Echo count and Mantle gauge bud off as
    pods, a boss's life rings the island, and big moments send a ripple.

## Rules to keep

- **Scripture:** quote the King James Version word for word, and always cite
  the reference (for example "Ezekiel 37:10 (KJV)"). Song lyrics follow the same
  rule: any scripture they sing is KJV word for word, listed under the song's
  `scripture` in `soundtrack/songs.json`. Everything else is
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

Chapters I–X are implemented, each with a chapter-end screen. Chapter X, The
Prince of Grecia, pays off Daniel 10:20 on the storm coast of Chittim. Chapter VI
continues into the original Fallen Crown campaigns: VII, The Crown of the Hunt
(Varkhos), and VIII, The Crown of Pestilence (Morvane). Their room definitions,
quests and story wiring are in game/fallenChapters.ts and game/fallenStory.ts;
the bosses are in game/fallenBosses.ts and use the PNG atlases through
render/fallenArt.ts. IX, The Crown of Cinders (Azkar), continues from VIII into six foundry rooms. Its boss is in game/cinderBoss.ts, with armor-breaking parries, low fire waves and three marked eruptions.
Each VII–IX room's terrain (mounds, pits of stakes, bog, bile or slag, cave
ceilings) and set dressing is hand-authored in the `DRESS` table in
game/fallenChapters.ts; `dress()` keeps grounded things standing on the shaped
floor. Their skies, parallax, tiles and liquids are in render/fallenEnv.ts and
their props in render/fallenProps.ts. The older vector bosses (Idol through
the Ch VI princes) are shaded into pixel art at runtime by
render/bossPixel.ts (`pixelShade`, `pixelBox` on each boss). See
remnant/FALLEN_CHAPTERS.md for mechanics and verification. The Trial of the Remnant
(`trial_arena`) is an endless Zombies-style rounds mode (`game/rounds.ts`) with
a Game Over card and leaderboard (`game/board.ts`, `ui/leaderboard.ts`); it is
also the endless way to level 100 and beyond.
**Extreme Survival** (Chapters page, `startExtreme`) is the same Trial made
brutal by the `EXTREME` table in `game/rounds.ts`: deeper and tougher foes,
Elites, more of them, no dropped blessings, harder incoming blows and its own
board (`'extreme'` in `game/board.ts`). Verified by `scripts/extreme-survival.mjs`.
