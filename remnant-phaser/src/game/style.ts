// Variety earns style; repetition, idling and taking damage lose momentum.
export type CombatStyle = 'vanguard' | 'wraith' | 'sentinel';
export type PlayableHero = 'elior' | 'tirzah';
export const STYLE_NAMES = { vanguard: 'Vanguard', wraith: 'Wraith', sentinel: 'Sentinel' } as const;
export const STYLE_HELP = { vanguard: 'Jump-cancel a confirmed hit to extend an aerial combo.', wraith: 'Quicker evasive slides with the same travel and cooldown.', sentinel: 'Stronger guard and a longer perfect-parry riposte window.' };
export const RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;
const THRESHOLDS = [0, 15, 40, 75, 120, 180, 250];
export class StyleMeter {
  score = 0;
  private quiet = 0;
  private recent: string[] = [];
  get rank() { let n = 0; while (n < 6 && this.score >= THRESHOLDS[n + 1]) n++; return n; }
  hit(move: string, air = false) {
    let repeats = 0;
    for (const old of this.recent) if (old === move) repeats++;
    this.score = Math.min(310, this.score + (air ? 16 : 12) / (1 + repeats * 2));
    this.recent.push(move); if (this.recent.length > 6) this.recent.shift();
    this.quiet = 0;
  }
  update(dt: number) { this.quiet += dt; if (this.quiet > 2) this.score = Math.max(0, this.score - dt * 14); if (!this.score) this.recent.length = 0; }
  hurt() { this.score *= 0.5; this.quiet = 0; }
}
