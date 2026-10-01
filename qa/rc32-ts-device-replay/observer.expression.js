(function installRc32SingleFileReplay(binding) {
  'use strict';
  const fail = code => { throw Error(code); };
  if (window.__rc32TsReplay) fail('REPLAY_ALREADY_INSTALLED');
  const holder = window.__resumeReplayTarget30;
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
  const fixed = v => typeof v === 'string' && /^(?:Q1|Q0|GENERAL|SEEK|BOOTSTRAP|WORKER|BUFFER_WINDOW)_[A-Z_]+$/.test(v) ? v : null;
  const finiteFields = (object, keys) => Object.fromEntries(keys.map(k => [k, num(object?.[k])]));
  const ranges = v => Array.from({ length: Math.min(v?.buffered?.length || 0, 8) }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]);
  const shown = element => {
    if (!element) return { hidden: true, height: 0, visible: false };
    const r = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { hidden: !!element.hidden, height: num(r.height), visible: !element.hidden && r.height > 0
      && style.display !== 'none' && style.visibility !== 'hidden' };
  };
  const phases = [], events = [], metadataResults = [], retainedMetricOwners = [];
  let metricOwnerOverflow=false;
  const sourceFields=['readsStarted','readsCompleted','metadataRequests','rangeRequests','receivedBytes','releasedBytes','cacheHits','cacheBytes','logicalReturnedBytes'];
  function metricValues(s){return {...finiteFields(s?.source,sourceFields),probeRetainedBytes:num(s?.probeRetention?.retainedBytes),probePeakRetainedBytes:num(s?.probeRetention?.peakRetainedBytes),probeMaxRetainedBytes:num(s?.probeRetention?.maxRetainedBytes)};}
  function retainMetricOwner(){
    const s=stats(),v=video(),f=fence(),owner=q1Playback;
    if(!s||owner?.kind!=='ts'||!v||!isCurrentMediaEvent(v)||!f.sourceSame||!f.accountSame||!f.targetSame||!f.selectedFreshSameWhenKnown||f.q1Aborted||s.disposed)return;
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
      disposed: !!s.disposed,
      source: finiteFields(s.source, sourceFields),
      probeRetainedBytes:num(s.probeRetention?.retainedBytes),
      bootstrap: { ...finiteFields(s.bootstrap, ['sourceOffset', 'sourceSize']), finished: s.bootstrap?.finished === true,
        phaseFinished: s.bootstrap?.phase === 'finished' || s.bootstrap?.state === 'finished' },
      worker: { ...finiteFields(s.worker, ['sourceBytesOffered', 'sourceBytesConsumed', 'outputBytes', 'appends']),
        finished: s.worker?.status === 'finished' || s.worker?.phase === 'finished' || s.worker?.state === 'finished' }
    } : null;
    return { at: Date.now(), ...f, selected: !!state.selected, playerClosed: !!el.playerSheet.hidden,
      route: q1Playback?.kind === 'ts' ? 'Q1_TS' : q1Playback?.kind === 'general' ? 'Q2_GENERAL' : q0Playback ? 'Q0' : 'OTHER',
      sourceGeneration: num(mediaSourceGeneration), session: num(state.mediaSession),
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
        const fencesGood = s.route === 'Q1_TS' && video() === v && isCurrentMediaEvent(v) && s.sourceSame && s.accountSame && s.visible && s.targetSame
          && s.selectedFreshSameWhenKnown && !s.q1Aborted;
        const generationAdvanced = currentOwner !== phasePrivate.owner || state.mediaSession !== phasePrivate.session
          || mediaSourceGeneration !== phasePrivate.sourceGeneration || currentStats?.generation !== phasePrivate.generation;
        const needsAdvance = ['seek50', 'seek90', 'nearEOF', 'reopen'].includes(phase.label);
        const currentGeneration = currentOwner === (q1Playback || q0Playback) && currentStats === stats()
          && state.mediaSession === s.session && mediaSourceGeneration === s.sourceGeneration;
        const targetGood = (phase.targetSeconds == null || distance <= phase.toleranceSeconds)
          && currentGeneration && (!needsAdvance || generationAdvanced);
        const dimensionsGood = m.width > 0 && m.height > 0;
        if (phase.frames.length < 96) phase.frames.push({ elapsedMs, mediaTime: num(m.mediaTime),
          presentedFrames: num(m.presentedFrames), width: num(m.width), height: num(m.height), sourceTime: num(presentedSourceTime),
          sourceClockShift: num(shift), generationAdvanced, currentGeneration, distanceSeconds: num(distance),
          generation: s.pipeline?.generation ?? null, sourceGeneration: s.sourceGeneration,
          targetSame: s.targetSame, fencesGood, targetGood });
        phase.presentedCount++;
        // A presented target frame can precede adapter readiness. Record that discriminator,
        // while rejecting a retired/failed current pipeline. Watchdog/readiness remain separate.
        const pipelineReady = !s.pipeline || (!['failed', 'cancelled'].includes(s.pipeline.phase) && !s.pipeline.disposed);
        if (fencesGood && targetGood && dimensionsGood && pipelineReady && !phase.firstTargetFrame) phase.firstTargetFrame = {
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
      if (Date.now() - phase.armedAt >= 15000 && !phase.deadline15) phase.deadline15 = {
        passed: !!phase.firstTargetFrame && phase.firstTargetFrame.elapsedMs <= 15000, sampledAtMs: Date.now() - phase.armedAt,
        last: s };
    }
    if (Date.now() - startedAt >= maxTotalMs) stop('TOTAL_BOUND');
  }
  function arm(label, options = {}) {
    if (disposed || !['startup', 'seek50', 'seek90', 'nearEOF', 'reopen'].includes(label)) fail('REPLAY_ARM');
    if (phases.length >= 5) fail('PHASE_LIMIT');
    if (phase) phase.completedAt = Date.now();
    const seconds = options.targetSeconds == null ? null : Number(options.targetSeconds);
    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0)) fail('TARGET_SECONDS');
    phase = { label, armedAt: Date.now(), targetSeconds: seconds,
      toleranceSeconds: Math.min(10, Math.max(.25, Number(options.toleranceSeconds) || 1.5)),
      finalWindowSeconds: Math.min(15, Math.max(1, Number(options.finalWindowSeconds) || 5)),
      frames: [], samples: [], presentedCount: 0, finalWindowPresented: 0,
      firstTargetFrame: null, deadline15: null, maxLoadingHeight: 0, fenceFailure: false };
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
    return { schema: 'drive-original.rc32-ts-replay/1', sourceCommit: binding.sourceCommit, version: binding.version,
      elapsedMs: Date.now() - startedAt, disposed, latest, phases, events, metadataResults,
      eof: { currentOwnerQualified:latest.route==='Q1_TS'&&latest.sourceSame&&latest.accountSame&&latest.targetSame&&latest.selectedFreshSameWhenKnown&&!latest.q1Aborted&&!!video()&&isCurrentMediaEvent(video())&&!phase?.fenceFailure, nativeEnded: !!final?.ended, trustedEndedObserved: events.some(e => e.type === 'ended' && e.trusted),
        q1Ended: p?.phase === 'ended', sourceOffsetReachedSize: !!p?.bootstrap?.sourceSize
          && p.bootstrap.sourceOffset === p.bootstrap.sourceSize,
        bootstrapFinished: !!p?.bootstrap?.finished || !!p?.bootstrap?.phaseFinished, workerFinished: !!p?.worker?.finished,
        nativeEndImpliesMseEndOfStreamReached: latest.route === 'Q1_TS' && p?.phase === 'ended', tailBuffered,
        finalWindowPresented: phases.filter(x => x.label === 'nearEOF').reduce((n, x) => n + x.finalWindowPresented, 0),
        exactFinalFrame: 'UNKNOWN', audioFidelity: 'NOT_TESTED' },
      metrics:captureMetrics('live'), rawIdentifiersExported: false, observerOnly: true, listenersBounded: true };
  }
  async function metadata(label) {
    if (!['before', 'after'].includes(label) || metadataResults.some(r => r.label === label)) fail('METADATA_BOUND');
    if (!pinned() || !accountSame()) fail('METADATA_FENCE');
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
      metadataResults.push(result); return result;
    } catch { fail('METADATA_READ'); } finally { clearTimeout(timer); }
  }
  function stop(reason = 'OWNER_STOP') {
    if (disposed) return { disposed: true, removed: true };
    disposed = true; retainedMetricOwners.length=0; phasePrivate=null; clearInterval(interval); interval = null; detachFrame();
    if (phase) phase.completedAt = Date.now();
    return { disposed: true, removed: true, reason: ['OWNER_STOP', 'TOTAL_BOUND'].includes(reason) ? reason : 'OWNER_STOP',
      phases: phases.length, frameCallbackRemoved: callbackId === null, mediaListenersRemoved: true };
  }
  interval = setInterval(tick, 250);
  window.__rc32TsReplay = Object.freeze({ arm, read, metadata, captureMetrics, stop });
  tick();
  return { installed: true, sourceCommit: binding.sourceCommit, version: binding.version, accountSame: accountSame(),
    sourceSame: pinned(), boundedMs: maxTotalMs, phaseLimit: 5, eventLimit: 128, frameLimitPerPhase: 96,
    targetPrivate: true, observerOnly: true };
})({"schema":"drive-original.rc32-ts-replay-binding/1","sourceCommit":"1d79897fd32c569137cab079bfd93107be2ee33f","version":"1.22.0-rc.32","sourceSHA256":{"app.js":"7a84c2f52a6ba15300a533eea7f5b49f6653fe540486f5907d30214e65327497","sw.js":"8f27c0aa6710b78353b87911702a7e4c6e66535c404d5a66869992fc861b242b","version.json":"f60e407e34b72be59084f504eec09d2e48ce658c3fdc63f6f397b7eb341cbbea","media/drive-source.mjs":"cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a","media/ts-player.mjs":"1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705"},"cache":[{"file":"index.html","sha256":"fe460043f527a40bb0d0072395824bf2f4a9b09e8dc2a40bb3ea1e2245d80efb","bytes":50974},{"file":"styles.css","sha256":"1e011347c4a24cad04ed4229c01b721cb20d7925268b8ca6d585000ff9850a11","bytes":84744},{"file":"runtime-config.js","sha256":"cea278b4aa9bffb81bbf0162bb4837d723367f2bdd87f949a27c429c5384ec3a","bytes":300},{"file":"app.js","sha256":"7a84c2f52a6ba15300a533eea7f5b49f6653fe540486f5907d30214e65327497","bytes":510955},{"file":"media/drive-source.mjs","sha256":"cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a","bytes":18497},{"file":"media/revision-pin.js","sha256":"6550cbed08542607cdf7720b17a18de7eeae01015296afdabb59d9b8f6169008","bytes":10050},{"file":"media/ts-player.mjs","sha256":"1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705","bytes":17574},{"file":"media/q1-core.mjs","sha256":"2cbd017339c2261eca161f013588b3e0106ba33888b1c78bff8ceb806ade126a","bytes":51834},{"file":"media/transmux-worker.mjs","sha256":"3962b20bf6f36e831bc0a3296cbdd65a9225b20b70250f3060cb62ddc4aaf444","bytes":42568},{"file":"media/mux-mp4.min.js","sha256":"4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f","bytes":85985},{"file":"media/mux-LICENSE.txt","sha256":"1a3c5bb355ae9ea7f0e8e92836b72189c7acf85a487dd8706d5f1dfff9bf7d3d","bytes":11342},{"file":"media/general-admission.mjs","sha256":"f458b1cfed35f150c1db8ea93e2ac1eb3787128c50ab73bfd28d3a8b7f73096d","bytes":5082},{"file":"media/general-codec.mjs","sha256":"dd87804c4a4a17ae4806003b240790ddb3a080cd23c39baf67e020e7eeb94f3f","bytes":1666},{"file":"media/general-owner.mjs","sha256":"6a4f2399b6f3e5a05142d953724f0bfae1945d28fdef40dc6d648fb6ce6752d2","bytes":6692},{"file":"media/general-pipeline.mjs","sha256":"8452ef79e701bf87384e967b8eb66fd5fd12ce6cb8dd623d977f9c768c64c055","bytes":9976},{"file":"media/general-player.mjs","sha256":"adcbb532faa39ee4bb1f16effee908e2bdca50589ef890c2f27acc9e54572d1d","bytes":20187},{"file":"media/general-source.mjs","sha256":"aec6a57bea87b2b3b56d5c001c0b2ed3839d172b54d328adee9d42c21192fcec","bytes":3765},{"file":"media/general-timeline.mjs","sha256":"20f2947af3c05d832d0478d1cee2422012f0cf6629b1526a78e05fa5dd79ad79","bytes":6090},{"file":"media/general-worker.mjs","sha256":"8f8cb412e98ad63becf2389ea3883a122fd06af4442ae0219f34cc3518f00f43","bytes":3228},{"file":"media/mediabunny-q1.mjs","sha256":"4ee8a826604206e169e4a7f9100cda1e4e54fadddf69f92df8ffa2b1bedd15cd","bytes":686739},{"file":"media/mediabunny-q1.LICENSE","sha256":"3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04","bytes":16726},{"file":"media/mediabunny-q1-NOTICE.md","sha256":"46ab73111256319aeb2757adc88fb5b9245f59f99d4552a3a74f2327c833abb9","bytes":2955},{"file":"media/audio-runtime.mjs","sha256":"08775db14f62bfe161eed0ba1e825733f13c1f8d02fd1619469408278cc1c543","bytes":11482},{"file":"media/audio-adapter.mjs","sha256":"63cf5387292e68072f9fafb2a6f487129741dd8017dc732c9cbd4b003a3e60e8","bytes":2790},{"file":"media/audio-worker-client.mjs","sha256":"1e434015b155e3fbbe1797db464c1bdb6d2db555cb719c0a53c4051e5839b572","bytes":6213},{"file":"media/audio-worker.mjs","sha256":"b2ce2eade84095d0ddf0d523c920904d86bf52fef30a9e6ef31d599350081850","bytes":3268},{"file":"media/audio-codec.mjs","sha256":"1dde4d17f442adb281a8864dcfaaf8515d21cbdc53cd262122238eab9e7ac431","bytes":15193},{"file":"media/audio-codec.wasm","sha256":"48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf","bytes":502740},{"file":"media/audio-codec.LICENSE.txt","sha256":"62c8e79924a79181faf70d357fb7296e9471b4e50c00b74e9ebb1e2fa975a123","bytes":71576},{"file":"media/audio-general-pipeline.mjs","sha256":"d190c83bb93a3a07853c4466783985e75f6369704fc23e80082b60b56fc1e2db","bytes":17504},{"file":"media/audio-general-worker.mjs","sha256":"15d792e9cae0b8018b0ea35bbcd8bea256909af516fefa3e941f64e2f2f06526","bytes":3392},{"file":"licenses/index.html","sha256":"d31d57ac3ca4d49f2593541cc78faca05dd97edc915ee71c952e0bae0372b829","bytes":4852},{"file":"licenses/audio-source-NOTICE.md","sha256":"501ba244da6d458d7332d04e91ecbddd4df4ec8fffb90bca4ebed2ae3a7c4da0","bytes":4212},{"file":"version.json","sha256":"f60e407e34b72be59084f504eec09d2e48ce658c3fdc63f6f397b7eb341cbbea","bytes":244},{"file":"manifest.webmanifest","sha256":"66f78647b95c14e17197452817bc91a8c28f71faa066dff65646c517c7e445e2","bytes":639},{"file":"icons/app-icon.svg","sha256":"3102cfafd120a6a3d1ed67d0611a127992a62d1174fce740dfbe35e5f4e62fd1","bytes":443},{"file":"icons/icon-192.png","sha256":"4b50c9e83cbda9fd46e4756b04f1c1df46e6bb6e52f6ebed6f88adb447d6fa99","bytes":707},{"file":"icons/icon-512.png","sha256":"c5a7c3f4533935f608904533c2a88b61e78d6960ab2d528fa029f6eaf37fda9f","bytes":2091},{"file":"icons/maskable-512.png","sha256":"02efec2b1c34f99ece7afb129ae414396f884d8e53ef2292ae2ecc318c437de7","bytes":2068},{"file":"icons/apple-touch-icon.png","sha256":"9deda4d464fe25d066d952de58c42054f5797fbbd5d0057576b405b86d4b5061","bytes":656}],"hashSource":"explicit committed Git blobs; not working tree","privateInputRead":false})
