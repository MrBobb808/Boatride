import { makeCanvas, poly, rgba, type Ctx } from './draw';
import { RNG } from '../core/math';
import { flag } from '../game/ctx';
import { TILE, type EntDef } from '../game/tiles';
import type { Layer } from './environment';
export const FALLEN_LIVE=new Set(['hunt_gate','plague_gate']);
const sky=new Map<string,CanvasGradient>();
export function fallenSky(ctx:Ctx,w:number,h:number,plague:boolean,t:number){
  const key=h+':'+plague;let g=sky.get(key);if(!g){g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,plague?'#101b22':'#101323');g.addColorStop(.6,plague?'#304e46':'#31353c');g.addColorStop(1,plague?'#7d9666':'#8a6755');sky.set(key,g);}ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.fillStyle=plague?'#d4eda5':'#f1cf9c';ctx.beginPath();ctx.arc(w*.74,h*.21,17,0,Math.PI*2);ctx.fill();ctx.fillStyle=rgba(plague?'#b9e47d':'#d6a26d',.05);for(let i=0;i<3;i++)ctx.fillRect(0,h*(.6+i*.11)+Math.sin(t*.12+i)*9,w,17);
}
export function fallenParallax(seed:number,viewH:number,res:number,plague:boolean):Layer[]{
  const rng=new RNG(seed),layers:Layer[]=[],w=1024,h=Math.ceil(viewH*1.5);
  for(let n=0;n<2;n++){const r=Math.max(.5,res*.65),m=makeCanvas(w*r,h*r),ctx=m.ctx;ctx.scale(r,r);
    for(let i=0;i<24;i++){const x=rng.range(-40,w+40),height=rng.range(110,260),base=h+rng.range(-30,20),col=plague?(n?'#192c29':'#374f46'):(n?'#171d27':'#35363e');ctx.fillStyle=col;ctx.fillRect(x-7,base-height,14,height);
      for(const s of [-1,1])poly(ctx,[x,base-height*.4,x+s*53,base-height*.63,x+s*20,base-height*.58,x+s*72,base-height*.83,x+s*16,base-height*.72,x+s*32,base-height,x,base-height-20],col);
      if(plague){ctx.fillStyle='#718b5a';ctx.beginPath();ctx.ellipse(x,base-height*.45,25,12,0,0,Math.PI*2);ctx.fill();}
    }layers.push({c:m.c,w,h,fx:n?.3:.1,fy:.08,oy:0,res:r});}return layers;
}
export function fallenProp(ctx:Ctx,e:Extract<EntDef,{t:'decor'}>){
  const plague=e.k.startsWith('plague_');if(!plague&&!e.k.startsWith('hunt_'))return false;
  const x=e.x*TILE,y=e.y*TILE,edge=plague?'#b7dc8d':'#ad8b67';ctx.save();ctx.translate(x,y);
  if(e.k.endsWith('_tree')){poly(ctx,[-20,0,-10,-50,-16,-110,-9,-170,1,-183,7,-96,16,-41,28,0],plague?'#263c31':'#20242b',edge,.7);for(const s of [-1,1])poly(ctx,[s*2,-67,s*49,-102,s*35,-104,s*64,-145,s*27,-125,s*19,-153,s*3,-106],plague?'#344a36':'#25272f',edge,.6);if(plague){ctx.fillStyle='#90ac67';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(-17+i*14,-35-i*26,15,7,0,0,Math.PI*2);ctx.fill();}}}
  else if(e.k.endsWith('_gate')){for(const s of [-1,1])poly(ctx,[s*25,0,s*28,-98,s*42,-121,s*36,-77,s*40,0],plague?'#58714b':'#857365',edge,1);if(!flag(plague?'ch8_boundary_open':'ch7_boundary_open')){ctx.fillStyle=rgba(edge,.3);ctx.fillRect(-27,-91,54,91);ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,-82);ctx.lineTo(24,-12);ctx.moveTo(24,-82);ctx.lineTo(-24,-12);ctx.stroke();}}
  else if(e.k.endsWith('_throne')){poly(ctx,[-49,0,-46,-25,-32,-30,-27,-96,-41,-124,-20,-104,0,-144,20,-104,41,-124,27,-96,32,-30,46,-25,49,0],plague?'#243e30':'#342a31',edge,1.3);ctx.fillStyle=plague?'#6c8b51':'#6c393a';ctx.fillRect(-22,-68,44,46);ctx.fillStyle=edge;ctx.fillRect(-30,-23,60,7);}
  ctx.restore();return true;
}
