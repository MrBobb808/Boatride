import { makeCanvas, poly, rgba, type Ctx } from './draw';
import { RNG } from '../core/math';
import { flag } from '../game/ctx';
import { TILE, type EntDef } from '../game/tiles';
import type { Layer } from './environment';
export const FALLEN_LIVE=new Set(['hunt_gate','plague_gate','cinders_gate']);
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
  if(cinderProp(ctx,e))return true;
  const plague=e.k.startsWith('plague_');if(!plague&&!e.k.startsWith('hunt_'))return false;
  const x=e.x*TILE,y=e.y*TILE,edge=plague?'#b7dc8d':'#ad8b67';ctx.save();ctx.translate(x,y);
  if(e.k.endsWith('_tree')){poly(ctx,[-20,0,-10,-50,-16,-110,-9,-170,1,-183,7,-96,16,-41,28,0],plague?'#263c31':'#20242b',edge,.7);for(const s of [-1,1])poly(ctx,[s*2,-67,s*49,-102,s*35,-104,s*64,-145,s*27,-125,s*19,-153,s*3,-106],plague?'#344a36':'#25272f',edge,.6);if(plague){ctx.fillStyle='#90ac67';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(-17+i*14,-35-i*26,15,7,0,0,Math.PI*2);ctx.fill();}}}
  else if(e.k.endsWith('_gate')){for(const s of [-1,1])poly(ctx,[s*25,0,s*28,-98,s*42,-121,s*36,-77,s*40,0],plague?'#58714b':'#857365',edge,1);if(!flag(plague?'ch8_boundary_open':'ch7_boundary_open')){ctx.fillStyle=rgba(edge,.3);ctx.fillRect(-27,-91,54,91);ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,-82);ctx.lineTo(24,-12);ctx.moveTo(24,-82);ctx.lineTo(-24,-12);ctx.stroke();}}
  else if(e.k.endsWith('_throne')){poly(ctx,[-49,0,-46,-25,-32,-30,-27,-96,-41,-124,-20,-104,0,-144,20,-104,41,-124,27,-96,32,-30,46,-25,49,0],plague?'#243e30':'#342a31',edge,1.3);ctx.fillStyle=plague?'#6c8b51':'#6c393a';ctx.fillRect(-22,-68,44,46);ctx.fillStyle=edge;ctx.fillRect(-30,-23,60,7);}
  ctx.restore();return true;
}

// Foundries have their own skyline and cached masonry, pipes and furnace props.
const cinderSkies=new Map<number,CanvasGradient>();
export function cinderSky(ctx:Ctx,w:number,h:number,t:number){
  let g=cinderSkies.get(h);if(!g){g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#16131d');g.addColorStop(.55,'#593c3c');g.addColorStop(1,'#bb754b');cinderSkies.set(h,g);}ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#db9b67';ctx.beginPath();ctx.arc(w*.72,h*.23,21,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8c6657';ctx.fillRect(w*.72-25,h*.23-8,50,7);
  ctx.fillStyle=rgba('#ffb66b',.045);for(let i=0;i<3;i++)ctx.fillRect(0,h*(.65+i*.1)+Math.sin(t*.14+i)*5,w,12);
}
export function cinderParallax(seed:number,viewH:number,res:number):Layer[]{
  const rng=new RNG(seed),layers:Layer[]=[],w=1024,h=Math.ceil(viewH*1.5);
  for(let n=0;n<2;n++){
    const r=Math.max(.5,res*.65),m=makeCanvas(w*r,h*r),ctx=m.ctx;ctx.scale(r,r);
    for(let i=0;i<14;i++){
      const x=i*82+rng.range(-20,20),height=rng.range(80,240),y=h-height;ctx.fillStyle=n?'#251e25':'#64413b';ctx.fillRect(x,y,55,height);
      poly(ctx,[x-8,y,x+27,y-22,x+64,y],n?'#33252a':'#794c3e');ctx.fillRect(x+8,y-60,10,60);ctx.fillRect(x+36,y-90,12,90);
      ctx.strokeStyle=n?'#53352f':'#936249';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+10,y-50);ctx.lineTo(x+10,y-68);ctx.lineTo(x+42,y-68);ctx.stroke();
      ctx.fillStyle=n?'#bd6a3b':'#9f6645';for(let k=0;k<3;k++)ctx.fillRect(x+10+k*13,y+24,7,17);
      ctx.fillStyle=rgba('#432b2c',.6);for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(x+40+k*14,y-105-k*17,18+k*5,9+k*3,-.3,0,Math.PI*2);ctx.fill();}
    }layers.push({c:m.c,w,h,fx:n?.32:.12,fy:.08,oy:0,res:r});
  }return layers;
}
function cinderProp(ctx:Ctx,e:Extract<EntDef,{t:'decor'}>){
  if(!e.k.startsWith('cinders_'))return false;const x=e.x*TILE,y=e.y*TILE;ctx.save();ctx.translate(x,y);
  if(e.k.endsWith('_tree')){
    poly(ctx,[-29,0,-29,-70,-22,-88,-22,-130,20,-130,20,-88,30,-70,30,0],'#3c2e30','#a67657',1);
    ctx.fillStyle='#df8a48';ctx.fillRect(-16,-56,32,47);ctx.fillStyle='#31282b';for(let i=0;i<4;i++)ctx.fillRect(-17+i*10,-58,3,52);
    ctx.strokeStyle='#b98b60';ctx.lineWidth=4;ctx.strokeRect(-24,-132,47,8);ctx.fillStyle='#80503b';ctx.fillRect(-24,-91,48,6);
  }else if(e.k.endsWith('_pipe')){
    ctx.strokeStyle='#332a2d';ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(-21,0);ctx.lineTo(-21,-80);ctx.quadraticCurveTo(-21,-96,0,-96);ctx.lineTo(27,-96);ctx.lineTo(27,-138);ctx.stroke();ctx.strokeStyle='#ac7952';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#a17c5c';ctx.fillRect(-33,-36,25,6);ctx.fillRect(15,-119,25,6);
  }else if(e.k.endsWith('_gate')){
    for(const sx of [-1,1]){ctx.fillStyle='#4a3330';ctx.fillRect(sx*31-9,-113,18,113);ctx.fillStyle='#d3915b';ctx.fillRect(sx*31-12,-117,24,7);}
    if(!flag('ch9_boundary_open')){ctx.fillStyle=rgba('#ff9a50',.4);ctx.fillRect(-27,-106,54,106);ctx.strokeStyle='#ffd093';ctx.lineWidth=3;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-25,-97+i*25);ctx.lineTo(25,-80+i*25);ctx.stroke();}}
  }else if(e.k.endsWith('_throne')){
    poly(ctx,[-62,0,-62,-25,-38,-38,-38,-96,-50,-140,-25,-119,0,-161,25,-119,50,-140,38,-96,38,-38,62,-25,62,0],'#33272b','#c88d58',1.5);
    ctx.fillStyle='#b9673b';ctx.fillRect(-26,-77,52,48);ctx.fillStyle='#f4b569';ctx.fillRect(-34,-29,68,7);for(const sx of [-1,1]){ctx.fillStyle='#463131';ctx.fillRect(sx*72-13,-67,26,67);ctx.fillStyle='#ef9c51';ctx.fillRect(sx*72-9,-52,18,39);}
  }ctx.restore();return true;
}
