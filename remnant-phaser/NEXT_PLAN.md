# The next plan: a game worth two hours every day

Written 10 November 2026 at the owner's request, as a hand-off: "go over my application and create a plan that makes
this the ultimate game. Fix everything. Whoever plays it has to play every day for at least two hours. A lot of replay
value. Any detail that needs to be fixed." This file is that plan. `POLISH_PLAN.md` stays the record of what was built
and why; this file is what to build next, in order. Whoever picks it up (Claude Code, Codex) starts at "How to work",
then takes the first unticked phase.

## How to work (read first)

- The rules in `AGENTS.md` hold: branch from the default branch, one draft PR per phase, the owner merges, saves never
  break (new fields optional, repaired on load), Scripture is KJV word for word with its reference, `tsc` clean, no
  `shadowBlur`, no per-frame allocation, both settings files change together, load the matching skill first.
- Every phase ends with a script in `remnant-phaser/scripts/` added to CI, the docs updated (`AGENTS.md`,
  `PORTING.md`, this file's tick), and a confirmation that `version.json` on the live site shows the merge.
- Tick a phase here with its PR number when it merges. If a phase turns out wrong or too large, split it here first.
- **Measure before tuning.** Anything about pacing, difficulty or an economy gets a number before and after
  (`scripts/balance-report.mjs`, `scripts/watch-pace.mjs`, `scripts/perf.mjs` are the patterns to copy).
- **Questions for the owner are at the end, each with a default.** Do not stop for them: build the default, say so in
  the PR, and change it if the owner answers otherwise.

## What "every day, two hours" means here

The game is free, has nothing to sell, and runs from a static site, so the only honest way to get daily play is to
make each day different and each session leave the player stronger and wanting the next thing. The plan uses the
loops that keep people in Diablo, Hades, Vampire Survivors and the idle RPGs the Watch already borrows from:

1. **A reason to open it today** that did not exist yesterday (seeded daily content, a rotation, a visitor).
2. **A short list that can be finished** (about five things, 60–90 minutes if done well), with one shared streak.
3. **A long chase that never finishes** (gear with rolls, mastery, a Chronicle track, higher heat).
4. **A run that is different every time** (modifiers the player chooses, builds that change how a fight goes).
5. **Something to show** (a result card to share, titles, capes, a personal best to beat).

One rule the owner already chose for the Watch and that this plan keeps everywhere: **pull, never punishment.** A missed
day costs nothing already earned; streaks forgive one miss a week; nothing is timed to expire while the player sleeps;
there are no purchases and no odds that are not shown. Players who feel trapped leave for good; players who feel
rewarded come back for years.

**The daily budget the phases below add up to** (for a player past Chapter III; each line is a phase):

| Each day | Minutes | Phase |
|---|---|---|
| The Daily Challenge (exists: ten seeded waves, one ranked run) | 10 | B |
| The day's boss: one boss under the day's affliction, a medal for a flawless fall | 10 | C2 |
| Three bounties: named elites hidden in finished chapters | 25 | C2 |
| The day's Horde: a seeded run with the day's mutator | 20 | D1 |
| The Watch: quests, tower floors, three dungeon keys (and the wall idles beside all of it) | 20 | D2 |
| A chapter under the Refiner's Fire, or the gear chase, or the story | 30–45 | C1, C3 |
| **A full day** | **about 2 hours** | |

## What the audit found (10 November 2026)

Checked in the repository on this date; each is addressed by the phase named.

- **Progress lives in one browser.** Saves are `localStorage` only on the live site (the cloud copy works only inside a
  claude.ai preview). There is no export, no import and no `navigator.storage.persist()` call. An iPhone that clears
  site data, or a new phone, ends a player's game. Nothing loses a daily player faster. → A1
- **Every test run takes 46 minutes.** The `phaser` CI job runs about 60 scripts one after another, then the deploy takes
  about as long again. Every phase below pays that twice. → A2
- **One 3.9 MB script, nothing loaded on demand.** Every mode (the journey, the Watch, the Horde, all twelve chapters'
  art code) is in one chunk; there is no dynamic `import()` anywhere in `remnant-phaser/src`. → A3
- **`POLISH_PLAN.md` §9's checklist is stale.** Items 1 (combat feel), 2 (sound), 3 (ability effects) and 9 (gameplay
  polish) are unticked, but `combat-feel.mjs` and `sound-pass.mjs` exist and §15 re-tuned hit-stop. Nobody knows what
  is truly left. → A4
