import { CinderMonarch } from './cinderBoss';
import { GreciaPrince } from './bosses10';
import { NationGods } from './bosses11';
import { NorthKing } from './bosses12';
import { TyrusPrince } from './bosses13';
import { BeastMonarch, PlagueMonarch } from './fallenBosses';
// The real chapter bosses, isolated from campaign rewards and story callbacks.
import { G } from './ctx';
import { RUSH_KEYS, rushRoster, rushName } from './rushKeys';
import { Idol } from './boss';
import { BossBase, Gatekeeper, Marshal } from './bosses2';
import { LocustKing } from './bosses3';
import { GoldenImage } from './bosses4';
import { Weigher } from './bosses5';
import { StormPrince, PersiaPrince } from './bosses6';
import { music } from '../audio/music';
import { makeEnemy } from './foes';
import { ECHO_SPECIES } from './data';
import type { EnemyKind } from './tiles';

type BossCtor = new (x: number, y: number) => Idol | BossBase;
const ROSTER: BossCtor[] = [Idol, Gatekeeper, Marshal, LocustKing, GoldenImage, Weigher, BeastMonarch, PlagueMonarch, CinderMonarch, GreciaPrince, NationGods, NorthKing, TyrusPrince];
export const BOSS_COUNT = 6;
export const gauntletCount = () => G.save?.flags.ch13_done ? 13 : G.save?.flags.ch12_done ? 12 : G.save?.flags.ch11_done ? 11 : G.save?.flags.ch10_done ? 10 : G.save?.flags.ch9_done ? 9 : G.save?.flags.ch8_done ? 8 : G.save?.flags.ch7_done ? 7 : BOSS_COUNT;
const IMPRINTS = [null, null, 'marshal', 'locust', null, null, null, null, null, null, null, null, null];
export const gauntletImprint = (round: number) => IMPRINTS[(round - 1) % gauntletCount()];

/** Echo rematches use the actual original enemy, including the two raised bosses. */
export function originalForm(species: string, round: number, hp: number, damage: number) {
  if (species === 'marshal' || species === 'locust') return gauntletBoss(species === 'marshal' ? 3 : 4, hp, damage, round);
  const e = makeEnemy(species as EnemyKind, 36 * 16, 18 * 16, null);
  e.maxHp = e.hp = Math.round(hp * 0.55 * Math.pow(1.22, Math.min(200, round - 1)));
  e.dmg = damage * Math.pow(1.1, Math.min(200, round - 1));
  e.tempo = Math.min(1.5, 1 + (round - 1) * 0.025);
  e.purifiable = false;
  e.name = ECHO_SPECIES[species].stages[0].name + ' · Original Form';
  G.world.add(e);
  G.world.bossActive = true;
  return e;
}

export function gauntletBoss(round: number, hp: number, damage: number, powerRound = round): Idol | BossBase {
  return spawnBoss(ROSTER[(round - 1) % gauntletCount()], hp, damage, powerRound);
}

/** The Boss Rush, in story order (keys and names in rushKeys.ts). */
const KINDS: Record<string, BossCtor> = {
  idol: Idol,
  gatekeeper: Gatekeeper,
  marshal: Marshal,
  locust_king: LocustKing,
  golden_image: GoldenImage,
  weigher: Weigher,
  storm_prince: StormPrince,
  persia_prince: PersiaPrince,
  beast_monarch: BeastMonarch,
  plague_monarch: PlagueMonarch,
  cinder_monarch: CinderMonarch,
  grecia_prince: GreciaPrince,
  nation_gods: NationGods,
  north_king: NorthKing,
  tyrus_prince: TyrusPrince,
};
export const RUSH_ORDER = RUSH_KEYS.map((b) => ({ ...b, Kind: KINDS[b.key] }));
export { rushRoster, rushName };

/** A rush boss at the run's entry strength: every fight in the run is the same size. */
export function rushBoss(key: string, hp: number, damage: number): Idol | BossBase {
  const def = RUSH_ORDER.find((b) => b.key === key) ?? RUSH_ORDER[0];
  const b = spawnBoss(def.Kind, hp, damage, 1);
  if (def.music) { music.play(def.music, 0.5); music.phase = 0; }
  return b;
}

function spawnBoss(Kind: BossCtor, hp: number, damage: number, powerRound: number): Idol | BossBase {
  const b = new Kind(36 * 16, 18 * 16);
  b.maxHp = b.hp = Math.round(hp * Math.pow(1.22, Math.min(200, powerRound - 1)));
  const dmg = damage * Math.pow(1.1, Math.min(200, powerRound - 1));
  if (b instanceof BossBase) b.ngMul *= dmg / b.dmg;
  else b.encounterDamage = dmg / b.dmg;
  b.encounterTempo = Math.min(1.5, 1 + (powerRound - 1) * 0.025);
  G.world.add(b);
  G.world.boss = b;
  G.world.bossActive = true;
  G.inCutscene = true;
  G.ui.cinematicBars(true);
  b.awaken();
  return b;
}
