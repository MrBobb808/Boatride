#!/usr/bin/env python3
"""Normalise a generated effect sheet into a game spritesheet.

Cuts an equal grid out of a raw `art/incoming` PNG (never edited in place),
clears the generator's near-transparent haze, resizes each cell with
premultiplied alpha (no dark fringes) and packs the frames into a new sheet
of equal cells for Phaser's spritesheet loader.

    python3 art/tools/sheet.py IN OUT --grid 6x4 --cell 128 [--floor 24]

Needs Pillow and numpy. Claude runs it when integrating a drop; the output
is committed under src/assets/ and recorded in art/manifest.json.
"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--grid', required=True, help='COLSxROWS of the source sheet')
ap.add_argument('--cell', type=int, required=True, help='output cell size in pixels')
ap.add_argument('--floor', type=int, default=24, help='alpha at or below this becomes fully clear')
a = ap.parse_args()

cols, rows = (int(n) for n in a.grid.lower().split('x'))
src = np.asarray(Image.open(a.src).convert('RGBA')).astype(np.float32)
h, w = src.shape[:2]
cw, ch = w // cols, h // rows
out = np.zeros((rows * a.cell, cols * a.cell, 4), np.float32)
for r in range(rows):
    for c in range(cols):
        cell = src[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw].copy()
        alpha = cell[..., 3]
        alpha[alpha <= a.floor] = 0
        # Premultiply, resize, un-premultiply: edges keep their colour.
        pre = cell.copy()
        pre[..., :3] *= alpha[..., None] / 255
        img = Image.fromarray(pre.clip(0, 255).astype(np.uint8), 'RGBA')
        small = np.asarray(img.resize((a.cell, a.cell), Image.LANCZOS)).astype(np.float32)
        al = small[..., 3:4]
        small[..., :3] = np.where(al > 0, small[..., :3] * 255 / np.maximum(al, 1), 0)
        out[r * a.cell:(r + 1) * a.cell, c * a.cell:(c + 1) * a.cell] = small
Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA').save(a.out, optimize=True)
print(f'{a.out}: {cols}x{rows} cells of {a.cell}px from {cw}x{ch}')
