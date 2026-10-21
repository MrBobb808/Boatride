// Title screen (animated canvas scene + DOM menu) and the story introduction.

import { G } from '../game/ctx';
import { h, btn, pushLayer, popLayer, clear } from './dom';
import { listSlots, lastSlot, loadSlot, SLOT_COUNT, deleteSlot, syncFromCloud } from '../game/save';
import { startNewGame, loadGameSlot } from '../app';
import { isIOS, isStandalone, settings } from '../core/settings';
import { music } from '../audio/music';
import { sfx } from '../audio/audio';
import { ROOMS } from '../game/rooms';
import { formatTime, rand, RNG } from '../core/math';
import { glow, rgba, poly, circle, type Ctx } from '../render/draw';
import { solve, newJoints, BASE_POSE } from '../render/skeleton';
import { drawHumanoid, type HumanStyle } from '../render/actors';
import { drawHeroSprite, heroSpriteReady } from '../render/heroSprites';
import { DIMS } from '../game/player';
import { openSettingsStandalone } from './settingsStandalone';
import { input } from '../core/input';

let titleEl: HTMLElement | null = null;

// ---------------------------------------------------------------- title scene (canvas)

interface Mote { x: number; y: number; vx: number; vy: number; s: number; a: number }
const motes: Mote[] = [];
const titleJoints = newJoints();
const titlePose = { ...BASE_POSE, head: -0.12, bUA: -0.1, bFA: 0.2, fUA: 0.05, fFA: 0.1, wpn: -0.2, fTh: 0.08, fSh: -0.05, bTh: -0.1, bSh: -0.05 };
let sceneT = 0;

const ELIOR_STYLE: HumanStyle = {
  skin: '#70452f', hair: '#f1f3ed', beard: '#e9ede7', hairKind: 'spiky', coat: '#1f2a48', coatDark: '#19203a', skirt: 9, trim: '#e2b85a', pants: '#38302e', boots: '#3d2c22',
  glove: '#4a3426', belt: '#3a2a1a', plate: null, helm: 'none', eye: '#ffd27a', eyeGlow: 0, outline: '#050408', weapon: 'blade', weaponColor: '#d8d1be',
  offhand: 'none', bulk: 1, scarf: '#8f2a2a', flat: false,
};

