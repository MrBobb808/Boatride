// Normalize the image-generated poses once to Elior's feet/body scale.
import type Phaser from 'phaser';
const CELL=128,FOOT=96,SCALE=0.15;
// x, y, width, height, body anchor x, common feet baseline for the row.
const SOURCE=[
  [74,8,228,298,190,297],[380,8,211,298,496,297],[684,8,216,298,805,297],[991,8,220,298,1115,297],
  [25,326,294,285,183,605],[328,326,310,285,492,605],[650,326,307,285,803,605],[959,326,286,285,1116,605],
  [9,612,305,286,180,896],[328,612,318,286,492,896],[646,612,314,286,805,896],[983,612,262,286,1117,896],
  [33,898,268,337,174,1226],[334,898,269,337,486,1226],[622,898,281,337,790,1226],[913,898,341,337,1085,1226],
];
const CLIPS:Record<string,number[]>={
  idle:[0,0,1,1,2,2,3,3],run:[4,4,5,5,6,6,7,7],jump:[8],fall:[9],roll:[10],airdash:[10],hurt:[11],cast:[12],
  bowDraw:[12,12,13,13,14,14,14,14],bowRelease:[15,15,15,15,12,12,12,12],
};
export function rangerAtlas(sc:Phaser.Scene,mantle=false) {
  const key=`action-tirzah-bow${mantle?'-mantle':''}`;if(sc.textures.exists(key))return key;
  const tex=sc.textures.createCanvas(key,CELL*4,CELL*4)!,c=tex.getContext(),source=sc.textures.get('tirzah-source').getSourceImage() as HTMLImageElement;
  c.imageSmoothingEnabled=false;
  SOURCE.forEach(([x,y,w,h,anchor,baseline],i)=>{
    const dx=i%4*CELL,dy=Math.floor(i/4)*CELL;
    c.save();c.beginPath();c.rect(dx,dy,CELL,CELL);c.clip();c.drawImage(source,x,y,w,h,dx+CELL/2+(x-anchor)*SCALE,dy+FOOT+(y-baseline)*SCALE,w*SCALE,h*SCALE);c.restore();
  });
  if(mantle) {
    const image=c.getImageData(0,0,CELL*4,CELL*4),d=image.data;
    for(let i=0;i<d.length;i+=4)if(d[i+3]&&d[i+1]>d[i]*1.1&&d[i+2]>d[i]*0.85) {
      // Change teal cloth, preserving skin, braid, gold and ivory.
      const l=d[i]*0.2+d[i+1]*0.65+d[i+2]*0.15;d[i]=Math.min(255,l*1.2+12);d[i+1]=l*0.4;d[i+2]=Math.min(255,l*1.7+16);
    }
    c.putImageData(image,0,0);
  }
  for(const[clip,poses]of Object.entries(CLIPS))for(let i=0;i<8;i++) {
    const n=poses[Math.min(i,poses.length-1)];tex.add(`${clip}:${i}`,0,n%4*CELL,Math.floor(n/4)*CELL,CELL,CELL);
  }
  tex.refresh();return key;
}
