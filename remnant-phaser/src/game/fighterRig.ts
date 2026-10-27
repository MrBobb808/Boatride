// Image-generated, separate parts bound to the existing 2D combat skeleton.
// All compositing happens while baking atlases, never in the game loop.
import type Phaser from 'phaser';
import type { Joints, Pose } from '../../../remnant/src/render/skeleton';
import { drawWeapon, type HumanStyle } from '../../../remnant/src/render/actors';
import type { WeaponFamily } from '../../../remnant/src/game/data';
import type { PlayableHero } from './style';

// Source rectangle; proximal/distal joint in source pixels; transverse width.
type Part = readonly [number,number,number,number,number,number,number,number,number];
const PARTS: readonly Part[] = [
  [65,80,160,185,145,242,145,104,137],
  [350,10,195,209,459,44,458,190,164],
  [595,55,280,225,737,93,737,266,245],
  [960,45,120,215,1028,90,1014,223,94],
  [1180,85,180,180,1229,129,1320,224,84],
  [85,300,155,220,133,336,181,491,115],
  [360,300,175,252,413,335,443,542,105],
  [560,310,332,242,853,344,728,513,290],
  [948,352,175,137,1038,388,1044,462,160],
  [1240,278,110,287,1295,506,1295,294,80],
  [70,603,180,190,174,769,169,631,162],
  [355,565,200,265,466,603,459,775,170],
  [585,590,285,247,740,628,735,823,254],
  [958,598,120,190,1029,650,1010,763,88],
  [1200,620,170,180,1250,667,1320,767,85],
  [75,835,180,215,128,877,207,1024,124],
  [360,830,175,265,415,872,448,1084,108],
  [550,855,324,244,839,895,725,1072,285],
  [905,835,250,270,1094,886,946,1066,115],
  // The string is drawn from the pulling hand; crop only the bow's limbs.
  [1278,801,77,298,1301,952,1301,815,70],
];
export const FIGHTER_DIMS = {torso:14.5,head:5.8,neck:1.4,upperArm:8,foreArm:7.2,thigh:10,shin:10,shoulderSpread:1.5,hipSpread:1.4};
const WEAPON = {weaponColor:'#e3dfdb',outline:'#09080d',weaponGlow:null,weaponGlowAmt:0} as HumanStyle;