export function drawTitleScene(ctx: Ctx, w: number, hgt: number, dt: number) {
  sceneT += dt;
  const t = sceneT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, hgt);
  g.addColorStop(0, '#07060c');
  g.addColorStop(0.55, '#1c1428');
  g.addColorStop(1, '#3a2236');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hgt);
  const u = hgt / 100;
  // moon & god rays
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, w * 0.7, hgt * 0.26, 60 * u, '#a36a8a', 0.4);
  glow(ctx, w * 0.7, hgt * 0.26, 14 * u, '#f1d9b0', 0.9);
  for (let i = 0; i < 5; i++) {
    const x = w * (0.55 + i * 0.06) + Math.sin(t * 0.2 + i) * 10 * u;
    const gr = ctx.createLinearGradient(0, 0, 0, hgt);
    gr.addColorStop(0, rgba('#ffd9a0', 0.05 + 0.02 * Math.sin(t * 0.7 + i)));
    gr.addColorStop(1, rgba('#ffd9a0', 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x - 3 * u, 0);
    ctx.lineTo(x + 3 * u, 0);
    ctx.lineTo(x + 26 * u, hgt);
    ctx.lineTo(x + 6 * u, hgt);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // distant ruined cathedral
  const rng = new RNG(7);
  ctx.fillStyle = '#140f1c';
  const base = hgt * 0.78;
  ctx.fillRect(0, base, w, hgt - base);
  const cx = w * 0.74;
  poly(ctx, [cx - 30 * u, base, cx - 30 * u, base - 30 * u, cx - 18 * u, base - 44 * u, cx - 6 * u, base - 30 * u, cx - 6 * u, base], '#140f1c');
  poly(ctx, [cx - 4 * u, base, cx - 4 * u, base - 52 * u, cx + 4 * u, base - 66 * u, cx + 12 * u, base - 52 * u, cx + 12 * u, base], '#120d19');
  poly(ctx, [cx + 14 * u, base, cx + 14 * u, base - 26 * u, cx + 24 * u, base - 36 * u, cx + 34 * u, base - 22 * u, cx + 34 * u, base], '#140f1c');
  ctx.fillStyle = rgba('#ffcf6b', 0.5 + Math.sin(t * 2) * 0.1);
  ctx.fillRect(cx + 2 * u, base - 44 * u, 4 * u, 7 * u);
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, w), bh = rng.range(4, 16) * u;
    ctx.fillStyle = '#0f0b15';
    ctx.fillRect(x, base - bh, rng.range(6, 18) * u, bh + 2);
  }
  // cliff + Elior
  ctx.fillStyle = '#08060c';
  ctx.beginPath();
  ctx.moveTo(0, hgt);
  ctx.lineTo(0, hgt * 0.74);
  ctx.quadraticCurveTo(w * 0.34, hgt * 0.68, w * 0.52, hgt * 0.75);
  ctx.lineTo(w * 0.58, hgt);
  ctx.closePath();
  ctx.fill();
  const ex = w * (w / hgt > 1.7 ? 0.55 : 0.58), ey = hgt * (hgt / G.renderer.px < 480 ? 0.84 : 0.79);
  const s = u * 0.72;
  titlePose.lean = 0.02 + Math.sin(t * 1.2) * 0.01;
  const j = solve(titlePose, DIMS, true, titleJoints);
  // The same illustrated hero and attachments used during play, with a clear face.
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(s, s);
  if (heroSpriteReady(ELIOR_STYLE, 'free', 0)) drawHeroSprite(ctx, j, ELIOR_STYLE, t, 'free', 0, true, 0, 0, 0);
  else drawHumanoid(ctx, j, ELIOR_STYLE, t);
  ctx.restore();
  // embers
  if (motes.length < 70) motes.push({ x: rand(0, w), y: hgt + 10, vx: rand(-10, 10) * u * 0.1, vy: rand(-30, -10) * u * 0.1, s: rand(0.3, 0.8) * u, a: rand(0.4, 1) });
  ctx.globalCompositeOperation = 'lighter';
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.x += (m.vx + Math.sin(t + i) * 0.2 * u) * dt * 10;
    m.y += m.vy * dt * 10;
    if (m.y < -10) { motes.splice(i, 1); continue; }
    glow(ctx, m.x, m.y, m.s * 3, '#ff9a3a', m.a * 0.8);
  }
  ctx.globalCompositeOperation = 'source-over';
  // vignette
  const v = ctx.createRadialGradient(w / 2, hgt / 2, hgt * 0.3, w / 2, hgt / 2, w * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, hgt);
}

// ---------------------------------------------------------------- title menu (DOM)

export function showTitle() {
  hideTitle();
  music.play('title');
  const menu = h('div', { class: 'title-menu' });
  const root = h('div', { class: 'title-screen' },
    h('div', { class: 'logo' },
      h('h1', null, 'REMNANT'),
      h('div', { class: 'sub' }, 'Ascension'),
      h('div', { class: 'art-release' }, 'THE REMNANT AWAKENS'),
      h('div', { class: 'verse' }, '“For we wrestle not against flesh and blood, but against principalities, against powers, against the rulers of the darkness of this world, against spiritual wickedness in high places.” ', h('b', null, 'EPHESIANS 6:12 (KJV)')),
    ),
    menu,
    h('div', { class: 'title-foot' }, 'Chapters I–V · The Ashen Village, The Tower of Shinar, The Valley of Bones, The Plain of Dura, The Writing on the Wall. A work of fiction; scripture quoted from the KJV.'),
  );
  let last = lastSlot();
  const build = () => {
    clear(menu);
    last = lastSlot();
    const d = last !== null ? loadSlot(last) : null;
    if (last !== null && d) {
      const where = ROOMS[d.room]?.name ?? '';
      const slot = last;
      menu.appendChild(btn([h('b', null, 'Continue'), h('span', { class: 'cont-meta' }, `Level ${d.level} · ${where} · ${formatTime(d.playtime)}`)],
        () => { if (loadGameSlot(slot)) sfx('uiConfirm'); }, 'btn primary cont', { 'data-autofocus': '' }));
    }
    menu.appendChild(btn('New game', () => pickSlot('new'), last === null ? 'btn primary' : 'btn', last === null ? { 'data-autofocus': '' } : {}));
    if (listSlots().some((s) => s.data)) menu.appendChild(btn('Load game', () => pickSlot('load')));
    menu.appendChild(btn('Settings', () => openSettingsStandalone()));
    menu.appendChild(btn('Credits', () => G.ui.showCredits()));
    if (isIOS() && !isStandalone()) {
      menu.appendChild(h('div', { class: 'install-hint' }, 'Play full-screen and offline: tap ', h('b', null, 'Share'), ' then ', h('b', null, 'Add to Home Screen'), '.'));
    }
  };
  build();
  // A newer save from the cloud (claude.ai preview) redraws the menu.
  void syncFromCloud().then((changed) => {
    if (changed && titleEl === root) build();
  });
  titleEl = root;
  document.getElementById('ui')!.appendChild(root);
  pushLayer({ el: root });
}

