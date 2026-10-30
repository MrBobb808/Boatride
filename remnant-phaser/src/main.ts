// REMNANT: ASCENSION on Phaser. The canvas is sized in device pixels and shown
// at CSS size, so text and pixel art stay sharp on an iPhone's Retina screen;
// scenes read `dpr()` to size their UI.

import './game/migration';
import Phaser from 'phaser';
import '../../remnant/src/ui/styles.css';
import { measureSafe } from '../../remnant/src/ui/safe';
import { initHaptics } from '../../remnant/src/core/haptics';
measureSafe(); initHaptics();
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { World } from './scenes/World';
import { Horde } from './scenes/Horde';
import { patchChapterOne } from './game/pilot';
import { registerPsalms } from './game/psalms';
// The Chapter I pilot reshapes the shared rooms for this build only (POLISH_PLAN §12c).
patchChapterOne();
// Psalter Pages are key items, and two chests hold one (POLISH_PLAN §12d).
registerPsalms();
import { Hud } from './scenes/Hud';

import { dpr } from './game/screen';
import { audio } from './classic/shim/audio';
import { music } from './classic/shim/music';
import { songs } from '../../remnant/src/audio/songs';
import { registerOffline, checkForUpdates } from './game/update';
import { settings, onSettingsChange } from './classic/shim/settings';

const size = () => ({ w: Math.round(innerWidth * dpr()), h: Math.round(innerHeight * dpr()) });

const s = size();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: s.w,
  height: s.h,
  backgroundColor: '#07060a',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
  // HTML dialogue and menu gestures belong to their DOM controls.
  // Watching those touches in Phaser can strand a pointer when the DOM cancels its release.
  input: { activePointers: 5, gamepad: true, windowEvents: false },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fps: 120, debug: new URLSearchParams(location.search).has('boxes') } },
  // Real frame times: a target here clamps each step, and slow frames would play in slow motion.
  fps: { smoothStep: false, limit: settings.fps === '60' ? 60 : 0 },
  scene: [Boot, Title, World, Hud, Horde],
});

// Apply the phone's frame-pacing preference without restarting its journey.
onSettingsChange(() => {
  const limit = settings.fps === '60' ? 60 : 0;
  if (game.loop.fpsLimit !== limit) game.loop.setFPSLimit(limit);
});

// iOS must unlock the score and both reusable song decks inside a gesture.
const unlockAudio = () => { audio.unlock(); music.start(); };
for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
void songs;
void registerOffline();
window.addEventListener('remnant-update-ready', () => { if (game.scene.isActive('title')) void checkForUpdates(() => {}); });

// The debug API starts with the game itself (the world scene adds the rest), so the title can be driven too.
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __remnant: unknown }).__remnant = { game, audio, music, songs };

const fit = () => {
  const n = size();
  game.scale.resize(n.w, n.h);
  game.scale.setZoom(1 / dpr());
};
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 250));

// iOS: no pinch-zoom or double-tap zoom over the game.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: Phaser.Game }).__game = game;
