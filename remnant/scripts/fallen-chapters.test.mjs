import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/game/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:p=>load(p.replace('./',''))});return exports;}
const {ROOMS6}=load('rooms6');
const {FALLEN_CHAPTERS,FALLEN_ROOMS,cleansingBeacon}=load('fallenChapters'),{Grid,isSolid}=load('tiles'),{bodyFits,makeBody}=load('physics'),{ITEMS,LORE}=load('data');
test('VI, VII and VIII have valid reciprocal routes, safe spawns and complete reward references',()=>{
 const rooms=new Map([...ROOMS6,...FALLEN_ROOMS].map(r=>[r.id,r]));assert.equal(rooms.size,20);
 for(const r of rooms.values()){
  const g=new Grid(r.rows);for(const [name,p]of Object.entries(r.spawns))assert.ok(bodyFits(makeBody(0,0,12,34),g,isSolid,p.x*16,p.y*16),r.id+'.'+name);
  for(const e of r.exits){const to=rooms.get(e.to);assert.ok(to?.spawns[e.spawn],r.id+' → '+e.to);assert.ok(to.exits.some(back=>back.to===r.id),'return route');}
  for(const e of r.ents){if(e.t==='lore')assert.ok(LORE[e.id],e.id);if(e.t==='chest')for(const l of e.loot)if(l.item)assert.ok(ITEMS[l.item],l.item);}
 }
 for(const c of FALLEN_CHAPTERS){for(const id of [...c.rewards,c.optional])assert.ok(ITEMS[id]?.unique,id);const doors=FALLEN_ROOMS.flatMap(r=>r.exits).filter(e=>e.to===c.arena);assert.equal(doors.length,1);assert.equal(doors[0].cond,`ch${c.n}_boundary_open`);}
});
test('upper side-room returns cannot immediately re-enter their door',()=>{
 for(const c of FALLEN_CHAPTERS){const r=FALLEN_ROOMS.find(r=>r.id===c.depths),p=r.spawns.side,e=r.exits.find(e=>e.to===c.side);assert.ok(p.x<e.x||p.x>e.x+e.w||p.y<e.y||p.y>e.y+e.h);}
});

test('chapter maps keep the hub, route, side room and arena from overlapping',()=>{
 for(const c of FALLEN_CHAPTERS){const rooms=FALLEN_ROOMS.filter(r=>r.biome===c.biome);for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){const a=rooms[i],b=rooms[j];assert.ok(a.map.x+a.w/16<=b.map.x||b.map.x+b.w/16<=a.map.x||a.map.y+a.h/16<=b.map.y||b.map.y+b.h/16<=a.map.y,a.id+' overlaps '+b.id);}}
});

test('miasma shelter is reachable by basic movement on Merciless and at maximum gauntlet tempo',()=>{
 for(const width of [896,960,1280])for(const x of [100,width*.25,width*.5,width*.75,width-100])for(const boss of [100,width*.5,width-100]){
  const beacon=cleansingBeacon(x,boss,width);assert.ok(beacon>=160&&beacon<=width-160);assert.ok(Math.abs(x-beacon)<=140);
  const walk=Math.max(0,Math.abs(x-beacon)-74)/142;assert.ok(walk+.25<1.6/(1.2*1.5),'shelter must allow reaction time plus walking');
 }
});
