// Remnant's Rest: the settlement that grows as Elior brings people home.
// Its tier is read from progress the save already holds (people rescued and
// chapters finished), so every player sees the right village the moment they
// arrive. Residents, services and the quest board are data here; the room is
// game/restRoom.ts, its art render/envRest.ts and its menus ui/settlement.ts.

import { G, flag, placeBanner } from './ctx';
import type { Story, QuestDef } from './story';
import { Entity } from './entity';
import { Pickup, type Npc } from './props';
import type { Enemy } from './enemies';
import type { Loot, NpcKind } from './tiles';
import { TILE } from './tiles';
import { CHAPTERS } from './chapters';
import { chapterForRoom } from './fallenChapters';
import { REST_ID, REST_BOARD_X, restGround } from './restRoom';
import { makeItem, addMaterial, hasMaterials, payMaterials, derive } from './state';
import { ITEMS } from './data';
import { sfx } from '../audio/audio';
import { fx } from '../render/fx';
import { lighting } from '../render/lighting';
import { drawBoard, drawWaypost } from '../render/envRest';
import type { Ctx } from '../render/draw';
import { openBoard } from '../ui/settlement';

export { REST_ID };

export interface RestQuestState { done?: boolean; base?: number; n?: number }
export interface SettlementSave {
  /** Highest tier the player has walked into (-1: never visited). */
  seen: number;
  /** Told that the Rest exists. */
  told?: boolean;
  /** Accepted requests; present means accepted. */
  quests: Record<string, RestQuestState>;
  titles: string[];
  /** Ezra's one-time gift has been given. */
  gift?: boolean;
}

/** The settlement's save block, created on demand for saves made before it existed. */
export function restSave(): SettlementSave {
  const s = G.save;
  s.settlement ??= { seen: -1, quests: {}, titles: [] };
  s.settlement.quests ??= {};
  s.settlement.titles ??= [];
  return s.settlement;
}

// ---------------------------------------------------------------- growth

export const restOpen = () => flag('ending_done');

/** People brought home, weighted by how many came with them. */
const SURVIVORS: [flag: string, people: number][] = [
  ['tobiah_saved', 1], ['captives_freed', 3], ['ch5_writing', 1], ['ch6_storm_done', 1],
  ['ch7_rescued', 2], ['ch8_rescued', 2], ['ch9_rescued', 2], ['ch10_rescued', 1],
];
/** Score needed for each tier: roughly Ch I, II, IV, VI and VIII with their rescues. */
const TIER_AT = [0, 3, 8, 12, 18];

export const REST_TIERS = [
  { name: 'A Camp of Tents', sub: 'A few tents beside a well. A beginning.' },
  { name: 'A Hamlet', sub: 'Cabins with lit windows, and a market stall.' },
  { name: 'A Village', sub: 'A smithy rings, and a healer keeps a house.' },
  { name: 'A Town of the Remnant', sub: 'A gathering hall, gardens, and children at play.' },
  { name: 'A Town at Festival', sub: 'A watchtower over the valley, and lamps strung for the feast.' },
];

export function restScore() {
  let n = CHAPTERS.filter((c) => c.done()).length;
  for (const [f, people] of SURVIVORS) if (flag(f)) n += people;
  return n;
}

export function restTier() {
  const n = restScore();
  let t = 0;
  for (let i = 0; i < TIER_AT.length; i++) if (n >= TIER_AT[i]) t = i;
  return t;
}

/** What the next tier needs, in words, or null at the top. */
export function restNext() {
  const t = restTier();
  if (t >= TIER_AT.length - 1) return null;
  return `${TIER_AT[t + 1] - restScore()} more: finish chapters and bring survivors home`;
}

// ---------------------------------------------------------------- residents

interface Resident {
  kind: NpcKind;
  role: string;
  here: () => boolean;
  /** Lines in story order; the latest that applies is said, alternating with the one before it. */
  lines: [when: () => boolean, text: string][];
}

const t = (n: number) => () => restTier() >= n;
const always = () => true;

