async function installPcActualAAC(input,runtimeBinding) {
  'use strict';
  if(!/^[a-f0-9]{40}$/.test(runtimeBinding?.sourceCommit||'')||runtimeBinding.version!=='1.22.0-rc.38')throw Error('AAC_RUNTIME_SOURCE_BINDING_REQUIRED');
  const FIXTURE={size:759643,sha:'bc831b81953010036a7d931100dfd264fa14d8e22633b6518268f6c6dbfc2e2f',md5:'4a49dfa52d67d5b4b391fe9bb7f836ae'};
  if(window.__rc38PcActualAAC||APP_VERSION!=='1.22.0-rc.38'||state.selected||q0Playback||q1Playback||playerTracksOwner
    ||state.authStatus!=='online'||!state.accountStateLoaded||!hasUsableToken()||state.accountStateLoadingPromise||state.accountStateSyncPromise||state.accountIdentityPending
    ||q1RetirementResult?.settled!==true||playerTracksRetirementResult?.settled!==true||!el.playerSheet.hidden||state.currentFolderId!=='root'||state.query)throw Error('AAC_ADMISSION');
  const reg=await navigator.serviceWorker.getRegistration('/'),controller=navigator.serviceWorker.controller;
  if(controller?.state!=='activated'||reg?.active!==controller||reg.waiting||reg.installing||reg.scope!==location.origin+'/')throw Error('AAC_CONTROLLER');
  if(input?.schema!=='rc38-pc-exact-created-context/1'||!/^[-0-9a-f]{36}$/.test(input.qaRunId||'')||input.account?.accountId!==state.accountId)throw Error('AAC_PC_ACCOUNT_MISMATCH');
  const canonical=v=>JSON.stringify((function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;})(v));
  let target={...input.metadata},metadata=null;const tags={qaRun:input.qaRunId,qaRole:'test-video-1',qaFixtureSHA256:FIXTURE.sha};
  const validate=m=>{if(!m||!/^[A-Za-z0-9_-]{5,200}$/.test(m.id||'')||m.id!==target.id||m.name!=='DriveOriginal-QA-'+input.qaRunId+'-test-video-1'
    ||m.mimeType!=='video/mp4'||m.ownedByMe!==true||m.driveId||m.trashed!==false||Number(m.size)!==FIXTURE.size||m.sha256Checksum!==FIXTURE.sha||m.md5Checksum!==FIXTURE.md5
    ||canonical(m.appProperties)!==canonical(tags)||!Array.isArray(m.parents)||m.parents.length!==1||!/^\d+$/.test(m.version||'')||!m.headRevisionId
    ||m.capabilities?.canDownload!==true)throw Error('AAC_EXACT_CREATED_FILE');return m;};validate(target);
  const owner={origin:location.origin,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,data:state.driveSessionGeneration,
    signal:state.accountStateAbortController?.signal,controller};
  if(!owner.signal||owner.signal.aborted)throw Error('AAC_ACCOUNT_SIGNAL');
  const installedAt=performance.now(),withinDeadline=()=>!expired&&performance.now()-installedAt<180000;
  const ownerFence=()=>!stopped&&APP_VERSION==='1.22.0-rc.38'&&location.origin===owner.origin&&navigator.serviceWorker.controller===controller&&controller.state==='activated'
    &&reg.active===controller&&!reg.waiting&&!reg.installing&&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth
    &&state.driveSessionGeneration===owner.data&&state.accountStateAbortController?.signal===owner.signal&&!owner.signal.aborted&&state.authStatus==='online'
    &&hasUsableToken()&&document.visibilityState==='visible';
  const fence=()=>ownerFence()&&withinDeadline();
  let stopped=false,expired=false,located=false,session=null,nativeTuple=null,nativeFormat=null,snapshotCapture=null,snapshotInputStable=false,initialQ1Source=null,frameId=null,timer=null,phase=null;
  const workers=[],phases=[],events=[],controllers=new Set(),video=el.videoPlayer,NativeWorker=window.Worker;
  const tuple=v=>({primaries:v?.primaries??null,transfer:v?.transfer??null,matrix:v?.matrix??null,fullRange:v?.fullRange??null});
  const numeric=v=>Number.isFinite(v)?v:null;
  const initialTokenRevision=state.tokenRevision;
  const credentialObservation=()=>{const outcome=typeof credentialRequestOutcome==='object'?credentialRequestOutcome:null;return {
    tokenRemainingMs:Number.isFinite(state.expiresAt)?Math.round(state.expiresAt-Date.now()):null,
    credentialPending:typeof credentialRequestPromise!=='undefined'&&!!credentialRequestPromise,
    responseOK:typeof outcome?.responseOk==='boolean'?outcome.responseOk:null,retryable:typeof outcome?.retryable==='boolean'?outcome.retryable:null,
    outcomeCurrent:outcome?.generation===state.authGeneration,revisionChanged:state.tokenRevision!==initialTokenRevision};};
  const initialCredentialObservation=credentialObservation();
  // Passive bounded evidence only. Never used by an eligibility or PASS gate.
  const transitionRing=[],traceCounts={rows:0,evicted:0,errors:0,workerConstruct:0,startAccepted:0,startRejected:0,windowAccepted:0,windowRejected:0,terminalAccepted:0,terminalRejected:0,workerTerminate:0};let lastTransition=null;
  const trace=(kind,data)=>{if(stopped)return;try{traceCounts.rows++;if(transitionRing.length===128){transitionRing.shift();traceCounts.evicted++;}transitionRing.push({kind,at:Date.now(),...data});}catch{traceCounts.errors++;}};
  const traceView=()=>({coverage:'PAGE_GENERAL_WORKER_PROXY_AND_READ_FRAME_SAMPLES_ONLY',allWorkerCoverage:'UNKNOWN',initialCredential:initialCredentialObservation,counts:{...traceCounts},transitions:transitionRing.slice()});
  function observeState(r,stats){if(stopped)return;const m=stats?.mapping,row={source:r.sourceGeneration,generation:r.generation,mediaSession:r.mediaSession,
    phase:['opening','buffering','ready','buffered-to-end','failed','cancelled'].includes(stats?.phase)?stats.phase:null,
    mapping:m?{sourceOrigin:numeric(m.sourceOrigin),sourceEnd:numeric(m.sourceEnd),targetSource:numeric(m.targetSource),targetElement:numeric(m.targetElement),commonShift:numeric(m.commonShift)}:null,
    appends:numeric(stats?.appends),disposed:stats?.disposed===true,verified:r.verified,transport:r.transport,ready:r.ready,paused:r.paused,routeCurrent:r.routeCurrent,
    failed:r.failed,error:r.error,window:r.currentWorkerWindow,workerIdentityCurrent:r.workerIdentityCurrent,
    credential:{...r.credentialObservation,tokenRemainingMs:r.credentialObservation.tokenRemainingMs===null?null:Math.round(r.credentialObservation.tokenRemainingMs/1000)*1000}};
    const key=JSON.stringify(row);if(key!==lastTransition){lastTransition=key;trace('state',row);}}
  // Deadline removes QA eligibility; exact-owner ordinary close remains safe.
  const cleanupCurrent=()=>ownerFence()&&target&&state.selected?.id===target.id&&state.mediaSession===session&&getActiveMediaElement()===video&&isCurrentMediaEvent(video)&&!el.playerSheet.hidden;
  const current=()=>withinDeadline()&&cleanupCurrent();
  const playback=()=>q1Playback||q0Playback;
  const routeCurrent=()=>{const p=playback();return !!p&&current()&&p.fileId===target.id&&p.session===session&&p.account===owner.key&&p.accountGeneration===owner.data
    &&p.swController===controller&&p.swGeneration===mediaSourceGeneration&&!p.controller.signal.aborted;};
  const fields='id,name,mimeType,ownedByMe,driveId,trashed,parents,version,headRevisionId,modifiedTime,size,md5Checksum,sha256Checksum,appProperties,capabilities(canTrash,canDownload)';
  const metadataURL=()=>{const u=new URL(DRIVE_API+'/files/'+encodeURIComponent(target.id));u.searchParams.set('fields',fields);u.searchParams.set('supportsAllDrives','true');return u.href;};
  async function fresh(){if(!fence())throw Error('AAC_OWNER');const ac=new AbortController();controllers.add(ac);const t=setTimeout(()=>ac.abort(),10000);let reader;
    try{const r=await driveFetch(metadataURL(),{signal:AbortSignal.any([ac.signal,owner.signal])});if(!r.ok){await r.body?.cancel();throw Error('AAC_METADATA_HTTP');}
      reader=r.body?.getReader();if(!reader)throw Error('AAC_METADATA_BODY');const chunks=[];let size=0;for(;;){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;if(size>65536||!fence())throw Error('AAC_METADATA_BOUND');chunks.push(v.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.byteLength;}try{if(!fence())throw Error('AAC_OWNER');return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}finally{bytes.fill(0);}
    }finally{clearTimeout(t);ac.abort();try{await reader?.cancel();}finally{reader?.releaseLock();controllers.delete(ac);}}}
  const positionTolerance=0.000001,originalFrameSeconds=1/24;
  function preInputStable(){if(!snapshotCapture)return false;const now=capturePlaybackSnapshot();return routeCurrent()&&q0Playback===snapshotCapture.playback&&mediaSourceGeneration===snapshotCapture.source&&state.mediaSession===snapshotCapture.session&&video.paused===true&&now?.paused===true&&Number.isFinite(now.time)&&Math.abs(now.time-snapshotCapture.time)<=positionTolerance;}
  function initialPosition(frameMediaTime=state.lastPresentedMediaTime){const stats=q1Playback?.player?.stats(),m=stats?.mapping,c=snapshotCapture;
    const boundWorkers=workers.filter(w=>w.bound?.owner===q1Playback&&w.bound?.session===session),matching=boundWorkers.filter(w=>w.bound.source===mediaSourceGeneration&&w.bound.generation===1);
    const expected=c&&Number.isFinite(m?.sourceOrigin)&&Number.isFinite(m?.sourceEnd)?Math.min(m.sourceEnd-positionTolerance,m.sourceOrigin+c.time):null;
    const actual=Number.isFinite(m?.targetSource)?m.targetSource:null,sourceFrame=Number.isFinite(frameMediaTime)&&Number.isFinite(m?.commonShift)?frameMediaTime+m.commonShift:null;
    const checks={positivePausedSnapshot:!!c&&Number.isFinite(c.time)&&c.time>0&&c.paused===true,inputPositionStable:snapshotInputStable,
      generationOne:stats?.generation===1,singleInitialWorker:!!c&&workers.length-c.workerBaseline===1&&boundWorkers.length===1&&matching.length===1&&matching[0].starts===1,
      sourceCurrent:initialQ1Source!==null&&initialQ1Source===mediaSourceGeneration&&!!c&&mediaSourceGeneration>c.source,
      finiteTarget:!!m&&Number.isFinite(expected)&&Number.isFinite(actual)&&m.sourceEnd-positionTolerance>=m.sourceOrigin&&expected>m.sourceOrigin,
      exactSnapshotTarget:Number.isFinite(expected)&&Number.isFinite(actual)&&Math.abs(actual-expected)<=positionTolerance,
      mappedFrameAtTarget:Number.isFinite(expected)&&Number.isFinite(sourceFrame)&&sourceFrame+positionTolerance>=expected&&sourceFrame<=expected+originalFrameSeconds+positionTolerance,
      pausedCurrent:video.paused===true};
    return {snapshotTime:c?.time??null,snapshotPaused:c?.paused??null,q0SourceGeneration:c?.source??null,currentSourceGeneration:mediaSourceGeneration,
      expectedTarget:expected,actualTarget:actual,mappedSourceFrame:sourceFrame,generation:stats?.generation??null,boundWorkerCount:boundWorkers.length,currentInitialWorkerCount:matching.length,
      workersSinceSnapshot:c?workers.length-c.workerBaseline:null,originalFrameSeconds,positionTolerance,checks,passed:Object.values(checks).every(v=>v===true)};}
  function preInputCheck(){if(!preInputStable())throw Error('AAC_SNAPSHOT_PREINPUT_DRIFT');return {snapshotPositionStable:true,snapshotTime:snapshotCapture.time,paused:true};}
  const WorkerProxy=new Proxy(NativeWorker,{construct(Type,args){const worker=Reflect.construct(Type,args),url=new URL(String(args[0]),location.href);
    if(url.origin===owner.origin&&/\/general-worker\.mjs$/.test(url.pathname)){const record={worker,created:true,terminated:false,bound:null,window:null,traceId:workers.length+1,starts:0};
      traceCounts.workerConstruct++;trace('worker-construct',{worker:record.traceId,source:numeric(mediaSourceGeneration)});
      const originalPost=worker.postMessage,originalTerminate=worker.terminate;
      const post=function(message,...rest){if(message?.kind==='start'){const accepted=routeCurrent();record.starts++;if(accepted&&snapshotCapture&&initialQ1Source===null)initialQ1Source=mediaSourceGeneration;if(accepted)record.bound={owner:q1Playback,session,source:mediaSourceGeneration,generation:message.generation,identity:message.identity};
        traceCounts[accepted?'startAccepted':'startRejected']++;trace('worker-start',{worker:record.traceId,generation:numeric(message.generation),source:numeric(mediaSourceGeneration),accepted,reason:accepted?'BOUND_CURRENT_ROUTE':'ROUTE_NOT_CURRENT'});}return originalPost.call(this,message,...rest);};
      const terminate=function(...args){record.terminated=true;traceCounts.workerTerminate++;trace('worker-terminate',{worker:record.traceId});return originalTerminate.apply(this,args);};
      const listener=e=>{const kind=e.data?.kind;if(kind!=='window'&&kind!=='terminal')return;const b=record.bound;
        const reason=!b?'NO_START_BINDING':!routeCurrent()?'ROUTE_NOT_CURRENT':q1Playback!==b.owner?'OWNER_CHANGED':state.mediaSession!==b.session?'SESSION_CHANGED':mediaSourceGeneration!==b.source?'SOURCE_CHANGED':e.data.generation!==b.generation?'GENERATION_CHANGED':'BOUND_CURRENT_ROUTE',accepted=reason==='BOUND_CURRENT_ROUTE';
        traceCounts[kind+(accepted?'Accepted':'Rejected')]++;trace('worker-'+kind,{worker:record.traceId,generation:numeric(e.data.generation),source:numeric(mediaSourceGeneration),boundSource:numeric(b?.source),accepted,reason,...(kind==='terminal'?{errorPresent:!!e.data.error}:{})});
        if(kind!=='window'||!accepted)return;const w=e.data.value;record.window={selectedAudioTrackId:w.selectedAudioTrackId,videoConfig:w.videoConfig,outputVideoConfig:w.outputVideoConfig,generation:e.data.generation};};
      record.listener=listener;record.post=post;record.originalPost=originalPost;record.terminate=terminate;record.originalTerminate=originalTerminate;
      worker.postMessage=post;worker.terminate=terminate;worker.addEventListener('message',listener);workers.push(record);}return worker;}});
  function pipeline(){const stats=q1Playback?.player?.stats(),g=stats?.generation;const record=workers.findLast(w=>w.bound?.owner===q1Playback&&w.bound?.session===session&&w.bound?.source===mediaSourceGeneration&&w.window?.generation===g);
    return {stats,pipe:stats?.pipeline||record?.window,record};}
  function read(){if(!expired&&!withinDeadline())expire();const {stats,pipe,record}=pipeline(),track=playerTracksOwner,p=playback();const r={fence:fence(),current:current(),cleanupCurrent:cleanupCurrent(),deadlineExpired:!withinDeadline(),routeCurrent:routeCurrent(),q0:!!q0Playback,q1:!!q1Playback,credentialObservation:credentialObservation(),
    q1General:q1Playback?.kind==='general',closed:el.playerSheet.hidden,verified:state.mediaDecodeVerified===true,
    transport:q1Playback?state.mediaTransportVerified===true&&state.mediaTransportStarted===true&&state.mediaPlaybackMode==='original-repackaged':hasVerifiedOriginalTransport(),
    q0Pinned:!!q0PinnedSource,q1ControllerCurrent:!!q1Playback&&q1Playback.swController===controller,q1SignalLive:!!q1Playback&&!q1Playback.controller.signal.aborted,
    ready:video.readyState,width:video.videoWidth,height:video.videoHeight,paused:video.paused,error:video.error?.code??null,failed:state.mediaAttempt==='failed'||!!stats?.failure,
    mediaSession:numeric(state.mediaSession),sourceGeneration:numeric(mediaSourceGeneration),generation:numeric(stats?.generation),mappedPresentedMediaTime:numeric(state.lastPresentedMediaTime),
    tracksCurrent:track?.current()===true,tracksCleanup:track?.cleanupOk===true,switching:track?.switching===true,dialog:el.playerTracksDialog.open,
    audioOptions:track?.inventory?.audioTracks?.map(t=>({id:t.trackId,codec:t.codec==='aac'?'aac':'other',route:t.route==='q1'?'q1':'other'}))??[],
    selectedAudio:track?.selectedAudioTrackId??null,q1SelectedAudio:q1Playback?.selectedAudioTrackId??null,defaultAudio:track?.inventory?.defaultAudioTrackId??null,audioValue:video&&el.playerAudioTrack.value===''?null:Number(el.playerAudioTrack.value),
    pipelineAudio:pipe?.selectedAudioTrackId??null,statsReady:!!pipe,windowMetadataOnly:!stats?.pipeline&&!!record?.window,
    sourceConfigPreserved:pipe?typeof pipe.videoConfig?.codec==='string'&&pipe.videoConfig.codec.startsWith('avc1.')&&pipe.videoConfig.codedWidth===320&&pipe.videoConfig.codedHeight===180
      &&!!pipe.videoConfig.description?.byteLength&&canonical(pipe.videoConfig.description)===canonical(pipe.outputVideoConfig?.description)&&['codec','codedWidth','codedHeight'].every(k=>pipe.videoConfig[k]===pipe.outputVideoConfig?.[k]):null,
    nativeObservation:track?.nativeColorObservation?{basis:track.nativeColorObservation.basis,format:track.nativeColorObservation.format,tuple:tuple(track.nativeColorObservation.colorSpace)}:null,
    outputObservation:stats?.outputColorObservation?{basis:stats.outputColorObservation.basis,tuple:tuple(stats.outputColorObservation.colorSpace)}:null,
    outputConfigTuple:pipe?tuple(pipe.outputVideoConfig?.colorSpace):null,encoders:stats?.pipeline?.encodersCreated??null,
    phases:phases.map(p=>({label:p.label,armedAt:p.at,first:p.first,frames:p.frames})),events:events.slice(),
    currentWorkerWindow:!!record?.window,workerIdentityCurrent:!!record?.bound&&record.bound.identity?.fileId===target?.id&&record.bound.identity?.accountKey===owner.key&&record.bound.identity?.accountGeneration===owner.data
      &&['headRevisionId','size','mimeType','modifiedTime','version','sha256Checksum'].every(k=>record.bound.identity[k]===metadata?.[k])&&record.bound.identity.canDownload===true&&record.bound.identity.trashed===false,
    q1Retired:q1RetirementResult?.settled===true,tracksRetired:playerTracksRetirementResult?.settled===true};r.controlledPCSelection=snapshotInputStable&&events.some(e=>e.type==='change'&&e.aac3);r.physicalNativeInput=false;r.trustedAAC3Change=events.some(e=>e.type==='change'&&e.trusted&&e.aac3);r.snapshotPreInputStable=snapshotCapture?preInputStable():null;r.initialPosition=initialPosition();observeState(r,stats);r.passiveTrace=traceView();return r;}
  const event=e=>{if(e.type==='change'&&el.playerAudioTrack.value==='3')snapshotInputStable=preInputStable();if(fence()&&events.length<32)events.push({type:e.type,trusted:e.isTrusted===true,at:Date.now(),aac3:e.type==='change'?el.playerAudioTrack.value==='3':null});};
  function expire(){expired=true;if(frameId!==null)video.cancelVideoFrameCallback(frameId);frameId=null;for(const ac of controllers)ac.abort();}
  const frameCallback=(_,m)=>{frameId=null;if(stopped)return;if(!withinDeadline()){expire();return;}const r=read(),p=playback();if(phase&&phase.frames.length<32){const advanced=phase.owner!==p||phase.source!==mediaSourceGeneration||phase.generation!==r.generation;
    const predicateBits={within15:Date.now()-phase.at<=15000,routeCurrent:routeCurrent(),verified:r.verified,transport:r.transport,noError:!r.error,noFailure:!r.failed,width320:m.width===320,height180:m.height===180,finiteMediaTime:Number.isFinite(m.mediaTime),
      selectedRoute:phase.label==='q0'?r.q0&&r.q0Pinned:r.q1General&&r.q1SelectedAudio===3&&r.selectedAudio===3&&Number.isFinite(r.mappedPresentedMediaTime)&&!r.switching&&advanced&&initialPosition(m.mediaTime).passed};
    const good=predicateBits.within15&&predicateBits.routeCurrent&&predicateBits.verified&&predicateBits.transport&&predicateBits.noError&&predicateBits.noFailure&&predicateBits.width320&&predicateBits.height180&&predicateBits.finiteMediaTime&&predicateBits.selectedRoute;
    const row={elapsedMs:Date.now()-phase.at,mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,width:m.width,height:m.height,mediaSession:r.mediaSession,sourceGeneration:r.sourceGeneration,generation:r.generation,advanced,good,predicateBits,initialPosition:phase.label==='aac3'?initialPosition(m.mediaTime):null};
    trace('frame',{label:phase.label,...row,mappedPresentedMediaTime:r.mappedPresentedMediaTime,switching:r.switching,q1General:r.q1General,selectedAAC3:r.selectedAudio===3&&r.q1SelectedAudio===3});
    phase.frames.push(row);if(good&&!phase.first)phase.first=row;}if(!stopped&&withinDeadline())frameId=video.requestVideoFrameCallback(frameCallback);else expire();};
  function arm(label){if(!['q0','aac3'].includes(label)||phases.length>=2||!fence())throw Error('AAC_PHASE_ADMISSION');phase={label,at:Date.now(),owner:playback(),source:mediaSourceGeneration,generation:q1Playback?.player?.stats()?.generation,first:null,frames:[]};phases.push(phase);return {armed:true,label,initialDeadlineMs:15000};}
  async function locate(){if(located||state.selected||!fence())throw Error('AAC_LOCATE_ONCE');located=true;metadata=await fresh();if(canonical(metadata)!==canonical(target))throw Error('AAC_ROOT_METADATA_CHANGED');target={...metadata,videoMediaMetadata:{width:320,height:180,durationMillis:'6000'}};return {eligible:true,exactOneMetadataGET:true,ownedByMe:true,pcAccountMatches:true,checksumMatches:true,size:FIXTURE.size,noSearch:true};}
  function open(){if(!located||!metadata||!fence()||state.selected)throw Error('AAC_OPEN_ADMISSION');arm('q0');openPlayer(target);session=state.mediaSession;return {ordinaryAppOpenHandler:true,observerBeforeOpen:true};}
  function captureNative(){if(!routeCurrent()||!q0Playback||!q0PinnedSource||!state.mediaDecodeVerified||!hasVerifiedOriginalTransport()||!phase?.first)throw Error('AAC_NATIVE_ADMISSION');let frame;
    try{frame=new VideoFrame(video);nativeTuple=tuple(frame.colorSpace);nativeFormat=frame.format;return {format:nativeFormat,tuple:nativeTuple,width:frame.visibleRect.width,height:frame.visibleRect.height,frameClosed:true};}finally{frame?.close();}}
  function selectionReady(){const r=read();if(!routeCurrent()||!r.q0||!r.tracksCurrent||!r.tracksCleanup||!r.dialog||r.switching||r.defaultAudio!==2||r.audioValue!==2||r.selectedAudio!==null
    ||!r.paused||!r.verified||!r.transport||r.audioOptions.length!==2||![2,3].every(id=>r.audioOptions.some(t=>t.id===id&&t.codec==='aac'&&t.route==='q1'))||el.playerAudioTrack.disabled)throw Error('AAC_SELECTION_ADMISSION');
    const snapshot=capturePlaybackSnapshot();if(!Number.isFinite(snapshot?.time)||snapshot.time<=0||snapshot.paused!==true)throw Error('AAC_POSITIVE_PAUSED_SNAPSHOT_REQUIRED');
    snapshotCapture=Object.freeze({time:snapshot.time,paused:true,playback:q0Playback,source:mediaSourceGeneration,session:state.mediaSession,workerBaseline:workers.length});preInputCheck();
    arm('aac3');return {armed:true,initialDefaultTrackId:2,initialValue:2,trackId:3,realValueChangeRequired:true,snapshotTime:snapshotCapture.time,snapshotPaused:true,snapshotBoundCurrentQ0:true,initialDeadlineMs:15000};}
  async function verify(){const initial=read();if(!routeCurrent()||!initial.q1General||initial.q0||initial.switching||!initial.phases.find(p=>p.label==='aac3')?.first)throw Error('AAC_VERIFY_ADMISSION');
    const bound={playback:q1Playback,session:state.mediaSession,source:mediaSourceGeneration,generation:pipeline().stats?.generation};
    const same=()=>routeCurrent()&&q1Playback===bound.playback&&state.mediaSession===bound.session&&mediaSourceGeneration===bound.source&&pipeline().stats?.generation===bound.generation;
    const qualified=r=>same()&&Number.isSafeInteger(bound.generation)&&r.current&&r.q1General&&!r.q0&&!r.switching&&r.tracksCurrent&&r.tracksCleanup&&r.verified&&r.transport
      &&!r.failed&&!r.error&&Number.isFinite(r.mappedPresentedMediaTime)&&r.selectedAudio===3&&r.q1SelectedAudio===3&&r.pipelineAudio===3&&r.currentWorkerWindow&&r.workerIdentityCurrent&&r.initialPosition.passed&&r.controlledPCSelection;
    if(!qualified(initial))throw Error('AAC_VERIFY_CURRENT_SELECTION');const after=await fresh(),r=read();
    if(!qualified(r))throw Error('AAC_VERIFY_OWNER_CHANGED_DURING_GET');let frame;
    try{frame=new VideoFrame(video);if(!qualified(read()))throw Error('AAC_VERIFY_FRAME_OWNER_CHANGED');const presentedTuple=tuple(frame.colorSpace),originalMetadataUnchanged=canonical(metadata)===canonical(after);
      const tuplePass=!!nativeTuple&&r.nativeObservation?.basis==='observed-native-frame'&&r.outputObservation?.basis==='observed-native-frame'
        &&canonical(nativeTuple)===canonical(r.nativeObservation.tuple)&&canonical(nativeTuple)===canonical(r.outputObservation.tuple)&&canonical(nativeTuple)===canonical(r.outputConfigTuple)&&canonical(nativeTuple)===canonical(presentedTuple);
      return {...r,originalMetadataUnchanged,nativeTuple,nativeFormat,presentedFormat:frame.format,presentedTuple,tuplePass,visibleGeometry:frame.visibleRect.width===320&&frame.visibleRect.height===180,
        trustedAAC3Change:r.events.some(e=>e.type==='change'&&e.trusted&&e.aac3),ownerRecheckedAfterMetadataGET:true,frameBoundToSameOwnerGeneration:true,frameClosed:true,pixelEquality:'NOT_TESTED',unlikeFormatVisibleYUV:'UNKNOWN',p95:'NOT_TESTED',executingWorkerBytes:'UNKNOWN'};
    }finally{frame?.close();}}
  function closed(){return {playerClosed:el.playerSheet.hidden&&!state.selected,q0Absent:!q0Playback,q1Absent:!q1Playback,tracksAbsent:!playerTracksOwner,
    q0PinAbsent:!q0PinnedSource,blobAbsent:!state.mediaBlobUrl,mediaSrcAbsent:!video.hasAttribute('src'),q1Retired:q1RetirementResult?.settled===true,tracksRetired:playerTracksRetirementResult?.settled===true,
    accountIdle:!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&!state.accountIdentityPending,libraryRoot:state.currentFolderId==='root',queryEmpty:!state.query};}
  function stop(){const c=closed();if(Object.values(c).some(v=>v!==true))throw Error('AAC_CLOSE_UNSETTLED');stopped=true;clearTimeout(timer);video.cancelVideoFrameCallback(frameId);frameId=null;
    video.removeEventListener('playing',event);video.removeEventListener('pause',event);el.playerAudioTrack.removeEventListener('change',event);
    const workerFactoryRestored=window.Worker===WorkerProxy;if(workerFactoryRestored)window.Worker=NativeWorker;const workersTerminated=workers.every(w=>w.terminated);
    for(const w of workers){w.worker.removeEventListener('message',w.listener);if(w.worker.postMessage===w.post)w.worker.postMessage=w.originalPost;if(w.worker.terminate===w.terminate)w.worker.terminate=w.originalTerminate;w.bound=null;w.window=null;}
    const readersEmpty=controllers.size===0;for(const ac of controllers)ac.abort();controllers.clear();target=null;metadata=null;nativeTuple=null;snapshotCapture=null;initialQ1Source=null;snapshotInputStable=false;input=null;session=null;phases.length=0;workers.length=0;
    transitionRing.length=0;lastTransition=null;delete window.__rc38PcActualAAC;return {...c,workersTerminated,workerFactoryRestored,readersEmpty,workerListenersRemoved:true,frameCallbacksRemoved:frameId===null,eventsRemoved:true,timerRemoved:true,privateContextCleared:true,traceCleared:true,helperAbsent:!window.__rc38PcActualAAC};}
  window.Worker=WorkerProxy;video.addEventListener('playing',event);video.addEventListener('pause',event);el.playerAudioTrack.addEventListener('change',event);
  frameId=video.requestVideoFrameCallback(frameCallback);timer=setTimeout(expire,180000);
  window.__rc38PcActualAAC=Object.freeze({locate,open,read,captureNative,selectionReady,preInputCheck,verify,closed,stop});
  return {prepared:true,current38:true,pcAccountMatches:true,observersBeforeInput:true,physicalNativeInput:false,controlledPCSelection:false,fetchDeadlineMs:10000,frameDeadlineMs:15000,overallDeadlineMs:180000};
}
