'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const here=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function bound(p,ms,code){let t;return Promise.race([p,new Promise((_,j)=>t=setTimeout(()=>j(Error(code)),ms))]).finally(()=>clearTimeout(t));}
async function run({tab,cdp}) {
 const file=path.join(here,'actual-pc-result.json');if(fs.existsSync(file))throw Error('COLOR_RESULT_NO_OVERWRITE');
 const producer=fs.readFileSync(path.join(here,'browser.function.js'),'utf8');new Function('return ('+producer+')');
 const report={schema:'rc37-disposable-real-account-color-integration/1',sourceCommit:'051dc3456f5000b958a18593848769b3687991e5',
   scope:'One exact generated disposable fixture uploaded to actual Drive; actual app handlers/native audio select; no cold/OS gesture/p95/pixel equality claim',
   originalMediaWrite:false,productChanged:false,driverSha256:sha(fs.readFileSync(__filename)),observerSha256:sha(Buffer.from(producer)),steps:[]};
 let owned=false,active=false;const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 const step=(name,value)=>{report.steps.push({name,at:Date.now(),value});save();};
 const rpc=async expression=>{const r=await bound(cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},{timeoutMs:25000}),30000,'COLOR_RPC_BOUND');
   if(r.exceptionDetails){const safe=r.exceptionDetails.exception?.description?.split('\n')[0]?.match(/^(?:Error|TypeError|ReferenceError): (COLOR_[A-Z0-9_]+)$/)?.[1];throw Error(safe||'COLOR_BROWSER_EXCEPTION');}return r.result.value;};
 const call=name=>rpc('window.__rc37DisposableColor.'+name+'()');
 async function poll(name,predicate,ms){const start=Date.now();let value;do{value=await call('read');if(!value.fence||value.error)throw Error('COLOR_LIFETIME_FAILURE');
   if(predicate(value)){step(name,{...value,elapsedMs:Date.now()-start});return value;}await new Promise(r=>setTimeout(r,200));}while(Date.now()-start<ms);
   step(name+' timeout',{...value,elapsedMs:Date.now()-start});throw Error('COLOR_PHASE_DEADLINE');}
 save();
 try {
   step('prepared before any timed playback',await rpc('('+producer+')()'));owned=true;
   const located=await call('locate');step('bounded actual-source selection before playback',located);if(!located.eligible)throw Error('COLOR_NO_SMALL_ACTUAL_SAMPLE');
   active=true;step('actual app open handler BEFORE first frame',await call('open'));
   await poll('Q0 current decoded frame',r=>r.current&&r.q0&&r.verified&&r.transport&&r.ready>=2&&r.width>0&&r.height>0,15000);
   await rpc('el.videoPlayer.pause()');step('current native color before audio selection',await call('captureNative'));
   await call('tracks');const inventory=await call('read');step('actual current track inventory after settled normal handler',inventory);if(!inventory.current||!inventory.tracksCurrent||!inventory.tracksCleanup||!inventory.audioOptions.some(t=>t.codec==='aac'&&t.route==='q1'))throw Error('COLOR_SAMPLE_TRACKS_NOT_QUALIFIED');
   const audio=inventory.audioOptions.find(t=>t.codec==='aac'&&t.route==='q1');step('native audio selection BEFORE change',{trackId:audio.id,initialDeadlineMs:15000});
   await tab.playwright.locator('#playerAudioTrack').selectOption(String(audio.id));await tab.getAXState({emit:false});
   await poll('selected-audio current first frame',r=>r.current&&r.currentMediaEvent&&r.q1&&!r.q0&&!r.switching&&r.verified&&r.transport&&Number.isFinite(r.mappedPresentedMediaTime)&&r.ready>=2&&r.selectedAudio===audio.id&&r.phase!=='failed',15000);
   await poll('current source window config',r=>r.statsReady&&r.pipelineAudio===audio.id,15000);
   const verdict=await call('verify');step('actual changed-color branch verdict',verdict);
   report.integrationPassed=verdict.originalMetadataUnchanged&&verdict.observed&&verdict.capturedTupleMatches&&verdict.derivedTupleMatches
     &&verdict.frameTupleMatches&&verdict.sourceConfigPreserved&&verdict.pipelineAudio===audio.id;
   report.declaredSourcePreservation=verdict.originalMetadataUnchanged&&verdict.sourceConfigPreserved;
   report.encodersCreated=verdict.encoders??'UNKNOWN_WINDOW_ONLY';report.copiedPacketAndClockProof='REUSED_QUALIFIED_CONTROLLED_ALGORITHM_NOT_NEW_ACTUAL_FULL_FILE_ORACLE';report.pixelEquality='NOT_TESTED_EXISTING_STRICT_FAILURE_RETAINED';report.completed=report.integrationPassed;
   if(!report.completed)report.failure='COLOR_CHANGED_BRANCH_NOT_QUALIFIED';
 } catch(e) {report.completed=false;report.failure=e.message?.match(/\bCOLOR_[A-Z0-9_]+\b/)?.[0]||'COLOR_TOOL_OR_PRODUCT_EXCEPTION';report.transportDeadlineObserved=/Timed out.*CDP command/.test(e.message);report.errorName=['Error','TypeError','ReferenceError','AbortError'].includes(e.name)?e.name:'UNKNOWN';}
 finally {if(owned){try{step('ordinary close and owned cleanup',await bound(call('cleanup'),30000,'COLOR_CLEANUP_BOUND'));
   report.cleanupComplete=Object.values(report.steps.at(-1).value).every(v=>v===true);}catch{report.cleanupComplete=false;}}
   else report.cleanupComplete=!active;report.completed=report.completed===true&&report.cleanupComplete;save();}
 return {completed:report.completed,integrationPassed:report.integrationPassed??false,failure:report.failure??null,cleanupComplete:report.cleanupComplete,resultSha256:sha(fs.readFileSync(file))};
}
module.exports={run};
