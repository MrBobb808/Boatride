# Reference image → 3D model → the game's sprites

A pipeline for characters drawn from a 3D model instead of a painted part-rig. A reference image becomes an A- or
T-pose 3D model (ComfyUI with Qwen-Image-Edit and TRELLIS.2). Blender then makes that model watertight, retopologises
and rigs it, poses it through the game's clips, and renders it side-on. The renders are packed into the same atlas
format the game bakes for its fighters (`src/game/actionArt.ts`): 192 px cells, feet at (96, 120), 16 frames a clip,
frames named `clip:i`.

```
model3d/
  comfyui/make_workflows.py   builds the two ComfyUI workflows from Comfy-Org's official templates
  comfyui/01-pose.json        reference image → the same character in A pose, fingers spread (Qwen-Image-Edit 2511)
  comfyui/02-mesh.json        posed image → textured mesh (TRELLIS.2, built into ComfyUI)
  setup-blender.sh            portable Blender 4.5 LTS (Linux x64)
  pipeline.sh                 mesh → atlas in one go (the four steps below)
  prepare.py   step 1         import, scale and centre, voxel remesh (watertight), QuadriFlow retopology, colour transfer
  rig.py       step 2         joints found from the A/T pose, 17-bone skeleton, automatic weights, arms lowered to rest
  bake.py      step 3         the game's clips posed and rendered side-on (Cycles on CPU, transparent)
  pack.py      step 4         cell size, hard edge, one shared palette, warm near-black outline, trimmed atlas + JSON
  standin.py                  a rough humanoid mesh standing in for TRELLIS output, to test the Blender half anywhere
```

## Part 1: the model (needs an NVIDIA GPU)

TRELLIS.2 and Qwen-Image-Edit run on the GPU, so this part runs on a PC with ComfyUI (portable is fine), not in a
cloud session without one.

1. Update ComfyUI. TRELLIS.2 has been built into it since August 2026, so no custom node pack is needed.
2. Download the models listed in each workflow's note into `ComfyUI/models/`. For TRELLIS.2 (see
   https://docs.comfy.org/tutorials/3d/trellis2):
   - `diffusion_models/trellis_2_int8_convrot.safetensors` and `pixal3d_int8_convrot.safetensors`. The template
     loads both; its switch picks TRELLIS.2.
   - `vae/trellis_2_shape_vae_bf16.safetensors` and `trellis_2_texture_vae_bf16.safetensors`.
   - `clip_vision/dino_v3_L_naf_fp32.safetensors`.
   - `background_removal/birefnet.safetensors`.

   Qwen-Image-Edit 2511's model, text encoder, VAE and Lightning LoRA are linked in `01-pose.json`'s note.
3. Put the reference image in `ComfyUI/input/` as `reference.png`. Open `01-pose.json` and queue it. Check the result
   is the same character, standing in an A pose with spread fingers and nothing in the hands. Rerun with a new seed
   until it is.
4. Copy the result to `ComfyUI/input/posed.png`. Open `02-mesh.json` and queue it. The model is written to
   `ComfyUI/output/3d/`.

For a T pose instead, run `python3 comfyui/make_workflows.py --tpose` first. The rig step reads either pose.

## Part 2: the sprites (any machine, CPU is enough)

```
./pipeline.sh path/to/model.glb uri          # → out/uri/uri.png, uri.json, uri.preview.png
```

It takes about a minute on four CPU cores. The environment variables are:

- `YAW` (degrees): use it if the figure does not face front (−Y).
- `FACES`: the retopology target (default 9000).
- `HEIGHT_PX`: the figure's height in the cell (default 84; leave room for raised arms).
- `CLIPS`: a comma list of clips to bake.
- `COLORS`: the palette size (default 20).
- `BLENDER`: the Blender executable. `./setup-blender.sh` fetches portable 4.5 LTS. On Windows, point it at a portable
  `blender.exe` of the same version.

Look at `*.preview.png` first: one row per clip with the foot line drawn. `pack.py` stops if any frame touches its
cell's edge.

What each step does, and what it expects:

- **Prepare.** Any GLB, GLTF, OBJ, FBX or PLY works. Every mesh in the file is joined, scaled to 1.8 m, stood on z = 0
  and centred. A voxel remesh closes every hole; automatic weighting needs that, and generated meshes often have
  holes. Floaters under 1% of the body are dropped. QuadriFlow lays about `FACES` quads over the result, with
  decimation as a fallback. Colour comes from the original's vertex colours, or else its base-colour texture through
  its UVs, read in linear space.
- **Rig.** The figure must face −Y in A or T pose. The joints are found from its shape:
  - the crotch is the gap between the legs;
  - the shoulders are where the arms leave the torso;
  - the hands are each arm's farthest point;
  - elbows and knees are halfway, bent the way they bend.

  Bone-heat weights bind it. The arms are then lowered and that pose made the rest pose, so every clip is a turn in
  the side plane. Fingers are not boned: at sprite size a hand is a few pixels. Spread fingers in the source keep the
  weights from gluing them together.
- **Bake.** 15 clips, all named as the game names them: idle, run, jump, fall, land, airdash, hurt, death, cast,
  invoke, charge, b1, b2, b3 and heavy. Each is a pose function in `bake.py`; add one by writing another. They are
  rendered at 2x with the key and rim light from the front and above, as `art/ART_DIRECTION.md` asks.
- **Pack.** Box-filtered to the cell, alpha cut at half, one palette across every frame (no dithering), a one-pixel
  `#080202` outline, trimmed with a gutter, and packed 1024 wide. The JSON is Phaser's JSON-hash atlas, with each
  frame's source size the full cell, so the trim keeps the feet in place.

## Not done yet

- **Wiring an atlas into the game.** Nothing loads these atlases yet. A character made this way would be loaded as a
  Phaser atlas and used where `actionAtlas` returns a key. The art goes through `art/ART_DIRECTION.md` and
  `art/tools/review.py` like any other.
- **Testing the ComfyUI half.** It was built without a GPU, so it has not been run here. The workflows are the official
  templates with the prompt, the input image and the TRELLIS.2 switch changed by `make_workflows.py`. If ComfyUI renames
  a node, run that script again.

The Blender half was tested end to end on the stand-in in both poses: `blender -b -P standin.py -- standin.glb
[--apose]`, then `pipeline.sh`.

Credits: `comfyui/01-pose.json` and `02-mesh.json` are derived from Comfy-Org's workflow templates
(https://github.com/Comfy-Org/workflow_templates, MIT License, © 2023-present Comfy Org).
