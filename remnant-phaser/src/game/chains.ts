// The Sundered Chains (the owner's ask of 10 November 2026): twin short blades on the chains the Remnant's captives
// were held in, kindled, and Elior's second weapon beside his sword. Long burning arcs that take every foe in reach, a
// whirl of both blades, and a hook: a blade thrown into a far foe that drags a light one to his feet, or carries him
// to a heavy one and into a strike. "He brought them out of darkness and the shadow of death, and brake their bands
// in sunder." — Psalm 107:14 (KJV)
//
// The moves are data in the shared AttackDef shape, so they run through the player's own swing, hit and cancel code
// (player.ts); this file holds them, the rules for what the Chain button does, and the chains themselves, drawn live:
// pooled link sprites along a whipping curve from his hand to the blade, and fire after it. Nothing here allocates
// per frame. Phaser build only.
import Phaser from 'phaser';
import type { AttackDef } from '../../../remnant/src/game/weapons';
import type { Clip } from '../../../remnant/src/render/skeleton';
import { easeOutCubic, easeInQuad, easeInOutSine, easeOutBack } from '../../../remnant/src/core/math';
import type { PhaserSave } from './save';
import { settings } from '../classic/shim/settings';

/** Won at the end of Chapter I (World grants it); kept as a flag, so saves need no new field. */
export const hasChains = (s: PhaserSave) => !!s.flags.sundered_chains;

/** How far the hook reaches, and the nearest it is worth throwing (inside that, the lash already reaches). */
export const HOOK_RANGE = 300, HOOK_MIN = 96, HOOK_CD = 1.1;
/** The blade's flight, and Elior's when the chain carries him (px/s). */
export const HOOK_SPEED = 1150, PULL_SPEED = 820;

const m = (o: Partial<AttackDef> & Pick<AttackDef, 'id' | 'clip' | 'dur' | 'dmg' | 'poise' | 'box'>): AttackDef => ({
  hit: [0.3, 0.58], kx: 60, ky: -40, cancel: 0.62, stop: 0.03, shake: 0.1, sfx: 'chainLash', ...o,
});
const ARRIVE = m({ id: 'charrive', clip: 'charrive', dur: 0.36, hit: [0.08, 0.5], box: { x: -10, y: -56, w: 66, h: 60 }, dmg: 1.35, poise: 34, kx: 150, ky: -260, launch: true, cancel: 0.6, stop: 0.08, shake: 0.3, sfx: 'swingHeavy', finisher: true });
/** The chain moves. Their reach is the box's own width (the sword's family does not stretch them). */
export const CHAINS = {
  // Lash: three long arcs. Lighter per foe than the sword, but they take the whole rank.
  lash: [
    m({ id: 'ch1', clip: 'ch1', dur: 0.4, box: { x: -6, y: -52, w: 116, h: 52 }, dmg: 0.7, poise: 9, lunge: 30, lungeT: [0.2, 0.42] }),
    m({ id: 'ch2', clip: 'ch2', dur: 0.4, hit: [0.28, 0.58], box: { x: -44, y: -88, w: 158, h: 88 }, dmg: 0.75, poise: 9, ky: -130, lunge: 30, lungeT: [0.2, 0.42] }),
    m({ id: 'ch3', clip: 'ch3', dur: 0.62, hit: [0.42, 0.64], box: { x: 0, y: -70, w: 132, h: 72 }, dmg: 1.5, poise: 38, kx: 210, ky: -230, cancel: 0.8, stop: 0.09, shake: 0.36, sfx: 'chainSlam', finisher: true, guardBreak: true }),
  ] as AttackDef[],
  // Cyclone: both blades round him, drawing the rank in. From the lash's third blow, or out of the sword's third.
  cyclone: m({ id: 'chcyc', clip: 'chcyc', dur: 0.92, hit: [0.12, 0.9], box: { x: -96, y: -62, w: 192, h: 64 }, dmg: 0.5, poise: 10, multi: 6, pull: 130, spin: 2, kx: 30, ky: -60, cancel: 0.92, stop: 0.025, shake: 0.14, sfx: 'chainWhirl', finisher: true }),
  // In the air: a wheel of fire round him that holds him up while it lands.
  air: m({ id: 'chair', clip: 'chair', dur: 0.5, hit: [0.14, 0.82], box: { x: -86, y: -100, w: 172, h: 132 }, dmg: 0.6, poise: 10, multi: 3, kx: 40, ky: -150, cancel: 0.84, air: true, hang: -170, stop: 0.03, shake: 0.12, sfx: 'chainWhirl' }),
  // The strike the hook carries him into (in the air it keeps an air combo open).
  arrive: ARRIVE,
  arriveAir: { ...ARRIVE, air: true } as AttackDef,
} as const;
const IDS = new Set<string>([...CHAINS.lash.map((a) => a.id), CHAINS.cyclone.id, CHAINS.air.id, CHAINS.arrive.id]);
export const isChainMove = (id: string) => IDS.has(id);
/** Every chain blow sets its foe burning for this long, at this share of his attack a second. */
export const CHAIN_BURN = { secs: 3, share: 0.22 };
/** Kindled (after Chapter XIII, where the fetters of Tyrus were broken): the fire bites deeper and the hook flies further. */
export const isKindled = (s: PhaserSave) => !!s.flags.chains_kindled;
const KINDLED_BURN = { secs: 4.5, share: 0.36 };
export const chainBurn = (s: PhaserSave) => (isKindled(s) ? KINDLED_BURN : CHAIN_BURN);
export const hookRange = (s: PhaserSave) => HOOK_RANGE + (isKindled(s) ? 60 : 0);
/** The hook's own bite, as a share of a blow. */
export const HOOK_DMG = 0.6;

