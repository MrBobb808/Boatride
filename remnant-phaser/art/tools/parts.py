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
    python3 art/tools/parts.py IN OUT --anchors unshorn --matte-red      (the Unshorn's parts: sash and tail last)
    python3 art/tools/parts.py IN OUT --grid 4x2 --anchors mane --matte-red  (mane frames over tail frames)

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

# The Unshorn's sheet (C08) ends with a sash knot (worn at the back of the belt) and a tail of fire (cuff → tip).
ANCHORS_UNSHORN = ANCHORS[:8] + [
    ((0.06, 0.50), (0.94, 0.50), 0.42),  # sash: one end of the knot → the other
    ((0.90, 0.08), (0.10, 0.80), 0.55),  # tail: cuff → flaming tip
]
# C09: four mane frames over four tail frames. Each lock-mass hangs from the crown (top right); each tail runs from
# its root (right) to its flaring tip (left).
ANCHORS_MANE = [((0.86, 0.10), (0.18, 0.86), 0.78)] * 4 + [((0.96, 0.62), (0.06, 0.40), 0.52)] * 4
SETS = {'elior': ANCHORS, 'unshorn': ANCHORS_UNSHORN, 'mane': ANCHORS_MANE}

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--scale', type=float, default=0.7)
ap.add_argument('--cell', type=int, default=280)
ap.add_argument('--floor', type=int, default=24)
ap.add_argument('--grid', default='5x2', help='COLSxROWS of the source sheet')
ap.add_argument('--anchors', default='elior', choices=sorted(SETS))
ap.add_argument('--matte-red', action='store_true', help='clear the generator\'s semi-transparent pure-red matte halo')
a = ap.parse_args()
cols, nrows = (int(n) for n in a.grid.lower().split('x'))
anchors = SETS[a.anchors]

src = np.asarray(Image.open(a.src).convert('RGBA')).copy()
src[src[..., 3] <= a.floor] = 0
if a.matte_red:
    r_, g_, b_, al = (src[..., k].astype(int) for k in range(4))
    src[(al < 235) & (r_ > 150) & (g_ < 80) & (b_ < 80)] = 0
H, W = src.shape[:2]
sheet = Image.new('RGBA', (a.cell * cols, a.cell * nrows), (0, 0, 0, 0))
rows = []
for i in range(cols * nrows):
    c, r = i % cols, i // cols
    x0, x1 = round(c * W / cols), round((c + 1) * W / cols)
    y0, y1 = round(r * H / nrows), round((r + 1) * H / nrows)
    cell = src[y0:y1, x0:x1]
    ys, xs = np.nonzero(cell[..., 3])
    part = Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')
    w, h = max(1, round(part.width * a.scale)), max(1, round(part.height * a.scale))
    assert w <= a.cell - 4 and h <= a.cell - 4, f'part {i} is {w}x{h}; lower --scale'
    part = part.resize((w, h), Image.LANCZOS)
    px, py = c * a.cell + (a.cell - w) // 2, r * a.cell + (a.cell - h) // 2
    sheet.alpha_composite(part, (px, py))
    (fa, fb, ft) = anchors[i]
    rows.append([px, py, w, h, round(px + fa[0] * w), round(py + fa[1] * h), round(px + fb[0] * w), round(py + fb[1] * h), round(ft * w)])
sheet.save(a.out, optimize=True)
print(f'// {a.out}')
for row in rows:
    print('  [' + ','.join(str(v) for v in row) + '],')