export function hideTitle() {
  if (titleEl) {
    popLayer(titleEl);
    titleEl = null;
  }
}

function pickSlot(mode: 'new' | 'load') {
  const slots = listSlots();
  const card = h('div', { class: 'choice-card panel scroll' },
    h('div', { class: 'eyebrow' }, mode === 'new' ? 'New game' : 'Load game'),
    h('h2', { class: 'title-text' }, mode === 'new' ? 'Choose a save slot' : 'Choose a journey'),
    h('div', { class: 'saves', style: 'margin-top:10px' }, slots.map((sl) => {
      const d = sl.data;
      const meta = d ? `Level ${d.level} · ${ROOMS[d.room]?.name ?? ''} · ${formatTime(d.playtime)}${d.ng ? ' · NG+' + (d.ng > 1 ? d.ng : '') : ''}` : 'Empty';
      return h('div', { class: 'save-slot' },
        h('div', null, h('b', null, `Slot ${sl.slot + 1}`), h('div', { class: 'meta' }, meta)),
        h('div', { class: 'acts' },
          mode === 'load'
            ? (d ? btn('Load', () => { close(); loadGameSlot(sl.slot); }, 'btn small primary') : null)
            : btn(d ? 'Overwrite' : 'Begin', () => {
              if (d && !confirmSlots.has(sl.slot)) { confirmSlots.add(sl.slot); close(); pickSlot(mode); return; }
              close();
              confirmSlots.clear();
              begin(sl.slot);
            }, 'btn small primary'),
          mode === 'new' && d && confirmSlots.has(sl.slot) ? h('span', { class: 'down', style: 'font-size:0.8em;align-self:center' }, 'Tap again to erase') : null,
          mode === 'load' && d ? btn('Delete', () => { deleteSlot(sl.slot); close(); pickSlot(mode); }, 'btn small') : null,
        ));
    })),
    h('div', { style: 'margin-top:12px' }, btn('Back', () => close(), 'btn small')),
  );
  const layer = h('div', { class: 'layer dim' }, card);
  document.getElementById('ui')!.appendChild(layer);
  const close = () => popLayer(layer);
  pushLayer({ el: layer, onBack: close });
}
const confirmSlots = new Set<number>();

function begin(slot: number) {
  sfx('uiConfirm');
  startNewGame(slot);
}

// ---------------------------------------------------------------- intro

const INTRO: { text: string; scene: number }[] = [
  { scene: 0, text: 'Long ago, seven kingdoms stood beneath an ancient covenant, and their lamps burned through every night.' },
  { scene: 1, text: 'Generation by generation, their rulers traded faithfulness for pride, and bowed to powers that were never theirs to serve.' },
  { scene: 2, text: 'A presence called the Hollow Sovereign answered their ambition. It promised freedom from weakness, from suffering, from death.' },
  { scene: 3, text: 'Instead came the Veil. Fortresses fell. Cities were swallowed. Armies became husks that remember nothing but hunger.' },
  { scene: 4, text: 'The few who remained hid in sanctuaries, keeping small lamps burning against the dark.' },
  { scene: 5, text: 'In the sanctuary of Hearthward, a young watchman named Elior stood the night watch. He was not strong. He had not been chosen by anyone. Not yet.' },
];

