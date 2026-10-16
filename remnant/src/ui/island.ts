// The Dynamic Island as a living status light. In landscape the island sits at
// the middle of the left or right screen edge. Nothing is drawn over it; the
// game draws around it, inside the safe-area strip nothing else uses:
// - a ring that hugs the island: a red heartbeat when health runs low, a red
//   flicker on a heavy blow, a gold shimmer when Rally is ready, and a boss's
//   life as a crimson arc while a boss fight is on;
// - short "live activities" that slide out of the island for news (level up,
//   Mantle ready, round, saved). They are black pills, like the island itself
//   stretching toward the middle of the screen;
// - on the iPhone 18 Pro's smaller island there is room for more, so it works
//   the way iOS shows three activities at once: a bubble on one side counts
//   your summoned Echoes, a ring on the other holds the Shadow Mantle gauge.
//   Both bud off the island like drops of ink and fall back into it;
// - big moments (level up, a boss falling, a new phase) send a ripple out of
//   the island across the screen.
//
// The island's real size cannot be read from the browser and the 16, 17 and
// 18 Pro Max share one screen size, so the size is a setting with a length
// slider to match the hardware exactly.

import { G } from '../game/ctx';
import { settings, isIOS } from '../core/settings';
import { safe } from './safe';
import { mantleUnlocked } from '../game/mantle';
import { glow, rgba, FONT_DISPLAY, type Ctx } from '../render/draw';
import { icon } from './icons';

interface Pill { text: string; color: string; icon: string; t: number; dur: number }
interface Ripple { color: string; t: number; strong: boolean }

const queue: Pill[] = [];
let cur: Pill | null = null;
const ripples: Ripple[] = [];
const params = new URLSearchParams(location.search);
const forced = params.get('island');

/** The island's thickness (across the edge) and inset from the edge, in CSS px. */
const THICK = 37, INSET = 11;
/** Length along the edge: iPhone 14 to 17 Pro, and the iPhone 18 Pro's smaller island. */
export const ISLAND_LEN = { classic: 126, compact: 96 } as const;

/** Island length along the edge in landscape, from the setting. */
export function islandLength() {
  const mode = forced === 'compact' || forced === 'classic' ? forced : settings.islandSize ?? 'auto';
  if (mode === 'custom') return settings.islandLen ?? ISLAND_LEN.compact;
  if (mode === 'classic') return ISLAND_LEN.classic;
  if (mode === 'compact') return ISLAND_LEN.compact;
  // Auto: every Pro screen size now ships with the smaller island.
  return ISLAND_LEN.compact;
}

/** Which edge the island is on right now, or null when there is none to use. */
export function islandSide(): 'left' | 'right' | null {
  if (!settings.island) return null;
  if (forced === 'left' || forced === 'right') return forced;
  if (forced === 'compact' || forced === 'classic') return 'left';
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

/** Send a ripple out of the island across the screen (level up, a boss falling). */
export function islandRipple(color = '#ffd27a', strong = false) {
  if (!islandSide()) return;
  if (ripples.length > 2) ripples.shift();
  ripples.push({ color, t: 0, strong });
}

/** Seconds left of the bright outline drawn while the length slider moves. */
let calibrate = 0;
let calEl: HTMLDivElement | null = null;
let calTimer = 0;
/**
 * Show the island's outline for a moment while its size is set. The Settings
 * menu covers the game canvas, so the outline is a page element above it.
 */
export function islandCalibrate() {
  calibrate = 2.5;
  const side = islandSide();
  if (!side) {
    G.ui?.toast('Turn the phone sideways to see the island outline.', 'info');
    return;
  }
  if (!calEl) {
    calEl = document.createElement('div');
    calEl.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;border:1.5px solid #7af0ff;border-radius:999px;box-sizing:border-box;transition:opacity 0.4s;';
    document.body.appendChild(calEl);
  }
  const len = islandLength() + 3, w = THICK + 3;
  calEl.style.width = w + 'px';
  calEl.style.height = len + 'px';
  calEl.style.top = innerHeight / 2 - len / 2 + 'px';
  calEl.style.left = side === 'left' ? INSET + THICK / 2 - w / 2 + 'px' : '';
  calEl.style.right = side === 'right' ? INSET + THICK / 2 - w / 2 + 'px' : '';
  calEl.style.opacity = '1';
  clearTimeout(calTimer);
  calTimer = window.setTimeout(() => { if (calEl) calEl.style.opacity = '0'; }, 2500);
}

function pill(ctx: Ctx, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2);
}

