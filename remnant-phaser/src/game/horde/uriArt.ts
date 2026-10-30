// Uri, his orc shaman and the two merged, painted pixel by pixel from the shared skeleton by the original's
// painter (remnant/src/render/pixelHero.ts) and baked once into atlases laid out like the fighters' (192 px cells,
// feet at 120, frames named clip:i), so the Horde's hero code plays them the same way. Placeholder art until a
// parts sheet is drawn for him (art/REQUESTS.md).
import type Phaser from 'phaser';
import { Animator, solve, type RigDims } from '../../../../remnant/src/render/skeleton';
import { drawHumanoid, type HumanStyle } from '../../../../remnant/src/render/actors';
import { setPixelArt } from '../../../../remnant/src/render/pixelHero';
import { clipsFor } from '../../../../remnant/src/game/weapons';
import { DIMS } from '../../../../remnant/src/game/playerDims';
import { BRUTE_DIMS } from '../../../../remnant/src/game/tanks';
import { ACTION_CELL, ACTION_FOOT, ACTION_STEPS } from '../actionArt';

const BASE: Omit<HumanStyle, 'skin' | 'coat' | 'coatDark'> = {
  hair: null, hairKind: 'none', skirt: 0, trim: null, pants: '#24222a', boots: '#151318', glove: '#2c2024', belt: null, plate: null,
  helm: 'none', eye: '#ffb347', eyeGlow: 0, outline: '#050408', weapon: 'none', offhand: 'none', bulk: 1,
};

/** Uri: a calm hunter of fire in a charcoal long coat with ember trim and a crimson scarf; flame in his hand. */
export const URI_STYLE: HumanStyle = {
  ...BASE, skin: '#8a5a3c', hair: '#161214', hairKind: 'short', beard: '#161214', coat: '#2a2730', coatDark: '#1c1a21', skirt: 7,
  trim: '#ff7a2a', belt: '#3a2a1a', eye: '#ffb347', eyeGlow: 0.35, scarf: '#c8361e',
};
/** The great orc shaman: green-skinned, hide-hooded, bone-plated, with a burning staff. */
export const SHAMAN_STYLE: HumanStyle = {
  ...BASE, skin: '#5d7a3a', beard: '#2a2a1a', coat: '#5a4230', coatDark: '#3a2a1e', skirt: 10, trim: '#d9d2bd', pants: '#3a2a20', boots: '#2a1d14',
  glove: '#3a2a20', belt: '#2a1d14', plate: { c: '#d9d2bd', dark: '#8a8270', hi: '#fff6e0', tier: 1 }, helm: 'hood_up', helmColor: '#4a3424',
  eye: '#ff8a3a', eyeGlow: 0.8, weapon: 'staff', weaponColor: '#6a4a2a', weaponFlame: true, weaponGlow: '#ff8a3a', weaponGlowAmt: 0.7, bulk: 1.45, runes: '#ff8a3a',
};
/** The two merged: Uri crowned in fire, as broad as the shaman, its staff in his hand. */
export const CROWN_STYLE: HumanStyle = {
  ...BASE, skin: '#6e3a22', coat: '#3a1a12', coatDark: '#24100c', skirt: 9, trim: '#ffd27a', pants: '#2a140e', boots: '#1a0c08', glove: '#3a1a12',
  belt: '#5a2a14', plate: { c: '#5a3a2a', dark: '#2a1810', hi: '#ffb347', tier: 2 }, helm: 'crown', helmColor: '#ffb347', helmTrim: '#fff1c4',
  eye: '#ffe2a0', eyeGlow: 1, scarf: '#ff5a1f', weapon: 'staff', weaponColor: '#5a3a20', weaponFlame: true, weaponGlow: '#ff8a3a', weaponGlowAmt: 0.9,
  bulk: 1.35, runes: '#ff7a2a',
};

const CLIPS = ['idle', 'run', 'roll', 'dash', 'hurt', 'death', 'cast', 'invoke'];

