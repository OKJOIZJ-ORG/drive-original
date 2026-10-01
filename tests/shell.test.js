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
  c.importScripts=name=>{assert.equal(name,'./media/revision-pin.js');vm.runInContext(fs.readFileSync(path.join(root,'media/revision-pin.js'),'utf8'),c);};
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
  const files=require('../scripts/public-files.cjs');
  vm.runInNewContext(build,{require:name=>name==='node:fs'?mock:name==='./public-files.cjs'?files:require(name),__dirname:path.join(root,'scripts'),console:{log(){}}});
  assert.deepEqual(copies.map(file=>file.replaceAll('\\','/')).sort(),[...files].sort());
  assert(copies.includes('app.js'));assert(copies.includes('sw.js'));assert(copies.includes('runtime-config.js'));
  assert(copies.includes(path.join('media','revision-pin.js')));
  assert(copies.every(file=>!/(?:memory|tests|\.github|\.agents|AGENTS)/.test(file)));
  const publish=fs.readFileSync(path.join(root,'scripts/publish-pages.cjs'),'utf8');
  assert.match(publish,/runNode\(\['--test'/);assert.match(publish,/refs\/heads\/gh-pages/);
  assert.match(publish,/publicFiles = require\('\.\/public-files\.cjs'\)/);assert.doesNotMatch(publish,/--force/);
});
test('corresponding-source downloads remain public but never enter the runtime cache',()=>{
  const publicFiles=require('../scripts/public-files.cjs');
  const w=worker();
  const archives=publicFiles.filter(file=>/\.tgz$|\.tar\.gz\.part\d+$/.test(file));
  const audio=JSON.parse(fs.readFileSync(path.join(root,'licenses/audio-source-manifest.json'),'utf8'));
  const sourceFiles=audio.parts || audio.archive?.parts;
  assert(sourceFiles,'Source manifest must enumerate the downloadable parts');
  const q3=JSON.parse(fs.readFileSync(path.join(root,'licenses/video-q3-source-manifest.json'),'utf8'));
  const expectedArchives=['licenses/mediabunny-q1-preferred-source.tgz',...sourceFiles.map(part=>'licenses/'+part.path),'licenses/'+q3.archive];
  assert.deepEqual([...archives].sort(),expectedArchives.sort());
  for(const file of archives){
    assert(fs.existsSync(path.join(root,file)),file);
    assert.equal(w.c.shellAssetCacheKey(new Request('https://app.test/drive-original/'+file)),null,file);
  }
  for(const file of ['licenses/video-q3-source.tgz','licenses/video-q3-source-manifest.json','licenses/video-q3-source-NOTICE.md']){
    assert(publicFiles.includes(file),file);assert(fs.existsSync(path.join(root,file)),file);
    const request=new Request('https://app.test/drive-original/'+file);
    assert.equal(w.c.shellAssetCacheKey(request),null,file);
    let intercepted=false;w.listeners.get('fetch')({request,respondWith(){intercepted=true;}});
    assert.equal(intercepted,false,file+' must remain a direct public download');
  }
  const q3Runtime=publicFiles.filter(file=>file.startsWith('media/video-q3-'));
  assert.equal(q3Runtime.length,6);
  for(const file of q3Runtime)assert.equal(w.c.shellAssetCacheKey(new Request('https://app.test/drive-original/'+file)),'https://app.test/drive-original/'+file,file);
  assert(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('href="./licenses/index.html"'));
});
test('candidate deployment runs committed-asset materialization before publication',()=>{
  const workerPackage=JSON.parse(fs.readFileSync(path.join(root,'worker/package.json'),'utf8'));
  assert.match(workerPackage.scripts['build:committed-assets'],/materialize-committed-pages\.cjs/);
  assert.match(workerPackage.scripts['deploy:candidate'],/build:committed-assets/);
});

