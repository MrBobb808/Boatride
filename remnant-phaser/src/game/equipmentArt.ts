// The illustrated body sheet has empty hands. Bake equipment behind the grip
// once, rather than solving/uploading an attachment every frame.
import type Phaser from 'phaser';
import { Animator, solve } from '../../../remnant/src/render/skeleton';
import { drawWeapon, type HumanStyle } from '../../../remnant/src/render/actors';
import { clipsFor } from '../../../remnant/src/game/weapons';
import { DIMS } from '../../../remnant/src/game/playerDims';
import type { WeaponFamily } from '../../../remnant/src/game/data';
export const EQUIP_CELL=128,EQUIP_FOOT=96;
const HAND=[[102,68],[102,68],[103,65],[103,68],[109,67],[98,65],[112,65],[106,67],[92,80],[104,69],[58,22],[113,50],[98,83],[114,93],[69,56],[114,49]];
const HEAD=[[84,24],[84,24],[84,24],[84,24],[90,34],[90,34],[90,34],[90,39],[84,53],[84,31],[84,43],[83,38],[86,48],[100,65],[31,37],[69,37]];
const POSES=['idle','idle','idle','idle','run','run','run','run','jump','fall','charge','executeStrike','roll','roll','hurt','cast'];
const STEPS=[0,0.25,0.5,0.75,0,0.25,0.5,0.75,0.5,0.5,0.5,0.5,0.25,0.75,0.3,0.4];
const STYLE={weaponColor:'#e3dfdb',outline:'#09080d',weaponGlow:null,weaponGlowAmt:0} as HumanStyle;
function mantleBody(sc:Phaser.Scene) {
  if(sc.textures.exists('elior-mantle-body'))return sc.textures.get('elior-mantle-body').getSourceImage() as HTMLCanvasElement;
  const tex=sc.textures.createCanvas('elior-mantle-body',512,512)!,c=tex.getContext(),source=sc.textures.get('elior').getSourceImage() as HTMLImageElement;
  c.drawImage(source,0,0);c.globalCompositeOperation='source-atop';c.fillStyle='rgba(79,19,117,0.64)';c.fillRect(0,0,512,512);c.globalCompositeOperation='source-over';
  for(let i=0;i<16;i++) {
    // Preserve his skin, white hair and facial features in the form.
    const x=i%4*128+HEAD[i][0]-10,y=Math.floor(i/4)*128+HEAD[i][1]-13;
    c.clearRect(x,y,20,27);c.drawImage(source,x,y,20,27,x,y,20,27);
    c.fillStyle='#e4b9ff';c.fillRect(x+13,y+13,3,1);
  }
  tex.refresh();return tex.getSourceImage() as HTMLCanvasElement;
}
export function equipmentAtlas(sc:Phaser.Scene,family:WeaponFamily,mantle:boolean,armed=true) {
  const key=`hero-equipped-${armed?family:'body'}${mantle?'-mantle':''}`;
  if(sc.textures.exists(key))return key;
  const tex=sc.textures.createCanvas(key,EQUIP_CELL*4,EQUIP_CELL*4)!,c=tex.getContext(),clips=clipsFor(family),anim=new Animator(clips);
  const style={...STYLE,weapon:family,weaponColor:mantle?'#d5a1ff':'#e3dfdb',weaponGlow:mantle?'#b45cff':null,weaponGlowAmt:mantle?0.65:0};
  const source=mantle?mantleBody(sc):sc.textures.get('elior').getSourceImage() as HTMLImageElement;
  for(let i=0;i<16;i++) {
    const x=i%4*EQUIP_CELL,y=Math.floor(i/4)*EQUIP_CELL;
    c.save();c.beginPath();c.rect(x,y,EQUIP_CELL,EQUIP_CELL);c.clip();c.translate(x+EQUIP_CELL/2,y+EQUIP_FOOT);
    if(armed) {
      anim.play(POSES[i],0,true);anim.time=clips[POSES[i]].dur*STEPS[i];const j=solve(anim.sample(),DIMS,i<8),scale=56/128;
      c.save();c.translate(HAND[i][0]*scale-28-j.haFX,(HAND[i][1]-120)*scale-j.haFY);drawWeapon(c,j,style,anim.time);c.restore();
    }
    c.imageSmoothingEnabled=false;c.drawImage(source,i%4*128,Math.floor(i/4)*128,128,128,-28,-120/128*56,56,56);
    c.restore();tex.add(i,0,x,y,EQUIP_CELL,EQUIP_CELL);
  }
  tex.refresh();return key;
}
