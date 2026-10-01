function(binding, proof, continuation) {
  'use strict';
  // Passive: no fetch, playback method, owner mutation, URL/body export or wrappers.
  let pin=proof?.get?.();
  if(window.__rc25PerformanceQA||!pin||APP_VERSION!==binding.version||pin.version!==binding.version
    ||pin.sourceCommit!==binding.sourceCommit||!['app.js','sw.js','version.json'].every(k=>pin.sourceSHA256?.[k]===binding.sourceSHA256?.[k])
    ||state.selected||q0Playback||q1Playback||q1RetirementResult?.settled!==true||state.mediaAttempt!=='idle'||state.demo||state.authStatus!=='online'||!hasUsableToken()
    ||document.visibilityState!=='visible'||typeof el.videoPlayer?.requestVideoFrameCallback!=='function')throw Error('QA_PREFLIGHT');
  const video=el.videoPlayer;let account=state.accountId, accountKey=state.authAccountKey, drive=state.driveSessionGeneration;
  const n=x=>Number.isFinite(x)?Math.round(x*1000)/1000:null;
  const band=x=>!Number.isFinite(Number(x))?'unknown':Number(x)<100*1024**2?'under100MiB':Number(x)<1024**3?'100MiBto1GiB':'over1GiB';
  const extension=f=>{const v=String(f.name??'').toLowerCase().split('.').pop();return ['mp4','webm','mkv','avi','ts','m2ts','mov','m4v'].includes(v)?v:'other';};
  const cardIds=new Set([...document.querySelectorAll('.file-card')].map(c=>c.dataset.fileId));
  let candidates=(state.files??[]).filter(f=>f?.id&&cardIds.has(f.id)&&String(f.mimeType??'').startsWith('video/'));
  const groups=new Map();for(const f of candidates){const key=extension(f)+':'+band(f.size);if(!groups.has(key))groups.set(key,f);}
  // Existing available metadata only; no fetch or claim of complete corpus coverage.
  let privateFiles=[...groups.values()].slice(0,2);
  if(privateFiles.length<2)for(const f of candidates)if(!privateFiles.some(x=>x.id===f.id)&&privateFiles.length<2)privateFiles.push(f);
  if(privateFiles.length!==2)throw Error('QA_TWO_AVAILABLE_VIDEOS_REQUIRED');
  const availableCount=candidates.length;groups.clear();cardIds.clear();
  if(JSON.stringify(continuation)!=="{\"schema\":\"drive-original.rc30-performance-continuation/1\",\"priorPartialSHA256\":\"66b5f828175375a4f88a4817c53e2489d2f1258f6f60781e47ebf36589a59b9a\",\"originalIdentityKnown\":false,\"sampleNumbersAreBookkeeping\":true,\"plan\":[{\"sample\":9,\"kind\":\"first-startup\"},{\"sample\":9,\"kind\":\"warm-startup\"},{\"sample\":9,\"kind\":\"seek90\"},{\"sample\":10,\"kind\":\"first-startup\"},{\"sample\":10,\"kind\":\"warm-startup\"},{\"sample\":10,\"kind\":\"seek10\"}]}")throw Error('QA_CONTINUATION_PLAN');
  const plan=continuation.plan.map(p=>({...p}));
  const rows=[], closes=[], listeners=[];let active=null, index=0, interval=null, frame=null, done=false;
  let finishTimer=null, waitingClose=null, closeAt=null,runTimer=null,seekGesture=null,lastFailedStartup=null;
  const current=()=>state.accountId===account&&state.authAccountKey===accountKey&&state.driveSessionGeneration===drive
    &&APP_VERSION===binding.version&&proof.get()?.controller===pin.controller&&proof.get()?.sourceCommit===binding.sourceCommit;
  const snapshot=()=>{
    const s=q1Playback?.player?.stats?.(),ret=q1RetirementResult;
    return {route:q1Playback?(s?.status?.level==='Q2'?'Q2':'Q1'):q0Playback?'Q0':'unknown',playerKind:q1Playback?.kind==='ts'?'ts':q1Playback?'general':'native-or-absent',
      selected:Boolean(state.selected),q0Owner:Boolean(q0Playback),q1Owner:Boolean(q1Playback),nativeOwner:isCurrentMediaEvent(video),
      sourceGeneration:n(mediaSourceGeneration),mediaSession:n(state.mediaSession),generation:n(s?.generation),
      appends:n(s?.appends),removals:n(s?.removals??s?.window?.removals),peakAhead:n(s?.peakAhead??s?.window?.peakAhead),
      peakRetainedAppendBytes:n(s?.peakRetainedAppendBytes),directOwners:mediaDiagnosticDirectRequestOwners.size,
      retiredTraces:mediaDiagnosticRetiredTraces.size,retirementSettled:ret?.settled===true,retirementAbsent:ret==null,
      watchdog:Boolean(mediaSeekWatchdog),loading:!el.mediaLoading.hidden,seeking:video.seeking||Boolean(state.isSeeking),
      bufferedRanges:video.buffered.length,ready:video.readyState,paused:video.paused,visible:document.visibilityState==='visible',
      heapUsed:n(performance.memory?.usedJSHeapSize),heapTotal:n(performance.memory?.totalJSHeapSize)};
  };
  const targetFor=a=>{const timeline=playerTimeline(video);return a.kind.startsWith('seek')?timeline.duration*Number(a.kind.slice(4))/100:null;};
  const own=a=>current()&&state.selected?.id===a.fileId&&state.mediaSession===a.session
    &&mediaSourceGeneration===a.source&&q1Playback?.player===a.player&&isCurrentMediaEvent(video);
  const save=code=>{if(!active)return;const a=active;active=null;seekGesture=null;
    const end=snapshot();rows.push({...a.safe,code,elapsedMs:n(performance.now()-a.at),firstFrameMs:n(a.frameAt==null?NaN:a.frameAt-a.at),
      actualAttempt:true,
      decodedTarget:a.frameAt!=null,headerOver10s:a.headerOver10s,headerUnknown:a.headers===null,
      frameOver15s:a.frameOver15s,hiddenDuring:a.hiddenDuring,pausedDuring:a.pausedDuring,
      headersMs:a.headers,resources:a.resources,route:end.route==='unknown'?(a.routeHistory.at(-1)??'unknown'):end.route,
      routeHistory:[...a.routeHistory],ownerCurrent:a.session!=null&&own(a),before:a.before,after:end});
    lastFailedStartup=code==='MEDIA_FAILED'&&a.kind==='warm-startup'&&a.frameAt==null
      &&state.selected?.id===a.fileId?{sample:a.safe.sample,fileId:a.fileId,session:state.mediaSession,
        source:mediaSourceGeneration,player:q1Playback?.player,outcome:index+1}:null;
    index++;if(index===plan.length)finishTimer=setTimeout(()=>stop('SIX_CONTINUATION_ATTEMPTS_FINISHED'),30000);
  };
  const inputTrack=e=>[el.seekBarContainer,el.mobileShortsProgressTrack].find(t=>t?.contains(e.target));
  const gestureMatches=e=>{
    const g=seekGesture;if(!g||!e.isTrusted||document.visibilityState!=='visible'||!current()
      ||state.selected?.id!==g.fileId||state.mediaSession!==g.session||mediaSourceGeneration!==g.source
      ||q1Playback?.player!==g.player||performance.now()>g.until||e.pointerId!==g.pointerId
      ||e.pointerType!==g.pointerType||e.button!==0||(e.type!=='click'&&e.isPrimary===false)||inputTrack(e)!==g.track)return false;
    const r=g.track.getBoundingClientRect(),ratio=(e.clientX-r.left)/r.width;
    return r.width>0&&Number.isFinite(ratio)&&Math.abs(ratio-g.ratio)<=.002;
  };
  const pointerEnd=e=>{
    if(!seekGesture)return;
    if(e.type==='pointerup'&&gestureMatches(e)&&seekGesture.up===null)seekGesture.up=performance.now();
    else seekGesture=null;
  };
  const begin=e=>{
    if(done||index>=plan.length)return;
    if(!e.isTrusted||document.visibilityState!=='visible'){seekGesture=null;return;}
    lastFailedStartup=null;
    if(!current()){if(active)save('SOURCE_OR_ACCOUNT_CHANGED');stop('SOURCE_OR_ACCOUNT_CHANGED');return;}
    // One trusted pointerdown/up/click is one slider input. Consume only its
    // matching final click, never a second input or a click-only approximation.
    if(e.type==='click'&&seekGesture?.up!=null&&e.detail===1&&gestureMatches(e)){
      seekGesture=null;return;
    }
    if(e.type==='pointerdown')seekGesture=null;
    if(active){if(e.target?.closest?.('.file-card-open')||[el.seekBarContainer,el.mobileShortsProgressTrack].some(t=>t?.contains(e.target)))save('EXTRA_INPUT');return;}
    const p=plan[index],f=privateFiles[p.sample-9];
    const card=e.target?.closest?.('.file-card-open')?.closest?.('.file-card');
    const track=inputTrack(e);
    if(p.kind.endsWith('startup')){if(e.type!=='click'||card?.dataset.fileId!==f.id||state.selected)return;}
    else {if(e.type!=='pointerdown'||!track||state.selected?.id!==f.id||!video.paused
      ||e.isPrimary===false||(e.button!=null&&e.button!==0))return;
      const r=track.getBoundingClientRect(),ratio=(e.clientX-r.left)/r.width;
      if(Math.abs(ratio-Number(p.kind.slice(4))/100)>.015)return;}
    const net=navigator.connection;
    active={kind:p.kind,fileId:f.id,at:performance.now(),session:null,source:null,player:null,frameAt:null,headers:null,
      headerOver10s:false,frameOver15s:false,hiddenDuring:false,pausedDuring:false,routeHistory:[],resources:{count:0,exposedCount:0,encodedBytes:0},before:snapshot(),
      safe:{attempt:rows.filter(r=>r.actualAttempt!==false).length+1,plannedOutcome:index+1,sample:p.sample,kind:p.kind,sizeBand:band(f.size),extension:extension(f),
        cache:p.kind==='first-startup'?'first-open-cache-unknown':p.kind==='warm-startup'?'same-file-reopen-cache-unknown':'current-owner',
        network:{online:navigator.onLine,effectiveType:['slow-2g','2g','3g','4g'].includes(net?.effectiveType)?net.effectiveType:null,rtt:n(net?.rtt),downlink:n(net?.downlink),saveData:Boolean(net?.saveData)},
        startVisible:document.visibilityState==='visible',trusted:true}};
    if(p.kind.startsWith('seek')&&e.button===0&&e.isPrimary!==false&&Number.isInteger(e.pointerId)&&e.pointerId>=0
      &&['mouse','touch','pen'].includes(e.pointerType)){
      const r=track.getBoundingClientRect();
      seekGesture={track,pointerId:e.pointerId,pointerType:e.pointerType,ratio:(e.clientX-r.left)/r.width,
        fileId:f.id,session:state.mediaSession,source:mediaSourceGeneration,player:q1Playback?.player,until:performance.now()+1000,up:null};
    }
    if(p.kind.startsWith('seek')&&Math.abs(playerTimeline(video).currentTime-targetFor(active))<=.25)save('TARGET_ALREADY_CURRENT');
  };
  const close=e=>{if(!e.isTrusted||!state.selected)return;
    if(!(e.type==='keydown'&&e.key==='Escape')&&!(e.type==='click'&&el.closePlayerButton?.contains(e.target)))return;
    if(active)save('CLOSED_BEFORE_TARGET');closeAt=performance.now();waitingClose={sample:privateFiles.findIndex(f=>f.id===state.selected.id)+9,before:snapshot()};};
  const observeResources=list=>{for(const r of list.getEntries()){
    if(!active||r.startTime<active.at)continue;let u;try{u=new URL(r.name);}catch{continue;}
    if(u.origin!==location.origin||!u.pathname.endsWith('/__drive_media/'+encodeURIComponent(active.fileId)))continue;
    if(active.session!=null&&u.searchParams.get('mediaSession')!==String(active.session))continue;
    const v=active.resources;v.count++;if(r.responseStart>0){v.exposedCount++;const h=r.responseStart-r.startTime;active.headers=Math.max(active.headers??0,h);if(h>10000)active.headerOver10s=true;}
    v.encodedBytes+=Number(r.encodedBodySize)||0;
  }};
  const resourceObserver=new PerformanceObserver(observeResources);resourceObserver.observe({type:'resource'});
  const onFrame=(_,meta)=>{frame=null;if(done)return;tick();if(done)return;if(active){const a=active,s=q1Playback?.player?.stats?.(),mapping=s?.mapping;
    // General Q1/Q2 element clock is shifted: compare decoded source-relative time.
    const decoded=meta.mediaTime+(mapping?mapping.commonShift-mapping.sourceOrigin:0);
    const target=targetFor(a), targetOK=target==null||Math.abs(decoded-target)<=.25;
    const generationOK=target==null||!a.player||s?.generation!==a.before.generation;
    const playerTarget=mapping?mapping.targetSource-mapping.sourceOrigin:s?.target;
    const playerTargetOK=target==null||!a.player||Number.isFinite(playerTarget)&&Math.abs(playerTarget-target)<=.25;
    if(a.frameAt==null&&a.session!=null&&own(a)&&Number.isFinite(meta.mediaTime)&&meta.presentedFrames>0&&targetOK&&generationOK&&playerTargetOK){
      a.frameAt=performance.now();a.frameGeneration=s?.generation;a.frameSource=mediaSourceGeneration;
      a.safe.presentedFrames=n(meta.presentedFrames);a.safe.decodedSourceRelativeTime=n(decoded);a.safe.targetTime=n(target);
    }}frame=video.requestVideoFrameCallback(onFrame);};
  const tick=()=>{if(done)return;if(seekGesture&&performance.now()>seekGesture.until)seekGesture=null;if(!current()){if(active)save('SOURCE_OR_ACCOUNT_CHANGED');stop('SOURCE_OR_ACCOUNT_CHANGED');return;}
    if(active){const a=active,elapsed=performance.now()-a.at;
      const route=snapshot().route;if(route!=='unknown'&&a.routeHistory.at(-1)!==route&&a.routeHistory.length<8)a.routeHistory.push(route);
      if(a.session==null&&state.selected?.id===a.fileId&&isCurrentMediaEvent(video)) {a.session=state.mediaSession;a.source=mediaSourceGeneration;a.player=q1Playback?.player;}
      // Routing can legitimately hand native Q0 to Q1 before a decoded frame.
      if(a.session!=null&&state.selected?.id===a.fileId&&state.mediaSession===a.session){a.source=mediaSourceGeneration;a.player=q1Playback?.player;}
      a.hiddenDuring ||= document.visibilityState!=='visible';a.pausedDuring ||= video.paused;
      const s=q1Playback?.player?.stats?.();
      if(a.frameAt!=null&&(a.frameGeneration!==s?.generation||a.frameSource!==mediaSourceGeneration))save('FRAME_OWNER_CHANGED');
      else if(el.mediaError.hidden===false||state.mediaAttempt==='failed'||video.error){a.safe.mediaErrorCode=n(video.error?.code);save('MEDIA_FAILED');}
      else if(a.session!=null&&!own(a))save('OWNER_CHANGED');
      else if(a.frameAt!=null&&!video.seeking&&!state.isSeeking&&!mediaSeekWatchdog&&video.readyState>=2&&el.mediaLoading.hidden)save('TARGET_FRAME');
      else if(elapsed>=15000&&a.kind.startsWith('seek'))save('TARGET_FRAME_15S_TIMEOUT');
      else if(elapsed>=30000)save('INITIAL_30S_TIMEOUT');
      else if(elapsed>=15000&&!video.paused&&document.visibilityState==='visible')a.frameOver15s=true;
    }
    if(waitingClose&&performance.now()-closeAt>=2000){const s=snapshot();closes.push({...waitingClose,elapsedMs:n(performance.now()-closeAt),after:s,
      released:!s.selected&&!s.q0Owner&&!s.q1Owner&&!s.watchdog&&s.bufferedRanges===0&&!video.getAttribute('src')&&s.retirementSettled});waitingClose=null;closeAt=null;}
  };
  const listen=(node,type,fn)=>{node.addEventListener(type,fn,true);listeners.push([node,type,fn]);};
  function stop(code){if(done)return;if(active)save(code);done=true;clearInterval(interval);clearTimeout(finishTimer);clearTimeout(runTimer);
    if(frame!=null)video.cancelVideoFrameCallback(frame);frame=null;resourceObserver.disconnect();
    for(const [node,type,fn] of listeners)node.removeEventListener(type,fn,true);listeners.length=0;seekGesture=null;lastFailedStartup=null;privateFiles=null;candidates=null;pin=null;proof=null;account=null;accountKey=null;drive=null;
  }
  const censorFailedStartupSeek=()=>{
    const prior=rows.at(-1),failed=lastFailedStartup,p=plan[index],fresh=proof?.get?.();
    if(done||active||index>=plan.length||!failed||!p?.kind.startsWith('seek')||p.sample!==failed.sample
      ||failed.outcome!==index||prior?.kind!=='warm-startup'||prior.code!=='MEDIA_FAILED'||prior.decodedTarget
      ||!current()||fresh?.version!==binding.version||!['app.js','sw.js','version.json'].every(k=>fresh.sourceSHA256?.[k]===binding.sourceSHA256[k])
      ||document.visibilityState!=='visible'||state.authStatus!=='online'||!hasUsableToken()
      ||state.selected?.id!==failed.fileId||state.mediaSession!==failed.session||mediaSourceGeneration!==failed.source
      ||q1Playback?.player!==failed.player||state.mediaAttempt!=='failed'||el.mediaError.hidden!==false
      ||video.readyState!==0||Number.isFinite(video.duration)&&video.duration>0)throw Error('QA_CENSOR_PREFLIGHT');
    const s=snapshot();
    rows.push({attempt:null,plannedOutcome:index+1,sample:p.sample,kind:p.kind,actualAttempt:false,
      code:'UNATTEMPTED_FAILED_STARTUP',censored:true,reason:'CURRENT_FAILED_STARTUP_HAS_NO_SEEKABLE_MEDIA',
      sizeBand:prior.sizeBand,extension:prior.extension,cache:'current-owner',network:prior.network,
      startVisible:true,trusted:false,elapsedMs:null,firstFrameMs:null,decodedTarget:false,
      targetPercent:Number(p.kind.slice(4)),headerOver10s:false,headerUnknown:true,headersMs:null,
      frameOver15s:false,hiddenDuring:false,pausedDuring:video.paused,resources:null,
      route:s.route==='unknown'?prior.route:s.route,routeHistory:[],ownerCurrent:false,
      priorStartupPlannedOutcome:failed.outcome,sourceProofCurrent:true,before:s,after:{...s}});
    index++;lastFailedStartup=null;seekGesture=null;
    if(index===plan.length)finishTimer=setTimeout(()=>stop('SIX_CONTINUATION_OUTCOMES_FINISHED'),30000);
    return {recorded:true,plannedOutcome:index,code:'UNATTEMPTED_FAILED_STARTUP',outcomeCount:rows.length,
      actualAttemptCount:rows.filter(r=>r.actualAttempt!==false).length};
  };
  const safe=()=>({schema:continuation.schema,binding,done,priorPartialSHA256:continuation.priorPartialSHA256,originalPlanRemainsIncomplete:true,continuedSamples:[9,10],originalIdentityKnown:false,sampleNumbersAreBookkeeping:true,
    attemptCount:rows.filter(r=>r.actualAttempt!==false).length,actualAttemptCount:rows.filter(r=>r.actualAttempt!==false).length,
    outcomeCount:rows.length,requiredOutcomes:plan.length,requiredAttempts:plan.length,requiredStartupAttempts:4,requiredPausedSeekAttempts:2,
    requestedStartupCount:4,requestedSeekCount:2,
    actualStartupAttemptCount:rows.filter(r=>r.actualAttempt!==false&&r.kind.endsWith('startup')).length,
    actualSeekAttemptCount:rows.filter(r=>r.actualAttempt!==false&&r.kind.startsWith('seek')).length,
    unattemptedCensoredCount:rows.filter(r=>r.actualAttempt===false).length,
    observerReleased:done&&frame===null&&listeners.length===0,closes:closes.map(x=>({...x})),rows:rows.map(x=>({...x})),
    planComplete:done&&rows.length===plan.length,complete:done&&rows.length===plan.length&&rows.every(r=>r.actualAttempt!==false),scope:'actual-PC only when run there; preparation is synthetic verification only',
    limitations:['Available rendered library metadata only; no complete-corpus/format mapping.','Cold/warm cache validity unknown; no cold/warm acceptance from reopen labels.','Resource Timing may hide headers/bytes and excludes service-worker upstream requests.','Heap values are optional renderer JS estimates, not whole Chrome/native/WASM memory.','Independent continuation selects2 additional current rendered representative videos and plans4 startup and2 paused seek outcomes; samples9/10 are bookkeeping labels, original identity is unknown, and this cannot complete or relabel the prior incomplete30 plan; unattempted seeks remain censored outcomes and do not meet actual attempt counts. Each route/condition can have fewer than 20.']});
  window.__rc25PerformanceQA={read:safe,next:()=>{if(done||index>=plan.length)return null;const p=plan[index],f=privateFiles[p.sample-9];
    const card=[...document.querySelectorAll('.file-card')].find(x=>x.dataset.fileId===f.id),r=card?.getBoundingClientRect();
    return {...p,attempt:rows.filter(r=>r.actualAttempt!==false).length+1,plannedOutcome:index+1,active:Boolean(active),sizeBand:band(f.size),extension:extension(f),cardVisible:Boolean(r&&r.top>=0&&r.bottom<=innerHeight),rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};},
    censorFailedStartupSeek,
    clear:()=>{stop('MANUAL_CLEAR');return safe();}};
  listen(document,'click',begin);listen(document,'pointerdown',begin);listen(document,'pointerup',pointerEnd);listen(document,'pointercancel',pointerEnd);listen(document,'click',close);listen(document,'keydown',close);
  listen(document,'pointermove',e=>{if(seekGesture&&!gestureMatches(e))seekGesture=null;});
  listen(document,'visibilitychange',()=>{seekGesture=null;});listen(window,'blur',e=>{if(e.target===window)seekGesture=null;});
  listen(video,'error',()=>{if(active)save('MEDIA_FAILED');});listen(window,'pagehide',()=>stop('PAGE_HIDDEN_OR_UNLOAD'));
  interval=setInterval(tick,100);frame=video.requestVideoFrameCallback(onFrame);runTimer=setTimeout(()=>stop('RUN_15MIN_TIMEOUT'),15*60*1000);
  return {armed:true,requiredAttempts:plan.length,requiredStartupAttempts:4,requiredPausedSeekAttempts:2,selectedSamples:2,availableRenderedVideoMetadata:availableCount,fullCorpusMapping:false};
}