let intro: { i: number; t: number; done: () => void; el: HTMLElement; p: HTMLElement } | null = null;

export function startIntro(done: () => void) {
  music.play('title');
  const p = h('p', null, '');
  const skip = btn('Skip', () => endIntro(), 'btn small skip');
  const el = h('div', { class: 'intro' }, p, skip);
  document.getElementById('ui')!.appendChild(el);
  pushLayer({ el, onBack: () => endIntro() });
  el.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    next();
  });
  intro = { i: -1, t: 0, done, el, p };
  next();
}

const offIntro = input.onAction((a, rep) => {
  if (!intro || rep) return;
  if (a === 'confirm' || a === 'attack' || a === 'jump') next();
});
void offIntro;

function next() {
  if (!intro) return;
  intro.i++;
  intro.t = 0;
  if (intro.i >= INTRO.length) return endIntro();
  const p = intro.p;
  p.style.opacity = '0';
  setTimeout(() => {
    if (!intro) return;
    p.textContent = INTRO[intro.i].text;
    p.style.opacity = '1';
  }, 450);
}

function endIntro() {
  if (!intro) return;
  const it = intro;
  intro = null;
  popLayer(it.el);
  G.ui.fade(1, 0.6).then(() => {
    it.done();
    G.ui.fade(0, 1.2);
  });
}

export function updateIntro(dt: number) {
  if (!intro) return;
  intro.t += dt;
  const dur = 6.5 + INTRO[Math.max(0, intro.i)].text.length * 0.02;
  if (intro.t > dur) next();
}

