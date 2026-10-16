// The Dynamic Island as a status light. In landscape the island sits at the
// middle of the left or right screen edge. Nothing is drawn over it; a ring
// hugs it instead:
// - a red heartbeat when health runs low;
// - a blue-violet charge that fills as the Shadow Mantle gauge grows, burns
//   while the form is on and drains with its time;
// - a gold shimmer when Rally is ready.
// Short "live activities" slide out of the island for news (level up, Mantle
// ready, wave cleared, saved). They are black pills that look like the island
// itself stretching toward the middle of the screen.

import { G } from '../game/ctx';
import { settings, isIOS } from '../core/settings';
import { safe } from './safe';
import { mantleUnlocked } from '../game/mantle';
import { glow, rgba, FONT_DISPLAY, type Ctx } from '../render/draw';
import { icon } from './icons';

interface Pill { text: string; color: string; icon: string; t: number; dur: number }

const queue: Pill[] = [];
let cur: Pill | null = null;
const forced = new URLSearchParams(location.search).get('island');

/** Island size in landscape, in CSS px (iPhone 14 Pro and later). */
const ISL = { inset: 11, w: 37, h: 126 };

/** Which edge the island is on right now, or null when there is none to use. */
export function islandSide(): 'left' | 'right' | null {
  if (!settings.island) return null;
  if (forced === 'left' || forced === 'right') return forced;
  if (!isIOS() || innerWidth < innerHeight) return null;
  // Island phones report ~59 px side insets in landscape; notch phones ~47.
  if (Math.max(safe.left, safe.right) < 52) return null;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  const angle = typeof legacy === 'number' ? legacy : screen.orientation?.angle ?? 0;
  // Turned counterclockwise (90), the top of the phone and its island are on the left.
  return angle === 90 ? 'left' : angle === -90 || angle === 270 ? 'right' : null;
}

/** Queue a short message that slides out of the island. */
export function islandNotify(text: string, color = '#f6dea0', ic = 'shard', dur = 2.4) {
  if (!islandSide()) return;
  if (queue.length > 3) queue.shift();
  queue.push({ text, color, icon: ic, t: 0, dur });
}

/** A rounded-rectangle path around the island, grown by `pad`. */
function pill(ctx: Ctx, cx: number, cy: number, w: number, h: number) {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
}

/** Point at fraction f (0..1) along the pill's outline, starting at the inner middle and going clockwise. */
function along(cx: number, cy: number, w: number, h: number, f: number, inward: number): [number, number] {
  const r = w / 2, straight = h - w;
  const per = 2 * straight + 2 * Math.PI * r;
  let d = (((f % 1) + 1) % 1) * per;
  // Start mid-way down the inner straight edge.
  const half = straight / 2;
  const segs: [number, (s: number) => [number, number]][] = [
    [half, (s) => [cx + inward * r, cy + s]],
    [Math.PI * r, (s) => { const a = s / r; return [cx + inward * r * Math.cos(a), cy + half + r * Math.sin(a)]; }],
    [straight, (s) => [cx - inward * r, cy + half - s]],
    [Math.PI * r, (s) => { const a = s / r; return [cx - inward * r * Math.cos(a), cy - half - r * Math.sin(a)]; }],
    [half, (s) => [cx + inward * r, cy - half + s]],
  ];
  for (const [len, fn] of segs) {
    if (d <= len) return fn(d);
    d -= len;
  }
  return [cx + inward * r, cy];
}

