(function installRc32AudioSeekSupplement() {
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
  if (window.__rc32AudioSeekSupplement) fail('SUPPLEMENT_ALREADY_INSTALLED');
  const holder = window.__resumeReplayTarget30 || window.__rc32PrivateTarget;
  const rawTarget = holder?.metadata || holder?.target || holder?.file || holder;
  const target = rawTarget && { ...rawTarget, parents: rawTarget.parents ? [...rawTarget.parents] : undefined };
  if (!target?.id || !target.name || !(Number(target.size) > 0)) fail('PRIVATE_TARGET_REQUIRED');
  const controller = navigator.serviceWorker.controller;
  const account = holder?.account || { accountId: holder?.accountId || state.accountId,
    authAccountKey: holder?.authAccountKey || state.authAccountKey };
  const authGeneration = state.authGeneration, driveGeneration = state.driveSessionGeneration;
  const stableKeys = ['id', 'name', 'size', 'mimeType', 'modifiedTime'];
  const freshKeys = ['version', 'headRevisionId', 'sha256Checksum', 'md5Checksum'];
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
    && !!active() && isCurrentMediaEvent(active()) && !q1Playback?.controller?.signal?.aborted
    && !['failed', 'cancelled'].includes(stats()?.phase) && !stats()?.disposed;
  if (!pinned() || !accountSame() || document.visibilityState !== 'visible') fail('SUPPLEMENT_PREFLIGHT');
  let disposed = false, audio = null, seek = null, stream = null, context = null, source = null, splitter = null;
  let analysers = [], audioPrivate = null, seekPrivate = null, callbackId = null, frameVideo = null;
  let audioTimer = null, seekTimer = null, audioDeadline = null, totalTimer = null, cleanupPromise = null;
  let audioUsed = false, seekUsed = false;
  let resolveResume = null;
  const cleanup = { tracksStopped: true, nodesDisconnected: true, contextClosed: true, frameCancelled: true, timersCleared: false };
  const startedAt = Date.now();
  const normal = v => !!v && !v.paused && !v.ended && !v.seeking && !v.muted
    && Number.isFinite(v.volume) && v.volume > 0 && v.readyState >= 2 && !v.error;
  const metadata = () => {
    const rows = window.__rc32TsReplay?.read()?.metadataResults || [];
    return ['before', 'after'].map(label => {
      const row = rows.find(r => r.label === label);
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
    return { schema: 'drive-original.rc32-audio-seek-supplement/1', sourceCommit: binding.sourceCommit,
      version: binding.version, disposed, elapsedMs: Date.now() - startedAt, audio, seek10: seek,
      metadata: meta, qualified: audio?.passed === true && seek?.passed === true
        && meta.every(r => r.qualified) && pinned() && accountSame()
        && Object.values(cleanup).every(value => value === true), cleanup: { ...cleanup },
      observerOnly: true, rawIdentifiersExported: false, rawPcmExported: false,
      scope: 'Native media-element rendered PCM and presented 10% target frame; physical speaker/audibility/whole fidelity UNKNOWN' };
  }
  function clearAudioTimers() { clearInterval(audioTimer); clearTimeout(audioDeadline); audioTimer = audioDeadline = null; }
  async function releaseAudio() {
    clearAudioTimers();
    resolveResume?.(); resolveResume = null;
    cleanup.tracksStopped = true; cleanup.nodesDisconnected = true;
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
  }
  function releaseSeek() {
    clearTimeout(seekTimer); seekTimer = null;
    if (callbackId !== null) {
      try { frameVideo?.cancelVideoFrameCallback(callbackId); } catch { cleanup.frameCancelled = false; }
    }
    callbackId = null; frameVideo = null; seekPrivate = null;
  }
  async function finishAudio(code, passed = false) {
    if (!audio || audio.completed) return;
    audio.completed = true; audio.completedAt = Date.now(); audio.passed = passed; audio.result = code; audio.elapsedMs = Date.now() - audio.startedAt;
    await releaseAudio();
    if (!passed || seek?.completed) await stop();
  }
  async function stop(reason = 'OWNER_STOP') {
    if (cleanupPromise) return cleanupPromise;
    disposed = true;
    clearTimeout(totalTimer); totalTimer = null; releaseSeek(); clearAudioTimers();
    if (audio && !audio.completed) { audio.completed = true; audio.passed = false; audio.result = 'CANCELLED'; }
    if (seek && !seek.completed) { seek.completed = true; seek.passed = false; seek.result = 'CANCELLED'; }
    cleanupPromise = releaseAudio().then(() => { cleanup.timersCleared = true; return { ...read(), reason: ['OWNER_STOP', 'TOTAL_BOUND'].includes(reason) ? reason : 'OWNER_STOP' }; });
    return cleanupPromise;
  }
  function armSeek10() {
    if (disposed || seekUsed || audioPrivate || !baseFence()) fail('SEEK_ADMISSION');
    const v = active(), s = stats();
    const duration = s?.duration || v.duration;
    if (!(Number.isFinite(duration) && duration > 0) || !v.requestVideoFrameCallback) fail('SEEK_UNSUPPORTED');
    seekUsed = true;
    seek = { targetSeconds: duration * .1, toleranceSeconds: .75, startedAt: Date.now(), completed: false,
      passed: false, framesObserved: 0, firstTargetFrame: null, deadlineMs: 45000 };
    seekPrivate = { video: v, owner: owner(), session: state.mediaSession, sourceGeneration: mediaSourceGeneration,
      generation: s?.generation, seekGeneration: mediaSeekGeneration, q1: !!q1Playback };
    frameVideo = v;
    const callback = (_, frame) => {
      callbackId = null;
      if (disposed || !seekPrivate || seek.completed) return;
      seek.framesObserved++;
      const seekDelta = mediaSeekGeneration - seekPrivate.seekGeneration;
      const sourceDelta = mediaSourceGeneration - seekPrivate.sourceGeneration;
      // Q1 starting retires exactly one SW source generation for the one normal seek.
      const expectedTransition = (seekDelta === 0 || seekDelta === 1)
        && (seekPrivate.q1 ? (sourceDelta === 0 || (sourceDelta === 1 && seekDelta === 1)) : sourceDelta === 0)
        && (!seekPrivate.q1 || owner()?.swGeneration === mediaSourceGeneration);
      if (!baseFence() || active() !== v || state.mediaSession !== seekPrivate.session
          || owner() !== seekPrivate.owner || !expectedTransition) {
        seek.completed = true; seek.result = 'OWNER_FENCE'; releaseSeek(); void stop(); return;
      }
      const current = stats(), mapping = current?.mapping;
      const shift = Number.isFinite(mapping?.commonShift) && Number.isFinite(mapping?.sourceOrigin)
        ? mapping.commonShift - mapping.sourceOrigin : 0;
      const sourceTime = frame.mediaTime + shift;
      const advanced = seekDelta === 1 && (!seekPrivate.q1
        || (sourceDelta === 1 && current?.generation !== seekPrivate.generation));
      const settled = mediaSeekSettledGeneration >= mediaSeekGeneration && !mediaSeekWatchdog && !v.seeking;
      if (advanced && settled && Number.isFinite(sourceTime) && Math.abs(sourceTime - seek.targetSeconds) <= .75
          && frame.width > 0 && frame.height > 0 && !v.error && !current?.disposed) {
        seek.firstTargetFrame = { elapsedMs: Date.now() - seek.startedAt, sourceTime, nativeMediaTime: frame.mediaTime,
          sourceClockShift: shift, generationAdvanced: true, seekSettled: true, width: frame.width, height: frame.height };
        seek.completed = true; seek.completedAt = Date.now(); seek.passed = true; seek.result = 'TARGET_FRAME'; releaseSeek(); return;
      }
      if (seek.framesObserved >= 1800) { seek.completed = true; seek.result = 'FRAME_BOUND'; releaseSeek(); void stop(); return; }
      callbackId = v.requestVideoFrameCallback(callback);
    };
    callbackId = v.requestVideoFrameCallback(callback);
    seekTimer = setTimeout(() => { seek.completed = true; seek.result = 'SEEK_DEADLINE'; releaseSeek(); void stop(); }, 45000);
    return { armed: true, targetSeconds: seek.targetSeconds, toleranceSeconds: .75 };
  }
  async function startAudio() {
    if (disposed || audioUsed || (seek && !seek.completed) || !baseFence() || !normal(active())) fail('AUDIO_ADMISSION');
    const v = active(), AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (typeof v.captureStream !== 'function' || !AudioCtor) fail('CAPTURE_UNSUPPORTED');
    audioUsed = true;
    audio = { startedAt: Date.now(), completed: false, passed: false, polls: 0, nonzeroWindows: 0,
      maxRmsByChannel: Array(8).fill(0), maxPeakByChannel: Array(8).fill(0), nativeTimeAdvanced: false,
      sampleTimeAdvanced: false, maxMs: 8000, maxPolls: 80, samplesPerPoll: 2048,
      nativeInitiallyUnmuted: true, nativeInitialVolume: v.volume, nativeInitiallyPlaying: true };
    audioPrivate = { video: v, owner: owner(), session: state.mediaSession, sourceGeneration: mediaSourceGeneration,
      generation: stats()?.generation, seekGeneration: mediaSeekGeneration, nativeTime: v.currentTime, sampleTime: null, volume: v.volume };
    audioDeadline = setTimeout(() => { void finishAudio('AUDIO_DEADLINE'); }, 8000);
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
      audioPrivate.sampleTime = c.currentTime;
      const samples = new Float32Array(256);
      audioTimer = setInterval(() => {
        const p = audioPrivate;
        if (!p || audio.completed || disposed) return;
        const tracks = stream?.getAudioTracks?.() || [];
        if (!baseFence() || active() !== v || owner() !== p.owner || state.mediaSession !== p.session
            || mediaSourceGeneration !== p.sourceGeneration || stats()?.generation !== p.generation
            || mediaSeekGeneration !== p.seekGeneration || !normal(v) || v.volume !== p.volume
            || context?.state !== 'running') { void finishAudio('OUTPUT_OWNER_FENCE'); return; }
        if (tracks.length !== 1 || !tracks.every(t => t.readyState === 'live' && t.enabled && !t.muted)) {
          void finishAudio('CAPTURE_TRACK_FENCE'); return;
        }
        audio.polls++;
        if (!Number.isFinite(context.currentTime) || !Number.isFinite(v.currentTime)) { void finishAudio('CLOCK_INVALID'); return; }
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
        if (audio.nonzeroWindows >= 3 && audio.sampleTimeAdvanced && audio.nativeTimeAdvanced) {
          void finishAudio('NATIVE_RENDERED_PCM', true); return;
        }
        if (audio.polls >= 80) void finishAudio('POLL_BOUND');
      }, 100);
    } catch { await finishAudio('CAPTURE_FAILURE'); }
    return read();
  }
  totalTimer = setTimeout(() => { void stop('TOTAL_BOUND'); }, 90000);
  window.__rc32AudioSeekSupplement = Object.freeze({ armSeek10, startAudio, read, stop });
  return { installed: true, sourceCommit: binding.sourceCommit, version: binding.version, observerOnly: true,
    metadataOwner: '__rc32TsReplay.metadata(before/after)', maxTotalMs: 90000, audioMaxMs: 8000, seekMaxMs: 45000 };
})()