// ---------------------------------------------------------------- his body (clips baked into the action atlas)

const k = (t: number, p: Record<string, number>, ease?: (x: number) => number) => ({ t, p, ease });
/** Hands free of the sword: the arms throw and haul. Baked unarmed (actionArt.ts); the blades are drawn live. */
export const CHAIN_CLIPS: Record<string, Clip> = {
  // A long forehand cast: wound back, then the whole arm out and through.
  ch1: { dur: 1, keys: [
    k(0, { fUA: -0.9, fFA: 1.4, bUA: 0.9, bFA: 1.2, lean: -0.14, fTh: 0.3, bTh: -0.3 }),
    k(0.24, { fUA: -1.3, fFA: 1.6, lean: -0.2, sq: 0.96 }, easeOutCubic),
    k(0.42, { fUA: 1.7, fFA: 0.05, bUA: -0.7, bFA: 0.9, lean: 0.36, fTh: 0.7, fSh: -0.5, bTh: -0.6, x: 3, sq: 1.03 }, easeInQuad),
    k(0.7, { fUA: 1.1, fFA: 0.2, bUA: -0.5, lean: 0.3, fTh: 0.65, bTh: -0.55, x: 3 }),
    k(1, {}, easeInOutSine),
  ] },
  // The backhand: the other arm comes up and over.
  ch2: { dur: 1, keys: [
    k(0, { bUA: 0.2, bFA: 1.2, fUA: 0.9, fFA: 0.9, lean: 0.2, fTh: 0.6, bTh: -0.4 }),
    k(0.22, { bUA: -0.2, bFA: 1.5, lean: 0.26, sq: 0.96 }, easeOutCubic),
    k(0.42, { bUA: 2.9, bFA: 0.1, fUA: -0.4, fFA: 1.0, lean: -0.12, fTh: 0.4, bTh: -0.5, sq: 1.04 }, easeInQuad),
    k(0.7, { bUA: 2.5, bFA: 0.3, fUA: -0.2, lean: -0.06 }),
    k(1, {}, easeInOutSine),
  ] },
  // Both blades hauled overhead and brought down together.
  ch3: { dur: 1, keys: [
    k(0, { fUA: 0.6, fFA: 1.2, bUA: 0.7, bFA: 1.3, lean: 0.0, fTh: 0.4, fSh: -0.6, bTh: -0.3, bSh: -0.5, sq: 0.94 }),
    k(0.3, { fUA: 3.0, fFA: 0.4, bUA: 2.9, bFA: 0.5, lean: -0.3, fTh: 0.2, bTh: -0.2, y: -3, sq: 1.08 }, easeOutCubic),
    k(0.44, { fUA: 3.05, fFA: 0.3, bUA: 2.95, bFA: 0.4, lean: -0.34, y: -4, sq: 1.1 }),
    k(0.54, { fUA: 0.5, fFA: 0.0, bUA: 0.6, bFA: 0.1, lean: 0.56, fTh: 1.05, fSh: -1.2, bTh: -0.7, bSh: -0.3, x: 4, sq: 0.92 }, easeInQuad),
    k(0.8, { fUA: 0.55, fFA: 0.1, bUA: 0.65, bFA: 0.2, lean: 0.5, fTh: 1.0, fSh: -1.1, bTh: -0.65, x: 4, sq: 0.95 }),
    k(1, {}, easeInOutSine),
  ] },
  // Arms out, turning: the sprite spins (the move's `spin`), the arms hold the circle open.
  chcyc: { dur: 1, fn: (u) => ({ fUA: 1.55 + Math.sin(u * 25) * 0.08, fFA: 0.05, bUA: -1.5 + Math.sin(u * 25 + 2) * 0.08, bFA: 0.05, lean: 0.06, fTh: 0.5, fSh: -0.6, bTh: -0.5, bSh: -0.4, y: Math.sin(u * Math.PI) * -1.5 }) },
  // Tucked in the air, arms wheeling.
  chair: { dur: 1, fn: (u) => {
    const a = u * Math.PI * 2;
    return { fUA: 1.6 + Math.sin(a) * 1.4, fFA: 0.1, bUA: 1.6 + Math.sin(a + Math.PI) * 1.4, bFA: 0.1, lean: 0.1, fTh: 1.0, fSh: -1.5, bTh: 0.5, bSh: -1.3 };
  } },
  // The throw: a straight cast from the hip, held taut.
  chhook: { dur: 1, keys: [
    k(0, { fUA: -0.7, fFA: 1.5, bUA: 0.8, bFA: 1.2, lean: -0.12, fTh: 0.35, bTh: -0.3 }),
    k(0.35, { fUA: 1.62, fFA: 0.0, bUA: -0.8, bFA: 1.0, lean: 0.32, fTh: 0.75, fSh: -0.5, bTh: -0.6, x: 2, sq: 1.03 }, easeOutBack),
    k(1, { fUA: 1.58, fFA: 0.05, bUA: -0.6, bFA: 1.1, lean: 0.26, fTh: 0.7, fSh: -0.5, bTh: -0.55, x: 2 }),
  ] },
  // Hauling in: both hands on the chain, leaning back against the weight.
  chhaul: { dur: 1, keys: [
    k(0, { fUA: 1.5, fFA: 0.1, bUA: 1.2, bFA: 0.4, lean: 0.2, fTh: 0.7, bTh: -0.5 }),
    k(0.5, { fUA: 0.7, fFA: 1.3, bUA: 0.5, bFA: 1.5, lean: -0.22, fTh: 0.5, fSh: -0.7, bTh: -0.3, bSh: -0.6, sq: 0.96 }, easeOutCubic),
    k(1, { fUA: 0.5, fFA: 1.5, bUA: 0.3, bFA: 1.6, lean: -0.26, fTh: 0.5, fSh: -0.7, bTh: -0.3, bSh: -0.6 }),
  ] },
  // Carried by the chain: laid out along it, the blade arm leading.
  chfly: { dur: 1, fn: () => ({ fUA: 1.7, fFA: 0.0, bUA: -1.2, bFA: 0.3, lean: 0.7, fTh: -0.2, fSh: -0.3, bTh: -0.7, bSh: -0.9 }) },
  // Arriving: the free blade driven in and up.
  charrive: { dur: 1, keys: [
    k(0, { fUA: 1.6, fFA: 0.0, bUA: -1.3, bFA: 0.4, lean: 0.6, fTh: 0.2, bTh: -0.8 }),
    k(0.2, { fUA: 0.4, fFA: 0.6, bUA: 0.2, bFA: 0.2, lean: 0.4, fTh: 0.9, fSh: -1.2, bTh: -0.4, sq: 0.93 }, easeOutCubic),
    k(0.4, { fUA: 0.2, fFA: 0.9, bUA: 2.8, bFA: 0.2, lean: -0.1, fTh: 0.4, fSh: -0.4, bTh: -0.3, y: -2, sq: 1.08 }, easeOutBack),
    k(1, {}, easeInOutSine),
  ] },
};
export const CHAIN_CLIP_NAMES = Object.keys(CHAIN_CLIPS);