export function drawIsland(ctx: Ctx, W: number, H: number, dt: number) {
  const side = islandSide();
  if (!side || !G.save || !G.world) return;
  const s = G.save;
  const p = G.world.player;
  const t = G.time;
  const cx = side === 'left' ? ISL.inset + ISL.w / 2 : W - ISL.inset - ISL.w / 2;
  const cy = H / 2;
  const inward = side === 'left' ? 1 : -1;
  if (forced) {
    // Desktop preview: stand in for the hardware island.
    ctx.fillStyle = '#000';
    pill(ctx, cx, cy, ISL.w, ISL.h);
    ctx.fill();
  }
  const rw = ISL.w + 8, rh = ISL.h + 8;
  ctx.save();
  ctx.lineCap = 'round';

  // Low health: a heartbeat, faster as it falls.
  const hpF = s.hp / G.d.maxHp;
  if (hpF < 0.3 && p.state !== 'dead') {
    const rate = 1.1 + (0.3 - hpF) * 4;
    const ph = (t * rate) % 1;
    const beat = Math.max(0, 1 - ph * 7) + Math.max(0, 1 - Math.abs(ph - 0.22) * 9) * 0.7;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx + inward * 6, cy, 70 + beat * 30, '#e0303a', 0.18 + beat * 0.45);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba('#ff4a4a', 0.35 + beat * 0.6);
    ctx.lineWidth = 2 + beat * 2;
    pill(ctx, cx, cy, rw, rh);
    ctx.stroke();
  }

  // The Shadow Mantle: charge, ready, burning.
  if (mantleUnlocked()) {
    const on = p.mantleT > 0;
    const f = on ? p.mantleT / Math.max(1, p.mantleMax) : (s.mantle ?? 0) / 100;
    const ready = !on && f >= 1;
    const mw = rw + 6, mh = rh + 6;
    if (on || ready) {
      const fl = ready ? 0.5 + Math.sin(t * 5) * 0.3 : 0.7 + Math.sin(t * 13) * 0.15;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx + inward * 4, cy, 60, '#5a5cff', 0.25 * fl);
      if (on) {
        // Blue-violet flame licking off the ring.
        for (let i = 0; i < 6; i++) {
          const [x, y] = along(cx, cy, mw, mh, (t * 0.12 + i / 6) % 1, inward);
          glow(ctx, x, y, 7 + Math.sin(t * 9 + i) * 2, i % 2 ? '#8a5cff' : '#6f7bff', 0.5);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (f > 0.01) {
      ctx.strokeStyle = on ? '#a9b4ff' : ready ? rgba('#c8ccff', 0.9) : rgba('#6f7bff', 0.55);
      ctx.lineWidth = on || ready ? 2.6 : 1.8;
      ctx.beginPath();
      const n = Math.max(2, Math.ceil(f * 48));
      for (let i = 0; i <= n; i++) {
        const [x, y] = along(cx, cy, mw, mh, (i / n) * Math.min(1, f), inward);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Rally ready: a slow gold shimmer travelling round the island.
  if (s.rally >= 100 && p.mantleT <= 0) {
    ctx.globalCompositeOperation = 'lighter';
    const [x, y] = along(cx, cy, rw + 14, rh + 14, (t * 0.35) % 1, inward);
    glow(ctx, x, y, 10, '#ffd27a', 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Live activities.
  if (!cur && queue.length) cur = queue.shift()!;
  if (cur) {
    cur.t += dt;
    const k = Math.min(1, cur.t / 0.25, Math.max(0, (cur.dur - cur.t) / 0.25));
    const e = 1 - (1 - k) * (1 - k);
    ctx.font = `700 ${12}px ${FONT_DISPLAY}`;
    const tw = ctx.measureText(cur.text).width;
    const len = (tw + 52) * e;
    const ph = 38;
    const x0 = side === 'left' ? cx - ISL.w / 2 : cx + ISL.w / 2 - (ISL.w + len);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(x0, cy - ph / 2, ISL.w + len, ph, ph / 2);
    ctx.fill();
    if (e > 0.6) {
      ctx.globalAlpha = (e - 0.6) / 0.4;
      const tx = side === 'left' ? cx + ISL.w / 2 + 10 : cx - ISL.w / 2 - 10;
      const ix = side === 'left' ? tx : tx - 16;
      ctx.drawImage(icon(cur.icon, cur.color, 32), ix, cy - 8, 16, 16);
      ctx.fillStyle = cur.color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = side === 'left' ? 'left' : 'right';
      ctx.fillText(cur.text, side === 'left' ? tx + 22 : tx - 22, cy + 0.5);
      ctx.globalAlpha = 1;
    }
    if (cur.t >= cur.dur) cur = null;
  }
  ctx.restore();
}
