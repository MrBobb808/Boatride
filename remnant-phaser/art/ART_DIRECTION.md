# Art direction: Remnant: Ascension

The visual contract for every image made for the game (POLISH_PLAN §19 phase 7, after the create-game-assets skill in
`.claude/skills/`). It is written from the art that already ships, measured on 7 November 2026, so new pieces join
that art rather than start a new look. `REQUESTS.md` says what to make, `README.md` how to store and record it; this
file says what it must look like. Where they differ, this file wins on looks and `README.md` on files.

## Game frame

- **Fantasy:** a human servant of God withstanding fallen powers in the world of the book of Daniel, and the Remnant
  he gathers. Dark, reverent, hopeful: light wins slowly, never cheaply.
- **Verbs:** run, jump, cut, punch, shoot, parry, dodge, call Echoes, transform.
- **Engine:** Phaser 4 (WebGL), pixel art drawn hard-edged (`pixelArt: true`, nearest filtering, no smoothing).
- **Target:** the owner's iPhone in landscape, at 120 Hz; also desktop and a PS5 pad.
- **Camera:** strict side view (the Horde is top-down; the Watch is a portrait side view). Every figure faces
  **right**; the game mirrors it.
- **Scale on screen:** the view is about 270–300 world pixels tall, so one world pixel is about four of the phone's
  pixels. A hero or a humanoid foe stands **54 world pixels** tall (about a fifth of the screen), a beast 37–44, a
  boss two to four times a man.

## Visual system

### Shape and silhouette

