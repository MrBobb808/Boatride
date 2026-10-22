# Pixel art

**Remnant: Ascension** is drawn as pixel art by default (Settings → Display →
Art style: **Pixel**). **Smooth** brings back the classic vector look. Both
styles draw from the same code; there are no image files.

## The world

- `render/renderer.ts` draws the world into a small canvas (`Renderer.world`,
  `r.bw` × `r.bh`) at **one pixel per world unit**. One tile (16 units) is
  16 art pixels.
- `Renderer.present()` scales the world canvas onto the screen with smoothing
  off. The HUD, menus and dialogue are drawn afterwards at full resolution,
  so they stay sharp.
- The view keeps its usual height (268 units on a phone, 300 elsewhere).
  - A whole number of screen pixels per art pixel is used when it moves the
    view by 5% or less.
  - Otherwise the scale is fractional: about 4.4× on a 3× iPhone, where the
    difference is invisible.
  - If the canvas is ever smaller than the screen, CSS enlarges it with
    `image-rendering: pixelated`.

## The characters

Elior, and the foes and Echoes that have sprite sheets, are drawn from PNG
atlases (`render/heroSprites.ts`, `render/creatureSprites.ts`; see
`SPRITE_ART.md`). Every other humanoid that reaches `drawHumanoid` (the NPCs,
foes and Echoes without a sheet, human-sized bosses, and Elior when his atlas
cannot show his gear) is painted as pixel art by `render/pixelHero.ts`, so the
whole cast shares one pixel grid.

- **Same animation as before.** It reads the same skeleton (`Joints`) and
  style (`HumanStyle`) as the classic painter, `drawHumanoid` in
  `render/actors.ts`. That means:
  - every move, combo, finisher and weapon animates exactly as before;
  - the weapon is always in the hand;
  - armour, helms, hoods, crowns, shields, bows and lanterns all show.
- **How a body is painted.** Each body is rasterized into a 128 × 128 buffer
  with feet at (64, 100):
  - limbs as tapered capsules, lit as cylinders;
  - torso, coat tails, hair and helms as polygons;
  - the face placed pixel by pixel: eye, brow, nose shadow, mouth.
- **Colour.** Every style colour becomes a 5-step ramp: deep, shadow, base,
  light and highlight. Shadows lean cool and lights lean warm. Warm hues
  such as skin, leather and gold are kept muted so their shadows don't turn
  red.
- **Edges.**
  - A dark contour is drawn wherever a part crosses one behind it, such as an
    arm over the chest.
  - A selective outline wraps the silhouette. It is halfway between ink and
    the darkest tone of the pixel it borders.
- **Placing it.** The finished rectangle is uploaded once and placed on whole
  screen pixels. Soft light goes on top: blessed blades, burning eyes, runes,
  lanterns.
- **Cost.** One body costs about 0.3 ms in headless Chromium, less than the
  vector painter (about 0.5 ms).
- **Quality.** On the Low tier the painter skips contours where parts cross,
  strands, glints and seams; eyes, outlines and shading stay.
- **Fallbacks.** The classic painter is still used for:
  - see-through styles (afterimages);
  - flat silhouettes (title figures, the one-frame white hit flash);
  - rotated or skewed frames;
  - bodies too large for the buffer (the giant bosses);
  - Smooth mode.

## Adding a look

- New `HumanStyle` options need a pixel version in `pixelHero.ts` next to
  their vector version in `actors.ts`.
- Keep detail at 1 world unit or more. Thinner lines vanish or shimmer at one
  pixel per unit.
