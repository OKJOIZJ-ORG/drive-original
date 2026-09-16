'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const test=require('node:test');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function worker(fetchImpl, cacheImpl={}) {
  const listeners=new Map();
  const c={URL,Headers,Request,Response,setTimeout,clearTimeout,console,
    self:{location:{origin:'https://app.test',href:'https://app.test/drive-original/sw.js'},registration:{scope:'https://app.test/drive-original/'},addEventListener:(type,fn)=>listeners.set(type,fn)},
    fetch:fetchImpl,caches:{open:async name=>{assert.match(name,/^drive-original-shell-/);return cacheImpl;}}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),c);
  return {c,listeners,run:code=>vm.runInContext(code,c)};
}
test('shell cache normalizes versioned asset URLs but excludes version checks and sibling routes',()=>{
  const w=worker();
  assert.equal(w.run(`shellAssetCacheKey(new Request('https://app.test/drive-original/app.js?v=1.20.0'))`),'https://app.test/drive-original/app.js');
  for(const url of ['https://app.test/drive-original/version.json','https://app.test/sibling/app.js','https://app.test/drive-original/memory/private.md']){
    assert.equal(w.c.shellAssetCacheKey(new Request(url)),null);
  }
  let intercepted=false;
  w.listeners.get('fetch')({request:new Request('https://app.test/sibling/app.js'),respondWith(){intercepted=true;}});
  assert.equal(intercepted,false);
});
test('offline first launch resolves canonical preinstalled assets',async()=>{
  const seen=[];
  const w=worker(async()=>{throw new TypeError('offline');},{match:async key=>{seen.push(key);return new Response('cached shell');}});
  const r=await w.run(`networkFirstAsset(new Request('https://app.test/drive-original/app.js?v=1.20.0'))`);
  assert.equal(await r.text(),'cached shell');assert.deepEqual(seen,['https://app.test/drive-original/app.js']);
});
test('cache quota errors do not discard valid network bytes',async()=>{
  const w=worker(async()=>new Response('fresh shell'),{put:async()=>{throw new Error('quota');}});
  const r=await w.run(`networkFirstAsset(new Request('https://app.test/drive-original/styles.css'))`);
  assert.equal(await r.text(),'fresh shell');
});
test('temporary server failures use the owned cached shell instead of an error document',async()=>{
  const w=worker(async()=>new Response('unavailable',{status:503}),{match:async()=>new Response('known good')});
  const r=await w.run(`networkFirstAsset(new Request('https://app.test/drive-original/index.html'))`);
  assert.equal(r.status,200);assert.equal(await r.text(),'known good');
});
test('public deployment allowlist excludes internal memory, workflows and test fixtures',()=>{
  const build=fs.readFileSync(path.join(root,'scripts/build-pages.cjs'),'utf8');
  const copies=[];
  const mock={existsSync:()=>false,mkdirSync(){},copyFileSync:(source,dest)=>copies.push(path.relative(root,source)),writeFileSync(){}};
  vm.runInNewContext(build,{require:name=>name==='node:fs'?mock:require(name),__dirname:path.join(root,'scripts'),console:{log(){}}});
  assert.equal(copies.length,11);assert(copies.includes('app.js'));assert(copies.includes('sw.js'));
  assert(copies.every(file=>!/(?:memory|tests|\.github|\.agents|AGENTS)/.test(file)));
  const publish=fs.readFileSync(path.join(root,'scripts/publish-pages.cjs'),'utf8');
  assert.match(publish,/runNode\(\['--test'/);assert.match(publish,/refs\/heads\/gh-pages/);
  assert.match(publish,/publicFiles = \['index\.html'/);assert.doesNotMatch(publish,/--force/);
});
