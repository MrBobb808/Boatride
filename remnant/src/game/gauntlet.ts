// The real chapter bosses, isolated from campaign rewards and story callbacks.
import { G } from './ctx';
import { Idol } from './boss';
import { BossBase, Gatekeeper, Marshal } from './bosses2';
import { LocustKing } from './bosses3';
import { GoldenImage } from './bosses4';
import { Weigher } from './bosses5';

const ROSTER = [Idol, Gatekeeper, Marshal, LocustKing, GoldenImage, Weigher];
export const BOSS_COUNT = ROSTER.length;

export function gauntletBoss(round: number, hp: number, damage: number): Idol | BossBase {
  const Kind = ROSTER[(round - 1) % ROSTER.length];
  const b = new Kind(36 * 16, 18 * 16);
  b.maxHp = b.hp = Math.round(hp * Math.pow(1.22, Math.min(200, round - 1)));
  const dmg = damage * Math.pow(1.1, Math.min(200, round - 1));
  if (b instanceof BossBase) b.ngMul *= dmg / b.dmg;
  else b.encounterDamage = dmg / b.dmg;
  b.encounterTempo = Math.min(1.5, 1 + (round - 1) * 0.025);
  G.world.add(b);
  G.world.boss = b;
  G.world.bossActive = true;
  G.inCutscene = true;
  G.ui.cinematicBars(true);
  b.awaken();
  return b;
}
