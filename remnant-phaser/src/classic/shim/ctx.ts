// Stand-in for remnant/src/game/ctx.ts. The original modules reach the game
// through `G`; in the Phaser build the classic layer (../layer.ts) fills it with
// adapters over the Phaser scene: the world, the camera, the HUD and the save.

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface UIHooks { [k: string]: any }
export interface DialogueLine { who: string; text: string; choices?: { label: string; tone?: string }[]; portrait?: string; mood?: string }

export const G = {
  save: null as any,
  d: null as any,
  world: null as any,
  renderer: { tier: 2, pixel: true, effects: 0 } as any,
  camera: null as any,
  ui: null as any,
  /** Game time in seconds, advanced by the classic layer. */
  time: 0,
  slot: 0,
  debug: false,
  paused: false,
  inCutscene: false,
};

export function flag(name: string): boolean {
  if (!name) return true;
  if (name.startsWith('!')) return !G.save?.flags[name.slice(1)];
  return !!G.save?.flags[name];
}
export function setFlag(name: string, v: number | string | boolean = true) {
  G.save.flags[name] = v;
}
export function placeBanner(_room: unknown, title: string, sub: string, delay = 400) {
  setTimeout(() => G.ui?.banner(title, sub, 'area'), delay);
}
