'use strict';
// Import and --plan are local-only. --execute is the sole actual entry point.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const DIR=__dirname,ROOT=path.resolve(DIR,'../..'),PIN='5174485b3c17d047259701bbdd889f9b0740f555';
const PRIVATE=path.join(ROOT,'qa/v2-state-recovery-backup/q3-target-cua1-1-private.json'),PRIVATE_SHA='2604a0f5da6e1d380046b5c3dcc558e372e7e358104d3b5b63d2255c2f663167';
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),code=e=>/^(?:[A-Z][A-Z0-9_]{0,99})$/.test(e?.message||'')?e.message:'TAIL_OPERATION_FAILED';
const REFERENCES={'tail-timing.cjs':'6e2754b8bcfd885f6de25667f19bbc19745622431642eb5737a51c394e90d340','timing-fixture.mjs':'6d507dafa0bc964126a49e54a1f85c43c532a471d0ed819873ad83805cf8471c'};
const ANCHORS=[
 ['metrics={decoded:0','metrics={phaseTimes:{readMs:0,decodeCopyMs:0,frameEncodeCallMs:0,flushMs:0,muxMs:0,ackMs:0,encodeOutputMs:0,encodeOutputs:0},decoded:0'],
 ['let m,decoder=0','let qaEncodeStart=0;let m,decoder=0'],
 ['output(chunk,metadata){','output(chunk,metadata){metrics.phaseTimes.encodeOutputMs+=performance.now()-qaEncodeStart;metrics.phaseTimes.encodeOutputs++;'],
 ['const p=input.packets[i],bytes=await rpc.exact(p.start,p.size);rpc.check();inspectQ3Packet(bytes,p.key);','const p=input.packets[i];let qaT=performance.now();const bytes=await rpc.exact(p.start,p.size);metrics.phaseTimes.readMs+=performance.now()-qaT;qaT=performance.now();rpc.check();inspectQ3Packet(bytes,p.key);'],
 ["demand(m._q3_packet_drained(decoder)===1,'DECODE_BUFFER_UNQUALIFIED');","demand(m._q3_packet_drained(decoder)===1,'DECODE_BUFFER_UNQUALIFIED');metrics.phaseTimes.decodeCopyMs+=performance.now()-qaT;qaT=performance.now();"],
 ['try{encoder.encode(frame,','qaEncodeStart=performance.now();try{encoder.encode(frame,'],
 ['await cancellable(encoder.flush(),signal);','metrics.phaseTimes.frameEncodeCallMs+=performance.now()-qaT;qaT=performance.now();await cancellable(encoder.flush(),signal);metrics.phaseTimes.flushMs+=performance.now()-qaT;'],
 ['await video.add(encoded.packet,first?{decoderConfig:finalConfig}:undefined);','qaT=performance.now();await video.add(encoded.packet,first?{decoderConfig:finalConfig}:undefined);metrics.phaseTimes.muxMs+=performance.now()-qaT;'],
 ['await cancellable(Promise.resolve(onChunk({generation,bytes,position:offset+p,batchSize:data.length,batchEnd:p+bytes.length===data.length})),signal);','const qaAckT=performance.now();await cancellable(Promise.resolve(onChunk({generation,bytes,position:offset+p,batchSize:data.length,batchEnd:p+bytes.length===data.length})),signal);metrics.phaseTimes.ackMs+=performance.now()-qaAckT;']
];
function replaceOnce(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('TAIL_UNIQUE_ANCHOR');return text.replace(anchor,replacement);}
function instrumentPipeline(original){
 let text=original;for(const [a,b]of ANCHORS)text=replaceOnce(text,a,b);
 const emit=phase=>`globalThis.__q3TailPhase?.('${phase}',metrics);`;
 for(const [a,b]of [['let qaT=performance.now();const bytes=',`let qaT=performance.now();${emit('read')}const bytes=`],['qaT=performance.now();rpc.check();inspectQ3Packet',`qaT=performance.now();${emit('decode-copy')}rpc.check();inspectQ3Packet`],['qaEncodeStart=performance.now();try{encoder.encode',`${emit('frame-encode-call')}qaEncodeStart=performance.now();try{encoder.encode`],['qaT=performance.now();await cancellable(encoder.flush()',`qaT=performance.now();${emit('flush')}await cancellable(encoder.flush()`],['qaT=performance.now();await video.add',`qaT=performance.now();${emit('mux')}await video.add`],['const qaAckT=performance.now();await cancellable',`const qaAckT=performance.now();${emit('ack')}await cancellable`],['metrics.decoded++;',`metrics.decoded++;${emit('frame-complete')}`]])text=replaceOnce(text,a,b);
 return absoluteImports(text);
}
function absoluteImports(text){return text.replace(/(['"])\.\/([a-z0-9.-]+)\1/g,(_,q,name)=>`${q}${ORIGIN}/media/${name}${q}`);}
function instrumentWorker(original){
 let text=replaceOnce(original,"from './video-q3-pipeline.mjs'","from '__Q3_PIPELINE_BLOB__'");
 text=replaceOnce(text,'let controller, generation, started = false, nextId = 0;',`let qaPort=null;globalThis.__q3TailPhase=(phase,metrics)=>qaPort?.postMessage({phase,decoded:metrics.decoded,encoded:metrics.encoded,phaseTimes:{...metrics.phaseTimes}});self.addEventListener('message',e=>{if(e.data?.kind==='q3-owned-timing-port'){if(!qaPort)qaPort=e.ports[0];e.stopImmediatePropagation();}});let controller, generation, started = false, nextId = 0;`);
 return absoluteImports(text);
}
function names(label){if(!/^[a-z0-9][a-z0-9-]{0,59}$/.test(label||''))throw Error('NEW_SAFE_LABEL_REQUIRED');return{report:`actual-android-q3-tail-${label}-safe.json`,receipt:`actual-android-q3-tail-receipt-${label}-safe.json`,failure:`actual-android-q3-tail-failure-${label}-safe.json`};}
function prepare(label){
 const output=names(label);for(const n of Object.values(output))if(fs.existsSync(path.join(DIR,n)))throw Error('RESULT_ALREADY_EXISTS');
 const binding=JSON.parse(fs.readFileSync(path.join(DIR,'binding-observer.json'))),manifest=JSON.parse(fs.readFileSync(path.join(DIR,'observer-manifest.json')));
 if(binding.sourceCommit!==PIN||binding.version!=='1.22.0-rc.33'||binding.fixture.sha256!=='cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a'||binding.fixture.bytes!==18075476)throw Error('TAIL_BINDING');
 for(const n of ['binding-observer.json','android-common33.cjs','source-proof.expression.js'])if(sha(fs.readFileSync(path.join(DIR,n)))!==manifest.files.find(r=>r.file===n)?.sha256)throw Error('TAIL_EXISTING_PIN');
 for(const[n,h]of Object.entries(REFERENCES))if(sha(fs.readFileSync(path.join(ROOT,'qa/q3-full-output-quality',n)))!==h)throw Error('TAIL_REFERENCE_DRIFT');
 const modules={},assets=[];for(const n of ['media/video-q3-pipeline.mjs','media/video-q3-worker.mjs','media/general-owner.mjs','media/drive-source.mjs','media/general-source.mjs','media/video-q3-input.mjs','media/mediabunny-q1.mjs','media/video-q3-codec.mjs','media/video-q3-codec.wasm']){
  const bytes=cp.execFileSync('git',['show',`${PIN}:${n}`],{cwd:ROOT,maxBuffer:16777216});const row=binding.cache.find(r=>r.file===n);if(!row||sha(bytes)!==row.sha256)throw Error('TAIL_GIT_BYTES');assets.push({file:n,sha256:sha(bytes),bytes:bytes.length});if(n.endsWith('pipeline.mjs'))modules.pipeline=instrumentPipeline(bytes.toString('utf8'));if(n.endsWith('worker.mjs'))modules.worker=instrumentWorker(bytes.toString('utf8'));
 }
 const helper=fs.readFileSync(path.join(DIR,'android-q3-tail-timing.function.js'),'utf8').trim();
 return{output,binding,assets,modules,helper,helperSha256:sha(fs.readFileSync(path.join(DIR,'android-q3-tail-timing.function.js'))),pipelineSha256:sha(modules.pipeline),workerTemplateSha256:sha(modules.worker),proof:fs.readFileSync(path.join(DIR,'source-proof.expression.js'),'utf8').trim()};
}
function plan(label){const p=prepare(label);return{prepared:true,actualOperationPerformed:false,output:p.output,actionMs:100000,cleanupMs:30000,targetTime:170,sourceEnd:180,frames:300,preference:'prefer-software',sourceScope:'Direct read-only Drive GET alt=media through existing driveFetch plus exact openDriveQ1Source pre/post metadata; SW media authorization/MSE/native playback/normal flow excluded',instrumentedPipelineSha256:p.pipelineSha256,workerTemplateSha256:p.workerTemplateSha256,helperSha256:p.helperSha256,instrumentAnchors:ANCHORS.length,phaseProgressChannel:'Owned dedicated MessagePort; scalar phase counters only; product Worker RPC unchanged',runCommand:`node qa/q3-actual-preparation/android-q3-tail-timing.cjs --execute ${label}`,preflightCommand:`node qa/q3-actual-preparation/android-q3-tail-timing.cjs --preflight ${label}`,preflightScope:'Exact940B directRange/full metadata/controller/runtime/account admission; zero native Workers/Blobs/ports/codec processing',limitations:['Not original MEDIA06 cause or realtime/native playback proof','No preference comparison or product preference change','Direct CORS-hidden Range headers fail closed; never synthesize headers']};}
function write(name,r){if(!/^actual-android-q3-tail-(?:receipt|failure)-[a-z0-9-]+-safe\.json$/.test(name)||r?.schema!=='drive-original.android-q3-tail-timing/1'||r.rawIdentifiersExported!==false)throw Error('TAIL_SAFE_RECEIPT');const bytes=JSON.stringify(r,null,2)+'\n';if(Buffer.byteLength(bytes)>2097152)throw Error('TAIL_RECEIPT_BOUND');fs.writeFileSync(path.join(DIR,name),bytes,{flag:'wx'});return{saved:true,bytes:Buffer.byteLength(bytes),complete:r.complete===true};}
async function run(c,p,deps={}){
 const now=deps.now||Date.now,started=deps.startedAt??now(),actionEnd=started+100000,cleanupEnd=actionEnd+30000;let cleaning=false,owned=false,success=false,failure=null,observation=null,preserved=false;
 const progress=deps.progress||((r)=>console.log(JSON.stringify(r))),mark=(stage,data={})=>{c.step(stage,data);progress({stage,elapsedMs:now()-started,...data});};
 const evaluate=async fn=>{const left=(cleaning?cleanupEnd:actionEnd)-now();if(left<=0)throw Error('TAIL_TOTAL_BOUND');let timer;return Promise.race([c.evaluateNative(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TAIL_COMMAND_BOUND')),Math.min(15000,left));})]).finally(()=>clearTimeout(timer));};
 const preflightOnly=deps.preflightOnly===true;
 const record=()=>({schema:'drive-original.android-q3-tail-timing/1',complete:success,preflightOnly,sourceCommit:PIN,version:p.binding.version,rawIdentifiersExported:false,observerOnly:true,sourceScope:'DIRECT_DRIVE_READONLY_DIAGNOSTIC',excluded:['SW media authorization','MSE','native playback','normal product flow','full180s quality/performance'],preference:'prefer-software',observation,actorFailure:failure,helperSha256:p.helperSha256,pipelineSha256:p.pipelineSha256,workerTemplateSha256:p.workerTemplateSha256,assets:p.assets,performanceAcceptance:'NOT_QUALIFIED',media06Cause:'UNKNOWN'});
 try{
  if(c.report.model!=='SM-X800'||c.report.android!=='16')throw Error('TAIL_EXACT_DEVICE');
  if(now()>=actionEnd)throw Error('TAIL_TOTAL_BOUND');await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  const admission=await evaluate(`()=>({identity:location.origin===${JSON.stringify(ORIGIN)}&&APP_VERSION==='1.22.0-rc.33',idle:el.playerSheet.hidden&&state.selected===null&&!q0Playback&&!q1Playback&&!q3Choice&&q1RetirementResult?.settled===true,account:!!state.accountId&&!!state.authAccountKey&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken(),writerIdle:state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null&&!state.loadingFiles,visible:document.visibilityState==='visible',absent:!window.__q3TailOwned33&&!window.__q3TailTarget33&&!window.__q3TailTiming33&&!window.__resumeSwProof&&!window.__q3ActorOwned33&&!window.__q3ActualTarget33})`);
  mark('tail-idle-admission',admission);if(!Object.values(admission).every(v=>v===true))throw Error('TAIL_IDLE_ADMISSION');
  owned=true;await evaluate(`()=>{window.__q3TailOwned33={refs:{},cleaning:false};return{owned:true};}`);
  const privateBytes=(deps.readPrivate||(()=>fs.readFileSync(PRIVATE)))();if(sha(privateBytes)!==PRIVATE_SHA)throw Error('TAIL_PRIVATE_TARGET_DRIFT');const holder=JSON.parse(privateBytes.toString('utf8'));
  await evaluate(`()=>{window.__q3TailTarget33=${JSON.stringify(holder)};window.__q3TailOwned33.refs.__q3TailTarget33=window.__q3TailTarget33;return{installed:true};}`);
  mark('tail-sourceproof',await evaluate(`async()=>{const o=window.__q3TailOwned33;try{const r=await(${p.proof});o.refs.__resumeSwProof=window.__resumeSwProof;return{installed:r.sourceProofInstalled===true};}finally{if(window.__resumeSwProof)o.refs.__resumeSwProof=window.__resumeSwProof;}}`));
  mark('tail-helper-admission',await evaluate(`()=>{const o=window.__q3TailOwned33;try{return(${p.helper})(${JSON.stringify({binding:p.binding,modules:p.modules,pipelineSha256:p.pipelineSha256,workerTemplateSha256:p.workerTemplateSha256,remainingMs:Math.max(1,actionEnd-now())})});}finally{if(window.__q3TailTiming33)o.refs.__q3TailTiming33=window.__q3TailTiming33;}}`));
  mark('tail-start',await evaluate(`()=>window.__q3TailTiming33.start({preflightOnly:${preflightOnly}})`));
  let last=now();while(now()<actionEnd){observation=await evaluate('()=>window.__q3TailTiming33.read()');if(observation.done){success=observation.qualified===true;failure=observation.failure||(!success?'TAIL_RESULT_INCOMPLETE':null);break;}if(now()-last>=5000){mark('tail-progress',{phase:observation.latestPhase?.phase??null,decoded:observation.latestPhase?.decoded??null,encoded:observation.latestPhase?.encoded??null,phaseTimes:observation.latestPhase?.phaseTimes??null,sourceReads:observation.sourceCounts?.readsCompleted??null});last=now();}await c.wait(200);}
  if(!success)throw Error(failure||'TAIL_ACTION_BOUND');
  mark('tail-receipt',(deps.write||write)(p.output.receipt,record()));
 }catch(e){failure=code(e);success=false;mark('tail-failure',{failure});}
 finally{
  cleaning=true;
  if(owned){try{observation=await evaluate('()=>window.__q3TailOwned33?.refs.__q3TailTiming33?.read()||null');if(!success){mark('tail-failure-before-stop',(deps.write||write)(p.output.failure,record()));preserved=true;}}catch{failure||='TAIL_FAILURE_EXPORT_UNCONFIRMED';}
   let stopped=null;try{stopped=await evaluate('()=>window.__q3TailOwned33?.refs.__q3TailTiming33?.stop()||({settled:true,absent:true})');mark('tail-owned-cleanup',stopped);}catch{failure||='TAIL_CLEANUP_UNCONFIRMED';}
   try{const cleared=await evaluate(`()=>{const o=window.__q3TailOwned33;if(!o)return{cleared:false};let intact=true;for(const[k,r]of Object.entries(o.refs)){if(window[k]===r)delete window[k];else if(window[k]!==undefined)intact=false;}delete window.__q3TailOwned33;return{cleared:intact&&!window.__q3TailOwned33&&!window.__q3TailTarget33&&!window.__q3TailTiming33};}`);mark('tail-owned-globals',cleared);if(!cleared.cleared||!stopped?.settled)success=false;}catch{success=false;failure||='TAIL_GLOBALS_UNCONFIRMED';}
  }
  c.report.tailDiagnosticComplete=success;c.report.tailFailurePreserved=preserved;c.report.tailSourceScope='DIRECT_DRIVE_READONLY_DIAGNOSTIC';c.report.media06Cause='UNKNOWN';
 }
 if(!success)throw Error(failure||'TAIL_INCOMPLETE');
}
async function execute(label,preflightOnly=false){const startedAt=Date.now(),p=prepare(label),log=console.log;console.log=v=>{let r;try{r=JSON.parse(v);}catch{log(v);return;}if(r.schema==='drive-original.actual-android-acceptance/1')log(JSON.stringify({stage:'tail-transport-finished',completed:r.completed===true,tailDiagnosticComplete:r.tailDiagnosticComplete===true,failure:r.failure||null,ownedForwardRemoved:r.ownedForwardRemoved===true}));else log(v);};try{return await require('./android-common33.cjs')(__filename,p.output.report,c=>run(c,p,{startedAt,preflightOnly}));}finally{console.log=log;}}
if(require.main===module){const a=process.argv.slice(2);if(a.length!==2||!['--plan','--execute','--preflight'].includes(a[0])){console.error('TAIL_EXPLICIT_CLI');process.exitCode=1;}else if(a[0]==='--plan'){try{console.log(JSON.stringify(plan(a[1])));}catch(e){console.error(code(e));process.exitCode=1;}}else execute(a[1],a[0]==='--preflight').catch(e=>{console.error(code(e));process.exitCode=1;});}
module.exports={ANCHORS,replaceOnce,instrumentPipeline,instrumentWorker,absoluteImports,names,prepare,plan,write,run};
