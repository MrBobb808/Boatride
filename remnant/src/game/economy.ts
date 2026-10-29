// Ilan's store and the salvage economy. Selling pays silver and salvage
// (materials by slot, rarity and element; Relic Shards from Epic gear and
// up), dismantling at Dov's forge pays double the materials and no silver,
// locks protect favourites, and the last ten sales can be bought back this
// session. The store's stock turns over each local day: three featured rare
// curios (silver plus Relic Shards), supplies, elixirs, the classic gear,
// tomes once per chapter, dyed capes and a sealed satchel. Prices follow the
// chapter curve, so nothing is trivial or out of reach. The UI is in
// ui/menus.ts (Ilan's stall and the pause menu's Store tab).

import { G, flag } from './ctx';
import { ITEMS, AFFIX_POOL, RARITY_AFFIX_COUNT, type ItemInst, type Rarity, type Slot } from './data';
import { addMaterial, makeItem, derive, isWorn, type SaveData } from './state';
import { chapterCurve } from './curve';
import { chapterOf } from './rooms';
import { RNG, uid } from '../core/math';
import { dayKey, daySeed } from './daily';
import { ELIXIRS, drinkElixir, type ElixirId } from './elixirs';
import { CAPES } from './valor';
import { travelBlocked } from './travel';

export interface StoreSave {
  /** The local day the purchases below belong to; a new day clears them. */
  day?: string;
  /** Once-a-day offers bought today. */
  bought?: string[];
  /** Capes bought (CAPES keys). */
  capes?: string[];
  /** Tomes read, as `<tome>_<chapter>`. */
  tomes?: string[];
}

export const SHARD = 'relic_dust';
export const BALM_CAP = 6;

// ---------------------------------------------------------------- pricing

/** The chapter the store stocks for: the furthest one reached. */
export function storeChapter(s: SaveData) {
  let done = 0;
  for (let n = 1; n <= 10; n++) if (s.flags['ch' + n + '_done']) done = n;
  let here = 1;
  try { here = chapterOf(s.room); } catch { /* an unknown room stocks for the chapters done */ }
  return Math.min(10, Math.max(done + 1, here));
}

/** Silver prices grow with the chapter, as foes' silver does. */
export const priceScale = (s: SaveData) => chapterCurve(storeChapter(s)).xp;

/** Featured curios' Power by chapter: close to, never above, the chapter's trophies. */
const CURIO_POWER = [0, 0, 40, 60, 80, 100, 125, 260, 310, 360, 420];

const barterOf = () => G.d?.barter ?? 0;
const discount = (silver: number) => Math.max(1, Math.round(silver * (1 - barterOf())));

// ---------------------------------------------------------------- selling and salvage

/** Why an item can't be sold or dismantled, or null if it can. */
export function keepReason(s: SaveData, it: ItemInst): string | null {
  const base = ITEMS[it.id];
  if (!base || base.slot === 'material' || base.slot === 'key' || base.slot === 'consumable') return 'Not for sale.';
  if (isWorn(s, it.uid)) return 'Equipped.';
  if (base.unique) return 'A keepsake: trophies and rewards stay with you.';
  if (s.locked?.includes(it.uid)) return 'Locked.';
  return null;
}

export const isLocked = (s: SaveData, it: ItemInst) => !!s.locked?.includes(it.uid);
export function toggleLock(s: SaveData, it: ItemInst) {
  const l = (s.locked ??= []);
  const i = l.indexOf(it.uid);
  if (i >= 0) l.splice(i, 1); else l.push(it.uid);
  return i < 0;
}

/** Rare and above ask before they go. */
export const needsConfirm = (it: ItemInst) => it.rarity >= 2;

export function sellPrice(it: ItemInst) {
  return Math.round((ITEMS[it.id].value * (1 + it.plus * 0.3) * (1 + it.rarity * 0.4)) / 2 * (1 + barterOf()));
}

const METAL: Partial<Record<Slot, number>> = { weapon: 2, armor: 2, helm: 1, gauntlets: 1, boots: 1, bow: 1, dagger: 1, garb: 1 };

