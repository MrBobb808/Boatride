// Boot: fonts, renderer, input, audio unlock, UI, then a fixed-step loop
// (120 Hz logic so ProMotion displays get perfectly smooth motion).

import './ui/styles.css';
import { loadFonts } from './fonts';
import { Renderer, Camera } from './render/renderer';
import { input } from './core/input';
import { settings, isTouchDevice, isIOS, onSettingsChange } from './core/settings';
import { audio } from './audio/audio';
import { music } from './audio/music';
import { G } from './game/ctx';
import { World } from './game/world';
import { fx } from './render/fx';
import { initUI, blockingUI } from './ui/ui';
import { installNav, layerCount } from './ui/dom';
import { initTouch, setTouchVisible, updateTouch, layout as layoutTouch } from './ui/touch';
import { drawHud, tickFps, currentFps } from './ui/hud';
import { measureSafe } from './ui/safe';
import { app, setAppHooks, loadGameSlot, startNewGame } from './app';
import { showTitle, hideTitle, drawTitleScene, startIntro, drawIntro, updateIntro } from './ui/screens';
import { openMenu, applyTextSize, isMenuOpen } from './ui/menus';
import { derive, makeItem, makeEcho } from './game/state';
import { ITEMS } from './game/data';

const STEP = 1 / 120;

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  applyTextSize();
  await loadFonts();
  const renderer = new Renderer(canvas);
  const camera = new Camera(renderer);
  G.renderer = renderer;
  G.camera = camera;
  fx.setTier(renderer.tier);
  renderer.onResize(() => {
    fx.setTier(renderer.tier);
    measureSafe();
    layoutTouch();
  });
  measureSafe();
  input.bindMouse(canvas);
  initUI();
  installNav();
  initTouch(document.getElementById('touch')!);
  G.world = new World();
  setAppHooks({ showTitle, hideTitle, startIntro });
  onSettingsChange(() => {
    renderer.resize();
  });
  if (isTouchDevice()) {
    document.getElementById('rotate')!.classList.add('enabled');
    input.setDevice('touch');
  }
  // iOS: stop pinch-zoom, double-tap zoom and rubber-banding; keep menu lists scrollable.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.scroll, .tabs, textarea')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // Audio must start from a user gesture on iOS.
  const unlock = () => {
    audio.unlock();
    music.start();
    if (app.mode === 'title' && !music.name) music.play('title');
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, unlock, { capture: true, passive: true });

  // Any finger on the glass brings the touch controls back (e.g. after a controller was used).
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') input.setDevice('touch');
  }, { capture: true, passive: true });

  // Pause menu hotkeys during play.
  input.onAction((a) => {
    if (app.mode !== 'game' || layerCount() > 0 || G.inCutscene) return;
    if (a === 'menu') openMenu();
    else if (a === 'map') openMenu('map');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.mode === 'game' && !isMenuOpen() && !G.inCutscene && layerCount() === 0) {
      openMenu();
    }
  });

  setupDebug();
  registerSW();

  const bootEl = document.getElementById('boot')!;
  bootEl.classList.add('hide');
  setTimeout(() => bootEl.remove(), 800);

  const params = new URLSearchParams(location.search);
  if (params.has('autostart')) {
    startNewGame(2, true);
  } else {
    app.mode = 'title';
    showTitle();
  }
  requestAnimationFrame(loop);
}

const perf = { update: 0, draw: 0, hud: 0, frames: 0 };
let last = 0;
let acc = 0;
let renderAcc = 0;
let slowFrames = 0;
let fastFrames = 0;

