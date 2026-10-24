// Stand-in for remnant/src/audio/music.ts until the score is ported: bosses set
// the phase and ask for tracks; the calls are remembered for the audio port.

export const TRACKS: Record<string, unknown> = {};
export const music = {
  phase: 0,
  current: '',
  play(name: string, _fade?: number) { this.current = name; },
  stop(_fade?: number) { this.current = ''; },
  bossPhase(n: number) { this.phase = n; },
  duck(_amt?: number, _t?: number) {},
};
