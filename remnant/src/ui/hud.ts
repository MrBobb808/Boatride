// In-game HUD, drawn on the canvas in CSS-pixel space for crisp text.
// Top-left: health, Covenant Energy, experience, Balm, status, Echoes.
// Top-right: location, objective, silver, minimap. Bottom-centre: skills,
// Echo stance and the Rally gauge (hidden on touch, where buttons show it).

import { G, flag } from '../game/ctx';
import { input } from '../core/input';
import { settings } from '../core/settings';
import { icon } from './icons';
import { ABILITIES, ECHO_SPECIES, SUPER_MOVES, xpToNext } from '../game/data';
import { selectedSuper } from '../game/supers';
import { CONTRACTS } from '../game/progression';
import { QUESTS } from '../game/story';
import { ROOMS, chapterOf } from '../game/rooms';
import { CH2_ROOM_IDS } from '../game/rooms2';
import { guidePoint } from '../game/guide';
import { mantleUnlocked } from '../game/mantle';
import { drawIsland } from './island';
import { SUBS, type SubId } from '../game/subweapons';
import { FONT_DISPLAY, FONT_BODY, roundRect, glow, type Ctx } from '../render/draw';
import { clamp, lerp } from '../core/math';
import { safe } from './safe';

let hpGhost = 1;
let ceShown = 0;
let bossName: string | null = null;
let bossSub = '';
let bossGhost = 1;
let fps = 60;
let fpsAcc = 0;
let fpsN = 0;
// The top-right corner quietens down once you have read it.
let roomSeen = '';
let roomT = 0;
let objSeen = '';
let objT = 0;
let silverSeen = -1;
let silverT = 0;

export function setBoss(name: string | null, sub = '') {
  bossName = name;
  bossSub = sub;
  bossGhost = 1;
}

export function tickFps(dt: number) {
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
}
export const currentFps = () => fps;

export function objectiveText(): string {
  const s = G.save;
  // In Shinar the newest main quest leads; in Chapter I, the oldest open one.
  const later = chapterOf(G.world.room.id) > 1;
  for (const q of later ? [...QUESTS].reverse() : QUESTS) {
    if (q.kind !== 'main') continue;
    const st = s.quests[q.id];
    if (st && !st.done) return q.stages[Math.min(st.stage, q.stages.length - 1)];
  }
  if (flag('ch6_done')) return 'Chapter VI complete. Chapter VII is coming. Brave the Trial of the Remnant, grow your army, or begin New Game+ at an altar.';
  if (flag('ch5_done') && !flag('ch6_intro')) return 'Chapter V complete. Journey on to the great river Hiddekel from any altar.';
  if (flag('ch4_done') && !flag('ch5_intro')) return 'Chapter IV complete. Journey on to Babylon from any altar.';
  if (flag('ch3_done') && !flag('ch4_intro')) return 'Chapter III complete. Journey on to the plain of Dura from any altar.';
  if (flag('ch3_done')) return 'Chapter III complete. Brave the Trial of the Remnant, grow your army, or begin New Game+ at an altar.';
  if (flag('ch2_done')) return 'Chapter II complete. Journey on to the Valley of Bones from any altar.';
  if (flag('ending_done')) return 'Chapter I complete. Journey east to Shinar from any altar, or begin New Game+.';
  if (flag('ch1_done')) return 'Chapter I complete. Explore, grow stronger, or begin New Game+ at an altar.';
  return '';
}

