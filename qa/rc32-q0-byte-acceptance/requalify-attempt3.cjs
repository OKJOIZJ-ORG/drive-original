'use strict';
// Offline root qualification. Immutable failed runtime remains unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {assessSafeNetwork}=require('./worker-network.cjs');
const dir=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const receipt='actual-android-q0-byte-attempt3-safe.json',expected='6ed366221007a5f52e0c56cf57568ce2cad0fe8803ee66c77782ddc35e0ecba7';
const raw=fs.readFileSync(path.join(dir,receipt));assert.equal(sha(raw),expected);
const r=JSON.parse(raw),step=name=>{const a=r.steps.filter(x=>x.name===name);assert.equal(a.length,1,name);return a[0];};
assert.equal(r.completed,false);assert.equal(r.failure,'Q0_BYTES_UNQUALIFIED');assert.equal(r.rawIdentifiersExported,false);
assert.equal(r.originalMediaMutated,false);assert.equal(r.originalMediaReadOnly,true);assert.equal(r.productionChanged,false);assert.equal(r.settingsChanged,false);
const binding=step('local immutable measurement binding');assert.equal(binding.sourceCommit,'1d79897fd32c569137cab079bfd93107be2ee33f');assert.equal(binding.version,'1.22.0-rc.32');
for(const [file,hash] of Object.entries(binding.files))assert.equal(sha(fs.readFileSync(path.join(dir,'attempt3.'+file))),hash,file);
for(const [file,hash] of Object.entries(binding.frozenHelpersSHA256))assert.equal(sha(fs.readFileSync(path.join(dir,'../rc32-ts-device-replay',file))),hash,file);
const source=step('source32 proof');assert.equal(source.source,binding.sourceCommit);assert.equal(source.version,binding.version);
assert(source.controllerActivated&&source.rootScope&&source.sourceProofInstalled&&!source.privateIdentityExported);
assert.equal(source.network.length,5);assert.equal(source.cache.length,40);assert(source.network.every(x=>x.matched===true));assert(source.cache.every(x=>x.matched===true));
const frame=step('bounded Q0 frame/progress result');assert.equal(frame.sourceCommit,binding.sourceCommit);assert.equal(frame.version,binding.version);assert.equal(frame.route,'Q0');
assert.equal(frame.current,true);assert.equal(frame.failure,null);assert.equal(frame.rawIdentifiersExported,false);assert.equal(frame.actualPlaybackCount,1);
assert(frame.firstFrame.currentOwner&&frame.progressFrame.currentOwner&&frame.firstFrame.elapsedMs>0&&frame.firstFrame.elapsedMs<=70000);
assert(frame.progressFrame.mediaTime>frame.firstFrame.mediaTime&&frame.progressFrame.at>=frame.firstFrame.at);
for(const label of ['before','after']){const m=step('fresh '+label+' metadata');assert.equal(m.qualified,true);assert.equal(m.status,200);assert(m.at<frame.firstFrame.at||label==='after');if(label==='after')assert(m.at>frame.progressFrame.at);}
assert.equal(step('same source-worker target after terminal drain').sameWorkerTarget,true);
const final=step('post-close conservative upstream transfer envelope'),assessment=assessSafeNetwork(final.network);assert.equal(assessment.qualified,true);assert.deepEqual(assessment.clearedReasons,['preflightResponse']);
const trace=final.swReaderTrace,n=final.network;assert.equal(trace.overflow,false);assert.equal(trace.rawIdentifiersExported,false);assert.equal(trace.starts,n.requestCount);assert.equal(trace.requestCount,n.requestCount);
assert(Number.isSafeInteger(trace.terminalCount)&&trace.terminalCount>=0&&trace.terminalCount<=trace.requestCount);assert(Number.isSafeInteger(trace.finalReaderBytes)&&trace.finalReaderBytes>=0&&trace.finalReaderBytes<=assessment.actualBodyBytes);
const fileBytes=step('TR01 finite scope result').fileBytes;assert.equal(fileBytes,4607107537);assert(assessment.postCloseTrafficEnvelope>0&&assessment.postCloseTrafficEnvelope<fileBytes);
assert.deepEqual(assessSafeNetwork(step('failure live safe evidence').network),assessment);
const closed=step('normal Back and retirement');assert(closed.closed&&closed.retired&&!closed.q0&&!closed.q1);
for(const [name,flags] of [
 ['owned source-worker observer cleanup',['disposed','ownedWorkerDetached','ownedForwardRemoved','privateCorrelationCleared']],
 ['owned RVFC/timer cleanup',['disposed','frameCallbackRemoved','timerRemoved','traceSinkRemoved','privateTraceKeysCleared']],
 ['owned target/proof restoration',['targetRemoved','proofRestored','folderSame','querySame']]
])for(const flag of flags)assert.equal(step(name)[flag],true,name+':'+flag);
for(const flag of ['cleanupComplete','ownedMcpClosed','ownedNativeSessionDetached','ownedNativeCdpDisconnected','ownedForwardRemoved'])assert.equal(r[flag],true,flag);
const privatePath=path.resolve(dir,'../v2-state-recovery-backup/rc32-q0-large-target-private-with-path.json'),privateBytes=fs.readFileSync(privatePath);
assert.equal(sha(privateBytes),'bf581cbca8faa86c522f40ba720c543cbb7a0d8b370905c168788977a727ed88');
const p=JSON.parse(privateBytes),secretValues=[...Object.values(p.account),...['id','name','headRevisionId','sha256Checksum','md5Checksum'].map(k=>p.target[k]),...(p.target.parents||[])].filter(x=>typeof x==='string'&&x.length>=8);
assert(!secretValues.some(x=>raw.includes(Buffer.from(x))),'protected input leaked into safe receipt');
const out={schema:'drive-original-q0-offline-root-qualification-v1',recordedAt:new Date().toISOString(),receipt,receiptSha256:expected,runtimeCompleted:false,runtimeFailure:r.failure,sourceCommit:binding.sourceCommit,version:binding.version,producerFiles:binding.files,assessmentSourceSha256:sha(fs.readFileSync(path.join(dir,'worker-network.cjs'))),qualificationSourceSha256:sha(fs.readFileSync(__filename)),standard:'https://fetch.spec.whatwg.org/#http-responses',correctedReason:'successful exact revision CORS preflight200 with zero body/wire/terminal total; all fences individually retained',assessment,fileBytes,firstFrame:frame.firstFrame,progressFrame:frame.progressFrame,metadataBeforeAfterQualified:true,sameSourceWorker:true,sourceCachePinsMatched:true,swRequestAgreement:true,normalCloseRetirement:true,cleanupComplete:true,protectedInputLeaks:0,TR01FiniteScopePassed:true,TR02:'NOT_TESTED',exactBodyAtFrame:'UNKNOWN',additionalProviderRequests:0,wholeGoalPassed:false};
const result='actual-android-q0-byte-attempt3-root-qualification-safe.json';fs.writeFileSync(path.join(dir,result),JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({result,sha256:sha(fs.readFileSync(path.join(dir,result))),TR01FiniteScopePassed:true,additionalProviderRequests:0}));
