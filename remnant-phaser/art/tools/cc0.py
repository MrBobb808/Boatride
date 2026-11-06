#!/usr/bin/env python3
"""Turn the CC0 packs in art/incoming/cc0/ into the game's sheets (art/incoming/cc0/CREDITS.md lists the packs).

The raw files are never edited. This writes, under src/assets/cc0/:

  foes-gothic.png      the side-view foes as the game's foe sheets: 96 px cells, four keyframes a row
                       (ready, stride, wind-up, strike), facing right, feet on y=88 (game/horde/defs.ts reads it)
  foes-gothic-big.png  the same in 160 px cells (feet on y=150) for the large ones
  watch-demon.png      the winged demon for the Watch's gates: 192x176 cells, idle then attack, facing right
  blades.png + .json   eight swords upright in 32x64 cells, with the grip point where his hand closes
  props.png + .json    the packs' set pieces cut apart (a Phaser hash atlas), named <pack>-<n>
  scenes/*.png         the parallax layers, copied as they are

    python3 art/tools/cc0.py        (from remnant-phaser/; needs Pillow and numpy)
"""
import json
import os
import shutil
import numpy as np
from PIL import Image

SRC = 'art/incoming/cc0/'
OUT = 'src/assets/cc0/'
os.makedirs(OUT + 'scenes', exist_ok=True)


def img(path):
    return Image.open(SRC + path).convert('RGBA')


def strip(path, n):
    """The n equal frames of a horizontal strip."""
    im = img(path)
    w = im.width // n
    return [im.crop((i * w, 0, (i + 1) * w, im.height)) for i in range(n)]


def files(folder, names):
    return [img(f'{folder}/{n}') for n in names]


