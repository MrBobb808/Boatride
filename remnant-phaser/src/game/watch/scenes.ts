// The Watch's places (POLISH_PLAN §18): each gate (ten stages) stands somewhere new, painted from the CC0 packs
// (art/incoming/cc0/CREDITS.md, built by art/tools/cc0.py): its parallax layers, its set pieces, the foes that live there
// and what holds its gate. Eight places, then round again.
import type { BossId } from '../horde/defs';

/** A layer of the scene, stood on the scene's floor. `full` layers reach the top of the sky; `drift` slides by itself
 * (clouds); `par` is how far it moves when Elior walks on to the next stage (0 = the sky, 1 = the nearest). */
export interface Layer { key: string; full?: boolean; drift?: number; par: number }
/** A set piece: a frame of the props atlas (or a scene layer's key) at x on the floor, scaled; `front` stands before the fighters. */
export interface Prop { frame: string; x: number; s: number; front?: boolean }
export interface WatchScene {
  id: string; name: string;
  /** The height the layers were painted for: the whole scene is scaled to fit it over the wall. */
  h: number;
  layers: Layer[];
  /** The floor under the scene: its fill and the lit edge. */
  ground: [number, number];
  props: Prop[];
  /** The foes here, commonest first (five). */
  foes: string[];
  boss: string;
  music: string;
}

/** What holds a gate: a Fallen Crown, the winged demon, or a great one of the scene's own kind. */
export type WatchBoss = { name: [string, string] } & ({ kind: 'crown'; id: BossId } | { kind: 'demon' } | { kind: 'foe'; foe: string; scale: number });
export const WATCH_BOSSES: Record<string, WatchBoss> = {
  shade: { kind: 'demon', name: ['THE WINGED SHADE', 'Keeper of the Graves'] },
  varkhos: { kind: 'crown', id: 'beast_monarch', name: ['VARKHOS', 'Crown of the Hunt'] },
  morvane: { kind: 'crown', id: 'plague_monarch', name: ['MORVANE', 'Crown of Pestilence'] },
  azkar: { kind: 'crown', id: 'cinder_monarch', name: ['AZKAR', 'Crown of Cinders'] },
  mare: { kind: 'foe', foe: 'nightmare', scale: 1.4, name: ['THE NIGHT MARE', 'Rider of the Dark Streets'] },
  brimstone: { kind: 'foe', foe: 'hellbeast', scale: 1.65, name: ['THE BRIMSTONE BEAST', 'Defiler of the Nave'] },
};

