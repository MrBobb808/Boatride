// Original hand-authored raster sprite sheet: 16 frames (32x48), three outfits.
// The Canvas skeletal renderer remains the fallback for unsupported equipment/poses.
// Imported as a Vite asset so it works under the GitHub Pages /Boatride/ base path.
import atlasUrl from '../assets/elior-sprites.png';
import { drawWeapon, type HumanStyle, type WeaponPts } from './actors';
import type { Joints } from './skeleton';
import type { Ctx } from './draw';

const FRAME_W = 32;
const FRAME_H = 48;
const art = new Image();
art.decoding = 'async';
art.src = atlasUrl;

export type HeroSpriteAction = 'free' | 'attack' | 'charge' | 'dodge' | 'airdash' | 'cast' | 'hurt';

export function heroSpriteReady(style: HumanStyle, action: string, mantle: number): action is HeroSpriteAction {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('classicArt')) return false;
  return art.complete && art.naturalWidth === FRAME_W * 16 && art.naturalHeight === FRAME_H * 3 &&
    style.helm === 'none' && mantle <= 0 &&
    (action === 'free' || action === 'attack' || action === 'charge' ||
     action === 'dodge' || action === 'airdash' || action === 'cast' || action === 'hurt');
}

function frameAt(action: HeroSpriteAction, t: number, speed: number, grounded: boolean, vy: number, attackProgress: number) {
  if (action === 'attack' || action === 'charge') return attackProgress < 0.46 ? 10 : 11;
  if (action === 'dodge' || action === 'airdash') return 12 + (Math.floor(t * 12) % 2);
  if (action === 'hurt') return 14;
  if (action === 'cast') return 15;
  if (!grounded) return vy < 0 ? 8 : 9;
  if (Math.abs(speed) > 24) return 4 + (Math.floor(t * 11) % 4);
  return Math.floor(t * 3.8) % 4;
}

/**
 * Draw Elior from genuine pixel-authored PNG frames, preserving the existing
 * skeleton-driven weapon for equipment, impact positions and combat trails.
 * Coordinate space matches drawHumanoid: feet at 0 and forward to the right.
 */
export function drawHeroSprite(
  ctx: Ctx, j: Joints, style: HumanStyle, time: number,
  action: HeroSpriteAction, speed: number, grounded: boolean, vy: number,
  attackProgress: number, rotation: number,
): WeaponPts {
  const frame = frameAt(action, time, speed, grounded, vy, attackProgress);
  const row = style.plate ? (style.eye === '#c9a8ff' ? 2 : 1) : 0;
  ctx.save();
  if (rotation) {
    ctx.translate(j.hipX, j.hipY - 4);
    ctx.rotate(rotation);
    ctx.translate(-j.hipX, -(j.hipY - 4));
  }
  // The sword is behind the illustrated gripping hand; geometry still comes
  // from the combat skeleton so equipped blades and polearms are unchanged.
  const w = drawWeapon(ctx, j, style, time);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, frame * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, -16, -43, 32, 43);
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();

  if (rotation) {
    const cx = j.hipX, cy = j.hipY - 4, c = Math.cos(rotation), s = Math.sin(rotation);
    const bx = cx + (w.bx - cx) * c - (w.by - cy) * s;
    const by = cy + (w.bx - cx) * s + (w.by - cy) * c;
    const tx = cx + (w.tx - cx) * c - (w.ty - cy) * s;
    const ty = cy + (w.tx - cx) * s + (w.ty - cy) * c;
    w.bx = bx; w.by = by; w.tx = tx; w.ty = ty;
  }
  return w;
}
