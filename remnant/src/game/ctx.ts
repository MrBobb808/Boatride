// Shared game context, so systems can reach each other without long parameter lists.

import type { SaveData, Derived } from './state';
import type { Renderer, Camera } from '../render/renderer';
import type { World } from './world';
import type { ItemInst } from './data';

export interface UIHooks {
  toast(text: string, kind?: 'info' | 'good' | 'warn' | 'loot', color?: string): void;
  banner(title: string, sub?: string, kind?: 'area' | 'boss' | 'level' | 'chapter' | 'echo' | 'ability'): void;
  /** Take down a showing place-name banner (it belongs to the room just left). */
  clearAreaBanner(): void;
  dialogue(lines: DialogueLine[]): Promise<number>;
  itemGet(it: ItemInst): void;
  levelUp(levels: number): void;
  hint(text: string | null): void;
  prompt(text: string | null): void;
  lore(id: string): Promise<void>;
  cinematicBars(on: boolean): void;
  fade(to: number, dur: number): Promise<void>;
  openMenu(tab?: string): void;
  openShop(kind: 'merchant' | 'smith'): void;
  openAltar(id: string): void;
  echoWheel(open: boolean): void;
  voiceOrders(): void;
  showCredits(after?: () => void): void;
  chapterEnd(chapter?: number): Promise<'next' | 'stay'>;
  bossBar(name: string | null, sub?: string): void;
  caption(text: string | null, ref?: string): void;
  refreshHud(): void;
  isBlocking(): boolean;
  choice(title: string, body: string, options: { label: string; sub?: string; icon?: string; risk?: boolean }[], kind?: 'blessing', signal?: AbortSignal): Promise<number>;
  death(): Promise<void>;
}

export interface DialogueLine {
  who: string;
  text: string;
  choices?: { label: string; tone?: string }[];
  portrait?: string;
  mood?: string;
}

export const G = {
  save: null as unknown as SaveData,
  d: null as unknown as Derived,
  world: null as unknown as World,
  renderer: null as unknown as Renderer,
  camera: null as unknown as Camera,
  ui: null as unknown as UIHooks,
  /** Total game time (seconds, excludes pauses). */
  time: 0,
  slot: 0,
  debug: false,
  paused: false,
  inCutscene: false,
};

export function flag(name: string): boolean {
  if (!name) return true;
  if (name.startsWith('!')) return !G.save.flags[name.slice(1)];
  return !!G.save.flags[name];
}
export function setFlag(name: string, v: number | string | boolean = true) {
  G.save.flags[name] = v;
}

/**
 * A place-name banner for `room`, after `delay` ms, only if Elior is still in it and no boss
 * has woken there: doors are instant, so a late name would otherwise land in the next room.
 */
export function placeBanner(room: World['room'], title: string, sub: string, delay = 400) {
  setTimeout(() => {
    const W = G.world;
    if (W.room === room && (!W.boss || W.boss.state === 'dormant')) G.ui.banner(title, sub, 'area');
  }, delay);
}
