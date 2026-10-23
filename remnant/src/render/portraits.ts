// Dialogue portraits: code-drawn busts of the cast with a few cheap expressions
// (brows, eyes and mouth), breathing, blinking and a moving mouth while a line
// types. The painted Fallen Crowns are cropped from their sprite atlases. In
// the pixel art style a bust is drawn at 38 px and scaled up hard-edged, so it
// matches the world; in the smooth style it is drawn at full size.

import { settings } from '../core/settings';
import { shade, mix, rgba, type Ctx } from './draw';
import type { HumanStyle } from './actors';
import { drawFallenPortrait } from './fallenArt';
import { NPC_DEFS } from '../game/props';
import { G } from '../game/ctx';

export type Mood = 'neutral' | 'stern' | 'worried' | 'surprised' | 'smile' | 'menace';

/** The painted bosses speak under their own names. */
const ATLAS: Record<string, 0 | 1 | 2> = { Varkhos: 0, Morvane: 1, Azkar: 2 };

/** Speakers with no NPC body of their own. */
const EXTRA: Record<string, HumanStyle> = {
  'The Prince of Grecia': {
    skin: '#9a8068', hair: '#2a1c14', hairKind: 'short', beard: '#2a1c14', coat: '#1e3a5a', coatDark: '#10223a', skirt: 14, trim: '#d8c08a',
    pants: '#10223a', boots: '#1a1008', glove: '#2a1a10', belt: '#d8c08a', plate: { c: '#a8823e', dark: '#6a4e1e', hi: '#f2d68e', tier: 2 },
    helm: 'visor', helmColor: '#a8823e', helmTrim: '#f2d68e', eye: '#e8f2ff', eyeGlow: 1, iris: '#9ac8ff', outline: '#060408',
    weapon: 'none', offhand: 'none', bulk: 1.2, crest: '#c83a2a',
  },
};

/** Who glowers by default. */
const VILLAINS = new Set(['regent', 'satrap', 'feastlord', 'marshal', 'storm_prince', 'persia_prince', 'The Prince of Grecia', 'Varkhos', 'Morvane', 'Azkar']);

function styleOf(who: string): HumanStyle | null {
  if (who === 'elior') return G.world?.player?.style ?? NPC_DEFS.tobiah.style;
  if (who in NPC_DEFS) return NPC_DEFS[who as keyof typeof NPC_DEFS].style;
  return EXTRA[who] ?? null;
}

export function hasPortrait(who: string) {
  return who in ATLAS || styleOf(who) !== null;
}

/** An expression for a line: its own mood if the script gave one, else a guess from the words. */
export function moodOf(who: string, text: string, mood?: string): Mood {
  if (mood === 'neutral' || mood === 'stern' || mood === 'worried' || mood === 'surprised' || mood === 'smile' || mood === 'menace') return mood;
  if (VILLAINS.has(who)) return 'menace';
  if (text.trim() === '...' || text.startsWith('...')) return 'worried';
  if (text.includes('!')) return 'surprised';
  if (/\b(good|thank|glad|well done|welcome|home)\b/i.test(text)) return 'smile';
  if (who === 'azriel') return 'stern';
  return 'neutral';
}

interface Pal {
  key: string;
  skin: string; skinDark: string; skinHi: string;
  hair: string; hairDark: string;
  coat: string; coatDark: string; trim: string;
  brow: string; lip: string; bg: string; bgEdge: string;
  helm: string; helmDark: string; helmDeep: string; helmHi: string;
}
const EYE_X = [-2.9, 2.7];
const pals = new Map<string, Pal>();
/** Colours derived once per style, so a redraw allocates no strings. */
function palette(s: HumanStyle, who: string): Pal {
  const key = who + s.skin + s.coat + (s.hair ?? '') + (s.helmColor ?? '');
  let p = pals.get(key);
  if (p) return p;
  const hair = s.hair ?? s.beard ?? shade(s.skin, -0.45);
  const tint = s.eyeGlow > 0 ? s.iris ?? s.eye : s.trim ?? s.coat;
  p = {
    key, skin: s.skin, skinDark: shade(s.skin, -0.22), skinHi: shade(s.skin, 0.12),
    hair, hairDark: shade(hair, -0.3), coat: s.coat, coatDark: s.coatDark, trim: s.trim ?? shade(s.coat, 0.25),
    brow: shade(s.beard ?? hair, -0.2), lip: mix(s.skin, '#7a2a2a', 0.35),
    bg: rgba(mix(tint, '#20161a', 0.55), 1), bgEdge: rgba(mix(tint, '#08060a', 0.85), 1),
    helm: s.helmColor ?? '#6a6a72', helmDark: shade(s.helmColor ?? '#6a6a72', -0.25), helmDeep: shade(s.helmColor ?? '#6a6a72', -0.35), helmHi: shade(s.helmColor ?? '#6a6a72', 0.3),
  };
  pals.set(key, p);
  return p;
}

