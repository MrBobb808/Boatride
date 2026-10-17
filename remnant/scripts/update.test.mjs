import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function worker(response, cached = new Response('<html>saved game</html>')) {
  const listeners={}, writes=[], requests=[];
  const cache={match:async()=>cached,put:async(key,value)=>writes.push([key,await value.text()])};
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{
    URL,Request,location:{origin:'https://example.test'},
    self:{addEventListener:(type,fn)=>listeners[type]=fn},
    caches:{open:async()=>cache,match:cache.match},
    fetch:async(req,options)=>{requests.push({req,options});if(response instanceof Error)throw response;return response;},
    setTimeout:()=>{},
  });
  return {writes,requests,async get(path,mode='navigate'){
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