export const RESIDENTS: Resident[] = [
  { kind: 'azriel', role: 'Captain of the Watch', here: always, lines: [
    [always, 'Tents on good ground, water close by, a road we can watch. It is not a home yet. It is a start.'],
    [always, 'I post a watch at the gate every night. Old habit. Most nights the watchman just counts the stars.'],
    [() => flag('ch4_done'), 'Every week someone walks down that road with nothing but the clothes on their back. Every week we make room.'],
    [() => flag('ch6_done'), 'I trained watchmen to hold a road. I never thought I would see a town grow up behind it.'],
    [() => flag('ch9_done'), 'Rest, Elior. That is an order. The road is quiet, and you have earned a night under a roof.'],
  ] },
  { kind: 'tobiah', role: 'Watchman', here: always, lines: [
    [always, 'I counted the tents. Then I counted again. Eleven. Twelve if you count the one that keeps falling down. That one is mine.'],
    [t(1), 'I have a cabin now. A door. A latch! I lock it and unlock it for no reason at all.'],
    [t(2), 'Dov let me hold the tongs. Once. I am not allowed near the forge anymore. It was a very small fire.'],
    [t(4), 'They let me ring the festival bell! Well. They let me stand near the bell while someone else rang it.'],
  ] },
  { kind: 'mara', role: 'Keeper of the Board', here: always, lines: [
    [always, 'I nailed a board to this post. People write what they need, and someone answers. That is how a village begins.'],
    [() => flag('ch5_done'), 'I keep a register of every name that comes down the road. It is the first book I have written that is not a warning.'],
    [t(3), 'The children want me to teach them letters. I said yes before I remembered I have never taught anyone anything.'],
  ] },
  { kind: 'ilan', role: 'Merchant', here: t(1), lines: [
    [always, 'Real walls, real customers. I have even started giving credit. Do not tell anyone.'],
    [t(3), 'Grain from the gardens, iron from the smithy, and a merchant in the middle. This is the life I was promised.'],
  ] },
  { kind: 'dov', role: 'Smith', here: t(2), lines: [
    [always, 'Hinges. Ploughshares. A cradle, last week. The forge remembers what it was for.'],
    [() => flag('ch9_rescued'), 'The foundry smiths work beside me now. They hammer quieter than I do. I am learning.'],
  ] },
  { kind: 'ezra', role: 'Healer', here: t(2), lines: [
    [always, 'Sit. Drink this. You are not the first stubborn one to come through my door.'],
    [() => flag('ch8_rescued'), 'The infirmary folk keep the herb beds. Nobody here coughs green any more.'],
  ] },
  { kind: 'talia', role: 'Builder', here: () => restTier() >= 2 && flag('captives_freed'), lines: [
    [always, 'When the furnace door opened, I thought it was the end. It was a door. That is all it was.'],
    [t(3), 'I drew the hall on a scrap of hide and everyone laughed. Then they all picked up a hammer.'],
    [() => flag('ch9_rescued'), 'The smiths from the foundry sing while they work. Azkar never let them sing.'],
  ] },
  { kind: 'barak', role: 'Gardener', here: () => restTier() >= 2 && flag('captives_freed'), lines: [
    [always, 'Eighty-one, and I am planting fig trees. Somebody else will eat the figs. That is the point of planting.'],
    [t(3), '"But they shall sit every man under his vine and under his fig tree; and none shall make them afraid: for the mouth of the LORD of hosts hath spoken it." Micah 4:4 (KJV). I am holding Him to it.'],
    [() => flag('ch7_rescued'), 'The grove children follow me about the gardens. I tell them about the furnace. They do not believe a word.'],
  ] },
  { kind: 'hanan', role: 'Elder', here: () => restTier() >= 3 && (flag('ch5_writing') || flag('ch10_rescued')), lines: [
    [always, 'Here the answer comes as bread, and a roof, and rain at the right time. I am content to wait for that kind.'],
    [() => flag('ch6_done'), 'I fasted three weeks by a river for one word. Here they ring a bell for supper. I come running like a boy.'],
    [() => flag('ch10_rescued'), 'I sat in that drowned library so long I forgot the colour of a field. Thank you for bringing me back to one.'],
  ] },
  { kind: 'arshan', role: 'Keeper of the Tower', here: () => restTier() >= 4 && flag('ch6_storm_done'), lines: [
    [always, 'Captain of a king\'s guard, now keeper of a wooden tower. I have never slept so well.'],
    [() => flag('ch9_done'), 'From the tower I can see three roads. Nothing on any of them but carts and pilgrims.'],
  ] },
];

