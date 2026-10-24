// REMNANT: ASCENSION on Phaser. The canvas is sized in device pixels and shown
// at CSS size, so text and pixel art stay sharp on an iPhone's Retina screen;
// scenes read `dpr()` to size their UI.

import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { World } from './scenes/World';
import { Hud } from './scenes/Hud';

import { dpr } from './game/screen';

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
  input: { activePointers: 5, gamepad: true },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fps: 120, debug: new URLSearchParams(location.search).has('boxes') } },
  // Real frame times: a target here clamps each step, and slow frames would play in slow motion.
  fps: { smoothStep: false },
  scene: [Boot, Title, World, Hud],
});

// The debug API starts with the game itself (the world scene adds the rest), so the title can be driven too.
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __remnant: unknown }).__remnant = { game };

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
