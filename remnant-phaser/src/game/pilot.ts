// The Chapter I metroidvania pilot (POLISH_PLAN §12c), Phaser only. The shared Chapter I rooms are patched once as
// the game starts, so the original edition keeps its own. What it adds:
// - a loop: the crypt's west end opens into the cistern behind a bar lifted from the crypt side, so the Eagle
//   Plume's dead end becomes a way back up to the village;
// - ledges the Eagle Plume's second jump reaches (a loft over the square, a rooftop over the road);
// - a far rooftop only the second jump and an air dash together can reach.
import Phaser from 'phaser';
import { ROOMS, T, TILE, type EntDef } from '../shared';
import type { World } from '../scenes/World';

/** A barred passage: solid while its flag is unset, lifted only from the room that has `opener`. */
interface Bar { flag: string; room: string; x: number; y0: number; y1: number; opener: boolean }
export const BARS: Bar[] = [
  { flag: 'crypt_bar', room: 'crypt', x: 0, y0: 16, y1: 21, opener: true },
  { flag: 'crypt_bar', room: 'cistern', x: 50, y0: 13, y1: 18, opener: false },
];

let patched = false;
/** Write one row's tiles from x to x + text.length. */
const put = (id: string, x: number, y: number, text: string) => {
  const r = ROOMS[id], row = r.rows[y];
  r.rows[y] = row.slice(0, x) + text + row.slice(x + text.length);
};
const add = (id: string, ...ents: EntDef[]) => ROOMS[id].ents.push(...ents);

export function patchChapterOne() {
  if (patched) return;
  patched = true;
  // The loop: open both walls (the bar fills them while it is down) and join the rooms.
  for (const b of BARS) for (let y = b.y0; y <= b.y1; y++) put(b.room, b.x, y, '..');
  ROOMS.crypt.exits.push({ x: 0, y: 16, w: 1, h: 6, to: 'cistern', spawn: 'crypt', cond: 'crypt_bar' } as never);
  ROOMS.crypt.spawns.cistern = { x: 4, y: 22, face: 1 };
  ROOMS.cistern.exits.push({ x: 51, y: 13, w: 1, h: 6, to: 'crypt', spawn: 'cistern', cond: 'crypt_bar' } as never);
  ROOMS.cistern.spawns.crypt = { x: 47, y: 19, face: -1 };
  add('cistern', { t: 'hint', x: 42, w: 8, id: 'h_bar', text: 'A passage east, barred from the far side.', ncond: 'crypt_bar' } as EntDef);

  // The square's loft: five tiles over its highest ledge, beyond one jump (about four) and well within two (about seven).
  put('village_square', 2, 15, '======');
  add('village_square',
    { t: 'chest', x: 4, y: 15, id: 'square_loft', secret: true, loot: [{ silver: 60 }, { mat: 'veil_shard', n: 2 }, { item: 'pilgrim_band' }] },
    { t: 'hint', x: 2, w: 9, id: 'h_loft', text: 'A loft far overhead. A stronger leap might reach it.', ncond: 'plume' } as EntDef);

  // The road's rooftops: one over the long ledge for the second jump, and a far one only the dash can close.
  put('ashen_road', 36, 10, '======');
  // The far roof: a running double jump comes back to its height about 1.5 tiles short; with an air dash at the top,
  // about 2 tiles onto it (at 60 fps).
  put('ashen_road', 52, 10, '=======');
  add('ashen_road',
    { t: 'chest', x: 38, y: 10, id: 'road_roof', secret: true, loot: [{ silver: 45 }, { mat: 'iron_scrap', n: 3 }] },
    { t: 'chest', x: 55, y: 10, id: 'road_far_roof', secret: true, loot: [{ silver: 120 }, { item: 'archivist_ring' }, { mat: 'covenant_fragment', n: 1 }] },
    { t: 'hint', x: 34, w: 10, id: 'h_roof', text: 'The rooftops are just out of reach.', ncond: 'plume' } as EntDef,
    { t: 'hint', x: 37, w: 5, id: 'h_far_roof', text: 'Too far to leap. Jump twice, then dash through the air.', cond: 'plume' } as EntDef);
}

/** As a room loads: a bar still down fills its passage. Runs on the classic grid before the tiles are built. */
export function barTiles(w: World) {
  for (const b of BARS) if (b.room === w.room.id && !w.save.flags[b.flag]) for (let y = b.y0; y <= b.y1; y++) for (const x of [b.x, b.x + 1]) w.classic.grid.set(x, y, T.Stone);
}

/** The bar itself: iron across the passage, and on the opener's side a lever to lift it. */
export function barProps(w: World, keep: (o: Phaser.GameObjects.GameObject) => void, interact: (i: { x: number; y: number; label: string; use: () => void }) => void, drop: (label: string) => void) {
  for (const b of BARS) {
    if (b.room !== w.room.id || w.save.flags[b.flag]) continue;
    const x0 = b.x * TILE + (b.opener ? 2 * TILE : -6), top = b.y0 * TILE, bottom = (b.y1 + 1) * TILE;
    const g = w.add.graphics().setDepth(1.5);
    g.fillStyle(0x2a2420, 1).fillRect(x0 - 2, top - 4, 10, 4).fillRect(x0 - 2, bottom - 3, 10, 3);
    for (let i = 0; i < 3; i++) g.fillStyle(0x6e6458, 1).fillRect(x0 + i * 3, top, 2, bottom - top);
    keep(g);
    if (!b.opener) continue;
    interact({ x: x0 + 3, y: bottom, label: 'Lift the bar', use: () => {
      w.save.flags[b.flag] = true;
      for (let y = b.y0; y <= b.y1; y++) for (const x of [b.x, b.x + 1]) w.classic.grid.set(x, y, T.Empty);
      w.classic.cache.invalidate();
      g.destroy();
      drop('Lift the bar');
      w.playEffect('door', { x: x0 });
      w.toast('The bar lifts: a way back to the cistern, and up to the village.');
      w.persist();
    } });
  }
}