function loop(now: number) {
  requestAnimationFrame(loop);
  const r = G.renderer;
  let dt = last ? (now - last) / 1000 : STEP;
  last = now;
  if (dt > 0.25) dt = 0.25;
  // Optional 60 FPS cap (battery saver) on 120 Hz displays.
  if (settings.fps === '60') {
    renderAcc += dt;
    if (renderAcc < 1 / 60 - 0.002) return;
    dt = renderAcc;
    renderAcc = 0;
  }
  tickFps(dt);
  input.poll();
  const ctx = r.ctx;
  if (app.mode === 'game') {
    const blocked = G.paused || blockingUI();
    acc += dt;
    let steps = 0;
    const u0 = performance.now();
    while (acc >= STEP && steps < 8) {
      input.beginStep();
      if (!blocked) G.world.update(STEP);
      else G.camera.update(STEP, G.world.player.x, G.world.player.y, G.world.player.face, 0, 0);
      input.endStep();
      acc -= STEP;
      steps++;
    }
    if (steps >= 8) acc = 0;
    if (G.debug) perf.update += performance.now() - u0;
    if (!G.d && G.save) G.d = derive(G.save);
    const t0 = performance.now();
    G.world.draw(ctx);
    const t1 = performance.now();
    drawHud(ctx, dt);
    if (G.debug) {
      perf.draw += t1 - t0;
      perf.hud += performance.now() - t1;
      perf.frames++;
    }
    const showTouch = input.lastDevice === 'touch' && layerCount() === 0;
    setTouchVisible(showTouch);
    updateTouch();
  } else {
    setTouchVisible(false);
    input.beginStep();
    input.endStep();
    if (app.mode === 'intro') {
      updateIntro(dt);
      drawIntro(ctx, r.bw, r.bh, dt);
    } else drawTitleScene(ctx, r.bw, r.bh, dt);
  }
  adaptQuality(dt);
}

/** Auto quality: drop resolution if frames are consistently slow, recover if fast. */
function adaptQuality(dt: number) {
  if (settings.quality !== 'auto' || app.mode !== 'game') return;
  const r = G.renderer;
  if (dt > 1 / 42) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 0.25);
  if (dt < 1 / 100) fastFrames++;
  else fastFrames = 0;
  if (slowFrames > 90 && r.autoPenalty < 2) {
    r.autoPenalty++;
    slowFrames = 0;
    r.resize();
  } else if (fastFrames > 600 && r.autoPenalty > 0) {
    r.autoPenalty--;
    fastFrames = 0;
    r.resize();
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  if (import.meta.env.DEV) return;
  if (window.top !== window) return; // embedded (e.g. Artifact viewer): no workers there
  const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {
    /* sandboxed frames (e.g. embedded previews) cannot register workers */
  });
  if (document.readyState === 'complete') reg();
  else window.addEventListener('load', reg);
}

function setupDebug() {
  const params = new URLSearchParams(location.search);
  if (!params.has('debug')) return;
  G.debug = true;
  const api = {
    G,
    warp(room: string, spawn = 'altar') {
      G.world.transition(room, spawn);
    },
    give(id: string, rarity?: number) {
      const base = ITEMS[id];
      if (base.slot === 'material') G.world.collect({ mat: id, n: 5 });
      else if (base.slot === 'key') G.save.keyItems.push(id);
      else G.save.inventory.push(makeItem(id, rarity as 0));
    },
    level(n: number) {
      G.world.giveXp(n);
    },
    god() {
      G.save.stats.vit = 99;
      G.save.stats.str = 40;
      G.d = derive(G.save);
      G.save.hp = G.d.maxHp;
    },
    flag(name: string, v: boolean | number | string = true) {
      G.save.flags[name] = v;
    },
    echo(species = 'sentinel') {
      const e = makeEcho(species);
      G.save.echoes.push(e);
      G.save.active.push(e.uid);
      G.world.summonEchoes();
    },
    fps: () => currentFps(),
    perf: () => {
      const n = Math.max(1, perf.frames);
      const out = { update: +(perf.update / n).toFixed(2), draw: +(perf.draw / n).toFixed(2), hud: +(perf.hud / n).toFixed(2), frames: perf.frames };
      perf.update = perf.draw = perf.hud = perf.frames = 0;
      return out;
    },
    load: (slot: number) => loadGameSlot(slot),
    ios: isIOS(),
  };
  (window as unknown as { __remnant: typeof api }).__remnant = api;
}

boot();
