(proof)=>(function (binding, proof) {
  'use strict';
  if (window.__driveNightRenewal) throw Error('OBSERVER_EXISTS');
  const pin = proof?.get?.();
  if (!binding || pin?.sourceCommit !== binding.sourceCommit || pin?.version !== binding.version
    || ['app.js', 'sw.js', 'version.json'].some(k => pin?.sourceSHA256?.[k] !== binding.sourceSHA256[k])
    || APP_VERSION !== binding.version || location.origin !== 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    || !state.selected || !q1Playback || el.videoPlayer.readyState < 2 || el.videoPlayer.paused
    || !el.mediaLoading.hidden || !el.mediaError.hidden || !hasUsableToken()) throw Error('BASELINE_NOT_READY');
  let owner = {account:state.accountId,key:state.authAccountKey,file:state.selected.id,version:state.selected.version,
    size:state.selected.size,session:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,
    controller:navigator.serviceWorker.controller,q1:q1Playback,drive:state.driveSessionGeneration};
  const video=el.videoPlayer,oldExpiry=state.expiresAt,start=Date.now(),initialRevision=state.tokenRevision;
  if (oldExpiry <= start || oldExpiry-start > 720000) throw Error('NATURAL_WINDOW_NOT_READY');
  const result={schema:'drive-original.natural-renewal-observer/2',version:APP_VERSION,source:binding.sourceCommit,
    startedAt:new Date(start).toISOString(),oldExpiry:new Date(oldExpiry).toISOString(),baselineSecondsToExpiry:Math.round((oldExpiry-start)/1000),
    scope:'Actual desktop Chrome ongoing Q1 across natural credential renewal; passive source/owner/frame/status journal',
    loopChanged:false,volumeChanged:false,credentialForced:false,complete:false,phase:'collecting',
    renewals:[],samples:[],events:[],credentialRequests:[],failures:[],fenceMismatches:[],uiEvents:[],uiEventCounts:{},frames:0,afterOldExpiryFrames:0,maxFrameGapMs:0,
    frameDeadlineMs:15000,runDeadlineMs:900000,postExpiryObservationMs:120000};
  let interval=null,frameId=null,frameTimeout=null,lastRevision=initialRevision,done=false,lastSampleAt=0,lastFrameAt=start;
  const nativeFetch=window.fetch,bodyReaders=new Set();
  const fenceStatus=()=>owner?{account:state.accountId===owner.account,accountKey:state.authAccountKey===owner.key,
    file:state.selected?.id===owner.file,contentVersion:state.selected?.version===owner.version,contentSize:state.selected?.size===owner.size,
    mediaSession:state.mediaSession===owner.session,playbackSession:state.playbackSession===owner.playback,sourceGeneration:mediaSourceGeneration===owner.source,
    controller:navigator.serviceWorker.controller===owner.controller,q1Owner:q1Playback===owner.q1,driveGeneration:state.driveSessionGeneration===owner.drive,
    ownerNotAborted:!owner.q1.controller.signal.aborted,currentMediaEvent:isCurrentMediaEvent(video)}:{owner:false};
  const stable=()=>Object.values(fenceStatus()).every(Boolean);
  const fixedCode=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(v)?v:null;
  function terminal(){
    let stats=null;try{stats=owner?.q1?.player?.stats?.();}catch{}
    return {time:video.currentTime,ready:video.readyState,paused:video.paused,loading:!el.mediaLoading.hidden,error:!el.mediaError.hidden,
      nativeErrorCode:video.error?.code??null,q1Failure:fixedCode(stats?.failure?.code??stats?.failure),
      credentialRevisionDelta:state.tokenRevision-initialRevision,authStatus:['online','auth-unavailable','anonymous','reconnect-required'].includes(state.authStatus)?state.authStatus:'unknown'};
  }
  function release(){
    clearInterval(interval);clearTimeout(frameTimeout);
    if(frameId!==null)video.cancelVideoFrameCallback(frameId);frameId=null;
    for(const [name,fn]of handlers)video.removeEventListener(name,fn);for(const [name,fn]of uiHandlers)document.removeEventListener(name,fn,true);result.uiListenersRemoved=true;
    if(window.fetch===observingFetch)window.fetch=nativeFetch;
    for(const reader of bodyReaders)void reader.cancel().catch(()=>{});
    bodyReaders.clear();owner=null;proof=null;done=true;result.released=true;result.fetchWrapperRestored=window.fetch===nativeFetch;
  }
  function fail(code){result.fenceMismatches=Object.entries(fenceStatus()).filter(([,matched])=>!matched).map(([name])=>name);if(!result.failures.includes(code))result.failures.push(code);result.terminal=terminal();result.phase='failed';release();}
  function observeErrorBody(response,record){
    if(!response.headers.get('Content-Type')?.toLowerCase().includes('application/json'))return;
    let reader;try{reader=response.clone().body?.getReader();}catch{return;}if(!reader)return;
    bodyReaders.add(reader);let deadline=setTimeout(()=>void reader.cancel().catch(()=>{}),2000);
    void(async()=>{let text='',size=0;const decoder=new TextDecoder();try{
      for(;;){const chunk=await reader.read();if(done)return;if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)return;text+=decoder.decode(chunk.value,{stream:true});}
      const payload=JSON.parse(text+decoder.decode()),code=payload?.error?.code;
      if(!done&&typeof code==='string'&&AUTH_ERROR_CODES.has(code))record.code=code;
    }catch{}finally{clearTimeout(deadline);bodyReaders.delete(reader);try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}})();
  }
  function observingFetch(...args){
    let credential=false;try{const u=new URL(typeof args[0]==='string'||args[0] instanceof URL?args[0]:args[0].url,location.href);credential=u.origin===location.origin&&u.pathname===AUTH_CREDENTIAL_PATH;}catch{}
    if(!credential||done)return nativeFetch.apply(this,args);
    const at=Date.now(),record={elapsedMs:at-start,status:null,code:null,networkError:null};
    if(result.credentialRequests.length<64)result.credentialRequests.push(record);
    return nativeFetch.apply(this,args).then(response=>{if(!done){record.durationMs=Date.now()-at;record.status=response.status;if(!response.ok)observeErrorBody(response,record);}return response;},error=>{if(!done){record.durationMs=Date.now()-at;record.networkError=['AbortError','TimeoutError','TypeError'].includes(error?.name)?error.name:'unknown';}throw error;});
  }
  const handlers=['pause','playing','seeking','seeked','ended','error','waiting','stalled'].map(name=>[name,()=>{
    if(result.events.length<100)result.events.push({event:name,elapsedMs:Date.now()-start,time:video.currentTime,ready:video.readyState});
  }]);for(const [name,fn]of handlers)video.addEventListener(name,fn);

  const uiHandlers=[];
  const uiZone=target=>{
    if(!target||typeof target.closest!=='function')return 'other';
    if([el.topbarPrevBtn,el.topbarRandomBtn,el.topbarNextBtn,el.ctrlPrevVideo,el.ctrlNextVideo,el.ctrlRandomShorts].some(n=>n?.contains(target)))return 'player-navigation';
    if(el.playerControlsEntry?.contains(target)||el.hidePlayerControlsButton?.contains(target)||el.customVideoControls?.contains(target)||el.mobileShortsOverlay?.contains(target)||el.closePlayerButton?.contains(target)||target.closest('#playerMoreMenu'))return 'player-controls';
    if(el.mediaStage?.contains(target))return 'player-stage';
    if(target.closest('.file-card'))return 'library-card';
    if(el.libraryView?.contains(target))return 'library-other';
    return 'other';
  };
  for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel','click','keydown']){
    const fn=event=>{if(done||event.isTrusted!==true)return;try{const key=type==='keydown'?(new Map([['ArrowLeft','ArrowLeft'],['ArrowRight','ArrowRight'],['ArrowUp','ArrowUp'],['ArrowDown','ArrowDown'],['Escape','Escape'],['Enter','Enter'],[' ','Space']]).get(event.key)??null):null;
      result.uiEventCounts[type]=Math.min(1000000,(result.uiEventCounts[type]||0)+1);
      result.uiEvents.push({elapsedMs:Date.now()-start,type,zone:uiZone(event.target),trusted:true,...(type==='keydown'?{key}: {})});
      if(result.uiEvents.length>128)result.uiEvents.shift();
    }catch{}};
    document.addEventListener(type,fn,{capture:true,passive:true});uiHandlers.push([type,fn]);
  }
  function tick(){
    if(done)return;if(!stable())return fail('OWNER_CHANGED');if(document.visibilityState!=='visible')return fail('PAGE_NOT_VISIBLE');
    if(Date.now()-start>900000)return fail('BOUNDED_TIMEOUT');if(!el.mediaError.hidden)return fail('PLAYER_ERROR');
    if(video.paused||video.ended)return fail(video.ended?'UNEXPECTED_END':'UNEXPECTED_PAUSE');
    if(state.tokenRevision!==lastRevision){result.renewals.push({elapsedMs:Date.now()-start,revisionDelta:state.tokenRevision-initialRevision,expiryAdvanced:state.expiresAt>oldExpiry,accountStable:true,sourceStable:true});lastRevision=state.tokenRevision;}
    if(frameId!==null)return;
    frameId=video.requestVideoFrameCallback((now,frame)=>{
      frameId=null;clearTimeout(frameTimeout);if(done)return;if(!stable())return fail('FRAME_OWNER_CHANGED');
      const at=Date.now();if(at-lastFrameAt>15000)return fail('FRAME_TIMEOUT');result.maxFrameGapMs=Math.max(result.maxFrameGapMs,at-lastFrameAt);lastFrameAt=at;
      result.frames++;if(at>oldExpiry)result.afterOldExpiryFrames++;
      if(at-lastSampleAt>=10000){lastSampleAt=at;result.samples.push({elapsedMs:at-start,mediaTime:frame.mediaTime,presentedFrames:frame.presentedFrames,
        ready:video.readyState,paused:video.paused,loading:!el.mediaLoading.hidden,error:!el.mediaError.hidden,width:video.videoWidth,height:video.videoHeight,
        credentialRevisionDelta:state.tokenRevision-initialRevision,driveGenerationChanged:state.driveSessionGeneration!==owner.drive,ownerStable:true,afterOldExpiry:at>oldExpiry});}
      if(at>oldExpiry+120000&&result.afterOldExpiryFrames>=10){result.complete=result.renewals.some(x=>x.expiryAdvanced&&x.revisionDelta>0)&&result.failures.length===0;
        result.phase=result.complete?'completed':'failed';result.terminal=terminal();if(!result.complete)result.failures.push('RENEWAL_NOT_OBSERVED');release();}
    });
    frameTimeout=setTimeout(()=>{if(done)return;video.cancelVideoFrameCallback(frameId);frameId=null;fail('FRAME_TIMEOUT');},Math.max(0,15000-(Date.now()-lastFrameAt)));
  }
  window.fetch=observingFetch;
  window.__driveNightRenewal=Object.freeze({read:()=>JSON.parse(JSON.stringify({...result,done})),stop:()=>{if(!done){result.terminal=terminal();result.phase='stopped';release();}return JSON.parse(JSON.stringify({...result,done}));}});
  interval=setInterval(tick,1000);tick();return window.__driveNightRenewal.read();
}
)({"sourceCommit":"944f00607cf05e586b1c88e2876dd796ce114e82","version":"1.22.0-rc.28","sourceSHA256":{"app.js":"2dbba4ed225a867cc9024c2400242975317855bcf03acebc73df4c0dc1c84377","sw.js":"22e01aebb62f35033560fe9edc5696b8b797e9c8b3f26bdda4606c2e19761518","version.json":"1de99c21f5d32cb36f0396ea823a2885f981fc60b11720fb52f240c268745f1b"}},proof)
