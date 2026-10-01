'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict'),path=require('path');
const base=__dirname,hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fn=fs.readFileSync(path.join(base,'runner.function.js'),'utf8');
const binding=JSON.parse(fs.readFileSync(path.resolve(base,'../rc28-corpus-content-continuity/binding.json'))),create=vm.runInNewContext('('+fn+')',{Date,setTimeout,clearTimeout,JSON,Error,Number,Boolean,Set,Object,Array});
function fixture(mode='success'){
 let time=0,next=0,completed=0,cleared=0,change=false;const timers=new Map(),calls=[],handles=new Set(),controller={state:'activated'};
 const proof={get:()=>({...binding,controller:change?{state:'activated'}:controller})};
 const context=JSON.stringify({accountKey:'SECRET_ACCOUNT',generation:1,rootId:'SECRET_ROOT',priorityFileId:'SECRET_FILE'});
 const factory=(ctx,p,prior,options)=>{
   assert.equal(ctx,context);assert.equal(p,proof);if(prior!==null)assert(handles.has(prior));calls.push({prior,options});let cancelled=false;
   const h={};handles.add(h);
   if(mode==='throw')throw Error('SECRET_FACTORY_ERROR');
   return {cancel:()=>{cancelled=true;},continuity:()=>mode==='missing'?null:h,poll:()=>{
     if(mode==='pending'&&!cancelled)return {done:false,summary:null};
     const bad=mode==='failure',filebad=mode==='file-failure',missing=mode==='missing';completed++;
     return {done:true,summary:{complete:!bad&&!cancelled,catalogStable:!bad&&!cancelled,released:true,failure:cancelled?'CANCELLED':bad?'OWNER_CHANGED':null,inventoryRuns:2,inventoryDenominators:[{counts:{videoObjects:2186},name:'SECRET_NAME',token:'SECRET_TOKEN'}],files:[{complete:!filebad,failure:filebad?'ERROR_PAYLOAD':null,kind:'iso-bmff',name:'SECRET_NAME',id:'SECRET_ID'}],coverage:{failed:filebad?1:0,unattempted:completed>=3?0:128,allEligiblePrefixesValidated:completed>=3},privateToken:'SECRET_TOKEN',missing}};
   }};
 };
 factory.clearContinuity=h=>{assert(handles.has(h));handles.delete(h);cleared++;};
 const deps={now:()=>time,schedule:(f,ms)=>{timers.set(++next,{f,at:time+ms});return next;},unschedule:id=>timers.delete(id)};
 const runner=create(factory,context,proof,binding,deps);
 const tick=(ms=100)=>{time+=ms;const ready=[...timers].filter(([,t])=>t.at<=time);for(const[id,t]of ready){timers.delete(id);t.f();}};
 return {runner,calls,tick,timers,change:()=>{change=true;},cleared:()=>cleared};
}
const cases=[];
function check(name,f){f();cases.push({name,passed:true});}
const opts={maxJobs:8,deadlineMs:10000,stopBeforeAt:10000};
check('fresh-representatives-private-carry-video-coverage',()=>{const f=fixture();f.runner.start(opts);f.tick();f.tick();f.tick();const r=f.runner.read();assert.equal(f.calls.length,3);assert.equal(f.calls[0].prior,null);assert.equal(f.calls[0].options.phase,'representatives');assert.equal(f.calls[0].options.maxFiles,36);assert.equal(f.calls[1].options.maxFiles,64);assert.equal(r.burst.eligibleVideoPrefixesComplete,true);assert.equal(r.wholeCorpusComplete,false);assert.equal(r.actualPlaybackCount,0);assert(!JSON.stringify(r).includes('SECRET'));f.runner.cleanup();assert.equal(f.timers.size,0);assert.equal(f.cleared(),3);});
check('explicit-burst-bound-and-successful-continuation',()=>{const f=fixture();f.runner.start({...opts,maxJobs:1});f.tick();assert.equal(f.calls.length,1);f.runner.start({...opts,maxJobs:1});f.tick();assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.phase,'videos');assert(f.calls[1].prior);f.runner.cleanup();});
for(const mode of ['failure','file-failure'])check(mode+'-halts-no-bypass',()=>{const f=fixture(mode);f.runner.start(opts);f.tick();assert.equal(f.calls.length,1);assert.equal(f.runner.read().stopped,'FACTORY_OR_FILE_FAILURE');assert.throws(()=>f.runner.start(opts),/NOT_RESTARTABLE/);f.runner.cleanup();});
check('deadline-cancel-drain-and-no-followup',()=>{const f=fixture('pending');f.runner.start({...opts,stopBeforeAt:150});f.tick(200);const r=f.runner.read();assert.equal(r.stopped,'BURST_DEADLINE');assert.equal(r.active,false);assert.equal(f.calls.length,1);assert.equal(r.jobs[0].summary.failure,'CANCELLED');f.runner.cleanup();assert.equal(f.timers.size,0);});
check('root-pause-cancel-does-not-resume',()=>{const f=fixture('pending');f.runner.start(opts);f.runner.pause();assert.equal(f.runner.read().active,true);f.tick();assert.equal(f.runner.read().active,false);assert.equal(f.runner.read().stopped,'ROOT_PAUSE_CANCEL');assert.throws(()=>f.runner.start(opts));f.runner.cleanup();});
check('cleanup-retains-pending-owner-until-released',()=>{const f=fixture('pending');f.runner.start(opts);f.runner.cleanup();assert.equal(f.runner.read().disposed,false);f.tick();assert.equal(f.runner.read().disposed,true);assert.equal(f.timers.size,0);assert(!JSON.stringify(f.runner.read()).includes('SECRET'));});
check('controller-change-stops-owned-job',()=>{const f=fixture('pending');f.runner.start(opts);f.change();f.tick();assert.equal(f.runner.read().stopped,'SOURCE_OWNER_CHANGED');assert.equal(f.calls.length,1);f.runner.cleanup();});
check('finite-burst-and-dynamic-cutoff-required',()=>{const f=fixture();for(const options of [{...opts,maxJobs:9},{...opts,deadlineMs:4800001},{...opts,stopBeforeAt:0},{...opts,extra:true}])assert.throws(()=>f.runner.start(options),/BURST_OPTIONS/);assert.equal(f.calls.length,0);f.runner.cleanup();});
check('missing-capsule-blocks-followup',()=>{const f=fixture('missing');f.runner.start(opts);f.tick();assert.equal(f.runner.read().stopped,'CONTINUITY_MISSING');assert.equal(f.calls.length,1);f.runner.cleanup();});
check('factory-throw-sanitized-and-stops',()=>{const f=fixture('throw');const r=f.runner.start(opts);assert.equal(r.stopped,'FACTORY_THROW');assert(!JSON.stringify(r).includes('SECRET'));assert.equal(f.calls.length,1);f.runner.cleanup();});
const expression=fs.readFileSync(path.join(base,'runner.expression.js'),'utf8'),provenance=JSON.parse(fs.readFileSync(path.join(base,'provenance.json')));assert.equal(hash(expression),provenance.expressionSHA256);assert.equal(hash(fn),provenance.runnerFunctionSHA256);new vm.Script(expression);
const files=['runner.function.js','runner.expression.js','build.cjs','verify.cjs','README.md','provenance.json'];const fileSHA256=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(path.join(base,p)))]));
fs.writeFileSync(path.join(base,'local-verification.json'),JSON.stringify({schema:'drive-original.rc28-serial-runner-local/1',cases,syntax:true,fileSHA256,actualExecution:false,actualRequests:0,wholeCorpusComplete:false},null,2)+'\n');
fs.writeFileSync(path.join(base,'curated-savepoint.json'),JSON.stringify({schema:'drive-original.rc28-serial-runner-savepoint/1',exactOwnedFiles:[...files,'local-verification.json','curated-savepoint.json'].map(p=>'qa/rc28-corpus-serial-runner/'+p),commitOwner:'root',actualResultsExcluded:true},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,syntax:true,actualRequests:0,expressionSHA256:provenance.expressionSHA256,expressionBytes:provenance.expressionBytes}));
