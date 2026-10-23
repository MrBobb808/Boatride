import { loadFallenArt, fallenArtReady } from './render/fallenArt';
// Boot: fonts, renderer, input, audio unlock, UI, then a fixed-step loop
// (120 Hz logic so ProMotion displays get perfectly smooth motion).

import './ui/styles.css';
import { loadFonts } from './fonts';
import { Renderer, Camera } from './render/renderer';
import { input } from './core/input';
import { FrameBudget } from './core/frameBudget';
import { settings, isTouchDevice, isIOS, onSettingsChange } from './core/settings';
import { audio } from './audio/audio';
import { music } from './audio/music';
import { G } from './game/ctx';
import { World } from './game/world';
import { ROOMS } from './game/rooms';
import { swimTestRoom } from './game/water';
import { waterMuffled } from './game/swim';
import { bubbleCount } from './render/underwater';
import { makeEnemy } from './game/foes';
import type { EnemyKind } from './game/tiles';
import { setDetail } from './render/actors';
import { loadCreatureSprites, creatureArtStatus } from './render/creatureSprites';
import { fx } from './render/fx';
import { bakeStats } from './render/environment';
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
import { startTraining, startDaily } from './game/chapters';
import { heroSpriteReady } from './render/heroSprites';
import { flush as flushCloud, initCloud } from './game/cloud';
import { checkForUpdate, applyUpdate, takeResumeSlot, updatePending } from './core/update';
import { valorTrack, unlock, TROPHIES } from './game/valor';
import { dailyFor, dayKey } from './game/daily';

const STEP = 1 / 120;

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  applyTextSize();
  await Promise.all([loadFonts(), loadCreatureSprites(), loadFallenArt()]);
  const renderer = new Renderer(canvas);
  const camera = new Camera(renderer);
  G.renderer = renderer;
  G.camera = camera;
  fx.setTier(renderer.tier);
  setDetail(renderer.tier);
  renderer.onResize(() => {
    fx.setTier(renderer.tier);
    applyEffects();
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
    else if (a === 'voice') G.ui.voiceOrders();
  });

  // Leaving the app (home button, app switcher, closing the tab) saves first.
  const saveNow = () => {
    if (app.mode === 'game' && G.save) G.world.autosave(true);
    flushCloud();
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    saveNow();
    if (app.mode === 'game' && !isMenuOpen() && !G.inCutscene && layerCount() === 0) openMenu();
  });
  window.addEventListener('pagehide', saveNow);

  setupDebug();
  registerSW();
  void initCloud();

  const bootEl = document.getElementById('boot')!;
  bootEl.classList.add('hide');
  setTimeout(() => bootEl.remove(), 800);

  const params = new URLSearchParams(location.search);
  const resume = takeResumeSlot();
  if (resume !== null && loadGameSlot(resume)) {
    setTimeout(() => G.ui.toast('Updated to the newest version. Welcome back.', 'good'), 800);
  } else if (params.has('autostart')) {
    startNewGame(2, true);
  } else {
    app.mode = 'title';
    showTitle();
  }
  requestAnimationFrame(loop);
  // Check during long sessions too; install only at the title or a saved doorway.
  const lookForUpdate = () => {
    if (import.meta.env.DEV || document.hidden || (updatePending() && app.mode !== 'title')) return;
    void checkForUpdate().then((ready) => {
      if (!ready) return;
      if (app.mode === 'title') applyUpdate(null);
      else if (app.mode === 'game') G.ui.toast('An update is ready. It installs at the next doorway; your progress is kept.', 'info');
    });
  };
  setTimeout(lookForUpdate, 4000);
  setInterval(lookForUpdate, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lookForUpdate();
  });
}