export function drawHud(ctx: Ctx, dt: number) {
  const r = G.renderer;
  const s = G.save;
  const d = G.d;
  if (!s || !d) return;
  const W = r.cssW, H = r.cssH;
  const u = clamp(Math.min(H / 430, W / 900), 0.85, 1.6);
  ctx.save();
  ctx.setTransform(r.px, 0, 0, r.px, 0, 0);
  const sat = safe.top, sal = safe.left, sar = safe.right, sab = safe.bottom;
  const x0 = 12 + sal, y0 = 10 + sat;
  const touch = input.lastDevice === 'touch';
  ctx.globalAlpha = G.inCutscene ? 0.35 : 1;

  // ----- level badge
  const bx = x0 + 15 * u, by = y0 + 15 * u;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(12,9,16,0.9)';
  ctx.fillRect(-11 * u, -11 * u, 22 * u, 22 * u);
  ctx.strokeStyle = '#e2b85a';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-11 * u, -11 * u, 22 * u, 22 * u);
  ctx.restore();
  text(ctx, String(s.level), bx, by + 0.5, `700 ${12 * u}px ${FONT_DISPLAY}`, '#f6dea0', 'center');

  // ----- health
  const hx = x0 + 34 * u, hy = y0 + 6 * u, hw = 196 * u, hh = 10 * u;
  const frac = clamp(s.hp / d.maxHp, 0, 1);
  hpGhost = frac > hpGhost ? frac : lerp(hpGhost, frac, Math.min(1, dt * 2.5));
  bar(ctx, hx, hy, hw, hh, frac, hpGhost, ['#5a1218', '#b0303a', '#e0606a']);
  text(ctx, `${Math.ceil(s.hp)} / ${d.maxHp}`, hx + hw - 4, hy + hh / 2 + 0.5, `600 ${8.5 * u}px ${FONT_DISPLAY}`, '#f4e8e0', 'right');
  // ----- covenant energy
  let cy = hy + hh + 4 * u;
  if (flag('relic_taken')) {
    const cf = clamp(s.ce / d.maxCe, 0, 1);
    ceShown = lerp(ceShown, cf, Math.min(1, dt * 8));
    bar(ctx, hx, cy, hw * 0.82, 6 * u, ceShown, ceShown, ['#3a2a10', '#c9a04a', '#fff3c4']);
    cy += 6 * u + 3 * u;
  }
  // ----- shadow mantle gauge (from level 25); while transformed, the time left
  if (mantleUnlocked()) {
    const pl = G.world.player;
    const on = pl.mantleT > 0;
    const f = on ? clamp(pl.mantleT / pl.mantleMax, 0, 1) : clamp((s.mantle ?? 0) / 100, 0, 1);
    const full = on || f >= 1;
    const mw = hw * 0.82;
    bar(ctx, hx, cy, mw, 4 * u, f, f, full ? ['#14102e', '#6f7bff', '#e4e6ff'] : ['#120e24', '#4a4aa8', '#a9b4ff']);
    if (full) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hx + mw * f, cy + 2 * u, 10 * u, '#6f7bff', 0.45 + Math.sin(G.time * 6) * 0.2);
      ctx.globalCompositeOperation = 'source-over';
      const k = touch ? '' : ` · ${input.label('transform')}`;
      text(ctx, on ? `SHADOW MANTLE ${Math.ceil(pl.mantleT)}s` : `MANTLE READY${k}`, hx + mw + 6 * u, cy + 2.5 * u, `700 ${7 * u}px ${FONT_DISPLAY}`, '#c8ccff', 'left');
    }
    cy += 4 * u + 3 * u;
  }
  // ----- xp
  const xf = clamp(s.xp / xpToNext(s.level), 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(hx, cy, hw * 0.82, 2 * u);
  ctx.fillStyle = '#9fc4ff';
  ctx.fillRect(hx, cy, hw * 0.82 * xf, 2 * u);
  cy += 2 * u + 5 * u;
  // ----- balm + points
  let vx = hx;
  for (let i = 0; i < s.balmMax; i++) {
    ctx.globalAlpha = (G.inCutscene ? 0.35 : 1) * (i < s.balm ? 1 : 0.28);
    ctx.drawImage(icon('vial', i < s.balm ? '#d04a5a' : '#8a7a8a', 32), vx, cy - 1, 11 * u, 11 * u);
    vx += 12 * u;
  }
  ctx.globalAlpha = G.inCutscene ? 0.35 : 1;
  // ----- sub-weapon and hearts
  if (s.sub || (s.hearts ?? 0) > 0) {
    vx += 5 * u;
    const def = s.sub ? SUBS[s.sub as SubId] : null;
    if (def) {
      ctx.strokeStyle = 'rgba(226,184,90,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, cy - 2, 13 * u, 13 * u);
      ctx.drawImage(icon(def.icon, def.color, 32), vx + 1.5 * u, cy - 0.5, 10 * u, 10 * u);
      vx += 16 * u;
    }
    ctx.drawImage(icon('heart', '#e0405a', 32), vx, cy, 10 * u, 10 * u);
    text(ctx, String(s.hearts ?? 0), vx + 12 * u, cy + 5 * u, `700 ${8.5 * u}px ${FONT_DISPLAY}`, '#ffd0d8', 'left');
    vx += 26 * u;
  }
  if (s.statPoints > 0 || s.skillPoints > 0) {
    text(ctx, `✦ ${s.statPoints ? s.statPoints + ' stat' : ''}${s.statPoints && s.skillPoints ? ' · ' : ''}${s.skillPoints ? s.skillPoints + ' skill' : ''} points`, vx + 6 * u, cy + 5 * u, `600 ${8 * u}px ${FONT_DISPLAY}`, '#f6dea0', 'left');
  }
  cy += 14 * u;
  // ----- status effects
  const p = G.world.player;
  const statuses: [string, number, string][] = [];
  if (p.lion > 0) statuses.push(['lion', p.lion, '#ffb347']);
  if (p.armorLight > 0) statuses.push(['armor', p.armorLight, '#fff1c4']);
  if (p.shieldT > 0) statuses.push(['shield', p.shieldT, '#bfe0ff']);
  if (p.veiled > 0) statuses.push(['veil', p.veiled, '#c45cff']);
  let sx = hx;
  for (const [ic, t, c] of statuses) {
    ctx.drawImage(icon(ic, c, 32), sx, cy, 14 * u, 14 * u);
    text(ctx, t.toFixed(0), sx + 7 * u, cy + 19 * u, `600 ${7 * u}px ${FONT_DISPLAY}`, c, 'center');
    sx += 18 * u;
  }
  if (statuses.length) cy += 24 * u;
  // ----- echoes (a compact grid once the army outgrows the list)
  const army = G.world.echoes;
  if (army.length <= 5) {
    for (const e of army) {
      const sp = ECHO_SPECIES[e.inst.species];
      ctx.drawImage(icon(e.kit.ranged ? 'archer_echo' : 'sentinel_echo', e.tempT > 0 ? '#c9a8ff' : '#fff3c4', 32), hx, cy, 12 * u, 12 * u);
      text(ctx, (e.tempT > 0 ? 'Shadow ' : '') + sp.stages[e.inst.stage].name + (e.inst.commander ? ' ★' : ''), hx + 15 * u, cy + 4 * u, `600 ${7.5 * u}px ${FONT_DISPLAY}`, e.tempT > 0 ? '#d8c4ff' : '#ece4d4', 'left');
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(hx + 15 * u, cy + 8 * u, 70 * u, 2.5 * u);
      ctx.fillStyle = e.tempT > 0 ? '#a888e8' : '#e8c86a';
      ctx.fillRect(hx + 15 * u, cy + 8 * u, 70 * u * clamp(e.hp / e.maxHp, 0, 1), 2.5 * u);
      cy += 15 * u;
    }
  } else {
    army.forEach((e, i) => {
      const gx = hx + (i % 2) * 46 * u, gy = cy + Math.floor(i / 2) * 13 * u;
      ctx.drawImage(icon(e.kit.ranged ? 'archer_echo' : 'sentinel_echo', e.tempT > 0 ? '#c9a8ff' : '#fff3c4', 32), gx, gy, 10 * u, 10 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(gx + 12 * u, gy + 4 * u, 30 * u, 2.5 * u);
      ctx.fillStyle = e.tempT > 0 ? '#a888e8' : '#e8c86a';
      ctx.fillRect(gx + 12 * u, gy + 4 * u, 30 * u * clamp(e.hp / e.maxHp, 0, 1), 2.5 * u);
    });
    cy += Math.ceil(army.length / 2) * 13 * u + 2 * u;
  }
  for (const inst of s.echoes) {
    if ((inst.downFor ?? 0) > 0 && s.active.includes(inst.uid)) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(icon(inst.species === 'archer' ? 'archer_echo' : 'sentinel_echo', '#9a90a4', 32), hx, cy, 12 * u, 12 * u);
      text(ctx, `returns in ${Math.ceil(inst.downFor ?? 0)}s`, hx + 15 * u, cy + 6 * u, `600 ${7.5 * u}px ${FONT_DISPLAY}`, '#9a90a4', 'left');
      ctx.globalAlpha = 1;
      cy += 15 * u;
    }
  }

  // ----- top right: location, objective, minimap, silver. On touch it stays
  // small and quiet: the room name fades after a few seconds, the objective
  // dims once read, and silver shows only when it changes.
  const base = G.inCutscene ? 0.35 : 1;
  const rx = W - 12 - sar - (touch ? 46 * u : 0);
  const room = G.world.room;
  if (room.id !== roomSeen) { roomSeen = room.id; roomT = 0; }
  roomT += dt;
  const obj = objectiveText();
  if (obj !== objSeen) { objSeen = obj; objT = 0; }
  objT += dt;
  if (s.silver !== silverSeen) { if (silverSeen >= 0) silverT = 0; else silverT = 99; silverSeen = s.silver; }
  silverT += dt;
  const nameA = touch ? clamp((7 - roomT) / 1.5, 0, 1) : 1;
  if (nameA > 0) {
    ctx.globalAlpha = base * nameA;
    text(ctx, room.name.toUpperCase(), rx, y0 + 6 * u, `600 ${8.5 * u}px ${FONT_DISPLAY}`, '#e2b85a', 'right');
  }
  const of = touch ? 9.5 : 10.5;
  ctx.font = `italic ${of * u}px ${FONT_BODY}`;
  const lines = wrap(ctx, obj, (touch ? 190 : 230) * u).slice(0, touch ? 2 : 3);
  const oy = touch ? y0 + (nameA > 0 ? 18 : 6) * u : y0 + 19 * u;
  ctx.globalAlpha = base * (touch && objT > 10 ? 0.55 : 1);
  lines.forEach((l, i) => text(ctx, l, rx, oy + i * (of + 1.5) * u, `italic ${of * u}px ${FONT_BODY}`, '#ddd4c6', 'right'));
  ctx.globalAlpha = base;
  const my = oy + (lines.length * (of + 1.5) + 3) * u;
  const mw = (touch ? 84 : 110) * u, mh = (touch ? 36 : 46) * u;
  ctx.globalAlpha = base * (touch ? 0.75 : 1);
  minimap(ctx, rx - mw, my, mw, mh);
  ctx.globalAlpha = base;
  const silverA = touch ? clamp((4 - silverT) / 0.8, 0, 1) : 1;
  if (silverA > 0) {
    ctx.globalAlpha = base * silverA;
    ctx.drawImage(icon('ring', '#e8e2d0', 32), rx - 60 * u, my + mh + 4 * u, 10 * u, 10 * u);
    text(ctx, `${s.silver} silver`, rx, my + mh + 9 * u, `600 ${8.5 * u}px ${FONT_DISPLAY}`, '#ece4d4', 'right');
    ctx.globalAlpha = base;
  }
  // ----- the Trial: a round counter in blood red, as in Zombies
  if (room.id === 'trial_arena') drawRounds(ctx, W, y0, u);

  // ----- boss bar
  if (bossName && G.world.boss && !G.inCutscene) {
    const b = G.world.boss;
    const bw = Math.min(W * 0.46, 460 * u);
    const bxx = (W - bw) / 2, byy = touch ? y0 + 6 * u : H - sab - 70 * u;
    const f = clamp(b.hp / b.maxHp, 0, 1);
    bossGhost = lerp(bossGhost, f, Math.min(1, dt * 2));
    text(ctx, bossName.toUpperCase(), W / 2, byy - 8 * u, `700 ${11 * u}px ${FONT_DISPLAY}`, '#f6dea0', 'center');
    bar(ctx, bxx, byy, bw, 8 * u, f, bossGhost, ['#4a1a06', '#c97a2a', '#ffd27a']);
    // phase marks
    for (const m of b.phaseMarks) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bxx + bw * m - 1, byy - 2, 2, 12 * u);
    }
    // poise
    if (b.state !== 'kneel') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bxx, byy + 10 * u, bw, 2 * u);
      ctx.fillStyle = '#e8d8a8';
      ctx.fillRect(bxx, byy + 10 * u, bw * clamp(b.poise / b.maxPoise, 0, 1), 2 * u);
    }
    if (bossSub && !touch) text(ctx, bossSub, W / 2, byy + 20 * u, `italic ${9.5 * u}px ${FONT_BODY}`, '#9b92a6', 'center');
  } else if (G.world.purifyTarget === null && !bossName) {
    // elite enemy bar when one is engaged
    const el = G.world.ents.find((e) => (e as { elite?: string | null }).elite && !e.dying && (e as { aggro?: boolean }).aggro);
    if (el) {
      const bw = Math.min(W * 0.36, 340 * u);
      const bxx = (W - bw) / 2, byy = touch ? y0 + 8 * u : H - sab - 66 * u;
      text(ctx, el.name.toUpperCase(), W / 2, byy - 8 * u, `700 ${10 * u}px ${FONT_DISPLAY}`, '#f0c0d0', 'center');
      const f = clamp(el.hp / el.maxHp, 0, 1);
      bar(ctx, bxx, byy, bw, 6 * u, f, f, ['#3a0a14', '#a02a3a', '#e0606a']);
    }
  }

  // ----- bottom centre: skills, echo stance, rally (keyboard / controller)
  if (!touch && s.abilities.length + s.echoes.length > 0) {
    const n = 3;
    const sz = 34 * u, gap = 8 * u;
    const total = n * sz + (n - 1) * gap + (sz + gap) * 2;
    let x = (W - total) / 2;
    const yb = H - sab - sz - 12 * u;
    const keys: ('skill1' | 'skill2' | 'skill3')[] = ['skill1', 'skill2', 'skill3'];
    for (let i = 0; i < n; i++) {
      const id = s.equippedSkills[i];
      slotBox(ctx, x, yb, sz);
      if (id) {
        const def = ABILITIES[id];
        const cd = p.cds[id] ?? 0;
        const usable = s.ce >= def.cost && cd <= 0;
        ctx.globalAlpha = usable ? 1 : 0.4;
        ctx.drawImage(icon(def.icon, '#f6dea0', 64), x + 5 * u, yb + 5 * u, sz - 10 * u, sz - 10 * u);
        ctx.globalAlpha = 1;
        if (cd > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          const fr = cd / def.cd;
          ctx.fillRect(x, yb + sz * (1 - fr), sz, sz * fr);
        }
        text(ctx, String(def.cost), x + sz - 3 * u, yb + sz - 5 * u, `600 ${7 * u}px ${FONT_DISPLAY}`, '#f6dea0', 'right');
      }
      text(ctx, input.label(keys[i]), x + 4 * u, yb + 6 * u, `700 ${7 * u}px ${FONT_DISPLAY}`, '#ece4d4', 'left');
      x += sz + gap;
    }
    // echo stance
    if (s.echoes.length) {
      slotBox(ctx, x, yb, sz);
      ctx.drawImage(icon(s.echoMode, '#fff3c4', 64), x + 6 * u, yb + 6 * u, sz - 12 * u, sz - 12 * u);
      text(ctx, input.label('echo'), x + 4 * u, yb + 6 * u, `700 ${7 * u}px ${FONT_DISPLAY}`, '#ece4d4', 'left');
    }
    x += sz + gap;
    // rally gauge
    if (flag('relic_taken')) {
      const cx = x + sz / 2, cyy = yb + sz / 2, rr = sz / 2;
      ctx.fillStyle = 'rgba(12,9,16,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cyy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(226,184,90,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const f = s.rally / 100;
      ctx.strokeStyle = f >= 1 ? '#fff3c4' : '#e2b85a';
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(cx, cyy, rr - 2 * u, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.stroke();
      if (f >= 1) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, cx, cyy, rr * 1.8, '#ffd27a', 0.5 + Math.sin(G.time * 5) * 0.2);
        ctx.globalCompositeOperation = 'source-over';
      }
      const superDef = SUPER_MOVES[selectedSuper()];
      ctx.drawImage(icon(superDef.icon, f >= 1 ? superDef.color : '#8a6e3a', 64), cx - rr * 0.55, cyy - rr * 0.55, rr * 1.1, rr * 1.1);
      text(ctx, input.label('ultimate'), x + 4 * u, yb + 6 * u, `700 ${7 * u}px ${FONT_DISPLAY}`, '#ece4d4', 'left');
    }
  }
  drawCombo(ctx, W, H, u, touch, sar);
  drawSaved(ctx, H, u, sal, sab, dt);
  ctx.globalAlpha = 1;
  drawIsland(ctx, W, H, dt);
  if (settings.guide && !G.inCutscene && !G.world.bossActive) drawGuideArrow(ctx, W, H, u, sat, sal, sar, sab);
  if (settings.showFps) text(ctx, `${fps.toFixed(0)} fps · q${r.tier}`, W / 2, H - 6 - sab, `600 ${9}px ${FONT_DISPLAY}`, '#9b92a6', 'center');
  ctx.restore();
}

