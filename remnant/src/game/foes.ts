// Enemy factory. Lives apart from the enemy classes so modules that extend
// the base Enemy (tanks, bosses) can be added without import cycles.

import type { EnemyKind } from './tiles';
import { Enemy, Husk, Hound, Archer, Sentinel, Wisp } from './enemies';
import { Brute, Bulwark, Knight } from './tanks';
import { Drone, Soldier } from './locusts';
import { Lion, Priest } from './babylon';
import { Vessel, Scribe } from './feast';

/** Named elites. Classes give a generic elite title; these placed foes have their own. */
const ELITE_NAMES: Record<string, string> = {
  bone_colossus: 'Colossus of the Valley',
  den_lion: 'Lion of the Den',
  furnace_warden: 'The Furnace Warden',
  garden_keeper: 'Keeper of the Gardens',
  treasury_captain: 'Captain of the Treasury',
};

function build(kind: EnemyKind, x: number, y: number, elite: string | null): Enemy {
  switch (kind) {
    case 'husk': return new Husk(x, y, elite);
    case 'hound': return new Hound(x, y, elite);
    case 'archer': return new Archer(x, y, elite);
    case 'sentinel': return new Sentinel(x, y, elite);
    case 'wisp': return new Wisp(x, y, elite);
    case 'brute': return new Brute(x, y, elite);
    case 'bulwark': return new Bulwark(x, y, elite);
    case 'knight': return new Knight(x, y, elite);
    case 'drone': return new Drone(x, y, elite);
    case 'soldier': return new Soldier(x, y, elite);
    case 'lion': return new Lion(x, y, elite);
    case 'priest': return new Priest(x, y, elite);
    case 'vessel': return new Vessel(x, y, elite);
    case 'scribe': return new Scribe(x, y, elite);
  }
}

export function makeEnemy(kind: EnemyKind, x: number, y: number, elite: string | null = null): Enemy {
  const e = build(kind, x, y, elite);
  if (elite && ELITE_NAMES[elite]) e.name = ELITE_NAMES[elite];
  return e;
}
