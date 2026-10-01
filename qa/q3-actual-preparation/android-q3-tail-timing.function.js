(function installQ3TailTiming33(payload) {
 'use strict';
 const owned=window.__q3TailOwned33;let holder=window.__q3TailTarget33;
 if(!owned||owned.cleaning||window.__q3TailTiming33||!holder||holder!==owned.refs.__q3TailTarget33)throw Error('TAIL_HELPER_OWNER');
 let target=holder.metadata||holder.target||holder.file||holder;
 let admitted={accountId:state.accountId,authAccountKey:state.authAccountKey,authGeneration:state.authGeneration,driveSessionGeneration:state.driveSessionGeneration,mediaSession:state.mediaSession,playbackSession:state.playbackSession,sourceGeneration:mediaSourceGeneration,tokenRevision:state.tokenRevision};
 let controller=navigator.serviceWorker.controller,proof=window.__resumeSwProof;
 if(holder.account&&(holder.account.accountId!==admitted.accountId||holder.account.authAccountKey!==admitted.authAccountKey))throw Error('TAIL_PRIVATE_ACCOUNT');
 const started=performance.now(),abort=new AbortController(),urls=[],ports=[];
 let disposed=false,startedRun=false,done=false,job=null,source=null,worker=null,terminal=null,failure=null,stopPromise=null,cleanup=null,workerStartedAt=null,workerElapsedMs=null,workPromise=null,preflightOnly=false;
 let latestPhase=null,phaseMessages=0,outputBytes=0,outputChunks=0,windowSummary=null,windowCount=0,before=null,after=null,baseline=null,sourceCleanup=null,blobHashes=null;
 const sourceIO={metadataGets:0,metadataGetMs:0,metadataBodyMs:0,rangeGets:0,rangeGetMs:0,rangeRequestedBytes:0,rangeStatus206:0,rangeHeadersExact:0},samples=[];
 const times=['readMs','decodeCopyMs','frameEncodeCallMs','flushMs','muxMs','ackMs','encodeOutputMs','encodeOutputs'];
 const finite=v=>Number.isFinite(v)&&v>=0?v:null,nums=(obj,keys)=>Object.fromEntries(keys.map(k=>[k,finite(obj?.[k])]));
 const safeFailure=e=>/^(?:Q3|Q1_SOURCE|GENERAL|WORKER|TAIL)_[A-Z0-9_]{1,80}$/.test(e?.message||'')?e.message:'TAIL_DIAGNOSTIC_FAILED';
 function same(){const p=proof?.get();return !disposed&&!abort.signal.aborted&&window.__q3TailOwned33===owned&&window.__q3TailTarget33===holder&&window.__resumeSwProof===proof&&p?.controller===controller&&navigator.serviceWorker.controller===controller&&controller?.state==='activated'&&APP_VERSION===payload.binding.version&&p?.sourceCommit===payload.binding.sourceCommit&&Object.keys(payload.binding.sourceSHA256).every(k=>p.sourceSHA256?.[k]===payload.binding.sourceSHA256[k])&&state.accountId===admitted.accountId&&state.authAccountKey===admitted.authAccountKey&&state.authGeneration===admitted.authGeneration&&state.driveSessionGeneration===admitted.driveSessionGeneration&&state.mediaSession===admitted.mediaSession&&state.playbackSession===admitted.playbackSession&&mediaSourceGeneration===admitted.sourceGeneration&&state.tokenRevision===admitted.tokenRevision&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&document.visibilityState==='visible'&&state.selected===null&&el.playerSheet.hidden&&!q0Playback&&!q1Playback&&!q3Choice&&q1RetirementResult?.settled===true&&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null;}
 function check(){if(!same())throw Error('TAIL_IDLE_FENCE');}
 const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
 const requestOptions=signal=>({method:'GET',signal,redirect:'error',credentials:'omit',driveNoRetry:true,driveMaxRateAttempts:1,headers:target.resourceKey?{'X-Goog-Drive-Resource-Keys':`${target.id}/${target.resourceKey}`}:{}});
 async function fetchRead(url,signal,range){
  check();const options=requestOptions(signal);if(range)options.headers.Range=range;
  const t=performance.now();if(range)sourceIO.rangeGets++;else sourceIO.metadataGets++;
  try{const r=await driveFetch(url,options,true,0,admitted.authGeneration,admitted.driveSessionGeneration);check();return r;}
  finally{sourceIO[range?'rangeGetMs':'metadataGetMs']+=performance.now()-t;}
 }
 function admitMetadata(f){
  const stable=['id','name','size','mimeType','modifiedTime','version','headRevisionId','sha256Checksum','md5Checksum'];
  const known=stable.every(k=>target[k]==null||String(f[k])===String(target[k]));
  const parents=Array.isArray(f.parents)&&Array.isArray(target.parents)&&JSON.stringify([...f.parents].sort())===JSON.stringify([...target.parents].sort());
  const full=known&&parents&&f.id===target.id&&f.size==='18075476'&&f.mimeType==='video/mp4'&&f.trashed===false&&f.capabilities?.canDownload===true&&typeof f.headRevisionId==='string'&&/^[A-Za-z0-9_-]+$/.test(f.headRevisionId)&&typeof f.version==='string'&&/^\d+$/.test(f.version)&&f.sha256Checksum===payload.binding.fixture.sha256;
  const revisionSame=!baseline||stable.every(k=>f[k]===baseline[k])&&JSON.stringify([...f.parents].sort())===JSON.stringify([...baseline.parents].sort());
  if(!full||!revisionSame)throw Error('TAIL_METADATA_DRIFT');
  baseline||=f;return{status:200,exactTarget:true,fullRevisionChecksumSame:true,accountSourceGenerationSame:true,notTrashed:true,canDownload:true};
 }
 async function metadata(signal=abort.signal){
  const fields='id,name,size,mimeType,modifiedTime,parents,version,headRevisionId,md5Checksum,sha256Checksum,trashed,capabilities(canDownload)';
  const r=await fetchRead(`${DRIVE_API}/files/${encodeURIComponent(target.id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`,signal);
  if(r.status!==200)throw Error('TAIL_METADATA_HTTP');
  const t=performance.now(),reader=r.body?.getReader();if(!reader)throw Error('TAIL_METADATA_BODY');let total=0,chunks=[];
  try{for(;;){const part=await reader.read();check();if(part.done)break;total+=part.value.byteLength;if(total>65536){await reader.cancel();throw Error('TAIL_METADATA_BODY_BOUND');}chunks.push(part.value);}}
  finally{reader.releaseLock();sourceIO.metadataBodyMs+=performance.now()-t;}
  const bytes=new Uint8Array(total);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.byteLength;}chunks=[];const f=JSON.parse(new TextDecoder().decode(bytes));check();admitMetadata(f);return f;
 }
 async function range({start,end,range,signal}){
  if(range!==`bytes=${start}-${end}`||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=18075476||end-start+1>1048576)throw Error('TAIL_RANGE_BOUND');
  sourceIO.rangeRequestedBytes+=end-start+1;
  const r=await fetchRead(`${DRIVE_API}/files/${encodeURIComponent(target.id)}?alt=media&supportsAllDrives=true`,signal,range);
  if(r.status===206)sourceIO.rangeStatus206++;
  if(r.status!==206||r.headers.get('Content-Range')!==`bytes ${start}-${end}/18075476`||r.headers.get('Content-Length')!==String(end-start+1)||r.headers.get('Content-Encoding')){await r.body?.cancel();throw Error('TAIL_DIRECT_RANGE_HEADERS_UNAVAILABLE');}
  sourceIO.rangeHeadersExact++;return r;
 }
 function phase(data){
  if(disposed)return;if(!same()){failure||='TAIL_IDLE_FENCE';void stop();return;}
  if(!['read','decode-copy','frame-encode-call','flush','mux','ack','frame-complete'].includes(data?.phase)||!Number.isSafeInteger(data.decoded)||data.decoded<0||data.decoded>300||!Number.isSafeInteger(data.encoded)||data.encoded<0||data.encoded>300||times.some(k=>finite(data.phaseTimes?.[k])===null)){failure||='TAIL_PHASE_SHAPE';void stop();return;}
  phaseMessages++;latestPhase={phase:data.phase,decoded:data.decoded,encoded:data.encoded,phaseTimes:nums(data.phaseTimes,times),elapsedMs:performance.now()-started};
  if(data.phase==='frame-complete'&&(data.decoded%5===0||data.decoded===300)){samples.push(latestPhase);if(samples.length>64)samples.shift();}
 }
 function sanitiseTerminal(t){const r=t?.result,m=r?.metrics;return{error:t?.error?safeFailure(t.error):null,generation:r?.generation??null,targetTime:finite(r?.targetTime),duration:finite(r?.duration),sourceCodec:r?.sourceCodec==='mp4v.20.1'?r.sourceCodec:null,statusQ3:r?.status?.level==='Q3',metrics:m?{...nums(m,['decoded','encoded','peakHeapBytes','peakEncoderQueue','peakMuxBytes','peakMuxSamples','outputBytes','peakPendingAcks']),closed:m.closed===true,phaseTimes:nums(m.phaseTimes,times)}:null,preference:r?.capability?.outputConfig?.hardwareAcceleration==='prefer-software'?'prefer-software':null,reads:nums(r?.reads,['requests','bytes','logicalReads','cacheHits','peakCache','inFlight','peakInFlight','peakQueued','discoveryBytes','discoveryRequests']),worker:nums(t?.metrics,['reads','bytes','activeReads','chunks','acks','pendingChunks','pendingWindows','invalidMessages']),workerTerminated:t?.metrics?.terminated===true,sourceSettled:r?.cleanup?.settled===true,transportSettled:t?.transportCleanup?.settled===true};}
 const timer=setTimeout(()=>{failure||='TAIL_ACTION_BOUND';void stop();},Math.min(100000,Math.max(1,payload.remainingMs)));
 async function work(){
  try{
   check();const {openDriveQ1Source}=await import('/media/drive-source.mjs');check();
   source=await openDriveQ1Source({fileId:target.id,accountKey:admitted.authAccountKey,accountGeneration:admitted.driveSessionGeneration,isCurrent:same,signal:abort.signal,requestTimeoutMs:10000,readMetadata:({signal})=>metadata(signal),readRange:range});
   check();before=admitMetadata(baseline);
   // Preflight-only mode returns before any Blob, MessagePort or native Worker is created.
   await source.read({start:0,end:939});check();
   if(preflightOnly){after=admitMetadata(await metadata());return;}
   if(await hash(payload.modules.pipeline)!==payload.pipelineSha256||await hash(payload.modules.worker)!==payload.workerTemplateSha256)throw Error('TAIL_INSTRUMENT_HASH');
   const pipelineUrl=URL.createObjectURL(new Blob([payload.modules.pipeline],{type:'text/javascript'}));urls.push(pipelineUrl);
   if(payload.modules.worker.split('__Q3_PIPELINE_BLOB__').length!==2)throw Error('TAIL_WORKER_BLOB_ANCHOR');
   const workerText=payload.modules.worker.replace('__Q3_PIPELINE_BLOB__',pipelineUrl),workerUrl=URL.createObjectURL(new Blob([workerText],{type:'text/javascript'}));urls.push(workerUrl);
   blobHashes={pipeline:payload.pipelineSha256,workerTemplate:payload.workerTemplateSha256,workerMaterialised:await hash(workerText)};
   // Import proves module Blob CSP/resolution before native Worker creation. All dependency imports are pinned same-origin URLs.
   await import(pipelineUrl);check();const {startGeneralWorker}=await import('/media/general-owner.mjs');check();
   workerStartedAt=performance.now();
   job=startGeneralWorker({source,generation:1,targetTime:170,isCurrent:same,signal:abort.signal,workerFactory:()=>{
    check();const channel=new MessageChannel();ports.push(channel.port1,channel.port2);channel.port1.onmessage=e=>phase(e.data);channel.port1.start();worker=new Worker(workerUrl,{type:'module'});worker.postMessage({kind:'q3-owned-timing-port'},[channel.port2]);return worker;
   },onWindow:w=>{check();windowCount++;if(windowCount!==1||w.generation!==1||w.videoStartTimestamp!==170||w.sourceEndTimestamp!==180||w.status?.level!=='Q3')throw Error('TAIL_WINDOW');windowSummary={generation:1,videoStartTimestamp:170,sourceEndTimestamp:180,sourcePacketOrigin:w.sourcePacketOrigin,windowOrigin:w.windowOrigin,width:w.videoConfig?.codedWidth,height:w.videoConfig?.codedHeight,codec:w.videoConfig?.codec,statusQ3:true};},onChunk:c=>{check();if(c.position!==outputBytes||!Number.isSafeInteger(outputBytes+c.bytes.byteLength))throw Error('TAIL_NULL_SINK_POSITION');outputBytes+=c.bytes.byteLength;outputChunks++;}});
   const t=await job.done;workerElapsedMs=performance.now()-workerStartedAt;terminal=sanitiseTerminal(t);sourceCleanup=t.cleanup;if(t.error)throw Error(terminal.error||'TAIL_WORKER_FAILED');check();
   after=admitMetadata(await metadata());
  }catch(e){failure||=safeFailure(e);sourceCleanup||=e.cleanup||null;}finally{done=true;}
 }
 function read(){const current=same(),qualified=done&&!failure&&current&&before&&after&&(preflightOnly?sourceIO.rangeGets===1&&sourceIO.rangeHeadersExact===1&&sourceIO.rangeRequestedBytes===940&&worker===null:terminal?.generation===1&&terminal.targetTime===170&&terminal.duration===180&&terminal.sourceCodec==='mp4v.20.1'&&terminal.statusQ3&&terminal.metrics?.decoded===300&&terminal.metrics.encoded===300&&terminal.metrics.closed&&terminal.preference==='prefer-software'&&times.every(k=>finite(terminal.metrics.phaseTimes[k])!==null)&&terminal.transportSettled&&terminal.sourceSettled&&terminal.workerTerminated&&terminal.worker.activeReads===0&&terminal.worker.pendingChunks===0&&terminal.worker.pendingWindows===0&&terminal.worker.invalidMessages===0&&windowCount===1&&windowSummary?.width===640&&windowSummary.height===360&&outputChunks>0&&outputBytes===terminal.metrics.outputBytes);
  return{done,disposed,preflightOnly,qualified:!!qualified,failure,elapsedMs:performance.now()-started,workerElapsedMs:workerElapsedMs??(workerStartedAt===null?null:performance.now()-workerStartedAt),workerStarted:workerStartedAt!==null,sourceScope:'DIRECT_DRIVE_READONLY_DIAGNOSTIC',currentIdleAccountSourceGeneration:current,metadataBefore:before,metadataAfter:after,sourceIO:{...sourceIO},sourceCounts:nums(source?.stats?.(),['readsStarted','readsCompleted','metadataRequests','rangeRequests','receivedBytes','releasedBytes','cacheHits']),latestPhase,phaseMessages,samples,terminal,windowCount,window:windowSummary,nullSink:{outputBytes,outputChunks,retainedCompressedBytes:0},blobHashes,sourceCleanup,rawIdentifiersExported:false,media06Cause:'UNKNOWN',performanceAcceptance:'NOT_QUALIFIED'};
 }
 function start(options={}){if(startedRun||disposed)throw Error('TAIL_START_ONCE');check();preflightOnly=options.preflightOnly===true;startedRun=true;workPromise=work();return{started:true,preflightOnly,targetTime:preflightOnly?null:170,sourceEnd:preflightOnly?null:180,expectedFrames:preflightOnly?0:300,preference:'prefer-software',nullCompressedOutput:true};}
 function stop(){return stopPromise||=(async()=>{disposed=true;owned.cleaning=true;clearTimeout(timer);abort.abort();let transport=null;
  try{if(job)transport=(await job.cancel()).transportCleanup;}catch{failure||='TAIL_CANCEL_UNCONFIRMED';}
  try{if(source)sourceCleanup=await source.abort();}catch{sourceCleanup={settled:false};}
  if(worker&&!job?.metrics?.terminated)try{worker.terminate();}catch{failure||='TAIL_WORKER_STOP_UNCONFIRMED';}
  let workSettled=!workPromise,t;try{if(workPromise)workSettled=await Promise.race([workPromise.then(()=>true),new Promise(resolve=>{t=setTimeout(()=>resolve(false),5000);})]);}finally{clearTimeout(t);}
  for(const port of ports){port.onmessage=null;port.close();}ports.length=0;for(const url of urls)URL.revokeObjectURL(url);urls.length=0;
  cleanup={settled:workSettled&&(!source||sourceCleanup?.settled===true)&&(!job||transport?.settled===true)&&(!worker||job?.metrics?.terminated===true),workSettled,sourceSettled:source?sourceCleanup?.settled===true:sourceCleanup?.settled!==false,workerTerminated:!worker||job?.metrics?.terminated===true,portsClosed:ports.length===0,blobsRevoked:urls.length===0,timerCleared:true,privateClosureCleared:true};
  target=null;baseline=null;holder=null;admitted=null;proof=null;controller=null;source=null;job=null;worker=null;return cleanup;
 })();}
 window.__q3TailTiming33=Object.freeze({read,start,stop});return{installed:true,sourceScope:'DIRECT_DRIVE_READONLY_DIAGNOSTIC',preference:'prefer-software',phaseSampleLimit:64,sourceReadOnly:true};
})
