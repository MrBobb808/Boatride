import { BeastMonarch, PlagueMonarch } from './fallenBosses';
// The real chapter bosses, isolated from campaign rewards and story callbacks.
import { G } from './ctx';
import { Idol } from './boss';
import { BossBase, Gatekeeper, Marshal } from './bosses2';
import { LocustKing } from './bosses3';
import { GoldenImage } from './bosses4';
import { Weigher } from './bosses5';
import { makeEnemy } from './foes';
import { ECHO_SPECIES } from './data';
import type { EnemyKind } from './tiles';

const ROSTER = [Idol, Gatekeeper, Marshal, LocustKing, GoldenImage, Weigher, BeastMonarch, PlagueMonarch];
export const BOSS_COUNT = 6;
export const gauntletCount = () => G.save?.flags.ch8_done ? 8 : G.save?.flags.ch7_done ? 7 : BOSS_COUNT;
const IMPRINTS = [null, null, 'marshal', 'locust', null, null, null, null];
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
  const Kind = ROSTER[(round - 1) % gauntletCount()];
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