- **One test failed once and passed five times** (`watch.mjs`, 7 November). The cause was never found. → A4
- **The Horde keeps nothing between runs** but a best stage and counts (`PhaserSave.horde`). The genre it belongs to
  lives on permanent unlocks between runs. This is the largest replay gap in the game. → D1
- **A second playthrough is always the same one.** There is a New Game+ (Save & system, after Chapter I: begin
  again with level, gear, skills and Echoes; `startNewGamePlus`), and a finished chapter can be replayed with its
  bosses matched to the hero (`chapterReplay`). But nothing makes the tenth run different from the first, the player
  chooses nothing about it, and nothing rewards it beyond experience. → C1 (Corrected 11 November: the first version
  of this line said there was no second playthrough at all; the search behind it missed New Game+.)
- **The modes do not know about each other.** The journey, the Watch, the Horde and the Trial each have their own day
  (or none). There is no one place that says "here is today". → B
- **The daily challenge pays "a small bundle of materials"** and its board never leaves the device. → B, C5
- **Bosses default to Hard and nothing helps a stuck player.** There is no assist after repeated falls
  (`game/difficulty.ts`). A player who cannot pass the Gilded Idol never sees the other eleven chapters. → E2
- **Uri exists only in the Horde**, and Tirzah and Uri are promised to the Watch at levels 150 and 300 "in a later
  update". → D2, F
- **Art is waiting on drops** (`art/REQUESTS.md`: character retries, bosses B01–B10, foes, environments, icons). The
  older bosses are still vector shapes shaded at runtime. → E4 (as drops arrive; never blocks another phase)
- **The owner's frame-rate reading on the iPhone was never taken** (Settings → Show frame rate, POLISH_PLAN §19 phase
  6). Headless Chromium cannot measure the phone's GPU. → owner's task, then E3
- What is in good shape and should be left alone: the core combat numbers (§15, measured), saves' backup and repair,
  controller and text-size support, the Watch's economy pacing (measured, in CI), the feel layer, 82 CI checks.

## Phase A: the ground under everything (small, do first)

- [x] **A1. Progress that cannot be lost.** BUILT (`src/game/backup.ts`, `backupUi.ts`; `scripts/backup.mjs`).
  Menu → System → Save & system → **Keep your journey safe**: **Back up my journey** writes one file (the three slots
  with the Watch and the Horde inside them, the settings, and the Trial, Gauntlet, Rush, Extreme and Daily boards)
  through the share sheet where it takes files, else as a download; **Restore from a backup** reads one back, and is
  also on the home screen, where a new phone starts. A restore checks the whole file first (a file that is not a
  backup, a damaged one or one from a newer version is refused with the reason, and nothing changes), asks for a
  second tap, keeps each journey it replaces under `<key>.before-restore` (ordinary saves never touch that copy;
  **Undo the last restore** puts it back), stops this session saving on the way out, and reloads. The game asks the
  browser to keep its storage (`navigator.storage.persist()`) at start. The home screen says once a week that a
  backup is overdue after two hours of play and fourteen days without one. The original edition's own slots are not
  in a backup.
- [x] **A2. Tests in a quarter of the time.** BUILT: the `phaser-build` job builds once; the `phaser` job is a matrix
  of eight shards, each running its share of `scripts/ci-tests.txt` through `scripts/ci-shard.mjs` (every check runs
  even after a failure; failures are listed at the end; a script not in the list is named in the log). A new check is
  one more line in `ci-tests.txt`. Nothing was dropped: the same 54 checks.
- [ ] **A3. A faster first screen.** Measure first (first paint and time to the home screen on a throttled 4G profile,
  recorded here). Then load on demand what the first screen does not need: the Watch, the Horde, and each chapter's
  environment and boss modules (`render/env*.ts`, `game/bosses*.ts` are the largest files in the repository). The
  service worker still precaches all of it after the first screen, so offline play is unchanged. Target: the home
  screen's script under 1.2 MB. Test: `home.mjs` plus a new size check that fails if the first chunk grows past it.
- [ ] **A4. Know what is truly left.** Go through POLISH_PLAN §9 items 1, 2, 3, 8's "still to come" and 9, and §2, §3,
  §4, §7's bullet lists, and for each bullet either point to the code and test that does it and tick it, or list it
  under E1 below. Also run `watch.mjs` twenty times under CPU throttling to catch the failure of 7 November; make any
  test that draws on `Math.random` use a seed (a `?seed=` debug parameter), so a failure can be replayed.
