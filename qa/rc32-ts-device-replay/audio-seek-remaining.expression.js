(function installRc32AudioSeekRemaining() {
  'use strict';
  const binding = {
    version: '1.22.0-rc.32', sourceCommit: '1d79897fd32c569137cab079bfd93107be2ee33f',
    sourceSHA256: {
      'app.js': '7a84c2f52a6ba15300a533eea7f5b49f6653fe540486f5907d30214e65327497',
      'sw.js': '8f27c0aa6710b78353b87911702a7e4c6e66535c404d5a66869992fc861b242b',
      'version.json': 'f60e407e34b72be59084f504eec09d2e48ce658c3fdc63f6f397b7eb341cbbea',
      'media/drive-source.mjs': 'cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a',
      'media/ts-player.mjs': '1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705'
    }
  };
  const fail = code => { throw Error(code); };
  if (window.__rc32AudioSeekRemaining) fail('SUPPLEMENT_ALREADY_INSTALLED');
  const holder = window.__resumeReplayTarget30 || window.__rc32PrivateTarget;
  const rawTarget = holder?.metadata || holder?.target || holder?.file || holder;
  const target = rawTarget && { ...rawTarget, parents: rawTarget.parents ? [...rawTarget.parents] : undefined };
  if (!target?.id || !target.name || !Number.isSafeInteger(Number(target.size)) || !(Number(target.size) > 0)) fail('PRIVATE_TARGET_REQUIRED');
  const controller = navigator.serviceWorker.controller;
  const account = { ...(holder?.account || { accountId: holder?.accountId || state.accountId,
    authAccountKey: holder?.authAccountKey || state.authAccountKey }) };
  const authGeneration = state.authGeneration, driveGeneration = state.driveSessionGeneration;
  const stableKeys = ['id', 'name', 'size', 'mimeType', 'modifiedTime'];
  const freshKeys = ['version', 'headRevisionId', 'sha256Checksum', 'md5Checksum'];
  if (!freshKeys.slice(0, 2).some(k => typeof target[k] === 'string' && target[k])
      || !(/^[a-f0-9]{64}$/i.test(target.sha256Checksum || '')
        || /^[a-f0-9]{32}$/i.test(target.md5Checksum || ''))) fail('STRONG_TARGET_REQUIRED');
  const metadataOwner = window.__rc32TsReplay;
  if (!metadataOwner?.read || !metadataOwner?.metadata) fail('METADATA_OWNER_REQUIRED');
  const pinned = () => {
    const proof = window.__resumeSwProof?.get();
    return !!proof && APP_VERSION === binding.version && proof.version === binding.version
      && proof.sourceCommit === binding.sourceCommit && proof.controller === controller
      && navigator.serviceWorker.controller === controller && controller?.state === 'activated'
      && Object.keys(binding.sourceSHA256).every(k => proof.sourceSHA256?.[k] === binding.sourceSHA256[k]);
  };
  const accountSame = () => !!account.authAccountKey && state.accountId === account.accountId
    && state.authAccountKey === account.authAccountKey && state.authGeneration === authGeneration
    && state.driveSessionGeneration === driveGeneration && state.authStatus === 'online';
  const targetSame = () => {
    const selected = state.selected;
    return !!selected && stableKeys.every(k => target[k] == null || String(target[k]) === String(selected[k]))
      && (!target.parents || (Array.isArray(selected.parents)
        && JSON.stringify([...target.parents].sort()) === JSON.stringify([...selected.parents].sort())))
      && freshKeys.every(k => target[k] == null || selected[k] == null || String(target[k]) === String(selected[k]));
  };
  const owner = () => q1Playback || q0Playback;
  const stats = () => q1Playback?.player?.stats?.();
  const active = () => getActiveMediaElement();
  const baseFence = () => pinned() && accountSame() && targetSame() && document.visibilityState === 'visible'
    && !!q1Playback && q1Playback.kind === 'ts' && !!active() && isCurrentMediaEvent(active()) && !q1Playback?.controller?.signal?.aborted
    && !['failed', 'cancelled'].includes(stats()?.phase) && !stats()?.disposed;
  if (!pinned() || !accountSame() || document.visibilityState !== 'visible') fail('SUPPLEMENT_PREFLIGHT');
  let disposed = false, audio = null, seek = null, stream = null, context = null, source = null, splitter = null;
  let analysers = [], audioPrivate = null, seekPrivate = null, callbackId = null, frameVideo = null;
  let audioTimer = null, seekTimer = null, seekPoll = null, provisional = null, audioDeadline = null, totalTimer = null, cleanupPromise = null;
  let audioUsed = false, seekUsed = false;
  let resolveResume = null, completedSeekPrivate = null, audioReleasePromise = null, postSeekAdmission = null;
  const cleanup = { tracksStopped: true, nodesDisconnected: true, contextClosed: true, frameCancelled: true, timersCleared: false, listenersRemoved: false };
  const startedAt = Date.now();
  const normal = v => !!v && !v.paused && !v.ended && !v.seeking && !v.muted
    && Number.isFinite(v.volume) && v.volume > 0 && v.playbackRate === 1 && v.readyState >= 2 && !v.error;
  const metadata = () => {
    const rows = window.__rc32TsReplay === metadataOwner ? metadataOwner.read()?.metadataResults || [] : [];
    return ['before', 'after'].map(label => {
      const matching = rows.filter(r => r.label === label);
      const row = matching.length === 1 ? matching[0] : null;
      const completedAt = Math.max(audio?.completedAt || startedAt, seek?.completedAt || startedAt);
      const bracketed = Number.isFinite(row?.at) && row.at <= Date.now() && (label === 'before'
        ? row.at <= startedAt && startedAt - row.at <= 60000 : row.at >= completedAt);
      return { label, timeBracketed: bracketed, qualified: !!row && bracketed && row.sameExactTarget === true && row.stableMetadataSame === true
        && row.freshRevisionChecksumSame === true && row.accountSame === true && row.sourceSame === true
        && row.notTrashed === true && row.canDownload === true && row.status === 200 };
    });
  };
  function read() {
    const meta = metadata();
    return { schema: 'drive-original.rc32-audio-seek-remaining/1', sourceCommit: binding.sourceCommit,
      version: binding.version, disposed, elapsedMs: Date.now() - startedAt, audio, seek, postSeekAdmission,
      metadata: meta, qualified: audio?.passed === true && seek?.passed === true
        && meta.every(r => r.qualified) && baseFence()
        && Object.values(cleanup).every(value => value === true), cleanup: { ...cleanup },
      observerOnly: true, rawIdentifiersExported: false, rawPcmExported: false,
      scope: 'One remaining 50% or 90% native seek, rendered PCM and advancing native video/audio clocks; physical speaker/audibility/whole fidelity UNKNOWN' };
  }
  if (!metadata()[0].qualified) fail('FRESH_BEFORE_REQUIRED');
  const slider = el.seekBarContainer;
  if (!slider?.addEventListener || !slider?.removeEventListener) fail('NATIVE_CONTROL_REQUIRED');
  function observeSeekInput(event) {
    if (disposed || !seekPrivate || seek?.completed || !event.isTrusted || event.button !== 0) return;
    const box = slider.getBoundingClientRect();
    const inputSeconds = (event.clientX - box.left) / box.width * seekPrivate.duration;
    if (baseFence() && box.width > 0 && Number.isFinite(inputSeconds)
        && Math.abs(inputSeconds - seek.targetSeconds) <= seek.toleranceSeconds) {
      seek.nativeInputObserved = true;
      seek.nativeInputAtMs = Date.now() - seek.startedAt;
    }
  }
  slider.addEventListener('pointerdown', observeSeekInput, true);
  function clearAudioTimers() { clearInterval(audioTimer); clearTimeout(audioDeadline); audioTimer = audioDeadline = null; }
  function releaseAudio() {
    if (audioReleasePromise) return audioReleasePromise;
    audioReleasePromise = (async () => {
    clearAudioTimers();
    resolveResume?.(); resolveResume = null;
    if (stream) cleanup.tracksStopped = true;
    if (source || splitter || analysers.length) cleanup.nodesDisconnected = true;
    for (const track of stream?.getTracks?.() || []) { try { track.stop(); } catch { cleanup.tracksStopped = false; } }
    stream = null;
    for (const node of [source, splitter, ...analysers]) { try { node?.disconnect(); } catch { cleanup.nodesDisconnected = false; } }
    source = splitter = null; analysers = []; audioPrivate = null;
    const closing = context; context = null;
    if (closing) {
      let timer;
      try {
        await Promise.race([closing.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CLOSE_BOUND')), 1000); })]);
        cleanup.contextClosed = closing.state === 'closed';
      } catch { cleanup.contextClosed = false; } finally { clearTimeout(timer); }
    }
    })();
    return audioReleasePromise;
  }
  function releaseSeek() {
    clearTimeout(seekTimer); seekTimer = null;
    clearInterval(seekPoll); seekPoll = null; provisional = null;
    if (callbackId !== null) {
      try { frameVideo?.cancelVideoFrameCallback(callbackId); } catch { cleanup.frameCancelled = false; }
    }
    callbackId = null; frameVideo = null; seekPrivate = null;
  }
  async function finishAudio(code, passed = false) {
    if (!audio || audio.completed) return;
    audio.completed = true; audio.completedAt = Date.now(); audio.passed = passed; audio.result = code; audio.elapsedMs = Date.now() - audio.startedAt;
    releaseSeek(); await releaseAudio();
    if (!passed || seek?.completed) await stop();
  }
  async function stop(reason = 'OWNER_STOP') {
    if (cleanupPromise) return cleanupPromise;
    disposed = true;
    slider.removeEventListener('pointerdown', observeSeekInput, true); cleanup.listenersRemoved = true;
    completedSeekPrivate = null;
    clearTimeout(totalTimer); totalTimer = null; releaseSeek(); clearAudioTimers();
    if (audio && !audio.completed) { audio.completed = true; audio.passed = false; audio.result = 'CANCELLED'; }
    if (seek && !seek.completed) { seek.completed = true; seek.passed = false; seek.result = 'CANCELLED'; }
    cleanupPromise = releaseAudio().then(() => { cleanup.timersCleared = true; return { ...read(), reason: ['OWNER_STOP', 'TOTAL_BOUND'].includes(reason) ? reason : 'OWNER_STOP' }; });
    return cleanupPromise;
  }
  function armSeek(fraction) {
    if (fraction !== .5 && fraction !== .9) fail('SEEK_FRACTION');
    if (disposed || seekUsed || audioPrivate || !baseFence()) fail('SEEK_ADMISSION');
    const v = active(), s = stats();
    const duration = s?.duration || v.duration;
    if (!(Number.isFinite(duration) && duration > 0) || !v.requestVideoFrameCallback || !v.paused) fail('SEEK_UNSUPPORTED');
    seekUsed = true;
    seek = { fraction, label: fraction === .5 ? 'seek50' : 'seek90', nativeInputObserved: false, targetSeconds: duration * fraction, toleranceSeconds: .75, startedAt: Date.now(), completed: false,
      passed: false, framesObserved: 0, firstTargetFrame: null, lastFrame: null, lastRejection: null,
      readinessPolls: 0, deadlineMs: 45000 };
    seekPrivate = { duration, video: v, owner: owner(), session: state.mediaSession, sourceGeneration: mediaSourceGeneration,
      generation: s?.generation, seekGeneration: mediaSeekGeneration, q1: !!q1Playback };
    frameVideo = v;
    const rejectOwner = code => { seek.completed = true; seek.result = code; seek.lastRejection = code; releaseSeek(); void stop(); };
    const settlePresented = () => {
      if (!provisional || seek.completed || disposed) return false;
      const p = provisional, current = stats(), mapping = current?.mapping;
      const shift = Number.isFinite(mapping?.commonShift) && Number.isFinite(mapping?.sourceOrigin)
        ? mapping.commonShift - mapping.sourceOrigin : 0;
      if (!baseFence() || active() !== v || owner() !== p.owner || state.mediaSession !== p.session
          || mediaSourceGeneration !== p.sourceGeneration || mediaSeekGeneration !== p.seekGeneration
          || current !== p.stats || current?.generation !== p.generation || shift !== p.shift
          || (mapping?.commonShift ?? null) !== p.commonShift || (mapping?.sourceOrigin ?? null) !== p.sourceOrigin
          || (q1Playback && owner()?.swGeneration !== mediaSourceGeneration)) {
        rejectOwner('PROVISIONAL_OWNER_FENCE'); return false;
      }
      const nativeSourceTime = v.currentTime + shift;
      if (!Number.isFinite(nativeSourceTime) || Math.abs(nativeSourceTime - seek.targetSeconds) > .75) {
        seek.lastRejection = 'NATIVE_TARGET_PENDING'; return false;
      }
      const settled = seek.nativeInputObserved && mediaSeekSettledGeneration >= mediaSeekGeneration && !mediaSeekWatchdog && !v.seeking && !state.isSeeking;
      const ready = v.readyState >= 2 && !v.error && (!q1Playback || current?.phase === 'ready');
      if (!settled || !ready) { seek.lastRejection = !settled ? 'SETTLEMENT_PENDING' : 'READINESS_PENDING'; return false; }
      seek.firstTargetFrame = { ...p.frame, qualifiedAtMs: Date.now() - seek.startedAt, sourceTime: p.sourceTime,
        sourceClockShift: shift, generationAdvanced: true, seekSettled: true, readinessQualified: true,
        nativeAlignedSourceTime: nativeSourceTime, lateReadiness: Date.now() > p.at };
      seek.completed = true; seek.completedAt = Date.now(); seek.passed = true; seek.result = 'TARGET_FRAME';
      completedSeekPrivate = { ...p, video: v, nativeTime: v.currentTime };
      seek.lastRejection = null; releaseSeek(); return true;
    };
    const callback = (_, frame) => {
      callbackId = null;
      if (disposed || !seekPrivate || seek.completed) return;
      seek.framesObserved++;
      if (provisional) { settlePresented(); if (seek.completed) return; }
      const seekDelta = mediaSeekGeneration - seekPrivate.seekGeneration;
      const sourceDelta = mediaSourceGeneration - seekPrivate.sourceGeneration;
      // Q1 starting retires exactly one SW source generation for the one normal seek.
      const expectedTransition = (seekDelta === 0 || seekDelta === 1)
        && (seekPrivate.q1 ? (sourceDelta === 0 || (sourceDelta === 1 && seekDelta === 1)) : sourceDelta === 0)
        && (!seekPrivate.q1 || owner()?.swGeneration === mediaSourceGeneration);
      if (!baseFence() || active() !== v || state.mediaSession !== seekPrivate.session
          || owner() !== seekPrivate.owner || !expectedTransition) {
        rejectOwner('OWNER_FENCE'); return;
      }
      const current = stats(), mapping = current?.mapping;
      const shift = Number.isFinite(mapping?.commonShift) && Number.isFinite(mapping?.sourceOrigin)
        ? mapping.commonShift - mapping.sourceOrigin : 0;
      const sourceTime = frame.mediaTime + shift;
      const advanced = seekDelta === 1 && (!seekPrivate.q1
        || (sourceDelta === 1 && current?.generation !== seekPrivate.generation));
      const settled = mediaSeekSettledGeneration >= mediaSeekGeneration && !mediaSeekWatchdog && !v.seeking;
      const targetAligned = Number.isFinite(sourceTime) && Math.abs(sourceTime - seek.targetSeconds) <= .75;
      seek.lastFrame = { elapsedMs: Date.now() - seek.startedAt, nativeMediaTime: Number.isFinite(frame.mediaTime) ? frame.mediaTime : null,
        sourceTime: Number.isFinite(sourceTime) ? sourceTime : null, sourceClockShift: shift,
        width: frame.width, height: frame.height, targetAligned, generationAdvanced: advanced, seekSettled: settled,
        nativePaused: !!v.paused, nativeSeeking: !!v.seeking, nativeReadyState: v.readyState,
        pipelineReady: !q1Playback || current?.phase === 'ready', sourceGeneration: mediaSourceGeneration,
        seekGeneration: mediaSeekGeneration, pipelineGeneration: current?.generation ?? null };
      seek.lastRejection = !advanced ? 'GENERATION_NOT_ADVANCED' : !targetAligned ? 'WRONG_PRESENTED_TARGET'
        : !(frame.width > 0 && frame.height > 0) ? 'INVALID_DIMENSIONS' : !settled ? 'SETTLEMENT_PENDING' : 'READINESS_PENDING';
      if (advanced && targetAligned
          && frame.width > 0 && frame.height > 0 && !v.error && !current?.disposed) {
        provisional = { owner: owner(), stats: current, generation: current?.generation, session: state.mediaSession,
          sourceGeneration: mediaSourceGeneration, seekGeneration: mediaSeekGeneration, shift, sourceTime, at: Date.now(),
          commonShift: mapping?.commonShift ?? null, sourceOrigin: mapping?.sourceOrigin ?? null,
          frame: { elapsedMs: Date.now() - seek.startedAt, nativeMediaTime: frame.mediaTime, width: frame.width, height: frame.height } };
        if (settlePresented()) return;
        if (seek.completed) return;
      }
      if (seek.framesObserved >= 1800) { seek.completed = true; seek.result = 'FRAME_BOUND'; releaseSeek(); void stop(); return; }
      callbackId = v.requestVideoFrameCallback(callback);
    };
    callbackId = v.requestVideoFrameCallback(callback);
    seekPoll = setInterval(() => {
      seek.readinessPolls++;
      if (seek.readinessPolls > 450) { rejectOwner('READINESS_POLL_BOUND'); return; }
      settlePresented();
    }, 100);
    seekTimer = setTimeout(() => { seek.completed = true; seek.result = 'SEEK_DEADLINE'; releaseSeek(); void stop(); }, 45000);
    return { armed: true, targetSeconds: seek.targetSeconds, toleranceSeconds: .75 };
  }
  async function startAudio() {
    if (disposed || audioUsed || !seek?.passed || !completedSeekPrivate || !baseFence() || !normal(active())) fail('AUDIO_ADMISSION');
    if (navigator.userActivation?.isActive !== true) fail('NATIVE_USER_ACTIVATION_REQUIRED');
    const completed = completedSeekPrivate, currentStats = stats(), currentMap = currentStats?.mapping;
    // TS retains native source timestamps and has no mapping object. The seek
    // snapshot already represents absent fields as null; PCM uses the same form.
    postSeekAdmission = {
      withinSeekWindow: Date.now() - seek.completedAt <= 10000,
      nativeOwnerSame: active() === completed.video, pipelineOwnerSame: owner() === completed.owner,
      sessionSame: state.mediaSession === completed.session,
      sourceGenerationSame: mediaSourceGeneration === completed.sourceGeneration,
      seekGenerationSame: mediaSeekGeneration === completed.seekGeneration,
      pipelineStateSame: currentStats === completed.stats, pipelineGenerationSame: currentStats?.generation === completed.generation,
      swOwnerCurrent: q1Playback.swGeneration === mediaSourceGeneration,
      commonShiftSame: (currentMap?.commonShift ?? null) === completed.commonShift,
      sourceOriginSame: (currentMap?.sourceOrigin ?? null) === completed.sourceOrigin,
      seekSettled: mediaSeekSettledGeneration >= mediaSeekGeneration,
      watchdogAbsent: !mediaSeekWatchdog, stateSeekAbsent: !state.isSeeking
    };
    if (!Object.values(postSeekAdmission).every(value => value === true)) fail('POST_SEEK_OWNER_FENCE');
    const v = active(), AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (typeof v.captureStream !== 'function' || !AudioCtor) fail('CAPTURE_UNSUPPORTED');
    audioUsed = true;
    audio = { startedAt: Date.now(), completed: false, passed: false, polls: 0, nonzeroWindows: 0,
      maxRmsByChannel: Array(8).fill(0), maxPeakByChannel: Array(8).fill(0), nativeTimeAdvanced: false,
      sampleTimeAdvanced: false, videoFrames: 0, videoTimeAdvanced: false, maxNativeFrameDistanceSeconds: 0,
      maxNativeAudioClockDifferenceSeconds: 0,
      nativeUserActivationAtAdmission: true, maxMs: 8000, maxPolls: 80, samplesPerPoll: 2048,
      nativeInitiallyUnmuted: true, nativeInitialVolume: v.volume, nativeInitiallyPlaying: true };
    audioPrivate = { video: v, owner: owner(), session: state.mediaSession, sourceGeneration: mediaSourceGeneration,
      generation: stats()?.generation, stats: currentStats, commonShift: completed.commonShift, sourceOrigin: completed.sourceOrigin,
      shift: completed.shift, lastVideoTime: null, firstVideoTime: null, seekGeneration: mediaSeekGeneration, nativeTime: v.currentTime, sampleTime: null, volume: v.volume };
    audioDeadline = setTimeout(() => { void finishAudio('AUDIO_DEADLINE'); }, 8000);
    const outputFence = () => {
      const p = audioPrivate, current = stats(), mapping = current?.mapping;
      return !!p && baseFence() && active() === v && owner() === p.owner && state.mediaSession === p.session
        && mediaSourceGeneration === p.sourceGeneration && current === p.stats && current?.generation === p.generation
        && q1Playback.swGeneration === mediaSourceGeneration && mediaSeekGeneration === p.seekGeneration
        && mediaSeekSettledGeneration >= mediaSeekGeneration && !mediaSeekWatchdog && !state.isSeeking
        && current?.phase === 'ready' && (mapping?.commonShift ?? null) === p.commonShift && (mapping?.sourceOrigin ?? null) === p.sourceOrigin
        && normal(v) && v.volume === p.volume;
    };
    const audioFrame = (_, frame) => {
      callbackId = null;
      if (disposed || audio?.completed || !audioPrivate) return;
      if (!outputFence()) { void finishAudio('AV_OWNER_FENCE'); return; }
      const p = audioPrivate, time = frame.mediaTime, distance = Math.abs(time - v.currentTime);
      if (!Number.isFinite(time) || !Number.isFinite(distance) || distance > .75
          || !(frame.width > 0 && frame.height > 0) || (p.lastVideoTime !== null && time < p.lastVideoTime)) {
        void finishAudio('VIDEO_CLOCK_FENCE'); return;
      }
      p.firstVideoTime ??= time; p.lastVideoTime = time;
      audio.videoFrames++; audio.videoTimeAdvanced ||= time > p.firstVideoTime;
      audio.maxNativeFrameDistanceSeconds = Math.max(audio.maxNativeFrameDistanceSeconds, distance);
      if (audio.videoFrames >= 480) { void finishAudio('VIDEO_FRAME_BOUND'); return; }
      callbackId = v.requestVideoFrameCallback(audioFrame);
    };
    frameVideo = v; callbackId = v.requestVideoFrameCallback(audioFrame);
    try {
      stream = v.captureStream(); cleanup.tracksStopped = false;
      context = new AudioCtor(); cleanup.contextClosed = false;
      const c = context;
      source = c.createMediaStreamSource(stream); splitter = c.createChannelSplitter(8);
      source.connect(splitter); cleanup.nodesDisconnected = false;
      // Per-channel analysis avoids opposite-phase stereo being downmixed to silence.
      for (let channel = 0; channel < 8; channel++) {
        const analyser = c.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0;
        splitter.connect(analyser, channel); analysers.push(analyser);
      }
      // Deadline/cancel cleanup settles this wait even when browser resume never resolves.
      await Promise.race([c.resume(), new Promise(resolve => { resolveResume = resolve; })]);
      resolveResume = null;
      if (disposed || audio.completed || context !== c) { await releaseAudio(); return read(); }
      if (!outputFence() || c.state !== 'running') { await finishAudio('OUTPUT_OWNER_FENCE'); return read(); }
      audioPrivate.sampleTime = c.currentTime;
      audioPrivate.nativeTime = v.currentTime;
      audioPrivate.lastNativeTime = v.currentTime;
      audioPrivate.lastSampleTime = c.currentTime;
      const samples = new Float32Array(256);
      audioTimer = setInterval(() => {
        const p = audioPrivate;
        if (!p || audio.completed || disposed) return;
        const tracks = stream?.getAudioTracks?.() || [];
        if (!outputFence() || context?.state !== 'running') { void finishAudio('OUTPUT_OWNER_FENCE'); return; }
        if (tracks.length !== 1 || !tracks.every(t => t.readyState === 'live' && t.enabled && !t.muted)) {
          void finishAudio('CAPTURE_TRACK_FENCE'); return;
        }
        audio.polls++;
        if (!Number.isFinite(context.currentTime) || !Number.isFinite(v.currentTime)) { void finishAudio('CLOCK_INVALID'); return; }
        const clockDifference = Math.abs((v.currentTime - p.nativeTime) - (context.currentTime - p.sampleTime));
        if (v.currentTime < p.lastNativeTime || context.currentTime < p.lastSampleTime || clockDifference > .75) {
          void finishAudio('AUDIO_CLOCK_FENCE'); return;
        }
        p.lastNativeTime = v.currentTime; p.lastSampleTime = context.currentTime;
        audio.maxNativeAudioClockDifferenceSeconds = Math.max(audio.maxNativeAudioClockDifferenceSeconds, clockDifference);
        audio.sampleTimeAdvanced ||= context.currentTime > p.sampleTime;
        audio.nativeTimeAdvanced ||= v.currentTime > p.nativeTime;
        let nonzero = false;
        for (let channel = 0; channel < analysers.length; channel++) {
          analysers[channel].getFloatTimeDomainData(samples);
          let squares = 0, peak = 0;
          for (const value of samples) {
            if (!Number.isFinite(value)) { void finishAudio('PCM_INVALID'); return; }
            squares += value * value; peak = Math.max(peak, Math.abs(value));
          }
          const rms = Math.sqrt(squares / samples.length);
          audio.maxRmsByChannel[channel] = Math.max(audio.maxRmsByChannel[channel], rms);
          audio.maxPeakByChannel[channel] = Math.max(audio.maxPeakByChannel[channel], peak);
          nonzero ||= rms > .00001 && peak > .0001;
        }
        if (nonzero && context.currentTime > p.sampleTime && v.currentTime > p.nativeTime) audio.nonzeroWindows++;
        if (audio.nonzeroWindows >= 3 && audio.sampleTimeAdvanced && audio.nativeTimeAdvanced && audio.videoTimeAdvanced && audio.videoFrames >= 2) {
          void finishAudio('NATIVE_RENDERED_PCM', true); return;
        }
        if (audio.polls >= 80) void finishAudio('POLL_BOUND');
      }, 100);
    } catch { await finishAudio('CAPTURE_FAILURE'); }
    return read();
  }
  totalTimer = setTimeout(() => { void stop('TOTAL_BOUND'); }, 90000);
  window.__rc32AudioSeekRemaining = Object.freeze({ armSeek, armSeek50: () => armSeek(.5), armSeek90: () => armSeek(.9), startAudio, read, stop });
  return { installed: true, sourceCommit: binding.sourceCommit, version: binding.version, observerOnly: true,
    metadataOwner: '__rc32TsReplay.metadata(before/after), fresh owner per fraction', maxTotalMs: 90000, audioMaxMs: 8000, seekMaxMs: 45000 };
})()