// ----- objective arrow at the screen edge when the marker is out of view
function drawGuideArrow(ctx: Ctx, W: number, H: number, u: number, sat: number, sal: number, sar: number, sab: number) {
  const g = guidePoint();
  if (!g) return;
  const v = G.camera.view();
  const sx = ((g.point.x - v.x) / v.w) * W, sy = ((g.point.y - 30 - v.y) / v.h) * H;
  const m = 26 * u;
  if (sx > m && sx < W - m && sy > m && sy < H - m) return;
  const cx = W / 2, cy = H / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const hw = W / 2 - m - Math.max(sal, sar), hh = H / 2 - m - Math.max(sat, sab) - 20 * u;
  const k = Math.min(hw / Math.max(0.001, Math.abs(Math.cos(ang))), hh / Math.max(0.001, Math.abs(Math.sin(ang))));
  const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
  const pulse = 0.75 + Math.sin(G.time * 5) * 0.25;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 22 * u, '#ffcf6b', 0.35 * pulse);
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(11 * u, 0); ctx.lineTo(-6 * u, -8 * u); ctx.lineTo(-2 * u, 0); ctx.lineTo(-6 * u, 8 * u); ctx.closePath();
  ctx.fillStyle = `rgba(255,230,168,${0.65 + pulse * 0.35})`;
  ctx.fill();
  ctx.strokeStyle = '#3a2806';
  ctx.lineWidth = 1.2 * u;
  ctx.stroke();
  ctx.restore();
}

