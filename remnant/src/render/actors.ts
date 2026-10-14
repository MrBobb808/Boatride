// Character rendering on top of the skeleton: tapered limbs, layered armor,
// faces, hair, weapons, shields and bows. One drawer serves Elior, the NPCs,
// the corrupted, and the purified Echoes (which swap to a black-gold palette).

import { type Joints } from './skeleton';
import { limb, limbHighlight, poly, circle, ellipse, glow, shade, rgba, type Ctx } from './draw';

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
  weapon: 'blade' | 'spear' | 'greatsword' | 'none' | 'claws' | 'hammer' | 'book' | 'staff';
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
}

export interface WeaponPts {
  bx: number; by: number; tx: number; ty: number;
}

const tmpW: WeaponPts = { bx: 0, by: 0, tx: 0, ty: 0 };

function dir(a: number) {
  return [Math.sin(a), Math.cos(a)];
}

export function drawHumanoid(ctx: Ctx, j: Joints, S: HumanStyle, time: number, rot = 0): WeaponPts {
  const o = S.outline;
  const B = S.bulk;
  ctx.save();
  if (rot) {
    ctx.translate(j.hipX, j.hipY - 4);
    ctx.rotate(rot);
    ctx.translate(-j.hipX, -(j.hipY - 4));
  }
  const back = (c: string) => shade(c, -0.32);

  // Offhand behind body (bows/shields carried in the back hand are drawn after the torso).
  // Back arm
  drawArm(ctx, j.shBX, j.shBY, j.elBX, j.elBY, j.haBX, j.haBY, S, true, B);
  // Back leg
  drawLeg(ctx, j.hpBX, j.hpBY, j.knBX, j.knBY, j.ftBX, j.ftBY, S, true, B);
  // Coat skirt
  if (S.skirt > 0) {
    const ux = Math.sin(j.torsoA), uy = -Math.cos(j.torsoA);
    const rx = Math.cos(j.torsoA), ry = Math.sin(j.torsoA);
    const hx = j.hipX, hy = j.hipY;
    const L = S.skirt;
    const swayF = Math.sin(j.knFX * 0.15) * 0.5;
    const pts = [
      hx - rx * 4.4 * B + ux * 1, hy - ry * 4.4 * B + uy * 1,
      hx + rx * 4.6 * B + ux * 1, hy + ry * 4.6 * B + uy * 1,
      (j.knFX + hx) / 2 + 3 * B, hy + L * 0.95 + swayF,
      (j.knFX + j.knBX) / 2 + 1, hy + L,
      (j.knBX + hx) / 2 - 3.5 * B, hy + L * 0.92,
    ];
    poly(ctx, pts, back(S.coat), o, 0.7);
    if (S.trim) {
      ctx.beginPath();
      ctx.moveTo(pts[4], pts[5]);
      ctx.lineTo(pts[6], pts[7]);
      ctx.lineTo(pts[8], pts[9]);
      ctx.strokeStyle = S.trim;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }
  // Torso
  drawTorso(ctx, j, S, B);
  // Offhand item (shield / bow) held by the back arm sits in front of the torso.
  if (S.offhand !== 'none') drawOffhand(ctx, j, S, time);
  // Front leg
  drawLeg(ctx, j.hpFX, j.hpFY, j.knFX, j.knFY, j.ftFX, j.ftFY, S, false, B);
  // Head
  drawHead(ctx, j, S, time);
  // Weapon then front arm (hand closes over the grip)
  const w = drawWeapon(ctx, j, S, time);
  drawArm(ctx, j.shFX, j.shFY, j.elFX, j.elFY, j.haFX, j.haFY, S, false, B);
  if (S.plate && S.plate.tier >= 1) drawPauldron(ctx, j, S);
  ctx.restore();
  if (rot) {
    // Weapon trail points are reported in un-rotated space; approximate by rotating them.
    const cx = j.hipX, cy = j.hipY - 4, c = Math.cos(rot), s = Math.sin(rot);
    const rx = (x: number, y: number) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
    const [bx, by] = rx(w.bx, w.by);
    const [tx, ty] = rx(w.tx, w.ty);
    w.bx = bx; w.by = by; w.tx = tx; w.ty = ty;
  }
  return w;
}

function drawLeg(ctx: Ctx, hx: number, hy: number, kx: number, ky: number, fx: number, fy: number, S: HumanStyle, isBack: boolean, B: number) {
  const pants = isBack ? shade(S.pants, -0.32) : S.pants;
  const boot = isBack ? shade(S.boots, -0.3) : S.boots;
  limb(ctx, hx, hy, kx, ky, 3.0 * B, 2.4 * B, pants, S.outline, 0.75);
  // Boot covers the shin.
  limb(ctx, kx, ky, fx, fy, 2.35 * B, 2.0 * B, boot, S.outline, 0.75);
  // Foot
  const ang = Math.atan2(fy - ky, fx - kx);
  const fwd = Math.cos(ang) > -0.2 ? 1 : 1;
  poly(ctx, [fx - 2.2 * B, fy - 1.6, fx + 3.6 * B * fwd, fy - 0.6, fx + 3.8 * B * fwd, fy + 0.6, fx - 2.4 * B, fy + 0.6], boot, S.outline, 0.7);
  if (!isBack) limbHighlight(ctx, kx, ky, fx, fy, 2.0, 'rgba(255,255,255,0.10)');
  if (S.plate && S.plate.tier >= 1) {
    // Greave plate over the shin.
    limb(ctx, kx + (fx - kx) * 0.1, ky + (fy - ky) * 0.1, kx + (fx - kx) * 0.75, ky + (fy - ky) * 0.75, 2.2 * B, 1.8 * B, isBack ? S.plate.dark : S.plate.c, S.outline, 0.6);
    circle(ctx, kx, ky, 2.1 * B, isBack ? S.plate.dark : S.plate.hi);
  }
}

function drawArm(ctx: Ctx, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, S: HumanStyle, isBack: boolean, B: number) {
  const sleeve = isBack ? shade(S.coat, -0.35) : S.coat;
  const glove = isBack ? shade(S.glove, -0.3) : S.glove;
  limb(ctx, sx, sy, ex, ey, 2.5 * B, 2.1 * B, sleeve, S.outline, 0.75);
  limb(ctx, ex, ey, hx, hy, 2.1 * B, 1.8 * B, glove, S.outline, 0.75);
  if (!isBack) limbHighlight(ctx, sx, sy, ex, ey, 2.2, 'rgba(255,255,255,0.08)');
  if (S.plate && S.plate.tier >= 2) {
    limb(ctx, ex + (hx - ex) * 0.2, ey + (hy - ey) * 0.2, ex + (hx - ex) * 0.8, ey + (hy - ey) * 0.8, 2.0 * B, 1.7 * B, isBack ? S.plate.dark : S.plate.c, S.outline, 0.55);
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
  circle(ctx, hx, hy, 1.9 * B, glove);
}

function drawTorso(ctx: Ctx, j: Joints, S: HumanStyle, B: number) {
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
  poly(ctx, pts, S.coat, S.outline, 0.8);
  // Front shading stripe (key light from upper-left)
  const sh = [...P(len * 0.1, 3.2 * B), ...P(len * 0.85, 3.6 * B), ...P(len * 0.9, 4.6 * B), ...P(len * 0.5, 5.0 * B), ...P(-0.5, 4.4 * B)];
  poly(ctx, sh, S.coatDark, null);
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
  if (S.plate) {
    const t = S.plate.tier;
    const cp = [...P(len * 0.35, -4.0 * B), ...P(len * 0.3, 4.4 * B), ...P(len * 0.62, 5.0 * B), ...P(len * 0.92, 4.2 * B), ...P(len * 0.92, -3.8 * B)];
    poly(ctx, cp, S.plate.c, S.outline, 0.7);
    const hl = [...P(len * 0.62, -2), ...P(len * 0.62, 3.5), ...P(len * 0.88, 3.2), ...P(len * 0.88, -2)];
    poly(ctx, hl, rgba(S.plate.hi, 0.35), null);
    if (t >= 2) {
      ctx.beginPath();
      const [a1, b1] = P(len * 0.35, 0.2);
      const [a2, b2] = P(len * 0.9, 0.4);
      ctx.moveTo(a1, b1);
      ctx.lineTo(a2, b2);
      ctx.strokeStyle = S.plate.hi;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Covenant sigil on the breastplate.
      const [sx, sy] = P(len * 0.66, 1.0);
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
    const bk = P(1.6, 1.6);
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(bk[0] - 0.9, bk[1] - 0.9, 1.8, 1.8);
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
    // Scarf wrap around the neck.
    const [nx, ny] = P(len * 0.97, 0.3);
    ellipse(ctx, nx, ny, 3.6 * B, 2.0, a, S.scarf);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = S.outline;
    ctx.stroke();
  }
}

function drawPauldron(ctx: Ctx, j: Joints, S: HumanStyle) {
  const p = S.plate!;
  const a = Math.atan2(j.elFY - j.shFY, j.elFX - j.shFX);
  ctx.save();
  ctx.translate(j.shFX, j.shFY);
  ctx.rotate(a - Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 3.9 * S.bulk, 3.1, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = p.c;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = S.outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 3.9 * S.bulk, 3.1, 0, Math.PI * 1.15, Math.PI * 1.85);
  ctx.strokeStyle = p.tier >= 2 ? p.hi : rgba(p.hi, 0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

function drawHead(ctx: Ctx, j: Joints, S: HumanStyle, time: number) {
  const hx = j.headX, hy = j.headY, a = j.headA;
  const o = S.outline;
  // Neck
  limb(ctx, j.neckX, j.neckY, hx - Math.sin(a) * 2.5, hy + Math.cos(a) * 2.5, 1.6, 1.5, shade(S.skin, -0.15), o, 0.6);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  const R = 4.5;
  // Hood behind head
  if (S.helm === 'hood_up' || S.helm === 'archer' || S.helm === 'husk') {
    const hc = S.helmColor ?? S.coat;
    poly(ctx, [-5.8, 3.5, -6.2, -2.5, -3.5, -6.5, 1.5, -6.6, 5.2, -3.4, 5.6, 1.6, 3.5, 4.5], shade(hc, -0.15), o, 0.7);
  }
  if (S.hair && S.hairKind === 'long') {
    poly(ctx, [-4.5, -3.5, -6.5, 2, -6, 9, -3, 10, -1.5, 3], S.hair, o, 0.6);
  }
  if (S.hair && S.hairKind === 'braid') {
    poly(ctx, [-4.5, -2.5, -5.5, 2, -5, 6, -6, 10, -4, 11, -3.5, 6, -2.5, 2], S.hair, o, 0.6);
  }
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
  ctx.fillStyle = S.skin;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = o;
  ctx.stroke();
  // Cheek shade
  ctx.beginPath();
  ctx.moveTo(-R * 0.95, 0);
  ctx.quadraticCurveTo(-R * 0.4, R * 1.0, R * 0.25, R * 1.0);
  ctx.quadraticCurveTo(-R * 0.3, R * 0.5, -R * 0.4, -R * 0.2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
  if (S.beard) {
    poly(ctx, [R * 1.0, R * 0.35, R * 0.9, R * 1.2, R * 0.2, R * 1.6, -R * 0.5, R * 0.9, -R * 0.2, R * 0.4, R * 0.5, R * 0.6], S.beard, o, 0.5);
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
      ctx.fillStyle = '#f3ece0';
      ctx.fillRect(ex - 0.8, ey - 0.55, 1.7, 1.1);
      ctx.fillStyle = '#1d1712';
      ctx.fillRect(ex + 0.1, ey - 0.55, 0.8, 1.1);
      // brow
      ctx.strokeStyle = 'rgba(20,14,10,0.8)';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(ex - 1.2, ey - 1.5);
      ctx.lineTo(ex + 1.3, ey - 1.2);
      ctx.stroke();
    }
  }
  // Hair
  if (S.hair && (S.hairKind === 'spiky' || S.hairKind === 'short' || S.hairKind === 'long' || S.hairKind === 'braid')) {
    const sway = Math.sin(time * 2.2) * 0.3;
    if (S.hairKind === 'spiky') {
      poly(ctx, [
        R * 1.05, -R * 0.35, R * 0.7, -R * 1.25, -R * 0.1, -R * 1.45 - 0.5, -R * 0.9, -R * 1.2,
        -R * 1.7 + sway, -R * 1.05, -R * 1.1, -R * 0.6, -R * 1.9 + sway, -R * 0.25, -R * 1.05, R * 0.05,
        -R * 1.5 + sway, R * 0.55, -R * 0.75, R * 0.35, -R * 0.35, -R * 0.35, R * 0.15, -R * 0.75, R * 0.45, -R * 0.45,
      ], S.hair, o, 0.6);
      // fringe strand
      poly(ctx, [R * 0.75, -R * 0.95, R * 1.15, -R * 0.15, R * 0.55, -R * 0.55], S.hair, null);
    } else {
      poly(ctx, [R * 1.0, -R * 0.4, R * 0.6, -R * 1.15, -R * 0.3, -R * 1.2, -R * 1.05, -R * 0.6, -R * 1.05, R * 0.3, -R * 0.4, -R * 0.2, R * 0.3, -R * 0.65], S.hair, o, 0.6);
    }
  }
  // Helm / hood
  switch (S.helm) {
    case 'hood_down':
      break;
    case 'hood_up': case 'archer': case 'husk': {
      const hc = S.helmColor ?? S.coat;
      poly(ctx, [-5.6, 2.5, -5.4, -3.2, -2.4, -6.3, 2.4, -6.3, 5.4, -3.6, 5.8, -0.6, 4.2, -1.6, 2.2, -4.1, -1.2, -4.4, -3.6, -1.2, -3.2, 3.2], hc, o, 0.7);
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
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = shade(c, 0.3);
      ctx.fillRect(-R * 1.15, -R * 0.55, R * 2.3, 0.9);
      break;
    }
    case 'visor': case 'sentinel': {
      const c = S.helmColor ?? '#2c2a30';
      poly(ctx, [-R * 1.05, R * 0.9, -R * 1.15, -R * 0.6, -R * 0.4, -R * 1.35, R * 0.7, -R * 1.25, R * 1.25, -R * 0.4, R * 1.25, R * 0.95, R * 0.4, R * 1.2, -R * 0.6, R * 1.1], c, o, 0.75);
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
        // Plume / crest of white flame for evolved Echoes.
        const fl = Math.sin(time * 9) * 0.6;
        poly(ctx, [-R * 0.4, -R * 1.3, -R * 1.6, -R * 2.2 + fl, -R * 2.6, -R * 1.2 + fl, -R * 0.9, -R * 0.9], S.crest, null);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, -R * 1.4, -R * 1.6, 6, S.crest, 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    }
    case 'crown': {
      poly(ctx, [-R * 0.95, -R * 0.75, -R * 1.1, -R * 1.75, -R * 0.5, -R * 1.15, 0, -R * 1.95, R * 0.5, -R * 1.15, R * 1.1, -R * 1.75, R * 0.95, -R * 0.75], '#e2b24c', o, 0.6);
      circle(ctx, 0, -R * 1.05, 0.8, '#b0233a');
      break;
    }
    case 'oversized': {
      const c = S.helmColor ?? '#7a776f';
      ctx.beginPath();
      ctx.ellipse(-0.3, -R * 0.35, R * 1.32, R * 1.05, -0.12, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = shade(c, 0.25);
      ctx.fillRect(-R * 1.4, -R * 0.45, R * 2.8, 1.0);
      break;
    }
    case 'mask': {
      ctx.beginPath();
      ctx.ellipse(R * 0.25, -R * 0.1, R * 0.95, R * 1.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e9e2d6';
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
      break;
    }
  }
  ctx.restore();
}

function drawWeapon(ctx: Ctx, j: Joints, S: HumanStyle, time: number): WeaponPts {
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
      // pommel & grip
      limb(ctx, hx - dx * grip, hy - dy * grip, hx + dx * 1.2, hy + dy * 1.2, 0.9, 0.9, '#4a3324', o, 0.5);
      circle(ctx, hx - dx * grip, hy - dy * grip, 1.1, '#c9a14e');
      // guard
      const gx = hx + dx * 1.6, gy = hy + dy * 1.6, gw = big ? 5.2 : 3.8;
      limb(ctx, gx - px * gw, gy - py * gw, gx + px * gw, gy + py * gw, 0.8, 0.8, '#b8914a', o, 0.5);
      // blade
      const bx0 = gx + dx * 0.6, by0 = gy + dy * 0.6;
      const tx = gx + dx * L, ty = gy + dy * L;
      const pts = [
        bx0 - px * Wd, by0 - py * Wd, bx0 + px * Wd, by0 + py * Wd,
        tx - dx * 3 + px * Wd * 0.9, ty - dy * 3 + py * Wd * 0.9, tx, ty, tx - dx * 3 - px * Wd * 0.9, ty - dy * 3 - py * Wd * 0.9,
      ];
      poly(ctx, pts, steel, o, 0.6);
      // edge highlight + fuller
      ctx.beginPath();
      ctx.moveTo(bx0 - px * Wd * 0.55, by0 - py * Wd * 0.55);
      ctx.lineTo(tx - dx * 3 - px * Wd * 0.5, ty - dy * 3 - py * Wd * 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx0 + dx * 1.5, by0 + dy * 1.5);
      ctx.lineTo(bx0 + dx * L * 0.65, by0 + dy * L * 0.65);
      ctx.strokeStyle = glowC && ga > 0 ? glowC : 'rgba(40,40,50,0.45)';
      ctx.lineWidth = glowC && ga > 0 ? 0.8 : 0.5;
      ctx.stroke();
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
      limb(ctx, x0, y0, x1, y1, 0.85, 0.85, '#5b4130', o, 0.5);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = 'rgba(255,230,180,0.15)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      // binding
      limb(ctx, x1 - dx * 1.5, y1 - dy * 1.5, x1 + dx * 0.8, y1 + dy * 0.8, 1.1, 1.1, '#b8914a', o, 0.4);
      // leaf head
      const tx = x1 + dx * 9, ty = y1 + dy * 9;
      poly(ctx, [x1, y1, x1 + dx * 3 + px * 2.3, y1 + dy * 3 + py * 2.3, tx, ty, x1 + dx * 3 - px * 2.3, y1 + dy * 3 - py * 2.3], steel, o, 0.6);
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
      }
      w.tx = hx + dx * 6; w.ty = hy + dy * 6;
      break;
    }
    case 'hammer': {
      limb(ctx, hx - dx * 3, hy - dy * 3, hx + dx * 10, hy + dy * 10, 0.7, 0.7, '#5b4130', o, 0.5);
      const cx = hx + dx * 10, cy = hy + dy * 10;
      poly(ctx, [cx - px * 3.5 - dx, cy - py * 3.5 - dy, cx + px * 3.5 - dx, cy + py * 3.5 - dy, cx + px * 3.5 + dx * 2.5, cy + py * 3.5 + dy * 2.5, cx - px * 3.5 + dx * 2.5, cy - py * 3.5 + dy * 2.5], '#55555c', o, 0.5);
      break;
    }
    case 'book': {
      poly(ctx, [hx - 3, hy - 4, hx + 3, hy - 4.5, hx + 3, hy + 1, hx - 3, hy + 1.5], '#5a2b2b', o, 0.5);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(hx - 2.5, hy - 3.8, 0.8, 5);
      break;
    }
    case 'staff': {
      limb(ctx, hx - dx * 14, hy - dy * 14, hx + dx * 16, hy + dy * 16, 0.8, 0.8, '#4d3a2a', o, 0.5);
      break;
    }
  }
  return w;
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
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h * 0.8);
      ctx.quadraticCurveTo(x + w / 2, y + h, x, y + h + 1.5);
      ctx.quadraticCurveTo(x - w / 2, y + h, x - w / 2, y + h * 0.8);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = o;
      ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 1, y + 1);
      ctx.lineTo(x + w / 2 - 1, y + 1);
      ctx.lineTo(x + w / 2 - 1, y + h * 0.78);
      ctx.stroke();
      // emblem
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x, y + h - 2);
      ctx.moveTo(x - w / 2 + 1.6, y + h * 0.4);
      ctx.lineTo(x + w / 2 - 1.6, y + h * 0.4);
      ctx.stroke();
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
      poly(ctx, [x - w / 2, y, x + w / 2, y, x + w / 2, y + h * 0.45, x, y + h, x - w / 2, y + h * 0.45], c, o, 0.8);
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
      // Broken buckler — a cracked half-disc.
      ctx.beginPath();
      ctx.arc(hx + 1.5, hy, 4 * S.bulk, -Math.PI * 0.6, Math.PI * 0.8);
      ctx.lineTo(hx + 1.5, hy);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = o;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.beginPath();
      ctx.moveTo(hx + 1.5, hy);
      ctx.lineTo(hx + 4.5, hy - 1.5);
      ctx.stroke();
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
      ctx.beginPath();
      ctx.moveTo(tipA[0], tipA[1]);
      ctx.quadraticCurveTo(hx + dx * 8, hy + dy * 8, tipB[0], tipB[1]);
      ctx.strokeStyle = o;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.3;
      ctx.stroke();
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
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hx, hy + 5, 14, '#ffb35c', 0.8 + Math.sin(time * 12) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
  }
}

/** Ribbon trail behind a swinging weapon. pts = [bx,by,tx,ty, ...] newest first. */
export function drawTrail(ctx: Ctx, pts: number[], color: string, core: string, alpha = 1) {
  const n = pts.length / 4;
  if (n < 2) return;
  ctx.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t = pass === 0 ? 0 : 0.45;
      const x = pts[i * 4] + (pts[i * 4 + 2] - pts[i * 4]) * t;
      const y = pts[i * 4 + 1] + (pts[i * 4 + 3] - pts[i * 4 + 1]) * t;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(pts[i * 4 + 2], pts[i * 4 + 3]);
    ctx.closePath();
    ctx.globalAlpha = alpha * (pass === 0 ? 0.35 : 0.75);
    ctx.fillStyle = pass === 0 ? color : core;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