export class FighterRig {
  private parts: HTMLCanvasElement[];
  private offset: number;
  private weapon: HumanStyle;
  constructor(sc: Phaser.Scene, readonly hero: PlayableHero, family: WeaponFamily, readonly mantle: boolean) {
    this.offset = hero === 'tirzah' ? 10 : 0;
    this.weapon = {...WEAPON,weapon:family,weaponColor:mantle?'#d5a1ff':'#e3dfdb',weaponGlow:mantle?'#b45cff':null,weaponGlowAmt:mantle?0.65:0};
    const key=`fighter-parts-${hero}${mantle?'-mantle':''}`;
    // The source crops are small and shared across every weapon/clip bake.
    const cached=sc.registry.get(key) as HTMLCanvasElement[] | undefined;
    if(cached){this.parts=cached;return;}
    const source=sc.textures.get('fighter-parts').getSourceImage() as HTMLImageElement;
    this.parts=PARTS.slice(this.offset,this.offset+10).map((part,i)=>{
      const [x,y,w,h]=part,c=document.createElement('canvas');c.width=w;c.height=h;
      const g=c.getContext('2d')!;g.drawImage(source,x,y,w,h,0,0,w,h);
      if(mantle&&i!==0&&i!==4&&i!==9){
        const image=g.getImageData(0,0,w,h),d=image.data;
        for(let n=0;n<d.length;n+=4)if(d[n+3]){
          const r=d[n],gr=d[n+1],b=d[n+2];
          // Preserve gold fittings; cloth, leather and cape become violet.
          if(r>gr*1.12&&gr>b*1.25&&gr>65)continue;
          const l=r*.22+gr*.58+b*.2;d[n]=Math.min(255,l*1.35+12);d[n+1]=l*.45;d[n+2]=Math.min(255,l*1.8+20);
        }
        g.putImageData(image,0,0);
      }
      return c;
    });sc.registry.set(key,this.parts);
  }
  private bone(c:CanvasRenderingContext2D,n:number,ax:number,ay:number,bx:number,by:number,width:number,alpha=1){
    const p=PARTS[this.offset+n],sx=p[6]-p[4],sy=p[7]-p[5];
    c.save();c.globalAlpha*=alpha;c.translate(ax,ay);c.rotate(Math.atan2(by-ay,bx-ax));
    c.scale(Math.hypot(bx-ax,by-ay)/Math.hypot(sx,sy),width/p[8]);c.rotate(-Math.atan2(sy,sx));
    c.drawImage(this.parts[n],p[0]-p[4],p[1]-p[5]);c.restore();
  }
  draw(c:CanvasRenderingContext2D,j:Joints,p:Pose,time:number,clip:string,u:number,armed=true){
    const archer=this.hero==='tirzah',drawing=clip==='bowDraw',release=clip==='bowRelease';
    const bowAction=archer&&(drawing||release),pull=drawing?u:release?Math.max(0,1-u*5):0;
    if(bowAction){
      // The bow grip is fixed; only the drawing arm and string travel back.
      j.haFX=j.shFX+13.5;j.haFY=j.shFY+1.8;
      this.armIK(j,true);j.haBX=j.haFX-2-pull*11;j.haBY=j.haFY;
      this.armIK(j,false);
    }
    c.save();
    if(p.rot){c.translate(j.hipX,j.hipY-4);c.rotate(p.rot);c.translate(-j.hipX,-j.hipY+4);}
    const running=clip==='run'||clip==='swim',flow=running?3:0;
    const flutter=Math.sin(time*7)*.7;
    // Cloth lags the torso and gait, rather than rotating rigidly with a limb.
    this.bone(c,7,j.neckX-2,j.neckY+1,j.neckX-12-flow,j.neckY+18-flow+flutter,archer?23:25);
    if(archer)this.bone(c,8,j.headX-3,j.headY-3,j.headX-8-flow,j.headY+12-flow+flutter,4.4);
    this.limb(c,j,false,.84);
    this.bone(c,3,j.shBX,j.shBY,j.elBX,j.elBY,5.3,.84);
    this.bone(c,4,j.elBX,j.elBY,j.haBX,j.haBY,4.3,.84);
    this.limb(c,j,true,1);
    this.bone(c,2,j.hipX,j.hipY-1,j.hipX+Math.sin(p.lean)*3,j.hipY+11,archer?17:18);
    this.bone(c,1,j.neckX,j.neckY,j.hipX,j.hipY,12.8);
    if(!archer)this.bone(c,8,j.neckX,j.neckY,j.neckX-1,j.neckY+4,11);
    this.bone(c,0,j.neckX,j.neckY,j.neckX+Math.sin(j.headA)*12.8,j.neckY-Math.cos(j.headA)*12.8,archer?11:10.8);
    if(this.mantle){c.fillStyle='#edc7ff';c.fillRect(j.headX+2.8,j.headY-1.8,1.6,.65);}
    if(armed){
      if(archer){
        const x=j.haFX,y=j.haFY,top=y-17,bottom=y+17;
        this.bone(c,9,x,y,x,top,8.5);
        c.strokeStyle=this.mantle?'#dbb4ff':'#e8d4a1';c.lineWidth=.65;c.beginPath();c.moveTo(x-2,top);c.lineTo(x-2-pull*11,y);c.lineTo(x-2,bottom);c.stroke();
        if(drawing){c.strokeStyle='#ead9ae';c.lineWidth=.9;c.beginPath();c.moveTo(x-2-pull*11,y);c.lineTo(x+14-pull*3,y);c.stroke();c.fillStyle='#f6e7c8';c.fillRect(x+12-pull*3,y-.8,3,1.6);}
      }else drawWeapon(c,j,this.weapon,time);
    }
    this.bone(c,3,j.shFX,j.shFY,j.elFX,j.elFY,5.7);
    this.bone(c,4,j.elFX,j.elFY,j.haFX,j.haFY,4.6);
    // Drawing hand belongs in front of the string, including at full charge.
    if(bowAction){this.bone(c,3,j.shBX,j.shBY,j.elBX,j.elBY,5.3);this.bone(c,4,j.elBX,j.elBY,j.haBX,j.haBY,4.3);}
    c.restore();
  }
  private limb(c:CanvasRenderingContext2D,j:Joints,front:boolean,alpha:number){
    const [hx,hy,kx,ky,fx,fy]=front?[j.hpFX,j.hpFY,j.knFX,j.knFY,j.ftFX,j.ftFY]:[j.hpBX,j.hpBY,j.knBX,j.knBY,j.ftBX,j.ftBY];
    this.bone(c,5,hx,hy,kx,ky,7,alpha);this.bone(c,6,kx,ky,fx,fy,6.5,alpha);
  }
  private armIK(j:Joints,front:boolean){
    const sx=front?j.shFX:j.shBX,sy=front?j.shFY:j.shBY,hx=front?j.haFX:j.haBX,hy=front?j.haFY:j.haBY;
    const dx=hx-sx,dy=hy-sy,d=Math.max(.1,Math.hypot(dx,dy)),a=8,b=7.2;
    const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
    const ex=sx+dx/d*along-dy/d*height,ey=sy+dy/d*along+dx/d*height;
    if(front){j.elFX=ex;j.elFY=ey;}else{j.elBX=ex;j.elBY=ey;}
  }
}
