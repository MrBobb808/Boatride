// Character rendering on top of the skeleton: tapered, cylinder-shaded limbs,
// layered cloth and metal armor, faces that blink, hair and coat tails that
// trail with movement, beveled weapons and riveted shields. One drawer serves
// Elior, the NPCs, the corrupted, and the purified Echoes (black-gold palette).

import { type Joints } from './skeleton';
import {
  limbShaded, limbStroke, poly, circle, ellipse, glow, shade, rgba, shadeable,
  cylGrad, vGrad, rGrad, lineGrad, setShading, type Ctx,
} from './draw';

export interface HumanStyle {
  skin: string;
  hair: string | null;
  hairKind: 'spiky' | 'long' | 'braid' | 'short' | 'none';
  beard?: string | null;
  coat: string;
  coatDark: string;
  skirt: number;
  trim: string | null;
  pants: string;
  boots: string;
  glove: string;
  belt: string | null;
  plate: { c: string; dark: string; hi: string; tier: number } | null;
  helm: 'none' | 'hood_down' | 'hood_up' | 'cap' | 'visor' | 'crown' | 'sentinel' | 'archer' | 'oversized' | 'mask' | 'husk';
  helmColor?: string;
  helmTrim?: string;
  eye: string;
  eyeGlow: number;
  outline: string;
  weapon: 'blade' | 'spear' | 'greatsword' | 'none' | 'claws' | 'hammer' | 'book' | 'staff' | 'maul';
  weaponColor?: string;
  weaponGlow?: string | null;
  weaponGlowAmt?: number;
  weaponFlame?: boolean;
  offhand: 'none' | 'tower' | 'kite' | 'buckler' | 'bow' | 'blazing' | 'lantern';
  offColor?: string;
  offTrim?: string;
  bowDraw?: number;
  runes?: string | null;
  crack?: string | null;
  bulk: number;
  scarf?: string | null;
  crest?: string | null;
  iris?: string;
  /** Silhouettes: no shading, no fine detail. */
  flat?: boolean;
}

export interface WeaponPts {
  bx: number; by: number; tx: number; ty: number;
}

const tmpW: WeaponPts = { bx: 0, by: 0, tx: 0, ty: 0 };

function dir(a: number) {
  return [Math.sin(a), Math.cos(a)];
}

/** A flat white copy of a style, for the one-frame silhouette flash when a foe is struck. */
const whiteCache = new WeakMap<HumanStyle, HumanStyle>();
export function flashStyle(S: HumanStyle): HumanStyle {
  let w = whiteCache.get(S);
  if (!w) {
    const W = 'rgba(255,248,236,1)';
    w = {
      ...S, skin: W, hair: S.hair ? W : null, beard: S.beard ? W : null, coat: W, coatDark: W, trim: null, pants: W, boots: W, glove: W,
      belt: S.belt ? W : null, plate: S.plate ? { c: W, dark: W, hi: W, tier: S.plate.tier } : null, helmColor: W, helmTrim: undefined,
      eye: W, eyeGlow: 0, outline: W, flat: true, weaponColor: W, weaponGlow: null, weaponFlame: false, offColor: W, offTrim: W, runes: null, crack: null, scarf: S.scarf ? W : null, crest: null,
    };
    whiteCache.set(S, w);
  }
  return w;
}

/** Fill for a body part: shaded when the colour allows it, flat otherwise (ghosts). */
const fillOf = (c: string, g: () => CanvasGradient): string | CanvasGradient => (shadeable(c) ? g() : c);

/** Fine detail (seams, creases, rivets, eye glints) is drawn on the top quality tier only. */
let fine = true, tierShading = true;
export const fineDetail = () => fine;
export function setDetail(tier: number) {
  fine = tier >= 2;
  tierShading = tier >= 1;
  setShading(tierShading);
}

/** How far cloth and hair trail this frame (set per draw from the body's local velocity). */
let flowX = 0, liftY = 0;

/**
 * Draw a character in local space (x forward, y down, feet at 0).
 * vx/vy are the body's velocity in that same local space; cloth and hair
 * trail against it.
 */
export function drawHumanoid(ctx: Ctx, j: Joints, S: HumanStyle, time: number, rot = 0, vx = 0, vy = 0): WeaponPts {
  const B = S.bulk;
  const fine0 = fine;
  if (S.flat) {
    fine = false;
    setShading(false);
  }
  flowX = Math.max(-1.2, Math.min(1.2, vx / 210));
  liftY = Math.max(-1, Math.min(1, vy / 320));
  ctx.save();
  if (rot) {
    ctx.translate(j.hipX, j.hipY - 4);
    ctx.rotate(rot);
    ctx.translate(-j.hipX, -(j.hipY - 4));
  }

  drawArm(ctx, j.shBX, j.shBY, j.elBX, j.elBY, j.haBX, j.haBY, S, true, B);
  drawLeg(ctx, j.hpBX, j.hpBY, j.knBX, j.knBY, j.ftBX, j.ftBY, S, true, B);
  if (S.skirt > 0) drawSkirt(ctx, j, S, B, time);
  drawTorso(ctx, j, S, B);
  // Offhand item (shield / bow) held by the back arm sits in front of the torso.
  if (S.offhand !== 'none') drawOffhand(ctx, j, S, time);
  drawLeg(ctx, j.hpFX, j.hpFY, j.knFX, j.knFY, j.ftFX, j.ftFY, S, false, B);
  drawHead(ctx, j, S, time);
  // Weapon then front arm (hand closes over the grip).
  const w = drawWeapon(ctx, j, S, time);
  drawArm(ctx, j.shFX, j.shFY, j.elFX, j.elFY, j.haFX, j.haFY, S, false, B);
  if (S.plate && S.plate.tier >= 1) drawPauldron(ctx, j, S);
  ctx.restore();
  if (S.flat) {
    fine = fine0;
    setShading(tierShading);
  }
  if (rot) {
    // Weapon trail points are reported in un-rotated space; rotate them to match.
    const cx = j.hipX, cy = j.hipY - 4, c = Math.cos(rot), s = Math.sin(rot);
    const rx = (x: number, y: number) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
    const [bx, by] = rx(w.bx, w.by);
    const [tx, ty] = rx(w.tx, w.ty);
    w.bx = bx; w.by = by; w.tx = tx; w.ty = ty;
  }
  return w;
}

// ---------------------------------------------------------------- limbs