let buf: HTMLCanvasElement | null = null;
let bctx: CanvasRenderingContext2D | null = null;
function buffer(n: number) {
  if (!buf) {
    buf = document.createElement('canvas');
    bctx = buf.getContext('2d')!;
  }
  if (buf.width !== n) buf.width = buf.height = n;
  return bctx!;
}

/** Draw `who` into a dialogue portrait canvas. `talking` animates the mouth. */
export function drawPortrait(c: HTMLCanvasElement, who: string, t: number, mood: Mood = 'neutral', talking = false) {
  const out = c.getContext('2d')!;
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.clearRect(0, 0, c.width, c.height);
  const pixel = settings.artStyle !== 'smooth';
  const atlas = ATLAS[who];
  if (atlas !== undefined) {
    // Painted art: in pixel style resample through a half-size buffer so it shares the world's chunky grain.
    const n = pixel ? c.width >> 1 : c.width;
    const ctx = pixel ? buffer(n) : out;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, n, n);
    backdrop(ctx, n, atlas === 0 ? '#5a2a1a' : atlas === 1 ? '#2a4a24' : '#5a2410', '#0a0608');
    const breathe = Math.sin(t * 1.4) * n * 0.008;
    drawFallenPortrait(ctx, atlas, 0, breathe, n, n);
    if (pixel) present(out, c, n);
    return;
  }
  const s = styleOf(who);
  if (!s) return;
  const U = 38;
  const n = pixel ? U : c.width;
  const ctx = pixel ? buffer(n) : out;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, n, n);
  const P = palette(s, who);
  backdrop(ctx, n, P.bg, P.bgEdge);
  // Frame the bust a little larger than life so the face reads at phone size.
  ctx.scale(n / U, n / U);
  ctx.translate(19, 40);
  ctx.scale(1.14, 1.14);
  ctx.translate(-19, -40);
  bust(ctx, s, P, who, t, mood, talking, pixel);
  if (pixel) present(out, c, n);
}

function present(out: CanvasRenderingContext2D, c: HTMLCanvasElement, n: number) {
  out.imageSmoothingEnabled = false;
  out.drawImage(buf!, 0, 0, n, n, 0, 0, c.width, c.height);
  out.imageSmoothingEnabled = true;
}