/** Point at fraction f (0..1) round a vertical pill, from the inner middle, clockwise. Written to PT (no allocation). */
const PT = [0, 0];
function along(cx: number, cy: number, w: number, h: number, f: number, inward: number) {
  const r = w / 2, straight = h - w, half = straight / 2;
  let d = (((f % 1) + 1) % 1) * (2 * straight + 2 * Math.PI * r);
  if (d <= half) { PT[0] = cx + inward * r; PT[1] = cy + d; return PT; }
  d -= half;
  const arc = Math.PI * r;
  if (d <= arc) { const a = d / r; PT[0] = cx + inward * r * Math.cos(a); PT[1] = cy + half + r * Math.sin(a); return PT; }
  d -= arc;
  if (d <= straight) { PT[0] = cx - inward * r; PT[1] = cy + half - d; return PT; }
  d -= straight;
  if (d <= arc) { const a = d / r; PT[0] = cx - inward * r * Math.cos(a); PT[1] = cy - half - r * Math.sin(a); return PT; }
  d -= arc;
  PT[0] = cx + inward * r; PT[1] = cy - half + d;
  return PT;
}

/** Stroke the part of a pill's outline from f0 to f1. */
function arcAlong(ctx: Ctx, cx: number, cy: number, w: number, h: number, f0: number, f1: number, inward: number) {
  const n = Math.max(2, Math.ceil((f1 - f0) * 56));
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = along(cx, cy, w, h, f0 + ((f1 - f0) * i) / n, inward);
    if (i === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();
}

/**
 * A satellite drop: a black disc at (x, y) joined to the island by a neck that
 * thins as it pulls away (k = 0 inside the island, 1 fully out).
 */
function drop(ctx: Ctx, ix: number, iy: number, x: number, y: number, r: number, k: number) {
  const pr = r * (0.35 + 0.65 * k);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x, y, pr, 0, Math.PI * 2);
  ctx.fill();
  // The neck: fat while budding, gone once the drop has separated.
  const neck = k < 0.92 ? (1 - k / 0.92) : 0;
  if (neck <= 0.02) return;
  const w = pr * (0.25 + neck * 0.75);
  const dir = Math.sign(y - iy) || 1;
  const y0 = iy, y1 = y - dir * pr * 0.6;
  const mid = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(ix - THICK * 0.42, y0);
  ctx.quadraticCurveTo(x - w * 0.4, mid, x - w, y1);
  ctx.lineTo(x + w, y1);
  ctx.quadraticCurveTo(x + w * 0.4, mid, ix + THICK * 0.42, y0);
  ctx.closePath();
  ctx.fill();
}

// Smoothed state between frames.
let echoK = 0, mantleK = 0, echoFlash = 0, lastEchoes = -1, hurt = 0, lastHp = -1, bossShown = 0, bossPhase = 0;