const perf = { update: 0, draw: 0, hud: 0, frames: 0 };
let last = 0;
let acc = 0;
let renderAcc = 0;
const frameBudget = new FrameBudget();
let touchAcc = 0;

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
  const frameStart = performance.now();
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
    G.world.draw(r.wctx);
    r.present();
    const t1 = performance.now();
    drawHud(ctx, dt);
    // Bake the rooms behind the doors in idle time, never during a busy fight.
    G.world.prep.pump(G.world.combatHeavy(), dt * 1000 - (performance.now() - frameStart));
    if (G.debug) {
      perf.draw += t1 - t0;
      perf.hud += performance.now() - t1;
      perf.frames++;
    }
    const showTouch = input.lastDevice === 'touch' && layerCount() === 0;
    setTouchVisible(showTouch);
    touchAcc += dt;
    if (showTouch && touchAcc >= 1 / 30) {
      updateTouch();
      touchAcc = 0;
    }
  } else {
    setTouchVisible(false);
    input.beginStep();
    input.endStep();
    if (app.mode === 'intro') {
      updateIntro(dt);
      drawIntro(ctx, r.cw, r.ch, dt);
    } else drawTitleScene(ctx, r.cw, r.ch, dt);
  }
  adaptQuality(dt, performance.now() - frameStart);
}

/**
 * Auto quality: under sustained load shed particles, then lighting resolution and fine
 * detail, and only then resolution; recover one rung at a time when the load passes.
 */
function adaptQuality(dt: number, workMs: number) {
  const r = G.renderer;
  if (settings.quality !== 'auto') {
    frameBudget.reset();
    frameBudget.level = 0;
    setEffects(0);
    return;
  }
  // The tier was reset elsewhere (the quality setting): continue the ladder from there.
  if (FrameBudget.penalty(frameBudget.level) !== r.autoPenalty) frameBudget.level = r.autoPenalty > 0 ? r.autoPenalty + 2 : Math.min(frameBudget.level, 2);
  if (app.mode !== 'game' || G.paused || G.inCutscene || document.hidden) {
    frameBudget.reset();
    return;
  }
  const level = frameBudget.sample(dt, workMs, settings.fps === '60');
  setEffects(FrameBudget.effects(level));
  const pen = FrameBudget.penalty(level);
  if (pen !== r.autoPenalty) { r.autoPenalty = pen; r.resize(); }
}

function setEffects(e: number) {
  if (G.renderer.effects === e) return;
  G.renderer.effects = e;
  applyEffects();
}

/** Particle density and actor detail for the tier and auto quality's effects rung. */
function applyEffects() {
  const r = G.renderer;
  fx.setDensity(r.effects >= 1 ? 0.6 : 1);
  setDetail(r.effects >= 2 ? Math.min(r.tier, 1) : r.tier);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  if (import.meta.env.DEV) return;
  if (window.top !== window) return; // embedded (e.g. Artifact viewer): no workers there
  const reg = () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => {
    void r.update().catch(() => {});
  }).catch(() => {
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
    settings,
    art: creatureArtStatus,
    fallenArt: fallenArtReady,
    hero: () => ({ ready: heroSpriteReady(G.world.player.style, G.world.player.state, G.world.player.mantleT), skin: G.world.player.style.skin, hair: G.world.player.style.hair, beard: G.world.player.style.beard }),
    trial: (bossOnly = false, from = 1) => startTraining(from, bossOnly),
    spawn(kind: EnemyKind, x = G.world.player.x + 90, y = G.world.player.y) {
      return G.world.add(makeEnemy(kind, x, y, null));
    },
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
    prep: () => ({ rooms: G.world.prep.status(), stats: { ...G.world.prep.stats }, bakes: { ...bakeStats }, key: G.renderer.bakeKey, layerKey: G.world.layerKey }),
    particles: (reset = false) => {
      const out = { live: fx.ps.length, cap: fx.cap, frameCap: fx.frameCap, peak: fx.peakSpawned, effects: G.renderer.effects };
      if (reset) fx.peakSpawned = 0;
      return out;
    },
    input,
    /** The water proving room (game/water.ts): deep basin, current, flooded tunnel and air bell. */
    swimRoom(spawn = 'left') {
      ROOMS.swim_test ??= swimTestRoom() as (typeof ROOMS)[string];
      G.world.load('swim_test', spawn);
    },
    water: () => ({ muffled: waterMuffled(), bubbles: bubbleCount() }),
    valor: { track: valorTrack, unlock, trophies: TROPHIES },
    daily: { dailyFor, dayKey, start: startDaily },
    ios: isIOS(),
  };
  (window as unknown as { __remnant: typeof api }).__remnant = api;
}

boot();
