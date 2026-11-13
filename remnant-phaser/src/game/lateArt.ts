// The art the home screen does not draw: effects, the Unshorn, foe and Echo sheets and the Fallen Crowns' atlases
// (about 12 MB). It loads while the home screen idles, or in the preload of the first scene that needs it, so the
// first screen waits only for the hero's sheets (NEXT_PLAN A3).
import type Phaser from 'phaser';
import { cutBossFrames } from './bossFrames';
import varkhosUrl from '../../../remnant/src/assets/varkhos-hunt-atlas.png';
import morvaneUrl from '../../../remnant/src/assets/morvane-plague-atlas.png';
import azkarUrl from '../../../remnant/src/assets/azkar-cinder-atlas.png';
import slashesUrl from '../assets/vfx-slashes.png';
import impactsUrl from '../assets/vfx-impacts.png';
import unshornPartsUrl from '../assets/fighter-parts-unshorn.png';
import unshornManeUrl from '../assets/unshorn-mane.png';
import unshornImpactsUrl from '../assets/vfx-unshorn.png';
import unshornAwakeningUrl from '../assets/unshorn-awakening.png';
import abilities1Url from '../assets/vfx-abilities-1.png';
import abilities2Url from '../assets/vfx-abilities-2.png';
import transformUrl from '../assets/vfx-transform.png';
import archerUrl from '../assets/vfx-archer.png';
import arrowsUrl from '../assets/arrows.png';
import statusUrl from '../assets/vfx-status.png';
import foesAshen from '../../../remnant/src/assets/foes-ashen.png';
import foesShinar from '../../../remnant/src/assets/foes-shinar.png';
import foesBeasts from '../../../remnant/src/assets/foes-beasts.png';
import foesVeil from '../../../remnant/src/assets/foes-veil.png';
import foesGothic from '../assets/cc0/foes-gothic.png';
import echoVanguard from '../../../remnant/src/assets/echo-vanguard.png';
import echoSovereign from '../../../remnant/src/assets/echo-sovereign.png';
import foesGothicBig from '../assets/cc0/foes-gothic-big.png';
import uriPartsUrl from '../assets/fighter-parts-uri.png';
import uriCrownUrl from '../assets/fighter-parts-uri-crown.png';
import shamanPartsUrl from '../assets/fighter-parts-shaman.png';
import uriFireUrl from '../assets/vfx-uri-fire.png';

/** Queues every late sheet not yet in; true when any was queued (the caller starts the loader outside preload). */
export function lateArt(sc: Phaser.Scene): boolean {
  const has = (k: string) => sc.textures.exists(k);
  const before = sc.load.totalToLoad;
  // C11/C12/V09: the Unshorn's parts, his mane and tail (four frames each) and his punches' bursts.
  if (!has('fighter-parts-unshorn')) sc.load.image('fighter-parts-unshorn', unshornPartsUrl);
  if (!has('unshorn-mane')) sc.load.image('unshorn-mane', unshornManeUrl);
  if (!has('vfx-unshorn')) sc.load.spritesheet('vfx-unshorn', unshornImpactsUrl, { frameWidth: 128, frameHeight: 128 });
  // C15: the awakening, eight frames from the Mantle's last stand to the Unshorn's guard (feet at 94.8% of a cell).
  if (!has('unshorn-awakening')) sc.load.spritesheet('unshorn-awakening', unshornAwakeningUrl, { frameWidth: 64, frameHeight: 64 });
  // Art drop V01/V02: rows of six frames (art/manifest.json).
  if (!has('vfx-slashes')) sc.load.spritesheet('vfx-slashes', slashesUrl, { frameWidth: 128, frameHeight: 128 });
  if (!has('vfx-impacts')) sc.load.spritesheet('vfx-impacts', impactsUrl, { frameWidth: 128, frameHeight: 128 });
  // Art drop V03/V04: the Covenant abilities, eight frames per row.
  if (!has('vfx-abilities-1')) sc.load.spritesheet('vfx-abilities-1', abilities1Url, { frameWidth: 128, frameHeight: 128 });
  if (!has('vfx-abilities-2')) sc.load.spritesheet('vfx-abilities-2', abilities2Url, { frameWidth: 128, frameHeight: 128 });
  // V06 (Mantle and Wings forming) and V05 (Tirzah's dawn effects).
  if (!has('vfx-transform')) sc.load.spritesheet('vfx-transform', transformUrl, { frameWidth: 128, frameHeight: 128 });
  if (!has('vfx-archer')) sc.load.spritesheet('vfx-archer', archerUrl, { frameWidth: 128, frameHeight: 128 });
  if (!has('arrows')) sc.load.spritesheet('arrows', arrowsUrl, { frameWidth: 96, frameHeight: 128 });
  if (!has('vfx-status')) sc.load.spritesheet('vfx-status', statusUrl, { frameWidth: 128, frameHeight: 128 });
  // The original's foe sheets as Phaser frames, for the Horde (four keyframes a row, 96 px cells).
  for (const [key, url] of [['foes-ashen', foesAshen], ['foes-shinar', foesShinar], ['foes-beasts', foesBeasts], ['foes-veil', foesVeil]]) if (!has(key)) sc.load.spritesheet(key, url, { frameWidth: 96, frameHeight: 96 });
  // The CC0 foes (art/incoming/cc0/CREDITS.md), cut to the same four keyframes a row by art/tools/cc0.py.
  if (!has('foes-gothic')) sc.load.spritesheet('foes-gothic', foesGothic, { frameWidth: 96, frameHeight: 96 });
  if (!has('foes-gothic-big')) sc.load.spritesheet('foes-gothic-big', foesGothicBig, { frameWidth: 160, frameHeight: 160 });
  // The main game's Echo sheets, for the Watch's shadows (same four keyframes a row).
  if (!has('echo-vanguard')) sc.load.spritesheet('echo-vanguard', echoVanguard, { frameWidth: 96, frameHeight: 96 });
  if (!has('echo-sovereign')) sc.load.spritesheet('echo-sovereign', echoSovereign, { frameWidth: 96, frameHeight: 96 });
  if (!has('varkhos')) sc.load.image('varkhos', varkhosUrl);
  if (!has('morvane')) sc.load.image('morvane', morvaneUrl);
  if (!has('azkar')) sc.load.image('azkar', azkarUrl);
  // C08–C10, V10: Uri, his Crown of Flame and his orc shaman; his fire in 128 px cells (six frames a row: fireball,
  // burst, ground fire, wave).
  if (!has('fighter-parts-uri')) sc.load.image('fighter-parts-uri', uriPartsUrl);
  if (!has('fighter-parts-uri-crown')) sc.load.image('fighter-parts-uri-crown', uriCrownUrl);
  if (!has('fighter-parts-shaman')) sc.load.image('fighter-parts-shaman', shamanPartsUrl);
  if (!has('vfx-uri-fire')) sc.load.spritesheet('vfx-uri-fire', uriFireUrl, { frameWidth: 128, frameHeight: 128 });
  return sc.load.totalToLoad > before;
}

/** Cuts the frames the late sheets carry; call in create(), it does nothing for sheets already cut. */
export const finishLateArt = (sc: Phaser.Scene) => cutBossFrames(sc);