def bbox(frames):
    """The union of the frames' opaque boxes (frames share one size)."""
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def place(frames, cell, base, face, scale=1):
    """Cut the shared box out of each frame, face it right, scale by a whole number and stand it on `base`."""
    x0, y0, x1, y1 = bbox(frames)
    out = []
    for f in frames:
        f = f.crop((x0, y0, x1, y1))
        if face == 'left':
            f = f.transpose(Image.FLIP_LEFT_RIGHT)
        if scale != 1:
            f = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
        if f.width > cell or f.height > base:
            raise SystemExit(f'{f.size} does not fit a {cell} cell')
        c = Image.new('RGBA', (cell, cell))
        c.alpha_composite(f, ((cell - f.width) // 2, base - f.height))
        out.append(c)
    return out


def sheet(rows, cell, path):
    s = Image.new('RGBA', (cell * 4, cell * len(rows)))
    for r, frames in enumerate(rows):
        for i, f in enumerate(frames):
            s.alpha_composite(f, (i * cell, r * cell))
    s.save(OUT + path, optimize=True)


P = 'gothicvania-patreon/'
C = 'gothicvania-cemetery/Sprites/'
S = 'gothicvania-swamp/Sprites/'
CH = 'gothicvania-church/SPRITES/'
pick = lambda frames, idx: [frames[i] for i in idx]

# ---- the foes: the order is the row order game/horde/defs.ts names
hound_idle, hound_run, hound_jump = strip(P + 'Hell-Hound-Files/PNG/hell-hound-idle.png', 6), strip(P + 'Hell-Hound-Files/PNG/hell-hound-run.png', 5), strip(P + 'Hell-Hound-Files/PNG/hell-hound-jump.png', 6)
# The hound's strips differ in height: each is stood on its own floor before the four are joined.
hound = [place([f], 96, 88, 'left')[0] for f in [hound_idle[0], hound_run[1], hound_run[3], hound_jump[2]]]
wraith_idle, wraith_shriek = strip(P + 'Ghost-Files/PNG/ghost-idle.png', 7), strip(P + 'Ghost-Files/PNG/ghost-shriek.png', 4)
beast_idle, beast_breath = strip(P + 'Hell-Beast-Files/PNG/with-stroke/hell-beast-idle.png', 6), strip(P + 'Hell-Beast-Files/PNG/with-stroke/hell-beast-breath.png', 4)
beast = [place([f], 96, 88, 'left')[0] for f in [beast_idle[0], beast_idle[3], beast_breath[1], beast_breath[3]]]
wizard = strip(CH + 'wizard/wizard.png', 15)
FOES = [
    ('skeleton', place(pick(files(C + 'skeleton-clothed', [f'skeleton-clothed-{i}.png' for i in range(1, 9)]), [0, 3, 5, 7]), 96, 88, 'left')),
    ('hellcat', place(files(C + 'hell-gato', [f'hell-gato-{i}.png' for i in range(1, 5)]), 96, 88, 'left')),
    ('lantern', place(files(C + 'ghost-halo', [f'ghost-halo-{i}.png' for i in range(1, 5)]), 96, 88, 'right')),
    ('wraith', place([wraith_idle[0], wraith_idle[3], wraith_shriek[1], wraith_shriek[3]], 96, 88, 'left')),
    ('hellhound', hound),
    ('hellbeast', beast),
    ('wizard', place(pick(wizard, [0, 2, 8, 11]), 96, 88, 'left')),
    ('ghoul', place(pick(strip(CH + 'burning-ghoul/burning-ghoul.png', 8), [0, 2, 4, 6]), 96, 88, 'left')),
    ('spider', place(files(S + 'Spider/walk', [f'spider{i}.png' for i in range(1, 5)]), 96, 88, 'left', 2)),
    ('swampthing', place(files(S + 'Thing/walk thing', [f'thing{i}.png' for i in range(1, 5)]), 96, 88, 'left')),
    ('bogghost', place(files(S + 'Ghost/Flying', [f'Ghost{i}.png' for i in range(1, 5)]), 96, 88, 'left')),
    ('wolf', place(strip(P + 'wolf-runing-cycle/sprites/wolf-runing-cycle-skin.png', 4), 96, 88, 'right')),
]
sheet([f for _, f in FOES], 96, 'foes-gothic.png')
night_idle, night_run = strip(P + 'Nightmare-Files/PNG/nightmare-idle.png', 4), strip(P + 'Nightmare-Files/PNG/nightmare-galloping.png', 4)
BIG = [
    ('nightmare', [place([f], 160, 150, 'left')[0] for f in [night_idle[0], night_run[0], night_run[2], night_run[3]]]),
    ('fireskull', place(pick(strip(P + 'Fire-Skull-Files/PNG/fire-skull.png', 8), [0, 2, 4, 6]), 160, 150, 'left')),
]
sheet([f for _, f in BIG], 160, 'foes-gothic-big.png')

# ---- the winged demon: six idle frames, then eight of the attack, in one row of 192x176 cells
idle, attack = strip(P + 'demon-Files/PNG/demon-idle.png', 6), strip(P + 'demon-Files/PNG/demon-attack-no-breath.png', 8)
demon = Image.new('RGBA', (192 * 14, 176))
for i, f in enumerate(idle + attack):
    f = f.transpose(Image.FLIP_LEFT_RIGHT)
    demon.alpha_composite(f, (i * 192 + (192 - f.width) // 2, 176 - f.height))
demon.save(OUT + 'watch-demon.png', optimize=True)

# ---- the blades: upright, centred, the pommel at the foot of a 32x64 cell; the grip is just under the guard
BLADES = [31, 33, 18, 32, 8, 14, 4, 26]
strip_ = Image.new('RGBA', (32 * len(BLADES), 64))
grips = []
for i, n in enumerate(BLADES):
    b = img(f'swords-and-staffs/{n}.png')
    b = b.crop(b.getbbox())
    x, y = i * 32 + (32 - b.width) // 2, 64 - b.height
    strip_.alpha_composite(b, (x, y))
    a = np.asarray(b)[:, :, 3] > 0
    widths = a.sum(axis=1)
    low = int(b.height * 0.55)
    guard = low + int(np.argmax(widths[low:]))
    grips.append({'x': x - i * 32 + b.width / 2, 'y': y + (guard + b.height) / 2 + 1, 'h': b.height})
strip_.save(OUT + 'blades.png', optimize=True)
json.dump(grips, open(OUT + 'blades.json', 'w'), indent=1)

# ---- the set pieces: cut each pack's prop sheet into its separate objects (pieces 3 px apart are one object)
PROPS = [('graves', 'gothicvania-cemetery/Environment/objects.png'), ('town', 'gothicvania-town/environment/props.png'), ('swamp', 'gothicvania-swamp/Environment/props.png')]
pieces = []
for name, path in PROPS:
    im = img(path)
    a = np.asarray(im)[:, :, 3] > 0
    grow = a.copy()
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            grow |= np.roll(np.roll(a, dy, 0), dx, 1)
    seen = np.zeros_like(grow)
    found = []
    for y0, x0 in zip(*np.nonzero(grow)):
        if seen[y0, x0]:
            continue
        stack, ys, xs = [(y0, x0)], [], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            ys.append(y); xs.append(x)
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < grow.shape[0] and 0 <= nx < grow.shape[1] and grow[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        box = im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)).getbbox()
        if box and len(ys) > 40:
            found.append((min(xs) + box[0], min(ys) + box[1], min(xs) + box[2], min(ys) + box[3]))
    found.sort(key=lambda b: (b[0], b[1]))
    for i, b in enumerate(found):
        pieces.append((f'{name}-{i}', im.crop(b)))
# Shelf-pack the pieces into one atlas.
W, x, y, row = 1024, 1, 1, 0
places = []
for key, p in pieces:
    if x + p.width + 1 > W:
        x, y, row = 1, y + row + 1, 0
    places.append((key, p, x, y))
    x += p.width + 1
    row = max(row, p.height)
atlas = Image.new('RGBA', (W, y + row + 1))
frames = {}
for key, p, px, py in places:
    atlas.alpha_composite(p, (px, py))
    frames[key] = {'frame': {'x': px, 'y': py, 'w': p.width, 'h': p.height}, 'rotated': False, 'trimmed': False,
                   'spriteSourceSize': {'x': 0, 'y': 0, 'w': p.width, 'h': p.height}, 'sourceSize': {'w': p.width, 'h': p.height}}
atlas.save(OUT + 'props.png', optimize=True)
json.dump({'frames': frames, 'meta': {'image': 'props.png', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}}, open(OUT + 'props.json', 'w'), indent=1)

# ---- the scenes' layers, as they are
LAYERS = {
    'cemetery-sky': 'gothicvania-cemetery/Environment/background.png',
    'cemetery-mountains': 'gothicvania-cemetery/Environment/mountains.png',
    'cemetery-graves': 'gothicvania-cemetery/Environment/graveyard.png',
    'wood-back': 'parallax-forest/parallax-forest-back-trees.png',
    'wood-lights': 'parallax-forest/parallax-forest-lights.png',
    'wood-middle': 'parallax-forest/parallax-forest-middle-trees.png',
    'wood-front': 'parallax-forest/parallax-forest-front-trees.png',
    'swamp-sky': 'gothicvania-swamp/Environment/background.png',
    'swamp-far': 'gothicvania-swamp/Environment/mid-layer-01.png',
    'swamp-near': 'gothicvania-swamp/Environment/mid-layer-02.png',
    'swamp-trees': 'gothicvania-swamp/Environment/trees.png',
    'town-sky': 'gothicvania-town/environment/background.png',
    'town-houses': 'gothicvania-town/environment/middleground.png',
    'church-wall': 'gothicvania-church/ENVIRONMENT/backgrounds.png',
    'church-column': 'gothicvania-church/ENVIRONMENT/column.png',
    'night-sky': 'gothicvania-patreon/night-town-background-files/layers/night-town-background-sky.png',
    'night-clouds': 'gothicvania-patreon/night-town-background-files/layers/night-town-background-clouds.png',
    'night-mountains': 'gothicvania-patreon/night-town-background-files/layers/night-town-background-mountains.png',
    'night-forest': 'gothicvania-patreon/night-town-background-files/layers/night-town-background-forest.png',
    'night-far': 'gothicvania-patreon/night-town-background-files/layers/night-town-background-far-buildings.png',
    'night-town': 'gothicvania-patreon/night-town-background-files/layers/night-town-background-town.png',
    'ruin-clouds': 'gothicvania-patreon/Gothic-Horror-Files/PNG/layers/clouds.png',
    'ruin-town': 'gothicvania-patreon/Gothic-Horror-Files/PNG/layers/town.png',
    'castle-hall': 'gothicvania-patreon/Old-dark-Castle-tileset-Files/PNG/old-dark-castle-interior-background.png',
}
for key, path in LAYERS.items():
    shutil.copyfile(SRC + path, f'{OUT}scenes/{key}.png')
print('cc0: foes', len(FOES), '+', len(BIG), 'big; blades', len(BLADES), '; props', len(pieces), '; layers', len(LAYERS))
