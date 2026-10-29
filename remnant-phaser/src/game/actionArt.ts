// Bake one illustrated rig for movement AND combat. Frames are tightly packed;
// Phaser's trim metadata preserves the same foot/grip origin in every pose.
import type Phaser from 'phaser';
import { Animator, solve, blendPose, type Clip } from '../../../remnant/src/render/skeleton';
import { clipsFor, MOVESETS, type AttackDef } from '../../../remnant/src/game/weapons';
import type { WeaponFamily } from '../../../remnant/src/game/data';
import type { PlayableHero } from './style';
import { FighterRig, FIGHTER_DIMS } from './fighterRig';
export const ACTION_CELL=192,ACTION_FOOT=120,ACTION_STEPS=16;
/** Clips baked as loops (sampled at i/STEPS); the rest are one-shots sampled at i/(STEPS-1). */
const LOOPS=new Set<string>();
const COMMON=['idle','run','jump','fall','land','roll','airdash','hurt','death','parry','block','heal','cast','invoke','charge','executeLeap','executeStrike','swim'];

function fighterClips(family:WeaponFamily,hero:PlayableHero){
  const clips=clipsFor(family),base=clips.idle.base!;
  clips.swim={dur:1.1,loop:true,base,fn:u=>{
    const a=u*Math.PI*2;
    return{lean:.25,head:-.1,fUA:2.4+Math.sin(a)*.55,fFA:.3,bUA:2.4+Math.sin(a+Math.PI)*.55,bFA:.3,fTh:.25+Math.sin(a)*.35,bTh:.25-Math.sin(a)*.35,fSh:-.65,bSh:-.65,y:Math.sin(a)*.4};
  }};
  if(hero==='tirzah'){
    const bowBase={...base,lean:.03,head:0,fTh:.35,fSh:-.35,bTh:-.35,bSh:-.2};
    clips.bowDraw={dur:.55,base:bowBase,keys:[{t:0,p:{lean:.12}},{t:1,p:{lean:-.08,head:.04}}]};
    clips.bowRelease={dur:.28,base:bowBase,fn:u=>({x:-Math.sin(u*Math.PI)*1.4,lean:-.08*(1-u)})};
  }
  return clips;
}
/** `cape` is a Valor cape key (game/valor.ts CAPES); each worn colour bakes its own atlas once. */
export function actionAtlas(sc:Phaser.Scene,hero:PlayableHero,family:WeaponFamily,mantle=false,armed=true,cape:string|null=null){
  const key=`action-${hero}-${hero==='tirzah'?'bow':family}${mantle?'-mantle':''}${armed?'':'-unarmed'}${cape?'-cape-'+cape:''}`;
  if(sc.textures.exists(key))return key;
  const clips=fighterClips(hero==='tirzah'?'blade':family,hero),anim=new Animator(clips),rig=new FighterRig(sc,hero,family,mantle,cape);
  const moves=Object.values(MOVESETS[family]).flatMap(v=>Array.isArray(v)?v:typeof v==='object'?[v as AttackDef]:[]);
  const attacks=new Set(moves.map(m=>m.clip));
  const names=hero==='tirzah'?[...COMMON,'bowDraw','bowRelease']:[...new Set([...COMMON,...attacks,'b1','b2','b4','heavy','dash','launch','storm','plunge'])];
  const canvas=document.createElement('canvas');canvas.width=canvas.height=ACTION_CELL;const c=canvas.getContext('2d')!;
  const packed:{name:string;canvas:HTMLCanvasElement;left:number;top:number;x:number;y:number;ground:boolean;clip:string;phase:number}[]=[];
  let px=2,py=2,row=0;
  for(const name of names){
    const clip:Clip=clips[name];if(!clip)continue;
    if(clip.loop)LOOPS.add(name);
    anim.play(name,0,true);
    for(let i=0;i<ACTION_STEPS;i++){
      const u=i/(clip.loop?ACTION_STEPS:ACTION_STEPS-1);anim.time=clip.dur*u;
      const p=anim.sample();
      // Enter wind-ups from the same ready pose without skipping anticipation.
      if(attacks.has(name)&&u<.18)blendPose(clip.base!,p,Math.min(1,u/.18),p);
      const ground=!/air|jump|fall|flip|comet|rend|executeLeap|swim/i.test(name),j=solve(p,FIGHTER_DIMS,ground);
      c.clearRect(0,0,ACTION_CELL,ACTION_CELL);c.save();c.translate(ACTION_CELL/2,ACTION_FOOT);
      c.imageSmoothingEnabled=true;rig.draw(c,j,p,anim.time,name,u,armed);c.restore();
      const d=c.getImageData(0,0,ACTION_CELL,ACTION_CELL).data;let left=ACTION_CELL-1,top=ACTION_CELL-1,right=0,bottom=0;
      for(let y=0;y<ACTION_CELL;y++)for(let x=0;x<ACTION_CELL;x++)if(d[(y*ACTION_CELL+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(left===0||top===0||right===ACTION_CELL-1||bottom===ACTION_CELL-1)throw Error(`Clipped fighter frame: ${key}/${name}:${i}`);
      // A clear gutter prevents adjacent frames bleeding under camera zoom.
      left--;top--;right++;bottom++;const w=right-left+1,h=bottom-top+1;
      if(px+w+2>1024){px=2;py+=row+2;row=0;}
      const frame=document.createElement('canvas');frame.width=w;frame.height=h;frame.getContext('2d')!.drawImage(canvas,left,top,w,h,0,0,w,h);
      packed.push({name:`${name}:${i}`,canvas:frame,left,top,x:px,y:py,ground,clip:name,phase:u});px+=w+2;row=Math.max(row,h);
    }
  }
  const tex=sc.textures.createCanvas(key,1024,py+row+2)!,out=tex.getContext();
  for(const f of packed){
    const w=f.canvas.width,h=f.canvas.height;out.drawImage(f.canvas,f.x,f.y);
    const frame=tex.add(f.name,0,f.x,f.y,w,h)!.setTrim(ACTION_CELL,ACTION_CELL,f.left,f.top,w,h);
    frame.customData={clip:f.clip,phase:f.phase,grounded:f.ground};
  }
  tex.refresh();return key;
}
export function actionFrame(sc:Phaser.Scene,key:string,clip:string,u:number){
  // Pick the frame baked nearest this moment: loops wrap, one-shots end on their last pose.
  const i=LOOPS.has(clip)?Math.floor(u*ACTION_STEPS)%ACTION_STEPS:Math.round(Math.min(1,Math.max(0,u))*(ACTION_STEPS-1));
  const frame=`${clip}:${i}`;
  return sc.textures.get(key).has(frame)?frame:'idle:0';
}
