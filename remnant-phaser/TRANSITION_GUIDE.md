# Finishing the Phaser transition: a guide for ChatGPT Codex

This guide hands the rest of the Phaser 4 transition to **ChatGPT Codex**.
Read it with `../AGENTS.md` (the repository's standing rules) and
`PORTING.md` (what is built and how it is verified). When they disagree,
`AGENTS.md` wins on rules and `PORTING.md` wins on current facts.

Written 29 October 2026 against default-branch commit `81e45b8` (PR #63).
Both builds pass and `scripts/smoke.mjs` passes (all 77 rooms load) at that
commit. If the default branch has moved since, re-check every file and line
reference below before relying on it.

---

## 1. Where the transition stands

Phaser is the main game. GitHub Pages serves it at
https://mrbobb808.github.io/Boatride/ (and `/phaser/`). The original engine is
kept at `/classic/` as a fallback. Every feature row in `PORTING.md`'s
release checkpoint (Parts 9–20) is implemented and covered by a browser
script.

What is **not** finished is the engine underneath. Phaser owns these:
- scenes, timing and input
- the camera
- terrain collision
- Elior/Tirzah and the Fallen Crowns
- the HUD

Most other things still run the original Canvas 2D code through the
**classic layer** (`src/classic/`). That code paints into canvases that Phaser
re-uploads to the GPU **every frame**:

| Per-frame upload | Where | What is painted |
|---|---|---|
| Room back layer | `src/classic/art.ts`, `RoomArt.render` (`this.back.refresh()`) | Sky, parallax, baked tile chunks, liquids, live props, gate |
| Room front layer | same function (`this.front.refresh()`) | Foreground props, water front, **lighting**, underwater tint, guide marker |
| Classic actors | `src/classic/layer.ts`, `ClassicLayer.render` (`this.tex.refresh()`) | Every original foe, Echo, older boss, projectile, `fx` particle, slash, ring, glow and screen flash |

Each upload is a full camera-view canvas. On the owner's iPhone, at 120 Hz,
three full-view texture uploads per frame are the most likely cause of
dropped frames. They are also what still makes the build "the original engine
inside Phaser".

**The rest of the transition is moving those three paths onto native Phaser
objects, one slice at a time, without changing gameplay.** The shared gameplay
logic (`remnant/src/game/*`) stays shared. Only drawing, effects and engine
services move.

The device acceptance in `PORTING.md` is also still open: a full human
playthrough, sustained 120 Hz on a real iPhone, and iOS audio sessions.
Codex cannot do that itself, but it can build the tools that make it quick
for the owner (Phase 0 and Phase 6).

---

## 2. Rules that must never break

These come from `../AGENTS.md`. Breaking one is a failed PR.

1. **Saves.**
   - Never break `SaveData` compatibility.
   - Add new fields as optional and fill them in `migrateSave`
     (`remnant/src/game/state.ts`) or `migrate` (`remnant/src/game/save.ts`).
   - Never write to the original edition's keys (`remnant-save-0..2`).
   - The Phaser keys and cutover keys listed in `PORTING.md` → "Saves and
     fallback" keep their meaning.
2. **Scripture.**
   - Quote the King James Version word for word, with the reference, e.g.
     "Ezekiel 37:10 (KJV)".
   - Do not invent scripture, and do not alter the story's theology (see
     AGENTS.md: Elior stays human; Echoes are not souls).
3. **Performance.**
   - No `shadowBlur`.
   - No allocation in per-frame paths: pool objects; cache gradients and
     textures.
   - Gate fine detail on the quality tier.
   - The target is 120 Hz on an iPhone.
4. **Shared modules change both builds.**
   - Anything under `remnant/src` also ships in the `/classic/` fallback.
   - After touching it, run `npm run build` in **both** `remnant` and
     `remnant-phaser`, plus the relevant scripts of both.
5. **Leave the root `index.html` and `README.md` alone.** They are Gangway, an
   unrelated app.
6. **Workflow.**
   - Branch from the default branch (`claude/boat-ride-checkin-list-7hwd19`).
   - Open a pull request into it. The owner merges.
   - Merging deploys to the owner's phone.
   - Never push to the default branch directly.
7. **Never skip, disable or loosen a test to get green.** A test that is
   honestly flaky is fixed to wait on game state, not wall time (see §7).

---

## 3. Setting up

```sh
git fetch origin claude/boat-ride-checkin-list-7hwd19
git checkout -b codex/<short-topic> origin/claude/boat-ride-checkin-list-7hwd19
cd remnant && npm ci && npm run build && cd ..
cd remnant-phaser && npm ci && npm run build
npx playwright install chromium   # once, if no Chromium is present
```

- **Dev server:** `npm run dev` in `remnant-phaser` (port 5174).
- **Debug URL:** `?debug&autostart` skips the title and exposes
  `window.__remnant`, with these members:
  - `game`, `world`, `controls`, `rooms` and `G`
  - `warp(roomId, spawn)` and `give(xp)`
  - `hud` (layout boxes), plus `audio`, `music`, `songs`, `settings` and
    `offlineReady`
- **The classic layer from the console:** `__remnant.world.classic`. Its
  `ents`, `squad.echoes`, `grid` and `boss` members are the shared actors.
- **Browser scripts:** `node scripts/<name>.mjs` from `remnant-phaser`, after
  a build. They serve `dist/` themselves (`scripts/serve.mjs`). If Chromium
  lives elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- **Full Pages check:**
  1. Build both editions.
  2. Run `node remnant-phaser/scripts/assemble-pages.mjs` from the repository
     root.
  3. Run `node scripts/cutover.mjs` from `remnant-phaser`.
- **`install-audio.mjs`:** run it alone, because it changes the served
  version probe.

CI (`.github/workflows/remnant-pages.yml`) runs every original and Phaser
script, assembles the Pages artifact, runs `cutover`, and deploys from the
default branch only. A red CI blocks deployment.

---

## 4. Map of the Phaser build

| File | Owns |
|---|---|
| `src/main.ts` | Phaser config, scenes, scaling, debug hooks |
| `src/scenes/World.ts` | Room load/exit, Arcade terrain, native foes list, gates, walls, saves, the per-frame loop (it calls `art.render()` and `classic.render()`) |
| `src/scenes/Hud.ts` | Phaser HUD, touch controls, Echo wheel, boss bar |
| `src/scenes/Title.ts`, `Boot.ts` | Title, slots, asset boot |
| `src/game/player.ts` | The native hero: movement, original movesets, defense, Phantom Step, cast hand-off |
| `src/game/bow.ts`, `fighterRig.ts`, `actionArt.ts`, `style.ts` | Tirzah's bow, the illustrated rig/atlases, action styles |
| `src/game/bosses.ts`, `bossCamera.ts` | Native Fallen Crowns (Varkhos, Morvane, Azkar) and boss framing |
| `src/game/visuals.ts` | Native elemental auras, Mantle smoke, distortion, weather |
| `src/game/save.ts`, `migration.ts`, `update.ts` | Slots, main cutover migration, self-update |
| `src/classic/layer.ts` | **The classic layer**: shared actors' world, adapters (`PlayerView`, `FoeView`), hit routing, the actor canvas |
| `src/classic/art.ts` | `RoomArt`: original room painting into two canvases |
| `src/classic/hero.ts` | `HeroPowers`: shared finishers, elements, sub-weapons, supers, Mantle through `PlayerView` |
| `src/classic/squad.ts` | Echo squad logic (from the original `world.ts`) |
| `src/classic/bosses.ts` | Which original boss wakes where, and what its defeat opens |
| `src/classic/shim/*` | Stand-ins for original engine services, wired by `vite.config.ts` `SHIMS` (world, save, update, hud, ctx, audio, music, settings, lighting, input) |

How the shims work:
1. Any module under `remnant/src` that imports one of the `SHIMS` paths gets
   the `src/classic/shim` file instead.
2. That swap is how the shared story, foes and bosses run unchanged.
3. When you replace a service natively, keep the shim's exported API the same,
   so the shared callers do not change.

---

## 5. The remaining work, in order

Do one phase, or one slice of a phase, per pull request. Small PRs that keep
every script green beat one large rewrite. Each phase lists what "done" means.

### Phase 0: measure first (one small PR)

You cannot prove a rendering change helps without numbers. Build a probe
before touching renderers.

- **`?perf` overlay.** Add it to `main.ts`/`Hud.ts` (debug builds and
  `?perf` only). It shows:
  - frame time (avg / p95 / worst over 2 s);
  - how many CanvasTexture `refresh()` calls happened this frame, and their
    total pixel area;
  - the counts of classic ents, `fx` particles and native sprites.

  Count the uploads with a tiny wrapper around the three `refresh()` call
  sites, not by patching Phaser.
- **`scripts/perf-probe.mjs`.**
  - It warps to a fixed set of rooms and records the same numbers over 5 s
    each. Cover one per chapter, plus: a flooded room, a boss arena mid-fight,
    and the Trial at wave 10.
  - It writes `qa/perf-baseline.json`.
  - It is **report-only**: no pass/fail thresholds in CI, since headless timing
    is noisy. It does assert that the upload counter works.
- **Record the baseline** in a short table at the bottom of this file.

**Done when:** the overlay shows three full-view uploads per frame in ordinary
rooms, and the baseline table exists.

### Phase 1: static room art becomes real textures

`RoomArt.render` repaints everything every frame. Most of it never changes.

1. **Baked tile chunks.** `TileCache` (`remnant/src/render/environment.ts`)
   already bakes 256 px chunk canvases.
   - Upload each finished chunk **once** as a Phaser texture.
   - Show it as a positioned `Image` at depth 0.
   - Invalidate only the chunks a wall break or gate change touches (`World.breakWalls`, `closeGate`).
   - Free textures on room exit, as `RoomArt.destroy` does now.
2. **Parallax layers.** `buildParallax` returns canvases. Make each a texture
   once and draw it as a `TileSprite` with scroll factors matching `l.fx` /
   `l.fy`.
3. **Sky.** It is a gradient plus slow motion. Pre-render it, or redraw it at
   most every few frames into a small texture scaled up. Never redraw it every
   frame at full size.
4. **What still animates** goes into a smaller canvas, or better, native
   objects:
   - `drawLiquids`: water and Veil surfaces only, so only rows near liquid;
   - `drawLiveProps`: candles, banners and similar small things;
   - `drawGate`.

   Draw these into a canvas sized to their bounding area, or re-create them
   as Phaser objects (tweened images, small pooled sprites).
5. **Keep a fallback.** Keep `RoomArt`'s current path behind
   `settings.legacyRoomArt` (default off). That way the owner can compare,
   and Canvas-renderer fallback still works.

**Done when:**
- the overlay shows **no per-frame upload of a full-view back layer** in rooms
  without liquids, and only small uploads in rooms with them;
- `smoke`, `journey`, `story-flow`, `modes-water` and `visuals` pass;
- screenshots before and after of five rooms, one per biome, show no visible
  difference.

Store those screenshots under `qa/` and attach them to the PR.

### Phase 2: lighting and the front layer

`lighting.render` (shim: `src/classic/shim/lighting.ts`) paints room darkness
with light holes into the front canvas every frame. Options, in order of
preference:

1. **Low-resolution light map.**
   - Draw lights into a quarter-resolution canvas, upload it at most every
     other frame, scale it up with linear filtering, and multiply-blend it.
   - Its cost is about 1/16 of a full-view upload.
   - Lights from moving actors still read smoothly at 60 Hz.
2. **Native lights.** Phaser Light2D / point lights, if they hold 120 Hz on the
   owner's phone (verify on device before committing to them).

Move the remaining front-layer items (foreground props, water front,
underwater tint, guide marker) to native objects or the same reduced canvas.

**Done when:** no full-view front-layer upload happens per frame, and dark
rooms (Chapter III crypts, Chapter VI, the Drowned Library) still read the
same. Check them with screenshots.

### Phase 3: effects (`fx`) on Phaser

The shared `fx` singleton (`remnant/src/render/fx.ts`) is called from
everywhere: hits, finishers, bosses, story. Keep its **API** and replace its
**drawing**:

- **Particles.** `fx.spawn(PK.*, …)` and the helpers built on it (`dust`,
  `embers`, `holyBurst`, `shards`, `hitSparks`, `veilBurst`) should create
  pooled Phaser images or ParticleEmitter particles.
  - Bake one small texture per particle kind at boot.
  - Respect `fx.setTier`/`setDensity` and the existing per-frame burst cap.
- **Arcs, rings and streaks.** `slash`, `ring`, `streak` and `column` become
  pooled `Graphics`, or pre-baked textures stretched and rotated.
- **`flash`.** A full-screen rectangle on the HUD camera, with alpha.
- **`number`.** Already routed to Phaser float text (`ClassicLayer`
  constructor).

Do it behind an adapter so `remnant/src` callers stay unchanged:
- `fx.drawBack` / `fx.drawAdd` stay as no-ops in the Phaser build;
- the original edition keeps its Canvas implementation.

The vite `SHIMS` table is the mechanism: add `render/fx.ts` to it with a
Phaser implementation that exports the same names (`fx`, `PK`, types).

**Done when:**
- `ClassicLayer.render` no longer calls `fx.drawBack` / `fx.drawAdd`;
- particle counts stay within the existing caps;
- these scripts pass: `powers`, `combat`, `combat-moves`, `visuals`,
  `equipment-visuals`, `classic-bosses`.

### Phase 4: foes, Echoes and projectiles as Phaser sprites

Logic stays shared: `Enemy.update`, AI, hitboxes and `takeHit` remain in
`remnant/src/game`. Only drawing moves.

1. **Foes with PNG sheets.** `drawFoeSprite` in
   `remnant/src/render/creatureSprites.ts` uses atlases. In Phaser:
   - load the same PNGs as Phaser atlases;
   - give each entity a pooled `Sprite` (a `SpriteView` keyed by entity id);
   - each frame, set position, flip, frame (from the same frame-choice logic,
     factored into a pure function that both editions call), tint and alpha;
   - draw health bars and elite marks as pooled Graphics/Images.
2. **Echoes.** They use `drawHumanoid` from skeletons, as do NPCs and foes
   without sheets.
   - Bake their poses into atlases, as `fighterRig.ts`/`actionArt.ts` already
     do for the heroes: bake at load, never per frame.
   - Drive them from the shared state.
3. **Projectiles** (`remnant/src/game/projectiles.ts`, `Proj`): pooled sprites
   per `ProjKind`.
4. **Older vector bosses** (Idol through the Prince of Grecia). They are shaded
   at runtime by `render/bossPixel.ts`. Bake each boss's frames to an atlas
   on room load (in idle time, as `roomPrep` does in the original) and show
   them as sprites. This is the largest slice: one boss per PR is fine.
5. Each entity type moved sets a flag the layer checks, so `ClassicLayer.render`
   skips it. When none remain, delete the actor canvas.

**Done when:**
- `ClassicLayer.render` no longer draws any entity;
- the actor CanvasTexture is gone;
- `foes`, `echoes`, `bosses`, `classic-bosses`, `journey` and `story-flow`
  pass;
- side-by-side screenshots match.

### Phase 5: shim retirement and clean-up

When Phases 1–4 are in:
- The `lighting`, `fx` and drawing parts of the classic layer are native.
- Rename `src/classic` to something honest (e.g. `src/shared-bridge`). It
  still adapts story, foes, Echoes and bosses' **logic**, which is fine and
  intended.
- Update `PORTING.md` → Architecture to describe the new split, and remove
  statements that are no longer true.
- Keep the original edition building. `/classic/` remains the owner's
  fallback.

### Phase 6: device acceptance kit (for the owner)

Codex cannot hold the iPhone. Make the owner's check fast and unambiguous:

- **`?perf` from Settings.** A hidden toggle (e.g. tap the build number five
  times) shows the Phase 0 overlay on the installed app.
- **A "Copy device report" button** (System page). It copies:
  - build id and user agent;
  - quality tier and frame-time stats per recent room;
  - audio context state;
  - saved settings, **never** save contents.

  The owner pastes it into a GitHub issue.
- **`ACCEPTANCE.md`.** A one-page checklist for the owner. It covers:
  - a play-through route that hits each chapter, a flooded room, a Crown and
    a Trial run;
  - what to watch: stutter, audio after locking the phone, touch layout
    rotation;
  - how to send the report.

### Phase 7: retiring the fallback (owner's decision only)

Do **not** remove `/classic/`, the original worker scope, or original save
keys unless the owner explicitly asks in an issue or PR comment. If asked:
- keep the original saves readable;
- keep the cutover migration;
- keep a portable save-code import;
- remove only the deployed fallback edition, never `remnant/src`, which the
  Phaser build still shares.

---

## 6. What every pull request must contain

1. **One phase slice**, named in the title, e.g. "Phaser transition, phase 1:
   static tile chunks".
2. **Proof.**
   - Both builds pass; `tsc` is clean (it runs inside `npm run build`).
   - Every Phaser script touched by the change passes; for render changes,
     all of `smoke`, `journey`, `visuals` and `equipment-visuals`.
   - Any changed shared module also gets its original-edition scripts.
   - Before/after numbers from `perf-probe.mjs`.
   - Before/after screenshots for anything visual.
3. **Updated docs.**
   - Change `PORTING.md` when behaviour or architecture changes.
   - Tick the phase in §8 below.
   - Change `AGENTS.md` only if a rule or the repository map changes.
4. **No unrelated changes.** No dependency bumps, formatting sweeps or Gangway
   edits.
5. **A PR body in plain words:** what changed, how it was verified, and what is
   left. The owner reads these on a phone.

---

## 7. Lessons already paid for

These cost CI cycles in earlier parts.

- **Wait on game state, never on wall time.**
  - CI runners and headless frames vary.
  - Use `page.waitForFunction` on `__remnant.world` state.
  - Measure durations on the simulation clock (`G.time`), not
    `performance.now()`.
- **Settle the hero before input.**
  - A press in the first frame after `placeAt` can be lost.
  - Wait until Elior is on the ground and `state === 'free'`.
- **Place him on open floor.**
  - Rooms have raised blocks and pits.
  - Choose a spot where the tile at the feet is solid and the body cells are
    empty (`world.tileAt`).
  - Otherwise he falls, the room reloads, and the test fails.
- **Retry blows during spawn/recall.** An Echo or foe that is still arriving
  or being recalled ignores blows.
- **Touch adjustment hands DOM taps to the canvas.**
  - Mobile Chrome/Safari can retarget a tap near a canvas listener.
  - Menu buttons handle `touchend` themselves (see `b6a6393`, "isolate DOM
    gestures").
  - Keep that pattern for any new DOM UI over the game.
- **One bad actor must not kill the frame.**
  - `ClassicLayer` wraps each entity's update/draw and reports a fault once.
  - Keep per-entity isolation in any new render path.
- **The original's `curve-onboarding.mjs` boss sim is random.** It can lose a
  fight on CI and pass locally. If it fails on a PR that does not touch shared
  combat or curve code:
  - re-run it once;
  - comment on the PR with the evidence;
  - do not loosen it.
- **`install-audio.mjs` must run alone** (it changes the version probe).
- **Large Vite chunks warn but are fine.** Do not split chunks as a side quest.

---

## 8. Progress

Tick these as PRs merge, with the PR number.

- [ ] Phase 0: perf overlay, `perf-probe.mjs`, baseline table
- [ ] Phase 1: static tile chunks, parallax, sky as textures; small animated layer
- [ ] Phase 2: low-res light map; native front-layer items
- [ ] Phase 3: `fx` on Phaser (particles, arcs, rings, streaks, flash)
- [ ] Phase 4a: sheet foes as sprites
- [ ] Phase 4b: Echoes and NPCs as baked sprites
- [ ] Phase 4c: projectiles as pooled sprites
- [ ] Phase 4d: older bosses baked, one per PR (Idol, Gatekeeper, Marshal, Locust King, Image of Gold, Weigher, Prince of the Air, Prince of Persia, Prince of Grecia)
- [ ] Phase 5: actor canvas removed; bridge renamed; PORTING.md architecture rewritten
- [ ] Phase 6: device report, `ACCEPTANCE.md`
- [ ] Phase 7: only if the owner asks

### Baseline (fill in during Phase 0)

| Room | Uploads/frame | Upload area (px) | Frame avg / p95 (ms) |
|---|---|---|---|
| | | | |

---

## 9. Prompt to start a Codex task

Paste this into a new ChatGPT Codex task on `MrBobb808/Boatride`:

> Read `AGENTS.md` and `remnant-phaser/TRANSITION_GUIDE.md`. Take the first
> unticked phase in §8 of the guide (or the next unticked slice of it). Branch
> from `claude/boat-ride-checkin-list-7hwd19` and implement only that slice,
> following §2 (rules), §5 (the phase's "done when") and §6 (what the PR must
> contain). Build both editions, run the listed scripts, and attach the
> perf-probe numbers and screenshots. Tick the phase in §8 in the same PR, then
> open a pull request into `claude/boat-ride-checkin-list-7hwd19`.
