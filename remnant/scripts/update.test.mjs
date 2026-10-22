import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function worker(response, cached = new Response('<html>saved game</html>')) {
  const listeners={}, writes=[], requests=[], timers=[];
  const cache={match:async()=>cached,put:async(key,value)=>writes.push([key,await value.text()])};
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{
    URL,Request,location:{origin:'https://example.test'},
    self:{addEventListener:(type,fn)=>listeners[type]=fn},
    caches:{open:async()=>cache,match:cache.match},
    fetch:async(req,options)=>{requests.push({req,options});if(response instanceof Error)throw response;return response;},
    setTimeout:(_fn,ms)=>timers.push(ms),
  });
  return {writes,requests,timers,async get(path,mode='navigate'){
    let result;const waits=[];
    listeners.fetch({request:{url:'https://example.test/Boatride/'+path,method:'GET',mode},respondWith:p=>result=p,waitUntil:p=>waits.push(p)});
    const res=await result;await Promise.all(waits);return res;
  }};
}
test('an unsuccessful deployment response cannot overwrite the offline game',async()=>{
  const w=worker(new Response('Upstream error',{status:503}));
  assert.match(await (await w.get('')).text(),/saved game/);
  assert.equal(w.writes.length,0);
});
test('online navigation refreshes the document with HTTP cache bypass',async()=>{
  const w=worker(new Response('<html>new build</html>',{headers:{'content-type':'text/html'}}));
  assert.match(await (await w.get('?v=new')).text(),/new build/);
  assert.equal(w.requests[0].options.cache,'no-store');
  assert.equal(w.writes[0][0],'./index.html');
});
test('version probes never return the offline document or enter its cache',async()=>{
  const w=worker(new Response('{"build":"new"}'));
  assert.equal(await (await w.get('version.json?v=1','cors')).text(),'{"build":"new"}');
  assert.equal(w.writes.length,0);
  assert.equal(w.requests[0].options.cache,'no-store');
});
test('offline navigation retains a playable cached document',async()=>{
  const w=worker(new Error('offline'));
  assert.match(await (await w.get('')).text(),/saved game/);
});
test('HTML, service worker and version endpoint identify the same build, compatible with old clients',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const stamp=html.match(/<meta name="remnant-build" content="(\d+)"/)?.[1];
  assert.ok(stamp,'Old installed clients can still read the numeric stamp');
  const info=JSON.parse(readFileSync(new URL('../dist/version.json',import.meta.url),'utf8'));
  assert.equal(info.build,stamp);
  assert.ok(readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8').includes(`const VERSION = '${stamp}'`));
});


test('an explicit update waits for the fresh document instead of racing the offline cache',async()=>{
 let release;const response=new Promise(r=>release=r),w=worker(response);
 const navigation=w.get('?v=latest');assert.deepEqual(w.timers,[]);
 release(new Response('<html>latest build</html>',{headers:{'content-type':'text/html'}}));
 assert.match(await (await navigation).text(),/latest build/);assert.equal(w.writes.length,1);
});
test('an explicit update remains playable when the connection fails',async()=>{
 const w=worker(new Error('offline'));assert.match(await (await w.get('?v=latest')).text(),/saved game/);
 assert.equal(w.writes.length,0);
});

const updateSource=ts.transpileModule(readFileSync(new URL('../src/core/update.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function updater({here='old',latest='new',storage=new Map(),now=1700000000000,blocked=false,ok=true}={}){
 const exports={},replacements=[],requests=[],win={};win.top=win;
 const ss={getItem:k=>{if(blocked)throw Error('storage blocked');return storage.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('storage blocked');storage.set(k,v);},removeItem:k=>storage.delete(k)};
 vm.runInNewContext(updateSource,{exports,URL,window:win,document:{querySelector:()=>({getAttribute:()=>here})},Date:{now:()=>now},sessionStorage:ss,
  location:{href:'https://game.test/Boatride/',hostname:'game.test',protocol:'https:',replace:u=>replacements.push(u)},fetch:async(u,o)=>{requests.push(o);return{ok,json:async()=>({build:latest})};}});
 return{api:exports,storage,replacements,requests};
}
test('a stale document can retry a failed update after a cooldown and resume the same save',async()=>{
 const storage=new Map(),first=updater({storage});assert.equal(await first.api.checkForUpdate(),true);
 assert.equal(storage.has('remnant-update-tried'),false,'a probe is not a completed attempt');
 first.api.applyUpdate(2);assert.equal(new URL(first.replacements[0]).searchParams.get('v'),'new');
 const stale=updater({storage,now:1700000004000});assert.equal(await stale.api.checkForUpdate(),false,'no reload loop immediately after stale response');
 assert.equal(stale.api.takeResumeSlot(),2);assert.equal(stale.api.takeResumeSlot(),null);
 const retry=updater({storage,now:1700000061000});assert.equal(await retry.api.checkForUpdate(),true,'old cached build does not suppress the release for the session');
 assert.equal(retry.requests[0].cache,'no-store');assert.equal(await updater({here:'new',storage}).api.checkForUpdate(),false);
});
test('manual update checks bypass the retry cooldown and blocked storage does not disable detection',async()=>{
 const storage=new Map([['remnant-update-tried','new'],['remnant-update-tried-at','1700000000000']]);
 assert.equal(await updater({storage,now:1700000004000}).api.checkForUpdate(true),true);
 const privateMode=updater({blocked:true});assert.equal(await privateMode.api.checkForUpdate(),true);privateMode.api.applyUpdate(null);assert.equal(privateMode.replacements.length,1);
 assert.equal(await updater({ok:false}).api.checkForUpdate(),false);
});
