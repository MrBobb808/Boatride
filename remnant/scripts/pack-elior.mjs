// Optional authoring utility (sharp required). No runtime dependency.
// node scripts/pack-elior.mjs docs/art/elior-atlas-source.png
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const sharp = createRequire(import.meta.url)('sharp');
const path = process.argv[2];
if (!path) throw new Error('Pass the generated transparent atlas');
const {data, info} = await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const w=info.width,h=info.height,cell=128,baseline=120;
const labels=new Int32Array(w*h),components=[];
let label=0;
// Extract full silhouettes before dividing into cells: preserve outstretched limbs.
for(let p=0;p<w*h;p++){
  if(labels[p]||data[p*4+3]<32)continue;
  const id=++label,q=[p];labels[p]=id;
  let l=w,r=0,t=h,b=0;
  for(let k=0;k<q.length;k++){
    const z=q[k],x=z%w,y=Math.floor(z/w);
    l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
    for(const n of [z-1,z+1,z-w,z+w]){
      if(n<0||n>=w*h||Math.abs(n%w-x)>1||labels[n]||data[n*4+3]<32)continue;
      labels[n]=id;q.push(n);
    }
  }
  if(q.length>5000)components.push({id,l,r,t,b});
}
if(components.length!==16)throw new Error(`Expected 16 complete characters, got ${components.length}`);
components.sort((a,b)=>Math.floor((a.t+a.b)/2/(h/4))-Math.floor((b.t+b.b)/2/(h/4))||a.l-b.l);
const scale=Math.min(108/Math.max(...components.slice(0,4).map(c=>c.b-c.t+1)),120/Math.max(...components.map(c=>c.r-c.l+1)));
const layers=[];
for(let i=0;i<16;i++){
  const c=components[i],cw=c.r-c.l+1,ch=c.b-c.t+1,pixels=Buffer.alloc(cw*ch*4);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const p=(c.t+y)*w+c.l+x;
    // Preserve this silhouette and its antialiased edge; discard detached border debris.
    if(labels[p]!==c.id&&![-1,1,-w,w].some(d=>labels[p+d]===c.id))continue;
    data.copy(pixels,(y*cw+x)*4,p*4,p*4+4);
  }
  const width=Math.round(cw*scale),height=Math.round(ch*scale);
  const buffer=await sharp(pixels,{raw:{width:cw,height:ch,channels:4}}).resize(width,height,{kernel:'nearest'}).png().toBuffer();
  layers.push({input:buffer,left:i%4*cell+Math.round((cell-width)/2),top:Math.floor(i/4)*cell+baseline-height});
}
await sharp({create:{width:cell*4,height:cell*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png({palette:true,colours:256,dither:0}).toFile('src/assets/elior-v3.png');
await writeFile('docs/art/elior-frame-manifest.json',JSON.stringify({cell,baseline,columns:4,frames:16,scale,poses:['idle-a','idle-b','idle-c','idle-d','run-a','run-b','run-c','run-d','jump','fall','windup','strike','dodge-a','dodge-b','hurt','throw']},null,2)+'\n');
console.log('Packed 16 Elior poses into src/assets/elior-v3.png');