/** What breaking an item down yields: dismantling doubles it. */
export function salvageOf(it: ItemInst, dismantle = false): Record<string, number> {
  const base = ITEMS[it.id], r = it.rarity, out: Record<string, number> = {};
  const add = (k: string, n: number) => { if (n > 0) out[k] = (out[k] ?? 0) + n; };
  const metal = METAL[base.slot as Slot];
  if (metal) {
    add('iron_scrap', metal + r + it.plus);
    if (r >= 2) add('sentinel_steel', 1);
  } else {
    add('veil_shard', 2 + r);
    add('iron_scrap', it.plus);
  }
  if (base.element) add('veil_shard', 1);
  if (r >= 3) add('covenant_fragment', r - 2);
  add(SHARD, [0, 0, 0, 1, 2, 3][r] ?? 0);
  const mult = (dismantle ? 2 : 1) * (1 + (G.d?.salvage ?? 0));
  for (const k of Object.keys(out)) out[k] = Math.max(1, Math.round(out[k] * mult));
  // A Rare piece only yields a shard when broken down whole.
  if (dismantle && r === 2) add(SHARD, 1);
  return out;
}

interface Sale { it: ItemInst; silver: number; mats: Record<string, number> }
/** The last ten sales, newest first. Not saved: buyback lasts the session. */
export const buyback: Sale[] = [];

function removeItem(s: SaveData, it: ItemInst) {
  s.inventory = s.inventory.filter((x) => x !== it);
  if (s.locked) s.locked = s.locked.filter((u) => u !== it.uid);
}

export function sellItem(s: SaveData, it: ItemInst): Sale | null {
  if (keepReason(s, it)) return null;
  const sale = { it, silver: sellPrice(it), mats: salvageOf(it) };
  s.silver += sale.silver;
  for (const [k, n] of Object.entries(sale.mats)) addMaterial(s, k, n);
  removeItem(s, it);
  buyback.unshift(sale);
  buyback.length = Math.min(buyback.length, 10);
  return sale;
}

export function dismantleItem(s: SaveData, it: ItemInst): Record<string, number> | null {
  if (keepReason(s, it)) return null;
  const mats = salvageOf(it, true);
  for (const [k, n] of Object.entries(mats)) addMaterial(s, k, n);
  removeItem(s, it);
  return mats;
}

/** Buying back returns the silver and the salvage; it waits while the salvage is spent. */
export function canBuyBack(s: SaveData, sale: Sale) {
  return s.silver >= sale.silver && Object.entries(sale.mats).every(([k, n]) => (s.materials[k] ?? 0) >= n);
}
export function buyBack(s: SaveData, sale: Sale) {
  const i = buyback.indexOf(sale);
  if (i < 0 || !canBuyBack(s, sale)) return false;
  s.silver -= sale.silver;
  for (const [k, n] of Object.entries(sale.mats)) s.materials[k] -= n;
  s.inventory.push(sale.it);
  buyback.splice(i, 1);
  return true;
}

/**
 * Junk: Common and Uncommon gear, untempered, not equipped, locked or a keepsake,
 * whose slot already holds something at least as rare.
 */
export function junk(s: SaveData): ItemInst[] {
  return s.inventory.filter((it) => {
    if (it.rarity > 1 || it.plus > 0 || keepReason(s, it)) return false;
    const slot = ITEMS[it.id].slot as Slot, eq = s.inventory.find((x) => x.uid === (s.equipment[slot] ?? s.archer?.equipment[slot]));
    return !!eq && eq.rarity >= it.rarity;
  });
}

export function sellJunk(s: SaveData) {
  let silver = 0, n = 0;
  for (const it of junk(s)) { const sale = sellItem(s, it); if (sale) { silver += sale.silver; n++; } }
  return { n, silver };
}

// ---------------------------------------------------------------- the store

export type OfferKind = 'rest' | 'featured' | 'supply' | 'elixir' | 'gear' | 'tome' | 'cape' | 'surprise';
export const OFFER_KINDS: { id: OfferKind; label: string }[] = [
  { id: 'rest', label: 'The Rest\'s caravans' },
  { id: 'featured', label: 'Featured today' },
  { id: 'supply', label: 'Supplies' },
  { id: 'elixir', label: 'Elixirs' },
  { id: 'gear', label: 'Arms and armour' },
  { id: 'tome', label: 'Tomes' },
  { id: 'cape', label: 'Capes' },
  { id: 'surprise', label: 'Curiosities' },
];