// ----- "Saved" indicator (bottom-left, a turning sigil for a moment)
let savedT = 0;
export function noteSaved() {
  savedT = 1.8;
}
function drawSaved(ctx: Ctx, H: number, u: number, sal: number, sab: number, dt: number) {
  if (savedT <= 0) return;
  savedT -= dt;
  const a = Math.min(1, savedT * 2.5, (1.8 - savedT) * 6);
  const x = 16 + sal + 8 * u, y = H - sab - 18 * u;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.rotate(G.time * 3);
  ctx.strokeStyle = '#f6dea0';
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * 6 * u, Math.sin(ang) * 6 * u);
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = a;
  text(ctx, 'Saved', x + 12 * u, y + 3.5 * u, `600 ${9.5 * u}px ${FONT_DISPLAY}`, '#f6dea0', 'left');
  ctx.globalAlpha = 1;
}

let comboShown = 0;
let comboPop = 0;
let comboFade = 0;
let comboLast = 0;

/** Hit counter on the right edge: pops on every hit, ranks at 10/20/35/50. */
function drawCombo(ctx: Ctx, W: number, H: number, u: number, touch: boolean, sar: number) {
  const p = G.world.player;
  const n = p.comboHits;
  if (n !== comboShown) {
    if (n > comboShown) comboPop = 1;
    if (n > 0) comboLast = n;
    comboShown = n;
  }
  comboPop = Math.max(0, comboPop - 0.12);
  comboFade = n >= 3 ? Math.min(1, comboFade + 0.2) : Math.max(0, comboFade - 0.05);
  if (comboFade <= 0) return;
  const shown = n >= 3 ? n : comboLast;
  const x = W - sar - (touch ? 74 : 26) * u;
  const y = H * (touch ? 0.36 : 0.42);
  ctx.save();
  ctx.globalAlpha *= comboFade;
  const sc = 1 + comboPop * 0.35;
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  const rank = n >= 3 ? p.comboRank() : '';
  const hot = n >= 20;
  ctx.font = `900 ${26 * u}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(6,4,10,0.9)';
  ctx.strokeText(String(shown), 0, 0);
  const g = ctx.createLinearGradient(0, -24 * u, 0, 0);
  g.addColorStop(0, '#fff6dc');
  g.addColorStop(0.55, hot ? '#ffcf6b' : '#f2d48a');
  g.addColorStop(1, hot ? '#e2733a' : '#b8914a');
  ctx.fillStyle = g;
  ctx.fillText(String(shown), 0, 0);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= comboFade;
  text(ctx, 'HITS', x, y + 9 * u, `700 ${8 * u}px ${FONT_DISPLAY}`, '#e2b85a', 'right');
  if (rank) text(ctx, rank, x, y + 21 * u, `700 ${9.5 * u}px ${FONT_DISPLAY}`, hot ? '#ffcf6b' : '#f6dea0', 'right');
  // Time left before the chain drops.
  const f = clamp(p.comboT / 1.7, 0, 1);
  ctx.fillStyle = 'rgba(8,6,12,0.7)';
  ctx.fillRect(x - 46 * u, y + 28 * u, 46 * u, 2.5 * u);
  ctx.fillStyle = hot ? '#ffcf6b' : '#e2b85a';
  ctx.fillRect(x - 46 * u * f, y + 28 * u, 46 * u * f, 2.5 * u);
  ctx.restore();
}

function text(ctx: Ctx, t: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(6,4,10,0.85)';
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
}

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, f: number, ghost: number, cols: [string, string, string]) {
  ctx.fillStyle = 'rgba(8,6,12,0.85)';
  ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x, y, w, h);
  if (ghost > f) {
    ctx.fillStyle = 'rgba(255,240,220,0.55)';
    ctx.fillRect(x, y, w * ghost, h);
  }
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, cols[2]);
  g.addColorStop(0.45, cols[1]);
  g.addColorStop(1, cols[0]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * f, h);
  ctx.strokeStyle = 'rgba(226,184,90,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
}

function slotBox(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(12,9,16,0.85)';
  roundRect(ctx, x, y, s, s, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(226,184,90,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function wrap(ctx: Ctx, t: string, w: number): string[] {
  const words = t.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(test).width > w && cur) {
      out.push(cur);
      cur = wd;
    } else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}

function minimap(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const s = G.save;
  const cur = ROOMS[G.world.room.id];
  ctx.fillStyle = 'rgba(8,6,12,0.7)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(226,184,90,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  const scale = 7;
  const cx = cur.map.x + (cur.w / 16) / 2, cyy = cur.map.y + (cur.h / 16) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const ch = chapterOf(cur.id);
  for (const id of s.visited) {
    const rm = ROOMS[id];
    if (!rm || chapterOf(id) !== ch) continue;
    const rx = x + w / 2 + (rm.map.x - cx) * scale, ry = y + h / 2 + (rm.map.y - cyy) * scale;
    const rw = (rm.w / 16) * scale, rh = (rm.h / 16) * scale;
    ctx.fillStyle = id === cur.id ? 'rgba(226,184,90,0.45)' : 'rgba(150,130,170,0.25)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = id === cur.id ? '#f6dea0' : 'rgba(200,180,220,0.4)';
    ctx.strokeRect(rx, ry, rw, rh);
  }
  const p = G.world.player;
  const px = x + w / 2 + (cur.map.x + p.x / 256 - cx) * scale, py = y + h / 2 + (cur.map.y + p.y / 256 - cyy) * scale;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Rounds 1 to 5 are chalked as tally marks, later rounds as a numeral. A new
 * round flashes white and settles to red; between rounds the counter pulses.
 */
function drawRounds(ctx: CanvasRenderingContext2D, W: number, y0: number, u: number) {
  const R = G.world.story.ch3.rounds;
  if (!R.active || R.round <= 0) return;
  const n = R.round;
  if (R.bossOnly) {
    // Leave room for the phone's boss health bar above this compact round label.
    const y = y0 + (input.lastDevice === 'touch' && G.world.bossActive ? 38 : 10) * u;
    const best = Number(G.save.flags.boss_trial_best ?? 0);
    text(ctx, R.breakT > 0 ? `BOSS ROUND ${n + 1} IN ${Math.ceil(R.breakT)}` : `BOSS ROUND ${n}`, W / 2, y, `700 ${10 * u}px ${FONT_DISPLAY}`, '#c8ccff', 'center');
    text(ctx, `${R.kills} defeated · best ${best}`, W / 2, y + 13 * u, `600 ${8 * u}px ${FONT_DISPLAY}`, '#d8c8b0', 'center');
    return;
  }
  const flash = clamp(1 - R.changeT / 1.6, 0, 1);
  const pulse = R.breakT > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(R.breakT * 3)) : 1;
  const col = flash > 0 ? mixHex('#b3121c', '#fff4e0', flash) : '#b3121c';
  const cx = W / 2, top = y0 + 4 * u;
  ctx.save();
  ctx.globalAlpha *= pulse;
  if (n <= 5) {
    // Chalk tallies: four strokes and a slash across them.
    const h = 30 * u, gap = 8 * u;
    const w = Math.min(n, 4) * gap;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? col : 'rgba(10,0,2,0.75)';
      ctx.lineWidth = (pass ? 4 : 7) * u;
      ctx.beginPath();
      for (let i = 0; i < Math.min(n, 4); i++) {
        const x = cx - w / 2 + i * gap + gap / 2;
        ctx.moveTo(x - 0.8 * u, top + 1 * u);
        ctx.lineTo(x + 0.8 * u, top + h);
      }
      if (n === 5) {
        ctx.moveTo(cx - w / 2 - 2 * u, top + h * 0.75);
        ctx.lineTo(cx + w / 2 + 2 * u, top + h * 0.3);
      }
      ctx.stroke();
    }
  } else {
    const size = (36 + flash * 10) * u;
    ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = 'rgba(10,0,2,0.8)';
    ctx.strokeText(`${n}`, cx, top);
    ctx.fillStyle = col;
    ctx.fillText(`${n}`, cx, top);
  }
  ctx.restore();
  const best = Math.max(Number(G.save.flags.trial_best ?? 0), n);
  const line = R.breakT > 0 ? `Round ${n + 1} in ${Math.ceil(R.breakT)}` : `${R.left} left  ·  ${R.kills} kills  ·  best ${best}`;
  text(ctx, line, cx, top + 42 * u, `600 ${8 * u}px ${FONT_DISPLAY}`, '#d8c8b0', 'center');
  const boons = [R.wrathT > 0 ? `WRATH ${Math.ceil(R.wrathT)}` : '', R.doubleT > 0 ? `DOUBLE PORTION ${Math.ceil(R.doubleT)}` : ''].filter(Boolean).join('   ');
  if (boons) text(ctx, boons, cx, top + 53 * u, `700 ${8 * u}px ${FONT_DISPLAY}`, '#ffb35a', 'center');
  if (R.contract) text(ctx, `${CONTRACTS[R.contract].name} · ${R.contractComplete ? 'COMPLETE' : `${R.contractCleared}/5`}`, cx, top + (boons ? 64 : 53) * u, `600 ${8 * u}px ${FONT_DISPLAY}`, '#b6d7d4', 'center');
}

/** Blend two #rrggbb colours. */
function mixHex(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}
