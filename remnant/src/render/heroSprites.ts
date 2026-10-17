// Original hand-authored raster sprite sheet: 16 frames (32x48), three outfits.
// Equipment and Mantle stay on the same pixel-art path as the base outfit.
// Imported as a Vite asset so it works under the GitHub Pages /Boatride/ base path.
import atlasUrl from '../assets/elior-sprites.png';
import { drawWeapon, type HumanStyle, type WeaponPts } from './actors';
import type { Joints } from './skeleton';
import type { Ctx } from './draw';

const FRAME_W = 32;
const FRAME_H = 48;
const art = new Image();
const mantleArt = document.createElement('canvas');
let mantleReady = false;
art.onload = () => {
  mantleArt.width = art.naturalWidth; mantleArt.height = art.naturalHeight;
  const c = mantleArt.getContext('2d')!;
  c.drawImage(art, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(34,16,65,0.72)';
  c.fillRect(0, 0, mantleArt.width, mantleArt.height);
  mantleReady = true;
};
art.decoding = 'async';
art.src = atlasUrl;
const classicArt = new URLSearchParams(window.location.search).has('classicArt');

export type HeroSpriteAction = string;

export function heroSpriteReady(_style: HumanStyle, _action: string, _mantle: number): boolean {
  if (classicArt) return false;
  return art.complete && art.naturalWidth === FRAME_W * 16 && art.naturalHeight === FRAME_H * 3;
}

function frameAt(action: HeroSpriteAction, t: number, speed: number, grounded: boolean, vy: number, attackProgress: number) {
  if (action === 'attack' || action === 'charge' || action === 'execute') return attackProgress < 0.46 ? 10 : 11;
  if (action === 'plunge') return 11;
  if (action === 'block' || action === 'parry') return 10;
  if (action === 'dodge' || action === 'airdash') return 12 + (Math.floor(t * 12) % 2);
  if (action === 'hurt' || action === 'dead') return 14;
  if (action === 'cast' || action === 'heal' || action === 'transform') return 15;
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
  attackProgress: number, rotation: number, mantle = 0,
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
  const source = mantle > 0 && mantleReady ? mantleArt : art;
  ctx.drawImage(source, frame * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, -16, -46, 32, 48);
  // Pixel headgear sits over the atlas head, rather than disabling the sprite.
  const hy = frame >= 12 && frame <= 13 ? -34 : frame === 14 ? -39 : -42;
  if (style.helm !== 'none' && style.helm !== 'hood_down') {
    const hood = style.helm === 'hood_up';
    ctx.fillStyle = style.outline;
    ctx.fillRect(-5, hy, 9, 7);
    ctx.fillStyle = style.helmColor ?? style.plate?.c ?? style.coat;
    ctx.fillRect(-4, hy + 1, 7, 4);
    ctx.fillStyle = style.helmTrim ?? style.plate?.hi ?? '#d3b675';
    ctx.fillRect(-3, hy, 5, 1);
    ctx.fillStyle = hood ? style.skin : '#171521';
    ctx.fillRect(0, hy + 3, 4, 2);
    if (style.helm === 'crown') {
      ctx.fillStyle = '#ebc56e';
      ctx.fillRect(-4, hy - 2, 2, 3); ctx.fillRect(-1, hy - 3, 2, 4); ctx.fillRect(2, hy - 2, 2, 3);
    }
  }
  if (mantle > 0) {
    ctx.fillStyle = '#d5b8ff'; ctx.fillRect(1, hy + 4, 3, 1);
    ctx.fillStyle = '#9c67dd'; ctx.fillRect(-3, -30, 1, 9);
  }
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
