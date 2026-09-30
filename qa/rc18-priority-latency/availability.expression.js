(() => {
  const trace = mediaDiagnosticTrace;
  const s = q1Playback?.player?.stats?.();
  const phase = ['opening','buffering','ready','ended','failed','cancelled'].includes(s?.phase) ? s.phase : null;
  return {sinkAvailable:typeof globalThis.__driveOriginalMediaTraceSink === 'function',
    traceAvailable:Boolean(trace),traceCurrent:Boolean(trace && trace.mediaSession === state.mediaSession),
    retiredTraceCount:mediaDiagnosticRetiredTraces.size,traceStoresEvents:false,
    tsOwner:Boolean(q1Playback?.kind === 'ts'),nativeOwnerCurrent:isCurrentMediaEvent(el.videoPlayer),
    phase,appends:Number.isFinite(s?.appends) ? s.appends : null,
    frames:Number.isFinite(s?.frames) ? s.frames : null,paused:el.videoPlayer.paused};
})()
