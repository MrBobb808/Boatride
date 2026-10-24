// Stand-in for remnant/src/audio/audio.ts while the audio port is pending: the
// original modules call sfx() by name, and the calls are kept so the audio port
// only has to answer them.

type SfxOpts = { pan?: number; vol?: number; pitch?: number; gap?: number };
export const sfxHook: { play: ((name: string, o?: SfxOpts) => void) | null } = { play: null };

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const SFX: Record<string, unknown> = {};
export const audio = {
  ready: false,
  play(name: string, o?: SfxOpts) { sfxHook.play?.(name, o); },
};
export const sfx = (name: string, o?: SfxOpts) => audio.play(name, o);
