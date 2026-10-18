// Original illustrated Elior: 16 poses, packed into a transparent 4 × 4 atlas.
// Equipment and Mantle stay on the same pixel-art path as the base outfit.
// Imported as a Vite asset so it works under the GitHub Pages /Boatride/ base path.
import atlasUrl from '../assets/elior-v3.png';
import { drawWeapon, type HumanStyle, type WeaponPts } from './actors';
import type { Joints } from './skeleton';
import type { Ctx } from './draw';
import { heroFrameAt, sampleAttackVisual } from './heroMotion';
import { drawChain } from '../game/chain';

const FRAME_W = 128;
const FRAME_H = 128;
/** Shared foot origin; attachments follow each illustrated pose. */
const FOOT = 120;
const DRAW_SIZE = 56;
const attackVisual = { x: 0, y: 0, sx: 1, sy: 1 };
const HEAD = [[84,24],[84,24],[84,24],[84,24],[90,34],[90,34],[90,34],[90,39],[84,53],[84,31],[84,43],[83,38],[86,48],[100,65],[31,37],[69,37]];
const HAND = [[102,68],[102,68],[103,65],[103,68],[109,67],[98,65],[112,65],[106,67],[92,80],[104,69],[58,22],[113,50],[98,83],[114,93],[69,56],[114,49]];
const art = new Image();
const mantleArt = document.createElement('canvas');
let mantleReady = false;
art.onload = () => {
  mantleArt.width = art.naturalWidth; mantleArt.height = art.naturalHeight;
  const c = mantleArt.getContext('2d')!;
  c.drawImage(art, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(34,16,65,0.42)';
  c.fillRect(0, 0, mantleArt.width, mantleArt.height);
  c.globalCompositeOperation = 'source-over';
  // The transformation changes cloth, while his dark skin and white hair stay visible.
  for (let i = 0; i < 16; i++) {
    const x = i % 4 * FRAME_W + HEAD[i][0] - 10;
    const y = Math.floor(i / 4) * FRAME_H + HEAD[i][1] - 13;
    c.clearRect(x, y, 20, 27);
    c.drawImage(art, x, y, 20, 27, x, y, 20, 27);
  }
  mantleReady = true;
};
art.decoding = 'async';
art.src = atlasUrl;
const classicArt = new URLSearchParams(window.location.search).has('classicArt');

export type HeroSpriteAction = string;

export function heroSpriteReady(_style: HumanStyle, _action: string, _mantle: number): boolean {
  if (classicArt) return false;
  return art.complete && art.naturalWidth === FRAME_W * 4 && art.naturalHeight === FRAME_H * 4;
}

/**
 * Draw Elior from genuine pixel-authored PNG frames, preserving the existing
 * skeleton-driven weapon for equipment, impact positions and combat trails.
 * Coordinate space matches drawHumanoid: feet at 0 and forward to the right.
 */
export function drawHeroSprite(
  ctx: Ctx, j: Joints, style: HumanStyle, time: number,
  action: HeroSpriteAction, speed: number, grounded: boolean, vy: number,
  attackProgress: number, rotation: number, mantle = 0, extension = 0, hideWeapon = false, stateTime = 0, stride?: number,
  hitStart = 0.46, hitEnd = 0.7, heavy = false,
): WeaponPts {
  const frame = heroFrameAt(action, time, speed, grounded, vy, attackProgress, stateTime, stride, hitStart);
  if (action === 'attack') sampleAttackVisual(attackVisual, attackProgress, hitStart, hitEnd, heavy, !grounded);
  else { attackVisual.x = attackVisual.y = 0; attackVisual.sx = attackVisual.sy = 1; }
  // These poses are already tucked: a second skeleton spin clips them through the floor.
  if (action === 'dodge' || action === 'airdash') rotation = 0;
  ctx.save();
  if (rotation) {
    ctx.translate(j.hipX, j.hipY - 4);
    ctx.rotate(rotation);
    ctx.translate(-j.hipX, -(j.hipY - 4));
  }
  ctx.translate(attackVisual.x, attackVisual.y);
  ctx.scale(attackVisual.sx, attackVisual.sy);
  // The sword is behind the illustrated gripping hand; geometry still comes
  // from the combat skeleton so equipped blades and polearms are unchanged.
  const weapon = style.weapon;
  if (hideWeapon) style.weapon = 'none';
  const scale = DRAW_SIZE / FRAME_W;
  const handX = HAND[frame][0] * scale - DRAW_SIZE / 2;
  const handY = (HAND[frame][1] - FOOT) * scale;
  const dx = handX - j.haFX, dy = handY - j.haFY;
  if (extension > 1 && !hideWeapon) drawChain(ctx, handX, handY, handX + extension, handY, mantle > 0, 2);
  ctx.save(); ctx.translate(dx + extension, dy);
  const w = drawWeapon(ctx, j, style, time);
  ctx.restore();
  style.weapon = weapon;
  w.bx += dx + extension; w.tx += dx + extension; w.by += dy; w.ty += dy;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const source = mantle > 0 && mantleReady ? mantleArt : art;
  ctx.drawImage(source, frame % 4 * FRAME_W, Math.floor(frame / 4) * FRAME_H, FRAME_W, FRAME_H, -DRAW_SIZE / 2, -FOOT / FRAME_H * DRAW_SIZE, DRAW_SIZE, DRAW_SIZE);
  // Follow the illustrated shoulder instead of leaving a fixed plate floating in a run.
  if (style.plate && frame < 8) {
    const sx = (HEAD[frame][0] - 22) * scale - DRAW_SIZE / 2;
    const sy = (HEAD[frame][1] + 16 - FOOT) * scale;
    ctx.fillStyle = style.plate.dark;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 5, sy - 1); ctx.lineTo(sx + 6, sy + 2); ctx.lineTo(sx + 1, sy + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = style.plate.c; ctx.fillRect(sx + 1, sy, 4, 2);
    ctx.fillStyle = style.plate.hi; ctx.fillRect(sx + 1, sy, 4, 0.7);
  }
  // Open-face headgear stays above the brow. Never paint a visor over his eyes.
  const hx = (HEAD[frame][0] - 10) * scale - DRAW_SIZE / 2;
  const hy = (HEAD[frame][1] - 13 - FOOT) * scale;
  if (style.helm !== 'none' && style.helm !== 'hood_down') {
    ctx.fillStyle = style.helmColor ?? style.plate?.c ?? style.coat;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 3 * scale); ctx.lineTo(hx + 2 * scale, hy + scale);
    ctx.lineTo(hx + 16 * scale, hy + scale); ctx.lineTo(hx + 18 * scale, hy + 3 * scale);
    ctx.lineTo(hx + 16 * scale, hy + 4 * scale); ctx.lineTo(hx + 2 * scale, hy + 4 * scale);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = style.helmTrim ?? style.plate?.hi ?? '#d3b675';
    ctx.fillRect(hx + 2 * scale, hy + 3 * scale, 14 * scale, scale);
    if (style.helm === 'crown') {
      ctx.fillStyle = '#ebc56e';
      ctx.fillRect(hx + 2 * scale, hy - 3 * scale, 2 * scale, 4 * scale);
      ctx.fillRect(hx + 8 * scale, hy - 5 * scale, 2 * scale, 6 * scale);
      ctx.fillRect(hx + 14 * scale, hy - 3 * scale, 2 * scale, 4 * scale);
    }
  }
  if (mantle > 0) {
    // Keep the painted facial features intact in the Mantle too.
    ctx.fillStyle = '#9c67dd'; ctx.fillRect(-3, -30, 1, 9);
  }
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();

  w.bx = w.bx * attackVisual.sx + attackVisual.x;
  w.by = w.by * attackVisual.sy + attackVisual.y;
  w.tx = w.tx * attackVisual.sx + attackVisual.x;
  w.ty = w.ty * attackVisual.sy + attackVisual.y;
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
