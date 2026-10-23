// Chapter II environment art: the plain of Shinar at dusk (mud-brick kilns,
// date palms, scaffolds, and the Tower always on the horizon) and the
// Tower's interior (brick vaults, crimson banners, light shafts, pitch).

import { makeCanvas, glow, rgba, shade, mix, poly, circle, ellipse, type Ctx } from './draw';
import { RNG, hash2, fbm1 } from '../core/math';
import { TILE, type EntDef } from '../game/tiles';
import type { BiomePal, Layer, ParallaxSteps } from './environment';

// ---------------------------------------------------------------- sky

export function drawDuskSky(ctx: Ctx, pal: BiomePal, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(0.55, pal.sky[1]);
  g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A great low sun, half lost in haze.
  const sx = w * 0.3, sy = h * 0.66, sr = h * 0.11;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, sx, sy, sr * 9, '#c0502a', 0.35);
  glow(ctx, sx, sy, sr * 3.5, '#ffb36a', 0.55);
  ctx.globalCompositeOperation = 'source-over';
  circle(ctx, sx, sy, sr, '#ffcf8a');
  circle(ctx, sx, sy, sr * 0.82, '#ffe2b0');
  // Haze bands drifting across the sun.
  for (let i = 0; i < 5; i++) {
    const y = h * (0.5 + i * 0.06);
    const x = ((t * (3 + i * 1.5)) % (w + 600)) - 300;
    ctx.fillStyle = rgba(i % 2 ? '#7a3428' : '#5a2228', 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, 320, 6 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse((x + w * 0.55) % (w + 600) - 200, y + 14, 240, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // First stars.
  for (let i = 0; i < 26; i++) {
    const x = hash2(i, 3) * w, y = hash2(i, 7) * h * 0.35;
    ctx.fillStyle = rgba('#fff3dc', 0.3 + 0.3 * Math.sin(t * 2 + i));
    ctx.fillRect(x, y, 1.4, 1.4);
  }
}

// ---------------------------------------------------------------- parallax

export function* buildParallaxCh2(biome: 'plain' | 'tower', pal: BiomePal, seed: number, viewH: number, res: number): ParallaxSteps {
  const layers: Layer[] = [];
  const rng = new RNG(seed);
  const W = 1024;
  const H = Math.round(viewH * 1.6);
  const mk = (fx: number, fy: number, draw: (ctx: Ctx, w: number, h: number) => void, r = res) => {
    const m = makeCanvas(W * r, H * r);
    m.ctx.scale(r, r);
    draw(m.ctx, W, H);
    const l: Layer = { c: m.c, w: W, h: H, fx, fy, oy: 0, res: r };
    layers.push(l);
    return l;
  };
  if (biome === 'plain') {
    // The Tower on the horizon, tier upon tier, scaffolded and lit.
    yield mk(0.05, 0.03, (ctx, w, h) => {
      ctx.fillStyle = pal.far;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.6 + fbm1(x / 260, seed, 3) * h * 0.08);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      const cx = w * 0.62, base = h * 0.64;
      const tiers = 9;
      for (let i = 0; i < tiers; i++) {
        const tw = 240 - i * 22, th = 34 - i * 1.2;
        const ty = base - i * th - th;
        const col = mix(pal.far, pal.mid, i / tiers * 0.5);
        ctx.fillStyle = col;
        ctx.fillRect(cx - tw / 2, ty, tw, th + 1);
        // arcades along each tier
        ctx.fillStyle = rgba('#000000', 0.35);
        for (let a = cx - tw / 2 + 8; a < cx + tw / 2 - 8; a += 14) {
          ctx.beginPath();
          ctx.arc(a + 4, ty + th * 0.55, 3.5, Math.PI, 0);
          ctx.rect(a + 0.5, ty + th * 0.55, 7, th * 0.4);
          ctx.fill();
        }
        // a few lit windows
        for (let k = 0; k < 3; k++) {
          if (rng.chance(0.6)) {
            ctx.fillStyle = rgba('#ff9a4a', 0.65);
            ctx.fillRect(cx - tw / 2 + rng.range(10, tw - 14), ty + th * 0.5, 2.5, 4);
          }
        }
        // the spiral ramp
        ctx.strokeStyle = rgba('#000000', 0.25);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - tw / 2, ty + th);
        ctx.lineTo(cx + tw / 2, ty + 2);
        ctx.stroke();
      }
      // Unfinished summit: scaffolds against the sky.
      const top = base - tiers * 34 + 6;
      ctx.strokeStyle = mix(pal.far, '#000000', 0.2);
      ctx.lineWidth = 1.5;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 10, top);
        ctx.lineTo(cx + i * 10 + rng.range(-3, 3), top - rng.range(24, 60));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 32, top - 20);
      ctx.lineTo(cx + 32, top - 22);
      ctx.moveTo(cx - 26, top - 40);
      ctx.lineTo(cx + 24, top - 42);
      ctx.stroke();
    }, res * 0.6);
    // Kiln domes trailing smoke, ruined walls, palms.
    yield mk(0.22, 0.08, (ctx, w, h) => {
      const base = h * 0.74;
      ctx.fillStyle = pal.mid;
      ctx.fillRect(0, base, w, h - base);
      let x = 0;
      while (x < w) {
        const kind = rng.int(0, 2);
        if (kind === 0) {
          const r = rng.range(18, 30);
          ctx.fillStyle = pal.mid;
          ctx.beginPath();
          ctx.arc(x + r, base, r, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = rgba('#ff8a3d', 0.5);
          ctx.beginPath();
          ctx.arc(x + r, base, r * 0.3, Math.PI, 0);
          ctx.fill();
          // smoke column
          for (let s = 0; s < 6; s++) {
            ctx.fillStyle = rgba('#2a1416', 0.18 - s * 0.02);
            ctx.beginPath();
            ctx.ellipse(x + r + s * 4, base - r - 10 - s * 16, 8 + s * 3, 7 + s * 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          x += r * 2 + rng.range(20, 50);
        } else if (kind === 1) {
          palm(ctx, x + 10, base, rng.range(50, 80), pal.mid, rng);
          x += rng.range(30, 50);
        } else {
          const bw = rng.range(40, 90), bh = rng.range(16, 40);
          ctx.fillStyle = pal.mid;
          ctx.fillRect(x, base - bh, bw, bh + 1);
          poly(ctx, [x, base - bh, x + bw * 0.3, base - bh - rng.range(4, 14), x + bw * 0.6, base - bh + 2, x + bw, base - bh - rng.range(0, 10), x + bw, base - bh], pal.mid);
          x += bw + rng.range(10, 40);
        }
      }
    });
    // Near: scaffolds, brick stacks and camp tents in silhouette.
    yield mk(0.48, 0.18, (ctx, w, h) => {
      const base = h * 0.85;
      ctx.fillStyle = pal.near;
      ctx.fillRect(0, base, w, h - base);
      let x = 0;
      while (x < w) {
        if (rng.chance(0.45)) {
          const sw = rng.range(40, 70), sh = rng.range(50, 90);
          ctx.strokeStyle = pal.near;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, base); ctx.lineTo(x, base - sh);
          ctx.moveTo(x + sw, base); ctx.lineTo(x + sw, base - sh);
          for (let yy = base - 18; yy > base - sh; yy -= 20) {
            ctx.moveTo(x - 4, yy); ctx.lineTo(x + sw + 4, yy);
          }
          ctx.moveTo(x, base); ctx.lineTo(x + sw, base - sh * 0.5);
          ctx.stroke();
          x += sw + rng.range(20, 60);
        } else if (rng.chance(0.5)) {
          poly(ctx, [x, base, x + 22, base - 26, x + 44, base], pal.near);
          x += rng.range(60, 90);
        } else {
          palm(ctx, x + 10, base, rng.range(60, 90), pal.near, rng);
          x += rng.range(40, 70);
        }
      }
    });
  } else {
    // Tower interior: vaulted brick, a spiral stair rising out of sight, light shafts.
    yield mk(0.12, 0.06, (ctx, w, h) => {
      ctx.fillStyle = pal.far;
      for (let x = 0; x < w; x += 170) {
        ctx.fillRect(x + 60, h * 0.1, 34, h * 0.9);
        ctx.beginPath();
        ctx.arc(x + 160, h * 0.28, 66, Math.PI, 0);
        ctx.lineWidth = 18;
        ctx.strokeStyle = pal.far;
        ctx.stroke();
      }
      // a spiral stair climbing the far wall
      ctx.strokeStyle = mix(pal.far, '#000000', 0.25);
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const x = w * 0.5 + Math.sin(u * Math.PI * 6) * 120;
        const y = h * (0.95 - u * 0.9);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let x = 0; x < w; x += 340) {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
        g.addColorStop(0, rgba('#ffb36a', 0.2));
        g.addColorStop(1, rgba('#ffb36a', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + 120, 0);
        ctx.lineTo(x + 150, 0);
        ctx.lineTo(x + 220, h * 0.8);
        ctx.lineTo(x + 160, h * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    }, res * 0.6);
    yield mk(0.36, 0.16, (ctx, w, h) => {
      ctx.fillStyle = pal.mid;
      for (let x = 0; x < w; x += 150) {
        ctx.fillRect(x + 18, 0, 26, h);
        ctx.fillRect(x + 12, h * 0.22, 38, 7);
        ctx.fillRect(x + 12, h * 0.86, 38, 9);
        // a hanging banner between pillars
        if (rng.chance(0.65)) {
          const bx = x + 90, bh = rng.range(60, 110);
          poly(ctx, [bx - 13, h * 0.12, bx + 13, h * 0.12, bx + 13, h * 0.12 + bh, bx, h * 0.12 + bh + 12, bx - 13, h * 0.12 + bh], rgba('#5a1014', 0.55));
          ctx.fillStyle = rgba('#c9a04a', 0.35);
          ctx.fillRect(bx - 1, h * 0.12 + 10, 2, bh - 20);
        }
        if (rng.chance(0.4)) {
          ctx.fillStyle = rgba('#ff9a4a', 0.16);
          ctx.fillRect(x + 70, h * 0.5, 40, 50);
          ctx.fillStyle = pal.mid;
        }
      }
    });
  }
  return layers;
}

function palm(ctx: Ctx, x: number, base: number, h: number, col: string, rng: RNG) {
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineCap = 'round';
  const lean = rng.range(-0.25, 0.25);
  const tx = x + Math.sin(lean) * h, ty = base - Math.cos(lean) * h;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + Math.sin(lean) * h * 0.3, base - h * 0.6, tx, ty);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.45 + rng.range(-0.1, 0.1);
    const L = h * rng.range(0.32, 0.45);
    const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.35;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 6, ex, ey);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- props

/** Chapter II props. Returns false for kinds it does not know. */
export function drawPropCh2(ctx: Ctx, e: Extract<EntDef, { t: 'decor' }>, pal: BiomePal, seed: number): boolean {
  const x = e.x * TILE, y = e.y * TILE;
  const o = '#08060a';
  const rng = new RNG(seed + Math.floor(e.x * 31 + e.y * 7));
  const brick = (bx: number, by: number, bw: number, bh: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = rgba('#000000', 0.35);
    ctx.lineWidth = 0.6;
    for (let yy = by; yy < by + bh; yy += 4) {
      ctx.beginPath();
      ctx.moveTo(bx, yy);
      ctx.lineTo(bx + bw, yy);
      ctx.stroke();
      const off = ((yy - by) / 4) % 2 ? 3 : 0;
      for (let xx = bx + off; xx < bx + bw; xx += 6) {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + 4);
        ctx.stroke();
      }
    }
  };
  switch (e.k) {
    case 'kiln': {
      // A beehive kiln of mud brick with a glowing mouth.
      const r = (e.w ?? 3) * TILE * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.closePath();
      ctx.clip();
      brick(x - r, y - r, r * 2, r, shade(pal.stone, -0.1));
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.7, 0, x, y - r * 0.4, r * 1.2);
      g.addColorStop(0, 'rgba(255,220,160,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.strokeStyle = o;
      ctx.lineWidth = 1;
      ctx.stroke();
      // mouth
      ctx.fillStyle = '#1a0806';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.32, Math.PI, 0);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 2, r * 0.6, '#ff7a2a', 0.9);
      ctx.globalCompositeOperation = 'source-over';
      // chimney
      brick(x - 3, y - r - 8, 6, 9, shade(pal.stone, -0.2));
      return true;
    }
    case 'brick_stack': {
      const w = (e.w ?? 2) * TILE;
      ctx.fillStyle = '#3a2614';
      ctx.fillRect(x - w / 2, y - 3, w, 3);
      const rows = e.v ?? 3;
      for (let r = 0; r < rows; r++) {
        const rw = w - 4 - r * 4;
        brick(x - rw / 2, y - 3 - (r + 1) * 6, rw, 6, mix(pal.stone, '#8a4a2a', 0.35));
      }
      return true;
    }
    case 'scaffold': {
      const w = (e.w ?? 3) * TILE, h = (e.h ?? 6) * TILE;
      ctx.strokeStyle = '#3a2614';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h);
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y - h);
      for (let yy = y - 22; yy > y - h; yy -= 26) {
        ctx.moveTo(x - w / 2 - 3, yy); ctx.lineTo(x + w / 2 + 3, yy);
      }
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let yy = y; yy > y - h + 26; yy -= 26) {
        ctx.moveTo(x - w / 2, yy); ctx.lineTo(x + w / 2, yy - 26);
      }
      ctx.stroke();
      // rope and a hanging bucket
      ctx.strokeStyle = '#6a5034';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x + w / 4, y - h + 4);
      ctx.lineTo(x + w / 4, y - h * 0.45);
      ctx.stroke();
      poly(ctx, [x + w / 4 - 3, y - h * 0.45, x + w / 4 + 3, y - h * 0.45, x + w / 4 + 2, y - h * 0.45 + 5, x + w / 4 - 2, y - h * 0.45 + 5], '#4a3220', o, 0.5);
      return true;
    }
    case 'palm': {
      palm(ctx, x, y, (e.h ?? 6) * TILE, '#1a0e10', rng);
      return true;
    }
    case 'pitch_pot': {
      poly(ctx, [x - 10, y - 14, x + 10, y - 14, x + 8, y, x - 8, y], '#2a1e18', o, 0.8);
      ellipse(ctx, x, y - 14, 10, 2.5, 0, '#0a0604');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 15, 8, '#ff6a2a', 0.4);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#1a1210';
      ctx.fillRect(x - 12, y - 2, 24, 2);
      return true;
    }
    case 'tower_door': {
      // The great gate: crimson leaves banded in bronze under a brick arch.
      const w = (e.w ?? 6) * TILE, h = (e.h ?? 8) * TILE;
      brick(x - w / 2 - 12, y - h - 14, w + 24, h + 14, shade(pal.stone, -0.15));
      ctx.fillStyle = '#0a0404';
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x - w / 2, y - h + w / 2);
      ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(x + w / 2, y);
      ctx.closePath();
      ctx.fill();
      const leaf = (sx: number) => {
        poly(ctx, [sx, y, sx, y - h + w / 2 + 6, sx + (w / 2 - 6) * Math.sign(x - sx || 1), y - h + w / 2 - 4, sx + (w / 2 - 6) * Math.sign(x - sx || 1), y], '#4a0c10', o, 1);
      };
      leaf(x - w / 2 + 4);
      leaf(x + w / 2 - 4);
      ctx.strokeStyle = '#a8823a';
      ctx.lineWidth = 1.6;
      for (let yy = y - 10; yy > y - h + w / 2; yy -= 18) {
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 4, yy);
        ctx.lineTo(x + w / 2 - 4, yy);
        ctx.stroke();
      }
      circle(ctx, x - 6, y - h * 0.45, 2.2, '#c9a04a');
      circle(ctx, x + 6, y - h * 0.45, 2.2, '#c9a04a');
      return true;
    }
    case 'relief': {
      // A wall of carved script where every line is in a different hand.
      const w = (e.w ?? 6) * TILE, h = (e.h ?? 4) * TILE;
      ctx.fillStyle = shade(pal.stone, -0.25);
      ctx.fillRect(x - w / 2, y - h, w, h);
      ctx.strokeStyle = rgba('#000000', 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2, y - h, w, h);
      for (let row = 0; row < 5; row++) {
        const ry = y - h + 8 + row * (h - 12) / 5;
        let cx = x - w / 2 + 6;
        const style = row % 4;
        ctx.strokeStyle = rgba(row === 2 ? '#e2b85a' : '#c8a888', 0.55);
        ctx.lineWidth = 0.9;
        while (cx < x + w / 2 - 8) {
          ctx.beginPath();
          if (style === 0) { ctx.moveTo(cx, ry); ctx.lineTo(cx + 3, ry + 5); ctx.lineTo(cx + 6, ry); }
          else if (style === 1) { ctx.arc(cx + 3, ry + 3, 2.4, 0, Math.PI * 1.5); }
          else if (style === 2) { ctx.moveTo(cx, ry + 5); ctx.lineTo(cx + 2, ry); ctx.lineTo(cx + 4, ry + 5); ctx.moveTo(cx + 1, ry + 3); ctx.lineTo(cx + 3, ry + 3); }
          else { ctx.moveTo(cx, ry); ctx.lineTo(cx + 5, ry); ctx.moveTo(cx + 2.5, ry); ctx.lineTo(cx + 2.5, ry + 5); }
          ctx.stroke();
          cx += 7 + rng.range(0, 3);
        }
      }
      // a crack running through all of it
      ctx.strokeStyle = rgba('#000000', 0.6);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.1, y - h);
      ctx.lineTo(x + w * 0.05, y - h * 0.6);
      ctx.lineTo(x - w * 0.05, y - h * 0.3);
      ctx.lineTo(x + w * 0.12, y);
      ctx.stroke();
      return true;
    }
    case 'brazier_tall': {
      poly(ctx, [x - 2, y, x + 2, y, x + 1.5, y - 22, x - 1.5, y - 22], '#3a2a20', o, 0.6);
      poly(ctx, [x - 7, y - 26, x + 7, y - 26, x + 4, y - 21, x - 4, y - 21], '#4a3428', o, 0.6);
      return true;
    }
  }
  return false;
}

/** Burning pitch pools (Chapter II's take on hazard tiles). */
export function drawPitch(ctx: Ctx, x: number, y: number, top: boolean, tx: number, t: number) {
  const wy = top ? Math.sin(t * 2.2 + tx) * 0.8 + 3 : 0;
  ctx.fillStyle = '#140a06';
  ctx.fillRect(x, y + wy, TILE, TILE - wy);
  ctx.globalCompositeOperation = 'lighter';
  if (top) {
    ctx.fillStyle = 'rgba(255,140,60,0.55)';
    ctx.fillRect(x, y + wy, TILE, 0.9);
    if (hash2(tx, Math.floor(t * 3), 5) < 0.3) glow(ctx, x + 8, y + wy - 2, 7, '#ff7a2a', 0.7);
  }
  glow(ctx, x + 8, y + 8, 14, '#c04a1a', 0.22);
  ctx.globalCompositeOperation = 'source-over';
}