// ---------------------------------------------------------------- the chains, drawn live

const LINKS = 34, TRAIL = 14;
/** One chain: its links, its blade, and the fire that follows the blade. */
class Strand {
  links: Phaser.GameObjects.Image[] = [];
  blade: Phaser.GameObjects.Image;
  flames: Phaser.GameObjects.Image[] = [];
  /** The blade's last positions (a ring), newest at `head`. */
  tx = new Float32Array(TRAIL);
  ty = new Float32Array(TRAIL);
  head = 0;
  filled = 0;
  px = 0;
  py = 0;
  live = false;
  constructor(sc: Phaser.Scene, depth: number) {
    for (let i = 0; i < TRAIL; i++) this.flames.push(sc.add.image(0, 0, 'chain-flame').setDepth(depth - 0.2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    for (let i = 0; i < LINKS; i++) this.links.push(sc.add.image(0, 0, 'chain-link').setDepth(depth).setVisible(false));
    this.blade = sc.add.image(0, 0, 'chain-blade').setDepth(depth + 0.1).setOrigin(0.2, 0.5).setVisible(false);
  }
  hide() {
    if (!this.live) return;
    this.live = false; this.filled = 0;
    for (const l of this.links) l.setVisible(false);
    for (const f of this.flames) f.setVisible(false);
    this.blade.setVisible(false);
  }
  /** Hand (hx, hy) to blade (x, y); `slack` 0 pulls it taut (the hook), 1 lets it whip and sag. */
  place(hx: number, hy: number, x: number, y: number, slack: number, heat: number) {
    if (!this.live) { this.live = true; this.px = x; this.py = y; }
    // The middle of the chain trails the blade's motion and sags a little: a whip, not a rod.
    const vx = x - this.px, vy = y - this.py, sp = Math.hypot(vx, vy);
    const lag = Math.min(34, sp * 1.6) * slack, len = Math.hypot(x - hx, y - hy);
    const cx = (hx + x) / 2 - (sp > 0.01 ? (vx / sp) * lag : 0), cy = (hy + y) / 2 - (sp > 0.01 ? (vy / sp) * lag : 0) + Math.min(12, len * 0.08) * slack;
    const n = Math.min(LINKS, Math.max(3, Math.ceil(len / 5.2)));
    for (let i = 0; i < LINKS; i++) {
      const l = this.links[i];
      if (i >= n) { l.setVisible(false); continue; }
      const u = (i + 0.5) / n, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      const lx = a * hx + b * cx + c * x, ly = a * hy + b * cy + c * y;
      // The tangent of the curve turns each link along it; every other link shows its narrow side.
      const dx = 2 * (1 - u) * (cx - hx) + 2 * u * (x - cx), dy = 2 * (1 - u) * (cy - hy) + 2 * u * (y - cy);
      l.setVisible(true).setPosition(lx, ly).setRotation(Math.atan2(dy, dx)).setScale(i % 2 ? 0.7 : 1, i % 2 ? 1 : 0.8).setTint(heat > 0.5 && u > 0.55 ? 0xffd9a0 : 0xffffff);
    }
    this.blade.setVisible(true).setPosition(x, y).setRotation(Math.atan2(y - cy, x - cx));
    // The fire: the blade's recent path, widest and brightest at the blade.
    this.head = (this.head + 1) % TRAIL; this.tx[this.head] = x; this.ty[this.head] = y;
    this.filled = Math.min(TRAIL, this.filled + 1);
    const show = !settings.reduceFlashes;
    for (let i = 0; i < TRAIL; i++) {
      const f = this.flames[i];
      if (i >= this.filled || !show) { f.setVisible(false); continue; }
      const j = (this.head - i + TRAIL) % TRAIL, age = i / TRAIL;
      f.setVisible(true).setPosition(this.tx[j], this.ty[j]).setScale((2.7 - age * 2.0) * (0.6 + heat * 0.6)).setAlpha((1 - age) * (1 - age) * 0.9).setRotation(i * 0.9);
    }
    this.px = x; this.py = y;
  }
  destroy() { for (const o of [...this.links, ...this.flames, this.blade]) o.destroy(); }
}

/** Where a move's blade is at `u` (0–1 of the swing), in his own space: x forward, y down from his feet. */
function sweepTip(id: string, u: number, second: boolean, out: { x: number; y: number; on: boolean }) {
  out.on = false;
  // The chain runs out, sweeps, and comes home: an envelope on the reach.
  const env = (a: number, b: number) => { const q = (u - a) / (b - a); return q <= 0 || q >= 1 ? 0 : Math.pow(Math.sin(Math.PI * q), 0.55); };
  let a = 0, r = 0, squash = 1, cy = -30, e = 0;
  switch (id) {
    case 'ch1': if (second) return; e = env(0.16, 0.86); a = -2.5 + 3.1 * Phaser.Math.Clamp((u - 0.18) / 0.5, 0, 1); r = 112; squash = 0.42; break;
    case 'ch2': if (second) return; e = env(0.14, 0.86); a = 0.7 - 4.0 * Phaser.Math.Clamp((u - 0.16) / 0.5, 0, 1); r = 116; squash = 0.78; cy = -34; break;
    case 'ch3': e = env(0.2, 0.92); a = -2.9 + 3.3 * Phaser.Math.Clamp((u - (second ? 0.3 : 0.26)) / 0.3, 0, 1); r = second ? 112 : 128; squash = 0.95; cy = -34; break;
    case 'chcyc': e = env(0.04, 0.98); a = u * Math.PI * 4.5 + (second ? Math.PI : 0); r = 98; squash = 0.26; cy = -32; break;
    case 'chair': e = env(0.05, 0.95); a = u * Math.PI * 3.2 + (second ? Math.PI : 0); r = 88; squash = 1; cy = -28; break;
    default: return;
  }
  if (e <= 0) return;
  out.on = true;
  out.x = Math.cos(a) * r * e;
  out.y = cy + Math.sin(a) * r * e * squash;
}

export class ChainFx {
  private a: Strand;
  private b: Strand;
  private embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private tip = { x: 0, y: 0, on: false };
  private emberT = 0;
  /** Where the leading blade is now (the world reads it for sparks and light). */
  tipX = 0;
  tipY = 0;
  constructor(sc: Phaser.Scene, depth = 10.5) {
    makeTextures(sc);
    this.a = new Strand(sc, depth); this.b = new Strand(sc, depth);
    this.embers = sc.add.particles(0, 0, 'chain-ember', { emitting: false, lifespan: { min: 220, max: 520 }, speed: { min: 20, max: 90 }, angle: { min: 200, max: 340 },
      gravityY: -60, scale: { start: 1.2, end: 0.2 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD' }).setDepth(depth + 0.2);
  }
  private ember(x: number, y: number, dt: number, rate: number) {
    this.emberT -= dt;
    if (this.emberT > 0 || settings.reduceFlashes || settings.quality === 'low') return;
    this.emberT = 1 / rate;
    this.embers.emitParticleAt(x, y, 1);
  }
  /** A swing in progress. `x`/`feet` his body, `face` ±1. */
  sweep(id: string, u: number, x: number, feet: number, face: number, dt: number) {
    const hx = x + face * 7, hy = feet - 31, t = this.tip;
    sweepTip(id, u, false, t);
    if (t.on) { this.tipX = x + face * t.x; this.tipY = feet + t.y; this.a.place(hx, hy, this.tipX, this.tipY, 1, 1); this.ember(this.tipX, this.tipY, dt, 70); } else this.a.hide();
    sweepTip(id, u, true, t);
    if (t.on) { const bx = x + face * t.x, by = feet + t.y; this.b.place(x - face * 5, hy, bx, by, 1, 1); this.ember(bx, by, dt, 70); } else this.b.hide();
  }
  /** The hook: one chain straight from his hand to (x1, y1). */
  line(x: number, feet: number, face: number, x1: number, y1: number, dt: number) {
    this.tipX = x1; this.tipY = y1;
    this.a.place(x + face * 9, feet - 31, x1, y1, 0.15, 0.6);
    this.b.hide();
    this.ember(x1, y1, dt, 40);
  }
  hide() { this.a.hide(); this.b.hide(); }
  destroy() { this.a.destroy(); this.b.destroy(); this.embers.destroy(); }
}

/** The link, the blade, the flame and the ember, painted once, pixel by pixel (no art drop needed). */
function makeTextures(sc: Phaser.Scene) {
  if (sc.textures.exists('chain-link')) return;
  const paint = (key: string, rows: string[], pal: Record<string, string>) => {
    const tex = sc.textures.createCanvas(key, rows[0].length, rows.length)!, c = tex.getContext();
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); } }));
    tex.refresh();
  };
  const iron = { o: '#1c120e', d: '#5a4030', m: '#a8825a', h: '#ffc56b', w: '#fff3cf', s: '#d9d2c3', e: '#8f8a80', r: '#ff7a2a', y: '#ffd27a' };
  paint('chain-link', [
    '.oooo.',
    'odmmho',
    'om..mo',
    'odmmho',
    '.oooo.',
  ], iron);
  // A short hooked blade, hot along its edge, its ring toward the chain.
  paint('chain-blade', [
    '....oooooooo......',
    '.oooesssssssooo...',
    'odmosssssssssssoo.',
    'om.oyyyyrrrrryyywo',
    'odmoyrrrrrrryyyo..',
    '.ooooooooooooo....',
  ], iron);
  paint('chain-flame', [
    '...rr...',
    '..ryyr..',
    '.ryywyr.',
    'ryywwyyr',
    'ryywwyyr',
    '.ryywyr.',
    '..ryyr..',
    '...rr...',
  ], { r: 'rgba(255,90,20,0.55)', y: 'rgba(255,170,60,0.8)', w: 'rgba(255,236,180,0.95)' });
  paint('chain-ember', ['yw', 'ry'], { r: '#ff5a14', y: '#ffb347', w: '#fff3cf' });
}
