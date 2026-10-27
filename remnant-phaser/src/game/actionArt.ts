// Bake the original skeletal choreography into reusable Phaser frame atlases.
// No skeleton solving or canvas upload is needed during combat.
import type Phaser from 'phaser';
import { Animator, solve } from '../../../remnant/src/render/skeleton';
import { drawHumanoid } from '../../../remnant/src/render/actors';
import type { HumanStyle } from '../../../remnant/src/render/actors';
import { DIMS } from '../../../remnant/src/game/playerDims';
import { clipsFor, MOVESETS, type AttackDef } from '../../../remnant/src/game/weapons';
import { mantleStyle } from '../../../remnant/src/game/mantle';
import type { WeaponFamily } from '../../../remnant/src/game/data';
import type { PlayableHero } from './style';
import { rangerAtlas } from './rangerArt';
// Polearms need room beyond the hands, including the fully extended thrust.
export const ACTION_CELL = 128, ACTION_FOOT = 96;
const CELL = ACTION_CELL, STEPS = 8, COLS = 16;
const ELIOR: HumanStyle = { skin:'#754c38', hair:'#f3f0e7', hairKind:'spiky', beard:'#e7e3da', coat:'#24202d', coatDark:'#110f19', skirt:9, trim:'#d5af60', pants:'#171520', boots:'#39313b', glove:'#48404c', belt:'#a98549', plate:null, helm:'none', eye:'#ebd28d', eyeGlow:0, outline:'#09080d', weapon:'blade', weaponColor:'#e3dfdb', offhand:'none', bulk:1, scarf:'#bc4c45' };
export function actionAtlas(sc: Phaser.Scene, hero: PlayableHero, family: WeaponFamily, mantle = false) {
  if(hero==='tirzah')return rangerAtlas(sc,mantle);
  const key = `action-${hero}-${family}${mantle ? '-mantle' : ''}`;
  if (sc.textures.exists(key)) return key;
  const clips = clipsFor(family);
  // Only bake poses this native fighter uses; larger weapon margins stay cheap.
  const moves = Object.values(MOVESETS[family]).flatMap(v => Array.isArray(v) ? v : typeof v === 'object' ? [v as AttackDef] : []);
  const names = [...new Set(moves.map(m => m.clip))], total = names.length * STEPS;
  const tex = sc.textures.createCanvas(key, COLS * CELL, Math.ceil(total / COLS) * CELL)!;
  const base = { ...ELIOR, weapon: family };
  const c = tex.getContext(), anim = new Animator(clips), style = mantle ? mantleStyle(base) : base;
  names.forEach((name, n) => {
    anim.play(name, 0, true);
    for (let i = 0; i < STEPS; i++) {
      const index = n * STEPS + i, x = index % COLS * CELL, y = Math.floor(index / COLS) * CELL;
      anim.time = clips[name].dur * i / (STEPS - 1);
      const p = anim.sample(), j = solve(p, DIMS, !/air|leap|fall|comet|rend/i.test(name));
      c.save(); c.beginPath(); c.rect(x,y,CELL,CELL); c.clip(); c.translate(x + CELL / 2, y + ACTION_FOOT);
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