function drawLeg(ctx: Ctx, hx: number, hy: number, kx: number, ky: number, fx: number, fy: number, S: HumanStyle, isBack: boolean, B: number) {
  const o = S.outline;
  const pants = isBack ? shade(S.pants, -0.32) : S.pants;
  const boot = isBack ? shade(S.boots, -0.3) : S.boots;
  const sx = fx - kx, sy = fy - ky;
  const foot = [fx - 2.2 * B, fy - 1.7, fx + 2.2 * B, fy - 1.3, fx + 3.8 * B, fy - 0.2, fx + 3.8 * B, fy + 0.6, fx - 2.4 * B, fy + 0.6];
  // One silhouette for thigh, shin and foot, then the fills on top.
  limbStroke(ctx, hx, hy, kx, ky, 3.0 * B, 2.4 * B, o, 1.3);
  limbStroke(ctx, kx, ky, fx, fy, 2.35 * B, 2.0 * B, o, 1.3);
  poly(ctx, foot, null, o, 1.3);
  limbShaded(ctx, kx, ky, fx, fy, 2.35 * B, 2.0 * B, boot, null);
  poly(ctx, foot, boot, null);
  limbShaded(ctx, hx, hy, kx, ky, 3.0 * B, 2.4 * B, pants, null);
  // Boot top seam and a darker sole.
  if (fine) {
    ctx.beginPath();
    const sl = Math.hypot(sx, sy) || 1, sw = 2.3 * B / sl;
    const bx = kx + sx * 0.2, by = ky + sy * 0.2;
    ctx.moveTo(bx - sy * sw, by + sx * sw);
    ctx.lineTo(bx + sy * sw, by - sx * sw);
    ctx.moveTo(fx - 2.1 * B, fy + 0.15);
    ctx.lineTo(fx + 3.6 * B, fy + 0.15);
    ctx.strokeStyle = shade(boot, -0.5);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  if (S.plate && S.plate.tier >= 1) {
    // Greave plate over the shin and a domed knee cop.
    const pc = isBack ? S.plate.dark : S.plate.c;
    limbShaded(ctx, kx + sx * 0.1, ky + sy * 0.1, kx + sx * 0.75, ky + sy * 0.75, 2.2 * B, 1.8 * B, pc, o, 0.6, true);
    ctx.beginPath();
    ctx.arc(kx, ky, 2.2 * B, 0, Math.PI * 2);
    ctx.fillStyle = isBack ? S.plate.dark : S.plate.hi;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = o;
    ctx.stroke();
    if (!isBack) circle(ctx, kx - 0.6, ky - 0.7, 0.7, 'rgba(255,255,255,0.35)');
  }
}

function drawArm(ctx: Ctx, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, S: HumanStyle, isBack: boolean, B: number) {
  const o = S.outline;
  const sleeve = isBack ? shade(S.coat, -0.35) : S.coat;
  const glove = isBack ? shade(S.glove, -0.3) : S.glove;
  limbStroke(ctx, sx, sy, ex, ey, 2.5 * B, 2.1 * B, o, 1.3);
  limbStroke(ctx, ex, ey, hx, hy, 2.1 * B, 1.8 * B, o, 1.3);
  ctx.beginPath();
  ctx.arc(hx, hy, 1.9 * B, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  limbShaded(ctx, ex, ey, hx, hy, 2.1 * B, 1.8 * B, glove, null);
  limbShaded(ctx, sx, sy, ex, ey, 2.5 * B, 2.1 * B, sleeve, null);
  if (S.plate && S.plate.tier >= 2) {
    // Vambrace.
    limbShaded(ctx, ex + (hx - ex) * 0.2, ey + (hy - ey) * 0.2, ex + (hx - ex) * 0.8, ey + (hy - ey) * 0.8, 2.0 * B, 1.7 * B, isBack ? S.plate.dark : S.plate.c, o, 0.55, true);
  } else if (fine) {
    // Glove cuff seam.
    const fx = hx - ex, fy = hy - ey, fl = Math.hypot(fx, fy) || 1;
    const cx = ex + fx * 0.6, cy = ey + fy * 0.6, nx = -fy / fl * 2.0 * B, ny = fx / fl * 2.0 * B;
    ctx.beginPath();
    ctx.moveTo(cx + nx, cy + ny);
    ctx.lineTo(cx - nx, cy - ny);
    ctx.strokeStyle = shadeable(glove) ? shade(glove, -0.45) : glove;
    ctx.lineWidth = 0.55;
    ctx.stroke();
  }
  if (S.runes && !isBack) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = S.runes;
    ctx.lineWidth = 0.55;
    const mx = (ex + hx) / 2, my = (ey + hy) / 2;
    ctx.beginPath();
    ctx.moveTo(ex + (hx - ex) * 0.25, ey + (hy - ey) * 0.25);
    ctx.lineTo(mx + 0.8, my);
    ctx.lineTo(ex + (hx - ex) * 0.7, ey + (hy - ey) * 0.7);
    ctx.stroke();
    glow(ctx, mx, my, 3.5, S.runes, 0.35);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (S.crack) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(S.crack, 0.8);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo((sx + ex) / 2 + 0.7, (sy + ey) / 2);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  // Fist with a knuckle highlight.
  circle(ctx, hx, hy, 1.9 * B, glove);
  if (fine && !isBack && shadeable(glove)) circle(ctx, hx - 0.5, hy - 0.6, 0.8 * B, 'rgba(255,255,255,0.16)');
}

// ---------------------------------------------------------------- torso & cloth

function drawSkirt(ctx: Ctx, j: Joints, S: HumanStyle, B: number, time: number) {
  const ux = Math.sin(j.torsoA), uy = -Math.cos(j.torsoA);
  const rx = Math.cos(j.torsoA), ry = Math.sin(j.torsoA);
  const hx = j.hipX, hy = j.hipY;
  const L = S.skirt;
  // Coat tails trail behind the stride and lift when falling or running.
  const trail = -flowX * L * 0.42;
  const lift = -Math.max(0, liftY) * L * 0.38 - Math.abs(flowX) * L * 0.12;
  const amp = 0.25 + Math.abs(flowX) * 0.8 + Math.abs(liftY) * 0.6;
  const wv = (i: number) => Math.sin(time * 7.5 + i * 1.4) * amp;
  const midK = (j.knFX + j.knBX) / 2;
  const pts = [
    hx - rx * 4.4 * B + ux * 1, hy - ry * 4.4 * B + uy * 1,
    hx + rx * 4.6 * B + ux * 1, hy + ry * 4.6 * B + uy * 1,
    (j.knFX + hx) / 2 + 3 * B + trail * 0.25, hy + L * 0.95 + lift * 0.4 + wv(0) * 0.3,
    (j.knFX + midK) / 2 + 1 + trail * 0.45, hy + L * 0.98 + lift * 0.6 + wv(1),
    midK + 1 + trail * 0.65, hy + L + lift * 0.8 + wv(2),
    (midK + j.knBX) / 2 - 1 + trail * 0.85, hy + L * 0.96 + lift + wv(3),
    (j.knBX + hx) / 2 - 3.5 * B + trail, hy + L * 0.9 + lift + wv(4),
  ];
  const back = shade(S.coat, -0.32);
  poly(ctx, pts, fillOf(back, () => lineGrad(ctx, hx, hy, hx, hy + L, back, 0.1, -0.35)), S.outline, 0.7);
  if (fine) {
    // A fold running down the tail.
    ctx.beginPath();
    ctx.moveTo(hx - rx * 1.2 * B, hy + 2);
    ctx.lineTo(pts[8] - 0.5, pts[9] - 1.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  if (S.trim) {
    ctx.beginPath();
    ctx.moveTo(pts[4], pts[5]);
    for (let i = 6; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = S.trim;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }
}

function drawTorso(ctx: Ctx, j: Joints, S: HumanStyle, B: number) {
  const o = S.outline;
  const a = j.torsoA;
  const ux = Math.sin(a), uy = -Math.cos(a);
  const rx = Math.cos(a), ry = Math.sin(a);
  const hx = j.hipX, hy = j.hipY;
  const len = Math.hypot(j.neckX - hx, j.neckY - hy);
  const P = (u: number, r: number) => [hx + ux * u + rx * r, hy + uy * u + ry * r];
  const pts = [
    ...P(-1, -4.2 * B), ...P(-1, 4.4 * B),
    ...P(len * 0.55, 5.0 * B), ...P(len * 0.95, 4.6 * B),
    ...P(len * 1.02, 1.5), ...P(len * 1.02, -2.5),
    ...P(len * 0.95, -4.4 * B), ...P(len * 0.5, -4.8 * B),
  ];
  // Lit from the chest and shoulders, falling into shadow at the back and waist.
  const [gx0, gy0] = P(len * 0.95, 4.2 * B);
  const [gx1, gy1] = P(0, -4.6 * B);
  poly(ctx, pts, fillOf(S.coat, () => lineGrad(ctx, gx0, gy0, gx1, gy1, S.coat, 0.16, -0.32)), o, 0.8);
  // Back shadow band under the shoulder blade.
  poly(ctx, [...P(len * 0.08, -4.1 * B), ...P(len * 0.88, -3.9 * B), ...P(len * 0.93, -4.4 * B), ...P(len * 0.5, -4.8 * B), ...P(-0.6, -4.2 * B)], S.coatDark, null);
  if (fine) {
    // Fabric creases at the waist.
    ctx.beginPath();
    const [c1x, c1y] = P(len * 0.32, 3.8 * B), [c2x, c2y] = P(len * 0.24, 0.5);
    const [c3x, c3y] = P(len * 0.45, 3.2 * B), [c4x, c4y] = P(len * 0.4, 1.2);
    ctx.moveTo(c1x, c1y); ctx.lineTo(c2x, c2y);
    ctx.moveTo(c3x, c3y); ctx.lineTo(c4x, c4y);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  if (S.trim) {
    ctx.beginPath();
    const [x1, y1] = P(len * 0.95, 1.2);
    const [x2, y2] = P(len * 0.15, 2.4);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = S.trim;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Collar.
  if (!S.scarf) {
    poly(ctx, [...P(len * 1.04, -2.6), ...P(len * 1.05, 1.8), ...P(len * 0.84, 2.9 * B), ...P(len * 0.92, -0.2)], S.coatDark, o, 0.5);
  }
  if (S.plate) {
    const t = S.plate.tier;
    const cp = [...P(len * 0.35, -4.0 * B), ...P(len * 0.3, 4.4 * B), ...P(len * 0.62, 5.0 * B), ...P(len * 0.92, 4.2 * B), ...P(len * 0.92, -3.8 * B)];
    const [mx0, my0] = P(len * 0.9, 4.6 * B);
    const [mx1, my1] = P(len * 0.3, -4 * B);
    poly(ctx, cp, fillOf(S.plate.c, () => lineGrad(ctx, mx0, my0, mx1, my1, S.plate!.c, 0, 0, true)), o, 0.7);
    // Lower plate lames.
    ctx.beginPath();
    const [l1x, l1y] = P(len * 0.47, -3.9 * B), [l2x, l2y] = P(len * 0.47, 4.6 * B);
    ctx.moveTo(l1x, l1y); ctx.lineTo(l2x, l2y);
    ctx.strokeStyle = rgba(S.plate.dark, 0.9);
    ctx.lineWidth = 0.55;
    ctx.stroke();
    if (t >= 2) {
      ctx.beginPath();
      const [a1, b1] = P(len * 0.5, 0.2);
      const [a2, b2] = P(len * 0.9, 0.4);
      ctx.moveTo(a1, b1);
      ctx.lineTo(a2, b2);
      ctx.strokeStyle = S.plate.hi;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Covenant sigil on the breastplate.
      const [sx, sy] = P(len * 0.68, 1.0);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = S.plate.hi;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
  if (S.belt) {
    const b1 = P(1.6, -4.4 * B), b2 = P(1.6, 4.6 * B);
    ctx.beginPath();
    ctx.moveTo(b1[0], b1[1]);
    ctx.lineTo(b2[0], b2[1]);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = S.belt;
    ctx.stroke();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = shade(S.belt, 0.25);
    ctx.stroke();
    if (fine) {
      // Pouch on the back hip.
      const [px, py] = P(0.6, -3.3 * B);
      poly(ctx, [px - 1.4 * rx, py - 1.4 * ry, px + 1.4 * rx, py + 1.4 * ry, px + 1.3 * rx - 2.6 * ux, py + 1.3 * ry - 2.6 * uy, px - 1.3 * rx - 2.6 * ux, py - 1.3 * ry - 2.6 * uy], shade(S.belt, 0.12), o, 0.45);
    }
    const bk = P(1.6, 1.6);
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(bk[0] - 0.9, bk[1] - 0.9, 1.8, 1.8);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(bk[0] - 0.9, bk[1] - 0.9, 0.7, 0.6);
  }
  if (S.crack) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(S.crack, 0.85);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const c1 = P(len * 0.85, -2), c2 = P(len * 0.6, 1), c3 = P(len * 0.45, -1), c4 = P(len * 0.2, 2.5);
    ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.lineTo(c4[0], c4[1]);
    ctx.stroke();
    glow(ctx, c2[0], c2[1], 6, S.crack, 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (S.scarf) {
    // Scarf wrap around the neck, with a fold.
    const [nx, ny] = P(len * 0.97, 0.3);
    ellipse(ctx, nx, ny, 3.6 * B, 2.0, a, fillOf(S.scarf, () => lineGrad(ctx, nx, ny - 2, nx, ny + 2, S.scarf!, 0.18, -0.25)));
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = o;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nx - rx * 2.4, ny - ry * 2.4 + 0.4);
    ctx.quadraticCurveTo(nx, ny + 1.2, nx + rx * 2.6, ny + ry * 2.6 - 0.2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }
}

function drawPauldron(ctx: Ctx, j: Joints, S: HumanStyle) {
  const p = S.plate!;
  const a = Math.atan2(j.elFY - j.shFY, j.elFX - j.shFX);
  const w = 3.9 * S.bulk;
  ctx.save();
  ctx.translate(j.shFX, j.shFY);
  ctx.rotate(a - Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0.6, w, 3.1, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = fillOf(p.c, () => cylGrad(ctx, p.c, 3.2, true));
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = S.outline;
  ctx.stroke();
  // Second lame below the dome.
  ctx.beginPath();
  ctx.ellipse(0, 0.9, w * 0.86, 1.1, 0, Math.PI * 0.08, Math.PI * 0.92);
  ctx.fillStyle = shadeable(p.c) ? shade(p.c, -0.25) : p.c;
  ctx.fill();
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0.6, w, 3.1, 0, Math.PI * 1.15, Math.PI * 1.85);
  ctx.strokeStyle = p.tier >= 2 ? p.hi : rgba(p.hi, 0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  circle(ctx, -w * 0.55, -0.4, 0.45, p.hi);
  circle(ctx, w * 0.55, -0.4, 0.45, p.hi);
  ctx.restore();
}

// ---------------------------------------------------------------- head

function drawHead(ctx: Ctx, j: Joints, S: HumanStyle, time: number) {
  const hx = j.headX, hy = j.headY, a = j.headA;
  const o = S.outline;
  // Neck
  limbShaded(ctx, j.neckX, j.neckY, hx - Math.sin(a) * 2.5, hy + Math.cos(a) * 2.5, 1.6, 1.5, shade(S.skin, -0.15), o, 0.6);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  const R = 4.5;
  const hooded = S.helm === 'hood_up' || S.helm === 'archer' || S.helm === 'husk';
  const sway = Math.sin(time * 2.2) * 0.3 - flowX * 1.1;
  const lift = -Math.max(0, liftY) * 1.2;
  // Hood behind head
  if (hooded) {
    const hc = S.helmColor ?? S.coat;
    const back = shade(hc, -0.15);
    poly(ctx, [-5.8 + sway * 0.4, 3.5, -6.2 + sway * 0.5, -2.5, -3.5, -6.5, 1.5, -6.6, 5.2, -3.4, 5.6, 1.6, 3.5, 4.5], fillOf(back, () => vGrad(ctx, back, -6.5, 4.5, 0.08, -0.3)), o, 0.7);
  }
  if (S.hair && S.hairKind === 'long') {
    poly(ctx, [-4.5, -3.5, -6.5 + sway, 2 + lift, -6 + sway * 1.6, 9 + lift, -3 + sway, 10 + lift, -1.5, 3], fillOf(S.hair, () => vGrad(ctx, S.hair!, -3.5, 10, 0.12, -0.3)), o, 0.6);
  }
  if (S.hair && S.hairKind === 'braid') {
    poly(ctx, [-4.5, -2.5, -5.5 + sway * 0.5, 2, -5 + sway, 6 + lift, -6 + sway * 1.5, 10 + lift, -4 + sway * 1.5, 11 + lift, -3.5 + sway, 6 + lift, -2.5, 2], fillOf(S.hair, () => vGrad(ctx, S.hair!, -2.5, 11, 0.12, -0.3)), o, 0.6);
    // Braid ties.
    ctx.strokeStyle = rgba(o, 0.6);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-5.6 + sway * 0.6, 3.2); ctx.lineTo(-3.4 + sway * 0.6, 3.6);
    ctx.moveTo(-5.4 + sway, 7.2 + lift); ctx.lineTo(-3.4 + sway, 7.6 + lift);
    ctx.stroke();
  }
  // Ear (hidden under hoods and helms).
  const bare = !hooded && S.helm !== 'visor' && S.helm !== 'sentinel' && S.helm !== 'mask' && S.helm !== 'oversized';
  // Face: skull + jaw toward the front.
  ctx.beginPath();
  ctx.moveTo(-R * 0.95, -R * 0.2);
  ctx.quadraticCurveTo(-R * 0.9, -R * 1.05, 0, -R * 1.02);
  ctx.quadraticCurveTo(R * 1.0, -R * 0.95, R * 1.0, -R * 0.1);
  ctx.lineTo(R * 1.18, R * 0.15); // nose
  ctx.lineTo(R * 0.95, R * 0.35);
  ctx.quadraticCurveTo(R * 0.85, R * 0.95, R * 0.25, R * 1.05); // jaw
  ctx.quadraticCurveTo(-R * 0.6, R * 0.95, -R * 0.95, R * 0.25);
  ctx.closePath();
  ctx.fillStyle = fillOf(S.skin, () => rGrad(ctx, S.skin, R * 0.45, -R * 0.4, R * 1.7, 0.14, -0.2));
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = o;
  ctx.stroke();
  // Cheek & jaw shade, and the shadow under the nose.
  ctx.beginPath();
  ctx.moveTo(-R * 0.95, 0);
  ctx.quadraticCurveTo(-R * 0.4, R * 1.0, R * 0.25, R * 1.0);
  ctx.quadraticCurveTo(-R * 0.3, R * 0.5, -R * 0.4, -R * 0.2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fill();
  if (fine && shadeable(S.skin)) {
    ctx.beginPath();
    ctx.moveTo(R * 1.1, R * 0.22);
    ctx.lineTo(R * 0.9, R * 0.38);
    ctx.lineTo(R * 0.75, R * 0.3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(60,25,20,0.28)';
    ctx.fill();
  }
  if (bare && fine) {
    ellipse(ctx, -R * 0.14, R * 0.16, 0.8, 1.1, 0.15, shade(S.skin, -0.1));
    ctx.beginPath();
    ctx.arc(-R * 0.12, R * 0.18, 0.42, -1.2, 1.3);
    ctx.strokeStyle = 'rgba(70,30,25,0.4)';
    ctx.lineWidth = 0.3;
    ctx.stroke();
  }
  if (S.beard) {
    poly(ctx, [R * 1.0, R * 0.35, R * 0.9, R * 1.2, R * 0.2, R * 1.6, -R * 0.5, R * 0.9, -R * 0.2, R * 0.4, R * 0.5, R * 0.6], fillOf(S.beard, () => vGrad(ctx, S.beard!, 0, R * 1.6, 0.12, -0.25)), o, 0.5);
    // Moustache over the lip.
    ctx.beginPath();
    ctx.moveTo(R * 1.02, R * 0.42);
    ctx.quadraticCurveTo(R * 0.7, R * 0.62, R * 0.45, R * 0.58);
    ctx.strokeStyle = shade(S.beard, -0.25);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  } else if (bare && fine && shadeable(S.skin)) {
    // Mouth.
    ctx.beginPath();
    ctx.moveTo(R * 0.62, R * 0.64);
    ctx.lineTo(R * 0.86, R * 0.6);
    ctx.strokeStyle = 'rgba(60,25,22,0.55)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
  // Eye
  const ex = R * 0.52, ey = -R * 0.1;
  if (S.helm !== 'visor' && S.helm !== 'sentinel' && S.helm !== 'mask') {
    if (S.eyeGlow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, ex, ey, 4.5, S.eye, S.eyeGlow);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = S.eye;
      ctx.fillRect(ex - 0.9, ey - 0.4, 1.9, 0.9);
    } else {
      const blink = (time % 4.3) < 0.11;
      if (blink) {
        ctx.beginPath();
        ctx.moveTo(ex - 0.9, ey + 0.1);
        ctx.lineTo(ex + 1.0, ey + 0.05);
        ctx.strokeStyle = 'rgba(25,14,10,0.9)';
        ctx.lineWidth = 0.55;
        ctx.stroke();
      } else if (S.flat) {
        // Silhouettes have no eye.
      } else if (!fine) {
        ctx.fillStyle = '#f3ece0';
        ctx.fillRect(ex - 0.8, ey - 0.55, 1.7, 1.1);
        ctx.fillStyle = '#1d1712';
        ctx.fillRect(ex + 0.1, ey - 0.55, 0.8, 1.1);
      } else {
        ellipse(ctx, ex + 0.05, ey, 0.95, 0.62, 0, '#f1e9dc');
        circle(ctx, ex + 0.45, ey + 0.04, 0.58, S.iris ?? '#3a2618');
        circle(ctx, ex + 0.55, ey + 0.08, 0.28, '#0d0806');
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(ex + 0.5, ey - 0.38, 0.32, 0.3);
        // Upper lid line.
        ctx.beginPath();
        ctx.moveTo(ex - 0.95, ey - 0.25);
        ctx.quadraticCurveTo(ex, ey - 0.9, ex + 1.05, ey - 0.45);
        ctx.strokeStyle = 'rgba(25,14,10,0.9)';
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
      // Brow
      if (!S.flat) {
        ctx.strokeStyle = S.hair && shadeable(S.hair) ? shade(S.hair, -0.2) : 'rgba(20,14,10,0.8)';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(ex - 1.2, ey - 1.45);
        ctx.lineTo(ex + 1.35, ey - 1.25);
        ctx.stroke();
      }
    }
  }
  // Hair
  if (S.hair && (S.hairKind === 'spiky' || S.hairKind === 'short' || S.hairKind === 'long' || S.hairKind === 'braid')) {
    const hairFill = fillOf(S.hair, () => vGrad(ctx, S.hair!, -R * 1.5, R * 0.5, 0.2, -0.28));
    if (S.hairKind === 'spiky') {
      const b = sway, bl = lift * 0.6;
      poly(ctx, [
        R * 1.05, -R * 0.35, R * 0.7, -R * 1.25, -R * 0.1, -R * 1.45 - 0.5, -R * 0.9, -R * 1.2,
        -R * 1.7 + b, -R * 1.05 + bl, -R * 1.1, -R * 0.6, -R * 1.9 + b * 1.3, -R * 0.25 + bl, -R * 1.05, R * 0.05,
        -R * 1.5 + b * 1.2, R * 0.55 + bl, -R * 0.75, R * 0.35, -R * 0.35, -R * 0.35, R * 0.15, -R * 0.75, R * 0.45, -R * 0.45,
      ], hairFill, o, 0.6);
      // Fringe strand.
      poly(ctx, [R * 0.75, -R * 0.95, R * 1.15, -R * 0.15, R * 0.55, -R * 0.55], hairFill, null);
      if (fine) {
        // Strand separations.
        ctx.beginPath();
        ctx.moveTo(-R * 0.2, -R * 1.2); ctx.lineTo(-R * 0.75, -R * 0.55);
        ctx.moveTo(-R * 1.05, -R * 0.9); ctx.lineTo(-R * 1.35 + b * 0.5, -R * 0.2);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    } else {
      poly(ctx, [R * 1.0, -R * 0.4, R * 0.6, -R * 1.15, -R * 0.3, -R * 1.2, -R * 1.05, -R * 0.6, -R * 1.05, R * 0.3, -R * 0.4, -R * 0.2, R * 0.3, -R * 0.65], hairFill, o, 0.6);
    }
    if (fine && shadeable(S.hair)) {
      // Sheen.
      ctx.beginPath();
      ctx.moveTo(-R * 0.55, -R * 0.92);
      ctx.quadraticCurveTo(0, -R * 1.22, R * 0.55, -R * 0.98);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }
  // Helm / hood
  switch (S.helm) {
    case 'hood_down':
      break;
    case 'hood_up': case 'archer': case 'husk': {
      const hc = S.helmColor ?? S.coat;
      poly(ctx, [-5.6 + sway * 0.3, 2.5, -5.4, -3.2, -2.4, -6.3, 2.4, -6.3, 5.4, -3.6, 5.8, -0.6, 4.2, -1.6, 2.2, -4.1, -1.2, -4.4, -3.6, -1.2, -3.2, 3.2],
        fillOf(hc, () => vGrad(ctx, hc, -6.3, 3.2, 0.16, -0.25)), o, 0.7);
      // Inner shadow of the cowl over the brow.
      poly(ctx, [4.2, -1.6, 2.2, -4.1, -1.2, -4.4, -0.6, -3.4, 2.0, -3.1, 3.8, -1.0], 'rgba(0,0,0,0.3)', null);
      if (S.helm === 'archer' && S.helmTrim) {
        ctx.strokeStyle = S.helmTrim;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(5.4, -3.6); ctx.lineTo(2.4, -6.3); ctx.lineTo(-2.4, -6.3);
        ctx.stroke();
      }
      break;
    }
    case 'cap': {
      const c = S.helmColor ?? '#6d6a66';
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.45, R * 1.12, R * 0.85, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = fillOf(c, () => rGrad(ctx, c, R * 0.3, -R * 1.0, R * 1.5, 0.35, -0.25));
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = shade(c, 0.3);
      ctx.fillRect(-R * 1.15, -R * 0.55, R * 2.3, 0.9);
      circle(ctx, R * 0.35, -R * 1.0, 0.55, 'rgba(255,255,255,0.45)');
      break;
    }
    case 'visor': case 'sentinel': {
      const c = S.helmColor ?? '#2c2a30';
      poly(ctx, [-R * 1.05, R * 0.9, -R * 1.15, -R * 0.6, -R * 0.4, -R * 1.35, R * 0.7, -R * 1.25, R * 1.25, -R * 0.4, R * 1.25, R * 0.95, R * 0.4, R * 1.2, -R * 0.6, R * 1.1],
        fillOf(c, () => rGrad(ctx, c, R * 0.35, -R * 0.8, R * 2.0, 0.4, -0.3)), o, 0.75);
      // Center ridge and specular streak.
      ctx.beginPath();
      ctx.moveTo(-R * 0.4, -R * 1.35); ctx.quadraticCurveTo(R * 0.2, -R * 0.4, -R * 0.1, R * 1.1);
      ctx.strokeStyle = rgba(shade(c, -0.5), 0.8);
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (fine && shadeable(c)) {
        ctx.beginPath();
        ctx.moveTo(R * 0.15, -R * 1.18); ctx.lineTo(R * 0.95, -R * 0.55);
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      // Rivets along the brow band.
      if (fine) for (let i = 0; i < 3; i++) circle(ctx, -R * 0.7 + i * R * 0.55, R * 0.62, 0.38, S.helmTrim ?? shade(c, 0.35));
      // visor slit
      ctx.fillStyle = S.eyeGlow > 0 ? S.eye : '#0b0a0d';
      ctx.fillRect(R * 0.1, -R * 0.25, R * 1.15, 0.9);
      ctx.fillRect(R * 0.55, -R * 0.25, 0.9, R * 1.0);
      if (S.eyeGlow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, R * 0.75, -R * 0.15, 5, S.eye, S.eyeGlow);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (S.helmTrim) {
        ctx.strokeStyle = S.helmTrim;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-R * 0.4, -R * 1.35); ctx.lineTo(R * 0.7, -R * 1.25); ctx.lineTo(R * 1.25, -R * 0.4);
        ctx.stroke();
      }
      if (S.crest) {
        // Plume of white flame for evolved Echoes.
        const fl = Math.sin(time * 9) * 0.6 + sway * 0.6;
        poly(ctx, [-R * 0.4, -R * 1.3, -R * 1.6 + fl * 0.5, -R * 2.2 + fl, -R * 2.6 + fl, -R * 1.2 + fl, -R * 0.9, -R * 0.9], S.crest, null);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, -R * 1.4, -R * 1.6, 6, S.crest, 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    }
    case 'crown': {
      const gold = '#e2b24c';
      poly(ctx, [-R * 0.95, -R * 0.75, -R * 1.1, -R * 1.75, -R * 0.5, -R * 1.15, 0, -R * 1.95, R * 0.5, -R * 1.15, R * 1.1, -R * 1.75, R * 0.95, -R * 0.75],
        vGrad(ctx, gold, -R * 1.95, -R * 0.75, 0.4, -0.25), o, 0.6);
      circle(ctx, 0, -R * 1.05, 0.8, '#b0233a');
      circle(ctx, -0.25, -R * 1.12, 0.25, 'rgba(255,255,255,0.7)');
      break;
    }
    case 'oversized': {
      const c = S.helmColor ?? '#7a776f';
      ctx.beginPath();
      ctx.ellipse(-0.3, -R * 0.35, R * 1.32, R * 1.05, -0.12, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      ctx.fillStyle = fillOf(c, () => rGrad(ctx, c, R * 0.3, -R * 1.0, R * 1.8, 0.35, -0.25));
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = shade(c, 0.25);
      ctx.fillRect(-R * 1.4, -R * 0.45, R * 2.8, 1.0);
      // A dent from older battles.
      ctx.beginPath();
      ctx.arc(-R * 0.5, -R * 0.95, 0.9, 0.3, 2.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      break;
    }
    case 'mask': {
      ctx.beginPath();
      ctx.ellipse(R * 0.25, -R * 0.1, R * 0.95, R * 1.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = rGrad(ctx, '#e9e2d6', R * 0.55, -R * 0.55, R * 1.6, 0.12, -0.3);
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.strokeStyle = '#d6a640';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(R * 0.6, -R * 1.1); ctx.lineTo(R * 0.2, -R * 0.3); ctx.lineTo(R * 0.6, R * 0.3); ctx.lineTo(R * 0.2, R * 1.0);
      ctx.stroke();
      ctx.fillStyle = '#120c14';
      ctx.fillRect(R * 0.55, -R * 0.35, 1.6, 0.8);
      // Painted tear of gold under the eye.
      ctx.beginPath();
      ctx.moveTo(R * 0.85, R * 0.0); ctx.lineTo(R * 0.8, R * 0.55);
      ctx.strokeStyle = 'rgba(214,166,64,0.7)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- weapons & offhand

/** A blade split along its ridge: the edge facing the light is bright, the other dark. */
function bevelBlade(ctx: Ctx, bx: number, by: number, tx: number, ty: number, dx: number, dy: number, px: number, py: number, W: number, shoulder: number, steel: string, o: string) {
  const sx = tx - dx * shoulder, sy = ty - dy * shoulder;
  // Which half faces the light (up and forward in local space)?
  const litPlus = px * 0.36 + py * -0.93 > 0;
  const lit = shadeable(steel) ? shade(steel, 0.3) : steel;
  const dark = shadeable(steel) ? shade(steel, -0.22) : steel;
  poly(ctx, [bx, by, bx + px * W, by + py * W, sx + px * W * 0.9, sy + py * W * 0.9, tx, ty], litPlus ? lit : dark, null);
  poly(ctx, [bx, by, bx - px * W, by - py * W, sx - px * W * 0.9, sy - py * W * 0.9, tx, ty], litPlus ? dark : lit, null);
  poly(ctx, [bx - px * W, by - py * W, bx + px * W, by + py * W, sx + px * W * 0.9, sy + py * W * 0.9, tx, ty, sx - px * W * 0.9, sy - py * W * 0.9], null, o, 0.6);
  // Bright cutting edge on the lit side.
  const e = litPlus ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(bx + px * W * 0.85 * e, by + py * W * 0.85 * e);
  ctx.lineTo(sx + px * W * 0.78 * e, sy + py * W * 0.78 * e);
  ctx.lineTo(tx - dx * 0.4, ty - dy * 0.4);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
}

export function drawWeapon(ctx: Ctx, j: Joints, S: HumanStyle, time: number): WeaponPts {
  const w = tmpW;
  const [dx, dy] = dir(j.wpnA);
  const px = -dy, py = dx;
  const hx = j.haFX, hy = j.haFY;
  w.bx = hx; w.by = hy; w.tx = hx; w.ty = hy;
  const steel = S.weaponColor ?? '#cfd4dc';
  const o = S.outline;
  const glowC = S.weaponGlow;
  const ga = S.weaponGlowAmt ?? 0;
  switch (S.weapon) {
    case 'blade': case 'greatsword': {
      const big = S.weapon === 'greatsword';
      const L = big ? 30 : 22, Wd = big ? 2.4 : 1.6, grip = big ? 5 : 3.5;
      // Pommel & leather-wrapped grip.
      limbShaded(ctx, hx - dx * grip, hy - dy * grip, hx + dx * 1.2, hy + dy * 1.2, 0.9, 0.9, '#4a3324', o, 0.5);
      if (fine) {
        ctx.beginPath();
        for (let i = 0; i < (big ? 4 : 3); i++) {
          const t = -grip + 1 + i * 1.3;
          ctx.moveTo(hx + dx * t - px * 0.8, hy + dy * t - py * 0.8);
          ctx.lineTo(hx + dx * (t + 0.6) + px * 0.8, hy + dy * (t + 0.6) + py * 0.8);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.35;
        ctx.stroke();
      }
      const pmx = hx - dx * grip, pmy = hy - dy * grip;
      circle(ctx, pmx, pmy, 1.2, '#c9a14e');
      if (fine) circle(ctx, pmx - 0.35, pmy - 0.4, 0.45, 'rgba(255,240,200,0.7)');
      // Cross-guard with flared quillons.
      const gx = hx + dx * 1.6, gy = hy + dy * 1.6, gw = big ? 5.2 : 3.8;
      limbShaded(ctx, gx - px * gw, gy - py * gw, gx + px * gw, gy + py * gw, 0.85, 0.85, '#b8914a', o, 0.5, true);
      if (fine) {
        circle(ctx, gx - px * gw, gy - py * gw, 1.05, '#c9a14e');
        circle(ctx, gx + px * gw, gy + py * gw, 1.05, '#c9a14e');
      }
      // Blade
      const bx0 = gx + dx * 0.6, by0 = gy + dy * 0.6;
      const tx = gx + dx * L, ty = gy + dy * L;
      bevelBlade(ctx, bx0, by0, tx, ty, dx, dy, px, py, Wd, 3, steel, o);
      // Fuller (glows when the blade is blessed).
      ctx.beginPath();
      ctx.moveTo(bx0 + dx * 1.5, by0 + dy * 1.5);
      ctx.lineTo(bx0 + dx * L * 0.65, by0 + dy * L * 0.65);
      ctx.strokeStyle = glowC && ga > 0 ? glowC : 'rgba(30,30,40,0.4)';
      ctx.lineWidth = glowC && ga > 0 ? 0.8 : 0.45;
      ctx.stroke();
      // Ricasso plate.
      if (fine) {
        poly(ctx, [bx0 - px * Wd * 1.05, by0 - py * Wd * 1.05, bx0 + px * Wd * 1.05, by0 + py * Wd * 1.05, bx0 + dx * 1.6 + px * Wd * 0.7, by0 + dy * 1.6 + py * Wd * 0.7, bx0 + dx * 1.6 - px * Wd * 0.7, by0 + dy * 1.6 - py * Wd * 0.7], '#a58340', o, 0.4);
      }
      if (glowC && ga > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const n = 3;
        for (let i = 0; i < n; i++) {
          const t = 0.25 + (i / n) * 0.7;
          glow(ctx, gx + dx * L * t, gy + dy * L * t, 5 + ga * 4, glowC, 0.35 * ga);
        }
        if (S.weaponFlame) {
          for (let i = 0; i < 4; i++) {
            const t = 0.2 + i * 0.22 + Math.sin(time * 7 + i) * 0.03;
            glow(ctx, gx + dx * L * t + px * Math.sin(time * 11 + i * 2) * 1.5, gy + dy * L * t - 2 - Math.abs(Math.sin(time * 9 + i)) * 2, 4, '#fff6dc', 0.6);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      w.bx = bx0; w.by = by0; w.tx = tx; w.ty = ty;
      break;
    }
    case 'spear': {
      const back = 12, fwd = 30;
      const x0 = hx - dx * back, y0 = hy - dy * back, x1 = hx + dx * fwd, y1 = hy + dy * fwd;
      limbShaded(ctx, x0, y0, x1, y1, 0.85, 0.85, '#5b4130', o, 0.5);
      // Butt cap.
      circle(ctx, x0, y0, 1.0, '#8a7040');
      // Binding
      limbShaded(ctx, x1 - dx * 1.8, y1 - dy * 1.8, x1 + dx * 0.8, y1 + dy * 0.8, 1.15, 1.15, '#b8914a', o, 0.4, true);
      // Leaf head, beveled.
      const tx = x1 + dx * 9, ty = y1 + dy * 9;
      const bx = x1 + dx * 0.4, by = y1 + dy * 0.4;
      const litPlus = px * 0.36 + py * -0.93 > 0;
      const lit = shadeable(steel) ? shade(steel, 0.3) : steel, dark = shadeable(steel) ? shade(steel, -0.22) : steel;
      const mx = x1 + dx * 3.2, my = y1 + dy * 3.2;
      poly(ctx, [bx, by, mx + px * 2.4, my + py * 2.4, tx, ty], litPlus ? lit : dark, null);
      poly(ctx, [bx, by, mx - px * 2.4, my - py * 2.4, tx, ty], litPlus ? dark : lit, null);
      poly(ctx, [bx, by, mx + px * 2.4, my + py * 2.4, tx, ty, mx - px * 2.4, my - py * 2.4], null, o, 0.6);
      if (glowC && ga > 0) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x1 + dx * 4, y1 + dy * 4, 7 + ga * 3, glowC, 0.45 * ga);
        ctx.globalCompositeOperation = 'source-over';
      }
      w.bx = x1 - dx * 6; w.by = y1 - dy * 6; w.tx = tx; w.ty = ty;
      break;
    }
    case 'claws': {
      for (let i = -1; i <= 1; i++) {
        const sx = hx + px * i * 0.9, sy = hy + py * i * 0.9;
        poly(ctx, [sx, sy, sx + dx * 6 + px * 0.6, sy + dy * 6 + py * 0.6, sx + dx * 6.5, sy + dy * 6.5, sx + dx * 5.5 - px * 0.4, sy + dy * 5.5 - py * 0.4], '#1a1320', o, 0.4);
        // Glint along each talon.
        ctx.beginPath();
        ctx.moveTo(sx + dx * 1.5, sy + dy * 1.5);
        ctx.lineTo(sx + dx * 5.4, sy + dy * 5.4);
        ctx.strokeStyle = 'rgba(200,170,230,0.35)';
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
      w.tx = hx + dx * 6; w.ty = hy + dy * 6;
      break;
    }
    case 'hammer': {
      limbShaded(ctx, hx - dx * 3, hy - dy * 3, hx + dx * 10, hy + dy * 10, 0.7, 0.7, '#5b4130', o, 0.5);
      const cx = hx + dx * 10, cy = hy + dy * 10;
      poly(ctx, [cx - px * 3.5 - dx, cy - py * 3.5 - dy, cx + px * 3.5 - dx, cy + py * 3.5 - dy, cx + px * 3.5 + dx * 2.5, cy + py * 3.5 + dy * 2.5, cx - px * 3.5 + dx * 2.5, cy - py * 3.5 + dy * 2.5],
        lineGrad(ctx, cx - dx, cy - dy, cx + dx * 2.5, cy + dy * 2.5, '#55555c', 0, 0, true), o, 0.5);
      break;
    }
    case 'maul': {
      // A two-handed war maul: long iron-shod haft, spiked block head.
      const L = 24;
      const x0 = hx - dx * 7, y0 = hy - dy * 7, x1 = hx + dx * L, y1 = hy + dy * L;
      limbShaded(ctx, x0, y0, x1, y1, 1.2, 1.2, '#4a3626', o, 0.5);
      for (const t of [0.35, 0.7]) {
        const rx0 = x0 + (x1 - x0) * t, ry0 = y0 + (y1 - y0) * t;
        limbShaded(ctx, rx0 - dx * 0.8, ry0 - dy * 0.8, rx0 + dx * 0.8, ry0 + dy * 0.8, 1.55, 1.55, '#6a6470', o, 0.4, true);
      }
      const hw = 6.5, hl = 5.5, cx = x1, cy = y1;
      const head = [cx - px * hw - dx * 1.5, cy - py * hw - dy * 1.5, cx + px * hw - dx * 1.5, cy + py * hw - dy * 1.5, cx + px * hw + dx * hl, cy + py * hw + dy * hl, cx - px * hw + dx * hl, cy - py * hw + dy * hl];
      poly(ctx, head, fillOf(steel, () => lineGrad(ctx, cx - px * hw, cy - py * hw, cx + px * hw, cy + py * hw, steel, 0, 0, true)), o, 0.7);
      for (const sg of [-1, 1]) {
        const bx = cx + px * sg * hw, by = cy + py * sg * hw;
        poly(ctx, [bx - dx * 0.5, by - dy * 0.5, bx + dx * 4, by + dy * 4, bx + px * sg * 3.6 + dx * 1.75, by + py * sg * 3.6 + dy * 1.75], shadeable(steel) ? shade(steel, -0.15) : steel, o, 0.5);
      }
      if (fine) {
        ctx.beginPath();
        ctx.moveTo(cx - px * hw * 0.8 + dx * hl * 0.5, cy - py * hw * 0.8 + dy * hl * 0.5);
        ctx.lineTo(cx + px * hw * 0.8 + dx * hl * 0.5, cy + py * hw * 0.8 + dy * hl * 0.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      if (glowC && ga > 0) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, cx + dx * 2, cy + dy * 2, 9 + ga * 6, glowC, 0.4 * ga);
        if (S.weaponFlame) glow(ctx, cx + dx * 2, cy + dy * 2 - 3, 6, '#fff6dc', 0.5 + Math.sin(time * 9) * 0.15);
        ctx.globalCompositeOperation = 'source-over';
      }
      w.bx = x1 - dx * 6; w.by = y1 - dy * 6; w.tx = cx + dx * hl; w.ty = cy + dy * hl;
      break;
    }
    case 'book': {
      poly(ctx, [hx - 3, hy - 4, hx + 3, hy - 4.5, hx + 3, hy + 1, hx - 3, hy + 1.5], vGrad(ctx, '#5a2b2b', -4.5, 1.5, 0.2, -0.25), o, 0.5);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(hx - 2.5, hy - 3.8, 0.8, 5);
      ctx.strokeStyle = '#c9a14e';
      ctx.lineWidth = 0.4;
      ctx.strokeRect(hx - 1.2, hy - 3.2, 3.4, 3.6);
      break;
    }
    case 'staff': {
      limbShaded(ctx, hx - dx * 14, hy - dy * 14, hx + dx * 16, hy + dy * 16, 0.8, 0.8, '#4d3a2a', o, 0.5);
      break;
    }
  }
  return w;
}

/** Shield face: shaded body, inset rim, boss and rivets. */
function shieldFace(ctx: Ctx, path: () => void, x: number, y: number, w: number, h: number, c: string, trim: string, o: string) {
  path();
  ctx.fillStyle = fillOf(c, () => lineGrad(ctx, x - w / 2, y, x + w / 2, y + h, c, 0.22, -0.32));
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = o;
  ctx.stroke();
  // Inset rim.
  ctx.save();
  ctx.translate(x, y + h / 2);
  ctx.scale(0.8, 0.86);
  ctx.translate(-x, -(y + h / 2));
  path();
  ctx.restore();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

function drawOffhand(ctx: Ctx, j: Joints, S: HumanStyle, time: number) {
  const hx = j.haBX, hy = j.haBY;
  const o = S.outline;
  const c = S.offColor ?? '#3a3640';
  const trim = S.offTrim ?? '#6b6470';
  switch (S.offhand) {
    case 'tower': case 'blazing': {
      const w = 7.5 * S.bulk, h = 15 * S.bulk;
      const x = hx + 2.5, y = hy - h * 0.55;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h * 0.8);
        ctx.quadraticCurveTo(x + w / 2, y + h, x, y + h + 1.5);
        ctx.quadraticCurveTo(x - w / 2, y + h, x - w / 2, y + h * 0.8);
        ctx.closePath();
      };
      shieldFace(ctx, path, x, y, w, h, c, trim, o);
      // Emblem cross and boss.
      ctx.strokeStyle = trim;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x, y + h - 2);
      ctx.moveTo(x - w / 2 + 1.6, y + h * 0.4);
      ctx.lineTo(x + w / 2 - 1.6, y + h * 0.4);
      ctx.stroke();
      circle(ctx, x, y + h * 0.4, 1.4, shadeable(trim) ? shade(trim, 0.15) : trim);
      circle(ctx, x - 0.4, y + h * 0.4 - 0.45, 0.5, 'rgba(255,255,255,0.35)');
      if (fine) for (const [rx, ry] of [[-1, 0.1], [1, 0.1], [-1, 0.72], [1, 0.72]]) circle(ctx, x + rx * (w / 2 - 1.1), y + h * ry + 0.9, 0.42, trim);
      if (S.offhand === 'blazing') {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y + h * 0.45, 16, '#fff2c4', 0.55 + Math.sin(time * 6) * 0.1);
        for (let i = 0; i < 3; i++) glow(ctx, x - w / 2 + (i + 0.5) * (w / 3), y - 1 - Math.abs(Math.sin(time * 8 + i * 2)) * 3, 4, '#fff6dc', 0.7);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    }
    case 'kite': {
      const w = 7 * S.bulk, h = 12 * S.bulk;
      const x = hx + 2.2, y = hy - h * 0.5;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h * 0.45);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x - w / 2, y + h * 0.45);
        ctx.closePath();
      };
      shieldFace(ctx, path, x, y, w, h, c, trim, o);
      ctx.strokeStyle = trim;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y + h * 0.38, 2, 0, Math.PI * 2);
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x, y + h - 1.5);
      ctx.stroke();
      break;
    }
    case 'buckler': {
      // Broken buckler: a cracked half-disc.
      ctx.beginPath();
      ctx.arc(hx + 1.5, hy, 4 * S.bulk, -Math.PI * 0.6, Math.PI * 0.8);
      ctx.lineTo(hx + 1.5, hy);
      ctx.closePath();
      ctx.fillStyle = fillOf(c, () => lineGrad(ctx, hx - 2, hy - 4, hx + 4, hy + 4, c, 0.25, -0.3));
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.beginPath();
      ctx.moveTo(hx + 1.5, hy);
      ctx.lineTo(hx + 4.5, hy - 1.5);
      ctx.stroke();
      circle(ctx, hx + 1.5, hy, 0.9, trim);
      break;
    }
    case 'bow': {
      const a = j.offA;
      const [dx, dy] = dir(a);
      const px = -dy, py = dx;
      const L = 15;
      const pull = (S.bowDraw ?? 0) * 7;
      const tipA = [hx + px * L + dx * 3, hy + py * L + dy * 3];
      const tipB = [hx - px * L + dx * 3, hy - py * L + dy * 3];
      // Limbs: thick at the grip, tapering to the nocks.
      ctx.lineCap = 'round';
      for (const [tx, ty] of [tipA, tipB]) {
        const mx = hx + dx * 5 + (tx - hx) * 0.5, my = hy + dy * 5 + (ty - hy) * 0.5;
        ctx.beginPath();
        ctx.moveTo(hx + dx * 1.2, hy + dy * 1.2);
        ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.strokeStyle = o;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.strokeStyle = shadeable(c) ? shade(c, 0.3) : c;
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
      // Grip wrap.
      circle(ctx, hx + dx * 1.2, hy + dy * 1.2, 1.3, shadeable(c) ? shade(c, -0.3) : c);
      // string
      const sx = hx - dx * pull, sy = hy - dy * pull;
      ctx.beginPath();
      ctx.moveTo(tipA[0], tipA[1]);
      ctx.lineTo(sx, sy);
      ctx.lineTo(tipB[0], tipB[1]);
      ctx.strokeStyle = trim;
      ctx.lineWidth = 0.45;
      ctx.stroke();
      if ((S.bowDraw ?? 0) > 0.05) {
        // nocked arrow
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(hx + dx * 6, hy + dy * 6);
        ctx.strokeStyle = S.weaponGlow ?? '#d8cbb0';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        if (S.weaponGlow) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, hx + dx * 6, hy + dy * 6, 5 + (S.bowDraw ?? 0) * 5, S.weaponGlow, 0.8 * (S.bowDraw ?? 0));
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      break;
    }
    case 'lantern': {
      ctx.strokeStyle = '#3a2c20';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx, hy + 2.5);
      ctx.stroke();
      poly(ctx, [hx - 2, hy + 2.5, hx + 2, hy + 2.5, hx + 2.4, hy + 7, hx - 2.4, hy + 7], '#c58d3a', o, 0.5);
      ctx.fillStyle = '#ffe6a8';
      ctx.fillRect(hx - 1.1, hy + 3.4, 2.2, 2.8);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hx, hy + 5, 14, '#ffb35c', 0.8 + Math.sin(time * 12) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
  }
}

/**
 * Ribbon trail behind a swinging weapon. pts = [bx,by,tx,ty, ...] newest first.
 * Each segment fades with age so the smear tapers into the air behind the blade.
 */
export function drawTrail(ctx: Ctx, pts: number[], color: string, core: string, alpha = 1) {
  const n = pts.length / 4;
  if (n < 2) return;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n - 1; i++) {
    const k = i * 4, m = k + 4;
    const fade = Math.pow(1 - i / (n - 1), 1.6);
    const at = (q: number, u: number) => [pts[q] + (pts[q + 2] - pts[q]) * u, pts[q + 1] + (pts[q + 3] - pts[q + 1]) * u];
    // Haze over the outer part of the blade, then a thin hot band at the edge.
    for (const [u0, aMul, col] of [[0.4, 0.2, color], [0.82, 0.75, core]] as [number, number, string][]) {
      const [ax, ay] = at(k, u0), [bx, by] = at(m, u0);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(pts[k + 2], pts[k + 3]);
      ctx.lineTo(pts[m + 2], pts[m + 3]);
      ctx.lineTo(bx, by);
      ctx.closePath();
      ctx.globalAlpha = alpha * aMul * fade;
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