/** A flame cupped in the hand: a few hard pixels, flickering by frame. */
function handFlame(c: CanvasRenderingContext2D, x: number, y: number, i: number) {
  const h = 5 + (i % 3);
  const px = (dx: number, dy: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1); };
  for (let k = 0; k < h; k++) {
    const w = Math.max(0, Math.round((h - k) / 2.2)), sway = Math.round(Math.sin(i * 0.9 + k) * 0.6);
    for (let dx = -w; dx <= w; dx++) px(dx + sway, -k - 1, k < 2 && Math.abs(dx) < w ? '#fff1c4' : Math.abs(dx) === w ? '#c8361e' : '#ff8a2a');
  }
}

/** Bake a painted figure into an atlas `key` at `scale`; `flame` puts fire in its front hand when it holds nothing. */
export function paintedAtlas(sc: Phaser.Scene, key: string, style: HumanStyle, dims: RigDims, scale: number, flame: boolean) {
  if (sc.textures.exists(key)) return key;
  const clips = clipsFor('blade'), anim = new Animator(clips);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ACTION_CELL;
  const c = canvas.getContext('2d')!;
  const packed: { name: string; canvas: HTMLCanvasElement; left: number; top: number; x: number; y: number }[] = [];
  let px = 2, py = 2, row = 0;
  // The Phaser build otherwise draws with the original's vector painter; the pixel painter is on for the bake only.
  setPixelArt(true);
  try {
    for (const name of CLIPS) {
      const clip = clips[name];
      if (!clip) continue;
      anim.play(name, 0, true);
      for (let i = 0; i < ACTION_STEPS; i++) {
        anim.time = clip.dur * (i / (clip.loop ? ACTION_STEPS : ACTION_STEPS - 1));
        const p = anim.sample(), j = solve(p, dims, !/roll|death/.test(name) || name === 'death');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, ACTION_CELL, ACTION_CELL);
        c.setTransform(scale, 0, 0, scale, ACTION_CELL / 2, ACTION_FOOT);
        c.imageSmoothingEnabled = false;
        const wp = drawHumanoid(c, j, style, i * 0.07);
        if (flame && name !== 'death') handFlame(c, wp.bx, wp.by - 1, i);
        c.setTransform(1, 0, 0, 1, 0, 0);
        const d = c.getImageData(0, 0, ACTION_CELL, ACTION_CELL).data;
        let left = ACTION_CELL - 1, top = ACTION_CELL - 1, right = 0, bottom = 0;
        for (let y = 0; y < ACTION_CELL; y++) for (let x = 0; x < ACTION_CELL; x++) if (d[(y * ACTION_CELL + x) * 4 + 3]) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
        if (right < left) { left = right = ACTION_CELL / 2; top = bottom = ACTION_FOOT; }
        left = Math.max(0, left - 1); top = Math.max(0, top - 1); right = Math.min(ACTION_CELL - 1, right + 1); bottom = Math.min(ACTION_CELL - 1, bottom + 1);
        const w = right - left + 1, h = bottom - top + 1;
        if (px + w + 2 > 1024) { px = 2; py += row + 2; row = 0; }
        const frame = document.createElement('canvas');
        frame.width = w; frame.height = h;
        frame.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, w, h);
        packed.push({ name: `${name}:${i}`, canvas: frame, left, top, x: px, y: py });
        px += w + 2; row = Math.max(row, h);
      }
    }
  } finally {
    setPixelArt(false);
  }
  const tex = sc.textures.createCanvas(key, 1024, py + row + 2)!, out = tex.getContext();
  for (const f of packed) {
    out.drawImage(f.canvas, f.x, f.y);
    tex.add(f.name, 0, f.x, f.y, f.canvas.width, f.canvas.height)!.setTrim(ACTION_CELL, ACTION_CELL, f.left, f.top, f.canvas.width, f.canvas.height);
  }
  tex.refresh();
  return key;
}

// Painted at one pixel per unit (whole pixels stay crisp); the sprites are scaled up where they are shown.
export const uriAtlas = (sc: Phaser.Scene) => paintedAtlas(sc, 'painted-uri', URI_STYLE, DIMS, 1, true);
export const crownAtlas = (sc: Phaser.Scene) => paintedAtlas(sc, 'painted-uri-crown', CROWN_STYLE, BRUTE_DIMS, 1, false);
export const shamanAtlas = (sc: Phaser.Scene) => paintedAtlas(sc, 'painted-shaman', SHAMAN_STYLE, BRUTE_DIMS, 1, false);
