function(binding, proof) {
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
  let privateFiles=[...groups.values()].slice(0,10);
  if(privateFiles.length<10)for(const f of candidates)if(!privateFiles.some(x=>x.id===f.id)&&privateFiles.length<10)privateFiles.push(f);
  if(privateFiles.length!==10)throw Error('QA_TEN_AVAILABLE_VIDEOS_REQUIRED');
  const availableCount=candidates.length;groups.clear();cardIds.clear();
  const plan=[];for(let i=0;i<10;i++)for(const kind of ['first-startup','warm-startup','seek'+[10,50,90][i%3]])plan.push({sample:i+1,kind});
  const rows=[], closes=[], listeners=[];let active=null, index=0, interval=null, frame=null, done=false;
  let finishTimer=null, waitingClose=null, closeAt=null,runTimer=null;
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
  const save=code=>{if(!active)return;const a=active;active=null;
    const end=snapshot();rows.push({...a.safe,code,elapsedMs:n(performance.now()-a.at),firstFrameMs:n(a.frameAt==null?NaN:a.frameAt-a.at),
      decodedTarget:a.frameAt!=null,headerOver10s:a.headerOver10s,headerUnknown:a.headers===null,
      frameOver15s:a.frameOver15s,hiddenDuring:a.hiddenDuring,pausedDuring:a.pausedDuring,
      headersMs:a.headers,resources:a.resources,route:end.route==='unknown'?(a.routeHistory.at(-1)??'unknown'):end.route,
      routeHistory:[...a.routeHistory],ownerCurrent:a.session!=null&&own(a),before:a.before,after:end});
    index++;if(index===30)finishTimer=setTimeout(()=>stop('THIRTY_ATTEMPTS_FINISHED'),30000);
  };
  const begin=e=>{
    if(done||!e.isTrusted||index>=30)return;
    if(active){if(e.target?.closest?.('.file-card-open')||[el.seekBarContainer,el.mobileShortsProgressTrack].some(t=>t?.contains(e.target)))save('EXTRA_INPUT');return;}
    const p=plan[index],f=privateFiles[p.sample-1];
    const card=e.target?.closest?.('.file-card-open')?.closest?.('.file-card');
    const track=[el.seekBarContainer,el.mobileShortsProgressTrack].find(t=>t?.contains(e.target));
    if(p.kind.endsWith('startup')){if(e.type!=='click'||card?.dataset.fileId!==f.id||state.selected)return;}
    else {if(e.type!=='pointerdown'||!track||state.selected?.id!==f.id||!video.paused)return;
      const r=track.getBoundingClientRect(),ratio=(e.clientX-r.left)/r.width;
      if(Math.abs(ratio-Number(p.kind.slice(4))/100)>.015)return;}
    const net=navigator.connection;
    active={kind:p.kind,fileId:f.id,at:performance.now(),session:null,source:null,player:null,frameAt:null,headers:null,
      headerOver10s:false,frameOver15s:false,hiddenDuring:false,pausedDuring:false,routeHistory:[],resources:{count:0,exposedCount:0,encodedBytes:0},before:snapshot(),
      safe:{attempt:index+1,sample:p.sample,kind:p.kind,sizeBand:band(f.size),extension:extension(f),
        cache:p.kind==='first-startup'?'first-open-cache-unknown':p.kind==='warm-startup'?'same-file-reopen-cache-unknown':'current-owner',
        network:{online:navigator.onLine,effectiveType:['slow-2g','2g','3g','4g'].includes(net?.effectiveType)?net.effectiveType:null,rtt:n(net?.rtt),downlink:n(net?.downlink),saveData:Boolean(net?.saveData)},
        startVisible:document.visibilityState==='visible',trusted:true}};
    if(p.kind.startsWith('seek')&&Math.abs(playerTimeline(video).currentTime-targetFor(active))<=.25)save('TARGET_ALREADY_CURRENT');
  };
  const close=e=>{if(!e.isTrusted||!state.selected)return;
    if(!(e.type==='keydown'&&e.key==='Escape')&&!(e.type==='click'&&el.closePlayerButton?.contains(e.target)))return;
    if(active)save('CLOSED_BEFORE_TARGET');closeAt=performance.now();waitingClose={sample:privateFiles.findIndex(f=>f.id===state.selected.id)+1,before:snapshot()};};
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
  const tick=()=>{if(done)return;if(!current()){if(active)save('SOURCE_OR_ACCOUNT_CHANGED');stop('SOURCE_OR_ACCOUNT_CHANGED');return;}
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
    for(const [node,type,fn] of listeners)node.removeEventListener(type,fn,true);listeners.length=0;privateFiles=null;candidates=null;pin=null;proof=null;account=null;accountKey=null;drive=null;
  }
  const safe=()=>({schema:'drive-original.rc25-performance-passive/1',binding,done,attemptCount:rows.length,requiredAttempts:30,requiredStartupAttempts:20,requiredPausedSeekAttempts:10,
    observerReleased:done&&frame===null&&listeners.length===0,closes:closes.map(x=>({...x})),rows:rows.map(x=>({...x})),
    complete:done&&rows.length===30,scope:'actual-PC only when run there; preparation is synthetic verification only',
    limitations:['Available rendered library metadata only; no complete-corpus/format mapping.','Cold/warm cache validity unknown; no cold/warm acceptance from reopen labels.','Resource Timing may hide headers/bytes and excludes service-worker upstream requests.','Heap values are optional renderer JS estimates, not whole Chrome/native/WASM memory.','Ten metadata-selected files with 20 startup and 10 paused seek attempts are a starting distribution; each route/condition can have fewer than 20.']});
  window.__rc25PerformanceQA={read:safe,next:()=>{if(done||index>=30)return null;const p=plan[index],f=privateFiles[p.sample-1];
    const card=[...document.querySelectorAll('.file-card')].find(x=>x.dataset.fileId===f.id),r=card?.getBoundingClientRect();
    return {...p,attempt:index+1,active:Boolean(active),sizeBand:band(f.size),extension:extension(f),cardVisible:Boolean(r&&r.top>=0&&r.bottom<=innerHeight),rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};},
    clear:()=>{stop('MANUAL_CLEAR');return safe();}};
  listen(document,'click',begin);listen(document,'pointerdown',begin);listen(document,'click',close);listen(document,'keydown',close);
  listen(video,'error',()=>{if(active)save('MEDIA_FAILED');});listen(window,'pagehide',()=>stop('PAGE_HIDDEN_OR_UNLOAD'));
  interval=setInterval(tick,100);frame=video.requestVideoFrameCallback(onFrame);runTimer=setTimeout(()=>stop('RUN_15MIN_TIMEOUT'),15*60*1000);
  return {armed:true,requiredAttempts:30,requiredStartupAttempts:20,requiredPausedSeekAttempts:10,selectedSamples:10,availableRenderedVideoMetadata:availableCount,fullCorpusMapping:false};
}