/** A soft pool of light behind the head, made of flat rings (no gradient to rebuild). */
function backdrop(ctx: Ctx, n: number, inner: string, edge: string) {
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = inner;
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(n * 0.5, n * 0.42, n * (0.56 - i * 0.11), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function shape(ctx: Ctx, fill: string, ...pts: number[]) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

function line(ctx: Ctx, color: string, w: number, x0: number, y0: number, x1: number, y1: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** One bust in a 38-unit square: shoulders, neck, head, hair or helm, face. */
function bust(ctx: Ctx, s: HumanStyle, P: Pal, who: string, t: number, mood: Mood, talking: boolean, pixel: boolean) {
  const seed = who.length * 1.7;
  let b = Math.sin(t * 1.6 + seed) * 0.35;
  if (pixel) b = Math.round(b);
  const hx = 19, hy = 16 + b * 0.6;
  const helm = s.helm;
  const covered = helm === 'visor';
  // Hair that falls behind the shoulders goes first.
  if (!covered && (s.hairKind === 'long' || s.hairKind === 'braid') && helm !== 'hood_up') {
    ell(ctx, hx, hy + 4, 8.4, 11, P.hairDark);
  }
  if (helm === 'hood_up' || helm === 'mask') ell(ctx, hx, hy + 1, 9.6, 11.4, helm === 'mask' ? P.coatDark : s.helmColor ?? P.coatDark);
  // Shoulders and chest, on a dark outline like the sprites in the world.
  const sy = 26.5 + b;
  shape(ctx, s.outline, 1.2, 40, 3.7, sy + 3.6, 10.6, sy - 0.8, 27.4, sy - 0.8, 34.3, sy + 3.6, 36.8, 40);
  shape(ctx, P.coatDark, 2, 38, 4.5, sy + 4, 11, sy, 27, sy, 33.5, sy + 4, 36, 38);
  shape(ctx, P.coat, 5, 38, 6.5, sy + 4.5, 12, sy + 0.8, 26, sy + 0.8, 31.5, sy + 4.5, 33, 38);
  // Collar: a V of trim.
  line(ctx, P.trim, 0.9, 15, sy + 0.6, 19, sy + 5);
  line(ctx, P.trim, 0.9, 23, sy + 0.6, 19, sy + 5);
  if (s.plate) {
    ell(ctx, 8.6, sy + 3.6, 5.6, 3.6, s.plate.dark);
    ell(ctx, 29.4, sy + 3.6, 5.6, 3.6, s.plate.dark);
    ell(ctx, 8.6, sy + 3, 4.8, 2.8, s.plate.c);
    ell(ctx, 29.4, sy + 3, 4.8, 2.8, s.plate.c);
    line(ctx, s.plate.hi, 0.7, 5.5, sy + 2.2, 10, sy + 1.4);
    line(ctx, s.plate.hi, 0.7, 28, sy + 1.4, 32.5, sy + 2.2);
  }
  if (s.scarf) shape(ctx, s.scarf, 13.5, sy - 0.4, 24.5, sy - 0.4, 23, sy + 2.4, 19, sy + 3.4, 15, sy + 2.4);
  // Neck.
  ctx.fillStyle = P.skinDark;
  ctx.fillRect(16.2, hy + 4, 5.6, sy - hy - 3.4);
  // Head, shaded on the far side.
  ell(ctx, hx, hy, 7.3, 8.5, s.outline);
  ell(ctx, hx, hy, 6.6, 7.8, P.skinDark);
  ell(ctx, hx - 0.7, hy - 0.2, 5.9, 7.4, P.skin);
  ell(ctx, hx - 2.6, hy - 2.6, 1.6, 1.2, P.skinHi);
  // Ears.
  if (!covered && helm !== 'hood_up') {
    ell(ctx, hx - 6.5, hy + 0.6, 1, 1.6, P.skinDark);
    ell(ctx, hx + 6.5, hy + 0.6, 1, 1.6, P.skinDark);
  }
  if (s.beard && !covered) {
    shape(ctx, s.beard, hx - 6.2, hy + 0.6, hx - 5.6, hy + 5.6, hx - 2.4, hy + 9.4, hx + 2.4, hy + 9.4, hx + 5.6, hy + 5.6, hx + 6.2, hy + 0.6, hx + 4, hy + 3.4, hx - 4, hy + 3.4);
  }
  face(ctx, s, P, hx, hy, t + seed, mood, talking, covered || helm === 'mask');
  hairAndHelm(ctx, s, P, hx, hy);
}

function face(ctx: Ctx, s: HumanStyle, P: Pal, hx: number, hy: number, t: number, mood: Mood, talking: boolean, hidden: boolean) {
  const ey = hy + 0.6;
  const blink = t % 3.7 < 0.13;
  const glow = s.eyeGlow > 0;
  if (hidden) return;
  // Brows: inner ends down for anger, up for worry and surprise.
  const tilt = mood === 'stern' ? 0.7 : mood === 'menace' ? 1.1 : mood === 'worried' ? -0.8 : mood === 'smile' ? -0.2 : 0;
  const lift = mood === 'surprised' ? -0.9 : 0;
  const by = ey - 2 + lift;
  line(ctx, P.brow, 0.9, hx - 4.6, by - tilt * 0.3, hx - 1.4, by + tilt);
  line(ctx, P.brow, 0.9, hx + 4.4, by - tilt * 0.3, hx + 1.2, by + tilt);
  // Eyes.
  const open = blink ? 0.18 : mood === 'surprised' ? 1.1 : mood === 'menace' || mood === 'stern' ? 0.7 : 0.85;
  for (const sx of EYE_X) {
    if (glow) {
      ctx.globalAlpha = 0.35;
      ell(ctx, hx + sx, ey, 2.2, 1.4, s.iris ?? s.eye);
      ctx.globalAlpha = 1;
      ell(ctx, hx + sx, ey, 1.4, 0.75 * open, s.eye);
    } else {
      ell(ctx, hx + sx, ey, 1.35, 0.95 * open, '#f2ece2');
      if (!blink) ell(ctx, hx + sx + 0.25, ey + 0.05, 0.7, 0.75 * Math.min(1, open), s.iris ?? '#2a1e18');
      line(ctx, P.hairDark, 0.45, hx + sx - 1.4, ey - 0.8 * open, hx + sx + 1.4, ey - 0.8 * open);
    }
  }
  // Nose.
  line(ctx, P.skinDark, 0.7, hx + 0.4, ey + 0.8, hx + 0.9, ey + 3);
  // Mouth.
  const my = hy + 5.2;
  const speaking = talking && Math.floor(t * 9) % 2 === 0;
  if (speaking || mood === 'surprised') ell(ctx, hx, my, mood === 'surprised' ? 1 : 1.3, speaking ? 0.85 : 1.1, '#2a1014');
  else {
    ctx.strokeStyle = P.lip;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hx - 1.9, my);
    const curve = mood === 'smile' ? 1 : mood === 'worried' ? -0.7 : mood === 'menace' ? -0.4 : 0;
    ctx.quadraticCurveTo(hx, my + curve, hx + 1.9, my - (mood === 'menace' ? 0.5 : 0));
    ctx.stroke();
  }
}

function hairAndHelm(ctx: Ctx, s: HumanStyle, P: Pal, hx: number, hy: number) {
  const helm = s.helm, hc = P.helm;
  if (helm === 'visor') {
    // A closed helm: bronze or iron, a dark slit with the eyes burning in it, a crest.
    if (s.crest) shape(ctx, s.crest, hx - 1.4, hy - 7.6, hx + 1.4, hy - 7.6, hx + 8, hy - 11, hx + 9.5, hy - 6, hx + 3, hy - 5);
    ell(ctx, hx, hy - 0.4, 7.6, 8.6, P.helmDeep);
    ell(ctx, hx - 0.6, hy - 0.8, 6.9, 8.1, hc);
    shape(ctx, '#0a0608', hx - 5.4, hy - 0.2, hx + 5.4, hy - 0.2, hx + 4.8, hy + 1.4, hx + 1, hy + 1.6, hx + 0.6, hy + 7.6, hx - 0.6, hy + 7.6, hx - 1, hy + 1.6, hx - 4.8, hy + 1.4);
    ctx.globalAlpha = 0.4;
    ell(ctx, hx - 2.8, hy + 0.6, 2, 1.1, s.iris ?? s.eye);
    ell(ctx, hx + 2.6, hy + 0.6, 2, 1.1, s.iris ?? s.eye);
    ctx.globalAlpha = 1;
    ell(ctx, hx - 2.8, hy + 0.6, 1.1, 0.5, s.eye);
    ell(ctx, hx + 2.6, hy + 0.6, 1.1, 0.5, s.eye);
    if (s.helmTrim) line(ctx, s.helmTrim, 0.7, hx - 6.8, hy - 2.4, hx + 6.6, hy - 2.4);
    return;
  }
  if (helm === 'mask') {
    // The Regent's mask: pale, smooth, with nothing behind the slits.
    ell(ctx, hx - 0.4, hy, 5.8, 7.2, '#e6e0d6');
    shape(ctx, '#0a0608', hx - 4.2, hy, hx - 1.2, hy - 0.4, hx - 1.4, hy + 1, hx - 4, hy + 1);
    shape(ctx, '#0a0608', hx + 3.6, hy, hx + 0.8, hy - 0.4, hx + 1, hy + 1, hx + 3.4, hy + 1);
    line(ctx, '#b8b0a6', 0.5, hx - 0.2, hy + 3, hx - 0.2, hy + 6);
    shape(ctx, P.coatDark, hx - 9.6, hy - 1, hx - 6, hy - 9, hx, hy - 11.4, hx + 6, hy - 9, hx + 9.6, hy - 1, hx + 6.6, hy - 4, hx, hy - 8, hx - 6.6, hy - 4);
    return;
  }
  // Hair.
  if (s.hair && helm !== 'hood_up' && helm !== 'oversized') {
    const top = hy - 5;
    ell(ctx, hx, top + 0.4, 7, 3.8, P.hairDark);
    ell(ctx, hx - 0.5, top, 6.4, 3.4, P.hair);
    // Fringe and sides down to the ears.
    shape(ctx, P.hair, hx - 6.6, top + 1, hx - 6.9, hy + 1.4, hx - 5.6, hy - 1.2, hx - 3, top + 3.2, hx + 2, top + 2.4, hx + 5.6, hy - 1.4, hx + 6.8, hy + 1.2, hx + 6.6, top + 1);
    if (s.hairKind === 'spiky') {
      for (let i = -2; i <= 2; i++) shape(ctx, P.hair, hx + i * 2.6 - 1.6, top - 1.6, hx + i * 2.6 + 1.2, top - 5 + Math.abs(i) * 0.9, hx + i * 2.6 + 1.6, top - 1.2);
    }
    if (s.hairKind === 'long') {
      shape(ctx, P.hair, hx - 6.9, hy - 1, hx - 8, hy + 10, hx - 5.4, hy + 9, hx - 5.8, hy + 1);
      shape(ctx, P.hair, hx + 6.9, hy - 1, hx + 8, hy + 10, hx + 5.4, hy + 9, hx + 5.8, hy + 1);
    }
    if (s.hairKind === 'braid') {
      for (let i = 0; i < 5; i++) ell(ctx, hx + 6.4 + i * 0.5, hy + 2 + i * 2.6, 1.6 - i * 0.12, 1.4, i % 2 ? P.hairDark : P.hair);
    }
  }
  if (helm === 'oversized') {
    // Tobiah's helmet, a size too big: it sits low over his brows.
    ell(ctx, hx, hy - 5.6, 9.2, 5.8, P.helmDark);
    ell(ctx, hx - 0.6, hy - 6, 8.4, 5.2, hc);
    ctx.fillStyle = P.helmDeep;
    ctx.fillRect(hx - 10, hy - 3.4, 20, 1.6);
    line(ctx, P.helmHi, 0.6, hx - 6, hy - 7.6, hx - 2, hy - 9);
  } else if (helm === 'hood_up') {
    shape(ctx, hc, hx - 8.8, hy + 6, hx - 8, hy - 6, hx - 2, hy - 10.6, hx + 3, hy - 10.4, hx + 8.6, hy - 5.4, hx + 8.8, hy + 6, hx + 6.6, hy + 6, hx + 6.4, hy - 2.6, hx, hy - 5.6, hx - 6.4, hy - 2.6, hx - 6.6, hy + 6);
    ctx.globalAlpha = 0.35;
    ell(ctx, hx, hy - 3.4, 6, 2.4, '#000');
    ctx.globalAlpha = 1;
  } else if (helm === 'crown') {
    const cy = hy - 6.2;
    ctx.fillStyle = hc;
    ctx.fillRect(hx - 6, cy, 12, 1.8);
    for (let i = -2; i <= 2; i++) shape(ctx, hc, hx + i * 2.6 - 1, cy + 0.2, hx + i * 2.6, cy - 2.6 - (i === 0 ? 1 : 0), hx + i * 2.6 + 1, cy + 0.2);
    ell(ctx, hx, cy + 0.9, 0.7, 0.6, s.eyeGlow > 0 ? s.iris ?? s.eye : '#c83a3a');
  } else if (helm === 'cap') {
    ctx.fillStyle = hc;
    ctx.fillRect(hx - 5.4, hy - 13, 10.8, 7.6);
    ctx.fillStyle = P.helmDark;
    ctx.fillRect(hx + 2.4, hy - 13, 3, 7.6);
    ctx.fillStyle = s.trim ?? '#c9a04a';
    ctx.fillRect(hx - 5.8, hy - 6.4, 11.6, 1.4);
  } else if (helm !== 'none' && helm !== 'hood_down') {
    ell(ctx, hx, hy - 4.8, 7.4, 4.4, hc);
  }
}