- [ ] **A5. A walk through the whole game by machine.** A script that starts a fresh save and, with the debug API's
  god mode, goes room to room through all twelve chapters to each chapter-end screen, failing on any page error, any
  room that cannot be left, any quest stage that does not advance and any boss that does not appear. It finds the
  softlocks no single-feature test looks for. Run it nightly in CI (not on every push; it is long).

## Phase B: one day for the whole game (the spine of daily play)

- [x] **B1. The Day** (built; `scripts/day.mjs`. Calls come from what exists today: the journey, parries, the chains, a boss, the Trial, the Daily Challenge, the Horde, the Watch. The day's boss, bounties, the day's Horde and the Fire join the pool as C1, C2 and D1 land: add a row to `DAILY` in `day.ts`.) (`remnant-phaser/src/game/day.ts`, save field `PhaserSave.day`, optional). One object for the
  local day, seeded by the date like `game/daily.ts`:
  - **Five calls** drawn from what is open to this player (the Daily Challenge, the day's boss, a bounty, the day's
    Horde, a Watch quest set, a chapter under the Fire, a Trial round reached). Never a call for a mode still locked.
  - **Three weekly calls**, larger.
  - **One streak for the whole game**, the Watch's rule: one missed day a week forgiven. The Watch's own streak folds
    into it (migrate: keep the longer of the two).
  - Each call pays **Chronicle marks** (B2) and something for the mode it belongs to.
