// Stand-in for remnant/src/core/input.ts: the original modules (swimming, the
// Echoes) read the player's input through `input`; in the Phaser build it is
// the one Controls of the World scene (src/game/controls.ts), set by the classic layer.

type Reader = { down(a: string): boolean; pressed(a: string): boolean; released(a: string): boolean; axis: number; flush(): void; device: string };
export const inputHook: { controls: Reader | null } = { controls: null };

const has = (a: string) => ['left', 'right', 'up', 'down', 'jump', 'attack', 'heavy', 'dodge', 'parry', 'heal', 'skill1', 'skill2', 'skill3', 'interact', 'menu', 'echo', 'switch'].includes(a);

export const input = {
  get axisX() { return inputHook.controls?.axis ?? 0; },
  get axisY() { const c = inputHook.controls; return c ? (c.down('down') ? 1 : 0) - (c.down('up') ? 1 : 0) : 0; },
  get lastDevice() { return inputHook.controls?.device ?? 'keyboard'; },
  down: (a: string) => has(a) && !!inputHook.controls?.down(a),
  pressed: (a: string) => has(a) && !!inputHook.controls?.pressed(a),
  released: (a: string) => has(a) && !!inputHook.controls?.released(a),
  flush: () => inputHook.controls?.flush(),
  // Pad rumble comes with the haptics port.
  rumble(_strong: number, _weak: number, _ms: number, _force = false) {},
  label: (a: string) => a,
};
