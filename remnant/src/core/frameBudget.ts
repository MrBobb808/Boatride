/**
 * Auto quality from sustained load. Frame times go into a rolling window of about
 * 1.5 s and are judged four times a second. Overload needs a quarter of the window
 * slow (75th percentile) in two evaluations running, so lone spikes never count; it steps
 * one rung down. Recovery needs nine frames in ten fast (90th percentile) for a while; it
 * steps one rung back up. A rung that has to be dropped again soon after recovering doubles the
 * wait before the next try, so quality settles instead of oscillating.
 *
 * Rungs, cheapest losses first: 0 full · 1 fewer particles · 2 also coarser lighting and
 * no fine detail · 3 the medium tier (lower resolution) · 4 the low tier.
 */
export class FrameBudget {
  static readonly MAX = 4;
  /** Resolution tiers dropped at a rung (the renderer's autoPenalty). */
  static penalty(level: number) { return Math.max(0, level - 2); }
  /** Effects shed at a rung (the renderer's effects). */
  static effects(level: number) { return Math.min(2, level); }

  level = 0;
  private dts = new Float32Array(256);
  private works = new Float32Array(256);
  private sorted = new Float32Array(256);
  private n = 0;
  private head = 0;
  private sinceEval = 0;
  private over = 0;
  private calm = 0;
  private recoverAfter = 4;
  private sinceUp = 1e9;
  private lastUp = false;
  /** The display has shown it refreshes at 120 Hz: work is then judged against an 8.3 ms frame. */
  private hi = false;

  /** Forget the window (pauses, menus, cutscenes); the rung is kept. */
  reset() {
    this.n = this.head = 0;
    this.sinceEval = this.over = this.calm = 0;
  }

  /** capped: the 60 FPS setting holds frames to 16.7 ms whatever the display can do. */
  sample(dt: number, workMs: number, capped = false): number {
    this.dts[this.head] = dt;
    this.works[this.head] = workMs;
    this.head = (this.head + 1) & 255;
    if (this.n < 256) this.n++;
    this.sinceEval += dt;
    this.sinceUp += dt;
    if (this.sinceEval < 0.25) return this.level;
    this.sinceEval = 0;
    // The newest ~1.5 s of samples; decide only once there is at least ~0.75 s of them.
    let k = 0, span = 0;
    while (k < this.n && span < 1.5) span += this.dts[(this.head - 1 - k++) & 255];
    if (span < 0.75) return this.level;
    // A quarter of the frames under 11 ms means a ProMotion display running free.
    if (!capped && this.pct(this.dts, k, 0.25) < 1 / 90) this.hi = true;
    // Missing 60 is always overload. At 120 Hz, frame times only show the cap (Low Power Mode
    // holds the display at 60), so the work itself is judged against the shorter frame.
    const frame = this.hi && !capped ? 1000 / 120 : 1000 / 60;
    const overloaded = this.pct(this.dts, k, 0.75) > 1 / 55 || this.pct(this.works, k, 0.75) > frame * 0.84;
    const comfortable = this.pct(this.dts, k, 0.9) < 1 / 58 && this.pct(this.works, k, 0.9) < frame * 0.5;
    // A recovery that has held for half a minute clears the back-off.
    if (this.lastUp && this.sinceUp > 30) this.recoverAfter = 4;
    if (overloaded) {
      this.calm = 0;
      if (++this.over >= 2 && this.level < FrameBudget.MAX) {
        // Dropping right after a recovery: that rung was too ambitious, wait longer next time.
        if (this.lastUp && this.sinceUp < 10) this.recoverAfter = Math.min(64, this.recoverAfter * 2);
        this.lastUp = false;
        this.level++;
        this.reset();
      }
    } else {
      this.over = 0;
      this.calm = comfortable ? this.calm + 0.25 : 0;
      if (this.calm >= this.recoverAfter && this.level > 0) {
        this.level--;
        this.sinceUp = 0;
        this.lastUp = true;
        this.reset();
      }
    }
    return this.level;
  }

  /** Percentile q of the newest k samples, sorted in a preallocated buffer. */
  private pct(src: Float32Array, k: number, q: number) {
    const s = this.sorted;
    s.fill(Infinity);
    for (let i = 0; i < k; i++) s[i] = src[(this.head - 1 - i) & 255];
    s.sort();
    return s[Math.min(k - 1, Math.floor(k * q))];
  }
}
