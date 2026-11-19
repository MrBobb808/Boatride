#!/usr/bin/env python3
# Step 4: the rendered frames (bake.py) made into the game's sprite atlas.
#   python3 pack.py frames_dir out_name [--colors 20]
# Each frame comes down to the game's 192 px cell (box filter from 2x), its edge made hard (alpha cut at half), its
# colours reduced to one palette shared by every frame of the figure (no dithering), and a one-pixel outline in the
# art direction's warm near-black (#080202) put around the silhouette. A frame that touches its cell's edge is clipped
# and stops the pack, as the game's own bake does. Frames are trimmed with a one-pixel gutter and packed in rows 1024
# wide; the JSON is Phaser's JSON-hash atlas, frames named `clip:i` with the cell as their source size, so the trim
# keeps the feet at (96, 120) in every pose (src/game/actionArt.ts). Also written: out_name.preview.png, a sheet of
# every clip, one row each, for review.
import argparse, json, os, sys
from PIL import Image, ImageChops, ImageFilter

ap = argparse.ArgumentParser(); ap.add_argument('frames'); ap.add_argument('out'); ap.add_argument('--colors', type=int, default=20)
a = ap.parse_args()
meta = json.load(open(os.path.join(a.frames, 'frames.json')))
CELL, STEPS = meta['cell'], meta['steps']
OUTLINE = (8, 2, 2, 255)

frames = []
for clip in meta['clips']:
    for i in range(STEPS):
        im = Image.open(os.path.join(a.frames, f'{clip}_{i:02d}.png')).convert('RGBA').resize((CELL, CELL), Image.BOX)
        r, g, b, al = im.split()
        al = al.point(lambda v: 255 if v >= 128 else 0)
        frames.append((clip, i, Image.merge('RGBA', (r, g, b, al))))

# One palette for the whole figure, taken from every opaque pixel of every frame.
strip = Image.new('RGB', (CELL, CELL * len(frames)))
for k, (_, _, im) in enumerate(frames):
    bg = Image.new('RGB', (CELL, CELL), (0, 0, 0)); bg.paste(im, mask=im.split()[3]); strip.paste(bg, (0, CELL * k))
pal = strip.quantize(colors=a.colors + 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

out_frames, problems = [], []
for clip, i, im in frames:
    al = im.split()[3]
    q = im.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
    q.putalpha(al)
    # The outline: every clear pixel beside the silhouette.
    ring = ImageChops.subtract(al.filter(ImageFilter.MaxFilter(3)), al)
    q.paste(Image.new('RGBA', q.size, OUTLINE), mask=ring)
    bb = q.getbbox()
    if not bb: problems.append(f'{clip}:{i} is empty'); continue
    if bb[0] == 0 or bb[1] == 0 or bb[2] == CELL or bb[3] == CELL: problems.append(f'{clip}:{i} is clipped by its cell {bb}')
    l, t, r, b = max(0, bb[0] - 1), max(0, bb[1] - 1), min(CELL, bb[2] + 1), min(CELL, bb[3] + 1)
    out_frames.append((clip, i, q.crop((l, t, r, b)), l, t, q))
if problems: sys.exit('pack: ' + '; '.join(problems[:8]))

W, x, y, row, placed = 1024, 2, 2, 0, []
for clip, i, im, l, t, _ in out_frames:
    w, h = im.size
    if x + w + 2 > W: x, y, row = 2, y + row + 2, 0
    placed.append((clip, i, im, l, t, x, y)); x += w + 2; row = max(row, h)
sheet = Image.new('RGBA', (W, y + row + 2), (0, 0, 0, 0))
atlas = {'frames': {}, 'meta': {'app': 'remnant model3d pack.py', 'image': os.path.basename(a.out) + '.png', 'format': 'RGBA8888',
         'size': {'w': W, 'h': sheet.height}, 'scale': '1', 'cell': CELL, 'foot': meta['foot'], 'steps': STEPS, 'clips': meta['clips']}}
for clip, i, im, l, t, px, py in placed:
    sheet.paste(im, (px, py))
    w, h = im.size
    atlas['frames'][f'{clip}:{i}'] = {'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': True,
                                      'spriteSourceSize': {'x': l, 'y': t, 'w': w, 'h': h}, 'sourceSize': {'w': CELL, 'h': CELL}}
sheet.save(a.out + '.png', optimize=True)
json.dump(atlas, open(a.out + '.json', 'w'), indent=1)

# Review sheet: one row a clip, every frame at its cell, the foot line marked.
clips = list(meta['clips'])
prev = Image.new('RGBA', (CELL * STEPS // 2, CELL * len(clips) // 2), (38, 34, 46, 255))
for clip, i, _, _, _, full in out_frames:
    c = full.resize((CELL // 2, CELL // 2), Image.NEAREST); r = clips.index(clip)
    prev.alpha_composite(c, (i * CELL // 2, r * CELL // 2))
for r in range(len(clips)):
    for xx in range(prev.width): prev.putpixel((xx, r * CELL // 2 + meta['foot'] // 2), (90, 80, 100, 255))
prev.save(a.out + '.preview.png')
print(f'pack: {len(out_frames)} frames of {len(clips)} clips, {a.colors} colours, atlas {W}x{sheet.height} -> {a.out}.png / .json')