export function drawIntro(ctx: Ctx, w: number, hgt: number, dt: number) {
  if (!intro) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, hgt);
    return;
  }
  const sc = INTRO[Math.max(0, intro.i)].scene;
  const t = intro.t;
  const u = hgt / 100;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, hgt);
  const warm = sc === 0 || sc === 4;
  sky.addColorStop(0, sc >= 2 && sc <= 3 ? '#08040c' : '#0a0812');
  sky.addColorStop(1, warm ? '#3a2416' : sc === 3 ? '#2a0f3a' : '#1c1428');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hgt);
  const base = hgt * 0.8;
  const zoom = 1 + t * 0.012;
  ctx.save();
  ctx.translate(w / 2, base);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -base);
  if (sc <= 2) {
    // seven towers under the covenant sigil
    ctx.globalCompositeOperation = 'lighter';
    const fade = sc === 0 ? 1 : sc === 1 ? Math.max(0.15, 1 - t * 0.15) : 0.1;
    ctx.strokeStyle = rgba('#ffd27a', 0.6 * fade);
    ctx.lineWidth = 0.6 * u;
    ctx.beginPath();
    ctx.arc(w / 2, hgt * 0.32, 16 * u, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.05;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * 16 * u, hgt * 0.32 + Math.sin(a) * 16 * u);
      ctx.lineTo(w / 2 + Math.cos(a) * 21 * u, hgt * 0.32 + Math.sin(a) * 21 * u);
      ctx.stroke();
    }
    glow(ctx, w / 2, hgt * 0.32, 30 * u, '#ffcf6b', 0.35 * fade);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 7; i++) {
      const x = w * (0.14 + i * 0.12), th = (20 + (i % 3) * 7) * u;
      const tilt = sc >= 1 ? Math.min(t * 0.02, 0.12) * (i % 2 ? 1 : -1) : 0;
      ctx.save();
      ctx.translate(x, base);
      ctx.rotate(tilt);
      poly(ctx, [-3 * u, 0, -3 * u, -th, 0, -th - 6 * u, 3 * u, -th, 3 * u, 0], '#120d18');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -th - 7 * u, 4 * u, sc === 0 ? '#ffd27a' : '#b04cff', sc === 0 ? 0.9 : Math.min(0.9, t * 0.2));
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  }
  if (sc === 2) {
    // the Hollow Sovereign looms
    const a = Math.min(1, t * 0.25);
    ctx.globalAlpha = a;
    const cx = w / 2, cy = hgt * 0.42;
    ctx.fillStyle = '#05030a';
    ctx.beginPath();
    ctx.moveTo(cx - 40 * u, base);
    ctx.quadraticCurveTo(cx - 34 * u, cy, cx - 12 * u, cy - 14 * u);
    ctx.quadraticCurveTo(cx, cy - 24 * u, cx + 12 * u, cy - 14 * u);
    ctx.quadraticCurveTo(cx + 34 * u, cy, cx + 40 * u, base);
    ctx.fill();
    for (let i = 0; i < 7; i++) poly(ctx, [cx - 12 * u + i * 4 * u, cy - 16 * u, cx - 10 * u + i * 4 * u, cy - 30 * u - (i % 2) * 6 * u, cx - 8 * u + i * 4 * u, cy - 16 * u], '#05030a');
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx - 4 * u, cy - 8 * u, 4 * u, '#b04cff', a);
    glow(ctx, cx + 4 * u, cy - 8 * u, 4 * u, '#b04cff', a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (sc === 3) {
    // the Veil spreads; husks march
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) glow(ctx, w * (i / 13), base - 6 * u + Math.sin(t + i) * 2 * u, 22 * u, '#8a2ad6', 0.18 + Math.min(0.2, t * 0.04));
    ctx.globalCompositeOperation = 'source-over';
    poly(ctx, [w * 0.6, base, w * 0.6, base - 30 * u, w * 0.66, base - 36 * u, w * 0.7, base - 22 * u, w * 0.74, base - 28 * u, w * 0.74, base], '#100a16');
    for (let i = 0; i < 9; i++) {
      const x = ((w * 0.1 + i * 9 * u + t * 2 * u) % (w * 0.6));
      const y = base;
      ctx.fillStyle = '#0a0610';
      ctx.beginPath();
      ctx.ellipse(x, y - 5 * u, 1.6 * u, 4.5 * u, 0.4, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, x + 1.4 * u, y - 10 * u, 1.4 * u, '#0a0610');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + 1.8 * u, y - 10 * u, 1.2 * u, '#ff3355', 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (sc === 4 || sc === 5) {
    // Hearthward on its hill
    ctx.fillStyle = '#0b0810';
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.quadraticCurveTo(w * 0.5, base - 18 * u, w, base);
    ctx.lineTo(w, hgt);
    ctx.lineTo(0, hgt);
    ctx.fill();
    const rng = new RNG(3);
    for (let i = 0; i < 12; i++) {
      const x = w * 0.3 + rng.range(0, w * 0.4), y = base - 10 * u - rng.range(0, 6) * u;
      ctx.fillStyle = '#0d0a12';
      ctx.fillRect(x - 3 * u, y - 4 * u, 6 * u, 6 * u);
      poly(ctx, [x - 4 * u, y - 4 * u, x, y - 8 * u, x + 4 * u, y - 4 * u], '#0d0a12');
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 1 * u, 3 * u, '#ffb35c', 0.7 + Math.sin(t * 3 + i) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (sc === 5) {
      // the wall and the watchman
      ctx.fillStyle = '#08060c';
      ctx.fillRect(w * 0.12, base - 14 * u, w * 0.2, 14 * u + 2);
      for (let i = 0; i < 6; i++) ctx.fillRect(w * 0.12 + i * w * 0.036, base - 17 * u, w * 0.02, 3 * u);
      const s = u * 0.5;
      const j = solve({ ...BASE_POSE, head: -0.1, fUA: 0.4, fFA: 0.6, wpn: 1.4 }, DIMS, true, newJoints());
      ctx.save();
      ctx.translate(w * 0.24, base - 14 * u);
      ctx.scale(s, s);
      drawHumanoid(ctx, j, { ...ELIOR_STYLE, offhand: 'lantern', weapon: 'spear' }, t);
      ctx.restore();
    }
  }
  ctx.restore();
  // letterbox + vignette
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, hgt * 0.08);
  ctx.fillRect(0, hgt * 0.92, w, hgt * 0.08);
  void dt;
}

export { SLOT_COUNT, settings };
