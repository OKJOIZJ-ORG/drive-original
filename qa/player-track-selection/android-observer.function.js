function installAndroidTracksObserver(options) {
  'use strict';
  const {origin,version,fixtureId}=options;
  if(location.origin!==origin||APP_VERSION!==version||window.__androidTracksObserver)throw Error('OBSERVER_ADMISSION');
  const n=x=>Number.isFinite(x)?x:null,phases=[],events=[];let phase=null,frameVideo=null,frameId=null,disposed=false,timer=null;
  const started=Date.now(),account='android-tracks-synthetic-account',auth=()=>state.authAccountKey===account&&state.driveSessionGeneration===1;
  const stats=()=>q1Playback?.player?.stats?.(),video=()=>getActiveMediaElement();
  const fence=()=>location.origin===origin&&APP_VERSION===version&&window.__androidTracksMockOwned===true&&state.selected?.id===fixtureId&&auth()&&document.visibilityState==='visible';
  function sample(){const v=video(),s=stats(),timeline=playerTimeline(),track=playerTracksOwner,mapping=s?.mapping;
    const absolute=q1Playback?.kind==='general'?q1Playback.player.sourceTime():v?.currentTime;
    const cues=list=>[...list??[]].slice(0,8).map(c=>({start:n(c.startTime),end:n(c.endTime),syntheticText:c.text==='SYNTHETIC SUBTITLE'}));
    return{at:Date.now(),fence:fence(),version:APP_VERSION,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
      nativeOwnerCurrent:!!v&&isCurrentMediaEvent(v),session:n(state.mediaSession),sourceGeneration:n(mediaSourceGeneration),generation:n(s?.generation),
      q1Present:!!q1Playback,q0Present:!!q0Playback,route:q1Playback?.kind==='general'?'Q1_GENERAL':q0Playback?'Q0':'OTHER',
      paused:!!v?.paused,ready:n(v?.readyState),time:n(v?.currentTime),clock:n(timeline.currentTime),duration:n(timeline.duration),absoluteSourceTime:n(absolute),
      sourceOrigin:n(mapping?.sourceOrigin),clockShift:n(v?.currentTime-absolute),widthVideo:n(v?.videoWidth),heightVideo:n(v?.videoHeight),decoded:n(v?.getVideoPlaybackQuality?.().totalVideoFrames),errorCode:n(v?.error?.code),
      failure:typeof s?.failure==='string'&&/^[A-Z_]+$/.test(s.failure)?s.failure:null,
      selectedAudio:n(track?.selectedAudioTrackId),q1SelectedAudio:n(q1Playback?.selectedAudioTrackId),pipelineSelectedAudio:n(s?.pipeline?.selectedAudioTrackId),
      switching:track?.switching===true,tracksCurrent:track?.current()===true,subtitleSelected:n(track?.subtitles?.selectedTrackId),
      inventoryAudio:track?.inventory?.audioTracks?.slice(0,8).map(t=>({id:n(t.trackId),codec:t.codec==='aac'?'aac':'other',route:['q1','q2','unqualified'].includes(t.route)?t.route:'other'}))??[],
      inventorySubtitle:track?.subtitles?.tracks?.slice(0,8).map(t=>({id:n(t.trackId),supported:t.supported===true}))??[],
      dialogOpen:el.playerTracksDialog.open,audioValue:el.playerAudioTrack.value===''?null:n(Number(el.playerAudioTrack.value)),subtitleValue:el.playerSubtitleTrack.value===''?null:n(Number(el.playerSubtitleTrack.value)),
      textMode:['disabled','hidden','showing'].includes(playerSubtitleTextTrack?.mode)?playerSubtitleTextTrack.mode:null,cues:cues(playerSubtitleTextTrack?.cues),activeCues:cues(playerSubtitleTextTrack?.activeCues),
      closed:el.playerSheet.hidden,tracksPresent:!!track,blobPresent:!!state.mediaBlobUrl,srcPresent:!!el.videoPlayer.hasAttribute('src'),
      q1Retired:q1RetirementResult?.settled===true,tracksRetired:playerTracksRetirementResult?.settled===true};
  }
  const event=e=>{if(events.length<128)events.push({type:e.type,at:Date.now(),trusted:e.isTrusted===true});};
  const names=['loadeddata','playing','pause','seeking','seeked','timeupdate','ended','error'];
  function detach(){if(frameVideo){if(frameId!==null)frameVideo.cancelVideoFrameCallback?.(frameId);for(const name of names)frameVideo.removeEventListener(name,event);}frameId=null;frameVideo=null;}
  function attach(){const v=video();if(v===frameVideo)return;detach();if(!v?.requestVideoFrameCallback)return;frameVideo=v;for(const name of names)v.addEventListener(name,event);
    const callback=(_,m)=>{frameId=null;if(disposed||frameVideo!==v)return;const s=sample(),st=stats(),mapping=st?.mapping,shift=n(mapping?.commonShift-mapping?.sourceOrigin)??0,clock=m.mediaTime+shift;
      if(phase){const advanced=(q1Playback||q0Playback)!==phase.owner||state.mediaSession!==phase.session||mediaSourceGeneration!==phase.sourceGeneration||st?.generation!==phase.generation;
        const good=s.fence&&video()===v&&isCurrentMediaEvent(v)&&!q1Playback?.controller?.signal?.aborted&&!st?.disposed&&!s.failure&&m.width>0&&m.height>0&&(!phase.requireAdvance||advanced)&&(!phase.requireAudio3||(s.route==='Q1_GENERAL'&&s.q1SelectedAudio===3));
        const distance=Math.abs(clock-phase.target),row={elapsedMs:Date.now()-phase.at,clock:n(clock),distance:n(distance),width:n(m.width),height:n(m.height),advanced,good,generation:s.generation};
        if(phase.frames.length<32)phase.frames.push(row);if(good&&distance<=phase.tolerance&&!phase.first)phase.first=row;
      }frameId=v.requestVideoFrameCallback(callback);};frameId=v.requestVideoFrameCallback(callback);
  }
  function tick(){if(disposed)return;attach();if(phase&&phase.samples.length<64)phase.samples.push(sample());if(Date.now()-started>180000)stop();}
  function arm(label,{target=0,tolerance=.3,requireAdvance=false,requireAudio3=false}={}){if(disposed||phases.length>=6||!['startup','audio3','seek2','seek5_5','seek2-return'].includes(label)||!Number.isFinite(target)||target<0)throw Error('PHASE_ADMISSION');
    phase={label,at:Date.now(),target,tolerance:Math.max(.05,Math.min(3,tolerance)),requireAdvance,requireAudio3,owner:q1Playback||q0Playback,session:state.mediaSession,sourceGeneration:mediaSourceGeneration,generation:stats()?.generation,frames:[],samples:[],first:null};phases.push(phase);tick();return{armed:true,label,target};}
  function read(){tick();return{elapsedMs:Date.now()-started,disposed,latest:sample(),phases:phases.map(({owner,...p})=>p),events,rawIdentifiersExported:false,exactAudioFidelity:'NOT_TESTED',physicalPhoneClaim:false};}
  function stop(){if(disposed)return{stopped:true};disposed=true;clearInterval(timer);detach();for(const p of phases)p.owner=null;return{stopped:true,frameRemoved:true,listenersRemoved:true,timerRemoved:true};}
  timer=setInterval(tick,250);window.__androidTracksObserver=Object.freeze({arm,read,stop});tick();return{installed:true,boundMs:180000,eventCap:128,frameCap:32,sampleCap:64};
}
