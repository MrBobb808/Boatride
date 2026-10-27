# Fighter animation source

`fighter-parts-v1.png` is the unmodified transparent output of the built-in
ImageGen tool, generated 27 October 2026 for this project. It uses
`remnant/src/assets/elior-v3.png` and `tirzah-v2.png` as identity references.
The older full-body sources remain preserved in git. The live Phaser fighters
now share this parts-based renderer across movement and combat.

The implementation is a 2D cutout rig, not a Blender model or a PixiJS migration.
`game/fighterRig.ts` defines each crop, joint pivot and transverse scale.
`game/actionArt.ts` binds the art to the existing weapon choreography and
bakes sixteen distinct samples per clip into tightly packed, trimmed atlases.
Feet remain at (96, 120) in a logical 192-pixel frame. Cloth trails the torso;
weapons follow the gripping hand. Atlas creation is cached; the game loop
only selects frames. Bow drawing follows the actual 0.55-second charge threshold.

Review the actual runtime atlas and gameplay using
`node scripts/animation-motion.mjs`, `equipment-visuals.mjs` and
`action-kit.mjs`. They check both characters, fixed origins, distinct stride
poses, local action clocks, pause, bow release, weapon pixels, transformations,
quality controls, room cleanup and mobile inputs. Keep the main game's movement
clock and saved progression compatible when changing animation art.

Workflow inspiration supplied by the owner:
- https://github.com/EL4CTEO/blender-skills (rig, animate, bake and validate).
- https://github.com/img2threejs/pixi2d (separate editable parts and review real motion).

No code from those projects is included. No 3D engine or external plugin is
required by the game.

## Exact ImageGen prompt

Use case: identity-preserve
Asset type: transparent cutout sprite PARTS atlas for a 2D side-scrolling Phaser action game. This is a technical animation source, NOT a character lineup.
Input image 1: reference for Elior, an adult Black male with dark warm brown skin, short silver white textured hair and short white beard, ornate charcoal/black long coat with gold edges, burgundy scarf/cape, leather armor and boots. Input image 2: reference for Tirzah, adult Black female ranger with warm brown skin, long black braid, teal/charcoal tunic, gold trim and bracers, boots and ornate ivory/gold recurve bow. Preserve those designs, colors and identities.
Produce ONE landscape transparent PNG with EXACTLY FIVE COLUMNS AND FOUR ROWS, 20 isolated body-part assets, one centered in each equal cell, large transparent gutters. No labels, numbers, outlines around cells, or whole characters. Crisp premium pixel-art shading with rich details that remain readable reduced to a 48-pixel tall character. All parts are side view facing RIGHT. All limb segments point straight DOWN in a neutral rigging orientation; curved boots point RIGHT. Use clean overlapping joint caps. Paint hidden overlap areas completely for rotation without holes. Do not include any connected body parts other than the explicitly named asset.
Row 1 ELIOR, columns left to right: (1) head and short neck ONLY, white hair and beard, face looking RIGHT; (2) torso ONLY shoulder to belt, ornate black/gold coat chest, NO head or arms or legs; (3) separate hip belt and short split coat-tail skirt ONLY, NO legs; (4) one upper arm shoulder to elbow ONLY, gold edged dark sleeve; (5) one forearm ending in a CLOSED gripping gloved hand ONLY.
Row 2 ELIOR, columns: (1) one thigh hip to knee ONLY, dark trousers; (2) one lower leg knee to toe WITH attached ornate boot, toe pointing RIGHT; (3) flowing burgundy cape ONLY with attachment at TOP RIGHT and cloth trailing DOWN LEFT; (4) burgundy scarf collar ONLY, compact loose cloth around neck; (5) one silver/gold straight sword ONLY, tip UP and handle DOWN.
Row 3 TIRZAH, columns: (1) head and short neck ONLY, brown female face looking RIGHT, black tied hair, NO hanging braid; (2) torso ONLY shoulder to belt, teal charcoal gold trimmed tunic, NO head arms or legs; (3) separate hip belt, short split teal skirt and small quiver ONLY, NO legs; (4) one upper arm shoulder to elbow ONLY, dark teal short sleeve and brown upper arm; (5) one forearm with gold leather bracer ending in CLOSED gripping brown hand ONLY.
Row 4 TIRZAH, columns: (1) one thigh hip to knee ONLY, charcoal trousers; (2) one lower leg knee to toe WITH attached brown gold-trim boot, toe pointing RIGHT; (3) flowing short TEAL cloak ONLY, attachment TOP RIGHT and cloth trailing DOWN LEFT; (4) separate long black braided ponytail ONLY, thick base at TOP RIGHT, braid draping DOWN LEFT; (5) single ornate ivory/gold recurve bow ONLY, vertical, string to LEFT, grip in center, no hand no arrow.
The two characters occupy different rows, never mix outfits. Transparent background with actual alpha, no checkerboard or shadows. Each asset must stay within its own cell. NO full bodies. NO repeated animation poses. Aim for meticulously painted reusable parts for skeletal animation.
