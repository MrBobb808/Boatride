import { MapBuilder, type Biome } from './tiles';
import type { RoomData } from './rooms';

export const TRIAL_ARENAS: { name: string; biome: Biome; interior: boolean; dark: number; color: string }[] = [
  { name: 'Hall of the Remnant', biome: 'trial', interior: true, dark: 0.35, color: '#ffe6a8' },
  { name: 'Valley of the Unbroken', biome: 'valley', interior: false, dark: 0.25, color: '#b5d8e5' },
  { name: 'Furnace of Resolve', biome: 'furnace', interior: true, dark: 0.3, color: '#ff9b65' },
  { name: 'Gardens of Midnight', biome: 'gardens', interior: false, dark: 0.38, color: '#a2d8be' },
  { name: 'Palace of the Last Watch', biome: 'palace', interior: true, dark: 0.4, color: '#c9aeff' },
];
export const trialSector = (wave: number) => Math.floor((Math.max(1, wave) - 1) / 10);

export function trialArena(base: RoomData, wave: number): RoomData {
  const sector = trialSector(wave), theme = TRIAL_ARENAS[sector % TRIAL_ARENAS.length];
  const b = new MapBuilder(56, 22);
  b.rect(0, 0, 56, 2).rect(0, 18, 56, 4).rect(0, 2, 2, 16).rect(54, 2, 2, 16);
  // A continuous floor keeps every spawn lane safe; platforms change the aerial routes.
  const layouts = [
    [[12, 13, 8], [36, 13, 8], [24, 9, 8]],
    [[8, 14, 10], [28, 11, 10], [43, 14, 7]],
    [[8, 10, 10], [22, 14, 12], [39, 10, 10]],
    [[6, 14, 10], [18, 11, 8], [30, 8, 8], [42, 12, 8]],
    [[9, 12, 9], [23, 8, 10], [38, 14, 11]],
  ];
  for (const [x, y, width] of layouts[sector % layouts.length]) b.plat(x, y, width);
  return { ...base, rows: b.rows(), exits: [], name: theme.name, region: `Trial sector ${sector + 1} · waves ${sector * 10 + 1}–${sector * 10 + 10}`,
    biome: theme.biome, interior: theme.interior, dark: theme.dark, seed: 467 + sector * 137,
    weather: sector % 5 === 2 ? 'embers' : sector % 5 === 1 ? 'dust' : 'motes',
    ents: base.ents.map((e) => e.t === 'light' && e.k === 'glow' ? { ...e, c: theme.color } : e) };
}
