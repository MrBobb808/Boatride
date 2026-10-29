#!/usr/bin/env python3
"""Pack a generated 5x2 character-parts sheet for FighterRig.

Cuts the ten parts (head, torso, skirt, upper arm, forearm, thigh, shin,
cape, scarf or braid, weapon) out of a raw `art/incoming` sheet, clears the
generator's haze, trims each to its pixels, scales them and packs them into
a sheet of equal cells. It prints the PARTS rows for src/game/fighterRig.ts:
the source rectangle, the proximal and distal joints and the transverse
width, from per-part anchor fractions (where on the trimmed part each joint
sits) given below.

    python3 art/tools/parts.py IN OUT [--scale 0.7] [--cell 280]

Needs Pillow and numpy.
"""
import argparse
import numpy as np
from PIL import Image

# (proximal x, y), (distal x, y) as fractions of the trimmed part; transverse width as a fraction of its width.
ANCHORS = [
    ((0.50, 0.88), (0.50, 0.13), 0.86),  # head: neck → crown
    ((0.56, 0.14), (0.55, 0.86), 0.84),  # torso: neck → hips
    ((0.51, 0.15), (0.51, 0.94), 0.88),  # skirt: belt → hem
    ((0.52, 0.12), (0.50, 0.88), 0.80),  # upper arm: shoulder → elbow (drawn upright)
    ((0.50, 0.08), (0.50, 0.85), 0.62),  # forearm: elbow → fist (drawn upright)
    ((0.45, 0.12), (0.55, 0.88), 0.74),  # thigh: hip → knee
    ((0.30, 0.10), (0.47, 0.96), 0.60),  # shin: knee → heel (the toe points forward)
    ((0.88, 0.10), (0.45, 0.88), 0.87),  # cape: clasp → hem
    ((0.85, 0.10), (0.20, 0.88), 0.55),  # scarf tail: knot → loose end
    ((0.50, 0.79), (0.50, 0.06), 0.73),  # weapon: grip → tip
]

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--scale', type=float, default=0.7)
ap.add_argument('--cell', type=int, default=280)
ap.add_argument('--floor', type=int, default=24)
a = ap.parse_args()

src = np.asarray(Image.open(a.src).convert('RGBA')).copy()
src[src[..., 3] <= a.floor] = 0
H, W = src.shape[:2]
sheet = Image.new('RGBA', (a.cell * 5, a.cell * 2), (0, 0, 0, 0))
rows = []
for i in range(10):
    c, r = i % 5, i // 5
    x0, x1 = round(c * W / 5), round((c + 1) * W / 5)
    y0, y1 = round(r * H / 2), round((r + 1) * H / 2)
    cell = src[y0:y1, x0:x1]
    ys, xs = np.nonzero(cell[..., 3])
    part = Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')
    w, h = max(1, round(part.width * a.scale)), max(1, round(part.height * a.scale))
    assert w <= a.cell - 4 and h <= a.cell - 4, f'part {i} is {w}x{h}; lower --scale'
    part = part.resize((w, h), Image.LANCZOS)
    px, py = c * a.cell + (a.cell - w) // 2, r * a.cell + (a.cell - h) // 2
    sheet.alpha_composite(part, (px, py))
    (fa, fb, ft) = ANCHORS[i]
    rows.append([px, py, w, h, round(px + fa[0] * w), round(py + fa[1] * h), round(px + fb[0] * w), round(py + fb[1] * h), round(ft * w)])
sheet.save(a.out, optimize=True)
print(f'// {a.out}')
for row in rows:
    print('  [' + ','.join(str(v) for v in row) + '],')
