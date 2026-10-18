/** Pose-local timing keeps one-shot actions independent of the world clock. */
export function heroFrameAt(action: string, time: number, speed: number, grounded: boolean, vy: number, attackProgress: number, stateTime = 0, stride = time * 11) {
  if (action === 'charge' || action === 'block' || action === 'parry') return 10;
  if (action === 'attack' || action === 'execute') return attackProgress < 0.46 ? 10 : 11;
  if (action === 'plunge') return 11;
  if (action === 'airdash') return 13;
  if (action === 'dodge') return stateTime < 0.13 ? 12 : 13;
  if (action === 'hurt' || action === 'dead') return 14;
  if (action === 'cast' || action === 'heal' || action === 'transform') return 15;
  if (!grounded) return vy < 0 ? 8 : 9;
  if (Math.abs(speed) > 24) return 4 + (Math.floor(stride) % 4);
  return Math.floor(time * 3.8) % 4;
}