// ---------------------------------------------------------------- requests

export interface RestQuest {
  id: string;
  title: string;
  giver: NpcKind;
  tier: number;
  /** Extra condition before the request is posted. */
  open?: () => boolean;
  ask: string;
  /** Progress as [have, want]. */
  progress: (q: RestQuestState) => [number, number];
  /** Taken on turning in. */
  pay?: Record<string, number>;
  reward: { silver?: number; mats?: Record<string, number>; title?: string };
  thanks: string;
}

export const LOCKET_ID = 'rest_locket';

export const REST_QUESTS: RestQuest[] = [
  {
    id: 'rq_nails', title: 'Nails for the Cabins', giver: 'azriel', tier: 0,
    ask: 'Canvas will not keep out the winter. Bring 8 Iron Scrap so the first cabins can be nailed together.',
    progress: () => [G.save.materials.iron_scrap ?? 0, 8], pay: { iron_scrap: 8 },
    reward: { silver: 200, mats: { covenant_fragment: 2 } },
    thanks: 'Eight good pieces. We will have a roof over the first family by the new moon.',
  },
  {
    id: 'rq_road', title: 'Keep the Road Clear', giver: 'tobiah', tier: 1,
    ask: 'Settlers walk the roads alone. Defeat 20 foes anywhere you travel, so fewer of them are waiting.',
    progress: (q) => [Math.max(0, G.save.kills - (q.base ?? G.save.kills)), 20],
    reward: { silver: 450, title: 'Road-Warden' },
    thanks: 'Three families came down the road this week without a scratch. They asked who to thank. I said you. Mostly you.',
  },
  {
    id: 'rq_locket', title: 'The Lost Locket', giver: 'mara', tier: 1,
    ask: 'My grandmother\'s locket fell when we fled the Market of Hearthward. It will be lying near the old stalls, west of the well.',
    progress: () => [G.save.opened.includes(LOCKET_ID) ? 1 : 0, 1],
    reward: { silver: 300, mats: { covenant_fragment: 3 }, title: 'Finder of Small Things' },
    thanks: 'Her face is still inside. I had begun to forget it. Thank you, Elior.',
  },
  {
    id: 'rq_cores', title: 'Light for the Hall', giver: 'hanan', tier: 3,
    ask: 'The hall needs lamps that will not gutter in the wind. Bring 5 Radiant Cores to set in them.',
    progress: () => [G.save.materials.radiant_core ?? 0, 5], pay: { radiant_core: 5 },
    reward: { silver: 2500, mats: { covenant_fragment: 6 }, title: 'Lamplighter of the Hall' },
    thanks: 'Five lamps, and not one of them smokes. The children will think it is always morning in here.',
  },
  {
    id: 'rq_hunt', title: 'Thin the Packs', giver: 'barak', tier: 3, open: () => flag('ch7_intro'),
    ask: 'The grove children still wake at the sound of a horn. Defeat 20 foes in the lands of the Hunt (Chapter VII).',
    progress: (q) => [q.n ?? 0, 20],
    reward: { silver: 3000, mats: { radiant_core: 3 }, title: 'Warden of the Unhunted' },
    thanks: 'The children slept through the night. All of them. I sat up to make sure.',
  },
];

/** The board's requests as journal entries, so they show in the quest log. */
export const REST_QUEST_DEFS: QuestDef[] = REST_QUESTS.map((q) => ({
  id: q.id, title: q.title, kind: 'side' as const, stages: [`${q.ask} (Remnant's Rest)`], done: q.thanks,
}));

export const questPosted = (q: RestQuest) => restTier() >= q.tier && (q.open?.() ?? true);
export const questState = (q: RestQuest) => restSave().quests[q.id];
export function questReady(q: RestQuest) {
  const st = questState(q);
  if (!st || st.done) return false;
  const [have, want] = q.progress(st);
  return have >= want && (!q.pay || hasMaterials(G.save, q.pay));
}

