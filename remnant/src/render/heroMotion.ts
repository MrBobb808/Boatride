/** Pose-local timing keeps one-shot actions independent of the world clock. */
export function heroFrameAt(action: string, time: number, speed: number, grounded: boolean, vy: number, attackProgress: number, stateTime = 0, stride = time * 11, hitStart = 0.46) {
  // Swimming: a reaching stroke (arm overhead, turned head-first by the body angle) and kicking strides; upright while treading.
  if (action === 'swim') {
    const moving = Math.abs(speed) > 30 || Math.abs(vy) > 30;
    if (!moving) return Math.floor(time * 3.2) % 4;
    const k = Math.floor(time * (Math.abs(speed) + Math.abs(vy) > 160 ? 9 : 5.5)) % 4;
    return k === 0 ? 10 : 4 + k;
  }
  if (action === 'charge' || action === 'block' || action === 'parry') return 10;
  if (action === 'attack' || action === 'execute') return attackProgress < hitStart ? 10 : 11;
  if (action === 'plunge') return 11;
  if (action === 'airdash') return 13;
  if (action === 'dodge') return stateTime < 0.13 ? 12 : 13;
  if (action === 'hurt' || action === 'dead') return 14;
  if (action === 'cast' || action === 'heal' || action === 'transform') return 15;
  if (!grounded) return vy < 0 ? 8 : 9;
  if (Math.abs(speed) > 24) return 4 + (Math.floor(stride) % 4);
  return Math.floor(time * 3.8) % 4;
}

export interface AttackVisual { x: number; y: number; sx: number; sy: number }
/** Reuse the sample object: anticipation, contact and recovery share a planted foot. */
export function sampleAttackVisual(out: AttackVisual, progress: number, start: number, end: number, heavy: boolean, airborne: boolean) {
  const u = Math.max(0, Math.min(1, progress));
  const power = heavy ? 4 : 2.5;
  let contact = 0, x = 0;
  if (u < start) x = -Math.sin(Math.PI * u / Math.max(0.01, start)) * (heavy ? 1.8 : 1);
  else if (u <= end) {
    const t = (u - start) / Math.max(0.01, end - start);
    contact = Math.sin(Math.PI * t);
    x = power * (contact * 0.7 + t * 0.3);
  } else {
    const t = (u - end) / Math.max(0.01, 1 - end);
    x = power * 0.3 * (1 - t) ** 2;
  }
  out.x = x; out.y = airborne ? -contact * 1.5 : 0;
  out.sx = 1 + contact * (heavy ? 0.05 : 0.03);
  out.sy = 1 - contact * (heavy ? 0.035 : 0.02);
}
