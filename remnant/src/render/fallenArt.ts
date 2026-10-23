import beastUrl from '../assets/varkhos-hunt-atlas.png';
import plagueUrl from '../assets/morvane-plague-atlas.png';
import cinderUrl from '../assets/azkar-cinder-atlas.png';
import type { Ctx } from './draw';
const images=[new Image(),new Image(),new Image()];
export const loadFallenArt=()=>Promise.all(images.map(im=>im.complete?Promise.resolve():new Promise<void>(r=>{im.onload=()=>r();im.onerror=()=>r();})));
images[0].src=beastUrl;images[1].src=plagueUrl;images[2].src=cinderUrl;
export const fallenArtReady=()=>images.every(im=>im.complete&&im.naturalWidth>0);
const BEAST=[[0,0,355,512,211,500],[355,0,380,512,192,500],[735,0,480,512,226,500],[1215,0,321,512,177,500],[0,512,425,512,228,472],[425,512,380,512,190,472],[805,512,365,512,185,472],[1170,512,366,512,193,472]];
export function drawFallenArt(ctx:Ctx,plague:boolean,frame:number,x:number,y:number,face:number,alpha=1){
  const im=images[plague?1:0];if(!im.complete||!im.naturalWidth)return false;
  let crop=BEAST[frame],scale=.24;
  if(plague){const size=im.naturalWidth/2,idx=frame===0?0:frame===7||frame===6?3:frame===1?1:2;crop=[idx%2*size,Math.floor(idx/2)*size,size,size,size*.6,size*.96];scale=118/size;}
  const[sx,sy,sw,sh,px,py]=crop;ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(face,1);ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(im,sx,sy,sw,sh,-px*scale,-py*scale,sw*scale,sh*scale);ctx.restore();return true;
}

// Authored atlas cells have individual crop widths; keep feet anchored when the hammer extends.
export function drawCinderArt(ctx:Ctx,frame:number,x:number,y:number,face:number,alpha=1){
  const im=images[2];if(!im.complete||!im.naturalWidth)return false;
  const unit=im.naturalWidth/1254,crops=[[0,0,660,640,395,604],[660,0,594,640,420,612],[0,640,760,614,395,548],[760,640,494,614,295,546]],c=crops[frame];
  const [sx,sy,sw,sh,px,py]=c,scale=.21;ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(face,1);ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(im,sx*unit,sy*unit,sw*unit,sh*unit,-px*scale,-py*scale,sw*scale,sh*scale);ctx.restore();return true;
}

/** Head-and-shoulders crops of each Fallen Crown for the dialogue box (atlas pixels at 1254/1536 wide). */
const PORTRAIT=[[165,20,220,220,1536],[335,25,170,170,1254],[278,88,200,200,1254]];
export function drawFallenPortrait(ctx:Ctx,which:0|1|2,x:number,y:number,w:number,h:number){
  const im=images[which];if(!im.complete||!im.naturalWidth)return false;
  const[sx,sy,sw,sh,base]=PORTRAIT[which],u=im.naturalWidth/base;ctx.drawImage(im,sx*u,sy*u,sw*u,sh*u,x,y,w,h);return true;
}