export interface Offer {
  key: string;
  kind: OfferKind;
  name: string;
  /** Why it's worth buying, in a line. */
  why: string;
  icon: string;
  color?: string;
  rarity: Rarity;
  silver: number;
  shards?: number;
  /** Why it can't be bought right now (sold out, at the cap, not yet). */
  closed?: string;
  /** Gear on offer, to show its numbers. */
  item?: ItemInst;
  /** Grant it (after payment); returns the toast. */
  give: (s: SaveData) => string;
}

/** Today's purchases; a new day clears them. */
function today(s: SaveData) {
  const st = (s.store ??= {});
  const key = dayKey();
  if (st.day !== key) { st.day = key; st.bought = []; }
  return st;
}
const boughtToday = (s: SaveData, key: string) => !!today(s).bought?.includes(key);

const CURIOS = Object.keys(ITEMS).filter((id) => id.startsWith('curio_'));

/** A featured curio, rolled from the day's seed so it is the same all day. */
function curio(rng: RNG, ch: number, salt: number): ItemInst {
  const id = CURIOS[Math.floor(rng.next() * CURIOS.length)];
  const roll = rng.next();
  const rarity = (roll < 0.1 ? 5 : roll < 0.45 ? 4 : 3) as Rarity;
  const it = makeItem(id, rarity, 0, false);
  it.uid = `store_${dayKey()}_${salt}`;
  const pool = AFFIX_POOL.slice();
  for (let i = 0; i < RARITY_AFFIX_COUNT[rarity] - RARITY_AFFIX_COUNT[3] + 1 && pool.length; i++) {
    const a = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    it.affixes.push({ key: a.key, v: Math.round(a.min + (a.max - a.min) * rng.next()) });
  }
  if (CURIO_POWER[ch]) it.lootPower = CURIO_POWER[ch];
  return it;
}

/** The classic stall's stock (also what the original edition sold). */
export const CLASSIC_STOCK: { id: string; price: number; cond?: string }[] = [
  { id: 'iron_cap', price: 45 },
  { id: 'chain_hauberk', price: 95 },
  { id: 'bronze_gauntlets', price: 60 },
  { id: 'greaves', price: 60 },
  { id: 'ember_lamp', price: 90 },
  { id: 'rusted_greatsword', price: 120 },
  { id: 'bell_shard', price: 160 },
  { id: 'ember_brand', price: 420, cond: 'ch1_done' },
  { id: 'frostwake_spear', price: 420, cond: 'ch1_done' },
  { id: 'stormcaller', price: 780, cond: 'ch2_done' },
];
const ONCE = new Set(['ember_brand', 'frostwake_spear', 'stormcaller']);

let cache: { key: string; featured: ItemInst[] } | null = null;
function featuredToday(ch: number) {
  const key = dayKey() + ':' + ch;
  if (cache?.key !== key) {
    const rng = new RNG(daySeed(key));
    const picks: ItemInst[] = [];
    for (let i = 0; picks.length < 3 && i < 12; i++) {
      const it = curio(rng, ch, i);
      if (!picks.some((p) => p.id === it.id)) picks.push(it);
    }
    cache = { key, featured: picks };
  }
  return cache.featured;
}

