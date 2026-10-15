# Remnant: Ascension

A 2D side-scrolling biblical dark fantasy action RPG. You play Elior, the
weakest watchman of a ruined village. You learn to purify defeated champions
into **Covenant Echoes** and lead them as a remnant.

The game is not about becoming a god. Echoes are battle-imprints made clean,
not souls, and Elior stays human from start to finish. Scripture shown in the
game is quoted from the King James Version and always cited. Everything else
is original fiction inspired by biblical themes, not part of the Bible.

> *True greatness is not found in the power to rule, but in the strength to remain faithful.*

This build contains three chapters:

- **Chapter I — The Ashen Village.** 12 rooms, the full combat and Echo
  systems, abilities and skill trees, gear, crafting and merchants, and the
  **Gilded Idol** boss fight.
- **Chapter II — The Tower of Shinar.** Nine rooms across a dusk plain, a
  brickworks and a red tower. It adds:
  - Heavy foes (Ironbound Brutes, Shieldwall Bulwarks and Crimson Knights)
    that break into a long, juggleable stagger.
  - **The Gatekeeper**, a three-headed hound chained at the tower gate.
  - The Crimson Guard's three waves.
  - **The Crimson Marshal**, an honour duel your Echoes may not join. When
    he kneels, you choose: raise him as your strongest Echo, or let him rest
    and take his sword.
- **Chapter III — The Valley of Bones.** Ezekiel's valley, stripped bare by a
  locust swarm that has built a hive inside the bones of giants.
  - Locust drones swoop in packs, and locust soldiers fight with scythe claws.
  - **The Locust King** hatches from a cocoon in the brood chamber. He is
    blindingly fast and has claw strings, aerial dives, acid and a paralysing
    screech; he calls his swarm and devours his own drones to heal. Beaten,
    he is raised as your Echo.
  - **The Trial of the Remnant** is an endless wave arena that keeps pace
    with your level. It is the way to level 100 and beyond.
- Each chapter has an ending, plus New Game+.

Each chapter begins from the previous chapter's ending screen, or from any
altar once that chapter is done (**Journey east**, **Journey on**).

### Saving, directions and updates

- **Saving:** the game saves itself every 30 seconds, on every doorway and
  whenever you leave the app. The title screen's **Continue** shows where you
  are. If you fall, you rise again at the doorway of the room you were in.
- **Cloud copy:** in the claude.ai preview each player's saves are also kept
  in a private cloud copy.
- **Directions:** a golden marker shows the way to your next objective. An
  arrow at the screen edge points toward it when it is out of view, the map
  marks it with a star, and a hint appears if you seem lost. You can turn it
  off under **Settings → Objective marker**.
- **Updates:** the installed app checks GitHub Pages for a newer build when
  it opens or comes back to the front. When it finds one, it installs it at
  the next doorway and puts you back where you were.

### Combat highlights

- **Phantom Step:** land a hit, then dodge to blink behind the nearest foe.
  Chain blinks around a crowd; after the third, attack for **Judgment
  Cross**, a launching cross-cut.
- **New combos:** Seventy Times Seven (thrust flurry), Storm of Edges (a
  whirl that pulls foes in), Rising Comet and Heaven's Rend. A combo counter
  ranks long strings. The full move list is in **Menu → Skills**.
- **Switch support:** tag in a benched Echo mid-strike, or trade places
  with one on the field.
- **A growing army:** more Echoes can fight at once as you level: seven by
  level 26, then one more at 50, 75 and 100 (ten in all).
- **Finishers:** executing a staggered foe plays a slow-motion finisher,
  picked at random from those your level has unlocked. They are:
  - Judgment Leap.
  - Shadow Step, a teleport behind the foe and a stab through the back.
  - Cross Severance.
  - Thousand Cuts.
  - Heaven's Verdict.
  - Whirlwind Requiem.
  - Elemental Ruin.
  - Arise.

  Killing blows can also cut foes in two under a slow-motion kill cam.
- **Power that grows:** at levels 10, 20, 35, 50 and 75 your strikes get
  bigger, brighter and heavier. From 35, finishing blows send out sword
  waves.
- **Elemental weapons:** each element has its own colours and on-hit effect.
  - Fire burns.
  - Frost slows.
  - Storm chains lightning.
  - Shadow drinks life and strikes twice.
  - Light sears great foes.
  - Crimson makes foes bleed.
- **Level 100, the Sovereign:** a black-and-gold form with violet eyes.
  - Every swing looses a crescent.
  - Phantom Step costs nothing.
  - Ordinary blows cannot stagger you.
  - Fallen foes may rise to fight for you.

## Play it on iPhone

The game is a single self-contained web page. Once it is installed to the Home
Screen it works offline, fullscreen and in landscape.

1. Open **https://mrbobb808.github.io/Boatride/** in **Safari** on the iPhone.
2. Tap **Share** (the square with the arrow), then **Add to Home Screen**.
   Make sure **Open as Web App** is on, then tap **Add**.
3. Launch **Remnant** from the Home Screen and turn the phone sideways.

