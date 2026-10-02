'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');const {joinSetup}=require('./preclose-setup.cjs');
function context(promise,mutate=()=>{}){const owner={audioProbeStarted:true,setupDone:promise,cleanupOk:true},controller={},ctx={Number,Error,Promise,setTimeout,clearTimeout,q0Playback:owner,q1Playback:null,mediaSourceGeneration:1,state:{selected:{id:'synthetic'}},navigator:{serviceWorker:{controller}},document:{visibilityState:'visible'},isCurrentQ0Playback:o=>o===owner};vm.createContext(ctx);mutate(ctx,owner);return{ctx,owner,fn:vm.runInContext('('+joinSetup.toString()+')',ctx)};}
test('joins existing setup promise without changing owner or playback',async()=>{const x=context(Promise.resolve());const r=await x.fn(100);assert(r.qualified&&r.sameCurrentQ0&&r.sourceOrPlaybackMutated===false);assert.equal(x.ctx.q0Playback,x.owner);});
test('rejected or unsettled setup cannot qualify and deadlines settle',async()=>{assert.equal((await context(Promise.reject(Error('synthetic'))).fn(100)).qualified,false);const r=await context(new Promise(()=>{})).fn(10);assert(r.deadline&&!r.qualified);await assert.rejects(context(Promise.resolve()).fn(25001),/BOUND/);});
test('source, owner, controller, route and foreground drift fail even after setup settlement',async()=>{
 for(const change of [c=>c.q0Playback={},c=>c.mediaSourceGeneration++,c=>c.q1Playback={},c=>c.navigator.serviceWorker.controller={},c=>c.document.visibilityState='hidden']){let settle;const x=context(new Promise(r=>settle=r));const p=x.fn(100);change(x.ctx);settle();assert.equal((await p).qualified,false);}
 const x=context(Promise.resolve(),(c,o)=>o.cleanupOk=false);assert.equal((await x.fn(100)).qualified,false);
});
