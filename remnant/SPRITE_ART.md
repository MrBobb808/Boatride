# Elior sprite-art pilot

This is the first asset-driven character-art pass for **Remnant: Ascension**.
The old Canvas 2D skeletal character painter stays available, and remains the
renderer for NPCs, enemies, Echoes, missing sprite animations, and headgear.
This is a deliberate pilot rather than a wholesale art replacement.

## Art asset

- `src/assets/elior-sprites.png` is **original raster pixel art** created for
  this project. It is not lifted from an external game or third-party pack.
- Atlas size: **512 × 144** pixels (16 columns × 3 rows). Frames are drawn
  1:1, with the feet on row 45 (48 for the dodge frames, 47 for hurt).
- Frames: **32 × 48** pixels, top-left origin.
- Row 0 = tunic; row 1 = plate armor; row 2 = sovereign-style armor.
- Columns 0–3 = idle, 4–7 = run, 8 = jump, 9 = fall, 10–11 = attack/charge,
  12–13 = dodge/airdash, 14 = hurt, 15 = cast.
- The atlas is loaded through Vite's asset URL handling (works on GitHub Pages).
  Until it loads, the game safely uses its existing procedural character art.
- `render/heroSprites.ts` maps character states to frames with no per-frame
  image allocations and disables smoothing to keep the illustrated pixels crisp.

## Pixel-art rendering (the whole game)

- Settings → Display → **Art style** chooses **Pixel** (default) or **Smooth**.
- In Pixel mode `render/renderer.ts` draws the world into a small canvas at
  **one pixel per world unit** (the same scale as the atlas: a 32 × 48 frame
  is 32 × 48 world units) and `Renderer.present()` scales it onto the screen
  with smoothing off. Every room, foe, boss, effect and light gets the same
  pixel grid as Elior's sprites. The HUD, menus and dialogue stay sharp.
- The view keeps its usual height (268 units on a phone, 300 elsewhere). A
  whole number of screen pixels per art pixel is used when it moves the view
  by 5% or less; otherwise the scale is fractional (on a 3× iPhone that is
  about 4.4 screen pixels per art pixel, where the difference is invisible).
- It is also cheaper: the world is filled at roughly a tenth of the pixels.

## Integration safeguards

- Only Elior uses the pilot and only for supported movement/combat poses while
  his helmet is unequipped and the Shadow Mantle is inactive.
- Unsupported equipment, special executions and other poses use the existing
  character renderer until compatible sprites are designed.
- The old weapon painter is still responsible for equipped weapons, skeletal
  positions and attack-trail coordinates; hitboxes, saves and enemy AI do not change.
- To compare the classic character art: append `?classicArt` to the game URL.
- No new runtime dependencies were added.

## Next characters to draw

Approve the art direction in-game before extending the atlas to every
weapon, headpiece, NPC, enemy, boss, and Echo. Each silhouette needs its own
illustration/animation data instead of recoloring Elior's body into every
creature. Source/license information should accompany any third-party art.

## Test plan

1. `cd remnant && npm ci && npm run build`.
2. Play on mobile and desktop with idle, run, jump, attacks, roll, cast, and hurt.
3. Compare normal art with `?classicArt`; test helmet-equipped and Shadow
   Mantle appearances to confirm the classic renderer fallback.
4. Check weapon grips/trails in all three weapon families and verify no loss of
   input responsiveness or performance.
