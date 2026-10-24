// The original game's bosses from the Gilded Idol to the Prince of Grecia, run
// through the classic layer: their own moves, phases and art, unchanged. This
// table says how each one enters the Phaser build: the trigger that wakes it,
// its chapter, and what its defeat opens. Their story scenes (the dialogue
// before and after) come with the story port; until then a boss wakes with its
// own intro and its defeat sets the flags the story would have set to open the way.

import { Idol } from '../../../remnant/src/game/boss';
import { Gatekeeper, Marshal } from '../../../remnant/src/game/bosses2';
import { LocustKing } from '../../../remnant/src/game/bosses3';
import { GoldenImage } from '../../../remnant/src/game/bosses4';
import { Weigher } from '../../../remnant/src/game/bosses5';
import { StormPrince, PersiaPrince } from '../../../remnant/src/game/bosses6';
import { GreciaPrince } from '../../../remnant/src/game/bosses10';
import type { Entity } from '../../../remnant/src/game/entity';
import type { EnemyKind } from '../shared';

export type ClassicBossKey = 'idol' | 'gatekeeper' | 'marshal' | 'locust_king' | 'golden_image' | 'weigher' | 'storm_prince' | 'persia_prince' | 'grecia_prince';

export interface ClassicBoss extends Entity {
  key?: string;
  state: string;
  phase: number;
  poise: number;
  maxPoise: number;
  phaseMarks: number[];
  sub?: string;
  awaken(): void;
  kneel(): void;
}

interface Def {
  make(x: number, y: number): ClassicBoss;
  chapter: number;
  /** The trigger that wakes it. */
  trigger: string;
  /** Flags its defeat sets (what the story's defeat scene would set to open the way on). */
  flags: string[];
  /** The Locust King hatches only when the brood's waves are down. */
  waves?: [EnemyKind, number][][];
  /** Its fight needs the chapter's boundary broken first (the Fallen Crowns' rule). */
  boundary?: boolean;
}

export const CLASSIC_BOSSES: Record<ClassicBossKey, Def> = {
  idol: { make: (x, y) => new Idol(x, y) as unknown as ClassicBoss, chapter: 1, trigger: 'boss_start', flags: ['idol_defeated', 'crown_taken'] },
  gatekeeper: { make: (x, y) => new Gatekeeper(x, y), chapter: 2, trigger: 'gatekeeper_start', flags: ['gate_open'] },
  marshal: { make: (x, y) => new Marshal(x, y), chapter: 2, trigger: 'marshal_start', flags: ['marshal_raised'] },
  locust_king: {
    make: (x, y) => new LocustKing(x, y), chapter: 3, trigger: 'brood_start', flags: ['ch3_king_done'],
    // The original's two brood waves (story3.ts), then the cocoon opens.
    waves: [
      [['drone', 30], ['drone', 36], ['soldier', 52], ['drone', 20]],
      [['soldier', 14], ['soldier', 54], ['drone', 30], ['drone', 40], ['drone', 24]],
    ],
  },
  golden_image: { make: (x, y) => new GoldenImage(x, y), chapter: 4, trigger: 'image_start', flags: ['ch4_image_done'] },
  weigher: { make: (x, y) => new Weigher(x, y), chapter: 5, trigger: 'weigher_start', flags: ['ch5_weigher_done'] },
  storm_prince: { make: (x, y) => new StormPrince(x, y), chapter: 6, trigger: 'storm_start', flags: ['ch6_storm_done'] },
  persia_prince: { make: (x, y) => new PersiaPrince(x, y), chapter: 6, trigger: 'persia_start', flags: ['ch6_prince_done'] },
  grecia_prince: { make: (x, y) => new GreciaPrince(x, y), chapter: 10, trigger: 'grecia_prince_start', flags: ['ch10_done'], boundary: true },
};

export const isClassicBoss = (k: string): k is ClassicBossKey => k in CLASSIC_BOSSES;
