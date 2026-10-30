// Psalms (POLISH_PLAN §12d, after Hollow Knight's charms): each boss leaves one, and each changes how you play:
// combat, movement, or the Echoes and partner. Worn Psalms cost slots: three to begin, one more per Psalter Page
// found (two hidden in secret chests, two from bosses), up to seven. Both heroes wear the same Psalms.
// Saved as the optional PhaserSave.psalms; Psalter Pages are key items.
import { ITEMS } from '../../../remnant/src/game/data';
import { ROOMS } from '../shared';
import type { PhaserSave } from './save';

export type PsalmId = 'broken_idol' | 'open_gate' | 'banner' | 'swarm' | 'furnace' | 'balance' | 'wind' | 'watch' | 'four_winds' | 'hunt' | 'cleansing' | 'refiner';
export interface Psalm { id: PsalmId; name: string; cost: number; boss: string; bossName: string; kind: 'Combat' | 'Movement' | 'Echoes'; desc: string }

const P = (id: PsalmId, name: string, cost: number, boss: string, bossName: string, kind: Psalm['kind'], desc: string): Psalm => ({ id, name, cost, boss, bossName, kind, desc });
export const PSALMS: Psalm[] = [
  P('broken_idol', 'Psalm of the Broken Idol', 1, 'idol', 'the Gilded Idol', 'Combat', 'Heavy blows break a foe\'s guard 40% faster.'),
  P('open_gate', 'Psalm of the Open Gate', 2, 'gatekeeper', 'the Gatekeeper', 'Movement', 'A second air dash before you land.'),
  P('banner', 'Psalm of the Banner', 2, 'marshal', 'the Crimson Marshal', 'Echoes', 'Your Echoes strike 25% harder.'),
  P('swarm', 'Psalm of the Swarm', 2, 'locust_king', 'the Locust King', 'Combat', 'The third blow of a combo looses a wave of light.'),
  P('furnace', 'Psalm of the Furnace', 1, 'golden_image', 'the Image of Gold', 'Combat', 'A perfect parry heals 8% of your health.'),
  P('balance', 'Psalm of the Balance', 1, 'weigher', 'the Weigher', 'Combat', 'Critical blows return 6 Covenant Energy.'),
  P('wind', 'Psalm of the Wind', 2, 'storm_prince', 'the Prince of the Storm', 'Movement', 'The air dash carries 40% further.'),
  P('watch', 'Psalm of the Watch', 2, 'persia_prince', 'the Prince of Persia', 'Echoes', 'The partner can pull you up twice in a room, not once.'),
  P('four_winds', 'Psalm of the Four Winds', 3, 'grecia_prince', 'the Prince of Grecia', 'Movement', 'With the Eagle Plume, a third jump in the air.'),
  P('hunt', 'Psalm of the Hunt', 2, 'beast_monarch', 'Varkhos', 'Combat', 'A foe you parry takes 50% more damage for 4 seconds.'),
  P('cleansing', 'Psalm of the Cleansing', 2, 'plague_monarch', 'Morvane', 'Echoes', 'Your Echoes have 30% more health.'),
  P('refiner', 'Psalm of the Refiner', 2, 'cinder_monarch', 'Azkar', 'Combat', 'A perfect parry makes your next three blows critical.'),
];
export const PSALM = Object.fromEntries(PSALMS.map((p) => [p.id, p])) as Record<PsalmId, Psalm>;

/** The four Psalter Pages: two in secret chests, two from bosses. */
export const PAGE_CHESTS: Record<string, string> = { cistern_chest: 'psalter_1', road_far_roof: 'psalter_2' };
export const PAGE_BOSSES: Record<string, string> = { marshal: 'psalter_3', storm_prince: 'psalter_4' };
export const BASE_SLOTS = 3, MAX_SLOTS = 7;

/** Story flags that mark a boss beaten in saves from before Psalms (the rewards flag came later). */
const BEATEN: Record<string, string> = { idol: 'idol_defeated', gatekeeper: 'gate_open', marshal: 'marshal_raised', locust_king: 'ch3_king_done', golden_image: 'ch4_image_done', weigher: 'ch5_weigher_done', storm_prince: 'ch6_storm_done', persia_prince: 'ch6_prince_done', grecia_prince: 'ch10_done' };

let ready = false;
/** The Psalter Pages are key items, and the two chests hold one each. Once, at startup. */
export function registerPsalms() {
  if (ready) return;
  ready = true;
  for (const n of [1, 2, 3, 4]) {
    const id = `psalter_${n}`;
    ITEMS[id] = { id, name: 'Psalter Page', slot: 'key', rarity: 4, icon: 'book', value: 0, desc: 'A leaf of an old psalter. You can keep one Psalm more (Menu → Psalms).' } as (typeof ITEMS)[string];
  }
  for (const r of Object.values(ROOMS)) for (const e of r.ents) if (e.t === 'chest' && PAGE_CHESTS[e.id] && !e.loot.some((l) => l.item === PAGE_CHESTS[e.id])) e.loot.push({ item: PAGE_CHESTS[e.id] });
}

const state = (s: PhaserSave) => (s.psalms ??= { owned: [], worn: [] });
export const slots = (s: PhaserSave) => Math.min(MAX_SLOTS, BASE_SLOTS + s.keyItems.filter((k) => k.startsWith('psalter_')).length);
export const used = (s: PhaserSave) => (s.psalms?.worn ?? []).reduce((n, id) => n + (PSALM[id]?.cost ?? 0), 0);
export const owns = (s: PhaserSave, id: PsalmId) => !!s.psalms?.owned.includes(id);
/** Is this Psalm worn? Cheap enough for per-frame checks (a short array). */
export const wears = (s: PhaserSave, id: PsalmId) => !!s.psalms?.worn.includes(id);

export function wear(s: PhaserSave, id: PsalmId) {
  const p = state(s);
  if (!p.owned.includes(id) || p.worn.includes(id) || used(s) + PSALM[id].cost > slots(s)) return false;
  p.worn.push(id);
  return true;
}
export function takeOff(s: PhaserSave, id: PsalmId) {
  const p = state(s), i = p.worn.indexOf(id);
  if (i < 0) return false;
  p.worn.splice(i, 1);
  return true;
}

/** A boss's Psalm (and Page, where it carries one). Returns what was new. */
export function grantForBoss(s: PhaserSave, key: string) {
  const p = state(s), out: { psalm?: Psalm; page?: string } = {};
  const psalm = PSALMS.find((x) => x.boss === key);
  if (psalm && !p.owned.includes(psalm.id)) { p.owned.push(psalm.id); out.psalm = psalm; }
  const page = PAGE_BOSSES[key];
  if (page && !s.keyItems.includes(page)) { s.keyItems.push(page); out.page = page; }
  return out;
}

/** Saves with bosses already beaten receive their Psalms (and Pages) on load. Returns the Psalms granted. */
export function syncPsalms(s: PhaserSave) {
  state(s);
  const got: Psalm[] = [];
  for (const x of PSALMS) {
    const beaten = s.flags[`tz_spoils_${x.boss}`] || s.flags[`defeated_${x.boss}`] || s.defeated?.includes(x.boss) || (BEATEN[x.boss] && s.flags[BEATEN[x.boss]]);
    if (beaten) { const g = grantForBoss(s, x.boss); if (g.psalm) got.push(g.psalm); }
  }
  // A worn set that no longer fits (never expected) keeps the first Psalms that do.
  const p = s.psalms!;
  p.worn = p.worn.filter((id) => p.owned.includes(id));
  while (used(s) > slots(s)) p.worn.pop();
  return got;
}
