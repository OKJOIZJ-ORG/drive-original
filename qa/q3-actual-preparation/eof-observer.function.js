(function installQ3SustainedEof33(binding, ownershipRead) {
  'use strict';
  if (window.__q3ActualEof33 || typeof ownershipRead !== 'function' || binding.version !== '1.22.0-rc.33'
      || binding.sourceCommit !== '5174485b3c17d047259701bbdd889f9b0740f555' || binding.fixture.duration !== 180 || binding.fixture.fps !== 30) throw Error('EOF_ADMISSION');
  const startedAt = Date.now(), startedMonotonicMs = performance.now(), duration = 180, fps = 30;
  const number = value => Number.isFinite(value) ? value : null;
  const boundedNumbers = (object, keys) => Object.fromEntries(keys.map(key => [key, number(object?.[key])]));
  let disposed = false, timer = null, video = null, callback = null, owner = null, ownerStats = null;
  let generation = null, sourceGeneration = null, session = null, firstFrame = null, lastFrame = null, nativeEnded = null;
  let frameCount = 0, qualifiedFrameCount = 0, finalWindowFrames = 0, lastSource = null, lastWall = null, lastCheckpoint = -Infinity;
  let fenceFailure = false, clockFailure = false, dimensionsFailure = false, rateFailure = false, pauseFailure = false;
  let ownerChanged = false, maxFrameGapMs = 0, maxCfrGridError = 0;
  let loopFailure = false, firstQuality = null, lastQuality = null, qualityCounterReset = false;
  const firstFrames = [], checkpoints = [], tailFrames = [], samples = [], events = [];
  const eventNames = ['playing', 'pause', 'seeking', 'seeked', 'ratechange', 'waiting', 'stalled', 'ended', 'error'];
  function quality(v) {
    let q; try { q = v?.getVideoPlaybackQuality?.(); } catch {}
    return { available: Number.isFinite(q?.totalVideoFrames) && Number.isFinite(q?.droppedVideoFrames),
      totalVideoFrames: number(q?.totalVideoFrames), droppedVideoFrames: number(q?.droppedVideoFrames), corruptedVideoFrames: number(q?.corruptedVideoFrames) };
  }
  function captureQuality(v) { const q = quality(v); if (q.available) { firstQuality ||= q; if (lastQuality && (q.totalVideoFrames < lastQuality.totalVideoFrames || q.droppedVideoFrames < lastQuality.droppedVideoFrames || Number.isFinite(q.corruptedVideoFrames) && Number.isFinite(lastQuality.corruptedVideoFrames) && q.corruptedVideoFrames < lastQuality.corruptedVideoFrames)) qualityCounterReset = true; lastQuality = q; } return q; }
  function progress(c) {
    let bufferedEnd = null; try { const b = c.v?.buffered; if (b?.length) bufferedEnd = number(b.end(b.length - 1)); } catch {}
    return { phase: ['opening', 'buffering', 'ready', 'buffered-to-end', 'failed', 'cancelled'].includes(c.s?.phase) ? c.s.phase : null,
      ...boundedNumbers(c.s, ['appends', 'removals', 'waits', 'peakAhead', 'peakRetainedAppendBytes']),
      nativeBufferedEnd: bufferedEnd, pipelineTerminalAvailable: !!c.s?.pipeline, workerTerminalAvailable: !!c.s?.worker,
      decodedDuringProcessing: 'UNKNOWN', encodedDuringProcessing: 'UNKNOWN' };
  }
  function current() {
    const f = ownershipRead(), v = getActiveMediaElement(), s = q1Playback?.player?.stats?.(), m = s?.mapping;
    const q3 = q1Playback?.kind === 'general' && s?.status?.level === 'Q3' && s.status.video === 'lossy-transformed' && s.status.bitPerfectVideo === false && s.status.audio === 'absent';
    const nativeCurrent = !!v && isCurrentMediaEvent(v), latchedSame = !owner || q1Playback === owner && s === ownerStats && s?.generation === generation && mediaSourceGeneration === sourceGeneration && state.mediaSession === session;
    const clockMapping = !!m && Math.abs(m.sourceOrigin) < .000001 && Math.abs(m.commonShift) < .000001 && Math.abs(m.sourceEnd - duration) < .000001;
    const rail = el.streamModeLabel, text = el.streamModeText, shown = node => { const r = node?.getBoundingClientRect(), style = node && getComputedStyle(node); return !!node && !node.hidden && !!r && r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const label = state.mediaPlaybackMode === PLAYBACK_MODE.VIDEO_COMPATIBILITY && state.mediaTransportVerified === true && rail?.dataset.mode === 'range' && text?.parentElement === rail && shown(rail) && shown(text) && text.textContent?.trim() === '호환 변환 · 영상 손실 압축';
    const qualified = f.mayClose && q3 && nativeCurrent && latchedSame && clockMapping && label && v?.loop === false && v.readyState >= 2 && v.videoWidth === 640 && v.videoHeight === 360 && Math.abs(v.duration - duration) < .000001 && !q1Playback?.controller?.signal?.aborted && !s?.disposed && !['failed', 'cancelled'].includes(s?.phase);
    return { f, v, s, qualified: !!qualified, q3: !!q3, nativeCurrent, latchedSame, clockMapping, label: !!label };
  }
  function latch(c) { if (!owner && c.qualified) { owner = q1Playback; ownerStats = c.s; generation = c.s.generation; sourceGeneration = mediaSourceGeneration; session = state.mediaSession; captureQuality(c.v); } }
  function terminal(c = current()) {
    const s = c.s, result = s?.pipeline, metrics = result?.metrics, worker = s?.worker;
    const admittedSourceProgramComplete = s?.phase === 'buffered-to-end' && result?.generation === generation && result.targetTime === 0 && result.duration === duration && result.sourceCodec === 'mp4v.20.1'
      && result.status?.level === 'Q3' && result.status.video === 'lossy-transformed' && result.status.audio === 'absent'
      && metrics?.decoded === 5400 && metrics?.encoded === 5400 && metrics.closed === true && metrics.outputBytes > 0 && result.cleanup?.settled === true;
    const workerComplete = worker?.terminated === true && worker.activeReads === 0 && worker.pendingChunks === 0 && worker.pendingWindows === 0 && worker.invalidMessages === 0 && worker.chunks > 0 && worker.acks === worker.chunks;
    return { admittedSourceProgramComplete: !!admittedSourceProgramComplete, workerComplete: !!workerComplete,
      playerBufferedToEnd: s?.phase === 'buffered-to-end', sourceCleanupSettled: result?.cleanup?.settled === true,
      literalSourceByteOffsetAtFileSize: 'UNKNOWN', sourceCompletionScope: 'Complete admitted 180s/5400-packet source program and settled source cleanup; byte-offset/file-size is not publicly exposed',
      mapping: boundedNumbers(s?.mapping, ['sourceOrigin', 'sourceEnd', 'commonShift', 'targetSource', 'targetElement']),
      worker: { ...boundedNumbers(worker, ['reads', 'bytes', 'activeReads', 'peakReads', 'chunks', 'acks', 'pendingChunks', 'peakPendingChunks', 'pendingWindows', 'invalidMessages', 'detachedReadBuffers']), terminated: worker?.terminated === true },
      q3Metrics: { ...boundedNumbers(metrics, ['decoded', 'encoded', 'peakHeapBytes', 'peakEncoderQueue', 'peakMuxBytes', 'peakMuxSamples', 'outputBytes', 'peakPendingAcks']), closed: metrics?.closed === true },
      reads: boundedNumbers(result?.reads, ['requests', 'bytes', 'logicalReads', 'cacheHits', 'peakCache', 'inFlight', 'peakInFlight', 'peakQueued', 'discoveryBytes', 'discoveryRequests']),
      playerRetention: boundedNumbers(s, ['peakAhead', 'peakRetainedAppendBytes', 'removals', 'waits', 'appends']) };
  }
  function event(e) {
    if (disposed) return;
    const c = current(), now = performance.now(); latch(c);
    if (!owner) return;
    if (!c.latchedSame || !c.f.sourceSame || !c.f.accountSame || !c.f.targetSame || !c.f.visible) fenceFailure = true;
    const sourceTime = c.clockMapping ? c.v.currentTime + c.s.mapping.commonShift : null;
    if (events.length < 64) events.push({ type: e.type, trusted: e.isTrusted === true, elapsedMs: now - startedMonotonicMs, sourceTime: number(sourceTime), currentOwner: c.qualified });
    if (e.type === 'ratechange' && c.v?.playbackRate !== 1) rateFailure = true;
    if (e.type === 'seeking' || e.type === 'seeked') clockFailure = true;
    if (e.type === 'pause' && sourceTime !== null && sourceTime < duration - 1 / fps - .000001) pauseFailure = true;
    if (e.type === 'ended' && e.isTrusted === true && e.target === video && c.qualified && c.v.ended === true && Math.abs(sourceTime - duration) <= .05 && c.v.playbackRate === 1) nativeEnded = {
      elapsedMs: now - startedMonotonicMs, at: Date.now(), sourceTime, nativeTime: c.v.currentTime, duration: c.v.duration, trusted: true, currentOwner: true, terminal: terminal(c) };
  }
  function detach() {
    if (video) { if (callback !== null) video.cancelVideoFrameCallback?.(callback); for (const name of eventNames) video.removeEventListener(name, event); }
    callback = null; video = null;
  }
  function attach() {
    const active = getActiveMediaElement(); if (video === active) return;
    if (owner && video && active !== video) ownerChanged = true;
    detach(); if (!active?.requestVideoFrameCallback) return; video = active;
    for (const name of eventNames) video.addEventListener(name, event);
    const onFrame = (_, metadata) => {
      callback = null; if (disposed || video !== active) return;
      const c = current(), wall = performance.now(); latch(c);
      if (owner) {
        frameCount++;
        if (!c.latchedSame) ownerChanged = true;
        if (!c.f.sourceSame || !c.f.accountSame || !c.f.targetSame || !c.f.visible || !c.latchedSame) fenceFailure = true;
        if (active.playbackRate !== 1) rateFailure = true;
        if (active.loop !== false) loopFailure = true;
        if (metadata.width !== 640 || metadata.height !== 360) dimensionsFailure = true;
        const sourceTime = metadata.mediaTime + (c.s?.mapping?.commonShift || 0), grid = Math.abs(sourceTime * fps - Math.round(sourceTime * fps));
        maxCfrGridError = Math.max(maxCfrGridError, grid);
        if (lastSource !== null && (sourceTime < lastSource - .000001 || sourceTime - lastSource > (wall - lastWall) / 1000 + .25)) clockFailure = true;
        if (lastWall !== null) maxFrameGapMs = Math.max(maxFrameGapMs, wall - lastWall);
        lastSource = sourceTime; lastWall = wall;
        if (c.qualified && metadata.width === 640 && metadata.height === 360 && grid < .0001 && active.playbackRate === 1) {
          qualifiedFrameCount++;
          const frame = { elapsedMs: wall - startedMonotonicMs, at: Date.now(), sourceTime, mediaTime: metadata.mediaTime, width: metadata.width, height: metadata.height,
            presentedFrames: number(metadata.presentedFrames), sourceCfrGridError: grid, generation, sourceGeneration, currentOwner: true, labelVisible: true };
          if (!firstFrame) { firstFrame = frame; if (sourceTime > 1 / fps + .000001 || sourceTime < -.000001 || generation !== 1) clockFailure = true; }
          lastFrame = frame;
          if (firstFrames.length < 8) firstFrames.push(frame);
          if (sourceTime - lastCheckpoint >= 3 && checkpoints.length < 64) { checkpoints.push(frame); lastCheckpoint = sourceTime; }
          if (sourceTime >= duration - 5) { finalWindowFrames++; tailFrames.push(frame); if (tailFrames.length > 128) tailFrames.shift(); }
        }
      }
      callback = active.requestVideoFrameCallback(onFrame);
    };
    callback = active.requestVideoFrameCallback(onFrame);
  }
  function tick() {
    if (disposed) return; attach(); const c = current();
    if (owner && (!c.latchedSame || !c.f.sourceSame || !c.f.accountSame || !c.f.targetSame || !c.f.visible)) fenceFailure = true;
    if (owner && c.v?.playbackRate !== 1) rateFailure = true;
    if (owner && c.v?.loop !== false) loopFailure = true;
    if (samples.length < 300) samples.push({ elapsedMs: performance.now() - startedMonotonicMs, at: Date.now(), sourceSame: c.f.sourceSame, accountSame: c.f.accountSame, targetSame: c.f.targetSame, visible: c.f.visible,
      currentOwner: !!owner && c.qualified, labelVisible: c.label, progress: progress(c),
      nativeTime: number(c.v?.currentTime), nativeDuration: number(c.v?.duration), paused: c.v?.paused === true, ended: c.v?.ended === true, nativeLoop: c.v?.loop === true, playbackRate: number(c.v?.playbackRate), ready: number(c.v?.readyState), nativeQuality: owner ? captureQuality(c.v) : quality(c.v) });
    if (Date.now() - startedAt >= 300000) stop();
  }
  function read() {
    const c = current(), end = terminal(c), wallSpanMs = firstFrame && lastFrame ? lastFrame.elapsedMs - firstFrame.elapsedMs : null;
    const sourceSpanMs = firstFrame && lastFrame ? (lastFrame.sourceTime - firstFrame.sourceTime) * 1000 : null;
    const realTime1x = wallSpanMs !== null && sourceSpanMs !== null && sourceSpanMs >= 179900 && wallSpanMs >= sourceSpanMs - 250 && !rateFailure && !clockFailure;
    const observedFinalFrame = !!lastFrame && lastFrame.sourceTime >= duration - 1 / fps - .000001 && lastFrame.sourceTime < duration + .000001;
    const currentNativeEnd = !!nativeEnded && c.qualified && c.v?.ended === true && Math.abs(c.v.currentTime - duration) <= .05;
    const qualified = !disposed && currentNativeEnd && end.admittedSourceProgramComplete && end.workerComplete && realTime1x && observedFinalFrame && finalWindowFrames >= 2
      && !fenceFailure && !ownerChanged && !dimensionsFailure && !pauseFailure && !loopFailure && maxCfrGridError < .0001;
    const currentQuality = owner ? captureQuality(c.v) : quality(c.v);
    return { schema: 'drive-original.q3-sustained-eof-observation/1', sourceCommit: binding.sourceCommit, version: binding.version, recordedAt: new Date().toISOString(), startedAt: new Date(startedAt).toISOString(),
      elapsedMs: performance.now() - startedMonotonicMs, disposed, qualified: !!qualified, duration, fps, sourceCompletion: end, progress: progress(c),
      firstFrame, lastFrame, firstFrames, checkpoints, tailFrames, frameCount, qualifiedFrameCount, finalWindowFrames, nativeEnded,
      wallSpanMs, sourceSpanMs, realTime1x, observedFinalFrame, maxFrameGapMs, maxCfrGridError,
      failures: { fenceFailure, ownerChanged, clockFailure, dimensionsFailure, rateFailure, pauseFailure, loopFailure }, samples, events,
      nativeQuality: { first: firstQuality, last: lastQuality, current: currentQuality, counterReset: qualityCounterReset,
        deltaTotalVideoFrames: firstQuality && lastQuality && !qualityCounterReset ? lastQuality.totalVideoFrames - firstQuality.totalVideoFrames : null,
        deltaDroppedVideoFrames: firstQuality && lastQuality && !qualityCounterReset ? lastQuality.droppedVideoFrames - firstQuality.droppedVideoFrames : null,
        deltaCorruptedVideoFrames: Number.isFinite(firstQuality?.corruptedVideoFrames) && Number.isFinite(lastQuality?.corruptedVideoFrames) && !qualityCounterReset ? lastQuality.corruptedVideoFrames - firstQuality.corruptedVideoFrames : null,
        scope: 'Native element counters from latched current-owner baseline; unavailable/reset counters are UNKNOWN and no quality pass threshold is inferred' },
      rawIdentifiersExported: false, observerOnly: true, fullOutputQuality: 'NOT_QUALIFIED', nativeRetainedHeap: 'UNKNOWN', gpuEncoderPeak: 'UNKNOWN',
      limitations: ['RVFC samples and terminal encoded/decoded counts do not prove every output sample/display refresh or180s perceptual quality', 'maxFrameGap includes stalls; no performance pass threshold adopted', 'Literal source byte-offset/file-size is UNKNOWN', 'Private account/fixture identifiers remain in local closures only', 'External resource watcher has separate named-main-Chrome PSS/battery/thermal scope'] };
  }
  function stop() { if (!disposed) { disposed = true; clearInterval(timer); timer = null; detach(); } return { disposed: true, removed: true, intervalRemoved: timer === null, rvfcRemoved: callback === null, nativeListenersRemoved: true }; }
  window.__q3ActualEof33 = Object.freeze({ read, stop }); timer = setInterval(tick, 1000); tick();
  return { installed: true, boundedMs: 300000, retainedFirstFrames: 8, retainedCheckpoints: 64, retainedTailFrames: 128, sampleLimit: 300, eventLimit: 64, observerOnly: true, rawIdentifiersExported: false };
})
