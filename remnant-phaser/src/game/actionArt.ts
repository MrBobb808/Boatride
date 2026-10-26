// Bake the original skeletal choreography into reusable Phaser frame atlases.
// No skeleton solving or canvas upload is needed during combat.
import type Phaser from 'phaser';
import { Animator, BASE_POSE, solve, type Clip } from '../../../remnant/src/render/skeleton';
import { drawHumanoid } from '../../../remnant/src/render/actors';
import type { HumanStyle } from '../../../remnant/src/render/actors';
import { DIMS } from '../../../remnant/src/game/playerDims';
import { clipsFor } from '../../../remnant/src/game/weapons';
import type { WeaponFamily } from '../../../remnant/src/game/data';
import type { PlayableHero } from './style';
const CELL = 96, STEPS = 8, COLS = 16;
const ELIOR: HumanStyle = { skin:'#754c38', hair:'#f3f0e7', hairKind:'spiky', beard:'#e7e3da', coat:'#24202d', coatDark:'#110f19', skirt:9, trim:'#d5af60', pants:'#171520', boots:'#39313b', glove:'#48404c', belt:'#a98549', plate:null, helm:'none', eye:'#ebd28d', eyeGlow:0, outline:'#09080d', weapon:'blade', weaponColor:'#e3dfdb', offhand:'none', bulk:1, scarf:'#bc4c45' };
const TIRZAH: HumanStyle = { ...ELIOR, hair:'#241a21', hairKind:'braid', beard:null, coat:'#337f79', coatDark:'#153a40', trim:'#e1bd70', helm:'archer', helmColor:'#296a69', weapon:'none', offhand:'bow', offColor:'#c49b58', offTrim:'#f0db9a', scarf:'#91c7bf', skirt:6, bulk:0.9 };
export function actionAtlas(sc: Phaser.Scene, hero: PlayableHero, family: WeaponFamily) {
  const key = `action-${hero}-${hero === 'tirzah' ? 'bow' : family}`;
  if (sc.textures.exists(key)) return key;
  const clips = clipsFor(family);
  if (hero === 'tirzah') {
    const draw: Clip = { dur:1, base:BASE_POSE, fn:u=>({ lean:0.1, fUA:-1.45, fFA:0.08, bUA:-0.8 - u * 0.5, bFA:1.4 + u * 0.7, fTh:0.25, bTh:-0.3, wpn:0 }) };
    clips.bowDraw = draw;
  }
  const names = Object.keys(clips), total = names.length * STEPS;
  const tex = sc.textures.createCanvas(key, COLS * CELL, Math.ceil(total / COLS) * CELL)!;
  const c = tex.getContext(), anim = new Animator(clips), style = { ...(hero === 'tirzah' ? TIRZAH : ELIOR), weapon: hero === 'tirzah' ? 'none' as const : family };
  names.forEach((name, n) => {
    anim.play(name, 0, true);
    for (let i = 0; i < STEPS; i++) {
      const index = n * STEPS + i, x = index % COLS * CELL, y = Math.floor(index / COLS) * CELL;
      anim.time = clips[name].dur * i / (STEPS - 1);
      const p = anim.sample(), j = solve(p, DIMS, !/air|leap|fall|comet|rend/i.test(name));
      c.save(); c.beginPath(); c.rect(x,y,CELL,CELL); c.clip(); c.translate(x + 48, y + 80);
      style.bowDraw = name === 'bowDraw' ? i / (STEPS - 1) : 0;
      drawHumanoid(c,j,style,anim.time,p.rot,0,0);
      c.restore(); tex.add(`${name}:${i}`,0,x,y,CELL,CELL);
    }
  });
  tex.refresh(); return key;
}
export function actionFrame(sc: Phaser.Scene, key: string, clip: string, u: number) {
  const frame = `${clip}:${Math.min(7, Math.max(0, Math.floor(u * 8)))}`;
  return sc.textures.get(key).has(frame) ? frame : null;
}