export function drawIsland(ctx: Ctx, W: number, H: number, dt: number) {
  const side = islandSide();
  if (!side) return;
  const len = islandLength();
  const cx = side === 'left' ? INSET + THICK / 2 : W - INSET - THICK / 2;
  const cy = H / 2;
  const inward = side === 'left' ? 1 : -1;
  if (calibrate > 0) calibrate -= dt;
  if (forced) {
    // Desktop preview: stand in for the hardware island.
    ctx.fillStyle = '#000';
    pill(ctx, cx, cy, THICK, len);
    ctx.fill();
  }
  ctx.save();
  ctx.lineCap = 'round';
  if (calibrate > 0) {
    // Matching the slider to the hardware: a bright outline exactly at the island's edge.
    const a = Math.min(1, calibrate);
    ctx.strokeStyle = rgba('#7af0ff', 0.9 * a);
    ctx.lineWidth = 1.5;
    pill(ctx, cx, cy, THICK + 3, len + 3);
    ctx.stroke();
  }
  if (!G.save || !G.world || !G.d) {
    ctx.restore();
    return;
  }
  const s = G.save;
  const p = G.world.player;
  const t = G.time;
  const rw = THICK + 8, rh = len + 8;
  const compact = len < 112;

  // A heavy blow: the ring flickers red for a moment.
  if (lastHp >= 0 && s.hp < lastHp - G.d.maxHp * 0.08) hurt = 1;
  lastHp = s.hp;
  hurt = Math.max(0, hurt - dt * 2.5);
  if (hurt > 0 && p.state !== 'dead') {
    const fl = hurt * (0.6 + 0.4 * Math.sin(t * 60));
    ctx.strokeStyle = rgba('#ff3b3b', 0.85 * fl);
    ctx.lineWidth = 2.5;
    pill(ctx, cx, cy, rw - 2, rh - 2);
    ctx.stroke();
  }

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

  // A boss fight: its life as a crimson arc round the island, a ripple at each new phase.
  const boss = G.world.boss;
  const fightOn = !!boss && G.world.bossActive && !boss.dying && !boss.remove;
  bossShown += ((fightOn ? 1 : 0) - bossShown) * Math.min(1, dt * 4);
  if (boss && fightOn && boss.phase !== bossPhase) {
    if (bossPhase > 0 && boss.phase > bossPhase) islandRipple('#ff5a5a', true);
    bossPhase = boss.phase;
  }
  if (!fightOn && bossShown < 0.02) bossPhase = 0;
  if (boss && bossShown > 0.02) {
    const f = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    const bw = rw + 6, bh = rh + 6;
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba('#3a0a10', 0.7 * bossShown);
    arcAlong(ctx, cx, cy, bw, bh, 0, 1, inward);
    ctx.strokeStyle = rgba('#ff4040', 0.9 * bossShown);
    arcAlong(ctx, cx, cy, bw, bh, 0.5 - f / 2, 0.5 + f / 2, inward);
    // An ember riding the arc's two ends.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of [0.5 - f / 2, 0.5 + f / 2]) {
      const q = along(cx, cy, bw, bh, e, inward);
      glow(ctx, q[0], q[1], 9, '#ff6a40', 0.55 * bossShown);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Rally ready: a slow gold shimmer travelling round the island.
  if (s.rally >= 100 && p.mantleT <= 0) {
    ctx.globalCompositeOperation = 'lighter';
    const q = along(cx, cy, rw + 14, rh + 14, (t * 0.35) % 1, inward);
    glow(ctx, q[0], q[1], 10, '#ffd27a', 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  // The Shadow Mantle. On the small island it buds off as a ring of its own;
  // on the older, longer island it runs round the island's outline.
  const mantleOn = mantleUnlocked();
  const on = p.mantleT > 0;
  const mf = on ? p.mantleT / Math.max(1, p.mantleMax) : (s.mantle ?? 0) / 100;
  const ready = !on && mf >= 1;
  const gap = 10, podR = 15;
  if (compact) {
    mantleK += ((mantleOn && (mf > 0.01 || on) ? 1 : 0) - mantleK) * Math.min(1, dt * 5);
    if (mantleK > 0.01) {
      const k = mantleK;
      const py = cy + (len / 2 + gap + podR) * k;
      drop(ctx, cx, cy + len / 2 - 6, cx, py, podR, k);
      if (k > 0.6) {
        const a = (k - 0.6) / 0.4;
        if (on || ready) {
          ctx.globalCompositeOperation = 'lighter';
          const fl = ready ? 0.5 + Math.sin(t * 5) * 0.3 : 0.7 + Math.sin(t * 13) * 0.15;
          glow(ctx, cx, py, 34, '#5a5cff', 0.35 * fl * a);
          if (on) for (let i = 0; i < 5; i++) {
            const ang = t * 2.4 + (i / 5) * Math.PI * 2;
            glow(ctx, cx + Math.cos(ang) * (podR + 2), py + Math.sin(ang) * (podR + 2), 6 + Math.sin(t * 9 + i) * 2, i % 2 ? '#8a5cff' : '#6f7bff', 0.5 * a);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = rgba('#232444', a);
        ctx.beginPath();
        ctx.arc(cx, py, podR - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = on ? rgba('#a9b4ff', a) : ready ? rgba('#c8ccff', 0.95 * a) : rgba('#6f7bff', 0.8 * a);
        ctx.beginPath();
        ctx.arc(cx, py, podR - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, mf));
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.drawImage(icon('mantle', on || ready ? '#dfe2ff' : '#8f96d8', 24), cx - 6, py - 6, 12, 12);
        ctx.globalAlpha = 1;
      }
    }
  } else if (mantleOn) {
    const mw = rw + 6, mh = rh + 6;
    if (on || ready) {
      const fl = ready ? 0.5 + Math.sin(t * 5) * 0.3 : 0.7 + Math.sin(t * 13) * 0.15;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx + inward * 4, cy, 60, '#5a5cff', 0.25 * fl);
      if (on) for (let i = 0; i < 6; i++) {
        const q = along(cx, cy, mw, mh, (t * 0.12 + i / 6) % 1, inward);
        glow(ctx, q[0], q[1], 7 + Math.sin(t * 9 + i) * 2, i % 2 ? '#8a5cff' : '#6f7bff', 0.5);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (mf > 0.01) {
      ctx.strokeStyle = on ? '#a9b4ff' : ready ? rgba('#c8ccff', 0.9) : rgba('#6f7bff', 0.55);
      ctx.lineWidth = on || ready ? 2.6 : 1.8;
      arcAlong(ctx, cx, cy, mw, mh, 0, Math.min(1, mf), inward);
    }
  }

  // Summoned Echoes: a bubble that buds off the far side with one dot per shadow.
  if (compact) {
    let n = 0, hurtEcho = 0;
    for (const e of G.world.echoes) {
      if (!e.remove && e.despawn <= 0) {
        n++;
        if (e.hp < e.maxHp * 0.35) hurtEcho++;
      }
    }
    if (lastEchoes >= 0 && n < lastEchoes) echoFlash = 1;
    lastEchoes = n;
    echoFlash = Math.max(0, echoFlash - dt * 1.8);
    echoK += ((n > 0 ? 1 : 0) - echoK) * Math.min(1, dt * 5);
    if (echoK > 0.01) {
      const k = echoK;
      const py = cy - (len / 2 + gap + podR) * k;
      drop(ctx, cx, cy - len / 2 + 6, cx, py, podR, k);
      if (k > 0.6) {
        const a = (k - 0.6) / 0.4;
        if (echoFlash > 0) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, cx, py, 30, '#ff5a7a', 0.6 * echoFlash * a);
          ctx.globalCompositeOperation = 'source-over';
        }
        // One violet dot per Echo round the rim (red while it is badly hurt), the count in the middle.
        const shown = Math.min(n, 12);
        for (let i = 0; i < shown; i++) {
          const ang = -Math.PI / 2 + (i / shown) * Math.PI * 2 + t * 0.6;
          ctx.fillStyle = i < hurtEcho ? rgba('#ff6a6a', a) : rgba('#b49cff', a);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * (podR - 4), py + Math.sin(ang) * (podR - 4), 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = rgba('#e8e0ff', a);
        ctx.font = `700 11px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), cx, py + 0.5);
      }
    }
  }

  // Ripples: a thin ring that leaves the island and crosses the screen.
  const soft = settings.reduceFlashes;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    const dur = r.strong ? 1.4 : 1.1;
    if (r.t >= dur) {
      ripples.splice(i, 1);
      continue;
    }
    const k = r.t / dur;
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    const grow = e * W * 1.1;
    ctx.strokeStyle = rgba(r.color, (1 - k) * (soft ? 0.25 : 0.55));
    ctx.lineWidth = (r.strong ? 3 : 2) * (1 - k * 0.6);
    pill(ctx, cx + inward * grow * 0.5, cy, THICK + grow, len + grow * 0.9);
    ctx.stroke();
  }

  // Live activities.
  if (!cur && queue.length) cur = queue.shift()!;
  if (cur) {
    cur.t += dt;
    const k = Math.min(1, cur.t / 0.25, Math.max(0, (cur.dur - cur.t) / 0.25));
    const e = 1 - (1 - k) * (1 - k);
    ctx.font = `700 ${12}px ${FONT_DISPLAY}`;
    const tw = ctx.measureText(cur.text).width;
    const grow = (tw + 52) * e;
    const ph = 38;
    const x0 = side === 'left' ? cx - THICK / 2 : cx + THICK / 2 - (THICK + grow);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(x0, cy - ph / 2, THICK + grow, ph, ph / 2);
    ctx.fill();
    if (e > 0.6) {
      ctx.globalAlpha = (e - 0.6) / 0.4;
      const tx = side === 'left' ? cx + THICK / 2 + 10 : cx - THICK / 2 - 10;
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
