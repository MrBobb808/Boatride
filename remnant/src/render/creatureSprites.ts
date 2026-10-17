// Original raster atlases, embedded by Vite so installed/offline games need no asset requests.
import ashen from '../assets/foes-ashen.png';
import shinar from '../assets/foes-shinar.png';
import beasts from '../assets/foes-beasts.png';
import veil from '../assets/foes-veil.png';
import vanguard from '../assets/echo-vanguard.png';
import sovereign from '../assets/echo-sovereign.png';
import manifest from '../assets/sprite-manifest.json';
import type { Enemy } from '../game/enemies';
import type { EchoUnit } from '../game/echoes';
import { G } from '../game/ctx';
import { spriteFrame, isSpriteWindup } from './spriteMotion';
import { clamp } from '../core/math';
import type { Ctx } from './draw';

interface Sprite {
  art: HTMLImageElement;
  flash: HTMLCanvasElement;
  row: number;
  originX: number;
  originY: number;
  height: number;
}
const foes: Record<string, Sprite> = {};
const echoes: Record<string, Sprite> = {};
const urls: Record<string, string> = { 'foes-ashen': ashen, 'foes-shinar': shinar, 'foes-beasts': beasts, 'foes-veil': veil, 'echo-vanguard': vanguard, 'echo-sovereign': sovereign };
const CELL = manifest.cell;
const classic = new URLSearchParams(location.search).has('classicArt');
const ready: Promise<void>[] = [];
for (const [name, rows] of Object.entries(manifest.sheets)) {
  const art = new Image();
  const flash = document.createElement('canvas');
  ready.push(new Promise<void>((resolve) => {
    art.onload = () => {
      flash.width = art.naturalWidth; flash.height = art.naturalHeight;
      const c = flash.getContext('2d')!;
      c.drawImage(art, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#fff6e5'; c.fillRect(0, 0, flash.width, flash.height);
      resolve();
    };
    art.onerror = () => resolve(); // Pixel-rendered procedural bodies remain a safe fallback.
  }));
  art.src = urls[name];
  const bank = name.startsWith('echo-') ? echoes : foes;
  for (const row of rows) {
    if (name === 'foes-veil' && (row.id === 'marshal' || row.id === 'warden')) continue;
    bank[row.id] = { art, flash, ...row };
  }
}

export const loadCreatureSprites = () => Promise.all(ready);
export function creatureArtStatus() {
  const loaded = (s: Sprite) => s.art.complete && s.art.naturalWidth === CELL * 4;
  return { enemies: Object.keys(foes).filter(k => loaded(foes[k])), echoes: Object.keys(echoes).filter(k => loaded(echoes[k])) };
}

function available(s: Sprite | undefined): s is Sprite {
  return !classic && !!s && s.art.complete && s.art.naturalWidth === CELL * 4 && s.art.naturalHeight === CELL * 4;
}

function paint(ctx: Ctx, s: Sprite, frame: number, height: number, flash: number) {
  const scale = height / s.height;
  const x = Math.round(-s.originX * scale), y = Math.round(-s.originY * scale);
  const size = Math.round(CELL * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.art, frame * CELL, s.row * CELL, CELL, CELL, x, y, size, size);
  if (flash > 0 && s.flash.width) {
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha *= Math.min(0.9, flash * 9);
    ctx.drawImage(s.flash, frame * CELL, s.row * CELL, CELL, CELL, x, y, size, size);
    ctx.globalAlpha = alpha;
  }
}

/** World-space replacement; health bars, spells, hitboxes and sliced-death clipping stay in World. */
export function drawFoeSprite(ctx: Ctx, e: Enemy): boolean {
  const sprite = foes[e.kind];
  if (!available(sprite)) return false;
  const time = G.time + e.id;
  const u = e.anim?.u ?? Math.min(1, e.st / 0.7);
  const hitAt = e.state === 'smash' ? 0.64 : e.state === 'slam' ? 0.7 : e.state === 'jab' ? 0.52 : 0.55;
  const frame = spriteFrame(e.state, u, e.body.vx, time, hitAt);
  const height = e.body.h * (e.kind === 'drone' ? 1.7 : e.kind === 'vessel' ? 1.5 : 1.08);
  ctx.save();
  ctx.translate(Math.round(e.x), Math.round(e.y));
  ctx.scale(e.face, 1);
  if (e.state === 'vanish') ctx.globalAlpha *= 0.25;
  if (e.dying && !e.awaitingPurify) {
    const fall = clamp(e.deathT / 0.45, 0, 1);
    ctx.globalAlpha *= clamp(1 - (e.deathT - 0.4) / 0.6, 0, 1);
    ctx.rotate(fall * 1.5);
    ctx.scale(1, 1 - fall * 0.3);
  } else if (e.awaitingPurify || e.staggered > 0) {
    ctx.scale(1, 0.68);
  } else if (e.state === 'hurt') {
    ctx.rotate(-0.12);
  } else if (frame === 0 && Math.abs(e.body.vx) < 12) {
    ctx.translate(0, Math.floor(Math.sin(time * 3) * 0.65));
  }
  paint(ctx, sprite, frame, height, e.flash);
  // A consistent anticipation glint remains legible at phone scale for every species.
  if (!e.dying && isSpriteWindup(e.state, frame)) {
    ctx.fillStyle = '#ffbf77';
    ctx.fillRect(9, -height - 5, 1, 7);
    ctx.fillRect(6, -height - 2, 7, 1);
  }
  ctx.restore();
  return true;
}

/** Called in EchoUnit's local space, inside its existing summon/recall clipping and aura. */
export function drawEchoSprite(ctx: Ctx, u: EchoUnit): boolean {
  const sprite = echoes[u.inst.species];
  if (!available(sprite)) return false;
  const progress = u.move ? u.st / u.move.T : u.anim.u;
  const frame = spriteFrame(u.state, progress, u.body.vx, G.time + u.id, u.move?.hitU ?? 0.55);
  ctx.save();
  paint(ctx, sprite, frame, u.kit.h * 1.08, u.flash);
  // Evolution marks distinguish the three existing stages without changing their stats.
  if (u.inst.stage > 0) {
    ctx.fillStyle = u.inst.stage >= 2 ? '#fff4ce' : '#dcb76c';
    ctx.fillRect(-4, -u.kit.h - 5, 2, 2);
    ctx.fillRect(2, -u.kit.h - 5, 2, 2);
    if (u.inst.stage >= 2) ctx.fillRect(-1, -u.kit.h - 8, 2, 3);
  }
  ctx.restore();
  return true;
}
