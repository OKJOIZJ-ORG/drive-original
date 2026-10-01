(function installQ3ActualReplay(binding) {
  'use strict';
  const fail = code => { throw Error(code); };
  if (window.__q3ActualReplay33) fail('REPLAY_ALREADY_INSTALLED');
  const holder = window.__q3ActualTarget33;
  const target = holder?.metadata || holder?.target || holder?.file || holder;
  if (!target || typeof target.id !== 'string' || !target.id || typeof target.name !== 'string'
      || !Number.isSafeInteger(Number(target.size)) || Number(target.size) <= 0) fail('PRIVATE_TARGET_REQUIRED');
  const account = holder?.account || (holder?.accountId && holder?.authAccountKey
    ? { accountId: holder.accountId, authAccountKey: holder.authAccountKey }
    : { accountId: state.accountId, authAccountKey: state.authAccountKey });
  const controller = navigator.serviceWorker.controller;
  const proof = () => window.__resumeSwProof?.get();
  const pinned = () => {
    const p = proof();
    return !!p && APP_VERSION === binding.version && p.version === binding.version
      && p.sourceCommit === binding.sourceCommit && p.controller === controller && navigator.serviceWorker.controller === controller
      && controller?.state === 'activated'
      && Object.keys(binding.sourceSHA256).every(k => p.sourceSHA256?.[k] === binding.sourceSHA256[k]);
  };
  const authGeneration=state.authGeneration, driveGeneration=state.driveSessionGeneration;
  const accountSame = () => state.accountId === account.accountId && state.authAccountKey === account.authAccountKey
    && state.authGeneration === authGeneration && state.driveSessionGeneration === driveGeneration;
  if (!pinned() || !accountSame() || !account.authAccountKey || state.authStatus !== 'online'
      || document.visibilityState !== 'visible') fail('REPLAY_PREFLIGHT');
  const stableKeys = ['id', 'name', 'size', 'mimeType', 'modifiedTime'];
  const freshKeys = ['version', 'headRevisionId', 'sha256Checksum', 'md5Checksum'];
  const parentsEqual = (a, b) => Array.isArray(a) && Array.isArray(b)
    && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const stableMatch = f => !!f && stableKeys.every(k => target[k] == null
    || String(f[k]) === String(target[k])) && (!target.parents || parentsEqual(f.parents, target.parents));
  const freshMatch = f => freshKeys.every(k => target[k] == null || String(f[k]) === String(target[k]));
  const num = v => Number.isFinite(v) ? v : null;
  if (!/^\d+$/.test(String(target.version||'')) || target.sha256Checksum!==binding.fixture.sha256 || Number(target.size)!==binding.fixture.bytes) fail('STRONG_FIXTURE_REFERENCE_REQUIRED');
  const fixed = v => typeof v === 'string' && /^(?:Q3|Q1|Q0|GENERAL|SEEK|BOOTSTRAP|WORKER|BUFFER_WINDOW)_[A-Z_]+$/.test(v) ? v : null;
  const finiteFields = (object, keys) => Object.fromEntries(keys.map(k => [k, num(object?.[k])]));
  const ranges = v => Array.from({ length: Math.min(v?.buffered?.length || 0, 8) }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]);
  const shown = element => {
    if (!element) return { hidden: true, height: 0, visible: false };
    const r = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { hidden: !!element.hidden, height: num(r.height), visible: !element.hidden && r.height > 0
      && style.display !== 'none' && style.visibility !== 'hidden' };
  };
  const phases = [], events = [], metadataResults = [], retainedMetricOwners = [], nativeErrors = [], choices = [];
  function nativeError(e){const d=q0PinnedSource?.descriptor;if(nativeErrors.length<8)nativeErrors.push({at:Date.now(),trusted:!!e.isTrusted,code:num(e.target?.error?.code),sourceSame:pinned(),accountSame:accountSame(),targetSame:stableMatch(state.selected),nativeOwner:!!q0Playback,nativePinSame:!!d&&d.fileId===target.id&&d.accountKey===account.authAccountKey&&d.accountGeneration===driveGeneration&&['headRevisionId','size','mimeType','modifiedTime','sha256Checksum'].every(k=>target[k]==null||String(d[k])===String(target[k])),transportVerified:state.mediaTransportVerified===true,session:num(state.mediaSession),sourceGeneration:num(mediaSourceGeneration)});}
  function choiceEvent(e){if(choices.length<8)choices.push({at:Date.now(),trusted:!!e.isTrusted,sourceSame:pinned(),accountSame:accountSame(),targetSame:stableMatch(state.selected),choiceCurrent:q3Choice?.current?.()===true,explicitLossyChoice:!el.videoCompatButton.hidden});}
  el.videoPlayer.addEventListener('error',nativeError,true);el.videoCompatButton.addEventListener('click',choiceEvent,true);
  let metricOwnerOverflow=false;
  const sourceFields=['readsStarted','readsCompleted','metadataRequests','rangeRequests','receivedBytes','releasedBytes','cacheHits','cacheBytes','logicalReturnedBytes'];
  function metricValues(s){return {...finiteFields(s?.source,sourceFields),probeRetainedBytes:num(s?.probeRetention?.retainedBytes),probePeakRetainedBytes:num(s?.probeRetention?.peakRetainedBytes),probeMaxRetainedBytes:num(s?.probeRetention?.maxRetainedBytes)};}
  function retainMetricOwner(){
    const s=stats(),v=video(),f=fence(),owner=q1Playback;
    if(!s||(owner?.kind!=='general'||s.status?.level!=='Q3')||!v||!isCurrentMediaEvent(v)||!f.sourceSame||!f.accountSame||!f.targetSame||!f.selectedFreshSameWhenKnown||f.q1Aborted||s.disposed)return;
    if(retainedMetricOwners.some(x=>x.owner===owner&&x.state===s))return;
    if(retainedMetricOwners.length>=6){metricOwnerOverflow=true;return;}
    retainedMetricOwners.push({owner,state:s,phase:phase?.label||null,generation:num(s.generation),session:num(state.mediaSession),sourceGeneration:num(mediaSourceGeneration),
      ownerAtAdmission:{sourceSame:f.sourceSame,accountSame:f.accountSame,targetSame:f.targetSame,selectedFreshSameWhenKnown:f.selectedFreshSameWhenKnown,nativeOwnerCurrent:true,controllerNotAborted:true}});
  }
  function captureMetrics(label='live'){
    if(!['live','preclose-eof','postclose-eof','preclose-reopen','postclose-reopen','cleanup'].includes(label))fail('METRIC_LABEL');
    if(!disposed)retainMetricOwner();
    const currentFence={...fence(),nativeOwnerCurrent:!!video()&&isCurrentMediaEvent(video())};
    if(label.startsWith('preclose-')){const x=retainedMetricOwners.find(x=>q1Playback===x.owner&&stats()===x.state);if(x)x.ownerBeforeClose={...currentFence};}
    return {label,at:Date.now(),ownerLimit:6,ownerOverflow:metricOwnerOverflow,scope:'public Q1 source stats only; retired generations cannot qualify frames',owners:retainedMetricOwners.map((x,i)=>({ordinal:i+1,phase:x.phase,generation:x.generation,session:x.session,sourceGeneration:x.sourceGeneration,ownerAtAdmission:x.ownerAtAdmission,ownerBeforeClose:x.ownerBeforeClose||null,
      sameStateGeneration:x.state.generation===x.generation,currentOwner:q1Playback===x.owner&&stats()===x.state,disposed:x.state.disposed===true,
      sourceStatsPresent:!!x.state.source,retentionStatsPresent:!!x.state.probeRetention,values:metricValues(x.state.generation===x.generation?x.state:null)})),rawIdentifiersExported:false};
  }
  let phase = null, phasePrivate = null, interval = null, frameVideo = null, callbackId = null, disposed = false;
  const startedAt = Date.now(), maxTotalMs = 360000;
  const video = () => getActiveMediaElement();
  const stats = () => q1Playback?.player?.stats?.() || null;
  function fence() {
    const selected = state.selected;
    return { sourceSame: pinned(), accountSame: accountSame(), visible: document.visibilityState === 'visible',
      online: state.authStatus === 'online', targetSame: stableMatch(selected),
      selectedFreshKnown: !!selected && freshKeys.filter(k => target[k] != null).every(k => selected[k] != null),
      selectedFreshSameWhenKnown: !!selected && freshKeys.every(k => target[k] == null || selected[k] == null || String(selected[k]) === String(target[k])),
      q1Aborted: !!q1Playback?.controller?.signal?.aborted };
  }
  function sample() {
    const v = video(), s = stats(), f = fence(), quality = v?.getVideoPlaybackQuality?.();
    const pipeline = s ? {
      generation: num(s.generation), phase: ['opening', 'buffering', 'ready', 'ended', 'failed', 'cancelled'].includes(s.phase) ? s.phase : 'other',
      failure: fixed(s.failure), ...finiteFields(s, ['target', 'duration', 'appends', 'frames', 'lastMediaTime']),
      disposed: !!s.disposed, lossy:s.status?.level==='Q3'&&s.status?.video==='lossy-transformed'&&s.status?.bitPerfectVideo===false,
      retained:finiteFields(s,['peakAhead','peakRetainedAppendBytes','removals','waits']),
      q3Metrics:finiteFields(s.pipeline?.metrics,['decoded','encoded','peakHeapBytes','peakEncoderQueue','peakMuxBytes','peakMuxSamples','outputBytes','peakPendingAcks']),
      source: finiteFields(s.source, sourceFields),
      probeRetainedBytes:num(s.probeRetention?.retainedBytes),
      bootstrap: { ...finiteFields(s.bootstrap, ['sourceOffset', 'sourceSize']), finished: s.bootstrap?.finished === true,
        phaseFinished: s.bootstrap?.phase === 'finished' || s.bootstrap?.state === 'finished' },
      worker: { ...finiteFields(s.worker, ['sourceBytesOffered', 'sourceBytesConsumed', 'outputBytes', 'appends']),
        finished: s.worker?.status === 'finished' || s.worker?.phase === 'finished' || s.worker?.state === 'finished' }
    } : null;
    return { at: Date.now(), ...f, selected: !!state.selected, playerClosed: !!el.playerSheet.hidden,
      route: q1Playback?.kind === 'general' && s?.status?.level === 'Q3' ? 'Q3' : q1Playback?.kind === 'ts' ? 'Q1_TS' : q1Playback?.kind === 'general' ? 'Q2_GENERAL' : q0Playback ? 'Q0' : 'OTHER',
      sourceGeneration: num(mediaSourceGeneration), session: num(state.mediaSession),
      lossyChoiceVisible:!el.videoCompatButton.hidden, lossyModeSelected:state.mediaPlaybackMode===PLAYBACK_MODE.VIDEO_COMPATIBILITY,
      lossyLabelVisible:shown(el.qualityBadge).visible&&el.qualityBadge.textContent?.includes('영상 손실 압축')===true,
      retirementSettled:q1RetirementResult?.settled===true, q0Closed:!q0Playback, q1Closed:!q1Playback, choiceCleared:!q3Choice,
      nativeSourceDetached:!el.videoPlayer.getAttribute('src'),
      seekGeneration: num(mediaSeekGeneration), seekSettledGeneration: num(mediaSeekSettledGeneration),
      seekWatchdog: !!mediaSeekWatchdog, loading: shown(el.mediaLoadingText),
      native: v ? { time: num(v.currentTime), duration: num(v.duration), paused: !!v.paused, ended: !!v.ended,
        seeking: !!v.seeking, ready: num(v.readyState), width: num(v.videoWidth), height: num(v.videoHeight),
        error: num(v.error?.code), totalDecodedFrames: num(quality?.totalVideoFrames), droppedFrames: num(quality?.droppedVideoFrames),
        buffered: ranges(v), muted: !!v.muted, playbackRate: num(v.playbackRate),
        audioTrackCount: num(v.audioTracks?.length), decodedAudioBytes: num(v.webkitAudioDecodedByteCount) } : null,
      pipeline };
  }
  function event(e) {
    if (events.length < 128) events.push({ type: e.type, trusted: !!e.isTrusted, at: Date.now(),
      phase: phase?.label || null, generation: num(stats()?.generation), mediaTime: num(e.target?.currentTime) });
  }
  const eventNames = ['playing', 'pause', 'seeking', 'seeked', 'ended', 'error', 'loadeddata', 'waiting', 'stalled'];
  function detachFrame() {
    if (frameVideo) {
      if (callbackId !== null) frameVideo.cancelVideoFrameCallback?.(callbackId);
      eventNames.forEach(name => frameVideo.removeEventListener(name, event));
    }
    frameVideo = null; callbackId = null;
  }
  function attachFrame() {
    const v = video();
    if (v === frameVideo) return;
    detachFrame();
    if (!v?.requestVideoFrameCallback) return;
    frameVideo = v;
    eventNames.forEach(name => v.addEventListener(name, event));
    const callback = (_, m) => {
      callbackId = null;
      if (disposed || frameVideo !== v) return;
      const s = sample();
      if (phase) {
        const currentOwner = q1Playback || q0Playback, currentStats = stats();
        const mapping = currentStats?.mapping;
        const shift = Number.isFinite(mapping?.commonShift) && Number.isFinite(mapping?.sourceOrigin)
          ? mapping.commonShift - mapping.sourceOrigin : 0;
        const presentedSourceTime = m.mediaTime + shift;
        const elapsedMs = s.at - phase.armedAt, distance = phase.targetSeconds == null ? null : Math.abs(presentedSourceTime - phase.targetSeconds);
        const fencesGood = s.route === 'Q3' && q1Playback?.fileId===target.id && s.pipeline?.lossy && s.lossyModeSelected && s.lossyLabelVisible && video() === v && isCurrentMediaEvent(v) && s.sourceSame && s.accountSame && s.visible && s.targetSame
          && s.selectedFreshSameWhenKnown && !s.q1Aborted;
        const generationAdvanced = currentOwner !== phasePrivate.owner || state.mediaSession !== phasePrivate.session
          || mediaSourceGeneration !== phasePrivate.sourceGeneration || currentStats?.generation !== phasePrivate.generation;
        const needsAdvance = ['seek50', 'seek90', 'nearEOF', 'reopen'].includes(phase.label);
        const currentGeneration = currentOwner === (q1Playback || q0Playback) && currentStats === stats()
          && state.mediaSession === s.session && mediaSourceGeneration === s.sourceGeneration;
        const targetGood = (phase.targetSeconds == null || distance <= phase.toleranceSeconds)
          && currentGeneration && (!needsAdvance || generationAdvanced);
        const dimensionsGood = m.width === binding.fixture.width && m.height === binding.fixture.height;
        const sourceCfrGridError = Math.abs(presentedSourceTime * binding.fixture.fps - Math.round(presentedSourceTime * binding.fixture.fps));
        if (phase.frames.length < 96) phase.frames.push({ elapsedMs, mediaTime: num(m.mediaTime),
          presentedFrames: num(m.presentedFrames), width: num(m.width), height: num(m.height), sourceTime: num(presentedSourceTime),
          sourceClockShift: num(shift), sourceCfrGridError: num(sourceCfrGridError), generationAdvanced, currentGeneration, distanceSeconds: num(distance),
          generation: s.pipeline?.generation ?? null, sourceGeneration: s.sourceGeneration,
          targetSame: s.targetSame, fencesGood, targetGood });
        phase.presentedCount++;
        // A presented target frame can precede adapter readiness. Record that discriminator,
        // while rejecting a retired/failed current pipeline. Watchdog/readiness remain separate.
        const pipelineReady = !s.pipeline || (!['failed', 'cancelled'].includes(s.pipeline.phase) && !s.pipeline.disposed);
        if (fencesGood && targetGood && dimensionsGood && sourceCfrGridError<.0001 && pipelineReady && !phase.firstTargetFrame) phase.firstTargetFrame = {
          route:s.route, elapsedMs, mediaTime: num(m.mediaTime), sourceTime: num(presentedSourceTime), sourceClockShift: num(shift),
          distanceSeconds: num(distance), width: num(m.width), height: num(m.height),
          generation: s.pipeline?.generation ?? null, sourceGeneration: s.sourceGeneration };
        if (fencesGood && targetGood && s.native?.duration && presentedSourceTime >= s.native.duration - phase.finalWindowSeconds) phase.finalWindowPresented++;
      }
      callbackId = v.requestVideoFrameCallback(callback);
    };
    callbackId = v.requestVideoFrameCallback(callback);
  }
  function tick() {
    if (disposed) return;
    attachFrame(); retainMetricOwner();
    if (phase) {
      const s = sample(); phase.last = s;
      if (phase.samples.length < 144) phase.samples.push(s);
      phase.maxLoadingHeight = Math.max(phase.maxLoadingHeight, s.loading.visible ? s.loading.height || 0 : 0);
      if (!s.sourceSame || !s.accountSame || !s.visible || (s.selected && !s.targetSame)
          || (s.selected && !s.selectedFreshSameWhenKnown) || s.q1Aborted) phase.fenceFailure = true;
      if (Date.now() - phase.armedAt >= 15000 && !phase.diagnosticAt15) phase.diagnosticAt15 = {
        frameBy15: !!phase.firstTargetFrame && phase.firstTargetFrame.elapsedMs <= 15000, sampledAtMs: Date.now() - phase.armedAt,
        last: s };
    }
    if (Date.now() - startedAt >= maxTotalMs) stop('TOTAL_BOUND');
  }
  function arm(label, options = {}) {
    if (metadataResults.find(x=>x.label==='before')?.freshRevisionChecksumSame!==true) fail('METADATA_BEFORE_REQUIRED');
    if (disposed || !['native', 'startup', 'seek50', 'seek90', 'cancel'].includes(label)) fail('REPLAY_ARM');
    if (phases.length >= 5) fail('PHASE_LIMIT');
    if (phase) phase.completedAt = Date.now();
    const seconds = label==='seek50' ? binding.fixture.duration*.5 : label==='seek90' ? binding.fixture.duration*.9 : null;
    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0)) fail('TARGET_SECONDS');
    phase = { label, armedAt: Date.now(), targetSeconds: seconds,
      streamActiveAtArm:label==='cancel'&&sample().route==='Q3'&&stats()?.disposed!==true&&!q1Playback?.controller?.signal?.aborted&&stats()?.phase!=='buffered-to-end',
      toleranceSeconds: Math.min(10, Math.max(.25, Number(options.toleranceSeconds) || 1.5)),
      finalWindowSeconds: Math.min(15, Math.max(1, Number(options.finalWindowSeconds) || 5)),
      frames: [], samples: [], presentedCount: 0, finalWindowPresented: 0,
      firstTargetFrame: null, diagnosticAt15: null, maxLoadingHeight: 0, fenceFailure: false };
    phases.push(phase); tick();
    phasePrivate = { owner: q1Playback || q0Playback, session: state.mediaSession,
      sourceGeneration: mediaSourceGeneration, generation: stats()?.generation };
    return { armed: true, label, targetSeconds: seconds, toleranceSeconds: phase.toleranceSeconds };
  }
  function read() {
    tick();
    const latest = sample(), final = latest.native;
    const tailBuffered = !!final?.duration && final.buffered.some(r => r[1] >= final.duration - .25);
    const p = latest.pipeline;
    return { schema: 'drive-original.q3-actual-observation/1', sourceCommit: binding.sourceCommit, version: binding.version,
      elapsedMs: Date.now() - startedAt, disposed, latest, phases, events, metadataResults, nativeErrors, choices,
      nativeRejectionObserved:nativeErrors.some(x=>x.trusted&&x.code===4&&x.nativeOwner&&x.nativePinSame&&x.transportVerified&&x.sourceSame&&x.accountSame&&x.targetSame),
      explicitChoiceObserved:choices.some(x=>x.trusted&&x.choiceCurrent&&x.explicitLossyChoice&&x.sourceSame&&x.accountSame&&x.targetSame),
      closedOwnership:latest.playerClosed&&latest.q0Closed&&latest.q1Closed&&latest.choiceCleared&&latest.retirementSettled&&latest.nativeSourceDetached,
      limitations:['presented samples only; CFR grid does not prove every encoded frame','native encoder/GPU/device memory and thermal/temperature/battery are unmeasured','prior3s quality proof is not180s quality proof','640 fixture does not qualify all admitted profiles'],
      eof: { currentOwnerQualified:latest.route==='Q3'&&latest.sourceSame&&latest.accountSame&&latest.targetSame&&latest.selectedFreshSameWhenKnown&&!latest.q1Aborted&&!!video()&&isCurrentMediaEvent(video())&&!phase?.fenceFailure, nativeEnded: !!final?.ended, trustedEndedObserved: events.some(e => e.type === 'ended' && e.trusted),
        q3BufferedToEnd: p?.phase === 'buffered-to-end', sourceOffsetReachedSize: !!p?.bootstrap?.sourceSize
          && p.bootstrap.sourceOffset === p.bootstrap.sourceSize,
        bootstrapFinished: !!p?.bootstrap?.finished || !!p?.bootstrap?.phaseFinished, workerFinished: !!p?.worker?.finished,
        nativeEndImpliesMseEndOfStreamReached: latest.route === 'Q3' && p?.phase === 'buffered-to-end', tailBuffered,
        finalWindowPresented: phases.filter(x => x.label === 'nearEOF').reduce((n, x) => n + x.finalWindowPresented, 0),
        exactFinalFrame: 'UNKNOWN', audioFidelity: 'NOT_TESTED' },
      metrics:captureMetrics('live'), rawIdentifiersExported: false, observerOnly: true, listenersBounded: true };
  }
  async function metadata(label) {
    if (!['before', 'after'].includes(label) || metadataResults.some(r => r.label === label)) fail('METADATA_BOUND');
    if (!pinned() || !accountSame() || document.visibilityState!=='visible') fail('METADATA_FENCE');
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
    try {
      const headers = target.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${target.id}/${target.resourceKey}` } : {};
      const fields = 'id,name,size,mimeType,modifiedTime,parents,version,headRevisionId,md5Checksum,sha256Checksum,trashed,capabilities(canDownload)';
      const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(target.id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`, { signal: abort.signal, headers });
      const length = Number(r.headers.get('Content-Length'));
      if (!r.ok || (Number.isFinite(length) && length > 1048576)) fail('METADATA_READ');
      const reader=r.body?.getReader();if(!reader)fail('METADATA_READ');let total=0,chunks=[];try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>1048576){await reader.cancel();fail('METADATA_READ');}chunks.push(part.value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const f=JSON.parse(new TextDecoder().decode(bytes));chunks=[];
      const result = { label, at: Date.now(), status: r.status, sameExactTarget: f.id === target.id,
        stableMetadataSame: stableMatch(f), freshRevisionChecksumSame: freshMatch(f),
        accountSame: accountSame(), sourceSame: pinned(), notTrashed: f.trashed === false, canDownload: f.capabilities?.canDownload === true };
      metadataResults.push(result); if(!Object.values(result).filter(x=>typeof x==='boolean').every(Boolean)) fail('METADATA_MISMATCH'); return result;
    } catch { fail('METADATA_READ'); } finally { clearTimeout(timer); }
  }
  function stop(reason = 'OWNER_STOP') {
    if (disposed) return { disposed: true, removed: true };
    el.videoPlayer.removeEventListener('error',nativeError,true);el.videoCompatButton.removeEventListener('click',choiceEvent,true);
    disposed = true; retainedMetricOwners.length=0; phasePrivate=null; clearInterval(interval); interval = null; detachFrame();
    if (phase) phase.completedAt = Date.now();
    return { disposed: true, removed: true, reason: ['OWNER_STOP', 'TOTAL_BOUND'].includes(reason) ? reason : 'OWNER_STOP',
      phases: phases.length, frameCallbackRemoved: callbackId === null, mediaListenersRemoved: true };
  }
  function save() {
    if(disposed)fail('OBSERVER_ALREADY_STOPPED');
    const receipt=read();receipt.closedMetrics=captureMetrics('cleanup');
    receipt.complete=receipt.latest.sourceSame&&receipt.latest.accountSame&&receipt.latest.visible&&receipt.latest.online
      &&receipt.nativeRejectionObserved&&receipt.explicitChoiceObserved&&receipt.closedOwnership&&!receipt.closedMetrics.ownerOverflow
      &&['startup','seek50','seek90'].every(label=>receipt.phases.some(p=>p.label===label&&p.firstTargetFrame&&!p.fenceFailure))
      &&receipt.phases.some(p=>p.label==='cancel'&&p.streamActiveAtArm)&&metadataResults.length===2&&metadataResults.every(r=>r.sourceSame&&r.accountSame&&r.stableMetadataSame&&r.freshRevisionChecksumSame&&r.notTrashed&&r.canDownload);
    receipt.performanceAcceptance='NOT_QUALIFIED';receipt.completeScope='Bounded functional route/geometry/seek/active cancellation/close only;15s diagnostic and measured latency remain separate';
    receipt.observerCleanup=stop();
    window.__q3ActualReceipt33=JSON.parse(JSON.stringify(receipt));
    return {saved:true,complete:receipt.complete,observerStopped:true,privateIdentityExported:false};
  }
  interval = setInterval(tick, 250);
  window.__q3ActualReplay33 = Object.freeze({ arm, read, metadata, captureMetrics, stop, save });
  tick();
  return { installed: true, sourceCommit: binding.sourceCommit, version: binding.version, accountSame: accountSame(),
    sourceSame: pinned(), boundedMs: maxTotalMs, phaseLimit: 5, eventLimit: 128, frameLimitPerPhase: 96,
    targetPrivate: true, observerOnly: true };
})({"schema":"drive-original.q3-actual-binding/1","sourceCommit":"5174485b3c17d047259701bbdd889f9b0740f555","version":"1.22.0-rc.33","sourceSHA256":{"app.js":"366a39fc924ba064a5f3e7a38b779136ca04fa256fce505ace9933254599b4d8","sw.js":"937fc8a21a13f9d42a4e03682e682c5ff46a45d55b0d8813701f559591e636db","version.json":"665dc35c57dddee8c1de22b766498044ae5dabd93d64f1d08930200982a8e694","media/drive-source.mjs":"cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a","media/ts-player.mjs":"1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705"},"cache":[{"file":"index.html","bytes":51100,"sha256":"9e400431cb25e04b31ca33f7f6fb5d979cc58975fbe1cb031e06ef25733ae247"},{"file":"styles.css","bytes":84744,"sha256":"1e011347c4a24cad04ed4229c01b721cb20d7925268b8ca6d585000ff9850a11"},{"file":"runtime-config.js","bytes":300,"sha256":"cea278b4aa9bffb81bbf0162bb4837d723367f2bdd87f949a27c429c5384ec3a"},{"file":"app.js","bytes":515595,"sha256":"366a39fc924ba064a5f3e7a38b779136ca04fa256fce505ace9933254599b4d8"},{"file":"media/drive-source.mjs","bytes":18497,"sha256":"cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a"},{"file":"media/revision-pin.js","bytes":10050,"sha256":"6550cbed08542607cdf7720b17a18de7eeae01015296afdabb59d9b8f6169008"},{"file":"media/ts-player.mjs","bytes":17574,"sha256":"1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705"},{"file":"media/q1-core.mjs","bytes":51834,"sha256":"2cbd017339c2261eca161f013588b3e0106ba33888b1c78bff8ceb806ade126a"},{"file":"media/transmux-worker.mjs","bytes":42568,"sha256":"3962b20bf6f36e831bc0a3296cbdd65a9225b20b70250f3060cb62ddc4aaf444"},{"file":"media/mux-mp4.min.js","bytes":85985,"sha256":"4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f"},{"file":"media/mux-LICENSE.txt","bytes":11342,"sha256":"1a3c5bb355ae9ea7f0e8e92836b72189c7acf85a487dd8706d5f1dfff9bf7d3d"},{"file":"media/general-admission.mjs","bytes":5082,"sha256":"f458b1cfed35f150c1db8ea93e2ac1eb3787128c50ab73bfd28d3a8b7f73096d"},{"file":"media/general-codec.mjs","bytes":1666,"sha256":"dd87804c4a4a17ae4806003b240790ddb3a080cd23c39baf67e020e7eeb94f3f"},{"file":"media/general-owner.mjs","bytes":6692,"sha256":"6a4f2399b6f3e5a05142d953724f0bfae1945d28fdef40dc6d648fb6ce6752d2"},{"file":"media/general-pipeline.mjs","bytes":9976,"sha256":"8452ef79e701bf87384e967b8eb66fd5fd12ce6cb8dd623d977f9c768c64c055"},{"file":"media/general-player.mjs","bytes":20190,"sha256":"b3525f2b74241aca49ca470e11c9891ecf4735476e433229b1020aac819f952a"},{"file":"media/general-source.mjs","bytes":3765,"sha256":"aec6a57bea87b2b3b56d5c001c0b2ed3839d172b54d328adee9d42c21192fcec"},{"file":"media/general-timeline.mjs","bytes":6090,"sha256":"20f2947af3c05d832d0478d1cee2422012f0cf6629b1526a78e05fa5dd79ad79"},{"file":"media/general-worker.mjs","bytes":3228,"sha256":"8f8cb412e98ad63becf2389ea3883a122fd06af4442ae0219f34cc3518f00f43"},{"file":"media/mediabunny-q1.mjs","bytes":686739,"sha256":"4ee8a826604206e169e4a7f9100cda1e4e54fadddf69f92df8ffa2b1bedd15cd"},{"file":"media/mediabunny-q1.LICENSE","bytes":16726,"sha256":"3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04"},{"file":"media/mediabunny-q1-NOTICE.md","bytes":2955,"sha256":"46ab73111256319aeb2757adc88fb5b9245f59f99d4552a3a74f2327c833abb9"},{"file":"media/audio-runtime.mjs","bytes":11482,"sha256":"08775db14f62bfe161eed0ba1e825733f13c1f8d02fd1619469408278cc1c543"},{"file":"media/audio-adapter.mjs","bytes":2790,"sha256":"63cf5387292e68072f9fafb2a6f487129741dd8017dc732c9cbd4b003a3e60e8"},{"file":"media/audio-worker-client.mjs","bytes":6213,"sha256":"1e434015b155e3fbbe1797db464c1bdb6d2db555cb719c0a53c4051e5839b572"},{"file":"media/audio-worker.mjs","bytes":3268,"sha256":"b2ce2eade84095d0ddf0d523c920904d86bf52fef30a9e6ef31d599350081850"},{"file":"media/audio-codec.mjs","bytes":15193,"sha256":"1dde4d17f442adb281a8864dcfaaf8515d21cbdc53cd262122238eab9e7ac431"},{"file":"media/audio-codec.wasm","bytes":502740,"sha256":"48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf"},{"file":"media/audio-codec.LICENSE.txt","bytes":71576,"sha256":"62c8e79924a79181faf70d357fb7296e9471b4e50c00b74e9ebb1e2fa975a123"},{"file":"media/audio-general-pipeline.mjs","bytes":17849,"sha256":"90fc6a366beece135ce077aa79bba5ae386a6d40fbe7ff8ce8b062de055b2ce5"},{"file":"media/audio-general-worker.mjs","bytes":3392,"sha256":"15d792e9cae0b8018b0ea35bbcd8bea256909af516fefa3e941f64e2f2f06526"},{"file":"media/video-q3-input.mjs","bytes":9977,"sha256":"88384daf1cdae5d8120e9321a8a67a99c0dedc9d298ac2dd62dcd428f2965b99"},{"file":"media/video-q3-pipeline.mjs","bytes":10341,"sha256":"0b586338bc22dd5ccdbd0e030c7051649f716eb863307f72fbb74fa8b7c5c297"},{"file":"media/video-q3-worker.mjs","bytes":3344,"sha256":"4258108f2afa147aa90b470b4b29ba79bc557768993e4364c328757a1549e418"},{"file":"media/video-q3-codec.mjs","bytes":13110,"sha256":"9f6f66f214a3cd3d6fd570f998c9eb8de72f88bdcc7dceb3fd90a8082c9df9a1"},{"file":"media/video-q3-codec.wasm","bytes":614556,"sha256":"722b38a87d6cd71d56ed247f6125c53a4f6b218bf2071a2851c5be489b145436"},{"file":"media/video-q3-codec.LICENSE.txt","bytes":55828,"sha256":"a2b75502237c70afc9004a75fabbba93513e44a8af9305d6ffaf1805e5073b11"},{"file":"licenses/index.html","bytes":5933,"sha256":"adf6ffcf7d57d7690b99e8f8f480e08eb76c17ff86161529898407c140a03caf"},{"file":"licenses/audio-source-NOTICE.md","bytes":4212,"sha256":"501ba244da6d458d7332d04e91ecbddd4df4ec8fffb90bca4ebed2ae3a7c4da0"},{"file":"version.json","bytes":248,"sha256":"665dc35c57dddee8c1de22b766498044ae5dabd93d64f1d08930200982a8e694"},{"file":"manifest.webmanifest","bytes":639,"sha256":"66f78647b95c14e17197452817bc91a8c28f71faa066dff65646c517c7e445e2"},{"file":"icons/app-icon.svg","bytes":443,"sha256":"3102cfafd120a6a3d1ed67d0611a127992a62d1174fce740dfbe35e5f4e62fd1"},{"file":"icons/icon-192.png","bytes":707,"sha256":"4b50c9e83cbda9fd46e4756b04f1c1df46e6bb6e52f6ebed6f88adb447d6fa99"},{"file":"icons/icon-512.png","bytes":2091,"sha256":"c5a7c3f4533935f608904533c2a88b61e78d6960ab2d528fa029f6eaf37fda9f"},{"file":"icons/maskable-512.png","bytes":2068,"sha256":"02efec2b1c34f99ece7afb129ae414396f884d8e53ef2292ae2ecc318c437de7"},{"file":"icons/apple-touch-icon.png","bytes":656,"sha256":"9deda4d464fe25d066d952de58c42054f5797fbbd5d0057576b405b86d4b5061"}],"fixture":{"bytes":18075476,"sha256":"cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a","width":640,"height":360,"fps":30,"duration":180},"hashSource":"explicit committed Git blobs; not working tree","privateInputRead":false})