- Heroes are upright and compact, with one strong flowing shape each (Elior's cape, Tirzah's braid and cloak, the
  Unshorn's mane and tail of fire). That shape must never merge with the body at 54 px.
- Foes lean forward and are heavier at the top (shoulders, shields, horns); beasts are long and low. A foe's weapon or
  claw is its brightest, most separate shape, so the player can read the attack.
- Bosses are built on one big readable silhouette (the horn, the crown, the scales, the wings) that stays the same in
  every frame.
- Holy and Echo light is round and rising; fallen power is jagged, torn and falling.

### Value

Three bands. **Dark** (outline and deep shadow, under 10% luminance) holds the shape; **mid** (the material colours)
carries identity; **light** (rim and highlight, the top 10%) is spent only on the edge that faces the light, on
weapons, eyes and magic. A character must read in greyscale against both a dark room and the pale Valley of Bones.

### Palette roles

The swatches are the dominant colours measured from the shipping sheets. Match the role; the exact hex may move a
step.

| Role | Swatches | Where it lives |
|---|---|---|
| Outline and deepest shadow | `#080202` `#040103` (warm near-black, never pure `#000`) | every character and foe |
| Elior's cloth | burgundy `#741218`, deep `#3a0b0d`; charcoal coat `#272227` `#140e0f` | `src/assets/fighter-parts-v1.png` rows 1–2 |
| Elior's skin and leather | `#875331` `#53271f`; leather and gold `#b3875c`; light `#ead1a4` | same |
| Tirzah | teal `#21393c`; gold trim `#b99460`; leather `#693a1f`; charcoal `#1e1715` | `fighter-parts-v1.png` rows 3–4 |
| The Unshorn's fire | ember `#b66228` `#dc9640`, red `#b83424`, white-gold `#f2d67f` | `src/assets/fighter-parts-unshorn.png` |
| Shadow Mantle and the Veil | violet `#650684` `#37033c` over black | `remnant/src/assets/foes-veil.png` |
| Ashen foes | ash mauve `#2b1f25` `#4c3437` `#836a63`, old blood `#59212b` | `remnant/src/assets/foes-ashen.png` |
| Fallen Crowns | hunt browns `#332424` `#754733`; cinder rust `#822b12` `#a44019` | the Varkhos and Azkar atlases |
| Holy light, blows, slashes | white `#fbfbf3`, gold `#fcdf6b` `#fbc535` `#f8ab1f`, warm edge `#e48a1e` | `src/assets/vfx-slashes.png` |
| Critical | red over the gold | `src/assets/vfx-impacts.png` row 2 |
| Parry, frost, water | blue-white rings | `vfx-impacts.png` row 4 |
| Dawn (Tirzah's wings) | dawn gold, white, pale teal | `vfx-archer.png`, `vfx-transform.png` rows 3–4 |
| Places | each chapter's sky, ground and ambient colour | `BIOMES` in `remnant/src/render/environment.ts` |

Gold means grace and reward; red means danger or blood; violet means shadow (the Mantle's, or the Veil's); green-gold
means healing. Keep each meaning: never a gold foe attack, never a violet heal.

### Edges and light

- **Outline:** a dark, confident outline, one or two pixels at the 54 px scale, warm near-black, broken only where a
  rim light runs along it.
- **Light:** key and rim light from the **front and above** (the right side and top edge, the way the figure faces).
  Measured on every shipping sheet: the right and top edges are brighter than the left and bottom. Shadow falls left
  and below.
- **Shading:** two or three flat tones per material, in clusters; no gradients, no soft airbrush, no noise texture.
- **Materials:** metal is a hard highlight on dark; cloth is two tones with a lighter fold edge; skin is warm with a
  single highlight; fire and holy light are white at the core, fading through gold to a warm edge.

### Detail and motion

- Detail goes to the face, the hands and the weapon. Coats, armour and capes are big flat blocks with thick trim
  (C01's review: fine filigree turned to noise at 56 px).
- Motion is weighty and clear: a held wind-up, a fast strike, a short recovery. Cloth and hair trail the body. Effects
  play left to right in their row and point or travel **right**.

### Never

Photorealism or soft painting; text, labels, numbers, grid lines, borders or watermarks inside an image; frontal or
three-quarter views of side-view parts (C05's wings); a figure crossing its cell edge; baked floor shadows or scenery
behind a sprite; a coloured matte or haze around effects (V09's red halo, V09-b's haze); real-world logos or franchise
designs; gore beyond the existing tone; burgundy in the Shadow Mantle (C03). Elior, Tirzah and Uri stay human in every
form; Echoes are luminous constructs, never ghosts of people.

## Technical contract

| | Heroes (cut-out parts) | Foes | Bosses | Effects | Backgrounds | Icons |
|---|---|---|---|---|---|---|
| Source cells | 5×2 parts, 256 px | 8 per row, 128 px | 4×4, 384 px | per request, 128–256 px | 2048×640 per layer | 64 px (96 for abilities) |
| Shipped as | `fighterRig.ts` parts, baked to atlases | 96 px cells | per-boss atlas | Phaser sheets | parallax layers | sheets |
| Pivot | each part's joint (top of the limb; the hand's grip for weapons) | feet, bottom centre on the baseline | feet on y=360 | the centre (a slash: the hand at the left) | top left | centre |
| Baseline | n/a | y=116 in the source; 88 in the shipped 96 px cell | y=360 | n/a | n/a | n/a |
| Background | transparent | transparent | transparent | transparent, bright shapes made to be added as light | `-far` opaque; `-mid`, `-near` transparent | transparent |
| Height on screen | 54 world px | 37–54 world px | 100–220 world px | per effect | the view, 270–300 world px | the menu's size |

- **Filtering:** nearest everywhere; nothing is mipmapped. Claude normalises every source (`tools/sheet.py`,
  `tools/parts.py`, `tools/cc0.py`); a generated image is never resized by hand.
- **Grids:** the cell size a request gives is the target, but any **equal** grid with the right count works (the
  generator rarely hits the exact canvas). Nothing may cross a cell edge, and the gaps must be fully transparent.
- **Budgets:** a source under 4 MB; a shipped sheet packed as tightly as the fighter atlases (one 2048 px texture at
  most per family).
- **Names:** `incoming/<category>/<ID>-<name>[-b|-retry].png`, recorded in `manifest.json` (fields in `README.md`).

## Families

New art is made in **families**: one approved piece (the seed) sets the look, then its siblings are made against it,
in small batches, with the seed attached. A family keeps its seed's palette, outline, light, proportions and pivot.

| Family | Seed (approved) | Siblings to make against it |
|---|---|---|
| Hero parts | `src/assets/fighter-parts-v1.png` (Elior rows 1–2, Tirzah rows 3–4) | C01–C04 retries, C08–C10 (Uri, the Crown of Flame, the orc shaman), A01–A02 |
| The Unshorn | `src/assets/fighter-parts-unshorn.png` | its future poses and effects |
| Combat effects | `src/assets/vfx-slashes.png` (V01), `vfx-impacts.png` (V02) | V07 loops, V08 retry, status and world effects |
| Ability effects | `src/assets/vfx-abilities-1.png` (V03) | V04's Chain Snare row, the archer's V05 follow-ups |
| Foes | `remnant/src/assets/foes-ashen.png` | F01–F05 |
| Fallen Crown bosses | `remnant/src/assets/varkhos-hunt-atlas.png` | B10 extra frames, then B01–B12 |
| Places | none yet: E01 first, in Chapter I's `BIOMES` colours, beside its live parallax | E02–E14, one chapter at a time |
| Icons | none approved yet: the first sheet made becomes the seed once approved | I01–I04 |

## How a piece is approved

1. **Technical check:** `tools/review.py` (see `README.md`) checks every delivered file: it reads, it is under 4 MB,
   its background matches the request, its grid divides into equal cells, and nothing solid sits on a cell edge.
2. **At three distances** (the skill's rule): the contact sheet (`tools/build_preview_sheet.py`) at working scale; the
   piece at its 54 px game scale; and in the game, beside its neighbours, in a dark room and in a bright one.
3. **Approval:** Claude records the checks in the entry's `validation` and sets `approval` once the integration PR is
   merged by the owner, who approves every piece that ships. A piece that is attractive alone but belongs to another
   look is rejected, with a refined prompt added to `REQUESTS.md`.
