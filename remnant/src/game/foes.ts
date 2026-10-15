// Enemy factory. Lives apart from the enemy classes so modules that extend
// the base Enemy (tanks, bosses) can be added without import cycles.

import type { EnemyKind } from './tiles';
import { Enemy, Husk, Hound, Archer, Sentinel, Wisp } from './enemies';
import { Brute, Bulwark, Knight } from './tanks';

export function makeEnemy(kind: EnemyKind, x: number, y: number, elite: string | null = null): Enemy {
  switch (kind) {
    case 'husk': return new Husk(x, y, elite);
    case 'hound': return new Hound(x, y, elite);
    case 'archer': return new Archer(x, y, elite);
    case 'sentinel': return new Sentinel(x, y, elite);
    case 'wisp': return new Wisp(x, y, elite);
    case 'brute': return new Brute(x, y, elite);
    case 'bulwark': return new Bulwark(x, y, elite);
    case 'knight': return new Knight(x, y, elite);
  }
}
