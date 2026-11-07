# Art drop for Remnant: Ascension

This folder is where **ChatGPT generates and stores images**. **Claude Code**
then turns them into the game's sprites, effects and backgrounds.
`ART_DIRECTION.md` says what the art must look like, `REQUESTS.md` lists what
to make, and `manifest.json` records what has been made.

```
remnant-phaser/art/
  README.md        this file: the rules for both sides
  ART_DIRECTION.md the look: palette roles, outline, light, sizes, pivots, families
  REQUESTS.md      the image list, with an exact prompt and spec for each
  manifest.json    one entry per image that has been delivered
  incoming/        raw generated PNGs, exactly as generated, never edited
    characters/  bosses/  foes/  vfx/  environments/  icons/  ui/
```

Free assets from elsewhere go in `incoming/cc0/` (CC0 only, or a licence that allows a public repo), listed in
`incoming/cc0/CREDITS.md`, kept exactly as downloaded, and built by `tools/cc0.py`.

## Rules for ChatGPT (making and storing images)

1. **One request at a time, in `REQUESTS.md` order.**
   - Save each image to `incoming/<category>/<request-id>.png`, for example
     `incoming/characters/C01-elior-parts-v2.png`.
   - If you make more than one take, add `-b`, `-c` and so on.
2. **Never edit, resize or recolour an image after generating it.** Claude does
   all normalising. Raw files let it re-crop if a spec changes.
3. **Formats.**
   - Use transparent PNG for everything except full backgrounds; backgrounds
     are opaque PNG.
   - Keep each file under 4 MB.
   - A sheet must be an exact grid of **equal cells**, with no labels, grid
     lines, borders or watermark.
   - Each request states its columns, rows, cell size and baseline. Follow
     them exactly: an uneven grid cannot be used.
4. **Facing and scale.** Characters, foes and bosses face **RIGHT** in strict
   side view (the game mirrors them). Feet sit on the stated baseline in every
   cell. Keep the same body size in every cell.
5. **Style.** Follow `ART_DIRECTION.md`. In short, premium dark-fantasy 2D pixel art:
   - crisp square pixels and confident dark outlines;
   - a limited, coherent palette;
   - readable when shrunk to a 48–60 px tall character;
   - no photorealism and no soft painting.

   Keep the established designs:
   - **Elior:** an adult Black man with dark warm-brown skin, short white hair
     and a short white beard. He wears a charcoal/black coat with gold edges,
     a burgundy scarf and cape, leather armour and boots, and carries a
     silver-gold sword.
   - **Tirzah, the archer:** an adult Black woman with warm-brown skin and a
     long black braid. She wears a teal and charcoal tunic with gold trim and
     bracers, and carries an ivory-and-gold recurve bow.

   See `../src/assets/fighter-parts-v1.png` and `../src/assets/tirzah-v2.png`.
6. **Content.** It's a biblical dark-fantasy game:
   - no gore beyond the existing tone;
   - no real-world logos or franchise designs;
   - no text inside images;
   - Elior stays human, and Echoes are luminous constructs, not ghosts of
     people.
7. **Work in families** (`ART_DIRECTION.md`, Families). Attach the family's
   approved seed image to every prompt for a sibling, make siblings in small
   batches, and change one thing at a time when retrying. A family with no
   approved seed makes its first piece alone and waits for its approval.
8. **Record every delivered image** in `manifest.json` (format below), in the
   same commit as the image. Commit to a branch, and open a pull request into
   `claude/boat-ride-checkin-list-7hwd19` titled `Art drop: <ids>`.

### `manifest.json` entry

```json
{
  "id": "C01",
  "file": "incoming/characters/C01-elior-parts-v2.png",
  "request": "Elior parts sheet v2",
  "grid": [5, 4],
  "cell": [256, 256],
  "baseline": 232,
  "facing": "right",
  "background": "transparent",
  "prompt": "the exact prompt used, verbatim",
  "notes": "anything that differs from the request (e.g. a part that came out weak)",
  "status": "delivered",
  "pivot": "feet, bottom centre on the baseline",
  "licence": "The project's own: generated with ChatGPT's image tool for Remnant: Ascension",
  "approval": { "state": "pending", "native_scale": false, "in_engine": false, "by": "" }
}
```

- `status` is the piece's state: `delivered`, then `integrated` or `rejected`.
- `pivot` is the point the game holds it by (the table in `ART_DIRECTION.md`).
- `licence`: the project's own for generated art; for anything from elsewhere,
  its licence (CC0 preferred) and where it is credited.
- `approval` starts `pending` (`reference` for a design board that will not
  ship).

Claude changes `status` to `integrated` (with the PR number) or `rejected`
(with a reason) once it has used the image, and adds a `review` note. It also
records the size it measured (`actual_size`), the checks (`validation`), and
the `approval`: `native_scale` and `in_engine` once it has been seen at 54 px
and in the game, and `approved` when the owner merges its integration.

## Claude's tools

`tools/review.py` checks delivered art against the manifest: it reads, is
under 4 MB, matches its background, and has nothing solid on its inner cell
edges (a figure crossing its cell, or lines drawn in). `--sheet <png>` also
makes a labelled contact sheet to look at. It wraps the create-game-assets
skill's `tools/asset_report.py` and `tools/build_preview_sheet.py`, copied
unchanged from `.claude/skills/create-game-assets/scripts/` (Apache-2.0, see
`.claude/skills/README.md`). `pip install -r tools/requirements.txt` gives
them Pillow.

`tools/sheet.py` turns a raw effect sheet into a game spritesheet. It cuts the
equal grid, clears near-transparent haze and resizes each cell without dark
fringes. `tools/parts.py` packs a 5×2 character-parts sheet and prints the
`PARTS` rows (joints and widths) for `src/game/fighterRig.ts`. Both need
Pillow and numpy. Every candidate is compared in game before it replaces
anything.

## Rules for Claude (using the images)

1. **Read `manifest.json` and only use `delivered` entries.** Run
   `python3 tools/review.py` and look at its contact sheet, then check by eye:
   - it is an equal grid with the right count of cells (any canvas size);
   - the feet sit on the baseline;
   - it matches `ART_DIRECTION.md` at 54 px and beside its family's seed.

   If a sheet fails, mark it `rejected` with the reason, and add a refined
   prompt to `REQUESTS.md` under that request.
2. **Never use files from `incoming/` directly in the game.** Normalise each
   one into the shipping location, the way the existing pipeline does:
   - character parts go to `src/assets/` and are bound in `game/fighterRig.ts`;
   - baked atlases go through `game/actionArt.ts`;
   - foe and boss sheets go to `remnant/src/assets/` with
     `sprite-manifest.json` entries;
   - VFX become Phaser textures and particle frames;
   - backgrounds become parallax layers.

   Crop, trim and pack while loading or baking, never in the game loop.
3. **Keep the game honest.**
   - Art changes never alter hitboxes, timing, damage or saves.
   - Keep the original edition (`/classic/`) building.
   - Follow `../../AGENTS.md`: no `shadowBlur`; cache textures; respect
     quality tiers and Reduce flashes.
4. **Prove it before the PR.** Every integration PR needs:
   - before/after screenshots;
   - the relevant browser scripts passing (`animation-motion`,
     `equipment-visuals`, `visuals`, `action-kit`, `bosses`,
     `classic-bosses`);
   - its source rows here updated to `integrated`.
5. **Watch the size.**
   - Remove an `incoming/` file only after the owner agrees.
   - Shipping assets should be packed as tightly as the fighter atlases.