/** Everything on offer today, in display order. */
export function storeOffers(s: SaveData, extra: { id: string; price: number; mat?: boolean }[] = []): Offer[] {
  const ch = storeChapter(s), f = priceScale(s), mild = 1 + (f - 1) * 0.25;
  const st = today(s), out: Offer[] = [];
  const giveItem = (base: ItemInst | string) => (sv: SaveData) => {
    const it = typeof base === 'string' ? makeItem(base) : { ...base, affixes: base.affixes.map((a) => ({ ...a })), uid: uid() };
    it.isNew = true;
    sv.inventory.push(it);
    G.ui?.itemGet?.(it);
    return ITEMS[it.id].name;
  };

  // Featured: three rare curios a day, each once.
  featuredToday(ch).forEach((it, i) => {
    const key = 'feat_' + i, r = it.rarity;
    out.push({ key, kind: 'featured', name: ITEMS[it.id].name, why: ITEMS[it.id].desc, icon: ITEMS[it.id].icon, rarity: r, item: it,
      silver: discount([0, 0, 0, 600, 1100, 2000][r] * f), shards: [0, 0, 0, 2, 4, 7][r],
      closed: boughtToday(s, key) ? 'Sold. New wares tomorrow.' : undefined,
      give: (sv) => { today(sv).bought!.push(key); return giveItem(it)(sv); } });
  });

  // Supplies.
  const mat = (id: string, price: number, why: string, cond = '', perDay = 0) => {
    if (cond && !flag(cond)) return;
    const n = perDay ? st.bought!.filter((k) => k === 'mat_' + id).length : 0;
    out.push({ key: 'mat_' + id, kind: 'supply', name: ITEMS[id].name, why, icon: ITEMS[id].icon, rarity: ITEMS[id].rarity, silver: discount(price * mild),
      closed: perDay && n >= perDay ? 'Ilan has no more today.' : undefined,
      give: (sv) => { if (perDay) today(sv).bought!.push('mat_' + id); addMaterial(sv, id, 1); return ITEMS[id].name; } });
  };
  mat('iron_scrap', 14, 'Tempering and every forge recipe start here.');
  mat('veil_shard', 24, 'Five purify into a Covenant Fragment; rings and relics are tempered with them.');
  mat('sentinel_steel', 60, 'Dov forges Sentinel helms, plate and sigils from it.', 'ch1_done');
  mat('covenant_fragment', 180, 'Needed past +3 tempering, for Balm vials and Echo evolution. Three a day.', 'ch2_done', 3);
  mat('radiant_core', 1500, 'Takes an Echo to its final form. One a day.', 'ch5_done', 1);
  const vials = Math.max(0, s.balmMax - 3);
  out.push({ key: 'balm', kind: 'supply', name: 'Balm Vial', why: `One more Balm charge, for good (${s.balmMax}/${BALM_CAP}).`, icon: 'vial', rarity: 2,
    silver: discount(140 * Math.pow(2, vials) * mild), closed: s.balmMax >= BALM_CAP ? 'You carry as many as you can.' : undefined,
    give: (sv) => { sv.balmMax++; sv.balm++; return 'Balm charges: ' + sv.balmMax; } });

  // Elixirs: drunk on the spot, five minutes of play.
  for (const e of Object.values(ELIXIRS)) {
    out.push({ key: 'elixir_' + e.id, kind: 'elixir', name: e.name, why: e.desc + ' Five minutes; a new one replaces it.', icon: 'flask', color: e.color, rarity: 1,
      silver: discount(e.price * f), give: (sv) => { drinkElixir(sv, e.id as ElixirId); G.d = derive(sv); return e.name + ' · 5:00'; } });
  }

  // The classic stall, plus whatever the Rest's caravans bring.
  for (const x of CLASSIC_STOCK) {
    if (x.cond && !flag(x.cond)) continue;
    if (ONCE.has(x.id) && s.flags['bought_' + x.id]) continue;
    const b = ITEMS[x.id];
    out.push({ key: 'gear_' + x.id, kind: 'gear', name: b.name, why: b.desc, icon: b.icon, rarity: b.rarity, silver: discount(x.price),
      give: (sv) => { if (ONCE.has(x.id)) sv.flags['bought_' + x.id] = true; return giveItem(x.id)(sv); } });
  }
  for (const x of extra) {
    const b = ITEMS[x.id];
    if (!b) continue;
    out.push({ key: x.id, kind: 'rest', name: b.name, why: 'From the Rest\'s caravans. ' + b.desc, icon: b.icon, rarity: b.rarity, silver: discount(x.price),
      give: (sv) => (x.mat ? (addMaterial(sv, x.id, 1), b.name) : giveItem(x.id)(sv)) });
  }

  // Tomes, once per chapter.
  const tome = (id: string, name: string, why: string, price: number, read: (sv: SaveData) => string) => {
    const key = `${id}_${ch}`, done = s.store?.tomes?.includes(key);
    out.push({ key: 'tome_' + id, kind: 'tome', name, why, icon: 'book', rarity: 4, silver: discount(price * f),
      closed: done ? 'Read this chapter. Another copy turns up next chapter.' : undefined,
      give: (sv) => { (today(sv).tomes ??= []).push(key); return read(sv); } });
  };
  tome('insight', 'Tome of Insight', 'One skill point. One copy per chapter.', 900, (sv) => { sv.skillPoints++; return '+1 skill point'; });
  tome('discipline', 'Codex of Discipline', 'Three stat points. One copy per chapter.', 700, (sv) => { sv.statPoints += 3; return '+3 stat points'; });

  // Capes: worn from Journey → Valor.
  for (const id of ['saffron', 'indigo', 'cedar', 'pearl', 'ash']) {
    const owned = s.store?.capes?.includes(id);
    out.push({ key: 'cape_' + id, kind: 'cape', name: CAPES[id].name, why: 'A cape colour for Elior. Wear it from Journey → Valor.', icon: 'armor', color: CAPES[id].c, rarity: 2,
      silver: discount(600), closed: owned ? 'Yours.' : undefined,
      give: (sv) => {
        (today(sv).capes ??= []).push(id);
        if (sv.valor) sv.valor.cape = id;
        if (G.world?.player) G.world.player.styleKey = '';
        return CAPES[id].name + ' · worn';
      } });
  }

  // The day's surprise.
  out.push({ key: 'satchel', kind: 'surprise', name: 'Sealed Satchel', why: 'Ilan won\'t say what\'s inside. Always useful; sometimes a curio. One a day.', icon: 'craft', rarity: 3,
    silver: discount(120 * f), closed: boughtToday(s, 'satchel') ? 'Opened. Another tomorrow.' : undefined,
    give: (sv) => openSatchel(sv, ch) });
  return out;
}

