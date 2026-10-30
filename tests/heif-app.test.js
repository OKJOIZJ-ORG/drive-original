'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app/original-buffer.js'),'utf8');
const core=fs.readFileSync(path.join(__dirname,'../app/core.js'),'utf8');
const ownerFunctions=core.slice(core.indexOf('function isCurrentOriginalBufferOwner('),core.indexOf('function decideMediaRecovery('));
const functions=app.slice(app.indexOf('async function prepareOriginalImageForDisplay('),app.indexOf('\nfunction updateOriginalBufferProgress('))
 .replace("await import('../media/heif-image.mjs')",'await loadAdapter()');
const heic=()=>{const b=Buffer.alloc(24);b.writeUInt32BE(24);b.write('ftyp',4);b.write('heic',8);b.write('mif1',16);return new Blob([b],{type:'image/jpeg'});};
const turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function context({native='error',loadFailure=false,decode=async()=>({blob:new Blob(['png'],{type:'image/png'})})}={}){
 const urls=[],revoked=[],images=[],timers=new Map(),errors=[],previews=[];let imports=0,decodes=0,cleanups=0,nextTimer=0;
 class NativeImage{
  naturalWidth=0;
  constructor(){images.push(this);}
  set src(value){this.url=value;if(native!=='pending')queueMicrotask(()=>{this.naturalWidth=native==='load'?32:0;(native==='load'?this.onload:this.onerror)?.();});}
  removeAttribute(name){assert.equal(name,'src');this.removed=true;}
 }
 const file={id:'synthetic',name:'unchanged.jpg',mimeType:'image/jpeg'},state={selected:file,mediaSession:3,authAccountKey:'account-a',driveSessionGeneration:1,mediaExhaustedOriginalModes:new Set(),mediaAbortController:null};
 const c=vm.createContext({Blob,Uint8Array,AbortController,DOMException,Image:NativeImage,console,
  setTimeout:(f,ms)=>{const id=++nextTimer;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),
  URL:{createObjectURL:blob=>{const url='blob:synthetic-'+urls.length;urls.push({blob,url});return url;},revokeObjectURL:url=>revoked.push(url)},state,
  PLAYBACK_MODE:{MEMORY:'memory-original',OPFS:'disk-original',IMAGE_COMPATIBILITY:'image-compatible-png'},
  el:{codecNote:{textContent:''},imageViewer:{dataset:{},hidden:true}},
  loadAdapter:async()=>{imports++;if(loadFailure)throw new TypeError('Synthetic module load failure');return {isHeifHeader:bytes=>String.fromCharCode(...bytes.subarray(8,12))==='heic',decodeHeifImage:async(...args)=>{decodes++;return decode(...args);}};},
  downloadOriginalFile:async()=>c.original,cleanupOriginalTempStorage:()=>{cleanups++;},updateQualityDisplay(){},clearDirectMediaSources(){},showMediaLoading(){},
  reportAppFailure(){},showMediaError:(message,options)=>errors.push({message,...options}),showDrivePreview:(...args)=>previews.push(args),
  classifyMediaProxyFailure:()=>null,isLocalOriginalStorageError:()=>false,isDriveSecurityRestriction:()=>false});
 vm.runInContext('let mediaSourceGeneration=7;'+ownerFunctions+functions,c);
 return {c,file,urls,revoked,images,timers,errors,previews,stats:()=>({imports,decodes,cleanups}),prepare:(blob,signal)=>{c.original=blob;c.signal=signal;return vm.runInContext('prepareOriginalImageForDisplay(original,signal)',c);},
  start:blob=>{c.original=blob;return vm.runInContext('startOriginalBlobFallback(state.selected,"image",3,{policy:{decision:"auto",mode:"memory"}})',c);}};
}
test('ordinary raster skips HEIF import and preserves the original Blob',async()=>{
 const f=context(),blob=new Blob([Buffer.from([255,216,255,224,1,2])],{type:'image/jpeg'}),controller=new AbortController();
 assert.equal((await f.prepare(blob,controller.signal)).blob,blob);assert.deepEqual(f.stats(),{imports:0,decodes:0,cleanups:0});assert.equal(f.urls.length,0);
});
test('native HEIC uses correctly typed original bytes and revokes its temporary probe URL',async()=>{
 const f=context({native:'load'}),blob=heic(),result=await f.prepare(blob,new AbortController().signal);
 assert.equal(result.heic,true);assert.equal(result.converted,undefined);assert.equal(result.blob.type,'image/heic');
 assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()),Buffer.from(await blob.arrayBuffer()));
 assert.equal(blob.type,'image/jpeg');assert.equal(f.stats().decodes,0);assert.deepEqual(f.revoked,[f.urls[0].url]);assert.equal(f.images[0].removed,true);assert.equal(f.timers.size,0);
});
test('native rejection uses worker PNG and labels conversion without changing file identity',async()=>{
 const f=context(),before={...f.file};await f.start(heic());
 assert.equal(f.stats().decodes,1);assert.equal(f.c.state.mediaPlaybackMode,'image-compatible-png');assert.equal(f.urls.at(-1).blob.type,'image/png');
 assert.equal(f.c.el.imageViewer.src,f.urls.at(-1).url);assert.match(f.c.el.codecNote.textContent,/PNG/);assert.match(f.c.el.codecNote.textContent,/동일한 표시를 보장하지/);assert.deepEqual(f.file,before);
});
test('native HEIC probe abort releases its URL and never starts conversion',async()=>{
 const f=context({native:'pending'}),controller=new AbortController(),pending=f.prepare(heic(),controller.signal);
 await turn();controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.stats().decodes,0);assert.equal(f.revoked.length,1);assert.equal(f.timers.size,0);
});
test('native probe deadline falls back after five seconds and releases probe ownership',async()=>{
 const f=context({native:'pending'}),pending=f.prepare(heic(),new AbortController().signal);await turn();
 const timeout=[...f.timers.values()][0];assert.equal(timeout.ms,5000);timeout.f();const result=await pending;
 assert.equal(result.converted,true);assert.equal(f.stats().decodes,1);assert.equal(f.revoked.length,1);assert.equal(f.timers.size,0);
});
for(const mutation of ['state.selected={id:"other"}','state.mediaSession++','mediaSourceGeneration++','state.authAccountKey="account-b";state.driveSessionGeneration++;state.mediaSession++'])
test('late conversion cannot publish after owner changes: '+mutation,async()=>{
 const gate=deferred(),f=context({decode:()=>gate.promise}),pending=f.start(heic());await turn();assert.equal(f.stats().decodes,1);
 vm.runInContext(mutation,f.c);gate.resolve({blob:new Blob(['png'],{type:'image/png'})});await pending;
 assert.equal(f.urls.length,1);assert.equal(f.c.el.imageViewer.src,undefined);assert.notEqual(f.c.state.mediaPlaybackMode,'image-compatible-png');assert.equal(f.stats().cleanups,1);
});
test('HEIF decode failure has an image-specific error, with no Drive preview/network fallback',async()=>{
 const f=context({decode:async()=>{throw Error('HEIF_DEPTH_UNSUPPORTED');}});await f.start(heic());
 assert.equal(f.c.state.mediaAttempt,'failed');assert.equal(f.previews.length,0);assert.equal(f.errors.length,1);assert.match(f.errors[0].title,/이미지 호환/);assert.match(f.errors[0].message,/색 심도/);assert.equal(f.urls.length,1);
});
test('HEIF adapter load failure after a completed download is not reported as a Drive transfer failure',async()=>{
 const f=context({loadFailure:true});await f.start(heic());assert.equal(f.previews.length,0);assert.equal(f.errors.length,1);assert.match(f.errors[0].title,/이미지 호환/);assert.equal(f.c.state.mediaAttempt,'failed');
});
test('aborted late decoder result must not publish even when the adapter ignores its signal',async()=>{
 const gate=deferred(),f=context({decode:()=>gate.promise}),pending=f.start(heic());await turn();
 f.c.state.mediaAbortController.abort();gate.resolve({blob:new Blob(['png'],{type:'image/png'})});await pending;
 assert.equal(f.c.el.imageViewer.src,undefined);assert.notEqual(f.c.state.mediaPlaybackMode,'image-compatible-png');assert.equal(f.urls.length,1);
});
