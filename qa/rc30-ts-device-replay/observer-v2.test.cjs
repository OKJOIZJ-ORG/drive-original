'use strict';
// Reuse the frozen v1 focused fixture without editing its source or recording
// another v1 run. Every scenario below exercises the additive v2 expression.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const original=fs.readFileSync(path.join(__dirname,'observer.test.cjs'),'utf8');
const fixtureSource=original.slice(original.indexOf('function fixture(){'),original.indexOf("test('private target"));
const binding=require('./binding.json'),source=fs.readFileSync(path.join(__dirname,'single-file-observer-v2.expression.js'),'utf8');
const factory=vm.runInNewContext('('+fixtureSource.trim()+')',{binding,source,vm,assert,AbortController});
test('pending readiness does not mask a current advanced-generation target frame',()=>{
 const f=factory();f.context.state.selected=f.target;f.api.arm('seek50',{targetSeconds:50});f.stats.generation=2;f.stats.phase='opening';f.context.mediaSeekWatchdog={};
 f.present(50);const r=f.api.read();assert.equal(r.phases[0].firstTargetFrame.sourceTime,50);assert.equal(r.latest.pipeline.phase,'opening');assert.equal(r.latest.seekWatchdog,true);f.api.stop();
});
test('preinput generation, wrong time, retired and cancelled pipelines reject',()=>{
 for(const kind of ['preinput','wrong-time','disposed','failed','cancelled','aborted']){const f=factory();f.context.state.selected=f.target;f.api.arm('seek50',{targetSeconds:50});
  if(kind!=='preinput')f.stats.generation=2;if(kind==='disposed')f.stats.disposed=true;if(['failed','cancelled'].includes(kind))f.stats.phase=kind;
  if(kind==='aborted')f.context.q1Playback.controller.signal.aborted=true;f.present(kind==='wrong-time'?0:50);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.api.stop();}
});
test('canonical private holder and exact-file/account/source drift remain fenced',async()=>{
 const f=factory();await f.api.metadata('before');f.context.state.selected={...f.target,id:'OTHER'};f.api.arm('startup');f.present(0);
 assert.equal(f.api.read().phases[0].firstTargetFrame,null);assert.equal(JSON.stringify(f.api.read()).includes(f.target.id),false);f.api.stop();
 for(const kind of ['account','controller','source','visible']){const x=factory();x.context.state.selected=x.target;x.api.arm('startup');
  if(kind==='account')x.context.state.accountId='OTHER';if(kind==='controller')x.context.navigator.serviceWorker.controller={state:'activated'};
  if(kind==='source')x.context.APP_VERSION='OTHER';if(kind==='visible')x.context.document.visibilityState='hidden';x.present(0);assert.equal(x.api.read().phases[0].firstTargetFrame,null);x.api.stop();}
});
test('15s failure remains after target frame in bounded35 diagnosis; mapped clock still exact',()=>{
 const f=factory();f.context.state.selected=f.target;f.context.q1Playback.kind='general';f.stats.mapping={commonShift:110,sourceOrigin:100};
 f.api.arm('seek50',{targetSeconds:50});f.present(40);f.advance(15100);assert.equal(f.api.read().phases[0].deadline15.passed,false);
 f.stats.generation=2;f.advance(10000);f.present(40);const p=f.api.read().phases[0];assert.equal(p.firstTargetFrame.sourceTime,50);assert.equal(p.firstTargetFrame.elapsedMs,25100);assert.equal(p.deadline15.passed,false);f.api.stop();
});
test('EOF exact last frame remains unknown and six-minute owned cleanup is bounded',()=>{
 const f=factory();f.context.state.selected=f.target;f.api.arm('nearEOF',{targetSeconds:99});f.stats.generation=2;f.present(99);
 assert.equal(f.api.read().eof.exactFinalFrame,'UNKNOWN');assert.equal(f.api.read().eof.nativeEnded,false);f.advance(360000);assert.equal(f.api.read().disposed,true);assert.equal(f.counts().listenerCount,0);
});