// In-memory Git/filesystem release scenario: execute the actual materializer,
// observe exact artifact writes, and inject failures at concrete release fences.
const {materializeCommittedPages}=require('../scripts/materialize-committed-pages.cjs');
const crypto=require('node:crypto');
function releaseFixture() {
  const repoRoot=path.join(root,'virtual-release'),destination=path.join(repoRoot,'_site');
  const nodes=new Map(),blobs=new Map(),dirty=new Set(),writes=[],commands=[];
  let head='a'.repeat(40),sequence=0,fdSequence=0;const fds=new Map();
  const digest=bytes=>crypto.createHash('sha1').update(bytes).digest('hex');
  const absolute=name=>path.join(repoRoot,name);
  function directory(name) {if(nodes.has(name))return;nodes.set(name,{type:'directory',ino:++sequence,nlink:1});const parent=path.dirname(name);if(parent!==name)directory(parent);}
  function file(name,data) {const target=absolute(name);directory(path.dirname(target));nodes.set(target,{type:'file',data:Buffer.from(data),ino:++sequence,nlink:1});}
  function commit(name,data) {blobs.set(name,Buffer.from(data));file(name,data);}
  directory(repoRoot);
  commit('scripts/public-files.cjs',"module.exports=Object.freeze(['app.js','icons/a.png']);");
  for(const name of ['.gitattributes','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs','scripts/publish-pages.cjs','worker/index.mjs','worker/wrangler.jsonc','worker/package.json','worker/package-lock.json'])commit(name,`committed:${name}\n`);
  commit('app.js','committed application\n');commit('icons/a.png',Buffer.from([0,255,1,2]));
  file('_site/app.js','prior build bytes');file('_site/icons/a.png','prior build bytes');file('_site/.nojekyll','prior marker');
  const stat=node=>({dev:1,ino:node.ino,nlink:node.nlink,isFile:()=>node.type==='file',isDirectory:()=>node.type==='directory',isSymbolicLink:()=>node.type==='link'});
  const get=name=>{const node=nodes.get(name);if(!node)throw Error('ENOENT '+name);return node;};
  const normalized=(name,data)=>name.endsWith('.png')?data:Buffer.from(data.toString('utf8').replaceAll('\r\n','\n'));
  const fixture={repoRoot,nodes,blobs,dirty,writes,commands,file,absolute,setHead:value=>{head=value;},onGit:null,onWrite:null,onOpen:null};
  fixture.fsApi={
    lstatSync:name=>stat(get(name)),realpathSync:name=>get(name).type==='link'?get(name).target:name,
    readdirSync:name=>[...nodes.keys()].filter(key=>path.dirname(key)===name).map(key=>path.basename(key)),
    openSync(name,flags){assert.equal(flags,'r+');const node=get(name);fixture.onOpen?.(name);const fd=++fdSequence;fds.set(fd,{name,node});return fd;},
    fstatSync:fd=>stat(fds.get(fd).node),ftruncateSync(fd,length){assert.equal(length,0);fds.get(fd).node.data=Buffer.alloc(0);},
    writeFileSync(fd,data){const entry=fds.get(fd);entry.node.data=Buffer.from(data);writes.push(entry.name);fixture.onWrite?.(entry.name);},
    closeSync:fd=>fds.delete(fd),readFileSync:name=>Buffer.from(get(name).data)
  };
  fixture.gitApi=args=>{
    commands.push(args);fixture.onGit?.(args);
    if(args[0]==='rev-parse')return Buffer.from(head+'\n');
    if(args[0]==='status') {
      const paths=args.slice(args.indexOf('--')+1);
      return Buffer.from([...dirty].filter(name=>paths.some(p=>name===p||name.startsWith(p+'/'))).map(name=>' M '+name+'\0').join(''));
    }
    if(args[0]==='show') {assert.ok(args[1].startsWith('a'.repeat(40)+':'),'every blob must use the initial fixed SHA');const name=args[1].slice(41);if(!blobs.has(name))throw Error('missing HEAD blob');return Buffer.from(blobs.get(name));}
    if(args[0]==='ls-tree') {
      const paths=args.slice(args.indexOf('--')+1);
      return Buffer.from([...blobs].filter(([name])=>paths.some(p=>name===p||name.startsWith(p+'/')))
        .map(([name,data])=>`100644 blob ${digest(data)}\t${name}\0`).join(''));
    }
    if(args[0]==='hash-object') {const name=args.at(-1);return Buffer.from(digest(normalized(name,get(absolute(name)).data))+'\n');}
    throw Error('unexpected Git operation '+args[0]);
  };
  fixture.run=()=>materializeCommittedPages(fixture);
  fixture.output=name=>fixture.fsApi.readFileSync(path.join(destination,name));
  return fixture;
}
test('committed public bytes replace CRLF/prebuild bytes while unrelated nonpublic preparations stay outside output',()=>{
  const f=releaseFixture();f.file('app.js','committed application\r\n');
  for(const name of ['media/general-worker.mjs','scripts/build-general-q1.cjs','tests/general.test.js','qa/private.json','memory/CHECKPOINT.md']) {f.file(name,'PRIVATE preparation');f.dirty.add(name);}
  assert.deepEqual(f.run(),{head:'a'.repeat(40),materialized:2});
  assert.ok(f.output('app.js').equals(f.blobs.get('app.js')));assert.ok(f.output('icons/a.png').equals(f.blobs.get('icons/a.png')));
  assert.equal(f.output('.nojekyll').length,0);assert.equal(f.writes.length,3);
  assert.ok(f.writes.every(name=>name.startsWith(path.join(f.repoRoot,'_site')+path.sep)));
});
test('dirty/untracked public, governing scripts and worker source/config reject before any write',()=>{
  for(const name of ['app.js','icons/a.png','scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs','scripts/publish-pages.cjs','.gitattributes','worker/index.mjs','worker/wrangler.jsonc','worker/package.json','worker/package-lock.json','worker/new-import.mjs']) {
    const f=releaseFixture();f.dirty.add(name);assert.throws(f.run,/publication inputs must be clean/);assert.equal(f.writes.length,0);
  }
});
test('an allowlisted asset missing from captured HEAD rejects even when ignored by Git status',()=>{
  const f=releaseFixture();f.blobs.delete('app.js');assert.throws(f.run,/missing from captured HEAD/);assert.equal(f.writes.length,0);
});
test('a public change hidden by Git status still fails normalized blob provenance',()=>{
  const f=releaseFixture();f.file('app.js','dirty public content');assert.throws(f.run,/differs from captured HEAD/);assert.equal(f.writes.length,0);
});
test('extra/missing artifact files and unexpected empty directories reject before any write',()=>{
  for(const mutation of [f=>f.file('_site/private.json','PRIVATE'),f=>f.nodes.delete(f.absolute('_site/app.js')),f=>f.nodes.delete(f.absolute('_site/.nojekyll')),f=>f.nodes.set(f.absolute('_site/empty'),{type:'directory',ino:999,nlink:1})]) {
    const f=releaseFixture();mutation(f);assert.throws(f.run,/Extra|Missing/);assert.equal(f.writes.length,0);
  }
});
test('linked output roots, directories/files, hardlinks and linked publication source are refused',()=>{
  for(const name of ['_site','_site/icons','_site/app.js','app.js','worker/index.mjs']) {
    const f=releaseFixture();f.nodes.set(f.absolute(name),{type:'link',ino:999,nlink:1,target:'outside'});
    assert.throws(f.run,/Linked|linked/);assert.equal(f.writes.length,0);
  }
  const f=releaseFixture();f.nodes.get(f.absolute('_site/app.js')).nlink=2;assert.throws(f.run,/linked/);assert.equal(f.writes.length,0);
});
test('a changed HEAD after fixed blobs were read prevents the first output write',()=>{
  const f=releaseFixture();f.onGit=args=>{if(args[0]==='show'&&args[1].endsWith(':icons/a.png'))f.setHead('b'.repeat(40));};
  assert.throws(f.run,/HEAD changed/);assert.equal(f.writes.length,0);
});
test('an output path replaced between inspection and open is refused before truncation',()=>{
  const f=releaseFixture();f.onOpen=name=>{f.nodes.set(name,{type:'link',ino:999,nlink:1,target:'outside'});};
  assert.throws(f.run,/changed or became linked/);assert.equal(f.writes.length,0);
});
test('HEAD/public changes or output contamination during writing prevent successful release completion',()=>{
  for(const mutate of [f=>f.setHead('b'.repeat(40)),f=>{f.file('app.js','late hidden edit');},f=>f.file('_site/private.json','late private artifact')]) {
    const f=releaseFixture();let once=false;f.onWrite=()=>{if(!once){once=true;mutate(f);}};
    assert.throws(f.run,/HEAD changed|differs from captured HEAD|Extra/);assert.ok(f.writes.length>0);
  }
});