- [x] **B2. The Chronicle** (built: silver, materials, Watch chests, a legendary piece at 10/20/30, the month's cape at 15, an owed list bought back with spare marks. Still to add as rewards: blade glows, hit-spark and number styles, title banners, Watch wall themes, a Psalter Page; marks from play outside the calls.) (a free track, a new one every calendar month): 30 steps, marks from the Day's calls and
  from play in every mode. Each step pays something visible and code-made, so no art drop is needed: cape dyes
  (`fighterRig.ts` already dyes capes), blade glows, hit-spark and damage-number styles, title banners, Watch wall
  themes, a Psalter Page, a sealed legendary piece at steps 10, 20 and 30. A finished Chronicle stays finished; an
  unfinished one closes at the month's end and its unearned steps go into a "Past Chronicles" list that can be bought
  back slowly with later marks (nothing is gone for ever). Odds, where anything is random, are shown.
- [x] **B3. "Today" on the home screen.** (built; tested in `scripts/day.mjs`) The journey card stays first; under it one card: the five calls with a tick
  each and how long each takes, the streak, the Chronicle's next step, and the one button that starts the first call
  not yet done. The eight mode cards stay below. Test in `home.mjs`: the card, the routing, a locked player's version.
- [ ] **B4. Remnant's Rest as the place the day happens.** The settlement already grows by tier. Add a **noticeboard**
  (the Day's calls, in the world), a **daily visitor** (one of the rescued, with a request: a bounty, a delivery of
  materials, a duel) and **projects** that take materials over days and give lasting things (a training yard that
  raises a mastery cap, a forge fire that improves Dov's reforge odds). This is also the game's missing material sink.

## Phase C: reasons to play the journey again

- [ ] **C1. The Refiner's Fire** (Partly built, `scripts/fire.mjs`: Replay offers four conditions (Tried Metal ×1.4 health, heat 1; Hotter Coals ×1.3 blows, heat 1; Fasting, no Balm, heat 2; Seven Times Hotter ×1.3 health and ×1.2 blows, heat 2), seals I/II/III at heat 1/3/5 shown on the Chapters page, each tier paid once. Still to do: more conditions (elites in every room, a time limit, a rival), better legendary odds and marks by heat, a Day call, and the blows-to-fell table measured per tier.) (per finished chapter, and on top of the New Game+ that exists, not in place of it). At a
  chapter's start the player sets its heat by choosing conditions, each worth points: foes faster, foes tougher,
  elites in every room, no Balm, a time limit, bosses with a second phase pattern earlier, a rival hunting the player
  through the chapter. More heat: better legendary odds, more marks, and a **refined seal** per chapter per heat tier
  (shown on chapter select) with a reward the first time each tier is cleared. It builds on `chapterReplay`, `might.ts`
  and the daily challenge's `DAILY_MODS`. Balance by measurement: at heat 0 nothing changes; each tier is sized so a
  balanced build at the arrival level takes a set number more blows (record the table here).
- [ ] **C2. The day's boss and bounties.** (The day's boss is built, in `day.ts` and `scripts/day.mjs`: a finished chapter's last boss chosen by the date, under one of the Fire's conditions, started from the Today card, paying a legendary piece once a day. Still to do: bounties, and the flawless medal.) The day's boss: one boss beaten so far, chosen by the date, under one
  affliction, with a medal for a fall without being hit (it feeds Valor's flawless titles). Bounties: three a day, a
  named elite with a legendary power of its own placed in a seeded room of a finished chapter, with a hint, not a
  marker. Each pays a legendary roll weighted toward powers not yet in the Codex.
- [ ] **C3. Gear worth hunting.** The loot loop needs more room at the top:
  - **Rolls with ranges** on Epic gear and up (shown as a bar: where this piece sits in its range), and a rare
    **Refined** quality whose ranges are higher.
  - **Reforge at Dov**: re-roll one line for materials and Relic Shards, with the odds shown.
  - **Sets**: four sets of five pieces, bonuses at two and four, each changing a play style (parry, Echoes, the
    Mantle, the bow). They drop from the Fire and bounties only.
  - **Comfort**: a comparison against what is worn on every tooltip, a loot filter (auto-mark below a rarity as junk),
    a "new" dot. Without these a long session is spent in menus.
- [ ] **C4. Mastery.** A track per weapon type and per Echo species, raised by using it: small bonuses, a new move or
  a cosmetic at set levels, and a reason to change build. The Bestiary pays a small bonus against a kind at kill
  counts. Mastery shows on the character page as one screen.
- [ ] **C5. Bests, medals and something to show.** Per chapter: a clock with a par time, a count of secrets, a
  flawless-boss mark, and three medals. After any ranked run (the Daily Challenge, the day's boss, the day's Horde) a
  **result card** drawn to a canvas (the date, the rules, the score, the build's three main pieces) and handed to
  `navigator.share`. It is the leaderboard a static site can have: players compare the same seed by sending the card.
- [ ] **C6. More of the interconnected chapters.** The Chapter I pilot (`pilot.ts`: a loop behind a bar, ledges for the
  Eagle Plume and the air dash) extended to Chapters II–VI: per chapter one loop, one ability-gated shortcut and three
  hidden rooms with a lore scroll each. Secrets feed C5's count.

## Phase D: the other modes, each made to last

- [ ] **D1. The Horde, between runs.** (Partly built, `scripts/horde-board.mjs`: embers, the permanent board (a full board measures ×1.66 in damage × health ÷ cooldown and costs 1,950 embers, about seventeen ordinary runs; ten runs buy roughly ×1.4), three hardships for more embers, and the Long Night, a run that ends when its fifth monarch falls. Still to do: weapons and passives unlocked by deeds, the day's Horde with a ranked run and a result card, and a Day call for it.) A run currency (embers) kept after each run buys a **permanent board** of small
  upgrades (might, health, pickup reach, one more reroll, one more banish, a starting level), **weapons and passives
  to unlock** by deeds (reach stage 5 with Tirzah, evolve three weapons in one run), and **mutators** for the stage
  select. Add a **30-minute run with an end** (a final monarch and a results screen) beside the endless one, and the
  **day's Horde** (seeded weapons offered, one mutator, one ranked run, a result card). Save: extend
  `PhaserSave.horde` with optional fields. Measure the board so the tenth run feels about 40% stronger than the first,
  never three times.
- [ ] **D2. The Watch, to the end of its plan.** In order: the **boss tower and daily dungeons** the owner chose
  (POLISH_PLAN §18k: one floor a try, milestone rewards; three keys a day each for coins, essence and relic ranks);
  **the forms** (the Unshorn and the Sovereign on the wall); **Tirzah at Watch level 150 and Uri at 300**; **gear with
  merging** and **expeditions** (§18f) only if the tower and dungeons leave the wall wanting. Re-run `watch-pace.mjs`
  after each.
- [ ] **D3. The Trial, the Gauntlet and the Rush.** A weekly rule set for each (the daily challenge's modifiers), a
  medal time, and their bests on the result card. The Trial's Game Over card offers "again with the same build".
- [ ] **D4. Uri on the journey.** The third hero outside the Horde: his kit (flame-calling, the orc shaman) as a
  playable fighter in the chapters and as the AI partner, with his own page in the pause menu like Tirzah's. Large;
  it needs his animation sheet from the art requests. Do it after C and D1.

## Phase E: fix everything (quality)

- [ ] **E1. What A4 finds left** of combat feel (§2), the sound pass (§3), ability effects (§4), the store's leftovers
  (quiver upgrades, recipe scrolls, Echo imprint tokens, "new item" dots) and gameplay polish (§7: ledge forgiveness,
  landing recovery, clearer Echo orders, a stinger and a framing beat on every boss phase). One PR per section.
- [ ] **E2.** (Partly built: after three falls to the same boss the player is offered, once, to take heart: that boss strikes 15% lighter and has 10% less health until it falls. Tested in `scripts/fire.mjs`. Still to do: first-session timing and paced mode cards.) **(original text:)**  Nobody stuck, nobody lost.**
  - After three falls to the same boss, offer once (never force): "Lower the boss's difficulty for this fight?" and,
    separately, a short card naming the one move that fell the player most. Setting: Challenge → Offer help (on).
  - Time the first session by machine: from Begin to the first fight (target under 60 seconds), to the first boss
    (about 15 minutes), to the first legendary (about 30). Fix whatever misses.
  - The home screen for a brand-new player shows the journey and at most two modes; the others arrive one at a time
    with a "new" mark as they open, so eight cards never greet a first visit.
- [ ] **E3. The phone, measured.** When the owner sends the frame-rate reading (frame time and the script's share, in
  the busiest boss fight, the Horde at stage 5 and the Watch at ×3), act on it with the `performance-optimization`
  skill: the script's share points to code, the rest to draw calls and filters. Until then change nothing.
- [ ] **E4. Art as it arrives.** Each drop goes through `art/tools/review.py` and the manifest; the older bosses move
  from runtime shading to painted atlases as B01–B10 arrive; animation frames A01–A04 replace the code-made
  placeholders. Never ship from `art/incoming/`.
- [ ] **E5. The small things, swept.** One pass per screen with a fresh eye, on an iPhone SE and a 15 Pro, upright and
  sideways: text that wraps badly, buttons under the island or the home bar, toasts that cover each other (the Watch's
  gate and relic toasts were one case), numbers without units, a control with no focus ring, a sound that clips. Keep
  the list in the PR; fix all of it.

## Phase F: more story (the owner decides)

**Chapter XIII, The Stones of Fire (Ezekiel 26–28), is built** (the owner asked for the next chapter on 10 November; `remnant/FALLEN_CHAPTERS.md`, `scripts/tyrus.mjs`). Beyond it, a second book is the largest thing that could be added and the slowest to make;
the systems above give more play per week of work. When the owner wants it, the pattern is the Fallen Crown builder
(`game/fallenChapters.ts`): a chapter is a table of rooms, a `DRESS` entry, a curve row and one boss module.

## The order, and why

1. **A1, A2** first: nothing else is safe to build on saves that can vanish, and every later phase is twice as fast
   with short tests.
2. **B1–B3**: the Day is the frame every other daily thing hangs on. Build it with the calls that already exist (the
   Daily Challenge, the Watch's quests, a Trial round), so it ships useful, then each later phase adds its call.
3. **D1** (the Horde between runs) and **C1** (the Fire): the two largest gaps in replay value.
4. **C2, C3**, then **D2** (the tower and dungeons), then **E2**, **A3**, **C4, C5**.
5. **A4, A5, E1, E5** fit between the larger phases; **E3, E4** whenever their inputs arrive.
6. **B4, C6, D3, D4, F** last.

## Questions for the owner (the default is built unless you say otherwise)

1. **Reminders.** A web app can only send a notification through a push server, and this game has no server. Default:
   no notifications; the streak and the Today card do the reminding. The alternative is a small free relay (a
   Cloudflare Worker), which means an account for you to own.
2. **A real leaderboard.** The same answer: it needs a server. Default: result cards to share (C5).
3. **Boss difficulty for new players.** Default: stays Hard, with the offered help of E2. The alternative is Normal for
   a new journey.
4. **The Chronicle's month.** Default: a calendar month, and missed steps can be earned back later. The alternative is
   no seasons at all, one endless track.
5. **Uri on the journey (D4) or a new book (F) first?** Default: Uri.
6. **The frame-rate reading** (E3) is yours to take: Settings → Show frame rate, then a boss fight, the Horde at stage
   5 and the Watch at ×3. Send the two numbers for each.
