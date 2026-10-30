'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const {appSource}=require('./app-loader.cjs');
const fixtureModule={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'app.test.js'),'utf8').split('\ntest(')[0]+'\nmodule.exports=loadAppContext;', {require,__dirname,module:fixtureModule,AbortController,Blob,DOMException,Headers,Map,Math,Promise,Response,Set,URL,URLSearchParams,clearInterval,clearTimeout,console,fetch,performance,setInterval,setTimeout});
const run=(c,s)=>vm.runInContext(s,c);
function fixture({settled=true,fault=null,stale=false}={}){
 const c=fixtureModule.exports(),reads=[];let aborted=0;
 c.MediaSource=function(){};c.Worker=function(){};
 c.fakeSourceModule={openDriveQ1Source:async()=>{
  if(fault)throw new Error(fault);
  return {identity:{size:1048576},read:async request=>{reads.push(request);if(stale)run(c,'state.driveSessionGeneration++');return new Uint8Array(940);},abort:async()=>{aborted++;return {settled};}};
 }};
 run(c,`state.selected={id:'zero',name:'movie.mp4',mimeType:'video/mp4'};state.mediaSession=1;state.mediaAttempt='range';
 q1Retirement=playerTracksRetirement=Promise.resolve({settled:true});q0PinnedSource=null;playerTracksOwner=null;
 retireQ0Playback=()=>{};retireQ1Playback=async owner=>{await owner?.setupDone;return {settled:true};};
 globalThis.failures=[];globalThis.reasons=[];showMediaError=(message,options)=>failures.push({message,options});
 emitMediaDiagnosticStage=(_stage,detail)=>reasons.push(detail.reason);el.videoPlayer={error:null};`);
 const source=appSource.slice(appSource.indexOf('async function tryOriginalTsPlayback('),appSource.indexOf('\nasync function handleMediaElementError('))
  .replace("import('../media/drive-source.mjs')",'Promise.resolve(fakeSourceModule)');
 run(c,source);
 return {c,reads,aborted:()=>aborted,start:options=>run(c,`tryOriginalTsPlayback(state.selected,1,${JSON.stringify(options)})`)};
}
test('native-rejected zero header closes its fenced reader and reports the actual header condition',async()=>{
 const f=fixture();assert.equal(await f.start({general:true,nativeVideoRejected:true}),true);
 assert.equal(f.aborted(),1);assert.deepEqual(f.reads.map(r=>[r.start,r.end]),[[0,939]]);
 assert.deepEqual(Array.from(f.c.reasons),['Q1_SOURCE_ZERO_HEADER']);assert.match(f.c.failures[0].message,/파일 시작 부분이 0/);
 assert.equal(f.c.failures[0].options.showRetry,false);assert.equal(run(f.c,'q1Playback.player'),null);
});
test('zero prefix does not turn an initial native eligibility probe into a terminal failure',async()=>{
 const f=fixture();assert.equal(await f.start({initial:true}),false);assert.equal(f.aborted(),1);assert.equal(f.c.failures.length,0);
});
test('permission, unsettled cleanup and changed account lifetime cannot become a zero-header verdict',async()=>{
 for(const options of [{fault:'Q1_SOURCE_PERMISSION'},{settled:false},{stale:true}]){
  const f=fixture(options);await f.start({general:true,nativeVideoRejected:true});
  assert(!f.c.reasons.includes('Q1_SOURCE_ZERO_HEADER'));
  if(options.stale)assert.equal(f.c.failures.length,0);
  else assert.equal(f.c.reasons[0],options.fault||'Q1_CLEANUP_UNCONFIRMED');
 }
});