export const SCENES: WatchScene[] = [
  { id: 'cemetery', name: 'The Restless Graves', h: 224, music: 'valley', ground: [0x16111f, 0x3b2e4f],
    layers: [{ key: 'cemetery-sky', full: true, par: 0 }, { key: 'cemetery-mountains', par: 0.15 }, { key: 'cemetery-graves', par: 0.45 }],
    props: [{ frame: 'graves-9', x: 268, s: 0.6 }, { frame: 'graves-7', x: 30, s: 0.55 }, { frame: 'graves-0', x: 128, s: 0.75 }, { frame: 'graves-2', x: 160, s: 0.75 },
      { frame: 'graves-1', x: 214, s: 0.75 }, { frame: 'graves-6', x: 236, s: 0.75, front: true }],
    foes: ['skeleton', 'lantern', 'hellcat', 'wraith', 'husk'], boss: 'shade' },
  { id: 'wood', name: 'The Autumn Wood', h: 160, music: 'hunt', ground: [0x2a1a10, 0x7a4a22],
    layers: [{ key: 'wood-back', full: true, par: 0.05 }, { key: 'wood-lights', full: true, par: 0.15 }, { key: 'wood-middle', full: true, par: 0.3 }, { key: 'wood-front', full: true, par: 0.6 }],
    props: [{ frame: 'swamp-0', x: 150, s: 0.6 }, { frame: 'graves-5', x: 262, s: 0.6, front: true }],
    foes: ['wolf', 'hellhound', 'hound', 'lion', 'archer'], boss: 'varkhos' },
  { id: 'swamp', name: 'The Drowned Mire', h: 256, music: 'plague', ground: [0x15200f, 0x3f5a2c],
    layers: [{ key: 'swamp-sky', full: true, par: 0 }, { key: 'swamp-far', full: true, par: 0.15 }, { key: 'swamp-near', full: true, par: 0.3 }, { key: 'swamp-trees', par: 0.5 }],
    props: [{ frame: 'swamp-1', x: 140, s: 0.7 }, { frame: 'swamp-2', x: 220, s: 0.7, front: true }, { frame: 'swamp-0', x: 40, s: 0.6 }],
    foes: ['spider', 'swampthing', 'bogghost', 'wisp', 'vessel'], boss: 'morvane' },
  { id: 'town', name: 'The Town at Dusk', h: 288, music: 'village', ground: [0x231a2b, 0x5a4560],
    layers: [{ key: 'town-sky', full: true, par: 0.02 }, { key: 'town-houses', full: true, par: 0.4 }],
    props: [{ frame: 'town-0', x: 26, s: 0.55 }, { frame: 'town-5', x: 128, s: 0.55 }, { frame: 'town-2', x: 196, s: 0.55 }, { frame: 'town-6', x: 262, s: 0.55 }, { frame: 'town-4', x: 108, s: 0.6 }],
    foes: ['ghoul', 'skeleton', 'soldier', 'hellhound', 'knight'], boss: 'mare' },
  { id: 'church', name: 'The Fallen Nave', h: 192, music: 'shinar', ground: [0x100e16, 0x34304a],
    layers: [{ key: 'church-wall', full: true, par: 0.3 }],
    props: [{ frame: 'church-column', x: 14, s: 0.78 }, { frame: 'church-column', x: 290, s: 0.78 }],
    foes: ['wizard', 'ghoul', 'wraith', 'lantern', 'priest'], boss: 'brimstone' },
  { id: 'night', name: 'The Sleeping Town', h: 224, music: 'hunt', ground: [0x0c1512, 0x25403a],
    layers: [{ key: 'night-sky', full: true, par: 0 }, { key: 'night-clouds', full: true, drift: 3, par: 0.02 }, { key: 'night-mountains', full: true, par: 0.08 },
      { key: 'night-forest', par: 0.2 }, { key: 'night-far', par: 0.3 }, { key: 'night-town', par: 0.45 }],
    props: [{ frame: 'town-5', x: 210, s: 0.55 }],
    foes: ['hellhound', 'wraith', 'fireskull', 'wolf', 'sentinel'], boss: 'azkar' },
  { id: 'ruin', name: 'The Broken Quarter', h: 176, music: 'cinders', ground: [0x1f1f14, 0x5a5a38],
    layers: [{ key: 'ruin-clouds', full: true, drift: 2, par: 0.03 }, { key: 'ruin-town', full: true, par: 0.35 }],
    props: [{ frame: 'graves-4', x: 252, s: 0.55 }, { frame: 'town-0', x: 40, s: 0.5 }],
    foes: ['ghoul', 'fireskull', 'hellbeast', 'brute', 'knight'], boss: 'shade' },
  { id: 'castle', name: 'The Castle Depths', h: 304, music: 'cinders', ground: [0x0b100e, 0x2c3a33],
    layers: [{ key: 'castle-hall', full: true, par: 0.35 }],
    props: [],
    foes: ['skeleton', 'wizard', 'nightmare', 'bulwark', 'fireskull'], boss: 'varkhos' },
];

/** The place a gate stands in. */
export const sceneOf = (gate: number) => SCENES[(gate - 1) % SCENES.length];
/** Every layer's texture key (the Watch loads them once). */
export const LAYER_KEYS = [...new Set(SCENES.flatMap((s) => s.layers.map((l) => l.key)))];
