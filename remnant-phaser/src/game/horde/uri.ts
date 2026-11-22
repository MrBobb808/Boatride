// Uri's own journey: his level, points, tree and gear are his kit (game/heroKit.ts), made from the level he had
// earned before kits came. The Horde and the journey both read and feed it here.
import type { Derived } from '../../../../remnant/src/game/state';
import type { PhaserSave } from '../save';
import { kitOf, kitStats, kitGainXp, type KitSave } from '../heroKit';

export type UriSave = KitSave;

export const uriOf = (s: PhaserSave): UriSave => kitOf(s, 'uri');

/** His strength: his own level, stats, gear and tree. */
export function uriStats(s: PhaserSave, elior: Derived): Derived { return kitStats(s, 'uri', elior); }

/** XP for Uri, three times over while he is behind Elior. Returns the levels he gained. */
export function uriGainXp(s: PhaserSave, amount: number) { return kitGainXp(s, 'uri', amount); }
