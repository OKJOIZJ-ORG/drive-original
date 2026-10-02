'use strict';
// Exact frozen helper + existing local fake; no browser/device/product execution.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto');
const DIR=__dirname,ROOT=path.resolve(DIR,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync(path.join(DIR,'eof-observer.function.js'),'utf8'),binding=JSON.parse(fs.readFileSync(path.join(DIR,'binding-observer.json')));
assert.equal(hash(source),'df9000db5f1670f5d7fe67f65baca427f610fdafa8994a46976b424e640f3854');
const oldTests=fs.readFileSync(path.join(ROOT,'qa/q3-actual-preparation/android-q3-eof-actor.test.cjs'),'utf8');
const fixtureText=oldTests.slice(oldTests.indexOf('function fixture() {'),oldTests.indexOf("\r\ntest(")<0?oldTests.indexOf("\ntest("):oldTests.indexOf("\r\ntest("));
assert.ok(fixtureText.startsWith('function fixture() {'));function fixture(){return vm.runInNewContext(`(${fixtureText.trim()})()`,{vm,source,binding});}
const app=cp.execFileSync('git',['show',`${binding.sourceCommit}:app.js`],{cwd:ROOT,maxBuffer:2000000}).toString('utf8');
const endedApp=app.match(/el\.videoPlayer\.addEventListener\('ended', (\(event\) => \{[\s\S]*?\n  \})\);/)?.[1];assert.ok(endedApp);
test('c1 shape: native property/sample full fences true does not invent a trusted event; delivered ended is separately adopted',()=>{
 const f=fixture();f.full();f.tick();let r=f.api.read();assert.equal(r.samples.at(-1).ended,true);assert.equal(r.samples.at(-1).currentOwner,true);assert.equal(r.sourceCompletion.admittedSourceProgramComplete,true);assert.equal(r.realTime1x,true);assert.equal(r.nativeEnded,null);assert.equal(r.qualified,false);
 f.ended();r=f.api.read();assert.equal(r.nativeEnded.trusted,true);assert.equal(r.qualified,true);const cleanup=f.api.stop();assert.equal(cleanup.nativeListenersRemoved,true);assert.equal(f.listeners.size,0);assert.equal(f.callbacks.size,0);assert.equal(f.timers.size,0);
});
test('exact app ended handler watchdog clears before or after observer do not erase delivered trusted event or current-owner fences',()=>{
 for(const appFirst of [true,false]){const f=fixture();f.full();const cleared=[];const handler=vm.runInNewContext(`(${endedApp})`,{isCurrentMediaEvent:v=>v===f.video,clearMediaSeekWatchdog:r=>cleared.push(['seek',r]),clearMediaFrameWatchdog:r=>cleared.push(['frame',r])});const e={currentTarget:f.video};if(appFirst)handler(e);f.ended();if(!appFirst)handler(e);assert.equal(f.api.read().qualified,true);assert.equal(cleared.length,2);f.api.stop();}
});
test('pre-latch element replacement reattaches then trusts exact new element only; latched replacement stays a failure; all listeners are removed',()=>{
 for(const latched of [false,true]){const f=fixture();if(latched)f.frame(0,13000);const replacement={...f.video};f.context.getActiveMediaElement=()=>replacement;f.context.isCurrentMediaEvent=v=>v===replacement;f.tick();assert.equal(f.callbacks.size,1);f.full(1,latched?1:0);replacement.currentTime=180;replacement.ended=true;replacement.paused=true;f.ended();assert.equal(f.api.read().nativeEnded,null);f.listeners.get('ended')({type:'ended',isTrusted:true,target:replacement});const r=f.api.read();assert.equal(r.qualified,!latched);assert.equal(r.failures.ownerChanged,latched);f.api.stop();assert.equal(f.callbacks.size,0);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);}
});
test('untrusted, hidden-label or account-switched delivered ended cannot replace existing trusted current-owner criteria',()=>{
 for(const [change,trusted] of [[f=>{},false],[f=>{f.rail.hidden=true;},true],[f=>{f.ownership.accountSame=false;f.ownership.mayClose=false;},true]]){const f=fixture();f.full();change(f);f.ended(trusted);assert.equal(f.api.read().qualified,false);assert.equal(f.api.read().nativeEnded,null);f.api.stop();}
 const f=fixture();f.full();f.rail.hidden=true;f.ended();assert.equal(f.api.read().nativeEnded,null);assert.equal(f.api.read().qualified,false);f.api.stop();
});
