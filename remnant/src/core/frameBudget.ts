/** Hysteresis around a 60 FPS budget, including recovery while capped at 60. */
export class FrameBudget {
  private slow = 0;
  private fast = 0;
  reset() { this.slow = this.fast = 0; }
  sample(dt: number, workMs: number, penalty: number): number {
    const overloaded = dt > 1 / 55 || workMs > 14;
    this.slow = overloaded ? this.slow + 1 : Math.max(0, this.slow - 0.5);
    this.fast = !overloaded && workMs < 8 ? this.fast + 1 : 0;
    if (this.slow >= 90 && penalty < 2) { this.reset(); return penalty + 1; }
    if (this.fast >= 600 && penalty > 0) { this.reset(); return penalty - 1; }
    return penalty;
  }
}