Once it has been opened, it keeps working with no connection. When a new
version is published, it updates the next time you open the app while online.

**Saves.** iOS keeps the Home Screen app's storage separate from Safari's, so
a game started in a Safari tab does not appear in the installed app. To move a
save across:

1. On the side that has the save, open **Menu → Settings → Save backup** and
   tap **Copy save code**.
2. On the other side, open **Title → Settings → Save backup**, paste the code
   and tap **Import into this slot**.

The same code works for backing up a save, or for moving it to another
device.

Tip: by default the game plays sound even when the iPhone is set to silent.
Turn on **Settings → Audio → Respect the silent switch** if you want the
switch to mute the game and leave your own music playing.

### Publishing the page (one-time setup)

The workflow in `.github/workflows/remnant-pages.yml` builds the game and
deploys it to GitHub Pages on every push to the default branch that touches
`remnant/`. To set it up:

1. In the repository, go to **Settings → Pages → Build and deployment → Source**
   and choose **GitHub Actions**.
2. Merge the game into the default branch, or run the workflow by hand from
   the **Actions** tab.

## Controls

### Touch (iPhone)

| Control | Action |
|---|---|
| Left half of the screen | Floating stick: move. Push down while airborne and attack to plunge. |
| **Attack** (large button) | Tap for a combo; hold to charge a heavy; push up on the stick and tap for a launcher |
| **Jump** | Jump (double jump after the Plume) |
| **Dodge** | Dash with invulnerability frames; air dash |
| **Parry** | Tap just before a hit to parry; hold to block with a shield; a parry or block opens a counter |
| Skill buttons | The three equipped Covenant abilities |
| **Balm** | Heal |
| **Echoes** | Echo command wheel: summon or dismiss, Aggressive / Defensive / Follow stance, mark target, recall, sync strike, switch |
| **Switch** | Switch support: the next Echo tags in, or you trade places with one. It appears while Echoes are out. |
| **Rally** | *Rally the Remnant* (once the gauge is full) |
| Context button | Talk, open, rest, purify. It appears only when something is in reach. |
| ☰ and map (top corner) | Menu and map |

The **Settings → Touch controls** section adjusts button size, opacity and
left-handed layout, and turns haptics on or off.

### Keyboard and mouse

| Key | Action |
|---|---|
| A/D or ←/→ | Move |
| W / S | Up (launcher, interact) / down (plunge, drop) |
| Space | Jump |
| J or left click | Attack (hold to charge) |
| K or right click | Heavy / charged attack |
| Shift or L | Dodge / air dash |
| I | Parry / block |
| Q, E, R | Abilities |
| H | Balm (heal) |
| C | Echo command wheel |
| X | Switch support Echo |
| T | Rally the Remnant |
| F | Interact / purify |
| M | Map |
| Esc or Tab | Menu |

Every key can be rebound in **Settings → Keyboard**.

### Controller (standard layout, Xbox names)

| Button | Action |
|---|---|
| A | Jump |
| B | Dodge |
| X | Attack |
| Y | Heavy |
| LB | Parry / block |
| RB / LT / RT | Abilities |
| R3 (right stick click) | Rally the Remnant |
| L3 (left stick click) | Echo command wheel |
| D-pad ↑ | Interact |
| D-pad ↓ | Balm |
| View | Switch support Echo |
| Menu | Menu (the map is a tab inside it) |

## Development

```sh
cd remnant
npm install
npm run dev        # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm run build      # type-checks, then writes dist/ (index.html + PWA files)
npm run preview    # serves dist/
```

Debug helpers are available when you add `?debug` to the URL.
`?debug&autostart` skips the title screen and starts a new game.

### How it is built

- **Code:** TypeScript and Vite, with no game engine and no image assets.
  - Characters, environments, icons and effects are all drawn procedurally on
    a Canvas 2D renderer.
  - The renderer uses skeletal animation, cloth physics, a lighting pass and
    bloom.
- **Audio:** music and sound effects are synthesized live with Web Audio.
- **Build output:** `vite-plugin-singlefile` inlines everything (code, styles
  and fonts) into one `index.html`. The manifest, service worker, icons and
  launch images are copied next to it from `public/`.
- **iPhone tuning:**
  - ProMotion 120 Hz with a fixed 120 Hz simulation step.
  - Safe-area aware HUD and controls, clear of the Dynamic Island and the
    home indicator.
  - No `shadowBlur`, which is slow in Safari.
  - Pre-baked tile chunks and pooled particles.
  - Automatic quality scaling.
- **Fonts:** Cinzel and Cormorant Garamond, used under the SIL Open Font
  License.

| Path | Contents |
|---|---|
| `src/core` | Loop, math, input, settings |
| `src/render` | Renderer, camera, skeleton, characters, environment, lighting, effects |
| `src/audio` | Sound effects and the music sequencer |
| `src/game` | World, player, weapons, enemies and tanks, Echoes, bosses, rooms, story (one file per chapter), data, saves |
| `src/ui` | HUD, touch controls, menus, screens, dialogue |