// ---------------------------------------------------------------- the market and the smithy

export interface RestStock { id: string; price: number; mat?: boolean; once?: boolean; cond?: string }
/** What Ilan adds to his stall at the Rest, tier by tier. Elsewhere he sells as before. */
const STOCK_BY_TIER: (RestStock & { tier: number })[] = [
  { id: 'sentinel_steel', price: 60, mat: true, tier: 1 },
  { id: 'covenant_fragment', price: 180, mat: true, tier: 1 },
  { id: 'pilgrim_boots', price: 180, tier: 2 },
  { id: 'ring_of_vigil', price: 220, tier: 2 },
  { id: 'pilgrim_band', price: 240, tier: 3 },
  { id: 'radiant_core', price: 900, mat: true, tier: 3 },
];
export function restStock(): RestStock[] {
  if (G.world?.room.id !== REST_ID) return [];
  const tier = restTier();
  // The festival brings caravans: everything is cheaper at the top tier.
  return STOCK_BY_TIER.filter((x) => tier >= x.tier).map((x) => ({ id: x.id, price: tier >= 4 ? Math.round(x.price * 0.8) : x.price, mat: x.mat }));
}

export interface RestRecipe { id: string; name: string; desc: string; cost: Record<string, number>; forge: boolean; make: () => void; icon: string }
/** Dov's settlement-only work, offered at the Rest's forge once it is built. */
export function restRecipes(): RestRecipe[] {
  if (G.world?.room.id !== REST_ID) return [];
  const s = G.save, tier = restTier(), out: RestRecipe[] = [];
  const give = (id: string) => () => { const it = makeItem(id); s.inventory.push(it); G.ui.itemGet(it); };
  const owns = (id: string) => s.inventory.some((i) => i.id === id);
  if (tier >= 2 && !owns('settlers_ward'))
    out.push({ id: 'settlers_ward', name: ITEMS.settlers_ward.name, desc: 'Remnant\'s Rest only. A ring of hinge-iron: health, defense and hardier Echoes.', cost: { iron_scrap: 8, covenant_fragment: 4, silver: 500 }, forge: true, icon: 'ring', make: give('settlers_ward') });
  if (tier >= 4 && !owns('rest_standard'))
    out.push({ id: 'rest_standard', name: ITEMS.rest_standard.name, desc: 'Remnant\'s Rest only. The festival banner as a relic: Rally, Echo strength and experience.', cost: { radiant_core: 3, covenant_fragment: 8, silver: 2500 }, forge: true, icon: 'sigil', make: give('rest_standard') });
  return out;
}

// ---------------------------------------------------------------- flags for the room

/**
 * Set the room's tier and resident flags before it spawns, so decor, lights and
 * residents with `rest_t*` / `rest_npc_*` conditions match the save. Cheap; runs on every load.
 */
export function syncRest(roomId: string) {
  if (roomId !== REST_ID || !G.save) return;
  const f = G.save.flags, tier = restTier();
  for (let i = 1; i <= 4; i++) if (tier >= i) f['rest_t' + i] = true; else delete f['rest_t' + i];
  for (const r of RESIDENTS) if (r.here()) f['rest_npc_' + r.kind] = true; else delete f['rest_npc_' + r.kind];
}

// ---------------------------------------------------------------- things to interact with

/** The notice board on the plaza. */
export class QuestBoard extends Entity {
  range = 30;
  constructor(x: number, y: number) {
    super(x, y, 24, 30);
    this.layer = 3;
    this.grav = 0;
    this.collide = false;
  }
  prompt() { return 'Read the board'; }
  interact() { openBoard(); }
  update() {}
  draw(ctx: Ctx) {
    const posted = REST_QUESTS.filter((q) => questPosted(q) && !questState(q)?.done).length;
    drawBoard(ctx, this.x, this.y, posted, REST_QUESTS.some(questReady), G.time);
  }
  lights() { lighting.add(this.x, this.y - 22, 44, '#ffd890', 0.5, 0.3); }
}

