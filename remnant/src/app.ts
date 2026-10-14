// Application lifecycle: title → intro → game, loading saves, New Game+.

import { G } from './game/ctx';
import { newGame, derive, type SaveData } from './game/state';
import { saveSlot, loadSlot, requestPersistence } from './game/save';
import { music } from './audio/music';
import { input } from './core/input';

export type Mode = 'boot' | 'title' | 'intro' | 'game';

type Hooks = { showTitle: () => void; hideTitle: () => void; startIntro: (done: () => void) => void };
let hooks: Hooks;

export const app = {
  mode: 'boot' as Mode,
};

export function setAppHooks(h: Hooks) {
  hooks = h;
}

function enterGame(s: SaveData, slot: number, room: string, spawn: string) {
  G.save = s;
  G.slot = slot;
  G.d = derive(s);
  G.inCutscene = false;
  G.paused = false;
  s.hp = Math.min(s.hp, G.d.maxHp);
  G.world.player.revive();
  G.world.player.styleKey = '';
  G.world.load(room, spawn);
  app.mode = 'game';
  hooks.hideTitle();
  input.flush();
  requestPersistence();
}

export function startNewGame(slot: number, skipIntro = false) {
  const s = newGame();
  saveSlot(slot, s);
  const go = () => {
    enterGame(s, slot, 'sanctuary', 'start');
  };
  if (skipIntro) go();
  else {
    hooks.hideTitle();
    app.mode = 'intro';
    hooks.startIntro(go);
  }
}

export function loadGameSlot(slot: number) {
  const s = loadSlot(slot);
  if (!s) return false;
  // Resume where the player last stood; fall back to the last altar.
  enterGame(s, slot, s.room || s.altar.room, s.spawn || s.altar.spawn);
  return true;
}

export function returnToTitle() {
  app.mode = 'title';
  G.inCutscene = false;
  G.paused = false;
  G.ui.bossBar(null);
  G.ui.prompt(null);
  G.ui.hint(null);
  G.ui.caption(null);
  G.ui.cinematicBars(false);
  music.play('title');
  hooks.showTitle();
}

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
  s.keyItems = old.keyItems.filter((k) => k !== 'ledger');
  s.flags.relic_taken = true;
  s.flags.chamber_done = true;
  s.flags.has_echo = s.echoes.length > 0;
  if (s.keyItems.includes('eagle_wings')) s.flags.plume = true;
  if (s.keyItems.includes('ram_horn')) s.flags.horn = true;
  s.echoMode = old.echoMode;
  saveSlot(G.slot, s);
  G.ui.fade(1, 0.6).then(() => {
    enterGame(s, G.slot, 'sanctuary', 'start');
    G.ui.fade(0, 0.8);
    G.ui.banner(`NEW GAME+${s.ng > 1 ? ' ' + s.ng : ''}`, 'The Veil grows stronger. So do you.', 'chapter');
  });
}
