(function installNativeQ3Timing33(p,ownershipRead) {
 'use strict';
 const owned=window.__q3ActorOwned33;
 if(!owned||owned.cleanupStarted||window.__q3NativeTiming33||typeof ownershipRead!=='function')throw Error('TIMING_ADMISSION');
 const descriptor=Object.getOwnPropertyDescriptor(window,'Worker'),Original=window.Worker,urls=[],ports=[];
 if(typeof Original!=='function'||!descriptor||!descriptor.writable)throw Error('TIMING_WORKER_DESCRIPTOR');
 const started=performance.now(),sourceController=navigator.serviceWorker.controller;
 let wrapped=0,bypassed=0,owner=null,sourceGeneration=null,mediaSession=null,worker=null,pipelineUrl=null,workerUrl=null;
 let restored=false,closing=false,stopped=false,failure=null,latest=null,terminal=null,preStop=null,portMessages=0,setupPromise=null,blobHashes=null;
 const samples=[],fields=['readMs','decodeCopyMs','frameEncodeCallMs','flushMs','muxMs','ackMs','encodeOutputMs','encodeOutputs'],readFields=['requests','bytes','logicalReads','cacheHits','peakCache','inFlight','peakInFlight','peakQueued','discoveryBytes','discoveryRequests'];
 const n=v=>Number.isFinite(v)&&v>=0?v:null,nums=(o,keys)=>Object.fromEntries(keys.map(k=>[k,n(o?.[k])]));
 function baseline(){const o=ownershipRead();return o.sourceSame&&o.accountSame&&o.visible&&navigator.serviceWorker.controller===sourceController;}
 function current(){const o=ownershipRead();return baseline()&&o.mayClose&&(!owner||q1Playback===owner&&mediaSourceGeneration===sourceGeneration&&state.mediaSession===mediaSession&&owner.player?.stats?.()?.generation===1&&!owner.controller?.signal?.aborted);}
 function restore(){if(window.Worker===Wrapper){Object.defineProperty(window,'Worker',descriptor);restored=true;}else if(window.Worker===Original)restored=true;return restored;}
 function phase(data){
  if(stopped)return;if(!closing&&!current()){failure||='TIMING_CURRENT_OWNER';restore();return;}
  if(closing&&!baseline())return;
  if(!['read','decode-copy','frame-encode-call','flush','mux','ack','frame-complete','worker-terminal'].includes(data?.phase)||fields.some(k=>n(data.phaseTimes?.[k])===null)||n(data.decoded)===null||n(data.encoded)===null){failure||='TIMING_PHASE_SHAPE';return;}
  const row={phase:data.phase,decoded:data.decoded,encoded:data.encoded,phaseTimes:nums(data.phaseTimes,fields),reads:nums(data.reads,readFields),readRpcRequests:n(data.readRpcRequests),readRpcMs:n(data.readRpcMs),elapsedMs:performance.now()-started};
  portMessages++;latest=row;samples.push(row);if(samples.length>64)samples.shift();
  if(data.phase==='worker-terminal')terminal={...row,sourceCleanupSettled:data.sourceCleanupSettled===true,pipelineCleanupSettled:data.pipelineCleanupSettled===true,error:/^(?:GENERAL|WORKER|Q1_SOURCE|Q3)_[A-Z0-9_]{1,80}$/.test(data.error||'')?data.error:null};
 }
 function Wrapper(...args){
  if(!new.target)throw TypeError('TIMING_CONSTRUCTOR_REQUIRED');
  const [url,options]=args;
  let exact=false;try{const u=new URL(String(url),location.href);exact=u.origin===location.origin&&u.pathname==='/media/video-q3-worker.mjs'&&!u.search&&!u.hash&&options?.type==='module';}catch{}
  if(!exact){bypassed++;return Reflect.construct(Original,args,new.target===Wrapper?Original:new.target);}
  if(wrapped||!pipelineUrl||!workerUrl||!current()||q1Playback?.kind!=='general')throw Error('TIMING_FACTORY_OWNER');
  owner=q1Playback;sourceGeneration=mediaSourceGeneration;mediaSession=state.mediaSession;
  const channel=new MessageChannel();ports.push(channel.port1,channel.port2);channel.port1.onmessage=e=>phase(e.data);channel.port1.start();
  try{worker=Reflect.construct(Original,[workerUrl,...args.slice(1)],new.target===Wrapper?Original:new.target);wrapped++;worker.postMessage({kind:'q3-owned-timing-port'},[channel.port2]);}
  finally{restore();}return worker;
 }
 Object.setPrototypeOf(Wrapper,Original);Wrapper.prototype=Original.prototype;
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
 async function install(){
  if(setupPromise)throw Error('TIMING_INSTALL_ONCE');
  setupPromise=(async()=>{
   if(!baseline()||state.selected!==null||q1Playback||q0Playback||!el.playerSheet.hidden)throw Error('TIMING_IDLE_INSTALL');
   if(await hash(p.pipeline)!==p.pipelineSha256||await hash(p.workerTemplate)!==p.workerTemplateSha256)throw Error('TIMING_INSTRUMENT_HASH');
   if(stopped||owned.cleanupStarted)throw Error('TIMING_LATE_INSTALL');
   pipelineUrl=URL.createObjectURL(new Blob([p.pipeline],{type:'text/javascript'}));urls.push(pipelineUrl);
   if(p.workerTemplate.split('__Q3_PIPELINE_BLOB__').length!==2)throw Error('TIMING_BLOB_ANCHOR');
   const text=p.workerTemplate.replace('__Q3_PIPELINE_BLOB__',pipelineUrl);workerUrl=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));urls.push(workerUrl);
   blobHashes={pipeline:p.pipelineSha256,workerTemplate:p.workerTemplateSha256,workerMaterialised:await hash(text)};
   if(stopped||owned.cleanupStarted||!baseline()||window.Worker!==Original)throw Error('TIMING_FACTORY_DRIFT');
   Object.defineProperty(window,'Worker',{...descriptor,value:Wrapper});return{installed:true,exactOneShot:true,sameNormalSource:true,preference:'prefer-software',progressThrottleMs:1000,sampleLimit:64};
  })();return setupPromise;
 }
 function read(){const s=owner?.player?.stats?.();return{schema:'drive-original.q3-native-timing-observation/1',elapsedMs:performance.now()-started,wrapped,bypassed,restored,closing,stopped,failure,currentOwner:owner?current():null,baselineSame:baseline(),sourceScope:'NORMAL_PRODUCT_SW_ORIGINAL_SOURCE_AND_MSE_WITH_QA_INSTRUMENTED_Q3_WORKER',routeQ3:s?.status?.level==='Q3',latest,samples,portMessages,terminal,blobHashes,preStop,native:{ready:n(el.videoPlayer.readyState),width:n(el.videoPlayer.videoWidth),height:n(el.videoPlayer.videoHeight),time:n(el.videoPlayer.currentTime),paused:el.videoPlayer.paused===true,lossyLabelVisible:!el.streamModeLabel.hidden&&el.streamModeText.textContent?.trim()==='호환 변환 · 영상 손실 압축'},liveWorker:nums(s?.worker,['reads','bytes','activeReads','chunks','acks','pendingChunks','pendingWindows','invalidMessages']),sourceMetadataRangeTiming:'UNKNOWN_INSIDE_SW_READ_RPC',intervals:'read/encodeOutput/flush/mux/ACK intervals overlap; do not sum into exclusive wall phases',performanceAcceptance:'NOT_QUALIFIED',complete:false,rawIdentifiersExported:false};}
 function beginCleanup(){preStop=latest;closing=true;restore();return{preStopRecorded:!!preStop,wrapperRestored:restored};}
 async function stop(){stopped=true;closing=true;restore();clearTimeout(timer);try{await setupPromise;}catch{}
  for(const port of ports){port.onmessage=null;port.close();}ports.length=0;for(const url of urls)URL.revokeObjectURL(url);urls.length=0;
  owner=null;worker=null;pipelineUrl=null;workerUrl=null;return{disposed:true,removed:true,wrapperRestored:restored,portsClosed:true,blobsRevoked:true,timerCleared:true,privateOwnersCleared:true};
 }
 const timer=setTimeout(()=>{failure||='TIMING_ACTION_BOUND';restore();},Math.max(1,Math.min(100000,p.remainingMs)));
 window.__q3NativeTiming33=Object.freeze({install,read,beginCleanup,stop});return{prepared:true,observerOnly:true,rawIdentifiersExported:false};
})