/** A signpost on the Ashen Road pointing down into the valley. */
export class Waypost extends Entity {
  range = 30;
  constructor(x: number, y: number) {
    super(x, y, 14, 40);
    this.layer = 2;
    this.grav = 0;
    this.collide = false;
  }
  prompt() { return 'Take the path to Remnant\'s Rest'; }
  interact() { if (!G.world.transitioning && !G.inCutscene) void G.world.transition(REST_ID, 'left'); }
  update() {}
  draw(ctx: Ctx) { drawWaypost(ctx, this.x, this.y, G.time); }
  lights() { lighting.add(this.x + 8, this.y - 40, 60, '#ffcf6b', 0.7, 0.4); }
}

/** Mara's grandmother's locket: an ordinary pickup that says what it is. */
class Keepsake extends Pickup {
  constructor(x: number, y: number) { super(x, y, LOCKET_ID, [] as Loot[]); }
  update() {
    super.update();
    if (this.remove) {
      sfx('lootRare', { vol: 0.6 });
      G.ui.toast('Found: Mara\'s locket. Bring it to the board at Remnant\'s Rest.', 'loot');
      G.world.autosave(true);
    }
  }
}

// ---------------------------------------------------------------- the story's hooks

export class Settlement {
  /** Counts arrivals from elsewhere: resting at the altar reloads the room but is the same visit. */
  private visit = 0;
  private healedVisit = -1;
  private lastRoom = '';
  private said: Record<string, number> = {};
  constructor(private st: Story) {}

  tier = restTier;

  /** Called on every room entry. Returns true when the Rest handled it. */
  onEnter(id: string, first: boolean) {
    const W = G.world, prev = this.lastRoom;
    this.lastRoom = id;
    if (id === 'ashen_road' && restOpen()) W.add(new Waypost(8 * TILE, 19 * TILE));
    if (id === 'village_square' && restSave().quests.rq_locket && !G.save.opened.includes(LOCKET_ID)) W.add(new Keepsake(27 * TILE, 29 * TILE));
    if (restOpen() && !restSave().told && id !== REST_ID) {
      restSave().told = true;
      setTimeout(() => G.ui.toast('Survivors have made camp in the valley below the Ashen Road: Remnant\'s Rest. Travel there from any altar.', 'info'), 1600);
    }
    if (id !== REST_ID) return false;
    if (prev !== REST_ID) this.visit++;
    const s = restSave();
    s.told = true;
    W.add(new QuestBoard(REST_BOARD_X * TILE, restGround(REST_BOARD_X) * TILE));
    if (!G.save.altarsLit.includes(REST_ID)) G.save.altarsLit.push(REST_ID);
    const tier = restTier(), grew = s.seen >= 0 && tier > s.seen;
    if (prev !== REST_ID) {
      if (grew) setTimeout(() => G.ui.banner('THE SETTLEMENT GROWS', `Remnant's Rest · ${REST_TIERS[tier].name}`, 'chapter'), 500);
      else if (first || s.seen < 0) placeBanner(G.world.room, 'REMNANT\'S REST', REST_TIERS[tier].name);
      if (grew) setTimeout(() => G.ui.toast(REST_TIERS[tier].sub, 'good'), 2400);
    }
    if (s.seen < 0 && !G.inCutscene) void this.welcome();
    s.seen = Math.max(s.seen, tier);
    return true;
  }

  private async welcome() {
    await new Promise((r) => setTimeout(r, 1400));
    if (G.world.room.id !== REST_ID || G.inCutscene) return;
    await this.st.say([
      { who: 'azriel', text: 'Elior. Welcome to the Rest. We needed somewhere that was not a camp, and somewhere the road could not see from the ridge.' },
      { who: 'mara', text: 'Every survivor you bring home will want a roof, and work for their hands. The place will grow with them.' },
      { who: 'elior', text: 'Then I had better keep bringing them.' },
    ]);
  }

  onKill(e: Enemy) {
    if (!e.isFoe) return;
    const q = restSave().quests.rq_hunt;
    if (q && !q.done && chapterForRoom(G.world.room.id)?.n === 7) q.n = (q.n ?? 0) + 1;
  }

