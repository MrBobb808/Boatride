import { selectSlot } from '../../game/save';
import { G } from './ctx';
import { newGame, derive, type SaveData } from '../../../../remnant/src/game/state';
import { saveSlot, loadSlot } from './save';
export const app = { mode: 'game' };
export const returnToTitle = () => G.world.host.quitToTitle();
function enterGame(s: SaveData, slot: number, room: string, spawn: string) { G.slot = slot; selectSlot(slot); G.world.host.save = s; G.save = s; G.world.host.refreshStats(); G.world.load(room, spawn); }
export function loadGameSlot(slot: number) { const s = loadSlot(slot); if (s) enterGame(s, slot, s.room, s.spawn); return !!s; }
export function startNewGamePlus() {
  const old = G.save;
  const s = newGame(old.name);
  // carry power forward
  s.level = old.level;
  s.xp = old.xp;
  s.statPoints = old.statPoints;
  s.skillPoints = old.skillPoints;
  s.stats = { ...old.stats };
  s.skills = { ...old.skills };
  s.abilities = [...old.abilities];
  s.equippedSkills = [...old.equippedSkills];
  s.equippedSuper = old.equippedSuper;
  s.echoImprints = { ...old.echoImprints };
  s.trialMilestones = [...(old.trialMilestones ?? [])];
  s.weaponMastery = { ...old.weaponMastery };
  s.contracts = { ...old.contracts };
  s.inventory = old.inventory;
  s.equipment = { ...old.equipment };
  s.materials = { ...old.materials };
  s.echoes = old.echoes;
  s.active = [...old.active];
  s.storySlots = old.storySlots;
  s.formations = old.formations;
  s.silver = old.silver;
  s.balmMax = old.balmMax;
  s.balm = old.balmMax;
  s.lore = [...old.lore];
  s.secrets = [];
  s.ng = old.ng + 1;
  s.playtime = old.playtime;
  s.kills = old.kills;
  s.deaths = old.deaths;
  // The covenant, the relics and the army stay awakened.
  s.keyItems = old.keyItems.filter((k: string) => k !== 'ledger');
  s.flags.relic_taken = true;
  s.flags.chamber_done = true;
  s.flags.has_echo = s.echoes.length > 0;
  if (s.keyItems.includes('eagle_wings')) s.flags.plume = true;
  if (s.keyItems.includes('ram_horn')) s.flags.horn = true;
  // The Shadow Mantle and your Trial record stay learned.
  for (const f of ['mantle_known', 'mantle_used', 'mantle_ready_seen', 'trial_best']) if (old.flags[f] !== undefined) s.flags[f] = old.flags[f];
  s.mantle = old.mantle;
  s.echoMode = old.echoMode;
  // Trophies, the daily record and lessons learned belong to the player, not the cycle;
  // the Rest is rebuilt, but titles and Ezra's one-time gift stay given.
  if (old.valor) s.valor = structuredClone(old.valor);
  if (old.daily) s.daily = { ...old.daily };
  if (old.coached) s.coached = { ...old.coached };
  if (old.settlement) s.settlement = { seen: -1, quests: {}, titles: [...old.settlement.titles], gift: old.settlement.gift };
  saveSlot(G.slot, s);
  G.ui.fade(1, 0.6).then(() => {
    enterGame(s, G.slot, 'sanctuary', 'start');
    G.ui.fade(0, 0.8);
    G.ui.banner(`NEW GAME+${s.ng > 1 ? ' ' + s.ng : ''}`, 'The Veil grows stronger. So do you.', 'chapter');
  });
}
