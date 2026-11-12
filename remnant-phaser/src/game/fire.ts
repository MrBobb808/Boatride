// The Refiner's Fire (NEXT_PLAN.md C1): a finished chapter played again under conditions the player chooses. Each
// condition is worth heat; the heat a chapter's last boss falls under is kept as that chapter's seal (I, II or III),
// and the first time each tier is reached it pays. With no condition chosen a replay is exactly what it was. Pure
// numbers and the save; the scene applies them (scenes/World.ts) and the Chapters page offers them.
import { addMaterial } from '../../../remnant/src/game/state';
import { giveLegend } from './day';
import type { PhaserSave } from './save';

export type FireId = 'tough' | 'fierce' | 'fasting' | 'sevenfold';
export interface FireDef { id: FireId; name: string; says: string; heat: number; hp: number; dmg: number }
export const FIRES: FireDef[] = [
  { id: 'tough', name: 'Tried Metal', says: 'Foes and bosses have 40% more health', heat: 1, hp: 1.4, dmg: 1 },
  { id: 'fierce', name: 'Hotter Coals', says: 'Their blows land 30% harder', heat: 1, hp: 1, dmg: 1.3 },
  { id: 'fasting', name: 'Fasting', says: 'Balm is sealed: rest at altars only', heat: 2, hp: 1, dmg: 1 },
  { id: 'sevenfold', name: 'Seven Times Hotter', says: 'A further 30% health and 20% harder blows', heat: 2, hp: 1.3, dmg: 1.2 },
];
export const MAX_HEAT = FIRES.reduce((a, f) => a + f.heat, 0);
/** The final boss of each chapter: its fall under the Fire seals the chapter. */
export const FINAL_BOSS: Record<number, string> = { 1: 'idol', 2: 'marshal', 3: 'locust_king', 4: 'golden_image', 5: 'weigher', 6: 'persia_prince', 7: 'beast_monarch', 8: 'plague_monarch', 9: 'cinder_monarch', 10: 'grecia_prince', 11: 'nation_gods', 12: 'north_king', 13: 'tyrus_prince' };

export interface FireSave { on: FireId[]; seals?: Record<string, number> }
const valid = (on: unknown): FireId[] => (Array.isArray(on) ? FIRES.map((f) => f.id).filter((id) => on.includes(id)) : []);
export const firesOn = (s: PhaserSave): FireId[] => valid(s.fire?.on);
export const heatOf = (on: FireId[]) => FIRES.reduce((a, f) => a + (on.includes(f.id) ? f.heat : 0), 0);
export const fireMult = (on: FireId[]) => FIRES.reduce((m, f) => (on.includes(f.id) ? { hp: m.hp * f.hp, dmg: m.dmg * f.dmg } : m), { hp: 1, dmg: 1 });
/** Seal tiers by heat: I from 1, II from 3, III from 5. */
export const tierOf = (heat: number) => (heat >= 5 ? 3 : heat >= 3 ? 2 : heat >= 1 ? 1 : 0);
export const TIER_NAME = ['', 'I', 'II', 'III'];
export const sealOf = (s: PhaserSave, chapter: number) => Math.max(0, Math.floor(Number(s.fire?.seals?.[chapter]) || 0));

export function setFires(s: PhaserSave, on: FireId[]) { (s.fire ??= { on: [] }).on = valid(on); }

export interface Refined { heat: number; tier: number; first: boolean; gifts: string[] }
/** A chapter's last boss fell under the Fire: keep the best heat, and pay each tier the first time it is reached. */
export function refine(s: PhaserSave, chapter: number, rnd: () => number = Math.random): Refined | null {
  const heat = heatOf(firesOn(s));
  if (heat <= 0) return null;
  const f = (s.fire ??= { on: [] }), before = tierOf(sealOf(s, chapter)), tier = tierOf(heat), gifts: string[] = [];
  (f.seals ??= {})[chapter] = Math.max(sealOf(s, chapter), heat);
  for (let t = before + 1; t <= tier; t++) {
    const silver = 400 * t * Math.max(1, chapter);
    s.silver += silver; addMaterial(s, 'covenant_fragment', 2 * t); gifts.push(`${silver} silver`, `${2 * t} Covenant Fragments`);
    if (t >= 2) gifts.push(`${giveLegend(s, rnd)} (a legendary piece)`);
  }
  return { heat, tier, first: tier > before, gifts };
}

/** Repair, never refuse. */
export function settleFire(s: PhaserSave) {
  const f = s.fire as FireSave | undefined;
  if (f === undefined) return;
  if (!f || typeof f !== 'object') { delete s.fire; return; }
  f.on = valid(f.on);
  const seals: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.seals ?? {})) { const n = Math.min(MAX_HEAT, Math.floor(Number(v) || 0)); if (FINAL_BOSS[Number(k)] && n > 0) seals[k] = n; }
  f.seals = seals;
}