  async talk(n: Npc): Promise<boolean> {
    if (G.world.room.id !== REST_ID) return false;
    const r = RESIDENTS.find((x) => x.kind === n.kind);
    if (!r) return false;
    if (n.kind === 'ezra') { await this.heal(); return true; }
    const lines = r.lines.filter(([when]) => when()).map(([, text]) => text);
    // The newest line first, then it alternates with the one before.
    const k = (this.said[n.kind] = (this.said[n.kind] ?? -1) + 1);
    const text = lines[lines.length - 1 - (k % Math.min(2, lines.length))];
    await this.st.say([{ who: n.kind, text }]);
    if (n.kind === 'ilan') G.ui.openShop('merchant');
    else if (n.kind === 'dov') G.ui.openShop('smith');
    else if (n.kind === 'mara') openBoard();
    return true;
  }

  /** Ezra: mends you once per visit, and once gives you a vial of her own. */
  private async heal() {
    const s = G.save, rs = restSave(), W = G.world;
    const lines = RESIDENTS.find((x) => x.kind === 'ezra')!.lines.filter(([w]) => w()).map(([, x]) => x);
    if (this.healedVisit === this.visit) {
      await this.st.say([{ who: 'ezra', text: 'You are mended. Go on, before I find something else to fix.' }]);
    } else {
      this.healedVisit = this.visit;
      W.rest();
      sfx('heal');
      fx.holyBurst(W.player.x, W.player.y - 20, 14, 0.8);
      await this.st.say([{ who: 'ezra', text: lines[lines.length - 1] }]);
      G.ui.toast('Ezra tends you: health, Balm and Echoes restored', 'good');
    }
    if (restTier() >= 3 && !rs.gift) {
      rs.gift = true;
      if (s.balmMax < 6) { s.balmMax++; s.balm = s.balmMax; G.ui.toast('Ezra\'s vial: Balm charges ' + s.balmMax, 'good'); }
      else { addMaterial(s, 'covenant_fragment', 3); G.ui.toast('Ezra\'s gift: 3 Covenant Fragments', 'loot'); }
      await this.st.say([{ who: 'ezra', text: 'Take this vial. I filled it from the herb beds the infirmary folk planted. Do not waste it on bruises.' }]);
      W.autosave(true);
    }
  }

  // ---- the board's actions (called by ui/settlement.ts)

  accept(id: string) {
    const q = REST_QUESTS.find((x) => x.id === id), rs = restSave();
    if (!q || rs.quests[id] || !questPosted(q)) return false;
    rs.quests[id] = { base: G.save.kills, n: 0 };
    this.st.quest(id, 0);
    sfx('uiOpen');
    if (id === 'rq_locket' && G.world.room.id === 'village_square') G.world.add(new Keepsake(27 * TILE, 29 * TILE));
    G.world.autosave(true);
    return true;
  }

  /** Pay out a finished request. Returns false if not ready; never pays twice. */
  turnIn(id: string) {
    const q = REST_QUESTS.find((x) => x.id === id), s = G.save, rs = restSave();
    const st = rs.quests[id];
    if (!q || !st || st.done || !questReady(q)) return false;
    if (q.pay && !payMaterials(s, q.pay)) return false;
    st.done = true;
    const r = q.reward;
    if (r.silver) s.silver += r.silver;
    for (const [m, n] of Object.entries(r.mats ?? {})) addMaterial(s, m, n);
    if (r.title && !rs.titles.includes(r.title)) rs.titles.push(r.title);
    this.st.quest(id, 0, true);
    sfx('lootRare', { vol: 0.7 });
    const got = [r.silver ? `${r.silver} silver` : '', ...Object.entries(r.mats ?? {}).map(([m, n]) => `${n} ${ITEMS[m].name}`)].filter(Boolean).join(', ');
    G.ui.toast(`Reward: ${got}`, 'loot');
    if (r.title) setTimeout(() => G.ui.toast(`Title earned: ${r.title}`, 'good'), 900);
    G.d = derive(s);
    G.world.autosave(true);
    return true;
  }
}

export const restTitle = () => restSave().titles[restSave().titles.length - 1] ?? '';
export const restResidents = () => RESIDENTS.filter((r) => r.here());
