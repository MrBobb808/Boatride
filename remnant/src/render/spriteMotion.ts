// Four authored keyframes: ready, stride, anticipation and impact.
const anticipation = new Set(['draw', 'windup', 'crouch', 'tilt', 'write', 'hold', 'chant']);
const release = new Set(['release', 'loose', 'throw', 'pounce', 'dive', 'swoop', 'pour']);
const attacks = new Set(['attack', 'slash', 'smash', 'sweep', 'jab', 'shove', 'bash', 'slam', 'lunge', 'claw', 'bite', 'cast', 'floor', 'ward', 'blink', 'leap']);

export function spriteFrame(state: string, progress: number, speed: number, time: number, hitAt = 0.55): number {
  if (anticipation.has(state)) return 2;
  if (release.has(state)) return 3;
  if (attacks.has(state)) return progress < hitAt ? 2 : progress < 0.88 ? 3 : 0;
  if (state === 'hurt' || state === 'stagger' || state === 'death' || state === 'dead') return 0;
  if (Math.abs(speed) > 12 || state === 'hover' || state === 'rush') return Math.floor(time * 9) % 2;
  return 0;
}

export const isSpriteWindup = (state: string, frame: number) => frame === 2 && (anticipation.has(state) || attacks.has(state));
