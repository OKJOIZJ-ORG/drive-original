'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict'),path=require('path');
const base=__dirname,hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fn=fs.readFileSync(path.join(base,'runner.function.js'),'utf8');
const binding=JSON.parse(fs.readFileSync(path.resolve(base,'../rc31-corpus-content-continuity/binding.json'))),create=vm.runInNewContext('('+fn+')',{Date,setTimeout,clearTimeout,JSON,Error,Number,Boolean,Set,Object,Array});
function fixture(mode='success'){
 let time=0,next=0,completed=0,cleared=0,change=false,credentialEpoch=1;const timers=new Map(),calls=[],handles=new Set(),controller={state:'activated'};
 const proof={get:()=>({...binding,controller:change?{state:'activated'}:controller})};
 const context=JSON.stringify({accountKey:'SECRET_ACCOUNT',generation:1,rootId:'SECRET_ROOT',priorityFileId:'SECRET_FILE'});
 const factory=(ctx,p,prior,options)=>{
   assert.equal(ctx,context);assert.equal(p,proof);if(prior!==null)assert(handles.has(prior));const ownerEpoch=credentialEpoch;calls.push({prior,options,ownerEpoch});let cancelled=false;
   const h={};handles.add(h);
   if(mode==='throw')throw Error('SECRET_FACTORY_ERROR');
   return {cancel:()=>{cancelled=true;},continuity:()=>mode==='missing'?null:h,poll:()=>{
     const ownerChanged=ownerEpoch!==credentialEpoch;if(mode==='pending'&&!cancelled&&!ownerChanged)return {done:false,summary:null};
     const bad=mode==='failure',filebad=mode==='file-failure',missing=mode==='missing';completed++;
     return {done:true,summary:{complete:!bad&&!cancelled&&!ownerChanged,catalogStable:!bad&&!cancelled&&!ownerChanged,released:true,failure:ownerChanged?'OWNER_CHANGED':cancelled?'CANCELLED':bad?'OWNER_CHANGED':null,inventoryRuns:2,inventoryDenominators:[{counts:{videoObjects:2186},name:'SECRET_NAME',token:'SECRET_TOKEN'}],files:[{complete:!filebad,failure:filebad?'ERROR_PAYLOAD':null,kind:'iso-bmff',name:'SECRET_NAME',id:'SECRET_ID'}],coverage:{failed:filebad?1:0,unattempted:completed>=3?0:128,allEligiblePrefixesValidated:completed>=3},privateToken:'SECRET_TOKEN',missing}};
   }};
 };
 factory.clearContinuity=h=>{assert(handles.has(h));handles.delete(h);cleared++;};
 const deps={now:()=>time,schedule:(f,ms)=>{timers.set(++next,{f,at:time+ms});return next;},unschedule:id=>timers.delete(id)};
 const runner=create(factory,context,proof,binding,deps);
 const tick=(ms=100)=>{time+=ms;const ready=[...timers].filter(([,t])=>t.at<=time);for(const[id,t]of ready){timers.delete(id);t.f();}};
 return {runner,calls,tick,timers,change:()=>{change=true;},renew:()=>{credentialEpoch++;},cleared:()=>cleared};
}
const cases=[];function check(name,f){f();cases.push({name,passed:true});}
const expression=fs.readFileSync(path.join(base,'runner.expression.js'),'utf8'),provenance=JSON.parse(fs.readFileSync(path.join(base,'provenance.json'))),install=vm.runInNewContext(expression,{Date,setTimeout,clearTimeout,JSON,Error,Number,Boolean,Set,Object,Array});
const opts={maxJobs:1,deadlineMs:10000,stopBeforeAt:10000},context=JSON.stringify({accountKey:'SECRET_ACCOUNT',generation:1,rootId:'SECRET_ROOT',priorityFileId:'SECRET_FILE'});
check('immutable31-embedded-factory-and-legacy-schema-safe-binding',()=>{
 assert.equal(binding.version,'1.22.0-rc.31');assert.equal(binding.sourceCommit,'4a484e6f839d2e6c3eb83503acb08147362cb011');assert.equal(hash(expression),provenance.expressionSHA256);assert.equal(hash(fn),provenance.runnerFunctionSHA256);assert.equal(provenance.factorySHA256,'a16b13a76a74c38fce71c27d2e1666683798f1bc5626a1cc12d4453aab3d5bea');
 const controller={state:'activated'},runner=install(context,{get:()=>({...binding,controller})}),r=runner.read();assert.equal(r.version,binding.version);assert.equal(r.sourceCommit,binding.sourceCommit);assert.equal(r.schema,'drive-original.rc28-serial-corpus-runner/1');assert.equal(r.wholeCorpusComplete,false);assert.equal(r.privateContextExported,false);assert.equal(r.continuityExported,false);assert(!JSON.stringify(r).includes('SECRET'));runner.cleanup();assert.equal(runner.read().disposed,true);
});
check('installer-denies-old-source-proof-hash-controller-and-context-schema',()=>{
 const controller={state:'activated'},prior=JSON.parse(fs.readFileSync(path.resolve(base,'../rc28-corpus-content-continuity/binding.json')));
 for(const pin of [prior,{...binding,sourceCommit:'0'.repeat(40)},{...binding,sourceSHA256:{...binding.sourceSHA256,'sw.js':'0'.repeat(64)}}])assert.throws(()=>install(context,{get:()=>({...pin,controller})}),/RUNNER_PROOF/);
 assert.throws(()=>install(context,{get:()=>({...binding,controller:{state:'redundant'}})}),/RUNNER_PROOF/);
 assert.throws(()=>install(JSON.stringify({...JSON.parse(context),arbitrary:'SECRET_EXTRA'}),{get:()=>({...binding,controller})}),/RUNNER_CONTEXT/);
});
check('successful-idle-burst-renewal-fresh-job-owner-same-private-capsule',()=>{
 const f=fixture();f.runner.start(opts);f.tick();const old=f.calls[0].ownerEpoch;assert.equal(f.runner.read().burst.done,true);assert.equal(f.runner.read().stopped,null);f.renew();f.runner.start({...opts,stopBeforeAt:12000});f.tick();assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.phase,'videos');assert.equal(f.calls[1].options.maxFiles,64);assert.equal(f.calls[1].ownerEpoch,old+1);assert(f.calls[1].prior);assert.equal(f.runner.read().wholeCorpusComplete,false);assert(!JSON.stringify(f.runner.read()).includes('SECRET'));f.runner.cleanup();assert.equal(f.timers.size,0);
});
check('active-credential-change-stops-drains-and-denies-restart',()=>{
 const f=fixture('pending');f.runner.start(opts);f.renew();f.tick();assert.equal(f.runner.read().stopped,'FACTORY_OR_FILE_FAILURE');assert.equal(f.runner.read().jobs[0].summary.failure,'OWNER_CHANGED');assert.equal(f.runner.read().active,false);assert.equal(f.calls.length,1);assert.throws(()=>f.runner.start(opts),/RUNNER_NOT_RESTARTABLE/);f.runner.cleanup();assert.equal(f.runner.read().disposed,true);
});
check('pause-cancel-cleanup-terminal-state-and-no-private-restart',()=>{
 const f=fixture('pending');f.runner.start(opts);f.runner.pause();assert.equal(f.runner.read().active,true);assert.throws(()=>f.runner.start(opts),/RUNNER_NOT_RESTARTABLE/);f.runner.cleanup();assert.equal(f.runner.read().disposed,false);f.tick();assert.equal(f.runner.read().active,false);assert.equal(f.runner.read().disposed,true);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);assert.throws(()=>f.runner.start(opts),/RUNNER_NOT_RESTARTABLE/);assert(!JSON.stringify(f.runner.read()).includes('SECRET'));
});
check('fresh-cutoff-expiry-burst-caps-options-schema-and-deadline-denials',()=>{
 const f=fixture('pending');for(const o of [{...opts,maxJobs:9},{...opts,deadlineMs:4800001},{...opts,stopBeforeAt:0},{...opts,other:true}])assert.throws(()=>f.runner.start(o),/BURST_OPTIONS/);assert.equal(f.calls.length,0);f.runner.start({...opts,stopBeforeAt:150});f.tick(200);assert.equal(f.runner.read().stopped,'BURST_DEADLINE');assert.equal(f.runner.read().active,false);assert.equal(f.calls.length,1);assert.throws(()=>f.runner.start({...opts,stopBeforeAt:20000}),/RUNNER_NOT_RESTARTABLE/);f.runner.cleanup();
});
check('frozen-test-source-and-runtime-equivalence-only-two-source-pins',()=>{
 const oldBase=path.resolve(base,'../rc28-corpus-serial-runner'),record=JSON.parse(fs.readFileSync(path.join(oldBase,'local-verification.json'))),frozen=fs.readFileSync(path.join(oldBase,'runner.function.js'),'utf8');assert.equal(record.cases.length,11);for(const [p,h]of Object.entries(record.fileSHA256))assert.equal(hash(fs.readFileSync(path.join(oldBase,p))),h,p);assert.equal(hash(fs.readFileSync(path.join(base,'inherited-verify.cjs'))),record.fileSHA256['verify.cjs']);const normalize=s=>s.replace(/\r\n?/g,'\n');assert.equal(normalize(fn.replaceAll(binding.version,'1.22.0-rc.28').replaceAll(binding.sourceCommit,'944f00607cf05e586b1c88e2876dd796ce114e82')),normalize(frozen));
});
const files=['runner.function.js','runner.expression.js','build.cjs','verify.cjs','inherited-verify.cjs','README.md','provenance.json'];const fileSHA256=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(path.join(base,p)))]));
const oldRecord=fs.readFileSync(path.resolve(base,'../rc28-corpus-serial-runner/local-verification.json'));
fs.writeFileSync(path.join(base,'local-verification.json'),JSON.stringify({schema:'drive-original.rc31-serial-runner-local/1',cases,syntax:true,fileSHA256,inherited11:{source:'qa/rc28-corpus-serial-runner/local-verification.json',SHA256:hash(oldRecord),historicalPassed:11,executedThisUnit:false,testSourceByteIdentical:true,runnerRawByteIdentical:false,normalizedRuntimeChangesOnlyTwoSourcePins:true},normalRenewalContract:'successful-idle-burst-only-new-factory-job-owner; active-change-cancels-and-terminal-runner-cannot-restart',actualExecution:false,actualRequests:0,wholeCorpusComplete:false},null,2)+'\n');
fs.writeFileSync(path.join(base,'curated-savepoint.json'),JSON.stringify({schema:'drive-original.rc31-serial-runner-savepoint/1',exactOwnedFiles:[...files,'local-verification.json','curated-savepoint.json'].map(p=>'qa/rc31-corpus-serial-runner/'+p),commitOwner:'root',actualResultsExcluded:true,privateDataExcluded:true},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,syntax:true,historical11NotRerun:true,actualRequests:0,expressionSHA256:provenance.expressionSHA256,expressionBytes:provenance.expressionBytes}));