/** The satchel: always materials, often more, now and then a whole curio. */
function openSatchel(s: SaveData, ch: number, random = Math.random) {
  today(s).bought!.push('satchel');
  const got: string[] = [];
  const add = (id: string, n: number) => { addMaterial(s, id, n); got.push(`${ITEMS[id].name} ×${n}`); };
  add('iron_scrap', 3 + Math.floor(random() * 3));
  add('veil_shard', 2 + Math.floor(random() * 2));
  if (random() < 0.4) add('covenant_fragment', 1);
  if (random() < 0.3) add(SHARD, 1);
  if (random() < 0.12) {
    const it = curio(new RNG(Math.floor(random() * 2 ** 31)), ch, Date.now());
    it.rarity = 3; it.affixes.length = Math.min(it.affixes.length, 1);
    it.uid = uid(); it.isNew = true;
    s.inventory.push(it);
    G.ui?.itemGet?.(it);
    got.push(ITEMS[it.id].name);
  }
  return got.join(' · ');
}

/** Pay for and grant an offer. Returns the toast, or null if it can't be bought. */
export function buyOffer(s: SaveData, o: Offer): string | null {
  if (o.closed || s.silver < o.silver || (s.materials[SHARD] ?? 0) < (o.shards ?? 0)) return null;
  s.silver -= o.silver;
  if (o.shards) s.materials[SHARD] -= o.shards;
  return o.give(s);
}

/** The pause menu's store: anywhere outside a fight, a boss, a cutscene or the Trial. */
export function storeBlocked(): string | null {
  const W = G.world;
  if (!W || !G.save) return 'Not now.';
  const t = travelBlocked();
  if (t) return t === 'Leave the Trial first.' ? 'Ilan does not trade inside the Trial.' : t;
  for (const e of W.ents ?? []) if (e.isFoe && (e as { aggro?: boolean }).aggro && !e.dying && !e.remove && Math.abs(e.x - W.player.x) < 420) return 'Not while foes are on you.';
  return null;
}

/** End an elixir when its time is up: re-derive the numbers and say so. Cheap when none is active. */
export function tickElixir() {
  const s = G.save;
  if (!s?.elixir || s.elixir.until > s.playtime) return;
  const name = ELIXIRS[s.elixir.id as ElixirId]?.name;
  s.elixir = undefined;
  G.d = derive(s);
  if (name) G.ui?.toast(`${name} has worn off`);
}
